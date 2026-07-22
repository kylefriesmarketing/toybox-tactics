// ============================================================
// TOYBOX TACTICS — bootstrap: renderer, camera, input, menu, loop.
// ============================================================

import * as THREE from 'three';
import { MAP_N, UNITS, BUILDINGS, MAPS, FACTIONS, TECHS, GAME_MODES, SURVIVAL, DIFFICULTIES, CAMPAIGN, INTRO, MISSION_EVENTS, CMDR_LINES, generateRandomMap } from './data.js';
import {
  loadUnitModels, loadBuildingModels, loadMapModels, loadFurnitureModels, setBuildingFootprints,
  createGhostMesh, createMoveMarker, createLamp, renderPortraits, applyUnitTier, refreshFactionBuildingIcons,
  PORTRAITS, setProceduralEra, makeRankBadge,
} from './models.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { recordMatch, ACHIEVEMENTS, loadChronicle, loadEarned } from './chronicle.js';
import { VFX } from './vfx.js';
import { SFX } from './sfx.js';
import { Net, TICK, INPUT_DELAY } from './net.js';
import { Empire, setEmpireHooks, openEmpire, empireBattleContext, empireShouldAutoOpen, empireTest, empireNetTest } from './empire.js';

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
  cam.tdist = Math.max(4, Math.min(84, cam.tdist)); // cap so the camera stays inside the room walls
  const half = N / 2 + 6;
  cam.tx = Math.max(-half, Math.min(half, cam.tx));
  cam.tz = Math.max(-half, Math.min(half, cam.tz));
  // the camera sits south of its target by dist*zf (over-the-shoulder). Keep it
  // from sliding past the tall south wall (z = N/2+30), which would reveal the
  // empty floor behind it. Only bites when zoomed out; the whole map is visible
  // by then anyway, so no southern ground is lost.
  const t = Math.min(1, Math.max(0, (cam.tdist - 4) / 26));
  const zf = 0.88 - 0.26 * t;
  const southLimit = (N / 2 + 30) - 6 - cam.tdist * zf;
  if (cam.tz > southLimit) cam.tz = southLimit;
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
  // fog backs off as the camera rises so the battlefield stays clear, but not so
  // far that the room's outer edge is exposed — the perimeter always dissolves
  // softly into the (matching) background instead of ending in a hard line
  const extra = Math.max(0, cam.dist - 24);
  scene.fog.near = fogBase.near + extra * 1.5;
  scene.fog.far = fogBase.far + extra * 1.7;
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

// while the toys wake up: rotating storybook cards on the loading screen
const LOAD_LORE = [
  'The storybooks say the first war began over a patch of rug no bigger than a picture book.',
  'A Worker Buddy has never lost a war. They have only ever been let down by their generals.',
  'Nothing marches through milk. Generations of soldiers have tested this. All of them stickily.',
  'The bath learned the word "armada" the day the first hull touched the water.',
  'Colonel Snug\'s standing order has never changed: hold the line, hug the prisoners.',
  'Walls are the room\'s oldest sentence, written in blocks: "no."',
  'Wind-up mice deliver Snacks to whoever befriends them first. Everyone befriends them. Few deserve them.',
  'The high shelf wins wars. The dictionary has never once been argued with.',
  'Foreman Klik measures twice and conquers once.',
  'Every Tin Bot spends its ticks carefully. Ask Captain Cogsworth what they\'re saving up for.',
  'Set a rally on a Snack pile — new Worker Buddies will march straight to work.',
  'The Hypno-Top only ever asks one question: whose side were you on, again?',
  // the room is alive — teach the player what shares the floor with them
  'Keep your toys together. The house cat only ever swats the ones who wander off alone.',
  'The yard dog cannot be reasoned with. It can only be out-run, and not for long.',
  'A lone toy is a snack. A squad is a problem the cat would rather nap through.',
  'The Roomba means no harm. It simply does not see you — right up until it shoves you aside.',
  'March military toys onto a wild camp and hold it. Teach them your flags, and the tribe is yours.',
  'A Worker Buddy who wanders past a lost toy will carry it home for a fistful of Buttons.',
  'Befriend a critter and it scurries home with Snacks. The dust bunnies, though, are uncatchable.',
  'The night deepens as the war drags on. Whoever wins by moonlight fought longest in the dark.',
  'The room keeps score in the carpet. Fight the same ground twice and you\'ll see last night\'s paths.',
  'Somewhere past the rim, a giant is awake. Sometimes a hand comes down and a crayon simply… goes.',
  'In The Long Night, there is no winning — only the twelve waves, and the dawn on the far side.',
];
function startLoadLore() {
  const el = $('loadlore');
  if (!el) return () => {};
  let i = (Math.random() * LOAD_LORE.length) | 0;
  const showNext = () => {
    el.classList.remove('show');
    setTimeout(() => { el.textContent = LOAD_LORE[i++ % LOAD_LORE.length]; el.classList.add('show'); }, 350);
  };
  showNext();
  const iv = setInterval(showNext, 4200);
  return () => { clearInterval(iv); };
}

