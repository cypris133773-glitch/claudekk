// Browser-only collaborators, stubbed, so Game can be driven from Node.
//
// Game reaches for a WebGL renderer, a WebAudio context and a save profile the
// moment it starts a run. None of those exist in Node, and every headless test
// that wants a real game had grown its own copy of the same three stubs — which
// meant a change to any of those interfaces broke the tests one at a time,
// silently, as each copy drifted.

import { CLASSES, resolveLoadout, defaultLoadout } from '../src/data/classes.js';
import { GEAR_SLOT_IDS } from '../src/data/armor.js';

/**
 * `opts.loadout` overrides every class's equipped skills (used by the
 * cast-every-skill check, which needs one named skill in slot 0).
 * `opts.difficulty` seeds the profile setting a run reads when the caller does
 * not pass one explicitly.
 */
export function makeHarness(opts = {}) {
  const renderer = {
    setWorld() {}, setTheme() {}, project: () => null,
    skyTint: [0, 0, 0], fancy: false,
  };
  const audio = {
    play() {}, startMusic() {}, stopMusic() {}, setMusicIntensity() {}, ensure() {},
  };

  const level = opts.level || 60;
  const classes = {};
  for (const c of CLASSES) {
    classes[c.id] = {
      talents: {},
      bestWave: opts.bestWave || 0,
      kills: 0, runs: 0, mastery: 0,
      loadout: opts.loadout || defaultLoadout(c),
      // `opts.gear` is a tier every slot is set to, so a fixture can ask for
      // "a fully geared character" without spelling out six slots. Absent
      // means unowned — tier 0 is a real tier, so it cannot be the default.
      gear: opts.gear === undefined
        ? {}
        : Object.fromEntries(GEAR_SLOT_IDS.map((id) => [id, opts.gear])),
    };
  }
  const profile = {
    data: {
      permanent: opts.permanent || {},
      armor: opts.armor || {},
      classes, souls: 0, stats: {},
    },
    settings: { showDamage: false, difficulty: opts.difficulty || 1 },
    // The game addresses progress by character id. The harness keeps one
    // character per class and uses the class id as the character id, so a
    // fixture still says "run this as a Warrior" and gets exactly one Warrior.
    resolveChar: (who) => (who && typeof who === 'object' ? who.id : who),
    classOf: (id) => CLASSES.find((c) => c.id === id) || CLASSES[0],
    character: (id) => classes[id],
    // The Forge moved into the per-character bag; the harness keeps one bag
    // per class so a fixture can hand a single one a stocked Forge.
    forgeLevels: (id) => (classes[id].forge || (classes[id].forge = {})),
    gear: (id) => classes[id].gear,
    raidState: (id) => (classes[id].raid || (classes[id].raid = { killed: {} })),
    level: () => level,
    // Level 60 by default: a harness that only ever saw a level-1 pool would
    // test two skills out of thirteen.
    loadout: (id) => resolveLoadout(
      CLASSES.find((c) => c.id === id) || CLASSES[0], classes[id].loadout, level),
    // The potion belt. Empty unless a fixture stocks it, so a run in the
    // harness never quietly heals itself off a rack nobody asked for.
    potions: (id) => (classes[id].potions || (classes[id].potions = {})),
    potionCount: (id, pid) => ((classes[id].potions || {})[pid] | 0),
    consumePotion: (id, pid) => {
      const rack = classes[id].potions || (classes[id].potions = {});
      if (!rack[pid]) return false;
      rack[pid]--;
      return true;
    },
    finishRun() {}, save() {},
  };

  // A neutral input frame. Long enough for any loadout: castSkill indexes it,
  // and a short array would read undefined as "not pressed" only by luck.
  const input = () => ({
    moveX: 0, moveY: 0, lookX: 0, lookY: 0,
    attack: false, jump: false, sprint: false, pause: false,
    skills: [false, false, false, false],
  });

  return { renderer, audio, profile, classes, input };
}
