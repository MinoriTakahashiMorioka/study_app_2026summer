import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * 下から出てくる入力シート（PC では中央のダイアログ）。どの機能からでも使えます。
 *
 *   openSheet({
 *     title: '予定を追加',
 *     render(sheet) {          // sheet.close() で閉じる
 *       return h('form', ...); // シートの中身を返す
 *     },
 *   });
 *
 * - Esc キー、背景のタップ、右上の × で閉じる
 * - シートの上にさらにシートを重ねられる（予定の入力中にラベル管理を開く、など）
 * - 閉じたときの後片付けは sheet.onCleanup(fn) で登録
 */

const openSheets = new Set();

function syncScrollLock() {
  document.documentElement.classList.toggle('sheet-open', openSheets.size > 0);
}

let counter = 0;

export function openSheet({ title, render, onClose }) {
  const titleId = `sheet-title-${++counter}`;
  const heading = h('h2', { class: 'sheet-title', id: titleId }, title);
  const body = h('div', { class: 'sheet-body' });
  const cleanups = [];
  let closed = false;

  const dialog = h('dialog', { class: 'sheet', 'aria-labelledby': titleId },
    h('header', { class: 'sheet-head' },
      heading,
      h('button', { type: 'button', class: 'icon-btn sheet-close', 'aria-label': '閉じる', onClick: () => close() },
        icon('close')),
    ),
    body,
  );

  function close() {
    if (closed) return;
    closed = true;
    openSheets.delete(api);
    for (const fn of cleanups) {
      try { fn(); } catch (error) { console.error(error); }
    }
    if (dialog.open) dialog.close();
    dialog.remove();
    syncScrollLock();
    onClose?.();
  }

  // Esc キー
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });

  // 背景（シートの外側）をタップしたら閉じる。
  // 押し始めと離した位置の両方が外側のときだけ閉じる（入力欄でドラッグして外で離したときに閉じないように）
  let downOnBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => { downOnBackdrop = event.target === dialog; });
  dialog.addEventListener('click', (event) => {
    if (downOnBackdrop && event.target === dialog) close();
    downOnBackdrop = false;
  });

  const api = {
    close,
    el: dialog,
    setTitle(text) { heading.textContent = text; },
    onCleanup(fn) { cleanups.push(fn); },
  };

  document.body.append(dialog);
  body.append(render(api));
  openSheets.add(api);
  syncScrollLock();
  dialog.showModal();
  return api;
}

/** 開いているシートをすべて閉じる（画面を離れるときに使う） */
export function closeAllSheets() {
  for (const sheet of [...openSheets].reverse()) sheet.close();
}
