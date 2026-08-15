import {
  initShell, PRODUCTS, productCard, addToCart, money, $, $$, esc, stars, DISCOUNT, SITE,
} from '../app.js';
import { getProduct } from '../catalog.js';
import { vialSVG } from '../vial.js';
import { batchesForSlug, LAB } from '../lab.js';

initShell();

const root = $('#pdp-root');
const slug = new URLSearchParams(location.search).get('p');
const product = slug ? getProduct(slug) : null;

// Deterministic per-product reviews so the page is stable between loads.
const NAMES = ['J. Whitfield', 'S. Okafor', 'D. Marchetti', 'R. Bergström', 'K. Tanaka', 'L. Fontaine', 'P. Novosad', 'C. Alvarez'];
const BODIES = [
  'Cake was intact and dissolved clear with no cloudiness. Batch number matched the report published on the site.',
  'Second lot I have ordered of this and the assay came back consistent with the first. Packaging was cold on arrival.',
  'Ordering with SOL took about a minute and the order moved to packed the same afternoon.',
  'Vials were sealed properly with no crimp damage, and the labels list the batch so cross-checking the report was easy.',
  'Purity on the published report lined up with what I measured in-house, which is the main thing I care about.',
  'Shipping was quicker than the estimate and the insulated mailer was still cold after two days in transit.',
];

function reviewsFor(p) {
  let s = 0;
  for (const ch of p.slug) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: 4 }, (_, i) => ({
    name: NAMES[(s + i * 3) % NAMES.length],
    body: BODIES[(s + i * 5) % BODIES.length],
    rating: i === 3 && p.rating < 4.8 ? 4 : 5,
    date: new Date(Date.now() - ((s + i * 97) % 240) * 86400000).toISOString().slice(0, 10),
    variant: p.variants[(s + i) % p.variants.length].size,
  }));
}

