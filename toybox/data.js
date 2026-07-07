// ============================================================
// TOYBOX TACTICS — data definitions.
// Balance lives here, not in system code (see brief §16, §18).
// ============================================================

export const MAP_N = 72;               // map is N x N tiles, 1 tile = 1 world unit
export const POP_MAX = 120;

// per-player ring/banner colors: you, rival, ally, second rival
export const TEAM_COLORS = [0x3b82f6, 0xe4572e, 0x59c96a, 0xb14fe0];
export const TEAM_NAMES  = ['You', 'Rival Toys'];
export const PLAYER_LABELS = ['You', 'Rivals', 'Ally', 'Rivals II'];

export const RES_TYPES = ['snacks', 'blocks', 'buttons', 'marbles'];
export const RES_META = {
  snacks:  { name: 'Snacks',  icon: '🍪', nodeName: 'Cookie Crumbs', nodeAmount: 400, color: 0xd8a24a },
  blocks:  { name: 'Blocks',  icon: '🧱', nodeName: 'Block Pile',    nodeAmount: 450, color: 0xe05555 },
  buttons: { name: 'Buttons', icon: '🔘', nodeName: 'Button Jar',    nodeAmount: 400, color: 0xf0d060 },
  marbles: { name: 'Marbles', icon: '🔮', nodeName: 'Marble Pouch',  nodeAmount: 350, color: 0x7fd0e8 },
};

export const AGES = ['Bedtime Age', 'Playmat Age', 'Fort Age'];
// AGE_UPS[currentAge] = requirements to advance out of it
export const AGE_UPS = {
  1: { cost: { snacks: 400, blocks: 150 }, time: 40, reqBuildings: ['house', 'mat'], reqText: 'Block House + Training Mat' },
  2: { cost: { snacks: 800, buttons: 350 }, time: 55, reqAge2Count: 2, reqText: 'two Playmat Age buildings' },
};

// market exchange (AoE-style sink for floating resources)
export const MARKET = { sellGain: 45, buyCost: 65, lot: 100 };

