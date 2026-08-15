import {
  initShell, cartTotals, setQty, removeFromCart, getCart, onCartChange, money, $, esc, SITE, PRODUCTS, productCard,
} from '../app.js';
import { vialSVG } from '../vial.js';

initShell();

const root = $('#cart-root');

function render() {
  const { lines, subtotal, saved, shipping, total, count } = cartTotals();

  if (!lines.length) {
    root.innerHTML = `<div class="empty" style="margin-top:24px">
      <h3>Your cart is empty</h3>
      <p class="muted">Every vial in the catalogue is already 15% below list price.</p>
      <a class="btn btn-primary" href="shop.html">Browse the catalogue</a>
    </div>
    <section class="section-sm">
      <h2>Popular right now</h2>
      <div class="grid grid-4">${PRODUCTS.filter((p) => p.badges.includes('bestseller')).slice(0, 4).map(productCard).join('')}</div>
    </section>`;
    return;
  }

  const toFree = Math.max(0, SITE.freeShippingOver - subtotal);

  root.innerHTML = `<div class="checkout-grid" style="margin-top:22px">
    <div>
      ${
        toFree > 0
          ? `<div class="card" style="padding:14px 18px;margin-bottom:16px">
               <div class="small">Add <b>${money(toFree)}</b> more for free tracked shipping</div>
               <div class="ship-bar"><i style="width:${Math.min(100, (subtotal / SITE.freeShippingOver) * 100)}%"></i></div>
             </div>`
          : `<div class="card" style="padding:14px 18px;margin-bottom:16px;color:var(--ok)">
               <b class="small">✓ Free tracked shipping applied</b>
             </div>`
      }
      ${lines
        .map(
          (l) => `<div class="line-item" style="grid-template-columns:82px 1fr auto">
            <a class="thumb" href="product.html?p=${l.product.slug}">${vialSVG(l.product, l.variant.size)}</a>
            <div>
              <a href="product.html?p=${l.product.slug}"><b>${esc(l.product.name)}</b></a>
              <span class="sz">${esc(l.variant.size)} · ${esc(l.product.purity)} purity</span>
              <div class="li-actions">
                <button data-dec="${l.id}" aria-label="Decrease quantity">−</button>
                <span class="small" style="min-width:22px;text-align:center">${l.qty}</span>
                <button data-inc="${l.id}" aria-label="Increase quantity">+</button>
                <button class="link-btn" data-rm="${l.id}" style="margin-left:8px">Remove</button>
              </div>
            </div>
            <div style="text-align:right">
              <div class="price">${money(l.lineTotal)}</div>
              <div class="tiny muted"><s>${money(l.variant.msrp * l.qty)}</s></div>
            </div>
          </div>`,
        )
        .join('')}
      <a class="btn btn-ghost btn-sm" style="margin-top:16px" href="shop.html">← Continue shopping</a>
    </div>

    <aside class="card sticky-summary">
      <h3>Order summary</h3>
      <div class="summary-row"><span>Items (${count})</span><span>${money(subtotal)}</span></div>
      <div class="summary-row" style="color:var(--ok)"><span>Site-wide discount</span><span>−${money(saved)}</span></div>
      <div class="summary-row"><span>Shipping</span><span>${shipping ? money(shipping) : 'Free'}</span></div>
      <div class="summary-row total"><span>Total</span><span>${money(total)}</span></div>
      <a class="btn btn-primary btn-block btn-lg" style="margin-top:14px" href="checkout.html">Checkout with crypto</a>
      <div class="pay-chips" style="margin-top:12px;justify-content:center"><span>BTC</span><span>SOL</span><span>ETH</span></div>
      <p class="tiny muted center" style="margin:12px 0 0">
        Prices in USD. The exact coin amount is quoted and locked at checkout.
      </p>
    </aside>
  </div>`;
}

root.addEventListener('click', (e) => {
  const t = e.target.closest('[data-inc],[data-dec],[data-rm]');
  if (!t) return;
  const qtyOf = (id) => getCart().find((l) => l.id === id)?.qty || 0;
  if (t.dataset.inc) setQty(t.dataset.inc, qtyOf(t.dataset.inc) + 1);
  if (t.dataset.dec) setQty(t.dataset.dec, qtyOf(t.dataset.dec) - 1);
  if (t.dataset.rm) removeFromCart(t.dataset.rm);
});

onCartChange(render);
