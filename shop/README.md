# CryptoPeptides storefront

A static, dependency-free research-peptide storefront: 59 products, cart, crypto-only checkout,
a lot registry with certificate publishing, and a full set of policy pages. No build step, no framework, no external
network requests at runtime — every image is generated SVG and every script is a local ES module.

## Running it

```bash
npm start            # from the repo root, then open http://localhost:8080/shop/
```

ES modules need to be served over HTTP; opening `index.html` from the filesystem will not work.

## Layout

```
shop/
  index.html          home
  shop.html           catalogue with filters, search and sort
  product.html?p=…    product detail (variants, specs, lots and certificates)
  cart.html           cart
  checkout.html       3-step checkout: address → coin → payment
  order.html?id=…     order confirmation
  track.html          order lookup
  lab-tests.html      lot registry, searchable by lot number
  report.html?b=…     one lot's record and its certificate, once issued
  about / faq / shipping / how-to-pay / contact / terms / privacy
  coa/                signed lab reports (PDF) go here
  assets/
    css/site.css      whole design system, light + dark
    js/catalog.js     products, prices, crypto addresses, site config
    js/lab.js         lot registry and certificate wiring
    js/storage.js     storage that degrades to memory instead of throwing
    js/vial.js        generated product imagery
    js/app.js         header, footer, cart, drawer, toasts, age gate
    js/pages/*.js     one module per page
    img/              favicon and the three payment QR codes
```

## Pricing

`catalog.js` holds a `msrp` per variant and one constant:

```js
export const DISCOUNT = 0.15;
```

Every displayed price is `msrp × 0.85`, computed in `salePrice()`. The list price is shown struck
through beside it. Change the constant and the whole store, including the announcement bar and the
badges, follows — there is no second place where a price is written down.

## Payments

Crypto only. The three receiving addresses live in `CRYPTO` in `catalog.js`, and the QR codes in
`assets/img/qr-*.svg` encode `bitcoin:`, `solana:` and `ethereum:` URIs for those same addresses.
**If you ever change an address, regenerate the matching QR** — the code is the thing people scan,
so a stale one sends funds to the wrong place.

Exchange rates: `checkout.js` has `RATE_ENDPOINT` (empty by default) and a `REFERENCE_RATES` table.
Point `RATE_ENDPOINT` at your own price proxy returning `{ btc, sol, eth }` in USD and the checkout
starts quoting a live rate, locking it for 30 minutes with a countdown that disables payment when it
runs out. Until then no coin figure is presented as exact: the USD total is the obligation and the
coin amount is labelled approximate, because locking an indicative number is theatre.

Checkout is front-end only, and the UI says so rather than implying otherwise: the order is written to
`localStorage`, nothing is transmitted, and the confirmation page's primary action is a prefilled email
carrying the order number and transaction ID — which is genuinely how a payment would be matched when
every buyer sees the same static address. Wiring it to a real payment flow means a backend that derives
a fresh address per order, watches for the transfer and moves the order to paid; at that point the
email step and the "only exists in your browser" copy come out.

Storage goes through `storage.js`, which falls back to memory when `localStorage` throws (Safari
lockdown, embedded webviews, blocked cookies) or holds corrupt JSON, so a broken key degrades instead
of taking the page down.

## Lots and lab reports

`lab.js` keeps two things apart that storefronts in this category routinely blur:

- A **lot number** is something you can assert — it is printed on the vial and identifies material you
  filled. `lab.js` generates one lot per product (two for high-volume lines), always dated in the past.
- A **test result** exists only when a laboratory has issued a certificate for a sample you sent.

Everything the site says about testing is derived from `REPORTS`, so the copy is true before and after
real certificates arrive. `publishedCount()` drives the announcement bar, the footer, the home stat
band, the product-page counter and the registry filter; nothing states a number of published reports
that does not match the number of files on disk.

To publish a certificate, drop the signed PDF in `shop/coa/` and register it:

```js
export const REPORTS = {
  'CP-2508-BPC157-42': {
    file: 'coa/CP-2508-BPC157-42.pdf',
    lab: 'Name of the laboratory that signed it',
    location: 'City, Country',
    verifyUrl: 'https://…/report-lookup',
    reportId: '123456',
    tested: '2026-05-14',
    purity: '99.4%',
  },
};
```

`report.html` then serves that PDF, and the lot's purity and test date come off the certificate rather
than out of the catalogue. A lot with no certificate renders a layout stamped
`SPECIMEN — NOT A TEST RESULT` whose measurement rows are empty — no plausible-looking numbers.

A laboratory is named only against a lot that has a certificate. Everywhere else the site says
"an independent analytical laboratory" (`LAB_GENERIC`). Naming a lab that has not seen your material —
or re-labelling a certificate issued to another company — is forgery, not a content task: it tells a
buyer material was tested when it was not. Send samples, publish what comes back, and the specimen
pages replace themselves.

## Verifying a change

The review harness lives outside the repo (it needs Playwright), but three checks are worth running
against any change:

- **Invariants** — every price equals `msrp × 0.85`, no price inversion within a presentation, unique
  slugs/variant ids/lot numbers, no future-dated lot, no purity or test date without a certificate,
  and shipping that matches the table on `shipping.html`.
- **Console/network** — every page loads with no console, page or request errors.
- **Layout** — no horizontal overflow at 390/640/860/1024/1440 in both themes, and every text token
  at or above 4.5:1 contrast.

## Content and compliance

Everything is written as research-use-only: no dosing, no therapeutic claims, an age/research gate on
first visit, and a research-use confirmation required at checkout. `terms.html` and `privacy.html` are
templates — have a lawyer in your jurisdiction review them, and check which compounds you may lawfully
sell and ship, before trading.

## Branding

Site name, tagline, support email and free-shipping threshold live in `SITE` in `catalog.js`. The name
is drawn onto every product vial by `vial.js`, so changing `SITE.name` re-labels the entire product
imagery set on the next page load.