// ---------------- units ----------------
// speed: tiles/sec. range: tiles. interval: seconds between attacks.
// armor: damage reduction by incoming attack type. bonus: extra damage vs tag.
// impact: fraction through the attack swing when damage/projectile happens.
export const UNITS = {
  worker: {
    name: 'Worker Buddy', tags: ['worker', 'light'], age: 1,
    cost: { snacks: 50 }, trainTime: 11,
    hp: 35, atk: 2, atkType: 'melee', interval: 1.5, range: 0.7,
    armor: { melee: 0, pierce: 0 }, speed: 1.5, vision: 5, aggro: 0,
    carry: 10, gatherRate: 1.35, impact: 0.45, color: 0xf9c74f,
    debris: { shapes: ['limb', 'peg', 'cube'], colors: [0xf9c74f, 0xe8b53e] },
    desc: 'Gathers, builds and repairs. Protect them.',
  },
  scout: {
    name: 'Wind-Up Scout', tags: ['scout', 'vehicle'], age: 1,
    cost: { snacks: 80 }, trainTime: 13,
    hp: 45, atk: 3, atkType: 'melee', interval: 1.4, range: 0.7,
    armor: { melee: 1, pierce: 0 }, speed: 2.7, vision: 9, aggro: 0,
    impact: 0.45, color: 0x90be6d,
    debris: { shapes: ['peg', 'disc', 'cube'], colors: [0x90be6d, 0x7fa85f, 0xb8b8c0] },
    desc: 'Fast eyes. Reveals the bedroom before the fight.',
  },
  soldier: {
    name: 'Block Soldier', tags: ['infantry', 'melee'], age: 1,
    cost: { snacks: 60, blocks: 20 }, trainTime: 12,
    hp: 60, atk: 6, atkType: 'melee', interval: 1.5, range: 0.7,
    armor: { melee: 1, pierce: 0 }, speed: 1.6, vision: 6, aggro: 5,
    impact: 0.45, color: 0x577590, handWeapon: 'rifle',
    // classic army man: bursts into green plastic limbs
    debris: { shapes: ['limb', 'limb', 'peg'], colors: [0x4a7c40, 0x3e6b36, 0x5c8f4c], count: 8 },
    desc: 'Cheap frontline. Loses to massed archers.',
  },
  spear: {
    name: 'Push-Pin Spear', tags: ['infantry', 'spear'], age: 2,
    cost: { snacks: 45, blocks: 30 }, trainTime: 12,
    hp: 55, atk: 4, atkType: 'melee', interval: 1.6, range: 0.9,
    bonus: { raider: 10 },
    armor: { melee: 0, pierce: 0 }, speed: 1.5, vision: 6, aggro: 5,
    impact: 0.5, color: 0xf94144,
    debris: { shapes: ['peg', 'stick'], colors: [0xf94144, 0xd9d9d9] },
    desc: 'Anti-raider. Skewers RC Raiders on contact.',
  },
  archer: {
    name: 'Button Archer', tags: ['ranged'], age: 2,
    cost: { blocks: 25, buttons: 45 }, trainTime: 13,
    hp: 42, atk: 5, atkType: 'pierce', interval: 1.9, range: 5,
    armor: { melee: 0, pierce: 0 }, speed: 1.5, vision: 7, aggro: 6,
    impact: 0.55, color: 0xf8961e, handWeapon: 'bow',
    projectile: { speed: 13, arc: true, color: 0xffd166, size: 0.09, trail: 0xffd166 },
    // scatters its ammo: buttons everywhere
    debris: { shapes: ['disc', 'disc', 'limb'], colors: [0xf8961e, 0xffd166, 0xe8c352] },
    desc: 'Ranged damage. Beats slow melee, dies to raiders.',
  },
  flinger: {
    name: 'Rubber-Band Flinger', tags: ['ranged', 'skirmisher'], age: 2, proc: 'flinger',
    cost: { snacks: 35, blocks: 35 }, trainTime: 12,
    hp: 45, atk: 3, atkType: 'pierce', interval: 1.7, range: 4.5, minRange: 1,
    bonus: { ranged: 8 },
    armor: { melee: 0, pierce: 1 }, speed: 1.6, vision: 7, aggro: 6,
    impact: 0.5, color: 0x9b5de5,
    projectile: { speed: 15, arc: false, color: 0xc9b6f0, size: 0.08, band: true, trail: 0x9b5de5 },
    debris: { shapes: ['stick', 'peg'], colors: [0x9b5de5, 0xd9b38c] },
    desc: 'Cheap anti-archer. Snaps rubber bands at ranged toys.',
  },
  medic: {
    name: 'Plush Medic', tags: ['support', 'plush'], age: 2, proc: 'medic',
    cost: { snacks: 60, buttons: 25 }, trainTime: 14,
    hp: 60, atk: 1, atkType: 'melee', interval: 2.0, range: 0.7,
    heal: { rate: 3, range: 3.5 },
    armor: { melee: 0, pierce: 0 }, speed: 1.45, vision: 6, aggro: 0,
    impact: 0.5, color: 0xf28cb8,
    debris: { shapes: ['cube'], colors: [0xf2b8cc, 0xd98ca6], count: 4, fluff: true },
    desc: 'Stuffed with love. Patches up nearby toys — keep it behind the line.',
  },
  // ---- faction unique units (Fort Age, trained at the Toy Fort) ----
  bear: {
    name: 'Big Bear Hug', tags: ['plush', 'heavy', 'infantry'], age: 3, proc: 'bear', faction: 'plush',
    cost: { snacks: 150, buttons: 90 }, trainTime: 24,
    hp: 260, atk: 12, atkType: 'melee', interval: 1.9, range: 0.9,
    bonus: { building: 8 },
    armor: { melee: 2, pierce: 3 }, speed: 1.15, vision: 5, aggro: 5,
    impact: 0.5, color: 0x9a6a42,
    debris: { shapes: ['cube', 'limb'], colors: [0xb08050, 0x9a6a42], count: 8, fluff: true },
    desc: 'Plushie unique: a walking wall of hugs. Slow, enormous, refuses to fall over.',
  },
  golem: {
    name: 'Brick Golem', tags: ['infantry', 'heavy'], age: 3, proc: 'golem', faction: 'bricks',
    cost: { blocks: 190, marbles: 60 }, trainTime: 26,
    hp: 190, atk: 9, atkType: 'melee', interval: 1.7, range: 0.85,
    bonus: { building: 14 },
    armor: { melee: 4, pierce: 5 }, speed: 1.0, vision: 5, aggro: 5,
    impact: 0.5, color: 0xf94144,
    debris: { shapes: ['brick', 'brick', 'cube'], colors: [0xf94144, 0xf9c74f, 0x4d9bff], count: 12 },
    desc: 'Snap-Brick unique: armored stack of bricks. Shrugs off arrows, cracks walls.',
  },
  dragster: {
    name: 'Nitro Dragster', tags: ['raider', 'vehicle'], age: 3, proc: 'dragster', faction: 'racers',
    cost: { snacks: 90, buttons: 70 }, trainTime: 16,
    hp: 55, atk: 11, atkType: 'melee', interval: 1.1, range: 0.9,
    bonus: { worker: 5, ranged: 6 },
    armor: { melee: 0, pierce: 0 }, speed: 4.2, vision: 8, aggro: 6,
    impact: 0.4, color: 0xffe14d,
    debris: { shapes: ['disc', 'disc', 'stick'], colors: [0x222222, 0xffe14d], count: 8 },
    desc: 'RC Racer unique: fastest toy in the room. Deletes workers, dies to a stern look.',
  },
  bazooka: {
    name: 'Bazooka Man', tags: ['infantry', 'ranged'], age: 3, proc: 'bazooka', faction: 'classic',
    cost: { snacks: 100, buttons: 110 }, trainTime: 20,
    hp: 70, atk: 16, atkType: 'siege', interval: 2.8, range: 5.5, minRange: 1.5,
    bonus: { building: 18, vehicle: 8 },
    armor: { melee: 0, pierce: 1 }, speed: 1.4, vision: 7, aggro: 6,
    impact: 0.55, color: 0x3f7a3a, handWeapon: 'bazooka',
    projectile: { speed: 11, arc: false, color: 0xff8f5a, size: 0.12, splash: 1.0, trail: 0xff8f5a },
    debris: { shapes: ['limb', 'stick'], colors: [0x3f7a3a, 0x2e5a2a] },
    desc: 'Classic unique: army man with a spring bazooka. Splash damage vs buildings and vehicles.',
  },
  // ---- second faction uniques (unlocked by each faction's own building) ----
  grenadier: {
    name: 'Grenade Lobber', tags: ['infantry', 'ranged'], age: 2, proc: 'grenadier', faction: 'classic',
    cost: { snacks: 70, buttons: 45 }, trainTime: 15,
    hp: 55, atk: 8, atkType: 'pierce', interval: 2.4, range: 4.5, minRange: 1,
    bonus: { building: 4 },
    armor: { melee: 0, pierce: 1 }, speed: 1.45, vision: 6, aggro: 6,
    impact: 0.55, color: 0x4a7a44, handWeapon: 'grenade',
    projectile: { speed: 9, arc: true, color: 0x394d36, size: 0.1, splash: 0.9, trail: 0x88aa66 },
    debris: { shapes: ['limb', 'stick'], colors: [0x4a7a44, 0x2e5a2a] },
    desc: 'Classic unique: army man lobbing toy grenades in an arc. Small splash.',
  },
  lancer: {
    name: 'Pogo Lancer', tags: ['infantry', 'heavy'], age: 2, proc: 'lancer', faction: 'bricks', hop: true,
    cost: { snacks: 60, blocks: 50 }, trainTime: 13,
    hp: 80, atk: 8, atkType: 'melee', interval: 1.1, range: 0.85,
    bonus: { ranged: 6 },
    armor: { melee: 1, pierce: 1 }, speed: 2.6, vision: 6, aggro: 6,
    impact: 0.45, color: 0xf9c74f,
    debris: { shapes: ['brick', 'peg'], colors: [0xf9c74f, 0xf94144], count: 7 },
    desc: 'Snap-Brick unique: a minifig on a pogo spring. Bounces down archers fast.',
  },
  sockpuppet: {
    name: 'Sock Puppet', tags: ['infantry', 'plush'], age: 2, proc: 'sock', faction: 'plush', sway: true,
    cost: { snacks: 30 }, trainTime: 6,
    hp: 45, atk: 4, atkType: 'melee', interval: 0.9, range: 0.7,
    armor: { melee: 0, pierce: 0 }, speed: 1.7, vision: 5, aggro: 6,
    impact: 0.45, color: 0xd88aa8,
    debris: { shapes: ['cube'], colors: [0xd88aa8, 0xf2b8cc], count: 3, fluff: true },
    desc: 'Plushie unique: dirt-cheap floppy swarmer. Bury them in socks.',
  },
  drone: {
    name: 'Whirly Drone', tags: ['vehicle', 'ranged'], age: 2, proc: 'drone', faction: 'racers',
    fly: true, hover: true,
    cost: { snacks: 50, buttons: 60 }, trainTime: 14,
    hp: 40, atk: 3, atkType: 'pierce', interval: 1.2, range: 3,
    bonus: { worker: 2 },
    armor: { melee: 0, pierce: 0 }, speed: 2.9, vision: 9, aggro: 5,
    impact: 0.5, color: 0x59c9c9,
    projectile: { speed: 14, arc: false, color: 0xaef0f0, size: 0.06, trail: 0x59c9c9 },
    debris: { shapes: ['disc', 'stick'], colors: [0x59c9c9, 0x333333], count: 6 },
    desc: 'RC Racer unique: FLIES over walls, cliffs and milk. Fragile, great scout-harasser.',
  },
  king: {
    name: 'The King', tags: ['infantry', 'heavy', 'royal'], age: 1, modelKey: 'hero', targetHeight: 0.66, cape: true, crown: true,
    cost: { snacks: 0 }, trainTime: 1,
    hp: 150, atk: 9, atkType: 'melee', interval: 1.5, range: 0.8,
    armor: { melee: 2, pierce: 2 }, speed: 1.5, vision: 7, aggro: 0,
    impact: 0.45, color: 0xffd94a,
    debris: { shapes: ['limb', 'cube'], colors: [0xffd94a, 0x4d9bff] },
    desc: 'Regicide: protect your King at all costs. If he falls, your toybox is out.',
  },
  cart: {
    name: 'Delivery Cart', tags: ['vehicle', 'trade'], age: 2, targetHeight: 0.5,
    trade: true,
    cost: { snacks: 60, blocks: 40 }, trainTime: 14,
    hp: 55, atk: 0, atkType: 'melee', interval: 2, range: 0.5,
    armor: { melee: 0, pierce: 1 }, speed: 2.3, vision: 5, aggro: 0,
    impact: 0.5, color: 0xf9a03f,
    debris: { shapes: ['disc', 'disc', 'cube'], colors: [0x333333, 0xf9a03f, 0x888888], count: 6 },
    desc: 'Runs trade routes: right-click a Market, it shuttles to your Chest. Longer routes pay more Buttons.',
  },
  hypno: {
    name: 'Hypno-Top', tags: ['support', 'magic'], age: 3, proc: 'hypno',
    cost: { snacks: 120, buttons: 140 }, trainTime: 22,
    hp: 70, atk: 0, atkType: 'melee', interval: 2, range: 0.6,
    convert: { time: 5, range: 4.5, cooldown: 11 },
    armor: { melee: 0, pierce: 1 }, speed: 1.4, vision: 7, aggro: 0,
    impact: 0.5, color: 0xb14fe0,
    debris: { shapes: ['disc', 'peg'], colors: [0xb14fe0, 0xf9c74f], count: 6 },
    desc: 'Spins a dazzling spiral. Target an enemy toy: after 5s it joins your side. Slow cooldown.',
  },
  raider: {
    name: 'RC Raider', tags: ['raider', 'vehicle'], age: 2, rigless: true,
    cost: { snacks: 80, buttons: 40 }, trainTime: 15,
    hp: 70, atk: 7, atkType: 'melee', interval: 1.3, range: 0.9,
    bonus: { worker: 3, ranged: 4 },
    armor: { melee: 0, pierce: 1 }, speed: 3.0, vision: 7, aggro: 6,
    impact: 0.4, color: 0x43aa8b,
    // wheels fly off
    debris: { shapes: ['disc', 'disc', 'cube'], colors: [0x333333, 0x43aa8b, 0x888888], count: 8 },
    desc: 'Fast harassment. Punishes workers and archers, fears spears.',
  },
  hero: {
    name: 'Action Hero', tags: ['infantry', 'heavy'], age: 3,
    targetHeight: 0.64,
    cost: { snacks: 80, buttons: 80 }, trainTime: 16,
    hp: 110, atk: 10, atkType: 'melee', interval: 1.5, range: 0.8,
    armor: { melee: 2, pierce: 1 }, speed: 1.5, vision: 6, aggro: 6,
    impact: 0.45, color: 0x4d9bff,
    debris: { shapes: ['limb', 'cube'], colors: [0x4d9bff, 0xf9c74f] },
    desc: 'Premium heavy melee. Wears the cape. Fears massed ranged.',
  },
  ram: {
    name: 'Pillow Ram', tags: ['siege'], age: 3, proc: 'ram',
    cost: { blocks: 160, buttons: 60 }, trainTime: 20,
    hp: 190, atk: 4, atkType: 'siege', interval: 2.2, range: 0.9,
    bonus: { building: 24 },
    armor: { melee: 0, pierce: 8 }, speed: 0.95, vision: 4, aggro: 4,
    impact: 0.5, color: 0xe8d8f0,
    // pillows burst into fluff
    debris: { shapes: ['cube'], colors: [0xe8e0f4], count: 4, fluff: true },
    desc: 'Soaks arrows and flattens buildings. Escort it — melee eats it.',
  },
  catapult: {
    name: 'Sticker Catapult', tags: ['siege'], age: 3, proc: 'catapult',
    cost: { blocks: 120, buttons: 100 }, trainTime: 22,
    hp: 85, atk: 26, atkType: 'siege', interval: 3.6, range: 6.5, minRange: 2,
    bonus: { building: 14 },
    armor: { melee: 0, pierce: 2 }, speed: 0.85, vision: 6, aggro: 6,
    impact: 0.45, color: 0xc9a86a,
    projectile: { speed: 8, arc: true, color: 0xf3722c, size: 0.16, splash: 1.6, spin: true, trail: 0xf3722c },
    debris: { shapes: ['stick', 'stick', 'disc'], colors: [0xc9a86a, 0xb08050], count: 9 },
    desc: 'Lobs sticker wads. Splash damage punishes clumps and bases.',
  },
  // ---- naval toys (built at a Dock; sail only on water) ----
  tugboat: {
    name: 'Tugboat Gunner', tags: ['ship'], age: 2, proc: 'tugboat', naval: true, targetHeight: 0.5,
    cost: { blocks: 70, buttons: 40 }, trainTime: 18, pop: 2,
    hp: 140, atk: 12, atkType: 'pierce', interval: 1.8, range: 5.5,
    bonus: { ship: 8, building: 6 },
    armor: { melee: 2, pierce: 3 }, speed: 2.0, vision: 8, aggro: 8,
    impact: 0.6, color: 0xc0392b,
    projectile: { speed: 15, arc: true, color: 0xffe08a, size: 0.09, trail: 0xffb703 },
    debris: { shapes: ['cube', 'disc'], colors: [0xc0392b, 0xe8ddc0], count: 7 },
    desc: 'Heavy gunboat: rules the water and shells the shore. Sails only on water.',
  },
  duckboat: {
    name: 'Rubber Duck Raider', tags: ['ship'], age: 2, proc: 'duckboat', naval: true, targetHeight: 0.44,
    cost: { snacks: 40, buttons: 30 }, trainTime: 11, pop: 1,
    hp: 70, atk: 7, atkType: 'pierce', interval: 1.2, range: 4,
    bonus: { ship: 3 },
    armor: { melee: 0, pierce: 1 }, speed: 3.0, vision: 8, aggro: 7,
    impact: 0.5, color: 0xffd23f,
    projectile: { speed: 16, arc: false, color: 0xf4a04a, size: 0.06, trail: 0xffd23f },
    debris: { shapes: ['disc'], colors: [0xffd23f, 0xf4802a], count: 5 },
    desc: 'Fast, cheap skiff — swarm the bath and harass enemy boats. Water only.',
  },
};

