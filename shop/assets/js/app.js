// Shared shell: header, footer, cart state, drawer, toasts, theme, age gate.
import { SITE, CATEGORIES, PRODUCTS, getVariant, money, DISCOUNT } from './catalog.js';
import { vialSVG } from './vial.js';

export { money, SITE, CATEGORIES, PRODUCTS, DISCOUNT };

const CART_KEY = 'cp_cart_v1';
const THEME_KEY = 'cp_theme';
const AGE_KEY = 'cp_ageok';
export const ORDERS_KEY = 'cp_orders_v1';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const stars = (r) => '★★★★★'.slice(0, Math.round(r)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(r));

/* ── Cart ───────────────────────────────────────────────────────────── */

const listeners = new Set();
export const onCartChange = (fn) => (listeners.add(fn), fn(getCart()));

function readCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    // Variant ids can disappear between catalogue revisions; drop unknown lines
    // rather than rendering a broken row.
    return raw.filter((line) => line && getVariant(line.id)).map((line) => ({
      id: line.id,
      qty: Math.max(1, Math.min(99, Number(line.qty) || 1)),
    }));
  } catch {
    return [];
  }
}

let cart = readCart();

function persist() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  listeners.forEach((fn) => fn(cart));
}

export const getCart = () => cart.slice();

export function cartLines() {
  return cart.map((line) => {
    const { product, variant } = getVariant(line.id);
    return { ...line, product, variant, lineTotal: variant.price * line.qty };
  });
}

export function cartTotals() {
  const lines = cartLines();
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const msrp = lines.reduce((sum, l) => sum + l.variant.msrp * l.qty, 0);
  const shipping = lines.length === 0 || subtotal >= SITE.freeShippingOver ? 0 : 14.95;
  return {
    lines,
    count: lines.reduce((sum, l) => sum + l.qty, 0),
    subtotal,
    saved: msrp - subtotal,
    shipping,
    total: subtotal + shipping,
  };
}

export function addToCart(variantId, qty = 1) {
  const found = cart.find((l) => l.id === variantId);
  if (found) found.qty = Math.min(99, found.qty + qty);
  else cart.push({ id: variantId, qty });
  persist();
  const { product, variant } = getVariant(variantId);
  toast(`Added ${product.name} · ${variant.size}`, 'View cart', openDrawer);
}

export function setQty(variantId, qty) {
  const line = cart.find((l) => l.id === variantId);
  if (!line) return;
  if (qty <= 0) cart = cart.filter((l) => l.id !== variantId);
  else line.qty = Math.min(99, qty);
  persist();
}

export const removeFromCart = (variantId) => setQty(variantId, 0);
export function clearCart() {
  cart = [];
  persist();
}

/* ── Toast ──────────────────────────────────────────────────────────── */

export function toast(message, actionLabel, action) {
  let host = $('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    document.body.append(host);
  }
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = `<span>${esc(message)}</span>`;
  if (actionLabel) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-ghost';
    btn.style.marginLeft = 'auto';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      node.remove();
      action?.();
    });
    node.append(btn);
  }
  host.append(node);
  setTimeout(() => node.remove(), 4200);
}

/* ── Product card ───────────────────────────────────────────────────── */

export function productCard(product) {
  const badges = [];
  if (product.badges.includes('bestseller')) badges.push('<span class="badge best">Bestseller</span>');
  if (product.badges.includes('new')) badges.push('<span class="badge new">New</span>');
  badges.push(`<span class="badge sale">−${Math.round(DISCOUNT * 100)}%</span>`);
  const from = product.variants.length > 1 ? '<small>from </small>' : '';
  const wasPrice = product.variants.find((v) => v.price === product.minPrice).msrp;
  return `<article class="product-card">
    <a class="pc-media" href="product.html?p=${encodeURIComponent(product.slug)}" aria-label="${esc(product.name)}">
      ${vialSVG(product)}
      <div class="pc-badges">${badges.join('')}</div>
    </a>
    <div class="pc-body">
      <span class="pc-cat">${esc(product.categoryName)}</span>
      <a class="pc-name" href="product.html?p=${encodeURIComponent(product.slug)}">${esc(product.name)}</a>
      <span class="pc-sum">${esc(product.summary)}</span>
      <div class="pc-meta"><span class="stars">${stars(product.rating)}</span> ${product.rating} · ${product.reviews} reviews</div>
      <div class="pc-foot">
        <div class="price">${from}${money(product.minPrice)}<span class="was">${money(wasPrice)}</span></div>
        <a class="btn btn-sm btn-primary" href="product.html?p=${encodeURIComponent(product.slug)}">Select</a>
      </div>
    </div>
  </article>`;
}

