import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { toDateKey } from '../../models/schema.js';
import {
  blockAt, categoryOf, durationOf, formatDuration, formatTime, layoutLanes, minutesLeft,
  nextBlock, nowMinutes, segmentsOf, toMinutes,
} from './model.js';
import { TEMPLATES } from './templates.js';
import { createBlockEditor } from './block-editor.js';
import { openPatternSheet } from './pattern-sheet.js';
import { mountRoutineTodo } from './todo-view.js';

const HOUR_PX = 52;      // 1時間の高さ
const MIN_BLOCK_PX = 24; // 短い予定でも押しやすい高さ

/**
 * ルーティンのメイン画面：左に縦の予定表、右にパネル（Todo ／ 予定）。
 * 予定の追加・編集は右のパネルで行い、入力中は予定表に点線の枠でその場に表示します。
 *
 * @param {Object} deps
 * @param {ReturnType<import('./repo.js').createRoutineRepo>} deps.repo
 * @param {() => string} deps.getDate
 * @param {() => string | null} deps.getViewPattern
 * @param {(id: string | null) => void} deps.setViewPattern
 * @param {'todo' | 'blocks'} [deps.initialSide]
 * @returns {() => void}
 */
export function mountRoutineBoard(root, { repo, getDate, getViewPattern, setViewPattern, initialSide = 'todo', onSideChange }) {
  const state = {
    side: initialSide,   // 右のパネル：'todo' | 'blocks'
    editor: null,        // 予定の入力欄（開いているとき）
    draft: null,         // 入力中の予定（点線の枠で表示）
    scrolledToNow: false,
  };
  let todoCleanup = null;
  const setSide = (side) => { state.side = side; onSideChange?.(side); };
  let view = null; // 今描いている内容（パターンなど）
  let scrollTimer = null;

  const top = h('div', { class: 'board-top' });
  const timeline = h('div', { class: 'timeline', style: { height: `${24 * HOUR_PX}px` }, role: 'list' });
  const ghostLayer = h('div', { class: 'ghost-layer', 'aria-hidden': 'true' });
  const sideHead = h('div', { class: 'side-tabs', role: 'tablist', 'aria-label': '右のパネル' });
  const sideBody = h('div', { class: 'side-body', role: 'tabpanel' });
  const side = h('aside', { class: 'side', 'aria-label': 'Todo と予定' }, sideHead, sideBody);
  const timelineWrap = h('div', { class: 'timeline-wrap' }, timeline);
  const board = h('div', { class: 'board' }, timelineWrap, side);

  /** 予定表の中で、y（予定表の上端からの位置）が見えるようにスクロール */
  const scrollTimelineTo = (y, smooth = false) => {
    timelineWrap.scrollTo({ top: Math.max(0, y - timelineWrap.clientHeight * 0.3), behavior: smooth ? 'smooth' : 'auto' });
  };
  /** 左右の画面がちょうど見える位置まで、ページをスクロール */
  const bringBoardIntoView = () => {
    const y = board.getBoundingClientRect().top + window.scrollY - 64;
    if (Math.abs(window.scrollY - y) > 8) window.scrollTo({ top: y, behavior: 'smooth' });
  };

  const isToday = () => getDate() === toDateKey();

  function compute() {
    const dateKey = getDate();
    const datePatternId = repo.patternFor(dateKey).patternId;
    const shownId = getViewPattern() && repo.pattern(getViewPattern()) ? getViewPattern() : datePatternId;
    return {
      dateKey,
      datePatternId,
      shownId,
      pattern: repo.pattern(shownId),
      showingDatePattern: shownId === datePatternId,
      live: shownId === datePatternId && isToday(),
    };
  }

  // =========================================================
  // 上の部分（パターンの切り替え・いまの予定・見出し）
  // =========================================================

  function renderTop() {
    const { pattern, shownId, datePatternId, showingDatePattern, live } = view;

    const chips = h('div', { class: 'chips pattern-chips', role: 'group', 'aria-label': '表示するパターン' },
      repo.patterns().map((p) => h('button', {
        type: 'button',
        class: 'chip',
        'aria-pressed': String(p.id === shownId),
        onClick: () => setViewPattern(p.id === datePatternId ? null : p.id),
      }, p.name, p.id === datePatternId && h('span', { class: 'chip-badge' }, isToday() ? '今日' : 'この日'))),
      h('button', { type: 'button', class: 'chip chip-add', onClick: () => openPatternSheet({ repo, focus: 'add' }) },
        icon('plus'), '特殊日を追加'),
    );

    let nowCard = null;
    if (live && pattern.blocks.length) {
      const minute = nowMinutes();
      const current = blockAt(pattern.blocks, minute);
      const next = nextBlock(pattern.blocks, minute);
      nowCard = h('section', { class: 'now-card', style: current ? { '--cat': categoryOf(current.category).color } : null },
        h('div', { class: 'now-main' },
          h('span', { class: 'now-label' }, `いま ${formatTime(minute)}`),
          current
            ? h('strong', {}, current.title, h('small', {}, `あと${formatDuration(minutesLeft(current, minute))}（〜${formatTime(toMinutes(current.end))}）`))
            : h('strong', {}, '予定のない時間', h('small', {}, '自由に使えます')),
        ),
        next && h('div', { class: 'now-next' }, h('span', {}, '次'), h('b', {}, `${formatTime(toMinutes(next.start))} ${next.title}`)),
      );
    }

    const totals = new Map();
    for (const b of pattern.blocks) totals.set(b.category, (totals.get(b.category) ?? 0) + durationOf(b));

    top.replaceChildren(...[
      chips,
      !showingDatePattern && h('p', { class: 'notice view-notice' },
        icon('alert'), h('span', {}, `「${pattern.name}」を表示中です（この日のパターンではありません）。`),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => setViewPattern(null) }, 'この日に戻す')),
      nowCard,
      h('div', { class: 'schedule-head' },
        h('h2', {}, pattern.name, h('small', {}, `${pattern.blocks.length}件`)),
        h('div', { class: 'schedule-actions' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => openPatternSheet({ repo }) }, icon('tag'), 'パターンと使い分け'),
          h('button', { type: 'button', class: 'btn btn-primary btn-sm', onClick: () => openEditor({}) }, icon('plus'), '予定を追加'),
        ),
      ),
      pattern.blocks.length === 0 && h('div', { class: 'schedule-empty' },
        h('strong', {}, `「${pattern.name}」の予定はまだありません`),
        h('span', {}, '「予定を追加」か、ひな形・ほかのパターンから作れます。'),
        h('div', { class: 'template-buttons' },
          TEMPLATES.map((t) => h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => repo.setBlocks(shownId, t.blocks) }, t.name)),
          repo.patterns().filter((p) => p.id !== shownId && p.blocks.length).map((p) => h('button', {
            type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => repo.copyBlocks(shownId, p.id),
          }, `「${p.name}」をコピー`)),
        ),
      ),
      pattern.blocks.length > 0 && h('div', { class: 'cat-summary', 'aria-label': '種類ごとの合計時間' },
        [...totals].sort((a, b) => b[1] - a[1]).map(([id, minutes]) => h('span', { class: 'cat-pill', style: { '--cat': categoryOf(id).color } },
          categoryOf(id).name, h('b', {}, formatDuration(minutes))))),
    ].filter(Boolean));
  }

  // =========================================================
  // 左：縦の予定表
  // =========================================================

  function renderTimeline() {
    const { pattern, live, showingDatePattern, dateKey } = view;
    timeline.setAttribute('aria-label', `${pattern.name}の予定`);
    const nodes = [];

    for (let hour = 0; hour <= 24; hour++) {
      nodes.push(h('div', { class: `tl-hour${hour % 6 === 0 ? ' is-major' : ''}`, style: { top: `${hour * HOUR_PX}px` }, 'aria-hidden': 'true' },
        h('span', {}, `${hour}:00`)));
    }

    const current = live ? blockAt(pattern.blocks, nowMinutes()) : null;
    const editingId = state.editor?.blockId;

    for (const seg of layoutLanes(segmentsOf(pattern.blocks))) {
      const { block } = seg;
      const cat = categoryOf(block.category);
      const heightPx = Math.max(((seg.to - seg.from) / 60) * HOUR_PX - 2, MIN_BLOCK_PX);
      const compact = heightPx < 44;
      const duration = durationOf(block);
      nodes.push(h('button', {
        type: 'button',
        role: 'listitem',
        class: [
          'tl-block',
          compact && 'is-compact',
          block === current && 'is-now',
          seg.part === 'tail' && 'is-tail',
          block.id === editingId && 'is-editing',
        ].filter(Boolean).join(' '),
        style: {
          top: `${(seg.from / 60) * HOUR_PX + 1}px`,
          height: `${heightPx}px`,
          '--cat': cat.color,
          '--lane': String(seg.lane),
          '--lanes': String(seg.lanes),
        },
        'aria-label': `${block.title}、${formatTime(toMinutes(block.start))}から${formatTime(toMinutes(block.end))}、${formatDuration(duration)}。編集する`,
        onClick: (event) => {
          event.stopPropagation();
          // 入力中は、予定の上をタップしても開始時刻を合わせるだけ（入力を消さない）
          if (state.editor) state.editor.setStart(minuteAt(event));
          else openEditor({ block });
        },
      },
        h('span', { class: 'tl-title' }, block.title, seg.part === 'tail' && h('small', {}, '（前の日から）')),
        h('span', { class: 'tl-time' },
          `${formatTime(toMinutes(block.start))}–${formatTime(toMinutes(block.end))}`,
          !compact && ` ・${formatDuration(duration)}`),
      ));
    }

    // 時間つきの Todo を、その時刻に小さな印で表示（タップで右の Todo へ）
    if (showingDatePattern) {
      for (const todo of repo.todosFor(dateKey).filter((t) => t.due)) {
        const done = repo.isDone(todo, dateKey);
        nodes.push(h('button', {
          type: 'button',
          class: `tl-pin${done ? ' is-done' : ''}`,
          style: { top: `${(toMinutes(todo.due) / 60) * HOUR_PX}px` },
          title: `${todo.due.replace(/^0/, '')}まで：${todo.title}`,
          'aria-label': `Todo「${todo.title}」${todo.due.replace(/^0/, '')}まで${done ? '（完了）' : ''}。Todo を開く`,
          onClick: (event) => { event.stopPropagation(); showTodo(todo.id); },
        }, icon(done ? 'check' : 'list'), h('span', {}, todo.title)));
      }
    }

    let nowLine = null;
    if (live) {
      const minute = nowMinutes();
      nowLine = h('div', { class: 'tl-now', style: { top: `${(minute / 60) * HOUR_PX}px` }, 'aria-hidden': 'true' },
        h('span', {}, formatTime(minute)));
      nodes.push(nowLine);
    }

    nodes.push(ghostLayer);
    timeline.replaceChildren(...nodes);
    renderGhost();

    // 予定表の中を、今の時刻（今日以外は朝6時）までスクロール（最初の1回だけ）
    if (!state.scrolledToNow) {
      state.scrolledToNow = true;
      requestAnimationFrame(() => scrollTimelineTo(live ? (nowMinutes() / 60) * HOUR_PX : 6 * HOUR_PX));
    }
  }

  /** タップした位置の時刻（15分きざみ） */
  const minuteAt = (event) => {
    const rect = timeline.getBoundingClientRect();
    return Math.max(0, Math.min(1425, Math.floor(((event.clientY - rect.top) / HOUR_PX) * 4) * 15));
  };

  // 空いているところをタップ → 入力中なら開始時刻をそこに、そうでなければ追加を開く
  timeline.addEventListener('click', (event) => {
    if (event.target !== timeline && !event.target.closest('.tl-hour')) return;
    const minute = minuteAt(event);
    if (state.editor) state.editor.setStart(minute);
    else {
      const pad = (m) => formatTime(m).padStart(5, '0');
      openEditor({ defaults: { start: pad(minute), end: pad(minute + 60) } });
    }
  });

  /** 入力中の予定を点線の枠で表示 */
  function renderGhost() {
    const d = state.draft;
    if (!d) { ghostLayer.replaceChildren(); return; }
    const cat = categoryOf(d.category);
    ghostLayer.replaceChildren(...segmentsOf([d]).map((seg) => {
      const heightPx = Math.max(((seg.to - seg.from) / 60) * HOUR_PX - 2, MIN_BLOCK_PX);
      return h('div', {
        class: `tl-ghost${heightPx < 44 ? ' is-compact' : ''}`,
        style: { top: `${(seg.from / 60) * HOUR_PX + 1}px`, height: `${heightPx}px`, '--cat': cat.color },
      },
      h('span', { class: 'tl-title' }, d.title),
        h('span', { class: 'tl-time' }, `${formatTime(toMinutes(d.start))}–${formatTime(toMinutes(d.end))}`),
      );
    }));
  }

  function scrollGhostIntoView() {
    const ghost = ghostLayer.querySelector('.tl-ghost');
    if (!ghost) return;
    const wrapRect = timelineWrap.getBoundingClientRect();
    const rect = ghost.getBoundingClientRect();
    if (rect.top < wrapRect.top + 8 || rect.bottom > wrapRect.bottom - 8) {
      scrollTimelineTo(rect.top - wrapRect.top + timelineWrap.scrollTop, true);
    }
  }

  // =========================================================
  // 右：パネル（Todo ／ 予定）
  // =========================================================

  function renderSideHead() {
    const todos = repo.todosFor(getDate());
    const left = todos.filter((t) => !repo.isDone(t, getDate())).length;
    const tab = (id, label, extra) => h('button', {
      type: 'button',
      role: 'tab',
      class: 'side-tab',
      'aria-selected': String(state.side === id),
      onClick: () => { if (state.side !== id) { if (state.editor) closeEditor(); setSide(id); renderSide(); } },
    }, label, extra);
    sideHead.replaceChildren(
      tab('todo', 'Todo', left > 0 && h('span', { class: 'count' }, left)),
      tab('blocks', state.editor ? (state.editor.blockId ? '編集中' : '追加中') : '予定'),
    );
  }

  function renderSide() {
    renderSideHead();
    try { todoCleanup?.(); } catch (e) { console.error(e); }
    todoCleanup = null;

    if (state.side === 'todo') {
      sideBody.replaceChildren();
      todoCleanup = mountRoutineTodo(sideBody, { repo, getDate, compact: true });
      return;
    }
    if (state.editor) {
      sideBody.replaceChildren(state.editor.el);
      return;
    }
    // 予定の一覧（タップで編集）
    const { pattern } = view;
    sideBody.replaceChildren(h('div', { class: 'block-list-wrap' },
      h('button', { type: 'button', class: 'btn btn-primary btn-sm btn-block', onClick: () => openEditor({}) }, icon('plus'), '予定を追加'),
      pattern.blocks.length
        ? h('ul', { class: 'block-list' }, pattern.blocks.map((b) => h('li', {},
          h('button', { type: 'button', class: 'block-list-item', style: { '--cat': categoryOf(b.category).color }, onClick: () => openEditor({ block: b }) },
            h('span', { class: 'bl-time' }, `${formatTime(toMinutes(b.start))}–${formatTime(toMinutes(b.end))}`),
            h('span', { class: 'bl-title' }, b.title),
          ))))
        : h('p', { class: 'muted' }, 'まだ予定がありません。'),
    ));
  }

  function showTodo(todoId) {
    if (state.editor) closeEditor();
    setSide('todo');
    renderSide();
    const item = document.getElementById(`rt-check-${todoId}`)?.closest('li');
    if (item) {
      item.classList.add('flash');
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setTimeout(() => item.classList.remove('flash'), 1600);
    }
  }

  // =========================================================
  // 予定の入力欄
  // =========================================================

  function openEditor({ block = null, defaults = {} }) {
    if (state.editor) closeEditor();
    setSide('blocks');
    state.editor = createBlockEditor({
      repo,
      patternId: view.shownId,
      block,
      defaults,
      onDraft: (d) => {
        const moved = d && (d.start !== state.draft?.start || d.end !== state.draft?.end);
        state.draft = d;
        renderGhost();
        if (state.editor) renderSideHead();
        // 時刻が変わって枠が画面の外に出たら、見える位置までスクロール
        if (moved) { clearTimeout(scrollTimer); scrollTimer = setTimeout(scrollGhostIntoView, 250); }
      },
      onClose: () => closeEditor(),
    });
    renderSide();
    renderTimeline(); // 編集中の予定を薄く表示
    bringBoardIntoView();
    requestAnimationFrame(() => {
      scrollGhostIntoView();
      side.scrollTop = 0;
      if (window.matchMedia('(pointer: fine)').matches) state.editor?.focusTitle(); // スマホではキーボードで予定表が隠れないように
    });
  }

  function closeEditor() {
    state.editor = null;
    state.draft = null;
    renderGhost();
    renderSide();
    renderTimeline();
  }

  // =========================================================
  // 描画
  // =========================================================

  function render() {
    view = compute();
    // 別のパターンに切り替わったら入力欄は閉じる
    if (state.editor && state.editor.patternId !== view.shownId) { state.editor = null; state.draft = null; }
    renderTop();
    renderTimeline();
    if (state.editor || state.side === 'todo') renderSideHead(); // 入力中・Todo は中身を作り直さない（入力が消えないように）
    else renderSide();
  }

  root.append(h('div', { class: 'schedule' },
    top,
    board,
  ));

  view = compute();
  renderTop();
  renderTimeline();
  renderSide();
  const unsubscribe = repo.subscribe(render);
  const timer = setInterval(() => { if (isToday()) { view = compute(); renderTop(); renderTimeline(); } }, 30_000);

  return () => {
    unsubscribe();
    clearInterval(timer);
    try { todoCleanup?.(); } catch (e) { console.error(e); }
  };
}
