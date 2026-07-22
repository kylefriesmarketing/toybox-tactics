// ============================================================
// EMPIRE MODE — the strategic campaign layer (Design Bible
// Phase 1 vertical slice). Two halves, deliberately separable:
//   Empire   — authoritative deterministic campaign sim. No DOM.
//   EmpireUI — the toy-diorama board screen; consumes state +
//              event log, never mutates campaign rules directly.
// Battles bridge to the existing RTS through BattleContext /
// BattleResult (see EMPIRE_MODE_ARCHITECTURE.md). The RTS layer
// is never modified — main.js injects { startGame } hooks.
// ============================================================

import { UNITS, FACTIONS } from './data.js';
import {
  E_NODES, E_ROUTES, E_TEMPLATES, E_NODE_TEMPLATE, E_NODE_TEMPLATE_OVERRIDE, E_TEMPLATE_VARIANTS,
  E_FACTIONS, E_START_ROSTER, E_GARRISONS, E_UPGRADES, E_BRANCHES, E_RULES, E_SIM,
  E_MODULES, E_MODULE_SLOTS, E_DOCTRINES, E_EVENTS, E_DIFFICULTY, E_REGIONS,
} from './empire-data.js';
import { EmpireNet, applyEmpireCmd } from './empire-net.js';
import {
  E_CARDS, E_RARITY, E_COMMON_KEYS, E_CARD_ORDER,
  loadCollection, saveCollection, ownsCard, grantCard, craftCard, rollLoot,
} from './empire-cards.js';

const SAVE_KEY = 'tt-empire';

