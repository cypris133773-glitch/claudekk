// Product imagery is drawn, not photographed: every product gets a vector vial
// carrying our own label, so the catalogue stays consistent and ships with no
// external image requests.
//
// Theme-dependent colours come from CSS custom properties (`--vial-*`, declared
// in site.css) with literal fallbacks, so the same markup renders correctly in
// light and dark and still works when serialised to a data URI.
import { SITE } from './catalog.js';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Deterministic hash so a product always renders the same way.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// Gradient ids must be unique per *render*, not per product: the same product
// can appear twice on one page (hero pick + bestseller grid).
let renderSeq = 0;

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (x) => Math.max(0, Math.min(255, Math.round(x)));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const MAX_LINE = 15;

function fitLabel(name) {
  // Long compound names wrap onto a second label line. Anything that still does
  // not fit is ellipsed, so the truncation reads as deliberate rather than lost.
  const words = name.split(' ');
  if (name.length <= MAX_LINE || words.length === 1) return [name];
  const lines = [''];
  for (const word of words) {
    const line = lines[lines.length - 1];
    if ((line + ' ' + word).trim().length > MAX_LINE && line) lines.push(word);
    else lines[lines.length - 1] = (line + ' ' + word).trim();
  }
  if (lines.length > 2) return [lines[0], lines[1] + '…'];
  return lines;
}

/** Width-constrained text: only squeezes when the string would overrun. */
function text(x, y, str, { size, weight = 400, fill, avail, spacing, anchor }) {
  const est = str.length * size * 0.56;
  const fit = avail && est > avail ? ` textLength="${avail}" lengthAdjust="spacingAndGlyphs"` : '';
  const ls = spacing ? ` letter-spacing="${spacing}"` : '';
  const an = anchor ? ` text-anchor="${anchor}"` : '';
  return `<text class="vial-text" x="${x}" y="${y}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}"${ls}${an}${fit}>${esc(str)}</text>`;
}

/**
 * The label block, drawn once at a fixed 60×60 and reused at scale by both the
 * vial and the carton so the set reads as one system.
 */
function labelBlock(accent, lines, sub) {
  const W = 60;
  const H = 60;
  const pad = 5;
  const avail = W - pad * 2;
  const nameSize = lines.some((l) => l.length > 11) ? 6.6 : 7.6;
  const nameTop = 24;
  const step = nameSize + 2.2;
  const sizeY = nameTop + (lines.length - 1) * step + step + 0.5;

  return `<g>
    <rect width="${W}" height="${H}" rx="3" fill="var(--vial-label,#ffffff)" fill-opacity="var(--vial-label-op,.98)" stroke="var(--vial-stroke,rgba(15,23,42,.18))" stroke-width=".6"/>
    <rect width="${W}" height="3.4" fill="${accent}"/>
    <rect y="${H - 7}" width="${W}" height="7" fill="${accent}"/>
    ${text(pad, 15, SITE.name.toUpperCase(), { size: 5.4, weight: 700, fill: accent, spacing: '.18', avail })}
    ${lines
      .map((line, i) =>
        text(pad, nameTop + i * step, line, {
          size: nameSize,
          weight: 700,
          fill: 'var(--vial-label-ink,#0f172a)',
          avail,
        }),
      )
      .join('')}
    ${text(pad, sizeY, sub, { size: 6.6, weight: 600, fill: 'var(--vial-label-sub,#475569)', avail })}
    ${text(pad, sizeY + 7, 'LYOPHILISED', { size: 4.8, weight: 500, fill: 'var(--vial-label-fine,#64748b)', spacing: '.14', avail })}
    ${text(W / 2, H - 2.2, 'RESEARCH USE ONLY', { size: 4.4, weight: 700, fill: '#ffffff', spacing: '.12', anchor: 'middle', avail: W - 4 })}
  </g>`;
}

/**
 * SVG markup for a product vial.
 * @param {object} product catalogue entry
 * @param {string} [size]   variant size printed on the label
 * @param {object} [opts]   `{ compact: true }` drops the label text for thumbnails
 */
