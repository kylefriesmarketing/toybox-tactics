// ============================================================
// TOYBOX TACTICS — VFX: pooled particles, shaped toy debris,
// sticker splats and ambient dust. All code-generated.
// Toys don't bleed — they shed bricks, buttons, limbs and fluff.
// ============================================================

import * as THREE from 'three';
import { mergeGeometries } from '../assets/lib/jsm/utils/BufferGeometryUtils.js';

const VERT = `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (240.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;
    float soft = smoothstep(0.5, 0.15, r);
    gl_FragColor = vec4(vColor, vAlpha * soft);
  }
`;

class ParticlePool {
  constructor(scene, capacity, blending) {
    this.cap = capacity;
    this.n = 0;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.life0 = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 900;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, life, size, color, grav = 0, drag = 0) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const c = new THREE.Color(color);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.life[i] = this.life0[i] = life;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const last = --this.n;
        if (i !== last) {
          for (let k = 0; k < 3; k++) {
            this.pos[i * 3 + k] = this.pos[last * 3 + k];
            this.vel[i * 3 + k] = this.vel[last * 3 + k];
            this.col[i * 3 + k] = this.col[last * 3 + k];
          }
          this.size[i] = this.size[last];
          this.life[i] = this.life[last];
          this.life0[i] = this.life0[last];
          this.grav[i] = this.grav[last];
          this.drag[i] = this.drag[last];
        }
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) this.pos[i * 3 + 1] = 0.02;
      this.alpha[i] = Math.min(1, this.life[i] / (this.life0[i] * 0.6));
      i++;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }
}

// ---------------- shaped toy debris ----------------
// Multiple instanced pools, one per shape, so army men shed green plastic
// limbs, buildings shed studded bricks and archers scatter buttons.

function buildShapes() {
  const brick = (() => {
    const body = new THREE.BoxGeometry(0.16, 0.09, 0.1);
    const stud1 = new THREE.CylinderGeometry(0.028, 0.028, 0.03, 8).translate(-0.04, 0.06, 0);
    const stud2 = new THREE.CylinderGeometry(0.028, 0.028, 0.03, 8).translate(0.04, 0.06, 0);
    return mergeGeometries([body, stud1, stud2]);
  })();
  return {
    cube: new THREE.BoxGeometry(0.1, 0.1, 0.1),
    brick,                                                       // studded toy brick
    disc: new THREE.CylinderGeometry(0.07, 0.07, 0.028, 10),     // buttons / wheels
    stick: new THREE.BoxGeometry(0.24, 0.035, 0.05),             // craft sticks / pins
    peg: new THREE.CylinderGeometry(0.035, 0.035, 0.13, 8),      // pegs / spear shafts
    limb: new THREE.CapsuleGeometry(0.03, 0.1, 3, 6),            // toy figure arms/legs
  };
}

class PiecePool {
  constructor(scene, capPerShape = 64) {
    this.pools = {};
    const shapes = buildShapes();
    for (const [name, geo] of Object.entries(shapes)) {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.55 });
      const mesh = new THREE.InstancedMesh(geo, mat, capPerShape);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.pools[name] = { mesh, data: [], n: 0, cap: capPerShape };
    }
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
  }
  spawn(shape, x, y, z, color, { speed = 2.2, life = 1.6, scale = 1 } = {}) {
    const p = this.pools[shape] || this.pools.cube;
    if (p.n >= p.cap) return;
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.5 + Math.random() * 0.8);
    p.data[p.n] = {
      px: x, py: y + Math.random() * 0.2, pz: z,
      vx: Math.cos(a) * s, vy: 1.6 + Math.random() * 2.2, vz: Math.sin(a) * s,
      rx: Math.random() * 3, ry: Math.random() * 3, rz: Math.random() * 3,
      wx: (Math.random() - 0.5) * 14, wy: (Math.random() - 0.5) * 14, wz: (Math.random() - 0.5) * 14,
      life: life * (0.8 + Math.random() * 0.4), life0: life, scale: scale * (0.75 + Math.random() * 0.6),
    };
    this.color.setHex(color).offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.12);
    p.mesh.setColorAt(p.n, this.color);
    if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    p.n++;
  }
  update(dt) {
    for (const p of Object.values(this.pools)) {
      let i = 0;
      while (i < p.n) {
        const d = p.data[i];
        d.life -= dt;
        if (d.life <= 0) {
          const last = --p.n;
          if (i !== last) {
            p.data[i] = p.data[last];
            p.mesh.getColorAt(last, this.color);
            p.mesh.setColorAt(i, this.color);
          }
          continue;
        }
        d.vy -= 9 * dt;
        d.px += d.vx * dt; d.py += d.vy * dt; d.pz += d.vz * dt;
        if (d.py < 0.05 && d.vy < 0) {
          d.py = 0.05; d.vy *= -0.4; d.vx *= 0.6; d.vz *= 0.6;
          d.wx *= 0.5; d.wy *= 0.5; d.wz *= 0.5;
        }
        d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt;
        const fade = Math.min(1, d.life / (d.life0 * 0.25));
        this.dummy.position.set(d.px, d.py, d.pz);
        this.dummy.rotation.set(d.rx, d.ry, d.rz);
        this.dummy.scale.setScalar(d.scale * fade);
        this.dummy.updateMatrix();
        p.mesh.setMatrixAt(i, this.dummy.matrix);
        i++;
      }
      p.mesh.count = p.n;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }
}

