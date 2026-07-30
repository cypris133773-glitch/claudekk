# Raid boss mechanics

Eight mechanics, forty-two bosses, one player with four skills and a jump.

This is the specification for the eight ids already listed in `MECHANICS` in
`src/data/raids.js`. Nothing here invents a combat system. Every mechanic below
is a parameterised call into functions the arena already runs sixty times a
second — `game.telegraph`, `game.explode`, `game.spawnZone`, `game.spawnMob`,
`game.fireProjectile`, `game.delay` — for the same reason the raids were
written that way in the first place: a second combat system is a second thing
to balance, and there is only time to balance one.

Three rules run through all of it, and every number below is downstream of them.

**A raid boss is one `Mob` with one extra behavior.** `boss_raid` sits beside
`aiBoss`, `aiWarden` and `aiBrood` in `src/game/mobs.js` and is about a hundred
and twenty lines: a cast timer, a phase check, and a switch on the boss's
`mechanic`. If a mechanic cannot be expressed that way it is the wrong
mechanic. Two of the eight were redesigned on exactly that test; both are
called out where it happened.

**Space is constant; cost is not.** The arena is the same size at tier 6 as at
tier 0 and the player's legs are the same speed. So tier and boss power buy
*damage* and *health*, never a wider danger zone and never a shorter warning.
A mechanic that is dodgeable in Zul'Gurub is dodgeable in Icecrown, and it
hurts three times as much when you fail it. Readability is not a difficulty
dial.

**Unwinnable is a bug.** Wipes are free and only a kill consumes a boss, so
the fight is allowed to be brutal. It is not allowed to contain a moment with
no correct input. Every guard in the "Failure modes" sections exists because
the mechanic, written the obvious way, has such a moment in it.

---

## 1. What the engine already gives you

Nothing in this document needs a new class. This is the whole inventory, with
what each thing actually does — because the numbers later depend on the details.

| Call | What it does | Detail that matters |
| --- | --- | --- |
| `game.telegraph(x,y,z,r,delay,fn,color)` | Ground ring of emissive blocks, fires `fn` after `delay` | The drawn ring sweeps from **0.35·r to 1.0·r** over the delay. Until the last frame the danger is bigger than the picture. See §2.4. |
| `game.explode(x,y,z,r,dmg,{team:ENEMY,…})` | Shockwave rings, debris, `explode` cue, screen shake, hit-stop and screen flash above r≥4 | Damage falls off as `clamp(1 - d/r*0.6, 0.3, 1)`. **No vertical check on the enemy path** — jumping never avoids a blast. Routes through `damageEntity`, so armour and dodge apply, `melee:false` so thorns do not reflect. |
| `game.spawnZone(x,y,z,{radius,dps,duration,slow})` | Lingering hazard, ticks every 0.4 s | `dps` is per second (it deals `dps*0.4` per tick). Applies `applySlow(slow, 0.6)` on every tick, so a 0.35 slow inside a zone is continuous. Vertical tolerance 3.5 blocks. |
| `game.fireProjectile({dir\|target,…})` | A flying cube that collides with world and entities | With `target` it leads the player by 0.25 s of their velocity. The fan pattern in `aiWarden`/`aiBrood` is the cone primitive. |
| `game.spawnMob(typeId,x,y,z,elite)` | Full `Mob` at current wave scaling, affixes applied | Also runs the leash (`checkStuck`), so a stranded add does not hang the fight. |
| `game.delay(s, fn)` | One-shot timer on `game.timers` | Cleared by `reset()`, so a wipe cannot leak a pending detonation into the next attempt. Every callback must still open with `if (this.dead) return;`. |
| `Mob.startSwing(mult, knock, windup)` | Telegraphed melee: pose, `windup` cue at <12 blocks, hit resolved only if still in range | Stepping out of reach during the wind-up makes it miss. This is the auto-attack and it is already correct. |
| `Mob.checkEnrage(game)` | Below 35% health: notify, `roar`, shake, 40-particle burst, ×1.28 speed, ×1.25 damage, guarded by `this.enraged` | Phase 3 for every boss, verbatim. |
| `Mob.enrageNova(game)` | Three delayed telegraph+explode rings at 5 / 8.5 / 12 blocks | The `slam` prototype. |
| `game.notify` / `sfx` / `impactFlash` / `screenShake` / `burst` / `beam` | Banner text, one of ~40 synthesised cues, full-screen colour wash, shake, particles, a lightning line | `impactFlash` decays at 4.5/s. All audio is **mono** — there is no panner in `src/core/audio.js`. |
| `Hud.drawOffscreenMarkers` / `drawMinimap` | Screen-edge arrow and a radar pin for every boss and elite, boss pinned to the rim when out of range | This is why §2.3 works. |
| `Entity.applyDot` / `applySlow` | Status on the player; `applyDot` **refreshes** rather than stacks for the same (type, source) | The stacking guard is already written. |
| `audio.setMusicIntensity(0..1)` | Music bed volume | Free phase-change cue. |

Two things it does not give you, and what was done about them:

