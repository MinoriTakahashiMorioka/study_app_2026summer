import { toDateKey } from '../../models/schema.js';

/**
 * 和暦（令和・平成・昭和・大正）と日付の表示。
 * 履歴書は「西暦」か「和暦」のどちらかにそろえるのが基本なので、切り替えて表示できるようにしています。
 */

const ERAS = [
  { name: '令和', start: [2019, 5, 1] },
  { name: '平成', start: [1989, 1, 8] },
  { name: '昭和', start: [1926, 12, 25] },
  { name: '大正', start: [1912, 7, 30] },
];

const notBefore = (a, b) => a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] >= b[2];

/** @returns {{ name: string, year: number } | null} */
export function eraOf(year, month = 12, day = 31) {
  for (const era of ERAS) {
    if (notBefore([year, month, day], era.start)) return { name: era.name, year: year - era.start[0] + 1 };
  }
  return null;
}

const eraYearText = (era) => `${era.name}${era.year === 1 ? '元' : era.year}`;

/** 年の欄：西暦 '2026' / 和暦 '令和8' */
export function yearCell(year, month, mode) {
  if (!year) return '';
  if (mode !== 'wareki') return String(year);
  const era = eraOf(year, month || 1, 1);
  return era ? eraYearText(era) : String(year);
}

/** 入力欄の横に出す和暦のヒント（2020 → '令和2年'） */
export function eraHint(year, month) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1912 || y > 2200) return '';
  const era = eraOf(y, Number(month) || 12, 1);
  return era ? `${eraYearText(era)}年` : '';
}

const parseKey = (key) => key.split('-').map(Number);

/** 'YYYY-MM-DD' → '2026年10月14日' / '令和8年10月14日' */
export function formatDate(key, mode = 'seireki') {
  if (!key) return '';
  const [y, m, d] = parseKey(key);
  if (mode === 'wareki') {
    const era = eraOf(y, m, d);
    if (era) return `${eraYearText(era)}年${m}月${d}日`;
  }
  return `${y}年${m}月${d}日`;
}

/** 満年齢（onKey の日付時点） */
export function ageOn(birthKey, onKey) {
  if (!birthKey || !onKey) return null;
  const [by, bm, bd] = parseKey(birthKey);
  const [y, m, d] = parseKey(onKey);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age >= 0 ? age : null;
}

/** 2つの日付の差（日数）。b - a */
export function daysBetween(aKey, bKey) {
  const [ay, am, ad] = parseKey(aKey);
  const [by, bm, bd] = parseKey(bKey);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/** ISO 文字列 → 端末の現地時刻の 'YYYY-MM-DD' */
export function dateKeyOf(iso) {
  return toDateKey(new Date(iso));
}
