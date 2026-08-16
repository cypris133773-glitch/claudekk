import {
  initShell, PRODUCTS, productCard, addToCart, money, $, $$, esc, DISCOUNT, SITE,
} from '../app.js';
import { getProduct } from '../catalog.js';
import { vialSVG } from '../vial.js';
import { batchesForSlug, publishedForSlug, LAB_GENERIC, METHODS } from '../lab.js';

initShell();

const root = $('#pdp-root');
const slug = new URLSearchParams(location.search).get('p');
const product = slug ? getProduct(slug) : null;

const isSupply = (p) => p.category === 'supplies';

function renderPDP(p) {
  const lots = batchesForSlug(p.slug);
  const published = publishedForSlug(p.slug);
  const related = PRODUCTS.filter((x) => x.category === p.category && x.slug !== p.slug).slice(0, 4);

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
          ${p.badges.includes('bestseller') ? '<span class="badge best">Popular</span>' : ''}
          ${p.badges.includes('new') ? '<span class="badge new">New</span>' : ''}
          <span class="badge sale">−${Math.round(DISCOUNT * 100)}%</span>
        </div>
      </div>
      <div class="grid grid-3 pdp-stats">
        ${
          isSupply(p)
            ? `<div class="card stat-card"><b>${esc(p.spec || p.purity)}</b><span class="tiny muted">Specification</span></div>`
            : `<div class="card stat-card"><b>${esc(p.purity)}</b><span class="tiny muted">Target purity</span></div>`
        }
        <div class="card stat-card"><b>${lots.length || '—'}</b><span class="tiny muted">Lots on file</span></div>
        <div class="card stat-card"><b>${published.length}</b><span class="tiny muted">Certificates issued</span></div>
      </div>
    </div>

    <div>
      <span class="pc-cat">${esc(p.categoryName)}</span>
      <h1>${esc(p.name)}</h1>
      <p class="pdp-ids tiny muted">
        ${p.cas ? `CAS ${esc(p.cas)}` : ''}${p.cas && p.aka ? ' · ' : ''}${p.aka ? esc(p.aka) : ''}
      </p>
      <p class="muted">${esc(p.summary)}</p>

      <div class="pdp-price">
        <span class="now" id="price-now"></span>
        <span class="was" id="price-was"></span>
        <span class="save" id="price-save"></span>
      </div>

      <div class="field-label"><b>Size</b></div>
      <div class="variant-row" id="variants" role="group" aria-label="Size">
        ${p.variants
          .map(
            (v, i) => `<button type="button" class="variant" data-vid="${v.id}" aria-pressed="${i === 0}">
              ${esc(v.size)}<small>${money(v.price)}</small>
            </button>`,
          )
          .join('')}
      </div>

      <div class="buy-row">
        <div class="qty">
          <button type="button" id="q-dec" aria-label="Decrease quantity">−</button>
          <input id="qty" type="number" value="1" min="1" max="${SITE.maxQty}" aria-label="Quantity" />
          <button type="button" id="q-inc" aria-label="Increase quantity">+</button>
        </div>
        <button class="btn btn-primary btn-lg buy-main" id="add">Add to cart</button>
      </div>
      <button class="btn btn-dark btn-block" id="buy">Buy now with crypto</button>

      <ul class="ticks small muted">
        ${isSupply(p) ? '' : '<li>Lyophilised and sealed under nitrogen</li>'}
        <li>Lot number printed on the label, matched to its record in the <a href="lab-tests.html">lot registry</a></li>
        <li>Free tracked shipping over ${money(SITE.freeShippingOver)} to most destinations</li>
        <li>BTC, SOL and ETH accepted at checkout</li>
      </ul>

      <div class="note" style="margin-top:18px">
        <strong>Research use only.</strong> Not for human or veterinary consumption. Sold to qualified
        researchers for in-vitro and laboratory use.
      </div>
    </div>
  </div>

  <section class="section-sm">
    <div class="tabs" role="tablist" aria-label="Product details">
      <button class="tab" role="tab" id="tab-desc" aria-controls="panel-desc" aria-selected="true" data-tab="desc">Description</button>
      <button class="tab" role="tab" id="tab-specs" aria-controls="panel-specs" aria-selected="false" tabindex="-1" data-tab="specs">Specifications</button>
      <button class="tab" role="tab" id="tab-lab" aria-controls="panel-lab" aria-selected="false" tabindex="-1" data-tab="lab">Lots &amp; certificates</button>
      <button class="tab" role="tab" id="tab-handling" aria-controls="panel-handling" aria-selected="false" tabindex="-1" data-tab="handling">Handling &amp; storage</button>
    </div>

    <div class="tabpanel" id="panel-desc" role="tabpanel" aria-labelledby="tab-desc" tabindex="0" data-panel="desc">
      <div class="prose">
        <p>${esc(p.name)} is supplied ${isSupply(p) ? 'as described above' : 'as a lyophilised powder'} for laboratory research. ${esc(p.summary)}</p>
        ${
          isSupply(p)
            ? ''
            : `<p>Material is manufactured by solid-phase peptide synthesis and purified by preparative RP-HPLC.
               Each lot is filled, labelled with its lot number and recorded in the lot registry; a certificate
               appears against that lot once ${esc(LAB_GENERIC)} has analysed a sample of it.</p>`
        }
        <h3>${isSupply(p) ? 'Details' : 'Commonly studied areas'}</h3>
        <ul>${(p.research || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      </div>
    </div>

    <div class="tabpanel" id="panel-specs" role="tabpanel" aria-labelledby="tab-specs" tabindex="0" data-panel="specs" hidden>
      <table class="spec-table" style="max-width:640px">
        <tbody>
          <tr><th>${isSupply(p) ? 'Item' : 'Compound'}</th><td>${esc(p.name)}</td></tr>
          ${p.aka ? `<tr><th>Also known as</th><td>${esc(p.aka)}</td></tr>` : ''}
          ${p.cas ? `<tr><th>CAS number</th><td>${esc(p.cas)}</td></tr>` : ''}
          ${
            isSupply(p)
              ? `<tr><th>Specification</th><td>${esc(p.spec || p.purity)}</td></tr>`
              : `<tr><th>Target purity</th><td>${esc(p.purity)} — the assayed figure for a lot comes from its certificate</td></tr>`
          }
          <tr><th>Presentation</th><td>${
            isSupply(p)
              ? 'As described'
              : p.form === 'capsules' || p.form === 'oral'
                ? 'Oral, as described'
                : 'Lyophilised powder, sealed vial'
          }</td></tr>
          <tr><th>Sizes available</th><td>${p.variants.map((v) => esc(v.size)).join(', ')}</td></tr>
          <tr><th>Storage</th><td>${isSupply(p) ? 'Room temperature, dry' : 'Lyophilised: −20 °C long term, room temperature in transit'}</td></tr>
          ${isSupply(p) ? '' : `<tr><th>Analyses requested per lot</th><td>${METHODS.map(esc).join(', ')}</td></tr>`}
          <tr><th>Intended use</th><td>Laboratory research only — not for human or veterinary use</td></tr>
        </tbody>
      </table>
    </div>

    <div class="tabpanel" id="panel-lab" role="tabpanel" aria-labelledby="tab-lab" tabindex="0" data-panel="lab" hidden>
      ${
        lots.length
          ? `<p class="muted small">Lots are recorded against the number printed on the vial label.
             ${
               published.length
                 ? `${published.length} of ${lots.length} carr${published.length === 1 ? 'ies' : 'y'} an issued certificate.`
                 : 'No certificate has been issued for these lots yet — a lot page shows a marked specimen layout until one is.'
             }</p>
             <table class="spec-table" style="max-width:760px">
               <thead><tr><th>Lot</th><th>Filled</th><th>Certificate</th><th></th></tr></thead>
               <tbody>${lots
                 .map(
                   (b) => `<tr>
                     <td><code class="mono">${esc(b.batch)}</code></td>
                     <td>${esc(b.dated)}</td>
                     <td>${b.report ? '<span class="tag tag-ok">Issued</span>' : '<span class="tag">Awaiting</span>'}</td>
                     <td><a href="report.html?b=${encodeURIComponent(b.batch)}">Open →</a></td>
                   </tr>`,
                 )
                 .join('')}</tbody>
             </table>`
          : '<p class="muted">Lab supplies are not lot-tested by us — they ship with the manufacturer’s own certification.</p>'
      }
    </div>

    <div class="tabpanel" id="panel-handling" role="tabpanel" aria-labelledby="tab-handling" tabindex="0" data-panel="handling" hidden>
      <div class="prose">
        <h3>On arrival</h3>
        <p>Inspect the seal and, for lyophilised material, confirm the cake is intact. Vials ship with a gel
        pack; brief exposure to ambient temperature in transit does not affect lyophilised material.</p>
        <h3>Storage</h3>
        <ul>
          <li>Lyophilised, unopened: −20 °C, protected from light.</li>
          <li>After reconstitution: 2–8 °C, and use within the working window for your assay.</li>
          <li>Avoid repeated freeze–thaw cycles; aliquot before freezing.</li>
        </ul>
        <h3>Laboratory handling</h3>
        <p>Handle with standard laboratory PPE. Add diluent slowly down the vial wall rather than directly onto
        the cake, and swirl rather than shake. Supplied for in-vitro and laboratory research only; it must not
        be administered to humans or animals.</p>
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
    $('#price-was').setAttribute('aria-label', `List price ${money(selected.msrp)}`);
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
    const n = Math.max(1, Math.min(SITE.maxQty, Math.floor(Number(qtyInput.value)) || 1));
    qtyInput.value = String(n);
    return n;
  };
  $('#q-inc').addEventListener('click', () => {
    qtyInput.value = String(clampQty() + 1);
    clampQty();
  });
  $('#q-dec').addEventListener('click', () => {
    qtyInput.value = String(clampQty() - 1);
    clampQty();
  });
  qtyInput.addEventListener('change', clampQty);

  $('#add').addEventListener('click', () => addToCart(selected.id, clampQty()));
  $('#buy').addEventListener('click', () => {
    addToCart(selected.id, clampQty(), { silent: true });
    location.href = 'checkout.html';
  });

  // Tabs: roving tabindex, arrow-key navigation, panels linked both ways.
  const tabs = $$('.tab');
  const selectTab = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    $$('.tabpanel').forEach((panel) => (panel.hidden = panel.dataset.panel !== tab.dataset.tab));
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const next = tabs[(i + dir + tabs.length) % tabs.length];
      selectTab(next);
      next.focus();
    });
  });

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
      `${product.name}: ${product.summary} ${Math.round(DISCOUNT * 100)}% below list price, crypto checkout.`,
    );
  renderPDP(product);
}
