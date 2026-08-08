// The smallest possible matchmaking server.
//
// WHY THERE HAS TO BE ONE AT ALL
//
// Two browsers cannot find each other. WebRTC connects them directly once they
// have swapped a connection description, but *swapping* it needs a third party
// that both can reach — and until now that third party was a human carrying a
// code between two chat windows. Removing the code does not remove the job; it
// moves it here.
//
// So this holds one small piece of text per open game, for ninety seconds, and
// that is the entire product. No accounts, no sessions, no match history, no
// player records. Once two browsers are connected the room is deleted and this
// server has nothing to do with the game they play.
//
// WHAT IT COSTS
//
// One Vercel serverless function and a key-value store, which on the free tier
// is free. It is stateless by necessity — serverless functions do not share
// memory and there is no guarantee two requests hit the same instance — so the
// rooms live in the KV, not in a variable.
//
// It degrades rather than breaks: with no KV configured, every endpoint
// answers with `configured: false` and the game falls back to the invite codes,
// which have never needed anything and still do not.
//
// WHAT IT DELIBERATELY DOES NOT DO
//
// It does not relay gameplay. A TURN relay would fix the roughly one pair in
// six whose network refuses a direct connection, and it would do it by pushing
// every packet of every match through a server someone has to pay for. That is
// the line between "free forever" and "a hosting bill that grows with success",
// and it is drawn here on purpose.

/** How long an unanswered room stays listed. */
const ROOM_TTL = 90;

/** Hard cap on the list, so one bad actor cannot fill the lobby. */
const MAX_ROOMS = 60;

/** Longest an SDP blob may be. Real ones are 1-2 KB. */
const MAX_BLOB = 8000;

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const configured = !!(KV_URL && KV_TOKEN);

/**
 * One Upstash REST command.
 *
 * The REST API rather than a Redis client, because a serverless function that
 * opens a TCP connection pays for it on every cold start and this does at most
 * two round trips per request anyway.
 */
async function kv(...args) {
  const res = await fetch(`${KV_URL}/${args.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!res.ok) throw new Error(`kv ${res.status}`);
  const body = await res.json();
  return body.result;
}

const json = (res, status, body) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  // Rooms are live data with a ninety-second life. A cached room list is a
  // list of games that already started.
  res.setHeader('cache-control', 'no-store');
  res.status(status).end(JSON.stringify(body));
};

/** Room ids are short and human-safe: no vowels, so no accidental words. */
function newId() {
  const abc = '23456789BCDFGHJKLMNPQRSTVWXZ';
  let s = '';
  for (let i = 0; i < 6; i++) s += abc[(Math.random() * abc.length) | 0];
  return s;
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

export default async function handler(req, res) {
  if (!configured) {
    // Not an error. A build with no store is a build where public games are
    // switched off, and the client is built to say so and offer the codes.
    return json(res, 200, {
      configured: false,
      why: 'No key-value store is connected, so public games are off. '
        + 'Invite codes still work.',
    });
  }

  try {
    const action = String((req.query && req.query.action) || 'list');

    // --- list --------------------------------------------------------------
    if (req.method === 'GET' && action === 'list') {
      const ids = (await kv('smembers', 'ca:rooms')) || [];
      const out = [];
      for (const id of ids.slice(0, MAX_ROOMS)) {
        const raw = await kv('get', `ca:room:${id}`);
        // Expired: Redis dropped the room but the index still names it. The
        // read is what notices, so the read is what cleans up.
        if (!raw) { await kv('srem', 'ca:rooms', id); continue; }
        const room = JSON.parse(raw);
        // The offer itself is not in the listing. It is one to two kilobytes
        // per room and nobody browsing needs it — it is fetched by the one
        // person who clicks join.
        out.push({ id, name: room.name, mode: room.mode, build: room.build, at: room.at });
      }
      out.sort((a, b) => b.at - a.at);
      return json(res, 200, { configured: true, rooms: out });
    }

    // --- host: publish an offer --------------------------------------------
    if (req.method === 'POST' && action === 'host') {
      const body = req.body || {};
      const offer = str(body.offer, MAX_BLOB);
      if (!offer) return json(res, 400, { error: 'no offer' });
      const count = (await kv('scard', 'ca:rooms')) || 0;
      if (count >= MAX_ROOMS) return json(res, 503, { error: 'the lobby is full' });
      const id = newId();
      const room = {
        name: str(body.name, 20) || 'A game',
        mode: str(body.mode, 8) || '1v1',
        build: str(body.build, 40),
        offer,
        at: Date.now(),
      };
      await kv('set', `ca:room:${id}`, JSON.stringify(room), 'EX', String(ROOM_TTL));
      await kv('sadd', 'ca:rooms', id);
      // The index has no expiry of its own — the list read above prunes it —
      // but a stale index that nobody ever reads would live forever, so it
      // gets a long ceiling.
      await kv('expire', 'ca:rooms', '3600');
      return json(res, 200, { configured: true, id });
    }

    // --- join: take the offer and leave an answer --------------------------
    if (req.method === 'POST' && action === 'join') {
      const id = str((req.query && req.query.id) || '', 8);
      const raw = await kv('get', `ca:room:${id}`);
      if (!raw) return json(res, 404, { error: 'that game is gone' });
      const room = JSON.parse(raw);
      const answer = str((req.body || {}).answer, MAX_BLOB);
      if (!answer) {
        // First half of the handshake: hand back the offer and take the room
        // off the list, so two people cannot both try to join the same seat.
        await kv('srem', 'ca:rooms', id);
        return json(res, 200, { configured: true, offer: room.offer, mode: room.mode, build: room.build });
      }
      await kv('set', `ca:answer:${id}`, answer, 'EX', String(ROOM_TTL));
      return json(res, 200, { configured: true, ok: true });
    }

    // --- host: poll for the answer -----------------------------------------
    if (req.method === 'GET' && action === 'answer') {
      const id = str((req.query && req.query.id) || '', 8);
      const answer = await kv('get', `ca:answer:${id}`);
      if (!answer) return json(res, 200, { configured: true, waiting: true });
      // Consumed. The handshake happens once and the blob is useless after.
      await kv('del', `ca:answer:${id}`);
      await kv('del', `ca:room:${id}`);
      await kv('srem', 'ca:rooms', id);
      return json(res, 200, { configured: true, answer });
    }

    // --- host: withdraw ----------------------------------------------------
    if (req.method === 'POST' && action === 'close') {
      const id = str((req.query && req.query.id) || '', 8);
      await kv('del', `ca:room:${id}`);
      await kv('srem', 'ca:rooms', id);
      return json(res, 200, { configured: true, ok: true });
    }

    return json(res, 400, { error: 'unknown action' });
  } catch (err) {
    // The store being down must not look like the game being broken.
    return json(res, 503, { configured: true, error: 'matchmaking is unavailable right now' });
  }
}
