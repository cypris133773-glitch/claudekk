import { initShell, cartTotals, clearCart, money, $, $$, esc, toast, SITE, ORDERS_KEY } from '../app.js';
import { CRYPTO } from '../catalog.js';
import { vialSVG } from '../vial.js';

initShell();

/* Exchange rates.
 *
 * RATE_ENDPOINT should return { btc: <usd>, sol: <usd>, eth: <usd> }. Point it
 * at your own price proxy in production; until then the indicative rates below
 * are used and the quote is labelled as such. */
const RATE_ENDPOINT = '';
const FALLBACK_RATES = { btc: 96000, sol: 190, eth: 3400 };
const QUOTE_MINUTES = 30;

const state = { step: 1, coin: 'btc', rates: { ...FALLBACK_RATES }, live: false, ship: {}, expires: 0 };
const root = $('#checkout-root');

async function loadRates() {
  if (!RATE_ENDPOINT) return;
  try {
    const res = await fetch(RATE_ENDPOINT, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    for (const coin of Object.keys(FALLBACK_RATES)) if (Number(data[coin]) > 0) state.rates[coin] = Number(data[coin]);
    state.live = true;
  } catch {
    state.live = false; // Indicative rates stay in place; the quote says so.
  }
}

const coinAmount = (usd, coin) => {
  const raw = usd / state.rates[coin];
  const dp = coin === 'btc' ? 8 : coin === 'eth' ? 6 : 4;
  return raw.toFixed(dp);
};

function summaryHTML() {
  const { lines, subtotal, saved, shipping, total, count } = cartTotals();
  return `<aside class="card sticky-summary">
    <h3>Order summary</h3>
    ${lines
      .map(
        (l) => `<div style="display:grid;grid-template-columns:44px 1fr auto;gap:10px;padding:8px 0;align-items:center">
          <div class="thumb" style="border-radius:8px;overflow:hidden;border:1px solid var(--line)">${vialSVG(l.product, l.variant.size)}</div>
          <div><b class="small">${esc(l.product.name)}</b><span class="tiny muted" style="display:block">${esc(l.variant.size)} × ${l.qty}</span></div>
          <span class="small">${money(l.lineTotal)}</span>
        </div>`,
      )
      .join('')}
    <div class="summary-row" style="margin-top:8px"><span>Items (${count})</span><span>${money(subtotal)}</span></div>
    <div class="summary-row" style="color:var(--ok)"><span>Site-wide 15% discount</span><span>−${money(saved)}</span></div>
    <div class="summary-row"><span>Shipping</span><span>${shipping ? money(shipping) : 'Free'}</span></div>
    <div class="summary-row total"><span>Total</span><span>${money(total)}</span></div>
    <p class="tiny muted" style="margin-top:10px">Totals are in USD. The coin amount is calculated at the quoted rate when you reach step 3.</p>
  </aside>`;
}

function stepBadges() {
  $$('#steps li').forEach((li) => li.classList.toggle('on', Number(li.dataset.step) <= state.step));
}

function renderEmpty() {
  root.innerHTML = `<div class="empty">
    <h3>Nothing to check out</h3>
    <p class="muted">Your cart is empty.</p>
    <a class="btn btn-primary" href="shop.html">Browse the catalogue</a>
  </div>`;
}

function renderDetails() {
  const s = state.ship;
  root.innerHTML = `<div class="checkout-grid">
    <form id="ship-form" novalidate>
      <div class="card">
        <h3>Where should we ship it?</h3>
        <p class="small muted">We keep order records for 90 days and then delete them. No account is created.</p>
        <div class="form-field">
          <label class="lbl" for="email">Email (order updates and tracking)</label>
          <input class="input" id="email" name="email" type="email" autocomplete="email" value="${esc(s.email || '')}" placeholder="you@example.com" />
          <div class="err">Enter a valid email address.</div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="lbl" for="first">First name</label>
            <input class="input" id="first" name="first" autocomplete="given-name" value="${esc(s.first || '')}" />
            <div class="err">Required.</div>
          </div>
          <div class="form-field">
            <label class="lbl" for="last">Last name</label>
            <input class="input" id="last" name="last" autocomplete="family-name" value="${esc(s.last || '')}" />
            <div class="err">Required.</div>
          </div>
        </div>
        <div class="form-field">
          <label class="lbl" for="address">Street address</label>
          <input class="input" id="address" name="address" autocomplete="street-address" value="${esc(s.address || '')}" />
          <div class="err">Required.</div>
        </div>
        <div class="form-field">
          <label class="lbl" for="address2">Apartment, suite, lab number <span class="muted">(optional)</span></label>
          <input class="input" id="address2" name="address2" value="${esc(s.address2 || '')}" />
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="lbl" for="city">City</label>
            <input class="input" id="city" name="city" autocomplete="address-level2" value="${esc(s.city || '')}" />
            <div class="err">Required.</div>
          </div>
          <div class="form-field">
            <label class="lbl" for="zip">Postal code</label>
            <input class="input" id="zip" name="zip" autocomplete="postal-code" value="${esc(s.zip || '')}" />
            <div class="err">Required.</div>
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
              ${['United States', 'Canada', 'United Kingdom', 'Germany', 'Netherlands', 'France', 'Spain', 'Italy', 'Poland', 'Sweden', 'Australia', 'New Zealand', 'Other']
                .map((c) => `<option${s.country === c ? ' selected' : ''}>${c}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="form-field">
          <label class="lbl" for="notes">Order notes <span class="muted">(optional)</span></label>
          <textarea class="input" id="notes" name="notes" rows="3" placeholder="Delivery instructions, batch preferences…">${esc(s.notes || '')}</textarea>
        </div>
        <label class="check" style="margin-top:6px">
          <input type="checkbox" id="agree" ${s.agree ? 'checked' : ''} />
          <span class="small">I confirm I am 21+ and purchasing for laboratory research use only, and I accept the <a href="terms.html">terms of sale</a>.</span>
        </label>
        <div class="err" id="agree-err" style="margin-bottom:8px">Please confirm to continue.</div>
        <button class="btn btn-primary btn-lg btn-block" style="margin-top:12px" type="submit">Continue to payment →</button>
      </div>
    </form>
    ${summaryHTML()}
  </div>`;

  $('#ship-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const required = ['first', 'last', 'address', 'city', 'zip'];
    let ok = true;

    const email = $('#email');
    const emailOK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());
    email.closest('.form-field').classList.toggle('is-invalid', !emailOK);
    ok = ok && emailOK;

    for (const name of required) {
      const field = $(`#${name}`);
      const good = field.value.trim().length > 0;
      field.closest('.form-field').classList.toggle('is-invalid', !good);
      ok = ok && good;
    }

    const agree = $('#agree').checked;
    $('#agree-err').style.display = agree ? 'none' : 'block';
    ok = ok && agree;

    if (!ok) {
      toast('Check the highlighted fields.');
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
    state.step = 2;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function renderCoin() {
  const { total } = cartTotals();
  root.innerHTML = `<div class="checkout-grid">
    <div class="card">
      <h3>Choose how you want to pay</h3>
      <p class="small muted">Crypto only. Nothing else is accepted, and no card details are ever collected.</p>
      <div class="pay-options" style="margin-top:14px">
        ${CRYPTO.map(
          (c) => `<button type="button" class="pay-option" data-coin="${c.id}" aria-pressed="${state.coin === c.id}">
            <span class="coin ${c.id}">${esc(c.symbol.slice(0, 3))}</span>
            <span style="text-align:left">
              <b>${esc(c.name)} (${esc(c.symbol)})</b>
              <span class="tiny muted" style="display:block">${esc(c.network)} · confirms in ${esc(c.confirmations)}</span>
            </span>
            <span class="small" style="margin-left:auto;font-weight:700">≈ ${coinAmount(total, c.id)} ${esc(c.symbol)}</span>
          </button>`,
        ).join('')}
      </div>
      <p class="tiny muted" style="margin-top:12px">
        ${state.live ? 'Live rate' : 'Indicative rate'} · 1 BTC = ${money(state.rates.btc)} ·
        1 ETH = ${money(state.rates.eth)} · 1 SOL = ${money(state.rates.sol)}.
        The exact amount is locked for ${QUOTE_MINUTES} minutes on the next step.
      </p>
      <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
        <button class="btn btn-ghost" id="back-1">← Shipping details</button>
        <button class="btn btn-primary btn-lg" id="to-3" style="flex:1;min-width:200px">Get payment address →</button>
      </div>
    </div>
    ${summaryHTML()}
  </div>`;

  $$('.pay-option').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.coin = btn.dataset.coin;
      $$('.pay-option').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    }),
  );
  $('#back-1').addEventListener('click', () => ((state.step = 1), render()));
  $('#to-3').addEventListener('click', () => {
    state.expires = Date.now() + QUOTE_MINUTES * 60000;
    state.step = 3;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function orderId() {
  const d = new Date();
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CP-${stamp}-${rand}`;
}

function renderPay() {
  const { total, lines } = cartTotals();
  const coin = CRYPTO.find((c) => c.id === state.coin);
  const amount = coinAmount(total, coin.id);
  const uri =
    coin.id === 'btc'
      ? `bitcoin:${coin.address}?amount=${amount}`
      : coin.id === 'eth'
        ? `ethereum:${coin.address}?value=${amount}`
        : `solana:${coin.address}?amount=${amount}`;

  root.innerHTML = `<div class="checkout-grid">
    <div class="card">
      <h3>Send exactly ${amount} ${esc(coin.symbol)}</h3>
      <p class="small muted">${esc(coin.network)} · quote locked for <b id="timer">${QUOTE_MINUTES}:00</b></p>

      <div class="qr-box" style="margin-top:14px">
        <div class="qr"><img src="${coin.qr}" alt="${esc(coin.name)} address QR code" width="156" height="156" /></div>
        <div style="width:100%">
          <div class="amount-due">${amount} <span class="small muted">${esc(coin.symbol)}</span></div>
          <div class="tiny muted" style="margin-bottom:10px">= ${money(total)} at ${state.live ? 'the live' : 'the indicative'} rate of ${money(state.rates[coin.id])} per ${esc(coin.symbol)}</div>
          <div class="addr">
            <span id="addr-text">${esc(coin.address)}</span>
            <button class="btn btn-sm btn-ghost copy-btn" id="copy-addr" type="button">Copy</button>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            <a class="btn btn-sm btn-ghost" href="${esc(uri)}">Open in wallet</a>
            <button class="btn btn-sm btn-ghost" id="copy-amount" type="button">Copy amount</button>
          </div>
        </div>
      </div>

      <div class="note" style="margin-top:16px">${esc(coin.note)} Send the full amount in one transaction — partial or
      batched payments delay the order until we reconcile them manually.</div>

      <ol class="small muted" style="margin-top:16px;padding-left:18px">
        <li>Send the exact amount above from any wallet you control.</li>
        <li>Press <b>I have sent the payment</b> so we can match your transfer to this order.</li>
        <li>Email your transaction ID to <a href="mailto:${esc(SITE.email)}">${esc(SITE.email)}</a> if you want a manual check.</li>
        <li>We dispatch on ${esc(coin.confirmations)} and email tracking the same day.</li>
      </ol>

      <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
        <button class="btn btn-ghost" id="back-2">← Change coin</button>
        <button class="btn btn-primary btn-lg" id="paid" style="flex:1;min-width:220px">I have sent the payment</button>
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
      toast(`${label} copied`);
    } catch {
      toast('Copy failed — select the text manually');
    }
  };
  $('#copy-addr').addEventListener('click', () => copy(coin.address, 'Address'));
  $('#copy-amount').addEventListener('click', () => copy(amount, 'Amount'));
  $('#back-2').addEventListener('click', () => ((state.step = 2), render()));

  // Quote countdown; expiry re-quotes rather than silently drifting.
  const timer = $('#timer');
  const tick = setInterval(() => {
    const left = state.expires - Date.now();
    if (!document.body.contains(timer)) return clearInterval(tick);
    if (left <= 0) {
      clearInterval(tick);
      timer.textContent = 'expired';
      toast('Quote expired — refreshing the amount', 'Re-quote', () => {
        state.expires = Date.now() + QUOTE_MINUTES * 60000;
        render();
      });
      return;
    }
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }, 1000);

  $('#paid').addEventListener('click', () => {
    const order = {
      id: orderId(),
      created: new Date().toISOString(),
      status: 'awaiting-confirmation',
      coin: coin.id,
      coinSymbol: coin.symbol,
      address: coin.address,
      amount,
      rate: state.rates[coin.id],
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
    const all = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    all.unshift(order);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(all.slice(0, 30)));
    clearCart();
    location.href = `order.html?id=${encodeURIComponent(order.id)}`;
  });
}

function render() {
  stepBadges();
  if (cartTotals().lines.length === 0) return renderEmpty();
  if (state.step === 1) return renderDetails();
  if (state.step === 2) return renderCoin();
  return renderPay();
}

render();
loadRates().then(() => {
  if (state.step === 2) render();
});