- **No cone telegraph.** `Telegraph` draws circles only, and `enemiesInCone` is
  player-side. `breath` was redesigned into a fanned projectile stream (§4.2),
  which is what `aiWarden` and `aiBrood` already do and which reads better in
  first person anyway — a wall of flying objects is legible from the side, a
  ground wedge is not.
- **No player root worth having.** `Entity.root` exists and the player's
  movement respects it, but the player has no dodge, no interrupt and no
  cleanse. A root means "take the next thing for free", which is not a
  mechanic, it is a delayed death. `frost` slows and does not root (§4.6).
  **Follow-up:** the `frost` blurb in `raids.js` says "slows and roots" and
  should lose the last two words.

Everything else that is new is data (§7) plus `boss_raid` itself.

---

## 2. The shared telegraph vocabulary

This section matters more than any single mechanic. A player learns this
language once, in Zul'Gurub, at level 1, and then reads all forty-two fights
with it. Every mechanic below is assembled out of these parts and adds nothing
of its own.

Reaction budget, which is where the durations come from: a *known* stimulus
costs about 0.25–0.30 s to perceive and act on, and audio lands 40 ms before
vision. On a phone, add the thumb: the left stick has to be found, pushed, and
the character has to accelerate. So the floor for anything avoidable is
**1.0 s**, and the standard is **1.2–1.5 s**, which buys 0.3 s of reading,
0.2 s of deciding and 0.7–1.0 s of running — four to five blocks at the
slowest class's 4.7 blocks/s.

### 2.1 Three colours, and they mean an action

The colour says what to *do*, never which boss it is. The boss's own `color`
still drives its aura, its projectiles and its gibs; that is where flavour
lives. Danger colour is fixed:

| Colour | Class | Means | Used by |
| --- | --- | --- | --- |
| `#ff7a3c` amber | **burst** | Detonates in about a second. Be outside the circle. | slam, breath ignition, enrage nova |
| `#8fe3ff` ice | **linger** | The floor is gone for several seconds. Route around it. | frost |
| `#b06cff` violet | **aimed** | This one is following *you*. It resolves where you are, or where you were. | bombs, charge, adds, shadow |

Three colours is the ceiling. A fourth would be a colour a player has to
*remember* rather than recognise, and the difference between amber and violet
has to survive a 6-inch screen in a lava-lit arena.

### 2.2 Three shapes, three durations

| Shape | Reads as | Duration class |
| --- | --- | --- |
| Ring centred on the **boss** | "get away from it" | 0.9 s lock (charge), 1.2 s standard (slam) |
| Ring centred on **you** | "get away from where you are" | 1.5 s (bombs), 2.2 s evacuation (shadow) |
| Objects in flight | "there is a lane, be out of it" | 1.4 s wind-up then a 1.5 s stream (breath) |

Nothing is faster than 0.9 s. Nothing avoidable is slower than 2.2 s, because
past that the player stops treating it as a reaction and starts treating it as
a pause in the fight.

### 2.3 It works from any facing, because of where it is centred

The hard constraint: first person, on a phone, one thumb on the stick and one
on a look-drag that is also the attack. **If the tell is behind you, it does
not exist.** Three properties together make that a non-problem, and they are
the reason the mechanic list looks the way it does:

1. **Every dangerous thing is centred on the boss or on the player. Never on a
   third place.** A ring under your own feet is in the bottom third of the
   screen at every yaw and every pitch above about −40°. A ring under the boss
   is where you were already looking, and if you are not, the boss already has
   a screen-edge arrow (`drawOffscreenMarkers`) and a radar pin
   (`drawMinimap`, pinned to the rim when out of range). `frost` is the one
   mechanic that puts something at a third place; it is also the one that does
   4.5% of your health per second rather than 30% at once, precisely so that
   backing into one is a warning and not a death.
2. **Audio is omnidirectional and says *what* and *when*, never *where*.** The
   audio graph is mono. That is a constraint, not a bug to fix: it means the
   cue set has to be a vocabulary rather than a radar, and the map below gives
   each cue exactly one job.
3. **Every cast opens with a full-screen wash.** `game.impactFlash(colour,
   0.18)` at the instant a cast begins, in the mechanic's colour class. It is
   two frames of tint, it costs nothing, and it is the only cue that reaches a
   player who is facing a wall. It means "something started; the sound will
   tell you what".

### 2.4 The boundary ring

`Telegraph.draw` sweeps its ring from 35% to 100% of the radius over the
delay. For a 4-block skill cast by the player that is fine. For an 11-block
raid mechanic it is a lie for a full second: a player standing at 9 blocks sees
a ring that has not reached them yet and stands still.

The fix is five lines in `Telegraph.draw`, and it is the highest-value
readability change in this document: draw a **static, dim outer ring at the
full radius** for the whole delay, and keep the existing bright sweeping ring
inside it as the clock. Boundary says where, sweep says when. Every mechanic
here assumes it.

### 2.5 The cue map

Each cue gets one job and keeps it across all forty-two bosses.