// GLB manifest: each clip file is the same mesh with one animation baked in.
export const MODEL_MANIFEST = {
  worker:  { dir: 'assets/units/worker',  clips: ['idle', 'walk', 'attack', 'death'], targetHeight: 0.5 },
  scout:   { dir: 'assets/units/scout',   clips: ['idle', 'walk', 'attack', 'death'], targetHeight: 0.5 },
  soldier: { dir: 'assets/units/soldier', clips: ['idle', 'walk', 'attack', 'death'], targetHeight: 0.5 },
  // spear: the auto-rigged clips contorted the mesh (leg-over-head on move+attack);
  // swapped to a clean static model with code-driven bob + attack lunge instead
  spear:   { dir: 'assets/units/spear',   model: 'model.glb', targetHeight: 0.55 },
  archer:  { dir: 'assets/units/archer',  clips: ['idle', 'walk', 'attack', 'death'], targetHeight: 0.5 },
  hero:    { dir: 'assets/units/hero',    clips: ['idle', 'walk', 'attack', 'death'], targetHeight: 0.64 },
  medic:   { dir: 'assets/units/medic',   clips: ['idle', 'walk', 'attack', 'death'], targetHeight: 0.52 },
  bear:    { dir: 'assets/units/bear',    clips: ['idle', 'walk', 'attack', 'death'], targetHeight: 0.85 },
  // the brick golem defeated the auto-rigger — static mesh, code-anim stomp
  golem:   { dir: 'assets/units/golem',   model: 'model.glb', targetHeight: 0.7 },
  bazooka: { dir: 'assets/units/bazooka', clips: ['idle', 'walk', 'attack', 'death'], targetHeight: 0.55 },
  grenadier: { dir: 'assets/units/grenadier', clips: ['idle', 'walk', 'attack', 'death'], targetHeight: 0.55 },
  // static uniques with code-driven idle flavor (hop/sway/hover)
  lancer:  { dir: 'assets/units/lancer',  model: 'model.glb', targetHeight: 0.62 },
  sockpuppet: { dir: 'assets/units/sockpuppet', model: 'model.glb', targetHeight: 0.5 },
  drone:   { dir: 'assets/units/drone',   model: 'model.glb', targetHeight: 0.35 },
  // static vehicle, no rig — animated by code (wheel spin + bounce)
  raider:  { dir: 'assets/units/raider',  model: 'model.glb', targetHeight: 0.5 },
  // static siege — code-animated (bounce + lunge); proc fallback if missing
  ram:     { dir: 'assets/units/ram',     model: 'model.glb', targetHeight: 0.6 },
  flinger: { dir: 'assets/units/flinger', model: 'model.glb', targetHeight: 0.45 },
  catapult:{ dir: 'assets/units/catapult',model: 'model.glb', targetHeight: 0.65 },
  dragster:{ dir: 'assets/units/dragster',model: 'model.glb', targetHeight: 0.42 },
  cart:    { dir: 'assets/units/cart',    model: 'model.glb', targetHeight: 0.5 },
  // static naval hulls, no rig — code-animated (bob on the water); proc fallback
  tugboat: { dir: 'assets/units/tugboat', model: 'model.glb', targetHeight: 0.55 },
  duckboat:{ dir: 'assets/units/duckboat',model: 'model.glb', targetHeight: 0.6 },
};

