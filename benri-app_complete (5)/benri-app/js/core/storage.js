/**
 * データ保存の窓口。アプリ内の保存は必ずここを通します。
 *
 * - キーは「benri:v1:<名前空間>:<キー>」の形で保存（他のサイトのデータと混ざらない）
 * - 値は JSON に変換して保存
 * - プライベートブラウズなどで保存できない環境でも落ちないよう、
 *   失敗したらメモリ上に一時保存する（タブを閉じると消える）
 *
 * 将来サーバーやクラウドに保存したくなったら、このファイルだけ差し替えればOKです。
 */

const PREFIX = 'benri:v1:';
const memory = new Map();

function attempt(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function backend(kind) {
  return attempt(() => (kind === 'session' ? window.sessionStorage : window.localStorage), null);
}

/** このページで覚えている値のうち、指定した名前空間のものを忘れる（データを消した・復元したとき用） */
export function forgetMemory(namespace) {
  const marker = `${PREFIX}${namespace}`;
  for (const key of [...memory.keys()]) if (key.includes(marker)) memory.delete(key);
}

/**
 * @param {string} namespace 例: 'auth', 'u:demo:calendar'
 * @param {{ kind?: 'local' | 'session' }} [options] session にするとタブを閉じたら消える
 */
export function createStore(namespace, { kind = 'local' } = {}) {
  const base = `${PREFIX}${namespace}:`;
  const memKey = (key) => `${kind}|${base}${key}`;

  return {
    get(key, fallback = null) {
      // このページで書いた値（メモリ）を優先。保存に失敗していても最新の値を返せる
      const raw = memory.get(memKey(key)) ?? attempt(() => backend(kind)?.getItem(base + key), null) ?? null;
      if (raw == null) return fallback;
      return attempt(() => JSON.parse(raw), fallback);
    },

    /** @returns {boolean} 端末に保存できたら true（容量オーバーなどで失敗したら false） */
    set(key, value) {
      const raw = JSON.stringify(value);
      memory.set(memKey(key), raw);
      return attempt(() => {
        const target = backend(kind);
        if (!target) return false;
        target.setItem(base + key, raw);
        return true;
      }, false);
    },

    remove(key) {
      memory.delete(memKey(key));
      attempt(() => backend(kind)?.removeItem(base + key));
    },

    /** さらに細かい名前空間を作る（例: store.scope('settings')） */
    scope(sub) {
      return createStore(`${namespace}:${sub}`, { kind });
    },
  };
}
