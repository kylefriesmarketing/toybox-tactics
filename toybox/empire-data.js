// ============================================================
// EMPIRE MODE — all campaign content and tuning (Design Bible
// Appendix A vertical slice). Pure data: the resolver in
// empire.js reads this and never hardcodes content.
// ============================================================

// The 12-node "Bedroom War" slice board (bible Appendix A).
// mx/my are map-panel coordinates in a 1000x560 SVG viewBox.
export const E_NODES = {
  CAP_A:   { name: 'Brick Bastion',        icon: '🏰', type: 'capital',    mx: 90,  my: 275, yield: 20, biome: 'playmat',
             desc: 'The Snap-Brick capital. Twenty Parts a turn, and the lights stay on.' },
  CAP_B:   { name: 'Action Hall',          icon: '🎖️', type: 'capital',    mx: 910, my: 275, yield: 20, biome: 'livingroom',
             desc: 'The Army Men command post, dug in behind the couch cushion.' },
  RUG_1:   { name: 'Button Meadow',        icon: '🔘', type: 'resource',   mx: 235, my: 130, yield: 10, biome: 'playmat',
             desc: 'A scatter of lost buttons in the open rug country. +10 Parts/turn.' },
  WORK_1:  { name: 'Tiny Workshop',        icon: '🔧', type: 'market',     mx: 235, my: 420, yield: 6,  biome: 'kitchen',
             desc: 'A cluttered repair bench. +6 Parts/turn and honest work.' },
  CACHE:   { name: 'Lost Sock Cache',      icon: '🧦', type: 'discovery',  mx: 425, my: 480, yield: 0,  biome: 'underbed', bonus: 40,
             desc: 'Something valuable rolled under here once. One-time 40 Parts.' },
  FORT_W:  { name: 'Ruler Bridge Fort',    icon: '🌉', type: 'stronghold', mx: 400, my: 185, yield: 4,  biome: 'canyon', tier: 2,
             desc: 'The western bridge. Whoever holds the ruler holds the road.' },
  CENTER:  { name: 'Alphabet Crossroads',  icon: '🔤', type: 'mission',    mx: 520, my: 300, yield: 8,  biome: 'attic', dominion: 2,
             desc: 'Every road crosses the letter blocks. The center of the war.' },
  FORT_E:  { name: 'Bookend Gate',         icon: '📚', type: 'stronghold', mx: 660, my: 185, yield: 4,  biome: 'bookshelf', tier: 2,
             desc: 'The eastern gate, braced between two granite bookends.' },
  RUG_3:   { name: 'Crayon Trail',         icon: '🖍️', type: 'resource',   mx: 790, my: 130, yield: 8,  biome: 'playmat',
             desc: 'A waxy road through open carpet. +8 Parts/turn.' },
  BAT_1:   { name: 'Battery Drawer',       icon: '🔋', type: 'resource',   mx: 790, my: 420, yield: 10, biome: 'kitchen',
             desc: 'Fresh double-As, still in the packet. +10 Parts/turn.' },
  POWER:   { name: 'Wind-Up Station',      icon: '⚙️', type: 'mission',    mx: 585, my: 455, yield: 6,  biome: 'garden',
             desc: 'A ticking contraption of springs and keys. Worth fighting over.' },
  ARCHIVE: { name: 'Storybook Tower',      icon: '📖', type: 'crown',      mx: 520, my: 90,  yield: 6,  biome: 'attic', dominion: 2,
             desc: 'The tall stack of bedtime stories. A crown objective — hold it proudly.' },
};

// routes: [from, to, kind]; road = 1 MP, rough = 2 MP
export const E_ROUTES = [
  ['CAP_A', 'RUG_1', 'road'], ['CAP_A', 'WORK_1', 'road'],
  ['RUG_1', 'FORT_W', 'road'], ['WORK_1', 'CACHE', 'road'],
  ['CACHE', 'CENTER', 'rough'], ['FORT_W', 'CENTER', 'road'],
  ['FORT_W', 'POWER', 'rough'], ['CENTER', 'FORT_E', 'road'],
  ['CENTER', 'ARCHIVE', 'rough'], ['FORT_E', 'RUG_3', 'road'],
  ['FORT_E', 'BAT_1', 'road'], ['RUG_3', 'CAP_B', 'road'],
  ['BAT_1', 'CAP_B', 'road'], ['BAT_1', 'POWER', 'road'],
  ['POWER', 'ARCHIVE', 'rough'],
];