// ---------------- buildings ----------------
// shared debris palettes (what a building sheds when smashed)
const BRICK_DEBRIS = { shapes: ['brick', 'brick', 'cube'], colors: [0xf94144, 0xf9c74f, 0x4d9bff, 0x90be6d, 0x8a5a33] };
const RED_BRICK_DEBRIS = { shapes: ['brick'], colors: [0xd95b5b, 0xc95555, 0xd96a5b] };
const WOOD_DEBRIS = { shapes: ['stick', 'brick', 'cube'], colors: [0xc9a86a, 0xb08050, 0x8a5a33] };

export const BUILDINGS = {
  chest: {
    name: 'Toy Chest', tags: ['building'], size: 4, hp: 1200, cost: { blocks: 275 }, buildTime: 50,
    armor: { melee: 1, pierce: 6 }, pop: 10, dropoff: true, vision: 8, age: 2,
    trains: ['worker', 'scout'], techs: ['pockets', 'sorting', 'scissors', 'shoes'],
    ageUp: true, height: 1.6, garrison: 10, bell: true,
    // the chest only shoots while toys hide inside (AoE town-center style)
    garrisonAttack: { atk: 5, atkType: 'pierce', interval: 1.9, range: 7,
      projectile: { speed: 13, arc: true, color: 0xffe28a, size: 0.09, trail: 0xffe28a } },
    debris: WOOD_DEBRIS,
    desc: 'Main base: workers, drop-off, ages. Garrison up to 10 toys — it shoots while they hide!',
  },
  house: {
    name: 'Block House', tags: ['building'], size: 2, hp: 200, cost: { blocks: 30 }, buildTime: 12,
    armor: { melee: 1, pierce: 6 }, pop: 5, vision: 3, height: 1.1,
    debris: BRICK_DEBRIS,
    desc: '+5 toy box capacity.',
  },
  basket: {
    name: 'Storage Basket', tags: ['building'], size: 2, hp: 250, cost: { blocks: 50 }, buildTime: 10,
    armor: { melee: 1, pierce: 5 }, dropoff: true, vision: 3, height: 0.9,
    debris: WOOD_DEBRIS,
    desc: 'Forward drop-off: workers bank resources here instead of hauling home.',
  },
  dock: {
    name: 'Dock', tags: ['building'], size: 3, hp: 500, cost: { blocks: 120, snacks: 30 }, buildTime: 20,
    armor: { melee: 1, pierce: 6 }, vision: 5, age: 2, height: 0.65, dock: true,
    trains: ['tugboat', 'duckboat'],
    debris: WOOD_DEBRIS,
    desc: 'Shipyard — build it at the water\'s edge to launch boats onto the basin.',
  },
  tinker: {
    name: 'Tinker Bench', tags: ['building'], size: 2, hp: 520, cost: { blocks: 110, snacks: 40 }, buildTime: 20,
    armor: { melee: 1, pierce: 6 }, vision: 4, age: 2, height: 0.9,
    techs: ['whetstone', 'quilting', 'reinforced', 'sugarrush', 'overwound', 'pentower', 'steelwork'],
    debris: WOOD_DEBRIS,
    desc: 'Upgrade shop: research blanket boosts for toys AND buildings — sharper weapons, pen towers, steel walls.',
  },
  // ---- faction buildings (each tribe's own workshop, Playmat Age) ----
  tent: {
    name: 'Command Tent', tags: ['building'], size: 3, hp: 550, cost: { blocks: 140 }, buildTime: 20,
    armor: { melee: 1, pierce: 6 }, vision: 4, age: 2, height: 1.2, faction: 'classic',
    trains: ['soldier', 'spear', 'grenadier', 'bazooka'], techs: ['liveammo'],
    debris: { shapes: ['stick', 'cube'], colors: [0x4a7a44, 0x8a915a] },
    desc: 'Classic unique: field HQ. Trains army men of every stripe, including Grenade Lobbers.',
  },
  brickshop: {
    name: 'Brick Foundry', tags: ['building'], size: 3, hp: 700, cost: { blocks: 160 }, buildTime: 22,
    armor: { melee: 2, pierce: 6 }, vision: 4, age: 2, height: 1.3, faction: 'bricks',
    trains: ['golem', 'lancer'], techs: ['plating', 'interlock'],
    debris: BRICK_DEBRIS,
    desc: 'Snap-Brick unique: molds Brick Golems and Pogo Lancers, researches Plating.',
  },
  nest: {
    name: 'Pillow Nest', tags: ['building'], size: 3, hp: 600, cost: { blocks: 130, snacks: 50 }, buildTime: 20,
    armor: { melee: 1, pierce: 6 }, vision: 4, age: 2, height: 1.0, faction: 'plush',
    trains: ['medic', 'sockpuppet', 'bear'], techs: ['training', 'grouphug'],
    debris: { shapes: ['cube'], colors: [0xe8e0f4, 0xd88aa8], fluff: true },
    desc: 'Plushie unique: a cozy nest that stitches Sock Puppets, Medics and Bears.',
  },
  pitstop: {
    name: 'Pit Stop', tags: ['building'], size: 3, hp: 550, cost: { blocks: 150, buttons: 40 }, buildTime: 20,
    armor: { melee: 1, pierce: 6 }, vision: 4, age: 2, height: 1.0, faction: 'racers',
    trains: ['raider', 'dragster', 'drone', 'cart'], techs: ['springs', 'nitro'],
    debris: { shapes: ['disc', 'stick'], colors: [0x666f7a, 0xe5484d] },
    desc: 'RC Racer unique: fuels every wheeled and winged toy in the garage.',
  },
  wall: {
    name: 'Block Wall', tags: ['building', 'wall'], size: 1, hp: 250, cost: { blocks: 5 }, buildTime: 4,
    armor: { melee: 2, pierce: 8 }, vision: 1, height: 0.85, wall: true,
    debris: RED_BRICK_DEBRIS,
    desc: 'Cheap brick wall. Click and drag to place a line. Siege breaks it.',
  },
  gate: {
    name: 'Block Gate', tags: ['building', 'wall'], size: 1, hp: 400, cost: { blocks: 30 }, buildTime: 8,
    armor: { melee: 2, pierce: 8 }, vision: 2, height: 1.0, gate: true,
    debris: RED_BRICK_DEBRIS,
    desc: 'A single-tile doorway that sits flush in your wall — opens for your toys, shut to the rival\'s.',
  },
  farm: {
    name: 'Snack Mat', tags: ['building'], size: 2, hp: 140, cost: { blocks: 45 }, buildTime: 9,
    armor: { melee: 0, pierce: 4 }, vision: 2, height: 0.3, farm: true, farmRate: 0.8,
    debris: { shapes: ['stick', 'cube'], colors: [0xf0e8d8, 0xe07070, 0xb5813f] },
    desc: 'Renewable Snacks. One worker per mat, slow but never runs out.',
  },
  mat: {
    name: 'Training Mat', tags: ['building'], size: 3, hp: 650, cost: { blocks: 150 }, buildTime: 22,
    armor: { melee: 1, pierce: 6 }, vision: 4, trains: ['soldier', 'spear', 'medic'],
    techs: ['pencils', 'tape', 'elite_soldier', 'elite_spear'], height: 0.9,
    debris: WOOD_DEBRIS,
    desc: 'Trains Block Soldiers, Push-Pin Spears and Plush Medics.',
  },
  bench: {
    name: 'Ranged Bench', tags: ['building'], size: 3, hp: 700, cost: { blocks: 175 }, buildTime: 22,
    armor: { melee: 1, pierce: 6 }, vision: 4, trains: ['archer', 'flinger'],
    techs: ['bands', 'elite_archer'], age: 2, height: 1.0,
    debris: WOOD_DEBRIS,
    desc: 'Trains Button Archers and Rubber-Band Flingers.',
  },
  garage: {
    name: 'RC Garage', tags: ['building'], size: 3, hp: 600, cost: { blocks: 175, buttons: 50 }, buildTime: 22,
    armor: { melee: 1, pierce: 6 }, vision: 4, trains: ['raider'], techs: ['springs'], age: 2, height: 1.2,
    debris: { shapes: ['disc', 'brick', 'cube'], colors: [0x666f7a, 0x333333, 0x43aa8b] },
    desc: 'Trains RC Raiders. Requires Playmat Age.',
  },
  market: {
    name: 'Market Stall', tags: ['building'], size: 3, hp: 600, cost: { blocks: 140 }, buildTime: 20,
    armor: { melee: 1, pierce: 6 }, vision: 4, market: true, age: 2, height: 1.4,
    trains: ['cart'],
    debris: WOOD_DEBRIS,
    desc: 'Buy and sell resources for Buttons. Trains Delivery Carts for trade routes.',
  },
  tower: {
    name: 'Watch Tower', tags: ['building'], size: 2, hp: 600, cost: { blocks: 75, marbles: 75 }, buildTime: 18,
    armor: { melee: 2, pierce: 6 }, vision: 10, age: 2, height: 2.4, garrison: 4,
    attack: { atk: 6, atkType: 'pierce', interval: 1.9, range: 7,
              projectile: { speed: 13, arc: true, color: 0xffe28a, size: 0.09, trail: 0xffe28a } },
    debris: { shapes: ['peg', 'stick', 'cube'], colors: [0xf9c74f, 0xd9a066, 0xe98aa2] },
    desc: 'Pencil tower. Shoots nearby enemies. Costs Marbles.',
  },
  workshop: {
    name: 'Siege Workshop', tags: ['building'], size: 3, hp: 750, cost: { blocks: 175, buttons: 75 }, buildTime: 26,
    armor: { melee: 1, pierce: 7 }, vision: 4, trains: ['ram', 'catapult'], age: 3, height: 1.1,
    debris: WOOD_DEBRIS,
    desc: 'Builds Pillow Rams and Sticker Catapults. Fort Age.',
  },
  fort: {
    name: 'Toy Fort', tags: ['building'], size: 4, hp: 2400, cost: { blocks: 200, marbles: 180 }, buildTime: 45,
    armor: { melee: 3, pierce: 8 }, vision: 11, age: 3, height: 2.2, garrison: 8,
    trains: ['hero', 'hypno', 'bear', 'golem', 'dragster', 'bazooka', 'grenadier', 'lancer', 'sockpuppet', 'drone'],
    techs: ['plating', 'training'],
    attack: { atk: 10, atkType: 'pierce', interval: 1.6, range: 8,
              projectile: { speed: 14, arc: true, color: 0xffe28a, size: 0.11, trail: 0xffe28a } },
    debris: { shapes: ['cube', 'brick'], colors: [0xe8e0f0, 0xd8c8b8, 0xf0e8e0], fluff: true },
    desc: 'Blanket fortress. Anchors territory, trains Action Heroes.',
  },
  wonder: {
    name: 'Imagination Wonder', tags: ['building'], size: 4, hp: 3000,
    cost: { blocks: 600, snacks: 500, buttons: 350, marbles: 250 }, buildTime: 80,
    armor: { melee: 3, pierce: 8 }, vision: 6, age: 3, height: 3.0, wonder: true,
    debris: { shapes: ['cube', 'brick'], colors: [0xf0e4f4, 0xe8ddf2, 0xffd94a], fluff: true },
    desc: 'Blanket castle. Defend it for 4 minutes to win the bedroom outright.',
  },
};

