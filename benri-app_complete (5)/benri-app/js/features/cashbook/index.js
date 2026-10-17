import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { defineFeature } from '../../core/feature.js';
import { showToast } from '../../core/toast.js';
import { toDateKey } from '../../models/schema.js';
import { accountOf } from './accounts.js';
import { balanceText, yen } from './money.js';
import { createCashbookRepo, totals } from './repo.js';
import { openAccountHelp } from './help-sheet.js';
import { mountInputView } from './input-view.js';
import { mountListView } from './list-view.js';
import { mountDeleteView } from './delete-view.js';

/**
 * 金銭出納帳
 *
 *   index.js       … ハブに出す情報、モードの切り替え、CSV保存（このファイル）
 *   accounts.js    … 勘定科目の一覧と説明
 *   money.js       … 金額の読み取り・表示
 *   repo.js        … 帳簿のデータ（残高は保存せず毎回計算）
 *   ledger.js      … 帳簿の表（3つのモードで共通）
 *   input-view.js  … 追加入力モード
 *   list-view.js   … 表示モード（項目ごとの検索）
 *   delete-view.js … 削除モード
 *   help-sheet.js  … 勘定科目の説明
 *
 * 画面のURL
 *   #/app/cashbook/input   追加入力
 *   #/app/cashbook/view    表示（検索）
 *   #/app/cashbook/delete  削除
 */

const MODES = [
  { id: 'input', label: '追加入力', icon: 'pencil' },
  { id: 'view', label: '表示', icon: 'list' },
  { id: 'delete', label: '削除', icon: 'trash' },
];

/** demo アカウントにだけサンプルを入れる（初回のみ） */
function seedDemo(ctx, repo) {
  if (ctx.user.id !== 'demo' || ctx.store.get('demoSeeded', false)) return;
  ctx.store.set('demoSeeded', true);
  if (repo.count() > 0) return;
  const today = toDateKey();
  const [y, m] = today.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const cur = today.slice(0, 7);
  const day = (ym, d) => `${ym}-${String(d).padStart(2, '0')}`;
  const thisDay = Number(today.slice(8));
  const d = (n) => day(cur, Math.min(n, thisDay));
  repo.setOpening(12000);
  const samples = [
    [day(prev, 3), '参考書（英単語）', 'education', null, 1320],
    [day(prev, 10), 'お小遣い', 'allowance', 5000, null],
    [day(prev, 14), '友だちの誕生日プレゼント', 'social', null, 1500],
    [day(prev, 21), '映画', 'entertainment', null, 1200],
    [day(prev, 25), 'バイト代', 'salary', 18000, null],
    [d(1), '定期券', 'transport', null, 4800],
    [d(2), 'コンビニ 昼ごはん', 'food', null, 640],
    [null, 'ジュース', 'food', null, 150],
    [d(5), 'ノートとペン', 'daily', null, 520],
    [d(8), '貯金', 'deposit', null, 10000],
    [d(10), 'お小遣い', 'allowance', 5000, null],
    [d(12), 'ラーメン（部活のあと）', 'food', null, 900],
    [d(14), 'フリマで本を売った', 'sales', 800, null],
    [d(15), 'カフェで勉強', 'food', null, 480],
  ];
  for (const [date, content, account, income, expense] of samples) repo.add({ date, content, account, income, expense });
}

/** CSV（Excel で文字化けしないよう BOM つき）で保存 */
function downloadCsv(repo, rows, filtered) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [['年月日', '内容', '勘定科目', '入金', '出金', '残高']];
  if (!filtered) lines.push(['', '前期繰越', '', '', '', repo.opening()]);
  for (const r of rows) lines.push([r.date ?? '', r.content, accountOf(r.account)?.name ?? '', r.income ?? '', r.expense ?? '', r.balance]);
  if (filtered) {
    const t = totals(rows);
    lines.push(['', '合計（検索結果）', '', t.income, t.expense, '']);
  }
  const csv = `﻿${lines.map((l) => l.map(esc).join(',')).join('\r\n')}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: `金銭出納帳_${toDateKey()}${filtered ? '_検索結果' : ''}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`${rows.length}行をCSVで保存しました`);
}

export default defineFeature({
  id: 'cashbook',
  title: '金銭出納帳',
  subtitle: 'お金の出入りと残高',
  icon: 'wallet',
  color: '#3F7A3A',
  keywords: ['金銭出納帳', 'きんせんすいとうちょう', 'お金', '家計簿', 'こづかい帳', '残高', '入金', '出金', '勘定科目'],

  summary(ctx) {
    const repo = createCashbookRepo(ctx.store);
    seedDemo(ctx, repo);
    if (!repo.count() && !repo.opening()) return 'まだ記録がありません';
    const month = toDateKey().slice(0, 7);
    let last = null;
    const out = repo.entries().reduce((sum, e) => {
      if (e.date) last = e.date;
      return (last ?? '').startsWith(month) ? sum + (e.expense ?? 0) : sum;
    }, 0);
    return `残高 ¥${balanceText(repo.balance())}・今月の出金 ¥${yen(out)}`;
  },

  mount(root, ctx) {
    const repo = createCashbookRepo(ctx.store);
    seedDemo(ctx, repo);

    const mode = MODES.find((m) => m.id === ctx.subpath);
    if (!mode) {
      const last = repo.pref('mode', 'input');
      queueMicrotask(() => ctx.go(MODES.some((m) => m.id === last) ? last : 'input', { replace: true }));
      return () => {};
    }
    if (mode.id !== 'delete') repo.setPref('mode', mode.id); // 次に開いたとき削除モードからは始めない

    // 上部バー右：勘定科目の説明
    let helpFocus = null;
    const openHelp = (focus, scroll = false) => openAccountHelp({ focus: focus ?? helpFocus, scroll });
    ctx.toolbar?.append(h('button', { type: 'button', class: 'tool-btn', onClick: () => openHelp(), 'aria-label': '勘定科目の説明を開く' },
      icon('help'), h('span', { class: 'cb-tool-label' }, '科目の説明')));

    const tabs = h('div', { class: 'tabs cb-tabs', role: 'tablist', 'aria-label': 'モード' },
      MODES.map((m) => h('button', {
        type: 'button',
        role: 'tab',
        class: 'tab',
        'data-mode': m.id,
        'aria-selected': String(m.id === mode.id),
        tabIndex: m.id === mode.id ? 0 : -1,
        onClick: () => { if (m.id !== mode.id) ctx.go(m.id, { replace: true }); },
      }, icon(m.icon), h('span', {}, m.label))));

    const panel = h('section', { class: 'cb-panel', role: 'tabpanel', 'data-mode': mode.id });
    root.append(h('div', { class: 'cb', 'data-mode': mode.id }, tabs, panel));

    if (mode.id === 'input') {
      return mountInputView(panel, { repo, openHelp, setHelpFocus: (id) => { helpFocus = id || null; } });
    }
    if (mode.id === 'view') {
      return mountListView(panel, { repo, exportCsv: (rows, filtered) => downloadCsv(repo, rows, filtered) });
    }
    return mountDeleteView(panel, { repo });
  },
});
