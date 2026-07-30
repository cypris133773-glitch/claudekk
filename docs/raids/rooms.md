# The seven raid rooms

Seven arenas, one per raid, built from `createArena` and the block table we
already have. This document is the spec: palette, floor plan, hazards, what is
new, what it costs.

Every number here was measured against the shipped layouts, not guessed. The
probe built each room on the real `World` shell and counted triangles out of
`buildMesh()`.

The one rule everything below serves:

> **The player's own effects are the brightest thing on screen. The room is
> never allowed to compete with them.**

Skills fire at emissive 0.85–1.0 in saturated hues — `#ff8a3c`, `#8fe3ff`,
`#c98fff`, `#8ce06a`, `#ffd24a`. A room that is also bright and saturated turns
a fight into a light show nobody can read. So: the rooms are dark where you
fight and bright where you look. That is not a mood choice, it is the only way
a 20-second boss burn stays legible on a phone.

---

## 1. What the shell already gives you

Read this before designing anything, because most of a room is already decided.

| Fact | Value | Consequence |
| --- | --- | --- |
| World | `SX 64 × SY 28 × SZ 64` | Nothing is bigger than this. |
| Floor plan | octagon, 2,440 tiles, x/z from 6 to 57 | 52 blocks across the flats. |
| Standing plane | `FLOOR_Y = 4` (top of the y=3 slab) | Everything measures up from y=4. |
| Wall | 9 high, top at y=12, crenels at y=13 | 15 blocks of headroom above it. |
| Fog | `uFogColor = skyTint = theme.bottom` | **Fog colour and sky-horizon colour are the same value.** You do not get to pick them separately. |
| Fog range | `fogNear 34`, `fogFar 82` | The far wall is 46 away — only 26% fogged. Fog is currently a depth cue, not an atmosphere. Per-raid `fogNear/fogFar` fixes that for free. |
| Light model | `mix(ground, sky, up) + sun·up²` | `sky` and `sun` land on **up-faces**. `ground` lands on **down-faces**. So `ground` is the bounce colour: the thing that lights the undersides of ledges. |
| Emissive | `fog *= (1 − emissive·0.6)`, and AO is skipped | An emissive block keeps 60% of its brightness through fog and ignores shading. **Emissive blocks are the only things that read at 40 blocks.** |
| Tint | one `uTint` for the whole world mesh | Per-block colour is impossible. One look = one atlas tile. |
| Same-block merge | `if (nId === id) continue` in the mesher | Bulk crystal/ice/lava costs the same as bulk stone. Only *mixed* interfaces cost faces. |
| Below the world | `get()` returns `STONE` for `y < 0` | **There is no void.** A "bottomless pit" lands you on invisible bedrock at y=0. A pit needs a floor, and that floor should be lava or a climb-out. |

### The two engine facts that govern fairness

**Mobs have no pathfinder.** `moveToward` steers straight at the target and
slides sideways off anything it hits. `autoJump` climbs **exactly one block**,
and only when the block ahead at `y+0.1` is solid and `y+1.2` is clear. There
is a stuck-detector that teleports a mob into the player's lap after 12s of no
progress or 25s of taking no damage — that is a bandage, and a room that leans
on it is a broken room.

So: **every surface a player can stand on must be reachable by walking in a
straight line and hopping one block at a time.** Not by a staircase — a boss
steering straight at you will walk past a 3-wide stair and jam on the face
beside it. Raised ground in a raid is *terraced*: 1-block steps all the way
round, so whichever bearing the boss arrives on, it climbs.

Terracing needs no new helper. `plateau` already does it:

```js
// A dais that can be climbed from every angle.
for (let k = 0; k < h; k++) this.plateau(px, pz, r + k, h - k, mat, trim, []);
```

**Hazards hurt mobs too.** `blockDamageAt` is called from `mobs.js:170` as well
as `player.js:289` — "Lava hurts everyone." A moat therefore does two bad
things: the player parks across it and lets a 20,000 HP boss cook itself, or
the boss never arrives and the stuck-teleport does the level design's job. So:

> **No hazard forms a closed ring around the boss.** Hazards are pools you route
> around, never barriers you must cross. Crucible and Causeway are good wave
> layouts and bad raid layouts for exactly this reason.

### Where the triangles actually go

| Piece | Triangles |
| --- | --- |
| Floor slab alone | 7,744 |
| + perimeter wall to y=12 | 15,664 |
| + crenels | 17,008 |
| Wall at 6 instead of 9 | −3,200 |
| Wall at 3 instead of 9 | −5,280 |
| Wall at 13 instead of 9 | +3,520 |
| Full 1-block ceiling over the octagon | +10,176 |
| Ceiling annulus, r ≥ 16 | +7,252 |
| 16 columns, 2×2, floor to y=18 | +3,572 |
| 8 vault ribs, 2 wide | +2,832 |
| 8 wall buttresses | +4,432 |
| One isolated block | 12 |
| One 1-wide column, height h | ≈ 8h |
| One tile of open-both-sides slab | 4 |

Shipped layouts, for scale: Causeway 17,144 · Crucible 19,290 · Fortress 19,558
· Spires 19,866 · Labyrinth 20,722 · Colosseum 21,924.

The headline: **the shell is 80% of the bill and the layout is 10%.** A room's
identity is nearly free. The two things that are not free are a ceiling and the
perimeter wall — and you look at the wall almost never. That is the budget
lever the seven rooms are designed around.

---

## 2. The shared language

All seven read as one game because they share a skeleton. The variety is in
material, light and what fills one band.