// wonder victory: hold a completed wonder this long to win
export const WONDER = { countdown: 240 };

// ---------------- map themes (brief §10) ----------------
export const MAPS = {
  // features: milk = impassable spill lakes, ranges = fallen-book ridges,
  // forests = dense chop-through Blocks thickets (the AoE treeline)
  playmat: {
    label: 'Bedroom Playmat', icon: '🧸', ground: 'playmat', light: 'normal',
    obstacles: 5, canyon: false, resourceMul: 1, stickers: 2, plateaus: 3,
    features: { milk: 1, ranges: 2, forests: 2 },
    desc: 'Open center, safe corners — the classic.',
  },
  canyon: {
    label: 'Toy Chest Canyon', icon: '🏔️', ground: 'playmat', light: 'normal',
    obstacles: 3, canyon: true, resourceMul: 1, stickers: 2, plateaus: 2,
    features: { milk: 1, ranges: 1, forests: 1 },
    desc: 'A pillow barricade splits the room — fight for the gaps.',
  },
  underbed: {
    label: 'Under the Bed', icon: '🌑', ground: 'underbed', light: 'dark',
    obstacles: 11, canyon: false, resourceMul: 0.95, stickers: 3, plateaus: 2,
    features: { ranges: 2, forests: 2 },
    desc: 'Dark, cluttered, dangerous. Bring a scout.',
  },
  attic: {
    label: 'Attic War Table', icon: '📦', ground: 'attic', light: 'warm',
    obstacles: 4, canyon: false, resourceMul: 1.4, stickers: 2, plateaus: 3,
    features: { milk: 1, ranges: 2, forests: 1 },
    desc: 'Wide open and rich — boom or be boomed.',
  },
  playground: {
    label: 'Backyard Playground', icon: '🛝', ground: 'playground', light: 'warm',
    obstacles: 2, canyon: false, resourceMul: 1.25, stickers: 3, plateaus: 2,
    features: { milk: 1, ranges: 1, forests: 3 },
    // swing sets, slides and seesaws stud the field; a splash-pad puddle and
    // hedge thickets carve the lanes. Rich sandbox center — grab and hold it.
    decor: ['swingset', 'slide', 'seesaw', 'sandbucket', 'ball'],
    decorCount: 18,
    desc: 'Sunny backyard: sandbox center, swings and slides everywhere.',
  },
  kitchen: {
    label: 'Kitchen Table', icon: '🍽️', ground: 'kitchen', light: 'warm',
    obstacles: 4, canyon: false, resourceMul: 1.35, stickers: 2, plateaus: 2,
    // dinner-table spills read as impassable milk lakes — lots of them
    features: { milk: 3, ranges: 1, forests: 1 },
    decor: ['teacup', 'die', 'ball', 'crayon'],
    decorCount: 15,
    desc: 'A crumb-strewn dinner table — rich, but mind the milk spills.',
  },
  bookshelf: {
    label: 'Bookshelf Heights', icon: '📚', ground: 'bookshelf', light: 'warm',
    // elevation-forward: extra plateaus + ramps make a tiered high-ground fight,
    // but kept navigable (too many blockers wall armies out and stalemate).
    obstacles: 4, canyon: false, resourceMul: 1, stickers: 3, plateaus: 3,
    features: { ranges: 1, forests: 1 },
    desc: 'Stacked shelves and ramps — seize and hold the high ground.',
  },
  livingroom: {
    label: 'Living Room', icon: '🎄', ground: 'livingroom', light: 'warm',
    obstacles: 3, canyon: false, resourceMul: 1.3, stickers: 3, plateaus: 2,
    features: { forests: 1 },
    decor: ['ornament', 'gift', 'die', 'ball'],
    decorCount: 16,
    desc: 'Holiday carpet: presents to grab, a tree skirt to hold.',
  },
  bathtub: {
    label: 'Bathtub Armada', icon: '🛁', ground: 'bathtub', light: 'normal',
    obstacles: 3, canyon: false, resourceMul: 1.3, stickers: 2, plateaus: 1,
    features: { forests: 1 },
    // a central basin of sailable water: build a Dock, launch boats, and rule
    // the bath while land toys ring the tub. water: ellipse half-axes in tiles.
    // (kept moderate so land armies can still ring the tub and close games out)
    water: { rx: 14, rz: 11 },
    decor: ['duckling', 'ball', 'die'],
    decorCount: 12,
    desc: 'Bath-time battle: a lake in the middle — build Docks and go naval!',
  },
};

