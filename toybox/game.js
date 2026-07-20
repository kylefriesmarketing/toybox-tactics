// ============================================================
// TOYBOX TACTICS — game engine: map, pathfinding, fog of war,
// smooth steering movement, economy, production, tech, combat,
// and the AI opponent. Stats come from data.js; no balance here.
// ============================================================

import * as THREE from 'three';
import {
  MAP_N, POP_MAX, RES_TYPES, RES_META, UNITS, BUILDINGS, TECHS, MARKET, maskAt,
  AGES, AGE_UPS, PRODUCTION_BUILDINGS, START, AI, DIFFICULTIES, TEAM_NAMES, STICKER, WONDER, PERSONAS, MAPS, FACTIONS,
  TAUNTS, AI_LINES, NARRATOR, NARRATOR_NG,
  CRITTERS, CRITTER_TYPES, LOST_TOYS, WILD_TRIBES, HOUSE_CAT, GAME_MODES, START_RES, SURVIVAL,
} from './data.js';
import {
  createUnitView, createBuildingView, createResourceView,
  createGround, createObstacleMesh, createDecorMesh, createStickerView, createRallyFlag,
  makeRankBadge, createCritterView, createMilkSpill, createKingCrown, createThroneView,
  createWaterSurface, createWaterDecor, applyUnitTier, shadeGroundByHeight,
  createLostToyView, createCampView, createCatView,
} from './models.js';

const N = MAP_N;
const RELIC_COUNTDOWN = 180; // seconds holding all Lost Stickers = win
const KOTH_HOLD = 120;       // seconds holding the golden Throne = win
const idx = (i, j) => j * N + i;
const inMap = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
const tileOf = (x) => Math.floor(x + N / 2);
const worldOf = (i) => i - N / 2 + 0.5;
// keep scatter just off the very edge of the mat (past the stitched border), but
// still let the corners and edges carry resources — only the outermost ring is off
const PLAY_MARGIN = 3;
const inPlay = (i, j) => i >= PLAY_MARGIN && j >= PLAY_MARGIN && i < N - PLAY_MARGIN && j < N - PLAY_MARGIN;
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

function makeRng(seed) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  const f = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // save/load: the stream must resume exactly where it left off
  f.getState = () => s;
  f.setState = (v) => { s = v; };
  return f;
}

// ---------------- A* pathfinding ----------------

// elevation: the biggest step a toy can climb — ramps are gentle (≤ELEV/3),
// cliff edges are a full level and therefore impassable
const CLIMB = 0.3;

// researched building-tier upgrades: which tech levels up which building type
const BUILDING_UP = {
  tower: { tech: 'pentower', hpMul: 1.8, atk: 8, range: 1.5 },
  wall: { tech: 'steelwork', hpMul: 2.5, armor: 2 },
  gate: { tech: 'steelwork', hpMul: 2.5, armor: 2 },
};

class PathFinder {
  constructor(blocked, gates, heights, water) {
    this.blocked = blocked;
    this.gates = gates; // gateOwner per tile (-1 none); own gates are passable
    this.h = heights;   // per-tile terrain height (cliffs block movement)
    this.water = water; // per-tile water flag: ships need it, land toys avoid it
    this.g = new Float32Array(N * N);
    this.visit = new Int32Array(N * N).fill(-1);
    this.from = new Int32Array(N * N);
    this.stamp = 0;
  }
  // naval toys sail only on water and never onto land; land toys never enter it
  isBlockedFor(m, owner, naval) {
    if (naval) return !this.water[m] || this.blocked[m];
    return (this.blocked[m] && this.gates[m] !== owner) || this.water[m] === 1;
  }
  climbable(m, n) {
    return Math.abs(this.h[m] - this.h[n]) <= CLIMB;
  }
  nearestFree(i, j, maxR = 8, naval = false) {
    if (inMap(i, j) && !this.isBlockedFor(idx(i, j), -2, naval)) return [i, j];
    for (let r = 1; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = i + di, b = j + dj;
        if (inMap(a, b) && !this.isBlockedFor(idx(a, b), -2, naval)) return [a, b];
      }
    }
    return null;
  }
  find(sx, sz, tx, tz, forOwner = -2, naval = false) {
    let si = tileOf(sx), sj = tileOf(sz);
    const ti = tileOf(tx), tj = tileOf(tz);
    const sFree = this.nearestFree(si, sj, 4, naval); if (!sFree) return null;
    [si, sj] = sFree;
    // Blocked destinations (a resource pile, a building footprint, a wall) accept
    // EVERY free tile of the nearest free ring as a goal, and the search itself
    // decides which side is closest BY PATH. The old code pre-picked one ring
    // tile in scan order, which marched workers around piles — and around whole
    // wall lines — to reach an arbitrary far-side tile.
    const goals = new Set();
    let ringR = 0;
    if (inMap(ti, tj) && !this.isBlockedFor(idx(ti, tj), forOwner, naval)) {
      goals.add(idx(ti, tj));
    } else {
      for (let r = 1; r <= 10 && !goals.size; r++) {
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const a = ti + di, b = tj + dj;
          if (inMap(a, b) && !this.isBlockedFor(idx(a, b), forOwner, naval)) goals.add(idx(a, b));
        }
        if (goals.size) ringR = r;
      }
      if (!goals.size) return null;
    }
    if (goals.has(idx(si, sj))) return [{ x: worldOf(si), z: worldOf(sj) }];

    const stamp = ++this.stamp;
    const { g, visit, from } = this;
    const open = [];
    const push = (f, n) => {
      open.push([f, n]);
      let c = open.length - 1;
      while (c > 0) { const p = (c - 1) >> 1; if (open[p][0] <= open[c][0]) break; [open[p], open[c]] = [open[c], open[p]]; c = p; }
    };
    const pop = () => {
      const top = open[0], last = open.pop();
      if (open.length) {
        open[0] = last;
        let c = 0;
        for (;;) {
          let l = c * 2 + 1, r = l + 1, m = c;
          if (l < open.length && open[l][0] < open[m][0]) m = l;
          if (r < open.length && open[r][0] < open[m][0]) m = r;
          if (m === c) break; [open[m], open[c]] = [open[c], open[m]]; c = m;
        }
      }
      return top[1];
    };
    // octile distance to the target CENTER, relaxed by the goal ring's radius so
    // it stays admissible for every ring tile (never overestimates → optimal side)
    const relax = ringR * 1.414;
    const h = (i, j) => {
      const dx = Math.abs(i - ti), dy = Math.abs(j - tj);
      return Math.max(0, Math.max(dx, dy) + 0.414 * Math.min(dx, dy) - relax);
    };
    const start = idx(si, sj);
    g[start] = 0; visit[start] = stamp; from[start] = -1;
    push(h(si, sj), start);
    let expansions = 0, found = -1;
    while (open.length && expansions++ < 6000) {
      const n = pop();
      if (goals.has(n)) { found = n; break; }
      const ni = n % N, nj = (n / N) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = ni + di, b = nj + dj;
        if (!inMap(a, b)) continue;
        const m = idx(a, b);
        if (this.isBlockedFor(m, forOwner, naval)) continue;
        if (!naval && !this.climbable(m, n)) continue; // land toys can't scale cliffs
        // diagonal steps must clear BOTH orthogonal tiles — for blockage AND
        // climb, else the path slips through cliff notches steering can't walk
        if (di && dj) {
          const o1 = idx(ni + di, nj), o2 = idx(ni, nj + dj);
          if (this.isBlockedFor(o1, forOwner, naval) || this.isBlockedFor(o2, forOwner, naval)) continue;
          if (!naval && (!this.climbable(o1, n) || !this.climbable(o2, n))) continue;
        }
        const cost = g[n] + (di && dj ? 1.414 : 1);
        if (visit[m] === stamp && g[m] <= cost) continue;
        visit[m] = stamp; g[m] = cost; from[m] = n;
        push(cost + h(a, b), m);
      }
    }
    if (found < 0) return null;
    const path = [];
    for (let n = found; n !== -1; n = from[n]) path.push({ x: worldOf(n % N), z: worldOf((n / N) | 0) });
    path.reverse();
    if (path.length > 1) path.shift();
    return path;
  }
}

// ---------------- fog of war ----------------

class FogOfWar {
  constructor(scene) {
    this.vis = new Uint8Array(N * N); // 0 unexplored, 1 explored, 2 visible
    this.cells = document.createElement('canvas');
    this.cells.width = this.cells.height = N;
    this.soft = document.createElement('canvas');
    this.soft.width = this.soft.height = N * 4;
    this.tex = new THREE.CanvasTexture(this.soft);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(N, N, N, N),   // subdivided so it can drape over hills
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.09;
    plane.renderOrder = 500;
    plane.frustumCulled = false;             // displaced bounds would cull it early
    this.plane = plane;
    scene.add(plane);
  }
  update(entities, viewOwners = [0]) {
    // team-shared vision: any listed owner's toys light the map
    const owners = Array.isArray(viewOwners) ? viewOwners : [viewOwners];
    const v = this.vis;
    for (let k = 0; k < v.length; k++) if (v[k] === 2) v[k] = 1;
    for (const e of entities) {
      if (!owners.includes(e.owner) || e.dead) continue;
      if (e.kind === 'building' && e.built < 1) continue;
      const r = e.def.vision || 4;
      const ci = tileOf(e.x), cj = tileOf(e.z), r2 = r * r;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (di * di + dj * dj > r2) continue;
        const a = ci + di, b = cj + dj;
        if (inMap(a, b)) v[idx(a, b)] = 2;
      }
    }
    const ctx = this.cells.getContext('2d');
    const img = ctx.createImageData(N, N);
    for (let k = 0; k < v.length; k++) {
      const p = k * 4;
      img.data[p] = 8; img.data[p + 1] = 10; img.data[p + 2] = 30;
      img.data[p + 3] = v[k] === 2 ? 0 : v[k] === 1 ? 120 : 244;
    }
    ctx.putImageData(img, 0, 0);
    const sc = this.soft.getContext('2d');
    sc.clearRect(0, 0, this.soft.width, this.soft.height);
    sc.filter = 'blur(3px)';
    sc.drawImage(this.cells, 0, 0, this.soft.width, this.soft.height);
    sc.filter = 'none';
    this.tex.needsUpdate = true;
  }
  state(x, z) {
    const i = tileOf(x), j = tileOf(z);
    return inMap(i, j) ? this.vis[idx(i, j)] : 0;
  }
  // drape the fog sheet over the terrain heightfield so plateaus/ramps don't
  // poke up through it while still unexplored (matches applyTerrainToGround)
  drape(heightFn) {
    const pos = this.plane.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      // plane is rotated -90° about x: local (x, y) sits at world (x, -y)
      pos.setZ(k, heightFn(pos.getX(k), -pos.getY(k)));
    }
    pos.needsUpdate = true;
    this.plane.geometry.computeBoundingSphere();
  }
}

// ---------------- game ----------------


const REF_SPEED = 1.6; // walk-anim reference speed (tiles/sec)

export class Game {
  constructor(scene, registry, cb, opts = {}) {
    this.nextId = 1; // per-instance ids (lockstep clients must agree)
    this.scene = scene;
    this.registry = registry;
    this.cb = cb;   // { alert(msg,kind,pos), selection(), gameOver(win,stats), age(p) }
    this.fx = opts.fx || null;
    this.sfx = opts.sfx || null;
    this.myId = opts.myId ?? 0;   // which side this client plays
    this.mp = !!opts.mp;          // multiplayer: no AI, commands via lockstep
    this.net = opts.net || null;
    // replays: the sim is deterministic at fixed ticks, so a finished match is
    // just {seed, opts, player commands by frame}. Recording is free in SP;
    // playback feeds the log back through the same issue() funnel.
    this.frame = 0;                                     // completed update() count
    this.replayFeed = opts.replayLog ? opts.replayLog.map((r) => ({ k: r.k, c: r.c })) : null;
    this.cmdLog = (this.replayFeed || this.mp) ? null : []; // record fresh SP games only
    this.rng = makeRng(opts.seed || 20260703);
    // opts.map may be a MAPS key or a full config object (e.g. a random map)
    this.map = (opts.map && typeof opts.map === 'object') ? opts.map : (MAPS[opts.map] || MAPS.playmat);
    this.tutorial = !!opts.tutorial; // AI sits idle; scripted steps drive play
    this.gameMode = opts.gameMode && GAME_MODES[opts.gameMode] ? opts.gameMode : 'standard';
    this.startResKey = opts.startRes && START_RES[opts.startRes] ? opts.startRes : 'standard';
    const base = DIFFICULTIES[opts.difficulty || 'normal'];
    this.entities = [];
    this.selected = [];
    this.formation = 'box'; // client-local; travels inside move commands
    this.projectiles = [];
    this.blocked = new Uint8Array(N * N);
    this.water = new Uint8Array(N * N);               // 1 = sailable water tile
    this.gateOwner = new Int8Array(N * N).fill(-1);
    this.ELEV = 0.85; // world height of one terrain level
    this.height = new Float32Array(N * N);            // per-tile terrain
    this.cornerH = new Float32Array((N + 1) * (N + 1)); // bilinear corners
    this.pf = new PathFinder(this.blocked, this.gateOwner, this.height, this.water);
    this.fog = new FogOfWar(scene);
    this.rallyFlag = createRallyFlag();
    scene.add(this.rallyFlag.group);
    // players from playerDefs [{team, isAI, faction}]; classic 1v1 default
    this.playerDefs = opts.playerDefs || [
      { team: 0, isAI: false, faction: opts.factions ? opts.factions[0] : (opts.faction || 'classic') },
      { team: 1, isAI: !this.mp, faction: opts.factions ? opts.factions[1] : null },
    ];
    this.players = this.playerDefs.map((d, i) => ({
      id: i, team: d.team, res: { ...START.resources }, age: 1, aging: 0,
      popUsed: 0, popCap: 0, isAI: !!d.isAI, den: !!d.den,
      techs: new Set(),
      mods: { carry: 0, gather: 1, gatherSnacks: 1, speedInfantry: 1, speedWheels: 1, speedAll: 1,
              atkMelee: 0, atkPierce: 0, armorInfantry: 0, armorOther: 0, atkSpeed: 1,
              buildingHp: 1, buildRate: 1, unitHp: 1, healRate: 1, atkVehicle: 0 },
      stats: { gathered: 0, trained: 0, lost: 0, kills: 0, razed: 0,
        shipsBuilt: 0, shipsLost: 0, wallsBuilt: 0, megaBuilt: 0, mice: 0, strays: 0, tribes: 0 },
    }));
    // factions: humans bring their pick; AIs roll their own. The roll is
    // consumed for EVERY seat so the rng stream is identical whether a
    // faction was provided or not — resumed saves must regenerate the very
    // same terrain/obstacle shell as the original match.
    const pool = Object.keys(FACTIONS);
    this.factionKeys = this.playerDefs.map((d) => {
      const rolled = pool[(this.rng() * pool.length) | 0];
      return d.faction || rolled;
    });
    for (const p of this.players) {
      const f = FACTIONS[this.factionKeys[p.id]] || FACTIONS.classic;
      for (const [k, v] of Object.entries(f.mods)) {
        if (k === 'carry' || k === 'atkMelee' || k === 'atkPierce' || k === 'armorInfantry' || k === 'atkVehicle') {
          p.mods[k] += v;
        } else {
          p.mods[k] *= v;
        }
      }
      // starting-resource preset scales the opening bank
      const mult = START_RES[this.startResKey].mult;
      if (mult !== 1) for (const r of RES_TYPES) p.res[r] = Math.round(p.res[r] * mult);
    }
    // per-AI difficulty persona and manager state (deterministic roll order)
    this.aiState = {};
    this.personaTaunt = null;
    for (const p of this.players) {
      if (!p.isAI) continue;
      const personaKey = ['rusher', 'balanced', 'boomer'][(this.rng() * 3) | 0];
      const persona = PERSONAS[personaKey];
      // each AI seat may carry its own difficulty (skirmish lobby); else the match default
      const pBase = DIFFICULTIES[this.playerDefs[p.id].difficulty] || base;
      const diff = {
        ...pBase,
        workerTarget: Math.max(6, pBase.workerTarget + persona.workerTarget),
        firstWave: Math.max(4, pBase.firstWave + persona.firstWave),
      };
      this.aiState[p.id] = {
        wave: diff.firstWave, attacking: false, scoutT: 0, t: this.rng() * 0.7,
        techT: 20, raidT: persona.raidInterval || AI.raidInterval,
        raidInterval: persona.raidInterval || AI.raidInterval, diff,
        persona: personaKey, // v2: personas differ in comp, walls and navy too
      };
      // the first enemy AI's plan is the one hinted at in the opening taunt
      if (!this.personaTaunt && p.team !== (this.playerDefs[this.myId] || this.playerDefs[0]).team) {
        this.personaTaunt = (TAUNTS[personaKey] && TAUNTS[personaKey][this.factionKeys[p.id]]) || persona.taunt;
      }
    }
    this.time = 0;
    this.timeline = []; this.tlT = 0;
    // remembered so a save file can rebuild an identical match shell
    this.mapKey = opts.map || 'playmat';
    this.diffKey = opts.difficulty || 'normal';
    this.seedUsed = opts.seed || 20260703;
    this.wonderState = null; // { owner, t } while a completed wonder stands
    this.relicState = null;  // { team, t } while one team holds every sticker
    // living commodity market: price factors drift back toward 1.0
    this.market = { snacks: 1, blocks: 1, marbles: 1 };
    this.marketT = 0;
    this.fogT = 0; this.winT = 0; this.sepT = 0;
    this.alertThrottle = {};
    this.over = false;
  }

  // ---------- terrain ----------
  tileHeight(i, j) { return inMap(i, j) ? this.height[idx(i, j)] : 0; }

  // is the w×d footprint all at one height (level, if given)?
  flatAt(i, j, w, d, level = null) {
    if (!inMap(i, j) || !inMap(i + w - 1, j + d - 1)) return false;
    const h0 = level !== null ? level : this.height[idx(i, j)];
    for (let b = j; b < j + d; b++) for (let a = i; a < i + w; a++) {
      if (this.water[idx(a, b)]) return false; // nothing builds on the water
      if (Math.abs(this.height[idx(a, b)] - h0) > 0.01) return false;
    }
    return true;
  }

