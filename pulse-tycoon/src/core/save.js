// One key, one JSON blob, no schema migrations yet — but a version stamp, so
// there can be. A save that fails to parse is thrown away rather than fought
// with: a fresh empire beats a broken one.

import { newState, SAVE_VERSION } from '../game/state.js';

const KEY = 'pulse-tycoon:save:v1';

function storage() {
  try {
    // Private-mode Safari has a localStorage that throws on write, so the
    // probe has to actually write something.
    const t = '__probe';
    window.localStorage.setItem(t, t);
    window.localStorage.removeItem(t);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function save(state) {
  const store = storage();
  if (!store) return false;
  state.lastSeen = Date.now();
  try {
    store.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// Returns { state, offlineSeconds }. Offline time is handed back rather than
// applied here so the caller decides when to bank it — the summary panel wants
// to show the number before the cash lands.
export function load() {
  const store = storage();
  if (!store) return { state: newState(), offlineSeconds: 0 };
  let raw = null;
  try {
    raw = store.getItem(KEY);
  } catch {
    raw = null;
  }
  if (!raw) return { state: newState(), offlineSeconds: 0 };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: newState(), offlineSeconds: 0 };
  }
  if (!parsed || parsed.version !== SAVE_VERSION) {
    return { state: newState(), offlineSeconds: 0 };
  }

  // Merge over a fresh state so a save written by an older build is missing
  // keys rather than crashing on them.
  const state = Object.assign(newState(), parsed);
  state.stats = Object.assign(newState().stats, parsed.stats || {});

  const gap = (Date.now() - (parsed.lastSeen || Date.now())) / 1000;
  // A clock that jumped backwards (timezone change, manual set) reads as
  // negative time; treat it as zero rather than as a refund.
  const offlineSeconds = gap > 0 ? gap : 0;
  return { state, offlineSeconds };
}

export function wipe() {
  const store = storage();
  if (store) {
    try {
      store.removeItem(KEY);
    } catch {
      /* nothing to do — the next save will fail the same way */
    }
  }
}