// battlefield litter: pieces that stay where toys fell, fading after ~50s.
// No physics — placed at rest, so big caps cost almost nothing.
class LitterPool {
  constructor(scene, capPerShape = 96) {
    this.pools = {};
    const shapes = buildShapes();
    for (const name of ['brick', 'disc', 'limb', 'stick', 'cube']) {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
      const mesh = new THREE.InstancedMesh(shapes[name], mat, capPerShape);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.pools[name] = { mesh, data: [], n: 0, cap: capPerShape };
    }
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
  }
  drop(shape, x, z, color) {
    const p = this.pools[shape] || this.pools.cube;
    if (p.n >= p.cap) {
      // pool full: recycle the oldest piece
      p.data.shift();
      p.n--;
    }
    this.color.setHex(color).offsetHSL(0, -0.05, -0.06); // slightly duller at rest
    p.data[p.n] = {
      px: x + rand(-0.5, 0.5), pz: z + rand(-0.5, 0.5),
      ry: Math.random() * Math.PI * 2,
      rz: Math.random() < 0.6 ? 0 : Math.PI / 2, // some pieces on their side
      life: rand(42, 58), scale: 0.8 + Math.random() * 0.4,
      color: this.color.getHex(),
    };
    p.n++;
    this.rebuild(p);
  }
  rebuild(p) {
    for (let i = 0; i < p.n; i++) {
      const d = p.data[i];
      const fade = Math.min(1, d.life / 8);
      this.dummy.position.set(d.px, 0.045 * fade, d.pz);
      this.dummy.rotation.set(0, d.ry, d.rz);
      this.dummy.scale.setScalar(d.scale * fade);
      this.dummy.updateMatrix();
      p.mesh.setMatrixAt(i, this.dummy.matrix);
      p.mesh.setColorAt(i, this.color.setHex(d.color));
    }
    p.mesh.count = p.n;
    p.mesh.instanceMatrix.needsUpdate = true;
    if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    for (const p of Object.values(this.pools)) {
      if (!p.n) continue;
      let dirty = false;
      let i = 0;
      while (i < p.n) {
        const d = p.data[i];
        d.life -= dt;
        if (d.life <= 0) {
          p.data.splice(i, 1);
          p.n--;
          dirty = true;
          continue;
        }
        if (d.life < 8) dirty = true; // fading out
        i++;
      }
      if (dirty) this.rebuild(p);
    }
  }
}

// flat fading decals (catapult sticker splats, scorch rings)
class SplatPool {
  constructor(scene, cap = 14) {
    this.items = [];
    for (let i = 0; i < cap; i++) {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 14),
        new THREE.MeshBasicMaterial({ color: 0xf3722c, transparent: true, opacity: 0, depthWrite: false })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.03;
      mesh.renderOrder = 400;
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({ mesh, t: 0, dur: 1 });
    }
    this.next = 0;
  }
  splat(x, z, radius, color) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    it.mesh.visible = true;
    it.mesh.position.set(x, 0.03 + this.next * 0.0004, z); // avoid z-fighting between splats
    it.mesh.rotation.z = Math.random() * Math.PI * 2;
    it.mesh.scale.setScalar(radius);
    it.mesh.material.color.setHex(color);
    it.t = it.dur = 9;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.mesh.visible) continue;
      it.t -= dt;
      if (it.t <= 0) { it.mesh.visible = false; continue; }
      it.mesh.material.opacity = 0.5 * Math.min(1, it.t / (it.dur * 0.5));
    }
  }
}

