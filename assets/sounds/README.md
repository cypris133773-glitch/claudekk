# Sound pack (optional)

Drop audio files in this folder named after a cue id and the game will play
your file instead of the built-in synthesised sound. Missing files fall back to
procedural audio, so you can replace as few or as many cues as you like.

Default format is `.ogg`. To use another container, call
`audio.loadSoundPack('assets/sounds', Audio.CUES, 'wav')` from `src/main.js`.

## Cue ids

| Cue | When it fires |
| --- | --- |
| `swing` | melee attack connects with the swing arc |
| `whiff` | melee attack hits nothing |
| `hit` | any damage dealt to an enemy |
| `crit` | critical strike |
| `shoot` | ranged basic attack |
| `cast` | skill cast (projectile / targeted) |
| `nova` | self-centred area skill |
| `zap` | chain lightning |
| `explode` | any explosion |
| `blink` | teleport / ambush |
| `charge` | warrior charge |
| `heal` | healing skill |
| `buff` | defensive buff applied |
| `drain` | drain life channel |
| `summon` | pet or totem placed |
| `fuse` | bomber starts its fuse |
| `roar` | boss spawn / enrage |
| `hurt` | player takes damage |
| `death` | player dies |
| `levelup` | upgrade chosen |
| `wave` | new wave begins |
| `buy` | Forge / talent purchase |
| `ui` | menu click |
| `deny` | action refused (no resource, no rerolls) |

## Licensing

Only add audio you own or have a licence to distribute.

**Minecraft's sound files cannot be used here.** They are copyrighted works
owned by Mojang/Microsoft, and Mojang's usage guidelines do not permit reusing
their assets in another game — free or paid. Shipping them would get a Steam
release taken down and expose you to a copyright claim, and it would apply to
this repository too.

Safe sources for a Minecraft-adjacent feel:

- **Record your own.** Most of these cues are foley — a hit, a swoosh, a thud.
- **CC0 libraries** — [freesound.org](https://freesound.org) (filter to CC0),
  [OpenGameArt](https://opengameart.org), [Kenney](https://kenney.nl/assets)
  (all CC0, includes impact and UI packs).
- **Commercial licences** — Soundly, Boom Library, Epidemic Sound, or a
  freelance sound designer. A per-title buyout is the normal route for a paid
  Steam game.

Whatever you add, record the source and licence in `docs/CREDITS.md` before
you ship. Steam asks you to confirm you hold the rights to everything in the
build.
