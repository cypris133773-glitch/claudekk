// Shared shell: header, footer, cart state, drawer, toasts, theme, age gate.
import { SITE, SHIPPING, CATEGORIES, PRODUCTS, getVariant, money, DISCOUNT, shippingCost, shippingZone } from './catalog.js';
import { vialSVG } from './vial.js';
import { publishedCount } from './lab.js';
import { safeStorage, readJSON, writeJSON } from './storage.js';

export { money, SITE, SHIPPING, CATEGORIES, PRODUCTS, DISCOUNT, shippingCost, shippingZone };

const CART_KEY = 'cp_cart_v1';
const THEME_KEY = 'cp_theme';
const AGE_KEY = 'cp_ageok';
export const ORDERS_KEY = 'cp_orders_v1';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── Cart ───────────────────────────────────────────────────────────── */

const listeners = new Set();
export const onCartChange = (fn) => (listeners.add(fn), fn(getCart()));

function readCart() {
  const raw = readJSON(safeStorage, CART_KEY, []);
  if (!Array.isArray(raw)) return [];
  // Lines are merged by variant id: a duplicated id would otherwise defeat the
  // per-line quantity clamp and make the +/- buttons edit the wrong row.
  const merged = new Map();
  for (const line of raw) {
    if (!line || !getVariant(line.id)) continue; // unknown ids die with the catalogue revision
    const qty = Math.floor(Number(line.qty)) || 0;
    if (qty <= 0) continue;
    merged.set(line.id, Math.min(SITE.maxQty, (merged.get(line.id) || 0) + qty));
  }
  return [...merged].map(([id, qty]) => ({ id, qty }));
}

let cart = readCart();

function notify() {
  listeners.forEach((fn) => fn(cart));
}

function persist() {
  writeJSON(safeStorage, CART_KEY, cart);
  notify();
}

export const getCart = () => cart.slice();

export function cartLines() {
  return cart.map((line) => {
    const { product, variant } = getVariant(line.id);
    return { ...line, product, variant, lineTotal: variant.price * line.qty };
  });
}

/** @param {string} [country] destination, for the shipping line. */
export function cartTotals(country = SHIPPING.defaultCountry) {
  const lines = cartLines();
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const msrp = lines.reduce((sum, l) => sum + l.variant.msrp * l.qty, 0);
  const shipping = lines.length === 0 ? 0 : shippingCost(country, subtotal);
  return {
    lines,
    count: lines.reduce((sum, l) => sum + l.qty, 0),
    subtotal,
    msrp,
    saved: msrp - subtotal,
    shipping,
    total: subtotal + shipping,
  };
}

export function addToCart(variantId, qty = 1, { silent = false } = {}) {
  const found = cart.find((l) => l.id === variantId);
  if (found) found.qty = Math.min(SITE.maxQty, found.qty + qty);
  else cart.push({ id: variantId, qty: Math.min(SITE.maxQty, qty) });
  persist();
  if (silent) return;
  const { product, variant } = getVariant(variantId);
  toast(`Added ${product.name} · ${variant.size}`, 'View cart', openDrawer);
}

export function setQty(variantId, qty) {
  const line = cart.find((l) => l.id === variantId);
  if (!line) return;
  if (qty <= 0) cart = cart.filter((l) => l.id !== variantId);
  else line.qty = Math.min(SITE.maxQty, qty);
  persist();
}

export const removeFromCart = (variantId) => setQty(variantId, 0);
export function clearCart() {
  cart = [];
  persist();
}

/* ── Orders (browser-local) ─────────────────────────────────────────── */

/** Orders older than the published retention window are dropped on read. */
export function readOrders() {
  const raw = readJSON(safeStorage, ORDERS_KEY, []);
  if (!Array.isArray(raw)) return [];
  const cutoff = Date.now() - SITE.orderRetentionDays * 86400000;
  return raw.filter((o) => o && o.id && Date.parse(o.created || '') > cutoff);
}

/** @returns {boolean} whether the order survives beyond this page load. */
export function saveOrder(order) {
  const all = [order, ...readOrders()].slice(0, SITE.maxStoredOrders);
  return writeJSON(safeStorage, ORDERS_KEY, all);
}

