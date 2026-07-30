# Forty-two bosses

Design for every boss in `src/data/raids.js`. Nothing here is implemented yet;
this is the specification the fights should be built from.

One correction before anything else. The brief for this document said each boss
carries a `mech` list. It does not — `raids.js` gives each boss a single
`mechanic` string. That is the first thing that should change, and section 1.3
says why.

---

## 0. The rules this document is written under

Four constraints, and every fight below obeys all four. They are listed first
because most of the design decisions in this document are consequences of them
rather than inventions.

**The player is alone.** There is no tank, no healer, no second target for the
boss to look at, and no interrupt rotation. Four skills and a jump button.
Anything that in a group game would be solved by "someone else handles it" has
to be solved here by a person moving, or by a thing in the world the player can
shoot. Where a fight below wants an interrupt, it gets an *object* — a spine,
an arm, a channeler — because shooting a thing is a verb the player already has.

**Wipes are free, kills are not.** `raids.js` is explicit: a boss is consumed by
dying, not by being fought. That is a licence to make fights genuinely hard,
and it is also a hard prohibition on anything that cannot be beaten at the gear
that gates it. So: **there is no hard enrage timer anywhere in this game.** A
timer that wipes an under-geared player is the deadlock the file's own comment
forbids, wearing a hat. Every soft clock below caps out.

**It has to read on a phone, in first person.** A 400-pixel-wide viewport,
roughly 75° of FOV, a thumb on a virtual stick. Nothing behind the player is
information. Section 1.2 is the whole ruleset for this and it is the constraint
that killed the most first drafts.

**Nothing is bespoke.** Eight mechanics, forty-two fights. Each mechanic maps
onto something `game.js` already does — `telegraph`, `explode`, `spawnZone`,
`spawnMob`, `fireProjectile`, `delay`. A raid boss should be a parameterised
arena fight, not a second combat system. Where a fight below needs something
new, it is called out explicitly and it is small.

---

## 1. The eight mechanics, as engine parameters

### 1.1 What each one actually is

`MECHANICS` gives eight blurbs. Here is what each has to mean numerically for a
designer to build forty-two fights out of them without them blurring together.

| id | The verb | Engine | Base numbers |
| --- | --- | --- | --- |
| `slam` | *Time a gap.* | `telegraph` → `explode`, in a series | 3 rings at r = 5 / 8.5 / 12, 0.45 s apart, 0.75× boss damage, knockback 8 |
| `breath` | *Change your facing.* | `fireProjectile` fan, or a cone zone | 80° cone, 16 blocks, 1.2 s wind-up, 1.4 s active, sweeps 30° |
| `adds` | *Change your target.* | `spawnMob` | 2–4 per cast, ring r = 3 from the boss, 8–15 s cadence |
| `charge` | *Move sideways, not backwards.* | `telegraph` → committed velocity | 0.7 s tell, 1.1 s lunge at 4.2× its walk, 1.5× damage, knockback 10 |
| `bombs` | *Be somewhere else in two seconds.* | `telegraph` at a point → `explode` | r = 7 at the player's feet, 1.6 s lead, 1.4× damage |
| `frost` | *Movement denial.* | `spawnZone` with `slow`, plus `root` | 45% slow, 6 s zone; roots are 1.0 s and always breakable |
| `shadow` | *The arena gets smaller.* | `spawnZone`, long duration, no slow | r = 5, 0.55× damage per second, 8–12 s, no slow |
| `enrage` | *The back third is a different fight.* | `checkEnrage` + `enrageNova` | at 35% hp: +28% speed, +25% damage, nova on a 8 s timer |

Two of these deserve a note.

**`frost` is not an element.** It is the movement-denial mechanic, and its
colour is a per-raid skin. Every texture in this game is generated in
`atlas.js`, so recolouring costs nothing; there is no reason a raid built on a
lake of fire cannot have ground that grabs your feet. In Zul'Gurub it is
strangling vine, in Molten Core it is crust that has cooled just enough to be
brittle, in Firelands it is tar. Treating `frost` as "the ice raid's mechanic"
is why it appears twice in the current 42 and both times in Icecrown. Treated
as a verb, it earns eleven appearances across six raids.

**`enrage` is a phase, not a timer.** `checkEnrage` in `mobs.js` already does
the right thing — a threshold, a loud announcement, a real change in behaviour.
Nothing below turns it into a clock.

### 1.2 Readability: the phone rules

These are hard rules. A fight that breaks one is a bug, not a difficulty
setting.

**R1 — Rings are the primary language.** The default posture in a first-person
voxel brawler is looking slightly down, and `Telegraph` already draws a ground
ring out of blocks. Everything that can be a ring should be a ring. Cones,
projectiles and adds are the exceptions and each is more expensive to read.

**R2 — An unseeable telegraph cannot kill you on its own.** Concretely: any
telegraph whose centre is more than 60° off the player's facing *at the moment
it spawns* is capped at 35% of the player's maximum health. Anything lethal has
to spawn in front of the player or on their feet. This is the rule that decides
the shape of half the fights below.

**R3 — Five sounds, learned once, for all forty-two fights.** Cues are assigned
per *shape*, not per boss: ring-outward, ring-inward, cone, mark, root. Five
tones in `audio.js`, distinct in pitch and envelope, never reused for anything
else. Auditory reaction is roughly 40 ms faster than visual, and it is the only
channel that works when the thing is behind you. This is the single
highest-value change this document asks for.

**R4 — Off-screen needs a threat arc.** Propose a small HUD addition: a 20°-wide
arc at the edge of the screen, in the telegraph's own colour, at the compass
bearing of any live telegraph whose centre is off-screen, fading on the
telegraph's own timer. A few quads in `hud.js`. Every mechanic below that comes
from behind — a converging ring, a rear charge, a mark dropped while you were
looking the other way — assumes the arc exists. **If the arc is not built, those
mechanics must be re-centred on the boss or on the player's feet.** Named
individually where they occur.

**R5 — Three telegraphs, eighteen mobs, ceiling.** Above that a 400-pixel
viewport is soup and a phone GPU is unhappy. This is why the add caps in the
ladder below stop at 18 even at tier 6, and why "four things at once" never
appears in this document as an escalation.

**R6 — Telegraph colour is measured against the raid's fog.** Each raid's
`theme.fog` is known at build time; telegraph colours must clear it by a fixed
margin in luminance. Exactly one fight is allowed to erode this deliberately
(Yogg-Saron), and it pays for it with R3.

**R7 — Terrain changes only at phase boundaries.** `world.set()` exists but
every change needs `buildMesh()`, which remeshes 64×28×64. That will hitch a
phone. So "the floor is gone" is normally a long-lived `Zone`, which costs
nothing; a real remesh happens at most twice in a fight and only on a phase
transition, where the notify banner and screen shake cover the frame.

### 1.3 The data change

Replace the single `mechanic` string with an ordered list:

```js
{ id: 'jindo', name: "Jin'do the Hexxer", mech: ['frost', 'shadow'], power: 1.30, ... }
```

The list is **in phase order**: element 0 is what the fight opens with and what
the UI shows on the boss card, later elements are what it adds. This is not
cosmetic. The current one-mechanic-per-boss shape makes the difference between
tier 0 and tier 6 into a number, because a single mechanic can only escalate by
hitting harder. The whole argument of section 3 is that it should escalate by
*combining*, and the data has to be able to say so.

Keep a derived `mechanic` getter returning `mech[0]` so nothing downstream
breaks while the fights are built.

### 1.4 What `power` is allowed to do

`power` multiplies health and damage. Nothing else. It must never shorten a
telegraph, tighten a cadence, or raise an add count — if it did, readability
would become a function of a number that was tuned for durability, and no one
would notice until the sixth boss of a raid was unreadable rather than hard.
Lead times, cadences and add counts are set per raid in the ladder below and per
boss in the write-ups.

Target kill times, at the gear that gates the raid: **60 s for the first boss of
Zul'Gurub, rising to 240 s for the Lich King.** Long enough to show every phase
at least twice, short enough that a wipe at 5% costs minutes rather than a
sitting. Four minutes is a deliberate ceiling on the last fight in the game.

---

## 2. The tier ladder

Every number that escalates across the seven raids, in one place. Individual
bosses move within their raid's row; nothing moves outside it.

| Raid | T | Min lead, player-centred | Min lead, boss-centred | Live telegraphs | Phases | Add cap | Enrage at | Target kill |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Zul'Gurub | 0 | 1.60 s | 0.70 s | 1 | 2 | 6 | 35% | 60–110 s |
| Molten Core | 1 | 1.50 s | 0.65 s | 1 | 2 | 8 | 35% | 70–130 s |
| Karazhan | 2 | 1.40 s | 0.60 s | 2 | 3 | 10 | 35% | 85–150 s |
| Ulduar | 3 | 1.35 s | 0.55 s | 2 | 3 | 12 | 35% | 95–170 s |
| Black Temple | 4 | 1.25 s | 0.50 s | 2–3 | 3–4 | 14 | 40% | 110–195 s |
| Firelands | 5 | 1.20 s | 0.50 s | 3 | 4 | 16 | 40% | 125–215 s |
| Icecrown | 6 | 1.15 s | 0.45 s | 3 | 4–5 | 18 | 45% | 150–240 s |

Note how little the lead times move: 1.60 s to 1.15 s across seven tiers, and
never below 1.10 s for anything centred on the player. That is on purpose.
Reaction time on a phone with a thumbstick is roughly 250 ms to see it plus the
time to physically walk out of the radius, and shaving that is the cheapest and
worst way to make a fight harder — it does not make the player better at
anything, it just makes the fight a coin flip on whether they were already
looking the right way. Everything real happens in the other columns.

Boss-centred telegraphs are allowed to be roughly a third as long, because the
player already knows where the boss is; they are looking at it.

---

## 3. Why tier 6 is a different kind of hard

Six things escalate. Only one of them is a number on a health bar.

**1. Reaction becomes memory.** Tiers 0–2 are reaction fights: something appears,
you move. Ulduar's bosses are machines and their attacks run on fixed,
countable cycles instead of random timers — the same information, delivered
early enough that a player who has learned the cycle is acting before the
telegraph rather than after it. From tier 3 up, a player who is still purely
reacting is playing every fight one beat late, and at tier 6 one beat late is
the whole margin.

**2. Avoidance becomes obligation.** Every tier-0 mechanic is answered by
*leaving*. Icecrown's are answered by *being somewhere*, on a clock, while also
leaving somewhere else. Avoidance is passive and can be done while doing
something else. An obligation occupies the same attention that aiming does, and
that is the actual endgame: two jobs, four buttons.

