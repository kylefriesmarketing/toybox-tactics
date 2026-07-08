// ============================================================
// TOYBOX TACTICS — model loading + all visual factories.
// UnitModelLoader: per unit type, every GLB is the same mesh with a
// different clip baked in; one file provides the display mesh, each
// file contributes its AnimationClip to a { idle, walk, attack, death } map.
// Units fall back to labelled placeholder boxes if files fail to load.
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from '../assets/lib/jsm/loaders/GLTFLoader.js';
import { mergeVertices } from '../assets/lib/jsm/utils/BufferGeometryUtils.js';
import { MODEL_MANIFEST, TEAM_COLORS } from './data.js';

// ---------------- loading ----------------

// Smoothing pass: mergeVertices + computeVertexNormals, skinning-safe
// (skinIndex/skinWeight ride along through mergeVertices; identical
// co-located vertices collapse so normals average across faces).
function smoothGeometry(geo) {
  geo.deleteAttribute('normal');
  let merged = mergeVertices(geo, 1e-4);
  // legacy generations are extremely low-poly (~500 tris): tessellate and
  // round them so silhouettes read as molded plastic instead of polygons
  const tris = merged.index ? merged.index.count / 3 : merged.attributes.position.count / 3;
  if (tris > 0 && tris < 900) {
    merged = subdivideOnce(subdivideOnce(merged));
    taubinRound(merged, 4);
  } else if (tris < 3000) {
    merged = subdivideOnce(merged);
    taubinRound(merged, 3);
  }
  merged.computeVertexNormals();
  // mergeVertices can't collapse vertices split by UV seams, which leaves
  // hard triangular facets ("cut diamond" look). Average normals across all
  // vertices sharing a position, respecting a crease angle for real edges.
  smoothSeamNormals(merged, 62);
  return merged;
}

// 1:4 linear subdivision — every attribute interpolated; skin influences of
// edge midpoints are merged and renormalized so animation doesn't tear
function subdivideOnce(geo) {
  const index = geo.index.array;
  const attrs = geo.attributes;
  const vCount = attrs.position.count;
  const names = Object.keys(attrs);
  const hasSkin = names.includes('skinIndex') && names.includes('skinWeight');
  const out = {};
  for (const n of names) {
    const a = attrs[n];
    out[n] = { itemSize: a.itemSize, data: Array.from(a.array), Type: a.array.constructor, normalized: a.normalized };
  }
  const edgeMid = new Map();
  const midpoint = (i0, i1) => {
    const key = i0 < i1 ? i0 * vCount + i1 : i1 * vCount + i0;
    let m = edgeMid.get(key);
    if (m !== undefined) return m;
    m = out.position.data.length / 3;
    for (const n of names) {
      if (n === 'skinIndex' || n === 'skinWeight') continue;
      const o = out[n], sz = o.itemSize;
      for (let k = 0; k < sz; k++) o.data.push((o.data[i0 * sz + k] + o.data[i1 * sz + k]) / 2);
    }
    if (hasSkin) {
      const si = out.skinIndex, sw = out.skinWeight;
      const infl = new Map();
      for (const i of [i0, i1]) {
        for (let k = 0; k < 4; k++) {
          const w = sw.data[i * 4 + k] * 0.5;
          if (w > 0) {
            const bone = si.data[i * 4 + k];
            infl.set(bone, (infl.get(bone) || 0) + w);
          }
        }
      }
      const top = [...infl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const tw = top.reduce((s, e) => s + e[1], 0) || 1;
      for (let k = 0; k < 4; k++) {
        si.data.push(top[k] ? top[k][0] : 0);
        sw.data.push(top[k] ? top[k][1] / tw : 0);
      }
    }
    edgeMid.set(key, m);
    return m;
  };
  const newIndex = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    newIndex.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const g2 = new THREE.BufferGeometry();
  for (const n of names) {
    const o = out[n];
    g2.setAttribute(n, new THREE.BufferAttribute(new o.Type(o.data), o.itemSize, o.normalized));
  }
  g2.setIndex(newIndex);
  return g2;
}

// Taubin λ/μ smoothing (rounds without shrinking). Vertices that share a
// position (UV-seam splits) are fused into one smoothing node — no cracks.
function taubinRound(geo, iterations = 4, lambda = 0.5, mu = -0.53) {
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const n = pos.count;
  // group co-located vertices
  const groupOf = new Int32Array(n);
  const groups = [];
  {
    const seen = new Map();
    for (let i = 0; i < n; i++) {
      const k = `${(pos.getX(i) * 1e4) | 0}_${(pos.getY(i) * 1e4) | 0}_${(pos.getZ(i) * 1e4) | 0}`;
      let g = seen.get(k);
      if (g === undefined) { g = groups.length; groups.push([]); seen.set(k, g); }
      groupOf[i] = g;
      groups[g].push(i);
    }
  }
  const gN = groups.length;
  const adj = Array.from({ length: gN }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) {
    const a = groupOf[idx[t]], b = groupOf[idx[t + 1]], c = groupOf[idx[t + 2]];
    if (a !== b) { adj[a].add(b); adj[b].add(a); }
    if (b !== c) { adj[b].add(c); adj[c].add(b); }
    if (a !== c) { adj[a].add(c); adj[c].add(a); }
  }
  let cur = new Float32Array(gN * 3);
  let nxt = new Float32Array(gN * 3);
  for (let g = 0; g < gN; g++) {
    const i = groups[g][0];
    cur[g * 3] = pos.getX(i); cur[g * 3 + 1] = pos.getY(i); cur[g * 3 + 2] = pos.getZ(i);
  }
  const pass = (from, to, f) => {
    for (let g = 0; g < gN; g++) {
      const nb = adj[g];
      if (!nb.size) {
        to[g * 3] = from[g * 3]; to[g * 3 + 1] = from[g * 3 + 1]; to[g * 3 + 2] = from[g * 3 + 2];
        continue;
      }
      let ax = 0, ay = 0, az = 0;
      for (const j of nb) { ax += from[j * 3]; ay += from[j * 3 + 1]; az += from[j * 3 + 2]; }
      ax /= nb.size; ay /= nb.size; az /= nb.size;
      to[g * 3] = from[g * 3] + f * (ax - from[g * 3]);
      to[g * 3 + 1] = from[g * 3 + 1] + f * (ay - from[g * 3 + 1]);
      to[g * 3 + 2] = from[g * 3 + 2] + f * (az - from[g * 3 + 2]);
    }
  };
  for (let it = 0; it < iterations; it++) {
    pass(cur, nxt, lambda); [cur, nxt] = [nxt, cur];
    pass(cur, nxt, mu); [cur, nxt] = [nxt, cur];
  }
  for (let g = 0; g < gN; g++) {
    for (const i of groups[g]) pos.setXYZ(i, cur[g * 3], cur[g * 3 + 1], cur[g * 3 + 2]);
  }
  pos.needsUpdate = true;
}

function smoothSeamNormals(geo, creaseDeg = 62) {
  const pos = geo.attributes.position, norm = geo.attributes.normal;
  if (!pos || !norm) return;
  const cosCrease = Math.cos((creaseDeg * Math.PI) / 180);
  const groups = new Map();
  const keyOf = (i) =>
    `${(pos.getX(i) * 1e4) | 0}_${(pos.getY(i) * 1e4) | 0}_${(pos.getZ(i) * 1e4) | 0}`;
  for (let i = 0; i < pos.count; i++) {
    const k = keyOf(i);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(i);
  }
  const nx = new Float32Array(pos.count), ny = new Float32Array(pos.count), nz = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) { nx[i] = norm.getX(i); ny[i] = norm.getY(i); nz[i] = norm.getZ(i); }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    for (const i of g) {
      let ax = 0, ay = 0, az = 0;
      for (const j of g) {
        const dot = nx[i] * nx[j] + ny[i] * ny[j] + nz[i] * nz[j];
        if (dot >= cosCrease) { ax += nx[j]; ay += ny[j]; az += nz[j]; } // same smoothing group
      }
      const l = Math.hypot(ax, ay, az) || 1;
      norm.setXYZ(i, ax / l, ay / l, az / l);
    }
  }
  norm.needsUpdate = true;
}

function prepareScene(scene) {
  // some generated models ship with a glassy transmissive shell around the
  // painted figure — that's the "made of diamonds" look. If an opaque core
  // exists, strip the shell; if the whole model is glass, solidify it.
  const meshes = [];
  scene.traverse((n) => { if (n.isMesh) meshes.push(n); });
  const isGlassy = (n) => {
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    return mats.every((m) => (m.transmission || 0) > 0.4 || m.opacity < 0.55 || m.transparent === true && m.opacity < 0.85);
  };
  const shells = meshes.filter(isGlassy);
  if (shells.length && shells.length < meshes.length) {
    for (const s of shells) s.removeFromParent();
  } else if (shells.length) {
    for (const s of shells) {
      const mats = Array.isArray(s.material) ? s.material : [s.material];
      for (const m of mats) {
        if (m.transmission !== undefined) m.transmission = 0;
        m.transparent = false;
        m.opacity = 1;
        m.needsUpdate = true;
      }
    }
  }

  scene.traverse((n) => {
    if (n.isMesh) {
      n.geometry = smoothGeometry(n.geometry);
      n.castShadow = true;
      n.frustumCulled = false; // skinned meshes pop out of stale bounds otherwise
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of mats) {
        // toys are plastic, not gemstones: kill metalness, soften gloss,
        // and mute the baked emissive glow (models arrive self-illuminated)
        if (m.transmission !== undefined && m.transmission > 0) { m.transmission = 0; m.transparent = false; m.opacity = 1; }
        if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.12);
        if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.42);
        if (m.emissive) m.emissiveIntensity = Math.min(m.emissiveIntensity ?? 1, 0.18);
        m.envMapIntensity = 0.55;
        m.needsUpdate = true;
      }
    }
  });
}

// Skinned-aware bounds: rigged exports often scale the skeleton relative to
// the bind geometry, so plain setFromObject under- or over-measures. Use the
// bone-aware SkinnedMesh bounding box instead.
function measureBounds(scene) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  scene.traverse((n) => {
    if (n.isSkinnedMesh) {
      n.computeBoundingBox(); // bone-aware, lands on the mesh itself
      tmp.copy(n.boundingBox).applyMatrix4(n.matrixWorld);
      box.union(tmp);
    } else if (n.isMesh) {
      if (!n.geometry.boundingBox) n.geometry.computeBoundingBox();
      tmp.copy(n.geometry.boundingBox).applyMatrix4(n.matrixWorld);
      box.union(tmp);
    }
  });
  return box;
}

// Normalize to target height and ground at y=0: wrap in a group scaled so
// bounding height == targetHeight, then lift so bbox min sits on the floor.
function normalizeToHeight(scene, targetHeight) {
  const box = measureBounds(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const s = targetHeight / Math.max(size.y, 1e-6);
  const wrap = new THREE.Group();
  wrap.add(scene);
  scene.scale.setScalar(s);
  scene.position.set(
    -(box.min.x + size.x / 2) * s,
    -box.min.y * s,
    -(box.min.z + size.z / 2) * s
  );
  return wrap;
}

export async function loadUnitModels(onProgress) {
  const loader = new GLTFLoader();
  const registry = {};
  const failures = [];
  const jobs = [];
  let done = 0, total = 0;

  const tick = (label) => { done++; onProgress && onProgress(done, total, label); };

  for (const [key, man] of Object.entries(MODEL_MANIFEST)) {
    if (man.model) {   // rigless single-file model (RC Raider)
      total++;
      jobs.push((async () => {
        try {
          const gltf = await loader.loadAsync(`${man.dir}/${man.model}`);
          prepareScene(gltf.scene);
          registry[key] = {
            proto: normalizeToHeight(gltf.scene, man.targetHeight),
            clips: {}, rigless: true, height: man.targetHeight,
          };
        } catch (e) {
          console.warn(`[models] ${key}/${man.model} failed, using placeholder`, e);
          failures.push(`${key}/${man.model}`);
        }
        tick(key);
      })());
      continue;
    }
    total += man.clips.length;
    jobs.push((async () => {
      const clips = {};
      let base = null;
      await Promise.all(man.clips.map(async (clipName) => {
        try {
          const gltf = await loader.loadAsync(`${man.dir}/${clipName}.glb`);
          if (gltf.animations && gltf.animations.length) {
            const c = gltf.animations[0];
            c.name = clipName;
            clips[clipName] = c;
          }
          // idle's scene is the display mesh (any file works; prefer idle)
          if (clipName === 'idle' || !base) base = gltf.scene;
        } catch (e) {
          console.warn(`[models] ${key}/${clipName}.glb failed`, e);
          failures.push(`${key}/${clipName}`);
        }
        tick(`${key}/${clipName}`);
      }));
      if (base && clips.idle) {
        prepareScene(base);
        registry[key] = { proto: normalizeToHeight(base, man.targetHeight), clips, rigless: false, height: man.targetHeight };
      } else {
        console.warn(`[models] ${key} incomplete, using placeholder`);
      }
    })());
  }
  await Promise.all(jobs);
  return { registry, failures };
}

// SkeletonUtils.clone equivalent: clone hierarchy and rebind skeletons to
// the cloned bones (geometry + materials stay shared between instances).
export function cloneSkinned(source) {
  const cloneLookup = new Map();
  const clone = source.clone(true);
  (function parallel(a, b) {
    cloneLookup.set(a, b);
    for (let i = 0; i < a.children.length; i++) parallel(a.children[i], b.children[i]);
  })(source, clone);
  clone.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    let srcMesh = null;
    for (const [s, c] of cloneLookup) if (c === node) { srcMesh = s; break; }
    if (!srcMesh) return;
    const skeleton = srcMesh.skeleton;
    node.skeleton = skeleton.clone();
    node.skeleton.bones = skeleton.bones.map((b) => cloneLookup.get(b) || b);
    node.bind(node.skeleton, srcMesh.bindMatrix.clone());
  });
  return clone;
}

// ---------------- shared bits ----------------

const ringGeoCache = new Map();
function ringGeo(r0, r1) {
  const k = `${r0}_${r1}`;
  if (!ringGeoCache.has(k)) ringGeoCache.set(k, new THREE.RingGeometry(r0, r1, 28));
  return ringGeoCache.get(k);
}
function flatRing(r0, r1, color, opacity = 1) {
  const m = new THREE.Mesh(
    ringGeo(r0, r1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

// veteran rank badge: a little star (or two) floating over decorated toys
export function makeRankBadge(tier = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 96; canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.font = '40px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // ⭐ veteran, ⭐⭐ elite, 👑 legend
  ctx.fillText(tier >= 3 ? '👑' : tier >= 2 ? '⭐⭐' : '⭐', 48, 26);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(tier >= 2 ? 0.5 : 0.3, tier >= 2 ? 0.25 : 0.15, 1);
  sprite.position.y = 0.95;
  return sprite;
}

export function makeHealthBar(width = 0.7) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 10;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(width, width * 10 / 64, 1);
  sprite.visible = false;
  let last = -1;
  return {
    sprite,
    set(frac) {
      frac = Math.max(0, Math.min(1, frac));
      if (Math.abs(frac - last) < 0.01) return;
      last = frac;
      ctx.clearRect(0, 0, 64, 10);
      ctx.fillStyle = '#111a';
      ctx.fillRect(0, 0, 64, 10);
      ctx.fillStyle = frac > 0.55 ? '#5ad469' : frac > 0.25 ? '#f5b942' : '#e5484d';
      ctx.fillRect(1, 1, 62 * frac, 8);
      tex.needsUpdate = true;
    },
  };
}

function setInstanceMaterialsForFade(root) {
  root.traverse((n) => {
    if (n.isMesh) {
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      n.material = Array.isArray(n.material)
        ? mats.map((m) => { const c = m.clone(); c.transparent = true; return c; })
        : (() => { const c = n.material.clone(); c.transparent = true; return c; })();
    }
  });
}
function setOpacity(root, o) {
  root.traverse((n) => {
    if (n.isMesh) {
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of mats) m.opacity = o;
    }
  });
}

// ---------------- unit views ----------------
// Swappable renderer: ModelView when the GLB loaded, BoxView otherwise.
// Both expose: group, setMoving, startAttack->impactDelay, startDeath->duration,
// setSelected, update(dt), hpBar.

function addCommonRings(view, def, owner, radius) {
  const team = flatRing(radius * 0.8, radius, TEAM_COLORS[owner], 0.85);
  const sel = flatRing(radius * 1.15, radius * 1.35, 0xffffff, 0.95);
  sel.visible = false;
  view.group.add(team, sel);
  const hpBar = makeHealthBar(0.8);
  hpBar.sprite.position.y = (def.rigless ? 0.55 : 0.75);
  view.group.add(hpBar.sprite);
  view.hpBar = hpBar;
  view.setSelected = (v) => { sel.visible = v; hpBar.sprite.visible = v || view._damaged; };
  view.markDamaged = () => { view._damaged = true; hpBar.sprite.visible = true; };
}

// procedural weapons slotted into a rigged model's hand bone — fixes the
// generated army men whose meshes shipped without a weapon. The weapon is a
// child of the hand bone, so it follows the walk/attack animation.
const HAND_BONE = { bow: 'LeftHand' }; // most weapons ride the right hand
function buildWeapon(type, owner) {
  const g = new THREE.Group();          // built in WORLD units, then scaled to the bone
  const mat = (c, r = 0.5, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const box = (w, h, d, c, r) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, r));
  const cyl = (r0, r1, h, c, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat(c));
  if (type === 'rifle') {
    const barrel = box(0.05, 0.52, 0.05, 0x2b2f36, 0.5); barrel.position.y = 0.2; g.add(barrel);
    const stock = box(0.07, 0.19, 0.06, 0x5a3d22, 0.6); stock.position.y = -0.03; g.add(stock);
    const mag = box(0.05, 0.1, 0.04, 0x2b2f36); mag.position.set(0, 0.02, 0.06); g.add(mag);
  } else if (type === 'bazooka') {
    const tube = cyl(0.07, 0.07, 0.62, 0x3a5a34); tube.position.y = 0.24; g.add(tube);
    const mouth = cyl(0.09, 0.07, 0.06, 0x223a20); mouth.position.y = 0.54; g.add(mouth);
    const grip = box(0.05, 0.12, 0.05, 0x2b2f36); grip.position.set(0, 0.02, 0.07); g.add(grip);
    const sight = box(0.02, 0.06, 0.02, 0x777777); sight.position.set(0, 0.34, 0.08); g.add(sight);
  } else if (type === 'grenade') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mat(0x394d36, 0.6)); body.position.y = 0.04; g.add(body);
    const cap = cyl(0.03, 0.03, 0.04, 0x8a6a3a); cap.position.y = 0.11; g.add(cap);
    const lever = box(0.015, 0.09, 0.03, 0x9aa0a6); lever.position.set(0.05, 0.06, 0); g.add(lever);
  } else if (type === 'bow') {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 8, 14, Math.PI * 1.15), mat(0x6a4a2e, 0.6));
    bow.rotation.z = Math.PI / 2 - Math.PI * 0.075; g.add(bow);
    const string = box(0.008, 0.42, 0.008, 0xf2efe4, 0.4); string.position.z = -0.02; g.add(string);
  }
  return g;
}
function attachHandWeapon(model, def, owner) {
  const boneName = HAND_BONE[def.handWeapon] || 'RightHand';
  let bone = null;
  model.traverse((o) => { if (o.isBone && o.name === boneName) bone = o; });
  if (!bone) return; // rig has no such hand bone — leave the model as-is
  bone.updateWorldMatrix(true, false);
  const bs = new THREE.Vector3();
  bone.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), bs);
  const w = buildWeapon(def.handWeapon, owner);
  w.scale.multiplyScalar(1 / (bs.x || 1)); // world size → bone-local size
  bone.add(w);
}

