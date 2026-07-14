// ============================================================
// EMPIRE MODE — the Card Collection. Army "cards" become real
// collectibles: unique named troops across four rarities, won as
// loot from battles and chests, crafted from scraps, and fielded
// through the recruit picker. The collection PERSISTS across
// campaigns (localStorage tt-empire-cards) — that meta-progress is
// the hook. Every card fields a REAL unit type, and its mods flow
// into both the simulated odds AND the played toy-box battle, so a
// card fights the same whichever way you resolve it.
// ============================================================

export const E_RARITY = {
  common:    { name: 'Common',    color: '#b9a888', craft: 0,   salvage: 0,  weight: 0 },
  uncommon:  { name: 'Uncommon',  color: '#7fd06a', craft: 40,  salvage: 8,  weight: 55 },
  rare:      { name: 'Rare',      color: '#5aa9ff', craft: 100, salvage: 22, weight: 33 },
  legendary: { name: 'Legendary', color: '#ffca63', craft: 240, salvage: 65, weight: 12 },
};

// Card mods are deliberately simple — hp (durability) + vet (starting pips) —
// so they read identically in the seeded sim and the real RTS spawn. Legendary
// power comes from the beefy UNIT the card fields (tank, dragon…), not exotic math.
export const E_CARDS = {
  // ---- commons: always in hand, the backbone of any recruit ----
  recruit:  { name: 'Green Recruit',     icon: '🟢', unit: 'soldier',  rarity: 'common',    cost: 35,  hp: 1,    vet: 0, flavor: 'A plastic soldier, freshly unboxed and eager to help.' },
  archer:   { name: 'Keen Archer',       icon: '🏹', unit: 'archer',   rarity: 'common',    cost: 35,  hp: 1,    vet: 0, flavor: 'One eye shut, one button nocked.' },
  spear:    { name: 'Brave Spear',       icon: '🔱', unit: 'spear',    rarity: 'common',    cost: 35,  hp: 1,    vet: 0, flavor: 'Holds the line with a toothpick and a grudge.' },
  // ---- uncommons ----
  raider:   { name: 'Scrap Raider',      icon: '🛞', unit: 'raider',   rarity: 'uncommon',  cost: 55,  hp: 1,    vet: 0, flavor: 'Four wheels, no brakes, all attitude.' },
  flinger:  { name: 'Pin Flinger',       icon: '📌', unit: 'flinger',  rarity: 'uncommon',  cost: 55,  hp: 1,    vet: 0, flavor: 'Lobs clothespins clean over the tallest block wall.' },
  grenadier:{ name: 'Button Grenadier',  icon: '💣', unit: 'grenadier',rarity: 'uncommon',  cost: 60,  hp: 1.05, vet: 0, flavor: 'Every pocket rattles with spare buttons.' },
  // ---- rares ----
  sarge:    { name: 'Sergeant Snap',     icon: '🎖️', unit: 'soldier',  rarity: 'rare',      cost: 90,  hp: 1.3,  vet: 1, flavor: 'The paint is chipped where the medals used to be.' },
  longshot: { name: 'Longshot Lucy',     icon: '🎯', unit: 'archer',   rarity: 'rare',      cost: 90,  hp: 1.15, vet: 1, flavor: 'Never misses the same lost sock twice.' },
  teddy:    { name: 'Teddy Guard',       icon: '🧸', unit: 'bear',     rarity: 'rare',      cost: 95,  hp: 1.2,  vet: 0, flavor: 'Soft outside, soft inside, still somehow terrifying.' },
  knight:   { name: 'Iron Knight',       icon: '🛡️', unit: 'knight',   rarity: 'rare',      cost: 95,  hp: 1.2,  vet: 0, flavor: 'Foil armour, cardboard shield, heart of a lion.' },
  charger:  { name: 'Cavalry Charger',   icon: '🐴', unit: 'charger',  rarity: 'rare',      cost: 100, hp: 1.1,  vet: 1, flavor: 'A hobby-horse that never learned to slow down.' },
  // ---- legendaries: the crown jewels — real mega units ----
  tank:     { name: "The General's Tank",icon: '🚜', unit: 'tank',     rarity: 'legendary', cost: 160, hp: 1,    vet: 0, flavor: 'A rolling fortress with one very loud opinion.' },
  colossus: { name: 'Brick Colossus',    icon: '🧱', unit: 'colossus', rarity: 'legendary', cost: 170, hp: 1,    vet: 0, flavor: 'A titan of studs and spite. Its ground-slam levels city blocks.' },
  dragon:   { name: 'The Toy Dragon',    icon: '🐉', unit: 'dragon',   rarity: 'legendary', cost: 170, hp: 1,    vet: 0, flavor: 'Red plastic, amber belly, breath like a birthday candle gone to war.' },
  mama:     { name: 'Mama Bear',         icon: '🐻', unit: 'mamabear', rarity: 'legendary', cost: 160, hp: 1,    vet: 0, flavor: 'The biggest hug in the house — and the last one you get.' },
};

