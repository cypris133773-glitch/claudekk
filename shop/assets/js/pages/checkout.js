import {
  initShell, cartTotals, clearCart, money, $, $$, esc, toast, SITE, SHIPPING, shippingZone,
  saveOrder, onCartChange,
} from '../app.js';
import { CRYPTO } from '../catalog.js';
import { vialSVG } from '../vial.js';
import { safeSession, readJSON, writeJSON } from '../storage.js';

initShell();

/* Exchange rates.
 *
 * RATE_ENDPOINT should return { btc: <usd>, sol: <usd>, eth: <usd> }. Until one
 * is configured the figures below are a static reference table: the site then
 * quotes the USD total as the amount owed and labels every coin figure as
 * approximate, because locking an indicative number would be theatre. */
const RATE_ENDPOINT = '';
const REFERENCE_RATES = { btc: 96000, sol: 190, eth: 3400 };
const STATE_KEY = 'cp_checkout_v1';

const state = {
  step: 1,
  coin: 'btc',
  rates: { ...REFERENCE_RATES },
  live: false,
  ship: {},
  expires: 0,
  ...readJSON(safeSession, STATE_KEY, {}),
};
const root = $('#checkout-root');

const saveState = () =>
  writeJSON(safeSession, STATE_KEY, {
    step: state.step,
    coin: state.coin,
    ship: state.ship,
    expires: state.expires,
  });

const country = () => state.ship.country || SHIPPING.defaultCountry;
const quoteExpired = () => state.live && state.expires > 0 && Date.now() > state.expires;

