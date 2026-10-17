import { uid, toDateKey } from '../../models/schema.js';
import { holidayName } from '../../core/jp-holidays.js';
import { CATEGORIES, SLOTS, toMinutes } from './model.js';

/**
 * 一日のルーティンのデータ。
 *
 * @typedef {Object} Block            予定表の1コマ
 * @property {string} id
 * @property {string} title
 * @property {string} start           'HH:MM'
 * @property {string} end             'HH:MM'（start より前なら翌日まで）
 * @property {string} category        CATEGORIES の id
 * @property {string} memo
 *
 * @typedef {Object} Pattern          一日のパターン（平日・休日・特殊日）
 * @property {string} id              平日 = 'weekday' / 休日 = 'holiday' / 特殊日 = ランダムID
 * @property {string} name
 * @property {'weekday' | 'holiday' | 'special'} kind
 * @property {Block[]} blocks
 * @property {number} order
 *
 * @typedef {Object} Rules            どの日にどのパターンを使うか
 * @property {string[]} weekdays      日〜土（0〜6）ごとのパターンID
 * @property {string | null} holidayPattern  祝日に使うパターン（null なら曜日どおり）
 * @property {Record<string, string>} dates  特定の日付 → パターンID
 *
 * @typedef {Object} RoutineTodo
 * @property {string} id
 * @property {string} title
 * @property {'morning' | 'noon' | 'night' | 'anytime'} slot
 * @property {string | null} due      'HH:MM'（〇時まで）
 * @property {'daily' | 'once'} repeat 毎日くり返す / その日だけ
 * @property {string | null} date     その日だけのときの日付
 * @property {string[]} patterns      毎日のとき、表示するパターン（空なら全部の日）
 * @property {string[]} doneDates     毎日のとき、完了した日付
 * @property {boolean} done           その日だけのとき
 * @property {string} createdAt
 */

export const BUILT_IN = [
  { id: 'weekday', name: '平日', kind: 'weekday' },
  { id: 'holiday', name: '休日', kind: 'holiday' },
];

