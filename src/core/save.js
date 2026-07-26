// Persistent profile: souls, permanent upgrades, per-class talents, records.
// Stored in localStorage; a Steam build can swap this for the Steam cloud.

import { CLASSES } from '../data/classes.js';
import { talentPointsForBestWave } from '../data/permanent.js';

const KEY = 'blockfray.save.v1';

function emptyProfile() {
  const classes = {};
  for (const c of CLASSES) {
    classes[c.id] = { talents: {}, bestWave: 0, kills: 0, runs: 0, unlocked: true };
  }
  return {
    version: 1,
    souls: 0,
    lifetimeSouls: 0,
    permanent: {},
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
      const raw = localStorage.getItem(KEY);
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
      localStorage.setItem(KEY, JSON.stringify(this.data));
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
