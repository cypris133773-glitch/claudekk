// The thing the lobby screen presses buttons on.
//
// Three pieces have to be introduced to each other for a hosted match to
// happen: the transport (`peer.js`), the protocol (`duel.js`) and the game
// (`Game.startDuel`). None of them should know about the other two, and the
// menu should know about none of them — a screen that reaches into a WebRTC
// connection is a screen that cannot be redrawn without breaking a match.
//
// So this is the seam. It owns the match, holds the codes a human is
// currently carrying between two browsers, and tells the menu when to redraw
// by calling one function. Everything it exposes is either a field the screen
// prints or a verb a button calls.

import { Match, matchConfig, DUEL_MODES } from './duel.js';
import { peerSupported } from './peer.js';
import { permanentMods, masteryMods, masteryRank } from '../data/permanent.js';
import { gearMods, mergeMods, ownedTier } from '../data/armor.js';
import { LAYOUT_COUNT } from '../world/world.js';
import {
  listRooms, publishRoom, claimRoom, answerRoom, fetchAnswer, closeRoom,
  matchmakingAvailable, POLL_MS, HOST_TIMEOUT,
} from './rooms.js';

/**
 * Everything the far side needs to build your character, and nothing else.
 *
 * Not a save file. The host reconstructs a Player from this and runs it, which
 * means every field here is something the host will trust — so it is the
 * shortest list that produces the right character, and the ranks are clamped
 * on arrival rather than here, because a number you send is a number the other
 * end must not believe.
 */
export function selfPayload(profile, charId) {
  const ch = profile.character(charId);
  const cls = profile.classOf(charId);
  const perm = permanentMods(profile.forgeLevels(charId));
  mergeMods(perm, gearMods(cls.id, profile.gear(charId)));
  for (const [k, v] of Object.entries(masteryMods(masteryRank(ch.mastery || 0)))) {
    perm[k] = (perm[k] || 0) + v;
  }
  return {
    name: ch.name,
    classId: cls.id,
    talents: ch.talents || {},
    perm,
    loadout: profile.loadout(charId),
    weaponTier: ownedTier(profile.gear(charId), 'weapon'),
    // Skill ranks a run would normally earn by clearing waves. A duel has no
    // waves, so both sides start at the rank their level says they have earned
    // — otherwise every match would be fought with rank-0 skills, and every
    // talent that modifies a rank would do nothing.
    ranks: Math.min(24, Math.floor(profile.level(charId) / 3)),
  };
}

export class Lobby {
  constructor(opts) {
    this.profile = opts.profile;
    this.build = opts.build;
    this.onEnter = opts.onEnter;        // (config, seats, match, isHost) => void
    this.onFail = opts.onFail || (() => {});
    this.supported = peerSupported();
    this.onChange = () => {};

    this.match = null;
    this.role = null;
    this.mode = DUEL_MODES[0].id;
    this.invites = [];
    this.answer = '';
    this.status = '';
    this.error = '';
    this.charId = null;

    // Public games. `rooms` is the last list fetched, `publicId` the room this
    // client is currently hosting, `matchmaking` whether the deployment has a
    // store behind it at all.
    this.rooms = [];
    this.roomsAt = 0;
    this.listing = false;
    this.publicId = null;
    this.matchmaking = null;
    // Whether the server is keeping rooms somewhere shared. False means it is
    // holding them in one instance's memory because no key-value store is
    // connected: public games work, but two players who land on different
    // instances will not see each other. Worth saying out loud in the lobby.
    this.roomsShared = true;
    this.pollTimer = null;
  }

  // --- public games --------------------------------------------------------

  /** Does this build have matchmaking? Null until the first answer arrives. */
  async checkMatchmaking() {
    this.matchmaking = await matchmakingAvailable();
    this.changed();
    return this.matchmaking;
  }