function makeModelView(entry, def, owner) {
  const group = new THREE.Group();
  const model = entry.rigless ? entry.proto.clone(true) : cloneSkinned(entry.proto);
  group.add(model);

  // unit types that reuse another unit's mesh can override the height
  if (def.targetHeight && entry.height && def.targetHeight !== entry.height) {
    model.scale.setScalar(def.targetHeight / entry.height);
  }
  // fallback-model carts (borrowing another unit's mesh) get a visible cargo
  // crate; the dedicated truck model already hauls its own
  if (def.trade && def.modelKey) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.22), toyMat(0xc9a06a, 0.7));
    crate.position.set(0, 0.42, 0.04);
    crate.castShadow = true;
    group.add(crate);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.24), toyMat(0x8a5a33, 0.7));
    lid.position.set(0, 0.51, 0.04);
    group.add(lid);
  }
  // team-colored cape (Action Hero)
  if (def.cape) {
    const cape = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.42),
      new THREE.MeshStandardMaterial({ color: TEAM_COLORS[owner], roughness: 0.8, side: THREE.DoubleSide })
    );
    cape.position.set(0, 0.42, -0.12);
    cape.rotation.x = 0.35;
    group.add(cape);
    group.userData.cape = cape;
  }

  const view = { group, model, _damaged: false, _dead: false, _ratio: 1 };
  view.setSpeedRatio = (r) => { view._ratio = r; };

  if (entry.rigless) {
    // RC Raider: static vehicle — code animation (wheel spin + bounce)
    const wheels = [];
    model.traverse((n) => { if (/wheel|tire|tyre/i.test(n.name)) wheels.push(n); });
    let moving = false, t = 0, deathT = -1;
    view.setMoving = (v) => { moving = v; };
    view.startAttack = (swingDur) => {
      view._lunge = swingDur;
      return swingDur * def.impact;
    };
    view.startDeath = () => {
      view._dead = true;
      setInstanceMaterialsForFade(model);
      deathT = 0;
      return 2.0;
    };
    view.update = (dt) => {
      t += dt * view._ratio;
      if (view._dead) {
        deathT += dt;
        model.rotation.z = Math.min(deathT * 2.4, Math.PI / 2);
        model.position.y = Math.max(0, 0.1 - deathT * 0.1);
        if (deathT > 1.0) setOpacity(model, Math.max(0, 1 - (deathT - 1.0)));
        return;
      }
      // per-unit idle flavor: drones hover-bob, socks sway constantly
      if (def.hover) model.position.y = 0.05 + Math.sin(t * 4) * 0.05;
      else if (def.sway) model.rotation.z = Math.sin(t * (moving ? 8 : 3)) * (moving ? 0.16 : 0.07);
      if (moving) {
        for (const w of wheels) w.rotation.x += dt * 9 * view._ratio;
        if (def.hop) {                       // pogo bounce
          model.position.y = Math.abs(Math.sin(t * 9)) * 0.22;
        } else if (!def.hover) {
          model.position.y = Math.abs(Math.sin(t * 14)) * 0.03;
          model.rotation.z = def.sway ? model.rotation.z : Math.sin(t * 14) * 0.02;
        }
      } else if (!def.hover) {
        if (def.hop) model.position.y *= 0.85;
        else { model.position.y *= 0.8; if (!def.sway) model.rotation.z *= 0.8; }
      }
      if (view._lunge !== undefined) {
        view._lunge -= dt;
        model.position.z = (view._lunge > 0) ? Math.sin(view._lunge * 10) * 0.12 : 0;
        if (view._lunge <= 0) delete view._lunge;
      }
    };
    return view;
  }

  // Skinned unit: drive clips from unit state.
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [name, clip] of Object.entries(entry.clips)) {
    actions[name] = mixer.clipAction(clip);
  }
  // archer's attack clip may be regenerating — fall back to a sped-up idle
  if (!actions.attack && actions.idle) {
    actions.attack = mixer.clipAction(entry.clips.idle.clone());
  }
  let current = null;
  function play(name, fade = 0.18) {
    const a = actions[name];
    if (!a || current === a) return a;
    a.reset().setLoop(THREE.LoopRepeat).fadeIn(fade).play();
    if (current) current.fadeOut(fade);
    current = a;
    return a;
  }
  play('idle', 0);
  if (def.handWeapon) attachHandWeapon(model, def, owner);

  let moving = false, deathT = -1, deathClipDur = 0;
  view.setMoving = (v) => {
    if (view._dead || v === moving) return;
    moving = v;
    play(v ? 'walk' : 'idle');
  };
  view.startAttack = (swingDur) => {
    if (view._dead) return swingDur * def.impact;
    const a = actions.attack;
    if (!a) return swingDur * def.impact;
    const clipDur = a.getClip().duration;
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = clipDur / swingDur;   // sync swing to attackInterval budget
    a.fadeIn(0.08).play();
    if (current && current !== a) current.fadeOut(0.08);
    current = a;
    // when the swing finishes, return to idle/walk
    const onDone = (e) => {
      if (e.action !== a) return;
      mixer.removeEventListener('finished', onDone);
      if (view._dead) return;
      current = null;
      play(moving ? 'walk' : 'idle', 0.12);
    };
    mixer.addEventListener('finished', onDone);
    return swingDur * def.impact;      // damage applies at the clip's impact moment
  };
  view.startDeath = () => {
    view._dead = true;
    const a = actions.death;
    if (a) {
      a.reset().setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.timeScale = 1;
      a.fadeIn(0.1).play();
      if (current && current !== a) current.fadeOut(0.1);
      current = a;
      deathClipDur = a.getClip().duration;
    } else {
      deathClipDur = 0.5;
    }
    setInstanceMaterialsForFade(model);
    deathT = 0;
    return deathClipDur + 1.0;         // clip plays once, then the mesh fades
  };
  let capeT = Math.random() * 9;
  view.update = (dt) => {
    // walk cycle speed follows the unit's actual velocity — no more ice skating
    if (moving && current === actions.walk && !view._dead) {
      actions.walk.timeScale = 0.55 + 0.65 * view._ratio;
    }
    mixer.update(dt);
    const cape = group.userData.cape;
    if (cape) {
      capeT += dt;
      cape.rotation.x = 0.3 + Math.sin(capeT * 3) * 0.08 + (moving ? 0.35 : 0);
    }
    if (view._dead) {
      deathT += dt;
      const over = deathT - deathClipDur;
      if (over > 0) setOpacity(model, Math.max(0, 1 - over));
    }
  };
  return view;
}

// ---------------- procedural units (no GLB source): flinger / ram / catapult ----------------

