# CRAFT ARENA — design review

Written as if by people who play a lot and people who fund games, reading the
build as it stands. Every observation below is against the actual code, not
against a general idea of what an arena game is, and every recommendation says
what it would cost.

**What is already good, briefly, because it changes what the advice should be.**
Nine classes with thirteen skills each and four eleven-node talent branches is
more character content than most games in this genre ship with. Forty-two raid
bosses across seven rooms with their own palettes and fog is a genuine second
mode. The gear ladder is measured rather than guessed, and the balance is
checked by simulation. This is not a project that needs more *content*. Every
item below is about the content it already has doing more work.

---

## Seven changes, one per area

### 1. Gameplay — a wave needs a shape

Right now the loop is: the director computes a budget from the wave number,
spends it on a queue of mobs, spawns them, and waits until the room is empty.
Wave 30 is wave 10 with a bigger number in the same three-beat structure. The
affix system is the only thing that varies it, and affixes are wave-wide
modifiers rather than events.

A wave should have an arc inside it. The cheapest version, entirely inside
`WaveDirector`, is scripted beats at fractions of the budget:

- Open with the pack, as now.
- At 50% cleared, a **reinforcement** spawns behind the player, so the room
  turns over rather than emptying from one direction.
- At 20% remaining, the survivors **enrage** — visibly, with a colour shift and
  a speed increase — so the tail of a wave is the dangerous part instead of the
  cleanup.

The player-facing result is that a wave has a middle. Cost: small, contained to
one file, no new art or data.

### 2. Map design — the arena is one room, and no part of it matters

There are six layouts and they differ in where the obstacles sit. That is
variety in *appearance* rather than in play, because nothing about the room
ever changes the correct thing to do: you fight where you are standing, and
walls are things that block your shots.

The fix is to give the room reasons to move to a specific part of it. In
descending order of value per unit of work:

- **Hazards you can bait enemies into.** The raid rooms already have lava that
  damages what stands in it, and `blockDamageAt` already resolves it for any
  entity. Putting that in the arena — a fire pit, a spike trench — turns
  knockback from a defensive tool into a kill, which is the single cheapest way
  to make a room tactical.
- **High ground that means something.** The Spires layout already builds
  towers. If ranged attacks from above ignored the crowd-press rule, standing
  up there would be a real choice with a real cost: you cannot melee from a
  tower and you can be surrounded on the way down.
- **A shrinking or rotating safe zone on deep waves.** The arena is endless and
  currently never applies pressure to *keep moving*. A creeping hazard from the
  edges after wave 25 does exactly that, and reuses the zone system that
  already exists for boss mechanics.

Cost: medium. The world builder and hazard systems both already exist; this is
composition rather than new machinery.

### 3. Bosses — the arena bosses are big mobs, and the raid bosses are not

There are three arena bosses (Colossus, Warden, Broodmother) and forty-two raid
bosses. The raid bosses have telegraphs, cast bars, eight distinct mechanics
and a phase model. The arena bosses have more health.

The mechanic system in `mobs.js` — `pickRaidMechanic`, `castRaid`, the `mech*`
methods, the tell colours — is general. It is gated to raid encounters by
convention, not by anything structural. Giving each arena boss two mechanics
from that set costs almost nothing in new code and changes a boss wave from "a
long fight" into "a fight you have to read".

This is the highest value-per-hour item on the list.

### 4. Mechanics — thirty enemies behave like thirty copies of one enemy

The individual AI is better than it looks: melee mobs hang back when the front
rank is full, ranged mobs check line of sight before plinking at a wall,
leapers refuse to pounce without a clear path. Those are good behaviours and
they were clearly written against real problems.

What is missing is anything *between* mobs. Thirty enemies all run the same
solo routine simultaneously, and a mob's strafe direction is fixed at spawn by
`id % 2` and never changes for its whole life. That is why a big wave reads as
a blob: nothing in it is reacting to anything except the player.

Three additions, cheapest first:

- **Flank assignment.** Instead of `id % 2`, have the pack assign approach
  angles so mobs arrive from several directions rather than one clump. This is
  a few lines and it is the difference between a crowd and a mob.
- **Ranged mobs holding fire when a melee mob is in the line.** Currently they
  shoot through their own front rank. Not shooting reads as intelligence far
  out of proportion to the code.
- **Retreat and re-engage.** A badly hurt mob backing off to heal or to wait
  for support gives the player something to chase and a decision about whether
  to.

### 5. UI — four systems feed one number, and the player never sees the number

