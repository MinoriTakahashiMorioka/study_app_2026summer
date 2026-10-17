import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { openSheet } from '../../core/sheet.js';

/** 新しいラベルの色の候補 */
const PALETTE = [
  ['#2F6FD6', '青'],
  ['#1A8C99', '青緑'],
  ['#2E9B5F', '緑'],
  ['#8A9A1F', '黄緑'],
  ['#D89A17', '山吹'],
  ['#DB5A35', 'オレンジ'],
  ['#D23B2A', '赤'],
  ['#C2408A', 'ピンク'],
  ['#7A4FC9', '紫'],
  ['#6B7A73', 'グレー'],
];

/**
 * ラベルの管理シート。
 * - 標準ラベル: 名前と色を変更できる（削除は不可）
 * - カスタムラベル: 追加・名前と色の変更・削除ができる
 * @param {{ repo: ReturnType<import('./repo.js').createCalendarRepo> }} options
 */
export function openLabelSheet({ repo }) {
  return openSheet({
    title: 'ラベルの管理',
    render(sheet) {
      const list = h('ul', { class: 'label-list' });
      const renderList = () => list.replaceChildren(...repo.labels().map(labelRow));

      // ---------- 既存ラベルの1行 ----------
      function labelRow(label) {
        const li = h('li', { class: 'label-row', style: { '--label': label.color } });
        const errorText = h('p', { class: 'row-error', role: 'alert', hidden: true });

        const colorInput = h('input', {
          id: `label-color-${label.id}`,
          class: 'color-input',
          type: 'color',
          value: label.color.toLowerCase(),
          'aria-label': `${label.name}の色`,
        });
        colorInput.addEventListener('input', () => li.style.setProperty('--label', colorInput.value));
        colorInput.addEventListener('change', () => repo.updateLabel(label.id, { color: colorInput.value }));

        const nameInput = h('input', {
          id: `label-name-${label.id}`,
          class: 'label-name-input',
          type: 'text',
          maxlength: '12',
          value: label.name,
          'aria-label': 'ラベル名',
        });
        nameInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) nameInput.blur();
        });
        nameInput.addEventListener('change', () => {
          try {
            const updated = repo.updateLabel(label.id, { name: nameInput.value });
            label.name = updated.name;
            nameInput.value = updated.name;
            errorText.hidden = true;
          } catch (err) {
            errorText.textContent = err.message;
            errorText.hidden = false;
            nameInput.value = label.name;
          }
        });

        const side = label.isDefault
          ? h('span', { class: 'badge' }, '標準')
          : h('button', {
            type: 'button',
            class: 'icon-btn',
            'aria-label': `${label.name}を削除`,
            onClick: confirmDelete,
          }, icon('trash'));

        function confirmDelete() {
          const count = repo.countEventsWithLabel(label.id);
          li.replaceChildren(
            h('div', { class: 'label-confirm' },
              h('p', {},
                h('strong', {}, `「${label.name}」を削除しますか？`),
                count > 0 && h('span', {}, `このラベルの予定 ${count}件は「ラベルなし」になります。`),
              ),
              h('div', { class: 'label-confirm-actions' },
                h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: renderList }, 'やめる'),
                h('button', {
                  type: 'button',
                  class: 'btn btn-danger btn-sm',
                  onClick: () => { repo.deleteLabel(label.id); renderList(); refreshAddForm(); },
                }, '削除する'),
              ),
            ),
          );
          li.querySelector('.btn-danger').focus();
        }

        li.append(
          h('div', { class: 'label-row-main' },
            h('label', { class: 'swatch-btn', for: colorInput.id, title: '色を変える' }, colorInput),
            nameInput,
            side,
          ),
          errorText,
        );
        return li;
      }

      // ---------- 新しいラベルの追加 ----------
      const firstUnusedColor = () => {
        const used = new Set(repo.labels().map((l) => l.color.toUpperCase()));
        return (PALETTE.find(([color]) => !used.has(color)) ?? PALETTE[0])[0];
      };

      let newColor = firstUnusedColor();

      const newName = h('input', {
        id: 'label-new-name',
        class: 'text-input',
        type: 'text',
        maxlength: '12',
        autocomplete: 'off',
        placeholder: '例: 旅行、バイト、部活',
      });
      newName.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) event.preventDefault();
      });

      const customColor = h('input', {
        id: 'label-new-custom',
        class: 'color-input',
        type: 'color',
        value: newColor.toLowerCase(),
        'aria-label': 'その他の色を選ぶ',
      });
      customColor.addEventListener('input', () => { newColor = customColor.value.toUpperCase(); renderPalette(); });

      const palette = h('div', { class: 'palette', role: 'group', 'aria-label': '色' });
      const renderPalette = () => {
        const isCustom = !PALETTE.some(([color]) => color === newColor);
        palette.replaceChildren(
          ...PALETTE.map(([color, name]) => h('button', {
            type: 'button',
            class: 'palette-swatch',
            style: { '--label': color },
            title: name,
            'aria-label': name,
            'aria-pressed': String(color === newColor),
            onClick: () => { newColor = color; renderPalette(); },
          })),
          h('label', {
            class: `palette-swatch palette-custom${isCustom ? ' is-selected' : ''}`,
            for: 'label-new-custom',
            title: 'その他の色',
            style: isCustom ? { '--label': newColor } : null,
          }, customColor, !isCustom && icon('plus')),
        );
        updatePreview();
      };

      const preview = h('span', { class: 'pill' });
      const updatePreview = () => {
        preview.style.setProperty('--label', newColor);
        preview.textContent = newName.value.trim() || '新しいラベル';
      };
      newName.addEventListener('input', () => { updatePreview(); addError.hidden = true; });

      const addError = h('p', { class: 'form-error', role: 'alert', hidden: true });

      const refreshAddForm = () => {
        newColor = firstUnusedColor();
        renderPalette();
      };

      const addForm = h('form', {
        class: 'label-add',
        novalidate: true,
        onSubmit: (event) => {
          event.preventDefault();
          try {
            repo.addLabel({ name: newName.value, color: newColor });
            newName.value = '';
            addError.hidden = true;
            renderList();
            refreshAddForm();
            newName.focus();
          } catch (err) {
            addError.replaceChildren(icon('alert'), h('span', {}, err.message));
            addError.hidden = false;
            newName.focus();
          }
        },
      },
        h('h3', { class: 'sub-head' }, '新しいラベル'),
        h('div', { class: 'field' },
          h('label', { class: 'field-label', for: 'label-new-name' }, '名前'),
          newName,
        ),
        h('div', { class: 'field' },
          h('span', { class: 'field-label' }, '色'),
          palette,
        ),
        addError,
        h('div', { class: 'label-add-foot' },
          h('span', { class: 'preview' }, 'プレビュー ', preview),
          h('button', { type: 'submit', class: 'btn btn-primary' }, icon('plus'), '追加'),
        ),
      );

      renderList();
      renderPalette();

      return h('div', { class: 'label-sheet' },
        h('p', { class: 'sheet-note' }, '丸をタップすると色、名前をタップすると名前を変えられます。標準のラベルは削除できません。'),
        list,
        addForm,
        h('div', { class: 'sheet-actions' },
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: sheet.close }, '完了'),
        ),
      );
    },
  });
}
