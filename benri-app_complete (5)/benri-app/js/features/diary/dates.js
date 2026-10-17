import { toDateKey } from '../../models/schema.js';

/** 日記で使う日付の計算（週は月曜はじまり） */

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const pad = (n) => String(n).padStart(2, '0');

export const parse = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const isDateKey = (key) => /^\d{4}-\d{2}-\d{2}$/.test(key ?? '') && toDateKey(parse(key)) === key;
export const isMonthKey = (key) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key ?? '');

export const addDays = (key, days) => {
  const d = parse(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

/** その日を含む週の月曜日 */
export const weekStart = (key) => {
  const d = parse(key);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toDateKey(d);
};

export const weekDays = (monday) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

export const monthOf = (key) => key.slice(0, 7);

export const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const monthDays = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${ym}-${pad(i + 1)}`);
};

/** 月のカレンダー（月曜はじまり、前後の月の日も含む） @returns {string[][]} */
export function monthWeeks(ym) {
  const first = `${ym}-01`;
  const days = monthDays(ym);
  const weeks = [];
  let monday = weekStart(first);
  while (monday <= days.at(-1)) {
    weeks.push(weekDays(monday));
    monday = addDays(monday, 7);
  }
  return weeks;
}

/** '2026-10-15' → '10月15日（木）' */
export function longLabel(key) {
  const d = parse(key);
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
}

/** '2026-10-15' → '10/15（木）' */
export function shortLabel(key) {
  const d = parse(key);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

export const dayOfWeek = (key) => parse(key).getDay();