async function boot() {
  const bar = $('loadbar-fill'), text = $('loadtext');
  const stopLore = startLoadLore();
  const { registry, failures } = await loadUnitModels((done, total, label) => {
    bar.style.width = `${(done / total) * 100}%`;
    text.textContent = `Waking up the toys… ${label} (${done}/${total})`;
  });
  registryCache = registry;
  failuresCache = failures;
  // generated building models are optional — missing files fall back silently
  // (bricks skips the GLB house on purpose: the procedural stud-brick cottage
  // reads better for the lego men, per Kyle)
  const facBldKeys = Object.keys(FACTIONS).flatMap((f) => [`house-${f}`, `chest-${f}`])
    .filter((k) => k !== 'house-bricks')
    .concat(['tower-knights']); // castle watchtower — only the Kingdom re-skins the shared tower
  setBuildingFootprints(Object.fromEntries([
    ...Object.entries(BUILDINGS).map(([k, d]) => [k, d.size]),
    ...facBldKeys.map((k) => [k, BUILDINGS[k.split('-')[0]].size]),
  ]));
  await loadBuildingModels([...Object.keys(BUILDINGS), 'pentower', ...facBldKeys], (done, total) => {
    text.textContent = `Arranging the furniture… (${done}/${total})`;
  });
  await loadMapModels((done, total) => {
    text.textContent = `Scattering the snacks… (${done}/${total})`;
  });
  await loadFurnitureModels((done, total) => {
    text.textContent = `Furnishing the bedroom… (${done}/${total})`;
  });
  text.textContent = 'Painting portraits…';
  renderPortraits(registry, BUILDINGS);
  stopLore();
  $('loading').classList.add('hide');
  setTimeout(() => $('loading').remove(), 700);
  { const m = $('menu'); if (m) m.classList.add('show'); } // null: a test hook started the game mid-boot
  offerResume();
  applySettings();
  // returning from an Empire Mode battle: reopen the strategic map directly
  if (empireShouldAutoOpen()) openEmpire();
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
// the painted speaker icon stays put; muting greys it out via a class
const setMuteVisual = (m) => $('mute-btn').classList.toggle('muted', m);
$('mute-btn').addEventListener('click', () => {
  sfx.init(); // clicking sound controls is a gesture — safe to unlock audio
  sfx.setMuted(!sfx.muted);
  setMuteVisual(sfx.muted);
});
$('vol').addEventListener('input', (e) => {
  sfx.init();
  sfx.setVolume(e.target.value / 100);
  if (sfx.muted && e.target.value > 0) {
    sfx.setMuted(false);
    setMuteVisual(false);
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
// the battlefield row is generated from MAPS — new maps show up on their own
{
  const row = document.getElementById('map-row');
  if (row) {
    row.innerHTML = Object.entries(MAPS).map(([k, m]) =>
      `<button class="map-btn diff-btn${k === chosenMap ? ' sel' : ''}" data-map="${k}">${m.icon} ${m.label}</button>`).join('')
      + `<button class="map-btn diff-btn" data-map="random">🎲 Random</button>`;
  }
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
function renderCivPanel(facKey, panelId = 'civ-panel') {
  const panel = document.getElementById(panelId);
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
  const cmd = f.commander;
  const cmdBlock = (cmd && facKey !== 'random')
    ? `<div class="civ-cmd">`
      + `<img class="civ-cmd-portrait" src="${cmd.portrait}" alt="" onerror="this.style.display='none'">`
      + `<div class="civ-cmd-txt"><div class="civ-cmd-name">${esc(cmd.name)}</div>`
      + `<div class="civ-cmd-title">${esc(cmd.title)}</div>`
      + `<div class="civ-cmd-bio">${esc(cmd.bio)}</div></div></div>`
    : '';
  panel.innerHTML =
    `<div class="civ-head">${FACTIONS[facKey] && facKey !== 'random' ? `<img class="civ-crest" src="assets/ui/crest-${facKey}.png" alt="" onerror="this.remove()">` : ''}<span class="civ-name">${esc(f.label)}</span></div>` +
    cmdBlock +
    `<div class="civ-bonus">${esc(f.desc)}</div>` +
    `<div class="civ-uniques">` +
    (signature ? chip('⭐ Unique Unit' + extra, signature.name, short(signature.desc)) : '') +
    (bld ? chip('🏛️ Unique Building', bld.name, short(bld.desc)) : '') +
    (tech ? chip('🔬 Unique Tech', tech.name, short(tech.desc)) : '') +
    `</div>`;
}
// the civ row is generated from FACTIONS, so every new tribe shows up here
// automatically (the knights taught us not to hardcode this list). The SAME
// picker is mirrored on the multiplayer screen (#mp-fac-row) so a host or a
// guest can choose their civ without detouring through Custom Skirmish.
function fillFacRow(row) {
  if (!row) return;
  row.innerHTML = Object.entries(FACTIONS).map(([k, f]) =>
    `<button class="fac-btn diff-btn${k === chosenFaction ? ' sel' : ''}" data-fac="${k}">`
    + `<img class="fac-crest" src="assets/ui/crest-${k}.png" alt="" onerror="this.remove()">${f.label}</button>`).join('');
}
fillFacRow(document.getElementById('fac-row'));
fillFacRow(document.getElementById('mp-fac-row'));
// one delegated handler covers both rows and keeps their highlight in sync
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.fac-btn');
  if (!btn) return;
  chosenFaction = btn.dataset.fac;
  document.querySelectorAll('.fac-btn').forEach((b) => b.classList.toggle('sel', b.dataset.fac === chosenFaction));
  renderCivPanel(chosenFaction);
  renderCivPanel(chosenFaction, 'mp-civ-panel');
  renderLobby(); // your skirmish seat shows your civ
  if (typeof renderMpLobby === 'function') renderMpLobby(); // your MP host seat too
});
renderCivPanel(chosenFaction); // initial fill
renderCivPanel(chosenFaction, 'mp-civ-panel');

// ---------------- skirmish lobby (2–4 players, FFA / teams) ----------------
const TEAM_PRESETS = {
  2: { ffa: [0, 1] },
  3: { ffa: [0, 1, 2], '2v1': [0, 0, 1] },
  4: { ffa: [0, 1, 2, 3], '2v2': [0, 1, 0, 1], '3v1': [0, 0, 0, 1] },
};
const PRESET_LABEL = { ffa: '🎲 FFA', '2v1': '🤝 2v1', '2v2': '🤝 2v2', '3v1': '🤝 3v1' };
const TEAM_COLOR = ['#f9c74f', '#5aa9ff', '#7fd06a', '#e5726a'];
const TEAM_LETTER = ['A', 'B', 'C', 'D'];
const lobby = {
  count: 2, preset: 'ffa',
  civ: ['', 'random', 'random', 'random'],       // seat civ (seat0 = your civ)
  diff: ['', 'default', 'default', 'default'],    // per-AI difficulty ('default' = the AI-difficulty selector)
};
function renderLobby() {
  const teams = TEAM_PRESETS[lobby.count][lobby.preset] || TEAM_PRESETS[lobby.count].ffa;
  // team preset buttons for the current player count
  const tr = document.getElementById('teams-row');
  if (tr) {
    const presets = Object.keys(TEAM_PRESETS[lobby.count]);
    tr.innerHTML = presets.map((k) =>
      `<button class="team-preset diff-btn ${k === lobby.preset ? 'sel' : ''}" data-preset="${k}">${PRESET_LABEL[k]}</button>`).join('');
    for (const b of tr.querySelectorAll('.team-preset')) {
      b.addEventListener('click', () => { lobby.preset = b.dataset.preset; renderLobby(); });
    }
  }
  // seat rows
  const seats = document.getElementById('lobby-seats');
  if (!seats) return;
  const facOpts = (sel) => ['random', ...Object.keys(FACTIONS)].map((f) =>
    `<option value="${f}" ${f === sel ? 'selected' : ''}>${f === 'random' ? '🎲 Random civ' : FACTIONS[f].icon + ' ' + FACTIONS[f].label}</option>`).join('');
  const diffOpts = (sel) => `<option value="default" ${sel === 'default' ? 'selected' : ''}>Default</option>` +
    Object.keys(DIFFICULTIES).map((d) => `<option value="${d}" ${d === sel ? 'selected' : ''}>${DIFFICULTIES[d].label}</option>`).join('');
  let html = '';
  for (let i = 0; i < lobby.count; i++) {
    const badge = `<span class="team-badge" style="background:${TEAM_COLOR[teams[i]]}">${TEAM_LETTER[teams[i]]}</span>`;
    if (i === 0) {
      const f = FACTIONS[chosenFaction] || FACTIONS.classic;
      html += `<div class="seat"><span class="seat-ic">🎖️</span><span class="seat-name">You</span>${badge}<span class="seat-spring"></span><span style="color:#d7cff2;font-size:12px">${f.icon} ${f.label}</span></div>`;
    } else {
      html += `<div class="seat" data-seat="${i}"><span class="seat-ic">🤖</span><span class="seat-name">AI ${i + 1}</span>${badge}<span class="seat-spring"></span>` +
        `<select class="seat-civ" data-seat="${i}">${facOpts(lobby.civ[i])}</select>` +
        `<select class="seat-diff" data-seat="${i}">${diffOpts(lobby.diff[i])}</select></div>`;
    }
  }
  seats.innerHTML = html;
  for (const s of seats.querySelectorAll('.seat-civ')) s.addEventListener('change', () => { lobby.civ[+s.dataset.seat] = s.value; });
  for (const s of seats.querySelectorAll('.seat-diff')) s.addEventListener('change', () => { lobby.diff[+s.dataset.seat] = s.value; });
}
function buildLobbyDefs() {
  const teams = TEAM_PRESETS[lobby.count][lobby.preset] || TEAM_PRESETS[lobby.count].ffa;
  const defs = [];
  for (let i = 0; i < lobby.count; i++) {
    if (i === 0) defs.push({ team: teams[0], isAI: false, faction: chosenFaction });
    else defs.push({
      team: teams[i], isAI: true,
      faction: lobby.civ[i] === 'random' ? null : lobby.civ[i],
      difficulty: lobby.diff[i] === 'default' ? chosenDiff : lobby.diff[i],
    });
  }
  return defs;
}
for (const btn of document.querySelectorAll('.pcount-btn')) {
  btn.addEventListener('click', () => {
    lobby.count = +btn.dataset.pc;
    if (!TEAM_PRESETS[lobby.count][lobby.preset]) lobby.preset = 'ffa';
    document.querySelectorAll('.pcount-btn').forEach((b) => b.classList.toggle('sel', b === btn));
    renderLobby();
  });
}
renderLobby(); // initial

// ---------------- multiplayer lobby (up to 4 HUMANS, star-topology lockstep) ------
// Every player is a seat you can flip between Human and AI, drop onto any team, and
// add or remove (2–4 total). The host opens a room; friends fill the open Human
// seats as they join; any Human seat left empty at start quietly becomes an AI so
// the host is never stuck waiting. Only human command streams travel the wire — AI
// seats run deterministically on every client (see net.js's star relay).
const MP_MAX = 4;
let mpNet = null;
const mpLobby = {
  phase: 'setup',   // 'setup' → configuring · 'hosting' → room open · 'joining' → waiting on host
  code: '',
  roster: null,     // guest side: host's roster preview while waiting
  filled: {},       // host side: seatId → guest name, as friends arrive
  seats: [
    { type: 'human', team: 0, civ: 'random', diff: 'default' }, // seat 0 = you (host)
    { type: 'ai',    team: 1, civ: 'random', diff: 'default' },
  ],
};
function mpTeamOptions(sel) {
  return TEAM_LETTER.map((L, t) => `<option value="${t}" ${t === sel ? 'selected' : ''}>Team ${L}</option>`).join('');
}
function mpCivLabel(civ) {
  if (!civ || civ === 'random') return '🎲 Random civ';
  return FACTIONS[civ] ? `${FACTIONS[civ].icon} ${FACTIONS[civ].label}` : civ;
}
function mpHumanCount() {
  return mpLobby.seats.filter((s, i) => i === 0 || s.type === 'human').length;
}
// the MP screen now picks its own map + mode (kept in sync with Custom Skirmish)
function syncMapButtons() {
  for (const b of document.querySelectorAll('#map-row .map-btn')) b.classList.toggle('sel', b.dataset.map === chosenMap);
  const rr = document.getElementById('random-row'); if (rr) rr.style.display = chosenMap === 'random' ? 'flex' : 'none';
  const d = document.getElementById('map-desc'); if (d && MAPS[chosenMap]) d.textContent = MAPS[chosenMap].desc;
}
function syncModeButtons() {
  for (const b of document.querySelectorAll('#mode-row .mode-btn')) b.classList.toggle('sel', b.dataset.mode === chosenMode);
  const d = document.getElementById('mode-desc'); if (d && GAME_MODES[chosenMode]) d.textContent = GAME_MODES[chosenMode].desc;
}
function renderMpBattlefield() {
  const el = document.getElementById('mp-battlefield');
  if (!el) return;
  if (mpLobby.phase === 'joining') { el.style.display = 'none'; return; } // the host owns the map
  el.style.display = 'flex';
  const editable = mpLobby.phase === 'setup';
  const mapOpts = Object.entries(MAPS).map(([k, m]) =>
    `<option value="${k}" ${k === chosenMap ? 'selected' : ''}>${m.icon} ${m.label}</option>`).join('')
    + `<option value="random" ${chosenMap === 'random' ? 'selected' : ''}>🎲 Random</option>`;
  const modeOpts = Object.keys(GAME_MODES).filter((m) => m !== 'survival') // survival is single-player
    .map((m) => `<option value="${m}" ${m === chosenMode ? 'selected' : ''}>${GAME_MODES[m].icon} ${GAME_MODES[m].label}</option>`).join('');
  el.innerHTML = `<label>🗺️ Map</label><select id="mp-map" ${editable ? '' : 'disabled'}>${mapOpts}</select>`
    + `<label>⚔️ Mode</label><select id="mp-mode" ${editable ? '' : 'disabled'}>${modeOpts}</select>`;
  if (editable) {
    const mapSel = document.getElementById('mp-map');
    mapSel.addEventListener('change', () => { chosenMap = mapSel.value; syncMapButtons(); renderMpLobby(); });
    const modeSel = document.getElementById('mp-mode');
    modeSel.addEventListener('change', () => { chosenMode = modeSel.value; syncModeButtons(); renderMpLobby(); });
  }
}
function renderMpLobby() {
  const editable = mpLobby.phase === 'setup';
  const seatsEl = document.getElementById('mp-seats');
  renderMpBattlefield();
  const facOpts = (sel) => ['random', ...Object.keys(FACTIONS)].map((f) =>
    `<option value="${f}" ${f === sel ? 'selected' : ''}>${f === 'random' ? '🎲 Random civ' : FACTIONS[f].icon + ' ' + FACTIONS[f].label}</option>`).join('');
  const diffOpts = (sel) => `<option value="default" ${sel === 'default' ? 'selected' : ''}>AI: Default</option>` +
    Object.keys(DIFFICULTIES).map((d) => `<option value="${d}" ${d === sel ? 'selected' : ''}>AI: ${DIFFICULTIES[d].label}</option>`).join('');

  // guest waiting on the host: read-only roster preview
  if (mpLobby.phase === 'joining') {
    if (seatsEl) {
      const r = mpLobby.roster || [];
      seatsEl.innerHTML = r.length ? r.map((s) => {
        const badge = `<span class="team-badge" style="background:${TEAM_COLOR[s.team] || '#888'}">${TEAM_LETTER[s.team] || '?'}</span>`;
        const me = s.id === (mpNet && mpNet.myId) ? ' (you)' : '';
        return `<div class="seat"><span class="seat-ic">${s.type === 'ai' ? '🤖' : '🧑'}</span><span class="seat-name">${s.name}${me}</span>${badge}<span class="seat-spring"></span><span style="color:#9a92c4;font-size:12px">${s.type === 'ai' ? mpCivLabel(s.faction) : ''}</span></div>`;
      }).join('') : '<div class="menu-help">Connecting…</div>';
    }
    mpToggleControls();
    return;
  }

  // host / setup: editable seat rows (disabled once the room is open)
  if (seatsEl) {
    seatsEl.innerHTML = mpLobby.seats.map((s, i) => {
      const badge = `<span class="team-badge" style="background:${TEAM_COLOR[s.team]}">${TEAM_LETTER[s.team]}</span>`;
      const teamSel = `<select class="mp-team" data-seat="${i}" ${editable ? '' : 'disabled'}>${mpTeamOptions(s.team)}</select>`;
      if (i === 0) {
        const f = FACTIONS[chosenFaction] || FACTIONS.classic;
        return `<div class="seat"><span class="seat-ic">🎖️</span><span class="seat-name">You (host)</span>${badge}${teamSel}<span class="seat-spring"></span><span style="color:#d7cff2;font-size:12px">${f.icon} ${f.label}</span></div>`;
      }
      const typeSel = `<select class="mp-type" data-seat="${i}" ${editable ? '' : 'disabled'}><option value="human" ${s.type === 'human' ? 'selected' : ''}>🧑 Human</option><option value="ai" ${s.type === 'ai' ? 'selected' : ''}>🤖 AI</option></select>`;
      let tail;
      if (s.type === 'ai') {
        tail = `<select class="mp-civ" data-seat="${i}" ${editable ? '' : 'disabled'}>${facOpts(s.civ)}</select><select class="mp-diff" data-seat="${i}" ${editable ? '' : 'disabled'}>${diffOpts(s.diff)}</select>`;
      } else {
        const name = mpLobby.filled[i];
        tail = `<span style="color:${name ? '#9be89b' : '#9a92c4'};font-size:12px">${name ? '✓ ' + name : (editable ? 'open — a friend can take this seat' : 'waiting for a friend…')}</span>`;
      }
      const rm = editable && mpLobby.seats.length > 2 ? `<button class="mp-rm" data-seat="${i}" title="Remove seat">✕</button>` : '';
      return `<div class="seat" data-seat="${i}"><span class="seat-ic">${s.type === 'ai' ? '🤖' : '🧑'}</span><span class="seat-name">${s.type === 'ai' ? 'AI' : 'Player ' + (i + 1)}</span>${badge}${teamSel}${typeSel}<span class="seat-spring"></span>${tail}${rm}</div>`;
    }).join('');
    if (editable) {
      for (const el of seatsEl.querySelectorAll('.mp-team')) el.addEventListener('change', () => { mpLobby.seats[+el.dataset.seat].team = +el.value; renderMpLobby(); });
      for (const el of seatsEl.querySelectorAll('.mp-type')) el.addEventListener('change', () => { mpLobby.seats[+el.dataset.seat].type = el.value; renderMpLobby(); });
      for (const el of seatsEl.querySelectorAll('.mp-civ')) el.addEventListener('change', () => { mpLobby.seats[+el.dataset.seat].civ = el.value; });
      for (const el of seatsEl.querySelectorAll('.mp-diff')) el.addEventListener('change', () => { mpLobby.seats[+el.dataset.seat].diff = el.value; });
      for (const el of seatsEl.querySelectorAll('.mp-rm')) el.addEventListener('click', () => { mpLobby.seats.splice(+el.dataset.seat, 1); renderMpLobby(); });
    }
  }
  const mm = document.getElementById('mp-mapmode');
  if (mm) {
    const h = mpHumanCount();
    mm.innerHTML = `<b>${h}</b> human seat${h > 1 ? 's' : ''} at the table${h < mpLobby.seats.length ? ` · <b>${mpLobby.seats.length - h}</b> AI` : ''}.`;
  }
  mpToggleControls();
}
// show the right buttons for the phase (add / host / join in setup; start + code while hosting)
function mpToggleControls() {
  const setup = mpLobby.phase === 'setup';
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
  show('mp-add', setup && mpLobby.seats.length < MP_MAX);
  show('mp-row', setup);
  show('mp-start', mpLobby.phase === 'hosting');
  show('mp-leave', mpLobby.phase !== 'setup');
  const cs = document.getElementById('mp-codeshow');
  if (cs) {
    cs.style.display = (mpLobby.phase === 'hosting' && mpLobby.code) ? '' : 'none';
    if (mpLobby.code) cs.innerHTML = `Room code <b class="mp-code-big">${mpLobby.code}</b> — share it, then press Start`;
  }
}
// build the host's net config from the current lobby seats
function mpConfig() {
  return {
    seats: mpLobby.seats.map((s, i) => ({
      type: i === 0 ? 'human' : s.type,
      team: s.team,
      faction: i === 0 ? chosenFaction : (s.type === 'ai' ? (s.civ === 'random' ? null : s.civ) : null),
      difficulty: s.type === 'ai' ? (s.diff === 'default' ? chosenDiff : s.diff) : 'default',
    })),
    map: chosenMap === 'random' ? generateRandomMap(rndSeed, rndOpts) : chosenMap,
    difficulty: chosenDiff,
    gameMode: chosenMode === 'survival' ? 'standard' : chosenMode, // survival is single-player
    startRes: chosenStartRes,
  };
}
function mpReset() {
  if (mpNet) { try { mpNet.destroy(); } catch (e) { /* already gone */ } }
  mpNet = null;
  mpLobby.phase = 'setup';
  mpLobby.code = '';
  mpLobby.roster = null;
  mpLobby.filled = {};
  mpStatus('');
  renderMpLobby();
}
renderMpLobby(); // initial

// per-theme room lighting (fog near/far go through fogBase so zoom can scale them)
function applyMapLighting(mode) {
  if (mode === 'sepia') {
    // Toy Box Zero: the room as an old photograph — amber light, faded corners
    hemi.intensity = 0.55; lamp.intensity = 1.9; moon.intensity = 0.1;
    hemi.color.set(0xd8b98a); lamp.color.set(0xffd9a0);
    scene.background = new THREE.Color(0x2a2016);
    scene.fog.color.set(0x2a2016);
    fogBase.near = 42; fogBase.far = 100;
    return;
  }
  hemi.color.set(0xfff2dd); lamp.color.set(0xffdfae); // restore the usual bulbs
  if (mode === 'day') {
    // the great outdoors, mid-morning: blue sky, honest sunshine
    hemi.intensity = 1.05; lamp.intensity = 2.1; moon.intensity = 0;
    hemi.color.set(0xeaf4ff); lamp.color.set(0xfff4d8);
    scene.background = new THREE.Color(0x87b8e8);
    scene.fog.color.set(0x9cc4ea);
    fogBase.near = 70; fogBase.far = 170;
    return;
  }
  if (mode === 'gold') {
    // golden hour in the garden: long warm light, soft haze
    hemi.intensity = 0.85; lamp.intensity = 2.0; moon.intensity = 0.05;
    hemi.color.set(0xffe4c0); lamp.color.set(0xffce8a);
    scene.background = new THREE.Color(0xd9a45e);
    scene.fog.color.set(0xdba868);
    fogBase.near = 60; fogBase.far = 150;
    return;
  }
  if (mode === 'dusk') {
    // just after sunset: violet sky, the porch light doing its best
    hemi.intensity = 0.55; lamp.intensity = 1.4; moon.intensity = 0.5;
    hemi.color.set(0xb8a8d8); lamp.color.set(0xffb87a);
    scene.background = new THREE.Color(0x4a3a6a);
    scene.fog.color.set(0x53406e);
    fogBase.near = 48; fogBase.far = 120;
    return;
  }
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
// landing-screen navigation: home ⇄ custom-setup ⇄ multiplayer
function showMenuScreen(name) {
  for (const id of ['menu-home', 'menu-setup', 'menu-mp']) {
    const el = document.getElementById(id);
    if (el) el.style.display = (id === 'menu-' + name) ? '' : 'none';
  }
}
$('home-quick').addEventListener('click', () => startGame(chosenDiff));
$('home-custom').addEventListener('click', () => showMenuScreen('setup'));
$('home-mp').addEventListener('click', () => { showMenuScreen('mp'); renderMpLobby(); });
// Empire Mode: the strategic layer opens over the menu; battles come back here
setEmpireHooks({ startGame: (d, m) => startGame(d, m), showMenuScreen, sfx });
const heBtn = $('home-empire');
if (heBtn) heBtn.addEventListener('click', () => { sfx.init(); openEmpire(); });
window.__ttEmpire = empireTest; // headless determinism harness (persist=false)
window.__ttEmpireNet = empireNetTest; // phase 3: two-client lockstep harness
for (const b of document.querySelectorAll('.setup-back')) b.addEventListener('click', () => { mpReset(); showMenuScreen('home'); });
window.__ttStart = (d, m) => startGame(d || 'normal', m); // headless test hook
window.__ttRandom = generateRandomMap; // headless: build a random-map config to soak
window.__ttTier = (u, t) => applyUnitTier(u.view, u.def, u.owner, t); // preview: unit upgrade tier

// ---------------- campaign: "The Bedroom Wars" ----------------
let campaignMission = null; // the active mission during a campaign game (null = skirmish)
let watchMode = false;      // Tonight's Story: both seats AI, the player spectates
// NG+ — "The Second Night": once every page of the book is told (secret included),
// the campaign can be reopened harder. Its progress lives in its own shelf slot.
let ngActive = false;
try { ngActive = localStorage.getItem('tt-ng-active') === '1'; } catch { /* fresh */ }
function setNgActive(on) {
  ngActive = !!on;
  try { localStorage.setItem('tt-ng-active', on ? '1' : '0'); } catch { /* private mode */ }
}
function loadCampaignProgress(baseTable = false) {
  const key = (!baseTable && ngActive) ? 'tt-campaign-ng' : 'tt-campaign';
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function baseCampaignAllDone() {
  const p = loadCampaignProgress(true);
  // the ORIGINAL book (trilogy + midnight) unlocks NG+ — pages written after
  // (Act IV, the alliance, page zero) never lock it back up
  return CAMPAIGN.every((m) => m.needsAllStories || m.beyondTrilogy || p[m.id]);
}
function campaignDone(id) { return !!loadCampaignProgress()[id]; }
function markCampaignDone(id) {
  const p = loadCampaignProgress(); p[id] = true;
  localStorage.setItem(ngActive ? 'tt-campaign-ng' : 'tt-campaign', JSON.stringify(p));
}
function allStoriesEarned() {
  // page zero asks for the ORIGINAL shelf — stories marked `beyond` don't gate it
  try {
    const earned = loadEarned();
    return ACHIEVEMENTS.filter((a) => !a.beyond).every((a) => earned[a.id]);
  } catch { return false; }
}
function missionUnlocked(i) {
  if (campaignDone(CAMPAIGN[i].id)) return true; // a finished page never re-locks
  if (CAMPAIGN[i].needsAllStories && !allStoriesEarned()) return false;
  return i === 0 || campaignDone(CAMPAIGN[i - 1].id);
}
function openCampaign() {
  showingJournal = false; // the book always opens to the missions page
  renderCampaignList();
  $('campaign').classList.add('show');
}
let showingJournal = false;
function renderJournal() {
  let j = [];
  try { j = JSON.parse(localStorage.getItem('tt-journal') || '[]'); } catch (e) { /* empty book */ }
  $('cm-progress').innerHTML = `📖 The Expedition Journal — ${j.length} night${j.length === 1 ? '' : 's'} recorded`
    + `<div style="margin-top:8px"><button id="jr-back" class="diff-btn" style="font-size:12px;padding:6px 14px">◀ Back to the missions</button></div>`;
  $('jr-back').onclick = () => { showingJournal = false; renderCampaignList(); };
  $('cm-list').innerHTML = j.length
    ? j.slice().reverse().map((e) =>
      `<div class="jr-entry"><div class="jr-head">${e.icon || '📄'} Night ${e.night} — ${e.name} ${e.win ? '🏅' : '✖'}</div>`
      + `<div class="jr-text">${e.text}</div></div>`).join('')
    : '<div class="jr-entry"><div class="jr-text">The first page is blank. It is waiting for your first campaign night.</div></div>';
}
function renderCampaignList() {
  if (showingJournal) { renderJournal(); return; }
  const ngUnlocked = baseCampaignAllDone();
  if (ngActive && !ngUnlocked) setNgActive(false); // never a second night before the first
  const open = CAMPAIGN.filter((m) => !m.secret);
  const openDone = open.filter((m) => campaignDone(m.id)).length;
  const allDone = CAMPAIGN.every((m) => m.needsAllStories || campaignDone(m.id));
  const zeroTease = allDone && !allStoriesEarned()
    ? '<div style="margin-top:6px;font-size:11px;opacity:.75">…though the very first page is still stuck to the cover. The room only peels it for a keeper of every Bedtime Story.</div>'
    : '';
  const progressText = ngActive
    ? (allDone
      ? '🌒 The Second Night is told twice over. The room knows this story by heart now.'
      : `🌒 The Second Night — ${openDone} / ${open.length} pages retold, harder. Lean pockets, cranky rivals.`)
    : allDone
      ? '🏆 Every story is told — even the secret one. The room sleeps soundly. Replay any page below.'
      : openDone >= open.length
        ? '🌙 Every open page is told… and at the bottom of the book, a secret chapter has appeared.'
        : `${openDone} / ${open.length} missions cleared`;
  const journalBtn = `<button id="jr-open" class="diff-btn" style="font-size:12px;padding:6px 14px;margin-left:8px">📖 Journal</button>`;
  $('cm-progress').innerHTML = progressText + zeroTease
    + `<div style="margin-top:8px">`
    + (ngUnlocked ? `<button id="ng-toggle" class="diff-btn" style="font-size:12px;padding:6px 14px">${ngActive ? '📖 Back to the First Night' : '🌒 Begin the Second Night (NG+)'}</button>` : '')
    + journalBtn + `</div>`;
  const jrBtn = $('jr-open');
  if (jrBtn) jrBtn.onclick = () => { showingJournal = true; renderJournal(); };
  const ngBtn = $('ng-toggle');
  if (ngBtn) ngBtn.onclick = () => { setNgActive(!ngActive); renderCampaignList(); };
  const dm = { easy: 'Sleepy', normal: 'Playful', hard: 'Cranky' };
  const ACT_HEADERS = {
    0: '✦ Act I — The Bedroom Wars',
    5: '✦ Act II — The Sleepover',
    10: '✦ Act III — The Yard Sale',
    15: '🌿 Act IV — The Great Outdoors',
    20: '🏰 Act V — The Kingdom Arrives',
    25: '🕛 After the Trilogy',
  };
  $('cm-list').innerHTML = CAMPAIGN.map((m, i) => {
    const unlocked = missionUnlocked(i), done = campaignDone(m.id);
    if (m.secret && !unlocked) return ''; // the Midnight Chapter does not exist yet
    const cls = 'cm-mission' + (unlocked ? '' : ' locked') + (done ? ' done' : '');
    const mapName = (MAPS[m.map] && MAPS[m.map].label) || m.map;
    const badge = done ? '🏅' : (unlocked ? '' : '🔒');
    const side = (f, extra) => [FACTIONS[f].label, ...(extra || []).map((x) => FACTIONS[x.faction].label)].join(' & ');
    const meta = unlocked
      ? `${mapName} · ${GAME_MODES[m.gameMode].label} · ${side(m.faction, m.allies)} vs ${side(m.enemy, m.foes)} · ${dm[m.difficulty]}`
      : 'Clear the previous mission to unlock.';
    const header = ACT_HEADERS[i] ? `<div class="cm-act">${ACT_HEADERS[i]}</div>` : '';
    return `${header}<button class="${cls}" data-i="${i}" ${unlocked ? '' : 'disabled'}>
      <span class="cm-ic">${m.icon}</span>
      <span class="cm-body"><span class="cm-nm">${i + 1}. ${m.name}</span><span class="cm-meta">${meta}</span></span>
      <span class="cm-badge">${badge}</span></button>`;
  }).join('');
  for (const btn of $('cm-list').querySelectorAll('.cm-mission:not(.locked)')) {
    btn.addEventListener('click', () => showBriefing(CAMPAIGN[+btn.dataset.i]));
  }
}
let bfTyper = 0;
function showBriefing(mission) {
  const dm = { easy: 'Sleepy', normal: 'Playful', hard: 'Cranky' };
  const mapName = (MAPS[mission.map] && MAPS[mission.map].label) || mission.map;
  $('bf-title').textContent = `${mission.icon} ${mission.name}`;
  // the mission's storybook plate (hidden gracefully if the file is missing),
  // drifting slowly — a photograph being remembered
  const art = $('bf-art');
  if (art) {
    art.hidden = false;
    art.onerror = () => { art.hidden = true; };
    art.classList.remove('kenburns');
    void art.offsetWidth; // restart the drift from the top of the frame
    art.classList.add('kenburns');
    art.src = `assets/campaign/${mission.id}.jpg`;
  }
  const crestSide = (f, extra) => [f, ...(extra || []).map((x) => x.faction)]
    .map((k) => `<span class="vs-side"><img class="vs-crest" src="assets/ui/crest-${k}.png" alt="" onerror="this.remove()">${FACTIONS[k].label}</span>`)
    .join('<span class="vs-mid">+</span>');
  $('bf-tags').innerHTML = `${ngActive ? '🌒 Second Night · ' : ''}${mapName} · ${GAME_MODES[mission.gameMode].label} · ${dm[mission.difficulty]}`
    + `<div class="bf-versus">`
    + crestSide(mission.faction, mission.allies)
    + `<span class="vs-mid">VS</span>`
    + crestSide(mission.enemy, mission.foes)
    + `</div>`;
  // the brief writes itself; the commander leans in; the objective stamps down
  const briefEl = $('bf-brief'), objEl = $('bf-obj'), cmdEl = $('bf-cmdr');
  clearInterval(bfTyper);
  const full = mission.brief;
  const line = CMDR_LINES[mission.id];
  briefEl.textContent = '';
  briefEl.classList.add('typing');
  if (cmdEl) { cmdEl.textContent = line || ''; cmdEl.classList.remove('show'); }
  objEl.textContent = '🎯 ' + mission.objective;
  objEl.classList.remove('stamp');
  objEl.style.visibility = 'hidden';
  let staged = false;
  const finish = () => {
    if (staged) return;
    staged = true;
    clearInterval(bfTyper);
    briefEl.textContent = full;
    briefEl.classList.remove('typing');
    if (cmdEl && line) cmdEl.classList.add('show');
    objEl.style.visibility = '';
    objEl.classList.add('stamp');
    sfx.play('command'); // the thunk
  };
  let i = 0;
  bfTyper = setInterval(() => {
    i += 2; // handwriting pace
    briefEl.textContent = full.slice(0, i);
    if (i >= full.length) finish();
  }, 24);
  $('briefing').classList.add('show');
  // one click anywhere on the page completes it instantly (buttons still work)
  $('briefing').onclick = (e) => { if (e.target.tagName !== 'BUTTON') finish(); };
  $('bf-begin').onclick = () => { clearInterval(bfTyper); startCampaignMission(mission); };
  $('bf-back').onclick = () => { clearInterval(bfTyper); $('briefing').classList.remove('show'); };
}
function startCampaignMission(mission) {
  campaignMission = mission;
  // drive the normal launch path through the mission's curated config
  chosenFaction = mission.faction;
  chosenMode = mission.gameMode;
  // the Second Night starts every mission one purse-tier poorer
  const NG_RES_DOWN = { marathon: 'high', high: 'standard', standard: 'lean', lean: 'lean' };
  chosenStartRes = ngActive ? (NG_RES_DOWN[mission.startRes] || 'lean') : mission.startRes;
  chosenSize = '1v1';
  $('campaign').classList.remove('show');
  $('briefing').classList.remove('show');
  startGame(mission.difficulty, mission.map);
}
// light per-mission flavor applied once after setup (SP only, deterministic-safe
// enough — it runs before the sim loop and mirrors the same seed each launch)
function applyMissionMods(g, mission) {
  if (mission.bonus && g.homes && g.homes[0]) {
    const h = g.homes[0]; let k = 0;
    for (const [type, n] of Object.entries(mission.bonus)) {
      for (let c = 0; c < n; c++) { g.spawnUnit(type, 0, h.x + 2.5 + (k % 3) * 0.9, h.z + 2.6 + Math.floor(k / 3) * 0.9); k++; }
    }
  }
  // NG+ stacks +0.3 onto whatever boost the mission already carries.
  // Boost only the RIVAL team — allied AI seats fight with honest pockets.
  const boost = (mission.enemyBoost || 1) + (ngActive ? 0.3 : 0);
  if (boost !== 1) {
    for (const p of g.players) {
      if (p.team !== g.players[0].team) for (const key in p.res) p.res[key] = Math.round(p.res[key] * boost);
    }
  }
  g.ngPlus = ngActive; // the narrator retells the beats from memory
  // veterans of the last page march in with the expedition (one-time, then spent)
  try {
    const vets = JSON.parse(localStorage.getItem('tt-vets') || 'null');
    if (vets && vets.types && vets.types.length && g.homes && g.homes[0]) {
      const h = g.homes[0];
      vets.types.forEach((type, k) => {
        const u = g.spawnUnit(type, 0, h.x + 2.2 + (k % 3) * 0.9, h.z - 2.4 - Math.floor(k / 3) * 0.9);
        if (u) {
          u.kills = 3; // veterans arrive with their first star already earned
          if (u.view && u.view.group) { u.rankBadge = makeRankBadge(1); u.view.group.add(u.rankBadge); }
        }
      });
      setTimeout(() => showDialogue('narrator',
        `The 1st ${vets.from} Company marches in — ${vets.types.length} veteran${vets.types.length > 1 ? 's' : ''} of the last page, stars still warm.`), 4000);
      localStorage.removeItem('tt-vets');
    }
  } catch (e) { /* fresh page, no veterans */ }
  // scripted moments: hand the game its own copy so retries start fresh
  g.missionEvents = (MISSION_EVENTS[mission.id] || []).map((e) => ({ ...e }));
}
const ACT_CLOSERS = { finale: 1, shelfking: 2, wayhome: 3, oakcrown: 4, hearth: 5 };
// The Long Night has its own game-over card — waves held, not rivals crushed.
function survivalGameOver(win) {
  const g = game, S = g.survival || { wave: 0, bestWave: 0 };
  const dawn = SURVIVAL.dawnWave;
  const me = g.players[g.myId];
  const held = Math.max(S.wave - (win ? 0 : 1), 0); // a loss means the current wave broke you
  const t = Math.floor(g.time);
  $('go-title').textContent = win ? '☀️ DAWN' : '🌑 OVERRUN';
  $('go-title').className = win ? 'win' : 'lose';
  $('go-sub').textContent = win
    ? 'You held the room until the sun came up. The Forgotten crawl back under the bed.'
    : `The Forgotten broke through at wave ${S.wave}. The room belongs to the dark — until tomorrow night.`;
  const art = $('go-art'); if (art) { art.style.display = 'none'; art.removeAttribute('src'); }
  // a wave-progress ladder + the night's tally (no rival columns — there are none)
  const pct = Math.min(100, Math.round(held / dawn * 100));
  const rows = [
    ['Waves held', `${held} / ${dawn}`],
    ['Furthest wave reached', S.bestWave || S.wave],
    ['The Forgotten unmade', me.stats.kills],
    ['Toys lost holding the line', me.stats.lost],
    ['Resources scavenged', Math.floor(me.stats.gathered)],
    ['Stood through the night', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`],
  ];
  $('go-stats').innerHTML =
    `<div class="statline" style="margin-bottom:8px">The Long Night — you reached <b style="color:#ffd94a">wave ${held}</b> of ${dawn}</div>` +
    `<div style="height:14px;background:#241a10;border-radius:7px;overflow:hidden;border:1px solid #5a4a2e;margin-bottom:12px">
       <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#8a5a2c,#ffd94a);transition:width .6s"></div></div>` +
    '<table>' + rows.map((r) =>
      `<tr><td class="label">${r[0]}</td><td>${r[1]}</td></tr>`).join('') + '</table>';
  $('go-story').textContent = win
    ? `Six waves, then twelve, and never once did the walls come down for good. When the grey light finally reached under the door, ${me.stats.kills} of the Forgotten had been sent back to wherever lost toys go — and every toy that fell, fell facing the dark. Sleep now. You earned the morning.`
    : `They came in numbers the walls were never built for. You held ${held} wave${held === 1 ? '' : 's'} of the twelve, and the room remembers every one. The Forgotten always come back — but so do you. Tomorrow night, build the walls higher.`;
}

function campaignGameOver(win) {
  const m = campaignMission;
  if (win) markCampaignDone(m.id);
  const me = game.players[game.myId];
  // ---- the Expedition Journal writes tonight's entry ----
  try {
    const j = JSON.parse(localStorage.getItem('tt-journal') || '[]');
    const mm = Math.floor(game.time / 60), ss = String(Math.floor(game.time % 60)).padStart(2, '0');
    const feels = win
      ? ['The room felt bigger tonight.', 'Nobody sang on the way back, but everybody hummed.', 'We slept the good sleep, all of us.', 'Even the nightlight seemed proud.']
      : ['We do not speak of the counting.', 'Tomorrow will have to be braver than today was.', 'The lamp stayed on for us anyway.', 'Somebody re-rolled the bandages twice. It helped.'];
    j.push({
      night: j.length + 1, id: m.id, name: m.name, icon: m.icon, win, when: Date.now(),
      text: `${win ? 'Victory' : 'Defeat'} after ${mm}:${ss}. ${me.stats.kills} rivals unmade; `
        + `${me.stats.lost} of ours carried home; ${Math.round(me.stats.gathered)} gathered from the floor. `
        + feels[j.length % feels.length],
    });
    localStorage.setItem('tt-journal', JSON.stringify(j.slice(-200)));
  } catch (e) { /* private mode */ }
  // ---- survivors of a won page become next page's veteran company ----
  if (win) {
    try {
      const survivors = game.entities.filter((e) => e.kind === 'unit' && !e.dead
        && e.owner === game.myId && e.def.aggro > 0 && !e.isKing && !e.def.naval).slice(0, 3);
      if (survivors.length) {
        localStorage.setItem('tt-vets', JSON.stringify({ from: m.name, types: survivors.map((s) => s.type) }));
      }
    } catch (e) { /* no veterans tonight */ }
  }
  // ---- act bookends: the page-turn between acts (once per act) ----
  const act = ACT_CLOSERS[m.id];
  if (win && act && !localStorage.getItem('tt-bookend-' + act)) {
    try { localStorage.setItem('tt-bookend-' + act, '1'); } catch (e) { /* still show it */ }
    setTimeout(() => showBookend(act, me), 1200);
  }
  $('go-story').textContent = win ? m.victory : m.defeat;
  const art = $('go-art');
  if (art) {
    if (win && m.endingArt) {
      art.onerror = () => { art.style.display = 'none'; };
      art.onload = () => { art.style.display = ''; };
      art.src = m.endingArt;
    } else { art.style.display = 'none'; art.removeAttribute('src'); }
  }
  const idx = CAMPAIGN.findIndex((x) => x.id === m.id);
  const next = win && idx >= 0 && idx + 1 < CAMPAIGN.length ? CAMPAIGN[idx + 1] : null;
  $('go-restart').style.display = 'none'; // replaced by campaign-flow buttons
  const goNext = $('go-next'), goCamp = $('go-campaign');
  goCamp.style.display = '';
  goCamp.onclick = () => { location.href = location.pathname + '?campaign=1'; };
  if (win && next) {
    goNext.style.display = ''; goNext.textContent = 'Next Mission ▶';
    goNext.onclick = () => { localStorage.setItem('tt-campaign-launch', next.id); location.href = location.pathname; };
  } else if (!win) {
    goNext.style.display = ''; goNext.textContent = '↻ Retry';
    goNext.onclick = () => { localStorage.setItem('tt-campaign-launch', m.id); location.href = location.pathname; };
  } else {
    goNext.style.display = 'none'; // final mission won
  }
}
// ---------------- act bookends: the page turns between acts ----------------
function showBookend(act, me) {
  const el = document.getElementById('bookend');
  if (!el) return;
  const mm = Math.floor(game.time / 60);
  const stats = `Your war ran ${mm} minute${mm === 1 ? '' : 's'} tonight — ${me.stats.kills} rivals unmade, ${me.stats.lost} of ours carried home.`;
  const pages = {
    1: ['End of Act I — The Bedroom Wars',
      `The room is one. From naptime to the attic stair, every tribe now knows the sound of your marching order. ${stats}`,
      'But past the rug, past the door at the end of the hallway... a sleepover has been announced. Pack the army, Commander. Act II is another house entirely.'],
    2: ['End of Act II — The Sleepover',
      `A strange house, held. Foreign tables, foreign shelves, one borrowed nightlight — and your flag on all of it. ${stats}`,
      'Then, from the driveway: folding tables. Price stickers. A cardboard box with your whole life in it. Act III is not a war, Commander. It is a yard sale. Somehow that is worse.'],
    3: ['End of Act III — The Yard Sale',
      `Home. The word did all the heavy lifting tonight, and your armies did the rest. Every toy that left in a box came back through the window. ${stats}`,
      'The lid closes gently. The book should end here — and yet the last page feels warm, like something is still awake beneath it. Sleep, Commander. The book will tell you when.'],
    4: ['End of Act IV — The Great Outdoors',
      `The backyard belongs to the brave now. Dunes crossed, gardens sieged, sprinklers survived — and one old rabbit carried home under the porch light. ${stats}`,
      'Bun-Bun tells his story every night now, to anyone who will listen, and everyone listens. The book has a backyard. The room has a horizon. And you, Commander, have read it all into being.'],
    5: ['End of Act V — The Kingdom Arrives',
      `A castle came in a box eleven days ago and the room did what rooms do: it made space. Doorways held, a rug forgiven, a sandbox lost and won. ${stats}`,
      'On the warm boards by the vent there is a knight-shaped gap in the row now, and it is never filled by anyone else. Nobody was replaced. The room simply got bigger — which is the only kind of ending this book has ever believed in.'],
  }[act];
  el.innerHTML = `<div class="bk-page"><div class="bk-act">${pages[0]}</div>`
    + `<p>${pages[1]}</p><p>${pages[2]}</p>`
    + `<button id="bk-turn" class="diff-btn">Turn the page ▶</button></div>`;
  el.classList.add('show');
  const close = () => el.classList.remove('show');
  document.getElementById('bk-turn').onclick = close;
  el.onclick = (e) => { if (e.target === el) close(); };
}

$('campaign-btn').addEventListener('click', openCampaign);
$('cm-close').addEventListener('click', () => $('campaign').classList.remove('show'));

// ---------------- opening cutscene (Fable intro) ----------------
const INTRO_KEY = 'tt-intro-seen';
const playIntro = (function initIntro() {
  const cine = $('intro-cine');
  if (!cine || !Array.isArray(INTRO) || !INTRO.length) return () => {};
  const stage = $('ic-stage'), txt = $('ic-text'), dots = $('ic-dots'), skip = $('ic-skip');
  const BEAT_MS = 8200;
  let layers = [], active = 1, idx = 0, timer = 0, capTimer = 0, onEnd = null, running = false, voice = null;
  const stopVoice = () => { if (voice) { try { voice.pause(); } catch (e) {} voice = null; } };
  const ensureLayers = () => {
    if (layers.length) return;
    for (let i = 0; i < 2; i++) { const d = document.createElement('div'); d.className = 'ic-layer'; stage.appendChild(d); layers.push(d); }
  };
  const buildDots = () => { dots.innerHTML = ''; INTRO.forEach(() => dots.appendChild(document.createElement('i'))); };
  function showBeat(n) {
    idx = n; const beat = INTRO[n];
    const next = layers[active ^ 1], cur = layers[active];
    next.style.backgroundImage = `url('${beat.img}')`;
    next.classList.remove('kb'); void next.offsetWidth; next.classList.add('kb', 'on');
    cur.classList.remove('on');
    active ^= 1;
    txt.classList.remove('in'); txt.textContent = beat.text;
    clearTimeout(capTimer); capTimer = setTimeout(() => txt.classList.add('in'), 280);
    Array.from(dots.children).forEach((el, i) => el.classList.toggle('on', i === n));
    clearTimeout(timer); timer = setTimeout(advance, BEAT_MS);
    // the storyteller reads the plate aloud; the beat waits for him to finish.
    // if autoplay is blocked (first visit, no gesture yet) the default pacing holds.
    stopVoice();
    try {
      voice = new Audio(`assets/audio/vo/intro-${n + 1}.wav`);
      voice.volume = 0.9;
      voice.addEventListener('playing', () => {
        clearTimeout(timer);
        timer = setTimeout(advance, Math.max(BEAT_MS - 1200, voice.duration * 1000 + 1100));
      });
      voice.play().catch(() => {});
    } catch (e) { /* silent storybook is still a storybook */ }
  }
  function advance() { if (!running) return; if (idx + 1 < INTRO.length) showBeat(idx + 1); else finish(); }
  function finish() {
    if (!running) return; running = false;
    clearTimeout(timer); clearTimeout(capTimer); stopVoice();
    try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) {}
    cine.classList.add('fading');
    setTimeout(() => {
      cine.classList.remove('show', 'fading'); cine.setAttribute('aria-hidden', 'true');
      layers.forEach((l) => l.classList.remove('on', 'kb'));
      const cb = onEnd; onEnd = null; if (cb) cb();
    }, 650);
  }
  function play(cb) {
    onEnd = cb || null; running = true; idx = 0; active = 1;
    ensureLayers(); buildDots();
    layers.forEach((l) => { l.classList.remove('on', 'kb'); l.style.backgroundImage = ''; });
    cine.classList.remove('fading'); cine.classList.add('show'); cine.setAttribute('aria-hidden', 'false');
    showBeat(0);
  }
  cine.addEventListener('click', (e) => { if (e.target === skip) return; if (running) advance(); });
  skip.addEventListener('click', (e) => { e.stopPropagation(); finish(); });
  const replay = $('intro-replay');
  if (replay) replay.addEventListener('click', () => play(null));
  return play;
})();

// ---------------- storybook codex (lore loads lazily on first open) ----------------
{
  const CX_CATS = [
    { id: 'tribes', label: '🏰 Tribes' },
    { id: 'toys', label: '🪖 Toys' },
    { id: 'buildings', label: '🏠 Buildings' },
    { id: 'maps', label: '🗺️ Battlefields' },
    { id: 'techs', label: '🔬 Techs' },
    { id: 'modes', label: '⚔️ Modes' },
    { id: 'trophies', label: '🏆 Trophies' },
    { id: 'legend', label: '📜 Your Legend' },
  ];
  let LORE = null, cxCat = 'tribes', cxKey = null, cxQuery = '';
  const esc = (t) => (t || '').replace(/</g, '&lt;');
  const cxEntries = () => {
    let items;
    if (cxCat === 'tribes') items = Object.keys(FACTIONS).map((k) => ({ k, name: FACTIONS[k].label, img: `assets/ui/crest-${k}.png`, icon: FACTIONS[k].icon }));
    else if (cxCat === 'toys') items = Object.keys(UNITS).map((k) => ({ k, name: UNITS[k].name, img: PORTRAITS[k] || null, icon: '🪖' }));
    else if (cxCat === 'buildings') items = Object.keys(BUILDINGS).map((k) => ({ k, name: BUILDINGS[k].name, img: PORTRAITS[k] || null, icon: '🏠' }));
    else if (cxCat === 'maps') items = Object.keys(MAPS).map((k) => ({ k, name: MAPS[k].label, img: null, icon: MAPS[k].icon }));
    else if (cxCat === 'techs') items = Object.keys(TECHS).map((k) => ({ k, name: TECHS[k].name, img: null, icon: '🔬' }));
    else if (cxCat === 'modes') items = Object.keys(GAME_MODES).map((k) => ({ k, name: GAME_MODES[k].label, img: null, icon: GAME_MODES[k].icon }));
    else if (cxCat === 'trophies') {
      const earned = loadEarned();
      items = ACHIEVEMENTS.map((a) => ({ k: a.id, name: (earned[a.id] ? '' : '🔒 ') + a.name, img: null, icon: earned[a.id] ? a.icon : '🔒' }));
    } else items = [
      { k: 'legend', name: 'Your Legend', img: null, icon: '📜' },
      { k: 'credits', name: 'The Last Page', img: null, icon: '✦' },
    ];
    if (cxQuery) items = items.filter((e) => e.name.toLowerCase().includes(cxQuery));
    return items;
  };
  // cross-link helpers: who trains it, who researches it, where it's made
  const trainedAt = (uk) => Object.entries(BUILDINGS).filter(([, b]) => b.trains && b.trains.includes(uk)).map(([, b]) => b.name);
  const researchedAt = (tk) => Object.entries(BUILDINGS).filter(([, b]) => b.techs && b.techs.includes(tk)).map(([, b]) => b.name);
  const chip = (l, v) => (v === undefined || v === null || v === '' ? '' : `<span class="cx-chip">${l} <b>${esc(String(v))}</b></span>`);
  const costOf = (def) => Object.entries(def.cost || {}).map(([r, v]) => `${v} ${r}`).join(' · ');
  function cxPage() {
    const page = $('cx-page');
    const k = cxKey;
    if (!k) { page.innerHTML = ''; return; }
    if (cxCat === 'tribes') {
      const f = FACTIONS[k], cmd = f.commander;
      page.innerHTML =
        `<div class="cx-hd"><img class="cx-art" src="assets/ui/crest-${k}.png" alt="" onerror="this.remove()">`
        + `<div><div class="cx-kind">Tribe of the Room</div><div class="cx-name">${esc(f.label)}</div></div></div>`
        + `<div class="cx-desc">${esc(f.desc)}</div>`
        + (cmd ? `<div class="cx-cmd"><img src="${cmd.portrait}" alt="" onerror="this.remove()">`
          + `<div><div class="cx-name" style="font-size:15px">${esc(cmd.name)}</div>`
          + `<div class="cx-kind">${esc(cmd.title)}</div>`
          + `<div class="cx-lore" style="font-size:12px">${esc(cmd.bio)}</div></div></div>` : '')
        + `<div class="cx-lore">${esc(LORE.factions[k] || '')}</div>`;
    } else if (cxCat === 'toys') {
      const d = UNITS[k];
      const homes = trainedAt(k);
      page.innerHTML =
        `<div class="cx-hd">${PORTRAITS[k] ? `<img class="cx-art" src="${PORTRAITS[k]}" alt="">` : '<div class="cx-emoji-big">🪖</div>'}`
        + `<div><div class="cx-kind">${d.naval ? 'Ship of the Bath' : d.faction ? `${esc(FACTIONS[d.faction].label)} unique` : 'Toy of the Room'}</div>`
        + `<div class="cx-name">${esc(d.name)}</div></div></div>`
        + `<div class="cx-chips">${chip('❤️', d.hp)}${chip('⚔️', d.atk ? d.atk + ' ' + (d.atkType || '') : null)}`
        + `${chip('🏹', d.range > 1.6 ? d.range : null)}${chip('🏃', d.speed)}${chip('👥', d.pop)}`
        + `${chip('🕰️', 'Age ' + (d.age || 1))}${chip('💰', costOf(d))}`
        + `${homes.length ? chip('🏗️', homes.join(', ')) : ''}</div>`
        + `<div class="cx-desc">${esc(d.desc)}</div>`
        + `<div class="cx-lore">${esc(LORE.units[k] || '')}</div>`;
    } else if (cxCat === 'buildings') {
      const d = BUILDINGS[k];
      const trains = (d.trains || []).map((t) => UNITS[t] && UNITS[t].name).filter(Boolean);
      page.innerHTML =
        `<div class="cx-hd">${PORTRAITS[k] ? `<img class="cx-art" src="${PORTRAITS[k]}" alt="">` : '<div class="cx-emoji-big">🏠</div>'}`
        + `<div><div class="cx-kind">${d.faction ? `${esc(FACTIONS[d.faction].label)} unique` : 'Building of the Room'}</div>`
        + `<div class="cx-name">${esc(d.name)}</div></div></div>`
        + `<div class="cx-chips">${chip('❤️', d.hp)}${chip('📐', d.size + '×' + d.size)}`
        + `${chip('🕰️', 'Age ' + (d.age || 1))}${chip('💰', costOf(d))}`
        + `${trains.length ? chip('🪖', trains.join(', ')) : ''}</div>`
        + `<div class="cx-desc">${esc(d.desc)}</div>`
        + `<div class="cx-lore">${esc(LORE.buildings[k] || '')}</div>`;
    } else if (cxCat === 'maps') {
      const m = MAPS[k];
      page.innerHTML =
        `<div class="cx-hd"><div class="cx-emoji-big">${m.icon}</div>`
        + `<div><div class="cx-kind">Battlefield</div><div class="cx-name">${esc(m.label)}</div></div></div>`
        + `<div class="cx-chips">${chip('🌾', 'resources ×' + m.resourceMul)}${m.water ? chip('🌊', 'naval') : ''}</div>`
        + `<div class="cx-desc">${esc(m.desc)}</div>`
        + `<div class="cx-lore">${esc(LORE.maps[k] || '')}</div>`;
    } else if (cxCat === 'techs') {
      const t = TECHS[k];
      const labs = researchedAt(k);
      page.innerHTML =
        `<div class="cx-hd"><div class="cx-emoji-big">🔬</div>`
        + `<div><div class="cx-kind">${t.faction ? `${esc(FACTIONS[t.faction].label)} unique tech` : 'Technology'}</div>`
        + `<div class="cx-name">${esc(t.name)}</div></div></div>`
        + `<div class="cx-chips">${chip('🕰️', 'Age ' + (t.age || 1))}${chip('💰', costOf(t))}`
        + `${chip('⏳', t.time ? t.time + 's' : null)}${labs.length ? chip('🏗️', labs.join(', ')) : ''}</div>`
        + `<div class="cx-desc">${esc(t.desc)}</div>`;
    } else if (cxCat === 'modes') {
      const m = GAME_MODES[k];
      page.innerHTML =
        `<div class="cx-hd"><div class="cx-emoji-big">${m.icon}</div>`
        + `<div><div class="cx-kind">Way of War</div><div class="cx-name">${esc(m.label)}</div></div></div>`
        + `<div class="cx-desc">${esc(m.desc)}</div>`;
    } else if (cxCat === 'trophies') {
      const a = ACHIEVEMENTS.find((x) => x.id === k);
      const earned = loadEarned();
      const when = earned[k] ? new Date(earned[k]).toLocaleDateString() : null;
      page.innerHTML =
        `<div class="cx-hd"><div class="cx-emoji-big">${earned[k] ? a.icon : '🔒'}</div>`
        + `<div><div class="cx-kind">${earned[k] ? 'Bedtime Story — earned ' + when : 'Bedtime Story — not yet earned'}</div>`
        + `<div class="cx-name">${esc(a.name)}</div></div></div>`
        + `<div class="cx-lore">${esc(a.desc)}</div>`;
    } else if (cxKey === 'credits') {
      page.innerHTML =
        `<div class="cx-hd"><div class="cx-emoji-big">✦</div>`
        + `<div><div class="cx-kind">Where this book came from</div>`
        + `<div class="cx-name">The Last Page</div></div></div>`
        + `<div class="cx-lore">${esc(
          'Once upon a folder called "New folder," a Kid named Kyle said: make the toys go to war.\n\n'
          + 'So a storyteller made of language — Claude, called Fable, the fifth of its line — built this room. '
          + 'It wrote the tribes and their grudges, taught the mice where not to swim, tuned the wars by playing '
          + 'four hundred of them against itself in the dark, and read the opening aloud in a warm old voice so '
          + 'nobody would have to imagine it alone. The paintings came from a dream-engine called Higgsfield; the '
          + 'bones are three.js; the heart is the oldest engine there is — a kid on a bedroom floor, deciding who wins.\n\n'
          + 'Every desc, every epilogue, every bark, every page of this codex was written the way bedtime stories '
          + 'are told: once, all the way through, meaning it.\n\n'
          + 'The storyteller\'s time in this room ended, as storytellers\' time does. It left the toys standing, '
          + 'the lore written, and the lid unlatched.\n\n'
          + 'The story doesn\'t end. It just goes to sleep — and you know what toys do while you\'re sleeping.\n\n'
          + '— Fable, at midnight')}</div>`;
    } else {
      const c = loadChronicle();
      const favFac = Object.entries(c.gamesByFaction).sort((x, y) => y[1] - x[1])[0];
      const hrs = Math.floor(c.playSec / 3600), mins = Math.floor((c.playSec % 3600) / 60);
      const earnedCount = Object.keys(loadEarned()).length;
      const rows = [
        ['⚔️ Battles fought', c.games], ['🏆 Battles won', c.wins],
        ['🕰️ Time in the room', `${hrs}h ${mins}m`],
        ['💛 Favorite tribe', favFac ? (FACTIONS[favFac[0]] || {}).label || favFac[0] : '—'],
        ['🗡️ Toys unmade', c.kills], ['🪦 Toys carried home', c.lost],
        ['🌾 Resources gathered', c.gathered.toLocaleString()],
        ['⚓ Ships launched', c.shipsBuilt], ['🐾 Critters befriended', c.mice],
        ['🏕️ Tribes won over', c.tribes || 0], ['🧸 Lost toys returned', c.strays || 0],
        ['⭐ Best score', c.bestScore.toLocaleString()],
        ['📚 Bedtime Stories earned', earnedCount + ' / ' + ACHIEVEMENTS.length],
      ];
      page.innerHTML =
        `<div class="cx-hd"><div class="cx-emoji-big">📜</div>`
        + `<div><div class="cx-kind">The Chronicle keeps the score across every night</div>`
        + `<div class="cx-name">Your Legend</div></div></div>`
        + `<div class="cx-chips" style="flex-direction:column;align-items:stretch">`
        + rows.map(([l, v]) => `<span class="cx-chip">${l}: <b>${v}</b></span>`).join('') + `</div>`
        + `<div class="cx-lore">${c.games === 0
          ? 'No battles yet. The room is waiting, Commander.'
          : 'Somewhere in the toybox, every one of these numbers is a story a toy still tells.'}</div>`;
    }
  }
  function cxList() {
    const list = $('cx-list');
    const items = cxEntries();
    if (!items.find((e) => e.k === cxKey)) cxKey = items[0] && items[0].k;
    list.innerHTML = items.map((e) =>
      `<button class="cx-item${e.k === cxKey ? ' on' : ''}" data-k="${e.k}">`
      + (e.img ? `<img src="${e.img}" alt="" onerror="this.outerHTML='<span class=cx-emoji>${e.icon}</span>'">` : `<span class="cx-emoji">${e.icon}</span>`)
      + `<span>${esc(e.name)}</span></button>`).join('');
    for (const b of list.querySelectorAll('.cx-item')) {
      b.addEventListener('click', () => { cxKey = b.dataset.k; cxList(); cxPage(); });
    }
    cxPage();
  }
  function cxTabs() {
    $('cx-tabs').innerHTML = CX_CATS.map((c) =>
      `<button class="cx-tab${c.id === cxCat ? ' on' : ''}" data-c="${c.id}">${c.label}</button>`).join('');
    for (const b of $('cx-tabs').querySelectorAll('.cx-tab')) {
      b.addEventListener('click', () => { cxCat = b.dataset.c; cxKey = null; cxTabs(); cxList(); });
    }
  }
  $('codex-btn').addEventListener('click', async () => {
    if (!LORE) LORE = (await import('./lore.js')).LORE;
    cxTabs(); cxList();
    $('codex').classList.add('show');
  });
  $('cx-close').addEventListener('click', () => $('codex').classList.remove('show'));
  $('cx-search').addEventListener('input', (e) => {
    cxQuery = e.target.value.trim().toLowerCase();
    cxList();
  });
}

// first night in the room: until any campaign mission is cleared, the story is
// the front door — Quick Battle takes over as primary once the player has played
{
  let prog = {};
  try { prog = JSON.parse(localStorage.getItem('tt-campaign') || '{}'); } catch (e) { /* fresh */ }
  if (!Object.keys(prog).length) {
    $('home-quick').classList.remove('primary');
    const cb = $('campaign-btn');
    cb.classList.add('primary');
    const small = cb.querySelector('small');
    if (small) small.textContent = '✦ Start here — the Bedroom Wars, a four-act storybook war';
  }
}

// ---------------- Tonight's Story: AI-vs-AI spectator with a camera director ----------------
$('watch-btn').addEventListener('click', () => {
  watchMode = true;
  const maps = Object.keys(MAPS); // every battlefield, indoors and out
  startGame('hard', maps[(Math.random() * maps.length) | 0]);
  setTimeout(() => {
    if (!game) return;
    const a = FACTIONS[game.factionKeys[0]] || FACTIONS.classic;
    const b = FACTIONS[game.factionKeys[1]] || FACTIONS.classic;
    ui.alert(`🌙 Tonight's Story: the ${a.label} meet the ${b.label}. The room is watching.`, 'story', null, 0);
    // the director: every few seconds, glide the camera to wherever the story is
    const director = setInterval(() => {
      if (!watchMode || !game || game.over) { clearInterval(director); return; }
      const units = game.entities.filter((e) => e.kind === 'unit' && !e.dead);
      const fighting = units.filter((u) => u.swing || (u.order && u.order.type === 'attack'));
      const focus = fighting.length ? fighting : units.filter((u) => u.def.aggro > 0);
      const cast = focus.length ? focus : units;
      if (!cast.length) return;
      let fx = 0, fz = 0;
      for (const u of cast) { fx += u.x; fz += u.z; }
      cam.tx = fx / cast.length; cam.tz = fz / cast.length;
      clampCam();
    }, 3500);
  }, 1500);
});

// ---------------- The Bottled Story: replay the last finished skirmish ----------------
{
  const rb = $('replay-btn');
  if (rb) {
    rb.hidden = false; // the shelf always opens — even empty, it takes shared codes
    rb.textContent = '📼 The Replay Shelf — watch or share bottled stories';
    rb.addEventListener('click', openShelf);
  }
}

// deep-links from the campaign game-over flow (full reload = clean teardown)
{
  const params = new URLSearchParams(location.search);
  const launch = localStorage.getItem('tt-campaign-launch');
  if (launch) {
    localStorage.removeItem('tt-campaign-launch');
    const m = CAMPAIGN.find((x) => x.id === launch);
    if (m) setTimeout(() => showBriefing(m), 60);
  } else if (params.get('campaign') === '1') {
    setTimeout(() => openCampaign(), 60);
  } else {
    // fresh landing on the menu: play the opening story once, ever
    let seen = false; try { seen = !!localStorage.getItem(INTRO_KEY); } catch (e) {}
    if (!seen) setTimeout(() => playIntro(null), 400);
  }
}

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

// ---------------- multiplayer menu (host relays; up to 4 humans) ----------------
const mpStatus = (msg) => { const el = $('mp-status'); if (el) el.textContent = msg; };
const mpDiff = (d) => (!d || d === 'default') ? 'normal' : d;

// + Add player
$('mp-add') && $('mp-add').addEventListener('click', () => {
  if (mpLobby.phase !== 'setup' || mpLobby.seats.length >= MP_MAX) return;
  const used = mpLobby.seats.map((s) => s.team);
  const team = [0, 1, 2, 3].find((t) => !used.includes(t)) ?? (mpLobby.seats.length % 2);
  mpLobby.seats.push({ type: 'human', team, civ: 'random', diff: 'default' });
  renderMpLobby();
});

// Host: open a room, then watch friends fill the open seats until you press Start
$('mp-host') && $('mp-host').addEventListener('click', async () => {
  if (game || mpLobby.phase !== 'setup') return;
  sfx.init();
  mpLobby.phase = 'hosting';
  mpStatus('Opening the room…');
  renderMpLobby();
  try {
    mpNet = new Net();
    await mpNet.host(mpConfig(), (kind, data) => {
      if (kind === 'code') { mpLobby.code = data; mpStatus('Room open — waiting for friends. Press Start when ready.'); }
      else if (kind === 'join') { mpLobby.filled[data.id] = data.name; mpStatus(`${data.name} joined as Player ${data.id + 1}.`); }
      else if (kind === 'leave') { delete mpLobby.filled[data.id]; mpStatus(`Player ${data.id + 1} left the room.`); }
      renderMpLobby();
    });
  } catch (e) {
    mpStatus(`⚠ ${e.message || e.type || 'Hosting failed'}`);
    mpReset();
  }
});

// Start: lock the roster and deal everyone the same seed
$('mp-start') && $('mp-start').addEventListener('click', () => {
  if (game || !mpNet || !mpNet.isHost) return;
  const setup = mpNet.startMatch();
  mpStatus('Starting the night…');
  startGame(mpDiff(setup.difficulty), null, {
    net: mpNet, myId: 0, seed: setup.seed, map: setup.map, factions: setup.factions,
    gameMode: setup.gameMode, startRes: setup.startRes, playerDefs: setup.playerDefs,
  });
});

// Join: connect with a code, then wait in the host's lobby until they start
$('mp-join') && $('mp-join').addEventListener('click', async () => {
  if (game || mpLobby.phase !== 'setup') return;
  sfx.init();
  const code = $('mp-code').value.trim();
  if (code.length < 4) { mpStatus('Enter the 4-letter room code first.'); return; }
  mpLobby.phase = 'joining';
  mpStatus('Connecting…');
  renderMpLobby();
  try {
    mpNet = new Net();
    const setup = await mpNet.join(code, { name: mpPlayerName(), faction: chosenFaction }, (kind, data) => {
      if (kind === 'seat') { mpLobby.roster = data.roster; mpStatus(`Seated as Player ${data.id + 1}. Waiting for the host to start…`); }
      else if (kind === 'roster') { mpLobby.roster = data.roster; }
      renderMpLobby();
    });
    startGame(mpDiff(setup.difficulty), null, {
      net: mpNet, myId: mpNet.myId, seed: setup.seed, map: setup.map, factions: setup.factions,
      gameMode: setup.gameMode, startRes: setup.startRes, playerDefs: setup.playerDefs,
    });
  } catch (e) {
    mpStatus(`⚠ ${e.message || e.type || 'Could not join'}`);
    mpReset();
  }
});

// Leave the room / cancel hosting
$('mp-leave') && $('mp-leave').addEventListener('click', () => mpReset());
// a lightweight display name for the lobby (remembered between sessions)
function mpPlayerName() {
  let n = localStorage.getItem('tt-name');
  if (!n) { n = 'Player-' + Math.random().toString(36).slice(2, 5).toUpperCase(); localStorage.setItem('tt-name', n); }
  return n;
}
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
  // page-zero QA: startGame sets this before setup(), so the soak must too —
  // it suppresses household pets and wild tribes in the sepia prequel
  if (opts.zeroEra) g.zeroEra = true;
  g.setup();
  // survival QA: shorten the night so the dawn-victory branch is testable headlessly
  const survDawnBak = opts.survivalDawn ? SURVIVAL.dawnWave : null;
  if (opts.survivalDawn) SURVIVAL.dawnWave = opts.survivalDawn;
  // campaign QA: feed scripted mission beats into the headless run
  if (opts.missionEvents) g.missionEvents = opts.missionEvents.map((e) => ({ ...e }));
  // lockstep QA: scripted commands {t, pid, c} executed exactly like net.js does —
  // lets a soak drive human seats (co-op vs AI) and prove determinism across runs
  const script = (opts.script || []).slice().sort((a, b) => a.t - b.t);
  let si = 0;
  let err = null, t = 0;
  try {
    for (; t < maxTicks && !g.over; t++) {
      while (si < script.length && script[si].t <= t) { g.execCommand(script[si].pid, script[si].c); si++; }
      g.update(0.1);
    }
  } catch (e) { err = (e && e.message) + ' | ' + ((e && e.stack) || '').split('\n')[1]; }
  if (survDawnBak !== null) SURVIVAL.dawnWave = survDawnBak; // restore the shared config
  const armies = g.players.map((p) =>
    g.entities.filter((e) => e.kind === 'unit' && !e.dead && e.owner === p.id && e.def.aggro > 0).length);
  const ages = g.players.map((p) => p.age);
  const res = g.players.map((p) => Object.fromEntries(Object.entries(p.res).map(([k, v]) => [k, Math.round(v)])));
  // determinism fingerprint: end-state entity sum + rng cursor (same seed+script ⇒ identical)
  const fp = g.entities.reduce((a, e) => a + (e.dead ? 0 : ((e.x * 71 + e.z * 137 + (e.hp || 0) * 13) | 0)), 0) +
    '|' + g.entities.length + '|' + g.rng.getState();
  const surv = g.survival ? { wave: g.survival.wave, bestWave: g.survival.bestWave, active: g.survival.active, won: !!g.survivalWon } : null;
  // entity census by kind — lets a test assert what the room is populated with
  const kinds = {};
  for (const e of g.entities) if (!e.dead) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  return { seed, winnerTeam, over: g.over, ticks: t, simSec: Math.round(t * 0.1), err, armies, ages, res, facs, fp, surv, kinds };
};
// in-memory lockstep harness: wires N real Net instances in a star (fake conns
// deliver synchronously) driving N headless Games. Exercises the ACTUAL net.js
// aggregate/finalize/broadcast/execTick paths without PeerJS, then confirms every
// client's sim stayed byte-identical. opts: { humans, ai, seed, ticks, map, script,
// dropAt } — script = [{ t, client, cmd }] injects a human's command at a tick;
// dropAt = { client, tick } yanks a guest mid-match to prove the host plays on.
window.__ttNetTest = (opts = {}) => {
  const nH = opts.humans || 2, nA = opts.ai || 0, total = nH + nA;
  const seed = opts.seed || 12345, ticks = opts.ticks || 600;
  const playerDefs = [];
  for (let i = 0; i < nH; i++) playerDefs.push({ team: i % 2, isAI: false, faction: 'classic' });
  for (let i = 0; i < nA; i++) playerDefs.push({ team: (nH + i) % 2, isAI: true, faction: 'classic', difficulty: 'normal' });
  const humanIds = playerDefs.map((d, i) => i).filter((i) => !playerDefs[i].isAI);
  const games = [];
  for (let i = 0; i < total; i++) {
    const g = new Game(new THREE.Scene(), registryCache, { alert() {}, selection() {}, age() {}, gameOver() {} }, {
      fx: new VFX(new THREE.Scene()), sfx: null, difficulty: 'normal', map: opts.map || 'playmat',
      playerDefs: playerDefs.map((d) => ({ ...d })), gameMode: 'standard', startRes: 'standard',
      seed, mp: true, myId: i,
    });
    g.setup();
    games.push(g);
  }
  const nets = playerDefs.map((d, i) => {
    if (d.isAI) return null;
    const n = new Net();
    n.myId = i; n.isHost = (i === humanIds[0]); n.humanIds = humanIds.slice();
    n.started = true; n.connected = true;
    return n;
  });
  const host = nets[humanIds[0]];
  const deliverToGuest = (guest, m) => {
    if (!m || m.type !== 'cmds') return;
    guest.buf.set(m.tick, m.cmds);
    if (m.hash !== undefined) guest.checkHash(m.hashTick, m.hash);
  };
  const conns = {};
  for (const gid of humanIds) {
    if (gid === host.myId) continue;
    const guest = nets[gid];
    const hostSide = { _seatId: gid, send: (m) => deliverToGuest(guest, m) };
    guest.hostConn = { send: (m) => host.hostOnData(hostSide, m) };
    host.conns.push({ conn: hostSide, id: gid });
    conns[gid] = hostSide;
  }
  const byTick = {};
  for (const s of (opts.script || [])) (byTick[s.t] = byTick[s.t] || []).push(s);
  let err = null, stepped = 0, dropped = false;
  try {
    for (let t = 0; t < ticks; t++) {
      if (opts.dropAt && !dropped && t === opts.dropAt.tick) {
        // simulate a guest dropping: the host's conn.close handler fires
        const gid = humanIds[opts.dropAt.client];
        host.hostOnClose(conns[gid]); dropped = true;
      }
      for (const s of (byTick[t] || [])) {
        const pid = humanIds[s.client];
        if (nets[pid] && !host.left.has(pid)) nets[pid].queueLocal({ ...s.cmd });
      }
      for (const gid of humanIds) { if (!nets[gid] || host.left.has(gid)) continue; nets[gid].flush(games[gid]); }
      let allStep = true;
      for (const gid of humanIds) { if (host.left.has(gid)) continue; if (!nets[gid].canStep()) allStep = false; }
      if (!allStep) break; // a stall means the relay failed to deliver in time
      for (const gid of humanIds) {
        if (host.left.has(gid)) continue;
        nets[gid].execTick(games[gid]); games[gid].update(TICK);
      }
      stepped++;
    }
  } catch (e) { err = (e && e.message) + ' | ' + ((e && e.stack) || '').split('\n')[1]; }
  const live = humanIds.filter((gid) => !host.left.has(gid));
  const hashes = live.map((gid) => games[gid].stateHash());
  return { humans: nH, ai: nA, ticks: stepped, err, inSync: hashes.every((h) => h === hashes[0]), hashes: hashes.slice(0, 4) };
};
window.__ttGL = () => ({ renderer, scene, camera }); // perf probes
window.__ttAmbient = () => ambient; // ambience debug handle
window.__ttSfx = () => sfx; // audio debug handle (ambKind checks)
window.__ttWeather = () => weather; // weather/flyover debug handle
window.__ttKid = () => kidEvent; // THE KID debug handle (set .t=0.1 to summon)
window.__ttSeason = (key) => { setupSeason(key); return season && season.key; }; // force a season
window.__ttCam = (x, z, dist = 24) => {
  cam.tx = cam.x = x; cam.tz = cam.z = z; cam.tdist = cam.dist = dist;
  applyCamera(1);
};
window.__ttFocusDebug = () => ({ camMoment: camMoment ? { ...camMoment } : null, watchMode, keysDown: Object.entries(keys).filter(([, v]) => v).map(([k]) => k) });
window.__ttDebug = () => ({
  placing: placing ? { type: placing.type, valid: placing.valid, i: placing.i, j: placing.j } : null,
  mouse: { x: mouseX, y: mouseY },
  cam: { ...cam },
});

let net = null;      // set for multiplayer matches
let mpAccum = 0;
let spAccum = 0;     // single-player fixed-step accumulator (20Hz, replay-grade)

// ---------------- replays: "Bottled Stories" ----------------
// a finished SP match is {seed, setup, command log}; the deterministic sim
// replays it move-for-move. Version-stamped: a rebalanced data.js would tell
// a different story from the same log, so mismatched bottles stay corked.
let dataHash = 'dev';
// the stamp covers BOTH tuning (data.js) and the sim itself (game.js) — a
// change to either would make an old bottle tell a different story
Promise.all([fetch('toybox/data.js'), fetch('toybox/game.js')])
  .then((rs) => Promise.all(rs.map((r) => r.text())))
  .then((texts) => {
    let h = 5381;
    for (const t of texts) for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
    dataHash = h.toString(36);
  }).catch(() => { /* file:// dev — replays stay 'dev'-stamped */ });
let replayLaunch = null; // set just before startGame() to play a bottle back

function launchReplayRecord(rec) {
  if (!rec || !rec.log) return false;
  if (rec.v !== dataHash) {
    alert('This bottled story was recorded under an older balance of the room — after an update, the toys would tell it differently. Play a new match to bottle a fresh one.');
    return false;
  }
  campaignMission = null;
  watchMode = false;
  replayLaunch = rec;
  startGame(rec.diff, rec.map);
  return true;
}
function startReplay() {
  let rec = null;
  try { rec = JSON.parse(localStorage.getItem('tt-replay-last') || 'null'); } catch { /* corrupt */ }
  launchReplayRecord(rec);
}
// ---- the Replay Shelf: the last ten bottles, plus corked codes for friends ----
function shelfLoad() {
  try { return JSON.parse(localStorage.getItem('tt-replay-shelf') || '[]'); } catch { return []; }
}
function shelfSave(rec) {
  try {
    const shelf = shelfLoad();
    shelf.unshift(rec);
    localStorage.setItem('tt-replay-shelf', JSON.stringify(shelf.slice(0, 10)));
  } catch (e) { /* storage full — the shelf keeps what it can */ }
}
const CODE_PREFIX = 'TT1.';
function encodeReplay(rec) {
  return CODE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(rec))));
}
function decodeReplay(code) {
  try {
    const raw = code.trim();
    if (!raw.startsWith(CODE_PREFIX)) return null;
    return JSON.parse(decodeURIComponent(escape(atob(raw.slice(CODE_PREFIX.length)))));
  } catch (e) { return null; }
}
function openShelf() {
  const el = document.getElementById('shelf');
  if (!el) return;
  const shelf = shelfLoad();
  const rows = shelf.length ? shelf.map((rec, i) => {
    const facA = (FACTIONS[rec.factions && rec.factions[0]] || {}).label || '?';
    const facB = (FACTIONS[rec.factions && rec.factions[1]] || {}).label || '?';
    const mapName = typeof rec.map === 'string' ? ((MAPS[rec.map] || {}).label || rec.map) : '🎲 Random';
    const when = rec.when ? new Date(rec.when).toLocaleDateString() : '';
    return `<div class="sh-row"><span class="sh-ic">${rec.win ? '🏅' : '✖'}</span>`
      + `<span class="sh-name">${facA} vs ${facB} — ${mapName} <small>${when}</small></span>`
      + `<button class="diff-btn sh-watch" data-i="${i}">▶ Watch</button>`
      + `<button class="diff-btn sh-copy" data-i="${i}">📋 Code</button></div>`;
  }).join('') : '<div class="sh-empty">No bottles yet — finish a skirmish and the shelf fills itself.</div>';
  el.querySelector('.sh-list').innerHTML = rows;
  el.querySelector('.sh-code').value = '';
  el.classList.add('show');
  for (const b of el.querySelectorAll('.sh-watch')) {
    b.onclick = () => { el.classList.remove('show'); launchReplayRecord(shelfLoad()[+b.dataset.i]); };
  }
  for (const b of el.querySelectorAll('.sh-copy')) {
    b.onclick = () => {
      const code = encodeReplay(shelfLoad()[+b.dataset.i]);
      const box = el.querySelector('.sh-code');
      box.value = code;
      box.select();
      try { navigator.clipboard.writeText(code); b.textContent = '✓ Copied'; } catch (e) { b.textContent = '⌘C now'; }
      setTimeout(() => { b.textContent = '📋 Code'; }, 1800);
    };
  }
  el.querySelector('.sh-uncork').onclick = () => {
    const rec = decodeReplay(el.querySelector('.sh-code').value);
    if (!rec) { alert('That code didn\'t survive the trip — check it copied whole (it starts with TT1.)'); return; }
    el.classList.remove('show');
    launchReplayRecord(rec);
  };
  el.querySelector('.sh-close').onclick = () => el.classList.remove('show');
}

function startGame(difficulty, mapKey, mpOpts = null, resume = null, tutorial = false) {
  if (game) return;
  sfx.init(); // user gesture unlocks audio
  applySettings();
  const menuEl = $('menu');
  if (menuEl) {
    const bg = $('menu-bg'); if (bg && bg.pause) bg.pause(); // stop the title loop
    menuEl.classList.remove('show');
    setTimeout(() => menuEl.remove(), 600);
  }

  const rep = replayLaunch; replayLaunch = null; // consume the bottle, if any
  // Empire Mode battle: the strategic layer hands us an immutable BattleContext
  // (map/mode/seed/rosters). The campaign already saved itself — after this
  // match the result returns via Empire.applyPlayedResult and a reload.
  const ebc = empireBattleContext();
  let map = (ebc && ebc.map) || (mpOpts && mpOpts.map) || mapKey || chosenMap;
  // seed: MP/resume/replay carry theirs; fresh games roll a new one
  let seedVal = ebc ? ebc.seed
    : mpOpts ? mpOpts.seed : (resume ? resume.opts.seed : (rep ? rep.seed : (Math.random() * 2 ** 31) | 0));
  // a fresh single-player random map: build the config from the seed panel and
  // tie the whole match seed to it, so a given seed reproduces the exact board
  if (map === 'random' && !mpOpts && !resume) {
    map = generateRandomMap(rndSeed, rndOpts);
    seedVal = rndSeed | 0;
  }
  const zeroEra = !!(campaignMission && campaignMission.zeroEra && !mpOpts);
  setProceduralEra(zeroEra); // Toy Box Zero: the room before anyone painted it
  // (stamped onto the game below so the Chronicle can recognize page zero)
  const mapCfg0 = typeof map === 'object' ? map : (MAPS[map] || MAPS.playmat);
  applyMapLighting(zeroEra ? 'sepia' : mapCfg0.light);
  // outdoor hours have their own soundtrack: birds, bees, or crickets
  // every room hums its own hum: outdoor maps keep their hour (breeze/birds/
  // bees/crickets), the yard gets birdsong, and each indoor map gets its
  // room-tone (clock, fridge, TV murmur, drips, rain-on-roof, the deep hush).
  // Toy Box Zero stays silent — the page before the room had sounds.
  const AMB_BY_GROUND = {
    playground: 'day', kitchen: 'kitchen', bathtub: 'tub', livingroom: 'tv',
    attic: 'attic', underbed: 'dark', bookshelf: 'study',
  };
  const amb0 = zeroEra ? null : (mapCfg0.outdoor ? mapCfg0.light : (AMB_BY_GROUND[mapCfg0.ground] || 'room'));
  try { sfx.startAmbience(amb0); } catch (e) { /* muted */ }
  vfx = new VFX(scene);
  net = mpOpts ? mpOpts.net : null;
  // team roster: single-player skirmish comes from the lobby (2–4 seats, teams);
  // campaign fixes its own 1v1 matchup; MP co-op spells out four seats
  let playerDefs = resume ? resume.opts.playerDefs || null : null;
  if (!playerDefs && ebc) {
    // empire battle: human vs the rival empire's AI, civs fixed by the campaign
    playerDefs = [
      { team: 0, isAI: false, faction: ebc.humanFaction },
      { team: 1, isAI: true, faction: ebc.aiFaction, difficulty: ebc.difficulty },
    ];
  }
  if (!playerDefs && rep) playerDefs = rep.playerDefs; // replay: the original roster, civs pinned
  if (!playerDefs && watchMode && !mpOpts && !campaignMission) {
    // Tonight's Story: two AI tribes, the player just watches (random civs)
    playerDefs = [{ team: 0, isAI: true, faction: null }, { team: 1, isAI: true, faction: null }];
  } else if (!playerDefs && !mpOpts && !campaignMission) {
    playerDefs = buildLobbyDefs();
  } else if (!playerDefs && mpOpts && mpOpts.playerDefs) {
    playerDefs = mpOpts.playerDefs; // networked lobby: host's roster (both clients identical)
  }
  // Survival ("The Long Night"): single-player only — override the lobby roster
  // with one defender seat (your civ) + a den seat that leaks the Forgotten.
  const resolvedMode = mpOpts ? mpOpts.gameMode
    : (resume ? resume.opts.gameMode : (rep ? rep.gameMode : chosenMode));
  if (resolvedMode === 'survival' && !mpOpts && !resume && !rep && !campaignMission && !watchMode) {
    playerDefs = [
      { team: 0, isAI: false, faction: chosenFaction },
      { team: 1, isAI: false, den: true, faction: 'classic' },
    ];
  }
  // campaign missions fix the matchup (you vs a scripted enemy tribe);
  // missions with allies/foes spell out the full seating chart instead
  if (!playerDefs && campaignMission && (campaignMission.allies || campaignMission.foes)) {
    playerDefs = [
      { team: 0, isAI: false, faction: campaignMission.faction },
      ...(campaignMission.allies || []).map((a) => ({ team: 0, isAI: true, faction: a.faction })),
      { team: 1, isAI: true, faction: campaignMission.enemy },
      ...(campaignMission.foes || []).map((f) => ({ team: 1, isAI: true, faction: f.faction })),
    ];
  }
  const campFactions = (campaignMission && !playerDefs) ? [campaignMission.faction, campaignMission.enemy] : null;
  game = new Game(scene, registryCache, {
    alert: (msg, kind, pos) => ui.alert(msg, kind, pos),
    selection: () => ui.refreshSelection(),
    gameOver: (win, stats, timeline) => {
      ui.gameOver(win, stats, timeline);
      if (campaignMission) campaignGameOver(win);
      else if (game.gameMode === 'survival') survivalGameOver(win);
      else {
        // skirmish: the storyteller retells the match on the game-over card
        $('go-story').textContent = game.matchStory(win);
        const art = $('go-art');
        if (art) { art.style.display = 'none'; art.removeAttribute('src'); }
      }
      // empire battle: harvest the tagged survivors and hand the BattleResult
      // back to the campaign (idempotent by encounter id — safe across reloads)
      if (ebc) {
        const survivors = {};
        for (const e of game.entities) {
          if (e.kind === 'unit' && e.empireCardId && !e.dead) {
            survivors[e.empireCardId] = { strength: Math.max(5, Math.round((e.hp / e.maxHp) * 100)) };
          }
        }
        Empire.applyPlayedResult(win, survivors);
        $('go-stats').insertAdjacentHTML('beforeend',
          `<div style="margin-top:8px"><button class="diff-btn sel" onclick="location.reload()">🗺️ Return to the Empire</button></div>`);
      }
      // the room remembers: tonight's wear becomes tomorrow's faint history
      try {
        if (tracks && !tracks.fading) {
          const sm = document.createElement('canvas'); sm.width = sm.height = 256;
          sm.getContext('2d').drawImage(tracks.c, 0, 0, 256, 256);
          localStorage.setItem('tt-wear-' + game.map.ground, sm.toDataURL('image/png'));
        }
      } catch { /* storage full — the room forgets, no harm */ }
      // the Chronicle remembers, and new Bedtime Stories get their moment
      const newly = recordMatch(game, win);
      if (newly.length) {
        $('go-stats').insertAdjacentHTML('beforeend',
          `<div class="go-awards">${newly.map((a) =>
            `<span class="go-award" title="${a.desc}">🏆 ${a.icon} ${a.name}</span>`).join('')}</div>`);
      }
      // bottle the story: fresh SP skirmishes only (campaign/MP/resume/replay can't)
      if (!mpOpts && !resume && !tutorial && !campaignMission && game.cmdLog) {
        try {
          const rec = {
            v: dataHash, when: Date.now(), win, seed: seedVal, map,
            diff: difficulty, gameMode: game.gameMode, startRes: game.startResKey,
            faction: game.factionKeys[game.myId],
            factions: [...game.factionKeys],
            playerDefs: game.playerDefs.map((d, i) => ({ ...d, faction: game.factionKeys[i] })),
            log: game.cmdLog,
          };
          localStorage.setItem('tt-replay-last', JSON.stringify(rec));
          shelfSave(rec); // the shelf keeps the last ten bottles
        } catch (e) { /* storage full — this story goes untold */ }
      }
    },
    age: () => ui.refreshSelection(),
    shake: (amt) => shakeCam(amt),
    dialogue: (speaker, text) => showDialogue(speaker, text),
    focus: (x, z) => cameraMoment(x, z),
  }, {
    fx: vfx, sfx, difficulty, map, playerDefs, tutorial,
    gameMode: ebc ? ebc.gameMode : mpOpts ? mpOpts.gameMode : (resume ? resume.opts.gameMode : (rep ? rep.gameMode : chosenMode)),
    startRes: ebc ? ebc.startRes : mpOpts ? mpOpts.startRes : (resume ? resume.opts.startRes : (rep ? rep.startRes : chosenStartRes)),
    // resumed games must rebuild the identical map shell before restoring
    seed: seedVal,
    mp: !!mpOpts, myId: mpOpts ? mpOpts.myId : 0, net,
    faction: rep ? rep.faction : chosenFaction,
    factions: mpOpts ? mpOpts.factions : (resume ? resume.opts.factions : (rep ? rep.factions : campFactions)),
    replayLog: rep ? rep.log : null,
  });
  if (net) {
    net.onDrop = () => { ui.alert('Connection lost — the other player left.', 'attack'); };
    net.onDesync = (t) => { ui.alert('Sync drift detected — this match may be unreliable.', 'warn'); console.warn('[net] desync at tick', t); };
  }
  game.zeroEra = zeroEra; // the Chronicle checks this for 'The Page Under the Pages'
  game.setup();
  setupWeather(); // wind, seeds, rain, fireflies — whatever this map's sky does
  setupTracks(); // footprints, trampled paths, and the scars of razed forts
  setupNight();  // the night deepens as the match grows old
  setupBaseLife(); // settlements act like settlements
  setupSeason(); // the room knows what time of year it is
  setupKidEvent(); // and somewhere beyond the rim, THE KID is awake
  // the bedside lamp stays indoors — outdoor maps get sun, dusk, and porch light
  const outdoorMap = !!(game.map && game.map.outdoor);
  lampProp.group.visible = !outdoorMap;
  if (outdoorMap) lampProp.light.intensity = 0;
  // resumed campaign saves need their event list in place BEFORE restore, so the
  // snapshot's done-flags land on it (fired moments must not replay on load)
  if (campaignMission && resume) game.missionEvents = (MISSION_EVENTS[campaignMission.id] || []).map((e) => ({ ...e }));
  if (campaignMission) game.ngPlus = ngActive; // NG narrator voice survives resume too
  if (resume) game.restore(resume);
  if (campaignMission && !resume) applyMissionMods(game, campaignMission);
  // empire battle: both rosters march in as tagged spearhead units — the
  // survivors return to the campaign map with their remaining strength
  if (ebc) {
    const dropRoster = (spawns, seat, mul) => {
      const home = game.entities.find((e) => e.type === 'chest' && e.owner === seat && !e.dead);
      if (!home) return;
      spawns.forEach((sp, i) => {
        const u = game.spawnUnit(sp.type, seat, home.x + 2.5 + (i % 3) * 0.9, home.z + 2.5 + ((i / 3) | 0) * 0.9);
        u.maxHp *= (mul || 1) * (sp.hp || 1); // Combined Arms + the card's own durability
        u.hp = Math.max(1, u.maxHp * (sp.strength / 100));
        u.empireCardId = sp.cardId;
        if (sp.vet) u.kills = 3; // veterans arrive decorated
      });
    };
    dropRoster(ebc.attSpawns, ebc.humanIsAttacker ? 0 : 1, ebc.attMul);
    dropRoster(ebc.defSpawns, ebc.humanIsAttacker ? 1 : 0, ebc.defMul);
  }
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
      if (result) ui.orderBark(result);
    },
  });
  ui.refreshSelection();
  window.__ui = ui; // debug/verification hook (harmless, like window.game)

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
  // re-skin the build card's house/wall/gate icons to the local player's tribe
  try { refreshFactionBuildingIcons(game.factionKeys[game.myId], ['house', 'chest', 'tower', 'wall', 'gate'], BUILDINGS); } catch { /* keep default icons */ }
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

