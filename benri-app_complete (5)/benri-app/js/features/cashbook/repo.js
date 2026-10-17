import { uid } from '../../models/schema.js';
import { accountOf } from './accounts.js';
import { MAX_AMOUNT } from './money.js';

/**
 * 金銭出納帳のデータ。
 *
 * @typedef {Object} CashEntry   帳簿の1行
 * @property {string} id
 * @property {string | null} date      'YYYY-MM-DD'（なくてもよい）
 * @property {string} content          内容（必須）
 * @property {string | null} account   勘定科目の id（なくてもよい）
 * @property {number | null} income    入金（円）
 * @property {number | null} expense   出金（円）
 * @property {number} order            帳簿の並び順
 * @property {string} createdAt
 *
 * 残高は保存せず、表示するたびに「はじめの残高＋入金−出金」を上から順に足して計算します。
 * そのため、どこかの行を直したり消したりしても、残高は自動で正しくなります。
 */

export const CONTENT_MAX = 40;

/** @param {ReturnType<import('../../core/storage.js').createStore>} store */
export function createCashbookRepo(store) {
  const listeners = new Set();
  const emit = () => { for (const fn of [...listeners]) fn(); };

  /** @returns {CashEntry[]} */
  const read = () => {
    const v = store.get('entries', []);
    return Array.isArray(v) ? v : [];
  };
  const write = (entries) => { store.set('entries', entries); emit(); };
  const sorted = (entries) => [...entries].sort((a, b) => a.order - b.order);

  function check(input) {
    const content = String(input.content ?? '').trim();
    if (!content) throw Object.assign(new Error('内容を入力してください。'), { field: 'content' });
    if ([...content].length > CONTENT_MAX) throw Object.assign(new Error(`内容は${CONTENT_MAX}文字以内にしてください。`), { field: 'content' });
    const date = input.date || null;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Object.assign(new Error('年月日の形式が正しくありません。'), { field: 'date' });
    const amount = (v, field) => {
      if (v == null || v === '') return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > MAX_AMOUNT) throw Object.assign(new Error('金額が正しくありません。'), { field });
      return n;
    };
    return {
      date,
      content,
      account: accountOf(input.account) ? input.account : null,
      income: amount(input.income, 'income'),
      expense: amount(input.expense, 'expense'),
    };
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** はじめの残高（繰越） */
    opening() {
      const v = Number(store.get('opening', 0));
      return Number.isFinite(v) ? v : 0;
    },

    setOpening(value) {
      const n = Number(value ?? 0);
      if (!Number.isInteger(n) || Math.abs(n) > MAX_AMOUNT) throw new Error('金額が正しくありません。');
      store.set('opening', n);
      emit();
    },

    entries() {
      return sorted(read());
    },

    count() {
      return read().length;
    },

    /** 帳簿の順に、各行のあとの残高をつけて返す */
    ledger() {
      let balance = this.opening();
      return this.entries().map((e) => {
        balance += (e.income ?? 0) - (e.expense ?? 0);
        return { ...e, balance };
      });
    },

    balance() {
      const rows = this.ledger();
      return rows.length ? rows.at(-1).balance : this.opening();
    },

    /** 指定した行の直前の残高（入力中の行の残高を先に見せるため） */
    balanceBefore(id) {
      let balance = this.opening();
      for (const e of this.entries()) {
        if (e.id === id) return balance;
        balance += (e.income ?? 0) - (e.expense ?? 0);
      }
      return balance;
    },

    add(input) {
      const entries = read();
      const entry = {
        id: uid(),
        ...check(input),
        order: Math.max(0, ...entries.map((e) => e.order)) + 1,
        createdAt: new Date().toISOString(),
      };
      write([...entries, entry]);
      return entry;
    },

    update(id, input) {
      const entries = read();
      const entry = entries.find((e) => e.id === id);
      if (!entry) throw new Error('行が見つかりません。');
      Object.assign(entry, check({ ...entry, ...input }));
      write(entries);
      return entry;
    },

    remove(ids) {
      const set = new Set(ids);
      write(read().filter((e) => !set.has(e.id)));
      return set.size;
    },

    /** 削除した行を元に戻す（同じ id・同じ並び順で戻る） */
    restore(removed) {
      const ids = new Set(read().map((e) => e.id));
      write([...read(), ...removed.filter((e) => !ids.has(e.id))]);
    },

    /**
     * 日付順に並べ替える。
     * 日付のない行は、すぐ上の日付のある行と同じ日として扱う（書いた位置のまま動かない）。
     */
    sortByDate() {
      let lastDate = '';
      const keyed = this.entries().map((e, index) => {
        if (e.date) lastDate = e.date;
        return { e, key: e.date ?? lastDate, index };
      });
      keyed.sort((a, b) => a.key.localeCompare(b.key) || a.index - b.index);
      const entries = keyed.map(({ e }, i) => ({ ...e, order: i + 1 }));
      write(entries);
    },

    /** 日付の順番が前後している行があるか（「日付順に並べ替え」を出すかどうか） */
    isOutOfOrder() {
      let last = '';
      for (const e of this.entries()) {
        if (!e.date) continue;
        if (e.date < last) return true;
        last = e.date;
      }
      return false;
    },

    pref(key, fallback) { return store.get(`pref.${key}`, fallback); },
    setPref(key, value) { store.set(`pref.${key}`, value); },
  };
}

/** 入金・出金の合計 */
export function totals(rows) {
  return rows.reduce((t, r) => ({ income: t.income + (r.income ?? 0), expense: t.expense + (r.expense ?? 0) }), { income: 0, expense: 0 });
}
