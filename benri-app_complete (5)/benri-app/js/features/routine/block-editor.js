import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { CATEGORIES, durationOf, formatDuration, formatTime, segmentsOf, toMinutes } from './model.js';

const QUICK = [15, 30, 60, 90, 120];
const pad = (minutes) => formatTime(minutes).padStart(5, '0');

/** 名前から、それらしい種類を推測する */
function guessCategory(text) {
  const rules = [
    ['sleep', /寝|睡眠|就寝|昼寝/], ['meal', /ごはん|ご飯|食|ランチ|朝食|昼食|夕食|弁当|おやつ/],
    ['study', /勉強|宿題|復習|予習|塾|読書|課題/], ['school', /授業|学校|仕事|会社|バイト|会議|講義/],
    ['exercise', /部活|運動|ジム|ラン|散歩|筋トレ|ストレッチ|ヨガ/], ['move', /通学|通勤|移動|帰宅|電車|バス/],
    ['care', /身支度|風呂|シャワー|掃除|洗濯|家事|歯|準備/], ['free', /自由|ゲーム|動画|テレビ|休憩|趣味/],
  ];
  return rules.find(([, re]) => re.test(text))?.[0] ?? null;
}

/**
 * 予定の追加・編集フォーム（予定表の右側のパネルに表示）。
 * 入力が変わるたびに onDraft で下書きを知らせるので、予定表側でその場に枠を表示できます。
 *
 * @param {Object} options
 * @param {ReturnType<import('./repo.js').createRoutineRepo>} options.repo
 * @param {string} options.patternId
 * @param {object} [options.block]      編集する予定（なければ追加）
 * @param {{ start?: string, end?: string }} [options.defaults]
 * @param {(draft: { start, end, title, category, id? }) => void} options.onDraft
 * @param {(result: { saved?: object, deleted?: boolean }) => void} options.onClose
 * @returns {{ el: HTMLElement, setStart: (minute: number) => void, patternId: string, blockId: string | null }}
 */
