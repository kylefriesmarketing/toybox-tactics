// ============================================================
// TOYBOX TACTICS — HUD: resource bar, selection panel, command
// card, minimap, alerts, age banner, menu and end-game stats.
// ============================================================

import {
  MAP_N, RES_TYPES, RES_META, UNITS, BUILDINGS, TECHS, MARKET,
  AGES, AGE_UPS, TEAM_NAMES,
} from './data.js';
import { PORTRAITS } from './models.js';

const $ = (id) => document.getElementById(id);

export const B_ICONS = { chest: '🧰', house: '🏠', farm: '🍽️', mat: '🥋', bench: '🎯', garage: '🏁', market: '🏪', tower: '✏️', workshop: '🛠️', fort: '🏰', wall: '🧱', gate: '🚪', wonder: '⭐', basket: '🧺', tent: '⛺', brickshop: '🏭', nest: '🪺', pitstop: '🛞', robolab: '🤖', dock: '⚓', tinker: '⚙️' };
export const U_ICONS = { worker: '🔧', scout: '🔭', soldier: '🪖', spear: '📌', archer: '🎯', flinger: '🪀', raider: '🏎️', hero: '🦸', ram: '🛏️', catapult: '🪃', medic: '🧸', cart: '🚚', hypno: '🌀', bear: '🐻', golem: '🧱', dragster: '🏎️', bazooka: '🎁', grenadier: '💣', lancer: '🎠', sockpuppet: '🧦', drone: '🚁', tugboat: '🚢', duckboat: '🦆' };
// painted action/tech icons keyed by their command emoji (variation selectors stripped
// at lookup). Missing files fall back to the emoji, so this is always safe.
const ACTION_IMG = {
  '✋': 'assets/ui/ic-stop.png', '🔁': 'assets/ui/ic-patrol.png', '💥': 'assets/ui/ic-bombard.png',
  '🚩': 'assets/ui/ic-rally.png', '🔔': 'assets/ui/ic-bell.png', '📤': 'assets/ui/ic-empty.png',
  '🗑': 'assets/ui/ic-demolish.png', '⏫': 'assets/ui/ic-ageup.png', '🔬': 'assets/ui/ic-research.png',
  '💰': 'assets/ui/ic-sell.png', '🛒': 'assets/ui/ic-buy.png', '🎁': 'assets/ui/ic-give.png',
  '⚔': 'assets/ui/ic-attack.png', '🛡': 'assets/ui/ic-defend.png', '🧍': 'assets/ui/ic-hold.png',
};
const ALERT_ICONS = { info: '💬', warn: '⚠️', attack: '⚔️', age: '✨' };