/* ── Header / footer ────────────────────────────────────────────────── */

const NAV = [
  { href: 'shop.html', label: 'Shop all' },
  { href: 'shop.html?c=glp1', label: 'GLP-1' },
  { href: 'shop.html?c=blends', label: 'Blends' },
  { href: 'lab-tests.html', label: 'Lab tests' },
  { href: 'faq.html', label: 'FAQ' },
  { href: 'about.html', label: 'About' },
];

const ANNOUNCEMENTS = [
  `${Math.round(DISCOUNT * 100)}% off every vial — discount already applied to the prices you see`,
  `Free tracked shipping on orders over ${money(SITE.freeShippingOver)}`,
  'Crypto-only checkout · BTC · SOL · ETH',
  'Every batch third-party tested — reports published for each lot',
];

const icon = {
  cart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
  menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>',
  check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5 5L20 6"/></svg>',
};

function headerHTML(active) {
  const cats = CATEGORIES.map(
    (c) =>
      `<a href="shop.html?c=${c.id}"><strong>${esc(c.name)}</strong><span>${esc(c.blurb)}</span></a>`,
  ).join('');
  const nav = NAV.map(
    (n) =>
      `<a href="${n.href}"${active === n.href ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`,
  ).join('');
  return `
  <div class="announce">
    <div class="wrap">
      ${ANNOUNCEMENTS.map((a, i) => `<div class="announce-item${i === 0 ? ' is-on' : ''}">${esc(a)}</div>`).join('')}
    </div>
  </div>
  <header class="site-header">
    <div class="wrap header-row">
      <a class="brand" href="index.html"><span class="brand-mark">CP</span> ${esc(SITE.name)}</a>
      <nav class="nav" aria-label="Primary">
        <span class="has-mega">
          <button class="navlink" aria-haspopup="true">Categories ▾</button>
          <div class="mega">${cats}</div>
        </span>
        ${nav}
      </nav>
      <div class="header-actions">
        <button class="icon-btn" id="theme-btn" aria-label="Toggle dark mode">${icon.sun}</button>
        <a class="icon-btn" href="shop.html#search" aria-label="Search products">${icon.search}</a>
        <button class="icon-btn" id="cart-btn" aria-label="Open cart">
          ${icon.cart}<span class="cart-count" hidden>0</span>
        </button>
        <button class="icon-btn menu-btn" id="menu-btn" aria-label="Open menu">${icon.menu}</button>
      </div>
    </div>
  </header>
  <div class="mobile-nav" id="mobile-nav">
    <div class="close-row">
      <a class="brand" href="index.html"><span class="brand-mark">CP</span> ${esc(SITE.name)}</a>
      <button class="icon-btn" id="mobile-close" aria-label="Close menu">✕</button>
    </div>
    ${NAV.map((n) => `<a href="${n.href}">${esc(n.label)}</a>`).join('')}
    ${CATEGORIES.map((c) => `<a href="shop.html?c=${c.id}">${esc(c.name)}</a>`).join('')}
    <a href="shipping.html">Shipping &amp; delivery</a>
    <a href="contact.html">Contact</a>
  </div>`;
}

