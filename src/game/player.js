// The player: derived stats from class + talents + upgrades, resource
// handling, buffs, the basic attack, and first-person weapon rendering.

import { Entity, TEAM, drawHumanoid } from './entity.js';
import { T } from '../render/atlas.js';
import { clamp, forwardVec, rand } from '../core/math.js';
import { castSkill, skillCooldown } from './skills.js';

/** Sum every modifier source into one flat bag of numbers. */
export function buildMods(cls, talentRanks, permanent, runUpgrades) {
  const mods = {};
  const add = (key, value) => { mods[key] = (mods[key] || 0) + value; };

  for (const branch of cls.talents) {
    for (const node of branch.nodes) {
      const rank = talentRanks[node.id] || 0;
      if (!rank) continue;
      for (const [k, v] of Object.entries(node.effect)) add(k, v * rank);
    }
  }
  for (const [k, v] of Object.entries(permanent || {})) add(k, v);
  for (const up of runUpgrades || []) {
    for (const [k, v] of Object.entries(up.effect)) add(k, v * (up.stacks || 1));
  }
  return mods;
}

export class Player extends Entity {
  constructor(cls, mods, world) {
    super({
      x: world.playerSpawn.x, y: world.playerSpawn.y, z: world.playerSpawn.z,
      width: 0.6, height: 1.8, hp: cls.base.hp, team: TEAM.PLAYER,
    });
    this.cls = cls;
    this.mods = mods;
    this.buffs = [];
    this.cooldowns = cls.skills.map(() => 0);
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
  }

  /** Recompute derived stats; call after talents/upgrades change. */
  recomputeStats() {
    const b = this.cls.base;
    const m = this.mods;
    const buffMove = this.buffs.reduce((s, x) => s + (x.moveSpeed || 0), 0);
    const buffTaken = this.buffs.reduce((s, x) => s * (x.damageTaken ?? 1), 1);
    const buffDodge = this.buffs.reduce((s, x) => s + (x.dodge || 0), 0);

    this.maxHp = Math.round(b.hp + (m.maxHp || 0));
    this.resourceMax = this.resourceDef.max + (m.resourceMax || 0);
    this.resourceRegen = this.resourceDef.regen + (m.resourceRegen || 0);
    this.armor = clamp(b.armor + (m.armor || 0), 0, 0.75);
    this.moveSpeed = b.speed * (1 + (m.moveSpeed || 0) + buffMove
      + (this.rampageStacks * (m.rampage ? 0.06 : 0)));
    this.attackDamage = b.attackDamage * (1 + (m.attackDamage || 0));
    this.attackSpeed = b.attackSpeed * (1 + (m.attackSpeed || 0));
    this.attackRange = b.attackRange;
    this.critChance = clamp(b.critChance + (m.critChance || 0), 0, 0.85);
    this.critMult = b.critMult + (m.critMult || 0);
    this.dodge = clamp((m.dodge || 0) + buffDodge, 0, 0.8);
    this.damageTakenMult = buffTaken * (1 - clamp(m.damageReduction || 0, 0, 0.6));
    this.stats = {
      meleeMult: 1 + (m.meleeDamage || 0) + (m.allDamage || 0),
      spellMult: 1 + (m.spellDamage || 0) + (m.allDamage || 0),
      healMult: clamp(1 + (m.healing || 0), 0.2, 4),
    };
    this.lifesteal = m.lifesteal || 0;
    this.hp = Math.min(this.hp, this.maxHp);
  }

  get isMelee() { return this.cls.base.attackRange < 6; }

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

  update(dt, game, input) {
    const wasHp = this.hp;
    this.updateBase(dt, game.world);
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
    for (let i = 0; i < 4; i++) {
      if (input.skills[i]) {
        input.skills[i] = false;
        castSkill(game, this, i);
      }
    }

    if (this.hp < wasHp) game.timeSinceCombat = 0;
    if (this.mods.vanish && wasHp / this.maxHp >= 0.3 && this.hp / this.maxHp < 0.3) {
      const idx = this.cls.skills.findIndex((s) => s.id === 'ambush');
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

    const disabled = this.disabled || this.root > 0;
    const sprintMult = input.sprint && input.moveY > 0.2 ? 1.28 : 1;
    const speed = disabled ? 0 : this.moveSpeed * (1 - this.slow) * sprintMult;
    const accel = this.onGround ? 14 : 5;
    this.vx += (mx * speed - this.vx) * clamp(accel * dt, 0, 1);
    this.vz += (mz * speed - this.vz) * clamp(accel * dt, 0, 1);

    if (input.jump && this.onGround && !disabled) {
      this.vy = 9.2;
      this.onGround = false;
    }
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
        const idx = this.cls.skills.findIndex((s) => s.id === 'chainlightning');
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
    const w = this.cls.weapon;
    const swing = this.swing;
    const ease = swing * swing * (3 - 2 * swing);        // smoothstep the swing
    const bobX = Math.sin(this.bobPhase * 2) * 0.012;
    const bobY = Math.abs(Math.cos(this.bobPhase * 2)) * 0.012;

    const fwd = forwardVec(camera.yaw, camera.pitch);
    const rx = Math.cos(camera.yaw), rz = -Math.sin(camera.yaw);
    const lefty = false;

    // Anchor point: forward of the eye, to the right, and below the crosshair.
    const reach = 0.62 + ease * 0.14;
    const side = (lefty ? -1 : 1) * (0.30 + bobX) - ease * 0.06;
    const drop = -0.34 + bobY + ease * 0.10;
    const px = camera.x + fwd[0] * reach + rx * side;
    const py = camera.y + fwd[1] * reach + drop;
    const pz = camera.z + fwd[2] * reach + rz * side;

    const color = [
      parseInt(w.color.slice(1, 3), 16) / 255,
      parseInt(w.color.slice(3, 5), 16) / 255,
      parseInt(w.color.slice(5, 7), 16) / 255,
    ];
    const tile = T[w.tile] ?? T.METAL;
    const yaw = camera.yaw + 0.42;
    const pitch = camera.pitch - 0.62 - ease * 1.05;

    if (w.type === 'staff') {
      const len = 0.42;
      r.drawBox(px, py, pz, 0.035, 0.035, len, { tile: T.LOG_SIDE, color: [0.42, 0.32, 0.22], yaw, pitch });
      // Glowing head at the far end of the shaft.
      const tipF = 0.20;
      r.drawBox(px + fwd[0] * tipF, py + fwd[1] * tipF + 0.06, pz + fwd[2] * tipF,
        0.075, 0.075, 0.075, { tile, color, emissive: 1, yaw, pitch });
    } else {
      const len = w.type === 'dagger' ? 0.22 : 0.32;
      const bp = pitch + 1.35;
      // The blade's own "up" axis, so guard and grip stay glued to it.
      const ux = Math.sin(yaw) * Math.sin(bp);
      const uy = Math.cos(bp);
      const uz = Math.cos(yaw) * Math.sin(bp);
      const along = (t) => [px - ux * t, py - uy * t, pz - uz * t];
      r.drawBox(px, py, pz, 0.026, len, 0.05, { tile, color, yaw, pitch: bp });
      const g = along(len * 0.52);
      r.drawBox(g[0], g[1], g[2], 0.095, 0.026, 0.042,
        { tile: T.METAL, color: [0.55, 0.5, 0.45], yaw, pitch: bp });
      const h = along(len * 0.74);
      r.drawBox(h[0], h[1], h[2], 0.030, 0.10, 0.034,
        { tile: T.LOG_SIDE, color: [0.42, 0.30, 0.20], yaw, pitch: bp });
    }
  }
}

export { skillCooldown };
