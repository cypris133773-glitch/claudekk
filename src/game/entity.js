// Shared entity base: physics, status effects, damage, and the blocky
// humanoid model every creature in the game is drawn with.

import { T } from '../render/atlas.js';
import { clamp, angleDelta } from '../core/math.js';

export const TEAM = { PLAYER: 0, ENEMY: 1 };

export class Entity {
  constructor(opts = {}) {
    this.x = opts.x || 0; this.y = opts.y || 0; this.z = opts.z || 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = opts.yaw || 0;
    this.pitch = 0;
    this.width = opts.width || 0.6;
    this.height = opts.height || 1.8;
    this.maxHp = opts.hp || 100;
    this.hp = this.maxHp;
    this.team = opts.team ?? TEAM.ENEMY;
    this.onGround = false;
    this.dead = false;
    this.gravity = 26;
    this.hurtFlash = 0;
    this.walkPhase = 0;
    this.swing = 0;              // 0..1 attack animation
    this.attackCooldown = 0;
    this.dots = [];              // { dps, remaining, source, type }
    this.freeze = 0;
    this.stun = 0;
    this.root = 0;
    this.slow = 0; this.slowTimer = 0;
    this.absorb = 0;
    this.invuln = 0;
    this.knockResist = 0;
    this.lifetime = Infinity;
    this.age = 0;
    this.lastDamagedAge = 0;
  }

  get eyeY() { return this.y + this.height * 0.9; }
  get centerY() { return this.y + this.height * 0.5; }

  get disabled() { return this.freeze > 0 || this.stun > 0; }

  /** Damage entry point. Returns the amount actually applied. */
  damage(amount, opts = {}) {
    if (this.dead || this.invuln > 0) return 0;
    // A warded boss takes nothing until its guards are down. Returning zero
    // rather than skipping the call keeps every hit number, floater and
    // on-hit rider agreeing that nothing landed.
    if (this.warded) return 0;
    let dmg = amount;
    if (this.damageTakenMult) dmg *= this.damageTakenMult;
    if (this.absorb > 0) {
      const soaked = Math.min(this.absorb, dmg);
      this.absorb -= soaked;
      dmg -= soaked;
      if (this.absorb <= 0 && this.onAbsorbBroken) this.onAbsorbBroken();
    }
    if (dmg <= 0) return 0;
    this.hp -= dmg;
    this.hurtFlash = 0.22;
    this.lastDamagedAge = this.age;
    // Kept so debris and death animations can be thrown the way the killing
    // blow was travelling, rather than in an arbitrary direction.
    this.lastHitKX = opts.kx || 0;
    this.lastHitKZ = opts.kz || 0;
    // Whether the blow that landed was a critical, so a killing crit can come
    // apart harder than an ordinary one. A dot tick is never the crit that
    // sold the kill, so it does not get to claim one.
    this.lastHitCrit = !opts.isDot && !!opts.crit;
    this.lastHitFraction = this.maxHp > 0 ? dmg / this.maxHp : 0;
    if (opts.knockback && this.knockResist < 1) {
      const k = opts.knockback * (1 - this.knockResist);
      this.vx += (opts.kx || 0) * k;
      this.vz += (opts.kz || 0) * k;
      this.vy += Math.min(k * 0.35, 7);
    }
    if (this.hp <= 0) {
      if (this.onLethal && this.onLethal()) return dmg;
      this.hp = 0;
      this.dead = true;
      this.deathCause = opts.source;
    }
    return dmg;
  }

