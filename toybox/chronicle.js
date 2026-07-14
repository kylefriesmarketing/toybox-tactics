// ============================================================
// AGE OF TOYS — the Chronicle (lifetime player legend) and the
// Bedtime Stories (achievements). Pure UI/persistence: reads a
// finished game's stats, never touches the sim.
// ============================================================

const CHRON_KEY = 'tt-chronicle';
const ACH_KEY = 'tt-achievements';

export function loadChronicle() {
  try { return JSON.parse(localStorage.getItem(CHRON_KEY) || 'null') || blank(); }
  catch { return blank(); }
}
function blank() {
  return { games: 0, wins: 0, playSec: 0, winsByFaction: {}, gamesByFaction: {},
    kills: 0, lost: 0, razed: 0, gathered: 0, mice: 0, shipsBuilt: 0, bestScore: 0 };
}

export function loadEarned() {
  try { return JSON.parse(localStorage.getItem(ACH_KEY) || '{}'); } catch { return {}; }
}

function campaignProgress() {
  try { return JSON.parse(localStorage.getItem('tt-campaign') || '{}'); } catch { return {}; }
}
const ACT1 = ['naptime', 'sandbox', 'bathtub', 'hill', 'finale'];
const ACT2 = ['crumbs', 'sofa', 'canyonrun', 'nightlight', 'shelfking'];
const ACT3 = ['tagged', 'boxed', 'bargain', 'stranger', 'wayhome'];
const ACT4 = ['doorstep', 'dunes', 'gardenwar', 'washout', 'oakcrown'];

// Every Bedtime Story: check(ctx) with ctx = { g, win, me, chron, earnedCount }
export const ACHIEVEMENTS = [
  { id: 'firstwin', icon: '🌙', name: 'The First Goodnight',
    desc: 'Win your first battle.',
    check: (c) => c.win },
  { id: 'fivetribes', icon: '🖐️', name: 'Five Tribes, One Commander',
    desc: 'Win a battle with every tribe in the toybox.',
    check: (c) => Object.keys(c.chron.winsByFaction).length >= 5 },
  { id: 'quietarmada', icon: '⚓', name: 'The Quiet Armada',
    desc: 'Win after launching 3+ ships without losing a single one.',
    check: (c) => c.win && c.me.stats.shipsBuilt >= 3 && c.me.stats.shipsLost === 0 },
  { id: 'kettle', icon: '⏱️', name: 'Before the Kettle Whistled',
    desc: 'Win a battle in under 8 minutes.',
    check: (c) => c.win && c.g.time < 480 },
  { id: 'opendoor', icon: '🚪', name: 'Open-Door Policy',
    desc: 'Win without building a single wall or gate.',
    check: (c) => c.win && c.me.stats.wallsBuilt === 0 },
  { id: 'enormous', icon: '🦖', name: 'Something Enormous',
    desc: 'Wind up a MEGA toy.',
    check: (c) => c.me.stats.megaBuilt >= 1 },
  { id: 'pastbedtime', icon: '🕰️', name: 'Past Bedtime',
    desc: 'Win a war that lasted 25 minutes or more.',
    check: (c) => c.win && c.g.time >= 1500 },
  { id: 'hoarder', icon: '🍪', name: 'The Great Snack Hoard',
    desc: 'Gather 4,000 resources in one battle.',
    check: (c) => c.me.stats.gathered >= 4000 },
  { id: 'untouchable', icon: '✨', name: 'Barely a Scuff',
    desc: 'Win while losing five toys or fewer.',
    check: (c) => c.win && c.me.stats.lost <= 5 },
  { id: 'comeback', icon: '💫', name: 'The Beaten Toy Stood Up',
    desc: 'Win a battle you were badly losing.',
    check: (c) => c.win && !!c.g._told_comeback },
  { id: 'wonder', icon: '⭐', name: 'Star Architect',
    desc: 'Finish building a Wonder.',
    check: (c) => c.g.entities.some((e) => e.kind === 'building' && e.type === 'wonder'
      && e.owner === c.g.myId && !e.dead && e.built >= 1) },
  { id: 'kingme', icon: '👑', name: 'Long Live the King',
    desc: 'Win a game of Regicide.',
    check: (c) => c.win && c.g.gameMode === 'regicide' },
  { id: 'hillheld', icon: '🏔️', name: 'King of the Pillow',
    desc: 'Win King of the Hill.',
    check: (c) => c.win && c.g.gameMode === 'koth' },
  { id: 'suddenimpact', icon: '💥', name: 'One Chest, No Mercy',
    desc: 'Win Sudden Death.',
    check: (c) => c.win && c.g.gameMode === 'sudden' },
  { id: 'mousewhisperer', icon: '🐭', name: 'The Pied Piper',
    desc: 'Befriend three wind-up mice in one battle.',
    check: (c) => c.me.stats.mice >= 3 },
  { id: 'admiral', icon: '🛁', name: 'Admiral of the Bath',
    desc: 'Launch five ships in one battle.',
    check: (c) => c.me.stats.shipsBuilt >= 5 },
  { id: 'boomtown', icon: '🏭', name: 'An Empire of Busy Hands',
    desc: 'Boom so hard the narrator notices.',
    check: (c) => !!c.g._told_boom },
  { id: 'act1', icon: '📖', name: 'The Room Is One',
    desc: 'Finish Act I — The Bedroom Wars.',
    check: () => ACT1.every((id) => campaignProgress()[id]) },
  { id: 'act2', icon: '🎒', name: 'One Goodbye at a Time',
    desc: 'Finish Act II — The Sleepover.',
    check: () => ACT2.every((id) => campaignProgress()[id]) },
  { id: 'act3', icon: '🏡', name: 'The Long Way Home',
    desc: 'Finish Act III — The Yard Sale.',
    check: () => ACT3.every((id) => campaignProgress()[id]) },
  { id: 'collector', icon: '📚', name: 'Keeper of Stories',
    desc: 'Earn twelve other Bedtime Stories.',
    check: (c) => c.earnedCount >= 12 },
  // ---- beyond the shelf: stories from after the book was "finished" ----
  // (beyond: true keeps them out of the Toy Box Zero gate — page zero asks
  // for the original twenty-one, not for everything written since)
  { id: 'secondnight', icon: '🌒', name: 'Told Twice, True Twice', beyond: true,
    desc: 'Win any campaign mission on the Second Night (NG+).',
    check: (c) => c.win && !!c.g.ngPlus },
  { id: 'together', icon: '🤝', name: 'Better Together', beyond: true,
    desc: 'Win a battle fighting beside an AI ally.',
    check: (c) => c.win && c.g.players.some((p) => p.id !== c.g.myId && p.team === c.g.players[c.g.myId].team) },
  { id: 'pagezero', icon: '📦', name: 'The Page Under the Pages', beyond: true,
    desc: 'Win Toy Box Zero — the first war, told in sepia.',
    check: (c) => c.win && !!c.g.zeroEra },
  { id: 'act4', icon: '🌿', name: 'The Book Has a Backyard', beyond: true,
    desc: 'Finish Act IV — The Great Outdoors, and bring Bun-Bun home.',
    check: () => ACT4.every((id) => campaignProgress()[id]) },
];

