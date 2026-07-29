// Persistent profile: souls, permanent upgrades, per-class talents, records.
// Stored in localStorage; a Steam build can swap this for the Steam cloud.

import { CLASSES, defaultLoadout, resolveLoadout } from '../data/classes.js';
import {
  talentPointsForBestWave, masteryRank, masteryProgress, masteryFromRun,
} from '../data/permanent.js';

const KEY = 'blockfray.save.v1';

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
      const probe = '__blockfray_probe__';
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
      loadout: defaultLoadout(c), mastery: 0,
    };
  }
  return {
    version: 1,
    souls: 0,
    lifetimeSouls: 0,
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
      tapAttack: true,
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
      const raw = storage.get(KEY);
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
      };
    } catch (err) {
      console.warn('Save data unreadable, starting fresh.', err);
      this.data = emptyProfile();
    }
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

  /** The four skill objects a class will take into the arena. */
  loadout(cls) {
    const cd = this.classData(cls.id);
    return resolveLoadout(cls, cd.loadout, cd.bestWave);
  }

  /** Persist a loadout, normalised so a bad list can never be stored. */
  setLoadout(cls, ids) {
    const cd = this.classData(cls.id);
    cd.loadout = resolveLoadout(cls, ids, cd.bestWave).map((s) => s.id);
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

  totalTalentPoints(classId) {
    return talentPointsForBestWave(this.data.classes[classId].bestWave);
  }

  availableTalentPoints(classId) {
    return this.totalTalentPoints(classId) - this.spentTalentPoints(classId);
  }

  respec(classId) {
    this.data.classes[classId].talents = {};
    this.save();
  }

  /** Record the outcome of a run and bank the souls it earned. */
  finishRun(classId, { wave, kills, souls, duration }) {
    const cd = this.data.classes[classId];
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
    this.save();
  }
}