// ---------------- random map generator ----------------
// Produces a MAPS-shaped config object deterministically from a seed + settings,
// which the existing seeded terrain pipeline (game.setup) turns into real terrain.
// Same seed + settings => identical map (shareable / lockstep-safe).
// settings: { size:'small'|'medium'|'large', resources:'sparse'|'standard'|'rich', water:'none'|'some'|'lots' }
export const RANDOM_THEMES = [
  { ground: 'playmat',    light: 'normal', name: 'Playmat',     decor: ['crayon', 'die', 'ball'] },
  { ground: 'underbed',   light: 'dark',   name: 'Under-Bed',   decor: ['die', 'ball', 'crayon'] },
  { ground: 'attic',      light: 'warm',   name: 'Attic',       decor: ['die', 'ball', 'crayon'] },
  { ground: 'playground', light: 'warm',   name: 'Playground',  decor: ['swingset', 'slide', 'seesaw', 'sandbucket', 'ball'] },
  { ground: 'kitchen',    light: 'warm',   name: 'Kitchen',     decor: ['teacup', 'die', 'ball', 'crayon'] },
  { ground: 'bookshelf',  light: 'warm',   name: 'Bookshelf',   decor: ['die', 'ball', 'crayon'] },
  { ground: 'livingroom', light: 'warm',   name: 'Living Room', decor: ['ornament', 'gift', 'die', 'ball'] },
  { ground: 'bathtub',    light: 'normal', name: 'Bathtub',     decor: ['duckling', 'ball', 'die'] },
];

export function generateRandomMap(seed, opts = {}) {
  // self-contained LCG (must match game.js makeRng so results feel consistent)
  let s = (seed | 0) % 2147483647; if (s <= 0) s += 2147483646;
  const rng = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const ri = (lo, hi) => lo + ((rng() * (hi - lo + 1)) | 0); // inclusive int
  const pick = (arr) => arr[(rng() * arr.length) | 0];

  const size = opts.size || 'medium';
  const resKey = opts.resources || 'standard';
  const waterKey = opts.water || 'some';

  // size tunes elevation, openness and spread (grid itself is fixed)
  const SZ = {
    small:  { plateaus: [1, 2], obstacles: [5, 7], feat: 1.15, decor: 0.8 },
    medium: { plateaus: [2, 3], obstacles: [4, 6], feat: 1.0,  decor: 1.0 },
    large:  { plateaus: [3, 4], obstacles: [3, 5], feat: 0.85, decor: 1.2 },
  }[size] || { plateaus: [2, 3], obstacles: [4, 6], feat: 1.0, decor: 1.0 };
  const RES = { sparse: 0.8, standard: 1.05, rich: 1.4 }[resKey] ?? 1.05;

  // water: bounded so land armies can still ring the basin and close games out
  let water = null;
  if (waterKey === 'some' && rng() < 0.6) water = { rx: ri(10, 12), rz: ri(8, 10) };
  else if (waterKey === 'lots') water = { rx: ri(13, 15), rz: ri(10, 12) };
  const wet = !!water;

  // a watery board biases the theme toward the tub; otherwise anything goes
  const theme = wet && rng() < 0.5 ? RANDOM_THEMES[7] : pick(RANDOM_THEMES);

  // a rare pillow barricade splits the room (skip when there's a lake to cross)
  const canyon = !wet && rng() < 0.16;

  const fscale = SZ.feat;
  const fc = (base) => Math.max(0, Math.round(base * fscale));
  const features = {
    // wet/canyon boards are already carved up — keep land clutter light to
    // avoid fragmenting the map into a pathing stalemate
    forests: fc(1 + (rng() < 0.6 ? 1 : 0) + (rng() < 0.3 ? 1 : 0)), // 1–3
    ranges: canyon ? 0 : fc(rng() < 0.5 ? 1 : (rng() < 0.4 ? 2 : 0)), // 0–2
    milk: (wet || canyon) ? 0 : fc(rng() < 0.45 ? 1 : (rng() < 0.3 ? 2 : 0)), // 0–2
  };

  let obstacles = ri(SZ.obstacles[0], SZ.obstacles[1]);
  if (canyon) obstacles = Math.max(2, obstacles - 2); // the barricade is enough

  const cfg = {
    random: true,
    label: 'Random Map', icon: '🎲',
    ground: theme.ground, light: theme.light,
    obstacles, canyon,
    resourceMul: +(RES * (0.92 + rng() * 0.16)).toFixed(2),
    stickers: 2 + (rng() < 0.4 ? 1 : 0),
    plateaus: ri(SZ.plateaus[0], SZ.plateaus[1]),
    features,
    decor: theme.decor,
    decorCount: Math.round((12 + ri(0, 8)) * SZ.decor),
    seed: seed | 0,
    desc: `Seed ${seed | 0} · ${size} · ${theme.name}${wet ? ' · watery' : ''} — a fresh field every roll.`,
  };
  if (water) cfg.water = water;
  return cfg;
}

