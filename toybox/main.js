// ============================================================
// TOYBOX TACTICS — bootstrap: renderer, camera, input, menu, loop.
// ============================================================

import * as THREE from 'three';
import { MAP_N, UNITS, BUILDINGS, MAPS, FACTIONS, TECHS, GAME_MODES, generateRandomMap } from './data.js';
import {
  loadUnitModels, loadBuildingModels, loadMapModels, setBuildingFootprints,
  createGhostMesh, createMoveMarker, createLamp, renderPortraits,
} from './models.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { VFX } from './vfx.js';
import { SFX } from './sfx.js';
import { Net, TICK, INPUT_DELAY } from './net.js';

const N = MAP_N;
const $ = (id) => document.getElementById(id);

// ---------------- three.js setup ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('view').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1430);
scene.fog = new THREE.Fog(0x1a1430, 60, 140);

const hemi = new THREE.HemisphereLight(0xfff2dd, 0x3a3560, 0.75);
scene.add(hemi);
const lamp = new THREE.DirectionalLight(0xffdfae, 1.6);
lamp.position.set(-30, 42, -18);
lamp.castShadow = true;
lamp.shadow.mapSize.set(2048, 2048);
lamp.shadow.camera.left = -48; lamp.shadow.camera.right = 48;
lamp.shadow.camera.top = 48; lamp.shadow.camera.bottom = -48;
lamp.shadow.camera.far = 130;
lamp.shadow.bias = -0.0005;
scene.add(lamp);
const moon = new THREE.DirectionalLight(0x7fa0ff, 0.35);
moon.position.set(35, 25, 30);
scene.add(moon);
const lampProp = createLamp(N);
scene.add(lampProp.group);

// environment map: a tiny abstract "bedroom" (warm lamp, cool window, green
// floor) baked with PMREM — gives plastic soft reflections instead of
// gemstone glints
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(20, 12, 20),
    new THREE.MeshBasicMaterial({ color: 0x271f47, side: THREE.BackSide })
  );
  room.position.y = 5;
  env.add(room);
  const lampBall = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffdfae }));
  lampBall.position.set(-6, 8, -4);
  env.add(lampBall);
  const moonPanel = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), new THREE.MeshBasicMaterial({ color: 0x6f90e8 }));
  moonPanel.position.set(8, 6, 7);
  moonPanel.lookAt(0, 4, 0);
  env.add(moonPanel);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: 0x5c8f46 }));
  floor.rotation.x = -Math.PI / 2;
  env.add(floor);
  scene.environment = pmrem.fromScene(env, 0.06).texture;
  pmrem.dispose();
}

// RTS camera rig with smoothing
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.5, 500);
const cam = { x: 0, z: 0, dist: 24, tx: 0, tz: 0, tdist: 24, shake: 0 };
const shakeCam = (amt) => { cam.shake = Math.min(0.9, cam.shake + amt); };
const fogBase = { near: 60, far: 140 };
function clampCam() {
  cam.tdist = Math.max(4, Math.min(90, cam.tdist));
  const half = N / 2 + 6;
  cam.tx = Math.max(-half, Math.min(half, cam.tx));
  cam.tz = Math.max(-half, Math.min(half, cam.tz));
}
function applyCamera(dt = 1) {
  const k = Math.min(1, dt * 10);
  cam.x += (cam.tx - cam.x) * k;
  cam.z += (cam.tz - cam.z) * k;
  cam.dist += (cam.tdist - cam.dist) * k;
  // cinematic tilt: low over-the-shoulder angle up close, top-down when high
  const t = Math.min(1, Math.max(0, (cam.dist - 4) / 26));
  const hf = 0.52 + (0.92 - 0.52) * t;
  const zf = 0.88 + (0.62 - 0.88) * t;
  const sh = cam.shake;
  const jx = sh ? (Math.random() - 0.5) * sh * 2.4 : 0;
  const jz = sh ? (Math.random() - 0.5) * sh * 2.4 : 0;
  camera.position.set(cam.x + jx, cam.dist * hf, cam.z + cam.dist * zf + jz);
  camera.lookAt(cam.x + jx * 0.4, 0, cam.z + jz * 0.4);
  if (sh) { cam.shake *= Math.max(0, 1 - dt * 7); if (cam.shake < 0.01) cam.shake = 0; }
  // fog backs off as the camera rises so max zoom stays clear
  const extra = Math.max(0, cam.dist - 24);
  scene.fog.near = fogBase.near + extra * 2.2;
  scene.fog.far = fogBase.far + extra * 3.4;
}
applyCamera();

function fitViewport() {
  if (!innerWidth || !innerHeight) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', fitViewport);
document.addEventListener('visibilitychange', () => { if (!document.hidden) fitViewport(); });

const ndc = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
function groundPoint(clientX, clientY) {
  if (!innerWidth || !innerHeight) return null;
  ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  // hilly terrain: intersect the real displaced mat first, so clicking a
  // plateau selects the point ON the plateau instead of behind it
  const mat = scene.getObjectByName('playmat-ground');
  if (mat) {
    const hits = raycaster.intersectObject(mat, false);
    if (hits.length) return { x: hits[0].point.x, z: hits[0].point.z };
  }
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  if (Math.abs(d.y) < 1e-6) return null;
  const t = -o.y / d.y;
  if (t < 0) return null;
  return { x: o.x + d.x * t, z: o.z + d.z * t };
}

// ---------------- boot: load models, show menu, start on click ----------------
let game = null, ui = null, marker = null, vfx = null;
const sfx = new SFX();
let registryCache = null, failuresCache = [];

async function boot() {
  const bar = $('loadbar-fill'), text = $('loadtext');
  const { registry, failures } = await loadUnitModels((done, total, label) => {
    bar.style.width = `${(done / total) * 100}%`;
    text.textContent = `Waking up the toys… ${label} (${done}/${total})`;
  });
  registryCache = registry;
  failuresCache = failures;
  // generated building models are optional — missing files fall back silently
  setBuildingFootprints(Object.fromEntries(Object.entries(BUILDINGS).map(([k, d]) => [k, d.size])));
  await loadBuildingModels([...Object.keys(BUILDINGS), 'pentower'], (done, total) => {
    text.textContent = `Arranging the furniture… (${done}/${total})`;
  });
  await loadMapModels((done, total) => {
    text.textContent = `Scattering the snacks… (${done}/${total})`;
  });
  text.textContent = 'Painting portraits…';
  renderPortraits(registry);
  $('loading').classList.add('hide');
  setTimeout(() => $('loading').remove(), 700);
  $('menu').classList.add('show');
  offerResume();
  applySettings();
  // first-timers get a gentle nudge toward the tutorial
  if (!localStorage.getItem('tt-seen')) {
    const hint = document.createElement('div');
    hint.className = 'menu-help';
    hint.style.cssText = 'color:#ffd97a;margin-top:2px';
    hint.textContent = '👋 New here? Try “How to Play” below for a quick 60-second tutorial.';
    const card = $('menu-card');
    if (card) card.insertBefore(hint, card.firstChild);
  }
  // ?start=easy|normal|hard skips the menu; &ff=SECONDS fast-forwards the sim
  const params = new URLSearchParams(location.search);
  if (params.has('tutorial')) {
    const l = $('loading'); if (l) l.remove();
    const m = $('menu'); if (m) m.remove();
    startTutorial();
    return;
  }
  if (params.has('load')) {
    const ok = resumeSavedGame();
    if (ok) return;
  }
  if (params.has('start')) {
    const l = $('loading');
    if (l) l.remove();
    const m = $('menu');
    if (m) m.remove();
    if (params.get('size') === '2v2') chosenSize = '2v2';
    if (params.get('mode') && GAME_MODES[params.get('mode')]) chosenMode = params.get('mode');
    if (params.get('sr')) chosenStartRes = params.get('sr');
    startGame(params.get('start') || 'normal', params.get('map') || undefined);
    const ff = parseInt(params.get('ff') || '0', 10);
    if (ff > 0 && game) {
      const chest = game.entities.find((e) => e.type === 'chest' && e.owner === 0);
      const ws = game.entities.filter((e) => e.owner === 0 && e.type === 'worker');
      game.cmdGather(ws, game.nearestNode('snacks', chest.x, chest.z, 40));
      // give the demo base something to look at: house + mat + a short wall
      const place = (type, near) => {
        for (let r = 3; r < 14; r++) for (let a = 0; a < 14; a++) {
          const ang = a / 14 * Math.PI * 2;
          const i = Math.round(chest.ti + 2 + Math.cos(ang) * (near + r));
          const j = Math.round(chest.tj + 2 + Math.sin(ang) * (near + r));
          if (game.canPlace(0, type, i, j)) return game.addBuilding(type, 0, i, j, true);
        }
        return null;
      };
      place('house', 3); place('house', 5); place('mat', 4); place('farm', 3);
      for (let i = 0; i < ff * 10; i++) game.update(0.1);
    }
  }
}

// ---------------- tech tree (T) ----------------
function toggleTechTree(force) {
  const el = $('techtree');
  if (!el || !game || !ui) return;
  const show = force !== undefined ? force : !el.classList.contains('show');
  if (show) ui.buildTechTree();
  el.classList.toggle('show', show);
}

// ---------------- in-game menu (ESC) ----------------
let gamePaused = false;

function toggleGameMenu(force) {
  const el = $('gamemenu');
  if (!el || !game) return;
  const show = force !== undefined ? force : !el.classList.contains('show');
  el.classList.toggle('show', show);
  // pausing is a solo luxury — lockstep keeps ticking in multiplayer
  gamePaused = show && !net;
  const note = $('gm-note');
  if (note) note.textContent = net ? 'Multiplayer keeps running while this is open!' : 'Game paused.';
  const saveBtn = $('gm-save');
  if (saveBtn) saveBtn.style.display = net ? 'none' : '';
}

// ---------------- save / load (single-player) ----------------
const SAVE_KEY = 'tt-save';

function saveGame() {
  if (!game || net || game.over) return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.snapshot()));
    ui && ui.alert('Game saved. Resume it any time from the menu (or F7).', 'info');
    return true;
  } catch (e) {
    ui && ui.alert('Save failed — storage may be full.', 'warn');
    console.warn('[save]', e);
    return false;
  }
}

