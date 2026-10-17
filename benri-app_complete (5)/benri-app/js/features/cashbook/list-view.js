import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { toDateKey } from '../../models/schema.js';
import { ACCOUNTS, GROUPS, accountOf } from './accounts.js';
import { balanceText, parseAmount, yen } from './money.js';
import { totals } from './repo.js';
import { groupedRows, ledgerHead, ledgerRow, openingRow, withWhen } from './ledger.js';

/**
 * 表示モード
 *  - いちばん上に「現在の残高」を大きく
 *  - 検索：期間・内容・勘定科目・入金の金額・出金の金額・区分（入金／出金）を項目ごとに指定できる
 *  - 見つかった行の入金・出金の合計と、出金の内訳（科目別の棒グラフ）
 *  - 帳簿は月ごとに区切り、各月の合計つき
 */

const EMPTY = { from: '', to: '', q: '', account: '', inMin: '', inMax: '', outMin: '', outMax: '', side: 'all' };
const NONE = '__none';

const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase();

function periodOf(kind) {
  const today = toDateKey();
  const [y, m] = today.split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const lastDay = (yy, mm) => new Date(yy, mm, 0).getDate();
  if (kind === 'thisMonth') return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${lastDay(y, m)}` };
  if (kind === 'lastMonth') {
    const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
    return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${lastDay(py, pm)}` };
  }
  if (kind === 'thisYear') return { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: '', to: '' };
}

