// Persistent profile: souls, permanent upgrades, per-class talents, records.
// Stored in localStorage; a Steam build can swap this for the Steam cloud.

import { CLASSES, defaultLoadout, resolveLoadout } from '../data/classes.js';
import {
  talentPointsForBestWave, masteryRank, masteryProgress, masteryFromRun,
  PERMANENT, PERMANENT_BY_ID, RETIRED_TRACKS, upgradeCost,
} from '../data/permanent.js';
import {
  levelFromXp, levelProgress, talentPointsForLevel, xpForRun, xpToReach, MAX_LEVEL,
} from '../data/levels.js';
import {
  emptyQuestState, normaliseQuestState, applyProgress, activeQuests,
  claimQuest, rerollQuest, rerollCost,
} from './questlog.js';
import {
  legacyArmorRefund, canBuy, ownedTier, GEAR_SLOT_IDS, MAX_TIER,
} from '../data/armor.js';
import { emptyRaidState, normaliseRaidState, earnedCores } from '../data/raids.js';
import { POTIONS, POTION_STACK, potionPrice } from '../data/potions.js';

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

/**
 * How many characters an account may keep.
 *
 * Eight rather than one-per-class. A character is not a class any more: it is
 * a slot with its own level, gear, Forge, raid record and potion rack, and its
 * class is a property of it. Two Warriors are two characters who have never
 * met, which is the thing a single per-class profile could not express.
 *
 * Not a hard ceiling on load. An account migrated from the per-class save can
 * arrive with nine, and refusing to show a character somebody levelled is not
 * a cap, it is data loss — so the cap only governs making new ones.
 */
export const MAX_CHARACTERS = 8;

/**
 * A new character. Every field a class profile used to hold, plus the two that
 * make it a character rather than a class: which class it plays, and a name to
 * tell it from the other Warrior.
 */
export function emptyCharacter(cls, id, name) {
  return {
    id,
    name: name || cls.name,
    classId: cls.id,
    talents: {}, bestWave: 0, kills: 0, runs: 0,
    loadout: defaultLoadout(cls, 1), mastery: 0, xp: 0,
    // The Forge is per character, like talents and gear. Account-wide, it was
    // the one system that made a fresh character start strong — you inherited
    // every point of it the moment you made one, which is exactly what made a
    // maxed account play everything the same.
    forge: {},
    // Six gear slots, per character, same reasoning. Absent means unowned:
    // tier 0 is a real tier that costs real gold, so `gear.helm === 0` has to
    // mean "owns the T0 Helm" and cannot double as "owns nothing".
    gear: {},
    // Which raid bosses this character has put down. Per character like
    // everything else here; only gold is shared.
    raid: emptyRaidState(),
    // Potions bought from the shop and not yet drunk, `{ health: 3 }`. Per
    // character for the same reason as the gear: a stocked main should not
    // hand a fresh alt a rack of potions it never paid for.
    potions: {},
  };
}

