import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { toDateKey } from '../../models/schema.js';
import {
  dateKeyOf, dayLabel, formatMinutes, formatMinutesShort, lastNDays, parseKey, timeOf, weekdayOf,
} from './format.js';
import { openSessionSheet } from './session-sheet.js';

const RANGES = [7, 30];
const PAGE_SIZE = 20;

/** 目盛りをきりのいい数字にする（最大4本） */
function niceScale(max) {
  const steps = [10, 15, 30, 60, 90, 120, 180, 240, 360, 480, 720];
  if (max <= 0) return { top: 60, step: 30 };
  const step = steps.find((s) => max / s <= 4) ?? Math.ceil(max / 4 / 60) * 60;
  return { top: Math.ceil(max / step) * step, step };
}

/** 今日（今日がまだ0分なら昨日）からさかのぼって、続けて勉強した日数 */
function streakOf(totals, today) {
  let key = today;
  const previous = (k) => { const d = parseKey(k); return toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)); };
  if (!totals.get(key)) key = previous(key);
  let days = 0;
  while (totals.get(key) > 0) {
    days += 1;
    key = previous(key);
  }
  return days;
}

/**
 * 勉強時間の記録：集計・グラフ・内容別・一覧。
 * @returns {() => void} 後片付け関数
 */