function makeProcView(def, owner, kind) {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; rig.add(mesh); return mesh; };
  const box = (w, h, d, c, rough = 0.6) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toyMat(c, rough));
  const cyl = (r0, r1, h, c, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), toyMat(c));

  const parts = {};
  if (kind === 'medic') {
    // plush teddy with a medic cross on its belly
    const fur = 0xd98ca6;
    const sph = (r, c) => new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), toyMat(c, 0.95));
    const body = add(sph(0.17, fur), 0, 0.2, 0);
    body.scale.y = 1.15;
    add(sph(0.12, fur), 0, 0.43, 0);                      // head
    add(sph(0.045, fur), -0.09, 0.53, 0);                 // ears
    add(sph(0.045, fur), 0.09, 0.53, 0);
    add(sph(0.05, fur), -0.16, 0.24, 0);                  // arms
    add(sph(0.05, fur), 0.16, 0.24, 0);
    add(sph(0.06, fur), -0.08, 0.05, 0);                  // feet
    add(sph(0.06, fur), 0.08, 0.05, 0);
    const belly = add(sph(0.1, 0xf6f2e6), 0, 0.21, 0.1);
    belly.scale.z = 0.55;
    add(box(0.08, 0.025, 0.02, 0xe5484d), 0, 0.21, 0.165); // red cross
    add(box(0.025, 0.08, 0.02, 0xe5484d), 0, 0.21, 0.165);
    parts.body = body;
  } else if (kind === 'flinger') {
    // clothespin figure with a rubber band
    add(box(0.1, 0.34, 0.1, 0xd9b38c), -0.05, 0.17, 0);
    add(box(0.1, 0.34, 0.1, 0xd9b38c), 0.05, 0.17, 0);
    add(box(0.22, 0.12, 0.12, 0xc9a06a), 0, 0.38, 0);        // clip head
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), toyMat(def.color));
    add(sphere, 0, 0.5, 0);
    parts.arm = add(box(0.4, 0.045, 0.045, 0xb08050), 0, 0.34, 0.06); // crossbar arms
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 14), toyMat(0x9b5de5, 0.8));
    band.rotation.y = Math.PI / 2;
    parts.band = add(band, 0, 0.34, 0.14);
  } else if (kind === 'ram') {
    // squashed pillow battering ram on craft-stick legs (not an egg!)
    const pillow = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), toyMat(0xe8e0f4, 0.95));
    pillow.scale.set(0.34, 0.17, 0.72);
    add(pillow, 0, 0.33, 0);
    parts.pillow = pillow;
    // stitched corners give it that pillow read
    for (const [sx, sz] of [[-0.26, -0.6], [0.26, -0.6], [-0.26, 0.6], [0.26, 0.6]]) {
      add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), toyMat(0xd8cce8, 0.95)), sx, 0.35, sz);
    }
    add(box(0.62, 0.05, 0.1, TEAM_COLORS[owner]), 0, 0.44, -0.15); // straps
    add(box(0.62, 0.05, 0.1, TEAM_COLORS[owner]), 0, 0.44, 0.2);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), toyMat(0xf6f2e6, 0.9));
    add(nose, 0, 0.3, -0.78); // ramming snout
    for (const [sx, sz] of [[-0.2, -0.4], [0.2, -0.4], [-0.2, 0.4], [0.2, 0.4]]) {
      add(cyl(0.035, 0.035, 0.26, 0xc9a06a, 6), sx, 0.12, sz);
    }
  } else if (kind === 'bear') {
    // Plushies unique: an oversized worn teddy — a wall of stuffing
    const fur = 0x9a6a42, muzzleC = 0xc9a06a;
    const sph = (r, c) => new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), toyMat(c, 0.95));
    const body = add(sph(0.3, fur), 0, 0.34, 0);
    body.scale.y = 1.2;
    add(sph(0.2, fur), 0, 0.75, 0);                        // head
    add(sph(0.08, fur), -0.15, 0.92, 0);                   // ears
    add(sph(0.08, fur), 0.15, 0.92, 0);
    const muzzle = add(sph(0.09, muzzleC), 0, 0.71, 0.15);
    muzzle.scale.z = 0.7;
    add(sph(0.1, fur), -0.28, 0.42, 0);                    // arms
    add(sph(0.1, fur), 0.28, 0.42, 0);
    add(sph(0.11, fur), -0.14, 0.08, 0);                   // feet
    add(sph(0.11, fur), 0.14, 0.08, 0);
    const patch = add(new THREE.Mesh(new THREE.CircleGeometry(0.07, 8), toyMat(0xd9b38c, 0.9)), 0.12, 0.42, 0.26);
    patch.rotation.x = -0.3; // stitched patch: this bear has seen things
    parts.body = body;
  } else if (kind === 'golem') {
    // Snap-Bricks unique: a walking stack of studded bricks
    const brick = (w, h, d, c, x, y, z) => {
      const b = add(box(w, h, d, c, 0.4), x, y, z);
      for (let sx = -1; sx <= 1; sx += 2) {
        const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 8), toyMat(c, 0.4));
        stud.position.set(x + sx * w * 0.22, y + h / 2 + 0.012, z);
        stud.castShadow = true;
        rig.add(stud);
      }
      return b;
    };
    brick(0.34, 0.14, 0.24, 0xf94144, 0, 0.07, 0);         // legs row
    brick(0.4, 0.16, 0.26, 0xf9c74f, 0, 0.23, 0);          // hips
    brick(0.44, 0.18, 0.28, 0x4d9bff, 0, 0.41, 0);         // chest
    brick(0.3, 0.14, 0.22, 0x90be6d, 0, 0.57, 0);          // shoulders
    const head = brick(0.2, 0.16, 0.18, 0xf94144, 0, 0.73, 0);
    const eye = (sx) => { const e = new THREE.Mesh(new THREE.CircleGeometry(0.025, 8), toyMat(0xfff8e0, 0.2)); e.position.set(sx, 0.74, 0.095); rig.add(e); };
    eye(-0.05); eye(0.05);
    add(box(0.12, 0.34, 0.14, 0x577590, 0.4), -0.3, 0.4, 0); // arms
    add(box(0.12, 0.34, 0.14, 0x577590, 0.4), 0.3, 0.4, 0);
    parts.body = head;
  } else if (kind === 'dragster') {
    // RC Racers unique: low wedge dragster, huge rear slicks
    const bodyM = add(box(0.24, 0.09, 0.78, 0xffe14d, 0.35), 0, 0.13, 0.02);
    const nose = add(box(0.16, 0.05, 0.3, 0xffc94d, 0.35), 0, 0.1, -0.5);
    add(box(0.3, 0.03, 0.1, 0xe5484d, 0.4), 0, 0.3, 0.38);   // spoiler
    add(cyl(0.02, 0.02, 0.16, 0xe5484d, 6), 0, 0.24, 0.38);
    const canopy = add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), toyMat(0x223344, 0.2)), 0, 0.2, -0.08);
    canopy.scale.set(1, 0.7, 1.4);
    for (const [sx, sz, r, w] of [[-0.17, 0.28, 0.11, 0.07], [0.17, 0.28, 0.11, 0.07], [-0.14, -0.42, 0.055, 0.045], [0.14, -0.42, 0.055, 0.045]]) {
      const wheel = cyl(r, r, w, 0x222222, 12);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx, r, sz);
      wheel.castShadow = true;
      rig.add(wheel);
      (parts.wheels = parts.wheels || []).push(wheel);
    }
    parts.body = bodyM; void nose;
  } else if (kind === 'bazooka') {
    // Classic unique: green army man with a shoulder bazooka
    const g2 = 0x3f7a3a;
    add(cyl(0.16, 0.2, 0.06, g2, 10), 0, 0.03, 0);           // molded base
    add(box(0.09, 0.2, 0.09, g2, 0.5), -0.05, 0.16, 0);      // legs
    add(box(0.09, 0.2, 0.09, g2, 0.5), 0.06, 0.15, 0.03);
    const torso = add(box(0.18, 0.2, 0.12, g2, 0.5), 0, 0.36, 0);
    torso.rotation.y = 0.3;
    add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), toyMat(g2, 0.5)), 0, 0.53, 0).position.set(0, 0.53, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toyMat(0x2e5a2a, 0.5)), 0, 0.55, 0); // helmet
    const tube = cyl(0.045, 0.05, 0.55, 0x2e5a2a, 10);
    tube.rotation.x = Math.PI / 2 - 0.18;
    tube.position.set(0.11, 0.56, -0.05);
    tube.castShadow = true;
    rig.add(tube);
    const muzzleRing = cyl(0.06, 0.055, 0.05, 0x223a20, 10);
    muzzleRing.rotation.x = Math.PI / 2 - 0.18;
    muzzleRing.position.set(0.11, 0.605, -0.31);
    rig.add(muzzleRing);
    parts.tube = tube;
  } else if (kind === 'grenadier') {
    // army man mid-lob: satchel, helmet, grenade hand raised
    const g2 = 0x4a7a44;
    add(cyl(0.15, 0.19, 0.06, g2, 10), 0, 0.03, 0);
    add(box(0.09, 0.2, 0.09, g2, 0.5), -0.05, 0.16, 0);
    add(box(0.09, 0.2, 0.09, g2, 0.5), 0.06, 0.16, 0.02);
    add(box(0.17, 0.2, 0.12, g2, 0.5), 0, 0.36, 0);
    add(box(0.12, 0.1, 0.06, 0x394d36, 0.6), -0.1, 0.34, -0.09); // satchel
    add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), toyMat(g2, 0.5)), 0, 0.52, 0).position.set(0, 0.52, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toyMat(0x2e5a2a, 0.5)), 0, 0.54, 0);
    const arm = box(0.05, 0.22, 0.05, g2, 0.5);
    arm.rotation.z = -0.7;
    add(arm, 0.14, 0.5, 0);
    const nade = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), toyMat(0x394d36, 0.6));
    add(nade, 0.23, 0.6, 0);
    parts.tube = arm; // reuse the recoil channel for a throw jerk
  } else if (kind === 'lancer') {
    // minifig knight on a pogo spring — bounces as it moves
    const rider = new THREE.Group();
    rig.add(rider);
    const addR = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; rider.add(m); return m; };
    // spring coil
    for (let i = 0; i < 4; i++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 12), toyMat(0x999999, 0.4));
      coil.rotation.x = Math.PI / 2;
      addR(coil, 0, 0.06 + i * 0.05, 0);
    }
    addR(box(0.2, 0.06, 0.3, 0xf94144, 0.4), 0, 0.28, 0); // footboard
    addR(box(0.16, 0.22, 0.12, 0xf9c74f, 0.4), 0, 0.44, 0); // torso
    addR(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), toyMat(0xf9c74f, 0.4)), 0, 0.6, 0);
    const helm = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.12, 8), toyMat(0xf94144, 0.4));
    addR(helm, 0, 0.7, 0);
    const lance = cyl(0.02, 0.02, 0.5, 0xd9b38c, 6);
    lance.rotation.x = Math.PI / 2 - 0.15;
    addR(lance, 0.12, 0.5, -0.2);
    parts.body = rider;
    parts.pogo = rider;
  } else if (kind === 'sock') {
    // floppy sock puppet: tube body, button eyes, yarn hair
    const sockC = 0xd88aa8;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.42, 10), toyMat(sockC, 0.95));
    add(body, 0, 0.21, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), toyMat(sockC, 0.95));
    head.scale.z = 1.25;
    add(head, 0, 0.46, 0.03);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), toyMat(0x222222, 0.3)), -0.05, 0.5, 0.13);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), toyMat(0x222222, 0.3)), 0.05, 0.5, 0.13);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.05, 8), toyMat(0x8a3a52, 0.8));
    mouth.position.set(0, 0.42, 0.145);
    rig.add(mouth);
    for (let i = 0; i < 4; i++) {
      const yarn = cyl(0.012, 0.012, 0.1, 0xe5484d, 4);
      yarn.rotation.z = (i - 1.5) * 0.5;
      yarn.position.set((i - 1.5) * 0.04, 0.6, 0);
      yarn.castShadow = true;
      rig.add(yarn);
    }
    parts.body = body;
  } else if (kind === 'drone') {
    // quad-rotor toy drone (rendered hovering by the game)
    const hub = add(box(0.2, 0.08, 0.2, 0x59c9c9, 0.35), 0, 0.1, 0);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), toyMat(0x223344, 0.2));
    add(eye, 0, 0.08, 0.12);
    parts.rotors = [];
    for (const [sx, sz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) {
      add(cyl(0.02, 0.02, 0.06, 0x333333, 6), sx, 0.16, sz);
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.03), toyMat(0xaef0f0, 0.3));
      rotor.position.set(sx, 0.2, sz);
      rotor.castShadow = true;
      rig.add(rotor);
      parts.rotors.push(rotor);
    }
    parts.body = hub;
  } else if (kind === 'hypno') {
    // spinning top with a hypnotic dome — the whole spinner twirls
    const spinner = new THREE.Group();
    rig.add(spinner);
    const coneDown = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.26, 14), toyMat(0xb14fe0, 0.35));
    coneDown.rotation.x = Math.PI; coneDown.position.y = 0.15;
    const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 14), toyMat(0xf9c74f, 0.35));
    belly.position.y = 0.32;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toyMat(0xe14fd0, 0.35));
    dome.position.y = 0.37;
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.02, 6, 18), toyMat(0xf6f2e6, 0.4));
    stripe.rotation.x = Math.PI / 2; stripe.position.y = 0.37;
    const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 6, 14), toyMat(0xf6f2e6, 0.4));
    swirl.rotation.x = Math.PI / 2; swirl.position.y = 0.46;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), toyMat(0xf6f2e6, 0.4));
    stem.position.y = 0.58;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), toyMat(0xb14fe0, 0.4));
    knob.position.y = 0.66;
    for (const m of [coneDown, belly, dome, stripe, swirl, stem, knob]) { m.castShadow = true; spinner.add(m); }
    parts.spinner = spinner;
  } else if (kind === 'tugboat') {
    // chunky harbour tug: hull, white fender, team cabin, funnel, deck gun (bow +z)
    const hullC = 0xc0392b;
    const hull = add(box(0.44, 0.22, 0.74, hullC, 0.5), 0, 0.13, 0);
    add(box(0.4, 0.04, 0.7, 0xe8ddc0, 0.6), 0, 0.25, 0);        // deck
    const fender = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 18), toyMat(0xf2efe4, 0.6));
    fender.rotation.x = Math.PI / 2; fender.scale.set(0.75, 1, 1.25); fender.position.y = 0.24; fender.castShadow = true; rig.add(fender);
    add(box(0.26, 0.2, 0.24, TEAM_COLORS[owner], 0.5), 0, 0.37, 0.06); // cabin
    add(box(0.2, 0.02, 0.18, 0x223344, 0.3), 0, 0.48, 0.06);          // roof
    add(cyl(0.06, 0.07, 0.22, 0x222222, 10), 0, 0.45, -0.18);          // funnel
    add(cyl(0.075, 0.075, 0.04, 0xf2efe4, 10), 0, 0.56, -0.18);        // funnel band
    const gun = cyl(0.03, 0.035, 0.34, 0x556677, 8);
    gun.rotation.x = Math.PI / 2; gun.position.set(0, 0.3, 0.42); gun.castShadow = true; rig.add(gun);
    parts.tube = gun; parts.body = hull;
  } else if (kind === 'duckboat') {
    // rubber-duck gunboat: duck hull, sail, cork popper (bow/head at +z)
    const yellow = toyMat(0xffd23f, 0.4);
    const hull = add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), yellow), 0, 0.16, 0);
    hull.scale.set(1.05, 0.7, 1.4);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), yellow), 0, 0.34, 0.16); // head forward
    const bill = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 8), toyMat(0xf4802a, 0.4)), 0, 0.33, 0.32);
    bill.rotation.x = Math.PI / 2;
    for (const ex of [-0.06, 0.06]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), toyMat(0x222222, 0.3)); eye.position.set(ex, 0.38, 0.24); rig.add(eye); }
    add(cyl(0.012, 0.012, 0.24, 0xd9b38c, 6), 0, 0.4, -0.1);        // mast
    add(box(0.02, 0.16, 0.14, TEAM_COLORS[owner], 0.5), 0.01, 0.44, -0.06); // sail
    const gun = cyl(0.022, 0.028, 0.24, 0x8a5a34, 8);
    gun.rotation.x = Math.PI / 2; gun.position.set(0, 0.2, 0.34); gun.castShadow = true; rig.add(gun);
    parts.tube = gun; parts.body = hull;
  } else if (kind === 'zapbot') {
    // Tin Bots skirmisher: a wind-up tin robot with a spark blaster
    const tin = 0xb9c4d0, trim = TEAM_COLORS[owner];
    add(box(0.12, 0.09, 0.11, 0x8a95a2), -0.07, 0.06, 0);      // legs
    add(box(0.12, 0.09, 0.11, 0x8a95a2), 0.07, 0.06, 0);
    add(box(0.26, 0.24, 0.2, tin, 0.35), 0, 0.24, 0);          // body
    add(box(0.28, 0.05, 0.22, trim, 0.4), 0, 0.16, 0);         // team belt
    add(box(0.18, 0.14, 0.16, tin, 0.35), 0, 0.44, 0);         // head
    const eyeZ = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x9ff0ff, emissive: 0x40c0e0, emissiveIntensity: 0.9 }));
    eyeZ.position.set(0, 0.45, 0.09); rig.add(eyeZ);
    add(cyl(0.012, 0.012, 0.12, 0x6a7480, 6), 0, 0.58, 0);     // antenna
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffe07a, emissive: 0xffb020, emissiveIntensity: 1.0 }));
    spark.position.set(0, 0.65, 0); rig.add(spark); parts.spinner = spark;
    parts.tube = add(cyl(0.035, 0.05, 0.22, 0x6a7480, 8), 0.17, 0.26, -0.06); // blaster
    parts.tube.rotation.x = Math.PI / 2;
    add(cyl(0.04, 0.04, 0.16, 0x8a95a2, 6), -0.17, 0.26, 0);   // other arm
  } else if (kind === 'titanbot') {
    // Tin Bots champion: a hulking battle robot
    const steel = 0x7a828f, dark = 0x565d68, trim = TEAM_COLORS[owner];
    add(box(0.2, 0.2, 0.18, dark, 0.4), -0.16, 0.11, 0);       // legs
    add(box(0.2, 0.2, 0.18, dark, 0.4), 0.16, 0.11, 0);
    const tbody = add(box(0.5, 0.42, 0.34, steel, 0.35), 0, 0.44, 0);
    add(box(0.54, 0.08, 0.36, trim, 0.4), 0, 0.3, 0);          // team chest band
    for (let i = -1; i <= 1; i++) add(box(0.4, 0.025, 0.36, dark, 0.4), 0, 0.52 + i * 0.06, 0.005); // grille
    add(box(0.26, 0.2, 0.22, steel, 0.35), 0, 0.76, 0);        // head
    const eyeT = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xff9a6a, emissive: 0xe0552a, emissiveIntensity: 1.0 }));
    eyeT.position.set(0, 0.78, 0.12); rig.add(eyeT);
    for (const sx of [-1, 1]) {
      add(box(0.14, 0.4, 0.16, dark, 0.4), sx * 0.34, 0.46, 0);    // upper arm
      add(box(0.2, 0.18, 0.2, steel, 0.35), sx * 0.36, 0.24, 0.02); // fist
    }
    parts.body = tbody;
  } else { // catapult
    add(box(0.16, 0.06, 0.8, 0xc9a86a), -0.2, 0.1, 0);
    add(box(0.16, 0.06, 0.8, 0xc9a86a), 0.2, 0.1, 0);
    add(box(0.5, 0.08, 0.1, 0xb08050), 0, 0.2, 0.12);            // crossbar
    const armPivot = new THREE.Group();
    armPivot.position.set(0, 0.22, 0.12);
    rig.add(armPivot);
    const arm = box(0.07, 0.05, 0.62, 0xd9b38c);
    arm.position.z = -0.26;
    arm.castShadow = true;
    armPivot.add(arm);
    const cup = cyl(0.09, 0.06, 0.06, 0xf3722c, 8);
    cup.position.set(0, 0.05, -0.52);
    armPivot.add(cup);
    armPivot.rotation.x = -0.5;
    parts.armPivot = armPivot;
    for (const [sx, sz] of [[-0.26, -0.28], [0.26, -0.28], [-0.26, 0.28], [0.26, 0.28]]) {
      const w = cyl(0.07, 0.07, 0.05, 0x333333, 10);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx, 0.07, sz);
      w.castShadow = true;
      rig.add(w);
      (parts.wheels = parts.wheels || []).push(w);
    }
  }

  const view = { group, _damaged: false, _dead: false, _ratio: 1 };
  view.setSpeedRatio = (r) => { view._ratio = r; };
  let moving = false, t = Math.random() * 9, deathT = -1, swingT = -1, swingDur = 0;
  view.setMoving = (v) => { moving = v; };
  view.startAttack = (dur) => { swingT = 0; swingDur = dur; return dur * def.impact; };
  view.startDeath = () => {
    view._dead = true;
    rig.traverse((n) => { if (n.isMesh) { n.material = n.material.clone(); n.material.transparent = true; } });
    deathT = 0;
    return 1.8;
  };
  view.update = (dt) => {
    t += dt;
    if (view._dead) {
      deathT += dt;
      rig.rotation.z = Math.min(deathT * 2.2, Math.PI / 2.2);
      if (deathT > 0.8) rig.traverse((n) => { if (n.isMesh) n.material.opacity = Math.max(0, 1 - (deathT - 0.8)); });
      return;
    }
    if (parts.spinner) parts.spinner.rotation.y += dt * (view._channel ? 16 : 4);
    if (parts.rotors) for (const r of parts.rotors) r.rotation.y += dt * 25; // drone blades
    if (moving) {
      if (parts.wheels) for (const w of parts.wheels) w.rotation.x += dt * 7 * view._ratio;
      if (parts.pogo) rig.position.y = Math.abs(Math.sin(t * 9)) * 0.22; // pogo bounce
      else rig.position.y = Math.abs(Math.sin(t * (kind === 'ram' ? 7 : 10))) * (kind === 'catapult' ? 0.015 : 0.04);
      if (kind === 'ram') rig.rotation.z = Math.sin(t * 7) * 0.05;
      if (kind === 'sock') rig.rotation.z = Math.sin(t * 8) * 0.14; // floppy wobble
    } else {
      rig.position.y *= 0.85;
      rig.rotation.z *= 0.85;
      rig.position.y += Math.sin(t * 2.2) * 0.002; // idle breathing
    }
    if (swingT >= 0) {
      swingT += dt;
      const f = Math.min(1, swingT / swingDur);
      if (kind === 'catapult' && parts.armPivot) {
        // fling: fast release, slow reset
        parts.armPivot.rotation.x = f < 0.45 ? -0.5 - (f / 0.45) * 1.7 : -2.2 + ((f - 0.45) / 0.55) * 1.7;
      } else if (kind === 'ram' && parts.pillow) {
        rig.position.z = Math.sin(f * Math.PI) * 0.22;
      } else if (parts.band) {
        parts.band.scale.setScalar(f < 0.5 ? 1 + f : 2 - f);
        parts.band.position.z = 0.14 + (f < 0.5 ? f * 0.2 : (1 - f) * 0.2);
      } else if (parts.tube) {
        // bazooka kick: sharp recoil, slow re-shoulder
        parts.tube.position.z = -0.05 + (f < 0.3 ? (f / 0.3) * 0.12 : (1 - f) / 0.7 * 0.12);
      }
      if (swingT >= swingDur) { swingT = -1; if (parts.armPivot) parts.armPivot.rotation.x = -0.5; rig.position.z = 0; }
    }
  };
  return view;
}

function makeBoxView(def, owner) {
  // placeholder fallback: labelled colored box (brief §17.2 placeholder rule)
  const group = new THREE.Group();
  const h = 0.5;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, h, 0.34),
    new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.6 })
  );
  body.position.y = h / 2;
  body.castShadow = true;
  group.add(body);
  const view = { group, _damaged: false, _dead: false, _ratio: 1 };
  view.setSpeedRatio = (r) => { view._ratio = r; };
  let moving = false, t = 0, deathT = -1;
  view.setMoving = (v) => { moving = v; };
  view.startAttack = (swingDur) => { view._lunge = swingDur; return swingDur * def.impact; };
  view.startDeath = () => {
    view._dead = true;
    body.material = body.material.clone();
    body.material.transparent = true;
    deathT = 0;
    return 1.4;
  };
  view.update = (dt) => {
    t += dt;
    if (view._dead) {
      deathT += dt;
      body.rotation.x = Math.min(deathT * 3, Math.PI / 2);
      body.material.opacity = Math.max(0, 1 - deathT * 0.8);
      return;
    }
    body.position.y = h / 2 + (moving ? Math.abs(Math.sin(t * 10)) * 0.06 : 0);
    if (view._lunge !== undefined) {
      view._lunge -= dt;
      body.position.z = view._lunge > 0 ? Math.sin(view._lunge * 12) * 0.1 : 0;
      if (view._lunge <= 0) delete view._lunge;
    }
  };
  return view;
}

export function createUnitView(registry, key, def, owner) {
  let view;
  const entry = registry[def.modelKey || key];
  if (entry) {
    view = makeModelView(entry, def, owner); // generated model wins when present
  } else if (def.proc) {
    view = makeProcView(def, owner, def.proc);
  } else {
    view = makeBoxView(def, owner);
  }
  addCommonRings(view, def, owner, def.tags.includes('siege') ? 0.42 : 0.32);
  return view;
}

// ---------------- unit upgrade tiers (visual) ----------------
// Army men are single-colour moulded plastic, so an upgrade re-casts the WHOLE
// figure in a new material — burnished steel at tier 1, polished gold at tier 2
// — plus a champion size bump. This transforms the entire model (what Kyle
// wanted) instead of bolting floating gear onto an animating skeleton (which
// detached from the walk cycle and looked broken). Team identity is unaffected:
// that lives on the ground ring, not the body. Idempotent and reversible.
const TIER_STEEL = new THREE.Color(0x9aa4b4);
const TIER_GOLD = new THREE.Color(0xe7b53c);
export function applyUnitTier(view, def, owner, tier) {
  if (!view || !view.group) return;
  tier = tier || 0;
  const model = view.model || view.group;

  // One-time: take ownership of this instance's materials (they're shared across
  // clones) and snapshot the factory look so tier 0 can restore it exactly.
  if (!view._tierInit) {
    view._tierMats = [];
    model.traverse((n) => {
      if (!n.isMesh || !n.material) return;
      const arr = Array.isArray(n.material) ? n.material : [n.material];
      const owned = arr.map((m) => {
        const c = m.clone();
        c.userData.tier0 = {
          color: c.color ? c.color.clone() : null,
          metalness: c.metalness, roughness: c.roughness,
          emissive: c.emissive ? c.emissive.clone() : null,
          emissiveIntensity: c.emissiveIntensity,
        };
        return c;
      });
      n.material = Array.isArray(n.material) ? owned : owned[0];
      owned.forEach((m) => view._tierMats.push(m));
    });
    view._baseScale = view.model ? view.model.scale.x : 1;
    view._tierInit = true;
  }

  if (view._tier === tier) return;
  view._tier = tier;

  for (const m of view._tierMats) {
    const b = m.userData.tier0;
    if (tier <= 0) {
      if (b.color && m.color) m.color.copy(b.color);
      if (b.metalness !== undefined) m.metalness = b.metalness;
      if (b.roughness !== undefined) m.roughness = b.roughness;
      if (b.emissive && m.emissive) m.emissive.copy(b.emissive);
      if (b.emissiveIntensity !== undefined) m.emissiveIntensity = b.emissiveIntensity;
    } else if (tier === 1) {
      if (b.color && m.color) m.color.copy(b.color).lerp(TIER_STEEL, 0.6);
      if (m.metalness !== undefined) m.metalness = 0.62;
      if (m.roughness !== undefined) m.roughness = 0.3;
      if (m.emissive) m.emissive.setHex(0x1c2230);
      if (m.emissiveIntensity !== undefined) m.emissiveIntensity = 0.22;
    } else {
      if (b.color && m.color) m.color.copy(b.color).lerp(TIER_GOLD, 0.72);
      if (m.metalness !== undefined) m.metalness = 0.82;
      if (m.roughness !== undefined) m.roughness = 0.22;
      if (m.emissive) m.emissive.setHex(0x5a3d00);
      if (m.emissiveIntensity !== undefined) m.emissiveIntensity = 0.32;
    }
    m.needsUpdate = true;
  }

  // champions stand a touch taller and broader than the rank and file
  if (view.model) view.model.scale.setScalar(view._baseScale * (tier >= 2 ? 1.1 : 1));
}

