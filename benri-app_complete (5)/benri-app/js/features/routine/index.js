import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { defineFeature } from '../../core/feature.js';
import { toDateKey } from '../../models/schema.js';
import { createRoutineRepo } from './repo.js';
import { blockAt, formatTime, nextBlock, nowMinutes, toMinutes } from './model.js';
import { TEMPLATES } from './templates.js';
import { mountRoutineBoard } from './board.js';

/**
 * 一日のルーティン機能
 *
 *   index.js          … ハブに出す情報、日付の切り替え、タブ（このファイル）
 *   model.js          … 種類・時間帯の定数と、時間の計算
 *   repo.js           … パターン・予定・使い分け・Todo のデータ
 *   templates.js      … 予定表のひな形
 *   board.js          … 左に縦の予定表、右にパネル（Todo ／ 予定）
 *   block-editor.js   … 予定の入力欄（右のパネルに表示）
 *   pattern-sheet.js  … パターンと使い分けの設定
 *   todo-view.js      … 朝・昼・夜の Todo
 *
 * 画面のURL：#/app/routine
 */

const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

// 日付やパターンを切り替えても、見ている日付・パターン・右のパネルを覚えておく（ページを開き直すと今日に戻る）
let viewDate = null;
let viewPattern = null;
let sideTab = 'todo';

const shiftDate = (key, days) => {
  const [y, m, d] = key.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + days));
};

/** demo アカウントにだけ、試しやすいサンプルを入れる（初回のみ） */
function seedDemo(ctx, repo) {
  if (ctx.user.id !== 'demo' || ctx.store.get('demoSeeded', false)) return;
  ctx.store.set('demoSeeded', true);
  if (repo.patterns().some((p) => p.blocks.length)) return;

  repo.setBlocks('weekday', TEMPLATES.find((t) => t.id === 'student-weekday').blocks);
  repo.setBlocks('holiday', TEMPLATES.find((t) => t.id === 'holiday').blocks);
  const exam = repo.addPattern('テスト期間', 'weekday');
  const examBlocks = repo.pattern(exam.id).blocks.filter((b) => b.title !== '部活');
  repo.setBlocks(exam.id, [...examBlocks, { title: '図書館で勉強', start: '15:45', end: '18:00', category: 'study' }]);
  repo.setDatePattern(shiftDate(toDateKey(), 5), exam.id);

  const created = new Date(Date.now() - 7 * 86400000).toISOString();
  const add = (title, slot, due = null, extra = {}) => repo.addTodo({ title, slot, due, repeat: 'daily', createdAt: created, ...extra });
  add('薬を飲む', 'morning', '08:00');
  add('天気と持ち物をチェック', 'morning', '07:20', { patterns: ['weekday'] });
  add('ストレッチ 5分', 'morning');
  add('水筒を洗う', 'night', '21:00');
  add('明日の準備', 'night', '23:00');
  add('日記を書く', 'night');
  repo.addTodo({ title: '図書館の本を返す', slot: 'noon', due: '17:00', repeat: 'once', date: toDateKey() });
  repo.addTodo({ title: '洗剤を買う', slot: 'anytime', repeat: 'once', date: toDateKey() });
}

