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
  E_NODES, E_ROUTES, E_TEMPLATES, E_NODE_TEMPLATE, E_NODE_TEMPLATE_OVERRIDE,
  E_FACTIONS, E_START_ROSTER, E_GARRISONS, E_UPGRADES, E_BRANCHES, E_RULES, E_SIM,
  E_MODULES, E_MODULE_SLOTS,
} from './empire-data.js';
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
  constructor(seedOrSave, factions = ['bricks', 'classic'], persist = true) {
    this.persist = persist; // headless tests run with persist=false (never touch storage)
    // the card collection is META — it lives across campaigns (tests get a throwaway)
    this.coll = persist ? loadCollection() : { owned: {}, scraps: 0, seen: [] };
    this.loot = []; // cards won this session (UI shows them; not authoritative state)
    if (seedOrSave && typeof seedOrSave === 'object') { this.load(seedOrSave); return; }
    const seed = seedOrSave || ((Math.random() * 2 ** 31) | 0);
    this.s = {
      v: 5, seed, turn: 1, phase: 'plan', rng: 0,
      factions, // seat 0 = human, seat 1 = AI
      parts: [E_RULES.startParts, E_RULES.startParts],
      power: [E_RULES.startPower, E_RULES.startPower],
      imag: [E_RULES.startImag, E_RULES.startImag],
      stats: { played: 0, simmed: 0, won: 0, lost: 0, captured: 0, cards: 0 },
      event: null, // { kind:'vacuum', phase:'warn'|'active', route, left }
      crown: { owner: -1, turns: 0 }, // §16 Crown Victory tracker
      aiIntent: null,                  // rival's current target (Master Plan reveals it)
      warned: {}, lastLoot: null,      // victory telegraphs + newest card won
      upgrades: [[], []],
      nodes: Object.fromEntries(Object.keys(E_NODES).map((id) => [id, {
        owner: id === 'CAP_A' ? 0 : id === 'CAP_B' ? 1 : -1,
        garrison: null, looted: false, modules: [],
      }])),
      armies: [],
      nextCard: [0, 0],
      encounters: [], // queued this battle window
      pendingPlay: null, // BattleContext handed to the RTS (survives reload)
      returnToMap: false,
      log: [], over: false, winner: null, sunrise: false,
    };
    this.rng = makeRng(seed);
    // build the opening armies from card keys (deriving type/hp/vet per card)
    for (const owner of [0, 1]) {
      const node = owner === 0 ? 'CAP_A' : 'CAP_B';
      this.s.armies.push({ id: 'A' + owner, owner, node, prev: node, mp: E_RULES.armyMP, marched: false,
        cards: E_START_ROSTER.map((key) => this.makeArmyCard(key, `A${owner}c${this.s.nextCard[owner]++}`, owner)), order: null });
    }
    this.s.rng = this.rng.getState();
    this.say(`🌙 The Bedroom War begins. ${this.facLabel(0)} vs ${this.facLabel(1)} — first to ${E_RULES.dominionNeed} territories.`);
    this.upkeep();
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
    save.v = 5;
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
    const cap = p === 0 ? 'CAP_A' : 'CAP_B';
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
    let inc = 0;
    for (const [id, st] of Object.entries(this.s.nodes)) {
      if (st.owner !== p) continue;
      inc += supplied.has(id) ? E_NODES[id].yield : Math.floor(E_NODES[id].yield / 2);
      // a Workshop module runs whenever the node is supplied
      if (supplied.has(id)) for (const k of (st.modules || [])) if (E_MODULES[k].parts_yield) inc += E_MODULES[k].parts_yield;
    }
    // Industry II: the capital runs a second workshop shift
    const cap = p === 0 ? 'CAP_A' : 'CAP_B';
    if (this.s.upgrades[p].includes('workshop') && this.s.nodes[cap].owner === p && supplied.has(cap)) inc += E_RULES.workshopBonus;
    return inc;
  }
  powerIncome(p, sup = null) {
    const supplied = sup || this.suppliedSet(p);
    let inc = 0;
    for (const [id, st] of Object.entries(this.s.nodes)) {
      if (st.owner === p && supplied.has(id)) inc += E_NODES[id].powerYield || 0;
    }
    return inc;
  }
  imagIncome(p, sup = null) {
    const supplied = sup || this.suppliedSet(p);
    let inc = 0;
    for (const [id, st] of Object.entries(this.s.nodes)) {
      if (st.owner === p && supplied.has(id)) inc += E_NODES[id].imagYield || 0;
    }
    return inc;
  }
  ownerPowerMul(owner) { return this.s.upgrades[owner] && this.s.upgrades[owner].includes('combined') ? E_RULES.combinedArmsMul : 1; }
  // routes still usable this turn (the vacuum can close one)
  openRoutesOf(id) {
    const blocked = this.s.event && this.s.event.phase === 'active' ? this.s.event.route : -1;
    return E_ROUTES.map((r, i) => ({ r, i })).filter(({ r, i }) => i !== blocked && (r[0] === id || r[1] === id))
      .map(({ r }) => ({ to: r[0] === id ? r[1] : r[0], kind: r[2], cost: E_RULES.routeCost[r[2]] }));
  }
  upkeepCost(p) {
    let cards = 0;
    for (const a of this.s.armies) if (a.owner === p) cards += a.cards.length;
    return Math.floor(cards / 2);
  }
  armiesOf(p) { return this.s.armies.filter((a) => a.owner === p && a.cards.length); }
  // deterministic state fingerprint for tests + future MP hash checks
  stateHash() {
    const core = { t: this.s.turn, p: this.s.parts, pw: this.s.power, im: this.s.imag, u: this.s.upgrades, r: this.s.rng,
      cr: this.s.crown.owner + ':' + this.s.crown.turns, ev: this.s.event ? this.s.event.route + this.s.event.phase : '',
      lt: this.s.lastLoot ? this.s.lastLoot.key : '',
      n: Object.entries(this.s.nodes).map(([k, v]) => k + v.owner + (v.garrison ? v.garrison.length : '') + (v.modules || []).join('')),
      a: this.s.armies.map((a) => a.id + a.node + a.cards.map((c) => (c.key || c.type) + c.strength + c.vet).join('')) };
    const str = JSON.stringify(core);
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) | 0;
    return h;
  }

  // ---------- turn phases (§6, slice: sequential resolution) ----------
  upkeep() {
    this.tickEvent();
    for (const p of [0, 1]) {
      const sup = this.suppliedSet(p);
      this.s.parts[p] += this.income(p, sup) - this.upkeepCost(p);
      if (this.s.parts[p] < 0) this.s.parts[p] = 0;
      this.s.power[p] = Math.min(E_RULES.powerCap, this.s.power[p] + this.powerIncome(p, sup));
      this.s.imag[p] += this.imagIncome(p, sup); // Imagination is the long game — no cap
      const relayMP = E_RULES.armyMP + (this.s.upgrades[p].includes('relay') ? E_RULES.relayMP : 0);
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
        }
      }
    }
    this.s.phase = 'plan';
    this.save();
  }

  // "The Vacuum Approaches" (§5): telegraphed a full turn before it sweeps a
  // route closed. All rolls come from the campaign stream — seeded, replayable.
  tickEvent() {
    const ev = this.s.event;
    if (ev) {
      if (ev.phase === 'warn') {
        ev.phase = 'active';
        ev.left = E_RULES.vacuum.duration;
        const [a, b] = E_ROUTES[ev.route];
        this.say(`🌪️ THE VACUUM sweeps the ${E_NODES[a].name} — ${E_NODES[b].name} road! Closed for ${ev.left} turns.`);
      } else if (--ev.left <= 0) {
        this.s.event = null;
        this.say('🌤️ The vacuum returns to its closet. The road reopens.');
      }
      return;
    }
    if (this.s.turn >= E_RULES.vacuum.earliest && this.rng() < E_RULES.vacuum.chance) {
      const route = (this.rng() * E_ROUTES.length) | 0;
      this.s.event = { kind: 'vacuum', phase: 'warn', route, left: 0 };
      const [a, b] = E_ROUTES[route];
      this.say(`⚠️ A distant RUMBLE… the vacuum eyes the ${E_NODES[a].name} — ${E_NODES[b].name} road. One turn to react!`);
    }
  }

  // legal one-step moves for an army (UI highlights; orders validated the same way)
  reachable(army) {
    return this.openRoutesOf(army.node).filter((r) => r.cost <= army.mp);
  }

  // Force March (§6): burn 1 Power for +1 MP, once per army per turn
  forceMarch(armyId) {
    const a = this.s.armies.find((x) => x.id === armyId);
    if (!a || a.marched || this.s.phase !== 'plan') return { ok: false, why: 'already marched' };
    if (this.s.power[a.owner] < E_RULES.forceMarchCost) return { ok: false, why: 'not enough Power' };
    this.s.power[a.owner] -= E_RULES.forceMarchCost;
    a.mp += 1;
    a.marched = true;
    this.say(`${this.facLabel(a.owner)} winds their toys tight — a forced march!`);
    this.save();
    return { ok: true };
  }

  // Muster (§11): a second army at the capital, once the empire can feed it
  muster(p) {
    const cap = p === 0 ? 'CAP_A' : 'CAP_B';
    if (this.armiesOf(p).length >= E_RULES.maxArmies) return { ok: false, why: 'army cap reached' };
    if (this.ownedCount(p) < E_RULES.musterMinNodes) return { ok: false, why: `need ${E_RULES.musterMinNodes} territories` };
    if (this.s.parts[p] < E_RULES.musterCost) return { ok: false, why: 'not enough Parts' };
    this.s.parts[p] -= E_RULES.musterCost;
    // dead armies stay as tombstones, so the per-owner count yields a unique,
    // deterministic id even when a destroyed army is replaced (B0, then B0_2…)
    const nth = this.s.armies.filter((a) => a.owner === p).length;
    const id = nth <= 1 ? `B${p}` : `B${p}_${nth}`;
    this.s.armies.push({ id, owner: p, node: cap, prev: cap, mp: E_RULES.armyMP, marched: false,
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
    const cap = p === 0 ? 'CAP_A' : 'CAP_B';
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

  // ---- stronghold modules (§8) ----
  moduleSlots(nodeId) { return E_MODULE_SLOTS[E_NODES[nodeId].type] || 0; }
  hasModule(nodeId, key) { return (this.s.nodes[nodeId].modules || []).includes(key); }
  buildModule(p, nodeId, key) {
    const st = this.s.nodes[nodeId], mod = E_MODULES[key];
    if (!mod || st.owner !== p) return { ok: false, why: 'not yours' };
    if (this.s.phase !== 'plan') return { ok: false, why: 'plan phase only' };
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
    const cap = p === 0 ? 'CAP_A' : 'CAP_B';
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
    if (this.s.parts[p] < u.parts) return { ok: false, why: 'not enough Parts' };
    if (this.s.imag[p] < u.imag) return { ok: false, why: 'not enough Imagination' };
    this.s.parts[p] -= u.parts;
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
    for (const a of this.armiesOf(0)) this.resolveMove(a);
    this.aiPlan();
    for (const a of this.armiesOf(1)) this.resolveMove(a);
    this.s.phase = 'battle';
    this.save();
    this.autoResolveAiBattles();
    if (!this.s.encounters.length) this.aftermath();
  }

  resolveMove(army) {
    if (!army || !army.order || !army.cards.length) return;
    const { to, cost } = army.order;
    army.order = null;
    army.mp -= cost;
    army.prev = army.node;
    army.node = to;
    const st = this.s.nodes[to];
    const hostileArmy = this.s.armies.find((a) => a.owner !== army.owner && a.node === to && a.cards.length);
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
    const enc = {
      encId: `e_t${this.s.turn}_${nodeId}_${attArmy.id}`,
      seed: deriveSeed(this.s.seed, this.s.turn, nodeId + attArmy.id),
      nodeId, template: tKey,
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
    const att = this.s.armies.find((a) => a.id === enc.attacker.armyId);
    const def = enc.defender.armyId
      ? this.s.armies.find((a) => a.id === enc.defender.armyId)
      : { cards: this.s.nodes[enc.nodeId].garrison || [] };
    return { attCards: att ? att.cards : [], defCards: def ? def.cards : [] };
  }
  preview(enc) {
    const { attCards, defCards } = this.encCards(enc);
    const t = E_TEMPLATES[enc.template];
    const defOwner = enc.defender.owner;
    // Block Walls help whoever HOLDS the contested node (the node's owner defending)
    const wallMul = (defOwner >= 0 && this.s.nodes[enc.nodeId].owner === defOwner) ? 1 + this.moduleDefBonus(enc.nodeId) : 1;
    const defMul = (t.defBoost || 1) * (E_NODES[enc.nodeId].tier ? 1 + 0.1 * E_NODES[enc.nodeId].tier : 1)
      * (defOwner >= 0 ? this.ownerPowerMul(defOwner) : 1) * wallMul;
    const ap = this.cardsPower(attCards) * this.ownerPowerMul(enc.attacker.owner), dp = this.cardsPower(defCards) * defMul;
    const ratio = ap / Math.max(0.001, dp);
    const band = ratio > 2 ? 'Overwhelming' : ratio > 1.35 ? 'Favored' : ratio > 0.8 ? 'Even' : ratio > 0.55 ? 'Risky' : 'Desperate';
    const loss = ratio > 2 ? 'light' : ratio > 1.2 ? 'moderate' : 'heavy';
    return { band, ratio, attPower: ap, defPower: dp, lossHint: loss, template: t, defMul };
  }

  // deterministic seeded resolution — same source stats as played battles,
  // bounded variance (±8%), never rerolled: the seed locked at creation
  simulate(enc) {
    const { attCards, defCards } = this.encCards(enc);
    const rng = makeRng(enc.seed);
    const vary = () => 1 + (rng() * 2 - 1) * E_RULES.simVariance;
    const p = this.preview(enc);
    const attMul = this.ownerPowerMul(enc.attacker.owner);
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
    enc.applied = true;
    // the campaign remembers how its wars were fought (victory-screen stats)
    if (enc.attacker.owner === 0 || enc.defender.owner === 0) {
      this.s.stats[result.mode === 'played' ? 'played' : 'simmed']++;
      const humanWon = result.attackerWon === (enc.attacker.owner === 0);
      this.s.stats[humanWon ? 'won' : 'lost']++;
      if (humanWon) this.awardLoot(enc); // spoils of war → a card + scraps
    }
    const att = this.s.armies.find((a) => a.id === enc.attacker.armyId);
    const st = this.s.nodes[enc.nodeId];
    if (att) att.cards = result.attCards.map((c) => ({ ...c }));
    if (enc.defender.armyId) {
      const def = this.s.armies.find((a) => a.id === enc.defender.armyId);
      if (def) def.cards = result.defCards.map((c) => ({ ...c }));
    } else if (st.garrison) {
      st.garrison = result.defCards.map((c) => ({ ...c }));
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
    if (loot) this.s.parts[p] += loot;
    if (!wasBattle) this.say(`${node.icon} ${this.facLabel(p)} claims ${node.name}${loot ? ` (+${loot} Parts)` : ''}.`);
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
    // victory checks resolve together at the phase boundary (§16)
    for (const p of [0, 1]) {
      const capId = p === 0 ? 'CAP_A' : 'CAP_B';
      if (this.s.nodes[capId].owner !== p) { this.finish(1 - p, 'capital'); return; }
    }
    for (const p of [0, 1]) {
      if (this.s.crown.owner === p && this.s.crown.turns >= E_RULES.crownNeed) { this.finish(p, 'crown'); return; }
      if (this.ownedCount(p) >= E_RULES.dominionNeed && this.fortCount(p) >= E_RULES.dominionForts) { this.finish(p, 'dominion'); return; }
    }
    if (this.s.turn >= E_RULES.turnCap) {
      const d0 = this.ownedCount(0), d1 = this.ownedCount(1);
      this.finish(d0 === d1 ? (this.s.parts[0] >= this.s.parts[1] ? 0 : 1) : (d0 > d1 ? 0 : 1), 'sunrise');
      return;
    }
    // telegraph any rival within victoryWarn turns of a win (once each)
    const rt = this.turnsToWin(1);
    if (rt <= E_RULES.victoryWarn && rt > 0) {
      const k = 'winwarn' + this.s.turn;
      if (!this.s.warned[k]) { this.s.warned[k] = true; this.say(`⏳ ${this.facLabel(1)} is ${rt} turn${rt > 1 ? 's' : ''} from victory — disrupt them!`); }
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
  aiRecruitKey() {
    const t = this.s.turn, n = this.s.nextCard[1];
    const pool = t >= 12 ? ['sarge', 'knight', 'teddy', 'grenadier']
      : t >= 7 ? ['grenadier', 'raider', 'flinger', 'archer']
        : ['recruit', 'archer', 'spear'];
    return pool[n % pool.length];
  }

  // ---------- strategic AI seat (§21: legal orders, same rules) ----------
  aiPlan() {
    const p = 1;
    if (this.s.over) return;
    const home = 'CAP_B';
    // strategic buys happen once per turn, not per army
    if (this.armiesOf(p).some((a) => a.node === home)) {
      const capArmy = this.armiesOf(p).find((a) => a.node === home);
      // recruit scales with the night so a card-stocked player still gets a fight
      while (this.s.parts[p] >= E_RULES.recruitCost + 20 && capArmy.cards.length < 6) this.recruit(p, capArmy.id, this.aiRecruitKey());
      // climb the empire tree in a fixed priority when it can afford a node
      for (const key of ['salvage', 'reserves', 'relay', 'workshop', 'combined']) {
        const u = E_UPGRADES[key];
        if (this.s.upgrades[p].includes(key)) continue;
        if (u.prereq && !this.s.upgrades[p].includes(u.prereq)) continue;
        if (this.s.parts[p] >= u.parts + 40 && this.s.imag[p] >= u.imag) { this.buyUpgrade(p, key); break; }
      }
    }
    // fortify its strongholds: Block Walls first, then a Workshop
    for (const [id, st] of Object.entries(this.s.nodes)) {
      if (st.owner !== p || this.moduleSlots(id) === 0) continue;
      for (const mk of ['walls', 'workshop']) {
        if (this.hasModule(id, mk) || st.modules.length >= this.moduleSlots(id)) continue;
        if (this.s.parts[p] >= E_MODULES[mk].parts + 25 && this.s.imag[p] >= (E_MODULES[mk].imag || 0)) { this.buildModule(p, id, mk); break; }
      }
    }
    // muster a second front once the empire can feed it
    if (this.armiesOf(p).length < E_RULES.maxArmies && this.ownedCount(p) >= E_RULES.musterMinNodes
        && this.s.parts[p] >= E_RULES.musterCost + 60) this.muster(p);
    // the human is one turn from crowning — the AI drops everything to contest it
    const crownRush = this.s.crown.owner === 0 && this.s.crown.turns >= E_RULES.crownNeed - 2
      && this.s.nodes[E_RULES.crownNode].owner !== 1;
    const claimed = new Set(); // two armies never chase the same prize
    let firstTarget = null;
    for (const a of this.armiesOf(p)) {
      // recover: hurt or thin army heads home to heal + recruit
      const avgStr = a.cards.reduce((s, c) => s + c.strength, 0) / a.cards.length;
      if ((a.cards.length <= 2 || avgStr < 45) && a.node !== home && !crownRush) { this.aiMoveToward(a, home); continue; }
      if (crownRush && !claimed.has(E_RULES.crownNode)) { claimed.add(E_RULES.crownNode); firstTarget = firstTarget || E_RULES.crownNode; this.aiMoveToward(a, E_RULES.crownNode); continue; }
      // defend: an enemy army adjacent to home pulls one army back
      const threat = this.armiesOf(0).some((h) => routesOf(home).some((r) => r.to === h.node));
      if (threat && a.node !== home && !claimed.has(home)) { claimed.add(home); this.aiMoveToward(a, home); continue; }
      // expand/attack: nearest valuable node, Favored+ fights only
      const target = this.aiPickTarget(a, claimed);
      if (target) { claimed.add(target); firstTarget = firstTarget || target; this.aiMoveToward(a, target); }
    }
    this.s.aiIntent = firstTarget; // Master Plan surfaces this to the player
  }
  aiPickTarget(a, claimed = new Set()) {
    const scores = [];
    for (const [id, st] of Object.entries(this.s.nodes)) {
      if (st.owner === 1 || claimed.has(id)) continue;
      const n = E_NODES[id];
      let v = n.yield + (n.type === 'stronghold' ? 8 : 0) + (n.dominion ? 6 : 0) + (n.bonus ? 5 : 0)
        + (n.type === 'crown' ? 10 : 0) + (n.imagYield || 0) * 2;
      const dist = this.hopDistance(a.node, id);
      if (dist === null) continue;
      scores.push({ id, score: v - dist * 2 });
    }
    scores.sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1)); // deterministic
    for (const c of scores) {
      const st = this.s.nodes[c.id];
      const defended = st.owner === 0 || this.armyAt(c.id) || E_GARRISONS[E_NODES[c.id].type];
      if (!defended) return c.id;
      // fake an encounter to read the preview band before committing
      const defCards = this.armyAt(c.id) && this.armyAt(c.id).owner === 0 ? this.armyAt(c.id).cards
        : (this.s.nodes[c.id].garrison || (E_GARRISONS[E_NODES[c.id].type] || []).map((g) => ({ type: g.type, strength: 100, vet: 0 })));
      const tKey = E_NODE_TEMPLATE_OVERRIDE[c.id] || E_NODE_TEMPLATE[E_NODES[c.id].type] || 'field';
      const defMul = (E_TEMPLATES[tKey].defBoost || 1) * (E_NODES[c.id].tier ? 1 + 0.1 * E_NODES[c.id].tier : 1);
      const ratio = this.cardsPower(a.cards) / Math.max(0.001, this.cardsPower(defCards) * defMul);
      if (ratio > 1.35) return c.id;
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
    const t = E_TEMPLATES[enc.template];
    const humanIsAttacker = enc.attacker.owner === 0;
    return {
      encId: enc.encId, seed: enc.seed, nodeId: enc.nodeId,
      map: E_NODES[enc.nodeId].biome, gameMode: t.gameMode, startRes: t.startRes,
      difficulty: 'normal',
      humanIsAttacker,
      humanFaction: this.facKey(0), aiFaction: this.facKey(1),
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
  constructor(emp) {
    this.emp = emp;
    this.sel = null;     // selected army id
    this.selNode = null; // inspected node id (side-panel intel card)
    this.launchCtx = null;
    this.lastPos = {};   // armyId -> {x,y} for march animations
    this.root = document.getElementById('empire');
  }
  show() {
    this.root.classList.add('show');
    this.render();
    const enc = this.emp.nextEncounter();
    if (enc) this.showEncounter(enc); // resume mid battle-window after a reload
  }
  hide() { this.root.classList.remove('show'); ui = null; }

  armyPos(a) {
    const n = E_NODES[a.node];
    const dx = a.owner === 0 ? -30 : 30;
    const dy = a.id.startsWith('B') ? 26 : -26; // second armies ride below the node
    return { x: n.mx + dx, y: n.my + dy };
  }

  render() {
    const emp = this.emp, s = emp.s;
    const nodePos = (id) => E_NODES[id];
    const supplied = emp.suppliedSet(0);
    const ev = s.event;
    const routeSvg = E_ROUTES.map(([a, b, kind], i) => {
      const A = nodePos(a), B = nodePos(b);
      const evc = ev && ev.route === i ? (ev.phase === 'active' ? ' blocked' : ' warned') : '';
      let extra = '';
      if (ev && ev.route === i) {
        extra = `<text x="${(A.mx + B.mx) / 2}" y="${(A.my + B.my) / 2 - 6}" text-anchor="middle" class="e-ev-ic">${ev.phase === 'active' ? '🌪️' : '⚠️'}</text>`;
      }
      return `<line x1="${A.mx}" y1="${A.my}" x2="${B.mx}" y2="${B.my}" class="e-route ${kind}${evc}"/>${extra}`;
    }).join('');
    const orderSvg = s.armies.filter((a) => a.order).map((a) => {
      const A = nodePos(a.node), B = nodePos(a.order.to);
      return `<line x1="${A.mx}" y1="${A.my}" x2="${B.mx}" y2="${B.my}" class="e-order" marker-end="url(#e-arrow)"/>`;
    }).join('');
    const selArmy = s.armies.find((a) => a.id === this.sel);
    const reach = selArmy && s.phase === 'plan' ? emp.reachable(selArmy).map((r) => r.to) : [];
    const knowsAiTarget = s.upgrades[0].includes('masterplan') && s.aiIntent;
    const nodeSvg = Object.entries(E_NODES).map(([id, n]) => {
      const st = s.nodes[id];
      const ring = st.owner === -1 ? '#7a6a52' : emp.facColor(st.owner);
      const hot = reach.includes(id) ? ' hot' : '';
      const insp = this.selNode === id ? ' insp' : '';
      const unsup = st.owner === 0 && !supplied.has(id);
      const crownProg = n.type === 'crown' && s.crown.owner !== -1 && s.crown.turns > 0
        ? `<text y="-32" text-anchor="middle" class="e-crownmark" style="fill:${emp.facColor(s.crown.owner)}">👑${s.crown.turns}/${E_RULES.crownNeed}</text>`
        : (n.type === 'crown' ? '<text y="-32" text-anchor="middle" class="e-crownmark">👑</text>' : '');
      const aimark = knowsAiTarget && s.aiIntent === id ? '<text x="-20" y="-18" class="e-supwarn">🎯</text>' : '';
      const mods = (st.modules || []).length ? `<text x="22" y="24" class="e-modmark">${(st.modules || []).map((k) => E_MODULES[k].icon).join('')}</text>` : '';
      return `<g class="e-node${hot}${insp}" data-node="${id}" transform="translate(${n.mx},${n.my})">
        ${st.owner !== -1 ? `<circle r="31" class="e-node-halo" style="fill:${emp.facColor(st.owner)}18"/>` : ''}
        <circle r="26" class="e-node-c${unsup ? ' unsup' : ''}" style="stroke:${ring}"/>
        <text y="7" text-anchor="middle" class="e-node-ic">${n.icon}</text>
        <text y="44" text-anchor="middle" class="e-node-lb">${n.name}</text>
        ${crownProg}${aimark}${mods}
        ${unsup ? '<text x="20" y="-18" class="e-supwarn">✂️</text>' : ''}
      </g>`;
    }).join('');
    const armySvg = s.armies.filter((a) => a.cards.length).map((a) => {
      const p = this.armyPos(a);
      const selC = a.id === this.sel ? ' sel' : '';
      const str = Math.round(a.cards.reduce((t, c) => t + c.strength, 0) / a.cards.length);
      return `<g class="e-army${selC}" data-army="${a.id}" transform="translate(${p.x},${p.y})">
        <circle r="13" style="fill:${emp.facColor(a.owner)}"/>
        <text y="4" text-anchor="middle" class="e-army-n">${a.cards.length}</text>
        <rect x="-11" y="15" width="22" height="3" rx="1.5" class="e-army-hpbg"/>
        <rect x="-11" y="15" width="${(22 * str / 100).toFixed(1)}" height="3" rx="1.5" class="e-army-hp"/>
      </g>`;
    }).join('');

    const owned0 = s.upgrades[0].length;
    const logHtml = s.log.slice(-7).reverse().map((l) => `<div><b>T${l.t}</b> ${l.msg}</div>`).join('');
    const sup0 = supplied;
    const crownChip = s.crown.owner !== -1 && s.crown.turns > 0
      ? `<span class="e-chip" title="Hold the Storybook Tower crown ${E_RULES.crownNeed} turns to win" style="border-color:${emp.facColor(s.crown.owner)}">👑 <b>${s.crown.turns}</b>/${E_RULES.crownNeed} <span class="e-dim">${s.crown.owner === 0 ? 'you' : 'rival'}</span></span>`
      : '';
    const evBanner = ev
      ? `<div class="e-event ${ev.phase}">${ev.phase === 'warn'
        ? '⚠️ A distant rumble — the vacuum comes for a road next turn!'
        : `🌪️ The vacuum blocks a road — ${ev.left} turn${ev.left > 1 ? 's' : ''} left`}</div>`
      : '';
    const phaseLbl = s.over ? '🌅 The war is over' : s.phase === 'plan' ? '📝 Give your orders, Commander' : '⚔️ Battles rage…';

    this.root.innerHTML = `
      <div class="e-top">
        <button id="e-back" class="diff-btn">← Menu</button>
        <span class="e-chip" title="Parts: build, recruit, upgrade">🔩 <b>${s.parts[0]}</b> <span class="e-dim">+${emp.income(0, sup0) - emp.upkeepCost(0)}/t</span></span>
        <span class="e-chip" title="Power: force marches (cap ${E_RULES.powerCap})">🔋 <b>${s.power[0]}</b><span class="e-dim">/${E_RULES.powerCap}</span></span>
        <span class="e-chip" title="Imagination: the empire tree's currency">💡 <b>${s.imag[0]}</b> <span class="e-dim">+${emp.imagIncome(0, sup0)}/t</span></span>
        <span class="e-chip" title="Territories held — first to ${E_RULES.dominionNeed} with a stronghold wins">🗺️ <b>${emp.ownedCount(0)}</b> vs ${emp.ownedCount(1)} <span class="e-dim">of ${E_RULES.dominionNeed}</span></span>
        ${crownChip}
        <span class="e-chip">🌙 Turn <b>${s.turn}</b><span class="e-dim">/${E_RULES.turnCap}</span></span>
        <span class="e-phase">${phaseLbl}</span>
        <span class="e-spring"></span>
        <button id="e-new" class="diff-btn" title="Abandon this war and start fresh">🔄 New War</button>
      </div>
      ${evBanner}
      <div class="e-main">
        <svg id="e-board" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet">
          <defs><marker id="e-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#ffd97a"/></marker></defs>
          <image href="assets/ui/empire-board.jpg" x="0" y="0" width="1000" height="560" preserveAspectRatio="xMidYMid slice" opacity="0.62"/>
          <rect x="0" y="0" width="1000" height="560" fill="#16100a" opacity="0.28"/>
          ${routeSvg}${orderSvg}${nodeSvg}${armySvg}
        </svg>
        <div class="e-side">${this.sidePanel(selArmy)}</div>
      </div>
      <div class="e-bottom">
        <button id="e-tree" class="diff-btn">🌳 Empire Tree <span class="e-dim">(${owned0}/8)</span></button>
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
      const atCap = selArmy.node === 'CAP_A';
      const canRec = emp.canRecruitAt(0, selArmy.node);
      const mpPips = '●'.repeat(selArmy.mp) + '○'.repeat(Math.max(0, E_RULES.armyMP + (selArmy.marched ? 1 : 0) - selArmy.mp));
      const canMuster = emp.armiesOf(0).length < E_RULES.maxArmies
        && emp.ownedCount(0) >= E_RULES.musterMinNodes && s.parts[0] >= E_RULES.musterCost;
      return `<div class="e-panel">
        <div class="e-ttl">🚩 ${selArmy.id.startsWith('B') ? 'Second Army' : 'Grand Army'} — ${E_NODES[selArmy.node].name}</div>
        <div class="e-dim">March ${mpPips} · ${selArmy.cards.length}/${E_RULES.maxCards} toys
        ${selArmy.order ? ` · → ${E_NODES[selArmy.order.to].name}` : ''}</div>
        ${cards}
        <button id="e-recruit" class="diff-btn" ${canRec && selArmy.cards.length < E_RULES.maxCards ? '' : 'disabled'}
          title="${canRec ? 'Field a collection card here' : 'Recruit at your capital or a Barracks'}">➕ Field a Card…</button>
        <button id="e-march" class="diff-btn" ${!selArmy.marched && s.power[0] >= E_RULES.forceMarchCost && s.phase === 'plan' ? '' : 'disabled'}
          title="+1 movement this turn">🔋 Force March (${E_RULES.forceMarchCost}⚡)</button>
        ${atCap ? `<button id="e-muster" class="diff-btn" ${canMuster ? '' : 'disabled'}
          title="A second army — needs ${E_RULES.musterMinNodes} territories">🚩 Muster 2nd Army (${E_RULES.musterCost}🔩)</button>` : ''}
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
      const near1 = routesOf(id).some((r) => s.nodes[r.to].owner === 0)
        || st.owner === 0 || emp.armiesOf(0).some((a) => a.node === id || routesOf(id).some((r) => r.to === a.node));
      const near2 = s.upgrades[0].includes('kites') && routesOf(id).some((r) => routesOf(r.to).some((r2) => s.nodes[r2.to].owner === 0));
      // a Watchtower you own reveals garrisons within two routes of the fort
      const near3 = routesOf(id).some((r) => (s.nodes[r.to].owner === 0 && emp.hasModule(r.to, 'watchtower'))
        || routesOf(r.to).some((r2) => s.nodes[r2.to].owner === 0 && emp.hasModule(r2.to, 'watchtower')));
      const adjacent = near1 || near2 || near3;
      let garrisonLine = '';
      if (st.owner !== 0) {
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
        if (st.owner === 0 && free > 0) {
          buildBtns = Object.entries(E_MODULES).filter(([k]) => !emp.hasModule(id, k)).map(([k, mod]) => {
            const afford = s.parts[0] >= mod.parts && s.imag[0] >= (mod.imag || 0);
            return `<button class="e-modbuild" data-node="${id}" data-mod="${k}" ${afford && s.phase === 'plan' ? '' : 'disabled'} title="${mod.desc}">
              ${mod.icon} ${mod.name} — ${mod.parts}🔩${mod.imag ? ` ${mod.imag}💡` : ''}</button>`;
          }).join('');
        }
        modBlock = `<div class="e-kv"><span>Modules</span><b>${(st.modules || []).length}/${slots}</b></div>
          ${built ? `<div class="e-mods">${built}</div>` : ''}
          ${buildBtns ? `<div class="e-dim" style="margin-top:2px">Build:</div><div class="e-modbuilds">${buildBtns}</div>` : (st.owner === 0 && free === 0 ? '<div class="e-dim">All sockets full.</div>' : '')}`;
      }
      return `<div class="e-panel">
        <div class="e-ttl">${n.icon} ${n.name}</div>
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
    this.root.querySelector('#e-new').addEventListener('click', () => {
      if (this.confirmNew) { Empire.clear(); this.emp = new Empire(); this.sel = null; this.selNode = null; this.lastPos = {}; this.confirmNew = false; this.render(); }
      else { this.confirmNew = true; this.root.querySelector('#e-new').textContent = '⚠ Sure? Click again'; }
    });
    const endBtn = this.root.querySelector('#e-end');
    if (endBtn) endBtn.addEventListener('click', () => {
      this.confirmNew = false;
      const capturedBefore = emp.s.stats.captured;
      const lootBefore = emp.loot.length;
      esfx('command', 120);
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
        if (!a || a.owner !== 0) return;
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
          const r = emp.issueMove(this.sel, id);
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
    act('#e-march', () => emp.forceMarch(this.sel), 'twang');
    act('#e-muster', () => emp.muster(0), 'charge');
    act('#e-cancel', () => emp.cancelMove(this.sel), 'select');
    const tree = this.root.querySelector('#e-tree');
    if (tree) tree.addEventListener('click', () => { esfx('select', 60); this.showTree(); });
    const cards = this.root.querySelector('#e-cards');
    if (cards) cards.addEventListener('click', () => { esfx('select', 60); this.showCollection(); });
    for (const b of this.root.querySelectorAll('.e-modbuild')) {
      b.addEventListener('click', () => { const r = emp.buildModule(0, b.dataset.node, b.dataset.mod); esfx(r.ok ? 'place' : 'error', 100); this.render(); });
    }
  }

  // recruit picker: field a card you own (commons always available)
  showRecruit() {
    const emp = this.emp, s = emp.s, armyId = this.sel;
    const list = Object.entries(E_CARDS)
      .filter(([k]) => ownsCard(emp.coll, k))
      .sort((a, b) => E_CARD_ORDER.indexOf(a[1].rarity) - E_CARD_ORDER.indexOf(b[1].rarity) || a[1].cost - b[1].cost)
      .map(([k, c]) => {
        const afford = s.parts[0] >= c.cost;
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
        const r = emp.recruit(0, armyId, b.dataset.card);
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

  // the Empire Tree modal (§10): four branches, two tiers, Parts + Imagination
  showTree() {
    const emp = this.emp, s = emp.s;
    const cols = Object.entries(E_BRANCHES).map(([bk, b]) => {
      const nodes = Object.entries(E_UPGRADES).filter(([, u]) => u.branch === bk).sort((a, c) => a[1].tier - c[1].tier);
      const cells = nodes.map(([k, u]) => {
        const owned = s.upgrades[0].includes(k);
        const locked = u.prereq && !s.upgrades[0].includes(u.prereq);
        const afford = s.parts[0] >= u.parts && s.imag[0] >= u.imag;
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
      <div class="e-dim">🔩 <b>${s.parts[0]}</b> Parts · 💡 <b>${s.imag[0]}</b> Imagination — spend them to shape a distinct empire.</div>
      <div class="e-tree">${cols}</div>
      <div class="e-enc-btns"><button id="e-tclose" class="diff-btn sel">Done</button></div>
    </div></div>`;
    for (const b of m.querySelectorAll('.e-tnode')) {
      b.addEventListener('click', () => {
        const r = emp.buyUpgrade(0, b.dataset.upg);
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
    if (!loot || this.emp.nextEncounter()) return;
    const c = E_CARDS[loot.key]; if (!c) return;
    const col = E_RARITY[c.rarity].color;
    const m = this.root.querySelector('#e-modal');
    m.innerHTML = `<div class="e-loot" style="border-color:${col}">
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
    const youAttack = enc.attacker.owner === 0;
    const { attCards, defCards } = emp.encCards(enc);
    const chip = (c) => `<span class="e-uchip" title="${UNITS[c.type].name} ${c.strength}%${c.vet ? ' · veteran' : ''}">
      ${UNITS[c.type].name.split(' ')[0]}${'★'.repeat(c.vet || 0)}<i style="width:${c.strength}%"></i></span>`;
    const yourCards = youAttack ? attCards : defCards;
    const theirCards = youAttack ? defCards : attCards;
    const m = this.root.querySelector('#e-modal');
    m.innerHTML = `<div class="e-enc">
      <div class="e-enc-card">
        <div class="e-ttl">${n.icon} ${youAttack ? 'Assault on' : 'Defend'} ${n.name}</div>
        <div class="e-dim">${p.template.label} · ~${p.template.time} if played · seed locked — no rerolls</div>
        <div class="e-band b-${p.band.toLowerCase()}">${p.band}</div>
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
      const humanWon = res.attackerWon === (enc.attacker.owner === 0);
      emp.finishEncounter(enc, res);
      esfx(humanWon ? 'place' : 'bonk', 100);
      this.render();
      const next = emp.nextEncounter();
      if (next) { esfx('charge', 200); this.showEncounter(next); }
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
    m.querySelector('#e-again').addEventListener('click', () => { Empire.clear(); this.emp = new Empire(); this.sel = null; this.selNode = null; this.lastPos = {}; this.render(); });
    m.querySelector('#e-out').addEventListener('click', () => this.hide());
  }
}

// headless determinism harness (§20 test): scripted human turns, auto-AI,
// all encounters simulated. Same seed + script ⇒ identical stateHash.
export function empireTest(seed, turns = 8, script = []) {
  const emp = new Empire(seed, undefined, false); // persist=false: never touches tt-empire
  const byTurn = {};
  for (const s of script) (byTurn[s.turn] = byTurn[s.turn] || []).push(s);
  for (let t = 0; t < turns && !emp.s.over; t++) {
    for (const s of (byTurn[emp.s.turn] || [])) {
      if (s.type === 'move') emp.issueMove(s.army || 'A0', s.to);
      if (s.type === 'recruit') emp.recruit(0, s.army || null);
      if (s.type === 'upgrade') emp.buyUpgrade(0, s.key);
      if (s.type === 'march') emp.forceMarch(s.army || 'A0');
      if (s.type === 'muster') emp.muster(0);
    }
    emp.endTurn();
    let guard = 0;
    let enc;
    while ((enc = emp.nextEncounter()) && guard++ < 10) emp.finishEncounter(enc, emp.simulate(enc));
  }
  return { hash: emp.stateHash(), turn: emp.s.turn, over: emp.s.over, winner: emp.s.winner,
    winHow: emp.s.winHow || null, owned: [emp.ownedCount(0), emp.ownedCount(1)],
    power: [...emp.s.power], imag: [...emp.s.imag], upgrades: emp.s.upgrades.map((u) => [...u]),
    crown: { ...emp.s.crown }, armies: emp.s.armies.map((a) => a.id + '@' + a.node + ':' + a.cards.length),
    stats: { ...emp.s.stats }, event: emp.s.event ? { ...emp.s.event } : null,
    lastLoot: emp.s.lastLoot ? emp.s.lastLoot.key : null, cardsWon: emp.loot.map((l) => l.key),
    log: emp.s.log.slice(-3) };
}