// ---------------- building views ----------------

function toyMat(color, rough = 0.55) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough });
}
const PASTELS = [0xf94144, 0xf3722c, 0xf9c74f, 0x90be6d, 0x577590, 0x9b5de5];

function buildingGeometry(key, def, owner, rng, up = false, age = 1) {
  const g = new THREE.Group();
  const s = def.size;
  const teamCol = TEAM_COLORS[owner];
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh; };
  const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toyMat(c));
  const cyl = (r, h, c, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), toyMat(c));

  if (key === 'chest') {
    // the toy box grows richer with the ages: worn wood → painted → golden hoard
    const bodyC = age >= 3 ? 0xe0b020 : 0x8a5a33;
    const lidC = age >= 3 ? 0xc8961a : 0x6f4425;
    add(box(s * 0.85, 1.0, s * 0.6, bodyC), 0, 0.5, 0);
    const lid = add(box(s * 0.9, 0.22, s * 0.64, lidC), 0, 1.15, -s * 0.18);
    lid.rotation.x = -0.9;
    add(box(s * 0.86, 0.1, s * 0.55, age >= 2 ? 0xf9c74f : 0xd9a066), 0, 1.02, 0.05); // toys inside
    if (age >= 2) { // fuller toybox: bright blocks spill over the rim
      for (const [bx, bc] of [[-0.28, 0xf94144], [0.0, 0x4d9bff], [0.3, 0x90be6d]]) {
        add(box(0.22, 0.22, 0.22, bc), bx, 1.12, 0.12).rotation.y = rng();
      }
    }
    if (age >= 3) { // jeweled gold trim + a red gem clasp
      add(box(s * 0.88, 0.08, s * 0.64, 0x8a6a00), 0, 0.98, 0); // gold band
      add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toyMat(0xe5484d, 0.25)), 0, 0.9, s * 0.31); // gem clasp
    }
    const pole = add(cyl(0.05, 1.6, 0xddd6c0, 8), s * 0.38, 1.4, s * 0.26);
    const flag = add(box(0.5, 0.3, 0.04, teamCol), s * 0.38 + 0.28, 2.0, s * 0.26);
    flag.castShadow = false; pole.castShadow = false;
  } else if (key === 'house') {
    add(box(1.5, 0.5, 1.5, PASTELS[rng() * PASTELS.length | 0]), 0, 0.25, 0);
    add(box(1.3, 0.45, 1.3, PASTELS[rng() * PASTELS.length | 0]), 0, 0.72, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.6, 4), toyMat(teamCol));
    roof.rotation.y = Math.PI / 4;
    add(roof, 0, 1.25, 0);
  } else if (key === 'mat') {
    add(box(s * 0.95, 0.12, s * 0.95, 0x4a9b5e), 0, 0.06, 0);
    add(box(0.25, 0.8, 0.25, 0xc9a86a), -0.8, 0.4, -0.8);  // practice post
    add(box(0.25, 0.8, 0.25, 0xc9a86a), 0.8, 0.4, 0.8);
    const banner = add(box(0.6, 0.35, 0.05, teamCol), -0.8, 0.95, -0.8);
    banner.castShadow = false;
  } else if (key === 'bench') {
    add(box(s * 0.9, 0.18, 1.0, 0xb08050), 0, 0.55, -0.5);
    add(box(0.2, 0.55, 0.8, 0xb08050), -1.0, 0.27, -0.5);
    add(box(0.2, 0.55, 0.8, 0xb08050), 1.0, 0.27, -0.5);
    const target = add(cyl(0.5, 0.1, 0xf94144), 0, 0.9, 1.0);
    target.rotation.x = Math.PI / 2;
    add(cyl(0.3, 0.12, 0xffffff), 0, 0.9, 1.0).rotation.x = Math.PI / 2;
    add(cyl(0.12, 0.14, teamCol), 0, 0.9, 1.0).rotation.x = Math.PI / 2;
    add(box(0.15, 0.9, 0.15, 0x8a5a33), 0, 0.45, 1.0);
  } else if (key === 'garage') {
    add(box(s * 0.9, 1.1, s * 0.8, 0x666f7a), 0, 0.55, -0.15);
    add(box(s * 0.7, 0.75, 0.1, 0x2b2f36), 0, 0.38, s * 0.27); // door
    add(box(0.7, 0.2, 0.4, teamCol), 0, 1.25, 0);              // roof beacon
    add(cyl(0.16, 0.4, 0x2b2f36), -s * 0.3, 0.2, s * 0.34).rotation.z = Math.PI / 2; // spare tire
  } else if (key === 'tower') {
    if (up) {
      // Pen Tower: sleek blue-and-silver ballpoint with a metal nib and clip
      const body = add(cyl(0.3, 1.9, 0x2f6fd0, 12), 0, 1.05, 0);
      add(cyl(0.32, 0.5, 0xc0c6cf, 12), 0, 0.35, 0);          // silver grip
      add(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 12), toyMat(0xc0c6cf)), 0, 2.25, 0); // metal cone
      add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 8), toyMat(0x888f99)), 0, 2.55, 0); // nib
      add(box(0.05, 0.7, 0.12, 0xc0c6cf), 0.3, 1.5, 0);       // clip
      add(cyl(0.31, 0.14, 0x1a4fa0, 12), 0, 2.02, 0);         // top ring
      const band = add(box(0.5, 0.2, 0.05, teamCol), 0, 1.5, 0.33); band.castShadow = false;
      body.castShadow = true;
    } else {
      const pencil = add(cyl(0.32, 2.0, 0xf9c74f, 6), 0, 1.0, 0);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 6), toyMat(0xd9a066));
      add(tip, 0, 2.25, 0);
      const lead = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 6), toyMat(0x333333));
      add(lead, 0, 2.48, 0);
      add(cyl(0.34, 0.25, 0xe98aa2), 0, 0.12, 0); // eraser base
      const band = add(box(0.5, 0.2, 0.05, teamCol), 0, 1.6, 0.33);
      band.castShadow = false;
      pencil.castShadow = true;
    }
  } else if (key === 'farm') {
    // snack mat: checkered picnic cloth with crumbs
    const cloth = add(box(1.7, 0.06, 1.7, 0xf0e8d8), 0, 0.03, 0);
    cloth.receiveShadow = true;
    for (let i = 0; i < 4; i++) {
      add(box(0.4, 0.07, 0.4, 0xe07070), -0.45 + (i % 2) * 0.9, 0.035, -0.45 + ((i / 2) | 0) * 0.9);
    }
    for (let i = 0; i < 5; i++) {
      add(cyl(0.1 + rng() * 0.06, 0.06, 0xb5813f), (rng() - 0.5) * 1.2, 0.1, (rng() - 0.5) * 1.2);
    }
    add(box(0.3, 0.2, 0.2, teamCol), 0.65, 0.13, -0.65); // marker flag block
  } else if (key === 'market') {
    // cardboard market stand with striped awning
    add(box(2.0, 0.7, 1.0, 0xc9a06a), 0, 0.35, 0.2);
    add(box(0.08, 1.5, 0.08, 0x8a5a33), -0.95, 0.75, -0.55);
    add(box(0.08, 1.5, 0.08, 0x8a5a33), 0.95, 0.75, -0.55);
    for (let s = 0; s < 5; s++) {
      const seg = add(box(0.44, 0.06, 1.3, s % 2 ? 0xffffff : teamCol), -0.88 + s * 0.44, 1.5, 0);
      seg.rotation.x = -0.25;
    }
    add(cyl(0.14, 0.22, 0xf0d060), -0.5, 0.8, 0.25);  // button jar on counter
    add(box(0.35, 0.25, 0.25, 0x577590), 0.45, 0.83, 0.25); // toy register
  } else if (key === 'workshop') {
    // craft table with tape, scissors and stick pile
    add(box(2.0, 0.14, 1.4, 0xb08050), 0, 0.62, 0);
    for (const [sx, sz] of [[-0.85, -0.55], [0.85, -0.55], [-0.85, 0.55], [0.85, 0.55]]) {
      add(box(0.12, 0.6, 0.12, 0x8a5a33), sx, 0.3, sz);
    }
    const tape = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.07, 8, 16), toyMat(0xd0d0d8));
    tape.rotation.x = Math.PI / 2;
    add(tape, -0.5, 0.76, 0.1);
    add(box(0.5, 0.05, 0.08, 0xf94144), 0.35, 0.72, 0.2).rotation.y = 0.5;  // scissor blades
    add(box(0.5, 0.05, 0.08, 0xf94144), 0.35, 0.72, 0.2).rotation.y = -0.5;
    for (let i = 0; i < 4; i++) add(box(0.9, 0.05, 0.08, 0xd9b38c), -0.1 + rng() * 0.3, 0.72 + i * 0.05, -0.35).rotation.y = rng() * 0.4;
    add(box(0.5, 0.3, 0.05, teamCol), 0, 1.1, -0.68); // banner
  } else if (key === 'tinker') {
    // upgrade workbench: benchtop on legs, a red vise, gears, tools, batteries
    add(box(1.7, 0.16, 1.1, 0xb08050), 0, 0.6, 0);
    for (const [sx, sz] of [[-0.7, -0.45], [0.7, -0.45], [-0.7, 0.45], [0.7, 0.45]]) add(box(0.12, 0.58, 0.12, 0x8a5a33), sx, 0.29, sz);
    add(box(0.28, 0.2, 0.32, 0xc23a3a), 0.55, 0.78, 0.2);           // red vise body
    const screw = add(cyl(0.03, 0.32, 0x999999, 8), 0.55, 0.78, 0.42); screw.rotation.x = Math.PI / 2;
    // a couple of gears
    for (const [gr, gc, gx, gz] of [[0.2, 0x8a8f98, -0.45, -0.15], [0.14, 0xd9a066, -0.22, 0.12]]) {
      add(cyl(gr, 0.08, gc, 12), gx, 0.72, gz);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; add(box(0.05, 0.08, 0.05, gc), gx + Math.cos(a) * gr, 0.72, gz + Math.sin(a) * gr); }
    }
    add(box(0.5, 0.05, 0.1, 0xf0c419), -0.05, 0.7, 0.38).rotation.y = 0.5;  // wrench
    add(box(0.34, 0.05, 0.05, 0xe5484d), 0.12, 0.7, -0.32).rotation.y = -0.4; // screwdriver
    add(cyl(0.08, 0.22, 0x4d9bff, 10), 0.32, 0.81, 0.38);          // battery
    add(cyl(0.05, 0.05, 0xd0d0d0, 10), 0.32, 0.94, 0.38);          // battery nub
    const flagT = add(box(0.46, 0.28, 0.04, teamCol), -0.1, 1.12, -0.55);
    add(cyl(0.03, 1.0, 0xddd6c0, 6), -0.34, 0.88, -0.55);
    flagT.castShadow = false;
  } else if (key === 'wall') {
    // staggered toy bricks — steel plating with Steelworks, taller each age
    const cols = up ? [0x9aa3ad, 0x868e98, 0xb2bac2] : [0xd95b5b, 0xd96a5b, 0xc95555];
    const layers = 2 + age; // ramparts rise from 3 → 4 → 5 courses
    for (let layer = 0; layer < layers; layer++) {
      const off = (layer % 2) * 0.22 - 0.11;
      for (let k = -1; k <= 1; k++) {
        const b = add(box(0.42, 0.26, 0.34, cols[(layer + k + 3) % 3]), k * 0.3 + off, 0.14 + layer * 0.27, 0);
        b.rotation.y = (rng() - 0.5) * 0.06;
      }
    }
    if (age >= 3) { // battlement crenellations along the top
      const topY = 0.14 + layers * 0.27;
      for (const bx of [-0.36, 0, 0.36]) add(box(0.24, 0.22, 0.34, cols[0]), bx, topY, 0);
    }
  } else if (key === 'gate') {
    // single-tile doorway: two slim posts flanking a lifting bar (opening runs in Z)
    const postC = up ? 0x9aa3ad : 0xc95555, barC = up ? 0x868e98 : 0xd9a066;
    add(box(0.18, 1.0, 0.5, postC), -0.45, 0.5, 0);   // posts
    add(box(0.18, 1.0, 0.5, postC), 0.45, 0.5, 0);
    add(box(0.24, 0.14, 0.56, teamCol), -0.45, 1.06, 0); // team caps
    add(box(0.24, 0.14, 0.56, teamCol), 0.45, 1.06, 0);
    const bar = add(box(0.72, 0.5, 0.18, barC), 0, 0.45, 0); // the lifting bar
    g.userData.gateBar = bar;
  } else if (key === 'wonder') {
    // pillow mountain with a draped blanket and a golden star
    for (const [sx, sz, s] of [[-1.1, -0.9, 0.9], [1.1, -0.8, 0.85], [-0.9, 1.0, 0.8], [1.0, 1.0, 0.9]]) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), toyMat(0xf0e4f4, 0.95));
      p.scale.set(s, s * 0.7, s);
      add(p, sx, s * 0.55, sz);
    }
    const mid = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), toyMat(0xe8ddf2, 0.95));
    mid.scale.set(1.3, 1.05, 1.3);
    add(mid, 0, 1.1, 0);
    const blanket = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.5, 6), toyMat(teamCol, 0.85));
    add(blanket, 0, 2.2, 0);
    add(cyl(0.05, 1.4, 0xddd6c0, 6), 0, 3.2, 0);
    // golden star finial
    const starMat = new THREE.MeshStandardMaterial({ color: 0xffd94a, roughness: 0.3, metalness: 0.5, emissive: 0x8a6a00, emissiveIntensity: 0.4 });
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 4), starMat);
      spike.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.14, 3.85, Math.sin((i / 5) * Math.PI * 2) * 0.14);
      spike.rotation.z = Math.PI / 2 + (i / 5) * Math.PI * 2;
      spike.rotation.y = -(i / 5) * Math.PI * 2;
      g.add(spike);
    }
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.07, 10), starMat);
    core.rotation.x = Math.PI / 2;
    add(core, 0, 3.85, 0);
  } else if (key === 'fort') {
    // blanket fort: pillow bastions + draped blanket + banner pole
    for (const [sx, sz] of [[-1.3, -1.2], [1.3, -1.2], [-1.3, 1.2], [1.3, 1.2]]) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), toyMat(0xe8e0f0, 0.95));
      p.scale.set(0.62, 0.5, 0.62);
      add(p, sx, 0.45, sz);
    }
    add(box(2.6, 1.0, 2.4, 0xd8c8b8), 0, 0.5, 0);       // cushion keep
    const blanket = add(box(3.0, 0.16, 2.8, teamCol), 0, 1.15, 0);
    blanket.rotation.z = 0.06;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.9, 4), toyMat(0xf0e8e0, 0.9));
    roof.rotation.y = Math.PI / 4;
    add(roof, 0, 1.7, 0);
    add(cyl(0.04, 1.0, 0xddd6c0, 6), 0, 2.5, 0);
    const flag = add(box(0.5, 0.3, 0.04, teamCol), 0.27, 2.8, 0);
    flag.castShadow = false;
  } else if (key === 'basket') {
    // woven storage basket with a rolled rim and goods peeking out
    const weave = toyMat(0xc9a06a, 0.9);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.62, 0.75, 12), weave);
    add(body, 0, 0.38, 0);
    for (let i = 0; i < 3; i++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.64 + i * 0.06, 0.035, 6, 16), toyMat(0xb08050, 0.85));
      band.rotation.x = Math.PI / 2;
      add(band, 0, 0.18 + i * 0.26, 0);
    }
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.07, 8, 18), toyMat(0x8a5a33, 0.8));
    rim.rotation.x = Math.PI / 2;
    add(rim, 0, 0.78, 0);
    add(box(0.3, 0.2, 0.3, PASTELS[rng() * PASTELS.length | 0]), -0.2, 0.85, 0.1);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), toyMat(0xf9c74f, 0.5)), 0.25, 0.86, -0.1);
    const flagB = add(box(0.34, 0.2, 0.03, teamCol), 0.7, 1.05, 0);
    add(cyl(0.03, 0.7, 0xddd6c0, 6), 0.7, 0.8, 0);
    flagB.castShadow = false;
  } else if (key === 'dock') {
    // wooden jetty: planked deck on pilings, a crane, and a team lifebuoy
    add(box(2.6, 0.16, 2.2, 0x9a6a3c), 0, 0.35, 0);
    for (let p = -1; p <= 1; p++) add(box(2.6, 0.02, 0.06, 0x7a4e28), 0, 0.44, p * 0.6);
    for (const [px, pz] of [[-1.1, -0.9], [1.1, -0.9], [-1.1, 0.9], [1.1, 0.9]]) add(cyl(0.12, 0.7, 0x6f4425, 8), px, 0.25, pz);
    add(cyl(0.09, 1.2, 0x556677, 8), -0.7, 1.0, -0.4);        // crane mast
    const arm = box(0.9, 0.08, 0.1, 0x556677); arm.position.set(-0.3, 1.5, -0.4); arm.castShadow = true; g.add(arm);
    add(cyl(0.015, 0.4, 0x333333, 6), 0.1, 1.3, -0.4);         // hook line
    const buoy = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.08, 8, 16), toyMat(teamCol, 0.5));
    buoy.rotation.x = Math.PI / 2; add(buoy, 0.95, 0.7, 0.7);
    const flagD = add(box(0.34, 0.2, 0.03, teamCol), -1.0, 1.15, 0.9);
    add(cyl(0.03, 0.9, 0xddd6c0, 6), -1.16, 0.9, 0.9);
    flagD.castShadow = false;
  } else if (key === 'tent') {
    // canvas command tent with an open flap and a radio antenna
    const canvas = toyMat(0x5d7a4a, 0.95);
    const tentBody = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.3, 4), canvas);
    tentBody.rotation.y = Math.PI / 4;
    add(tentBody, 0, 0.65, 0);
    const flap = add(box(0.5, 0.7, 0.06, 0x4a6139), 0, 0.35, 1.02);
    flap.rotation.x = 0.35;
    add(box(2.4, 0.12, 2.2, 0x8a915a), 0, 0.06, 0);       // groundsheet
    add(cyl(0.03, 1.4, 0x888888, 6), 0.9, 1.2, -0.7);     // antenna
    add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), toyMat(0xe5484d, 0.4)), 0.9, 1.95, -0.7);
    const flagT = add(box(0.5, 0.3, 0.04, teamCol), 0.28, 1.75, 0);
    add(cyl(0.04, 1.2, 0xddd6c0, 6), 0, 1.35, 0);
    flagT.castShadow = false;
  } else if (key === 'brickshop') {
    // stacked-brick foundry with a chimney puffing molded studs
    const cols = [0xf94144, 0xf9c74f, 0x4d9bff, 0x90be6d];
    for (let i = 0; i < 4; i++) {
      add(box(2.2 - i * 0.25, 0.42, 1.9 - i * 0.2, cols[i % 4]), 0, 0.22 + i * 0.42, 0);
    }
    for (let sx = -1; sx <= 1; sx += 2) {
      const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 10), toyMat(cols[0], 0.4));
      add(stud, sx * 0.5, 1.95, 0);
    }
    add(cyl(0.18, 1.0, 0x577590, 8), 0.8, 1.9, -0.55);    // chimney
    const flagBS = add(box(0.5, 0.3, 0.04, teamCol), 0.28, 2.5, 0.4);
    add(cyl(0.04, 1.1, 0xddd6c0, 6), 0, 2.1, 0.4);
    flagBS.castShadow = false;
  } else if (key === 'nest') {
    // ring of cushions around a soft bed — the plush nursery
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), toyMat(i % 2 ? 0xe8e0f4 : 0xd88aa8, 0.95));
      p.scale.y = 0.6;
      add(p, Math.cos(a) * 1.1, 0.32, Math.sin(a) * 1.1);
    }
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.35, 14), toyMat(0xf2e2ea, 0.95));
    add(bed, 0, 0.3, 0);
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), toyMat(0xe5484d, 0.6));
    heart.scale.set(1, 0.8, 0.7);
    add(heart, 0, 0.62, 0);
    const flagN = add(box(0.5, 0.3, 0.04, teamCol), 0.28, 1.7, 0);
    add(cyl(0.04, 1.2, 0xddd6c0, 6), 0, 1.3, 0);
    flagN.castShadow = false;
  } else if (key === 'pitstop') {
    // open pit garage: canopy on posts, tool wall, stacked tires
    add(box(2.4, 0.1, 2.2, 0x666f7a), 0, 0.05, 0);        // pit floor
    for (const [sx, sz] of [[-1.05, -0.95], [1.05, -0.95], [-1.05, 0.95], [1.05, 0.95]]) {
      add(cyl(0.06, 1.1, 0xd8d2c0, 6), sx, 0.55, sz);
    }
    const canopy = add(box(2.6, 0.1, 2.4, 0xe5484d), 0, 1.15, 0);
    canopy.rotation.z = 0.04;
    add(box(0.14, 0.5, 1.8, 0x8a5a33), -1.1, 0.35, 0);    // tool wall
    for (let i = 0; i < 3; i++) {
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.1, 8, 14), toyMat(0x222222, 0.8));
      tire.rotation.x = Math.PI / 2;
      add(tire, 0.85, 0.12 + i * 0.2, 0.75);
    }
    const flagP = add(box(0.5, 0.3, 0.04, teamCol), 0.28, 1.85, -0.6);
    add(cyl(0.04, 1.3, 0xddd6c0, 6), 0, 1.45, -0.6);
    flagP.castShadow = false;
  } else if (key === 'robolab') {
    // robotics bay: steel bench, a rack of charging batteries, a robot arm
    add(box(2.6, 0.3, 2.4, 0x565d68), 0, 0.15, 0);            // steel base plate
    add(box(2.4, 0.5, 0.5, 0x7a828f), 0, 0.55, -0.8);         // workbench
    for (let i = 0; i < 4; i++) {                             // battery charging rack
      add(cyl(0.16, 0.7, i % 2 ? 0x40c0e0 : 0xffc94d, 10), -0.9 + i * 0.4, 0.9, -0.9);
      add(box(0.1, 0.08, 0.1, 0xb8c0cc), -0.9 + i * 0.4, 1.29, -0.9); // terminal cap
    }
    add(cyl(0.22, 0.4, 0x8a95a2, 10), 0.7, 0.45, 0.5);        // robot-arm base
    const seg = add(box(0.16, 0.9, 0.16, 0xb9c4d0), 0.7, 0.95, 0.5);
    seg.rotation.z = -0.4;                                     // angled arm segment
    add(box(0.28, 0.14, 0.14, 0x565d68), 0.42, 1.35, 0.5);   // claw head
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x9ff0ff, emissive: 0x40c0e0, emissiveIntensity: 1.0 }));
    add(bulb, -1.0, 0.5, 0.7);                                // glowing status light
    add(box(0.14, 0.7, 1.6, 0x6a7480), 1.2, 0.55, -0.4);     // tool wall
    const flagR = add(box(0.5, 0.3, 0.04, teamCol), 0.28, 1.95, -0.4);
    add(cyl(0.04, 1.4, 0xddd6c0, 6), 0, 1.55, -0.4);
    flagR.castShadow = false;
  }
  return g;
}

