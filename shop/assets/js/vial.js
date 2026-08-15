// Product imagery is drawn, not photographed: every product gets a vector vial
// carrying our own label, so the catalogue stays consistent and ships with no
// external image requests.
import { SITE } from './catalog.js';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Deterministic hash so a product always renders the same cap colour.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (x) => Math.max(0, Math.min(255, Math.round(x)));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function fitLabel(name) {
  // Long compound names wrap onto a second label line rather than overflowing.
  const words = name.split(' ');
  if (name.length <= 16 || words.length === 1) return [name];
  const lines = [''];
  for (const word of words) {
    const line = lines[lines.length - 1];
    if ((line + ' ' + word).trim().length > 16 && line) lines.push(word);
    else lines[lines.length - 1] = (line + ' ' + word).trim();
  }
  return lines.slice(0, 2);
}

/**
 * SVG markup for a product vial.
 * @param {object} product catalogue entry
 * @param {string} [size]  variant size printed on the label
 */
export function vialSVG(product, size) {
  const accent = product.accent || '#7c5cff';
  const seed = hash(product.slug);
  const cap = shade(accent, (seed % 3) * 14 - 14);
  const isBox = product.category === 'supplies' || product.form === 'capsules' || product.form === 'oral';
  const label = fitLabel(product.name.replace(/\s*\(.*\)$/, ''));
  const uid = `v${seed.toString(36)}`;
  const sub = size ? esc(size) : esc(product.variants[0].size);

  const defs = `
    <defs>
      <linearGradient id="${uid}g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${shade(accent, 60)}" stop-opacity=".35"/>
        <stop offset="1" stop-color="${accent}" stop-opacity=".12"/>
      </linearGradient>
      <linearGradient id="${uid}glass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".92"/>
        <stop offset=".35" stop-color="#f2f5fb" stop-opacity=".75"/>
        <stop offset=".62" stop-color="#ffffff" stop-opacity=".95"/>
        <stop offset="1" stop-color="#dfe6f2" stop-opacity=".8"/>
      </linearGradient>
      <linearGradient id="${uid}cap" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${shade(cap, -30)}"/>
        <stop offset=".45" stop-color="${shade(cap, 45)}"/>
        <stop offset="1" stop-color="${shade(cap, -40)}"/>
      </linearGradient>
    </defs>`;

  if (isBox) {
    return `<svg viewBox="0 0 240 240" role="img" aria-label="${esc(product.name)}" xmlns="http://www.w3.org/2000/svg">
      ${defs}
      <rect width="240" height="240" rx="18" fill="url(#${uid}g)"/>
      <g transform="translate(58 44)">
        <path d="M0 24 62 0l62 24v120L62 168 0 144Z" fill="#ffffff" stroke="rgba(15,23,42,.14)"/>
        <path d="M62 24 124 0v144l-62 24Z" fill="rgba(15,23,42,.06)"/>
        <path d="M0 24 62 48v120L0 144Z" fill="rgba(15,23,42,.02)"/>
        <rect x="8" y="52" width="46" height="76" rx="6" fill="${accent}" opacity=".14"/>
        <text x="14" y="74" font-family="Inter,system-ui,sans-serif" font-size="9" font-weight="700" fill="${accent}">${esc(SITE.short.toUpperCase())}</text>
        ${label
          .map(
            (line, i) =>
              `<text x="14" y="${90 + i * 12}" font-family="Inter,system-ui,sans-serif" font-size="8.5" font-weight="600" fill="#0f172a">${esc(line)}</text>`,
          )
          .join('')}
        <text x="14" y="${92 + label.length * 12}" font-family="Inter,system-ui,sans-serif" font-size="7.5" fill="#64748b">${sub}</text>
      </g>
      <text x="120" y="216" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="10" letter-spacing="2.5" fill="rgba(15,23,42,.45)">${esc(SITE.name.toUpperCase())}</text>
    </svg>`;
  }

  return `<svg viewBox="0 0 240 240" role="img" aria-label="${esc(product.name)} vial" xmlns="http://www.w3.org/2000/svg">
    ${defs}
    <rect width="240" height="240" rx="18" fill="url(#${uid}g)"/>
    <ellipse cx="120" cy="206" rx="52" ry="9" fill="rgba(15,23,42,.12)"/>
    <g transform="translate(84 34)">
      <!-- glass body -->
      <path d="M4 34h64v122a12 12 0 0 1-12 12H16a12 12 0 0 1-12-12Z" fill="url(#${uid}glass)" stroke="rgba(15,23,42,.16)"/>
      <path d="M8 96h56v60a8 8 0 0 1-8 8H16a8 8 0 0 1-8-8Z" fill="${accent}" opacity=".10"/>
      <!-- neck + crimp -->
      <path d="M22 12h28v24H22Z" fill="url(#${uid}glass)" stroke="rgba(15,23,42,.16)"/>
      <rect x="14" y="0" width="44" height="20" rx="5" fill="url(#${uid}cap)"/>
      <rect x="20" y="4" width="32" height="4" rx="2" fill="#fff" opacity=".45"/>
      <rect x="14" y="18" width="44" height="8" rx="3" fill="${shade(cap, -20)}" opacity=".85"/>
      <!-- label -->
      <rect x="2" y="52" width="68" height="60" rx="4" fill="#ffffff" opacity=".97" stroke="rgba(15,23,42,.10)"/>
      <rect x="2" y="52" width="68" height="3.5" fill="${accent}"/>
      <text x="8" y="68" font-family="Inter,system-ui,sans-serif" font-size="5.8" font-weight="800" letter-spacing=".2" fill="${accent}">${esc(SITE.name.toUpperCase())}</text>
      ${label
        .map(
          (line, i) =>
            `<text x="8" y="${82 + i * 10}" font-family="Inter,system-ui,sans-serif" font-size="8" font-weight="700" fill="#0f172a">${esc(line)}</text>`,
        )
        .join('')}
      <text x="8" y="${84 + label.length * 10}" font-family="Inter,system-ui,sans-serif" font-size="7.5" fill="#475569">${sub} · lyophilised</text>
      <text x="8" y="${95 + label.length * 10}" font-family="Inter,system-ui,sans-serif" font-size="5.6" fill="#94a3b8">RESEARCH USE ONLY</text>
      <!-- highlight -->
      <path d="M12 40v112" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".65"/>
    </g>
  </svg>`;
}

/** Data-URI form, for use in `img[src]` and social meta tags. */
export const vialDataURI = (product, size) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(vialSVG(product, size));
