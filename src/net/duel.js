// Hosted matches: 1v1, 2v2, 3v3 in an arena, one player hosting.
//
// The simulation stays exactly where it already is. That is the whole reason
// this is weeks of work rather than months: the alternative — an authoritative
// server — is not "add networking", it is moving the entire game somewhere
// neither player controls and turning both clients into renderers. Here the
// host keeps running `Game.update` at the fixed 60 Hz step it already runs,
// and a joiner sends input instead of applying it locally.
//
// WHAT EACH SIDE DOES
//
//   host    runs the sim. Applies its own input directly, applies each
//           joiner's last received input to that joiner's player, and
//           broadcasts a snapshot of everyone at 20 Hz.
//   joiner  sends its input every frame, and renders the snapshot. Its own
//           character is predicted locally and corrected toward the snapshot,
//           because a 60 ms round trip on your own movement is the one
//           latency a player can always feel.
//
// Everyone else is interpolated between the last two snapshots, which at these
// speeds is invisible and is what stops other players juddering at 20 Hz.
//
// TRUST
//
// The host decides everything, and the host is a person who can edit the page.
// Between friends that is fine — it is how every peer-hosted game has ever
// worked — and it is exactly why this mode has no leaderboard and awards no
// gold. What you get from a duel is the duel.

import { Peer } from './peer.js';

/** How often the host sends the world. 20 Hz, interpolated on the far side. */
export const SNAPSHOT_HZ = 20;

/** Team sizes a match can be. */
export const DUEL_MODES = [
  { id: '1v1', size: 1, name: 'Duel', blurb: 'One against one.' },
  { id: '2v2', size: 2, name: 'Pair', blurb: 'Two a side.' },
  { id: '3v3', size: 3, name: 'Skirmish', blurb: 'Three a side.' },
];

/** First to this many rounds takes the match. */
export const ROUNDS_TO_WIN = 3;

/**
 * Everything both sides agree on before a match starts.
 *
 * Sent once, on connect, rather than assumed. Two players on different builds
 * with different arena generators would desync instantly and invisibly, so the
 * build stamp is checked and a mismatch is refused with a sentence rather than
 * allowed to become a mystery.
 */
export function matchConfig(opts) {
  return {
    build: opts.build,
    mode: opts.mode || '1v1',
    seed: opts.seed,
    layout: opts.layout,
    theme: opts.theme,
  };
}

/**
 * One player in a match, as everyone else sees them.
 *
 * Deliberately small. At six players and twenty snapshots a second this is a
 * few kilobytes a second, and there is no reason to send anything the far side
 * can derive — a name, a class, a colour are sent once at join and never
 * again.
 */
export function packPlayer(p, id) {
  return {
    i: id,
    x: Math.round(p.x * 100) / 100,
    y: Math.round(p.y * 100) / 100,
    z: Math.round(p.z * 100) / 100,
    a: Math.round(p.yaw * 100) / 100,
    h: Math.round(p.hp),
    m: Math.round(p.maxHp),
    // One byte of state rather than a set of flags: what a remote player needs
    // to draw is a pose, and a pose is exactly one of these at a time.
    s: p.dead ? 3 : (p.swing > 0 ? 2 : (Math.hypot(p.vx, p.vz) > 0.6 ? 1 : 0)),
  };
}

/**
 * The input a joiner sends.
 *
 * Sent every frame at 60 Hz, which is 60 small messages a second per joiner.
 * That is more than the snapshots and it is the right way round: input is what
 * cannot be interpolated, because a button press that arrives late is a press
 * that did not happen.
 */
export function packInput(state, yaw, pitch, seq) {
  return {
    n: seq,
    mx: Math.round(state.moveX * 100) / 100,
    my: Math.round(state.moveY * 100) / 100,
    a: Math.round(yaw * 100) / 100,
    p: Math.round(pitch * 100) / 100,
    // Booleans as a bitfield: five of them fit in one number and the JSON is
    // half the size for it.
    b: (state.attack ? 1 : 0) | (state.jump ? 2 : 0) | (state.sprint ? 4 : 0),
    // Skills are edge-triggered, so they are sent as "which fired this frame"
    // rather than as held state — a held skill button would cast forever.
    k: (state.skills || []).reduce((n, on, i) => n | (on ? (1 << i) : 0), 0),
  };
}

