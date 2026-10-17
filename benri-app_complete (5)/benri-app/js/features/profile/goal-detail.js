import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { celebrate } from '../../core/confetti.js';
import { chime, unlockAudio } from '../../core/sound.js';
import { showToast } from '../../core/toast.js';
import { toDateKey } from '../../models/schema.js';
import { dateKeyOf, formatDate } from './era.js';
import { deadlineStatus, progressOf, sortMilestones } from './goals-repo.js';
import { openGoalSheet, openMilestoneSheet } from './goal-sheet.js';

const blockImeEnter = (input) => input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) event.preventDefault();
});

/**
 * 目標の詳細：達成率・達成の条件・ロードマップ・完了ボタン。
 * 部分ごとに描き直すので、条件メモの入力中にフォーカスが外れません。
 * @returns {() => void}
 */
export function mountGoalDetail(root, { repo, go, back, goalId }) {
  if (!repo.get(goalId)) {
    root.append(h('div', { class: 'goals-empty' },
      h('strong', {}, 'この目標は見つかりませんでした'),
      h('span', {}, '削除された可能性があります。'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => go('goals', { replace: true }) }, '目標一覧へ'),
    ));
    return () => {};
  }

  const goal = () => repo.get(goalId);
  const today = toDateKey();

  // ---------- 見出し ----------

  const head = h('header', { class: 'detail-head' });
  function renderHead() {
    const g = goal();
    const status = g.kind === 'deadline' && !g.completedAt ? deadlineStatus(g.deadline) : null;
    head.replaceChildren(...[
      h('div', { class: 'detail-kicker' },
        h('span', { class: `kind-chip kind-${g.kind}` }, g.kind === 'deadline' ? '期限つき' : '一生の目標'),
        h('span', {}, `${formatDate(dateKeyOf(g.createdAt))} 登録`),
      ),
      h('h2', { class: 'detail-title' }, g.title),
      g.kind === 'deadline' && h('p', { class: 'detail-deadline' },
        icon('flag'), `${formatDate(g.deadline)}までに達成`,
        status && h('span', { class: `due due-${status.level}` }, status.text)),
      g.description && h('p', { class: 'detail-desc' }, g.description),
      h('button', {
        type: 'button',
        class: 'btn btn-ghost btn-sm detail-edit',
        onClick: () => openGoalSheet({ repo, goal: g }),
      }, icon('pencil'), '目標を編集'),
    ].filter(Boolean));
  }

  // ---------- 達成率 ----------

  const progressCard = h('section', { class: 'detail-card', 'aria-labelledby': 'progress-title' });
  function renderProgress() {
    const g = goal();
    const value = progressOf(g);
    const done = g.milestones.filter((m) => m.done).length;

    const bar = h('div', {
      class: 'progress progress-lg',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(value),
      'aria-labelledby': 'progress-title',
    }, h('i', { style: { width: `${value}%` } }));
    const number = h('b', { class: 'progress-number' }, `${value}`, h('small', {}, '%'));

    const modeButtons = h('div', { class: 'segmented', role: 'group', 'aria-label': '達成率の決め方' },
      [['auto', 'ロードマップから'], ['manual', '自分で入力']].map(([mode, label]) => h('button', {
        type: 'button',
        'aria-pressed': String(g.progressMode === mode),
        disabled: Boolean(g.completedAt),
        onClick: () => repo.patch(goalId, { progressMode: mode, manualProgress: mode === 'manual' ? value : g.manualProgress }),
      }, label)));

    let slider = null;
    if (g.progressMode === 'manual' && !g.completedAt) {
      slider = h('input', {
        id: 'goal-progress',
        type: 'range',
        class: 'range',
        min: '0',
        max: '100',
        step: '5',
        value: String(g.manualProgress ?? 0),
        'aria-label': '達成率（%）',
      });
      // 動かしている間は見た目だけ更新し、離したときに保存
      slider.addEventListener('input', () => {
        bar.firstChild.style.width = `${slider.value}%`;
        number.firstChild.textContent = slider.value;
      });
      slider.addEventListener('change', () => repo.patch(goalId, { manualProgress: Number(slider.value) }));
    }

    progressCard.replaceChildren(...[
      h('div', { class: 'card-head' },
        h('h3', { id: 'progress-title' }, '達成率'),
        modeButtons,
      ),
      h('div', { class: 'progress-row' }, number, bar),
      slider,
      h('p', { class: 'muted' }, g.completedAt
        ? 'この目標は達成済みです。'
        : g.progressMode === 'auto'
          ? (g.milestones.length ? `ロードマップ ${g.milestones.length}ステップ中 ${done}ステップ完了` : '下のロードマップにステップを追加すると、完了した数から自動で計算します。')
          : 'スライダーで、今どのくらい進んでいるかを決めます。'),
    ].filter(Boolean));
  }

  // ---------- 達成の条件（メモ） ----------

  const conditions = h('textarea', {
    id: 'goal-conditions',
    class: 'text-input',
    rows: '4',
    maxlength: '2000',
    placeholder: '例: 本番1か月前の模試で7割以上取れていれば、合格の可能性が高い。\n苦手な長文は1日1題。',
  }, goal().conditions ?? '');
  const savedNote = h('span', { class: 'saved-note', 'aria-live': 'polite' });
  let saveTimer = null;
  const saveConditions = () => {
    clearTimeout(saveTimer);
    if (conditions.value === (goal()?.conditions ?? '')) return;
    repo.patch(goalId, { conditions: conditions.value });
    savedNote.textContent = '保存しました';
    setTimeout(() => { savedNote.textContent = ''; }, 2000);
  };
  conditions.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveConditions, 700);
  });
  conditions.addEventListener('blur', saveConditions);

  const conditionsCard = h('section', { class: 'detail-card' },
    h('div', { class: 'card-head' },
      h('h3', {}, h('label', { for: 'goal-conditions' }, '達成の条件')),
      savedNote,
    ),
    h('p', { class: 'muted' }, '「いつまでに、何がどのくらいできていれば達成できそうか」を書いておきます。自動で保存されます。'),
    conditions,
  );

  // ---------- ロードマップ ----------

  const roadmapList = h('ol', { class: 'roadmap' });
  function renderRoadmap() {
    const g = goal();
    const items = sortMilestones(g.milestones);
    const nodes = [];
    let todayPlaced = false;

    for (const m of items) {
      // 「今日」の目印を、今日以降の最初のステップの前に入れる
      if (!todayPlaced && m.due && m.due >= today && items.some((x) => x.due && x.due < today)) {
        nodes.push(h('li', { class: 'roadmap-today', 'aria-label': `今日 ${formatDate(today)}` }, h('span', {}, `今日 ${formatDate(today).replace(/^\d+年/, '')}`)));
        todayPlaced = true;
      }
      const overdue = !m.done && m.due && m.due < today;
      nodes.push(h('li', { class: `roadmap-item${m.done ? ' is-done' : ''}${overdue ? ' is-overdue' : ''}` },
        h('button', {
          type: 'button',
          class: 'roadmap-node',
          'aria-pressed': String(m.done),
          'aria-label': `「${m.text}」を${m.done ? '未完了に戻す' : '完了にする'}`,
          disabled: Boolean(g.completedAt),
          onClick: () => repo.toggleMilestone(goalId, m.id),
        }, m.done && icon('check')),
        h('button', {
          type: 'button',
          class: 'roadmap-body',
          disabled: Boolean(g.completedAt),
          onClick: () => openMilestoneSheet({ repo, goalId, milestone: m }),
        },
          h('span', { class: 'roadmap-due' }, m.due ? `${formatDate(m.due)}まで` : '期日なし', overdue && h('em', {}, '期日を過ぎています')),
          h('span', { class: 'roadmap-text' }, m.text),
        ),
      ));
    }
    if (todayPlaced === false && items.length > 0 && items.every((x) => !x.due || x.due < today) && items.some((x) => x.due)) {
      nodes.push(h('li', { class: 'roadmap-today' }, h('span', {}, `今日 ${formatDate(today).replace(/^\d+年/, '')}`)));
    }

    // ゴール（目標そのもの）
    nodes.push(h('li', { class: `roadmap-goal${g.completedAt ? ' is-done' : ''}` },
      h('span', { class: 'roadmap-node goal-node', 'aria-hidden': 'true' }, icon('flag')),
      h('span', { class: 'roadmap-body static' },
        h('span', { class: 'roadmap-due' }, g.kind === 'deadline' ? `${formatDate(g.deadline)}まで` : 'ゴール'),
        h('span', { class: 'roadmap-text' }, g.title),
      ),
    ));

    roadmapList.replaceChildren(...nodes);
    addForm.hidden = Boolean(g.completedAt);
  }

  const msText = h('input', { id: 'ms-new-text', class: 'text-input', type: 'text', maxlength: '80', placeholder: '例: 模試で7割以上取る', autocomplete: 'off' });
  blockImeEnter(msText);
  const msDue = h('input', { id: 'ms-new-due', class: 'text-input', type: 'date', 'aria-label': 'いつまでに（任意）' });
  const msError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const addForm = h('form', {
    class: 'ms-add',
    novalidate: true,
    onSubmit: (event) => {
      event.preventDefault();
      try {
        repo.addMilestone(goalId, { text: msText.value, due: msDue.value });
        msText.value = '';
        msDue.value = '';
        msError.hidden = true;
        msText.focus();
      } catch (err) {
        msError.replaceChildren(icon('alert'), h('span', {}, err.message));
        msError.hidden = false;
      }
    },
  },
    h('label', { class: 'field-label', for: 'ms-new-text' }, 'ステップを追加'),
    h('div', { class: 'ms-add-row' },
      msText,
      msDue,
      h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, icon('plus'), '追加'),
    ),
    msError,
  );

  const roadmapCard = h('section', { class: 'detail-card' },
    h('div', { class: 'card-head' }, h('h3', {}, 'ロードマップ')),
    h('p', { class: 'muted' }, '丸をタップで完了／未完了、文字をタップで編集・削除。期日の近い順に並びます。'),
    roadmapList,
    addForm,
  );

  // ---------- 完了・削除 ----------

  const actions = h('div', { class: 'detail-actions' });
  function renderActions() {
    const g = goal();
    if (g.completedAt) {
      actions.replaceChildren(
        h('div', { class: 'achieved' },
          h('span', { class: 'achieved-icon', 'aria-hidden': 'true' }, icon('check')),
          h('div', {},
            h('strong', {}, '達成しました！'),
            h('span', {}, `${formatDate(dateKeyOf(g.completedAt))} に完了`),
          ),
        ),
        h('div', { class: 'detail-actions-row' },
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => go('goals/done') }, '完了済みの一覧へ'),
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => repo.reopen(goalId) }, '未完了に戻す'),
        ),
      );
      return;
    }
    actions.replaceChildren(
      h('button', {
        type: 'button',
        class: 'btn btn-primary btn-complete',
        onClick: () => {
          unlockAudio();
          saveConditions();
          repo.complete(goalId);
          celebrate();
          chime();
          showToast(`おめでとうございます！「${g.title}」を達成しました`);
        },
      }, icon('party'), '目標を達成した！'),
      h('button', { type: 'button', class: 'btn btn-danger-text', onClick: askDelete }, icon('trash'), 'この目標を削除'),
    );
  }

  function askDelete() {
    actions.replaceChildren(
      h('div', { class: 'delete-confirm' },
        h('p', {}, h('strong', {}, `「${goal().title}」を削除しますか？`), h('span', {}, 'ロードマップや条件メモも消えます。元に戻せません。')),
        h('div', { class: 'detail-actions-row' },
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: renderActions }, 'やめる'),
          h('button', {
            type: 'button',
            class: 'btn btn-danger',
            onClick: () => {
              repo.remove(goalId);
              showToast('目標を削除しました');
              go('goals', { replace: true });
            },
          }, '削除する'),
        ),
      ),
    );
    actions.querySelector('.btn-danger').focus();
  }

  // ---------- 組み立て ----------

  const isDone = Boolean(goal().completedAt);
  root.append(
    h('div', { class: 'goal-detail' },
      h('button', {
        type: 'button',
        class: 'back-link',
        onClick: () => back(isDone ? 'goals/done' : 'goals'),
      }, icon('chevronLeft'), isDone ? '完了済みの一覧' : '目標の一覧'),
      head,
      h('div', { class: 'detail-grid' },
        h('div', { class: 'detail-col' }, progressCard, conditionsCard),
        h('div', { class: 'detail-col' }, roadmapCard),
      ),
      actions,
    ),
  );

  const render = () => {
    if (!goal()) return; // 削除された直後
    renderHead();
    renderProgress();
    renderRoadmap();
    renderActions();
  };
  render();
  const unsubscribe = repo.subscribe(render);

  return () => {
    saveConditions();
    unsubscribe();
  };
}
