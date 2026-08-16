import { initShell, PRODUCTS, CATEGORIES, productCard, $, esc, money, DISCOUNT } from '../app.js';
import { vialSVG } from '../vial.js';
import { BATCHES, publishedCount, LAB_GENERIC } from '../lab.js';

initShell();

const set = (sel, value) => {
  const el = $(sel);
  if (el) el.textContent = value;
};

// Hero collage — four signature vials.
const heroPicks = ['retatrutide', 'bpc-157', 'ghk-cu', 'ipamorelin']
  .map((slug) => PRODUCTS.find((p) => p.slug === slug))
  .filter(Boolean);
const heroArt = $('#hero-art');
if (heroArt) {
  heroArt.innerHTML = heroPicks
    .map(
      (p) => `<a class="card-mini" href="product.html?p=${p.slug}">
        ${vialSVG(p)}
        <b>${esc(p.name)}</b>
        <span>from ${money(p.minPrice)}</span>
      </a>`,
    )
    .join('');
}

// Categories with live product counts.
const catGrid = $('#cat-grid');
if (catGrid) {
  catGrid.innerHTML = CATEGORIES.map((c) => {
    const n = PRODUCTS.filter((p) => p.category === c.id).length;
    return `<a class="cat-card" style="--cat-accent:${c.accent}" href="shop.html?c=${c.id}">
      <b>${esc(c.name)}</b>
      <p>${esc(c.blurb)}</p>
      <span class="count">${n} product${n === 1 ? '' : 's'} →</span>
    </a>`;
  }).join('');
}

const best = PRODUCTS.filter((p) => p.badges.includes('bestseller')).slice(0, 8);
const bestGrid = $('#best-grid');
if (bestGrid) bestGrid.innerHTML = best.map(productCard).join('');

const fresh = [
  ...PRODUCTS.filter((p) => p.badges.includes('new')),
  ...PRODUCTS.filter((p) => !p.badges.includes('new') && !p.badges.includes('bestseller')),
].slice(0, 4);
const newGrid = $('#new-grid');
if (newGrid) newGrid.innerHTML = fresh.map(productCard).join('');

/* Stat band — every figure computed from the catalogue, so the page cannot
   claim a number the data does not support. */
const compounds = PRODUCTS.filter((p) => p.category !== 'supplies');
set('#stat-products', `${compounds.length}`);
set('#stat-lots', `${BATCHES.length}`);
set('#stat-certs', `${publishedCount()}`);
set('#stat-discount', `${Math.round(DISCOUNT * 100)}%`);

// Lot registry preview.
const preview = $('#batch-preview');
if (preview) {
  preview.innerHTML = BATCHES.slice(0, 6)
    .map(
      (b) => `<a class="batch-row" href="report.html?b=${encodeURIComponent(b.batch)}">
        <span>
          <b class="small">${esc(b.product)}</b>
          <span class="tiny muted batch-id">${esc(b.batch)} · filled ${esc(b.dated)}</span>
        </span>
        <span class="tag${b.report ? ' tag-ok' : ''}">${b.report ? 'Certificate' : 'Awaiting'}</span>
      </a>`,
    )
    .join('');
}

const labNote = $('#lab-note');
if (labNote) {
  const published = publishedCount();
  labNote.textContent = published
    ? `${published} certificate${published === 1 ? '' : 's'} published against ${BATCHES.length} recorded lots.`
    : `${BATCHES.length} lots recorded. No certificate has been issued yet — each lot page shows a marked ` +
      `specimen layout until ${LAB_GENERIC} issues one.`;
}

const FAQS = [
  [
    'Which cryptocurrencies do you accept?',
    'Bitcoin, Solana and Ethereum. Checkout shows the receiving address, a scannable QR code and the amount for the coin you pick. We do not accept cards, PayPal or bank transfer.',
  ],
  [
    'Are the prices really 15% below list?',
    'Yes. Every product page shows the list price struck through next to the price you pay, and the difference is applied site-wide with no coupon code.',
  ],
  [
    'What does the lot number on the vial get me?',
    'Search it in the lot registry and you get that lot’s record: when it was filled, and the certificate of analysis once one has been issued for it. Where no certificate exists yet, the page says so rather than showing a figure.',
  ],
  [
    'What happens if a package is lost or seized?',
    'Send us the tracking number. Anything that has not moved for ten business days is reshipped once at our cost, or refunded in the coin you paid with.',
  ],
];
const faqPreview = $('#faq-preview');
if (faqPreview) {
  faqPreview.innerHTML = FAQS.map(
    ([q, a]) => `<details class="acc"><summary>${esc(q)}</summary><div class="acc-body">${esc(a)}</div></details>`,
  ).join('');
}