// same LCG family as game.js — the campaign stream must save/restore exactly
function makeRng(seed) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  const f = () => (s = (s * 16807) % 2147483647) / 2147483647;
  f.getState = () => s;
  f.setState = (v) => { s = v; };
  return f;
}
// named-stream seed derivation (§20): campaignSeed + turn + node → encounter seed
function deriveSeed(base, turn, nodeId) {
  let h = base | 0;
  const s = `t${turn}_${nodeId}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  h = Math.abs(h) % 2147483646;
  return h + 1;
}

const routesOf = (id) => E_ROUTES.filter((r) => r[0] === id || r[1] === id)
  .map((r) => ({ to: r[0] === id ? r[1] : r[0], kind: r[2], cost: E_RULES.routeCost[r[2]] }));

// ---------------------------------------------------------------- Empire (sim)
export class Empire {
  constructor(seedOrSave, factions = ['bricks', 'classic', 'bots'], persist = true) {
    this.persist = persist; // headless tests run with persist=false (never touch storage)
    // the card collection is META — it lives across campaigns (tests get a throwaway)
    this.coll = persist ? loadCollection() : { owned: {}, scraps: 0, seen: [] };
    this.loot = []; // cards won this session (UI shows them; not authoritative state)
    if (seedOrSave && typeof seedOrSave === 'object') { this.load(seedOrSave); return; }
    const seed = seedOrSave || ((Math.random() * 2 ** 31) | 0);
    const S = factions.length; // round 14: seat count comes from the roster (2 or 3)
    const per = (v) => Array.from({ length: S }, () => (typeof v === 'function' ? v() : v));
    this.s = {
      v: 10, seed, turn: 1, phase: 'plan', rng: 0,
      difficulty: 'normal', difficultyChosen: false, // §13 challenge tier (picked on a fresh war)
      factions, // seat 0 = human, seats 1+ = AI rivals
      parts: per(E_RULES.startParts),
      power: per(E_RULES.startPower),
      imag: per(E_RULES.startImag),
      // seat 1 opens aggressive, seat 2 opens dug-in — different rivals, different wars
      doctrines: Array.from({ length: S }, (_, p) => p === 0 ? [] : p === 1 ? ['warrior'] : ['fortified']),
      stats: { played: 0, simmed: 0, won: 0, lost: 0, captured: 0, cards: 0 },
      event: null, // { kind:'vacuum', phase:'warn'|'active', route, left }
      crown: { owner: -1, turns: 0 }, // §16 Crown Victory tracker
      aiIntent: null,                  // rival's current target (Master Plan reveals it)
      warned: {}, lastLoot: null,      // victory telegraphs + newest card won
      upgrades: per(() => []),
      // §15 diplomacy: every PAIR of seats has a relation — war (default) or a
      // Non-Aggression Pact with turns remaining. Grudges make a betrayed rival
      // fight the betrayer bolder for a while.
      relations: {}, grudges: {},
      trades: {}, passages: {}, bounty: null, // round 17: the political toolkit
      humans: [0], // phase 3: which seats are human (MP campaigns list several)
      eliminated: [], // seats whose capital fell (their toys go back in the box)
      nodes: Object.fromEntries(Object.keys(E_NODES).map((id) => [id, {
        owner: id === 'CAP_A' ? 0 : id === 'CAP_B' ? 1 : (id === 'CAP_C' && S >= 3) ? 2 : -1,
        garrison: null, looted: false, modules: [],
      }])),
      armies: [],
      nextCard: per(0),
      encounters: [], // queued this battle window
      pendingPlay: null, // BattleContext handed to the RTS (survives reload)
      pendingSpoils: null, // Aftermath Spoils reward awaiting the human's pick (survives reload)
      returnToMap: false,
      rogue: null, // round 15: the wandering card-bounty gang
      log: [], over: false, winner: null, sunrise: false,
    };
    this.rng = makeRng(seed);
    // build the opening armies from card keys (deriving type/hp/vet per card)
    for (let owner = 0; owner < S; owner++) {
      const node = this.capOf(owner);
      this.s.armies.push({ id: 'A' + owner, owner, node, prev: node, mp: E_RULES.armyMP, marched: false, readiness: E_RULES.readiness.max,
        cards: E_START_ROSTER.map((key) => this.makeArmyCard(key, `A${owner}c${this.s.nextCard[owner]++}`, owner)), order: null });
    }
    this.s.rng = this.rng.getState();
    const names = this.seats().map((p) => this.facLabel(p)).join(' vs ');
    this.say(`🌙 The Bedroom War begins. ${names} — first to ${E_RULES.dominionNeed} territories.`);
    this.upkeep();
  }

  // ---------- round 14: seats, capitals, diplomacy helpers ----------
  seatCount() { return this.s.factions.length; }
  seats() { return Array.from({ length: this.seatCount() }, (_, i) => i); }
  aliveSeats() { return this.seats().filter((p) => !this.s.eliminated.includes(p)); }
  isAlive(p) { return !this.s.eliminated.includes(p); }
  capOf(p) { return ['CAP_A', 'CAP_B', 'CAP_C'][p]; }
  relKey(a, b) { return a < b ? `${a}-${b}` : `${b}-${a}`; }
  pactBetween(a, b) { return (this.s.relations || {})[this.relKey(a, b)] || null; }
  atPeace(a, b) { const r = this.pactBetween(a, b); return !!(r && r.left > 0); }
  grudgeVs(holder, target) { const g = (this.s.grudges || {})[`${holder}>${target}`]; return !!(g && g > 0); }
  // ⚠️ A dead seat keeps its provinces (you still have to take them) — but its
  // TREATIES must die with it. A surviving pact meant `reachable()` refused to
  // enter a corpse's territory, locking that land away from everyone until the
  // pact happened to expire. Wipe every agreement naming the fallen seat.
  purgeDiplomacy(p) {
    for (const k of Object.keys(this.s.relations || {})) {
      const [a, b] = k.split('-').map(Number);
      if (a === p || b === p) delete this.s.relations[k];
    }
    for (const k of Object.keys(this.s.grudges || {})) {
      const [a, b] = k.split('>').map(Number);
      if (a === p || b === p) delete this.s.grudges[k];
    }
    for (const k of Object.keys(this.s.trades || {})) {
      const [a, b] = k.includes('>') ? k.split('>').map(Number) : [0, Number(k)];
      if (a === p || b === p) delete this.s.trades[k];
    }
    for (const k of Object.keys(this.s.passages || {})) {
      const [a, b] = k.split('>').map(Number);
      if (a === p || b === p) delete this.s.passages[k];
    }
    if (this.s.bounty && (this.s.bounty.hunter === p || this.s.bounty.target === p)) this.s.bounty = null;
  }

  // pacts and grudges cool down one notch at the top of every turn
  tickDiplomacy() {
    for (const k of Object.keys(this.s.relations || {})) {
      const r = this.s.relations[k];
      if (r.left > 0) {
        r.left--;
        if (r.left === 0) {
          const [a, b] = k.split('-').map(Number);
          this.say(`🕊️ The pact between ${this.facLabel(a)} and ${this.facLabel(b)} expires.`);
        }
      }
    }
    for (const k of Object.keys(this.s.grudges || {})) if (this.s.grudges[k] > 0) this.s.grudges[k]--;
    // round 17: trades transfer every turn — and collapse the turn a side can't pay
    for (const k of Object.keys(this.s.trades || {})) {
      const t = this.s.trades[k];
      const [payer, other] = k.includes('>') ? k.split('>').map(Number) : [0, Number(k)];
      const D = E_RULES.diplomacy.trade;
      const rivalPays = t.mode === 'power' ? this.s.power[other] >= D.getPower : this.s.imag[other] >= D.getImag;
      if (this.s.parts[payer] < D.give || !rivalPays || !this.isAlive(other) || !this.isAlive(payer)) {
        delete this.s.trades[k];
        this.say(`⇄ The trade with ${this.facLabel(other)} collapses — somebody's pockets ran dry.`);
        continue;
      }
      this.s.parts[payer] -= D.give;
      this.s.parts[other] += D.give;
      if (t.mode === 'power') { this.s.power[other] -= D.getPower; this.s.power[payer] = Math.min(E_RULES.powerCap, this.s.power[payer] + D.getPower); }
      else { this.s.imag[other] -= D.getImag; this.s.imag[payer] += D.getImag; }
      t.left--;
      if (t.left <= 0) { delete this.s.trades[k]; this.say(`⇄ The trade with ${this.facLabel(other)} concludes, honestly and in full.`); }
    }
    for (const k of Object.keys(this.s.passages || {})) {
      this.s.passages[k].left--;
      if (this.s.passages[k].left <= 0) {
        delete this.s.passages[k];
        this.say('🛂 A passage agreement expires — the border posts go back up.');
      }
    }
    if (this.s.bounty) {
      this.s.bounty.left--;
      if (this.s.bounty.left <= 0) { this.say('🎯 Your bounty expires unclaimed.'); this.s.bounty = null; }
    }
  }
  // round 17 verbs — trade, passage, bounty, ceasefire (§15)
  hasPassage(payer, grantor) { const p2 = (this.s.passages || {})[`${payer}>${grantor}`]; return !!(p2 && p2.left > 0); }
  offerTrade(other, mode = 'power', me = 0) {
    const tk = `${me}>${other}`;
    if (this.s.over || other === me || !this.isAlive(other) || (this.s.trades || {})[tk]) return { ok: false };
    if (this.grudgeVs(other, me)) { this.say(`${this.facLabel(other)} won't trade with a betrayer.`); this.save(); return { ok: false, why: 'grudge' }; }
    const D = E_RULES.diplomacy.trade;
    if (this.s.parts[me] < D.give) return { ok: false, why: 'not enough Parts' };
    this.s.trades[tk] = { left: D.turns, mode };
    this.say(`⇄ Trade struck with ${this.facLabel(other)}: ${D.give}🔩/turn for ${mode === 'power' ? D.getPower + '⚡' : D.getImag + '💡'}/turn, ${D.turns} turns.`);
    this.save();
    return { ok: true };
  }
  offerPassage(other, me = 0) {
    if (this.s.over || other === me || !this.isAlive(other) || this.hasPassage(me, other)) return { ok: false };
    if (!this.atPeace(me, other)) { this.say(`${this.facLabel(other)} sells passage only to pact partners.`); this.save(); return { ok: false, why: 'no pact' }; }
    const D = E_RULES.diplomacy.passage;
    if (this.s.parts[me] < D.cost) return { ok: false, why: 'not enough Parts' };
    this.s.parts[me] -= D.cost;
    this.s.parts[other] += D.cost;
    this.s.passages[`${me}>${other}`] = { left: D.turns };
    this.say(`🛂 ${this.facLabel(other)} opens their roads to you for ${D.turns} turns (their capital stays shut).`);
    this.save();
    return { ok: true };
  }
  postBounty(target, me = 0) {
    if (this.s.over || target === me || !this.isAlive(target) || this.s.bounty) return { ok: false };
    const hunter = this.aliveSeats().find((p) => p !== me && p !== target && !(this.s.humans || [0]).includes(p));
    if (hunter == null) return { ok: false, why: 'nobody left to hunt' };
    const D = E_RULES.diplomacy.bounty;
    if (this.s.parts[me] < D.cost) return { ok: false, why: 'not enough Parts' };
    this.s.parts[me] -= D.cost;
    this.s.parts[hunter] += D.cost;
    this.s.bounty = { hunter, target, left: D.turns };
    this.say(`🎯 Bounty posted: ${this.facLabel(hunter)} takes your coin to harry ${this.facLabel(target)} for ${D.turns} turns. A proxy war, and your hands stay clean.`);
    this.save();
    return { ok: true };
  }
  offerCeasefire(other, me = 0) {
    if (this.s.over || other === me || !this.isAlive(other) || this.atPeace(me, other)) return { ok: false };
    const D = E_RULES.diplomacy.ceasefire;
    if (this.s.imag[me] < D.imag) return { ok: false, why: 'not enough Imagination' };
    this.s.imag[me] -= D.imag;
    this.s.relations[this.relKey(me, other)] = { left: D.turns };
    this.say(`🏳️ Ceasefire with ${this.facLabel(other)} — ${D.turns} turns of quiet, bought with pure Imagination.`);
    this.save();
    return { ok: true };
  }
  // the human offers a pact; the rival weighs it in the open (deterministic)
  offerPact(other, me = 0) {
    if (this.s.over || !this.isAlive(other) || other === me || this.atPeace(me, other)) return { ok: false, why: 'no' };
    // a rival accepts unless YOU are the clear leader — pacts never shield winners
    const lead = this.ownedCount(me) - Math.max(...this.aliveSeats().filter((p) => p !== me).map((p) => this.ownedCount(p)));
    const accepts = lead <= 1;
    if (!accepts) { this.say(`${this.facLabel(other)} refuses the pact — you look like winning, and pacts shield winners.`); this.save(); return { ok: false, why: 'refused' }; }
    this.s.relations[this.relKey(me, other)] = { left: E_RULES.pact.turns };
    this.say(`🕊️ Non-Aggression Pact: ${this.facLabel(me)} and ${this.facLabel(other)}, ${E_RULES.pact.turns} turns. No marches on each other's ground.`);
    this.save();
    return { ok: true };
  }
  breakPact(other, me = 0) {
    const r = this.pactBetween(me, other);
    if (!r || r.left <= 0) return { ok: false };
    delete this.s.relations[this.relKey(me, other)];
    this.s.power[me] = Math.max(0, this.s.power[me] - E_RULES.pact.breakPower);
    this.s.imag[me] = Math.max(0, this.s.imag[me] - E_RULES.pact.breakImag);
    this.s.grudges[`${other}>${me}`] = E_RULES.pact.grudgeTurns;
    this.say(`💔 You tear up the pact with ${this.facLabel(other)} (−${E_RULES.pact.breakPower}⚡ −${E_RULES.pact.breakImag}💡). They will remember.`);
    this.save();
    return { ok: true };
  }
  // rival-vs-rival politics: when the human leads the night, the rivals bury
  // their quarrel and gang up; otherwise their own war resumes on expiry
  aiDiplomacy() {
    const ais = this.aliveSeats().filter((p) => !(this.s.humans || [0]).includes(p));
    if (ais.length < 2) return;
    const [a, b] = ais;
    const humanLead = Math.max(...(this.s.humans || [0]).filter((h) => this.isAlive(h)).map((h) => this.ownedCount(h)), 0) >= Math.max(this.ownedCount(a), this.ownedCount(b)) + 2;
    if (humanLead && !this.atPeace(a, b)) {
      this.s.relations[this.relKey(a, b)] = { left: E_RULES.pact.turns };
      this.say(`🤝 ${this.facLabel(a)} and ${this.facLabel(b)} strike a pact — the whole floor turns on YOU.`);
    }
  }

  // build one army card from a collection card key (see empire-cards.js)
  makeArmyCard(key, id, owner) {
    const card = E_CARDS[key] || E_CARDS.recruit;
    return { id, key, type: card.unit, strength: 100, hp: card.hp || 1,
      vet: (card.vet || 0) + ((this.s.upgrades && this.s.upgrades[owner] && this.s.upgrades[owner].includes('reserves')) ? 1 : 0) };
  }

  // ---------- persistence (§20: save at every phase boundary) ----------
  save() {
    this.s.rng = this.rng.getState();
    if (!this.persist) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch (e) { /* storage full */ }
  }
  load(save) {
    // v1 → v2 migration: Power, campaign stats, house events (round 2)
    if (!save.power) save.power = [E_RULES.startPower, E_RULES.startPower];
    if (!save.stats) save.stats = { played: 0, simmed: 0, won: 0, lost: 0, captured: 0 };
    if (save.event === undefined) save.event = null;
    // v2 → v3 migration: Imagination, empire tree, Crown victory (round 3)
    if (!save.imag) save.imag = [E_RULES.startImag, E_RULES.startImag];
    if (!save.crown) save.crown = { owner: -1, turns: 0 };
    if (save.aiIntent === undefined) save.aiIntent = null;
    if (!save.warned) save.warned = {};
    // v3 → v4: the card collection (round 4). Old plain cards get a fallback key.
    if (save.lastLoot === undefined) save.lastLoot = null;
    if (save.stats && save.stats.cards === undefined) save.stats.cards = 0;
    for (const a of (save.armies || [])) for (const c of a.cards) {
      if (!c.key) { c.key = c.type === 'archer' ? 'archer' : c.type === 'spear' ? 'spear' : 'recruit'; c.hp = c.hp || 1; }
    }
    // v4 → v5: stronghold modules (round 5)
    for (const st of Object.values(save.nodes || {})) if (!st.modules) st.modules = [];
    // v5 → v6: doctrines (round 7)
    if (!save.doctrines) save.doctrines = [[], ['warrior']];
    // v6 → v7: Aftermath Spoils (round 9)
    if (save.pendingSpoils === undefined) save.pendingSpoils = null;
    // v7 → v8: army readiness (round 10) — existing armies wake up fresh
    for (const a of (save.armies || [])) if (a.readiness === undefined) a.readiness = E_RULES.readiness.max;
    // v8 → v9: Empire difficulty (round 13) — in-progress wars keep Normal and skip the picker
    if (save.difficulty === undefined) { save.difficulty = 'normal'; save.difficultyChosen = true; }
    // v9 → v10: third seat + diplomacy (round 14). In-progress 2-seat wars stay
    // 2-seat wars (CAP_C sits neutral on their board); relations default to war
    if (save.relations === undefined) save.relations = {};
    if (save.grudges === undefined) save.grudges = {};
    if (save.eliminated === undefined) save.eliminated = [];
    if (save.nodes && !save.nodes.CAP_C) save.nodes.CAP_C = { owner: -1, garrison: null, looted: false, modules: [] };
    if (save.rogue === undefined) save.rogue = null; // round 15 (transient, no version bump)
    if (save.trades === undefined) save.trades = {};
    if (save.passages === undefined) save.passages = {};
    if (save.bounty === undefined) save.bounty = null;
    if (save.humans === undefined) save.humans = [0];
    for (const k of Object.keys(save.trades || {})) if (!k.includes('>')) { save.trades['0>' + k] = save.trades[k]; delete save.trades[k]; }
    save.v = 10;
    this.s = save; this.rng = makeRng(1); this.rng.setState(save.rng);
  }
  static stored() {
    try { const j = localStorage.getItem(SAVE_KEY); return j ? JSON.parse(j) : null; } catch (e) { return null; }
  }
  static clear() { localStorage.removeItem(SAVE_KEY); }

  // ---------- helpers ----------
  facKey(p) { return this.s.factions[p]; }
  facLabel(p) { return FACTIONS[this.facKey(p)] ? FACTIONS[this.facKey(p)].label : this.facKey(p); }
  facColor(p) { return (E_FACTIONS[this.facKey(p)] || {}).color || '#999'; }
  say(msg) { this.s.log.push({ t: this.s.turn, msg }); if (this.s.log.length > 60) this.s.log.shift(); }
  armyAt(nodeId) { return this.s.armies.find((a) => a.node === nodeId && a.cards.length); }
  ownedCount(p) { return Object.values(this.s.nodes).filter((n) => n.owner === p).length; }
  fortCount(p) { return Object.keys(this.s.nodes).filter((id) => this.s.nodes[id].owner === p && (E_NODES[id].type === 'stronghold')).length; }
  // supply (§8, binary): a node is Supplied when it reaches the capital through
  // friendly-owned nodes over OPEN routes. Unsupplied territory yields half and
  // cannot mend armies — cutting one route creates an isolated pocket.
  suppliedSet(p) {
    const cap = this.capOf(p);
    const set = new Set();
    if (this.s.nodes[cap].owner !== p) return set;
    set.add(cap);
    let frontier = [cap];
    while (frontier.length) {
      const next = [];
      for (const f of frontier) for (const r of this.openRoutesOf(f)) {
        if (set.has(r.to) || this.s.nodes[r.to].owner !== p) continue;
        set.add(r.to); next.push(r.to);
      }
      frontier = next;
    }
    return set;
  }
  income(p, sup = null) {
    const supplied = sup || this.suppliedSet(p);
    const flooded = this.floodedNode();
    let inc = 0;
    for (const [id, st] of Object.entries(this.s.nodes)) {
      if (st.owner !== p) continue;
      let y = supplied.has(id) ? E_NODES[id].yield : Math.floor(E_NODES[id].yield / 2);
      if (id === flooded) y = Math.floor(y / 2); // Spilled Drink half-drowns this node's yield
      inc += y;
      // a Workshop module runs whenever the node is supplied
      if (supplied.has(id)) for (const k of (st.modules || [])) if (E_MODULES[k].parts_yield) inc += E_MODULES[k].parts_yield;
    }
    // Industry II: the capital runs a second workshop shift
    const cap = this.capOf(p);
    if (this.s.upgrades[p].includes('workshop') && this.s.nodes[cap].owner === p && supplied.has(cap)) inc += E_RULES.workshopBonus;
    return inc;
  }
  powerIncome(p, sup = null) {
    const supplied = sup || this.suppliedSet(p);
    let inc = 0;
    for (const [id, st] of Object.entries(this.s.nodes)) {
      if (st.owner === p && supplied.has(id)) {
        inc += E_NODES[id].powerYield || 0;
        for (const k of (st.modules || [])) inc += E_MODULES[k].power_yield || 0; // Power Cell (§8)
      }
    }
    return inc;
  }
  imagIncome(p, sup = null) {
    const supplied = sup || this.suppliedSet(p);
    let inc = 0;
    for (const [id, st] of Object.entries(this.s.nodes)) {
      if (st.owner === p && supplied.has(id)) {
        inc += E_NODES[id].imagYield || 0;
        for (const k of (st.modules || [])) inc += E_MODULES[k].imag_yield || 0; // Dream Library (§8)
      }
    }
    return inc;
  }
  ownerPowerMul(owner) {
    let m = this.s.upgrades[owner] && this.s.upgrades[owner].includes('combined') ? E_RULES.combinedArmsMul : 1;
    if (this.hasDoctrine(owner, 'warrior')) m *= 1.10; // Warrior's Code
    return m;
  }
  // routes still usable this turn (a house event can close one)
  openRoutesOf(id) {
    const blocked = this.blockedRoute();
    return E_ROUTES.map((r, i) => ({ r, i })).filter(({ r, i }) => i !== blocked && (r[0] === id || r[1] === id))
      .map(({ r }) => ({ to: r[0] === id ? r[1] : r[0], kind: r[2], cost: E_RULES.routeCost[r[2]] }));
  }
  floodedNode() {
    const ev = this.s.event;
    return (ev && ev.phase === 'active' && E_EVENTS[ev.kind].floods) ? ev.node : null;
  }
  upkeepCost(p) {
    let cards = 0;
    for (const a of this.s.armies) if (a.owner === p) cards += a.cards.length;
    return Math.floor(cards / 2);
  }
  armiesOf(p) { return this.s.armies.filter((a) => a.owner === p && a.cards.length); }
  // deterministic state fingerprint for tests + future MP hash checks
  stateHash() {
    const core = { t: this.s.turn, p: this.s.parts, pw: this.s.power, im: this.s.imag, u: this.s.upgrades, dc: this.s.doctrines, df: this.s.difficulty, r: this.s.rng,
      dip: JSON.stringify(this.s.relations || {}) + '|' + JSON.stringify(this.s.grudges || {}) + '|' + (this.s.eliminated || []).join(','),
      rg: this.s.rogue ? this.s.rogue.node + ':' + this.s.rogue.left + ':' + this.s.rogue.cards.map((c) => c.key + c.strength).join('') : '',
      pol: JSON.stringify(this.s.trades || {}) + '|' + JSON.stringify(this.s.passages || {}) + '|' + JSON.stringify(this.s.bounty || null) + '|' + (this.s.humans || [0]).join(','),
      cr: this.s.crown.owner + ':' + this.s.crown.turns, ev: this.s.event ? this.s.event.kind + this.s.event.route + this.s.event.phase + (this.s.event.node || '') : '',
      sp: this.s.pendingSpoils ? this.s.pendingSpoils.node : '',
      lt: this.s.lastLoot ? this.s.lastLoot.key : '',
      n: Object.entries(this.s.nodes).map(([k, v]) => k + v.owner + (v.garrison ? v.garrison.length : '') + (v.modules || []).join('')),
      a: this.s.armies.map((a) => a.id + a.node + (a.readiness == null ? '' : a.readiness) + a.cards.map((c) => (c.key || c.type) + c.strength + c.vet).join('')) };
    const str = JSON.stringify(core);
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) | 0;
    return h;
  }

  // ---------- turn phases (§6, slice: sequential resolution) ----------
  upkeep() {
    this.tickEvent();
    this.tickDiplomacy();
    this.tickRogue();
    for (const p of this.aliveSeats()) {
      const sup = this.suppliedSet(p);
      // §13: the challenge tier scales every RIVAL's Parts income (AI seats)
      const ecoMul = p > 0 ? this.diff().aiIncomeMul : 1;
      this.s.parts[p] += Math.round(this.income(p, sup) * ecoMul) - this.upkeepCost(p);
      if (this.s.parts[p] < 0) this.s.parts[p] = 0;
      // Low Battery Night dims Power income for everyone while it lasts
      const dim = this.s.event && this.s.event.phase === 'active' && E_EVENTS[this.s.event.kind].dimsPower;
      this.s.power[p] = Math.min(E_RULES.powerCap, this.s.power[p] + (dim ? 0 : this.powerIncome(p, sup)));
      // Dreamer's Gambit: +50% Imagination income
      this.s.imag[p] += Math.round(this.imagIncome(p, sup) * (this.hasDoctrine(p, 'dreamer') ? 1.5 : 1));
      const relayMP = E_RULES.armyMP + (this.s.upgrades[p].includes('relay') ? E_RULES.relayMP : 0)
        + (this.hasDoctrine(p, 'lightning') ? 1 : 0); // Lightning Campaign
      // resting on SUPPLIED friendly ground mends the toys (§8, §11)
      for (const a of this.s.armies) {
        if (a.owner !== p || !a.cards.length) continue;
        a.mp = relayMP;
        a.order = null;
        a.marched = false;
        const st = this.s.nodes[a.node];
        if (st && st.owner === p && sup.has(a.node)) {
          const wsHeal = (st.modules || []).reduce((s, k) => s + (E_MODULES[k].heal || 0), 0);
          const heal = E_RULES.healPerTurn + (this.s.upgrades[p].includes('repairs') ? 12 : 0) + wsHeal;
          for (const c of a.cards) c.strength = Math.min(100, c.strength + heal);
          // resting on supplied friendly ground also restores readiness (§11)
          if (a.readiness != null) a.readiness = Math.min(E_RULES.readiness.max, a.readiness + E_RULES.readiness.regen);
        }
      }
    }
    this.s.phase = 'plan';
    this.save();
  }

  // House events (§5): one brews at a time, telegraphed a full turn before it
  // strikes. All rolls come from the campaign stream — seeded, replayable.
  blockedRoute() {
    const ev = this.s.event;
    return (ev && ev.phase === 'active' && E_EVENTS[ev.kind].closesRoute) ? ev.route : -1;
  }
  routeNames(i) { const [a, b] = E_ROUTES[i]; return `${E_NODES[a].name}–${E_NODES[b].name}`; }
  tickEvent() {
    const ev = this.s.event;
    if (ev) {
      const def = E_EVENTS[ev.kind];
      if (ev.phase === 'warn') {
        ev.phase = 'active';
        ev.left = E_RULES.vacuum.duration;
        if (def.closesRoute) this.say(`${def.icon} ${def.name} strikes the ${this.routeNames(ev.route)} road — closed ${ev.left} turns!`);
        if (def.dimsPower) this.say(`${def.icon} ${def.name} — Power runs dry across the room for ${ev.left} turns.`);
        if (def.swat) {
          const [a, b] = E_ROUTES[ev.route];
          for (const nid of [a, b]) {
            const army = this.armyAt(nid);
            if (army) { for (const c of army.cards) c.strength = Math.max(10, c.strength - 20); this.say(`🐱 The cat swats ${this.facLabel(army.owner)}'s army at ${E_NODES[nid].name}!`); }
          }
        }
        if (def.floods) {
          const [a, b] = E_ROUTES[ev.route];
          ev.node = this.rng() < 0.5 ? a : b;
          this.say(`${def.icon} The spill floods ${E_NODES[ev.node].name} — half yield for ${ev.left} turns.`);
        }
      } else if (--ev.left <= 0) {
        this.say(`🌤️ The ${def.name} passes. The room settles.`);
        this.s.event = null;
      }
      return;
    }
    if (this.s.turn >= E_RULES.vacuum.earliest && this.rng() < E_RULES.vacuum.chance) {
      const kinds = Object.keys(E_EVENTS);
      const kind = kinds[(this.rng() * kinds.length) | 0];
      const def = E_EVENTS[kind];
      const nev = { kind, phase: 'warn', left: 0 };
      if (def.closesRoute) nev.route = (this.rng() * E_ROUTES.length) | 0;
      this.s.event = nev;
      this.say(`⚠️ ${def.warn}${def.closesRoute ? ` (the ${this.routeNames(nev.route)} road)` : ''} One turn to react!`);
    }
  }

  // legal one-step moves for an army (UI highlights; orders validated the same way)
  reachable(army) {
    // a pact means NO PASSAGE (§15): you may not enter a partner's territory
    // or a node their army stands on — the border is the whole point
    return this.openRoutesOf(army.node).filter((r) => {
      if (r.cost > army.mp) return false;
      const st = this.s.nodes[r.to];
      // paid passage (round 17) opens a partner's provinces — never their capital
      const transit = st.owner >= 0 && this.hasPassage(army.owner, st.owner) && E_NODES[r.to].type !== 'capital';
      if (st.owner >= 0 && st.owner !== army.owner && this.atPeace(army.owner, st.owner) && !transit) return false;
      const other = this.armyAt(r.to);
      if (other && other.owner !== army.owner && this.atPeace(army.owner, other.owner)) return false;
      return true;
    });
  }

  // Force March (§6): burn 1 Power for +1 MP, once per army per turn
  forceMarch(armyId) {
    const a = this.s.armies.find((x) => x.id === armyId);
    if (!a || a.marched || this.s.phase !== 'plan') return { ok: false, why: 'already marched' };
    const cost = this.hasDoctrine(a.owner, 'lightning') ? 0 : E_RULES.forceMarchCost; // Lightning Campaign
    if (this.s.power[a.owner] < cost) return { ok: false, why: 'not enough Power' };
    this.s.power[a.owner] -= cost;
    a.mp += 1;
    a.marched = true;
    this.tire(a, E_RULES.readiness.marchCost); // a hard march also wears the toys down (§11)
    this.say(`${this.facLabel(a.owner)} winds their toys tight — a forced march!`);
    this.save();
    return { ok: true };
  }

  // Muster (§11): a second army at the capital, once the empire can feed it
  muster(p) {
    const cap = this.capOf(p);
    if (this.armiesOf(p).length >= E_RULES.maxArmies) return { ok: false, why: 'army cap reached' };
    if (this.ownedCount(p) < E_RULES.musterMinNodes) return { ok: false, why: `need ${E_RULES.musterMinNodes} territories` };
    if (this.s.parts[p] < E_RULES.musterCost) return { ok: false, why: 'not enough Parts' };
    this.s.parts[p] -= E_RULES.musterCost;
    // dead armies stay as tombstones, so the per-owner count yields a unique,
    // deterministic id even when a destroyed army is replaced (B0, then B0_2…)
    const nth = this.s.armies.filter((a) => a.owner === p).length;
    const id = nth <= 1 ? `B${p}` : `B${p}_${nth}`;
    this.s.armies.push({ id, owner: p, node: cap, prev: cap, mp: E_RULES.armyMP, marched: false, readiness: E_RULES.readiness.max,
      cards: [this.makeArmyCard('recruit', `${id}c${this.s.nextCard[p]++}`, p)], order: null });
    this.say(`🚩 ${this.facLabel(p)} musters a second army!`);
    this.save();
    return { ok: true };
  }

  // queue/replace a one-hop order for the human seat during planning
  issueMove(armyId, to) {
    const a = this.s.armies.find((x) => x.id === armyId);
    if (!a || this.s.phase !== 'plan' || this.s.over) return { ok: false, why: 'not planning' };
    const r = this.reachable(a).find((x) => x.to === to);
    if (!r) return { ok: false, why: 'no route / not enough MP' };
    a.order = { to, cost: r.cost };
    return { ok: true };
  }
  cancelMove(armyId) { const a = this.s.armies.find((x) => x.id === armyId); if (a) a.order = null; }

  // recruit a collection card into an army. cardKey null = AI/quick pick (cycles
  // commons). Humans may only field cards they own (commons are always in hand).
  recruit(p, armyId = null, cardKey = null) {
    const cap = this.capOf(p);
    const a = armyId ? this.s.armies.find((x) => x.id === armyId && x.owner === p)
      : this.armiesOf(p).find((x) => this.canRecruitAt(p, x.node));
    if (!a || !this.canRecruitAt(p, a.node)) return { ok: false, why: 'stand at your capital or a Barracks' };
    if (a.cards.length >= E_RULES.maxCards) return { ok: false, why: 'army is at full strength' };
    if (!cardKey) cardKey = E_COMMON_KEYS[this.s.nextCard[p] % E_COMMON_KEYS.length];
    const card = E_CARDS[cardKey];
    if (!card) return { ok: false, why: 'no such card' };
    if (p === 0 && !ownsCard(this.coll, cardKey)) return { ok: false, why: 'card not in your collection' };
    if (this.s.parts[p] < card.cost) return { ok: false, why: 'not enough Parts' };
    this.s.parts[p] -= card.cost;
    a.cards.push(this.makeArmyCard(cardKey, `A${p}c${this.s.nextCard[p]++}`, p));
    this.say(`${this.facLabel(p)} fields ${card.name}.`);
    this.save();
    return { ok: true };
  }

  // ---- doctrines (§10) ----
  hasDoctrine(p, key) { return (this.s.doctrines[p] || []).includes(key); }
  doctrineSlots(p) { return this.s.turn >= E_RULES.doctrineSlot2Turn ? 2 : 1; }
  setDoctrine(p, slot, key) {
    // the phase gate is a HUMAN-input rule; the AI plans during resolve
    // (⚠️ round 16 fix: this guard silently blocked every AI doctrine since R14)
    if (p === 0 && (this.s.phase !== 'plan' || this.s.over)) return { ok: false, why: 'plan phase only' };
    if (slot >= this.doctrineSlots(p)) return { ok: false, why: 'that slot unlocks midgame' };
    const cur = this.s.doctrines[p];
    if (key && this.s.doctrines[p].includes(key) && cur[slot] !== key) return { ok: false, why: 'already active' };
    const occupied = !!cur[slot];
    if (occupied && cur[slot] !== key && this.s.power[p] < E_RULES.doctrineSwapCost) return { ok: false, why: `swap costs ${E_RULES.doctrineSwapCost}⚡` };
    if (occupied && cur[slot] !== key) this.s.power[p] -= E_RULES.doctrineSwapCost; // committing anew costs Power
    cur[slot] = key || null;
    if (key) this.say(`${this.facLabel(p)} commits to the ${E_DOCTRINES[key].name} doctrine.`);
    this.save();
    return { ok: true };
  }

  // Empire difficulty (§13): resolved config for the current challenge tier
  diff() { return E_DIFFICULTY[this.s.difficulty] || E_DIFFICULTY.normal; }
  // choose the challenge tier — only on a fresh, untouched war (before any turn is taken)
  setDifficulty(key) {
    if (!E_DIFFICULTY[key]) return { ok: false, why: 'unknown difficulty' };
    if (this.s.difficultyChosen || this.s.turn !== 1) return { ok: false, why: 'the war is already under way' };
    this.s.difficulty = key;
    this.s.difficultyChosen = true;
    this.say(`🌙 The war is set to ${E_DIFFICULTY[key].label}.`);
    this.save();
    return { ok: true };
  }

  // ---- stronghold modules (§8) ----
  moduleSlots(nodeId) { return E_MODULE_SLOTS[E_NODES[nodeId].type] || 0; }
  // round 16: the kingdoms of the floor — which realm a province belongs to,
  // and which flag flies over the realm (majority holder, ties fly no flag)
  regionOf(nodeId) {
    for (const [k, r] of Object.entries(E_REGIONS)) if (r.nodes.includes(nodeId)) return k;
    return null;
  }
  regionOwner(regionKey) {
    const r = E_REGIONS[regionKey];
    if (!r) return -1;
    const counts = {};
    for (const id of r.nodes) {
      const o = this.s.nodes[id].owner;
      if (o >= 0) counts[o] = (counts[o] || 0) + 1;
    }
    let best = -1, bestN = 0, tie = false;
    for (const [o, n] of Object.entries(counts)) {
      if (n > bestN) { best = Number(o); bestN = n; tie = false; }
      else if (n === bestN) tie = true;
    }
    return tie || bestN * 2 <= r.nodes.length ? -1 : best; // must hold a true majority
  }
  hasModule(nodeId, key) { return (this.s.nodes[nodeId].modules || []).includes(key); }
  buildModule(p, nodeId, key) {
    const st = this.s.nodes[nodeId], mod = E_MODULES[key];
    if (!mod || st.owner !== p) return { ok: false, why: 'not yours' };
    // human-only phase gate (⚠️ round 16 fix: blocked every AI build since R5)
    if (p === 0 && this.s.phase !== 'plan') return { ok: false, why: 'plan phase only' };
    if (this.hasModule(nodeId, key)) return { ok: false, why: 'already built' };
    if (st.modules.length >= this.moduleSlots(nodeId)) return { ok: false, why: 'no free sockets' };
    if (this.s.parts[p] < mod.parts) return { ok: false, why: 'not enough Parts' };
    if (this.s.imag[p] < (mod.imag || 0)) return { ok: false, why: 'not enough Imagination' };
    this.s.parts[p] -= mod.parts; this.s.imag[p] -= (mod.imag || 0);
    st.modules.push(key);
    this.say(`${mod.icon} ${this.facLabel(p)} builds a ${mod.name} at ${E_NODES[nodeId].name}.`);
    this.save();
    return { ok: true };
  }
  // total defence bonus a node's modules grant its defender
  moduleDefBonus(nodeId) {
    let d = 0;
    for (const k of (this.s.nodes[nodeId].modules || [])) if (E_MODULES[k].def) d += E_MODULES[k].def;
    return d;
  }
  // can this player recruit standing here? (capital, or a node with a Barracks)
  canRecruitAt(p, nodeId) {
    const cap = this.capOf(p);
    return nodeId === cap || (this.s.nodes[nodeId].owner === p && this.hasModule(nodeId, 'barracks'));
  }

  // ---- collection actions (meta; persist-gated) ----
  craft(key) {
    const r = craftCard(this.coll, key);
    if (r.ok) { if (this.persist) saveCollection(this.coll); this.say(`🃏 Crafted ${E_CARDS[key].name} from scraps.`); }
    return r;
  }

  buyUpgrade(p, key) {
    const u = E_UPGRADES[key];
    if (!u || this.s.upgrades[p].includes(key)) return { ok: false, why: 'already owned' };
    if (u.prereq && !this.s.upgrades[p].includes(u.prereq)) return { ok: false, why: `needs ${E_UPGRADES[u.prereq].name}` };
    const partsCost = this.hasDoctrine(p, 'dreamer') ? Math.round(u.parts * 0.8) : u.parts; // Dreamer's Gambit
    if (this.s.parts[p] < partsCost) return { ok: false, why: 'not enough Parts' };
    if (this.s.imag[p] < u.imag) return { ok: false, why: 'not enough Imagination' };
    this.s.parts[p] -= partsCost;
    this.s.imag[p] -= u.imag;
    this.s.upgrades[p].push(key);
    this.say(`${this.facLabel(p)} adopts ${u.name}.`);
    this.save();
    return { ok: true };
  }

  // End Turn: resolve human move → AI plans+moves → battle window forms.
  // Battles that involve the human become interactive encounters; AI-only
  // fights auto-simulate. Aftermath runs when the encounter queue empties.
  endTurn() {
    if (this.s.phase !== 'plan' || this.s.over) return;
    this.s.phase = 'resolve';
    // seats resolve in order (IGO-UGO): humans march their queued orders,
    // AI seats plan then march (phase 3: any seat may be human)
    for (const p of this.aliveSeats()) {
      if (!(this.s.humans || [0]).includes(p)) this.aiPlan(p);
      for (const a of this.armiesOf(p)) this.resolveMove(a);
    }
    this.s.phase = 'battle';
    this.save();
    this.autoResolveAiBattles();
    if ((this.s.humans || [0]).length > 1) {
      // phase 3: MP campaigns settle every battle by the deterministic formula
      // (played battles remain the SP fantasy — no reloads mid-connection)
      this.mpDrain();
      if (this.s.phase === 'battle') this.aftermath();
    } else if (!this.s.encounters.length) this.aftermath();
  }
  mpDrain() {
    let g = 0, enc;
    while ((enc = this.nextEncounter()) && g++ < 12) this.finishEncounter(enc, this.simulate(enc));
    if (this.s.pendingSpoils) this.resolveSpoils('parts'); // MP: spoils auto-salvage, deterministically
  }

  resolveMove(army) {
    if (!army || !army.order || !army.cards.length) return;
    const { to, cost } = army.order;
    army.order = null;
    army.mp -= cost;
    army.prev = army.node;
    army.node = to;
    const st = this.s.nodes[to];
    // passage transit (round 17): standing on a partner's province, no shots fired
    if (st.owner >= 0 && st.owner !== army.owner && this.hasPassage(army.owner, st.owner)) return;
    const hostileArmy = this.s.armies.find((a) => a.owner !== army.owner && a.node === to && a.cards.length
      && !this.atPeace(army.owner, a.owner));
    const hostileNode = st.owner !== -1 && st.owner !== army.owner;
    if (hostileArmy || hostileNode || (st.owner === -1 && this.garrisonFor(to))) {
      this.createEncounter(army, to, hostileArmy || null);
    } else {
      this.capture(army.owner, to);
    }
  }

  garrisonFor(nodeId) {
    const st = this.s.nodes[nodeId];
    if (st.garrison) return st.garrison.length ? st.garrison : null;
    const tmpl = E_GARRISONS[E_NODES[nodeId].type];
    if (!tmpl) return null;
    st.garrison = tmpl.map((c, i) => ({ id: `${nodeId}g${i}`, type: c.type, strength: 100, vet: 0 }));
    return st.garrison;
  }

  createEncounter(attArmy, nodeId, defArmy) {
    const st = this.s.nodes[nodeId];
    const defCards = defArmy ? defArmy.cards : this.garrisonFor(nodeId);
    if (!defCards || !defCards.length) { this.capture(attArmy.owner, nodeId); return; }
    const tKey = E_NODE_TEMPLATE_OVERRIDE[nodeId] || E_NODE_TEMPLATE[E_NODES[nodeId].type] || 'field';
    // deterministic mission-template variant for THIS encounter (§7) — a salted seed so it's
    // independent of the battle-resolution seed; flavour/mode only, never touches sim odds
    const variants = E_TEMPLATE_VARIANTS[tKey];
    const variant = variants && variants.length ? deriveSeed(this.s.seed, this.s.turn, nodeId + attArmy.id + 'var') % variants.length : 0;
    const enc = {
      encId: `e_t${this.s.turn}_${nodeId}_${attArmy.id}`,
      seed: deriveSeed(this.s.seed, this.s.turn, nodeId + attArmy.id),
      nodeId, template: tKey, variant,
      attacker: { owner: attArmy.owner, armyId: attArmy.id },
      defender: { owner: defArmy ? defArmy.owner : st.owner, armyId: defArmy ? defArmy.id : null },
      applied: false,
    };
    this.s.encounters.push(enc);
    this.say(`⚔️ ${this.facLabel(attArmy.owner)} marches on ${E_NODES[nodeId].name}!`);
  }

  // ---------- battle preview + simulation (§12) ----------
  unitPower(type) {
    const d = UNITS[type];
    if (!d) return 1;
    return d.hp * E_SIM.hpW + (d.atk / d.interval) * E_SIM.dpsW;
  }
  cardsPower(cards) {
    let p = E_SIM.cmdFlat;
    for (const c of cards) p += this.unitPower(c.type) * (c.hp || 1) * (c.strength / 100) * (1 + E_RULES.vetPowerBonus * (c.vet || 0));
    return p;
  }
  encCards(enc) {
    // Drill Yard (round 15): one card spars against practice dummies
    if (enc.drill) {
      const att = this.s.armies.find((a) => a.id === enc.attacker.armyId);
      const card = att && att.cards.find((c) => c.id === enc.cardId);
      return { attCards: card ? [card] : [], defCards: enc.sparring || [] };
    }
    const att = this.s.armies.find((a) => a.id === enc.attacker.armyId);
    const def = enc.defender.armyId
      ? this.s.armies.find((a) => a.id === enc.defender.armyId)
      : { cards: (this.s.rogue && this.s.rogue.node === enc.nodeId ? this.s.rogue.cards : null) || this.s.nodes[enc.nodeId].garrison || [] };
    return { attCards: att ? att.cards : [], defCards: def ? def.cards : [] };
  }

  // ---------- round 15: the Drill Yard (playable training) ----------
  startDrill(armyId, cardId, me = 0) {
    if (this.s.phase !== 'plan' || this.s.over) return { ok: false, why: 'not now' };
    const a = this.s.armies.find((x) => x.id === armyId && x.owner === me);
    if (!a || a.node !== this.capOf(me)) return { ok: false, why: 'army must rest at your capital' };
    const card = a.cards.find((c) => c.id === cardId);
    if (!card) return { ok: false, why: 'no such card' };
    if (this.s.parts[me] < E_RULES.drill.cost) return { ok: false, why: 'not enough Parts' };
    if (this.s.encounters.some((e) => e.drill && !e.applied)) return { ok: false, why: 'the yard is busy' };
    this.s.parts[me] -= E_RULES.drill.cost;
    const t = this.s.turn;
    const enc = {
      encId: `drill_t${t}_${cardId}`,
      seed: deriveSeed(this.s.seed, t, 'drill' + cardId),
      nodeId: this.capOf(0), template: 'drill', variant: 0, drill: true, cardId,
      // sparring partners: soft, numerous, and very good-natured about losing
      sparring: [
        { id: `sp_${t}_1`, key: 'recruit', type: 'soldier', strength: 75, vet: 0, hp: 1 },
        { id: `sp_${t}_2`, key: 'archer', type: 'archer', strength: 75, vet: 0, hp: 1 },
      ],
      attacker: { owner: me, armyId },
      defender: { owner: -1, armyId: null },
      applied: false,
    };
    this.s.encounters.push(enc);
    this.say(`🎯 ${E_CARDS[card.key] ? E_CARDS[card.key].name : card.type} steps into the Drill Yard (−${E_RULES.drill.cost}🔩).`);
    this.save();
    return { ok: true };
  }
  applyDrillResult(enc, result) {
    enc.applied = true;
    const a = this.s.armies.find((x) => x.id === enc.attacker.armyId);
    const card = a && a.cards.find((c) => c.id === enc.cardId);
    if (!card) return;
    card.strength = 100; // training never breaks the toy — the rust comes off either way
    const name = E_CARDS[card.key] ? E_CARDS[card.key].name : card.type;
    if (result.attackerWon && result.mode === 'played' && card.vet < E_RULES.drill.vetCap) {
      card.vet++;
      this.say(`⭐ ${name} wins the bout FOUGHT FOR REAL — battle-hardened (+1 vet)!`);
    } else if (result.attackerWon) {
      this.say(`🎯 ${name} drills well. (Play the bout yourself to earn a vet pip.)`);
    } else {
      this.say(`🎯 ${name} takes a tumble in the yard — no harm done.`);
    }
  }

  // ---------- round 15: Rogue Toys (playable card-bounty hunts) ----------
  tickRogue() {
    const R = E_RULES.rogue;
    if (this.s.rogue) {
      this.s.rogue.left--;
      if (this.s.rogue.left <= 0) {
        this.say(`🎲 The rogue toys at ${E_NODES[this.s.rogue.node].name} pack up and move on.`);
        this.s.rogue = null;
      }
      return;
    }
    if (this.s.turn < R.earliest || this.s.turn % R.every !== 0) return;
    // a seeded neutral squat: no capitals, no armies parked there, not the crown
    const spots = Object.entries(this.s.nodes)
      .filter(([id, st]) => st.owner === -1 && !this.armyAt(id)
        && E_NODES[id].type !== 'capital' && E_NODES[id].type !== 'crown')
      .map(([id]) => id).sort();
    if (!spots.length) return;
    const node = spots[Math.floor(this.rng() * spots.length)];
    const tier = this.s.turn >= 16 ? ['tank', 'knight', 'grenadier']
      : this.s.turn >= 9 ? ['knight', 'grenadier', 'raider'] : ['raider', 'grenadier'];
    this.s.rogue = {
      node, left: R.stay,
      cards: tier.map((key, i) => ({ id: `R${this.s.turn}c${i}`, key, type: E_CARDS[key].unit, strength: 100, vet: 1, hp: E_CARDS[key].hp || 1 })),
    };
    this.say(`🎲 Rogue toys squat ${E_NODES[node].name} — clear them out for a GUARANTEED card bounty!`);
  }
  // Mission-template library (§7): base template reskinned by the encounter's variant.
  // defBoost stays on the base (sim odds unchanged); label/gameMode/startRes/note vary.
  resolveTemplate(enc) {
    const base = E_TEMPLATES[enc.template];
    const variants = E_TEMPLATE_VARIANTS[enc.template];
    const v = variants && variants.length ? variants[(enc.variant || 0) % variants.length] : null;
    return v ? { ...base, ...v } : base;
  }
  // Readiness (§11): a tired army fights softer, down to `floor` at 0 readiness.
  readyMul(army) {
    if (!army || army.readiness == null) return 1; // garrisons (no army) fight at full
    const f = E_RULES.readiness.floor, r = Math.max(0, Math.min(E_RULES.readiness.max, army.readiness));
    return f + (1 - f) * (r / E_RULES.readiness.max);
  }
  tire(army, amt = E_RULES.readiness.cost) {
    if (!army || army.readiness == null) return;
    army.readiness = Math.max(0, army.readiness - amt);
  }
  preview(enc) {
    const { attCards, defCards } = this.encCards(enc);
    const t = this.resolveTemplate(enc);
    const defOwner = enc.defender.owner;
    const attArmy = this.s.armies.find((a) => a.id === enc.attacker.armyId);
    const defArmy = enc.defender.armyId ? this.s.armies.find((a) => a.id === enc.defender.armyId) : null;
    // Block Walls (+ Fortified Frontier doctrine) help whoever HOLDS the node
    const holdsNode = defOwner >= 0 && this.s.nodes[enc.nodeId].owner === defOwner;
    const wallMul = holdsNode ? 1 + this.moduleDefBonus(enc.nodeId) + (this.hasDoctrine(defOwner, 'fortified') ? 0.15 : 0) : 1;
    const attMul = this.ownerPowerMul(enc.attacker.owner) * this.readyMul(attArmy);
    const defMul = (t.defBoost || 1) * (E_NODES[enc.nodeId].tier ? 1 + 0.1 * E_NODES[enc.nodeId].tier : 1)
      * (defOwner >= 0 ? this.ownerPowerMul(defOwner) : 1) * wallMul * this.readyMul(defArmy);
    const ap = this.cardsPower(attCards) * attMul, dp = this.cardsPower(defCards) * defMul;
    const ratio = ap / Math.max(0.001, dp);
    const band = ratio > 2 ? 'Overwhelming' : ratio > 1.35 ? 'Favored' : ratio > 0.8 ? 'Even' : ratio > 0.55 ? 'Risky' : 'Desperate';
    const loss = ratio > 2 ? 'light' : ratio > 1.2 ? 'moderate' : 'heavy';
    return { band, ratio, attPower: ap, defPower: dp, lossHint: loss, template: t, defMul, attMul,
      attReady: attArmy ? attArmy.readiness : null, defReady: defArmy ? defArmy.readiness : null };
  }

  // deterministic seeded resolution — same source stats as played battles,
  // bounded variance (±8%), never rerolled: the seed locked at creation
  simulate(enc) {
    const { attCards, defCards } = this.encCards(enc);
    const rng = makeRng(enc.seed);
    const vary = () => 1 + (rng() * 2 - 1) * E_RULES.simVariance;
    const p = this.preview(enc);
    const attMul = p.attMul; // includes ownerPowerMul + attacker readiness (single source of truth)
    let att = attCards.map((c) => ({ ...c })), def = defCards.map((c) => ({ ...c }));
    for (let round = 0; round < 3; round++) {
      const ap = this.cardsPower(att) * attMul * vary();
      const dp = this.cardsPower(def) * p.defMul * vary();
      this.dealLosses(def, ap * 0.5, rng);
      this.dealLosses(att, dp * 0.5, rng);
      if (!att.length || !def.length) break;
    }
    const attackerWon = this.cardsPower(att) * attMul > this.cardsPower(def) * p.defMul;
    return {
      encId: enc.encId, mode: 'simulated', attackerWon,
      attCards: att, defCards: def,
    };
  }
  dealLosses(cards, damage, rng) {
    // spread damage across cards; a card at 0 strength is destroyed (§11)
    let dmg = damage * 9;
    while (dmg > 0 && cards.length) {
      const i = (rng() * cards.length) | 0;
      const bite = Math.min(cards[i].strength, 8 + ((rng() * 10) | 0));
      cards[i].strength -= bite;
      dmg -= bite;
      if (cards[i].strength <= 0) cards.splice(i, 1);
    }
  }

  // one shared application path for played AND simulated results (§11, §20);
  // idempotent by encId — a reload after application cannot double-apply
  applyBattleResult(enc, result) {
    if (enc.applied || result.encId !== enc.encId) return;
    // the Drill Yard has its own gentle rules — nothing is captured, nobody is tired
    if (enc.drill) { this.applyDrillResult(enc, result); this.save(); return; }
    enc.applied = true;
    // the campaign remembers how its wars were fought (victory-screen stats)
    if (enc.attacker.owner === 0 || enc.defender.owner === 0) {
      this.s.stats[result.mode === 'played' ? 'played' : 'simmed']++;
      const humanWon = result.attackerWon === (enc.attacker.owner === 0);
      this.s.stats[humanWon ? 'won' : 'lost']++;
      if (humanWon) this.awardLoot(enc); // spoils of war → a card + scraps
      // round 15: FIGHTING (not simming) battle-hardens a survivor
      if (humanWon && result.mode === 'played') {
        const mine = enc.attacker.owner === 0 ? result.attCards : result.defCards;
        const best = [...mine].sort((a, b) => b.strength - a.strength)[0];
        if (best && (best.vet || 0) < E_RULES.drill.vetCap) {
          best.vet = (best.vet || 0) + 1;
          const nm = E_CARDS[best.key] ? E_CARDS[best.key].name : best.type;
          this.say(`⭐ ${nm} comes home battle-hardened (+1 vet) — that's what FIGHTING it yourself earns.`);
        }
      }
    }
    const att = this.s.armies.find((a) => a.id === enc.attacker.armyId);
    const st = this.s.nodes[enc.nodeId];
    if (att) { att.cards = result.attCards.map((c) => ({ ...c })); this.tire(att); } // battles are tiring (§11)
    const rogueHere = this.s.rogue && this.s.rogue.node === enc.nodeId;
    if (enc.defender.armyId) {
      const def = this.s.armies.find((a) => a.id === enc.defender.armyId);
      if (def) { def.cards = result.defCards.map((c) => ({ ...c })); this.tire(def); }
    } else if (rogueHere) {
      this.s.rogue.cards = result.defCards.map((c) => ({ ...c }));
    } else if (st.garrison) {
      st.garrison = result.defCards.map((c) => ({ ...c }));
    }
    // the rogue gang breaks when beaten — and pays the human a bounty
    if (rogueHere && result.attackerWon) {
      this.s.rogue = null;
      if (enc.attacker.owner === 0) {
        this.coll.scraps += E_RULES.rogue.scraps;
        if (this.persist) saveCollection(this.coll);
        this.say(`🎲 The rogue gang scatters! Bounty claimed (+${E_RULES.rogue.scraps} scraps with the card).`);
      }
    }
    const node = E_NODES[enc.nodeId];
    if (result.attackerWon) {
      // defender army (if any survivors) falls back one route (§11 retreat)
      if (enc.defender.armyId) {
        const def = this.s.armies.find((a) => a.id === enc.defender.armyId);
        if (def && def.cards.length) {
          const back = routesOf(enc.nodeId).find((r) => {
            const o = this.s.nodes[r.to];
            return o.owner === def.owner || o.owner === -1;
          });
          if (back) { def.prev = def.node; def.node = back.to; this.say(`${this.facLabel(def.owner)}'s army falls back to ${E_NODES[back.to].name}.`); }
          else { def.cards = []; this.say(`${this.facLabel(def.owner)}'s army is trapped and scattered!`); }
        }
      }
      st.garrison = null;
      this.capture(enc.attacker.owner, enc.nodeId, true);
      this.say(`🏆 ${this.facLabel(enc.attacker.owner)} takes ${node.name}!`);
      // Aftermath Spoils (§17): storming a capital/stronghold/crown earns the human a reward pick
      if (enc.attacker.owner === 0 && this.lootQuality(enc.nodeId) === 2) {
        this.s.pendingSpoils = { node: enc.nodeId, armyId: enc.attacker.armyId };
      }
    } else {
      // repelled: attacker limps back where it came from
      if (att && att.cards.length) { att.node = att.prev; }
      else if (att) { this.say(`${this.facLabel(att.owner)}'s army is destroyed at ${node.name}.`); }
      this.say(`🛡️ ${node.name} holds against ${this.facLabel(enc.attacker.owner)}.`);
    }
    this.save();
  }

  // spoils of a battle the human won: a deterministic card + scraps. Tougher
  // nodes roll from a better pool. The DRAW is seeded (testable); the grant to
  // the meta collection is a persist side-effect (tests never write storage).
  lootQuality(nodeId) {
    if (this.s.rogue && this.s.rogue.node === nodeId) return 2; // bounty hunts pay premium
    const t = E_NODES[nodeId].type;
    if (t === 'capital' || t === 'crown' || t === 'stronghold') return 2;
    if (t === 'discovery' || t === 'mission') return 1;
    return 0;
  }
  awardLoot(enc) {
    const lrng = makeRng(((enc.seed ^ 0x51ce15) >>> 0) || 1);
    const key = rollLoot(lrng, this.lootQuality(enc.nodeId));
    const card = E_CARDS[key], rar = E_RARITY[card.rarity];
    let scraps = E_RULES.scrapDrop;
    if (E_NODES[enc.nodeId].type === 'discovery') scraps += E_RULES.chestScraps; // a real treasure chest
    if (this.hasDoctrine(0, 'scavenger')) scraps += 5; // Scavenger Economy (loot is the human's)
    let firstTime = false, dupScraps = 0;
    if (this.persist) {
      const g = grantCard(this.coll, key);
      firstTime = g.first; dupScraps = g.scraps;
      this.coll.scraps += scraps;
      saveCollection(this.coll);
    } else {
      firstTime = !this.coll.owned[key]; if (key && E_CARDS[key].rarity !== 'common') this.coll.owned[key] = 1;
    }
    this.s.stats.cards++;
    this.s.lastLoot = { key, first: firstTime, scraps: scraps + dupScraps };
    this.loot.push(this.s.lastLoot);
    this.say(`🎁 Spoils of ${E_NODES[enc.nodeId].name}: ${card.icon} <b>${card.name}</b> (${rar.name})${firstTime ? ' — NEW!' : ' — dupe → scraps'} · +${scraps + dupScraps}✨`);
  }

  capture(p, nodeId, wasBattle = false) {
    const st = this.s.nodes[nodeId];
    if (st.owner === p) return;
    st.owner = p;
    if (p === 0) this.s.stats.captured++;
    let loot = wasBattle ? E_RULES.captureBonusBase : 0;
    if (this.s.upgrades[p].includes('salvage')) loot += 15;
    const node = E_NODES[nodeId];
    if (node.bonus && !st.looted) { loot += node.bonus; st.looted = true; }
    if (this.hasDoctrine(p, 'scavenger')) loot = Math.round(loot * 1.4); // Scavenger Economy
    if (loot) this.s.parts[p] += loot;
    if (!wasBattle) this.say(`${node.icon} ${this.facLabel(p)} claims ${node.name}${loot ? ` (+${loot} Parts)` : ''}.`);
  }

  // Aftermath Spoils (§17): apply the human's reward pick from a capital/stronghold storm.
  // Deterministic (a player choice, no RNG); idempotent — clears pendingSpoils when done.
  resolveSpoils(choice) {
    const sp = this.s.pendingSpoils;
    if (!sp) return { ok: false };
    const node = E_NODES[sp.node], r = E_RULES.spoils;
    if (choice === 'parts') {
      this.s.parts[0] += r.parts;
      this.say(`🔩 The victors strip ${node.name} for parts — +${r.parts} Parts.`);
    } else if (choice === 'heal') {
      const army = this.s.armies.find((a) => a.id === sp.armyId);
      if (army) for (const c of army.cards) c.strength = r.heal;
      this.say(`❤️ The army regroups in ${node.name} — every toy back to full strength.`);
    } else { // momentum
      this.s.power[0] = Math.min(E_RULES.powerCap, this.s.power[0] + r.power);
      this.say(`⚡ ${node.name} falls — the advance seizes the moment, +${r.power} Power.`);
    }
    this.s.pendingSpoils = null;
    this.save();
    return { ok: true };
  }

  // encounters that involve no human seat resolve immediately by simulation
  autoResolveAiBattles() {
    for (const enc of this.s.encounters) {
      if (!enc.applied && enc.attacker.owner !== 0 && enc.defender.owner !== 0) {
        this.applyBattleResult(enc, this.simulate(enc));
      }
    }
    this.s.encounters = this.s.encounters.filter((e) => !e.applied);
  }
  nextEncounter() { return this.s.encounters.find((e) => !e.applied) || null; }
  finishEncounter(enc, result) {
    this.applyBattleResult(enc, result);
    this.s.encounters = this.s.encounters.filter((e) => !e.applied);
    if (!this.s.encounters.length) this.aftermath();
  }
  retreatEncounter(enc) {
    const att = this.s.armies.find((a) => a.id === enc.attacker.armyId);
    if (att) att.node = att.prev;
    enc.applied = true;
    this.say(`${this.facLabel(enc.attacker.owner)} thinks better of it and withdraws.`);
    this.s.encounters = this.s.encounters.filter((e) => !e.applied);
    if (!this.s.encounters.length) this.aftermath();
  }

  // §16 Crown Victory: hold the Storybook Tower's crown for crownNeed turns.
  // Tracked at the phase boundary so a mid-turn recapture resets the count.
  tickCrown() {
    const co = this.s.nodes[E_RULES.crownNode].owner;
    if (co !== -1 && co === this.s.crown.owner) this.s.crown.turns++;
    else this.s.crown = { owner: co, turns: co === -1 ? 0 : 1 };
    if (co !== -1 && this.s.crown.turns === E_RULES.crownNeed - 1) {
      const k = 'crownwarn' + co;
      if (!this.s.warned[k]) { this.s.warned[k] = true; this.say(`👑 ${this.facLabel(co)} will WIN with the crown next turn unless the Storybook Tower is taken!`); }
    }
  }
  // how many turns is a player from any victory, for the telegraph (§16)?
  turnsToWin(p) {
    let best = 99;
    if (this.ownedCount(p) >= E_RULES.dominionNeed - 1 && this.fortCount(p) >= E_RULES.dominionForts) best = Math.min(best, this.ownedCount(p) >= E_RULES.dominionNeed ? 0 : 1);
    if (this.s.crown.owner === p) best = Math.min(best, E_RULES.crownNeed - this.s.crown.turns);
    return best;
  }

  aftermath() {
    this.tickCrown();
    // capital falls (§16): the human's capital ends the war; a RIVAL's capital
    // eliminates that rival — their toys go back in the box, the war goes on
    for (const p of this.aliveSeats()) {
      if (this.s.nodes[this.capOf(p)].owner === p) continue;
      if ((this.s.humans || [0]).includes(p)) {
        const taker = this.s.nodes[this.capOf(p)].owner;
        this.finish(taker >= 0 ? taker : this.aliveSeats().find((q) => q !== p), 'capital');
        return;
      }
      this.s.eliminated.push(p);
      this.s.armies = this.s.armies.filter((a) => a.owner !== p);
      this.purgeDiplomacy(p); // no treaties with a corpse (see purgeDiplomacy)
      this.say(`📦 ${this.facLabel(p)} is ELIMINATED — their capital has fallen and their toys go back in the box.`);
    }
    // last flag standing wins outright
    if (this.aliveSeats().length === 1) { this.finish(this.aliveSeats()[0], 'capital'); return; }
    for (const p of this.aliveSeats()) {
      if (this.s.crown.owner === p && this.s.crown.turns >= E_RULES.crownNeed) { this.finish(p, 'crown'); return; }
      if (this.ownedCount(p) >= E_RULES.dominionNeed && this.fortCount(p) >= E_RULES.dominionForts) { this.finish(p, 'dominion'); return; }
    }
    if (this.s.turn >= E_RULES.turnCap) {
      // sunrise: most territories among the living; Parts break ties
      const alive = this.aliveSeats();
      alive.sort((x, y) => this.ownedCount(y) - this.ownedCount(x) || this.s.parts[y] - this.s.parts[x] || x - y);
      this.finish(alive[0], 'sunrise');
      return;
    }
    this.aiDiplomacy(); // the rivals read the board and pick their politics
    // telegraph any rival within victoryWarn turns of a win (once each)
    for (const rp of this.aliveSeats()) {
      if (rp === 0) continue;
      const rt = this.turnsToWin(rp);
      if (rt <= E_RULES.victoryWarn && rt > 0) {
        const k = 'winwarn' + rp + '_' + this.s.turn;
        if (!this.s.warned[k]) { this.s.warned[k] = true; this.say(`⏳ ${this.facLabel(rp)} is ${rt} turn${rt > 1 ? 's' : ''} from victory — disrupt them!`); }
      }
    }
    this.s.turn++;
    this.s.phase = 'plan';
    this.upkeep();
  }
  finish(winner, how) {
    this.s.over = true;
    this.s.winner = winner;
    this.s.phase = 'over';
    const why = {
      capital: 'the enemy capital has fallen',
      dominion: 'dominion of the bedroom is complete',
      crown: 'the Storybook Tower crown is held at last',
      sunrise: 'sunrise — the larger empire prevails',
    }[how];
    this.s.winHow = how;
    this.say(`🌅 ${this.facLabel(winner)} wins the Bedroom War — ${why}!`);
    this.save();
  }

  // the AI has no collection, but its recruits deepen as the night wears on so a
  // player fielding legendaries still meets resistance. Deterministic by turn+count.
  aiRecruitKey(p = 1) {
    // round 14: the rivals climb the rarity ladder with the night — by the
    // late turns they field the same rare and legendary toys the player does
    const t = this.s.turn, n = this.s.nextCard[p];
    // round 17: from late night the rivals recruit from YOUR collection too —
    // your own tricks, used against you (SP flavor; empty in headless tests)
    const yours = t >= E_RULES.aiCollectedFrom
      ? Object.keys(this.coll.owned || {}).filter((k) => E_CARDS[k] && E_CARDS[k].rarity !== 'common').sort()
      : [];
    const pool = yours.length && t >= E_RULES.aiCollectedFrom ? yours.concat(['sarge', 'knight'])
      : t >= 16 ? ['tank', 'knight', 'charger', 'sarge', 'teddy']
      : t >= 12 ? ['sarge', 'knight', 'teddy', 'grenadier']
        : t >= 7 ? ['grenadier', 'raider', 'flinger', 'archer']
          : ['recruit', 'archer', 'spear'];
    return pool[n % pool.length];
  }

  // ---------- strategic AI seat (§21: legal orders, same rules) ----------
  aiPlan(p = 1) {
    if (this.s.over || !this.isAlive(p)) return;
    const home = this.capOf(p);
    // claim the second doctrine slot once it opens (each rival turtles or
    // sharpens by temperament: seat 1 adds walls, seat 2 adds teeth)
    if (this.doctrineSlots(p) >= 2 && !this.s.doctrines[p][1]) this.setDoctrine(p, 1, p === 1 ? 'fortified' : 'warrior');
    // round 14: doctrines beyond the pick — a rival rereads the board midgame
    // and pays the swap cost to match it (losing → dig in; winning → press)
    if (this.s.turn >= 12 && this.s.power[p] >= E_RULES.doctrineSwapCost + 1) {
      const meN = this.ownedCount(p), leadN = Math.max(...this.aliveSeats().map((q) => this.ownedCount(q)));
      const want = meN <= leadN - 3 ? 'fortified' : meN >= leadN ? 'warrior' : null;
      if (want && !this.hasDoctrine(p, want)) this.setDoctrine(p, 0, want);
    }
    // strategic buys happen once per turn, not per army
    if (this.armiesOf(p).some((a) => a.node === home)) {
      const capArmy = this.armiesOf(p).find((a) => a.node === home);
      // recruit scales with the night so a card-stocked player still gets a fight
      while (this.s.parts[p] >= E_RULES.recruitCost + 20 && capArmy.cards.length < 6) this.recruit(p, capArmy.id, this.aiRecruitKey(p));
      // climb the empire tree in a fixed priority when it can afford a node
      for (const key of ['salvage', 'reserves', 'relay', 'workshop', 'combined']) {
        const u = E_UPGRADES[key];
        if (this.s.upgrades[p].includes(key)) continue;
        if (u.prereq && !this.s.upgrades[p].includes(u.prereq)) continue;
        if (this.s.parts[p] >= u.parts + 40 && this.s.imag[p] >= u.imag) { this.buyUpgrade(p, key); break; }
      }
    }
    // develop the realm: forts get walls/workshops/power; every little
    // province earns a Scrap Mill once the treasury can spare it (round 16)
    for (const [id, st] of Object.entries(this.s.nodes)) {
      if (st.owner !== p || this.moduleSlots(id) === 0) continue;
      const wish = this.moduleSlots(id) >= 2 ? ['walls', 'workshop', 'generator'] : ['mill'];
      const buffer = this.moduleSlots(id) >= 2 ? 25 : 10; // a mill pays for itself — build it sooner
      for (const mk of wish) {
        if (this.hasModule(id, mk) || st.modules.length >= this.moduleSlots(id)) continue;
        if (this.s.parts[p] >= E_MODULES[mk].parts + buffer && this.s.imag[p] >= (E_MODULES[mk].imag || 0)) { this.buildModule(p, id, mk); break; }
      }
    }
    // muster a second front once the empire can feed it
    if (this.armiesOf(p).length < E_RULES.maxArmies && this.ownedCount(p) >= E_RULES.musterMinNodes
        && this.s.parts[p] >= E_RULES.musterCost + 60) this.muster(p);
    // anyone one turn from crowning — this rival drops everything to contest it
    const crownRush = this.s.crown.owner !== p && this.s.crown.owner !== -1
      && this.s.crown.turns >= E_RULES.crownNeed - 2
      && this.s.nodes[E_RULES.crownNode].owner !== p
      && !this.atPeace(p, this.s.crown.owner);
    const claimed = new Set(); // two armies never chase the same prize
    let firstTarget = null;
    for (const a of this.armiesOf(p)) {
      // recover: hurt or thin army heads home to heal + recruit
      const avgStr = a.cards.reduce((s, c) => s + c.strength, 0) / a.cards.length;
      if ((a.cards.length <= 2 || avgStr < 45) && a.node !== home && !crownRush) { this.aiMoveToward(a, home); continue; }
      if (crownRush && !claimed.has(E_RULES.crownNode)) { claimed.add(E_RULES.crownNode); firstTarget = firstTarget || E_RULES.crownNode; this.aiMoveToward(a, E_RULES.crownNode); continue; }
      // defend: any hostile army adjacent to home pulls one army back
      const threat = this.s.armies.some((h) => h.owner !== p && h.cards.length
        && !this.atPeace(p, h.owner) && routesOf(home).some((r) => r.to === h.node));
      if (threat && a.node !== home && !claimed.has(home)) { claimed.add(home); this.aiMoveToward(a, home); continue; }
      // expand/attack: nearest valuable node, Favored+ fights only
      const target = this.aiPickTarget(a, claimed, p);
      if (target) { claimed.add(target); firstTarget = firstTarget || target; this.aiMoveToward(a, target); }
    }
    if (p === 1) this.s.aiIntent = firstTarget; // Master Plan surfaces seat 1's plan
  }
  aiPickTarget(a, claimed = new Set(), p = 1) {
    const scores = [];
    for (const [id, st] of Object.entries(this.s.nodes)) {
      if (st.owner === p || claimed.has(id)) continue;
      if (st.owner >= 0 && this.atPeace(p, st.owner)) continue; // pacts hold
      const holder = this.armyAt(id);
      if (holder && holder.owner !== p && this.atPeace(p, holder.owner)) continue;
      const n = E_NODES[id];
      let v = n.yield + (n.type === 'stronghold' ? 8 : 0) + (n.dominion ? 6 : 0) + (n.bonus ? 5 : 0)
        + (n.type === 'crown' ? 10 : 0) + (n.imagYield || 0) * 2;
      // a posted bounty (round 17) makes the hired rival covet the target's land
      if (this.s.bounty && this.s.bounty.hunter === p && st.owner === this.s.bounty.target) v += 6;
      const dist = this.hopDistance(a.node, id);
      if (dist === null) continue;
      scores.push({ id, score: v - dist * 2 });
    }
    scores.sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1)); // deterministic
    for (const c of scores) {
      const st = this.s.nodes[c.id];
      const rogueHere = this.s.rogue && this.s.rogue.node === c.id;
      const defended = (st.owner >= 0 && st.owner !== p) || this.armyAt(c.id) || rogueHere || E_GARRISONS[E_NODES[c.id].type];
      if (!defended) return c.id;
      // fake an encounter to read the preview band before committing
      const hostile = this.armyAt(c.id) && this.armyAt(c.id).owner !== p ? this.armyAt(c.id) : null;
      const defCards = hostile ? hostile.cards
        : rogueHere ? this.s.rogue.cards
          : (this.s.nodes[c.id].garrison || (E_GARRISONS[E_NODES[c.id].type] || []).map((g) => ({ type: g.type, strength: 100, vet: 0 })));
      const tKey = E_NODE_TEMPLATE_OVERRIDE[c.id] || E_NODE_TEMPLATE[E_NODES[c.id].type] || 'field';
      const defMul = (E_TEMPLATES[tKey].defBoost || 1) * (E_NODES[c.id].tier ? 1 + 0.1 * E_NODES[c.id].tier : 1);
      // factor the army's readiness so the AI doesn't hurl a spent army into a defended node
      const ratio = this.cardsPower(a.cards) * this.readyMul(a) / Math.max(0.001, this.cardsPower(defCards) * defMul);
      // a betrayed rival fights the betrayer bolder while the grudge burns (§15)
      const defOwner = hostile ? hostile.owner : st.owner;
      let band = this.diff().aiBand - (defOwner >= 0 && this.grudgeVs(p, defOwner) ? E_RULES.pact.grudgeBand : 0);
      if (this.s.bounty && this.s.bounty.hunter === p && defOwner === this.s.bounty.target) band -= E_RULES.diplomacy.bounty.band; // paid to be bold
      if (ratio > band) return c.id; // §13: bolder rivals attack at a lower edge
    }
    return null;
  }
  hopDistance(from, to) {
    if (from === to) return 0;
    const seen = new Set([from]);
    let frontier = [from], d = 0;
    while (frontier.length && d < 12) {
      d++;
      const next = [];
      for (const f of frontier) for (const r of routesOf(f)) {
        if (seen.has(r.to)) continue;
        if (r.to === to) return d;
        seen.add(r.to); next.push(r.to);
      }
      frontier = next;
    }
    return null;
  }
  aiMoveToward(a, targetId) {
    if (a.node === targetId) return;
    const options = this.reachable(a);
    let best = null, bestD = Infinity;
    for (const r of options) {
      const d = this.hopDistance(r.to, targetId);
      if (d !== null && d < bestD) { bestD = d; best = r; }
    }
    if (best) a.order = { to: best.to, cost: best.cost };
  }

  // ---------- BattleContext for the RTS bridge (played battles) ----------
  buildBattleContext(enc) {
    const { attCards, defCards } = this.encCards(enc);
    const t = this.resolveTemplate(enc);
    const humanIsAttacker = enc.attacker.owner === 0;
    return {
      encId: enc.encId, seed: enc.seed, nodeId: enc.nodeId,
      map: E_NODES[enc.nodeId].biome, gameMode: t.gameMode, startRes: t.startRes,
      difficulty: this.diff().rts, // §13: played battles inherit the campaign challenge tier
      humanIsAttacker,
      humanFaction: this.facKey(0),
      // the OTHER side of this battle picks the RTS rival faction (round 14)
      aiFaction: this.facKey(Math.max(humanIsAttacker
        ? (enc.defender.owner >= 0 ? enc.defender.owner : 1)
        : enc.attacker.owner, 1)),
      // Combined Arms (Warfare II) deploys tougher toys in PLAYED battles too
      attMul: this.ownerPowerMul(enc.attacker.owner),
      defMul: enc.defender.owner >= 0 ? this.ownerPowerMul(enc.defender.owner) : 1,
      // roster cards spawn as tagged units on each side (survivors return);
      // hp carries the card's durability mod so a collection card fights the same
      attSpawns: attCards.map((c) => ({ cardId: c.id, key: c.key, type: c.type, strength: c.strength, vet: c.vet, hp: c.hp || 1 })),
      defSpawns: defCards.map((c) => ({ cardId: c.id, key: c.key, type: c.type, strength: c.strength, vet: c.vet, hp: c.hp || 1 })),
      nodeName: E_NODES[enc.nodeId].name,
    };
  }
  // mark the pending played battle, then persist — the RTS page reload eats
  // the DOM but the encounter survives in the save (architecture note §1)
  beginPlayedBattle(enc) {
    this.s.pendingPlay = { encId: enc.encId, ctx: this.buildBattleContext(enc) };
    this.s.returnToMap = true;
    this.save();
    return this.s.pendingPlay.ctx;
  }
  // called from main.js at gameOver with the surviving tagged units
  static applyPlayedResult(win, survivors) {
    const save = Empire.stored();
    if (!save || !save.pendingPlay) return false;
    const emp = new Empire(save);
    const enc = emp.s.encounters.find((e) => e.encId === save.pendingPlay.encId);
    if (!enc || enc.applied) { emp.s.pendingPlay = null; emp.save(); return false; }
    const ctx = save.pendingPlay.ctx;
    const attackerWon = (win === ctx.humanIsAttacker);
    const collect = (spawns) => spawns
      .map((sp) => { const sv = survivors[sp.cardId]; return sv ? { id: sp.cardId, key: sp.key, type: sp.type, strength: sv.strength, vet: sp.vet, hp: sp.hp || 1 } : null; })
      .filter(Boolean);
    emp.applyBattleResult(enc, {
      encId: enc.encId, mode: 'played', attackerWon,
      attCards: collect(ctx.attSpawns), defCards: collect(ctx.defSpawns),
    });
    emp.s.pendingPlay = null;
    emp.s.encounters = emp.s.encounters.filter((e) => !e.applied);
    if (!emp.s.encounters.length && !emp.s.over) emp.aftermath();
    emp.save();
    return true;
  }
}