/* ── Toast ──────────────────────────────────────────────────────────── */

export function toast(message, actionLabel, action) {
  let host = $('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = `<span>${esc(message)}</span>`;
  if (actionLabel) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm toast-action';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      node.remove();
      action?.();
    });
    node.append(btn);
  }
  host.append(node);
  setTimeout(() => node.remove(), SITE.toastMs);
}

/* ── Product card ───────────────────────────────────────────────────── */

export function productCard(product) {
  const badges = [];
  if (product.badges.includes('bestseller')) badges.push('<span class="badge best">Popular</span>');
  if (product.badges.includes('new')) badges.push('<span class="badge new">New</span>');
  badges.push(`<span class="badge sale">−${Math.round(DISCOUNT * 100)}%</span>`);
  const from = product.variants.length > 1 ? '<small>from </small>' : '';
  const wasPrice = product.variants.find((v) => v.price === product.minPrice).msrp;
  const href = `product.html?p=${encodeURIComponent(product.slug)}`;
  // No ratings here: no customer review has been collected, so there is nothing
  // honest to put in a stars row.
  const meta = product.purity
    ? `${esc(product.purity)} target purity`
    : esc(product.spec || product.categoryName);
  return `<article class="product-card">
    <a class="pc-media" href="${href}" tabindex="-1" aria-hidden="true">
      ${vialSVG(product)}
      <div class="pc-badges">${badges.join('')}</div>
    </a>
    <div class="pc-body">
      <span class="pc-cat">${esc(product.categoryName)}</span>
      <h3 class="pc-name"><a href="${href}">${esc(product.name)}</a></h3>
      <span class="pc-sum">${esc(product.summary)}</span>
      <div class="pc-meta">${meta}</div>
      <div class="pc-foot">
        <div class="price">${from}${money(product.minPrice)}<span class="was">${money(wasPrice)}</span></div>
        <a class="btn btn-sm btn-primary" href="${href}">
          Options<span class="visually-hidden"> for ${esc(product.name)}</span>
        </a>
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
  { href: 'how-to-pay.html', label: 'Pay with crypto' },
  { href: 'faq.html', label: 'FAQ' },
];

// Copy that would otherwise drift: the testing line is derived from how many
// certificates actually exist, so it cannot overstate them.
const announcements = () => {
  const published = publishedCount();
  return [
    `${Math.round(DISCOUNT * 100)}% off every vial — discount already applied to the prices you see`,
    `Free tracked shipping over ${money(SITE.freeShippingOver)} to most destinations`,
    'Crypto-only checkout · BTC · SOL · ETH',
    published
      ? `${published} lab certificate${published === 1 ? '' : 's'} published against their lots`
      : 'Every lot numbered and recorded in the public lot registry',
  ];
};

const icon = {
  cart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
  menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  theme: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>',
};

function headerHTML(active) {
  const cats = CATEGORIES.map(
    (c) => `<a href="shop.html?c=${c.id}"><strong>${esc(c.name)}</strong><span>${esc(c.blurb)}</span></a>`,
  ).join('');
  const nav = NAV.map(
    (n) => `<a href="${n.href}"${active === n.href ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`,
  ).join('');
  return `
  <div class="announce">
    <div class="wrap">
      ${announcements()
        .map((a, i) => `<div class="announce-item${i === 0 ? ' is-on' : ''}">${esc(a)}</div>`)
        .join('')}
    </div>
  </div>
  <header class="site-header">
    <div class="wrap header-row">
      <a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true">CP</span> ${esc(SITE.name)}</a>
      <nav class="nav" aria-label="Primary">
        <span class="has-mega">
          <button class="navlink" id="mega-btn" aria-expanded="false" aria-controls="mega">Categories ▾</button>
          <div class="mega" id="mega">${cats}</div>
        </span>
        ${nav}
      </nav>
      <div class="header-actions">
        <button class="icon-btn" id="theme-btn" aria-label="Switch theme">${icon.theme}</button>
        <a class="icon-btn" href="shop.html#search" aria-label="Search products">${icon.search}</a>
        <button class="icon-btn" id="cart-btn" aria-expanded="false" aria-controls="drawer" aria-label="Open cart">
          ${icon.cart}<span class="cart-count" hidden>0</span>
        </button>
        <button class="icon-btn menu-btn" id="menu-btn" aria-expanded="false" aria-controls="mobile-nav" aria-label="Open menu">${icon.menu}</button>
      </div>
    </div>
  </header>
  <div class="mobile-nav" id="mobile-nav" hidden>
    <div class="close-row">
      <a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true">CP</span> ${esc(SITE.name)}</a>
      <button class="icon-btn" id="mobile-close" aria-label="Close menu">✕</button>
    </div>
    ${NAV.map((n) => `<a href="${n.href}">${esc(n.label)}</a>`).join('')}
    ${CATEGORIES.map((c) => `<a href="shop.html?c=${c.id}">${esc(c.name)}</a>`).join('')}
    <a href="cart.html">Cart</a>
    <a href="shipping.html">Shipping &amp; delivery</a>
    <a href="about.html">About</a>
    <a href="contact.html">Contact</a>
  </div>`;
}

function footerHTML() {
  const cats = CATEGORIES.slice(0, 6)
    .map((c) => `<li><a href="shop.html?c=${c.id}">${esc(c.name)}</a></li>`)
    .join('');
  const published = publishedCount();
  return `<footer class="site-footer">
    <div class="wrap">
      <div class="footer-grid">
        <div>
          <a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true">CP</span> ${esc(SITE.name)}</a>
          <p class="small muted footer-blurb">
            Research-grade peptides for laboratory use. Every lot carries a number printed on the vial and a
            record in our public lot registry${
              published ? ', with the issued certificate attached to it' : ', and its certificate once one is issued'
            }.
          </p>
          <div class="pay-chips"><span>BTC</span><span>SOL</span><span>ETH</span></div>
        </div>
        <nav aria-labelledby="foot-shop">
          <h2 class="foot-h" id="foot-shop">Shop</h2>
          <ul>${cats}<li><a href="shop.html">All products</a></li><li><a href="cart.html">Your cart</a></li></ul>
        </nav>
        <nav aria-labelledby="foot-support">
          <h2 class="foot-h" id="foot-support">Support</h2>
          <ul>
            <li><a href="faq.html">FAQ</a></li>
            <li><a href="shipping.html">Shipping &amp; delivery</a></li>
            <li><a href="how-to-pay.html">How to pay with crypto</a></li>
            <li><a href="contact.html">Contact us</a></li>
            <li><a href="track.html">Order lookup</a></li>
          </ul>
        </nav>
        <nav aria-labelledby="foot-company">
          <h2 class="foot-h" id="foot-company">Company</h2>
          <ul>
            <li><a href="about.html">About us</a></li>
            <li><a href="lab-tests.html">Lot registry &amp; lab tests</a></li>
            <li><a href="terms.html">Terms of sale</a></li>
            <li><a href="privacy.html">Privacy policy</a></li>
          </ul>
        </nav>
      </div>
      <div class="disclaimer">
        <strong>Research use only.</strong> All products sold by ${esc(SITE.name)} are intended for laboratory
        research purposes only. They are not drugs, food, cosmetics or medical devices, are not approved by any
        regulatory authority, and are not intended to diagnose, treat, cure or prevent any disease. They are not
        for human or veterinary consumption or administration. By purchasing you confirm you are a qualified
        researcher over 21 and accept the <a href="terms.html">terms of sale</a>.
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
  return `<div class="drawer-scrim" id="drawer-scrim" hidden></div>
  <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="Your cart" hidden>
    <div class="drawer-head">
      <h2 class="drawer-title">Your cart <span class="muted small" id="drawer-count"></span></h2>
      <button class="icon-btn" id="drawer-close" aria-label="Close cart">✕</button>
    </div>
    <div class="drawer-body" id="drawer-body"></div>
    <div class="drawer-foot" id="drawer-foot"></div>
  </aside>`;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
let lastFocus = null;

export function openDrawer() {
  const drawer = $('#drawer');
  if (!drawer) return;
  lastFocus = document.activeElement;
  $('#drawer-scrim').hidden = false;
  drawer.hidden = false;
  requestAnimationFrame(() => {
    drawer.classList.add('is-open');
    $('#drawer-scrim').classList.add('is-open');
  });
  $('#cart-btn')?.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
  $('#drawer-close')?.focus();
}

export function closeDrawer() {
  const drawer = $('#drawer');
  if (!drawer || drawer.hidden) return;
  drawer.classList.remove('is-open');
  $('#drawer-scrim').classList.remove('is-open');
  $('#cart-btn')?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  // Hidden after the transition so the closed drawer holds no tab stops.
  setTimeout(() => {
    drawer.hidden = true;
    $('#drawer-scrim').hidden = true;
  }, 280);
  lastFocus?.focus?.();
}

function renderDrawer() {
  const body = $('#drawer-body');
  const foot = $('#drawer-foot');
  if (!body || !foot) return;
  const { lines, count, subtotal, saved } = cartTotals();
  $('#drawer-count').textContent = count ? `(${count})` : '';

  if (!lines.length) {
    body.innerHTML = `<div class="empty" style="margin-top:24px">
      <p><strong>Your cart is empty</strong></p>
      <p class="small muted">Every vial is already ${Math.round(DISCOUNT * 100)}% below list price.</p>
      <a class="btn btn-primary" href="shop.html">Browse catalogue</a>
    </div>`;
    foot.innerHTML = '';
    return;
  }

  body.innerHTML = lines
    .map(
      (l) => `<div class="line-item">
        <div class="thumb" aria-hidden="true">${vialSVG(l.product, l.variant.size)}</div>
        <div>
          <b>${esc(l.product.name)}</b>
          <span class="sz">${esc(l.variant.size)}</span>
          <div class="li-actions">
            <button class="qty-btn" data-dec="${l.id}" aria-label="Decrease quantity of ${esc(l.product.name)}">−</button>
            <span class="small qty-val">${l.qty}</span>
            <button class="qty-btn" data-inc="${l.id}" aria-label="Increase quantity of ${esc(l.product.name)}">+</button>
            <button class="link-btn" data-rm="${l.id}">Remove<span class="visually-hidden"> ${esc(l.product.name)}</span></button>
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
        ? `<div class="small muted">Add <b>${money(toFree)}</b> for free shipping to most destinations</div>
           <div class="ship-bar"><i style="width:${Math.min(100, (subtotal / SITE.freeShippingOver) * 100)}%"></i></div>`
        : `<div class="small ok-text"><b>✓ Free tracked shipping unlocked</b></div>`
    }
    <div class="summary-row"><span>Subtotal</span><b>${money(subtotal)}</b></div>
    <div class="summary-row small ok-text"><span>Below list price by</span><b>${money(saved)}</b></div>
    <div class="summary-row small muted"><span>Shipping</span><span>calculated at checkout</span></div>
    <a class="btn btn-primary btn-block btn-lg" style="margin-top:10px" href="checkout.html">Checkout with crypto</a>
    <a class="btn btn-ghost btn-block btn-sm" style="margin-top:8px" href="cart.html">View full cart</a>`;
}

/* ── Theme + age gate ───────────────────────────────────────────────── */

function initTheme() {
  const saved = safeStorage.get(THEME_KEY);
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = 'dark';
  $('#theme-btn')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    safeStorage.set(THEME_KEY, next);
  });
}

function initAgeGate() {
  if (safeStorage.get(AGE_KEY) === 'yes') return;
  const opener = document.activeElement;
  const scrim = document.createElement('div');
  scrim.className = 'modal-scrim';
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="age-h" aria-describedby="age-d">
    <div class="brand-mark" aria-hidden="true" style="margin:0 auto 14px">CP</div>
    <h2 id="age-h">Research use confirmation</h2>
    <p class="small muted" id="age-d">
      Products on this site are supplied strictly for laboratory research. They are not for human or veterinary
      consumption. Please confirm you are at least 21 years old and are purchasing as a qualified researcher.
    </p>
    <div class="stack" style="margin-top:18px">
      <button class="btn btn-primary btn-block" id="age-yes">I confirm — I am 21+ and a researcher</button>
      <a class="btn btn-ghost btn-block" href="https://www.wikipedia.org/">Leave site</a>
    </div>
  </div>`;
  document.body.append(scrim);
  document.body.style.overflow = 'hidden';

  const close = () => {
    safeStorage.set(AGE_KEY, 'yes');
    scrim.remove();
    document.body.style.overflow = '';
    opener?.focus?.();
  };
  scrim.querySelector('#age-yes').addEventListener('click', close);
  scrim.querySelector('#age-yes').focus();
  // A confirmation the user has not answered stays answerable: focus is kept
  // inside, and Escape is deliberately not an exit.
  scrim.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = $$(FOCUSABLE, scrim);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

function initAnnouncements() {
  const items = $$('.announce-item');
  if (items.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let i = 0;
  setInterval(() => {
    items[i].classList.remove('is-on');
    i = (i + 1) % items.length;
    items[i].classList.add('is-on');
  }, SITE.announceMs);
}

/* ── Boot ───────────────────────────────────────────────────────────── */

export function initShell() {
  const active = location.pathname.split('/').pop() || 'index.html';
  const header = $('#site-header');
  if (header) header.innerHTML = headerHTML(active + location.search);
  const footer = $('#site-footer');
  if (footer) footer.innerHTML = footerHTML();
  document.body.insertAdjacentHTML('beforeend', drawerHTML());

  $('#cart-btn')?.addEventListener('click', openDrawer);
  $('#drawer-close')?.addEventListener('click', closeDrawer);
  $('#drawer-scrim')?.addEventListener('click', closeDrawer);

  const mobileNav = $('#mobile-nav');
  const openMobile = () => {
    mobileNav.hidden = false;
    mobileNav.classList.add('is-open');
    $('#menu-btn').setAttribute('aria-expanded', 'true');
    $('#mobile-close').focus();
  };
  const closeMobile = () => {
    mobileNav.classList.remove('is-open');
    mobileNav.hidden = true;
    $('#menu-btn').setAttribute('aria-expanded', 'false');
    $('#menu-btn').focus();
  };
  $('#menu-btn')?.addEventListener('click', openMobile);
  $('#mobile-close')?.addEventListener('click', closeMobile);

  // The mega menu opens on hover for pointers and on click/Enter for keyboards.
  const megaBtn = $('#mega-btn');
  megaBtn?.addEventListener('click', () => {
    const open = megaBtn.getAttribute('aria-expanded') === 'true';
    megaBtn.setAttribute('aria-expanded', String(!open));
    megaBtn.closest('.has-mega')?.classList.toggle('is-open', !open);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#drawer')?.hidden) closeDrawer();
    if (mobileNav && !mobileNav.hidden) closeMobile();
    if (megaBtn?.getAttribute('aria-expanded') === 'true') {
      megaBtn.setAttribute('aria-expanded', 'false');
      megaBtn.closest('.has-mega')?.classList.remove('is-open');
      megaBtn.focus();
    }
  });

  // Focus stays inside the open drawer.
  $('#drawer')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = $$(FOCUSABLE, $('#drawer'));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // Delegated so re-rendered rows keep working.
  $('#drawer')?.addEventListener('click', (e) => {
    const t = e.target.closest('[data-inc],[data-dec],[data-rm]');
    if (!t) return;
    const qtyOf = (id) => getCart().find((l) => l.id === id)?.qty || 0;
    if (t.dataset.inc) setQty(t.dataset.inc, qtyOf(t.dataset.inc) + 1);
    if (t.dataset.dec) setQty(t.dataset.dec, qtyOf(t.dataset.dec) - 1);
    if (t.dataset.rm) removeFromCart(t.dataset.rm);
  });

  // Another tab editing the cart must not be clobbered by this one.
  window.addEventListener('storage', (e) => {
    if (e.key && e.key !== CART_KEY) return;
    cart = readCart();
    notify();
  });

  onCartChange(() => {
    const { count } = cartTotals();
    const badge = $('.cart-count');
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }
    $('#cart-btn')?.setAttribute('aria-label', count ? `Open cart, ${count} item${count === 1 ? '' : 's'}` : 'Open cart');
    renderDrawer();
  });

  initTheme();
  initAnnouncements();
  initAgeGate();
}