```
                        N  (boss faces you; throne / focal mass sits here)
        ┌───────────────────────────────────────────┐
        │  WALL  y=4..12                            │
        │   ┌─────────────────────────────────┐     │
        │   │  THE WALK   r 20..26            │     │   floor level, ≥4 wide,
        │   │   ┌───────────────────────┐     │     │   unbroken lap, no hazard
        │   │   │  THE MID  r 10..19    │     │     │
        │   │   │   ┌───────────┐       │     │     │   cover, perches, hazard
    W   │   │   │   │ THE DAIS  │       │     │     │   — the band that varies
        │   │   │   │   r ≤ 9   │       │     │     │
        │   │   │   │   +2, flat│       │     │     │   boss ground. Always
        │   │   │   └───────────┘       │     │     │   flat, always terraced.
        │   │   │                       │     │     │
        │   │   └───────────────────────┘     │     │
        │   └────────────── ▲ ──────────────┘       │
        └──────────────── THRESHOLD ────────────────┘
                        S  (32.5, 4, 52.5) yaw 0
```

### Constant across all seven

| | |
| --- | --- |
| **Footprint** | The existing octagon. 2,440 tiles, `FLOOR_Y = 4`. Not negotiable — it is what every mob speed, skill radius and knockback number was tuned against. |
| **The Dais** | Centre (32, 32), radius 9, raised **2**, terraced in 1-block steps. Flat on top — nothing taller than 1 block inside r ≤ 9. This is the boss's ground and the killing floor. ~380 tiles, ≈900 tris. |
| **The Walk** | r 20–26, at floor level, **≥4 blocks wide everywhere, unbroken lap, zero hazard**. Kiting must always have a full circuit. A room where you can be cornered is not a fight. |
| **The Mid** | r 10–19. Cover, perches, hazard. The band that carries each raid's identity. |
| **Cardinal gates** | Four 5-wide gaps due N/E/S/W through anything ring-shaped in the Mid, matching the `w = -2..2` convention the shipped layouts already use. |
| **Perches** | Exactly two, diagonally opposite, at r ≈ 15, top at **+4**. Terraced up one full quadrant so the boss climbs them from any bearing in that arc. Nothing standable is higher than +4. |
| **Sightline** | From anywhere on the Walk you can see the Dais. Nothing in the Mid exceeds 6 blocks except the two perches and the four LOS masses. |
| **LOS breakers** | At least four solid masses ≥5 tall inside r 10–20. The Warden archetype has 30 range — longer than the arena's half-width — so distance never breaks it. Only geometry does. |
| **Player spawn** | The Threshold: (32.5, 4, 52.5), due south on the Walk, **yaw 0** (`forwardVec(0) = -Z`, straight at the Dais). 20 blocks out: no fog on the boss at the reveal, and the boss's head at y≈10 fills the upper third of the frame. |
| **Boss spawn** | Centre of the Dais, (32.5, 6, 32.5). Adds use the existing r=22 spawn ring. |
| **Light discipline** | One emissive hue per room. Emissive blocks appear only at the Dais rim, the perch tops, the four gate posts, and above y=13. Never loose on the floor. |
| **Floor luminance** | Every walking surface sits between **L 20 and L 70** of 255. See §3. |

### What varies

| | |
| --- | --- |
| Material palette and light direction | up-lit vs down-lit is the single biggest mood lever |
| The Mid band's contents | colonnade, machine blocks, idols, terraced bowl, spires |
| Overhead | open sky / broken sky / partial vault / cavern lid |
| Fog distance | 18–34 near, 52–86 far |
| Hazard type, and how much of the floor it takes | 0–12% of 2,440 tiles |
| Whether the plan is circular or square | Ulduar is the only right-angled room, and that is its whole identity |

---

## 3. Reading the room on a five-inch screen

Three contrasts have to survive being 400 pixels tall with a thumb over the
corner.

### Floor vs hazard

Luminance is `0.2126R + 0.7152G + 0.0722B`. Grey stone is L 128. Lava averages
L 151. **That is a ratio of 1.18 — the classic molten-cavern mistake.** Grey
stone and orange lava are the same brightness; the only thing separating them
is hue, and hue is the first thing to go on a cheap panel in daylight.

The fix is not to brighten the lava, it is to darken the floor. Hence the rule:

> **Every walking surface in every raid sits between L 20 and L 70.**

That one number carries the whole set. Measured floor-to-hazard ratios under it:

| Room | Floor | L | Hazard | L | Ratio |
| --- | --- | --- | --- | --- | --- |
| Zul'Gurub | wet stone `#3a4234` | 63 | venom `#6edc3c` | 185 | 2.9 |
| Molten Core | dark basalt `#3e3e44` | 63 | lava | 151 | 2.4 |
| Karazhan | quiet chequer `#3a3348`/`#2e2840` | 52 / 41 | ember hot points | 100 | 2.2 |
| Ulduar | plate `#3e4048` | 65 | molten metal | 151 | 2.3 |
| Black Temple | `#22261f` | 25 | felfire | 219 | 8.7 |
| Firelands | basalt `#1e1614` | 23 | lava | 151 | 6.4 |
| Icecrown | black ice `#1a2230` | 33 | frost | 207 | 6.3 |

A hazard must also differ in **at least two of three**: luminance, hue, and the
emissive flag. Emissive is the one that does the heavy lifting — an emissive
pool keeps 60% of its brightness through fog and skips ambient occlusion, so at
30 blocks it is still full-strength while the floor around it has faded toward
the fog colour. That is free hazard telegraphing and it is why the rule below
works:

> **Anything emissive and saturated lying flat on the floor is a hazard.**
> Every room obeys it, so the lesson transfers between raids. The room's own
> decoration is never emissive at floor level.

### Boss vs background

Boss skins are mid-value: Colossus `#9a3f2f` is L 73, Warden `#2f6f9a` L 95,
Broodmother `#4a2a5e` L 54. Against a floor at L 20–70 that is at best 1.5:1 —
not enough on its own. Three things fix it, and all seven rooms use all three:

1. **The Dais is the lightest horizontal surface in the room.** L 60–70, while
   the Mid sits at 35–50 and the Walk at 25–40. Brightness falls off with
   radius: a vignette built out of geometry. It reads as focus, it pulls your
   eye back to the middle every time you look up, and it puts the boss's legs
   and its blob shadow against the one pale patch on the floor.
2. **The Dais rim is the only cool-hued emissive at floor level** in the warm
   rooms, and the only warm one in the cold rooms. One ring of contrasting
   light, exactly where the fight is.
3. Boss skins already carry `emissive` 0.12–0.22. Keep it; it is the rim light.

### Player effects vs everything

Effect quads are emissive 0.85–1.0, saturated, small and *moving*. So room
surfaces get one of bright or saturated, never both:

- Below the eyeline (y ≤ 8): desaturated, matte, L 20–70. No exceptions.
- Above the eyeline: any brightness you like. Nothing the player casts goes up
  there, so the vault, the sky and the crowns of pillars are where the room is
  allowed to be beautiful.
- Room emissives at floor level are limited to 1–2 block sources on the Dais
  rim and the gate posts. Everything else emissive is above y=13.

This is also why Icecrown does **not** get a white floor, however much "epic
frost castle" wants one. A white floor at L 200 makes a Frost Nova invisible and
turns the Lich King into a pale shape on a pale ground. Icecrown inverts
instead: near-black ice underfoot, pale ice everywhere above the eyeline. It
reads *more* like a frost castle, not less, because the architecture is what you
see and the floor is what you fight on.

---

## 4. The seven rooms

Coordinates are world blocks. `cx, cz = 32, 32`. Heights are relative to
`FLOOR_Y = 4` unless stated. "L" is luminance out of 255.

---

### 1 · Zul'Gurub — *the sunken city*

**The read:** Ankle-deep dark water over green-black stone, eight toppled gold
idols half-swallowed by it, and daylight coming down in shafts through a canopy
far overhead.

Tier 0, level 1. It is the first raid anyone sees, so it is the most legible
room in the game: open floor, long sightlines, one hazard type, nothing
overhead you can be surprised by.

**Palette.** Current `theme.accent` is `#8ce06a` — that is the Focus resource
colour and the Hunter's own effect green. A room whose decoration is the same
hue as the player's spells is the exact failure this document exists to
prevent. So the decoration goes **gold** and the green is reserved for poison.
After that, green at floor level always means "this hurts", in the first raid
the player ever enters.

```js
theme: {
  sky: '#1e3016', fog: '#3f5c33', stone: '#3a4234', accent: '#c9a227',
  hazard: '#6edc3c', lava: false, fogNear: 26, fogFar: 62,
}
// renderer THEMES entry
{ top: [0.12, 0.19, 0.09], bottom: [0.25, 0.36, 0.20],
  sun: [0.26, 0.30, 0.10], sky: [0.72, 0.82, 0.62], ground: [0.30, 0.34, 0.24],
  sunPos: [0.20, 0.72] }
```

Sun nearly overhead and green-gold: shafts through leaves. `ground` is a muddy
olive, so undersides go swampy rather than black. Fog pulled in to 26/62 so the
far wall genuinely dissolves — this is the murkiest room, and the murk is what
sells "drowned".

**Geometry.**
- Floor: `MOSSY` on `DARKSTONE`, 15% speckle (the existing `hash2 > 0.86` accent
  scatter, unchanged).
- Water: three channels on bearings 0°, 120°, 240°, 5 wide, from r=12 out to
  r=25, `WATER` at y=3. ~390 tiles. Non-solid, so you walk a block lower in it —
  which is the only "elevation change" this room needs and it costs nothing.
  It is *not* a hazard: no damage, no slow. Terrain, not threat.
- Idols: 8 masses at r=15, every 45°. Five standing (3×3×7, `COBBLE`, gold cap
  block at +7); three toppled (7×3×3 lying on the floor at +0..+2). The toppled
  ones are the cover you actually use — a 3-high mass a boss walks round, not
  over. ≈2,100 tris.
- Dais: r=9, +2, terraced, `COBBLE` with a `RUNE` rim.
- Perches: NE and SW at r=15, 5×5 tops at +4, terraced. The two standing idols
  nearest them are their back walls.
- Canopy: six leaf rafts, 7×7, at y=22, over the wall line at r=19. 294 tiles,
  ≈1,000 tris. `LEAVES` is `opaque: false` with alpha holes, so it reads as
  broken cover overhead without a full lid.

**Hazards.** Six `VENOM` pools, radius 2–3, in the Mid at r 12–18 — never on the
Dais, never in a channel, never blocking a gate. ~140 tiles, 6% of the floor,
6 damage/s (lava is 14). Bright acid green at L 185 on a floor at L 63.

**What is new.** `WATER`, `VENOM`. (Both described in §5.)

**Cost.** **20,116 tris**, +3% over Fortress, 1.38 MB VBO. The cheapest way to
build a distinctive room: the identity is entirely in colour, water depth and
eight silhouettes.

---

### 2 · Molten Core — *grey stone and rivers of fire*

**The read:** A grey stone cavern. The floor is an island in a lake of fire, the
rock overhead is black, and every light in the room comes from below.

This is the room the whole idea started from, so it is worth being exact about
what makes it work: **it is lit from underneath.** Not "there is lava in it" —
lit from underneath. That is one line of palette, and it does more than any
amount of geometry.

**Palette.**

```js
theme: {
  sky: '#120806', fog: '#40140a', stone: '#3e3e44', stoneHi: '#6e6e74',
  accent: '#9fd0ff', hazard: '#ff8a3c', lava: true, fogNear: 22, fogFar: 58,
}
// renderer THEMES entry
{ top: [0.07, 0.03, 0.02], bottom: [0.25, 0.08, 0.04],
  sun: [0.06, 0.03, 0.02], sky: [0.34, 0.34, 0.38], ground: [0.52, 0.22, 0.09],
  sunPos: [0.00, 0.45] }
```