// ---------------------------------------------------------------- EmpireUI
// The board screen. Reads Empire state; every action routes through the sim.
let ui = null;
let hooks = { startGame: null, showMenuScreen: null, sfx: null };
export function setEmpireHooks(h) { hooks = { ...hooks, ...h }; }
function esfx(name, throttle) { try { hooks.sfx && hooks.sfx.play(name, throttle); } catch (e) { /* no audio */ } }
export function empireBattleContext() { return ui && ui.launchCtx ? ui.launchCtx : null; }
export function empireShouldAutoOpen() {
  const s = Empire.stored();
  return !!(s && s.returnToMap && !s.over);
}

export function openEmpire(forceNew = false) {
  const saved = !forceNew && Empire.stored();
  const emp = saved ? new Empire(saved) : new Empire();
  if (saved && saved.pendingPlay) {
    // battle was launched but never finished (closed mid-match): void it safely
    emp.s.pendingPlay = null;
    emp.save();
  }
  emp.s.returnToMap = false;
  emp.save();
  ui = new EmpireUI(emp);
  ui.show();
  return ui;
}

class EmpireUI {
  get ME() { return this.mySeat || 0; } // phase 3: which seat this client plays
  // every state-mutating click funnels through here: SP applies directly;
  // in MP the host stamps + echoes and the guest waits for the echo
  issue(cmd, sfxOk = 'place') {
    cmd.seat = this.ME;
    if (!this.net) {
      const r = applyEmpireCmd(this.emp, cmd);
      esfx(r && r.ok === false ? 'error' : sfxOk, 100);
      this.render();
      return r;
    }
    this.net.sendCmd(cmd);
    esfx(sfxOk, 80);
    return { ok: true };
  }
  constructor(emp) {
    this.emp = emp;
    this.sel = null;     // selected army id
    this.selNode = null; // inspected node id (side-panel intel card)
    this.launchCtx = null;
    this.lastPos = {};   // armyId -> {x,y} for march animations
    this.root = document.getElementById('empire');
    // accessibility (§18): honour the OS "reduce motion" preference
    this.reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.onKey = (e) => this.handleKey(e);
  }
  show() {
    this.root.classList.add('show');
    this.render();
    document.addEventListener('keydown', this.onKey);
    const enc = this.emp.nextEncounter();
    if (enc) this.showEncounter(enc); // resume mid battle-window after a reload
    else if (this.emp.s.pendingSpoils) this.showSpoils(); // resume an unclaimed spoils pick (e.g. after a played battle)
    else if (!this.emp.s.difficultyChosen) this.showDifficulty(); // fresh war → pick a challenge tier first
    else if (!localStorage.getItem('tt-empire-seen')) { localStorage.setItem('tt-empire-seen', '1'); this.showGuide(); }
  }
  // §13: choose the campaign challenge tier at the start of a new war (then coach on first run)
  showDifficulty() {
    const emp = this.emp;
    const m = this.root.querySelector('#e-modal');
    const btn = (k) => { const d = E_DIFFICULTY[k]; return `<button class="diff-btn" data-diff="${k}" style="text-align:left">
      <span style="font-size:18px">${d.icon}</span> <b>${d.label}</b><span class="e-dim" style="display:block;font-weight:400;margin-top:2px">${d.desc}</span></button>`; };
    m.innerHTML = `<div class="e-enc"><div class="e-enc-card">
      <div class="e-ttl">🌙 Choose your challenge</div>
      <div class="e-dim">How fierce is the rival across the bedroom floor? (Sets their economy, aggression &amp; battle skill.)</div>
      <div class="e-enc-btns" style="flex-direction:column;align-items:stretch;gap:8px">
        ${Object.keys(E_DIFFICULTY).map(btn).join('')}
      </div></div></div>`;
    for (const b of m.querySelectorAll('[data-diff]')) b.addEventListener('click', () => {
      emp.setDifficulty(b.dataset.diff); esfx('select', 60); this.render();
      if (!localStorage.getItem('tt-empire-seen')) { localStorage.setItem('tt-empire-seen', '1'); this.showGuide(); }
    });
  }
  hide() { this.root.classList.remove('show'); document.removeEventListener('keydown', this.onKey); ui = null; }