| Cue | Job | Fired by |
| --- | --- | --- |
| `cast` | **A mechanic has begun.** Every cast, always, first. | all |
| `windup` | An ordinary melee swing. Nothing else, ever. | `startSwing` |
| `fuse` | Something is armed *on you*. | bombs, breath charging |
| `charge` | Committed, moving, direction now fixed. | charge |
| `stomp` | Ground burst landing. | slam, bombs, enrage nova |
| `curse` | Rot landing or ticking. | shadow |
| `shatter` | Ice hitting the floor. | frost |
| `roar` | Phase change, or something is being summoned. Loud, low, rare. | adds, phase 2, enrage |
| `explode` | Automatic, from `game.explode`. | — |

The pattern a player learns in the first fight: `cast` … *second cue* …
`explode`. The gap between the first and the second is where they decide, and
the second cue is what they decide on.

### 2.6 Rhythm

One boss, one cast timer. **Two mechanics never resolve inside 0.8 s of each
other**, and a cast never starts while another is pending. A fight that
overlaps its own telegraphs is not harder, it is unreadable, and the player
cannot tell whether they died to a thing they misread or a thing they never
saw.

---

## 3. Numbers: two formulas and a table

### 3.1 The tier-appropriate player

Raid tier *t* gates on the full tier *t−1* set, which is *t* rungs of gear at
+0.094 max-health per rung, on a class base between 92 and 175 (median 112,
mean 119), plus a Forge that is realistically 5% a tier in that stretch:

```
PHP(t) = 115 * (1 + 0.144 * t)      // ~115 at tier 0, ~215 at tier 6
```

Mitigation is separate and large: `damageEntity` multiplies by `1 - armor`,
and armour runs 0.06 (mage) to 0.32 (paladin) plus gear. **Every percentage
below is nominal**; a median build feels about 80% of it, a paladin about 65%,
a mage about 92%. That spread is intentional and is the same one the arena
already runs on.

### 3.2 The boss

```
HIT(t, power)  = 0.10 * PHP(t) * (0.55 + 0.45 * power)   // mob.damageAmount
HP(t, power)   = 2600 * (1 + 0.45*t + 0.04*t*t) * power
```

`HIT` is the whole damage budget: every mechanic below is quoted as `k × HIT`,
so `k = 3.2` reads directly as 32% of health before armour, 26% after.

Why power scales health nearly in full and damage only weakly (`0.55 + 0.45p`
runs 1.00 → 1.54 across a raid, while health runs 1.00 → 2.20): the player's
mitigation does not improve *within* a raid. They gain at most six gear rungs
over six bosses, worth about +13% damage and +9% health, and only if they have
the gold. A last boss that hit 2.2× as hard as the first would turn "hard" into
"one mistake is the attempt" for a player wearing exactly the gear the gate
demanded. So the last boss of a raid is mostly a *longer* fight — more
repetitions of a mechanic you now know — with hits that are half again as heavy.

Health is a starting constant, not a measured one. Target time-to-kill is
**45–120 s**: below 45 s a boss never reaches phase 3 and the mechanics never
teach; above 120 s a phone fight becomes an endurance test with a thumb.
**Follow-up:** `tools/balance-sim.js` needs a `--raid <tier>` mode that drops
its bot into one boss fight and reports TTK and damage taken per mechanic;
until then 2600 is an estimate from arena DPS and should be trued up per tier,
not per boss.

The boss never heals, never gains absorb, and has no hard enrage timer. Any
positive damage output eventually wins. That is what keeps "wipes are free"
from being a lie.

### 3.3 The whole set, in one table

Radii are in blocks and are **identical at every tier and every power**. Cast
times likewise. Only `k`, health and cadence move.

| Mechanic | Colour | Cast | Radius / reach | `k` | Base cd | Duration |
| --- | --- | --- | --- | --- | --- | --- |
| slam | amber burst | 1.2 s, +0.55 s per ring | 4.5 / 8 / 11 | 2.6 / 2.2 / 1.8 | 9 s | 2.3 s |
| breath | amber burst | 1.4 s | 18 long, 24° half-angle | 0.45 × 30 shots | 11 s | 1.5 s channel |
| adds | violet aimed | 1.0 s | spawn ring at 3 | — | 14 s | until killed |
| charge | violet aimed | 0.9 s | 2.5 impact | 1.6 | 8 s | 1.1 s travel |
| bombs | violet aimed | 1.5 s | 4.5 | 3.2 | 8 s | — |
| frost | ice linger | 1.1 s | 4.2, two pools | 0.45 /s | 12 s | 8 s |
| shadow | violet aimed | 2.2 s | 9 | 2.0 + 0.30 /s for 6 s | 13 s | 6 s dot |
| enrage | — (phase) | — | 5 / 8.5 / 12 nova | 0.75 per ring | 10 s nova | — |

### 3.4 The miss budget

At a 9 s cadence and a 75 s fight the player sees about eight casts. Reading
all eight still costs roughly 35% of health in auto-attacks and chip. A full
miss on a signature mechanic costs 25–35% nominal, so **three misses is a
wipe** and the fourth is not survivable at any tier. That is the intended
difficulty and it is what "hard" means here.

The player has no healer, and four of the nine classes have no heal in their
opening loadout. The sustain valve is potions, using the existing `Potion`
class: **one potion every 25 s of fight**, dropped at `world.pickSpawn` 8–16
blocks from the player, plus whatever adds drop at the normal rate. It heals
and it is positional — you have to leave the boss to get it — which is exactly
the trade a solo fight should be asking about.

