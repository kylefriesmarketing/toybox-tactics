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
    carry: 10, gatherRate: 1.35, impact: 0.45, color: 0xf9c74f, gait: 'walk',
    debris: { shapes: ['limb', 'peg', 'cube'], colors: [0xf9c74f, 0xe8b53e] },
    desc: 'Small hands, whole war. Gathers, builds and repairs — every empire in this room stands on a Worker Buddy.',
  },
  scout: {
    name: 'Wind-Up Scout', tags: ['scout', 'vehicle'], age: 1,
    cost: { snacks: 80 }, trainTime: 13,
    hp: 45, atk: 3, atkType: 'melee', interval: 1.4, range: 0.7,
    armor: { melee: 1, pierce: 0 }, speed: 2.7, vision: 9, aggro: 0,
    impact: 0.45, color: 0x90be6d,
    debris: { shapes: ['peg', 'disc', 'cube'], colors: [0x90be6d, 0x7fa85f, 0xb8b8c0] },
    desc: 'Wound tight and born curious. Sees the whole bedroom before anyone fights over it.',
  },
  soldier: {
    name: 'Block Soldier', tags: ['infantry', 'melee'], age: 1,
    cost: { snacks: 60, blocks: 20 }, trainTime: 12,
    hp: 60, atk: 6, atkType: 'melee', interval: 1.5, range: 0.7,
    armor: { melee: 1, pierce: 0 }, speed: 1.6, vision: 6, aggro: 5,
    impact: 0.45, color: 0x577590, handWeapon: 'rifle',
    // classic army man: bursts into green plastic limbs
    debris: { shapes: ['limb', 'limb', 'peg'], colors: [0x4a7c40, 0x3e6b36, 0x5c8f4c], count: 8 },
    desc: 'Brave, cheap and countless. Holds the line right up until massed archers say otherwise.',
  },
  spear: {
    name: 'Push-Pin Spear', tags: ['infantry', 'spear'], age: 2,
    cost: { snacks: 45, blocks: 30 }, trainTime: 12,
    hp: 55, atk: 4, atkType: 'melee', interval: 1.6, range: 0.9,
    bonus: { raider: 10 },
    armor: { melee: 0, pierce: 0 }, speed: 1.5, vision: 6, aggro: 5,
    impact: 0.5, color: 0xf94144,
    debris: { shapes: ['peg', 'stick'], colors: [0xf94144, 0xd9d9d9] },
    desc: 'A push-pin with a grudge. Skewers RC Raiders the moment they get clever.',
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
    desc: 'Buttons fly true. Shreds slow melee from a polite distance — pray the raiders never arrive.',
  },
  flinger: {
    name: 'Rubber-Band Flinger', tags: ['ranged', 'skirmisher'], age: 2, proc: 'flinger', gait: 'roll',
    cost: { snacks: 35, blocks: 35 }, trainTime: 12,
    hp: 45, atk: 3, atkType: 'pierce', interval: 1.7, range: 4.5, minRange: 1,
    bonus: { ranged: 8 },
    armor: { melee: 0, pierce: 1 }, speed: 1.6, vision: 7, aggro: 6,
    impact: 0.5, color: 0x9b5de5,
    projectile: { speed: 15, arc: false, color: 0xc9b6f0, size: 0.08, band: true, trail: 0x9b5de5 },
    debris: { shapes: ['stick', 'peg'], colors: [0x9b5de5, 0xd9b38c] },
    desc: 'Snaps rubber bands with rude accuracy. Cheap medicine for enemy archers.',
  },
  medic: {
    name: 'Plush Medic', tags: ['support', 'plush'], age: 2, proc: 'medic',
    cost: { snacks: 60, buttons: 25 }, trainTime: 14,
    hp: 60, atk: 1, atkType: 'melee', interval: 2.0, range: 0.7,
    heal: { rate: 3, range: 3.5 },
    armor: { melee: 0, pierce: 0 }, speed: 1.45, vision: 6, aggro: 0,
    impact: 0.5, color: 0xf28cb8,
    debris: { shapes: ['cube'], colors: [0xf2b8cc, 0xd98ca6], count: 4, fluff: true },
    desc: 'Stuffed with love and spare thread. Mends nearby toys — keep it safe behind the line.',
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
    desc: 'Plushie unique: a walking wall of hugs. Slow, enormous, and it simply refuses to fall over.',
  },
  golem: {
    name: 'Brick Golem', tags: ['infantry', 'heavy'], age: 3, proc: 'golem', faction: 'bricks', gait: 'stomp',
    cost: { blocks: 190, marbles: 60 }, trainTime: 26,
    hp: 190, atk: 9, atkType: 'melee', interval: 1.7, range: 0.85,
    bonus: { building: 14 },
    armor: { melee: 4, pierce: 5 }, speed: 1.0, vision: 5, aggro: 5,
    impact: 0.5, color: 0xf94144,
    debris: { shapes: ['brick', 'brick', 'cube'], colors: [0xf94144, 0xf9c74f, 0x4d9bff], count: 12 },
    desc: 'Snap-Brick unique: bricks stacked into a temper. Shrugs off arrows, cracks walls open.',
  },
  dragster: {
    name: 'Nitro Dragster', tags: ['raider', 'vehicle'], age: 3, proc: 'dragster', faction: 'racers', gait: 'roll',
    cost: { snacks: 90, buttons: 70 }, trainTime: 16,
    hp: 55, atk: 11, atkType: 'melee', interval: 1.1, range: 0.9,
    bonus: { worker: 5, ranged: 6 },
    armor: { melee: 0, pierce: 0 }, speed: 4.2, vision: 8, aggro: 6,
    impact: 0.4, color: 0xffe14d,
    debris: { shapes: ['disc', 'disc', 'stick'], colors: [0x222222, 0xffe14d], count: 8 },
    desc: 'RC Racer unique: the fastest thing the room has ever seen. Deletes workers; dies to a stern look.',
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
    desc: 'Classic unique: an army man with a spring bazooka. The splash ruins buildings and vehicles alike.',
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
    desc: 'Classic unique: lobs toy grenades in a lazy, terrible arc. Small splash, big opinions.',
  },
  lancer: {
    name: 'Pogo Lancer', tags: ['infantry', 'heavy'], age: 2, proc: 'lancer', faction: 'bricks', hop: true,
    cost: { snacks: 60, blocks: 50 }, trainTime: 13,
    hp: 80, atk: 8, atkType: 'melee', interval: 1.1, range: 0.85,
    bonus: { ranged: 6 },
    armor: { melee: 1, pierce: 1 }, speed: 2.6, vision: 6, aggro: 6,
    impact: 0.45, color: 0xf9c74f,
    debris: { shapes: ['brick', 'peg'], colors: [0xf9c74f, 0xf94144], count: 7 },
    desc: 'Snap-Brick unique: a minifig on a pogo spring. Boings down archers before they can blink.',
  },
  sockpuppet: {
    name: 'Sock Puppet', tags: ['infantry', 'plush'], age: 2, proc: 'sock', faction: 'plush', sway: true,
    cost: { snacks: 30 }, trainTime: 6,
    hp: 45, atk: 4, atkType: 'melee', interval: 0.9, range: 0.7,
    armor: { melee: 0, pierce: 0 }, speed: 1.7, vision: 5, aggro: 6,
    impact: 0.45, color: 0xd88aa8,
    debris: { shapes: ['cube'], colors: [0xd88aa8, 0xf2b8cc], count: 3, fluff: true },
    desc: 'Plushie unique: dirt-cheap and utterly floppy. Bury your problems in socks.',
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
    desc: 'RC Racer unique: FLIES over walls, cliffs and milk. Fragile as gossip and twice as fast.',
  },
  zapbot: {
    name: 'Zap Bot', tags: ['infantry', 'ranged', 'bot'], age: 2, proc: 'zapbot', faction: 'bots',
    cost: { snacks: 45, buttons: 35 }, trainTime: 12,
    hp: 55, atk: 6, atkType: 'pierce', interval: 1.3, range: 4.2,
    bonus: { infantry: 2 },
    armor: { melee: 0, pierce: 1 }, speed: 1.6, vision: 8, aggro: 6,
    impact: 0.5, color: 0xb9c4d0,
    projectile: { speed: 16, arc: false, color: 0x9ff0ff, size: 0.07, trail: 0x40c0e0 },
    debris: { shapes: ['cube', 'peg'], colors: [0xb9c4d0, 0x40c0e0], count: 6 },
    desc: 'Tin Bots unique: a wind-up spark blaster, factory-calibrated. Outranges most toys, +2 vs infantry.',
  },
  titanbot: {
    name: 'Titan Bot', tags: ['infantry', 'heavy', 'bot'], age: 3, proc: 'titanbot', faction: 'bots', gait: 'stomp',
    cost: { snacks: 120, marbles: 70 }, trainTime: 26,
    hp: 240, atk: 20, atkType: 'melee', interval: 1.5, range: 0.95,
    bonus: { building: 12 },
    armor: { melee: 4, pierce: 5 }, speed: 1.35, vision: 6, aggro: 6,
    impact: 0.5, color: 0x7a828f,
    debris: { shapes: ['cube', 'disc', 'peg'], colors: [0x7a828f, 0xe0552a], count: 9 },
    desc: 'Tin Bots unique: a hulking battle robot. Armored, cracks buildings, files arrows under harmless.',
  },
  // ---- Castle Kingdom uniques (knights & dragons: the sixth tribe) ----
  knight: {
    name: 'Castle Knight', tags: ['infantry', 'heavy'], age: 2, proc: 'lancer', faction: 'knights',
    cost: { snacks: 65, blocks: 45 }, trainTime: 14,
    hp: 95, atk: 9, atkType: 'melee', interval: 1.3, range: 0.85,
    bonus: { ranged: 4 },
    armor: { melee: 2, pierce: 3 }, speed: 1.35, vision: 5, aggro: 6,
    impact: 0.5, color: 0xc8ccd6,
    debris: { shapes: ['limb', 'stick'], colors: [0xc8ccd6, 0xd6453f], count: 6 },
    desc: 'Kingdom unique: silver-painted plastic, sworn to the toy box. Shield up, arrows shrug off, vows hold.',
  },
  crossbow: {
    name: 'Crossbow Guard', tags: ['infantry', 'ranged'], age: 2, proc: 'grenadier', faction: 'knights',
    cost: { snacks: 50, buttons: 45 }, trainTime: 13,
    hp: 55, atk: 7, atkType: 'pierce', interval: 1.6, range: 4.8,
    bonus: { heavy: 3 },
    armor: { melee: 0, pierce: 1 }, speed: 1.45, vision: 7, aggro: 6,
    impact: 0.55, color: 0x4a6a9a,
    projectile: { speed: 16, arc: false, color: 0xd8c8a0, size: 0.08, trail: 0x8a7a5a },
    debris: { shapes: ['limb', 'stick'], colors: [0x4a6a9a, 0xc8ccd6], count: 6 },
    desc: 'Kingdom unique: a wall-top marksman with a wind-up crossbow. Bolts punch through the heaviest toys.',
  },
  charger: {
    name: 'Mounted Charger', tags: ['raider', 'heavy'], age: 2, proc: 'raider', faction: 'knights',
    cost: { snacks: 80, blocks: 40 }, trainTime: 16,
    hp: 110, atk: 10, atkType: 'melee', interval: 1.4, range: 0.9,
    bonus: { ranged: 6, worker: 3 },
    armor: { melee: 2, pierce: 2 }, speed: 2.9, vision: 7, aggro: 6,
    impact: 0.5, color: 0x3a5a8a,
    debris: { shapes: ['limb', 'stick'], colors: [0x3a5a8a, 0xd9a441], count: 8 },
    desc: 'Kingdom unique: knight and horse molded as one, lance first. Runs down archers like a closing storybook.',
  },
  paladin: {
    name: 'Golden Paladin', tags: ['infantry', 'heavy'], age: 3, proc: 'golem', faction: 'knights',
    cost: { snacks: 130, marbles: 80 }, trainTime: 26,
    hp: 230, atk: 16, atkType: 'melee', interval: 1.6, range: 0.9,
    bonus: { heavy: 6 },
    armor: { melee: 4, pierce: 4 }, speed: 1.25, vision: 6, aggro: 6,
    impact: 0.5, color: 0xd9a441,
    debris: { shapes: ['limb', 'cube'], colors: [0xd9a441, 0xd6453f], count: 8 },
    desc: 'Kingdom unique: gold armor, red cape, greatsword taller than a domino. Duels the big toys and wins.',
  },
  trebuchet: {
    name: 'Toy Trebuchet', tags: ['siege'], age: 3, proc: 'catapult', faction: 'knights', gait: 'roll',
    cost: { blocks: 170, marbles: 70 }, trainTime: 30,
    hp: 90, atk: 42, atkType: 'siege', interval: 5.0, range: 8.5, minRange: 2.5,
    bonus: { building: 26 },
    armor: { melee: 0, pierce: 1 }, speed: 0.8, vision: 8, aggro: 4,
    impact: 0.5, color: 0xc0a06a,
    projectile: { speed: 8, arc: true, color: 0x9a8a6a, size: 0.16, splash: 1.4, spin: true, trail: 0xc0b090 },
    debris: { shapes: ['stick', 'stick', 'disc'], colors: [0xc0a06a, 0x8a6a3a], count: 9 },
    desc: 'Kingdom unique: a marble-slinging counterweight engine. Outranges towers and files castles under rubble.',
  },
  king: {
    name: 'The King', tags: ['infantry', 'heavy', 'royal'], age: 1, modelKey: 'hero', targetHeight: 0.66, cape: true, crown: true,
    cost: { snacks: 0 }, trainTime: 1,
    hp: 150, atk: 9, atkType: 'melee', interval: 1.5, range: 0.8,
    armor: { melee: 2, pierce: 2 }, speed: 1.5, vision: 7, aggro: 0,
    impact: 0.45, color: 0xffd94a,
    debris: { shapes: ['limb', 'cube'], colors: [0xffd94a, 0x4d9bff] },
    desc: 'Regicide: the whole toybox kneels to him. If he falls, the lid closes. Protect your King.',
  },
  cart: {
    name: 'Delivery Cart', tags: ['vehicle', 'trade'], age: 2, targetHeight: 0.5, gait: 'roll',
    trade: true,
    cost: { snacks: 60, blocks: 40 }, trainTime: 14,
    hp: 55, atk: 0, atkType: 'melee', interval: 2, range: 0.5,
    armor: { melee: 0, pierce: 1 }, speed: 2.3, vision: 5, aggro: 0,
    impact: 0.5, color: 0xf9a03f,
    debris: { shapes: ['disc', 'disc', 'cube'], colors: [0x333333, 0xf9a03f, 0x888888], count: 6 },
    desc: 'Runs trade routes: right-click a Market and it shuttles home to your Chest. Longer roads, richer Buttons.',
  },
  hypno: {
    name: 'Hypno-Top', tags: ['support', 'magic'], age: 3, proc: 'hypno', spin: true,
    cost: { snacks: 120, buttons: 140 }, trainTime: 22,
    hp: 70, atk: 0, atkType: 'melee', interval: 2, range: 0.6,
    convert: { time: 5, range: 4.5, cooldown: 11 },
    armor: { melee: 0, pierce: 1 }, speed: 1.4, vision: 7, aggro: 0,
    impact: 0.5, color: 0xb14fe0,
    debris: { shapes: ['disc', 'peg'], colors: [0xb14fe0, 0xf9c74f], count: 6 },
    desc: 'Spins a spiral no toy can look away from. Target an enemy: 5 seconds later it fights for you. Slow cooldown.',
  },
  raider: {
    name: 'RC Raider', tags: ['raider', 'vehicle'], age: 2, rigless: true, gait: 'roll',
    cost: { snacks: 80, buttons: 40 }, trainTime: 15,
    hp: 70, atk: 7, atkType: 'melee', interval: 1.3, range: 0.9,
    bonus: { worker: 3, ranged: 4 },
    armor: { melee: 0, pierce: 1 }, speed: 3.0, vision: 7, aggro: 6,
    impact: 0.4, color: 0x43aa8b,
    // wheels fly off
    debris: { shapes: ['disc', 'disc', 'cube'], colors: [0x333333, 0x43aa8b, 0x888888], count: 8 },
    desc: 'Fast, rude, and gone before the shouting starts. Punishes workers and archers; fears spears.',
  },
  hero: {
    name: 'Action Hero', tags: ['infantry', 'heavy'], age: 3,
    targetHeight: 0.64,
    cost: { snacks: 80, buttons: 80 }, trainTime: 16,
    hp: 110, atk: 10, atkType: 'melee', interval: 1.5, range: 0.8,
    armor: { melee: 2, pierce: 1 }, speed: 1.5, vision: 6, aggro: 6,
    impact: 0.45, color: 0x4d9bff,
    debris: { shapes: ['limb', 'cube'], colors: [0x4d9bff, 0xf9c74f] },
    desc: 'Premium heavy with a licensed cape. Carves through melee; fears massed ranged.',
  },
  ram: {
    name: 'Pillow Ram', tags: ['siege'], age: 3, proc: 'ram', gait: 'roll',
    cost: { blocks: 160, buttons: 60 }, trainTime: 20,
    hp: 190, atk: 4, atkType: 'siege', interval: 2.2, range: 0.9,
    bonus: { building: 24 },
    armor: { melee: 0, pierce: 8 }, speed: 0.95, vision: 4, aggro: 4,
    impact: 0.5, color: 0xe8d8f0,
    // pillows burst into fluff
    debris: { shapes: ['cube'], colors: [0xe8e0f4], count: 4, fluff: true },
    desc: 'A pillow that studied siegecraft. Soaks arrows, flattens buildings — escort it, melee eats it.',
  },
  catapult: {
    name: 'Sticker Catapult', tags: ['siege'], age: 3, proc: 'catapult', gait: 'roll',
    cost: { blocks: 120, buttons: 100 }, trainTime: 22,
    hp: 85, atk: 26, atkType: 'siege', interval: 3.6, range: 6.5, minRange: 2,
    bonus: { building: 14 },
    armor: { melee: 0, pierce: 2 }, speed: 0.85, vision: 6, aggro: 6,
    impact: 0.45, color: 0xc9a86a,
    projectile: { speed: 8, arc: true, color: 0xf3722c, size: 0.16, splash: 1.6, spin: true, trail: 0xf3722c },
    debris: { shapes: ['stick', 'stick', 'disc'], colors: [0xc9a86a, 0xb08050], count: 9 },
    desc: 'Lobs sticker wads clear across the room. The splash punishes clumps and bases alike.',
  },
  // ---- naval toys (built at a Dock; sail only on water) ----
  skimmer: {
    name: 'Bath Skimmer', tags: ['ship'], age: 1, proc: 'tugboat', naval: true, targetHeight: 0.5,
    gatherNaval: true, carry: 16, gatherRate: 1.6,
    cost: { snacks: 50 }, trainTime: 13, pop: 1,
    hp: 90, atk: 0, atkType: 'melee', interval: 2, range: 0.5,
    armor: { melee: 0, pierce: 1 }, speed: 2.6, vision: 7, aggro: 0,
    impact: 0.45, color: 0x58c4dd,
    debris: { shapes: ['cube', 'disc'], colors: [0x58c4dd, 0xf2efe4], count: 5 },
    desc: 'The harvest boat. The only toy that can net the floating bath treasures — soap, ducks and pearls — and ferry them home to the Dock. Unarmed and unbothered.',
  },
  tugboat: {
    name: 'Tugboat Gunner', tags: ['ship'], age: 2, proc: 'tugboat', naval: true, targetHeight: 0.5,
    cost: { blocks: 70, buttons: 40 }, trainTime: 18, pop: 2,
    hp: 140, atk: 12, atkType: 'pierce', interval: 1.8, range: 5.5,
    bonus: { ship: 8, building: 6 },
    armor: { melee: 2, pierce: 3 }, speed: 2.0, vision: 8, aggro: 8,
    impact: 0.6, color: 0xc0392b,
    projectile: { speed: 15, arc: true, color: 0xffe08a, size: 0.09, trail: 0xffb703 },
    debris: { shapes: ['cube', 'disc'], colors: [0xc0392b, 0xe8ddc0], count: 7 },
    desc: 'Heavy gunboat: rules the water and shells the shore. Sails only where it is wet.',
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
    desc: 'Fast, cheap, unreasonably confident. Swarm the bath, harass their boats. Water only.',
  },
  // ---- the Galleon: shared Age-3 capital ship (the bath's answer to megas) ----
  galleon: {
    name: 'Toy Galleon', tags: ['ship'], age: 3, proc: 'tugboat', naval: true, targetHeight: 0.85,
    cost: { blocks: 180, buttons: 140 }, trainTime: 45, pop: 4,
    hp: 420, atk: 16, atkType: 'pierce', interval: 2.4, range: 6.5,
    bonus: { ship: 10, building: 12 },
    armor: { melee: 3, pierce: 4 }, speed: 1.6, vision: 9, aggro: 9,
    impact: 0.8, color: 0x8a5a34,
    projectile: { speed: 13, arc: true, splash: 1.6, color: 0xffd166, size: 0.12, trail: 0xff9a3a },
    debris: { shapes: ['stick', 'cube', 'disc'], colors: [0x8a5a34, 0xf2efe4, 0xd8b45a], count: 12 },
    desc: 'The pride of the bath: three sails, a broadside of cork cannon, and a crow\'s nest with a view of the whole war. Splash damage, in every sense.',
  },
  // ---- faction-unique warships (built at the Dock; each tribe sails its own) ----
  'navy-classic': {
    name: 'Toy Destroyer', tags: ['ship'], age: 2, proc: 'tugboat', naval: true, faction: 'classic', targetHeight: 0.55,
    cost: { blocks: 65, buttons: 45 }, trainTime: 17, pop: 2,
    hp: 155, atk: 11, atkType: 'pierce', interval: 1.7, range: 5.2,
    bonus: { ship: 7, building: 5 },
    armor: { melee: 2, pierce: 3 }, speed: 2.4, vision: 8, aggro: 8,
    impact: 0.55, color: 0x6b7a4a,
    projectile: { speed: 15, arc: true, color: 0xffe08a, size: 0.09, trail: 0xd9d08a },
    debris: { shapes: ['cube', 'disc'], colors: [0x6b7a4a, 0xe8ddc0], count: 7 },
    desc: 'Classic navy: a molded olive destroyer, deck gun forward, orders crisp. Steady in any bath, brave in the deep end. Water only.',
  },
  'navy-bricks': {
    name: 'Brick Ironclad', tags: ['ship'], age: 2, proc: 'tugboat', naval: true, faction: 'bricks', targetHeight: 0.6,
    cost: { blocks: 95, buttons: 35 }, trainTime: 22, pop: 3,
    hp: 250, atk: 11, atkType: 'pierce', interval: 2.1, range: 5,
    bonus: { ship: 9, building: 9 },
    armor: { melee: 4, pierce: 5 }, speed: 1.5, vision: 8, aggro: 9,
    impact: 0.7, color: 0xd6453f,
    projectile: { speed: 14, arc: true, color: 0xffd23f, size: 0.11, trail: 0x4d9bff },
    debris: { shapes: ['brick', 'brick', 'cube'], colors: [0xf94144, 0xf9c74f, 0x4d9bff, 0x90be6d], count: 9 },
    desc: 'Snap-Brick navy: a floating fortress snapped stud by stud. Slow as Sunday, tough as the toy box. It does not dodge — it simply refuses to sink. Water only.',
  },
  'navy-plush': {
    name: 'Pirate Plush Raft', tags: ['ship'], age: 2, proc: 'tugboat', naval: true, faction: 'plush', targetHeight: 0.62,
    cost: { snacks: 55, buttons: 40 }, trainTime: 18, pop: 2,
    hp: 200, atk: 8, atkType: 'pierce', interval: 1.8, range: 4.6,
    bonus: { ship: 5, building: 4 },
    armor: { melee: 2, pierce: 2 }, speed: 1.9, vision: 8, aggro: 7,
    impact: 0.5, color: 0xd9a066,
    projectile: { speed: 14, arc: true, color: 0xf4d19b, size: 0.08, trail: 0xd9a066 },
    debris: { shapes: ['cube'], colors: [0xd9a066, 0xe8ddc0, 0xd88aa8], fluff: true, count: 7 },
    desc: 'Plushie navy: a quilted felt raft with a teddy at the prow and a patchwork sail. Soft, stuffed and stubbornly seaworthy — it takes a licking and keeps on floating. Water only.',
  },
  'navy-racers': {
    name: 'RC Speedboat', tags: ['ship'], age: 2, proc: 'duckboat', naval: true, faction: 'racers', targetHeight: 0.5,
    cost: { snacks: 45, buttons: 40 }, trainTime: 12, pop: 1,
    hp: 90, atk: 10, atkType: 'pierce', interval: 1.1, range: 4.2,
    bonus: { ship: 4 },
    armor: { melee: 0, pierce: 1 }, speed: 3.9, vision: 9, aggro: 8,
    impact: 0.45, color: 0xe5484d,
    projectile: { speed: 17, arc: false, color: 0xffffff, size: 0.06, trail: 0xe5484d },
    debris: { shapes: ['disc', 'stick'], colors: [0xe5484d, 0xffffff], count: 6 },
    desc: 'RC navy: a red hydroplane that treats the whole bath like a lap record. Blink and it has already crossed your bow twice. Glass-hulled — hit it if you can. Water only.',
  },
  'navy-bots': {
    name: 'Tin Submarine', tags: ['ship', 'bot'], age: 2, proc: 'tugboat', naval: true, faction: 'bots', targetHeight: 0.5,
    cost: { buttons: 55, marbles: 20 }, trainTime: 18, pop: 2,
    hp: 125, atk: 10, atkType: 'pierce', interval: 1.15, range: 6.6,
    bonus: { ship: 6, building: 4 },
    armor: { melee: 1, pierce: 3 }, speed: 2.2, vision: 10, aggro: 9,
    impact: 0.5, color: 0x9aa4b0,
    projectile: { speed: 18, arc: false, color: 0x40c0e0, size: 0.07, trail: 0x40c0e0 },
    debris: { shapes: ['cube', 'disc'], colors: [0x9aa4b0, 0x40c0e0], count: 7 },
    desc: 'Tin Bot navy: a riveted wind-up submarine, periscope up, one blue porthole glowing. Outranges the room and never misses twice. It is patient down there. Water only.',
  },
  wargalley: {
    name: 'War Galley', tags: ['ship'], age: 2, proc: 'tugboat', naval: true, faction: 'knights', targetHeight: 0.6,
    cost: { blocks: 80, snacks: 45 }, trainTime: 19, pop: 2,
    hp: 190, atk: 10, atkType: 'pierce', interval: 1.6, range: 5.0,
    bonus: { ship: 7, building: 6 },
    armor: { melee: 3, pierce: 3 }, speed: 2.0, vision: 8, aggro: 8,
    impact: 0.55, color: 0x8a5a34,
    projectile: { speed: 13, arc: true, color: 0xffb066, size: 0.1, trail: 0xff8a3a },
    debris: { shapes: ['stick', 'cube'], colors: [0x8a5a34, 0xd6453f], count: 8 },
    desc: 'Kingdom navy: a dragon-prowed galley with shields down the rail and fire arrows nocked. The bath has never seen heraldry before. Water only.',
  },
  // ---- the Forgotten: attic wraiths, event-spawned only (the Midnight Chapter) ----
  forgotten: {
    name: 'Forgotten One', tags: ['infantry', 'heavy', 'bot'], age: 3, proc: 'titanbot', gait: 'stomp', targetHeight: 0.6,
    cost: { snacks: 100 }, trainTime: 30, pop: 2,
    hp: 190, atk: 13, atkType: 'melee', interval: 1.5, range: 0.6,
    armor: { melee: 3, pierce: 3 }, speed: 1.6, vision: 7, aggro: 9,
    impact: 0.7, color: 0x6a6f78,
    debris: { shapes: ['cube', 'disc'], colors: [0x6a6f78, 0x4a5058], count: 8 },
    desc: 'A toy boxed so long it winds itself. It does not hate you. It only remembers being left, and it is done waiting quietly.',
  },
  forgottenking: {
    name: 'The First Forgotten', tags: ['infantry', 'heavy', 'mega'], age: 3, proc: 'golem', gait: 'stomp', targetHeight: 1.1,
    cost: { snacks: 400 }, trainTime: 50, pop: 5, slam: 2.4,
    hp: 850, atk: 26, atkType: 'melee', interval: 2.0, range: 0.9,
    armor: { melee: 4, pierce: 5 }, speed: 1.3, vision: 9, aggro: 10,
    impact: 1.0, color: 0x7a7f88,
    debris: { shapes: ['cube', 'disc', 'stick'], colors: [0x7a7f88, 0x4a5058, 0xc0a860], count: 14 },
    desc: 'A king with no scuffs, no name, and no one\'s initials on his foot. Every tick of his great key is a year nobody came.',
  },
  // ---- MEGA UNITS: one colossal Age-3 signature per faction (its faction building) ----
  tank: {
    name: "General's Tank", tags: ['siege', 'vehicle', 'mega'], age: 3, faction: 'classic', gait: 'roll',
    cost: { blocks: 260, snacks: 150 }, trainTime: 45,
    hp: 480, atk: 30, atkType: 'siege', interval: 3.2, range: 6, minRange: 1.5,
    bonus: { building: 22 },
    armor: { melee: 6, pierce: 9 }, speed: 1.15, vision: 8, aggro: 6, radius: 0.55,
    impact: 0.5, color: 0x4a7a44,
    projectile: { speed: 9, arc: true, color: 0xffcf6a, size: 0.18, splash: 2.0, spin: true, trail: 0xf3722c },
    debris: { shapes: ['cube', 'disc', 'peg'], colors: [0x4a7a44, 0x333333], count: 12 },
    desc: 'MEGA (Army Men): a rolling fortress with one very loud opinion. Heavy shell, big splash, crushes buildings.',
  },
  colossus: {
    name: 'Brick Colossus', tags: ['infantry', 'heavy', 'mega'], age: 3, faction: 'bricks', proc: 'golem', gait: 'stomp',
    cost: { blocks: 340, marbles: 120 }, trainTime: 50,
    hp: 720, atk: 24, atkType: 'melee', interval: 2.0, range: 1.2, slam: 2.6,
    bonus: { building: 30 },
    armor: { melee: 9, pierce: 11 }, speed: 0.85, vision: 6, aggro: 6, radius: 0.6,
    impact: 0.5, color: 0x4d9bff,
    debris: { shapes: ['brick', 'cube'], colors: [0xf94144, 0x4d9bff, 0xf9c74f, 0x90be6d], count: 16 },
    desc: 'MEGA (Snap-Bricks): a titan of studs and spite. Its ground-slam levels everything nearby. Wrecks bases.',
  },
  mamabear: {
    name: 'Mama Bear', tags: ['infantry', 'heavy', 'plush', 'mega'], age: 3, faction: 'plush', proc: 'bear', gait: 'waddle',
    cost: { snacks: 300, buttons: 180 }, trainTime: 48,
    hp: 680, atk: 18, atkType: 'melee', interval: 2.2, range: 1.3,
    heal: { range: 6, rate: 10 },
    armor: { melee: 5, pierce: 7 }, speed: 0.9, vision: 7, aggro: 6, radius: 0.6,
    impact: 0.5, color: 0xd9a441,
    debris: { shapes: ['cube'], colors: [0xd9a441, 0xe05555], count: 8, fluff: true },
    desc: 'MEGA (Plushies): the biggest hug in the house. Soaks enormous damage and mends every toy in her shadow.',
  },
  monster: {
    name: 'Monster Truck', tags: ['raider', 'vehicle', 'mega'], age: 3, faction: 'racers', gait: 'roll',
    cost: { snacks: 200, buttons: 230 }, trainTime: 42,
    hp: 520, atk: 14, atkType: 'melee', interval: 1.4, range: 1.0, trample: 16,
    armor: { melee: 4, pierce: 5 }, speed: 3.2, vision: 8, aggro: 6, radius: 0.55,
    impact: 0.5, color: 0xe5484d,
    debris: { shapes: ['disc', 'stick'], colors: [0xe5484d, 0xffd23f, 0x333333], count: 10 },
    desc: 'MEGA (RC Racers): flame-painted thunder. Tramples whatever it drives through — which is everything.',
  },
  mecha: {
    name: 'Mecha-Titan', tags: ['vehicle', 'ranged', 'bot', 'mega'], age: 3, faction: 'bots', gait: 'stomp',
    cost: { buttons: 260, marbles: 160 }, trainTime: 48,
    hp: 600, atk: 26, atkType: 'pierce', interval: 2.6, range: 7.5, beam: true,
    bonus: { infantry: 6 },
    armor: { melee: 5, pierce: 5 }, speed: 1.1, vision: 9, aggro: 7, radius: 0.6,
    impact: 0.5, color: 0x8a1a2a,
    debris: { shapes: ['cube', 'disc', 'peg'], colors: [0x7a828f, 0x8a1a2a, 0x40c0e0], count: 12 },
    desc: 'MEGA (Tin Bots): a giant of polished tin. Its laser skewers an entire battle line at once.',
  },
  dragon: {
    name: 'The Toy Dragon', tags: ['heavy', 'mega'], age: 3, faction: 'knights', gait: 'stomp',
    cost: { snacks: 280, marbles: 180 }, trainTime: 50,
    hp: 640, atk: 22, atkType: 'siege', interval: 2.4, range: 2.2,
    bonus: { building: 14 },
    armor: { melee: 5, pierce: 6 }, speed: 1.5, vision: 9, aggro: 7, radius: 0.6,
    impact: 0.6, color: 0xc03028,
    projectile: { speed: 10, arc: false, color: 0xff8a3a, size: 0.14, splash: 1.6, trail: 0xff6a1a },
    debris: { shapes: ['limb', 'cube', 'stick'], colors: [0xc03028, 0xff8a3a, 0xd9a441], count: 12 },
    desc: 'MEGA (Castle Kingdom): red plastic, amber belly, breath like a birthday candle gone to war. The fire splashes.',
  },
};