  // keyboard: Space/Enter = end turn · Esc = close/deselect/leave · C/T/? shortcuts.
  // A battle-decision modal is deliberately NOT dismissable — it needs a choice.
  handleKey(e) {
    if (!this.root.classList.contains('show')) return;
    const m = this.root.querySelector('#e-modal');
    const battleModal = m && (m.querySelector('#e-sim') || m.querySelector('#sp-parts') || m.querySelector('[data-diff]')); // encounter/spoils/difficulty awaiting a decision
    const infoModal = m && (m.querySelector('#e-tclose, #e-colclose, #e-rclose, #e-gclose, #e-dclose, #e-pclose, #e-drillclose') || m.querySelector('.e-loot'));
    if (e.key === 'Escape') {
      if (battleModal) return; // must choose Play / Simulate / Withdraw (or claim spoils)
      if (infoModal) { m.innerHTML = ''; e.preventDefault(); return; }
      if (this.sel || this.selNode) { this.sel = null; this.selNode = null; this.render(); e.preventDefault(); return; }
      this.hide(); return;
    }
    if (battleModal || infoModal || this.emp.s.over) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); const b = this.root.querySelector('#e-end'); if (b && !b.disabled) b.click(); }
    else if (e.key === 'c' || e.key === 'C') { esfx('select', 60); this.showCollection(); }
    else if (e.key === 't' || e.key === 'T') { esfx('select', 60); this.showTree(); }
    else if (e.key === 'd' || e.key === 'D') { esfx('select', 60); this.showDoctrines(); }
    else if ((e.key === 'p' || e.key === 'P') && this.emp.seatCount() > 2) { esfx('select', 60); this.showDiplomacy(); }
    else if (e.key === '?' || e.key === '/') { this.showGuide(); }
  }

  // ---- phase 3: the multiplayer lobby + lifecycle ----
  showMpLobby() {
    const m = this.root.querySelector('#e-modal');
    m.innerHTML = `<div class="e-enc"><div class="e-enc-card e-guide-card">
      <h3>🌐 The Bedroom War — vs a Friend</h3>
      <div class="e-dim">Two commanders, one board, and the Tin Battalion scheming in the south.
      Every battle resolves by the war table (no RTS side-battles in multiplayer — yet).</div>
      <button id="e-mphost" class="diff-btn sel">🏠 Host — get a room code</button>
      <div style="margin:6px 0"><input id="e-mpcode" maxlength="4" placeholder="CODE" style="width:70px;text-transform:uppercase">
      <button id="e-mpjoin" class="diff-btn">🚪 Join a friend's war</button></div>
      <div id="e-mpstatus" class="e-dim"></div>
      <button id="e-mpcancel" class="diff-btn">Close</button>
    </div></div>`;
    const status = (t) => { const el = m.querySelector('#e-mpstatus'); if (el) el.innerHTML = t; };
    m.querySelector('#e-mpcancel').addEventListener('click', () => { if (this.pendingNet) { this.pendingNet.close(); this.pendingNet = null; } m.innerHTML = ''; });
    m.querySelector('#e-mphost').addEventListener('click', async () => {
      try {
        const net = this.pendingNet = new EmpireNet();
        status('Opening a room…');
        const { code } = await net.host((kind) => {
          if (kind === 'join') {
            status('A challenger arrives! Starting…');
            const seed = (Math.random() * 2 ** 31) | 0;
            net.startMatch(seed);
          }
        });
        net.onStart = ({ seed }) => { m.innerHTML = ''; this.beginMp(net, 0, seed); };
        status(`Room open — tell your friend the code: <b style="font-size:1.4em">${code}</b>`);
      } catch (e) { status('⚠ ' + (e.message || e)); }
    });
    m.querySelector('#e-mpjoin').addEventListener('click', async () => {
      const code = (m.querySelector('#e-mpcode').value || '').trim();
      if (code.length !== 4) { status('Enter the 4-letter room code.'); return; }
      try {
        const net = this.pendingNet = new EmpireNet();
        status('Knocking on the door…');
        net.onStart = ({ seed }) => { m.innerHTML = ''; this.beginMp(net, 1, seed); };
        await net.join(code, () => {});
        status('Seated! Waiting for the host to deal the seed…');
      } catch (e) { status('⚠ ' + (e.message || e)); }
    });
  }
  beginMp(net, seat, seed) {
    this.pendingNet = null;
    this.net = net;
    this.mySeat = seat;
    this.mpWaiting = false;
    this.emp = new Empire(seed, ['bricks', 'classic', 'bots'], false); // never touches the SP save
    this.emp.s.humans = [0, 1];
    this.emp.s.difficultyChosen = true; // MP plays Lights-Out rules
    this.sel = null; this.selNode = null; this.lastPos = {};
    net.onCmd = (cmd) => { applyEmpireCmd(this.emp, cmd); this.render(); };
    net.onAdvance = () => {
      this.emp.endTurn();
      this.mpWaiting = false;
      net.reportHash(this.emp.s.turn, this.emp.stateHash());
      this.render();
    };
    net.onPeerReady = () => { /* could badge the rival's readiness */ };
    net.onDrop = () => this.leaveMp('Your rival left the war — the toys stand down.');
    net.onDesync = () => this.leaveMp('⚠ The two boards disagreed (desync) — the war is abandoned.');
    this.render();
  }
  leaveMp(msg) {
    if (this.net) { this.net.close(); this.net = null; }
    this.mySeat = 0; this.mpWaiting = false;
    const saved = Empire.stored();
    this.emp = saved ? new Empire(saved) : new Empire();
    this.sel = null; this.selNode = null; this.lastPos = {};
    this.emp.say(msg);
    this.render();
  }

  // Drill Yard (round 15): pick which toy steps into the sparring ring
  showDrill() {
    const m = this.root.querySelector('#e-modal');
    const emp = this.emp;
    const a = emp.s.armies.find((x) => x.id === this.sel && x.owner === this.ME);
    if (!a) return;
    const rows = a.cards.map((c) => {
      const card = E_CARDS[c.key] || { name: c.type, icon: '', rarity: 'common' };
      const maxed = (c.vet || 0) >= E_RULES.drill.vetCap;
      return `<button class="diff-btn" data-drill="${c.id}" ${maxed ? 'disabled' : ''}>
        ${card.icon} ${card.name} ${'★'.repeat(c.vet || 0)} <span class="e-dim">${maxed ? 'fully drilled' : `${c.strength}%`}</span>
      </button>`;
    }).join('');
    m.innerHTML = `<div class="e-enc"><div class="e-enc-card e-guide-card">
      <h3>🎯 The Drill Yard</h3>
      <div class="e-dim">Pick a toy to spar (−${E_RULES.drill.cost}🔩). Strength always restores.
      <b>Play the bout yourself and win → +1 veterancy.</b> Simulating earns no pips — the yard rewards showing up.</div>
      ${rows}
      <button id="e-drillclose" class="diff-btn sel">Close</button>
    </div></div>`;
    m.querySelector('#e-drillclose').addEventListener('click', () => { m.innerHTML = ''; });
    for (const b of m.querySelectorAll('[data-drill]')) b.addEventListener('click', () => {
      const r = this.issue({ type: 'drill', army: this.sel, card: b.dataset.drill }) || { ok: true };
      m.innerHTML = '';
      this.render(); // the encounter card appears with Play / Simulate
    });
  }

  // §15 diplomacy (round 14): pacts with the rivals, and their pact with each other
  showDiplomacy() {
    const m = this.root.querySelector('#e-modal');
    const emp = this.emp, s = emp.s;
    const rivals = emp.aliveSeats().filter((p) => p !== this.ME);
    const rows = rivals.map((p) => {
      const pact = emp.atPeace(0, p);
      const r = emp.pactBetween(0, p);
      const grudge = emp.grudgeVs(p, 0);
      const D = E_RULES.diplomacy;
      const trade = (emp.s.trades || {})[p];
      const pass = emp.hasPassage(0, p);
      return `<div class="e-guiderow">
        <span class="e-guideic" style="color:${emp.facColor(p)}">${pact ? '🕊️' : grudge ? '💢' : '⚔️'}</span>
        <span><b style="color:${emp.facColor(p)}">${emp.facLabel(p)}</b> — ${pact ? `pact, <b>${r.left}</b> turn${r.left > 1 ? 's' : ''} left` : grudge ? 'at war, and they remember your betrayal' : 'at war'}
        ${trade ? ` · ⇄ trading (${trade.left}t)` : ''}${pass ? ` · 🛂 passage (${emp.s.passages['0>' + p].left}t)` : ''}<br>
        ${pact
    ? `<button class="diff-btn" data-break="${p}">💔 Break pact (−${E_RULES.pact.breakPower}⚡ −${E_RULES.pact.breakImag}💡)</button>
       ${!pass ? `<button class="diff-btn" data-passage="${p}" ${s.parts[this.ME] >= D.passage.cost ? '' : 'disabled'}>🛂 Buy Passage (${D.passage.cost}🔩, ${D.passage.turns}t)</button>` : ''}`
    : `<button class="diff-btn" data-offer="${p}">🕊️ Offer Pact (${E_RULES.pact.turns}t)</button>
       <button class="diff-btn" data-cease="${p}" ${s.imag[this.ME] >= D.ceasefire.imag ? '' : 'disabled'}>🏳️ Ceasefire (${D.ceasefire.imag}💡, ${D.ceasefire.turns}t)</button>`}
        ${!trade && !grudge ? `<button class="diff-btn" data-tradep="${p}" ${s.parts[this.ME] >= D.trade.give ? '' : 'disabled'}>⇄ Trade for ⚡ (${D.trade.give}🔩/t)</button>
          <button class="diff-btn" data-tradei="${p}" ${s.parts[this.ME] >= D.trade.give ? '' : 'disabled'}>⇄ Trade for 💡 (${D.trade.give}🔩/t)</button>` : ''}
        ${!emp.s.bounty && emp.aliveSeats().filter((q) => q > 0).length >= 2 ? `<button class="diff-btn" data-bounty="${p}" ${s.parts[this.ME] >= D.bounty.cost ? '' : 'disabled'}>🎯 Post Bounty ON them (${D.bounty.cost}🔩)</button>` : ''}
        </span></div>`;
    }).join('');
    const aiPact = rivals.length >= 2 && emp.atPeace(rivals[0], rivals[1]);
    m.innerHTML = `<div class="e-enc"><div class="e-enc-card e-guide-card">
      <h3>🕊️ Diplomacy — the floor's politics</h3>
      ${rows}
      ${rivals.length >= 2 ? `<div class="e-guiderow"><span class="e-guideic">${aiPact ? '🤝' : '⚔️'}</span><span class="e-dim">${emp.facLabel(rivals[0])} and ${emp.facLabel(rivals[1])} are ${aiPact ? `allied against you (${emp.pactBetween(rivals[0], rivals[1]).left} turns)` : 'at each other\'s throats'}.</span></div>` : ''}
      <div class="e-dim" style="margin-top:8px">Pacts forbid marching into each other's territory. They expire on their own; breaking one early costs Power, Imagination, and trust. Rivals gang up when you lead the night.</div>
      <button id="e-pclose" class="diff-btn sel">Close</button>
    </div></div>`;
    m.querySelector('#e-pclose').addEventListener('click', () => { m.innerHTML = ''; });
    for (const b of m.querySelectorAll('[data-offer]')) b.addEventListener('click', () => {
      esfx('select', 60);
      this.issue({ type: 'pact', other: Number(b.dataset.offer) });
      this.render(); this.showDiplomacy();
    });
    for (const b of m.querySelectorAll('[data-break]')) b.addEventListener('click', () => {
      esfx('select', 60);
      this.issue({ type: 'breakpact', other: Number(b.dataset.break) });
      this.render(); this.showDiplomacy();
    });
    const verb = (sel, fn) => { for (const b of m.querySelectorAll(sel)) b.addEventListener('click', () => { esfx('select', 60); fn(b); this.render(); this.showDiplomacy(); }); };
    verb('[data-tradep]', (b) => this.issue({ type: 'trade', other: Number(b.dataset.tradep), mode: 'power' }));
    verb('[data-tradei]', (b) => this.issue({ type: 'trade', other: Number(b.dataset.tradei), mode: 'imag' }));
    verb('[data-passage]', (b) => this.issue({ type: 'passage', other: Number(b.dataset.passage) }));
    verb('[data-cease]', (b) => this.issue({ type: 'cease', other: Number(b.dataset.cease) }));
    verb('[data-bounty]', (b) => this.issue({ type: 'bounty', other: Number(b.dataset.bounty) }));
  }

  // first-run coach + reopenable help (bible §18)
  showGuide() {
    const m = this.root.querySelector('#e-modal');
    const row = (ic, t) => `<div class="e-guiderow"><span class="e-guideic">${ic}</span><span>${t}</span></div>`;
    m.innerHTML = `<div class="e-enc"><div class="e-enc-card e-guide-card">
      <div class="e-ttl">📖 How to Rule the Bedroom</div>
      ${row('🎯', `WIN by holding <b>${E_RULES.dominionNeed}</b> territories (one a stronghold), OR seizing the Storybook Tower crown for <b>${E_RULES.crownNeed}</b> turns, OR storming the enemy capital — before sunrise on turn ${E_RULES.turnCap}.`)}
      ${row('🚩', 'MOVE: click your <b>blue</b> army, then a <b>glowing</b> node. Roads cost 1 move, rough paths 2.')}
      ${row('⚔️', 'FIGHT: marching onto a defended node starts a battle. <b>Play</b> it yourself in the toy box, or <b>Simulate</b> from the same odds — survivors carry their wounds back.')}
      ${row('🔩', 'GROW: capture nodes for Parts. Recruit cards, build 🌳 tree upgrades (💡 Imagination), and 🧱 stronghold modules.')}
      ${row('📇', 'COLLECT: win battles for troop cards that persist across every campaign — field your best from the recruit picker.')}
      ${row('🌪️', 'BEWARE: the vacuum closes roads, and land cut off from your capital yields half.')}
      ${row('🎗️', 'IDENTITY: commit to a <b>Doctrine</b> — a focused campaign edge like Scavenger Economy or Lightning Campaign — with a second slot opening midgame.')}
      <div class="e-dim" style="margin-top:8px">⌨️ <b>Space</b> ends your turn · <b>Esc</b> closes · <b>C</b> cards · <b>T</b> tree · <b>D</b> doctrines · <b>?</b> guide.</div>
      <div class="e-enc-btns"><button id="e-gclose" class="diff-btn sel">Let's play</button></div>
    </div></div>`;
    m.querySelector('#e-gclose').addEventListener('click', () => { m.innerHTML = ''; });
  }

  armyPos(a) {
    const n = E_NODES[a.node];
    const dx = [-30, 30, 0][a.owner] ?? 30; // three flags share a node edge
    const dy = a.id.startsWith('B') ? 26 : -26; // second armies ride below the node
    return { x: n.mx + dx, y: n.my + dy };
  }

  render() {
    const emp = this.emp, s = emp.s;
    const nodePos = (id) => E_NODES[id];
    const supplied = emp.suppliedSet(this.ME);
    const ev = s.event;
    const evDef = ev ? E_EVENTS[ev.kind] : null;
    const evHasRoute = ev && evDef.closesRoute && ev.route !== undefined;
    const routeSvg = E_ROUTES.map(([a, b, kind], i) => {
      const A = nodePos(a), B = nodePos(b);
      const evc = evHasRoute && ev.route === i ? (ev.phase === 'active' ? ' blocked' : ' warned') : '';
      let extra = '';
      if (evHasRoute && ev.route === i) {
        extra = `<text x="${(A.mx + B.mx) / 2}" y="${(A.my + B.my) / 2 - 6}" text-anchor="middle" class="e-ev-ic">${ev.phase === 'active' ? evDef.icon : '⚠️'}</text>`;
      }
      return `<line x1="${A.mx}" y1="${A.my}" x2="${B.mx}" y2="${B.my}" class="e-route ${kind}${evc}"/>${extra}`;
    }).join('');
    const orderSvg = s.armies.filter((a) => a.order).map((a) => {
      const A = nodePos(a.node), B = nodePos(a.order.to);
      return `<line x1="${A.mx}" y1="${A.my}" x2="${B.mx}" y2="${B.my}" class="e-order" marker-end="url(#e-arrow)"/>`;
    }).join('');
    const selArmy = s.armies.find((a) => a.id === this.sel);
    const reach = selArmy && s.phase === 'plan' ? emp.reachable(selArmy).map((r) => r.to) : [];
    const knowsAiTarget = (s.upgrades[this.ME].includes('masterplan') || emp.hasDoctrine(this.ME, 'spymaster')) && s.aiIntent;
    const nodeSvg = Object.entries(E_NODES).map(([id, n]) => {
      const st = s.nodes[id];
      const ring = st.owner === -1 ? '#7a6a52' : emp.facColor(st.owner);
      const hot = reach.includes(id) ? ' hot' : '';
      const insp = this.selNode === id ? ' insp' : '';
      const unsup = st.owner === this.ME && !supplied.has(id);
      const crownProg = n.type === 'crown' && s.crown.owner !== -1 && s.crown.turns > 0
        ? `<text y="-32" text-anchor="middle" class="e-crownmark" style="fill:${emp.facColor(s.crown.owner)}">👑${s.crown.turns}/${E_RULES.crownNeed}</text>`
        : (n.type === 'crown' ? '<text y="-32" text-anchor="middle" class="e-crownmark">👑</text>' : '');
      const aimark = knowsAiTarget && s.aiIntent === id ? '<text x="-20" y="-18" class="e-supwarn">🎯</text>' : '';
      const mods = (st.modules || []).length ? `<text x="22" y="24" class="e-modmark">${(st.modules || []).map((k) => E_MODULES[k].icon).join('')}</text>` : '';
      const flood = emp.floodedNode() === id ? '<text x="-22" y="24" class="e-modmark">🥤</text>' : '';
      const rogue = s.rogue && s.rogue.node === id ? `<text x="0" y="-38" text-anchor="middle" class="e-crownmark">🎲${s.rogue.left}</text>` : '';
      const tip = `${n.name} — ${st.owner === -1 ? 'Unclaimed' : emp.facLabel(st.owner)}${n.yield ? ` · ${n.yield}🔩/turn` : ''}`;
      return `<g class="e-node${hot}${insp}" data-node="${id}" transform="translate(${n.mx},${n.my})">
        <title>${tip}</title>
        ${st.owner !== -1 ? `<circle r="38" class="e-node-halo" style="fill:${emp.facColor(st.owner)}22"/>` : ''}
        <circle r="26" class="e-node-c${unsup ? ' unsup' : ''}" style="stroke:${ring}"/>
        <text y="7" text-anchor="middle" class="e-node-ic">${n.icon}</text>
        <text y="44" text-anchor="middle" class="e-node-lb">${n.name}</text>
        ${crownProg}${aimark}${mods}${flood}${rogue}
        ${unsup ? '<text x="20" y="-18" class="e-supwarn">✂️</text>' : ''}
      </g>`;
    }).join('');
    const armySvg = s.armies.filter((a) => a.cards.length).map((a) => {
      const p = this.armyPos(a);
      const selC = a.id === this.sel ? ' sel' : '';
      const str = Math.round(a.cards.reduce((t, c) => t + c.strength, 0) / a.cards.length);
      const rd = a.readiness == null ? 100 : a.readiness; // readiness bar + tired badge (§11)
      const tired = rd < E_RULES.readiness.lowAt;
      return `<g class="e-army${selC}" data-army="${a.id}" transform="translate(${p.x},${p.y})">
        <title>Strength ${str}% · Readiness ${Math.round(rd)}%${tired ? ' — tired' : ''}</title>
        <circle r="13" style="fill:${emp.facColor(a.owner)}"/>
        <text y="4" text-anchor="middle" class="e-army-n">${a.cards.length}</text>
        <rect x="-11" y="15" width="22" height="3" rx="1.5" class="e-army-hpbg"/>
        <rect x="-11" y="15" width="${(22 * str / 100).toFixed(1)}" height="3" rx="1.5" class="e-army-hp"/>
        <rect x="-11" y="19" width="22" height="2.4" rx="1.2" class="e-army-hpbg"/>
        <rect x="-11" y="19" width="${(22 * rd / 100).toFixed(1)}" height="2.4" rx="1.2" class="e-army-rd${tired ? ' low' : ''}"/>
        ${tired ? '<text x="11" y="-9" text-anchor="middle" class="e-army-tired">💤</text>' : ''}
      </g>`;
    }).join('');

    const owned0 = s.upgrades[this.ME].length;
    const logHtml = s.log.slice(-7).reverse().map((l) => `<div><b>T${l.t}</b> ${l.msg}</div>`).join('');
    const sup0 = supplied;
    const crownChip = s.crown.owner !== -1 && s.crown.turns > 0
      ? `<span class="e-chip" title="Hold the Storybook Tower crown ${E_RULES.crownNeed} turns to win" style="border-color:${emp.facColor(s.crown.owner)}">👑 <b>${s.crown.turns}</b>/${E_RULES.crownNeed} <span class="e-dim">${s.crown.owner === this.ME ? 'you' : emp.facLabel(s.crown.owner)}</span></span>`
      : '';
    const myDoctrines = (s.doctrines[this.ME] || []).filter(Boolean);
    const doctrineChip = `<span class="e-chip" title="Your doctrines — click 🎗️ below to change">🎗️ ${myDoctrines.length ? myDoctrines.map((k) => E_DOCTRINES[k].icon).join(' ') : '<span class="e-dim">choose one</span>'}</span>`;
    const dcfg = emp.diff();
    const diffChip = `<span class="e-chip" title="${dcfg.desc}">${dcfg.icon} <span class="e-dim">${dcfg.label}</span></span>`;
    const evBanner = ev
      ? `<div class="e-event ${ev.phase}">${ev.phase === 'warn'
        ? `⚠️ ${evDef.warn}`
        : `${evDef.icon} ${evDef.name} — ${ev.left} turn${ev.left > 1 ? 's' : ''} left`}</div>`
      : '';
    const phaseLbl = s.over ? '🌅 The war is over' : s.phase === 'plan' ? '📝 Give your orders, Commander' : '⚔️ Battles rage…';

    this.root.innerHTML = `
      <div class="e-top">
        <button id="e-back" class="diff-btn">← Menu</button>
        <button id="e-guide" class="diff-btn" title="How to play (?)">❔</button>
        <span class="e-chip" title="Parts: build, recruit, upgrade">🔩 <b>${s.parts[this.ME]}</b> <span class="e-dim">+${emp.income(this.ME, sup0) - emp.upkeepCost(this.ME)}/t</span></span>
        <span class="e-chip" title="Power: force marches (cap ${E_RULES.powerCap})">🔋 <b>${s.power[this.ME]}</b><span class="e-dim">/${E_RULES.powerCap}</span></span>
        <span class="e-chip" title="Imagination: the empire tree's currency">💡 <b>${s.imag[this.ME]}</b> <span class="e-dim">+${emp.imagIncome(this.ME, sup0)}/t</span></span>
        <span class="e-chip" title="Territories held — first to ${E_RULES.dominionNeed} with a stronghold wins">🗺️ <b>${emp.ownedCount(this.ME)}</b> vs ${emp.aliveSeats().filter((p) => p !== this.ME).map((p) => `<span style="color:${emp.facColor(p)}">${emp.ownedCount(p)}</span>`).join(' / ')} <span class="e-dim">of ${E_RULES.dominionNeed}</span></span>
        ${emp.seatCount() > 2 ? `<span class="e-chip" id="e-pacts" title="Diplomacy — Non-Aggression Pacts (P)" style="cursor:pointer">🕊️ ${emp.aliveSeats().filter((p) => p !== this.ME).map((p) => emp.atPeace(0, p) ? `<span style="color:${emp.facColor(p)}">${emp.pactBetween(0, p).left}t</span>` : `<span class="e-dim" style="color:${emp.facColor(p)}">war</span>`).join(' ')}</span>` : ''}
        ${crownChip}${doctrineChip}
        <span class="e-chip">🌙 Turn <b>${s.turn}</b><span class="e-dim">/${E_RULES.turnCap}</span></span>
        ${diffChip}
        <span class="e-phase">${phaseLbl}</span>
        <span class="e-spring"></span>
        ${this.net
    ? `<span class="e-chip" style="border-color:#7fd06a">🌐 vs a friend${this.mpWaiting ? ' · <b>waiting…</b>' : ''}</span><button id="e-mpleave" class="diff-btn">✕ Leave</button>`
    : `<button id="e-mp" class="diff-btn" title="Play the Bedroom War against a friend">🌐 Play a Friend</button>
       <button id="e-new" class="diff-btn" title="Abandon this war and start fresh">🔄 New War</button>`}
      </div>
      ${evBanner}
      <div class="e-main">
        <svg id="e-board" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet">
          <defs><marker id="e-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#ffd97a"/></marker></defs>
          <image href="assets/ui/empire-board.jpg" x="0" y="0" width="1000" height="560" preserveAspectRatio="xMidYMid slice" opacity="0.62"/>
          <rect x="0" y="0" width="1000" height="560" fill="#16100a" opacity="0.28"/>
          ${Object.entries(E_REGIONS).map(([rk, r]) => {
    const ro = emp.regionOwner(rk);
    const col = ro >= 0 ? emp.facColor(ro) : '#cbb98e';
    return `<g class="e-region" transform="translate(${r.lx},${r.ly})">
              <text text-anchor="middle" class="e-region-n" style="fill:${col}">${r.name.toUpperCase()}</text>
              ${ro >= 0 ? `<text y="16" text-anchor="middle" class="e-region-h" style="fill:${col}">— held by ${emp.facLabel(ro)} —</text>` : ''}
            </g>`;
  }).join('')}
          <g class="e-cartouche" transform="translate(18,20)">
            <rect x="0" y="0" width="196" height="52" rx="4"/>
            <text x="98" y="20" text-anchor="middle" class="e-cart-t">THE BEDROOM FLOOR</text>
            <text x="98" y="38" text-anchor="middle" class="e-cart-s">a night war of the toy kingdoms</text>
          </g>
          <g class="e-compass" transform="translate(958,512)">
            <circle r="24"/>
            <path d="M0,-20 L5,0 L0,20 L-5,0 Z"/>
            <text y="-28" text-anchor="middle">N</text>
          </g>
          ${routeSvg}${orderSvg}${nodeSvg}${armySvg}
        </svg>
        <div class="e-side">${this.sidePanel(selArmy)}</div>
      </div>
      <div class="e-bottom">
        <button id="e-tree" class="diff-btn">🌳 Empire Tree <span class="e-dim">(${owned0}/8)</span></button>
        <button id="e-doctrines" class="diff-btn">🎗️ Doctrines</button>
        <button id="e-cards" class="diff-btn">📇 Collection</button>
        <button id="e-end" class="diff-btn sel" ${s.phase !== 'plan' || s.over ? 'disabled' : ''}>⏳ End Turn</button>
        <div class="e-log">${logHtml}</div>
      </div>
      <div id="e-modal"></div>`;
    this.wire();
    this.animateTokens();
    if (s.over) this.showVictory();
  }

  // FLIP-style march animation: tokens glide from their last drawn position
  animateTokens() {
    if (this.reduceMotion) { for (const g of this.root.querySelectorAll('.e-army')) { const a = this.emp.s.armies.find((x) => x.id === g.dataset.army); if (a) this.lastPos[a.id] = this.armyPos(a); } return; }
    for (const g of this.root.querySelectorAll('.e-army')) {
      const a = this.emp.s.armies.find((x) => x.id === g.dataset.army);
      if (!a) continue;
      const now = this.armyPos(a);
      const old = this.lastPos[a.id];
      if (old && (old.x !== now.x || old.y !== now.y)) {
        try {
          g.animate([
            { transform: `translate(${old.x}px,${old.y}px)` },
            { transform: `translate(${now.x}px,${now.y}px)` },
          ], { duration: 550, easing: 'ease-in-out' });
        } catch (e) { /* older browser: tokens just snap */ }
      }
      this.lastPos[a.id] = now;
    }
  }

  sidePanel(selArmy) {
    const emp = this.emp, s = emp.s;
    if (selArmy) {
      const cards = selArmy.cards.map((c) => {
        const card = E_CARDS[c.key] || { name: UNITS[c.type] ? UNITS[c.type].name : c.type, icon: '', rarity: 'common' };
        const col = E_RARITY[card.rarity].color;
        return `<div class="e-card"><span style="color:${col}">${card.icon} ${card.name}</span><span title="veterancy">${'★'.repeat(c.vet)}</span>
         <div class="e-hp"><div style="width:${c.strength}%"></div></div></div>`;
      }).join('');
      const atCap = selArmy.node === emp.capOf(0);
      const canRec = emp.canRecruitAt(this.ME, selArmy.node);
      const mpPips = '●'.repeat(selArmy.mp) + '○'.repeat(Math.max(0, E_RULES.armyMP + (selArmy.marched ? 1 : 0) - selArmy.mp));
      const canMuster = emp.armiesOf(this.ME).length < E_RULES.maxArmies
        && emp.ownedCount(this.ME) >= E_RULES.musterMinNodes && s.parts[this.ME] >= E_RULES.musterCost;
      return `<div class="e-panel">
        <div class="e-ttl">🚩 ${selArmy.id.startsWith('B') ? 'Second Army' : 'Grand Army'} — ${E_NODES[selArmy.node].name}</div>
        <div class="e-dim">March ${mpPips} · ${selArmy.cards.length}/${E_RULES.maxCards} toys
        ${selArmy.order ? ` · → ${E_NODES[selArmy.order.to].name}` : ''}</div>
        ${cards}
        <button id="e-recruit" class="diff-btn" ${canRec && selArmy.cards.length < E_RULES.maxCards ? '' : 'disabled'}
          title="${canRec ? 'Field a collection card here' : 'Recruit at your capital or a Barracks'}">➕ Field a Card…</button>
        <button id="e-march" class="diff-btn" ${!selArmy.marched && s.power[this.ME] >= E_RULES.forceMarchCost && s.phase === 'plan' ? '' : 'disabled'}
          title="+1 movement this turn">🔋 Force March (${E_RULES.forceMarchCost}⚡)</button>
        ${atCap ? `<button id="e-muster" class="diff-btn" ${canMuster ? '' : 'disabled'}
          title="A second army — needs ${E_RULES.musterMinNodes} territories">🚩 Muster 2nd Army (${E_RULES.musterCost}🔩)</button>` : ''}
        ${atCap ? `<button id="e-drill" class="diff-btn" ${s.parts[this.ME] >= E_RULES.drill.cost && s.phase === 'plan' ? '' : 'disabled'}
          title="A playable training bout — WIN IT PLAYED for +1 vet">🎯 Drill Yard (${E_RULES.drill.cost}🔩)</button>` : ''}
        ${selArmy.order ? '<button id="e-cancel" class="diff-btn">✕ Cancel move</button>' : '<div class="e-dim">Click a glowing node to march.</div>'}
      </div>`;
    }
    if (this.selNode) {
      const id = this.selNode, n = E_NODES[id], st = s.nodes[id];
      const supplied = emp.suppliedSet(st.owner === -1 ? 0 : st.owner);
      const tKey = E_NODE_TEMPLATE_OVERRIDE[id] || E_NODE_TEMPLATE[n.type] || 'field';
      const t = E_TEMPLATES[tKey];
      // scouting fog (§15): garrison details only near your territory —
      // Scouting Kites (Intelligence I) doubles that reach to two routes
      const near1 = routesOf(id).some((r) => s.nodes[r.to].owner === this.ME)
        || st.owner === this.ME || emp.armiesOf(this.ME).some((a) => a.node === id || routesOf(id).some((r) => r.to === a.node));
      const near2 = s.upgrades[this.ME].includes('kites') && routesOf(id).some((r) => routesOf(r.to).some((r2) => s.nodes[r2.to].owner === this.ME));
      // a Watchtower you own reveals garrisons within two routes of the fort
      const near3 = routesOf(id).some((r) => (s.nodes[r.to].owner === this.ME && emp.hasModule(r.to, 'watchtower'))
        || routesOf(r.to).some((r2) => s.nodes[r2.to].owner === this.ME && emp.hasModule(r2.to, 'watchtower')));
      const adjacent = near1 || near2 || near3 || emp.hasDoctrine(this.ME, 'spymaster'); // Spymaster sees all
      let garrisonLine = '';
      if (st.owner !== this.ME) {
        const gTmpl = st.garrison || E_GARRISONS[n.type];
        if (gTmpl && gTmpl.length) {
          garrisonLine = adjacent
            ? `🛡️ Scouts report <b>${gTmpl.length}</b> defender${gTmpl.length > 1 ? 's' : ''}`
            : '🛡️ Garrison unknown — march closer to scout it';
        } else garrisonLine = '🕊️ Undefended';
      } else {
        garrisonLine = supplied.has(id) ? '✅ Supplied' : '✂️ CUT OFF — half yield, no healing here';
      }
      const owner = st.owner === -1 ? 'Unclaimed' : emp.facLabel(st.owner);
      // module sockets — buildable when you own an anchor node (fort / capital)
      const slots = emp.moduleSlots(id);
      let modBlock = '';
      if (slots > 0) {
        const built = (st.modules || []).map((k) => `<span class="e-modchip" title="${E_MODULES[k].desc}">${E_MODULES[k].icon} ${E_MODULES[k].name}</span>`).join('');
        const free = slots - (st.modules || []).length;
        let buildBtns = '';
        if (st.owner === this.ME && free > 0) {
          buildBtns = Object.entries(E_MODULES).filter(([k]) => !emp.hasModule(id, k)).map(([k, mod]) => {
            const afford = s.parts[this.ME] >= mod.parts && s.imag[this.ME] >= (mod.imag || 0);
            return `<button class="e-modbuild" data-node="${id}" data-mod="${k}" ${afford && s.phase === 'plan' ? '' : 'disabled'} title="${mod.desc}">
              ${mod.icon} ${mod.name} — ${mod.parts}🔩${mod.imag ? ` ${mod.imag}💡` : ''}</button>`;
          }).join('');
        }
        modBlock = `<div class="e-kv"><span>Modules</span><b>${(st.modules || []).length}/${slots}</b></div>
          ${built ? `<div class="e-mods">${built}</div>` : ''}
          ${buildBtns ? `<div class="e-dim" style="margin-top:2px">Build:</div><div class="e-modbuilds">${buildBtns}</div>` : (st.owner === this.ME && free === 0 ? '<div class="e-dim">All sockets full.</div>' : '')}`;
      }
      const regionKey = emp.regionOf(id);
      const region = regionKey ? E_REGIONS[regionKey] : null;
      const regOwner = regionKey ? emp.regionOwner(regionKey) : -1;
      return `<div class="e-panel">
        <div class="e-ttl">${n.icon} ${n.name}</div>
        ${region ? `<div class="e-dim" style="font-style:italic">a province of <b style="color:${regOwner >= 0 ? emp.facColor(regOwner) : '#cbb98e'}">${region.name}</b>${regOwner >= 0 ? `, held by ${emp.facLabel(regOwner)}` : ''}</div>` : ''}
        <div class="e-dim">${n.desc}</div>
        <div class="e-kv"><span>Owner</span><b style="color:${st.owner === -1 ? '#b9a888' : emp.facColor(st.owner)}">${owner}</b></div>
        ${n.yield ? `<div class="e-kv"><span>Yield</span><b>${n.yield}🔩${n.powerYield ? ` + ${n.powerYield}⚡` : ''}/turn</b></div>` : ''}
        ${n.bonus && !st.looted ? `<div class="e-kv"><span>Cache</span><b>+${n.bonus}🔩 one-time</b></div>` : ''}
        ${n.dominion ? `<div class="e-kv"><span>Dominion</span><b>worth ${n.dominion}</b></div>` : ''}
        <div class="e-kv"><span>If contested</span><b>${t.label} · ~${t.time}</b></div>
        <div class="e-dim">${garrisonLine}</div>
        ${modBlock}
      </div>`;
    }
    return `<div class="e-panel"><div class="e-ttl">📖 The Bedroom War</div>
      <div class="e-dim">Click your army token to command it; click any node for intel. Capture
      <b>${E_RULES.dominionNeed} territories</b> including a stronghold — or take the enemy capital —
      before sunrise on turn ${E_RULES.turnCap}.</div>
      <div class="e-dim" style="margin-top:6px">⚡ Power fuels forced marches. ✂️ Territory cut off from
      your capital yields half. 🌪️ Mind the vacuum.</div>
      <div class="e-dim" style="margin-top:6px">Every battle is yours to <b>Play</b> in the toy box
      or <b>Simulate</b> from the same odds.</div></div>`;
  }

  wire() {
    const emp = this.emp;
    this.root.querySelector('#e-back').addEventListener('click', () => { this.hide(); });
    const gd = this.root.querySelector('#e-guide');
    if (gd) gd.addEventListener('click', () => { esfx('select', 60); this.showGuide(); });
    const newBtn = this.root.querySelector('#e-new');
    if (newBtn) newBtn.addEventListener('click', () => {
      if (this.confirmNew) { Empire.clear(); this.emp = new Empire(); this.sel = null; this.selNode = null; this.lastPos = {}; this.confirmNew = false; this.render(); }
      else { this.confirmNew = true; newBtn.textContent = '⚠ Sure? Click again'; }
    });
    const mpBtn = this.root.querySelector('#e-mp');
    if (mpBtn) mpBtn.addEventListener('click', () => { esfx('select', 60); this.showMpLobby(); });
    const mpLeave = this.root.querySelector('#e-mpleave');
    if (mpLeave) mpLeave.addEventListener('click', () => { this.leaveMp('You left the war.'); });
    const endBtn = this.root.querySelector('#e-end');
    if (endBtn) endBtn.addEventListener('click', () => {
      this.confirmNew = false;
      const capturedBefore = emp.s.stats.captured;
      const lootBefore = emp.loot.length;
      esfx('command', 120);
      if (this.net) { this.net.ready(emp.s.turn); this.mpWaiting = true; this.render(); return; }
      emp.endTurn();
      this.sel = null;
      this.render();
      if (emp.s.stats.captured > capturedBefore) esfx('place', 120);
      if (emp.loot.length > lootBefore) this.flashLoot(emp.loot[emp.loot.length - 1]);
      const enc = emp.nextEncounter();
      if (enc) { esfx('charge', 200); this.showEncounter(enc); }
    });
    for (const g of this.root.querySelectorAll('.e-army')) {
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        const a = emp.s.armies.find((x) => x.id === g.dataset.army);
        if (!a || a.owner !== this.ME) return;
        this.sel = this.sel === a.id ? null : a.id; // click again to deselect
        this.selNode = null;
        esfx('select', 60);
        this.render();
      });
    }
    for (const g of this.root.querySelectorAll('.e-node')) {
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = g.dataset.node;
        if (this.sel && emp.s.phase === 'plan') {
          const r = this.issue({ type: 'move', army: this.sel, to: id }, 'select') || { ok: true };
          if (r.ok) { esfx('command', 60); this.render(); return; }
          esfx('error', 120);
        }
        this.sel = null;
        this.selNode = this.selNode === id ? null : id; // inspect / close intel
        esfx('select', 60);
        this.render();
      });
    }
    // clicking open board space clears every selection
    this.root.querySelector('#e-board').addEventListener('click', () => {
      if (this.sel || this.selNode) { this.sel = null; this.selNode = null; this.render(); }
    });
    const act = (id, fn, snd = 'place') => { const el = this.root.querySelector(id); if (el) el.addEventListener('click', () => { const r = fn(); esfx(r && r.ok === false ? 'error' : snd, 100); this.render(); }); };
    const rec = this.root.querySelector('#e-recruit');
    if (rec) rec.addEventListener('click', () => { esfx('select', 60); this.showRecruit(); });
    act('#e-march', () => this.issue({ type: 'march', army: this.sel }, 'twang'), 'twang');
    act('#e-muster', () => this.issue({ type: 'muster' }, 'charge'), 'charge');
    act('#e-cancel', () => this.issue({ type: 'cancel', army: this.sel }, 'select'), 'select');
    const drill = this.root.querySelector('#e-drill');
    if (drill) drill.addEventListener('click', () => { esfx('select', 60); this.showDrill(); });
    const tree = this.root.querySelector('#e-tree');
    if (tree) tree.addEventListener('click', () => { esfx('select', 60); this.showTree(); });
    const cards = this.root.querySelector('#e-cards');
    if (cards) cards.addEventListener('click', () => { esfx('select', 60); this.showCollection(); });
    const doc = this.root.querySelector('#e-doctrines');
    if (doc) doc.addEventListener('click', () => { esfx('select', 60); this.showDoctrines(); });
    const pacts = this.root.querySelector('#e-pacts');
    if (pacts) pacts.addEventListener('click', () => { esfx('select', 60); this.showDiplomacy(); });
    for (const b of this.root.querySelectorAll('.e-modbuild')) {
      b.addEventListener('click', () => { this.issue({ type: 'module', node: b.dataset.node, key: b.dataset.mod }); });
    }
  }

  // recruit picker: field a card you own (commons always available)
  showRecruit() {
    const emp = this.emp, s = emp.s, armyId = this.sel;
    const list = Object.entries(E_CARDS)
      .filter(([k]) => ownsCard(emp.coll, k))
      .sort((a, b) => E_CARD_ORDER.indexOf(a[1].rarity) - E_CARD_ORDER.indexOf(b[1].rarity) || a[1].cost - b[1].cost)
      .map(([k, c]) => {
        const afford = s.parts[this.ME] >= c.cost;
        return `<button class="e-rcard ${afford ? '' : 'poor'}" data-card="${k}" ${afford ? '' : 'disabled'} style="border-color:${E_RARITY[c.rarity].color}88">
          <span class="e-rname">${c.icon} ${c.name}</span>
          <span class="e-rrar" style="color:${E_RARITY[c.rarity].color}">${E_RARITY[c.rarity].name}</span>
          <span class="e-rcost">${c.cost}🔩</span></button>`;
      }).join('');
    const m = this.root.querySelector('#e-modal');
    m.innerHTML = `<div class="e-enc"><div class="e-enc-card e-tree-card">
      <div class="e-ttl">➕ Field a Card</div>
      <div class="e-dim">Recruit from your collection into this army. Win battles and open chests to collect more.</div>
      <div class="e-rlist">${list}</div>
      <div class="e-enc-btns"><button id="e-rclose" class="diff-btn sel">Done</button></div>
    </div></div>`;
    for (const b of m.querySelectorAll('.e-rcard')) {
      b.addEventListener('click', () => {
        const r = this.issue({ type: 'recruit', army: armyId, key: b.dataset.card }) || { ok: true };
        esfx(r.ok ? 'place' : 'error', 100);
        this.render();
        if (r.ok) this.showRecruit(); // stay open to field more
      });
    }
    m.querySelector('#e-rclose').addEventListener('click', () => { m.innerHTML = ''; });
  }

  // the Card Collection — every card, owned or locked, with crafting
  showCollection() {
    const emp = this.emp, coll = emp.coll;
    const groups = E_CARD_ORDER.map((rar) => {
      const cells = Object.entries(E_CARDS).filter(([, c]) => c.rarity === rar).map(([k, c]) => {
        const owned = ownsCard(coll, k);
        const craftCost = E_RARITY[rar].craft;
        const canCraft = !owned && rar !== 'common' && coll.scraps >= craftCost;
        return `<div class="e-colcard ${owned ? 'owned' : 'locked'}" style="border-color:${E_RARITY[rar].color}${owned ? '' : '44'}">
          <div class="e-colic">${owned ? c.icon : '❓'}</div>
          <div class="e-colname">${owned ? c.name : '???'}</div>
          <div class="e-colflav">${owned ? c.flavor : 'Undiscovered — win it in battle or craft it.'}</div>
          ${owned ? '' : (rar === 'common' ? '' : `<button class="e-craft" data-card="${k}" ${canCraft ? '' : 'disabled'}>Craft ${craftCost}✨</button>`)}
        </div>`;
      }).join('');
      return `<div class="e-colgroup"><div class="e-colhdr" style="color:${E_RARITY[rar].color}">${E_RARITY[rar].name}</div><div class="e-colrow">${cells}</div></div>`;
    }).join('');
    const total = Object.keys(E_CARDS).length;
    const have = Object.keys(E_CARDS).filter((k) => ownsCard(coll, k)).length;
    const m = this.root.querySelector('#e-modal');
    m.innerHTML = `<div class="e-enc"><div class="e-enc-card e-col-card">
      <div class="e-ttl">📇 Card Collection <span class="e-dim">${have}/${total} · ✨ <b>${coll.scraps}</b> scraps</span></div>
      <div class="e-dim">Cards persist across every campaign. Win battles for new cards + scraps; dupes melt into scraps you can craft with.</div>
      <div class="e-collection">${groups}</div>
      <div class="e-enc-btns"><button id="e-colclose" class="diff-btn sel">Done</button></div>
    </div></div>`;
    for (const b of m.querySelectorAll('.e-craft')) {
      b.addEventListener('click', () => { const r = emp.craft(b.dataset.card); esfx(r.ok ? 'charge' : 'error', 120); this.showCollection(); this.render(); });
    }
    m.querySelector('#e-colclose').addEventListener('click', () => { m.innerHTML = ''; });
  }

  // the Doctrines modal (§10): pick a strategic identity per slot
  showDoctrines() {
    const emp = this.emp, s = emp.s, cur = s.doctrines[this.ME] || [];
    const slots = emp.doctrineSlots(0);
    const cell = (k, slot) => {
      const d = E_DOCTRINES[k];
      const active = cur[slot] === k;
      const elsewhere = cur.includes(k) && !active; // already in the other slot
      const occupied = !!cur[slot];
      const canPay = !occupied || active || s.power[this.ME] >= E_RULES.doctrineSwapCost;
      const cls = active ? 'active' : elsewhere ? 'elsewhere' : canPay ? '' : 'poor';
      const tag = active ? '✓ active' : elsewhere ? 'in other slot' : occupied ? `swap (${E_RULES.doctrineSwapCost}⚡)` : 'commit';
      return `<button class="e-doc ${cls}" data-doc="${k}" data-slot="${slot}" ${elsewhere || (!active && !canPay) ? 'disabled' : ''}>
        <div class="e-docname">${d.icon} ${d.name}</div><div class="e-docdesc">${d.desc}</div><div class="e-doctag">${tag}</div></button>`;
    };
    const slotBlock = (slot) => {
      if (slot >= slots) return `<div class="e-docslot locked"><div class="e-docslothdr">🔒 Slot 2 — unlocks on turn ${E_RULES.doctrineSlot2Turn}</div></div>`;
      return `<div class="e-docslot"><div class="e-docslothdr">Slot ${slot + 1}${cur[slot] ? '' : ' — empty'}</div>
        <div class="e-docgrid">${Object.keys(E_DOCTRINES).map((k) => cell(k, slot)).join('')}</div></div>`;
    };
    const m = this.root.querySelector('#e-modal');
    m.innerHTML = `<div class="e-enc"><div class="e-enc-card e-tree-card">
      <div class="e-ttl">🎗️ Doctrines <span class="e-dim">🔋 ${s.power[this.ME]} Power</span></div>
      <div class="e-dim">A focused edge that shapes your whole campaign. Committing to an empty slot is free; swapping a chosen one costs ${E_RULES.doctrineSwapCost} Power.</div>
      ${slotBlock(0)}${slotBlock(1)}
      <div class="e-enc-btns"><button id="e-dclose" class="diff-btn sel">Done</button></div>
    </div></div>`;
    for (const b of m.querySelectorAll('.e-doc')) {
      b.addEventListener('click', () => {
        const r = this.issue({ type: 'doctrine', slot: +b.dataset.slot, key: b.dataset.doc }) || { ok: true };
        esfx(r.ok ? 'charge' : 'error', 120);
        this.render(); this.showDoctrines();
      });
    }
    m.querySelector('#e-dclose').addEventListener('click', () => { m.innerHTML = ''; });
  }

  // the Empire Tree modal (§10): four branches, two tiers, Parts + Imagination
  showTree() {
    const emp = this.emp, s = emp.s;
    const cols = Object.entries(E_BRANCHES).map(([bk, b]) => {
      const nodes = Object.entries(E_UPGRADES).filter(([, u]) => u.branch === bk).sort((a, c) => a[1].tier - c[1].tier);
      const cells = nodes.map(([k, u]) => {
        const owned = s.upgrades[this.ME].includes(k);
        const locked = u.prereq && !s.upgrades[this.ME].includes(u.prereq);
        const afford = s.parts[this.ME] >= u.parts && s.imag[this.ME] >= u.imag;
        const cls = owned ? 'owned' : locked ? 'locked' : afford ? 'afford' : 'poor';
        return `<button class="e-tnode ${cls}" data-upg="${k}" ${owned || locked ? 'disabled' : ''}>
          <div class="e-tname">${u.icon} ${u.name}</div>
          <div class="e-tdesc">${u.desc}</div>
          <div class="e-tcost">${owned ? '✓ owned' : locked ? '🔒 needs ' + E_UPGRADES[u.prereq].name : `${u.parts}🔩 · ${u.imag}💡`}</div>
        </button>`;
      }).join('<div class="e-tlink"></div>');
      return `<div class="e-tcol"><div class="e-tbranch">${b.icon} ${b.name}</div>${cells}</div>`;
    }).join('');
    const m = this.root.querySelector('#e-modal');
    m.innerHTML = `<div class="e-enc"><div class="e-enc-card e-tree-card">
      <div class="e-ttl">🌳 The Empire Tree</div>
      <div class="e-dim">🔩 <b>${s.parts[this.ME]}</b> Parts · 💡 <b>${s.imag[this.ME]}</b> Imagination — spend them to shape a distinct empire.</div>
      <div class="e-tree">${cols}</div>
      <div class="e-enc-btns"><button id="e-tclose" class="diff-btn sel">Done</button></div>
    </div></div>`;
    for (const b of m.querySelectorAll('.e-tnode')) {
      b.addEventListener('click', () => {
        const r = this.issue({ type: 'upgrade', key: b.dataset.upg }) || { ok: true };
        esfx(r.ok ? 'charge' : 'error', 120);
        this.render();
        this.showTree(); // refresh the open modal
      });
    }
    m.querySelector('#e-tclose').addEventListener('click', () => { m.innerHTML = ''; });
  }

  toast(msg) {
    const m = this.root.querySelector('#e-modal');
    m.innerHTML = `<div class="e-toast">${msg}</div>`;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { if (m.firstChild && m.firstChild.className === 'e-toast') m.innerHTML = ''; }, 2600);
  }
  // a card-reveal flourish when spoils are won (skipped if a battle modal is up)
  flashLoot(loot) {
    if (!loot || this.emp.nextEncounter() || this.emp.s.pendingSpoils) return; // spoils modal takes precedence
    const c = E_CARDS[loot.key]; if (!c) return;
    const col = E_RARITY[c.rarity].color;
    const m = this.root.querySelector('#e-modal');
    m.innerHTML = `<div class="e-loot${this.reduceMotion ? ' noanim' : ''}" style="border-color:${col}">
      <div class="e-loot-tag" style="color:${col}">${loot.first ? '✨ NEW CARD' : 'DUPLICATE → +' + loot.scraps + ' scraps'}</div>
      <div class="e-loot-ic">${c.icon}</div>
      <div class="e-loot-name" style="color:${col}">${c.name}</div>
      <div class="e-dim">${E_RARITY[c.rarity].name} · ${c.flavor}</div></div>`;
    esfx('charge', 100);
    clearTimeout(this.lootT);
    this.lootT = setTimeout(() => { if (m.firstChild && m.firstChild.className === 'e-loot') m.innerHTML = ''; }, 3200);
  }

  showEncounter(enc) {
    const emp = this.emp;
    const p = emp.preview(enc);
    const n = E_NODES[enc.nodeId];
    const youAttack = enc.attacker.owner === this.ME;
    const { attCards, defCards } = emp.encCards(enc);
    const chip = (c) => `<span class="e-uchip" title="${UNITS[c.type].name} ${c.strength}%${c.vet ? ' · veteran' : ''}">
      ${UNITS[c.type].name.split(' ')[0]}${'★'.repeat(c.vet || 0)}<i style="width:${c.strength}%"></i></span>`;
    const yourCards = youAttack ? attCards : defCards;
    const theirCards = youAttack ? defCards : attCards;
    // readiness of YOUR army in this fight (attacker or defender) — flag it if the toys are worn out
    const myReady = youAttack ? p.attReady : p.defReady;
    const tiredNote = (myReady != null && myReady < E_RULES.readiness.lowAt)
      ? `<div class="e-dim" style="color:#e6a23c">💤 Your toys are worn out (readiness ${Math.round(myReady)}%) — they'll fight softer. Rest on friendly ground to recover.</div>` : '';
    const m = this.root.querySelector('#e-modal');
    m.innerHTML = `<div class="e-enc">
      <div class="e-enc-card">
        <div class="e-ttl">${n.icon} ${youAttack ? 'Assault on' : 'Defend'} ${n.name}</div>
        <div class="e-dim"><b>${p.template.label}</b> · ~${p.template.time} if played · seed locked — no rerolls</div>
        ${p.template.note ? `<div class="e-dim" style="font-style:italic;opacity:.85">“${p.template.note}”</div>` : ''}
        <div class="e-band b-${p.band.toLowerCase()}">${p.band}</div>
        ${tiredNote}
        <div class="e-rosters">
          <div><div class="e-dim">Your toys (${Math.round(youAttack ? p.attPower : p.defPower)})</div>${yourCards.map(chip).join('')}</div>
          <div><div class="e-dim">Theirs (${Math.round(youAttack ? p.defPower : p.attPower)})</div>${theirCards.map(chip).join('')}</div>
        </div>
        <div class="e-dim">Expected losses: <b>${p.lossHint}</b> · Stakes: ${youAttack ? 'capture the node' : 'hold the node'} — the loser falls back, or breaks.</div>
        <div class="e-enc-btns">
          <button id="e-play" class="diff-btn sel">⚔️ Play the battle</button>
          <button id="e-sim" class="diff-btn">🎲 Simulate</button>
          ${youAttack ? '<button id="e-flee" class="diff-btn">🏃 Withdraw</button>' : ''}
        </div>
      </div></div>`;
    m.querySelector('#e-sim').addEventListener('click', () => {
      const res = emp.simulate(enc);
      const humanWon = res.attackerWon === (enc.attacker.owner === this.ME);
      emp.finishEncounter(enc, res);
      esfx(humanWon ? 'place' : 'bonk', 100);
      this.render();
      const next = emp.nextEncounter();
      if (next) { esfx('charge', 200); this.showEncounter(next); }
      else if (emp.s.pendingSpoils) this.showSpoils();
    });
    const flee = m.querySelector('#e-flee');
    if (flee) flee.addEventListener('click', () => {
      emp.retreatEncounter(enc);
      this.render();
      const next = emp.nextEncounter();
      if (next) this.showEncounter(next);
    });
    m.querySelector('#e-play').addEventListener('click', () => {
      const ctx = emp.beginPlayedBattle(enc);
      this.launchCtx = ctx;
      if (hooks.startGame) hooks.startGame(ctx.difficulty, ctx.map);
    });
  }

  // Aftermath Spoils (§17): a one-time reward pick after storming a capital/stronghold.
  // Non-dismissable (guarded in handleKey) — a choice must be made.
  showSpoils() {
    const emp = this.emp, sp = emp.s.pendingSpoils;
    if (!sp) return;
    clearTimeout(this.lootT); clearTimeout(this.toastT); // don't let a stray toast wipe this modal
    const node = E_NODES[sp.node], r = E_RULES.spoils;
    const army = emp.s.armies.find((a) => a.id === sp.armyId);
    const avg = army && army.cards.length ? Math.round(army.cards.reduce((s, c) => s + c.strength, 0) / army.cards.length) : 100;
    const m = this.root.querySelector('#e-modal');
    m.innerHTML = `<div class="e-enc"><div class="e-enc-card">
      <div class="e-ttl">${node.icon} ${node.name} has fallen — claim your spoils</div>
      <div class="e-dim">A stronghold taken is a moment to press the advantage. Choose one:</div>
      <div class="e-enc-btns" style="flex-wrap:wrap">
        <button id="sp-parts" class="diff-btn sel">🔩 Salvage · +${r.parts} Parts</button>
        <button id="sp-heal" class="diff-btn">❤️ Regroup · army to full${avg < 100 ? ` (${avg}% now)` : ''}</button>
        <button id="sp-power" class="diff-btn">⚡ Momentum · +${r.power} Power</button>
      </div></div></div>`;
    const pick = (choice, snd) => { emp.resolveSpoils(choice); esfx(snd, 100); this.render(); };
    m.querySelector('#sp-parts').addEventListener('click', () => pick('parts', 'place'));
    m.querySelector('#sp-heal').addEventListener('click', () => pick('heal', 'charge'));
    m.querySelector('#sp-power').addEventListener('click', () => pick('power', 'twang'));
  }

  showVictory() {
    const emp = this.emp, st = emp.s.stats;
    const win = emp.s.winner === 0;
    if (!this._victorySung) { this._victorySung = true; esfx(win ? 'victory' : 'defeat', 300); }
    const m = this.root.querySelector('#e-modal');
    m.innerHTML = `<div class="e-enc"><div class="e-enc-card">
      <div class="e-ttl" style="font-size:22px">${win ? '🌅 VICTORY' : '🌑 DEFEAT'}</div>
      <div class="e-dim">${emp.s.log[emp.s.log.length - 1].msg}</div>
      <div class="e-vstats">
        <div><b>${emp.s.turn}</b><span>turns</span></div>
        <div><b>${st.captured}</b><span>captured</span></div>
        <div><b>${st.won}·${st.lost}</b><span>battles W·L</span></div>
        <div><b>${st.played}</b><span>played</span></div>
        <div><b>${st.simmed}</b><span>simulated</span></div>
      </div>
      <div class="e-enc-btns"><button id="e-again" class="diff-btn sel">🔄 New War</button>
      <button id="e-out" class="diff-btn">← Menu</button></div></div></div>`;
    m.querySelector('#e-again').addEventListener('click', () => { Empire.clear(); this.emp = new Empire(); this.sel = null; this.selNode = null; this.lastPos = {}; this._victorySung = false; this.render(); this.showDifficulty(); });
    m.querySelector('#e-out').addEventListener('click', () => this.hide());
  }
}