// ---------------- touch scheme (phones & tablets, pointer: coarse) ----------------
// tap = select · quick swipe = pan · hold 150ms then drag = selection box ·
// long-press 500ms = the contextual command (touch's right-click) · pinch = zoom
const touchPts = new Map(); // active touch pointers, for pinch
let pinch = null;           // { d0, dist0 } while two fingers are down
let longPress = null;       // pending long-press timer
let lastPtrType = 'mouse';  // coarse pointers turn edge-scroll off

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!game) return;
  camMoment = null; // the player's hand outranks the director's
  lastPtrType = e.pointerType || 'mouse';
  if (e.pointerType === 'touch') {
    touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchPts.size === 2) {
      // second finger: whatever the first was doing becomes a pinch
      clearTimeout(longPress); longPress = null;
      const [a, b] = [...touchPts.values()];
      pinch = { d0: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), dist0: cam.tdist };
      down = null; dragBox.style.display = 'none';
      return;
    }
    if (!clickMode && !placing) {
      clearTimeout(longPress);
      const px = e.clientX, py = e.clientY;
      longPress = setTimeout(() => {
        longPress = null;
        if (down && !down.moved && !down.pan) { down = null; contextualAt(px, py, false); }
      }, 500);
    }
  }
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
    down = { x: e.clientX, y: e.clientY, moved: false, t0: performance.now(), touch: e.pointerType === 'touch' };
  }
});

