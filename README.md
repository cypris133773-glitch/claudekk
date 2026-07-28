# BLOCKFRAY — Endless Voxel Arena

A first-person, blocky arena brawler that runs in the browser on **phones and
PC**. Pick one of six classes, survive an endless ladder of waves, and spend
what you earn on permanent power between runs.

No engine, no framework, no build step, no binary assets — hand-written
WebGL2, ES modules, and textures and sounds generated in code.

```bash
npm start          # http://localhost:8080
npm test           # 24 logic checks, no browser needed
npm run sim        # headless balance simulation
```

## Hosting

It is a static site — no build step, no server-side anything — so any static
host serves it as-is. Opening `index.html` straight off disk will **not** work:
ES modules require `http://`, so use `npm start` locally.

| Route | What it needs |
| --- | --- |
| **GitHub Pages** | Enable once under *Settings → Pages → Source → GitHub Actions*. Every push to `main` then deploys via `.github/workflows/pages.yml`. The workflow cannot enable Pages for you — creating a Pages site needs admin scope the default workflow token does not have. |
| **Vercel** | Import the repository. `vercel.json` sets `outputDirectory: "."` and no build command, because the game is served straight from the repo root. Without that Vercel looks for a `public/` directory, does not find one, and fails the build. |
| **Netlify / Cloudflare Pages / S3** | Publish directory `.`, no build command. |
| **Single file** | `npm run build` writes `dist/blockfray.html` — the whole game in one file with zero external requests. Drop it anywhere, including itch.io. |

### Single-file build

```bash
npm run build              # dist/blockfray.html          (standalone document)
npm run build:fragment     # dist/blockfray-fragment.html (no <html>/<body>)
```

`tools/bundle.js` inlines the CSS and flattens the module tree behind a small
registry shim, with no bundler dependency. Everything the game draws and plays
is generated in code, so the result makes no network requests at all — handy
for itch.io, a desktop wrapper, or any host that will not serve directories.

---

## The game

**Endless waves.** The run only ends when you die — the difficulty curve keeps
climbing (`src/game/waves.js`). Every 5th wave is a boss, and past wave 20 you
start facing multiple. Elites appear from wave 6 and get more common.

**Three arenas, four palettes**, rolled per run, so the ground you fight on
changes too:

| Arena | Plays like |
| --- | --- |
| **Fortress** | Close quarters. Central dais, four corner towers, cover pillars, lava spokes. |
| **Crucible** | A molten moat around a raised centre, crossed by four bridges. Hold a chokepoint. |
| **Spires** | Open ground, tall spires and elevated platforms. High ground is worth taking. |

**Clear a wave, pick an upgrade.** Three cards drawn from 28 options,
weighted by rarity. They stack, so a run builds toward something.

**Die and bank it.** Souls earned in a run are permanent currency. Reaching a
deeper wave with a class grants that class talent points.

### Classes

Each has its own resource, four skills, and a three-branch talent tree.

| Class | Resource | Style |
| --- | --- | --- |
| **Warrior** | Rage (builds by fighting) | Charge in, whirlwind, execute the wounded |
| **Mage** | Mana | Fireball, Frost Nova, Blink, Meteor |
| **Warlock** | Soul Shards (from kills) | Rot that spreads, drain life, summon fiends |
| **Shaman** | Mana | Chain lightning, roots, healing totem, Stormstrike |
| **Priest** | Mana | Absorb shields, heals that also damage, Holy Nova |
| **Rogue** | Energy (fast regen) | Ambush behind a target, poison, burst finisher |

Talent branches mirror the classic layout — Arms / Fury / Protection,
Fire / Frost / Arcane, Affliction / Demonology / Destruction, and so on. Tiers
unlock as you invest in a branch, so specialising is a real choice. You can
respec for free at any time.

### Progression

| Layer | Persistence | Where |
| --- | --- | --- |
| Upgrade cards | This run only | Between waves |
| Talents | Permanent, per class | Main menu → **TALENTS** |
| The Forge | Permanent, all classes | Main menu → **THE FORGE** |

**The Forge** sells 13 account-wide upgrades with escalating costs — health,
damage, cooldowns, souls gained, extra rerolls, a free upgrade at the start of
every run, and a one-time revive.

---

## Controls

**Phone** (landscape). Drag anywhere on the left half to move — the stick
appears where your thumb lands. Drag the right half to look. Buttons sit under
your right thumb: attack, jump, sprint, and a 2×2 skill pad with cooldown
rings. Left-handed layout is a setting.

**Keyboard & mouse.** `WASD` move, `Space` jump, `Shift` sprint, mouse look,
left click attack, `1`–`4` (or `Q E R F`) skills, `Esc` pause.

