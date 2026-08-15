import { initShell, PRODUCTS, CATEGORIES, productCard, $, $$, esc } from '../app.js';
import { batchesForSlug } from '../lab.js';

initShell();

const params = new URLSearchParams(location.search);
const state = {
  cats: new Set(params.getAll('c').filter(Boolean)),
  q: params.get('q') || '',
  sort: params.get('sort') || 'featured',
  price: 'all',
  best: false,
  fresh: false,
  tested: false,
};

// Category checkboxes, with the count of products in each.
$('#cat-filters').innerHTML = CATEGORIES.map((c) => {
  const n = PRODUCTS.filter((p) => p.category === c.id).length;
  return `<label class="check">
    <input type="checkbox" value="${c.id}"${state.cats.has(c.id) ? ' checked' : ''} />
    <span>${esc(c.name)}</span><span class="n">${n}</span>
  </label>`;
}).join('');

$('#q').value = state.q;
$('#sort').value = state.sort;

if (state.cats.size === 1) {
  const cat = CATEGORIES.find((c) => c.id === [...state.cats][0]);
  if (cat) {
    document.title = `${cat.name} — CryptoPeptides`;
    $('#page-title').textContent = cat.name;
    $('#page-sub').textContent = cat.blurb;
    $('#crumb').textContent = cat.name;
  }
}

function match(p) {
  if (state.cats.size && !state.cats.has(p.category)) return false;
  if (state.best && !p.badges.includes('bestseller')) return false;
  if (state.fresh && !p.badges.includes('new')) return false;
  if (state.tested && batchesForSlug(p.slug).length === 0) return false;
  if (state.price !== 'all') {
    const [lo, hi] = state.price.split('-').map(Number);
    if (p.minPrice < lo || p.minPrice > hi) return false;
  }
  const q = state.q.trim().toLowerCase();
  if (q) {
    const hay = [p.name, p.aka, p.summary, p.categoryName, p.cas, ...(p.research || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!q.split(/\s+/).every((term) => hay.includes(term))) return false;
  }
  return true;
}

const SORTS = {
  featured: (a, b) =>
    Number(b.badges.includes('bestseller')) - Number(a.badges.includes('bestseller')) ||
    b.reviews - a.reviews,
  'price-asc': (a, b) => a.minPrice - b.minPrice,
  'price-desc': (a, b) => b.minPrice - a.minPrice,
  name: (a, b) => a.name.localeCompare(b.name),
  rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
  new: (a, b) => Number(b.badges.includes('new')) - Number(a.badges.includes('new')),
};

function syncURL() {
  const next = new URLSearchParams();
  [...state.cats].forEach((c) => next.append('c', c));
  if (state.q) next.set('q', state.q);
  if (state.sort !== 'featured') next.set('sort', state.sort);
  const qs = next.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function render() {
  const list = PRODUCTS.filter(match).sort(SORTS[state.sort] || SORTS.featured);
  $('#count').textContent = `${list.length} product${list.length === 1 ? '' : 's'}`;
  $('#grid').innerHTML = list.length
    ? list.map(productCard).join('')
    : `<div class="empty" style="grid-column:1/-1">
         <p><strong>No products match those filters.</strong></p>
         <p class="small muted">Try clearing the search box or widening the price range.</p>
       </div>`;
  syncURL();
}

$('#cat-filters').addEventListener('change', (e) => {
  const box = e.target;
  if (box.checked) state.cats.add(box.value);
  else state.cats.delete(box.value);
  render();
});
$$('input[name="price"]').forEach((radio) =>
  radio.addEventListener('change', () => {
    state.price = radio.value;
    render();
  }),
);
$('#f-best').addEventListener('change', (e) => ((state.best = e.target.checked), render()));
$('#f-new').addEventListener('change', (e) => ((state.fresh = e.target.checked), render()));
$('#f-tested').addEventListener('change', (e) => ((state.tested = e.target.checked), render()));
$('#sort').addEventListener('change', (e) => ((state.sort = e.target.value), render()));

let debounce;
$('#q').addEventListener('input', (e) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    state.q = e.target.value;
    render();
  }, 160);
});

$('#reset-filters').addEventListener('click', () => {
  state.cats.clear();
  state.q = '';
  state.price = 'all';
  state.best = state.fresh = state.tested = false;
  $$('#cat-filters input, #f-best, #f-new, #f-tested').forEach((i) => (i.checked = false));
  $('input[name="price"][value="all"]').checked = true;
  $('#q').value = '';
  render();
});

// On narrow screens the filter column collapses behind a toggle.
const toggle = $('#filter-toggle');
const mq = window.matchMedia('(max-width: 1024px)');
const applyMQ = () => {
  toggle.style.display = mq.matches ? 'block' : 'none';
  $('#filters-panel').classList.toggle('is-open', !mq.matches);
};
mq.addEventListener('change', applyMQ);
applyMQ();
toggle.addEventListener('click', () => $('#filters-panel').classList.toggle('is-open'));

render();