// headless determinism harness (§20 test): scripted human turns, auto-AI,
// all encounters simulated. Same seed + script ⇒ identical stateHash.
export function empireTest(seed, turns = 8, script = [], difficulty = 'normal') {
  const emp = new Empire(seed, undefined, false); // persist=false: never touches tt-empire
  emp.s.difficulty = difficulty; emp.s.difficultyChosen = true; // §13: exercise a challenge tier headlessly
  const byTurn = {};
  for (const s of script) (byTurn[s.turn] = byTurn[s.turn] || []).push(s);
  for (let t = 0; t < turns && !emp.s.over; t++) {
    const acts = byTurn[emp.s.turn] || [];
    for (const s of acts) {
      if (s.type === 'move') emp.issueMove(s.army || 'A0', s.to);
      if (s.type === 'recruit') emp.recruit(0, s.army || null);
      if (s.type === 'upgrade') emp.buyUpgrade(0, s.key);
      if (s.type === 'march') emp.forceMarch(s.army || 'A0');
      if (s.type === 'muster') emp.muster(0);
      if (s.type === 'doctrine') emp.setDoctrine(0, s.slot || 0, s.key);
      if (s.type === 'module') emp.buildModule(0, s.node, s.key);
      if (s.type === 'pact') emp.offerPact(s.other ?? 1);
      if (s.type === 'drill') { const a0 = emp.armiesOf(0)[0]; if (a0 && a0.cards[0]) emp.startDrill(a0.id, a0.cards[s.card || 0] ? a0.cards[s.card || 0].id : a0.cards[0].id); }
      if (s.type === 'breakpact') emp.breakPact(s.other ?? 1);
      if (s.type === 'trade') emp.offerTrade(s.other ?? 1, s.mode || 'power');
      if (s.type === 'passage') emp.offerPassage(s.other ?? 1);
      if (s.type === 'bounty') emp.postBounty(s.other ?? 1);
      if (s.type === 'ceasefire') emp.offerCeasefire(s.other ?? 1);
    }
    emp.endTurn();
    let guard = 0;
    let enc;
    while ((enc = emp.nextEncounter()) && guard++ < 10) emp.finishEncounter(enc, emp.simulate(enc));
    // stand in for the human's Aftermath Spoils pick (default Salvage; script may name a choice)
    if (emp.s.pendingSpoils) { const sp = acts.find((x) => x.type === 'spoils'); emp.resolveSpoils(sp ? sp.choice : 'parts'); }
  }
  return { hash: emp.stateHash(), turn: emp.s.turn, over: emp.s.over, winner: emp.s.winner,
    winHow: emp.s.winHow || null, owned: [emp.ownedCount(0), emp.ownedCount(1)],
    parts: [...emp.s.parts], power: [...emp.s.power], imag: [...emp.s.imag], upgrades: emp.s.upgrades.map((u) => [...u]),
    crown: { ...emp.s.crown }, doctrines: emp.s.doctrines.map((d) => [...d]),
    armies: emp.s.armies.map((a) => a.id + '@' + a.node + ':' + a.cards.length),
    readiness: emp.s.armies.map((a) => a.id + ':' + (a.readiness == null ? '-' : Math.round(a.readiness))),
    stats: { ...emp.s.stats }, event: emp.s.event ? { ...emp.s.event } : null,
    difficulty: emp.s.difficulty,
    pendingSpoils: emp.s.pendingSpoils ? emp.s.pendingSpoils.node : null,
    lastLoot: emp.s.lastLoot ? emp.s.lastLoot.key : null, cardsWon: emp.loot.map((l) => l.key),
    log: emp.s.log.slice(-3) };
}

