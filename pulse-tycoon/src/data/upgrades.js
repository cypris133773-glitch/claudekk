// Everything here is bought with T-Shares and survives a Restake. That is the
// whole contract: cash is this run, T-Shares are forever. Prices climb hard
// because the only source of T-Shares is stakes that take real time to mature.

// kind:
//   'global'  — multiplies every station's revenue
//   'station' — multiplies one station, `target` names it
//   'click'   — multiplies the manual tap
//   'offline' — adds hours to the offline-earnings cap
//   'pump'    — improves the Pump boost
export const UPGRADES = [
  {
    id: 'ergonomic-mouse',
    name: 'Ergonomic Mouse',
    blurb: 'Tap harder without the wrist thing happening.',
    kind: 'click',
    value: 3,
    cost: 3,
  },
  {
    id: 'bot-farm',
    name: 'Engagement Farm',
    blurb: 'Shill Posts x5. The replies are all from Chennai.',
    kind: 'station',
    target: 'shill',
    value: 5,
    cost: 5,
  },
  {
    id: 'pinned-message',
    name: 'Pinned Message',
    blurb: 'Pump Rooms x5. Nobody reads it. Everybody obeys it.',
    kind: 'station',
    target: 'telegram',
    value: 5,
    cost: 8,
  },
  {
    id: 'ring-light',
    name: 'Ring Light',
    blurb: 'Livestreams x5. You look trustworthy now. Sorry.',
    kind: 'station',
    target: 'stream',
    value: 5,
    cost: 14,
  },
  {
    id: 'conviction-i',
    name: 'Conviction',
    blurb: 'All income x2. You simply believe more than other people.',
    kind: 'global',
    value: 2,
    cost: 20,
  },
  {
    id: 'liquid-cooling',
    name: 'Liquid Cooling',
    blurb: 'Validators x5. The spare room is habitable again.',
    kind: 'station',
    target: 'validator',
    value: 5,
    cost: 30,
  },
  {
    id: 'second-monitor',
    name: 'Second Monitor',
    blurb: 'Offline earnings cap +4h. For watching charts while asleep.',
    kind: 'offline',
    value: 4,
    cost: 40,
  },
  {
    id: 'longer-pays-better',
    name: 'Longer Pays Better',
    blurb: 'Stake Ladders x5. It is not advice, it is a slogan.',
    kind: 'station',
    target: 'ladder',
    value: 5,
    cost: 55,
  },
  {
    id: 'megaphone',
    name: 'Megaphone',
    blurb: 'Pump lasts twice as long.',
    kind: 'pump',
    value: 2,
    cost: 70,
  },
  {
    id: 'bigger-pays-better',
    name: 'Bigger Pays Better',
    blurb: 'T-Share Vaults x5. The other slogan.',
    kind: 'station',
    target: 'vault',
    value: 5,
    cost: 90,
  },
  {
    id: 'conviction-ii',
    name: 'Diamond Grip',
    blurb: 'All income x3. Your hands have fused shut.',
    kind: 'global',
    value: 3,
    cost: 120,
  },
  {
    id: 'depth-chart',
    name: 'Depth Chart',
    blurb: 'Liquidity Pools x5. Green wall, definitely real.',
    kind: 'station',
    target: 'pool',
    value: 5,
    cost: 160,
  },
  {
    id: 'carpal-tunnel',
    name: 'Percussive Maintenance',
    blurb: 'Manual taps x10. Ask your doctor about anything else.',
    kind: 'click',
    value: 10,
    cost: 200,
  },
  {
    id: 'ceremony',
    name: 'Bigger Ceremony',
    blurb: 'Sacrifice Altars x5. Now with a smoke machine.',
    kind: 'station',
    target: 'altar',
    value: 5,
    cost: 260,
  },
  {
    id: 'sleep-schedule',
    name: 'Abandoned Sleep Schedule',
    blurb: 'Offline earnings cap +12h.',
    kind: 'offline',
    value: 12,
    cost: 320,
  },
  {
    id: 'showroom-lighting',
    name: 'Showroom Lighting',
    blurb: 'Showrooms x5. Every surface is now reflective.',
    kind: 'station',
    target: 'showroom',
    value: 5,
    cost: 400,
  },
  {
    id: 'conviction-iii',
    name: 'Generational Wealth',
    blurb: 'All income x5. Your grandchildren are already annoying.',
    kind: 'global',
    value: 5,
    cost: 600,
  },
  {
    id: 'supercycle',
    name: 'Supercycle',
    blurb: 'Pump multiplier x3 instead of x2.',
    kind: 'pump',
    value: 3,
    cost: 800,
  },
];

export function upgradeById(id) {
  return UPGRADES.find((u) => u.id === id) || null;
}
