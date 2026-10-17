import { createStore } from './storage.js';

/**
 * 認証（ブラウザ内で完結する簡易版）。
 *
 * - 新規登録したアカウントは、この端末のブラウザに保存されます
 * - パスワードはそのまま保存せず、PBKDF2（ソルト付き・10万回）でハッシュ化した値だけを保存します
 *
 * ⚠️ それでも「この端末を使う人を分ける」ための仕組みで、サーバーの認証ほど安全ではありません
 *    （端末を触れる人は保存データを消したり書き換えたりできます）。
 *    本格的にするなら Firebase Authentication などに register() / login() の中身を差し替えます。
 *    画面側は register / login / logout / user しか使わないので、差し替えても画面は変更不要です。
 */

/** お試し用の組み込みアカウント（コードに書いてあるので誰でも分かる） */
const BUILT_IN_ACCOUNTS = {
  demo: { password: 'password', displayName: 'デモユーザー' },
  admin: { password: 'admin123', displayName: '管理者' },
};

/** 登録に使えないID */
const RESERVED_IDS = new Set([...Object.keys(BUILT_IN_ACCOUNTS), 'guest', 'root', 'system']);

export const ID_RULE = { min: 3, max: 20, pattern: /^[a-z0-9_-]+$/ };
export const NAME_MAX = 20;
export const PASSWORD_MIN = 8;

const PBKDF2_ITERATIONS = 100_000;

export class AuthError extends Error {
  /** @param {string} message  @param {string} [field] どの入力欄の問題か（'id' | 'name' | 'password'） */
  constructor(message, field) {
    super(message);
    this.field = field;
  }
}

const persistent = createStore('auth');                     // 「ログイン状態を保持」ON のとき
const temporary = createStore('auth', { kind: 'session' }); // OFF のとき（タブを閉じたら消える）

let currentUser = null;
const listeners = new Set();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function emit() {
  for (const fn of listeners) fn(currentUser);
}

// ---------- 登録済みアカウントの保存 ----------

/**
 * @typedef {Object} StoredAccount
 * @property {string} displayName
 * @property {string} salt        Base64
 * @property {string} hash        Base64（PBKDF2-SHA256 の結果）
 * @property {number} iterations
 * @property {string} createdAt
 */

/** @returns {Record<string, StoredAccount>} */
function readAccounts() {
  const value = persistent.get('accounts', {});
  return value && typeof value === 'object' ? value : {};
}

function writeAccounts(accounts) {
  persistent.set('accounts', accounts);
}

// ---------- パスワードのハッシュ化 ----------

const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function hashPassword(password, saltBase64, iterations) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new AuthError('この開き方では登録・ログインできません。https のページ（GitHub Pages や Live Preview）で開いてください。');
  }
  const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(saltBase64), iterations },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

/** 長さに関係なく同じ時間で比べる（タイミングから推測されにくくする） */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- 入力チェック（画面側でも使う） ----------

/** 全角英数字やスペースを半角・小文字にそろえる */
export function normalizeId(id) {
  return String(id ?? '').normalize('NFKC').trim().toLowerCase();
}

/** @returns {string | null} 問題があればメッセージ */
export function validateId(id) {
  const value = normalizeId(id);
  if (!value) return 'ユーザーIDを入力してください。';
  if (value.length < ID_RULE.min || value.length > ID_RULE.max) return `ユーザーIDは${ID_RULE.min}〜${ID_RULE.max}文字にしてください。`;
  if (!ID_RULE.pattern.test(value)) return '使えるのは半角の英小文字・数字・「_」「-」だけです。';
  return null;
}

export function validateName(name) {
  const value = String(name ?? '').trim();
  if (!value) return '表示名を入力してください。';
  if ([...value].length > NAME_MAX) return `表示名は${NAME_MAX}文字以内にしてください。`;
  return null;
}

export function validatePassword(password, id = '') {
  const value = String(password ?? '');
  if (value.length < PASSWORD_MIN) return `パスワードは${PASSWORD_MIN}文字以上にしてください。`;
  if (value.length > 128) return 'パスワードは128文字以内にしてください。';
  if (id && value.toLowerCase() === normalizeId(id)) return 'ユーザーIDと同じパスワードは使えません。';
  return null;
}

/** パスワードの強さ（0〜3）。画面のメーター用 */
export function passwordStrength(password) {
  const value = String(password ?? '');
  if (value.length < PASSWORD_MIN) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  if (value.length >= 12 && kinds >= 3) return 3;
  if (kinds >= 2) return 2;
  return 1;
}

// ---------- 公開する操作 ----------