// generated building models drop into assets/buildings/<key>.glb and are
// picked up automatically; the procedural toy meshes remain the fallback.
export const buildingRegistry = {};

export async function loadBuildingModels(keys, onProgress) {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(keys.map(async (key) => {
    try {
      const gltf = await loader.loadAsync(`assets/buildings/${key}.glb`);
      prepareScene(gltf.scene);
      const size = BUILDING_FOOTPRINT[key] || 2;
      // normalize to the building footprint and ground at y=0
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const dim = new THREE.Vector3();
      box.getSize(dim);
      const s = (size * 0.92) / Math.max(dim.x, dim.z, 1e-6);
      const wrap = new THREE.Group();
      wrap.add(gltf.scene);
      gltf.scene.scale.setScalar(s);
      gltf.scene.position.set(
        -(box.min.x + dim.x / 2) * s,
        -box.min.y * s,
        -(box.min.z + dim.z / 2) * s
      );
      buildingRegistry[key] = wrap;
    } catch {
      /* not generated yet — procedural fallback stays */
    }
    done++;
    onProgress && onProgress(done, keys.length, key);
  }));
  return buildingRegistry;
}
let BUILDING_FOOTPRINT = {};
export function setBuildingFootprints(map) { BUILDING_FOOTPRINT = map; }

// map furniture (resource piles, obstacles): generated models drop into
// assets/map/<key>.glb and are picked up automatically; procedural fallback.
export const mapRegistry = {};
const MAP_MODEL_KEYS = ['snacks', 'blocks', 'buttons', 'marbles', 'book', 'pillow'];

export async function loadMapModels(onProgress) {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(MAP_MODEL_KEYS.map(async (key) => {
    try {
      const gltf = await loader.loadAsync(`assets/map/${key}.glb`);
      prepareScene(gltf.scene);
      // normalize to a unit footprint (max horizontal extent = 1), grounded
      const box = measureBounds(gltf.scene);
      const dim = new THREE.Vector3();
      box.getSize(dim);
      const s = 1 / Math.max(dim.x, dim.z, 1e-6);
      const wrap = new THREE.Group();
      wrap.add(gltf.scene);
      gltf.scene.scale.setScalar(s);
      gltf.scene.position.set(
        -(box.min.x + dim.x / 2) * s,
        -box.min.y * s,
        -(box.min.z + dim.z / 2) * s
      );
      mapRegistry[key] = wrap;
    } catch { /* not generated yet */ }
    done++;
    onProgress && onProgress(done, MAP_MODEL_KEYS.length, key);
  }));
  return mapRegistry;
}

// bedroom furniture: generated models drop into assets/furniture/<key>.glb and
// replace the procedural boxes in addBedroom; procedural stays as the fallback.
export const furnitureRegistry = {};
const FURNITURE_KEYS = ['bed', 'dresser', 'bookshelf', 'toychest'];
export async function loadFurnitureModels(onProgress) {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(FURNITURE_KEYS.map(async (key) => {
    try {
      const gltf = await loader.loadAsync(`assets/furniture/${key}.glb`);
      prepareScene(gltf.scene);
      // normalize so the largest horizontal extent = 1, grounded at y=0
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const dim = new THREE.Vector3(); box.getSize(dim);
      const s = 1 / Math.max(dim.x, dim.z, 1e-6);
      const wrap = new THREE.Group();
      wrap.add(gltf.scene);
      gltf.scene.scale.setScalar(s);
      gltf.scene.position.set(-(box.min.x + dim.x / 2) * s, -box.min.y * s, -(box.min.z + dim.z / 2) * s);
      furnitureRegistry[key] = wrap;
    } catch { /* not generated yet — procedural fallback */ }
    done++;
    onProgress && onProgress(done, FURNITURE_KEYS.length, key);
  }));
  return furnitureRegistry;
}

// ---------------- UI portraits: real renders of the generated models ----------------
// Filled once at load by renderPortraits(); ui.js falls back to emoji when absent.
export const PORTRAITS = {};

export function renderPortraits(unitRegistry) {
  const SIZE = 96;
  let r;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch { return PORTRAITS; }
  r.setSize(SIZE, SIZE);
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 60);
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const keyL = new THREE.DirectionalLight(0xfff2dd, 2.1);
  keyL.position.set(1.6, 2.4, 2.2);
  const rimL = new THREE.DirectionalLight(0x9db8ff, 1.0);
  rimL.position.set(-2, 1.4, -1.6);
  scene.add(keyL, rimL);

  const snap = (model) => {
    scene.add(model);
    const box = measureBounds(model);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const radius = Math.max(s.x, s.y, s.z) * 0.5;
    const d = (radius / Math.tan((cam.fov * Math.PI / 180) / 2)) * 1.22;
    cam.position.set(c.x + d * 0.62, c.y + d * 0.42, c.z + d * 0.68);
    cam.lookAt(c);
    r.render(scene, cam);
    scene.remove(model);
    return r.domElement.toDataURL('image/png');
  };
  for (const [k, e] of Object.entries(unitRegistry || {})) {
    try { PORTRAITS[k] = snap(e.proto); } catch { /* keep emoji */ }
  }
  for (const [k, m] of Object.entries(buildingRegistry)) {
    try { PORTRAITS[k] = snap(m); } catch { /* keep emoji */ }
  }
  r.dispose();
  return PORTRAITS;
}

export function createBuildingView(key, def, owner, rngSeed = 1, up = false, age = 1) {
  let seed = rngSeed;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const group = new THREE.Group();
  let meshes;
  // upgraded towers become a Pen Tower — generated model if present, else the
  // procedural pen (never the plain pencil GLB, so the upgrade always reads)
  const wantPen = up && key === 'tower';
  const modelKey = (wantPen && buildingRegistry.pentower) ? 'pentower' : key;
  const useGlb = wantPen ? !!buildingRegistry.pentower : !!buildingRegistry[modelKey];
  if (useGlb) {
    meshes = buildingRegistry[modelKey].clone(true);
    // team banner so ownership stays readable on generated models
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), toyMat(0xddd6c0));
    pole.position.set(def.size * 0.4, def.height + 0.4, def.size * 0.4);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.04), toyMat(TEAM_COLORS[owner]));
    flag.position.set(def.size * 0.4 + 0.22, def.height + 0.9, def.size * 0.4);
    meshes.add(pole, flag);
  } else {
    meshes = buildingGeometry(key, def, owner, rng, up, age);
  }
  group.add(meshes);
  const s = def.size;

  // age flourishes: buildings dress up as the toybox climbs the ages
  // (walls/gates get their own per-age treatment in buildingGeometry)
  if (key !== 'wall' && key !== 'gate') {
    if (age >= 2) {
      // festive pennant bunting strung across the front
      const buntCols = [0xf94144, 0xf9c74f, 0x4d9bff, 0x90be6d];
      const by = def.height + 0.24, bz = s * 0.42, span = s * 0.82;
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, span, 5), toyMat(0x8a5a33));
      cord.rotation.z = Math.PI / 2; cord.position.set(0, by, bz); group.add(cord);
      const n = Math.max(3, Math.round(s * 2));
      for (let i = 0; i < n; i++) {
        const tri = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 3), toyMat(buntCols[i % 4]));
        tri.rotation.x = Math.PI; tri.position.set(-span / 2 + (i + 0.5) * (span / n), by - 0.1, bz);
        group.add(tri);
      }
    }
    if (age >= 3) {
      // a gold star finial and base trim — the Fort Age of plenty
      const gold = new THREE.MeshStandardMaterial({ color: 0xffd94a, roughness: 0.3, metalness: 0.6, emissive: 0x6a5200, emissiveIntensity: 0.3 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), gold);
      pole.position.set(0, def.height + 0.55, 0); group.add(pole);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), gold);
      star.position.set(0, def.height + 0.9, 0); star.scale.y = 1.5; group.add(star);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(s * 0.5, 0.045, 6, 22), gold);
      trim.rotation.x = Math.PI / 2; trim.position.y = 0.07; group.add(trim);
    }
  }

  const hpBar = makeHealthBar(Math.min(1.6, s * 0.5));
  hpBar.sprite.position.y = def.height + 0.4;
  group.add(hpBar.sprite);

  const sel = flatRing(s * 0.62, s * 0.68, 0xffffff, 0.9);
  sel.visible = false;
  group.add(sel);

  const gateBar = meshes.userData && meshes.userData.gateBar;
  const view = {
    group, hpBar, _damaged: false, _open: false,
    setSelected(v) { sel.visible = v; hpBar.sprite.visible = v || view._damaged; },
    markDamaged() { view._damaged = true; hpBar.sprite.visible = true; },
    setOpen(v) { view._open = v; },
    setProgress(f) {
      // foundation grows out of the floor while workers build it
      f = Math.max(0.02, Math.min(1, f));
      meshes.scale.y = f;
      meshes.traverse((n) => {
        if (n.isMesh && n.material) {
          n.material.transparent = f < 1;
          n.material.opacity = f < 1 ? 0.45 + 0.55 * f : 1;
        }
      });
    },
    update(dt) {
      if (gateBar) {
        const target = view._open ? 1.5 : 0.45;
        gateBar.position.y += (target - gateBar.position.y) * Math.min(1, dt * 6);
      }
    },
  };
  return view;
}

export function createGhostMesh(def) {
  const s = def.size;
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(s * 0.95, def.height * 0.6, s * 0.95),
    new THREE.MeshBasicMaterial({ color: 0x22cc66, transparent: true, opacity: 0.35, depthWrite: false })
  );
  m.position.y = def.height * 0.3;
  const g = new THREE.Group();
  g.add(m);
  g.setValid = (v) => m.material.color.setHex(v ? 0x22cc66 : 0xdd3344);
  return g;
}

// ---------------- resource node views ----------------

// passive things (resources, critters) still get selected and inspected —
// they need the same setSelected contract as units or selection crashes
function passiveView(group, radius = 0.6) {
  const ring = flatRing(radius, radius * 1.18, 0xffffff, 0.9);
  ring.visible = false;
  group.add(ring);
  return {
    group,
    setSelected(v) { ring.visible = v; },
    markDamaged() {},
    hpBar: { set() {}, sprite: null },
    update() {},
  };
}

export function createResourceView(resType, rngSeed = 1) {
  let seed = rngSeed * 7919 + 13;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // generated pile model wins when present (random spin so clusters vary)
  if (mapRegistry[resType]) {
    const g2 = new THREE.Group();
    const m = mapRegistry[resType].clone(true);
    m.scale.setScalar(1.15);
    m.rotation.y = rng() * Math.PI * 2;
    g2.add(m);
    return passiveView(g2);
  }
  const g = new THREE.Group();
  const add = (mesh) => { mesh.castShadow = true; g.add(mesh); return mesh; };

  if (resType === 'blocks') {
    for (let i = 0; i < 6; i++) {
      const b = add(new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.24, 0.34),
        toyMat(PASTELS[rng() * PASTELS.length | 0])
      ));
      b.position.set((rng() - 0.5) * 0.9, 0.12 + (i > 3 ? 0.24 : 0), (rng() - 0.5) * 0.9);
      b.rotation.y = rng() * Math.PI;
    }
  } else if (resType === 'snacks') {
    for (let i = 0; i < 5; i++) {
      const c = add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.22 + rng() * 0.1, 0.24 + rng() * 0.1, 0.1, 12),
        toyMat(0xb5813f, 0.9)
      ));
      c.position.set((rng() - 0.5) * 0.8, 0.05 + (i > 2 ? 0.11 : 0), (rng() - 0.5) * 0.8);
      c.rotation.y = rng() * Math.PI;
    }
  } else { // buttons
    const jar = add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.44, 0.6, 14),
      new THREE.MeshStandardMaterial({ color: 0xbcd6e8, roughness: 0.2, transparent: true, opacity: 0.5 })
    ));
    jar.position.y = 0.3;
    for (let i = 0; i < 4; i++) {
      const b = add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.05, 10),
        new THREE.MeshStandardMaterial({ color: 0xe8c352, roughness: 0.3, metalness: 0.6 })
      ));
      b.position.set((rng() - 0.5) * 0.5, 0.06 + i * 0.07, (rng() - 0.5) * 0.5);
      b.rotation.set(rng(), rng(), rng());
    }
  }
  return passiveView(g);
}

// ---------------- ground / decor ----------------