**3. One thing becomes three.** The live-telegraph column goes 1 → 3. Each
individual mechanic stays exactly as readable as it was in Zul'Gurub — the
difficulty is the interleave, not the components. This is also why the ceiling
is three: at four, R5 says the screen stops being information.

**4. Movement stops being free.** Six raids teach the player that the answer to
everything is to walk away from it. `frost` is the mechanic that charges rent on
that, and it is deliberately the last thing the game does: Sindragosa is a fight
about negotiating with your own mobility, and it lands after six raids have made
mobility reflexive.

**5. Mistakes stop being chip damage.** At tier 0, eating a shockwave costs a
sliver and a lesson. At tier 6, one avoidable hit is roughly a third of the bar
and the next mechanic is already live. Not because the numbers are bigger in
isolation — the boss/player damage ratio only drifts about 20% across the whole
climb — but because at tier 6 you are never more than four seconds from the next
thing, so there is no window in which to recover from having been careless.

**6. The fight starts asking what is in your loadout.** Four of ten skills.
Tiers 0–2 do not care which four. Razorscale is unpleasant without a ranged
option. Teron Gorefiend is unpleasant without a cheap one. The Lich King is
unpleasant without a movement one. None of them is impossible with the wrong
four — that would violate the no-deadlock rule — but from tier 3 the loadout
screen stops being a preference and starts being preparation, which is a kind of
difficulty that lives entirely outside the fight.

What tier 6 is emphatically **not**: faster telegraphs, more simultaneous
telegraphs than three, unavoidable damage, or a timer. All four of those are
easy to write and all four are how a game like this becomes something people
watch a video about instead of playing.

---

## 4. Mechanic distribution

Two counts. The first is the primary mechanic — `mech[0]`, the one the boss card
shows, of which there are exactly 42. The second is total appearances across all
phases, which is the number that says whether a mechanic is actually carrying
weight.

### Primaries, by raid

| | slam | breath | adds | charge | bombs | frost | shadow | enrage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Zul'Gurub | 1 | – | 1 | 1 | – | 1 | 1 | 1 |
| Molten Core | – | 1 | 1 | – | 2 | – | 1 | 1 |
| Karazhan | 1 | – | 2 | 1 | 1 | 1 | – | – |
| Ulduar | 2 | 1 | – | 1 | 1 | – | 1 | – |
| Black Temple | – | 1 | 1 | 1 | 1 | – | 1 | 1 |
| Firelands | 1 | 1 | 1 | 1 | 1 | – | – | 1 |
| Icecrown | – | – | 1 | – | 1 | 2 | 1 | 1 |
| **Total** | **5** | **4** | **7** | **5** | **7** | **4** | **5** | **5** |

Even share would be 5.25. The spread is 4 to 7, and the two sevens have reasons:

- **`adds` = 7** is one add fight per raid, which is right — it is the only
  mechanic that changes what is *in* the arena rather than what is on the floor,
  and a raid without one is six fights against a single silhouette. The extra
  goes to Karazhan, whose whole thesis is crowd handling.
- **`bombs` = 7** is also one per raid except Zul'Gurub, which has none, and
  Molten Core, which has two. Zul'Gurub omits it deliberately: `bombs` is the
  mechanic that asks the player to plan a move ahead rather than react, and the
  teaching raid should leave tier 1 something to introduce. Molten Core's pair
  are opposite verbs and section 6 argues it.
- **`breath` = 4** and **`frost` = 4** are the low end. Both are cheap as
  primaries and expensive as secondaries — a cone demands the player's facing,
  a root demands their feet — so they carry their weight in the second table.

### Total appearances, all phases

| | slam | breath | adds | charge | bombs | frost | shadow | enrage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Zul'Gurub | 1 | – | 3 | 1 | – | 1 | 3 | 1 |
| Molten Core | 1 | 2 | 2 | 1 | 3 | 1 | 2 | 1 |
| Karazhan | 2 | – | 3 | 2 | 2 | 1 | 1 | – |
| Ulduar | 3 | 2 | 3 | 1 | 1 | 2 | 2 | 1 |
| Black Temple | 1 | 3 | 4 | 2 | 3 | 1 | 3 | 2 |
| Firelands | 2 | 2 | 3 | 2 | 3 | 2 | 2 | 2 |
| Icecrown | 2 | 2 | 4 | 1 | 3 | 3 | 3 | 2 |
| **Total** | **12** | **11** | **22** | **10** | **15** | **11** | **16** | **9** |

`adds` at 22 is the outlier and it is correct: adds are the only mechanic that
combines cleanly with all seven others without competing for the same channel.
A cone and a ring both want the player's feet; a crawler wants their crosshair.
It is the connective tissue of the whole set, and it is also the one with a hard
cap (R5), so it cannot run away.

`enrage` at 9 is the lowest and it should be. It is a phase, not a move — a boss
having one is a statement about its whole back third, and if every fight had one
the announcement would stop meaning anything.

