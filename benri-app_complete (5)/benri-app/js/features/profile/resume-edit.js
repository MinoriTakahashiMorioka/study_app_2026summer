import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { showToast } from '../../core/toast.js';
import { uid, toDateKey } from '../../models/schema.js';
import { eraHint } from './era.js';
import { HISTORY_KINDS, LICENSE_KINDS, ResumeError, fileToPhoto } from './resume-repo.js';

/**
 * 履歴書の編集画面。
 * 入力中の内容（draft）は保存ボタンを押すまで保存しません。
 * @returns {() => void}
 */
export function mountResumeEdit(root, { repo, go, back }) {
  const current = repo.get();
  const draft = structuredClone(current);
  const today = toDateKey();
  if (current.isSample) draft.updatedOn = today;

  // ---------- 小さな部品 ----------

  const textInput = (id, key, attrs = {}) => {
    const input = h('input', { id, class: 'text-input', type: 'text', value: draft[key] ?? '', autocomplete: 'off', ...attrs });
    input.addEventListener('input', () => { draft[key] = input.value; });
    return input;
  };

  const field = (label, input, hint = null) => h('div', { class: 'field' },
    h('label', { class: 'field-label', for: input.id }, label, hint && h('span', { class: 'field-hint' }, hint)),
    input,
  );

  const section = (title, ...children) => h('section', { class: 'edit-card' },
    h('h3', { class: 'edit-card-title' }, title), ...children);

  // ---------- 基本情報 ----------

  const updatedInput = h('input', { id: 'rs-updated', class: 'text-input', type: 'date', value: draft.updatedOn });
  updatedInput.addEventListener('input', () => { draft.updatedOn = updatedInput.value; });
  const todayBtn = h('button', {
    type: 'button',
    class: 'btn btn-ghost btn-sm',
    onClick: () => { updatedInput.value = today; draft.updatedOn = today; },
  }, '今日にする');

  const birthInput = h('input', { id: 'rs-birth', class: 'text-input', type: 'date', value: draft.birthDate, max: today });
  birthInput.addEventListener('input', () => { draft.birthDate = birthInput.value; });

  // ---------- 顔写真 ----------

  const photoPreview = h('div', { class: 'photo-preview' });
  const photoInput = h('input', { id: 'rs-photo', type: 'file', accept: 'image/*', class: 'visually-hidden' });
  const photoActions = h('div', { class: 'photo-actions' });
  const photoError = h('p', { class: 'form-error', role: 'alert', hidden: true });

  const renderPhoto = () => {
    photoPreview.replaceChildren(draft.photo
      ? h('img', { src: draft.photo, alt: '選んだ顔写真' })
      : h('span', { class: 'photo-placeholder' }, icon('camera'), h('small', {}, '3:4 に自動で切り抜きます')));
    photoActions.replaceChildren(...[
      h('label', { class: 'btn btn-ghost btn-sm', for: 'rs-photo' }, icon('camera'), draft.photo ? '写真を変える' : '写真を選ぶ'),
      draft.photo && h('button', {
        type: 'button',
        class: 'btn btn-danger-text btn-sm',
        onClick: () => { draft.photo = null; renderPhoto(); },
      }, icon('trash'), '写真を外す'),
    ].filter(Boolean));
  };

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    photoInput.value = '';
    if (!file) return;
    photoError.hidden = true;
    photoPreview.classList.add('is-loading');
    try {
      draft.photo = await fileToPhoto(file);
      renderPhoto();
    } catch (error) {
      photoError.replaceChildren(icon('alert'), h('span', {}, error.message));
      photoError.hidden = false;
    } finally {
      photoPreview.classList.remove('is-loading');
    }
  });

  // ---------- 学歴・職歴 / 資格・免許 の行 ----------

  const monthOptions = (selected) => [
    h('option', { value: '', selected: !selected }, '月'),
    ...Array.from({ length: 12 }, (_, i) => h('option', { value: String(i + 1), selected: Number(selected) === i + 1 }, `${i + 1}月`)),
  ];

  /**
   * @param {'history' | 'licenses'} listKey
   * @param {string[]} kinds
   * @param {'text' | 'name'} textKey
   * @param {string} placeholder
   */
  function rowEditor(listKey, kinds, textKey, placeholder) {
    const list = h('ol', { class: 'row-list' });

    const renderRows = () => {
      list.replaceChildren(...draft[listKey].map((row, index) => {
        const hint = h('span', { class: 'era-hint', 'aria-live': 'polite' }, eraHint(row.year, row.month));

        const year = h('input', {
          class: 'text-input', type: 'number', inputmode: 'numeric', min: '1900', max: '2100',
          placeholder: '年（西暦）', value: row.year ?? '', 'aria-label': `${index + 1}行目の年（西暦）`,
          id: `${listKey}-year-${row.id}`,
        });
        year.addEventListener('input', () => { row.year = year.value; hint.textContent = eraHint(row.year, row.month); });

        const month = h('select', { class: 'text-input', 'aria-label': `${index + 1}行目の月`, id: `${listKey}-month-${row.id}` }, monthOptions(row.month));
        month.addEventListener('change', () => { row.month = month.value; hint.textContent = eraHint(row.year, row.month); });

        const kind = h('select', { class: 'text-input', 'aria-label': `${index + 1}行目の種類`, id: `${listKey}-kind-${row.id}` },
          kinds.map((k) => h('option', { value: k, selected: row.kind === k }, k)));
        kind.addEventListener('change', () => { row.kind = kind.value; });

        const text = h('input', {
          class: 'text-input', type: 'text', maxlength: '80', placeholder, value: row[textKey] ?? '',
          'aria-label': `${index + 1}行目の内容`, id: `${listKey}-text-${row.id}`,
        });
        text.addEventListener('input', () => { row[textKey] = text.value; });

        return h('li', { class: 'row-edit', dataset: { rowId: row.id } },
          h('div', { class: 'row-edit-top' },
            h('div', { class: 'year-wrap' }, year, hint),
            month,
            kind,
            h('button', {
              type: 'button',
              class: 'icon-btn',
              'aria-label': `${index + 1}行目を削除`,
              onClick: () => { draft[listKey].splice(index, 1); renderRows(); },
            }, icon('trash')),
          ),
          text,
        );
      }));
      if (draft[listKey].length === 0) list.append(h('li', { class: 'row-none' }, 'まだありません'));
    };

    const add = (kindValue) => {
      const row = { id: uid(), year: '', month: '', kind: kindValue, [textKey]: '' };
      draft[listKey].push(row);
      renderRows();
      document.getElementById(`${listKey}-year-${row.id}`)?.focus();
    };

    renderRows();
    return {
      list,
      buttons: h('div', { class: 'row-add' },
        kinds.map((k) => h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => add(k) }, icon('plus'), `${k}を追加`))),
    };
  }

  const historyEditor = rowEditor('history', HISTORY_KINDS, 'text', '例: さくら高等学校 入学');
  const licenseEditor = rowEditor('licenses', LICENSE_KINDS, 'name', '例: 普通自動車第一種運転免許 取得');

  // ---------- 保存 ----------

  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });

  const onSave = (event) => {
    event.preventDefault();
    for (const el of root.querySelectorAll('.row-edit.has-error')) el.classList.remove('has-error');
    try {
      const { persisted } = repo.save(draft);
      if (!persisted) {
        showToast('この端末に保存できませんでした（容量不足の可能性があります）。写真を外すと保存できることがあります。', { duration: 9000 });
      } else {
        showToast('履歴書を保存しました');
      }
      back('resume');
    } catch (err) {
      error.replaceChildren(icon('alert'), h('span', {}, err.message));
      error.hidden = false;
      if (err instanceof ResumeError && err.rowId) {
        const rowEl = root.querySelector(`[data-row-id="${err.rowId}"]`);
        rowEl?.classList.add('has-error');
        rowEl?.querySelector('input')?.focus();
      } else {
        error.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  };

  renderPhoto();

  root.append(
    h('form', { class: 'resume-edit', novalidate: true, onSubmit: onSave },
      h('div', { class: 'edit-head' },
        h('h2', {}, '履歴書を編集'),
        h('p', {}, '年は西暦で入力します（表示は和暦にも切り替えられます）。'),
      ),

      section('基本情報',
        h('div', { class: 'field' },
          h('label', { class: 'field-label', for: 'rs-updated' }, '更新日', h('span', { class: 'field-hint' }, '「〇年〇月〇日現在」に使います')),
          h('div', { class: 'inline-row' }, updatedInput, todayBtn),
        ),
        field('氏名', textInput('rs-name', 'name', { maxlength: '30', placeholder: '例: 山田 花子', autocomplete: 'name' })),
        field('ふりがな', textInput('rs-name-kana', 'nameKana', { maxlength: '40', placeholder: '例: やまだ はなこ' })),
        field('生年月日', birthInput),
      ),

      section('顔写真',
        h('div', { class: 'photo-edit' }, photoPreview, h('div', { class: 'photo-side' },
          h('p', { class: 'muted' }, '正面を向いた写真を選んでください。縦横 3:4 に自動で切り抜いて、この端末にだけ保存します。'),
          photoActions,
          photoInput,
        )),
        photoError,
      ),

      section('住所・連絡先',
        h('div', { class: 'form-row form-row-2' },
          field('郵便番号', textInput('rs-postal', 'postalCode', { inputmode: 'numeric', maxlength: '8', placeholder: '123-4567', autocomplete: 'postal-code' })),
          h('span'),
        ),
        field('現住所', textInput('rs-address', 'address', { maxlength: '120', placeholder: '例: 東京都〇〇区△△町1-2-3', autocomplete: 'street-address' })),
        field('現住所のふりがな', textInput('rs-address-kana', 'addressKana', { maxlength: '160', placeholder: '例: とうきょうと〇〇く△△ちょう' })),
        h('div', { class: 'form-row form-row-2' },
          field('電話番号', textInput('rs-phone', 'phone', { type: 'tel', inputmode: 'tel', maxlength: '20', placeholder: '03-1234-5678', autocomplete: 'tel' })),
          field('携帯電話番号', textInput('rs-mobile', 'mobile', { type: 'tel', inputmode: 'tel', maxlength: '20', placeholder: '090-1234-5678', autocomplete: 'tel' })),
        ),
      ),

      section('学歴・職歴',
        h('p', { class: 'muted' }, '入学・卒業・入社・退社などを1行ずつ。表示するときは「学歴 → 職歴」の順に、古い順へ自動で並べます。'),
        historyEditor.list,
        historyEditor.buttons,
      ),

      section('資格・免許',
        h('p', { class: 'muted' }, '取得・合格した年月の古い順に自動で並べます。'),
        licenseEditor.list,
        licenseEditor.buttons,
      ),

      error,

      h('div', { class: 'edit-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => back('resume') }, 'キャンセル'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, icon('check'), '保存'),
      ),
    ),
  );

  document.getElementById('rs-name')?.focus({ preventScroll: true });
  return () => {};
}
