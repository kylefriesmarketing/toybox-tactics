// ============================================================
// TOYBOX TACTICS — multiplayer: deterministic lockstep over a
// PeerJS data channel. Both clients run the same sim from a
// shared seed; only commands travel, scheduled a few ticks
// ahead (input delay). State hashes catch desyncs early.
// ============================================================

export const TICK = 0.05;      // 20 sim ticks per second
export const INPUT_DELAY = 4;  // commands execute 200ms after issue

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return c;
}

export class Net {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.myId = 0;
    this.tick = 0;
    this.localQ = [];
    this.buf = new Map();       // tick -> { 0: cmds, 1: cmds }
    this.hashes = new Map();    // tick -> local hash (for desync checks)
    this.connected = false;
    this.onDrop = null;         // connection lost callback
    this.onDesync = null;
  }

  async loadLib() {
    if (window.Peer) return;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
      s.onload = res;
      s.onerror = () => rej(new Error('Could not load PeerJS (internet required for multiplayer).'));
      document.head.appendChild(s);
    });
  }

  // host: returns { seed, map, factions, mode, playerDefs } once a guest connects.
  // playerDefs (optional) is the lobby seat list: seat 0 = host, seat 1 = the
  // joining guest (its faction is filled in from the guest's hello), seats 2+ =
  // AI bots that both clients simulate deterministically (no traffic for them).
  // mapKey may be a string or a full random-map config object (JSON-serialized).
  host(mapKey, faction, onStatus, mode = '1v1', difficulty = 'normal', gameMode = 'standard', startRes = 'standard', playerDefs = null) {
    return this.loadLib().then(() => new Promise((resolve, reject) => {
      const code = randomCode();
      this.myId = 0;
      this.peer = new window.Peer('toybox-tt-' + code);
      const timeout = setTimeout(() => reject(new Error('Signaling timeout — try again.')), 20000);
      this.peer.on('open', () => {
        clearTimeout(timeout);
        onStatus(`Room code: ${code} — waiting for a friend…`, code);
      });
      this.peer.on('error', (e) => { clearTimeout(timeout); reject(e); });
      this.peer.on('connection', (conn) => {
        this.conn = conn;
        conn.on('data', (d) => {
          if (d && d.type === 'hello') {
            // finalize the roster with the guest's chosen civilization in seat 1
            let defs = null;
            if (playerDefs) {
              defs = playerDefs.map((s) => ({ ...s }));
              if (defs[1]) defs[1].faction = d.faction || 'classic';
            }
            const setup = {
              type: 'start',
              seed: (Math.random() * 2 ** 31) | 0,
              map: mapKey,
              mode,
              difficulty, // both clients must build identical AI opponents
              gameMode, startRes, // and identical victory conditions / economy
              factions: [faction || 'classic', d.faction || 'classic'],
              playerDefs: defs,
            };
            conn.send(setup);
            this.wire();
            this.connected = true;
            resolve(setup);
          }
        });
      });
    }));
  }

  // guest: resolves with the host's { seed, map, factions }
  join(code, faction, onStatus) {
    return this.loadLib().then(() => new Promise((resolve, reject) => {
      this.myId = 1;
      this.peer = new window.Peer();
      const timeout = setTimeout(() => reject(new Error('Could not find that room — check the code.')), 20000);
      this.peer.on('open', () => {
        const conn = this.peer.connect('toybox-tt-' + code.toUpperCase().trim(), { reliable: true });
        this.conn = conn;
        conn.on('open', () => {
          onStatus('Connected — starting…');
          conn.send({ type: 'hello', faction: faction || 'classic' });
        });
        conn.on('data', (d) => {
          if (d && d.type === 'start') {
            clearTimeout(timeout);
            this.wire();
            this.connected = true;
            resolve(d);
          }
        });
        conn.on('error', (e) => { clearTimeout(timeout); reject(e); });
      });
      this.peer.on('error', (e) => { clearTimeout(timeout); reject(e); });
    }));
  }

  wire() {
    this.conn.on('data', (d) => {
      if (!d) return;
      if (d.type === 'cmds') {
        this.bufFor(d.tick)[1 - this.myId] = d.cmds || [];
        if (d.hash !== undefined) {
          const mine = this.hashes.get(d.hashTick);
          if (mine !== undefined && mine !== d.hash && this.onDesync) this.onDesync(d.hashTick);
        }
      }
    });
    this.conn.on('close', () => { this.connected = false; this.onDrop && this.onDrop(); });
    this.conn.on('error', () => { this.connected = false; this.onDrop && this.onDrop(); });
  }

  bufFor(t) {
    let b = this.buf.get(t);
    if (!b) this.buf.set(t, (b = {}));
    return b;
  }

  queueLocal(cmd) { this.localQ.push(cmd); }

  // true when this tick's remote commands have arrived (or aren't due yet)
  canStep() {
    if (this.tick < INPUT_DELAY) return true;
    const b = this.buf.get(this.tick);
    return !!(b && b[0] !== undefined && b[1] !== undefined);
  }

  // send this frame's local commands (scheduled ahead), even when empty —
  // the steady stream is what lets the other side keep stepping
  flush(game) {
    const target = this.tick + INPUT_DELAY;
    this.bufFor(target)[this.myId] = this.localQ;
    const msg = { type: 'cmds', tick: target, cmds: this.localQ };
    if (this.tick % 100 === 0 && this.tick > 0) {
      const h = game.stateHash();
      this.hashes.set(this.tick, h);
      msg.hash = h;
      msg.hashTick = this.tick;
      // keep the hash map small
      for (const k of this.hashes.keys()) if (k < this.tick - 500) this.hashes.delete(k);
    }
    try { this.conn.send(msg); } catch { /* drop handled by close event */ }
    this.localQ = [];
  }

  // execute both players' commands for the current tick, then advance
  execTick(game) {
    const b = this.buf.get(this.tick);
    if (b) {
      for (const pid of [0, 1]) {
        for (const c of (b[pid] || [])) game.execCommand(pid, c);
      }
      this.buf.delete(this.tick);
    }
    this.tick++;
  }

  destroy() {
    try { this.conn && this.conn.close(); } catch {}
    try { this.peer && this.peer.destroy(); } catch {}
  }
}