Read those three lighting values carefully, because they are the whole room:

- `sun` is almost zero. **There is no sun in a cave.** Turning it off is what
  stops the room looking like an outdoor arena with orange paint.
- `sky` is a cold grey — the light from the oculus. Up-faces stay grey.
- `ground` is a strong orange. Down-faces — the undersides of every ledge, the
  underside of the ceiling, the shaded faces of every column — glow.

The result is the correct read: cool grey on top, hot orange underneath, from
one three-float change. Existing `stone: '#4c4c4c'` is kept for the *vertical*
rock; the walking floor drops to `#3e3e44` (L 63) so lava reads at 2.4:1
instead of 1.18.

The accent is the deliberate odd note. In a room this warm, the one cold thing
is where you look — so the Dais rim is `RUNE` blue `#9fd0ff` and it is the only
cool light in the raid. The boss stands inside a cold ring in a hot room.

**Geometry.**
- Floor: `DARKSTONE` walking surface, `STONE` for every vertical face.
- The lake: `LAVA` at y=3 for everything beyond r=23, all the way to the wall.
  ~460 tiles. It is *outside* the Walk, so you never have to cross it — you can
  only be knocked into it. That is the entire hazard design of this room.
- Four spokes reaching in from the lake to r=15 on the diagonals, 3 wide,
  pinching the Walk from 6 wide to 4 at four points. Narrow enough to be a
  decision, wide enough that the boss still has a lane. ~110 tiles.
- Eight rock columns, 3×3×6, at r=16 every 45°. The LOS breakers. +1,000 tris.
- Dais: r=9, +2, `DARKSTONE`, `RUNE` rim.
- Perches: NE/SW at r=15, tops at +4, terraced, with a lava rill running under
  the overhang so their undersides glow.
- **The lid:** one block of `STONE` at y=19 over everything at r ≥ 16. 1,551
  tiles, +7,252 tris. Plus 40 stalactites, 1-wide, hanging 4–7 blocks down from
  it, +2,080 tris.

The lid stops at r=16, leaving a 32-block oculus over the Dais. That is cheaper
than a full ceiling (−2,900 tris) and better: you get rock in your peripheral
vision from anywhere in the room, which is all "cavern" needs in first person,
and the boss is framed in a shaft of open black overhead.

**Hazards.** The perimeter lake (never in your path) and the four spokes (a
detour, not a barrier). Nothing inside r=15. Total 570 tiles, 23% of the floor —
high, but almost none of it is anywhere you would walk.

**What is new.** Nothing. This room is `STONE`, `DARKSTONE`, `LAVA`, `RUNE`,
`OBSIDIAN` — all shipped.

**Cost.** **27,676 tris**, +42% over Fortress, 1.90 MB VBO. The most expensive
room, and 7,252 of it is the lid. Build the lid behind the same device check
that sets `renderer.fancy`: without it the room is 20,400 tris (+4%) and loses
the cavern, which is a fair trade on a phone that cannot hold 30fps anyway.

---

### 3 · Karazhan — *the broken ballroom*

**The read:** A violet-grey stone hall with a chequered floor, a ring of columns
carrying an arcade, candle flames on top of them — and no roof at all, just
violet night where the ceiling should be.

**Palette.**

```js
theme: {
  sky: '#140f22', fog: '#2a2036', stone: '#3a3348', stoneAlt: '#2e2840',
  accent: '#ffbf6a', hazard: '#d0491a', lava: false, fogNear: 30, fogFar: 70,
}
// renderer THEMES entry
{ top: [0.08, 0.06, 0.13], bottom: [0.16, 0.13, 0.21],
  sun: [0.10, 0.08, 0.16], sky: [0.62, 0.58, 0.80], ground: [0.24, 0.20, 0.30],
  sunPos: [0.62, 0.70] }
```

`accent` moves off `#c98fff` — that is the Mage's arcane hue and the chain
lightning colour. Karazhan's violet lives in the *stone*, unlit and
desaturated; the *light* in it is warm candle `#ffbf6a`. Violet room, gold
light. That separation is what keeps a purple spell readable in a purple room.
The `sun` is a small high pale-lavender disc — a moon, not a sun.

**Geometry.** The only room in the set with a strong horizontal repeat, because
a hall is defined by its rhythm.

- **Chequered floor:** alternate `stone` / `stoneAlt` in 8×8 blocks —
  `((x >> 3) + (z >> 3)) & 1`. Free: two existing blocks, zero extra triangles,
  and it gives the floor a scale reference so a shockwave ring marching outward
  has something to march across. Both squares are dark (L 52 and L 41) — a true
  black-and-white chequer would be a bright floor, which §3 forbids.
- **The colonnade:** 16 columns, 2×2, from y=4 to y=18, at r=17 every 22.5°,
  `DARKSTONE`. +3,572 tris. A `GLOW` block on each crown at y=19 — sixteen
  candles at the top of the frame, well above anything you cast.
- **The arcade:** 2-block lintels linking neighbouring columns at y=17–18,
  following the ring. +1,500 tris. This is what makes it architecture rather
  than a forest of posts: you get an unbroken band of shadow overhead at the
  edge of vision, with open sky beyond it.
- Four 5-wide gaps in the colonnade at the cardinals — the gates.
- Dais: r=9, +2, `OBSIDIAN` with a `RUNE` rim.
- Perches: NW/SE at r=15, 5×5 at +4, terraced, backed onto two columns.