function resumeSavedGame() {
  let snap;
  try { snap = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { snap = null; }
  if (!snap || (snap.v !== 1 && snap.v !== 2)) return false;
  const l = $('loading'); if (l) l.remove();
  const m = $('menu'); if (m) m.remove();
  startGame(snap.opts.difficulty, snap.opts.map, null, snap);
  return true;
}

// the menu grows a Resume button whenever a save exists
function offerResume() {
  if (!localStorage.getItem(SAVE_KEY)) return;
  const startBtn = $('start-btn');
  if (!startBtn || $('resume-btn')) return;
  const b = document.createElement('button');
  b.id = 'resume-btn';
  b.className = 'diff-btn';
  b.textContent = '💾 Resume saved battle';
  b.addEventListener('click', () => resumeSavedGame());
  startBtn.insertAdjacentElement('afterend', b);
}

// tech tree buttons
$('tech-btn').addEventListener('click', () => toggleTechTree());
$('tt-close').addEventListener('click', () => toggleTechTree(false));

// ---------------- settings (persisted) ----------------
const settings = Object.assign(
  { vol: 50, music: true, sfx: true, edge: true },
  JSON.parse(localStorage.getItem('tt-settings') || '{}')
);
function saveSettings() { localStorage.setItem('tt-settings', JSON.stringify(settings)); }
function applySettings() {
  sfx.setVolume(settings.vol / 100);
  sfx.setMusicEnabled(settings.music);
  sfx.setSfxEnabled(settings.sfx);
  const gv = $('gm-vol'); if (gv) gv.value = settings.vol;
  const tv = $('vol'); if (tv) tv.value = settings.vol;
  const setTog = (id, on) => { const b = $(id); if (b) { b.textContent = on ? 'On' : 'Off'; b.classList.toggle('off', !on); } };
  setTog('gm-music', settings.music);
  setTog('gm-sfx', settings.sfx);
  setTog('gm-edge', settings.edge);
}

// in-game menu buttons
$('gm-resume').addEventListener('click', () => toggleGameMenu(false));
$('gm-save').addEventListener('click', () => { saveGame(); toggleGameMenu(false); });
$('gm-quit').addEventListener('click', () => { location.href = location.pathname; });
$('gm-help').addEventListener('click', () => { location.href = location.pathname + '?tutorial=1'; });
$('gm-vol').addEventListener('input', (e) => {
  settings.vol = +e.target.value; sfx.setVolume(settings.vol / 100);
  const tv = $('vol'); if (tv) tv.value = settings.vol; saveSettings();
});
$('gm-music').addEventListener('click', () => { settings.music = !settings.music; sfx.setMusicEnabled(settings.music); applySettings(); saveSettings(); });
$('gm-sfx').addEventListener('click', () => { settings.sfx = !settings.sfx; sfx.setSfxEnabled(settings.sfx); applySettings(); saveSettings(); });
$('gm-edge').addEventListener('click', () => { settings.edge = !settings.edge; applySettings(); saveSettings(); });
$('gm-speed').addEventListener('input', (e) => {
  const s = +e.target.value / 100; setSpeed(s);
  $('gm-speedval').textContent = s.toFixed(1) + '×';
});

// sound controls live outside the game so they work from the menu onward
$('mute-btn').addEventListener('click', () => {
  sfx.init(); // clicking sound controls is a gesture — safe to unlock audio
  sfx.setMuted(!sfx.muted);
  $('mute-btn').textContent = sfx.muted ? '🔇' : '🔊';
});
$('vol').addEventListener('input', (e) => {
  sfx.init();
  sfx.setVolume(e.target.value / 100);
  if (sfx.muted && e.target.value > 0) {
    sfx.setMuted(false);
    $('mute-btn').textContent = '🔊';
  }
});

// scope to #diff-row: .diff-btn is shared as a style class by faction/map/mp
// buttons, and a global handler both cleared their highlights and clobbered
// chosenDiff with undefined
let chosenDiff = 'normal';
for (const btn of document.querySelectorAll('#diff-row .diff-btn')) {
  btn.addEventListener('click', () => {
    chosenDiff = btn.dataset.diff;
    document.querySelectorAll('#diff-row .diff-btn').forEach((b) => b.classList.toggle('sel', b === btn));
  });
}
let chosenSize = '1v1';
for (const btn of document.querySelectorAll('#size-row .size-btn')) {
  btn.addEventListener('click', () => {
    chosenSize = btn.dataset.size;
    document.querySelectorAll('#size-row .size-btn').forEach((b) => b.classList.toggle('sel', b === btn));
  });
}
let chosenMode = 'standard';
for (const btn of document.querySelectorAll('#mode-row .mode-btn')) {
  btn.addEventListener('click', () => {
    chosenMode = btn.dataset.mode;
    document.querySelectorAll('#mode-row .mode-btn').forEach((b) => b.classList.toggle('sel', b === btn));
    const d = $('mode-desc');
    if (d) d.textContent = GAME_MODES[chosenMode].desc;
  });
}
let chosenStartRes = 'standard';
for (const btn of document.querySelectorAll('#startres-row .startres-btn')) {
  btn.addEventListener('click', () => {
    chosenStartRes = btn.dataset.sr;
    document.querySelectorAll('#startres-row .startres-btn').forEach((b) => b.classList.toggle('sel', b === btn));
  });
}
let chosenMap = 'playmat';
// random-map settings (only used when chosenMap === 'random')
const rndOpts = { size: 'medium', resources: 'standard', water: 'some' };
let rndSeed = (Math.random() * 1e6) | 0;
function refreshRandomDesc() {
  const d = document.getElementById('map-desc');
  if (d) d.textContent = generateRandomMap(rndSeed, rndOpts).desc;
}
for (const btn of document.querySelectorAll('.map-btn')) {
  btn.addEventListener('click', () => {
    chosenMap = btn.dataset.map;
    document.querySelectorAll('.map-btn').forEach((b) => b.classList.toggle('sel', b === btn));
    const isRandom = chosenMap === 'random';
    const rr = document.getElementById('random-row');
    if (rr) rr.style.display = isRandom ? 'flex' : 'none';
    if (isRandom) refreshRandomDesc();
    else { const d = document.getElementById('map-desc'); if (d) d.textContent = MAPS[chosenMap].desc; }
  });
}
// random-map option buttons (size / resources / water)
for (const btn of document.querySelectorAll('.rnd-btn')) {
  btn.addEventListener('click', () => {
    const key = btn.dataset.rnd;
    rndOpts[key] = btn.dataset.val;
    document.querySelectorAll(`.rnd-btn[data-rnd="${key}"]`).forEach((b) => b.classList.toggle('sel', b === btn));
    refreshRandomDesc();
  });
}
{
  const seedInput = document.getElementById('rnd-seed');
  if (seedInput) {
    seedInput.value = String(rndSeed);
    seedInput.addEventListener('input', () => {
      const v = parseInt(seedInput.value.replace(/\D/g, ''), 10);
      rndSeed = Number.isFinite(v) ? v : 0;
      refreshRandomDesc();
    });
  }
  const reroll = document.getElementById('rnd-reroll');
  if (reroll) reroll.addEventListener('click', () => {
    rndSeed = (Math.random() * 1e6) | 0;
    if (seedInput) seedInput.value = String(rndSeed);
    refreshRandomDesc();
  });
}
let chosenFaction = 'classic';
// rich civ card: surfaces each civ's bonus + unique unit + unique building + unique tech
function renderCivPanel(facKey) {
  const panel = document.getElementById('civ-panel');
  if (!panel) return;
  const f = FACTIONS[facKey] || FACTIONS.classic;
  const uniqueUnits = Object.values(UNITS).filter((u) => u.faction === facKey);
  const signature = uniqueUnits.find((u) => u.age === 3) || uniqueUnits[0];
  const bld = Object.values(BUILDINGS).find((b) => b.faction === facKey);
  const tech = Object.values(TECHS).find((t) => t.faction === facKey);
  const esc = (s) => (s || '').replace(/</g, '&lt;');
  const short = (s) => { const t = (s || '').split(/[—:]/).pop().trim(); return t.length > 64 ? t.slice(0, 61) + '…' : t; };
  const chip = (lbl, ttl, sub) => `<div class="civ-chip"><span class="lbl">${lbl}</span><span class="ttl">${esc(ttl)}</span>${sub ? ` <span class="sub">— ${esc(sub)}</span>` : ''}</div>`;
  const extra = uniqueUnits.length > 1 ? ` (+${uniqueUnits.length - 1} more)` : '';
  panel.innerHTML =
    `<div class="civ-head"><span class="civ-name">${esc(f.icon)} ${esc(f.label)}</span></div>` +
    `<div class="civ-bonus">${esc(f.desc)}</div>` +
    `<div class="civ-uniques">` +
    (signature ? chip('⭐ Unique Unit' + extra, signature.name, short(signature.desc)) : '') +
    (bld ? chip('🏛️ Unique Building', bld.name, short(bld.desc)) : '') +
    (tech ? chip('🔬 Unique Tech', tech.name, short(tech.desc)) : '') +
    `</div>`;
}
for (const btn of document.querySelectorAll('.fac-btn')) {
  btn.addEventListener('click', () => {
    chosenFaction = btn.dataset.fac;
    document.querySelectorAll('.fac-btn').forEach((b) => b.classList.toggle('sel', b === btn));
    renderCivPanel(chosenFaction);
  });
}
renderCivPanel(chosenFaction); // initial fill

// per-theme room lighting (fog near/far go through fogBase so zoom can scale them)
function applyMapLighting(mode) {
  if (mode === 'dark') {
    hemi.intensity = 0.4; lamp.intensity = 1.1; moon.intensity = 0.55;
    scene.background = new THREE.Color(0x0d0a1c);
    scene.fog.color.set(0x0d0a1c);
    fogBase.near = 40; fogBase.far = 105;
  } else if (mode === 'warm') {
    hemi.intensity = 0.9; lamp.intensity = 1.8; moon.intensity = 0.22;
    scene.background = new THREE.Color(0x241a2c);
    scene.fog.color.set(0x241a2c);
    fogBase.near = 60; fogBase.far = 140;
  } else {
    hemi.intensity = 0.75; lamp.intensity = 1.6; moon.intensity = 0.35;
    scene.background = new THREE.Color(0x1a1430);
    scene.fog.color.set(0x1a1430);
    fogBase.near = 60; fogBase.far = 140;
  }
}
$('start-btn').addEventListener('click', () => startGame(chosenDiff));
$('tutorial-btn').addEventListener('click', () => startTutorial());
window.__ttStart = (d, m) => startGame(d || 'normal', m); // headless test hook
window.__ttRandom = generateRandomMap; // headless: build a random-map config to soak

// ---------------- tutorial ----------------
let tutorialActive = false, tutStepI = 0, tutStartCam = null, tutSpawned = false;
const tutorialSteps = [
  { hd: 'Camera', tx: 'Move the camera with <b>W A S D</b> or the arrow keys. Try it now!',
    check: () => tutStartCam && (Math.abs(cam.tx - tutStartCam.x) + Math.abs(cam.tz - tutStartCam.z) > 5) },
  { hd: 'Select', tx: 'Left-click and <b>drag a box</b> around your Worker Buddies to select them.',
    check: () => game.selected.filter((e) => e.type === 'worker').length >= 2 },
  { hd: 'Gather', tx: '<b>Right-click</b> a 🍪 cookie pile to send your workers to gather Snacks.',
    check: () => game.entities.some((e) => e.type === 'worker' && e.owner === game.myId && e.order && e.order.type === 'gather') },
  { hd: 'Build', tx: 'Select one worker, click the 🏠 <b>Block House</b> on the command card, then click a flat spot to place it.',
    check: () => game.entities.some((e) => e.kind === 'building' && e.type === 'house' && e.owner === game.myId) },
  { hd: 'Train', tx: 'Click your 🧰 <b>Toy Chest</b>, then press <b>Q</b> to queue a new Worker Buddy.',
    check: () => { const c = game.entities.find((e) => e.type === 'chest' && e.owner === game.myId && !e.dead); return c && c.queue.length > 0; } },
  { hd: 'Fight!', tx: 'A rogue toy wandered in! Select a toy, press <b>F</b> for attack-move, and click the intruder.',
    setup: () => {
      const chest = game.entities.find((e) => e.type === 'chest' && e.owner === game.myId);
      const foe = game.spawnUnit('soldier', 1 - game.myId, chest.x + 6, chest.z + 3);
      foe.maxHp = 30; foe.hp = 30; foe.stance = 'stand';
      ui.alert('An enemy soldier appeared near your base!', 'attack', { x: foe.x, z: foe.z });
    },
    check: () => !game.entities.some((e) => e.type === 'soldier' && e.owner === (1 - game.myId) && !e.dead) },
  { hd: 'You did it!', tx: 'That\'s the basics — gather, build, train, fight. Press <b>T</b> anytime to see the tech tree, <b>ESC</b> for settings. Ready for a real battle?',
    final: true, check: () => false },
];

function startTutorial() {
  localStorage.setItem('tt-seen', '1');
  chosenMode = 'standard'; chosenStartRes = 'standard'; // basics only
  startGame('easy', 'playmat', null, null, true);
  tutorialActive = true; tutStepI = 0; tutSpawned = false;
  tutStartCam = null;
  showTutorialStep();
}
function showTutorialStep() {
  const s = tutorialSteps[tutStepI];
  $('tutorial').classList.add('show');
  $('tut-step').textContent = `Step ${tutStepI + 1} / ${tutorialSteps.length} · ${s.hd}`;
  $('tut-text').innerHTML = s.tx + (s.final ? '<br><button id="tut-done" class="diff-btn" style="margin-top:10px">▶ Play a real match</button>' : '');
  if (s.final) { const b = $('tut-done'); if (b) b.addEventListener('click', () => { location.href = location.pathname; }); }
  if (s.setup) s.setup();
  if (tutStepI === 0 && game) tutStartCam = { x: cam.tx, z: cam.tz };
}
function updateTutorial() {
  const s = tutorialSteps[tutStepI];
  if (s.final) return;
  if (s.check()) {
    sfx.play('research');
    tutStepI++;
    if (tutStepI >= tutorialSteps.length) { endTutorial(); return; }
    showTutorialStep();
  }
}
function endTutorial() {
  tutorialActive = false;
  $('tutorial').classList.remove('show');
}
$('tut-skip').addEventListener('click', () => endTutorial());

// ---------------- multiplayer menu ----------------
const mpStatus = (msg) => { const el = $('mp-status'); if (el) el.textContent = msg; };
$('mp-host').addEventListener('click', async () => {
  if (game) return;
  sfx.init();
  mpStatus('Setting up the room…');
  try {
    const n = new Net();
    // the Battle picker doubles as the online mode: 2v2 hosts a co-op room
    const setup = await n.host(chosenMap, chosenFaction, (msg) => mpStatus(msg),
      chosenSize === '2v2' ? 'coop' : '1v1', chosenDiff, chosenMode, chosenStartRes);
    mpStatus('Friend joined! Starting…');
    startGame(setup.difficulty, null, { net: n, myId: 0, seed: setup.seed, map: setup.map, factions: setup.factions, mode: setup.mode, gameMode: setup.gameMode, startRes: setup.startRes });
  } catch (e) {
    mpStatus(`⚠ ${e.message || e.type || 'Hosting failed'}`);
  }
});
$('mp-join').addEventListener('click', async () => {
  if (game) return;
  sfx.init();
  const code = $('mp-code').value.trim();
  if (code.length < 4) { mpStatus('Enter the 4-letter room code first.'); return; }
  mpStatus('Connecting…');
  try {
    const n = new Net();
    const setup = await n.join(code, chosenFaction, (msg) => mpStatus(msg));
    startGame('normal', null, { net: n, myId: 1, seed: setup.seed, map: setup.map, factions: setup.factions, mode: setup.mode, gameMode: setup.gameMode, startRes: setup.startRes });
  } catch (e) {
    mpStatus(`⚠ ${e.message || e.type || 'Could not join'}`);
  }
});
window.__ttShot = (w = 960) => {
  // render fresh (no preserveDrawingBuffer), then downscale for transport
  renderer.render(scene, camera);
  const src = renderer.domElement;
  const c = document.createElement('canvas');
  const h = Math.round(w * src.height / Math.max(1, src.width));
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(src, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.75);
};
window.__ttMP = { Net, TICK, INPUT_DELAY, Game, VFX }; // e2e test handle
// headless AI-vs-AI soak: runs a full match on a throwaway scene, no UI/render.
// returns { winnerTeam, ticks, simSec, err, armies, ages, res } for balance checks.
window.__ttSoak = (opts = {}, maxTicks = 9000) => {
  const s = new THREE.Scene();
  const fx = new VFX(s);
  const facs = opts.factions || ['classic', 'classic'];
  const defs = opts.playerDefs || [
    { team: 0, isAI: true, faction: facs[0] },
    { team: 1, isAI: true, faction: facs[1] },
  ];
  const seed = opts.seed ?? ((Math.random() * 2 ** 31) | 0);
  const g = new Game(s, registryCache, {
    alert() {}, selection() {}, age() {}, gameOver() {},
  }, {
    fx, sfx: null, difficulty: opts.difficulty || 'normal',
    map: opts.map || 'playmat', playerDefs: defs,
    gameMode: opts.gameMode || 'standard', startRes: opts.startRes || 'standard',
    seed, mp: false, myId: 0,
  });
  // capture the true victor: endGame knows the winning team for every mode,
  // whereas "last team with a building" only holds for standard/sudden.
  let winnerTeam = null;
  const _end = g.endGame.bind(g);
  g.endGame = (team) => { winnerTeam = team; _end(team); };
  g.setup();
  let err = null, t = 0;
  try { for (; t < maxTicks && !g.over; t++) g.update(0.1); }
  catch (e) { err = (e && e.message) + ' | ' + ((e && e.stack) || '').split('\n')[1]; }
  const armies = g.players.map((p) =>
    g.entities.filter((e) => e.kind === 'unit' && !e.dead && e.owner === p.id && e.def.aggro > 0).length);
  const ages = g.players.map((p) => p.age);
  const res = g.players.map((p) => Object.fromEntries(Object.entries(p.res).map(([k, v]) => [k, Math.round(v)])));
  return { seed, winnerTeam, over: g.over, ticks: t, simSec: Math.round(t * 0.1), err, armies, ages, res, facs };
};
window.__ttGL = () => ({ renderer, scene, camera }); // perf probes
window.__ttAmbient = () => ambient; // ambience debug handle
window.__ttCam = (x, z, dist = 24) => {
  cam.tx = cam.x = x; cam.tz = cam.z = z; cam.tdist = cam.dist = dist;
  applyCamera(1);
};
window.__ttDebug = () => ({
  placing: placing ? { type: placing.type, valid: placing.valid, i: placing.i, j: placing.j } : null,
  mouse: { x: mouseX, y: mouseY },
  cam: { ...cam },
});

let net = null;      // set for multiplayer matches
let mpAccum = 0;

function startGame(difficulty, mapKey, mpOpts = null, resume = null, tutorial = false) {
  if (game) return;
  sfx.init(); // user gesture unlocks audio
  applySettings();
  const menuEl = $('menu');
  if (menuEl) {
    menuEl.classList.remove('show');
    setTimeout(() => menuEl.remove(), 600);
  }

  let map = (mpOpts && mpOpts.map) || mapKey || chosenMap;
  // seed: MP/resume carry theirs; fresh games roll a new one
  let seedVal = mpOpts ? mpOpts.seed : (resume ? resume.opts.seed : (Math.random() * 2 ** 31) | 0);
  // a fresh single-player random map: build the config from the seed panel and
  // tie the whole match seed to it, so a given seed reproduces the exact board
  if (map === 'random' && !mpOpts && !resume) {
    map = generateRandomMap(rndSeed, rndOpts);
    seedVal = rndSeed | 0;
  }
  applyMapLighting((typeof map === 'object' ? map : (MAPS[map] || MAPS.playmat)).light);
  vfx = new VFX(scene);
  net = mpOpts ? mpOpts.net : null;
  // team roster: 1v1 stays implicit; 2v2 spells out the four seats
  let playerDefs = resume ? resume.opts.playerDefs || null : null;
  if (!playerDefs && !mpOpts && chosenSize === '2v2') {
    playerDefs = [
      { team: 0, isAI: false, faction: chosenFaction }, // you, SW
      { team: 1, isAI: true },                          // rival, NE
      { team: 0, isAI: true },                          // your AI ally, NW
      { team: 1, isAI: true },                          // second rival, SE
    ];
  } else if (!playerDefs && mpOpts && mpOpts.mode === 'coop') {
    playerDefs = [
      { team: 0, isAI: false, faction: mpOpts.factions[0] }, // host
      { team: 0, isAI: false, faction: mpOpts.factions[1] }, // guest — same team
      { team: 1, isAI: true },
      { team: 1, isAI: true },
    ];
  }
  game = new Game(scene, registryCache, {
    alert: (msg, kind, pos) => ui.alert(msg, kind, pos),
    selection: () => ui.refreshSelection(),
    gameOver: (win, stats, timeline) => ui.gameOver(win, stats, timeline),
    age: () => ui.refreshSelection(),
    shake: (amt) => shakeCam(amt),
  }, {
    fx: vfx, sfx, difficulty, map, playerDefs, tutorial,
    gameMode: mpOpts ? mpOpts.gameMode : (resume ? resume.opts.gameMode : chosenMode),
    startRes: mpOpts ? mpOpts.startRes : (resume ? resume.opts.startRes : chosenStartRes),
    // resumed games must rebuild the identical map shell before restoring
    seed: seedVal,
    mp: !!mpOpts, myId: mpOpts ? mpOpts.myId : 0, net,
    faction: chosenFaction,
    factions: mpOpts ? mpOpts.factions : (resume ? resume.opts.factions : null),
  });
  if (net) {
    net.onDrop = () => { ui.alert('Connection lost — the other player left.', 'attack'); };
    net.onDesync = (t) => { ui.alert('Sync drift detected — this match may be unreliable.', 'warn'); console.warn('[net] desync at tick', t); };
  }
  game.setup();
  if (resume) game.restore(resume);
  window.game = game;

  ui = new UI(game, {
    beginPlacement,
    beginPatrol: () => setClickMode('patrol'),
    beginAground: () => setClickMode('aground'),
    centerCamera: (x, z) => { cam.tx = x; cam.tz = z; clampCam(); },
    cameraCenter: () => ({ x: cam.x, z: cam.z }),
    selectIdle,
    minimapCommand: (x, z, shift) => {
      const ent = game.entityAt(x, z);
      const result = game.rightClick(x, z, ent, shift);
      if (result) sfx.play('command');
      if (result === 'move' || result === 'rally') marker.ping(x, z, 0x66ff88);
      else if (result === 'attack') marker.ping(x, z, 0xff5544);
      else if (result === 'gather') marker.ping(x, z, 0xffd166);
    },
  });
  ui.refreshSelection();

  marker = createMoveMarker();
  scene.add(marker.mesh);
  setupAmbient();

  cam.tx = cam.x = game.homePos.x;
  cam.tz = cam.z = game.homePos.z;
  applyCamera();

  if (failuresCache.length) {
    ui.alert(`${failuresCache.length} model file(s) missing — placeholder toys stand in for those.`, 'warn');
  }
  const fMine = FACTIONS[game.factionKeys[game.myId]] || FACTIONS.classic;
  const fFoe = FACTIONS[game.factionKeys[1 - game.myId]] || FACTIONS.classic;
  ui.alert(`${fMine.icon} Your ${fMine.label} take the field against the ${fFoe.icon} ${fFoe.label}!`, 'age');
  ui.alert('Night falls. Queue Worker Buddies and find the Snacks. (H = Toy Chest, WASD = camera, ESC = menu)', 'info');
  clock.start();
}

// ---------------- building placement ghost ----------------
let placing = null;
let wallDrag = null;          // { i0, j0, tiles }
const wallGhosts = [];        // pooled line-preview ghosts

function wallLineTiles(i0, j0, i1, j1) {
  // axis-dominant L: walk the long axis first, then the short one
  const tiles = [];
  const si = Math.sign(i1 - i0) || 1, sj = Math.sign(j1 - j0) || 1;
  if (Math.abs(i1 - i0) >= Math.abs(j1 - j0)) {
    for (let i = i0; i !== i1 + si; i += si) tiles.push([i, j0]);
    for (let j = j0 + sj; j !== j1 + sj; j += sj) tiles.push([i1, j]);
  } else {
    for (let j = j0; j !== j1 + sj; j += sj) tiles.push([i0, j]);
    for (let i = i0 + si; i !== i1 + si; i += si) tiles.push([i, j1]);
  }
  return tiles.slice(0, 40);
}
function updateWallLine() {
  if (!wallDrag || !placing) return;
  const tiles = wallLineTiles(wallDrag.i0, wallDrag.j0, placing.i, placing.j);
  wallDrag.tiles = tiles;
  placing.ghost.visible = false;
  while (wallGhosts.length < tiles.length) {
    const gh = createGhostMesh(BUILDINGS.wall);
    scene.add(gh);
    wallGhosts.push(gh);
  }
  for (let k = 0; k < wallGhosts.length; k++) {
    const gh = wallGhosts[k];
    if (k < tiles.length) {
      const [i, j] = tiles[k];
      gh.visible = true;
      gh.position.set(i - N / 2 + 0.5, 0, j - N / 2 + 0.5);
      gh.setValid(game.canPlace(game.myId, 'wall', i, j));
    } else {
      gh.visible = false;
    }
  }
}
function finishWallLine(shift) {
  const tiles = (wallDrag && wallDrag.tiles) || [];
  wallDrag = null;
  for (const gh of wallGhosts) gh.visible = false;
  const ids = game.selected
    .filter((e) => e.kind === 'unit' && e.type === 'worker' && !e.dead && e.owner === game.myId)
    .map((e) => e.id);
  let first = true;
  for (const [i, j] of tiles) {
    if (!game.canPlace(game.myId, 'wall', i, j)) continue;
    // builders are assigned to the first segment and chain down the line
    game.issue({ t: 'place', type: 'wall', i, j, ids: first ? ids : [], q: false });
    first = false;
  }
  if (!shift) cancelPlacement();
  else if (placing) placing.ghost.visible = true;
}
function beginPlacement(type) {
  cancelPlacement();
  const def = BUILDINGS[type];
  const ghost = createGhostMesh(def);
  ghost.visible = false;
  scene.add(ghost);
  placing = { type, def, ghost, i: 0, j: 0, valid: false };
  updatePlacement(mouseX, mouseY); // show the ghost immediately, not on first mouse move
}
function cancelPlacement() {
  if (placing) { scene.remove(placing.ghost); placing = null; }
  wallDrag = null;
  for (const gh of wallGhosts) gh.visible = false;
}
function updatePlacement(clientX, clientY) {
  if (!placing) return;
  const p = groundPoint(clientX, clientY);
  if (!p) return;
  const s = placing.def.size;
  placing.i = Math.round(p.x + N / 2 - s / 2);
  placing.j = Math.round(p.z + N / 2 - s / 2);
  placing.valid = game.canPlace(game.myId, placing.type, placing.i, placing.j);
  placing.ghost.visible = true;
  placing.ghost.position.set(
    placing.i - N / 2 + s / 2,
    game.tileHeight(placing.i, placing.j),
    placing.j - N / 2 + s / 2);
  placing.ghost.setValid(placing.valid);
}
function confirmPlacement(shift) {
  if (!placing || !placing.valid) return;
  if (!game.canAfford(game.myId, placing.def.cost)) { sfx.play('error'); return; }
  const ids = game.selected
    .filter((e) => e.kind === 'unit' && e.type === 'worker' && !e.dead && e.owner === game.myId)
    .map((e) => e.id);
  game.issue({ t: 'place', type: placing.type, i: placing.i, j: placing.j, ids, q: shift });
  if (!shift) cancelPlacement(); // shift keeps placing more of the same
  else placing.valid = false;
}

function selectIdle() {
  const idle = game.getIdleWorkers(game.myId);
  if (!idle.length) return;
  selectIdle.i = ((selectIdle.i || 0) + 1) % idle.length;
  const w = idle[selectIdle.i];
  game.setSelection([w]);
  cam.tx = w.x; cam.tz = w.z;
  clampCam();
}
// cycle through military toys standing around with no orders
function selectIdleMilitary() {
  const idle = game.entities.filter((e) => e.kind === 'unit' && e.owner === game.myId
    && !e.dead && e.def.aggro > 0 && !e.order && !e.oq.length && !e.garrisoned);
  if (!idle.length) { ui.alert('No idle military toys.', 'info'); return; }
  selectIdleMilitary.i = ((selectIdleMilitary.i || 0) + 1) % idle.length;
  const u = idle[selectIdleMilitary.i];
  game.setSelection([u]);
  cam.tx = u.x; cam.tz = u.z;
  clampCam();
}

// ---------------- control groups ----------------
const groups = {};
let lastRecall = { n: -1, t: 0 };
function assignGroup(n) {
  groups[n] = game.selected.filter((e) => !e.dead).map((e) => e.id);
  ui.alert(`Control group ${n} set (${groups[n].length} toys).`, 'info');
}
function recallGroup(n) {
  const ids = groups[n];
  if (!ids || !ids.length) return;
  const ents = game.entities.filter((e) => ids.includes(e.id) && !e.dead);
  if (!ents.length) return;
  game.setSelection(ents);
  const now = performance.now();
  if (lastRecall.n === n && now - lastRecall.t < 400) {
    cam.tx = ents[0].x; cam.tz = ents[0].z; clampCam(); // double-tap centers
  }
  lastRecall = { n, t: now };
}

// ---------------- pointer input ----------------
const dragBox = $('dragbox');
let down = null;
// one ground-click mode at a time: 'amove' | 'patrol' | 'aground' | null
let clickMode = null;
let mouseX = innerWidth / 2, mouseY = innerHeight / 2, mouseInside = true;

function setClickMode(m) {
  clickMode = m;
  document.body.classList.toggle('amove', !!m);
}
const setAttackMove = (v) => setClickMode(v ? 'amove' : null);

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!game) return;
  if (e.button === 1) { down = { pan: true, x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
  if (e.button === 0) {
    if (clickMode) {
      const p = groundPoint(e.clientX, e.clientY);
      if (p) {
        const ids = game.selected.filter((s) => s.kind === 'unit' && s.owner === game.myId).map((s) => s.id);
        if (clickMode === 'amove') {
          game.issue({ t: 'move', ids, x: p.x, z: p.z, q: e.shiftKey, am: true, f: game.formation });
          marker.ping(p.x, p.z, 0xff8844);
          if (ids.length) sfx.play('charge'); // charge!
        } else if (clickMode === 'patrol') {
          game.issue({ t: 'patrol', ids, x: p.x, z: p.z, q: e.shiftKey });
          marker.ping(p.x, p.z, 0x7fd0ff);
        } else if (clickMode === 'aground') {
          game.issue({ t: 'aground', ids, x: p.x, z: p.z, q: e.shiftKey });
          marker.ping(p.x, p.z, 0xff5544);
        }
        sfx.play('command');
      }
      setClickMode(null);
      return;
    }
    if (placing) {
      if (placing.def.wall) { wallDrag = { i0: placing.i, j0: placing.j, tiles: [[placing.i, placing.j]] }; return; }
      confirmPlacement(e.shiftKey);
      return;
    }
    down = { x: e.clientX, y: e.clientY, moved: false };
  }
});

