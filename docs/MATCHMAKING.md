# Public games

Two browsers cannot find each other on their own. WebRTC connects them
*directly* once they have swapped a connection description, but swapping it
needs a third party both can reach — and for the invite-code flow that third
party is a human, carrying a string between two chat windows.

Public games do not remove that job. They move it to a server.

## What the server does

`api/rooms.js` holds one small piece of text per open game for ninety seconds.
That is the whole product. No accounts, no sessions, no match history, no
player records. The moment two browsers are connected the room is deleted and
the server has nothing to do with the game they play — every packet of the
match goes straight between the two players.

It is one Vercel serverless function. It is stateless by necessity: functions
do not share memory and there is no guarantee two requests hit the same
instance, so the rooms live in a key-value store rather than in a variable.

## Turning it on

**It is off until a key-value store is connected, and that is deliberate.**
With no store, every endpoint answers `configured: false`, the lobby says
"Public games are switched off in this build", and the invite codes keep
working exactly as they always have. Nothing breaks; a feature is simply
absent.

To switch it on, from the Vercel dashboard for this project:

1. **Storage → Create Database → Upstash for Redis** (the free tier is
   enough — this stores a couple of kilobytes for ninety seconds at a time).
2. **Connect it to this project.** Vercel sets `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` automatically; the function reads either those or the
   `UPSTASH_REDIS_REST_*` pair.
3. **Redeploy.** The lobby will start listing games.

No code change is needed at any point.

## What it deliberately does not do

**It does not relay gameplay.** About one pair in six cannot make a direct
connection at all, because some networks refuse to route between two of their
own clients. Fixing that needs a TURN relay, and a TURN relay works by pushing
every packet of every match through a server somebody pays for. That is the
line between "free to run forever" and "a hosting bill that grows with
success", and it is drawn here on purpose. The game tells the player plainly
when it cannot connect rather than pretending the problem is theirs.

**It does not make the mode trustworthy.** The host runs the simulation, and
the host is a person who can edit the page. Between friends that has always
been fine and is how every peer-hosted game has ever worked. In a public lobby
the host is a stranger, and a stranger who wants to cheat can.

That is survivable for exactly one reason: **a duel pays nothing.** No gold, no
XP, no quest credit, no records, nothing written to the profile at all. It is
enforced in `Game.startDuel` and asserted by `tools/duel-test.mjs`. If a reward
is ever added to this mode, that decision has to be made deliberately and with
this paragraph in front of whoever makes it — because the moment a duel is
worth something, a stranger deciding your health is worth something too.

## Limits, and why

| | | |
|---|---|---|
| Room lifetime | 90s | An unanswered offer is stale; the ICE candidates in it go bad. |
| Rooms listed | 60 | One bad actor should not be able to fill the lobby. |
| Blob size | 8 KB | A real session description is 1–2 KB. |
| Poll interval | 2s | A serverless function cannot hold a connection open, so the host asks instead. Forty questions before somebody answers is cheap; a websocket host is not. |

Room names are shown with `textContent`, never interpolated into markup. A
room name is the only string in this game that did not come from this
repository — it is typed by a stranger and rendered on your screen — and
`tools/public-test.mjs` asserts a hostile one is displayed rather than run.

## Testing it

```
npm run test:public
```

Two real browsers, the real `api/rooms.js`, and an in-process stand-in for the
key-value store. Nothing is passed between the pages by the script: the host
publishes, the joiner lists and clicks, and the test asserts they end up in an
arena with a byte-identical world.
