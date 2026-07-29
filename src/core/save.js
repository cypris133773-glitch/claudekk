// Persistent profile: souls, permanent upgrades, per-class talents, records.
// Stored in localStorage; a Steam build can swap this for the Steam cloud.

import { CLASSES, defaultLoadout, resolveLoadout } from '../data/classes.js';
import {
  talentPointsForBestWave, masteryRank, masteryProgress, masteryFromRun,
} from '../data/permanent.js';
import {
  levelFromXp, levelProgress, talentPointsForLevel, xpForRun, xpToReach, MAX_LEVEL,
} from '../data/levels.js';
import {
  emptyQuestState, normaliseQuestState, applyProgress, activeQuests,
  claimQuest, rerollQuest, rerollCost,
} from './questlog.js';

const KEY = 'craftarena.save.v1';
// The game shipped as BLOCKFRAY, and anyone who played it has their whole
// account under the old key. Renaming without reading the old one first would
// have looked, from the player's side, exactly like the update deleted their
// progress. Read once, write under the new key, and leave the old entry alone
// so a rollback to an older build still finds it.
const LEGACY_KEYS = ['blockfray.save.v1'];

/**
 * localStorage that cannot throw. Merely *reading* the property raises a
 * SecurityError in a sandboxed iframe without allow-same-origin, and in
 * Safari's private mode writes can throw too. An unguarded access at startup
 * aborts the whole module, so the game never boots and the page sits blank.
 * Progress simply does not persist where storage is unavailable.
 */