// which building types count as "production" for the conquest win condition
export const PRODUCTION_BUILDINGS = ['chest', 'mat', 'bench', 'garage', 'workshop', 'fort'];

// ---------------- techs (researched at buildings, apply stat modifiers) ----------------
export const TECHS = {
  pockets:  { name: 'Bigger Pockets',    age: 1, cost: { snacks: 75, blocks: 50 },    time: 25, desc: 'Workers carry +4 resources.' },
  sorting:  { name: 'Snack Sorting',     age: 1, cost: { snacks: 50, blocks: 25 },    time: 20, desc: 'Snacks gather +20% (mats too).' },
  scissors: { name: 'Sharper Scissors',  age: 2, cost: { snacks: 100, blocks: 75 },   time: 30, desc: 'All gathering +15%.' },
  shoes:    { name: 'Toy Shoes',         age: 2, cost: { snacks: 100, buttons: 50 },  time: 25, desc: 'Workers and infantry +10% speed.' },
  pencils:  { name: 'Pointy Pencils',    age: 2, cost: { blocks: 100, buttons: 100 }, time: 30, desc: 'Melee infantry +1 attack.' },
  bands:    { name: 'Better Rubber Bands', age: 2, cost: { blocks: 100, buttons: 125 }, time: 30, desc: 'Ranged toys +1 attack.' },
  springs:  { name: 'Turbo Springs',     age: 3, cost: { snacks: 150, buttons: 150 }, time: 30, desc: 'Wheeled toys +12% speed.' },
  tape:     { name: 'Tape Reinforcement', age: 3, cost: { blocks: 150, marbles: 125 }, time: 35, desc: 'Infantry armor +1/+1.' },
  plating:  { name: 'Cardboard Plating', age: 3, cost: { blocks: 200, marbles: 150 }, time: 40, desc: 'Buildings +20% HP.' },
  training: { name: 'Elite Toy Training', age: 3, cost: { snacks: 300, buttons: 300 }, time: 45, desc: 'Military toys +15% HP.' },
  // unit-line upgrades: instantly promote every living toy of the line too
  elite_soldier: { name: 'Elite Soldiers', age: 3, cost: { snacks: 175, buttons: 125 }, time: 35, desc: 'Block Soldiers +25% HP, +2 attack, +1/+1 armor — upgrades the living too.' },
  elite_spear:   { name: 'Elite Spears',   age: 3, cost: { snacks: 175, buttons: 125 }, time: 35, desc: 'Push-Pin Spears +25% HP, +2 attack, +1/+1 armor — upgrades the living too.' },
  elite_archer:  { name: 'Elite Archers',  age: 3, cost: { snacks: 175, buttons: 150 }, time: 35, desc: 'Button Archers +25% HP, +2 attack, +1/+1 armor — upgrades the living too.' },
  // ---- Tinker Bench unit upgrades (blanket boosts to your whole army) ----
  whetstone:  { name: 'Whetstone',        age: 2, cost: { snacks: 120, blocks: 60 },   time: 30, desc: 'All military toys +1 attack (melee, ranged and wheeled).' },
  quilting:   { name: 'Quilted Padding',  age: 2, cost: { blocks: 100, buttons: 60 },  time: 30, desc: 'Ranged and wheeled toys +1/+1 armor (tape already covers infantry).' },
  reinforced: { name: 'Reinforced Cores', age: 3, cost: { snacks: 200, marbles: 100 }, time: 40, desc: 'All military toys +15% HP — upgrades the living, stacks with Training.' },
  sugarrush:  { name: 'Sugar Rush',       age: 3, cost: { snacks: 150, buttons: 150 }, time: 35, desc: 'Every toy scoots 8% faster — infantry and wheels alike.' },
  overwound:  { name: 'Overwound Springs',age: 3, cost: { buttons: 200, marbles: 120 }, time: 40, desc: 'Military toys attack 12% faster.' },
  // ---- Tinker Bench BUILDING upgrades (level up your structures) ----
  pentower:   { name: 'Pen Towers',       age: 3, cost: { blocks: 150, buttons: 120 }, time: 40, building: true, desc: 'Pencil Towers become Pen Towers: +8 attack, +1.5 range, +80% HP.' },
  steelwork:  { name: 'Steelworks',       age: 3, cost: { blocks: 200, marbles: 120 }, time: 45, building: true, desc: 'Block Walls and Gates go steel: +2 armor and much tougher (+150% HP).' },
  // ---- civilization signature techs (each locked to one faction's own building) ----
  liveammo:   { name: 'Live Ammo',        age: 3, faction: 'classic', cost: { snacks: 180, buttons: 160 }, time: 40, desc: 'Army Men load the good stuff: all military +2 melee AND +2 ranged attack.' },
  interlock:  { name: 'Interlocking Studs', age: 3, faction: 'bricks', cost: { blocks: 220, marbles: 120 }, time: 45, building: true, desc: 'Double-studded construction: every building +30% HP (stacks with Plating).' },
  grouphug:   { name: 'Group Hug',        age: 3, faction: 'plush',   cost: { snacks: 220, buttons: 150 }, time: 40, desc: 'Plushies squeeze tighter: Medics heal 60% more and every toy +10% HP.' },
  nitro:      { name: 'Nitro Injection',  age: 3, faction: 'racers',  cost: { snacks: 170, buttons: 180 }, time: 38, desc: 'Redline everything: wheeled toys +20% speed and +2 attack.' },
};

export const START = {
  resources: { snacks: 200, blocks: 180, buttons: 50, marbles: 0 },
  workers: 4,
  scouts: 1,
};

// match-setup starting-resource presets (multiplies the base bank)
export const START_RES = {
  standard: { label: 'Standard', icon: '🎒', mult: 1 },
  high:     { label: 'High',     icon: '💰', mult: 3 },
  marathon: { label: 'Marathon', icon: '🏰', mult: 8 },
};

