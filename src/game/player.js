// The player: derived stats from class + talents + upgrades, resource
// handling, buffs, the basic attack, and first-person weapon rendering.

import { Entity, TEAM, drawHumanoid } from './entity.js';
import { T } from '../render/atlas.js';
import { clamp, forwardVec, rand } from '../core/math.js';
import { castSkill, skillCooldown } from './skills.js';
import { LOADOUT_SIZE } from '../data/classes.js';
import { weaponAppearance } from '../data/armor.js';

/** Sum every modifier source into one flat bag of numbers. */
export function buildMods(cls, talentRanks, permanent) {
  const mods = {};
  // Talents that name a skill go into their own bag under that skill's id,
  // not into the flat one. Everything global — armour, the Forge, the other
  // two-and-a-bit branches — stays flat and applies to everything, exactly as
  // before; only a node that says which skill it is about is kept apart.
  //
  // This is what makes the tree interact with the loadout instead of running
  // alongside it. A rank in Unstoppable Charge is worth nothing unless Charge
  // is one of your four, so picking the four and speccing the tree stop being
  // two separate decisions.
  mods.skills = {};
  const add = (key, value) => { mods[key] = (mods[key] || 0) + value; };
  const addTo = (skillId, key, value) => {
    const bag = mods.skills[skillId] || (mods.skills[skillId] = {});
    bag[key] = (bag[key] || 0) + value;
  };

  for (const branch of cls.talents) {
    for (const node of branch.nodes) {
      const rank = talentRanks[node.id] || 0;
      if (!rank) continue;
      for (const [k, v] of Object.entries(node.effect)) {
        if (node.skill) addTo(node.skill, k, v * rank);
        else add(k, v * rank);
      }
    }
  }
  for (const [k, v] of Object.entries(permanent || {})) add(k, v);
  return mods;
}

/** Empty bag shared by every un-specced skill, so the hot path allocates nothing. */
const NO_SKILL_MODS = Object.freeze({});

export class Player extends Entity {
  /**
   * `skills` is the four-skill loadout chosen in the menu. Every cooldown,
   * HUD button and keybind indexes into it, never into the class's full pool.
   */
  constructor(cls, mods, world, skills) {
    super({
      x: world.playerSpawn.x, y: world.playerSpawn.y, z: world.playerSpawn.z,
      width: 0.6, height: 1.8, hp: cls.base.hp, team: TEAM.PLAYER,
    });
    // A raid room puts you on a fixed mark facing the dais; an arena drops you
    // in the middle where any facing is as good as another.
    if (world.playerSpawn.yaw !== undefined) this.yaw = world.playerSpawn.yaw;
    this.cls = cls;
    this.mods = mods;
    this.skills = (skills && skills.length ? skills : cls.skills).slice(0, LOADOUT_SIZE);
    this.buffs = [];
    this.cooldowns = this.skills.map(() => 0);
    // Clearing a wave ranks up a skill rather than padding a stat. Levelling
    // into "+8 max health" is a number going up; levelling into "Fireball
    // rank 4" changes how the run is played.
    this.skillRanks = this.skills.map(() => 0);
    this.resourceDef = cls.resource;
    this.pitch = 0;
    this.sprinting = false;
    this.dashTimer = 0;
    this.attackCombo = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.souls = 0;
    this.rampageStacks = 0;
    this.rampageTimer = 0;
    this.cheatDeathUsed = false;
    this.cheatDeathRunUsed = false;
    this.dispersionTimer = 0;
    this.coldBloodCounter = 0;
    this.recomputeStats();
    this.hp = this.maxHp;
    this.resource = this.resourceDef.startFull ? this.resourceMax : 0;
    this.bobPhase = 0;
    this.viewKick = 0;

    this.onLethal = () => this.tryCheatDeath();
    this.onAbsorbBroken = () => {
      if (this.mods.rapture) this.gainResource(this.mods.rapture);
    };
    // Siphon: damage-over-time effects you own feed you back.
    this.onDotDamage = (dealt) => {
      if (this.mods.dotLifesteal && dealt > 0) this.heal(dealt * this.mods.dotLifesteal);
    };
  }