export function createBlockEditor({ repo, patternId, block = null, defaults = {}, onDraft, onClose }) {
  const isEdit = Boolean(block);
  const pattern = repo.pattern(patternId);
  const last = pattern?.blocks.at(-1);
  const initial = block ?? {
    title: '',
    start: defaults.start ?? (last ? last.end : '07:00'),
    end: defaults.end ?? (last ? pad(toMinutes(last.end) + 60) : '08:00'),
    category: 'other',
    memo: '',
  };
  let category = initial.category;
  let categoryTouched = isEdit;

  // ---------- 入力欄 ----------

  const title = h('input', {
    id: 'blk-title',
    class: 'text-input',
    type: 'text',
    maxlength: '30',
    autocomplete: 'off',
    placeholder: '例: 朝ごはん、授業',
    value: initial.title,
  });
  const start = h('input', { id: 'blk-start', class: 'text-input', type: 'time', step: '300', value: initial.start });
  const end = h('input', { id: 'blk-end', class: 'text-input', type: 'time', step: '300', value: initial.end });
  const durationText = h('p', { class: 'duration-text', 'aria-live': 'polite' });
  const overlapText = h('p', { class: 'overlap-text', role: 'status', hidden: true });

  const quick = h('div', { class: 'quick-times', role: 'group', 'aria-label': '長さを選ぶ' },
    QUICK.map((m) => h('button', {
      type: 'button',
      class: 'chip chip-sm',
      onClick: () => { if (start.value) { end.value = pad(toMinutes(start.value) + m); changed(); } },
    }, formatDuration(m))));

  const categories = h('div', { class: 'label-choices', role: 'group', 'aria-label': '種類' });
  const renderCategories = () => categories.replaceChildren(...CATEGORIES.map((c) => h('button', {
    type: 'button',
    class: 'chip chip-sm label-chip',
    style: { '--label': c.color },
    'aria-pressed': String(category === c.id),
    onClick: () => { category = c.id; categoryTouched = true; renderCategories(); changed(); },
  }, h('i', { class: 'swatch', 'aria-hidden': 'true' }), c.name)));

  const memo = h('textarea', { id: 'blk-memo', class: 'text-input', rows: '2', maxlength: '300', placeholder: '場所・持ち物など（任意）' }, initial.memo ?? '');

  // ---------- 入力が変わったとき ----------

  const draft = () => ({ id: block?.id ?? null, title: title.value.trim() || '新しい予定', start: start.value, end: end.value, category });

  function changed() {
    const valid = start.value && end.value && start.value !== end.value;
    if (valid) {
      const minutes = durationOf({ start: start.value, end: end.value });
      const crosses = toMinutes(end.value) < toMinutes(start.value);
      durationText.textContent = `${formatDuration(minutes)}${crosses ? '（次の日の朝まで）' : ''}`;

      // ほかの予定と重なっていないか
      const mine = segmentsOf([{ start: start.value, end: end.value }]);
      const others = segmentsOf((repo.pattern(patternId)?.blocks ?? []).filter((b) => b.id !== block?.id));
      const hits = [...new Set(others
        .filter((o) => mine.some((m) => m.from < o.to && o.from < m.to))
        .map((o) => o.block.title))];
      overlapText.hidden = hits.length === 0;
      overlapText.replaceChildren(icon('alert'), h('span', {}, `「${hits.slice(0, 2).join('」「')}」${hits.length > 2 ? 'など' : ''}と時間が重なっています`));
    } else {
      durationText.textContent = start.value && start.value === end.value ? '開始と終了が同じです' : '';
      overlapText.hidden = true;
    }
    onDraft(valid ? draft() : null);
  }

  title.addEventListener('input', () => {
    if (!categoryTouched) {
      const g = guessCategory(title.value);
      if (g && g !== category) { category = g; renderCategories(); }
    }
    changed();
  });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.isComposing || e.keyCode === 229)) e.preventDefault(); });
  start.addEventListener('input', changed);
  end.addEventListener('input', changed);

  // ---------- 保存・削除 ----------

  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const footer = h('div', { class: 'editor-actions' });

  const renderFooter = () => footer.replaceChildren(...[
    h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, icon('check'), isEdit ? '保存' : 'この時間に追加'),
    h('div', { class: 'editor-actions-row' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => onClose({}) }, 'キャンセル'),
      isEdit && h('button', { type: 'button', class: 'btn btn-danger-text btn-sm', onClick: askDelete }, icon('trash'), '削除'),
    ),
  ].filter(Boolean));

  function askDelete() {
    footer.replaceChildren(h('div', { class: 'editor-confirm' },
      h('p', { class: 'confirm-text' }, 'この予定を削除しますか？'),
      h('div', { class: 'editor-actions-row' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: renderFooter }, 'やめる'),
        h('button', { type: 'button', class: 'btn btn-danger btn-sm', onClick: () => { repo.removeBlock(patternId, block.id); onClose({ deleted: true }); } }, '削除する'),
      ),
    ));
    footer.querySelector('.btn-danger').focus();
  }

  const form = h('form', {
    class: 'block-editor',
    novalidate: true,
    onSubmit: (event) => {
      event.preventDefault();
      const input = { title: title.value, start: start.value, end: end.value, category, memo: memo.value };
      try {
        const saved = isEdit ? repo.updateBlock(patternId, block.id, input) : repo.addBlock(patternId, input);
        onClose({ saved });
      } catch (err) {
        error.replaceChildren(icon('alert'), h('span', {}, err.message));
        error.hidden = false;
        if (!title.value.trim()) title.focus();
      }
    },
  },
    h('div', { class: 'editor-head' },
      h('h3', {}, isEdit ? '予定を編集' : '予定を追加'),
      h('span', { class: 'muted' }, `「${pattern.name}」`),
    ),
    h('p', { class: 'editor-hint' }, '左の予定表をタップすると、開始時刻をそこに合わせられます。'),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'blk-title' }, '予定'), title),
    h('div', { class: 'time-pair' },
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'blk-start' }, '開始'), start),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'blk-end' }, '終了'), end),
    ),
    durationText,
    quick,
    overlapText,
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, '種類'), categories),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'blk-memo' }, 'メモ'), memo),
    error,
    footer,
  );

  renderCategories();
  renderFooter();
  // 最初の下書きを知らせる（描画のあとで）
  queueMicrotask(changed);

  return {
    el: form,
    patternId,
    blockId: block?.id ?? null,
    /** 開始時刻を変える（長さはそのまま） */
    setStart(minute) {
      const length = start.value && end.value && start.value !== end.value ? durationOf({ start: start.value, end: end.value }) : 60;
      start.value = pad(minute);
      end.value = pad(minute + length);
      changed();
    },
    focusTitle() { title.focus({ preventScroll: true }); },
  };
}