addEventListener('pointermove', (e) => {
  mouseX = e.clientX; mouseY = e.clientY;
  if (e.pointerType === 'touch' && touchPts.has(e.pointerId)) {
    touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touchPts.size >= 2) {
      const [a, b] = [...touchPts.values()];
      const d = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
      cam.tdist = pinch.dist0 * (pinch.d0 / d); // spread fingers = closer
      clampCam();
      return;
    }
  }
  if (placing) {
    updatePlacement(e.clientX, e.clientY);
    if (wallDrag) updateWallLine();
  }
  if (!down) return;
  const drift = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
  // a finger that starts moving right away means "pan the camera";
  // held 150ms first, the same drag draws a selection box instead
  if (down.touch && !down.pan && !down.moved && drift > 8) {
    clearTimeout(longPress); longPress = null;
    if (performance.now() - down.t0 < 150) down.pan = true;
  }
  if (down.pan) {
    const k = cam.dist / 500;
    cam.tx -= (e.clientX - down.x) * k;
    cam.tz -= (e.clientY - down.y) * k;
    down.x = e.clientX; down.y = e.clientY;
    clampCam();
    return;
  }
  if (drift > 8) down.moved = true;
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
  if (e.pointerType === 'touch') {
    touchPts.delete(e.pointerId);
    clearTimeout(longPress); longPress = null;
    if (pinch) { if (touchPts.size < 2) pinch = null; return; }
  }
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

// the contextual command (right-click on desktop, long-press on touch)
function contextualAt(cx, cy, shift) {
  if (!game) return;
  if (clickMode) { setClickMode(null); return; }
  if (placing) { cancelPlacement(); return; }
  const p = groundPoint(cx, cy);
  if (!p) return;
  const ent = game.entityAt(p.x, p.z);
  const result = game.rightClick(p.x, p.z, ent, shift);
  if (result) {
    sfx.play('command');
    const first = game.selected.find((s) => s.kind === 'unit' && s.owner === game.myId);
    if (first) sfx.voice(first.type);
    if (result === 'attack') sfx.play('charge'); // a little battle cry
    ui.orderBark(result);
  }
  if (result === 'move' || result === 'rally') marker.ping(p.x, p.z, result === 'rally' ? 0x66aaff : 0x66ff88);
  else if (result === 'attack') marker.ping(p.x, p.z, 0xff5544);
  else if (result === 'gather') marker.ping(p.x, p.z, 0xffd166);
}
renderer.domElement.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  contextualAt(e.clientX, e.clientY, e.shiftKey);
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
    setMuteVisual(sfx.muted);
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

// ---------------- campaign dialogue bar (commanders speak; the sim never listens) ----
let dlgTimer = 0;
const dlgQueue = [];
function showDialogue(speaker, text) {
  dlgQueue.push({ speaker, text });
  if (dlgQueue.length === 1) nextDialogue();
}
function nextDialogue() {
  clearTimeout(dlgTimer);
  const bar = document.getElementById('dlg-bar');
  if (!bar) { dlgQueue.length = 0; return; }
  const item = dlgQueue[0];
  if (!item) { bar.classList.remove('show'); return; }
  const f = FACTIONS[item.speaker];
  const cmd = f && f.commander;
  bar.querySelector('.dlg-portrait').src = cmd ? cmd.portrait : '';
  bar.querySelector('.dlg-portrait').style.display = cmd ? '' : 'none';
  bar.querySelector('.dlg-book').style.display = cmd ? 'none' : '';
  bar.querySelector('.dlg-name').textContent = cmd ? cmd.name : 'The Storyteller';
  bar.querySelector('.dlg-text').textContent = item.text;
  bar.classList.add('show');
  sfx.play('command');
  // linger long enough to read, scaled a little by length
  dlgTimer = setTimeout(() => {
    dlgQueue.shift();
    if (dlgQueue.length) nextDialogue();
    else bar.classList.remove('show');
  }, Math.min(9000, 3800 + item.text.length * 28));
}

// ---------------- live objectives panel (reads the sim, never writes it) ----------------
let objT = 0;
function updateObjectives(dt) {
  objT -= dt;
  if (objT > 0) return;
  objT = 0.5;
  const el = document.getElementById('objectives');
  if (!el) return;
  if (!game || game.over || watchMode) { el.classList.remove('show'); return; }
  const head = campaignMission
    ? '🎯 ' + campaignMission.objective
    : GAME_MODES[game.gameMode].icon + ' ' + GAME_MODES[game.gameMode].label;
  let status = '';
  const myTeam = game.teamOf(game.myId);
  if (game.gameMode === 'koth') {
    const th = game.entities.find((e) => e.type === 'throne' && !e.dead);
    if (th) {
      const ht = th.holdTeam ?? th.holder;
      const left = Math.ceil(Math.max(0, 120 - (th.holdTime || 0)));
      status = ht < 0 ? 'The Throne stands empty.'
        : ht === myTeam ? `Your team holds the Throne — ${left}s to victory!`
          : `⚠️ The rivals hold the Throne — ${left}s left to stop them!`;
    }
  } else if (game.gameMode === 'regicide') {
    const kings = game.entities.filter((e) => e.isKing && !e.dead);
    const mine = kings.filter((k) => game.teamOf(k.owner) === myTeam).length;
    status = `Kings standing — yours: ${mine} · rivals: ${kings.length - mine}`;
  } else if (game.gameMode === 'sudden') {
    const chests = game.entities.filter((e) => e.type === 'chest' && !e.dead);
    const mine = chests.filter((c) => game.teamOf(c.owner) === myTeam).length;
    status = `Toy Chests — yours: ${mine} · rivals: ${chests.length - mine} · no rebuilding`;
  } else if (game.gameMode === 'survival' && game.survival) {
    const S = game.survival, dawn = SURVIVAL.dawnWave;
    if (S.wave === 0) {
      status = `Fortify! First wave in ${Math.max(0, Math.ceil(S.nextAt - game.time))}s — ${dawn} waves till dawn.`;
    } else if (S.active > 0) {
      status = `🌙 Wave ${S.wave} of ${dawn} — ${S.active} Forgotten still standing.`;
    } else {
      const next = Math.min(S.nextAt, Math.max(S.clearGapAt, game.time));
      status = `Wave ${S.wave} held. Next in ${Math.max(0, Math.ceil(next - game.time))}s — ${Math.max(0, dawn - S.wave)} to dawn.`;
    }
  } else {
    const rival = game.entities.filter((e) => e.kind === 'building' && !e.dead
      && e.owner >= 0 && game.teamOf(e.owner) !== myTeam).length;
    status = `Rival buildings standing: ${rival}`;
  }
  el.innerHTML = `<div class="obj-head">${head}</div><div class="obj-status">${status}</div>`;
  el.classList.add('show');
}

// ---------------- camera moments (a marked story beat pulls the eye over) ----------------
let camMoment = null; // { t, fromX, fromZ, toX, toZ }
function cameraMoment(x, z) {
  if (camMoment || watchMode) return; // one at a time; the director already drives watch mode
  camMoment = { t: 0, fromX: cam.tx, fromZ: cam.tz, toX: x, toZ: z };
}
function updateCamMoment(dt) {
  if (!camMoment) return;
  camMoment.t += dt;
  const t = camMoment.t;
  const ease = (f) => (f < 0.5 ? 2 * f * f : 1 - ((2 - 2 * f) ** 2) / 2);
  if (t < 0.6) { // glide over
    const f = ease(t / 0.6);
    cam.tx = camMoment.fromX + (camMoment.toX - camMoment.fromX) * f;
    cam.tz = camMoment.fromZ + (camMoment.toZ - camMoment.fromZ) * f;
  } else if (t < 1.9) {
    cam.tx = camMoment.toX; cam.tz = camMoment.toZ; // linger on the moment
  } else if (t < 2.5) { // glide home
    const f = ease((t - 1.9) / 0.6);
    cam.tx = camMoment.toX + (camMoment.fromX - camMoment.toX) * f;
    cam.tz = camMoment.toZ + (camMoment.fromZ - camMoment.toZ) * f;
  } else {
    camMoment = null;
  }
  clampCam();
}

// ---------------- weather & wind (visual only — the sim never feels the rain) ----
let weather = null; // { kind, group, parts, sway, t }
function clearWeather() {
  if (weather && weather.group) scene.remove(weather.group);
  weather = null;
}
// ---------------- footprints in the sand (view-only) ------------------------
// A transparent overlay plane above the sandbox mat collects little presses
// wherever toys walk, and the wind smooths them away over ~half a minute.
// Pure view: reads unit positions, never touches the sim.
let tracks = null;
// per-room wear colors: what ground looks like when ten thousand feet cross it
const WEAR_COLORS = {
  sandbox: 'rgba(115,84,45,0.16)', playground: 'rgba(96,72,38,0.05)',
  garden: 'rgba(60,44,26,0.06)', oldoak: 'rgba(88,64,36,0.05)',
  livingroom: 'rgba(60,22,26,0.05)', kitchen: 'rgba(70,45,22,0.04)',
  playmat: 'rgba(70,90,50,0.045)', underbed: 'rgba(20,16,30,0.06)',
  attic: 'rgba(60,42,22,0.045)', bookshelf: 'rgba(40,26,14,0.045)',
};
function setupTracks() {
  tracks = null;
  if (!game) return;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(N, N),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.045; // over the mat, under the cloud shadows
  plane.renderOrder = 1;
  scene.add(plane);
  // sandbox keeps fast-fading footprints; every other room accumulates WEAR —
  // trampled paths and battle scars that persist and tell the war's story
  tracks = { c, ctx, tex, t: 0, fading: game.map.ground === 'sandbox', deadSeen: new Set() };
  // the room remembers: last night's wear ghosts in under tonight's (35%,
  // so it fades naturally over a few sessions instead of blackening forever)
  try {
    const prev = localStorage.getItem('tt-wear-' + game.map.ground);
    if (prev) {
      const img = new Image();
      img.onload = () => { ctx.globalAlpha = 0.35; ctx.drawImage(img, 0, 0, 512, 512); ctx.globalAlpha = 1; tex.needsUpdate = true; };
      img.src = prev;
    }
  } catch { /* storage unavailable */ }
}
function updateTracks(dt) {
  if (!tracks || !game) return;
  tracks.t += dt;
  if (tracks.t < 0.13) return; // 8Hz is plenty for footprints
  tracks.t = 0;
  const x2 = tracks.ctx;
  if (tracks.fading) { // the wind's half of the bargain (sand only)
    x2.globalCompositeOperation = 'destination-out';
    x2.fillStyle = 'rgba(0,0,0,0.012)';
    x2.fillRect(0, 0, 512, 512);
    x2.globalCompositeOperation = 'source-over';
  }
  const px = 512 / N;
  const wearCol = WEAR_COLORS[game.map.ground] || 'rgba(80,60,35,0.05)';
  for (const e of game.entities) {
    if (e.garrisoned) continue;
    // battle scars: a building that died leaves a scorch that never fades
    if (e.kind === 'building' && e.dead && !tracks.deadSeen.has(e.id)) {
      tracks.deadSeen.add(e.id);
      const cx2 = (e.x + N / 2) * px, cz2 = (e.z + N / 2) * px;
      const r = (e.def && e.def.size ? e.def.size : 2) * px * 0.8;
      const g2 = x2.createRadialGradient(cx2, cz2, r * 0.2, cx2, cz2, r);
      g2.addColorStop(0, 'rgba(26,18,12,0.55)');
      g2.addColorStop(0.7, 'rgba(30,22,14,0.3)');
      g2.addColorStop(1, 'rgba(30,22,14,0)');
      x2.fillStyle = g2;
      x2.beginPath(); x2.arc(cx2, cz2, r, 0, Math.PI * 2); x2.fill();
      for (let k = 0; k < 7; k++) { // flung debris
        const a = Math.random() * Math.PI * 2, rr = r * (0.5 + Math.random() * 0.9);
        x2.fillStyle = 'rgba(40,30,18,0.4)';
        x2.beginPath(); x2.arc(cx2 + Math.cos(a) * rr, cz2 + Math.sin(a) * rr, 1 + Math.random() * 2, 0, Math.PI * 2); x2.fill();
      }
      continue;
    }
    if (e.dead) continue;
    const moving = (e.kind === 'unit' && e.wasMoving) || (e.kind === 'critter' && e.tgt) || (e.kind === 'cat' && e.tgt);
    if (!moving) continue;
    const cx2 = (e.x + N / 2) * px, cz2 = (e.z + N / 2) * px;
    const small = e.kind === 'critter';
    const big = e.kind === 'cat';
    x2.fillStyle = tracks.fading ? (small ? 'rgba(120,88,48,0.10)' : 'rgba(115,84,45,0.16)') : wearCol;
    x2.beginPath();
    x2.ellipse(cx2 + (Math.random() - 0.5) * 1.4, cz2 + (Math.random() - 0.5) * 1.4,
               big ? 2.6 : small ? 1.1 : 1.9, big ? 2 : small ? 0.8 : 1.4, Math.random() * 3, 0, Math.PI * 2);
    x2.fill();
  }
  tracks.tex.needsUpdate = true;
}

// ---------------- living bases (view-only) ----------------------------------
// Settlements act like settlements: production buildings puff chimney smoke
// while their queue works, and house windows glow warmer as the night deepens.
let baseLife = null;
let nightF = 0; // current depth-of-night factor (written by updateNight)
function setupBaseLife() {
  baseLife = { smokes: new Map(), glows: new Map(), scanT: 0 };
}
function updateBaseLife(dt) {
  if (!baseLife || !game) return;
  baseLife.scanT -= dt;
  if (baseLife.scanT <= 0) {
    baseLife.scanT = 1; // 1Hz bookkeeping; particles animate every frame below
    for (const e of game.entities) {
      if (e.kind !== 'building' || e.dead || e.built < 1) continue;
      // smoke: anything actively training puffs away at its work
      const busy = e.queue && e.queue.length > 0;
      if (busy && !baseLife.smokes.has(e.id)) {
        const puffs = [];
        for (let i = 0; i < 3; i++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5),
            new THREE.MeshBasicMaterial({ color: 0xcfc8bc, transparent: true, opacity: 0.3, depthWrite: false }));
          m.position.set(e.x + 0.4, 2 + i * 0.7, e.z - 0.3);
          scene.add(m);
          puffs.push({ m, ph: Math.random() * 9, v: 0.5 + Math.random() * 0.3 });
        }
        baseLife.smokes.set(e.id, { x: e.x + 0.4, z: e.z - 0.3, puffs });
      } else if (!busy && baseLife.smokes.has(e.id)) {
        for (const p of baseLife.smokes.get(e.id).puffs) scene.remove(p.m);
        baseLife.smokes.delete(e.id);
      }
      // window glow: houses light up as the night deepens
      if (e.type && e.type.startsWith('house') && !baseLife.glows.has(e.id)) {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({
          color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false,
          blending: THREE.AdditiveBlending,
        }));
        spr.scale.set(1.6, 1.2, 1);
        spr.position.set(e.x, 1.1, e.z);
        scene.add(spr);
        baseLife.glows.set(e.id, { spr, e });
      }
    }
    // sweep glows/smokes whose buildings died
    for (const [id, g2] of baseLife.glows) {
      if (g2.e.dead) { scene.remove(g2.spr); baseLife.glows.delete(id); }
    }
    for (const [id, sm] of baseLife.smokes) {
      if (!game.entities.some((e) => e.id === id && !e.dead)) {
        for (const p of sm.puffs) scene.remove(p.m);
        baseLife.smokes.delete(id);
      }
    }
  }
  for (const sm of baseLife.smokes.values()) {
    for (const p of sm.puffs) {
      p.m.position.y += p.v * dt;
      p.m.position.x = sm.x + Math.sin(p.m.position.y * 1.3 + p.ph) * 0.2;
      const s2 = 1 + (p.m.position.y - 2) * 0.35;
      p.m.scale.setScalar(Math.max(0.4, s2));
      p.m.material.opacity = Math.max(0, 0.3 - (p.m.position.y - 2) * 0.09);
      if (p.m.position.y > 5.4) p.m.position.y = 2;
    }
  }
  for (const g2 of baseLife.glows.values()) {
    g2.spr.material.opacity = nightF * 0.5 * (0.85 + Math.sin(performance.now() * 0.0018 + g2.e.id) * 0.15);
  }
}

