// Quests: 500 of them, generated rather than written.
//
// Five hundred hand-authored quests would be five hundred chances to fat-finger
// a reward, and no way to tell a generous one from a typo. These are generated
// from a dozen templates by index, which buys three things:
//
//   - the list is identical on every device and every reinstall, because it is
//     a pure function of the index — a save only has to store how far along it
//     is, not the quests themselves;
//   - difficulty ramps smoothly instead of in whatever order someone typed
//     them in;
//   - and the reward is *derived from the work*, not chosen. Every template
//     declares what one unit of its goal costs in effort, the generator
//     multiplies that by the goal, and the payout is effort × one global rate.
//     Balance is therefore a single number, and a test can assert that no
//     quest in the whole run of 500 pays outside a narrow band per unit of
//     effort. That is the difference between "balanced" and "looks balanced".
//
// The effort unit is calibrated against a run: one point is roughly one
// ordinary enemy killed on Veteran. A wave clear is worth about eight.

/**
 * How a quest's progress is measured.
 *
 *   count — accumulates across runs and sessions (kill 400 enemies)
 *   peak  — the best single run counts, and nothing accumulates (reach wave 20)
 *
 * The distinction matters: "reach wave 20" must not be satisfiable by clearing
 * wave 4 five times, and "kill 400 enemies" must not reset every time you die.
 */
export const METRICS = {
  kills: { kind: 'count', label: 'enemies slain' },
  eliteKills: { kind: 'count', label: 'elites slain' },
  bossKills: { kind: 'count', label: 'bosses slain' },
  wavesCleared: { kind: 'count', label: 'waves cleared' },
  damageDealt: { kind: 'count', label: 'damage dealt' },
  potionsDrunk: { kind: 'count', label: 'potions drunk' },
  skillsCast: { kind: 'count', label: 'skills cast' },
  runs: { kind: 'count', label: 'runs finished' },
  bestWave: { kind: 'peak', label: 'wave reached in one run' },
  bestCombo: { kind: 'peak', label: 'kill streak in one run' },
  affixWaves: { kind: 'count', label: 'waves cleared under affixes' },
  raidKills: { kind: 'count', label: 'raid bosses defeated' },
  critHits: { kind: 'count', label: 'critical hits landed' },
  flawlessWaves: { kind: 'count', label: 'waves cleared untouched' },
  mechanicsSurvived: { kind: 'count', label: 'boss mechanics survived' },
  goldEarned: { kind: 'count', label: 'gold earned' },
};

/**
 * Templates. `effort` is what one unit of the goal costs, in the units
 * described above; `steps` is the ladder of goals a template offers as the
 * quest index climbs.
 *
 * Nothing here is a "log in today" or "watch an ad" quest. Every one of them
 * is satisfied by playing, which is the only kind worth shipping.
 */
/** "1 boss", "6 bosses" — a quest that says "Slay 1 bosses" reads as unfinished. */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const TEMPLATES = [
  {
    id: 'slay', metric: 'kills', effort: 1.0, icon: '⚔',
    steps: [40, 80, 150, 260, 420, 650, 950, 1400, 2000, 2800],
    title: (n) => `Slay ${plural(n, 'enemy', 'enemies')}`,
    blurb: 'Any enemy, any arena, any class.',
  },
  {
    id: 'elites', metric: 'eliteKills', effort: 4.0, icon: '👑',
    steps: [3, 6, 12, 20, 34, 55, 85, 130, 190, 270],
    title: (n) => `Slay ${plural(n, 'elite', 'elites')}`,
    blurb: 'The gold-barred ones hit back.',
  },
  {
    id: 'bosses', metric: 'bossKills', effort: 26.0, icon: '💀',
    steps: [1, 3, 6, 10, 16, 24, 36, 52, 74, 100],
    title: (n) => `Slay ${plural(n, 'boss', 'bosses')}`,
    blurb: 'Every fifth wave, and they do not get easier.',
  },
  {
    id: 'waves', metric: 'wavesCleared', effort: 8.0, icon: '🌊',
    steps: [10, 22, 40, 68, 110, 170, 250, 360, 510, 700],
    title: (n) => `Clear ${plural(n, 'wave', 'waves')}`,
    blurb: 'Across as many runs as it takes.',
  },
  {
    id: 'deep', metric: 'bestWave', effort: 22.0, icon: '🏔',
    steps: [5, 8, 12, 16, 21, 27, 34, 42, 51, 62],
    title: (n) => `Reach wave ${n} in a single run`,
    blurb: 'One run. Dying resets nothing but your patience.',
  },
  {
    id: 'streak', metric: 'bestCombo', effort: 3.2, icon: '🔥',
    steps: [15, 25, 40, 60, 85, 115, 150, 195, 250, 320],
    title: (n) => `Hit a ${n} kill streak`,
    blurb: 'Keep killing. The window shrinks as it climbs.',
  },
  {
    id: 'damage', metric: 'damageDealt', effort: 0.006, icon: '💥',
    steps: [20000, 45000, 90000, 170000, 300000, 520000, 850000, 1400000, 2200000, 3400000],
    title: (n) => `Deal ${n.toLocaleString()} damage`,
    blurb: 'It all counts, however it lands.',
  },
  {
    id: 'potions', metric: 'potionsDrunk', effort: 7.0, icon: '🧪',
    steps: [5, 10, 18, 30, 48, 72, 105, 150, 210, 290],
    title: (n) => `Drink ${plural(n, 'potion', 'potions')}`,
    blurb: 'Walk over what the dead leave behind.',
  },
  {
    id: 'cast', metric: 'skillsCast', effort: 0.30, icon: '✨',
    steps: [150, 320, 600, 1050, 1700, 2600, 3900, 5600, 7900, 11000],
    title: (n) => `Cast ${plural(n, 'skill', 'skills')}`,
    blurb: 'Your four, as often as the cooldowns allow.',
  },
  {
    id: 'runs', metric: 'runs', effort: 30.0, icon: '🎲',
    steps: [3, 7, 13, 22, 35, 52, 75, 105, 145, 195],
    title: (n) => `Finish ${plural(n, 'run', 'runs')}`,
    blurb: 'Win or lose — finishing is what counts.',
  },
  {
    id: 'affix', metric: 'affixWaves', effort: 11.0, icon: '⚡',
    steps: [5, 12, 24, 42, 68, 105, 155, 220, 305, 415],
    title: (n) => `Clear ${plural(n, 'wave', 'waves')} under affixes`,
    blurb: 'Wave 4 onward. The rules are the reward.',
  },

  // Five more, and the first of them fixes an omission: forty-two raid
  // bosses across seven rooms, and until now the quest log never once
  // mentioned that the mode existed. The other four ask for things the arena
  // could already measure and never rewarded — precision, patience, and
  // standing in a room while something dangerous goes off.
  {
    id: 'raid', metric: 'raidKills', effort: 42.0, icon: '🏰',
    steps: [1, 3, 6, 11, 18, 27, 38, 52, 68, 88],
    title: (n) => `Defeat ${plural(n, 'raid boss', 'raid bosses')}`,
    blurb: 'Any room, any tier. Each one opens a piece of gear.',
  },
  {
    id: 'crit', metric: 'critHits', effort: 0.09, icon: '🎯',
    steps: [200, 450, 850, 1500, 2500, 4000, 6200, 9200, 13500, 19000],
    title: (n) => `Land ${n.toLocaleString()} critical hits`,
    blurb: 'Crit chance is a stat you can buy. This is what it buys.',
  },
  {
    id: 'flawless', metric: 'flawlessWaves', effort: 18.0, icon: '🛡',
    steps: [3, 7, 14, 24, 38, 58, 84, 120, 168, 230],
    title: (n) => `Clear ${plural(n, 'wave', 'waves')} without being hit`,
    blurb: 'Not one point of health, start to finish.',
  },
  {
    id: 'mechanics', metric: 'mechanicsSurvived', effort: 5.5, icon: '💫',
    steps: [10, 24, 48, 84, 135, 205, 300, 430, 600, 820],
    title: (n) => `Live through ${plural(n, 'boss mechanic', 'boss mechanics')}`,
    blurb: 'Every telegraph a boss puts on the floor while you are in the room.',
  },
  {
    id: 'gold', metric: 'goldEarned', effort: 0.020, icon: '🪙',
    steps: [3000, 7000, 14000, 26000, 45000, 76000, 125000, 200000, 315000, 490000],
    title: (n) => `Earn ${n.toLocaleString()} gold`,
    blurb: 'Every coin a run pays out, spent or not.',
  },
];

