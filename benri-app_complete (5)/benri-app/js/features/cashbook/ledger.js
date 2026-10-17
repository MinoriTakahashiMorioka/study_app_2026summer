import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { accountOf } from './accounts.js';
import { balanceText, yen } from './money.js';
import { totals } from './repo.js';

/**
 * 帳簿の表（3つのモードで共通の見た目）。
 *
 *  PC     : 年月日 | 内容 | 勘定科目 | 入金 | 出金 | 残高   の横1行
 *  スマホ : 1行を1枚のカードにして、金額を右に大きく出す
 *
 * 月が変わるところに「2026年10月　入金 ○○ / 出金 ○○」の区切りを入れます。
 */

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

/** 日付のない行に「直前の日付」を when としてつける（月の区切り・期間検索に使う） */
export function withWhen(rows) {
  let last = null;
  return rows.map((r) => {
    if (r.date) last = r.date;
    return { ...r, when: r.date ?? last };
  });
}

export const monthKeyOf = (when) => (when ? when.slice(0, 7) : '');
export const monthLabel = (key) => {
  if (!key) return '日付なし';
  const [y, m] = key.split('-').map(Number);
  return `${y}年${m}月`;
};

function dateCell(date) {
  if (!date) return h('span', { class: 'cb-cell cb-date is-empty', role: 'cell', title: '日付なし' }, '—');
  const [y, m, d] = date.split('-').map(Number);
  const w = new Date(y, m - 1, d).getDay();
  return h('span', { class: 'cb-cell cb-date', role: 'cell', 'data-w': String(w) },
    h('time', { dateTime: date }, `${m}/${d}`), h('small', {}, `(${WEEK[w]})`));
}

/** 検索語を <mark> で目立たせる */
export function highlight(text, keyword) {
  const q = (keyword ?? '').trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const key = q.toLowerCase();
  const parts = [];
  let i = 0;
  for (let at = lower.indexOf(key); at !== -1; at = lower.indexOf(key, i)) {
    if (at > i) parts.push(text.slice(i, at));
    parts.push(h('mark', {}, text.slice(at, at + key.length)));
    i = at + key.length;
  }
  parts.push(text.slice(i));
  return parts;
}

export function accountChip(id) {
  const a = accountOf(id);
  if (!a) return h('span', { class: 'cb-acc is-none' }, '—');
  return h('span', { class: 'cb-acc', 'data-kind': a.kind }, a.name);
}

/** 表の見出し行 */
export function ledgerHead({ check } = {}) {
  return h('div', { class: 'cb-row cb-head', role: 'row' },
    check && h('span', { class: 'cb-cell cb-check', role: 'columnheader' }, check),
    ...['年月日', '内容', '勘定科目', '入金', '出金', '残高'].map((label, i) =>
      h('span', { class: `cb-cell ${['cb-date', 'cb-content', 'cb-account', 'cb-in', 'cb-out', 'cb-bal'][i]}`, role: 'columnheader' }, label)),
  );
}

/**
 * 帳簿の1行
 * @param {Object} row     ledger() の行（balance つき）
 * @param {Object} [opts]
 * @param {string} [opts.keyword]   内容で目立たせる語
 * @param {Node}   [opts.check]     削除モードのチェックボックス
 * @param {Object} [opts.attrs]     行につける属性（onClick など）
 */
export function ledgerRow(row, { keyword, check, attrs = {} } = {}) {
  return h('div', { class: 'cb-row', role: 'row', 'data-id': row.id, ...attrs },
    check && h('span', { class: 'cb-cell cb-check', role: 'cell' }, check),
    dateCell(row.date),
    h('span', { class: 'cb-cell cb-content', role: 'cell' }, highlight(row.content, keyword)),
    h('span', { class: 'cb-cell cb-account', role: 'cell' }, accountChip(row.account)),
    h('span', { class: 'cb-cell cb-in', role: 'cell', 'data-empty': row.income == null ? 'true' : null }, row.income == null ? '' : yen(row.income)),
    h('span', { class: 'cb-cell cb-out', role: 'cell', 'data-empty': row.expense == null ? 'true' : null }, row.expense == null ? '' : yen(row.expense)),
    h('span', { class: 'cb-cell cb-bal', role: 'cell', 'data-negative': row.balance < 0 ? 'true' : null },
      h('small', { class: 'cb-bal-label' }, '残高'), balanceText(row.balance)),
  );
}

/** 前期繰越（はじめの残高）の行 */
export function openingRow(opening, { onEdit, check } = {}) {
  return h('div', { class: 'cb-row cb-opening', role: 'row' },
    check !== undefined && h('span', { class: 'cb-cell cb-check', role: 'cell' }),
    h('span', { class: 'cb-cell cb-date is-empty', role: 'cell' }, ''),
    h('span', { class: 'cb-cell cb-content', role: 'cell' },
      h('span', {}, '前期繰越'),
      h('small', {}, 'はじめの残高'),
      onEdit && h('button', { type: 'button', class: 'cb-mini-btn', onClick: onEdit, 'aria-label': 'はじめの残高を変更' }, icon('pencil'), '変更'),
    ),
    h('span', { class: 'cb-cell cb-account', role: 'cell' }),
    h('span', { class: 'cb-cell cb-in', role: 'cell', 'data-empty': 'true' }),
    h('span', { class: 'cb-cell cb-out', role: 'cell', 'data-empty': 'true' }),
    h('span', { class: 'cb-cell cb-bal', role: 'cell', 'data-negative': opening < 0 ? 'true' : null },
      h('small', { class: 'cb-bal-label' }, '残高'), balanceText(opening)),
  );
}

/** 月の区切り（その月に表示している行の入金・出金の合計つき） */
export function monthRow(key, rows) {
  const t = totals(rows);
  return h('div', { class: 'cb-month', role: 'row' },
    h('span', { class: 'cb-month-label', role: 'cell' }, monthLabel(key)),
    h('span', { class: 'cb-month-sum', role: 'cell' },
      t.income ? h('span', { class: 'is-in' }, `入金 ${yen(t.income)}`) : null,
      t.expense ? h('span', { class: 'is-out' }, `出金 ${yen(t.expense)}`) : null,
    ),
  );
}

/**
 * 行を月ごとに区切って並べる
 * @param {Object[]} rows   withWhen() 済みの行
 * @param {(row) => Node} renderRow
 */
export function groupedRows(rows, renderRow) {
  const out = [];
  let i = 0;
  while (i < rows.length) {
    const key = monthKeyOf(rows[i].when);
    const group = [];
    while (i < rows.length && monthKeyOf(rows[i].when) === key) group.push(rows[i++]);
    out.push(monthRow(key, group), ...group.map(renderRow));
  }
  return out;
}