// game modes: how a match is won
export const GAME_MODES = {
  standard: { label: 'Conquest', icon: '⚔️', desc: 'Destroy every enemy base to win.' },
  regicide: { label: 'Regicide', icon: '👑', desc: 'Each toybox gets a King. Guard yours; defeat all enemy Kings.' },
  koth:     { label: 'King of the Hill', icon: '🏔️', desc: 'Hold the golden Throne at the center for 2 minutes.' },
  sudden:   { label: 'Sudden Death', icon: '💥', desc: 'Lose your Toy Chest and you\'re out. No rebuilding.' },
};

// ---------------- campaign: "The Bedroom Wars" ----------------
// A 5-mission story arc. Each mission is just a curated match config fed to the
// normal engine (map, faction, mode, difficulty, resources) plus story text and
// optional light modifiers (player bonus units / enemy resource boost). No new
// engine mechanics — missions escalate via map, mode, difficulty and matchups.
export const CAMPAIGN = [
  {
    id: 'naptime', name: 'Naptime Uprising', icon: '😴',
    map: 'playmat', faction: 'classic', enemy: 'plush',
    gameMode: 'standard', difficulty: 'easy', startRes: 'standard',
    brief: "It's naptime — but the toys are wide awake. A rogue Plushie Horde has claimed the far corner of the playmat. Rally your Army Men and tuck them back in the toy box.",
    objective: 'Destroy every enemy production building.',
    victory: 'The playmat is yours. But across the room, more toys are stirring…',
    defeat: 'The Army Men are back in the box. Regroup and try again.',
    bonus: { soldier: 2 }, // a small friendly head start to ease newcomers in
  },
  {
    id: 'sandbox', name: 'Sandbox Skirmish', icon: '🛝',
    map: 'playground', faction: 'racers', enemy: 'bricks',
    gameMode: 'standard', difficulty: 'normal', startRes: 'high',
    brief: 'Out in the backyard, the Snap-Bricks are fortifying the sandbox. You have the fastest wheels in the yard — out-boom them and overrun the swings before they dig in.',
    objective: 'Destroy every enemy production building.',
    victory: 'The sandbox is a racetrack now. On to the bathroom…',
    defeat: 'The Bricks walled you out. Come back faster.',
  },
  {
    id: 'bathtub', name: 'Bathtub Blockade', icon: '🛁',
    map: 'bathtub', faction: 'classic', enemy: 'racers',
    gameMode: 'standard', difficulty: 'normal', startRes: 'standard',
    brief: 'A whole lake in the middle of the battlefield! Build a Dock, launch your boats, and rule the bath. The RC Racers are already paddling rubber ducks — sink them.',
    objective: 'Build a navy and destroy every enemy production building.',
    victory: 'The armada is scrap. The bedroom\'s toughest toys await…',
    defeat: 'Sunk. Bail out and try again.',
  },
  {
    id: 'hill', name: 'Hold the Hill', icon: '🏔️',
    map: 'playground', faction: 'bricks', enemy: 'plush',
    gameMode: 'koth', difficulty: 'hard', startRes: 'standard',
    brief: 'One golden Throne sits at the heart of the yard, and the Plushie Horde wants it. You are the Snap-Bricks — throw up a wall, seize the hill, and do not let go.',
    objective: 'Hold the golden Throne at the center for 2 minutes.',
    victory: 'The hill is held. Only the final bedtime remains…',
    defeat: 'The Throne slipped away. Hold firmer.',
  },
  {
    id: 'finale', name: 'The Final Bedtime', icon: '👑',
    map: 'attic', faction: 'plush', enemy: 'classic',
    gameMode: 'regicide', difficulty: 'hard', startRes: 'marathon',
    brief: 'Lights out. The whole toy box marches on the attic war table for one last battle. Each side crowns a King. Guard yours to the last stitch — and topple theirs.',
    objective: 'Protect your King. Defeat the enemy King.',
    victory: 'The bedroom is united under one toy box at last. Sweet dreams, commander.',
    defeat: 'Your King has fallen. But the war is not over…',
    enemyBoost: 1.5, // the finale enemy starts richer for a proper boss fight
  },
];

// ---------------- AI difficulty profiles ----------------
export const DIFFICULTIES = {
  easy:   { label: 'Sleepy',   workerTarget: 9,  firstWave: 6,  waveGrowth: 3, handicap: 0.75, usesTechs: false, usesSiege: false },
  normal: { label: 'Playful',  workerTarget: 13, firstWave: 8,  waveGrowth: 4, handicap: 1.0,  usesTechs: true,  usesSiege: true },
  hard:   { label: 'Cranky',   workerTarget: 16, firstWave: 10, waveGrowth: 5, handicap: 1.15, usesTechs: true,  usesSiege: true },
};

// neutral map objectives: hold a Lost Sticker with military toys for a Buttons trickle
export const STICKER = { incomePerSec: 0.4, captureRadius: 2.5 };
// wind-up mice: neutral critters that wander mid-map; walk a toy up to one
// and it follows you home for a snack bounty (the bedroom's huntable sheep)
export const CRITTERS = { count: 6, snack: 60, captureRadius: 1.8 };

// ---------------- factions (brief §6.4, translated to toy tribes) ----------------
// mods merge into the player's stat-modifier table at match start
export const FACTIONS = {
  classic: {
    label: 'Classic Toys', icon: '🎁',
    desc: 'The all-rounders. No bonuses, no weaknesses.',
    mods: {},
  },
  bricks: {
    label: 'Snap-Bricks', icon: '🧱',
    desc: 'Buildings +20% HP, workers build 25% faster — but infantry march 6% slower.',
    mods: { buildingHp: 1.2, buildRate: 1.25, speedInfantry: 0.94 },
  },
  plush: {
    label: 'Plushie Horde', icon: '🧸',
    desc: 'All toys +12% HP, medics heal 50% more — but everyone waddles 6% slower.',
    mods: { unitHp: 1.12, healRate: 1.5, speedInfantry: 0.94, speedWheels: 0.94 },
  },
  racers: {
    label: 'RC Racers', icon: '🏎️',
    desc: 'Wheeled toys +15% speed and +1 attack — but workers gather 8% slower.',
    mods: { speedWheels: 1.15, atkVehicle: 1, gather: 0.92 },
  },
};

// per-match AI personality: same difficulty, different plan (adds replay variety)
export const PERSONAS = {
  rusher: {
    workerTarget: -3, firstWave: -3, raidInterval: 55,
    taunt: 'Scouts report the rival toys sharpening push-pins — expect an early strike!',
  },
  balanced: {
    workerTarget: 0, firstWave: 0, raidInterval: 0,
    taunt: 'The rival toys stir in the dark, watching for weakness.',
  },
  boomer: {
    workerTarget: 5, firstWave: 6, raidInterval: 150,
    taunt: 'The rival toys are hoarding snacks — they plan to out-grow you.',
  },
};

export const AI = {
  tick: 1.0,
  raidInterval: 95,
  raidSize: 3,
  gatherRatio: {
    1: { snacks: 0.55, blocks: 0.40, buttons: 0.05, marbles: 0.00 },
    2: { snacks: 0.45, blocks: 0.28, buttons: 0.20, marbles: 0.07 },
    3: { snacks: 0.40, blocks: 0.25, buttons: 0.22, marbles: 0.13 },
  },
  defendRadius: 14,
  scoutRepathTime: 18,
};
