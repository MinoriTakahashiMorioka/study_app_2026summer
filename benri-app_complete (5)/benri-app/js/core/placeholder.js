import { h } from './dom.js';
import { icon } from './icons.js';

/** 未実装の機能用の案内（ステップ2・3で各機能が本物の画面に置き換えます） */
export function placeholder({ iconName, heading, text, items = [] }) {
  return h('section', { class: 'placeholder' },
    h('div', { class: 'placeholder-icon' }, icon(iconName)),
    h('h2', {}, heading),
    h('p', {}, text),
    items.length > 0 && h('ul', {}, items.map((item) => h('li', {}, item))),
  );
}