// GLB manifest: each clip file is the same mesh with one animation baked in.
export const MODEL_MANIFEST = {
  worker:  { dir: 'assets/units/worker',  clips: ['idle', 'walk', 'attack', 'death'], targetHeight: 0.5 },
  // faction-unique workers — static generated models, code-driven bob (fall back
  // to the rigged default worker if a tribe's GLB is missing)
  'worker-classic': { dir: 'assets/units/worker-classic', model: 'model.glb', targetHeight: 0.52 },
  'worker-bricks':  { dir: 'assets/units/worker-bricks',  model: 'model.glb', targetHeight: 0.52 },
  'worker-plush':   { dir: 'assets/units/worker-plush',   model: 'model.glb', targetHeight: 0.52 },
  'worker-racers':  { dir: 'assets/units/worker-racers',  model: 'model.glb', targetHeight: 0.52 },
  'worker-knights': { dir: 'assets/units/worker-knights', model: 'model.glb', targetHeight: 0.52 },
  // Castle Kingdom uniques
  knight:    { dir: 'assets/units/knight',    model: 'model.glb', targetHeight: 0.52 },
  crossbow:  { dir: 'assets/units/crossbow',  model: 'model.glb', targetHeight: 0.52 },
  charger:   { dir: 'assets/units/charger',   model: 'model.glb', targetHeight: 0.62 },
  paladin:   { dir: 'assets/units/paladin',   model: 'model.glb', targetHeight: 0.58 },
  trebuchet: { dir: 'assets/units/trebuchet', model: 'model.glb', targetHeight: 0.7 },
  dragon:    { dir: 'assets/units/dragon',    model: 'model.glb', targetHeight: 1.05 },
  wargalley: { dir: 'assets/units/wargalley', model: 'model.glb', targetHeight: 0.6 },
  'worker-bots':    { dir: 'assets/units/worker-bots',    model: 'model.glb', targetHeight: 0.52 },
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
  // Tin Bots: static robot models, code-driven bob (proc fallback if GLB missing)
  zapbot:  { dir: 'assets/units/zapbot',  model: 'model.glb', targetHeight: 0.55 },
  titanbot:{ dir: 'assets/units/titanbot',model: 'model.glb', targetHeight: 0.9 },
  // static vehicle, no rig — animated by code (wheel spin + bounce)
  raider:  { dir: 'assets/units/raider',  model: 'model.glb', targetHeight: 0.5 },
  // static siege — code-animated (bounce + lunge); proc fallback if missing
  ram:     { dir: 'assets/units/ram',     model: 'model.glb', targetHeight: 0.6 },
  flinger: { dir: 'assets/units/flinger', model: 'model.glb', targetHeight: 0.45 },
  catapult:{ dir: 'assets/units/catapult',model: 'model.glb', targetHeight: 0.65 },
  dragster:{ dir: 'assets/units/dragster',model: 'model.glb', targetHeight: 0.42 },
  cart:    { dir: 'assets/units/cart',    model: 'model.glb', targetHeight: 0.5 },
  hypno:   { dir: 'assets/units/hypno',   model: 'model.glb', targetHeight: 0.5 },
  // mega units — big static models, code-animated (bob/spin per def flags)
  tank:    { dir: 'assets/units/tank',    model: 'model.glb', targetHeight: 0.7 },
  colossus:{ dir: 'assets/units/colossus',model: 'model.glb', targetHeight: 1.1 },
  mamabear:{ dir: 'assets/units/mamabear',model: 'model.glb', targetHeight: 1.05 },
  monster: { dir: 'assets/units/monster', model: 'model.glb', targetHeight: 0.75 },
  mecha:   { dir: 'assets/units/mecha',   model: 'model.glb', targetHeight: 1.15 },
  // static naval hulls, no rig — code-animated (bob on the water); proc fallback
  tugboat: { dir: 'assets/units/tugboat', model: 'model.glb', targetHeight: 0.55 },
  duckboat:{ dir: 'assets/units/duckboat',model: 'model.glb', targetHeight: 0.6 },
  skimmer: { dir: 'assets/units/skimmer', model: 'model.glb', targetHeight: 0.5 },
  galleon: { dir: 'assets/units/galleon', model: 'model.glb', targetHeight: 0.85 },
  forgotten: { dir: 'assets/units/forgotten', model: 'model.glb', targetHeight: 0.6 },
  forgottenking: { dir: 'assets/units/forgottenking', model: 'model.glb', targetHeight: 1.1 },
  // faction-unique warships (one per tribe, built at the Dock)
  'navy-classic': { dir: 'assets/units/navy-classic', model: 'model.glb', targetHeight: 0.55 },
  'navy-bricks':  { dir: 'assets/units/navy-bricks',  model: 'model.glb', targetHeight: 0.6 },
  'navy-plush':   { dir: 'assets/units/navy-plush',   model: 'model.glb', targetHeight: 0.62 },
  'navy-racers':  { dir: 'assets/units/navy-racers',  model: 'model.glb', targetHeight: 0.5 },
  'navy-bots':    { dir: 'assets/units/navy-bots',    model: 'model.glb', targetHeight: 0.5 },
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
    desc: 'Home. Workers, drop-off, and the road to new Ages. Garrison 10 toys — it shoots while they hide.',
  },
  house: {
    name: 'Block House', tags: ['building'], size: 2, hp: 200, cost: { blocks: 30 }, buildTime: 12,
    armor: { melee: 1, pierce: 6 }, pop: 5, vision: 3, height: 1.1,
    debris: BRICK_DEBRIS,
    desc: 'Room under a little roof for five more toys. (+5 capacity)',
  },
  basket: {
    name: 'Storage Basket', tags: ['building'], size: 2, hp: 250, cost: { blocks: 50 }, buildTime: 10,
    armor: { melee: 1, pierce: 5 }, dropoff: true, vision: 3, height: 0.9,
    debris: WOOD_DEBRIS,
    desc: 'A forward pantry: workers bank their haul here instead of trudging all the way home.',
  },
  dock: {
    name: 'Dock', tags: ['building'], size: 3, hp: 500, cost: { blocks: 120, snacks: 30 }, buildTime: 20,
    armor: { melee: 1, pierce: 6 }, vision: 5, age: 1, height: 0.65, dock: true,
    trains: ['skimmer', 'tugboat', 'duckboat', 'navy-classic', 'navy-bricks', 'navy-plush', 'navy-racers', 'navy-bots', 'wargalley', 'galleon'],
    debris: WOOD_DEBRIS,
    desc: 'Shipyard and harbor — raise it at the water\'s edge. Bath Skimmers harvest the floating treasures from day one; the warships launch come the Playmat Age.',
  },
  tinker: {
    name: 'Tinker Bench', tags: ['building'], size: 2, hp: 520, cost: { blocks: 110, snacks: 40 }, buildTime: 20,
    armor: { melee: 1, pierce: 6 }, vision: 4, age: 2, height: 0.9,
    techs: ['whetstone', 'quilting', 'reinforced', 'sugarrush', 'overwound', 'pentower', 'steelwork'],
    debris: WOOD_DEBRIS,
    desc: 'The tinkering never stops: sharper weapons, pen towers, steel walls — boosts for toys AND buildings.',
  },
  // ---- faction buildings (each tribe's own workshop, Playmat Age) ----
  tent: {
    name: 'Command Tent', tags: ['building'], size: 3, hp: 550, cost: { blocks: 140 }, buildTime: 20,
    armor: { melee: 1, pierce: 6 }, vision: 4, age: 2, height: 1.2, faction: 'classic',
    trains: ['soldier', 'spear', 'grenadier', 'bazooka', 'tank'], techs: ['liveammo'],
    debris: { shapes: ['stick', 'cube'], colors: [0x4a7a44, 0x8a915a] },
    desc: 'Classic unique: the field HQ. Every stripe of army man musters here, Grenade Lobbers included.',
  },
  brickshop: {
    name: 'Brick Foundry', tags: ['building'], size: 3, hp: 700, cost: { blocks: 160 }, buildTime: 22,
    armor: { melee: 2, pierce: 6 }, vision: 4, age: 2, height: 1.3, faction: 'bricks',
    trains: ['golem', 'lancer', 'colossus'], techs: ['plating', 'interlock'],
    debris: BRICK_DEBRIS,
    desc: 'Snap-Brick unique: molds Brick Golems and Pogo Lancers, researches Plating. Click. Done.',
  },
  nest: {
    name: 'Pillow Nest', tags: ['building'], size: 3, hp: 600, cost: { blocks: 130, snacks: 50 }, buildTime: 20,
    armor: { melee: 1, pierce: 6 }, vision: 4, age: 2, height: 1.0, faction: 'plush',
    trains: ['medic', 'sockpuppet', 'bear', 'mamabear'], techs: ['training', 'grouphug'],
    debris: { shapes: ['cube'], colors: [0xe8e0f4, 0xd88aa8], fluff: true },
    desc: 'Plushie unique: a warm nest that stitches Sock Puppets, Medics and Bears into service.',
  },
  pitstop: {
    name: 'Pit Stop', tags: ['building'], size: 3, hp: 550, cost: { blocks: 150, buttons: 40 }, buildTime: 20,
    armor: { melee: 1, pierce: 6 }, vision: 4, age: 2, height: 1.0, faction: 'racers',
    trains: ['raider', 'dragster', 'drone', 'cart', 'monster'], techs: ['springs', 'nitro'],
    debris: { shapes: ['disc', 'stick'], colors: [0x666f7a, 0xe5484d] },
    desc: 'RC Racer unique: fuel, fresh tires and bad ideas for every wheeled and winged toy.',
  },
  robolab: {
    name: 'Robotics Bay', tags: ['building'], size: 3, hp: 600, cost: { blocks: 140, buttons: 30 }, buildTime: 21,
    armor: { melee: 1, pierce: 6 }, vision: 4, age: 2, height: 1.1, faction: 'bots',
    trains: ['zapbot', 'titanbot', 'mecha'], techs: ['overclock'],
    debris: { shapes: ['cube', 'disc'], colors: [0x8a95a2, 0x40c0e0] },
    desc: 'Tin Bots unique: assembles Zap Bots and Titan Bots, researches Overclock. It hums at night.',
  },
  roost: {
    name: 'Dragon Roost', tags: ['building'], size: 3, hp: 650, cost: { blocks: 150, snacks: 40 }, buildTime: 21,
    armor: { melee: 2, pierce: 6 }, vision: 4, age: 2, height: 1.3, faction: 'knights',
    trains: ['knight', 'crossbow', 'charger', 'dragon'], techs: ['chivalry'],
    debris: { shapes: ['cube', 'stick'], colors: [0x8a8f98, 0xc03028] },
    desc: 'Kingdom unique: a stone spire with a nest on top and one warm red egg. Knights muster below; something above keeps them brave.',
  },
  wall: {
    name: 'Block Wall', tags: ['building', 'wall'], size: 1, hp: 250, cost: { blocks: 5 }, buildTime: 4,
    armor: { melee: 2, pierce: 8 }, vision: 1, height: 0.85, wall: true,
    debris: RED_BRICK_DEBRIS,
    desc: 'A cheap brick promise. Click and drag to draw the line. Siege breaks promises.',
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
    desc: 'A picnic that never ends. One worker per mat — slow, steady, eternal Snacks.',
  },
  mat: {
    name: 'Training Mat', tags: ['building'], size: 3, hp: 650, cost: { blocks: 150 }, buildTime: 22,
    armor: { melee: 1, pierce: 6 }, vision: 4, trains: ['soldier', 'spear', 'medic'],
    techs: ['pencils', 'tape', 'steel_soldier', 'steel_spear', 'elite_soldier', 'elite_spear'], height: 0.9,
    debris: WOOD_DEBRIS,
    desc: 'Where Block Soldiers, Push-Pin Spears and Plush Medics learn to be brave.',
  },
  bench: {
    name: 'Ranged Bench', tags: ['building'], size: 3, hp: 700, cost: { blocks: 175 }, buildTime: 22,
    armor: { melee: 1, pierce: 6 }, vision: 4, trains: ['archer', 'flinger'],
    techs: ['bands', 'steel_archer', 'elite_archer'], age: 2, height: 1.0,
    debris: WOOD_DEBRIS,
    desc: 'Where Button Archers and Rubber-Band Flingers learn to aim before they boast.',
  },
  garage: {
    name: 'RC Garage', tags: ['building'], size: 3, hp: 600, cost: { blocks: 175, buttons: 50 }, buildTime: 22,
    armor: { melee: 1, pierce: 6 }, vision: 4, trains: ['raider'], techs: ['springs'], age: 2, height: 1.2,
    debris: { shapes: ['disc', 'brick', 'cube'], colors: [0x666f7a, 0x333333, 0x43aa8b] },
    desc: 'Where RC Raiders are born already speeding. Requires the Playmat Age.',
  },
  market: {
    name: 'Market Stall', tags: ['building'], size: 3, hp: 600, cost: { blocks: 140 }, buildTime: 20,
    armor: { melee: 1, pierce: 6 }, vision: 4, market: true, age: 2, height: 1.4,
    trains: ['cart'],
    debris: WOOD_DEBRIS,
    desc: 'Buttons for anything, anything for Buttons. Trains Delivery Carts for the long roads.',
  },
  tower: {
    name: 'Watch Tower', tags: ['building'], size: 2, hp: 600, cost: { blocks: 75, marbles: 75 }, buildTime: 18,
    armor: { melee: 2, pierce: 6 }, vision: 10, age: 2, height: 2.4, garrison: 4,
    attack: { atk: 6, atkType: 'pierce', interval: 1.9, range: 7,
              projectile: { speed: 13, arc: true, color: 0xffe28a, size: 0.09, trail: 0xffe28a } },
    debris: { shapes: ['peg', 'stick', 'cube'], colors: [0xf9c74f, 0xd9a066, 0xe98aa2] },
    desc: 'A pencil standing guard. Writes off nearby enemies. Costs Marbles.',
  },
  workshop: {
    name: 'Siege Workshop', tags: ['building'], size: 3, hp: 750, cost: { blocks: 175, buttons: 75 }, buildTime: 26,
    armor: { melee: 1, pierce: 7 }, vision: 4, trains: ['ram', 'catapult', 'trebuchet'], age: 3, height: 1.1,
    debris: WOOD_DEBRIS,
    desc: 'Where Pillow Rams and Sticker Catapults are dreamed up and bolted together. Fort Age.',
  },
  fort: {
    name: 'Toy Fort', tags: ['building'], size: 4, hp: 2400, cost: { blocks: 200, marbles: 180 }, buildTime: 45,
    armor: { melee: 3, pierce: 8 }, vision: 11, age: 3, height: 2.2, garrison: 8,
    trains: ['hero', 'hypno', 'bear', 'golem', 'dragster', 'bazooka', 'grenadier', 'lancer', 'sockpuppet', 'drone', 'paladin'],
    techs: ['plating', 'training'],
    attack: { atk: 10, atkType: 'pierce', interval: 1.6, range: 8,
              projectile: { speed: 14, arc: true, color: 0xffe28a, size: 0.11, trail: 0xffe28a } },
    debris: { shapes: ['cube', 'brick'], colors: [0xe8e0f0, 0xd8c8b8, 0xf0e8e0], fluff: true },
    desc: 'A blanket fortress that means it. Anchors your territory and trains Action Heroes.',
  },
  wonder: {
    name: 'Imagination Wonder', tags: ['building'], size: 4, hp: 3000,
    cost: { blocks: 600, snacks: 500, buttons: 350, marbles: 250 }, buildTime: 80,
    armor: { melee: 3, pierce: 8 }, vision: 6, age: 3, height: 3.0, wonder: true,
    debris: { shapes: ['cube', 'brick'], colors: [0xf0e4f4, 0xe8ddf2, 0xffd94a], fluff: true },
    desc: 'A castle of pure imagination. Defend it for 4 minutes and the bedroom is yours outright.',
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
    desc: 'The classic. Open center, safe corners, and everything left to prove.',
  },
  canyon: {
    label: 'Toy Chest Canyon', icon: '🏔️', ground: 'playmat', light: 'normal',
    obstacles: 3, canyon: true, resourceMul: 1, stickers: 2, plateaus: 2,
    features: { milk: 1, ranges: 1, forests: 1 },
    desc: 'A pillow barricade splits the room, and the whole war squeezes through the gaps.',
  },
  underbed: {
    label: 'Under the Bed', icon: '🌑', ground: 'underbed', light: 'dark',
    obstacles: 11, canyon: false, resourceMul: 0.95, stickers: 3, plateaus: 2,
    features: { ranges: 2, forests: 2 },
    desc: 'Dark, cluttered, and older than anyone admits. Bring a scout — and your courage.',
  },
  attic: {
    label: 'Attic War Table', icon: '📦', ground: 'attic', light: 'warm',
    obstacles: 4, canyon: false, resourceMul: 1.4, stickers: 2, plateaus: 3,
    features: { milk: 1, ranges: 2, forests: 1 },
    desc: 'Wide open, rich, and quiet as history. Boom, Commander — or be boomed.',
  },
  playground: {
    label: 'Backyard Playground', icon: '🛝', ground: 'playground', light: 'warm',
    obstacles: 2, canyon: false, resourceMul: 1.25, stickers: 3, plateaus: 2,
    features: { milk: 1, ranges: 1, forests: 3 },
    // swing sets, slides and seesaws stud the field; a splash-pad puddle and
    // hedge thickets carve the lanes. Rich sandbox center — grab and hold it.
    decor: ['swingset', 'slide', 'seesaw', 'sandbucket', 'ball'],
    decorCount: 18,
    desc: 'A sunny backyard: the sandbox in the middle, swings and slides all around it.',
  },
  kitchen: {
    label: 'Kitchen Table', icon: '🍽️', ground: 'kitchen', light: 'warm',
    obstacles: 4, canyon: false, resourceMul: 1.35, stickers: 2, plateaus: 2,
    // dinner-table spills read as impassable milk lakes — lots of them
    features: { milk: 3, ranges: 1, forests: 1 },
    decor: ['teacup', 'die', 'ball', 'crayon'],
    decorCount: 15,
    desc: 'A crumb-strewn table of plenty — but mind the milk. Nothing marches through milk.',
  },
  bookshelf: {
    label: 'Bookshelf Heights', icon: '📚', ground: 'bookshelf', light: 'warm',
    // elevation-forward: extra plateaus + ramps make a tiered high-ground fight,
    // but kept navigable (too many blockers wall armies out and stalemate).
    obstacles: 4, canyon: false, resourceMul: 1, stickers: 3, plateaus: 3,
    features: { ranges: 1, forests: 1 },
    desc: 'Shelves stacked like mountain country. Seize the high ground; do the reading later.',
  },
  livingroom: {
    label: 'Living Room', icon: '🎄', ground: 'livingroom', light: 'warm',
    obstacles: 3, canyon: false, resourceMul: 1.3, stickers: 3, plateaus: 2,
    features: { forests: 1 },
    decor: ['ornament', 'gift', 'die', 'ball'],
    decorCount: 16,
    desc: 'The holiday carpet: presents worth claiming and a tree skirt worth holding.',
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
    desc: 'A warm sea in the middle of everything. Raise your Docks and rule the waves!',
  },
  // ---- THE GREAT OUTDOORS: past the door, where the world stops being square ----
  sandbox: {
    label: 'Sandbox Dunes', icon: '🏖️', ground: 'sandbox', light: 'day', outdoor: true,
    obstacles: 5, canyon: false, resourceMul: 1.1, stickers: 2, plateaus: 0,
    // the first non-square battlefield: a kidney-shaped sandbox — outside the
    // wooden rim is deck, and no toy marches on deck. Rolling dunes inside.
    mask: { type: 'kidney', rx: 33, rz: 27, bx: 0, bz: -26, br: 12 },
    dunes: { count: 7, rMin: 4, rMax: 7 },
    weather: 'seeds',
    obstacleKinds: ['rock', 'bucket', 'shovel'],
    decor: ['pebble', 'grass', 'seashell'],
    decorCount: 14,
    desc: 'The kidney-shaped sandbox, mid-morning. Rolling dunes, buried treasure, no corners to hide in.',
  },
  garden: {
    label: 'The Garden', icon: '🌻', ground: 'garden', light: 'gold', outdoor: true,
    obstacles: 5, canyon: false, resourceMul: 1.3, stickers: 3, plateaus: 4,
    // flower-bed terraces climb in real steps; sunflower groves are the forests
    groves: { kind: 'sunflower', count: 5 },
    weather: 'rain', // a golden sun-shower — the garden's favorite kind
    obstacleKinds: ['rock', 'tree'],
    decor: ['daisy', 'grass', 'mushroom', 'pebble'],
    decorCount: 20,
    desc: 'Flower-bed terraces and sunflower groves taller than siege engines. Rich soil, long shadows.',
  },
  oldoak: {
    label: 'The Old Oak', icon: '🌳', ground: 'oldoak', light: 'dusk', outdoor: true,
    obstacles: 6, canyon: false, resourceMul: 1.15, stickers: 3, plateaus: 1,
    // an oval lawn clearing around one enormous tree on a hill — THE high ground
    mask: { type: 'ellipse', rx: 34, rz: 29 },
    centerHill: { r: 9 },
    roots: true,
    weather: 'fireflies',
    obstacleKinds: ['rock', 'tree'],
    decor: ['mushroom', 'grass', 'pebble', 'daisy'],
    decorCount: 18,
    desc: 'One giant oak on a hill at dusk, roots like castle walls. Whoever holds the tree holds the yard.',
  },
};

