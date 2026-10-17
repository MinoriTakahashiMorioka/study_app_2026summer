import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { openSheet } from '../../core/sheet.js';

/** 日本語入力の変換確定の Enter で送信されないようにする */
const isImeEnter = (event) => event.key === 'Enter' && (event.isComposing || event.keyCode === 229);

/**
 * 木構造（階層型）の Todo。
 * - 「＋」で子タスクを追加（続けて何件でも入力できる）
 * - ▸ で子タスクを開閉
 * - タスク名をタップ → 名前の変更・削除・タイマーで勉強
 * @returns {() => void} 後片付け関数
 */
export function mountTodoView(root, { repo, timer, show }) {
  let hideDone = repo.pref('hideDone', false);
  let addingUnder = null; // 子タスクの入力欄を出している親のID

  // ---------- 上部：新しいタスク ----------

  const newTitle = h('input', {
    id: 'todo-new',
    class: 'text-input',
    type: 'text',
    maxlength: '80',
    autocomplete: 'off',
    enterkeyhint: 'done',
    placeholder: '新しいタスク（例: 宿題完了）',
    'aria-label': '新しいタスク',
  });
  newTitle.addEventListener('keydown', (event) => { if (isImeEnter(event)) event.preventDefault(); });

  const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });

  const addForm = h('form', {
    class: 'todo-add',
    novalidate: true,
    onSubmit: (event) => {
      event.preventDefault();
      try {
        repo.addTask(newTitle.value);
        newTitle.value = '';
        formError.hidden = true;
        newTitle.focus();
      } catch (err) {
        formError.replaceChildren(icon('alert'), h('span', {}, err.message));
        formError.hidden = false;
      }
    },
  }, newTitle, h('button', { type: 'submit', class: 'btn btn-primary' }, icon('plus'), '追加'));

  // ---------- ツールバー：件数と「完了を隠す」 ----------

  const counts = h('span', { class: 'todo-counts' });
  const hideToggle = h('button', {
    type: 'button',
    class: 'chip chip-sm',
    onClick: () => {
      hideDone = !hideDone;
      repo.setPref('hideDone', hideDone);
      render();
    },
  }, '完了を隠す');

  const tree = h('ul', { class: 'tree', 'aria-label': 'タスク一覧' });
  const empty = h('div', { class: 'todo-empty', hidden: true });

  // ---------- 1行分 ----------

  function taskNode(task) {
    const children = repo.childrenOf(task.id);
    const visibleChildren = children.filter((c) => !hideDone || !c.done);
    const hasChildren = children.length > 0;
    const doneCount = children.filter((c) => c.done).length;
    const isOpen = !task.collapsed;

    const row = h('div', { class: `task-row${task.done ? ' is-done' : ''}` },
      hasChildren
        ? h('button', {
          type: 'button',
          id: `twisty-${task.id}`,
          class: 'twisty',
          'aria-expanded': String(isOpen),
          'aria-label': isOpen ? `「${task.title}」の子タスクを閉じる` : `「${task.title}」の子タスクを開く`,
          onClick: () => repo.setCollapsed(task.id, isOpen),
        }, icon('chevronRight'))
        : h('span', { class: 'twisty-space', 'aria-hidden': 'true' }),
      h('input', {
        type: 'checkbox',
        id: `check-${task.id}`,
        class: 'check',
        checked: task.done,
        'aria-label': `「${task.title}」を完了にする`,
        onChange: (event) => repo.toggleTask(task.id, event.target.checked),
      }),
      h('button', {
        type: 'button',
        id: `title-${task.id}`,
        class: 'task-title',
        onClick: () => openTaskSheet(task),
      }, task.title),
      hasChildren && h('span', {
        class: 'task-progress',
        'aria-label': `子タスク ${children.length}件中 ${doneCount}件完了`,
      },
        h('span', { class: 'mini-bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${(doneCount / children.length) * 100}%` } })),
        `${doneCount}/${children.length}`,
      ),
      h('button', {
        type: 'button',
        id: `add-${task.id}`,
        class: 'icon-btn add-child',
        'aria-label': `「${task.title}」に子タスクを追加`,
        title: '子タスクを追加',
        onClick: () => startAdding(task.id),
      }, icon('plus')),
    );

    const li = h('li', { class: 'tree-item' }, row);
    const showChildren = (hasChildren && isOpen) || addingUnder === task.id;
    if (showChildren) {
      li.append(h('ul', { class: 'tree-children' },
        isOpen ? visibleChildren.map(taskNode) : [],
        addingUnder === task.id && childInput(task),
      ));
    }
    return li;
  }

  // ---------- 子タスクの入力欄 ----------

  function childInput(parent) {
    const input = h('input', {
      id: 'todo-child-input',
      class: 'text-input child-input',
      type: 'text',
      maxlength: '80',
      autocomplete: 'off',
      enterkeyhint: 'done',
      placeholder: `「${parent.title}」の子タスク`,
      'aria-label': `「${parent.title}」の子タスク`,
    });
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });

    input.addEventListener('keydown', (event) => {
      if (isImeEnter(event)) event.preventDefault();
      if (event.key === 'Escape') stopAdding();
    });

    return h('li', { class: 'tree-item' },
      h('form', {
        class: 'child-add',
        novalidate: true,
        onSubmit: (event) => {
          event.preventDefault();
          if (!input.value.trim()) { stopAdding(); return; }
          try {
            repo.addTask(input.value, parent.id); // 描き直し後も入力欄は開いたまま → 続けて入力できる
          } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
          }
        },
      },
        input,
        h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, '追加'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': '入力をやめる', onClick: stopAdding }, icon('close')),
      ),
      error,
    );
  }

  function startAdding(parentId) {
    addingUnder = parentId;
    const parent = repo.task(parentId);
    if (parent?.collapsed) repo.setCollapsed(parentId, false); // これで描き直される
    else render();
    document.getElementById('todo-child-input')?.focus();
  }

  function stopAdding() {
    const parentId = addingUnder;
    addingUnder = null;
    render();
    document.getElementById(`add-${parentId}`)?.focus();
  }

  // ---------- タスクの詳細シート ----------

  function openTaskSheet(task) {
    openSheet({
      title: 'タスク',
      render(sheet) {
        const path = repo.pathOf(task.id);
        const descendants = repo.countDescendants(task.id);

        const titleInput = h('input', {
          id: 'task-edit-title',
          class: 'text-input',
          type: 'text',
          maxlength: '80',
          value: task.title,
        });
        titleInput.addEventListener('keydown', (event) => { if (isImeEnter(event)) event.preventDefault(); });

        const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
        const footer = h('div', { class: 'sheet-actions' });

        const renderFooter = () => footer.replaceChildren(
          h('button', { type: 'button', class: 'btn btn-danger-text', onClick: askDelete }, icon('trash'), '削除'),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: sheet.close }, 'キャンセル'),
          h('button', { type: 'submit', class: 'btn btn-primary' }, '保存'),
        );

        function askDelete() {
          footer.replaceChildren(...[
            h('p', { class: 'confirm-text' },
              descendants > 0 ? `子タスク ${descendants}件も一緒に削除します。よろしいですか？` : 'このタスクを削除しますか？'),
            h('span', { class: 'spacer' }),
            h('button', { type: 'button', class: 'btn btn-ghost', onClick: renderFooter }, 'やめる'),
            h('button', {
              type: 'button',
              class: 'btn btn-danger',
              onClick: () => { repo.deleteTask(task.id); sheet.close(); },
            }, '削除する'),
          ]);
          footer.querySelector('.btn-danger').focus();
        }

        renderFooter();

        return h('form', {
          class: 'form',
          novalidate: true,
          onSubmit: (event) => {
            event.preventDefault();
            try {
              repo.renameTask(task.id, titleInput.value);
              sheet.close();
            } catch (err) {
              error.replaceChildren(icon('alert'), h('span', {}, err.message));
              error.hidden = false;
            }
          },
        },
          path.length > 1 && h('p', { class: 'task-path' }, path.slice(0, -1).join(' › ')),
          h('div', { class: 'field' },
            h('label', { class: 'field-label', for: 'task-edit-title' }, 'タスク名'),
            titleInput,
          ),
          h('div', { class: 'task-actions' },
            h('button', {
              type: 'button',
              class: 'btn btn-ghost',
              onClick: () => { sheet.close(); startAdding(task.id); },
            }, icon('plus'), '子タスクを追加'),
            h('button', {
              type: 'button',
              class: 'btn btn-ghost',
              onClick: () => {
                sheet.close();
                if (timer.state().phase !== 'running' && timer.state().phase !== 'paused') timer.setSubject(task.title);
                show('timer');
              },
            }, icon('timer'), 'タイマーで勉強する'),
          ),
          error,
          footer,
        );
      },
    });
  }

  // ---------- 描画 ----------

  function render() {
    const activeId = document.activeElement?.id; // 描き直してもフォーカスを保つ
    const all = repo.tasks();
    const open = all.filter((t) => !t.done).length;
    const roots = repo.childrenOf(null).filter((t) => !hideDone || !t.done);

    counts.textContent = `未完了 ${open}件 / 全 ${all.length}件`;
    hideToggle.setAttribute('aria-pressed', String(hideDone));
    tree.replaceChildren(...roots.map(taskNode));

    empty.hidden = roots.length > 0;
    empty.replaceChildren(
      all.length === 0
        ? h('p', {}, h('strong', {}, 'タスクはまだありません'), h('span', {}, '大きなタスクを追加して、「＋」で小さなタスクに分けましょう。'))
        : h('p', {}, h('strong', {}, '未完了のタスクはありません'), h('span', {}, 'おつかれさまでした！')),
    );

    if (activeId) document.getElementById(activeId)?.focus({ preventScroll: true });
  }

  root.append(
    h('div', { class: 'todo' },
      addForm,
      formError,
      h('div', { class: 'todo-bar' }, counts, hideToggle),
      tree,
      empty,
      h('p', { class: 'todo-hint' }, 'ヒント: タスク名をタップすると名前の変更や削除、「＋」で子タスクを追加できます。'),
    ),
  );

  render();
  return repo.subscribe(render);
}
