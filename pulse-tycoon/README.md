# PULSE TYCOON — an idle clicker

A 2D idle clicker that runs in the browser on **phones and PC**. Tap the coin,
buy nine tiers of increasingly deranged business, hire advisors to run them,
lock cash in stakes for T-Shares, and burn the whole thing down for a permanent
multiplier.

No engine, no framework, no build step, no binary assets — plain ES modules,
canvas 2D, and every pixel drawn from shapes in code.

```bash
npm start     # http://localhost:8080
npm test      # 36 logic checks, no browser needed
npm run sim   # headless balance simulation
```

---

## What this is a joke about

PULSE TYCOON is **parody**. It sends up crypto-influencer culture — the
twelve-hour livestreams, the slogans, the staking ladders, the showroom at the
end — in the shape of an idle game.

It is **not affiliated with, endorsed by, or connected to** any real
cryptocurrency, project, company, or person. The figure in the corner is a
cartoon and a caricature of a genre, not a portrayal of anything anyone
actually said or did. Every number in the game is imaginary. **Nothing here is
financial advice.**

---

## The Narcos structure, and what it maps onto

The brief was to take the loop from *Narcos: Idle Cartel* and rebuild it around
a different subject. That game runs on six moving parts, and all six are here —
game mechanics are the copied thing, not art, names, or text.

| *Narcos: Idle Cartel* | PULSE TYCOON | Where it lives |
| --- | --- | --- |
| Tap a trafficker to run a cycle | Tap the coin — pays out, and kicks every hand-run station into motion | `G.tap`, `src/render/scene.js` |
| A pipeline of stations you level up | Nine tiers, Shill Post → Rolex & Lambo Showroom | `src/data/stations.js` |
| Hire managers to automate a station | Advisors, one per station, priced in cash | `G.hireAdvisor` |
| Influence spent on permanent upgrades | **T-Shares** spent on perks that survive everything | `src/data/upgrades.js` |
| Chapter quests gating prestige | Five chapters of quests; finishing chapter 2 opens Restake | `src/data/quests.js` |
| Prestige: reset cash and managers, keep the meta currency | **Restake**: burn the run for Sacrifice Points, +2% income each, forever | `G.restake` |
| Idle income while the app is closed | Offline earnings, capped, extendable by perk | `G.applyOffline` |
| Timed boosts | **Pump** — x2 income for 30s on a cooldown, upgradeable to x3 / 60s | `G.startPump` |

Two things are ours rather than theirs, because the subject asked for them:

- **Stakes.** Lock cash for 1 minute, 10 minutes, or an hour and it comes back
  with T-Shares on top. *Longer pays better, bigger pays better* — and ending
  one early burns the yield and half the remaining principal. This is the only
  source of T-Shares outside quests, which is what keeps the perk tree slow.
- **The share price** a stake is priced against is frozen at open and tracks
  the largest bank you have ever held, so you cannot open a stake while poor
  and cash it while rich.

Sources for the mechanics breakdown: [MrGuider](https://www.mrguider.org/cheats/narcos-idle-cartel-cheats-guide-tips-tricks/),
[Touch, Tap, Play](https://www.touchtapplay.com/narcos-idle-cartel-guide-tips-cheats/),
[Uptodown](https://narcos-idle-cartel.en.uptodown.com/android),
[Metacritic](https://www.metacritic.com/game/narcos-idle-cartel/details/).

---

## The loop

**Tap.** The coin pays a flat cut of the empire and starts a cycle on every
station you have not automated yet. Early on it is the whole game; later it is
a way to shave the wait.

**Buy.** Levels are priced as a geometric series, so `x10` costs exactly what
ten single buys cost. Every station doubles its output at levels 25, 50, 100,
200, 300, 400, 500, 750 and 1000, and halves its cycle time at 100, 300 and
600 — which is why the buy-mode toggle exists.

**Automate.** An un-automated station runs exactly one cycle per tap and then
stops dead. An advisor removes that gap permanently, and only automated
stations count towards the `$/sec` readout or offline earnings. The game does
not quote you income you cannot actually collect while asleep.

**Stake.** Lock a slice of the bank. T-Shares come back, cash comes back, and
the perk tree opens up.

**Restake.** Once chapter 2 is done and there are points waiting, burn it: cash,
stations and advisors go, T-Shares, perks, quests and Sacrifice Points stay.
Open stakes are paid out in full first — losing them to a button you chose to
press would be a trap.

## What the simulation says

`npm run sim 8` plays eight hours with a greedy strategy and prints a timeline.
As tuned:

```
     4s   opened Shill Post
  1m 16s  reached chapter 2
  4m 36s  opened T-Share Vault
 11m 28s  Restake became available
 19m 49s  opened The Sacrifice Altar
 29m 26s  opened Rolex & Lambo Showroom
  1h 46m  earned $1.00T total
  7h 31m  bought perk: Megaphone
```

The station ladder opens inside half an hour; the T-Share economy is the long
tail, and the top perks are days of play. That split is deliberate — the
stations are the tutorial, the perks are the game.

## Layout

```
index.html          markup, one canvas and one div
styles.css          all of it, mobile-first
src/main.js         boot, loop, and click → state wiring
src/core/           number formatting, save/load
src/data/           stations, advisors, upgrades, quests, the hype man's lines
src/game/           economy.js (pure maths), state.js (the mutable game)
src/render/scene.js the canvas: chart, coin, station ring, caricature
src/ui/ui.js        every panel
tools/serve.js      static server, because ES modules refuse file://
tools/test.js       headless logic checks
tools/sim.js        balance simulation
tools/browser-test.mjs  drives the real page in a real browser
```

Everything under `src/game` and `src/core` is DOM-free on purpose: that is what
lets the whole economy be tested and simulated in node.

## Hosting

It is a static site with no build step, so any static host serves it as-is.
Opening `index.html` off disk will **not** work — ES modules need `http://`, so
use `npm start` locally.

## Saving

One `localStorage` key, written every ten seconds and whenever the tab is
hidden. A save that will not parse is discarded rather than fought with. Time
away is banked on return, capped at two hours plus whatever the offline perks
have added — but the clock always advances in full, so stakes mature in real
time whether the tab is open or not.
