import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { openSheet } from '../../core/sheet.js';
import { toDateKey } from '../../models/schema.js';
import { SLOTS, currentSlot, nowMinutes, slotOf, toMinutes } from './model.js';

const isImeEnter = (e) => e.key === 'Enter' && (e.isComposing || e.keyCode === 229);

/**
 * ルーティンの Todo（朝・昼・夜・いつでも に分けて表示）。
 * @param {{ repo, getDate: () => string }} deps
 * @returns {() => void}
 */
export function mountRoutineTodo(root, { repo, getDate, compact = false }) {
  const container = h('div', { class: `rtodo${compact ? ' is-compact' : ''}` });
  let addingSlot = null; // いま入力欄を開いている時間帯

  const sortItems = (a, b) => (a.due ?? '99:99').localeCompare(b.due ?? '99:99') || a.createdAt.localeCompare(b.createdAt);

  // ---------- 1件 ----------
  function item(todo, dateKey, isToday) {
    const done = repo.isDone(todo, dateKey);
    const overdue = isToday && !done && todo.due && toMinutes(todo.due) < nowMinutes();
    const carried = todo.repeat === 'once' && todo.date < dateKey;
    const [, m, d] = (todo.date ?? '').split('-').map(Number);

    return h('li', { class: `rtodo-item${done ? ' is-done' : ''}` },
      h('input', {
        type: 'checkbox',
        id: `rt-check-${todo.id}`,
        class: 'check',
        checked: done,
        'aria-label': `「${todo.title}」を完了にする`,
        onChange: () => repo.toggleTodo(todo.id, dateKey),
      }),
      h('button', { type: 'button', class: 'rtodo-title', onClick: () => openTodoSheet(todo) },
        h('span', {}, todo.title),
        h('span', { class: 'rtodo-tags' },
          todo.due && h('span', { class: `tag-time${overdue ? ' is-over' : ''}` }, icon('timer'), `${todo.due.replace(/^0/, '')}まで${overdue ? '（過ぎています）' : ''}`),
          todo.repeat === 'daily' && h('span', { class: 'tag-soft' }, '毎日'),
          todo.repeat === 'daily' && todo.patterns?.length > 0 && h('span', { class: 'tag-soft' },
            todo.patterns.map((id) => repo.pattern(id)?.name).filter(Boolean).join('・') + 'だけ'),
          carried && h('span', { class: 'tag-soft is-carried' }, `${m}/${d}から持ち越し`),
        ),
      ),
    );
  }

  // ---------- 時間帯の追加フォーム ----------
  function addRow(slotId, dateKey) {
    const input = h('input', {
      id: `rt-new-${slotId}`,
      class: 'text-input',
      type: 'text',
      maxlength: '60',
      autocomplete: 'off',
      enterkeyhint: 'done',
      placeholder: `${slotOf(slotId).name}の Todo`,
      'aria-label': `${slotOf(slotId).name}の Todo`,
    });
    const due = h('input', { id: `rt-new-due-${slotId}`, class: 'text-input', type: 'time', step: '300', 'aria-label': '何時まで（任意）', title: '何時まで（任意）' });
    let repeat = repo.pref('lastRepeat', 'daily');
    const repeatBtn = h('button', { type: 'button', class: 'chip chip-sm' });
    const syncRepeat = () => {
      repeatBtn.textContent = repeat === 'daily' ? '毎日' : 'この日だけ';
      repeatBtn.setAttribute('aria-label', `くり返し: ${repeatBtn.textContent}（押すと切り替え）`);
    };
    repeatBtn.addEventListener('click', () => { repeat = repeat === 'daily' ? 'once' : 'daily'; repo.setPref('lastRepeat', repeat); syncRepeat(); });
    syncRepeat();

    const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
    input.addEventListener('keydown', (e) => {
      if (isImeEnter(e)) e.preventDefault();
      if (e.key === 'Escape') { addingSlot = null; render(); }
    });

    return h('li', { class: 'rtodo-add' },
      h('form', {
        novalidate: true,
        onSubmit: (event) => {
          event.preventDefault();
          if (!input.value.trim()) { addingSlot = null; render(); return; }
          try {
            repo.addTodo({ title: input.value, slot: slotId, due: due.value || null, repeat, date: dateKey });
            // 描き直したあとも同じ時間帯の入力欄にフォーカス → 続けて入力できる
            document.getElementById(`rt-new-${slotId}`)?.focus();
          } catch (e) {
            err.textContent = e.message;
            err.hidden = false;
          }
        },
      },
        h('div', { class: 'rtodo-add-row' }, input, due),
        h('div', { class: 'rtodo-add-row' },
          repeatBtn,
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => { addingSlot = null; render(); } }, 'とじる'),
          h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, icon('plus'), '追加'),
        ),
        err,
      ),
    );
  }

  // ---------- 編集シート ----------
  function openTodoSheet(todo) {
    openSheet({
      title: 'Todo を編集',
      render(sheet) {
        let slot = todo.slot;
        let repeat = todo.repeat;
        const selectedPatterns = new Set(todo.patterns ?? []);

        const title = h('input', { id: 'rt-edit-title', class: 'text-input', type: 'text', maxlength: '60', value: todo.title });
        title.addEventListener('keydown', (e) => { if (isImeEnter(e)) e.preventDefault(); });
        const due = h('input', { id: 'rt-edit-due', class: 'text-input', type: 'time', step: '300', value: todo.due ?? '' });

        const slotGroup = h('div', { class: 'label-choices', role: 'group', 'aria-label': '時間帯' });
        const renderSlots = () => slotGroup.replaceChildren(...SLOTS.map((s) => h('button', {
          type: 'button', class: 'chip', 'aria-pressed': String(slot === s.id), onClick: () => { slot = s.id; renderSlots(); },
        }, s.name, h('small', { class: 'chip-sub' }, s.hint))));

        const patternBox = h('div', { class: 'field' });
        const renderPatterns = () => {
          patternBox.hidden = repeat !== 'daily';
          patternBox.replaceChildren(
            h('span', { class: 'field-label' }, '表示する日', h('span', { class: 'field-hint' }, '何も選ばなければ毎日')),
            h('div', { class: 'label-choices' }, repo.patterns().map((p) => h('button', {
              type: 'button',
              class: 'chip',
              'aria-pressed': String(selectedPatterns.has(p.id)),
              onClick: () => { if (selectedPatterns.has(p.id)) selectedPatterns.delete(p.id); else selectedPatterns.add(p.id); renderPatterns(); },
            }, `${p.name}の日`))),
          );
        };

        const repeatGroup = h('div', { class: 'segmented', role: 'group', 'aria-label': 'くり返し' });
        const renderRepeat = () => {
          repeatGroup.replaceChildren(...[['daily', '毎日くり返す'], ['once', 'この日だけ']].map(([v, label]) => h('button', {
            type: 'button', 'aria-pressed': String(repeat === v), onClick: () => { repeat = v; renderRepeat(); renderPatterns(); },
          }, label)));
        };

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
            h('p', { class: 'confirm-text' }, todo.repeat === 'daily' ? 'この毎日の Todo を削除しますか？（ほかの日からも消えます）' : 'この Todo を削除しますか？'),
            h('span', { class: 'spacer' }),
            h('button', { type: 'button', class: 'btn btn-ghost', onClick: renderFooter }, 'やめる'),
            h('button', { type: 'button', class: 'btn btn-danger', onClick: () => { repo.removeTodo(todo.id); sheet.close(); } }, '削除する'),
          );
          footer.querySelector('.btn-danger').focus();
        }

        renderSlots();
        renderRepeat();
        renderPatterns();
        renderFooter();

        return h('form', {
          class: 'form',
          novalidate: true,
          onSubmit: (event) => {
            event.preventDefault();
            try {
              repo.updateTodo(todo.id, {
                title: title.value, slot, due: due.value || null, repeat,
                date: repeat === 'once' ? (todo.date ?? getDate()) : null,
                patterns: [...selectedPatterns],
              });
              sheet.close();
            } catch (e) {
              error.replaceChildren(icon('alert'), h('span', {}, e.message));
              error.hidden = false;
            }
          },
        },
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'rt-edit-title' }, 'Todo'), title),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, '時間帯'), slotGroup),
          h('div', { class: 'field' },
            h('label', { class: 'field-label', for: 'rt-edit-due' }, '何時まで', h('span', { class: 'field-hint' }, '空欄なら時間指定なし')),
            h('div', { class: 'inline-row' }, due, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => { due.value = ''; } }, 'なしにする'))),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'くり返し'), repeatGroup),
          patternBox,
          error,
          footer,
        );
      },
    });
  }

  // ---------- 描画 ----------
  function render() {
    const activeId = document.activeElement?.id;
    const dateKey = getDate();
    const isToday = dateKey === toDateKey();
    const todos = repo.todosFor(dateKey);
    const doneCount = todos.filter((t) => repo.isDone(t, dateKey)).length;
    const nowSlot = isToday ? currentSlot() : null;
    const percent = todos.length ? Math.round((doneCount / todos.length) * 100) : 0;
    const hasDoneOnce = repo.todos().some((t) => t.repeat === 'once' && t.done);

    const groups = SLOTS.map((slot) => {
      const items = todos.filter((t) => t.slot === slot.id).sort(sortItems);
      const left = items.filter((t) => !repo.isDone(t, dateKey)).length;
      const open = addingSlot === slot.id;
      return h('section', { class: `rtodo-group${slot.id === nowSlot ? ' is-now' : ''}`, 'aria-labelledby': `rt-head-${slot.id}` },
        h('header', { class: 'rtodo-head' },
          h('h3', { id: `rt-head-${slot.id}` }, slot.name, h('small', {}, slot.hint)),
          slot.id === nowSlot && h('span', { class: 'now-chip' }, 'いま'),
          items.length > 0 && h('span', { class: 'rtodo-count' }, left ? `残り${left}` : 'ぜんぶ完了'),
          h('button', {
            type: 'button',
            class: 'icon-btn',
            'aria-label': `${slot.name}の Todo を追加`,
            'aria-expanded': String(open),
            onClick: () => { addingSlot = open ? null : slot.id; render(); if (!open) document.getElementById(`rt-new-${slot.id}`)?.focus(); },
          }, icon(open ? 'close' : 'plus')),
        ),
        (items.length > 0 || open) && h('ul', { class: 'rtodo-list' },
          items.map((t) => item(t, dateKey, isToday)),
          open && addRow(slot.id, dateKey)),
      );
    });

    container.replaceChildren(...[
      h('div', { class: 'rtodo-progress' },
        h('div', {},
          h('strong', {}, isToday ? '今日の Todo' : 'この日の Todo'),
          h('span', {}, todos.length ? `${doneCount} / ${todos.length} 完了` : 'まだありません'),
        ),
        h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent), 'aria-label': 'Todo の達成率' },
          h('i', { style: { width: `${percent}%` } })),
      ),
      todos.length === 0 && !addingSlot && h('p', { class: 'muted rtodo-hint' }, '朝・昼・夜の「＋」から追加します。「毎日」にしておくと、次の日はまたチェックが外れた状態から始まります。'),
      ...groups,
      hasDoneOnce && h('button', { type: 'button', class: 'btn btn-ghost btn-sm rtodo-clear', onClick: () => repo.clearDoneOnce() }, '完了した「この日だけ」の Todo を片付ける'),
    ].filter(Boolean));

    if (activeId) document.getElementById(activeId)?.focus({ preventScroll: true });
  }

  root.append(container);
  render();
  const unsubscribe = repo.subscribe(render);
  // 「過ぎています」を更新（入力中は描き直さない）
  const timer = setInterval(() => { if (getDate() === toDateKey() && !container.contains(document.activeElement)) render(); }, 60_000);
  return () => { unsubscribe(); clearInterval(timer); };
}