  /** Refresh the list of open games. Cheap, and safe to call from a redraw. */
  async refreshRooms(force = false) {
    if (this.listing) return;
    if (!force && Date.now() - this.roomsAt < 4000) return;
    this.listing = true;
    const r = await listRooms();
    this.listing = false;
    this.roomsAt = Date.now();
    this.matchmaking = !r.off;
    // Told apart on purpose: a missing store is three clicks in a dashboard,
    // and a server that is not running the function at all is a deployment
    // problem. Reporting both as "switched off" sends whoever has the second
    // one to the wrong page.
    this.broken = !!r.broken;
    if (r.shared !== undefined) this.roomsShared = !!r.shared;
    this.rooms = r.rooms;
    this.changed();
  }

  /**
   * Host a game anyone can see.
   *
   * The same match, the same offer, the same everything — the only difference
   * is that the code goes to a server instead of to a chat window, and the
   * server hands it to whoever clicks first. If publishing fails the match is
   * still live and the code is still on screen, so a matchmaking outage
   * downgrades this to the private flow rather than breaking it.
   */
  async hostPublic(mode, charId) {
    await this.host(mode, charId);
    if (this.error) return;
    const inv = this.invites[0];
    if (!inv) return;
    this.status = 'Listing your game…';
    this.changed();
    const me = selfPayload(this.profile, charId);
    this.publicId = await publishRoom({
      name: me.name, mode, build: this.build, offer: inv.code,
    });
    if (!this.publicId) {
      this.status = '';
      this.fail('Could not list the game publicly. The invite code below still works.');
      return;
    }
    this.status = 'Waiting for someone to join…';
    this.changed();
    this.pollForAnswer(inv.id, this.publicId, Date.now() + HOST_TIMEOUT);
  }

  /**
   * Wait for a joiner, by asking every couple of seconds.
   *
   * Polling rather than a socket, and that is the whole reason this fits on
   * the hosting the game already has: a serverless function cannot hold a
   * connection open, but it can answer "has anyone answered yet" for the
   * forty times that question gets asked before somebody does.
   */
  pollForAnswer(inviteId, roomId, deadline) {
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(async () => {
      if (!this.match || this.publicId !== roomId) return;
      let answer = null;
      try { answer = await fetchAnswer(roomId); } catch { /* try again */ }
      if (answer) {
        this.publicId = null;
        await this.acceptAnswer(inviteId, answer);
        // One seat filled. A 2v2 or a 3v3 needs the next one listed, which is
        // a fresh offer — a description of one connection cannot serve two.
        if (this.match && !this.match.full) await this.relist();
        return;
      }
      if (Date.now() > deadline) {
        this.publicId = null;
        closeRoom(roomId);
        this.status = 'Nobody joined. Your invite code still works.';
        this.changed();
        return;
      }
      this.pollForAnswer(inviteId, roomId, deadline);
    }, POLL_MS);
  }

  /** List the next seat of a partly-filled game. */
  async relist() {
    await this.addInvite();
    const pending = this.invites.filter((i) => !i.accepted).pop();
    if (!pending) return;
    const me = selfPayload(this.profile, this.charId);
    this.publicId = await publishRoom({
      name: me.name, mode: this.match.mode, build: this.build, offer: pending.code,
    });
    if (this.publicId) this.pollForAnswer(pending.id, this.publicId, Date.now() + HOST_TIMEOUT);
  }

  /**
   * Join a listed game with one tap.
   *
   * Claiming takes it off the list first, so two people who click a second
   * apart do not both spend a minute discovering there was one seat.
   */
  async joinPublic(roomId, charId) {
    this.charId = charId;
    this.role = 'join';
    this.error = '';
    this.answer = '';
    this.status = 'Connecting…';
    this.changed();
    let room = null;
    try { room = await claimRoom(roomId); } catch { /* handled below */ }
    if (!room) {
      this.role = null;
      this.fail('Somebody else took that seat. Pull the list down to refresh.');
      return;
    }
    this.startJoin(charId);
    await this.submitOffer(room.offer);
    if (this.error || !this.answer) return;
    const ok = await answerRoom(roomId, this.answer);
    if (!ok) {
      this.fail('Could not reach the host. They may have closed the game.');
      return;
    }
    // From here the host picks the answer up on its next poll and the two
    // browsers connect directly. Nothing else touches the server.
    this.status = 'Waiting for the host to start…';
    this.changed();
  }