  /** Recompute derived stats; call after talents/upgrades change. */
  recomputeStats() {
    const b = this.cls.base;
    const m = this.mods;
    const buffMove = this.buffs.reduce((s, x) => s + (x.moveSpeed || 0), 0);
    const buffTaken = this.buffs.reduce((s, x) => s * (x.damageTaken ?? 1), 1);
    const buffDodge = this.buffs.reduce((s, x) => s + (x.dodge || 0), 0);
    // Offensive cooldowns (Battle Cry, Void Form, Shadow Dance) stack additively
    // with talents rather than multiplying, so a long buff cannot spiral.
    const buffDamage = this.buffs.reduce((s, x) => s + (x.damageBonus || 0), 0);
    const buffHaste = this.buffs.reduce((s, x) => s + (x.attackSpeedBonus || 0), 0);

    // Percentage before flat, and a percentage at all because one Forge table
    // has to be fair to nine classes: a flat +200 is a third of a Paladin's
    // health and nearly double a Hunter's.
    this.maxHp = Math.round((b.hp + (m.maxHp || 0)) * (1 + (m.maxHpPct || 0)));
    this.resourceMax = this.resourceDef.max + (m.resourceMax || 0);
    this.resourceRegen = this.resourceDef.regen + (m.resourceRegen || 0);
    this.armor = clamp(b.armor + (m.armor || 0), 0, 0.75);
    this.moveSpeed = b.speed * (1 + (m.moveSpeed || 0) + buffMove
      + (this.rampageStacks * (m.rampage ? 0.06 : 0)));
    this.attackDamage = b.attackDamage * (1 + (m.attackDamage || 0));
    this.attackSpeed = b.attackSpeed * (1 + (m.attackSpeed || 0) + buffHaste);
    this.attackRange = b.attackRange;
    this.critChance = clamp(b.critChance + (m.critChance || 0), 0, 0.85);
    this.critMult = b.critMult + (m.critMult || 0);
    this.dodge = clamp((m.dodge || 0) + buffDodge, 0, 0.8);
    this.damageTakenMult = buffTaken * (1 - clamp(m.damageReduction || 0, 0, 0.6));
    this.stats = {
      meleeMult: 1 + (m.meleeDamage || 0) + (m.allDamage || 0) + buffDamage,
      spellMult: 1 + (m.spellDamage || 0) + (m.allDamage || 0) + buffDamage,
      healMult: clamp(1 + (m.healing || 0), 0.2, 4),
      bossMult: 1 + (m.bossDamage || 0),
    };
    this.lifesteal = m.lifesteal || 0;
    this.thorns = m.thorns || 0;
    this.hp = Math.min(this.hp, this.maxHp);
  }

  get isMelee() { return this.cls.base.attackRange < 6; }

  /** The talent bag scoped to one skill id; empty for anything un-specced. */
  skillMods(id) {
    return (this.mods.skills && this.mods.skills[id]) || NO_SKILL_MODS;
  }

  /** Rank of the skill in slot `i`, 0 for un-upgraded. */
  rankOf(i) { return this.skillRanks[i] || 0; }

  rankUp(i) {
    if (i < 0 || i >= this.skills.length) return 0;
    this.skillRanks[i] = (this.skillRanks[i] || 0) + 1;
    return this.skillRanks[i];
  }

  gainResource(amount) {
    this.resource = clamp(this.resource + amount, 0, this.resourceMax);
  }

  addBuff(id, data) {
    const existing = this.buffs.find((b) => b.id === id);
    if (existing) Object.assign(existing, data, { id, remaining: data.duration });
    else this.buffs.push({ id, ...data, remaining: data.duration });
    this.recomputeStats();
  }

  hasBuff(id) { return this.buffs.some((b) => b.id === id); }

  tryCheatDeath() {
    if (this.mods.cheatDeath && !this.cheatDeathUsed) {
      this.cheatDeathUsed = true;
      this.hp = this.maxHp * 0.25;
      this.invuln = 1.5;
      return true;
    }
    if (this.mods.cheatDeathRun && !this.cheatDeathRunUsed) {
      this.cheatDeathRunUsed = true;
      this.hp = this.maxHp * this.mods.cheatDeathRun;
      this.invuln = 2;
      return true;
    }
    if (this.mods.dispersion && this.dispersionTimer <= 0) {
      this.dispersionTimer = 60;
      this.hp = Math.max(1, this.maxHp * 0.15);
      this.invuln = 2;
      return true;
    }
    return false;
  }