addEventListener('pointermove', (e) => {
  mouseX = e.clientX; mouseY = e.clientY;
  if (placing) {
    updatePlacement(e.clientX, e.clientY);
    if (wallDrag) updateWallLine();
  }
  if (!down) return;
  if (down.pan) {
    const k = cam.dist / 500;
    cam.tx -= (e.clientX - down.x) * k;
    cam.tz -= (e.clientY - down.y) * k;
    down.x = e.clientX; down.y = e.clientY;
    clampCam();
    return;
  }
  if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 8) down.moved = true;
  if (down.moved) {
    dragBox.style.display = 'block';
    dragBox.style.left = `${Math.min(down.x, e.clientX)}px`;
    dragBox.style.top = `${Math.min(down.y, e.clientY)}px`;
    dragBox.style.width = `${Math.abs(e.clientX - down.x)}px`;
    dragBox.style.height = `${Math.abs(e.clientY - down.y)}px`;
  }
});
document.addEventListener('mouseleave', () => { mouseInside = false; });
document.addEventListener('mouseenter', () => { mouseInside = true; });

addEventListener('pointerup', (e) => {
  if (wallDrag && e.button === 0) { finishWallLine(e.shiftKey); return; }
  if (!down) return;
  const wasPan = down.pan, moved = down.moved;
  const start = { x: down.x, y: down.y };
  down = null;
  dragBox.style.display = 'none';
  if (wasPan || !game) return;
  if (e.button !== 0) return;

  if (moved) {
    const x0 = Math.min(start.x, e.clientX), x1 = Math.max(start.x, e.clientX);
    const y0 = Math.min(start.y, e.clientY), y1 = Math.max(start.y, e.clientY);
    const v = new THREE.Vector3();
    const hits = [];
    for (const ent of game.entities) {
      if (ent.kind !== 'unit' || ent.owner !== game.myId || ent.dead) continue;
      v.set(ent.x, 0.3, ent.z).project(camera);
      const sx = (v.x + 1) / 2 * innerWidth, sy = (-v.y + 1) / 2 * innerHeight;
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) hits.push(ent);
    }
    if (hits.length) {
      game.setSelection(e.shiftKey ? [...new Set([...game.selected, ...hits])] : hits);
      sfx.play('select');
      sfx.voice(hits[0].type);
    } else if (!e.shiftKey) {
      game.setSelection([]);
    }
    return;
  }

  const p = groundPoint(e.clientX, e.clientY);
  if (!p) return;
  const ent = game.entityAt(p.x, p.z);
  if (ent) {
    // double-click an own unit: select every visible toy of that type
    const now = performance.now();
    if (lastClick.id === ent.id && now - lastClick.t < 350
        && ent.kind === 'unit' && ent.owner === game.myId) {
      const v = new THREE.Vector3();
      const same = game.entities.filter((u) => {
        if (u.kind !== 'unit' || u.owner !== game.myId || u.dead || u.type !== ent.type) return false;
        v.set(u.x, 0.3, u.z).project(camera);
        return v.x > -1 && v.x < 1 && v.y > -1 && v.y < 1;
      });
      game.setSelection(same);
      sfx.play('select');
      lastClick = { id: null, t: 0 };
      return;
    }
    lastClick = { id: ent.id, t: now };
    if (e.shiftKey) {
      const cur = game.selected.slice();
      const i = cur.indexOf(ent);
      if (i >= 0) cur.splice(i, 1); else cur.push(ent);
      game.setSelection(cur);
    } else {
      game.setSelection([ent]);
    }
    sfx.play('select');
    if (ent.kind === 'unit' && ent.owner === game.myId) sfx.voice(ent.type);
  } else if (!e.shiftKey) {
    game.setSelection([]);
  }
});
let lastClick = { id: null, t: 0 };