function footerHTML() {
  const cats = CATEGORIES.slice(0, 6)
    .map((c) => `<li><a href="shop.html?c=${c.id}">${esc(c.name)}</a></li>`)
    .join('');
  return `<footer class="site-footer">
    <div class="wrap">
      <div class="footer-grid">
        <div>
          <a class="brand" href="index.html"><span class="brand-mark">CP</span> ${esc(SITE.name)}</a>
          <p class="small muted" style="margin-top:12px;max-width:38ch">
            Research-grade peptides for laboratory use. Every lot is sent to an independent
            analytical lab and the report is published against the batch number.
          </p>
          <div class="pay-chips" style="margin-top:14px">
            <span>BTC</span><span>SOL</span><span>ETH</span>
          </div>
        </div>
        <div>
          <h4>Shop</h4>
          <ul>${cats}<li><a href="shop.html">All products</a></li></ul>
        </div>
        <div>
          <h4>Support</h4>
          <ul>
            <li><a href="faq.html">FAQ</a></li>
            <li><a href="shipping.html">Shipping &amp; delivery</a></li>
            <li><a href="how-to-pay.html">How to pay with crypto</a></li>
            <li><a href="contact.html">Contact us</a></li>
            <li><a href="track.html">Order lookup</a></li>
          </ul>
        </div>
        <div>
          <h4>Company</h4>
          <ul>
            <li><a href="about.html">About us</a></li>
            <li><a href="lab-tests.html">Lab tests</a></li>
            <li><a href="terms.html">Terms of sale</a></li>
            <li><a href="privacy.html">Privacy policy</a></li>
          </ul>
        </div>
      </div>
      <div class="disclaimer">
        <strong>Research use only.</strong> All products sold by ${esc(SITE.name)} are intended for
        laboratory research purposes only. They are not drugs, food, cosmetics or medical devices, are
        not approved by any regulatory authority, and are not intended to diagnose, treat, cure or
        prevent any disease. They are not for human or veterinary consumption or administration. By
        purchasing you confirm you are a qualified researcher over 21 and accept the
        <a href="terms.html">terms of sale</a>.
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} ${esc(SITE.name)}. All rights reserved.</span>
        <span>Crypto payments only · No card data ever collected</span>
      </div>
    </div>
  </footer>`;
}

/* ── Cart drawer ────────────────────────────────────────────────────── */

function drawerHTML() {
  return `<div class="drawer-scrim" id="drawer-scrim"></div>
  <aside class="drawer" id="drawer" aria-label="Cart" aria-hidden="true">
    <div class="drawer-head">
      <strong>Your cart <span class="muted small" id="drawer-count"></span></strong>
      <button class="icon-btn" id="drawer-close" aria-label="Close cart">✕</button>
    </div>
    <div class="drawer-body" id="drawer-body"></div>
    <div class="drawer-foot" id="drawer-foot"></div>
  </aside>`;
}

export function openDrawer() {
  $('#drawer')?.classList.add('is-open');
  $('#drawer-scrim')?.classList.add('is-open');
  $('#drawer')?.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
export function closeDrawer() {
  $('#drawer')?.classList.remove('is-open');
  $('#drawer-scrim')?.classList.remove('is-open');
  $('#drawer')?.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function renderDrawer() {
  const body = $('#drawer-body');
  const foot = $('#drawer-foot');
  if (!body || !foot) return;
  const { lines, count, subtotal, saved, shipping } = cartTotals();
  $('#drawer-count').textContent = count ? `(${count})` : '';

  if (!lines.length) {
    body.innerHTML = `<div class="empty" style="margin-top:24px">
      <p><strong>Your cart is empty</strong></p>
      <p class="small muted">Every vial is already ${Math.round(DISCOUNT * 100)}% off.</p>
      <a class="btn btn-primary" href="shop.html">Browse catalogue</a>
    </div>`;
    foot.innerHTML = '';
    return;
  }

  body.innerHTML = lines
    .map(
      (l) => `<div class="line-item">
        <div class="thumb">${vialSVG(l.product, l.variant.size)}</div>
        <div>
          <b>${esc(l.product.name)}</b>
          <span class="sz">${esc(l.variant.size)}</span>
          <div class="li-actions">
            <button data-dec="${l.id}" aria-label="Decrease quantity">−</button>
            <span class="small">${l.qty}</span>
            <button data-inc="${l.id}" aria-label="Increase quantity">+</button>
            <button class="link-btn" data-rm="${l.id}" style="margin-left:6px">Remove</button>
          </div>
        </div>
        <div class="price small">${money(l.lineTotal)}</div>
      </div>`,
    )
    .join('');

  const toFree = Math.max(0, SITE.freeShippingOver - subtotal);
  foot.innerHTML = `
    ${
      toFree > 0
        ? `<div class="small muted">Add <b>${money(toFree)}</b> for free shipping</div>
           <div class="ship-bar"><i style="width:${Math.min(100, (subtotal / SITE.freeShippingOver) * 100)}%"></i></div>`
        : `<div class="small" style="color:var(--ok);font-weight:650">✓ Free tracked shipping unlocked</div>`
    }
    <div class="summary-row"><span>Subtotal</span><b>${money(subtotal)}</b></div>
    <div class="summary-row small" style="color:var(--ok)"><span>You save</span><b>${money(saved)}</b></div>
    <div class="summary-row small muted"><span>Shipping</span><span>${shipping ? money(shipping) : 'Free'}</span></div>
    <a class="btn btn-primary btn-block btn-lg" style="margin-top:10px" href="checkout.html">Checkout with crypto</a>
    <p class="tiny muted center" style="margin:10px 0 0">BTC · SOL · ETH accepted. No account required.</p>`;
}

/* ── Theme + age gate ───────────────────────────────────────────────── */

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) document.documentElement.dataset.theme = saved;
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = 'dark';
  $('#theme-btn')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  });
}