async function loadRates() {
  if (!RATE_ENDPOINT) return;
  try {
    const res = await fetch(RATE_ENDPOINT, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    for (const coin of Object.keys(REFERENCE_RATES)) if (Number(data[coin]) > 0) state.rates[coin] = Number(data[coin]);
    state.live = true;
  } catch {
    state.live = false; // Reference rates stay in place, and the copy says so.
  }
}

const coinAmount = (usd, coin) => {
  const dp = coin === 'btc' ? 8 : coin === 'eth' ? 6 : 4;
  return (usd / state.rates[coin]).toFixed(dp);
};

function stepBadges() {
  $$('#steps li').forEach((li) => li.classList.toggle('on', Number(li.dataset.step) <= state.step));
}

function summaryHTML() {
  const { lines, subtotal, saved, shipping, total, count } = cartTotals(country());
  const zone = shippingZone(country());
  return `<aside class="card sticky-summary" aria-label="Order summary">
    <h2>Order summary</h2>
    ${lines
      .map(
        (l) => `<div class="sum-line">
          <div class="thumb" aria-hidden="true">${vialSVG(l.product, l.variant.size)}</div>
          <div><b class="small">${esc(l.product.name)}</b><span class="tiny muted">${esc(l.variant.size)} × ${l.qty}</span></div>
          <span class="small">${money(l.lineTotal)}</span>
        </div>`,
      )
      .join('')}
    <div class="summary-row" style="margin-top:8px"><span>Items (${count})</span><span>${money(subtotal + saved)}</span></div>
    <div class="summary-row ok-text"><span>Site-wide 15% discount</span><span>−${money(saved)}</span></div>
    <div class="summary-row"><span>Shipping — ${esc(zone.label)}</span><span>${shipping ? money(shipping) : 'Free'}</span></div>
    <div class="summary-row total"><span>Total</span><span>${money(total)}</span></div>
    <p class="tiny muted" style="margin-top:10px">
      Priced in USD. ${esc(zone.transit)} once dispatched. The coin figure is worked out from this total.
    </p>
  </aside>`;
}

function renderEmpty() {
  root.innerHTML = `<div class="empty">
    <h2>Nothing to check out</h2>
    <p class="muted">Your cart is empty.</p>
    <a class="btn btn-primary" href="shop.html">Browse the catalogue</a>
  </div>`;
}

function renderDetails() {
  const s = state.ship;
  root.innerHTML = `<div class="checkout-grid">
    <form id="ship-form" novalidate>
      <div class="card">
        <h2>Where should we ship it?</h2>
        <p class="small muted">No account is created. What you enter here stays in this browser until you send it to us.</p>
        <div class="form-field">
          <label class="lbl" for="email">Email (for order correspondence)</label>
          <input class="input" id="email" name="email" type="email" autocomplete="email" value="${esc(s.email || '')}" placeholder="you@example.com" aria-describedby="email-err" />
          <div class="err" id="email-err">Enter a valid email address.</div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="lbl" for="first">First name</label>
            <input class="input" id="first" name="first" autocomplete="given-name" value="${esc(s.first || '')}" aria-describedby="first-err" />
            <div class="err" id="first-err">Required.</div>
          </div>
          <div class="form-field">
            <label class="lbl" for="last">Last name</label>
            <input class="input" id="last" name="last" autocomplete="family-name" value="${esc(s.last || '')}" aria-describedby="last-err" />
            <div class="err" id="last-err">Required.</div>
          </div>
        </div>
        <div class="form-field">
          <label class="lbl" for="address">Street address</label>
          <input class="input" id="address" name="address" autocomplete="street-address" value="${esc(s.address || '')}" aria-describedby="address-err" />
          <div class="err" id="address-err">Required.</div>
        </div>
        <div class="form-field">
          <label class="lbl" for="address2">Apartment, suite, lab number <span class="muted">(optional)</span></label>
          <input class="input" id="address2" name="address2" value="${esc(s.address2 || '')}" />
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="lbl" for="city">City</label>
            <input class="input" id="city" name="city" autocomplete="address-level2" value="${esc(s.city || '')}" aria-describedby="city-err" />
            <div class="err" id="city-err">Required.</div>
          </div>
          <div class="form-field">
            <label class="lbl" for="zip">Postal code</label>
            <input class="input" id="zip" name="zip" autocomplete="postal-code" value="${esc(s.zip || '')}" aria-describedby="zip-err" />
            <div class="err" id="zip-err">Required.</div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="lbl" for="stateProv">State / province <span class="muted">(optional)</span></label>
            <input class="input" id="stateProv" name="stateProv" autocomplete="address-level1" value="${esc(s.stateProv || '')}" />
          </div>
          <div class="form-field">
            <label class="lbl" for="country">Country</label>
            <select class="input" id="country" name="country">
              ${Object.keys(SHIPPING.countries)
                .map((c) => `<option${(s.country || SHIPPING.defaultCountry) === c ? ' selected' : ''}>${esc(c)}</option>`)
                .join('')}
            </select>
            <p class="tiny muted" id="ship-hint"></p>
          </div>
        </div>
        <div class="form-field">
          <label class="lbl" for="notes">Order notes <span class="muted">(optional)</span></label>
          <textarea class="input" id="notes" name="notes" rows="3" placeholder="Delivery instructions, lot preferences…">${esc(s.notes || '')}</textarea>
        </div>
        <label class="check">
          <input type="checkbox" id="agree" ${s.agree ? 'checked' : ''} aria-describedby="agree-err" />
          <span class="small">I confirm I am 21+ and purchasing for laboratory research use only, and I accept the <a href="terms.html">terms of sale</a>.</span>
        </label>
        <div class="err" id="agree-err">Please confirm to continue.</div>
        <button class="btn btn-primary btn-lg btn-block" style="margin-top:12px" type="submit">Continue to payment →</button>
      </div>
    </form>
    ${summaryHTML()}
  </div>`;

  const hint = () => {
    const zone = shippingZone($('#country').value);
    $('#ship-hint').textContent = `${zone.label}: ${money(zone.rate)}${
      zone.freeOver ? `, free over ${money(zone.freeOver)}` : ''
    } · ${zone.transit}`;
  };
  hint();
  $('#country').addEventListener('change', () => {
    state.ship.country = $('#country').value;
    hint();
    // The summary shows the real shipping line for the chosen destination.
    $('.sticky-summary').outerHTML = summaryHTML();
  });

  $('#ship-form').addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    const flag = (el, good) => {
      el.closest('.form-field').classList.toggle('is-invalid', !good);
      el.setAttribute('aria-invalid', String(!good));
      ok = ok && good;
    };

    const email = $('#email');
    flag(email, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim()));
    for (const name of ['first', 'last', 'address', 'city', 'zip']) {
      const field = $(`#${name}`);
      flag(field, field.value.trim().length > 0);
    }
    const agree = $('#agree').checked;
    $('#agree-err').style.display = agree ? 'none' : 'block';
    ok = ok && agree;

    if (!ok) {
      toast('Check the highlighted fields.');
      root.querySelector('.is-invalid .input')?.focus();
      return;
    }

    state.ship = {
      email: email.value.trim(),
      first: $('#first').value.trim(),
      last: $('#last').value.trim(),
      address: $('#address').value.trim(),
      address2: $('#address2').value.trim(),
      city: $('#city').value.trim(),
      zip: $('#zip').value.trim(),
      stateProv: $('#stateProv').value.trim(),
      country: $('#country').value,
      notes: $('#notes').value.trim(),
      agree: true,
    };
    go(2);
  });
}

