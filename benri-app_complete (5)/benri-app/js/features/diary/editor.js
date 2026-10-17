import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { openSheet } from '../../core/sheet.js';
import { toDateKey } from '../../models/schema.js';
import { REFLECTION_MAX, TEXT_MAX } from './repo.js';
import { longLabel } from './dates.js';
import { countedTextarea, heartPicker } from './parts.js';

/**
 * 日記を書く・直すシート。
 * 1日1件なので、すでに書いた日を選ぶと「その日の日記を開く」に切り替わります。
 *
 * @param {Object} options
 * @param {ReturnType<import('./repo.js').createDiaryRepo>} options.repo
 * @param {string} [options.date]  書く日（省略すると今日）
 * @param {(entry) => void} [options.onSaved]
 * @param {(date) => void} [options.onDeleted]
 */
export function openDiaryEditor({ repo, date = toDateKey(), onSaved, onDeleted }) {
  let original = repo.get(date);
  let originalDate = original ? date : null;

  return openSheet({
    title: original ? '日記を直す' : '日記を書く',
    render(sheet) {
      let rating = original?.rating ?? null;
      let favorite = original?.favorite ?? false;

      const dateInput = h('input', { id: 'dy-date', class: 'text-input', type: 'date', value: date, max: toDateKey() });
      const dateNote = h('p', { class: 'date-note', role: 'status', hidden: true });

      const text = countedTextarea({ id: 'dy-text', value: original?.text, max: TEXT_MAX, rows: 7, placeholder: '今日あったこと、感じたこと' });
      const reflect = countedTextarea({ id: 'dy-reflect', value: original?.reflection, max: REFLECTION_MAX, rows: 3, placeholder: '次はこうしたい、ここがよくなかった など' });

      const favBtn = h('button', { type: 'button', class: 'fav-toggle' });
      const renderFav = () => {
        favBtn.setAttribute('aria-pressed', String(favorite));
        favBtn.replaceChildren(icon(favorite ? 'starFill' : 'star'), favorite ? 'お気に入りに登録中' : 'お気に入りに登録');
      };
      favBtn.addEventListener('click', () => { favorite = !favorite; renderFav(); });
      renderFav();

      // 日付を変えたとき、その日にもう日記があれば知らせる
      const checkDate = () => {
        const d = dateInput.value;
        const existing = d && d !== originalDate ? repo.get(d) : null;
        dateNote.hidden = !existing;
        if (existing) {
          dateNote.replaceChildren(
            icon('alert'),
            h('span', {}, `${longLabel(d)}の日記はもうあります。`),
            h('button', {
              type: 'button',
              class: 'btn btn-ghost btn-sm',
              onClick: () => { sheet.close(); openDiaryEditor({ repo, date: d, onSaved, onDeleted }); },
            }, 'その日の日記を開く'),
          );
        }
      };
      dateInput.addEventListener('input', checkDate);

      const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
      const footer = h('div', { class: 'sheet-actions' });
      const renderFooter = () => footer.replaceChildren(...[
        original && h('button', { type: 'button', class: 'btn btn-danger-text', onClick: askDelete }, icon('trash'), '削除'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: sheet.close }, 'キャンセル'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, icon('check'), '保存'),
      ].filter(Boolean));
      function askDelete() {
        footer.replaceChildren(
          h('p', { class: 'confirm-text' }, `${longLabel(originalDate)}の日記を削除しますか？`),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: renderFooter }, 'やめる'),
          h('button', {
            type: 'button',
            class: 'btn btn-danger',
            onClick: () => { repo.remove(originalDate); sheet.close(); onDeleted?.(originalDate); },
          }, '削除する'),
        );
        footer.querySelector('.btn-danger').focus();
      }
      renderFooter();
      // 書き始めたらエラー表示を消す
      for (const el of [text.textarea, reflect.textarea, dateInput]) el.addEventListener('input', () => { error.hidden = true; });

      return h('form', {
        class: 'form diary-form',
        novalidate: true,
        onSubmit: (event) => {
          event.preventDefault();
          try {
            const saved = repo.save({
              date: dateInput.value,
              text: text.textarea.value,
              reflection: reflect.textarea.value,
              rating,
              favorite,
              createdAt: original?.createdAt,
            }, originalDate);
            sheet.close();
            onSaved?.(saved);
          } catch (err) {
            if (err.existingDate) { checkDate(); dateInput.focus(); return; }
            error.replaceChildren(icon('alert'), h('span', {}, err.message));
            error.hidden = false;
            if (!text.textarea.value.trim()) text.textarea.focus();
          }
        },
      },
        h('div', { class: 'field' },
          h('label', { class: 'field-label', for: 'dy-date' }, '日付', h('span', { class: 'field-hint' }, '1日に1つ書けます')),
          dateInput,
          dateNote,
        ),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, '今日の評価'), heartPicker(rating, (v) => { rating = v; })),
        h('div', { class: 'field' },
          h('div', { class: 'label-row' }, h('label', { class: 'field-label', for: 'dy-text' }, '日記'), text.counter),
          text.textarea,
        ),
        h('div', { class: 'field' },
          h('div', { class: 'label-row' }, h('label', { class: 'field-label', for: 'dy-reflect' }, '反省と改善'), reflect.counter),
          reflect.textarea,
        ),
        favBtn,
        error,
        footer,
      );
    },
  });
}
