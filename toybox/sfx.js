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
    this.musicAge = 1; // the soundtrack thickens as the ages advance
  }
  setAge(age) { this.musicAge = age; }
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

  // ---------- outdoor ambience beds (all synthesized, all free) ----------
  // kind: 'day' = birds + breeze · 'gold' = bees + breeze · 'dusk' = crickets + owl
  startAmbience(kind) {
    if (!this.ctx || this.ambKind === kind) return;
    this.ambKind = kind;
    if (this.ambTimers) for (const t of this.ambTimers) clearTimeout(t);
    this.ambTimers = [];
    // stop every continuous bed from the previous soundscape — beds must never
    // stack or outlive their room (the source of the dreaded background hum)
    if (this.ambNodes) for (const n of this.ambNodes) { try { n.stop(); } catch { /* already stopped */ } }
    this.ambNodes = [];
    if (!kind) return;
    const ctx = this.ctx;
    const keep = (...nodes) => { this.ambNodes.push(...nodes); return nodes[0]; };
    const OUTDOOR = kind === 'day' || kind === 'gold' || kind === 'dusk';
    if (OUTDOOR) {
      // the breeze: every outdoor hour has one, softer at dusk
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 480; f.Q.value = 0.4;
      const g = ctx.createGain();
      g.gain.value = kind === 'dusk' ? 0.006 : 0.011;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.005;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      src.connect(f); f.connect(g); g.connect(this.sfxBus);
      src.start(); lfo.start();
      keep(src, lfo);
    }
    // ---- indoor room-tones: the house going about its evening -------------
    // a BREATHING appliance murmur — triangle wave (no buzzy harmonics), very
    // quiet, with a slow swell so it reads as "the house" and never as a drone
    const hum = (freq, gain, lp = 300) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
      const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp;
      const g2 = ctx.createGain(); g2.gain.value = gain * 0.4;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
      const lfoG = ctx.createGain(); lfoG.gain.value = gain * 0.25;
      lfo.connect(lfoG); lfoG.connect(g2.gain);
      o.connect(f2); f2.connect(g2); g2.connect(this.sfxBus);
      o.start(); lfo.start();
      keep(o, lfo);
    };
    const hush = (lp, gain) => { // filtered room-noise floor (soft, breathing)
      const src2 = ctx.createBufferSource(); src2.buffer = this.noiseBuf; src2.loop = true;
      const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp;
      const g2 = ctx.createGain(); g2.gain.value = gain * 0.7;
      src2.connect(f2); f2.connect(g2); g2.connect(this.sfxBus); src2.start();
      keep(src2);
    };
    const tickTock = (which) => { // the hallway clock, alternating
      if (this.ambKind !== kind || this.muted) return;
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = which ? 1550 : 1210;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.006, t0);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
      o.connect(og); og.connect(this.sfxBus);
      o.start(t0); o.stop(t0 + 0.04);
      this.ambTimers.push(setTimeout(() => tickTock(!which), 1000));
    };
    const drip = (echoey) => { // a drop; the tub answers itself
      if (this.ambKind !== kind || this.muted) return;
      for (let e = 0; e < (echoey ? 2 : 1); e++) {
        const t0 = ctx.currentTime + e * 0.19;
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(1150 - e * 250, t0);
        o.frequency.exponentialRampToValueAtTime(620 - e * 120, t0 + 0.07);
        const og = ctx.createGain();
        og.gain.setValueAtTime(e ? 0.008 : 0.018, t0);
        og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
        o.connect(og); og.connect(this.sfxBus);
        o.start(t0); o.stop(t0 + 0.12);
      }
      this.ambTimers.push(setTimeout(() => drip(echoey), (echoey ? 3500 : 8000) + Math.random() * (echoey ? 5500 : 9000)));
    };
    const creak = () => { // the house settling its old bones
      if (this.ambKind !== kind || this.muted) return;
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(85, t0);
      o.frequency.linearRampToValueAtTime(60 + Math.random() * 40, t0 + 0.5);
      const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 300;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t0);
      og.gain.linearRampToValueAtTime(0.012, t0 + 0.12);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
      o.connect(f2); f2.connect(og); og.connect(this.sfxBus);
      o.start(t0); o.stop(t0 + 0.6);
      this.ambTimers.push(setTimeout(creak, 16000 + Math.random() * 26000));
    };
    if (kind === 'room' || kind === 'study') { // bedtime quiet + the clock
      hush(240, 0.004);
      this.ambTimers.push(setTimeout(() => tickTock(false), 700));
      this.ambTimers.push(setTimeout(creak, 14000));
    } else if (kind === 'kitchen') { // the fridge never sleeps; the tap almost
      hum(118, 0.004, 400);
      hush(300, 0.0025);
      this.ambTimers.push(setTimeout(() => drip(false), 5000));
    } else if (kind === 'tv') { // a TV murmuring in the next room
      const src2 = ctx.createBufferSource(); src2.buffer = this.noiseBuf; src2.loop = true;
      const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 320; f2.Q.value = 1.4;
      const g2 = ctx.createGain(); g2.gain.value = 0.004;
      const wob = ctx.createOscillator(); wob.frequency.value = 0.31; // speech-ish swell
      const wobG = ctx.createGain(); wobG.gain.value = 0.003;
      wob.connect(wobG); wobG.connect(g2.gain);
      src2.connect(f2); f2.connect(g2); g2.connect(this.sfxBus);
      src2.start(); wob.start();
      keep(src2, wob);
      hush(200, 0.0025);
    } else if (kind === 'tub') { // porcelain acoustics
      hush(600, 0.0035);
      this.ambTimers.push(setTimeout(() => drip(true), 2500));
    } else if (kind === 'attic') { // rain on the roof, right overhead
      const src2 = ctx.createBufferSource(); src2.buffer = this.noiseBuf; src2.loop = true;
      const f2 = ctx.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = 1800;
      const g2 = ctx.createGain(); g2.gain.value = 0.007;
      const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.08;
      const lfoG2 = ctx.createGain(); lfoG2.gain.value = 0.003; // gusts on the shingles
      lfo2.connect(lfoG2); lfoG2.connect(g2.gain);
      src2.connect(f2); f2.connect(g2); g2.connect(this.sfxBus);
      src2.start(); lfo2.start();
      keep(src2, lfo2);
      this.ambTimers.push(setTimeout(creak, 9000));
    } else if (kind === 'dark') { // under here you can hear the whole house
      hush(160, 0.004); // the deep hush alone — no drone under the bed
      this.ambTimers.push(setTimeout(creak, 11000));
    }
    const chirp = () => { // one birdsong phrase: 2-4 falling whistles
      if (this.ambKind !== 'day' || this.muted) return;
      const n = 2 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) {
        const t0 = ctx.currentTime + i * 0.16;
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(2600 + Math.random() * 900, t0);
        o.frequency.exponentialRampToValueAtTime(1900 + Math.random() * 400, t0 + 0.09);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0, t0);
        og.gain.linearRampToValueAtTime(0.02, t0 + 0.015);
        og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
        o.connect(og); og.connect(this.sfxBus);
        o.start(t0); o.stop(t0 + 0.14);
      }
      this.ambTimers.push(setTimeout(chirp, 2500 + Math.random() * 6000));
    };
    const cricket = () => { // pulsed trill from somewhere in the grass
      if (this.ambKind !== 'dusk' || this.muted) return;
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 4300 + Math.random() * 500;
      const og = ctx.createGain(); og.gain.value = 0;
      for (let i = 0; i < 7; i++) {
        og.gain.setValueAtTime(0.007, t0 + i * 0.055);
        og.gain.setValueAtTime(0, t0 + i * 0.055 + 0.028);
      }
      o.connect(og); og.connect(this.sfxBus);
      o.start(t0); o.stop(t0 + 0.45);
      this.ambTimers.push(setTimeout(cricket, 900 + Math.random() * 2200));
    };
    const owl = () => { // two soft hoots, rarely
      if (this.ambKind !== 'dusk' || this.muted) return;
      for (const [dt0, len] of [[0, 0.28], [0.42, 0.4]]) {
        const t0 = ctx.currentTime + dt0;
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(365, t0);
        o.frequency.linearRampToValueAtTime(330, t0 + len);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0, t0);
        og.gain.linearRampToValueAtTime(0.022, t0 + 0.07);
        og.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
        o.connect(og); og.connect(this.sfxBus);
        o.start(t0); o.stop(t0 + len + 0.05);
      }
      this.ambTimers.push(setTimeout(owl, 18000 + Math.random() * 30000));
    };
    if (kind === 'gold') { // the bees: a low warm drone that wanders the rows
      const bee = ctx.createOscillator(); bee.type = 'sawtooth'; bee.frequency.value = 190;
      const bf = ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 800;
      const bg = ctx.createGain(); bg.gain.value = 0.004;
      const wob = ctx.createOscillator(); wob.frequency.value = 0.9;
      const wobG = ctx.createGain(); wobG.gain.value = 14;
      wob.connect(wobG); wobG.connect(bee.frequency);
      bee.connect(bf); bf.connect(bg); bg.connect(this.sfxBus);
      bee.start(); wob.start();
      keep(bee, wob);
    }
    if (kind === 'day') this.ambTimers.push(setTimeout(chirp, 1200));
    if (kind === 'dusk') {
      this.ambTimers.push(setTimeout(cricket, 800));
      this.ambTimers.push(setTimeout(owl, 9000));
    }
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

  setMusicEnabled(on) {
    this.musicOn = on;
    if (this.musicBus) this.musicBus.gain.value = on ? 0.14 : 0;
  }
  setSfxEnabled(on) {
    this.sfxOn = on;
    if (this.sfxBus) this.sfxBus.gain.value = on ? 0.9 : 0;
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
    let out = g;
    if (this._spat && ctx.createStereoPanner) {
      g.gain.setValueAtTime(gain * this._spat.vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      const p = ctx.createStereoPanner(); p.pan.value = this._spat.pan;
      g.connect(p); out = p;
    }
    o.connect(g); out.connect(bus || this.sfxBus);
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
  // world-positioned playback: pan by screen-side, fade by camera distance.
  // setListener is fed the camera focus every frame by main.js.
  setListener(x, z) { this.lx = x; this.lz = z; }
  playAt(name, x, z, throttleMs = 60) {
    if (this.lx === undefined || x === undefined) return this.play(name, throttleMs);
    const dx = x - this.lx, dz = z - this.lz;
    const dist = Math.hypot(dx, dz);
    if (dist > 55) return; // beyond earshot
    this._spat = { pan: Math.max(-0.8, Math.min(0.8, dx / 24)), vol: 1 / (1 + dist / 18) };
    this.play(name, throttleMs);
    this._spat = null;
  }
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
  _charge()  { // little toy-bugle battle cry: a rising triad
    const notes = [392, 523, 659, 784];
    notes.forEach((f, i) => this.tone(f, 0.14, { type: 'square', gain: 0.07, when: i * 0.055, slide: 12 }));
    this.tone(784, 0.22, { type: 'sawtooth', gain: 0.05, when: 0.19, slide: 40 });
  }
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
  // pets get their own soft voices (positional via playAt) so a bark or whir
  // every few seconds reads as life, never as an annoying repeated UI blip
  _woof()    { // a friendly two-note toy bark, low and round
    this.tone(150, 0.1, { type: 'triangle', gain: 0.12, slide: 110 });
    this.tone(120, 0.14, { type: 'triangle', gain: 0.1, slide: 85, when: 0.11 });
    this.noise(0.06, { freq: 300, gain: 0.03 });
  }
  _whir()    { // the roomba's soft low motor sweep — no sharp edges
    this.tone(90, 0.5, { type: 'triangle', gain: 0.05, slide: 105 });
    this.noise(0.5, { freq: 220, gain: 0.015, type: 'lowpass' });
  }
  _victory() {
    // triumphant fanfare: a rising run into a big major chord + sparkles
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', gain: 0.14, when: i * 0.12 }));
    setTimeout(() => {
      if (this.muted || !this.ctx) return;
      [523, 659, 784, 1047].forEach((f) => this.tone(f, 0.9, { type: 'triangle', gain: 0.1 }));
      this.tone(1568, 0.9, { type: 'sine', gain: 0.08 });
      [1319, 1568, 2093].forEach((f, i) => this.pluck(f, { gain: 0.16, when: 0.12 + i * 0.14, dur: 1.8 }));
    }, 720);
  }
  _defeat()  {
    [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.45, { type: 'triangle', gain: 0.12, when: i * 0.32 }));
    setTimeout(() => { if (!this.muted && this.ctx) { this.tone(196, 0.9, { type: 'sine', gain: 0.14, slide: 150 }); this.noise(0.5, { freq: 200, gain: 0.12 }); } }, 1150);
  }

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
        if (!rest) {
          this.pluck(scale[step], { gain: 0.10 + Math.random() * 0.05, when: nextAt - now });
          // a harmony third joins in from the Playmat Age onward
          if (this.musicAge >= 2 && Math.random() < 0.4) {
            this.pluck(scale[Math.min(scale.length - 1, step + 2)], { gain: 0.05, when: nextAt - now, dur: 0.9 });
          }
        }
        // roots every 4th beat — every 2nd (plus a low drone) at the Fort Age
        if (phrase % (this.musicAge >= 3 ? 2 : 4) === 0) {
          this.pluck(261.63, { gain: 0.07, when: nextAt - now, dur: 1.8 });
          if (this.musicAge >= 3) this.pluck(196.0, { gain: 0.05, when: nextAt - now, dur: 2.2 });
        }
        phrase++;
        nextAt += [0.42, 0.42, 0.42, 0.63, 0.84][(Math.random() * 5) | 0];
      }
    }, 180);
  }
}
