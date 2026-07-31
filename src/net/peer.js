// Peer-to-peer transport for hosted matches.
//
// Two browsers talk directly over a WebRTC data channel. That is the right
// pipe for this: unreliable, unordered, low-latency, and already present in
// every browser the game runs in. Six players is a small enough group that the
// host can simply run the simulation it already runs and broadcast the result.
//
// WHAT THIS DELIBERATELY DOES NOT NEED
//
// A server. Two browsers cannot find each other without swapping a connection
// description first, and the usual answer is a signalling server — but that
// description is a few hundred bytes of text, and a human can carry it. The
// host generates an invite code, sends it however they already talk to their
// friend, and the friend sends a reply code back. Ugly, and completely real:
// it is a working product for "play with a friend" and it costs nothing to
// run, forever.
//
// WHAT IT DOES COST
//
// STUN, to discover your own public address. Google's is free and is the only
// external request this game makes anywhere — a deliberate exception to the
// zero-requests rule, made once, here, where the alternative is that two
// people on different networks cannot connect at all. On a LAN, or between two
// tabs on one machine, the host candidates are enough and nothing external is
// contacted.
//
// About one pair in six will still fail, because some networks refuse any
// direct connection between two of their clients. Fixing that needs a TURN
// relay, which costs money because the traffic flows through it. That is a
// deliberate omission rather than an oversight: this is the version that is
// free to run, and it tells the player plainly when it cannot connect.
//
// TRUST
//
// The host is authoritative and the host is a person. Someone who edits the
// page decides what damage they took. Between friends agreeing to duel that is
// fine and always has been — it is how every peer-hosted game has worked — but
// it is why this mode has no leaderboard and never will.

/** Public STUN. Only contacted when a direct local route does not exist. */
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * Invite codes are the session description, compressed to something a person
 * can paste into a chat window. JSON with the fields we do not need stripped,
 * then base64. Around 1-2 KB, which is long but survives a paste.
 */
function encodeCode(desc) {
  const slim = { t: desc.type === 'offer' ? 'o' : 'a', s: desc.sdp };
  const json = JSON.stringify(slim);
  // btoa cannot take characters above U+00FF; SDP is ASCII, but a malformed
  // one would throw here rather than at the far end where it is unfixable.
  return btoa(unescape(encodeURIComponent(json))).replace(/=+$/, '');
}

function decodeCode(code) {
  const clean = String(code || '').trim().replace(/\s+/g, '');
  if (!clean) throw new Error('empty code');
  const json = decodeURIComponent(escape(atob(clean)));
  const slim = JSON.parse(json);
  if (!slim.s) throw new Error('not a CRAFT ARENA code');
  return { type: slim.t === 'o' ? 'offer' : 'answer', sdp: slim.s };
}

/**
 * One connection to one other player.
 *
 * The host makes one of these per joiner; a joiner makes exactly one. Messages
 * are JSON — at six players and twenty snapshots a second that is a few
 * kilobytes a second, which is nothing, and the readability is worth more than
 * the bytes until it is not.
 */
export class Peer {
  constructor(opts = {}) {
    this.pc = new RTCPeerConnection({ iceServers: opts.iceServers || ICE });
    this.channel = null;
    this.open = false;
    this.onMessage = opts.onMessage || (() => {});
    this.onOpen = opts.onOpen || (() => {});
    this.onClose = opts.onClose || (() => {});
    this.id = opts.id || null;
    // Round-trip time, measured from the ping the host sends with every
    // snapshot. Shown in the lobby, because "why does this feel bad" should
    // have a visible answer.
    this.rtt = 0;

    this.pc.onconnectionstatechange = () => {
      const st = this.pc.connectionState;
      if (st === 'failed' || st === 'closed' || st === 'disconnected') {
        if (this.open) { this.open = false; this.onClose(this); }
      }
    };
  }

  bindChannel(ch) {
    this.channel = ch;
    // Unreliable and unordered: a snapshot that arrives late is worse than one
    // that never arrives, because the newer one behind it is already correct.
    ch.onopen = () => { this.open = true; this.onOpen(this); };
    ch.onclose = () => { if (this.open) { this.open = false; this.onClose(this); } };
    ch.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this.onMessage(msg, this);
    };
  }

  send(msg) {
    if (!this.open) return false;
    try { this.channel.send(JSON.stringify(msg)); return true; } catch { return false; }
  }

  close() {
    try { if (this.channel) this.channel.close(); } catch { /* already gone */ }
    try { this.pc.close(); } catch { /* already gone */ }
    this.open = false;
  }

  /**
   * Wait until ICE has finished gathering, then hand back the code.
   *
   * Gathering incrementally and trickling candidates is the fast way to do
   * this and it needs a live channel between the peers to trickle over — which
   * is exactly what we do not have before they are connected. So: wait for the
   * complete description, put all of it in one code, and hand the player one
   * string instead of a conversation.
   *
   * Capped, because a network with no route out can gather forever, and a
   * partial description with local candidates still works on a LAN.
   */
  async gather(timeoutMs = 4000) {
    if (this.pc.iceGatheringState === 'complete') return this.pc.localDescription;
    await new Promise((resolve) => {
      const done = () => {
        this.pc.removeEventListener('icegatheringstatechange', check);
        clearTimeout(timer);
        resolve();
      };
      const check = () => { if (this.pc.iceGatheringState === 'complete') done(); };
      const timer = setTimeout(done, timeoutMs);
      this.pc.addEventListener('icegatheringstatechange', check);
      check();
    });
    return this.pc.localDescription;
  }

  /** Host side: make the channel, then the offer, then the invite code. */
  async createOffer() {
    this.bindChannel(this.pc.createDataChannel('craftarena', {
      ordered: false,
      maxRetransmits: 0,
    }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    return encodeCode(await this.gather());
  }

  /** Host side: finish the handshake with the code the joiner sent back. */
  async acceptAnswer(code) {
    await this.pc.setRemoteDescription(decodeCode(code));
  }

  /** Joiner side: take the host's code, return the one to send back. */
  async acceptOffer(code) {
    this.pc.ondatachannel = (e) => this.bindChannel(e.channel);
    await this.pc.setRemoteDescription(decodeCode(code));
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    return encodeCode(await this.gather());
  }
}

/** Whether this browser can host or join at all. */
export function peerSupported() {
  return typeof RTCPeerConnection === 'function';
}

export const _codec = { encodeCode, decodeCode };