**Controller.** Standard mapping, so Xbox, PlayStation, Switch Pro and the
Steam Deck all work: sticks to move and look, `A` jump, `X`/`RT` attack,
`L3`/`LT` sprint, `LB RB Y B` for the four skills, `Start` to pause. Plug in
and press anything — it takes over automatically and does not need pointer
lock.

---

## How it is built

```
index.html            canvas + HUD canvas + DOM menu root
styles.css            menu styling, safe-area aware
src/
  main.js             boot, fixed-step game loop, platform glue
  core/
    math.js           mat4, vectors, angles, hash noise
    input.js          keyboard/mouse/pointer-lock + touch joystick & buttons
    audio.js          procedural WebAudio SFX + generative music
    save.js           localStorage profile (souls, talents, records, settings)
  render/
    atlas.js          procedural 256x256 texture atlas, 16x16 tiles
    gl.js             WebGL2 context, the single shader, VAO helpers
    renderer.js       camera, world draw, blocky entity draw, projection
  world/
    blocks.js         block table
    world.js          arena layouts, meshing with ambient occlusion, collision
  game/
    entity.js         physics, status effects, humanoid model
    player.js         derived stats, resources, buffs, basic attack, view model
    mobs.js           7 enemy archetypes with distinct AI
    pets.js           warlock fiends, shaman totems
    skills.js         data-driven skill resolution (10 skill kinds)
    effects.js        projectiles, particles, telegraphs, floating numbers
    waves.js          endless scaling, spawn budgets, boss cadence
    game.js           combat resolution, wave loop, orchestration
  data/
    classes.js        all six classes: stats, skills, talent trees
    upgrades.js       run upgrade cards
    permanent.js      the Forge
  ui/
    hud.js            in-game HUD + on-screen touch controls
    menus.js          title, class select, talents, Forge, settings, results
tools/
  serve.js            dependency-free static server
  smoke-test.js       headless logic tests
  balance-sim.js      headless bot-driven balance harness
```

**Balance harness.** The game core never touches the DOM, so complete runs can
be simulated in Node with a scripted bot — no browser, far faster than real
time. This is how the difficulty curve is tuned, and it catches deep-run
crashes and soft-locks that manual play would take hours to find.

```bash
npm run sim                  # every class, 5 runs each
node tools/balance-sim.js mage 20
node tools/balance-sim.js --forge 5    # simulate a progressed account
node tools/balance-sim.js --layout 1   # pin one arena
```

A run that fails to terminate is reported with the position and state of
everything still alive — that is how the arena soft-locks were found. CI runs
this on every push and fails the build if any simulated run cannot end.

The bot is deliberately mediocre — it never dodges telegraphs and kites badly
— so treat its numbers as a floor, not a target. Current baseline, median wave
reached:

| Forge level | Median wave |
| --- | --- |
| 0 (fresh account) | 5 |
| 2 | 6.5 |
| 5 | 12 |
| 8 | 18.5 |

That progression is the point: a fresh run stalls at the first boss, and
permanent upgrades are what get you past it. If a change flattens that curve,
the harness will show it.

**Rendering.** One shader draws everything. The arena is meshed once into a
single VBO with per-vertex ambient occlusion; entities are unit cubes with a
per-draw model matrix and a UV window into the atlas. Faces are picked from the
atlas so mobs have actual faces.

**Simulation** runs at a fixed 60 Hz step with a capped accumulator, so physics
behave identically on a 60 Hz phone and a 144 Hz monitor.

**Performance on phones.** Render scale is adjustable down to 50%, device pixel
ratio is capped at 2, and concurrent enemies are capped so late waves get
tougher rather than heavier.

**Adding content** is mostly data. A new skill is an entry in
`src/data/classes.js` whose `kind` one of the ten resolvers in
`src/game/skills.js` already understands. A new upgrade card is one object in
`src/data/upgrades.js` whose `effect` keys flow straight into the modifier bag.

---

## Assets and licensing

Everything you see and hear is generated at runtime. There are no textures,
audio files, fonts, or third-party libraries in this repository, and nothing in
it derives from any other game.

Two optional drop-in hooks let you supply your own content — a custom enemy
face texture and a full sound pack. See [`assets/README.md`](assets/README.md)
and [`assets/sounds/README.md`](assets/sounds/README.md), which also cover what
you can and cannot legally ship.

## Shipping on Steam

See [`docs/STEAM.md`](docs/STEAM.md) for the desktop wrapper, store
requirements, and the checklist for a paid release.

## Licence

See [`LICENSE`](LICENSE).
