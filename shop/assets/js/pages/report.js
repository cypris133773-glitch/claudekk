import { initShell, $, esc, SITE } from '../app.js';
import { getBatch, LAB_GENERIC, METHODS } from '../lab.js';
import { getProduct } from '../catalog.js';

initShell();

const batch = getBatch(new URLSearchParams(location.search).get('b') || '');
const root = $('#report-root');

if (!batch) {
  root.innerHTML = `<div class="empty">
    <h1>Lot not found</h1>
    <p class="muted">Check the number printed on the vial label, or search the full registry.</p>
    <a class="btn btn-primary" href="lab-tests.html">All lots</a>
  </div>`;
} else {
  const product = getProduct(batch.slug);
  const report = batch.report;
  document.title = `${batch.batch} — Lot record — CryptoPeptides`;

  root.innerHTML = `
    <nav class="tiny muted no-print" style="margin-bottom:14px">
      <a href="index.html">Home</a> / <a href="lab-tests.html">Lab tests</a> / <span>${esc(batch.batch)}</span>
    </nav>
    <div class="page-head">
      <div>
        <h1>${esc(batch.product)}</h1>
        <p class="muted" style="margin:0">
          Lot <code class="mono">${esc(batch.batch)}</code> · ${esc(batch.size)} · filled ${esc(batch.dated)}
        </p>
      </div>
      <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" id="print-btn">Print / save PDF</button>
        <a class="btn btn-primary btn-sm" href="product.html?p=${esc(batch.slug)}">View product</a>
      </div>
    </div>
    ${report ? issued(report) : specimen()}
    <div class="card no-print" style="margin-top:18px">
      <h2>Verifying a certificate independently</h2>
      <p class="small muted" style="margin:0">
        A certificate is only meaningful if the laboratory that signed it issued it for the sample it names.
        Every certificate we publish carries the issuing laboratory's own report number so you can check it with
        them directly rather than relying on a copy hosted here${
          report?.verifyUrl
            ? ` — <a href="${esc(report.verifyUrl)}" target="_blank" rel="noopener">${esc(report.verifyUrl)}</a>`
            : ''
        }.
        Questions about a specific lot go to <a href="mailto:${esc(SITE.email)}">${esc(SITE.email)}</a>.
      </p>
    </div>`;

  $('#print-btn')?.addEventListener('click', () => window.print());

  function issued(r) {
    return `<div class="card">
      <h2>Certificate of analysis</h2>
      <p class="small muted">
        Issued${r.lab ? ` by ${esc(r.lab)}` : ''}${r.location ? `, ${esc(r.location)}` : ''}
        ${r.reportId ? ` · report ${esc(r.reportId)}` : ''}${r.tested ? ` · sample tested ${esc(r.tested)}` : ''}.
      </p>
      <object data="${esc(r.file)}" type="application/pdf" width="100%" height="760">
        <p class="small">Your browser cannot display the PDF inline.</p>
      </object>
      <a class="btn btn-primary" style="margin-top:12px" href="${esc(r.file)}" download>Download the certificate</a>
    </div>`;
  }

  function specimen() {
    return `
    <div class="specimen-banner no-print">
      <b>No certificate has been issued for this lot.</b>
      Nothing below is a test result — it is the layout a certificate occupies, shown so you can see what is
      published once ${esc(LAB_GENERIC)} has analysed a sample of this lot. Every field that would carry a
      measurement is empty.
    </div>
    <div class="coa">
      <div class="specimen-mark" aria-hidden="true"><span>SPECIMEN — NOT A TEST RESULT</span></div>
      <div class="coa-head">
        <div>
          <h2>Certificate of Analysis</h2>
          <div class="small coa-sub">Layout preview · not issued by any laboratory</div>
        </div>
        <div class="small coa-sub" style="text-align:right">
          <div><b>${esc(SITE.name)}</b></div>
          <div>Lot ${esc(batch.batch)}</div>
          <div>Filled ${esc(batch.dated)}</div>
        </div>
      </div>
      <table>
        <tbody>
          <tr><th>Product</th><td>${esc(batch.product)}${product ? ` (${esc(product.categoryName)})` : ''}</td></tr>
          <tr><th>Presentation</th><td>${esc(batch.size)}${product?.category === 'supplies' ? '' : ' lyophilised powder, sealed vial'}</td></tr>
          ${product?.cas ? `<tr><th>CAS number</th><td>${esc(product.cas)}</td></tr>` : ''}
          <tr><th>Purity (RP-HPLC-UV, 214 nm)</th><td class="coa-empty">— awaiting certificate —</td></tr>
          <tr><th>Identity (LC-MS)</th><td class="coa-empty">— awaiting certificate —</td></tr>
          <tr><th>Net peptide content</th><td class="coa-empty">— awaiting certificate —</td></tr>
          <tr><th>Water content (Karl Fischer)</th><td class="coa-empty">— awaiting certificate —</td></tr>
          <tr><th>Analyses requested</th><td>${METHODS.map(esc).join(', ')}</td></tr>
          <tr><th>Analysing laboratory</th><td class="coa-empty">— named on the certificate when issued —</td></tr>
          <tr><th>Laboratory report number</th><td class="coa-empty">— assigned by the laboratory —</td></tr>
        </tbody>
      </table>
      <p class="small coa-sub" style="margin-top:16px">
        Research use only. Not for human or veterinary consumption. A certificate of analysis describes the
        sample submitted for testing and is valid only for the lot named on it.
      </p>
    </div>`;
  }
}