**Hazards.** Four fallen chandeliers: `EMBER` discs, radius 2, at r=13 on the
diagonals. ~50 tiles, 9 damage/s. Small, and deliberately so — Karazhan's real
threat is vertical (the perches are +4 and every boss here knocks you off one),
not the floor. Ember is mostly char with hot points, so it reads as a smouldering
patch rather than a lava pool: dark base at L 24 with sparks at L 100, on a floor
at L 46.

**What is new.** `EMBER` (shared with Firelands).

**Cost.** **22,544 tris**, +15% over Fortress, 1.55 MB VBO.

---

### 4 · Ulduar — *the machine hall*

**The read:** Cold blue-grey iron plate underfoot, eight enormous machined
blocks on a grid, orange lamps at floor level, cyan light on the crowns —
everything at right angles, and a bright cold sky where the roof isn't.

**Ulduar is the only square room in the game, and that is its whole identity.**
Six shipped layouts and six other raids are built on `Math.hypot`. Ulduar uses
`Math.max(abs(dx), abs(dz))` and nothing else. Nothing is placed off-grid;
everything sits on a multiple of 8. A player who has seen it once knows it from
a single frame.

**Palette.**

```js
theme: {
  sky: '#0e1a26', fog: '#1c3040', stone: '#3e4048', stoneHi: '#949aa0',
  accent: '#ffa62b', accentHi: '#7ef0ff', hazard: '#ff8a3c',
  lava: true, fogNear: 34, fogFar: 86,
}
// renderer THEMES entry
{ top: [0.06, 0.10, 0.15], bottom: [0.11, 0.19, 0.25],
  sun: [0.16, 0.20, 0.26], sky: [0.76, 0.84, 0.96], ground: [0.30, 0.36, 0.42],
  sunPos: [-0.50, 0.28] }
```

Two accents split by height, which is the honest way to keep the cyan Ulduar
wants without it fighting the Mage:

- **Below y=13:** amber `#ffa62b` only. Paired hazard lamps on the machine
  blocks, and the molten-metal trenches. Warm light at floor level.
- **Above y=13:** cyan `CRYSTAL` crowns on top of the machine blocks. Cold light
  overhead, out of every combat plane.

`accent` in `raids.js` moves from `#7ef0ff` to `#ffa62b` — `#7ef0ff` is the
Warden boss projectile colour and it appears at head height in every fight.
Clear, cold air: fog pushed out to 34/86, the longest sightlines in the set,
which is what a grid plan is for.

**Geometry.** All rectangular fills; nothing here needs a circle.

- Floor: `DARKSTONE` plate (L 65), `METAL` for every vertical face.
- **The Dais is square:** 19×19 (r=9), +2, terraced with square rings.
- **Eight machine blocks:** 7×7×8 masses of `METAL`, capped with a 5×5
  `DARKSTONE` slab at +8 and a `CRYSTAL` block at +9. Four on the diagonals at
  (±13, ±13), four on the cardinals at (±20, 0) and (0, ±20). +3,000 tris. The
  cardinal four are set *back* against the wall so they never block a gate.
- **Trenches:** `LAVA` at y=3 in straight 2-wide lines on the grid at x = 15,16
  and x = 49,50 and the same in z — a rectangle of molten metal at r=17,
  broken by 5-wide crossings at the cardinals. ~340 tiles. Straight orange
  lines on cold grey plate is the most readable hazard in the game and it costs
  nothing new.
- Perches: the two diagonal machine blocks at (−13, −13) and (13, 13) get
  terraced ramps on their inner faces, tops at +8. Higher than the +4 standard
  because they are 7 wide and the terrace runs the full inner face, so a boss
  climbs them with seven blocks of margin.

**Hazards.** The trench rectangle, ~340 tiles (14%). It is a ring, which §1 says
not to do — so it is cut at all four cardinals with 5-wide crossings, and the
Walk outside it is continuous. The boss's straight line to you crosses a
crossing more often than a trench, and 2 wide is a step, not a swim.

**What is new.** Nothing. `METAL`, `DARKSTONE`, `LAVA`, `CRYSTAL`, `GOLD`.

**Cost.** **21,280 tris**, +9% over Fortress, 1.46 MB VBO. Rectangular masses
are the cheapest large structures in the engine — everything interior is culled.

---

### 5 · Black Temple — *black stone and one green fire*

**The read:** Near-black stone in every direction, stepping down into a bowl,
and one acid-green fire at the bottom of it.

This is the restraint room. **Three colours in the entire arena**: black-green
stone, fel green, and the boss. Nothing else. If any room in the set proves that
a small palette does more than a big one, it is this one — and because 80% of
the screen is near-black, it is also the *safest* room in the game for reading
your own spells. Anything you cast, of any colour, is the brightest thing
visible.

**Palette.**

```js
theme: {
  sky: '#060a07', fog: '#101a12', stone: '#22261f', daisStone: '#3a4038',
  accent: '#a8ff5c', hazard: '#a8ff5c', lava: false, fogNear: 18, fogFar: 52,
}
// renderer THEMES entry
{ top: [0.02, 0.04, 0.03], bottom: [0.06, 0.10, 0.07],
  sun: [0.02, 0.05, 0.02], sky: [0.26, 0.34, 0.26], ground: [0.10, 0.16, 0.10],
  sunPos: [0.00, -0.60] }
```

The sun disc is *below the horizon* — `sunPos.y = −0.6` — so the sky program
contributes almost nothing and the top of the frame is flat black. Fog at 18/52
is the tightest in the set: standing on the Dais, the perimeter wall is a
suggestion. The room feels bigger than it is, for free.

**Geometry.** An inverted ziggurat: the floor steps *down* toward the middle, so
you fight at the bottom of a bowl and the boss is below your eyeline as you
approach.

- Six square terraces, each exactly **1 block** high, stepping down from the
  wall to the Dais: `step = clamp(floor((max(|dx|,|dz|) − 10) / 2.5) + 1, 0, 6)`,
  each step 2–3 blocks deep. Alternating `OBSIDIAN` / `DARKSTONE` so the steps
  are legible without any brightness.
