// Idle games spend most of their life showing numbers no human can read at a
// glance, so every number on screen goes through here first.

const SHORT = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No'];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

// Beyond decillion the standard names run out and every idle game invents its
// own; the aa/ab/ac ladder is the one players already recognise.
function suffix(tier) {
  if (tier < SHORT.length) return SHORT[tier];
  let n = tier - SHORT.length;
  const first = Math.floor(n / 26);
  const second = n % 26;
  return LETTERS[first] + LETTERS[second];
}

export function fmt(value, decimals = 2) {
  if (!isFinite(value)) return '∞';
  const neg = value < 0;
  let n = Math.abs(value);
  if (n < 1000) {
    // Small numbers read better whole: "$14" not "$14.00".
    const out = n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.floor(n).toString();
    return neg ? '-' + out : out;
  }
  const tier = Math.floor(Math.log10(n) / 3);
  const scaled = n / Math.pow(10, tier * 3);
  // Rounding can push 999.996 up to 1000.00, which would print "1000K".
  const rounded = scaled.toFixed(decimals);
  const out = rounded.startsWith('1000')
    ? (1).toFixed(decimals) + suffix(tier + 1)
    : rounded + suffix(tier);
  return neg ? '-' + out : out;
}

export function money(value, decimals = 2) {
  return '$' + fmt(value, decimals);
}

// Durations are always shown counting down, so seconds matter near zero and
// stop mattering entirely once you are an hour out.
export function duration(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '—';
  const s = Math.ceil(seconds);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + (s % 60) + 's';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ' + (m % 60) + 'm';
  return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
}

// Progress bar widths, tween factors — anything that must not leave [0,1].
export function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