  onKill(mob) {
    this.kills++;
    if (this.mods.killHeal) this.heal(this.mods.killHeal);
    const r = this.resourceDef;
    if (r.onKillGain) this.gainResource(r.onKillGain + (this.mods.onKillGain || 0));
    else if (this.mods.onKillGain) this.gainResource(this.mods.onKillGain);
    if (this.mods.rampage) {
      this.rampageStacks = Math.min(5, this.rampageStacks + 1);
      this.rampageTimer = 4;
      this.recomputeStats();
    }
    if (this.mods.killSpree) {
      this.gainResource(20);
      for (let i = 0; i < this.cooldowns.length; i++) this.cooldowns[i] = Math.max(0, this.cooldowns[i] - 1);
    }
  }

  /**
   * Aim assist. A thumb dragging on glass cannot hold a crosshair on a moving
   * target the way a mouse can, so the view eases toward whatever is already
   * roughly under it. It only ever *narrows* an aim the player has already
   * taken — there is no snapping, and it stops entirely once the reticle is
   * close, so a deliberate lead shot is still the player's.
   */
  applyAimAssist(dt, game) {
    if (!this.aimAssist) { this.aimLock = null; return; }
    const range = this.isMelee ? 9 : 34;

    // Stickiness first. Re-picking the best target every frame is what makes a
    // crowd feel broken: two enemies a degree apart trade the lock back and
    // forth at 60Hz and the view shivers between them. The one already held
    // keeps it on a wider cone than it took to acquire, so a fight has to
    // actually change before the aim does.
    const held = this.aimLock;
    let target = null;
    if (held && !held.dead) {
      const dx = held.x - this.x, dy = held.centerY - this.eyeY, dz = held.z - this.z;
      const d = Math.hypot(dx, dy, dz);
      const dir = forwardVec(this.yaw, this.pitch);
      const dot = d > 0.001 ? (dx * dir[0] + dy * dir[1] + dz * dir[2]) / d : 0;
      if (d <= range * 1.15 && dot >= 0.88) target = held;
    }
    if (!target) target = game.aimTarget(this, range, 0.94);
    // Published whether or not the view is actually being nudged this frame,
    // because the HUD outlines it: the assist was invisible before, so it was
    // impossible to tell a miss caused by a bad angle from one caused by the
    // assist having locked something else.
    this.aimLock = target || null;
    if (!target) return;

    // How hard the player is turning, decayed. Used as a *fade* rather than a
    // switch: the old code cut the assist dead above a threshold and restored
    // it in full below, so every thumb movement ended in a small lurch as the
    // correction came back all at once.
    this.lookInput = (this.lookInput || 0) * Math.max(0, 1 - dt * 6);
    const manual = clamp(1 - (this.lookInput || 0) / 0.012, 0, 1);
    if (manual <= 0.001) return;

    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const dy = target.centerY - this.eyeY;
    const flat = Math.hypot(dx, dz) || 1;
    const wantYaw = Math.atan2(-dx / flat, -dz / flat);
    const wantPitch = Math.atan2(dy, flat);

    // Shortest way round, so a target behind you does not spin the view.
    const dyaw = ((wantYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const dpitch = wantPitch - this.pitch;
    const off = Math.hypot(dyaw, dpitch);

    // The dead zone is a ramp, not a cliff. Stopping dead at a fixed error and
    // starting again the moment it is exceeded is a correction that switches on
    // and off several times a second, which is exactly what reads as stutter.
    const near = clamp((off - 0.012) / 0.05, 0, 1);
    if (near <= 0) return;

    // Exponential smoothing done properly: 1 - e^(-k dt) is the same curve at
    // any frame rate, where dt * k is not — the old form pulled harder on a
    // slow frame than on a fast one, so the assist behaved differently in a
    // busy fight than in an empty room, which is the worst place for it to
    // change.
    const pull = 1 - Math.exp(-9 * dt) * 1;
    // Rate ceiling, eased in over the last third rather than clamped flat. A
    // hard clamp makes the view slide at a constant speed and then change
    // curve the instant it drops under the limit, and that change of curve is
    // visible.
    const MAX_RATE = 0.85;
    const wantYawStep = dyaw * pull * near * manual;
    const wantPitchStep = dpitch * pull * near * manual;
    const want = Math.hypot(wantYawStep, wantPitchStep);
    const cap = MAX_RATE * dt;
    const scale = want > cap ? cap / want : 1;
    this.yaw += wantYawStep * scale;
    this.pitch = clamp(this.pitch + wantPitchStep * scale, -1.45, 1.45);
  }

  update(dt, game, input) {
    const wasHp = this.hp;
    this.updateBase(dt, game.world);
    this.applyAimAssist(dt, game);
    this.dispersionTimer = Math.max(0, this.dispersionTimer - dt);

    // Buffs
    let dirty = false;
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i];
      b.remaining -= dt;
      if (b.healPerSecond) game.healEntity(this, this, b.healPerSecond * dt);
      if (b.remaining <= 0) { this.buffs.splice(i, 1); dirty = true; }
    }
    if (this.rampageTimer > 0) {
      this.rampageTimer -= dt;
      if (this.rampageTimer <= 0) { this.rampageStacks = 0; dirty = true; }
    }
    if (dirty) {
      this.knockResist = 0;
      this.recomputeStats();
    }

    // Cooldowns & resource
    for (let i = 0; i < this.cooldowns.length; i++) {
      this.cooldowns[i] = Math.max(0, this.cooldowns[i] - dt);
    }
    this.gainResource(this.resourceRegen * dt);
    if (this.mods.regen && game.timeSinceCombat > 3) this.heal(this.mods.regen * dt);

    // Lava
    const lava = game.blockDamageAt(this.x, this.y + 0.2, this.z);
    if (lava) game.damageEntity(null, this, lava * dt, { source: 'lava' });

    // Movement
    this.updateMovement(dt, game, input);

    // Attacks
    this.attackTimer = Math.max(0, (this.attackTimer || 0) - dt);
    if (input.attack && this.attackTimer <= 0 && !this.disabled) this.basicAttack(game);

    // Skills
    for (let i = 0; i < this.skills.length; i++) {
      if (input.skills[i]) {
        input.skills[i] = false;
        // Counted at the call site rather than inside castSkill, which also
        // runs for pets and for the harness — a quest for "cast 600 skills"
        // must mean the player's own casts.
        if (castSkill(game, this, i) && game.tally) game.tally.skillsCast++;
      }
    }

    if (this.hp < wasHp) game.timeSinceCombat = 0;
    if (this.mods.vanish && wasHp / this.maxHp >= 0.3 && this.hp / this.maxHp < 0.3) {
      const idx = this.skills.findIndex((s) => s.id === 'ambush');
      if (idx >= 0) this.cooldowns[idx] = 0;
    }
    if (this.mods.guardianSpirit) {
      this.damageTakenMult *= this.hp / this.maxHp < 0.25 ? (1 - this.mods.guardianSpirit) : 1;
    }
  }

