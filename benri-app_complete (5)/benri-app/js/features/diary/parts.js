import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { toDateKey } from '../../models/schema.js';
import { shortLabel } from './dates.js';

/** ♡の表示（読むだけ） */
export function hearts(rating, { size = 'md' } = {}) {
  return h('span', { class: `hearts hearts-${size}`, role: 'img', 'aria-label': rating ? `今日の評価 ♡${rating}` : '評価なし' },
    [1, 2, 3, 4, 5].map((n) => h('span', { class: n <= (rating ?? 0) ? 'is-on' : null }, icon(n <= (rating ?? 0) ? 'heartFill' : 'heart'))));
}

/** ♡を選ぶ（同じ数をもう一度押すと「なし」） */
export function heartPicker(value, onChange) {
  let current = value ?? null;
  const group = h('div', { class: 'heart-picker', role: 'radiogroup', 'aria-label': '今日の評価' });
  const label = h('span', { class: 'heart-label' });
  const words = ['', 'いまいち', 'まあまあ', 'ふつう', 'よかった', 'さいこう'];

  const render = () => {
    group.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h('button', {
      type: 'button',
      role: 'radio',
      class: `heart-btn${n <= (current ?? 0) ? ' is-on' : ''}`,
      'aria-checked': String(current === n),
      'aria-label': `♡${n}（${words[n]}）`,
      onClick: () => { current = current === n ? null : n; render(); onChange(current); },
    }, icon(n <= (current ?? 0) ? 'heartFill' : 'heart'))), label);
    label.textContent = current ? words[current] : '未選択';
  };
  render();
  return group;
}

/** 日記のカード（週・月・お気に入りの一覧で使う） */
export function entryCard(date, entry, { onOpen, onWrite } = {}) {
  const today = toDateKey();
  const isFuture = date > today;
  if (!entry) {
    return h('article', { class: `diary-card is-empty${isFuture ? ' is-future' : ''}` },
      h('header', { class: 'dc-head' }, h('span', { class: 'dc-date' }, shortLabel(date)), date === today && h('span', { class: 'tag' }, '今日')),
      isFuture
        ? h('p', { class: 'dc-none' }, 'まだ来ていない日')
        : h('button', { type: 'button', class: 'dc-write', onClick: () => onWrite?.(date) }, icon('plus'), '記録なし・書く'),
    );
  }
  return h('article', { class: `diary-card${entry.favorite ? ' is-fav' : ''}` },
    h('button', { type: 'button', class: 'dc-open', onClick: () => onOpen?.(date), 'aria-label': `${shortLabel(date)}の日記を開く` },
      h('header', { class: 'dc-head' },
        h('span', { class: 'dc-date' }, shortLabel(date)),
        date === today && h('span', { class: 'tag' }, '今日'),
        h('span', { class: 'dc-spacer' }),
        entry.favorite && h('span', { class: 'dc-star', 'aria-label': 'お気に入り' }, icon('starFill')),
        hearts(entry.rating, { size: 'sm' }),
      ),
      h('p', { class: 'dc-text' }, entry.text),
      entry.reflection && h('p', { class: 'dc-reflect' }, h('b', {}, '反省と改善'), entry.reflection),
    ),
  );
}

/** 文字数カウンター付きの入力欄 */
export function countedTextarea({ id, value, max, rows, placeholder }) {
  const textarea = h('textarea', { id, class: 'text-input', rows: String(rows), maxlength: String(max), placeholder }, value ?? '');
  const counter = h('span', { class: 'char-count', 'aria-live': 'polite' });
  const update = () => {
    const n = [...textarea.value].length;
    counter.textContent = `${n} / ${max}`;
    counter.dataset.level = n >= max ? 'max' : n >= max * 0.9 ? 'near' : '';
  };
  textarea.addEventListener('input', update);
  update();
  return { textarea, counter };
}
