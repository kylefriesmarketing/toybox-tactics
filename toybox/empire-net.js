// Empire Mode multiplayer (phase 3, push B): a tiny turn-based PeerJS relay.
// Two humans (host seat 0, guest seat 1) + the Tin Battalion AI in seat 2.
//
// The contract (proven by empireNetTest in empire.js): both clients run their
// own deterministic Empire from the shared seed, every state-mutating action
// travels as a command, commands apply in HOST-stamped order on both clients,
// and endTurn advances only when both players are ready. Same seed + same
// ordered commands ⇒ identical stateHash — checked after every turn.
//
// Guests do NOT apply their own commands locally; they wait for the host's
// echo (host-authoritative sequencing — a turn-based board forgives the RTT).

function randomCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += A[(Math.random() * A.length) | 0];
  return c;
}

export class EmpireNet {
  constructor() {
    this.peer = null;
    this.conn = null;       // the single other player (v1: 2 humans)
    this.isHost = false;
    this.mySeat = 0;
    this.seq = 0;           // host: next command stamp
    this.readySet = new Set();
    this.turn = 1;
    this.onCmd = null;      // (cmd) apply to the local Empire
    this.onAdvance = null;  // () both ready — endTurn now
    this.onStart = null;    // ({seat, seed}) match begins
    this.onPeerReady = null;
    this.onDrop = null;
    this.onDesync = null;
    this.hashes = {};       // turn -> my hash (host compares guest reports)
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

  host(onEvent) {
    this.isHost = true;
    this.mySeat = 0;
    this.onEvent = onEvent;
    return this.loadLib().then(() => new Promise((resolve, reject) => {
      const code = randomCode();
      this.peer = new window.Peer('toybox-emp-' + code);
      const timeout = setTimeout(() => reject(new Error('Signaling timeout — try again.')), 20000);
      this.peer.on('open', () => { clearTimeout(timeout); onEvent && onEvent('code', code); resolve({ code }); });
      this.peer.on('error', (e) => { clearTimeout(timeout); reject(e); });
      this.peer.on('connection', (conn) => {
        if (this.conn) { try { conn.send({ type: 'full' }); } catch { /* gone */ } return; }
        this.conn = conn;
        conn.on('data', (d) => this.onData(d));
        conn.on('close', () => this.onDrop && this.onDrop());
        conn.on('error', () => this.onDrop && this.onDrop());
      });
    }));
  }

  // the host locks the match: deals the seed, both clients build the same war
  startMatch(seed) {
    this.seed = seed;
    try { this.conn.send({ type: 'start', seed }); } catch { /* drop fires */ }
    this.onStart && this.onStart({ seat: 0, seed });
  }

  join(code, onEvent) {
    this.isHost = false;
    this.onEvent = onEvent;
    return this.loadLib().then(() => new Promise((resolve, reject) => {
      this.peer = new window.Peer();
      const timeout = setTimeout(() => reject(new Error('Could not reach the host — check the code.')), 20000);
      this.peer.on('error', (e) => { clearTimeout(timeout); reject(e); });
      this.peer.on('open', () => {
        const conn = this.peer.connect('toybox-emp-' + code.toUpperCase(), { reliable: true });
        this.conn = conn;
        conn.on('open', () => { try { conn.send({ type: 'hello' }); } catch { /* drop */ } });
        conn.on('data', (d) => {
          if (d && d.type === 'welcome') { clearTimeout(timeout); this.mySeat = 1; resolve({ seat: 1 }); }
          else this.onData(d);
        });
        conn.on('close', () => this.onDrop && this.onDrop());
        conn.on('error', () => this.onDrop && this.onDrop());
      });
    }));
  }

  onData(d) {
    if (!d) return;
    if (this.isHost) {
      if (d.type === 'hello') { try { this.conn.send({ type: 'welcome' }); } catch { /* drop */ } this.onEvent && this.onEvent('join'); return; }
      if (d.type === 'cmd') { this.applyAndEcho(d.cmd, 1); return; }
      if (d.type === 'ready') { this.markReady(1, d.turn); return; }
      if (d.type === 'hash') {
        if (this.hashes[d.turn] !== undefined && this.hashes[d.turn] !== d.h) this.onDesync && this.onDesync(d.turn);
        return;
      }
    } else {
      if (d.type === 'start') { this.onStart && this.onStart({ seat: 1, seed: d.seed }); return; }
      if (d.type === 'cmd') { this.onCmd && this.onCmd(d.cmd); return; } // host-stamped echo
      if (d.type === 'advance') { this.readySet.clear(); this.onAdvance && this.onAdvance(); return; }
      if (d.type === 'ready') { this.onPeerReady && this.onPeerReady(); return; }
    }
  }

  // ---- outgoing ----
  sendCmd(cmd) {
    if (this.isHost) this.applyAndEcho(cmd, 0);
    else { try { this.conn.send({ type: 'cmd', cmd }); } catch { /* drop */ } }
  }
  applyAndEcho(cmd, fromSeat) {
    if (cmd.seat !== fromSeat) return; // a client may only command its own seat
    cmd.seq = this.seq++;
    this.onCmd && this.onCmd(cmd);    // host applies in stamp order…
    try { this.conn.send({ type: 'cmd', cmd }); } catch { /* drop */ } // …then everyone else
  }
  ready(turn) {
    this.turn = turn;
    if (this.isHost) this.markReady(0, turn);
    else { try { this.conn.send({ type: 'ready', turn }); } catch { /* drop */ } }
  }
  markReady(seat, turn) {
    if (turn !== this.turn) return;
    this.readySet.add(seat);
    if (seat !== 0) this.onPeerReady && this.onPeerReady();
    if (this.readySet.size >= 2) {
      this.readySet.clear();
      try { this.conn.send({ type: 'advance' }); } catch { /* drop */ }
      this.onAdvance && this.onAdvance();
    }
  }
  reportHash(turn, h) {
    if (this.isHost) this.hashes[turn] = h;
    else { try { this.conn.send({ type: 'hash', turn, h }); } catch { /* drop */ } }
  }
  close() {
    try { this.conn && this.conn.close(); } catch { /* gone */ }
    try { this.peer && this.peer.destroy(); } catch { /* gone */ }
    this.conn = null; this.peer = null;
  }
}

// shared command schema — the ONE translation from wire commands to Empire
// verbs, used by the live net path (and mirrored by empireNetTest's harness)
export function applyEmpireCmd(emp, cmd) {
  const me = cmd.seat;
  const ownArmy = (id) => { const a = emp.s.armies.find((x) => x.id === id); return a && a.owner === me ? a : null; };
  switch (cmd.type) {
    case 'move': return ownArmy(cmd.army) && emp.issueMove(cmd.army, cmd.to);
    case 'cancel': return ownArmy(cmd.army) && emp.cancelMove(cmd.army);
    case 'march': return ownArmy(cmd.army) && emp.forceMarch(cmd.army);
    case 'recruit': return emp.recruit(me, cmd.army, cmd.key);
    case 'muster': return emp.muster(me);
    case 'drill': return emp.startDrill(cmd.army, cmd.card, me);
    case 'module': return emp.buildModule(me, cmd.node, cmd.key);
    case 'doctrine': return emp.setDoctrine(me, cmd.slot || 0, cmd.key);
    case 'upgrade': return emp.buyUpgrade(me, cmd.key);
    case 'pact': return emp.offerPact(cmd.other, me);
    case 'breakpact': return emp.breakPact(cmd.other, me);
    case 'trade': return emp.offerTrade(cmd.other, cmd.mode || 'power', me);
    case 'passage': return emp.offerPassage(cmd.other, me);
    case 'bounty': return emp.postBounty(cmd.other, me);
    case 'cease': return emp.offerCeasefire(cmd.other, me);
    default: return null;
  }
}