function renderCoin() {
  const { total } = cartTotals(country());
  root.innerHTML = `<div class="checkout-grid">
    <div class="card">
      <h2>Choose how you want to pay</h2>
      <p class="small muted">Crypto only. No card details are collected anywhere on this site.</p>
      <div class="pay-options" role="group" aria-label="Payment coin">
        ${CRYPTO.map(
          (c) => `<button type="button" class="pay-option" data-coin="${c.id}" aria-pressed="${state.coin === c.id}">
            <span class="coin ${c.id}" aria-hidden="true">${esc(c.symbol)}</span>
            <span class="pay-option-text">
              <b>${esc(c.name)} (${esc(c.symbol)})</b>
              <span class="tiny muted">${esc(c.network)} · confirms in ${esc(c.confirmations)}</span>
            </span>
            <span class="small pay-option-amt">≈ ${coinAmount(total, c.id)} ${esc(c.symbol)}</span>
          </button>`,
        ).join('')}
      </div>
      <p class="tiny muted" style="margin-top:12px">
        ${
          state.live
            ? `Live rate · 1 BTC = ${money(state.rates.btc)} · 1 ETH = ${money(state.rates.eth)} · 1 SOL = ${money(state.rates.sol)}.`
            : `Coin figures are approximate, converted from a reference rate (1 BTC = ${money(state.rates.btc)},
               1 ETH = ${money(state.rates.eth)}, 1 SOL = ${money(state.rates.sol)}). The amount you owe is the
               USD total; we credit the coin value that arrives.`
        }
      </p>
      <div class="btn-row">
        <button class="btn btn-ghost" id="back-1">← Shipping details</button>
        <button class="btn btn-primary btn-lg btn-grow" id="to-3">Get payment address →</button>
      </div>
    </div>
    ${summaryHTML()}
  </div>`;

  $$('.pay-option').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.coin = btn.dataset.coin;
      saveState();
      $$('.pay-option').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    }),
  );
  $('#back-1').addEventListener('click', () => go(1));
  $('#to-3').addEventListener('click', () => {
    state.expires = state.live ? Date.now() + SITE.quoteMinutes * 60000 : 0;
    go(3);
  });
}

function orderId() {
  const d = new Date();
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  // 8 random chars from the CSPRNG: 4 base36 chars collided in practice.
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const rand = [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8).toUpperCase();
  return `CP-${stamp}-${rand}`;
}

