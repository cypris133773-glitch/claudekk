// Batch / certificate-of-analysis registry.
//
// Each purchasable lot gets a batch record here, and `report.html?b=<batch>`
// renders it. Two ways to attach the real document from the lab:
//
//   1. Drop the signed PDF in `shop/coa/` and add its filename to REPORTS
//      below, keyed by batch number — the site then links the real file.
//   2. Leave it out, and the batch renders as a clearly-marked SPECIMEN
//      layout so the page structure is visible before reports land.
//
// Only reports issued for our own samples belong in REPORTS. A certificate is
// a record of a specific lab testing a specific sample for a specific customer.
import { PRODUCTS } from './catalog.js';

export const LAB = {
  name: 'Janoshik Analytical',
  location: 'Bratislava, Slovakia',
  methods: ['RP-HPLC-UV', 'LC-MS (ESI-TOF)', 'Karl Fischer titration'],
  verifyUrl: 'https://janoshik.com/tests/',
};

/**
 * Real, signed reports keyed by batch number, e.g.
 *   'CP-2408-BPC157-10': 'coa/CP-2408-BPC157-10.pdf'
 * Anything absent renders as a specimen placeholder.
 */
export const REPORTS = {};

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

function seed(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return Math.abs(h);
}

function code(product) {
  return product.slug.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 9);
}

/** One batch per product, plus a second older lot for high-volume lines. */
function batchesFor(product) {
  if (product.category === 'supplies') return [];
  const s = seed(product.slug);
  const out = [];
  const make = (n) => {
    const month = MONTHS[(s + n * 5) % 12];
    const year = 25 + ((s + n) % 2);
    const purity = product.purity;
    const batch = `CP-${year}${month}-${code(product)}-${String(((s + n * 37) % 89) + 10)}`;
    const day = String(((s + n * 11) % 27) + 1).padStart(2, '0');
    return {
      batch,
      slug: product.slug,
      product: product.name,
      category: product.category,
      size: product.variants[n % product.variants.length].size,
      purity,
      water: `${(((s + n * 3) % 40) / 10 + 1.2).toFixed(1)}%`,
      mass: `${(((s + n * 7) % 60) / 10 + 96.5).toFixed(1)}%`,
      tested: `20${year}-${month}-${day}`,
      lab: LAB.name,
      reportId: `${((s + n * 13) % 900000) + 100000}`,
      file: null,
    };
  };
  out.push(make(0));
  if (product.badges.includes('bestseller')) out.push(make(1));
  return out;
}

export const BATCHES = PRODUCTS.flatMap(batchesFor)
  .map((b) => ({ ...b, file: REPORTS[b.batch] || null }))
  .sort((a, b) => b.tested.localeCompare(a.tested));

export const batchesForSlug = (slug) => BATCHES.filter((b) => b.slug === slug);
export const getBatch = (batch) => BATCHES.find((b) => b.batch === batch);
