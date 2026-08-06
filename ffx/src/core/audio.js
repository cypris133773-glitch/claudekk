// All music and sound is generated at runtime — there is not a single audio
// file in this repository. A look-ahead scheduler walks a chord progression and
// improvises a melody over it from the scale, which is enough to make thirteen
// regions feel different without shipping thirteen MP3s.

const A4 = 440;
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

const freq = (name, octave) => A4 * Math.pow(2, (NOTE[name] + (octave - 4) * 12 - 9) / 12);

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

export const THEMES = {
  dream:    { bpm: 62, root: 'D', scale: 'minor', prog: [0, -3, -5, -1], style: 'piano', lead: 0.5 },
  field:    { bpm: 104, root: 'G', scale: 'major', prog: [0, 5, 3, 7], style: 'pluck', lead: 0.7 },
  sad:      { bpm: 56, root: 'A', scale: 'minor', prog: [0, -4, -2, -5], style: 'piano', lead: 0.4 },
  city:     { bpm: 122, root: 'E', scale: 'dorian', prog: [0, 3, 5, 3], style: 'drive', lead: 0.75 },
  creep:    { bpm: 78, root: 'C', scale: 'phrygian', prog: [0, 1, -2, 0], style: 'pad', lead: 0.35 },
  storm:    { bpm: 132, root: 'F', scale: 'minor', prog: [0, 5, 3, -2], style: 'drive', lead: 0.7 },
  ice:      { bpm: 72, root: 'B', scale: 'lydian', prog: [0, 4, 2, 5], style: 'bell', lead: 0.6 },
  desert:   { bpm: 96, root: 'D', scale: 'phrygian', prog: [0, 2, 0, -3], style: 'pluck', lead: 0.65 },
  church:   { bpm: 68, root: 'C', scale: 'minor', prog: [0, 5, 3, 7], style: 'choir', lead: 0.45 },
  mountain: { bpm: 88, root: 'F#', scale: 'minor', prog: [0, -2, 3, 5], style: 'pad', lead: 0.5 },
  final:    { bpm: 138, root: 'D', scale: 'phrygian', prog: [0, 1, 5, 3], style: 'drive', lead: 0.85 },
  battle:   { bpm: 148, root: 'E', scale: 'minor', prog: [0, 3, 5, 7], style: 'drive', lead: 0.9 },
  boss:     { bpm: 158, root: 'A', scale: 'phrygian', prog: [0, 1, 3, 0], style: 'drive', lead: 1 },
  victory:  { bpm: 128, root: 'G', scale: 'major', prog: [0, 4, 7, 4], style: 'bell', lead: 0.9 },
};

