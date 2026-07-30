# The Armoury, redesigned

The current Armoury is fourteen slots running to tier 100, priced only in gold.
Measured against what a run actually earns, it fails in a specific way: gold per
run grows faster than the prices do, so the grind gets *easier* the deeper you
get. A player reaching wave 40 buys every slot to tier 25 in three runs.

Level-gating fixes that at the root. If tier 4 cannot be bought below level 41,
no amount of gold buys your way past the content — which is the same thing
levelling already does, and the reason the two systems now pace each other
instead of racing.

---

## 1. Six slots, seven tiers

| | |
| --- | --- |
| **Slots** | Helm · Weapon · Chest · Boots · Ring · Trinket |
| **Tiers** | T0 … T6 |

Down from fourteen slots because each of six can matter. Fourteen rows where
each is worth 7% of the whole is a spreadsheet; six where each is worth a sixth
is a decision about what to buy first.

**Gold is one global pile. Gear is per class.**

Every class draws from the same purse — a run on the Rogue funds the Paladin —
but buying the T1 Ring for the Paladin does not give the Rogue a T1 Ring. Each
class owns its own six slots and buys each of them itself, at its own level.

That split is the whole point. Shared gold means no class is ever starved of
funding, so you are never punished for wanting to try a second one. Separate
gear means an account that has poured a hundred hours into the Paladin still
starts the Rogue with nothing but the level it has earned — and a class you
have actually played feels different from one you have not, which is exactly
what an account-wide Armoury destroyed.

The save shape follows: `data.souls` stays global, `data.classes[id].gear`
holds `{ helm: 3, weapon: 2, ... }` per class — one number per slot, because a
slot is at exactly one tier and climbs one rung at a time.

## 2. Tiers unlock by level

| Tier | Level | Cost / slot | Full set | Runs for that set |
| --- | --- | --- | --- | --- |
| T0 | 1 | 800 | 4,800 | 6 |
| T1 | 11 | 3,200 | 19,200 | 4 |
| T2 | 21 | 12,800 | 76,800 | 7 |
| T3 | 31 | 51,200 | 307,200 | 14 |
| T4 | 41 | 204,800 | 1,228,800 | 34 |
| T5 | 51 | 819,200 | 4,915,200 | 92 |
| T6 | 60 | 3,276,800 | 19,660,800 | 315 |

Cost is `800 × 4^tier`. Total for every slot at every tier: **26.2 million
gold, about 470 runs.**

Levelling to 60 is about 500 runs. So gear runs *alongside* the level climb for
its whole length and finishes slightly after — and T6, which is two thirds of
the entire cost on its own, is the chase that starts the moment you cap and
keeps going.

The surplus is deliberate. A player who out-earns their level has gold and
nothing in the Armoury to spend it on; that gold goes to the Forge and to quest
rerolls. Gold stops being the pacing mechanism, which is what it was bad at.

### Tiers cannot be skipped

Each slot climbs one tier at a time. A level-31 character cannot buy a T3 Ring
outright — it must already own the T2 Ring, which needed T1, which needed T0.
Level says *how high* a slot may go; the ladder says you walk up it.

Two things follow, and both are wanted.

**A slot is a commitment, not a purchase.** Without the ladder, a player sitting
on gold at level 41 buys six T4 pieces the moment they ding and the six tiers
below were content nobody ever saw. With it, gear is something you have been
building the whole way up.

**Catching up is cheap, and self-correcting.** Someone who levels hard and
ignores gear until 31 pays the whole ladder for a Ring: 800 + 3,200 + 12,800 +
51,200 = **68,000**. That looks like a penalty and is not — by level 31 a run
pays about 21,000, so the three rungs they skipped cost them three quarters of
one run. The ladder only ever bites at the top, where the rungs are expensive
and the levels are far apart, which is exactly where a grind should bite.

## 3. Stats: what each slot does

Every slot's values scale linearly with tier, so T4 is four times T1 and the
maths stays legible.

| Slot | Per tier | Full T6 |
| --- | --- | --- |
| Weapon | +8% damage | +48% |
| Chest | +7% max health | +42% |
| Helm | +4% max health, +1.2% crit | +24%, +7.2% |
| Boots | +2.5% move speed, +1% dodge | +15%, +6% |
| Ring | +3% damage, +2% crit damage | +18%, +12% |
| Trinket | class-defining — see below | |

