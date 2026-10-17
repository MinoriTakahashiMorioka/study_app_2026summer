import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { toDateKey } from '../../models/schema.js';
import {
  WEEKDAYS, parseDateKey, monthGrid, shiftMonth, formatDayHeading, eraYear, holidayName,
} from './dates.js';
import { openEventSheet } from './event-sheet.js';
import { openLabelSheet } from './label-sheet.js';

const MAX_DOTS = 3;   // スマホ幅：1マスに出す点の数
const MAX_CHIPS = 2;  // PC幅：1マスに出す予定の数

/**
 * カレンダーのメイン画面（月表示＋選んだ日の予定一覧）。
 * @param {HTMLElement} root
 * @param {{ repo: ReturnType<import('./repo.js').createCalendarRepo>, toolbar?: HTMLElement }} deps
 * @returns {() => void} 後片付け関数
 */
export function mountCalendarView(root, { repo, toolbar }) {
  const today = toDateKey();
  const todayDate = parseDateKey(today);

  const state = {
    year: todayDate.getFullYear(),
    month: todayDate.getMonth(), // 0〜11
    selected: today,
    filter: null,                // 絞り込み中のラベルID（null なら全部）
  };

  // ---------- 操作 ----------

  const openLabels = () => openLabelSheet({ repo });

  const openNew = (date = state.selected) => openEventSheet({
    repo, date, onSaved: (saved) => select(saved.date), onOpenLabels: openLabels,
  });

  const openEdit = (event) => openEventSheet({
    repo, event, onSaved: (saved) => select(saved.date), onOpenLabels: openLabels,
  });

  function select(key) {
    const date = parseDateKey(key);
    state.selected = key;
    state.year = date.getFullYear();
    state.month = date.getMonth();
    render();
  }

  function moveMonth(delta) {
    const { year, month } = shiftMonth(state.year, state.month, delta);
    const isThisMonth = year === todayDate.getFullYear() && month === todayDate.getMonth();
    // 今月に戻ったら今日、それ以外は1日を選ぶ
    select(isThisMonth ? today : toDateKey(new Date(year, month, 1)));
    grid.classList.remove('slide-next', 'slide-prev');
    void grid.offsetWidth;
    grid.classList.add(delta > 0 ? 'slide-next' : 'slide-prev');
  }

  // ---------- 部品 ----------

  toolbar?.append(
    h('button', { type: 'button', class: 'tool-btn', onClick: openLabels }, icon('tag'), 'ラベル'),
  );

  const monthTitle = h('h2', { class: 'cal-title', 'aria-live': 'polite' });
  const todayBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => select(today) }, '今日');

  const head = h('div', { class: 'cal-head' },
    monthTitle,
    h('div', { class: 'cal-nav' },
      todayBtn,
      h('button', { type: 'button', class: 'nav-btn', 'aria-label': '前の月', onClick: () => moveMonth(-1) }, icon('chevronLeft')),
      h('button', { type: 'button', class: 'nav-btn', 'aria-label': '次の月', onClick: () => moveMonth(1) }, icon('chevronRight')),
    ),
  );

  const filters = h('div', { class: 'chips', role: 'group', 'aria-label': 'ラベルで絞り込み' });

  const weekdays = h('div', { class: 'weekdays', 'aria-hidden': 'true' },
    WEEKDAYS.map((name, i) => h('span', { class: i === 0 ? 'sun' : i === 6 ? 'sat' : null }, name)),
  );

  const grid = h('div', { class: 'cal-grid' });
  const agenda = h('section', { class: 'agenda', 'aria-label': '選んだ日の予定' });

  const fab = h('button', { type: 'button', class: 'fab', onClick: () => openNew() },
    icon('plus'), '予定を追加');

  // スマホで左右にスワイプして月を移動
  let touchStart = null;
  grid.addEventListener('touchstart', (event) => {
    const t = event.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  grid.addEventListener('touchend', (event) => {
    if (!touchStart) return;
    const t = event.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 40) moveMonth(dx < 0 ? 1 : -1);
  }, { passive: true });

  // ---------- 描画 ----------

  function render() {
    const labels = repo.labels();
    const labelMap = new Map(labels.map((l) => [l.id, l]));
    if (state.filter && !labelMap.has(state.filter)) state.filter = null; // 削除されたラベル

    renderHead();
    renderFilters(labels);
    renderGrid(labelMap);
    renderAgenda(labelMap);
  }

  function renderHead() {
    monthTitle.replaceChildren(
      h('span', { class: 'cal-year' }, `${state.year}年`),
      h('span', { class: 'cal-mon' }, `${state.month + 1}月`),
      h('span', { class: 'cal-era' }, eraYear(state.year)),
    );
    todayBtn.disabled = state.selected === today;
  }

  function renderFilters(labels) {
    const options = [{ id: null, name: 'すべて', color: null }, ...labels];
    filters.replaceChildren(...options.map((label) => h('button', {
      type: 'button',
      class: 'chip',
      style: label.color ? { '--label': label.color } : null,
      'aria-pressed': String(state.filter === label.id),
      onClick: () => { state.filter = label.id; render(); },
    }, label.color && h('i', { class: 'swatch', 'aria-hidden': 'true' }), label.name)));
  }

  function renderGrid(labelMap) {
    const byDate = repo.eventsByDate(state.filter);
    const colorOf = (event) => labelMap.get(event.labelId)?.color ?? 'var(--ink-2)';

    const cells = monthGrid(state.year, state.month).flat().map((cell) => {
      const events = byDate.get(cell.key) ?? [];
      const holiday = holidayName(cell.key);
      const dow = cell.date.getDay();
      const isSelected = cell.key === state.selected;

      const classes = [
        'day',
        !cell.inMonth && 'is-out',
        cell.key === today && 'is-today',
        isSelected && 'is-selected',
        (dow === 0 || holiday) && 'is-sun',
        dow === 6 && !holiday && 'is-sat',
      ].filter(Boolean).join(' ');

      const description = [
        formatDayHeading(cell.key),
        holiday,
        cell.key === today && '今日',
        events.length > 0 ? `予定${events.length}件` : '予定なし',
      ].filter(Boolean).join('、');

      return h('button', {
        type: 'button',
        class: classes,
        'aria-label': description,
        'aria-pressed': String(isSelected),
        'aria-current': cell.key === today ? 'date' : null,
        onClick: () => select(cell.key),
      },
        h('span', { class: 'day-head' },
          h('span', { class: 'day-num' }, cell.date.getDate()),
          holiday && h('span', { class: 'day-hol' }, holiday),
        ),
        events.length > 0 && h('span', { class: 'day-dots', 'aria-hidden': 'true' },
          events.slice(0, MAX_DOTS).map((e) => h('i', { style: { '--label': colorOf(e) } })),
        ),
        events.length > 0 && h('span', { class: 'day-chips', 'aria-hidden': 'true' },
          events.slice(0, MAX_CHIPS).map((e) => h('span', { class: 'day-chip', style: { '--label': colorOf(e) } }, e.title)),
          events.length > MAX_CHIPS && h('span', { class: 'day-more' }, `他${events.length - MAX_CHIPS}件`),
        ),
      );
    });

    grid.replaceChildren(...cells);
  }

  function renderAgenda(labelMap) {
    const events = repo.eventsOn(state.selected, state.filter);
    const holiday = holidayName(state.selected);
    const filterName = state.filter ? labelMap.get(state.filter)?.name : null;

    const item = (event) => {
      const label = labelMap.get(event.labelId);
      return h('li', {},
        h('button', {
          type: 'button',
          class: 'agenda-item',
          style: { '--label': label?.color ?? 'var(--line)' },
          onClick: () => openEdit(event),
        },
          h('span', { class: `agenda-time${event.time ? '' : ' is-allday'}` }, event.time ?? '終日'),
          h('span', { class: 'agenda-body' },
            h('span', { class: 'agenda-title' }, event.title),
            label && h('span', { class: 'pill' }, label.name),
            event.memo && h('span', { class: 'agenda-memo' }, event.memo),
          ),
          h('span', { class: 'agenda-chev' }, icon('chevronRight')),
        ),
      );
    };

    agenda.replaceChildren(
      h('header', { class: 'agenda-head' },
        h('h3', {}, formatDayHeading(state.selected)),
        state.selected === today && h('span', { class: 'tag' }, '今日'),
        holiday && h('span', { class: 'tag tag-hol' }, holiday),
        h('span', { class: 'agenda-count' }, `${events.length}件`),
      ),
      events.length > 0
        ? h('ul', { class: 'agenda-list' }, events.map(item))
        : h('div', { class: 'agenda-empty' },
          h('p', {}, filterName ? `「${filterName}」の予定はありません` : 'この日の予定はありません'),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => openNew() },
            icon('plus'), 'この日に予定を追加'),
        ),
    );
  }

  // ---------- 組み立て ----------

  root.append(
    h('div', { class: 'cal' },
      h('div', { class: 'cal-main' },
        head,
        filters,
        h('div', { class: 'cal-board' }, weekdays, grid),
      ),
      agenda,
    ),
    fab,
  );

  render();
  const unsubscribe = repo.subscribe(render); // データが変わったら描き直す

  return () => unsubscribe();
}
