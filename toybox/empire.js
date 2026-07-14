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
  E_FACTIONS, E_START_ROSTER, E_GARRISONS, E_UPGRADES, E_RULES, E_SIM,
} from './empire-data.js';

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
    this.persist = persist; // headless tests run with persist=false (never touch tt-empire)
    if (seedOrSave && typeof seedOrSave === 'object') { this.load(seedOrSave); return; }
    const seed = seedOrSave || ((Math.random() * 2 ** 31) | 0);
    this.s = {
      v: 1, seed, turn: 1, phase: 'plan', rng: 0,
      factions, // seat 0 = human, seat 1 = AI
      parts: [E_RULES.startParts, E_RULES.startParts],
      upgrades: [[], []],
      nodes: Object.fromEntries(Object.keys(E_NODES).map((id) => [id, {
        owner: id === 'CAP_A' ? 0 : id === 'CAP_B' ? 1 : -1,
        garrison: null, looted: false,
      }])),
      armies: [
        { id: 'A0', owner: 0, node: 'CAP_A', prev: 'CAP_A', mp: E_RULES.armyMP, cards: E_START_ROSTER.map((c, i) => ({ id: 'A0c' + i, ...c })), order: null },
        { id: 'A1', owner: 1, node: 'CAP_B', prev: 'CAP_B', mp: E_RULES.armyMP, cards: E_START_ROSTER.map((c, i) => ({ id: 'A1c' + i, ...c })), order: null },
      ],
      nextCard: [E_START_ROSTER.length, E_START_ROSTER.length],
      encounters: [], // queued this battle window
      pendingPlay: null, // BattleContext handed to the RTS (survives reload)
      returnToMap: false,
      log: [], over: false, winner: null, sunrise: false,
    };
    this.rng = makeRng(seed);
    this.s.rng = this.rng.getState();
    this.say(`🌙 The Bedroom War begins. ${this.facLabel(0)} vs ${this.facLabel(1)} — first to ${E_RULES.dominionNeed} territories.`);
    this.upkeep();
  }

  // ---------- persistence (§20: save at every phase boundary) ----------
  save() {
    this.s.rng = this.rng.getState();
    if (!this.persist) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch (e) { /* storage full */ }
  }
  load(save) { this.s = save; this.rng = makeRng(1); this.rng.setState(save.rng); }
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
  income(p) {
    let inc = 0;
    for (const [id, st] of Object.entries(this.s.nodes)) if (st.owner === p) inc += E_NODES[id].yield;
    return inc;
  }
  upkeepCost(p) {
    const a = this.s.armies.find((x) => x.owner === p);
    return a ? Math.floor(a.cards.length / 2) : 0;
  }
  // deterministic state fingerprint for tests + future MP hash checks
  stateHash() {
    const core = { t: this.s.turn, p: this.s.parts, u: this.s.upgrades, r: this.s.rng,
      n: Object.entries(this.s.nodes).map(([k, v]) => k + v.owner + (v.garrison ? v.garrison.length : '')),
      a: this.s.armies.map((a) => a.id + a.node + a.cards.map((c) => c.type + c.strength + c.vet).join('')) };
    const str = JSON.stringify(core);
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) | 0;
    return h;
  }

  // ---------- turn phases (§6, slice: sequential resolution) ----------
  upkeep() {
    for (const p of [0, 1]) {
      this.s.parts[p] += this.income(p) - this.upkeepCost(p);
      if (this.s.parts[p] < 0) this.s.parts[p] = 0;
    }
    for (const a of this.s.armies) {
      a.mp = E_RULES.armyMP;
      a.order = null;
      // resting on friendly ground mends the toys (§11 readiness, simplified)
      const st = this.s.nodes[a.node];
      if (st && st.owner === a.owner) {
        const heal = E_RULES.healPerTurn + (this.s.upgrades[a.owner].includes('repairs') ? 10 : 0);
        for (const c of a.cards) c.strength = Math.min(100, c.strength + heal);
      }
    }
    this.s.phase = 'plan';
    this.save();
  }

  // legal one-step moves for an army (UI highlights; orders validated the same way)
  reachable(army) {
    return routesOf(army.node).filter((r) => r.cost <= army.mp);
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

  recruit(p) {
    const a = this.s.armies.find((x) => x.owner === p);
    const cap = p === 0 ? 'CAP_A' : 'CAP_B';
    if (!a || a.node !== cap) return { ok: false, why: 'army must stand at your capital' };
    if (a.cards.length >= E_RULES.maxCards) return { ok: false, why: 'army is at full strength' };
    if (this.s.parts[p] < E_RULES.recruitCost) return { ok: false, why: 'not enough Parts' };
    this.s.parts[p] -= E_RULES.recruitCost;
    const types = ['soldier', 'archer', 'spear'];
    const type = types[this.s.nextCard[p] % types.length];
    a.cards.push({ id: `A${p}c${this.s.nextCard[p]++}`, type, strength: 100,
      vet: this.s.upgrades[p].includes('reserves') ? 1 : 0 });
    this.say(`${this.facLabel(p)} recruits a fresh ${UNITS[type].name}.`);
    this.save();
    return { ok: true };
  }

  buyUpgrade(p, key) {
    const u = E_UPGRADES[key];
    if (!u || this.s.upgrades[p].includes(key)) return { ok: false, why: 'already owned' };
    if (this.s.parts[p] < u.cost) return { ok: false, why: 'not enough Parts' };
    this.s.parts[p] -= u.cost;
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
    this.resolveMove(this.s.armies.find((a) => a.owner === 0));
    this.aiPlan();
    this.resolveMove(this.s.armies.find((a) => a.owner === 1));
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
    for (const c of cards) p += this.unitPower(c.type) * (c.strength / 100) * (1 + E_RULES.vetPowerBonus * (c.vet || 0));
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
    const defMul = (t.defBoost || 1) * (E_NODES[enc.nodeId].tier ? 1 + 0.1 * E_NODES[enc.nodeId].tier : 1);
    const ap = this.cardsPower(attCards), dp = this.cardsPower(defCards) * defMul;
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
    let att = attCards.map((c) => ({ ...c })), def = defCards.map((c) => ({ ...c }));
    for (let round = 0; round < 3; round++) {
      const ap = this.cardsPower(att) * vary();
      const dp = this.cardsPower(def) * p.defMul * vary();
      this.dealLosses(def, ap * 0.5, rng);
      this.dealLosses(att, dp * 0.5, rng);
      if (!att.length || !def.length) break;
    }
    const attackerWon = this.cardsPower(att) > this.cardsPower(def) * p.defMul;
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

  capture(p, nodeId, wasBattle = false) {
    const st = this.s.nodes[nodeId];
    if (st.owner === p) return;
    st.owner = p;
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

  aftermath() {
    // victory checks resolve at the phase boundary (§16)
    for (const p of [0, 1]) {
      const capId = p === 0 ? 'CAP_A' : 'CAP_B';
      if (this.s.nodes[capId].owner !== p) { this.finish(1 - p, 'capital'); return; }
      if (this.ownedCount(p) >= E_RULES.dominionNeed && this.fortCount(p) >= E_RULES.dominionForts) {
        this.finish(p, 'dominion'); return;
      }
    }
    if (this.s.turn >= E_RULES.turnCap) {
      const d0 = this.ownedCount(0), d1 = this.ownedCount(1);
      this.finish(d0 === d1 ? (this.s.parts[0] >= this.s.parts[1] ? 0 : 1) : (d0 > d1 ? 0 : 1), 'sunrise');
      return;
    }
    this.s.turn++;
    this.s.phase = 'plan';
    this.upkeep();
  }
  finish(winner, how) {
    this.s.over = true;
    this.s.winner = winner;
    this.s.phase = 'over';
    const why = { capital: 'the enemy capital has fallen', dominion: 'dominion of the bedroom is complete', sunrise: 'sunrise — the larger empire prevails' }[how];
    this.say(`🌅 ${this.facLabel(winner)} wins the Bedroom War — ${why}!`);
    this.save();
  }

  // ---------- strategic AI seat (§21: legal orders, same rules) ----------
  aiPlan() {
    const p = 1;
    const a = this.s.armies.find((x) => x.owner === p);
    if (!a || !a.cards.length || this.s.over) return;
    // recover: hurt or thin army heads home to heal + recruit
    const avgStr = a.cards.reduce((s, c) => s + c.strength, 0) / a.cards.length;
    const home = 'CAP_B';
    if ((a.cards.length <= 2 || avgStr < 45) && a.node !== home) {
      this.aiMoveToward(a, home); return;
    }
    // recruit + upgrade when standing at the capital with a full purse
    if (a.node === home) {
      while (this.s.parts[p] >= E_RULES.recruitCost + 20 && a.cards.length < 6) this.recruit(p);
      if (!this.s.upgrades[p].includes('salvage') && this.s.parts[p] >= E_UPGRADES.salvage.cost + 40) this.buyUpgrade(p, 'salvage');
    }
    // defend: an enemy army adjacent to home pulls the army back
    const human = this.s.armies.find((x) => x.owner === 0);
    if (human && human.cards.length && routesOf(home).some((r) => r.to === human.node) && a.node !== home) {
      this.aiMoveToward(a, home); return;
    }
    // expand/attack: nearest node not ours, preferring value; attack only when Favored+
    const target = this.aiPickTarget(a);
    if (target) this.aiMoveToward(a, target);
  }
  aiPickTarget(a) {
    const scores = [];
    for (const [id, st] of Object.entries(this.s.nodes)) {
      if (st.owner === 1) continue;
      const n = E_NODES[id];
      let v = n.yield + (n.type === 'stronghold' ? 8 : 0) + (n.dominion ? 6 : 0) + (n.bonus ? 5 : 0);
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
      // roster cards spawn as tagged units on each side (survivors return)
      attSpawns: attCards.map((c) => ({ cardId: c.id, type: c.type, strength: c.strength, vet: c.vet })),
      defSpawns: defCards.map((c) => ({ cardId: c.id, type: c.type, strength: c.strength, vet: c.vet })),
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
      .map((sp) => { const sv = survivors[sp.cardId]; return sv ? { id: sp.cardId, type: sp.type, strength: sv.strength, vet: sp.vet } : null; })
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
let hooks = { startGame: null, showMenuScreen: null };
export function setEmpireHooks(h) { hooks = { ...hooks, ...h }; }
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
    this.sel = null; // selected army id
    this.launchCtx = null;
    this.root = document.getElementById('empire');
  }
  show() {
    this.root.classList.add('show');
    this.render();
    const enc = this.emp.nextEncounter();
    if (enc) this.showEncounter(enc); // resume mid battle-window after a reload
  }
  hide() { this.root.classList.remove('show'); ui = null; }

  render() {
    const emp = this.emp, s = emp.s;
    const nodePos = (id) => E_NODES[id];
    const routeSvg = E_ROUTES.map(([a, b, kind]) => {
      const A = nodePos(a), B = nodePos(b);
      return `<line x1="${A.mx}" y1="${A.my}" x2="${B.mx}" y2="${B.my}" class="e-route ${kind}"/>`;
    }).join('');
    const orderSvg = s.armies.filter((a) => a.order).map((a) => {
      const A = nodePos(a.node), B = nodePos(a.order.to);
      return `<line x1="${A.mx}" y1="${A.my}" x2="${B.mx}" y2="${B.my}" class="e-order" marker-end="url(#e-arrow)"/>`;
    }).join('');
    const selArmy = s.armies.find((a) => a.id === this.sel);
    const reach = selArmy && s.phase === 'plan' ? emp.reachable(selArmy).map((r) => r.to) : [];
    const nodeSvg = Object.entries(E_NODES).map(([id, n]) => {
      const st = s.nodes[id];
      const ring = st.owner === -1 ? '#7a6a52' : emp.facColor(st.owner);
      const hot = reach.includes(id) ? ' hot' : '';
      return `<g class="e-node${hot}" data-node="${id}" transform="translate(${n.mx},${n.my})">
        <circle r="26" class="e-node-c" style="stroke:${ring}"/>
        <text y="7" text-anchor="middle" class="e-node-ic">${n.icon}</text>
        <text y="44" text-anchor="middle" class="e-node-lb">${n.name}</text>
      </g>`;
    }).join('');
    const armySvg = s.armies.filter((a) => a.cards.length).map((a) => {
      const n = nodePos(a.node);
      const dx = a.owner === 0 ? -30 : 30;
      const selC = a.id === this.sel ? ' sel' : '';
      return `<g class="e-army${selC}" data-army="${a.id}" transform="translate(${n.mx + dx},${n.my - 26})">
        <circle r="13" style="fill:${emp.facColor(a.owner)}"/>
        <text y="4" text-anchor="middle" class="e-army-n">${a.cards.length}</text>
      </g>`;
    }).join('');

    const upgRow = Object.entries(E_UPGRADES).map(([k, u]) => {
      const owned = s.upgrades[0].includes(k);
      return `<button class="diff-btn e-upg${owned ? ' owned' : ''}" data-upg="${k}" ${owned ? 'disabled' : ''} title="${u.desc}">
        ${u.icon} ${u.name}${owned ? ' ✓' : ` — ${u.cost}🔩`}</button>`;
    }).join('');
    const logHtml = s.log.slice(-6).reverse().map((l) => `<div>T${l.t} · ${l.msg}</div>`).join('');
    const side = this.sideCard(selArmy);

    this.root.innerHTML = `
      <div class="e-top">
        <button id="e-back" class="diff-btn">← Menu</button>
        <span class="e-chip">🔩 <b>${s.parts[0]}</b> Parts <span class="e-dim">(+${emp.income(0) - emp.upkeepCost(0)}/turn)</span></span>
        <span class="e-chip">🌙 Turn <b>${s.turn}</b>/${E_RULES.turnCap}</span>
        <span class="e-chip">🗺️ Territory <b>${emp.ownedCount(0)}</b>·${emp.ownedCount(1)} <span class="e-dim">(need ${E_RULES.dominionNeed} + a fort)</span></span>
        <span class="e-spring"></span>
        <button id="e-new" class="diff-btn" title="Abandon this war and start fresh">🔄 New War</button>
      </div>
      <div class="e-main">
        <svg id="e-board" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet">
          <defs><marker id="e-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#ffd97a"/></marker></defs>
          ${routeSvg}${orderSvg}${nodeSvg}${armySvg}
        </svg>
        <div class="e-side">${side}</div>
      </div>
      <div class="e-bottom">
        <div class="e-upgs">${upgRow}</div>
        <button id="e-end" class="diff-btn sel" ${s.phase !== 'plan' || s.over ? 'disabled' : ''}>⏳ End Turn</button>
        <div class="e-log">${logHtml}</div>
      </div>
      <div id="e-modal"></div>`;
    this.wire();
    if (s.over) this.showVictory();
  }

  sideCard(selArmy) {
    const emp = this.emp, s = emp.s;
    if (selArmy) {
      const cards = selArmy.cards.map((c) =>
        `<div class="e-card"><span>${UNITS[c.type].name}</span><span>${'★'.repeat(c.vet)}</span>
         <div class="e-hp"><div style="width:${c.strength}%"></div></div></div>`).join('');
      const atCap = selArmy.node === 'CAP_A';
      return `<div class="e-panel">
        <div class="e-ttl">🚩 Your Army — ${E_NODES[selArmy.node].name}</div>
        <div class="e-dim">MP ${selArmy.mp}/${E_RULES.armyMP} · ${selArmy.cards.length}/${E_RULES.maxCards} toys
        ${selArmy.order ? ` · moving to ${E_NODES[selArmy.order.to].name}` : ''}</div>
        ${cards}
        <button id="e-recruit" class="diff-btn" ${atCap && s.parts[0] >= E_RULES.recruitCost && selArmy.cards.length < E_RULES.maxCards ? '' : 'disabled'}>
          ➕ Recruit (${E_RULES.recruitCost}🔩)${atCap ? '' : ' — at capital only'}</button>
        ${selArmy.order ? '<button id="e-cancel" class="diff-btn">✕ Cancel move</button>' : '<div class="e-dim">Click a highlighted node to march.</div>'}
      </div>`;
    }
    return `<div class="e-panel"><div class="e-ttl">📖 The Bedroom War</div>
      <div class="e-dim">Click your army token (blue) to command it. Capture ${E_RULES.dominionNeed} territories
      including a stronghold — or take the enemy capital — before sunrise on turn ${E_RULES.turnCap}.</div>
      <div class="e-dim" style="margin-top:6px">Nodes fight back: strongholds and the enemy hold garrisons.
      You choose to <b>Play</b> each battle in the toy box or <b>Simulate</b> it from the same odds.</div></div>`;
  }

  wire() {
    const emp = this.emp;
    this.root.querySelector('#e-back').addEventListener('click', () => { this.hide(); });
    this.root.querySelector('#e-new').addEventListener('click', () => {
      if (this.confirmNew) { Empire.clear(); this.emp = new Empire(); this.sel = null; this.confirmNew = false; this.render(); }
      else { this.confirmNew = true; this.root.querySelector('#e-new').textContent = '⚠ Sure? Click again'; }
    });
    const endBtn = this.root.querySelector('#e-end');
    if (endBtn) endBtn.addEventListener('click', () => {
      emp.endTurn();
      this.sel = null;
      this.render();
      const enc = emp.nextEncounter();
      if (enc) this.showEncounter(enc);
    });
    for (const g of this.root.querySelectorAll('.e-army')) {
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        const a = emp.s.armies.find((x) => x.id === g.dataset.army);
        if (a && a.owner === 0) { this.sel = a.id; this.render(); }
      });
    }
    for (const g of this.root.querySelectorAll('.e-node')) {
      g.addEventListener('click', () => {
        if (this.sel && emp.s.phase === 'plan') {
          const r = emp.issueMove(this.sel, g.dataset.node);
          if (r.ok) { this.render(); return; }
        }
        this.toast(E_NODES[g.dataset.node].desc);
      });
    }
    const rec = this.root.querySelector('#e-recruit');
    if (rec) rec.addEventListener('click', () => { emp.recruit(0); this.render(); });
    const can = this.root.querySelector('#e-cancel');
    if (can) can.addEventListener('click', () => { emp.cancelMove(this.sel); this.render(); });
    for (const b of this.root.querySelectorAll('.e-upg')) {
      b.addEventListener('click', () => { emp.buyUpgrade(0, b.dataset.upg); this.render(); });
    }
  }

  toast(msg) {
    const m = this.root.querySelector('#e-modal');
    m.innerHTML = `<div class="e-toast">${msg}</div>`;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { if (m.firstChild && m.firstChild.className === 'e-toast') m.innerHTML = ''; }, 2600);
  }

  showEncounter(enc) {
    const emp = this.emp;
    const p = emp.preview(enc);
    const n = E_NODES[enc.nodeId];
    const youAttack = enc.attacker.owner === 0;
    const m = this.root.querySelector('#e-modal');
    m.innerHTML = `<div class="e-enc">
      <div class="e-enc-card">
        <div class="e-ttl">${n.icon} ${youAttack ? 'Assault on' : 'Defend'} ${n.name}</div>
        <div class="e-dim">${p.template.label} · ~${p.template.time} if played</div>
        <div class="e-band b-${p.band.toLowerCase()}">${p.band}</div>
        <div class="e-dim">Your force ${Math.round(youAttack ? p.attPower : p.defPower)} vs theirs ${Math.round(youAttack ? p.defPower : p.attPower)}
          · expected losses: ${p.lossHint}</div>
        <div class="e-dim">Stakes: ${youAttack ? 'capture the node' : 'hold the node'}; the loser falls back — or breaks.</div>
        <div class="e-enc-btns">
          <button id="e-play" class="diff-btn sel">⚔️ Play the battle</button>
          <button id="e-sim" class="diff-btn">🎲 Simulate</button>
          ${youAttack ? '<button id="e-flee" class="diff-btn">🏃 Withdraw</button>' : ''}
        </div>
      </div></div>`;
    m.querySelector('#e-sim').addEventListener('click', () => {
      emp.finishEncounter(enc, emp.simulate(enc));
      this.render();
      const next = emp.nextEncounter();
      if (next) this.showEncounter(next);
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
    const emp = this.emp;
    const win = emp.s.winner === 0;
    const m = this.root.querySelector('#e-modal');
    m.innerHTML = `<div class="e-enc"><div class="e-enc-card">
      <div class="e-ttl">${win ? '🌅 VICTORY' : '🌑 DEFEAT'}</div>
      <div class="e-dim">${emp.s.log[emp.s.log.length - 1].msg}</div>
      <div class="e-enc-btns"><button id="e-again" class="diff-btn sel">🔄 New War</button>
      <button id="e-out" class="diff-btn">← Menu</button></div></div></div>`;
    m.querySelector('#e-again').addEventListener('click', () => { Empire.clear(); this.emp = new Empire(); this.sel = null; this.render(); });
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
      if (s.type === 'move') emp.issueMove('A0', s.to);
      if (s.type === 'recruit') emp.recruit(0);
      if (s.type === 'upgrade') emp.buyUpgrade(0, s.key);
    }
    emp.endTurn();
    let guard = 0;
    let enc;
    while ((enc = emp.nextEncounter()) && guard++ < 10) emp.finishEncounter(enc, emp.simulate(enc));
  }
  return { hash: emp.stateHash(), turn: emp.s.turn, over: emp.s.over, winner: emp.s.winner,
    owned: [emp.ownedCount(0), emp.ownedCount(1)], log: emp.s.log.slice(-3) };
}
