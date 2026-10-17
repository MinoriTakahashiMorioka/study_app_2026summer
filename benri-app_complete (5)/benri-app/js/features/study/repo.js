import { uid } from '../../models/schema.js';
import { dateKeyOf } from './format.js';

/**
 * 勉強機能のデータ操作（Todo・学習記録・画面の設定）。
 * 画面側はここの関数だけを使い、保存のことは気にしません。
 *
 * Todo は「親のID（parentId）」を持つ平らな配列で保存しています。
 *   宿題完了       parentId: null
 *    ├ 数学の課題  parentId: 宿題完了のID
 *    └ 国語の課題  parentId: 宿題完了のID
 *
 * 完了状態のルール
 *   - 親をチェック → 子孫もすべて完了 / 外すと子孫もすべて未完了
 *   - 子が全部完了 → 親も自動で完了。1つでも未完了になれば親も未完了
 *
 * @param {ReturnType<import('../../core/storage.js').createStore>} store
 */
export function createStudyRepo(store) {
  const listeners = new Set();
  const emit = () => { for (const fn of [...listeners]) fn(); };

  // ---------- 読み書き ----------

  const readList = (key) => {
    const value = store.get(key, []);
    return Array.isArray(value) ? value : [];
  };

  /** @returns {import('../../models/schema.js').StudyTask[]} */
  const readTasks = () => readList('tasks');
  const writeTasks = (tasks) => { store.set('tasks', tasks); emit(); };

  /** @returns {import('../../models/schema.js').StudySession[]} */
  const readSessions = () => readList('sessions');
  const writeSessions = (sessions) => { store.set('sessions', sessions); emit(); };

  // ---------- Todo の補助 ----------

  const byOrder = (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt);
  const parentOf = (task) => task.parentId ?? null;

  function checkTitle(title) {
    const value = String(title ?? '').trim();
    if (!value) throw new Error('タスク名を入力してください。');
    if ([...value].length > 80) throw new Error('タスク名は80文字以内にしてください。');
    return value;
  }

  function descendantIds(tasks, id) {
    const result = [];
    const stack = [id];
    while (stack.length) {
      const current = stack.pop();
      for (const task of tasks) {
        if (task.parentId === current) {
          result.push(task.id);
          stack.push(task.id);
        }
      }
    }
    return result;
  }

  /** parentId から上にたどって「子が全部完了なら完了」を反映する */
  function recomputeAncestors(tasks, parentId) {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    let currentId = parentId;
    while (currentId) {
      const parent = byId.get(currentId);
      if (!parent) break;
      const children = tasks.filter((t) => t.parentId === currentId);
      if (children.length > 0) parent.done = children.every((c) => c.done);
      currentId = parent.parentId;
    }
  }

  // ---------- 学習記録の補助 ----------

  function checkSession(input) {
    const minutes = Math.round(Number(input.minutes));
    if (!Number.isFinite(minutes) || minutes < 1) throw new Error('勉強した時間を1分以上で入力してください。');
    if (minutes > 720) throw new Error('1回の記録は720分（12時間）までです。');
    const started = new Date(input.startedAt);
    if (Number.isNaN(started.getTime())) throw new Error('日付と時刻を入力してください。');
    const subject = String(input.subject ?? '').trim();
    if ([...subject].length > 40) throw new Error('内容は40文字以内にしてください。');
    return {
      startedAt: started.toISOString(),
      minutes,
      subject,
      note: String(input.note ?? '').trim().slice(0, 500),
      source: input.source === 'pomodoro' ? 'pomodoro' : 'manual',
    };
  }

  // ---------- 公開する操作 ----------

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // ===== Todo =====

    tasks() {
      return readTasks();
    },

    task(id) {
      return readTasks().find((t) => t.id === id) ?? null;
    },

    childrenOf(parentId = null) {
      return readTasks().filter((t) => parentOf(t) === parentId).sort(byOrder);
    },

    /** 親から順に並べたタイトル（「宿題完了 › 数学の課題」の表示用） */
    pathOf(id) {
      const byId = new Map(readTasks().map((t) => [t.id, t]));
      const path = [];
      let current = byId.get(id);
      while (current) {
        path.unshift(current.title);
        current = byId.get(current.parentId);
      }
      return path;
    },

    addTask(title, parentId = null) {
      const tasks = readTasks();
      if (parentId && !tasks.some((t) => t.id === parentId)) throw new Error('親タスクが見つかりません。');
      const siblings = tasks.filter((t) => parentOf(t) === parentId);
      const task = {
        id: uid(),
        title: checkTitle(title),
        done: false,
        parentId,
        order: Math.max(-1, ...siblings.map((s) => s.order)) + 1,
        collapsed: false,
        createdAt: new Date().toISOString(),
      };
      tasks.push(task);
      const parent = tasks.find((t) => t.id === parentId);
      if (parent) parent.collapsed = false; // 追加したら親を開く
      recomputeAncestors(tasks, parentId);   // 完了済みの親に子を足したら親は未完了に戻る
      writeTasks(tasks);
      return task;
    },

    renameTask(id, title) {
      const tasks = readTasks();
      const task = tasks.find((t) => t.id === id);
      if (!task) throw new Error('タスクが見つかりません。');
      task.title = checkTitle(title);
      writeTasks(tasks);
      return task;
    },

    toggleTask(id, done) {
      const tasks = readTasks();
      const target = tasks.find((t) => t.id === id);
      if (!target) return;
      const affected = new Set([id, ...descendantIds(tasks, id)]);
      for (const task of tasks) if (affected.has(task.id)) task.done = done;
      recomputeAncestors(tasks, target.parentId);
      writeTasks(tasks);
    },

    setCollapsed(id, collapsed) {
      const tasks = readTasks();
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      task.collapsed = collapsed;
      writeTasks(tasks);
    },

    /** タスクと子孫をまとめて削除。消した件数を返す */
    deleteTask(id) {
      const tasks = readTasks();
      const target = tasks.find((t) => t.id === id);
      if (!target) return 0;
      const removed = new Set([id, ...descendantIds(tasks, id)]);
      const rest = tasks.filter((t) => !removed.has(t.id));
      recomputeAncestors(rest, target.parentId);
      writeTasks(rest);
      return removed.size;
    },

    countDescendants(id) {
      return descendantIds(readTasks(), id).length;
    },

    // ===== 学習記録 =====

    /** 新しい順 */
    sessions() {
      return [...readSessions()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    },

    addSession(input) {
      const session = { id: uid(), ...checkSession(input) };
      writeSessions([...readSessions(), session]);
      return session;
    },

    updateSession(id, input) {
      const sessions = readSessions();
      const index = sessions.findIndex((s) => s.id === id);
      if (index < 0) throw new Error('記録が見つかりません。');
      sessions[index] = { ...sessions[index], ...checkSession({ ...sessions[index], ...input }) };
      writeSessions(sessions);
      return sessions[index];
    },

    deleteSession(id) {
      writeSessions(readSessions().filter((s) => s.id !== id));
    },

    /** 日付ごとの合計分数 @returns {Map<string, number>} */
    minutesByDay() {
      const totals = new Map();
      for (const s of readSessions()) {
        const key = dateKeyOf(s.startedAt);
        totals.set(key, (totals.get(key) ?? 0) + s.minutes);
      }
      return totals;
    },

    /** 入力候補：最近記録した内容 ＋ 未完了のタスク名 */
    subjectSuggestions(limit = 12) {
      const names = [];
      for (const s of this.sessions()) if (s.subject && !names.includes(s.subject)) names.push(s.subject);
      for (const t of readTasks()) if (!t.done && !names.includes(t.title)) names.push(t.title);
      return names.slice(0, limit);
    },

    // ===== 画面の設定（開いていたタブなど。変更しても描き直しはしない） =====

    pref(key, fallback) {
      return store.get(`pref.${key}`, fallback);
    },

    setPref(key, value) {
      store.set(`pref.${key}`, value);
    },
  };
}