class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.sfxEnabled = true;
    this.theme = null;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.volume = 0.5;
  }

  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 6;
    this.master.connect(this.comp).connect(this.ctx.destination);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicBus.connect(this.master);

    this.delay = this.ctx.createDelay(1);
    this.delay.delayTime.value = 0.28;
    this.fb = this.ctx.createGain();
    this.fb.gain.value = 0.32;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.3;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    this.delay.connect(this.fb).connect(this.delay);
    this.delay.connect(lp).connect(this.wet).connect(this.master);
  }

  resume() {
    this.init();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stop();
    else if (this.pendingTheme) this.play(this.pendingTheme);
  }

  /* ── instruments ─────────────────────────────────────────────────────*/

  tone(f, t, dur, gain, type = 'triangle', send = 0.25) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.musicBus);
    if (send > 0) {
      const s = this.ctx.createGain();
      s.gain.value = gain * send;
      g.connect(s).connect(this.delay);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(t, dur, gain, freq = 4000, q = 1) {
    if (!this.ctx) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.musicBus);
    src.start(t);
  }

  /* ── music ───────────────────────────────────────────────────────────*/

  play(themeName) {
    this.pendingTheme = themeName;
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    if (this.themeName === themeName && this.timer) return;
    this.stop();
    this.themeName = themeName;
    this.theme = THEMES[themeName] || THEMES.field;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 40);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.themeName = null;
  }

  schedule() {
    if (!this.ctx || !this.theme) return;
    const beat = 60 / this.theme.bpm / 2; // eighth notes
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      this.tick(this.step, this.nextTime, beat);
      this.step++;
      this.nextTime += beat;
    }
  }

  tick(step, t, beat) {
    const th = this.theme;
    const scale = SCALES[th.scale];
    const bar = Math.floor(step / 8) % th.prog.length;
    const degree = th.prog[bar];
    const rootHz = freq(th.rootName || th.root, 3) * Math.pow(2, degree / 12);
    const s = step % 8;
    const style = th.style;

    // Bass on the downbeat and the and-of-three.
    if (s === 0 || s === 5) {
      this.tone(rootHz / 2, t, beat * 3, 0.16, style === 'drive' ? 'sawtooth' : 'sine', 0.05);
    }

    // Chord bed.
    if (s === 0 || (style === 'drive' && s % 2 === 0)) {
      const third = scale[2] ?? 3;
      const fifth = scale[4] ?? 7;
      const vol = style === 'choir' ? 0.06 : 0.045;
      const type = style === 'choir' ? 'sine' : style === 'drive' ? 'sawtooth' : 'triangle';
      const dur = style === 'drive' ? beat * 1.6 : beat * 6;
      this.tone(rootHz, t, dur, vol, type, 0.3);
      this.tone(rootHz * Math.pow(2, third / 12), t, dur, vol * 0.8, type, 0.3);
      this.tone(rootHz * Math.pow(2, fifth / 12), t, dur, vol * 0.7, type, 0.3);
    }

    // Arpeggio / melody.
    if (Math.random() < th.lead) {
      const idx = (step * 3 + bar * 2) % scale.length;
      const oct = style === 'bell' || style === 'piano' ? 2 : 1;
      const hz = rootHz * Math.pow(2, scale[idx] / 12) * Math.pow(2, oct);
      const type = style === 'bell' ? 'sine' : style === 'drive' ? 'square' : 'triangle';
      this.tone(hz, t, beat * (style === 'piano' ? 4 : 1.4), style === 'drive' ? 0.055 : 0.075, type, 0.45);
    }

    // Percussion for anything with a pulse.
    if (style === 'drive' || style === 'pluck') {
      if (s % 4 === 0) this.noise(t, 0.12, 0.28, 120, 0.8);
      if (s % 4 === 2) this.noise(t, 0.13, 0.16, 2200, 1.4);
      if (s % 2 === 1) this.noise(t, 0.045, 0.05, 8000, 2);
    }
  }

  /* ── sfx ─────────────────────────────────────────────────────────────*/

  sfx(name) {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'cursor': this.tone(880, t, 0.06, 0.06, 'square', 0); break;
      case 'confirm': this.tone(660, t, 0.08, 0.08, 'square', 0.1); this.tone(990, t + 0.05, 0.1, 0.06, 'square', 0.1); break;
      case 'cancel': this.tone(300, t, 0.09, 0.07, 'square', 0); break;
      case 'hit': this.noise(t, 0.14, 0.4, 900, 0.7); this.tone(160, t, 0.14, 0.12, 'sawtooth', 0); break;
      case 'crit': this.noise(t, 0.22, 0.5, 1600, 0.6); this.tone(220, t, 0.2, 0.16, 'square', 0.2); break;
      case 'miss': this.noise(t, 0.1, 0.14, 5200, 2); break;
      case 'heal': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.05, 0.4, 0.07, 'sine', 0.5)); break;
      case 'magic': [400, 700, 1100].forEach((f, i) => this.tone(f, t + i * 0.03, 0.5, 0.07, 'triangle', 0.6)); break;
      case 'ko': [300, 240, 180, 120].forEach((f, i) => this.tone(f, t + i * 0.07, 0.3, 0.1, 'sawtooth', 0.2)); break;
      case 'summon': [130, 195, 260, 390, 520].forEach((f, i) => this.tone(f, t + i * 0.09, 1.4, 0.1, 'sine', 0.8)); break;
      case 'overdrive': [440, 554, 659, 880].forEach((f, i) => this.tone(f, t + i * 0.06, 0.8, 0.1, 'square', 0.5)); break;
      case 'chest': [784, 988, 1318].forEach((f, i) => this.tone(f, t + i * 0.08, 0.5, 0.08, 'sine', 0.5)); break;
      case 'levelup': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, t + i * 0.07, 0.6, 0.08, 'triangle', 0.5)); break;
      case 'thunder': this.noise(t, 0.7, 0.5, 300, 0.4); break;
      case 'error': this.tone(150, t, 0.16, 0.1, 'square', 0); break;
      default: break;
    }
  }
}

export const audio = new Audio();
