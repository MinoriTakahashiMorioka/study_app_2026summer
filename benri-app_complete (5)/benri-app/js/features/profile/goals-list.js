import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { dateKeyOf, daysBetween, formatDate } from './era.js';
import { deadlineStatus, progressOf, sortMilestones } from './goals-repo.js';
import { openGoalSheet } from './goal-sheet.js';

/**
 * 目標の一覧（「目標」タブと「完了済み」タブ）。
 * @param {{ repo, go, tab: 'active' | 'done' }} deps
 * @returns {() => void}
 */
export function mountGoalsList(root, { repo, go, tab }) {
  const container = h('div', { class: 'goals' });

  /** 達成率のバー（横線） */
  const progressBar = (value, label) => h('div', {
    class: 'progress',
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': String(value),
    'aria-label': label,
  }, h('i', { style: { width: `${value}%` } }));

  // ---------- 取り組み中の目標 ----------

  function goalRow(goal) {
    const progress = progressOf(goal);
    const done = goal.milestones.filter((m) => m.done).length;
    const status = goal.kind === 'deadline' ? deadlineStatus(goal.deadline) : null;
    const next = sortMilestones(goal.milestones).find((m) => !m.done);

    return h('li', {},
      h('button', {
        type: 'button',
        class: 'goal-row',
        onClick: () => go(`goals/${goal.id}`),
        'aria-label': `${goal.title}、達成率${progress}%。詳細を開く`,
      },
        h('span', { class: 'goal-row-body' },
          h('span', { class: 'goal-row-title' }, goal.title),
          h('span', { class: 'goal-row-meta' },
            status
              ? h('span', { class: `due due-${status.level}` }, `${formatDate(goal.deadline)}まで・${status.text}`)
              : h('span', { class: 'due due-life' }, '期限なし'),
            goal.milestones.length > 0 && h('span', {}, `ロードマップ ${done}/${goal.milestones.length}`),
          ),
          next && h('span', { class: 'goal-row-next' }, `次: ${next.text}`),
          h('span', { class: 'goal-row-progress' },
            progressBar(progress, `${goal.title}の達成率`),
            h('b', {}, `${progress}%`),
          ),
        ),
        h('span', { class: 'goal-row-chev' }, icon('chevronRight')),
      ),
    );
  }

  function activeView() {
    const { withDeadline, lifetime } = repo.active();
    if (withDeadline.length + lifetime.length === 0) {
      return h('div', { class: 'goals-empty' },
        h('strong', {}, '目標はまだありません'),
        h('span', {}, '「目標を追加」から、期限つきの目標か一生の目標を登録しましょう。'),
      );
    }
    return h('div', { class: 'goal-groups' },
      withDeadline.length > 0 && h('section', { class: 'goal-group' },
        h('h3', { class: 'group-head' }, '期限つき', h('small', {}, '期限の近い順')),
        h('ul', { class: 'goal-list' }, withDeadline.map(goalRow)),
      ),
      lifetime.length > 0 && h('section', { class: 'goal-group' },
        h('h3', { class: 'group-head' }, '一生の目標', h('small', {}, '追加した順')),
        h('ul', { class: 'goal-list' }, lifetime.map(goalRow)),
      ),
    );
  }

  // ---------- 完了済み ----------

  function doneItem(goal) {
    const createdKey = dateKeyOf(goal.createdAt);
    const doneKey = dateKeyOf(goal.completedAt);
    const took = daysBetween(createdKey, doneKey);
    const milestonesDone = goal.milestones.filter((m) => m.done).length;
    let onTime = null;
    if (goal.kind === 'deadline') {
      const diff = daysBetween(doneKey, goal.deadline);
      onTime = diff > 0 ? `期限の${diff}日前に達成` : diff === 0 ? '期限当日に達成' : `期限から${-diff}日後に達成`;
    }

    const row = (label, value) => value && h('div', { class: 'dl-row' }, h('dt', {}, label), h('dd', {}, value));

    return h('li', {},
      h('details', { class: 'done-item' },
        h('summary', {},
          h('span', { class: 'done-check', 'aria-hidden': 'true' }, icon('check')),
          h('span', { class: 'done-summary' },
            h('span', { class: 'done-title' }, goal.title),
            h('span', { class: 'done-date' }, `${formatDate(doneKey)} 達成`),
          ),
          h('span', { class: 'done-toggle', 'aria-hidden': 'true' }, icon('chevronDown')),
        ),
        h('div', { class: 'done-body' },
          h('dl', { class: 'dl' },
            row('種類', goal.kind === 'deadline' ? '期限つき' : '一生の目標'),
            row('目標登録日', formatDate(createdKey)),
            row('期限', goal.deadline && formatDate(goal.deadline)),
            row('完了日', formatDate(doneKey)),
            row('かかった日数', took === 0 ? '登録した日に達成' : `${took}日`),
            row('期限との比較', onTime),
            row('ロードマップ', goal.milestones.length ? `${milestonesDone}/${goal.milestones.length} ステップ完了` : null),
            row('達成の条件', goal.conditions),
          ),
          h('div', { class: 'done-actions' },
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => go(`goals/${goal.id}`) }, '詳細を見る'),
          ),
        ),
      ),
    );
  }

  function doneView() {
    const goals = repo.completed();
    if (goals.length === 0) {
      return h('div', { class: 'goals-empty' },
        h('strong', {}, '完了した目標はまだありません'),
        h('span', {}, '目標の詳細画面で「目標を達成した！」を押すと、ここに並びます。'),
      );
    }
    return h('ul', { class: 'done-list' }, goals.map(doneItem));
  }

  // ---------- 描画 ----------

  function render() {
    const activeCount = repo.all().filter((g) => !g.completedAt).length;
    const doneCount = repo.all().length - activeCount;

    const tabButton = (id, label, count, path) => h('button', {
      type: 'button',
      role: 'tab',
      class: 'subtab',
      'aria-selected': String(tab === id),
      tabIndex: tab === id ? 0 : -1,
      onClick: () => go(path, { replace: true }),
    }, label, h('span', { class: 'count' }, count));

    container.replaceChildren(
      h('div', { class: 'goals-head' },
        h('div', { class: 'subtabs', role: 'tablist', 'aria-label': '目標の表示' },
          tabButton('active', '目標', activeCount, 'goals'),
          tabButton('done', '完了済み', doneCount, 'goals/done'),
        ),
        tab === 'active' && h('button', {
          type: 'button',
          class: 'btn btn-primary btn-sm',
          onClick: () => openGoalSheet({ repo, onSaved: (goal) => go(`goals/${goal.id}`) }),
        }, icon('plus'), '目標を追加'),
      ),
      h('div', { role: 'tabpanel' }, tab === 'active' ? activeView() : doneView()),
    );
  }

  root.append(container);
  render();
  return repo.subscribe(render);
}
