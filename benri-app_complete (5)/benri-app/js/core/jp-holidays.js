import { toDateKey } from '../models/schema.js';

/**
 * 日本の祝日（カレンダー・ルーティンなど、どの機能からでも使えます）。
 */

const parseDateKey = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (key, days) => { const d = parseDateKey(key); d.setDate(d.getDate() + days); return toDateKey(d); };

// =========================================================
// 日本の祝日（2016〜2099年に対応）
// 「国民の祝日に関する法律」のルールで計算します。
// 法律が改正されたら、ここを更新してください。
// =========================================================

/** 法律の特例で日付が動いた年 */
const SPECIAL = {
  2019: { extra: [[5, 1, '天皇の即位の日'], [10, 22, '即位礼正殿の儀の行われる日']] },
  2020: { umi: [7, 23], sports: [7, 24], yama: [8, 10] }, // 東京オリンピック特例
  2021: { umi: [7, 22], sports: [7, 23], yama: [8, 8] },
};

const holidayCache = new Map();

/** その月の第n月曜日の日にち */
function nthMonday(year, month, n) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  return 1 + ((8 - firstDay) % 7) + (n - 1) * 7;
}

/** 春分日・秋分日（1980〜2099年で使える近似式） */
const springEquinox = (y) => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
const autumnEquinox = (y) => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

/** @returns {Map<string, string>} dateKey → 祝日名 */
function holidaysOf(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);

  const map = new Map();
  holidayCache.set(year, map);
  if (year < 2016 || year > 2099) return map; // 対応外の年は祝日なし扱い

  const add = (month, day, name) => map.set(toDateKey(new Date(year, month - 1, day)), name);
  const special = SPECIAL[year] ?? {};

  add(1, 1, '元日');
  add(1, nthMonday(year, 1, 2), '成人の日');
  add(2, 11, '建国記念の日');
  if (year >= 2020) add(2, 23, '天皇誕生日');
  else if (year <= 2018) add(12, 23, '天皇誕生日');
  add(3, springEquinox(year), '春分の日');
  add(4, 29, '昭和の日');
  add(5, 3, '憲法記念日');
  add(5, 4, 'みどりの日');
  add(5, 5, 'こどもの日');
  add(...(special.umi ?? [7, nthMonday(year, 7, 3)]), '海の日');
  add(...(special.yama ?? [8, 11]), '山の日');
  add(9, nthMonday(year, 9, 3), '敬老の日');
  add(9, autumnEquinox(year), '秋分の日');
  add(...(special.sports ?? [10, nthMonday(year, 10, 2)]), year >= 2020 ? 'スポーツの日' : '体育の日');
  add(11, 3, '文化の日');
  add(11, 23, '勤労感謝の日');
  for (const [m, d, name] of special.extra ?? []) add(m, d, name);

  const official = [...map.keys()];

  // 国民の休日: 祝日と祝日にはさまれた平日
  for (const key of official) {
    const between = addDays(key, 1);
    if (!map.has(between) && official.includes(addDays(key, 2)) && parseDateKey(between).getDay() !== 0) {
      map.set(between, '国民の休日');
    }
  }

  // 振替休日: 祝日が日曜なら、そのあと最初の「祝日でない日」が休み
  for (const key of official) {
    if (parseDateKey(key).getDay() !== 0) continue;
    let next = addDays(key, 1);
    while (map.has(next)) next = addDays(next, 1);
    map.set(next, '振替休日');
  }

  return map;
}

/** 祝日なら名前、そうでなければ null */
export function holidayName(key) {
  return holidaysOf(Number(key.slice(0, 4))).get(key) ?? null;
}