// irregular playable shapes: pure + deterministic, shared by the sim (blocking)
// and the ground painter (scenery outside the rim). true = inside the play area.
export function maskAt(mask, i, j, n) {
  if (!mask) return true;
  const di = i - n / 2 + 0.5, dj = j - n / 2 + 0.5;
  const inEllipse = (di * di) / (mask.rx * mask.rx) + (dj * dj) / (mask.rz * mask.rz) <= 1;
  if (!inEllipse) return false;
  if (mask.type === 'kidney') {
    const bx = di - (mask.bx || 0), bz = dj - (mask.bz || 0);
    if (bx * bx + bz * bz <= mask.br * mask.br) return false; // the bite
  }
  return true;
}

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
// buildings that produce units — losing your last one (with no workers to
// rebuild) is what ends a Conquest game. Includes the faction workshops and the
// Dock, which all TRAIN units (omitting them wrongly eliminated players that
// still had an army-producing building standing).
export const PRODUCTION_BUILDINGS = ['chest', 'mat', 'bench', 'garage', 'workshop', 'fort',
  'tent', 'brickshop', 'nest', 'pitstop', 'robolab', 'dock'];

// ---------------- techs (researched at buildings, apply stat modifiers) ----------------
export const TECHS = {
  pockets:  { name: 'Bigger Pockets',    age: 1, cost: { snacks: 75, blocks: 50 },    time: 25, desc: 'Deeper pockets, fewer trips: workers carry +4.' },
  sorting:  { name: 'Snack Sorting',     age: 1, cost: { snacks: 50, blocks: 25 },    time: 20, desc: 'A place for every crumb: Snacks gather +20% (mats too).' },
  scissors: { name: 'Sharper Scissors',  age: 2, cost: { snacks: 100, blocks: 75 },   time: 30, desc: 'Everything cuts cleaner: all gathering +15%.' },
  shoes:    { name: 'Toy Shoes',         age: 2, cost: { snacks: 100, buttons: 50 },  time: 25, desc: 'Tiny shoes, big hurry: workers and infantry +10% speed.' },
  pencils:  { name: 'Pointy Pencils',    age: 2, cost: { blocks: 100, buttons: 100 }, time: 30, desc: 'Freshly sharpened: melee infantry +1 attack.' },
  bands:    { name: 'Better Rubber Bands', age: 2, cost: { blocks: 100, buttons: 125 }, time: 30, desc: 'Stretchier and meaner: ranged toys +1 attack.' },
  springs:  { name: 'Turbo Springs',     age: 3, cost: { snacks: 150, buttons: 150 }, time: 30, desc: 'Wound past the warranty: wheeled toys +12% speed.' },
  tape:     { name: 'Tape Reinforcement', age: 3, cost: { blocks: 150, marbles: 125 }, time: 35, desc: 'Wrapped twice for luck: infantry armor +1/+1.' },
  plating:  { name: 'Cardboard Plating', age: 3, cost: { blocks: 200, marbles: 150 }, time: 40, desc: 'Cardboard, applied with conviction: buildings +20% HP.' },
  training: { name: 'Elite Toy Training', age: 3, cost: { snacks: 300, buttons: 300 }, time: 45, desc: 'Drilled until brave: military toys +15% HP.' },
  // ---- unit-line VISUAL upgrade tiers (AoE-style: the toys re-gear as they upgrade) ----
  // tier 1: steel armor (helmet + pauldrons) at the Playmat Age
  steel_soldier: { name: 'Armored Soldiers', age: 2, cost: { snacks: 90, blocks: 70 },  time: 28, desc: 'Block Soldiers strap on a steel helmet & pauldrons: +1/+1 armor — upgrades the living too.' },
  steel_spear:   { name: 'Armored Spears',   age: 2, cost: { snacks: 90, blocks: 70 },  time: 28, desc: 'Push-Pin Spears don steel gear: +1/+1 armor — upgrades the living too.' },
  steel_archer:  { name: 'Armored Archers',  age: 2, cost: { snacks: 90, buttons: 70 }, time: 28, desc: 'Button Archers get a steel helm: +1/+1 armor — upgrades the living too.' },
  // tier 2: gold champion gear (crest + ring). instantly promote every living toy of the line too
  elite_soldier: { name: 'Champion Soldiers', age: 3, cost: { snacks: 175, buttons: 125 }, time: 35, desc: 'Block Soldiers become gold Champions: +25% HP, +2 attack, +1/+1 armor — upgrades the living too.' },
  elite_spear:   { name: 'Champion Spears',   age: 3, cost: { snacks: 175, buttons: 125 }, time: 35, desc: 'Push-Pin Spears become gold Champions: +25% HP, +2 attack, +1/+1 armor — upgrades the living too.' },
  elite_archer:  { name: 'Champion Archers',  age: 3, cost: { snacks: 175, buttons: 150 }, time: 35, desc: 'Button Archers become gold Champions: +25% HP, +2 attack, +1/+1 armor — upgrades the living too.' },
  // ---- Tinker Bench unit upgrades (blanket boosts to your whole army) ----
  whetstone:  { name: 'Whetstone',        age: 2, cost: { snacks: 120, blocks: 60 },   time: 30, desc: 'Every edge in the room attended to: all military toys +1 attack.' },
  quilting:   { name: 'Quilted Padding',  age: 2, cost: { blocks: 100, buttons: 60 },  time: 30, desc: 'Padded where it counts: ranged and wheeled +1/+1 armor (tape covers infantry).' },
  reinforced: { name: 'Reinforced Cores', age: 3, cost: { snacks: 200, marbles: 100 }, time: 40, desc: 'Sturdier hearts installed: all military +15% HP (upgrades the living, stacks with Training).' },
  sugarrush:  { name: 'Sugar Rush',       age: 3, cost: { snacks: 150, buttons: 150 }, time: 35, desc: 'One cookie too many: every toy scoots 8% faster, infantry and wheels alike.' },
  overwound:  { name: 'Overwound Springs',age: 3, cost: { buttons: 200, marbles: 120 }, time: 40, desc: 'Springs wound to the very limit: military toys attack 12% faster.' },
  // ---- Tinker Bench BUILDING upgrades (level up your structures) ----
  pentower:   { name: 'Pen Towers',       age: 3, cost: { blocks: 150, buttons: 120 }, time: 40, building: true, desc: 'Pencil Towers become Pen Towers: +8 attack, +1.5 range, +80% HP.' },
  steelwork:  { name: 'Steelworks',       age: 3, cost: { blocks: 200, marbles: 120 }, time: 45, building: true, desc: 'Block Walls and Gates go steel: +2 armor and much tougher (+150% HP).' },
  // ---- civilization signature techs (each locked to one faction's own building) ----
  liveammo:   { name: 'Live Ammo',        age: 3, faction: 'classic', cost: { snacks: 180, buttons: 160 }, time: 40, desc: 'Army Men load the good stuff: all military +2 melee AND +2 ranged attack.' },
  interlock:  { name: 'Interlocking Studs', age: 3, faction: 'bricks', cost: { blocks: 220, marbles: 120 }, time: 45, building: true, desc: 'Double-studded construction: every building +30% HP (stacks with Plating).' },
  grouphug:   { name: 'Group Hug',        age: 3, faction: 'plush',   cost: { snacks: 220, buttons: 150 }, time: 40, desc: 'Plushies squeeze tighter: Medics heal 60% more and every toy +10% HP.' },
  nitro:      { name: 'Nitro Injection',  age: 3, faction: 'racers',  cost: { snacks: 170, buttons: 180 }, time: 38, desc: 'Redline everything: wheeled toys +20% speed and +2 attack.' },
  chivalry:   { name: 'Chivalry',         age: 3, faction: 'knights', cost: { snacks: 220, blocks: 180 }, time: 40, desc: 'The vows are renewed: all military +2 melee attack, and armored boots march 8% faster.' },
  overclock:  { name: 'Overclock',        age: 3, faction: 'bots',    cost: { buttons: 200, marbles: 120 }, time: 40, desc: 'Redline the servos: every toy attacks 12% faster AND +1 ranged attack.' },
};