---

## 4. The eight mechanics

Each one: what it is built on, what the player sees and hears, the numbers,
the counterplay, how it composes, and how it goes wrong.

### 4.1 slam — Shockwave

Rings of force marching outward from the boss.

**Built on.** `Mob.enrageNova` almost verbatim: `game.delay` → `game.telegraph`
→ `game.explode`. No new code at all; the arena boss has been doing this since
wave 5.

**Telegraph.** The boss plants — velocity damped to 0.5, no turning — and the
`cast` cue fires with an amber `impactFlash(0.18)`. Ring one's amber telegraph
appears under the boss at 1.2 s; rings two and three follow at 0.55 s intervals
with their own 0.5 s warnings, so the whole thing is 2.3 s of visible,
audible structure with `stomp` on each detonation. From any facing: ring one
only reaches 4.5 blocks, which is melee range, and someone in melee is looking
at the boss. Rings two and three arrive from the boss's direction with their
own warning and the boss has a screen-edge arrow. A player who is far away and
facing the wrong way is not in danger from this at all, which is the honest
resolution rather than a UI patch.

**Numbers.** Radii 4.5 / 8 / 11, fixed forever. `k` = 2.6 / 2.2 / 1.8 (26% /
22% / 18% nominal at power 1.0; 40% / 34% / 28% at power 2.2), knockback 8,
`explode`'s own falloff on top. Cadence 9 s × phase rate.

**Counterplay.** Run directly away from the boss, on the left stick, the moment
you hear `cast`. The arithmetic, for the slowest class (paladin, 4.7 blocks/s),
starting from inside melee at 3 blocks, reacting at cast+0.3:

| Ring | Fires at | Radius | You are at |
| --- | --- | --- | --- |
| 1 | 1.20 s | 4.5 | 7.2 ✓ |
| 2 | 1.75 s | 8 | 9.8 ✓ |
| 3 | 2.30 s | 11 | 12.4 ✓ |

1.4 blocks of margin for the worst case, more for everyone else, and ring 3 is
the cheap one so clipping it is not fatal. No look-drag needed, no jump, no
dodge. It costs melee uptime, which is the point.

**Composition.** slam and `charge` share a timer and can never both be pending:
charge drags the boss to you and slam pushes you away from it, so together they
mean the rings follow you out. slam while a `frost` zone sits on your escape
side is legal but the frost cap (§4.6) keeps it from being a wall.

**Failure modes.** Three nested circles that all cover the arena is one
unavoidable hit. Guard: outer radius hard-capped at 11 blocks, and a raid arena
must have at least a 16-block open radius around the boss's anchor. Second
failure: slamming a player who cannot move. Guard is global (§5): no burst
resolves while the player is rooted, frozen, or slowed above 0.2.

### 4.2 breath — Breath

A wide cone in front. Get behind it.

**Built on.** `game.fireProjectile` in the fan pattern `aiWarden` already uses.
**This is a redesign**: a ground cone would need a new telegraph shape and a
mob-side cone test, and neither reads well in first person anyway. A stream of
flying objects reads from the side, collides with the world, and needs nothing
new.

**Telegraph.** 1.4 s wind-up: the boss stops, faces the player once, and burns
`game.burst` particles at `eyeY` in its own colour while `fuse` hisses under
the `cast` cue. Then 1.5 s of stream. **Facing is sampled once, at the end of
the wind-up, and frozen for the channel** — `turnToward` is skipped. From any
facing: the safe zone for this mechanic is *behind the boss*, and being behind
the boss means the boss is in front of you. It is the one mechanic whose
failure state is only reachable while you can see it.

**Numbers.** Half-angle 0.42 rad (24°), reach 18 blocks, 6 projectiles per
volley × 5 volleys over 1.5 s, `k` = 0.45 each. Standing in the whole thing
catches about 8 of the 30 → 3.6 × HIT = 36% nominal at power 1.0, 55% at power
2.2. Cadence 11 s.

**Counterplay.** Strafe sideways on the left stick. At 12 blocks a 24° cone is
5 blocks wide either side — one second of walking. At 4 blocks it is 1.7
blocks — a third of a second. Both fit inside the 1.4 s wind-up with room, and
either direction works, which matters when the correct direction is a coin
flip on a small screen.

**Composition.** breath after `charge` is legal and good — the charge relocates
the boss and the breath re-aims from there — provided the full 1.4 s wind-up is
paid, never shortened. breath is forbidden while the player is slowed above
0.2, same global rule.

**Failure modes.** A boss that keeps tracking during the channel makes the cone
undodgeable, and this is the single most common way this mechanic is built
wrong. Guard: facing frozen at ignition, enforced in the channel branch. Second
failure: the boss walks while breathing and sweeps the cone across the arena.
Guard: velocity damped to zero for the whole channel; the boss is a turret for
2.9 s and that immobility is the player's damage window.

### 4.3 adds — Summons

Calls help. Clear it or be surrounded.