renderer.domElement.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!game) return;
  if (clickMode) { setClickMode(null); return; }
  if (placing) { cancelPlacement(); return; }
  const p = groundPoint(e.clientX, e.clientY);
  if (!p) return;
  const ent = game.entityAt(p.x, p.z);
  const result = game.rightClick(p.x, p.z, ent, e.shiftKey);
  if (result) {
    sfx.play('command');
    const first = game.selected.find((s) => s.kind === 'unit' && s.owner === game.myId);
    if (first) sfx.voice(first.type);
    if (result === 'attack') sfx.play('charge'); // a little battle cry
  }
  if (result === 'move' || result === 'rally') marker.ping(p.x, p.z, result === 'rally' ? 0x66aaff : 0x66ff88);
  else if (result === 'attack') marker.ping(p.x, p.z, 0xff5544);
  else if (result === 'gather') marker.ping(p.x, p.z, 0xffd166);
});

renderer.domElement.addEventListener('wheel', (e) => {
  // progressive zoom: gentle steps up close, big steps when high up
  cam.tdist += e.deltaY * 0.02 * Math.max(0.45, cam.dist / 24);
  clampCam();
}, { passive: true });

// ---------------- keyboard ----------------
const keys = {};
addEventListener('keydown', (e) => {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  keys[e.key.toLowerCase()] = true;
  if (!game) return;
  const k = e.key.toLowerCase();
  if (e.key === 'Escape') {
    // ESC peels back one layer at a time: overlay → mode → placement → selection → menu
    if ($('techtree').classList.contains('show')) toggleTechTree(false);
    else if (clickMode) setClickMode(null);
    else if (placing) cancelPlacement();
    else if (game.selected.length) game.setSelection([]);
    else toggleGameMenu();
  }
  if (e.key === '.') selectIdle();
  if (e.key === ',') selectIdleMilitary();
  if (k === 'h') {
    const chest = game.entities.find((x) => x.type === 'chest' && x.owner === game.myId && !x.dead);
    if (chest) {
      game.setSelection([chest]);
      cam.tx = chest.x; cam.tz = chest.z;
      clampCam();
    }
  }
  // WASD pans the camera, so combat hotkeys moved: F = attack-move, X = stop
  if (k === 'f' && !e.ctrlKey && game.selected.some((s) => s.kind === 'unit' && s.owner === game.myId)) {
    setAttackMove(true);
  }
  if (k === 'x' && !e.ctrlKey) {
    const ids = game.selected.filter((s) => s.owner === game.myId && s.kind === 'unit').map((s) => s.id);
    if (ids.length) game.issue({ t: 'stop', ids });
  }
  if (e.key === 'Delete') {
    const b = game.selected.find((s) => s.kind === 'building' && s.owner === game.myId && !s.dead);
    if (b) { game.issue({ t: 'demolish', id: b.id }); game.setSelection([]); }
  }
  if (k === 'b' && !e.ctrlKey) game.issue({ t: 'bell' });
  if (k === 't' && !e.ctrlKey) toggleTechTree();
  if (e.key === 'F6') { e.preventDefault(); saveGame(); }
  if (e.key === 'F7') {
    e.preventDefault();
    if (!net && localStorage.getItem('tt-save')) location.href = location.pathname + '?load=1';
  }
  if (k === 'g' && !e.ctrlKey
      && game.selected.some((s) => s.kind === 'unit' && s.owner === game.myId
        && s.def.projectile && s.def.projectile.splash)) {
    setClickMode('aground');
  }
  if (k === 'z' && !e.ctrlKey
      && game.selected.some((s) => s.kind === 'unit' && s.owner === game.myId && s.def.aggro > 0)) {
    setClickMode('patrol');
  }
  if (k === 'm') {
    sfx.setMuted(!sfx.muted);
    $('mute-btn').textContent = sfx.muted ? '🔇' : '🔊';
  }
  // game speed (single-player perk; lockstep runs realtime)
  if (!net) {
    if (e.key === '+' || e.key === '=') setSpeed(Math.min(3, gameSpeed + 0.5));
    if (e.key === '-') setSpeed(Math.max(0.5, gameSpeed - 0.5));
  }
  if (/^[1-9]$/.test(e.key)) {
    if (e.ctrlKey) { assignGroup(e.key); e.preventDefault(); }
    else recallGroup(e.key);
  }
  // command card hotkeys (shown on the buttons)
  if (!e.ctrlKey && !e.altKey && ui) {
    const idx = CARD_KEYS.indexOf(k);
    if (idx >= 0 && ui.cardButtons[idx] && !ui.cardButtons[idx].def.isHint) {
      const { el, def } = ui.cardButtons[idx];
      if (!el.disabled && def.enabled()) def.onClick();
    }
  }
});
// mirrors KEYS in ui.js buildCard — W/A/S/D pan, T opens the tech tree
const CARD_KEYS = ['q', 'e', 'r', 'y', 'u', 'i', 'o', 'p', 'k', 'j'];
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// ---------------- main loop ----------------
const clock = new THREE.Clock(false);
let gameSpeed = 1;
function setSpeed(s) {
  gameSpeed = s;
  const chip = $('speed-chip');
  chip.textContent = `⏩ ${s}×`;
  chip.style.display = s === 1 ? 'none' : '';
}

