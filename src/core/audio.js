// Procedural audio via WebAudio — no sample files to ship or license.

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.musicTimer = null;
    this.started = false;
    this.blocked = false;
    this.samples = new Map();
  }

  /** Every sound cue the game triggers. Also the sound-pack file names. */
  static CUES = [
    'swing', 'whiff', 'hit', 'crit', 'shoot', 'cast', 'nova', 'zap', 'explode',
    'blink', 'charge', 'heal', 'buff', 'drain', 'summon', 'fuse', 'roar',
    'hurt', 'death', 'levelup', 'wave', 'buy', 'ui', 'deny',
    // Added with the skill-rank rework and the wider bestiary.
    'rankup', 'windup', 'stagger', 'gib', 'shatter', 'curse', 'stomp',
    'bossdown', 'dodge', 'lowhp',
  ];

  /**
   * Must be called from a user gesture (browsers block audio otherwise).
   * Called from startRun, so a throw here would mean pressing PLAY does
   * nothing at all — the game must stay playable in silence instead.
   */
  ensure() {
    if (this.ctx) { this.resume(); return; }
    if (this.blocked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.blocked = true; return; }
    try {
      // Construction throws where there is no audio output device, where an
      // embedder's permissions policy refuses it, and once a page has hit the
      // browser's limit on live contexts. Only publish a fully wired graph:
      // every play path assumes master and musicGain exist when ctx does.
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = this.settings.sfxVolume;
      master.connect(ctx.destination);
      const musicGain = ctx.createGain();
      musicGain.gain.value = this.settings.musicVolume * 0.25;
      musicGain.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.musicGain = musicGain;
    } catch (err) {
      this.blocked = true;
      this.ctx = this.master = this.musicGain = null;
      console.warn('Audio unavailable; playing silent.', err);
      return;
    }
    this.resume();
  }

  /**
   * Nudge a suspended context. resume() rejects when the calling gesture was
   * not trusted and throws on a context the OS has already closed; either way
   * the next gesture tries again, so a failure is not worth reporting.
   */
  resume() {
    if (!this.ctx || this.ctx.state !== 'suspended') return;
    try {
      const p = this.ctx.resume();
      if (p && p.catch) p.catch(() => {});
    } catch { /* closed or refused — stays silent */ }
  }

  applySettings() {
    if (this.master) this.master.gain.value = this.settings.sfxVolume;
    if (this.musicGain) this.musicGain.gain.value = this.settings.musicVolume * 0.25;
  }

  /** One-shot tone with an envelope. */
  tone({ freq = 440, type = 'square', dur = 0.12, gain = 0.3, sweep = 0, delay = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + sweep), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  /** Filtered noise burst — impacts, explosions, footsteps. */
  noise({ dur = 0.2, gain = 0.3, freq = 900, q = 1, delay = 0, sweep = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(freq, t0);
    if (sweep) filt.frequency.exponentialRampToValueAtTime(Math.max(60, freq + sweep), t0 + dur);
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  /**
   * Optional sound pack. Drop audio files named after the cue ids below into
   * assets/sounds/ and they replace the procedural tone for that cue.
   * Anything missing silently falls back to code-generated audio, so the game
   * always ships playable with no binary assets. See assets/sounds/README.md
   * for the file list and licensing notes.
   */
  async loadSoundPack(base = 'assets/sounds', names = Audio.CUES, ext = 'ogg') {
    this.ensure();
    if (!this.ctx) return 0;
    let loaded = 0;
    await Promise.all(names.map(async (name) => {
      try {
        const res = await fetch(`${base}/${name}.${ext}`);
        if (!res.ok) return;
        // Safari's older callback form of decodeAudioData returns nothing at
        // all rather than a promise, so an awaited undefined is not a sample.
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        if (!buf) return;
        this.samples.set(name, buf);
        loaded++;
      } catch {
        /* no file for this cue — keep the procedural version */
      }
    }));
    return loaded;
  }

  playSample(name) {
    const buf = this.samples.get(name);
    if (!buf || !this.ctx) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 1;
    src.playbackRate.value = 0.94 + Math.random() * 0.12;   // slight variation
    src.connect(g); g.connect(this.master);
    src.start();
    return true;
  }

  play(name) {
    if (!this.ctx) return;
    // Every node factory throws InvalidStateError on a context the platform
    // has closed under us — iOS does exactly that on an audio interruption.
    // Cues fire from the fixed-step update, so an escaping throw would cost
    // the frame rather than the sound.
    try {
      if (this.playSample(name)) return;
      this.playProcedural(name);
    } catch { /* cue dropped; the run carries on */ }
  }

  playProcedural(name) {
    switch (name) {
      case 'swing': this.noise({ dur: 0.11, gain: 0.20, freq: 1500, sweep: -900 }); break;
      case 'whiff': this.noise({ dur: 0.09, gain: 0.09, freq: 800, sweep: -400 }); break;
      case 'hit': this.noise({ dur: 0.09, gain: 0.26, freq: 400, q: 0.8 }); break;
      case 'crit':
        this.noise({ dur: 0.13, gain: 0.32, freq: 600, q: 0.7 });
        this.tone({ freq: 900, type: 'square', dur: 0.10, gain: 0.16, sweep: 500 });
        break;
      case 'shoot': this.tone({ freq: 700, type: 'sawtooth', dur: 0.10, gain: 0.14, sweep: -350 }); break;
      case 'cast': this.tone({ freq: 340, type: 'triangle', dur: 0.20, gain: 0.18, sweep: 420 }); break;
      case 'nova':
        this.tone({ freq: 220, type: 'sine', dur: 0.35, gain: 0.24, sweep: 500 });
        this.noise({ dur: 0.3, gain: 0.18, freq: 1200, sweep: -900 });
        break;
      case 'zap':
        this.tone({ freq: 1400, type: 'square', dur: 0.09, gain: 0.16, sweep: -900 });
        this.noise({ dur: 0.15, gain: 0.14, freq: 3000, sweep: -2200 });
        break;
      case 'explode':
        this.noise({ dur: 0.5, gain: 0.42, freq: 240, q: 0.5, sweep: -180 });
        this.tone({ freq: 90, type: 'sine', dur: 0.45, gain: 0.3, sweep: -50 });
        break;
      case 'blink': this.tone({ freq: 1200, type: 'sine', dur: 0.16, gain: 0.16, sweep: -800 }); break;
      case 'charge': this.noise({ dur: 0.3, gain: 0.22, freq: 300, sweep: 900 }); break;
      case 'heal': this.tone({ freq: 520, type: 'sine', dur: 0.28, gain: 0.18, sweep: 340 }); break;
      case 'buff': this.tone({ freq: 300, type: 'triangle', dur: 0.26, gain: 0.16, sweep: 260 }); break;
      case 'drain': this.tone({ freq: 160, type: 'sawtooth', dur: 0.35, gain: 0.14, sweep: 120 }); break;
      case 'summon':
        this.tone({ freq: 180, type: 'sawtooth', dur: 0.3, gain: 0.18, sweep: 300 });
        this.tone({ freq: 260, type: 'triangle', dur: 0.35, gain: 0.12, sweep: 200, delay: 0.06 });
        break;
      case 'fuse': this.tone({ freq: 1500, type: 'square', dur: 0.5, gain: 0.10, sweep: 900 }); break;
      case 'roar':
        this.tone({ freq: 70, type: 'sawtooth', dur: 0.8, gain: 0.34, sweep: 60 });
        this.noise({ dur: 0.7, gain: 0.2, freq: 200, sweep: 260 });
        break;
      case 'hurt': this.tone({ freq: 200, type: 'square', dur: 0.14, gain: 0.22, sweep: -120 }); break;
      case 'death':
        this.tone({ freq: 320, type: 'sawtooth', dur: 0.9, gain: 0.3, sweep: -260 });
        break;
      case 'levelup':
        [0, 0.09, 0.18, 0.30].forEach((d, i) =>
          this.tone({ freq: 440 * Math.pow(1.26, i), type: 'triangle', dur: 0.2, gain: 0.2, delay: d }));
        break;
      case 'wave':
        [0, 0.14].forEach((d, i) =>
          this.tone({ freq: 300 + i * 160, type: 'square', dur: 0.3, gain: 0.2, delay: d }));
        break;
      case 'buy': this.tone({ freq: 660, type: 'triangle', dur: 0.14, gain: 0.2, sweep: 300 }); break;
      case 'ui': this.tone({ freq: 520, type: 'square', dur: 0.05, gain: 0.10 }); break;
      case 'deny': this.tone({ freq: 160, type: 'square', dur: 0.14, gain: 0.16, sweep: -60 }); break;

      // A rank-up is the reward beat of the whole run: a rising arpeggio with
      // a bell on top, longer and brighter than an ordinary pickup.
      case 'rankup':
        [0, 0.07, 0.14, 0.22, 0.32].forEach((d, i) =>
          this.tone({ freq: 392 * Math.pow(1.26, i), type: 'triangle', dur: 0.26, gain: 0.20, delay: d }));
        this.tone({ freq: 1568, type: 'sine', dur: 0.7, gain: 0.12, delay: 0.32 });
        break;
      // The tell before an enemy swing. Deliberately dry and short: it has to
      // cut through a crowd without becoming noise.
      case 'windup': this.noise({ dur: 0.09, gain: 0.10, freq: 2200, q: 3, sweep: -900 }); break;
      case 'stagger':
        this.noise({ dur: 0.16, gain: 0.22, freq: 500, q: 1.4, sweep: -260 });
        this.tone({ freq: 130, type: 'square', dur: 0.12, gain: 0.14, sweep: -50 });
        break;
      case 'gib': this.noise({ dur: 0.22, gain: 0.20, freq: 340, q: 0.9, sweep: -180 }); break;
      case 'shatter':
        [0, 0.04, 0.09].forEach((d) =>
          this.noise({ dur: 0.13, gain: 0.16, freq: 4200, q: 2.5, sweep: -2600, delay: d }));
        break;
      case 'curse':
        this.tone({ freq: 300, type: 'sawtooth', dur: 0.42, gain: 0.16, sweep: -190 });
        this.tone({ freq: 154, type: 'sine', dur: 0.5, gain: 0.12, sweep: -60, delay: 0.05 });
        break;
      case 'stomp':
        this.tone({ freq: 62, type: 'sine', dur: 0.34, gain: 0.34, sweep: -26 });
        this.noise({ dur: 0.26, gain: 0.24, freq: 180, q: 0.7, sweep: -90 });
        break;
      case 'bossdown':
        this.tone({ freq: 220, type: 'sawtooth', dur: 1.3, gain: 0.30, sweep: -170 });
        this.noise({ dur: 1.0, gain: 0.24, freq: 260, q: 0.5, sweep: -190, delay: 0.06 });
        [0, 0.22, 0.46].forEach((d, i) =>
          this.tone({ freq: 262 * Math.pow(1.5, i), type: 'triangle', dur: 0.5, gain: 0.16, delay: 0.5 + d }));
        break;
      case 'dodge': this.noise({ dur: 0.13, gain: 0.11, freq: 2600, q: 2.2, sweep: -1500 }); break;
      // A potion hitting the floor: a short glassy tick, quiet enough to sit
      // under a busy fight but distinct enough to turn your head.
      case 'drop':
        this.tone({ freq: 1180, type: 'sine', dur: 0.07, gain: 0.13 });
        this.tone({ freq: 1560, type: 'sine', dur: 0.09, gain: 0.09, delay: 0.05 });
        break;
      // Drinking one: a swallow, then the glass ringing as it empties.
      case 'quaff':
        this.tone({ freq: 240, type: 'sine', dur: 0.13, gain: 0.20, sweep: 200 });
        this.tone({ freq: 880, type: 'triangle', dur: 0.22, gain: 0.14, sweep: 420, delay: 0.09 });
        break;
      // Something big landing: used by the heavier slams and by Consecration.
      case 'holy':
        this.tone({ freq: 520, type: 'sine', dur: 0.34, gain: 0.16, sweep: 300 });
        this.tone({ freq: 784, type: 'sine', dur: 0.42, gain: 0.12, sweep: 220, delay: 0.06 });
        this.tone({ freq: 1046, type: 'sine', dur: 0.5, gain: 0.09, sweep: 160, delay: 0.13 });
        break;
      // A bowstring released. Drier and tighter than the generic 'shoot'.
      case 'bow':
        this.noise({ dur: 0.07, gain: 0.16, freq: 2400, q: 3, sweep: -1400 });
        this.tone({ freq: 300, type: 'triangle', dur: 0.09, gain: 0.10, sweep: -160 });
        break;
      // A quest ticking over, and a quest completed. The second is meant to be
      // heard across a room; it is the payoff for a whole session of play.
      case 'questtick': this.tone({ freq: 900, type: 'sine', dur: 0.07, gain: 0.09 }); break;
      case 'questdone':
        this.tone({ freq: 523, type: 'triangle', dur: 0.16, gain: 0.18 });
        this.tone({ freq: 659, type: 'triangle', dur: 0.16, gain: 0.18, delay: 0.11 });
        this.tone({ freq: 784, type: 'triangle', dur: 0.16, gain: 0.18, delay: 0.22 });
        this.tone({ freq: 1046, type: 'triangle', dur: 0.34, gain: 0.20, delay: 0.33 });
        break;
      // A heartbeat under low health. Quiet by design — a warning, not a siren.
      case 'lowhp':
        this.tone({ freq: 66, type: 'sine', dur: 0.16, gain: 0.20 });
        this.tone({ freq: 58, type: 'sine', dur: 0.20, gain: 0.16, delay: 0.20 });
        break;
      default: break;
    }
  }

  // -- Music: a slow generative minor-key loop, deliberately unobtrusive. --

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const root = 110;
    let step = 0;
    const tick = () => {
      if (!this.ctx) return;
      // A closed context would otherwise throw from this timer twice a second
      // for the rest of the session. One failure ends the music for good.
      try { this.musicNote(scale, root, step++); } catch { this.stopMusic(); }
    };
    tick();
    this.musicTimer = setInterval(tick, 900);
  }

  musicNote(scale, root, step) {
    const t = this.ctx.currentTime;
    const beat = step % 8;
    const note = root * Math.pow(2, scale[(step * 3) % scale.length] / 12);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = beat === 0 ? 'triangle' : 'sine';
    osc.frequency.value = beat % 4 === 0 ? note / 2 : note;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(beat === 0 ? 0.5 : 0.28, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    osc.connect(g); g.connect(this.musicGain);
    osc.start(t); osc.stop(t + 1.6);
  }

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }

  setMusicIntensity(level) {
    if (this.musicGain) {
      this.musicGain.gain.value = this.settings.musicVolume * (0.18 + level * 0.16);
    }
  }
}