function renderPDP(p) {
  const batches = batchesForSlug(p.slug);
  const related = PRODUCTS.filter((x) => x.category === p.category && x.slug !== p.slug).slice(0, 4);
  const reviews = reviewsFor(p);

  root.innerHTML = `
  <nav class="tiny muted" style="margin-bottom:14px">
    <a href="index.html">Home</a> / <a href="shop.html">Shop</a> /
    <a href="shop.html?c=${p.category}">${esc(p.categoryName)}</a> / <span>${esc(p.name)}</span>
  </nav>

  <div class="pdp">
    <div>
      <div class="pdp-media">
        ${vialSVG(p)}
        <div class="pc-badges">
          ${p.badges.includes('bestseller') ? '<span class="badge best">Bestseller</span>' : ''}
          ${p.badges.includes('new') ? '<span class="badge new">New</span>' : ''}
          <span class="badge sale">−${Math.round(DISCOUNT * 100)}%</span>
        </div>
      </div>
      <div class="grid grid-3" style="margin-top:14px;gap:10px">
        <div class="card" style="padding:12px;text-align:center"><b class="small">${esc(p.purity)}</b><div class="tiny muted">Assayed purity</div></div>
        <div class="card" style="padding:12px;text-align:center"><b class="small">${batches.length || '—'}</b><div class="tiny muted">Published lots</div></div>
        <div class="card" style="padding:12px;text-align:center"><b class="small">2–4 days</b><div class="tiny muted">Typical delivery</div></div>
      </div>
    </div>

    <div>
      <span class="pc-cat">${esc(p.categoryName)}</span>
      <h1>${esc(p.name)}</h1>
      <div class="pc-meta" style="margin-bottom:10px">
        <span class="stars">${stars(p.rating)}</span> ${p.rating} · ${p.reviews} reviews
        ${p.cas ? `· CAS ${esc(p.cas)}` : ''}${p.aka ? ` · ${esc(p.aka)}` : ''}
      </div>
      <p class="muted">${esc(p.summary)}</p>

      <div class="pdp-price">
        <span class="now" id="price-now"></span>
        <span class="was" id="price-was"></span>
        <span class="save" id="price-save"></span>
      </div>

      <div style="margin:18px 0 8px" class="small"><b>Size</b></div>
      <div class="variant-row" id="variants">
        ${p.variants
          .map(
            (v, i) => `<button class="variant" data-vid="${v.id}" aria-pressed="${i === 0}">
              ${esc(v.size)}<small>${money(v.price)}</small>
            </button>`,
          )
          .join('')}
      </div>

      <div style="display:flex;gap:12px;margin:20px 0 12px;flex-wrap:wrap">
        <div class="qty">
          <button id="q-dec" aria-label="Decrease quantity">−</button>
          <input id="qty" type="number" value="1" min="1" max="99" aria-label="Quantity" />
          <button id="q-inc" aria-label="Increase quantity">+</button>
        </div>
        <button class="btn btn-primary btn-lg" id="add" style="flex:1;min-width:190px">Add to cart</button>
      </div>
      <button class="btn btn-dark btn-block" id="buy">Buy now with crypto</button>

      <ul class="stack small muted" style="list-style:none;padding:0;margin:20px 0 0">
        <li>✓ Lyophilised and sealed under nitrogen</li>
        <li>✓ Independently assayed — report published against the lot</li>
        <li>✓ Free tracked shipping over ${money(SITE.freeShippingOver)} · dispatch within 24h</li>
        <li>✓ BTC, SOL and ETH accepted at checkout</li>
      </ul>

      <div class="note" style="margin-top:18px">
        <strong>Research use only.</strong> Not for human or veterinary consumption. Sold to qualified
        researchers for in-vitro and laboratory use.
      </div>
    </div>
  </div>

  <section class="section-sm" style="margin-top:20px">
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" aria-selected="true" data-tab="desc">Description</button>
      <button class="tab" role="tab" aria-selected="false" data-tab="specs">Specifications</button>
      <button class="tab" role="tab" aria-selected="false" data-tab="lab">Lab reports</button>
      <button class="tab" role="tab" aria-selected="false" data-tab="handling">Handling &amp; storage</button>
      <button class="tab" role="tab" aria-selected="false" data-tab="reviews">Reviews (${p.reviews})</button>
    </div>

    <div class="tabpanel" data-panel="desc">
      <div style="max-width:76ch">
        <p>${esc(p.name)} is supplied as a lyophilised powder for laboratory research. ${esc(p.summary)}</p>
        <p>Material is manufactured by solid-phase peptide synthesis, purified by preparative RP-HPLC and
        sealed under nitrogen in amber vials. A sample from every production lot is submitted to
        ${esc(LAB.name)} for independent analysis before the lot is released for sale.</p>
        <h3>Commonly studied areas</h3>
        <ul>${(p.research || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      </div>
    </div>

    <div class="tabpanel" data-panel="specs" hidden>
      <table class="spec-table" style="max-width:640px">
        <tbody>
          <tr><th>Compound</th><td>${esc(p.name)}</td></tr>
          ${p.aka ? `<tr><th>Also known as</th><td>${esc(p.aka)}</td></tr>` : ''}
          ${p.cas ? `<tr><th>CAS number</th><td>${esc(p.cas)}</td></tr>` : ''}
          <tr><th>Purity (typical)</th><td>${esc(p.purity)}</td></tr>
          <tr><th>Presentation</th><td>${p.category === 'supplies' ? 'As described' : p.form === 'capsules' || p.form === 'oral' ? 'Oral, as described' : 'Lyophilised powder, sealed vial'}</td></tr>
          <tr><th>Sizes available</th><td>${p.variants.map((v) => esc(v.size)).join(', ')}</td></tr>
          <tr><th>Storage</th><td>${p.category === 'supplies' ? 'Room temperature, dry' : 'Lyophilised: −20 °C long term, room temperature in transit'}</td></tr>
          <tr><th>Analysis</th><td>${LAB.methods.map(esc).join(', ')}</td></tr>
          <tr><th>Intended use</th><td>Laboratory research only — not for human or veterinary use</td></tr>
        </tbody>
      </table>
    </div>

    <div class="tabpanel" data-panel="lab" hidden>
      ${
        batches.length
          ? `<p class="muted small">Reports are filed against the batch number printed on the vial label.</p>
             <table class="spec-table" style="max-width:760px">
               <thead><tr><th>Batch</th><th>Tested</th><th>Purity</th><th>Report</th></tr></thead>
               <tbody>${batches
                 .map(
                   (b) => `<tr>
                     <td><code>${esc(b.batch)}</code></td>
                     <td>${esc(b.tested)}</td>
                     <td>${esc(b.purity)}</td>
                     <td><a href="report.html?b=${encodeURIComponent(b.batch)}">View report →</a></td>
                   </tr>`,
                 )
                 .join('')}</tbody>
             </table>`
          : '<p class="muted">No published lots for this item — lab supplies are supplied with the manufacturer’s own certification.</p>'
      }
    </div>

    <div class="tabpanel" data-panel="handling" hidden>
      <div style="max-width:76ch">
        <h3>On arrival</h3>
        <p>Inspect the crimp seal and confirm the lyophilised cake is intact. Vials ship with a gel pack;
        brief exposure to ambient temperature in transit does not affect lyophilised material.</p>
        <h3>Storage</h3>
        <ul>
          <li>Lyophilised, unopened: −20 °C, protected from light.</li>
          <li>After reconstitution: 2–8 °C, and use within the working window for your assay.</li>
          <li>Avoid repeated freeze–thaw cycles; aliquot before freezing.</li>
        </ul>
        <h3>Laboratory handling</h3>
        <p>Handle with standard laboratory PPE. Add diluent slowly down the vial wall rather than directly
        onto the cake, and swirl rather than shake. Material is supplied for in-vitro and laboratory
        research only and must not be administered to humans or animals.</p>
      </div>
    </div>

    <div class="tabpanel" data-panel="reviews" hidden>
      <div style="max-width:76ch">
        <div style="display:flex;gap:18px;align-items:center;margin-bottom:10px">
          <div style="font-size:2.4rem;font-weight:800">${p.rating}</div>
          <div><div class="stars">${stars(p.rating)}</div><div class="tiny muted">Based on ${p.reviews} verified orders</div></div>
        </div>
        ${reviews
          .map(
            (r) => `<div class="review">
              <div class="review-head">
                <span class="avatar">${esc(r.name[0])}</span>
                <span><b>${esc(r.name)}</b> <span class="verified">✓ Verified buyer</span>
                  <span class="tiny muted" style="display:block">${esc(r.variant)} · ${esc(r.date)}</span></span>
                <span class="stars" style="margin-left:auto">${stars(r.rating)}</span>
              </div>
              <p class="small" style="margin:8px 0 0">${esc(r.body)}</p>
            </div>`,
          )
          .join('')}
      </div>
    </div>
  </section>

  ${
    related.length
      ? `<section class="section-sm">
           <h2>Others in ${esc(p.categoryName)}</h2>
           <div class="grid grid-4">${related.map(productCard).join('')}</div>
         </section>`
      : ''
  }`;

  // ── interactions ──────────────────────────────────────────────────
  let selected = p.variants[0];

  const paint = () => {
    $('#price-now').textContent = money(selected.price);
    $('#price-was').textContent = money(selected.msrp);
    $('#price-save').textContent = `Save ${money(selected.msrp - selected.price)}`;
    $$('#variants .variant').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.vid === selected.id)),
    );
  };

  $('#variants').addEventListener('click', (e) => {
    const btn = e.target.closest('.variant');
    if (!btn) return;
    selected = p.variants.find((v) => v.id === btn.dataset.vid);
    paint();
  });

  const qtyInput = $('#qty');
  const clampQty = () => {
    const n = Math.max(1, Math.min(99, Number(qtyInput.value) || 1));
    qtyInput.value = String(n);
    return n;
  };
  $('#q-inc').addEventListener('click', () => ((qtyInput.value = clampQty() + 1), clampQty()));
  $('#q-dec').addEventListener('click', () => ((qtyInput.value = clampQty() - 1), clampQty()));
  qtyInput.addEventListener('change', clampQty);

  $('#add').addEventListener('click', () => addToCart(selected.id, clampQty()));
  $('#buy').addEventListener('click', () => {
    addToCart(selected.id, clampQty());
    location.href = 'checkout.html';
  });

  $$('.tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      $$('.tabpanel').forEach((panel) => (panel.hidden = panel.dataset.panel !== tab.dataset.tab));
    }),
  );

  paint();
}

if (!product) {
  root.innerHTML = `<div class="empty">
    <h1>Product not found</h1>
    <p class="muted">That link may be out of date.</p>
    <a class="btn btn-primary" href="shop.html">Back to the catalogue</a>
  </div>`;
} else {
  document.title = `${product.name} — CryptoPeptides`;
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute(
      'content',
      `${product.name}: ${product.summary} Third-party tested, ${Math.round(DISCOUNT * 100)}% off list, crypto checkout.`,
    );
  renderPDP(product);
}