// One bad entity must not freeze the whole game: catch, report once, carry on.
let tickErrors = 0;
function tick(dt) {
  try {
    game.update(dt);
    vfx.update(dt);
    marker.update(dt);
    ui.update(dt);
  } catch (err) {
    tickErrors++;
    console.error('[toybox] tick error', err);
    if (tickErrors === 1 && ui) {
      ui.alert('A toy misbehaved (see console) — the game is recovering.', 'warn');
    }
    if (tickErrors > 300) throw err; // persistent failure: stop hiding it
  }
}

function stepMP(realDt) {
  // deterministic lockstep: fixed ticks, gated on the peer's command stream
  mpAccum = Math.min(mpAccum + realDt, 0.6);
  let steps = 0;
  while (mpAccum >= TICK && steps++ < 10) {
    if (!net.canStep()) break; // waiting on the network
    net.flush(game);
    net.execTick(game);
    game.update(TICK);
    mpAccum -= TICK;
  }
}

// ---------------- ambient room life (visual only, never touches the sim) ----
let ambient = null;
let ambClock = 0;

function setupAmbient() {
  if (ambient) return;
  const g = new THREE.Group();
  scene.add(g);
  // moths flitting around the lamp bulb
  const moths = [];
  const lampPos = new THREE.Vector3(-N / 2 - 5, 14.4, -N / 2 + 12);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.15),
      new THREE.MeshBasicMaterial({ color: 0xf6ecd0, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    g.add(m);
    moths.push({ mesh: m, a: Math.random() * 9, r: 1 + Math.random() * 1.7, sp: 1.4 + Math.random() * 1.8, vo: Math.random() * 9 });
  }
  // a passing car throws headlights across the ceiling and floor
  const head = new THREE.SpotLight(0xfff0c8, 0, 300, 0.5, 0.6, 1.1);
  head.position.set(0, 55, N * 1.5);
  const headTgt = new THREE.Object3D();
  scene.add(headTgt);
  head.target = headTgt;
  g.add(head);
  // the house cat prowls past on its own schedule
  const cat = new THREE.Group();
  const catMat = new THREE.MeshStandardMaterial({ color: 0x2e2a3a, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 9), catMat);
  body.scale.set(1, 0.75, 1.9);
  body.position.y = 1.35;
  cat.add(body);
  const chead = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 9), catMat);
  chead.position.set(0, 2.1, 2.4);
  cat.add(chead);
  for (const sx of [-0.45, 0.45]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 6), catMat);
    ear.position.set(sx, 2.9, 2.3);
    cat.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.05, 2.6, 8), catMat);
  tail.position.set(0, 2.2, -2.6);
  tail.rotation.x = -0.7;
  cat.add(tail);
  for (const sx of [-0.3, 0.3]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd8f04a }));
    eye.position.set(sx, 2.15, 3.15);
    cat.add(eye);
  }
  cat.visible = false;
  cat.traverse((n) => { if (n.isMesh) n.castShadow = true; });
  g.add(cat);

  const style = game ? game.map.ground : 'playmat';
  const hasWalls = style !== 'underbed';
  const rainy = hasWalls && Math.random() < 0.45; // some nights it just rains

  // the playmat breathes: breeze ripples run through the fabric
  const mat = scene.getObjectByName('playmat-ground');

  // goldfish bowl on the floor east of the mat
  let fish = null, tailFlap = null, bubbles = [];
  if (hasWalls) {
    const bowl = new THREE.Group();
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(3, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0xbdd8e8, transparent: true, opacity: 0.16, roughness: 0.05, side: THREE.DoubleSide })
    );
    glass.scale.y = 0.92;
    glass.position.y = 2.6;
    bowl.add(glass);
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(2.7, 20),
      new THREE.MeshStandardMaterial({ color: 0x7fd0e8, transparent: true, opacity: 0.4, roughness: 0.15 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 3.9;
    bowl.add(water);
    const gravel = new THREE.Mesh(new THREE.SphereGeometry(2.5, 14, 8), new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.95 }));
    gravel.scale.set(1, 0.22, 1);
    gravel.position.y = 0.55;
    bowl.add(gravel);
    fish = new THREE.Group();
    const fBody = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf3722c, roughness: 0.5 }));
    fBody.scale.set(1, 0.8, 0.55);
    fish.add(fBody);
    const fEye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    fEye.position.set(0.28, 0.08, 0.14);
    fish.add(fEye);
    tailFlap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 6), new THREE.MeshStandardMaterial({ color: 0xf8a24c, roughness: 0.5 }));
    tailFlap.rotation.z = Math.PI / 2;
    tailFlap.position.x = -0.55;
    fish.add(tailFlap);
    bowl.add(fish);
    for (let i = 0; i < 3; i++) {
      const bub = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), new THREE.MeshStandardMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.55 }));
      bub.position.set((Math.random() - 0.5) * 1.4, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 1.4);
      bowl.add(bub);
      bubbles.push({ mesh: bub, sp: 0.5 + Math.random() * 0.5 });
    }
    bowl.position.set(N / 2 + 14, 0, -9);
    g.add(bowl);
  }

  // window on the north wall — moonlit, or streaked with rain
  let pane = null;
  const rainStreaks = [];
  if (hasWalls) {
    const win = new THREE.Group();
    const frameM = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.8 });
    const W = 13, H = 9, CY = 12.5;
    const bar = (w, h, x, y) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), frameM);
      m.position.set(x, y, -65.05);
      win.add(m);
    };
    bar(W + 1.2, 0.7, 0, CY + H / 2);
    bar(W + 1.2, 0.7, 0, CY - H / 2);
    bar(0.7, H, -W / 2 - 0.25, CY);
    bar(0.7, H, W / 2 + 0.25, CY);
    bar(0.35, H, 0, CY);
    bar(W, 0.35, 0, CY);
    pane = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshStandardMaterial({ color: 0x2a4070, emissive: 0x9db8e8, emissiveIntensity: rainy ? 0.18 : 0.45, roughness: 0.35 })
    );
    pane.position.set(0, CY, -65.12); // proud of the wall face, behind the bars
    win.add(pane);
    if (rainy) {
      for (let i = 0; i < 14; i++) {
        const len = 0.8 + Math.random() * 1.2;
        const s = new THREE.Mesh(
          new THREE.PlaneGeometry(0.07, len),
          new THREE.MeshBasicMaterial({ color: 0xbdd4ff, transparent: true, opacity: 0.32 })
        );
        s.position.set((Math.random() - 0.5) * (W - 1), CY - H / 2 + Math.random() * H, -65.0);
        win.add(s);
        rainStreaks.push({ mesh: s, sp: 3 + Math.random() * 4, top: CY + H / 2 - len / 2, bottom: CY - H / 2 + len / 2 });
      }
      sfx.startRain();
    }
    g.add(win);
  }

  // door ajar on the east wall — warm hallway light leaks through
  let sliver = null, doorLight = null;
  if (hasWalls) {
    const door = new THREE.Group();
    const dframeM = new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 0.85 });
    const DZ = 18, DW = 9, DH = 18;
    const dbar = (w, h, z, y) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, h, w), dframeM);
      m.position.set(65.05, y, z);
      door.add(m);
    };
    dbar(0.8, DH, DZ - DW / 2, DH / 2);
    dbar(0.8, DH, DZ + DW / 2, DH / 2);
    dbar(DW + 0.8, 0.8, DZ, DH);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.4, DH - 0.6, DW - 1.6), new THREE.MeshStandardMaterial({ color: 0x543822, roughness: 0.8 }));
    panel.position.set(65.15, (DH - 0.6) / 2, DZ - 0.5);
    door.add(panel);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8b84a, roughness: 0.3, metalness: 0.5 }));
    knob.position.set(64.8, 8.2, DZ + 2.6);
    door.add(knob);
    // the gap: warm light from the hallway
    sliver = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, DH - 1),
      new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffd9a0, emissiveIntensity: 1.3 })
    );
    sliver.rotation.y = -Math.PI / 2;
    sliver.position.set(65.5, (DH - 1) / 2, DZ + DW / 2 - 1);
    door.add(sliver);
    doorLight = new THREE.PointLight(0xffd9a0, 26, 32, 1.7);
    doorLight.position.set(63.5, 4, DZ + 3);
    door.add(doorLight);
    // sit the whole door just in front of the wall's baseboard — otherwise the
    // frame/panel are coplanar with it and z-fight (flickers at the door's base)
    door.position.x = -1.2;
    g.add(door);
  }

  ambient = {
    moths, lampPos, head, headTgt,
    headT: 20 + Math.random() * 35, headPhase: -1,
    cat, tail, catT: 60 + Math.random() * 80, catPhase: -1, catFrom: null, catTo: null,
    mat, gustT: 7 + Math.random() * 14, gustPhase: -1, matNormalT: 0,
    fish, tailFlap, bubbles, fishA: 0,
    rainy, pane, rainStreaks,
    ltT: rainy ? 18 + Math.random() * 40 : 1e9, ltPhase: -1, hemiBase: hemi.intensity, bgBase: scene.background.getHex(),
    sliver, doorLight, stepT: 70 + Math.random() * 90, stepPhase: -1,
  };
}

