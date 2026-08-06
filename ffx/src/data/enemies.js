// The bestiary. `kind` is the load-bearing field: it decides which of the
// seven is the right answer, and the battle engine gives a 50% bonus to
// whoever counters it.
//
//   flying   → only ranged things connect (Wojak, spells, grenades, Moonshot)
//   armored  → 28% physical until somebody opens the contract (Audit)
//   shelled  → physical does nothing at all (Luna)
//   agile    → high evasion, laughs at slow swings (Dipus)
//   machina  → reads as a machine, and one of you reads machines (Rugku)
//   undead   → healing hurts it, which is thematically perfect (Yield)

const E = (o) => ({
  kind: 'beast', mp: 40, acc: 20, eva: 4, luck: 15,
  weak: [], resist: [], immune: [], absorb: [],
  ai: [{ a: 'enemyStrike', w: 1 }],
  ap: 6, pls: 60, steal: [], drop: [],
  ...o,
});

export const ENEMIES = {
  /* ── Besold ─────────────────────────────────────────────────────────── */
  shillwasp: E({
    id: 'shillwasp', name: 'Shill Wasp', kind: 'flying', flying: true,
    desc: 'Arrives in your replies within nine seconds of any negative sentiment.',
    hp: 220, str: 10, def: 8, mag: 6, mdef: 8, agi: 20, eva: 18,
    weak: ['ice'], ap: 6, pls: 70, steal: ['copium'],
    ai: [{ a: 'enemyStrike', w: 3 }, { a: 'enemySilence', w: 1 }],
    sprite: { shape: 'wasp', palette: { main: '#f5c66b', trim: '#2b2f3a', dark: '#5a4110' } },
  }),
  bagbeast: E({
    id: 'bagbeast', name: 'Bagbeast', kind: 'beast',
    desc: 'A dog that is down 94% and still wags.',
    hp: 340, str: 14, def: 12, mag: 4, mdef: 8, agi: 12,
    ap: 6, pls: 55, steal: ['copium'],
    ai: [{ a: 'enemyStrike', w: 4 }, { a: 'enemyMaul', w: 1 }],
    sprite: { shape: 'hound', palette: { main: '#a8703c', trim: '#f0d9a8', dark: '#3a2410' } },
  }),
  floatingticker: E({
    id: 'floatingticker', name: 'Floating Ticker', kind: 'flying', flying: true,
    desc: 'A number in the air. It only goes up, it explains, going down.',
    hp: 260, str: 8, def: 8, mag: 16, mdef: 16, agi: 16, eva: 14,
    weak: ['thunder'], ap: 7, pls: 80, steal: ['gasrefill'],
    ai: [{ a: 'enemySpell', w: 3 }, { a: 'enemyStrike', w: 1 }],
    sprite: { shape: 'orb', palette: { main: '#4ee0e6', trim: '#ffffff', dark: '#0d3c50' } },
  }),
  waterflea: E({
    id: 'waterflea', name: 'Liquidity Flea', kind: 'agile',
    desc: 'Provides liquidity in the sense that it is very hard to catch.',
    hp: 200, str: 12, def: 8, mag: 6, mdef: 8, agi: 26, eva: 26,
    weak: ['thunder'], ap: 8, pls: 90,
    ai: [{ a: 'enemyStrike', w: 4 }, { a: 'enemySweep', w: 1 }],
    sprite: { shape: 'flea', palette: { main: '#7ee0c8', trim: '#e8fff8', dark: '#0f3a34' } },
  }),

  /* ── Kiliquidity ────────────────────────────────────────────────────── */
  rugmoth: E({
    id: 'rugmoth', name: 'Rugmoth', kind: 'flying', flying: true,
    desc: 'Eats the floor out from under things.',
    hp: 520, str: 20, def: 14, mag: 14, mdef: 14, agi: 22, eva: 20,
    weak: ['ice'], ap: 12, pls: 140, steal: ['detox', 'copium'],
    ai: [{ a: 'enemyStrike', w: 3 }, { a: 'enemyPoison', w: 2 }],
    sprite: { shape: 'moth', palette: { main: '#c58fff', trim: '#ffe6a8', dark: '#2a1348' } },
  }),
  copeplant: E({
    id: 'copeplant', name: 'Copeplant', kind: 'beast',
    desc: 'Roots deep, spreads fast, and thrives entirely on being watered with reasons.',
    hp: 700, str: 22, def: 18, mag: 12, mdef: 16, agi: 9,
    weak: ['fire'], ap: 14, pls: 130, steal: ['detox'],
    ai: [{ a: 'enemyPoison', w: 3 }, { a: 'enemyStrike', w: 2 }],
    sprite: { shape: 'plant', palette: { main: '#6cbf5a', trim: '#f5f57a', dark: '#1c3a14' } },
  }),
  diamondape: E({
    id: 'diamondape', name: 'Diamond Ape', kind: 'beast',
    desc: 'Cannot sell. Physically cannot. The hands have fused.',
    hp: 900, str: 30, def: 22, mag: 4, mdef: 10, agi: 12,
    ap: 16, pls: 180, steal: ['hopium'],
    ai: [{ a: 'enemyMaul', w: 3 }, { a: 'enemyStrike', w: 2 }],
    sprite: { shape: 'brute', palette: { main: '#9ec7ff', trim: '#ffffff', dark: '#1c2c52' } },
  }),
  botswarm: E({
    id: 'botswarm', name: 'Engagement Farm', kind: 'machina', machina: true, armored: true,
    desc: 'Nine thousand accounts, one man, one prompt.',
    hp: 640, str: 18, def: 34, mag: 10, mdef: 20, agi: 16,
    weak: ['thunder'], ap: 15, pls: 200, steal: ['grenade'],
    ai: [{ a: 'enemySweep', w: 3 }, { a: 'enemyStrike', w: 2 }],
    sprite: { shape: 'drone', palette: { main: '#8d97b5', trim: '#4ee0e6', dark: '#171c2c' } },
  }),

  /* ── Lucre & the Highroad ───────────────────────────────────────────── */
  vaultmimic: E({
    id: 'vaultmimic', name: 'Vault Mimic', kind: 'armored', armored: true,
    desc: 'Looks exactly like a treasury. Is a mouth.',
    hp: 1100, str: 28, def: 60, mag: 12, mdef: 24, agi: 10,
    ap: 20, pls: 400, steal: ['hopium', 'multisig'],
    ai: [{ a: 'enemyMaul', w: 3 }, { a: 'enemyPierce', w: 1 }],
    sprite: { shape: 'chest', palette: { main: '#c9a24a', trim: '#ffe9a8', dark: '#3a2a0e' } },
  }),
  paidshill: E({
    id: 'paidshill', name: 'Paid Shill', kind: 'agile',
    desc: 'Disclosure in the bio, in white, on white, 4pt.',
    hp: 760, str: 20, def: 18, mag: 22, mdef: 22, agi: 24, eva: 22,
    ap: 18, pls: 260, steal: ['chartpaper', 'tshare'],
    ai: [{ a: 'enemyBuff', w: 2 }, { a: 'enemySpell', w: 2 }, { a: 'enemyHeal', w: 1 }],
    sprite: { shape: 'shill', palette: { main: '#ff58c8', trim: '#ffe98f', dark: '#3a0e2a' } },
  }),
  sentrynode: E({
    id: 'sentrynode', name: 'Sentry Node', kind: 'machina', machina: true, armored: true,
    desc: 'Validates nothing. Charges for it.',
    hp: 1000, str: 26, def: 52, mag: 16, mdef: 26, agi: 14,
    weak: ['thunder'], ap: 22, pls: 320, steal: ['lightningmarble'],
    ai: [{ a: 'enemyPierce', w: 2 }, { a: 'enemyStrike', w: 3 }],
    sprite: { shape: 'drone', palette: { main: '#5f6b8e', trim: '#a06bff', dark: '#12162a' } },
  }),
  gaswraith: E({
    id: 'gaswraith', name: 'Gas Wraith', kind: 'agile',
    desc: 'Appears at the exact moment you press confirm.',
    hp: 820, str: 26, def: 20, mag: 20, mdef: 24, agi: 30, eva: 30,
    weak: ['holy'], ap: 20, pls: 280,
    ai: [{ a: 'enemyStrike', w: 3 }, { a: 'enemyDrain', w: 2 }],
    sprite: { shape: 'wraith', palette: { main: '#b7a6ff', trim: '#ffffff', dark: '#20174a' } },
  }),
  paperGolem: E({
    id: 'paperGolem', name: 'Whitepaper Golem', kind: 'armored', armored: true,
    desc: 'Forty pages. Two of them are a graph of itself.',
    hp: 1500, str: 32, def: 70, mag: 14, mdef: 30, agi: 8,
    weak: ['fire'], ap: 26, pls: 380, steal: ['bombcore'],
    ai: [{ a: 'enemyMaul', w: 3 }, { a: 'enemySweep', w: 1 }],
    sprite: { shape: 'golem', palette: { main: '#e8e2cf', trim: '#c9a24a', dark: '#3c382c' } },
  }),

  /* ── Slam Forest & Liquidation Plains ───────────────────────────────── */
  moderator: E({
    id: 'moderator', name: 'Community Moderator', kind: 'agile',
    desc: 'Deletes the question rather than answer it.',
    hp: 1200, str: 26, def: 24, mag: 30, mdef: 30, agi: 26, eva: 24,
    ap: 26, pls: 340, steal: ['remedy'],
    ai: [{ a: 'enemySilence', w: 3 }, { a: 'enemySpell', w: 2 }],
    sprite: { shape: 'shill', palette: { main: '#4a5bd8', trim: '#e8ecff', dark: '#101640' } },
  }),
  chartghost: E({
    id: 'chartghost', name: 'Chart Ghost', kind: 'undead', undead: true,
    desc: 'The candle from 2021 that everyone still trades against.',
    hp: 1000, str: 30, def: 22, mag: 28, mdef: 26, agi: 18,
    weak: ['holy'], resist: ['ice'], ap: 28, pls: 300,
    ai: [{ a: 'enemyDrain', w: 2 }, { a: 'enemyStrike', w: 2 }, { a: 'enemyDoom', w: 1 }],
    sprite: { shape: 'wraith', palette: { main: '#7bd6a8', trim: '#dfffe9', dark: '#0e2a1e' } },
  }),
  liquidationbolt: E({
    id: 'liquidationbolt', name: 'Liquidation Bolt', kind: 'flying', flying: true,
    desc: 'It finds your position. It always finds your position.',
    hp: 1300, str: 34, def: 26, mag: 34, mdef: 28, agi: 30, eva: 24,
    absorb: ['thunder'], weak: ['water'], ap: 32, pls: 420, steal: ['lightningmarble'],
    ai: [{ a: 'enemySpell', w: 3 }, { a: 'enemyPierce', w: 2 }],
    sprite: { shape: 'bolt', palette: { main: '#ffe98f', trim: '#ffffff', dark: '#4a3a08' } },
  }),
  tickertuar: E({
    id: 'tickertuar', name: 'Tickertuar', kind: 'agile',
    desc: 'Runs away constantly and hits for exactly 10,000. Nobody knows why it is 10,000.',
    hp: 900, str: 20, def: 40, mag: 20, mdef: 40, agi: 44, eva: 44, luck: 30,
    ap: 90, pls: 2500, drop: [{ item: 'whaleSphere', chance: 0.5 }],
    ai: [{ a: 'enemyPierce', w: 1 }],
    fixedDamage: 10000,
    sprite: { shape: 'cactus', palette: { main: '#7ee081', trim: '#f5c66b', dark: '#173a20' } },
  }),

  /* ── Macrolania & the Sand Chain ────────────────────────────────────── */
  coldwallet: E({
    id: 'coldwallet', name: 'Cold Wallet', kind: 'armored', armored: true,
    desc: 'Perfectly secure. The seed phrase was in the house that burned down.',
    hp: 2000, str: 40, def: 80, mag: 20, mdef: 34, agi: 12,
    absorb: ['ice'], weak: ['fire'], ap: 40, pls: 520, steal: ['arcticwind', 'multisig'],
    ai: [{ a: 'enemyMaul', w: 3 }, { a: 'enemySpell', w: 1 }],
    sprite: { shape: 'chest', palette: { main: '#9ef0ff', trim: '#ffffff', dark: '#0d3c50' } },
  }),
  stableflan: E({
    id: 'stableflan', name: 'Stablecoin Flan', kind: 'shelled', physImmune: true,
    desc: 'Pegged. Wobbling. Physically cannot be hit, only argued with.',
    hp: 1800, str: 20, def: 200, mag: 40, mdef: 20, agi: 14,
    weak: ['thunder'], ap: 44, pls: 600, steal: ['gasrefill'],
    ai: [{ a: 'enemySpell', w: 3 }, { a: 'enemyDrain', w: 1 }],
    sprite: { shape: 'flan', palette: { main: '#8fd6ff', trim: '#e6faff', dark: '#12406b' } },
  }),
  miningrig: E({
    id: 'miningrig', name: 'Mining Rig', kind: 'machina', machina: true, armored: true,
    desc: 'Warms a garage in Texas. Secures a chain that settles nothing.',
    hp: 2400, str: 44, def: 84, mag: 20, mdef: 30, agi: 16,
    weak: ['thunder', 'water'], ap: 48, pls: 700, steal: ['turbogas'],
    ai: [{ a: 'enemyPierce', w: 3 }, { a: 'enemySweep', w: 2 }],
    sprite: { shape: 'drone', palette: { main: '#b5bccf', trim: '#ff7a3d', dark: '#20242e' } },
  }),
  vulturebot: E({
    id: 'vulturebot', name: 'Vulture Bot', kind: 'flying', flying: true,
    desc: 'Circles wallets that have stopped moving.',
    hp: 2600, str: 48, def: 34, mag: 24, mdef: 30, agi: 26, eva: 22,
    weak: ['thunder'], ap: 50, pls: 760,
    ai: [{ a: 'enemyMaul', w: 3 }, { a: 'enemySweep', w: 2 }],
    sprite: { shape: 'wyrm', palette: { main: '#8d97b5', trim: '#c0392b', dark: '#171c2c' } },
  }),

  /* ── Bagvelle, Gasprice, the Ruins ──────────────────────────────────── */
  templar: E({
    id: 'templar', name: 'Templar of the Ticker', kind: 'armored', armored: true,
    desc: 'Sworn to protect the price. Armed accordingly.',
    hp: 3000, str: 54, def: 90, mag: 26, mdef: 40, agi: 18,
    ap: 60, pls: 900, steal: ['hopium'],
    ai: [{ a: 'enemyPierce', w: 3 }, { a: 'enemyMaul', w: 2 }],
    sprite: { shape: 'templar', palette: { main: '#c9a24a', trim: '#f7f0d8', dark: '#3a2a0e' } },
  }),
  choir: E({
    id: 'choir', name: 'Choir of the Ticker', kind: 'shelled', physImmune: true,
    desc: 'Sings the ticker. Only the ticker. For eleven hours.',
    hp: 2600, str: 20, def: 200, mag: 60, mdef: 34, agi: 20,
    weak: ['holy'], ap: 62, pls: 850,
    ai: [{ a: 'enemySpell', w: 3 }, { a: 'enemyHeal', w: 2 }, { a: 'enemySlow', w: 1 }],
    sprite: { shape: 'choir', palette: { main: '#f5c66b', trim: '#ffffff', dark: '#2a1d06' } },
  }),
  ronsodeserter: E({
    id: 'ronsodeserter', name: 'Ronso Deserter', kind: 'beast',
    desc: 'Left the mountain when the mountain started posting.',
    hp: 3400, str: 62, def: 46, mag: 20, mdef: 34, agi: 22,
    ap: 66, pls: 950,
    ai: [{ a: 'enemyMaul', w: 3 }, { a: 'enemyPierce', w: 2 }],
    sprite: { shape: 'brute', palette: { main: '#6fa8ff', trim: '#e6ecff', dark: '#1c2c52' } },
  }),
  grifter: E({
    id: 'grifter', name: 'Grifter', kind: 'agile',
    desc: 'On its ninth rebrand. The wallet has never changed.',
    hp: 3200, str: 58, def: 40, mag: 44, mdef: 40, agi: 34, eva: 30,
    ap: 70, pls: 1100, steal: ['elixir', 'sacrificeReceipt'],
    ai: [{ a: 'enemyDrain', w: 2 }, { a: 'enemyStrike', w: 2 }, { a: 'enemyBuff', w: 1 }],
    sprite: { shape: 'shill', palette: { main: '#a06bff', trim: '#ffe98f', dark: '#1b0e2a' } },
  }),
  spirallarva: E({
    id: 'spirallarva', name: 'Spiral Larva', kind: 'undead', undead: true,
    desc: 'A holder who never sold, digested, and still bullish.',
    hp: 4000, str: 70, def: 48, mag: 50, mdef: 44, agi: 24,
    weak: ['holy'], ap: 80, pls: 1300,
    ai: [{ a: 'enemyDrain', w: 2 }, { a: 'enemyMaul', w: 2 }, { a: 'enemyDoom', w: 1 }],
    sprite: { shape: 'larva', palette: { main: '#6b4a8e', trim: '#ff58c8', dark: '#160a24' } },
  }),
  unsentmaester: E({
    id: 'unsentmaester', name: 'Unsent Maester', kind: 'undead', undead: true,
    desc: 'Exit-scammed years ago. Still posts daily. Engagement is up.',
    hp: 4600, str: 66, def: 52, mag: 66, mdef: 52, agi: 26,
    weak: ['holy'], resist: ['fire', 'ice'], ap: 88, pls: 1600, steal: ['tshare'],
    ai: [{ a: 'enemySpell', w: 3 }, { a: 'enemyDoom', w: 1 }, { a: 'enemyHeal', w: 1 }],
    sprite: { shape: 'maester', palette: { main: '#3f7bd8', trim: '#c9a24a', dark: '#0e1a3a' } },
  }),
  exitliquidity: E({
    id: 'exitliquidity', name: 'Exit Liquidity', kind: 'beast',
    desc: 'It is you. Not you specifically. Statistically you.',
    hp: 5200, str: 78, def: 56, mag: 40, mdef: 44, agi: 28,
    ap: 100, pls: 2000,
    ai: [{ a: 'enemyMaul', w: 3 }, { a: 'enemyDump', w: 1 }],
    sprite: { shape: 'larva', palette: { main: '#c0392b', trim: '#f5c66b', dark: '#2a0a08' } },
  }),
};