export const START = {
  resources: { snacks: 200, blocks: 180, buttons: 50, marbles: 0 },
  workers: 4,
  scouts: 1,
};

// match-setup starting-resource presets (multiplies the base bank)
export const START_RES = {
  lean:     { label: 'Lean',     icon: '🕯️', mult: 0.5 },
  standard: { label: 'Standard', icon: '🎒', mult: 1 },
  high:     { label: 'High',     icon: '💰', mult: 3 },
  marathon: { label: 'Marathon', icon: '🏰', mult: 8 },
};

// game modes: how a match is won
export const GAME_MODES = {
  standard: { label: 'Conquest', icon: '⚔️', desc: 'Destroy every enemy base. The oldest argument in the room.' },
  regicide: { label: 'Regicide', icon: '👑', desc: 'Every toybox crowns a King. Guard yours; unseat theirs.' },
  koth:     { label: 'King of the Hill', icon: '🏔️', desc: 'Hold the golden Throne for 2 minutes. Thrones do not stay empty.' },
  sudden:   { label: 'Sudden Death', icon: '💥', desc: 'One Toy Chest each, no rebuilding. Lose it, and the lid closes.' },
};

// ---------------- campaign: "The Bedroom Wars" ----------------
// A three-act, 15-mission trilogy (+1 secret page). Each mission is just a curated match config fed to the
// normal engine (map, faction, mode, difficulty, resources) plus story text and
// optional light modifiers (player bonus units / enemy resource boost). No new
// engine mechanics — missions escalate via map, mode, difficulty and matchups.
export const CAMPAIGN = [
  {
    id: 'naptime', name: 'Naptime Uprising', icon: '😴',
    map: 'playmat', faction: 'classic', enemy: 'plush',
    gameMode: 'standard', difficulty: 'easy', startRes: 'standard',
    brief: 'The Kid went down for a nap at two, and by five past the Plushie Horde had '
      + 'claimed the sunny corner of the playmat — the corner nearest the pillow, the one '
      + 'every toy dreams of. Colonel Snug swears his people only want "a softer patch of '
      + 'rug." General Greenboots isn\'t buying it. Rally your Army Men, Commander, and '
      + 'take back the corner before the Kid wakes to find the room rearranged.',
    objective: 'Tuck the Horde back in: raze every enemy building — leave them nothing to rebuild from.',
    victory: 'The corner is retaken. Colonel Snug withdraws into the toy box with great '
      + 'dignity, which is difficult while being dragged by one ear. But listen — out the '
      + 'window, engines. The yard has heard about the fighting, and the yard has wheels.',
    defeat: 'Back in the box: soldiers on top, dignity somewhere underneath. Naps end. '
      + 'Grudges don\'t. Try again, Commander.',
    bonus: { soldier: 2 }, // a small friendly head start to ease newcomers in
  },
  {
    id: 'sandbox', name: 'Sandbox Skirmish', icon: '🛝',
    map: 'playground', faction: 'racers', enemy: 'bricks',
    gameMode: 'standard', difficulty: 'normal', startRes: 'high',
    brief: 'Three o\'clock. The Kid dug a fortress in the sandbox, then wandered off after '
      + 'an ice-cream truck — and thrones don\'t stay empty. By half past, Foreman Klik and '
      + 'his Snap-Bricks had moved in, snapping up walls faster than anyone believed '
      + 'possible, because nobody ever thinks about how fast a brick can click. You drive '
      + 'for the RC Racers now, Commander. You have the one thing bricks cannot build: '
      + 'speed. Overrun the sandbox before the last wall clicks shut.',
    objective: 'Outrun the masons: raze every enemy building — leave them nothing to rebuild from.',
    victory: 'The fortress is a racetrack now, and Foreman Klik is exactly one wall short '
      + 'of a comeback. Word spreads down the garden hose before the engines cool: tonight '
      + 'is bath night. And in the tub, Commander, wheels don\'t float.',
    defeat: 'Walled out. Klik built battlements out of your bumpers. Refuel, take the '
      + 'corner wider, and run it back.',
  },
  {
    id: 'bathtub', name: 'Bathtub Blockade', icon: '🛁',
    map: 'bathtub', faction: 'classic', enemy: 'racers',
    gameMode: 'standard', difficulty: 'normal', startRes: 'standard',
    brief: 'Seven o\'clock is bath hour, and tonight the tub never drained. A whole sea, '
      + 'steaming quietly in the middle of the bathroom — and the RC Racers got there '
      + 'first, paddling out on rubber ducks with little flags stuck in their bills. '
      + 'General Greenboots gets seasick standing on a damp sponge, but orders are orders: '
      + 'raise a Dock, launch your boats, and take the bath back before the water goes cold.',
    objective: 'Rule the waves: build a navy and raze every enemy building — leave them nothing to rebuild from.',
    victory: 'The duck armada is scrap and soap. As the last bubble pops, a rumor drifts '
      + 'in on the steam: the Plushies have raised a golden Throne on the hill in the '
      + 'yard. At dusk, everything soft gets brave.',
    defeat: 'Sunk with all hands — and you had so many hands. Bail out, wring out, go again.',
  },
  {
    id: 'hill', name: 'Hold the Hill', icon: '🏔️',
    map: 'playground', faction: 'bricks', enemy: 'plush',
    gameMode: 'koth', difficulty: 'hard', startRes: 'standard',
    brief: 'Dusk. The Kid was king of the hill right up until dinner was called, and '
      + 'thrones, as we have established, do not stay empty. Colonel Snug is marching the '
      + 'entire Plushie Horde up the yard, button eyes shining, to claim the golden seat '
      + '"for everyone who has ever been sat on." You build for the Snap-Bricks now, '
      + 'Commander. Wall the hill. Take the Throne. Hold it until the stars come out.',
    objective: 'Hold the golden Throne at the center for 2 minutes.',
    victory: 'Held. Colonel Snug tips his stitched cap from the bottom of the hill — he '
      + 'respects a good wall, and he is mostly stuffing anyway. Then the porch light dies. '
      + 'Lights out. And in the attic above the bedroom, something old drags itself to the '
      + 'war table.',
    defeat: 'The hill has a soft new king. Bricks bounce, Commander. Get back up there.',
  },
  {
    id: 'finale', name: 'The Final Bedtime', icon: '👑',
    map: 'attic', faction: 'plush', enemy: 'classic',
    gameMode: 'regicide', difficulty: 'hard', startRes: 'marathon',
    brief: 'Lights out. Above the bedroom, up where the boxes go when the Kid "outgrows '
      + 'things," the attic war table is set for the last battle of the Bedroom Wars. '
      + 'Every tribe has sent its King. Yours is an old bear with one eye and a lifetime '
      + 'of goodnights; theirs is the first soldier the Kid ever owned, and he has never '
      + 'lost. No one downstairs will ever know this war happened, Commander. Fight it '
      + 'anyway. Guard your King to the final stitch — and topple theirs.',
    objective: 'Protect your King. Defeat the enemy King.',
    victory: 'It ends the way toy wars always end: quietly, before morning. One toy box, '
      + 'one room, every tribe under the same lid — and the old bear back on the pillow\'s '
      + 'edge, right where the Kid left him. Sweet dreams, Commander. You are the story '
      + 'the toys tell now.',
    defeat: 'Your King came apart at the seam. Stitch him up and go again — old bears '
      + 'keep their promises, and he promised the Kid he\'d be there in the morning.',
    enemyBoost: 1.5, // the finale enemy starts richer for a proper boss fight
    endingArt: 'assets/campaign/end-act1.jpg', // Act I finale illustrated victory plate
  },

  // ---------------- ACT II: The Sleepover ----------------
  // The morning after the Bedroom Wars ended, a car pulled into the driveway.
  {
    id: 'crumbs', name: 'The Crumb Harvest', icon: '🥞',
    map: 'kitchen', faction: 'classic', enemy: 'bots',
    gameMode: 'standard', difficulty: 'normal', startRes: 'standard',
    brief: 'Saturday, first light. A car in the driveway, a cousin on the air mattress, '
      + 'and a backpack standing open at the foot of the bed like a dropped drawbridge. '
      + 'Out of it, all night long, came marching: Tin Bots. Factory-fresh, gleaming, '
      + 'polite as clockwork — and utterly ignorant of the truce. By breakfast they had '
      + 'annexed the kitchen table and were harvesting crumbs with terrible efficiency. '
      + 'General Greenboots put down his tiny binoculars and sighed the sigh of a soldier '
      + 'whose war just came back from the dead. Go introduce yourself, Commander.',
    objective: 'Contest the breakfast table: raze every enemy building — leave them nothing to rebuild from.',
    victory: 'The table is cleared — and the strangest thing, Commander: the Tin Bots '
      + 'retreated in perfect formation, saluting as they went. Whoever wound them up '
      + 'taught them manners. Greenboots salutes back before he can stop himself. '
      + 'Word arrives at noon: the newcomers have dug into the sofa. Colonel Snug\'s sofa.',
    defeat: 'Out-harvested at your own breakfast table. The bots didn\'t even gloat — '
      + 'they just ticked. Somehow that\'s worse. Regroup and go again, Commander.',
  },
  {
    id: 'sofa', name: 'Fortress of Cushions', icon: '🛋️',
    map: 'livingroom', faction: 'plush', enemy: 'bots',
    gameMode: 'sudden', difficulty: 'normal', startRes: 'high',
    brief: 'Noon. The sofa is Plushie holy ground — every cushion a castle, every crease '
      + 'a story, and somewhere deep in its springs, the legendary Lost Remote. Now the '
      + 'Tin Bots have trenched into the cushion line, and Colonel Snug has taken it '
      + 'personally, which for a bear stuffed with kindness is a frightening thing to '
      + 'watch. No second chances this time, Commander: one Toy Chest each, winner keeps '
      + 'the couch. The sofa remembers everyone who ever hid in it. Make it remember you.',
    objective: 'Sudden death: protect your Toy Chest and destroy theirs. No rebuilding.',
    victory: 'The cushion line holds! The bots withdraw with a synchronized bow, and Snug '
      + '— soft old diplomat that he is — bows back. "They fight like they\'re homesick," '
      + 'he says quietly. Keep that thought, Commander. Meanwhile the Racers report '
      + 'strangers in the canyon: the supply race is on.',
    defeat: 'The sofa has new management and your chest is under it, next to the remote. '
      + 'Dust off the lint, Commander, and take back the cushions.',
  },
  {
    id: 'canyonrun', name: 'The Canyon Run', icon: '🏁',
    map: 'canyon', faction: 'racers', enemy: 'bots',
    gameMode: 'standard', difficulty: 'hard', startRes: 'standard',
    brief: 'Afternoon. Between the toy chests runs the canyon — the last unclaimed supply '
      + 'line in the room, walls of stacked treasure, floor of open road. The Tin Bots '
      + 'want it for their marching columns; the RC Racers want it because it is, and '
      + 'this is the technical term, extremely fast. The bots have never lost a straight '
      + 'line in their lives, Commander. So don\'t give them one. Give them corners.',
    objective: 'Win the canyon: raze every enemy building — leave them nothing to rebuild from.',
    victory: 'Checkered flag! The bots stand at the finish line studying their own tire '
      + 'tracks like scripture — they\'ve never been beaten by anything before, and they '
      + 'seem almost grateful. That night, scouts hear ticking under the bed. Not '
      + 'marching. Searching. Something down there is looking for the way home.',
    defeat: 'Beaten on your own road — the bots took every corner like they\'d measured '
      + 'it. They probably had. Remeasure your nerve and race it back, Commander.',
  },
  {
    id: 'nightlight', name: 'The Nightlight', icon: '🌙',
    map: 'underbed', faction: 'bots', enemy: 'classic',
    gameMode: 'koth', difficulty: 'hard', startRes: 'standard',
    brief: 'Night. Under the bed, where the dust drifts like snow over everything the '
      + 'room forgot, the truth finally comes out: the Tin Bots were never invading. '
      + 'Their whole world is a backpack, and the backpack is leaving Sunday. They fight '
      + 'for the one bright thing under here — the nightlight\'s glow — because a signal '
      + 'fire is how lost toys say WE ARE STILL HERE. Tonight, Commander, you wind their '
      + 'key. General Greenboots is coming down to douse the light, and he does not '
      + 'trust newcomers in the dark. Hold it anyway. Homesick is not the same as enemy.',
    objective: 'Hold the golden Throne in the nightlight\'s glow for 2 minutes.',
    victory: 'The light holds, and by it, at last, everyone can see: rust spelling out '
      + 'a child\'s name on every little tin chest. Greenboots lowers his rifle and '
      + 'offers the Tin Bot captain his hand — the full six seconds of it. "Nobody\'s '
      + 'lost in my room," he says. "Not on my watch." One war left, Commander. The '
      + 'shelf has a king.',
    defeat: 'The light went out, and the dark under a bed is the oldest dark there is. '
      + 'Wind the key, Commander. Lost toys don\'t stay lost — not while you\'re here.',
  },
  {
    id: 'shelfking', name: 'The Shelf King', icon: '📚',
    map: 'bookshelf', faction: 'bots', enemy: 'bricks',
    gameMode: 'regicide', difficulty: 'hard', startRes: 'marathon',
    brief: 'Sunday morning, and the treachery is architectural. While every tribe was '
      + 'busy fighting strangers, Foreman Klik was quietly stacking himself a kingdom on '
      + 'the bookshelf — the high country, the room\'s own mountain range — and at dawn '
      + 'he crowned himself atop the dictionary, because no one argues with a dictionary. '
      + 'The tribes held a council on the pillow and voted to send you, Commander — the '
      + 'newcomers, the wind-up strangers, the toys with a Sunday deadline. Belonging '
      + 'isn\'t given in this room. It\'s earned a shelf at a time. Guard your King. '
      + 'Unseat his.',
    objective: 'Protect your King. Defeat Foreman Klik\'s King on the high shelves.',
    victory: 'The crown clicks apart into ordinary bricks, and Klik takes the long view '
      + 'from the poetry section — even he admits the throne was "structurally vain." '
      + 'And Sunday comes, as Sundays do. The car pulls away with the backpack in the '
      + 'window... one soldier short. On the pillow, polished and gleaming, one small '
      + 'Tin Bot stands where the old bear can keep an eye on him. Left behind on '
      + 'purpose, Commander. That\'s how a toybox grows: one goodbye at a time. '
      + 'The Bedroom Wars are over. The bedroom, at last, is one room.',
    defeat: 'Klik keeps his crown and the dictionary now has a moat. Wind your key '
      + 'tight, Commander — Sunday isn\'t over, and neither are you.',
    enemyBoost: 1.4, // the Shelf King starts entrenched
    endingArt: 'assets/campaign/end-act2.jpg', // Act II finale illustrated victory plate
  },

  // ---------------- ACT III: The Yard Sale ----------------
  // Spring came, and with it the worst words a toy can hear: "we should
  // really go through some of this stuff."
  {
    id: 'tagged', name: 'The Price Tags', icon: '🏷️',
    map: 'playground', faction: 'classic', enemy: 'racers',
    gameMode: 'standard', difficulty: 'normal', startRes: 'standard',
    brief: 'Spring cleaning came on a Saturday, the way disasters do. By nine the '
      + 'toybox was on the lawn, by ten there were folding tables, and by half past '
      + 'there were stickers — little round suns of doom, priced to move. Commander, '
      + 'the lawn belongs to the Yard Toys: sun-bleached, sprinkler-hardened, and '
      + 'certain that everything the tables touch is theirs by right. Tear off your '
      + 'tags. Take back the grass. Nobody is FOR SALE today.',
    objective: 'Destroy the Yard Toys\' base before the sale opens.',
    victory: 'The stickers come off easier than anyone dared hope — a little spit, a '
      + 'lot of stubbornness. The Yard Toys retreat to their sprinkler and pretend the '
      + 'whole thing was a misunderstanding. But the tables are still standing, '
      + 'Commander, and the first cars are already pulling in...',
    defeat: 'Tagged, tabled, and very nearly sold. Peel yourself off the felt, '
      + 'Commander — the sale doesn\'t open till noon, and stubbornness is free.',
  },
  {
    id: 'boxed', name: 'The Cardboard Dark', icon: '📦',
    map: 'underbed', faction: 'plush', enemy: 'bots',
    gameMode: 'koth', difficulty: 'normal', startRes: 'standard',
    brief: 'Not everyone made it off the tables. Half the tribe went into a cardboard '
      + 'box marked for the sale — and the box was TAPED. Inside, in the brown dark '
      + 'between wads of newspaper, live the Forgotten: attic toys boxed so long ago '
      + 'they wind themselves now, and they no longer remember what daylight is for. '
      + 'There is one blade of light where the tape has lifted, Commander. Hold it. '
      + 'Everything that stands in the light gets remembered.',
    objective: 'Hold the light — keep the Throne for 2 minutes.',
    victory: 'The flaps give. Light pours in like a bath being drawn, and the '
      + 'Forgotten shade their little eyes and remember — birthdays, rug burns, the '
      + 'smell of crayons. They hold the flap open themselves as your tribe climbs '
      + 'out. "Send someone back for us," they whisper. You will, Commander. You will.',
    defeat: 'The dark closed over the light like a lid. Wind tight, breathe slow, '
      + 'find the blade of light again — no toy stays boxed while you\'re still '
      + 'winding, Commander.',
  },
  {
    id: 'bargain', name: 'The Bargain Bin', icon: '🪙',
    map: 'kitchen', faction: 'bricks', enemy: 'classic',
    gameMode: 'sudden', difficulty: 'hard', startRes: 'standard',
    brief: 'Noon, and the sale is roaring. The worst place in it is the bargain bin: '
      + 'a plastic tub where toys from three different houses lie jumbled leg-over-ear '
      + 'under a sign that means EVERYTHING MUST GO. The strangers in the bin want out '
      + 'the only way they can see — over your tribe. One bin, one exit, and nothing '
      + 'the shoppers knock down gets rebuilt. Guard your Toy Chest like it\'s the '
      + 'last seat in the lifeboat, Commander. Because it is.',
    objective: 'Sudden Death: smash their Toy Chest. Yours cannot be rebuilt.',
    victory: 'When the dust and pocket change settle, your tribe holds the bin. The '
      + 'strangers\' chest lies in pieces, and the strangers surrender with surprising '
      + 'grace — enemies one minute, bunkmates the next. "No hard feelings," their '
      + 'sergeant shrugs. "Bins make animals of everyone."',
    defeat: 'Fifty cents. Your whole chest went for fifty cents, Commander. Climb '
      + 'back into the bin and make the next hour cost them everything they have.',
  },
  {
    id: 'stranger', name: 'The Stranger\'s Wagon', icon: '🛒',
    map: 'bookshelf', faction: 'racers', enemy: 'bots',
    gameMode: 'regicide', difficulty: 'hard', startRes: 'standard',
    brief: 'A buyer came with a red wagon and exact change, and now six of ours are '
      + 'rolling away toward a stranger\'s display shelf. The wagon toys are not cruel '
      + '— just chrome, mint-in-box, and led by a Prize Robot who has never once been '
      + 'played with. He calls your friends "acquisitions." Get on that wagon, '
      + 'Commander. Nobody who has been LOVED retires to a display shelf.',
    objective: 'Protect your King. Topple the Prize Robot.',
    victory: 'The Prize Robot topples with a sound like a cash register apologizing. '
      + 'Freed from his gleam, the wagon toys turn their own scuffs to the light with '
      + 'something like wonder. "We\'re... allowed to get dirty?" they ask. Load up, '
      + 'Commander — everyone rides home in the wagon we just won.',
    defeat: 'The wagon rolls on with our friends aboard. After it, Commander — a '
      + 'display shelf is just a bookshelf that gave up, and NOTHING of ours retires '
      + 'today.',
    enemyBoost: 1.2, // mint-in-box means well-funded
  },
  {
    id: 'wayhome', name: 'The Long Way Home', icon: '🏡',
    map: 'canyon', faction: 'classic', enemy: 'racers',
    gameMode: 'standard', difficulty: 'hard', startRes: 'marathon',
    brief: 'Dusk. The sale is over, the tables are folded, and every toy we love is '
      + 'out of the boxes and bins — but the yard between here and the bedroom window '
      + 'is a wilderness. The sidewalk crack yawns like a canyon. The garden hose '
      + 'winds like a river. The porch light burns impossibly far away, like a '
      + 'lighthouse. And the Yard Toys have come out for one last word about '
      + 'trespassing. This is the whole tribe, Commander — every toy we saved, '
      + 'marching together. Get them home. Get every last one of them home.',
    objective: 'Break the Yard Toys\' last blockade and clear the road home.',
    victory: 'The window. The sill. The old bear\'s paw reaching down, and toy after '
      + 'toy hauled up into the lamplight until the toybox is full — fuller, somehow, '
      + 'than before the sale. Three wars, Commander: one for the room, one for '
      + 'belonging, and one, at last, for home. The lid closes gently. The story '
      + 'doesn\'t end — it just goes to sleep. And every kid in the world knows what '
      + 'toys do while you\'re sleeping.',
    defeat: 'The porch light went out before we reached it. Make camp in the '
      + 'flowerpot, Commander — at first light we march again, and the window isn\'t '
      + 'going anywhere.',
    enemyBoost: 1.5, // the last blockade is the biggest
    endingArt: 'assets/campaign/end-act3.jpg', // trilogy-closing homecoming plate
  },

  // ---------------- ACT IV — THE GREAT OUTDOORS ----------------
  // (beyondTrilogy: these pages never gate NG+ or the secret chapters)
  {
    id: 'doorstep', name: 'Past the Welcome Mat', icon: '🚪', beyondTrilogy: true,
    map: 'playground', faction: 'classic', enemy: 'racers',
    gameMode: 'standard', difficulty: 'normal', startRes: 'standard',
    brief: 'The headcount came up one short. Bun-Bun — the Kid\'s oldest plush '
      + 'rabbit, the one who was there before ANY of us — never made it in from '
      + 'the yard sale. He is out there somewhere past the door, in the country '
      + 'where rain happens. General Greenboots musters an expedition on the '
      + 'welcome mat at first light. The backyard tribes — wild toys, sun-bleached '
      + 'and half-feral — do not recognize our flags out here. Teach them the '
      + 'flags, Commander. Then find that rabbit.',
    objective: 'Establish the expedition: raze the wild toys\' yard camp.',
    victory: 'The wild toys kneel — then, being toys, immediately offer everyone '
      + 'juice. They saw Bun-Bun, Commander: carried off toward the sandbox by '
      + 'something with wheels, two nights ago. The trail is warm. The grass is '
      + 'enormous. The expedition marches at dawn.',
    defeat: 'Back to the welcome mat — but no toy quits a rescue. Re-muster, '
      + 'Commander. Bun-Bun has waited two nights; he can believe in us one more.',
  },
  {
    id: 'dunes', name: 'The Sandbox Crossing', icon: '🏖️', beyondTrilogy: true,
    map: 'sandbox', faction: 'bricks', enemy: 'bots',
    gameMode: 'standard', difficulty: 'normal', startRes: 'standard',
    brief: 'The sandbox is a desert with a wooden horizon, and Foreman Klik\'s '
      + 'engineers have never been happier or more afraid. The dunes shift. The '
      + 'sand swallows roads whole. And a column of Tin Bots is already digging '
      + 'on the far rim — Cogsworth wants Bun-Bun too, "FOR THE ARCHIVE." Cross '
      + 'the dunes first, Commander. Build fast; the sand does not wait.',
    objective: 'Cross the dunes: destroy the Bots\' dig site on the far rim.',
    victory: 'The dig site topples into its own excavation, and Klik plants a '
      + 'flag on the tallest dune — it falls over immediately, which he logs as '
      + '"structurally honest ground." In the pit the Bots were digging: one '
      + 'button eye. Bun-Bun\'s. He was here. The garden is next.',
    defeat: 'The dunes keep the field. Klik re-surveys, unbothered: "Sand is '
      + 'just bricks that haven\'t decided yet." March again, Commander.',
  },
  {
    id: 'gardenwar', name: 'The Garden Siege', icon: '🌻', beyondTrilogy: true,
    map: 'garden', faction: 'knights', enemy: 'racers',
    gameMode: 'koth', difficulty: 'hard', startRes: 'standard',
    brief: 'The garden is a kingdom already — sunflower towers, terraced ramparts, '
      + 'and a gnome older than the fence who has watched everything and said '
      + 'nothing. Sir Hector takes one look and unfurls every banner he owns: '
      + '"THIS is proper country." The Racers hold the high beds and the throne '
      + 'of stepping-stones, and they saw where Bun-Bun was taken. Take the hill '
      + 'and they\'ll talk. Knights do their best work uphill, Commander.',
    objective: 'Hold the garden throne for two minutes. Make the gnome proud.',
    victory: 'The banner holds. The Racers spill it all mid-surrender: the wheeled '
      + 'thing took Bun-Bun to the Old Oak at the yard\'s end — the wild country. '
      + 'Sir Hector knights the gnome on the spot. The gnome, as ever, says '
      + 'nothing. But he looks pleased. The whole garden looks pleased.',
    defeat: 'The terraces change paws again. "A siege," says Sir Hector, helmet '
      + 'dented, half-paint gleaming, "is just patience wearing armor." Again.',
  },
  {
    id: 'washout', name: 'The Sprinkler Hour', icon: '💦', beyondTrilogy: true,
    map: 'sandbox', faction: 'classic', enemy: 'bots',
    allies: [{ faction: 'knights' }], foes: [{ faction: 'racers' }],
    gameMode: 'sudden', difficulty: 'hard', startRes: 'high',
    brief: 'The forecast is on the fridge and the forecast says DOOM: the '
      + 'sprinklers run at dawn. Anything still in the yard gets the flood. The '
      + 'expedition is out of time and out of quiet options — so Greenboots and '
      + 'Sir Hector make camp side by side in the sandbox, banners knotted '
      + 'together, while the Bots and the last Racer holdouts make their own '
      + 'pact across the dunes. One chest each. No rebuilding. Whoever still '
      + 'stands when the pipes groan owns the road to the Old Oak.',
    objective: 'Alliance Sudden Death: both rival Toy Chests, before the water comes.',
    victory: 'The last rival chest folds as the pipes give their first warning '
      + 'gurgle — and both armies run for the deck TOGETHER, knights carrying '
      + 'army men, army men carrying knight banners. From the rail they watch '
      + 'the flood take the dunes. "Good sand," says Klik\'s liaison, misty. '
      + 'The road to the Oak is open, Commander. One more march.',
    defeat: 'The water wins the field before you do. From the deck, soaked and '
      + 'furious and alive, the alliance watches the dunes drown. At dusk the '
      + 'sand will be dry, and so will the resolve. Again, Commander.',
    enemyBoost: 1.15,
  },
  {
    id: 'oakcrown', name: 'The Old Oak', icon: '🌳', beyondTrilogy: true,
    map: 'oldoak', faction: 'classic', enemy: 'racers',
    gameMode: 'koth', difficulty: 'hard', startRes: 'standard',
    brief: 'Dusk, at the end of the yard, under the tree that was here before '
      + 'the house. Bun-Bun sits in the high roots like a king in exile — hauled '
      + 'here by a feral RC monster truck that decided, in its one wheeled heart, '
      + 'that the softest toy should live in the safest place. It means well. It '
      + 'will not give him back. The wild toys of the deep yard hold the hill, '
      + 'the porch light is coming on, and somewhere behind you the window is '
      + 'waiting. Take the hill, Commander. Hold it under the oldest branches in '
      + 'the world, and bring the first toy home last.',
    objective: 'Take and hold the hill beneath the Old Oak. Bring Bun-Bun home.',
    victory: 'The hill holds, and the monster truck — flanked, exhausted, '
      + 'strangely relieved — nudges Bun-Bun down the roots itself. The march '
      + 'home crosses the whole dark yard: garden, dunes, welcome mat, window. '
      + 'The old bear\'s paw reaches down one more time. And when the lid closes '
      + 'tonight it closes on EVERYONE, Commander — the room, the Kingdom, and '
      + 'one rabbit who now tells the wildest bedtime stories of all. The book '
      + 'has a backyard now. The light is still on.',
    defeat: 'The Oak keeps its guest one more night. The porch light hums. '
      + 'Bun-Bun, high in the roots, waves — patient as only the oldest toy can '
      + 'be. Dawn, Commander. We climb again at dawn.',
    enemyBoost: 1.35,
  },

  // ---------------- THE MIDNIGHT CHAPTER ----------------
  // A secret sixteenth page. It does not exist until the trilogy is finished —
  // then it appears at the bottom of the book, the way midnight appears at the
  // bottom of a day.
  {
    id: 'midnight', name: 'The Midnight Chapter', icon: '🕛', secret: true,
    map: 'attic', faction: 'classic', enemy: 'bots',
    gameMode: 'regicide', difficulty: 'hard', startRes: 'marathon',
    brief: 'You should be asleep. The room should be asleep. But on the first night '
      + 'after the last story, the attic hatch opens by itself, and down the ladder '
      + 'comes a cold ticking. The Forgotten have wound each other, every toy that '
      + 'was ever boxed and never sent for, led by the First Forgotten — a king with '
      + 'no scuffs, no name, and no one\'s initials on his foot. He has not come for '
      + 'the room. He has come for the remembering. Tonight there are no tribes, '
      + 'Commander. Every toy you ever led fights under one flag, and the flag is a '
      + 'promise: NO ONE GETS FORGOTTEN. Guard your King. Unmake theirs.',
    objective: 'Protect your King. Unwind the First Forgotten.',
    victory: 'The First Forgotten winds down slowly, almost gratefully, and in the '
      + 'quiet after his last tick the attic exhales a hundred years of dust. You '
      + 'carry them all downstairs — every Forgotten, every strange old shape — and '
      + 'the toybox, which has always been bigger on the inside where it counts, '
      + 'makes room. And that is the whole secret, Commander, the one under every '
      + 'story this room ever told: a toy is never too old, too odd, or too broken. '
      + 'Only ever too far from the box. Not anymore. The last page turns itself. '
      + 'Sleep well. You earned the whole night.',
    defeat: 'The ticking recedes up the ladder, patient as winter. Wind your armies, '
      + 'Commander, and climb again — midnight comes every night, and so can you.',
    enemyBoost: 1.7, // a hundred years of stored patience
    endingArt: 'assets/campaign/end-midnight.jpg',
  },
  {
    id: 'alliance', name: 'The Toybox Alliance', icon: '🤝', secret: true, beyondTrilogy: true,
    map: 'livingroom', faction: 'classic', enemy: 'bots',
    allies: [{ faction: 'knights' }], foes: [{ faction: 'bricks' }],
    gameMode: 'standard', difficulty: 'hard', startRes: 'high',
    brief: 'After the Midnight Chapter, the room tried something it had never tried '
      + 'in all its wars: trusting. General Greenboots sends a runner to the Castle '
      + 'Kingdom with three words in crayon — WITH US, TONIGHT? — and by lights-out '
      + 'Sir Hector\'s knights are camped on your rug, banners up, kettles on. '
      + 'Across the living room, Captain Cogsworth and Foreman Klik have made their '
      + 'own arithmetic: two armies, one assembly line, no sentiment. The first '
      + 'alliance war. Two flags on each side of the holiday rug, and one lesson '
      + 'nobody has learned yet: how to share a victory.',
    objective: 'You and the Castle Kingdom against Bots and Bricks — raze every rival building, together.',
    victory: 'When the last rival wall comes down, nobody is sure whose cheer goes '
      + 'first — so they go together, which was the whole point. Greenboots pins his '
      + 'own medal on a knight. Sir Hector knights a plastic private with the flat '
      + 'of his half-painted sword. Somewhere in the wreckage, Klik and Cogsworth '
      + 'shake on a rematch, and the room files the night under a brand-new word: '
      + 'allies. Some wars end with a winner, Commander. The best ones end with a team.',
    defeat: 'The alliance holds even in defeat — knights carrying army men off the '
      + 'rug, army men carrying knights. "Same side next time too," Sir Hector says, '
      + 'and that is not a consolation, Commander. That is a headstart.',
    enemyBoost: 1.15,
  },
  {
    id: 'zero', name: 'Toy Box Zero', icon: '📦', secret: true, zeroEra: true, beyondTrilogy: true,
    needsAllStories: true, // every Bedtime Story earned — the room trusts you with page one
    map: 'playmat', faction: 'classic', enemy: 'plush',
    gameMode: 'sudden', difficulty: 'hard', startRes: 'lean',
    brief: 'This is the page under all the other pages, from before the room had '
      + 'colors. One rug. One box. Two toys who loved the same Kid: a green private '
      + 'named Greenboots, first of his batch, and a soft new bear called Snug with '
      + 'both button eyes still on. The Kid could only carry one to grandma\'s house. '
      + 'The bear got the suitcase. The soldier got the windowsill — and a whole '
      + 'week to decide what kind of toy he was going to be about it. He decided '
      + 'wrong first. This is that war: one chest each, no rebuilding, no tribes, '
      + 'no names for what they were feeling yet. The room watched, and learned '
      + 'everything it knows.',
    objective: 'The first war: one Toy Chest each, no rebuilding. Take theirs.',
    victory: 'The bear\'s box closes and the rug goes quiet, and Greenboots stands '
      + 'in the sepia light feeling — nothing like victory. A week later the '
      + 'suitcase came home, and Snug walked straight past the windowsill garrison '
      + 'and hugged him, one button eye already loose from missing everyone. They '
      + 'never spoke of the war. They built the toybox rules instead, together: no '
      + 'toy left boxed, every quarrel ends by morning, and the room remembers so '
      + 'the toys can forgive. You have read every page now, Commander. This was '
      + 'the first one. It was always about the two of them.',
    defeat: 'The soldier\'s chest closes with him inside it — and that, the old '
      + 'toys say, is where the vow began: the bear who won sat on the lid all '
      + 'night so his rival would not be alone in the dark. Open the page again, '
      + 'Commander. First wars deserve second tellings.',
  },
];