function initAgeGate() {
  if (localStorage.getItem(AGE_KEY) === 'yes') return;
  const scrim = document.createElement('div');
  scrim.className = 'modal-scrim';
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="age-h">
    <div class="brand-mark" style="margin:0 auto 14px">CP</div>
    <h3 id="age-h">Research use confirmation</h3>
    <p class="small muted">
      Products on this site are supplied strictly for laboratory research. They are not for human or
      veterinary consumption. Please confirm you are at least 21 years old and are purchasing as a
      qualified researcher.
    </p>
    <div class="stack" style="margin-top:18px">
      <button class="btn btn-primary btn-block" id="age-yes">I confirm — I am 21+ and a researcher</button>
      <a class="btn btn-ghost btn-block" href="https://www.wikipedia.org/">Leave site</a>
    </div>
  </div>`;
  document.body.append(scrim);
  document.body.style.overflow = 'hidden';
  scrim.querySelector('#age-yes').addEventListener('click', () => {
    localStorage.setItem(AGE_KEY, 'yes');
    scrim.remove();
    document.body.style.overflow = '';
  });
}

function initAnnouncements() {
  const items = $$('.announce-item');
  if (items.length < 2) return;
  let i = 0;
  setInterval(() => {
    items[i].classList.remove('is-on');
    i = (i + 1) % items.length;
    items[i].classList.add('is-on');
  }, 4500);
}

/* ── Boot ───────────────────────────────────────────────────────────── */

export function initShell() {
  const active = location.pathname.split('/').pop() || 'index.html';
  const header = $('#site-header');
  if (header) header.innerHTML = headerHTML(active);
  const footer = $('#site-footer');
  if (footer) footer.innerHTML = footerHTML();
  document.body.insertAdjacentHTML('beforeend', drawerHTML());

  $('#cart-btn')?.addEventListener('click', openDrawer);
  $('#drawer-close')?.addEventListener('click', closeDrawer);
  $('#drawer-scrim')?.addEventListener('click', closeDrawer);
  $('#menu-btn')?.addEventListener('click', () => $('#mobile-nav').classList.add('is-open'));
  $('#mobile-close')?.addEventListener('click', () => $('#mobile-nav').classList.remove('is-open'));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeDrawer());

  // Delegated so re-rendered rows keep working.
  $('#drawer')?.addEventListener('click', (e) => {
    const t = e.target.closest('[data-inc],[data-dec],[data-rm]');
    if (!t) return;
    const lines = getCart();
    const find = (id) => lines.find((l) => l.id === id)?.qty || 0;
    if (t.dataset.inc) setQty(t.dataset.inc, find(t.dataset.inc) + 1);
    if (t.dataset.dec) setQty(t.dataset.dec, find(t.dataset.dec) - 1);
    if (t.dataset.rm) removeFromCart(t.dataset.rm);
  });

  onCartChange(() => {
    const { count } = cartTotals();
    const badge = $('.cart-count');
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }
    renderDrawer();
  });

  initTheme();
  initAnnouncements();
  initAgeGate();
}