const CONFETTI = [0xf94144, 0xf3722c, 0xf9c74f, 0x90be6d, 0x4d9bff, 0x9b5de5, 0xff8fd0];
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export class VFX {
  constructor(scene) {
    this.sparks = new ParticlePool(scene, 1600, THREE.AdditiveBlending);
    this.dust = new ParticlePool(scene, 900, THREE.NormalBlending);
    this.pieces = new PiecePool(scene, 72);
    this.litter = new LitterPool(scene, 96);
    this.splats = new SplatPool(scene, 14);
    this.moteT = 0;
  }
  update(dt) {
    this.sparks.update(dt);
    this.dust.update(dt);
    this.pieces.update(dt);
    this.litter.update(dt);
    this.splats.update(dt);
  }

  // combat hit at a point (color hints attack type) + the odd chipped piece
  hit(x, y, z, color = 0xffe28a, count = 6) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sparks.spawn(x, y + rand(0, 0.2), z,
        Math.cos(a) * rand(0.6, 2.2), rand(0.6, 2.4), Math.sin(a) * rand(0.6, 2.2),
        rand(0.2, 0.45), rand(0.1, 0.2), color, 5, 2);
    }
  }
  // chip a piece off whatever got hit (throttled by caller)
  chip(x, y, z, debris) {
    const shapes = (debris && debris.shapes) || ['cube'];
    const colors = (debris && debris.colors) || [0xc9a86a];
    this.pieces.spawn(pick(shapes), x, y, z, pick(colors), { speed: 1.4, life: 0.9, scale: 0.7 });
  }

  // unit death: material-true toy pieces, no blood in the toybox
  death(x, z, debris) {
    const shapes = (debris && debris.shapes) || ['cube'];
    const colors = (debris && debris.colors) || [0xcfc8e8];
    const count = (debris && debris.count) || 7;
    for (let i = 0; i < count; i++) {
      this.pieces.spawn(pick(shapes), x, 0.3, z, pick(colors), { speed: 1.9, life: rand(1.2, 2.0) });
    }
    if (debris && debris.fluff) {
      this.puff(x, 0.3, z, 0xf4eef8, 12, 0.5); // pillows burst into fluff
    } else {
      this.puff(x, 0.25, z, 0xcfc8e8, 4);
    }
    // a couple of pieces stay behind — the battlefield remembers
    for (let i = 0; i < 2; i++) this.litter.drop(pick(shapes), x, z, pick(colors));
    // little pop ring
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.sparks.spawn(x, 0.12, z, Math.cos(a) * 1.8, 0.3, Math.sin(a) * 1.8, 0.3, 0.1, 0xffffff, 0, 4);
    }
  }

  buildingDeath(x, z, size, debris) {
    const shapes = (debris && debris.shapes) || ['brick', 'brick', 'cube'];
    const colors = (debris && debris.colors) || CONFETTI;
    const n = Math.min(22, 8 + size * 3);
    for (let i = 0; i < n; i++) {
      this.pieces.spawn(pick(shapes),
        x + rand(-size / 3, size / 3), rand(0.2, 0.8), z + rand(-size / 3, size / 3),
        pick(colors), { speed: 2.6, life: rand(1.4, 2.4) });
    }
    // lingering rubble that settles and slowly fades
    for (let i = 0; i < Math.min(10, 4 + size * 2); i++) {
      this.pieces.spawn(pick(shapes),
        x + rand(-size / 3, size / 3), 0.15, z + rand(-size / 3, size / 3),
        pick(colors), { speed: 0.7, life: rand(6, 9) });
    }
    this.puff(x, 0.4, z, 0xb8b0a0, 14, size * 0.35);
    this.hit(x, 0.5, z, 0xffc46a, 12);
    // ruins linger where the building stood
    for (let i = 0; i < Math.min(6, 2 + size); i++) {
      this.litter.drop(pick(shapes), x + rand(-size / 3, size / 3), z + rand(-size / 3, size / 3), pick(colors));
    }
  }

  // catapult splash impact: bang + a sticker left on the playmat
  explosion(x, z, radius) {
    this.hit(x, 0.25, z, 0xffb14d, 16);
    this.puff(x, 0.3, z, 0xd8c8a8, 10, radius * 0.4);
    for (let i = 0; i < 5; i++) this.pieces.spawn('stick', x, 0.2, z, 0xf3722c, { speed: 2.4, life: 1.2 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.sparks.spawn(x, 0.12, z, Math.cos(a) * radius * 2.2, 0.4, Math.sin(a) * radius * 2.2,
        0.35, 0.14, 0xffdf9a, 0, 4);
    }
    this.splats.splat(x, z, radius * 0.8, pick([0xf3722c, 0xf94144, 0xf9c74f]));
  }

  // muzzle flash when a ranged toy or tower fires
  muzzle(x, y, z, color) {
    for (let i = 0; i < 3; i++) {
      this.sparks.spawn(x, y, z, rand(-0.6, 0.6), rand(0.4, 1.0), rand(-0.6, 0.6),
        0.16, 0.14, color, 0, 4);
    }
  }

  puff(x, y, z, color = 0xcfc8e8, count = 5, spread = 0.25) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      this.dust.spawn(x + Math.cos(a) * spread * Math.random(), y + rand(0, 0.2), z + Math.sin(a) * spread * Math.random(),
        Math.cos(a) * rand(0.2, 0.7), rand(0.4, 1.0), Math.sin(a) * rand(0.2, 0.7),
        rand(0.5, 1.0), rand(0.28, 0.5), color, -0.3, 2.5);
    }
  }

  smoke(x, y, z) {
    this.dust.spawn(x + rand(-0.2, 0.2), y, z + rand(-0.2, 0.2),
      rand(-0.15, 0.15), rand(0.7, 1.2), rand(-0.15, 0.15),
      rand(1.2, 2.0), rand(0.35, 0.6), 0x4a4458, -0.25, 1.2);
  }

  gather(x, y, z, color) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sparks.spawn(x, y + 0.15, z,
        Math.cos(a) * rand(0.4, 1.1), rand(1.0, 1.9), Math.sin(a) * rand(0.4, 1.1),
        rand(0.3, 0.5), 0.1, color, 6, 1);
    }
  }
  buildDust(x, z) {
    this.dust.spawn(x + rand(-0.5, 0.5), 0.1, z + rand(-0.5, 0.5),
      rand(-0.2, 0.2), rand(0.5, 0.9), rand(-0.2, 0.2),
      rand(0.4, 0.8), rand(0.25, 0.4), 0xd9cba8, -0.2, 2);
  }

  // wheel dust kicked up by fast vehicles
  wheelDust(x, z) {
    this.dust.spawn(x + rand(-0.15, 0.15), 0.06, z + rand(-0.15, 0.15),
      rand(-0.3, 0.3), rand(0.3, 0.6), rand(-0.3, 0.3),
      rand(0.3, 0.6), rand(0.16, 0.28), 0xcfc4a8, -0.1, 2.5);
  }

  spawnPop(x, z, color) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.sparks.spawn(x, 0.1, z, Math.cos(a) * 1.6, 0.9, Math.sin(a) * 1.6,
        0.4, 0.12, color, 2, 3);
    }
  }

  confetti(x, z) {
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sparks.spawn(x + rand(-1, 1), 0.3, z + rand(-1, 1),
        Math.cos(a) * rand(0.5, 2.5), rand(3.5, 7), Math.sin(a) * rand(0.5, 2.5),
        rand(1.2, 2.2), rand(0.12, 0.22), pick(CONFETTI), 6, 0.8);
    }
  }

  trail(x, y, z, color) {
    this.sparks.spawn(x, y, z, rand(-0.2, 0.2), rand(-0.1, 0.2), rand(-0.2, 0.2),
      rand(0.18, 0.3), 0.09, color, 0, 3);
  }

  // gentle green sparkles over a toy being patched up
  heal(x, z) {
    for (let i = 0; i < 3; i++) {
      this.sparks.spawn(x + rand(-0.25, 0.25), rand(0.2, 0.6), z + rand(-0.25, 0.25),
        0, rand(0.5, 0.9), 0, rand(0.4, 0.7), 0.11, 0x7ce87c, -0.6, 1);
    }
  }

  deposit(x, z, color) {
    for (let i = 0; i < 4; i++) {
      this.sparks.spawn(x + rand(-0.3, 0.3), rand(0.5, 1.0), z + rand(-0.3, 0.3),
        0, rand(0.5, 1.1), 0, rand(0.3, 0.55), 0.11, color, -1, 1);
    }
  }

  // drifting dust motes in the lamp light near the camera
  ambient(cx, cz, dt) {
    this.moteT -= dt;
    if (this.moteT > 0) return;
    this.moteT = 0.22;
    this.dust.spawn(cx + rand(-13, 13), rand(1.5, 5), cz + rand(-9, 9),
      rand(-0.08, 0.08), rand(-0.06, 0.02), rand(-0.08, 0.08),
      rand(3, 6), rand(0.05, 0.1), 0xfff2dd, 0, 0);
  }
}