export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

/** How many quests exist in total. */
export const QUEST_COUNT = 500;

/** How many are offered at once. */
export const ACTIVE_SLOTS = 3;

/**
 * Gold per point of effort.
 *
 * Anchored against a run rather than picked: an ordinary wave-20 run pays a
 * few thousand gold, and a quest costing a run's worth of effort should
 * pay a meaningful fraction of that on top — a bonus for playing, never a
 * substitute for playing. At 9 a quest is worth grinding toward and worth
 * nobody's time to farm in isolation.
 */
export const GOLD_PER_EFFORT = 9;

/**
 * Quests get harder as you work through them, on top of the ladder inside each
 * template. By quest 500 the goals are roughly three times the template's own
 * top step, which is what keeps the last hundred from being the first hundred
 * again.
 */
function tierScale(index) {
  return 1 + (index / QUEST_COUNT) * 2.0;
}

/**
 * The quest at a given index. Pure: same index, same quest, forever.
 *
 * Templates are cycled rather than picked at random so consecutive quests are
 * never the same kind twice — a log showing three "slay N enemies" rows at
 * once is a log that looks broken.
 */
export function questAt(index) {
  const i = ((index % QUEST_COUNT) + QUEST_COUNT) % QUEST_COUNT;
  const t = TEMPLATES[i % TEMPLATES.length];
  const cycle = Math.floor(i / TEMPLATES.length);
  const step = t.steps[Math.min(t.steps.length - 1, cycle % t.steps.length)];
  const scale = tierScale(i);

  // Rounded to something a player can hold in their head: nobody wants a quest
  // for 1,237 kills.
  const raw = step * scale;
  const goal = Math.max(1, roundNicely(raw));
  const effort = goal * t.effort;
  const reward = Math.max(25, Math.round(effort * GOLD_PER_EFFORT / 5) * 5);

  return {
    index: i,
    id: `q${i}`,
    templateId: t.id,
    metric: t.metric,
    kind: METRICS[t.metric].kind,
    icon: t.icon,
    goal,
    reward,
    effort,
    title: t.title(goal),
    blurb: t.blurb,
    unit: METRICS[t.metric].label,
  };
}

/** 1,237 -> 1,250; 63 -> 65; 7 -> 7. Legible numbers, same order of magnitude. */
function roundNicely(n) {
  if (n < 20) return Math.round(n);
  if (n < 100) return Math.round(n / 5) * 5;
  if (n < 1000) return Math.round(n / 10) * 10;
  if (n < 10000) return Math.round(n / 50) * 50;
  if (n < 100000) return Math.round(n / 500) * 500;
  return Math.round(n / 5000) * 5000;
}

/** Every quest, in order. Used by the menu and by the balance checks. */
export function allQuests() {
  const out = [];
  for (let i = 0; i < QUEST_COUNT; i++) out.push(questAt(i));
  return out;
}
