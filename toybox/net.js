// ============================================================
// TOYBOX TACTICS — multiplayer: deterministic lockstep over
// PeerJS. Up to FOUR humans in a STAR topology: every guest
// connects to the host, the host merges all players' commands
// for each tick and rebroadcasts the combined set. Only inputs
// travel; every client runs the same seeded sim (AI seats are
// simulated locally on all clients — they never generate traffic).
//
// Why a star (host relays) and not a full mesh:
//   • guests only ever wait on the host's merged broadcast, never
//     on each other — so a dropped guest can't stall anyone but
//     the host, and the host simply stops requiring that seat.
//   • command ordering is centralized through the host, so every
//     client applies identical inputs in an identical order.
// ============================================================

export const TICK = 0.05;      // 20 sim ticks per second
export const INPUT_DELAY = 6;  // commands execute 300ms after issue (a little
                               // extra headroom for the host's relay hop)

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return c;
}

export class Net {
  constructor() {
    this.peer = null;
    this.myId = 0;
    this.isHost = false;
    this.started = false;
    this.humanIds = [0, 1];     // player ids that supply network input
    this.tick = 0;
    this.localQ = [];
    this.buf = new Map();        // tick -> { pid: cmds }  (merged, ready to exec)
    this.pending = new Map();    // HOST only: tick -> { pid: cmds } accumulating
    this.hashes = new Map();     // tick -> our own state hash (desync checks)
    this.left = new Set();       // human seats that dropped mid-match
    this.conns = [];             // HOST: [{ conn, id }]
    this.hostConn = null;        // GUEST: the connection to the host
    this.connected = false;
    this.onDrop = null;          // (id?) connection lost
    this.onDesync = null;        // (tick) state hash mismatch
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

  // ---------------------------------------------------------- HOST
  // config = { seats:[{type:'human'|'ai', team, faction, difficulty}],
  //            map, difficulty, gameMode, startRes }
  // onEvent(kind, data): 'code'(code) · 'join'({id,name}) · 'leave'({id})
  //                      · 'roster'([{id,type,team,faction,name}])
  // Resolves with { code } once the room is open. The host later calls
  // startMatch() to lock the roster and deal everyone the same seed.
  host(config, onEvent) {
    this.isHost = true;
    this.myId = 0;
    this.config = config;
    this.onEvent = onEvent;
    this.guestNames = {};
    // human seats other than the host wait to be filled, lowest id first
    this.openSeats = config.seats
      .map((s, i) => ({ s, i })).filter((o) => o.s.type === 'human' && o.i !== 0)
      .map((o) => o.i).sort((a, b) => a - b);
    return this.loadLib().then(() => new Promise((resolve, reject) => {
      const code = randomCode();
      this.peer = new window.Peer('toybox-tt-' + code);
      const timeout = setTimeout(() => reject(new Error('Signaling timeout — try again.')), 20000);
      this.peer.on('open', () => { clearTimeout(timeout); onEvent('code', code); resolve({ code }); });
      this.peer.on('error', (e) => { clearTimeout(timeout); reject(e); });
      this.peer.on('connection', (conn) => {
        conn.on('data', (d) => this.hostOnData(conn, d));
        conn.on('close', () => this.hostOnClose(conn));
        conn.on('error', () => this.hostOnClose(conn));
      });
    }));
  }

  hostOnData(conn, d) {
    if (!d) return;
    if (d.type === 'hello') {
      if (this.started) { try { conn.send({ type: 'full' }); } catch {} return; }
      const id = this.openSeats.shift();
      if (id === undefined) { try { conn.send({ type: 'full' }); } catch {} return; }
      conn._seatId = id;
      this.conns.push({ conn, id });
      this.guestNames[id] = (d.name || `Player ${id + 1}`).slice(0, 16);
      if (d.faction) this.config.seats[id].faction = d.faction; // the guest's own civ
      try { conn.send({ type: 'seat', id, roster: this.rosterView() }); } catch {}
      this.onEvent && this.onEvent('join', { id, name: this.guestNames[id] });
      this.broadcastRoster();
    } else if (d.type === 'input') {
      this.recvInput(d.pid, d.tick, d.cmds, d.hash, d.hashTick);
    }
  }

  hostOnClose(conn) {
    const id = conn._seatId;
    if (id === undefined) return;
    this.conns = this.conns.filter((c) => c.conn !== conn);
    if (this.started) {
      // mid-match: stop requiring this seat's input; its toys go quiet but the
      // night plays on for everyone else. Re-check any ticks it was blocking.
      this.left.add(id);
      this.onEvent && this.onEvent('leave', { id });
      this.onDrop && this.onDrop(id);
      for (const t of [...this.pending.keys()]) this.tryFinalize(t);
    } else {
      // dropped in the lobby: reopen the seat for the next friend
      delete this.guestNames[id];
      this.openSeats.push(id);
      this.openSeats.sort((a, b) => a - b);
      this.onEvent && this.onEvent('leave', { id });
      this.broadcastRoster();
    }
  }

  rosterView() {
    return this.config.seats.map((s, i) => ({
      id: i, type: s.type, team: s.team, faction: s.faction,
      name: i === 0 ? 'You (host)'
        : s.type === 'ai' ? 'AI'
          : (this.guestNames[i] || 'Waiting…'),
    }));
  }
  broadcastRoster() {
    const roster = this.rosterView();
    for (const { conn } of this.conns) { try { conn.send({ type: 'roster', roster }); } catch {} }
    this.onEvent && this.onEvent('roster', roster);
  }

  // host locks the lobby and deals the match. Any human seat that never got
  // filled quietly becomes an AI so the host is never stuck waiting.
  startMatch() {
    this.started = true;
    const filled = new Set(this.conns.map((c) => c.id));
    const playerDefs = this.config.seats.map((s, i) => {
      const isHuman = i === 0 || (s.type === 'human' && filled.has(i));
      const asAI = !isHuman;
      return {
        team: s.team,
        isAI: asAI,
        faction: (s.faction && s.faction !== 'random') ? s.faction : null,
        difficulty: s.difficulty || 'default',
      };
    });
    this.humanIds = playerDefs.map((d, i) => i).filter((i) => !playerDefs[i].isAI);
    const setup = {
      type: 'start',
      seed: (Math.random() * 2 ** 31) | 0,
      map: this.config.map,
      difficulty: this.config.difficulty,
      gameMode: this.config.gameMode,
      startRes: this.config.startRes,
      playerDefs,
      humanIds: this.humanIds,
      factions: playerDefs.map((d) => d.faction || 'classic'),
    };
    for (const { conn } of this.conns) { try { conn.send(setup); } catch {} }
    this.connected = true;
    return setup;
  }

  // --------------------------------------------------------- GUEST
  // hello = { name, faction }. onEvent gets 'seat'({id}) and 'roster'(roster)
  // while waiting; resolves with the host's start payload once dealt.
  join(code, hello, onEvent) {
    this.isHost = false;
    return this.loadLib().then(() => new Promise((resolve, reject) => {
      this.peer = new window.Peer();
      const timeout = setTimeout(() => reject(new Error('Could not find that room — check the code.')), 20000);
      this.peer.on('open', () => {
        const conn = this.peer.connect('toybox-tt-' + code.toUpperCase().trim(), { reliable: true });
        this.hostConn = conn;
        conn.on('open', () => conn.send({ type: 'hello', name: (hello.name || '').slice(0, 16), faction: hello.faction || 'classic' }));
        conn.on('data', (d) => {
          if (!d) return;
          if (d.type === 'full') { clearTimeout(timeout); reject(new Error('That room is full.')); }
          else if (d.type === 'seat') { this.myId = d.id; onEvent && onEvent('seat', { id: d.id, roster: d.roster }); }
          else if (d.type === 'roster') { onEvent && onEvent('roster', d.roster); }
          else if (d.type === 'start') {
            clearTimeout(timeout);
            this.humanIds = d.humanIds; // myId was assigned by the earlier 'seat' message
            this.started = true;
            this.connected = true;
            resolve(d);
          } else if (d.type === 'cmds') {
            this.buf.set(d.tick, d.cmds);
            if (d.hash !== undefined) this.checkHash(d.hashTick, d.hash);
          }
        });
        conn.on('close', () => { this.connected = false; this.onDrop && this.onDrop(); });
        conn.on('error', (e) => { clearTimeout(timeout); this.connected = false; reject(e); });
      });
      this.peer.on('error', (e) => { clearTimeout(timeout); reject(e); });
    }));
  }

  // -------------------------------------------------- lockstep loop
  queueLocal(cmd) { this.localQ.push(cmd); }

  // true when this tick's merged commands are in hand (or aren't due yet)
  canStep() {
    if (this.tick < INPUT_DELAY) return true;
    return this.buf.has(this.tick);
  }

  // send this frame's local commands, scheduled INPUT_DELAY ticks ahead. The
  // steady stream (even when empty) is what keeps every client advancing.
  flush(game) {
    const target = this.tick + INPUT_DELAY;
    let hash, hashTick;
    if (this.tick % 100 === 0 && this.tick > 0) {
      hash = game.stateHash();
      hashTick = this.tick;
      this.hashes.set(hashTick, hash);
      for (const k of this.hashes.keys()) if (k < this.tick - 500) this.hashes.delete(k);
    }
    if (this.isHost) {
      // the host feeds its own input into the same aggregator as the guests'
      this.recvInput(this.myId, target, this.localQ, hash, hashTick);
    } else {
      try { this.hostConn.send({ type: 'input', pid: this.myId, tick: target, cmds: this.localQ, hash, hashTick }); } catch {}
    }
    this.localQ = [];
  }

  // HOST: collect a seat's commands for a tick; broadcast once every live human
  // has reported. GUEST calls this too for its own input via flush→recvInput?
  // No — only the host aggregates; guests send over the wire.
  recvInput(pid, tick, cmds, hash, hashTick) {
    if (!this.isHost) return;
    if (hash !== undefined && pid !== this.myId) this.checkHash(hashTick, hash);
    let p = this.pending.get(tick);
    if (!p) this.pending.set(tick, (p = {}));
    p[pid] = cmds || [];
    this.tryFinalize(tick);
  }

  tryFinalize(tick) {
    const p = this.pending.get(tick);
    if (!p) return;
    const required = this.humanIds.filter((id) => !this.left.has(id));
    for (const id of required) if (p[id] === undefined) return; // still waiting on someone
    const merged = {};
    for (const id of this.humanIds) merged[id] = this.left.has(id) ? [] : (p[id] || []);
    this.buf.set(tick, merged);
    // piggyback our latest state hash so guests can catch a desync early
    let hash, hashTick;
    const myHashTick = this.tick;
    if (this.hashes.has(myHashTick)) { hash = this.hashes.get(myHashTick); hashTick = myHashTick; }
    const msg = { type: 'cmds', tick, cmds: merged, hash, hashTick };
    for (const { conn } of this.conns) { try { conn.send(msg); } catch {} }
    this.pending.delete(tick);
  }

  checkHash(tick, hash) {
    if (tick === undefined) return;
    const mine = this.hashes.get(tick);
    if (mine !== undefined && mine !== hash && this.onDesync) this.onDesync(tick);
  }

  // execute every human seat's commands for the current tick, then advance.
  // AI seats aren't here — the sim runs them locally on every client.
  execTick(game) {
    const b = this.buf.get(this.tick);
    if (b) {
      for (const id of this.humanIds) {
        for (const c of (b[id] || [])) game.execCommand(id, c);
      }
      this.buf.delete(this.tick);
    }
    this.tick++;
  }

  destroy() {
    for (const { conn } of this.conns) { try { conn.close(); } catch {} }
    try { this.hostConn && this.hostConn.close(); } catch {}
    try { this.peer && this.peer.destroy(); } catch {}
  }
}
