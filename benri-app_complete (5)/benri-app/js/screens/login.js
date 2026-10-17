import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { auth } from '../core/auth.js';
import { authSwitch } from './auth-parts.js';

/**
 * ログイン画面。
 * ログインに成功すると auth が変化を通知し、main.js がハブへ切り替えます。
 */
export function renderLogin(root) {
  let loading = false;
  let passwordVisible = false;

  // ---------- 入力欄 ----------

  const idInput = h('input', {
    id: 'login-id',
    name: 'username',
    type: 'text',
    autocomplete: 'username',
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'next',
    placeholder: '例: demo',
    value: auth.lastUserId,
  });

  const pwInput = h('input', {
    id: 'login-password',
    name: 'password',
    type: 'password',
    autocomplete: 'current-password',
    enterkeyhint: 'go',
    placeholder: 'パスワード',
  });

  const pwToggle = h('button', {
    type: 'button',
    class: 'icon-btn',
    'aria-label': 'パスワードを表示',
    'aria-pressed': 'false',
    onClick: () => {
      passwordVisible = !passwordVisible;
      pwInput.type = passwordVisible ? 'text' : 'password';
      pwToggle.setAttribute('aria-pressed', String(passwordVisible));
      pwToggle.setAttribute('aria-label', passwordVisible ? 'パスワードを隠す' : 'パスワードを表示');
      pwToggle.replaceChildren(icon(passwordVisible ? 'eyeOff' : 'eye'));
    },
  }, icon('eye'));

  const remember = h('input', { id: 'login-remember', type: 'checkbox', checked: true });

  const errorBox = h('div', { class: 'form-error', role: 'alert', hidden: true });

  const submitLabel = h('span', {}, 'ログイン');
  const submitBtn = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, submitLabel);

  // ---------- 動き ----------

  const showError = (message) => {
    errorBox.replaceChildren(icon('alert'), h('span', {}, message));
    errorBox.hidden = false;
    card.classList.remove('is-shaking');
    void card.offsetWidth; // アニメーションを毎回やり直すため
    card.classList.add('is-shaking');
  };

  const clearError = () => { errorBox.hidden = true; };

  const setLoading = (value) => {
    loading = value;
    submitBtn.disabled = value;
    submitBtn.setAttribute('aria-busy', String(value));
    submitBtn.replaceChildren(value ? h('span', { class: 'spinner', 'aria-hidden': 'true' }) : submitLabel);
    if (value) submitBtn.append(h('span', { class: 'visually-hidden' }, 'ログイン中'));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    clearError();
    setLoading(true);
    try {
      await auth.login(idInput.value, pwInput.value, { remember: remember.checked });
      // 成功 → 画面は main.js が切り替える
    } catch (error) {
      setLoading(false);
      showError(error.message || 'ログインできませんでした。');
      pwInput.select();
      pwInput.focus();
    }
  };

  idInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      pwInput.focus();
    }
  });
  idInput.addEventListener('input', clearError);
  pwInput.addEventListener('input', clearError);

  // ---------- 組み立て ----------

  const card = h('form', { class: 'login-card', novalidate: true, onSubmit },
    h('div', { class: 'field' },
      h('label', { class: 'field-label', for: 'login-id' }, 'ユーザーID'),
      h('div', { class: 'input-wrap' }, icon('user'), idInput),
    ),
    h('div', { class: 'field' },
      h('label', { class: 'field-label', for: 'login-password' }, 'パスワード'),
      h('div', { class: 'input-wrap' }, icon('lock'), pwInput, pwToggle),
    ),
    h('label', { class: 'remember', for: 'login-remember' }, remember, 'ログイン状態を保持する'),
    errorBox,
    submitBtn,
  );

  const demo = h('div', { class: 'demo' },
    h('span', {}, 'お試し用 ', h('code', {}, 'demo'), ' / ', h('code', {}, 'password')),
    h('button', {
      type: 'button',
      onClick: () => {
        idInput.value = 'demo';
        pwInput.value = 'password';
        clearError();
        submitBtn.focus();
      },
    }, '入力する'),
  );

  const screen = h('div', { class: 'screen screen-login' },
    h('div', { class: 'login' },
      h('header', { class: 'brand' },
        h('div', { class: 'brand-mark', 'aria-hidden': 'true' }, h('span'), h('span'), h('span'), h('span')),
        h('h1', {}, '総合便利アプリ'),
        h('p', {}, 'カレンダーも勉強も、ひとつのアプリで。'),
      ),
      card,
      authSwitch('はじめての方は ', '新規登録', '/signup'),
      demo,
    ),
  );

  root.replaceChildren(screen);
  (idInput.value ? pwInput : idInput).focus({ preventScroll: true });
}
