// Game core: owns the world, entities, combat resolution and the wave loop.

import { createArena, LAYOUT_COUNT, LAYOUT_NAMES } from '../world/world.js';
import { BLOCKS } from '../world/blocks.js';
import { Player, buildMods } from './player.js';
import { Mob, MOB_TYPES, createRaidBoss } from './mobs.js';
import { Fiend } from './pets.js';
import { Projectile, Particle, Gib, Telegraph, Shockwave, Zone, Potion, FloatText, hexToRgb } from './effects.js';
import { TEAM, drawHumanoid } from './entity.js';
import { WaveDirector, waveScaling, waveClearBonus, isBossWave } from './waves.js';
import { permanentMods, masteryMods, masteryRank } from '../data/permanent.js';
import { difficultyFor } from '../data/difficulty.js';
import { affixesForWave, affixSoulBonus } from '../data/affixes.js';
import { rollPotion, POTIONS, POTION_BY_ID, DROP_CHANCE, ELITE_DROP_CHANCE, BOSS_DROPS, POTION_LIFETIME } from '../data/potions.js';
import { xpForRun, xpForWave, XP_PER_KILL, XP_ELITE_MULT, XP_BOSS_MULT } from '../data/levels.js';
import { gearMods, mergeMods, ownedTier, weaponAppearance, gearCost, GEAR_BY_ID } from '../data/armor.js';
import { MECHANICS, coreSlotFor, bossGold } from '../data/raids.js';
import { forwardVec, clamp, rand, dist2 } from '../core/math.js';
import { T } from '../render/atlas.js';
import { CLASS_BY_ID } from '../data/classes.js';
import { ELEMENTS, elementOf, tagOrDetonate, tagOn } from './elements.js';
import { Ghost, DuelScore, duelSpawns, roundOutcome, classSkin, ROUND_TIME } from './pvp.js';

/** Players per side, by match mode. */
const DUEL_SIZES = { '1v1': 1, '2v2': 2, '3v3': 3 };

/** Two decimals: a tenth of a block, and about half the JSON. */
const r2 = (n) => Math.round(n * 100) / 100;

/** What a seat with no input yet is doing: standing still. */
const IDLE_INPUT = {
  moveX: 0, moveY: 0, lookX: 0, lookY: 0,
  attack: false, jump: false, sprint: false, pause: false,
  skills: [false, false, false, false], potions: [false, false, false],
};

const INTERMISSION = 4.0;

/** How many enemies get their silhouette parts drawn in a frame. */
const DETAIL_BUDGET = 12;

// Raids reuse the arena generator until they get rooms of their own. Layout 0
// is the open one, which is what every raid mechanic in the set assumes: slam
// and shadow both need a 16-block clear radius around the boss, and a layout
// full of cover turns "run out of the circle" into "run into a pillar".
const RAID_LAYOUT = 0;
// The renderer's themes 0-3 are the arenas; 4-10 are one per raid, in RAIDS
// order. A theme carries the sky gradient, the sun, the bounce light and now
// the fog distance, which between them do most of the work of making a room
// feel like a place: grey stone lit from below by a lake of fire, or a frost
// castle in deep blue air at 28/78 instead of the 34/82 every room used to
// share.
const RAID_THEME_BASE = 4;
const raidTheme = (raid) => RAID_THEME_BASE + raid.tier;

/**
 * Which side of a duel an entity fights for.
 *
 * A pet answers with its owner's side, which is the only reason this is a
 * function rather than a field read: a fiend has no team of its own and must
 * never be hittable by the person who summoned it.
 */
function duelTeamOf(e) {
  if (!e) return 0;
  if (e.duelTeam !== undefined) return e.duelTeam;
  if (e.owner && e.owner.duelTeam !== undefined) return e.owner.duelTeam;
  return 0;
}

export class Game {
  constructor(renderer, audio, profile) {
    this.r = renderer;
    this.audio = audio;
    this.profile = profile;
    this.reset();
  }

  reset() {
    this.mobs = [];
    this.projectiles = [];
    this.particles = [];
    this.telegraphs = [];
    this.shockwaves = [];
    this.zones = [];
    this.potions = [];
    this.floaters = [];
    this.beams = [];
    this.gibs = [];
    this.pets = [];
    this.timers = [];
    this.running = false;
    this.paused = false;
    this.over = false;
    this.time = 0;
    this.timeSinceCombat = 0;
    this.wave = 0;
    this.pendingUpgrades = null;
    this.rerollsLeft = 0;
    this.notifications = [];
    this.screenShake = 0;
    this.hitMarker = 0;
    this.soulsEarned = 0;
    // Kill combo. The whole point is to make pressing forward pay: souls are
    // the only currency, and the multiplier only survives if you keep killing.
    this.combo = 0;
    this.comboTimer = 0;
    this.comboBest = 0;
    this.recordBeaten = false;
    this.affixes = [];
    this.affixSeed = 0;
    this.stormTimer = 0;
    this.grievous = 0;
    this.grievousTimer = 0;
    this.hitstop = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    // Everything quests measure. Counted here rather than derived at the end
    // because most of it — elites, potions, casts — leaves no trace once the
    // run is over.
    this.tally = {
      eliteKills: 0, bossKills: 0, potionsDrunk: 0, skillsCast: 0, affixWaves: 0,
      // Raids had no quest coverage at all: forty-two bosses, seven rooms, and
      // nothing in the log ever mentioned them. These four are the metrics the
      // new templates read.
      raidKills: 0, critHits: 0, flawlessWaves: 0, mechanicsSurvived: 0,
    };
    // Health at the start of the current wave, so "cleared without being hit"
    // can be answered without tracking every source of damage.
    this.waveStartHp = 0;
    // XP is accumulated live rather than totalled at the end, because the HUD
    // bar has to fill while you play — a progress bar that only moves on the
    // results screen is a results screen, not a progress bar.
    this.xpEarned = 0;
    // Pending XP waiting to be shown. One popup per kill would be a hundred
    // popups a wave by wave 30; batching turns that into one readable number.
    this.xpPending = 0;
    this.xpFlush = 0;
    this.xpPops = [];
    // Which mode the loop is in. 'arena' is the endless run; 'raid' is one
    // boss in one room with no director and no affixes.
    this.mode = 'arena';
    this.raid = null;
    this.raidBoss = null;
    this.raidBossIndex = 0;
    this.raidCleared = false;
    this.raidPotion = 0;
    this.coreDrop = null;
    // Duel state. `fighters` being null is what every targeting helper tests
    // to decide whether a hostile is a mob or a person, so it is null and not
    // an empty array — an empty array would mean "a duel with nobody in it",
    // and the arena would quietly stop being able to find anything to hit.
    this.fighters = null;
    this.duel = null;
    this.duelScore = null;
    this.ghosts = [];
    this.netEvents = [];
    this.netProjectiles = null;
    this.netZones = [];
  }

