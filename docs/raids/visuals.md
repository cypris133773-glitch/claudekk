# Raid bosses: what they look like

Forty-two bosses, seven rooms, one humanoid model, zero binary assets. This
document fixes the visual identity of every raid roster, the exact skin block
each boss is built from, the tiles that have to be added to the atlas, and the
rules that keep a boss's attacks distinguishable from the player's own.

It is a spec, not a change. **No source file is modified by this document.**

Two documents constrain it and both win where they disagree:

- `docs/raids/rooms.md` fixes each raid's palette, floor luminance and accent.
  Four accents were re-picked because they collided with a colour the player
  casts. A boss is designed *against* its room, so the room's palette is an
  input here, never something to renegotiate.
- `docs/raids/mechanics.md` §2 fixes the telegraph vocabulary: three danger
  colours keyed to the action, three shapes, three durations. Boss effects
  speak that vocabulary. They do not get private colours.

---

## 0. What the model can actually do

Everything below is built from `drawHumanoid` in `src/game/entity.js` and
nothing else. It is a short vocabulary and it is worth being exact about it
before spending it, because most of the interesting choices here are forced by
these six facts.

**A skin is nine colours and a handful of tiles.**

```js
{ head, body, arm, leg,          // required: [r,g,b] floats, via hex()
  hat, horns, pauldrons,         // optional: presence adds the part
  headTile, bodyTile, armTile, legTile, hatTile, hornTile, pauldronTile,
  faceTile, faceUntinted,
  emissive, alpha, scale, trail, trailColor }
```

**Colour is a multiply, not a paint.** The fragment shader is
`rgb = tex.rgb * uTint.rgb` (`src/render/gl.js:51`). The tile decides the
*pattern* and the ceiling; the colour decides the hue and can only ever darken.
`T.BONE` is `[224,220,200]`, so a bone colour of `#e0dcc4` lands at almost
exactly the tile's own value; `T.SKIN` and `T.CLOTH` are near-white, which is
why every shipped mob's colour reads as-written on those two tiles and reads
much darker on `T.METAL` (`[148,152,160]`, a 0.58 multiplier). **Every hex in
§2 is the value after that multiply has been accounted for.** Where a boss uses
a dark tile the colour is pushed up to compensate.

That multiply is also the trick that makes a lit face possible. The head colour
tints the head cube *and* the face slab. So:

> **Put the brightness in the head colour and the darkness in the tile.**
> A near-black `headTile` with a near-white eye rectangle in the `faceTile`
> gives a dark head with eyes at exactly the head colour. That is the whole
> mechanism behind Black Temple's rosters, and it is why §4 adds `FACE_SLOT`.

**Emissive is per-entity, not per-part.** `common` carries one `emissive` into
every box of the model. There is no way to make only the chest glow. A "molten
core" is therefore a *tile* whose hot pixels are baked bright, plus a modest
whole-body emissive to carry it through fog. Emissive also lerps the light
toward white (`gl.js:62`) and cancels 60% of fog, so it flattens shading — over
about 0.4 a boss stops having a readable silhouette and becomes a bright
cut-out. **0.40 is the hard ceiling; the roster sits at 0.10–0.38.**

**Alpha is per-entity too**, and it applies to the whole model including horns
and pauldrons. Below about 0.55 a translucent boss stops occluding the floor
behind it and becomes hard to aim at, so **0.62 is the floor for alpha.**
Separately, tile alpha under 0.35 is *discarded* (`uCutoff`), so a tile with
holes punched in it (`T.LEAVES` does this) gives a dissolving body at full
opacity — a different and cheaper effect than `skin.alpha`, and the one
`SPECTRAL` in §4 uses.

**The drawn model is taller than `height`.** Legs, body and head are
`0.72 + 0.75 + 0.50 = 1.97` units, and `unit = height / 1.8 * scale`, so:

```
drawn height   = 1.094 × height × scale      (feet stay at e.y)
shoulder span  = (0.55 + 2 × 0.24) × unit = 0.572 × height × scale
```

A `height: 5.2` boss draws **5.7 blocks tall and 3.0 wide at the shoulders.**
Pauldrons add another `0.24 × unit` a side. The hitbox `width` is unrelated to
any of that and is always much narrower — `colossus` is 1.5 wide with a 2.4
block span — which is correct: you should be able to run past a giant's arm.

**The camera is at eye height on a 28-block room.** Past about 6 blocks drawn,
a boss's head leaves the frame at melee range and you fight a pair of legs.
**So: `1.094 × height × scale ≤ 5.8`, i.e. `height ≤ 5.3` at `scale 1`.** That
is the single hardest cap in this document and no boss is allowed to break it,
including the last boss of the last raid.

