import { initShell, $, esc, SITE } from '../app.js';
import { getBatch, LAB } from '../lab.js';
import { getProduct } from '../catalog.js';

initShell();

const batch = getBatch(new URLSearchParams(location.search).get('b') || '');
const root = $('#report-root');

if (!batch) {
  root.innerHTML = `<div class="empty">
    <h1>Batch not found</h1>
    <p class="muted">Check the number printed on the vial label, or search the full list.</p>
    <a class="btn btn-primary" href="lab-tests.html">All batch reports</a>
  </div>`;
} else {
  const product = getProduct(batch.slug);
  document.title = `${batch.batch} — Batch Report — CryptoPeptides`;

  // A signed report is shown as the document itself; anything without one is
  // rendered as an obvious specimen so nobody mistakes the layout for a result.
  const body = batch.file
    ? `<div class="card">
         <h3>Signed report</h3>
         <p class="small muted">Issued by ${esc(LAB.name)} for this lot.</p>
         <object data="${esc(batch.file)}" type="application/pdf" width="100%" height="760">
           <p class="small">Your browser cannot display the PDF inline.</p>
         </object>
         <a class="btn btn-primary" style="margin-top:12px" href="${esc(batch.file)}" download>Download PDF</a>
       </div>`
    : specimenHTML();

  root.innerHTML = `
    <nav class="tiny muted no-print" style="margin-bottom:14px">
      <a href="index.html">Home</a> / <a href="lab-tests.html">Lab tests</a> / <span>${esc(batch.batch)}</span>
    </nav>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:18px">
      <div>
        <h1 style="margin-bottom:4px">${esc(batch.product)}</h1>
        <p class="muted" style="margin:0">Batch <code>${esc(batch.batch)}</code> · ${esc(batch.size)} · tested ${esc(batch.tested)}</p>
      </div>
      <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="window.print()">Print / save PDF</button>
        <a class="btn btn-primary btn-sm" href="product.html?p=${esc(batch.slug)}">View product</a>
      </div>
    </div>
    ${body}
    <div class="card no-print" style="margin-top:18px">
      <h3>Verifying this independently</h3>
      <p class="small muted" style="margin:0">
        Reports for our lots are issued by ${esc(LAB.name)} (${esc(LAB.location)}) and carry the laboratory's own
        report number. Check that number with the lab directly rather than relying on a copy hosted here —
        <a href="${esc(LAB.verifyUrl)}" target="_blank" rel="noopener">${esc(LAB.verifyUrl)}</a>.
        Questions about a specific lot go to <a href="mailto:${esc(SITE.email)}">${esc(SITE.email)}</a>.
      </p>
    </div>`;

  function specimenHTML() {
    return `
    <div class="specimen-banner no-print">
      <b>Specimen layout — no signed report is attached to this lot yet.</b><br />
      The figures below are placeholders showing where each result appears. The real certificate for this batch
      is issued by ${esc(LAB.name)} against our own submitted sample; once it is filed in
      <code>shop/coa/</code> and registered in <code>assets/js/lab.js</code>, it replaces this page.
    </div>
    <div class="coa">
      <div class="specimen-mark"><span>SPECIMEN — NOT A TEST RESULT</span></div>
      <div class="coa-head">
        <div>
          <h2>Certificate of Analysis</h2>
          <div class="small" style="color:#475569">Layout preview · not issued by any laboratory</div>
        </div>
        <div class="small" style="text-align:right;color:#475569">
          <div><b>${esc(SITE.name)}</b></div>
          <div>Batch ${esc(batch.batch)}</div>
          <div>Sample submitted ${esc(batch.tested)}</div>
        </div>
      </div>
      <table>
        <tbody>
          <tr><th>Product</th><td>${esc(batch.product)}${product ? ` (${esc(product.categoryName)})` : ''}</td></tr>
          <tr><th>Presentation</th><td>${esc(batch.size)} lyophilised powder, sealed vial</td></tr>
          ${product?.cas ? `<tr><th>CAS number</th><td>${esc(product.cas)}</td></tr>` : ''}
          <tr><th>Appearance</th><td>White to off-white lyophilised cake</td></tr>
          <tr><th>Purity (RP-HPLC-UV, 214 nm)</th><td><span class="pass">${esc(batch.purity)}</span> <span style="color:#94a3b8">— placeholder</span></td></tr>
          <tr><th>Identity (LC-MS)</th><td>Observed mass consistent with theoretical <span style="color:#94a3b8">— placeholder</span></td></tr>
          <tr><th>Net peptide content</th><td>${esc(batch.mass)} <span style="color:#94a3b8">— placeholder</span></td></tr>
          <tr><th>Water content (Karl Fischer)</th><td>${esc(batch.water)} <span style="color:#94a3b8">— placeholder</span></td></tr>
          <tr><th>Analysing laboratory</th><td>To be completed on issue — ${esc(LAB.name)}</td></tr>
          <tr><th>Laboratory report number</th><td>Assigned by the lab on issue</td></tr>
        </tbody>
      </table>
      <p class="small" style="color:#475569;margin-top:16px">
        Research use only. Not for human or veterinary consumption. A certificate of analysis describes the sample
        submitted for testing and is valid only for the lot named on it.
      </p>
    </div>`;
  }
}
