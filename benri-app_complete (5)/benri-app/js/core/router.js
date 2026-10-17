/**
 * URL の「#」以降で画面を切り替えるルーター。
 *
 *   #/login          → ログイン
 *   #/hub            → ハブ
 *   #/app/calendar   → カレンダー機能
 *
 * 「#」方式にしておくと、GitHub Pages などの静的ホスティングでも
 * サーバー設定なしでブラウザの「戻る」やリロードが正しく動きます。
 *
 * 各画面の描画関数は「後片付け関数」を返せます。
 * 画面を離れるときに自動で呼ばれるので、タイマーやイベントの解除に使います
 * （ステップ3のポモドーロタイマーで重要になります）。
 */

const routes = [];
let guard = null;
let currentPath = null;
let cleanup = null;

function readHash() {
  const raw = (() => {
    try { return decodeURIComponent(window.location.hash.slice(1)); } catch { return ''; }
  })();
  return raw.startsWith('/') ? raw : '';
}

function render(path) {
  const redirect = guard?.(path);
  if (redirect && redirect !== path) {
    navigate(redirect, { replace: true });
    return;
  }
  if (path === currentPath) return;

  const route = routes.find((r) => r.pattern.test(path));
  if (!route) {
    navigate('/hub', { replace: true });
    return;
  }

  // 前の画面の後片付け
  try { cleanup?.(); } catch (error) { console.error(error); }
  cleanup = null;
  currentPath = path;

  const params = path.match(route.pattern).slice(1);
  const result = route.render(...params);
  cleanup = typeof result === 'function' ? result : null;
}

function navigate(path, { replace = false } = {}) {
  const from = currentPath;
  try {
    const url = `#${path}`;
    if (replace) window.history.replaceState({ from }, '', url);
    else if (window.location.hash !== url) window.history.pushState({ from }, '', url);
  } catch {
    // 履歴を操作できない環境でも画面は切り替える
  }
  render(path);
}

export const router = {
  /** @param {RegExp} pattern  @param {(...params: string[]) => (void | (() => void))} renderFn */
  add(pattern, renderFn) {
    routes.push({ pattern, render: renderFn });
  },

  /** 画面を出す前に呼ばれる。別の画面へ飛ばしたいときはそのパスを返す */
  setGuard(fn) {
    guard = fn;
  },

  navigate,

  /** 直前の画面が `path` なら「戻る」、そうでなければ `path` へ移動 */
  back(path) {
    if (window.history.state?.from === path) window.history.back();
    else navigate(path, { replace: true });
  },

  get path() { return currentPath; },

  start(defaultPath = '/hub') {
    window.addEventListener('popstate', () => render(readHash() || defaultPath));
    window.addEventListener('hashchange', () => render(readHash() || defaultPath));
    render(readHash() || defaultPath);
  },
};