function paymentURI(coin, amount) {
  if (coin.id === 'btc') return `bitcoin:${coin.address}?amount=${amount}`;
  // EIP-681 takes wei, not ether, and pins the chain.
  if (coin.id === 'eth') {
    const wei = BigInt(Math.round(Number(amount) * 1e18));
    return `ethereum:${coin.address}@1?value=${wei}`;
  }
  return `solana:${coin.address}?amount=${amount}`;
}

function renderPay() {
  const { total, lines } = cartTotals(country());
  const coin = CRYPTO.find((c) => c.id === state.coin);
  const amount = coinAmount(total, coin.id);
  const uri = paymentURI(coin, amount);
  const id = state.pendingId || (state.pendingId = orderId());
  const mailBody =
    `Order ${id}\n` +
    `Amount: ${money(total)} (sent as ${coin.symbol})\n` +
    `To address: ${coin.address}\n` +
    `Transaction ID: \n\n` +
    lines.map((l) => `${l.qty} × ${l.product.name} ${l.variant.size}`).join('\n');
  const mailto = `mailto:${SITE.email}?subject=${encodeURIComponent(`Payment for order ${id}`)}&body=${encodeURIComponent(mailBody)}`;

  root.innerHTML = `<div class="checkout-grid">
    <div class="card">
      <h2>Pay ${money(total)} in ${esc(coin.symbol)}</h2>
      <p class="small muted">
        Order <b class="mono">${esc(id)}</b> · send to the ${esc(coin.network)} address below.
        ${state.live ? `Quote locked for <b id="timer">${SITE.quoteMinutes}:00</b>.` : ''}
      </p>

      <div class="net-warn"><b>Network: ${esc(coin.network)}.</b> ${esc(coin.note)}</div>

      <div class="qr-box">
        <div class="qr"><img src="${coin.qr}" alt="QR code containing our ${esc(coin.name)} address" width="156" height="156" /></div>
        <div class="qr-side">
          <div class="amount-due" id="amount-due">${amount} <span class="small muted">${esc(coin.symbol)}</span></div>
          <div class="tiny muted" style="margin-bottom:10px">
            ${
              state.live
                ? `= ${money(total)} at ${money(state.rates[coin.id])} per ${esc(coin.symbol)}`
                : `approximate — the amount owed is <b>${money(total)}</b>, converted at a reference rate of
                   ${money(state.rates[coin.id])} per ${esc(coin.symbol)}`
            }
          </div>
          <div class="addr">
            <span id="addr-text" class="mono">${esc(coin.address)}</span>
            <button class="btn btn-sm btn-ghost copy-btn" id="copy-addr" type="button">Copy</button>
          </div>
          <p class="tiny muted" style="margin:8px 0 0">The QR contains the address only — enter the amount in your wallet.</p>
          <div class="btn-row btn-row-tight">
            <a class="btn btn-sm btn-ghost" href="${esc(uri)}">Open in wallet</a>
            <button class="btn btn-sm btn-ghost" id="copy-amount" type="button">Copy amount</button>
          </div>
        </div>
      </div>

      <div class="note" id="quote-note" hidden></div>

      <div class="card-inset">
        <h3>This order only exists in your browser</h3>
        <p class="small muted">
          There is no account and no server holding it. Sending the coin does not tell us who sent it, so email
          us the order number and your transaction ID — that is what ties your payment to your parcel.
        </p>
        <a class="btn btn-primary btn-block" href="${esc(mailto)}">Email us order ${esc(id)} and the transaction ID</a>
      </div>

      <ol class="small muted numbered">
        <li>Send ${state.live ? 'the exact amount' : `the ${money(total)} equivalent`} from any wallet you control.</li>
        <li>Email the order number and transaction ID using the button above.</li>
        <li>We confirm receipt, then dispatch. Shortfalls under ${Math.round(SITE.shortfallTolerance * 100)}% are absorbed.</li>
      </ol>

      <div class="btn-row">
        <button class="btn btn-ghost" id="back-2">← Change coin</button>
        <button class="btn btn-primary btn-lg btn-grow" id="paid">I have sent the payment</button>
      </div>
      <p class="tiny muted" style="margin-top:10px">
        ${lines.length} item${lines.length === 1 ? '' : 's'} · shipping to ${esc(state.ship.city)}, ${esc(state.ship.country)}
      </p>
    </div>
    ${summaryHTML()}
  </div>`;

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied — ${coin.network}`);
    } catch {
      toast('Copy failed — select the text manually');
    }
  };
  $('#copy-addr').addEventListener('click', () => copy(coin.address, 'Address'));
  $('#copy-amount').addEventListener('click', () => copy(amount, 'Amount'));
  $('#back-2').addEventListener('click', () => go(2));

  // Quote countdown. Expiry disables payment rather than leaving a stale
  // figure clickable behind a toast that has already vanished.
  const timer = $('#timer');
  if (timer) {
    const tick = () => {
      const left = state.expires - Date.now();
      if (!document.body.contains(timer)) return clearInterval(handle);
      if (left <= 0) {
        clearInterval(handle);
        timer.textContent = 'expired';
        expire();
        return;
      }
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
    };
    const handle = setInterval(tick, 1000);
    tick(); // paint immediately: the first interval tick is a second late
  }

  function expire() {
    const note = $('#quote-note');
    note.hidden = false;
    note.innerHTML = `<b>Quote expired.</b> The coin amount above is out of date.
      <button class="btn btn-sm btn-ghost" id="requote" type="button">Get a fresh amount</button>`;
    $('#paid').disabled = true;
    $('#requote').addEventListener('click', () => {
      state.expires = Date.now() + SITE.quoteMinutes * 60000;
      render();
    });
  }

  $('#paid').addEventListener('click', () => {
    if (quoteExpired()) return;
    const order = {
      id,
      created: new Date().toISOString(),
      status: 'awaiting-confirmation',
      transmitted: false, // nothing has been sent to us; the UI says so
      coin: coin.id,
      coinSymbol: coin.symbol,
      network: coin.network,
      address: coin.address,
      amount,
      rate: state.rates[coin.id],
      rateLive: state.live,
      usd: total,
      ship: state.ship,
      items: lines.map((l) => ({
        name: l.product.name,
        slug: l.product.slug,
        size: l.variant.size,
        qty: l.qty,
        price: l.variant.price,
      })),
    };
    const stored = saveOrder(order);
    clearCart();
    safeSession.remove(STATE_KEY);
    if (!stored) toast('Storage is blocked — save your order number before leaving this page.');
    location.href = `order.html?id=${encodeURIComponent(order.id)}`;
  });
}

function go(step) {
  state.step = step;
  saveState();
  history.pushState({ step }, '', `#step-${step}`);
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function render() {
  stepBadges();
  if (cartTotals().lines.length === 0) return renderEmpty();
  if (state.step === 1) return renderDetails();
  if (state.step === 2) return renderCoin();
  return renderPay();
}

// Back/Forward moves between steps instead of leaving checkout.
window.addEventListener('popstate', (e) => {
  const step = e.state?.step || Number((location.hash.match(/step-(\d)/) || [])[1]) || 1;
  state.step = Math.min(step, state.ship.agree ? 3 : 1);
  saveState();
  render();
});

// Editing the cart from the drawer invalidates a struck quote.
let firstCartEvent = true;
onCartChange(() => {
  if (firstCartEvent) {
    firstCartEvent = false;
    return;
  }
  if (state.step === 3) {
    state.pendingId = null;
    state.step = 2;
    toast('Cart changed — check your total and get a fresh address.');
  }
  render();
});

if (state.step === 3 && !state.ship.agree) state.step = 1;
render();
loadRates().then(() => {
  if (state.step >= 2) render();
});