  updateMovement(dt, game, input) {
    const fwd = forwardVec(this.yaw, 0);
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    let mx = fwd[0] * input.moveY + rightX * input.moveX;
    let mz = fwd[2] * input.moveY + rightZ * input.moveX;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    if (this.dashTimer > 0) {
      // Charge/dash movement overrides normal control.
      this.dashTimer -= dt;
      this.vx = this.dashVX;
      this.vz = this.dashVZ;
      if (this.dashDamage > 0) {
        for (const m of game.enemiesInRadius(this.x, this.centerY, this.z, this.dashRadius)) {
          if (this.dashHits.has(m)) continue;
          this.dashHits.add(m);
          const dx = m.x - this.x, dz = m.z - this.z;
          const d = Math.hypot(dx, dz) || 1;
          game.dealDamage(this, m, this.dashDamage, {
            knockback: this.dashKnockback, kx: dx / d, kz: dz / d, skillId: this.dashSkillId,
          });
        }
      }
      if (this.hitWallX || this.hitWallZ) this.dashTimer = 0;
      return;
    }

    // Jump feel. Three standard forgiveness rules, all of which the previous
    // strict "on the ground this exact frame" check failed:
    //   coyote  — you may still jump for a moment after walking off a ledge
    //   buffer  — a jump pressed just before landing fires on touchdown
    //   cutoff  — releasing early cuts the arc short, so height is a choice
    this.coyote = this.onGround ? 0.12 : Math.max(0, (this.coyote || 0) - dt);
    this.jumpBuffer = Math.max(0, (this.jumpBuffer || 0) - dt);
    // Refill on the press *and* on every grounded frame the button is still
    // held, so holding jump keeps you hopping. A rising edge alone means one
    // jump per press — which silently strands anyone who holds the button to
    // scramble out of lava.
    if (input.jump && (!this.jumpHeld || this.onGround)) this.jumpBuffer = 0.14;
    this.jumpHeld = !!input.jump;

    const disabled = this.disabled || this.root > 0;
    const sprintMult = input.sprint && input.moveY > 0.2 ? 1.28 : 1;
    const speed = disabled ? 0 : this.moveSpeed * (1 - this.slow) * sprintMult;
    const accel = this.onGround ? 14 : 5;
    this.vx += (mx * speed - this.vx) * clamp(accel * dt, 0, 1);
    this.vz += (mz * speed - this.vz) * clamp(accel * dt, 0, 1);

    if (this.jumpBuffer > 0 && this.coyote > 0 && !disabled) {
      this.vy = 9.2;
      this.onGround = false;
      this.jumpBuffer = 0;
      this.coyote = 0;
    }
    if (!input.jump && this.vy > 3.2) this.vy = 3.2 + (this.vy - 3.2) * 0.35;
    this.sprinting = sprintMult > 1;
    const moving = Math.hypot(this.vx, this.vz);
    this.bobPhase += moving * dt * 1.6;
    this.walkPhase = this.bobPhase;
    this.viewKick = Math.max(0, this.viewKick - dt * 6);
  }

