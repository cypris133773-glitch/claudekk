# Shipping BLOCKFRAY on Steam

The game is a static web build, so getting it onto Steam means wrapping it in a
desktop shell. Nothing in the codebase assumes a browser beyond standard web
APIs, so this is mostly packaging work.

## 1. Pick a wrapper

| Option | Size | Notes |
| --- | --- | --- |
| **Tauri** (recommended) | ~10 MB | Uses the OS webview. Smallest build, Rust toolchain required. WebView2 on Windows, WKWebView on macOS. |
| **Electron** | ~150 MB | Ships its own Chromium, so rendering is identical everywhere. Simplest path, biggest download. |
| **NW.js** | ~130 MB | Similar to Electron. |

Tauri's Windows target depends on WebView2, which is present on Windows 11 and
auto-installed on 10 — verify on a clean VM before release, since a missing
runtime is a launch-day refund generator.

### Tauri sketch

```bash
npm create tauri-app@latest
# point frontendDist at this repository root, devUrl at http://localhost:8080
```

```json
{
  "productName": "BLOCKFRAY",
  "app": {
    "windows": [{
      "title": "BLOCKFRAY",
      "width": 1280, "height": 720,
      "minWidth": 960, "minHeight": 540,
      "fullscreen": false, "resizable": true
    }]
  },
  "build": { "frontendDist": "../", "devUrl": "http://localhost:8080" }
}
```

## 2. Things the desktop build should change

The web build is already close, but a paid desktop release wants:

- **Save location.** `src/core/save.js` writes to `localStorage`. Swap the
  `load`/`save` bodies for the wrapper's filesystem API so saves survive a
  cleared webview cache, and mirror them to Steam Cloud.
- **Real fullscreen + a resolution setting.** The web build fills the window;
  desktop players expect borderless/exclusive options.
- **Gamepad support.** The `Input` class already normalises everything into one
  state object, so a controller path is one more producer feeding
  `state.moveX/moveY/lookX/lookY` plus button mapping. Steam Deck verification
  effectively requires it.
- **Rebindable keys.** Currently hard-coded in `src/core/input.js`.
- **Alt+F4 / window close** should end the run cleanly so souls are banked.

## 3. Steamworks integration

Minimum for a store page: nothing. The game runs standalone. Add
[`steamworks.js`](https://github.com/ceifa/steamworks.js) (Node bindings) if
you want:

- **Achievements** — natural fits: first boss kill, reach wave 10/25/50, clear
  a run with each class, max a talent tree, fully upgrade a Forge line.
- **Leaderboards** — highest wave, per class. The run result in
  `game.result` already has everything you need to submit.
- **Steam Cloud** — sync the profile JSON. It is small and self-contained.
- **Rich Presence** — "Wave 23 as Warlock".

## 4. Store checklist

- App fee paid, bank/tax forms completed (payment is gated on these).
- Capsule art in every required size, plus a trailer — the single biggest
  driver of wishlists.
- At least 5 screenshots at 1920×1080.
- Store description, short description, tags, genres.
- **Content survey and rights confirmation.** You must attest you own or are
  licensed for every asset in the build. Right now that is trivially true —
  everything is generated in code. It stops being true the moment you drop
  third-party audio or textures into `assets/`, so keep `docs/CREDITS.md`
  current.
- Build uploaded via `steamcmd` / the Steamworks SDK content builder.
- Two-week minimum between store page publish and release.

## 5. Legal notes worth taking seriously

- **Do not use another game's assets, sounds, fonts, or trademarks.** Minecraft
  in particular is aggressively protected: its textures and sound files are
  copyrighted, and Mojang's usage guidelines do not licence them for use in
  other games. A "voxel first-person arena" is a genre and is fine; shipping
  their `.ogg` files or block textures is not, and it is exactly the kind of
  thing that gets a paid release pulled.
- **Do not use real people's likenesses** — photographs of faces, including
  your own family — as characters, and especially not as enemies. Likeness and
  privacy rights are separate from copyright, minors are afforded extra
  protection in most jurisdictions, and platforms treat it as a takedown
  matter, not a warning.
- **Name check.** Search Steam and the USPTO/EUIPO trademark databases for your
  final title before you commit to art and a store page.

## 6. Also worth considering

The same build works as a PWA and can be wrapped for mobile stores with
Capacitor, sharing 100% of this code. If mobile is the primary audience, ship
there first — it is a far shorter path to players than a Steam release.