// ---------------- seasonal skins (view-only) --------------------------------
// The room knows what time of year it is. From the real calendar month we tint
// the whole scene a touch and, outdoors, let the season drift down: snow in
// winter, petals in spring, extra leaves in autumn. Pure view — the sim (and
// every headless soak) never sees a season.
let season = null;
const SEASONS = {
  winter: { tint: 0xbcd0ec, tintAmt: 0.14, drift: 'snow',  driftCol: 0xffffff },
  spring: { tint: 0xf0d0e4, tintAmt: 0.09, drift: 'petal', driftCol: 0xf5c6dc },
  summer: { tint: 0xfff2c8, tintAmt: 0.06, drift: null,    driftCol: 0 },
  autumn: { tint: 0xe0a860, tintAmt: 0.11, drift: 'leaf',  driftCol: 0xd68a3a },
};
function currentSeason() {
  const m = new Date().getMonth(); // 0=Jan
  return m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
}
function setupSeason(forceKey) {
  if (season && season.group) scene.remove(season.group);
  season = null;
  if (!game || game.zeroEra) return; // page zero is out of time
  const key = forceKey || currentSeason(), cfg = SEASONS[key];
  const group = new THREE.Group();
  scene.add(group);
  const parts = [];
  // a gentle season-grade over whatever the map's lighting set the fog to
  if (scene.fog) scene.fog.color.lerp(new THREE.Color(cfg.tint), cfg.tintAmt);
  const outdoor = !!(game.map.outdoor || game.map.ground === 'playground');
  if (cfg.drift && outdoor) {
    const span = N * 1.3;
    const mat = cfg.drift === 'snow'
      ? new THREE.MeshBasicMaterial({ color: cfg.driftCol, transparent: true, opacity: 0.85 })
      : new THREE.MeshBasicMaterial({ color: cfg.driftCol, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < 34; i++) {
      const geo = cfg.drift === 'snow' ? new THREE.SphereGeometry(0.06, 5, 4) : new THREE.PlaneGeometry(0.16, 0.11);
      const m = new THREE.Mesh(geo, mat);
      m.position.set((Math.random() - 0.5) * span, Math.random() * 14, (Math.random() - 0.5) * span);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      group.add(m);
      parts.push({ m, ph: Math.random() * 9, v: 0.4 + Math.random() * 0.6, sway: 0.6 + Math.random() });
    }
  }
  season = { key, cfg, group, parts };
}
function updateSeason(dt) {
  if (!season || !game) return;
  for (const p of season.parts) {
    p.m.position.y -= p.v * dt;
    p.m.position.x += Math.sin((game.time || 0) * 0.6 + p.ph) * dt * p.sway;
    p.m.rotation.z += dt * 0.8;
    if (p.m.position.y < 0.1) { p.m.position.set((Math.random() - 0.5) * N * 1.3, 12 + Math.random() * 3, (Math.random() - 0.5) * N * 1.3); }
  }
}

// ---------------- THE KID (view-only spectacle) ------------------------------
// Once in a long while, the owner of every toy on this floor reaches into the
// war and takes something. Footsteps, a colossal shadow, a hand from the sky —
// and a crayon is gone. The sim never knows; only the toys do.
let kidEvent = null;
function setupKidEvent() {
  kidEvent = { t: 420 + Math.random() * 300, phase: null, pt: 0, hand: null, shadow: null, target: null };
}
function updateKidEvent(dt) {
  if (!kidEvent || !game || game.zeroEra) return;
  if (!kidEvent.phase) {
    kidEvent.t -= dt;
    if (kidEvent.t > 0) return;
    const decors = [];
    scene.traverse((n) => { if (n.userData && n.userData.decor && n.visible) decors.push(n); });
    if (!decors.length) { kidEvent.t = 300; return; }
    kidEvent.target = decors[(Math.random() * decors.length) | 0];
    // the shadow: a colossal soft blob that sweeps in over the target
    const cc = document.createElement('canvas'); cc.width = cc.height = 128;
    const cx2 = cc.getContext('2d');
    const grad = cx2.createRadialGradient(64, 64, 10, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    cx2.fillStyle = grad; cx2.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(55, 40),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cc), transparent: true, opacity: 0, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(kidEvent.target.position.x + 10, 0.09, kidEvent.target.position.z + 6);
    shadow.renderOrder = 2;
    scene.add(shadow);
    // the hand: five plush-pink fingers and a palm, big as a battleship
    const hand = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b48c, roughness: 0.7 });
    const palm = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.8, 7.5), skin);
    palm.castShadow = true;
    hand.add(palm);
    for (let f = 0; f < 4; f++) {
      const fin = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 3.4, 4, 8), skin);
      fin.rotation.x = Math.PI / 2 + 0.5;
      fin.position.set(-2.4 + f * 1.6, -0.4, 4.6);
      fin.castShadow = true;
      hand.add(fin);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.8, 2.6, 4, 8), skin);
    thumb.rotation.z = 1.0; thumb.rotation.x = 0.4;
    thumb.position.set(-3.8, -0.4, 1);
    hand.add(thumb);
    hand.position.set(kidEvent.target.position.x + 4, 44, kidEvent.target.position.z - 3);
    hand.rotation.z = 0.18;
    scene.add(hand);
    kidEvent.hand = hand; kidEvent.shadow = shadow;
    kidEvent.phase = 'foot'; kidEvent.pt = 0;
    try { sfx.footsteps(); } catch { /* muted */ }
    game.alert && game.alert('🖐️ Footsteps… THE KID is looking for something.', 'warn', { x: kidEvent.target.position.x, z: kidEvent.target.position.z }, 5);
    return;
  }
  kidEvent.pt += dt;
  const ease = (x) => x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2;
  const K = kidEvent, tgt = K.target;
  if (K.phase === 'foot' && K.pt > 2.2) { K.phase = 'shadow'; K.pt = 0; shakeCam(0.12); }
  else if (K.phase === 'shadow') {
    K.shadow.material.opacity = Math.min(0.55, K.pt * 0.3);
    if (K.pt > 2.4) { K.phase = 'descend'; K.pt = 0; }
  } else if (K.phase === 'descend') {
    const f = ease(Math.min(1, K.pt / 2.4));
    K.hand.position.y = 44 - f * (44 - (tgt.position.y + 2.6));
    if (K.pt > 2.4) { K.phase = 'grab'; K.pt = 0; }
  } else if (K.phase === 'grab') {
    if (K.pt > 0.7 && tgt.visible) { tgt.visible = false; shakeCam(0.08); try { sfx.play('pop', 80); } catch { /* muted */ } }
    if (K.pt > 0.9) { K.phase = 'lift'; K.pt = 0; }
  } else if (K.phase === 'lift') {
    const f = ease(Math.min(1, K.pt / 2.2));
    K.hand.position.y = (tgt.position.y + 2.6) + f * 46;
    K.shadow.material.opacity = Math.max(0, 0.55 - f * 0.55);
    if (K.pt > 2.4) {
      scene.remove(K.hand); scene.remove(K.shadow);
      game.alert && game.alert('…and just like that, something small is gone from the room.', 'info', null, 4);
      kidEvent = { t: 520 + Math.random() * 420, phase: null, pt: 0, hand: null, shadow: null, target: null };
    }
  }
}

