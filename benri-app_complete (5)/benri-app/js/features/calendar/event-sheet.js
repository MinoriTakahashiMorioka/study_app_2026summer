import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { openSheet } from '../../core/sheet.js';
import { toDateKey } from '../../models/schema.js';

/** よく使う時間（タップで入力） */
const QUICK_TIMES = ['09:00', '12:00', '15:00', '18:00', '20:00'];

/** 新しい予定の時間の初期値：今日なら次の00分、それ以外の日は9:00 */
function suggestTime(dateKey) {
  if (dateKey !== toDateKey()) return '09:00';
  const nextHour = Math.min(new Date().getHours() + 1, 23);
  return `${String(nextHour).padStart(2, '0')}:00`;
}

/** 日本語入力の変換確定の Enter で送信されないようにする */
function blockImeEnter(input) {
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) event.preventDefault();
  });
}

/**
 * 予定の追加・編集シート。
 * @param {Object} options
 * @param {ReturnType<import('./repo.js').createCalendarRepo>} options.repo
 * @param {import('../../models/schema.js').CalendarEvent} [options.event] 編集する予定（なければ新規）
 * @param {string} [options.date] 新規のときの日付
 * @param {(saved) => void} [options.onSaved]
 * @param {() => void} [options.onOpenLabels] 「ラベルを追加・編集」を押したとき
 */
export function openEventSheet({ repo, event = null, date, onSaved, onOpenLabels }) {
  const isEdit = Boolean(event);
  const initial = event ?? { title: '', date, time: suggestTime(date), labelId: null, memo: '' };

  return openSheet({
    title: isEdit ? '予定を編集' : '予定を追加',
    render(sheet) {
      // ---------- タイトル ----------
      const titleInput = h('input', {
        id: 'ev-title',
        class: 'text-input',
        type: 'text',
        maxlength: '60',
        autocomplete: 'off',
        enterkeyhint: 'done',
        placeholder: '例: 歯医者、英語の小テスト',
        value: initial.title,
        autofocus: !isEdit,
      });
      blockImeEnter(titleInput);

      // ---------- 日付・終日 ----------
      const dateInput = h('input', { id: 'ev-date', class: 'text-input', type: 'date', value: initial.date, required: true });
      const allDay = h('input', { id: 'ev-allday', class: 'switch-input', type: 'checkbox', checked: initial.time == null });

      // ---------- 時間 ----------
      const timeInput = h('input', {
        id: 'ev-time',
        class: 'text-input',
        type: 'time',
        step: '300',
        value: initial.time ?? suggestTime(initial.date),
      });
      const quick = h('div', { class: 'quick-times', role: 'group', 'aria-label': 'よく使う時間' },
        QUICK_TIMES.map((time) => h('button', {
          type: 'button',
          class: 'chip chip-sm',
          dataset: { time },
          onClick: () => { timeInput.value = time; syncQuick(); },
        }, time)),
      );
      const syncQuick = () => {
        for (const button of quick.children) {
          button.setAttribute('aria-pressed', String(button.dataset.time === timeInput.value));
        }
      };
      timeInput.addEventListener('input', syncQuick);

      const timeField = h('div', { class: 'field' },
        h('label', { class: 'field-label', for: 'ev-time' }, '時間'),
        timeInput,
        quick,
      );
      const syncAllDay = () => { timeField.hidden = allDay.checked; };
      allDay.addEventListener('change', syncAllDay);

      // ---------- ラベル ----------
      let labelId = initial.labelId;
      const labelGroup = h('div', { class: 'label-choices', role: 'group', 'aria-labelledby': 'ev-label-heading' });

      const renderLabels = () => {
        const labels = repo.labels();
        if (labelId && !labels.some((l) => l.id === labelId)) labelId = null; // 削除されたラベル
        const options = [...labels, { id: null, name: 'なし', color: null }];

        labelGroup.replaceChildren(...[
          ...options.map((label) => h('button', {
            type: 'button',
            class: 'chip label-chip',
            style: { '--label': label.color ?? 'var(--ink-2)' },
            'aria-pressed': String(labelId === label.id),
            onClick: () => { labelId = label.id; renderLabels(); },
          }, label.color && h('i', { class: 'swatch', 'aria-hidden': 'true' }), label.name)),
          onOpenLabels && h('button', { type: 'button', class: 'chip chip-add', onClick: onOpenLabels },
            icon('tag'), 'ラベルを追加・編集'),
        ].filter(Boolean));
      };
      renderLabels();
      // ラベル管理シートで追加・変更されたらすぐ反映
      sheet.onCleanup(repo.subscribe(renderLabels));

      // ---------- メモ ----------
      const memo = h('textarea', {
        id: 'ev-memo',
        class: 'text-input',
        rows: '4',
        maxlength: '1000',
        placeholder: '場所、持ち物、URL など',
      }, initial.memo);

      // ---------- エラーとボタン ----------
      const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
      const showError = (message) => {
        error.replaceChildren(icon('alert'), h('span', {}, message));
        error.hidden = false;
      };

      const footer = h('div', { class: 'sheet-actions' });

      // replaceChildren は false をそのまま文字にしてしまうので、条件つきの部品は filter で除く
      const renderFooter = () => footer.replaceChildren(...[
        isEdit && h('button', { type: 'button', class: 'btn btn-danger-text', onClick: askDelete },
          icon('trash'), '削除'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: sheet.close }, 'キャンセル'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, isEdit ? '保存' : '追加'),
      ].filter(Boolean));

      // confirm() は使えない環境があるので、ボタンの位置で確認する
      function askDelete() {
        footer.replaceChildren(
          h('p', { class: 'confirm-text' }, 'この予定を削除しますか？'),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: renderFooter }, 'やめる'),
          h('button', {
            type: 'button',
            class: 'btn btn-danger',
            onClick: () => { repo.deleteEvent(event.id); sheet.close(); },
          }, '削除する'),
        );
        footer.querySelector('.btn-danger').focus();
      }

      const onSubmit = (submitEvent) => {
        submitEvent.preventDefault();
        if (!allDay.checked && !timeInput.value) {
          showError('時間を入れるか、「終日」をオンにしてください。');
          timeInput.focus();
          return;
        }
        try {
          const saved = repo.saveEvent({
            ...(event ?? {}),
            title: titleInput.value,
            date: dateInput.value,
            time: allDay.checked ? null : timeInput.value,
            labelId,
            memo: memo.value,
          });
          sheet.close();
          onSaved?.(saved);
        } catch (err) {
          showError(err.message);
          if (!titleInput.value.trim()) titleInput.focus();
        }
      };

      titleInput.addEventListener('input', () => { error.hidden = true; });

      renderFooter();
      syncAllDay();
      syncQuick();

      return h('form', { class: 'form', novalidate: true, onSubmit },
        h('div', { class: 'field' },
          h('label', { class: 'field-label', for: 'ev-title' }, 'タイトル'),
          titleInput,
        ),
        h('div', { class: 'form-row' },
          h('div', { class: 'field' },
            h('label', { class: 'field-label', for: 'ev-date' }, '日付'),
            dateInput,
          ),
          h('label', { class: 'switch', for: 'ev-allday' }, allDay, '終日'),
        ),
        timeField,
        h('div', { class: 'field' },
          h('span', { class: 'field-label', id: 'ev-label-heading' }, 'ラベル'),
          labelGroup,
        ),
        h('div', { class: 'field' },
          h('label', { class: 'field-label', for: 'ev-memo' }, 'メモ'),
          memo,
        ),
        error,
        footer,
      );
    },
  });
}
