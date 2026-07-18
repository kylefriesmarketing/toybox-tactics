// ============================================================
// EMPIRE MODE — all campaign content and tuning (Design Bible
// Appendix A vertical slice). Pure data: the resolver in
// empire.js reads this and never hardcodes content.
// ============================================================

// The 12-node "Bedroom War" slice board (bible Appendix A).
// mx/my are map-panel coordinates in a 1000x560 SVG viewBox.
export const E_NODES = {
  CAP_A:   { name: 'Brick Bastion',        icon: '🏰', type: 'capital',    mx: 90,  my: 275, yield: 20, powerYield: 1, imagYield: 2, biome: 'playmat',
             desc: 'The Snap-Brick capital. Twenty Parts a turn, and the lights stay on.' },
  CAP_B:   { name: 'Action Hall',          icon: '🎖️', type: 'capital',    mx: 910, my: 275, yield: 20, powerYield: 1, imagYield: 2, biome: 'livingroom',
             desc: 'The Army Men command post, dug in behind the couch cushion.' },
  RUG_1:   { name: 'Button Meadow',        icon: '🔘', type: 'resource',   mx: 235, my: 130, yield: 10, biome: 'playmat',
             desc: 'A scatter of lost buttons in the open rug country. +10 Parts/turn.' },
  WORK_1:  { name: 'Tiny Workshop',        icon: '🔧', type: 'market',     mx: 235, my: 420, yield: 6,  biome: 'kitchen',
             desc: 'A cluttered repair bench. +6 Parts/turn and honest work.' },
  CACHE:   { name: 'Lost Sock Cache',      icon: '🧦', type: 'discovery',  mx: 425, my: 480, yield: 0,  biome: 'underbed', bonus: 40,
             desc: 'Something valuable rolled under here once. One-time 40 Parts.' },
  FORT_W:  { name: 'Ruler Bridge Fort',    icon: '🌉', type: 'stronghold', mx: 400, my: 185, yield: 4,  biome: 'canyon', tier: 2,
             desc: 'The western bridge. Whoever holds the ruler holds the road.' },
  CENTER:  { name: 'Alphabet Crossroads',  icon: '🔤', type: 'mission',    mx: 520, my: 300, yield: 8,  imagYield: 1, biome: 'attic', dominion: 2,
             desc: 'Every road crosses the letter blocks. The center of the war.' },
  FORT_E:  { name: 'Bookend Gate',         icon: '📚', type: 'stronghold', mx: 660, my: 185, yield: 4,  biome: 'bookshelf', tier: 2,
             desc: 'The eastern gate, braced between two granite bookends.' },
  RUG_3:   { name: 'Crayon Trail',         icon: '🖍️', type: 'resource',   mx: 790, my: 130, yield: 8,  biome: 'playmat',
             desc: 'A waxy road through open carpet. +8 Parts/turn.' },
  BAT_1:   { name: 'Battery Drawer',       icon: '🔋', type: 'resource',   mx: 790, my: 420, yield: 10, powerYield: 1, biome: 'kitchen',
             desc: 'Fresh double-As, still in the packet. +10 Parts and +1 Power per turn.' },
  POWER:   { name: 'Wind-Up Station',      icon: '⚙️', type: 'mission',    mx: 585, my: 455, yield: 6,  powerYield: 1, biome: 'garden',
             desc: 'A ticking contraption of springs and keys. +1 Power per turn, and worth fighting over.' },
  ARCHIVE: { name: 'Storybook Tower',      icon: '📖', type: 'crown',      mx: 520, my: 90,  yield: 6,  imagYield: 3, biome: 'attic', dominion: 2,
             desc: 'The tall stack of bedtime stories. Hold the crown here for four turns to win the night — and it brims with Imagination.' },
  // the 13th node (round 14): a THIRD capital in the southern under-bed
  // country, so the Bedroom War can seat three flags
  CAP_C:   { name: 'Windowsill Keep',      icon: '🪟', type: 'capital',    mx: 500, my: 525, yield: 20, powerYield: 1, imagYield: 2, biome: 'underbed',
             desc: 'The third power of the bedroom floor, watching from the sill. Twenty Parts a turn and a long memory.' },
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
  // Windowsill Keep's roads: the southern kingdom reaches the cache country,
  // the wind-up works, and (roughly) the workshop
  ['CAP_C', 'CACHE', 'road'], ['CAP_C', 'POWER', 'road'], ['CAP_C', 'WORK_1', 'rough'],
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

// Mission-template library (§7): each base template has thematic VARIANTS, picked
// deterministically per encounter (from its seed). A variant reskins the played battle —
// its label, gameMode, startRes tier, and a one-line flavour note — WITHOUT touching the
// simulate math (defBoost stays on the base template), so battle odds + headless determinism
// are unchanged; only the RTS match you Play varies. Variant 0 == the classic behaviour.
export const E_TEMPLATE_VARIANTS = {
  field: [
    { label: 'Field Battle',        note: 'An open scrap on level ground.' },
    { label: 'Dawn Raid',           gameMode: 'sudden',   startRes: 'lean',     note: 'Sudden death, lean supplies — hit fast, hit first.' },
    { label: 'Supply Run',          gameMode: 'standard', startRes: 'high',     note: 'Stockpiles everywhere — the longer game rewards economy.' },
  ],
  siege: [
    { label: 'Stronghold Siege',    note: 'Dug-in walls and stocked larders.' },
    { label: 'Midnight Assault',    gameMode: 'sudden',   startRes: 'high',     note: 'Storm the walls before the household stirs — sudden death.' },
    { label: 'The Long Siege',      gameMode: 'standard', startRes: 'marathon', note: 'A grinding, well-fed siege — settle in for the long night.' },
  ],
  clash: [
    { label: 'Crossroads Clash',    note: 'Hold the middle to win the hill.' },
    { label: 'Center Stage',        gameMode: 'koth',     startRes: 'high',     note: 'A well-supplied brawl for the contested heart.' },
    { label: 'Scramble',           gameMode: 'sudden',   startRes: 'standard', note: 'No second chances — one clean break decides it.' },
  ],
  station: [
    { label: 'Station Takeover',    note: 'Seize the wind-up works — sudden death.' },
    { label: 'Power Struggle',      gameMode: 'koth',     startRes: 'high',     note: 'Hold the power for the win — batteries fully charged.' },
  ],
};

// Empire difficulty (§13): a campaign-level challenge tier chosen at the start of a new war.
// Scales the RIVAL's economy + how readily it attacks, and the difficulty of PLAYED battles.
// aiBand = the power ratio the AI needs before it commits to an assault (higher = timider).
export const E_DIFFICULTY = {
  cozy:     { label: 'Cozy Night',  icon: '🌛', aiIncomeMul: 0.75, aiBand: 1.70, rts: 'easy',
              desc: 'A gentle campaign — the rival builds slowly and only strikes when it clearly wins.' },
  normal:   { label: 'Lights-Out',  icon: '🌙', aiIncomeMul: 1.00, aiBand: 1.35, rts: 'normal',
              desc: 'A fair fight. The rival matches your pace and takes honest risks.' },
  ruthless: { label: 'Sleep Tight', icon: '🌑', aiIncomeMul: 1.30, aiBand: 1.12, rts: 'hard',
              desc: 'The rival is well-fed and presses every advantage. Do not blink.' },
};

// slice factions (Appendix A: Brick Bastion vs Action Hall)
export const E_FACTIONS = {
  bricks:  { color: '#4d9bff', armyName: 'Brick Column' },
  classic: { color: '#7fd06a', armyName: 'Green Patrol' },
  bots:    { color: '#e4a72e', armyName: 'Tin Battalion' }, // seat 3 (round 14)
  plush:   { color: '#e07ab8', armyName: 'Cuddle Guard' },
  racers:  { color: '#e4572e', armyName: 'Pit Crew' },
  knights: { color: '#b9a9e8', armyName: 'Tin Vanguard' },
};

// starting army roster — collection card keys (see empire-cards.js E_CARDS)
export const E_START_ROSTER = ['recruit', 'recruit', 'archer'];
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

// stronghold & capital modules (bible §8): build sockets on the nodes that
// anchor your empire. Effects reach both the campaign map and the battle bridge.
export const E_MODULES = {
  walls:      { name: 'Block Walls', icon: '🧱', parts: 55, imag: 0,  def: 0.3,
                desc: 'A wall of stacked blocks. You fight +30% stronger defending this fort.' },
  workshop:   { name: 'Workshop',    icon: '🏭', parts: 60, imag: 0,  parts_yield: 8, heal: 8,
                desc: '+8 Parts/turn here, and armies resting on this node mend +8 more.' },
  watchtower: { name: 'Watchtower',  icon: '🔭', parts: 45, imag: 15, scout: 2,
                desc: 'Scout enemy garrisons within two routes of this fort.' },
  barracks:   { name: 'Barracks',    icon: '⛺', parts: 55, imag: 15, recruit: true,
                desc: 'Field collection cards here as if standing at your capital.' },
  generator:  { name: 'Power Cell',   icon: '🔌', parts: 50, imag: 10, power_yield: 2,
                desc: '+2 Power each turn this node is supplied — fuel for Force Marches.' },
  library:    { name: 'Dream Library', icon: '📚', parts: 45, imag: 20, imag_yield: 3,
                desc: '+3 Imagination each turn this node is supplied — fuel for the Empire Tree.' },
};
// how many module sockets a node offers, by type. The capital is your Citadel — 3 sockets (§8).
export const E_MODULE_SLOTS = { capital: 3, stronghold: 2, crown: 0, mission: 0, resource: 0, market: 0, discovery: 0 };

// House events (§5): the room is alive after bedtime. One brews at a time,
// telegraphed a full turn before it strikes (fair-warning rule). Each is
// mechanically distinct; the resolver in empire.js applies the flagged effects.
export const E_EVENTS = {
  vacuum:  { name: 'The Vacuum',        icon: '🌪️', closesRoute: true,
             warn: 'A distant RUMBLE — the vacuum is coming for a road!' },
  cat:     { name: 'Cat on Patrol',     icon: '🐱', closesRoute: true, swat: true,
             warn: 'A soft paw pads closer — the cat is on patrol!' },
  battery: { name: 'Low Battery Night', icon: '🔋', dimsPower: true,
             warn: 'The nightlight flickers — a Low Battery Night is falling!' },
  spill:   { name: 'Spilled Drink',     icon: '🥤', closesRoute: true, floods: true,
             warn: 'A cup wobbles at the table edge — a spill is brewing!' },
};

// Doctrines (§10): a swappable strategic identity. You start with one slot and
// unlock a second midgame. Each doctrine is a focused passive that expresses a
// playstyle. Swapping an occupied slot costs Power, to discourage counter-picking.
export const E_DOCTRINES = {
  scavenger: { name: 'Scavenger Economy', icon: '🧰', desc: '+40% Parts from every capture, and +5 extra scraps per battle won.' },
  fortified: { name: 'Fortified Frontier', icon: '🏯', desc: 'You fight +15% stronger defending ANY territory you hold, not just forts.' },
  lightning: { name: 'Lightning Campaign', icon: '⚡', desc: 'Every army gains +1 Movement, and Force March costs no Power.' },
  warrior:   { name: "Warrior's Code",     icon: '🎖️', desc: 'Your armies fight +10% stronger in every battle, played or simulated.' },
  spymaster: { name: 'Spymaster',          icon: '🔭', desc: 'Scout every garrison on the board, and always see the rival empire’s target.' },
  dreamer:   { name: "Dreamer's Gambit",   icon: '💡', desc: '+50% Imagination income, and Empire Tree upgrades cost 20% fewer Parts.' },
};

// the Empire Tree (bible §10): four branches, two tiers each. Tier II needs its
// branch's tier I. Bought with Parts + Imagination — the slower, strategic yield.
// Distinct empires emerge by the midgame from which branches you commit to.
export const E_BRANCHES = {
  logistics:    { name: 'Logistics',    icon: '🚚' },
  industry:     { name: 'Industry',     icon: '🏭' },
  warfare:      { name: 'Warfare',      icon: '⚔️' },
  intelligence: { name: 'Intelligence', icon: '🔭' },
};
export const E_UPGRADES = {
  relay:     { branch: 'logistics', tier: 1, name: 'Relay Routes',    icon: '🛼', parts: 55,  imag: 15,
               desc: 'Every army gains +1 Movement each turn — a faster, more responsive empire.' },
  repairs:   { branch: 'logistics', tier: 2, prereq: 'relay', name: 'Field Repairs', icon: '🔩', parts: 110, imag: 35,
               desc: 'Armies resting on supplied nodes mend +12 more strength per turn.' },
  salvage:   { branch: 'industry',  tier: 1, name: 'Organized Salvage', icon: '🧰', parts: 55, imag: 15,
               desc: '+15 Parts every time you capture a node.' },
  workshop:  { branch: 'industry',  tier: 2, prereq: 'salvage', name: 'Grand Workshop', icon: '🏗️', parts: 110, imag: 40,
               desc: 'Your capital produces +10 Parts every turn.' },
  reserves:  { branch: 'warfare',   tier: 1, name: 'Veteran Reserves', icon: '🎖️', parts: 70, imag: 20,
               desc: 'Newly recruited and mustered toys start with a veterancy pip.' },
  combined:  { branch: 'warfare',   tier: 2, prereq: 'reserves', name: 'Combined Arms', icon: '🎯', parts: 130, imag: 45,
               desc: 'Your armies fight at +15% power in every battle, played or simulated.' },
  kites:     { branch: 'intelligence', tier: 1, name: 'Scouting Kites', icon: '🪁', parts: 55, imag: 20,
               desc: 'Scout enemy garrison strength from two routes away, not just adjacent.' },
  masterplan:{ branch: 'intelligence', tier: 2, prereq: 'kites', name: 'Master Plan', icon: '🗺️', parts: 120, imag: 45,
               desc: "Reveal the rival empire's current target on the map." },
};

// economy + rules constants (bible §9 baseline, scaled to the slice)
export const E_RULES = {
  startParts: 120,
  startPower: 2,
  startImag: 20,           // §9: the slow, strategic currency for the empire tree
  powerCap: 8,             // §9: Power must be spent, not hoarded
  crownNode: 'ARCHIVE',    // §16 Crown Victory: hold the Storybook Tower…
  crownNeed: 4,            // …for this many consecutive turns to win
  combinedArmsMul: 1.15,   // Warfare II battle-power bonus
  workshopBonus: 10,       // Industry II capital Parts/turn
  relayMP: 1,              // Logistics I extra movement
  victoryWarn: 2,          // telegraph a rival within N turns of any victory (§16)
  scrapDrop: 12,           // scraps earned each battle you win (craft currency)
  chestScraps: 25,         // bonus scraps for cracking a treasure node (discovery)
  doctrineSlot2Turn: 8,    // the second doctrine slot unlocks midgame (§10)
  doctrineSwapCost: 2,     // Power to replace a committed doctrine (anti counter-pick)
  // §15 diplomacy (round 14): Non-Aggression Pacts between any two seats.
  // Free to offer, binding for pactTurns; breaking early costs Power+Imag and
  // leaves a grudge (that rival fights you bolder for grudgeTurns).
  pact: { turns: 4, breakPower: 3, breakImag: 6, grudgeTurns: 6, grudgeBand: 0.16 },
  armyMP: 3,
  routeCost: { road: 1, rough: 2 },
  forceMarchCost: 1,        // Power: +1 MP, once per army per turn (§6)
  recruitCost: 35,          // one fresh unit card at your capital
  maxCards: 8,              // bible §11 base capacity
  maxArmies: 2,             // slice cap; §11 Grand Army raises this later
  musterCost: 60,           // Parts: raise a second army at your capital
  musterMinNodes: 4,        // an empire this small can't feed two armies
  healPerTurn: 6,           // resting on a SUPPLIED friendly node (Field Repairs: +10)
  captureBonusBase: 10,     // loot for taking any node
  dominionNeed: 7,          // Dominion victory: nodes held (of 12)…
  dominionForts: 1,         // …including at least this many strongholds
  simVariance: 0.08,        // §12: bounded ±8%
  vetPowerBonus: 0.15,      // per pip
  turnCap: 24,              // §16 sunrise cap
  // "The Vacuum Approaches" (§5): telegraphed one turn, then closes a route.
  vacuum: { earliest: 5, chance: 0.30, duration: 2 },
  // Aftermath Spoils (§17): a one-time reward pick when YOU storm a capital/stronghold/crown.
  // A rare, high-stakes decision (the AI keeps its own economy — this is the SP power fantasy).
  spoils: { parts: 45, heal: 100, power: 2 },
  // Readiness (§11): fighting tires an army; a battle at low readiness hits softer (down to
  // `floor` at 0). Resting on a SUPPLIED friendly node recovers `regen`/turn. A universal tempo
  // layer for both sides — you can't ram one deathstack around the board without a breather.
  readiness: { max: 100, floor: 0.72, cost: 34, regen: 26, marchCost: 12, lowAt: 55 },
};

// simulate-formula unit power reads UNITS source stats; these are the weights
export const E_SIM = { hpW: 1 / 42, dpsW: 1.15, cmdFlat: 2.0 };