A full T6 set is roughly **+70% damage and +65% health**. That is a real
difference and a bounded one. For comparison, a maxed Forge today grants +200%
damage and +600 health, which is the number that made you say it would make you
too strong — and it is right.

Health uses a *percentage* of the class's base, not a flat number. A flat +200
is a third of a Paladin's health and nearly double a Hunter's; percentages mean
one table is fair to nine classes.

## 4. Per class

Slots are the same six for everyone; **what they grant differs by class**, so
gear reinforces what the class already is instead of flattening it.

| Class | Weapon leans | Trinket |
| --- | --- | --- |
| Warrior | melee damage | +thorns, +rage per hit |
| Mage | spell damage | +area radius, −cooldowns |
| Warlock | damage over time | +pet power, +lifesteal |
| Shaman | spell damage | +totem duration, +chain jumps |
| Priest | spell damage + healing | +absorb, +healing done |
| Rogue | crit damage | +attack speed, +dodge |
| Demonslayer | melee + lifesteal | +hatred per hit, +move speed |
| Paladin | melee + healing | +armour, +block |
| Hunter | ranged damage | +pet power, +pierce |

## 5. The weapon is visible, and always different

Sixty-three appearances — nine classes × seven tiers — generated rather than
modelled, from four dials the existing first-person renderer already has:

- **shape** from the class (sword, staff, bow, hammer, dagger, axe, glaive)
- **material tile** stepping through stone → metal → gold → crystal → rune →
  obsidian → glow as the tier climbs
- **colour** shifting toward the class's accent and brightening
- **flourish**: T0–T1 plain; T2–T3 gain a coloured core; T4–T5 gain an emissive
  gem and a longer blade; T6 gains a slow particle trail

The point is that a player can tell someone else's tier at a glance, and their
own progress is visible in their hands for the whole run rather than on a menu
screen.

## 6. What happens to existing saves

The old Armoury is account-wide with fourteen slots; the new one is per class
with six. There is no honest mapping between them, so: **every gold piece spent
on the old Armoury is refunded.** It is exact, it cannot be exploited, and the
player re-spends it on the new system at whatever tier their level allows.

## 7. What this leaves for the Forge

With the Armoury level-gated and per class, the Forge no longer needs to be a
power source at all — it is the *third* one, behind talents and gear, and it is
currently the largest. The recommendation stands: cut its raw stat tracks hard
(max 100 → 25, values halved) and re-point it at what shapes a run rather than
what multiplies it — potion rates, starting state, affix rerolls, gold and XP
rate, and a fifth skill slot.

That gives each currency exactly one job:

- **XP → levels → talents** — your character build
- **Gold → Armoury** — geared to your level, ~470 runs, per class
- **Gold → Forge** — a short finite set of account-wide conveniences

---

# Raids — agreed rules so far

Not built yet. This records the decisions already made, so they are not
re-litigated when the work starts.

**Seven raids, one per tier.** Zul'Gurub (T0), Molten Core (T1), Karazhan (T2),
Ulduar (T3), Black Temple (T4), Firelands (T5), Icecrown Citadel (T6). Six
bosses each, because a T set has six pieces.

**Each boss drops one Core**, in slot order: weapon, chest, helm, boots, ring,
trinket. A Core is not the item — it is permission to *buy* that item, and the
gold still has to be earned. Bosses pay about half the gold the piece costs;
the rest comes from the arena and from quests.

**Progress is per class**, like levels, talents and gear. Only gold is shared.

**Two gates, both of which must be open.** The previous raid must be cleared
*and* its set fully bought, and the character must be at the tier's level: T0
from 1, T1 from 11, T2 from 21, T3 from 31, T4 from 41, T5 from 51, T6 at 60.
A level-45 Warrior who has cleared T4 and bought the set still waits until 51
for Firelands.

**A boss is consumed by killing it, not by fighting it.** Wiping is free and the
attempt can be repeated as often as needed; only the kill removes the boss from
that class's raid. Without this a player who out-levels their gear could lock
themselves out of the rest of the game permanently, and a system that can
deadlock is not a challenge, it is a bug with a difficulty setting.

**Between bosses: "Continue?"** Yes spawns the next boss and restores health,
resource and cooldowns. No returns to the menu with everything kept. A raid is
cleared when the sixth Core is taken.

**Each kill is announced** — "T5 Chest Core unlocked!" — in the same register as
the boss-slain banner, with its own cue.
