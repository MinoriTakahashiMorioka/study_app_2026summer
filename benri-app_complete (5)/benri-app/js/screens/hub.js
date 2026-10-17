import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { auth } from '../core/auth.js';
import { router } from '../core/router.js';
import { FEATURES } from '../core/registry.js';
import { matchesFeature } from '../core/feature.js';
import { makeContext } from '../core/context.js';
import { toDateKey } from '../models/schema.js';
import { openAccountSheet } from './account-sheet.js';

/**
 * 機能一覧（ハブ）画面。
 * 個々の機能のことは知らず、registry.js の FEATURES を並べるだけです。
 * @returns {() => void} 後片付け関数
 */
export function renderHub(root) {
  const user = auth.user;

  // ---------- あいさつ ----------

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour >= 4 && hour < 11 ? 'おはようございます'
    : hour >= 11 && hour < 18 ? 'こんにちは'
    : 'こんばんは';
  const dateLabel = new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'long' }).format(now);

  const nameSpan = h('span', {}, `${user.displayName}さん`);
  const title = h('h1', { tabindex: '-1' }, h('span', {}, `${greeting}、`), nameSpan);

  // ---------- アカウントメニュー ----------

  const menu = h('div', { class: 'menu', id: 'account-menu', hidden: true });
  const avatar = h('button', {
    type: 'button',
    class: 'avatar',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
    'aria-controls': 'account-menu',
    'aria-label': 'アカウント',
    onClick: () => (menu.hidden ? openMenu() : closeMenu()),
  }, user.displayName.slice(0, 1));

  const renderMenuDefault = () => {
    menu.replaceChildren(
      h('div', { class: 'menu-user' },
        h('strong', {}, auth.user.displayName),
        h('span', {}, `ID: ${user.id}`),
      ),
      h('button', {
        type: 'button',
        class: 'btn btn-ghost',
        onClick: () => {
          closeMenu();
          openAccountSheet({
            onNameChange: (updated) => {
              nameSpan.textContent = `${updated.displayName}さん`;
              avatar.textContent = updated.displayName.slice(0, 1);
            },
          });
        },
      }, icon('gear'), 'アカウント設定・バックアップ'),
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: renderMenuConfirm },
        icon('logout'), 'ログアウト'),
    );
  };

  // confirm() は使えない環境があるので、メニューの中で確認する
  function renderMenuConfirm() {
    menu.replaceChildren(
      h('p', {}, 'ログアウトしますか？'),
      h('div', { class: 'menu-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: renderMenuDefault }, 'キャンセル'),
        h('button', { type: 'button', class: 'btn btn-danger', onClick: () => auth.logout() }, 'ログアウト'),
      ),
    );
    menu.querySelector('.btn-danger').focus();
  }

  function openMenu() {
    renderMenuDefault();
    menu.hidden = false;
    avatar.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    menu.hidden = true;
    avatar.setAttribute('aria-expanded', 'false');
  }

  const onDocClick = (event) => {
    // composedPath はクリック時点の経路なので、メニュー内容を差し替えた直後でも正しく判定できる
    if (!menu.hidden && !event.composedPath().includes(account)) closeMenu();
  };
  const onKey = (event) => {
    if (event.key === 'Escape' && !menu.hidden) { closeMenu(); avatar.focus(); }
  };

  const account = h('div', { class: 'account' }, avatar, menu);

  // ---------- 機能カード ----------

  const cardFor = (feature) => {
    let status = null;
    try { status = feature.summary?.(makeContext(feature)) ?? null; } catch (error) { console.error(error); }

    return h('a', {
      class: 'card',
      href: `#/app/${feature.id}`,
      style: { '--feature': feature.color },
      onClick: (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return; // 新しいタブで開く操作は邪魔しない
        event.preventDefault();
        router.navigate(`/app/${feature.id}`);
      },
    },
      h('div', { class: 'card-top' },
        h('div', { class: 'card-icon' }, icon(feature.icon)),
        h('span', { class: 'card-arrow' }, icon('arrowRight')),
      ),
      h('div', { class: 'card-text' },
        h('h2', { class: 'card-title' }, feature.title),
        feature.subtitle && h('p', { class: 'card-sub' }, feature.subtitle),
      ),
      status && h('p', { class: 'card-status' }, status),
    );
  };

  const count = h('span');
  const grid = h('div', { class: 'grid' });

  const renderGrid = (query = '') => {
    const list = FEATURES.filter((f) => matchesFeature(f, query));
    count.textContent = String(list.length);
    if (list.length === 0) {
      grid.replaceChildren(
        h('div', { class: 'empty', style: { gridColumn: '1 / -1' } },
          h('strong', {}, `「${query}」に一致する機能はありません`),
          h('span', {}, '別のことばで探してみてください'),
        ),
      );
      return;
    }
    grid.replaceChildren(...list.map(cardFor));
  };

  const search = h('input', {
    id: 'hub-search',
    type: 'search',
    placeholder: '機能を検索（例: 予定、タイマー）',
    autocomplete: 'off',
    enterkeyhint: 'search',
    'aria-label': '機能を検索',
    onInput: (event) => renderGrid(event.target.value),
  });

  // ---------- 組み立て ----------

  const screen = h('div', { class: 'screen' },
    h('div', { class: 'hub' },
      h('header', { class: 'hub-head' },
        h('div', { class: 'app-name' },
          h('div', { class: 'brand-mark', 'aria-hidden': 'true' }, h('span'), h('span'), h('span'), h('span')),
          '総合便利アプリ',
        ),
        account,
      ),
      h('div', { class: 'greet' },
        h('time', { datetime: toDateKey(now) }, dateLabel),
        title,
      ),
      h('div', { class: 'input-wrap search' }, icon('search'), search),
      h('section', { class: 'grid-section', 'aria-label': '機能一覧' },
        h('div', { class: 'section-head' }, '機能', count),
        grid,
      ),
    ),
  );

  renderGrid();
  root.replaceChildren(screen);
  title.focus({ preventScroll: true });

  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);

  return () => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKey);
  };
}
