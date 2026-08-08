// The duel mode itself: what a hosted match is, once the wire is connected.
//
// `src/net/peer.js` moves bytes and `src/net/duel.js` decides what they mean.
// This file is the part that is a game — spawn marks, rounds, scoring, and the
// avatars standing where the other players are.
//
// WHAT A DUEL IS NOT
//
// It is not the arena run with people instead of husks. No waves, no director,
// no affixes, no drops, no souls, no XP, and nothing you do here touches the
// profile. That is a deliberate line: the host decides every number in this
// mode and the host is a person who can edit the page, so a duel must not be
// able to pay out. What you get from a duel is the duel.
//
// It is also not a new combat system. Every skill, talent, set bonus and gear
// tier works here unchanged, because none of them were ever written against
// "the mobs" — they take an entity and a target. The only thing that had to
// change in the game proper is that a hostile is no longer necessarily a mob.

import { Entity, TEAM, drawHumanoid } from './entity.js';
import { hexToRgb } from './effects.js';
import { T } from '../render/atlas.js';
import { clamp } from '../core/math.js';

/** Seconds a round may run before it is called a draw. */
export const ROUND_TIME = 120;

/** How long the world stands still between rounds, so a win can be read. */
export const ROUND_BREAK = 5;

/**
 * Where each side starts.
 *
 * Mirrored across the arena's middle rather than drawn from the mob spawn
 * table: a duel that opens with one player already behind the other is not a
 * duel, and the spawn table exists to put enemies *near* you. Teammates are
 * offset sideways along the line between the two camps, which puts a 3v3 in a
 * rank facing a rank — the shape every arena fight in every game opens in,
 * because it is the only one where the first ten seconds are about positioning
 * rather than about who spawned luckiest.
 */
export function duelSpawns(world, size) {
  const cx = world.playerSpawn.x, cz = world.playerSpawn.z;
  const reach = 15;
  // Which way the two camps face off across the room.
  //
  // Fixed to the z axis at first, and about one arena in four put a pillar
  // directly in front of somebody: they pressed forward at the start of the
  // round and walked into a wall. The layouts are generated, so no single
  // angle is safe in all of them — the axis has to be *chosen* against the
  // room that actually got built.
  //
  // Twelve candidates, scored on how much open floor each one has: every seat
  // needs room to stand and the corridor between the camps has to be walkable,
  // because the opening of a round is both sides moving toward each other and
  // a blocked lane turns that into two people jogging into stone.
  let best = null, bestScore = -Infinity;
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    const ax = Math.cos(ang), az = Math.sin(ang);
    const score = axisScore(world, cx, cz, ax, az, reach, size);
    if (score > bestScore) { bestScore = score; best = { ax, az }; }
  }

  const teams = [[], []];
  for (let t = 0; t < 2; t++) {
    const dir = t === 0 ? 1 : -1;
    // Sideways along the camp line, so teammates stand in a rank.
    const sx = -best.az * dir, sz = best.ax * dir;
    for (let i = 0; i < size; i++) {
      // Centred spread: one player is on the mark, two straddle it, three fan.
      const off = (i - (size - 1) / 2) * 3.5;
      const x = cx + best.ax * reach * dir + sx * off;
      const z = cz + best.az * reach * dir + sz * off;
      teams[t].push({
        x, z,
        y: world.groundAt(x, z, 24) + 0.05,
        // Facing the other camp, which is the whole point of a fixed mark.
        //
        // The camera convention is forward = (-sin yaw, -cos yaw), so a seat
        // that must look along (-ax, -az) * dir has that yaw. Derived rather
        // than written as a constant, because it was written as a constant
        // first and both teams spawned staring at the wall behind them — a
        // mistake with no visual tell until somebody pressed forward.
        yaw: Math.atan2(best.ax * dir, best.az * dir),
      });
    }
  }
  return teams;
}

/** How open a proposed camp axis is: every seat, plus the lane between them. */
function axisScore(world, cx, cz, ax, az, reach, size) {
  let score = 0;
  for (const dir of [1, -1]) {
    const sx = -az * dir, sz = ax * dir;
    for (let i = 0; i < size; i++) {
      const off = (i - (size - 1) / 2) * 3.5;
      const x = cx + ax * reach * dir + sx * off;
      const z = cz + az * reach * dir + sz * off;
      // A seat you cannot stand in is disqualifying, not merely bad.
      if (!clearColumn(world, x, z)) return -Infinity;
    }
  }
  // The lane, sampled from one camp to the other. Cover in the middle is fine
  // and wanted — this only counts how much of it is walkable, so a room with
  // one pillar on the line scores below a room with none and above a room
  // with a wall across it.
  for (let s = -reach + 2; s <= reach - 2; s += 2) {
    if (clearColumn(world, cx + ax * s, cz + az * s)) score++;
  }
  return score;
}

/** Somewhere a 1.8-block person actually fits, standing on something. */
function clearColumn(world, x, z) {
  const g = world.groundAt(x, z, 24);
  if (g <= 0) return false;
  return !world.isSolid(x, g + 0.5, z) && !world.isSolid(x, g + 1.5, z);
}

/**
 * A remote player, as a joiner sees them.
 *
 * Not a Player: it has no skills, no cooldowns and no physics, because it is
 * not being simulated here — it is a position the host told us about, drawn.
 * Trying to make it a real Player that we also correct would give us two
 * sources of truth for the same body, and the one that is wrong is always the
 * local one.
 */