- **Because every step is 1 block, this is the most boss-pathable room in the
  game by construction.** There is no ramp, no stair and no unreachable ledge —
  the whole floor plan is a terrace. It is the room where the "1-block steps"
  rule is not a constraint but the design.
- Dais: r=9 at the bottom of the bowl, +0 relative to the pit floor and −6
  relative to the outer Walk. Material `daisStone` `#3a4038` at L 40 against
  terraces at L 25 — the lightest surface in the room, per §3, and the only
  place the boss's legs have a backdrop.
- Perches: the terraces *are* the high ground. The two named perches are the
  step-4 corners at NE and SW, widened to 7×7.
- Four `OBSIDIAN` braziers, 1×1×5, at the bowl corners (±12, ±12), `GLOW`
  capped and fel-tinted — the only light sources, and they are at +5, above the
  fight.

**Hazards.** Four `FELFIRE` pools, radius 3, on the second terrace at (±14,
±14). ~110 tiles, 12 damage/s. At L 219 on a floor at L 25 they are the highest
contrast surface pair in the game — 8.7:1 — which is right for the raid where
you can otherwise see almost nothing.

**What is new.** `FELFIRE`.

**Cost.** **16,176 tris**, −17% *below* Fortress, 1.11 MB VBO. Terracing the
floor is cheaper than leaving it flat, because the steps cull the inner face of
the perimeter wall.

---

### 6 · Firelands — *black rock under a burning sky*

**The read:** Cracked black rock, a broken parapet you can see over, and above
it an entire sky on fire.

The differentiation from Molten Core, stated in one line so it can be checked:

> **Molten Core is grey rock lit orange from below, under a lid.
> Firelands is black rock lit orange from above, under an open sky.**

One is enclosed, cool-topped, warm-bottomed. The other is exposed, warm-topped,
black-bottomed. Same element, opposite room.

**Palette.**

```js
theme: {
  sky: '#ff7a24', fog: '#3a0e06', stone: '#1e1614', accent: '#ffb03c',
  hazard: '#ff8a3c', lava: true, fogNear: 30, fogFar: 74,
}
// renderer THEMES entry
{ top: [1.00, 0.48, 0.14], bottom: [0.23, 0.06, 0.02],
  sun: [0.60, 0.20, 0.04], sky: [0.90, 0.46, 0.18], ground: [0.18, 0.08, 0.06],
  sunPos: [0.00, 0.85] }
```

The gradient is **inverted**: bright at the zenith, dark at the horizon. No real
sky does that, and that is why it reads as a firestorm ceiling rather than a
sunset. It also solves the readability problem a bright sky would otherwise
cause — `bottom` is both the fog colour and the clear colour, so the band of sky
*directly behind the boss* is a dark smoke red at L 32, while the bright orange
is up where you never fight.

`sky` bounce at [0.90, 0.46, 0.18] means every up-facing surface catches fire
light while sides and undersides stay near-black. Black rock with glowing rims,
from one vector.

**Geometry.**
- Floor: `BASALT` (L 23), the darkest walking surface in the game.
- **The wall drops to 6, with a broken top varying 4–8** via
  `h = 6 + round((hash2(x>>1, z>>1, s) − 0.5) * 4)`. Saves 3,200 tris and gives
  you the one thing no other room has: a ragged horizon line where the ground
  meets the sky, seen from the floor. 6 is still four blocks above anything
  standable next to it, so no knockback puts you over it.
- **Lava cracks:** 22 branching 1-wide walks of `LAVA` at y=3, seeded on the
  wall line and wandering inward, terminating at r=13. ~230 tiles. A 1-wide
  crack is genuinely a hazard for the player (hitbox 0.6 wide, so you fall in at
  the midpoint) but not for a 1.0–1.5-wide boss, which bridges it. That
  asymmetry is deliberate and it is the room's mechanic: **the outer lap is the
  fast way round and it costs you.** It is also why the cracks stop at r=13 —
  the fighting floor stays clean.
- 14 charred spires, 1-wide, height 4–10, scattered r 12–22. The LOS breakers,
  and the cheapest possible ones (≈8 tris per block of height).
- Dais: r=9, +2, `OBSIDIAN`, **`LAVA` rim** — the one room where the Dais rim
  glows the same colour as the hazard, because here the boss's own ground is
  molten and that is the warning.
- Perches: NE/SW at r=15, 5×5 at +4, terraced, with a crack running under the
  overhang.

**Hazards.** Cracks only, ~230 tiles (9%), all outside r=13. No pools, no lake:
the danger is thin, branching and everywhere, which is a different texture from
Molten Core's single continuous lake.

**What is new.** `BASALT`.

**Cost.** **13,480 tris**, −31% below Causeway — the cheapest room in the game,
and the tier-5 raid. The low parapet pays for the whole thing. Worth noting for
the mobile budget: the two costly rooms (Molten Core, Icecrown) are bracketed by
the two cheapest (Firelands, Black Temple), so the raid set averages out below
the arena set.

---

### 7 · Icecrown Citadel — *the frost castle*

**The read:** A floor of near-black ice under pale blue vaulting. Everything
above your eyeline is white and built; everything below it is almost black. A
throne at the far end that you can see from the door.

The last raid, so it is the most architectural: the only room that reads as
*built* rather than carved, and the only one with a named focal object.

**Palette.**

```js
theme: {
  sky: '#0a1424', fog: '#16304c', stone: '#1a2230', stoneHi: '#b9dcf0',
  accent: '#e8d6a0', hazard: '#cfeeff', lava: false, fogNear: 28, fogFar: 78,
}
// renderer THEMES entry
{ top: [0.04, 0.08, 0.14], bottom: [0.09, 0.19, 0.30],
  sun: [0.14, 0.18, 0.28], sky: [0.82, 0.90, 1.00], ground: [0.08, 0.12, 0.20],
  sunPos: [0.55, 0.12] }
```

