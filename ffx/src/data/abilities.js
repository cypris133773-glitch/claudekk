// Every action anybody can take. The battle engine reads these fields and
// nothing else, so a new ability is a data entry rather than a code change.

import { RANK } from '../game/ctb.js';

const A = (o) => ({ mp: 0, rank: RANK.skill, target: 'enemy', kind: 'attack', power: 1, ...o });

export const ABILITIES = {
  /* ── universal ───────────────────────────────────────────────────────── */
  attack: A({
    id: 'attack', name: 'Attack', desc: 'Swing the thing you are holding.',
    rank: RANK.normal, power: 1,
  }),
  defend: A({
    id: 'defend', name: 'Guard', desc: 'Halve the next hit taken.',
    kind: 'support', target: 'self', rank: RANK.quick,
    bless: [{ status: 'defending', turns: 1 }],
  }),
  flee: A({
    id: 'flee', name: 'Sell', desc: 'Take the loss and leave.',
    kind: 'flee', target: 'none', rank: RANK.quick,
  }),

  /* ── Dipus — tempo, buffs, and shoving people down the queue ─────────── */
  cheer: A({
    id: 'cheer', name: 'Cheer', desc: 'Party Strength and Defence up. Stacks five times.',
    kind: 'support', target: 'allies', rank: RANK.quick,
    bless: [{ status: 'cheer', turns: 99, stack: true }],
  }),
  frontRun: A({
    id: 'frontRun', name: 'Front-Run', desc: 'Shove one enemy backwards down the turn order.',
    rank: RANK.normal, power: 0.6, delay: 2.2,
  }),
  sandwich: A({
    id: 'sandwich', name: 'Sandwich', desc: 'Front-run them, back-run them. Enormous delay.',
    mp: 8, rank: RANK.skill, power: 0.8, delay: 4.5,
  }),
  haste: A({
    id: 'haste', name: 'Haste', desc: 'One ally acts 50% more often.',
    kind: 'magic', mp: 8, target: 'ally', rank: RANK.spell,
    bless: [{ status: 'haste', turns: 12 }],
  }),
  hastega: A({
    id: 'hastega', name: 'Hastega', desc: 'Haste, for everyone.',
    kind: 'magic', mp: 24, target: 'allies', rank: RANK.spell,
    bless: [{ status: 'haste', turns: 10 }],
  }),
  slowSpell: A({
    id: 'slowSpell', name: 'Slow', desc: 'Halve one enemy’s turn rate.',
    kind: 'magic', mp: 12, rank: RANK.spell,
    inflict: [{ status: 'slow', chance: 0.75, turns: 8 }],
  }),
  quickHit: A({
    id: 'quickHit', name: 'Quick Hit', desc: 'A hit that barely costs you a place in the queue.',
    mp: 12, rank: RANK.quick, power: 0.9,
  }),

  /* ── Wojak — ranged, status, and the only man who can hit a flyer ────── */
  ballThrow: A({
    id: 'ballThrow', name: 'Throw', desc: 'A ranged shot. Flyers cannot dodge it.',
    rank: RANK.normal, power: 1, ranged: true,
  }),
  fudBuster: A({
    id: 'fudBuster', name: 'FUD Buster', desc: 'Ranged hit that blinds.',
    mp: 4, rank: RANK.skill, power: 0.9, ranged: true,
    inflict: [{ status: 'blind', chance: 0.85, turns: 8 }],
  }),
  muteBuster: A({
    id: 'muteBuster', name: 'Mute Buster', desc: 'Ranged hit that silences.',
    mp: 4, rank: RANK.skill, power: 0.9, ranged: true,
    inflict: [{ status: 'silence', chance: 0.85, turns: 8 }],
  }),
  copiumBuster: A({
    id: 'copiumBuster', name: 'Copium Buster', desc: 'Ranged hit that puts them to sleep.',
    mp: 4, rank: RANK.skill, power: 0.9, ranged: true,
    inflict: [{ status: 'sleep', chance: 0.8, turns: 5 }],
  }),
  tripleFud: A({
    id: 'tripleFud', name: 'Triple FUD', desc: 'Blind, silence and sleep in one throw.',
    mp: 12, rank: RANK.skill, power: 0.8, ranged: true,
    inflict: [
      { status: 'blind', chance: 0.7, turns: 8 },
      { status: 'silence', chance: 0.7, turns: 8 },
      { status: 'sleep', chance: 0.7, turns: 5 },
    ],
  }),

  /* ── Audit — armour is a suggestion ─────────────────────────────────── */
  powerBreak: A({
    id: 'powerBreak', name: 'Leverage Break', desc: 'Their Strength down 30%.',
    mp: 8, power: 0.7, pierce: true,
    inflict: [{ status: 'powerBreak', chance: 0.9, turns: 99 }],
  }),
  armorBreak: A({
    id: 'armorBreak', name: 'Contract Break', desc: 'Read the contract. Defence halved, armour off.',
    mp: 12, power: 0.7, pierce: true,
    inflict: [{ status: 'armorBreak', chance: 0.9, turns: 99 }],
  }),
  magicBreak: A({
    id: 'magicBreak', name: 'Narrative Break', desc: 'Their Magic down 30%.',
    mp: 8, power: 0.7, pierce: true,
    inflict: [{ status: 'magicBreak', chance: 0.9, turns: 99 }],
  }),
  mentalBreak: A({
    id: 'mentalBreak', name: 'Conviction Break', desc: 'Their Magic Defence halved.',
    mp: 12, power: 0.7, pierce: true,
    inflict: [{ status: 'mentalBreak', chance: 0.9, turns: 99 }],
  }),
  heavyStrike: A({
    id: 'heavyStrike', name: 'Cold Read', desc: 'Slow, enormous, pierces armour.',
    mp: 14, rank: RANK.heavy, power: 2.6, pierce: true,
  }),
  taunt: A({
    id: 'taunt', name: 'Provoke', desc: 'They come for you instead of the summoner.',
    mp: 6, rank: RANK.quick, power: 0,
    inflict: [{ status: 'provoked', chance: 1, turns: 6 }],
  }),

  /* ── Luna — black magic ─────────────────────────────────────────────── */
  fire: A({ id: 'fire', name: 'Fire', kind: 'magic', mp: 4, rank: RANK.spell, power: 0.85, element: 'fire', desc: 'Burn one.' }),
  fira: A({ id: 'fira', name: 'Fira', kind: 'magic', mp: 12, rank: RANK.spell, power: 1.7, element: 'fire', desc: 'Burn one, properly.' }),
  firaga: A({ id: 'firaga', name: 'Firaga', kind: 'magic', mp: 24, rank: RANK.spell, power: 3, element: 'fire', desc: 'Burn everything.', target: 'enemies' }),
  blizzard: A({ id: 'blizzard', name: 'Blizzard', kind: 'magic', mp: 4, rank: RANK.spell, power: 0.85, element: 'ice', desc: 'Freeze one.' }),
  blizzara: A({ id: 'blizzara', name: 'Blizzara', kind: 'magic', mp: 12, rank: RANK.spell, power: 1.7, element: 'ice', desc: 'Freeze one, properly.' }),
  blizzaga: A({ id: 'blizzaga', name: 'Blizzaga', kind: 'magic', mp: 24, rank: RANK.spell, power: 3, element: 'ice', desc: 'Freeze everything.', target: 'enemies' }),
  thunder: A({ id: 'thunder', name: 'Thunder', kind: 'magic', mp: 4, rank: RANK.spell, power: 0.85, element: 'thunder', desc: 'Zap one.' }),
  thundara: A({ id: 'thundara', name: 'Thundara', kind: 'magic', mp: 12, rank: RANK.spell, power: 1.7, element: 'thunder', desc: 'Zap one, properly.' }),
  thundaga: A({ id: 'thundaga', name: 'Thundaga', kind: 'magic', mp: 24, rank: RANK.spell, power: 3, element: 'thunder', desc: 'Zap everything.', target: 'enemies' }),
  water: A({ id: 'water', name: 'Water', kind: 'magic', mp: 4, rank: RANK.spell, power: 0.85, element: 'water', desc: 'Drown one.' }),
  watera: A({ id: 'watera', name: 'Watera', kind: 'magic', mp: 12, rank: RANK.spell, power: 1.7, element: 'water', desc: 'Drown one, properly.' }),
  waterga: A({ id: 'waterga', name: 'Waterga', kind: 'magic', mp: 24, rank: RANK.spell, power: 3, element: 'water', desc: 'Drown everything.', target: 'enemies' }),
  bio: A({
    id: 'bio', name: 'FUD', kind: 'magic', mp: 10, rank: RANK.spell, power: 1.1,
    desc: 'Poison that spreads through the community.',
    inflict: [{ status: 'poison', chance: 0.9, turns: 99 }],
  }),
  demi: A({
    id: 'demi', name: 'Demi', kind: 'magic', mp: 18, rank: RANK.spell, target: 'enemies',
    percentHp: 0.25, element: 'gravity', noCrit: true, desc: 'Shaves a quarter off everything. Never kills.',
  }),
  drain: A({
    id: 'drain', name: 'Drain', kind: 'magic', mp: 12, rank: RANK.spell, power: 1.3,
    drain: 'hp', desc: 'Their HP becomes yours.',
  }),
  osmose: A({
    id: 'osmose', name: 'Osmose', kind: 'magic', mp: 0, rank: RANK.spell, power: 0.3,
    drain: 'mp', desc: 'Their MP becomes yours.',
  }),
  flare: A({
    id: 'flare', name: 'Flare', kind: 'magic', mp: 54, rank: RANK.heavy, power: 5.4,
    desc: 'Non-elemental, unblockable by resistance, extremely rude.',
  }),
  ultima: A({
    id: 'ultima', name: 'Ultima', kind: 'magic', mp: 90, rank: RANK.heavy, power: 4.6,
    target: 'enemies', desc: 'The one everybody grinds for.',
  }),

  /* ── Yield — white magic ────────────────────────────────────────────── */
  cure: A({ id: 'cure', name: 'Cure', kind: 'heal', mp: 4, rank: RANK.spell, target: 'ally', power: 1, desc: 'Heal one ally.' }),
  cura: A({ id: 'cura', name: 'Cura', kind: 'heal', mp: 10, rank: RANK.spell, target: 'ally', power: 2.4, desc: 'Heal one ally, well.' }),
  curaga: A({ id: 'curaga', name: 'Curaga', kind: 'heal', mp: 20, rank: RANK.spell, target: 'allies', power: 2.6, desc: 'Heal the whole party.' }),
  life: A({
    id: 'life', name: 'Refi', kind: 'heal', mp: 18, rank: RANK.spell, target: 'ally',
    revive: 0.5, desc: 'Revive an ally at half HP. Yes, it is called that.',
  }),
  fullLife: A({
    id: 'fullLife', name: 'Full Refi', kind: 'heal', mp: 60, rank: RANK.spell, target: 'ally',
    revive: 1, desc: 'Revive an ally at full HP.',
  }),
  esuna: A({
    id: 'esuna', name: 'Esuna', kind: 'heal', mp: 5, rank: RANK.spell, target: 'ally',
    cleanse: true, desc: 'Clear the bad news.',
  }),
  protectSpell: A({
    id: 'protectSpell', name: 'Protect', kind: 'magic', mp: 12, rank: RANK.spell, target: 'ally',
    bless: [{ status: 'protect', turns: 12 }], desc: 'Physical damage way down.',
  }),
  shellSpell: A({
    id: 'shellSpell', name: 'Shell', kind: 'magic', mp: 12, rank: RANK.spell, target: 'ally',
    bless: [{ status: 'shell', turns: 12 }], desc: 'Magic damage way down.',
  }),
  regenSpell: A({
    id: 'regenSpell', name: 'Regen', kind: 'magic', mp: 18, rank: RANK.spell, target: 'ally',
    bless: [{ status: 'regen', turns: 14 }], desc: 'A trickle of real yield.',
  }),
  dispel: A({
    id: 'dispel', name: 'Dispel', kind: 'magic', mp: 12, rank: RANK.spell,
    dispel: true, power: 0, desc: 'Strip their buffs. Very effective on maesters.',
  }),
  autolifeSpell: A({
    id: 'autolifeSpell', name: 'Insurance', kind: 'magic', mp: 40, rank: RANK.spell, target: 'ally',
    bless: [{ status: 'autolife', turns: 99 }], desc: 'They get back up once. Once.',
  }),
  holy: A({
    id: 'holy', name: 'Holy', kind: 'magic', mp: 60, rank: RANK.heavy, power: 4.4, element: 'holy',
    desc: 'The Church’s own light, turned around.',
  }),

  /* ── Rugku — the only one who reads the source ──────────────────────── */
  steal: A({
    id: 'steal', name: 'Steal', desc: 'Take an item. They had it coming.',
    rank: RANK.quick, power: 0, special: 'steal',
  }),
  mug: A({
    id: 'mug', name: 'Mug', desc: 'Steal and hit at the same time.',
    mp: 10, rank: RANK.normal, power: 0.9, special: 'steal', pierce: true,
  }),
  bribe: A({
    id: 'bribe', name: 'Bribe', desc: 'Pay an enemy to leave and hand over the good stuff.',
    rank: RANK.normal, power: 0, special: 'bribe',
  }),
  grenade: A({
    id: 'grenade', name: 'Grenade', desc: 'Explosives ignore armour and paperwork.',
    mp: 6, rank: RANK.normal, power: 1.3, target: 'enemies', pierce: true, alwaysHits: true,
  }),
  luckySeven: A({
    id: 'luckySeven', name: 'Lucky 7777', desc: 'Seven fast hits at seven-tenths power.',
    mp: 22, rank: RANK.skill, power: 0.7, hits: 7, pierce: true,
  }),

  /* ── Copi — copies whatever is working ──────────────────────────────── */
  lancet: A({
    id: 'lancet', name: 'Copy Trade', desc: 'Drain HP and MP, and learn what they are doing.',
    rank: RANK.normal, power: 0.6, drain: 'both', special: 'lancet',
  }),
  jump: A({
    id: 'jump', name: 'Moonshot', desc: 'Leave the field entirely, then land on somebody.',
    mp: 10, rank: RANK.skill, power: 2.1, special: 'jump', alwaysHits: true,
  }),
  seedCannon: A({ id: 'seedCannon', name: 'Seed Round', kind: 'magic', mp: 10, rank: RANK.skill, power: 1.6, desc: 'Learned. Fires early-investor allocation at one target.' }),
  stoneBreath: A({ id: 'stoneBreath', name: 'Cold Wallet Breath', kind: 'magic', mp: 14, rank: RANK.skill, power: 1.4, target: 'enemies', element: 'ice', desc: 'Learned. Freezes everything solid.' }),
  aquaBreath: A({ id: 'aquaBreath', name: 'Liquidity Breath', kind: 'magic', mp: 16, rank: RANK.skill, power: 1.8, target: 'enemies', element: 'water', desc: 'Learned. Drowns the room.' }),
  novaRage: A({ id: 'novaRage', name: 'Nova', kind: 'magic', mp: 40, rank: RANK.heavy, power: 4.2, target: 'enemies', desc: 'Learned from something that should not have been fought.' }),

  /* ── enemy-side ─────────────────────────────────────────────────────── */
  enemyStrike: A({ id: 'enemyStrike', name: 'Strike', rank: RANK.normal, power: 1, desc: '' }),
  enemyMaul: A({ id: 'enemyMaul', name: 'Maul', rank: RANK.skill, power: 1.35, desc: '' }),
  enemySweep: A({ id: 'enemySweep', name: 'Sweep', rank: RANK.skill, power: 1.1, target: 'enemies', desc: '' }),
  enemySpell: A({ id: 'enemySpell', name: 'Hex Bolt', kind: 'magic', rank: RANK.spell, power: 1.15, desc: '' }),
  enemyDump: A({
    id: 'enemyDump', name: 'Dump', rank: RANK.heavy, power: 1.5, target: 'enemies', desc: '',
  }),
  enemyPoison: A({
    id: 'enemyPoison', name: 'Toxic Emission', kind: 'magic', rank: RANK.spell, power: 0.8,
    inflict: [{ status: 'poison', chance: 0.8, turns: 99 }], desc: '',
  }),
  enemySilence: A({
    id: 'enemySilence', name: 'Cease & Desist', kind: 'magic', rank: RANK.spell, power: 0.5,
    inflict: [{ status: 'silence', chance: 0.8, turns: 8 }], desc: '',
  }),
  enemySlow: A({
    id: 'enemySlow', name: 'Network Congestion', kind: 'magic', rank: RANK.spell, power: 0.4,
    target: 'enemies', inflict: [{ status: 'slow', chance: 0.6, turns: 8 }], desc: '',
  }),
  enemyDoom: A({
    id: 'enemyDoom', name: 'Unstake', kind: 'magic', rank: RANK.spell, power: 0,
    inflict: [{ status: 'doom', chance: 1, turns: 6 }], desc: '',
  }),
  enemyHeal: A({
    id: 'enemyHeal', name: 'Buy Wall', kind: 'heal', rank: RANK.spell, target: 'ally', power: 2,
    desc: '',
  }),
  enemyBuff: A({
    id: 'enemyBuff', name: 'Marketing Budget', kind: 'support', rank: RANK.quick, target: 'allies',
    bless: [{ status: 'haste', turns: 8 }], desc: '',
  }),
  enemyDrain: A({
    id: 'enemyDrain', name: 'Extract Value', kind: 'magic', rank: RANK.spell, power: 1.2,
    drain: 'hp', desc: '',
  }),
  enemyUltima: A({
    id: 'enemyUltima', name: 'Total Dilution', kind: 'magic', rank: RANK.heavy, power: 1.3,
    target: 'enemies', desc: '',
  }),
  enemyPierce: A({
    id: 'enemyPierce', name: 'Liquidation', rank: RANK.skill, power: 1.5, pierce: true, desc: '',
  }),
};

export function ability(id) {
  const a = ABILITIES[id];
  if (!a) throw new Error('unknown ability: ' + id);
  return a;
}
