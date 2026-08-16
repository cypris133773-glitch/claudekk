import { initShell, CATEGORIES, $, esc } from '../app.js';
import { BATCHES, METHODS, publishedCount, LAB_GENERIC } from '../lab.js';

initShell();

const published = publishedCount();

// The page states what is actually on file. With no issued certificates it says
// so plainly rather than dressing the lot list up as results.
const statusEl = $('#lab-status');
if (statusEl) {
  statusEl.innerHTML = published
    ? `<b>${published} issued certificate${published === 1 ? '' : 's'}</b> published against ${BATCHES.length} lots in the registry.`
    : `<b>No issued certificates are published yet.</b> The registry below lists the lots we have filled and
       labelled. A lot's page shows a certificate only once ${esc(LAB_GENERIC)} has issued one for a sample of
       that lot — until then it shows a clearly-marked specimen layout, not a result.`;
}

const methodsEl = $('#lab-methods');
if (methodsEl) methodsEl.textContent = METHODS.join(', ');

$('#bcat')?.insertAdjacentHTML(
  'beforeend',
  CATEGORIES.filter((c) => c.id !== 'supplies')
    .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
    .join(''),
);

const state = { q: '', cat: '', onlyPublished: false };

function render() {
  const q = state.q.trim().toLowerCase();
  const rows = BATCHES.filter(
    (b) =>
      (!state.cat || b.category === state.cat) &&
      (!state.onlyPublished || b.report) &&
      (!q || `${b.batch} ${b.product}`.toLowerCase().includes(q)),
  );

  $('#bcount').textContent = `${rows.length} lot${rows.length === 1 ? '' : 's'}${
    state.onlyPublished ? ' with an issued certificate' : ''
  }`;

  $('#btable').innerHTML = rows.length
    ? rows
        .map(
          (b) => `<tr>
            <td><code class="mono">${esc(b.batch)}</code></td>
            <td><a href="product.html?p=${esc(b.slug)}">${esc(b.product)}</a> <span class="muted">${esc(b.size)}</span></td>
            <td>${esc(b.dated)}</td>
            <td>${
              b.report
                ? `<span class="tag tag-ok">Certificate issued${b.report.tested ? ` ${esc(b.report.tested)}` : ''}</span>`
                : '<span class="tag">Awaiting certificate</span>'
            }</td>
            <td>
              <a href="report.html?b=${encodeURIComponent(b.batch)}">${b.report ? 'View certificate' : 'Lot details'} →</a>
              ${b.file ? ` · <a href="${esc(b.file)}" download>PDF</a>` : ''}
            </td>
          </tr>`,
        )
        .join('')
    : `<tr><td colspan="5" class="muted" style="padding:24px 0">No lots match that search. The lot number is printed on the vial label.</td></tr>`;
}

let debounce;
$('#bq').addEventListener('input', (e) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    state.q = e.target.value;
    render();
  }, 140);
});
$('#bcat').addEventListener('change', (e) => {
  state.cat = e.target.value;
  render();
});
$('#b-published')?.addEventListener('change', (e) => {
  state.onlyPublished = e.target.checked;
  render();
});

render();
