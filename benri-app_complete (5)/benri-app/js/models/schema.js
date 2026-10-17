/**
 * アプリで保存するデータの形（ステップ2・3で使います）。
 *
 * 保存場所: localStorage
 *   benri:v1:u:<ユーザーID>:calendar:labels    → Label[]
 *   benri:v1:u:<ユーザーID>:calendar:events    → CalendarEvent[]
 *   benri:v1:u:<ユーザーID>:study:tasks        → StudyTask[]
 *   benri:v1:u:<ユーザーID>:study:sessions     → StudySession[]
 *   benri:v1:u:<ユーザーID>:study:settings     → { lastMinutes: number }
 */

/**
 * カレンダーのラベル。デフォルトもカスタムも同じ形で、isDefault で区別する。
 * @typedef {Object} Label
 * @property {string} id
 * @property {string} name
 * @property {string} color      '#RRGGBB'
 * @property {boolean} isDefault  true なら削除不可
 * @property {number} order       並び順
 */

/**
 * カレンダーの予定。
 * 日付と時間は「端末の現地時刻の文字列」で別々に持つ。
 * （JavaScript の Date は UTC に変換されて日付が1日ずれる事故が起きやすいため）
 * @typedef {Object} CalendarEvent
 * @property {string} id
 * @property {string} title
 * @property {string} date          'YYYY-MM-DD'
 * @property {string | null} time   'HH:MM'（null なら終日）
 * @property {string | null} labelId
 * @property {string} memo
 * @property {string} createdAt     ISO 文字列
 * @property {string} updatedAt     ISO 文字列
 */

/**
 * 木構造の Todo。入れ子のオブジェクトではなく「親のID」を持つ平らな配列で保存する。
 * こうすると、どの階層のタスクでも id だけで探して更新・削除できる。
 *
 *   { id:'a', title:'宿題完了',   parentId:null }
 *   { id:'b', title:'数学の課題', parentId:'a' }
 *   { id:'c', title:'国語の課題', parentId:'a' }
 *
 * @typedef {Object} StudyTask
 * @property {string} id
 * @property {string} title
 * @property {boolean} done
 * @property {string | null} parentId
 * @property {number} order
 * @property {boolean} collapsed  子タスクを閉じているか
 * @property {string} createdAt
 */

/**
 * 勉強時間の記録。ポモドーロの自動記録と手入力を source で区別する。
 * @typedef {Object} StudySession
 * @property {string} id
 * @property {string} startedAt   ISO 文字列
 * @property {number} minutes
 * @property {string} subject
 * @property {string} note
 * @property {'pomodoro' | 'manual'} source
 */

/** 初回に用意するカレンダーのラベル */
export const DEFAULT_LABELS = [
  { id: 'work',     name: '仕事',         color: '#2F6FD6', isDefault: true, order: 0 },
  { id: 'private',  name: 'プライベート', color: '#2E9B5F', isDefault: true, order: 1 },
  { id: 'study',    name: '勉強',         color: '#7A4FC9', isDefault: true, order: 2 },
  { id: 'important', name: '重要',        color: '#D23B2A', isDefault: true, order: 3 },
];

/**
 * 勉強機能の設定類（タイマーの状態・前回の分数・開いていたタブ）も
 *   benri:v1:u:<ユーザーID>:study:timer / :lastMinutes / :pref.tab などに保存する
 */

/** ポモドーロのプリセット（分） */
export const POMODORO_PRESETS = [5, 15, 25, 45];

/** 一意なIDを作る */
export function uid() {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 端末の現地時刻で 'YYYY-MM-DD' を返す */
export function toDateKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