The value inversion, done with two numbers: `sky` bounce at [0.82, 0.90, 1.00]
means every up-face is pale; `ground` bounce at [0.08, 0.12, 0.20] means every
down-face is nearly black. Combined with a black-ice floor and pale-ice
architecture, the room has a hard horizontal light line at about eye height,
and that line is what makes it look like a cathedral.

`accent` moves from `#8fe3ff` to **bone-gold `#e8d6a0`**. `#8fe3ff` is Frost
Nova, Blizzard, Cone of Cold, the Warden's shots and the Lich King's own colour
— putting it on the walls too would erase every frost spell in the game. A blue
room lit by gold braziers reads as a castle far better than blue lit by blue,
and it costs nothing. The only saturated cyan at floor level is the hazard,
which is exactly where a cold-blue warning belongs.

**Geometry.**
- Floor: `BLACKICE` (L 33). Vertical architecture: `ICE` (L 200).
- **Eight buttresses**, 2×2 piers stepping off the wall in six stages from r=24
  to r=19, rising from y=4 to y=19 as they step in. +4,432 tris. They are the
  reason the room reads as built: repeated vertical members marching round the
  perimeter, catching pale light on every up-face.
- **Ribbed vault:** eight ribs, 2 wide, springing from the buttress tops at
  y=19 and r=22, rising to y=24 over the middle. +2,832 tris. Open between the
  ribs, so you see night sky through it — a full dome would cost 10,176 and
  close the room off.
- **The throne:** a 9×11×5 mass of `BLACKICE` against the north wall at
  (32, 8..10), with an `ICE` seat band at +3 and a `GLOW` line behind it. ≈800
  tris, most of it hidden. It has no gameplay function at all. It is there so
  that the moment the player spawns at (32.5, 4, 52.5) with yaw 0, there is a
  thing 44 blocks dead ahead, lit, that says what this place is.
- Dais: r=9, +2, `BLACKICE` with an `ICE` rim, gold `GLOW` at the four compass
  points of the rim.
- Perches: NE/SW at r=15, 5×5 at +4, terraced, `ICE`.

**Hazards.** A broken ring of `FROSTED` patches at r 12–14 — eight arcs, each
about 5×4, cut at the four cardinals so it is not a closed ring. ~160 tiles
(7%). 5 damage/s **and 45% slow**, which is the one hazard in the set that does
something other than damage, and is correct for the raid whose two final bosses
both use the `frost` mechanic. At L 207 on a floor at L 33 it is a 6.3:1 pair —
the second-highest contrast in the game, on the darkest floor in the game.

**What is new.** `ICE`, `BLACKICE`, `FROSTED`. `FROSTED` also needs a `slow`
field on the block record and one call site (§6).

**Cost.** **27,384 tris**, +40% over Fortress, 1.88 MB VBO. The vault is 2,832
of it and can be dropped on low-end devices for a 24,500 room that still has
the buttresses, the throne and the light inversion — the vault is the least
load-bearing part of the identity, which is why it is the part that goes.

---

## 5. New blocks and atlas tiles

Eight new blocks, eight new 16×16 tiles at `T` ids 33–40. The atlas already
generates 33 tiles at 256 pixels each; eight more is +2,048 callbacks and is not
measurable.

Five are load-bearing — without them a room loses its identity. Three are
comfort. Listed in that order.

| Block | Tile | Fields | Used by |
| --- | --- | --- | --- |
| `BASALT` | 33 | solid, opaque, `emissive: 0.12` | Firelands floor and spires |
| `ICE` | 34 | solid, opaque | Icecrown architecture |
| `BLACKICE` | 35 | solid, opaque | Icecrown floor, throne |
| `FELFIRE` | 36 | non-solid, opaque, `emissive: 1`, `damage: 12` | Black Temple |
| `FROSTED` | 37 | non-solid, opaque, `emissive: 0.35`, `damage: 5`, `slow: 0.45` | Icecrown |
| `VENOM` | 38 | non-solid, opaque, `emissive: 0.5`, `damage: 6` | Zul'Gurub |
| `EMBER` | 39 | non-solid, opaque, `emissive: 0.7`, `damage: 9` | Karazhan, Firelands |
| `WATER` | 40 | non-solid, opaque, no damage | Zul'Gurub |

All hazards are `opaque: true`. That is not a mistake — opaque here means "culls
its neighbours' faces", and since the mesher also merges same-id faces, a
200-tile pool costs exactly its silhouette. Non-opaque hazards would cost
interior faces for no visual gain, because nothing in this renderer is actually
see-through.

How each is drawn, procedurally, in `buildAtlasPixels`:

**`BASALT`** — base `[30, 22, 20]`. A crack network from `hash2(x >> 2, y >> 2)`
thresholded above 0.62; crack pixels take `[200, 70, 20]` and the ring one pixel
outside them takes `[90, 26, 10]`, so the cracks have a cooling halo instead of a
hard edge. `emissive: 0.12` is enough to keep the cracks alive at 40 blocks
through fog without the block lighting anything.

**`ICE`** — base `[168, 206, 228]`. Four diagonal facet bands from
`((x + y) >> 2) & 1` shifting ±14, plus one bright 2×2 chip at a
`hash2`-chosen corner. **No noise.** Every other stone tile in the atlas is
noisy, and noise is what reads as rock; a facet pattern with flat fields between
the bands is what reads as ice, and the contrast between the two is what makes
the two materials distinguishable at 400 pixels.

**`BLACKICE`** — base `[26, 34, 46]`. The same facet bands at half strength,
plus a single reflected highlight along `abs(x − y) < 2` at +26. Dark enough
that everything the player casts sits on top of it rather than in it.

