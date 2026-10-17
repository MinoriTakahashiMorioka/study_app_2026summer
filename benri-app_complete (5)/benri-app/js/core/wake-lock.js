/**
 * 画面が自動で暗くならないようにする（タイマー作動中に使う）。
 * 対応していないブラウザや、許可されない環境では何もしません。
 */

let sentinel = null;
let requesting = false;

export async function keepAwake(on) {
  if (on) {
    if (sentinel || requesting || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    requesting = true;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => { sentinel = null; });
    } catch {
      sentinel = null;
    } finally {
      requesting = false;
    }
  } else if (sentinel) {
    const current = sentinel;
    sentinel = null;
    try { await current.release(); } catch { /* すでに解除済み */ }
  }
}