**Built on.** `game.spawnMob`, which already applies wave scaling and the
leash, plus the Broodmother's population check.

**Telegraph.** `roar` under `cast`, a violet `impactFlash`, a `game.notify`
line, and a violet 1.0 s `game.telegraph` ring at each spawn point — a ring of
three at 3 blocks around the boss. From any facing: the adds walk at you, the
radar draws every mob (not just bosses), and adds that get lost are relocated
by `checkStuck`. This is the one mechanic whose readback is the radar, which is
fine, because it is also the only one that stays on screen for twenty seconds.

**Numbers.** 3 adds, or 4 at power above 1.3. Type by tier so the difficulty
climbs with the roster: husk/crawler at tiers 0–1, stalker/skele at 2–3,
hexer/wraith at 4–6. Health `0.06 × HP(t, power)` so two to four seconds of
attention kills one; damage from their own definitions at the raid's scaling.
Cadence 14 s — the longest, because the adds themselves fill the gap.

**Counterplay.** Kill them, or back away and fight them in a line: they spawn
in a ring at the boss, so retreating funnels them. Every class has area damage
by the time it can enter a raid. The adds drop potions at the normal rate,
which makes clearing them the sustain play as well as the safety play.

**Composition.** While adds are alive the boss's cast timer runs 2 s longer —
the player is never fighting six things and a telegraph at once. `shadow` is
skipped outright while more than 3 adds live (§4.7). `charge` is fine and
actively good: it separates the boss from its own pack.

**Failure modes.** Unbounded adds is the classic way a solo fight becomes
unwinnable. Guards: hard cap of 8 total live enemies including the boss — a
summon that would exceed it is dropped and the boss idles 3 s instead, so
killing adds buys uptime; adds die with the boss (`dead = true` plus a burst,
not left standing over a corpse); adds never summon.

### 4.4 charge — Charge

Closes the gap instantly and knocks you back.

**Built on.** `aiBrood`'s charge state, verbatim: telegraph → `state='charge'`
→ fixed `chargeVX/chargeVZ` → `meleeHit` on contact → ends on `chargeTime` or
`hitWallX/hitWallZ`.

**Telegraph.** 0.9 s. Two violet rings: one radius-2.5 under the boss, one
radius-2.5 under **you**. Two rings with nothing between them is a line, and it
costs no new drawing code. `cast`, then `charge` at commit. From any facing:
the ring under your feet is the primary tell and it is always on screen; the
ring under the boss tells you which way the line runs, and the arrow finds the
boss if it is behind you.

**Numbers.** Lock 0.9 s, travel at `speed × 4.2` for 1.1 s ≈ 16–18 blocks,
impact `k` = 1.6 (16% nominal), knockback 10. Cadence 8 s.

Deliberately the cheapest mechanic in the set. Its cost is *position*, not
health: a gap-closer that also hits for a third of your health punishes ranged
classes twice, once for being far away and once for no longer being far away.

**Counterplay.** Two blocks sideways after the commit. The direction is fixed
at commit — that is already how the reference code works and it must stay that
way. Left stick only; at 0.9 s of lock, 2 blocks needs 2.2 blocks/s and the
slowest class does 4.7.

**Composition.** Never with `slam` (§4.1). Never within 1.5 s of a `bombs`
placement — a bomb at your feet and a charge into your feet resolve at the same
spot, and the escape vectors are opposites.

**Failure modes.** A charge that tracks mid-flight is undodgeable; the velocity
is frozen at commit. A charge that repeatedly knocks the player into lava is a
death with no input; guard is world-side — raid arenas with `theme.lava` keep a
6-block solid margin at the rim — plus the knockback cap of 10.

### 4.5 bombs — Detonate

Marks the ground, then it goes off.

**Built on.** `game.telegraph` + `game.explode`, which is exactly the Warden's
ground-scorch and the `volatile` affix.

**Telegraph.** A violet ring appears **under your feet** and does not follow —
walking out of it is the entire mechanic. 1.5 s fuse, `cast` then `fuse` at
placement, `stomp` and `explode` on detonation. From any facing: a ring
centred on the player is in the lower third of the screen at every yaw, and the
boundary ring (§2.4) means its true edge is drawn from the first frame.

**Numbers.** Radius 4.5, fixed. Fuse 1.5 s. `k` = 3.2 (32% nominal at power
1.0, 49% at power 2.2). Cadence 8 s. Repetitions by phase: 1 / 2 / 3, staggered
0.6 s apart, each placed at the player's live position at the moment it is
placed.

**Counterplay.** Walk 5 blocks in 1.5 s — 3.3 blocks/s against a floor of 4.7.
Left stick only. The staggered second and third bombs punish stopping and
reward committing to one direction, which is the habit the whole fight is
teaching.

**Composition.** **bombs and frost is the dangerous pair and the most
important rule in this document.** A 35% slow turns the required 3.3 blocks/s
into 5.1 and the slowest class cannot make it: unavoidable damage with extra
steps. Hard rule, both directions: a bomb is never placed on a player who is
slowed or rooted, and a frost pool is never spawned inside the radius of a live
bomb ring. Never within 1.5 s of a `charge`.