export default defineFeature({
  id: 'routine',
  title: '一日のルーティン',
  subtitle: '時間割・朝昼夜のTodo',
  icon: 'clock',
  color: '#1A7F8E',
  keywords: ['ルーティン', '予定表', 'スケジュール', '時間割', '平日', '休日', 'todo', '習慣', 'るーてぃん'],

  summary(ctx) {
    const repo = createRoutineRepo(ctx.store);
    seedDemo(ctx, repo);
    const today = toDateKey();
    const { patternId } = repo.patternFor(today);
    const pattern = repo.pattern(patternId);
    const todos = repo.todosFor(today);
    const left = todos.filter((t) => !repo.isDone(t, today)).length;
    const minute = nowMinutes();
    const current = blockAt(pattern.blocks, minute);
    const next = nextBlock(pattern.blocks, minute);
    const where = current ? `いま ${current.title}` : next ? `次 ${formatTime(toMinutes(next.start))} ${next.title}` : pattern.name;
    return `${where}・Todo 残り${left}`;
  },

  mount(root, ctx) {
    const repo = createRoutineRepo(ctx.store);
    seedDemo(ctx, repo);

    if (ctx.subpath === 'todo') sideTab = 'todo'; // 以前の #/app/routine/todo からも開ける
    if (!viewDate) viewDate = toDateKey();

    // ---------- 日付と、その日のパターン ----------
    const dateBar = h('div', { class: 'date-bar' });

    function renderDateBar() {
      const today = toDateKey();
      const [y, m, d] = viewDate.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      const { patternId, reason, holiday } = repo.patternFor(viewDate);
      const pattern = repo.pattern(patternId);
      const [ty, tm, td] = today.split('-').map(Number);
      const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
      const relative = diff === 0 ? '今日' : diff === 1 ? '明日' : diff === -1 ? '昨日' : null;

      const select = h('select', { id: 'rt-day-pattern', class: 'day-pattern-select', 'aria-label': 'この日のパターン' },
        // 「自動」＝日付の指定がなければ使われるパターン
        h('option', { value: '' }, `自動（${repo.pattern(repo.patternFor(viewDate, { ignoreDate: true }).patternId).name}）`),
        repo.patterns().map((p) => h('option', { value: p.id, selected: reason === 'date' && p.id === patternId }, p.name)),
      );
      select.addEventListener('change', () => {
        repo.setDatePattern(viewDate, select.value || null);
        viewPattern = null;
      });

      dateBar.replaceChildren(
        h('div', { class: 'date-nav' },
          h('button', { type: 'button', class: 'nav-btn', 'aria-label': '前の日', onClick: () => moveDate(-1) }, icon('chevronLeft')),
          h('div', { class: 'date-label' },
            h('strong', { class: dow === 0 || holiday ? 'is-sun' : dow === 6 ? 'is-sat' : null },
              `${m}月${d}日（${WEEKDAY_NAMES[dow]}）`),
            h('span', {}, [relative, holiday].filter(Boolean).join('・') || `${y}年`),
          ),
          h('button', { type: 'button', class: 'nav-btn', 'aria-label': '次の日', onClick: () => moveDate(1) }, icon('chevronRight')),
          diff !== 0 && h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => { viewDate = today; viewPattern = null; renderAll(); } }, '今日'),
        ),
        h('label', { class: 'day-pattern', for: 'rt-day-pattern' },
          h('span', { class: `pattern-dot kind-${pattern.kind}`, 'aria-hidden': 'true' }),
          h('span', { class: 'day-pattern-text' }, 'この日は', h('b', {}, pattern.name),
            h('small', {}, reason === 'date' ? '（日付で指定）' : reason === 'holiday' ? '（祝日）' : '（曜日から自動）')),
          select,
        ),
      );
    }

    function moveDate(days) {
      viewDate = shiftDate(viewDate, days);
      viewPattern = null;
      renderAll();
    }

    const panel = h('section', { class: 'routine-panel' });

    let cleanupView = null;
    const deps = {
      repo,
      getDate: () => viewDate,
      getViewPattern: () => viewPattern,
      setViewPattern: (id) => { viewPattern = id; renderAll(); },
      get initialSide() { return sideTab; },
      onSideChange: (side) => { sideTab = side; },
    };

    function renderAll() {
      renderDateBar();
      try { cleanupView?.(); } catch (e) { console.error(e); }
      panel.replaceChildren();
      cleanupView = mountRoutineBoard(panel, deps);
    }

    root.append(h('div', { class: 'routine' }, dateBar, panel));
    renderAll();
    const unsubscribe = repo.subscribe(renderDateBar);

    return () => {
      unsubscribe();
      try { cleanupView?.(); } catch (e) { console.error(e); }
    };
  },
});