  /** True while the named wave affix is in force. */
  hasAffix(id) {
    for (const a of this.affixes) if (a.id === id) return true;
    return false;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** `opts.layout` forces an arena layout; used by the balance harness. */
  /**
   * Start a run for one character.
   *
   * Takes a character id, not a class. Progress is filed under the character
   * now — two Warriors have their own levels, gear and Forge — so the class
   * def is derived from it rather than passed alongside it, and there is no
   * way to start a run with a class that disagrees with whose gear is loaded.
   */
  startRun(who, opts = {}) {
    this.reset();
    // `who` is a character id. The harnesses pass a class definition instead —
    // a balance sim wants "run this as a Warrior" and has no roster — and
    // resolveChar turns that into this account's first character of the class.
    const charId = this.profile.resolveChar(who);
    const cd = this.profile.character(charId);
    const classDef = this.profile.classOf(charId);
    // The id resolveChar handed back, not `cd.id`. The record is a plain bag
    // of progress and does not have to carry its own key — the harness's does
    // not — so the id the lookup succeeded with is the one to keep.
    this.charId = charId;
    this.cls = classDef;
    // Permanent power comes from three sources that all flatten into the same
    // bag: the Forge, the Armoury and this character's mastery rank. All three
    // are per character now — only gold is shared — so a fresh character starts
    // with the level it has earned and nothing it has not.
    const perm = permanentMods(this.profile.forgeLevels(this.charId));
    mergeMods(perm, gearMods(classDef.id, this.profile.gear(this.charId)));
    for (const [k, v] of Object.entries(masteryMods(masteryRank(cd.mastery || 0)))) {
      perm[k] = (perm[k] || 0) + v;
    }
    this.permMods = perm;
    // The tier is fixed for the whole run: changing it mid-run would let a
    // player bank the higher soul rate and then dial the danger back down.
    this.difficulty = difficultyFor(
      opts.difficulty !== undefined ? opts.difficulty : this.profile.settings.difficulty);
    this.loadout = this.profile.loadout(this.charId);
    this.baseMods = () => buildMods(classDef, cd.talents, perm);

    // Fixed for the run: the affix draw must survive a pause, a HUD redraw and
    // a wave being re-read, so it is a pure function of (seed, wave) and the
    // seed is rolled exactly once, here.
    this.affixSeed = opts.seed !== undefined ? opts.seed : (Math.random() * 0x7fffffff) | 0;
    this.theme = opts.theme !== undefined ? opts.theme : (Math.random() * 4) | 0;
    this.layout = opts.layout !== undefined
      ? opts.layout % LAYOUT_COUNT
      : (Math.random() * LAYOUT_COUNT) | 0;
    // The block seed is normally rolled here and never mentioned again. A duel
    // has to pass it across the wire instead: two players generating the same
    // layout from different seeds get two different rooms, and the symptom is
    // each of them standing in a wall the other cannot see.
    this.worldSeed = opts.worldSeed !== undefined
      ? opts.worldSeed : 1 + ((Math.random() * 9000) | 0);
    this.world = createArena(this.theme, this.worldSeed, this.layout,
      { raid: opts.raid || null });
    this.r.setWorld(this.world);
    // The renderer owns the palette now: sky gradient, sun colour and the
    // hemispheric bounce all come from one themed set.
    this.r.setTheme(this.theme);

    this.player = new Player(classDef, this.baseMods(), this.world, this.loadout);
    // Set-bonus payloads that need somewhere to put an explosion. Wired here
    // rather than inside Player because the player has no idea the world it
    // is standing in exists.
    this.player.onDotExpired = (victim, dot) => {
      const k = this.player.mods.dotBurst;
      if (!k || victim.dead) return;
      this.explode(victim.x, victim.centerY, victim.z, 4,
        (dot.total || dot.dps * 4) * k,
        { team: TEAM.PLAYER, source: this.player, color: '#a35cff', knockback: 0 });
    };
    // The weapon in your hands is the visible half of the gear system, so the
    // tier is resolved once here rather than looked up every frame by the view
    // model. `-1` is "no weapon bought" and draws the class's plain starting
    // look, which is what a level-1 character should be holding.
    this.player.weapon = weaponAppearance(
      classDef, ownedTier(this.profile.gear(this.charId), 'weapon'));
    this.director = new WaveDirector(this.difficulty);
    this.rerollsLeft = perm.rerolls || 0;
    this.running = true;
    this.over = false;
    this.startTime = performance.now();

    // Mastery talents that grant a skill free ranks. Applied before Head Start
    // so a specialised skill is already ahead when the run's own ranks land on
    // top of it — that head start is the whole reason to spec into one skill
    // instead of spreading points across the generic branches.
    this.player.skills.forEach((skill, i) => {
      const free = Math.floor(this.player.skillMods(skill.id).startRank || 0);
      for (let n = 0; n < free; n++) this.player.rankUp(i);
    });
    // Head Start: free skill ranks before wave 1, spread across the loadout.
    const freebies = perm.startingUpgrades || 0;
    for (let i = 0; i < freebies; i++) this.player.rankUp(i % this.player.skills.length);

    // A raid announces its own name and its boss; the arena's layout name would
    // be a third banner naming a place the player is not in.
    if (!opts.raid) this.notify(LAYOUT_NAMES[this.layout] + ' Arena', 3);
    this.beginIntermission(2.0);
    this.audio.startMusic();
  }

  // -------------------------------------------------------------------------
  // Raids
  // -------------------------------------------------------------------------

  /**
   * One boss, one room, no waves.
   *
   * A raid reuses everything a run already sets up — mods, gear, loadout,
   * arena — and then replaces the wave director with a single spawn. It is a
   * different *mode*, not a different game, and keeping it on the same
   * foundations is what makes it affordable: the Forge, the Armoury, talents,
   * potions and every skill work here because nothing about them was special
   * cased.
   *
   * The whole run is one attempt at one boss. Killing it takes the Core and
   * offers the next; dying takes nothing at all, which is the rule the entire
   * progression rests on.
   */
  startRaid(who, raid, bossIndex) {
    const boss = raid.bosses[bossIndex];
    if (!boss) return false;
    this.startRun(who, { layout: RAID_LAYOUT, theme: raidTheme(raid), raid });
    this.mode = 'raid';
    this.raid = raid;
    this.raidBossIndex = bossIndex;
    this.raidCleared = false;
    // Kept after the kill so the window between fights can name what was just
    // fought. `raidBoss` is nulled on death; this is not.
    this.lastBoss = boss;
    // No wave director, no rank-up cards, no affixes: a raid boss is already
    // carrying three mechanics and a phase model, and a wave affix on top of
    // that is a rule nobody has room left to read.
    this.director.state = 'raid';
    this.affixes = [];
    this.wave = raid.tier + 1;
    const pt = this.world.pickSpawn(this.player.x, this.player.z, 18);
    this.raidBoss = createRaidBoss(raid, boss, pt.x, pt.y + 0.4, pt.z);
    this.mobs.push(this.raidBoss);
    this.notify(`${raid.name.toUpperCase()}`, 3.0);
    this.notify(boss.name, 3.0);
    this.notify(MECHANICS[boss.mechanic].blurb, 3.4);
    this.audio.setMusicIntensity(0.85);
    return true;
  }

  // -------------------------------------------------------------------------
  // Duels
  // -------------------------------------------------------------------------

  /**
   * Start a hosted match.
   *
   * `cfg` is the terms both sides agreed on over the wire — seed, layout,
   * theme, mode — and every one of them has to be honoured exactly, because
   * the two clients are not exchanging a world, they are each building one and
   * trusting it to come out the same.
   *
   * `roster` is everyone in the match including you, already assigned to
   * sides. `net` decides which half of the mode runs here: a host builds a
   * real Player for every seat and simulates all of them; a joiner builds one
   * real Player for itself and a Ghost for everyone else.
   */
  startDuel(who, cfg, roster, net) {
    this.startRun(who, {
      seed: cfg.seed, worldSeed: cfg.seed, layout: cfg.layout, theme: cfg.theme,
      difficulty: 0,
    });
    this.mode = 'duel';
    this.duel = net || null;
    this.director.state = 'duel';
    this.affixes = [];
    this.wave = 0;
    // A duel pays nothing and costs nothing. Stated as a flag rather than left
    // implicit so that every place that banks a result has one thing to test,
    // and so that adding a reward later is a deliberate act rather than an
    // oversight in a mode the host can edit.
    this.noRewards = true;

    const size = (DUEL_SIZES[cfg.mode] || 1);
    const marks = duelSpawns(this.world, size);
    this.duelSpawnMarks = marks;
    this.duelSize = size;
    this.duelScore = new DuelScore(cfg.roundsToWin || 3);

    // Seats, in roster order, so both sides number them the same way.
    this.fighters = [];
    this.ghosts = [];
    for (const seat of roster) {
      if (seat.id === (net ? net.localId : 'h')) {
        this.player.duelId = seat.id;
        this.player.duelTeam = seat.team;
        this.player.duelName = seat.name;
        this.fighters.push(this.player);
      } else if (net && net.isHost) {
        this.fighters.push(this.buildRemoteFighter(seat));
      } else {
        const g = new Ghost(seat);
        g.duelId = seat.id;
        g.duelTeam = seat.team;
        this.ghosts.push(g);
        this.fighters.push(g);
      }
    }
    this.placeFighters();
    this.notify(cfg.mode.toUpperCase() + '  ·  FIRST TO ' + this.duelScore.roundsToWin, 3);
    this.audio.setMusicIntensity(0.9);
    return true;
  }

  /**
   * A player the host simulates on someone else's behalf.
   *
   * A real Player, not a puppet. Their skills, cooldowns, resource and gear
   * all run here under the host's clock, driven by the input their machine
   * sends — which is the entire reason the mode is affordable. The alternative
   * is a second simulation model for "other people", and two models for the
   * same thing is how a fight ends up meaning different things at each end.
   *
   * Their gear and talents come from what they told us on join. That is the
   * trust boundary and it points the other way from the usual one: the host
   * can cheat against a joiner, and a joiner can cheat about their own
   * character. Between friends, both are fine; it is why the mode banks
   * nothing.
   */
  buildRemoteFighter(seat) {
    const classDef = CLASS_BY_ID[seat.classId];
    if (!classDef) throw new Error('unknown class in roster: ' + seat.classId);
    const mods = buildMods(classDef, seat.talents || {}, seat.perm || {});
    const p = new Player(classDef, mods, this.world, seat.loadout);
    p.duelId = seat.id;
    p.duelTeam = seat.team;
    p.duelName = seat.name;
    p.weapon = weaponAppearance(classDef, seat.weaponTier ?? -1);
    for (let i = 0; i < (seat.ranks || 0); i++) p.rankUp(i % p.skills.length);
    return p;
  }

  /** Put everyone back on their mark, healed, for the start of a round. */
  placeFighters() {
    const used = [0, 0];
    for (const f of this.fighters) {
      const team = f.duelTeam || 0;
      const mark = this.duelSpawnMarks[team][used[team]++ % this.duelSize];
      f.x = mark.x; f.y = mark.y; f.z = mark.z;
      f.vx = f.vy = f.vz = 0;
      f.yaw = mark.yaw;
      f.dead = false;
      f.counted = false;
      f.hp = f.maxHp;
      if (f.buffs) f.buffs.length = 0;
      if (f.dots) f.dots.length = 0;
      f.absorb = 0; f.freeze = 0; f.stun = 0; f.root = 0; f.slow = 0;
      if (f.cooldowns) f.cooldowns.fill(0);
      if (f.resourceDef) f.resource = f.resourceDef.startFull ? f.resourceMax : 0;
    }
    // Nothing in flight survives a round boundary. A fireball that outlives
    // the round it was cast in would kill someone during the scoreboard.
    this.projectiles.length = 0;
    this.zones.length = 0;
    this.telegraphs.length = 0;
    this.pets.length = 0;
  }

  /**
   * Round clock and scoring. Host only — a joiner is told the result rather
   * than working it out, because two machines deciding independently who won
   * a round is two machines that will eventually disagree about the match.
   */
  updateDuel(dt) {
    const s = this.duelScore;
    if (!s || s.over) return;
    if (s.breakTimer > 0) {
      s.breakTimer -= dt;
      if (s.breakTimer <= 0) {
        this.placeFighters();
        s.timer = ROUND_TIME;
        this.notify('ROUND ' + s.round, 2);
      }
      return;
    }
    s.timer -= dt;
    const outcome = s.timer <= 0 ? -2 : roundOutcome(this.fighters);
    if (outcome === -1) return;
    const done = s.award(outcome === -2 ? -1 : outcome);
    this.notify(outcome === -2 ? 'DRAW'
      : (outcome === this.player.duelTeam ? 'ROUND WON' : 'ROUND LOST'), 2.4);
    if (done) {
      this.notify(s.winner === this.player.duelTeam ? 'VICTORY' : 'DEFEAT', 4);
      this.over = true;
    }
  }

  /**
   * The whole world, as the host sees it, small enough to send twenty times a
   * second.
   *
   * Rounded to two decimals throughout, which is a tenth of a block — below
   * what anyone can see at these speeds and roughly half the JSON. Everything
   * a far side can derive is left out: a name, a class and a colour were sent
   * once at join and never belong in a per-frame message.
   */
  collectSnapshot() {
    const players = this.fighters.map((f) => ({
      i: f.duelId,
      x: r2(f.x), y: r2(f.y), z: r2(f.z), a: r2(f.yaw),
      h: Math.round(f.hp), m: Math.round(f.maxHp),
      s: f.dead ? 3 : (f.swing > 0.05 ? 2 : (Math.hypot(f.vx, f.vz) > 0.6 ? 1 : 0)),
      // The receiving player's own HUD is driven from here rather than from a
      // local guess. Cooldowns and resource are exactly the numbers a player
      // makes decisions on, and a decision made against a stale cooldown is
      // the one bug in a networked action game nobody forgives.
      r: r2(f.resource || 0),
      c: (f.cooldowns || []).map(r2),
    }));
    const projectiles = this.projectiles.map((p) => ({
      x: r2(p.x), y: r2(p.y), z: r2(p.z), s: r2(p.size), c: p.color,
    }));
    const zones = this.zones.map((z) => ({
      x: r2(z.x), y: r2(z.y), z: r2(z.z), r: r2(z.radius || 3), c: z.color,
    }));
    const events = this.netEvents;
    this.netEvents = [];
    const s = this.duelScore;
    return {
      p: players, j: projectiles, z: zones, e: events,
      sc: s ? { s: s.score, r: s.round, t: r2(s.timer), b: r2(s.breakTimer), o: s.over, w: s.winner } : null,
    };
  }

  /**
   * Take one snapshot, as a joiner.
   *
   * Everyone else is assigned outright. The local player is *corrected*, not
   * assigned: its position was predicted locally from the same input the host
   * has, so the two agree within a few centimetres almost always, and snapping
   * to the host's answer sixty times a second would make your own character
   * shiver. Past a threshold the prediction is simply wrong — you were
   * knocked back, or a packet was lost — and then the host wins outright,
   * because a smooth glide to a position you are not in is worse than a jump
   * to one you are.
   */
  applySnapshot(snap) {
    if (!this.fighters) return;
    for (const ps of snap.p || []) {
      const f = this.fighters.find((x) => x.duelId === ps.i);
      if (!f) continue;
      if (f === this.player) {
        // Kept for the HUD's connection readout and for the harness, which
        // measures prediction drift against exactly this.
        this.lastOwnSnap = ps;
        const off = Math.hypot(f.x - ps.x, f.y - ps.y, f.z - ps.z);
        if (off > 2.5) { f.x = ps.x; f.y = ps.y; f.z = ps.z; }
        else if (off > 0.12) {
          f.x += (ps.x - f.x) * 0.18;
          f.y += (ps.y - f.y) * 0.18;
          f.z += (ps.z - f.z) * 0.18;
        }
        // Health, resource and cooldowns are never predicted. There is no
        // local approximation of "did that land" that is worth being wrong
        // about, so these are simply taken.
        f.hp = ps.h; f.maxHp = ps.m;
        f.resource = ps.r;
        if (ps.c) for (let i = 0; i < f.cooldowns.length; i++) f.cooldowns[i] = ps.c[i] || 0;
        f.dead = ps.s === 3;
      } else if (f.applySnap) {
        f.applySnap(ps);
      }
    }
    // Projectiles and zones are drawn straight from the wire rather than
    // simulated. A joiner that integrated them would have to also know every
    // rule about what stops one, and getting that subtly wrong is a fireball
    // that hangs in a wall.
    this.netProjectiles = snap.j || [];
    this.netZones = snap.z || [];
    for (const e of snap.e || []) this.playNetEvent(e);
    if (snap.sc && this.duelScore) {
      const s = this.duelScore;
      const wasRound = s.round;
      s.score = snap.sc.s; s.round = snap.sc.r; s.timer = snap.sc.t;
      s.breakTimer = snap.sc.b; s.over = snap.sc.o; s.winner = snap.sc.w;
      if (s.round !== wasRound) this.notify('ROUND ' + s.round, 2);
      if (s.over && !this.over) {
        this.notify(s.winner === this.player.duelTeam ? 'VICTORY' : 'DEFEAT', 4);
        this.over = true;
      }
    }
  }

  /** Replay one host visual locally. Pure presentation — nothing here hits. */
  playNetEvent(e) {
    if (e.k === 's') this.shockwaves.push(new Shockwave(e.x, e.y, e.z, e.r, e.c));
    else if (e.k === 'b') this.burst(e.x, e.y, e.z, e.n, e.c);
    else if (e.k === 'm') this.beam(e.a[0], e.a[1], e.a[2], e.a[3], e.a[4], e.a[5], e.c);
    else if (e.k === 't') this.telegraphs.push(new Telegraph(e.x, e.y, e.z, e.r, e.d, null, e.c));
    else if (e.k === 'a') this.audio.play(e.n);
  }

  /**
   * Raid upkeep, run once a frame instead of the wave director.
   *
   * The potion drip is the whole sustain model. Four of the nine classes have
   * no heal in their opening loadout and there is no healer, so without this a
   * raid would be winnable only by classes that brought one. It is positional
   * on purpose — you have to leave the boss to take it, which is exactly the
   * trade a solo fight should be asking about.
   */
  updateRaid(dt) {
    if (!this.raidBoss) return;
    this.raidPotion = (this.raidPotion || 0) - dt;
    if (this.raidPotion <= 0) {
      this.raidPotion = 25;
      const pt = this.world.pickSpawn(this.player.x, this.player.z, 12);
      const def = rollPotion();
      this.potions.push(new Potion(pt.x, pt.y + 0.6, pt.z, def, POTION_LIFETIME));
    }
    if (!this.raidBoss.dead) return;
    // The kill. This is the only path that consumes a boss — a wipe leaves
    // `killed` untouched, which is what makes an attempt free.
    this.raidBoss = null;
    this.raidCleared = true;
    if (this.tally) this.tally.raidKills++;
    // Adds die with their summoner. Leaving a pack standing over the corpse
    // turns the reward screen into a fight the player has already won.
    for (const m of this.mobs) if (m.isAdd && !m.dead) { m.dead = true; this.burst(m.x, m.centerY, m.z, 8, '#c06cff'); }
    this.awardCore();
  }

  /**
   * Take the Core and pay the gold. Idempotent by construction: the profile
   * records the boss id, and a boss already recorded pays nothing again.
   */
  awardCore() {
    const raid = this.raid;
    const boss = raid.bosses[this.raidBossIndex];
    const state = this.profile.raidState(this.charId);
    if (state.killed[boss.id]) return;
    state.killed[boss.id] = true;
    const slot = coreSlotFor(this.raidBossIndex);
    const gold = bossGold(raid, this.raidBossIndex, gearCost(raid.tier));
    this.soulsEarned += gold;
    this.profile.save();
    this.audio.play('bossdown');
    this.impactFlash('#ffd24a', 0.9);
    this.screenShake = Math.max(this.screenShake, 0.6);
    this.notify(`T${raid.tier} ${GEAR_BY_ID[slot].name.toUpperCase()} CORE`, 3.2);
    this.notify(`+${Math.round(gold)} 🪙`, 2.4);
    this.coreDrop = { tier: raid.tier, slot, gold: Math.round(gold) };
  }

  /**
   * Stand the fight down without ending the run, so the between-fights window
   * has something to sit on top of. The player keeps everything: the Core and
   * the gold were written to the save the instant the boss died, before this
   * is ever called.
   */
  holdRaid() {
    this.paused = true;
  }

  /**
   * The next boss, with health, resource and cooldowns restored. Not a fresh
   * run: the arena, the mods and every rank earned so far stay exactly as they
   * are, because a raid is one sitting and re-rolling the room between bosses
   * would make it six unrelated fights.
   */
  continueRaid() {
    const next = this.raid.bosses[this.raidBossIndex + 1];
    if (!next) return false;
    this.raidBossIndex++;
    this.raidCleared = false;
    this.coreDrop = null;
    this.lastBoss = next;
    this.restoreForNextBoss();
    const pt = this.world.pickSpawn(this.player.x, this.player.z, 18);
    this.raidBoss = createRaidBoss(this.raid, next, pt.x, pt.y + 0.4, pt.z);
    this.mobs.push(this.raidBoss);
    this.notify(next.name, 3.0);
    this.notify(MECHANICS[next.mechanic].blurb, 3.4);
    this.paused = false;
    return true;
  }

  /** The same boss, from the top. A wipe costs nothing, so nothing is taken. */
  retryRaid() {
    const boss = this.raid.bosses[this.raidBossIndex];
    this.over = false;
    this.running = true;
    this.raidCleared = false;
    this.coreDrop = null;
    // Everything the last attempt left on the floor. A retry that begins
    // inside the previous attempt's bombs is not the same fight.
    this.mobs.length = 0;
    this.zones.length = 0;
    this.telegraphs.length = 0;
    this.projectiles.length = 0;
    this.timers.length = 0;
    this.player.dead = false;
    this.restoreForNextBoss();
    const pt = this.world.pickSpawn(this.player.x, this.player.z, 18);
    this.raidBoss = createRaidBoss(this.raid, boss, pt.x, pt.y + 0.4, pt.z);
    this.mobs.push(this.raidBoss);
    this.notify(boss.name, 3.0);
    this.paused = false;
    return true;
  }

  restoreForNextBoss() {
    const p = this.player;
    p.hp = p.maxHp;
    p.resource = p.resourceDef.startFull ? p.resourceMax : 0;
    p.cooldowns = p.cooldowns.map(() => 0);
    p.absorb = 0;
    p.dots.length = 0;
    p.slow = 0;
    p.root = 0;
    p.freeze = 0;
    this.raidPotion = 25;
  }

  beginIntermission(duration = INTERMISSION) {
    this.director.state = 'intermission';
    this.director.intermission = duration;
    this.intermissionTotal = duration;
  }

  nextWave() {
    this.wave++;
    this.waveStartHp = this.player ? this.player.hp : 0;
    this.killedThisWave = 0;
    this.spawnBehind = false;
    // The one moment a run stops being routine. Called out once, loudly.
    const best = (this.profile.character(this.charId) || {}).bestWave || 0;
    if (!this.recordBeaten && best > 0 && this.wave > best) {
      this.recordBeaten = true;
      this.notify('NEW RECORD', 3.2);
      this.audio.play('rankup');
      this.screenShake = Math.max(this.screenShake, 0.35);
    }
    this.affixes = affixesForWave(this.wave, this.affixSeed, this.difficulty);
    this.stormTimer = 3.5;
    this.grievous = 0;
    this.director.startWave(this.wave);
    this.notify(isBossWave(this.wave) ? `WAVE ${this.wave} — BOSS` : `WAVE ${this.wave}`, 2.4);
    // Named one per line rather than as a single run-on banner: the counterplay
    // is per affix, and a wall of text at the moment the wave starts is text
    // nobody reads.
    for (const a of this.affixes) this.notify(`${a.icon}  ${a.name} — ${a.blurb}`, 3.4);
    this.audio.play('wave');
    this.audio.setMusicIntensity(Math.min(1, this.wave / 25));
  }

  /**
   * What the next wave will be played under. Shown during the intermission so
   * the rules are something you plan around rather than discover mid-fight.
   */
  get upcomingAffixes() {
    return affixesForWave(this.wave + 1, this.affixSeed, this.difficulty);
  }

  /**
   * Clearing a wave ranks up one of the four equipped skills. Stat cards made
   * every run feel the same — a slightly bigger number on the same rotation.
   * Choosing which skill grows is a decision about how the rest of the run is
   * played, and it is legible at a glance because it is your own icons.
   */
  offerUpgrades() {
    this.pendingUpgrades = this.player.skills.map((skill, index) => ({
      index,
      skill,
      rank: this.player.rankOf(index),
    }));
    this.paused = true;
  }

  rerollUpgrades() {
    // Nothing to reroll: the choice is always your own four skills.
    return false;
  }

  /** `up` is one of the descriptors offerUpgrades() produced. */
  chooseUpgrade(up) {
    let rank = this.player.rankUp(up.index);
    // Fortune: a chance the wave pays out twice. Capped, because a run that
    // reliably doubles every reward outgrows the waves it is clearing.
    const luck = clamp(this.permMods.luck || 0, 0, 0.5);
    let bonus = false;
    if (luck > 0 && Math.random() < luck) {
      rank = this.player.rankUp(up.index);
      bonus = true;
    }
    // Surviving a wave restores you. Without any stat growth in a run, the
    // only other way to arrive at a boss alive is to have taken no damage at
    // all for five waves, which is not a plan — it is luck.
    this.player.hp = this.player.maxHp;
    // Every fifth wave is a boss, and a boss is a power check: the whole
    // loadout gains a rank so the spike is met with a spike.
    let mastered = false;
    if (isBossWave(this.wave + 1)) {
      for (let i = 0; i < this.player.skills.length; i++) this.player.rankUp(i);
      mastered = true;
    }
    this.pendingUpgrades = null;
    this.paused = false;
    this.audio.play('rankup');
    this.notify(`${up.skill.name} — rank ${rank}${bonus ? '  (Fortune!)' : ''}`, 2.2);
    if (mastered) this.notify('All skills +1 rank', 2.4);
    this.beginIntermission();
  }

  /**
   * Dying ends an arena run. It does not end a raid.
   *
   * A raid wipe is free and repeatable, and `endRun` banks the run — gold, XP,
   * quest progress, the lot. Calling it on a wipe and then retrying would bank
   * the same attempt twice, once per death, which is the one way a system
   * built on "wipes cost nothing" could quietly pay out for failing. So a raid
   * death only stops the fight; the window between fights decides what happens
   * next, and the run is banked when the player chooses to stop.
   */
  onPlayerDeath() {
    if (this.mode === 'raid') { this.audio.play('death'); this.paused = true; return; }
    this.endRun();
  }

  endRun() {
    if (this.over) return;
    this.over = true;
    this.running = false;
    this.audio.play('death');
    this.audio.stopMusic();
    const duration = (performance.now() - this.startTime) / 1000;
    const wavesCleared = Math.max(0, this.wave - 1);
    this.result = {
      wave: wavesCleared,
      reachedWave: this.wave,
      kills: this.player.kills,
      souls: Math.round(this.soulsEarned),
      duration,
      damageDealt: Math.round(this.player.damageDealt),
    };
    this.profile.finishRun(this.charId, {
      wave: wavesCleared, kills: this.player.kills,
      souls: this.result.souls, duration,
      quests: this.questReport(wavesCleared),
      // Waves *cleared*, not reached: dying on wave 12 pays for eleven. Paying
      // for the wave you died in would make walking into a pack and dying the
      // fastest way to level, which is not a strategy worth rewarding.
      // The live total, not a recomputation. The HUD bar has been showing this
      // number all run; banking a different one would mean the bar was lying.
      xp: Math.round(this.xpEarned),
    });
    this.result.xp = Math.round(this.xpEarned);
    this.result.levelUps = this.profile.lastLevelUps || [];
    this.questsFinished = this.profile.lastQuestsFinished || [];
  }

  /**
   * What this run contributed, split the way the quest log needs it: `deltas`
   * accumulate forever, `peaks` only ever replace a previous best. Getting
   * that split wrong is the one bug here a player would actually notice — a
   * "reach wave 20" quest ticking up four every run.
   */
  questReport(wavesCleared) {
    return {
      deltas: {
        kills: this.player.kills,
        eliteKills: this.tally.eliteKills,
        bossKills: this.tally.bossKills,
        wavesCleared,
        damageDealt: Math.round(this.player.damageDealt),
        potionsDrunk: this.tally.potionsDrunk,
        skillsCast: this.tally.skillsCast,
        affixWaves: this.tally.affixWaves,
        raidKills: this.tally.raidKills,
        critHits: this.tally.critHits,
        flawlessWaves: this.tally.flawlessWaves,
        mechanicsSurvived: this.tally.mechanicsSurvived,
        goldEarned: Math.round(this.soulsEarned),
        runs: 1,
      },
      peaks: {
        bestWave: this.wave,
        bestCombo: this.comboBest,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Helpers used by mobs, skills and effects
  // -------------------------------------------------------------------------

  /**
   * Bank XP and queue it to be shown.
   *
   * Nothing is drawn here. The amount goes into a pending pot that flushes
   * once the killing stops for a moment, so a burst of eight kills reads as
   * one "+16 XP" instead of eight "+2 XP" fighting each other for the same
   * few pixels. That is the whole difference between a progress cue and
   * visual noise.
   */
  awardXp(amount) {
    if (!(amount > 0)) return;
    amount *= 1 + (this.permMods.xpGain || 0);
    this.xpEarned += amount;
    this.xpPending += amount;
    // Restarted on every award, so a continuous fight shows nothing until
    // there is a gap — and a gap is exactly when a player has the attention
    // to read a number.
    this.xpFlush = 0.55;
  }

  updateXpPops(dt) {
    if (this.xpPending > 0) {
      this.xpFlush -= dt;
      // Flushed on a timer, but also whenever the pot gets large enough that
      // waiting would feel like the game had stopped counting.
      if (this.xpFlush <= 0 || this.xpPending >= 400) {
        this.xpPops.push({ amount: Math.round(this.xpPending), life: 1.15, max: 1.15 });
        this.xpPending = 0;
        this.xpFlush = 0;
        // Three at once is the most that stays readable; older ones go first.
        while (this.xpPops.length > 3) this.xpPops.shift();
      }
    }
    for (const p of this.xpPops) p.life -= dt;
    if (this.xpPops.length) this.xpPops = this.xpPops.filter((p) => p.life > 0);
  }

  /**
   * A brief full-screen wash in the colour of whatever just happened. Drawn by
   * the HUD, decayed here, and deliberately short — anything longer than a few
   * frames stops being punctuation and starts obscuring the fight.
   */
  impactFlash(color, strength) {
    if (strength <= (this.flash || 0)) return;
    this.flash = Math.min(0.9, strength);
    this.flashColor = color || '#ffffff';
  }

  notify(text, duration = 1.6) {
    this.notifications.push({ text, life: duration, max: duration });
    if (this.notifications.length > 4) this.notifications.shift();
  }

  sfx(name) { this.audio.play(name); this.netEvent({ k: 'a', n: name }); }

  /**
   * The moment an ultimate goes off.
   *
   * Deliberately louder than anything else in the game. This is the one button
   * that has to be *earned* — a full charge is twenty-odd seconds of a fight
   * you were in — and if pressing it feels like pressing a fourth cooldown
   * then the whole system is a fifth skill with an unusual timer on it.
   *
   * Time stops for a fifth of a second, the screen flashes the class's colour,
   * a ring goes out from under your feet, and the name of the thing you just
   * did is on screen. None of it does damage; all of it is the point.
   */
  onUltimate(player) {
    const color = player.cls.accent || player.cls.color;
    this.hitstop = Math.max(this.hitstop, 0.20);
    this.screenShake = Math.max(this.screenShake, 0.7);
    player.fovPunch = 16;
    // The room itself lights up in the class's colour for as long as the
    // shockwave lasts.
    this.r.addLight(player.x, player.y + 1.2, player.z, 22, hexToRgb(color), 2.6);
    this.impactFlash(color, 1.0);
    this.shockwave(player.x, player.y + 0.1, player.z, 5, color);
    this.shockwaves.push(new Shockwave(player.x, player.y + 0.1, player.z, 9.5, color, 0.8));
    this.burst(player.x, player.centerY, player.z, 46, color);
    // A column of light where the player is standing, which is what tells
    // everyone else in a duel that somebody just spent theirs.
    for (let i = 0; i < 26; i++) {
      this.particles.push(new Particle(
        player.x + rand(1.1, -1.1), player.y + i * 0.28, player.z + rand(1.1, -1.1),
        rand(1.2, -1.2), 5 + Math.random() * 5, rand(1.2, -1.2),
        color, 0.7 + Math.random() * 0.5, 0.3, -3));
    }
    this.audio.play('levelup');
    this.audio.play('explode');
    if (player === this.player) this.notify(player.ult.name.toUpperCase(), 2.4);
  }

  /**
   * A heartbeat under a quarter health. Audio is the only channel that reaches
   * a player whose eyes are on the crowd, and the red vignette alone is easy
   * to miss in a busy fight.
   */
  updateHeartbeat(dt) {
    const p = this.player;
    if (!p || p.dead) { this.heartbeat = 0; return; }
    const frac = p.hp / p.maxHp;
    if (frac > 0.25) { this.heartbeat = 0; return; }
    this.heartbeat = (this.heartbeat || 0) - dt;
    if (this.heartbeat > 0) return;
    // Faster the closer to death: 1.2s at the threshold, 0.55s at the brink.
    this.heartbeat = 0.55 + (frac / 0.25) * 0.65;
    this.audio.play('lowhp');
  }

  /**
   * The moment a skill goes off: a ring of motes thrown outward from the
   * caster's hands, brighter and wider the higher the skill is ranked. Cheap
   * — a dozen particles — but it is what makes a cast feel like it left the
   * character rather than simply happening somewhere.
   */
  /** A cone of sparks thrown along a hit direction. */
  burstDirected(x, y, z, dx, dz, count, color) {
    if (!this.r.fancy) return;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;
    for (let i = 0; i < count; i++) {
      const spread = rand(0.7, -0.7);
      const c = Math.cos(spread), s = Math.sin(spread);
      const vx = (nx * c - nz * s) * rand(7, 2.5);
      const vz = (nx * s + nz * c) * rand(7, 2.5);
      this.particles.push(new Particle(x, y, z, vx, rand(3.4, 0.6), vz,
        color, rand(0.34, 0.16), rand(0.10, 0.05), 16));
    }
  }

  castFlare(caster, color, rank = 0) {
    const n = 10 + Math.min(14, rank * 2);
    const spread = 1 + Math.min(1.4, rank * 0.12);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.time;
      const speed = (2.6 + Math.random() * 2.2) * spread;
      this.particles.push(new Particle(
        caster.x + Math.cos(a) * 0.34,
        caster.centerY + 0.15,
        caster.z + Math.sin(a) * 0.34,
        Math.cos(a) * speed, 1.4 + Math.random() * 1.6, Math.sin(a) * speed,
        color, 0.34 + Math.random() * 0.22, 0.10 + Math.min(0.10, rank * 0.012), 7));
    }
  }

  delay(seconds, fn) {
    if (seconds <= 0) { fn(); return; }
    this.timers.push({ t: seconds, fn });
  }

  blockDamageAt(x, y, z) {
    const id = this.world.blockAt(x, y, z);
    return BLOCKS[id] && BLOCKS[id].damage ? BLOCKS[id].damage : 0;
  }

  allies() {
    const list = [this.player, ...this.pets.filter((p) => !p.dead && !p.isTotem)];
    if (this.fighters) {
      const team = this.player.duelTeam;
      for (const f of this.fighters) if (f !== this.player && f.duelTeam === team) list.push(f);
    }
    return list.filter((e) => e && !e.dead);
  }

  /**
   * Everything `who` is allowed to hit.
   *
   * Outside a duel this is simply the mobs, and returning the live array
   * rather than a copy matters: it is read by every skill, every projectile
   * step and the aim assist, sixty times a second, with thirty enemies in it.
   *
   * Inside a duel there are no mobs and the answer is "the other side" — the
   * opposing players and anything they own. Every targeting helper in the game
   * goes through here, which is why a fireball, a chain lightning and a
   * whirlwind all learned to fight people without any of them being touched.
   */
  hostiles(who = this.player) {
    if (!this.fighters) return this.mobs;
    const team = duelTeamOf(who);
    const out = [];
    for (const f of this.fighters) if (!f.dead && f.duelTeam !== team) out.push(f);
    for (const p of this.pets) {
      if (!p.dead && !p.isTotem && p.owner && duelTeamOf(p.owner) !== team) out.push(p);
    }
    return out;
  }

  /** Enemy AI target selection — pets can pull aggro. */
  pickEnemyTarget(mob) {
    let best = this.player;
    let bestD = mob.distanceXZ(this.player);
    for (const p of this.pets) {
      if (p.dead || p.isTotem) continue;
      const d = mob.distanceXZ(p);
      if (d < bestD * 0.7) { best = p; bestD = d; }
    }
    return best;
  }

  nearestEnemy(x, y, z, maxDist, exclude = null, who = this.player) {
    let best = null, bestD = maxDist * maxDist;
    for (const m of this.hostiles(who)) {
      if (m.dead) continue;
      if (exclude && exclude.has(m)) continue;
      const d = dist2(x, y, z, m.x, m.centerY, m.z);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  /** The enemy the player is looking at, for targeted skills. */
  /**
   * `minDot` is how far off-centre a target may be. Skills use a wide cone so
   * a chain or a dash finds something; aim assist uses a tight one, because an
   * assist that acquires targets you were not pointing at does not help you
   * aim — it takes the aim away.
   */
  aimTarget(player, maxDist, minDot = 0.55) {
    const dir = forwardVec(player.yaw, player.pitch);
    let best = null, bestScore = -1;
    for (const m of this.hostiles(player)) {
      if (m.dead) continue;
      const dx = m.x - player.x, dy = m.centerY - player.eyeY, dz = m.z - player.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > maxDist || d < 0.001) continue;
      const dot = (dx * dir[0] + dy * dir[1] + dz * dir[2]) / d;
      if (dot < minDot) continue;
      const score = dot - d / maxDist * 0.3;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  enemiesInRadius(x, y, z, radius, who = this.player) {
    const r2 = radius * radius;
    return this.hostiles(who).filter((m) => !m.dead && dist2(x, y, z, m.x, m.centerY, m.z) <= r2);
  }

  enemiesInCone(source, range, halfAngle) {
    const dir = forwardVec(source.yaw, 0);
    const out = [];
    for (const m of this.hostiles(source)) {
      if (m.dead) continue;
      const dx = m.x - source.x, dz = m.z - source.z;
      const dy = m.centerY - source.centerY;
      const d = Math.hypot(dx, dz);
      if (d > range + m.width || Math.abs(dy) > 3.2) continue;
      if (d < 0.001) { out.push(m); continue; }
      const dot = (dx * dir[0] + dz * dir[2]) / d;
      if (dot >= Math.cos(halfAngle)) out.push(m);
    }
    return out;
  }

  /** Any hostile entity of the opposite team near a point (projectile hits). */
  findHit(x, y, z, radius, team, exclude, who = null) {
    // In a duel "the opposite team" is a duel team, not TEAM.PLAYER/ENEMY —
    // everyone on the floor is a player. The projectile carries its owner, so
    // the question is answerable without a second team field on every shot.
    const candidates = this.fighters
      ? this.hostiles(who || this.player)
      : (team === TEAM.PLAYER
        ? this.mobs
        : [this.player, ...this.pets.filter((p) => !p.isTotem)]);
    for (const e of candidates) {
      if (!e || e.dead) continue;
      if (exclude && exclude.has(e)) continue;
      const hw = e.width / 2 + radius;
      if (Math.abs(x - e.x) > hw || Math.abs(z - e.z) > hw) continue;
      if (y < e.y - radius || y > e.y + e.height + radius) continue;
      return e;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Combat resolution
  // -------------------------------------------------------------------------

  /** Player/pet -> enemy damage, with crit, lifesteal, thorns and floaters. */
  dealDamage(source, target, amount, opts = {}) {
    if (!target || target.dead) return 0;
    // Two different questions that used to be one. Everything a *character*
    // does — crit, lifesteal, bleed, resource gain — belongs to any player
    // character, which in a duel is up to six of them on the host. Everything
    // the *screen* does belongs to the one whose eyes the camera is behind.
    const isPlayer = !!(source && source.isPlayerKind);
    const isLocal = source === this.player;
    let dmg = amount;
    // A shield that only covers the front. Not more health — health you cannot
    // reach from one side, which turns a damage check into a positioning one.
    // Measured against the mob's facing rather than its velocity, so backing
    // away from it does not count as flanking it.
    const arc = target.def && target.def.blockArc;
    if (arc && source) {
      const fx = -Math.sin(target.yaw), fz = -Math.cos(target.yaw);
      const dx = source.x - target.x, dz = source.z - target.z;
      const d = Math.hypot(dx, dz) || 1;
      if ((dx / d) * fx + (dz / d) * fz > Math.cos(arc)) {
        dmg *= 1 - target.def.blockCut;
        opts = { ...opts, blocked: true };
      }
    }
    let crit = false;
    if (isPlayer) {
      crit = source.rollCrit(opts.forceCrit);
      if (crit) { dmg *= source.critMult; if (this.tally) this.tally.critHits++; }
      // Shatter: frozen targets take extra damage.
      if (source.mods.frozenDamage && target.freeze > 0) dmg *= 1 + source.mods.frozenDamage;
      // Titanbane and the class capstones that specialise into boss fights.
      if (source.stats.bossMult > 1 && target.def && target.def.boss) dmg *= source.stats.bossMult;
    } else if (opts.forceCrit) {
      crit = true;
      dmg *= 2;
    }

    const dealt = target.damage(dmg, { ...opts, source, crit });
    if (dealt <= 0) return 0;

    if (isPlayer) {
      source.damageDealt += dealt;
      // The ultimate fills from the fight itself. Dots feed it too — a
      // Warlock's damage is mostly rot, and an ultimate a Warlock could never
      // charge would be an ultimate a Warlock does not have.
      if (source.addUltCharge) source.addUltCharge(dealt, 0);
      if (source.lifesteal) source.heal(dealt * source.lifesteal);
      // Deep Wounds: crits leave a bleed scaled off the hit that landed.
      if (crit && source.mods.bleedPct && !opts.isDot && !target.dead) {
        target.applyDot(dealt * source.mods.bleedPct / 3, 3, 'bleed', source);
      }
      // Rage-style resources build by landing hits.
      if (!opts.isDot) {
        const perHit = (source.resourceDef.onHitGain || 0) + (source.mods.onHitGain || 0);
        if (perHit) source.gainResource(perHit);
      }
      if (source.mods.critCdr && crit) {
        for (let i = 0; i < source.cooldowns.length; i++) {
          source.cooldowns[i] = Math.max(0, source.cooldowns[i] - source.mods.critCdr);
        }
      }
      this.timeSinceCombat = 0;
    }

    if (isLocal) {
      this.hitMarker = crit ? 0.32 : 0.18;
      if (this.profile.settings.showDamage && !opts.silent) {
        this.floaters.push(new FloatText(
          target.x, target.centerY + 0.4, target.z,
          Math.round(dealt).toString(), crit ? '#ffd24a' : '#ffffff', crit));
      }
      this.audio.play(crit ? 'crit' : 'hit');
      // The weapon and the creature are two different sounds. Before this a
      // fight was all impacts and nothing in it was alive — the same clack
      // whether you hit a husk or a wall.
      if (target !== this.player && !target.dead) this.audio.play('mobhurt');
      if (crit) {
        this.screenShake = Math.max(this.screenShake, 0.22);
        this.hitstop = Math.max(this.hitstop, 0.045);
        // Sparks thrown along the blow, not scattered: the direction is what
        // makes a critical read as a hit rather than a light show.
        const kx = opts.kx || 0, kz = opts.kz || 0;
        this.burstDirected(target.x, target.centerY, target.z, kx, kz, 10, '#ffd24a');
      } else {
        this.burstDirected(target.x, target.centerY, target.z,
          opts.kx || 0, opts.kz || 0, 3, '#ffffff');
      }
    }

    // Elemental marks. After the damage, because a detonation is scaled off
    // the hit that caused it, and only for real hits — a rot ticking every
    // half second would tag the target sixteen times a cast and detonate on
    // whichever tick happened to follow a different skill.
    if (isPlayer && !opts.isDot && opts.element) {
      // The stored damage has to be read before the mark is spent —
      // `tagOrDetonate` clears it, and `detonate` reading it afterwards would
      // scale every detonation off zero and floor at one point of damage.
      const stored = target.elemTag ? target.elemTag.damage : 0;
      const popped = tagOrDetonate(this, source, target, opts.element, dealt);
      if (popped && !target.dead) this.detonate(source, target, popped, stored);
    }

    if (target.dead) this.onEnemyKilled(target, source, opts);
    return dealt;
  }

  /**
   * A mark going off.
   *
   * Routed through the same `explode` every other blast uses rather than
   * resolving its own damage, so it inherits crit, lifesteal, set bonuses,
   * floaters and the sound without any of them being written twice — and so a
   * detonation is visibly the same *kind* of event as a Meteor rather than a
   * number appearing.
   */
  detonate(source, target, elementId, stored) {
    const e = ELEMENTS[elementId];
    if (!e) return;
    const dmg = Math.max(1, (stored || 0) * e.blast);
    this.explode(target.x, target.centerY, target.z, e.radius, dmg, {
      team: TEAM.PLAYER, source, color: e.color, knockback: 2,
      freeze: e.freeze, stun: e.stun,
      // A detonation must not tag what it catches, or two marked enemies
      // beside each other would set each other off forever.
      element: null,
    });
    if (source === this.player) {
      this.notify(e.verb, 0.9);
      this.hitstop = Math.max(this.hitstop, 0.05);
    }
    this.audio.play('explode');
  }

  /** Enemy -> player damage, with dodge, armor and thorns. */
  damageEntity(source, target, amount, opts = {}) {
    if (!target || target.dead) return 0;
    // Same split as dealDamage: dodge and armour are the character's, the
    // screen shake and the hurt sound are the camera's.
    const isPlayer = !!target.isPlayerKind;
    const isLocal = target === this.player;
    if (isPlayer) {
      if (Math.random() < target.dodge) {
        if (isLocal) {
          this.floaters.push(new FloatText(target.x, target.centerY + 1, target.z, 'DODGE', '#7dffb0'));
          this.audio.play('dodge');
        }
        return 0;
      }
      amount *= 1 - target.armor;
    } else if (target.armorPct) {
      amount *= 1 - target.armorPct;
    }
    const dealt = target.damage(amount, opts);
    if (isPlayer && dealt > 0) {
      if (target.addUltCharge) target.addUltCharge(0, dealt);
      const r = target.resourceDef;
      if (r.onTakeGain) target.gainResource(r.onTakeGain);
      // Thorns reflect a share of the damage that actually landed.
      if (target.thorns && source && opts.melee !== false && source.damage) {
        source.damage(dealt * target.thorns, { source: target });
        if (source.dead) this.onEnemyKilled(source, target, {});
      }
      // Soul Link: split incoming damage with fiends. Only the local player
      // has pets in a duel — a remote player's fiends are simulated on the
      // host under their own owner, which is where this already looks.
      if (target.mods.soulLink) {
        const pets = this.pets.filter((p) => !p.dead && !p.isTotem && p.owner === target);
        if (pets.length) pets[0].damage(dealt * target.mods.soulLink, {});
      }
    }
    if (isLocal && dealt > 0) {
      this.timeSinceCombat = 0;
      this.screenShake = Math.max(this.screenShake, Math.min(0.45, dealt / this.player.maxHp * 1.6));
      // Lurch away from whatever hit you, scaled by how hard. A shove you can
      // feel is worth more than a number you have to read.
      const share = Math.min(1, dealt / (this.player.maxHp * 0.35));
      const side = source
        ? Math.sign((source.x - this.player.x) * Math.cos(this.player.yaw)
          - (source.z - this.player.z) * Math.sin(this.player.yaw)) || 1
        : 1;
      this.player.camJolt = clamp(this.player.camJolt + side * share * 0.16, -0.3, 0.3);
      this.audio.play('hurt');
      // Grievous: every hit deepens a wound that only closes if you break off.
      // Stacks rather than refreshes, so trading twenty small hits is worse
      // than eating one big one — which is exactly the habit it exists to break.
      if (this.hasAffix('grievous')) {
        this.grievous = Math.min(8, this.grievous + 1);
        this.grievousTimer = 0;
      }
      if (this.player.dead && this.mode !== 'duel') this.endRun();
    }
    return dealt;
  }

  healEntity(source, target, amount) {
    const healed = target.heal(amount);
    if (healed > 0) {
      if (this.profile.settings.showDamage) {
        this.floaters.push(new FloatText(target.x, target.centerY + 0.6, target.z,
          '+' + Math.round(healed), '#7dff9d'));
      }
      // Atonement: healing yourself also damages nearby enemies.
      if (source && source.isPlayerKind && source.mods.atonement) {
        for (const m of this.enemiesInRadius(target.x, target.centerY, target.z, 7, source)) {
          this.dealDamage(source, m, healed * source.mods.atonement, { silent: true });
        }
      }
    }
    return healed;
  }

  /** Seconds a combo survives without a kill. Shrinks as it climbs, so a long
   *  streak has to be *earned* rather than coasted on. */
  get comboWindow() {
    return Math.max(1.6, 4.0 - this.combo * 0.06);
  }

  /** Multiplier the current streak is worth. Capped so it stays a bonus. */
  get comboMult() {
    return 1 + Math.min(2.0, this.combo * 0.04);
  }

  updateCombo(dt) {
    if (this.combo <= 0) return;
    this.comboTimer -= dt;
    if (this.comboTimer > 0) return;
    this.combo = 0;
    this.comboTimer = 0;
  }

  onEnemyKilled(mob, killer, opts) {
    if (mob.counted) return;
    mob.counted = true;
    // A player going down in a duel is a round event, not a kill: no combo, no
    // souls, no XP, no drop. The whole mode pays nothing, and routing it
    // through the arena's kill path is how it would quietly start to.
    if (this.mode === 'duel' && mob.duelTeam !== undefined) {
      this.notify(`${mob.duelName || 'Player'} is down`, 2);
      this.audio.play('bossdown');
      return;
    }
    if (!(mob instanceof Mob)) return;

    this.combo++;
    this.comboTimer = this.comboWindow;
    this.comboBest = Math.max(this.comboBest, this.combo);
    // Every tenth kill in a streak is called out, with the cue pitched up by
    // the streak so the ear tracks it without looking at the counter.
    if (this.combo % 10 === 0) {
      this.notify(`${this.combo} KILL STREAK  ×${this.comboMult.toFixed(2)}`, 1.6);
      this.audio.play('levelup');
    }

    this.affixesOnKill(mob);
    this.onMobKilled(mob);
    // Warrior six-piece: whatever the bleed had left to do, it does at once.
    const burst = this.player.mods.bleedBurst;
    if (burst && mob.dots && mob.dots.length) {
      let left = 0;
      for (const d of mob.dots) if (d.source === this.player) left += d.dps * d.remaining;
      if (left > 0) {
        this.explode(mob.x, mob.centerY, mob.z, 5, left * burst,
          { team: TEAM.PLAYER, source: this.player, color: '#e0473c', knockback: 3 });
      }
    }
    // A corpse that makes more work. The halves are real enemies with the
    // same behaviour at a fraction of the size, not a cosmetic burst — the
    // point is that killing this one was not the end of it.
    const sp = mob.def.splitInto;
    if (sp && !mob.splitChild) {
      for (let i = 0; i < (mob.def.splitCount || 2); i++) {
        const a = (i / (mob.def.splitCount || 2)) * Math.PI * 2 + Math.random();
        const child = this.spawnMob(sp,
          mob.x + Math.cos(a) * 1.2, mob.y + 0.4, mob.z + Math.sin(a) * 1.2);
        if (!child) continue;
        const k = mob.def.splitScale || 0.6;
        child.splitChild = true;                 // and they do not split again
        // A third of the parent's health each, not half. At half, the two
        // halves together were 62% of what you just killed, and a Splitter was
        // silently worth 1.6 enemies of budget — the wave director had no idea
        // and the wave landed harder than the number it was built to.
        child.maxHp = Math.max(1, Math.round(mob.maxHp * k * 0.35));
        child.hp = child.maxHp;
        child.damageAmount = mob.damageAmount * k;
        child.width *= k; child.height *= k;
        child.souls = Math.max(1, Math.round(mob.souls * 0.3));
        child.vx = Math.cos(a) * 4; child.vz = Math.sin(a) * 4; child.vy = 4;
      }
      this.burst(mob.x, mob.centerY, mob.z, 16, '#c69cff');
      this.sfx('gib');
    }
    this.killedThisWave = (this.killedThisWave || 0) + 1;
    this.rollPotionDrop(mob);
    if (mob.def.boss) this.tally.bossKills++;
    else if (mob.elite) this.tally.eliteKills++;
    this.awardXp(XP_PER_KILL * (mob.def.boss ? XP_BOSS_MULT : mob.elite ? XP_ELITE_MULT : 1));

    // Affixes pay. A wave under three rules is the hardest thing in the run and
    // has to also be the best place to be, or the optimal play is to farm the
    // plain waves and the whole system is a tax.
    const soulMult = (1 + (this.player.mods.soulGain || 0) + affixSoulBonus(this.affixes))
      * this.comboMult;
    const souls = mob.souls * soulMult;
    this.soulsEarned += souls;
    this.player.souls += souls;
    this.player.onKill(mob);

    this.burst(mob.x, mob.centerY, mob.z, mob.def.boss ? 40 : 12,
      mob.elite ? '#ffd24a' : '#c0392b');
    this.spawnGibs(mob);
    this.deathFlourish(mob);
    this.audio.play(mob.def.boss ? 'bossdown' : 'gib');
    if (mob.def.boss) {
      this.screenShake = 0.6;
      this.hitstop = Math.max(this.hitstop, 0.28);
      this.impactFlash('#ffd24a', 0.85);
      this.audio.play('explode');
      this.notify('BOSS SLAIN  +' + Math.round(souls) + ' 🪙', 2.6);
    }

    // Chain Reaction / Living Bomb
    const explode = this.player.mods.corpseExplode || 0;
    if (explode > 0 && !mob.exploded) {
      this.explode(mob.x, mob.centerY, mob.z, 4.2, explode, {
        team: TEAM.PLAYER, source: this.player, color: '#ff8a3c', silentSelf: true,
      });
    }
    // Contagion: spread remaining rot to nearby enemies.
    const spread = this.player.mods.spread || 0;
    if (spread > 0 && mob.dots.length) {
      const dot = mob.dots[0];
      const near = this.enemiesInRadius(mob.x, mob.centerY, mob.z, 8).slice(0, spread);
      for (const n of near) n.applyDot(dot.dps, dot.remaining, dot.type, this.player);
    }
  }

  // -------------------------------------------------------------------------
  // Effect spawners
  // -------------------------------------------------------------------------

  fireProjectile(opts) {
    this.projectiles.push(new Projectile(opts));
  }

  explode(x, y, z, radius, damage, opts = {}) {
    const color = opts.color || '#ff8a3c';
    this.shockwave(x, y, z, radius, color);
    // A second, wider and slower ring: the leading edge sells the reach, the
    // trailing one sells the weight.
    this.shockwaves.push(new Shockwave(x, y, z, radius * 1.45, color, 0.62));
    this.burst(x, y, z, Math.min(70, 16 + radius * 6), color);
    // Debris thrown upward and out, which is what a blast in a voxel world
    // should kick up. Cheap and gated behind the fancy switch like the rest.
    if (this.r.fancy) {
      const chunks = Math.min(14, 4 + Math.round(radius));
      for (let i = 0; i < chunks; i++) {
        const a = (i / chunks) * Math.PI * 2 + Math.random();
        const sp = radius * rand(2.4, 1.1);
        this.gibs.push(new Gib(
          x + Math.cos(a) * 0.5, y + 0.4, z + Math.sin(a) * 0.5,
          Math.cos(a) * sp, rand(11, 5), Math.sin(a) * sp,
          hexToRgb(color), rand(0.26, 0.12), rand(1.6, 0.9), T.BLANK));
      }
    }
    this.audio.play('explode');
    this.screenShake = Math.max(this.screenShake, Math.min(0.75, radius * 0.075));
    // Big blasts stop time and wash the screen; small ones do neither. Tying
    // both to the radius is what keeps a Meteor feeling different from a
    // Fireball rather than every cast producing the same light show.
    if (radius >= 4) {
      this.hitstop = Math.max(this.hitstop, Math.min(0.13, radius * 0.017));
      this.impactFlash(color, Math.min(0.5, radius * 0.045));
      // A rising column of fire at the seat of the blast. A ring alone reads
      // as flat on a voxel floor; the column is what gives it a middle.
      if (this.r.fancy) {
        for (let i = 0; i < Math.min(26, radius * 4); i++) {
          const a = Math.random() * Math.PI * 2;
          const rr = Math.random() * radius * 0.4;
          this.particles.push(new Particle(
            x + Math.cos(a) * rr, y, z + Math.sin(a) * rr,
            Math.cos(a) * rand(2.2, 0.2), rand(14, 7), Math.sin(a) * rand(2.2, 0.2),
            color, rand(0.9, 0.45), rand(0.4, 0.18), 9));
        }
      }
    }

    if (opts.team === TEAM.PLAYER) {
      for (const m of this.enemiesInRadius(x, y, z, radius)) {
        if (opts.exclude === m) continue;
        const d = Math.hypot(m.x - x, m.z - z);
        const falloff = clamp(1 - d / radius * 0.55, 0.35, 1);
        const dx = m.x - x, dz = m.z - z;
        const dd = Math.hypot(dx, dz) || 1;
        if (opts.detonate) {
          const stored = m.totalDotDamageRemaining();
          m.dots.length = 0;
          this.dealDamage(opts.source, m, stored * 1.5, { silent: true });
        }
        this.dealDamage(opts.source, m, damage * falloff, {
          knockback: opts.knockback || 0, kx: dx / dd, kz: dz / dd,
          forceCrit: opts.forceCrit, skillId: opts.skillId, element: opts.element,
        });
        if (opts.burn) m.applyDot(opts.burn, 4, 'burn', opts.source);
        if (opts.stun) m.stun = Math.max(m.stun, opts.stun);
        if (opts.freeze) m.freeze = Math.max(m.freeze, opts.freeze);
      }
    } else {
      for (const a of this.allies()) {
        const d = Math.hypot(a.x - x, a.z - z);
        if (d > radius) continue;
        const falloff = clamp(1 - d / radius * 0.6, 0.3, 1);
        const dx = a.x - x, dz = a.z - z;
        const dd = Math.hypot(dx, dz) || 1;
        this.damageEntity(opts.source, a, damage * falloff, {
          knockback: opts.knockback || 6, kx: dx / dd, kz: dz / dd, melee: false,
        });
      }
    }
  }

  /**
   * Decide whether a kill leaves a potion behind. Elites and bosses are far
   * more generous on purpose: those are the kills you spend cooldowns on, and
   * a set-piece that pays nothing teaches you to walk around it.
   */
  /** A kill, heard. Bosses have their own banner and cue; this is everything else. */
  onMobKilled(mob) {
    if (!mob.def || mob.def.boss) return;
    this.audio.play('mobdie');
  }

  rollPotionDrop(mob) {
    if (!mob.def) return;
    // A Spiteful shade is spawned by a kill, so paying out for killing it
    // would turn one affix into an unbounded potion fountain.
    if (mob.isShade) return;
    const luck = 1 + (this.permMods.potionChance || 0);
    let drops = 0;
    if (mob.def.boss) drops = BOSS_DROPS;
    else if (Math.random() < (mob.elite ? ELITE_DROP_CHANCE : DROP_CHANCE) * luck) drops = 1;
    for (let i = 0; i < drops; i++) {
      const def = rollPotion();
      this.potions.push(new Potion(
        mob.x + rand(0.6, -0.6), mob.centerY + 0.3, mob.z + rand(0.6, -0.6),
        def, POTION_LIFETIME));
    }
    if (drops) this.audio.play('drop');
  }

  /**
   * Drink one off the belt — the rack bought in the Potion Shop, drunk with a
   * tap on its icon or the 5/6/7 keys.
   *
   * The same effect as walking over a dropped one, deliberately. A bought
   * potion that were stronger would make the shop the correct answer to every
   * fight, and one that were weaker would make it a tax on not finding drops.
   * What you buy is convenience: having it when the wave turns, rather than
   * having to cross the arena to where it fell.
   */
  drinkCarried(potionId) {
    const def = POTION_BY_ID[potionId];
    if (!def || this.player.dead) return false;
    if (!this.profile.consumePotion(this.charId, potionId)) {
      this.audio.play('deny');
      return false;
    }
    this.applyPotion(def);
    const p = this.player;
    this.burst(p.x, p.y + 0.9, p.z, 18, def.glow);
    this.shockwave(p.x, p.y, p.z, 1.8, def.glow);
    return true;
  }

  /** Walked over a potion. */
  collectPotion(potion) {
    const def = potion.def;
    this.applyPotion(def);
    this.burst(potion.x, potion.y + 0.3, potion.z, 18, def.glow);
    this.shockwave(potion.x, potion.y, potion.z, 1.8, def.glow);
  }

  /** What a potion does, wherever it came from. */
  applyPotion(def) {
    const p = this.player;
    // Potency lifts what a potion does, not how often one shows up — those are
    // separate tracks so a player can chase either without buying the other.
    const pot = 1 + (this.permMods.potionPower || 0);
    if (def.heal) this.healEntity(p, p, p.maxHp * def.heal * pot);
    if (def.duration > 0) {
      // Keyed by the potion id, so a second Draught of Fury refreshes the
      // timer instead of stacking into something the balance never saw.
      p.addBuff('potion_' + def.id, {
        duration: def.duration,
        damageBonus: (def.damageBonus || 0) * pot,
        moveSpeed: (def.moveSpeed || 0) * pot,
        attackSpeedBonus: (def.attackSpeedBonus || 0) * pot,
        icon: '🧪',
        color: def.color,
        name: def.name,
      });
    }
    this.tally.potionsDrunk++;
    this.notify(`${def.name} — ${def.blurb}`, 2.0);
    this.audio.play(def.heal ? 'quaff' : 'buff');
  }

  /** Leave a lingering hazard on the ground. */
  // -------------------------------------------------------------------------
  // Replication
  // -------------------------------------------------------------------------
  //
  // A joiner runs no combat simulation, so nothing it sees happens on its own
  // machine: the bodies come from the snapshot, and the *moments* — a blast, a
  // beam, a ring on the floor — come from here. Every effect in the game
  // already funnels through five methods, which is the only reason this is
  // twenty lines instead of a second renderer. Hooking the primitives rather
  // than the callers means a skill written tomorrow replicates for free.

  /** Record one visual for the joiners. Free and silent when not hosting. */
  netEvent(e) {
    if (!this.netHosting) return;
    // Bounded. A joiner that stops acknowledging must not turn into an
    // unbounded queue on the host — the newest frame is the one that matters.
    if (this.netEvents.length < 96) this.netEvents.push(e);
  }

  /** True while this machine is the authority for a duel. */
  get netHosting() {
    return this.mode === 'duel' && this.duel && this.duel.isHost;
  }

  spawnZone(x, y, z, opts) {
    this.zones.push(new Zone(x, y, z, opts));
  }

  telegraph(x, y, z, radius, delay, onComplete, color) {
    this.telegraphs.push(new Telegraph(x, y, z, radius, delay, onComplete, color));
    this.netEvent({ k: 't', x, y, z, r: radius, d: delay, c: color });
  }

  shockwave(x, y, z, radius, color) {
    this.shockwaves.push(new Shockwave(x, y, z, radius, color));
    this.netEvent({ k: 's', x, y, z, r: radius, c: color });
  }

  burst(x, y, z, count, color) {
    this.netEvent({ k: 'b', x, y, z, n: count, c: color });
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(
        x, y, z,
        rand(5, -5), rand(7, 0.5), rand(5, -5),
        color, rand(0.7, 0.3), rand(0.22, 0.08)));
    }
  }

  beam(x0, y0, z0, x1, y1, z1, color) {
    this.beams.push({ x0, y0, z0, x1, y1, z1, color: hexToRgb(color || '#ffffff'), life: 0.16, max: 0.16 });
    this.netEvent({ k: 'm', a: [x0, y0, z0, x1, y1, z1], c: color });
  }

  spawnMob(typeId, x, y, z, elite = false) {
    const scaling = waveScaling(this.wave, this.difficulty);
    const mob = new Mob(typeId, this.wave, x, y, z, scaling);
    if (elite) mob.makeElite();
    this.applyAffixes(mob);
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Stamp the wave's rules onto a newly spawned enemy. Applied here rather than
   * in the Mob constructor so anything summoned mid-wave — a Broodmother's
   * spawn, a Spiteful shade — is bound by the same rules as the wave it joined.
   */
  applyAffixes(mob) {
    if (!this.affixes.length) return mob;
    const boss = !!(mob.def && mob.def.boss);
    for (const a of this.affixes) {
      switch (a.id) {
        case 'fortified':
          // Trash only. Paired with Tyrannical it would make every wave a wall;
          // split, each one tells you where to spend your cooldowns.
          if (!boss) {
            mob.maxHp = Math.round(mob.maxHp * 1.55);
            mob.hp = mob.maxHp;
          }
          break;
        case 'tyrannical':
          if (boss) {
            mob.maxHp = Math.round(mob.maxHp * 1.45);
            mob.hp = mob.maxHp;
            mob.damageAmount *= 1.25;
          }
          break;
        case 'quickened':
          mob.speed *= 1.22;
          break;
        case 'warded':
          // A flat share of health, so a ward is worth the same fraction of a
          // fight on any enemy — and big single hits are the efficient answer.
          mob.absorb = (mob.absorb || 0) + mob.maxHp * (boss ? 0.20 : 0.35);
          mob.warded = true;
          break;
        case 'frenzied':
          mob.frenzyAffix = true;
          break;
        default: break;
      }
    }
    return mob;
  }

  /** Corpse-triggered affixes. Called from onEnemyKilled. */
  affixesOnKill(mob) {
    if (!this.affixes.length) return;
    const scale = waveScaling(this.wave, this.difficulty);
    for (const a of this.affixes) {
      switch (a.id) {
        case 'volatile': {
          // Scales off the wave, not off the enemy: otherwise clearing trash
          // would be free and the one big kill would be the only dangerous one.
          const dmg = 7 * scale.damage * (mob.def.boss ? 2.4 : 1);
          this.telegraph(mob.x, mob.y, mob.z, 3.6, 0.55, () => {
            this.explode(mob.x, mob.y + 0.6, mob.z, 3.6, dmg, {
              team: TEAM.ENEMY, source: null, color: a.color, knockback: 5,
            });
          }, a.color);
          break;
        }
        case 'sanguine':
          this.spawnZone(mob.x, mob.y, mob.z, {
            radius: 3.0, dps: 6 * scale.damage, team: TEAM.ENEMY,
            source: null, color: a.color, duration: 7, heals: 0.05,
          });
          break;
        case 'spiteful': {
          // Not every corpse — a shade per kill turns a cleared wave into a
          // second wave. One in three keeps it a threat you can outpace.
          if (mob.isShade || Math.random() > 0.34) break;
          const shade = this.spawnMob('wraith', mob.x, mob.y + 0.4, mob.z, false);
          shade.isShade = true;
          shade.souls = 0;              // no soul farm off an infinite spawner
          shade.maxHp = Math.max(1, Math.round(shade.maxHp * 0.35));
          shade.hp = shade.maxHp;
          shade.speed *= 1.35;
          this.burst(mob.x, mob.centerY, mob.z, 10, a.color);
          break;
        }
        default: break;
      }
    }
  }

  /**
   * Storming: lightning walks the arena on a timer, aimed near the player but
   * never on them — the telegraph is the whole mechanic, and a strike you
   * cannot step out of is just unavoidable damage with extra steps.
   */
  updateAffixes(dt) {
    if (!this.affixes.length || !this.player || this.player.dead) return;
    if (!this.hasAffix('storming')) return;
    this.stormTimer -= dt;
    if (this.stormTimer > 0) return;
    this.stormTimer = 2.4;
    const scale = waveScaling(this.wave, this.difficulty);
    const a = Math.random() * Math.PI * 2;
    const d = 3.5 + Math.random() * 5;
    const x = this.player.x + Math.cos(a) * d;
    const z = this.player.z + Math.sin(a) * d;
    const y = this.world.groundAt(x, z, this.player.y + 3);
    this.telegraph(x, y, z, 2.6, 1.0, () => {
      this.beam(x, y + 14, z, x, y, z, '#ffe58a');
      this.shockwave(x, y + 0.1, z, 2.6, '#ffe58a');
      this.explode(x, y + 0.6, z, 2.6, 11 * scale.damage, {
        team: TEAM.ENEMY, source: null, color: '#ffe58a', knockback: 4,
      });
      this.audio.play('explode');
    }, '#ffe58a');
  }

  // -------------------------------------------------------------------------
  // Frame update
  // -------------------------------------------------------------------------

  update(dt, input) {
    if (!this.running || this.paused) return;
    // Hit stop. A few frames of near-frozen time on a crit or a kill is the
    // single cheapest thing that makes a blow land — the eye reads the pause
    // as weight. Time is *slowed*, never skipped: dropping frames outright
    // would let a fast projectile tunnel through a wall, and the fixed step
    // above this call is what keeps the simulation stable.
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
      dt *= 0.16;
    }
    this.flash = Math.max(0, (this.flash || 0) - dt * 4.5);
    this.time += dt;
    this.timeSinceCombat += dt;
    this.screenShake = Math.max(0, this.screenShake - dt * 1.8);
    this.hitMarker = Math.max(0, this.hitMarker - dt * 3);

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }

    if (this.mode === 'duel') {
      this.stepDuelFighters(dt, input);
    } else {
      this.player.update(dt, this, input);
      if (this.player.dead) { this.onPlayerDeath(); return; }
    }

    for (const m of this.mobs) if (!m.dead) m.update(dt, this);
    for (const p of this.pets) if (!p.dead) p.update(dt, this);
    for (const p of this.projectiles) if (!p.dead) p.update(dt, this);
    for (const p of this.particles) p.update(dt);
    for (const g of this.gibs) g.update(dt, this);
    this.updateHeartbeat(dt);
    this.updateCombo(dt);
    this.updateAffixes(dt);
    this.updateGrievous(dt);
    this.updateXpPops(dt);
    for (const t of this.telegraphs) t.update(dt);
    for (const s of this.shockwaves) s.update(dt);
    for (const z of this.zones) z.update(dt, this);
    for (const q of this.potions) q.update(dt, this);
    for (const f of this.floaters) f.update(dt);
    for (const b of this.beams) b.life -= dt;
    for (const n of this.notifications) n.life -= dt;

    this.updatePetRebirth(dt);

    // Retire dead things.
    this.mobs = this.mobs.filter((m) => {
      if (m.dead) { this.onEnemyKilled(m, null, {}); return false; }
      return true;
    });
    this.pets = this.pets.filter((p) => !p.dead);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.particles = this.particles.filter((p) => !p.dead);
    this.gibs = this.gibs.filter((g) => !g.dead);
    this.telegraphs = this.telegraphs.filter((t) => !t.dead);
    this.shockwaves = this.shockwaves.filter((s) => !s.dead);
    this.zones = this.zones.filter((z) => !z.dead);
    this.potions = this.potions.filter((q) => !q.dead);
    this.floaters = this.floaters.filter((f) => !f.dead);
    this.beams = this.beams.filter((b) => b.life > 0);
    this.notifications = this.notifications.filter((n) => n.life > 0);

    if (this.mode === 'duel') this.updateDuel(dt);
    else this.updateWaves(dt);
  }

  /**
   * One simulation step for everyone in a duel.
   *
   * On the host this is the whole match: the local player takes the local
   * input, and every other seat takes the last input its machine sent. "Last
   * input" rather than "input if one arrived" is deliberate — a dropped packet
   * should be a stutter, not a frame where that player released every key.
   *
   * On a joiner nothing here is authoritative. The local player is stepped so
   * the controls feel instant and the snapshot corrects it; the other bodies
   * are ghosts and are moved by the snapshot alone.
   */
  stepDuelFighters(dt, input) {
    const host = !this.duel || this.duel.isHost;
    if (host) {
      for (const f of this.fighters) {
        if (f.dead || f.isGhost) continue;
        if (f === this.player) { f.update(dt, this, input); continue; }
        const inp = this.duel ? this.duel.inputFor(f.duelId) : IDLE_INPUT;
        // Where they are looking comes with the input rather than being
        // integrated from a delta. A joiner's aim is theirs — it is the one
        // thing a 60 ms round trip must not smear, and sending the absolute
        // angle costs the same as sending a change to it.
        f.yaw = inp.yaw;
        f.pitch = inp.pitch;
        f.update(dt, this, inp);
      }
    } else {
      this.player.update(dt, this, input);
      for (const g of this.ghosts) g.update(dt);
    }
  }

  /**
   * Grievous bleeds for as long as it is stacked, and three clean seconds
   * clears the whole thing at once. Not a decaying stack: a partial reprieve
   * for a partial disengage would let you keep trading through it.
   */
  updateGrievous(dt) {
    if (this.grievous <= 0) return;
    // Its own clock, not timeSinceCombat: the bleed is player damage, and
    // damageEntity resets the combat timer, so sharing one would mean the
    // wound kept itself open forever and no amount of disengaging cleared it.
    this.grievousTimer = (this.grievousTimer || 0) + dt;
    if (this.grievousTimer >= 3) {
      this.grievous = 0;
      this.notify('Wounds closed');
      return;
    }
    // Applied straight to the entity rather than through damageEntity: routed
    // the normal way this would fire the hurt cue and shake the screen sixty
    // times a second, and armour would soak a tick that is already tuned.
    const scale = waveScaling(this.wave, this.difficulty);
    this.player.damage(this.grievous * 1.7 * scale.damage * dt, { isDot: true, source: null });
    if (this.player.dead) this.onPlayerDeath();
  }

  /** Demonic Rebirth: a fiend killed in combat claws its way back, on a timer. */
  updatePetRebirth(dt) {
    this.petRebirthCd = Math.max(0, (this.petRebirthCd || 0) - dt);
    if (!this.player.mods.petRebirth) return;
    for (const pet of this.pets) {
      if (!pet.dead || !pet.isPet || pet.rebirthChecked) continue;
      pet.rebirthChecked = true;
      if (pet.expired || this.petRebirthCd > 0) continue;
      this.petRebirthCd = 30;
      const sx = this.player.x + rand(2, -2), sz = this.player.z + rand(2, -2);
      const sy = this.world.groundAt(sx, sz, this.player.y + 2);
      this.pets.push(new Fiend(sx, sy, sz, { ...pet.spawnOpts, owner: this.player }));
      this.burst(sx, sy + 0.8, sz, 16, '#a35cff');
      this.notify('Fiend reborn');
      this.audio.play('summon');
    }
  }

  updateWaves(dt) {
    if (this.mode === 'raid') return this.updateRaid(dt);
    const d = this.director;
    if (d.state === 'intermission') {
      d.intermission -= dt;
      if (d.intermission <= 0) this.nextWave();
      return;
    }

    // The wave's own beats, before its spawns, so reinforcements released this
    // frame can arrive on the same frame.
    const live = this.mobs.filter((m) => !m.dead).length;
    const beat = d.beat(live, this.killedThisWave || 0);
    if (beat === 'reinforcements') {
      // Announced, because a pack arriving behind you is only fair if you were
      // told to turn around.
      this.notify('REINFORCEMENTS', 2.2);
      this.audio.play('roar');
      this.screenShake = Math.max(this.screenShake, 0.3);
      this.spawnBehind = true;
    } else if (beat === 'laststand') {
      // The survivors stop hanging back and come. A wave whose last three
      // enemies wander the arena is the part of this game people quit during.
      this.notify('THEY CLOSE IN', 2.0);
      this.audio.play('growl');
      for (const m of this.mobs) {
        if (m.dead || m.def.boss) continue;
        m.enraged = true;
        m.speed *= 1.22;
        m.desiredBearing = undefined;   // straight at you, not around
        m.retreat = 0;
        m.retreatUsed = true;
      }
    }

    const spawns = d.update(dt, this.mobs.length);
    for (const s of spawns) {
      const pt = this.spawnBehind && !s.boss
        ? this.world.pickSpawnBehind(this.player, 13)
        : this.world.pickSpawn(this.player.x, this.player.z, s.boss ? 16 : 11);
      const mob = this.spawnMob(s.typeId, pt.x, pt.y + 0.2, pt.z, s.elite);
      if (s.boss) {
        this.notify(mob.def.name.toUpperCase() + ' AWAKENS', 2.6);
        this.audio.play('roar');
        this.screenShake = 0.5;
      }
      this.burst(pt.x, pt.y + 1, pt.z, 8, '#6a2fb5');
    }

    // One burst only: the flag lasts as long as the release, not the wave.
    if (this.spawnBehind && !d.queue.length) this.spawnBehind = false;

    if (d.state === 'clearing' && this.mobs.length === 0) {
      // The clear bonus is the larger half of a wave's payout, so it has to
      // carry the affix multiplier too — paying the bonus only on kills would
      // mean the rules cost a third of the run's depth and returned a rounding
      // error on the currency that depth exists to earn.
      if (this.affixes.length) this.tally.affixWaves++;
      // Cleared without losing a point of health. Compared at the boundary
      // rather than hooked into every damage source, so nothing can leak.
      if (this.player.hp >= this.waveStartHp) this.tally.flawlessWaves++;
      this.awardXp(xpForWave(this.wave));
      const bonus = Math.round(waveClearBonus(this.wave) * (1 + affixSoulBonus(this.affixes)));
      this.soulsEarned += bonus * (1 + (this.player.mods.soulGain || 0));
      this.notify(`Wave ${this.wave} cleared  +${bonus} 🪙`, 2.2);
      this.player.heal(this.player.maxHp * 0.25);
      this.rerollsLeft = this.permMods.rerolls || 0;
      this.player.cheatDeathUsed = false;
      this.offerUpgrades();
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  get camera() {
    const p = this.player;
    const shake = this.screenShake;
    const sx = shake ? rand(shake * 0.22, -shake * 0.22) : 0;
    const sy = shake ? rand(shake * 0.22, -shake * 0.22) : 0;
    const bob = Math.sin(p.bobPhase * 2) * 0.035 * (p.onGround ? 1 : 0.2);
    return {
      x: p.x + sx,
      y: p.eyeY + bob + sy,
      z: p.z,
      yaw: p.yaw + sx * 0.1,
      pitch: clamp(p.pitch - p.viewKick * 0.06 + sy * 0.1, -1.5, 1.5),
      // Bank into a strafe, and lurch when something hits you.
      //
      // `camRoll` is smoothed toward the strafe direction in Player.update, so
      // it leans in and out rather than snapping; `camJolt` is a one-shot that
      // decays. Both are small — five degrees of lean, ten of jolt — because
      // this is the difference between a body and a tripod, and anything more
      // is a camera with an opinion.
      roll: (p.camRoll || 0) * 0.09 + (p.camJolt || 0),
      // A punch of field of view on an ultimate. Nothing else in the game
      // widens the view, so it is unmistakable and it lasts under a second.
      fov: this.profile.settings.fov + (p.sprinting ? 4 : 0) + (p.fovPunch || 0),
    };
  }

  draw() {
    const cam = this.camera;
    this.r.beginFrame(cam, this.r.skyTint);
    this.r.drawWorld();
    this.drawShadows();
    // A detail budget, not only a distance one. Distance alone bounds what a
    // single model costs and says nothing about thirty of them: a wave at its
    // peak can put thirty enemies inside the range where every silhouette part
    // still draws, and that is a thousand draw calls before the world, the
    // particles or the telegraphs have had a turn.
    //
    // So the nearest twelve get their parts and the rest get the base model.
    // Twelve because that is more than fills the screen at fighting distance —
    // past it you are looking at a crowd, and a crowd reads as a crowd.
    const px = this.player.x, pz = this.player.z;
    const ranked = this.mobs.filter((m) => !m.dead);
    if (ranked.length > DETAIL_BUDGET) {
      ranked.sort((a, b) => ((a.x - px) ** 2 + (a.z - pz) ** 2) - ((b.x - px) ** 2 + (b.z - pz) ** 2));
      for (let i = 0; i < ranked.length; i++) ranked[i].detailed = i < DETAIL_BUDGET;
    } else {
      for (const m of ranked) m.detailed = true;
    }
    for (const m of this.mobs) m.draw(this.r);
    for (const p of this.pets) p.draw(this.r);
    this.drawFighters();
    this.drawAuras();
    this.drawElementTags();
    // Sky fills the gaps left by the opaque pass, before anything blended.
    this.r.drawSky();
    for (const p of this.projectiles) p.draw(this.r);
    this.drawNetEffects();
    for (const t of this.telegraphs) t.draw(this.r);
    for (const z of this.zones) z.draw(this.r);
    for (const q of this.potions) q.draw(this.r);
    for (const s of this.shockwaves) s.draw(this.r);
    for (const g of this.gibs) g.draw(this.r);
    for (const p of this.particles) p.draw(this.r);
    this.drawBeams();
    if (!this.player.dead) this.player.drawViewModel(this.r, cam);
    // Nothing is drawn until it is asked for. The last batch of the frame has
    // no state change after it to force it out, so the frame does it itself.
    this.r.flush();
  }

  /**
   * Contact shadows, drawn in one pass between the world and the characters
   * so nothing casts a shadow onto another character's face. The blob is
   * dropped onto the first solid surface below the entity and fades with the
   * distance it had to fall, which reads as a jump.
   */
  /**
   * A slow ring of motes around elites and bosses. A health bar tells you
   * something is dangerous only once you have already looked at it; an aura
   * reads from the corner of the eye, which is where a threat in a crowd is
   * actually noticed.
   */
  /**
   * The mark an enemy is carrying, drawn where you will see it.
   *
   * A combo system nobody can see is a combo system nobody plays. Three motes
   * orbiting the head in the element's colour, close enough to the health bar
   * that the eye already goes there, and gone the instant the mark is spent.
   */
  drawElementTags() {
    const now = this.time;
    for (const m of this.mobs) {
      if (m.dead) continue;
      const t = tagOn(m, now);
      if (!t) continue;
      const e = ELEMENTS[t.id];
      const spin = now * 3.2;
      const rad = (m.width || 0.6) * 0.9;
      const fade = Math.min(1, (t.until - now) * 1.5);
      for (let i = 0; i < 3; i++) {
        const a = spin + (i / 3) * Math.PI * 2;
        this.r.drawBox(
          m.x + Math.cos(a) * rad,
          m.y + m.height + 0.18 + Math.sin(spin * 1.7 + i) * 0.07,
          m.z + Math.sin(a) * rad,
          0.13, 0.13, 0.13,
          { tile: T.BLANK, color: hexToRgb(e.color), emissive: 1, alpha: 0.9 * fade });
      }
    }
  }

  drawAuras() {
    if (!this.r.fancy) return;
    for (const m of this.mobs) {
      if (m.dead || (!m.elite && !m.def.boss)) continue;
      const boss = m.def.boss;
      const color = boss ? [1.0, 0.35, 0.22] : [1.0, 0.82, 0.29];
      const segs = boss ? 16 : 10;
      const radius = (m.width || 0.6) * (boss ? 2.2 : 1.6);
      const spin = this.time * (boss ? 0.9 : 1.4);
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2 + spin;
        const bob = Math.sin(this.time * 3 + i) * 0.16;
        const s = boss ? 0.20 : 0.13;
        this.r.drawBox(
          m.x + Math.cos(a) * radius, m.y + 0.25 + bob, m.z + Math.sin(a) * radius,
          s, s, s,
          { tile: T.BLANK, color, emissive: 1, alpha: 0.55 });
      }
    }
  }

  drawShadows() {
    if (!this.r.fancy) return;
    const cast = (e, scale = 1) => {
      if (!e || e.dead) return;
      const gy = this.world.groundAt(e.x, e.z, e.y + 0.5);
      const drop = Math.max(0, e.y - gy);
      if (drop > 6) return;
      const fade = 1 - Math.min(1, drop / 6);
      this.r.drawShadow(e.x, gy, e.z, (e.width || 0.6) * 0.95 * scale * (1 + drop * 0.10),
        0.45 * fade * fade);
    };
    // One state change for the whole pass rather than one per blob.
    this.r.shadowPass(() => {
      for (const m of this.mobs) cast(m, m.def && m.def.boss ? 1.25 : 1);
      for (const p of this.pets) cast(p);
      if (!this.player.dead) cast(this.player);
    });
  }

  /**
   * Break a corpse into tumbling chunks in its own colours, thrown along
   * whatever killed it. Capped hard: a deep wave kills a dozen things a
   * second, and unbounded debris is the fastest way to stall a phone.
   */
  /**
   * How something died, from what was on it when it died.
   *
   * Every enemy in the game used to come apart the same way: six body-coloured
   * chunks thrown outward. Freezing something solid and then shattering it,
   * and burning something to ash, are the same event with the same six cubes,
   * which throws away the one moment where the player's *choice of damage* is
   * most visible.
   *
   * Read off state the entity already carries rather than plumbed through
   * forty damage call sites. A thing that is frozen at the moment it dies was
   * killed frozen; a thing carrying a burn was burning. That is not a
   * technicality — it is exactly what the player saw.
   */
  deathStyle(mob) {
    if (mob.freeze > 0) return 'shatter';
    if (mob.dots && mob.dots.some((d) => d.type === 'burn')) return 'ash';
    if (mob.dots && mob.dots.some((d) => d.type === 'bleed')) return 'rend';
    if (mob.lastHitCrit) return 'burst';
    return 'normal';
  }

  spawnGibs(mob) {
    if (!this.r.fancy) return;
    const MAX = 90;
    if (this.gibs.length > MAX) return;
    const skin = mob.def.skin;
    const style = this.deathStyle(mob);
    // A shatter is *more* pieces and smaller ones — that is what shattering
    // looks like — and ash is fewer, because ash does not have chunks in it.
    const base = mob.def.boss ? 14 : mob.elite ? 9 : 6;
    const parts = style === 'shatter' ? Math.round(base * 1.8)
      : style === 'ash' ? Math.round(base * 0.7)
        : style === 'burst' ? Math.round(base * 1.4) : base;
    const unit = mob.height / 1.8;
    const kx = mob.lastHitKX || 0, kz = mob.lastHitKZ || 0;
    // Ash drifts, ice flies, a burst is thrown along the blow that landed.
    const spread = style === 'ash' ? 0.9 : style === 'shatter' ? 5.2 : style === 'burst' ? 6.5 : 3.4;
    const lift = style === 'ash' ? 1.2 : style === 'burst' ? 7 : 5;
    const ICE = [0.62, 0.86, 1.0];
    const ASH = [0.20, 0.19, 0.18];
    for (let i = 0; i < parts; i++) {
      const colors = [skin.head, skin.body, skin.arm, skin.leg];
      let color = colors[i % colors.length];
      let tile = i % 2 ? T.CLOTH : T.SKIN;
      let size = (0.16 + Math.random() * 0.12) * unit;
      let life = 1.8 + Math.random() * 1.4;
      if (style === 'shatter') {
        // Mostly ice, some of the body still in it — a shattered husk is not a
        // pile of ice, it is a husk that has become one.
        if (i % 3) { color = ICE; tile = T.ICE; }
        size *= 0.7;
        life *= 0.75;
      } else if (style === 'ash') {
        color = i % 4 ? ASH : [0.45, 0.20, 0.08];
        tile = T.BLANK;
        size *= 0.8;
        life *= 1.5;
      }
      this.gibs.push(new Gib(
        mob.x + rand(0.3, -0.3),
        mob.y + 0.4 + Math.random() * mob.height * 0.8,
        mob.z + rand(0.3, -0.3),
        rand(spread, -spread) + kx * (style === 'burst' ? 4.5 : 2.4),
        (style === 'ash' ? 0.4 : 3) + Math.random() * lift,
        rand(spread, -spread) + kz * (style === 'burst' ? 4.5 : 2.4),
        color, size, life, tile,
      ));
    }
    // Ash falls like ash: barely any gravity, and it does not bounce.
    if (style === 'ash') {
      for (let i = this.gibs.length - parts; i < this.gibs.length; i++) {
        const g = this.gibs[i];
        if (g) { g.drift = true; g.vy = 0.6 + Math.random() * 1.2; }
      }
    }
    // Oldest first, so the newest kill always gets its debris.
    while (this.gibs.length > MAX) this.gibs.shift();
  }

  /** The one-off flourish a death gets on top of its debris. */
  deathFlourish(mob) {
    const style = this.deathStyle(mob);
    if (style === 'shatter') {
      this.burst(mob.x, mob.centerY, mob.z, 18, '#9fe6ff');
      this.shockwave(mob.x, mob.y + 0.1, mob.z, 1.6, '#9fe6ff');
      this.audio.play('shatter');
    } else if (style === 'ash') {
      // Rising, not bursting. Smoke goes up.
      for (let i = 0; i < 12; i++) {
        this.particles.push(new Particle(
          mob.x + rand(0.5, -0.5), mob.y + 0.3 + Math.random() * mob.height,
          mob.z + rand(0.5, -0.5),
          rand(0.7, -0.7), 1.4 + Math.random() * 1.6, rand(0.7, -0.7),
          i % 3 ? '#3a3532' : '#ff8a3c', 1.1 + Math.random() * 0.7,
          0.16 + Math.random() * 0.14, -2.5));
      }
      this.audio.play('fuse');
    } else if (style === 'rend') {
      this.burstDirected(mob.x, mob.centerY, mob.z,
        mob.lastHitKX || 0, mob.lastHitKZ || 0, 14, '#c0392b');
    } else if (style === 'burst') {
      this.burstDirected(mob.x, mob.centerY, mob.z,
        mob.lastHitKX || 0, mob.lastHitKZ || 0, 16, '#ffd24a');
      this.hitstop = Math.max(this.hitstop, 0.05);
    }
  }

  /**
   * The other people in the room.
   *
   * Nine classes had never been drawn as bodies — the camera has always been
   * behind the player's eyes and every other character in the game is a mob.
   * A duel is five other players, and the whole tactical read of a 3v3 is
   * knowing at a glance which of the two shapes across the floor is the healer.
   * So the body carries the class colour, and a rank marker under the feet
   * carries the side: a ring you cannot mistake for a health bar, on the
   * ground where a crowded fight still leaves it visible.
   */
  drawFighters() {
    if (!this.fighters) return;
    const myTeam = this.player.duelTeam;
    for (const f of this.fighters) {
      if (f === this.player || f.dead) continue;
      if (f.isGhost) f.draw(this.r);
      else drawHumanoid(this.r, f, classSkin(f.cls.id, f.cls.color));
      // Friend or foe, on the floor. Green under an ally, red under an enemy,
      // and never anywhere near the colour of a health bar.
      const foe = f.duelTeam !== myTeam;
      const color = foe ? [0.95, 0.25, 0.2] : [0.35, 0.9, 0.45];
      const segs = 12;
      const rad = 0.55;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        this.r.drawBox(
          f.x + Math.cos(a) * rad, f.y + 0.04, f.z + Math.sin(a) * rad,
          0.16, 0.02, 0.16,
          { tile: T.BLANK, color, emissive: 0.8, alpha: 0.75 });
      }
    }
  }

  /**
   * Projectiles and ground zones a joiner was told about but does not own.
   *
   * Drawn as plain glowing cubes rather than reconstructed as Projectile
   * objects: the joiner has no business integrating something whose rules for
   * stopping live on the other machine, and a shot that hangs in a wall
   * because the two disagreed is worse than one drawn a frame behind.
   */
  drawNetEffects() {
    if (!this.netProjectiles) return;
    for (const p of this.netProjectiles) {
      const s = p.s * 2;
      this.r.drawBox(p.x, p.y, p.z, s, s, s,
        { tile: T.BLANK, color: p.c, emissive: 1, alpha: 0.95 });
    }
    for (const z of this.netZones) {
      const segs = Math.min(28, Math.max(10, Math.round(z.r * 5)));
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        this.r.drawBox(z.x + Math.cos(a) * z.r, z.y + 0.06, z.z + Math.sin(a) * z.r,
          0.3, 0.05, 0.3, { tile: T.BLANK, color: z.c, emissive: 0.7, alpha: 0.6 });
      }
    }
  }

  drawBeams() {
    for (const b of this.beams) {
      const t = b.life / b.max;
      // Denser sampling and a thicker core: ten sparse cubes read as a dotted
      // line, which is not what a bolt of lightning looks like.
      const steps = 22;
      for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        const x = b.x0 + (b.x1 - b.x0) * k;
        const y = b.y0 + (b.y1 - b.y0) * k;
        const z = b.z0 + (b.z1 - b.z0) * k;
        // Jitter grows toward the middle, so the bolt arcs rather than wobbling
        // uniformly along its whole length.
        const wob = Math.sin(k * Math.PI) * 0.22;
        const s = (0.26 * t + 0.06) * (0.6 + Math.sin(k * Math.PI) * 0.6);
        this.r.drawBox(
          x + rand(wob, -wob), y + rand(wob, -wob), z + rand(wob, -wob),
          s, s, s, { tile: T.BLANK, color: b.color, emissive: 1, alpha: t });
      }
      // Flare at the impact end.
      const flare = 0.5 * t;
      this.r.drawBox(b.x1, b.y1, b.z1, flare, flare, flare,
        { tile: T.BLANK, color: b.color, emissive: 1, alpha: t * 0.9 });
    }
  }
}

export { MOB_TYPES };