const DEFAULT_RULES = () => ({
  weekdays: ['holiday', 'weekday', 'weekday', 'weekday', 'weekday', 'weekday', 'holiday'],
  holidayPattern: 'holiday',
  dates: {},
});

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** @param {ReturnType<import('../../core/storage.js').createStore>} store */
export function createRoutineRepo(store) {
  const listeners = new Set();
  const emit = () => { for (const fn of [...listeners]) fn(); };

  // ---------- 読み書き ----------

  /** @returns {Pattern[]} */
  function readPatterns() {
    const saved = store.get('patterns', null);
    if (Array.isArray(saved) && saved.length) return saved;
    const seeded = BUILT_IN.map((p, i) => ({ ...p, blocks: [], order: i }));
    store.set('patterns', seeded);
    return seeded;
  }
  const writePatterns = (patterns) => { store.set('patterns', patterns); emit(); };

  /** @returns {Rules} */
  const readRules = () => ({ ...DEFAULT_RULES(), ...(store.get('rules', null) ?? {}) });
  const writeRules = (rules) => { store.set('rules', rules); emit(); };

  /** @returns {RoutineTodo[]} */
  const readTodos = () => { const v = store.get('todos', []); return Array.isArray(v) ? v : []; };
  const writeTodos = (todos) => { store.set('todos', todos); emit(); };

  // ---------- 入力チェック ----------

  const normalize = (t) => t.normalize('NFKC').trim().toLowerCase();

  function checkPatternName(name, exceptId = null) {
    const value = String(name ?? '').trim();
    if (!value) throw new Error('パターンの名前を入力してください。');
    if ([...value].length > 12) throw new Error('名前は12文字以内にしてください。');
    if (readPatterns().some((p) => p.id !== exceptId && normalize(p.name) === normalize(value))) {
      throw new Error(`「${value}」というパターンはもうあります。`);
    }
    return value;
  }

  function checkBlock(input) {
    const title = String(input.title ?? '').trim();
    if (!title) throw new Error('予定の名前を入力してください。');
    if ([...title].length > 30) throw new Error('予定の名前は30文字以内にしてください。');
    const start = String(input.start ?? '').slice(0, 5);
    const end = String(input.end ?? '').slice(0, 5);
    if (!TIME.test(start) || !TIME.test(end)) throw new Error('開始と終了の時刻を入力してください。');
    if (start === end) throw new Error('開始と終了が同じ時刻です。');
    return {
      title,
      start,
      end,
      category: CATEGORIES.some((c) => c.id === input.category) ? input.category : 'other',
      memo: String(input.memo ?? '').trim().slice(0, 300),
    };
  }

  function checkTodo(input) {
    const title = String(input.title ?? '').trim();
    if (!title) throw new Error('Todo を入力してください。');
    if ([...title].length > 60) throw new Error('Todo は60文字以内にしてください。');
    const due = input.due ? String(input.due).slice(0, 5) : null;
    if (due && !TIME.test(due)) throw new Error('時間の形式が正しくありません。');
    const repeat = input.repeat === 'once' ? 'once' : 'daily';
    return {
      title,
      slot: SLOTS.some((s) => s.id === input.slot) ? input.slot : 'anytime',
      due,
      repeat,
      date: repeat === 'once' ? (input.date || toDateKey()) : null,
      patterns: repeat === 'daily' && Array.isArray(input.patterns) ? input.patterns.filter(Boolean) : [],
    };
  }

  const sortBlocks = (blocks) => [...blocks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  function mutatePattern(id, fn) {
    const patterns = readPatterns();
    const pattern = patterns.find((p) => p.id === id);
    if (!pattern) throw new Error('パターンが見つかりません。');
    fn(pattern, patterns);
    writePatterns(patterns);
    return pattern;
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // ===== パターン =====

    patterns() {
      return [...readPatterns()].sort((a, b) => a.order - b.order);
    },

    pattern(id) {
      const p = readPatterns().find((x) => x.id === id);
      return p ? { ...p, blocks: sortBlocks(p.blocks) } : null;
    },

    /** 特殊日のパターンを追加（copyFrom を指定するとその予定をコピー） */
    addPattern(name, copyFrom = null) {
      const patterns = readPatterns();
      const source = copyFrom ? patterns.find((p) => p.id === copyFrom) : null;
      const pattern = {
        id: uid(),
        name: checkPatternName(name),
        kind: 'special',
        blocks: source ? source.blocks.map((b) => ({ ...b, id: uid() })) : [],
        order: Math.max(0, ...patterns.map((p) => p.order)) + 1,
      };
      writePatterns([...patterns, pattern]);
      return pattern;
    },

    renamePattern(id, name) {
      return mutatePattern(id, (p) => { p.name = checkPatternName(name, id); });
    },

    /** 特殊日だけ削除できる。使っていた曜日・日付は平日／休日に戻す */
    deletePattern(id) {
      const patterns = readPatterns();
      const target = patterns.find((p) => p.id === id);
      if (!target) return;
      if (target.kind !== 'special') throw new Error('平日と休日のパターンは削除できません。');
      const rules = readRules();
      rules.weekdays = rules.weekdays.map((pid, dow) => (pid === id ? (dow === 0 || dow === 6 ? 'holiday' : 'weekday') : pid));
      if (rules.holidayPattern === id) rules.holidayPattern = 'holiday';
      for (const [date, pid] of Object.entries(rules.dates)) if (pid === id) delete rules.dates[date];
      store.set('rules', rules);
      const todos = readTodos().map((t) => ({ ...t, patterns: (t.patterns ?? []).filter((p) => p !== id) }));
      store.set('todos', todos);
      writePatterns(patterns.filter((p) => p.id !== id));
    },

    /** パターンの予定を空にして、別のパターンの予定をコピーする */
    copyBlocks(targetId, sourceId) {
      const source = readPatterns().find((p) => p.id === sourceId);
      if (!source) throw new Error('コピー元のパターンが見つかりません。');
      return mutatePattern(targetId, (p) => { p.blocks = source.blocks.map((b) => ({ ...b, id: uid() })); });
    },

    setBlocks(patternId, blocks) {
      return mutatePattern(patternId, (p) => { p.blocks = blocks.map((b) => ({ id: uid(), ...checkBlock(b) })); });
    },

    // ===== 予定（ブロック） =====

    addBlock(patternId, input) {
      const block = { id: uid(), ...checkBlock(input) };
      mutatePattern(patternId, (p) => { p.blocks.push(block); });
      return block;
    },

    updateBlock(patternId, blockId, input) {
      return mutatePattern(patternId, (p) => {
        const block = p.blocks.find((b) => b.id === blockId);
        if (!block) throw new Error('予定が見つかりません。');
        Object.assign(block, checkBlock({ ...block, ...input }));
      });
    },

    removeBlock(patternId, blockId) {
      return mutatePattern(patternId, (p) => { p.blocks = p.blocks.filter((b) => b.id !== blockId); });
    },

    // ===== 使い分け =====

    rules() {
      return readRules();
    },

    setWeekdayPattern(dow, patternId) {
      const rules = readRules();
      rules.weekdays[dow] = patternId;
      writeRules(rules);
    },

    setHolidayPattern(patternId) {
      const rules = readRules();
      rules.holidayPattern = patternId || null;
      writeRules(rules);
    },

    /** 特定の日のパターンを決める（null で解除＝自動に戻す） */
    setDatePattern(dateKey, patternId) {
      const rules = readRules();
      if (patternId) rules.dates[dateKey] = patternId;
      else delete rules.dates[dateKey];
      writeRules(rules);
    },

    /**
     * その日に使うパターンと、その理由
     * 優先順位：日付の指定 ＞ 祝日 ＞ 曜日
     */
    patternFor(dateKey, { ignoreDate = false } = {}) {
      const rules = readRules();
      const patterns = readPatterns();
      const exists = (id) => patterns.some((p) => p.id === id);
      const holiday = holidayName(dateKey);

      if (!ignoreDate && rules.dates[dateKey] && exists(rules.dates[dateKey])) {
        return { patternId: rules.dates[dateKey], reason: 'date', holiday };
      }
      if (holiday && rules.holidayPattern && exists(rules.holidayPattern)) {
        return { patternId: rules.holidayPattern, reason: 'holiday', holiday };
      }
      const [y, m, d] = dateKey.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      const pid = exists(rules.weekdays[dow]) ? rules.weekdays[dow] : (dow === 0 || dow === 6 ? 'holiday' : 'weekday');
      return { patternId: pid, reason: 'weekday', holiday };
    },

    // ===== Todo =====

    todos() {
      return readTodos();
    },

    /** その日に表示する Todo（その日のパターンで絞り込み、前の日の未完了も持ち越す） */
    todosFor(dateKey) {
      const { patternId } = this.patternFor(dateKey);
      const today = toDateKey();
      return readTodos().filter((t) => {
        if (t.repeat === 'daily') {
          if (t.createdAt && toDateKey(new Date(t.createdAt)) > dateKey) return false; // 作る前の日には出さない
          return !t.patterns?.length || t.patterns.includes(patternId);
        }
        if (t.date === dateKey) return true;
        // 今日を見ているときは、過去の「その日だけ」の未完了を持ち越して表示
        return dateKey === today && !t.done && t.date < today;
      });
    },

    isDone(todo, dateKey) {
      return todo.repeat === 'daily' ? (todo.doneDates ?? []).includes(dateKey) : Boolean(todo.done);
    },

    addTodo(input) {
      const todo = { id: uid(), ...checkTodo(input), doneDates: [], done: false, createdAt: input.createdAt ?? new Date().toISOString() };
      writeTodos([...readTodos(), todo]);
      return todo;
    },

    updateTodo(id, input) {
      const todos = readTodos();
      const todo = todos.find((t) => t.id === id);
      if (!todo) throw new Error('Todo が見つかりません。');
      Object.assign(todo, checkTodo({ ...todo, ...input }));
      writeTodos(todos);
      return todo;
    },

    toggleTodo(id, dateKey) {
      const todos = readTodos();
      const todo = todos.find((t) => t.id === id);
      if (!todo) return;
      if (todo.repeat === 'daily') {
        const set = new Set(todo.doneDates ?? []);
        if (set.has(dateKey)) set.delete(dateKey); else set.add(dateKey);
        todo.doneDates = [...set].sort().slice(-120); // 古い記録は120日分まで
      } else {
        todo.done = !todo.done;
      }
      writeTodos(todos);
    },

    removeTodo(id) {
      writeTodos(readTodos().filter((t) => t.id !== id));
    },

    /** 完了した「その日だけ」の Todo をまとめて消す */
    clearDoneOnce() {
      const before = readTodos();
      const after = before.filter((t) => !(t.repeat === 'once' && t.done));
      writeTodos(after);
      return before.length - after.length;
    },

    pref(key, fallback) { return store.get(`pref.${key}`, fallback); },
    setPref(key, value) { store.set(`pref.${key}`, value); },
  };
}
