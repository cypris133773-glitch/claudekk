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