// ---------------------------------------------------------------- phase 3
// Two-human campaign harness: both "clients" run their own Empire; commands
// apply in the HOST-canonical order on both; endTurn advances in lockstep.
// Same seed + same ordered commands ⇒ identical stateHash on both clients.
// This is exactly the contract the PeerJS relay must keep (see EmpireNet).
export function empireNetTest(seed, turns = 12, scripts = [[], []]) {
  const mk = () => {
    const e = new Empire(seed, ['bricks', 'classic', 'bots'], false);
    e.s.humans = [0, 1];
    e.s.difficulty = 'normal'; e.s.difficultyChosen = true;
    return e;
  };
  const A = mk(), B = mk();
  const apply = (e, cmd) => {
    const fns = {
      move: (c) => e.issueMove(c.army || 'A' + c.seat, c.to),
      march: (c) => e.forceMarch(c.army || 'A' + c.seat),
      recruit: (c) => e.recruit(c.seat, c.army || 'A' + c.seat),
      pact: (c) => e.offerPact(c.other, c.seat),
      breakpact: (c) => e.breakPact(c.other, c.seat),
      trade: (c) => e.offerTrade(c.other, c.mode || 'power', c.seat),
      passage: (c) => e.offerPassage(c.other, c.seat),
      cease: (c) => e.offerCeasefire(c.other, c.seat),
      module: (c) => e.buildModule(c.seat, c.node, c.key),
    };
    fns[cmd.type] && fns[cmd.type](cmd);
  };
  for (let t = 0; t < turns && !A.s.over; t++) {
    const cmds = [];
    for (const seat of [0, 1]) {
      for (const c of (scripts[seat] || []).filter((c) => c.turn === A.s.turn)) cmds.push({ ...c, seat });
    }
    for (const c of cmds) { apply(A, c); apply(B, c); } // canonical order, both clients
    A.endTurn(); B.endTurn();
  }
  return {
    hashA: A.stateHash(), hashB: B.stateHash(), same: A.stateHash() === B.stateHash(),
    over: A.s.over, winner: A.s.winner, turn: A.s.turn,
    seatsAlive: A.aliveSeats(), oversMatch: A.s.over === B.s.over && A.s.winner === B.s.winner,
  };
}