export const storage = {
  available() {
    try {
      const s = window.localStorage;
      if (!s) return false;
      const probe = '__craftarena_probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  },
  get(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch { return false; }
  },
};

function emptyProfile() {
  const classes = {};
  for (const c of CLASSES) {
    classes[c.id] = {
      talents: {}, bestWave: 0, kills: 0, runs: 0, unlocked: true,
      loadout: defaultLoadout(c, 1), mastery: 0, xp: 0,
    };
  }
  return {
    version: 1,
    souls: 0,
    lifetimeSouls: 0,
    quests: emptyQuestState(),
    permanent: {},
    armor: {},
    classes,
    lastClass: CLASSES[0].id,
    stats: { runs: 0, kills: 0, bestWave: 0, timePlayed: 0, deaths: 0 },
    settings: {
      sensitivity: 1.0,
      touchSensitivity: 1.0,
      renderScale: 1.0,
      fov: 74,
      sfxVolume: 0.7,
      musicVolume: 0.4,
      invertY: false,
      showDamage: true,
      leftHanded: false,
      autoAttack: true,
      aimAssist: true,
      fancyGraphics: true,
      difficulty: 1,
      hapticFeedback: true,
      fullscreenOnPlay: true,
    },
  };
}

export class Profile {
  constructor() {
    this.data = emptyProfile();
    this.load();
  }

  load() {
    try {
      let raw = storage.get(KEY);
      let migrated = false;
      if (!raw) {
        for (const legacy of LEGACY_KEYS) {
          raw = storage.get(legacy);
          if (raw) { migrated = true; break; }
        }
      }
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // Merge so new fields added in updates get sane defaults.
      const base = emptyProfile();
      this.data = {
        ...base, ...parsed,
        settings: { ...base.settings, ...(parsed.settings || {}) },
        stats: { ...base.stats, ...(parsed.stats || {}) },
        classes: Object.fromEntries(
          Object.entries(base.classes).map(([id, v]) => [id, { ...v, ...((parsed.classes || {})[id] || {}) }])
        ),
        // Repaired rather than merged: a save from before quests existed has
        // no state at all, and one from a build with a different slot count
        // has the wrong shape. Both have to end up playable.
        quests: normaliseQuestState(parsed.quests),
      };
      if (this.migrateToLevels()) migrated = true;
      // Write it straight back under the new key, so the migration happens
      // once rather than on every boot for the rest of the account's life.
      if (migrated) this.save();
    } catch (err) {
      console.warn('Save data unreadable, starting fresh.', err);
      this.data = emptyProfile();
    }
  }

  /**
   * Talent points used to come from best wave. They now come from level, and a
   * save written before levels existed has no XP at all — so every player with
   * a talent build would have opened this update to find it wiped and no
   * points to rebuild it with.
   *
   * So: grant whatever XP their old point total was worth. They keep every
   * point they had, their spent talents still validate, and from here on the
   * points come from levelling like everyone else's. Runs first for anyone who
   * has played, so someone deep in the game does not start at level 1.
   */
  migrateToLevels() {
    let changed = false;
    for (const cd of Object.values(this.data.classes)) {
      if (cd.xp || !cd.bestWave) continue;
      const owed = talentPointsForBestWave(cd.bestWave);
      if (owed <= 0) continue;
      cd.xp = xpToReach(Math.min(MAX_LEVEL, owed + 1));
      changed = true;
    }
    return changed;
  }

  save() {
    try {
      storage.set(KEY, JSON.stringify(this.data));
    } catch (err) {
      console.warn('Could not write save data.', err);
    }
  }

  reset() {
    this.data = emptyProfile();
    this.save();
  }

  get souls() { return this.data.souls; }
  set souls(v) { this.data.souls = Math.max(0, Math.round(v)); }

  get settings() { return this.data.settings; }

  classData(classId) { return this.data.classes[classId]; }

  get armor() { return this.data.armor; }

  // --- Skill loadout -------------------------------------------------------

  /**
   * The skill objects a class will take into the arena — at most four, and
   * fewer while it is still low enough that it has not learned four.
   *
   * The level is what gates this now, not best wave. Passing the wrong number
   * here is the one mistake that would let a locked skill into a run, so it is
   * read from the same place the menus read it.
   */
  loadout(cls) {
    const cd = this.classData(cls.id);
    return resolveLoadout(cls, cd.loadout, this.level(cls.id));
  }

  /** Persist a loadout, normalised so a bad list can never be stored. */
  setLoadout(cls, ids) {
    const cd = this.classData(cls.id);
    cd.loadout = resolveLoadout(cls, ids, this.level(cls.id)).map((s) => s.id);
    this.save();
    return cd.loadout;
  }

  // --- Mastery -------------------------------------------------------------

  masteryRank(classId) { return masteryRank(this.classData(classId).mastery || 0); }

  masteryProgress(classId) { return masteryProgress(this.classData(classId).mastery || 0); }

  spentTalentPoints(classId) {
    const ranks = this.data.classes[classId].talents;
    return Object.values(ranks).reduce((a, b) => a + b, 0);
  }

  // --- Levels ---------------------------------------------------------------

  /** Total XP this class has banked. */
  classXp(classId) { return this.data.classes[classId].xp || 0; }

  level(classId) { return levelFromXp(this.classXp(classId)); }

  /** Level, progress into it, and the raw numbers the bar is drawn from. */
  levelProgress(classId) { return levelProgress(this.classXp(classId)); }

  totalTalentPoints(classId) {
    return talentPointsForLevel(this.level(classId));
  }

  availableTalentPoints(classId) {
    return this.totalTalentPoints(classId) - this.spentTalentPoints(classId);
  }

  respec(classId) {
    this.data.classes[classId].talents = {};
    this.save();
  }

  /** Record the outcome of a run and bank the souls it earned. */
  // --- Quests --------------------------------------------------------------

  get questState() {
    if (!this.data.quests) this.data.quests = emptyQuestState();
    return this.data.quests;
  }

  activeQuests() { return activeQuests(this.questState); }

  /**
   * Fold a finished run's numbers into the quest log. Called once, from
   * finishRun, rather than per kill: a quest that updated live would need the
   * log saved on every hit, and a run that ends in a crash would bank progress
   * for a run the player never actually completed.
   */
  applyQuestProgress(deltas, peaks) {
    return applyProgress(this.questState, deltas, peaks);
  }

  claimQuest(index) {
    const paid = claimQuest(this.questState, index, this);
    if (paid) this.save();
    return paid;
  }

  rerollQuest(index) {
    const ok = rerollQuest(this.questState, index, this);
    if (ok) this.save();
    return ok;
  }

  rerollCost(q) { return rerollCost(q); }

  finishRun(classId, { wave, kills, souls, duration, quests, xp }) {
    const cd = this.data.classes[classId];
    // Banked before anything else so `lastLevelUps` is available to the
    // results screen in the same call that produced it.
    const before = this.level(classId);
    cd.xp = (cd.xp || 0) + Math.max(0, Math.round(xp || 0));
    this.lastLevelUps = [];
    for (let L = before + 1; L <= this.level(classId); L++) this.lastLevelUps.push(L);
    cd.runs++;
    cd.kills += kills;
    cd.bestWave = Math.max(cd.bestWave, wave);
    cd.mastery = (cd.mastery || 0) + masteryFromRun({ wave, kills });
    this.data.souls += souls;
    this.data.lifetimeSouls += souls;
    this.data.stats.runs++;
    this.data.stats.kills += kills;
    this.data.stats.bestWave = Math.max(this.data.stats.bestWave, wave);
    this.data.stats.timePlayed += duration;
    this.data.stats.deaths++;
    this.data.lastClass = classId;
    // Quest progress is banked here so it lands in the same write as the run
    // it came from — two separate saves means a crash between them can pay a
    // quest for a run that was never recorded, or the reverse.
    this.lastQuestsFinished = quests
      ? applyProgress(this.questState, quests.deltas, quests.peaks)
      : [];
    this.save();
  }
}
