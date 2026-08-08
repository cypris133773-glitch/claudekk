// The seven. Base stats are deliberately small — almost all growth comes off
// the Stake Grid, the way it should.
//
// Each one exists to beat an enemy the others cannot: Wojak alone can touch a
// flyer, Audit alone opens armour, Luna alone kills a shell, Rugku alone
// handles machina, Dipus alone catches something faster than he is. That is
// the whole reason swapping mid-fight is free.

export const CHARACTERS = {
  dipus: {
    id: 'dipus',
    name: 'Dipus',
    epithet: 'Bought the Top of a Dream',
    role: 'Tempo · Buffs · Turn-order manipulation',
    counters: 'agile',
    counterNote: 'Fast enough to actually connect with anything twitchy.',
    bio: 'Star of Zanarcade, a city that turned out to be a testnet somebody forgot to shut down. Woke up a thousand days later, still holding.',
    weapon: 'Longsword ("Brotherhood, Non-Custodial")',
    palette: { main: '#4ee0e6', trim: '#f5c66b', dark: '#0e3a54', hair: '#f2d98a' },
    build: { height: 0.96, cloak: 'jacket', hair: 'spiky', arm: 'sword' },
    base: { hp: 420, mp: 24, str: 15, def: 12, mag: 10, mdef: 10, agi: 22, acc: 24, eva: 18, luck: 18 },
    starting: ['cheer', 'frontRun', 'haste'],
    overdrive: {
      type: 'timing', name: 'Swordplay',
      flavour: 'Hit the window. Miss it and you have simply attacked.',
      moves: [
        { id: 'spiralDump', name: 'Spiral Dump', power: 3.2, hits: 1, at: 0 },
        { id: 'sliceAndDump', name: 'Slice & Dump', power: 1.1, hits: 6, at: 1 },
        { id: 'blitzAirdrop', name: 'Blitz Airdrop', power: 1.4, hits: 9, at: 2, pierce: true },
      ],
    },
  },

  yield: {
    id: 'yield',
    name: 'Yield',
    epithet: 'Summoner of Airdrops',
    role: 'Healing · Buffs · Summoning',
    counters: 'undead',
    counterNote: 'Healing an exit-scammed thing hurts it. A lot.',
    bio: 'Daughter of the summoner who bought the last Calm. Raised to spend herself so the chart can go up for a while. Has read the whitepaper. All of it.',
    weapon: 'Staff ("Nirvana, 5555-day lock")',
    palette: { main: '#f4f7ff', trim: '#a06bff', dark: '#3a2a6b', hair: '#5b4a2e' },
    build: { height: 0.94, cloak: 'obi', hair: 'long', arm: 'staff' },
    base: { hp: 360, mp: 56, str: 9, def: 10, mag: 20, mdef: 24, agi: 14, acc: 14, eva: 10, luck: 17 },
    starting: ['cure', 'esuna', 'protectSpell'],
    overdrive: {
      type: 'menu', name: 'Grand Summon',
      flavour: 'Call an airdrop in with its gauge already full.',
    },
  },

  audit: {
    id: 'audit',
    name: 'Audit',
    epithet: 'Unsent Since 2018',
    role: 'Armour breaking · Enormous slow damage',
    counters: 'armored',
    counterNote: 'His blade opens armour and his Breaks keep it open.',
    bio: 'Technically dead. Never got round to being sent, because he has one more thing to say about the tokenomics and nobody has let him finish.',
    weapon: 'Odachi ("Masamune, Notarised")',
    palette: { main: '#c0392b', trim: '#2b2f3a', dark: '#4a1410', hair: '#20242e' },
    build: { height: 1.08, cloak: 'coat', hair: 'tail', arm: 'odachi' },
    base: { hp: 620, mp: 22, str: 20, def: 18, mag: 8, mdef: 12, agi: 9, acc: 12, eva: 4, luck: 16 },
    starting: ['armorBreak', 'powerBreak'],
    overdrive: {
      type: 'timing', name: 'Due Diligence',
      flavour: 'He reads it out. It is not survivable.',
      moves: [
        { id: 'coldRead', name: 'Cold Read', power: 3.4, hits: 1, at: 0, pierce: true },
        { id: 'delistingBlade', name: 'Delisting Blade', power: 2.6, hits: 1, at: 1, pierce: true, drainMp: true },
        { id: 'bearMarket', name: 'Bear Market', power: 2.2, hits: 1, at: 2, all: true, pierce: true },
        { id: 'exitLiquidity', name: 'Exit Liquidity', power: 5.5, hits: 1, at: 3, pierce: true },
      ],
    },
  },

  wojak: {
    id: 'wojak',
    name: 'Wojak',
    epithet: 'Guardian, Believer, Bagholder',
    role: 'Ranged · Status · Anti-air',
    counters: 'flying',
    counterNote: 'Everyone else swings at the air. He throws.',
    bio: 'Blitzchain veteran. Third generation of the Church of the Ticker. Would take a bullet for you and would also very much like to explain T-shares.',
    weapon: 'Blitzball ("World Champion, unaudited")',
    palette: { main: '#f2b134', trim: '#2f6fd0', dark: '#6b3a12', hair: '#e04a2f' },
    build: { height: 1.0, cloak: 'vest', hair: 'flame', arm: 'ball' },
    base: { hp: 500, mp: 20, str: 16, def: 14, mag: 8, mdef: 12, agi: 13, acc: 30, eva: 8, luck: 20 },
    starting: ['ballThrow', 'fudBuster'],
    overdrive: {
      type: 'reels', name: 'Pump Reels',
      flavour: 'Stop three reels on the ticker. Nobody has ever explained why this works.',
    },
  },

  luna: {
    id: 'luna',
    name: 'Luna',
    epithet: 'Black Mage of the Death Spiral',
    role: 'Elemental magic · Shell breaking',
    counters: 'shelled',
    counterNote: 'Things with a hard shell have a soft interior and she knows the address.',
    bio: 'Her last algorithm was beautiful, self-correcting, and cost forty billion dollars. She has since gone into direct damage instead.',
    weapon: 'Moogle ("collateral")',
    palette: { main: '#7b2d8e', trim: '#ff58c8', dark: '#1b0e2a', hair: '#1b1b22' },
    build: { height: 0.95, cloak: 'gown', hair: 'bun', arm: 'doll' },
    base: { hp: 340, mp: 60, str: 8, def: 8, mag: 24, mdef: 22, agi: 11, acc: 12, eva: 12, luck: 17 },
    starting: ['fire', 'blizzard', 'thunder', 'water'],
    overdrive: {
      type: 'mash', name: 'Fury',
      flavour: 'Cast it until your thumb gives out.',
    },
  },

  copi: {
    id: 'copi',
    name: 'Copi',
    epithet: 'Ronso of the Copy Trade',
    role: 'Flexible · Learns enemy moves',
    counters: 'none',
    counterNote: 'Good at everything, best at nothing, which is its own strategy.',
    bio: 'Ronso do not read charts. Ronso watch what winner does, then Ronso do that, but louder and eleven minutes late.',
    weapon: 'Spear ("Longinus, leveraged 3×")',
    palette: { main: '#6fa8ff', trim: '#e6ecff', dark: '#1c2c52', hair: '#c9d6ff' },
    build: { height: 1.14, cloak: 'pelt', hair: 'horn', arm: 'spear' },
    base: { hp: 480, mp: 28, str: 17, def: 15, mag: 14, mdef: 14, agi: 15, acc: 18, eva: 12, luck: 16 },
    starting: ['lancet', 'jump'],
    overdrive: {
      type: 'mash', name: 'Ronso Rage',
      flavour: 'Everything he has copied, at once.',
    },
  },

  rugku: {
    id: 'rugku',
    name: 'Rugku',
    epithet: 'Dev, Heretic, Reader of Source',
    role: 'Stealing · Items · Anti-machina',
    counters: 'machina',
    counterNote: 'She knows where the mint function is because she has read it.',
    bio: 'One of the Devs — the tribe the Church calls heretics for the crime of decompiling the contract. Speaks in a language the faithful refuse to learn: solidity.',
    weapon: 'Claw ("Godhand, self-custodied")',
    palette: { main: '#7ee081', trim: '#f5c66b', dark: '#173a20', hair: '#e8d27a' },
    build: { height: 0.9, cloak: 'goggles', hair: 'braid', arm: 'claw' },
    base: { hp: 400, mp: 30, str: 12, def: 12, mag: 12, mdef: 14, agi: 20, acc: 20, eva: 22, luck: 19 },
    starting: ['steal', 'grenade'],
    overdrive: {
      type: 'mix', name: 'Mix',
      flavour: 'Two items in the blender. Nobody signs off on the result.',
    },
  },
};

export const PARTY_ORDER = ['dipus', 'yield', 'audit', 'wojak', 'luna', 'copi', 'rugku'];

export function characterList() {
  return PARTY_ORDER.map((id) => CHARACTERS[id]);
}