export function createGround(N, style = 'playmat') {
  const g = new THREE.Group();

  // bedroom floor (wood planks, extends past the playmat)
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = floorCanvas.height = 512;
  const fc = floorCanvas.getContext('2d');
  fc.fillStyle = '#7a5230'; fc.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 64) {
    fc.fillStyle = `rgba(0,0,0,${0.04 + (y / 64 % 2) * 0.05})`;
    fc.fillRect(0, y, 512, 64);
    fc.strokeStyle = '#00000033'; fc.lineWidth = 3;
    fc.beginPath(); fc.moveTo(0, y); fc.lineTo(512, y); fc.stroke();
    // plank seams
    for (let k = 0; k < 3; k++) {
      const px = ((y * 7 + k * 173) % 512);
      fc.beginPath(); fc.moveTo(px, y); fc.lineTo(px, y + 64); fc.stroke();
    }
  }
  const floorTex = new THREE.CanvasTexture(floorCanvas);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(14, 14);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 });
  // big floor: its edge always sits far past the fog, so it dissolves into the
  // background instead of ending in a hard visible line
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(N * 7, N * 7), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  floor.receiveShadow = true;
  g.add(floor);
  // generated floorboard art replaces the canvas planks when present
  // (mirrored 2x2 repeat hides the fact that AI art doesn't tile)
  const floorKey = style === 'playmat' ? 'wood' : style;
  new THREE.TextureLoader().load(
    `assets/map/floor-${floorKey}.png`,
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
      t.repeat.set(6, 6);
      floorMat.map = t;
      floorMat.needsUpdate = true;
    },
    undefined,
    () => {}
  );

  // room walls with baseboards frame the max zoom-out (skip under the bed —
  // there is no wall down there, just darkness)
  if (style !== 'underbed') {
    const WALL = N / 2 + 30, WH = 88, WT = 1.6;  // tall enough the camera never rises over them
    const wallColor = style === 'attic' ? 0x6a5a48 : 0x5a688f;
    const wallM = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.95 });
    const baseM = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.8 });
    for (let i = 0; i < 4; i++) {
      const horiz = i < 2;
      const sign = i % 2 === 0 ? -1 : 1;
      // all four walls are tall; the camera is clamped (see clampCam) so it never
      // slides south of the south wall, which would otherwise reveal floor behind it
      const wall = new THREE.Mesh(new THREE.BoxGeometry(horiz ? WALL * 2 + WT * 2 : WT, WH, horiz ? WT : WALL * 2 + WT * 2), wallM);
      wall.position.set(horiz ? 0 : sign * WALL, WH / 2 - 0.02, horiz ? sign * WALL : 0);
      wall.receiveShadow = true;
      g.add(wall);
      const base = new THREE.Mesh(new THREE.BoxGeometry(horiz ? WALL * 2 + WT * 2 : WT + 0.5, 1.7, horiz ? WT + 0.5 : WALL * 2 + WT * 2), baseM);
      base.position.set(wall.position.x, 0.83, wall.position.z);
      g.add(base);
    }
  }

  // spilled toys scattered on the floor outside the mat (visual only —
  // generated map models get reused as oversized room clutter)
  const scatterKinds = Object.keys(mapRegistry);
  if (scatterKinds.length) {
    let ss = 987 + N;
    const rnd = () => (ss = (ss * 16807) % 2147483647) / 2147483647;
    let placed = 0;
    for (let i = 0; i < 120 && placed < 22; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = N / 2 + 5 + rnd() * 24;
      const px = Math.cos(ang) * rad, pz = Math.sin(ang) * rad;
      if (Math.max(Math.abs(px), Math.abs(pz)) < N / 2 + 2.5) continue; // stay off the mat
      if (Math.max(Math.abs(px), Math.abs(pz)) > N / 2 + 27) continue;  // stay inside the walls
      const m = mapRegistry[scatterKinds[(rnd() * scatterKinds.length) | 0]].clone(true);
      m.scale.setScalar(1.6 + rnd() * 2.2);
      m.position.set(px, 0, pz);
      m.rotation.y = rnd() * Math.PI * 2;
      g.add(m);
      placed++;
    }
  }

  // the playmat itself — hi-res canvas, art varies by map theme
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');

  if (style === 'underbed') {
    // dusty darkness under the bed: grey-blue fabric, dust drifts, slat shadows
    x.fillStyle = '#3b3e54'; x.fillRect(0, 0, S, S);
    let seedU = 777;
    const rndU = () => (seedU = (seedU * 16807) % 2147483647) / 2147483647;
    x.fillStyle = '#333650';
    for (let i = 0; i < 2200; i++) x.fillRect(rndU() * S, rndU() * S, 4 + rndU() * 5, 3 + rndU() * 3);
    // dust bunnies
    for (let i = 0; i < 60; i++) {
      const dx = rndU() * S, dy = rndU() * S, r = 14 + rndU() * 30;
      x.fillStyle = `rgba(150,150,170,${0.05 + rndU() * 0.08})`;
      x.beginPath(); x.arc(dx, dy, r, 0, Math.PI * 2); x.fill();
    }
    // bed-slat shadow bands
    for (let i = 0; i < 6; i++) {
      x.fillStyle = 'rgba(10,10,24,0.28)';
      x.fillRect(0, i * 360 + 90, S, 110);
    }
    // forgotten sock + comic book doodles
    x.fillStyle = '#8a4a5c'; x.beginPath(); x.ellipse(420, 1500, 90, 40, 0.7, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#4a6a8a'; x.fillRect(1500, 400, 180, 130);
    x.strokeStyle = '#f6f2e6'; x.lineWidth = 5; x.strokeRect(1500, 400, 180, 130);
  } else if (style === 'attic') {
    // attic war table: broad wooden planks with a round rug arena
    x.fillStyle = '#9a6a3c'; x.fillRect(0, 0, S, S);
    for (let p = 0; p < 10; p++) {
      x.fillStyle = p % 2 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.03)';
      x.fillRect(0, p * 205, S, 205);
      x.strokeStyle = 'rgba(40,20,5,0.45)'; x.lineWidth = 6;
      x.beginPath(); x.moveTo(0, p * 205); x.lineTo(S, p * 205); x.stroke();
      x.beginPath(); x.moveTo(((p * 733) % S), p * 205); x.lineTo(((p * 733) % S), (p + 1) * 205); x.stroke();
    }
    // knots in the wood
    let seedA = 4242;
    const rndA = () => (seedA = (seedA * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 26; i++) {
      const kx = rndA() * S, ky = rndA() * S;
      x.strokeStyle = 'rgba(50,25,8,0.5)'; x.lineWidth = 4;
      x.beginPath(); x.ellipse(kx, ky, 14 + rndA() * 12, 8 + rndA() * 8, rndA() * 3, 0, Math.PI * 2); x.stroke();
    }
    // round braided rug in the middle
    for (let r = 0; r < 7; r++) {
      x.strokeStyle = ['#b5443c', '#d9a066', '#5a7d4f', '#b5443c', '#d9a066', '#5a7d4f', '#b5443c'][r];
      x.lineWidth = 42;
      x.beginPath(); x.arc(1024, 1024, 330 - r * 44, 0, Math.PI * 2); x.stroke();
    }
  } else if (style === 'playground') {
    // sunny backyard: mown grass, a big sandbox arena, a rubber running track,
    // hopscotch and four-square courts painted on a concrete path.
    x.fillStyle = '#7cb356'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 32; i++) if (i % 2) { x.fillStyle = '#00000009'; x.fillRect(0, i * 64, S, 64); }
    let seedP = 24680;
    const rndP = () => (seedP = (seedP * 16807) % 2147483647) / 2147483647;
    x.fillStyle = '#6ba449';
    for (let i = 0; i < 2600; i++) x.fillRect(rndP() * S, rndP() * S, 3 + rndP() * 4, 2 + rndP() * 3);
    x.fillStyle = '#93c96f';
    for (let i = 0; i < 1600; i++) x.fillRect(rndP() * S, rndP() * S, 3, 2);
    // rubberized running track: a red-orange oval ring hugging the edge
    x.save();
    x.translate(S / 2, S / 2);
    x.strokeStyle = '#c85a3c'; x.lineWidth = 96; x.lineJoin = 'round';
    x.beginPath(); x.ellipse(0, 0, 880, 880, 0, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = '#f6f2e6'; x.lineWidth = 4; x.setLineDash([34, 30]);
    for (const rr of [832, 928]) { x.beginPath(); x.ellipse(0, 0, rr, rr, 0, 0, Math.PI * 2); x.stroke(); }
    x.setLineDash([]);
    x.restore();
    // central sandbox: rounded tan square with a timber frame + rake lines
    const sb = 560, sbx = 1024 - sb / 2;
    x.fillStyle = '#8a5a34';
    if (x.roundRect) { x.beginPath(); x.roundRect(sbx - 26, sbx - 26, sb + 52, sb + 52, 40); x.fill(); }
    else x.fillRect(sbx - 26, sbx - 26, sb + 52, sb + 52);
    x.fillStyle = '#e8cf94';
    if (x.roundRect) { x.beginPath(); x.roundRect(sbx, sbx, sb, sb, 28); x.fill(); }
    else x.fillRect(sbx, sbx, sb, sb);
    x.fillStyle = '#d9bd80';
    for (let i = 0; i < 900; i++) x.fillRect(sbx + rndP() * sb, sbx + rndP() * sb, 3, 3);
    x.strokeStyle = '#d0b273'; x.lineWidth = 3;
    for (let r = 0; r < 9; r++) { x.beginPath(); x.moveTo(sbx + 20, sbx + 40 + r * 60); x.bezierCurveTo(sbx + sb * 0.4, sbx + 20 + r * 60, sbx + sb * 0.6, sbx + 60 + r * 60, sbx + sb - 20, sbx + 40 + r * 60); x.stroke(); }
    // hopscotch court painted on grass (top-left path)
    x.save(); x.translate(430, 470);
    const cell = 92; const hop = [[0, 0, 1], [0, 1, 1], [-0.5, 2, 1], [0.5, 2, 1], [0, 3, 1], [-0.5, 4, 1], [0.5, 4, 1]];
    x.fillStyle = '#eef0f2'; x.strokeStyle = '#c85a3c'; x.lineWidth = 6;
    for (const [cx, cy] of hop) { x.beginPath(); x.rect(cx * cell - cell / 2, -cy * cell, cell - 8, cell - 8); x.fill(); x.stroke(); }
    x.restore();
    // four-square court (bottom-right)
    x.save(); x.translate(1560, 1560);
    x.fillStyle = '#cfe3ef'; x.fillRect(-150, -150, 300, 300);
    x.strokeStyle = '#3a6ea5'; x.lineWidth = 8;
    x.strokeRect(-150, -150, 300, 300); x.beginPath();
    x.moveTo(0, -150); x.lineTo(0, 150); x.moveTo(-150, 0); x.lineTo(150, 0); x.stroke();
    x.restore();
    // splash-pad puddles (kidney blues)
    for (const [px, py] of [[1600, 470], [470, 1600]]) {
      x.fillStyle = '#7fd0e8'; x.beginPath(); x.ellipse(px, py, 120, 82, rndP() * 3, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#f6f2e6'; x.lineWidth = 7; x.beginPath(); x.ellipse(px, py, 120, 82, rndP() * 3, 0, Math.PI * 2); x.stroke();
    }
    // stitched mat border
    x.strokeStyle = '#f6f2e6'; x.lineWidth = 14; x.setLineDash([40, 24]);
    x.strokeRect(26, 26, S - 52, S - 52); x.setLineDash([]);
  } else if (style === 'kitchen') {
    // dinner table: warm wood, gingham placemats, plates, milk spills, crumbs
    let seedK = 33221;
    const rndK = () => (seedK = (seedK * 16807) % 2147483647) / 2147483647;
    x.fillStyle = '#b07a44'; x.fillRect(0, 0, S, S);
    for (let p = 0; p < 12; p++) {
      x.fillStyle = p % 2 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.03)';
      x.fillRect(0, p * 172, S, 172);
      x.strokeStyle = 'rgba(70,40,15,0.4)'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(0, p * 172); x.lineTo(S, p * 172); x.stroke();
    }
    for (let i = 0; i < 30; i++) { // wood knots
      x.strokeStyle = 'rgba(70,40,15,0.4)'; x.lineWidth = 3;
      x.beginPath(); x.ellipse(rndK() * S, rndK() * S, 12 + rndK() * 12, 7 + rndK() * 7, rndK() * 3, 0, Math.PI * 2); x.stroke();
    }
    // two gingham placemats with a plate on each (SW + NE seats)
    const mat = (mx, my) => {
      x.save(); x.translate(mx, my); x.rotate((rndK() - 0.5) * 0.2);
      x.fillStyle = '#f2ede0'; x.fillRect(-330, -230, 660, 460);
      x.fillStyle = 'rgba(210,70,70,0.5)';
      for (let gx = -330; gx < 330; gx += 60) x.fillRect(gx, -230, 30, 460);
      for (let gy = -230; gy < 230; gy += 60) x.fillRect(-330, gy, 660, 30);
      x.fillStyle = '#fbfaf6'; x.beginPath(); x.arc(0, 0, 150, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#c9c3b2'; x.lineWidth = 8; x.beginPath(); x.arc(0, 0, 150, 0, Math.PI * 2); x.stroke();
      x.beginPath(); x.arc(0, 0, 112, 0, Math.PI * 2); x.stroke();
      x.restore();
    };
    mat(470, 1580); mat(1580, 470);
    // milk spills (cream blobs with a glossy rim)
    for (let i = 0; i < 5; i++) {
      const bx = 300 + rndK() * (S - 600), by = 300 + rndK() * (S - 600);
      x.fillStyle = 'rgba(245,242,230,0.92)'; x.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.4) { const rr = 70 + rndK() * 55; const px = bx + Math.cos(a) * rr, py = by + Math.sin(a) * rr * 0.8; a === 0 ? x.moveTo(px, py) : x.lineTo(px, py); }
      x.closePath(); x.fill();
    }
    x.fillStyle = 'rgba(90,55,25,0.5)'; // crumbs
    for (let i = 0; i < 1400; i++) x.fillRect(rndK() * S, rndK() * S, 3 + rndK() * 4, 2 + rndK() * 3);
  } else if (style === 'bookshelf') {
    // looking down into packed shelves: bands of colourful book spines
    let seedB = 51423;
    const rndB = () => (seedB = (seedB * 16807) % 2147483647) / 2147483647;
    x.fillStyle = '#6e4a2a'; x.fillRect(0, 0, S, S); // shelf wood
    const spineCols = ['#b5443c', '#d9a066', '#5a7d4f', '#3a6ea5', '#8a5a86', '#c98a3c', '#4a8a8a', '#a03c4a'];
    const bandH = S / 6;
    for (let band = 0; band < 6; band++) {
      const y0 = band * bandH;
      x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(0, y0 + bandH - 20, S, 20); // shelf shadow
      let sx = 8;
      while (sx < S - 8) {
        const w = 44 + rndB() * 70;
        const h = bandH - 26 - rndB() * (bandH * 0.18);
        const col = spineCols[(rndB() * spineCols.length) | 0];
        x.fillStyle = col; x.fillRect(sx, y0 + (bandH - 22 - h), w, h);
        x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(sx, y0 + (bandH - 22 - h), w, 10); // top edge
        x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(sx + w - 6, y0 + (bandH - 22 - h), 6, h); // spine shade
        x.strokeStyle = 'rgba(246,242,230,0.5)'; x.lineWidth = 3; // title bands
        for (let t = 0; t < 2 + (rndB() * 2 | 0); t++) { const ty = y0 + (bandH - 22 - h) + 26 + t * 22; x.beginPath(); x.moveTo(sx + 8, ty); x.lineTo(sx + w - 10, ty); x.stroke(); }
        sx += w + 3;
      }
    }
  } else if (style === 'livingroom') {
    // holiday carpet: deep pile, a round tree-skirt hill, ribbon lanes
    let seedL = 71234;
    const rndL = () => (seedL = (seedL * 16807) % 2147483647) / 2147483647;
    x.fillStyle = '#8f2f37'; x.fillRect(0, 0, S, S); // cranberry carpet
    x.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 5000; i++) x.fillRect(rndL() * S, rndL() * S, 3, 6); // pile fibres
    x.fillStyle = 'rgba(0,0,0,0.06)';
    for (let i = 0; i < 2600; i++) x.fillRect(rndL() * S, rndL() * S, 3, 6);
    // diagonal wrapping-ribbon lanes (green + gold candy stripes)
    const ribbon = (fn, col) => { x.strokeStyle = col; x.lineWidth = 70; x.lineCap = 'round'; x.beginPath(); fn(); x.stroke(); x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 6; x.setLineDash([30, 26]); x.beginPath(); fn(); x.stroke(); x.setLineDash([]); };
    ribbon(() => { x.moveTo(180, 1000); x.bezierCurveTo(760, 620, 1300, 1420, 1868, 1040); }, '#2f6f45');
    ribbon(() => { x.moveTo(1000, 180); x.bezierCurveTo(620, 760, 1420, 1300, 1040, 1868); }, '#c79a2c');
    // central tree-skirt: white ring with red trim + pine-needle speckle
    x.fillStyle = '#f4f0e6'; x.beginPath(); x.arc(1024, 1024, 250, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#c23a3a'; x.lineWidth = 22; x.beginPath(); x.arc(1024, 1024, 240, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#3f6f45'; x.beginPath(); x.arc(1024, 1024, 120, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#2f5f38'; x.lineWidth = 3;
    for (let i = 0; i < 240; i++) { const a = rndL() * Math.PI * 2, r = rndL() * 118; x.beginPath(); x.moveTo(1024 + Math.cos(a) * r, 1024 + Math.sin(a) * r); x.lineTo(1024 + Math.cos(a) * (r + 10), 1024 + Math.sin(a) * (r + 10)); x.stroke(); }
    // scattered ornament + candy-cane doodles on the carpet
    for (let i = 0; i < 24; i++) {
      const ox = 200 + rndL() * (S - 400), oy = 200 + rndL() * (S - 400);
      if ((ox - 1024) ** 2 + (oy - 1024) ** 2 < 300 * 300) continue;
      x.fillStyle = ['#e8c34a', '#4a86c8', '#e5484d', '#5aa06a'][(rndL() * 4) | 0];
      x.beginPath(); x.arc(ox, oy, 16, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.arc(ox - 5, oy - 5, 5, 0, Math.PI * 2); x.fill();
    }
    // tinsel border
    x.strokeStyle = '#e8c34a'; x.lineWidth = 16; x.setLineDash([30, 20]);
    x.strokeRect(24, 24, S - 48, S - 48); x.setLineDash([]);
  } else if (style === 'bathtub') {
    // porcelain tub floor: white tiles + grout, a blue basin, a drain, suds
    let seedT = 60101;
    const rndT = () => (seedT = (seedT * 16807) % 2147483647) / 2147483647;
    x.fillStyle = '#e9eef2'; x.fillRect(0, 0, S, S);
    x.strokeStyle = 'rgba(150,170,185,0.5)'; x.lineWidth = 4;
    for (let gl = 0; gl <= S; gl += 128) { x.beginPath(); x.moveTo(gl, 0); x.lineTo(gl, S); x.stroke(); x.beginPath(); x.moveTo(0, gl); x.lineTo(S, gl); x.stroke(); }
    // basin: deeper blue tub bottom (the translucent water mesh sits on top)
    const grd = x.createRadialGradient(1024, 1024, 80, 1024, 1024, 470);
    grd.addColorStop(0, '#2b7fb8'); grd.addColorStop(0.7, '#3a93cc'); grd.addColorStop(1, '#bfe0ef');
    x.fillStyle = grd; x.beginPath(); x.ellipse(1024, 1024, 470, 380, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#f4fbff'; x.lineWidth = 12; x.beginPath(); x.ellipse(1024, 1024, 470, 380, 0, 0, Math.PI * 2); x.stroke();
    x.save(); x.beginPath(); x.ellipse(1024, 1024, 462, 372, 0, 0, Math.PI * 2); x.clip();
    x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 3;
    for (let gl = 0; gl <= S; gl += 128) { x.beginPath(); x.moveTo(gl, 0); x.lineTo(gl, S); x.stroke(); x.beginPath(); x.moveTo(0, gl); x.lineTo(S, gl); x.stroke(); }
    x.restore();
    // drain at the very centre
    x.fillStyle = '#9fb4c0'; x.beginPath(); x.arc(1024, 1024, 34, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#5f7683'; x.lineWidth = 4;
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; x.beginPath(); x.moveTo(1024 + Math.cos(a) * 10, 1024 + Math.sin(a) * 10); x.lineTo(1024 + Math.cos(a) * 30, 1024 + Math.sin(a) * 30); x.stroke(); }
    // suds ringing the basin rim
    for (let i = 0; i < 140; i++) { const a = rndT() * Math.PI * 2, rr = 372 + rndT() * 95; const bx = 1024 + Math.cos(a) * rr * 1.23, by = 1024 + Math.sin(a) * rr; x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.arc(bx, by, 6 + rndT() * 12, 0, Math.PI * 2); x.fill(); }
  } else {
    // classic bedroom playmat
    x.fillStyle = '#79b45a'; x.fillRect(0, 0, S, S);
  // mowing stripes + speckle grass
  for (let i = 0; i < 32; i++) {
    if (i % 2) { x.fillStyle = '#00000008'; x.fillRect(0, i * 64, S, 64); }
  }
  let seed = 12345;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = '#6aa54e';
  for (let i = 0; i < 2600; i++) {
    x.fillRect(rnd() * S, rnd() * S, 3 + rnd() * 4, 2 + rnd() * 3);
  }
  x.fillStyle = '#8cc46e';
  for (let i = 0; i < 1800; i++) x.fillRect(rnd() * S, rnd() * S, 3, 2);
  // flower doodles
  for (let i = 0; i < 90; i++) {
    const fx = rnd() * S, fy = rnd() * S;
    x.fillStyle = ['#f6f2e6', '#f8c8dc', '#ffe28a'][ (rnd() * 3) | 0];
    for (let p = 0; p < 5; p++) {
      const a = p / 5 * Math.PI * 2;
      x.beginPath(); x.arc(fx + Math.cos(a) * 7, fy + Math.sin(a) * 7, 4.5, 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = '#f3722c';
    x.beginPath(); x.arc(fx, fy, 4, 0, Math.PI * 2); x.fill();
  }
  // roads with borders + center dashes + crossings
  const road = (fn) => {
    x.strokeStyle = '#c3bda8'; x.lineWidth = 84; x.lineCap = 'round'; x.setLineDash([]);
    x.beginPath(); fn(); x.stroke();
    x.strokeStyle = '#d8d3c3'; x.lineWidth = 68;
    x.beginPath(); fn(); x.stroke();
    x.strokeStyle = '#f6f2e6'; x.lineWidth = 6; x.setLineDash([36, 28]);
    x.beginPath(); fn(); x.stroke();
    x.setLineDash([]);
  };
  road(() => { x.moveTo(240, 1024); x.bezierCurveTo(800, 600, 1240, 1440, 1808, 1024); });
  road(() => { x.moveTo(1024, 240); x.bezierCurveTo(600, 800, 1440, 1240, 1024, 1808); });
  // town circle at the center crossing
  x.setLineDash([]);
  x.fillStyle = '#d8d3c3';
  x.beginPath(); x.arc(1024, 1024, 150, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#9bc47f';
  x.beginPath(); x.arc(1024, 1024, 96, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#f6f2e6'; x.lineWidth = 8;
  x.beginPath(); x.arc(1024, 1024, 122, 0, Math.PI * 2); x.stroke();
  // pond doodle
  x.fillStyle = '#7fd0e8';
  x.beginPath(); x.ellipse(430, 1620, 130, 88, 0.4, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#f6f2e6'; x.lineWidth = 7;
  x.beginPath(); x.ellipse(430, 1620, 130, 88, 0.4, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#7fd0e8';
  x.beginPath(); x.ellipse(1620, 430, 130, 88, 0.4, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#f6f2e6';
  x.beginPath(); x.ellipse(1620, 430, 130, 88, 0.4, 0, Math.PI * 2); x.stroke();
  // stitched border
  x.strokeStyle = '#f6f2e6'; x.lineWidth = 14; x.setLineDash([40, 24]);
  x.strokeRect(26, 26, S - 52, S - 52);
  x.setLineDash([]);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  const groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  // one segment per tile: the game displaces vertices for real elevation,
  // and the ambient breeze ripples on top of that base
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(N, N, N, N), groundMat);
  mat.name = 'playmat-ground';
  mat.rotation.x = -Math.PI / 2;
  mat.receiveShadow = true;
  g.add(mat);
  // generated top-down ground art replaces the canvas when present
  new THREE.TextureLoader().load(
    `assets/map/ground-${style}.png`,
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      groundMat.map = t;
      groundMat.needsUpdate = true;
    },
    undefined,
    () => {} // keep the canvas art if no generated texture exists
  );

  // a believable bedroom around the battlefield (skip under the bed — no room)
  if (style !== 'underbed') addBedroom(g, N, style);
  return g;
}

// A cozy kid's bedroom that frames the battlefield so the world never ends at a
// hard edge: a rug the playmat rests on, plus a bed, dresser, toy chest,
// bookshelf and a moonlit window against the walls. All visual-only, placed
// well outside the play area (±N/2) and inside the room walls (±N/2+30).
function addBedroom(g, N, style) {
  const half = N / 2;
  const attic = style === 'attic';
  const M = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const box = (w, h, d, c, r) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c, r));
  const cyl = (r0, r1, h, c, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), M(c));
  const put = (m, x, y, z, ry = 0) => { m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  let rs = 4211 + N;
  const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
  // place a generated furniture GLB (normalized to max-horizontal-extent 1,
  // grounded at y=0); returns false if the model isn't loaded so the caller
  // falls back to the procedural version. size = world units of the longest side.
  const placeFurn = (key, x, z, targetH, ry = 0) => {
    const proto = furnitureRegistry[key];
    if (!proto) return false;
    const m = proto.clone(true);
    // scale to a target HEIGHT (reconstructions vary in bulk; height is the
    // predictable dimension and keeps furniture from clipping the walls/mat)
    const b = new THREE.Box3().setFromObject(m);
    const sz = new THREE.Vector3(); b.getSize(sz);
    m.scale.setScalar(targetH / Math.max(sz.y, 1e-6));
    m.position.set(x, 0, z);
    m.rotation.y = ry;
    m.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    g.add(m);
    return true;
  };

  // --- round rug under the playmat (shows as a warm ring framing the mat) ---
  const rugCv = document.createElement('canvas'); rugCv.width = rugCv.height = 256;
  const rx = rugCv.getContext('2d');
  const rug3 = attic ? ['#7a5a3a', '#a5824f', '#5f4327'] : ['#8a4450', '#c88a6a', '#63333d'];
  rx.fillStyle = rug3[0]; rx.beginPath(); rx.arc(128, 128, 126, 0, 7); rx.fill();
  rx.lineWidth = 12; rx.strokeStyle = rug3[1]; rx.beginPath(); rx.arc(128, 128, 100, 0, 7); rx.stroke();
  rx.lineWidth = 7; rx.strokeStyle = rug3[2]; rx.beginPath(); rx.arc(128, 128, 74, 0, 7); rx.stroke();
  rx.lineWidth = 3; rx.strokeStyle = rug3[1];
  for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2; rx.beginPath(); rx.moveTo(128 + Math.cos(a) * 119, 128 + Math.sin(a) * 119); rx.lineTo(128 + Math.cos(a) * 127, 128 + Math.sin(a) * 127); rx.stroke(); }
  const rug = new THREE.Mesh(new THREE.CircleGeometry(half + 20, 56), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(rugCv), roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.y = -0.014; rug.receiveShadow = true; g.add(rug);

  // --- BED along the north wall, turned LENGTHWISE (long axis = x) so it has
  // real bed proportions instead of a stubby bench squeezed against the mat ---
  const bx = -3, bz = -half - 18;                                    // centre (x=-3, z=-54)
  if (!placeFurn('bed', bx, bz, 15, 0)) {                            // real model wins; else procedural
  put(box(46, 5, 20, 0x8a5a34), bx, 3, bz);                          // frame
  put(box(42, 5, 17, 0xf3ede0, 0.96), bx, 7, bz);                   // mattress
  put(box(4, 22, 20, 0x6f4526), bx - 23, 11, bz);                   // headboard panel (west end)
  put(cyl(1.5, 1.5, 26, 0x5a3a20, 8), bx - 23, 13, bz - 9);         // headboard posts
  put(cyl(1.5, 1.5, 26, 0x5a3a20, 8), bx - 23, 13, bz + 9);
  put(box(3.5, 11, 20, 0x6f4526), bx + 23, 5.5, bz);               // footboard (east end)
  put(box(9, 5, 16, 0xffffff, 0.96), bx - 17, 9.4, bz);            // pillows at the head
  put(box(9, 5, 16, 0xfff2d8, 0.96), bx - 16, 9.7, bz + 1);
  put(box(28, 4.5, 18, attic ? 0x9a7a52 : 0x6f7fc4, 0.85), bx + 5, 9.2, bz); // duvet over the lower half
  for (const lx of [bx - 21, bx + 21]) for (const lz of [bz - 8, bz + 8]) put(cyl(1.3, 1.3, 3, 0x5d3d22, 8), lx, 1.5, lz); // legs
  }

  // --- DRESSER against the east wall (+x), facing into the room (-x) ---
  const dx = half + 20;
  if (!placeFurn('dresser', dx, -8, 22, -Math.PI / 2)) {
  put(box(16, 24, 34, 0x9a6a3e), dx, 12, -8);
  for (let r = 0; r < 3; r++) {
    put(box(1, 6, 28, 0xc0925a), dx - 8, 6 + r * 7, -8);            // drawer face
    put(new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), M(0x3a2a16)), dx - 8.8, 6 + r * 7, -8); // knob
  }
  put(cyl(2.4, 3.0, 2, 0xff8a5a), dx, 25, -14);                     // toy on top
  }

  // --- TOY CHEST against the west wall (-x), facing into the room (+x) ---
  const cx = -half - 18;
  if (!placeFurn('toychest', cx, -4, 13, Math.PI / 2)) {
  put(box(18, 14, 30, 0x7a5a86), cx, 7, -4);
  const lid = put(box(18, 2.4, 30, 0x8a6a96), cx, 15, -18); lid.rotation.x = -0.6;
  put(cyl(2.6, 2.6, 2.6, 0xffd24a, 10), cx + 2, 16, 2);
  put(box(5, 5, 5, 0xe05555), cx - 3, 16, -2);
  put(new THREE.Mesh(new THREE.SphereGeometry(2.8, 12, 10), M(0x59a0e0)), cx, 16, 8);
  }

  // --- BOOKSHELF against the south wall (+z), facing into the room (-z) ---
  const sz = half + 20;
  if (!placeFurn('bookshelf', 0, sz - 7, 26, Math.PI)) {
  put(box(44, 28, 9, 0x8a5a34), 0, 14, sz);
  const bc = [0xe05555, 0xf0a44a, 0xf0d24a, 0x6fb86f, 0x59a0e0, 0x9a6ad0];
  for (let s = 0; s < 3; s++) {
    put(box(44, 1, 9, 0x6a4526), 0, 5 + s * 8, sz);
    let bx = -20;
    while (bx < 19) { const bw = 1.4 + rnd() * 1.6; put(box(bw, 6.5, 6.5, bc[(rnd() * bc.length) | 0], 0.7), bx, 9 + s * 8, sz); bx += bw + 0.35; }
  }
  }

  // --- moonlit WINDOW high on the north wall, above the bed ---
  const wz = -half - 29.6;
  const win = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), new THREE.MeshStandardMaterial({ color: 0xbcd6ff, emissive: 0x6f90e8, emissiveIntensity: 0.7, roughness: 0.5 }));
  win.position.set(0, 27, wz); g.add(win);
  put(box(24, 1.6, 1, 0xf0ead8), 0, 35.4, wz);   // frame top
  put(box(24, 1.6, 1, 0xf0ead8), 0, 18.6, wz);   // frame bottom
  put(box(1.6, 18, 1, 0xf0ead8), 0, 27, wz);     // vertical mullion
  put(box(24, 1.6, 1, 0xf0ead8), 0, 27, wz);     // horizontal mullion

  // --- wall decor so the empty walls feel lived-in ---
  const WI = half + 29.4;                          // just inside the ±(half+30) walls
  // a framed picture, thin against a given wall; wall: 'e'|'w'|'s'
  const framed = (wall, along, py, w, h, col) => {
    const thin = 0.5, artC = new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, emissive: col, emissiveIntensity: 0.06 });
    let fx, fz, ry, art;
    if (wall === 'e') { fx = WI; fz = along; ry = -Math.PI / 2; put(box(thin, h, w, 0x6a4526), fx, py, fz); art = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, h * 0.82), artC); art.position.set(fx - 0.35, py, fz); }
    else if (wall === 'w') { fx = -WI; fz = along; ry = Math.PI / 2; put(box(thin, h, w, 0x6a4526), fx, py, fz); art = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, h * 0.82), artC); art.position.set(fx + 0.35, py, fz); }
    else { fx = along; fz = half + 29.4; ry = Math.PI; put(box(w, h, thin, 0x6a4526), fx, py, fz); art = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, h * 0.82), artC); art.position.set(fx, py, fz - 0.35); }
    art.rotation.y = ry; g.add(art);
  };
  framed('e', 8, 31, 10, 8, 0x6fa8e0);             // east: sky/scribble art above dresser
  framed('e', -22, 30, 8, 10, 0xe08a6a);           // east: portrait
  framed('w', 6, 31, 11, 8, 0x6fbf78);             // west: landscape above toy chest
  // a round wall clock on the south wall above the bookshelf
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.5, 20), M(0xf3ede0, 0.6));
  clock.rotation.x = Math.PI / 2; clock.position.set(-16, 33, half + 29.4); g.add(clock);
  put(box(0.4, 3.2, 0.3, 0x333333), -16, 33.6, half + 29.0);   // hour hand
  put(box(0.3, 4.4, 0.3, 0x333333), -16, 33, half + 29.0).rotation.z = 1.1; // minute hand
  // pennant bunting strung across the north wall beside the window
  const pennC = [0xe05555, 0xf0a44a, 0xf0d24a, 0x6fb86f, 0x59a0e0];
  for (let i = 0; i < 10; i++) {
    const px = -30 + i * 6.6, dip = Math.sin(i / 9 * Math.PI) * 2.4;
    const tri = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.6, 3), M(pennC[i % pennC.length], 0.7));
    tri.position.set(px, 39 - dip, -half - 28.6); tri.rotation.x = Math.PI / 2; tri.rotation.y = Math.PI; g.add(tri);
  }
}

