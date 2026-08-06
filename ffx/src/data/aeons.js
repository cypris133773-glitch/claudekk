// Airdrops — the things a summoner spends herself to call down.
//
// A summoned airdrop replaces the entire party: it takes the summoner's place
// in the turn order and everyone else waits outside. It has its own gauge and
// its own overdrive, and when it dies the party comes back looking sheepish.

export const AEONS = {
  vaporwyrm: {
    id: 'vaporwyrm', name: 'Vaporwyrm', epithet: 'The Roadmap',
    tier: 1,
    desc: 'A bird of pure forward-looking statement. Q3, probably.',
    palette: { main: '#8fd6ff', trim: '#f5c66b', dark: '#123a58' },
    build: { shape: 'wyrm', scale: 1.15 },
    base: { hp: 1400, mp: 60, str: 20, def: 14, mag: 22, mdef: 16, agi: 18, acc: 24, eva: 14, luck: 16 },
    abilities: ['attack', 'fire', 'blizzard', 'thunder', 'water', 'frontRun'],
    overdrive: { name: 'Roadmap Ray', power: 3.6, hits: 1, target: 'enemies', element: null },
  },
  gasfrit: {
    id: 'gasfrit', name: 'Gasfrit', epithet: 'The Fee Market',
    tier: 2,
    desc: 'Burns your transaction, then burns you, then quotes you a price for it.',
    palette: { main: '#ff7a3d', trim: '#ffd27a', dark: '#48160a' },
    build: { shape: 'brute', scale: 1.25 },
    base: { hp: 2600, mp: 50, str: 30, def: 24, mag: 20, mdef: 16, agi: 14, acc: 22, eva: 6, luck: 16 },
    abilities: ['attack', 'fire', 'fira', 'heavyStrike'],
    absorb: ['fire'], weak: ['ice'],
    overdrive: { name: 'Gas Fire', power: 4.2, hits: 1, target: 'enemies', element: 'fire' },
  },
  liquidion: {
    id: 'liquidion', name: 'Liquidion', epithet: 'The Depeg',
    tier: 3,
    desc: 'A horse made of a stablecoin at 0.94 and falling.',
    palette: { main: '#c9a6ff', trim: '#ffe98f', dark: '#2b1650' },
    build: { shape: 'steed', scale: 1.2 },
    base: { hp: 3600, mp: 70, str: 36, def: 26, mag: 30, mdef: 24, agi: 22, acc: 26, eva: 12, luck: 17 },
    abilities: ['attack', 'thunder', 'thundara', 'dispel'],
    absorb: ['thunder'], weak: ['water'],
    overdrive: { name: 'Depeg Hammer', power: 4.6, hits: 1, target: 'enemies', element: 'thunder' },
  },
  slippage: {
    id: 'slippage', name: 'Slippage', epithet: 'The Spread',
    tier: 4,
    desc: 'You asked for one price. She is the difference, and she is beautiful about it.',
    palette: { main: '#9ef0ff', trim: '#dff8ff', dark: '#0d3c50' },
    build: { shape: 'maiden', scale: 1.1 },
    base: { hp: 4400, mp: 90, str: 34, def: 26, mag: 40, mdef: 32, agi: 24, acc: 26, eva: 18, luck: 18 },
    abilities: ['attack', 'blizzard', 'blizzara', 'blizzaga', 'cura', 'frontRun'],
    absorb: ['ice'], weak: ['fire'],
    overdrive: { name: 'Diamond Hands Dust', power: 5.0, hits: 1, target: 'enemies', element: 'ice' },
  },
  yobimbo: {
    id: 'yobimbo', name: 'Yobimbo', epithet: 'The Paid Influencer',
    tier: 5,
    desc: 'Does not fight for you. Fights for the number you just sent him. Higher number, better content.',
    palette: { main: '#d8d2c4', trim: '#c0392b', dark: '#2a2620' },
    build: { shape: 'ronin', scale: 1.15 },
    base: { hp: 5200, mp: 40, str: 48, def: 34, mag: 20, mdef: 26, agi: 26, acc: 30, eva: 20, luck: 22 },
    abilities: [],
    paid: true,
    tiers: [
      { name: 'Daigoro', min: 0, power: 0.9, desc: 'He sends the dog. You paid dog money.' },
      { name: 'Kozuka', min: 0.08, power: 2.2, desc: 'A thrown coin. Adequate engagement.' },
      { name: 'Wakizashi', min: 0.2, power: 3.8, all: true, desc: 'A real thread. Everyone feels it.' },
      { name: 'Zero-Knowledge Slash', min: 0.55, power: 99, all: true, instant: true, desc: 'He deletes the encounter. No proof is offered. None is required.' },
    ],
    overdrive: { name: 'Zero-Knowledge Slash', power: 99, hits: 1, target: 'enemies', instant: true },
  },
  bagmuth: {
    id: 'bagmuth', name: 'Bagmuth', epithet: 'The Supply',
    tier: 6,
    desc: 'The dragon at the top of the emission schedule. It has always been there. It is always minting.',
    palette: { main: '#8a7bff', trim: '#ffdf8f', dark: '#1a1440' },
    build: { shape: 'dragon', scale: 1.4 },
    base: { hp: 7000, mp: 120, str: 56, def: 40, mag: 52, mdef: 40, agi: 24, acc: 30, eva: 12, luck: 20 },
    abilities: ['attack', 'firaga', 'thundaga', 'curaga', 'heavyStrike'],
    overdrive: { name: 'Mega Dilution', power: 6.4, hits: 1, target: 'enemies' },
  },
  ponzima: {
    id: 'ponzima', name: 'Ponzima', epithet: 'The Structure Itself',
    tier: 7,
    desc: 'Chained, weeping, and mathematically inevitable. Half of her is under the floor and the floor is other people.',
    palette: { main: '#4a3f6b', trim: '#ff58c8', dark: '#0b0716' },
    build: { shape: 'chained', scale: 1.35 },
    base: { hp: 9000, mp: 140, str: 72, def: 46, mag: 66, mdef: 44, agi: 22, acc: 32, eva: 10, luck: 20 },
    abilities: ['attack', 'flare', 'demi', 'bio', 'curaga'],
    resist: ['fire', 'ice', 'thunder', 'water'],
    overdrive: { name: 'Oblivion', power: 1.1, hits: 16, target: 'enemies' },
  },
};

export const AEON_ORDER = ['vaporwyrm', 'gasfrit', 'liquidion', 'slippage', 'yobimbo', 'bagmuth', 'ponzima'];

/** Airdrops scale with how far the pilgrimage has gone, not with a level. */
export function aeonStats(aeon, chapter) {
  const g = 1 + Math.max(0, chapter - aeon.tier) * 0.28;
  const s = {};
  for (const [k, v] of Object.entries(aeon.base)) {
    s[k] = k === 'hp' || k === 'mp' ? Math.round(v * g) : Math.round(v * (1 + (g - 1) * 0.55));
  }
  return s;
}
