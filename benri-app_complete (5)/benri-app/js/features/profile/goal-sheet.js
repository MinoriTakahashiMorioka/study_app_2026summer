import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { openSheet } from '../../core/sheet.js';
import { toDateKey } from '../../models/schema.js';

const blockImeEnter = (input) => input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) event.preventDefault();
});

/**
 * 目標の追加・編集シート。
 * @param {Object} options
 * @param {ReturnType<import('./goals-repo.js').createGoalsRepo>} options.repo
 * @param {import('./goals-repo.js').Goal} [options.goal] 編集する目標（なければ新規）
 * @param {(goal) => void} [options.onSaved]
 */
export function openGoalSheet({ repo, goal = null, onSaved }) {
  const isEdit = Boolean(goal);
  let kind = goal?.kind ?? 'deadline';

  return openSheet({
    title: isEdit ? '目標を編集' : '目標を追加',
    render(sheet) {
      const titleInput = h('input', {
        id: 'goal-title',
        class: 'text-input',
        type: 'text',
        maxlength: '60',
        autocomplete: 'off',
        placeholder: '例: TOEIC 860点を取る',
        value: goal?.title ?? '',
        autofocus: !isEdit,
      });
      blockImeEnter(titleInput);

      const deadlineInput = h('input', {
        id: 'goal-deadline',
        class: 'text-input',
        type: 'date',
        min: isEdit ? null : toDateKey(),
        value: goal?.deadline ?? '',
      });
      const deadlineField = h('div', { class: 'field' },
        h('label', { class: 'field-label', for: 'goal-deadline' }, 'いつまでに達成したい？'),
        deadlineInput,
      );

      const kindButtons = h('div', { class: 'kind-choice', role: 'group', 'aria-label': '目標の種類' });
      const renderKind = () => {
        kindButtons.replaceChildren(
          ...[
            ['deadline', '期限つき', '〇年〇月〇日までに達成したい'],
            ['lifetime', '一生の目標', '期限を決めずに、ずっと追いかける'],
          ].map(([value, label, sub]) => h('button', {
            type: 'button',
            class: 'kind-option',
            'aria-pressed': String(kind === value),
            onClick: () => { kind = value; renderKind(); },
          }, h('b', {}, label), h('small', {}, sub))),
        );
        deadlineField.hidden = kind !== 'deadline';
      };

      const description = h('textarea', {
        id: 'goal-description',
        class: 'text-input',
        rows: '3',
        maxlength: '500',
        placeholder: 'なぜ達成したいか、達成したらどうなっていたいか',
      }, goal?.description ?? '');

      const error = h('p', { class: 'form-error', role: 'alert', hidden: true });

      renderKind();

      return h('form', {
        class: 'form',
        novalidate: true,
        onSubmit: (event) => {
          event.preventDefault();
          const input = { title: titleInput.value, kind, deadline: deadlineInput.value, description: description.value };
          try {
            const saved = isEdit ? repo.update(goal.id, input) : repo.add(input);
            sheet.close();
            onSaved?.(saved);
          } catch (err) {
            error.replaceChildren(icon('alert'), h('span', {}, err.message));
            error.hidden = false;
          }
        },
      },
        h('div', { class: 'field' },
          h('label', { class: 'field-label', for: 'goal-title' }, '目標'),
          titleInput,
        ),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, '種類'), kindButtons),
        deadlineField,
        h('div', { class: 'field' },
          h('label', { class: 'field-label', for: 'goal-description' }, 'ひとこと（任意）'),
          description,
        ),
        error,
        h('div', { class: 'sheet-actions' },
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: sheet.close }, 'キャンセル'),
          h('button', { type: 'submit', class: 'btn btn-primary' }, isEdit ? '保存' : '追加'),
        ),
      );
    },
  });
}

/** ロードマップのステップの編集シート */
export function openMilestoneSheet({ repo, goalId, milestone }) {
  return openSheet({
    title: 'ステップを編集',
    render(sheet) {
      const text = h('input', { id: 'ms-text', class: 'text-input', type: 'text', maxlength: '80', value: milestone.text });
      blockImeEnter(text);
      const due = h('input', { id: 'ms-due', class: 'text-input', type: 'date', value: milestone.due ?? '' });
      const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
      const footer = h('div', { class: 'sheet-actions' });

      const renderFooter = () => footer.replaceChildren(
        h('button', { type: 'button', class: 'btn btn-danger-text', onClick: askDelete }, icon('trash'), '削除'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: sheet.close }, 'キャンセル'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, '保存'),
      );
      function askDelete() {
        footer.replaceChildren(
          h('p', { class: 'confirm-text' }, 'このステップを削除しますか？'),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: renderFooter }, 'やめる'),
          h('button', {
            type: 'button',
            class: 'btn btn-danger',
            onClick: () => { repo.removeMilestone(goalId, milestone.id); sheet.close(); },
          }, '削除する'),
        );
        footer.querySelector('.btn-danger').focus();
      }
      renderFooter();

      return h('form', {
        class: 'form',
        novalidate: true,
        onSubmit: (event) => {
          event.preventDefault();
          try {
            repo.updateMilestone(goalId, milestone.id, { text: text.value, due: due.value });
            sheet.close();
          } catch (err) {
            error.replaceChildren(icon('alert'), h('span', {}, err.message));
            error.hidden = false;
          }
        },
      },
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'ms-text' }, 'やること・条件'), text),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'ms-due' }, 'いつまでに（任意）'), due),
        error,
        footer,
      );
    },
  });
}
