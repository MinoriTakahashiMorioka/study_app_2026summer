import { h } from './dom.js';

/**
 * 画面下に数秒だけ出るお知らせ。
 *   showToast('25分を記録しました', { action: { label: '記録を見る', onClick: () => ... } });
 * @returns {() => void} すぐ消したいときに呼ぶ関数
 */
export function showToast(message, { action = null, duration = 6000 } = {}) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = h('div', { id: 'toast-host', class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }

  const toast = h('div', { class: 'toast' },
    h('span', {}, message),
    action && h('button', {
      type: 'button',
      class: 'toast-action',
      onClick: () => { dismiss(); action.onClick(); },
    }, action.label),
  );

  const timer = setTimeout(dismiss, duration);
  function dismiss() {
    clearTimeout(timer);
    toast.remove();
  }

  host.append(toast);
  return dismiss;
}
