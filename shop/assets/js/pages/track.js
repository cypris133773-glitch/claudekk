import { initShell, money, $, esc, readOrders } from '../app.js';

initShell();

const orders = readOrders();
const result = $('#result');

// The most recent order is offered up front — most lookups are for that one.
if (orders.length) {
  result.innerHTML = `<p class="small muted">Recent orders in this browser:
    ${orders
      .slice(0, 5)
      .map((o) => `<a href="order.html?id=${encodeURIComponent(o.id)}"><code>${esc(o.id)}</code></a>`)
      .join(' · ')}
  </p>`;
}

$('#lookup').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = $('#oid').value.trim().toUpperCase();
  const order = orders.find((o) => o.id.toUpperCase() === id);
  if (!order) {
    result.innerHTML = `<div class="empty">
      <p><b>No order matching <code>${esc(id || '—')}</code></b></p>
      <p class="small muted">Check the number, or email support with the transaction ID you paid from.</p>
    </div>`;
    return;
  }
  result.innerHTML = `<div class="card">
    <div class="summary-row"><span>Order</span><b>${esc(order.id)}</b></div>
    <div class="summary-row"><span>Placed</span><span>${new Date(order.created).toLocaleString()}</span></div>
    <div class="summary-row"><span>Status</span><b class="warn-text">Awaiting your payment email</b></div>
    <div class="summary-row"><span>Paid</span><span>${esc(order.amount)} ${esc(order.coinSymbol)} (${money(order.usd)})</span></div>
    <a class="btn btn-primary btn-block" style="margin-top:12px" href="order.html?id=${encodeURIComponent(order.id)}">Open full order</a>
  </div>`;
});
