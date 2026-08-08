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

export const MODE_BY_ID = Object.fromEntries(DUEL_MODES.map((m) => [m.id, m]));

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
    roundsToWin: opts.roundsToWin || ROUNDS_TO_WIN,
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
    // Booleans as a bitfield: three of them fit in one number and the JSON is
    // half the size for it.
    b: (state.attack ? 1 : 0) | (state.jump ? 2 : 0) | (state.sprint ? 4 : 0),
    // Skills and potions are edge-triggered, so they are sent as "which fired
    // this frame" rather than as held state — a held skill button would cast
    // forever.
    k: bits(state.skills),
    q: bits(state.potions),
  };
}

function bits(list) {
  let n = 0;
  for (let i = 0; i < (list || []).length; i++) if (list[i]) n |= (1 << i);
  return n;
}

/**
 * Turn a packed input back into the object `Player.update` expects.
 *
 * Writes into an existing object rather than making a new one, because the
 * player consumes edge triggers by clearing them in place — `input.skills[i]
 * = false` after a cast is how the game has always stopped a held button from
 * casting every frame, and handing it a fresh object each step would break
 * that in a way that only shows up as "my skill fires four times".
 */
export function unpackInto(target, msg) {
  target.moveX = msg.mx || 0;
  target.moveY = msg.my || 0;
  target.lookX = 0;
  target.lookY = 0;
  target.attack = !!(msg.b & 1);
  target.jump = !!(msg.b & 2);
  target.sprint = !!(msg.b & 4);
  target.pause = false;
  // OR rather than assign: a skill pressed in a frame the sim has not run yet
  // must not be erased by the next packet arriving first. It is cleared by the
  // cast, which is the only thing that should clear it.
  for (let i = 0; i < 4; i++) if (msg.k & (1 << i)) target.skills[i] = true;
  for (let i = 0; i < 3; i++) if (msg.q & (1 << i)) target.potions[i] = true;
  target.yaw = msg.a || 0;
  target.pitch = msg.p || 0;
  return target;
}