  basicAttack(game) {
    this.attackTimer = 1 / this.attackSpeed;
    this.swing = 1;
    this.viewKick = 1;
    const dir = forwardVec(this.yaw, this.pitch);

    if (this.isMelee) {
      const hits = game.enemiesInCone(this, this.attackRange, 0.85);
      if (!hits.length) { game.sfx('whiff'); return; }
      for (const m of hits) {
        const dx = m.x - this.x, dz = m.z - this.z;
        const d = Math.hypot(dx, dz) || 1;
        let dealt = game.dealDamage(this, m, this.attackDamage * this.stats.meleeMult, {
          knockback: 3.5, kx: dx / d, kz: dz / d, melee: true,
        });
        if (this.mods.doubleStrike && Math.random() < this.mods.doubleStrike) {
          dealt += game.dealDamage(this, m, this.attackDamage * this.stats.meleeMult * 0.6, { melee: true });
        }
      }
      if (this.mods.maelstrom) {
        const idx = this.skills.findIndex((s) => s.id === 'chainlightning');
        if (idx >= 0) this.cooldowns[idx] = Math.max(0, this.cooldowns[idx] - this.mods.maelstrom);
      }
      game.sfx('swing');
    } else {
      const w = this.cls.weapon.projectile;
      const count = 1 + (this.mods.extraProjectiles || 0);
      for (let i = 0; i < count; i++) {
        const spread = i === 0 ? 0 : rand(0.07, -0.07);
        const d = [
          dir[0] + spread * Math.cos(this.yaw),
          dir[1] + (i === 0 ? 0 : rand(0.04, -0.04)),
          dir[2] - spread * Math.sin(this.yaw),
        ];
        game.fireProjectile({
          owner: this, team: TEAM.PLAYER,
          x: this.x, y: this.eyeY - 0.15, z: this.z, dir: d,
          speed: w.speed, damage: this.attackDamage * this.stats.spellMult * (i === 0 ? 1 : 0.5),
          size: w.size, color: w.color, gravity: w.gravity || 0,
        });
      }
      game.sfx('shoot');
    }
  }

  /** Roll a crit for an outgoing hit, honouring Cold Blood. */
  rollCrit(force = false) {
    if (force) return true;
    if (this.mods.coldBlood) {
      this.coldBloodCounter++;
      if (this.coldBloodCounter >= this.mods.coldBlood) {
        this.coldBloodCounter = 0;
        return true;
      }
    }
    return Math.random() < this.critChance;
  }

  /** Third-person body — only drawn in spectator/death cam. */
  draw(r) {
    const c = this.cls;
    const toRgb = (h) => [
      parseInt(h.slice(1, 3), 16) / 255,
      parseInt(h.slice(3, 5), 16) / 255,
      parseInt(h.slice(5, 7), 16) / 255,
    ];
    drawHumanoid(r, this, {
      head: [0.92, 0.78, 0.66], body: toRgb(c.color), arm: [0.92, 0.78, 0.66], leg: toRgb(c.accent),
      faceTile: T.FACE_PLAYER,
    });
  }

