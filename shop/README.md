# CryptoPeptides storefront

A static, dependency-free research-peptide storefront: 59 products, cart, crypto-only checkout,
batch/lab-report registry, and a full set of policy pages. No build step, no framework, no external
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
  product.html?p=…    product detail (variants, specs, batch reports, reviews)
  cart.html           cart
  checkout.html       3-step checkout: address → coin → payment
  order.html?id=…     order confirmation
  track.html          order lookup
  lab-tests.html      batch registry, searchable by batch number
  report.html?b=…     one batch's certificate of analysis
  about / faq / shipping / how-to-pay / contact / terms / privacy
  coa/                signed lab reports (PDF) go here
  assets/
    css/site.css      whole design system, light + dark
    js/catalog.js     products, prices, crypto addresses, site config
    js/lab.js         batch registry and lab-report wiring
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

Exchange rates: `checkout.js` has `RATE_ENDPOINT` (empty by default) and a `FALLBACK_RATES` table.
Point `RATE_ENDPOINT` at your own price proxy returning `{ btc, sol, eth }` in USD, and the quote
switches from "indicative rate" to "live rate" on its own. Until then the checkout says plainly that
the rate is indicative.

Checkout is front-end only: it records the order in `localStorage` and shows the payment address. It
does not watch the chain. Wiring it to a real payment flow means adding a backend that derives a
fresh address per order, watches for the transfer, and moves the order to paid.

## Lab reports

`lab.js` generates one batch record per product (two for bestsellers) so the registry, the search and
the product-page tables are populated. Two ways a batch renders:

1. **A real report exists.** Put the signed PDF in `shop/coa/` and register it:

   ```js
   export const REPORTS = {
     'CP-2508-BPC157-42': 'coa/CP-2508-BPC157-42.pdf',
   };
   ```

   `report.html` then embeds that PDF and offers it for download.

2. **No report yet.** The page renders a certificate *layout* stamped `SPECIMEN — NOT A TEST RESULT`,
   with a banner saying no signed report is attached to the lot. The numbers in it are placeholders
   and are labelled as such.

Only reports issued for your own submitted samples belong in `REPORTS`. A certificate of analysis is
a record of one lab testing one sample for one customer; a report issued to another company describes
their material, not yours, and re-labelling one is forgery rather than a design task. Send samples to
the lab, publish what comes back, and the specimen pages replace themselves.

`LAB` in `lab.js` holds the lab's name, location, methods and verification URL, shown on every report
page so buyers can check a report number with the lab directly.

## Content and compliance

Everything is written as research-use-only: no dosing, no therapeutic claims, an age/research gate on
first visit, and a research-use confirmation required at checkout. `terms.html` and `privacy.html` are
templates — have a lawyer in your jurisdiction review them, and check which compounds you may lawfully
sell and ship, before trading.

## Branding

Site name, tagline, support email and free-shipping threshold live in `SITE` in `catalog.js`. The name
is drawn onto every product vial by `vial.js`, so changing `SITE.name` re-labels the entire product
imagery set on the next page load.
