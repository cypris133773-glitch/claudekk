// The nine rungs of the empire. Costs and cycle times follow the shape the
// genre settled on years ago: each rung costs roughly 12x the last, pays
// roughly 6x as much per second, and takes longer to do it — so the early
// rungs stay relevant as click targets while the late ones carry the run.
//
// `cost` is the price of level 1. Every level after that multiplies by
// `growth`, which shrinks as you climb: cheap rungs are meant to be spammed
// to their milestones, expensive rungs are meant to be a decision.

export const STATIONS = [
  {
    id: 'shill',
    name: 'Shill Post',
    blurb: 'Rocket emoji. Zero context. Somehow it works.',
    cost: 4,
    growth: 1.07,
    revenue: 1,
    time: 0.6,
    hue: 330,
    advisor: {
      name: 'The Reply Guy',
      cost: 1000,
      quip: 'I post through everything. Bear market, funeral, everything.',
    },
  },
  {
    id: 'telegram',
    name: 'Telegram Pump Room',
    blurb: '40,000 members. Four of them are not bots.',
    cost: 60,
    growth: 1.15,
    revenue: 60,
    time: 3,
    hue: 300,
    advisor: {
      name: 'Admin Sasha',
      cost: 15000,
      quip: 'Any FUD in here gets deleted. That is called moderation.',
    },
  },
  {
    id: 'stream',
    name: '12-Hour Livestream',
    blurb: 'Hour nine. Still on the first slide. Nobody has left.',
    cost: 720,
    growth: 1.14,
    revenue: 540,
    time: 6,
    hue: 275,
    advisor: {
      name: 'Camera Op Dave',
      cost: 100000,
      quip: 'I have not seen daylight since the last halving.',
    },
  },
  {
    id: 'validator',
    name: 'Validator Node',
    blurb: 'A gaming PC in a spare room, load-bearing for a whole chain.',
    cost: 8640,
    growth: 1.13,
    revenue: 4320,
    time: 12,
    hue: 250,
    advisor: {
      name: 'Uptime Uma',
      cost: 500000,
      quip: 'Nine nines. The tenth nine is a space heater.',
    },
  },
  {
    id: 'ladder',
    name: 'Stake Ladder',
    blurb: 'Ten stakes, ten end dates, one very confident spreadsheet.',
    cost: 103680,
    growth: 1.12,
    revenue: 51840,
    time: 24,
    hue: 220,
    advisor: {
      name: 'Ladder Larry',
      cost: 1.2e7,
      quip: 'Every rung ends on a Tuesday. Ask me why. Please.',
    },
  },
  {
    id: 'vault',
    name: 'T-Share Vault',
    blurb: 'The share price only goes up. That is the entire pitch.',
    cost: 1244160,
    growth: 1.11,
    revenue: 622080,
    time: 48,
    hue: 190,
    advisor: {
      name: 'Vault Keeper Nia',
      cost: 1.3e8,
      quip: 'Down only for the price. Up only for the shares. Simple.',
    },
  },
  {
    id: 'pool',
    name: 'Liquidity Pool',
    blurb: 'Impermanent loss is only permanent if you look at it.',
    cost: 14929920,
    growth: 1.1,
    revenue: 7464960,
    time: 96,
    hue: 160,
    advisor: {
      name: 'Pool Boy Kai',
      cost: 1.5e9,
      quip: 'I provide depth. Emotional, mostly.',
    },
  },
  {
    id: 'altar',
    name: 'The Sacrifice Altar',
    blurb: 'You get nothing in return. It is important that you know that.',
    cost: 179159040,
    growth: 1.09,
    revenue: 89579520,
    time: 192,
    hue: 40,
    advisor: {
      name: 'Ceremony Cass',
      cost: 1.8e10,
      quip: 'Legally: a donation. Spiritually: a very good trade.',
    },
  },
  {
    id: 'showroom',
    name: 'Rolex & Lambo Showroom',
    blurb: 'The yield, finally, made visible from space.',
    cost: 2149908480,
    growth: 1.08,
    revenue: 1074954240,
    time: 384,
    hue: 50,
    advisor: {
      name: 'Concierge Vic',
      cost: 2.1e11,
      quip: 'Your watch called. It wants a smaller watch.',
    },
  },
];

// Levels that pay off. Profit milestones are the reason you buy in blocks of
// 25 instead of dribbling; speed milestones are rarer so the long stations
// never fully collapse into the short ones.
export const PROFIT_MILESTONES = [25, 50, 100, 200, 300, 400, 500, 750, 1000];
export const SPEED_MILESTONES = [100, 300, 600];

export const MAX_LEVEL = 1000;

export function stationById(id) {
  return STATIONS.find((s) => s.id === id) || null;
}
