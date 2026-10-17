import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { openSheet } from '../../core/sheet.js';
import { showToast } from '../../core/toast.js';
import { toDateKey } from '../../models/schema.js';
import { ACCOUNTS, GROUPS, sideOf } from './accounts.js';
import { balanceText, MAX_AMOUNT, parseAmount, yen } from './money.js';
import { CONTENT_MAX } from './repo.js';
import { groupedRows, ledgerHead, ledgerRow, openingRow, withWhen } from './ledger.js';

/**
 * 追加入力モード
 *  - 画面の下に、帳簿と同じ並び（年月日・内容・勘定科目・入金・出金・残高）の入力行が固定されている
 *  - 入金・出金を入れると、右端の残高がその場で計算される
 *  - 帳簿の行をタップすると、その行を入力行に読み込んで直せる
 */
export function mountInputView(root, { repo, openHelp, setHelpFocus }) {
  let editingId = null;

  // ---------- 入力行 ----------
  const dateInput = h('input', { id: 'cb-date', class: 'text-input', type: 'date', value: toDateKey(), 'aria-label': '年月日（なくても可）' });
  const contentInput = h('input', {
    id: 'cb-content', class: 'text-input', type: 'text', maxlength: String(CONTENT_MAX * 2),
    placeholder: '例: 昼ごはん', autocomplete: 'off', 'aria-label': '内容（必須）', enterKeyHint: 'next',
  });
  const accountSelect = h('select', { id: 'cb-account', class: 'text-input', 'aria-label': '勘定科目（なくても可）' },
    h('option', { value: '' }, '科目なし'),
    GROUPS.map((g) => h('optgroup', { label: g.label },
      ACCOUNTS.filter((a) => a.kind === g.kind).map((a) => h('option', { value: a.id }, a.name)))),
  );
  const amountInput = (id, label) => h('input', {
    id, class: 'text-input cb-amount', type: 'text', inputmode: 'numeric', placeholder: '0',
    autocomplete: 'off', 'aria-label': label, enterKeyHint: 'done',
  });
  const incomeInput = amountInput('cb-income', '入金（円）');
  const expenseInput = amountInput('cb-expense', '出金（円）');
  const balanceOut = h('output', { class: 'cb-preview', for: 'cb-income cb-expense', 'aria-live': 'polite' });

  const formTitle = h('p', { class: 'cb-entry-title' });
  const error = h('p', { class: 'form-error cb-entry-error', role: 'alert', hidden: true });
  const actions = h('div', { class: 'cb-entry-actions' });

  const field = (label, control, { hint, cls } = {}) => h('label', { class: `cb-field ${cls ?? ''}` },
    h('span', { class: 'cb-field-label' }, label, hint && h('small', {}, hint)),
    control);

  const form = h('form', { class: 'cb-entry', novalidate: true, 'aria-label': '帳簿に書く' },
    formTitle,
    h('div', { class: 'cb-entry-grid' },
      field('年月日', dateInput, { hint: '任意', cls: 'cb-f-date' }),
      field('内容', contentInput, { hint: '必須', cls: 'cb-f-content' }),
      field('勘定科目', accountSelect, { hint: '任意', cls: 'cb-f-account' }),
      field('入金', incomeInput, { cls: 'cb-f-in' }),
      field('出金', expenseInput, { cls: 'cb-f-out' }),
      h('div', { class: 'cb-field cb-f-bal' }, h('span', { class: 'cb-field-label' }, '残高', h('small', {}, '自動')), balanceOut),
    ),
    error,
    actions,
  );

  // ---------- 帳簿 ----------
  const balanceNow = h('strong', {});
  const sortBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', hidden: true, onClick: sortByDate }, icon('sort'), '日付順に並べ替え');
  const table = h('div', { class: 'cb-ledger', role: 'table', 'aria-label': '金銭出納帳' });

  root.append(
    h('div', { class: 'cb-statusbar' },
      h('p', { class: 'cb-now' }, h('span', {}, '現在の残高'), balanceNow),
      sortBtn,
    ),
    table,
    form,
  );

  function renderLedger() {
    const rows = withWhen(repo.ledger());
    const now = repo.balance();
    balanceNow.textContent = `¥${balanceText(now)}`;
    balanceNow.dataset.negative = String(now < 0);
    sortBtn.hidden = !repo.isOutOfOrder();
    table.replaceChildren(...[
      ledgerHead(),
      openingRow(repo.opening(), { onEdit: editOpening }),
      ...groupedRows(rows, (row) => ledgerRow(row, {
        attrs: {
          tabindex: '0',
          class: `cb-row is-clickable${row.id === editingId ? ' is-editing' : ''}`,
          'aria-label': `${row.content}の行を直す`,
          onClick: () => startEdit(row.id),
          onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(row.id); } },
        },
      })),
      rows.length === 0 && h('div', { class: 'cb-empty', role: 'row' },
        h('span', { role: 'cell' }, icon('wallet'), 'まだ何も書いていません。下の入力行に内容と金額を入れて「追加」を押してください。')),
    ].filter(Boolean));
  }

  // ---------- 入力行の状態 ----------
  /** 入金・出金欄を読む（エラーなら欄に印をつける） */
  function readAmounts() {
    const out = {};
    for (const [key, input] of [['income', incomeInput], ['expense', expenseInput]]) {
      try {
        out[key] = parseAmount(input.value);
        input.removeAttribute('aria-invalid');
      } catch (err) {
        out[key] = undefined;
        out.error = err.message;
        input.setAttribute('aria-invalid', 'true');
      }
    }
    return out;
  }

  function updatePreview() {
    const { income, expense } = readAmounts();
    const before = editingId ? repo.balanceBefore(editingId) : repo.balance();
    const after = before + (income ?? 0) - (expense ?? 0);
    balanceOut.textContent = balanceText(after);
    balanceOut.dataset.negative = String(after < 0);
    balanceOut.dataset.changed = String((income ?? 0) !== 0 || (expense ?? 0) !== 0);
  }

  function renderForm() {
    form.dataset.editing = String(!!editingId);
    if (editingId) {
      const index = repo.entries().findIndex((e) => e.id === editingId);
      formTitle.replaceChildren(icon('pencil'), `${index + 1}行目を直しています`, h('small', {}, '下の行の残高も自動で直ります'));
      actions.replaceChildren(
        h('button', { type: 'button', class: 'btn btn-danger-text btn-sm', onClick: deleteEditing }, icon('trash'), 'この行を削除'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: cancelEdit }, 'やめる'),
        h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, icon('check'), '更新'),
      );
    } else {
      formTitle.replaceChildren(icon('plus'), '新しい行を書く', h('small', {}, 'Enter でも追加できます'));
      actions.replaceChildren(
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => openHelp(accountSelect.value || null, !!accountSelect.value) }, icon('help'), '科目の説明'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'submit', class: 'btn btn-primary btn-sm cb-add-btn' }, icon('plus'), '追加'),
      );
    }
    updatePreview();
  }

  function fill(entry) {
    dateInput.value = entry?.date ?? '';
    contentInput.value = entry?.content ?? '';
    accountSelect.value = entry?.account ?? '';
    incomeInput.value = entry?.income == null ? '' : yen(entry.income);
    expenseInput.value = entry?.expense == null ? '' : yen(entry.expense);
    for (const el of [contentInput, incomeInput, expenseInput, dateInput]) el.removeAttribute('aria-invalid');
    error.hidden = true;
  }

  function startEdit(id) {
    const entry = repo.entries().find((e) => e.id === id);
    if (!entry) return;
    editingId = id;
    fill(entry);
    renderForm();
    renderLedger();
    contentInput.focus({ preventScroll: true });
    // 直している行が入力行に隠れないように
    table.querySelector('.is-editing')?.scrollIntoView({ block: 'center' });
  }

  function cancelEdit() {
    editingId = null;
    fill({ date: toDateKey() });
    renderForm();
    renderLedger();
    contentInput.focus({ preventScroll: true });
  }

  function deleteEditing() {
    const entry = repo.entries().find((e) => e.id === editingId);
    if (!entry) return cancelEdit();
    repo.remove([entry.id]);
    cancelEdit();
    showToast(`「${entry.content}」を削除しました`, { action: { label: '元に戻す', onClick: () => repo.restore([entry]) } });
  }

  function showError(message, input) {
    error.replaceChildren(icon('alert'), h('span', {}, message));
    error.hidden = false;
    if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const amounts = readAmounts();
    if (amounts.error) {
      showError(amounts.error, amounts.income === undefined ? incomeInput : expenseInput);
      return;
    }
    if (!contentInput.value.trim()) { showError('内容を入力してください。', contentInput); return; }
    const input = {
      date: dateInput.value || null,
      content: contentInput.value,
      account: accountSelect.value || null,
      income: amounts.income,
      expense: amounts.expense,
    };
    try {
      if (editingId) {
        repo.update(editingId, input);
        showToast('行を更新しました。残高を計算し直しました');
        editingId = null;
        fill({ date: input.date ?? toDateKey() });
      } else {
        const added = repo.add(input);
        showToast(`「${added.content}」を追加しました`, { action: { label: '取り消し', onClick: () => repo.remove([added.id]) } });
        // 年月日はそのまま（同じ日の分を続けて書きやすいように）
        fill({ date: input.date });
        requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
      }
      renderForm();
      contentInput.focus({ preventScroll: true });
    } catch (err) {
      const target = { content: contentInput, date: dateInput, income: incomeInput, expense: expenseInput }[err.field];
      showError(err.message, target);
    }
  });

  // 日本語入力の確定の Enter では送信しない
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.isComposing || e.keyCode === 229)) e.preventDefault();
    if (e.key === 'Escape' && editingId) { e.preventDefault(); cancelEdit(); }
  });
  form.addEventListener('input', () => { error.hidden = true; updatePreview(); });
  contentInput.addEventListener('input', () => contentInput.removeAttribute('aria-invalid'));

  // 科目を選んだら、入金・出金のうち合う方へ移動
  accountSelect.addEventListener('change', () => {
    setHelpFocus(accountSelect.value);
    const side = sideOf(accountSelect.value);
    if (!side) return;
    const [target, other] = side === 'income' ? [incomeInput, expenseInput] : [expenseInput, incomeInput];
    // 反対側にだけ金額が入っていたら移してあげる
    if (!target.value && other.value) { target.value = other.value; other.value = ''; updatePreview(); }
    target.focus();
  });
  // 金額は欄を離れたら 1,200 のように区切る
  for (const input of [incomeInput, expenseInput]) {
    input.addEventListener('blur', () => {
      try { const n = parseAmount(input.value); input.value = n == null ? '' : yen(n); } catch { /* エラーのまま残す */ }
    });
  }

  function editOpening() {
    openSheet({
      title: 'はじめの残高（前期繰越）',
      render(sheet) {
        const input = h('input', { id: 'cb-opening', class: 'text-input cb-amount', type: 'text', inputmode: 'numeric', value: String(repo.opening()) });
        const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
        return h('form', {
          class: 'form',
          novalidate: true,
          onSubmit: (e) => {
            e.preventDefault();
            try {
              const raw = input.value.normalize('NFKC').trim();
              const negative = /^[-−ー]/.test(raw);
              const n = parseAmount(raw.replace(/^[-−ー]/, '')) ?? 0;
              if (n > MAX_AMOUNT) throw new Error('金額が大きすぎます。');
              repo.setOpening(negative ? -n : n);
              sheet.close();
              showToast('はじめの残高を変更しました。残高を計算し直しました');
            } catch (ex) {
              err.replaceChildren(icon('alert'), h('span', {}, ex.message));
              err.hidden = false;
            }
          },
        },
          h('div', { class: 'field' },
            h('label', { class: 'field-label', for: 'cb-opening' }, '金額（円）'),
            input,
            h('p', { class: 'sheet-note' }, '帳簿をつけ始めたときに、手元にあったお金です。前の帳簿から続けるときは、その最後の残高を入れます。'),
          ),
          err,
          h('div', { class: 'sheet-actions' },
            h('span', { class: 'spacer' }),
            h('button', { type: 'button', class: 'btn btn-ghost', onClick: sheet.close }, 'キャンセル'),
            h('button', { type: 'submit', class: 'btn btn-primary' }, icon('check'), '保存'),
          ),
        );
      },
    });
  }

  function sortByDate() {
    const before = repo.entries();
    repo.sortByDate();
    showToast('日付順に並べ替えました', { action: { label: '元に戻す', onClick: () => { repo.remove(before.map((e) => e.id)); repo.restore(before); } } });
  }

  const unsubscribe = repo.subscribe(() => {
    if (editingId && !repo.entries().some((e) => e.id === editingId)) editingId = null;
    renderLedger();
    renderForm();
  });

  renderLedger();
  renderForm();
  // 開いたら一番下（最新の行と入力行）を見せる
  requestAnimationFrame(() => window.scrollTo(0, document.documentElement.scrollHeight));
  if (matchMedia('(min-width: 720px)').matches) contentInput.focus({ preventScroll: true });

  return () => unsubscribe();
}
