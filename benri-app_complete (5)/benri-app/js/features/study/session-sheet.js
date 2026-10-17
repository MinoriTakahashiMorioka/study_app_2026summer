import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { openSheet } from '../../core/sheet.js';
import { toDateKey } from '../../models/schema.js';
import { dateKeyOf, timeOf } from './format.js';

const QUICK_MINUTES = [15, 30, 45, 60, 90];

/**
 * 学習記録の手入力・編集シート。
 * @param {Object} options
 * @param {ReturnType<import('./repo.js').createStudyRepo>} options.repo
 * @param {import('../../models/schema.js').StudySession} [options.session] 編集する記録（なければ新規）
 */
export function openSessionSheet({ repo, session = null }) {
  const isEdit = Boolean(session);
  const now = new Date();
  const initial = session
    ? { date: dateKeyOf(session.startedAt), time: timeOf(session.startedAt), minutes: session.minutes, subject: session.subject, note: session.note }
    : { date: toDateKey(now), time: timeOf(new Date(now.getTime() - 30 * 60000)), minutes: 30, subject: '', note: '' };

  return openSheet({
    title: isEdit ? '記録を編集' : '記録を追加',
    render(sheet) {
      const dateInput = h('input', { id: 'ses-date', class: 'text-input', type: 'date', value: initial.date, max: toDateKey() });
      const timeInput = h('input', { id: 'ses-time', class: 'text-input', type: 'time', value: initial.time });

      const minutesInput = h('input', {
        id: 'ses-minutes',
        class: 'text-input',
        type: 'number',
        inputmode: 'numeric',
        min: '1',
        max: '720',
        step: '1',
        value: String(initial.minutes),
      });
      const quick = h('div', { class: 'quick-times', role: 'group', 'aria-label': 'よく使う時間' },
        QUICK_MINUTES.map((m) => h('button', {
          type: 'button',
          class: 'chip chip-sm',
          dataset: { minutes: String(m) },
          onClick: () => { minutesInput.value = String(m); syncQuick(); },
        }, `${m}分`)));
      const syncQuick = () => {
        for (const b of quick.children) b.setAttribute('aria-pressed', String(b.dataset.minutes === minutesInput.value));
      };
      minutesInput.addEventListener('input', syncQuick);

      const subjectInput = h('input', {
        id: 'ses-subject',
        class: 'text-input',
        type: 'text',
        maxlength: '40',
        list: 'ses-subjects',
        autocomplete: 'off',
        placeholder: '例: 数学、英単語',
        value: initial.subject,
      });
      const datalist = h('datalist', { id: 'ses-subjects' },
        repo.subjectSuggestions().map((name) => h('option', { value: name })));

      const noteInput = h('textarea', {
        id: 'ses-note',
        class: 'text-input',
        rows: '3',
        maxlength: '500',
        placeholder: 'やったこと、気づいたこと',
      }, initial.note);

      const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
      const footer = h('div', { class: 'sheet-actions' });

      const renderFooter = () => footer.replaceChildren(...[
        isEdit && h('button', { type: 'button', class: 'btn btn-danger-text', onClick: askDelete }, icon('trash'), '削除'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: sheet.close }, 'キャンセル'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, isEdit ? '保存' : '追加'),
      ].filter(Boolean));

      function askDelete() {
        footer.replaceChildren(
          h('p', { class: 'confirm-text' }, 'この記録を削除しますか？'),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: renderFooter }, 'やめる'),
          h('button', {
            type: 'button',
            class: 'btn btn-danger',
            onClick: () => { repo.deleteSession(session.id); sheet.close(); },
          }, '削除する'),
        );
        footer.querySelector('.btn-danger').focus();
      }

      renderFooter();
      syncQuick();

      return h('form', {
        class: 'form',
        novalidate: true,
        onSubmit: (event) => {
          event.preventDefault();
          if (!dateInput.value || !timeInput.value) {
            error.replaceChildren(icon('alert'), h('span', {}, '日付と開始時刻を入力してください。'));
            error.hidden = false;
            return;
          }
          const input = {
            startedAt: new Date(`${dateInput.value}T${timeInput.value}`),
            minutes: minutesInput.value,
            subject: subjectInput.value,
            note: noteInput.value,
          };
          try {
            if (isEdit) repo.updateSession(session.id, input);
            else repo.addSession({ ...input, source: 'manual' });
            sheet.close();
          } catch (err) {
            error.replaceChildren(icon('alert'), h('span', {}, err.message));
            error.hidden = false;
          }
        },
      },
        h('div', { class: 'form-row form-row-2' },
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'ses-date' }, '日付'), dateInput),
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'ses-time' }, '開始時刻'), timeInput),
        ),
        h('div', { class: 'field' },
          h('label', { class: 'field-label', for: 'ses-minutes' }, '勉強した時間（分）'),
          minutesInput,
          quick,
        ),
        h('div', { class: 'field' },
          h('label', { class: 'field-label', for: 'ses-subject' }, '内容'),
          subjectInput,
          datalist,
        ),
        h('div', { class: 'field' },
          h('label', { class: 'field-label', for: 'ses-note' }, 'メモ'),
          noteInput,
        ),
        error,
        footer,
      );
    },
  });
}