  /**
   * First-person weapon, held low and to the side like a Minecraft item.
   * Everything is expressed in the camera's basis so it tracks the view.
   */
  drawViewModel(r, camera) {
    // `this.weapon` is the gear-tier appearance, set once when the run starts.
    // Falling back to the class's plain weapon keeps every harness that builds
    // a Player directly — the balance sim, the smoke tests — working unchanged.
    const w = this.weapon || weaponAppearance(this.cls, -1);
    const swing = this.swing;
    const ease = swing * swing * (3 - 2 * swing);        // smoothstep the swing
    const bobX = Math.sin(this.bobPhase * 2) * 0.012;
    const bobY = Math.abs(Math.cos(this.bobPhase * 2)) * 0.012;

    const fwd = forwardVec(camera.yaw, camera.pitch);
    const rx = Math.cos(camera.yaw), rz = -Math.sin(camera.yaw);
    const lefty = false;

    // Anchor point: forward of the eye, to the right, and below the crosshair.
    //
    // Pulled closer and dropped further than it used to sit. The weapon is
    // about to become the visible half of the gear system — a tier you can read
    // from your own hands — and at the old distance it was a sliver in the
    // corner. Closer to the eye is the only lever that makes it big without
    // making it clip through walls.
    const reach = 0.50 + ease * 0.12;
    const side = (lefty ? -1 : 1) * (0.26 + bobX) - ease * 0.05;
    const drop = -0.30 + bobY + ease * 0.09;
    const px = camera.x + fwd[0] * reach + rx * side;
    const py = camera.y + fwd[1] * reach + drop;
    const pz = camera.z + fwd[2] * reach + rz * side;

    const color = w.color;
    const tile = T[w.tile] ?? T.METAL;
    const yaw = camera.yaw + 0.42;
    const pitch = camera.pitch - 0.62 - ease * 1.05;

    // One factor over every shape, so the proportions that were tuned by eye
    // stay exactly as they were and only the size changes. The tier scales it
    // further: a T6 weapon is about a quarter larger than a T0 one, which is
    // the cheapest way to make a tier readable at a glance.
    const S = 1.6 * (w.scale || 1);
    // The tier's flourishes. Each one is a couple of extra boxes on a shape
    // that already exists, which is what makes sixty-three appearances
    // affordable: nothing here is modelled, it is all dials on one mesh.
    const glow = w.emissive || 0;
    const accent = w.accent || color;
    const gemSize = 0.036 * S;
    /** A small emissive stone, drawn only from T4. */
    const gem = (p, pitchOf) => {
      if (!w.gem) return;
      r.drawBox(p[0], p[1], p[2], gemSize, gemSize, gemSize,
        { tile: T.CRYSTAL, color: accent, emissive: 1, yaw, pitch: pitchOf });
    };
    if (w.type === 'staff') {
      const len = 0.42 * S;
      r.drawBox(px, py, pz, 0.035 * S, 0.035 * S, len, { tile: T.LOG_SIDE, color: [0.42, 0.32, 0.22], yaw, pitch });
      // Glowing head at the far end of the shaft, and from T2 a second, wider
      // ring of the tier's colour behind it.
      const tipF = 0.20 * S;
      if (w.core) {
        r.drawBox(px + fwd[0] * tipF * 0.72, py + fwd[1] * tipF * 0.72 + 0.045 * S, pz + fwd[2] * tipF * 0.72,
          0.052 * S, 0.052 * S, 0.030 * S, { tile: T.RUNE, color: accent, emissive: 0.8, yaw, pitch });
      }
      r.drawBox(px + fwd[0] * tipF, py + fwd[1] * tipF + 0.06 * S, pz + fwd[2] * tipF,
        0.075 * S, 0.075 * S, 0.075 * S, { tile, color, emissive: 1, yaw, pitch });
      gem([px + fwd[0] * tipF * 0.2, py + fwd[1] * tipF * 0.2 - 0.05 * S, pz + fwd[2] * tipF * 0.2], pitch);
    } else if (w.type === 'bow') {
      // A bow held vertically: two limbs angled off a grip, with a bright
      // string between the tips. Reads as ranged at a glance, which a sword
      // model on the game's only long-range class did not.
      const bp = pitch + 1.35;
      const ux = Math.sin(yaw) * Math.sin(bp);
      const uy = Math.cos(bp);
      const uz = Math.cos(yaw) * Math.sin(bp);
      const along = (t) => [px - ux * t, py - uy * t, pz - uz * t];
      r.drawBox(px, py, pz, 0.030 * S, 0.13 * S, 0.030 * S, { tile, color, yaw, pitch: bp });
      for (const s of [-1, 1]) {
        const a = along(s * 0.13 * S);
        r.drawBox(a[0], a[1], a[2], 0.026 * S, 0.13 * S, 0.026 * S,
          { tile, color, yaw, pitch: bp + s * 0.42 });
      }
      // The string, drawn as one thin emissive span so the draw reads. Higher
      // tiers colour it, which is the clearest tell a bow has.
      r.drawBox(px + fwd[0] * 0.02, py, pz + fwd[2] * 0.02, 0.010 * S, 0.40 * S, 0.010 * S,
        { tile: T.BLANK, color: w.core ? accent : [0.85, 0.9, 0.8], emissive: 0.5 + glow * 0.5, yaw, pitch: bp });
      gem(along(0), bp);
    } else if (w.type === 'hammer') {
      // A warhammer: short haft, heavy blocky head. Weight is the whole read.
      const bp = pitch + 1.35;
      const ux = Math.sin(yaw) * Math.sin(bp);
      const uy = Math.cos(bp);
      const uz = Math.cos(yaw) * Math.sin(bp);
      const along = (t) => [px - ux * t, py - uy * t, pz - uz * t];
      const head = along(-0.06 * S);
      r.drawBox(head[0], head[1], head[2], 0.11 * S, 0.10 * S, 0.09 * S, { tile, color, yaw, pitch: bp });
      // A band of the tier's colour around the head from T2.
      if (w.core) {
        r.drawBox(head[0], head[1], head[2], 0.115 * S, 0.032 * S, 0.095 * S,
          { tile: T.RUNE, color: accent, emissive: 0.7, yaw, pitch: bp });
      }
      r.drawBox(px, py, pz, 0.032 * S, 0.30 * S, 0.032 * S,
        { tile: T.LOG_SIDE, color: [0.40, 0.29, 0.19], yaw, pitch: bp });
      const cap = along(0.19 * S);
      r.drawBox(cap[0], cap[1], cap[2], 0.048 * S, 0.030 * S, 0.044 * S,
        { tile, color, emissive: 0.35 + glow * 0.4, yaw, pitch: bp });
      gem(along(0.10 * S), bp);
    } else {
      const len = (w.type === 'dagger' ? 0.22 : 0.32) * S;
      const bp = pitch + 1.35;
      // The blade's own "up" axis, so guard and grip stay glued to it.
      const ux = Math.sin(yaw) * Math.sin(bp);
      const uy = Math.cos(bp);
      const uz = Math.cos(yaw) * Math.sin(bp);
      const along = (t) => [px - ux * t, py - uy * t, pz - uz * t];
      r.drawBox(px, py, pz, 0.026 * S, len, 0.05 * S, { tile, color, yaw, pitch: bp });
      // A fuller of the tier's colour running the length of the blade, from T2.
      if (w.core) {
        r.drawBox(px, py, pz, 0.030 * S, len * 0.82, 0.014 * S,
          { tile: T.RUNE, color: accent, emissive: 0.55 + glow * 0.45, yaw, pitch: bp });
      }
      const g = along(len * 0.52);
      r.drawBox(g[0], g[1], g[2], 0.095 * S, 0.026 * S, 0.042 * S,
        { tile: T.METAL, color: [0.55, 0.5, 0.45], yaw, pitch: bp });
      const h = along(len * 0.74);
      r.drawBox(h[0], h[1], h[2], 0.030 * S, 0.10 * S, 0.034 * S,
        { tile: T.LOG_SIDE, color: [0.42, 0.30, 0.20], yaw, pitch: bp });
      gem(along(len * 0.52), bp);
    }

    // T6 alone leaves a trail, and only while swinging — a permanent one would
    // sit in the corner of the screen for the whole run and stop reading as
    // anything at all.
    if (w.trail && swing > 0.02 && swing < 0.98) {
      for (let i = 1; i <= 3; i++) {
        const back = i * 0.075;
        const s = (0.030 - i * 0.006) * S;
        r.drawBox(
          px - fwd[0] * back, py - fwd[1] * back + back * 0.35, pz - fwd[2] * back,
          s, s, s,
          { tile: T.BLANK, color: accent, emissive: 1 - i * 0.25, yaw, pitch });
      }
    }
  }
}

export { skillCooldown };