Every mechanic appears in every raid at least once except `enrage` (absent from
Karazhan) and `breath` (absent from Zul'Gurub and Karazhan). Both are on purpose
and both are argued in place.

---

## 5. Zul'Gurub — tier 0, level 1

*A drowned troll city, thick with poison and old blood.*

**The raid's job: teach the language.** Six bosses, one new idea each, one at a
time, never overlapped. Every mechanic gets a full fight to itself before it is
ever combined with anything, because the player is level 1 and has two skills.

**Boss 1 teaches that the floor is information. Boss 6 tests reading the floor
while something is on top of you.**

Lead time is the game's longest at 1.60 s, and phase transitions are the game's
loudest.

---

### 1. High Priest Venoxis — `shadow` · power 1.00 · Core: Weapon

**Identity.** The first fight in the game where you lose by standing still, and
nothing else is going on.

**Signature.** The last clean tile — the moment near the end when four pools
have overlapped and the arena has become a shape you have to trace.

**Mechanics.** `['shadow']`.
- **P1, 100–50%.** Two pools every 7 s. r = 5, 1.60 s lead, 8 s duration,
  0.55× damage per second, no slow. Cast at the player's feet plus one offset
  4 blocks toward the boss, so backing straight up never works and the fix is
  visible in one glance.
- **P2, below 50%.** Duration rises 8 s → 12 s. Nothing else changes. The
  arena shrinking faster is the entire second phase, and it is enough: the
  player *feels* the fight change without having to learn a second thing at 50%
  health with two skills.

No `charge`, no melee wind-up beyond the standard `aiMelee`. The boss walks.

**Curve.** Floor of the raid, and the floor of the game. Everything that comes
after this assumes the player will look down.

---

### 2. Bloodlord Mandokir — `charge` · power 1.10 · Core: Chest

**Identity.** The first fight that punishes backpedalling, because the boss is
faster than you in a straight line and slower than you in a turn.

**Signature.** The first time you sidestep instead of retreating and it works —
Zul'Gurub's actual lesson, delivered in about four seconds.

**Mechanics.** `['charge', 'adds']`.
- **P1, 100–40%.** Charge every 11 s. 0.70 s boss-centred tell — a ring under
  its own feet plus a lane quad extending 20 blocks in its facing, so the
  direction is visible, not just the fact. 1.1 s lunge, 1.5× damage, knockback
  10. If it hits a wall it stumbles for 1.4 s and takes 40% extra: the reward
  for a clean dodge is a damage window, not just survival.
- **P2, below 40%.** Charge cadence 11 s → 7 s, and **one** fast add spawns on
  the first charge of the phase and never again.

**Change proposed.** Adding `adds` here, one time, one add. Justification: it is
a preview, not a phase. The next boss is the add fight, and arriving at it
having already had exactly one thing chase you while a boss did is worth more
than the add is dangerous. Flagged in the mech list as a preview because a
designer reading `['charge', 'adds']` should not build a second add fight.

**Curve.** Boss 1 was about the ground. Boss 2 is about the boss's body — the
tell is on the model, not on the floor, and that is the second of the two places
information ever comes from.

---

### 3. High Priestess Arlokk — `adds` · power 1.20 · Core: Helm

**Identity.** The first fight where hitting the boss is the wrong move.

**Signature.** Twenty seconds of dealing no damage before you notice the ring
around her, turn around, and understand.

**Mechanics.** `['adds']`.
- **Priority rule.** While any add is alive the boss takes **80% less damage**
  and a visible shield ring sits at her feet. Not 100%: a solo player who is
  fractionally behind on adds should be losing ground slowly, not stopped dead.
  The ring is a ground ring for R1 reasons — the health bar is at the top of the
  screen and a first-person player is not looking at it.
- **P1, 100–50%.** 2 adds (`husk`) every 16 s.
- **P2, below 50%.** 4 adds every 14 s, mixed `husk` and `crawler` so one of
  them is fast. Cap 6 (raid ladder).

**Curve.** Boss 1: read the floor. Boss 2: read the boss. Boss 3: read the
*rest of the arena*. Three fights, three places to look, and that is the
complete set for the whole game.

---

### 4. Jin'do the Hexxer — `frost` → `shadow` · power 1.30 · Core: Boots

**Identity.** The first fight where "walk out of it" stops being an answer, so
you have to be somewhere before it happens instead.

**Signature.** Getting rooted a half-second before a pool lands on the exact
square you are rooted in, and never letting it happen again.

**Mechanics.** `['frost', 'shadow']`.
- **P1, 100–60%.** Hex-vine every 9 s: a 4-block ring at the player's feet,
  1.60 s lead, roots for **1.0 s**. No damage on its own — this phase exists
  purely to teach that being held is a thing. The root is broken by any dash,
  blink or charge skill, and it can always be pre-empted by moving.
- **P2, below 60%.** Rot pools (r = 5, 10 s, 0.55× dps) start landing 1.2 s
  *after* a vine, on a point 3 blocks from where the vine was. So a rooted
  player is not trapped — they are given a direction and a second to use it.
  This is the only shape in Zul'Gurub with two live telegraphs, and it lasts
  1.2 s, which is why it does not break the tier-0 "one at a time" rule.

**Change proposed.** `raids.js` gives Jin'do `shadow`, making him the raid's
second shadow boss after Venoxis. That means boss 4 of the teaching raid teaches
nothing — it is Venoxis with a bigger health bar, which is the exact failure
mode this document exists to avoid. `frost` also currently appears twice in all
of `raids.js`, both times in Icecrown. Promoting it here fixes both problems
with one edit, and a hexer whose signature is a hex reads better than a hexer
whose signature is a puddle. `shadow` stays as the phase-2 layer, so nothing is
lost.

**Curve.** Bosses 1–3 could all be solved by walking. Boss 4 is where walking
becomes a resource, and it is placed at the boss that drops the **Boots**,
which is a coincidence worth keeping.

---

### 5. Gahz'ranka — `slam` · power 1.42 · Core: Signet

**Identity.** The first fight solved by standing still on purpose, in the right
place.

**Signature.** Holding a spot two blocks wide while three rings of force pass
through you on both sides.

**Mechanics.** `['slam']`.
- **P1, 100–45%.** Rings every 10 s: three, boss-centred, r = 5 / 8.5 / 12,
  0.45 s apart, 0.70 s tell each, 0.75× damage, knockback 8. The gaps between
  rings are 3.5 blocks — wide enough to stand in without pixel-precision, narrow
  enough that arriving there by accident is unlikely.
- **P2, below 45%.** Alternates: every second cast is **inward**, spawning at
  r = 12 and converging to r = 5.
  - *Readability:* a converging ring approaches from behind. This phase
    **requires R4's threat arc** and R3's distinct ring-inward tone. Without
    both, cut phase 2 to "outward rings, cadence 10 s → 6 s". Called out
    because it is the first time in the game that anything comes from behind
    and it is the wrong fight to get wrong.

**Curve.** Every previous boss taught *move*. This one teaches *stop*, and it
teaches it at tier 0 so that the game can spend the next six raids alternating
between the two.

---

### 6. Hakkar the Soulflayer — `enrage` · power 1.60 · Core: Trinket

**Identity.** Everything Zul'Gurub taught, at the same time, with a countdown
made of the boss's own health bar.

**Signature.** Standing in the one dry corner of an arena that is two-thirds
poison, with three husks between you and it, while the boss announces that it is
about to get worse.

**Mechanics.** `['shadow', 'adds', 'enrage']`.
- **P1, 100–60%.** Venoxis's pools. Two every 8 s, r = 5, 10 s.
- **P2, 60–35%.** Arlokk's adds on top — 3 every 15 s, cap 6 — and the pools
  continue. This is Zul'Gurub's only genuine two-mechanic phase and the raid
  has spent five fights earning it.
- **P3, below 35%.** `checkEnrage`: +28% speed, +25% damage, `enrageNova`
  every 8 s. **Pools stop.** Deliberate. Three concurrent mechanics is the
  tier-4 standard; a tier-0 capstone that hits it would be teaching the player
  that they are behind rather than that they have arrived. What the enrage adds
  is pressure, not another thing to read.

**Curve — what boss 1 taught, boss 6 tests.** Venoxis taught that the floor is
information and gave the player nothing else to do. Hakkar asks the same
question with a husk on their heels and a boss that has just got 28% faster.
The information is identical; the attention available to process it is a third
of what it was.

---

## 6. Molten Core — tier 1, level 11

*Grey stone over a lake of fire, and something older beneath it.*

`theme.lava` is true, which means part of the arena is already lethal before any
boss does anything. That is the raid's identity and every fight uses it: **in
Molten Core, being pushed is as dangerous as being hit.** Knockback, charges and
mode-flips all cost more here than they do anywhere else, and they cost more for
free.

**Boss 1 teaches you to check what is behind you before you back up. Boss 6
tests it when there is nothing behind you.**

---

### 1. Lucifron — `shadow` · power 1.00 · Core: Weapon

**Identity.** Venoxis, except the pools are placed to herd you, and the thing
they herd you into is not the boss.

**Signature.** Backing cleanly out of a pool, at full health, into the lake.

**Mechanics.** `['shadow']`.
- **P1, 100–50%.** Two pools every 8 s, r = 5, 10 s, 1.50 s lead. Placement is
  the whole design: one at the player's feet, one on the vector from the nearest
  solid ground *away* from the lake. So the free direction is always toward the
  edge and the player has to notice.
- **P2, below 50%.** A third pool, placed on the player's current facing —
  punishing the specific habit of dodging forward without looking.

**Curve.** Tier 1's opener re-teaches tier 0's opener with one new variable, and
the new variable is the arena. That is the correct amount of new for a first
boss.

---

### 2. Magmadar — `breath` · power 1.12 · Core: Chest

**Identity.** The game's first cone, and therefore the first fight about your
facing rather than your position.

**Signature.** The strip of burning stone your last dodge left behind, and
realising the next dodge has to go somewhere else.

**Mechanics.** `['breath', 'shadow']`.
- **P1, 100–50%.** Cone every 9 s. 1.2 s wind-up — head rears, `emissive` ramps
  from 0.12 to 0.9 over the wind-up, which is a change on the boss's silhouette
  and therefore readable at any distance. 80°, 16 blocks, 1.4 s active, sweeps
  30° across its duration so the edge of the cone is not a safe place to stand
  still. Answer: get to its flank, which is 3 metres of movement, not 15.
- **P2, below 50%.** The cone leaves a 5-block-wide burning strip along its
  path for 6 s (`spawnZone`, 0.5× dps). The arena carves itself up as a
  consequence of your own dodges.

**Curve.** Boss 1 was position. Boss 2 is facing. Both are things a first-person
camera makes physical rather than abstract, which is the argument for putting
the cone here rather than at tier 0 — at level 1 the player is still learning
that turning is a thing they do with a thumb.

---

### 3. Gehennas — `adds` · power 1.22 · Core: Helm

**Identity.** An add fight where *where* you kill them is the mechanic.

**Signature.** Watching the boss's health bar tick back up, and knowing exactly
why without being told.

**Mechanics.** `['adds', 'shadow']`.
- **Rule.** An add that dies within **6 blocks** of the boss heals it 4% of
  maximum. A 6-block ring is drawn permanently at the boss's feet in a dull
  version of the raid accent, so the rule is visible at all times rather than
  learned by punishment. Solo answer: back up before finishing them, which
  conflicts directly with wanting to hit the boss, which is the fight.
- **P1, 100–55%.** 3 adds every 14 s, spawned *at the boss*, so they start
  inside the ring and you have to buy time.
- **P2, below 55%.** Adds leave a 4-block rot pool for 8 s where they die,
  so the "kill them far away" answer slowly fills the far away with rot.

**Curve.** Zul'Gurub's add fight was "switch targets". This one is "switch
targets and go somewhere". First positive obligation in the game, and it is a
soft one — being wrong costs 4% of a bar, not a life.

---

### 4. Garr — `bombs` · power 1.34 · Core: Boots

**Identity.** A boss made of bombs you choose when to set off.

**Signature.** Deliberately killing an add standing right next to you, because
you know to the tenth of a second when the fuse ends.

**Mechanics.** `['bombs', 'adds']`.
- **Setup.** Six stationary adds ring the boss at r = 8. They do not chase and
  they do not attack; they have roughly 2 s of health each. **Each detonates on
  death**: 1.0 s fused telegraph, then r = 5, 1.4× damage.
- **Rule.** The boss takes **+15% damage per dead add**, and adds respawn 30 s
  after dying. So the fight is a rhythm of deliberate, self-scheduled
  explosions, and the optimal line is to blow up as many as possible while
  standing somewhere survivable.
- **P2, below 45%.** Respawn drops 30 s → 18 s and two adds now *walk*.

**Change proposed.** Adding `adds`. `raids.js` gives Garr `bombs` alone, but a
boss whose entire silhouette is "surrounded by lesser copies of itself" is an
add fight wearing a bomb's clothes, and saying so in the data means the boss
after Gehennas re-uses Gehennas's lesson with a new consequence instead of
starting over. `bombs` stays primary because the verb the player performs is
"be somewhere else when it goes off".

**Curve.** Every bomb in the game so far would have been placed *at* the player.
Garr's are placed by the player. That is the same mechanic inverted, and
inverting a mechanic is the cheapest genuine escalation there is.

---

### 5. Baron Geddon — `bombs` · power 1.46 · Core: Signet

**Identity.** You are the bomb. Garr was about avoiding a thing; this is about
carrying one somewhere.

**Signature.** Sprinting for the far wall with a countdown ring around your own
feet and no time to look at the boss.

**Mechanics.** `['bombs', 'frost']`.
- **P1, 100–50%.** Every 22 s the player is marked: a ring around their own
  feet, following them, with a **5.0 s** fuse — the longest lead in the game,
  because this one is not a dodge, it is a journey. At detonation: r = 9,
  1.6× damage, and it leaves a **permanent** fire zone at r = 6 for the rest of
  the fight.
- **The mechanic.** The zone is permanent. There is nobody else to protect, so
  the thing being protected is the arena. Carry the mark to the edge and the
  arena stays usable; stand still and you spend the last 40% of the fight
  fighting in a corridor.
- **P2, below 50%.** Cadence 22 s → 15 s, and cooled crust (`frost`, 45% slow,
  6 s) spawns at the player's feet 2 s after each detonation, so the return trip
  is slower than the outbound one.

**Change proposed.** `frost` added as a secondary. Molten Core would otherwise
have no movement-denial anywhere in six fights, and this is the one place in the
raid where slowing the player is *interesting* rather than just annoying — the
whole fight is already a movement problem.

**On two `bombs` in a row.** Kept, and it is the best adjacency in the game.
Garr's bombs are objects in the world you approach on your own schedule.
Geddon's bomb is you, on his. They share an engine call and share nothing else;
the verb in one is "detonate", in the other it is "deliver". Putting them
back-to-back is what makes the difference legible — a player who fought Geddon
six bosses later would read it as "more bombs".

**Curve.** First fight in the game whose *failure state is cumulative*. You
cannot lose Geddon in one mistake; you lose him by making six and running out of
floor.

---

### 6. Ragnaros — `enrage` · power 1.70 · Core: Trinket

**Identity.** The lake comes up. Everything Molten Core taught about the floor,
applied to a floor that is leaving.

**Signature.** The phase-2 transition, where a third of the arena stops being
arena and you have to re-plan every route you had learned.

**Mechanics.** `['breath', 'bombs', 'frost', 'enrage']`.
- **P1, 100–65%.** Magmadar's cone, every 8 s, 90° and 18 blocks. Plus melee.
- **P2, 65–35%.** **The one real terrain change in the raid.** A single
  `world.set` + `buildMesh()` at the transition, under the notify banner and a
  0.6 screen shake (R7). The outer 8 blocks of floor become lava. Cone
  continues; Geddon-style marks begin, 18 s cadence, but with a 3.0 s fuse and
  no permanent zone — the arena is doing that job now. Brittle crust (`frost`)
  spawns at the new lava's edge, so the newly-dangerous boundary is also the
  slow one.
- **P3, below 35%.** Enrage. +28% speed, +25% damage, `enrageNova` every 7 s.
  Marks stop; the cone stays. Same discipline as Hakkar: the enrage adds
  pressure, not a fourth thing.

**Curve — what boss 1 taught, boss 6 tests.** Lucifron taught that the edge of
the arena will kill you and that a pool can herd you toward it. Ragnaros moves
the edge inward by eight blocks halfway through and asks the same question about
an arena the player no longer has a map of.

---

## 7. Karazhan — tier 2, level 21

*A haunted tower where the rooms do not stay where you left them.*

**The raid's job: two things at once.** Karazhan is where the live-telegraph
count goes from 1 to 2 and stays there, and where three-phase fights start. Its
secondary thesis is crowd handling, which is why it is the one raid with two add
bosses.

Karazhan is also the only raid with **no `enrage` boss**, and that is on purpose:
it is the raid about managing simultaneity, and an enrage phase is a fight
getting simpler and louder. Malchezaar's third phase does the escalation job by
layering instead.

**Boss 1 teaches that the boss's attacks damage the floor, so the fight gets
harder even if you never get hit. Boss 6 tests planning three moves ahead of a
floor that is degrading on a schedule.**

---

### 1. Attumen the Huntsman — `charge` · power 1.00 · Core: Weapon

**Identity.** Mandokir's charge, except the lane it runs stays lit and stays
lethal.

**Signature.** Forty seconds in, realising the arena has a grain to it — a set
of scorched lanes — and that you have been choosing where they go this whole
time.

**Mechanics.** `['charge', 'shadow']`.
- **P1, 100–50%.** Charge every 12 s, 0.60 s tell (tier-2 boss-centred
  minimum), lane quad drawn full length before the lunge. The lane it runs
  burns for **6 s** afterwards, 3 blocks wide, 0.5× dps.
- **P2, below 50%.** Cadence 12 s → 7 s, and lanes burn for 12 s. Two lanes are
  usually alight at once, which is Karazhan's two-telegraph rule arriving in the
  gentlest possible form: one of the two is a thing that already happened.

**Curve.** The tier-2 opener and the raid's thesis statement. Everything in
Karazhan is about a second thing being live.

---

### 2. Moroes — `adds` · power 1.12 · Core: Chest

**Identity.** Four adds, all different, all wrong to kill in the wrong order.

**Signature.** Getting the order wrong once, dying to a bomber you left for
last, and getting it right forever after.

**Mechanics.** `['adds', 'shadow']`.
- **Setup.** Four adds at once, always one of each: a `skele` (ranged, chips
  you from across the arena), a `bomber` (kills you if ignored), a `crawler`
  (fast, denies your escape), a `brute` (slow, huge, safe to ignore for a
  while). There is exactly one correct order and it is discoverable from what
  each one does, not from a guide.
- **Rule.** The boss takes 60% less damage while two or more adds live — not
  80% like Arlokk, and not 100%, because at tier 2 the player should be able to
  make progress while behind rather than being stopped.
- **P1, 100–60%.** Four adds, refreshed 20 s after the last one dies.
- **P2, 60–35%.** Refresh drops to 15 s.
- **P3, below 35%.** Adds stop. Straight duel with 8-block rot pools every 7 s
  — a genuine reward, and a reason to push.

**Curve.** Arlokk taught *that* you switch targets. Moroes teaches *which*, and
gives four answers where only one order works.

---

### 3. Maiden of Virtue — `slam` · power 1.24 · Core: Helm

**Identity.** The fight where the safe place is next to the boss.

**Signature.** Sprinting *toward* the thing that is killing you, on purpose, and
being right.

**Mechanics.** `['slam', 'bombs']`.
- **P1, 100–55%.** Gahz'ranka's outward rings every 9 s, plus — and this is the
  fight — an **inner void** every 14 s: everything outside r = 4 is hit, and the
  safe space is a disc centred on the boss. Telegraphed as a *filled* ground
  disc rather than a ring, which is a distinct enough shape at 400 pixels to
  read as "inside is safe" rather than "inside is bad".
  - *Readability note:* this is the fight that most needs the filled-vs-ring
    distinction to be unambiguous. If the renderer cannot do a filled disc
    cheaply, the fallback is a **double** ring at r = 4 in the raid accent
    colour — two concentric ring rows read as a boundary, one reads as a
    hazard, and the R3 cue differs anyway.
- **P2, 55–30%.** The two alternate on a 7 s beat, so the answer flips between
  "get out" and "get in" continuously. Two live telegraphs, opposite answers,
  which is exactly what tier 2 is for.
- **P3, below 30%.** Marks (`bombs`, r = 6, 1.40 s) land at the player's feet
  during the inner void, so the safe disc is not a place you can simply park in.

**Curve.** Boss 1 and 2 asked the player to do two things. Boss 3 asks them to
do two *contradictory* things, which is the hardest version of the same idea and
the one Karazhan is named after.

---

### 4. The Big Bad Wolf — `frost` → `charge` · power 1.36 · Core: Boots

**Identity.** A chase where the running is the damage phase.

**Signature.** Running backwards in a circle, shooting over your shoulder,
picking a route through a floor that is freezing behind you.

**Mechanics.** `['frost', 'charge']`.
- **The fixate.** Every 30 s it locks onto the player for **12 s**. During the
  fixate it does not attack and cannot be knocked back; it moves at **1.35×**
  the player's sprint speed, and it takes **3× damage**. So the scariest part of
  the fight is the damage window, which is the single best trade this document
  proposes: a player who runs away from the fixate loses on time, and a player
  who runs *and shoots* wins.
- **The floor.** During the fixate, an ice patch spawns at the player's position
  every 2 s: r = 3, 45% slow, 8 s. So the route the player has already run is
  closed behind them and a circle only works once. The whole fight is
  route-finding at speed, and 12 s is long enough to run out of clean arena on
  the second lap.
- **Between fixates.** Ordinary melee with a charge every 9 s, so the 18 s
  off-fixate is not dead time.
- **P3, below 30%.** Fixate every 20 s, patches every 1.5 s.

**Change proposed.** `raids.js` gives this boss `charge`, making Karazhan's
first and fourth boss both charge fights — and Attumen has the better claim,
since a lane is a charge and a fixate is not really one. `frost` becomes
primary. Two arguments: it makes the raid five distinct primaries instead of
four, and it is honest about the fight, where the charge is the frame and the
freezing floor is the actual problem the player solves. `charge` stays in the
list because the boss does charge and because the fixate reads as one.

**Curve.** Karazhan's mid-raid pivot. Bosses 1–3 asked the player to hold still
correctly. Boss 4 takes standing still off the table for twelve seconds at a
time and makes them solve the same problem while sprinting.

---

### 5. The Curator — `adds` · power 1.48 · Core: Signet

**Identity.** A patience fight. You cannot hurt it most of the time, so the
question is what you have saved for the moment you can.

**Signature.** Sitting on four full cooldowns for thirty seconds, taking chip
damage, waiting.

**Mechanics.** `['adds', 'slam']`.
- **Armoured, 40 s.** Takes 75% less damage. Summons one weak add every 6 s
  (cap 10) and fires slow ring pulses every 8 s. Attrition, not threat: the
  player's job is to stay clean and stay alive, not to make progress.
- **Overload, 12 s.** Announced 2 s early. Takes **200%** damage, stops
  summoning, stops the rings, and stands still. Every add on the field takes
  50% damage per second for the duration, so the arena also cleans itself.
- **P2, below 40%.** Overload drops to 8 s and arrives every 30 s. Slightly
  more total uptime, considerably tighter execution.

**On two `adds` bosses in one raid.** Kept, and this is the pair that justifies
it. Moroes is priority: four different things, one right order, all of it
decided in the first three seconds. The Curator is patience: identical things,
no order, and the decision is about *time* rather than targets. They share a
mechanic id and teach opposite habits, which is more useful adjacency than two
mechanics that teach the same habit.

**Curve.** Every fight before this rewards acting. This one rewards not acting,
which is the hardest thing to teach an action game's player and the reason it is
boss 5 rather than boss 2.

---

### 6. Prince Malchezaar — `bombs` · power 1.72 · Core: Trinket

**Identity.** A floor that degrades on a published schedule, so the fight is
won by planning rather than reacting.

**Signature.** Standing on a square you chose eight seconds ago, watching four
detonations land around you, and not moving.

**Mechanics.** `['bombs', 'adds', 'slam']`.
- **P1, 100–65%.** Marks fall in a **walking pattern**: four per volley, landing
  in a line that advances 5 blocks per volley across the arena, every 6 s,
  1.40 s lead each. It is a wave, not a scatter, and a wave can be stood in
  front of or behind.
- **P2, 65–30%.** Two elite adds (`reaper`, blinking) join permanently. They
  respawn 25 s after death. The pattern continues. Two live telegraphs plus two
  things that teleport is Karazhan's ceiling and it is right at boss 6.
- **P3, below 30%.** Outward rings (`slam`) every 8 s on top, and the bomb
  pattern reverses direction each volley instead of advancing. The reversal is
  the phase-3 idea: a pattern the player has spent two minutes learning to
  outrun now comes back at them.

**Curve — what boss 1 taught, boss 6 tests.** Attumen taught that the floor
degrades as a consequence of the fight and that the player has partial control
over where. Malchezaar removes the control, keeps the schedule, and asks the
player to be three moves ahead of it. Same lesson, no help.

---

## 8. Ulduar — tier 3, level 31

*Titan machinery, still running, still guarding what it was told to.*

**The raid's job: turn reaction into memory.** Every Ulduar boss runs a **fixed
cycle**. Not "roughly every 9 seconds" — exactly every 8, every time, from the
first second of the fight. That is the hinge of the whole seven-raid climb: a
player who learns a cycle acts *before* the telegraph instead of after it, and
from tier 3 upward the fights assume they do.

This costs nothing to implement (a counter instead of `rand`) and it changes the
kind of skill the game is asking for, which is the thing tier 3 has to do that
tier 2 did not.

**Boss 1 teaches you to count. Boss 6 tests counting when you cannot see.**

---

### 1. Flame Leviathan — `charge` · power 1.00 · Core: Weapon

**Identity.** A boss that only ever does one thing, on a metronome, and never
melees you at all.

**Signature.** Dodging it without looking at it, because you counted.

**Mechanics.** `['charge']`.
- **The whole fight.** A charge across the full arena, every **8.0 s exactly**,
  from the moment it becomes active. Lane drawn 1.0 s before, 4 blocks wide,
  full arena length. It does not melee, does not turn mid-charge, and has no
  other ability.
- **P2, below 45%.** **Two** lanes, crossing, every 6.0 s. Both drawn 1.0 s
  ahead. The intersection is the only wrong place to be and it is visible.

This is the simplest fight in the raid and possibly in the game, and that is the
point: the *lesson* is the cycle, and a fight that teaches a cycle must have
nothing else in it to count.

**Curve.** Ulduar's thesis, isolated, at boss 1, so that when Yogg-Saron takes
the visuals away at boss 6 the player has a habit to fall back on.

---

### 2. Razorscale — `breath` · power 1.14 · Core: Chest

**Identity.** Half the fight is spent unable to reach the boss, so half the fight
is about what else you brought.

**Signature.** A shadow crossing the ground toward you, and knowing what is
above it without looking up.

**Mechanics.** `['breath', 'adds']`.
- **Air phase, 30 s.** Boss is airborne and out of melee range. It strafes the
  arena firing cones downward every 6.0 s.
  - *Readability — this is the important one.* A boss overhead is invisible in
    first person on a phone, and R2 forbids it killing you. **Its shadow is the
    telegraph**: a dark ground quad tracking its position, which grows and
    sharpens over the 1.2 s wind-up. The player's default posture already looks
    at the floor, so the fight reads without ever asking anyone to point a
    camera at the sky with a thumb. Any airborne boss in this game must
    telegraph on the ground or not exist.
- **Ground crew.** Four `skele` adds spawn during each air phase. Clearing all
  four **ends the air phase early** and forces the landing. So the air phase has
  a job in it, and the job is what shortens it.
- **Ground phase, 20 s.** Grounded, meleeable, takes 40% extra damage, cone at
  ground level every 7.0 s.
- **P2, below 40%.** Air phase 30 s → 20 s, ground crew 4 → 6.

**Loadout note.** This fight is materially easier with a ranged skill in the
four. It is not impossible without one — the ground crew and the ground phase
carry a melee player to a kill — but it is the first fight where the loadout
screen is preparation. That is section 3's sixth point arriving on schedule.

**Curve.** Boss 1 taught a cycle. Boss 2 puts a cycle inside a cycle: cones on
6 s, phases on 30 s and 20 s, and the player controls one of the two.

---

### 3. Ignis the Furnace Master — `bombs` · power 1.26 · Core: Helm

**Identity.** A fight about voluntarily standing in a bad place, on a clock,
because the alternative is worse.

**Signature.** Standing in a slow patch at five stacks with a mark on your feet,
doing arithmetic.

**Mechanics.** `['bombs', 'frost']`.
- **Heat.** The player gains a stack every **10.0 s**, no exceptions, no
  telegraph needed — a counter on the HUD. At **6 stacks** they take 40% of
  maximum health and the counter resets. The hit is announced 3 s out.
- **Coolant.** Two fixed cold zones, r = 6, that relocate every 20.0 s.
  Standing in one clears a stack per second — and **slows the player 50%** while
  they stand in it. That is the trade, and it is the fight.
- **Bombs.** Marks at the player's feet every 7.0 s, r = 7, 1.35 s lead,
  1.4× damage. In a 50% slow, 1.35 s covers 3.4 blocks, which is not enough to
  clear r = 7. **So a marked player must leave the coolant.** The two mechanics
  are in direct conflict on a fixed schedule and the entire fight is choosing
  which one to lose to.
- **P2, below 40%.** Stack rate 10 s → 8 s. Coolant relocates every 14 s.

**Change proposed.** `frost` added. Ulduar otherwise has no movement denial in
six fights, and this is the ideal place for it because here the slow is
something the player *opts into*. Inverting a mechanic's polarity — a hazard you
choose to stand in — costs one line in `spawnZone` and produces a fight shape
nothing else in the game has.

**Curve.** Bosses 1 and 2 taught the player to be somewhere at the right time.
Boss 3 makes two right places mutually exclusive.

---

### 4. Kologarn — `slam` · power 1.40 · Core: Boots

**Identity.** The boss has three health bars and you choose which two mechanics
you would rather keep dealing with.

**Signature.** Deciding, out loud, which arm you hate less.

**Mechanics.** `['slam', 'frost', 'adds']`.
- **Left arm** (own health bar, 18% of the boss's): outward rings every 9.0 s.
- **Right arm** (own health bar, 18%): grabs the player every 12.0 s — a 1.35 s
  ground telegraph, then a 2.0 s root and 0.8× damage per second while held.
  Breakable by any dash or blink; otherwise it runs its full 2.0 s.
- **Body**: melee only, and a permanent 30% damage reduction while **both** arms
  live.
- **Regrowth.** A destroyed arm regrows after **45.0 s**, at 60% of its health.
  So the choice is not permanent and the player re-makes it two or three times
  per fight.
- **P2, below 40%.** Regrowth 45 s → 30 s, and when an arm regrows it drops two
  `crawler` adds. Cap 12.

**Change proposed.** `frost` and `adds` added as secondaries. A two-armed boss
whose arms do the same thing is a boss with one arm and a longer health bar; the
design only exists if the two arms present genuinely different problems, which
means the second one needs its own mechanic id.

**Curve.** First fight in the game where the player configures the encounter.
Ulduar is the memory raid, and letting the player choose which pattern they have
to remember is the natural top of that idea.

---

### 5. Thorim — `slam` · power 1.54 · Core: Signet

**Identity.** You set your own difficulty in the first sixty seconds, and then
you live with it.

**Signature.** Finishing the gauntlet with nineteen seconds left on the clock
and watching the boss start the real fight at 70% health instead of 100%.

**Mechanics.** `['adds', 'slam']`.
- **P1, the gauntlet, 60.0 s.** The boss is untouchable. Waves of adds arrive on
  a fixed 10.0 s beat, six waves total, escalating. The player's clear time is
  measured.
- **The carry-over.** For every full 5 s of the 60 remaining when the last add
  dies, the boss enters phase 2 with **3% less maximum health**, to a floor of
  70%. A player who clears in 35 s starts the duel at 85%. A player who takes
  the full 60 s starts at 100% and has lost nothing except the bonus. **There is
  no punishment for being slow** — only a reward for being fast — because a
  punishment here would be the hard enrage this game does not have.
- **P2, the duel.** No adds. Lightning strikes at the player's position on an
  exact **3.0 s** metronome, r = 5, 1.35 s lead. Nothing else. Three seconds is
  short enough to be constant pressure and long enough that a player who has
  internalised the beat can attack between every strike.
- **P3, below 30%.** Metronome 3.0 s → 2.2 s, and every fourth strike is a
  triple ring instead.

**Change proposed.** `raids.js` gives Thorim `adds`. Promoting `slam` to
primary. Two reasons. First, the memorable part of this fight is the metronome,
not the trash — and `mech[0]` is what the boss card shows, so it should be what
the fight is about. Second, `adds` is the most over-subscribed primary in the
set at 7 of 42, and this is the one of the seven with the weakest claim, since
its adds occupy a prologue rather than the fight. `adds` stays as element 0 of
the phase list where it belongs chronologically — which is exactly the
distinction the `mech` array in section 1.3 exists to express.

**Curve.** The purest expression of Ulduar. A metronome is a cycle with nothing
else in it, and a player who has counted Leviathan, Razorscale, Ignis and
Kologarn arrives here already able to do it.

---

### 6. Yogg-Saron — `shadow` · power 1.80 · Core: Trinket

**Identity.** The fight where the visuals stop helping and the cycles are all
you have left.

**Signature.** Phase 3, when the fog has eaten the telegraph colours at range
and you dodge three things in a row on sound and count alone.

**Mechanics.** `['shadow', 'adds', 'slam', 'frost']`.
- **P1, 100–66%.** Rot pools on an exact 9.0 s beat, r = 6, 14 s duration. The
  arena fills steadily. Fog is normal.
- **P2, 66–33%.** Four adds every 20.0 s (cap 12), pools continue. Fog density
  begins climbing linearly across the phase, and telegraph colours are blended
  toward `theme.fog` by up to 55%.
- **P3, below 33%.** Rings (`slam`) every 8.0 s and root patches (`frost`) every
  12.0 s join. Fog at maximum.

**The readability floor, stated precisely, because this fight is the one
exception to R6.** Telegraph blending is capped so that at **8 blocks or closer
the contrast is unchanged**; the erosion applies only beyond that. So a
telegraph on the player's own feet is always fully legible, and what the player
loses is *advance warning at range*, not the ability to see what they are
standing in. In parallel, every telegraph in phase 3 gets its R3 shape cue at
+6 dB. The mechanic is "you can no longer plan from across the arena", not "you
can no longer see".

Without R3's five distinct shape cues implemented, this fight must not ship the
fog erosion at all. That is a hard dependency and it is the only one in the
document.

**Curve — what boss 1 taught, boss 6 tests.** Flame Leviathan taught the player
to count an 8-second cycle and act on the count rather than on the picture. Yogg
takes the picture away at range and runs three cycles at once — 9 s, 8 s and
12 s, which do not align for 72 seconds. The count is the fight.

---

## 9. Black Temple — tier 4, level 41

*A fortress of fel green and black stone, and the one who kept it.*

**The raid's job: make the fight cost something other than health.** Every class
has a resource — Mana, Rage, Energy, Soul Shards, Hatred, Faith, Focus. Black
Temple is the raid that spends it. Fights here demand skill usage on a cadence
rather than leaving it to the player's discretion, so the four slots in the
loadout stop being a damage question and become a budget question.

**A hard rule on this, so it never becomes a class-killer:** no Black Temple
mechanic may leave any class unable to act. Every resource cost imposed here is
payable by a class's *cheapest* skill, and the fights return resource for
solving them correctly. A fight that starves a class is a fight that class
cannot do, and there is no second player to cover.

This is also the raid where three live telegraphs first appear, and the first
four-phase fight.

**Boss 1 teaches that there is always an object-based answer and you should look
for it. Boss 6 tests finding it while three things are live.**

---

### 1. High Warlord Naj'entus — `bombs` · power 1.00 · Core: Weapon

**Identity.** The game's answer to "there is no interrupt": an interrupt you
shoot instead of press.

**Signature.** Realising the way to break a shield is to turn around and shoot
the floor.

**Mechanics.** `['bombs']`.
- **The shield.** Every **25 s** it shields for 90% reduction, and simultaneously
  drives a spine into the ground within 12 blocks of the player. The spine is a
  targetable object with trivial health — one hit of anything. Hitting it
  shatters the shield and stuns the boss for **5 s**. Ignored, the shield expires
  on its own after 15 s.
- **Why this shape.** It is an interrupt that costs a global cooldown's worth of
  aiming rather than a dedicated skill slot, it works identically for every
  class, and it is a *choice* — 15 s of a 90% shield is survivable, so a player
  who is busy can decline it. Ten seconds of lost damage is a real price and not
  a failure.
- **Bombs.** Marks at the player's feet every 8 s, r = 7, 1.25 s lead. During
  the 5 s stun they land at double rate, because the stun is the damage window
  and a damage window with nothing to dodge is a lull.
- **P2, below 40%.** Two spines, both must be hit within 4 s of each other.

**Curve.** Tier 4's opener, teaching tier 4's grammar: there is a thing in the
world that is the answer, and finding it is the mechanic.

---

### 2. Supremus — `charge` · power 1.16 · Core: Chest

**Identity.** Two entirely different fights alternating every 45 seconds, and
the switch is announced with two seconds' notice.

**Signature.** The mode flip landing mid-dodge, and having to abandon a plan
halfway through executing it.

**Mechanics.** `['charge', 'bombs', 'frost']`.
- **Mode A, 45 s — the grind.** Slow (2.4 blocks/s), melees, and erupts the
  floor beneath the player every 6 s: r = 7, 1.25 s lead, 1.4× damage.
  Callback to Naj'entus, one boss later, which is what boss 2 of a raid is for.
- **Mode B, 45 s — the chase.** Fixates. Moves at **1.2×** the player's sprint
  and **does not attack at all**. Instead it leaves a tar patch (`frost`, 40%
  slow, r = 4, 10 s) every 3 s along its own path — so it is closing the arena
  behind itself, and the route matters more than the speed. It takes 50% extra
  damage in this mode.
- **The switch.** Announced 2.0 s ahead, with the R3 mark cue at low pitch and a
  full-screen colour shift on the boss's emissive.
- **P3, below 35%.** Modes shorten to 30 s. Mode B speed 1.2× → 1.3×.

**Change proposed.** `bombs` and `frost` added. Mode A needs a threat or it is
45 s of a slow melee walking at you; mode B needs a reason the chase is
interesting beyond raw speed. Both are picked up from earlier fights on purpose:
Naj'entus's eruptions and the Big Bad Wolf's freezing route, two raids apart.

**Curve.** Boss 1 was one fight with an object in it. Boss 2 is two fights and
the player does not choose which one they are in.

---

### 3. Shade of Akama — `adds` · power 1.30 · Core: Helm

**Identity.** A footrace. The boss cannot be damaged at all until you have
crossed the arena twice.

**Signature.** Sprinting the full 64 blocks knowing the clock is running and
something is following you.

**Mechanics.** `['adds', 'shadow']`.
- **P1, the channelers.** Three channelers, spaced at the far corners of the
  arena, each roughly 8 s of damage to kill. The boss is fully immune while any
  live. A steady stream of weak adds spawns between them (cap 14) — not enough
  to stop the player, enough to make the crossing cost time.
- **The clock, and its cap.** Every **20 s**, each surviving channeler adds a
  permanent **+12% damage** stack to the boss. Total possible is capped at
  **+100%** and it is reached at roughly 100 s. A player who takes two minutes
  fights a boss that hits twice as hard — which is hard, and beatable at tier-4
  gear. It never grows past that, because a stacking buff with no ceiling *is* a
  hard enrage with extra steps.
- **P2, the duel.** Boss becomes attackable. Rot pools every 7 s, r = 6, 12 s.
  Adds continue at half rate.

**Curve.** Bosses 1 and 2 put the answer in the arena. Boss 3 puts it at the
other end of the arena and starts a clock. First fight in the game where raw
traversal speed is a stat that matters.

---

### 4. Teron Gorefiend — `shadow` · power 1.46 · Core: Boots

**Identity.** The one fight that cannot be solved with your auto-attack.

**Signature.** Four shades converging on you at zero resource.

**Mechanics.** `['shadow', 'adds']`.
- **The shades.** Every **30 s**, four spawn around the player and pursue at
  0.85× the player's walk speed. **They are immune to basic attacks and die to a
  single hit from any skill.** They do not die to time; ignored, they reach you
  and deal 25% of maximum health each.
- **The budget, and why no class starves.** Killing a shade **returns 20
  resource**. Every class's cheapest skill costs under 20. So four shades cost a
  net *positive* if the player has been holding anything back, and cost real
  pain if they have been dumping every cooldown into the boss on cooldown. The
  fight funds correct play and taxes greed, which is the only honest way to
  build a resource mechanic for seven different resources at once.
  - Hatred and Rage build by fighting and start empty; both gain on hit and on
    kill, so four shade kills is a large fraction of a bar. Focus and Energy
    regenerate fastest and are never the constraint. Mana, Faith and Soul Shards
    are the tightest, and 4 × 20 returned is roughly one shade cycle's worth of
    a cheap skill for all three. Checked against `RESOURCE` in `classes.js`;
    nothing in that table starves at this cadence.
- **Rot.** Pools on a 9 s beat, r = 6, 12 s. The shades path through them
  happily and the player does not, which is the fight's second dimension.
- **P2, below 40%.** Cadence 30 s → 22 s, and one of the four shades is fast
  (1.15× player walk) — so there is always one you must deal with first.

**Change proposed.** `adds` added. The shades *are* adds; the data saying
`shadow` alone would have a designer building a puddle fight.

**Curve.** Black Temple's thesis boss. Everything before this cost health or
position. This one costs the bar under the health bar.

---

### 5. Gurtogg Bloodboil — `enrage` · power 1.62 · Core: Signet

**Identity.** An enrage the player schedules. The boss's frenzy is a thing you
spend rather than a wall you hit.

**Signature.** Deliberately stopping attacking, at 55% health, for eleven
seconds, because you want the frenzy to land while your cooldowns are up.

**Mechanics.** `['enrage', 'breath']`.
- **The meter.** A second bar under the health bar fills from **damage dealt**,
  not from time. At full it triggers a **15 s frenzy**: 2.5× damage, 1.4× speed,
  and a `breath` cone every 5 s at 100° and 20 blocks. The meter drains slowly
  while the boss is not being hit.
- **The payoff.** When the frenzy ends the boss is exhausted for **10 s** and
  takes **+40% damage**. So the cycle is: build, survive, cash in.
- **Why this is the right tier-4 enrage.** Every other enrage in this game is a
  threshold the player crosses passively. This one is a resource the player
  manages, and it converts "enrage" from a difficulty spike into a decision —
  which is the same conversion Black Temple applies to skill resources on
  Teron. Same raid, same idea, two systems.
- **P2, below 40%.** Meter fills 30% faster; frenzy 15 s → 12 s; exhaustion
  10 s → 6 s.

**Change proposed.** `breath` added. A frenzy with no shape in it is 15 s of
running away, which is not a phase, it is an intermission. The cone also seeds
Illidan one boss later.

**Curve.** Boss 4 made the player budget resource. Boss 5 makes them budget
*damage*, which is the least intuitive thing this game asks and the reason it
sits second-to-last.

---

### 6. Illidan Stormrage — `breath` · power 1.90 · Core: Trinket

**Identity.** The first four-phase fight in the game, and Black Temple's exam:
every one of the raid's ideas, running at once, on a budget.

**Signature.** Phase 4, where the cone comes while a shade is on you and the
floor is scarred, and you have exactly one cheap skill's worth of resource left.

**Mechanics.** `['breath', 'charge', 'bombs', 'adds', 'frost', 'enrage']` —
five of the eight, six entries, across four phases. The most mechanics any
fight uses before Icecrown.

- **P1, 100–70% — the duel.** Cone every 7 s, 90°, 20 blocks, 1.2 s wind-up.
  Melee between. Clean, single-mechanic, deliberately: a four-phase fight needs
  a phase 1 the player can learn.
- **P2, 70–45% — the ground.** Charge every 10 s, each leaving a scar
  (`frost`, 45% slow, 12 s) along its lane; marks (`bombs`) at the player's feet
  every 8 s, r = 7, 1.25 s lead. Cone drops to every 11 s. Two live telegraphs
  and a floor that is closing.
- **P3, 45–25% — the shades.** Four Teron-style shades every 25 s, immune to
  basic attacks, 20 resource returned each. Scars persist. Cone continues.
  **Three live things — the tier-4 ceiling — and it lasts 20% of a health bar,
  not the whole fight.**
- **P4, below 25% — the enrage.** `checkEnrage` at the tier-4 threshold of 40%
  is overridden to 25% here so it lands as its own phase. +28% speed, +25%
  damage, cone every 5 s and sweeping 60° instead of 30°. **Shades and marks
  stop.** Same discipline as every other capstone in this document: the last
  phase is faster, not busier.

**Curve — what boss 1 taught, boss 6 tests.** Naj'entus taught that when the
fight seems unwinnable there is an object in the world that is the answer, and
gave the player fifteen quiet seconds to find it. Illidan's phase 3 asks the
same question — the shades are objects, the answer is a skill, the cost is
resource — with a cone on a 7-second beat and a floor made of scars.

---

## 10. Firelands — tier 5, level 51

*The Firelord rebuilt his home. It is worse this time.*

**The raid's job: use the fourth input.** The player has four skills and a jump
button, and for five raids the jump has been decoration. Firelands is where the
arena gains height as a mechanic — perches, launch pads, and floors that are
gone. `theme.lava` is true again, and this time the lake is not the edge of the
arena, it is most of it.

The engine needs one small thing: a `Zone` variant that sets the player's `vy`
on entry instead of dealing damage. Given the leaper AI already sets `vy` to 9.5
and the player's jump is already a `vy` write, this is a few lines and no new
system. Everything else in this raid is existing calls.

**Boss 1 teaches that there is a second level and it matters. Boss 6 tests it
when the first level is gone.**

---

### 1. Beth'tilac — `adds` · power 1.00 · Core: Weapon

**Identity.** The boss is not on your level, and getting it down is the fight.

**Signature.** The descent — the moment the perch empties and the thing you have
been unable to touch for a minute drops into the arena with you.

**Mechanics.** `['adds', 'shadow']`.
- **P1, the web, 60 s or until cleared.** The boss holds a perch 12 blocks up
  and is unreachable. Its brood descends on threads: 3 every 8 s, cap 16.
  Clearing the field down to zero at any point forces the descent early —
  Razorscale's structure again, at a tier where the player already knows it.
  Meanwhile the boss drops rot from above every 10 s, r = 6, telegraphed by the
  same shadow-quad technique Razorscale established.
- **P2, the ground, 40 s.** Grounded, meleeable, +30% damage taken. Rot every
  7 s. Then it climbs back and P1 repeats with 4 adds per wave.
- **P3, below 35%.** Stays down permanently. Rot every 5 s, brood every 8 s.

**Curve.** Firelands' opener states the raid's premise in its first ten seconds:
look up.

---

### 2. Lord Rhyolith — `slam` · power 1.18 · Core: Chest

**Identity.** You do not damage the boss. You steer it, and the arena damages
it.

**Signature.** Aiming a mountain.

**Mechanics.** `['slam', 'bombs']`.
- **The steering.** Two legs, each its own target. Damaging the **left** leg
  turns it right, and vice versa; turn rate is proportional to damage dealt, and
  the model visibly rotates, which is the entire telegraph and it is on the boss
  where it belongs.
- **The damage.** Six vents in fixed positions. Walking the boss over one deals
  **8% of its maximum health** and destroys that vent. Six vents, one kill —
  so the fight has an exact solution and the player is executing a route, not
  grinding a bar. Vents respawn 40 s after use, so a missed one is a delay, not
  a loss.
- **The threat.** Its footfalls throw rings (`slam`) every 6 s, r = 6 at each
  foot, and each vent it crushes erupts (`bombs`, r = 8, 1.20 s lead).
- **P2, below 40%** (i.e. after three vents): it moves 1.5× faster, so the
  steering is coarser and overshooting is easy.

**Change proposed.** `bombs` added. A steering puzzle with nothing chasing the
player is a driving game; the vent eruptions make crushing one a decision about
where you are standing, not just a checkbox.

**Curve.** Boss 1 taught that the fight happens on two levels. Boss 2 teaches
that the arena is a weapon, which is the other half of what Firelands is for.

---

### 3. Alysrazor — `breath` · power 1.34 · Core: Helm

**Identity.** The fight where the jump button is the answer.

**Signature.** Being flung twenty blocks into the air over a cone that would
have killed you.

**Mechanics.** `['breath', 'bombs']`.
- **The pads.** Four updraft zones in fixed positions, r = 4. Entering one sets
  the player's `vy` to 16 — roughly 3.5 s of airtime and about 20 blocks of
  rise, enough to clear anything at ground level. Each pad has a **6 s** cooldown
  after use, marked by its colour draining, so there are four escapes and they
  are a resource.
- **The cones.** Every **6.0 s** (Ulduar-style fixed cadence — this raid inherits
  it) a cone at 100° and the full arena length. **It cannot be outrun on the
  ground.** Sidestepping works only if you were already near the flank; from
  anywhere else the pad is the answer. The wind-up is 1.4 s, deliberately the
  longest cone in the game, because getting to a pad is further than getting to
  a flank.
- **Marks.** `bombs` at the player's feet every 9 s, r = 7 — and critically,
  **a mark resolves while you are airborne**, so a pad is not a universal
  answer, only a cone answer.
- **P2, below 40%.** Two pads go dark permanently. Cone every 4.5 s.

**Curve.** Boss 1: the boss uses height. Boss 2: the arena is a tool. Boss 3:
*you* use height, and it is finite.

---

### 4. Shannox — `charge` · power 1.50 · Core: Boots

**Identity.** Three bodies, one shared consequence, and you choose the order.

**Signature.** Stepping into a trap you can plainly see, on purpose, because the
charge was going to land otherwise.

**Mechanics.** `['charge', 'frost', 'adds']`.
- **The pack.** The boss and two hounds. The hounds are fast and weak; the boss
  is slow and charges every 9 s. **Damaging a hound gives the boss a permanent
  +15% damage stack, to a cap of +60%.** So killing the hounds is expensive and
  ignoring them is exhausting, and the player must commit to a plan.
- **The traps.** The boss throws a trap every 12 s at a point 6 blocks from the
  player: a visible object on the ground, 4-block radius, that **roots for 2.5 s**
  when stepped on. Traps persist until triggered, so the arena accumulates them
  and the safe routes narrow across the fight. Cap 8 live traps.
- **The interaction.** A charge dodge and a trap field are the same decision. By
  90 seconds in there is usually a moment where the clean dodge direction has a
  trap in it and eating the root is the correct play, because 2.5 s rooted is
  cheaper than a charge at +60% damage.
- **P2, below 35%.** Hounds respawn once, 20 s after death. Charge every 6 s.

**Change proposed.** `frost` and `adds` added. The traps are the fight's memory
— the thing that makes minute three different from minute one — and the hounds
need declaring, since they are the fight's central decision.

**Curve.** Boss 3 gave the player a finite escape resource. Boss 4 takes escapes
away one square at a time and makes them pay for the removal themselves.

---

### 5. Baleroc — `bombs` · power 1.68 · Core: Signet

**Identity.** A dial the player sets. How dangerous this fight is, is a choice
made continuously and revisable at any moment.

**Signature.** Sitting at eight stacks with 20% health because the kill is three
seconds away and you decided it was worth it.

**Mechanics.** `['bombs', 'shadow']`.
- **The beam.** A continuous 4-block-wide beam that slowly tracks toward the
  player. Standing in it gives a stack every **2 s**, to a maximum of 10.
  **Each stack is +12% player damage dealt and +10% player damage taken.**
  Stacks decay one per 4 s outside the beam.
- **The maths.** At 10 stacks the player deals 120% more and takes 100% more.
  That is a coherent gamble at every point on the curve rather than an obvious
  yes or no, and it re-poses itself every four seconds.
- **The bombs.** Marks every 6 s, r = 7, 1.20 s lead, at the player's feet.
  These are what make high stacks genuinely dangerous rather than merely
  theoretically dangerous: the mark damage scales with the stack multiplier.
- **The soft clock.** Rot creeps from the arena edge inward at **0.15 blocks per
  second**, permanently. At 180 s about 27 blocks are gone and the fight has
  become close-quarters. It stops at a 12-block-radius core, which is enough
  room to keep dodging. Not a timer — a fight that gets harder if you stall,
  with a floor, which is what this game uses instead of timers.
- **P2, below 30%.** Stack cap 10 → 14 and the beam tracks 40% faster.

**Curve.** Firelands has spent four bosses giving the player tools and taking
them away. Boss 5 hands over the difficulty dial itself.

---

### 6. Ragnaros, Firelord — `enrage` · power 2.00 · Core: Trinket

**Identity.** The floor leaves. Everything Firelands taught about the second
level, applied when there is no first level left.

**Signature.** Phase 3, standing on one of five islands over a lake, with two
launch pads, waiting for a cone.

**Mechanics.** `['slam', 'bombs', 'adds', 'breath', 'frost', 'enrage']` — six
entries across four phases.

- **P1, 100–70% — the ground.** Outward rings every 7.0 s. Melee. One mechanic,
  learnable, because a four-phase fight needs a phase 1.
- **P2, 70–40% — the pressure.** Marks (`bombs`, r = 8, 1.20 s) every 6 s, and
  3 adds every 15 s (cap 16). Rings continue at 9 s. Three live things at the
  tier-5 ceiling.
- **P3, 40–20% — the islands.** **The raid's one real terrain change** (R7:
  `world.set` + `buildMesh()` at the phase boundary, under the banner and a 0.7
  shake). The floor drops to five islands, 8 blocks across, connected by two
  launch pads. Cones every 6.0 s at full arena length — Alysrazor's problem, on
  Alysrazor's answer, with the ground gone. Tar (`frost`) spawns on a random
  island every 8 s so the islands are not all equal.
- **P4, below 20% — the enrage.** +28% speed, +25% damage. `enrageNova` every
  6 s. **Cones, marks and adds all stop.** The islands remain. The last 20% of
  the last boss of tier 5 is a pure movement test on a broken floor, and it is
  the fastest twenty seconds in the game.

**Curve — what boss 1 taught, boss 6 tests.** Beth'tilac taught that the arena
has a vertical dimension and that the boss uses it. Ragnaros removes the
horizontal one and asks whether the player learned to use it too.

---

## 11. Icecrown Citadel — tier 6, level 60

*A frost keep at the top of the world, and the throne inside it.*

**The raid's job: two jobs at once, permanently.** Every Icecrown fight has a
**positive obligation** — somewhere you must be, or something you must destroy —
running continuously alongside the avoidance the player has been doing for six
raids. Avoidance can be done with the part of your attention that is not aiming.
An obligation cannot. That is what tier 6 is, and it is the reason this raid
does not need faster telegraphs than tier 5.

It is also where `frost` finally becomes the headline: after six raids of
teaching that the answer to everything is to move, the last two fights charge
rent on moving.

**Boss 1 teaches you to destroy the thing holding you. Boss 6 tests it while the
floor goes, at 40% mobility, with three cycles running.**

---

### 1. Lord Marrowgar — `bombs` · power 1.00 · Core: Weapon

**Identity.** A bomb you have to destroy rather than dodge.

**Signature.** Shooting the thing pinning your feet while a ring closes on you.

**Mechanics.** `['bombs', 'frost', 'slam']`.
- **The spike.** Every **14 s** a bone spike erupts at the player's position —
  1.15 s lead, unavoidable if they do not move, which is the point of the lead.
  If it lands, the player is **pinned**: rooted until the spike is destroyed
  (about 1.5 s of damage) or 5 s pass, taking 0.6× damage per second throughout.
  Dodging it entirely is possible and correct; being pinned is recoverable and
  costs about 4 s.
- **Why a destructible root is the right tier-6 opener.** It is the raid's whole
  thesis in one ability: a thing you must actively do, that occupies your
  crosshair, while the fight continues around you.
- **The rings.** Outward rings every 8 s, r = 5 / 8.5 / 12. **A pinned player is
  in the ring's path**, which is the interaction the fight is built on. Ring
  cadence and spike cadence are 8 and 14, so they collide every 56 s and the
  collision is the hardest moment.
- **P2, below 45%.** Spike every 10 s; rings every 6 s.

**Curve.** Tier 6's opener, isolated, so that the raid's grammar is learned
before it is combined.

---

### 2. Lady Deathwhisper — `adds` · power 1.20 · Core: Chest

**Identity.** A burst window fight where the adds exist purely to deny the
window.

**Signature.** Watching the shield refill two seconds before you would have
broken it.

**Mechanics.** `['adds', 'shadow', 'frost']`.
- **The shield.** An **absorb**, not a reduction: a flat pool equal to 18% of
  the boss's maximum health, refreshed every **30 s** exactly. Break it and the
  boss takes damage normally until the next refresh; fail to break it and the
  30 s were spent for nothing.
- **Why absorb rather than reduction.** A reduction rewards sustained damage and
  makes every class play the same. An absorb rewards *burst* — banked cooldowns,
  a saved resource pool — which is the decision the Curator taught at tier 2 and
  this is the graduate version, because the adds mean the window is never clean.
- **The adds.** 3 every 12 s, cap 18, mixed `hexer` and `wraith` so one shoots
  and one teleports. They leave a rot pool on death (r = 4, 10 s).
- **The floor.** Ice patches (`frost`, 45%, r = 5, 8 s) every 10 s at the
  player's feet, so kiting the adds is not free.
- **P2, below 40%.** Shield refresh 30 s → 22 s. Absorb pool 18% → 14%.

**Curve.** Boss 1: destroy a thing. Boss 2: destroy a thing on a clock while
other things prevent it.

---

### 3. Deathbringer Saurfang — `enrage` · power 1.40 · Core: Helm

**Identity.** The fight where hitting the boss harder makes the boss stronger.

**Signature.** Deliberately stopping mid-combo to go kill an add, and knowing
that is correct.

**Mechanics.** `['enrage', 'adds']`.
- **The meter.** Fills from **damage the boss deals and from adds that reach
  it**, not from your damage — the inverse of Gurtogg, and placed three raids
  later on purpose. At full it takes a permanent stack: **+10% damage, +5%
  speed**, capped at **6 stacks** (+60% damage, +30% speed). At six stacks it is
  a hard fight and a winnable one, at tier-6 gear, and it goes no further.
- **The adds.** 2 every 18 s, spawned at the arena edge, walking toward the boss.
  Each one that reaches it fills 25% of the meter instantly. Killing them before
  they arrive is the whole obligation, and the walk takes about 9 s, which is
  the fight's rhythm.
- **The trap.** Every add killed *near the boss* still fills 10%. So the
  obligation is not "kill adds", it is "kill adds early", and a player who
  tunnels the boss and cleans up late still loses ground.
- **P2, below 45%.** Standard `checkEnrage` on top of whatever stacks exist.
  Adds every 12 s.

**Curve.** Boss 2 asked the player to burst. Boss 3 asks them to stop bursting
at the right moments, which is harder and is the reason it is third rather than
first.

---

### 4. Festergut — `shadow` · power 1.60 · Core: Boots

**Identity.** A fixed 30-second cycle with one non-negotiable moment in it, and
everything else is about being ready for that moment.

**Signature.** The run to the wall, made three times, and the third one made
while rooted.

**Mechanics.** `['shadow', 'breath', 'frost']`.
- **The cycle.** Every **30.0 s** exactly: an inhale (3 s, announced), then an
  exhale. The exhale hits **everything within 20 blocks of the boss** for 45% of
  maximum health. The arena is 64 across, so there is always somewhere to be —
  but getting there takes about 4 s at full speed and the announcement is 3 s.
  **The player must start moving before the announcement**, which is exactly
  what Ulduar's fixed cycles trained.
- **The complications.** Rot fills the arena continuously (r = 6 every 8 s, 14 s
  duration), so the route to the wall is not the same route twice. Ice patches
  (`frost`) spawn under the player every 12 s. A cone (`breath`) every 9 s
  points at the player and the wall behind them roughly half the time.
- **The recoverable failure.** 45% is deliberately not lethal from full. Eating
  one exhale is survivable; eating two in a row is not. So the fight is a
  sequence of recoverable mistakes with a hard limit, which is the fairest shape
  a positional check can take.
- **P2, below 35%.** Cycle 30 s → 22 s. Radius 20 → 26 blocks.

**Curve.** Bosses 1–3 had obligations you could serve late at a cost. Boss 4's
obligation has a deadline and the deadline does not move.

---

### 5. Sindragosa — `frost` · power 1.82 · Core: Signet

**Identity.** The fight about your own mobility. Six raids have taught the
player that the answer to everything is to move; this is the bill.

**Signature.** Standing perfectly still, on purpose, for two full seconds, in a
game that has spent forty fights teaching that standing still kills you. It is
the best moment in this document and it is placed second-to-last for that
reason.

**Mechanics.** `['frost', 'breath', 'adds']`.
- **The chill.** A stack every **4 s**, unconditionally, no telegraph, shown as
  a counter. Each is **−8% movement speed**, to a cap of 8 stacks (−64%). At 8
  stacks the player is moving at roughly 1.8 blocks per second and cannot clear
  any telegraph in this document.
- **The clear.** Standing still — no movement input — for **2.0 s** removes
  **all** stacks. Not one. All. So the decision is binary and legible: find two
  seconds, or lose the fight slowly.
- **The denial.** The boss's job is to make two seconds expensive. A cone
  (`breath`) every **7.0 s**, 90°, 22 blocks, 1.15 s wind-up — long enough to
  read while stationary, not long enough to walk out of at 6 stacks. Two adds
  every 20 s that path directly at the player, so a stationary player is also a
  target.
- **Why this is fair.** The stack rate is fixed and the clear is unconditional.
  A player who reads the cone cadence knows the safe windows exactly: the 4.5 s
  between the end of one cone and the wind-up of the next is more than two
  seconds. The fight is completely solvable and it is completely unforgiving of
  playing it on instinct.
- **P2, below 35%.** Stack every 3 s; clear needs 2.5 s; cone every 6 s. The
  window closes to about 3.3 s, which is still enough, and it is the tightest
  margin in the game.

**Curve.** Every mechanic in six raids assumed the player could move. This one
audits that assumption, and it does so one boss before the last one, so that the
Lich King can use the result.

---

### 6. The Lich King — `frost` · power 2.20 · Core: Trinket

**Identity.** The only fight in the game that uses all eight mechanics before it
ends, in five phases, and the last one takes the floor.

**Signature.** The final phase, where the arena collapses to a single 10-block
disc and it moves, and you have to be on it while three cycles run.

**Mechanics.** `['frost', 'adds', 'bombs', 'shadow', 'slam', 'charge',
'breath', 'enrage']` — all eight. This is the only fight in the game permitted
to do that, and it is why it is last.

- **P1, 100–80% — the audit.** Sindragosa's chill, slowed down: a stack every
  6 s, −8% each, cleared by 2.0 s stationary. Outward rings every 9 s. That is
  all. Phase 1 of the last fight in the game is a check that the player learned
  the previous boss.
- **P2, 80–60% — the obligation.** 3 adds every 15 s (cap 18); each one that
  survives 20 s becomes elite (`makeElite`, which already exists). Chill
  continues. Marks (`bombs`, r = 7, 1.15 s) every 8 s.
- **P3, 60–40% — the ground.** Rot (`shadow`) creeps outward from the boss at
  0.2 blocks per second, permanently, capping at 20 blocks — the arena's usable
  space halves across the phase. Charge every 10 s, leaving a frozen lane.
  Rings continue. Chill continues.
- **P4, 40–20% — the collapse.** **The game's last terrain change** (R7).
  Everything outside a **10-block disc** drops away. The disc's centre then
  moves 6 blocks every 25 s, announced 3 s ahead with a lane quad, so the
  player relocates four or five times. On the disc: cone (`breath`) every 7 s,
  marks every 8 s, chill every 4 s. **Three live telegraphs on a 10-block
  platform** is the hardest thirty seconds in the game and it lasts exactly 20%
  of a health bar.
- **P5, below 20% — the end.** `checkEnrage`: +28% speed, +25% damage,
  `enrageNova` every 5 s. **Marks, adds, cones and rot all stop.** The disc
  stops moving. Chill remains, because chill is what this raid is about. The
  last twenty seconds of the game are one boss, one platform, one nova cycle,
  and a movement speed you have to keep clearing.

**On making the last phase simpler.** Every capstone in this document strips
mechanics at its enrage, and the last one strips the most. A final phase that
adds a ninth thing is a final phase nobody sees, and the thing a player should
remember about the end of a 240-second fight is that they were *fast*, not that
they were confused. The difficulty in P5 is the margin, not the count.

**Curve — what boss 1 taught, boss 6 tests.** Marrowgar taught that at tier 6
there is always something you must actively destroy or escape while the fight
continues around you, and gave the player one at a time, on a 14-second beat,
on a full floor. The Lich King asks for it at 40% movement speed, with three
cycles running, on a platform ten blocks across that will not be there in
twenty-five seconds.

---

## 12. Every change to `raids.js`, collected

Structural, once:

- **`mechanic: string` → `mech: string[]`**, ordered by phase, with `mechanic`
  kept as a derived getter for `mech[0]`. Section 1.3.

Primary-mechanic changes, three:

| Boss | Was | Now | Why |
| --- | --- | --- | --- |
| Jin'do the Hexxer | `shadow` | `frost` | Zul'Gurub had two `shadow` bosses, so boss 4 of the teaching raid taught nothing new; `frost` was used twice in all 42 and both times in Icecrown. |
| The Big Bad Wolf | `charge` | `frost` | Karazhan had two `charge` bosses and Attumen has the better claim; the fixate is the frame but the freezing route is the fight. |
| Thorim | `adds` | `slam` | Its adds are a 60-second prologue and its metronome is the fight; `adds` was also the most over-subscribed primary at 8 of 42. |

All three moved mechanics stay in the boss's `mech` list, so nothing is
removed — only reordered so `mech[0]` names what the fight is actually about.

Every other change is a *secondary* added to a `mech` list, and each is argued
where it appears. No boss's `power`, `name`, `id`, `color` or ordering changes,
and no raid's theme changes.

---

## Sources

Design principles drawn from general boss-encounter writing. All fights,
abilities, numbers and prose above are original to this document.

- [Enemy Attacks and Telegraphing — Game Developer](https://www.gamedeveloper.com/design/enemy-attacks-and-telegraphing)
- [Designing for Difficulty: Readability in ARPGs — Game Developer](https://www.gamedeveloper.com/game-platforms/designing-for-difficulty-readability-in-arpgs)
- [Boss Battle Design and Structure — Game Developer](https://www.gamedeveloper.com/design/boss-battle-design-and-structure)
- [Boss Design: How to Make an Unforgettable Boss Battle — Game Design Skills](https://gamedesignskills.com/game-design/game-boss-design/)
- [Designing the Perfect Boss Battle — itch.io](https://itch.io/blog/1024105/designing-the-perfect-boss-battle-a-game-developers-holy-grail)
- [How to Design a Final Boss — Bugnet](https://bugnet.io/blog/how-to-design-a-final-boss)
