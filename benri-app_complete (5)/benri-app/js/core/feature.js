/**
 * 機能（ミニアプリ）の定義ルール。
 *
 * 各機能は features/<名前>/index.js で defineFeature({...}) を export default します。
 *
 * @typedef {Object} FeatureContext
 * @property {{ id: string, displayName: string }} user  ログイン中のユーザー
 * @property {ReturnType<import('./storage.js').createStore>} store
 *           この機能・このユーザー専用の保存領域（他の機能やユーザーと混ざらない）
 * @property {(path: string) => void} navigate  画面遷移
 * @property {HTMLElement} [toolbar] 上部バー右側の置き場（mount のときだけ渡される）
 * @property {string} [subpath]  機能の中の画面パス（#/app/profile/goals/abc → 'goals/abc'）
 * @property {(sub?: string, options?: {replace?: boolean}) => void} [go]  機能の中の画面へ移動
 * @property {(sub?: string) => void} [back]  機能の中の前の画面へ戻る
 *
 * @typedef {Object} Feature
 * @property {string} id         URL にも使う英小文字のID（例: 'calendar' → #/app/calendar）
 * @property {string} title      表示名
 * @property {string} [subtitle] カードの説明文
 * @property {string} icon       icons.js のアイコン名
 * @property {string} color      カードのアイコン色（ライト/ダーク両方で白文字が読める濃さ）
 * @property {string[]} [keywords] 検索用の別名
 * @property {(ctx: FeatureContext) => string | null} [summary]
 *           ハブのカード下部に出す一言（例: 「今日の予定 2件」）
 * @property {(root: HTMLElement, ctx: FeatureContext) => (void | (() => void))} mount
 *           画面を描画する。後片付け関数を返すと画面を離れるときに呼ばれる
 */

const REQUIRED = ['id', 'title', 'icon', 'color', 'mount'];

/** @param {Feature} definition */
export function defineFeature(definition) {
  for (const key of REQUIRED) {
    if (!definition[key]) {
      throw new Error(`機能「${definition.id ?? '?'}」に ${key} が設定されていません`);
    }
  }
  if (!/^[a-z0-9-]+$/.test(definition.id)) {
    throw new Error(`機能IDは英小文字・数字・ハイフンのみ使えます: ${definition.id}`);
  }
  return Object.freeze({ subtitle: '', keywords: [], summary: null, ...definition });
}

/** 検索文字列に一致するか（大文字小文字・全角半角の違いを無視） */
export function matchesFeature(feature, query) {
  const normalize = (s) => s.normalize('NFKC').toLowerCase();
  const q = normalize(query.trim());
  if (!q) return true;
  return [feature.title, feature.subtitle, ...feature.keywords].some((text) => normalize(text).includes(q));
}
