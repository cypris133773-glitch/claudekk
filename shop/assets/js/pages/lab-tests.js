import { initShell, CATEGORIES, $, esc } from '../app.js';
import { BATCHES, LAB } from '../lab.js';

initShell();

$('#lab-name').textContent = LAB.name;
$('#verify-link').href = LAB.verifyUrl;

$('#bcat').insertAdjacentHTML(
  'beforeend',
  CATEGORIES.filter((c) => c.id !== 'supplies')
    .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
    .join(''),
);

const state = { q: '', cat: '' };

function render() {
  const q = state.q.trim().toLowerCase();
  const rows = BATCHES.filter(
    (b) =>
      (!state.cat || b.category === state.cat) &&
      (!q || `${b.batch} ${b.product}`.toLowerCase().includes(q)),
  );

  $('#bcount').textContent = `${rows.length} published lot${rows.length === 1 ? '' : 's'}`;
  $('#btable').innerHTML = rows.length
    ? rows
        .map(
          (b) => `<tr>
            <td><code>${esc(b.batch)}</code></td>
            <td><a href="product.html?p=${esc(b.slug)}">${esc(b.product)}</a> <span class="muted">${esc(b.size)}</span></td>
            <td>${esc(b.tested)}</td>
            <td style="color:var(--ok);font-weight:700">${esc(b.purity)}</td>
            <td>
              <a href="report.html?b=${encodeURIComponent(b.batch)}">View →</a>
              ${b.file ? ` · <a href="${esc(b.file)}" download>PDF</a>` : ''}
            </td>
          </tr>`,
        )
        .join('')
    : `<tr><td colspan="5" class="muted" style="padding:24px 0">No lots match that search. Batch numbers are printed on the vial label.</td></tr>`;
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

render();