  heal(amount) {
    if (this.dead) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  /** Add a damage-over-time stack. */
  applyDot(dps, duration, type = 'poison', source = null) {
    const existing = this.dots.find((d) => d.type === type && d.source === source);
    if (existing) {
      existing.dps = Math.max(existing.dps, dps);
      existing.remaining = Math.max(existing.remaining, duration);
    } else {
      this.dots.push({ dps, remaining: duration, total: dps * duration, type, source });
    }
  }

  totalDotDamageRemaining() {
    return this.dots.reduce((s, d) => s + d.dps * d.remaining, 0);
  }

  applySlow(pct, duration) {
    if (pct >= this.slow || this.slowTimer <= 0) this.slow = pct;
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  /** Timers, DoT ticks, gravity and world collision. */
  updateBase(dt, world) {
    this.age += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.swing = Math.max(0, this.swing - dt * 4.5);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.freeze = Math.max(0, this.freeze - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.root = Math.max(0, this.root - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.slowTimer = Math.max(0, this.slowTimer - dt);
    if (this.slowTimer <= 0) this.slow = 0;

    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      const tick = Math.min(dt, d.remaining);
      const dealt = this.damage(d.dps * tick, { source: d.source, isDot: true });
      if (d.source && d.source.onDotDamage) d.source.onDotDamage(dealt);
      d.remaining -= dt;
      if (d.remaining <= 0) {
        this.dots.splice(i, 1);
        // Warlock: rot that is allowed to run its full course pays out. Only
        // on natural expiry — a dot cut short by the target dying has already
        // done its job, and rewarding both would make it the only play.
        if (d.source && d.source.onDotExpired) d.source.onDotExpired(this, d);
      }
    }

    if (!this.noGravity) this.vy -= this.gravity * dt;
    if (world) world.moveAABB(this, dt);
    else { this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt; }

    // Ground friction / air drag.
    const drag = this.onGround ? 0.0016 : 0.28;
    const f = Math.pow(drag, dt);
    this.vx *= f; this.vz *= f;
    if (this.lifetime !== Infinity) {
      this.lifetime -= dt;
      // `expired` distinguishes running out of duration from being killed.
      if (this.lifetime <= 0) { this.dead = true; this.expired = true; }
    }
  }

  /** Smoothly turn toward a yaw angle. */
  turnToward(targetYaw, dt, rate = 9) {
    this.yaw += angleDelta(this.yaw, targetYaw) * clamp(dt * rate, 0, 1);
  }

  distanceTo(other) {
    return Math.hypot(this.x - other.x, this.centerY - other.centerY, this.z - other.z);
  }

  distanceXZ(other) {
    return Math.hypot(this.x - other.x, this.z - other.z);
  }
}

// ---------------------------------------------------------------------------
// Blocky humanoid rendering
// ---------------------------------------------------------------------------

/**
 * Draw a Minecraft-style humanoid.
 * `skin` = { head, body, arm, leg, headTile, faceTile, emissive, scale }
 */
/**
 * The boxes a humanoid is built from, in world space, for anything that needs
 * its *shape* rather than its bounding box — the aim-lock outline is the only
 * caller today.
 *
 * Deliberately static: no walk swing, no arm swing. The outline is a targeting
 * aid drawn a couple of pixels wide, and a limb that is four degrees out of
 * phase with the model is invisible at that width. Animating it would mean
 * duplicating drawHumanoid's whole animation state in the HUD, which is a
 * second copy of the thing most likely to drift.
 *
 * The proportions are the same fractions drawHumanoid uses, and they are here
 * rather than there because this is the only place both need them.
 */
export function humanoidBoxes(e, scale = 1) {
  const s = scale;
  const unit = e.height / 1.8 * s;
  const headSize = 0.5 * unit;
  const bodyH = 0.75 * unit, bodyW = 0.55 * unit, bodyD = 0.28 * unit;
  const limbH = 0.72 * unit, limbW = 0.24 * unit;
  const legTop = e.y + limbH;
  const rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw);
  const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
  const at = (lx, ly, lz) => [e.x + rx * lx + fx * lz, ly, e.z + rz * lx + fz * lz];
  const box = (lx, cy, lz, w, h, d) => {
    const p = at(lx, cy, lz);
    return { x: p[0], y: p[1], z: p[2], w, h, d };
  };
  const out = [
    box(0, legTop + bodyH / 2, 0, bodyW, bodyH, bodyD),
    box(0, legTop + bodyH + headSize / 2, 0, headSize, headSize, headSize),
  ];
  for (const side of [-1, 1]) {
    out.push(box(side * limbW * 0.55, legTop - limbH / 2, 0, limbW, limbH, limbW));
    out.push(box(side * (bodyW / 2 + limbW / 2), legTop + bodyH - limbH / 2, 0,
      limbW, limbH, limbW));
  }
  return out;
}

export function drawHumanoid(r, e, skin) {
  const s = skin.scale || 1;
  // Detail culling. Every box here is its own draw call with six uniform
  // updates behind it, so a model's cost is exactly how many boxes it is made
  // of. The silhouette parts roughly tripled that for a raid boss, which is
  // the right trade at four blocks and the wrong one at thirty — where a wing
  // is two pixels and a spine row is none.
  //
  // The threshold scales with how tall the thing is, which is the only version
  // of this that is right for both a husk and a raid boss. A 1.8-block husk at
  // sixteen paces is small enough that its tail is noise; a five-block boss at
  // forty is still filling a third of the frame. One constant, divided by the
  // reference height, does both.
  const dx = (r.camX || 0) - e.x, dz = (r.camZ || 0) - e.z;
  const far2 = dx * dx + dz * dz;
  const reach = 16 * (e.height / 1.8);
  // `detailed` is set by the draw loop and caps how many enemies may carry
  // their parts at once; it is undefined for the player and for pets, which
  // are never numerous enough to need a budget.
  const detail = far2 < reach * reach && e.detailed !== false;
  const closeUp = far2 < reach * reach * 0.36;
  const unit = e.height / 1.8 * s;           // 1.8-block reference height
  // Proportion knobs. An imp is not a small person: it is a person with a head
  // half again too big and legs half as long, and that ratio is what the eye
  // reads as "imp" long before any colour does.
  const headSize = 0.5 * unit * (skin.headScale || 1);
  const bodyH = 0.75 * unit, bodyW = 0.55 * unit, bodyD = 0.28 * unit;
  const limbH = 0.72 * unit * (skin.limbScale || 1), limbW = 0.24 * unit;
  const legTop = e.y + limbH;
  const bodyCenterY = legTop + bodyH / 2;
  const headY = legTop + bodyH + headSize / 2;
  const flash = e.hurtFlash > 0 ? Math.min(1, e.hurtFlash * 3.5) : 0;
  const frozen = e.freeze > 0;
  const tintMul = frozen ? 0.6 : 1;
  const col = (c) => [c[0] * tintMul + (frozen ? 0.35 : 0), c[1] * tintMul + (frozen ? 0.45 : 0), c[2] * tintMul + (frozen ? 0.55 : 0)];
  const common = { flash, emissive: skin.emissive || 0, alpha: skin.alpha ?? 1 };

  // Entity yaw follows the camera convention: forward = (-sin, 0, -cos).
  // A cube's local +Z points the other way, so models are drawn at yaw + PI.
  const yaw = e.yaw + Math.PI;
  const rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw);     // world right
  const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);    // world forward

