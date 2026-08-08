// Party state: who is with you, what they have switched on in the Stake Grid,
// and what is in the bag. Derived stats are always recomputed from the grid so
// a save file only has to store a list of node ids.

import { CHARACTERS } from '../data/characters.js';
import { GRID, NODE_TYPES, startNode } from '../data/grid.js';
import { ABILITIES } from '../data/abilities.js';

export const STAT_KEYS = ['hp', 'mp', 'str', 'def', 'mag', 'mdef', 'agi', 'acc', 'eva', 'luck'];

export function newGame() {
  const chars = {};
  for (const id of Object.keys(CHARACTERS)) {
    chars[id] = {
      id,
      node: startNode(id),
      nodes: [],           // activated node ids
      learned: [...CHARACTERS[id].starting],
      ap: 0,
      sLv: 0,
      hp: null,            // filled below
      mp: null,
      overdrive: 0,
      ko: false,
    };
  }
  const state = {
    version: 1,
    chapter: 0,
    x: 60,
    facing: 1,
    party: ['dipus'],
    active: ['dipus'],
    chars,
    aeons: [],
    aeonHp: {},
    aeonOd: {},
    inv: { copium: 5, downround: 2, detox: 2, gasSphere: 4, copiumSphere: 4, mevSphere: 4, alphaSphere: 3, whaleSphere: 1, multisig: 0 },
    pls: 300,
    flags: {},
    seen: {},
    stats: { battles: 0, kills: 0, steals: 0, overdrives: 0, deaths: 0, playtime: 0, gridNodes: 0 },
    settings: { music: true, sfx: true, speed: 1, damageNumbers: true },
  };
  for (const id of Object.keys(chars)) restoreFull(state, id);
  return state;
}

/** Base + everything switched on in the grid. */
export function charStats(state, id) {
  const base = CHARACTERS[id].base;
  const out = {};
  for (const k of STAT_KEYS) out[k] = base[k];
  const c = state.chars[id];
  for (const nodeId of c.nodes) {
    const node = GRID.get(nodeId);
    if (!node) continue;
    const t = NODE_TYPES[node.type];
    if (!t?.stat) continue;
    out[t.stat] += t.value;
  }
  out.maxHp = out.hp;
  out.maxMp = out.mp;
  return out;
}

export function learned(state, id) {
  const c = state.chars[id];
  const set = new Set(c.learned);
  for (const nodeId of c.nodes) {
    const node = GRID.get(nodeId);
    if (node?.type === 'ability' && node.ability) set.add(node.ability);
  }
  return [...set].filter((a) => ABILITIES[a]);
}

export function restoreFull(state, id) {
  const s = charStats(state, id);
  const c = state.chars[id];
  c.hp = s.maxHp;
  c.mp = s.maxMp;
  c.ko = false;
}

export function restoreParty(state) {
  for (const id of state.party) restoreFull(state, id);
  for (const a of state.aeons) {
    delete state.aeonHp[a];
  }
}

/** AP is only earned by whoever actually took a turn — swap or miss out. */
export function apThreshold(sLvTotal) {
  return Math.round(220 + sLvTotal * 46);
}

export function gainAp(state, id, ap) {
  const c = state.chars[id];
  c.ap += ap;
  let gained = 0;
  let guard = 0;
  while (c.ap >= apThreshold(c.sLv) && guard++ < 50) {
    c.ap -= apThreshold(c.sLv);
    c.sLv += 1;
    gained += 1;
  }
  return gained;
}

export function canMove(state, id, toNode) {
  const c = state.chars[id];
  if (c.sLv < 1) return { ok: false, why: 'No Stake Levels left.' };
  const here = GRID.get(c.node);
  if (!here?.links.includes(toNode)) return { ok: false, why: 'Not adjacent.' };
  const dest = GRID.get(toNode);
  if (dest?.type === 'lock' && !dest.open) {
    return { ok: false, why: 'Locked. Use a Multisig Key from the node beside it.' };
  }
  return { ok: true };
}

export function moveTo(state, id, toNode) {
  const check = canMove(state, id, toNode);
  if (!check.ok) return check;
  state.chars[id].sLv -= 1;
  state.chars[id].node = toNode;
  return { ok: true };
}

export function canActivate(state, id, nodeId) {
  const node = GRID.get(nodeId);
  const c = state.chars[id];
  if (!node) return { ok: false, why: 'No node.' };
  if (c.node !== nodeId) return { ok: false, why: 'Stand on it first.' };
  if (c.nodes.includes(nodeId)) return { ok: false, why: 'Already active.' };
  if (node.type === 'empty') return { ok: false, why: 'Nothing here yet.' };
  const t = NODE_TYPES[node.type];
  if (!t.sphere) return { ok: false, why: 'Nothing here.' };
  if ((state.inv[t.sphere] || 0) < 1) return { ok: false, why: `Needs a ${t.sphere === 'multisig' ? 'Multisig Key' : t.label}.` };
  return { ok: true, sphere: t.sphere };
}

export function activate(state, id, nodeId) {
  const check = canActivate(state, id, nodeId);
  if (!check.ok) return check;
  const node = GRID.get(nodeId);
  state.inv[check.sphere] -= 1;
  if (node.type === 'lock') {
    node.open = true; // opening a lock opens it for everybody, as it should
    state.chars[id].nodes.push(nodeId);
  } else {
    state.chars[id].nodes.push(nodeId);
    if (node.type === 'hp' || node.type === 'mp') {
      // Growing the pool also tops it up, which is a small kindness.
      const s = charStats(state, id);
      state.chars[id].hp = Math.min(s.maxHp, state.chars[id].hp + NODE_TYPES.hp.value);
      state.chars[id].mp = Math.min(s.maxMp, state.chars[id].mp + NODE_TYPES.mp.value);
    }
  }
  state.stats.gridNodes++;
  return { ok: true, node };
}

export function addItem(state, id, n = 1) {
  state.inv[id] = (state.inv[id] || 0) + n;
}

export function takeItem(state, id, n = 1) {
  if ((state.inv[id] || 0) < n) return false;
  state.inv[id] -= n;
  if (state.inv[id] <= 0) delete state.inv[id];
  return true;
}

export function recruit(state, id) {
  if (!state.party.includes(id)) {
    state.party.push(id);
    restoreFull(state, id);
  }
  if (state.active.length < 3 && !state.active.includes(id)) state.active.push(id);
}

export function partyAlive(state) {
  return state.party.some((id) => !state.chars[id].ko);
}
