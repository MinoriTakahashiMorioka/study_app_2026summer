import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { toDateKey } from '../../models/schema.js';
import {
  WEEKDAYS, addDays, dayOfWeek, longLabel, monthDays, monthOf, monthWeeks, parse, shiftMonth, shortLabel, weekDays, weekStart,
} from './dates.js';
import { summarize } from './repo.js';
import { entryCard, hearts } from './parts.js';
import { openDiaryEditor } from './editor.js';

/**
 * 日記の表示（日・週・月・お気に入り）。
 * それぞれ (root, deps) を受け取って描画し、後片付け関数を返します。
 * deps: { repo, go(sub, opts), write(date) }
 */

const summaryLine = (entries, total) => {
  const s = summarize(entries);
  return h('p', { class: 'diary-summary' },
    h('span', {}, `記録 ${s.days}${total ? ` / ${total}日` : '日'}`),
    s.average != null && h('span', {}, icon('heartFill'), `平均 ${s.average.toFixed(1)}`),
    s.favorites > 0 && h('span', {}, icon('starFill'), `${s.favorites}`),
  );
};

// =========================================================
// 日ごと：画面いっぱいに1日分。左右の端に前・次の記録日
// =========================================================

export function mountDayView(root, { repo, go, write, date }) {
  const today = toDateKey();
  const container = h('div', { class: 'day-view' });

  function edge(direction, targetDate) {
    const entry = targetDate ? repo.get(targetDate) : null;
    const isPrev = direction === 'prev';
    if (!targetDate) {
      return h('div', { class: `day-edge is-${direction} is-none`, 'aria-hidden': 'true' },
        h('span', { class: 'edge-label' }, isPrev ? 'これより前の記録はありません' : 'これより後の記録はありません'));
    }
    return h('button', {
      type: 'button',
      class: `day-edge is-${direction}`,
      'aria-label': `${isPrev ? '前' : '次'}の記録日 ${longLabel(targetDate)}`,
      onClick: () => go(`day/${targetDate}`, { replace: true }),
    },
      icon(isPrev ? 'chevronLeft' : 'chevronRight'),
      h('span', { class: 'edge-label' }, isPrev ? '前の記録' : '次の記録'),
      h('span', { class: 'edge-date' }, shortLabel(targetDate)),
      entry && h('span', { class: 'edge-excerpt' }, entry.text),
    );
  }

  function page() {
    const entry = repo.get(date);
    const d = parse(date);
    const head = h('header', { class: 'page-head' },
      h('div', { class: 'page-date' },
        h('span', { class: 'page-year' }, `${d.getFullYear()}年`),
        h('h2', {}, `${d.getMonth() + 1}月${d.getDate()}日`, h('small', { class: dayOfWeek(date) === 0 ? 'is-sun' : dayOfWeek(date) === 6 ? 'is-sat' : null }, `（${WEEKDAYS[dayOfWeek(date)]}）`)),
        date === today && h('span', { class: 'tag' }, '今日'),
      ),
      entry && h('div', { class: 'page-actions' },
        h('button', {
          type: 'button',
          class: `star-btn${entry.favorite ? ' is-on' : ''}`,
          'aria-pressed': String(entry.favorite),
          'aria-label': entry.favorite ? 'お気に入りから外す' : 'お気に入りに登録',
          title: entry.favorite ? 'お気に入りから外す' : 'お気に入りに登録',
          onClick: () => repo.toggleFavorite(date),
        }, icon(entry.favorite ? 'starFill' : 'star')),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => write(date) }, icon('pencil'), '編集'),
      ),
    );

    if (!entry) {
      return h('article', { class: 'diary-page is-empty' },
        head,
        date > today
          ? h('p', { class: 'page-empty' }, 'まだ来ていない日です。')
          : h('div', { class: 'page-empty' },
            h('p', {}, 'この日の日記はまだありません。'),
            h('button', { type: 'button', class: 'btn btn-primary', onClick: () => write(date) }, icon('pencil'), 'この日の日記を書く'),
          ),
      );
    }

    return h('article', { class: `diary-page${entry.favorite ? ' is-fav' : ''}` },
      head,
      h('div', { class: 'page-rating' }, h('span', { class: 'muted' }, '今日の評価'), hearts(entry.rating, { size: 'lg' })),
      h('div', { class: 'page-text' }, entry.text),
      entry.reflection && h('section', { class: 'page-reflect' }, h('h3', {}, '反省と改善'), h('p', {}, entry.reflection)),
      h('p', { class: 'page-meta' }, `${new Date(entry.updatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} に更新`),
    );
  }

  function render() {
    const prev = repo.prevDate(date);
    const next = repo.nextDate(date);
    const jump = h('input', { id: 'dy-jump', class: 'text-input', type: 'date', value: date, 'aria-label': '日付を選んで表示' });
    jump.addEventListener('change', () => { if (jump.value) go(`day/${jump.value}`, { replace: true }); });

    container.replaceChildren(
      h('div', { class: 'day-tools' },
        h('button', { type: 'button', class: 'nav-btn', 'aria-label': '前の日', onClick: () => go(`day/${addDays(date, -1)}`, { replace: true }) }, icon('chevronLeft')),
        jump,
        h('button', { type: 'button', class: 'nav-btn', 'aria-label': '次の日', onClick: () => go(`day/${addDays(date, 1)}`, { replace: true }) }, icon('chevronRight')),
        date !== today && h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => go(`day/${today}`, { replace: true }) }, '今日'),
      ),
      h('div', { class: 'day-layout' }, edge('prev', prev), page(), edge('next', next)),
    );
  }

  // ← → キーと、スマホの左右スワイプで前後の記録日へ
  const onKey = (event) => {
    if (event.target.closest?.('input, textarea, select, dialog')) return;
    if (event.key === 'ArrowLeft' && repo.prevDate(date)) go(`day/${repo.prevDate(date)}`, { replace: true });
    if (event.key === 'ArrowRight' && repo.nextDate(date)) go(`day/${repo.nextDate(date)}`, { replace: true });
  };
  let touch = null;
  container.addEventListener('touchstart', (e) => { touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  container.addEventListener('touchend', (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
    const target = dx > 0 ? repo.prevDate(date) : repo.nextDate(date);
    if (target) go(`day/${target}`, { replace: true });
  }, { passive: true });

  document.addEventListener('keydown', onKey);
  root.append(container);
  render();
  const unsubscribe = repo.subscribe(render);
  return () => { unsubscribe(); document.removeEventListener('keydown', onKey); };
}

// =========================================================
// 週ごと：カレンダーから週を選ぶ → 月〜日の7日分
// =========================================================

export function mountWeekView(root, { repo, go, write, monday }) {
  const today = toDateKey();
  let calMonth = monthOf(addDays(monday, 3)); // その週の木曜が入っている月を表示
  const container = h('div', { class: 'period-view' });

  function calendar() {
    const weeks = monthWeeks(calMonth);
    const [y, m] = calMonth.split('-').map(Number);
    return h('section', { class: 'pick-card', 'aria-label': '週を選ぶ' },
      h('div', { class: 'pick-head' },
        h('button', { type: 'button', class: 'nav-btn', 'aria-label': '前の月', onClick: () => { calMonth = shiftMonth(calMonth, -1); render(); } }, icon('chevronLeft')),
        h('strong', {}, `${y}年${m}月`),
        h('button', { type: 'button', class: 'nav-btn', 'aria-label': '次の月', onClick: () => { calMonth = shiftMonth(calMonth, 1); render(); } }, icon('chevronRight')),
      ),
      h('div', { class: 'week-cal' },
        h('div', { class: 'wc-row wc-dow', 'aria-hidden': 'true' }, ['月', '火', '水', '木', '金', '土', '日'].map((w, i) => h('span', { class: i === 5 ? 'is-sat' : i === 6 ? 'is-sun' : null }, w))),
        weeks.map((days) => {
          const entries = repo.between(days[0], days[6]);
          const selected = days[0] === monday;
          return h('button', {
            type: 'button',
            class: `wc-row wc-week${selected ? ' is-selected' : ''}`,
            'aria-pressed': String(selected),
            'aria-label': `${shortLabel(days[0])}〜${shortLabel(days[6])}の週（記録${Object.keys(entries).length}日）`,
            onClick: () => go(`week/${days[0]}`, { replace: true }),
          }, days.map((d) => h('span', {
            class: [d.slice(0, 7) !== calMonth && 'is-out', d === today && 'is-today', entries[d] && 'has-entry'].filter(Boolean).join(' ') || null,
            style: entries[d]?.rating ? { '--mood': String(entries[d].rating) } : null,
          }, parse(d).getDate())));
        }),
      ),
    );
  }

  function render() {
    const days = weekDays(monday);
    const entries = repo.between(days[0], days[6]);
    container.replaceChildren(
      calendar(),
      h('div', { class: 'period-head' },
        h('h2', {}, `${longLabel(days[0])} 〜 ${longLabel(days[6])}`),
        h('div', { class: 'period-nav' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => go(`week/${addDays(monday, -7)}`, { replace: true }) }, icon('chevronLeft'), '前の週'),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => go(`week/${addDays(monday, 7)}`, { replace: true }) }, '次の週', icon('chevronRight')),
        ),
        summaryLine(entries, 7),
      ),
      h('div', { class: 'card-grid' }, days.map((d) => entryCard(d, entries[d], { onOpen: (x) => go(`day/${x}`), onWrite: write }))),
    );
  }

  root.append(container);
  render();
  return repo.subscribe(render);
}