export class UI {
  constructor(game, hooks) {
    this.game = game;
    this.hooks = hooks; // { beginPlacement(type), centerCamera(x,z), cameraCenter():{x,z}, selectIdle(), toggleMute() }
    this.mini = $('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.pings = [];
    this.tickT = 0;
    this.miniT = 0;
    this.cardButtons = [];

    this.mini.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = this.mini.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      const wx = fx * MAP_N - MAP_N / 2, wz = fy * MAP_N - MAP_N / 2;
      // Alt+click drops a flare (signals your ally in multiplayer)
      if (e.altKey) game.issue({ t: 'flare', x: wx, z: wz });
      else hooks.centerCamera(wx, wz);
      e.stopPropagation();
    });
    // right-click on the minimap issues orders at that world position
    this.mini.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = this.mini.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      hooks.minimapCommand(fx * MAP_N - MAP_N / 2, fy * MAP_N - MAP_N / 2, e.shiftKey);
    });
    $('idle-btn').addEventListener('click', () => hooks.selectIdle());
    $('go-restart').addEventListener('click', () => location.reload());
  }

  // ---------- alerts ----------
  alert(msg, kind = 'info', pos = null) {
    const div = document.createElement('div');
    div.className = `alert ${kind}`;
    div.textContent = `${ALERT_ICONS[kind] || '💬'} ${msg}`;
    const box = $('alerts');
    box.appendChild(div);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => { div.classList.add('fade'); setTimeout(() => div.remove(), 900); }, 4200);
    if (pos) this.pings.push({ x: pos.x, z: pos.z, t: 3 });
    if (kind === 'age') this.banner(msg);
  }

  banner(msg) {
    const b = $('banner');
    b.textContent = msg;
    b.classList.add('show');
    setTimeout(() => b.classList.remove('show'), 2600);
  }

  gameOver(win, stats, timeline) {
    $('go-title').textContent = win ? 'VICTORY!' : 'DEFEAT';
    $('go-title').className = win ? 'win' : 'lose';
    $('go-sub').textContent = win
      ? `The ${TEAM_NAMES[1]} have no toys left to fight with. The bedroom is yours.`
      : 'Your last production building has fallen. Back in the toy box…';
    const t = Math.floor(this.game.time);
    const g = this.game, me = g.myId;
    // columns: you first, then ally, then the rivals
    const order = [...g.players].sort((a, b) => {
      const rank = (p) => (p.id === me ? 0 : p.team === g.myTeam ? 1 : 2);
      return rank(a) - rank(b) || a.id - b.id;
    });
    let rivalN = 0;
    const label = (p) => (p.id === me ? 'You' : p.team === g.myTeam ? 'Ally' : `Rival ${g.players.length > 2 ? ++rivalN : ''}`.trim());
    // AoE-style final score: economy + military + tech + surviving army
    const scoreOf = (p) => {
      const s = stats[p.id];
      const alive = g.entities.filter((e) => e.kind === 'unit' && e.owner === p.id && !e.dead).length;
      return Math.round(s.gathered / 10 + s.kills * 12 + s.razed * 25
        + p.techs.size * 40 + (p.age - 1) * 60 + alive * 6);
    };
    const rows = [
      ['', ...order.map(label)],
      ['Final score', ...order.map((p) => scoreOf(p))],
      ['Resources gathered', ...order.map((p) => Math.floor(stats[p.id].gathered))],
      ['Toys trained', ...order.map((p) => stats[p.id].trained)],
      ['Toys lost', ...order.map((p) => stats[p.id].lost)],
      ['Enemy toys defeated', ...order.map((p) => stats[p.id].kills)],
      ['Buildings razed', ...order.map((p) => stats[p.id].razed)],
      ['Upgrades researched', ...order.map((p) => g.players[p.id].techs.size)],
    ];
    $('go-stats').innerHTML =
      `<div class="statline">Match time ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} · Your score: <b style="color:#ffd94a">${scoreOf(g.players[me])}</b></div>` +
      '<table>' + rows.map((r, i) =>
        `<tr>${r.map((c, j) => i === 0 ? `<th>${c}</th>` : `<td class="${j === 0 ? 'label' : ''}">${c}</td>`).join('')}</tr>`
      ).join('') + '</table>' +
      this.timelineCharts(timeline, me);
    $('gameover').classList.add('show');
    // draw after the canvases exist in the DOM
    if (timeline && timeline.length > 1) this.drawTimeline(timeline, me);
  }

  timelineCharts(timeline, me) {
    if (!timeline || timeline.length < 2) return '';
    return `<div class="statline" style="margin-top:12px">Score over time — <span style="color:#4d9bff">you</span> vs <span style="color:#ff6a4d">${TEAM_NAMES[1]}</span></div>
      <canvas id="go-chart-score" width="520" height="130"></canvas>
      <div class="statline" style="margin-top:10px">Army size over time</div>
      <canvas id="go-chart-mil" width="520" height="110"></canvas>`;
  }

  drawTimeline(timeline, me) {
    const g = this.game;
    const colorOf = (owner) => (owner === me ? '#4d9bff'
      : g.teamOf(owner) === g.myTeam ? '#59c96a'
      : owner === g.players.findIndex((p) => g.isEnemy(me, p.id)) ? '#ff6a4d' : '#b14fe0');
    const owners = g.players.map((p) => p.id)
      .sort((a, b) => (a === me ? 1 : 0) - (b === me ? 1 : 0)); // draw mine last, on top
    const draw = (id, get) => {
      const c = $(id);
      if (!c) return;
      const x = c.getContext('2d');
      const W = c.width, H = c.height, PAD = 6;
      x.fillStyle = '#14102a';
      x.fillRect(0, 0, W, H);
      let max = 1;
      for (const s of timeline) for (const o of owners) max = Math.max(max, get(s.p[o]) || 0);
      for (const owner of owners) {
        x.strokeStyle = colorOf(owner);
        x.lineWidth = 2;
        x.beginPath();
        timeline.forEach((s, i) => {
          const px = PAD + (i / (timeline.length - 1)) * (W - PAD * 2);
          const py = H - PAD - ((get(s.p[owner]) || 0) / max) * (H - PAD * 2);
          i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        });
        x.stroke();
      }
      x.strokeStyle = '#3a3468';
      x.strokeRect(0.5, 0.5, W - 1, H - 1);
    };
    draw('go-chart-score', (p) => p.score);
    draw('go-chart-mil', (p) => p.mil);
  }

  // ---------- tech tree overlay ----------
  buildTechTree() {
    const g = this.game, me = g.myId, p = g.players[me];
    const fac = g.factionKeys[me];
    const body = $('tt-body');
    const iconHTML = (kind, key) => {
      const img = PORTRAITS[key];
      if (img) return `<span class="tt-ic"><img src="${img}" alt=""></span>`;
      const ic = kind === 'b' ? (B_ICONS[key] || '🏠') : kind === 'u' ? (U_ICONS[key] || '🧸') : '🔬';
      return `<span class="tt-ic">${ic}</span>`;
    };
    const visible = (def) => !def.faction || def.faction === fac;
    let html = '';
    for (let age = 1; age <= 3; age++) {
      html += `<div class="tt-age"><h3>${AGES[age - 1]}</h3>`;
      // buildings
      const bs = Object.entries(BUILDINGS).filter(([, d]) => (d.age || 1) === age && visible(d) && d.type !== 'wall');
      if (bs.length) {
        html += '<div class="tt-group">Buildings</div>';
        for (const [key, def] of bs) {
          const owned = g.entities.some((e) => e.kind === 'building' && e.type === key && e.owner === me && !e.dead);
          html += `<div class="tt-item ${owned ? 'owned' : ''}">${iconHTML('b', key)}<span><span class="tt-nm">${def.name}</span></span>${owned ? '<span class="tt-ck">✓</span>' : ''}</div>`;
        }
      }
      // units
      const us = Object.entries(UNITS).filter(([, d]) => (d.age || 1) === age && visible(d));
      if (us.length) {
        html += '<div class="tt-group">Toys</div>';
        for (const [key, def] of us) {
          const built = g.entities.some((e) => e.kind === 'unit' && e.type === key && e.owner === me && !e.dead);
          html += `<div class="tt-item ${built ? 'owned' : ''}">${iconHTML('u', key)}<span><span class="tt-nm">${def.name}</span></span>${built ? '<span class="tt-ck">✓</span>' : ''}</div>`;
        }
      }
      // techs
      const ts = Object.entries(TECHS).filter(([, d]) => (d.age || 1) === age);
      if (ts.length) {
        html += '<div class="tt-group">Upgrades</div>';
        for (const [key, def] of ts) {
          const done = p.techs.has(key);
          html += `<div class="tt-item ${done ? 'owned' : ''}">${iconHTML('t', key)}<span><span class="tt-nm">${def.name}</span><br><span class="tt-ds">${def.desc}</span></span>${done ? '<span class="tt-ck">✓</span>' : ''}</div>`;
        }
      }
      html += '</div>';
    }
    body.innerHTML = html;
  }

  // ---------- selection / command card ----------
  // Full rebuild: only on selection/age/tech changes. The 5x/sec ticker calls
  // refreshInfo() instead — rebuilding buttons under the cursor eats clicks.
  refreshSelection() {
    this.queueSig = null;
    this.refreshInfo(true);
  }

  refreshInfo(rebuildCard = false) {
    const sel = this.game.selected.filter((e) => !e.dead);
    const info = $('sel-info');
    const queueBox = $('sel-queue');
    if (!sel.length) {
      $('sel-portrait').textContent = '';
      info.innerHTML = '<div class="dim">Select toys with left click or drag.<br>Right click: move / gather / attack. Shift queues orders.<br>A + click = attack-move · Ctrl+1-9 = control groups</div>';
      queueBox.innerHTML = '';
      if (rebuildCard) this.buildCard([]);
      return;
    }
    const first = sel[0];
    const icon = first.kind === 'building' ? (B_ICONS[first.type] || '🏠')
      : first.kind === 'resource' ? RES_META[first.resType].icon
      : first.kind === 'objective' ? '⭐'
      : first.kind === 'critter' ? '🐭'
      : (U_ICONS[first.type] || '🧸');
    const portrait = $('sel-portrait');
    const pimg = (first.kind === 'unit' || first.kind === 'building') ? PORTRAITS[first.type] : null;
    if (pimg) portrait.innerHTML = `<img src="${pimg}" alt="">`;
    else portrait.textContent = icon;
    portrait.className = first.owner === this.game.myId ? 'mine'
      : this.game.isEnemy(this.game.myId, first.owner) ? 'theirs'
      : first.owner >= 0 ? 'ally' : 'neutral';

    if (sel.length > 1) {
      const counts = {};
      for (const e of sel) counts[e.def.name] = (counts[e.def.name] || 0) + 1;
      info.innerHTML = `<b>${sel.length} toys selected</b><br>` +
        Object.entries(counts).map(([n, c]) => `${n} ×${c}`).join('<br>');
    } else if (first.kind === 'resource') {
      info.innerHTML = `<b>${first.def.name}</b><br><span class="hp">${Math.ceil(first.amount)} ${RES_META[first.resType].name} left</span>`;
    } else if (first.kind === 'objective') {
      const holder = first.holder < 0 ? 'nobody' : TEAM_NAMES[first.holder];
      info.innerHTML = `<b>⭐ ${first.def.name}</b><br><span class="dim">${first.def.desc}</span><br>Held by: <b>${holder}</b>`;
    } else if (first.kind === 'critter') {
      info.innerHTML = `<b>🐭 ${first.def.name}</b><br><span class="dim">${first.def.desc}</span>`;
    } else {
      const pct = Math.max(0, Math.min(100, (first.hp / first.maxHp) * 100));
      const hpClass = pct > 55 ? 'ok' : pct > 25 ? 'hurt' : 'critical';
      const lines = [`<div class="sel-name">${first.def.name}</div>`];
      lines.push(`<div class="hpbar"><div class="fill ${hpClass}" style="width:${pct}%"></div>`
        + `<span class="hpnum">${Math.ceil(first.hp)} / ${Math.round(first.maxHp)}</span></div>`);
      if (first.kind === 'unit') {
        const g = this.game;
        const stats = [`⚔️ ${g.atkOf(first)}`, `🛡️ ${g.armorOf(first, 'melee')}/${g.armorOf(first, 'pierce')}`, `👟 ${g.speedOf(first).toFixed(1)}`];
        lines.push(`<div class="statrow">${stats.map((s) => `<span>${s}</span>`).join('')}</div>`);
        // veterancy readout: rank, kills, and the road to the next promotion
        if (first.def.aggro > 0) {
          const k = first.kills || 0;
          const rank = k >= 10 ? '👑 Legend' : k >= 6 ? '⭐⭐ Elite' : k >= 3 ? '⭐ Veteran' : 'Recruit';
          const next = k >= 10 ? null : k >= 6 ? 10 : k >= 3 ? 6 : 3;
          lines.push(`<div class="statrow"><span>${rank}</span><span>🏆 ${k}${next ? ` · next rank at ${next}` : ' · max rank'}</span></div>`);
        }
        if (first.type === 'worker' && first.carry > 0.5) {
          lines.push(`<div class="dim">Carrying ${Math.floor(first.carry)} ${RES_META[first.carryType].icon}</div>`);
        }
      } else if (first.built < 1) {
        lines.push(`<div class="dim">Under construction — ${Math.round(first.built * 100)}%</div>`);
      } else if (first.def.desc) {
        lines.push(`<div class="dim">${first.def.desc}</div>`);
      }
      if (first.kind === 'building' && first.def.garrison && first.built >= 1) {
        lines.push(`<div class="statrow"><span>🧍 ${first.garrisonIds.length}/${first.def.garrison} garrisoned</span></div>`);
      }
      info.innerHTML = lines.join('');
    }
    this.updateQueueBox(sel, first);
    if (rebuildCard) this.buildCommandsFor(sel);
  }

  // production queue chips: rebuild DOM only when the queue composition
  // changes; otherwise just advance the progress bar (keeps clicks reliable)
  updateQueueBox(sel, first) {
    const queueBox = $('sel-queue');
    const p = this.game.players[this.game.myId];
    const isB = sel.length === 1 && first.kind === 'building' && first.owner === this.game.myId;
    const items = isB && first.queue ? first.queue : [];
    const aging = isB && first.type === 'chest' && p.aging > 0;
    const sig = items.map((q) => (q.kind === 'tech' ? 't:' + q.tech : 'u:' + q.type)).join(',') + (aging ? '|age' : '');
    if (sig !== this.queueSig) {
      this.queueSig = sig;
      queueBox.innerHTML = '';
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const d = document.createElement('div');
        d.className = 'qitem';
        d.title = 'Click to cancel (refunds cost)';
        d.textContent = item.kind === 'tech' ? `🔬 ${TECHS[item.tech].name.split(' ')[0]}` : UNITS[item.type].name.split(' ')[0];
        if (i === 0) {
          const bar = document.createElement('div');
          bar.className = 'qbar';
          d.appendChild(bar);
        }
        d.addEventListener('click', () => { this.game.issue({ t: 'cancel', id: first.id, i }); this.refreshSelection(); });
        queueBox.appendChild(d);
      }
      if (aging) {
        const d = document.createElement('div');
        d.className = 'qitem';
        d.textContent = 'Age…';
        const bar = document.createElement('div');
        bar.className = 'qbar';
        d.appendChild(bar);
        queueBox.appendChild(d);
      }
    }
    // advance progress bars in place
    const bars = queueBox.querySelectorAll('.qbar');
    let bi = 0;
    if (items.length && bars[bi]) {
      bars[bi].style.width = `${(1 - items[0].t / items[0].total) * 100}%`;
      bi++;
    }
    if (aging && bars[bi]) {
      bars[bi].style.width = `${(1 - p.aging / AGE_UPS[p.age].time) * 100}%`;
    }
  }

  costText(cost) {
    return Object.entries(cost).map(([k, v]) => `${v}${RES_META[k].icon}`).join(' ');
  }
  // compact stat line for a unit def, used in command-card tooltips
  unitStatLine(def) {
    const a = def.armor || {};
    const bits = [`❤️ ${def.hp}`];
    if (def.atk) bits.push(`⚔️ ${def.atk}${def.atkType && def.atkType !== 'melee' ? ' ' + def.atkType : ''}`);
    bits.push(`🛡️ ${a.melee || 0}/${a.pierce || 0}`);
    if (def.speed) bits.push(`👟 ${def.speed}`);
    if (def.range && def.range > 1.2) bits.push(`🎯 ${def.range}`);
    return bits.join('  ');
  }

  buildCommandsFor(sel) {
    const g = this.game;
    const me = g.myId;
    const own = sel.filter((e) => e.owner === me);
    const cmds = [];
    const units = own.filter((e) => e.kind === 'unit');
    const workers = units.filter((e) => e.type === 'worker');
    const first = own[0];

    if (workers.length) {
      for (const [key, def] of Object.entries(BUILDINGS)) {
        if (key === 'chest' && g.players[me].age < 2) continue;
        if (def.faction && def.faction !== g.factionKeys[me]) continue; // other tribes' workshops
        if (def.dock && !g.map.water) continue; // no point building a dock on dry land

        const ageReq = def.age || 1;
        cmds.push({
          icon: B_ICONS[key], img: PORTRAITS[key] || null, label: def.name,
          sub: this.costText(def.cost),
          lock: ageReq > 1 ? AGES[ageReq - 1] : null,
          title: `Build ${def.name} — ${def.desc}${ageReq > 1 ? ` (unlocks in the ${AGES[ageReq - 1]})` : ''}`,
          enabled: () => g.canAfford(me, def.cost) && ageReq <= g.players[me].age,
          lockText: () => (ageReq > g.players[me].age ? AGES[ageReq - 1] : null),
          onClick: () => this.hooks.beginPlacement(key),
        });
      }
    }
    if (units.length) {
      cmds.push({
        icon: '✋', label: 'Stop', sub: '', title: 'Halt all orders (X)', enabled: () => true,
        onClick: () => g.issue({ t: 'stop', ids: units.map((u) => u.id) }),
      });
      const mil = units.filter((u) => u.def.aggro > 0);
      if (mil.length) {
        const cur = mil[0].stance || 'agg';
        const stances = [
          ['agg', '⚔️', 'Attack', 'Aggressive: chase anything that comes close'],
          ['def', '🛡️', 'Defend', 'Defensive: fight back but stay near this post'],
          ['stand', '🧍', 'Hold', 'Stand ground: never chase, hold the line'],
        ];
        for (const [s, icon, label, tip] of stances) {
          cmds.push({
            icon, label, sub: '', title: tip, active: cur === s, enabled: () => true,
            onClick: () => { g.issue({ t: 'stance', ids: mil.map((u) => u.id), s }); this.refreshSelection(); },
          });
        }
        cmds.push({
          icon: '🔁', label: 'Patrol', sub: '', title: 'Patrol between here and a point — click the ground next',
          enabled: () => true, onClick: () => this.hooks.beginPatrol && this.hooks.beginPatrol(),
        });
      }
      if (units.length > 1) {
        const forms = [['box', '▦', 'Box'], ['line', '➖', 'Line'], ['spread', '⁘', 'Spread']];
        for (const [f, icon, label] of forms) {
          cmds.push({
            icon, label, sub: '', title: `${label} formation for group moves`,
            active: g.formation === f, enabled: () => true,
            onClick: () => { g.formation = f; this.refreshSelection(); },
          });
        }
      }
      if (units.some((u) => u.def.projectile && u.def.projectile.splash)) {
        cmds.push({
          icon: '💥', label: 'Bombard', sub: '', title: 'Attack ground: shell a spot — click the ground next (G)',
          enabled: () => true, onClick: () => this.hooks.beginAground && this.hooks.beginAground(),
        });
      }
    }
    if (own.length === 1 && first.kind === 'building' && first.built >= 1) {
      if (first.def.garrison && first.garrisonIds.length) {
        cmds.push({
          icon: '📤', label: `Empty (${first.garrisonIds.length})`, sub: '',
          title: 'Let every toy hiding inside back out',
          enabled: () => true,
          onClick: () => { g.issue({ t: 'ungar', id: first.id }); this.refreshSelection(); },
        });
      }
      if (first.def.bell) {
        cmds.push({
          icon: '🔔', label: 'Town Bell', sub: '',
          title: 'Ring: all workers hide in the nearest chest/tower/fort. Ring again: back to work (B)',
          enabled: () => true,
          onClick: () => g.issue({ t: 'bell' }),
        });
      }
      cmds.push({
        icon: '🗑️', label: 'Demolish', sub: '',
        title: 'Tear this building down (Delete). No refunds in the toybox.',
        enabled: () => true,
        onClick: () => { g.issue({ t: 'demolish', id: first.id }); g.setSelection([]); },
      });
      if (first.def.trains) {
        for (const t of first.def.trains) {
          const def = UNITS[t];
          // other tribes' uniques don't clutter the card
          if (def.faction && def.faction !== g.factionKeys[me]) continue;
          const ageReq = def.age || 1;
          cmds.push({
            icon: U_ICONS[t], img: PORTRAITS[t] || null, label: def.name,
            sub: this.costText(def.cost),
            lock: ageReq > 1 ? AGES[ageReq - 1] : null,
            tipName: `Train ${def.name}`, tipDesc: def.desc, tipCost: def.cost,
            tipStats: this.unitStatLine(def), tipHint: 'Shift-click trains 5',
            title: `Train ${def.name} — ${def.desc} (Shift-click trains 5)`,
            enabled: () => g.canAfford(me, def.cost) && ageReq <= g.players[me].age && first.queue.length < 5,
            lockText: () => (ageReq > g.players[me].age ? AGES[ageReq - 1] : null),
            onClick: (shift) => {
              const n = shift ? 5 : 1;
              for (let i = 0; i < n; i++) g.issue({ t: 'train', id: first.id, unit: t });
              this.refreshSelection();
            },
          });
        }
      }
      if (first.def.techs) {
        for (const techId of first.def.techs) {
          if (g.players[me].techs.has(techId)) continue;
          if (first.queue.some((q) => q.kind === 'tech' && q.tech === techId)) continue;
          const tech = TECHS[techId];
          cmds.push({
            icon: '🔬', label: tech.name,
            sub: this.costText(tech.cost),
            lock: tech.age > 1 ? AGES[tech.age - 1] : null,
            tipName: `Research ${tech.name}`, tipDesc: tech.desc, tipCost: tech.cost,
            title: `Research ${tech.name} — ${tech.desc}`,
            enabled: () => g.canAfford(me, tech.cost) && tech.age <= g.players[me].age && first.queue.length < 5,
            lockText: () => (tech.age > g.players[me].age ? AGES[tech.age - 1] : null),
            onClick: () => { g.issue({ t: 'tech', id: first.id, tech: techId }); this.refreshSelection(); },
          });
        }
      }
      if (first.def.market) {
        for (const r of ['blocks', 'snacks', 'marbles']) {
          cmds.push({
            icon: '💰', label: `Sell ${RES_META[r].icon}`,
            sub: () => `${MARKET.lot}${RES_META[r].icon}→${g.sellRate(r)}🔘`,
            title: `Sell ${MARKET.lot} ${RES_META[r].name} — price shifts with the market`,
            enabled: () => g.players[me].res[r] >= MARKET.lot,
            onClick: () => { g.issue({ t: 'trade', res: r, dir: 'sell' }); this.refreshSelection(); },
          });
          cmds.push({
            icon: '🛒', label: `Buy ${RES_META[r].icon}`,
            sub: () => `${g.buyRate(r)}🔘→${MARKET.lot}${RES_META[r].icon}`,
            title: `Buy ${MARKET.lot} ${RES_META[r].name} — price shifts with the market`,
            enabled: () => g.players[me].res.buttons >= g.buyRate(r),
            onClick: () => { g.issue({ t: 'trade', res: r, dir: 'buy' }); this.refreshSelection(); },
          });
        }
      }
      // ally tribute (team games): share a lot of a resource, minus tax
      const ally = g.players.find((pl) => pl.id !== me && pl.team === g.myTeam);
      if (ally && first.def.dropoff) {
        for (const r of RES_TYPES) {
          cmds.push({
            icon: '🎁', label: `Give ${RES_META[r].icon}`,
            sub: `100${RES_META[r].icon}→70`,
            title: `Send 100 ${RES_META[r].name} to your ally (30% delivery tax)`,
            enabled: () => g.players[me].res[r] >= 100,
            onClick: () => { g.issue({ t: 'tribute', res: r, toId: ally.id }); this.refreshSelection(); },
          });
        }
      }
      if (first.def.ageUp && AGE_UPS[g.players[me].age]) {
        const up = () => AGE_UPS[g.players[me].age];
        cmds.push({
          icon: '⏫', label: AGES[g.players[me].age],
          sub: this.costText(up().cost),
          title: `Advance to the ${AGES[g.players[me].age]} — requires ${up().reqText}. Unlocks new buildings, units and techs.`,
          enabled: () => g.players[me].aging <= 0 && g.canAfford(me, up().cost),
          onClick: () => { g.issue({ t: 'age', id: first.id }); this.refreshSelection(); },
        });
      }
      if (first.def.trains) {
        cmds.push({ icon: '🚩', label: 'Rally', sub: 'right-click', title: 'Right-click the map (or a resource) to set where new toys go', enabled: () => false, isHint: true });
      }
    }
    this.buildCard(cmds);
  }

  buildCard(cmds) {
    // no W/A/S/D (camera pan) and no T (tech tree)
    const KEYS = ['Q', 'E', 'R', 'Y', 'U', 'I', 'O', 'P', 'K', 'J'];
    const card = $('card');
    card.innerHTML = '';
    this.cardButtons = [];
    let ki = 0;
    for (const c of cmds) {
      const b = document.createElement('button');
      b.className = 'cmd' + (c.isHint ? ' hint' : '') + (c.active ? ' active' : '');
      const key = !c.isHint && ki < KEYS.length ? KEYS[ki++] : null;
      const im = c.img || ACTION_IMG[(c.icon || '').replace(/[︀-️]/g, '')];
      b.innerHTML = (key ? `<kbd>${key}</kbd>` : '')
        + (im ? `<img class="icoimg" src="${im}" alt="">` : `<span class="ico">${c.icon || '❔'}</span>`)
        + `<span class="lbl">${c.label}</span>`
        + (c.sub ? `<small>${typeof c.sub === 'function' ? c.sub() : c.sub}</small>` : '')
        + (c.lock ? `<span class="lock">🔒</span>` : '');
      b.disabled = c.isHint || !c.enabled();
      if (c.lockText && c.lockText()) b.classList.add('locked');
      b.addEventListener('click', (e) => { e.stopPropagation(); if (c.enabled()) c.onClick(!!e.shiftKey); });
      // rich hover tooltip (replaces the browser's slow native title)
      if (!c.isHint) {
        b.addEventListener('mouseenter', () => this.showTip(b, c, key));
        b.addEventListener('mousemove', (e) => this.moveTip(e));
        b.addEventListener('mouseleave', () => this.hideTip());
      }
      card.appendChild(b);
      this.cardButtons.push({ el: b, def: c });
    }
  }

  // ---------- command-card tooltip ----------
  showTip(btn, c, key) {
    const tip = $('tooltip');
    if (!tip) return;
    const cost = c.tipCost ? this.costText(c.tipCost) : (typeof c.sub === 'string' ? c.sub : (typeof c.sub === 'function' ? c.sub() : ''));
    const name = c.tipName || c.label;
    // fall back to the old title string (minus its "Verb Name — " prefix) for desc
    const desc = c.tipDesc || (c.title && c.title.includes(' — ') ? c.title.split(' — ').slice(1).join(' — ').replace(/\s*\([^)]*\)\s*$/, '') : c.title) || '';
    const lockReq = c.lockText && c.lockText();
    tip.innerHTML =
      `<div class="tt-name">${name}${key ? ` <kbd>${key}</kbd>` : ''}</div>` +
      (cost ? `<div class="tt-cost">${cost}</div>` : '') +
      (c.tipStats ? `<div class="tt-stats">${c.tipStats}</div>` : '') +
      (desc ? `<div class="tt-desc">${desc}</div>` : '') +
      (c.tipHint ? `<div class="tt-hint">${c.tipHint}</div>` : '') +
      (lockReq ? `<div class="tt-lock">🔒 Requires the ${lockReq}</div>` : '');
    tip.style.display = 'block';
    const r = btn.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(r.left, window.innerWidth - tip.offsetWidth - 8)) + 'px';
    tip.style.top = (r.top - tip.offsetHeight - 10) + 'px';
  }
  moveTip() { /* anchored to the button; nothing to follow */ }
  hideTip() { const tip = $('tooltip'); if (tip) tip.style.display = 'none'; }

  // ---------- per-frame ----------
  update(dt) {
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = 0.2;
      const p = this.game.players[this.game.myId];
      // resource totals + a net income/min shown over a rolling window (view-only).
      // window differencing captures the bursty deposits far better than an EMA.
      const now = this.game.time;
      if (!this.rateHist) this.rateHist = [];
      this.rateHist.push({ t: now, snacks: p.res.snacks, blocks: p.res.blocks, buttons: p.res.buttons, marbles: p.res.marbles });
      const WIN = 6;
      while (this.rateHist.length > 1 && this.rateHist[0].t < now - WIN) this.rateHist.shift();
      const old = this.rateHist[0], span = now - old.t;
      for (const r of RES_TYPES) {
        $(`res-${r}`).textContent = Math.floor(p.res[r]);
        const el = $(`rate-${r}`);
        if (el) {
          let txt = '';
          if (span > 1.5) { const rr = Math.round((p.res[r] - old[r]) / span * 12) * 5; if (rr > 0) txt = `+${rr}`; }
          el.textContent = txt;
        }
      }
      $('pop').textContent = `${p.popUsed}/${p.popCap}`;
      $('pop').parentElement.classList.toggle('capped', p.popUsed >= p.popCap);
      $('age').textContent = p.aging > 0 ? `${AGES[p.age - 1]} → ${AGES[p.age]}…` : AGES[p.age - 1];
      const t = Math.floor(this.game.time);
      $('clock').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      // wonder countdown banner
      // one countdown row: KotH throne > relic stickers > wonder
      const g = this.game;
      const ws = g.wonderState, rs = g.relicState, ks = g.kothState;
      const wt = $('wonder-timer');
      if (ks) {
        const s = Math.max(0, Math.ceil(ks.t));
        const mine = ks.team === g.myTeam;
        const tag = ks.contested ? ' (contested)' : '';
        wt.textContent = `👑 ${mine ? 'You rule the Throne' : 'RIVALS rule the Throne'}${tag}: ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        wt.className = mine ? 'show mine' : 'show theirs';
      } else if (rs) {
        const s = Math.max(0, Math.ceil(rs.t));
        const mine = rs.team === g.myTeam;
        wt.textContent = `⭐ ${mine ? 'Your team holds all Stickers' : 'RIVALS hold all Stickers'}: ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        wt.className = mine ? 'show mine' : 'show theirs';
      } else if (ws) {
        const s = Math.max(0, Math.ceil(ws.t));
        const mine = g.teamOf(ws.owner) === g.myTeam;
        wt.textContent = `⭐ ${mine ? 'Your' : 'RIVAL'} Wonder: ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        wt.className = mine ? 'show mine' : 'show theirs';
      } else if (wt.className) {
        wt.className = '';
      }
      const idle = this.game.getIdleWorkers(this.game.myId).length;
      $('idle-btn').textContent = `🔧 ${idle}`;
      $('idle-btn').classList.toggle('has-idle', idle > 0);
      for (const { el, def } of this.cardButtons) {
        if (def.isHint) { el.disabled = true; continue; }
        el.disabled = !def.enabled();
        if (def.lockText) {
          const lock = def.lockText();
          el.classList.toggle('locked', !!lock);
        }
      }
      // live info/queue refresh WITHOUT rebuilding buttons (buttons must stay
      // stable under the cursor or clicks get eaten)
      this.refreshInfo(false);
    }
    this.miniT -= dt;
    if (this.miniT <= 0) { this.miniT = 0.25; this.drawMinimap(); }
    for (const p of this.pings) p.t -= dt;
    this.pings = this.pings.filter((p) => p.t > 0);
    if (this.game.flarePing) this.game.flarePing.t -= dt;
  }

  drawMinimap() {
    const g = this.game, N = MAP_N;
    const ctx = this.miniCtx, S = this.mini.width, k = S / N;
    ctx.fillStyle = '#5c8f46';
    ctx.fillRect(0, 0, S, S);
    // elevation shading: higher ground reads brighter
    const H = g.height, E = g.ELEV || 0.85;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const h = H[j * N + i];
      if (h > 0.01) {
        ctx.fillStyle = h > E * 1.5 ? '#a4d383' : h >= E - 0.01 ? '#84b56a' : '#70a258';
        ctx.fillRect(i * k, j * k, k, k);
      }
    }
    ctx.fillStyle = '#3c5c30';
    const bl = g.blocked;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (bl[j * N + i]) ctx.fillRect(i * k, j * k, k, k);
    }
    for (const e of g.entities) {
      if (e.dead || e.removed) continue;
      const vis = g.fog.vis[Math.floor(e.z + N / 2) * N + Math.floor(e.x + N / 2)] || 0;
      const px = (e.x + N / 2) * k, pz = (e.z + N / 2) * k;
      if (e.kind === 'resource') {
        if (vis < 1) continue;
        ctx.fillStyle = '#' + RES_META[e.resType].color.toString(16).padStart(6, '0');
        ctx.fillRect(px - 1, pz - 1, 3, 3);
      } else if (e.kind === 'objective') {
        if (vis < 1) continue;
        ctx.fillStyle = e.holder === g.myTeam ? '#4d9bff' : e.holder >= 0 ? '#ff6a4d' : '#ffd94a';
        ctx.beginPath();
        ctx.arc(px, pz, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'building') {
        const hostile = g.isEnemy(g.myId, e.owner);
        if (hostile && !e.seen) continue;
        ctx.fillStyle = e.owner === g.myId ? '#4d9bff' : hostile ? '#ff6a4d' : '#59c96a';
        const s = e.def.size * k;
        ctx.fillRect(px - s / 2, pz - s / 2, s, s);
      } else if (e.kind === 'critter') {
        if (vis < 1) continue;
        ctx.fillStyle = '#d8d2e0';
        ctx.fillRect(px - 1, pz - 1, 2, 2);
      } else {
        if (e.garrisoned) continue;
        const hostile = g.isEnemy(g.myId, e.owner);
        if (hostile && vis !== 2) continue;
        ctx.fillStyle = e.owner === g.myId ? '#8fd0ff' : hostile ? '#ffb09b' : '#7de08a';
        ctx.fillRect(px - 1, pz - 1, 2.5, 2.5);
      }
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = g.fog.vis[j * N + i];
      if (v === 2) continue;
      ctx.fillStyle = v === 1 ? 'rgba(8,10,30,0.45)' : 'rgba(8,10,30,0.92)';
      ctx.fillRect(i * k, j * k, k + 0.5, k + 0.5);
    }
    for (const p of this.pings) {
      ctx.strokeStyle = `rgba(255,70,60,${Math.min(1, p.t)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc((p.x + N / 2) * k, (p.z + N / 2) * k, 5 + Math.sin(p.t * 10) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // ally flare: loud gold pulse until it burns out
    const fl = g.flarePing;
    if (fl && fl.t > 0) {
      ctx.strokeStyle = `rgba(255,217,74,${Math.min(1, fl.t / 2)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc((fl.x + N / 2) * k, (fl.z + N / 2) * k, 4 + ((fl.t * 6) % 8), 0, Math.PI * 2);
      ctx.stroke();
    }
    const c = this.hooks.cameraCenter();
    ctx.strokeStyle = '#ffffffaa';
    ctx.lineWidth = 1;
    ctx.strokeRect((c.x + N / 2 - 7) * k, (c.z + N / 2 - 5) * k, 14 * k, 10 * k);
  }
}
