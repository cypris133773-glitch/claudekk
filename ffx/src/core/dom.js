// Enough DOM sugar to build menus without a framework.

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

/** A button that responds to taps without the 300ms delay and never selects text. */
export function button(label, onTap, opts = {}) {
  const b = el('button', { class: opts.class || 'btn', type: 'button', ...(opts.attrs || {}) }, label);
  if (opts.disabled) b.disabled = true;
  const fire = (e) => {
    if (b.disabled) return;
    e.preventDefault();
    onTap(e);
  };
  b.addEventListener('click', fire);
  return b;
}

export function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