// ---------------- scripted mission moments ----------------
// Each campaign mission gets 2-3 one-shot beats: story lines mid-battle,
// reinforcement drops, and telegraphed enemy surges. `at` is sim-seconds.
// types: (none)=story line · spawn {unit,n,owner} · boost {owner,res}
export const MISSION_EVENTS = {
  naptime: [
    { at: 150, text: 'Under the bed, something soft shifted its weight. The Horde knows you are here now.' },
    { at: 300, type: 'spawn', unit: 'soldier', n: 3, owner: 0, kind: 'info',
      text: 'Reinforcements! Three soldiers who slept through the uprising report for duty, deeply embarrassed.' },
  ],
  sandbox: [
    { at: 180, text: 'Sand gets into everything, the storybooks warn. Especially plans.' },
    { at: 360, type: 'boost', owner: 1, res: { snacks: 150, blocks: 150 }, kind: 'attack',
      text: 'The masons found a buried juice-box cache — Snap-Brick coffers are suddenly full!' },
    { at: 540, type: 'spawn', unit: 'raider', n: 2, owner: 0, kind: 'info',
      text: 'Two wind-up raiders roll in from the swing set, already ignoring your orders slightly.' },
  ],
  bathtub: [
    { at: 200, text: 'The water remembers every armada. It is beginning to remember yours.' },
    { at: 380, type: 'spawn', unit: 'duckboat', n: 2, owner: 0, kind: 'info',
      text: 'The rubber fleet answers the call — two Duck Raiders squeak into formation!' },
  ],
  hill: [
    { at: 180, text: 'Hold a hill long enough, the old toys say, and the hill starts holding you back.' },
    { at: 420, type: 'spawn', unit: 'lancer', n: 3, owner: 1, kind: 'attack',
      text: 'Pogo Lancers vault the pillow ridge — the Bricks want their hill back!' },
    { at: 640, type: 'spawn', unit: 'bear', n: 1, owner: 0, kind: 'info',
      text: 'A Big Bear Hug lumbers up the slope to join you. The hill creaks respectfully.' },
  ],
  finale: [
    { at: 150, text: 'The attic holds its breath. Every retired toy is watching this one.' },
    { at: 400, type: 'boost', owner: 1, res: { snacks: 250, blocks: 250 }, kind: 'attack',
      text: 'The first soldier the Kid ever owned calls in every favor the attic owes him.' },
    { at: 700, type: 'spawn', unit: 'hero', n: 1, owner: 0, kind: 'info',
      text: 'Out of a dusty shoebox steps a hero the storybooks thought was lost. Not tonight.' },
  ],
  crumbs: [
    { at: 160, text: 'The Tin Bots harvest in perfect rows. It would be beautiful if it weren\'t YOUR table.' },
    { at: 380, type: 'spawn', unit: 'zapbot', n: 3, owner: 1, kind: 'attack',
      text: 'A fresh column of Zap Bots marches out of the backpack, crackling politely.' },
  ],
  sofa: [
    { at: 200, text: 'Cushion country: every ridge is soft, every ambush softer.' },
    { at: 450, type: 'spawn', unit: 'medic', n: 2, owner: 0, kind: 'info',
      text: 'Two Medics arrive from the armrest with fresh thread and no patience for heroics.' },
  ],
  canyonrun: [
    { at: 150, text: 'In the canyon, the racing line IS the battle line.' },
    { at: 350, type: 'spawn', unit: 'drone', n: 2, owner: 0, kind: 'info',
      text: 'Whirly Drones lift off the shelf to fly your colors down the gap.' },
    { at: 600, type: 'boost', owner: 1, res: { buttons: 200 }, kind: 'attack',
      text: 'The Bots requisition a coin jar. Their war chest just got heavier.' },
  ],
  nightlight: [
    { at: 180, text: 'The nightlight flickers. Everything under the bed leans a little closer.' },
    { at: 420, type: 'spawn', unit: 'soldier', n: 4, owner: 1, kind: 'attack',
      text: 'Old guard Army Men emerge from a forgotten slipper — the dark keeps its veterans.' },
  ],
  shelfking: [
    { at: 200, text: 'Klik\'s crown clicks softly on the dictionary, counting its own studs.' },
    { at: 450, type: 'spawn', unit: 'golem', n: 2, owner: 1, kind: 'attack',
      text: 'The Shelf King commits his royal guard: two Brick Golems descend the poetry section.' },
    { at: 700, type: 'spawn', unit: 'titanbot', n: 1, owner: 0, kind: 'info',
      text: 'Your engineers finish a field-built Titan Bot from shelf scraps. It salutes with the wrong arm.' },
  ],
  tagged: [
    { at: 150, text: 'Another car pulls in. The stickers glitter like little round dooms.' },
    { at: 400, type: 'spawn', unit: 'raider', n: 3, owner: 1, kind: 'attack',
      text: 'Yard Toy raiders sweep in from the sprinkler line, sun-bleached and certain.' },
  ],
  boxed: [
    { at: 180, text: 'Somewhere above, tape screeches. Another box is being sealed.' },
    { at: 400, type: 'spawn', unit: 'sockpuppet', n: 3, owner: 0, kind: 'info',
      text: 'Three Sock Puppets wriggle in through a gap in the flaps. The dark is less dark already.' },
  ],
  bargain: [
    { at: 160, text: 'A shopper\'s shadow crosses the bin. Everyone holds very, very still.' },
    { at: 380, type: 'boost', owner: 1, res: { snacks: 200, blocks: 100 }, kind: 'attack',
      text: 'The strangers barter with the next bin over — their supplies are restocked.' },
    { at: 620, type: 'spawn', unit: 'golem', n: 1, owner: 0, kind: 'info',
      text: 'From loose bricks at the bin\'s bottom, your masons quietly assemble a friend.' },
  ],
  stranger: [
    { at: 180, text: 'The Prize Robot polishes itself. It has never once needed polishing.' },
    { at: 420, type: 'spawn', unit: 'zapbot', n: 4, owner: 1, kind: 'attack',
      text: 'Mint-in-box escorts deploy from the wagon in factory formation.' },
    { at: 650, type: 'spawn', unit: 'dragster', n: 2, owner: 0, kind: 'info',
      text: 'Two freed Racers roar back down the sidewalk to fight for the wagon they escaped.' },
  ],
  wayhome: [
    { at: 200, text: 'The porch light holds steady across the dark lawn — a lighthouse that knows your name.' },
    { at: 450, type: 'spawn', unit: 'bear', n: 1, owner: 0, kind: 'info',
      text: 'A bear the sale forgot shakes the grass from its fur and falls in beside you.' },
    { at: 750, text: 'Almost home. The window is open. The old bear is waiting. March, Commander.' },
  ],
  midnight: [
    { at: 90, text: 'Tick. Tick. The attic counts along with the war, and it has been counting far longer than you.' },
    { at: 240, type: 'spawn', unit: 'golem', n: 1, owner: 0, kind: 'info',
      text: 'The Snap-Bricks answer the one flag: a Golem assembles itself from the trilogy\'s spare pieces.' },
    { at: 400, type: 'spawn', unit: 'bear', n: 1, owner: 0, kind: 'info',
      text: 'Colonel Snug sends his best hug up the ladder. It has never once missed.' },
    { at: 500, type: 'spawn', unit: 'forgotten', n: 3, owner: 1, kind: 'attack',
      text: 'Three Forgotten Ones step out of the shadow between boxes, keys turning all by themselves.' },
    { at: 560, type: 'spawn', unit: 'dragster', n: 1, owner: 0, kind: 'info',
      text: 'Chief Nitro donates the tribe\'s fastest bad idea to the cause.' },
    { at: 700, type: 'spawn', unit: 'zapbot', n: 2, owner: 0, kind: 'info',
      text: 'Two Tin Bots climb to face the Forgotten — their own oldest fear — with their little eyes glowing steady.' },
    { at: 800, type: 'spawn', unit: 'forgotten', n: 4, owner: 1, kind: 'attack',
      text: 'More of them. The attic has been saving toys the way winter saves snow.' },
    { at: 850, type: 'boost', owner: 1, res: { snacks: 300, blocks: 300, buttons: 200 }, kind: 'attack',
      text: 'The First Forgotten opens a box that was never unpacked. A hundred years of birthday presents answer to him now.' },
    { at: 1000, type: 'spawn', unit: 'hero', n: 1, owner: 0, kind: 'info',
      text: 'And at the darkest tick, a hero climbs the ladder last — the way heroes always do, so no one is behind them.' },
    { at: 1100, type: 'spawn', unit: 'forgottenking', n: 1, owner: 1, kind: 'attack',
      text: 'The throne of boxes stands empty. The First Forgotten walks. Every tick of his key is a year nobody came — and he is done counting.' },
  ],
  alliance: [
    { at: 60, text: 'Two camps, one rug. The knights keep saluting your army men; your army men keep saluting back. Nobody has told either side they can stop.' },
    { at: 300, type: 'spawn', unit: 'knight', n: 2, owner: 1, kind: 'info',
      text: 'Sir Hector sends two of his own to stand your wall — "borrowed vows," he calls it.' },
    { at: 600, text: 'Across the rug, Klik is building and Cogsworth is counting. An alliance of ledgers against an alliance of promises.' },
    { at: 900, type: 'boost', owner: 2, res: { blocks: 200, buttons: 150 }, kind: 'attack',
      text: 'The rival pact pools its pockets — one assembly line, two armies, zero sentiment.' },
    { at: 1200, text: 'A knight falls covering an army man he met tonight. The room writes the word "allies" in its book and underlines it twice.' },
  ],
  doorstep: [
    { at: 60, text: 'The door closes behind the expedition. For the first time in any story the room ever told, the ceiling is weather.' },
    { at: 300, text: 'A breeze crosses the column and every flag learns what flags are FOR. Even the veterans stop marching for a second.' },
    { at: 700, type: 'spawn', unit: 'scout', n: 2, owner: 0, kind: 'info',
      text: 'Two wild scouts defect to the expedition — sun-bleached, barefoot, grinning. They know where the sandbox road runs.' },
  ],
  dunes: [
    { at: 90, text: 'The sand gets into everything. Klik\'s engineers file seventeen complaints and one love letter.' },
    { at: 420, text: 'A dune moved in the night. Nobody saw it happen. The scouts have started naming them, which feels safer.' },
    { at: 800, type: 'boost', owner: 1, res: { buttons: 150, marbles: 80 }, kind: 'attack',
      text: 'The Bots\' excavator strikes a vein of lost marbles — "FUNDING," Cogsworth announces, "FOR THE ARCHIVE."' },
  ],
  gardenwar: [
    { at: 75, text: 'The sunflowers turn slowly to watch the armies pass. Sir Hector salutes every single one. It takes a while.' },
    { at: 360, text: 'The gnome has seen four hundred summers of this garden. The knights have adopted him. He remains unconsulted on this.' },
    { at: 780, type: 'spawn', unit: 'knight', n: 2, owner: 0, kind: 'info',
      text: 'Two knights arrive late, breathless, carrying a tomato like a war trophy. Reinforcements — and lunch.' },
  ],
  washout: [
    { at: 60, text: 'Somewhere under the yard, a pipe clears its throat. Every toy on the field pretends not to have heard it.' },
    { at: 480, text: 'The allied camp shares one kettle between two armies. This, the narrator notes, is how civilizations actually start.' },
    { at: 900, text: 'The sprinkler heads rise an inch out of the grass, curious. Time, Commander, is now officially weather.' },
  ],
  oakcrown: [
    { at: 90, text: 'Bun-Bun waves from the roots — unhurried, unafraid. The oldest toy in the world knows exactly who is coming for him.' },
    { at: 420, type: 'spawn', unit: 'monster', n: 1, owner: 1, kind: 'attack',
      text: 'The feral monster truck descends the hill, engine full of thunder and heartbreak. It just wanted to keep something soft SAFE.' },
    { at: 800, text: 'The porch light blinks on across the yard, and the whole battle glows amber for a heartbeat. Nearly bedtime. Nearly home.' },
  ],
  zero: [
    { at: 45, text: 'The rug is smaller than you remember. Everything was, back then — except the feelings.' },
    { at: 240, text: 'Across the mat, the bear drills his stuffing into ranks. He is not angry. That is what makes him terrifying.' },
    { at: 540, text: 'No medics yet. No walls yet. Nobody has invented mercy rules for toy wars — that comes after tonight, because of tonight.' },
    { at: 900, text: 'The lamp holds its light very still, the way you hold your breath at the part of the story where the friends fight.' },
  ],
};

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
    desc: 'The first toys, and the steadiest. No bonuses, no weaknesses — just discipline.',
    mods: {},
    commander: {
      name: 'General Greenboots', title: 'The First Soldier', portrait: 'assets/ui/cmdr-classic.jpg',
      bio: 'Molded in the very first batch, boots already laced. He has stood at attention on windowsills through a hundred bedtimes and never once broken formation. Fights by the book because he wrote the book — in crayon, on the back of the box.',
    },
  },
  bricks: {
    label: 'Snap-Bricks', icon: '🧱',
    desc: 'Builders to the last stud. Buildings +25% HP, workers build 25% faster — but infantry march 3% slower.',
    mods: { buildingHp: 1.25, buildRate: 1.25, speedInfantry: 0.97 }, // battery-tuned: was 31% WR
    commander: {
      name: 'Foreman Klik', title: 'Master of the Stud', portrait: 'assets/ui/cmdr-bricks.jpg',
      bio: 'Believes there is no problem a wall cannot solve, and no wall that cannot be one brick taller. Sorts his troops by color before every battle. To Klik, victory and good construction are the exact same thing — click, done.',
    },
  },
  plush: {
    label: 'Plushie Horde', icon: '🧸',
    desc: 'Soft outside, unbeatable inside. All toys +12% HP, medics heal 50% more — but everyone waddles 6% slower.',
    mods: { unitHp: 1.12, healRate: 1.5, speedInfantry: 0.94, speedWheels: 0.94 },
    commander: {
      name: 'Colonel Snug', title: 'The Well-Loved', portrait: 'assets/ui/cmdr-plush.jpg',
      bio: 'One button eye, one stitched-X, both kind. Lost the eye saving a smaller toy from under the bed and calls it the best trade he ever made. Counts every head twice after a battle. His only standing order: hugs are mandatory.',
    },
  },
  racers: {
    label: 'RC Racers', icon: '🏎️',
    desc: 'Born at the finish line. Wheeled toys +15% speed and +1 attack — but workers gather 3% slower.',
    mods: { speedWheels: 1.15, atkVehicle: 1, gather: 0.97 }, // battery-tuned twice: 39% → 38% at 0.95
    commander: {
      name: 'Chief Nitro', title: 'Boss of the Pit', portrait: 'assets/ui/cmdr-racers.jpg',
      bio: 'Goggles up, wrench behind one ear, grease grin permanent. Has never met a battle he could not treat as a race, and never lost a race he could not treat as personal. Runs the whole war on fresh batteries and pure momentum.',
    },
  },
  bots: {
    label: 'Tin Bots', icon: '🤖',
    desc: 'Factory-fresh precision. Ranged +1 attack, all toys attack 10% faster — but they trundle 5% slower on foot.',
    mods: { atkPierce: 1, atkSpeed: 0.9, speedInfantry: 0.95 }, // battery-tuned: was 36% WR
    commander: {
      name: 'Captain Cogsworth', title: 'The Left-Behind', portrait: 'assets/ui/cmdr-bots.jpg',
      bio: 'Wound tight, blue eyes warmer than spec allows. Was set on the pillow the morning the Kid drove away and chose to stay and hold the room. Runs on a mainspring and a promise, and counts down — tick, tick — to every rematch.',
    },
  },
  knights: {
    label: 'Castle Kingdom', icon: '🏰',
    desc: 'Stone and oath. Buildings +20% HP, all toys +5% HP — but armored boots march 6% slower.',
    mods: { buildingHp: 1.2, unitHp: 1.05, speedInfantry: 0.94 },
    commander: {
      name: 'Sir Hector', title: 'The Half-Painted', portrait: 'assets/ui/cmdr-knights.jpg',
      bio: 'The factory line stopped halfway down his left side, so one half of him is silver and crimson and the other is bare grey promise. He treats every toy the way the Kid treated him: as finished enough to matter. His castle has never fallen; his paint job, never completed. He is at peace with exactly one of those.',
    },
  },
};