export function unpackInput(msg) {
  return {
    moveX: msg.mx || 0,
    moveY: msg.my || 0,
    lookX: 0, lookY: 0,
    attack: !!(msg.b & 1),
    jump: !!(msg.b & 2),
    sprint: !!(msg.b & 4),
    pause: false,
    skills: [0, 1, 2, 3].map((i) => !!(msg.k & (1 << i))),
    potions: [false, false, false],
    yaw: msg.a || 0,
    pitch: msg.p || 0,
  };
}

/**
 * A match, from either side.
 *
 * The same object hosts and joins; `isHost` decides which half of the protocol
 * runs. Keeping them together is what stops the two drifting apart — a message
 * the host sends and a message the joiner expects are written four lines from
 * each other.
 */
export class Match {
  constructor(opts = {}) {
    this.isHost = !!opts.host;
    this.build = opts.build || 'dev';
    this.mode = opts.mode || '1v1';
    this.onLog = opts.onLog || (() => {});
    this.onStart = opts.onStart || (() => {});
    this.onEnd = opts.onEnd || (() => {});
    this.onRoster = opts.onRoster || (() => {});

    /** peers, by id. The host has one per joiner; a joiner has exactly one. */
    this.peers = new Map();
    /** Everyone in the match, including the local player, by id. */
    this.roster = new Map();
    this.localId = this.isHost ? 'h' : null;
    this.config = null;
    this.started = false;

    // Host: last input received per joiner, applied on the next step. A frame
    // with nothing new reuses the last one rather than treating silence as
    // "released every key", which is what makes a dropped packet a stutter
    // instead of a stop.
    this.inputs = new Map();
    // Joiner: the two most recent snapshots, to interpolate between.
    this.snapPrev = null;
    this.snapLast = null;
    this.snapAt = 0;
    this.seq = 0;
    this.rtt = 0;
  }

  // --- hosting -------------------------------------------------------------

  /**
   * Make an invite code for one more player.
   *
   * One code per joiner rather than one code for the match: a WebRTC offer is
   * a description of one connection, and reusing it for a second player
   * connects neither.
   */
  async invite() {
    const id = `p${this.peers.size + 1}`;
    const peer = new Peer({
      id,
      onMessage: (m, p) => this.hostReceive(m, p),
      onOpen: (p) => {
        this.onLog(`${id} connected`);
        // The match's terms, first thing, before anything can disagree.
        p.send({ t: 'hello', id, build: this.build, mode: this.mode, config: this.config });
        this.onRoster();
      },
      onClose: () => { this.dropPeer(id); },
    });
    this.peers.set(id, peer);
    return { id, code: await peer.createOffer() };
  }

  /** Finish one joiner's handshake with the code they sent back. */
  async accept(id, code) {
    const peer = this.peers.get(id);
    if (!peer) throw new Error('no such invite');
    await peer.acceptAnswer(code);
  }

  hostReceive(msg, peer) {
    if (msg.t === 'input') {
      this.inputs.set(peer.id, msg);
    } else if (msg.t === 'join') {
      // Name and class, sent once. Everything else about them is derived.
      this.roster.set(peer.id, { id: peer.id, name: msg.name, classId: msg.classId, team: this.teamFor(peer.id) });
      this.onRoster();
      this.broadcast({ t: 'roster', r: [...this.roster.values()] });
    } else if (msg.t === 'pong') {
      peer.rtt = Math.max(0, Date.now() - msg.at);
    }
  }

  /** Alternating sides, so a 2v2 fills evenly as people arrive. */
  teamFor(id) {
    return this.roster.size % 2;
  }

