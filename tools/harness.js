// Browser-only collaborators, stubbed, so Game can be driven from Node.
//
// Game reaches for a WebGL renderer, a WebAudio context and a save profile the
// moment it starts a run. None of those exist in Node, and every headless test
// that wants a real game had grown its own copy of the same three stubs — which
// meant a change to any of those interfaces broke the tests one at a time,
// silently, as each copy drifted.

import { CLASSES, resolveLoadout, defaultLoadout } from '../src/data/classes.js';

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

  const classes = {};
  for (const c of CLASSES) {
    classes[c.id] = {
      talents: {},
      bestWave: opts.bestWave || 0,
      kills: 0, runs: 0, mastery: 0,
      loadout: opts.loadout || defaultLoadout(c),
    };
  }
  const profile = {
    data: {
      permanent: opts.permanent || {},
      armor: opts.armor || {},
      classes, souls: 0, stats: {},
    },
    settings: { showDamage: false, difficulty: opts.difficulty || 1 },
    classData: (id) => classes[id],
    // The Forge moved into the per-class bag; the harness keeps one bag per
    // class so a fixture can hand a single class a stocked Forge.
    forgeLevels: (id) => (classes[id].forge || (classes[id].forge = {})),
    // Level 60 by default: a harness that only ever saw a level-1 pool would
    // test two skills out of thirteen.
    loadout: (cls) => resolveLoadout(cls, classes[cls.id].loadout, opts.level || 60),
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