// how each node fights when contested: battle template → real RTS config.
// Defender advantage comes from the template (walls via high startRes, mode).
export const E_TEMPLATES = {
  field:   { label: 'Field Battle',      gameMode: 'standard', startRes: 'standard', time: '8-15 min' },
  siege:   { label: 'Stronghold Siege',  gameMode: 'standard', startRes: 'high',     time: '12-20 min', defBoost: 1.35 },
  clash:   { label: 'Crossroads Clash',  gameMode: 'koth',     startRes: 'standard', time: '10-16 min' },
  station: { label: 'Station Takeover',  gameMode: 'sudden',   startRes: 'high',     time: '8-14 min' },
};
export const E_NODE_TEMPLATE = {
  capital: 'siege', stronghold: 'siege', mission: 'clash', crown: 'clash',
  resource: 'field', market: 'field', discovery: 'field',
};
// POWER node fights as a sudden-death station per Appendix A's "Wind-Up Station"
export const E_NODE_TEMPLATE_OVERRIDE = { POWER: 'station', CENTER: 'clash' };

// slice factions (Appendix A: Brick Bastion vs Action Hall)
export const E_FACTIONS = {
  bricks:  { color: '#4d9bff', armyName: 'Brick Column' },
  classic: { color: '#7fd06a', armyName: 'Green Patrol' },
};

// starting army roster (unit cards; strength = %, vet = pips)
export const E_START_ROSTER = [
  { type: 'soldier', strength: 100, vet: 0 },
  { type: 'soldier', strength: 100, vet: 0 },
  { type: 'archer',  strength: 100, vet: 0 },
];
// what garrisons defend with, by node type (cards created on first contest)
export const E_GARRISONS = {
  capital:    [{ type: 'soldier' }, { type: 'soldier' }, { type: 'archer' }, { type: 'spear' }],
  stronghold: [{ type: 'soldier' }, { type: 'archer' }, { type: 'spear' }],
  mission:    [{ type: 'soldier' }, { type: 'archer' }],
  crown:      [{ type: 'soldier' }, { type: 'archer' }],
  resource:   [{ type: 'soldier' }],
  market:     [{ type: 'soldier' }],
  discovery:  [{ type: 'raider' }, { type: 'raider' }],
};

// slice upgrade shelf (bible §10, tier-I picks; Parts-only for the slice)
export const E_UPGRADES = {
  salvage:  { name: 'Organized Salvage', icon: '🧰', cost: 60,
              desc: '+15 Parts every time you capture a node.' },
  repairs:  { name: 'Field Repairs',     icon: '🔩', cost: 60,
              desc: 'Armies resting at your nodes heal +10 strength per turn (all cards).' },
  reserves: { name: 'Veteran Reserves',  icon: '🎖️', cost: 100,
              desc: 'Newly recruited unit cards start with one veterancy pip.' },
};

// economy + rules constants (bible §9 baseline, scaled to the slice)
export const E_RULES = {
  startParts: 120,
  armyMP: 3,
  routeCost: { road: 1, rough: 2 },
  recruitCost: 35,          // one fresh unit card at your capital
  maxCards: 8,              // bible §11 base capacity
  healPerTurn: 6,           // resting on friendly node (Field Repairs: +10 more)
  captureBonusBase: 10,     // loot for taking any node
  dominionNeed: 7,          // Dominion victory: nodes held (of 12)…
  dominionForts: 1,         // …including at least this many strongholds
  simVariance: 0.08,        // §12: bounded ±8%
  vetPowerBonus: 0.15,      // per pip
  turnCap: 24,              // §16 sunrise cap
};

// simulate-formula unit power reads UNITS source stats; these are the weights
export const E_SIM = { hpW: 1 / 42, dpsW: 1.15, cmdFlat: 2.0 };