export const auth = {
  /** @returns {{ id: string, displayName: string, loggedInAt: string } | null} */
  get user() { return currentUser; },
  get isLoggedIn() { return currentUser !== null; },

  /** 前回最後にログインしたID（入力欄の初期値に使う） */
  get lastUserId() { return persistent.get('lastUserId', ''); },

  /** そのIDで新規登録できるか（画面の「使えます／使われています」表示用） */
  isIdAvailable(id) {
    const value = normalizeId(id);
    return !RESERVED_IDS.has(value) && !(value in readAccounts());
  },

  /** 起動時に、保存されたログイン状態を復元する */
  restore() {
    const saved = persistent.get('session') ?? temporary.get('session');
    const exists = saved && (BUILT_IN_ACCOUNTS[saved.id] || readAccounts()[saved.id]);
    currentUser = exists ? saved : null;
    return currentUser;
  },

  /** 新規登録して、そのままログインする */
  async register({ id, displayName, password, remember = true }) {
    const userId = normalizeId(id);
    const idError = validateId(userId);
    if (idError) throw new AuthError(idError, 'id');
    if (!this.isIdAvailable(userId)) throw new AuthError('このユーザーIDはすでに使われています。', 'id');

    const nameError = validateName(displayName);
    if (nameError) throw new AuthError(nameError, 'name');

    const passwordError = validatePassword(password, userId);
    if (passwordError) throw new AuthError(passwordError, 'password');

    const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await hashPassword(password, salt, PBKDF2_ITERATIONS);

    // ハッシュ計算の間に同じIDが登録されていないか、もう一度確認
    const accounts = readAccounts();
    if (userId in accounts) throw new AuthError('このユーザーIDはすでに使われています。', 'id');

    accounts[userId] = {
      displayName: String(displayName).trim(),
      salt,
      hash,
      iterations: PBKDF2_ITERATIONS,
      createdAt: new Date().toISOString(),
    };
    writeAccounts(accounts);

    return this._startSession(userId, accounts[userId].displayName, remember);
  },

  async login(id, password, { remember = true } = {}) {
    const userId = normalizeId(id);
    if (!userId || !password) {
      throw new AuthError('ユーザーIDとパスワードを入力してください。');
    }

    await wait(400); // 通信しているような待ち時間を再現（連打による総当たりも遅くなる）

    const builtIn = BUILT_IN_ACCOUNTS[userId];
    if (builtIn) {
      if (builtIn.password !== password) throw new AuthError('ユーザーIDかパスワードが違います。');
      return this._startSession(userId, builtIn.displayName, remember);
    }

    const account = readAccounts()[userId];
    if (!account) throw new AuthError('ユーザーIDかパスワードが違います。');
    const hash = await hashPassword(password, account.salt, account.iterations);
    if (!safeEqual(hash, account.hash)) throw new AuthError('ユーザーIDかパスワードが違います。');

    return this._startSession(userId, account.displayName, remember);
  },

  logout() {
    currentUser = null;
    persistent.remove('session');
    temporary.remove('session');
    emit();
  },

  /** ログイン状態が変わったら呼ばれる。戻り値を呼ぶと解除 */
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // ---------- アカウント設定 ----------

  /** お試し用の組み込みアカウントなら true（名前・パスワードの変更や削除はできない） */
  isBuiltIn(id = currentUser?.id) {
    return Boolean(id && BUILT_IN_ACCOUNTS[id]);
  },

  /** 表示名を変える */
  updateDisplayName(displayName) {
    if (!currentUser) throw new AuthError('ログインしていません。');
    if (this.isBuiltIn()) throw new AuthError('お試し用のアカウントは変更できません。');
    const error = validateName(displayName);
    if (error) throw new AuthError(error, 'name');
    const accounts = readAccounts();
    const account = accounts[currentUser.id];
    if (!account) throw new AuthError('アカウントが見つかりません。');
    account.displayName = String(displayName).trim();
    writeAccounts(accounts);
    currentUser = { ...currentUser, displayName: account.displayName };
    if (persistent.get('session')) persistent.set('session', currentUser);
    else temporary.set('session', currentUser);
    return currentUser; // 画面の切り替えは不要なので通知（emit）はしない
  },

  /** 今のパスワードを確かめる（登録アカウントのみ） */
  async _verify(password) {
    const account = readAccounts()[currentUser?.id];
    if (!account) throw new AuthError('アカウントが見つかりません。');
    const hash = await hashPassword(String(password ?? ''), account.salt, account.iterations);
    if (!safeEqual(hash, account.hash)) throw new AuthError('今のパスワードが違います。', 'current');
    return account;
  },

  async changePassword(current, next) {
    if (this.isBuiltIn()) throw new AuthError('お試し用のアカウントは変更できません。');
    await this._verify(current);
    const error = validatePassword(next, currentUser.id);
    if (error) throw new AuthError(error, 'password');
    if (current === next) throw new AuthError('今と同じパスワードです。', 'password');
    const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await hashPassword(next, salt, PBKDF2_ITERATIONS);
    const accounts = readAccounts();
    Object.assign(accounts[currentUser.id], { salt, hash, iterations: PBKDF2_ITERATIONS });
    writeAccounts(accounts);
  },

  /** アカウントを削除（データは呼び出し側で消す）してログアウト */
  async deleteAccount(password) {
    if (this.isBuiltIn()) throw new AuthError('お試し用のアカウントは削除できません。');
    await this._verify(password);
    const id = currentUser.id;
    const accounts = readAccounts();
    delete accounts[id];
    writeAccounts(accounts);
    if (persistent.get('lastUserId', '') === id) persistent.remove('lastUserId');
    return id;
  },

  /** @private */
  _startSession(userId, displayName, remember) {
    currentUser = { id: userId, displayName, loggedInAt: new Date().toISOString() };
    (remember ? persistent : temporary).set('session', currentUser);
    (remember ? temporary : persistent).remove('session');
    persistent.set('lastUserId', userId);
    emit();
    return currentUser;
  },
};