/* ── Bosses ───────────────────────────────────────────────────────────── */

const B = (o) => E({ boss: true, ap: 200, pls: 1200, ...o });

export const BOSSES = {
  ammes: B({
    id: 'ammes', name: 'Whalespawn: AMMES', kind: 'beast',
    desc: 'The first thing the Whale coughs up. It only knows one move and the move is "everyone loses 25%".',
    hp: 1200, str: 18, def: 14, mag: 22, mdef: 16, agi: 14,
    ap: 40, pls: 200,
    ai: [{ a: 'demi', w: 3 }, { a: 'enemyStrike', w: 2 }],
    sprite: { shape: 'larva', palette: { main: '#7b2d8e', trim: '#ff58c8', dark: '#180a24' }, scale: 1.5 },
    intro: 'It does not attack you. It reduces you. Proportionally. Forever.',
  }),
  klikk: B({
    id: 'klikk', name: 'RUGBOT KLIKK', kind: 'machina', machina: true, armored: true,
    desc: 'A salvage bot repurposed to salvage you.',
    hp: 1800, str: 26, def: 48, mag: 10, mdef: 20, agi: 14,
    weak: ['thunder'], ap: 60, pls: 400, steal: ['grenade'],
    ai: [{ a: 'enemyStrike', w: 3 }, { a: 'enemySweep', w: 2, when: { hpBelow: 0.5 } }],
    sprite: { shape: 'drone', palette: { main: '#7ee081', trim: '#f5c66b', dark: '#173a20' }, scale: 1.4 },
    intro: 'Rugku shouts something in Dev. It is almost certainly "the armour is a lie".',
  }),
  tros: B({
    id: 'tros', name: 'TROS, the Wash Trader', kind: 'agile',
    desc: 'Trades with itself at increasing prices and then charges at you.',
    hp: 2200, str: 32, def: 28, mag: 16, mdef: 22, agi: 30, eva: 28,
    weak: ['thunder'], ap: 70, pls: 450,
    ai: [{ a: 'enemyStrike', w: 3 }, { a: 'enemyPierce', w: 2, when: { hpBelow: 0.6 } }],
    sprite: { shape: 'squid', palette: { main: '#2f6fd0', trim: '#9ef0ff', dark: '#0a2444' }, scale: 1.4 },
    intro: 'Volume: enormous. Participants: one.',
  }),
  echuilles: B({
    id: 'echuilles', name: 'Whalespawn: ECHUILLES', kind: 'beast',
    desc: 'Cuts the party in half and drains what is left. Standard.',
    hp: 3400, str: 44, def: 32, mag: 30, mdef: 28, agi: 24,
    weak: ['thunder'], ap: 110, pls: 700,
    ai: [{ a: 'enemyDrain', w: 2 }, { a: 'enemySweep', w: 2 }, { a: 'enemyMaul', w: 2 }],
    sprite: { shape: 'squid', palette: { main: '#1b6b6b', trim: '#7ee0c8', dark: '#052222' }, scale: 1.5 },
    intro: 'Kiliquidity is still smoking. Something in the water is very pleased about it.',
  }),
  oblitzerator: B({
    id: 'oblitzerator', name: 'THE OBLITZERATOR', kind: 'machina', machina: true, armored: true,
    desc: 'A stadium crane holding a magnet holding a crowd.',
    hp: 4200, str: 50, def: 96, mag: 20, mdef: 30, agi: 12,
    weak: ['thunder'], ap: 140, pls: 900, steal: ['lightningmarble'],
    ai: [{ a: 'enemySweep', w: 3 }, { a: 'enemyPierce', w: 2 }],
    sprite: { shape: 'crane', palette: { main: '#8d97b5', trim: '#f2b134', dark: '#171c2c' }, scale: 1.6 },
    intro: 'Rugku is already climbing it. She has seen the schematics. She wrote a bug report about them.',
  }),
  gui: B({
    id: 'gui', name: 'Whalespawn: G.U.I.', kind: 'armored', armored: true,
    desc: 'A friendly front-end bolted onto something enormous and hostile.',
    hp: 5600, str: 58, def: 92, mag: 44, mdef: 40, agi: 16,
    ap: 180, pls: 1100,
    ai: [{ a: 'enemyPierce', w: 2 }, { a: 'enemySpell', w: 2 }, { a: 'enemyDump', w: 1, when: { hpBelow: 0.4 } }],
    sprite: { shape: 'golem', palette: { main: '#4a5bd8', trim: '#c9a24a', dark: '#0e1240' }, scale: 1.7 },
    intro: 'The interface is lovely. Rounded corners. Behind it, the arms.',
  }),
  extractor: B({
    id: 'extractor', name: 'THE EXTRACTOR', kind: 'flying', flying: true, machina: true,
    desc: 'Hovers out of reach and takes a percentage of everything below it.',
    hp: 6200, str: 62, def: 44, mag: 50, mdef: 44, agi: 30, eva: 26,
    weak: ['thunder'], ap: 200, pls: 1300,
    ai: [{ a: 'enemySpell', w: 2 }, { a: 'enemyDrain', w: 2 }, { a: 'enemySweep', w: 1 }],
    sprite: { shape: 'crane', palette: { main: '#5f6b8e', trim: '#4ee0e6', dark: '#12162a' }, scale: 1.5 },
    intro: 'Nothing on the ground can reach it. Wojak cracks his knuckles.',
  }),
  tokenomorph: B({
    id: 'tokenomorph', name: 'THE TOKENOMORPH', kind: 'shelled', physImmune: true,
    desc: 'Changes which element it absorbs every time you get it right. The tokenomics update accordingly.',
    hp: 7000, str: 40, def: 200, mag: 70, mdef: 40, agi: 20,
    ap: 240, pls: 1500,
    morph: true,
    ai: [{ a: 'enemySpell', w: 3 }, { a: 'enemySlow', w: 1 }],
    sprite: { shape: 'flan', palette: { main: '#a06bff', trim: '#ffe98f', dark: '#1b0e2a' }, scale: 1.5 },
    intro: 'Every time you find the weakness, the weakness is revised. Version 2. Version 3. Version 3.1.',
  }),
  heartIce: B({
    id: 'heartIce', name: 'MAESTER RICHARD HEART', kind: 'agile',
    desc: 'Fights beside a summoned "guardian" that he calls his best friend and refers to, out loud, as a product.',
    hp: 9000, str: 66, def: 50, mag: 74, mdef: 50, agi: 28, eva: 18,
    resist: ['ice'], ap: 320, pls: 2200, steal: ['tshare', 'elixir'],
    ai: [{ a: 'enemySpell', w: 3 }, { a: 'enemyBuff', w: 1 }, { a: 'enemyUltima', w: 1, when: { hpBelow: 0.45 } }],
    sprite: { shape: 'maester', palette: { main: '#3f7bd8', trim: '#c9a24a', dark: '#0a1030' }, scale: 1.5 },
    intro: '"I am not selling. I am providing an exit for people who no longer believe. It is a service."',
  }),
  crawler: B({
    id: 'crawler', name: 'THE CRAWLER', kind: 'machina', machina: true, armored: true,
    desc: 'Drags a cable behind it that switches off magic within the whole arena.',
    hp: 8000, str: 70, def: 120, mag: 30, mdef: 40, agi: 20,
    weak: ['thunder'], ap: 280, pls: 1800,
    negator: true,
    ai: [{ a: 'enemyPierce', w: 3 }, { a: 'enemySweep', w: 2 }],
    sprite: { shape: 'crane', palette: { main: '#7d8398', trim: '#c0392b', dark: '#191d28' }, scale: 1.7 },
    intro: 'Its cable hums. Somewhere behind it, magic stops being available to anybody who is not the Church.',
  }),
  evrae: B({
    id: 'evrae', name: 'EVRAE, Auditor of the Church', kind: 'flying', flying: true,
    desc: 'The Church keeps one real auditor. It is a dragon. It is chained to the bridge and it has never filed a report.',
    hp: 10000, str: 76, def: 56, mag: 66, mdef: 52, agi: 30, eva: 24,
    resist: ['fire'], ap: 340, pls: 2400,
    ai: [{ a: 'enemySpell', w: 2 }, { a: 'enemyPoison', w: 2 }, { a: 'enemyDump', w: 1 }],
    sprite: { shape: 'dragon', palette: { main: '#6cbf5a', trim: '#f5f57a', dark: '#123214' }, scale: 1.8 },
    intro: 'It circles the bridge. It has questions about the treasury and no mouth to ask them politely.',
  }),
  heartNatus: B({
    id: 'heartNatus', name: 'RICHARD HEART: NATUS', kind: 'undead', undead: true,
    desc: 'Dead and rebranded. The new version has more features and fewer answers.',
    hp: 13000, str: 82, def: 62, mag: 90, mdef: 60, agi: 30,
    weak: ['holy'], ap: 420, pls: 3000, steal: ['sacrificeReceipt'],
    ai: [{ a: 'enemyUltima', w: 2 }, { a: 'enemySpell', w: 2 }, { a: 'enemyDoom', w: 1 }, { a: 'enemyHeal', w: 1 }],
    sprite: { shape: 'maester', palette: { main: '#7b2d8e', trim: '#ffe98f', dark: '#180a24' }, scale: 1.7 },
    intro: '"Death is just a very long lock-up period. I have simply chosen the maximum term."',
  }),
  biranYenke: B({
    id: 'biranYenke', name: 'BIRAN & YENKE', kind: 'beast',
    desc: 'Two Ronso who will explain that copy trading is not a personality.',
    hp: 11000, str: 76, def: 70, mag: 40, mdef: 52, agi: 26,
    ap: 400, pls: 2600,
    ai: [{ a: 'enemyMaul', w: 3 }, { a: 'enemyBuff', w: 1 }, { a: 'enemySweep', w: 2 }],
    sprite: { shape: 'brute', palette: { main: '#6fa8ff', trim: '#ffffff', dark: '#12224a' }, scale: 1.6 },
    intro: 'They have practised this speech. It is about how Copi has no moves of his own.',
  }),
  heartFlux: B({
    id: 'heartFlux', name: 'RICHARD HEART: FLUX', kind: 'undead', undead: true,
    desc: 'Now mostly ornament. Counters every physical hit with something about your cost basis.',
    hp: 17000, str: 82, def: 72, mag: 88, mdef: 66, agi: 32,
    weak: ['holy'], ap: 520, pls: 3800,
    counters: true,
    ai: [{ a: 'enemyUltima', w: 2 }, { a: 'enemyDoom', w: 2 }, { a: 'enemySpell', w: 2 }],
    sprite: { shape: 'maester', palette: { main: '#c0392b', trim: '#ffe98f', dark: '#2a0a08' }, scale: 1.8 },
    intro: '"You cannot kill an idea. You can only fail to buy it early."',
  }),
  yunalisa: B({
    id: 'yunalisa', name: 'YUNA-LISA, the First Sacrifice', kind: 'undead', undead: true,
    desc: 'The woman who invented the Final Sacrifice, still administering it, several centuries past her exit.',
    hp: 20000, str: 88, def: 78, mag: 96, mdef: 72, agi: 34,
    weak: ['holy'], ap: 640, pls: 5000,
    ai: [{ a: 'enemyDoom', w: 2 }, { a: 'enemyUltima', w: 2 }, { a: 'enemyDrain', w: 2 }, { a: 'enemyHeal', w: 1 }],
    sprite: { shape: 'maiden', palette: { main: '#e0c0ff', trim: '#ff58c8', dark: '#2a1040' }, scale: 1.7 },
    intro: '"Hope is the product. I invented the product. Now kneel and buy the top like your father did."',
  }),
  finalAirdrop: B({
    id: 'finalAirdrop', name: 'THE FINAL AIRDROP', kind: 'armored', armored: true,
    desc: 'Somebody’s guardian, converted into a weapon, which will shortly be converted into the next Whale.',
    hp: 21000, str: 92, def: 88, mag: 78, mdef: 76, agi: 30,
    ap: 800, pls: 6000,
    ai: [{ a: 'enemyPierce', w: 3 }, { a: 'enemyDump', w: 2 }, { a: 'enemyUltima', w: 1 }],
    sprite: { shape: 'dragon', palette: { main: '#c9a24a', trim: '#ffffff', dark: '#3a2a0e' }, scale: 1.9 },
    intro: 'It has a face you recognise from a portrait in a temple. It is doing its job.',
  }),
  hexyevon: B({
    id: 'hexyevon', name: 'HEX-YEVON', kind: 'undead', undead: true,
    desc: 'A parasite the size of a paragraph. It does not want power. It wants the loop to continue, because the loop is the only place it exists.',
    hp: 24000, str: 76, def: 74, mag: 88, mdef: 80, agi: 40,
    weak: ['holy'], ap: 999, pls: 9999,
    ai: [{ a: 'enemyUltima', w: 3 }, { a: 'enemyDoom', w: 2 }, { a: 'enemyDrain', w: 2 }],
    sprite: { shape: 'parasite', palette: { main: '#ff58c8', trim: '#ffe98f', dark: '#0b0716' }, scale: 1.6 },
    intro: 'It is very small. It has been running for a thousand years. It has never once been audited.',
  }),
};

export const ALL_FOES = { ...ENEMIES, ...BOSSES };

export function foe(id) {
  const f = ALL_FOES[id];
  if (!f) throw new Error('unknown foe: ' + id);
  return f;
}