**Failure modes.** Overlapping bombs that cover every escape. Guard: each bomb
after the first must be placed at least 6 blocks from every live bomb's centre;
if the placement fails that test, the extra bomb is dropped rather than moved —
a bomb in a compromise position is a bomb nobody can read.

### 4.6 frost — Frost

Freezing ground. Slows, and holds ground.

**Built on.** `game.spawnZone` with `slow`, which the Warden already uses. **A
partial redesign**: the mechanic as blurbed roots the player, and it must not.
With no dodge, no interrupt and no cleanse, a root is a guaranteed hit from
whatever comes next, and "you are standing still and about to be hit" is not a
decision. Slow only.

**Telegraph.** Ice-blue ring, 1.1 s, `cast` then `shatter` on landing. Two
pools per cast, placed 3–7 blocks from the player in random directions — the
Warden's `rand(5,-5)` pattern. This is the only mechanic that puts something at
a third place, and it is deliberately the cheapest per second in the set for
exactly that reason.

**Numbers.** Radius 4.2, duration 8 s, `k` = 0.45 per second (4.5% nominal per
second; a full second inside costs less than half an auto-attack), slow 0.35
refreshed every 0.4 s tick. Cadence 12 s. At most **4 live pools**; a fifth
kills the oldest.

**Counterplay.** Leave, or route around. The value of the mechanic is not its
damage, it is that it takes floor away and every other mechanic in the fight is
solved by having floor. Backing into one costs a few percent and tells you it
is there, which is the correct punishment for a hazard you cannot see behind
you.

**Composition.** Forbidden with `bombs` (§4.5). Fine with `charge`: two blocks
of lateral movement at 65% speed is 0.65 s inside a 0.9 s lock. Fine with
`slam`, because slam's counterplay is a straight line outward and 4 pools cover
220 of the arena's ~1600 square blocks. Forbidden with `shadow`, which needs
4.1 blocks/s to escape and does not have it at 65% speed.

**Failure modes.** Zone spam that tiles the floor. Guards: the cap of 4, the
8 s duration, and pools that never spawn within 2 blocks of each other. Second
failure: a pool spawned directly on the player, which is unavoidable damage.
Guard: minimum placement distance of 3 blocks from the player's position at the
end of the telegraph, not at the start.

### 4.7 shadow — Affliction

Lingering rot in a wide area.

**Built on.** `game.telegraph` + `game.explode` + `Entity.applyDot` on the
player, all existing. The player's dots tick in `updateBase` and death is
caught by the `player.dead` check right after `player.update`.

**Telegraph.** The widest and slowest in the game: a violet ring **centred on
you**, radius 9, 2.2 s, `cast` then `curse`, with a violet wash. This is the
fight's evacuation beat and the mirror image of `slam` — slam pushes you off
the boss, shadow pushes you off *yourself*, and the two together are what stop
a player from finding one safe tile and standing on it.

**Numbers.** Radius 9, cast 2.2 s, `k` = 2.0 on landing (20% nominal) plus a
`shadow` dot of `k` = 0.30 per second for 6 s (18% more), so eating it whole is
38% at power 1.0 and 58% at power 2.2. Cadence 13 s. One `game.notify` on
application; the dot is silent otherwise, because a floater every tick from an
effect on yourself is noise.

**Counterplay.** Run out: 9 blocks in 2.2 s is 4.1 blocks/s against a floor of
4.7. That is the tightest requirement in the document, deliberately — it is the
mechanic that says "the arena is bigger than you think" — and it has 0.6 s of
slack for the slowest class from a standing start.

**Composition.** shadow plus `adds` is the pair that kills: the rot makes
standing still lethal at exactly the moment you are surrounded. Rule: the cast
is skipped entirely while more than 3 adds are alive, and the timer re-rolls.
Forbidden while slowed (§4.6): 4.1 blocks/s is not available at 65% speed, and
this is the one mechanic where the global slow rule is load-bearing rather than
belt-and-braces.

**Failure modes.** Dot stacking into something the balance never saw —
`applyDot` already refreshes rather than stacks for the same type and source,
and the source is the boss, so this is guarded in the engine. Second failure:
a 9-block circle in a corridor. Guard: the same 16-block open radius the arena
already owes `slam`.

### 4.8 enrage — Frenzy

Below a third health it hits far harder.

**Built on.** `Mob.checkEnrage` verbatim, plus `enrageNova`.

This one is not a sibling of the other seven. **Every** boss enrages at 35% —
that is phase 3 (§6) and it is already written. A boss whose data says
`mechanic: 'enrage'` is a boss with *no signature mechanic*: it fights with
autos, the raid's own trial (§6), and an escalation that starts earlier and
goes one step further. In the data these are `hakkar`, `ragnaros1`, `saurfang`,
`bloodboil` and `ragnaros2` — the heaviest boss of five of the seven raids,
which is exactly right: the last fight of a tier should be a wall of pressure
rather than a puzzle, because the puzzle was the five bosses before it.

**Telegraph.** `roar`, a `game.notify` banner, 0.5 screen shake and a 40-mote
burst — all already in `checkEnrage` — plus two permanent changes so the state
is legible ten seconds later: `audio.setMusicIntensity(1)`, and `drawAuras`
reading `m.enraged` to brighten the boss's aura ring. A phase you noticed once
and then forgot is a difficulty spike.