  const at = (lx, ly, lz) => [e.x + rx * lx + fx * lz, ly, e.z + rz * lx + fz * lz];

  // Legs — swing opposite to each other while walking.
  const swingAmt = Math.sin(e.walkPhase) * 0.7;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const p = at(side * limbW * 0.55, legTop, 0);
    r.drawLimb(p[0], p[1], p[2], yaw, side * swingAmt, limbW, limbH, limbW, -limbH / 2,
      { ...common, tile: skin.legTile ?? T.CLOTH, color: col(skin.leg) });
  }

  // Body
  const bp = at(0, bodyCenterY, 0);
  r.drawBox(bp[0], bp[1], bp[2], bodyW, bodyH, bodyD,
    { ...common, tile: skin.bodyTile ?? T.CLOTH, color: col(skin.body), yaw });

  // Arms — the right arm also plays the attack swing.
  const swingPitch = -e.swing * 2.2;
  // Swing trail: a short arc of fading blocks along the path the arm just
  // travelled. A single-frame swing animation is invisible at 60fps in a
  // crowd; the trail is what tells you an attack actually happened.
  if (e.swing > 0.15 && skin.trail !== false && detail) {
    const tc = skin.trailColor || col(skin.arm);
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const p = at((bodyW / 2 + limbW / 2), legTop + bodyH - limbW * 0.4, 0);
      const arc = swingPitch * (1 - t * 0.75);
      const reach = limbH * (0.85 + t * 0.5);
      r.drawBox(
        p[0] + fx * Math.cos(arc) * reach,
        p[1] - Math.sin(-arc) * reach * 0.55,
        p[2] + fz * Math.cos(arc) * reach,
        limbW * (0.7 - t * 0.3), limbW * 0.22, limbW * (0.7 - t * 0.3),
        { tile: T.BLANK, color: tc, emissive: 0.75, alpha: e.swing * (0.5 - t * 0.35) });
    }
  }
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const shoulderY = legTop + bodyH - limbW * 0.4;
    const p = at(side * (bodyW / 2 + limbW / 2), shoulderY, 0);
    const pitch = side > 0 ? swingPitch - Math.abs(swingAmt) * 0.4 : -side * swingAmt * 0.8;
    r.drawLimb(p[0], p[1], p[2], yaw, pitch, limbW, limbH, limbW, -limbH / 2,
      { ...common, tile: skin.armTile ?? T.SKIN, color: col(skin.arm) });
  }

  // Head — front face uses the face tile so mobs read as characters.
  const hp = at(0, headY, 0);
  const headPitch = clamp(e.pitch * 0.6, -0.7, 0.7);
  r.drawBox(hp[0], hp[1], hp[2], headSize, headSize, headSize,
    { ...common, tile: skin.headTile ?? T.SKIN, color: col(skin.head), yaw, pitch: headPitch });
  if (skin.faceTile !== undefined && skin.faceTile !== null) {
    // Thin quad-ish slab pushed just in front of the head's forward face.
    const off = headSize / 2 + 0.008;
    const fp = at(0, headY, off);
    r.drawBox(fp[0], fp[1], fp[2], headSize, headSize, 0.001, {
      ...common,
      tile: skin.faceTile,
      color: skin.faceUntinted ? [1, 1, 1] : col(skin.head),
      yaw,
      pitch: headPitch,
    });
  }
  if (skin.hat) {
    const p = at(0, headY + headSize * 0.55, 0);
    r.drawBox(p[0], p[1], p[2], headSize * 1.12, headSize * 0.25, headSize * 1.12,
      { ...common, tile: skin.hatTile ?? T.CLOTH, color: col(skin.hat), yaw });
  }

  // Horns. Two tapered stacks angled out from the temples — the cheapest way
  // to make a humanoid box read as a monster rather than a person, and the
  // silhouette is what a player actually recognises at fighting distance.
  if (skin.horns) {
    const hc = col(skin.horns);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      for (let seg = 0; seg < 3; seg++) {
        const t = seg / 3;
        const w = headSize * (0.20 - t * 0.05);
        const p = at(side * headSize * (0.42 + t * 0.30),
          headY + headSize * (0.34 + t * 0.34),
          -headSize * t * 0.16);
        r.drawBox(p[0], p[1], p[2], w, headSize * 0.20, w,
          { ...common, tile: skin.hornTile ?? T.BONE, color: hc, yaw });
      }
    }
  }

  // Pauldrons: slabs over the shoulders. Widening the silhouette at the top
  // is what makes a heavy enemy look heavy without changing its hitbox.
  if (skin.pauldrons && detail) {
    const pc = col(skin.pauldrons);
    const shoulderY = legTop + bodyH - limbW * 0.15;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const p = at(side * (bodyW / 2 + limbW * 0.45), shoulderY, 0);
      r.drawBox(p[0], p[1], p[2], limbW * 1.7, limbW * 0.85, limbW * 1.6,
        { ...common, tile: skin.pauldronTile ?? T.METAL, color: pc, yaw });
    }
  }

  // ---------------------------------------------------------------------
  // Silhouette parts
  // ---------------------------------------------------------------------
  //
  // Everything above builds a person out of six boxes, and forty-two raid
  // bosses built that way are one enemy in forty-two palettes. What a player
  // actually recognises across a dark room is the *outline* — so these five
  // are all outline and nothing else, and every one of them is optional.
  //
  // None of them touch the hitbox. A tail you can walk through is correct: the
  // collision box is what the fight is fought against, and widening it because
  // a model grew a wing would change every escape distance in the game.

  // Tail. Tapering segments trailing down and back, swaying with the walk —
  // the single cheapest way to say "this is a beast, not a man".
  // Horns. Two stubs angled off the temples — the cheapest silhouette change
  // that turns a head into a devil's head.
  if (skin.horns && detail) {
    const hc = col(skin.horns);
    for (const side of [-1, 1]) {
      for (let i = 0; i < (skin.hornCount || 2); i++) {
        const up = headSize * (0.42 + i * 0.26);
        const out = side * headSize * (0.30 + i * 0.06);
        r.drawBox(
          e.x + rx * out, headY + up, e.z + rz * out,
          headSize * (0.16 - i * 0.04), headSize * 0.30, headSize * (0.16 - i * 0.04),
          { ...common, tile: T.SKIN, color: hc, yaw });
      }
    }
  }

  if (skin.tail && detail) {
    const tc = col(skin.tail);
    const segs = skin.tailSegs || 5;
    const sway = Math.sin(e.walkPhase * 0.9) * 0.22;
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const back = bodyD * 0.5 + unit * (0.10 + t * 0.62);
      const drop = legTop + bodyH * 0.35 - unit * t * t * 0.55;
      const w = limbW * (0.62 - t * 0.34);
      const p = at(Math.sin(sway * (0.4 + t)) * unit * 0.22 * t, drop, -back);
      r.drawBox(p[0], p[1], p[2], w, w, unit * 0.17,
        { ...common, tile: skin.tailTile ?? skin.bodyTile ?? T.SKIN, color: tc, yaw });
    }
  }

  // Wings. Two swept panels stepping out and up from the shoulders. Drawn as
  // three chunks a side rather than a fan: a voxel wing reads by its stepped
  // edge, and a smooth one just looks like a plank.
  if (skin.wings && detail) {
    const wc = col(skin.wings);
    const beat = Math.sin(e.walkPhase * 1.4) * 0.10;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      for (let seg = 0; seg < 3; seg++) {
        const t = seg / 3;
        const out = bodyW * 0.5 + unit * (0.22 + t * 0.52);
        const up = legTop + bodyH * (0.72 + t * 0.34) + beat * unit * t;
        const p = at(side * out, up, -bodyD * 0.4 - unit * t * 0.16);
        r.drawBox(p[0], p[1], p[2],
          unit * (0.34 - t * 0.06), unit * (0.30 + t * 0.22), unit * 0.05,
          { ...common, tile: skin.wingTile ?? T.CLOTH, color: wc, yaw, alpha: skin.wingAlpha ?? common.alpha });
      }
    }
  }

  // A weapon in the hand. The largest silhouette win available: a boss holding
  // something is read as a boss before its colour, its size or its name has
  // registered, and it costs three boxes.
  if (skin.weapon && detail) {
    const wc = col(skin.weapon);
    const grip = at(bodyW / 2 + limbW / 2, legTop + bodyH - limbH * 0.62, limbW * 0.4);
    const len = unit * (skin.weaponLen || 0.9);
    const tilt = swingPitch * 0.8 - 0.25;
    const ux = Math.sin(yaw) * Math.sin(tilt);
    const uy = Math.cos(tilt);
    const uz = Math.cos(yaw) * Math.sin(tilt);
    // Haft, then head. Two boxes with different proportions is enough for an
    // axe, a hammer and a blade to tell apart at range.
    r.drawBox(grip[0] - ux * len * 0.3, grip[1] + uy * len * 0.3, grip[2] - uz * len * 0.3,
      unit * 0.07, len, unit * 0.07,
      { ...common, tile: skin.weaponTile ?? T.LOG_SIDE, color: wc, yaw, pitch: tilt });
    const headAt = len * 0.62;
    r.drawBox(grip[0] - ux * headAt, grip[1] + uy * headAt, grip[2] - uz * headAt,
      unit * (skin.weaponWide || 0.20), unit * 0.22, unit * 0.11,
      { ...common, tile: skin.weaponHeadTile ?? T.METAL, color: col(skin.weaponHead || skin.weapon),
        emissive: skin.weaponGlow || common.emissive, yaw, pitch: tilt });
  }

  // A crest or spine row down the back. Reads from behind and from the side,
  // which is where a humanoid box is otherwise completely featureless.
  if (skin.spines && closeUp) {
    const sc = col(skin.spines);
    const n = skin.spineCount || 5;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1 || 1);
      const h = unit * (0.20 - Math.abs(t - 0.35) * 0.14);
      const p = at(0, legTop + bodyH * (1.02 - t * 0.62), -bodyD * 0.5 - unit * 0.02);
      r.drawBox(p[0], p[1], p[2], unit * 0.07, h, unit * 0.09,
        { ...common, tile: skin.spineTile ?? T.BONE, color: sc, yaw });
    }
  }

  // Cloak. One slab behind the body, kicking out as the thing moves — casters
  // and commanders, and the only part here that is pure theatre.
  if (skin.cloak && detail) {
    const cc = col(skin.cloak);
    const kick = Math.abs(Math.sin(e.walkPhase)) * 0.18;
    const p = at(0, legTop + bodyH * 0.30 - unit * kick * 0.3,
      -bodyD * 0.5 - unit * (0.06 + kick * 0.3));
    r.drawBox(p[0], p[1], p[2], bodyW * 1.08, bodyH * 1.35, unit * 0.05,
      { ...common, tile: skin.cloakTile ?? T.CLOTH, color: cc, yaw, pitch: kick * 0.5 });
  }
}