  broadcast(msg) {
    for (const p of this.peers.values()) p.send(msg);
  }

  /**
   * Send the world. Called at SNAPSHOT_HZ, not per frame.
   *
   * The ping rides along with it rather than being its own message: it is one
   * more field on something already being sent sixty times a minute, and a
   * separate heartbeat would be a second thing to keep alive.
   */
  sendSnapshot(players) {
    if (!this.isHost) return;
    this.broadcast({ t: 'snap', at: Date.now(), p: players });
  }

  // --- joining -------------------------------------------------------------

  async join(code, me) {
    this.me = me;
    const peer = new Peer({
      id: 'h',
      onMessage: (m) => this.joinReceive(m),
      onOpen: () => this.onLog('connected to host'),
      onClose: () => { this.onEnd('The host disconnected.'); },
    });
    this.peers.set('h', peer);
    const answer = await peer.acceptOffer(code);
    return answer;
  }

  joinReceive(msg) {
    const peer = this.peers.get('h');
    if (msg.t === 'hello') {
      // Refused loudly rather than allowed to desync. Two players on different
      // builds generate different arenas from the same seed, and the symptom
      // is each of them standing in a wall the other cannot see.
      if (msg.build !== this.build) {
        this.onEnd(`Different game versions — the host is on ${msg.build}, you are on ${this.build}. Both of you reload.`);
        return;
      }
      this.localId = msg.id;
      this.mode = msg.mode;
      this.config = msg.config;
      peer.send({ t: 'join', name: this.me.name, classId: this.me.classId });
    } else if (msg.t === 'roster') {
      this.roster = new Map(msg.r.map((r) => [r.id, r]));
      this.onRoster();
    } else if (msg.t === 'start') {
      this.config = msg.config;
      this.started = true;
      this.onStart(msg.config);
    } else if (msg.t === 'snap') {
      this.snapPrev = this.snapLast;
      this.snapLast = msg.p;
      this.snapAt = performance.now();
      peer.send({ t: 'pong', at: msg.at });
      this.rtt = 0;
    } else if (msg.t === 'end') {
      this.onEnd(msg.why);
    }
  }

  sendInput(state, yaw, pitch) {
    const peer = this.peers.get('h');
    if (!peer) return;
    peer.send({ t: 'input', ...packInput(state, yaw, pitch, this.seq++) });
  }

  /**
   * Where a remote player is right now, interpolated between the last two
   * snapshots.
   *
   * A fifth of a second between updates is very visible if you draw the last
   * one and wait; interpolating makes it invisible, at the cost of everyone
   * else being drawn slightly in the past. That is the correct trade — being
   * wrong about where someone was 50 ms ago is unnoticeable, and juddering is
   * not.
   */
  interpolated(now = performance.now()) {
    if (!this.snapLast) return [];
    if (!this.snapPrev) return this.snapLast;
    const step = 1000 / SNAPSHOT_HZ;
    const t = Math.min(1, (now - this.snapAt) / step);
    const prev = new Map(this.snapPrev.map((p) => [p.i, p]));
    return this.snapLast.map((p) => {
      const a = prev.get(p.i);
      if (!a) return p;
      return {
        ...p,
        x: a.x + (p.x - a.x) * t,
        y: a.y + (p.y - a.y) * t,
        z: a.z + (p.z - a.z) * t,
        a: a.a + shortestTurn(a.a, p.a) * t,
      };
    });
  }

  dropPeer(id) {
    const p = this.peers.get(id);
    if (p) p.close();
    this.peers.delete(id);
    this.roster.delete(id);
    this.inputs.delete(id);
    this.onRoster();
    if (this.isHost) this.broadcast({ t: 'roster', r: [...this.roster.values()] });
  }

  close() {
    for (const p of this.peers.values()) p.close();
    this.peers.clear();
    this.roster.clear();
  }
}

/** Turning the short way round, so a yaw crossing PI does not spin. */
export function shortestTurn(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
