// ============================================================
// TOYBOX TACTICS — audio: synthesized toy sounds + a generative
// music-box soundtrack. Everything is WebAudio, no files.
// ============================================================

export class SFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.5;
    this.lastPlay = {};
  }
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && !this.muted) this.master.gain.value = this.volume;
  }

  // must be called from a user gesture (autoplay policy)
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    // music bus with a feedback delay for music-box space
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.14;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.31;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    delay.connect(fb); fb.connect(delay);
    this.musicBus.connect(delay);
    delay.connect(this.master);
    this.musicBus.connect(this.master);
    // shared noise buffer
    const len = ctx.sampleRate * 0.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._startMusic();
    this._startAmbience();
  }

  // ---------- night-time room ambience ----------
  _startAmbience() {
    // crickets outside the window: soft high pips in irregular clusters
    const cricket = () => {
      if (!this.ctx) return;
      if (!this.muted) {
        const n = 3 + (Math.random() * 3 | 0);
        const f = 4200 + Math.random() * 900;
        for (let i = 0; i < n; i++) this.tone(f, 0.03, { type: 'sine', gain: 0.012, when: i * 0.07 });
      }
      setTimeout(cricket, 1800 + Math.random() * 5200);
    };
    // a wall clock somewhere ticks a few times, then loses interest
    const clock = () => {
      if (!this.ctx) return;
      if (!this.muted) {
        for (let i = 0; i < 4; i++) {
          this.tone(i % 2 ? 920 : 1180, 0.025, { type: 'square', gain: 0.014, when: i * 0.5 });
        }
      }
      setTimeout(clock, 34000 + Math.random() * 40000);
    };
    setTimeout(cricket, 2500);
    setTimeout(clock, 15000);
  }

  // ---------- weather & room events (called by the ambience system) ----------
  wind() { // a soft gust brushing the curtains
    if (!this.ctx || this.muted) return;
    this.noise(2.2, { freq: 480, gain: 0.028 });
    this.noise(1.4, { freq: 900, gain: 0.014, type: 'bandpass' });
  }
  thunder() { // distant rumble, more felt than heard
    if (!this.ctx || this.muted) return;
    this.noise(2.8, { freq: 110, gain: 0.16 });
    this.tone(46, 2.2, { type: 'sine', gain: 0.1, slide: 30 });
    this.noise(1.2, { freq: 320, gain: 0.05, when: 0.35 });
  }
  footsteps() { // someone walks past the door in the hallway
    if (!this.ctx || this.muted) return;
    for (let i = 0; i < 5; i++) {
      this.tone(i % 2 ? 78 : 64, 0.09, { type: 'sine', gain: 0.055, slide: 40, when: i * 0.55 });
      this.noise(0.05, { freq: 200, gain: 0.02, when: i * 0.55 });
    }
  }
  startRain() { // continuous soft patter against the window
    if (!this.ctx || this.rainSrc) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2600;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.016;
    // slow wobble so the shower swells and eases
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.007;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(); lfo.start();
    this.rainSrc = src;
  }

  // ---------- unit voice acknowledgments (toy squeaks per type) ----------
  voice(type) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - (this.lastPlay.__voice || 0) < 220) return;
    this.lastPlay.__voice = now;
    const T = (f, d, o = {}) => this.tone(f, d, { gain: 0.07, ...o });
    switch (type) {
      case 'worker': T(980, 0.06, { type: 'sine', slide: 300 }); T(1250, 0.07, { type: 'sine', when: 0.08 }); break;
      case 'scout': T(700, 0.16, { type: 'sine', slide: 700 }); break;
      case 'soldier': T(240, 0.06, { type: 'square', gain: 0.05 }); T(240, 0.06, { type: 'square', gain: 0.05, when: 0.09 }); break;
      case 'spear': T(1500, 0.04, { type: 'triangle' }); break;
      case 'archer': T(900, 0.05, { type: 'sawtooth', gain: 0.03, slide: 400 }); break;
      case 'flinger': T(500, 0.09, { type: 'sawtooth', gain: 0.03, slide: -180 }); break;
      case 'raider': case 'dragster': case 'cart':
        T(120, 0.22, { type: 'sawtooth', gain: 0.045, slide: 220 }); break;
      case 'hero': T(523, 0.08, { type: 'triangle' }); T(659, 0.08, { type: 'triangle', when: 0.08 }); T(784, 0.1, { type: 'triangle', when: 0.16 }); break;
      case 'medic': case 'bear': T(420, 0.14, { type: 'sine', slide: -120, gain: 0.08 }); break;
      case 'golem': T(300, 0.05, { type: 'square', gain: 0.05 }); T(220, 0.06, { type: 'square', gain: 0.05, when: 0.07 }); break;
      case 'bazooka': T(1400, 0.03, { type: 'square', gain: 0.04 }); T(180, 0.1, { type: 'sine', when: 0.05 }); break;
      case 'hypno': T(600, 0.3, { type: 'sine', slide: 240, gain: 0.05 }); break;
      case 'ram': T(110, 0.18, { type: 'sine', slide: 40, gain: 0.09 }); break;
      case 'catapult': T(180, 0.12, { type: 'sawtooth', gain: 0.03, slide: -60 }); break;
      default: T(880, 0.05, { type: 'square', gain: 0.05 });
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  // ---------- low-level synth helpers ----------
  tone(freq, dur, { type = 'sine', gain = 0.2, slide = null, when = 0, bus = null } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(bus || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, { freq = 800, q = 1, gain = 0.25, type = 'lowpass', when = 0 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + dur + 0.02);
  }
  pluck(freq, { gain = 0.15, when = 0, dur = 1.1 } = {}) {
    // music-box note: sine + soft octave partial, long decay
    this.tone(freq, dur, { type: 'sine', gain, when, bus: this.musicBus });
    this.tone(freq * 2, dur * 0.6, { type: 'sine', gain: gain * 0.3, when, bus: this.musicBus });
    this.tone(freq * 4.01, 0.15, { type: 'sine', gain: gain * 0.12, when, bus: this.musicBus });
  }

  // ---------- game sounds ----------
  play(name, throttleMs = 60) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - (this.lastPlay[name] || 0) < throttleMs) return;
    this.lastPlay[name] = now;
    const fn = this[`_${name}`];
    if (fn) fn.call(this);
  }
  _select()  { this.tone(880, 0.05, { type: 'square', gain: 0.06 }); }
  _command() { this.tone(320, 0.08, { type: 'sine', gain: 0.12, slide: 170 }); }
  _place()   { this.tone(180, 0.1, { type: 'sine', gain: 0.16, slide: 120 }); this.noise(0.06, { freq: 600, gain: 0.08 }); }
  _error()   { this.tone(110, 0.14, { type: 'square', gain: 0.08 }); }
  _bonk()    { this.tone(190, 0.09, { type: 'sine', gain: 0.15, slide: 90 }); this.noise(0.05, { freq: 420, gain: 0.1 }); }
  _twang()   { this.tone(700, 0.07, { type: 'sawtooth', gain: 0.05, slide: 220 }); this.noise(0.04, { freq: 2400, type: 'highpass', gain: 0.04 }); }
  _thud()    {
    this.noise(0.28, { freq: 160, gain: 0.3 });
    this.tone(70, 0.25, { type: 'sine', gain: 0.25, slide: 40 });
    for (let i = 0; i < 3; i++) this.tone(500 + Math.random() * 700, 0.05, { type: 'square', gain: 0.04, when: 0.05 + i * 0.05 });
  }
  _squeak()  { this.tone(640, 0.22, { type: 'sine', gain: 0.1, slide: 140 }); }
  // material death sounds: what the toy is made of decides how it dies
  _clatter() { // plastic pieces bouncing on the floor
    for (let i = 0; i < 4; i++) {
      this.tone(700 + Math.random() * 900, 0.04, { type: 'square', gain: 0.05, when: i * (0.05 + Math.random() * 0.04) });
    }
  }
  _jingle() { // buttons and coins scattering
    for (let i = 0; i < 3; i++) {
      this.tone(1800 + Math.random() * 1400, 0.12, { type: 'sine', gain: 0.06, when: i * 0.07 });
    }
  }
  _whump() { // pillow fluff
    this.noise(0.3, { freq: 240, gain: 0.22 });
    this.tone(90, 0.22, { type: 'sine', gain: 0.14, slide: 55 });
  }
  _crash()   {
    this.noise(0.5, { freq: 300, gain: 0.32 });
    this.tone(60, 0.4, { type: 'sine', gain: 0.28, slide: 35 });
    for (let i = 0; i < 6; i++) this.tone(400 + Math.random() * 900, 0.06, { type: 'square', gain: 0.05, when: 0.06 + i * 0.06 });
  }
  _train()   { this.tone(660, 0.08, { type: 'triangle', gain: 0.12 }); this.tone(880, 0.12, { type: 'triangle', gain: 0.12, when: 0.09 }); }
  _build()   { [523, 659, 784].forEach((f, i) => this.tone(f, 0.11, { type: 'triangle', gain: 0.11, when: i * 0.09 })); }
  _research() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.14, { type: 'sine', gain: 0.09, when: i * 0.07 })); }
  _age() {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.pluck(f, { gain: 0.16, when: i * 0.13, dur: 1.4 }));
    this.noise(0.8, { freq: 4000, type: 'highpass', gain: 0.03 });
  }
  _alarm()   { [620, 460, 620, 460].forEach((f, i) => this.tone(f, 0.1, { type: 'square', gain: 0.06, when: i * 0.12 })); }
  _trade()   { this.tone(1568, 0.07, { type: 'triangle', gain: 0.1 }); this.tone(2093, 0.12, { type: 'triangle', gain: 0.1, when: 0.07 }); }
  _pop()     { this.tone(400, 0.07, { type: 'sine', gain: 0.13, slide: 700 }); }
  _victory() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', gain: 0.14, when: i * 0.15 }));
    setTimeout(() => { if (!this.muted && this.ctx) [1319, 1568].forEach((f, i) => this.pluck(f, { gain: 0.2, when: i * 0.2, dur: 2 })); }, 900);
  }
  _defeat()  { [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', gain: 0.12, when: i * 0.3 })); }

  // ---------- generative music box ----------
  _startMusic() {
    // pentatonic random walk over C major pentatonic, two octaves
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.7, 1318.5];
    let step = 2;
    let nextAt = this.ctx.currentTime + 1;
    let phrase = 0;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      while (nextAt < now + 0.4) {
        // melody note: random walk with occasional leaps
        step += (Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) : (Math.random() < 0.5 ? -3 : 3));
        step = Math.max(0, Math.min(scale.length - 1, step));
        const rest = Math.random() < 0.18;
        if (!rest) this.pluck(scale[step], { gain: 0.10 + Math.random() * 0.05, when: nextAt - now });
        // low root every 4th beat
        if (phrase % 4 === 0) this.pluck(261.63, { gain: 0.07, when: nextAt - now, dur: 1.8 });
        phrase++;
        nextAt += [0.42, 0.42, 0.42, 0.63, 0.84][(Math.random() * 5) | 0];
      }
    }, 180);
  }
}
