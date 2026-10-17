/**
 * 画面を組み立てるための小さなヘルパー。
 *
 *   h('button', { class: 'btn', onClick: () => ... }, 'ログイン')
 *
 * innerHTML に文字列を流し込む方式と違い、ユーザー入力をそのまま表示しても
 * HTML として解釈されない（XSS を防げる）のが利点です。
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;

    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v); // CSS 変数
        else el.style[prop] = v;
      }
    }
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    }
    else if (key === 'html') el.innerHTML = value; // ⚠️ 自分で書いた固定の SVG などにだけ使う
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }

  append(el, children);
  return el;
}

function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}
