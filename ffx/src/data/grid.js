// The Stake Grid.
//
// Seven petals around a locked centre, one per character, each a closed loop
// you walk one node at a time. Moving costs a Stake Level; switching a node on
// costs the matching sphere. Walk far enough around your own petal and you
// arrive at somebody else's — which is the entire late game, and also the joke:
// everybody ends up in the same position eventually.
//
// The layout is generated from a fixed seed so a save file can store "which
// nodes are on" as a list of ids and get the same grid back.

import { makeRng } from '../core/rng.js';

export const NODE_TYPES = {
  hp: { label: 'HP +240', stat: 'hp', value: 240, sphere: 'gasSphere', tone: '#5ef0a0' },
  mp: { label: 'MP +18', stat: 'mp', value: 18, sphere: 'copiumSphere', tone: '#6fb8ff' },
  str: { label: 'STR +1', stat: 'str', value: 1, sphere: 'gasSphere', tone: '#ff7a6b' },
  def: { label: 'DEF +1', stat: 'def', value: 1, sphere: 'gasSphere', tone: '#ffb46b' },
  mag: { label: 'MAG +1', stat: 'mag', value: 1, sphere: 'copiumSphere', tone: '#c58fff' },
  mdef: { label: 'MDEF +1', stat: 'mdef', value: 1, sphere: 'copiumSphere', tone: '#8f9cff' },
  agi: { label: 'AGI +1', stat: 'agi', value: 1, sphere: 'mevSphere', tone: '#4ee0e6' },
  acc: { label: 'ACC +1', stat: 'acc', value: 1, sphere: 'mevSphere', tone: '#7ee0c8' },
  eva: { label: 'EVA +1', stat: 'eva', value: 1, sphere: 'mevSphere', tone: '#9ef0ff' },
  luck: { label: 'LUCK +1', stat: 'luck', value: 1, sphere: 'whaleSphere', tone: '#ffe98f' },
  ability: { label: 'Ability', sphere: 'alphaSphere', tone: '#ff58c8' },
  empty: { label: 'Empty', sphere: null, tone: '#3a4260' },
  lock: { label: 'Lock', sphere: 'multisig', tone: '#f5c66b' },
};

/** What each petal is mostly made of, and what it teaches, in order. */
export const PETALS = {
  dipus: {
    mix: ['agi', 'agi', 'str', 'acc', 'eva', 'hp', 'str', 'agi', 'def', 'hp', 'acc'],
    abilities: ['cheer', 'frontRun', 'quickHit', 'haste', 'slowSpell', 'sandwich', 'hastega', 'flare'],
  },
  yield: {
    mix: ['mag', 'mdef', 'mp', 'mdef', 'mag', 'hp', 'mp', 'agi', 'mdef', 'mag', 'mp'],
    abilities: ['cure', 'esuna', 'protectSpell', 'shellSpell', 'cura', 'life', 'regenSpell', 'dispel', 'curaga', 'fullLife', 'autolifeSpell', 'holy'],
  },
  audit: {
    mix: ['str', 'hp', 'def', 'str', 'hp', 'str', 'def', 'acc', 'hp', 'str', 'def'],
    abilities: ['armorBreak', 'powerBreak', 'magicBreak', 'mentalBreak', 'taunt', 'heavyStrike', 'ultima'],
  },
  wojak: {
    mix: ['acc', 'str', 'hp', 'luck', 'acc', 'str', 'hp', 'def', 'acc', 'luck', 'str'],
    abilities: ['ballThrow', 'fudBuster', 'muteBuster', 'copiumBuster', 'tripleFud', 'quickHit'],
  },
  luna: {
    mix: ['mag', 'mp', 'mag', 'mdef', 'mp', 'mag', 'hp', 'mag', 'mp', 'mdef', 'mag'],
    abilities: ['fire', 'blizzard', 'thunder', 'water', 'bio', 'fira', 'blizzara', 'thundara', 'watera', 'drain', 'osmose', 'demi', 'firaga', 'blizzaga', 'thundaga', 'waterga', 'flare'],
  },
  copi: {
    mix: ['hp', 'str', 'mag', 'def', 'mdef', 'agi', 'hp', 'str', 'mag', 'acc', 'def'],
    abilities: ['lancet', 'jump', 'seedCannon', 'stoneBreath', 'aquaBreath', 'novaRage', 'cure'],
  },
  rugku: {
    mix: ['agi', 'eva', 'luck', 'agi', 'hp', 'eva', 'agi', 'str', 'luck', 'mp', 'eva'],
    abilities: ['steal', 'grenade', 'mug', 'bribe', 'luckySeven', 'quickHit'],
  },
};

export const PETAL_ORDER = ['dipus', 'yield', 'audit', 'wojak', 'luna', 'copi', 'rugku'];

// A petal is two concentric rings: the outer walk you start on, and an inner
// ring you drop onto later. Seven petals of ~90 nodes is the difference between
// a party that outgrows chapter twelve and one that stalls at chapter four.
const LOOP = 58;      // nodes around the outer ring
const INNER = 34;     // nodes around the inner ring

