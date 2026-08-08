// Three save slots in localStorage, plus an autosave that fires at every save
// sphere. Grid nodes are stored as ids, so the layout can change between
// versions without corrupting anybody's progress beyond a shrug.

import { GRID } from '../data/grid.js';

const KEY = 'finalsacrificex.save';
export const SLOTS = ['auto', 'a', 'b'];

function serialise(state) {
  const openLocks = [];
  for (const [id, node] of GRID) if (node.open) openLocks.push(id);
  return JSON.stringify({ ...state, openLocks, savedAt: Date.now() });
}

export function save(state, slot = 'auto') {
  try {
    localStorage.setItem(`${KEY}.${slot}`, serialise(state));
    return true;
  } catch {
    return false;
  }
}

export function load(slot = 'auto') {
  try {
    const raw = localStorage.getItem(`${KEY}.${slot}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    for (const id of data.openLocks || []) {
      const node = GRID.get(id);
      if (node) node.open = true;
    }
    delete data.openLocks;
    return data;
  } catch {
    return null;
  }
}

export function peek(slot) {
  try {
    const raw = localStorage.getItem(`${KEY}.${slot}`);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return {
      chapter: d.chapter, savedAt: d.savedAt, pls: d.pls,
      party: d.party?.length || 0, battles: d.stats?.battles || 0,
    };
  } catch {
    return null;
  }
}

export function wipe(slot) {
  localStorage.removeItem(`${KEY}.${slot}`);
}

export function resetLocks() {
  for (const [, node] of GRID) delete node.open;
}
