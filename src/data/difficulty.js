// Difficulty tiers, chosen per run.
//
// The dials are deliberately separated. Health alone makes a run longer, not
// harder — it just extends the same fight. Damage is what forces you to read
// a wind-up and step out of it, and concurrency is what stops you handling
// enemies one at a time. Higher tiers lean on the last two.
//
// Souls scale with the tier so the harder settings are the efficient way to
// grind, not a pride option you take at a cost.

export const DIFFICULTIES = [
  {
    id: 1,
    name: 'Veteran',
    icon: '🛡',
    blurb: 'The arena as designed.',
    hp: 1.0,
    damage: 1.0,
    concurrent: 0,
    elite: 0,
    souls: 1.0,
    accent: '#8fd8ff',
  },
  {
    id: 2,
    name: 'Brutal',
    icon: '⚔',
    blurb: 'Hits land harder and the packs are bigger.',
    hp: 1.30,
    damage: 1.35,
    concurrent: 4,
    elite: 0.08,
    souls: 1.5,
    accent: '#ffb27a',
  },
  {
    id: 3,
    name: 'Nightmare',
    icon: '💀',
    blurb: 'Elites everywhere. One mistake is the run.',
    hp: 1.75,
    damage: 1.85,
    concurrent: 8,
    elite: 0.18,
    souls: 2.2,
    accent: '#ff5a3c',
  },
];

export const DIFFICULTY_BY_ID = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d]));

/** Never returns undefined: a save from an older build has no setting at all. */
export function difficultyFor(id) {
  return DIFFICULTY_BY_ID[id] || DIFFICULTIES[1];
}