  changed() { this.onChange(); }

  fail(msg) {
    this.error = msg;
    this.changed();
  }

  // --- hosting -------------------------------------------------------------

  async host(mode, charId) {
    this.mode = mode;
    this.charId = charId;
    this.role = 'host';
    this.error = '';
    this.invites = [];
    this.match = new Match({
      host: true,
      build: this.build,
      mode,
      me: selfPayload(this.profile, charId),
      onRoster: () => this.changed(),
      onLog: (s) => { this.status = s; this.changed(); },
      onEnd: (why) => this.fail(why),
    });
    this.match.seatSelf();
    this.changed();
    await this.addInvite();
  }

  async addInvite() {
    if (!this.match) return;
    this.status = 'Making a code…';
    this.changed();
    try {
      const inv = await this.match.invite();
      this.invites.push({ ...inv, accepted: false });
      this.status = '';
    } catch (err) {
      this.fail('Could not make an invite code: ' + msg(err));
      return;
    }
    this.changed();
  }

  async acceptAnswer(id, code) {
    this.error = '';
    try {
      await this.match.accept(id, code);
      const inv = this.invites.find((i) => i.id === id);
      if (inv) inv.accepted = true;
      this.status = 'Connecting…';
    } catch (err) {
      this.fail('That reply code did not work. Ask them to send it again — '
        + 'it has to be the whole thing. (' + msg(err) + ')');
      return;
    }
    this.changed();
  }

  /**
   * Lock the lobby and drop everyone into the same arena.
   *
   * The world is chosen here, once, by the host, and sent — not agreed on by
   * both sides picking from a seed. Everything about the room comes out of
   * these three numbers, and getting them from one place is the difference
   * between two identical arenas and two arenas that are nearly the same.
   */
  begin() {
    const cfg = matchConfig({
      build: this.build,
      mode: this.match.mode,
      seed: 1 + ((Math.random() * 9000) | 0),
      layout: (Math.random() * LAYOUT_COUNT) | 0,
      theme: (Math.random() * 4) | 0,
    });
    this.match.start(cfg);
    this.onEnter(cfg, this.match.seats(), this.match, true);
  }

  // --- joining -------------------------------------------------------------

  startJoin(charId) {
    this.charId = charId;
    this.role = 'join';
    this.error = '';
    this.answer = '';
    this.status = '';
    this.match = new Match({
      host: false,
      build: this.build,
      me: selfPayload(this.profile, charId),
      onRoster: () => this.changed(),
      onLog: (s) => { this.status = s; this.changed(); },
      onEnd: (why) => this.fail(why),
      onStart: (cfg, seats) => this.onEnter(cfg, seats, this.match, false),
      onSnapshot: (snap) => { this.pending = snap; },
    });
    this.changed();
  }

  async submitOffer(code) {
    this.error = '';
    this.status = 'Making your reply…';
    this.changed();
    try {
      this.answer = await this.match.join(code, selfPayload(this.profile, this.charId));
      this.status = 'Send that back to the host';
    } catch (err) {
      this.fail('That code did not work. It has to be the whole thing, '
        + 'pasted exactly. (' + msg(err) + ')');
      return;
    }
    this.changed();
  }

  leave() {
    clearTimeout(this.pollTimer);
    if (this.publicId) { closeRoom(this.publicId); this.publicId = null; }
    if (this.match) this.match.close();
    this.match = null;
    this.role = null;
    this.invites = [];
    this.answer = '';
    this.status = '';
    this.error = '';
    this.changed();
  }
}

const msg = (e) => String(e && e.message ? e.message : e);