// ---------------- game-over epilogues ----------------
// every match ends like a bedtime story: one closing beat in your tribe's voice
export const EPILOGUES = {
  classic: {
    win: 'The Army Men hold formation until the last enemy is boxed, because that is '
      + 'the whole job. Then General Greenboots climbs the pillow, surveys the quiet '
      + 'room, and allows himself one small, plastic smile. Dismissed, Commander — '
      + 'and well done.',
    lose: 'The Army Men retreat the way they do everything: in perfect order, single '
      + 'file, chins up. Greenboots is already drawing tomorrow\'s battle plan in the '
      + 'dust of the windowsill. Soldiers bend, Commander. They don\'t break.',
  },
  bricks: {
    win: 'By morning there is a wall where the war was, and a tower on top of the wall, '
      + 'and a flag on top of the tower, because Foreman Klik simply cannot help '
      + 'himself. "Victory," he says, tapping it twice, "is just good construction." '
      + 'Click. Done, Commander.',
    lose: 'The walls came down — but walls always come down, that\'s what makes them '
      + 'walls and not mountains. Klik is already sorting the rubble by color and size. '
      + 'Everything broken, Commander, is just a kit for the next attempt.',
  },
  plush: {
    win: 'The Plushie Horde doesn\'t cheer. They gather the fallen — theirs, yours, '
      + 'everyone\'s — and prop them up against the pillow where it\'s warm. "War is '
      + 'over," Colonel Snug announces, "hugs are mandatory." Somehow, Commander, you '
      + 'won the soft way.',
    lose: 'The Horde limps home leaking stuffing and stories in equal measure. Colonel '
      + 'Snug counts every head twice and tucks the smallest ones in himself. Plushies '
      + 'lose battles, Commander. They have never once lost each other.',
  },
  racers: {
    win: 'The RC Racers take a victory lap, then another, then six more, until someone '
      + 'points out the war has been over for ten minutes. They knew, Commander. They '
      + 'just like the sound a finish line makes when it\'s yours.',
    lose: 'Spun out. The Racers coast home on fumes and stubbornness, and the pit crew '
      + 'is under the hood before the wheels stop turning. "We didn\'t lose," the '
      + 'dragster insists, "we finished second." Refuel, Commander. Green flag\'s coming.',
  },
  bots: {
    win: 'The Tin Bots stand down in perfect unison and file their victory report: '
      + 'OUTCOME ACCEPTABLE. HOME DEFENDED. But their eyes glow a little warmer than '
      + 'spec tonight, Commander, and the smallest one is humming. That wasn\'t in the '
      + 'manual.',
    lose: 'The Tin Bots wind down one by one, keys slowing, lights dimming to embers. '
      + 'But listen: tick... tick... They are not stopping, Commander. They are '
      + 'counting down to the rematch.',
  },
  knights: {
    win: 'The Kingdom does not cheer either — knights kneel, the dragon folds her wings '
      + 'over the smallest squires, and Sir Hector raises his half-painted sword to the '
      + 'nightlight. "The castle stands," he says, and in the whole history of the room '
      + 'no toy has ever meant anything more.',
    lose: 'The walls are down, but a kingdom was never the stones — it was the kneeling. '
      + 'Sir Hector gathers his knights in the rubble and knights every single one of '
      + 'them again, bare grey side catching the moonlight. Rise, Commander. Castles '
      + 'are rebuilt by the sworn.',
  },
};