export const E_COMMON_KEYS = Object.keys(E_CARDS).filter((k) => E_CARDS[k].rarity === 'common');
export const E_CARD_ORDER = ['common', 'uncommon', 'rare', 'legendary'];

// ---- the meta collection (persists across campaigns) ----
const CKEY = 'tt-empire-cards';
export function loadCollection() {
  try { const j = localStorage.getItem(CKEY); if (j) { const c = JSON.parse(j); c.owned = c.owned || {}; c.scraps = c.scraps || 0; c.seen = c.seen || []; return c; } } catch (e) { /* corrupt */ }
  return { owned: {}, scraps: 0, seen: [] };
}
export function saveCollection(c) { try { localStorage.setItem(CKEY, JSON.stringify(c)); } catch (e) { /* full */ } }
export function ownsCard(c, key) { const card = E_CARDS[key]; return !!card && (card.rarity === 'common' || (c.owned[key] || 0) > 0); }

// grant a won card. First copy joins the collection; any dupe melts into scraps.
export function grantCard(c, key) {
  const card = E_CARDS[key];
  if (!card || card.rarity === 'common') return { first: false, scraps: 0 };
  if (!c.seen.includes(key)) c.seen.push(key);
  if ((c.owned[key] || 0) >= 1) { const s = E_RARITY[card.rarity].salvage; c.scraps += s; return { first: false, scraps: s }; }
  c.owned[key] = 1;
  return { first: true, scraps: 0 };
}
export function craftCard(c, key) {
  const card = E_CARDS[key];
  if (!card || card.rarity === 'common' || ownsCard(c, key)) return { ok: false, why: 'already owned' };
  const cost = E_RARITY[card.rarity].craft;
  if (c.scraps < cost) return { ok: false, why: 'not enough scraps' };
  c.scraps -= cost; c.owned[key] = 1;
  if (!c.seen.includes(key)) c.seen.push(key);
  return { ok: true };
}

// deterministic loot roll (rng = seeded () => [0,1)); quality 0-2 tilts toward
// rarer cards for tougher fights. Pure — the sim decides WHAT drops; the caller
// decides whether to persist it. Same seed ⇒ same card, every time.
export function rollLoot(rng, quality = 0) {
  const pool = ['uncommon', 'rare', 'legendary'];
  const w = { uncommon: Math.max(6, 55 - quality * 14), rare: 33 + quality * 4, legendary: 12 + quality * 9 };
  const total = pool.reduce((s, r) => s + w[r], 0);
  let roll = rng() * total, rarity = 'uncommon';
  for (const r of pool) { roll -= w[r]; if (roll <= 0) { rarity = r; break; } }
  const cards = Object.keys(E_CARDS).filter((k) => E_CARDS[k].rarity === rarity);
  return cards[(rng() * cards.length) | 0];
}