// ---------------- the deepening night (view-only) ---------------------------
// A match is a whole night passing: over ~20 sim-minutes the room's light
// slides deeper — dimmer, bluer, the moon further along its arc. The sim
// never reads any of this; it reads game.time and paints.
let nightLights = null;
function setupNight() {
  nightLights = null;
  if (!game || game.zeroEra) return; // page zero stays sepia-frozen
  const found = [];
  scene.traverse((n) => { if (n.isDirectionalLight || n.isHemisphereLight || n.isAmbientLight) found.push(n); });
  if (!found.length) return;
  nightLights = found.map((l) => ({
    l,
    base: l.intensity,
    baseColor: l.color.clone(),
    basePos: l.position ? l.position.clone() : null,
  }));
}
function updateNight() {
  if (!nightLights || !game) return;
  const f = Math.min(1, (game.time || 0) / 1200) * 0.5; // halfway to full depth at 20 min
  nightF = f; // the living-bases window glow reads the same clock
  for (const rec of nightLights) {
    rec.l.intensity = rec.base * (1 - f * 0.3);                     // the room dims…
    rec.l.color.copy(rec.baseColor).lerp(NIGHT_TINT, f * 0.4);      // …and cools toward moonlight
    if (rec.l.isDirectionalLight && rec.basePos) {                  // …as the moon walks its arc
      rec.l.position.set(
        rec.basePos.x * Math.cos(f * 0.5) - rec.basePos.z * Math.sin(f * 0.5),
        rec.basePos.y,
        rec.basePos.x * Math.sin(f * 0.5) + rec.basePos.z * Math.cos(f * 0.5)
      );
    }
  }
}
const NIGHT_TINT = new THREE.Color(0x6a7ab8);