export function mountLogView(root, { repo }) {
  let range = RANGES.includes(repo.pref('logRange', 7)) ? repo.pref('logRange', 7) : 7;
  let shown = PAGE_SIZE;
  const container = h('div', { class: 'log' });

  // ---------- 数字のまとめ ----------

  function tiles(sessions, totals, today) {
    const week = lastNDays(7).reduce((sum, k) => sum + (totals.get(k) ?? 0), 0);
    const todayMinutes = totals.get(today) ?? 0;
    const streak = streakOf(totals, today);
    const all = sessions.reduce((sum, s) => sum + s.minutes, 0);

    const tile = (label, value, note) => h('div', { class: 'stat' },
      h('span', { class: 'stat-label' }, label),
      h('span', { class: 'stat-value' }, value),
      h('span', { class: 'stat-note' }, note),
    );

    return h('div', { class: 'stats' },
      tile('今日', formatMinutes(todayMinutes), todayMinutes ? `${sessions.filter((s) => dateKeyOf(s.startedAt) === today).length}回` : 'まだ記録がありません'),
      tile('直近7日', formatMinutes(week), `1日平均 ${formatMinutes(Math.round(week / 7))}`),
      tile('連続', `${streak}日`, todayMinutes || streak === 0 ? '続けて勉強した日数' : '今日やると記録更新'),
      tile('累計', formatMinutes(all), `${sessions.length}回`),
    );
  }

  // ---------- 日ごとの棒グラフ ----------

  function chart(totals, today) {
    const keys = lastNDays(range, today);
    const values = keys.map((k) => totals.get(k) ?? 0);
    const max = Math.max(...values);
    const { top, step } = niceScale(max);
    const maxIndex = max > 0 ? values.lastIndexOf(max) : -1;
    const n = keys.length;

    const tip = h('div', { class: 'chart-tip', hidden: true, 'aria-hidden': 'true' });
    const showTip = (i) => {
      tip.textContent = `${dayLabel(keys[i])}  ${values[i] ? formatMinutes(values[i]) : '記録なし'}`;
      tip.style.setProperty('--x', String((i + 0.5) / n));
      tip.style.setProperty('--y', String(values[i] / top));
      tip.dataset.edge = (i + 0.5) / n < 0.2 ? 'left' : (i + 0.5) / n > 0.8 ? 'right' : '';
      tip.hidden = false;
    };
    const hideTip = () => { tip.hidden = true; };

    const gridlines = [];
    for (let t = 0; t <= top; t += step) {
      gridlines.push(h('div', { class: 'gridline', style: { bottom: `${(t / top) * 100}%` } },
        h('span', { class: 'tick' }, t === 0 ? '0' : formatMinutesShort(t))));
    }

    const columns = keys.map((key, i) => {
      const value = values[i];
      const isToday = key === today;
      const showValue = value > 0 && (isToday || i === maxIndex);
      return h('button', {
        type: 'button',
        class: `col${isToday ? ' is-today' : ''}`,
        'aria-label': `${dayLabel(key)} ${value ? formatMinutes(value) : '記録なし'}`,
        onPointerenter: () => showTip(i),
        onPointerleave: hideTip,
        onFocus: () => showTip(i),
        onBlur: hideTip,
      },
        h('span', { class: 'col-bar', style: { height: value ? `max(3px, ${(value / top) * 100}%)` : '0' } },
          showValue && h('span', { class: `col-value${i === n - 1 ? ' at-end' : ''}` }, formatMinutes(value)),
        ),
      );
    });

    const xLabels = keys.map((key, i) => {
      const d = parseKey(key);
      const visible = range === 7 || i === n - 1 || (n - 1 - i) % 7 === 0;
      const text = range === 7 ? [h('b', {}, d.getDate()), weekdayOf(key)] : `${d.getMonth() + 1}/${d.getDate()}`;
      return h('span', { class: `x-label${key === today ? ' is-today' : ''}` }, visible ? text : '');
    });

    return h('figure', { class: 'card-block chart' },
      h('figcaption', { class: 'block-head' },
        h('h3', {}, '日ごとの勉強時間'),
        h('div', { class: 'segmented', role: 'group', 'aria-label': '期間' },
          RANGES.map((r) => h('button', {
            type: 'button',
            'aria-pressed': String(r === range),
            onClick: () => { range = r; repo.setPref('logRange', r); render(); },
          }, `${r}日`))),
      ),
      h('div', { class: 'chart-plot', style: { '--cols': String(n) } },
        h('div', { class: 'chart-area' },
          gridlines,
          h('div', { class: 'chart-cols' }, columns),
          tip,
        ),
        h('div', { class: 'chart-x', 'aria-hidden': 'true' }, xLabels),
      ),
      max === 0 && h('p', { class: 'chart-empty' }, 'この期間の記録はまだありません'),
    );
  }

  // ---------- 内容別 ----------

  function bySubject(sessions) {
    const keys = new Set(lastNDays(range));
    const totals = new Map();
    for (const s of sessions) {
      if (!keys.has(dateKeyOf(s.startedAt))) continue;
      const name = s.subject || '内容なし';
      totals.set(name, (totals.get(name) ?? 0) + s.minutes);
    }
    let rows = [...totals].sort((a, b) => b[1] - a[1]);
    if (rows.length > 6) {
      const rest = rows.slice(5).reduce((sum, [, m]) => sum + m, 0);
      rows = [...rows.slice(0, 5), ['その他', rest]];
    }
    const max = rows[0]?.[1] ?? 0;

    return h('section', { class: 'card-block' },
      h('div', { class: 'block-head' }, h('h3', {}, `内容別（直近${range}日）`)),
      rows.length === 0
        ? h('p', { class: 'muted' }, '記録がありません')
        : h('ul', { class: 'subjects' }, rows.map(([name, minutes]) => h('li', {},
          h('span', { class: 'subject-name' }, name),
          h('span', { class: 'subject-track' }, h('i', { style: { width: `${(minutes / max) * 100}%` } })),
          h('span', { class: 'subject-value' }, formatMinutes(minutes)),
        ))),
    );
  }

  // ---------- 一覧 ----------

  function list(sessions) {
    if (sessions.length === 0) {
      return h('section', { class: 'log-empty' },
        h('strong', {}, 'まだ記録がありません'),
        h('span', {}, 'タイマーで集中すると自動で記録されます。過去の分は「記録を追加」から入力できます。'),
      );
    }

    const visible = sessions.slice(0, shown);
    const groups = new Map();
    for (const s of visible) {
      const key = dateKeyOf(s.startedAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    const dayTotals = repo.minutesByDay();

    return h('section', { class: 'history', 'aria-label': '記録の一覧' },
      [...groups].map(([key, items]) => h('div', { class: 'history-day' },
        h('h3', { class: 'history-head' },
          h('span', {}, dayLabel(key)),
          h('span', { class: 'history-total' }, `合計 ${formatMinutes(dayTotals.get(key) ?? 0)}`),
        ),
        h('ul', { class: 'history-list' }, items.map((s) => h('li', {},
          h('button', { type: 'button', class: 'history-item', onClick: () => openSessionSheet({ repo, session: s }) },
            h('span', { class: 'history-time' }, timeOf(s.startedAt)),
            h('span', { class: 'history-body' },
              h('span', { class: 'history-subject' }, s.subject || '内容なし'),
              s.note && h('span', { class: 'history-note' }, s.note),
            ),
            h('span', { class: 'history-meta' },
              h('span', { class: 'history-minutes' }, formatMinutes(s.minutes)),
              h('span', { class: `source source-${s.source}` }, s.source === 'pomodoro' ? 'タイマー' : '手入力'),
            ),
          ),
        ))),
      )),
      sessions.length > shown && h('button', {
        type: 'button',
        class: 'btn btn-ghost btn-block',
        onClick: () => { shown += PAGE_SIZE; render(); },
      }, `さらに表示（残り ${sessions.length - shown}件）`),
    );
  }

  // ---------- 描画 ----------

  function render() {
    const sessions = repo.sessions();
    const totals = repo.minutesByDay();
    const today = toDateKey();

    container.replaceChildren(
      h('div', { class: 'log-head' },
        h('h2', {}, '勉強の記録'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => openSessionSheet({ repo }) },
          icon('plus'), '記録を追加'),
      ),
      tiles(sessions, totals, today),
      h('div', { class: 'log-grid' },
        chart(totals, today),
        bySubject(sessions),
      ),
      list(sessions),
    );
  }

  root.append(container);
  render();
  return repo.subscribe(render);
}