export class Ghost extends Entity {
  constructor(info) {
    super({ x: 0, y: 0, z: 0, width: 0.6, height: 1.8, hp: 100, team: TEAM.ENEMY });
    this.id = info.id;
    this.name = info.name || 'Player';
    this.classId = info.classId;
    this.skin = classSkin(info.classId);
    this.isGhost = true;
    this.detailed = true;
    // Set by the snapshot, read by drawHumanoid.
    this.walkPhase = 0;
    this.moving = false;
  }

  /**
   * Take one packed player from a snapshot.
   *
   * Position is assigned rather than integrated. Everything a body does over
   * time — the walk cycle, the swing, the hurt flash — is driven locally from
   * the one state byte, because animation timing is the one thing that must
   * stay smooth when a packet is late.
   */
  applySnap(s) {
    this.x = s.x; this.y = s.y; this.z = s.z;
    this.yaw = s.a;
    const wasHp = this.hp;
    this.hp = s.h; this.maxHp = s.m || this.maxHp;
    this.dead = s.s === 3;
    this.moving = s.s === 1 || s.s === 2;
    if (s.s === 2) this.swing = 1;
    if (this.hp < wasHp) this.hurtFlash = 0.28;
  }

  update(dt) {
    this.age += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3.5);
    this.swing = Math.max(0, this.swing - dt * 4.5);
    // The walk cycle runs off the state flag, not off velocity we do not have.
    if (this.moving) this.walkPhase += dt * 9;
  }

  draw(r) {
    if (this.dead) return;
    drawHumanoid(r, this, this.skin);
  }
}

/**
 * What a class looks like from the outside.
 *
 * Nine classes had never been drawn as bodies — the player is a pair of hands
 * and a weapon, and the camera has always been behind their eyes. In a duel
 * the other five people on the floor are the game, and "which of those two is
 * the Priest" has to be answerable at twenty paces, in one glance, from the
 * silhouette and the colour. So: the class's own colour on the armour, a
 * lighter shade on the trim, and the heavy classes get pauldrons the light
 * ones do not.
 */
const SKIN_CACHE = new Map();
const HEAVY = new Set(['warrior', 'paladin', 'deathknight']);
const HOODED = new Set(['priest', 'warlock', 'mage', 'shaman']);

export function classSkin(classId, color) {
  const key = classId + '|' + (color || '');
  const hit = SKIN_CACHE.get(key);
  if (hit) return hit;
  const base = hexToRgb(color || CLASS_COLORS[classId] || '#9aa4b8');
  const shade = (k) => base.map((c) => clamp(c * k, 0, 1));
  const skin = {
    head: [0.85, 0.68, 0.55],
    body: shade(1),
    arm: shade(0.78),
    leg: shade(0.6),
    headTile: T.SKIN,
    bodyTile: T.CLOTH,
    armTile: T.CLOTH,
    legTile: T.CLOTH,
    faceTile: T.FACE_PLAYER,
  };
  if (HEAVY.has(classId)) {
    skin.pauldrons = shade(1.25);
    skin.pauldronTile = T.METAL;
    skin.bodyTile = T.METAL;
  }
  if (HOODED.has(classId)) {
    skin.hat = shade(0.85);
    skin.hatTile = T.CLOTH;
  }
  SKIN_CACHE.set(key, skin);
  return skin;
}

/**
 * Fallback palette, used when a duel opponent is playing a class this build
 * does not know about. It should never fire — the build stamp is checked
 * before a match starts — but a body with no colour is worse than a grey one.
 */
const CLASS_COLORS = {
  warrior: '#c8563c', mage: '#4aa3ff', rogue: '#ffd24a', warlock: '#a35cff',
  priest: '#e8e4d8', shaman: '#2f7fd4', deathknight: '#ff3ca0',
  paladin: '#ffe9a8', hunter: '#8ce06a',
};

/**
 * Rounds, scores, and who is left standing.
 *
 * Kept apart from `Game` because it is the only bookkeeping in the mode that
 * is not also arena bookkeeping, and folding it in would put six more fields
 * on a reset() that already carries forty.
 */
export class DuelScore {
  constructor(roundsToWin) {
    this.roundsToWin = roundsToWin;
    this.score = [0, 0];
    this.round = 1;
    this.timer = ROUND_TIME;
    this.breakTimer = 0;
    this.over = false;
    this.winner = -1;
    this.lastRoundWinner = -1;
  }

  /** A round ended. Returns true if that ended the match too. */
  award(team) {
    if (team >= 0) this.score[team]++;
    this.lastRoundWinner = team;
    this.breakTimer = ROUND_BREAK;
    if (this.score[team] >= this.roundsToWin) {
      this.over = true;
      this.winner = team;
      return true;
    }
    this.round++;
    return false;
  }

  get standings() {
    return `${this.score[0]} — ${this.score[1]}`;
  }
}

/**
 * Which side has anybody left alive.
 *
 * Returns the winning team, -1 for "both sides still have someone", or -2 for
 * a double wipe — which a 3v3 really can produce, when a bomb lands as the
 * last two players kill each other, and which has to be a draw rather than
 * whichever list was checked first.
 */
export function roundOutcome(fighters) {
  let alive0 = 0, alive1 = 0;
  for (const f of fighters) {
    if (f.dead) continue;
    if (f.duelTeam === 0) alive0++; else alive1++;
  }
  if (alive0 && alive1) return -1;
  if (!alive0 && !alive1) return -2;
  return alive0 ? 0 : 1;
}