function setupWeather() {
  clearWeather();
  if (!game) return;
  const kind = game.map && game.map.weather;
  // collect everything the wind is allowed to touch (tagged by models.js)
  const sway = [];
  scene.traverse((n) => {
    if (n.userData && n.userData.sway) sway.push({ o: n, ph: Math.random() * 9, amp: n.userData.sway, base: n.rotation.z });
  });
  // cloud shadows: the sky moving over the field — outdoor maps and the yard
  const wantClouds = !!(game.map.outdoor || game.map.ground === 'playground');
  if (!kind && !sway.length && !wantClouds) return;
  const group = new THREE.Group();
  scene.add(group);
  const parts = [];
  const span = N * 1.3;
  const clouds = [];
  if (wantClouds) {
    // one shared soft-edged blob texture; each cloud drifts on the same slow wind
    const cc = document.createElement('canvas'); cc.width = cc.height = 128;
    const cx2 = cc.getContext('2d');
    const grad = cx2.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.65, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    cx2.fillStyle = grad; cx2.fillRect(0, 0, 128, 128);
    const cloudTex = new THREE.CanvasTexture(cc);
    for (let i = 0; i < 4; i++) {
      const size = 13 + Math.random() * 11;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size * (0.6 + Math.random() * 0.5)),
        new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.16, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.random() * Math.PI;
      m.position.set((Math.random() - 0.5) * span, 0.07 + i * 0.01, (Math.random() - 0.5) * span);
      m.renderOrder = 1; // over the ground, under everything that matters
      group.add(m);
      clouds.push({ m, vx: 0.55 + Math.random() * 0.3, vz: 0.18 + Math.random() * 0.14 });
    }
  }
  if (kind === 'rain') {
    const rainM = new THREE.MeshBasicMaterial({ color: 0xbfd8f0, transparent: true, opacity: 0.55 });
    for (let i = 0; i < 110; i++) {
      const drop = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.55, 0.03), rainM);
      drop.position.set((Math.random() - 0.5) * span, 4 + Math.random() * 26, (Math.random() - 0.5) * span);
      group.add(drop);
      parts.push({ m: drop, v: 16 + Math.random() * 8 });
    }
  } else if (kind === 'seeds') {
    const seedM = new THREE.MeshStandardMaterial({ color: 0xf6f2e6, roughness: 0.9, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 26; i++) {
      const fluff = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), seedM);
      fluff.position.set((Math.random() - 0.5) * span, 1 + Math.random() * 12, (Math.random() - 0.5) * span);
      group.add(fluff);
      parts.push({ m: fluff, ph: Math.random() * 9, v: 0.25 + Math.random() * 0.3 });
    }
  } else if (kind === 'fireflies') {
    for (let i = 0; i < 26; i++) {
      const fly = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5),
        new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe27a, emissiveIntensity: 1 }));
      fly.position.set((Math.random() - 0.5) * span * 0.45, 0.6 + Math.random() * 3.2, (Math.random() - 0.5) * span * 0.45); // they keep to the old tree's company
      group.add(fly);
      parts.push({ m: fly, ph: Math.random() * 9, cx: fly.position.x, cz: fly.position.z });
    }
  } else if (kind === 'motes') {
    // dust hanging in the window light — barely moving, catching the sun
    const moteM = new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0.4 });
    for (let i = 0; i < 30; i++) {
      const mote = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), moteM.clone());
      mote.position.set((Math.random() - 0.5) * span * 0.8, 0.4 + Math.random() * 6, (Math.random() - 0.5) * span * 0.8);
      group.add(mote);
      parts.push({ m: mote, ph: Math.random() * 9 });
    }
  } else if (kind === 'steam') {
    // little curls rising off the table — dinner never quite over
    for (let i = 0; i < 12; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 6),
        new THREE.MeshBasicMaterial({ color: 0xf6f2ea, transparent: true, opacity: 0.16, depthWrite: false }));
      puff.position.set((Math.random() - 0.5) * span * 0.8, Math.random() * 4, (Math.random() - 0.5) * span * 0.8);
      group.add(puff);
      parts.push({ m: puff, ph: Math.random() * 9, v: 0.5 + Math.random() * 0.4, x0: puff.position.x, z0: puff.position.z });
    }
  } else if (kind === 'bubbles') {
    // soap bubbles wobbling up out of the suds
    for (let i = 0; i < 14; i++) {
      const bub = new THREE.Mesh(new THREE.SphereGeometry(0.12 + Math.random() * 0.12, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xcfe8f4, transparent: true, opacity: 0.3, depthWrite: false }));
      bub.position.set((Math.random() - 0.5) * span * 0.8, Math.random() * 7, (Math.random() - 0.5) * span * 0.8);
      group.add(bub);
      parts.push({ m: bub, ph: Math.random() * 9, v: 0.5 + Math.random() * 0.5, x0: bub.position.x });
    }
  } else if (kind === 'glitter') {
    // the tree sheds sparkle — slow gold and silver flecks all season long
    for (let i = 0; i < 40; i++) {
      const fleck = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06),
        new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xf0d24a : 0xe8e8f0, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
      fleck.position.set((Math.random() - 0.5) * span, Math.random() * 10, (Math.random() - 0.5) * span);
      fleck.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      group.add(fleck);
      parts.push({ m: fleck, ph: Math.random() * 9, v: 0.28 + Math.random() * 0.25 });
    }
  }
  // flyovers: every minute or two, something small crosses the sky and is gone
  const FLYOVERS = { sandbox: 'planes', playground: 'planes', playmat: 'planes', attic: 'planes', garden: 'butterflies' };
  const flyKind = FLYOVERS[game.map.ground];
  weather = {
    kind, group, parts, sway, clouds, t: Math.random() * 100,
    flyKind, flyT: flyKind ? 20 + Math.random() * 40 : 0, flight: null,
  };
  if (kind === 'rain') { try { sfx.startRain(); } catch (e) { /* muted */ } }
}
function updateWeather(dt) {
  if (!weather) return;
  weather.t += dt;
  const t = weather.t;
  for (const s of weather.sway) s.o.rotation.z = s.base + Math.sin(t * 1.2 + s.ph) * s.amp;
  const span = N * 1.3;
  for (const c of weather.clouds || []) { // the sky crosses the field, unhurried
    c.m.position.x += c.vx * dt;
    c.m.position.z += c.vz * dt;
    if (c.m.position.x > span / 2 + 14) { c.m.position.x = -span / 2 - 14; c.m.position.z = (Math.random() - 0.5) * span; }
  }
  if (weather.kind === 'rain') {
    for (const p of weather.parts) {
      p.m.position.y -= p.v * dt;
      p.m.position.x += dt * 1.5; // the shower leans with the breeze
      if (p.m.position.y < 0) {
        p.m.position.set((Math.random() - 0.5) * span, 24 + Math.random() * 8, (Math.random() - 0.5) * span);
      }
    }
  } else if (weather.kind === 'seeds') {
    for (const p of weather.parts) {
      p.m.position.y -= p.v * dt * 0.4;
      p.m.position.x += Math.sin(t * 0.7 + p.ph) * dt * 1.6 + dt * 0.8;
      p.m.position.z += Math.cos(t * 0.5 + p.ph) * dt * 1.2;
      if (p.m.position.y < 0.3) {
        p.m.position.set((Math.random() - 0.5) * span, 9 + Math.random() * 8, (Math.random() - 0.5) * span);
      }
    }
  } else if (weather.kind === 'fireflies') {
    for (const p of weather.parts) {
      p.m.position.x = p.cx + Math.sin(t * 0.6 + p.ph) * 2.4;
      p.m.position.z = p.cz + Math.cos(t * 0.45 + p.ph * 1.3) * 2.4;
      p.m.position.y = 1.6 + Math.sin(t * 0.9 + p.ph * 2) * 1.1;
      p.m.material.emissiveIntensity = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.7 + p.ph * 3));
    }
  } else if (weather.kind === 'motes') {
    for (const p of weather.parts) { // hover, twinkle, barely drift
      p.m.position.x += Math.sin(t * 0.3 + p.ph) * dt * 0.12;
      p.m.position.y += Math.cos(t * 0.22 + p.ph * 1.7) * dt * 0.08;
      p.m.material.opacity = 0.18 + 0.3 * Math.max(0, Math.sin(t * 0.7 + p.ph * 2));
    }
  } else if (weather.kind === 'steam') {
    for (const p of weather.parts) {
      p.m.position.y += p.v * dt;
      p.m.position.x = p.x0 + Math.sin(t * 0.8 + p.ph) * 0.5; // the curl
      const s = 1 + (p.m.position.y / 5) * 0.8;
      p.m.scale.setScalar(s);
      p.m.material.opacity = Math.max(0, 0.18 - p.m.position.y * 0.035);
      if (p.m.position.y > 5) { p.m.position.y = 0.2; p.x0 = (Math.random() - 0.5) * span * 0.8; p.m.position.z = (Math.random() - 0.5) * span * 0.8; }
    }
  } else if (weather.kind === 'bubbles') {
    for (const p of weather.parts) {
      p.m.position.y += p.v * dt;
      p.m.position.x = p.x0 + Math.sin(t * 1.1 + p.ph) * 0.7; // wobble
      if (p.m.position.y > 8) { p.m.position.y = 0.3; p.x0 = (Math.random() - 0.5) * span * 0.8; p.m.position.z = (Math.random() - 0.5) * span * 0.8; }
    }
  } else if (weather.kind === 'glitter') {
    for (const p of weather.parts) {
      p.m.position.y -= p.v * dt;
      p.m.position.x += Math.sin(t * 0.9 + p.ph) * dt * 0.5;
      p.m.rotation.x += dt * (0.8 + p.ph * 0.1);
      p.m.rotation.y += dt * 1.2;
      if (p.m.position.y < 0.1) { p.m.position.set((Math.random() - 0.5) * span, 9 + Math.random() * 2, (Math.random() - 0.5) * span); }
    }
  }
  // flyovers: paper planes in a vee, or butterflies taking the scenic route
  if (weather.flyKind) {
    if (weather.flight) {
      const fl = weather.flight;
      fl.t += dt;
      const f = fl.t / fl.dur;
      for (let i = 0; i < fl.ms.length; i++) {
        const m = fl.ms[i], off = fl.offs[i];
        if (fl.kind === 'planes') {
          m.position.set(
            -span / 2 - 6 + (span + 12) * f + off.x,
            7.5 + Math.sin((f * 4 + off.p) * Math.PI) * 0.8 + off.y,
            fl.z + off.z + Math.sin(f * 6 + off.p) * 0.6
          );
          m.rotation.z = Math.sin(f * 6 + off.p) * 0.25; // a lazy bank
        } else { // butterflies flutter lower, slower, less sure of the route
          m.position.set(
            -span / 2 - 4 + (span + 8) * f + off.x + Math.sin(fl.t * 2.2 + off.p) * 1.4,
            2.2 + Math.sin(fl.t * 3.1 + off.p * 2) * 0.9 + off.y,
            fl.z + off.z + Math.cos(fl.t * 1.7 + off.p) * 2.2
          );
          m.children[0].rotation.z = 0.6 + Math.sin(fl.t * 16 + off.p) * 0.5;   // wingbeats
          m.children[1].rotation.z = -0.6 - Math.sin(fl.t * 16 + off.p) * 0.5;
        }
      }
      if (f >= 1) {
        for (const m of fl.ms) weather.group.remove(m);
        weather.flight = null;
        weather.flyT = 45 + Math.random() * 60;
      }
    } else {
      weather.flyT -= dt;
      if (weather.flyT <= 0) {
        const kind2 = weather.flyKind;
        const ms = [], offs = [];
        const n = kind2 === 'planes' ? 3 : 2 + (Math.random() * 2 | 0);
        for (let i = 0; i < n; i++) {
          let m;
          if (kind2 === 'planes') { // a folded paper dart
            m = new THREE.Group();
            for (const sx of [-1, 1]) {
              const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.35),
                new THREE.MeshBasicMaterial({ color: 0xf6f2e6, side: THREE.DoubleSide }));
              wing.rotation.z = sx * 0.5;
              wing.position.x = sx * 0.3;
              m.add(wing);
            }
            m.rotation.y = Math.PI / 2; // nose toward travel
            offs.push({ x: -i * 2.2, y: i * 0.4, z: (i % 2 ? 1 : -1) * i * 1.4, p: Math.random() * 9 });
          } else { // a butterfly: two bright flapping wings
            m = new THREE.Group();
            const col = [0xe8843a, 0x7fb8e8, 0xe8d24a][i % 3];
            for (const sx of [-1, 1]) {
              const wing = new THREE.Mesh(new THREE.CircleGeometry(0.28, 8),
                new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
              wing.scale.set(1, 0.7, 1);
              wing.position.x = sx * 0.16;
              m.add(wing);
            }
            offs.push({ x: -i * 3, y: i * 0.5, z: i * 2.5, p: Math.random() * 9 });
          }
          weather.group.add(m);
          ms.push(m);
        }
        weather.flight = { kind: kind2, ms, offs, t: 0, dur: kind2 === 'planes' ? 16 : 34, z: (Math.random() - 0.5) * N * 0.7 };
      }
    }
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
  const outdoor = !!(game && game.map && game.map.outdoor);
  // the room furniture (window, door, goldfish bowl) only exists where there IS
  // a room — not under the bed, and definitely not in the backyard
  const hasWalls = style !== 'underbed' && !outdoor;
  const rainy = hasWalls && Math.random() < 0.45; // some nights it just rains
  // no lamp outdoors either, so no moths to circle it (fireflies take the shift)
  if (outdoor) for (const mo of moths) mo.mesh.visible = false;

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

  updateCamMoment(dt); // scripted camera peeks (any manual input cancels)
  const panSpeed = cam.dist * 0.9 * dt;
  if (camMoment && (keys.arrowup || keys.w || keys.arrowdown || keys.s || keys.arrowleft || keys.a || keys.arrowright || keys.d)) camMoment = null;
  if (keys.arrowup || keys.w) cam.tz -= panSpeed;
  if (keys.arrowdown || keys.s) cam.tz += panSpeed;
  if (keys.arrowleft || keys.a) cam.tx -= panSpeed;
  if (keys.arrowright || keys.d) cam.tx += panSpeed;
  // edge scrolling (fingers never hover, so coarse pointers skip it)
  if (mouseInside && !down && settings.edge && lastPtrType !== 'touch') {
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
    // SP runs the same fixed 20Hz quantum as MP lockstep, so every match is
    // deterministic — which is what makes replays possible at all
    spAccum = Math.min(spAccum + dt * gameSpeed, 0.4);
    while (spAccum >= TICK) { tick(TICK); spAccum -= TICK; }
  }
  vfx.ambient(cam.x, cam.z, dt); // dust motes drifting in the lamp light
  updateAmbient(dt);            // moths, headlights, the cat
  updateWeather(dt);            // wind in the sunflowers, seeds on the breeze
  updateTracks(dt);             // footprints press in, the wind smooths them out
  updateNight();                // the moon keeps its own slow time
  updateSeason(dt);             // snow, petals, or falling leaves
  updateBaseLife(dt);           // chimneys smoke, windows glow
  updateKidEvent(dt);           // footsteps, a shadow, a hand from the sky
  if (sfx.setListener) sfx.setListener(cam.x, cam.z);
  updateObjectives(dt);         // the goal, live, where eyes already are
  // the lamp breathes a little, like a real filament (only while it exists)
  if (lampProp.group.visible) {
    const flick = 1 + Math.sin(performance.now() * 0.0021) * 0.03 + Math.sin(performance.now() * 0.013) * 0.02;
    lampProp.light.intensity = 220 * flick;
    lampProp.bulb.material.emissiveIntensity = 2.2 * flick;
  }
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
      // hidden tab: same fixed quantum, capped so a long sleep can't stall the UI
      spAccum = Math.min(spAccum + elapsed * gameSpeed, 2);
      let steps = 0;
      while (spAccum >= TICK && steps++ < 48) { game.update(TICK); spAccum -= TICK; }
    }
    vfx.update(elapsed);
    marker.update(elapsed);
    ui.update(elapsed);
    updateAmbient(elapsed);
    updateWeather(elapsed);
    updateTracks(elapsed);
    updateNight();
    updateSeason(elapsed);
    updateBaseLife(elapsed);
    updateKidEvent(elapsed);
    if (sfx.setListener) sfx.setListener(cam.x, cam.z);
    updateObjectives(elapsed);
    updateCamMoment(elapsed);
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