function blankInput() {
  return {
    moveX: 0, moveY: 0, lookX: 0, lookY: 0,
    attack: false, jump: false, sprint: false, pause: false,
    skills: [false, false, false, false],
    potions: [false, false, false],
    yaw: 0, pitch: 0,
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
    this.onSnapshot = opts.onSnapshot || (() => {});
    /** Who we are, as the far side needs to know us. Set before invite/join. */
    this.me = opts.me || null;

    /** peers, by id. The host has one per joiner; a joiner has exactly one. */
    this.peers = new Map();
    /** Everyone in the match, including the local player, by id. */
    this.roster = new Map();
    this.localId = this.isHost ? 'h' : null;
    this.config = null;
    this.started = false;

    // Host: last input received per seat, applied on the next step. A frame
    // with nothing new reuses the last one rather than treating silence as
    // "released every key", which is what makes a dropped packet a stutter
    // instead of a stop.
    this.inputs = new Map();
    this.seq = 0;
    this.rtt = 0;
    this.snapAcc = 0;
    this.lastSeen = new Map();
  }

  /** Everyone, in a stable order both sides agree on. */
  seats() {
    return [...this.roster.values()];
  }

  /** How many the chosen mode still wants before it can start. */
  get seatsWanted() {
    return (MODE_BY_ID[this.mode] || MODE_BY_ID['1v1']).size * 2;
  }

  get full() {
    return this.roster.size >= this.seatsWanted;
  }

  // --- hosting -------------------------------------------------------------

  /**
   * Seat the host itself.
   *
   * Called once before the first invite, so that the roster the lobby shows
   * and the roster the match starts from are the same list — a host that
   * added itself only at start time would show a 2v2 lobby with three people
   * in it and then start a match with four.
   */
  seatSelf() {
    this.roster.set('h', { ...this.me, id: 'h', team: 0 });
    this.onRoster();
  }

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
    this.lastSeen.set(peer.id, Date.now());
    if (msg.t === 'input') {
      unpackInto(this.inputFor(peer.id), msg);
    } else if (msg.t === 'join') {
      // Their character, sent once. Everything else about them is derived.
      this.roster.set(peer.id, {
        id: peer.id,
        name: String(msg.name || 'Player').slice(0, 16),
        classId: msg.classId,
        talents: msg.talents || {},
        perm: msg.perm || {},
        loadout: msg.loadout || null,
        weaponTier: msg.weaponTier ?? -1,
        ranks: Math.min(24, msg.ranks || 0),
        team: this.nextTeam(),
      });
      this.onRoster();
      this.broadcast({ t: 'roster', r: this.seats() });
    } else if (msg.t === 'pong') {
      peer.rtt = Math.max(0, Date.now() - msg.at);
    }
  }

  /**
   * The emptier side, so a 2v2 fills evenly however people arrive.
   *
   * Counting rather than alternating: someone dropping out of a filling lobby
   * used to leave the alternation off by one, and the next two joiners would
   * both land on the same side.
   */
  nextTeam() {
    let a = 0, b = 0;
    for (const s of this.roster.values()) (s.team === 0 ? a++ : b++);
    return a <= b ? 0 : 1;
  }

  /** The persistent input object for one seat. */
  inputFor(id) {
    let inp = this.inputs.get(id);
    if (!inp) { inp = blankInput(); this.inputs.set(id, inp); }
    return inp;
  }

  broadcast(msg) {
    for (const p of this.peers.values()) p.send(msg);
  }

  /** Host: lock the lobby and tell everyone to build the same arena. */
  start(config) {
    this.config = config;
    this.started = true;
    this.broadcast({ t: 'start', config, r: this.seats() });
  }

  /**
   * Called every frame by the host. Sends a snapshot when one is due.
   *
   * Rate-limited here rather than at the call site so that the one place that
   * knows what SNAPSHOT_HZ means is the one that enforces it, and so a frame
   * rate that dips does not quietly halve the tick rate of the match.
   */
  tick(dt, game) {
    if (!this.isHost || !this.started) return false;
    this.snapAcc += dt;
    const step = 1 / SNAPSHOT_HZ;
    if (this.snapAcc < step) return false;
    this.snapAcc = this.snapAcc % step;
    this.broadcast({ t: 'snap', at: Date.now(), ...game.collectSnapshot() });
    return true;
  }

  // --- joining -------------------------------------------------------------

  async join(code, me) {
    if (me) this.me = me;
    const peer = new Peer({
      id: 'h',
      onMessage: (m) => this.joinReceive(m),
      onOpen: () => this.onLog('connected to host'),
      onClose: () => { this.onEnd('The host disconnected.'); },
    });
    this.peers.set('h', peer);
    return peer.acceptOffer(code);
  }

  joinReceive(msg) {
    const peer = this.peers.get('h');
    // The peer can be gone by the time a message is handled: `close()` clears
    // the map, and a datagram already in flight still arrives afterwards. Every
    // branch below replies on `peer`, so one guard here is the difference
    // between leaving a lobby cleanly and a TypeError on the way out.
    if (!peer) return;
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
      peer.send({ t: 'join', ...this.me });
    } else if (msg.t === 'roster') {
      this.roster = new Map(msg.r.map((r) => [r.id, r]));
      this.onRoster();
    } else if (msg.t === 'start') {
      this.config = msg.config;
      this.mode = msg.config.mode;
      this.roster = new Map(msg.r.map((r) => [r.id, r]));
      this.started = true;
      this.onStart(msg.config, this.seats());
    } else if (msg.t === 'snap') {
      this.onSnapshot(msg);
      peer.send({ t: 'pong', at: msg.at });
    } else if (msg.t === 'end') {
      this.onEnd(msg.why);
    }
  }

  sendInput(state, yaw, pitch) {
    const peer = this.peers.get('h');
    if (!peer) return;
    peer.send({ t: 'input', ...packInput(state, yaw, pitch, this.seq++) });
    this.rtt = peer.rtt || 0;
  }

  dropPeer(id) {
    const p = this.peers.get(id);
    if (p) p.close();
    this.peers.delete(id);
    this.roster.delete(id);
    this.inputs.delete(id);
    this.onRoster();
    if (this.isHost) this.broadcast({ t: 'roster', r: this.seats() });
  }

  close() {
    for (const p of this.peers.values()) p.close();
    this.peers.clear();
    this.roster.clear();
    this.inputs.clear();
  }
}

/** Turning the short way round, so a yaw crossing PI does not spin. */
export function shortestTurn(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