// bedside lamp looming over the playmat corner — warm pool of real light
export function createLamp(N) {
  const g = new THREE.Group();
  const add = (m) => { m.castShadow = true; g.add(m); return m; };
  const base = add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 0.8, 14), toyMat(0x6b4a86, 0.6)));
  base.position.y = 0.4;
  const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 14, 10), toyMat(0x8a6aa6, 0.5)));
  pole.position.y = 7.5;
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 4.2, 4.5, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xffe9c4, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffdfae, emissiveIntensity: 0.35 })
  );
  shade.position.y = 15.5;
  g.add(shade);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffedb8, emissiveIntensity: 2.2 })
  );
  bulb.position.y = 14.6;
  g.add(bulb);
  const light = new THREE.PointLight(0xffd9a0, 220, 55, 1.6);
  light.position.y = 14.2;
  g.add(light);
  g.position.set(-N / 2 - 5, 0, -N / 2 + 12);
  return { group: g, light, bulb };
}

// non-blocking bedroom clutter scattered around the playmat
// translucent water sheet for naval maps: one map-sized plane masked to the
// water tiles (same trick the fog uses), with a gentle bob ripple.
export function createWaterSurface(N, water) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  for (let k = 0; k < water.length; k++) {
    const p = k * 4, on = water[k] ? 255 : 0;
    img.data[p] = on; img.data[p + 1] = on; img.data[p + 2] = on; img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const mask = new THREE.CanvasTexture(cv);
  mask.magFilter = THREE.LinearFilter;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3fa8e0, transparent: true, opacity: 0.84, alphaMap: mask,
    roughness: 0.12, metalness: 0.25, emissive: 0x1c5f92, emissiveIntensity: 0.28,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(N, N, 1, 1), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.15;
  plane.renderOrder = 3;
  const group = new THREE.Group();
  group.add(plane);
  let t = 0;
  return { group, update(dt) { t += dt; plane.position.y = 0.15 + Math.sin(t * 1.6) * 0.02; } };
}