// Called once per finished match. Updates the Chronicle, evaluates every
// unearned achievement, persists both, and returns the newly earned list.
export function recordMatch(g, win) {
  const me = g.players[g.myId];
  if (!me) return [];
  const chron = loadChronicle();
  const fac = (g.factionKeys && g.factionKeys[g.myId]) || 'classic';
  chron.games++;
  chron.playSec += Math.floor(g.time);
  chron.gamesByFaction[fac] = (chron.gamesByFaction[fac] || 0) + 1;
  if (win) { chron.wins++; chron.winsByFaction[fac] = (chron.winsByFaction[fac] || 0) + 1; }
  chron.kills += me.stats.kills; chron.lost += me.stats.lost; chron.razed += me.stats.razed;
  chron.gathered += Math.round(me.stats.gathered);
  chron.mice += me.stats.mice || 0;
  chron.shipsBuilt += me.stats.shipsBuilt || 0;
  const last = g.timeline[g.timeline.length - 1];
  const score = last && last.p[g.myId] ? last.p[g.myId].score : 0;
  if (score > chron.bestScore) chron.bestScore = score;
  try { localStorage.setItem(CHRON_KEY, JSON.stringify(chron)); } catch { /* private mode */ }

  const earned = loadEarned();
  const ctx = { g, win, me, chron, earnedCount: Object.keys(earned).length };
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (earned[a.id]) continue;
    let ok = false;
    try { ok = !!a.check(ctx); } catch { /* a broken check never blocks the game */ }
    if (ok) { earned[a.id] = Date.now(); ctx.earnedCount++; newly.push(a); }
  }
  if (newly.length) { try { localStorage.setItem(ACH_KEY, JSON.stringify(earned)); } catch { /* ok */ } }
  return newly;
}
