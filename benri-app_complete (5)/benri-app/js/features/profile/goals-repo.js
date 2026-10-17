import { uid, toDateKey } from '../../models/schema.js';

/**
 * 目標のデータ。
 *
 * @typedef {Object} Milestone      ロードマップの1ステップ
 * @property {string} id
 * @property {string} text          例: 「模試で7割以上」
 * @property {string | null} due    'YYYY-MM-DD'（いつまでに）
 * @property {boolean} done
 * @property {string | null} doneAt ISO 文字列
 *
 * @typedef {Object} Goal
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {'deadline' | 'lifetime'} kind   期限つき / 一生の目標
 * @property {string | null} deadline         'YYYY-MM-DD'（kind が deadline のとき）
 * @property {string} conditions               達成の条件メモ（「〇日までに〇割取れていれば合格の可能性が高い」など）
 * @property {'auto' | 'manual'} progressMode  達成率：ロードマップから自動 / 手動
 * @property {number} manualProgress           手動のときの達成率（0〜100）
 * @property {Milestone[]} milestones
 * @property {string} createdAt
 * @property {string | null} completedAt
 */

export const GOAL_KINDS = { deadline: '期限つき', lifetime: '一生の目標' };

/** 達成率（0〜100） */
export function progressOf(goal) {
  if (goal.completedAt) return 100;
  if (goal.progressMode === 'manual') return Math.max(0, Math.min(100, Math.round(goal.manualProgress ?? 0)));
  const total = goal.milestones.length;
  return total ? Math.round((goal.milestones.filter((m) => m.done).length / total) * 100) : 0;
}

/** ロードマップの並び：期日の近い順（期日なしは最後）→ 追加順 */
export function sortMilestones(milestones) {
  return milestones
    .map((m, index) => ({ m, index }))
    .sort((a, b) => {
      if (a.m.due && b.m.due) return a.m.due.localeCompare(b.m.due) || a.index - b.index;
      if (a.m.due) return -1;
      if (b.m.due) return 1;
      return a.index - b.index;
    })
    .map(({ m }) => m);
}

/** @param {ReturnType<import('../../core/storage.js').createStore>} store */
export function createGoalsRepo(store) {
  const listeners = new Set();
  const emit = () => { for (const fn of [...listeners]) fn(); };

  /** @returns {Goal[]} */
  const read = () => {
    const value = store.get('goals', []);
    return Array.isArray(value) ? value : [];
  };
  const write = (goals) => { store.set('goals', goals); emit(); };

  function checkGoal(input) {
    const title = String(input.title ?? '').trim();
    if (!title) throw new Error('目標を入力してください。');
    if ([...title].length > 60) throw new Error('目標は60文字以内にしてください。');
    const kind = input.kind === 'deadline' ? 'deadline' : 'lifetime';
    const deadline = kind === 'deadline' ? (input.deadline || '') : null;
    if (kind === 'deadline' && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new Error('いつまでに達成したいか、日付を選んでください。');
    return { title, kind, deadline, description: String(input.description ?? '').trim().slice(0, 500) };
  }

  function checkMilestone(input) {
    const text = String(input.text ?? '').trim();
    if (!text) throw new Error('ステップの内容を入力してください。');
    if ([...text].length > 80) throw new Error('ステップは80文字以内にしてください。');
    const due = input.due || null;
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error('日付の形式が正しくありません。');
    return { text, due };
  }

  /** 1つの目標を書き換えて保存する */
  function mutate(id, fn) {
    const goals = read();
    const goal = goals.find((g) => g.id === id);
    if (!goal) throw new Error('目標が見つかりません。');
    fn(goal);
    write(goals);
    return goal;
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    all() { return read(); },

    get(id) { return read().find((g) => g.id === id) ?? null; },

    /** 取り組み中：期限つき（期限の近い順）→ 一生の目標（追加順） */
    active() {
      const goals = read().filter((g) => !g.completedAt);
      const withDeadline = goals.filter((g) => g.kind === 'deadline')
        .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.createdAt.localeCompare(b.createdAt));
      const lifetime = goals.filter((g) => g.kind !== 'deadline')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return { withDeadline, lifetime };
    },

    /** 完了済み：新しく完了した順 */
    completed() {
      return read().filter((g) => g.completedAt).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    },

    add(input) {
      const goal = {
        id: uid(),
        ...checkGoal(input),
        conditions: '',
        progressMode: 'auto',
        manualProgress: 0,
        milestones: [],
        createdAt: input.createdAt ?? new Date().toISOString(),
        completedAt: null,
      };
      write([...read(), goal]);
      return goal;
    },

    update(id, input) {
      return mutate(id, (goal) => Object.assign(goal, checkGoal({ ...goal, ...input })));
    },

    /** 条件メモ・達成率など、入力チェックのいらない項目の更新 */
    patch(id, patch) {
      const allowed = ['conditions', 'progressMode', 'manualProgress'];
      return mutate(id, (goal) => {
        for (const key of allowed) if (key in patch) goal[key] = patch[key];
        if (typeof goal.conditions === 'string') goal.conditions = goal.conditions.slice(0, 2000);
      });
    },

    remove(id) {
      write(read().filter((g) => g.id !== id));
    },

    complete(id) {
      return mutate(id, (goal) => { goal.completedAt = new Date().toISOString(); });
    },

    reopen(id) {
      return mutate(id, (goal) => { goal.completedAt = null; });
    },

    // ----- ロードマップ -----

    addMilestone(goalId, input) {
      const milestone = { id: uid(), ...checkMilestone(input), done: false, doneAt: null };
      mutate(goalId, (goal) => { goal.milestones.push(milestone); });
      return milestone;
    },

    updateMilestone(goalId, milestoneId, input) {
      return mutate(goalId, (goal) => {
        const m = goal.milestones.find((x) => x.id === milestoneId);
        if (!m) throw new Error('ステップが見つかりません。');
        Object.assign(m, checkMilestone({ ...m, ...input }));
      });
    },

    toggleMilestone(goalId, milestoneId) {
      return mutate(goalId, (goal) => {
        const m = goal.milestones.find((x) => x.id === milestoneId);
        if (!m) return;
        m.done = !m.done;
        m.doneAt = m.done ? new Date().toISOString() : null;
      });
    },

    removeMilestone(goalId, milestoneId) {
      return mutate(goalId, (goal) => { goal.milestones = goal.milestones.filter((m) => m.id !== milestoneId); });
    },

    pref(key, fallback) { return store.get(`pref.${key}`, fallback); },
    setPref(key, value) { store.set(`pref.${key}`, value); },
  };
}

/** 期限までの残り日数（マイナスは過ぎた日数） */
export function daysLeft(deadline, today = toDateKey()) {
  const [ay, am, ad] = today.split('-').map(Number);
  const [by, bm, bd] = deadline.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/** 「あと23日」「今日まで」「5日過ぎています」と、その緊急度 */
export function deadlineStatus(deadline) {
  const days = daysLeft(deadline);
  if (days < 0) return { text: `期限を${-days}日過ぎています`, level: 'over', days };
  if (days === 0) return { text: '今日まで', level: 'soon', days };
  if (days <= 14) return { text: `あと${days}日`, level: 'soon', days };
  return { text: `あと${days}日`, level: 'normal', days };
}
