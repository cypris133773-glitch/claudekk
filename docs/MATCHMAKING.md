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

It is one Vercel serverless function, with two places it can keep those
rooms.

## It works with nothing configured

**Public games are on by default and need no setup.** With no key-value store
connected, the function keeps rooms in a Map inside the running instance.

This used to be a refusal. Every endpoint answered `configured: false` and the
lobby read *"Public games are switched off in this build"* — a sentence that
blames the build for a deployment setting, and one that was reported as a bug
four separate times. A player who wants to see whether anyone is playing does
not have an Upstash account and should not need one.

The memory backend is honest about its limit, and the lobby says so on screen:
Vercel may run more than one instance, and two players routed to different
ones will not see each other's rooms. A cold start empties the list. For a
handful of concurrent players in one region it works.

## Making it reliable

Connecting a store is still the recommendation — it is what makes the lobby
work across instances and regions, and it survives a cold start. From the
Vercel dashboard for this project:

1. **Storage → Create Database → Upstash for Redis** (the free tier is
   enough — this stores a couple of kilobytes for ninety seconds at a time).
2. **Connect it to this project.** Vercel sets `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` automatically; the function reads either those or the
   `UPSTASH_REDIS_REST_*` pair.
3. **Redeploy.** The response's `durable` flag flips to `true` and the lobby
   drops its "no shared store" note.

No code change is needed at any point, and nothing about the game changes
apart from how well strangers find each other.

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
