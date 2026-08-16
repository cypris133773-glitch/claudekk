import { initShell, PRODUCTS, CATEGORIES, productCard, $, $$, esc } from '../app.js';
import { publishedForSlug, batchesForSlug } from '../lab.js';

initShell();

const SORTS = {
  featured: (a, b) =>
    Number(b.badges.includes('bestseller')) - Number(a.badges.includes('bestseller')) ||
    a.name.localeCompare(b.name),
  'price-asc': (a, b) => a.minPrice - b.minPrice,
  'price-desc': (a, b) => b.minPrice - a.minPrice,
  name: (a, b) => a.name.localeCompare(b.name),
  new: (a, b) => Number(b.badges.includes('new')) - Number(a.badges.includes('new')) || a.name.localeCompare(b.name),
};

const PRICE_BANDS = new Set(['all', '0-50', '50-100', '100-200', '200-99999']);
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

// Search should find a compound the way people actually type it.
const ALIASES = {
  reta: 'retatrutide',
  tirz: 'tirzepatide',
  sema: 'semaglutide',
  cagri: 'cagrilintide',
  glp1: 'glp-1',
  bpc: 'bpc-157',
  tb500: 'tb-500',
  ghkcu: 'ghk-cu',
  mk677: 'mk-677',
  ipa: 'ipamorelin',
  nad: 'nad+',
  epi: 'epithalon',
  mt2: 'melanotan',
  pt141: 'pt-141',
};

const params = new URLSearchParams(location.search);
const state = {
  // Unknown values in the URL are dropped rather than echoed back at the user.
  cats: new Set(params.getAll('c').filter((c) => CATEGORY_IDS.has(c))),
  q: params.get('q') || '',
  sort: SORTS[params.get('sort')] ? params.get('sort') : 'featured',
  price: PRICE_BANDS.has(params.get('price')) ? params.get('price') : 'all',
  best: params.get('best') === '1',
  fresh: params.get('new') === '1',
  certified: params.get('cert') === '1',
};

$('#cat-filters').innerHTML = CATEGORIES.map((c) => {
  const n = PRODUCTS.filter((p) => p.category === c.id).length;
  return `<label class="check">
    <input type="checkbox" value="${c.id}"${state.cats.has(c.id) ? ' checked' : ''} />
    <span>${esc(c.name)}</span><span class="n">${n}</span>
  </label>`;
}).join('');

$('#q').value = state.q;
$('#sort').value = state.sort;
$('#f-best').checked = state.best;
$('#f-new').checked = state.fresh;
if ($('#f-cert')) $('#f-cert').checked = state.certified;
$(`input[name="price"][value="${state.price}"]`).checked = true;

if (state.cats.size === 1) {
  const cat = CATEGORIES.find((c) => c.id === [...state.cats][0]);
  if (cat) {
    document.title = `${cat.name} — CryptoPeptides`;
    $('#page-title').textContent = cat.name;
    $('#page-sub').textContent = cat.blurb;
    $('#crumb').textContent = cat.name;
  }
}

function haystack(p) {
  return [p.name, p.aka, p.summary, p.categoryName, p.cas, p.slug, ...(p.research || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function match(p) {
  if (state.cats.size && !state.cats.has(p.category)) return false;
  if (state.best && !p.badges.includes('bestseller')) return false;
  if (state.fresh && !p.badges.includes('new')) return false;
  if (state.certified && publishedForSlug(p.slug).length === 0) return false;
  if (state.price !== 'all') {
    const [lo, hi] = state.price.split('-').map(Number);
    if (p.minPrice < lo || p.minPrice > hi) return false;
  }
  const q = state.q.trim().toLowerCase();
  if (q) {
    const hay = haystack(p);
    const terms = q.split(/\s+/).map((t) => ALIASES[t.replace(/[^a-z0-9+]/g, '')] || t);
    if (!terms.every((term) => hay.includes(term))) return false;
  }
  return true;
}

function syncURL(push = false) {
  const next = new URLSearchParams();
  [...state.cats].forEach((c) => next.append('c', c));
  if (state.q) next.set('q', state.q);
  if (state.sort !== 'featured') next.set('sort', state.sort);
  if (state.price !== 'all') next.set('price', state.price);
  if (state.best) next.set('best', '1');
  if (state.fresh) next.set('new', '1');
  if (state.certified) next.set('cert', '1');
  const qs = next.toString();
  const url = qs ? `?${qs}` : location.pathname;
  // Discrete filter changes get a history entry so Back undoes the filter
  // instead of leaving the shop; typing does not.
  if (push) history.pushState(null, '', url);
  else history.replaceState(null, '', url);
}

function render(push = false) {
  const list = PRODUCTS.filter(match).sort(SORTS[state.sort]);
  const total = PRODUCTS.length;
  $('#count').textContent =
    list.length === total
      ? `${total} products`
      : `${list.length} of ${total} product${total === 1 ? '' : 's'}`;
  $('#grid').innerHTML = list.length
    ? list.map(productCard).join('')
    : `<div class="empty" style="grid-column:1/-1">
         <p><strong>No products match those filters.</strong></p>
         <p class="small muted">Try clearing the search box or widening the price range.</p>
         <button class="btn btn-ghost btn-sm" id="empty-reset">Reset filters</button>
       </div>`;
  $('#empty-reset')?.addEventListener('click', reset);
  syncURL(push);
}

function reset() {
  state.cats.clear();
  state.q = '';
  state.price = 'all';
  state.best = state.fresh = state.certified = false;
  $$('#cat-filters input, #f-best, #f-new, #f-cert').forEach((i) => (i.checked = false));
  $('input[name="price"][value="all"]').checked = true;
  $('#q').value = '';
  render(true);
}

$('#cat-filters').addEventListener('change', (e) => {
  const box = e.target;
  if (box.checked) state.cats.add(box.value);
  else state.cats.delete(box.value);
  render(true);
});
$$('input[name="price"]').forEach((radio) =>
  radio.addEventListener('change', () => {
    state.price = radio.value;
    render(true);
  }),
);
$('#f-best').addEventListener('change', (e) => ((state.best = e.target.checked), render(true)));
$('#f-new').addEventListener('change', (e) => ((state.fresh = e.target.checked), render(true)));
$('#f-cert')?.addEventListener('change', (e) => ((state.certified = e.target.checked), render(true)));
$('#sort').addEventListener('change', (e) => ((state.sort = e.target.value), render(true)));
$('#reset-filters').addEventListener('click', reset);

let debounce;
$('#q').addEventListener('input', (e) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    state.q = e.target.value;
    render();
  }, 160);
});

// Back/Forward re-applies the URL rather than leaving a stale grid on screen.
window.addEventListener('popstate', () => location.reload());

// The "certificates published" filter only makes sense once any exist.
const certified = PRODUCTS.filter((p) => publishedForSlug(p.slug).length).length;
const certRow = $('#f-cert')?.closest('.check');
if (certRow) {
  certRow.hidden = certified === 0;
  certRow.querySelector('.n').textContent = String(certified);
}
const lotted = PRODUCTS.filter((p) => batchesForSlug(p.slug).length).length;
$('#f-lots-note') && ($('#f-lots-note').textContent = `${lotted} products have recorded lots`);

render();
