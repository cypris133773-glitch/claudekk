// Talking to the matchmaking server, which is one endpoint and five verbs.
//
// This is the *only* place in the game that makes a request to its own origin.
// Everything else — art, audio, the world, the whole build — is generated in
// code and shipped in one file, and that is a property worth naming every time
// something threatens it. Public games threaten it, so the threat is confined
// to this module: nothing here is needed for a run, a raid, or a duel arranged
// by code, and if every one of these calls fails the game does not notice.
//
// The handshake, end to end:
//
//   host    makes an offer, publishes it, then polls for an answer
//   joiner  lists rooms, claims one, gets the offer, posts back an answer
//   both    connect directly and the server never hears from them again
//
// It is the same two blobs the invite codes carry. The only thing that changed
// is who carries them.

const BASE = '/api/rooms';

/** Longest we will wait for a joiner before the room is assumed stale. */
export const HOST_TIMEOUT = 80000;

/** How often the host asks whether anyone has answered. */
export const POLL_MS = 2000;

async function call(action, opts = {}) {
  const url = `${BASE}?action=${encodeURIComponent(action)}`
    + (opts.id ? `&id=${encodeURIComponent(opts.id)}` : '');
  const res = await fetch(url, {
    method: opts.body ? 'POST' : 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  // A non-JSON body means something between here and the function answered —
  // a proxy, an error page, a static host with no functions at all. Treated as
  // "public games are off" rather than thrown, because that is what it means
  // to the player.
  let data = null;
  try { data = await res.json(); } catch { return { configured: false }; }
  return data || { configured: false };
}

/** Whether this deployment has matchmaking at all. Cached after the first ask. */
let known = null;
export async function matchmakingAvailable() {
  if (known !== null) return known;
  try {
    const r = await call('list');
    known = r.configured !== false;
  } catch {
    known = false;
  }
  return known;
}

/** Open games, newest first. Never throws — an empty list is a fine answer. */
export async function listRooms() {
  try {
    const r = await call('list');
    if (r.configured === false) { known = false; return { off: true, rooms: [] }; }
    return { off: false, rooms: r.rooms || [] };
  } catch {
    return { off: false, rooms: [], error: true };
  }
}

/** Publish an offer. Returns the room id, or null if it could not be listed. */
export async function publishRoom({ name, mode, build, offer }) {
  const r = await call('host', { body: { name, mode, build, offer } });
  return r && r.id ? r.id : null;
}

/**
 * Claim a room and take its offer.
 *
 * Claiming removes it from the list, so two people clicking the same game a
 * second apart do not both spend a minute discovering that only one of them
 * has a seat.
 */
export async function claimRoom(id) {
  const r = await call('join', { id, body: {} });
  return r && r.offer ? r : null;
}

/** Post the answer back for the host to collect. */
export async function answerRoom(id, answer) {
  const r = await call('join', { id, body: { answer } });
  return !!(r && r.ok);
}

/** Ask once whether anyone has answered yet. */
export async function fetchAnswer(id) {
  const r = await call('answer', { id });
  return r && r.answer ? r.answer : null;
}

/** Take a room down — the host left, or the seat is filled. */
export async function closeRoom(id) {
  try { await call('close', { id, body: {} }); } catch { /* it expires anyway */ }
}
