import { toDateKey } from '../../models/schema.js';
import { addDays, isDateKey } from './dates.js';

/**
 * 日記のデータ（1日に1件）。
 *
 * @typedef {Object} DiaryEntry
 * @property {string} date          'YYYY-MM-DD'
 * @property {string} text          本文（350文字まで）
 * @property {number | null} rating 今日の評価 ♡1〜5（なしは null）
 * @property {boolean} favorite     ☆お気に入り
 * @property {string} reflection    反省と改善（150文字まで）
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * 保存の形：{ 'YYYY-MM-DD': DiaryEntry, ... }（日付で直接引けるように）
 */

export const TEXT_MAX = 350;
export const REFLECTION_MAX = 150;

/** 文字数（絵文字なども1文字として数える） */
export const countChars = (text) => [...String(text ?? '')].length;

/** @param {ReturnType<import('../../core/storage.js').createStore>} store */
export function createDiaryRepo(store) {
  const listeners = new Set();
  const emit = () => { for (const fn of [...listeners]) fn(); };

  /** @returns {Record<string, DiaryEntry>} */
  const read = () => {
    const value = store.get('entries', {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  };
  const write = (entries) => { store.set('entries', entries); emit(); };

  const sortedDates = () => Object.keys(read()).sort();

  function check(input) {
    const date = String(input.date ?? '');
    if (!isDateKey(date)) throw new Error('日付を選んでください。');
    if (date > toDateKey()) throw new Error('まだ来ていない日の日記は書けません。');
    const text = String(input.text ?? '').trim();
    if (!text) throw new Error('日記の文章を書いてください。');
    if (countChars(text) > TEXT_MAX) throw new Error(`文章は${TEXT_MAX}文字までです（今 ${countChars(text)}文字）。`);
    const reflection = String(input.reflection ?? '').trim();
    if (countChars(reflection) > REFLECTION_MAX) throw new Error(`反省と改善は${REFLECTION_MAX}文字までです（今 ${countChars(reflection)}文字）。`);
    const rating = input.rating == null || input.rating === '' ? null : Number(input.rating);
    if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) throw new Error('評価は♡1〜5で選んでください。');
    return { date, text, reflection, rating, favorite: Boolean(input.favorite) };
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    get(date) {
      return read()[date] ?? null;
    },

    /** 古い順 */
    all() {
      const entries = read();
      return sortedDates().map((d) => entries[d]);
    },

    count() {
      return Object.keys(read()).length;
    },

    /**
     * 保存する。originalDate を渡すと「その日の日記の編集」（日付を変えたら移動）。
     * ほかの日の日記を上書きしないよう、すでにある日付には移動・新規作成できない。
     */
    save(input, originalDate = null) {
      const entry = check(input);
      const entries = read();
      if (entry.date !== originalDate && entries[entry.date]) {
        const error = new Error('この日の日記はもうあります。');
        error.existingDate = entry.date;
        throw error;
      }
      const now = new Date().toISOString();
      const previous = originalDate ? entries[originalDate] : null;
      if (originalDate && originalDate !== entry.date) delete entries[originalDate];
      entries[entry.date] = { ...entry, createdAt: previous?.createdAt ?? input.createdAt ?? now, updatedAt: now };
      write(entries);
      return entries[entry.date];
    },

    remove(date) {
      const entries = read();
      delete entries[date];
      write(entries);
    },

    toggleFavorite(date) {
      const entries = read();
      if (!entries[date]) return;
      entries[date].favorite = !entries[date].favorite;
      write(entries);
    },

    /** date より前で、いちばん近い記録日 */
    prevDate(date) {
      const dates = sortedDates();
      for (let i = dates.length - 1; i >= 0; i--) if (dates[i] < date) return dates[i];
      return null;
    },

    /** date より後で、いちばん近い記録日 */
    nextDate(date) {
      return sortedDates().find((d) => d > date) ?? null;
    },

    latestDate() {
      return sortedDates().at(-1) ?? null;
    },

    /** 期間内の日記 @returns {Record<string, DiaryEntry>} */
    between(from, to) {
      const entries = read();
      const result = {};
      for (const d of Object.keys(entries)) if (d >= from && d <= to) result[d] = entries[d];
      return result;
    },

    favorites() {
      return this.all().filter((e) => e.favorite).reverse();
    },

    /** 今日（今日がまだなら昨日）から続けて書いている日数 */
    streak() {
      const entries = read();
      let day = toDateKey();
      if (!entries[day]) day = addDays(day, -1);
      let count = 0;
      while (entries[day]) { count += 1; day = addDays(day, -1); }
      return count;
    },

    pref(key, fallback) { return store.get(`pref.${key}`, fallback); },
    setPref(key, value) { store.set(`pref.${key}`, value); },
  };
}

/** 期間内の日記のまとめ（記録日数・平均の評価・☆の数） */
export function summarize(entries) {
  const list = Object.values(entries);
  const rated = list.filter((e) => e.rating);
  return {
    days: list.length,
    average: rated.length ? rated.reduce((s, e) => s + e.rating, 0) / rated.length : null,
    favorites: list.filter((e) => e.favorite).length,
  };
}