**Horns, pauldrons and the hat are the silhouette.** They are the only three
things that change the outline, they cost 8, 2 and 1 extra boxes, and at 390px
they are the entire difference between "a big enemy" and "*that* enemy". Colour
is the second read, always. The comment already in `entity.js` says it: horns
are "the cheapest way to make a humanoid box read as a monster", pauldrons are
what "makes a heavy enemy look heavy without changing its hitbox".

---

## 1. Seven identities

One rule per raid, applied to all six of its bosses, chosen so the family reads
against that room's floor and fog rather than in the abstract.

The value rule that generates most of these: **a boss's body luminance must
differ from its room's floor luminance by at least 1.8:1 in one direction or
the other.** Floors are locked at L 20–70 by `rooms.md` §3, so a room with a
light floor gets dark bosses and a room with a black floor gets pale ones. Where
that is impossible (Zul'Gurub, Icecrown) a high-value trim — bone, ice — carries
the contrast locally instead.

| Raid | Floor L | Body L | Colour family | Silhouette rule | The one feature |
| --- | --- | --- | --- | --- | --- |
| Zul'Gurub | 63 | 30–45 | bruised crimson, plum, wet hide, bone | lean and tall; narrow hitboxes | **Horns.** All six. |
| Molten Core | 63 | 22–38 | charcoal, ash, banked orange | squat, smooth, no appendages | **Emissive core** (`BASALT` seams) |
| Karazhan | 46–52 | 95–170 | ivory, ash-lavender, cold steel | narrow, tall, top-light | **Translucency** + a hat on every one |
| Ulduar | 65 | 30–48 | iron, bronze, one steel-cyan | rectangular; widest hitboxes in the game | **Plate** + pauldrons on all six |
| Black Temple | 25 | 16–30 | black-plum, one hot hue each | top-heavy wedge | **The lit face** — brightest pixel on the model |
| Firelands | 23 | 130–175 | ash-white body, charcoal limbs | mass low and wide | **Inverted value** — pale bosses on the darkest floor |
| Icecrown | 33 | 70–105 | pale steel-blue, bone, ice white | armoured, upright, crowned | **Rime** — `ICE` growths on plate |

### 1 · Zul'Gurub — horned, and the only green in the room is poison

The room is olive-green stone at L 63 with gold idols, and the hazard is acid
green. Two colours are therefore spent: green means "this hurts", gold means
"this is scenery". The roster takes what is left and takes the complement of the
floor: **bruised crimson and plum bodies at L 30–45, bone-white masks and horns
at L 215.** Against a green floor a red-brown boss is a 1.6:1 value pair but a
near-complementary hue pair, and the bone carries the local contrast where the
value does not: every mask and every horn is the brightest thing on the model by
a factor of five.

All six are horned. Nothing else in the game is horned until Black Temple, four
tiers later, so "horns" is genuinely a tier-0 signature rather than a decoration.
The horns are also the tell for how far into the raid you are: 3-segment stubs on
the first boss, and the sixth's read as a crown.

Silhouette: **lean.** Hitboxes 0.7–1.2 apart from the fifth, which is the beast
and breaks the rule on purpose.

### 2 · Molten Core — charred outside, lit from within

The room is grey rock lit orange *from below*, with a cold blue rune ring on the
Dais. So the boss must not be orange: a big orange mass in a room whose entire
lighting model is orange bounce disappears into it, and the lava is already the
saturated warm thing.

Instead the whole roster is **charcoal at L 22–38, drawn on `BASALT`** — the
tile `rooms.md` §5 already adds for the Firelands floor, base `[30,22,20]` with a
cracked network of `[200,70,20]` and a cooling halo. On a body-sized box it reads
as a crust with fire under it. Whole-body `emissive` 0.22–0.38 carries those
cracks through the room's tight 22/58 fog, and because emissive also skips fog by
60%, a Molten Core boss is legible from the Threshold at 20 blocks while the
floor around it has already gone red-brown.

No horns, no pauldrons, no hats on five of six. The silhouette is **smooth and
squat** — a mass, not a monster — because the tile is doing all the work and any
appendage would break the crust up into pieces. That absence is the family
resemblance.

### 3 · Karazhan — the household, still here

Violet-grey stone, gold candlelight overhead, no roof. It is the only room whose
floor is genuinely mid-value (L 46–52), and the only one where the light source
in the fiction is warm and above you. So Karazhan inverts everything: **pale
bosses, L 95–170, translucent at alpha 0.62–0.88.**

The `SPECTRAL` tile (§4) has holes punched below the alpha cutoff, so the bodies
are *perforated* as well as translucent — a ghost you can see the chequered floor
through in two ways at once. Combined with the room's ember hazard being dark and
low-contrast, the six bosses are unambiguously the brightest thing in the room
apart from what the player casts, which is the correct order.

Every one of them has a hat. It is the only raid where the hat slot is used
across the board, and on a translucent model that flat slab above the head is
the most solid-looking part — which is exactly the right eeriness for a room
full of the staff of a house.

Silhouette: **narrow and tall.** Hitboxes 0.6–1.1, heights 3.2–4.8: the tallest
mean of any raid and the thinnest. The exception is deliberate and noted in §2.

### 4 · Ulduar — plate, on a grid

`rooms.md` is unambiguous: Ulduar is the only right-angled room in the game and
that is its whole identity. The roster follows the architecture. **Every boss is
plated** — `RUNEPLATE` (§4) on head, body and arms — **and every boss has
pauldrons**, which are square slabs and the only part of the model that widens
the outline horizontally.

Bodies are iron at L 30–48 against a plate floor at L 65, and the trim is bronze
`#8a6a3a` rather than the room's amber lamps, so the boss never reads as one more
lit machine part. One boss carries steel-cyan and it is the trim only, never the
body: `#7ef0ff` is the Warden's projectile colour and lives at head height in
every fight in the game.

Silhouette: **rectangular.** Ulduar has the widest hitboxes in the document
(1.2–1.8) and the least height variance, because a room built on
`Math.max(abs(dx), abs(dz))` should be fought by things that look like they were
built the same way.

The sixth boss breaks the rule completely and is the only unplated thing in the
raid. That is the point of it, and it is described in §2.

### 5 · Black Temple — three colours, and the face is one of them

The room is near-black in every direction with exactly one fel-green fire in it.
`rooms.md` calls it the restraint room and the safest room in the game for
reading your own spells. The roster does not spend that.

**Bodies are matte black-plum at L 16–30** — darker than the room's own floor,
which is the one place in this document where the 1.8:1 value rule is inverted
deliberately: the boss reads as a *hole* in a dark room rather than a shape on
it, and everything you can see of it is trim. Each boss gets exactly **one hot
hue**, carried by the face, the horns and a pauldron edge and nothing else.

The `FACE_SLOT` tile (§4) is what makes this work: near-black with two white eye
rectangles, so the eyes come out at exactly the head colour and the head cube
comes out near-black. A Black Temple boss at 20 blocks is two coloured slots and
a silhouette. That is the most legible thing in this entire document and it costs
one tile.

Silhouette: **top-heavy wedge** — pauldrons on five of six, horns on four, narrow
legs. Heavy at the shoulder, light at the floor.

### 6 · Firelands — pale things on black rock

Molten Core is grey rock lit orange from below; Firelands is black rock under a
burning sky, floor L 23, the darkest walking surface in the game. Repeating the
Molten Core roster here would produce black bosses on a black floor.

So Firelands inverts: **ash-white bodies at L 130–175, charcoal limbs.** `T.BONE`
tinted toward ash carries it — flat, matte, no emissive at all on four of the
six. Against L 23 that is a 6:1 pair, the widest boss-to-floor contrast in the
set, and it also means a Firelands boss reads as a *silhouette* when it is
between you and the burning sky and as a *mass* when it is not. Same model, two
reads, depending only on where you stand. No other room does that.

The sixth boss is the exception: it is the darkest, hottest thing in the raid,
and it is the only one with emissive above 0.15. When five pale bosses have
trained you to expect pale, black-and-molten is a reveal for free.

Silhouette: **low and wide.** The mass sits at hip height; heights are the
second-lowest mean in the set and the widths the second-highest.

### 7 · Icecrown — rime on plate

Black ice underfoot at L 33, pale ice architecture above the eyeline, gold
braziers. The trap is obvious: a white boss in a white castle. The room already
solved it by putting everything pale above eye height, and the roster stays
consistent with that — **mid-value steel-blue plate at L 70–105, with `ICE`
growths as horns, pauldrons and crowns at L 200.**

So the value structure of a fight in Icecrown is: near-black floor, mid boss,
white spikes on top of the boss, white vaults far overhead. Three bands, and the
boss occupies the one nothing else is in. The one saturated cyan at floor level
stays what `rooms.md` made it — the hazard.

Rime is applied by *tile*, not by colour: `ICE` on the horn and pauldron slots
and nowhere else. It is the only raid where the appendages use a different
material from the body, and against six armoured bodies that is what makes it
read as growth rather than decoration.

Silhouette: **upright and crowned.** Every boss stands taller than it is wide,
five of six have something above the head, and the heights climb almost
monotonically through the raid — the only roster where they do, because it is the
last raid and the escalation is the point.

---

## 2. The forty-two skins

*(Written in the next section of this document — see below.)*

---

## 3. Silhouette and scale

Height and hitbox width per boss. Three rules generated the table:

1. **`height ≤ 5.3`.** Drawn height is `1.094 × height`, and past ~5.8 blocks
   drawn the head leaves the frame at melee range.
2. **A raid's six span at least 1.6 blocks of height**, and the sixth boss is
   not automatically the tallest. A roster where size tracks kill order is a
   roster with one silhouette in it.
3. **Hitbox width is 0.28–0.36 × height for a lean boss and 0.36–0.44 × height
   for a heavy one.** The drawn shoulder span is `0.572 × height` regardless,
   so every boss's model overhangs its hitbox — deliberately, so you can walk
   past a swinging arm without being body-blocked.

`scale` is left at 1 everywhere except three bosses, noted below. It multiplies
the model without touching the hitbox or `height`, so it is the tool for "reads
bigger than it collides" and it is deliberately rationed: used everywhere it
would just be a second height field.

| # | Boss | Height | Drawn | Width | Span | Read |
| --- | --- | --- | --- | --- | --- | --- |
| **Zul'Gurub** | mean 3.9 | | | | | lean, one beast |
| 1 | High Priest Venoxis | 3.4 | 3.7 | 0.80 | 1.9 | tall, thin, robed |
| 2 | Bloodlord Mandokir | 4.0 | 4.4 | 1.15 | 2.3 | broad warrior |
| 3 | High Priestess Arlokk | 3.0 | 3.3 | 0.75 | 1.7 | small and fast |
| 4 | Jin'do the Hexxer | 3.6 | 3.9 | 0.85 | 2.1 | tall, hunched |
| 5 | Gahz'ranka | 5.0 | 5.5 | 1.75 | 2.9 | the beast; tallest and widest in T0 |
| 6 | Hakkar the Soulflayer | 4.6 | 5.0 | 1.30 | 2.6 | crowned, upright |
| **Molten Core** | mean 4.0 | | | | | squat, no appendages |
| 1 | Lucifron | 3.4 | 3.7 | 1.10 | 1.9 | compact |
| 2 | Magmadar | 4.4 | 4.8 | 1.65 | 2.5 | low and wide |
| 3 | Gehennas | 3.2 | 3.5 | 0.90 | 1.8 | smallest in the raid |
| 4 | Garr | 3.8 | 4.2 | 1.30 | 2.2 | crystalline crown |
| 5 | Baron Geddon | 4.0 | 4.4 | 1.15 | 2.3 | brightest, mid-size |
| 6 | Ragnaros | 5.2 | 5.7 | 1.60 | 3.0 | at the cap |
| **Karazhan** | mean 4.1 | | | | | narrow, tall |
| 1 | Attumen the Huntsman | 4.2 | 4.6 | 1.05 | 2.4 | armoured, most solid |
| 2 | Moroes | 3.2 | 3.5 | 0.65 | 1.8 | thinnest boss in the game |
| 3 | Maiden of Virtue | 4.0 | 4.4 | 0.90 | 2.3 | statue-still |
| 4 | The Big Bad Wolf | 3.6 | 3.9 | 1.20 | 2.1 | crouched, heaviest here |
| 5 | The Curator | 4.6 | 5.0 | 0.85 | 2.6 | tall, spindly, machine |
| 6 | Prince Malchezaar | 4.8 | 5.3 | 1.15 | 2.7 | tallest, crowned |
| **Ulduar** | mean 4.4 | | | | | rectangular |
| 1 | Flame Leviathan | 4.4 | 4.8 | 1.70 | 2.5 | a vehicle with arms |
| 2 | Razorscale | 4.0 | 4.4 | 1.35 | 2.3 | bronze, mid |
| 3 | Ignis the Furnace Master | 4.2 | 4.6 | 1.50 | 2.4 | furnace-bellied |
| 4 | Kologarn | 5.0 | 5.5 | 1.80 | 2.9 | widest hitbox in the game |
| 5 | Thorim | 3.8 | 4.2 | 1.20 | 2.2 | smallest, fastest |
| 6 | Yogg-Saron | 4.8 | 5.3 | 1.55 | 2.7 | soft mass among machines |
| **Black Temple** | mean 4.2 | | | | | top-heavy wedge |
| 1 | High Warlord Naj'entus | 4.2 | 4.6 | 1.20 | 2.4 | spined |
| 2 | Supremus | 5.0 | 5.5 | 1.70 | 2.9 | the big one, second in |
| 3 | Shade of Akama | 3.4 | 3.7 | 0.75 | 1.9 | small, hooded, faded |
| 4 | Teron Gorefiend | 3.8 | 4.2 | 0.90 | 2.2 | robed, floating read |
| 5 | Gurtogg Bloodboil | 4.4 | 4.8 | 1.60 | 2.5 | swollen |
| 6 | Illidan Stormrage | 4.6 | 5.0 | 1.10 | 2.6 | tall, narrow, horned |
| **Firelands** | mean 4.4 | | | | | low and wide |
| 1 | Beth'tilac | 3.6 | 3.9 | 1.55 | 2.1 | low, splayed, `scale 1.10` |
| 2 | Lord Rhyolith | 5.0 | 5.5 | 1.80 | 2.9 | a walking outcrop |
| 3 | Alysrazor | 4.2 | 4.6 | 1.00 | 2.4 | the lean one |
| 4 | Shannox | 4.0 | 4.4 | 1.35 | 2.3 | armoured hunter |
| 5 | Baleroc | 4.4 | 4.8 | 1.40 | 2.5 | column-like |
| 6 | Ragnaros, Firelord | 5.2 | 5.7 | 1.65 | 3.0 | at the cap, second time |
| **Icecrown** | mean 4.3 | | | | | upright, crowned |
| 1 | Lord Marrowgar | 4.4 | 4.8 | 1.50 | 2.5 | bone lattice |
| 2 | Lady Deathwhisper | 3.4 | 3.7 | 0.80 | 1.9 | robed, smallest |
| 3 | Deathbringer Saurfang | 4.0 | 4.4 | 1.25 | 2.3 | plate soldier |
| 4 | Festergut | 4.2 | 4.6 | 1.70 | 2.4 | bloated |
| 5 | Sindragosa | 5.0 | 5.5 | 1.45 | 2.9 | tall, `scale 1.06` |
| 6 | The Lich King | 4.6 | 5.0 | 1.20 | 2.6 | upright, crowned, `scale 1.04` |

The three `scale` uses: Beth'tilac at 1.10 to get a spread, low-slung read out of
a model whose proportions are fixed; Sindragosa at 1.06 and the Lich King at 1.04
so the final two bosses of the final raid are the two largest drawn models in the
game (5.8 and 5.2 blocks) without either exceeding the 5.3 height cap that the
melee camera imposes.

Two numbers worth stating plainly because they are load-bearing:

- **Nothing exceeds 5.8 blocks drawn.** The camera sits at `eyeY = y + 0.9 × 1.8
  = 1.62`. At the melee range of a `range: 4.0` boss, a 5.8-block model's head
  sits at roughly 55° above the horizon — right at the top of a 390px-wide
  portrait frame and still inside it. At 6.5 it is not.
- **Nothing is narrower than 0.65.** Below that the hitbox is thinner than the
  player's own 0.6 and projectiles start passing through a boss that visually
  fills the screen, which reads as a bug regardless of what the physics says.

---

## 4. New atlas tiles

Seven new tiles, ids **41–47**. `rooms.md` §5 already claims 33–40 (`BASALT`,
`ICE`, `BLACKICE`, `FELFIRE`, `FROSTED`, `VENOM`, `EMBER`, `WATER`), and four of
those eight do double duty here, which is why this list is seven and not fifteen.

**What is reused rather than added:**

| Need | Tile | Where it comes from |
| --- | --- | --- |
| molten rock, cracked crust | `BASALT` (33) | `rooms.md` — base `[30,22,20]`, hot crack network, cooling halo. Already exactly a charred body. |
| frost, clear ice | `ICE` (34) | `rooms.md` — faceted, unnoisy. Icecrown horns and pauldrons. |
| bone plate | `BONE` (19) | shipped. Tinted to ash for Firelands, left near-white for masks. |
| plain plate | `METAL` (15) | shipped. Rivets and a border; the undecorated armour. |
| gems, crystal growth | `CRYSTAL` (18) | shipped. Curator's head, Garr's crown. |
| gilding | `GOLD` (23) | shipped. |
| robes, hides | `CLOTH` (20) | shipped, near-white, so the colour reads as written. |

**What has to be added:**

| Id | Tile | Purpose |
| --- | --- | --- |
| 41 | `SCALE` | Beast hide. Zul'Gurub, two Firelands, one Ulduar, Sindragosa. |
| 42 | `RUNEPLATE` | Rune-etched metal. Every Ulduar boss, Icecrown armour, Karazhan's Curator. |
| 43 | `SPECTRAL` | Perforated ghost. All of Karazhan, two shades elsewhere. |
| 44 | `FACE_SLOT` | Two lit slots on black. The lit-face family. |
| 45 | `FACE_MASK` | Carved ritual mask. Zul'Gurub. |
| 46 | `FACE_VISOR` | A single machined slit. Ulduar. |
| 47 | `FACE_HOLLOW` | Sockets and a hanging jaw. Karazhan, Icecrown. |

Four of the seven are faces, and that is the right split: the head is 25% of the
model's height and the only part with a dedicated front face, so a face tile buys
more identity per tile than any material does. Seven raids share four faces plus
the two shipped ones (`FACE_BOSS`, `FACE_CRAWLER`) that still fit.

### 41 · `SCALE`

Overlapping scallops, so a hide reads as a hide rather than as noise. Base
`[176, 168, 148]` — deliberately pale, because everything using it tints
downward and a dark base would leave no headroom.

```
base [176,168,148]
row  = floor(y / 4)                       // four bands of scales
ox   = (row & 1) * 2                      // offset alternate rows by 2px
sx   = (x + ox) % 4, sy = y % 4
d    = hypot(sx - 1.5, sy - 3.0)          // scallop centre below the cell
edge = d > 2.4                            // the arc between scales
shade(base, (edge ? -46 : 0)
          + (1.5 - sy) * 6                // each scale lit at its top lip
          + (hash2(x, y, 48) - 0.5) * 14)
```

Two shapes on a noisy base: the arc and the per-scale gradient. The gradient is
what stops it reading as a grid at 3 blocks away; the arc is what makes it read
as scales at 30.

### 42 · `RUNEPLATE`

`T.METAL` is a plate with rivets, which is right for trash armour and too plain
for a raid whose fiction is "machinery still running". `RUNEPLATE` is the same
plate with a channel cut into it.

```
base [150, 154, 162]
border = x < 1 || y < 1 || x > 14 || y > 14        // -34, the plate edge
groove = (abs(x - 8) < 1 && y > 2 && y < 13)       // vertical channel
      || (abs(y - 8) < 1 && x > 2 && x < 13)       // horizontal channel
node   = hypot(x - 8, y - 8) < 2.2
      && hypot(x - 8, y - 8) > 1.2                 // a ring where they cross
if (groove || node) return [96, 118, 140]          // cold, unlit metal in the cut
shade(base, border - 34 : 0
          + ((x + y) & 7) === 0 ? 12 : 0           // faint brushed diagonal
          + (hash2(x, y, 49) - 0.5) * 16)
```

The channel colour is a *fixed* cold grey rather than a shade of the base, so
when the tile is tinted bronze or steel-blue the groove stays cool and the plate
does not — one tile, two materials, from one hardcoded triple. Icecrown tints it
`#8fa4b8` and the grooves read as shadow; Ulduar tints it `#8a6a3a` and they read
as tarnish.

### 43 · `SPECTRAL`

The tile that carries Karazhan. Vertical drift with holes punched below the
alpha cutoff, so a ghost is perforated at full opacity and *then* has
`skin.alpha` applied on top of that.

```
base [236, 238, 244]
n    = hash2(x >> 1, (y + floor(x / 5)) >> 1, 50)  // 2px cells, sheared
if (n < 0.30 && y < 11) return [0, 0, 0, 0]        // holes, denser toward the top
wisp = sin(x * 0.9 + y * 0.35) * 12                // vertical drift bands
hem  = y > 12 ? -30 : 0                            // the bottom edge darkens
shade(base, wisp + hem + (hash2(x, y, 51) - 0.5) * 18)
```

Three decisions worth stating. The holes are **denser at the top** (`y < 11`)
because the tile is used on bodies and limbs and the top of a limb is the
shoulder — a figure that dissolves upward reads as rising, and one that
dissolves downward reads as broken. The bottom two rows darken so a translucent
body still has an edge where it meets the leg. And the base is near-white so the
colour multiply does all the hue work, the same way `CLOTH` does.

Because the holes are literal `a = 0` and `uCutoff` is 0.35, they cost nothing
in blend order — those fragments discard rather than blend, so a Karazhan boss
is cheap despite being see-through twice over.

### 44 · `FACE_SLOT`

Near-black with two white rectangles. The white passes the head colour through
unattenuated; the black clamps the rest of the face to near-zero whatever the
colour is. Two lit slots on a dark head.

```
if (rect(x, y, 3, 6, 5, 8) || rect(x, y, 10, 6, 12, 8)) return [255, 255, 255];
if (rect(x, y, 6, 7, 9, 7)) return [90, 90, 96];    // a dim bridge between them
shade([26, 24, 30], (hash2(x, y, 52) - 0.5) * 12)
```

Follows the convention already in `atlas.js` — features baked so they survive
tinting — but inverted, because here the *feature* is what must survive and the
field is what must not. It is the only face tile in the atlas that works that
way and it is why Black Temple can have six bosses that are almost entirely
black and still tell apart at 25 blocks.

The dim bridge at `[90,90,96]` is not decoration: without it the two slots read
as two separate lights at distance rather than as a face, and two lights is what
a pair of floor hazards looks like.

### 45 · `FACE_MASK`

A carved mask: a heavy brow, narrow eye slits under it, and a banded jaw. Baked
dark on a near-white field so the head colour paints the mask and the slits stay
black.

```
if (rect(x, y, 2, 3, 13, 4)) return [40, 30, 24];         // brow bar
if (rect(x, y, 3, 6, 6, 7) || rect(x, y, 9, 6, 12, 7))
  return [16, 12, 14];                                     // eye slits
if (rect(x, y, 4, 10, 11, 13))
  return (x % 3 === 0) ? [30, 22, 20] : [246, 242, 228];   // banded teeth
if (rect(x, y, 6, 8, 9, 9)) return [70, 52, 40];          // nose block
shade([250, 246, 232], (hash2(x, y, 53) - 0.5) * 22)
```

The teeth band uses `x % 3` rather than `x % 2` — a 2px repeat aliases into a
grey smear the moment the head is more than ten blocks away, and a mask whose
teeth turn to mush is just a pale square. Three-pixel spacing survives.

### 46 · `FACE_VISOR`

One horizontal slit and two rivets. Nothing else. It is a machine and the whole
value of it is that it is not a face.

```
if (rect(x, y, 2, 7, 13, 8)) return [255, 255, 255];       // the slit: lit
if (rect(x, y, 1, 2, 14, 3)) return [40, 44, 50];          // brow plate
if ((x === 3 || x === 12) && y === 12) return [190, 196, 206]; // two rivets
shade([54, 58, 66], (hash2(x, y, 54) - 0.5) * 14)
```

The slit is white for the same reason `FACE_SLOT`'s eyes are: it comes out at
the head colour, so Ulduar's six machines are told apart by the colour of one
horizontal line. That is a strong enough read on its own that five of the six
need no other distinguishing colour above the neck.

### 47 · `FACE_HOLLOW`

Two empty sockets, no pupils, and a jaw hanging open. The undead face, shared by
Karazhan and Icecrown — the two rosters that are already told apart by material,
so sharing one face costs nothing.

```
if (rect(x, y, 3, 5, 6, 8) || rect(x, y, 9, 5, 12, 8)) return [10, 12, 16];
if (rect(x, y, 5, 11, 10, 14)) return [14, 14, 18];        // open jaw
if (rect(x, y, 5, 11, 10, 11) && x % 2 === 0) return [200, 198, 186];
shade([244, 242, 232], (hash2(x, y, 55) - 0.5) * 20)
```

Deeper and squarer sockets than `FACE_SKELE`, and the jaw is a hole rather than
a tooth row, so the two do not collide when a Bonecaster and a Karazhan boss are
on screen together — which they will be, because Karazhan spawns adds.

### Cost

Seven `paint` calls, 1,792 callbacks, on top of the 41 tiles the atlas will
already be generating. `buildAtlasPixels` runs once at load and walks 65,536
pixels regardless; this is not measurable. Atlas occupancy after this document
is **48 of 256 tiles**, so there is no pressure on the layout and no need to
reclaim anything.

---

## 5. Fight effects

*(Written in the next section of this document — see below.)*

---

## 6. The Core drop

*(Written in the next section of this document — see below.)*

---

## 7. Readability rules

Seven rules. Every one of them exists because of the same problem: the player's
own skills fire at emissive 0.85–1.0 in saturated hues (`#ff8a3c`, `#8fe3ff`,
`#c98fff`, `#8ce06a`, `#ffd24a`), and there are six classes, so **there is no
hue left that a boss can own.** Distinctness has to come from somewhere other
than colour.

### R1 — The player owns brightness; the boss owns mass

Player effects: emissive 0.85–1.0, small, fast, short-lived.
Boss bodies: emissive ≤ 0.40, large, slow.
Boss effects: emissive 0.55–0.75, large, slow, and **ground-anchored**.

Nothing a boss does is ever as bright as what the player does. That single
ordering means that in a confused moment — three adds, a nova going off, a
channel up — the brightest thing on screen is always yours, so the frame is
always readable as "my stuff, then their stuff, then the room". Getting this
backwards is how a boss fight becomes unplayable on a phone, and it is a
one-number fix.

### R2 — Enemy danger is flat on the floor; player damage is in the air

A boss telegraph is a disc or a band **lying on the ground**, always. A player
effect is a projectile, a swing trail, or a burst at chest height. The two
almost never occupy the same plane, so even when they are the same hue they are
separable by where you are looking.

The one exception is a boss projectile, and R3 covers it.

`rooms.md` already made the floor version of this rule for the rooms —
*"anything emissive and saturated lying flat on the floor is a hazard"* — and
this is the same rule extended to effects. Same lesson, transferring in both
directions: block hazard, boss telegraph, identical read.

### R3 — Enemy projectiles are slow and fat; player projectiles are fast and thin

Boss projectiles: `speed` 16–26, `size` 0.26–0.40.
Player projectiles: faster and smaller, already.

A 0.3-wide sphere crossing the arena in 1.5 seconds cannot be mistaken for a
skill shot even in the same colour, because you have time to watch it. This is
the existing convention — the Warden's `speed: 26, size: 0.3` against the
Bonecaster's `size: 0.22` — and every raid boss inherits it rather than
inventing a new one.

### R4 — Three danger colours, no fourth

Boss effects use the three colours `mechanics.md` §2 assigns to the action, and
nothing else. **A boss's own body colour never appears in its attacks**, and a
boss's attack colour never appears on another boss's attack meaning something
else. A player learns the vocabulary once, in Zul'Gurub, at level 1, and it is
still true in Icecrown at 60.

This is the rule most likely to be broken by good intentions: a frost boss
"wants" a blue nova, a fel boss "wants" a green one. It does not get one. The
mechanic decides the colour; the boss decides the shape and the tempo.

### R5 — Silhouette is the identity; colour is the second read

At 390px wide and 40 blocks away a boss is roughly 40 pixels tall and its
colours have been mixed 60% toward the fog colour. What survives is the outline:
horns, pauldrons, a hat, and how tall it is against the Dais rim.

So every roster in §1 is defined by an outline rule first and a palette second,
and every raid's six bosses differ in **height by at least 1.6 blocks across the
set** and in at least one silhouette part from their nearest sibling. If two
bosses in a raid can only be told apart by hue, one of them is wrong.

Test: desaturate a frame to greyscale and blur it to 40px. If you cannot name
the boss, the skin has failed.

### R6 — The body is matte; the trim is bright; the ratio is fixed

On every boss in this document the high-value material — bone, ice, crystal,
the lit face — covers **less than 20% of the model's projected area**. Horns,
pauldrons, a hat and a face slab together are under a fifth of a humanoid's
silhouette, which is exactly what makes them read as trim rather than as the
subject.

Invert it and the boss becomes a lantern: an 80%-bright boss competes with the
player's own effects (R1), loses its silhouette (R5), and stops registering hits
because `hurtFlash` mixes toward `[1.0, 0.55, 0.55]` and there is nowhere to mix
*to* from a body that is already near-white.

That last point is worth its own line. **A boss's body value must leave room for
the hit flash.** `gl.js:65` lerps toward a pale pink. On a body at L 30 that is
an unmistakable flash; on a body at L 200 it is a slight blush. Firelands' pale
roster is the closest this document comes to the edge, at L 130–175, and it is
why those six carry charcoal limbs — the limbs flash even when the torso barely
does.

### R7 — One emissive hue per room, and the boss is not it

`rooms.md` gives every room exactly one emissive hue at floor level, at the Dais
rim, the gate posts and the perch tops. The boss standing in the middle of it
must not share that hue, or the rim light and the boss merge into one bright
smear at range.

| Raid | Room's floor-level emissive | Boss family's hue |
| --- | --- | --- |
| Zul'Gurub | gold `#c9a227` | crimson / plum + bone white |
| Molten Core | cold blue `#9fd0ff` (Dais rim) | banked orange under charcoal |
| Karazhan | warm candle `#ffbf6a` | ivory / ash-lavender |
| Ulduar | amber `#ffa62b` | iron / bronze |
| Black Temple | fel `#a8ff5c` | black + one hot hue each |
| Firelands | lava `#ff8a3c` (Dais rim) | ash white |
| Icecrown | bone-gold `#e8d6a0` | steel blue + ice white |

Every row is a contrast pair, and in five of seven it is a temperature
inversion: warm room, cool boss, or the reverse. That is the same trick
`rooms.md` used for the Dais rim — *"the boss stands inside a cold ring in a hot
room"* — applied one layer up.

The one deliberate near-collision is Black Temple's sixth boss, whose hot hue is
fel green in a room whose hazard is fel green. It is allowed exactly once, at
the end of the raid, and only because that boss's green covers under 10% of the
model (face slots, horn tips, one pauldron edge) while its body is the darkest
in the game. If it were a green body it would be unshippable.

---

## Appendix: what this costs in code

Nothing structural. Listed so the estimate is honest.

1. **`atlas.js`** — seven new `T` ids and seven `paint` calls (§4).
2. **`mobs.js`** — 42 entries in `MOB_TYPES`, or better, a raid-boss table
   generated from `RAIDS` plus a per-boss skin map, since 42 hand-written mob
   defs would duplicate the power/health scaling that `raids.js` already
   computes.
3. **`entity.js`** — nothing. Every skin in §2 is expressible in the existing
   `drawHumanoid` vocabulary. That is a constraint this document accepted rather
   than a coincidence; where a design wanted a part the model does not have, the
   design changed.
4. **`effects.js`** — see §5 for the two primitives that do not exist yet, and
   the note on which bosses need them.