function updateAmbient(dt) {
  if (!ambient) return;
  ambClock += dt;
  const t = ambClock;
  for (const mo of ambient.moths) {
    mo.a += dt * mo.sp;
    const r = mo.r + Math.sin(t * 2.3 + mo.vo) * 0.4;
    mo.mesh.position.set(
      ambient.lampPos.x + Math.cos(mo.a) * r,
      ambient.lampPos.y + Math.sin(t * 3.1 + mo.vo) * 0.7,
      ambient.lampPos.z + Math.sin(mo.a) * r
    );
    mo.mesh.rotation.y = mo.a + Math.PI / 2;
    mo.mesh.rotation.z = Math.sin(t * 22 + mo.vo) * 0.6; // flutter
  }
  // headlight sweep
  if (ambient.headPhase < 0) {
    ambient.headT -= dt;
    if (ambient.headT <= 0) ambient.headPhase = 0;
  } else {
    ambient.headPhase += dt / 7;
    const f = ambient.headPhase;
    if (f >= 1) {
      ambient.headPhase = -1;
      ambient.headT = 35 + Math.random() * 55;
      ambient.head.intensity = 0;
    } else {
      ambient.head.intensity = Math.sin(f * Math.PI) * 900;
      ambient.headTgt.position.set(-N + f * 2 * N, 0, -8 + f * 12);
      ambient.head.position.set(-N + f * 2 * N + 30, 55, N * 1.4);
    }
  }
  // prowling cat crossing the floor outside the mat
  if (ambient.catPhase < 0) {
    ambient.catT -= dt;
    if (ambient.catT <= 0) {
      ambient.catPhase = 0;
      const side = Math.random() < 0.5 ? -1 : 1;
      const zLine = side * (N / 2 + 15 + Math.random() * 8);
      ambient.catFrom = { x: -N / 2 - 26, z: zLine };
      ambient.catTo = { x: N / 2 + 26, z: zLine + (Math.random() * 10 - 5) };
      if (Math.random() < 0.5) { const tmp = ambient.catFrom; ambient.catFrom = ambient.catTo; ambient.catTo = tmp; }
      ambient.cat.visible = true;
    }
  } else {
    ambient.catPhase += dt / 30;
    const f = ambient.catPhase;
    if (f >= 1) {
      ambient.catPhase = -1;
      ambient.catT = 90 + Math.random() * 130;
      ambient.cat.visible = false;
    } else {
      const x = ambient.catFrom.x + (ambient.catTo.x - ambient.catFrom.x) * f;
      const z = ambient.catFrom.z + (ambient.catTo.z - ambient.catFrom.z) * f;
      ambient.cat.position.set(x, Math.abs(Math.sin(t * 5)) * 0.12, z);
      ambient.cat.lookAt(ambient.catTo.x, 0, ambient.catTo.z);
      ambient.tail.rotation.z = Math.sin(t * 2.2) * 0.35;
    }
  }
  // breeze ripples through the playmat fabric, gusting now and then
  if (ambient.mat) {
    let amp = 0.018;
    if (ambient.gustPhase < 0) {
      ambient.gustT -= dt;
      if (ambient.gustT <= 0) { ambient.gustPhase = 0; sfx.wind(); }
    } else {
      ambient.gustPhase += dt / 6;
      if (ambient.gustPhase >= 1) { ambient.gustPhase = -1; ambient.gustT = 18 + Math.random() * 26; }
      // capped so the fabric never swallows flat props (milk sits at y=0.07)
      else amp += Math.sin(ambient.gustPhase * Math.PI) * 0.042;
    }
    const pos = ambient.mat.geometry.attributes.position;
    const baseH = ambient.mat.userData.baseH; // terrain elevation underneath
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      // always-positive billow riding on top of the terrain heightfield
      pos.setZ(i, (baseH ? baseH[i] : 0)
        + amp * (0.55 + 0.45 * Math.sin(x * 0.35 + t * 1.6) * Math.sin(y * 0.3 + t * 1.1)));
    }
    pos.needsUpdate = true;
    ambient.matNormalT -= dt;
    if (ambient.matNormalT <= 0) { ambient.matNormalT = 0.15; ambient.mat.geometry.computeVertexNormals(); }
  }
  // goldfish laps its bowl; bubbles drift up
  if (ambient.fish) {
    ambient.fishA += dt * 0.85;
    const r = 1.5;
    ambient.fish.position.set(Math.cos(ambient.fishA) * r, 1.7 + Math.sin(t * 1.7) * 0.3, -Math.sin(ambient.fishA) * r);
    ambient.fish.rotation.y = ambient.fishA;
    ambient.tailFlap.rotation.y = Math.sin(t * 9) * 0.5;
    for (const b of ambient.bubbles) {
      b.mesh.position.y += dt * b.sp;
      if (b.mesh.position.y > 3.6) {
        b.mesh.position.set((Math.random() - 0.5) * 1.4, 0.8, (Math.random() - 0.5) * 1.4);
      }
    }
  }
  // rain runs down the window pane
  for (const s of ambient.rainStreaks) {
    s.mesh.position.y -= dt * s.sp;
    if (s.mesh.position.y < s.bottom) {
      s.mesh.position.y = s.top;
      s.mesh.position.x = (Math.random() - 0.5) * 12;
    }
  }
  // lightning: double flash, then the rumble arrives late
  if (ambient.ltPhase < 0) {
    ambient.ltT -= dt;
    if (ambient.ltT <= 0) { ambient.ltPhase = 0; ambient.thunderDone = false; }
  } else {
    ambient.ltPhase += dt;
    const p = ambient.ltPhase;
    const flash = (p < 0.09) || (p > 0.17 && p < 0.32);
    hemi.intensity = ambient.hemiBase + (flash ? 1.7 : 0);
    scene.background.setHex(flash ? 0x3a4a7a : ambient.bgBase);
    if (ambient.pane) ambient.pane.material.emissiveIntensity = flash ? 1.6 : (ambient.rainy ? 0.14 : 0.32);
    if (!ambient.thunderDone && p > 1.0) { ambient.thunderDone = true; sfx.thunder(); }
    if (p > 3) { ambient.ltPhase = -1; ambient.ltT = 35 + Math.random() * 65; }
  }
  // someone pads down the hallway past the door
  if (ambient.sliver) {
    if (ambient.stepPhase < 0) {
      ambient.stepT -= dt;
      if (ambient.stepT <= 0) { ambient.stepPhase = 0; sfx.footsteps(); }
    } else {
      ambient.stepPhase += dt;
      const p = ambient.stepPhase;
      // two leg-shadows swallow the light as they pass
      const dip = Math.max(0, Math.sin(p * 4.4)) * 0.85;
      ambient.sliver.material.emissiveIntensity = 1.3 * (1 - dip);
      ambient.doorLight.intensity = 26 * (1 - dip * 0.8);
      if (p > 3.2) {
        ambient.stepPhase = -1;
        ambient.stepT = 90 + Math.random() * 120;
        ambient.sliver.material.emissiveIntensity = 1.3;
        ambient.doorLight.intensity = 26;
      }
    }
  }
}

