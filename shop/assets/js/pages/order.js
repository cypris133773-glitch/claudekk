import { initShell, money, $, esc, toast, SITE, ORDERS_KEY } from '../app.js';

initShell();

const id = new URLSearchParams(location.search).get('id');
const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
const order = orders.find((o) => o.id === id) || orders[0];
const root = $('#order-root');

if (!order) {
  root.innerHTML = `<div class="empty">
    <h1>No order found</h1>
    <p class="muted">Order records live in this browser only. If you cleared site data, email us and we will look it up.</p>
    <a class="btn btn-primary" href="shop.html">Back to the shop</a>
  </div>`;
} else {
  const created = new Date(order.created);
  root.innerHTML = `
  <div class="center" style="margin-bottom:26px">
    <div class="brand-mark" style="width:52px;height:52px;border-radius:16px;margin:0 auto 16px;font-size:1.3rem">✓</div>
    <h1 style="margin-bottom:6px">Order received</h1>
    <p class="muted">We are watching the ${esc(order.coinSymbol)} address for your transfer. You will get an email as soon as it confirms.</p>
  </div>

  <div class="card">
    <div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between">
      <div><span class="tiny muted">Order number</span><div><b>${esc(order.id)}</b></div></div>
      <div><span class="tiny muted">Placed</span><div><b>${created.toLocaleString()}</b></div></div>
      <div><span class="tiny muted">Status</span><div><b style="color:var(--warn)">Awaiting confirmation</b></div></div>
      <div><span class="tiny muted">Total</span><div><b>${money(order.usd)}</b></div></div>
    </div>
  </div>

  <div class="card" style="margin-top:16px">
    <h3>Payment</h3>
    <div class="summary-row"><span>Amount sent</span><b>${esc(order.amount)} ${esc(order.coinSymbol)}</b></div>
    <div class="summary-row"><span>Quoted rate</span><span>${money(order.rate)} per ${esc(order.coinSymbol)}</span></div>
    <div class="addr" style="margin-top:10px">
      <span>${esc(order.address)}</span>
      <button class="btn btn-sm btn-ghost copy-btn" id="copy-addr" type="button">Copy</button>
    </div>
    <p class="small muted" style="margin-top:12px">
      Haven't sent it yet? Send exactly <b>${esc(order.amount)} ${esc(order.coinSymbol)}</b> to the address above and
      quote order <b>${esc(order.id)}</b> if you email us. Sending a different amount is fine — we credit what arrives
      and email you about any shortfall.
    </p>
  </div>

  <div class="card" style="margin-top:16px">
    <h3>Items</h3>
    ${order.items
      .map(
        (i) => `<div class="summary-row">
          <span><a href="product.html?p=${esc(i.slug)}">${esc(i.name)}</a> <span class="muted">· ${esc(i.size)} × ${i.qty}</span></span>
          <span>${money(i.price * i.qty)}</span>
        </div>`,
      )
      .join('')}
    <div class="summary-row total"><span>Total paid</span><span>${money(order.usd)}</span></div>
  </div>

  <div class="card" style="margin-top:16px">
    <h3>Shipping to</h3>
    <p class="small" style="margin:0">
      ${esc(order.ship.first)} ${esc(order.ship.last)}<br />
      ${esc(order.ship.address)}${order.ship.address2 ? `<br />${esc(order.ship.address2)}` : ''}<br />
      ${esc(order.ship.city)}${order.ship.stateProv ? `, ${esc(order.ship.stateProv)}` : ''} ${esc(order.ship.zip)}<br />
      ${esc(order.ship.country)}<br />
      <span class="muted">${esc(order.ship.email)}</span>
    </p>
  </div>

  <div class="card" style="margin-top:16px">
    <h3>What happens next</h3>
    <ol class="small muted" style="padding-left:18px;margin:0">
      <li>Your transfer confirms on-chain — usually minutes, occasionally up to an hour for Bitcoin.</li>
      <li>We pack the order in an insulated mailer with a gel pack and hand it to the carrier.</li>
      <li>Tracking is emailed to ${esc(order.ship.email)}. Orders placed before 2pm ship the same day.</li>
    </ol>
    <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
      <a class="btn btn-ghost" href="track.html">Look up this order</a>
      <a class="btn btn-ghost" href="mailto:${esc(SITE.email)}?subject=Order%20${encodeURIComponent(order.id)}">Email support</a>
      <a class="btn btn-primary" href="shop.html">Continue shopping</a>
    </div>
  </div>

  <p class="tiny muted center" style="margin-top:20px">
    Order details are stored in this browser only — we do not create an account for you.
  </p>`;

  $('#copy-addr').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(order.address);
      toast('Address copied');
    } catch {
      toast('Copy failed — select the text manually');
    }
  });
}
