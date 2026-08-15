import { initShell, PRODUCTS, CATEGORIES, productCard, $, esc, money, stars } from '../app.js';
import { vialSVG } from '../vial.js';
import { BATCHES } from '../lab.js';

initShell();

// Hero collage — four signature vials.
const heroPicks = ['retatrutide', 'bpc-157', 'ghk-cu', 'ipamorelin']
  .map((slug) => PRODUCTS.find((p) => p.slug === slug))
  .filter(Boolean);
$('#hero-art').innerHTML = heroPicks
  .map(
    (p) => `<a class="card-mini" href="product.html?p=${p.slug}">
      ${vialSVG(p)}
      <b>${esc(p.name)}</b>
      <span>from ${money(p.minPrice)} · ${esc(p.purity)}</span>
    </a>`,
  )
  .join('');

// Categories with live product counts.
$('#cat-grid').innerHTML = CATEGORIES.map((c) => {
  const n = PRODUCTS.filter((p) => p.category === c.id).length;
  return `<a class="cat-card" style="--cat-accent:${c.accent}" href="shop.html?c=${c.id}">
    <b>${esc(c.name)}</b>
    <p>${esc(c.blurb)}</p>
    <span class="count">${n} product${n === 1 ? '' : 's'} →</span>
  </a>`;
}).join('');

const best = PRODUCTS.filter((p) => p.badges.includes('bestseller')).slice(0, 8);
$('#best-grid').innerHTML = best.map(productCard).join('');

const fresh = [
  ...PRODUCTS.filter((p) => p.badges.includes('new')),
  ...PRODUCTS.filter((p) => !p.badges.includes('new') && !p.badges.includes('bestseller')),
].slice(0, 4);
$('#new-grid').innerHTML = fresh.map(productCard).join('');

// Batch preview table.
$('#batch-preview').innerHTML = BATCHES.slice(0, 6)
  .map(
    (b) => `<a href="report.html?b=${encodeURIComponent(b.batch)}"
      style="display:grid;grid-template-columns:1fr auto;gap:6px;padding:12px 20px;border-bottom:1px solid var(--line)">
      <span>
        <b class="small">${esc(b.product)}</b>
        <span class="tiny muted" style="display:block">${esc(b.batch)} · tested ${esc(b.tested)}</span>
      </span>
      <span class="small" style="color:var(--ok);font-weight:700;align-self:center">${esc(b.purity)}</span>
    </a>`,
  )
  .join('');

const QUOTES = [
  {
    name: 'M. Reyes',
    role: 'Verified buyer',
    text: 'Third order in. Vials arrive sealed with the batch number matching the report on the site, which is the whole reason I switched suppliers.',
    r: 5,
  },
  {
    name: 'T. Novak',
    role: 'Verified buyer',
    text: 'Paid in SOL at 9am, tracking number in my inbox that afternoon. The amount due was locked at checkout so there was no guessing on the transfer.',
    r: 5,
  },
  {
    name: 'A. Lindqvist',
    role: 'Verified buyer',
    text: 'Packaging is genuinely cold-chain — gel pack still frozen on arrival, and the lyophilised cake was intact in every vial.',
    r: 4.8,
  },
];
$('#quotes').innerHTML = QUOTES.map(
  (q) => `<div class="quote">
    <div class="stars">${stars(q.r)}</div>
    <p>“${esc(q.text)}”</p>
    <div class="review-head">
      <span class="avatar">${esc(q.name[0])}</span>
      <span><b class="small">${esc(q.name)}</b><span class="tiny muted" style="display:block">${esc(q.role)}</span></span>
    </div>
  </div>`,
).join('');

const FAQS = [
  [
    'Which cryptocurrencies do you accept?',
    'Bitcoin, Solana and Ethereum. Checkout shows the receiving address, a scannable QR code and the exact amount due for the coin you pick. We do not accept cards, PayPal or bank transfer.',
  ],
  [
    'Are the prices really 15% below list?',
    'Yes. Every product page shows the list price struck through next to the price you pay. The discount is applied site-wide and needs no coupon code.',
  ],
  [
    'How do I know the vial matches the lab report?',
    'Each vial is printed with a batch number. Search it on the lab tests page and the report for that lot opens, including assayed purity, identity confirmation and water content.',
  ],
  [
    'What happens if a package is lost or seized?',
    'Send us the tracking number. Anything that has not moved for ten business days is reshipped once at our cost, or refunded in the coin you paid with.',
  ],
];
$('#faq-preview').innerHTML = FAQS.map(
  ([q, a]) => `<details class="acc"><summary>${esc(q)}</summary><div class="acc-body">${esc(a)}</div></details>`,
).join('');