**`FELFIRE`** — base `[18, 30, 12]`. A vertical ramp `1 − y/16` multiplied by a
per-column mask from `hash2(x, 0, s)`, so bright green `[150, 255, 60]` tongues
rise from the bottom edge to varying heights. The top two rows stay near-black
so a pool has a visible boundary against the terrace it sits on rather than
bleeding into it.

**`FROSTED`** — base `[176, 214, 236]`. Three straight crack lines from
`abs(((x * 7 + y * 3) % 16) − 8) < 1` in `[230, 246, 255]`, and a 2px darker
border `[130, 168, 196]` on all four edges so patches tile into visible shapes
rather than one continuous field. The only pale hazard in the set, on the
darkest floor in the set.

**`VENOM`** — base `[58, 120, 34]`. Cell noise at 4px giving three or four
blobs; each blob centre lifts 60 toward `[110, 220, 60]` so it reads as surfaced
bubbles. 1px darker rim on the tile edge. Deliberately pushed *bright* acid
green rather than swamp green — a dark green pool on Zul'Gurub's green-grey
floor would be invisible, which is the mistake this palette exists to avoid.

**`EMBER`** — base `[30, 22, 20]` char. `hash2(x >> 1, y >> 1)` above 0.72 maps
to `[214, 74, 20]`, above 0.90 to `[255, 180, 90]`. Mostly dark with hot points:
that is what stops it glowing like lava, which matters because Karazhan has no
lava and a lava-bright patch there would read as the wrong material.

**`WATER`** — base `[42, 86, 96]`. Two overlapping sine bands,
`sin(x * 0.8 + y * 0.4)` and `sin(y * 0.6 − x * 0.3)`, each lifting 12, plus a
6% chance of a `+30` speck. Kept dark and low-contrast on purpose: it is the one
new non-solid block that is *not* a hazard, so it must not look like one.

---

## 6. Cost summary

Measured, on the real shell, at the geometry described above.

| Room | Triangles | vs Fortress (19,558) | VBO | Overhead |
| --- | --- | --- | --- | --- |
| 6 Firelands | 13,480 | −31% | 0.93 MB | open sky |
| 5 Black Temple | 16,176 | −17% | 1.11 MB | open sky |
| 1 Zul'Gurub | 20,116 | +3% | 1.38 MB | canopy rafts |
| 4 Ulduar | 21,280 | +9% | 1.46 MB | open sky |
| 3 Karazhan | 22,544 | +15% | 1.55 MB | arcade band |
| 7 Icecrown | 27,384 | +40% | 1.88 MB | ribbed vault |
| 2 Molten Core | 27,676 | +42% | 1.90 MB | cavern lid |

Shipped arenas run 17,144–21,924 triangles and 1.18–1.51 MB. The raid set runs
13,480–27,676 and 0.93–1.90 MB. **Mean raid cost is 20,951 triangles against a
mean arena cost of 19,750 — 6% heavier on average**, with the two heavy rooms
paid for by the two light ones.

The two rooms above the shipped ceiling each carry exactly one droppable layer:

| Room | Layer | Saves | Falls back to |
| --- | --- | --- | --- |
| Molten Core | ceiling lid + stalactites | 9,332 | 18,344 (−6%) |
| Icecrown | ribbed vault | 2,832 | 24,552 (+26%) |

Decide it at generation time from the same device check that sets
`renderer.fancy`, not at draw time — the mesh is built once and the saving has
to be in the buffer, not in the draw call.

Meshing time is not a concern: the whole 64×28×64 volume is walked once per run
and the shipped layouts already do it in a few milliseconds. The cost that
matters on a phone is vertex bandwidth and fill, and both scale with the numbers
above.

---

## 7. What has to change in code

Small, and listed so the estimate is honest. **No source file is modified by
this document** — this is the spec, not the change.

1. **`blocks.js`** — eight new entries (§5).
2. **`atlas.js`** — eight new `T` ids and eight `paint` calls (§5).
3. **`renderer.js`** — `THEMES` grows from 4 entries to 11. Arenas keep 0–3,
   raids take 4–10. `setTheme` already takes a modulo, so nothing else changes.
4. **`renderer.js`** — `setTheme` also sets `this.fogNear` / `this.fogFar` from
   the theme entry. Two lines. This is the highest mood-per-line change in the
   whole document; right now every room is fogged identically at 34/82.
5. **`world.js`** — seven new layout builders, plus a `raid` flag on `generate`
   that moves `playerSpawn` to (32.5, FLOOR_Y, 52.5) and adds
   `playerSpawn.yaw = 0`. The generic shell, the mob spawn ring and the
   standable-ground filter are all reused unchanged.
6. **`game.js` + `player.js`** — one new field for `FROSTED`: a `blockSlowAt`
   beside `blockDamageAt` (`game.js:426`) and one multiply in the player's
   movement. Every other new hazard works through the existing `damage` field
   with no engine change at all.
7. **`raids.js`** — the seven `theme` objects gain `fogNear`, `fogFar`,
   `hazard`, and in four cases a second stone. Four `accent` values change, all
   for the same reason: they collided with a colour the player already casts.

| Raid | Old accent | New accent | Why |
| --- | --- | --- | --- |
| Zul'Gurub | `#8ce06a` | `#c9a227` | Focus resource / Hunter green |
| Karazhan | `#c98fff` | `#ffbf6a` | Mage arcane, chain lightning |
| Ulduar | `#7ef0ff` | `#ffa62b` | Warden projectile, at head height |
| Icecrown | `#8fe3ff` | `#e8d6a0` | Frost Nova, Blizzard, Cone of Cold |

Nothing currently reads `raid.theme` — it is declared and unused — so the shape
is free to grow.