export function createDecorMesh(kind, rngSeed = 1) {
  let seed = rngSeed * 48271 + 11;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const g = new THREE.Group();
  const add = (m) => { m.castShadow = true; g.add(m); return m; };
  if (kind === 'crayon') {
    const col = PASTELS[(rng() * PASTELS.length) | 0];
    const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 8), toyMat(col, 0.5)));
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.09;
    const tip = add(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 8), toyMat(col, 0.5)));
    tip.rotation.z = -Math.PI / 2;
    tip.position.set(0.66, 0.09, 0);
    const band = add(new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.2, 8), toyMat(0x333333, 0.6)));
    band.rotation.z = Math.PI / 2;
    band.position.set(0.35, 0.09, 0);
    g.rotation.y = rng() * Math.PI * 2;
  } else if (kind === 'die') {
    const d = add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), toyMat(0xf6f2e6, 0.35)));
    d.position.y = 0.22;
    d.rotation.y = rng() * Math.PI;
    for (const [px, py, pz] of [[0, 0.445, 0], [0.12, 0.445, 0.12], [-0.12, 0.445, -0.12]]) {
      const pip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 8), toyMat(0x222222, 0.4));
      pip.position.set(px, py, pz);
      g.add(pip);
    }
  } else if (kind === 'swingset') {
    // A-frame swing set: two splayed leg pairs, a top bar, two hanging seats
    const frameM = toyMat(0x5a8fb0, 0.45);
    const W = 1.7, H = 1.5;
    for (const sx of [-W / 2, W / 2]) for (const lean of [-1, 1]) {
      const leg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, H, 8), frameM));
      leg.position.set(sx, H / 2, lean * 0.35);
      leg.rotation.x = lean * 0.42;
    }
    const bar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, W + 0.2, 8), frameM));
    bar.rotation.z = Math.PI / 2; bar.position.y = H;
    for (const sx of [-0.42, 0.42]) {
      const seatCol = PASTELS[(rng() * PASTELS.length) | 0];
      for (const cx of [sx - 0.13, sx + 0.13]) {
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.72, 5), toyMat(0x9aa0a6, 0.4));
        chain.position.set(cx, H - 0.37, 0); g.add(chain);
      }
      const seat = add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.17), toyMat(seatCol, 0.5)));
      seat.position.set(sx, H - 0.73, 0);
    }
    g.rotation.y = rng() * Math.PI * 2;
  } else if (kind === 'slide') {
    // platform on posts with a ladder and a bright inclined chute
    const postM = toyMat(0xc0603a, 0.5);
    for (const [px, pz] of [[-0.24, -0.74], [0.24, -0.74], [-0.24, -0.26], [0.24, -0.26]]) {
      const p = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), postM));
      p.position.set(px, 0.5, pz);
    }
    const plat = add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.62), toyMat(0xe8b84a, 0.5)));
    plat.position.set(0, 1.0, -0.5);
    const chute = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 1.25), toyMat(0x4aa5d8, 0.35)));
    chute.position.set(0, 0.55, 0.3); chute.rotation.x = -0.62;
    for (const rx of [-0.22, 0.22]) {
      const rail = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 1.25), toyMat(0x3a8fc0, 0.35)));
      rail.position.set(rx, 0.6, 0.3); rail.rotation.x = -0.62;
    }
    for (const ry of [0, 0.3, 0.6]) {
      const rung = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), postM));
      rung.rotation.z = Math.PI / 2; rung.position.set(0, 0.25 + ry, -0.78);
    }
    g.rotation.y = rng() * Math.PI * 2;
  } else if (kind === 'seesaw') {
    const fulc = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.2, 0.5, 10), toyMat(0x6a6f78, 0.5)));
    fulc.position.y = 0.25;
    const tilt = 0.17;
    const plank = add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.09, 0.28), toyMat(PASTELS[(rng() * PASTELS.length) | 0], 0.5)));
    plank.position.y = 0.52; plank.rotation.z = tilt;
    for (const ex of [-0.82, 0.82]) {
      const grip = add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 10), toyMat(0xf0c419, 0.5)));
      grip.position.set(ex, 0.52 + Math.sin(tilt) * (ex < 0 ? 0.82 : -0.82), 0);
      grip.rotation.x = Math.PI / 2;
    }
    g.rotation.y = rng() * Math.PI * 2;
  } else if (kind === 'sandbucket') {
    const pail = add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.27, 12), toyMat(PASTELS[(rng() * PASTELS.length) | 0], 0.4)));
    pail.position.set(0, 0.14, 0);
    const mound = add(new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.22, 12), toyMat(0xe8cf94, 0.95)));
    mound.position.set(0.4, 0.11, 0.1);
    const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 5), toyMat(0x8a5a34, 0.5)));
    pole.position.set(0.4, 0.33, 0.1);
    const flag = add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.01), toyMat(0xe5484d, 0.4)));
    flag.position.set(0.47, 0.37, 0.1);
    g.rotation.y = rng() * Math.PI * 2;
  } else if (kind === 'teacup') {
    const col = PASTELS[(rng() * PASTELS.length) | 0];
    const saucer = add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.05, 16), toyMat(0xf6f2e6, 0.3)));
    saucer.position.y = 0.025;
    const cup = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.15, 0.26, 16), toyMat(col, 0.3)));
    cup.position.y = 0.19;
    const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 16), toyMat(0x7a4a28, 0.2));
    tea.position.y = 0.31; g.add(tea);
    const handle = add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.028, 8, 14, Math.PI), toyMat(col, 0.3)));
    handle.position.set(0.24, 0.19, 0); handle.rotation.z = -Math.PI / 2;
    g.rotation.y = rng() * Math.PI * 2;
  } else if (kind === 'ornament') {
    const col = [0xe5484d, 0x4a86c8, 0xe8c34a, 0x5aa06a, 0x9a5ab0][(rng() * 5) | 0];
    const ball = add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.15, metalness: 0.5, emissive: col, emissiveIntensity: 0.12 })));
    ball.position.y = 0.28;
    const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 10), toyMat(0xe8c34a, 0.3)));
    cap.position.y = 0.52;
    const loop = add(new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12), toyMat(0xe8c34a, 0.3)));
    loop.position.y = 0.57;
    g.rotation.y = rng() * Math.PI * 2;
  } else if (kind === 'gift') {
    const boxCol = PASTELS[(rng() * PASTELS.length) | 0];
    const ribCol = [0xe5484d, 0xe8c34a, 0xf6f2e6][(rng() * 3) | 0];
    const s = 0.34 + rng() * 0.12;
    const box = add(new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.85, s), toyMat(boxCol, 0.5)));
    box.position.y = s * 0.42;
    const ribM = toyMat(ribCol, 0.4);
    const r1 = add(new THREE.Mesh(new THREE.BoxGeometry(s + 0.02, s * 0.86, 0.06), ribM)); r1.position.y = s * 0.42;
    const r2 = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, s * 0.86, s + 0.02), ribM)); r2.position.y = s * 0.42;
    for (const bx of [-0.05, 0.05]) { const bow = add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), ribM)); bow.position.set(bx, s * 0.9, 0); }
    g.rotation.y = rng() * Math.PI * 2;
  } else if (kind === 'duckling') {
    const yellow = toyMat(0xffd23f, 0.4);
    const body = add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), yellow));
    body.scale.set(1, 0.8, 1.25); body.position.y = 0.2;
    const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), yellow));
    head.position.set(0, 0.42, 0.18);
    const bill = add(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 8), toyMat(0xf4802a, 0.4)));
    bill.rotation.x = Math.PI / 2; bill.position.set(0, 0.4, 0.36);
    const tail = add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 8), yellow));
    tail.rotation.x = -Math.PI / 2.4; tail.position.set(0, 0.28, -0.28);
    for (const ex of [-0.07, 0.07]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), toyMat(0x222222, 0.3)); eye.position.set(ex, 0.46, 0.31); g.add(eye); }
    g.rotation.y = rng() * Math.PI * 2;
  } else { // ball
    const b = add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), toyMat(PASTELS[(rng() * PASTELS.length) | 0], 0.4)));
    b.position.y = 0.35;
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 8, 20), toyMat(0xf6f2e6, 0.4));
    stripe.rotation.x = Math.PI / 2 + rng();
    stripe.position.y = 0.35;
    g.add(stripe);
  }
  return g;
}

// terrain blockers: books and pillows (brief §10.2)
export function createObstacleMesh(kind, w, d, rngSeed) {
  let seed = rngSeed * 104729 + 7;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // generated book/pillow models stretch to the blocked footprint
  if (mapRegistry[kind]) {
    const g2 = new THREE.Group();
    const m = mapRegistry[kind].clone(true);
    const sx = w * 0.98, sz = d * 0.98;
    m.scale.set(sx, (sx + sz) / 2 * 0.8, sz);
    m.rotation.y = rng() < 0.5 ? 0 : Math.PI; // some variation without breaking footprint
    g2.add(m);
    // big pillow footprints read as mountains: pile a second and third
    // pillow on top, each smaller and askew
    if (kind === 'pillow' && Math.min(w, d) >= 3) {
      const mid = mapRegistry[kind].clone(true);
      mid.scale.set(sx * 0.72, (sx + sz) / 2 * 0.62, sz * 0.72);
      mid.position.y = (sx + sz) / 2 * 0.52;
      mid.rotation.y = 0.5 + rng() * 0.8;
      g2.add(mid);
      const top = mapRegistry[kind].clone(true);
      top.scale.set(sx * 0.45, (sx + sz) / 2 * 0.45, sz * 0.45);
      top.position.y = (sx + sz) / 2 * 0.95;
      top.rotation.y = rng() * Math.PI;
      g2.add(top);
    }
    return g2;
  }
  const g = new THREE.Group();
  if (kind === 'book') {
    const n = 2 + (rng() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(w * (0.85 + rng() * 0.15), 0.35, d * (0.85 + rng() * 0.15)),
        toyMat(PASTELS[rng() * PASTELS.length | 0], 0.7)
      );
      b.position.set((rng() - 0.5) * 0.3, 0.18 + i * 0.36, (rng() - 0.5) * 0.3);
      b.rotation.y = (rng() - 0.5) * 0.5;
      b.castShadow = true;
      g.add(b);
    }
  } else { // pillow
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      toyMat([0xe8d8f0, 0xf0e0d0, 0xd8e8f0][rng() * 3 | 0], 0.95)
    );
    p.scale.set(w * 0.55, 0.55, d * 0.55);
    p.position.y = 0.35;
    p.castShadow = true;
    g.add(p);
  }
  return g;
}

// Lost Sticker — capturable neutral objective (gold star that spins slowly)
// floating golden crown that marks the Regicide King
export function createKingCrown() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd94a, roughness: 0.25, metalness: 0.6, emissive: 0x8a6a00, emissiveIntensity: 0.4 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12, 1, true), gold);
  g.add(band);
  for (let i = 0; i < 6; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 5), gold);
    const a = (i / 6) * Math.PI * 2;
    spike.position.set(Math.cos(a) * 0.12, 0.08, Math.sin(a) * 0.12);
    g.add(spike);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), new THREE.MeshStandardMaterial({ color: 0xe5484d, roughness: 0.2 }));
    gem.position.set(Math.cos(a) * 0.12, 0.05, Math.sin(a) * 0.12);
    g.add(gem);
  }
  g.position.y = 0.92;
  g.userData.spin = true;
  return g;
}

// golden throne for King of the Hill — the contested center
export function createThroneView() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd94a, roughness: 0.3, metalness: 0.5, emissive: 0x8a6a00, emissiveIntensity: 0.35 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.7), gold);
  seat.position.y = 0.5; seat.castShadow = true; g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.14), gold);
  back.position.set(0, 0.9, -0.28); back.castShadow = true; g.add(back);
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.56), new THREE.MeshStandardMaterial({ color: 0xe5484d, roughness: 0.8 }));
  cushion.position.y = 0.63; g.add(cushion);
  for (const [sx, sz] of [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), gold);
    leg.position.set(sx, 0.25, sz); leg.castShadow = true; g.add(leg);
  }
  // three crown finials on the seat back
  for (const fx of [-0.22, 0, 0.22]) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), gold);
    spike.position.set(fx, 1.43, -0.28); g.add(spike);
  }
  const glow = flatRing(1.6, 2.0, 0xffd94a, 0.5);
  glow.position.y = 0.04;
  g.add(glow);
  let t = 0;
  return {
    group: g,
    setHolder(col) { glow.material.color.setHex(col ?? 0xffd94a); glow.material.opacity = col ? 0.85 : 0.5; },
    update(dt) { t += dt; g.children[0].position.y = 0.5 + Math.sin(t * 1.5) * 0.02; },
  };
}

// spilled milk: the bedroom's lake — an impassable puddle with the guilty glass
export function createMilkSpill(rx, rz, rngSeed = 1) {
  let seed = rngSeed * 31337 + 7;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const g = new THREE.Group();
  // irregular blob outline so it reads as a splash, not an ellipse
  const n = 18;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = 0.86 + rng() * 0.26;
    pts.push([Math.cos(a) * rx * w, Math.sin(a) * rz * w]);
  }
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < n; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  // creamy gloss, held above the mat's breeze-billow crest (~0.06)
  const milkMat = new THREE.MeshStandardMaterial({ color: 0xf8f4ea, roughness: 0.1 });
  const rim = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.5 }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.065;
  rim.scale.set(1.07, 1.07, 1);
  g.add(rim);
  const puddle = new THREE.Mesh(new THREE.ShapeGeometry(shape), milkMat);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.y = 0.07;
  g.add(puddle);
  // a few splash droplets around the rim
  for (let i = 0; i < 6; i++) {
    const a = rng() * Math.PI * 2;
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.09 + rng() * 0.09, 8, 6), milkMat);
    drop.scale.y = 0.35;
    drop.position.set(Math.cos(a) * (rx + 0.5 + rng()), 0.07, Math.sin(a) * (rz + 0.5 + rng()));
    g.add(drop);
  }
  // the tipped glass at the edge, milk still at its lip
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xd8e8f0, roughness: 0.06, transparent: true, opacity: 0.32, side: THREE.DoubleSide,
  });
  const glass = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.46, 1.7, 16, 1, true), glassMat);
  glass.add(tube);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.46, 16), glassMat);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -0.85;
  glass.add(bottom);
  const lip = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), milkMat);
  lip.rotation.x = -Math.PI / 2;
  lip.position.y = 0.7;
  glass.add(lip);
  glass.rotation.z = Math.PI / 2 - 0.04; // lying on its side, mouth toward the spill
  glass.position.set(-rx - 0.8, 0.56, (rng() - 0.5) * rz);
  glass.rotation.y = (rng() - 0.5) * 0.8;
  glass.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.add(glass);
  return g;
}

// wind-up mouse: the bedroom's version of a huntable sheep
export function createCritterView() {
  const g = new THREE.Group();
  const grey = toyMat(0x9a94a8, 0.7);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), grey);
  body.scale.set(0.85, 0.8, 1.25);
  body.position.y = 0.11;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), grey);
  head.position.set(0, 0.13, 0.15);
  head.castShadow = true;
  g.add(head);
  for (const sx of [-0.055, 0.055]) {
    const ear = new THREE.Mesh(new THREE.CircleGeometry(0.045, 8), toyMat(0xe8a8b8, 0.8));
    ear.position.set(sx, 0.21, 0.13);
    g.add(ear);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), toyMat(0xe86a8a, 0.5));
  nose.position.set(0, 0.12, 0.235);
  g.add(nose);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.006, 0.22, 6), toyMat(0xd8c8d0, 0.6));
  tail.rotation.x = 1.1;
  tail.position.set(0, 0.13, -0.2);
  g.add(tail);
  // the wind-up key spins as it scurries
  const key = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 6), toyMat(0xd8b84a, 0.35));
  stem.rotation.x = Math.PI / 2;
  key.add(stem);
  for (const sx of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.015), toyMat(0xd8b84a, 0.35));
    wing.position.set(sx * 0.05, 0, -0.04);
    key.add(wing);
  }
  key.position.set(0, 0.2, -0.06);
  g.add(key);
  let t = Math.random() * 9;
  const view = passiveView(g, 0.35);
  view.update = (dt) => {
    t += dt;
    key.rotation.z += dt * 6;
    tail.rotation.z = Math.sin(t * 5) * 0.4;
    body.position.y = 0.11 + Math.abs(Math.sin(t * 12)) * 0.015; // scurry hop
  };
  return view;
}

export function createStickerView() {
  const g = new THREE.Group();
  const star = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd94a, roughness: 0.25, metalness: 0.4, emissive: 0x8a6a00, emissiveIntensity: 0.35 });
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), mat);
    spike.rotation.z = Math.PI / 2 + (i / 5) * Math.PI * 2;
    spike.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.22, 0, Math.sin((i / 5) * Math.PI * 2) * 0.22);
    spike.rotation.y = -(i / 5) * Math.PI * 2;
    star.add(spike);
  }
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 10), mat);
  star.add(core);
  star.rotation.x = Math.PI / 2;
  star.position.y = 0.45;
  star.traverse((n) => { if (n.isMesh) n.castShadow = true; });
  g.add(star);
  const ring = flatRing(0.75, 0.9, 0xffd94a, 0.5);
  g.add(ring);
  let t = Math.random() * 9;
  return {
    group: g,
    ring,
    setHolder(color) { ring.material.color.setHex(color === null ? 0xffd94a : color); },
    setSelected() {}, markDamaged() {},
    hpBar: { set() {}, sprite: null },
    update(dt) {
      t += dt;
      star.rotation.z = t * 0.8;
      star.position.y = 0.45 + Math.sin(t * 1.6) * 0.06;
    },
  };
}

// rally-point flag: shown at the gather point of a selected production building
export function createRallyFlag() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), toyMat(0xddd6c0));
  pole.position.y = 0.55;
  g.add(pole);
  const pennant = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.5, 3),
    new THREE.MeshStandardMaterial({ color: TEAM_COLORS[0], roughness: 0.6, side: THREE.DoubleSide })
  );
  pennant.rotation.z = -Math.PI / 2;
  pennant.position.set(0.26, 0.95, 0);
  g.add(pennant);
  const ring = flatRing(0.3, 0.4, TEAM_COLORS[0], 0.7);
  g.add(ring);
  g.visible = false;
  let t = 0;
  return {
    group: g,
    update(dt) {
      if (!g.visible) return;
      t += dt;
      pennant.rotation.x = Math.sin(t * 4) * 0.18;   // waving in the night breeze
      g.position.y = Math.sin(t * 2.4) * 0.02;
    },
    show(x, z) {
      g.position.set(x, 0, z);
      g.visible = true;
    },
    hide() { g.visible = false; },
  };
}

// right-click destination marker
export function createMoveMarker() {
  const m = flatRing(0.25, 0.34, 0x66ff88, 0.9);
  m.visible = false;
  let t = 0;
  return {
    mesh: m,
    ping(x, z, color = 0x66ff88) {
      m.material.color.setHex(color);
      m.position.set(x, 0.03, z);
      m.visible = true;
      t = 0.6;
    },
    update(dt) {
      if (!m.visible) return;
      t -= dt;
      const f = Math.max(0.01, t / 0.6);
      m.scale.setScalar(0.6 + (1 - f) * 1.2);
      m.material.opacity = f;
      if (t <= 0) m.visible = false;
    },
  };
}