  // corner grid = average of the 4 touching tiles; drives mesh + unit heights
  computeCorners() {
    const W = N + 1;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      let sum = 0, n = 0;
      for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
        if (inMap(a, b)) { sum += this.height[idx(a, b)]; n++; }
      }
      this.cornerH[j * W + i] = n ? sum / n : 0;
    }
  }

  // smooth world-space terrain height (matches the displaced ground mesh)
  heightAtWorld(x, z) {
    const W = N + 1;
    const fx = Math.max(0, Math.min(N - 1e-4, x + N / 2));
    const fz = Math.max(0, Math.min(N - 1e-4, z + N / 2));
    const i0 = Math.floor(fx), j0 = Math.floor(fz);
    const tx = fx - i0, tz = fz - j0;
    const C = this.cornerH;
    const h00 = C[j0 * W + i0], h10 = C[j0 * W + i0 + 1];
    const h01 = C[(j0 + 1) * W + i0], h11 = C[(j0 + 1) * W + i0 + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  // push the heightfield into the playmat mesh; the breeze ripples on top
  applyTerrainToGround() {
    const mesh = this.scene.getObjectByName('playmat-ground');
    if (!mesh) return;
    const pos = mesh.geometry.attributes.position;
    const base = new Float32Array(pos.count);
    for (let k = 0; k < pos.count; k++) {
      // plane is rotated -90° about x: local (x, y) sits at world (x, -y)
      base[k] = this.heightAtWorld(pos.getX(k), -pos.getY(k));
      pos.setZ(k, base[k]);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.userData.baseH = base;
  }

  // ---------- setup ----------
  setup() {
    this.scene.add(createGround(N, this.map.ground, this.map));
    const rng = this.rng;

    // N-player start positions around the map perimeter, grouped by team so
    // teammates sit adjacent and rivals spread apart. The 135° offset keeps the
    // classic layouts intact: 1v1 → SW vs NE, 2v2 → west side vs east side.
    const seatOrder = this.players.map((p) => p.id)
      .sort((a, b) => this.players[a].team - this.players[b].team || a - b);
    // R was N/2-15 (seats ±14.85 diagonal) for the game's first months, then
    // N/2-10, now N/2-8 (±19.8 → 1v1 seats (16,56)/(56,16), flush against the
    // edge clamp) — Kyle wants the chests DEEP in the corners so every march
    // is the whole map. Masked maps keep ~6 tiles of rim margin at this radius
    // (start clutter adapts via the blocked-tile guards).
    const cx = N / 2, cz = N / 2, R = N / 2 - 8;
    const startById = {};
    seatOrder.forEach((pid, k) => {
      const ang = (k / seatOrder.length) * Math.PI * 2 + Math.PI * 0.75;
      let ci = Math.round(cx + Math.cos(ang) * R);
      let cj = Math.round(cz + Math.sin(ang) * R);
      ci = Math.max(11, Math.min(N - 16, ci));
      cj = Math.max(11, Math.min(N - 16, cj));
      startById[pid] = [ci, cj];
    });
    const starts = this.players.map((p) => startById[p.id]);
    this.startTiles = starts; // placement guards keep clutter off the chest doorsteps
    this.homes = starts.map(([ci, cj]) => ({ x: worldOf(ci + 2), z: worldOf(cj + 2) }));
    this.homePos = this.homes[this.myId];
    const clearHomes = (i, j, r) =>
      this.homes.every((h) => (worldOf(i) - h.x) ** 2 + (worldOf(j) - h.z) ** 2 > r * r);

    // ---- outdoor maps: an irregular playable shape (outside the rim = scenery) ----
    // masks are designed to always contain the start ring, so seats never drown
    if (this.map.mask) {
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        if (!maskAt(this.map.mask, i, j, N)) this.blocked[idx(i, j)] = 1;
      }
    }

    // ---- naval basin: flood a central lake that only ships can cross ----
    if (this.map.water) {
      const A = this.map.water.rx || 15, B = this.map.water.rz || 12;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const di = i - N / 2, dj = j - N / 2;
        if ((di * di) / (A * A) + (dj * dj) / (B * B) <= 1 && clearHomes(i, j, 12)) {
          this.water[idx(i, j)] = 1;
          this.height[idx(i, j)] = 0; // water sits flat at floor level
        }
      }
    }

    // ---- ridge walls: authored piled-terrain crests too steep for any toy,
    // with passes through them — each map's chokepoints, themed per room (sand
    // piles, lost laundry, grass clippings, spilled flour, fallen garland).
    // Cores rise past CLIMB (a natural wall) and are marked blocked; passes and
    // skirts sit at E/3, one gentle step up. No rng — the same walls stand in
    // every match. Ridges lay down FIRST: plateaus/dunes/hills all skip blocked
    // tiles, so later terrain shapes itself around the walls (like the mask) ----
    const E = this.ELEV;
    if (this.map.ridges) {
      for (const rd of this.map.ridges) {
        const di = rd.i2 - rd.i1, dj = rd.j2 - rd.j1;
        const len = Math.hypot(di, dj), w = rd.w || 1;
        for (let t = 0; t <= len; t += 0.5) {
          const f = t / len;
          const inGap = (rd.gaps || []).some((gp) => Math.abs(f - gp.t) * len < (gp.w || 4) / 2);
          const ci = Math.round(rd.i1 + di * f), cj = Math.round(rd.j1 + dj * f);
          for (let b = -w - 1; b <= w + 1; b++) for (let a = -w - 1; a <= w + 1; a++) {
            const i = ci + a, j = cj + b;
            if (!inMap(i, j) || this.blocked[idx(i, j)]) continue;
            if (!clearHomes(i, j, 14)) continue; // never wall in a doorstep
            const skirt = Math.max(Math.abs(a), Math.abs(b)) > w;
            if (inGap || skirt) {
              this.height[idx(i, j)] = Math.max(this.height[idx(i, j)], E / 3);
            } else {
              this.height[idx(i, j)] = Math.max(this.height[idx(i, j)], E * 2.2);
              this.blocked[idx(i, j)] = 1;
            }
          }
        }
      }
    }

    // ---- elevation: plateaus hiding under the mat, ramps as choke points ----
    for (let k = 0; k < (this.map.plateaus ?? 3); k++) {
      let ci = 0, cj = 0, placed = false;
      for (let tries = 0; tries < 30 && !placed; tries++) {
        ci = 15 + (rng() * (N - 30)) | 0; cj = 15 + (rng() * (N - 30)) | 0;
        if (clearHomes(ci, cj, 17) && !this.blocked[idx(ci, cj)]) placed = true;
      }
      if (!placed) continue;
      const rx = 4 + (rng() * 3 | 0), rz = 4 + (rng() * 3 | 0), wob = rng() * 9;
      for (let b = -rz - 1; b <= rz + 1; b++) for (let a = -rx - 1; a <= rx + 1; a++) {
        const i = ci + a, j = cj + b;
        if (!inMap(i, j) || this.blocked[idx(i, j)]) continue; // ridges/mask win
        const w = 0.85 + 0.15 * Math.sin(Math.atan2(b, a) * 3 + wob);
        if ((a * a) / (rx * rx * w) + (b * b) / (rz * rz * w) <= 1) {
          this.height[idx(i, j)] = Math.max(this.height[idx(i, j)], E);
        }
      }
      // two ramps at rough opposites — the only ways up
      const baseAng = rng() * Math.PI * 2;
      for (const ang of [baseAng, baseAng + Math.PI * (0.8 + rng() * 0.4)]) {
        const dx = Math.cos(ang), dz = Math.sin(ang);
        let d = 1;
        while (d < 14) {
          const i = Math.round(ci + dx * d), j = Math.round(cj + dz * d);
          if (!inMap(i, j) || this.height[idx(i, j)] < E) break;
          d++;
        }
        // 4 gentle steps (0.64→0.43→0.21→0, each ≤ CLIMB) and 5 tiles wide, so
        // whole armies flow up the ramp instead of grinding on a narrow lip
        for (let s = 0; s < 4; s++) {
          const hVal = E * (3 - s) / 4;
          for (let wOff = -2; wOff <= 2; wOff++) {
            const i = Math.round(ci + dx * (d + s) - dz * wOff);
            const j = Math.round(cj + dz * (d + s) + dx * wOff);
            if (inMap(i, j) && !this.blocked[idx(i, j)]) this.height[idx(i, j)] = Math.max(this.height[idx(i, j)], hVal);
          }
        }
      }
      // the first plateau gets a level-2 crown — the map's vantage throne
      if (k === 0 && Math.min(rx, rz) >= 5) {
        for (let b = -rz + 3; b <= rz - 3; b++) for (let a = -rx + 3; a <= rx - 3; a++) {
          const i = ci + a, j = cj + b;
          if (!inMap(i, j) || this.blocked[idx(i, j)]) continue;
          if ((a * a) / ((rx - 3) ** 2) + (b * b) / ((rz - 3) ** 2) <= 1) {
            this.height[idx(i, j)] = E * 2;
          }
        }
        const cAng = rng() * Math.PI * 2;
        const dx = Math.cos(cAng), dz = Math.sin(cAng);
        let d = 1;
        while (d < 10) {
          const i = Math.round(ci + dx * d), j = Math.round(cj + dz * d);
          if (!inMap(i, j) || this.height[idx(i, j)] < E * 2) break;
          d++;
        }
        for (let s = 0; s < 4; s++) {
          const hVal = E + E * (3 - s) / 4;
          for (let wOff = -2; wOff <= 2; wOff++) {
            const i = Math.round(ci + dx * (d + s) - dz * wOff);
            const j = Math.round(cj + dz * (d + s) + dx * wOff);
            if (inMap(i, j) && !this.blocked[idx(i, j)] && this.height[idx(i, j)] <= E + 0.01) {
              this.height[idx(i, j)] = hVal;
            }
          }
        }
      }
    }
    // ---- rolling dunes: low, wobbly mounds wearing full ramp collars, so the
    // whole field reads as hills a toy can wander over rather than cliffs ----
    if (this.map.dunes) {
      const D = this.map.dunes;
      for (let k = 0; k < (D.count || 6); k++) {
        let ci = 0, cj = 0, ok = false;
        for (let tries = 0; tries < 30 && !ok; tries++) {
          ci = 14 + (rng() * (N - 28)) | 0; cj = 14 + (rng() * (N - 28)) | 0;
          if (clearHomes(ci, cj, 15) && !this.blocked[idx(ci, cj)]) ok = true;
        }
        if (!ok) continue;
        const r = (D.rMin || 4) + (rng() * ((D.rMax || 7) - (D.rMin || 4)) | 0);
        const wob = rng() * 9;
        // three concentric bands: crest E, then E*2/3 and E/3 collars — every
        // step is ≤ CLIMB, so dunes are walkable from any direction
        for (const [band, hMul] of [[r, 1], [r + 1, 2 / 3], [r + 2, 1 / 3]]) {
          for (let b = -band - 1; b <= band + 1; b++) for (let a = -band - 1; a <= band + 1; a++) {
            const i = ci + a, j = cj + b;
            if (!inMap(i, j) || this.blocked[idx(i, j)]) continue;
            const w = 0.8 + 0.2 * Math.sin(Math.atan2(b, a) * 3 + wob);
            if ((a * a + b * b) <= band * band * w) {
              this.height[idx(i, j)] = Math.max(this.height[idx(i, j)], E * hMul);
            }
          }
        }
      }
    }

    // ---- authored hero landmark (the sandbox's sandcastle): placed before the
    // random obstacles so everything else arranges itself around it ----
    if (this.map.landmark) {
      const L = this.map.landmark, s = L.size || 3;
      this.addObstacle(L.kind, L.i, L.j, s, s, 7);
    }

    // ---- the center hill: one deliberate two-step rise crowned by the map's
    // hero landmark (the Old Oak) — the high ground everyone is here for ----
    if (this.map.centerHill) {
      const ci = N / 2, cj = N / 2, R = this.map.centerHill.r || 9;
      for (const [band, h] of [[R, E], [R + 1, E * 2 / 3], [R + 2, E / 3]]) {
        for (let b = -band; b <= band; b++) for (let a = -band; a <= band; a++) {
          const i = ci + a, j = cj + b;
          if (!inMap(i, j) || this.blocked[idx(i, j)]) continue;
          if (a * a + b * b <= band * band) this.height[idx(i, j)] = Math.max(this.height[idx(i, j)], h);
        }
      }
      for (const [band, h] of [[Math.max(3, R - 5), E * 2], [Math.max(4, R - 4), E * 5 / 3], [Math.max(5, R - 3), E * 4 / 3]]) {
        for (let b = -band; b <= band; b++) for (let a = -band; a <= band; a++) {
          const i = ci + a, j = cj + b;
          if (!inMap(i, j) || this.blocked[idx(i, j)]) continue;
          if (a * a + b * b <= band * band) this.height[idx(i, j)] = Math.max(this.height[idx(i, j)], h);
        }
      }
    }

    // keep the basin dead flat even if a plateau clipped its edge
    if (this.map.water) for (let k = 0; k < this.water.length; k++) if (this.water[k]) this.height[k] = 0;
    this.computeCorners();
    this.applyTerrainToGround();
    // bake painted hillshade from the finished height grid (view-only, no rng)
    shadeGroundByHeight(this.scene, N, (i, j) => this.height[idx(i, j)]);
    this.fog.drape((x, z) => this.heightAtWorld(x, z)); // fog sheet hugs the hills
    if (this.map.water) {
      this.waterSurface = createWaterSurface(N, this.water);
      this.scene.add(this.waterSurface.group);
      // hero decor: a giant rubber duck at the basin's edge + a faucet at the head end
      const A = this.map.water.rx || 15, B = this.map.water.rz || 12;
      const cx = N / 2, cz = N / 2;
      for (const dec of createWaterDecor()) {
        let ti, tj, ry = 0;
        if (dec.key === 'duck') { ti = cx - A * 0.62; tj = cz + B * 0.28; ry = 0.5; }
        else { ti = cx + A * 0.15; tj = cz - B - 2.2; ry = Math.PI; } // faucet just past the north rim
        dec.group.position.set(worldOf(ti), 0.02, worldOf(tj));
        dec.group.rotation.y = ry;
        this.scene.add(dec.group);
      }
    }

    // themed blockers (books/pillows indoors, rocks/trees past the door); the
    // rectClear guard is a no-op on classic maps but keeps masked scenery empty
    const oKinds = this.map.obstacleKinds || ['book', 'pillow'];
    const rectClear = (i, j, w, d) => {
      for (let b = j; b < j + d; b++) for (let a = i; a < i + w; a++) {
        if (!inMap(a, b) || this.blocked[idx(a, b)]) return false;
      }
      return true;
    };
    for (let k = 0; k < this.map.obstacles; k++) {
      const i = 14 + (rng() * (N - 28)) | 0, j = 14 + (rng() * (N - 28)) | 0;
      const w = 2 + (rng() * 2 | 0), d = 2 + (rng() * 2 | 0);
      const kind = () => oKinds[(rng() * oKinds.length) | 0];
      if (this.flatAt(i, j, w, d, 0) && rectClear(i, j, w, d)) this.addObstacle(kind(), i, j, w, d, k + 1);
      if (this.flatAt(N - i - w, N - j - d, w, d, 0) && rectClear(N - i - w, N - j - d, w, d)) this.addObstacle(kind(), N - i - w, N - j - d, w, d, k + 40);
    }
    // the Old Oak itself: a 4×4 giant on the hilltop, plus root walls radiating
    // down the slope with gaps between them — natural castle walls
    if (this.map.centerHill) {
      this.addObstacle('oak', N / 2 - 2, N / 2 - 2, 4, 4, 900);
      if (this.map.roots) {
        const R = (this.map.centerHill.r || 9) + 2;
        for (let s = 0; s < 6; s++) {
          const ang = (s / 6) * Math.PI * 2 + 0.35;
          const dx = Math.cos(ang), dz = Math.sin(ang);
          for (let seg = 0; seg < 2; seg++) {
            const d0 = R + 1 + seg * 4;
            const i = Math.round(N / 2 + dx * d0), j = Math.round(N / 2 + dz * d0);
            const horiz = Math.abs(dx) > Math.abs(dz);
            const w = horiz ? 3 : 1, dd = horiz ? 1 : 3;
            if (this.flatAt(i, j, w, dd, null) && rectClear(i, j, w, dd) && clearHomes(i, j, 13)) {
              this.addObstacle('roots', i, j, w, dd, 910 + s * 2 + seg);
            }
          }
        }
      }
    }
    // groves: clumps of sunflowers/trees standing in for the AoE treeline
    if (this.map.groves) {
      const G = this.map.groves;
      for (let k = 0; k < (G.count || 4); k++) {
        let gi = 0, gj = 0, ok = false;
        for (let tries = 0; tries < 25 && !ok; tries++) {
          gi = 14 + (rng() * (N - 28)) | 0; gj = 14 + (rng() * (N - 28)) | 0;
          if (clearHomes(gi, gj, 15)) ok = true;
        }
        if (!ok) continue;
        const n = 3 + (rng() * 3 | 0);
        for (let t = 0; t < n; t++) {
          const i = gi + ((rng() * 7) | 0) - 3, j = gj + ((rng() * 7) | 0) - 3;
          if (this.flatAt(i, j, 1, 1, 0) && rectClear(i, j, 1, 1)) {
            this.addObstacle(G.kind || 'sunflower', i, j, 1, 1, 940 + k * 8 + t);
          }
        }
      }
    }
    // Toy Chest Canyon: a diagonal barricade with three contested gaps
    if (this.map.canyon) {
      const gaps = [N / 2, N / 2 - 17, N / 2 + 17];
      for (let t = 6; t < N - 8; t += 3) {
        if (gaps.some((gp) => Math.abs(t - gp) < 4)) continue;
        const jit = ((rng() * 3) | 0) - 1;
        if (this.flatAt(t + jit, t - jit, 3, 3, 0)) this.addObstacle(rng() < 0.65 ? 'pillow' : 'book', t + jit, t - jit, 3, 3, 200 + t);
      }
    }
    // non-blocking clutter — the theme picks the props (playground swings etc.)
    const kinds = this.map.decor || ['crayon', 'die', 'ball'];
    const decorN = this.map.decorCount || 14;
    for (let k = 0; k < decorN; k++) {
      const i = 6 + (rng() * (N - 12)) | 0, j = 6 + (rng() * (N - 12)) | 0;
      if (this.blocked[idx(i, j)]) continue;
      // decor is non-blocking, but a crayon poking out of a Toy Chest still looks wrong
      if (this.startTiles && this.startTiles.some(([si, sj]) =>
        i > si - 5 && i < si + 7 && j > sj - 5 && j < sj + 7)) continue;
      const decor = createDecorMesh(kinds[(rng() * kinds.length) | 0], k + 3);
      decor.position.set(worldOf(i), this.heightAtWorld(worldOf(i), worldOf(j)), worldOf(j));
      decor.userData.decor = true; // view-only tag: THE KID may take these
      this.scene.add(decor);
    }
    // resource abundance scales with the map theme
    const RC = (type, i, j, count) =>
      this.addResourceCluster(type, i, j, Math.max(1, Math.round(count * this.map.resourceMul)));
    for (const p of this.players) {
      if (p.den) continue; // survival: the monster den has no base — it only leaks waves
      const [ci, cj] = starts[p.id];
      const chest = this.addBuilding('chest', p.id, ci, cj, true);
      const face = ci < N / 2 ? 1 : -1;             // expand toward the middle
      const faceZ = cj < N / 2 ? 1 : -1;
      for (let w = 0; w < START.workers; w++) {
        this.spawnUnit('worker', p.id, chest.x + face * (2.8 + w * 0.7), chest.z + faceZ * 2.6);
      }
      this.spawnUnit('scout', p.id, chest.x + face * 3.4, chest.z - faceZ * 1.5);
      // Regicide: each toybox fields a King to protect
      if (this.gameMode === 'regicide') {
        const king = this.spawnUnit('king', p.id, chest.x + face * 2, chest.z + faceZ * 3.5);
        king.isKing = true;
        if (king.view) {
          king.kingCrown = createKingCrown();
          king.view.group.add(king.kingCrown);
        }
      }
      RC('snacks', ci + face * 7, cj + faceZ * 2, 4);
      RC('blocks', ci + 1, cj + faceZ * 7, 4);
      RC('buttons', ci + face * 10, cj + faceZ * 5, 2);
      RC('snacks', ci + face * 16, cj + faceZ * 10, 3);
      RC('blocks', ci + face * 11, cj + faceZ * 16, 3);
      RC('marbles', ci + face * 14, cj - faceZ * 2, 2);
      // backfield behind the base, toward the corner, so it isn't a barren dead zone
      RC('snacks', ci - face * 6, cj - faceZ * 4, 3);
      RC('blocks', ci - face * 4, cj - faceZ * 7, 3);
      RC('buttons', ci - face * 8, cj - faceZ * 2, 2);
    }
    RC('buttons', N / 2 - 4, N / 2 - 1, 3);
    RC('buttons', N / 2 + 2, N / 2 + 1, 3);
    RC('snacks', N / 2 - 1, N / 2 - 7, 3);
    RC('blocks', N / 2 - 1, N / 2 + 6, 3);
    RC('marbles', N / 2 - 8, N / 2 + 1, 2);
    RC('marbles', N / 2 + 6, N / 2 - 1, 2);
    // water maps: the themed bath-toy piles float in the tub (never on dry land)
    if (this.map.water) this.seedWaterResources();

    // Survival: the opposite corner becomes the den the Forgotten crawl out of
    if (this.gameMode === 'survival' && this.players.some((p) => p.den)) this.setupSurvival(starts);

    // Lost Stickers: hold with military toys for a Buttons trickle (map control).
    // King of the Hill replaces them with a single golden Throne at center.
    // Survival gets neither — its only victory is surviving to the dawn wave, so
    // an uncontested sticker/relic hold must not hand the defenders an early win.
    if (this.gameMode === 'koth') {
      this.addThrone(worldOf(N / 2), worldOf(N / 2));
    } else if (this.gameMode !== 'survival') {
      this.addSticker(worldOf(N / 2 - 14), worldOf(N / 2 - 14));
      this.addSticker(worldOf(N / 2 + 13), worldOf(N / 2 + 13));
      if (this.map.stickers >= 3) this.addSticker(worldOf(N / 2), worldOf(N / 2));
    }

    // ---- terrain features: AoE lakes/mountains/forests, bedroom edition ----
    const feat = this.map.features || {};
    const clearOfHomes = (i, j, r) =>
      this.homes.every((h) => (worldOf(i) - h.x) ** 2 + (worldOf(j) - h.z) ** 2 > r * r);

    // even resource coverage: a 4×4 zone lattice — every sector of the room
    // gets its own pocket, so any expansion direction pays off
    const zone = N / 4;
    const latticeTypes = ['snacks', 'blocks', 'buttons', 'marbles'];
    let zi = 0;
    for (let zy = 0; zy < 4; zy++) for (let zx = 0; zx < 4; zx++) {
      const x0 = zx * zone, y0 = zy * zone;
      const hasHome = this.homes.some((h) =>
        h.x + N / 2 >= x0 && h.x + N / 2 < x0 + zone && h.z + N / 2 >= y0 && h.z + N / 2 < y0 + zone);
      if (hasHome) continue; // base zones are already stocked
      const t = latticeTypes[zi++ % 4];
      for (let tries = 0; tries < 18; tries++) {
        const i = Math.round(x0 + 3 + rng() * (zone - 6));
        const j = Math.round(y0 + 3 + rng() * (zone - 6));
        if (!clearOfHomes(i, j, 12)) continue;
        RC(t, i, j, 2 + (rng() * 3 | 0));
        // half the zones get a second, different pocket
        if (zi % 2 === 0) {
          const t2 = latticeTypes[(zi + 2) % 4];
          const i2 = Math.round(x0 + 3 + rng() * (zone - 6));
          const j2 = Math.round(y0 + 3 + rng() * (zone - 6));
          if (clearOfHomes(i2, j2, 12)) RC(t2, i2, j2, 2 + (rng() * 2 | 0));
        }
        break;
      }
    }

    // spilled milk: an impassable lake with the guilty glass at its edge
    for (let k = 0; k < (feat.milk || 0); k++) {
      for (let tries = 0; tries < 40; tries++) {
        const i = 16 + (rng() * (N - 32)) | 0, j = 16 + (rng() * (N - 32)) | 0;
        const rx = 3 + (rng() * 2 | 0), rz = 2 + (rng() * 2 | 0);
        if (!clearOfHomes(i, j, 22)) continue;
        let free = true;
        for (let b = -rz; b <= rz && free; b++) for (let a = -rx; a <= rx; a++) {
          const inside = (a * a) / (rx * rx) + (b * b) / (rz * rz) <= 1;
          if (inside && (!inMap(i + a, j + b) || this.blocked[idx(i + a, j + b)]
              || this.height[idx(i + a, j + b)] > 0.01)) { free = false; break; } // milk pools on flat floor
        }
        if (!free) continue;
        for (let b = -rz; b <= rz; b++) for (let a = -rx; a <= rx; a++) {
          if ((a * a) / (rx * rx) + (b * b) / (rz * rz) <= 1) this.blocked[idx(i + a, j + b)] = 1;
        }
        const spill = createMilkSpill(rx + 0.45, rz + 0.45, k * 977 + i + j);
        spill.position.set(worldOf(i), 0, worldOf(j));
        this.scene.add(spill);
        break;
      }
    }

    // pillow mountain ranges: long winding impassable ridges of stacked
    // pillows (with the odd book outcrop) and a defendable pass in the middle
    for (let k = 0; k < (feat.ranges || 0); k++) {
      for (let tries = 0; tries < 25; tries++) {
        let ci = 15 + (rng() * (N - 30)) | 0, cj = 15 + (rng() * (N - 30)) | 0;
        if (!clearOfHomes(ci, cj, 20)) continue;
        let dir = rng() * Math.PI * 2;
        const segs = 8 + (rng() * 5 | 0);
        const gapAt = (segs / 2) | 0;
        for (let s = 0; s < segs; s++) {
          const w = 3, d = 3;
          if (s !== gapAt) {
            // only raise mountains on genuinely free, flat floor
            let free = inMap(ci, cj) && inMap(ci + w - 1, cj + d - 1) && clearOfHomes(ci, cj, 15)
              && this.flatAt(ci, cj, w, d, 0);
            for (let b = cj; b < cj + d && free; b++) for (let a = ci; a < ci + w; a++) {
              if (this.blocked[idx(a, b)]) { free = false; break; }
            }
            if (free) this.addObstacle(rng() < 0.8 ? 'pillow' : 'book', ci, cj, w, d, k * 100 + s + 7);
          }
          dir += (rng() - 0.5) * 0.8;
          ci += Math.round(Math.cos(dir) * 3);
          cj += Math.round(Math.sin(dir) * 3);
          if (!inMap(ci, cj)) break;
        }
        break;
      }
    }

    // block forests: dense thickets of Blocks nodes — workers chop lanes
    // through them exactly like an AoE treeline
    for (let k = 0; k < (feat.forests || 0); k++) {
      for (let tries = 0; tries < 40; tries++) {
        const i0 = 13 + (rng() * (N - 26)) | 0, j0 = 13 + (rng() * (N - 26)) | 0;
        if (!clearOfHomes(i0, j0, 17)) continue;
        let placed = 0;
        for (let b = -4; b <= 4; b++) for (let a = -4; a <= 4; a++) {
          if (a * a + b * b > 12 + rng() * 5) continue; // ragged, wider blob edge
          if (rng() < 0.45) continue;                   // scatter the grove — open lanes, no solid brick wall
          if (this.addResourceNode('blocks', i0 + a, j0 + b)) placed++;
        }
        if (placed >= 5) break;
      }
    }

    // the menagerie scatters around the middle of the room — ground critters
    // never spawn in water or up on plateaus (a mouse that spawns somewhere
    // toys can't walk can never be befriended or deliver); water critters do
    // the opposite and sample until they find open water. Every map states its
    // cast in MAPS.<k>.critters; unlisted maps keep the classic wind-up mice.
    const cast = this.map.critters || [{ type: 'mouse', count: CRITTERS.count }];
    for (const grp of cast) {
      const ct = CRITTER_TYPES[grp.type] || CRITTER_TYPES.mouse;
      for (let k = 0; k < (grp.count || CRITTERS.count); k++) {
        for (let t = 0; t < 30; t++) {
          const i = N / 2 - 16 + ((rng() * 32) | 0), j = N / 2 - 16 + ((rng() * 32) | 0);
          if (this.blocked[idx(i, j)]) continue;
          const wet = this.water[idx(i, j)] === 1;
          if (ct.water ? !wet : (wet || this.height[idx(i, j)] > 0.01)) continue;
          this.addCritter(worldOf(i), worldOf(j), grp.type);
          break;
        }
      }
    }

    // wild toy tribes: neutral camps at the midfield, placed as point-mirrored
    // pairs so both seats get the same offer. Not in survival — the Forgotten
    // don't parley, and neither should an uncontested defender get free troops.
    if (this.map.tribes && this.gameMode !== 'survival') {
      const camps = [];
      for (let k = 0; k < Math.ceil(this.map.tribes / 2); k++) {
        for (let t = 0; t < 40; t++) {
          const ri = 10 + (rng() * 14); // midfield ring, off the exact center
          const ra = rng() * Math.PI * 2;
          const i = Math.round(N / 2 + Math.cos(ra) * ri), j = Math.round(N / 2 + Math.sin(ra) * ri);
          const mi = N - 1 - i, mj = N - 1 - j; // the mirrored twin
          const ok = (a, b) => inMap(a, b) && !this.blocked[idx(a, b)] && this.water[idx(a, b)] !== 1
            && this.height[idx(a, b)] < 0.3 && clearHomes(a, b, 16)
            && camps.every(([ci2, cj2]) => Math.hypot(a - ci2, b - cj2) > 10);
          if (ok(i, j) && ok(mi, mj) && Math.hypot(i - mi, j - mj) > 12) {
            camps.push([i, j], [mi, mj]);
            break;
          }
        }
      }
      for (const [ci2, cj2] of camps) this.addCamp(worldOf(ci2), worldOf(cj2));
    }

    // lost toys: strays scattered wide (they wandered off — that's the POINT),
    // clear of home doorsteps so the find is always a little expedition
    const lostClear = (i, j, r) =>
      this.homes.every((h) => (worldOf(i) - h.x) ** 2 + (worldOf(j) - h.z) ** 2 > r * r);
    for (let k = 0; k < LOST_TOYS.count; k++) {
      for (let t = 0; t < 40; t++) {
        const i = 8 + ((rng() * (N - 16)) | 0), j = 8 + ((rng() * (N - 16)) | 0);
        if (this.blocked[idx(i, j)] || this.water[idx(i, j)] === 1) continue;
        if (!lostClear(i, j, 11)) continue;
        this.addLostToy(worldOf(i), worldOf(j), LOST_TOYS.kinds[k % LOST_TOYS.kinds.length]);
        break;
      }
    }

    // the house cat: one per land map, spawned at the midfield ring
    if (this.map.cat !== false) {
      for (let t = 0; t < 30; t++) {
        const a = rng() * Math.PI * 2, r = 8 + rng() * 10;
        const i = Math.round(N / 2 + Math.cos(a) * r), j = Math.round(N / 2 + Math.sin(a) * r);
        if (this.blocked[idx(i, j)] || this.water[idx(i, j)] === 1) continue;
        if (!clearHomes(i, j, 14)) continue;
        this.addCat(worldOf(i), worldOf(j));
        break;
      }
    }

    this.fog.update(this.entities);
  }

  addCritter(x, z, type = 'mouse') {
    const ct = CRITTER_TYPES[type] || CRITTER_TYPES.mouse;
    const view = createCritterView(type);
    view.group.position.set(x, this.heightAtWorld(x, z), z);
    this.scene.add(view.group);
    this.entities.push({
      id: this.nextId++, kind: 'critter', type, owner: -1,
      x, z, hx: x, hz: z, // home patch (orbiters circle it)
      radius: 0.25, captor: -1, facing: 0, wanderT: this.rng() * 3, scanT: 0,
      def: { name: ct.name, desc: ct.desc },
      view, dead: false,
    });
  }

  addCamp(x, z) {
    const view = createCampView();
    view.group.position.set(x, this.heightAtWorld(x, z), z);
    view.group.rotation.y = this.rng() * Math.PI * 2;
    this.scene.add(view.group);
    this.entities.push({
      id: this.nextId++, kind: 'camp', owner: -1,
      x, z, radius: 1.6, prog: 0, holdTeam: -1, captured: -1, scanT: this.rng() * 0.5,
      def: { name: 'Wild Toy Camp', desc: WILD_TRIBES.desc },
      view, dead: false,
    });
  }

  // hold the camp uncontested with military toys and the tribe joins you:
  // its wild toys re-muster under your flag, plus a little tribute
  updateCamp(c, dt) {
    if (c.dead) return;
    c.view.update(dt);
    if (c.captured >= 0) return; // already flying somebody's flag
    c.scanT -= dt;
    if (c.scanT <= 0) {
      c.scanT = 0.5;
      const present = new Set();
      let lowPid = -1;
      for (const e of this.entities) {
        if (e.kind !== 'unit' || e.dead || e.owner < 0 || e.garrisoned) continue;
        if (e.def.gatherRate || e.def.naval) continue; // military ground toys only
        if (dist2(c, e) < WILD_TRIBES.holdRadius ** 2) {
          present.add(this.players[e.owner].team);
          if (lowPid < 0 || e.owner < lowPid) lowPid = e.owner;
        }
      }
      if (present.size === 1) {
        if (c.holdTeam !== [...present][0]) { c.holdTeam = [...present][0]; c.prog = 0; }
        c.progPid = lowPid;
      } else {
        c.holdTeam = -1; c.prog = 0; // contested or abandoned: the tribe waits
      }
    }
    if (c.holdTeam >= 0) {
      c.prog += dt;
      if (c.prog >= WILD_TRIBES.holdTime) {
        const pid = c.progPid ?? 0;
        c.captured = pid;
        for (let k = 0; k < WILD_TRIBES.comp.length; k++) {
          const a = (k / WILD_TRIBES.comp.length) * Math.PI * 2 + 0.7;
          this.spawnUnit(WILD_TRIBES.comp[k], pid, c.x + Math.cos(a) * 2, c.z + Math.sin(a) * 2);
        }
        this.players[pid].res.buttons += WILD_TRIBES.bounty;
        this.players[pid].stats.tribes = (this.players[pid].stats.tribes || 0) + 1;
        c.view.setOwner(this.players[pid].team === this.myTeam ? 0x3b82f6 : 0xe4572e);
        this.fx && this.fx.spawnPop(c.x, c.z, 0xf0c23a);
        if (pid === this.myId) {
          this.alert(`The wild tribe joins you! ${WILD_TRIBES.comp.length} toys learn your flag (+${WILD_TRIBES.bounty} Buttons).`, 'info', { x: c.x, z: c.z }, 5);
          this.sfx && this.sfx.play('age');
        } else if (this.isEnemy(this.myId, pid)) {
          this.alert('A rival taught a wild tribe their flags!', 'warn', { x: c.x, z: c.z }, 5);
        }
      }
    }
  }

  addCat(x, z) {
    const view = createCatView();
    view.group.position.set(x, this.heightAtWorld(x, z), z);
    this.scene.add(view.group);
    this.entities.push({
      id: this.nextId++, kind: 'cat', owner: -1,
      x, z, radius: 1.1, facing: 0,
      state: 'walk', stateT: 4 + this.rng() * 6, tgt: null, swatT: 0,
      def: { name: 'The House Cat', desc: 'She cannot be fought, only respected. Keep your toys together.' },
      view, dead: false,
    });
  }

  // the cat's whole philosophy: walk where she likes, nap where she likes,
  // and swat any LONE toy that forgets whose floor this really is
  updateCat(c, dt) {
    if (c.dead) return;
    c.view.update(dt);
    c.swatT = Math.max(0, c.swatT - dt);
    c.stateT -= dt;
    if (c.stateT <= 0) {
      if (c.state === 'walk') {
        c.state = 'nap'; c.stateT = HOUSE_CAT.napMin + this.rng() * (HOUSE_CAT.napMax - HOUSE_CAT.napMin);
        c.tgt = null;
        c.view.setNap && c.view.setNap(true);
      } else {
        c.state = 'walk'; c.stateT = HOUSE_CAT.walkMin + this.rng() * (HOUSE_CAT.walkMax - HOUSE_CAT.walkMin);
        c.view.setNap && c.view.setNap(false);
      }
    }
    if (c.state === 'walk') {
      if (!c.tgt) {
        for (let t = 0; t < 8; t++) {
          const a = this.rng() * Math.PI * 2, r = 5 + this.rng() * 9;
          const tx = Math.max(-N / 2 + 3, Math.min(N / 2 - 3, c.x + Math.sin(a) * r));
          const tz = Math.max(-N / 2 + 3, Math.min(N / 2 - 3, c.z + Math.cos(a) * r));
          const ti = tileOf(tx), tj = tileOf(tz);
          if (!this.blocked[idx(ti, tj)] && this.water[idx(ti, tj)] !== 1) { c.tgt = { x: tx, z: tz }; break; }
        }
      }
      if (c.tgt) {
        const dx = c.tgt.x - c.x, dz = c.tgt.z - c.z, d = Math.hypot(dx, dz);
        if (d < 0.5) c.tgt = null;
        else {
          const sp = HOUSE_CAT.speed * dt;
          const nx = c.x + (dx / d) * sp, nz = c.z + (dz / d) * sp;
          const cliff = Math.abs(this.tileHeight(tileOf(nx), tileOf(nz)) - this.tileHeight(tileOf(c.x), tileOf(c.z))) > CLIMB;
          if (!this.blocked[idx(tileOf(nx), tileOf(nz))] && this.water[idx(tileOf(nx), tileOf(nz))] !== 1 && !cliff) {
            c.x = nx; c.z = nz; c.facing = Math.atan2(dx, dz);
          } else c.tgt = null;
        }
      }
    }
    // the swat: a lone toy in reach, and she's in the mood
    if (c.swatT <= 0) {
      for (const e of this.entities) {
        if (e.kind !== 'unit' || e.dead || e.owner < 0 || e.garrisoned || e.def.naval) continue;
        if (dist2(c, e) > HOUSE_CAT.swatRadius ** 2) continue;
        const hasFriend = this.entities.some((f) => f !== e && f.kind === 'unit' && !f.dead
          && f.owner >= 0 && this.players[f.owner].team === this.players[e.owner].team
          && dist2(e, f) < HOUSE_CAT.loneRadius ** 2);
        if (hasFriend) continue; // she only bullies the stragglers
        e.hp -= HOUSE_CAT.swatDamage;
        const dx = e.x - c.x, dz = e.z - c.z, d = Math.hypot(dx, dz) || 1;
        const kx = e.x + (dx / d) * HOUSE_CAT.swatKnock, kz = e.z + (dz / d) * HOUSE_CAT.swatKnock;
        if (this.tileOpenFor(kx, kz, e.owner)) { e.x = kx; e.z = kz; }
        c.swatT = HOUSE_CAT.swatCooldown;
        c.facing = Math.atan2(dx, dz);
        this.fx && this.fx.spawnPop(e.x, e.z, 0xe8a8b8);
        if (e.owner === this.myId) this.alert('🐈 The house cat SWATS your lone toy! Keep them together.', 'warn', { x: c.x, z: c.z }, 4);
        if (e.hp <= 0 && !e.dead) this.kill(e, null);
        break;
      }
    }
    c.view.group.position.set(c.x, this.heightAtWorld(c.x, c.z), c.z);
    c.view.group.rotation.y = c.facing;
  }

  addLostToy(x, z, type) {
    const view = createLostToyView(type);
    view.group.position.set(x, this.heightAtWorld(x, z), z);
    this.scene.add(view.group);
    this.entities.push({
      id: this.nextId++, kind: 'lost', type, owner: -1,
      x, z, radius: 0.5, carrier: -1, scanT: this.rng(),
      def: { name: LOST_TOYS.names[type] || 'a lost toy', desc: `A stray. A worker who wanders close will carry it home for +${LOST_TOYS.bounty} Buttons.` },
      view, dead: false,
    });
  }

  // lost toys ride along with whichever worker found them — no orders change,
  // the bounty just pays out the next time that worker passes its own chest
  updateLostToy(l, dt) {
    if (l.dead) return;
    l.view.update(dt);
    if (l.carrier < 0) {
      l.scanT -= dt;
      if (l.scanT <= 0) {
        l.scanT = 0.5;
        for (const e of this.entities) {
          if (e.kind !== 'unit' || e.dead || e.owner < 0 || e.garrisoned || !e.def.gatherRate || e.carryLost != null) continue;
          if (dist2(l, e) < LOST_TOYS.radius ** 2) {
            l.carrier = e.id; e.carryLost = l.id;
            if (e.owner === this.myId) this.alert(`Found ${l.def.name}! A worker is carrying it home.`, 'info', { x: l.x, z: l.z }, 4);
            break;
          }
        }
      }
    } else {
      const u = this.entities.find((e) => e.id === l.carrier);
      if (!u || u.dead) { // the carrier fell — the stray tumbles loose right here
        if (u) { l.x = u.x; l.z = u.z; u.carryLost = null; }
        l.carrier = -1; l.scanT = 1.5;
      } else {
        l.x = u.x; l.z = u.z;
        const chest = this.entities.find((e) =>
          e.kind === 'building' && e.type === 'chest' && e.owner === u.owner && !e.dead && e.built >= 1);
        if (chest && dist2(l, chest) < (chest.radius + 1.2) ** 2) {
          this.players[u.owner].res.buttons += LOST_TOYS.bounty;
          this.players[u.owner].stats.gathered += LOST_TOYS.bounty;
          this.players[u.owner].stats.strays = (this.players[u.owner].stats.strays || 0) + 1;
          u.carryLost = null;
          this.fx && this.fx.spawnPop(l.x, l.z, 0x9ad0f0);
          if (u.owner === this.myId) {
            this.alert(`+${LOST_TOYS.bounty} Buttons — ${l.def.name} is home safe!`, 'info', null, 3);
            this.sfx && this.sfx.play('trade');
          }
          l.dead = true; l.removed = true;
          this.scene.remove(l.view.group);
          return;
        }
      }
    }
    // ride high on the carrier's shoulders; sparkle at rest
    const carried = l.carrier >= 0;
    l.view.group.position.set(l.x, this.heightAtWorld(l.x, l.z) + (carried ? 1.15 : 0), l.z);
  }

  updateCritter(c, dt) {
    if (c.dead) return;
    c.view.update(dt);
    const ct = CRITTER_TYPES[c.type] || CRITTER_TYPES.mouse;
    if (c.captor < 0) {
      c.scanT -= dt;
      if (c.scanT <= 0) {
        c.scanT = 0.4;
        const cat = this.entities.find((x) => x.kind === 'cat' && !x.dead);
        if (cat && dist2(c, cat) < HOUSE_CAT.scatterRadius ** 2 && !ct.water) {
          const dx = c.x - cat.x, dz = c.z - cat.z, d = Math.hypot(dx, dz) || 1;
          const fx2 = c.x + (dx / d) * 4, fz2 = c.z + (dz / d) * 4;
          if (this.tileOpenFor(fx2, fz2, -1)) { c.tgt = { x: fx2, z: fz2 }; c.wanderT = 1.5; }
        } else if (ct.flee) {
          // uncatchable: startles from the nearest toy and bolts the other way
          let near = null, best = 3.2 ** 2;
          for (const e of this.entities) {
            if (e.kind !== 'unit' || e.dead || e.owner < 0 || e.garrisoned) continue;
            const d2 = dist2(c, e);
            if (d2 < best) { best = d2; near = e; }
          }
          if (near) {
            const dx = c.x - near.x, dz = c.z - near.z, d = Math.hypot(dx, dz) || 1;
            const fx2 = c.x + (dx / d) * 3.5, fz2 = c.z + (dz / d) * 3.5;
            if (this.tileOpenFor(fx2, fz2, -1)) { c.tgt = { x: fx2, z: fz2 }; c.wanderT = 1.2; }
          }
        } else if (ct.snack) {
          // any toy that gets close wins it over
          for (const e of this.entities) {
            if (e.kind !== 'unit' || e.dead || e.owner < 0 || e.garrisoned) continue;
            if (ct.water && this.water[idx(tileOf(e.x), tileOf(e.z))] === 1) continue; // befriend the duck from dry land
            if (dist2(c, e) < CRITTERS.captureRadius ** 2) {
              c.captor = e.owner;
              c.tgt = null;
              if (e.owner === this.myId) this.alert(`${ct.name} befriended! It heads home with Snacks.`, 'info', { x: c.x, z: c.z }, 4);
              break;
            }
          }
        }
      }
      c.wanderT -= dt;
      if (c.wanderT <= 0 || !c.tgt) {
        c.wanderT = 2 + this.rng() * 4;
        let tx, tz;
        if (c.type === 'ant' && c.captor < 0) { // crumb patrol: home to the spill and back
          c.trailFlip = !c.trailFlip;
          if (c.trailFlip) { tx = c.hx * 0.35; tz = c.hz * 0.35; }
          else { tx = c.hx; tz = c.hz; }
          tx += (this.rng() - 0.5) * 2; tz += (this.rng() - 0.5) * 2;
          c.tgt = this.tileOpenFor(tx, tz, -1) ? { x: tx, z: tz } : null;
          c.wanderT = 4 + this.rng() * 3;
          return;
        }
        if (ct.orbit && this.rng() < 0.25) { // a feeding pause: hover where the flowers are
          c.tgt = null; c.wanderT = 2 + this.rng() * 2;
          return;
        }
        if (ct.orbit) { // circles its home patch like it's still on the porch
          const a = this.rng() * Math.PI * 2, r = 2 + this.rng() * 3;
          tx = c.hx + Math.sin(a) * r; tz = c.hz + Math.cos(a) * r;
        } else {
          const a = this.rng() * Math.PI * 2, r = 1.5 + this.rng() * 4;
          tx = c.x + Math.sin(a) * r; tz = c.z + Math.cos(a) * r;
        }
        tx = Math.max(-N / 2 + 2, Math.min(N / 2 - 2, tx));
        tz = Math.max(-N / 2 + 2, Math.min(N / 2 - 2, tz));
        const ok = ct.water
          ? this.water[idx(tileOf(tx), tileOf(tz))] === 1  // paddlers stay in the basin
          : ct.orbit
            ? !this.blocked[idx(tileOf(tx), tileOf(tz))]   // fliers ignore ground rules, not walls
            : this.tileOpenFor(tx, tz, -1);
        c.tgt = ok ? { x: tx, z: tz } : null;
      }
    } else {
      const chest = this.entities.find((e) =>
        e.kind === 'building' && e.type === 'chest' && e.owner === c.captor && !e.dead && e.built >= 1);
      if (!chest) { c.captor = -1; c.tgt = null; return; }
      // beeline home — unless mid-detour around a cliff or wall
      if ((c.detourT || 0) > 0) c.detourT -= dt;
      else c.tgt = { x: chest.x, z: chest.z };
      if (dist2(c, chest) < (chest.radius + 0.9) ** 2) {
        const pay = (CRITTER_TYPES[c.type] || CRITTER_TYPES.mouse).snack || CRITTERS.snack;
        this.players[c.captor].res.snacks += pay;
        this.players[c.captor].stats.gathered += pay;
        this.players[c.captor].stats.mice++;
        this.fx && this.fx.spawnPop(c.x, c.z, 0xf9c74f);
        if (c.captor === this.myId) {
          this.alert(`+${pay} Snacks — the ${c.def.name.toLowerCase()} delivered!`, 'info', null, 2);
          this.sfx && this.sfx.play('trade');
        }
        c.dead = true; c.removed = true;
        this.scene.remove(c.view.group);
        return;
      }
    }
    if (c.tgt) {
      const dx = c.tgt.x - c.x, dz = c.tgt.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) {
        const ct2 = CRITTER_TYPES[c.type] || CRITTER_TYPES.mouse;
        const sp = (c.captor >= 0 ? 1.8 : (ct2.speed || 1.0)) * dt;
        const nx = c.x + (dx / d) * sp, nz = c.z + (dz / d) * sp;
        const cliff = !ct2.orbit && Math.abs(this.tileHeight(tileOf(nx), tileOf(nz))
          - this.tileHeight(tileOf(c.x), tileOf(c.z))) > CLIMB;
        const open = ct2.orbit
          ? !this.blocked[idx(tileOf(nx), tileOf(nz))] // fliers cross anything but walls
          : ct2.water && c.captor < 0
            ? this.water[idx(tileOf(nx), tileOf(nz))] === 1 // free ducks stay afloat
            : this.tileOpenFor(nx, nz, -1);
        if (open && !cliff) { c.x = nx; c.z = nz; c.facing = Math.atan2(dx, dz); }
        else if (c.captor >= 0) {
          // the straight way home is blocked: scurry a random step sideways,
          // then re-aim at the chest (random-restart beelines round any plateau)
          c.detourT = 0.9 + this.rng() * 0.8;
          const a2 = this.rng() * Math.PI * 2, r2 = 1.5 + this.rng() * 2.5;
          const dx2 = c.x + Math.sin(a2) * r2, dz2 = c.z + Math.cos(a2) * r2;
          c.tgt = this.tileOpenFor(dx2, dz2, -1) ? { x: dx2, z: dz2 } : null;
        }
        else c.tgt = null;
      } else c.tgt = null;
    }
    c.view.group.position.set(c.x, this.heightAtWorld(c.x, c.z), c.z);
    c.view.group.rotation.y = c.facing;
  }

  // nudge a world point off the water onto the nearest dry tile (for objectives)
  snapToLand(x, z) {
    // objectives step off water AND blocked terrain (ridge crests, mask edges) —
    // a golden throne belongs beside the wall's pass, not perched on top of it
    let i = tileOf(x), j = tileOf(z);
    if (!inMap(i, j) || (!this.water[idx(i, j)] && !this.blocked[idx(i, j)])) return { x, z };
    for (let r = 1; r <= 20; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = i + di, b = j + dj;
        if (inMap(a, b) && !this.water[idx(a, b)] && !this.blocked[idx(a, b)]) return { x: worldOf(a), z: worldOf(b) };
      }
    }
    return { x, z };
  }

  addSticker(x, z) {
    ({ x, z } = this.snapToLand(x, z));
    const view = createStickerView();
    view.group.position.set(x, this.heightAtWorld(x, z), z);
    this.scene.add(view.group);
    this.entities.push({
      id: this.nextId++, kind: 'objective', type: 'sticker', owner: -1,
      x, z, radius: 0.7, holder: -1, scanT: this.rng(),
      def: { name: 'Lost Sticker', desc: `Hold with military toys: +${STICKER.incomePerSec} 🔘/s` },
      view, dead: false,
    });
  }

  addThrone(x, z) {
    ({ x, z } = this.snapToLand(x, z));
    const view = createThroneView();
    view.group.position.set(x, this.heightAtWorld(x, z), z);
    this.scene.add(view.group);
    this.entities.push({
      id: this.nextId++, kind: 'objective', type: 'throne', owner: -1,
      x, z, radius: 2.2, holder: -1, holdTime: 0, scanT: 0,
      def: { name: 'Golden Throne', desc: 'Hold it with a military toy to rule the bedroom.' },
      view, dead: false,
    });
  }

  updateObjectives(dt) {
    for (const s of this.entities) {
      if (s.kind !== 'objective' || s.dead) continue;
      // the KotH throne is scored by updateKoth, not the sticker income loop
      if (s.type === 'throne') { s.view.update(dt); continue; }
      s.view.update(dt);
      // holder is a TEAM; every toybox on it shares the trickle
      if (s.holder >= 0) {
        for (const p of this.players) {
          if (p.team === s.holder) p.res.buttons += STICKER.incomePerSec * dt;
        }
      }
      s.scanT -= dt;
      if (s.scanT > 0) continue;
      s.scanT = 0.6;
      const r2 = STICKER.captureRadius ** 2;
      const present = new Set();
      for (const e of this.entities) {
        if (e.kind !== 'unit' || e.dead || e.def.aggro <= 0 || e.garrisoned) continue;
        if ((e.x - s.x) ** 2 + (e.z - s.z) ** 2 > r2) continue;
        present.add(this.teamOf(e.owner));
      }
      const newHolder = present.size === 1 ? [...present][0] : s.holder;
      if (newHolder !== s.holder && present.size === 1) {
        s.holder = newHolder;
        s.view.setHolder(newHolder < 0 ? null : (newHolder === this.myTeam ? 0x3b82f6 : 0xe4572e));
        if (newHolder === this.myTeam) this.alert('Lost Sticker captured! Buttons trickle in while your team holds it.', 'info', { x: s.x, z: s.z });
        else this.alert(`${TEAM_NAMES[1]} grabbed a Lost Sticker!`, 'warn', { x: s.x, z: s.z }, 5);
      }
    }
  }

  addObstacle(kind, i, j, w, d, seed) {
    if (!inMap(i, j) || !inMap(i + w - 1, j + d - 1)) return;
    if (!inPlay(i, j) || !inPlay(i + w - 1, j + d - 1)) return; // keep clutter off the mat's edge
    // never fuse a book or pillow into a starting Toy Chest (3x3 at each start) or its doorstep
    if (this.startTiles && this.startTiles.some(([si, sj]) =>
      i + w > si - 4 && i < si + 7 && j + d > sj - 4 && j < sj + 7)) return;

    for (let b = j; b < j + d; b++) for (let a = i; a < i + w; a++) this.blocked[idx(a, b)] = 1;
    const mesh = createObstacleMesh(kind, w, d, seed);
    mesh.position.set(worldOf(i) + (w - 1) / 2, this.tileHeight(i, j), worldOf(j) + (d - 1) / 2);
    this.scene.add(mesh);
  }

  addResourceNode(resType, i, j) {
    if (!inMap(i, j) || !inPlay(i, j) || this.blocked[idx(i, j)] || this.water[idx(i, j)]) return null;
    // resources sit on flat levels, never on ramps (they'd block the only way up)
    const h = this.height[idx(i, j)];
    if (h > 0.01 && Math.abs(h - this.ELEV) > 0.01 && Math.abs(h - this.ELEV * 2) > 0.01) return null;
    // only on the flat interior of a level: a tile whose four mesh corners all
    // sit at h. skirting a plateau edge makes a pile float over — or sink into —
    // the sloped surface the corner-interpolated mesh actually renders there.
    const W = N + 1, C = this.cornerH;
    if (Math.abs(C[j * W + i] - h) > 0.01 || Math.abs(C[j * W + i + 1] - h) > 0.01
      || Math.abs(C[(j + 1) * W + i] - h) > 0.01 || Math.abs(C[(j + 1) * W + i + 1] - h) > 0.01) return null;
    this.blocked[idx(i, j)] = 1;
    // themed bath-toy skin only where the tile is actually water; land piles stay normal
    const view = createResourceView(resType, i * 131 + j, this.water[idx(i, j)] === 1);
    view.group.position.set(worldOf(i), this.heightAtWorld(worldOf(i), worldOf(j)), worldOf(j));
    this.scene.add(view.group);
    const e = {
      id: this.nextId++, kind: 'resource', resType, owner: -1,
      x: worldOf(i), z: worldOf(j), ti: i, tj: j, radius: 0.55,
      amount: RES_META[resType].nodeAmount, def: { name: RES_META[resType].nodeName },
      view, dead: false,
    };
    this.entities.push(e);
    return e;
  }

  // Floating bath-toy resources: the ONLY piles that sit in the water, and only
  // Bath Skimmers (def.gatherNaval) can harvest them — land workers can't reach.
  addWaterResourceNode(resType, i, j) {
    if (!inMap(i, j) || this.water[idx(i, j)] !== 1 || this.blocked[idx(i, j)]) return null;
    this.blocked[idx(i, j)] = 1;
    const view = createResourceView(resType, i * 131 + j, true); // always the water skin
    view.group.position.set(worldOf(i), this.heightAtWorld(worldOf(i), worldOf(j)), worldOf(j));
    this.scene.add(view.group);
    const e = {
      id: this.nextId++, kind: 'resource', resType, owner: -1, aquatic: true,
      x: worldOf(i), z: worldOf(j), ti: i, tj: j, radius: 0.55,
      amount: RES_META[resType].nodeAmount, def: { name: RES_META[resType].nodeName },
      view, dead: false,
    };
    this.entities.push(e);
    return e;
  }

  // spread ~8 floating resource clusters around the tub's shore (deterministic)
  seedWaterResources() {
    const types = ['blocks', 'buttons', 'marbles']; // soap / rubber-ducks / bath-pearls
    const shore = (a, b) => inMap(a, b) && inPlay(a, b) && this.water[idx(a, b)] !== 1 && !this.blocked[idx(a, b)];
    const eligible = [];
    for (let j = 3; j < N - 3; j++) for (let i = 3; i < N - 3; i++) {
      if (this.water[idx(i, j)] !== 1 || this.blocked[idx(i, j)]) continue;
      if (shore(i - 1, j) || shore(i + 1, j) || shore(i, j - 1) || shore(i, j + 1)) eligible.push([i, j]);
    }
    if (!eligible.length) return;
    const want = Math.min(8, eligible.length);
    const step = eligible.length / want;
    for (let k = 0; k < want; k++) {
      const [i, j] = eligible[Math.floor(k * step)];
      this.addWaterResourceNode(types[k % types.length], i, j);
    }
  }

  addResourceCluster(resType, i0, j0, count) {
    // all resource types cache tile-to-tile in a tight little pile (the block
    // over-concentration was the forests, not these clusters — see below)
    const offs = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [1, -1], [-1, 1]];
    let placed = 0;
    for (const [di, dj] of offs) {
      if (placed >= count) break;
      if (this.addResourceNode(resType, Math.round(i0 + di), Math.round(j0 + dj))) placed++;
    }
  }

  addBuilding(type, owner, i, j, instant = false) {
    const def = BUILDINGS[type];
    const s = def.size;
    for (let b = j; b < j + s; b++) for (let a = i; a < i + s; a++) {
      this.blocked[idx(a, b)] = 1;
      if (def.gate) this.gateOwner[idx(a, b)] = owner;
    }
    const upTech = this.buildingUpTech(type, owner); // already-researched tier upgrade?
    const view = createBuildingView(type, def, owner, i * 977 + j, !!upTech, this.players[owner].age, this.factionKeys[owner]);
    const x = worldOf(i) + (s - 1) / 2, z = worldOf(j) + (s - 1) / 2;
    view.group.position.set(x, this.tileHeight(i, j), z);
    this.scene.add(view.group);
    const hpMult = (this.players[owner].techs.has('plating') ? 1.2 : 1) * this.players[owner].mods.buildingHp
      * (upTech ? upTech.hpMul : 1);
    const e = {
      id: this.nextId++, kind: 'building', type, owner, def, view,
      x, z, ti: i, tj: j, radius: s * 0.55,
      hp: instant ? def.hp * hpMult : Math.max(1, def.hp * 0.05),
      maxHp: def.hp * hpMult,
      built: instant ? 1 : 0, queue: [], rally: null, cd: 0, scanT: 0, smokeT: 0,
      garrisonIds: [],
      dead: false, seen: !this.isEnemy(this.myId, owner), gatherer: null,
    };
    view.setProgress(e.built);
    this.entities.push(e);
    if (instant) this.recalcPop(owner);
    if (def.wall || def.gate) this.orientWalls(i, j, s);
    return e;
  }

  // walls and gates rotate to follow their run, so lines read as one wall
  // (visual only — footprints are square, the sim doesn't care)
  orientWalls(i, j, s = 1) {
    for (let b = j - 1; b <= j + s; b++) for (let a = i - 1; a <= i + s; a++) {
      const w = this.entities.find((e) => e.kind === 'building'
        && (e.type === 'wall' || e.type === 'gate') && !e.dead
        && a >= e.ti && a < e.ti + e.def.size && b >= e.tj && b < e.tj + e.def.size);
      if (!w) continue;
      const link = (ti, tj) => this.entities.some((e) => e !== w && e.kind === 'building'
        && (e.type === 'wall' || e.type === 'gate') && !e.dead
        && ti >= e.ti && ti < e.ti + e.def.size && tj >= e.tj && tj < e.tj + e.def.size);
      const ew = link(w.ti - 1, w.tj) || link(w.ti + w.def.size, w.tj);
      const ns = link(w.ti, w.tj - 1) || link(w.ti, w.tj + w.def.size);
      w.view.group.rotation.y = (ns && !ew) ? Math.PI / 2 : 0;
    }
  }

  spawnUnit(type, owner, x, z, fromBuilding = false) {
    const def = UNITS[type];
    const p = this.players[owner];
    // ships must launch onto water — search a little wider from the dock
    const free = this.pf.nearestFree(tileOf(x), tileOf(z), def.naval ? 14 : 6, def.naval);
    if (free) { x = worldOf(free[0]); z = worldOf(free[1]); }
    const view = createUnitView(this.registry, type, def, owner, this.factionKeys[owner]);
    view.group.position.set(x, this.heightAtWorld(x, z), z);
    this.scene.add(view.group);
    const hpMult = ((def.aggro > 0 && p.techs.has('training')) ? 1.15 : 1) * p.mods.unitHp
      * (p.techs.has(`elite_${type}`) ? 1.25 : 1);
    const e = {
      id: this.nextId++, kind: 'unit', type, owner, def, view,
      x, z, vx: 0, vz: 0, radius: def.radius || 0.3,
      hp: def.hp * hpMult, maxHp: def.hp * hpMult,
      order: null, oq: [], path: null, pathI: 0, aim: null, losT: 0, stuckT: 0,
      cd: 0, scanT: this.rng() * 0.5, gfxT: 0,
      swing: null, carry: 0, carryType: null, facing: 0,
      stance: 'agg', anchor: null, garrisoned: null,
      dead: false, wasMoving: false, spawnT: fromBuilding ? 0.35 : 0,
    };
    this.entities.push(e);
    p.popUsed++;
    const _tier = this.lineTierOf(owner, type);
    if (_tier && e.view) applyUnitTier(e.view, e.def, owner, _tier);
    if (fromBuilding) {
      p.stats.trained++;
      if (def.naval) p.stats.shipsBuilt++;
      if (def.tags && def.tags.includes('mega')) { p.stats.megaBuilt++; this.narrate('mega'); }
      if (def.naval && def.aggro > 0) this.narrate('firstfleet');
      this.fx && this.fx.spawnPop(x, z, def.color);
      if (owner === this.myId) this.sfx && this.sfx.play('train', 300);
    }
    return e;
  }

  recalcPop(owner) {
    let cap = 0;
    for (const e of this.entities) {
      if (e.kind === 'building' && e.owner === owner && !e.dead && e.built >= 1 && e.def.pop) cap += e.def.pop;
    }
    this.players[owner].popCap = Math.min(POP_MAX, cap);
  }

  // ---------- tech-modified stats ----------
  speedOf(u) {
    const m = this.players[u.owner].mods;
    let s = u.def.speed;
    if (u.def.tags.includes('infantry') || u.def.tags.includes('worker')) s *= m.speedInfantry;
    if (u.def.tags.includes('vehicle') || u.def.tags.includes('raider')) s *= m.speedWheels;
    return s * m.speedAll; // Sugar Rush: a blanket boost every toy feels
  }
  atkOf(e) {
    const m = this.players[e.owner].mods;
    let a = e.def.atk;
    if (e.def.tags.includes('infantry') && e.def.atkType === 'melee') a += m.atkMelee;
    if (e.def.tags.includes('ranged') || e.def.tags.includes('skirmisher')) a += m.atkPierce;
    if (e.def.tags.includes('vehicle')) a += m.atkVehicle;
    if (e.kind === 'unit' && this.players[e.owner].techs.has(`elite_${e.type}`)) a += 2;
    // veterancy: ⭐ 3 kills, ⭐⭐ 6 kills, 👑 legend at 10
    if (e.kills >= 10) a += 3; else if (e.kills >= 6) a += 2; else if (e.kills >= 3) a += 1;
    return a;
  }
  armorOf(e, type) {
    let a = (e.def.armor && e.def.armor[type]) || 0;
    if (e.kind === 'unit') {
      const m = this.players[e.owner].mods;
      a += e.def.tags.includes('infantry') ? m.armorInfantry : m.armorOther; // Quilted Padding
    }
    if (e.kind === 'unit' && this.players[e.owner].techs.has(`elite_${e.type}`)) a += 1;
    if (e.kind === 'unit' && this.players[e.owner].techs.has(`steel_${e.type}`)) a += 1; // Steel armor tier
    if (e.kind === 'building') { const u = this.buildingUpTech(e.type, e.owner); if (u && u.armor) a += u.armor; } // Steelworks
    return a;
  }
  // visual/stat upgrade tier for a unit line: 2 = elite (champion), 1 = steel, 0 = base
  lineTierOf(owner, type) {
    const p = this.players[owner];
    return p.techs.has(`elite_${type}`) ? 2 : p.techs.has(`steel_${type}`) ? 1 : 0;
  }
  // gold halo marks a line-upgraded elite toy
  decorateElite(u) {
    if (u.eliteRing || !u.view) return;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.36, 0.03, 6, 22),
      new THREE.MeshBasicMaterial({ color: 0xffd94a })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    u.eliteRing = ring;
    u.view.group.add(ring);
  }
  carryOf(u) { return u.def.carry + this.players[u.owner].mods.carry; }
  gatherRateOf(u, resType) {
    const m = this.players[u.owner].mods;
    return u.def.gatherRate * m.gather * (resType === 'snacks' ? m.gatherSnacks : 1);
  }

  applyTech(owner, techId) {
    const p = this.players[owner];
    if (p.techs.has(techId)) return;
    p.techs.add(techId);
    const m = p.mods;
    switch (techId) {
      case 'pockets': m.carry += 4; break;
      case 'sorting': m.gatherSnacks *= 1.2; break;
      case 'scissors': m.gather *= 1.15; break;
      case 'shoes': m.speedInfantry *= 1.1; break;
      case 'pencils': m.atkMelee += 1; break;
      case 'bands': m.atkPierce += 1; break;
      case 'springs': m.speedWheels *= 1.12; break;
      case 'tape': m.armorInfantry += 1; break;
      case 'plating':
        for (const e of this.entities) {
          if (e.kind === 'building' && e.owner === owner && !e.dead) {
            const f = e.hp / e.maxHp;
            e.maxHp *= 1.2; e.hp = e.maxHp * f;
          }
        }
        break;
      case 'training':
        for (const e of this.entities) {
          if (e.kind === 'unit' && e.owner === owner && !e.dead && e.def.aggro > 0) {
            const f = e.hp / e.maxHp;
            e.maxHp *= 1.15; e.hp = e.maxHp * f;
          }
        }
        break;
      // ---- Tinker Bench upgrades ----
      case 'whetstone': m.atkMelee += 1; m.atkPierce += 1; m.atkVehicle += 1; break;
      case 'quilting': m.armorOther += 1; break;
      case 'sugarrush': m.speedAll *= 1.08; break;
      case 'overwound': m.atkSpeed *= 0.88; break; // 12% quicker swings
      case 'reinforced':
        for (const e of this.entities) {
          if (e.kind === 'unit' && e.owner === owner && !e.dead && e.def.aggro > 0) {
            const f = e.hp / e.maxHp;
            e.maxHp *= 1.15; e.hp = e.maxHp * f;
          }
        }
        break;
      // ---- civilization signature techs ----
      case 'liveammo': m.atkMelee += 2; m.atkPierce += 2; break;
      case 'nitro': m.speedWheels *= 1.2; m.atkVehicle += 2; break;
      case 'overclock': m.atkSpeed *= 0.88; m.atkPierce += 1; break;
      case 'chivalry': m.atkMelee += 2; m.speedInfantry *= 1.08; break;
      case 'interlock':
        m.buildingHp *= 1.3; // future builds
        for (const e of this.entities) {
          if (e.kind === 'building' && e.owner === owner && !e.dead) {
            const f = e.hp / e.maxHp;
            e.maxHp *= 1.3; e.hp = e.maxHp * f;
          }
        }
        break;
      case 'grouphug':
        m.healRate *= 1.6; m.unitHp *= 1.1; // future units
        for (const e of this.entities) {
          if (e.kind === 'unit' && e.owner === owner && !e.dead) {
            const f = e.hp / e.maxHp;
            e.maxHp *= 1.1; e.hp = e.maxHp * f;
          }
        }
        break;
      // ---- building tier upgrades ----
      case 'pentower': this.upgradeBuildingsOfType(owner, 'tower'); break;
      case 'steelwork':
        this.upgradeBuildingsOfType(owner, 'wall');
        this.upgradeBuildingsOfType(owner, 'gate');
        break;
    }
    // unit-line upgrades: re-skin + promote every living toy of the line on the spot
    if (techId.startsWith('elite_') || techId.startsWith('steel_')) {
      const elite = techId.startsWith('elite_');
      const line = techId.slice(elite ? 6 : 6);
      const tier = this.lineTierOf(owner, line);
      for (const e of this.entities) {
        if (e.kind === 'unit' && e.owner === owner && !e.dead && e.type === line) {
          if (elite) { const f = e.hp / e.maxHp; e.maxHp = Math.round(e.maxHp * 1.25); e.hp = e.maxHp * f; }
          if (e.view) applyUnitTier(e.view, e.def, owner, tier);
          // gold flourish so the promotion reads on the battlefield
          if (this.fx && this.fog.state(e.x, e.z) === 2) this.fx.promote(e.x, e.z);
        }
      }
    }
    if (owner === this.myId) {
      this.alert(`${TECHS[techId].name} researched!`, 'info');
      this.sfx && this.sfx.play('research');
    }
  }

  // the building-tier upgrade this owner has unlocked for a type (or null)
  buildingUpTech(type, owner) {
    const u = BUILDING_UP[type];
    return (u && this.players[owner].techs.has(u.tech)) ? u : null;
  }
  // level up every standing building of a type: boost HP + swap to the upgraded model
  upgradeBuildingsOfType(owner, type) {
    const u = BUILDING_UP[type];
    if (!u) return;
    for (const b of this.entities) {
      if (b.kind !== 'building' || b.owner !== owner || b.dead || b.type !== type) continue;
      const f = b.hp / b.maxHp;
      b.maxHp = Math.round(b.maxHp * u.hpMul);
      b.hp = b.maxHp * f;
      this.rebuildBuildingView(b);
      b.view.hpBar.set(b.hp / b.maxHp);
    }
  }
  // rebuild a building's mesh for its current tier + age, keeping its state
  rebuildBuildingView(b) {
    const up = !!this.buildingUpTech(b.type, b.owner);
    const age = this.players[b.owner].age;
    const wasSel = this.selected.includes(b);
    this.scene.remove(b.view.group);
    b.view = createBuildingView(b.type, b.def, b.owner, b.ti * 977 + b.tj, up, age, this.factionKeys[b.owner]);
    b.view.group.position.set(b.x, this.tileHeight(b.ti, b.tj), b.z);
    b.view.setProgress(b.built);
    b.view.hpBar.set(b.hp / b.maxHp);
    this.scene.add(b.view.group);
    if (wasSel) b.view.setSelected(true);
    if (b.type === 'gate') this.orientWalls(b.ti, b.tj, b.def.size);
  }
  // re-dress every one of an owner's buildings to their current age (on age-up)
  reageBuildings(owner) {
    for (const b of this.entities) {
      if (b.kind === 'building' && b.owner === owner && !b.dead) this.rebuildBuildingView(b);
    }
  }

  // ---------- economy helpers ----------
  canAfford(owner, cost) {
    const r = this.players[owner].res;
    return Object.entries(cost).every(([k, v]) => r[k] >= v);
  }
  pay(owner, cost, sign = 1) {
    const r = this.players[owner].res;
    for (const [k, v] of Object.entries(cost)) r[k] -= v * sign;
  }
  // live rates: what a lot sells for / costs right now, at market price
  sellRate(res) { return Math.max(4, Math.round(MARKET.sellGain * (this.market[res] || 1))); }
  buyRate(res) { return Math.round(MARKET.buyCost * (this.market[res] || 1)); }

  trade(owner, res, dir) {
    const p = this.players[owner];
    if (dir === 'sell') {
      if (p.res[res] < MARKET.lot) return false;
      p.res[res] -= MARKET.lot;
      p.res.buttons += this.sellRate(res);
      // flooding the market with a good drives its price down
      this.market[res] = Math.max(0.4, (this.market[res] || 1) * 0.97);
    } else {
      if (p.res.buttons < this.buyRate(res)) return false;
      p.res.buttons -= this.buyRate(res);
      p.res[res] += MARKET.lot;
      // demand pushes the price up
      this.market[res] = Math.min(2.2, (this.market[res] || 1) * 1.04);
    }
    if (owner === this.myId) this.sfx && this.sfx.play('trade');
    return true;
  }

  // ally tribute (team games): send a lot of a resource, minus a 30% tax
  tribute(fromId, res, toId) {
    const a = this.players[fromId], b = this.players[toId];
    if (!a || !b || fromId === toId) return false;
    if (this.teamOf(fromId) !== this.teamOf(toId)) return false; // allies only
    const amt = 100;
    if ((a.res[res] || 0) < amt) return false;
    a.res[res] -= amt;
    b.res[res] += Math.round(amt * 0.7);
    if (fromId === this.myId) { this.alert(`Sent ${amt} ${RES_META[res].name} to your ally.`, 'info'); this.sfx && this.sfx.play('trade'); }
    else if (toId === this.myId) this.alert(`Your ally sent you ${Math.round(amt * 0.7)} ${RES_META[res].name}!`, 'info');
    return true;
  }

  // ---------- teams ----------
  teamOf(owner) {
    return owner >= 0 && this.players[owner] ? this.players[owner].team : -9;
  }
  isEnemy(a, b) {
    if (a < 0 || b < 0) return false; // gaia hates no one
    return this.teamOf(a) !== this.teamOf(b);
  }
  teamOwners(team) {
    return this.players.filter((p) => p.team === team).map((p) => p.id);
  }
  get myTeam() { return this.teamOf(this.myId); }
  // how this client refers to another player in alerts
  nameOf(owner) {
    if (owner === this.myId) return 'You';
    if (owner < 0 || !this.players[owner]) return 'Someone';
    return this.teamOf(owner) === this.myTeam ? 'Your ally' : TEAM_NAMES[1];
  }

  // ---------- selection ----------
  setSelection(list) {
    // defensive: a view without the selection contract must never brick input
    for (const e of this.selected) e.view && e.view.setSelected && e.view.setSelected(false);
    this.selected = list.filter((e) => !e.dead);
    for (const e of this.selected) e.view && e.view.setSelected && e.view.setSelected(true);
    this.cb.selection();
  }

  // ---------- commands ----------
  setOrder(u, order, queued) {
    if (queued && (u.order || u.oq.length)) { u.oq.push(order); return; }
    u.order = order;
    u.oq.length = queued ? u.oq.length : 0;
    u.path = null; u.aim = null; u.losT = 0;
    u.anchor = null; // explicit orders reset the defensive-stance leash
    u.idleT = 0;     // fresh marching orders reset the idle-hands clock
    if (!queued) u.swing = null;
  }
  cmdMove(units, x, z, queued = false, amove = false, formation = 'box') {
    // formation facing the direction of travel (no more spiral blob):
    // box = tight grid, line = 2-deep rank, spread = loose grid vs splash
    const list = units.filter((u) => u.kind === 'unit' && !u.dead);
    if (!list.length) return;
    if (list.length === 1) {
      this.setOrder(list[0], { type: amove ? 'amove' : 'move', x, z }, queued);
      return;
    }
    let cx = 0, cz = 0;
    for (const u of list) { cx += u.x; cz += u.z; }
    cx /= list.length; cz /= list.length;
    const ang = Math.atan2(x - cx, z - cz);
    const cols = formation === 'line'
      ? Math.ceil(list.length / 2)
      : Math.ceil(Math.sqrt(list.length));
    const spacing = formation === 'spread' ? 1.5 : 0.75;
    // give nearby units nearby slots so they don't cross paths
    const px = Math.cos(ang), pz = -Math.sin(ang);
    const sorted = list.slice().sort((a, b) => (a.x * px + a.z * pz) - (b.x * px + b.z * pz));
    const hClick = inMap(tileOf(x), tileOf(z)) ? this.height[idx(tileOf(x), tileOf(z))] : 0;
    sorted.forEach((u, k) => {
      // line fills column-major (adjacent toys stack front/back in the same
      // column) so the laterally-sorted order is preserved — row-major made
      // the whole left half of the army file across to the front row
      const row = formation === 'line' ? k % 2 : Math.floor(k / cols);
      const col = formation === 'line' ? (k >> 1) : k % cols;
      const ox = (col - (cols - 1) / 2) * spacing;
      const oz = -row * spacing;
      const rx = ox * Math.cos(ang) + oz * Math.sin(ang);
      const rz = -ox * Math.sin(ang) + oz * Math.cos(ang);
      let sx = x + rx, sz = z + rz;
      // slots that land across a cliff edge from the click collapse onto the
      // click point — otherwise half the squad marches off to find a ramp
      const si = tileOf(sx), sj = tileOf(sz);
      if (!inMap(si, sj) || Math.abs(this.height[idx(si, sj)] - hClick) > CLIMB) { sx = x; sz = z; }
      this.setOrder(u, { type: amove ? 'amove' : 'move', x: sx, z: sz }, queued);
    });
  }
  cmdAttack(units, target, queued = false) {
    for (const u of units) {
      if (u.kind !== 'unit' || u.dead) continue;
      this.setOrder(u, { type: 'attack', target, auto: false }, queued);
    }
  }
  cmdGather(units, node, queued = false) {
    for (const u of units) {
      if (u.kind !== 'unit' || u.dead) continue;
      // floating piles are skimmer-only; land piles and farms are worker-only
      const aquatic = node.kind === 'resource' && node.aquatic;
      const canHarvest = aquatic ? !!u.def.gatherNaval : u.type === 'worker';
      if (!canHarvest) { this.setOrder(u, { type: 'move', x: node.x, z: node.z }, queued); continue; }
      const resType = node.kind === 'building' ? 'snacks' : node.resType;
      if (u.carryType !== resType) u.carry = 0;
      u.carryType = resType;
      this.setOrder(u, { type: 'gather', node, phase: 'to', resType }, queued);
    }
  }
  cmdBuild(units, b, queued = false) {
    for (const u of units) {
      if (u.kind !== 'unit' || u.dead || u.type !== 'worker') continue;
      this.setOrder(u, { type: 'build', b }, queued);
    }
  }
  stopUnits(units) {
    for (const u of units) if (u.kind === 'unit') { u.order = null; u.oq.length = 0; u.path = null; u.aim = null; u.swing = null; }
  }

  // ---------- command routing (SP: immediate; MP: lockstep-scheduled) ----------
  issue(cmd) {
    if (this.replayFeed) return; // playback: the log is the only commander
    if (this.mp && this.net) this.net.queueLocal(cmd);
    else {
      if (this.cmdLog) this.cmdLog.push({ k: this.frame, c: JSON.parse(JSON.stringify(cmd)) });
      this.execCommand(this.myId, cmd);
    }
  }

  execCommand(pid, c) {
    const ent = (id) => this.entities.find((e) => e.id === id && !e.dead);
    const units = () => (c.ids || []).map(ent).filter(Boolean)
      .filter((u) => u.kind === 'unit' && u.owner === pid);
    switch (c.t) {
      case 'move': this.cmdMove(units(), c.x, c.z, c.q, c.am, c.f); break;
      case 'attack': { const t = ent(c.tid); if (t) this.cmdAttack(units(), t, c.q); break; }
      case 'stance': {
        for (const u of units()) if (u.def.aggro > 0) { u.stance = c.s; u.anchor = null; }
        break;
      }
      case 'patrol': {
        for (const u of units()) {
          if (!(u.def.aggro > 0)) continue;
          this.setOrder(u, { type: 'patrol', ax: u.x, az: u.z, bx: c.x, bz: c.z, leg: 1 }, c.q);
        }
        break;
      }
      case 'guard': {
        const t = ent(c.tid);
        if (t && t.kind === 'unit') {
          for (const u of units()) {
            if (u === t || !(u.def.aggro > 0)) continue;
            this.setOrder(u, { type: 'guard', target: t }, c.q);
          }
        }
        break;
      }
      case 'garrison': {
        const b = ent(c.tid);
        if (b && b.kind === 'building' && b.owner === pid && b.built >= 1 && b.def.garrison) {
          for (const u of units()) if (!u.garrisoned && !u.def.fly) this.setOrder(u, { type: 'garrison', b }, c.q);
        }
        break;
      }
      case 'ungar': {
        const b = ent(c.id);
        if (b && b.kind === 'building' && b.owner === pid) this.ungarrison(b);
        break;
      }
      case 'bell': this.townBell(pid); break;
      case 'demolish': {
        const b = ent(c.id);
        if (b && b.kind === 'building' && b.owner === pid && !b.dead) this.kill(b, null, true);
        break;
      }
      case 'flare': {
        // pure signal — no sim state, but delivered to both clients in MP
        this.flarePing = { x: c.x, z: c.z, t: 5, owner: pid };
        this.alert(pid === this.myId ? 'Flare placed.' : '⚠ Flare! Your ally wants eyes here.', pid === this.myId ? 'info' : 'warn', { x: c.x, z: c.z });
        break;
      }
      case 'troute': {
        const b = ent(c.tid);
        if (b && b.kind === 'building' && b.owner === pid && b.def.market && b.built >= 1) {
          for (const u of units()) if (u.def.trade) this.setOrder(u, { type: 'traderoute', mid: b.id, phase: 'to' }, c.q);
        }
        break;
      }
      case 'aground': {
        for (const u of units()) {
          if (u.def.projectile && u.def.projectile.splash) {
            this.setOrder(u, { type: 'aground', x: c.x, z: c.z }, c.q);
          }
        }
        break;
      }
      case 'gather': { const t = ent(c.tid); if (t) this.cmdGather(units(), t, c.q); break; }
      case 'buildAt': { const t = ent(c.tid); if (t && t.owner === pid) this.cmdBuild(units(), t, c.q); break; }
      case 'stop': this.stopUnits(units()); break;
      case 'rally': {
        for (const id of c.ids || []) {
          const b = ent(id);
          if (b && b.kind === 'building' && b.owner === pid && (b.def.trains || b.def.dropoff)) {
            b.rally = { x: c.x, z: c.z, entityId: c.tid || null };
          }
        }
        break;
      }
      case 'place': {
        const b = this.tryPlaceBuilding(pid, c.type, c.i, c.j);
        if (b) this.cmdBuild(units(), b, c.q);
        break;
      }
      case 'train': { const b = ent(c.id); if (b && b.owner === pid) this.trainUnit(b, c.unit); break; }
      case 'tech': { const b = ent(c.id); if (b && b.owner === pid) this.researchTech(b, c.tech); break; }
      case 'cancel': { const b = ent(c.id); if (b && b.owner === pid) this.cancelQueue(b, c.i); break; }
      case 'age': { const b = ent(c.id); if (b && b.owner === pid) this.startAgeUp(b); break; }
      case 'trade': this.trade(pid, c.res, c.dir); break;
      case 'tribute': this.tribute(pid, c.res, c.toId); break;
    }
  }

  // deterministic-ish digest of sim state for desync detection
  stateHash() {
    let h = 0 | 0;
    for (const e of this.entities) {
      if (e.removed) continue;
      h = (h * 31 + e.id) | 0;
      h = (h + ((e.x * 64) | 0) * 7 + ((e.z * 64) | 0) * 13) | 0;
      h = (h + ((e.hp || 0) * 4 | 0)) | 0;
      if (e.stance === 'def') h = (h + 5) | 0;
      else if (e.stance === 'stand') h = (h + 9) | 0;
      if (e.garrisoned) h = (h + 17) | 0;
      // objectives: who holds them and (throne) for how long drives win state
      if (e.kind === 'objective') h = (h + (e.holder + 2) * 29 + ((e.holdTime || 0) * 8 | 0) * 3) | 0;
    }
    for (const p of this.players) {
      h = (h + ((p.res.snacks | 0) * 3) + ((p.res.blocks | 0) * 5)
        + ((p.res.buttons | 0) * 7) + ((p.res.marbles | 0) * 11) + p.popUsed * 13) | 0;
    }
    // commodity prices are shared sim state — fold them in
    h = (h + (this.market.snacks * 100 | 0) * 17 + (this.market.blocks * 100 | 0) * 19
      + (this.market.marbles * 100 | 0) * 23) | 0;
    return h;
  }

  // ---------- save / load (single-player snapshot) ----------
  // orders hold live entity refs; persist them as `field#` = entity id
  encOrder(o) {
    if (!o) return null;
    const c = {};
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object') {
        if (k === 'then') c.then = this.encOrder(v);
        else if (v.id !== undefined) c[`${k}#`] = v.id;
        // ground pseudo-targets and other ref-less objects are dropped;
        // the order simply restarts cleanly after load
      } else c[k] = v;
    }
    return c;
  }
  decOrder(c, byId) {
    if (!c) return null;
    const o = {};
    for (const [k, v] of Object.entries(c)) {
      if (k === 'then') o.then = this.decOrder(v, byId);
      else if (k.endsWith('#')) {
        const e = byId.get(v);
        if (!e) return null; // referenced toy didn't survive the save — drop order
        o[k.slice(0, -1)] = e;
      } else o[k] = v;
    }
    return o;
  }

  snapshot() {
    return {
      v: 2,
      opts: {
        seed: this.seedUsed, map: this.mapKey, difficulty: this.diffKey,
        factions: [...this.factionKeys], gameMode: this.gameMode, startRes: this.startResKey,
        playerDefs: this.playerDefs.map((d, i) => ({ team: d.team, isAI: !!d.isAI, faction: this.factionKeys[i] })),
      },
      time: this.time, nextId: this.nextId, rng: this.rng.getState(),
      blocked: Array.from(this.blocked), gateOwner: Array.from(this.gateOwner),
      water: Array.from(this.water),
      aiState: Object.fromEntries(Object.entries(this.aiState).map(([k, st]) => {
        const { diff, ...rest } = st;
        return [k, { ...rest, attackTarget: null }];
      })),
      wonder: this.wonderState ? { ...this.wonderState } : null,
      relic: this.relicState ? { ...this.relicState } : null,
      survival: this.survival ? { ...this.survival } : null,
      market: { ...this.market },
      timeline: this.timeline,
      // one-shot narrator beats + scripted mission moments must not replay on load
      told: Object.keys(this).filter((k) => k.startsWith('_told_') && this[k]),
      evDone: this.missionEvents ? this.missionEvents.map((e) => !!e.done) : null,
      players: this.players.map((p) => ({
        res: { ...p.res }, age: p.age, aging: p.aging, popUsed: p.popUsed, popCap: p.popCap,
        techs: [...p.techs], mods: { ...p.mods }, stats: { ...p.stats }, bell: !!p.bell,
      })),
      entities: this.entities.filter((e) => !e.dead).map((e) => {
        if (e.kind === 'unit') {
          return {
            k: 'u', id: e.id, type: e.type, owner: e.owner, x: e.x, z: e.z,
            hp: e.hp, maxHp: e.maxHp, carry: e.carry, carryType: e.carryType,
            stance: e.stance, kills: e.kills || 0, garrisoned: e.garrisoned || null,
            facing: e.facing, isKing: !!e.isKing,
            order: this.encOrder(e.order), oq: e.oq.map((o) => this.encOrder(o)),
            fleeResume: this.encOrder(e.fleeResume), bellResume: this.encOrder(e.bellResume),
          };
        }
        if (e.kind === 'building') {
          return {
            k: 'b', id: e.id, type: e.type, owner: e.owner, ti: e.ti, tj: e.tj,
            hp: e.hp, maxHp: e.maxHp, built: e.built,
            queue: e.queue.map((q) => ({ ...q })), rally: e.rally ? { ...e.rally } : null,
            garrisonIds: [...e.garrisonIds],
          };
        }
        if (e.kind === 'resource') {
          return { k: 'r', id: e.id, resType: e.resType, ti: e.ti, tj: e.tj, amount: e.amount };
        }
        if (e.kind === 'critter') {
          return { k: 'c', id: e.id, type: e.type, x: e.x, z: e.z, hx: e.hx, hz: e.hz, captor: e.captor, facing: e.facing, tf: e.trailFlip ? 1 : 0 };
        }
        if (e.kind === 'lost') {
          return { k: 'l', id: e.id, type: e.type, x: e.x, z: e.z, carrier: e.carrier };
        }
        if (e.kind === 'camp') {
          return { k: 'w', id: e.id, x: e.x, z: e.z, prog: e.prog, holdTeam: e.holdTeam, captured: e.captured, progPid: e.progPid ?? -1 };
        }
        if (e.kind === 'cat') {
          return { k: 'ct', id: e.id, x: e.x, z: e.z, state: e.state, stateT: e.stateT, swatT: e.swatT, facing: e.facing };
        }
        if (e.type === 'throne') {
          return { k: 'h', id: e.id, x: e.x, z: e.z, holder: e.holder, holdTime: e.holdTime || 0, holdTeam: e.holdTeam ?? -1 };
        }
        return { k: 'o', id: e.id, x: e.x, z: e.z, holder: e.holder };
      }),
    };
  }

  // call on a freshly set-up Game built with the snapshot's opts: wipes the
  // generated entities and rebuilds the exact saved battle state
  restore(snap) {
    for (const e of this.entities) e.view && this.scene.remove(e.view.group);
    this.entities.length = 0;
    this.selected = [];
    this.cmdLog = null; // resumed games have a gap in the log — no replay for them
    for (const pr of this.projectiles) this.scene.remove(pr.mesh);
    this.projectiles.length = 0;
    this.blocked.set(snap.blocked);
    this.gateOwner.set(snap.gateOwner);
    if (snap.water) this.water.set(snap.water);
    snap.players.forEach((sp, i) => {
      const p = this.players[i];
      Object.assign(p.res, sp.res);
      p.age = sp.age; p.aging = sp.aging; p.popUsed = sp.popUsed; p.popCap = sp.popCap;
      p.techs = new Set(sp.techs);
      Object.assign(p.mods, sp.mods);
      Object.assign(p.stats, sp.stats);
      p.bell = sp.bell;
    });
    const byId = new Map();
    for (const se of snap.entities) {
      let e = null;
      if (se.k === 'u') {
        const def = UNITS[se.type];
        const view = createUnitView(this.registry, se.type, def, se.owner, this.factionKeys[se.owner]);
        view.group.position.set(se.x, this.heightAtWorld(se.x, se.z), se.z);
        view.group.rotation.y = se.facing || 0;
        this.scene.add(view.group);
        e = {
          id: se.id, kind: 'unit', type: se.type, owner: se.owner, def, view,
          x: se.x, z: se.z, vx: 0, vz: 0, radius: def.radius || 0.3, hp: se.hp, maxHp: se.maxHp,
          order: null, oq: [], path: null, pathI: 0, aim: null, losT: 0, stuckT: 0,
          cd: 0, scanT: 0.3, gfxT: 0, swing: null, carry: se.carry, carryType: se.carryType,
          stance: se.stance || 'agg', anchor: null, garrisoned: se.garrisoned || null,
          facing: se.facing || 0, kills: se.kills || 0, isKing: !!se.isKing,
          dead: false, wasMoving: false, spawnT: 0,
        };
        if (e.isKing) { e.kingCrown = createKingCrown(); view.group.add(e.kingCrown); }
        if (e.kills >= 3) { e.rankBadge = makeRankBadge(e.kills >= 10 ? 3 : e.kills >= 6 ? 2 : 1); view.group.add(e.rankBadge); }
        { const _t = this.lineTierOf(e.owner, e.type); if (_t) applyUnitTier(e.view, e.def, e.owner, _t); }
        if (e.garrisoned) view.group.visible = false;
        view.hpBar.set(e.hp / e.maxHp);
      } else if (se.k === 'b') {
        const def = BUILDINGS[se.type];
        const s = def.size;
        const view = createBuildingView(se.type, def, se.owner, se.ti * 977 + se.tj, !!this.buildingUpTech(se.type, se.owner), this.players[se.owner].age, this.factionKeys[se.owner]);
        const x = worldOf(se.ti) + (s - 1) / 2, z = worldOf(se.tj) + (s - 1) / 2;
        view.group.position.set(x, this.tileHeight(se.ti, se.tj), z);
        this.scene.add(view.group);
        if (def.gate) for (let b = se.tj; b < se.tj + s; b++) for (let a = se.ti; a < se.ti + s; a++) this.gateOwner[idx(a, b)] = se.owner;
        e = {
          id: se.id, kind: 'building', type: se.type, owner: se.owner, def, view,
          x, z, ti: se.ti, tj: se.tj, radius: s * 0.55,
          hp: se.hp, maxHp: se.maxHp, built: se.built,
          queue: se.queue.map((q) => ({ ...q })), rally: se.rally ? { ...se.rally } : null,
          cd: 0, scanT: 0, smokeT: 0, garrisonIds: [...se.garrisonIds],
          dead: false, seen: !this.isEnemy(this.myId, se.owner), gatherer: null,
        };
        view.setProgress(e.built);
        view.hpBar.set(e.hp / e.maxHp);
      } else if (se.k === 'r') {
        const view = createResourceView(se.resType, se.ti * 131 + se.tj, this.water[idx(se.ti, se.tj)] === 1);
        view.group.position.set(worldOf(se.ti), this.heightAtWorld(worldOf(se.ti), worldOf(se.tj)), worldOf(se.tj));
        this.scene.add(view.group);
        e = {
          id: se.id, kind: 'resource', resType: se.resType, owner: -1,
          aquatic: this.water[idx(se.ti, se.tj)] === 1,
          x: worldOf(se.ti), z: worldOf(se.tj), ti: se.ti, tj: se.tj, radius: 0.55,
          amount: se.amount, def: { name: RES_META[se.resType].nodeName },
          view, dead: false,
        };
      } else if (se.k === 'c') {
        const cType = se.type || 'mouse';
        const ct = CRITTER_TYPES[cType] || CRITTER_TYPES.mouse;
        const view = createCritterView(cType);
        view.group.position.set(se.x, this.heightAtWorld(se.x, se.z), se.z);
        this.scene.add(view.group);
        e = {
          id: se.id, kind: 'critter', type: cType, owner: -1,
          x: se.x, z: se.z, hx: se.hx ?? se.x, hz: se.hz ?? se.z, trailFlip: !!se.tf,
          radius: 0.25, captor: se.captor, facing: se.facing || 0,
          wanderT: 1, scanT: 0.3,
          def: { name: ct.name, desc: ct.desc },
          view, dead: false,
        };
      } else if (se.k === 'l') {
        const view = createLostToyView(se.type);
        view.group.position.set(se.x, this.heightAtWorld(se.x, se.z), se.z);
        this.scene.add(view.group);
        e = {
          id: se.id, kind: 'lost', type: se.type, owner: -1,
          x: se.x, z: se.z, radius: 0.5, carrier: se.carrier ?? -1, scanT: 0.5,
          def: { name: LOST_TOYS.names[se.type] || 'a lost toy', desc: `A stray. A worker who wanders close will carry it home for +${LOST_TOYS.bounty} Buttons.` },
          view, dead: false,
        };
      } else if (se.k === 'w') {
        const view = createCampView();
        view.group.position.set(se.x, this.heightAtWorld(se.x, se.z), se.z);
        this.scene.add(view.group);
        e = {
          id: se.id, kind: 'camp', owner: -1,
          x: se.x, z: se.z, radius: 1.6, prog: se.prog || 0, holdTeam: se.holdTeam ?? -1,
          captured: se.captured ?? -1, progPid: (se.progPid ?? -1) >= 0 ? se.progPid : undefined, scanT: 0.5,
          def: { name: 'Wild Toy Camp', desc: WILD_TRIBES.desc },
          view, dead: false,
        };
        if (e.captured >= 0) view.setOwner(this.players[e.captured].team === this.myTeam ? 0x3b82f6 : 0xe4572e);
      } else if (se.k === 'ct') {
        const view = createCatView();
        view.group.position.set(se.x, this.heightAtWorld(se.x, se.z), se.z);
        this.scene.add(view.group);
        if (se.state === 'nap') view.setNap(true);
        e = {
          id: se.id, kind: 'cat', owner: -1,
          x: se.x, z: se.z, radius: 1.1, facing: se.facing || 0,
          state: se.state || 'walk', stateT: se.stateT ?? 5, tgt: null, swatT: se.swatT || 0,
          def: { name: 'The House Cat', desc: 'She cannot be fought, only respected. Keep your toys together.' },
          view, dead: false,
        };
      } else if (se.k === 'h') {
        const view = createThroneView();
        view.group.position.set(se.x, this.heightAtWorld(se.x, se.z), se.z);
        this.scene.add(view.group);
        e = {
          id: se.id, kind: 'objective', type: 'throne', owner: -1,
          x: se.x, z: se.z, radius: 2.2, holder: se.holder, holdTime: se.holdTime || 0,
          holdTeam: se.holdTeam ?? -1, scanT: 0,
          def: { name: 'Golden Throne', desc: 'Hold it with a military toy to rule the bedroom.' },
          view, dead: false,
        };
      } else {
        const view = createStickerView();
        view.group.position.set(se.x, this.heightAtWorld(se.x, se.z), se.z);
        this.scene.add(view.group);
        e = {
          id: se.id, kind: 'objective', type: 'sticker', owner: -1,
          x: se.x, z: se.z, radius: 0.7, holder: se.holder, scanT: 0.3,
          def: { name: 'Lost Sticker', desc: `Hold with military toys: +${STICKER.incomePerSec} 🔘/s` },
          view, dead: false,
        };
      }
      byId.set(e.id, e);
      this.entities.push(e);
    }
    // second pass: orders can reference any rebuilt entity
    for (const se of snap.entities) {
      if (se.k !== 'u') continue;
      const u = byId.get(se.id);
      u.order = this.decOrder(se.order, byId);
      u.oq = (se.oq || []).map((c) => this.decOrder(c, byId)).filter(Boolean);
      u.fleeResume = this.decOrder(se.fleeResume, byId);
      u.bellResume = this.decOrder(se.bellResume, byId);
    }
    // carried strays re-link to their carriers (the ride resumes mid-step)
    for (const e of this.entities) {
      if (e.kind === 'lost' && e.carrier >= 0) {
        const u = byId.get(e.carrier);
        if (u && !u.dead) u.carryLost = e.id;
        else e.carrier = -1;
      }
    }
    // restored wall lines pick their run direction back up
    for (const e of this.entities) {
      if (e.kind === 'building' && (e.def.wall || e.def.gate) && !e.dead) {
        this.orientWalls(e.ti, e.tj, e.def.size);
      }
    }
    this.nextId = snap.nextId;
    this.time = snap.time;
    this.tlT = 10;
    this.rng.setState(snap.rng);
    // re-arm one-shot flags so narrator beats and mission moments don't replay
    for (const k of snap.told || []) this[k] = true;
    if (snap.evDone && this.missionEvents) {
      snap.evDone.forEach((d, i) => { if (this.missionEvents[i]) this.missionEvents[i].done = d; });
    }
    if (snap.aiState) {
      for (const [k, st] of Object.entries(snap.aiState)) {
        if (this.aiState[k]) Object.assign(this.aiState[k], st, { diff: this.aiState[k].diff });
      }
    } else if (snap.ai && this.aiState[1]) {
      Object.assign(this.aiState[1], snap.ai); // v1 saves: single AI
    }
    this.wonderState = snap.wonder ? { ...snap.wonder } : null;
    this.relicState = snap.relic ? { ...snap.relic } : null;
    // survival: setup() already re-derived the den anchor from map+seed; only the
    // mutable wave counters need restoring on top of it
    if (snap.survival && this.survival) Object.assign(this.survival, snap.survival);
    if (snap.market) this.market = { ...snap.market };
    this.timeline = snap.timeline || [];
    this.taunted = true;
    this.fog.update(this.entities, this.teamOwners(this.myTeam));
  }

  rightClick(x, z, target, queued = false) {
    const sel = this.selected.filter((e) => e.owner === this.myId && !e.dead);
    if (!sel.length) return null;
    const units = sel.filter((e) => e.kind === 'unit');
    const ids = units.map((u) => u.id);
    if (!units.length) {
      const bids = sel.filter((b) => b.kind === 'building' && (b.def.trains || b.def.dropoff)).map((b) => b.id);
      if (bids.length) {
        this.issue({ t: 'rally', ids: bids, x, z, tid: target ? target.id : null });
        return 'rally';
      }
      return null;
    }
    if (target && this.isEnemy(this.myId, target.owner) && (target.kind === 'unit' || target.kind === 'building')) {
      this.issue({ t: 'attack', ids, tid: target.id, q: queued }); return 'attack';
    }
    if (target && (target.kind === 'resource'
        || (target.kind === 'building' && target.owner === this.myId && target.def.farm && target.built >= 1))) {
      this.issue({ t: 'gather', ids, tid: target.id, q: queued }); return 'gather';
    }
    if (target && target.owner === this.myId && target.kind === 'building'
        && (target.built < 1 || target.hp < target.maxHp - 1)) {
      this.issue({ t: 'buildAt', ids, tid: target.id, q: queued }); return 'build';
    }
    // carts right-clicked onto a market start a trade route
    if (target && target.owner === this.myId && target.kind === 'building'
        && target.built >= 1 && target.def.market && units.some((u) => u.def.trade)) {
      this.issue({ t: 'troute', ids: units.filter((u) => u.def.trade).map((u) => u.id), tid: target.id, q: queued });
      return 'trade';
    }
    // right-click a healthy garrisonable building: pile inside
    if (target && target.owner === this.myId && target.kind === 'building'
        && target.built >= 1 && target.def.garrison) {
      this.issue({ t: 'garrison', ids, tid: target.id, q: queued }); return 'garrison';
    }
    // right-click a friendly toy with military selected: bodyguard duty
    if (target && target.owner === this.myId && target.kind === 'unit') {
      const mil = units.filter((u) => u.def.aggro > 0 && u !== target);
      if (mil.length) {
        this.issue({ t: 'guard', ids: mil.map((u) => u.id), tid: target.id, q: queued });
        return 'guard';
      }
    }
    this.issue({ t: 'move', ids, x, z, q: queued, f: this.formation }); return 'move';
  }

  // ---------- building placement ----------
  // is this tile inside one of `owner`'s standing walls?
  ownWallAt(owner, i, j) {
    return this.entities.some((e) => e.kind === 'building' && e.type === 'wall'
      && e.owner === owner && !e.dead
      && i >= e.ti && i < e.ti + e.def.size && j >= e.tj && j < e.tj + e.def.size);
  }

  canPlace(owner, type, i, j) {
    const def = BUILDINGS[type];
    if (def.faction && this.factionKeys[owner] !== def.faction) return false;
    if (this.gameMode === 'sudden' && type === 'chest') return false; // no second life
    if ((def.age || 1) > this.players[owner].age) return false;
    const s = def.size;
    if (!inMap(i, j) || !inMap(i + s - 1, j + s - 1)) return false;
    for (let b = j; b < j + s; b++) for (let a = i; a < i + s; a++) {
      // gates may replace your own wall segments (AoE gate-over-wall)
      if (this.blocked[idx(a, b)] && !(def.gate && this.ownWallAt(owner, a, b))) return false;
    }
    // buildings need flat ground; 1-tile walls may perch anywhere (ramp forts!)
    if (s > 1 && !this.flatAt(i, j, s, s)) return false;
    // a Dock must sit at the water's edge (a water tile in the surrounding ring)
    if (def.dock) {
      let touchesWater = false;
      for (let b = j - 1; b <= j + s && !touchesWater; b++) {
        for (let a = i - 1; a <= i + s && !touchesWater; a++) {
          if (inMap(a, b) && this.water[idx(a, b)]) touchesWater = true;
        }
      }
      if (!touchesWater) return false;
    }
    for (const e of this.entities) {
      if (e.kind !== 'unit' || e.dead || e.garrisoned) continue;
      const ti = tileOf(e.x), tj = tileOf(e.z);
      if (ti >= i && ti < i + s && tj >= j && tj < j + s) return false;
    }
    return true;
  }
  tryPlaceBuilding(owner, type, i, j) {
    const def = BUILDINGS[type];
    if (!this.canPlace(owner, type, i, j)) return null;
    if (!this.canAfford(owner, def.cost)) {
      if (owner === this.myId) { this.alert('Not enough resources.', 'warn'); this.sfx && this.sfx.play('error'); }
      return null;
    }
    this.pay(owner, def.cost);
    // a gate placed on a wall line quietly swallows the covered segments
    if (def.gate) {
      for (const e of [...this.entities]) {
        if (e.kind === 'building' && e.type === 'wall' && e.owner === owner && !e.dead
            && e.ti >= i && e.ti < i + def.size && e.tj >= j && e.tj < j + def.size) {
          this.kill(e, null, true);
        }
      }
    }
    if (owner === this.myId) this.sfx && this.sfx.play('place');
    return this.addBuilding(type, owner, i, j, false);
  }

  // ---------- production & research ----------
  trainUnit(b, type) {
    const p = this.players[b.owner];
    const def = UNITS[type];
    if (b.built < 1 || b.dead) return false;
    // faction uniques only muster for their own tribe
    if (def.faction && this.factionKeys[b.owner] !== def.faction) return false;
    if ((def.age || 1) > p.age) { if (b.owner === this.myId) this.alert(`${def.name} needs the ${AGES[def.age - 1]}.`, 'warn'); return false; }
    if (b.type === 'chest' && p.aging > 0) { if (b.owner === this.myId) this.alert('Toy Chest is busy researching the next age.', 'warn'); return false; }
    if (b.queue.length >= 5) return false;
    if (!this.canAfford(b.owner, def.cost)) {
      if (b.owner === this.myId) { this.alert('Not enough resources.', 'warn'); this.sfx && this.sfx.play('error'); }
      return false;
    }
    this.pay(b.owner, def.cost);
    b.queue.push({ kind: 'unit', type, t: def.trainTime, total: def.trainTime });
    return true;
  }
  researchTech(b, techId) {
    const p = this.players[b.owner];
    const tech = TECHS[techId];
    if (!tech || p.techs.has(techId) || b.built < 1 || b.dead) return false;
    if (b.queue.some((q) => q.kind === 'tech' && q.tech === techId)) return false;
    if (tech.age > p.age) { if (b.owner === this.myId) this.alert(`${tech.name} needs the ${AGES[tech.age - 1]}.`, 'warn'); return false; }
    if (b.queue.length >= 5) return false;
    if (!this.canAfford(b.owner, tech.cost)) {
      if (b.owner === this.myId) { this.alert('Not enough resources.', 'warn'); this.sfx && this.sfx.play('error'); }
      return false;
    }
    this.pay(b.owner, tech.cost);
    b.queue.push({ kind: 'tech', tech: techId, t: tech.time, total: tech.time });
    return true;
  }
  cancelQueue(b, i) {
    const item = b.queue[i];
    if (!item) return;
    this.pay(b.owner, item.kind === 'tech' ? TECHS[item.tech].cost : UNITS[item.type].cost, -1);
    b.queue.splice(i, 1);
  }
  startAgeUp(chest) {
    const p = this.players[chest.owner];
    const up = AGE_UPS[p.age];
    if (!up || p.aging > 0) return false;
    if (up.reqBuildings) {
      for (const req of up.reqBuildings) {
        if (!this.entities.some((e) => e.kind === 'building' && e.owner === chest.owner && e.type === req && e.built >= 1 && !e.dead)) {
          if (chest.owner === this.myId) this.alert(`Age up requires: ${up.reqText}.`, 'warn');
          return false;
        }
      }
    }
    if (up.reqAge2Count) {
      const n = this.entities.filter((e) => e.kind === 'building' && e.owner === chest.owner
        && !e.dead && e.built >= 1 && (BUILDINGS[e.type].age || 1) >= 2).length;
      if (n < up.reqAge2Count) {
        if (chest.owner === this.myId) this.alert(`Age up requires ${up.reqText}.`, 'warn');
        return false;
      }
    }
    if (!this.canAfford(chest.owner, up.cost)) {
      if (chest.owner === this.myId) this.alert('Not enough resources to age up.', 'warn');
      return false;
    }
    this.pay(chest.owner, up.cost);
    p.aging = up.time;
    if (chest.owner === this.myId) this.alert(`Researching the ${AGES[p.age]}…`, 'info');
    return true;
  }

  // ---------- combat ----------
  applyDamage(attacker, target, spec, showImpact = true) {
    if (target.dead) return;
    let dmg = spec.atk;
    if (spec.bonus && target.def.tags) {
      for (const t of target.def.tags) if (spec.bonus[t]) dmg += spec.bonus[t];
    }
    // high ground matters: raining blows from above hits harder,
    // swinging uphill is exhausting (AoE elevation rule)
    const hA = this.heightAtWorld(attacker.x, attacker.z);
    const hT = this.heightAtWorld(target.x, target.z);
    if (hA > hT + 0.4) dmg = Math.round(dmg * 1.25);
    else if (hA < hT - 0.4) dmg = Math.max(1, Math.round(dmg * 0.75));
    dmg = Math.max(1, dmg - this.armorOf(target, spec.atkType));
    target.hp -= dmg;
    target.view.markDamaged();
    target.view.hpBar.set(target.hp / target.maxHp);
    target.hitT = 0.14; // struck toys flinch (applied in the view frame)
    const seen = !this.fog || this.fog.state(target.x, target.z) === 2;
    if (this.fx && seen) {
      const c = spec.atkType === 'siege' ? 0xff8f5a : spec.atkType === 'pierce' ? 0xffd166 : 0xfff0c8;
      const hy = (target.kind === 'building' ? target.def.height * 0.5 : 0.35) + hT;
      this.fx.damageNumber(target.x, hy, target.z, dmg, c); // floating -N
      if (showImpact) {
        const ang = Math.atan2(target.x - attacker.x, target.z - attacker.z);
        if (spec.projectile) {
          this.fx.rangedImpact(target.x, hy, target.z, c, ang); // arrow/bullet spray
        } else {
          this.fx.slash(target.x, hy, target.z, ang, spec.atkType === 'siege' ? 0xffcaa0 : 0xffffff);
          this.fx.hit(target.x, hy, target.z, c, spec.atkType === 'siege' ? 12 : 6);
        }
        if (Math.random() < (spec.atkType === 'siege' ? 0.85 : 0.3)) {
          this.fx.chip(target.x, hy, target.z, target.def.debris); // hard hits chip a piece
        }
      }
      // big siege blows rattle the camera
      if (spec.atkType === 'siege' && this.cb.shake) this.cb.shake(target.kind === 'building' ? 0.32 : 0.2);
    }
    if (this.sfx && this.fog.state(target.x, target.z) === 2) {
      this.sfx.playAt(spec.atkType === 'siege' ? 'thud' : spec.atkType === 'pierce' ? 'twang' : 'bonk', target.x, target.z, 90);
    }
    if (target.owner === this.myId) {
      // your King under fire gets the enemy's own gloat, once
      if (target.isKing && !this._toldKing) { this._toldKing = true; this.speakAI('king', attacker.owner); }
      this.alert(`${TEAM_NAMES[1]} are attacking!`, 'attack', { x: target.x, z: target.z }, 12);
    } else if (!this.isEnemy(this.myId, target.owner) && this.isEnemy(this.myId, attacker.owner)) {
      this.alert('Your ally is under attack!', 'warn', { x: target.x, z: target.z }, 15);
    }
    // workers run for the safety of the nearest drop-off instead of dying in
    // place — and remember what they were doing so they can go back to it
    if (target.kind === 'unit' && target.type === 'worker' && !target.dead
        && (attacker.def.aggro > 0 || attacker.def.attack)
        && !(target.order && target.order.flee)) {
      const safe = this.nearestDropoff(target.owner, target.x, target.z);
      if (safe) {
        if (target.order && (target.order.type === 'gather' || target.order.type === 'build')) {
          target.fleeResume = target.order;
        }
        target.order = { type: 'move', x: safe.x, z: safe.z, flee: true };
        target.oq.length = 0;
        target.path = null; target.aim = null; target.losT = 0;
      }
    }
    // military toys fight back when hit — even mid-walk — instead of soaking
    // arrows from beyond their aggro radius. Player-ordered attacks stand.
    if (target.kind === 'unit' && !target.dead && target.def.aggro > 0
        && attacker.kind === 'unit' && attacker.owner >= 0
        && this.isEnemy(target.owner, attacker.owner)) {
      const o = target.order;
      const engaged = o && o.type === 'attack' && o.target && !o.target.dead
        && !(o.auto && o.target.kind === 'building'); // drop the building for whoever is shooting us
      if (!engaged) {
        if (target.stance === 'def' && !target.anchor) target.anchor = { x: target.x, z: target.z };
        target.order = {
          type: 'attack', target: attacker, auto: true,
          then: (o && o.type !== 'attack') ? o : (o ? o.then : null),
        };
      }
    }
    if (target.hp <= 0) this.kill(target, attacker);
  }

  kill(e, killer, quiet = false) {
    if (e.dead) return;
    e.dead = true;
    if (this.selected.includes(e)) this.setSelection(this.selected.filter((s) => s !== e));
    if (killer && killer.owner >= 0 && killer.owner !== e.owner && e.kind !== 'resource') {
      const ks = this.players[killer.owner].stats;
      if (e.kind === 'unit') { ks.kills++; this.narrate('firstblood'); } else ks.razed++;
      if (killer.kind === 'unit') {
        killer.kills = (killer.kills || 0) + 1;
        // veteran promotions: ⭐ at 3 (+1), ⭐⭐ at 6 (+2), 👑 Legend at 10 (+3)
        if (killer.kills === 3 || killer.kills === 6 || killer.kills === 10) {
          const tier = killer.kills === 10 ? 3 : killer.kills === 6 ? 2 : 1;
          if (killer.rankBadge) killer.view.group.remove(killer.rankBadge);
          killer.rankBadge = makeRankBadge(tier);
          killer.view.group.add(killer.rankBadge);
          this.fx && this.fx.spawnPop(killer.x, killer.z, 0xffd94a);
          if (killer.owner === this.myId) {
            this.alert(tier === 3
              ? `👑 Your ${killer.def.name} is a LEGEND! (+3 attack)`
              : `Your ${killer.def.name} earned ${tier === 2 ? 'a second star' : 'a star'}! (+${tier} attack)`,
              'info', { x: killer.x, z: killer.z });
          }
        }
      }
    }
    if (e.kind === 'unit') {
      this.players[e.owner].popUsed--;
      this.players[e.owner].stats.lost++;
      if (e.def.naval) this.players[e.owner].stats.shipsLost++;
      if (e.isKing) {
        this.fx && this.fx.confetti(e.x, e.z);
        this.alert(e.owner === this.myId
          ? '👑 Your King has fallen! Your toybox is defeated.'
          : (this.teamOf(e.owner) === this.myTeam ? '👑 An allied King has fallen!' : `👑 ${TEAM_NAMES[1]}'s King is down!`),
          'attack', { x: e.x, z: e.z });
      }
      e.order = null; e.oq.length = 0; e.swing = null;
      e.removeT = e.view.startDeath();
      this.fx && this.fx.death(e.x, e.z, e.def.debris || { colors: [e.def.color] });
      if (this.sfx && this.fog.state(e.x, e.z) === 2) {
        this.sfx.playAt('squeak', e.x, e.z, 150);
        // the material decides the sound: fluff whumps, buttons jingle, plastic clatters
        const d = e.def.debris;
        const mat = d && d.fluff ? 'whump' : d && d.shapes && d.shapes.includes('disc') ? 'jingle' : 'clatter';
        this.sfx.playAt(mat, e.x, e.z, 120);
      }
    } else if (e.kind === 'building' || e.kind === 'resource') {
      if (e.kind === 'building') {
        // no way out: everyone hiding inside goes down with it
        if (e.garrisonIds && e.garrisonIds.length) {
          for (const id of e.garrisonIds.slice()) {
            const u = this.entities.find((x) => x.id === id && !x.dead);
            if (u) {
              u.garrisoned = null;
              u.view.group.visible = true;
              this.kill(u, killer);
            }
          }
          e.garrisonIds.length = 0;
        }
        const s = e.def.size;
        for (let b = e.tj; b < e.tj + s; b++) for (let a = e.ti; a < e.ti + s; a++) {
          this.blocked[idx(a, b)] = 0;
          this.gateOwner[idx(a, b)] = -1;
        }
        this.recalcPop(e.owner);
        this.fx && this.fx.buildingDeath(e.x, e.z, s, e.def.debris);
        this.cb.shake && this.fog.state(e.x, e.z) === 2 && this.cb.shake(0.3 + s * 0.12);
        this.sfx && this.sfx.playAt('crash', e.x, e.z, 300);
        if (!quiet && e.owner === this.myId) this.alert(`${e.def.name} destroyed!`, 'attack', { x: e.x, z: e.z }, 4);
      } else {
        this.blocked[idx(e.ti, e.tj)] = 0;
      }
      this.scene.remove(e.view.group);
      e.removed = true;
    }
  }

  spawnProjectile(attacker, target, spec) {
    const p = spec.projectile;
    let mesh;
    if (p.band) {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.03, 0.05),
        new THREE.MeshBasicMaterial({ color: p.color })
      );
    } else {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(p.size || 0.09, 8, 6),
        new THREE.MeshBasicMaterial({ color: p.color })
      );
    }
    const y0 = (attacker.kind === 'building' ? attacker.def.height * 0.8 : 0.45)
      + this.heightAtWorld(attacker.x, attacker.z);
    mesh.position.set(attacker.x, y0, attacker.z);
    // additive glow halo so shots read as bright tracers streaking across the mat
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry((p.size || 0.09) * 2.2, 8, 6),
      new THREE.MeshBasicMaterial({ color: p.trail || p.color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    mesh.add(glow);
    this.scene.add(mesh);
    const ang = Math.atan2(target.x - attacker.x, target.z - attacker.z);
    if (this.fx && this.fog.state(attacker.x, attacker.z) === 2) {
      this.fx.muzzle(attacker.x, y0, attacker.z, p.color, ang);
    }
    const d = Math.sqrt(dist2(attacker, target));
    this.projectiles.push({
      mesh, target, attacker, spec,
      from: { x: attacker.x, y: y0, z: attacker.z },
      to: { x: target.x, z: target.z },
      toY: 0.4 + this.heightAtWorld(target.x, target.z),
      t: 0, dur: Math.max(0.12, d / p.speed),
      arc: p.arc ? Math.min(1.6, d * 0.18) : 0,
      spin: !!p.spin, trail: p.trail || null,
    });
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.t += dt;
      if (!pr.target.dead) {
        pr.to.x = pr.target.x; pr.to.z = pr.target.z;
        pr.toY = 0.4 + this.heightAtWorld(pr.target.x, pr.target.z);
      }
      const f = Math.min(1, pr.t / pr.dur);
      pr.mesh.position.set(
        pr.from.x + (pr.to.x - pr.from.x) * f,
        pr.from.y + (pr.toY - pr.from.y) * f + pr.arc * 4 * f * (1 - f),
        pr.from.z + (pr.to.z - pr.from.z) * f
      );
      if (pr.spin) pr.mesh.rotation.x += dt * 9;
      if (pr.trail && this.fx) { // every frame → a continuous streak
        this.fx.trail(pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z, pr.trail);
      }
      if (f >= 1) {
        const spec = pr.spec;
        if (spec.projectile && spec.projectile.splash) {
          const r = spec.projectile.splash;
          this.fx && this.fx.explosion(pr.to.x, pr.to.z, r);
          this.cb.shake && this.fog.state(pr.to.x, pr.to.z) === 2 && this.cb.shake(0.38);
          this.sfx && this.sfx.playAt('thud', pr.to.x, pr.to.z, 120);
          for (const e of this.entities) {
            if (e.dead || e.owner === pr.attacker.owner || e.owner === -1) continue;
            if (e.kind !== 'unit' && e.kind !== 'building') continue;
            const d2 = (e.x - pr.to.x) ** 2 + (e.z - pr.to.z) ** 2;
            const rr = (r + e.radius) ** 2;
            if (d2 <= rr) {
              const full = e === pr.target || d2 <= (r * 0.4) ** 2;
              this.applyDamage(pr.attacker, e, { ...spec, atk: full ? spec.atk : Math.round(spec.atk * 0.6) }, false);
            }
          }
        } else if (!pr.target.dead) {
          this.applyDamage(pr.attacker, pr.target, spec);
        }
        this.scene.remove(pr.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  nearestEnemy(owner, x, z, maxD, filter) {
    let best = null, bestD = maxD * maxD;
    for (const e of this.entities) {
      if (e.dead || e.garrisoned || !this.isEnemy(owner, e.owner)) continue;
      if (e.kind !== 'unit' && e.kind !== 'building') continue;
      if (filter && !filter(e)) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }
  // battle sense for auto-acquired targets: real threats first — fighters over
  // workers, anything over buildings, and wounded toys get finished off
  pickTarget(owner, x, z, maxD, includeBuildings = true) {
    let best = null, bestS = Infinity;
    const maxD2 = maxD * maxD;
    for (const e of this.entities) {
      if (e.dead || e.garrisoned || !this.isEnemy(owner, e.owner)) continue;
      if (e.kind !== 'unit' && e.kind !== 'building') continue;
      if (e.kind === 'building' && !includeBuildings) continue;
      const d2 = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d2 > maxD2) continue;
      let s = d2;
      if (e.kind === 'building') s *= 4;                    // don't whack houses while archers shoot
      else if (!(e.def.aggro > 0) && !e.isKing) s *= 1.6;   // workers matter less than soldiers
      s *= 0.6 + 0.4 * (e.hp / e.maxHp);                    // prefer finishing wounded toys
      if (s < bestS) { bestS = s; best = e; }
    }
    return best;
  }

  // ---------- mega-unit signature attacks ----------
  // Mecha-Titan: a piercing beam that damages every enemy in a line toward the
  // aim point (a thin rectangle along the shot axis)
  fireBeam(u, target, spec) {
    const ang = Math.atan2(target.x - u.x, target.z - u.z);
    const dx = Math.sin(ang), dz = Math.cos(ang);
    const range = u.def.range + 1.5, halfW = 0.9;
    const seen = this.fog.state(u.x, u.z) === 2;
    if (this.fx && seen && this.fx.beam) {
      this.fx.beam(u.x, 0.55 + this.heightAtWorld(u.x, u.z), u.z, ang, range, (u.def.projectile && u.def.projectile.color) || 0x9ff0ff);
    }
    if (this.sfx && seen) this.sfx.play('twang', 110);
    if (this.cb.shake && seen) this.cb.shake(0.2);
    for (const e of this.entities) {
      if (e.dead || e.garrisoned || e.owner === u.owner || e.owner === -1 || !this.isEnemy(u.owner, e.owner)) continue;
      if (e.kind !== 'unit' && e.kind !== 'building') continue;
      const rx = e.x - u.x, rz = e.z - u.z;
      const along = rx * dx + rz * dz;                 // distance down the beam
      if (along < -e.radius || along > range + e.radius) continue;
      const perp = Math.abs(rx * dz - rz * dx);        // sideways offset
      if (perp > halfW + e.radius) continue;
      this.applyDamage(u, e, spec);
    }
  }
  // Brick Colossus: ground slam — AoE around the struck target (in addition to
  // the single-target hit already applied)
  slamHit(u, center, spec) {
    const r = u.def.slam;
    const seen = this.fog.state(center.x, center.z) === 2;
    if (this.fx && seen) this.fx.explosion(center.x, center.z, r * 0.7);
    if (this.cb.shake && seen) this.cb.shake(0.32);
    const aoe = { atk: spec.atk * 0.6, atkType: 'siege', bonus: u.def.bonus };
    for (const e of this.entities) {
      if (e.dead || e === center || e.garrisoned || e.owner === u.owner || e.owner === -1 || !this.isEnemy(u.owner, e.owner)) continue;
      if (e.kind !== 'unit' && e.kind !== 'building') continue;
      if ((e.x - center.x) ** 2 + (e.z - center.z) ** 2 <= (r + e.radius) ** 2) this.applyDamage(u, e, aoe);
    }
  }
  // Monster Truck: trample — a periodic pulse of damage to enemies it overlaps
  // while moving (discrete pulses so flee/retaliation fire but don't spam)
  trample(u, dt) {
    u.trampleT = (u.trampleT || 0) - dt;
    if (u.trampleT > 0 || (u.vx * u.vx + u.vz * u.vz) < 0.36) return; // must be moving
    u.trampleT = 0.35;
    const spec = { atk: u.def.trample, atkType: 'melee' };
    for (const e of this.entities) {
      if (e.dead || e.kind !== 'unit' || e.garrisoned || e.owner === u.owner || e.owner === -1 || !this.isEnemy(u.owner, e.owner)) continue;
      if ((e.x - u.x) ** 2 + (e.z - u.z) ** 2 <= (u.radius + e.radius + 0.25) ** 2) {
        this.applyDamage(u, e, spec);
        if (this.fx && this.fog.state(e.x, e.z) === 2) this.fx.hit(e.x, 0.35, e.z, 0xffffff, 4);
      }
    }
  }

  // ---------- smooth movement (velocity steering + LOS-smoothed paths) ----------
  lineFree(x0, z0, x1, z1, owner = -2, naval = false) {
    const dx = x1 - x0, dz = z1 - z0;
    const d = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.ceil(d / 0.35);
    let prevH = this.tileHeight(tileOf(x0), tileOf(z0));
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      const i = tileOf(x0 + dx * f), j = tileOf(z0 + dz * f);
      if (!inMap(i, j)) return false;
      const m = idx(i, j);
      if (naval) { if (this.water[m] !== 1 || this.blocked[m]) return false; continue; }
      if (this.blocked[m] && this.gateOwner[m] !== owner) return false;
      if (this.water[m] === 1) return false; // land toys can't wade in
      const h = this.height[m];
      if (Math.abs(h - prevH) > CLIMB) return false; // cliff in the way
      prevH = h;
    }
    return true;
  }
  tileOpenFor(x, z, owner, naval = false) {
    const i = tileOf(x), j = tileOf(z);
    if (!inMap(i, j)) return false;
    const m = idx(i, j);
    if (naval) return this.water[m] === 1 && !this.blocked[m];
    return (!this.blocked[m] || this.gateOwner[m] === owner) && this.water[m] !== 1;
  }

  // steer u toward (tx,tz); returns true when within `arrive`
  steer(u, tx, tz, dt, arrive) {
    const dx = tx - u.x, dz = tz - u.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= arrive) { u.path = null; u.aim = null; return true; }

    // fliers ignore the ground entirely: beeline over walls, cliffs, milk
    if (u.def.fly) {
      const sp = this.speedOf(u);
      u.dvx = (dx / d) * sp;
      u.dvz = (dz / d) * sp;
      return false;
    }

    u.losT -= dt;
    const goalMoved = u.goal && ((u.goal.x - tx) ** 2 + (u.goal.z - tz) ** 2 > 2.25);
    if (!u.aim || u.losT <= 0 || goalMoved) {
      u.losT = 0.15 + this.rng() * 0.1;
      u.goal = { x: tx, z: tz };
      if (goalMoved) u.path = null;
      if (this.lineFree(u.x, u.z, tx, tz, u.owner, u.def.naval)) {
        u.aim = { x: tx, z: tz };
        u.path = null;
        u.noPath = false;
      } else {
        if (!u.path) {
          u.path = this.pf.find(u.x, u.z, tx, tz, u.owner, u.def.naval);
          u.pathI = 0;
          u.noPath = !u.path;
        }
        if (u.path) {
          // skip ahead to the furthest waypoint we can see (kills the tile zigzag)
          while (u.pathI + 1 < u.path.length
              && this.lineFree(u.x, u.z, u.path[u.pathI + 1].x, u.path[u.pathI + 1].z, u.owner, u.def.naval)) {
            u.pathI++;
          }
          const wp = (u.pathI >= u.path.length - 1) ? { x: tx, z: tz } : u.path[u.pathI];
          u.aim = { x: wp.x, z: wp.z };
        } else {
          u.aim = { x: tx, z: tz }; // no path — press on and let sliding handle it
        }
      }
    }
    // advance waypoints as we reach them
    if (u.path && u.aim) {
      const adx = u.aim.x - u.x, adz = u.aim.z - u.z;
      if (adx * adx + adz * adz < 0.16) { u.pathI++; u.losT = 0; }
    }
    // desired velocity (ease in on final approach)
    const ax = u.aim.x - u.x, az = u.aim.z - u.z;
    const ad = Math.sqrt(ax * ax + az * az) || 1;
    let sp = this.speedOf(u);
    if (d < 1.2) sp *= Math.max(0.35, d / 1.2);
    u.dvx = (ax / ad) * sp;
    u.dvz = (az / ad) * sp;
    return false;
  }

  integrate(u, dt) {
    const k = Math.min(1, dt * 9);
    u.vx += ((u.dvx || 0) - u.vx) * k;
    u.vz += ((u.dvz || 0) - u.vz) * k;
    const sp2 = u.vx * u.vx + u.vz * u.vz;
    if (sp2 < 0.0004) { u.vx = 0; u.vz = 0; return 0; }
    let nx = u.x + u.vx * dt, nz = u.z + u.vz * dt;
    // fliers cross anything as long as they stay over the mat
    if (u.def.fly) {
      if (inMap(tileOf(nx), tileOf(nz))) { u.x = nx; u.z = nz; u.stuckT = 0; }
      return Math.sqrt(u.vx * u.vx + u.vz * u.vz);
    }
    // toys can't be shoved off cliffs — steps beyond CLIMB are walls
    const hCur = this.tileHeight(tileOf(u.x), tileOf(u.z));
    // ships glide over flat water; only land toys mind cliff steps
    const stepOk = u.def.naval ? (() => true) : (x, z) => Math.abs(this.tileHeight(tileOf(x), tileOf(z)) - hCur) <= CLIMB;
    const nav = u.def.naval;
    if (this.tileOpenFor(nx, nz, u.owner, nav) && stepOk(nx, nz)) {
      u.x = nx; u.z = nz; u.stuckT = 0;
    } else if (this.tileOpenFor(nx, u.z, u.owner, nav) && stepOk(nx, u.z)) {
      u.x = nx; u.vz *= 0.4; u.stuckT += dt; // slide along the wall
    } else if (this.tileOpenFor(u.x, nz, u.owner, nav) && stepOk(u.x, nz)) {
      u.z = nz; u.vx *= 0.4; u.stuckT += dt;
    } else {
      u.vx *= 0.2; u.vz *= 0.2;
      u.stuckT += dt;
    }
    if (u.stuckT > 0.7) { // wedged: force a fresh path next steer
      u.path = null; u.aim = null; u.losT = 0; u.stuckT = 0;
    }
    return Math.sqrt(u.vx * u.vx + u.vz * u.vz);
  }

  startSwing(u, target) {
    const interval = u.def.interval * this.players[u.owner].mods.atkSpeed; // Overwound Springs
    const swingDur = Math.min(interval * 0.85, 1.15);
    const impactDelay = u.view.startAttack(swingDur);
    u.swing = { t: 0, impactAt: impactDelay, dur: swingDur, target, dealt: false };
    u.cd = interval;
    u.facing = Math.atan2(target.x - u.x, target.z - u.z);
  }

  updateUnit(u, dt) {
    if (u.dead) {
      u.view.update(dt);
      u.removeT -= dt;
      if (u.removeT <= 0 && !u.removed) { this.scene.remove(u.view.group); u.removed = true; }
      return;
    }
    if (u.garrisoned) return; // tucked away inside a building
    u.cd = Math.max(0, u.cd - dt);
    u.dvx = 0; u.dvz = 0;
    if (u.spawnT > 0) {
      u.spawnT -= dt;
      const f = 1 - Math.max(0, u.spawnT) / 0.35;
      u.view.group.scale.setScalar(0.25 + 0.75 * f);
    }

    let faceTarget = null;

    if (u.swing) {
      const s = u.swing;
      s.t += dt;
      if (!s.dealt && s.t >= s.impactAt) {
        s.dealt = true;
        const spec = { atk: this.atkOf(u), atkType: u.def.atkType, bonus: u.def.bonus, projectile: u.def.projectile };
        if (u.def.beam) {
          this.fireBeam(u, s.target, spec); // Mecha-Titan: piercing line
        } else if (!s.target.dead && dist2(u, s.target) < (u.def.range + s.target.radius + 1.4) ** 2) {
          if (spec.projectile) this.spawnProjectile(u, s.target, spec);
          else {
            this.applyDamage(u, s.target, spec);
            if (u.def.slam) this.slamHit(u, s.target, spec); // Brick Colossus: ground slam
          }
        }
      }
      if (s.t >= s.dur) u.swing = null;
    } else if (u.order) {
      const o = u.order;
      if (o.type === 'move') {
        // fleeing workers only need to reach the building's edge
        if (this.steer(u, o.x, o.z, dt, o.flee ? 2.8 : 0.3)) {
          u.order = null;
          // fled workers head back to work once the coast is clear; if raiders
          // still lurk, KEEP the memory — the idle watcher below retries
          if (o.flee && u.fleeResume) {
            if (!this.nearestEnemy(u.owner, u.x, u.z, 9, (e) => e.kind === 'unit' && e.def.aggro > 0)) {
              u.order = u.fleeResume;
              u.fleeResume = null;
            }
          }
        }
      } else if (o.type === 'amove') {
        u.scanT -= dt;
        if (u.def.aggro > 0 && u.scanT <= 0) {
          u.scanT = 0.4;
          const t = this.pickTarget(u.owner, u.x, u.z, u.def.aggro);
          if (t) { u.order = { type: 'attack', target: t, auto: true, then: o }; return this.finishUnitFrame(u, dt, faceTarget); }
        }
        if (this.steer(u, o.x, o.z, dt, 0.6)) u.order = null;
      } else if (o.type === 'patrol') {
        u.scanT -= dt;
        if (u.def.aggro > 0 && u.scanT <= 0) {
          u.scanT = 0.4;
          const t = this.pickTarget(u.owner, u.x, u.z, u.def.aggro);
          if (t) { u.order = { type: 'attack', target: t, auto: true, then: o }; return this.finishUnitFrame(u, dt, faceTarget); }
        }
        const tx = o.leg ? o.bx : o.ax, tz = o.leg ? o.bz : o.az;
        if (this.steer(u, tx, tz, dt, 0.6)) { o.leg = 1 - o.leg; u.path = null; }
      } else if (o.type === 'guard') {
        const g = o.target;
        if (!g || g.dead) { u.order = null; }
        else {
          u.scanT -= dt;
          if (u.scanT <= 0) {
            u.scanT = 0.4;
            // protect the ward: engage anything that closes in on it
            const t = this.pickTarget(u.owner, g.x, g.z, u.def.aggro);
            if (t) { u.order = { type: 'attack', target: t, auto: true, then: o }; return this.finishUnitFrame(u, dt, faceTarget); }
          }
          const keep = g.radius + u.radius + 1.5;
          if (dist2(u, g) > keep * keep) this.steer(u, g.x, g.z, dt, keep * 0.9);
          else { u.path = null; faceTarget = g; }
        }
      } else if (o.type === 'garrison') {
        const b = o.b;
        if (!b || b.dead || b.built < 1) { u.order = null; }
        else {
          const reach = b.radius + u.radius + 0.6;
          if (dist2(u, b) <= reach * reach) {
            if (b.garrisonIds.length < b.def.garrison) this.garrisonUnit(u, b);
            u.order = null;
          } else {
            this.steer(u, b.x, b.z, dt, reach * 0.95);
          }
        }
      } else if (o.type === 'aground') {
        const dx = o.x - u.x, dz = o.z - u.z;
        const d2 = dx * dx + dz * dz;
        if (u.def.minRange && d2 < u.def.minRange ** 2) {
          const away = Math.atan2(-dx, -dz);
          this.steer(u, u.x + Math.sin(away) * 2.2, u.z + Math.cos(away) * 2.2, dt, 0.3);
        } else if (d2 <= u.def.range ** 2) {
          u.facing = Math.atan2(dx, dz);
          u.path = null;
          if (u.cd <= 0) {
            // fire at the spot itself: a static pseudo-target keeps the
            // projectile from homing and the splash lands on the point
            this.startSwing(u, { x: o.x, z: o.z, radius: 0.05, dead: false, ground: true });
          }
        } else {
          this.steer(u, o.x, o.z, dt, u.def.range * 0.92);
        }
      } else if (o.type === 'traderoute') {
        const m = this.entities.find((e) => e.id === o.mid && !e.dead);
        if (!m || m.built < 1) { u.order = null; }
        else if (o.phase === 'to') {
          const reach = m.radius + u.radius + 0.5;
          if (dist2(u, m) <= reach * reach) { o.phase = 'back'; u.path = null; }
          else this.steer(u, m.x, m.z, dt, reach * 0.95);
        } else {
          // trade pays out at the Toy Chest only — forward baskets don't count
          let home = null, hd = Infinity;
          for (const e of this.entities) {
            if (e.kind !== 'building' || e.type !== 'chest' || e.owner !== u.owner || e.dead || e.built < 1) continue;
            const d = dist2(u, e);
            if (d < hd) { hd = d; home = e; }
          }
          if (!home) { u.order = null; }
          else {
            const reach = home.radius + u.radius + 0.5;
            if (dist2(u, home) <= reach * reach) {
              // payout scales with route length — long-haul trading pays
              const gain = Math.max(4, Math.round(Math.sqrt(dist2(m, home)) * 1.1));
              this.players[u.owner].res.buttons += gain;
              this.players[u.owner].stats.gathered += gain;
              this.fx && this.fog.state(u.x, u.z) === 2 && this.fx.spawnPop(u.x, u.z, 0xf0d060);
              o.phase = 'to'; u.path = null;
            } else this.steer(u, home.x, home.z, dt, reach * 0.95);
          }
        }
      } else if (o.type === 'attack' && u.def.convert) {
        // hypno-top: channel on an enemy toy until it switches sides
        const t = o.target;
        if (!t || t.dead || t.kind !== 'unit' || t.owner === u.owner || t.garrisoned) {
          u.order = null; u.chT = 0; u.view._channel = false;
        } else {
          const cr = u.def.convert.range;
          if (dist2(u, t) <= cr * cr) {
            faceTarget = t;
            u.path = null;
            if (u.cd <= 0) {
              u.chT = (u.chT || 0) + dt;
              u.view._channel = true;
              if (this.fx && this.fog.state(t.x, t.z) === 2 && ((u.chT * 10) | 0) % 3 === 0) this.fx.heal(t.x, t.z);
              if (u.chT >= u.def.convert.time) {
                u.chT = 0; u.cd = u.def.convert.cooldown; u.view._channel = false;
                this.convertUnit(t, u.owner);
                u.order = null;
              }
            }
          } else {
            u.chT = 0; u.view._channel = false;
            this.steer(u, t.x, t.z, dt, cr * 0.9);
          }
        }
      } else if (o.type === 'attack') {
        const t = o.target;
        if (!t || t.dead) {
          const next = o.auto ? this.pickTarget(u.owner, u.x, u.z, u.def.aggro || 6) : null;
          u.order = next ? { type: 'attack', target: next, auto: o.auto, then: o.then } : (o.then || null);
        } else {
          // auto-razing a building? keep an eye out for actual fighters — swap
          // to any enemy unit that shows up, and come back to the building after
          if (o.auto && t.kind === 'building') {
            u.scanT -= dt;
            if (u.scanT <= 0) {
              u.scanT = 0.5;
              const threat = this.pickTarget(u.owner, u.x, u.z, u.def.aggro || 6, false);
              if (threat) {
                u.order = { type: 'attack', target: threat, auto: true, then: o };
                return this.finishUnitFrame(u, dt, faceTarget);
              }
            }
          }
          const reach = u.def.range + t.radius + u.radius;
          const d2t = dist2(u, t);
          if (u.def.minRange && d2t < (u.def.minRange + t.radius) ** 2) {
            // too close for a lobber: back away
            const away = Math.atan2(u.x - t.x, u.z - t.z);
            this.steer(u, u.x + Math.sin(away) * 2.2, u.z + Math.cos(away) * 2.2, dt, 0.3);
          } else if (d2t <= reach * reach) {
            faceTarget = t;
            u.noPathT = 0;
            if (u.cd <= 0) this.startSwing(u, t);
            else if (u.def.range >= 2 && t.kind === 'unit' && (t.def.range || 0) < 1.6
                && d2t < (reach * 0.45) ** 2 && u.stance !== 'stand' && !u.swing) {
              // kite-lite: while reloading, open distance from a melee chaser
              const away = Math.atan2(u.x - t.x, u.z - t.z);
              const sp = this.speedOf(u) * 0.8;
              u.dvx = Math.sin(away) * sp;
              u.dvz = Math.cos(away) * sp;
            }
          } else if (o.auto && u.stance === 'stand') {
            // stand ground: never chase — fall back to whatever we were doing
            u.order = o.then || null;
          } else if (o.auto && u.stance === 'def' && u.anchor
              && (u.x - u.anchor.x) ** 2 + (u.z - u.anchor.z) ** 2 > 49) {
            // defensive leash: broke too far from post, walk back
            const a = u.anchor;
            u.anchor = null;
            u.order = { type: 'move', x: a.x, z: a.z };
          } else {
            this.steer(u, t.x, t.z, dt, reach * 0.92);
            // walled off: chew through whatever is actually in the way
            if (o.auto && u.noPath) {
              u.noPathT = (u.noPathT || 0) + dt;
              if (u.noPathT > 1.2) {
                u.noPathT = 0;
                const blocker = this.nearestEnemy(u.owner, u.x, u.z, (u.def.aggro || 6) + 3,
                  (e) => e.kind === 'building' || e.kind === 'unit');
                if (blocker && blocker !== t) u.order = { type: 'attack', target: blocker, auto: true, then: o.then };
              }
            }
          }
        }
      } else if (o.type === 'gather') {
        this.updateGather(u, o, dt);
        if (u.order === o && o.phase === 'at' && o.node && !o.node.dead) faceTarget = o.node;
      } else if (o.type === 'build') {
        const b = o.b;
        const needsWork = b && !b.dead && (b.built < 1 || b.hp < b.maxHp - 0.5);
        if (!needsWork) { u.order = null; }
        else {
          const reach = b.radius + u.radius + 0.5;
          if (dist2(u, b) <= reach * reach) {
            faceTarget = b;
            if (b.built < 1) {
              b.built = Math.min(1, b.built + (dt * this.players[u.owner].mods.buildRate) / b.def.buildTime);
              b.hp = Math.min(b.maxHp, b.hp + dt * b.maxHp / b.def.buildTime);
              b.view.setProgress(b.built);
              u.gfxT -= dt;
              if (u.gfxT <= 0 && this.fx) { u.gfxT = 0.5; this.fx.buildDust(b.x, b.z); }
              if (b.built >= 1) {
                this.recalcPop(b.owner);
                if (b.def.wall || b.def.gate) this.players[b.owner].stats.wallsBuilt++;
                if (b.owner === this.myId) { this.alert(`${b.def.name} complete.`, 'info'); this.sfx && this.sfx.play('build'); }
                // chain to the next nearby foundation (wall lines build hands-free)
                const next = this.nearestFoundation(u.owner, u.x, u.z, 6);
                u.order = next ? { type: 'build', b: next } : null;
                if (!u.order) {
                  // hands free — head back to gathering something nearby rather
                  // than loitering at the finished building
                  const node = this.nearestGatherSource(u.owner, u.carryType || 'snacks', u.x, u.z, 14, u)
                    || this.nearestGatherSource(u.owner, u.carryType === 'blocks' ? 'snacks' : 'blocks', u.x, u.z, 14, u);
                  if (node) {
                    const resType = node.kind === 'building' ? 'snacks' : node.resType;
                    if (u.carryType !== resType) u.carry = 0;
                    u.carryType = resType;
                    u.order = { type: 'gather', node, phase: 'to', resType };
                  }
                }
              }
            } else {
              b.hp = Math.min(b.maxHp, b.hp + (dt * this.players[u.owner].mods.buildRate) * b.maxHp / (b.def.buildTime * 2)); // repair
              b.view.hpBar.set(b.hp / b.maxHp);
              u.gfxT -= dt;
              if (u.gfxT <= 0 && this.fx) { u.gfxT = 0.6; this.fx.buildDust(b.x, b.z); }
            }
          } else {
            this.steer(u, b.x, b.z, dt, reach * 0.95);
          }
        }
      }
    } else if (u.def.aggro > 0) {
      u.scanT -= dt;
      if (u.scanT <= 0) {
        u.scanT = 0.5;
        // stand ground only notices what's already in weapon reach
        const scanR = u.stance === 'stand' ? u.def.range + 1.0 : u.def.aggro;
        const t = this.pickTarget(u.owner, u.x, u.z, scanR);
        if (t) {
          if (u.stance === 'def' && !u.anchor) u.anchor = { x: u.x, z: u.z };
          u.order = { type: 'attack', target: t, auto: true };
        }
      }
    } else if (u.type === 'worker' && u.fleeResume) {
      // sheltered worker: peek out now and then, resume work when it's safe
      u.scanT -= dt;
      if (u.scanT <= 0) {
        u.scanT = 1.2;
        if (!this.nearestEnemy(u.owner, u.x, u.z, 9, (e) => e.kind === 'unit' && e.def.aggro > 0)) {
          u.order = u.fleeResume;
          u.fleeResume = null;
        }
      }
    } else if (u.type === 'worker' && !u.garrisoned) {
      // idle hands: after a few unbothered seconds, a worker walks itself back
      // to work — generous radius, so 'ran dry nearby' crews cross to the next
      // pocket instead of retiring on the spot (deterministic: no rng, id-order
      // scans, identical for every player — AI crews get re-tasked by their own
      // planner within a second, so in practice this only moves human workers)
      u.idleT = (u.idleT || 0) + dt;
      if (u.idleT >= 5) {
        u.idleT = 0;
        const prefer = u.carryType || 'snacks';
        const node = this.nearestGatherSource(u.owner, prefer, u.x, u.z, 34, u)
          || this.nearestGatherSource(u.owner, prefer === 'blocks' ? 'snacks' : 'blocks', u.x, u.z, 34, u)
          || this.nearestGatherSource(u.owner, 'buttons', u.x, u.z, 34, u)
          || this.nearestGatherSource(u.owner, 'marbles', u.x, u.z, 34, u);
        if (node) {
          const resType = node.kind === 'building' ? 'snacks' : node.resType;
          if (u.carryType !== resType) u.carry = 0;
          u.carryType = resType;
          u.order = { type: 'gather', node, phase: 'to', resType };
        }
      }
    }
    if (!u.order && u.oq.length) {
      u.order = u.oq.shift();
      u.path = null; u.aim = null; u.losT = 0;
    }
    // medics patch up the nearest damaged friendly toy in range
    if (u.def.heal) {
      u.healT = (u.healT || 0) - dt;
      if (u.healT <= 0) {
        u.healT = 0.5;
        let best = null, bd = u.def.heal.range ** 2;
        for (const e of this.entities) {
          // medics patch allies too
          if (e.kind !== 'unit' || e.dead || e === u || e.hp >= e.maxHp || e.garrisoned) continue;
          if (this.isEnemy(u.owner, e.owner) || e.owner < 0) continue;
          const d = (e.x - u.x) ** 2 + (e.z - u.z) ** 2;
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          best.hp = Math.min(best.maxHp, best.hp + u.def.heal.rate * this.players[u.owner].mods.healRate * 0.5);
          best.view.hpBar.set(best.hp / best.maxHp);
          if (this.fx && this.fog.state(best.x, best.z) === 2) this.fx.heal(best.x, best.z);
        }
      }
    }
    this.finishUnitFrame(u, dt, faceTarget);
  }

  finishUnitFrame(u, dt, faceTarget) {
    const speed = u.swing ? (u.vx = u.vz = 0, 0) : this.integrate(u, dt);
    if (u.def.trample) this.trample(u, dt); // Monster Truck runs toys over as it moves
    const moving = speed > 0.18;
    if (moving) {
      u.facing = Math.atan2(u.vx, u.vz);
    } else if (faceTarget) {
      u.facing = Math.atan2(faceTarget.x - u.x, faceTarget.z - u.z);
    }
    u.view.group.position.set(u.x,
      this.heightAtWorld(u.x, u.z) + (u.def.fly ? 1.25 : u.def.naval ? 0.12 : 0), u.z);
    // hit flinch: a quick squash-and-pop when the toy just took a blow
    if (u.hitT > 0) {
      u.hitT -= dt;
      const k = Math.sin(Math.max(0, 1 - u.hitT / 0.14) * Math.PI); // 0→1→0
      u.view.group.scale.set(1 + k * 0.16, 1 - k * 0.12, 1 + k * 0.16);
    } else if (u.view.group.scale.x !== 1) {
      u.view.group.scale.set(1, 1, 1);
    }
    let dr = u.facing - u.view.group.rotation.y;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    // wheeled toys turn smoothly (no twitchy nose-swinging as they navigate)
    u.view.group.rotation.y += dr * Math.min(1, dt * (u.def.gait === 'roll' ? 6 : 11));
    if (moving !== u.wasMoving) { u.view.setMoving(moving); u.wasMoving = moving; }
    u.view.setSpeedRatio && u.view.setSpeedRatio(speed / REF_SPEED);
    // fast wheeled toys kick up carpet dust
    if (this.fx && speed > 2.1 && u.def.tags.includes('vehicle')) {
      u.dustT = (u.dustT || 0) - dt;
      if (u.dustT <= 0 && this.fog.state(u.x, u.z) === 2) {
        u.dustT = 0.13;
        this.fx.wheelDust(u.x, u.z);
      }
    }
    if (u.isKing && u.kingCrown) u.kingCrown.rotation.y += dt * 1.5;
    u.view.update(dt);
  }

  updateGather(u, o, dt) {
    const cap = this.carryOf(u);
    const isFarm = o.node && o.node.kind === 'building';
    if (!o.node || o.node.dead || (isFarm && o.node.built < 1)) {
      const next = this.nearestGatherSource(u.owner, o.resType || u.carryType, u.x, u.z, 22, u);
      if (next) { o.node = next; o.phase = 'to'; }
      else if (u.carry > 0.5) { o.node = null; o.phase = 'return'; } // bank what we hold, then stop
      else { u.order = null; return; }
    }
    if (o.node) o.resType = o.node.kind === 'building' ? 'snacks' : o.node.resType;
    if (o.phase !== 'return' && u.carry >= cap) {
      o.phase = 'return';
      if (isFarm && o.node && o.node.gatherer === u) o.node.gatherer = null;
    }

    if (o.phase === 'return') {
      const drop = this.nearestDropoff(u.owner, u.x, u.z, !!u.def.gatherNaval);
      if (!drop || !u.carryType) { u.order = null; return; }
      // ships bank from the quay: the Dock's reach extends past the waterline,
      // since the boat can never step onto the shore tile the dock sits on
      const reach = drop.radius + u.radius + (u.def.gatherNaval ? 2.2 : 0.4);
      if (dist2(u, drop) <= reach * reach) {
        const p = this.players[u.owner];
        const st = this.aiState[u.owner];
        const amt = u.carry * (p.isAI && st ? st.diff.handicap : 1);
        p.res[u.carryType] += amt;
        p.stats.gathered += amt;
        this.fx && u.owner === this.myId && this.fx.deposit(drop.x, drop.z, RES_META[u.carryType].color);
        u.carry = 0;
        if (o.node && !o.node.dead) o.phase = 'to';
        else {
          u.order = null; // nothing left to gather anywhere nearby
          if (u.owner === this.myId) this.alert(`A ${u.def.name} ran out of resources to gather.`, 'warn', { x: u.x, z: u.z }, 10);
        }
      } else {
        this.steer(u, drop.x, drop.z, dt, reach * 0.95);
      }
    } else if (o.node) {
      const node = o.node;
      const reach = node.radius + u.radius + 0.35;
      if (dist2(u, node) <= reach * reach) {
        if (node.kind === 'building') {
          // one worker per Snack Mat
          if (node.gatherer && node.gatherer !== u && !node.gatherer.dead
              && node.gatherer.order && node.gatherer.order.node === node) {
            const next = this.nearestGatherSource(u.owner, 'snacks', u.x, u.z, 25, u);
            if (next && next !== node) { o.node = next; return; }
          } else {
            node.gatherer = u;
          }
          o.phase = 'at';
          u.carryType = 'snacks';
          u.carry = Math.min(cap, u.carry + node.def.farmRate * this.players[u.owner].mods.gather * this.players[u.owner].mods.gatherSnacks * dt);
        } else {
          o.phase = 'at';
          u.carryType = node.resType;
          const take = Math.min(this.gatherRateOf(u, node.resType) * dt, node.amount, cap - u.carry);
          u.carry += take;
          node.amount -= take;
          if (node.amount <= 0) this.kill(node, u);
        }
        u.gfxT -= dt;
        if (u.gfxT <= 0 && this.fx && this.fog.state(u.x, u.z) === 2) {
          u.gfxT = 0.7;
          this.fx.gather(node.x, 0.3, node.z, RES_META[u.carryType].color);
        }
      } else {
        o.phase = 'to';
        this.steer(u, node.x, node.z, dt, reach * 0.95);
      }
    } else {
      u.order = null; // no node and nothing carried — give up cleanly
    }
  }

  nearestGatherSource(owner, resType, x, z, maxD, forUnit) {
    // skimmers only see floating piles; workers (and default callers) only land
    const wantAquatic = !!(forUnit && forUnit.def && forUnit.def.gatherNaval);
    let best = null, bd = maxD * maxD;
    for (const e of this.entities) {
      if (e.dead) continue;
      let ok = false;
      if (e.kind === 'resource' && e.resType === resType && !!e.aquatic === wantAquatic) ok = true;
      else if (resType === 'snacks' && !wantAquatic && e.kind === 'building' && e.owner === owner && e.def.farm && e.built >= 1) {
        const g = e.gatherer;
        ok = !g || g === forUnit || g.dead || !g.order || g.order.node !== e;
      }
      if (!ok) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  nearestFoundation(owner, x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const e of this.entities) {
      if (e.kind !== 'building' || e.dead || e.owner !== owner || e.built >= 1) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  nearestNode(resType, x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const e of this.entities) {
      if (e.kind !== 'resource' || e.dead || e.resType !== resType) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  nearestDropoff(owner, x, z, navalOnly = false) {
    // skimmers bank their haul at the Dock; land workers use the usual dropoffs
    let best = null, bd = Infinity;
    for (const e of this.entities) {
      if (e.kind !== 'building' || e.dead || e.owner !== owner || e.built < 1) continue;
      if (navalOnly ? !e.def.dock : !e.def.dropoff) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ---------- buildings ----------
  // hypnotized toys swap sides: new colors, clean slate, same scars
  convertUnit(t, newOwner) {
    const oldOwner = t.owner;
    this.players[oldOwner].popUsed--;
    this.players[oldOwner].stats.lost++;
    this.players[newOwner].popUsed++;
    t.owner = newOwner;
    t.order = null; t.oq.length = 0; t.swing = null; t.aim = null; t.path = null;
    t.anchor = null; t.stance = 'agg'; t.fleeResume = null; t.bellResume = null;
    if (this.selected.includes(t)) this.setSelection(this.selected.filter((s) => s !== t));
    this.scene.remove(t.view.group);
    t.view = createUnitView(this.registry, t.type, t.def, newOwner, this.factionKeys[newOwner]);
    t.view.group.position.set(t.x, this.heightAtWorld(t.x, t.z), t.z);
    t.view.group.rotation.y = t.facing;
    this.scene.add(t.view.group);
    t.eliteRing = null;
    if ((t.kills || 0) >= 3) {
      t.rankBadge = makeRankBadge(t.kills >= 10 ? 3 : t.kills >= 6 ? 2 : 1);
      t.view.group.add(t.rankBadge);
    }
    { const _t = this.lineTierOf(newOwner, t.type); if (_t && t.view) applyUnitTier(t.view, t.def, newOwner, _t); }
    this.fx && this.fx.spawnPop(t.x, t.z, 0xb14fe0);
    if (oldOwner === this.myId) this.alert(`Your ${t.def.name} was hypnotized!`, 'warn', { x: t.x, z: t.z }, 3);
    else if (newOwner === this.myId) this.alert(`Enemy ${t.def.name} joins your toybox!`, 'info', { x: t.x, z: t.z }, 3);
  }

  // ---------- garrisoning ----------
  garrisonUnit(u, b) {
    u.garrisoned = b.id;
    b.garrisonIds.push(u.id);
    u.order = null; u.oq.length = 0; u.path = null; u.aim = null; u.swing = null;
    u.vx = 0; u.vz = 0;
    u.x = b.x; u.z = b.z;
    u.view.group.visible = false;
    u.view.group.position.set(b.x, 0, b.z);
    u.view.setSelected(false);
    if (this.selected.includes(u)) this.setSelection(this.selected.filter((s) => s !== u));
  }

  ungarrison(b) {
    for (const id of b.garrisonIds) {
      const u = this.entities.find((e) => e.id === id && !e.dead);
      if (!u) continue;
      const free = this.pf.nearestFree(b.ti + (b.def.size >> 1), b.tj + b.def.size, 8);
      if (free) { u.x = worldOf(free[0]); u.z = worldOf(free[1]); }
      else { u.x = b.x; u.z = b.z + b.radius + 1; }
      u.garrisoned = null;
      u.view.group.visible = true;
      u.view.group.position.set(u.x, this.heightAtWorld(u.x, u.z), u.z);
      u.spawnT = 0.2;
      if (u.bellResume) { u.order = u.bellResume; u.bellResume = null; }
    }
    b.garrisonIds.length = 0;
  }

  // town bell: first ring tucks every worker into the nearest garrison
  // building; second ring empties them back out to whatever they were doing
  townBell(pid) {
    const p = this.players[pid];
    p.bell = !p.bell;
    if (p.bell) {
      for (const u of this.entities) {
        if (u.kind !== 'unit' || u.dead || u.owner !== pid || u.type !== 'worker' || u.garrisoned) continue;
        let best = null, bd = Infinity;
        for (const b of this.entities) {
          if (b.kind !== 'building' || b.dead || b.owner !== pid || b.built < 1 || !b.def.garrison) continue;
          if (b.garrisonIds.length >= b.def.garrison) continue;
          const d = dist2(u, b);
          if (d < bd) { bd = d; best = b; }
        }
        if (!best) continue;
        if (u.order && (u.order.type === 'gather' || u.order.type === 'build')) u.bellResume = u.order;
        this.setOrder(u, { type: 'garrison', b: best }, false);
      }
      if (pid === this.myId) this.alert('Town bell! Workers running to safety — ring again for all-clear.', 'warn');
    } else {
      for (const b of this.entities) {
        if (b.kind === 'building' && !b.dead && b.owner === pid && b.garrisonIds.length) this.ungarrison(b);
      }
      for (const u of this.entities) {
        if (u.kind !== 'unit' || u.dead || u.owner !== pid || u.garrisoned) continue;
        if (u.order && u.order.type === 'garrison') { u.order = u.bellResume || null; u.bellResume = null; }
      }
      if (pid === this.myId) this.alert('All clear — workers back to work.', 'info');
    }
  }

  updateBuilding(b, dt) {
    if (b.dead) return;
    b.view.hpBar.set(b.hp / b.maxHp);
    b.view.update && b.view.update(dt);
    // gates lift their bar when friendly toys approach
    if (b.def.gate && b.built >= 1) {
      b.gateT = (b.gateT || 0) - dt;
      if (b.gateT <= 0) {
        b.gateT = 0.25;
        let near = false;
        for (const e of this.entities) {
          if (e.kind !== 'unit' || e.dead || e.owner !== b.owner) continue;
          if ((e.x - b.x) ** 2 + (e.z - b.z) ** 2 < 6.5) { near = true; break; }
        }
        b.view.setOpen(near);
      }
    }
    // damaged buildings smoke
    if (b.built >= 1 && b.hp < b.maxHp * 0.5 && this.fx) {
      b.smokeT -= dt;
      if (b.smokeT <= 0) {
        b.smokeT = 0.35;
        if (this.fog.state(b.x, b.z) === 2) this.fx.smoke(b.x, b.def.height * 0.8, b.z);
      }
    }
    if (b.built < 1) return;
    const p = this.players[b.owner];
    if (b.queue.length && !(b.type === 'chest' && p.aging > 0)) {
      const head = b.queue[0];
      head.t -= dt;
      if (head.t <= 0) {
        if (head.kind === 'tech') {
          b.queue.shift();
          this.applyTech(b.owner, head.tech);
        } else if (p.popUsed + 1 > p.popCap) {
          head.t = 0;
          if (b.owner === this.myId) this.alert('Toy box is full — build more Block Houses!', 'warn', null, 8);
        } else {
          b.queue.shift();
          const spawn = this.pf.nearestFree(b.ti + (b.def.size >> 1), b.tj + b.def.size, 6);
          const u = this.spawnUnit(head.type, b.owner,
            spawn ? worldOf(spawn[0]) : b.x, spawn ? worldOf(spawn[1]) : b.z + b.def.size, true);
          if (b.rally) {
            const target = b.rally.entityId ? this.entities.find((e) => e.id === b.rally.entityId && !e.dead) : null;
            if (target && (u.type === 'worker' || u.def.gatherNaval)
                && (target.kind === 'resource' || (target.kind === 'building' && target.def.farm))) {
              this.cmdGather([u], target);
            } else if (target && this.isEnemy(b.owner, target.owner)) {
              this.cmdAttack([u], target);
            } else {
              this.cmdMove([u], b.rally.x, b.rally.z, false, u.def.aggro > 0);
            }
          }
          // teach the rally once: unless the rally points AT a resource, new
          // workers walk to bare ground and idle there
          if (u.type === 'worker' && b.owner === this.myId && !this._toldRally
              && !(b.rally && b.rally.entityId)) {
            this._toldRally = true;
            this.alert('Tip: select the Toy Chest and right-click a Snack pile to set a rally — new Worker Buddies will head straight to work.', 'info', null, 30);
          }
        }
      }
    }
    // towers/forts always shoot; the chest only shoots while garrisoned.
    // every toy hiding inside adds punch to each arrow.
    let spec = b.def.attack || (b.def.garrisonAttack && b.garrisonIds.length ? b.def.garrisonAttack : null);
    if (spec && b.type === 'tower') { // Pen Tower upgrade: harder-hitting, longer-reaching
      const u = this.buildingUpTech('tower', b.owner);
      if (u) spec = { ...spec, atk: spec.atk + u.atk, range: spec.range + u.range };
    }
    if (spec) {
      b.cd = Math.max(0, b.cd - dt);
      b.scanT -= dt;
      if (b.scanT <= 0) {
        b.scanT = 0.4;
        b.target = (b.target && !b.target.dead && !b.target.garrisoned && dist2(b, b.target) <= spec.range ** 2)
          ? b.target
          : this.nearestEnemy(b.owner, b.x, b.z, spec.range, (e) => e.kind === 'unit');
      }
      if (b.target && b.cd <= 0 && !b.target.dead) {
        b.cd = spec.interval;
        const bonus = b.garrisonIds.length
          ? Math.round(spec.atk * 0.35 * Math.min(b.garrisonIds.length, 6)) : 0;
        this.spawnProjectile(b, b.target, bonus ? { ...spec, atk: spec.atk + bonus } : spec);
      }
    }
  }

  entityAt(x, z, kindFilter) {
    let best = null, bd = Infinity;
    for (const e of this.entities) {
      if (e.dead || e.removed || e.garrisoned) continue;
      if (kindFilter && e.kind !== kindFilter) continue;
      const hostile = this.isEnemy(this.myId, e.owner);
      if (e.kind === 'unit' && hostile && this.fog.state(e.x, e.z) !== 2) continue;
      if (e.kind === 'building' && hostile && !e.seen) continue;
      const r = Math.max(0.55, e.radius);
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d <= r * r && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  getIdleWorkers(owner) {
    return this.entities.filter((e) =>
      e.kind === 'unit' && e.owner === owner && !e.dead && e.type === 'worker' && !e.order);
  }

  // ---------- separation (soft unit collision) ----------
  separate() {
    const units = this.entities.filter((e) => e.kind === 'unit' && !e.dead && !e.garrisoned);
    const cell = new Map();
    for (const u of units) {
      const k = (tileOf(u.x) << 8) | tileOf(u.z);
      if (!cell.has(k)) cell.set(k, []);
      cell.get(k).push(u);
    }
    for (const u of units) {
      const ci = tileOf(u.x), cj = tileOf(u.z);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const arr = cell.get(((ci + di) << 8) | (cj + dj));
        if (!arr) continue;
        for (const v of arr) {
          if (v === u || v.id <= u.id) continue;
          const dx = v.x - u.x, dz = v.z - u.z;
          const d2 = dx * dx + dz * dz, min = 0.5;
          if (d2 > min * min || d2 === 0) continue;
          const d = Math.sqrt(d2), push = (min - d) * 0.38;
          const nx = dx / d, nz = dz / d;
          const ux = u.x - nx * push, uz = u.z - nz * push;
          const vx = v.x + nx * push, vz = v.z + nz * push;
          const okShove = (e, x, z) => {
            const ti = tileOf(x), tj = tileOf(z);
            if (!inMap(ti, tj)) return false;
            const m = idx(ti, tj);
            if (this.blocked[m]) return false;
            // stay in your element: ships can't be shoved ashore, toys can't be shoved into the drink
            if (e.def.naval) return this.water[m] === 1;
            if (this.water[m] === 1) return false;
            return Math.abs(this.tileHeight(ti, tj) - this.tileHeight(tileOf(e.x), tileOf(e.z))) <= CLIMB;
          };
          if (okShove(u, ux, uz)) { u.x = ux; u.z = uz; }
          if (okShove(v, vx, vz)) { v.x = vx; v.z = vz; }
        }
      }
    }
  }

  // ---------- AI opponent (brief §11: managers on a 1s tick) ----------
  aiUpdate(owner = 1) {
    const p = this.players[owner];
    const ai = this.aiState[owner];
    const diff = ai.diff;
    const mine = this.entities.filter((e) => e.owner === owner && !e.dead);
    const chest = mine.find((e) => e.type === 'chest' && e.built >= 1);
    const workers = mine.filter((e) => e.type === 'worker');
    const military = mine.filter((e) => e.kind === 'unit' && e.def.aggro > 0);
    const has = (t, builtOnly = false) => mine.some((e) => e.kind === 'building' && e.type === t && (!builtOnly || e.built >= 1));

    // what are the enemies fielding? (used to pick counters)
    const enemyUnits = this.entities.filter((e) => e.kind === 'unit' && this.isEnemy(owner, e.owner) && !e.dead);
    const enemyRaiders = enemyUnits.filter((e) => e.def.tags.includes('raider')).length;
    const enemyRanged = enemyUnits.filter((e) => e.def.tags.includes('ranged')).length;
    const enemyHeavy = enemyUnits.filter((e) => e.def.tags.includes('heavy')).length;
    const persona = ai.persona || 'balanced';

    if (chest) {
      // --- economy manager ---
      if (workers.length + chest.queue.length < diff.workerTarget && chest.queue.length < 2 && p.aging <= 0) {
        this.trainUnit(chest, 'worker');
      }
      // adopt orphaned foundations (builders can die or get reassigned)
      for (const f of mine.filter((e) => e.kind === 'building' && e.built < 1)) {
        const assigned = workers.some((w) => w.order && w.order.type === 'build' && w.order.b === f);
        if (!assigned) {
          const near = workers
            .filter((w) => !w.order || w.order.type === 'gather')
            .sort((a, c) => ((a.x - f.x) ** 2 + (a.z - f.z) ** 2) - ((c.x - f.x) ** 2 + (c.z - f.z) ** 2))
            .slice(0, 2);
          if (near.length) this.cmdBuild(near, f);
        }
      }
      const housePending = mine.some((e) => e.type === 'house' && e.built < 1);
      if (p.popUsed >= p.popCap - 2 && !housePending && this.canAfford(owner, BUILDINGS.house.cost)) {
        this.aiPlace('house', chest, workers);
      }
      // farms when close snack nodes run dry
      const closeSnacks = this.nearestNode('snacks', chest.x, chest.z, 20);
      const farms = mine.filter((e) => e.type === 'farm').length;
      if (!closeSnacks && farms < 5 && this.canAfford(owner, BUILDINGS.farm.cost)) {
        this.aiPlace('farm', chest, workers);
      }
      const ratio = AI.gatherRatio[p.age];
      const counts = { snacks: 0, blocks: 0, buttons: 0, marbles: 0 };
      for (const w of workers) {
        if (w.order && w.order.type === 'gather' && w.order.resType) counts[w.order.resType]++;
      }
      for (const w of workers) {
        if (w.order) continue;
        let want = 'snacks', bestGap = -Infinity;
        for (const r of RES_TYPES) {
          const gap = ratio[r] * workers.length - counts[r];
          if (gap > bestGap) { bestGap = gap; want = r; }
        }
        const node = this.nearestGatherSource(owner, want, w.x, w.z, 60, w)
                  || this.nearestGatherSource(owner, 'snacks', w.x, w.z, 60, w);
        if (node) { this.cmdGather([w], node); counts[node.kind === 'building' ? 'snacks' : node.resType]++; }
      }

      // --- build manager ---
      if (!has('mat') && workers.length >= 6 && this.canAfford(owner, BUILDINGS.mat.cost)) {
        this.aiPlace('mat', chest, workers);
      }
      // floating too many blocks: add a second Training Mat for production throughput
      const matCount = mine.filter((e) => e.type === 'mat').length;
      if (matCount === 1 && has('mat', true) && p.res.blocks > 450 && military.length >= 4) {
        this.aiPlace('mat', chest, workers);
      }
      // age 2+ production buildings (was age-2-only, which meant a fast boomer
      // that hit age 3 first would NEVER raise its faction workshop → no unique
      // units, buildings or civ tech; build them whenever the age prereq is met)
      if (p.age >= 2) {
        if (!has('bench') && this.canAfford(owner, BUILDINGS.bench.cost)) this.aiPlace('bench', chest, workers);
        else if (has('bench', true) && !has('garage') && p.res.buttons > 140 && this.canAfford(owner, BUILDINGS.garage.cost)) {
          this.aiPlace('garage', chest, workers);
        }
        // every tribe raises its own faction workshop
        const fbKey = Object.keys(BUILDINGS).find((k) => BUILDINGS[k].faction === this.factionKeys[owner]);
        if (fbKey && has('bench', true) && !has(fbKey) && this.canAfford(owner, BUILDINGS[fbKey].cost)) {
          this.aiPlace(fbKey, chest, workers);
        }
      }
      // naval maps: raise a Dock in Age 1 once the economy stands — skimmers
      // start harvesting the bath early; warships come with the age-up
      if (this.map.water && !has('dock') && has('mat', true)
          && this.canAfford(owner, BUILDINGS.dock.cost)) {
        this.aiPlace('dock', chest, workers);
      }
      // idle Bath Skimmers head for the nearest floating pile
      for (const s of mine.filter((e) => e.kind === 'unit' && e.def.gatherNaval && !e.order)) {
        let bestW = null, bwD = Infinity;
        for (const e of this.entities) {
          if (e.kind !== 'resource' || e.dead || !e.aquatic) continue;
          const d = (e.x - s.x) ** 2 + (e.z - s.z) ** 2;
          if (d < bwD) { bwD = d; bestW = e; }
        }
        if (bestW) this.cmdGather([s], bestW);
      }
      // a Tinker Bench once the army's rolling, to research blanket upgrades
      if (diff.usesTechs && p.age >= 2 && !has('tinker') && has('mat', true) && military.length >= 3
          && this.canAfford(owner, BUILDINGS.tinker.cost)) {
        this.aiPlace('tinker', chest, workers);
      }
      // boomers dig in for the long game: watchtowers and an early market
      if (persona === 'boomer' && p.age >= 2) {
        const towers = mine.filter((e) => e.type === 'tower').length;
        if (towers < 2 && p.res.blocks > 320 && this.canAfford(owner, BUILDINGS.tower.cost)) {
          this.aiPlace('tower', chest, workers);
        } else if (!has('market') && p.res.blocks > 260 && this.canAfford(owner, BUILDINGS.market.cost)) {
          this.aiPlace('market', chest, workers);
        }
      }
      // forward baskets when the economy strays far from home
      if (!mine.some((e) => e.type === 'basket' && e.built < 1)) {
        for (const w of workers) {
          if (!w.order || w.order.type !== 'gather' || !w.order.node || w.order.node.dead) continue;
          const node = w.order.node;
          const drop = this.nearestDropoff(owner, node.x, node.z);
          if (drop && dist2(node, drop) > 15 * 15 && this.canAfford(owner, BUILDINGS.basket.cost)) {
            this.aiPlace('basket', { ti: node.ti, tj: node.tj, owner }, workers);
            break;
          }
        }
      }
      if (p.age === 3 && diff.usesSiege) {
        if (!has('workshop') && this.canAfford(owner, BUILDINGS.workshop.cost)) this.aiPlace('workshop', chest, workers);
        // swimming in resources late game: go for the wonder win
        if (!has('wonder') && this.canAfford(owner, {
          blocks: BUILDINGS.wonder.cost.blocks + 150,
          snacks: BUILDINGS.wonder.cost.snacks + 150,
          buttons: BUILDINGS.wonder.cost.buttons + 50,
          marbles: BUILDINGS.wonder.cost.marbles + 50,
        })) {
          this.aiPlace('wonder', chest, workers);
        }
      }

      // --- research manager ---
      if (diff.usesTechs) {
        ai.techT -= AI.tick;
        if (ai.techT <= 0) {
          ai.techT = 12; // check research a little more often (was 18)
          const priority = ['sorting', 'pockets',
            enemyRanged > 3 ? 'bands' : 'pencils', 'scissors', 'shoes', 'pencils', 'bands',
            // civ signature techs first — the loop below only researches the one
            // this AI's own faction building offers, so listing all is safe, and
            // fronting them makes each AI civ actually express its identity
            'liveammo', 'interlock', 'grouphug', 'nitro', 'overclock', 'chivalry',
            // core army line upgrades: steel (Age 2) then champion (Age 3)
            'steel_soldier', 'steel_archer', 'steel_spear',
            'elite_soldier', 'elite_archer', 'elite_spear',
            'whetstone', 'springs', 'tape', 'quilting', 'training', 'reinforced', 'plating',
            'sugarrush', 'overwound',
            ...(mine.some((e) => e.type === 'tower') ? ['pentower'] : []),
            ...(mine.some((e) => e.type === 'wall' || e.type === 'gate') ? ['steelwork'] : [])];
          // research up to 2 techs per pass, and tolerate a busier queue (4 not 2)
          // so upgrades aren't permanently starved by buildings busy training —
          // that stall meant the AI barely teched past the Playmat Age.
          // skip techs already mid-research so a pass advances to NEW ones instead
          // of burning its budget re-attempting queued techs (the old stall).
          const inProgress = new Set();
          for (const b of mine) {
            if (b.kind === 'building' && b.queue) for (const q of b.queue) if (q.kind === 'tech') inProgress.add(q.tech);
          }
          let started = 0;
          for (const techId of priority) {
            if (started >= 2) break;
            if (p.techs.has(techId) || inProgress.has(techId)) continue;
            const tech = TECHS[techId];
            if (tech.age > p.age || !this.canAfford(owner, tech.cost)) continue;
            // slot it on the least-busy building that offers the tech
            let best = null;
            for (const b of mine) {
              if (b.kind !== 'building' || b.built < 1 || !b.def.techs || !b.def.techs.includes(techId)) continue;
              if (b.queue.length >= 4) continue;
              if (!best || b.queue.length < best.queue.length) best = b;
            }
            if (best && this.researchTech(best, techId)) started++;
          }
        }
      }

      // --- military manager (counter what the player fields) ---
      // savings policy: once the economy is up, a starter army exists, and age
      // prereqs are built, military only spends what's left above the age-up
      // reserve (AoE-style budgeting). Age-up fires as soon as the fund fills.
      const up = AGE_UPS[p.age];
      const prereqOk = p.age === 1
        ? (has('mat', true) && has('house', true))
        : (p.age === 2 && (!diff.usesSiege ? false : true));
      const saving = !!up && prereqOk && p.aging <= 0
        && workers.length >= diff.workerTarget - 3
        && military.length >= Math.min(6, ai.wave - 2);
      if (saving && this.canAfford(owner, up.cost)) {
        this.startAgeUp(chest);
      }
      const affordAboveReserve = (cost) => {
        if (!this.canAfford(owner, cost)) return false;
        if (!saving) return true;
        return Object.entries(cost).every(([k, v]) => p.res[k] - (up.cost[k] || 0) >= v);
      };
      for (const b of mine.filter((e) => e.kind === 'building' && e.built >= 1 && e.def.trains && e.type !== 'chest')) {
        if (b.queue.length >= 2) continue;
        if (b.type === 'fort') {
          // faction unique when the coffers allow, heroes otherwise
          const uniq = Object.keys(UNITS).find((k) => UNITS[k].faction === this.factionKeys[owner]);
          const type = uniq && this.rng() < 0.55 ? uniq : 'hero';
          if (affordAboveReserve(UNITS[type].cost)) this.trainUnit(b, type);
        } else if (b.type === 'mat') {
          const medics = mine.filter((e) => e.type === 'medic').length;
          if (p.age >= 2 && medics < Math.floor(military.length / 6) && affordAboveReserve(UNITS.medic.cost)) {
            this.trainUnit(b, 'medic');
          } else {
            // rushers stamp out cheap soldiers; boomers keep powder dry in age 1
            if (persona === 'boomer' && p.age === 1 && military.length >= 4) continue;
            const spearBias = persona === 'rusher' ? 0.15 : 0.3;
            const wantSpear = p.age >= 2 && (enemyRaiders >= 2 ? this.rng() < 0.7 : this.rng() < spearBias);
            const type = wantSpear ? 'spear' : 'soldier';
            if (affordAboveReserve(UNITS[type].cost)) this.trainUnit(b, type);
          }
        } else if (b.type === 'bench') {
          // counter-pick: flingers answer both massed ranged and massed heavies
          const wantFlinger = (enemyRanged >= 3 && this.rng() < 0.6) || (enemyHeavy >= 3 && this.rng() < 0.5);
          const type = wantFlinger ? 'flinger' : 'archer';
          if (affordAboveReserve(UNITS[type].cost)) this.trainUnit(b, type);
        } else if (b.type === 'garage' && p.res.buttons > 100) {
          if (affordAboveReserve(UNITS.raider.cost)) this.trainUnit(b, 'raider');
        } else if (b.type === 'workshop') {
          const type = this.rng() < 0.55 ? 'ram' : 'catapult';
          if (affordAboveReserve(UNITS[type].cost)) this.trainUnit(b, type);
        } else if (b.def.trains) {
          // faction workshops: train whatever the tribe can field
          // (skimmer fleet capped by temperament — rushers fish less, boomers more)
          const skimCap = persona === 'rusher' ? 2 : persona === 'boomer' ? 4 : 3;
          const skimmers = mine.filter((e) => e.type === 'skimmer').length + b.queue.filter((q) => q.type === 'skimmer').length;
          const opts = b.def.trains.filter((t) => {
            const d = UNITS[t];
            return d && t !== 'cart' && (d.age || 1) <= p.age
              && (t !== 'skimmer' || skimmers < skimCap)
              && (!d.faction || d.faction === this.factionKeys[owner]);
          });
          if (opts.length) {
            // rushers reach for the cheapest toy on the shelf; boomers for the biggest
            let type;
            const costSum = (t) => Object.values(UNITS[t].cost || {}).reduce((a, v) => a + v, 0);
            if (persona === 'rusher' && this.rng() < 0.55) {
              type = opts.reduce((m, t) => costSum(t) < costSum(m) ? t : m, opts[0]);
            } else if (persona === 'boomer' && this.rng() < 0.55) {
              type = opts.reduce((m, t) => costSum(t) > costSum(m) ? t : m, opts[0]);
            } else {
              type = opts[(this.rng() * opts.length) | 0];
            }
            if (affordAboveReserve(UNITS[type].cost)) this.trainUnit(b, type);
          }
        }
      }
    }

    // --- scouting manager ---
    const scout = mine.find((e) => e.type === 'scout');
    ai.scoutT -= AI.tick;
    if (scout && ai.scoutT <= 0) {
      ai.scoutT = AI.scoutRepathTime;
      this.cmdMove([scout], worldOf((this.rng() * N) | 0), worldOf((this.rng() * N) | 0));
    }

    // --- objective manager: contest Lost Stickers the team doesn't hold ---
    ai.stickerT = (ai.stickerT === undefined ? 25 : ai.stickerT) - AI.tick;
    if (ai.stickerT <= 0) {
      ai.stickerT = 30;
      if (!ai.attacking && military.length >= 5) {
        const s = this.entities.find((e) => e.kind === 'objective' && !e.dead && e.holder !== this.teamOf(owner));
        if (s) {
          const squad = military.filter((m) => !m.order).slice(0, 2);
          for (const m of squad) this.setOrder(m, { type: 'amove', x: s.x, z: s.z }, false);
        }
      }
    }

    // --- raid manager: periodic raider strikes at the enemy economy ---
    ai.raidT -= AI.tick;
    if (ai.raidT <= 0 && p.age >= 2 && !ai.attacking) {
      ai.raidT = ai.raidInterval;
      const raiders = military.filter((m) => m.type === 'raider' && (!m.order || m.order.type === 'move')).slice(0, AI.raidSize);
      if (raiders.length >= 2) {
        const base = mine.find((e) => e.type === 'chest') || mine[0];
        const victim = base && this.nearestEnemyOf(owner, base.x, base.z, 999,
          (e) => e.kind === 'unit' && e.type === 'worker');
        if (victim) {
          for (const r of raiders) this.setOrder(r, { type: 'amove', x: victim.x, z: victim.z }, false);
          this.speakAI('raid', owner);
        }
      }
    }

    // --- defense / attack managers ---
    const home = chest || mine.find((e) => e.kind === 'building');
    if (home) {
      const threat = this.nearestEnemyOf(owner, home.x, home.z, AI.defendRadius, (e) => e.kind === 'unit' && e.def.aggro > 0)
                  || this.nearestEnemyOf(owner, home.x, home.z, AI.defendRadius, (e) => e.kind === 'unit');
      if (threat) {
        for (const m of military) {
          if (!m.order || m.order.type !== 'attack' || m.order.target.dead) {
            m.order = { type: 'attack', target: threat, auto: true };
          }
        }
        return;
      }
    }
    // a standing enemy wonder overrides everything: all-in to break it
    const playerWonder = this.entities.find((e) =>
      e.kind === 'building' && e.type === 'wonder' && this.isEnemy(owner, e.owner) && !e.dead && e.built >= 1);
    if (playerWonder && military.length >= 4 && (!ai.attacking || ai.attackTarget !== playerWonder)) {
      ai.attacking = true;
      ai.attackTarget = playerWonder;
      for (const m of military) this.setOrder(m, { type: 'amove', x: playerWonder.x, z: playerWonder.z }, false);
    }

    // regicide: once a healthy army exists, hunt the enemy King directly instead
    // of trading raids around the escalating wave threshold. Killing the King
    // wins outright, so this both plays to the mode and stops turtle stalemates.
    const enemyKing = this.gameMode === 'regicide'
      ? this.nearestEnemyOf(owner, home ? home.x : 0, home ? home.z : 0, 999,
        (e) => e.kind === 'unit' && e.isKing)
      : null;
    if (enemyKing && military.length >= Math.min(10, ai.wave)
        && (!ai.attacking || ai.attackTarget !== enemyKing)) {
      ai.attacking = true;
      ai.attackTarget = enemyKing;
      for (const m of military) this.setOrder(m, { type: 'amove', x: enemyKing.x, z: enemyKing.z }, false);
    }

    if (ai.attacking) {
      // keep a live target; retire the assault if the army gets wiped
      if (!ai.attackTarget || ai.attackTarget.dead) {
        ai.attackTarget = playerWonder
          || this.nearestEnemyOf(owner, home ? home.x : 0, home ? home.z : 0, 999,
            (e) => e.kind === 'building' && PRODUCTION_BUILDINGS.includes(e.type))
          || this.nearestEnemyOf(owner, home ? home.x : 0, home ? home.z : 0, 999, () => true);
      }
      if (!ai.attackTarget) {
        ai.attacking = false;
      } else if (military.length < Math.max(2, ai.wave * 0.25)) {
        ai.attacking = false;
        ai.attackTarget = null;
        ai.wave += diff.waveGrowth;
        if (home) this.cmdMove(military, home.x, home.z + 4);
      } else {
        // stream reinforcements: idle military attack-moves at the target so it
        // fights whatever defends along the way instead of tunnel-visioning
        const healers = mine.filter((e) => e.kind === 'unit' && e.def.heal);
        for (const m of [...military, ...healers]) {
          if (!m.order) {
            m.order = { type: 'amove', x: ai.attackTarget.x, z: ai.attackTarget.z };
          }
        }
      }
    } else if (military.length >= Math.max(4, Math.ceil(ai.wave * Math.pow(0.75, Math.max(0, this.time - 720) / 60)))) {
      // past bedtime, nobody turtles: after minute 12 the wave threshold shrinks
      // 25% per minute, so late games always come to blows instead of stalling
      ai.attacking = true;
      ai.attackTarget = this.nearestEnemyOf(owner, home ? home.x : 0, home ? home.z : 0, 999,
        (e) => e.kind === 'building' && PRODUCTION_BUILDINGS.includes(e.type))
        || this.nearestEnemyOf(owner, home ? home.x : 0, home ? home.z : 0, 999, () => true);
      if (ai.attackTarget) {
        const healers = mine.filter((e) => e.kind === 'unit' && e.def.heal);
        for (const m of [...military, ...healers]) {
          this.setOrder(m, { type: 'amove', x: ai.attackTarget.x, z: ai.attackTarget.z }, false);
        }
      } else {
        ai.attacking = false;
      }
    }
  }

  nearestEnemyOf(owner, x, z, maxD, filter) {
    let best = null, bd = maxD * maxD;
    for (const e of this.entities) {
      if (e.dead || e.garrisoned || !this.isEnemy(owner, e.owner)) continue;
      if (filter && !filter(e)) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  aiPlace(type, chest, workers) {
    const owner = chest.owner;
    const def = BUILDINGS[type];
    const maxR = def.dock ? 32 : 16; // docks reach out to find the shoreline
    for (let r = 2; r < maxR; r++) {
      for (let k = 0; k < 10; k++) {
        const ang = this.rng() * Math.PI * 2;
        const i = Math.round(chest.ti + 2 + Math.cos(ang) * (def.size + r));
        const j = Math.round(chest.tj + 2 + Math.sin(ang) * (def.size + r));
        if (this.canPlace(owner, type, i, j)) {
          const b = this.tryPlaceBuilding(owner, type, i, j);
          if (b) {
            // never yank workers off another construction site
            const builders = workers
              .filter((w) => !(w.order && w.order.type === 'build'))
              .sort((a, c) => dist2(a, b) - dist2(c, b))
              .slice(0, 2);
            this.cmdBuild(builders, b);
          }
          return;
        }
      }
    }
  }

  // ---------- alerts / win ----------
  alert(msg, kind = 'info', pos = null, throttleSec = 0) {
    if (throttleSec) {
      const last = this.alertThrottle[msg] || -999;
      if (this.time - last < throttleSec) return;
      this.alertThrottle[msg] = this.time;
    }
    if (kind === 'attack') this.sfx && this.sfx.play('alarm', 6000);
    this.cb.alert(msg, kind, pos);
  }

  endGame(winnerTeam) {
    this.over = true;
    const win = winnerTeam === this.myTeam;
    this.sfx && this.sfx.play(win ? 'victory' : 'defeat');
    this.cb.gameOver(win, this.players.map((p) => p.stats), this.timeline);
  }

  // is a player still in the match? depends on the game mode
  playerAlive(p) {
    if (this.gameMode === 'regicide') {
      return this.entities.some((e) => e.kind === 'unit' && e.isKing && e.owner === p.id && !e.dead);
    }
    if (this.gameMode === 'sudden') {
      // one Toy Chest, no rebuilding — lose it and you're out
      return this.entities.some((e) => e.kind === 'building' && e.type === 'chest' && e.owner === p.id && !e.dead);
    }
    // standard/koth: you're still in while you can produce OR rebuild.
    // - any unit-training building keeps you in outright; OR
    // - a worker + ANY standing building (a basket/tower is a foothold to
    //   rebuild a Toy Chest from). This is stall-safe: the winner just razes
    //   your last building — it never has to chase down a fleeing worker.
    const mine = this.entities.filter((e) => e.owner === p.id && !e.dead);
    if (mine.some((e) => e.kind === 'building' && PRODUCTION_BUILDINGS.includes(e.type))) return true;
    return mine.some((e) => e.kind === 'building')
      && mine.some((e) => e.kind === 'unit' && e.type === 'worker');
  }

  checkWin() {
    if (this.over || this.tutorial) return; // the tutorial ends on its own
    if (this.gameMode === 'survival' && this.survival) {
      // the Forgotten never "win" by holding ground — the night ends only when
      // every defender is wiped (defeat) or the dawn wave is cleared (handled in
      // updateSurvival). The den seat is ignored here entirely.
      const defenders = this.players.filter((p) => p.team === 0 && !p.den);
      if (!defenders.some((p) => this.playerAlive(p))) this.endGame(-1);
      return;
    }
    const aliveTeams = new Set();
    for (const p of this.players) if (this.playerAlive(p)) aliveTeams.add(p.team);
    if (aliveTeams.size === 1) this.endGame([...aliveTeams][0]);
    else if (aliveTeams.size === 0) this.endGame(-1);
  }

  // ---------- Survival: "The Long Night" wave defense ----------
  // The den seat (team 1, no base) leaks escalating waves of the Forgotten from
  // the far corner toward the defenders. Fully deterministic — every roll uses
  // this.rng, so a seed replays the same night in lockstep.
  setupSurvival(starts) {
    const den = this.players.find((p) => p.den) || this.players[this.players.length - 1];
    this.denId = den.id;
    const [di, dj] = starts[this.denId] || [N / 2, 6];
    this.survival = {
      denX: worldOf(di), denZ: worldOf(dj),
      wave: 0, active: 0, banked: true, // wave 0 needs no bounty
      nextAt: SURVIVAL.firstWaveAt, clearGapAt: Infinity, recmdT: 0,
      bestWave: 0,
    };
    // an opening cushion so the first walls can go up no matter the start-res pick
    for (const p of this.players) {
      if (p.team !== 0 || p.den) continue;
      for (const [r, v] of Object.entries(SURVIVAL.opening)) p.res[r] = (p.res[r] || 0) + v;
    }
  }

  spawnSurvivalWave(n) {
    const S = this.survival, C = SURVIVAL;
    S.wave = n;
    S.bestWave = Math.max(S.bestWave, n);
    S.banked = false;                      // this wave's bounty is not yet paid
    S.nextAt = this.time + C.hardGap;      // a wave always comes within hardGap…
    S.clearGapAt = this.time + C.gap;      // …or sooner, once the field is clear
    const isBoss = n % C.boss.every === 0;
    const count = Math.max(1, Math.round(C.countBase + C.countPerWave * (n - 1)));
    const tier = [...C.tiers].reverse().find((t) => n >= t.from) || C.tiers[0];
    const drop = (type) => {
      const ang = this.rng() * Math.PI * 2;
      const rad = 1.5 + this.rng() * 4;
      const e = this.spawnUnit(type, this.denId, S.denX + Math.cos(ang) * rad, S.denZ + Math.sin(ang) * rad, false);
      if (this.fx) this.fx.spawnPop(e.x, e.z, e.def.color); // a puff as each one wakes
      return e;
    };
    for (let k = 0; k < count; k++) drop(tier.pool[(this.rng() * tier.pool.length) | 0]);
    if (isBoss) drop(C.boss.pool[(this.rng() * C.boss.pool.length) | 0]);
    S.recmdT = 0; // point the fresh wave at the defenders immediately
    this.alert(isBoss
      ? `Wave ${n} — something enormous is winding itself awake…`
      : `Wave ${n} rises from the toy box.`, isBoss ? 'attack' : 'warn', null, 0);
    if (this.sfx && !this.mp) this.sfx.play(isBoss ? 'thud' : 'charge', 200);
  }

  updateSurvival(dt) {
    if (this.over || !this.survival) return;
    const S = this.survival, C = SURVIVAL;
    let active = 0;
    for (const e of this.entities) if (e.kind === 'unit' && e.owner === this.denId && !e.dead) active++;
    S.active = active;

    // a wave fully repelled: pay the bounty, then check for dawn
    if (S.wave > 0 && active === 0 && !S.banked) {
      S.banked = true;
      const amt = Math.round(C.bounty.base + C.bounty.perWave * (S.wave - 1));
      for (const p of this.players) {
        if (p.team !== 0 || p.den) continue;
        for (const r of C.bounty.spread) p.res[r] = (p.res[r] || 0) + amt;
      }
      if (S.wave >= C.dawnWave) { this.survivalWon = true; this.endGame(0); return; }
      this.alert(`Wave ${S.wave} repelled — the toy box coughs up a reward.`, 'info', null, 0);
    }

    // launch the next wave at the hard deadline, or after the breather once clear
    if (S.wave < C.dawnWave
        && (this.time >= S.nextAt || (S.wave > 0 && active === 0 && this.time >= S.clearGapAt && S.banked))) {
      this.spawnSurvivalWave(S.wave + 1);
      return;
    }

    // keep the swarm pointed at the nearest defender building so it never idles
    S.recmdT -= dt;
    if (S.recmdT <= 0) {
      S.recmdT = 2.5;
      for (const u of this.entities) {
        if (u.kind !== 'unit' || u.owner !== this.denId || u.dead) continue;
        if (u.order && u.order.type === 'attack') continue; // already fighting — leave it
        const tgt = this.nearestEnemyOf(this.denId, u.x, u.z, 999, (e) => e.kind === 'building')
                 || this.nearestEnemyOf(this.denId, u.x, u.z, 999, () => true);
        if (tgt) this.setOrder(u, { type: 'amove', x: tgt.x, z: tgt.z }, false);
      }
    }
  }

  // wonder victory: a standing, completed wonder counts down to a win
  updateWonder(dt) {
    if (this.over || this.gameMode === 'survival') return; // survival wins only at dawn
    const wonder = this.entities.find((e) =>
      e.kind === 'building' && e.type === 'wonder' && !e.dead && e.built >= 1);
    if (!wonder) {
      if (this.wonderState) {
        this.alert(this.teamOf(this.wonderState.owner) === this.myTeam
          ? 'The Imagination Wonder has fallen — the countdown stops.'
          : 'The rival Wonder is destroyed! The countdown stops.', 'age');
        this.wonderState = null;
      }
      return;
    }
    if (!this.wonderState || this.wonderState.owner !== wonder.owner) {
      this.wonderState = { owner: wonder.owner, t: WONDER.countdown };
      const mine = this.teamOf(wonder.owner) === this.myTeam;
      // fog integrity: the news travels, but the map ping only lands if we can see it
      const ping = (mine || this.seenByMyTeam(wonder.x, wonder.z)) ? { x: wonder.x, z: wonder.z } : null;
      this.alert(mine
        ? 'Your team\'s Imagination Wonder stands! Defend it to win.'
        : `${TEAM_NAMES[1]} built an Imagination Wonder — destroy it before the countdown ends!`,
        'age', ping);
      if (ping) this.fx && this.fx.confetti(wonder.x, wonder.z);
      this.speakAI('wonder', wonder.owner);
    }
    this.wonderState.t -= dt;
    if (this.wonderState.t <= 60 && !this.wonderState.warned) {
      this.wonderState.warned = true;
      const ping2 = (this.teamOf(this.wonderState.owner) === this.myTeam || this.seenByMyTeam(wonder.x, wonder.z)) ? { x: wonder.x, z: wonder.z } : null;
      this.alert('One minute left on the Wonder countdown!', 'attack', ping2);
    }
    if (this.wonderState.t <= 0) {
      this.endGame(this.teamOf(this.wonderState.owner));
    }
  }

  // relic victory: hold EVERY Lost Sticker at once → a countdown to the win
  updateRelics(dt) {
    if (this.over || this.gameMode === 'survival') return; // survival wins only at dawn
    const stickers = this.entities.filter((e) => e.kind === 'objective' && !e.dead);
    if (stickers.length < 2) return; // need a real set to make it a race
    const holders = new Set(stickers.map((s) => s.holder));
    // one team must hold every sticker (holders is a single team id ≥ 0)
    const team = (holders.size === 1 && [...holders][0] >= 0) ? [...holders][0] : -1;
    if (team < 0) {
      if (this.relicState) {
        this.alert(this.relicState.team === this.myTeam
          ? 'You lost a Lost Sticker — the countdown stops.'
          : 'A Lost Sticker was contested — the rival countdown stops.', 'age');
        this.relicState = null;
      }
      return;
    }
    if (!this.relicState || this.relicState.team !== team) {
      this.relicState = { team, t: RELIC_COUNTDOWN };
      this.alert(team === this.myTeam
        ? 'Your team holds every Lost Sticker! Keep them all to win.'
        : `${TEAM_NAMES[1]} hold all the Lost Stickers — take one back before the countdown ends!`,
        'age');
    }
    this.relicState.t -= dt;
    if (this.relicState.t <= 20 && !this.relicState.warned) {
      this.relicState.warned = true;
      this.alert('20 seconds left on the Lost Sticker countdown!', 'attack');
    }
    if (this.relicState.t <= 0) this.endGame(team);
  }

  // King of the Hill: a team alone on the golden Throne banks hold time
  updateKoth(dt) {
    if (this.over || this.gameMode !== 'koth') return;
    const throne = this.entities.find((e) => e.kind === 'objective' && e.type === 'throne' && !e.dead);
    if (!throne) return;
    const teams = new Set();
    for (const e of this.entities) {
      if (e.kind !== 'unit' || e.dead || e.def.aggro <= 0 || e.garrisoned) continue;
      if (dist2(e, throne) <= throne.radius ** 2) teams.add(this.teamOf(e.owner));
    }
    const holder = teams.size === 1 ? [...teams][0] : -1;
    if (holder !== throne.holder) {
      throne.holder = holder;
      throne.view.setHolder(holder < 0 ? null : (holder === this.myTeam ? 0x4d9bff : 0xe4572e));
      if (holder === this.myTeam) this.alert('Your team holds the Golden Throne!', 'info', { x: throne.x, z: throne.z });
      else if (holder >= 0) this.alert(`${TEAM_NAMES[1]} seized the Throne — push them off!`, 'warn', { x: throne.x, z: throne.z }, 6);
    }
    if (holder >= 0) {
      throne.holdTeam = holder;
      throne.holdTime = (throne.holdTime || 0) + dt;
      if (throne.holdTime >= KOTH_HOLD) this.endGame(holder);
    } else {
      // slowly bleed progress back when nobody rules
      throne.holdTime = Math.max(0, (throne.holdTime || 0) - dt * 0.5);
    }
    this.kothState = throne.holdTime > 0
      ? { team: throne.holdTeam, t: Math.max(0, KOTH_HOLD - throne.holdTime), contested: holder < 0 }
      : null;
  }

  // does my team have honest eyes on (x, z)? Sim-side check so alerts can't
  // leak positions through the fog (each client computes its own answer).
  seenByMyTeam(x, z) {
    for (const e of this.entities) {
      if (e.dead || this.teamOf(e.owner) !== this.myTeam) continue;
      const vis = (e.def.vision || 0) + (e.kind === 'building' ? 1 : 0.5);
      const dx = e.x - x, dz = e.z - z;
      if (dx * dx + dz * dz <= vis * vis) return true;
    }
    return false;
  }

  // ---------- AI table-talk + bedtime narrator (UI-only, never touches the sim) ----------
  speakAI(event, pid) {
    if (!this.isEnemy(this.myId, pid)) return;
    const line = AI_LINES[event] && AI_LINES[event][this.factionKeys[pid]];
    if (line) this.alert(line, event === 'king' ? 'attack' : 'warn', null, 20);
  }

  // ---------- scripted mission moments (campaign only) ----------
  // main.js hands us a per-game copy of the mission's event list; each event
  // fires once when the clock crosses its timestamp. Deterministic and inert
  // outside the campaign (missionEvents is simply never set).
  processMissionEvents() {
    if (!this.missionEvents) return;
    for (const ev of this.missionEvents) {
      if (ev.done || this.time < ev.at) continue;
      ev.done = true;
      if (ev.text) {
        // character beats speak through the dialogue bar; plain beats stay toasts
        if (ev.speaker && this.cb.dialogue) this.cb.dialogue(ev.speaker, ev.text, ev.kind || 'story');
        else this.alert(ev.text, ev.kind || 'story', null, 0);
      }
      if (ev.type === 'spawn') {
        const owner = ev.owner || 0;
        const home = this.entities.find((e) => e.type === 'chest' && e.owner === owner && !e.dead)
          || this.entities.find((e) => e.kind === 'building' && e.owner === owner && !e.dead);
        if (!home) continue;
        const naval = UNITS[ev.unit] && UNITS[ev.unit].naval;
        let bx = home.x + 3, bz = home.z + 3;
        if (naval) {
          // ships arrive on the nearest open water instead of beaching at the chest
          let best = null, bd = Infinity;
          for (let j = 2; j < N - 2; j += 2) for (let i = 2; i < N - 2; i += 2) {
            if (this.water[idx(i, j)] !== 1 || this.blocked[idx(i, j)]) continue;
            const d = (worldOf(i) - home.x) ** 2 + (worldOf(j) - home.z) ** 2;
            if (d < bd) { bd = d; best = [worldOf(i), worldOf(j)]; }
          }
          if (!best) continue;
          bx = best[0]; bz = best[1];
        }
        for (let i = 0; i < (ev.n || 1); i++) {
          this.spawnUnit(ev.unit, owner, bx + (i % 3) * 0.9, bz + ((i / 3) | 0) * 0.9, true);
        }
        // a marked beat pulls the camera over for a look (view-only, skippable)
        if (ev.focus && this.cb.focus) this.cb.focus(bx, bz);
      } else if (ev.type === 'boost') {
        const p = this.players[ev.owner ?? 1];
        if (p) for (const [k, v] of Object.entries(ev.res || {})) p.res[k] += v;
      }
    }
  }

  narrate(key) {
    const flag = '_told_' + key;
    // second night (NG+): the narrator retells the beat from memory
    const line = (this.ngPlus && NARRATOR_NG[key]) || NARRATOR[key];
    if (this[flag] || !line) return;
    this[flag] = true;
    this.alert(line, 'story', null, 6);
    // the storyteller reads the beat aloud (respects the SFX mute; UI-only)
    if (this.sfx && !this.sfx.muted) {
      try {
        const vo = new Audio('assets/audio/vo/' + key + '.wav');
        vo.volume = Math.min(1, (this.sfx.volume || 0.5) * 1.4);
        vo.play().catch(() => {});
      } catch (e) { /* no audio support — the text alert already carries it */ }
    }
  }

  // ---------- the storyteller: a bedtime retelling of the match ----------
  // Reads the 10s timeline + stats and writes three short paragraphs for the
  // game-over card. Deterministic (seeded by the match itself), pure UI.
  matchStory(win) {
    const t = Math.floor(this.time);
    const me = this.players[this.myId];
    const foes = this.players.filter((p) => this.isEnemy(this.myId, p.id));
    if (!me || !foes.length) return '';
    const myFac = FACTIONS[this.factionKeys[this.myId]] || FACTIONS.classic;
    const foeFac = FACTIONS[this.factionKeys[foes[0].id]] || FACTIONS.classic;
    const mapName = (this.map && this.map.label) || 'the bedroom floor';
    let s = ((t * 2654435761) ^ (me.stats.kills * 97 + me.stats.lost * 31 + me.stats.gathered | 0)) >>> 0 || 7;
    const pick = (arr) => arr[(s = (s * 16807) % 2147483647) % arr.length];

    // the shape of the fight, read back from the timeline
    const tl = this.timeline;
    const mine = (i) => (tl[i] && tl[i].p[this.myId]) || { mil: 0, wrk: 0, score: 0 };
    const theirs = (i) => Math.max(0, ...foes.map((p) => (tl[i] && tl[i].p[p.id] && tl[i].p[p.id].score) || 0));
    let flips = 0, ahead = null, peakMil = 0, earlyLead = null;
    for (let i = 0; i < tl.length; i++) {
      const lead = mine(i).score >= theirs(i);
      if (ahead !== null && lead !== ahead) flips++;
      ahead = lead;
      if (mine(i).mil > peakMil) peakMil = mine(i).mil;
      if (earlyLead === null && tl[i].t >= Math.max(60, t * 0.25)) earlyLead = lead;
    }

    const quarrel = pick(['the rug', 'who owned the morning', 'a patch of floor no bigger than a picture book',
      'everything and nothing, the way toys always do']);
    const p1 = `Once upon a ${mapName}, the ${myFac.label} and the ${foeFac.label} quarreled over ${quarrel}.`;

    const openBit = earlyLead === null
      ? pick(['It was over almost before the room noticed.', 'It was short, and it was loud.'])
      : earlyLead
        ? pick([`The early hours belonged to you — ${pick(['tidy lines of gatherers', 'patient building', 'a snack-fed economy'])} while the rival was still lacing its boots.`,
          'You struck the first blows and set the tempo of the whole affair.'])
        : pick(['The rival owned the opening — for a while the room forgot your name.',
          `The ${foeFac.label} started faster, and for a long time the floor tilted their way.`]);
    const flipBit = flips === 0
      ? 'The lead, once taken, was never given back.'
      : flips <= 2
        ? `The advantage changed hands ${flips === 1 ? 'once' : 'twice'} before the matter was settled.`
        : `The lead changed hands ${flips} times, and nobody in the room dared blink.`;
    const armyBit = peakMil >= 8
      ? ` At its height your army numbered ${peakMil} toys; ${me.stats.kills} enemies were unmade, and ${me.stats.lost} of ours were carried home.`
      : ` It was never about armies for you — ${me.stats.kills} enemies unmade, ${me.stats.lost} of ours carried home.`;
    const p2 = `${openBit} ${flipBit}${armyBit}`;

    const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
    const p3 = win
      ? pick([`And after ${mm}:${ss} of war, the room went quiet the good way — yours. ${pick(['The night filed it under famous victories.', 'Somewhere a music box played the toy anthem, badly, with feeling.', 'The Lost Stickers will tell this one for years.'])}`,
        `At ${mm}:${ss} the last piece toppled, and the floor belonged to the ${myFac.label}. ${pick(['Sweet dreams, Commander.', 'The rug remembers its heroes.', 'Not bad for toys that were in a box this morning.'])}`])
      : pick([`At ${mm}:${ss} the room went quiet the other way. ${pick(['Every toybox holds a few sad chapters — the good ones read them twice and march again.', 'The rival tells this story now. Make the next one yours.', 'Even the night lamp dimmed a little.'])}`,
        `After ${mm}:${ss} the ${foeFac.label} held the floor. ${pick(['Rematches are a toy tradition older than bedtime.', 'The story is not over — it just needs a braver page.', 'Wind tight, Commander. Morning is a fresh map.'])}`]);

    return `${p1}\n\n${p2}\n\n${p3}`;
  }

  // ---------- main update ----------
  update(dt) {
    // replay playback: re-issue the recorded commands at their exact frames
    if (this.replayFeed) {
      while (this.replayFeed.length && this.replayFeed[0].k <= this.frame) {
        try { this.execCommand(this.myId, this.replayFeed.shift().c); } catch (e) { /* stale ids: skip */ }
      }
    }
    this.frame++;
    this.time += dt;
    if (!this.taunted && this.time > 18 && !this.mp) {
      this.taunted = true;
      this.alert(this.personaTaunt, 'warn'); // a hint at the rival's game plan
    }
    if (this.time > 600) this.narrate('clock10');
    this.processMissionEvents();

    for (const p of this.players) {
      if (p.aging > 0) {
        p.aging -= dt;
        if (p.aging <= 0) {
          p.aging = 0;
          p.age++;
          this.reageBuildings(p.id); // buildings dress up for the new age
          if (p.id === this.myId) {
            this.alert(`The ${AGES[p.age - 1]} has arrived!`, 'age');
            this.sfx && this.sfx.setAge(p.age);
            this.sfx && this.sfx.play('age');
          } else if (p.team === this.myTeam) {
            this.alert(`Your ally reached the ${AGES[p.age - 1]}!`, 'info');
          } else {
            this.speakAI('ageup', p.id); // the rival's own voice carries the news
          }
          if (p.age === 2) this.narrate('age2');
          if (p.age === 3) this.narrate('age3');
          const chest = this.entities.find((e) => e.type === 'chest' && e.owner === p.id && !e.dead);
          if (chest && this.fx) this.fx.confetti(chest.x, chest.z);
          this.cb.age(p);
        }
      }
    }

    for (const e of this.entities) {
      if (e.kind === 'unit') this.updateUnit(e, dt);
      else if (e.kind === 'building') this.updateBuilding(e, dt);
      else if (e.kind === 'critter') this.updateCritter(e, dt);
      else if (e.kind === 'lost') this.updateLostToy(e, dt);
      else if (e.kind === 'camp') this.updateCamp(e, dt);
      else if (e.kind === 'cat') this.updateCat(e, dt);
    }
    this.updateProjectiles(dt);
    this.updateObjectives(dt);
    this.updateWonder(dt);
    this.updateRelics(dt);
    this.updateKoth(dt);
    if (this.gameMode === 'survival') this.updateSurvival(dt);

    // market prices ease back toward their base value over time
    this.marketT -= dt;
    if (this.marketT <= 0) {
      this.marketT = 3;
      for (const r of ['snacks', 'blocks', 'marbles']) {
        this.market[r] += (1 - this.market[r]) * 0.06;
      }
    }

    // sample the timeline every 10s of sim time for post-game charts
    this.tlT -= dt;
    if (this.tlT <= 0) {
      this.tlT = 10;
      const sample = { t: Math.round(this.time), p: this.players.map(() => null) };
      for (const p of this.players) {
        let mil = 0, wrk = 0;
        for (const e of this.entities) {
          if (e.kind !== 'unit' || e.dead || e.owner !== p.id) continue;
          if (e.def.aggro > 0) mil++; else wrk++;
        }
        sample.p[p.id] = {
          mil, wrk,
          score: Math.round(p.stats.gathered + p.stats.kills * 25 + p.stats.razed * 60
            + mil * 12 + wrk * 6 + p.age * 150),
        };
      }
      this.timeline.push(sample);

      // the bedtime narrator watches the tide of battle (UI-only, one-shot each)
      const meS = sample.p[this.myId];
      if (meS) {
        const foeBest = Math.max(0, ...this.players
          .filter((p) => this.isEnemy(this.myId, p.id))
          .map((p) => (sample.p[p.id] && sample.p[p.id].score) || 0));
        if (foeBest > 300 && meS.score < foeBest * 0.55) this._wasBehind = true;
        else if (this._wasBehind && meS.score > foeBest * 1.05) { this._wasBehind = false; this.narrate('comeback'); }
        if (this.time < 480 && meS.wrk >= 20) this.narrate('boom');
        if ((this._lastMil || 0) >= 10 && meS.mil <= 2) this.narrate('armylost');
        this._lastMil = meS.mil;
        const wTeams = new Set(this.entities
          .filter((e) => e.kind === 'building' && !e.dead && e.type === 'wonder')
          .map((e) => this.players[e.owner].team));
        if (wTeams.size >= 2) this.narrate('wonderrace');
        // a rival with no production is still in while a worker + any building
        // stands — tell the player the job isn't finished (the objective says
        // "raze every building"; this is the moment it matters)
        for (const p of this.players) {
          if (p.team === this.myTeam || !this.playerAlive(p)) continue;
          const theirs = this.entities.filter((e) => e.owner === p.id && !e.dead && e.kind === 'building');
          if (theirs.length && !theirs.some((e) => PRODUCTION_BUILDINGS.includes(e.type))) {
            this.narrate('foothold');
            break;
          }
        }
      }
    }

    this.sepT -= dt;
    if (this.sepT <= 0) { this.sepT = 0.08; this.separate(); }

    // rally flag follows the selected production building's gather point
    const rb = this.selected.length === 1 && this.selected[0].kind === 'building'
      && this.selected[0].owner === this.myId && this.selected[0].rally ? this.selected[0] : null;
    if (rb) {
      this.rallyFlag.show(rb.rally.x, rb.rally.z);
      this.rallyFlag.group.position.y = this.heightAtWorld(rb.rally.x, rb.rally.z);
    } else this.rallyFlag.hide();
    this.rallyFlag.update(dt);
    if (this.waterSurface) this.waterSurface.update(dt);

    this.fogT -= dt;
    if (this.fogT <= 0) {
      this.fogT = 0.25;
      this.fog.update(this.entities, this.teamOwners(this.myTeam));
      for (const e of this.entities) {
        if (e.removed || !this.isEnemy(this.myId, e.owner)) continue;
        if (e.kind === 'unit') {
          if (!e.dead) e.view.group.visible = !e.garrisoned && this.fog.state(e.x, e.z) === 2;
        } else if (e.kind === 'building') {
          if (!e.seen && this.fog.state(e.x, e.z) === 2) e.seen = true;
          e.view.group.visible = e.seen;
        }
      }
      for (const e of this.entities) {
        if ((e.kind === 'resource' || e.kind === 'objective') && !e.dead) {
          e.view.group.visible = this.fog.state(e.x, e.z) >= 1;
        }
      }
    }

    if (!this.over) {
      // deterministic AIs run in every mode — lockstep clients tick them alike
      // (tutorial keeps them idle so the coach controls the pace)
      for (const p of this.players) {
        if (!p.isAI || this.tutorial) continue;
        const st = this.aiState[p.id];
        st.t -= dt;
        if (st.t <= 0) { st.t = AI.tick; this.aiUpdate(p.id); }
      }
      this.winT -= dt;
      if (this.winT <= 0) { this.winT = 0.5; this.checkWin(); }
    }

    this.compactT = (this.compactT || 0) - dt;
    if (this.compactT <= 0) {
      this.compactT = 2;
      this.entities = this.entities.filter((e) => !e.removed);
    }
  }
}