**Numbers.** For the `enrage` bosses: first step at **50%** health (not 35%),
damage ×1.25, speed ×1.28, cadence ×0.78. Second step at **20%**: damage ×1.15
again, cadence ×0.8 again. Worst case ×1.44 damage and cadence at 62% of
baseline. `enrageNova` on 45% of casts at 5 / 8.5 / 12 blocks, `k` = 0.75 per
ring, which the arena already tunes.

**Counterplay.** Distance and tempo. An enraged boss's damage is mostly in its
autos, and its speed of 1.28× a base 2.5–3.4 is still under a player's 4.7–6.0
— it cannot catch you, it can only punish you for standing next to it. The
correct play is a shorter melee window per cooldown cycle.

**Composition.** Entering an enrage step **clears every enemy zone and pauses
the cast timer for 2.5 s**. The roar is a breath, not an ambush; a phase
transition that lands on top of a live bomb is a death the player could not
have prevented by playing better. Same rule for the phase-2 transition (§6).

**Failure modes.** Unwinnability, and this is the one mechanic where that is a
real risk. Guards: enrage is a **step, applied once**, guarded by
`this.enraged` — never a stacking buff, never a timer, never a healing debuff.
There is no hard enrage anywhere in the game. An under-geared player watching a
health bar stall out and then dying has been given a readable answer ("come
back with the next two gear rungs"); a player killed by a counter they cannot
see has been given nothing.

---

## 5. The guard rails, in one place

These are global. They belong in `boss_raid`'s cast gate, not in eight
different mechanics.

1. **No burst mechanic resolves while the player is rooted, frozen, or slowed
   above 0.2.** The cast is postponed up to 1.5 s; if the condition persists,
   the mechanic fires with its radius cut by `(1 - slow)`. This is the rule
   that makes `frost` composable with everything else.
2. **One cast at a time, minimum 0.8 s between resolutions.** One timer.
3. **Radii and cast times never scale** with tier, power, phase or difficulty.
   Only damage, health and cadence do.
4. **No boss healing, no boss absorb, no hard enrage.** Any positive DPS wins
   eventually.
5. **At most 8 live enemies and 4 live enemy zones.** The excess is dropped,
   not queued.
6. **Every phase transition clears enemy zones and pauses the caster 2.5 s.**
7. **Everything dangerous is centred on the boss or on the player.**
8. **Nothing requires the jump button.** `explode` has no vertical check on the
   enemy path, so a jump is never an out; designing as if it were would produce
   a mechanic that is unavoidable in practice and looks avoidable on paper.
9. **Every delayed callback opens with `if (this.dead) return;`** and the
   boss's death clears pending enemy telegraphs, so a kill in the last half
   second of a cast does not detonate over the corpse.
10. **The boss's leash is on, but it never relocates mid-cast.** A boss that
    teleports out of its own telegraph is a bug the player will read as a lie.

### The composition matrix

Rows are pending, columns are live. **×** is forbidden outright; **↺** means
the second one waits or re-rolls.

|  | slam | breath | adds | charge | bombs | frost | shadow |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **slam** | — | ↺ | ok | × | ↺ | ok | ↺ |
| **breath** | ↺ | — | ok | ok | ↺ | ok | ↺ |
| **adds** | ok | ok | × | ok | ok | ok | × |
| **charge** | × | ok | ok | — | × | ok | ↺ |
| **bombs** | ↺ | ↺ | ok | × | ↺ | × | ↺ |
| **frost** | ok | ok | ok | ok | × | ↺ | × |
| **shadow** | ↺ | ↺ | × | ↺ | ↺ | × | — |

The three hard prohibitions are the ones worth memorising: **charge + slam**
(opposite escape vectors), **bombs + frost** (the slow makes the escape
arithmetically impossible), **shadow + adds** (rot plus a surround, with the
tightest escape requirement in the game).

---

## 6. The phase model

Health thresholds *and* a timer, because each alone fails a different way. A
pure timer means an over-geared player never sees phase 3 and an under-geared
one meets it while still learning phase 1. Pure thresholds mean a fight where
nothing changes for forty seconds if the player is cautious. So: **thresholds
choose the rules, the timer chooses the beats.**

| Phase | Enters at | Cadence | What changes |
| --- | --- | --- | --- |
| 1 | 100% | ×1.00 | Autos plus the boss's own `mechanic`, one repetition. |
| 2 | 70% | ×0.82 | The **raid's trial** joins the rotation, alternating with the signature mechanic. Repetitions go to 2 where the mechanic has them. |
| 3 | 35% | ×0.68 | `checkEnrage`: ×1.25 damage, ×1.28 speed. Repetitions go to 3. `enrageNova` enters the rotation at 25% weight. |

Both transitions announce with `roar` + `notify` + shake, clear enemy zones,
and pause the caster 2.5 s (§5.6). At a 9 s base cadence that is roughly 3
casts in phase 1, 3 in phase 2 and 3–4 in phase 3 across a 75 s kill.

**The raid trial** is one new field on the raid, not on the boss: a second
mechanic every boss in that raid picks up at 70%. It is the cheapest possible
way to make six fights per raid feel like one place — Molten Core's floor
burns, Icecrown's floor freezes — and it is one line of data per raid instead
of forty-two hand-authored second phases. It also guarantees every mechanic
sees play: a raid whose six bosses happen to use four mechanics still teaches
its trial six times.

Suggested trials, chosen to be the mechanic the raid's own bosses use least:
`zulgurub: 'bombs'`, `moltencore: 'frost'` (a lava raid whose trial is fire
teaches nothing new), `karazhan: 'shadow'`, `ulduar: 'slam'`, `blacktemple:
'frost'`, `firelands: 'bombs'`, `icecrown: 'frost'`.

Two phase rules that are not negotiable:

- **A boss never gains a mechanic it cannot telegraph at full length.** Phase 3
  shortens the *gap between* casts, never the cast itself.
- **A phase transition never adds damage and mechanics on the same beat.** The
  2.5 s pause is what makes the enrage a moment the player recognises rather
  than the frame in which their health bar emptied.

---

## 7. The data shape

Flat, small, and everything here is read by `boss_raid` or the fight setup.
Nothing is declared that nothing consumes; the smoke test enforces that and it
is the right rule.

Per-mechanic constants live on the existing `MECHANICS` map, because they are
the same for all forty-two bosses and repeating them per boss is how two
numbers that must agree end up disagreeing:

```js
export const MECHANICS = {
  slam: {
    name: 'Shockwave', blurb: 'Rings of force march outward. Keep moving.',
    tell: 'burst',      // 'burst' | 'linger' | 'aimed' — picks the colour and the shape
    cue: 'stomp',       // the second cue, after the universal 'cast'
    cast: 1.2,          // seconds of telegraph, never scaled by anything
    cd: 9,              // base seconds between casts, before the phase rate
    dmg: 2.6,           // multiplier on mob.damageAmount
    radius: 4.5,        // blocks; the primary circle. slam steps outward from it
  },
  // …the other seven, same six fields.
};
```

Per boss, three optional fields on top of what is already there:

```js
{
  id: 'geddon', name: 'Baron Geddon', mechanic: 'bombs', power: 1.46, color: '#ffd24a',
  cadence: 7,        // optional: seconds, overriding MECHANICS.bombs.cd
  reps: 2,           // optional: instances per cast in phase 1 (default 1)
  stance: 'ranged',  // 'melee' (aiMelee between casts) | 'ranged' (aiWarden's kite)
}
```

Per raid, one field:

```js
{
  id: 'moltencore', tier: 1, level: 11, /* … */
  trial: 'frost',    // the mechanic every boss here picks up at 70% health
}
```

And one function beside the others in `raids.js`, so health and damage are
derived rather than authored forty-two times:

```js
/**
 * A raid boss's stat block. Power scales health nearly in full and damage only
 * weakly: the player's mitigation does not improve within a raid, so the sixth
 * boss should be a longer fight rather than one that deletes them.
 */
export function raidScaling(tier, power) {
  const php = 115 * (1 + 0.144 * tier);       // tier-appropriate player health
  return {
    hp: Math.round(2600 * (1 + 0.45 * tier + 0.04 * tier * tier) * power),
    damage: php * 0.10 * (0.55 + 0.45 * power),
  };
}
```

That is the whole addition: six fields on a map that already exists, three
optional fields per boss, one per raid, one function. `stance` picks between
two AI branches that are both already written. Everything else — colour, cue,
cast length, cadence, radius, damage — is read straight out of `MECHANICS` by
one switch statement.

---

## 8. What this does not cover

- **The fight setup itself.** `game.startRaid(raid, boss)` — arena from
  `raid.theme`, one spawn, no wave director, no rank-ups, the potion timer from
  §3.4, and the wipe path that leaves `raidState.killed` untouched. Separate
  document, separate patch.
- **Health calibration.** 2600 is an estimate. It needs `--raid` in
  `tools/balance-sim.js` and a pass per tier before any of this is shipped as
  balanced rather than as playable.
- **The `frost` blurb.** It promises a root the design deliberately does not
  deliver. One line in `raids.js`.
- **The boundary ring.** Five lines in `Telegraph.draw` (§2.4), and every
  radius in this document assumes them.

Sources for the reaction-time and pacing figures in §2 and §6:
[Chaotic Stupid on enemy telegraphing](http://www.chaoticstupid.com/enemy-attacks-and-telegraphing/),
[GDKeys, Anatomy of an Attack](https://gdkeys.com/keys-to-combat-design-1-anatomy-of-an-attack/),
[Designing for Difficulty: Readability in ARPGs](https://www.gamedeveloper.com/game-platforms/designing-for-difficulty-readability-in-arpgs),
[Reaction Time and Game Design](https://www.retrogamedeconstructionzone.com/2020/05/reaction-time-and-game-design.html),
[Warcraft Wiki on enrage timers](https://warcraft.wiki.gg/wiki/Enrage_timer).
Every mechanic, name, number and cue in this document is original to this game.
