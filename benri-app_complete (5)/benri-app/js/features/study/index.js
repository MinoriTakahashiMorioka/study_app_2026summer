import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { defineFeature } from '../../core/feature.js';
import { showToast } from '../../core/toast.js';
import { chime, vibrate } from '../../core/sound.js';
import { keepAwake } from '../../core/wake-lock.js';
import { toDateKey } from '../../models/schema.js';
import { createStudyRepo } from './repo.js';
import { createTimer, settleAndRecord } from './timer.js';
import { formatClock, formatMinutes, lastNDays } from './format.js';
import { mountTodoView } from './todo-view.js';
import { mountTimerView } from './timer-view.js';
import { mountLogView } from './log-view.js';

/**
 * 勉強機能
 *
 *   index.js        … ハブに出す情報、タブ切り替え、タイマーの時計（このファイル）
 *   repo.js         … Todo・学習記録の読み書き
 *   timer.js        … ポモドーロタイマーの中身
 *   format.js       … 時間・日付の表示
 *   todo-view.js    … 木構造の Todo
 *   timer-view.js   … ポモドーロタイマーの画面
 *   log-view.js     … 勉強時間の記録（グラフ・集計・一覧）
 *   session-sheet.js… 記録の手入力・編集シート
 */

const TABS = [
  { id: 'todo', label: 'Todo', icon: 'list' },
  { id: 'timer', label: 'タイマー', icon: 'timer' },
  { id: 'log', label: '記録', icon: 'chart' },
];

/**
 * お試し用の demo アカウントにだけ、操作を試せるサンプルを入れる（初回のみ）。
 * 自分のアカウントを作ったら、この関数ごと消してかまいません。
 */
function seedDemo(ctx, repo) {
  if (ctx.user.id !== 'demo' || ctx.store.get('demoSeeded', false)) return;
  ctx.store.set('demoSeeded', true);

  if (repo.tasks().length === 0) {
    const homework = repo.addTask('宿題完了');
    const math = repo.addTask('数学の課題', homework.id);
    const workbook = repo.addTask('問題集 p.10〜15', math.id);
    repo.addTask('間違えた問題を解き直す', math.id);
    const japanese = repo.addTask('国語の課題', homework.id);
    repo.toggleTask(workbook.id, true);
    repo.toggleTask(japanese.id, true);
    repo.addTask('英単語 Unit 5 を覚える');
    repo.addTask('理科のレポート');
  }

  if (repo.sessions().length === 0) {
    const days = lastNDays(7);
    const samples = [
      [0, '19:30', 50, '数学'], [1, '20:00', 25, '英単語'], [3, '18:45', 45, '数学'],
      [3, '20:10', 30, '国語'], [4, '21:00', 25, '英単語'], [5, '17:30', 45, '理科のレポート'],
      [5, '19:00', 45, '数学'],
    ];
    for (const [dayIndex, time, minutes, subject] of samples) {
      repo.addSession({ startedAt: new Date(`${days[dayIndex]}T${time}`), minutes, subject, source: 'pomodoro' });
    }
  }
}

export default defineFeature({
  id: 'study',
  title: '勉強',
  subtitle: 'Todo・タイマー・記録',
  icon: 'book',
  color: '#4B57C9',
  keywords: ['todo', 'タスク', 'ポモドーロ', 'タイマー', '記録', 'べんきょう', '学習'],

  summary(ctx) {
    const repo = createStudyRepo(ctx.store);
    const timer = createTimer(ctx.store);
    seedDemo(ctx, repo);
    settleAndRecord(timer, repo);

    const state = timer.state();
    if (state.phase === 'running') return `タイマー作動中・残り ${formatClock(state.remainingSec)}`;
    if (state.phase === 'paused') return 'タイマー一時停止中';

    const today = repo.minutesByDay().get(toDateKey()) ?? 0;
    const open = repo.tasks().filter((t) => !t.done).length;
    return `今日 ${formatMinutes(today)}・残りタスク ${open}件`;
  },

  mount(root, ctx) {
    const repo = createStudyRepo(ctx.store);
    const timer = createTimer(ctx.store);
    seedDemo(ctx, repo);
    settleAndRecord(timer, repo); // 画面を離れている間に終わったタイマーを記録

    const originalTitle = document.title;
    const tickListeners = new Set();
    let current = TABS.some((t) => t.id === repo.pref('tab', 'todo')) ? repo.pref('tab', 'todo') : 'todo';
    let cleanupView = null;

    // ---------- タブ ----------

    const timerBadge = h('span', { class: 'tab-badge', hidden: true });

    const tabButtons = TABS.map((tab) => h('button', {
      type: 'button',
      role: 'tab',
      id: `study-tab-${tab.id}`,
      class: 'tab',
      'aria-controls': 'study-panel',
      onClick: () => show(tab.id),
    }, icon(tab.icon), h('span', {}, tab.label), tab.id === 'timer' && timerBadge));

    const tablist = h('div', {
      class: 'tabs',
      role: 'tablist',
      'aria-label': '勉強のメニュー',
      onKeydown: (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        const index = TABS.findIndex((t) => t.id === current);
        const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
        show(next.id);
        tabButtons[TABS.indexOf(next)].focus();
      },
    }, tabButtons);

    const panel = h('section', { class: 'study-panel', id: 'study-panel', role: 'tabpanel' });

    function show(tabId, options = {}) {
      try { cleanupView?.(); } catch (error) { console.error(error); }
      cleanupView = null;
      current = tabId;
      repo.setPref('tab', tabId);

      tabButtons.forEach((button, i) => {
        const selected = TABS[i].id === tabId;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
      panel.setAttribute('aria-labelledby', `study-tab-${tabId}`);
      panel.replaceChildren();

      const shared = { repo, timer, show, onTick: (fn) => { tickListeners.add(fn); return () => tickListeners.delete(fn); } };
      if (tabId === 'todo') cleanupView = mountTodoView(panel, shared);
      if (tabId === 'timer') cleanupView = mountTimerView(panel, { ...shared, ...options });
      if (tabId === 'log') cleanupView = mountLogView(panel, shared);
    }

    // ---------- タイマーの時計（どのタブにいても動く） ----------

    function tick() {
      const finished = settleAndRecord(timer, repo);
      if (finished) {
        chime();
        vibrate();
        if (current !== 'timer') {
          showToast(
            finished.kind === 'focus' ? `${formatMinutes(finished.minutes)}の集中を記録しました` : '休憩が終わりました',
            { action: { label: 'タイマーを開く', onClick: () => show('timer') } },
          );
        }
      }

      const state = timer.state();
      const running = state.phase === 'running';
      timerBadge.hidden = !(running || state.phase === 'paused');
      timerBadge.textContent = formatClock(state.remainingSec);
      document.title = running ? `${formatClock(state.remainingSec)} ${state.kind === 'break' ? '休憩' : '集中'}中 - ${originalTitle}` : originalTitle;
      keepAwake(running);

      for (const fn of tickListeners) fn(finished);
    }

    root.append(h('div', { class: 'study' }, tablist, panel));
    show(current);
    tick();
    const interval = setInterval(tick, 250);

    return () => {
      clearInterval(interval);
      try { cleanupView?.(); } catch (error) { console.error(error); }
      document.title = originalTitle;
      keepAwake(false);
    };
  },
});