export function vialSVG(product, size, opts = {}) {
  const accent = product.accent || '#7c5cff';
  const seed = hash(product.slug);
  const uid = `v${seed.toString(36)}${(renderSeq++).toString(36)}`;
  const isBox = product.category === 'supplies' || product.form === 'capsules' || product.form === 'oral';
  const lines = fitLabel(product.name.replace(/\s*\(.*\)$/, ''));
  const sub = size ? String(size) : String(product.variants[0].size);
  const label = opts.compact ? '' : labelBlock(accent, lines, sub);
  const compactBand = opts.compact ? `<rect x="6" y="76" width="60" height="18" rx="3" fill="${accent}" opacity=".85"/>` : '';

  const defs = `
    <defs>
      <radialGradient id="${uid}g" cx=".36" cy=".26" r=".92">
        <stop offset="0" stop-color="${accent}" stop-opacity=".26"/>
        <stop offset="1" stop-color="${accent}" stop-opacity=".07"/>
      </radialGradient>
      <linearGradient id="${uid}glass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="var(--vial-glass-a,#ffffff)"/>
        <stop offset=".34" stop-color="var(--vial-glass-b,#eef3fa)"/>
        <stop offset=".64" stop-color="var(--vial-glass-c,#ffffff)"/>
        <stop offset="1" stop-color="var(--vial-glass-d,#d3dcec)"/>
      </linearGradient>
      <linearGradient id="${uid}cap" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#8d97a8"/>
        <stop offset=".28" stop-color="#e9edf3"/>
        <stop offset=".54" stop-color="#b6bfcd"/>
        <stop offset="1" stop-color="#798394"/>
      </linearGradient>
      <radialGradient id="${uid}sh" cx=".5" cy=".5" r=".5">
        <stop offset="0" stop-color="var(--vial-shadow,#0f172a)" stop-opacity=".34"/>
        <stop offset="1" stop-color="var(--vial-shadow,#0f172a)" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="${uid}clip">
        <path d="M4 60 C4 46 22 42 22 36 L22 12 h28 v24 c0 6 18 10 18 24 v96 a12 12 0 0 1-12 12 H16 a12 12 0 0 1-12-12 Z"/>
      </clipPath>
    </defs>`;

  const ground = `<rect width="240" height="240" fill="var(--vial-ground,#ffffff)"/>
    <rect width="240" height="240" fill="url(#${uid}g)"/>`;

  if (isBox) {
    // Isometric carton: three shaded faces with stroked edges, so the form reads
    // as board rather than glass.
    return `<svg viewBox="0 0 240 240" role="img" aria-label="${esc(product.name)} carton" xmlns="http://www.w3.org/2000/svg">
      ${defs}
      ${ground}
      <ellipse cx="120" cy="206" rx="46" ry="9" fill="url(#${uid}sh)"/>
      <g transform="translate(68 30)" stroke="rgba(15,23,42,.28)" stroke-width="1" stroke-linejoin="round">
        <path d="M52 0 104 28 52 56 0 28Z" fill="var(--vial-box-top,#f4f7fc)"/>
        <path d="M0 28 52 56v112L0 140Z" fill="var(--vial-box-left,#ffffff)"/>
        <path d="M104 28 52 56v112l52-28Z" fill="rgba(15,23,42,.20)"/>
        <g stroke="none" transform="matrix(1,.5385,0,1,0,28)">
          <rect x="4" y="18" width="44" height="78" rx="3" fill="${accent}" opacity=".08"/>
          <g transform="translate(5 24) scale(.78)">${label}</g>
          ${opts.compact ? '<rect x="6" y="30" width="40" height="14" rx="2" fill="' + accent + '" opacity=".85"/>' : ''}
        </g>
      </g>
    </svg>`;
  }

  return `<svg viewBox="0 0 240 240" role="img" aria-label="${esc(product.name)} vial" xmlns="http://www.w3.org/2000/svg">
    ${defs}
    ${ground}
    <ellipse cx="120" cy="216" rx="39" ry="7" fill="url(#${uid}sh)"/>
    <ellipse cx="120" cy="217" rx="23" ry="3.4" fill="var(--vial-shadow,#0f172a)" opacity=".22"/>
    <g transform="translate(78.6 20) scale(1.15)">
      <!-- aluminium crimp: ferrule, skirt, flip button -->
      <rect x="27" y="0" width="18" height="7" rx="3" fill="${accent}"/>
      <rect x="29" y="1.4" width="9" height="2" rx="1" fill="#fff" opacity=".4"/>
      <rect x="21" y="4" width="30" height="17" rx="2.5" fill="url(#${uid}cap)"/>
      <path d="M21 15h30v3.5a2.5 2.5 0 0 1-2.5 2.5h-25A2.5 2.5 0 0 1 21 18.5Z" fill="#9aa4b4"/>
      <path d="M28 15v6M36 15v6M44 15v6" stroke="rgba(15,23,42,.28)" stroke-width=".8"/>

      <!-- glass body with shoulder taper -->
      <path d="M4 60 C4 46 22 42 22 36 L22 12 h28 v24 c0 6 18 10 18 24 v96 a12 12 0 0 1-12 12 H16 a12 12 0 0 1-12-12 Z"
            fill="url(#${uid}glass)" fill-opacity="var(--vial-glass-op,.94)" stroke="var(--vial-stroke,rgba(15,23,42,.18))"/>
      <!-- rubber stopper seen through the neck -->
      <rect x="23" y="19" width="26" height="10" rx="1.5" fill="#5f6b7e" opacity=".55"/>
      <!-- lyophilised cake sitting at the base -->
      <g clip-path="url(#${uid}clip)">
        <ellipse cx="36" cy="160" rx="21" ry="5" fill="var(--vial-shadow,#0f172a)" opacity=".13"/>
        <path d="M17 146h38a3 3 0 0 1 3 3v9a5 5 0 0 1-5 5H19a5 5 0 0 1-5-5v-9a3 3 0 0 1 3-3Z" fill="var(--vial-cake,#f8fafc)" stroke="var(--vial-stroke,rgba(15,23,42,.18))" stroke-width=".6"/>
        <path d="M17 149h38" stroke="var(--vial-shadow,#0f172a)" stroke-width=".6" opacity=".12"/>
      </g>

      <!-- specular highlight, clipped to the glass and drawn *under* the label -->
      <g clip-path="url(#${uid}clip)">
        <path d="M12 52v104" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="var(--vial-spec,.6)"/>
        <path d="M62 66v82" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="var(--vial-spec-2,.32)"/>
      </g>

      <!-- label -->
      <g transform="translate(6 76)">
        ${label}
        ${compactBand ? '' : ''}
      </g>
      ${opts.compact ? compactBand : ''}
      <!-- wrapped edges so the label reads as applied around the glass -->
      ${opts.compact ? '' : `<rect x="6" y="76" width="3" height="60" fill="var(--vial-shadow,#0f172a)" opacity=".10"/>
      <rect x="63" y="76" width="3" height="60" fill="var(--vial-shadow,#0f172a)" opacity=".10"/>`}
    </g>
  </svg>`;
}

/** Data-URI form, for use in `img[src]` and social meta tags. */
export const vialDataURI = (product, size) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(vialSVG(product, size));
