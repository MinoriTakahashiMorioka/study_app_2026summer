import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import {
  auth, ID_RULE, NAME_MAX, PASSWORD_MIN,
  normalizeId, passwordStrength, validateId, validateName, validatePassword,
} from '../core/auth.js';
import { authSwitch, brandHeader, passwordInput, setFieldMessage } from './auth-parts.js';

const STRENGTH_LABELS = ['', '弱い', 'ふつう', '強い'];

/**
 * 新規登録画面。
 * 登録に成功すると auth がログイン状態の変化を通知し、main.js がハブへ切り替えます。
 */
export function renderSignup(root) {
  let loading = false;
  const touched = new Set(); // 一度触った入力欄だけエラーを出す

  // ---------- 入力欄 ----------

  const idInput = h('input', {
    id: 'signup-id',
    type: 'text',
    autocomplete: 'username',
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'next',
    maxlength: String(ID_RULE.max),
    placeholder: '例: hanako_2026',
    'aria-describedby': 'signup-id-msg',
  });
  const idMsg = h('p', { class: 'field-msg', id: 'signup-id-msg', 'aria-live': 'polite' });

  const nameInput = h('input', {
    id: 'signup-name',
    type: 'text',
    autocomplete: 'nickname',
    enterkeyhint: 'next',
    maxlength: String(NAME_MAX),
    placeholder: '例: はなこ',
    'aria-describedby': 'signup-name-msg',
  });
  const nameMsg = h('p', { class: 'field-msg', id: 'signup-name-msg', 'aria-live': 'polite' });

  const pw = passwordInput({ id: 'signup-password', autocomplete: 'new-password', placeholder: `${PASSWORD_MIN}文字以上`, enterkeyhint: 'next' });
  pw.input.setAttribute('aria-describedby', 'signup-password-msg');
  const meter = h('div', { class: 'strength', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
  const pwMsg = h('p', { class: 'field-msg', id: 'signup-password-msg', 'aria-live': 'polite' });

  const confirm = passwordInput({ id: 'signup-confirm', autocomplete: 'new-password', placeholder: 'もう一度入力', enterkeyhint: 'go' });
  confirm.input.setAttribute('aria-describedby', 'signup-confirm-msg');
  const confirmMsg = h('p', { class: 'field-msg', id: 'signup-confirm-msg', 'aria-live': 'polite' });

  const remember = h('input', { id: 'signup-remember', type: 'checkbox', checked: true });
  const formError = h('div', { class: 'form-error', role: 'alert', hidden: true });

  const submitLabel = h('span', {}, '登録してはじめる');
  const submitBtn = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, submitLabel);

  // ---------- 入力チェック ----------

  function checkId() {
    const error = validateId(idInput.value);
    if (error) {
      setFieldMessage(idMsg, touched.has('id') || idInput.value ? error : '', 'error');
      return false;
    }
    if (!auth.isIdAvailable(idInput.value)) {
      setFieldMessage(idMsg, 'このユーザーIDはすでに使われています。', 'error');
      return false;
    }
    setFieldMessage(idMsg, `「${normalizeId(idInput.value)}」は使えます`, 'ok');
    return true;
  }

  function checkName() {
    const error = validateName(nameInput.value);
    setFieldMessage(nameMsg, error && touched.has('name') ? error : '', 'error');
    return !error;
  }

  function checkPassword() {
    const value = pw.input.value;
    const strength = passwordStrength(value);
    meter.dataset.level = String(strength);
    const error = validatePassword(value, idInput.value);
    if (error && (touched.has('password') || value.length >= PASSWORD_MIN)) {
      setFieldMessage(pwMsg, error, 'error');
    } else if (!error) {
      setFieldMessage(pwMsg, `強さ: ${STRENGTH_LABELS[strength]}${strength < 3 ? '（12文字以上で、大文字・数字・記号をまぜると強くなります）' : ''}`, strength >= 2 ? 'ok' : '');
    } else {
      setFieldMessage(pwMsg, `英字・数字・記号をまぜた${PASSWORD_MIN}文字以上がおすすめです`, '');
    }
    return !error;
  }

  function checkConfirm() {
    const value = confirm.input.value;
    if (!value) {
      setFieldMessage(confirmMsg, touched.has('confirm') ? '確認のため、もう一度入力してください。' : '', 'error');
      return false;
    }
    const same = value === pw.input.value;
    setFieldMessage(confirmMsg, same ? 'パスワードが一致しました' : 'パスワードが一致しません。', same ? 'ok' : 'error');
    return same;
  }

  const fields = [
    ['id', idInput, checkId],
    ['name', nameInput, checkName],
    ['password', pw.input, checkPassword],
    ['confirm', confirm.input, checkConfirm],
  ];

  for (const [key, input, check] of fields) {
    input.addEventListener('input', () => {
      formError.hidden = true;
      check();
      if (key === 'password' && confirm.input.value) checkConfirm();
      if (key === 'id' && pw.input.value) checkPassword(); // 「IDと同じパスワード」の判定を更新
    });
    input.addEventListener('blur', () => {
      if (input.value) touched.add(key);
      check();
    });
  }

  // Enter で次の入力欄へ（日本語変換の確定 Enter は除く）
  const order = [idInput, nameInput, pw.input, confirm.input];
  order.slice(0, -1).forEach((input, i) => {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        order[i + 1].focus();
      }
    });
  });

  // ---------- 送信 ----------

  const setLoading = (value) => {
    loading = value;
    submitBtn.disabled = value;
    submitBtn.setAttribute('aria-busy', String(value));
    submitBtn.replaceChildren(value ? h('span', { class: 'spinner', 'aria-hidden': 'true' }) : submitLabel);
    if (value) submitBtn.append(h('span', { class: 'visually-hidden' }, '登録中'));
  };

  const shake = () => {
    card.classList.remove('is-shaking');
    void card.offsetWidth;
    card.classList.add('is-shaking');
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    for (const [key] of fields) touched.add(key);
    const results = fields.map(([, , check]) => check());
    const firstBad = results.indexOf(false);
    if (firstBad >= 0) {
      fields[firstBad][1].focus();
      shake();
      return;
    }

    setLoading(true);
    try {
      await auth.register({
        id: idInput.value,
        displayName: nameInput.value,
        password: pw.input.value,
        remember: remember.checked,
      });
      // 成功 → 画面は main.js がハブに切り替える
    } catch (error) {
      setLoading(false);
      const target = { id: [idInput, idMsg], name: [nameInput, nameMsg], password: [pw.input, pwMsg] }[error.field];
      if (target) {
        setFieldMessage(target[1], error.message, 'error');
        target[0].focus();
      } else {
        formError.replaceChildren(icon('alert'), h('span', {}, error.message || '登録できませんでした。'));
        formError.hidden = false;
      }
      shake();
    }
  };

  // ---------- 組み立て ----------

  const field = (label, forId, hint, wrap, msg, extra = null) => h('div', { class: 'field' },
    h('label', { class: 'field-label', for: forId }, label, hint && h('span', { class: 'field-hint' }, hint)),
    wrap,
    extra,
    msg,
  );

  const card = h('form', { class: 'login-card', novalidate: true, onSubmit },
    h('h2', { class: 'card-title' }, 'アカウントを作成'),
    field('ユーザーID', 'signup-id', `半角英小文字・数字・_ - で${ID_RULE.min}〜${ID_RULE.max}文字`,
      h('div', { class: 'input-wrap' }, icon('user'), idInput), idMsg),
    field('表示名', 'signup-name', 'ホーム画面のあいさつに使います',
      h('div', { class: 'input-wrap' }, h('span', { class: 'icon name-icon', 'aria-hidden': 'true' }, 'あ'), nameInput), nameMsg),
    field('パスワード', 'signup-password', null, pw.row, pwMsg, meter),
    field('パスワード（確認）', 'signup-confirm', null, confirm.row, confirmMsg),
    h('label', { class: 'remember', for: 'signup-remember' }, remember, 'ログイン状態を保持する'),
    formError,
    submitBtn,
    h('p', { class: 'privacy-note' }, 'アカウントとデータは、この端末のブラウザの中だけに保存されます。パスワードはそのまま保存せず、元に戻せない形（ハッシュ）に変換して保存します。'),
  );

  const screen = h('div', { class: 'screen screen-login' },
    h('div', { class: 'login' },
      brandHeader('アカウントを作って、すぐに使いはじめられます。'),
      card,
      authSwitch('すでにアカウントをお持ちの方は ', 'ログイン', '/login'),
    ),
  );

  root.replaceChildren(screen);
  checkPassword();
  idInput.focus({ preventScroll: true });
}
