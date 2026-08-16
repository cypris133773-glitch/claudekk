import { initShell, money, $, esc, toast, SITE, readOrders } from '../app.js';

initShell();

const id = new URLSearchParams(location.search).get('id');
const orders = readOrders();
// An unknown id is a miss, not an excuse to show somebody else's order. Only a
// missing id falls back to the newest.
const order = id ? orders.find((o) => o.id === id) : orders[0];
const root = $('#order-root');

if (!order) {
  root.innerHTML = `<div class="empty">
    <h1>No order found${id ? ` for ${esc(id)}` : ''}</h1>
    <p class="muted">
      Order records live in this browser only. If you cleared site data or ordered from another device,
      email us with the order number or the transaction ID you paid from.
    </p>
    <a class="btn btn-primary" href="mailto:${esc(SITE.email)}">Email support</a>
    <a class="btn btn-ghost" href="shop.html">Back to the shop</a>
  </div>`;
} else {
  const created = new Date(order.created);
  const mailBody =
    `Order ${order.id}\n` +
    `Amount: ${money(order.usd)} (sent as ${order.coinSymbol})\n` +
    `To address: ${order.address}\n` +
    `Transaction ID: \n\n` +
    order.items.map((i) => `${i.qty} × ${i.name} ${i.size}`).join('\n');
  const mailto = `mailto:${SITE.email}?subject=${encodeURIComponent(`Payment for order ${order.id}`)}&body=${encodeURIComponent(mailBody)}`;

  root.innerHTML = `
  <div class="center order-head">
    <div class="brand-mark order-tick" aria-hidden="true">✓</div>
    <h1>Order recorded</h1>
    <p class="muted">Keep the order number below — it is how we match your payment to your parcel.</p>
  </div>

  <div class="note note-strong">
    <b>This order has not been sent to us yet.</b> It exists in this browser only. Email us the order number and
    your transaction ID and we will confirm receipt and dispatch; without that we cannot tell which payment on the
    address is yours.
    <a class="btn btn-primary btn-block" style="margin-top:12px" href="${esc(mailto)}">Email order ${esc(order.id)} to ${esc(SITE.email)}</a>
  </div>

  <div class="card">
    <div class="order-facts">
      <div><span class="tiny muted">Order number</span><b class="mono">${esc(order.id)}</b></div>
      <div><span class="tiny muted">Placed</span><b>${created.toLocaleString()}</b></div>
      <div><span class="tiny muted">Status</span><b class="warn-text">Awaiting your payment email</b></div>
      <div><span class="tiny muted">Total</span><b>${money(order.usd)}</b></div>
    </div>
  </div>

  <div class="card">
    <h2>Payment</h2>
    <div class="summary-row"><span>Amount owed</span><b>${money(order.usd)}</b></div>
    <div class="summary-row"><span>Sent as</span><span>${esc(order.amount)} ${esc(order.coinSymbol)}${
      order.rateLive ? '' : ' (approximate — converted at a reference rate)'
    }</span></div>
    <div class="summary-row"><span>Network</span><span>${esc(order.network || order.coinSymbol)}</span></div>
    <div class="addr" style="margin-top:10px">
      <span class="mono">${esc(order.address)}</span>
      <button class="btn btn-sm btn-ghost copy-btn" id="copy-addr" type="button">Copy</button>
    </div>
    <p class="small muted" style="margin-top:12px">
      Not sent it yet? Send the ${money(order.usd)} equivalent to the address above on ${esc(order.network || 'the network shown')},
      then use the email button. Shortfalls under ${Math.round(SITE.shortfallTolerance * 100)}% are absorbed;
      anything larger we will email you about.
    </p>
  </div>

  <div class="card">
    <h2>Items</h2>
    ${order.items
      .map(
        (i) => `<div class="summary-row">
          <span><a href="product.html?p=${esc(i.slug)}">${esc(i.name)}</a> <span class="muted">· ${esc(i.size)} × ${i.qty}</span></span>
          <span>${money(i.price * i.qty)}</span>
        </div>`,
      )
      .join('')}
    <div class="summary-row total"><span>Order total</span><span>${money(order.usd)}</span></div>
  </div>

  <div class="card">
    <h2>Shipping to</h2>
    <p class="small" style="margin:0">
      ${esc(order.ship.first)} ${esc(order.ship.last)}<br />
      ${esc(order.ship.address)}${order.ship.address2 ? `<br />${esc(order.ship.address2)}` : ''}<br />
      ${esc(order.ship.city)}${order.ship.stateProv ? `, ${esc(order.ship.stateProv)}` : ''} ${esc(order.ship.zip)}<br />
      ${esc(order.ship.country)}<br />
      <span class="muted">${esc(order.ship.email)}</span>
    </p>
  </div>

  <div class="card">
    <h2>What happens next</h2>
    <ol class="small muted numbered">
      <li>You email the order number and transaction ID.</li>
      <li>We match it against the address and confirm by reply.</li>
      <li>The order is packed in an insulated mailer and handed to the carrier, and we send the tracking number.</li>
    </ol>
    <div class="btn-row">
      <a class="btn btn-ghost" href="track.html">Order lookup</a>
      <a class="btn btn-ghost" href="shop.html">Continue shopping</a>
    </div>
  </div>

  <p class="tiny muted center" style="margin-top:20px">
    Records are kept in this browser for ${SITE.orderRetentionDays} days and then dropped.
  </p>`;

  $('#copy-addr').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(order.address);
      toast(`Address copied — ${order.network || order.coinSymbol}`);
    } catch {
      toast('Copy failed — select the text manually');
    }
  });
}
