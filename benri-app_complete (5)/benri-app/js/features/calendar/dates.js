import { toDateKey } from '../../models/schema.js';

/**
 * 日付まわりの計算と、日本の祝日。
 * 日付は 'YYYY-MM-DD' の文字列（dateKey）でやりとりします。
 */

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 'YYYY-MM-DD' → 端末の現地時刻の Date */
export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, days) {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** month は 0〜11 */
export function shiftMonth(year, month, delta) {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/**
 * 月表示用のマス目。日曜始まりで、前後の月の日も含めて週ごとに返す。
 * @returns {{ date: Date, key: string, inMonth: boolean }[][]}
 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekCount = Math.ceil((first.getDay() + daysInMonth) / 7);
  const start = new Date(year, month, 1 - first.getDay());

  const weeks = [];
  for (let w = 0; w < weekCount; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      week.push({ date, key: toDateKey(date), inMonth: date.getMonth() === month });
    }
    weeks.push(week);
  }
  return weeks;
}

/** '2026-10-13' → '10月13日（火）' */
export function formatDayHeading(key) {
  const date = parseDateKey(key);
  return `${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS[date.getDay()]}）`;
}

/** 2026 → '令和8年'（和暦に対応していない環境では空文字） */
export function eraYear(year) {
  try {
    return new Intl.DateTimeFormat('ja-JP-u-ca-japanese', { era: 'long', year: 'numeric' })
      .format(new Date(year, 6, 1));
  } catch {
    return '';
  }
}

// 日本の祝日の計算は他の機能でも使うので core に置いています
export { holidayName } from '../../core/jp-holidays.js';
