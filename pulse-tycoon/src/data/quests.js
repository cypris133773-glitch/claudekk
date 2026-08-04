// Quests are the spine of the run: they hand out the T-Shares that pay for the
// permanent upgrades, and finishing a whole chapter is what unlocks Restake.
// Each quest reports progress as {have, need} so one bar renderer covers all
// of them.

const lvl = (s, id) => s.levels[id] || 0;

export const QUESTS = [
  // Chapter 1 — you have a phone and an opinion.
  {
    id: 'c1-post', chapter: 1, reward: 2,
    text: 'Own 25 Shill Posts',
    probe: (s) => ({ have: lvl(s, 'shill'), need: 25 }),
  },
  {
    id: 'c1-tap', chapter: 1, reward: 2,
    text: 'Tap the coin 100 times',
    probe: (s) => ({ have: s.stats.taps, need: 100 }),
  },
  {
    id: 'c1-room', chapter: 1, reward: 3,
    text: 'Open a Telegram Pump Room',
    probe: (s) => ({ have: lvl(s, 'telegram'), need: 1 }),
  },
  {
    id: 'c1-earn', chapter: 1, reward: 3,
    text: 'Earn $100K in a single run',
    probe: (s) => ({ have: s.runEarned, need: 1e5 }),
  },

  // Chapter 2 — the empire needs staff.
  {
    id: 'c2-advisor', chapter: 2, reward: 4,
    text: 'Hire 2 advisors',
    probe: (s) => ({ have: s.advisors.length, need: 2 }),
  },
  {
    id: 'c2-stream', chapter: 2, reward: 5,
    text: 'Own 25 Livestreams',
    probe: (s) => ({ have: lvl(s, 'stream'), need: 25 }),
  },
  {
    id: 'c2-stake', chapter: 2, reward: 5,
    text: 'Claim a matured stake',
    probe: (s) => ({ have: s.stats.stakesClaimed, need: 1 }),
  },
  {
    id: 'c2-earn', chapter: 2, reward: 6,
    text: 'Earn $50M in a single run',
    probe: (s) => ({ have: s.runEarned, need: 5e7 }),
  },

  // Chapter 3 — the yield becomes structural.
  {
    id: 'c3-validator', chapter: 3, reward: 8,
    text: 'Own 50 Validator Nodes',
    probe: (s) => ({ have: lvl(s, 'validator'), need: 50 }),
  },
  {
    id: 'c3-ladder', chapter: 3, reward: 10,
    text: 'Build a Stake Ladder',
    probe: (s) => ({ have: lvl(s, 'ladder'), need: 1 }),
  },
  {
    id: 'c3-pump', chapter: 3, reward: 10,
    text: 'Trigger 5 Pumps',
    probe: (s) => ({ have: s.stats.pumps, need: 5 }),
  },
  {
    id: 'c3-upgrade', chapter: 3, reward: 12,
    text: 'Buy 5 permanent upgrades',
    probe: (s) => ({ have: s.upgrades.length, need: 5 }),
  },

  // Chapter 4 — the part where it stops being a hobby.
  {
    id: 'c4-vault', chapter: 4, reward: 18,
    text: 'Own 25 T-Share Vaults',
    probe: (s) => ({ have: lvl(s, 'vault'), need: 25 }),
  },
  {
    id: 'c4-advisors', chapter: 4, reward: 20,
    text: 'Hire 6 advisors',
    probe: (s) => ({ have: s.advisors.length, need: 6 }),
  },
  {
    id: 'c4-restake', chapter: 4, reward: 25,
    text: 'Restake once',
    probe: (s) => ({ have: s.stats.restakes, need: 1 }),
  },
  {
    id: 'c4-earn', chapter: 4, reward: 30,
    text: 'Earn $500B in a single run',
    probe: (s) => ({ have: s.runEarned, need: 5e11 }),
  },

  // Chapter 5 — the showroom.
  {
    id: 'c5-altar', chapter: 5, reward: 40,
    text: 'Own 25 Sacrifice Altars',
    probe: (s) => ({ have: lvl(s, 'altar'), need: 25 }),
  },
  {
    id: 'c5-showroom', chapter: 5, reward: 50,
    text: 'Open the Showroom',
    probe: (s) => ({ have: lvl(s, 'showroom'), need: 1 }),
  },
  {
    id: 'c5-sp', chapter: 5, reward: 60,
    text: 'Hold 500 Sacrifice Points',
    probe: (s) => ({ have: s.sacrificePoints, need: 500 }),
  },
  {
    id: 'c5-all', chapter: 5, reward: 80,
    text: 'Hire every advisor',
    probe: (s) => ({ have: s.advisors.length, need: 9 }),
  },
];

export const CHAPTERS = [
  { n: 1, name: 'Someone With A Phone' },
  { n: 2, name: 'Someone With A Team' },
  { n: 3, name: 'Someone With A Thesis' },
  { n: 4, name: 'Someone With A Foundation' },
  { n: 5, name: 'Someone With A Showroom' },
];

export function questsInChapter(n) {
  return QUESTS.filter((q) => q.chapter === n);
}
