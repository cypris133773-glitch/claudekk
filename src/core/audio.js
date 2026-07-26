// Procedural audio via WebAudio — no sample files to ship or license.

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.musicTimer = null;
    this.started = false;
    this.samples = new Map();
  }

  /** Every sound cue the game triggers. Also the sound-pack file names. */
  static CUES = [
    'swing', 'whiff', 'hit', 'crit', 'shoot', 'cast', 'nova', 'zap', 'explode',
    'blink', 'charge', 'heal', 'buff', 'drain', 'summon', 'fuse', 'roar',
    'hurt', 'death', 'levelup', 'wave', 'buy', 'ui', 'deny',
  ];

  /** Must be called from a user gesture (browsers block audio otherwise). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.settings.sfxVolume;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.settings.musicVolume * 0.25;
    this.musicGain.connect(this.ctx.destination);
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
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
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
    if (this.playSample(name)) return;
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
      step++;
    };
    tick();
    this.musicTimer = setInterval(tick, 900);
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
