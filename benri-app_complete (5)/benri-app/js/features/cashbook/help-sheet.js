import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { openSheet } from '../../core/sheet.js';
import { ACCOUNTS, GROUPS } from './accounts.js';

/**
 * 「勘定科目の説明」シート。上部バー右の「？ 科目の説明」から開きます。
 * 上に金銭出納帳の書き方、下に科目ごとの説明と例。上の検索欄で科目を絞り込めます。
 *
 * @param {Object} [options]
 * @param {string} [options.focus]   目立たせる科目の id（入力中に選んでいた科目）
 * @param {boolean} [options.scroll] その科目の位置まで最初にスクロールするか
 */
export function openAccountHelp({ focus, scroll = false } = {}) {
  return openSheet({
    title: '勘定科目の説明',
    render() {
      const query = h('input', {
        class: 'text-input',
        type: 'search',
        placeholder: '科目名や例で探す（例: スマホ、バイト）',
        'aria-label': '勘定科目を探す',
        enterKeyHint: 'search',
      });
      const list = h('div', { class: 'cb-help-list' });
      const empty = h('p', { class: 'cb-help-empty', hidden: true }, '当てはまる科目が見つかりません。「雑費」か「雑収入」を使いましょう。');

      const render = () => {
        const q = query.value.normalize('NFKC').trim().toLowerCase();
        const hit = (a) => !q || `${a.name} ${a.desc} ${a.examples}`.normalize('NFKC').toLowerCase().includes(q);
        let count = 0;
        list.replaceChildren(...GROUPS.map((g) => {
          const items = ACCOUNTS.filter((a) => a.kind === g.kind && hit(a));
          count += items.length;
          if (!items.length) return null;
          return h('section', { class: 'cb-help-group', 'data-kind': g.kind },
            h('h3', { class: 'cb-help-group-title' }, h('span', { class: 'cb-kind-dot' }), g.label),
            h('dl', {}, items.map((a) => h('div', { class: 'cb-help-item', 'data-focus': a.id === focus ? 'true' : null },
              h('dt', {}, a.name),
              h('dd', {},
                h('p', {}, a.desc),
                h('p', { class: 'cb-help-ex' }, h('span', {}, '例'), a.examples),
              ),
            ))),
          );
        }).filter(Boolean));
        empty.hidden = count > 0;
      };
      query.addEventListener('input', render);
      render();
      if (scroll) queueMicrotask(() => list.querySelector('[data-focus="true"]')?.scrollIntoView({ block: 'center' }));

      return h('div', { class: 'cb-help' },
        h('div', { class: 'cb-help-intro' },
          h('p', { class: 'cb-help-lead' }, icon('help'), h('strong', {}, '勘定科目とは？')),
          h('p', {}, 'お金が「何のために」出入りしたかを分ける名前です。科目をつけておくと、あとで「食費にいくら使ったか」などがすぐ分かります。分からないときは空けたままでも大丈夫です。'),
          h('div', { class: 'cb-help-formula', 'aria-label': '残高の計算' },
            h('span', {}, '前の行の残高'), h('b', { class: 'is-in' }, '＋ 入金'), h('b', { class: 'is-out' }, '− 出金'), h('span', {}, '＝ 残高'),
          ),
          h('p', { class: 'cb-help-note' }, '残高はアプリが自動で計算します。途中の行を直したり消したりしても、それより下の残高は自動で直ります。'),
        ),
        query,
        list,
        empty,
      );
    },
  });
}