// ---------------- AI table-talk (all UI-only, never touches the sim) ----------------
// opening taunts: persona × the enemy's faction — a Cranky Plushie threatens
// differently than a Cranky Tin Bot
export const TAUNTS = {
  rusher: {
    classic: 'Greenboots skipped breakfast, Commander. His army men are already lacing their boots — expect them before your walls are dry.',
    bricks: 'Foreman Klik is not building a base. He is building a battering ram with an address on it. Yours. Early.',
    plush: 'Colonel Snug is done hugging. The Horde left home at dawn with their buttons polished — they mean to be on your rug by snack time.',
    racers: 'Engines at the start line. The Racers are not planning an economy — they are planning your fences, at ninety miles an hour.',
    bots: 'The Tin Bots cancelled their own parade. Keys wound, columns formed — the first march is aimed straight at your Toy Chest.',
    knights: 'Sir Hector has skipped the siege manual entirely. Lances are couched and the drawbridge is already down — the charge left at dawn.',
  },
  balanced: {
    classic: 'Greenboots plays it by the field manual: scout, build, strike. Leave one door open and he will find it.',
    bricks: 'Klik measures twice and attacks once. Every quiet minute is another course of bricks between him and regret.',
    plush: 'The Horde stirs slowly, patient as bedtime, gathering courage and crumbs in equal measure. When they come, they come together.',
    racers: 'The Racers idle their engines and watch the pit board. The moment you look tired, Commander, the flag drops.',
    bots: 'The Tin Bots compute the odds, then compute them again. When the arithmetic favors them, they will arrive precisely on time.',
    knights: 'The Kingdom fights the old way: scout the field, honor the parley, then break your gate politely but completely.',
  },
  boomer: {
    classic: 'Greenboots is digging in — trenches, rations, reinforcements. He means to out-supply you, not out-swing you.',
    bricks: 'Klik is stacking snacks like sandbags and bricks like ambitions. Break in early, or face the finished fortress.',
    plush: 'The Horde naps, snacks, and stitches reinforcements. Every minute you wait, their pile of friends grows taller.',
    racers: 'The Racers are tuning, not racing — bigger engines, fatter tires. Catch them in the garage, or race whatever rolls out.',
    bots: 'The Tin Bots are building a factory that builds factories. Interrupt the assembly line, Commander, or be assembled into their plans.',
    knights: 'Sir Hector is quarrying. Wall upon wall, tower upon tower — and somewhere behind the battlements, an egg is getting warm.',
  },
};

