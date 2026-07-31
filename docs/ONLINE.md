# Accounts and PvP — what these actually need

Three requests in the last round cannot be built inside this repository,
because none of them is a client-side feature. They all need a server that
this game does not have and cannot have without one being stood up and paid
for. This is the honest scope of each, so the decision is yours rather than a
surprise later.

Nothing here is a refusal. Each section ends with the smallest real first step.

---

## 1. Google sign-in and password reset

**Why it is not a code change here.** "Log in with Google" is an OAuth 2.0
flow. The browser sends the player to Google, Google sends back a signed token,
and then *something you control* has to verify that token and look up the
account it belongs to. That verification cannot happen in the game client: a
client that decides for itself whether a token is valid is a client any player
can edit to say "yes". The same is true of progress — if the save lives only
in the browser, "logged in" means nothing, because there is no server holding a
copy to log in *to*.

Password reset is the same shape. A reset needs an account store, a
single-use token with an expiry, and an email sender. All three are server
side.

**What it needs, concretely:**

| Piece | Purpose |
| --- | --- |
| OAuth client ID + secret | Registered in Google Cloud Console for your domain |
| An auth backend | Verifies Google's token, issues your own session token |
| A profile database | One row per account holding what `save.js` currently writes to `localStorage` |
| A sync endpoint | Read profile on login, write on run end, with conflict handling |
| Transactional email | Only if you also want email/password accounts alongside Google |

**The conflict problem is the real work,** not the login button. A player
finishes a run offline on their phone, then opens the game on a laptop that
has an older profile. One of those has to win, and picking wrong silently
deletes progress. That needs a rule — usually "highest lifetime diamonds
wins", plus a per-field merge for anything monotonic — and it needs to be
decided before the first player ever has two devices.

**Smallest real first step:** a managed backend (Firebase Auth + Firestore,
or Supabase) gets you Google sign-in and a profile store without writing a
server. The game-side change is small and well-bounded: `src/core/save.js`
already funnels every read and write through `load()` and `save()`, so a
remote profile slots in behind that same pair of methods. Budget the day on
the merge rule, not on the button.

**Cost:** free tiers cover early players; both charge per read/write past
that.

---

## 2. PvP — 1v1, 2v2, 3v3 against real players

This is the largest item on the list by a wide margin, and it is worth being
precise about why, because "add multiplayer" sounds like a feature and is
actually a second game.

**What the current architecture assumes.** Every rule in this game is resolved
locally and trusted: the client decides that a hit landed, how much damage it
did, whether a crit rolled, and how much health is left. That is correct and
efficient for a single-player game — and it is exactly the set of decisions
that cannot be trusted in PvP. A player who can edit the page can currently
set their own health, damage and cooldowns. Against enemies that is their
business. Against another human it is the whole problem.

**So PvP needs an authoritative server** that runs the simulation and treats
every client as a suggestion. That is a rewrite of the boundary between
`Game`, `Player` and `Input`, not an addition to them.

The pieces, in the order they have to exist:

1. **Authoritative simulation.** The fixed 60 Hz step this game already uses is
   the right foundation — a deterministic step is what makes a server tick
   reproducible. But it has to run somewhere neither player controls, and both
   clients become renderers of state they are sent.
2. **Netcode.** At 60 Hz over the public internet you need client-side
   prediction and server reconciliation, or every input feels 80 ms late.
   This is the part that takes longest to get right and the part players
   notice immediately when it is wrong.
3. **Matchmaking.** A queue per bracket, skill rating, party grouping for 2v2
   and 3v3, and a plan for what happens when someone leaves mid-match.
4. **Hosting.** Persistent game servers, ideally regional, because a 200 ms
   ping across an ocean makes a reflex game unplayable. This is a running
   monthly cost that scales with concurrent players, not with installs.
5. **Anti-cheat and abuse handling.** Reports, bans, rate limits. Any
   competitive mode attracts this the week it launches.

**Honest estimate:** this is months of work for a team that has built netcode
before, and it is the kind of work where the last 20% — desync bugs that
appear only at real latency — takes as long as the first 80%.

**Smallest real first step, and the one I would actually recommend:**
asynchronous PvP. Players fight a *recorded* run of another player's
character: same class, same talents, same gear, driven by the arena's existing
AI. It looks and reads like PvP, appears on a leaderboard, needs no netcode,
no matchmaking, no game servers and no anti-cheat beyond validating the
submitted score. Archero does exactly this and most of its players do not
realise. It is buildable on top of what already exists, and it is the version
that can ship this year.

