import { toDateKey } from '../../models/schema.js';

/** 勉強機能で使う表示用の小さな関数 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const pad = (n) => String(n).padStart(2, '0');

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** '2026-10-14' → '10月14日（水）' */
export function dayLabel(key) {
  const date = parseKey(key);
  return `${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS[date.getDay()]}）`;
}

export function weekdayOf(key) {
  return WEEKDAYS[parseKey(key).getDay()];
}

/** 75 → '1時間15分' */
export function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

/** グラフの目盛り用：120 → '2時間'、90 → '90分' */
export function formatMinutesShort(minutes) {
  return minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60}時間` : `${minutes}分`;
}

/** 秒 → '24:59' */
export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/** ISO 文字列 → 端末の現地時刻の 'HH:MM' */
export function timeOf(iso) {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** ISO 文字列 → 端末の現地時刻の 'YYYY-MM-DD' */
export function dateKeyOf(iso) {
  return toDateKey(new Date(iso));
}

/** 今日を最後とする n 日分の dateKey（古い順） */
export function lastNDays(n, endKey = toDateKey()) {
  const end = parseKey(endKey);
  return Array.from({ length: n }, (_, i) => toDateKey(new Date(end.getFullYear(), end.getMonth(), end.getDate() - (n - 1 - i))));
}