export function mountListView(root, { repo, exportCsv }) {
  /** @type {typeof EMPTY} */
  let s = { ...EMPTY, ...(repo.pref('search', {}) ?? {}) };
  let open = repo.pref('searchOpen', matchMedia('(min-width: 720px)').matches);

  // ---------- 検索欄 ----------
  const inputs = {};
  const text = (key, props) => {
    const el = h('input', { class: 'text-input', autocomplete: 'off', ...props, value: s[key] });
    el.addEventListener('input', () => { s[key] = el.value; changed(); });
    inputs[key] = el;
    return el;
  };
  const amount = (key, label) => text(key, { type: 'text', inputmode: 'numeric', placeholder: label, 'aria-label': label, class: 'text-input cb-amount' });

  const accountSel = h('select', { class: 'text-input', 'aria-label': '勘定科目で絞り込む' },
    h('option', { value: '' }, 'すべての科目'),
    h('option', { value: NONE }, '科目なし（未設定）'),
    GROUPS.map((g) => h('optgroup', { label: g.label },
      ACCOUNTS.filter((a) => a.kind === g.kind).map((a) => h('option', { value: a.id }, a.name)))),
  );
  accountSel.value = s.account;
  accountSel.addEventListener('change', () => { s.account = accountSel.value; changed(); });
  inputs.account = accountSel;

  const sideBtns = [['all', 'すべて'], ['in', '入金だけ'], ['out', '出金だけ']].map(([value, label]) =>
    h('button', { type: 'button', class: 'cb-seg-btn', 'data-value': value, onClick: () => { s.side = value; changed(); } }, label));

  const periodChips = [['thisMonth', '今月'], ['lastMonth', '先月'], ['thisYear', '今年'], ['all', '全期間']].map(([kind, label]) =>
    h('button', { type: 'button', class: 'chip chip-sm', 'data-kind': kind, onClick: () => { Object.assign(s, periodOf(kind)); syncInputs(); changed(); } }, label));

  const row = (label, ...controls) => h('div', { class: 'cb-search-row' },
    h('span', { class: 'cb-search-label' }, label),
    h('div', { class: 'cb-search-controls' }, controls));

  const panel = h('div', { class: 'cb-search-panel', id: 'cb-search-panel' },
    row('期間',
      h('div', { class: 'cb-chips' }, periodChips),
      h('div', { class: 'cb-range' },
        text('from', { type: 'date', 'aria-label': '期間のはじめ' }), h('span', {}, '〜'), text('to', { type: 'date', 'aria-label': '期間のおわり' })),
    ),
    row('内容', text('q', { type: 'search', placeholder: '言葉を入れて探す（例: 昼）', 'aria-label': '内容で探す', enterKeyHint: 'search' })),
    row('勘定科目', accountSel),
    row('入金', h('div', { class: 'cb-range' }, amount('inMin', '下限 円'), h('span', {}, '〜'), amount('inMax', '上限 円'))),
    row('出金', h('div', { class: 'cb-range' }, amount('outMin', '下限 円'), h('span', {}, '〜'), amount('outMax', '上限 円'))),
    row('区分', h('div', { class: 'cb-seg', role: 'group', 'aria-label': '入金・出金で絞り込む' }, sideBtns)),
  );

  const toggleBadge = h('span', { class: 'cb-badge' });
  const toggle = h('button', { type: 'button', class: 'cb-search-toggle', 'aria-controls': 'cb-search-panel' },
    icon('search'), h('span', {}, '項目ごとに検索'), toggleBadge, h('span', { class: 'cb-chevron' }, icon('chevronDown')));
  toggle.addEventListener('click', () => { open = !open; repo.setPref('searchOpen', open); syncOpen(); });

  const resultCount = h('p', { class: 'cb-result-count', role: 'status' });
  const clearBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: clear }, icon('close'), '条件をクリア');

  const search = h('section', { class: 'cb-search', 'aria-label': '検索' },
    toggle, panel,
    h('div', { class: 'cb-search-foot' }, resultCount, clearBtn),
  );

  // ---------- 結果 ----------
  const hero = h('section', { class: 'cb-hero', 'aria-label': '残高と合計' });
  const breakdown = h('section', { class: 'cb-breakdown', 'aria-label': '出金の内訳' });
  const table = h('div', { class: 'cb-ledger is-readonly', role: 'table', 'aria-label': '金銭出納帳' });

  root.append(hero, search, h('div', { class: 'cb-view-grid' }, table, breakdown));

  function syncInputs() {
    for (const [key, el] of Object.entries(inputs)) if (el.value !== s[key]) el.value = s[key];
  }
  function syncOpen() {
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  }

  /** 入力された金額の条件（間違っていれば欄に印をつけて無視） */
  function range(minKey, maxKey) {
    const read = (key) => {
      try { const n = parseAmount(s[key]); inputs[key].removeAttribute('aria-invalid'); return n; } catch { inputs[key].setAttribute('aria-invalid', 'true'); return null; }
    };
    return { min: read(minKey), max: read(maxKey) };
  }

  function activeCount() {
    let n = 0;
    if (s.from || s.to) n++;
    if (s.q.trim()) n++;
    if (s.account) n++;
    if (s.inMin || s.inMax) n++;
    if (s.outMin || s.outMax) n++;
    if (s.side !== 'all') n++;
    return n;
  }

  function filter(rows) {
    const q = norm(s.q).trim();
    const inR = range('inMin', 'inMax');
    const outR = range('outMin', 'outMax');
    const inRange = (v, r) => (r.min == null && r.max == null) || (v != null && (r.min == null || v >= r.min) && (r.max == null || v <= r.max));
    return rows.filter((r) => {
      if ((s.from || s.to) && !r.when) return false;
      if (s.from && r.when < s.from) return false;
      if (s.to && r.when > s.to) return false;
      if (q && !norm(r.content).includes(q)) return false;
      if (s.account === NONE ? r.account : s.account && r.account !== s.account) return false;
      if (!inRange(r.income, inR)) return false;
      if (!inRange(r.expense, outR)) return false;
      if (s.side === 'in' && !r.income) return false;
      if (s.side === 'out' && !r.expense) return false;
      return true;
    });
  }

  function clear() {
    s = { ...EMPTY };
    syncInputs();
    changed();
  }

  function changed() {
    repo.setPref('search', s);
    render();
  }

  function stat(label, value, cls) {
    return h('div', { class: `cb-stat ${cls ?? ''}` }, h('span', {}, label), h('strong', {}, value));
  }

  function render() {
    const all = withWhen(repo.ledger());
    const rows = filter(all);
    const n = activeCount();
    const t = totals(rows);
    const now = repo.balance();

    // 期間チップ・区分ボタンの選択状態
    for (const chip of periodChips) {
      const p = periodOf(chip.dataset.kind);
      chip.setAttribute('aria-pressed', String(p.from === s.from && p.to === s.to));
    }
    for (const b of sideBtns) b.setAttribute('aria-pressed', String(b.dataset.value === s.side));
    toggleBadge.textContent = n ? `${n}つの条件` : '';
    toggleBadge.hidden = !n;
    clearBtn.hidden = !n;
    resultCount.replaceChildren(n
      ? h('span', {}, h('strong', {}, `${rows.length}件`), ` 見つかりました（全${all.length}件）`)
      : h('span', {}, `全${all.length}件`));

    hero.replaceChildren(
      h('div', { class: 'cb-hero-main' },
        h('span', { class: 'cb-hero-label' }, icon('wallet'), '現在の残高'),
        h('strong', { class: 'cb-hero-value', 'data-negative': String(now < 0) }, h('small', {}, '¥'), balanceText(now)),
        h('span', { class: 'cb-hero-sub' }, `はじめの残高 ¥${balanceText(repo.opening())} から`),
      ),
      h('div', { class: 'cb-hero-stats' },
        h('p', { class: 'cb-hero-scope' }, n ? '検索結果の合計' : 'すべての合計'),
        stat('入金', `+${yen(t.income)}`, 'is-in'),
        stat('出金', `−${yen(t.expense)}`, 'is-out'),
        stat('差引', `${t.income - t.expense < 0 ? '−' : '+'}${yen(t.income - t.expense)}`, t.income - t.expense < 0 ? 'is-out' : 'is-in'),
      ),
    );

    renderBreakdown(rows, t.expense);

    const keyword = s.q.trim();
    table.replaceChildren(...[
      ledgerHead(),
      !n && openingRow(repo.opening()),
      ...groupedRows(rows, (row) => ledgerRow(row, { keyword })),
      rows.length === 0 && h('div', { class: 'cb-empty', role: 'row' },
        h('span', { role: 'cell' }, icon('search'), all.length ? '条件に合う行がありません。' : 'まだ帳簿に何も書いていません。「入力」タブから書けます。'),
        n ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: clear }, '条件をクリア') : null),
    ].filter(Boolean));
  }

  function renderBreakdown(rows, totalOut) {
    if (!totalOut) { breakdown.hidden = true; return; }
    breakdown.hidden = false;
    const sums = new Map();
    for (const r of rows) if (r.expense) sums.set(r.account ?? '', (sums.get(r.account ?? '') ?? 0) + r.expense);
    const items = [...sums].sort((a, b) => b[1] - a[1]);
    const max = items[0][1];
    breakdown.replaceChildren(
      h('h2', { class: 'cb-sub-title' }, icon('chart'), '出金の内訳'),
      h('ul', { class: 'cb-bars' }, items.map(([id, sum]) => {
        const a = accountOf(id);
        return h('li', {},
          h('button', {
            type: 'button',
            class: 'cb-bar',
            title: 'この科目で絞り込む',
            'aria-label': `${a?.name ?? '科目なし'} ${yen(sum)}円。この科目で絞り込む`,
            onClick: () => { s.account = id || NONE; syncInputs(); changed(); },
          },
            h('span', { class: 'cb-bar-name' }, a?.name ?? '科目なし'),
            h('span', { class: 'cb-bar-track' }, h('span', { class: 'cb-bar-fill', style: { width: `${Math.max(2, (sum / max) * 100)}%` } })),
            h('span', { class: 'cb-bar-value' }, yen(sum), h('small', {}, `${Math.round((sum / totalOut) * 100)}%`)),
          ));
      })),
    );
  }

  const csvBtn = exportCsv && h('button', { type: 'button', class: 'btn btn-ghost btn-sm cb-csv', onClick: () => exportCsv(filter(withWhen(repo.ledger())), activeCount() > 0) },
    icon('download'), 'CSVで保存');
  if (csvBtn) search.querySelector('.cb-search-foot').append(csvBtn);

  syncOpen();
  render();
  return repo.subscribe(render);
}