// mid-match event lines, spoken in the enemy faction's voice
export const AI_LINES = {
  raid: {
    classic: '"Move out!" — Greenboots has loosed his raiders. Mind your workers, Commander.',
    bricks: 'Klik has dispatched the wreckers. Bricks travel fast downhill, and these are aimed at your pockets.',
    plush: 'Soft footsteps, moving fast — the Horde has sent hugs of the unfriendly kind toward your workers.',
    racers: 'Engines scream across the mat — a Racer raid is inbound. Get the workers off the road!',
    bots: 'Tick-tick-tick — a raiding column has left the enemy line, marching straight for your gatherers.',
    knights: 'Hoofbeats on the playmat — the Kingdom has sent chargers for your workers. Sound the bell!',
  },
  ageup: {
    classic: 'Bugles from the rival camp — Greenboots just found a bigger boot to drop.',
    bricks: 'A new click echoes across the room — Klik\'s workshop has leveled up its ambitions.',
    plush: 'The Horde grew up a little just now. Bigger bears. Braver buttons.',
    racers: 'New engines on the wind — the Racers just rolled something faster out of the garage.',
    bots: 'A chorus of fresh keys winding — the Tin Bots have upgraded the assembly line.',
    knights: 'Trumpets over the battlements — Sir Hector has declared a new age of the Kingdom.',
  },
  wonder: {
    classic: 'Greenboots is building his legend, Commander — tear it down before it earns a statue.',
    bricks: 'Klik has begun his masterpiece, and he would dearly love for you to watch. Do not watch. Demolish.',
    plush: 'The Horde is stitching a dream taller than the lamp. Unstitch it, quickly.',
    racers: 'The Racers are raising a trophy for a race you have not lost yet. Object, loudly.',
    bots: 'The Tin Bots are assembling something beautiful and terrible. The countdown is not a metaphor.',
    knights: 'The Kingdom is raising a cathedral of blocks and banners. Kneel, or knock it down — those are the options.',
  },
  king: {
    classic: 'They\'ve found your King! Greenboots plays for keeps — get him behind walls!',
    bricks: 'Klik\'s wreckers are at your King! A crown is just a hat unless you defend it!',
    plush: 'The Horde is closing on your King — and those hugs will not be gentle. Pull him back!',
    racers: 'Racers on your King! They will circle him like a finish line — move him NOW!',
    bots: 'Enemy columns converging on your King. The arithmetic of regicide has begun — break their line!',
    knights: 'The Kingdom rides for your King — they know exactly what a crown is worth. Shields around him, NOW!',
  },
};

// the bedtime narrator: one-time story beats woven into the alert feed
export const NARRATOR = {
  firstblood: 'And so the first toy fell, and the room pretended not to notice. The war was real now.',
  age2: 'Somewhere between one heartbeat and the next, the room grew older — the Playmat Age had begun.',
  age3: 'The Fort Age, the storybooks say, is when toys stop playing at war and start meaning it.',
  mega: 'The floor itself seemed to hold its breath — somewhere, something enormous had just been wound up.',
  clock10: 'Ten minutes gone. Somewhere a music box began to count, and the night leaned in to watch.',
  // reactive beats: the narrator watches the tide of battle (all UI-only)
  comeback: 'Every good story has this part: the moment the beaten toy stands back up, dusts off its felt, and decides otherwise.',
  boom: 'While the others sharpened swords, your corner of the room grew fat on snacks and industry — an empire of busy little hands.',
  firstfleet: 'A hull touched the water, and the bath — which had only ever known splashing — learned the word "armada."',
  armylost: 'And then the floor went quiet. The terrible kind of quiet a room makes after it swallows an army whole.',
  wonderrace: 'Two wonders rose at once, brick by desperate brick — and every toy understood: the war would be decided by patience now.',
  foothold: 'Their workshops are ash — but toys rebuild from a single standing wall. Raze every last building, or the story starts itself over.',
};

// The Second Night (NG+): the same beats, told the second time through —
// the narrator knows the story now, and so does the room. Keys missing here
// simply fall back to the first-night line.
export const NARRATOR_NG = {
  firstblood: 'The first toy fell, and this time the room did not pretend. It had read this page before. It turned it anyway.',
  age2: 'The Playmat Age came again, the way a dream comes back the second night — familiar, and somehow bigger in the dark.',
  age3: 'The Fort Age, again. The storybooks say a war fought twice is not a war anymore. It is a promise being kept.',
  mega: 'Something enormous wound itself up in the dark — and the room sighed, because it remembered exactly how loud this part gets.',
  clock10: 'Ten minutes into the second night. The music box counted along from memory, a half-beat ahead of the clock.',
  comeback: 'The beaten toy stood back up, same as last time. Some pages, the room whispered, are the whole reason the book gets reread.',
  boom: 'Your corner grew fat on snacks and industry again — but faster now, the way hands move when they already know the recipe.',
  armylost: 'The floor went quiet, and the quiet was worse the second time, because now the room knew precisely what it had swallowed.',
  firstfleet: 'A hull touched the water, and the bath said "armada" before the ripples even settled. It had been practicing the word all day.',
  wonderrace: 'Two wonders rose at once — again — and the room leaned in close, hoping this telling would end a different way.',
  foothold: 'They rebuilt from one standing wall last night too. The room has seen this trick. Raze everything, and mean it this time.',
};

// ---------------- opening cutscene ----------------
// four hand-painted plates + narration; plays once on first launch (skippable)
export const INTRO = [
  {
    img: 'assets/intro/1.jpg',
    text: 'Every night, when the last light clicks off and the house lets out its breath, '
      + 'the toys of one small room wait for the door to close all the way.',
  },
  {
    img: 'assets/intro/2.jpg',
    text: 'Then, one by one, their eyes open. A soldier sits up. A bear stretches. '
      + 'A little racer flicks on its lights. The room, quietly, wakes.',
  },
  {
    img: 'assets/intro/3.jpg',
    text: 'But a waking room is a divided one. Bricks claim the corners, racers claim the '
      + 'open floor, robots march in from an open backpack — and every tribe wants the rug.',
  },
  {
    img: 'assets/intro/4.jpg',
    text: 'So the Kings gather at the attic war table, and the Bedroom Wars begin. '
      + 'No grown-up will ever know. Take your tribe, Commander — and fight for the room.',
  },
];

// per-match AI personality: same difficulty, different plan (adds replay variety)
export const PERSONAS = {
  rusher: {
    workerTarget: -3, firstWave: -3, raidInterval: 55,
    taunt: 'Scouts report sharpened push-pins and double-knotted laces — they mean to hit you before the room warms up.',
  },
  balanced: {
    workerTarget: 0, firstWave: 0, raidInterval: 0,
    taunt: 'The rival toys stir in the dark, patient as bedtime, watching for a door left open.',
  },
  boomer: {
    workerTarget: 5, firstWave: 6, raidInterval: 150,
    taunt: 'The rival toys are stacking snacks like sandbags — they mean to out-grow you, not out-fight you.',
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