Gear tiers, set bonuses, weapon riders, Forge levels, mastery rank and talent
ranks all flatten into a single modifier bag via `buildMods`. The player can
inspect every *input* on its own screen and cannot see the *output* anywhere.

A character sheet — one screen listing final health, damage, crit, attack
speed, armour, move speed, and what each contributes — is the missing piece
that makes the other four screens feel like they connect. It is also the screen
that sells the next purchase, because "your chest is T2, T3 is +8% health" is a
much better argument when the player can see the health number it is adding to.

Cost: small. Everything it needs is already computed; nothing is displayed.

### 6. Talents — 396 nodes and almost all of them are a percentage

The tree now says exactly what each node does, which was the missing half. The
other half is that most nodes do the same *kind* of thing. Of roughly seventy
effect keys, the large majority are `+x%` to a stat. A player picks a branch
and then fills it in; there is very little in the tree that changes how a turn
of combat is played.

The nodes that *are* interesting are the single-rank switches — Rampage,
Cold Snap, Cataclysm, Maelstrom, Guardian Spirit. Those are the ones people
build around, and there are about two dozen of them across nine classes.

The recommendation is not more nodes. It is to convert the **capstone of each
branch** — the eleventh node, which every player who commits to a branch will
take — into a switch rather than a percentage. Thirty-six capstones, four per
class, each one changing something about how the class plays. That is a bounded
piece of design work with a very high ceiling, and it makes the choice of
branch a choice about playstyle instead of about which stat you wanted more of.

### 7. Graphics — there is now headroom for the effects that read as production value

A busy frame is five draw calls. That was six hundred this morning. Whatever
budget the renderer had, it has a great deal more of it now, and the cheapest
things to spend it on are the whole-screen effects that separate a good-looking
voxel game from a flat one:

- **Bloom on emissive surfaces.** Lava, boss eyes, spell effects and the glow
  channel already carry the information a bloom pass needs. One downsample,
  one blur, one add.
- **Colour grading per theme.** The eleven themes already define a palette;
  grading the final image toward it would make Molten Core feel hot and
  Icecrown feel cold in a way that per-block colours alone cannot.
- **Camera weight.** There is screen shake already. Adding a small FOV punch on
  a kill and a subtle roll on hard turns costs nothing and is most of what
  makes a first-person game feel physical.

---

## Five things worth adding that are not fixes

### 1. Ghost duels

Fight a *recording* of another player's character — same class, talents and
gear, driven by the existing AI. It reads as PvP, appears on a leaderboard,
and needs no netcode, no matchmaking, no servers and no anti-cheat beyond
validating a submitted score. It is also the honest way to find out whether
people want to fight each other before paying for the infrastructure that lets
them actually do it. See `ONLINE.md` §2.

### 2. Rare and elite mob affixes

The wave-wide affix system is good. The per-mob version of it is better: one
mob in a wave gets a name, a colour, two modifiers drawn from a table
(*Vampiric*, *Volatile*, *Shielded*, *Frenzied*), and drops something. This is
the single most reliable retention mechanic in the entire action-RPG genre
because it makes an individual enemy in an anonymous crowd into an event. Most
of the machinery exists — `makeElite` and `applyAffixes` are already there.

### 3. An ascension ladder

The game is endless but has exactly one long-term goal: a bigger wave number.
A ladder of repeatable difficulty tiers, each adding one permanent rule
(enemies gain a mechanic, healing is reduced, a new affix is always active),
gives an experienced player a reason to start over that is not "the number
goes up". Slay the Spire and Hades both carry their entire long tail on this,
and it is almost pure design work rather than engineering.

### 4. A death recap

When a run ends, show what actually killed the player: the last five damage
sources, how much each did, and what they had available and did not use. This
is a small screen with an outsized effect on both retention and word of mouth,
because "I died and I don't know why" is the single most common reason people
stop playing a difficult game.

### 5. Music that reacts to the fight

The chiptune system already has an intensity control and three channels. It is
currently set by wave. Driving it from the actual state of the fight — how many
enemies are alive, how close the player is to death, whether a boss is in
phase two — costs very little and does more for how a fight *feels* than any
amount of additional graphics work.

---

## If only three things get done

1. **Arena boss mechanics** (§3) — highest value per hour of work in the list,
   because the system already exists and is simply not used outside raids.
2. **Pack behaviour** (§4) — the difference between a crowd and a mob, and the
   thing a player would describe as "the AI is good" without being able to say
   why.
3. **The character sheet** (§5) — the screen that makes four existing systems
   feel like one game, and the one most likely to sell the next purchase.
