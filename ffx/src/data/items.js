// Consumables, spheres and the junk you can bribe out of a monster.
// `mix` tags feed Rugku's overdrive.

import { RANK } from '../game/ctb.js';

const I = (o) => ({ kind: 'heal', target: 'ally', rank: RANK.normal, battle: true, price: 100, ...o });

export const ITEMS = {
  copium: I({
    id: 'copium', name: 'Copium Vial', desc: 'Heals 500 HP and the feeling that you were wrong.',
    heal: 500, price: 60, mix: ['heal', 1],
  }),
  hopium: I({
    id: 'hopium', name: 'Hopium Flask', desc: 'Heals 2500 HP. Tastes like a roadmap.',
    heal: 2500, price: 300, mix: ['heal', 2],
  }),
  ultracope: I({
    id: 'ultracope', name: 'Ultra Cope', desc: 'Heals 9999 HP. Legally a beverage.',
    heal: 9999, price: 1200, mix: ['heal', 3],
  }),
  megacope: I({
    id: 'megacope', name: 'Mega Cope', desc: 'Heals the whole party for 2000.',
    heal: 2000, target: 'allies', price: 1400, mix: ['heal', 2],
  }),
  gasrefill: I({
    id: 'gasrefill', name: 'Gas Refill', desc: 'Restores 150 MP.',
    healMp: 150, price: 240, mix: ['mana', 1],
  }),
  turbogas: I({
    id: 'turbogas', name: 'Turbo Gas', desc: 'Restores all MP. Priority fee included.',
    healMp: 9999, price: 900, mix: ['mana', 3],
  }),
  downround: I({
    id: 'downround', name: 'Phoenix Downround', desc: 'Revives a KO’d ally at 40% HP, diluted but alive.',
    kind: 'revive', revive: 0.4, price: 200, mix: ['life', 1],
  }),
  elixir: I({
    id: 'elixir', name: 'Elixir', desc: 'Full HP and MP for one ally. Genuinely unavailable.',
    heal: 99999, healMp: 9999, price: 4000, mix: ['heal', 3],
  }),
  detox: I({
    id: 'detox', name: 'Detox Bag', desc: 'Cures poison. Does not cure the position.',
    kind: 'cure', cures: ['poison'], price: 50, mix: ['cure', 1],
  }),
  remedy: I({
    id: 'remedy', name: 'Remedy', desc: 'Clears every bad status. Not the bad decision.',
    kind: 'cure', cures: 'all', price: 500, mix: ['cure', 2],
  }),
  grenade: I({
    id: 'grenade', name: 'Grenade', desc: 'Explosives ignore armour and terms of service.',
    kind: 'attack', target: 'enemies', power: 1.4, pierce: true, alwaysHits: true, price: 250, mix: ['bomb', 1],
  }),
  bombcore: I({
    id: 'bombcore', name: 'Bomb Core', desc: 'Fire damage to one target.',
    kind: 'attack', target: 'enemy', power: 2.2, element: 'fire', alwaysHits: true, price: 400, mix: ['bomb', 2],
  }),
  arcticwind: I({
    id: 'arcticwind', name: 'Arctic Wind', desc: 'Ice damage to one target.',
    kind: 'attack', target: 'enemy', power: 2.2, element: 'ice', alwaysHits: true, price: 400, mix: ['bomb', 2],
  }),
  lightningmarble: I({
    id: 'lightningmarble', name: 'Lightning Marble', desc: 'Thunder damage to one target.',
    kind: 'attack', target: 'enemy', power: 2.2, element: 'thunder', alwaysHits: true, price: 400, mix: ['bomb', 2],
  }),
  fishscale: I({
    id: 'fishscale', name: 'Fish Scale', desc: 'Water damage to one target.',
    kind: 'attack', target: 'enemy', power: 2.2, element: 'water', alwaysHits: true, price: 400, mix: ['bomb', 2],
  }),
  chartpaper: I({
    id: 'chartpaper', name: 'Technical Analysis', desc: 'Strength and Defence up for the party. Means nothing. Works anyway.',
    kind: 'buff', target: 'allies', bless: [{ status: 'cheer', turns: 99, stack: true }], price: 300, mix: ['buff', 1],
  }),
  shieldwall: I({
    id: 'shieldwall', name: 'Buy Wall', desc: 'Protect and Shell on the whole party.',
    kind: 'buff', target: 'allies',
    bless: [{ status: 'protect', turns: 10 }, { status: 'shell', turns: 10 }], price: 800, mix: ['buff', 2],
  }),
  redbull: I({
    id: 'redbull', name: 'Bull Run (Canned)', desc: 'Haste on the whole party.',
    kind: 'buff', target: 'allies', bless: [{ status: 'haste', turns: 10 }], price: 1200, mix: ['buff', 3],
  }),

  /* ── grid currency ──────────────────────────────────────────────────── */
  gasSphere: I({ id: 'gasSphere', name: 'Gas Sphere', kind: 'sphere', battle: false, price: 0, desc: 'Activates Strength, Defence and HP nodes.' }),
  copiumSphere: I({ id: 'copiumSphere', name: 'Copium Sphere', kind: 'sphere', battle: false, price: 0, desc: 'Activates Magic, Magic Defence and MP nodes.' }),
  mevSphere: I({ id: 'mevSphere', name: 'MEV Sphere', kind: 'sphere', battle: false, price: 0, desc: 'Activates Agility, Accuracy and Evasion nodes.' }),
  alphaSphere: I({ id: 'alphaSphere', name: 'Alpha Sphere', kind: 'sphere', battle: false, price: 0, desc: 'Activates ability nodes.' }),
  whaleSphere: I({ id: 'whaleSphere', name: 'Whale Sphere', kind: 'sphere', battle: false, price: 0, desc: 'Activates Luck nodes.' }),
  multisig: I({ id: 'multisig', name: 'Multisig Key', kind: 'key', battle: false, price: 0, desc: 'Opens a lock between two arcs of the Stake Grid.' }),

  /* ── loot ───────────────────────────────────────────────────────────── */
  tshare: I({ id: 'tshare', name: 'T-Share Certificate', kind: 'junk', battle: false, price: 0, sell: 900, desc: 'A promise that your slice of a shrinking pie is a bigger slice. Sells well to the faithful.' }),
  sacrificeReceipt: I({ id: 'sacrificeReceipt', name: 'Sacrifice Receipt', kind: 'junk', battle: false, price: 0, sell: 1500, desc: 'Proof that somebody gave a man money and received a feeling.' }),
};

