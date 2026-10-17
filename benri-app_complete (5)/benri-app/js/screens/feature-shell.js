import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { router } from '../core/router.js';
import { getFeature } from '../core/registry.js';
import { makeContext } from '../core/context.js';
import { closeAllSheets } from '../core/sheet.js';

/**
 * 各機能の共通フレーム（「‹ ホーム」ボタン付きの上部バー＋本文）。
 * 中身は機能の mount() に任せます。
 *
 * 機能には ctx.toolbar（上部バー右側の置き場）も渡すので、
 * 「ラベル」ボタンのような機能ごとの操作をそこに置けます。
 * @returns {() => void} 後片付け関数
 */
export function renderFeature(root, id, subpath = '') {
  const feature = getFeature(id);
  if (!feature) {
    router.navigate('/hub', { replace: true });
    return null;
  }

  const title = h('h1', { class: 'topbar-title', tabindex: '-1' }, feature.title);
  const toolbar = h('div', { class: 'topbar-actions' });
  const body = h('main', { class: 'feature-main' });

  const screen = h('div', { class: 'screen screen-feature', style: { '--feature': feature.color } },
    h('header', { class: 'topbar' },
      h('button', { type: 'button', class: 'back-btn', onClick: () => router.back('/hub') },
        icon('chevronLeft'), 'ホーム'),
      title,
      toolbar,
    ),
    body,
  );

  root.replaceChildren(screen);
  window.scrollTo(0, 0);
  title.focus({ preventScroll: true });

  const base = `/app/${feature.id}`;
  const cleanup = feature.mount(body, {
    ...makeContext(feature),
    toolbar,
    subpath: subpath.replace(/\/+$/, ''),
    /** 機能の中の別の画面へ（例: ctx.go('goals/abc')） */
    go: (sub = '', options) => router.navigate(sub ? `${base}/${sub}` : base, options),
    /** 直前がその画面なら「戻る」、違えばその画面へ */
    back: (sub = '') => router.back(sub ? `${base}/${sub}` : base),
  });

  return () => {
    closeAllSheets(); // 開いたままの入力シートも閉じる
    if (typeof cleanup === 'function') cleanup();
  };
}
