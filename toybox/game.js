// ============================================================
// TOYBOX TACTICS — game engine: map, pathfinding, fog of war,
// smooth steering movement, economy, production, tech, combat,
// and the AI opponent. Stats come from data.js; no balance here.
// ============================================================

import * as THREE from 'three';
import {
  MAP_N, POP_MAX, RES_TYPES, RES_META, UNITS, BUILDINGS, TECHS, MARKET,
  AGES, AGE_UPS, PRODUCTION_BUILDINGS, START, AI, DIFFICULTIES, TEAM_NAMES, STICKER, WONDER, PERSONAS, MAPS, FACTIONS,
  CRITTERS,
} from './data.js';
import {
  createUnitView, createBuildingView, createResourceView,
  createGround, createObstacleMesh, createDecorMesh, createStickerView, createRallyFlag,
  makeRankBadge, createCritterView, createMilkSpill,
} from './models.js';

const N = MAP_N;
const idx = (i, j) => j * N + i;
const inMap = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
const tileOf = (x) => Math.floor(x + N / 2);
const worldOf = (i) => i - N / 2 + 0.5;
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

class PathFinder {
  constructor(blocked, gates) {
    this.blocked = blocked;
    this.gates = gates; // gateOwner per tile (-1 none); own gates are passable
    this.g = new Float32Array(N * N);
    this.visit = new Int32Array(N * N).fill(-1);
    this.from = new Int32Array(N * N);
    this.stamp = 0;
  }
  isBlockedFor(m, owner) {
    return this.blocked[m] && this.gates[m] !== owner;
  }
  nearestFree(i, j, maxR = 8) {
    if (inMap(i, j) && !this.blocked[idx(i, j)]) return [i, j];
    for (let r = 1; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = i + di, b = j + dj;
        if (inMap(a, b) && !this.blocked[idx(a, b)]) return [a, b];
      }
    }
    return null;
  }
  find(sx, sz, tx, tz, forOwner = -2) {
    let si = tileOf(sx), sj = tileOf(sz), ti = tileOf(tx), tj = tileOf(tz);
    const sFree = this.nearestFree(si, sj, 4); if (!sFree) return null;
    [si, sj] = sFree;
    const tFree = this.nearestFree(ti, tj, 10); if (!tFree) return null;
    [ti, tj] = tFree;
    if (si === ti && sj === tj) return [{ x: worldOf(ti), z: worldOf(tj) }];

    const stamp = ++this.stamp;
    const { blocked, g, visit, from } = this;
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
    const h = (i, j) => {
      const dx = Math.abs(i - ti), dy = Math.abs(j - tj);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    const start = idx(si, sj);
    g[start] = 0; visit[start] = stamp; from[start] = -1;
    push(h(si, sj), start);
    let expansions = 0, found = false;
    const target = idx(ti, tj);
    while (open.length && expansions++ < 6000) {
      const n = pop();
      if (n === target) { found = true; break; }
      const ni = n % N, nj = (n / N) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = ni + di, b = nj + dj;
        if (!inMap(a, b)) continue;
        const m = idx(a, b);
        if (this.isBlockedFor(m, forOwner)) continue;
        if (di && dj && (this.isBlockedFor(idx(ni + di, nj), forOwner) || this.isBlockedFor(idx(ni, nj + dj), forOwner))) continue;
        const cost = g[n] + (di && dj ? 1.414 : 1);
        if (visit[m] === stamp && g[m] <= cost) continue;
        visit[m] = stamp; g[m] = cost; from[m] = n;
        push(cost + h(a, b), m);
      }
    }
    if (!found) return null;
    const path = [];
    for (let n = target; n !== -1; n = from[n]) path.push({ x: worldOf(n % N), z: worldOf((n / N) | 0) });
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
      new THREE.PlaneGeometry(N, N),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.09;
    plane.renderOrder = 500;
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
    this.rng = makeRng(opts.seed || 20260703);
    this.map = MAPS[opts.map] || MAPS.playmat;
    const base = DIFFICULTIES[opts.difficulty || 'normal'];
    this.entities = [];
    this.selected = [];
    this.formation = 'box'; // client-local; travels inside move commands
    this.projectiles = [];
    this.blocked = new Uint8Array(N * N);
    this.gateOwner = new Int8Array(N * N).fill(-1);
    this.pf = new PathFinder(this.blocked, this.gateOwner);
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
      popUsed: 0, popCap: 0, isAI: !!d.isAI,
      techs: new Set(),
      mods: { carry: 0, gather: 1, gatherSnacks: 1, speedInfantry: 1, speedWheels: 1,
              atkMelee: 0, atkPierce: 0, armorInfantry: 0,
              buildingHp: 1, buildRate: 1, unitHp: 1, healRate: 1, atkVehicle: 0 },
      stats: { gathered: 0, trained: 0, lost: 0, kills: 0, razed: 0 },
    }));
    // factions: humans bring their pick; AIs roll their own (deterministic)
    const pool = Object.keys(FACTIONS);
    this.factionKeys = this.playerDefs.map((d) =>
      d.faction || pool[(this.rng() * pool.length) | 0]);
    for (const p of this.players) {
      const f = FACTIONS[this.factionKeys[p.id]] || FACTIONS.classic;
      for (const [k, v] of Object.entries(f.mods)) {
        if (k === 'carry' || k === 'atkMelee' || k === 'atkPierce' || k === 'armorInfantry' || k === 'atkVehicle') {
          p.mods[k] += v;
        } else {
          p.mods[k] *= v;
        }
      }
    }
    // per-AI difficulty persona and manager state (deterministic roll order)
    this.aiState = {};
    this.personaTaunt = null;
    for (const p of this.players) {
      if (!p.isAI) continue;
      const personaKey = ['rusher', 'balanced', 'boomer'][(this.rng() * 3) | 0];
      const persona = PERSONAS[personaKey];
      const diff = {
        ...base,
        workerTarget: Math.max(6, base.workerTarget + persona.workerTarget),
        firstWave: Math.max(4, base.firstWave + persona.firstWave),
      };
      this.aiState[p.id] = {
        wave: diff.firstWave, attacking: false, scoutT: 0, t: this.rng() * 0.7,
        techT: 20, raidT: persona.raidInterval || AI.raidInterval,
        raidInterval: persona.raidInterval || AI.raidInterval, diff,
      };
      // the first enemy AI's plan is the one hinted at in the opening taunt
      if (!this.personaTaunt && p.team !== (this.playerDefs[this.myId] || this.playerDefs[0]).team) {
        this.personaTaunt = persona.taunt;
      }
    }
    this.time = 0;
    this.timeline = []; this.tlT = 0;
    // remembered so a save file can rebuild an identical match shell
    this.mapKey = opts.map || 'playmat';
    this.diffKey = opts.difficulty || 'normal';
    this.seedUsed = opts.seed || 20260703;
    this.wonderState = null; // { owner, t } while a completed wonder stands
    this.fogT = 0; this.winT = 0; this.sepT = 0;
    this.alertThrottle = {};
    this.over = false;
  }

  // ---------- setup ----------
  setup() {
    this.scene.add(createGround(N, this.map.ground));
    const rng = this.rng;

    for (let k = 0; k < this.map.obstacles; k++) {
      const i = 14 + (rng() * (N - 28)) | 0, j = 14 + (rng() * (N - 28)) | 0;
      const w = 2 + (rng() * 2 | 0), d = 2 + (rng() * 2 | 0);
      this.addObstacle(rng() < 0.5 ? 'book' : 'pillow', i, j, w, d, k + 1);
      this.addObstacle(rng() < 0.5 ? 'book' : 'pillow', N - i - w, N - j - d, w, d, k + 40);
    }
    // Toy Chest Canyon: a diagonal barricade with three contested gaps
    if (this.map.canyon) {
      const gaps = [N / 2, N / 2 - 17, N / 2 + 17];
      for (let t = 6; t < N - 8; t += 3) {
        if (gaps.some((gp) => Math.abs(t - gp) < 4)) continue;
        const jit = ((rng() * 3) | 0) - 1;
        this.addObstacle(rng() < 0.65 ? 'pillow' : 'book', t + jit, t - jit, 3, 3, 200 + t);
      }
    }
    // non-blocking clutter
    const kinds = ['crayon', 'die', 'ball'];
    for (let k = 0; k < 14; k++) {
      const i = 6 + (rng() * (N - 12)) | 0, j = 6 + (rng() * (N - 12)) | 0;
      if (this.blocked[idx(i, j)]) continue;
      const decor = createDecorMesh(kinds[(rng() * 3) | 0], k + 3);
      decor.position.set(worldOf(i), 0, worldOf(j));
      this.scene.add(decor);
    }

    // start corners by team: west column vs east column (1v1 keeps SW vs NE)
    const westCorners = [[10, N - 15], [10, 11]];
    const eastCorners = [[N - 14, 11], [N - 14, N - 15]];
    const teams = [...new Set(this.players.map((p) => p.team))];
    const cornerPools = { [teams[0]]: westCorners.slice(), [teams[1] ?? -1]: eastCorners.slice() };
    const starts = this.players.map((p) => (cornerPools[p.team] || eastCorners).shift());
    this.homes = starts.map(([ci, cj]) => ({ x: worldOf(ci + 2), z: worldOf(cj + 2) }));
    this.homePos = this.homes[this.myId];
    // resource abundance scales with the map theme
    const RC = (type, i, j, count) =>
      this.addResourceCluster(type, i, j, Math.max(1, Math.round(count * this.map.resourceMul)));
    for (const p of this.players) {
      const [ci, cj] = starts[p.id];
      const chest = this.addBuilding('chest', p.id, ci, cj, true);
      const face = ci < N / 2 ? 1 : -1;             // expand toward the middle
      const faceZ = cj < N / 2 ? 1 : -1;
      for (let w = 0; w < START.workers; w++) {
        this.spawnUnit('worker', p.id, chest.x + face * (2.8 + w * 0.7), chest.z + faceZ * 2.6);
      }
      this.spawnUnit('scout', p.id, chest.x + face * 3.4, chest.z - faceZ * 1.5);
      RC('snacks', ci + face * 7, cj + faceZ * 2, 4);
      RC('blocks', ci + 1, cj + faceZ * 7, 4);
      RC('buttons', ci + face * 10, cj + faceZ * 5, 2);
      RC('snacks', ci + face * 16, cj + faceZ * 10, 3);
      RC('blocks', ci + face * 11, cj + faceZ * 16, 3);
      RC('marbles', ci + face * 14, cj - faceZ * 2, 2);
    }
    RC('buttons', N / 2 - 4, N / 2 - 1, 3);
    RC('buttons', N / 2 + 2, N / 2 + 1, 3);
    RC('snacks', N / 2 - 1, N / 2 - 7, 3);
    RC('blocks', N / 2 - 1, N / 2 + 6, 3);
    RC('marbles', N / 2 - 8, N / 2 + 1, 2);
    RC('marbles', N / 2 + 6, N / 2 - 1, 2);

    // Lost Stickers: hold with military toys for a Buttons trickle (map control)
    this.addSticker(worldOf(N / 2 - 14), worldOf(N / 2 - 14));
    this.addSticker(worldOf(N / 2 + 13), worldOf(N / 2 + 13));
    if (this.map.stickers >= 3) this.addSticker(worldOf(N / 2), worldOf(N / 2));

    // ---- terrain features: AoE lakes/mountains/forests, bedroom edition ----
    const feat = this.map.features || {};
    const clearOfHomes = (i, j, r) =>
      this.homes.every((h) => (worldOf(i) - h.x) ** 2 + (worldOf(j) - h.z) ** 2 > r * r);

    // spilled milk: an impassable lake with the guilty glass at its edge
    for (let k = 0; k < (feat.milk || 0); k++) {
      for (let tries = 0; tries < 40; tries++) {
        const i = 16 + (rng() * (N - 32)) | 0, j = 16 + (rng() * (N - 32)) | 0;
        const rx = 3 + (rng() * 2 | 0), rz = 2 + (rng() * 2 | 0);
        if (!clearOfHomes(i, j, 22)) continue;
        let free = true;
        for (let b = -rz; b <= rz && free; b++) for (let a = -rx; a <= rx; a++) {
          const inside = (a * a) / (rx * rx) + (b * b) / (rz * rz) <= 1;
          if (inside && (!inMap(i + a, j + b) || this.blocked[idx(i + a, j + b)])) { free = false; break; }
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

    // fallen-book ranges: winding impassable ridges with a pass in the middle
    for (let k = 0; k < (feat.ranges || 0); k++) {
      for (let tries = 0; tries < 25; tries++) {
        let ci = 15 + (rng() * (N - 30)) | 0, cj = 15 + (rng() * (N - 30)) | 0;
        if (!clearOfHomes(ci, cj, 20)) continue;
        let dir = rng() * Math.PI * 2;
        const segs = 5 + (rng() * 3 | 0);
        const gapAt = (segs / 2) | 0;
        for (let s = 0; s < segs; s++) {
          const w = 2 + (rng() * 2 | 0), d = 2;
          if (s !== gapAt) {
            // only stack books on genuinely free floor
            let free = inMap(ci, cj) && inMap(ci + w - 1, cj + d - 1) && clearOfHomes(ci, cj, 16);
            for (let b = cj; b < cj + d && free; b++) for (let a = ci; a < ci + w; a++) {
              if (this.blocked[idx(a, b)]) { free = false; break; }
            }
            if (free) this.addObstacle(rng() < 0.75 ? 'book' : 'pillow', ci, cj, w, d, k * 100 + s + 7);
          }
          dir += (rng() - 0.5) * 0.9;
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
        for (let b = -3; b <= 3; b++) for (let a = -3; a <= 3; a++) {
          if (a * a + b * b > 8 + rng() * 4) continue; // ragged blob edge
          if (this.addResourceNode('blocks', i0 + a, j0 + b)) placed++;
        }
        if (placed >= 6) break;
      }
    }

    // wind-up mice scatter around the middle third of the room
    for (let k = 0; k < CRITTERS.count; k++) {
      const i = N / 2 - 12 + ((rng() * 24) | 0), j = N / 2 - 12 + ((rng() * 24) | 0);
      if (this.blocked[idx(i, j)]) continue;
      this.addCritter(worldOf(i), worldOf(j));
    }

    this.fog.update(this.entities);
  }

  addCritter(x, z) {
    const view = createCritterView();
    view.group.position.set(x, 0, z);
    this.scene.add(view.group);
    this.entities.push({
      id: this.nextId++, kind: 'critter', type: 'mouse', owner: -1,
      x, z, radius: 0.25, captor: -1, facing: 0, wanderT: this.rng() * 3, scanT: 0,
      def: { name: 'Wind-Up Mouse', desc: `Walk a toy up to it — it follows you home for +${CRITTERS.snack} Snacks.` },
      view, dead: false,
    });
  }

  updateCritter(c, dt) {
    if (c.dead) return;
    c.view.update(dt);
    if (c.captor < 0) {
      // any toy that gets close wins the mouse over
      c.scanT -= dt;
      if (c.scanT <= 0) {
        c.scanT = 0.4;
        for (const e of this.entities) {
          if (e.kind !== 'unit' || e.dead || e.owner < 0 || e.garrisoned) continue;
          if (dist2(c, e) < CRITTERS.captureRadius ** 2) {
            c.captor = e.owner;
            c.tgt = null;
            if (e.owner === this.myId) this.alert('Wind-up mouse befriended! It scurries home with Snacks.', 'info', { x: c.x, z: c.z }, 4);
            break;
          }
        }
      }
      c.wanderT -= dt;
      if (c.wanderT <= 0 || !c.tgt) {
        c.wanderT = 2 + this.rng() * 4;
        const a = this.rng() * Math.PI * 2, r = 1.5 + this.rng() * 4;
        const tx = Math.max(-N / 2 + 2, Math.min(N / 2 - 2, c.x + Math.sin(a) * r));
        const tz = Math.max(-N / 2 + 2, Math.min(N / 2 - 2, c.z + Math.cos(a) * r));
        c.tgt = this.tileOpenFor(tx, tz, -1) ? { x: tx, z: tz } : null;
      }
    } else {
      const chest = this.entities.find((e) =>
        e.kind === 'building' && e.type === 'chest' && e.owner === c.captor && !e.dead && e.built >= 1);
      if (!chest) { c.captor = -1; c.tgt = null; return; }
      c.tgt = { x: chest.x, z: chest.z };
      if (dist2(c, chest) < (chest.radius + 0.9) ** 2) {
        this.players[c.captor].res.snacks += CRITTERS.snack;
        this.players[c.captor].stats.gathered += CRITTERS.snack;
        this.fx && this.fx.spawnPop(c.x, c.z, 0xf9c74f);
        if (c.captor === this.myId) {
          this.alert(`+${CRITTERS.snack} Snacks — the wind-up mouse delivered!`, 'info', null, 2);
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
        const sp = (c.captor >= 0 ? 1.8 : 1.0) * dt;
        const nx = c.x + (dx / d) * sp, nz = c.z + (dz / d) * sp;
        if (this.tileOpenFor(nx, nz, -1)) { c.x = nx; c.z = nz; c.facing = Math.atan2(dx, dz); }
        else c.tgt = null;
      } else c.tgt = null;
    }
    c.view.group.position.set(c.x, 0, c.z);
    c.view.group.rotation.y = c.facing;
  }

  addSticker(x, z) {
    const view = createStickerView();
    view.group.position.set(x, 0, z);
    this.scene.add(view.group);
    this.entities.push({
      id: this.nextId++, kind: 'objective', type: 'sticker', owner: -1,
      x, z, radius: 0.7, holder: -1, scanT: this.rng(),
      def: { name: 'Lost Sticker', desc: `Hold with military toys: +${STICKER.incomePerSec} 🔘/s` },
      view, dead: false,
    });
  }

  updateObjectives(dt) {
    for (const s of this.entities) {
      if (s.kind !== 'objective' || s.dead) continue;
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
    for (let b = j; b < j + d; b++) for (let a = i; a < i + w; a++) this.blocked[idx(a, b)] = 1;
    const mesh = createObstacleMesh(kind, w, d, seed);
    mesh.position.set(worldOf(i) + (w - 1) / 2, 0, worldOf(j) + (d - 1) / 2);
    this.scene.add(mesh);
  }

  addResourceNode(resType, i, j) {
    if (!inMap(i, j) || this.blocked[idx(i, j)]) return null;
    this.blocked[idx(i, j)] = 1;
    const view = createResourceView(resType, i * 131 + j);
    view.group.position.set(worldOf(i), 0, worldOf(j));
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

  addResourceCluster(resType, i0, j0, count) {
    const offs = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]];
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
    const view = createBuildingView(type, def, owner, i * 977 + j);
    const x = worldOf(i) + (s - 1) / 2, z = worldOf(j) + (s - 1) / 2;
    view.group.position.set(x, 0, z);
    this.scene.add(view.group);
    const hpMult = (this.players[owner].techs.has('plating') ? 1.2 : 1) * this.players[owner].mods.buildingHp;
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
    return e;
  }

  spawnUnit(type, owner, x, z, fromBuilding = false) {
    const def = UNITS[type];
    const p = this.players[owner];
    const free = this.pf.nearestFree(tileOf(x), tileOf(z), 6);
    if (free) { x = worldOf(free[0]); z = worldOf(free[1]); }
    const view = createUnitView(this.registry, type, def, owner);
    view.group.position.set(x, 0, z);
    this.scene.add(view.group);
    const hpMult = ((def.aggro > 0 && p.techs.has('training')) ? 1.15 : 1) * p.mods.unitHp
      * (p.techs.has(`elite_${type}`) ? 1.25 : 1);
    const e = {
      id: this.nextId++, kind: 'unit', type, owner, def, view,
      x, z, vx: 0, vz: 0, radius: 0.3,
      hp: def.hp * hpMult, maxHp: def.hp * hpMult,
      order: null, oq: [], path: null, pathI: 0, aim: null, losT: 0, stuckT: 0,
      cd: 0, scanT: this.rng() * 0.5, gfxT: 0,
      swing: null, carry: 0, carryType: null, facing: 0,
      stance: 'agg', anchor: null, garrisoned: null,
      dead: false, wasMoving: false, spawnT: fromBuilding ? 0.35 : 0,
    };
    this.entities.push(e);
    p.popUsed++;
    if (p.techs.has(`elite_${type}`)) this.decorateElite(e);
    if (fromBuilding) {
      p.stats.trained++;
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
    return s;
  }
  atkOf(e) {
    const m = this.players[e.owner].mods;
    let a = e.def.atk;
    if (e.def.tags.includes('infantry') && e.def.atkType === 'melee') a += m.atkMelee;
    if (e.def.tags.includes('ranged') || e.def.tags.includes('skirmisher')) a += m.atkPierce;
    if (e.def.tags.includes('vehicle')) a += m.atkVehicle;
    if (e.kind === 'unit' && this.players[e.owner].techs.has(`elite_${e.type}`)) a += 2;
    // veteran stars
    if (e.kills >= 6) a += 2; else if (e.kills >= 3) a += 1;
    return a;
  }
  armorOf(e, type) {
    let a = (e.def.armor && e.def.armor[type]) || 0;
    if (e.kind === 'unit' && e.def.tags.includes('infantry')) a += this.players[e.owner].mods.armorInfantry;
    if (e.kind === 'unit' && this.players[e.owner].techs.has(`elite_${e.type}`)) a += 1;
    return a;
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
    }
    // unit-line upgrades: promote every living toy of the line on the spot
    if (techId.startsWith('elite_')) {
      const line = techId.slice(6);
      for (const e of this.entities) {
        if (e.kind === 'unit' && e.owner === owner && !e.dead && e.type === line) {
          const f = e.hp / e.maxHp;
          e.maxHp = Math.round(e.maxHp * 1.25);
          e.hp = e.maxHp * f;
          this.decorateElite(e);
        }
      }
    }
    if (owner === this.myId) {
      this.alert(`${TECHS[techId].name} researched!`, 'info');
      this.sfx && this.sfx.play('research');
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
  trade(owner, res, dir) {
    const p = this.players[owner];
    if (dir === 'sell') {
      if (p.res[res] < MARKET.lot) return false;
      p.res[res] -= MARKET.lot;
      p.res.buttons += MARKET.sellGain;
    } else {
      if (p.res.buttons < MARKET.buyCost) return false;
      p.res.buttons -= MARKET.buyCost;
      p.res[res] += MARKET.lot;
    }
    if (owner === 0) this.sfx && this.sfx.play('trade');
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
    sorted.forEach((u, k) => {
      const row = Math.floor(k / cols), col = k % cols;
      const ox = (col - (cols - 1) / 2) * spacing;
      const oz = -row * spacing;
      const rx = ox * Math.cos(ang) + oz * Math.sin(ang);
      const rz = -ox * Math.sin(ang) + oz * Math.cos(ang);
      this.setOrder(u, { type: amove ? 'amove' : 'move', x: x + rx, z: z + rz }, queued);
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
      if (u.type !== 'worker') { this.setOrder(u, { type: 'move', x: node.x, z: node.z }, queued); continue; }
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
    if (this.mp && this.net) this.net.queueLocal(cmd);
    else this.execCommand(this.myId, cmd);
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
          for (const u of units()) if (!u.garrisoned) this.setOrder(u, { type: 'garrison', b }, c.q);
        }
        break;
      }
      case 'ungar': {
        const b = ent(c.id);
        if (b && b.kind === 'building' && b.owner === pid) this.ungarrison(b);
        break;
      }
      case 'bell': this.townBell(pid); break;
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
    }
    for (const p of this.players) {
      h = (h + ((p.res.snacks | 0) * 3) + ((p.res.blocks | 0) * 5)
        + ((p.res.buttons | 0) * 7) + ((p.res.marbles | 0) * 11) + p.popUsed * 13) | 0;
    }
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
        factions: [...this.factionKeys],
        playerDefs: this.playerDefs.map((d, i) => ({ team: d.team, isAI: !!d.isAI, faction: this.factionKeys[i] })),
      },
      time: this.time, nextId: this.nextId, rng: this.rng.getState(),
      blocked: Array.from(this.blocked), gateOwner: Array.from(this.gateOwner),
      aiState: Object.fromEntries(Object.entries(this.aiState).map(([k, st]) => {
        const { diff, ...rest } = st;
        return [k, { ...rest, attackTarget: null }];
      })),
      wonder: this.wonderState ? { ...this.wonderState } : null,
      timeline: this.timeline,
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
            facing: e.facing,
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
          return { k: 'c', id: e.id, x: e.x, z: e.z, captor: e.captor, facing: e.facing };
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
    for (const pr of this.projectiles) this.scene.remove(pr.mesh);
    this.projectiles.length = 0;
    this.blocked.set(snap.blocked);
    this.gateOwner.set(snap.gateOwner);
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
        const view = createUnitView(this.registry, se.type, def, se.owner);
        view.group.position.set(se.x, 0, se.z);
        view.group.rotation.y = se.facing || 0;
        this.scene.add(view.group);
        e = {
          id: se.id, kind: 'unit', type: se.type, owner: se.owner, def, view,
          x: se.x, z: se.z, vx: 0, vz: 0, radius: 0.3, hp: se.hp, maxHp: se.maxHp,
          order: null, oq: [], path: null, pathI: 0, aim: null, losT: 0, stuckT: 0,
          cd: 0, scanT: 0.3, gfxT: 0, swing: null, carry: se.carry, carryType: se.carryType,
          stance: se.stance || 'agg', anchor: null, garrisoned: se.garrisoned || null,
          facing: se.facing || 0, kills: se.kills || 0,
          dead: false, wasMoving: false, spawnT: 0,
        };
        if (e.kills >= 3) { e.rankBadge = makeRankBadge(e.kills >= 6 ? 2 : 1); view.group.add(e.rankBadge); }
        if (this.players[e.owner].techs.has(`elite_${e.type}`)) this.decorateElite(e);
        if (e.garrisoned) view.group.visible = false;
        view.hpBar.set(e.hp / e.maxHp);
      } else if (se.k === 'b') {
        const def = BUILDINGS[se.type];
        const s = def.size;
        const view = createBuildingView(se.type, def, se.owner, se.ti * 977 + se.tj);
        const x = worldOf(se.ti) + (s - 1) / 2, z = worldOf(se.tj) + (s - 1) / 2;
        view.group.position.set(x, 0, z);
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
        const view = createResourceView(se.resType, se.ti * 131 + se.tj);
        view.group.position.set(worldOf(se.ti), 0, worldOf(se.tj));
        this.scene.add(view.group);
        e = {
          id: se.id, kind: 'resource', resType: se.resType, owner: -1,
          x: worldOf(se.ti), z: worldOf(se.tj), ti: se.ti, tj: se.tj, radius: 0.55,
          amount: se.amount, def: { name: RES_META[se.resType].nodeName },
          view, dead: false,
        };
      } else if (se.k === 'c') {
        const view = createCritterView();
        view.group.position.set(se.x, 0, se.z);
        this.scene.add(view.group);
        e = {
          id: se.id, kind: 'critter', type: 'mouse', owner: -1,
          x: se.x, z: se.z, radius: 0.25, captor: se.captor, facing: se.facing || 0,
          wanderT: 1, scanT: 0.3,
          def: { name: 'Wind-Up Mouse', desc: `Walk a toy up to it — it follows you home for +${CRITTERS.snack} Snacks.` },
          view, dead: false,
        };
      } else {
        const view = createStickerView();
        view.group.position.set(se.x, 0, se.z);
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
    this.nextId = snap.nextId;
    this.time = snap.time;
    this.tlT = 10;
    this.rng.setState(snap.rng);
    if (snap.aiState) {
      for (const [k, st] of Object.entries(snap.aiState)) {
        if (this.aiState[k]) Object.assign(this.aiState[k], st, { diff: this.aiState[k].diff });
      }
    } else if (snap.ai && this.aiState[1]) {
      Object.assign(this.aiState[1], snap.ai); // v1 saves: single AI
    }
    this.wonderState = snap.wonder ? { ...snap.wonder } : null;
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
  canPlace(owner, type, i, j) {
    const def = BUILDINGS[type];
    if ((def.age || 1) > this.players[owner].age) return false;
    const s = def.size;
    if (!inMap(i, j) || !inMap(i + s - 1, j + s - 1)) return false;
    for (let b = j; b < j + s; b++) for (let a = i; a < i + s; a++) {
      if (this.blocked[idx(a, b)]) return false;
    }
    for (const e of this.entities) {
      if (e.kind !== 'unit' || e.dead) continue;
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
  applyDamage(attacker, target, spec) {
    if (target.dead) return;
    let dmg = spec.atk;
    if (spec.bonus && target.def.tags) {
      for (const t of target.def.tags) if (spec.bonus[t]) dmg += spec.bonus[t];
    }
    dmg = Math.max(1, dmg - this.armorOf(target, spec.atkType));
    target.hp -= dmg;
    target.view.markDamaged();
    target.view.hpBar.set(target.hp / target.maxHp);
    if (this.fx) {
      const c = spec.atkType === 'siege' ? 0xff8f5a : spec.atkType === 'pierce' ? 0xffd166 : 0xfff0c8;
      const hy = target.kind === 'building' ? target.def.height * 0.5 : 0.35;
      this.fx.hit(target.x, hy, target.z, c, spec.atkType === 'siege' ? 10 : 5);
      // hard hits chip a matching toy piece off the target
      if (Math.random() < (spec.atkType === 'siege' ? 0.8 : 0.25)) {
        this.fx.chip(target.x, hy, target.z, target.def.debris);
      }
    }
    if (this.sfx && this.fog.state(target.x, target.z) === 2) {
      this.sfx.play(spec.atkType === 'siege' ? 'thud' : spec.atkType === 'pierce' ? 'twang' : 'bonk', 90);
    }
    if (target.owner === this.myId) {
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
    if (target.hp <= 0) this.kill(target, attacker);
  }

  kill(e, killer) {
    if (e.dead) return;
    e.dead = true;
    if (this.selected.includes(e)) this.setSelection(this.selected.filter((s) => s !== e));
    if (killer && killer.owner >= 0 && killer.owner !== e.owner && e.kind !== 'resource') {
      const ks = this.players[killer.owner].stats;
      if (e.kind === 'unit') ks.kills++; else ks.razed++;
      if (killer.kind === 'unit') {
        killer.kills = (killer.kills || 0) + 1;
        // veteran promotions: 3 kills = ⭐ (+1 atk), 6 kills = ⭐⭐ (+2 atk)
        if (killer.kills === 3 || killer.kills === 6) {
          const tier = killer.kills === 6 ? 2 : 1;
          if (killer.rankBadge) killer.view.group.remove(killer.rankBadge);
          killer.rankBadge = makeRankBadge(tier);
          killer.view.group.add(killer.rankBadge);
          this.fx && this.fx.spawnPop(killer.x, killer.z, 0xffd94a);
          if (killer.owner === this.myId) {
            this.alert(`Your ${killer.def.name} earned ${tier === 2 ? 'a second star' : 'a star'}! (+1 attack)`, 'info', { x: killer.x, z: killer.z });
          }
        }
      }
    }
    if (e.kind === 'unit') {
      this.players[e.owner].popUsed--;
      this.players[e.owner].stats.lost++;
      e.order = null; e.oq.length = 0; e.swing = null;
      e.removeT = e.view.startDeath();
      this.fx && this.fx.death(e.x, e.z, e.def.debris || { colors: [e.def.color] });
      if (this.sfx && this.fog.state(e.x, e.z) === 2) {
        this.sfx.play('squeak', 150);
        // the material decides the sound: fluff whumps, buttons jingle, plastic clatters
        const d = e.def.debris;
        const mat = d && d.fluff ? 'whump' : d && d.shapes && d.shapes.includes('disc') ? 'jingle' : 'clatter';
        this.sfx.play(mat, 120);
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
        this.sfx && this.sfx.play('crash', 300);
        if (e.owner === this.myId) this.alert(`${e.def.name} destroyed!`, 'attack', { x: e.x, z: e.z }, 4);
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
    const y0 = attacker.kind === 'building' ? attacker.def.height * 0.8 : 0.45;
    mesh.position.set(attacker.x, y0, attacker.z);
    this.scene.add(mesh);
    if (this.fx && this.fog.state(attacker.x, attacker.z) === 2) {
      this.fx.muzzle(attacker.x, y0, attacker.z, p.color);
    }
    const d = Math.sqrt(dist2(attacker, target));
    this.projectiles.push({
      mesh, target, attacker, spec,
      from: { x: attacker.x, y: y0, z: attacker.z },
      to: { x: target.x, z: target.z },
      t: 0, dur: Math.max(0.12, d / p.speed),
      arc: p.arc ? Math.min(1.6, d * 0.18) : 0,
      spin: !!p.spin, trail: p.trail || null,
    });
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.t += dt;
      if (!pr.target.dead) { pr.to.x = pr.target.x; pr.to.z = pr.target.z; }
      const f = Math.min(1, pr.t / pr.dur);
      pr.mesh.position.set(
        pr.from.x + (pr.to.x - pr.from.x) * f,
        pr.from.y + (0.4 - pr.from.y) * f + pr.arc * 4 * f * (1 - f),
        pr.from.z + (pr.to.z - pr.from.z) * f
      );
      if (pr.spin) pr.mesh.rotation.x += dt * 9;
      if (pr.trail && this.fx && ((pr.t * 30) | 0) % 2 === 0) {
        this.fx.trail(pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z, pr.trail);
      }
      if (f >= 1) {
        const spec = pr.spec;
        if (spec.projectile && spec.projectile.splash) {
          const r = spec.projectile.splash;
          this.fx && this.fx.explosion(pr.to.x, pr.to.z, r);
          this.sfx && this.sfx.play('thud', 120);
          for (const e of this.entities) {
            if (e.dead || e.owner === pr.attacker.owner || e.owner === -1) continue;
            if (e.kind !== 'unit' && e.kind !== 'building') continue;
            const d2 = (e.x - pr.to.x) ** 2 + (e.z - pr.to.z) ** 2;
            const rr = (r + e.radius) ** 2;
            if (d2 <= rr) {
              const full = e === pr.target || d2 <= (r * 0.4) ** 2;
              this.applyDamage(pr.attacker, e, { ...spec, atk: full ? spec.atk : Math.round(spec.atk * 0.6) });
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

  // ---------- smooth movement (velocity steering + LOS-smoothed paths) ----------
  lineFree(x0, z0, x1, z1, owner = -2) {
    const dx = x1 - x0, dz = z1 - z0;
    const d = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.ceil(d / 0.35);
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      const i = tileOf(x0 + dx * f), j = tileOf(z0 + dz * f);
      if (!inMap(i, j)) return false;
      const m = idx(i, j);
      if (this.blocked[m] && this.gateOwner[m] !== owner) return false;
    }
    return true;
  }
  tileOpenFor(x, z, owner) {
    const i = tileOf(x), j = tileOf(z);
    if (!inMap(i, j)) return false;
    const m = idx(i, j);
    return !this.blocked[m] || this.gateOwner[m] === owner;
  }

  // steer u toward (tx,tz); returns true when within `arrive`
  steer(u, tx, tz, dt, arrive) {
    const dx = tx - u.x, dz = tz - u.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= arrive) { u.path = null; u.aim = null; return true; }

    u.losT -= dt;
    const goalMoved = u.goal && ((u.goal.x - tx) ** 2 + (u.goal.z - tz) ** 2 > 2.25);
    if (!u.aim || u.losT <= 0 || goalMoved) {
      u.losT = 0.15 + this.rng() * 0.1;
      u.goal = { x: tx, z: tz };
      if (goalMoved) u.path = null;
      if (this.lineFree(u.x, u.z, tx, tz, u.owner)) {
        u.aim = { x: tx, z: tz };
        u.path = null;
        u.noPath = false;
      } else {
        if (!u.path) {
          u.path = this.pf.find(u.x, u.z, tx, tz, u.owner);
          u.pathI = 0;
          u.noPath = !u.path;
        }
        if (u.path) {
          // skip ahead to the furthest waypoint we can see (kills the tile zigzag)
          while (u.pathI + 1 < u.path.length
              && this.lineFree(u.x, u.z, u.path[u.pathI + 1].x, u.path[u.pathI + 1].z, u.owner)) {
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
    if (this.tileOpenFor(nx, nz, u.owner)) {
      u.x = nx; u.z = nz; u.stuckT = 0;
    } else if (this.tileOpenFor(nx, u.z, u.owner)) {
      u.x = nx; u.vz *= 0.4; u.stuckT += dt; // slide along the wall
    } else if (this.tileOpenFor(u.x, nz, u.owner)) {
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
    const swingDur = Math.min(u.def.interval * 0.85, 1.15);
    const impactDelay = u.view.startAttack(swingDur);
    u.swing = { t: 0, impactAt: impactDelay, dur: swingDur, target, dealt: false };
    u.cd = u.def.interval;
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
        if (!s.target.dead && dist2(u, s.target) < (u.def.range + s.target.radius + 1.4) ** 2) {
          if (spec.projectile) this.spawnProjectile(u, s.target, spec);
          else this.applyDamage(u, s.target, spec);
        }
      }
      if (s.t >= s.dur) u.swing = null;
    } else if (u.order) {
      const o = u.order;
      if (o.type === 'move') {
        // fleeing workers only need to reach the building's edge
        if (this.steer(u, o.x, o.z, dt, o.flee ? 2.8 : 0.3)) {
          u.order = null;
          // fled workers head back to work once the coast is clear
          if (o.flee && u.fleeResume) {
            if (!this.nearestEnemy(u.owner, u.x, u.z, 9, (e) => e.kind === 'unit' && e.def.aggro > 0)) {
              u.order = u.fleeResume;
            }
            u.fleeResume = null;
          }
        }
      } else if (o.type === 'amove') {
        u.scanT -= dt;
        if (u.def.aggro > 0 && u.scanT <= 0) {
          u.scanT = 0.4;
          const t = this.nearestEnemy(u.owner, u.x, u.z, u.def.aggro);
          if (t) { u.order = { type: 'attack', target: t, auto: true, then: o }; return this.finishUnitFrame(u, dt, faceTarget); }
        }
        if (this.steer(u, o.x, o.z, dt, 0.6)) u.order = null;
      } else if (o.type === 'patrol') {
        u.scanT -= dt;
        if (u.def.aggro > 0 && u.scanT <= 0) {
          u.scanT = 0.4;
          const t = this.nearestEnemy(u.owner, u.x, u.z, u.def.aggro);
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
            const t = this.nearestEnemy(u.owner, g.x, g.z, u.def.aggro);
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
          const home = this.nearestDropoff(u.owner, u.x, u.z);
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
          const next = o.auto ? this.nearestEnemy(u.owner, u.x, u.z, u.def.aggro || 6) : null;
          u.order = next ? { type: 'attack', target: next, auto: o.auto, then: o.then } : (o.then || null);
        } else {
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
                if (b.owner === this.myId) { this.alert(`${b.def.name} complete.`, 'info'); this.sfx && this.sfx.play('build'); }
                // chain to the next nearby foundation (wall lines build hands-free)
                const next = this.nearestFoundation(u.owner, u.x, u.z, 6);
                u.order = next ? { type: 'build', b: next } : null;
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
        const t = this.nearestEnemy(u.owner, u.x, u.z, scanR, (e) => e.kind === 'unit' || e.kind === 'building');
        if (t) {
          if (u.stance === 'def' && !u.anchor) u.anchor = { x: u.x, z: u.z };
          u.order = { type: 'attack', target: t, auto: true };
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
    const moving = speed > 0.18;
    if (moving) {
      u.facing = Math.atan2(u.vx, u.vz);
    } else if (faceTarget) {
      u.facing = Math.atan2(faceTarget.x - u.x, faceTarget.z - u.z);
    }
    u.view.group.position.set(u.x, 0, u.z);
    let dr = u.facing - u.view.group.rotation.y;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    u.view.group.rotation.y += dr * Math.min(1, dt * 11);
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
      const drop = this.nearestDropoff(u.owner, u.x, u.z);
      if (!drop || !u.carryType) { u.order = null; return; }
      const reach = drop.radius + u.radius + 0.4;
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
          if (u.owner === this.myId) this.alert('A worker ran out of resources to gather.', 'warn', { x: u.x, z: u.z }, 10);
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
    let best = null, bd = maxD * maxD;
    for (const e of this.entities) {
      if (e.dead) continue;
      let ok = false;
      if (e.kind === 'resource' && e.resType === resType) ok = true;
      else if (resType === 'snacks' && e.kind === 'building' && e.owner === owner && e.def.farm && e.built >= 1) {
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
  nearestDropoff(owner, x, z) {
    let best = null, bd = Infinity;
    for (const e of this.entities) {
      if (e.kind !== 'building' || e.dead || e.owner !== owner || !e.def.dropoff || e.built < 1) continue;
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
    t.view = createUnitView(this.registry, t.type, t.def, newOwner);
    t.view.group.position.set(t.x, 0, t.z);
    t.view.group.rotation.y = t.facing;
    this.scene.add(t.view.group);
    t.eliteRing = null;
    if ((t.kills || 0) >= 3) {
      t.rankBadge = makeRankBadge(t.kills >= 6 ? 2 : 1);
      t.view.group.add(t.rankBadge);
    }
    if (this.players[newOwner].techs.has(`elite_${t.type}`)) this.decorateElite(t);
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
      u.view.group.position.set(u.x, 0, u.z);
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
            if (target && u.type === 'worker'
                && (target.kind === 'resource' || (target.kind === 'building' && target.def.farm))) {
              this.cmdGather([u], target);
            } else if (target && this.isEnemy(b.owner, target.owner)) {
              this.cmdAttack([u], target);
            } else {
              this.cmdMove([u], b.rally.x, b.rally.z, false, u.def.aggro > 0);
            }
          }
        }
      }
    }
    // towers/forts always shoot; the chest only shoots while garrisoned.
    // every toy hiding inside adds punch to each arrow.
    const spec = b.def.attack || (b.def.garrisonAttack && b.garrisonIds.length ? b.def.garrisonAttack : null);
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
          if (inMap(tileOf(ux), tileOf(uz)) && !this.blocked[idx(tileOf(ux), tileOf(uz))]) { u.x = ux; u.z = uz; }
          if (inMap(tileOf(vx), tileOf(vz)) && !this.blocked[idx(tileOf(vx), tileOf(vz))]) { v.x = vx; v.z = vz; }
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
      if (p.age === 2) {
        if (!has('bench') && this.canAfford(owner, BUILDINGS.bench.cost)) this.aiPlace('bench', chest, workers);
        else if (has('bench', true) && !has('garage') && p.res.buttons > 140 && this.canAfford(owner, BUILDINGS.garage.cost)) {
          this.aiPlace('garage', chest, workers);
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
          ai.techT = 18;
          const priority = ['sorting', 'pockets',
            enemyRanged > 3 ? 'bands' : 'pencils', 'scissors', 'shoes', 'pencils', 'bands',
            'springs', 'tape', 'training', 'plating'];
          outer:
          for (const techId of priority) {
            if (p.techs.has(techId)) continue;
            const tech = TECHS[techId];
            if (tech.age > p.age || !this.canAfford(owner, tech.cost)) continue;
            for (const b of mine) {
              if (b.kind !== 'building' || b.built < 1 || !b.def.techs || !b.def.techs.includes(techId)) continue;
              if (b.queue.length >= 2) continue;
              this.researchTech(b, techId);
              break outer;
            }
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
            const wantSpear = p.age >= 2 && (enemyRaiders >= 2 ? this.rng() < 0.7 : this.rng() < 0.3);
            const type = wantSpear ? 'spear' : 'soldier';
            if (affordAboveReserve(UNITS[type].cost)) this.trainUnit(b, type);
          }
        } else if (b.type === 'bench') {
          const type = enemyRanged >= 3 && this.rng() < 0.6 ? 'flinger' : 'archer';
          if (affordAboveReserve(UNITS[type].cost)) this.trainUnit(b, type);
        } else if (b.type === 'garage' && p.res.buttons > 100) {
          if (affordAboveReserve(UNITS.raider.cost)) this.trainUnit(b, 'raider');
        } else if (b.type === 'workshop') {
          const type = this.rng() < 0.55 ? 'ram' : 'catapult';
          if (affordAboveReserve(UNITS[type].cost)) this.trainUnit(b, type);
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
    } else if (military.length >= ai.wave) {
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
    for (let r = 2; r < 16; r++) {
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

  checkWin() {
    if (this.over) return;
    // a team stands while ANY of its players still has a production building
    const aliveTeams = new Set();
    for (const p of this.players) {
      const alive = this.entities.some((e) =>
        e.kind === 'building' && e.owner === p.id && !e.dead && PRODUCTION_BUILDINGS.includes(e.type));
      if (alive) aliveTeams.add(p.team);
    }
    if (aliveTeams.size === 1) this.endGame([...aliveTeams][0]);
    else if (aliveTeams.size === 0) this.endGame(-1);
  }

  // wonder victory: a standing, completed wonder counts down to a win
  updateWonder(dt) {
    if (this.over) return;
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
      this.alert(this.teamOf(wonder.owner) === this.myTeam
        ? 'Your team\'s Imagination Wonder stands! Defend it to win.'
        : `${TEAM_NAMES[1]} built an Imagination Wonder — destroy it before the countdown ends!`,
        'age', { x: wonder.x, z: wonder.z });
      this.fx && this.fx.confetti(wonder.x, wonder.z);
    }
    this.wonderState.t -= dt;
    if (this.wonderState.t <= 60 && !this.wonderState.warned) {
      this.wonderState.warned = true;
      this.alert('One minute left on the Wonder countdown!', 'attack', { x: wonder.x, z: wonder.z });
    }
    if (this.wonderState.t <= 0) {
      this.endGame(this.teamOf(this.wonderState.owner));
    }
  }

  // ---------- main update ----------
  update(dt) {
    this.time += dt;
    if (!this.taunted && this.time > 18 && !this.mp) {
      this.taunted = true;
      this.alert(this.personaTaunt, 'warn'); // a hint at the rival's game plan
    }

    for (const p of this.players) {
      if (p.aging > 0) {
        p.aging -= dt;
        if (p.aging <= 0) {
          p.aging = 0;
          p.age++;
          if (p.id === this.myId) {
            this.alert(`The ${AGES[p.age - 1]} has arrived!`, 'age');
            this.sfx && this.sfx.play('age');
          } else if (p.team === this.myTeam) {
            this.alert(`Your ally reached the ${AGES[p.age - 1]}!`, 'info');
          } else if (this.mp || this.players.length > 2) {
            this.alert(`${TEAM_NAMES[1]} reached the ${AGES[p.age - 1]}!`, 'warn');
          }
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
    }
    this.updateProjectiles(dt);
    this.updateObjectives(dt);
    this.updateWonder(dt);

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
    }

    this.sepT -= dt;
    if (this.sepT <= 0) { this.sepT = 0.08; this.separate(); }

    // rally flag follows the selected production building's gather point
    const rb = this.selected.length === 1 && this.selected[0].kind === 'building'
      && this.selected[0].owner === this.myId && this.selected[0].rally ? this.selected[0] : null;
    if (rb) this.rallyFlag.show(rb.rally.x, rb.rally.z);
    else this.rallyFlag.hide();
    this.rallyFlag.update(dt);

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
      for (const p of this.players) {
        if (!p.isAI) continue;
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