If real-time PvP is the goal regardless, the honest sequencing is: accounts
first (§1), then async PvP, then real-time — because accounts and a
leaderboard are prerequisites for both, and async PvP tells you whether people
actually want to fight each other before you pay for game servers.

### 2b. What if the *player* hosts the arena?

This is a genuinely different proposition from §2 and a much smaller one, so it
deserves its own answer rather than being folded into "multiplayer is hard".

**Short version: yes, 1v1 / 2v2 / 3v3 with a player as host is buildable, and
it is weeks of work rather than months.** Two browsers can talk directly over
WebRTC data channels, which is exactly the transport this needs: unreliable,
unordered, low-latency, and already in every browser the game runs in. Six
players is a small enough group that the host can simply run the simulation it
already runs and broadcast the result.

**What changes in this codebase.** Less than §2 implies, because the hard part
of §2 was *moving* the simulation somewhere neither player controls. Here it
stays where it is:

- The host keeps running `Game.update` at the fixed 60 Hz step it already uses.
- A joining player sends input frames instead of applying them locally, and
  renders entity snapshots the host sends back at ~20 Hz, interpolated between.
- Your own movement is predicted locally and reconciled, or it feels 80 ms
  late. Everyone else's is interpolated, which is invisible at these speeds.
- Mobs, waves and the wave director do not need to change at all — they are
  already only ever simulated in one place.

**What it costs that "serverless" makes sound free.** Peer-to-peer removes the
*game* server, not every server:

- **Signalling.** Two browsers cannot find each other without exchanging a
  connection description first. That is a few hundred bytes over any channel at
  all — including, for a first version, an invite code the host copies and
  pastes into a chat. That version needs literally no infrastructure and is a
  real product for "play with a friend". It is not matchmaking.
- **STUN**, to discover your own public address. Free public servers exist. It
  is an external request, which this game currently makes zero of — a
  deliberate constraint worth breaking knowingly rather than by accident.
- **TURN**, a relay for the roughly 10–20% of pairs whose networks refuse a
  direct connection. This one costs money, because the traffic flows through
  it. It is the only unavoidable running cost, and it scales with the fraction
  of matches that need it, not with players.

**The trust model changes but does not improve.** Under §2 nobody is trusted;
here the host is. A host who edits the page decides what damage they took. For
friends agreeing to duel, that is fine and always has been — this is how every
peer-hosted shooter has worked. For anything with a leaderboard attached it is
not, and no amount of client-side validation fixes it.

**So the honest recommendation:** peer-hosted private matches are the cheapest
real PvP this game can have, and they are worth building *for what they are* —
you and your friends, an invite code, a duel. They are not a step toward
ranked play. If ranked is the destination, async ghosts (above) remain the
first thing to build, because they answer "do people want to fight each other"
without needing either a game server or a trusted host.

---

## 3. Making the repository private

I cannot do this — changing repository visibility is an owner-level setting on
your GitHub account, and the integration this session runs under has no access
to it. It is three clicks and takes about ten seconds:

1. `https://github.com/cypris133773-glitch/claudekk` → **Settings**
2. Scroll to **Danger Zone** → **Change repository visibility**
3. **Make private**, then type the repository name to confirm

**What you asked about stays true after that.** A private repository is fully
editable by you and by anyone you invite. Nothing about pushing, branching or
editing changes. Two things to know:

- **Vercel keeps deploying.** The GitHub integration is already authorised, so
  private repositories deploy exactly as public ones do. You should not have to
  reconnect anything, but check that the deployment after the switch is green
  before assuming it.
- **Anyone who forked or starred it keeps their existing fork.** Going private
  does not reach into copies already made. Nobody has forked this repository,
  so in practice this is not an issue — but it is worth knowing that private is
  not the same as unpublished.

One thing that will *not* be hidden by making the repo private: the game
itself. It ships as JavaScript to the browser, so the deployed build is
readable by anyone who opens developer tools on the Vercel URL. That is true of
every web game and is not something a private repository changes. If shipping
on the Play Store is the goal, the store build wraps the same JavaScript, and
the protection there is the store listing and the trademark, not obscurity.
