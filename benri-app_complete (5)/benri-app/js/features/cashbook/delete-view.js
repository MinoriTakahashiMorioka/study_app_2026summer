import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { showToast } from '../../core/toast.js';
import { yen } from './money.js';
import { totals } from './repo.js';
import { groupedRows, ledgerHead, ledgerRow, openingRow, withWhen } from './ledger.js';

/**
 * 削除モード
 *  - 行をタップ（またはチェック）して選び、下のバーの「削除」で消す
 *  - 「すべて選択」と、月ごとの「この月をすべて選択」
 *  - 消す前に確認。消したあとも「元に戻す」ができる
 */
export function mountDeleteView(root, { repo }) {
  const selected = new Set();
  let confirming = false;

  const allBox = h('input', { type: 'checkbox', class: 'cb-checkbox', 'aria-label': 'すべて選択' });
  allBox.addEventListener('change', () => {
    const ids = repo.entries().map((e) => e.id);
    if (allBox.checked) ids.forEach((id) => selected.add(id)); else selected.clear();
    confirming = false;
    render();
  });

  const table = h('div', { class: 'cb-ledger is-selecting', role: 'table', 'aria-label': '削除する行を選ぶ' });
  const bar = h('div', { class: 'cb-delete-bar', role: 'region', 'aria-label': '選んだ行の削除' });

  root.append(
    h('p', { class: 'cb-delete-note' }, icon('trash'), '消したい行をタップして選んでください。消した行の分、下の残高は自動で計算し直されます。'),
    h('label', { class: 'cb-select-all' }, allBox, h('span', {}, 'すべて選択')),
    table,
    bar,
  );

  function toggle(id) {
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    confirming = false;
    render();
  }

  function render() {
    const rows = withWhen(repo.ledger());
    for (const id of [...selected]) if (!rows.some((r) => r.id === id)) selected.delete(id);
    allBox.checked = rows.length > 0 && selected.size === rows.length;
    allBox.indeterminate = selected.size > 0 && selected.size < rows.length;
    allBox.disabled = rows.length === 0;

    const grouped = groupedRows(rows, (row) => {
      const box = h('input', { type: 'checkbox', class: 'cb-checkbox', tabindex: '-1', 'aria-hidden': 'true', checked: selected.has(row.id) });
      return ledgerRow(row, {
        check: box,
        attrs: {
          class: `cb-row is-clickable${selected.has(row.id) ? ' is-selected' : ''}`,
          role: 'row',
          tabindex: '0',
          'aria-selected': String(selected.has(row.id)),
          onClick: () => toggle(row.id),
          onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(row.id); } },
        },
      });
    });
    table.replaceChildren(...[
      ledgerHead({ check: ' ' }),
      openingRow(repo.opening(), { check: null }),
      ...addMonthSelectors(grouped),
      rows.length === 0 && h('div', { class: 'cb-empty', role: 'row' }, h('span', { role: 'cell' }, icon('check'), '消せる行はありません。')),
    ].filter(Boolean));

    renderBar(rows);
  }

  /** 月の区切りの右に「この月を選ぶ」をつける */
  function addMonthSelectors(grouped) {
    grouped.forEach((el, i) => {
      if (!el.classList.contains('cb-month')) return;
      const ids = [];
      for (let j = i + 1; j < grouped.length && !grouped[j].classList.contains('cb-month'); j++) ids.push(grouped[j].dataset.id);
      const all = ids.every((id) => selected.has(id));
      el.append(h('span', { role: 'cell', class: 'cb-month-action' },
        h('button', {
          type: 'button',
          class: 'cb-mini-btn',
          onClick: () => { ids.forEach((id) => (all ? selected.delete(id) : selected.add(id))); confirming = false; render(); },
        }, all ? 'この月の選択を外す' : 'この月をすべて選択')));
    });
    return grouped;
  }

  function renderBar(rows) {
    const picked = rows.filter((r) => selected.has(r.id));
    bar.hidden = rows.length === 0;
    if (!picked.length) {
      bar.dataset.state = 'idle';
      bar.replaceChildren(h('p', { class: 'cb-delete-count' }, '行が選ばれていません'));
      return;
    }
    const t = totals(picked);
    const sums = [t.income && `入金 ${yen(t.income)}`, t.expense && `出金 ${yen(t.expense)}`].filter(Boolean).join(' / ');
    if (confirming) {
      bar.dataset.state = 'confirm';
      bar.replaceChildren(
        h('p', { class: 'confirm-text' }, icon('alert'), `${picked.length}件を削除しますか？`),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => { confirming = false; render(); } }, 'やめる'),
        h('button', { type: 'button', class: 'btn btn-danger btn-sm cb-confirm-delete', onClick: () => remove(picked) }, icon('trash'), '削除する'),
      );
      bar.querySelector('.cb-confirm-delete').focus();
      return;
    }
    bar.dataset.state = 'selected';
    bar.replaceChildren(
      h('p', { class: 'cb-delete-count' }, h('strong', {}, `${picked.length}件`), 'を選択中', sums && h('small', {}, sums)),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => { selected.clear(); render(); } }, '選択を解除'),
      h('button', { type: 'button', class: 'btn btn-danger btn-sm', onClick: () => { confirming = true; render(); } }, icon('trash'), '削除'),
    );
  }

  function remove(picked) {
    const backup = picked.map(({ balance, when, ...entry }) => entry);
    repo.remove(backup.map((e) => e.id));
    selected.clear();
    confirming = false;
    render();
    showToast(`${backup.length}件を削除しました`, { action: { label: '元に戻す', onClick: () => repo.restore(backup) } });
  }

  render();
  return repo.subscribe(render);
}