function emptyProfile() {
  return {
    version: 2,
    souls: 0,
    lifetimeSouls: 0,
    quests: emptyQuestState(),
    permanent: {},
    armor: {},
    // No characters at all. A new account lands on the roster screen and picks
    // a class to make its first one, which is the moment the game now starts.
    characters: [],
    activeChar: null,
    nextCharId: 1,
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
        // Repaired rather than merged: a save from before quests existed has
        // no state at all, and one from a build with a different slot count
        // has the wrong shape. Both have to end up playable.
        quests: normaliseQuestState(parsed.quests),
      };
      if (this.migrateToCharacters(parsed)) migrated = true;
      if (this.migrateToLevels()) migrated = true;
      if (this.refundForge()) migrated = true;
      if (this.refundArmoury()) migrated = true;
      this.normaliseGear();
      // Write it straight back under the new key, so the migration happens
      // once rather than on every boot for the rest of the account's life.
      if (migrated) this.save();
    } catch (err) {
      console.warn('Save data unreadable, starting fresh.', err);
      this.data = emptyProfile();
    }
  }

  /**
   * Progress used to be filed under the class that earned it: exactly one
   * Warrior per account, forever. It is now filed under a character, and a
   * character has a class rather than being one — so an account can hold two
   * Warriors who have never met.
   *
   * The conversion is one character per class that was actually played. A
   * class the player never touched becomes nothing, because an empty slot is
   * not progress and a roster prefilled with nine untouched characters is a
   * roster you have to clean up before you can use it.
   *
   * Every played class is kept even past the eight-slot cap. Nine classes with
   * progress is a real save somebody could be holding, and hiding one of them
   * to respect a limit invented afterwards is data loss dressed up as a rule.
   */
  migrateToCharacters(parsed) {
    if (Array.isArray(parsed.characters)) {
      this.data.characters = parsed.characters;
      this.data.nextCharId = parsed.nextCharId
        || this.data.characters.reduce((n, c) => Math.max(n, (c.id | 0) + 1), 1);
      return false;
    }
    const old = parsed.classes;
    if (!old) return false;

    const played = [];
    for (const cls of CLASSES) {
      const cd = old[cls.id];
      if (!cd) continue;
      // "Played" is deliberately generous. Someone who spent gold on gear and
      // never finished a run still has an account, and dropping it because the
      // run counter is zero would be the worst possible read of the data.
      const touched = (cd.xp | 0) > 0 || (cd.runs | 0) > 0 || (cd.bestWave | 0) > 0
        || Object.keys(cd.talents || {}).length > 0
        || Object.keys(cd.gear || {}).length > 0
        || Object.keys(cd.forge || {}).length > 0;
      if (touched) played.push([cls, cd]);
    }

    this.data.nextCharId = 1;
    this.data.characters = played.map(([cls, cd]) => ({
      ...emptyCharacter(cls, this.data.nextCharId++),
      ...cd,
      // The old record had no identity of its own, so these three come from
      // the conversion rather than from the save.
      id: this.data.nextCharId - 1,
      name: cls.name,
      classId: cls.id,
    }));
    // Land on whichever they played last, so the update does not silently
    // switch which character the main menu is talking about.
    const last = this.data.characters.find((c) => c.classId === parsed.lastClass);
    this.data.activeChar = last ? last.id : (this.data.characters[0] || {}).id ?? null;
    return true;
  }

  /**
   * Talent points used to come from best wave. They now come from level, and a
   * save written before levels existed has no XP at all — so every player with
   * a talent build would have opened this update to find it wiped and no
   * points to rebuild it with.
   *
   * So: grant whatever XP their old point total was worth. They keep every
   * point they had, their spent talents still validate, and from here on the
   * points come from levelling like everyone else's.
   */
  migrateToLevels() {
    let changed = false;
    for (const cd of this.data.characters) {
      if (cd.xp || !cd.bestWave) continue;
      const owed = talentPointsForBestWave(cd.bestWave);
      if (owed <= 0) continue;
      cd.xp = xpToReach(Math.min(MAX_LEVEL, owed + 1));
      changed = true;
    }
    return changed;
  }

  /**
   * The Forge lost thirteen tracks and every remaining one had its cap cut from
   * 100 to 10. A save holding levels in either would simply lose them, and the
   * player would have no way to tell that from the update having eaten their
   * account — so every gold piece spent on anything that no longer exists is
   * paid back, at exactly what it cost.
   *
   * Refunding rather than remapping is the honest option: there is no
   * equivalent of "level 74 Titanbane" in a shop that no longer sells boss
   * damage, and inventing one would be a guess dressed up as a conversion.
   */
  forgeLevels(charId) {
    const cd = this.character(charId);
    if (!cd) return {};
    if (!cd.forge) cd.forge = {};
    return cd.forge;
  }

  refundForge() {
    let refund = 0;
    let changed = false;
    // The old account-wide bag. Everything in it is refunded outright: it is
    // not just that tracks were retired, it is that the shop moved to being
    // per class, and there is no honest way to decide which of nine classes
    // an account-wide purchase should now belong to.
    for (const [id, level] of Object.entries(this.data.permanent || {})) {
      const priced = PERMANENT_BY_ID[id] || { baseCost: 60, growth: 1.085 };
      for (let lv = 0; lv < level; lv++) refund += upgradeCost(priced, lv);
      delete this.data.permanent[id];
      changed = true;
    }
    // And per-class bags, for anything retired or now above the cap.
    for (const cd of this.characters) {
      for (const [id, level] of Object.entries(cd.forge || {})) {
        const def = PERMANENT_BY_ID[id];
        const keep = def ? Math.min(level, def.max) : 0;
        if (keep === level) continue;
        // upgradeCost(def, n) is the price of going from n to n+1, so the
        // levels being taken away are [keep, level).
        const priced = def || { baseCost: 60, growth: 1.085 };
        for (let lv = keep; lv < level; lv++) refund += upgradeCost(priced, lv);
        if (keep > 0) cd.forge[id] = keep; else delete cd.forge[id];
        changed = true;
      }
    }
    if (refund > 0) this.bankRefund(refund);
    return changed;
  }

  /** Refunds from every migration land in one figure the menu can announce. */
  bankRefund(amount) {
    const n = Math.round(amount);
    if (n <= 0) return;
    this.data.souls += n;
    this.pendingRefund = (this.pendingRefund || 0) + n;
  }

  /**
   * The Armoury went from fourteen account-wide slots with no ceiling to six
   * per-class slots across seven level-gated tiers. There is no honest mapping
   * between the two — "tier 74 Idol" has no equivalent in a shop that no longer
   * sells boss damage — so every gold piece spent on the old one is paid back
   * exactly, and the player re-spends it here at whatever tier their level
   * allows.
   *
   * Deleting the old bag is what makes this run once: on the next boot there is
   * nothing left to refund.
   */
  refundArmoury() {
    const old = this.data.armor;
    if (!old || !Object.keys(old).length) return false;
    this.bankRefund(legacyArmorRefund(old));
    this.data.armor = {};
    return true;
  }

  /**
   * Repair gear bags from disk. A save from before this existed has none, and
   * one written by a build with different slots can hold keys that no longer
   * mean anything — both have to end up as something `gearMods` can read.
   *
   * Nothing is refunded here: the only tiers that can be out of range are ones
   * no build ever sold.
   */
  normaliseGear() {
    for (const cd of this.characters) {
      const clean = {};
      for (const slot of GEAR_SLOT_IDS) {
        const t = ownedTier(cd.gear, slot);
        if (t >= 0) clean[slot] = Math.min(MAX_TIER, t);
      }
      cd.gear = clean;
      cd.raid = normaliseRaidState(cd.raid);
      // A save written before the Potion Shop existed has no rack at all, and
      // a hand-edited one could have a negative count or a potion that was
      // since removed. Both become an empty shelf rather than a crash.
      const rack = {};
      for (const def of POTIONS) {
        const n = Math.floor(Number((cd.potions || {})[def.id]) || 0);
        if (n > 0) rack[def.id] = Math.min(POTION_STACK, n);
      }
      cd.potions = rack;
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

  // --- The roster ----------------------------------------------------------

  /** Every character on the account, in the order they were made. */
  get characters() {
    if (!Array.isArray(this.data.characters)) this.data.characters = [];
    return this.data.characters;
  }

  /**
   * One character by id, or the active one when called with nothing.
   *
   * Every per-character method funnels through here, so a stale id — a deleted
   * character still referenced by a menu that has not refreshed — resolves to
   * *something* rather than throwing halfway through drawing a screen. It
   * falls back to the active character, then to the first one on the roster.
   */
  character(charId) {
    const list = this.characters;
    if (charId !== undefined && charId !== null) {
      const found = list.find((c) => c.id === charId);
      if (found) return found;
    }
    const active = list.find((c) => c.id === this.data.activeChar);
    return active || list[0] || null;
  }

  /**
   * Resolve "who is playing" from either a character id or a class definition.
   *
   * Character ids are numbers and class definitions are objects, so the two
   * can never be confused. The class form exists for the harnesses — a
   * balance sim wants "run this as a Warrior" and has no interest in the
   * roster — and it finds that class's first character, making one if the
   * account has none. Returns a character id.
   */
  resolveChar(who) {
    if (who && typeof who === 'object' && who.id !== undefined && typeof who.id === 'string') {
      const existing = this.characters.find((c) => c.classId === who.id);
      if (existing) return existing.id;
      const made = this.createCharacter(who.id);
      return made ? made.id : null;
    }
    const ch = this.character(who);
    return ch ? ch.id : null;
  }

  /** The class definition a character plays. */
  classOf(charId) {
    const ch = this.character(charId);
    return CLASSES.find((c) => c.id === (ch && ch.classId)) || CLASSES[0];
  }

  /** Which character the menus are talking about. */
  get activeChar() {
    const ch = this.character();
    return ch ? ch.id : null;
  }

  setActive(charId) {
    if (!this.characters.some((c) => c.id === charId)) return false;
    this.data.activeChar = charId;
    this.save();
    return true;
  }

  /** Room for another? The cap governs creation only — see MAX_CHARACTERS. */
  canCreate() { return this.characters.length < MAX_CHARACTERS; }

  /**
   * Make a character and select it.
   *
   * Names are automatic and only disambiguate: the second Warrior is
   * "Warrior 2". A roster of eight where three are called Warrior is a roster
   * you cannot navigate, and asking a player to type a name before they have
   * played is a wall in front of the game.
   */
  createCharacter(classId) {
    if (!this.canCreate()) return null;
    const cls = CLASSES.find((c) => c.id === classId) || CLASSES[0];
    const sameClass = this.characters.filter((c) => c.classId === cls.id).length;
    const name = sameClass ? `${cls.name} ${sameClass + 1}` : cls.name;
    const ch = emptyCharacter(cls, this.data.nextCharId || 1, name);
    this.data.nextCharId = (this.data.nextCharId || 1) + 1;
    this.characters.push(ch);
    this.data.activeChar = ch.id;
    this.save();
    return ch;
  }

  /**
   * Delete one, freeing its slot. Its gold stays on the account — gold was
   * never the character's, and taking it back would punish a player for
   * clearing out a slot they had stopped using.
   */
  deleteCharacter(charId) {
    const i = this.characters.findIndex((c) => c.id === charId);
    if (i < 0) return false;
    this.characters.splice(i, 1);
    if (this.data.activeChar === charId) {
      this.data.activeChar = this.characters.length ? this.characters[0].id : null;
    }
    this.save();
    return true;
  }

  /**
   * Change which class a character plays, keeping everything that is not about
   * the class.
   *
   * Level, gear, Forge, raid record and potions all survive, because none of
   * them is class-specific — a tier 3 chest is a tier 3 chest. Talents cannot:
   * the trees are different shapes and a Warrior's Arms ranks mean nothing on
   * a Priest. So the points come back unspent, which is a respec rather than a
   * loss, and the skill bar resets to what the new class starts with.
   */
  switchClass(charId, classId) {
    const ch = this.character(charId);
    const cls = CLASSES.find((c) => c.id === classId);
    if (!ch || !cls || ch.classId === classId) return false;
    ch.classId = cls.id;
    ch.talents = {};
    ch.loadout = defaultLoadout(cls, this.level(ch.id)).map((s) => s.id);
    // Rename only if the old name was the one we gave it. A name the player
    // never chose should follow the class; one they did choose is theirs.
    if (CLASSES.some((c) => ch.name === c.name || ch.name.startsWith(c.name + ' '))) {
      const others = this.characters.filter((c) => c !== ch && c.classId === cls.id).length;
      ch.name = others ? `${cls.name} ${others + 1}` : cls.name;
    }
    this.save();
    return true;
  }

  // --- Gear ------------------------------------------------------------------

  /** A class's six slots. Shared gold, separate gear — see `armor.js`. */
  gear(charId) {
    const cd = this.character(charId);
    if (!cd) return {};
    if (!cd.gear) cd.gear = {};
    return cd.gear;
  }

  /**
   * The Cores this class has earned, as a Set of core ids.
   *
   * Per class, like the raid record it is read from. Gold is the only thing
   * that crosses between classes — a Core earned on the Hunter buys the Hunter
   * nothing on the Warrior, which is the whole point of the two being separate.
   */
  cores(charId) {
    return earnedCores(this.raidState(charId));
  }

  /** Which raid bosses this class has put down. */
  raidState(charId) {
    const cd = this.character(charId);
    if (!cd) return emptyRaidState();
    if (!cd.raid) cd.raid = emptyRaidState();
    return cd.raid;
  }

  /**
   * Buy the next tier of one slot, or fail with the reason why.
   *
   * Every gate lives in `canBuy` rather than here, so the button that is drawn
   * disabled and the purchase that is refused agree by construction instead of
   * by two copies of the same conditions staying in step.
   */
  buyGear(charId, slotId) {
    const gear = this.gear(charId);
    // canBuy is keyed by *class* — the piece names and their flavour come from
    // it — while everything else here is keyed by character.
    const verdict = canBuy(this.classOf(charId).id, slotId, gear, this.level(charId),
      this.souls, this.cores(charId));
    if (!verdict.ok) return verdict;
    this.data.souls -= verdict.cost;
    gear[slotId] = verdict.next;
    this.save();
    return verdict;
  }

  // --- The Potion Shop -----------------------------------------------------

  /** What this class is carrying, `{ health: 3 }`. Live object — mutate it. */
  potions(charId) {
    const cd = this.character(charId);
    if (!cd) return {};
    if (!cd.potions) cd.potions = {};
    return cd.potions;
  }

  /** How many of one kind this class holds. */
  potionCount(charId, potionId) {
    return Math.max(0, Math.min(POTION_STACK, (this.potions(charId)[potionId] | 0)));
  }

  /** What one costs this class right now — the price follows its level. */
  potionPriceFor(charId, potionId) {
    return potionPrice(potionId, this.level(charId));
  }

  /**
   * Buy one, or say why not. Mirrors `buyGear`: the verdict is computed in one
   * place so the disabled button and the refused purchase cannot disagree.
   *
   * Returns `{ ok, reason, cost, count }`.
   */
  buyPotion(charId, potionId) {
    if (!this.character(charId)) return { ok: false, reason: 'nobody', cost: 0, count: 0 };
    const cost = this.potionPriceFor(charId, potionId);
    const held = this.potionCount(charId, potionId);
    if (held >= POTION_STACK) return { ok: false, reason: 'full', cost, count: held };
    if (this.souls < cost) return { ok: false, reason: 'poor', cost, count: held };
    this.data.souls -= cost;
    this.potions(charId)[potionId] = held + 1;
    this.save();
    return { ok: true, cost, count: held + 1 };
  }

  /**
   * Drink one. Returns false if the shelf was empty, so the caller can play a
   * refusal rather than a swallow.
   *
   * Written through immediately rather than at the end of the run: a potion
   * drunk on the wave that killed you is spent, and a player who closed the
   * tab mid-fight should not find it back on the shelf.
   */
  consumePotion(charId, potionId) {
    const held = this.potionCount(charId, potionId);
    if (held <= 0) return false;
    const rack = this.potions(charId);
    if (held === 1) delete rack[potionId];
    else rack[potionId] = held - 1;
    this.save();
    return true;
  }

  // --- Skill loadout -------------------------------------------------------

  /**
   * The skill objects a class will take into the arena — at most four, and
   * fewer while it is still low enough that it has not learned four.
   *
   * The level is what gates this now, not best wave. Passing the wrong number
   * here is the one mistake that would let a locked skill into a run, so it is
   * read from the same place the menus read it.
   */
  loadout(charId) {
    const cd = this.character(charId);
    if (!cd) return [];
    return resolveLoadout(this.classOf(cd.id), cd.loadout, this.level(cd.id));
  }

  /** Persist a loadout, normalised so a bad list can never be stored. */
  setLoadout(charId, ids) {
    const cd = this.character(charId);
    if (!cd) return [];
    cd.loadout = resolveLoadout(this.classOf(cd.id), ids, this.level(cd.id)).map((s) => s.id);
    this.save();
    return cd.loadout;
  }

  // --- Mastery -------------------------------------------------------------

  masteryRank(charId) { return masteryRank((this.character(charId) || {}).mastery || 0); }

  masteryProgress(charId) { return masteryProgress((this.character(charId) || {}).mastery || 0); }

  spentTalentPoints(charId) {
    const ranks = (this.character(charId) || {}).talents || {};
    return Object.values(ranks).reduce((a, b) => a + b, 0);
  }

  // --- Levels ---------------------------------------------------------------

  /** Total XP this class has banked. */
  classXp(charId) { return (this.character(charId) || {}).xp || 0; }

  level(charId) { return levelFromXp(this.classXp(charId)); }

  /** Level, progress into it, and the raw numbers the bar is drawn from. */
  levelProgress(charId) { return levelProgress(this.classXp(charId)); }

  totalTalentPoints(charId) {
    return talentPointsForLevel(this.level(charId));
  }

  availableTalentPoints(charId) {
    return this.totalTalentPoints(charId) - this.spentTalentPoints(charId);
  }

  respec(charId) {
    const cd = this.character(charId);
    if (!cd) return;
    cd.talents = {};
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

  finishRun(charId, { wave, kills, souls, duration, quests, xp }) {
    const cd = this.character(charId);
    if (!cd) return;
    // Banked before anything else so `lastLevelUps` is available to the
    // results screen in the same call that produced it.
    const before = this.level(charId);
    cd.xp = (cd.xp || 0) + Math.max(0, Math.round(xp || 0));
    this.lastLevelUps = [];
    for (let L = before + 1; L <= this.level(charId); L++) this.lastLevelUps.push(L);
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
    // Quest progress is banked here so it lands in the same write as the run
    // it came from — two separate saves means a crash between them can pay a
    // quest for a run that was never recorded, or the reverse.
    this.lastQuestsFinished = quests
      ? applyProgress(this.questState, quests.deltas, quests.peaks)
      : [];
    this.save();
  }
}