export function buildGrid() {
  const rnd = makeRng(0x5ac21f);
  const nodes = new Map();
  const link = (a, b) => {
    if (!nodes.has(a) || !nodes.has(b) || a === b) return;
    if (!nodes.get(a).links.includes(b)) nodes.get(a).links.push(b);
    if (!nodes.get(b).links.includes(a)) nodes.get(b).links.push(a);
  };
  const put = (id, x, y, type, extra = {}) => {
    nodes.set(id, { id, x, y, type, links: [], ...extra });
    return id;
  };

  put('hub', 0, 0, 'empty', { hub: true });

  const R = 620; // distance from centre to petal centre
  PETAL_ORDER.forEach((who, pi) => {
    const spec = PETALS[who];
    const theta = (pi / PETAL_ORDER.length) * Math.PI * 2 - Math.PI / 2;
    const cx = Math.cos(theta) * R;
    const cy = Math.sin(theta) * R;
    const abilities = spec.abilities.slice();
    let abIndex = 0;

    // The loop itself: an ellipse pointing away from the centre.
    const ids = [];
    for (let i = 0; i < LOOP; i++) {
      const t = (i / LOOP) * Math.PI * 2;
      const rx = 320, ry = 210;
      const lx = Math.cos(t) * rx;
      const ly = Math.sin(t) * ry;
      const x = cx + lx * Math.cos(theta) - ly * Math.sin(theta) + rnd.range(-7, 7);
      const y = cy + lx * Math.sin(theta) + ly * Math.cos(theta) + rnd.range(-7, 7);

      // Ability nodes every fourth step, the rest are the petal's stat mix.
      let type = spec.mix[i % spec.mix.length];
      let extra = {};
      if (i % 3 === 1 && abIndex < abilities.length) {
        type = 'ability';
        extra.ability = abilities[abIndex++];
      } else if (i % 7 === 5) {
        type = 'empty';
      }
      ids.push(put(`${who}:${i}`, x, y, type, { petal: who, ...extra }));
    }
    for (let i = 0; i < LOOP; i++) link(ids[i], ids[(i + 1) % LOOP]);

    // Anything the loop could not fit goes on a short spur off the inner edge.
    const spurBase = ids[Math.floor(LOOP / 2)];
    let prev = spurBase;
    let spur = 0;
    while (abIndex < abilities.length) {
      const t = Math.PI + (spur + 1) * 0.24;
      const lx = Math.cos(t) * (150 + spur * 46);
      const ly = Math.sin(t) * (100 + spur * 30);
      const x = cx + lx * Math.cos(theta) - ly * Math.sin(theta);
      const y = cy + lx * Math.sin(theta) + ly * Math.cos(theta);
      const id = put(`${who}:s${spur}`, x, y, spur % 2 === 0 ? 'ability' : spec.mix[spur % spec.mix.length], {
        petal: who,
        ability: spur % 2 === 0 ? abilities[abIndex] : undefined,
      });
      if (spur % 2 === 0) abIndex++;
      link(prev, id);
      prev = id;
      spur++;
      if (spur > 24) break;
    }

    // The inner ring: pure stat nodes, reached from two points on the outer
    // walk. This is where the second half of the game's growth lives.
    const innerIds = [];
    for (let i = 0; i < INNER; i++) {
      const t = (i / INNER) * Math.PI * 2;
      const lx = Math.cos(t) * 178;
      const ly = Math.sin(t) * 112;
      const x = cx + lx * Math.cos(theta) - ly * Math.sin(theta) + rnd.range(-5, 5);
      const y = cy + lx * Math.sin(theta) + ly * Math.cos(theta) + rnd.range(-5, 5);
      const type = i % 9 === 4 ? 'luck' : spec.mix[(i * 3) % spec.mix.length];
      innerIds.push(put(`${who}:i${i}`, x, y, type, { petal: who }));
    }
    for (let i = 0; i < INNER; i++) link(innerIds[i], innerIds[(i + 1) % INNER]);
    link(ids[Math.floor(LOOP * 0.05)], innerIds[0]);
    link(ids[Math.floor(LOOP * 0.55)], innerIds[Math.floor(INNER / 2)]);

    // Stem into the hub, gated by a Multisig Key.
    const inner = ids[Math.floor(LOOP / 2)];
    const sx = cx * 0.42, sy = cy * 0.42;
    const lockId = put(`${who}:lock`, sx, sy, 'lock', { petal: who, lock: 1 });
    link(inner, lockId);
    link(lockId, 'hub');
  });

  // Petal-to-petal bridges, also locked: the shortcut between two characters.
  PETAL_ORDER.forEach((who, pi) => {
    const next = PETAL_ORDER[(pi + 1) % PETAL_ORDER.length];
    const a = nodes.get(`${who}:${Math.floor(LOOP * 0.22)}`);
    const b = nodes.get(`${next}:${Math.floor(LOOP * 0.78)}`);
    if (!a || !b) return;
    const id = put(`bridge:${who}-${next}`, (a.x + b.x) / 2, (a.y + b.y) / 2, 'lock', { lock: 2 });
    link(a.id, id);
    link(id, b.id);
  });

  return nodes;
}

export const GRID = buildGrid();

export function startNode(who) {
  return `${who}:0`;
}

export function nodeInfo(node) {
  if (!node) return null;
  const t = NODE_TYPES[node.type];
  if (node.type === 'ability') {
    return { ...t, ability: node.ability };
  }
  return t;
}