export const SPHERE_IDS = ['gasSphere', 'copiumSphere', 'mevSphere', 'alphaSphere', 'whaleSphere'];

export function item(id) {
  const it = ITEMS[id];
  if (!it) throw new Error('unknown item: ' + id);
  return it;
}

/** Rugku's Mix: two items in, one improvised catastrophe out. */
export const MIX_TABLE = [
  { need: { bomb: 2 }, id: 'trinitron', name: 'Trinitron', desc: 'Massive non-elemental damage to everything.', power: 4.5, target: 'enemies', kind: 'attack', pierce: true },
  { need: { bomb: 1, buff: 1 }, id: 'blastPunch', name: 'Blast Punch', desc: 'Enormous single-target damage.', power: 6, target: 'enemy', kind: 'attack', pierce: true },
  { need: { heal: 2 }, id: 'finalElixir', name: 'Final Elixir', desc: 'Full HP and MP for the party.', heal: 99999, healMp: 9999, target: 'allies', kind: 'heal' },
  { need: { heal: 1, cure: 1 }, id: 'panacea', name: 'Panacea', desc: 'Party healed and cleansed.', heal: 4000, cures: 'all', target: 'allies', kind: 'heal' },
  { need: { life: 1 }, id: 'freedom', name: 'Freedom', desc: 'Revives and fully heals every fallen ally.', reviveAll: 1, target: 'allies', kind: 'heal' },
  { need: { buff: 2 }, id: 'superMighty', name: 'Super Mighty G', desc: 'Protect, Shell, Haste and Regen on everyone.', target: 'allies', kind: 'buff', bless: [{ status: 'protect', turns: 12 }, { status: 'shell', turns: 12 }, { status: 'haste', turns: 12 }, { status: 'regen', turns: 12 }] },
  { need: { mana: 1 }, id: 'ultraNulAll', name: 'Liquidity Injection', desc: 'Party MP restored and Shell applied.', healMp: 9999, target: 'allies', kind: 'heal', bless: [{ status: 'shell', turns: 10 }] },
];

export function mixResult(a, b) {
  const tags = {};
  for (const it of [a, b]) {
    if (!it?.mix) continue;
    const [tag, w] = it.mix;
    tags[tag] = (tags[tag] || 0) + (w >= 2 ? 1 : 1);
  }
  for (const recipe of MIX_TABLE) {
    let ok = true;
    for (const [tag, n] of Object.entries(recipe.need)) {
      if ((tags[tag] || 0) < n) ok = false;
    }
    if (ok) {
      const strength = ((a?.mix?.[1] ?? 1) + (b?.mix?.[1] ?? 1)) / 2;
      return { ...recipe, power: recipe.power ? recipe.power * (0.7 + strength * 0.25) : undefined };
    }
  }
  return { id: 'sludge', name: 'Sludge', desc: 'It fizzes. Something happens. Not much.', power: 1.2, target: 'enemies', kind: 'attack' };
}
