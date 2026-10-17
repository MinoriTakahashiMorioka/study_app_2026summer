import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { openSheet } from '../../core/sheet.js';
import { toDateKey } from '../../models/schema.js';

const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

const formatDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return `${y}年${m}月${d}日（${WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()]}）`;
};

/**
 * パターン（平日・休日・特殊日）の管理と、どの日にどのパターンを使うかの設定。
 * @param {{ repo, focus?: 'add' }} options
 */
export function openPatternSheet({ repo, focus = null }) {
  return openSheet({
    title: 'パターンと使い分け',
    render(sheet) {
      const body = h('div', { class: 'pattern-sheet' });

      const patternOptions = (selected, { allowFollow = false } = {}) => [
        allowFollow && h('option', { value: '', selected: !selected }, '曜日どおり'),
        ...repo.patterns().map((p) => h('option', { value: p.id, selected: p.id === selected }, p.name)),
      ].filter(Boolean);

      // ---------- パターンの一覧 ----------
      function patternList() {
        return h('ul', { class: 'label-list pattern-list' }, repo.patterns().map((p) => {
          const li = h('li', { class: 'label-row' });
          const name = h('input', {
            id: `pt-name-${p.id}`,
            class: 'label-name-input',
            type: 'text',
            maxlength: '12',
            value: p.name,
            'aria-label': 'パターンの名前',
          });
          const err = h('p', { class: 'row-error', role: 'alert', hidden: true });
          name.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) name.blur(); });
          name.addEventListener('change', () => {
            try { repo.renamePattern(p.id, name.value); err.hidden = true; }
            catch (e) { err.textContent = e.message; err.hidden = false; name.value = p.name; }
          });

          const confirmDelete = () => li.replaceChildren(h('div', { class: 'label-confirm' },
            h('p', {}, h('strong', {}, `「${p.name}」を削除しますか？`),
              h('span', {}, 'このパターンを使っていた曜日・日付は、平日／休日に戻ります。')),
            h('div', { class: 'label-confirm-actions' },
              h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: render }, 'やめる'),
              h('button', { type: 'button', class: 'btn btn-danger btn-sm', onClick: () => { repo.deletePattern(p.id); render(); } }, '削除する'),
            ),
          ));

          li.append(
            h('div', { class: 'label-row-main' },
              h('span', { class: `pattern-dot kind-${p.kind}`, 'aria-hidden': 'true' }),
              name,
              h('span', { class: 'muted pattern-count' }, `${p.blocks.length}件`),
              h('button', {
                type: 'button',
                class: 'icon-btn',
                title: '複製',
                'aria-label': `「${p.name}」を複製して特殊日を作る`,
                onClick: () => {
                  let n = 2;
                  while (repo.patterns().some((x) => x.name === `${p.name}${n}`)) n += 1;
                  repo.addPattern(`${p.name}${n}`.slice(0, 12), p.id);
                  render();
                },
              }, icon('doc')),
              p.kind === 'special'
                ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': `「${p.name}」を削除`, onClick: confirmDelete }, icon('trash'))
                : h('span', { class: 'badge' }, '標準'),
            ),
            err,
          );
          return li;
        }));
      }

      // ---------- 特殊日の追加 ----------
      function addForm() {
        const name = h('input', { id: 'pt-new-name', class: 'text-input', type: 'text', maxlength: '12', autocomplete: 'off', placeholder: '例: テスト期間、旅行の日、在宅勤務' });
        name.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.isComposing || e.keyCode === 229)) e.preventDefault(); });
        const copy = h('select', { id: 'pt-new-copy', class: 'text-input' },
          h('option', { value: '' }, '空のパターン'),
          repo.patterns().map((p) => h('option', { value: p.id }, `「${p.name}」をコピー`)));
        const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
        return h('form', {
          class: 'label-add',
          novalidate: true,
          onSubmit: (event) => {
            event.preventDefault();
            try {
              repo.addPattern(name.value, copy.value || null);
              render();
              document.getElementById('pt-new-name')?.focus();
            } catch (e) {
              err.replaceChildren(icon('alert'), h('span', {}, e.message));
              err.hidden = false;
            }
          },
        },
          h('h3', { class: 'sub-head' }, '特殊日のパターンを追加'),
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'pt-new-name' }, '名前'), name),
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'pt-new-copy' }, '中身'), copy),
          err,
          h('div', { class: 'label-add-foot' }, h('span'), h('button', { type: 'submit', class: 'btn btn-primary' }, icon('plus'), '追加')),
        );
      }

      // ---------- 曜日ごとの使い分け ----------
      function rulesSection() {
        const rules = repo.rules();
        const select = (id, value, onChange, opts) => {
          const el = h('select', { id, class: 'text-input' }, patternOptions(value, opts));
          el.addEventListener('change', () => onChange(el.value));
          return el;
        };
        return h('section', { class: 'rules' },
          h('h3', { class: 'sub-head' }, '曜日ごとのパターン'),
          h('div', { class: 'weekday-grid' },
            [1, 2, 3, 4, 5, 6, 0].map((dow) => h('label', { class: `weekday-cell dow-${dow}`, for: `rule-dow-${dow}` },
              h('span', {}, WEEKDAY_NAMES[dow]),
              select(`rule-dow-${dow}`, rules.weekdays[dow], (v) => repo.setWeekdayPattern(dow, v))))),
          h('label', { class: 'field holiday-rule', for: 'rule-holiday' },
            h('span', { class: 'field-label' }, '祝日（振替休日を含む）'),
            select('rule-holiday', rules.holidayPattern, (v) => repo.setHolidayPattern(v), { allowFollow: true })),
        );
      }

      // ---------- 日付の指定 ----------
      function datesSection() {
        const rules = repo.rules();
        const entries = Object.entries(rules.dates).sort(([a], [b]) => a.localeCompare(b));
        const today = toDateKey();
        const date = h('input', { id: 'rule-date', class: 'text-input', type: 'date', value: today });
        const pattern = h('select', { id: 'rule-date-pattern', class: 'text-input' },
          patternOptions(repo.patterns().find((p) => p.kind === 'special')?.id ?? 'holiday'));
        return h('section', { class: 'rules' },
          h('h3', { class: 'sub-head' }, '日付を指定'),
          h('p', { class: 'muted' }, 'テストの日や旅行の日など、特定の日だけパターンを変えます（曜日・祝日より優先）。'),
          entries.length > 0 && h('ul', { class: 'date-rules' }, entries.map(([key, pid]) => h('li', { class: key < today ? 'is-past' : null },
            h('span', {}, formatDay(key)),
            h('b', {}, repo.pattern(pid)?.name ?? '—'),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${formatDay(key)}の指定を解除`, onClick: () => { repo.setDatePattern(key, null); render(); } }, icon('close')),
          ))),
          h('form', {
            class: 'date-rule-add',
            novalidate: true,
            onSubmit: (event) => {
              event.preventDefault();
              if (!date.value) return;
              repo.setDatePattern(date.value, pattern.value);
              render();
            },
          },
            h('label', { class: 'visually-hidden', for: 'rule-date' }, '日付'), date,
            h('label', { class: 'visually-hidden', for: 'rule-date-pattern' }, 'パターン'), pattern,
            h('button', { type: 'submit', class: 'btn btn-ghost btn-sm' }, icon('plus'), '指定'),
          ),
        );
      }

      function render() {
        body.replaceChildren(
          h('p', { class: 'sheet-note' }, '名前をタップで変更、□で複製できます。平日・休日は消せませんが、特殊日はいくつでも追加できます。'),
          patternList(),
          addForm(),
          rulesSection(),
          datesSection(),
          h('div', { class: 'sheet-actions' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn btn-ghost', onClick: sheet.close }, '完了')),
        );
      }

      render();
      if (focus === 'add') requestAnimationFrame(() => {
        const input = document.getElementById('pt-new-name');
        input?.scrollIntoView({ block: 'center' });
        input?.focus();
      });
      return body;
    },
  });
}