function loop() {
  requestAnimationFrame(loop);
  if (!game) { renderer.render(scene, camera); return; }
  const dt = Math.min(0.05, clock.getDelta());

  const panSpeed = cam.dist * 0.9 * dt;
  if (keys.arrowup || keys.w) cam.tz -= panSpeed;
  if (keys.arrowdown || keys.s) cam.tz += panSpeed;
  if (keys.arrowleft || keys.a) cam.tx -= panSpeed;
  if (keys.arrowright || keys.d) cam.tx += panSpeed;
  // edge scrolling
  if (mouseInside && !down && settings.edge) {
    const m = 14;
    if (mouseX < m) cam.tx -= panSpeed;
    else if (mouseX > innerWidth - m) cam.tx += panSpeed;
    if (mouseY < m) cam.tz -= panSpeed;
    else if (mouseY > innerHeight - m && mouseY < innerHeight - 2) cam.tz += panSpeed;
  }
  clampCam();
  applyCamera(dt);
  if (tutorialActive) updateTutorial(dt);

  if (net) {
    try {
      stepMP(dt);
      vfx.update(dt);
      marker.update(dt);
      ui.update(dt);
    } catch (err) { console.error('[toybox] mp tick error', err); }
  } else if (!gamePaused) {
    tick(dt * gameSpeed);
  }
  vfx.ambient(cam.x, cam.z, dt); // dust motes drifting in the lamp light
  updateAmbient(dt);            // moths, headlights, the cat
  // the lamp breathes a little, like a real filament
  const flick = 1 + Math.sin(performance.now() * 0.0021) * 0.03 + Math.sin(performance.now() * 0.013) * 0.02;
  lampProp.light.intensity = 220 * flick;
  lampProp.bulb.material.emissiveIntensity = 2.2 * flick;
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

// keep simulating while the tab is hidden — rAF stops firing there, and the
// browser throttles timers, so consume real elapsed time in small sub-steps
setInterval(() => {
  if (!document.hidden || !game) return;
  try {
    const elapsed = Math.min(2, clock.getDelta());
    if (net) {
      stepMP(elapsed);
    } else if (!gamePaused) {
      const steps = Math.max(1, Math.ceil(elapsed / 0.1));
      const dt = elapsed / steps;
      for (let i = 0; i < steps; i++) game.update(dt);
    }
    vfx.update(elapsed);
    marker.update(elapsed);
    ui.update(elapsed);
    updateAmbient(elapsed);
    applyCamera(elapsed);
    renderer.render(scene, camera);
  } catch (err) {
    console.error('[toybox] hidden tick error', err);
  }
}, 100);

boot().catch((err) => {
  console.error(err);
  const t = $('loadtext');
  if (t) t.textContent = `Failed to start: ${err.message}`;
});
