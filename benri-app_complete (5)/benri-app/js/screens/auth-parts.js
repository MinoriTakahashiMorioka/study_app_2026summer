import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { router } from '../core/router.js';

/** ログイン画面と新規登録画面で共通の部品 */

/** ロゴ＋アプリ名＋ひとこと */
export function brandHeader(lead) {
  return h('header', { class: 'brand' },
    h('div', { class: 'brand-mark', 'aria-hidden': 'true' }, h('span'), h('span'), h('span'), h('span')),
    h('h1', {}, '総合便利アプリ'),
    h('p', {}, lead),
  );
}

/** 「はじめての方は 新規登録」のような切り替えリンク */
export function authSwitch(text, linkText, path) {
  return h('p', { class: 'auth-switch' },
    text,
    h('a', {
      href: `#${path}`,
      onClick: (event) => {
        event.preventDefault();
        router.navigate(path, { replace: true });
      },
    }, linkText),
  );
}

/**
 * パスワード入力欄（表示／非表示の切り替えボタンつき）
 * @returns {{ input: HTMLInputElement, row: HTMLElement }}
 */
export function passwordInput({ id, autocomplete, placeholder, enterkeyhint = 'go' }) {
  let visible = false;
  const input = h('input', {
    id,
    type: 'password',
    autocomplete,
    enterkeyhint,
    placeholder,
    autocapitalize: 'none',
    spellcheck: 'false',
  });
  const toggle = h('button', {
    type: 'button',
    class: 'icon-btn',
    'aria-label': 'パスワードを表示',
    'aria-pressed': 'false',
    onClick: () => {
      visible = !visible;
      input.type = visible ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(visible));
      toggle.setAttribute('aria-label', visible ? 'パスワードを隠す' : 'パスワードを表示');
      toggle.replaceChildren(icon(visible ? 'eyeOff' : 'eye'));
    },
  }, icon('eye'));
  return { input, row: h('div', { class: 'input-wrap' }, icon('lock'), input, toggle) };
}

/** 入力欄の下に出す小さなメッセージ（ok: 緑 / error: 赤 / なし: 説明） */
export function setFieldMessage(el, text, kind = '') {
  el.textContent = text ?? '';
  el.dataset.kind = kind;
  el.hidden = !text;
}