// =========================================================
// 月ごと：年の中から月を選ぶ → 気分カレンダー＋その月の日記
// =========================================================

export function mountMonthView(root, { repo, go, write, month }) {
  const today = toDateKey();
  let year = Number(month.slice(0, 4));
  let showEmpty = repo.pref('showEmptyDays', false);
  const container = h('div', { class: 'period-view' });

  function monthPicker() {
    const counts = {};
    for (const e of repo.all()) if (e.date.startsWith(`${year}-`)) counts[e.date.slice(0, 7)] = (counts[e.date.slice(0, 7)] ?? 0) + 1;
    return h('section', { class: 'pick-card', 'aria-label': '月を選ぶ' },
      h('div', { class: 'pick-head' },
        h('button', { type: 'button', class: 'nav-btn', 'aria-label': '前の年', onClick: () => { year -= 1; render(); } }, icon('chevronLeft')),
        h('strong', {}, `${year}年`),
        h('button', { type: 'button', class: 'nav-btn', 'aria-label': '次の年', onClick: () => { year += 1; render(); } }, icon('chevronRight')),
      ),
      h('div', { class: 'month-grid' }, Array.from({ length: 12 }, (_, i) => {
        const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
        return h('button', {
          type: 'button',
          class: `mg-month${ym === month ? ' is-selected' : ''}${ym === today.slice(0, 7) ? ' is-current' : ''}`,
          'aria-pressed': String(ym === month),
          onClick: () => go(`month/${ym}`, { replace: true }),
        }, h('b', {}, `${i + 1}月`), h('small', {}, counts[ym] ? `${counts[ym]}日` : '—'));
      })),
    );
  }

  /** その月の気分（♡の濃さ）カレンダー */
  function moodCalendar(entries) {
    return h('section', { class: 'mood-card', 'aria-label': 'その月の気分' },
      h('div', { class: 'mood-head' },
        h('h3', {}, '気分のカレンダー'),
        h('span', { class: 'mood-legend', 'aria-hidden': 'true' }, '♡1', [1, 2, 3, 4, 5].map((n) => h('i', { style: { '--mood': String(n) } })), '5'),
      ),
      h('div', { class: 'mood-grid' },
        ['月', '火', '水', '木', '金', '土', '日'].map((w) => h('span', { class: 'mood-dow' }, w)),
        monthWeeks(month).flat().map((d) => {
          if (d.slice(0, 7) !== month) return h('span', { class: 'mood-cell is-out', 'aria-hidden': 'true' });
          const e = entries[d];
          return h('button', {
            type: 'button',
            class: `mood-cell${e ? ' has-entry' : ''}${d === today ? ' is-today' : ''}`,
            style: e?.rating ? { '--mood': String(e.rating) } : null,
            'aria-label': `${longLabel(d)}${e ? `、♡${e.rating ?? 'なし'}${e.favorite ? '、お気に入り' : ''}` : '、記録なし'}`,
            onClick: () => (e ? go(`day/${d}`) : d <= today && write(d)),
          }, parse(d).getDate(), e?.favorite && h('span', { class: 'mood-star' }, icon('starFill')));
        }),
      ),
    );
  }

  function render() {
    const days = monthDays(month);
    const entries = repo.between(days[0], days.at(-1));
    const [y, m] = month.split('-').map(Number);
    const visibleDays = showEmpty ? days.filter((d) => d <= today || entries[d]) : days.filter((d) => entries[d]);

    const toggle = h('label', { class: 'switch', for: 'dy-show-empty' },
      h('input', { id: 'dy-show-empty', type: 'checkbox', class: 'switch-input', checked: showEmpty }),
      '記録のない日も表示');
    toggle.querySelector('input').addEventListener('change', (e) => { showEmpty = e.target.checked; repo.setPref('showEmptyDays', showEmpty); render(); });

    container.replaceChildren(
      monthPicker(),
      h('div', { class: 'period-head' },
        h('h2', {}, `${y}年${m}月`),
        h('div', { class: 'period-nav' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => go(`month/${shiftMonth(month, -1)}`, { replace: true }) }, icon('chevronLeft'), '前の月'),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => go(`month/${shiftMonth(month, 1)}`, { replace: true }) }, '次の月', icon('chevronRight')),
        ),
        summaryLine(entries, days.length),
      ),
      moodCalendar(entries),
      h('div', { class: 'list-tools' }, toggle),
      visibleDays.length
        ? h('div', { class: 'card-grid' }, visibleDays.map((d) => entryCard(d, entries[d], { onOpen: (x) => go(`day/${x}`), onWrite: write })))
        : h('p', { class: 'diary-empty' }, 'この月の日記はまだありません。'),
    );
  }

  root.append(container);
  render();
  return repo.subscribe(render);
}

// =========================================================
// お気に入り
// =========================================================

export function mountFavoritesView(root, { repo, go, write }) {
  const container = h('div', { class: 'period-view' });
  function render() {
    const list = repo.favorites();
    container.replaceChildren(
      h('div', { class: 'period-head' }, h('h2', {}, 'お気に入りの日記', h('small', {}, `${list.length}件`))),
      list.length
        ? h('div', { class: 'card-grid' }, list.map((e) => entryCard(e.date, e, { onOpen: (x) => go(`day/${x}`), onWrite: write })))
        : h('p', { class: 'diary-empty' }, '☆を付けた日記がここに並びます。日記を開いて右上の☆を押すと登録できます。'),
    );
  }
  root.append(container);
  render();
  return repo.subscribe(render);
}

export { weekStart, openDiaryEditor };
