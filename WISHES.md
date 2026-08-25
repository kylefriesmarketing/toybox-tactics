# BEDTIME WISHES — CORRECTED, BUILDABLE SPECIFICATION

_2026-08-20. Produced by a 9-agent design pass, two hostile reviews, and a 6-agent
correction pass. Re-verified against toybox/*.js this pass._

**Status: design recheck = BUILDABLE. Technical recheck = SAFE TO BUILD after five
small text corrections (listed in the technical recheck below). Nothing in the
architecture is wrong.**

⚠️ This supersedes the earlier draft, which was saved TRUNCATED (the integration
agent's output was cut mid-table when written to disk). The correction pass caught
that and rebuilt the missing sections from the real code rather than trusting the file.

---

Every anchor, price, height, and read site below is re-derived from `C:\Users\kylef\Downloads\New folder\toybox\` this pass. Here is the corrected spec.

---

# BEDTIME WISHES — CORRECTED BUILDABLE SPECIFICATION
*Supersedes `WISHES.md` in full. Every number verified against `toybox/data.js`, `game.js`, `main.js`, `ui.js`, `models.js`, `net.js` on 2026-08-20.*

> **Source note.** `WISHES.md` is truncated: it is three concatenated scratchpad files (66,010 B exactly) and the spec half begins mid-sentence inside §3's unit table. §1 (the catalogue), §2 (the engine) and 14 of 16 unit rows do not exist on disk. This document rebuilds all three from what *is* attested plus the real code. It does not need the lost text; do not merge the older 12-wish `wishcheck.mjs` system in the scratchpad — that is a different design.

---

## 1 · WHAT CHANGED, AND WHICH FINDING EACH FIX ANSWERS

| # | Change | Answers |
|---|---|---|
| **1** | **The trigger leaves the age-up entirely.** Wish I is picked **pre-game**, beside the civ, and travels in `playerDefs` exactly as `faction` does. Wish II is **the Bell** — offered to every living seat at `time >= 360`, pulled forward to as early as 180 for any seat with `stats.lost >= 6`. | Review 2 §0 (*"you built a comeback-shaped fiction on a snowball-shaped trigger"*), §7 (dead opening), §**Strongest Recommendation**. Also Review 1 Hunt 1, G2's `dropAt`-in-`aging` case, the modal blackout, and Battery A's confound — all deleted rather than fixed. |
| **2** | **The catalogue is inverted: 62% lump, 38% army-proportional** (was 86% proportional). One free tech and one per-unit signature per faction, everything else fixed-value at grant time. The axis is stated correctly as **per-unit vs per-player**, not flat vs multiplier. | Review 2 §3(b). Corrects the review's own slip — `+2 armour on every infantry` is flat *and* snowball-shaped. |
| **3** | **No wish may cancel a faction penalty.** Seven `mods` keys are forbidden by faction, mechanically and greppably. Kills `gather ×1.08`, `chivalry`, `buildingHp ×1.2`, `buildRate 1.2` and both `speedInfantry` repairs. | Review 2 §**Strongest Recommendation**, 2nd bullet (*"you will never be able to read the balance table again"*). |
| **4** | **Lane law: no faction's two units share a lane, and every faction reaches a toy without picking March.** Distribution goes 1/10/5 → **Hearth 5 · March 6 · Keep 5**. | Review 2 §2 (Hearth is the trap lane), §4 (*"four of eight factions can go two full games without a new toy"*). |
| **5** | **Hearth Law.** A Hearth wish must return more than it cost within **180 sim-seconds of landing**, and ≥ half that value must arrive as an **object** — a toy, a building, or a body. Never purely as a rate. | Review 2 §2 (*"minute 6 is halfway"*). |
| **6** | **Tidy Up is cut**, replaced by **ONE MORE NIGHT** (temporary, leashed, comeback-shaped). New law: **Keep-lane powers are leashed to your own territory.** | Review 2 §3(c). The leash also fixes Yellow Flag's zero floor (§2) without touching its numbers. |
| **7** | **The Paper Bomber is cut.** No wish unit flies. Racers' second toy is the **Pace Car**, promoted from the original cut list's own named reserve. | Review 2 §3(d) — the largest map-level swing in the document, absent from the risk table. `def.fly` beelines (`game.js:3166`) and `move` checks only `inMap` (`:3225`); there is no `fly` bonus key and no anti-air. |
| **8** | **`bonus: { mega: 10 }` ships on the shared Sticker Catapult in Slice 1.** The Long Gun becomes the *best* titan answer, not the *only* one. | Review 2 §2 (*"a titan-counter is not a lane preference in a game with eight titans"*). |
| **9** | **No wish creates a new entity kind.** The Wind-Up Alarm and the Floorboard mouths are cut and re-authored as an aura and a permanent zone. | Review 1 Blockers 1 & 3, audit item 9. Deletes six exclusion sites, a fuse, a synthetic-attacker damage path and a snapshot key. |
| **10** | **`stateHash` gains tech *contents*, `p.mods`, `p.stats.lost`, wish state, `u.aura`, `this.zones`;** `snapshot`/`restore` gain `u.aura` and `zones`; `__ttSoak` returns `hash`. | Review 1 Blocker/Hunt 2, Hunt 7 (*"`fp` is not a wish fingerprint"*). Two of these are pre-existing blind spots — `p.techs.size` hashes the **count** (`game.js:2260`) and `p.mods` is absent entirely — so `__ttNetTest` is blind to them **today**. |
| **11** | **`applyUnitTint` clones materials and never touches `_tierInit` / `_tierMats` / `_baseScale`.** | Review 1 Blocker 4. Verified: `view._baseScale` is set *only* inside the `if (!view._tierInit)` guard at `models.js:1550`, and `models.js:1583` does `setScalar(view._baseScale * …)` → `NaN` on the first promotion. |
| **12** | **Wish units never enter a `trains` array.** They live only in the wish-gated `cmds.push`. | Review 1 Blocker 5 — the spec contradicted itself, and the AI's `opts` picker (`game.js:4276-4280`) would silently regress throughput for every seat. |
| **13** | **Keybinds: `n` for aim, `1`/`2`/`3` for the picker behind an explicit early-return guard.** `m` is mute. | Review 1 Blocker 6 (`main.js:2724`). Plus a conflict the reviews missed: `1-9` is control-group recall (`main.js:2733`) — see §8. |
| **14** | **Slice 1 ships knights + bots**, not classic + knights. | Review 2 §5 (*"classic is the least distinctive half"*). |
| **15** | **Titan Law: no wish puts a permanent `mega` on the board before the Fort Age.** Wish megas are `age: 3`; every other wish unit is `age: 2`. The free Toy Dragon is the single deferred gift (`p.wishHold`). | Not raised by either review — a consequence of moving the trigger to 6:00 that would otherwise have re-created the snowball. |

**Deliberately kept against review pressure:** the free Toy Dragon (Review 2 §1). It is a **lump**, which is the shape this pass converts *toward*; the complaint is lane parity, and parity is now enforced by **price** (dragon 460 R vs knights-Hearth 520 R vs knights-Keep 425 R) rather than asserted. It also now requires a Dragon Roost you built and the Fort Age. The spec's own fallback — gating it behind The Warm Egg — is **rejected**: it makes both picks forced and turns knights into a solved book.

---

## 2 · THE SYSTEM, FINAL

### 2.1 Shape

Three ages, but the picks no longer ride them.

- **Wish I — pre-game.** Picked on the faction-select screen. Three cards, one per lane. Travels in `playerDefs[i].wish1`, exactly like `faction`.
- **Wish II — the Bell.** `p.wishOffered = 2` the tick `time >= WISH_RULES.bell`, **or** `time >= bellEarly && p.stats.lost >= hurt`. Same rule on every client. No age check, no resource check, no building check. The pick travels via `execCommand`.

```js
// data.js
export const WISH_RULES = {
  bell:      360,  // sim-seconds — Wish II offered to EVERY living seat
  bellEarly: 180,  // floor for the accelerator; the bell never rings earlier
  hurt:      6,    // p.stats.lost >= 6 pulls the bell forward to now
  window:    45,   // sim-seconds to answer before the sim picks for you
  cd:        12,   // sim-seconds between casts (shared across a player's powers)
};
```

Each wish has three layers:

- **GIFT** — lands the instant the wish lands. Typed **L**ump / free **T**ech / per-unit **S**ignature.
- **REACH** — what it unlocks or hands you: a wish unit, free buildings, a claimed camp, a permanent zone.
- **POWER** — an active ability. **Wish I: 2 charges, creates nothing permanent. Wish II: 1 charge, may create permanent objects.**

### 2.2 Why the Bell, and why not the alternatives

**Why not "an earlier wish for whoever is behind."** There is no honest "behind." The only shipped per-player scalar is the timeline sample at `game.js:4951` — `gathered + kills*25 + razed*60 + mil*12 + wrk*6 + age*150` — under which a boomer at minute 5 scores *below* a rusher who is winning. Every cheaper proxy has the same shape. It also breaks Law 2: an offer you cannot time is not plannable.

**Why not "discount the age-up when behind."** `AGE_UPS[1]` is 400 snacks + 150 blocks + **40 s of chest downtime**; `AGE_UPS[2]` is 800 + 350 + **55 s** (`data.js:24-26`). At minute 5 under pressure the problem is not the 550 resources, it is that the 40 seconds and the resources both have to be soldiers. Halving the cost does not make them click it — and it mutates a surface with three measured batteries behind it.

**Why not leave Wish II on the second age-up.** `AGE_UPS[2]` is the single most unbuyable thing in the game, and it needs two Playmat-Age buildings already standing. In matches that conclude at 7–15 sim-min, the pressured player never reaches it. Moving only Wish I would mean: **the losing player's only wish is the one they chose before they knew anything, and the winner gets both.**

**Why 360.** Age 1→2 realistically lands minute 4–5. The Bell puts the *second* pick roughly where the old design put the *first*, with **1–9 minutes of runway** instead of 0–5. It also lands after the Playmat Age, so every faction's age-2 answers exist by then.

**Why `stats.lost >= 6` and nothing else.** It already exists (`game.js:2896` in `kill()`, `:3794` in `convertUnit`). It is **hardship, not score** — a boomer with 40 workers and no army never trips it, so it does not pay for playing greedy. It is not farmable: 6 fed toys is ≥ 360 resources of production plus ~970 resources of forgone worker output over two minutes (`gatherRate: 1.35`), plus enough free kills to promote an enemy toy through both veterancy tiers (⭐ 3 kills / ⭐⭐ 6, `game.js:2880`). Pet noise is bounded — the cat swats 9 on a 6 s cooldown, the dog 6 — and reaching 6 losses to pets alone before 6:00 is not reachable. **Assert it once in the battery; do not build a mechanism for it.** The accelerator only ever runs downhill: earlier, never later, never past 180.

### 2.3 The offer

```js
// data.js — read in lane order Hearth → March → Keep
FACTIONS[k].wishes = {
  1: ['quartermaster', 'r3_flag', 'digin'],
  2: ['r5_junkdrawer', 'secondwave', 'longwatch'],   // a 4th id = the `needs` alternate
};
```

```js
// game.js — PURE. No rng, ever (Law 2).
wishOffer(factionKey, tier) {
  const ids = (FACTIONS[factionKey] || FACTIONS.classic).wishes[tier];
  if (tier === 1) return ids.slice(0, 3);          // tier 1 carries no `needs:` — Law 10
  const out = [];
  for (const id of ids) {
    const w = WISHES[id];
    if (w.needs === 'pet' && !(!this.zeroEra && (this.map.cat !== false || this.map.dog))) continue;
    out.push(id);
    if (out.length === 3) break;
  }
  return out;
}
```

`needs:'pet'` reads **`this.zeroEra` as well as map config** — `game.js:1029-1033` wraps all pet spawning in `if (!this.zeroEra)`, so a map-config-only predicate offers a cat that does not exist in Toy Box Zero. `bathtub` (`cat: false`, no `dog`) is the other case. The substitute in both is **R1 Left the Light On, re-tiered to Wish II** — declared as the 4th id in plush's and racers' `2:` lists.

Wish I is pure `wishOffer(faction, 1)`: two strings in, three ids out, callable **before `setup()`**, in a soak, in a replay.

### 2.4 The pick

**Wish I** resolves in the constructor, immediately after the persona block (`game.js:378`), so the AI can read its own persona:

```js
// the wish-1 roll is consumed for EVERY seat even when pinned — exactly the
// faction roll's discipline (:322-325) and the persona roll's (:347). Skip it
// for a pinned seat and Battery A (pinned) and Battery B (free) run on
// different rng streams and are not comparable.
this.wish1Keys = this.players.map((p) => {
  const offer = this.wishOffer(this.factionKeys[p.id], 1);
  const rolled = this.aiPickWish(p.id, offer, 1);   // consumes exactly offer.length draws
  const pinned = this.playerDefs[p.id].wish1;
  return offer.includes(pinned) ? pinned : rolled;
});
```

The **gifts are applied at the tail of `setup()`**, not in the constructor — free buildings and free toys need a placed starting base to sit beside. Pick resolution and gift application are deliberately separate.

**Wish II** arrives by command:

```js
// beside case 'age' (game.js:2232)
case 'wish': {
  const p = this.players[pid];
  if (p.wishOffered !== 2 || p.wishes.length >= 2) break;      // already answered
  const offer = this.wishOffer(this.factionKeys[pid], 2);      // pure
  if (!offer.includes(c.k)) break;                             // never trust the wire
  this.applyWish(pid, c.k);
  p.wishT = 0;
  break;
}
case 'cast': this.castWish(pid, c.k, c.x, c.z); break;
```

`{t:'wish', k:'<id>'}` and `{t:'cast', k, x, z}` — `net.js:211/234/263` ships whole command objects and `issue()` deep-clones into `cmdLog` (`game.js:2140`), so replay and MP are free.

**The sim never waits on a client.** If no command lands within `window: 45` sim-seconds, the sim assigns the default itself: `aiPickWish` for AI seats, **`offer[0]`** for human seats — a pure, faction-authored, plannable default that consumes **no** rng draw. A dropped human must not perturb the stream a live one leaves alone. There is no ready-gate anywhere; the match runs on underneath a non-blocking `#wishbar` strip.

### 2.5 The optimism ban

> **`applyWish` and `castWish` are the only writers of `p.wishes`, `p.wishCharges`, `p.wishCd`, `p.wishOffered`, `p.wishT`, `p.wishHold`, and the only way in is `execCommand`. No UI path may pre-decrement a charge, "reserve" a pick, or grey a card by mutating sim state.**

The bar renders `p.wishes` and nothing else. It may show its own purely-visual "sent" styling. In lockstep an optimistic decrement means the local client runs one tick with a different `p.wishCharges` than everyone else — an instant desync, now caught by `stateHash` at the very next 100-tick sample (`net.js:224`) instead of never. This is the contract every existing command already honours: `ui.js:736` issues `{t:'age'}` and waits; it does not set `p.aging`.

### 2.6 New sim state — complete list

| field | type | why |
|---|---|---|
| `p.wishes` | `string[]` (≤2, ordered) | the picks |
| `p.wishCharges` | `{id: n}` | charges left per wish |
| `p.wishCd` | float | shared recast clock |
| `p.wishOffered` | `0\|1\|2` | which bell has rung for this seat |
| `p.wishT` | float | the 45 s answer window |
| `p.wishHold` | `string\|null` | the one deferred gift (the Toy Dragon) |
| `p.wreck` | number | blocks refundable — bricks *Everything Is Spare Parts* |
| `p.stats.wishesCast` | number | the §7 instrument |
| `p.mods.farmRate` | float, default 1 | multiplicative, read at `game.js:3715` |
| `p.mods.wallHp` | float, default 1 | multiplicative, read at `game.js:1695` |
| `u.aura` | `{k, t, used?}\|null` | per-toy buff, flat primitives only |
| `this.zones` | `[{id, kind, owner, x, z, r, t}]` | area powers; `t < 0` = permanent |

**Only two new `mods` keys.** Every power that would have needed a third lives in `zones` or `aura` instead.

### 2.7 The three read sites, plus one

- `speedOf` (**`game.js:1779`**) — a zone term beside `m.speedAll`, behind `if (!this.zones.length && !u.aura) return s * m.speedAll;`
- `startSwing` (**`game.js:3250`**) — same shape, beside `mods.atkSpeed`.
- `applyDamage` (**`game.js:2779`**) — the damage multiply, after armour.
- `gatherRateOf` (**`game.js:1826-1828`**) — `return u.def.gatherRate * m.gather * (resType === 'snacks' ? m.gatherSnacks : 1);` — the single funnel for **pile** gathering, needed by The Standard Bearer's aura. ⚠️ **Farms do not route through it** (`game.js:3715` multiplies inline), so `mods.farmRate` needs its own term at that line. Two different sites; do not assume one covers both.

### 2.8 The eight `POWER_FX` kernels

Every power in the catalogue is one of these plus arguments. No power invents a ninth.

1. `grant` — resources / techs / mods, no targeting.
2. `place` — a completed building (or N) at a chosen legal tile.
3. `spawn` — units at a friendly building; `overPop` bypasses `popCap` (`spawnUnit` already only does `p.popUsed++`).
4. `zone` — push a `this.zones` record. `t < 0` is permanent.
5. `aura` — write `u.aura = {k, t}` on every legal unit in a radius.
6. `burst` — one-shot area damage or heal at a point.
7. `sweep` — a retroactive pass over **your own** entities (repair all, bank all carries, heal all, re-lay all mats).
8. `claim` — take ownership of a neutral entity (a camp, a lost toy, the cat).

> **KERNEL INVARIANT.** `if (e.kind !== 'unit' && e.kind !== 'building') continue;` is the **first line** of kernels 4–8.

`applyDamage` unconditionally calls `target.view.markDamaged()` and `target.view.hpBar.set(…)` (`game.js:2793-2794`), and those exist only on unit and building views. Critters, the cat, the dog, the roomba, camps and lost toys have neither, and no `hp`/`maxHp` at all. Nothing hits them today **only because both target scans filter by kind** (`:3050`, `:3064`) — a radius sweep over `this.entities` does not. `applyDamage` also dereferences `attacker.x/z`, `attacker.def.aggro` and `attacker.owner`: there is **no null-attacker path**, so any power without a casting entity supplies a synthetic attacker carrying a real def.

### 2.9 AI picker

```js
aiPickWish(pid, offer, tier) {
  let best = null, bestScore = -1e9;
  for (const id of offer) {
    const jitter = this.rng() * 12;        // ⚠️ UNCONDITIONAL — Law 3. Exactly
    let s = this.wishScore(pid, id, tier); //    offer.length draws, every time,
    s += jitter;                           //    before any `continue`.
    if (s > bestScore) { bestScore = s; best = id; }
  }
  return best;
}
```

`wishScore` = a static lane bias per faction × persona (rushers lean March, boomers lean Hearth, balanced flat) plus, for tier 2 only, situational terms: behind on army value → March; a rival unit inside 20 tiles of your chest in the last 30 s → Keep; ahead on worker count → Hearth. Tier 1 has no situational terms — there is no board yet, which is exactly why the pre-game pick reads as *identity*.

**Battery C target: with `wishScore` flattened to 5, the distribution must be ~33/33/33.** Any deviation is a bug in the bias table, not a design finding.

### 2.10 Save / hash / MP

- **No save-version bump.** `restore` has no migration machinery; its established pattern is tolerant reads at the read site (`se.progPid ?? -1` at `:2489`, `se.type || 'mouse'` at `:2452`), and those defaults **are** the migration.
- **RESTORED WISHES ARE DATA. `restore()` NEVER CALLS `applyWish`.** `snapshot` writes `mods: {...p.mods}` (`:2329`) and `restore` does `Object.assign(p.mods, sp.mods)` (`:2396`) on a freshly-constructed Game, so every stat a wish granted is already back. Re-applying would run `m.carry += 4` / `m.gather *= 1.15` a second time, permanently and silently, on the client that loaded. ⚠️ **Do not be reassured by testing a tech-granting wish** — `applyTech` early-returns on `p.techs.has` (`:1832`), so techs are idempotent and hide the bug. **Test a mods-granting wish.**
- **MP.** Wish I rides the roster like `faction`: guest `hello` carries it, host stores it, `startMatch()` deals it in `playerDefs`. Three one-line changes in `net.js` (§5, Patch 9). Wish II is a command. AI seats resolve both locally on every client and never touch the wire.

---

## 3 · THE CORRECTED CATALOGUE

**Legend:** **L** lump · **T** free tech · **S** per-unit signature. `W1` = pre-game, `W2` = the Bell. All resources counted 1:1 (the game's own `MARKET` trades every type at the same 100-lot, `data.js:31`). Prices are from the real `TECHS`/`BUILDINGS`/`UNITS`.

### 3.1 The pay-curve law, stated correctly

Review 2 §3(b) says *"flat grants are comeback-shaped, multiplier grants are snowball-shaped"* — and three clauses later lists **`+2 armour on every infantry`** as a snowball item. Both cannot be true. `+2 armour` is flat.

> **The real axis is per-unit versus per-player.** A grant snowballs iff its total value is a function of what you already own:
> `value = (army size | worker count | building count) × k` → **snowball**, whether `k` is written `×1.12` or `+2`.
> `value` fixed at grant time → **comeback-shaped**.

Naively converting `unitHp ×1.12` to `+8 hp on every toy` is a **fake fix** — still army-proportional, just wearing a plus sign. Every conversion below moves the grant off the per-unit axis, not off the multiplication sign.

**The test**, on two realistic minute-6 states from a mirrored 1v1 — **A (behind):** 8 military, 6 workers, 6 buildings; **B (ahead):** 24 military, 14 workers, 12 buildings. `value(B)/value(A) ≥ 2` = snowball; `≤ 1.25` = lump.

### 3.2 The ratio, stated explicitly

**BEFORE.** §1 is missing from disk, so the honest denominator is the gift-layer grants recoverable from the surviving text. Fourteen are recoverable; **twelve are army-size-proportional — 86%**, consistent with the review's "roughly 80%":

| grant | curve | | grant | curve |
|---|---|---|---|---|
| racers `gather ×1.08` | 2.3× | | knights `chivalry` free | 2.9× |
| racers `nitro` free | 2.9× | | knights `buildingHp` → 1.5 | 2.0× |
| racers +12 buttons/wheeled kill | ≥3× | | knights +2 infantry armour | 3.0× |
| racers `quilting` + `armorOther += 2` | 2.9× | | classic +3 kills on the standing army | 3.0× |
| racers `unitHp ×1.12` | 2.9× | | plains `farmRate` 0.8 → 1.6 | 2.4× |
| knights `buildRate 1.2` | 2.2× | | plains pile depletion −35% | 2.3× |
| knights free Toy Fort + 3 buildings | **1.0× lump** | | knights free Toy Dragon | **1.0× lump** |

**AFTER.** 42 distinct wishes (36 bespoke + 6 Room Wishes), one typed gift each:

| shape | count | share | rule |
|---|---|---|---|
| **Lump** — value fixed at grant time | **26** | **62%** | free buildings, free units, banked resources, next-N-units-⭐, retroactive refunds, returning the fallen |
| **Free tech** — lump price, per-unit effect | **8** | 19% | exactly one per faction |
| **Per-unit signature** — the fantasy exception | **8** | 19% | exactly one per faction, and never a key that faction's own `mods` lowers |

**Army-size-proportional: 86% → 38%. Ratio inverted.**

**The eight signatures**, each the one number that faction's fiction is *about*:

| faction | wish | signature | why it earns the exception |
|---|---|---|---|
| classic | Dig In (Keep W1) | `armorInfantry += 1` | `mods: {}` — discipline is the only identity available |
| bricks | One Brick Taller (Keep W1) | `mods.wallHp *= 1.8` + retroactive (wall 250→450, gate 400→720) | it is the wish's literal name |
| plush | Hold the Line (Keep W1) | `healRate *= 1.33` (1.5 → 2.0) | medics number 1–3; near-lump in practice, and it is the Horde |
| racers | Marshals on the Track (Keep W1) | `armorOther += 1` — **cut from `quilting` + `+2`** | wheels are 0/0 in the box (`drone`, `dragster`, `raider` all `{melee:0, pierce:0/1}`) |
| bots | Still Ticking (March W1) | `atkSpeed *= 0.95` (0.9 → 0.855) | the mainspring is the whole toy |
| knights | To Be Raised (Keep W1) | `buildingHp *= 1.15`, retroactive like `plating` | a *bonus* on a bonus, not a penalty repair |
| wranglers | Don't Touch the Herd (Keep W2) | `armorOther += 1` | the rope holds the herd together |
| plains | Follow the Season (Hearth W2) | `mods.farmRate = 1.25` → mats gather **1.0** | see the farm ruling below |

Two factions may share a signature *key*; what makes it a signature is that it is the number their fiction is about.

**The eight free techs**, real prices from `data.js:1154-1192`:
classic `whetstone` 120s+60b · bricks `steelwork` 200b+120m · plush `grouphug` 220s+150btn · racers `springs` 150s+150btn · bots `overclock` 200btn+120m · knights `tape` 150b+125m · wranglers `pockets` 75s+50b · plains `reinforced` 200s+100m.
A granted tech bypasses its age gate (it is a direct `applyTech` call, not a purchase) — that is deliberate and is most of a W2 tech's value. **W1 free techs must be age ≤ 2**; only wranglers' `pockets` (age 1) sits at W1.

### 3.3 The rule that stops the class from coming back

> **NO WISH MAY CANCEL A FACTION PENALTY.** The forbidden key per faction is exactly the `mods` entry that makes that faction worse:
> bricks `speedInfantry` · plush `speedInfantry`, `speedWheels` · racers `gather` · bots `speedInfantry` · knights `speedInfantry` · wranglers `buildingHp` · plains `buildingHp`. (classic has none.)

Mechanical and greppable. It deletes by construction: racers' `gather ×1.08` (their `gather: 0.97` carries `// battery-tuned twice: 39% → 38% at 0.95`), knights' `chivalry` (`speedInfantry: 0.94`), wranglers' `buildingHp ×1.2`, and both remaining `speedInfantry` repairs. **If knights sit at 32%, change the 0.94.** That costs one number and stays measurable.

### 3.4 The Hearth Law

> A Hearth wish must return more than it cost **within 180 sim-seconds of the moment it lands** (t=0 for Wish I, the Bell for Wish II), and **at least half its value must arrive as an object** — a toy, a building, or a body — never purely as a rate.

**The arithmetic.** A Snack Mat at `farmRate 0.8` returns **144 snacks in 180 s**; a worker at `gatherRate 1.35` returns ~180 after walking. A "+25% gathering" Hearth wish on eight workers is **≈ 360 snacks in three minutes — six Block Soldiers.** That is the floor. "Compounds from minute 6" does not beat it, because resources banked at the buzzer are worth **zero**.

**Corollary of the trigger move: Wish I gifts are start-of-match objects and permanent properties; Wish II gifts may be retroactive.** A "repair every damaged building" gift is worth nothing at t=0. Wish I free buildings are **auto-sited deterministically** relative to your starting chest (baskets at the two nearest resource nodes by `di²+dj²`, ties by tile index; houses/mats at the first legal footprints on a fixed spiral). Wish II placements are player-aimed.

### 3.5 The gift-legality law

> **A wish gift may create any object of age ≤ 2. Age-3 objects are forbidden.** The single exception is the free Toy Dragon, which parks in `p.wishHold` and hatches the instant its owner holds a Dragon Roost and reaches the Fort Age.

This is why knights' Hearth W2 hands you four Block Houses and a Watch Tower instead of a Toy Fort, and why bricks' *Click. Done.* hands you two Watch Towers. It is also why **an age-2 building is placed even for a player still in the Bedtime Age** — the Bell exists to help whoever is behind, and refusing them the gift would invert it.

### 3.6 The titan law

> **No wish may put a permanent `mega` on the board before the Fort Age.**

The four wish megas are `age: 3` and train at their faction's own building. Every other wish unit is `age: 2`. ONE MORE NIGHT's Empty Suits are exempt because they are **temporary** (45 s) and **leashed** (12 tiles from the building they rose at) — the law governs permanent board presence.

**And the counter ships with them.** `bonus: { mega: 10 }` goes on the shared **Sticker Catapult** (`data.js:389`, age 3, 120b+100btn, 26 siege, trained at the universal `workshop`) in **Slice 1**. Verified against `applyDamage`: `armorOf(unit, 'siege')` reads `def.armor['siege']`, which is undefined on every unit ⇒ 0, so siege genuinely bypasses unit armour. Catapult vs a free Toy Dragon: **36 per shot / 3.6 s ⇒ 18 shots ⇒ 65 s solo, ~22 s for three**, kiting from 6.5 range against the dragon's 2.2. The Long Gun (55 vs mega, 12 shots) becomes the **best** answer instead of the **only** one.

### 3.7 The farm ruling

`farm.farmRate: 0.8` (`data.js:787`) vs worker `gatherRate: 1.35` — farms are deliberately **41% slower** than piles: infinite-but-slow. The spec's 1.6 made a farm **1.19× a pile with zero walk time**, plus free, plus −35% depletion, and `game.js:3715` multiplies farm yield by `mods.gather * mods.gatherSnacks`, so it stacked with Move the Camp. Review 2's own fallback of 1.3 is still 1.6× base and still beats a pile once travel is counted.

**1.0 is the correct number:** a mat becomes exactly as good as a worker on a pile *minus the walk*, still **26% below** a worker, so infinite-but-slow survives intact. The free mats stay (a lump). **The depletion modifier is deleted outright** — it is a hidden global rate multiplier on everything you gather.

---

### 3.8 The catalogue

#### 🎁 classic — `mods: {}`

| wish | lane/tier | GIFT | REACH | POWER |
|---|---|---|---|---|
| **Quartermaster's List** 📋 | Hearth W1 | **L** 150 snacks + 2 free Storage Baskets (100 b), built, auto-sited at your two nearest resource nodes = **250 R** | **UNIT: The Standard Bearer** 🚩 | **Count Off** ×2 — instantly complete the in-progress train or tech at one building you own |
| *R3 Teach Them a Flag* | March W1 | *see Room Wishes* | | |
| **Dig In** 🛡️ | Keep W1 | **S** `armorInfantry += 1` (≈ half `tape`, 137 R) | 12 free Block Walls + 1 free Block Gate (90 b) = **227 R** | **Dig In** ×2 — `zone` r5, 12 s: friendly units **holding position** inside take −40% damage |
| *R5 Junk Drawer* | Hearth W2 | | | |
| **Second Wave** 🎖️ | March W2 | **T** free `whetstone` (180 R; all military +1 melee/+1 pierce/+1 vehicle) | **the next 8 military units you train arrive at ⭐** (`kills = 3`, +1 atk) ≈ 240 R = **420 R** | ×1 — `spawn` 4 Block Soldiers (320 R) at a friendly building, over pop |
| **The Long Watch** 🔭 | Keep W2 | **L** 2 free Watch Towers (150b+150m) + 120 blocks = **420 R** | **UNIT: The Long Gun** 🎯 — `bonus:{mega:55}`, siege, useless vs infantry | ×1 — `place` one more free Watch Tower instantly, anywhere you have vision (permanent) |

> *The Second Wave conversion is the flagship of this pass: `+3 kills on your standing army` pays 3.0× to the winner; `the next 8 you train arrive at ⭐` pays **most** to the player who is rebuilding. Same fiction, inverted curve.*

#### 🧱 bricks — `buildingHp 1.25, buildRate 1.25, speedInfantry 0.97`

| wish | lane/tier | GIFT | REACH | POWER |
|---|---|---|---|---|
| **Sort By Colour** 🎨 | Hearth W1 | **L** 100 blocks | 3 free Storage Baskets (150 b), built, auto-sited at your three most distant reachable nodes = **250 R** | **Sort** ×2 — convert 100 of one resource into another at **zero market spread** (`MARKET` is normally 45 sell / 65 buy) |
| **What the Picture Showed** 🖼️ | March W1 | **L** 200 blocks | 8 free Block Walls (40 b) = **240 R** | **Take the Stairs** ×2 — **14 s** walkable stair over one ridge segment; **only one may exist at a time** |
| **One Brick Taller** 🧱 | Keep W1 | **S** `mods.wallHp *= 1.8` + retroactive on standing walls & gates (250→450 / 400→720) ≈ 160 R | **UNIT: The Cornerstone** 🧱 + 10 free Block Walls (50 b) = **210 R** | ×2 — instantly finish every wall and gate you have under construction |
| **Everything Is Spare Parts** ⚙️ | Hearth W2 | **L** **retroactive**: `p.wreck` × 0.6 refunded now (every building destroyed this match, yours or theirs) + 250 blocks ≈ **400 R** | 2 free Storage Baskets (100 b) = **500 R** | ×1 — for 60 s every friendly building destroyed refunds 60% of its cost |
| **We Watched Them Build It** 👀 | March W2 | **T** free `steelwork` (320 R; walls +2 armour, +150% hp) | **UNIT: The Copy** 📦 *mega* — unlocked, not free ≈ **460 R** | ×1 — `place` a completed line of 8 Block Walls anywhere you have vision (permanent) |
| **Click. Done.** 🧩 | Keep W2 | **L** 2 free Watch Towers (300 R) + 200 blocks = **500 R**, all standing instantly | — | ×1 — `place` three completed buildings of your choice, up to 150 R each, instantly |

#### 🧸 plush — `unitHp 1.12, healRate 1.5, speedInfantry 0.94, speedWheels 0.94`

| wish | lane/tier | GIFT | REACH | POWER |
|---|---|---|---|---|
| **Leave It On** 🛏️ | Hearth W1 | **L** 120 snacks + 3 free Block Houses (90 b) = **210 R** | **UNIT: The Night Light** 💡 | ×2 — `zone` 15 s: friendly units within 6 tiles of a friendly **building** heal 5 hp/s *(own-ground leash)* |
| *R3 Teach Them a Flag* | March W1 | | | |
| **Hold the Line, Hug the Prisoners** 🤗 | Keep W1 | **S** `healRate *= 1.33` (1.5 → 2.0) ≈ 100 R | 2 free Plush Medics (2 × [60s+25b]) = **270 R** | ×2 — `zone` 20 s: every enemy unit that dies within 5 tiles of a building you own pays you **+20 snacks** |
| **The Warm Heap** 🧺 | Hearth W2 | **L** up to **6** of your fallen `plush`-tagged toys stand back up at your chest at 60% hp over 20 s + 200 snacks ≈ **550 R** | — | ×1 — every friendly unit on the map heals 40 hp instantly (flat per toy, one shot) |
| **Ride or Rescue** 🚑 | March W2 | **T** free `grouphug` (370 R; medics +60% heal, all toys +10% hp) | **UNIT: The Rocking Horse** 🎠 | ×1 — 25 s: your Plush Medics move +80% and heal while moving |
| *R4 Ask the Cat Nicely* | Keep W2 | `needs:'pet'` — alternate **R1@W2** | | |

> **The Warm Heap is the only comeback-shaped card in the catalogue** — it pays *more* the worse the match has gone, the exact inverse of a multiplier. That is Review 2 §3(b) answered directly rather than argued with.

#### 🏎️ racers — `speedWheels 1.15, atkVehicle +1, gather 0.97`

| wish | lane/tier | GIFT | REACH | POWER |
|---|---|---|---|---|
| *R2 Nobody Under the Couch* | Hearth W1 | | | |
| **All the Way Wound** 🔑 | March W1 | **L** 220 snacks | **UNIT: The Slot Car** 🏁 | **Green Light** ×2 — `zone` 10 s: wheeled toys +60% speed and ignore **unit separation only**; `grid.blocked` is never bypassed |
| **Marshals on the Track** 🚩 | Keep W1 | **S** `armorOther += 1` (≈ `quilting`, 160 R) — **cut from `quilting` + `armorOther += 2`** | 3 free Block Houses (90 b) = **250 R** | **Yellow Flag** ×2 — `zone` 8 s: enemy units within 6 tiles of a **building you own** are slowed 40% *(own-ground leash — this is what removes the zero floor)* |
| **Sponsorship** 💰 | Hearth W2 | **L** 500 buttons — **the +12-per-wheeled-kill bounty is cut** | **UNIT: The Pace Car** 🚙 | ×1 — 25 s: one building trains at 3× speed at zero cost |
| **Folded From the Instructions** 📄 | March W2 | **T** free `springs` (300 R; wheels +12% speed) | 120 buttons = **420 R**. **No unit — the Paper Bomber is cut.** | **Full Send** ×1 — 12 s: wheeled toys +100% speed, cannot be ordered to stop, take +25% damage |
| *R4 Ask the Cat Nicely* | Keep W2 | | | |

#### 🤖 bots — `atkPierce +1, atkSpeed 0.9, speedInfantry 0.95`

| wish | lane/tier | GIFT | REACH | POWER |
|---|---|---|---|---|
| **Maintenance Report** 📋 | Hearth W1 | **L** 150 buttons + 2 free Storage Baskets (100 b) = **250 R** | **UNIT: Unit 4** 🔧 | ×2 — `sweep`: instantly repair one friendly building to full |
| **Still Ticking** ⏱️ | March W1 | **S** `atkSpeed *= 0.95` (0.9 → 0.855) ≈ 160 R | 1 free Block House + 90 buttons = **280 R** | **Static Cling** ×2 — chain, **5 links** (cut from 7), 12 pierce each |
| *R1 Left the Light On* | Keep W1 | | | |
| *R5 Junk Drawer* | Hearth W2 | | | |
| **Nobody Came** 🕯️ | March W2 | **T** free `overclock` (320 R; +12% atk speed, +1 ranged) | 1 free Robotics Bay (170 R) = **490 R** | ×1 — `burst`: a sweeping beam (reuses `vfx.beam`), `rng+1.5 × halfW 0.9` |
| **Nobody Winds Us But Us** 🔧 | Keep W2 | **L** 2 free Watch Towers (300 R) + 150 buttons = **450 R** | **UNIT: Rewound** ⚙️ *mega* | ×1 — `aura` 25 s: every friendly unit that would die instead survives at 1 hp, **once each** (`u.aura = {k:'wound', t:25}`; one branch at the top of `kill()`) |

> **The Wind-Up Alarm is cut.** It required a third attackable entity kind with six explicit exclusions, a fuse, a synthetic-attacker damage path and a new snapshot key — and as a building it would have kept a dead player alive (`playerAlive`, `game.js:4498-4515`, returns true on any building + a worker), which is a stalemate generator. *Nobody Winds Us But Us* is better fiction and costs an aura.

#### 🏰 knights — `buildingHp 1.2, unitHp 1.05, speedInfantry 0.94`

| wish | lane/tier | GIFT | REACH | POWER |
|---|---|---|---|---|
| **Somebody Asked For Us** 🏰 | Hearth W1 | **L** 150 blocks + 2 free Block Houses + 1 free Storage Basket (110 b) = **260 R** — **`buildRate 1.2` is cut** | — | **Unpacking Day** ×2 — the next building you place finishes instantly |
| **The Warm Egg** 🥚 | March W1 | **L** 180 blocks + 2 free Block Houses (60 b) = **240 R** | **UNIT: The Hatchling** 🥚 | ×2 — `burst`: green splash from 2.0 tiles at a point you aim |
| **To Be Raised** 🛡️ | Keep W1 | **S** `buildingHp *= 1.15` + retroactive on standing buildings ≈ 180 R | 8 free Block Walls + 1 free Block Gate (70 b) = **250 R** | ×2 — 20 s: one building you own takes −60% damage |
| **Everything Came With It** 📦 | Hearth W2 | **L** 4 free Block Houses (120 b) + 1 free Watch Tower (150 R) + 250 blocks = **520 R**, all standing where you choose | — | ×1 — `sweep`: every building you own repairs to full and gains +25% max hp for 60 s |
| **Nine Hundred Bedtimes** 🐉 | March W2 | **L** **1 free Toy Dragon** (280s+180m = **460 R**, 50 s of production) — spawned at a Dragon Roost **you own**, in the **Fort Age**; otherwise it parks in `p.wishHold` and hatches the instant both are true | *nothing else — the dragon is the wish.* **`chivalry` is cut** | ×1 — `burst`: a strafing run, 140 to buildings in a line |
| **The Old Guard** 🎗️ | Keep W2 | **T** free `tape` (275 R; infantry +1/+1) — **cut from `buildingHp` → 1.5 and +2 infantry armour** | **UNIT: The Empty Suit** 🛡️ *mega* + your Toy Forts and Watch Towers self-repair at 6 hp/s ≈ **425 R** | **ONE MORE NIGHT** ×1 — see below |

> ### ONE MORE NIGHT 🕯️ — the Tidy Up replacement
>
> ```js
> { id:'onemorenight', tier:2, charges:1, at:'ownBuilding',
>   spawn:{ type:'emptysuit', n:3, overPop:true },   // kernel 3
>   life:45, leash:12 }                              // leaves the leash ⇒ lies down at once
> ```
> Cast on a completed building you own. Three Empty Suits — the wish's own unit, 400 hp, 7/9 armour — stand up for 45 seconds, then lie down again.
>
> | property | why it fixes the defect |
> |---|---|
> | **lump** | 1200 hp added to a 5-toy defence is decisive; added to a 40-toy deathball it is +10%. Comeback-shaped by construction. |
> | **counterplay** | ordinary units — focusable, kitable, out-ranged. `bonus:{heavy:n}` already exists on `crossbow` (+3), `paladin` (+6), `bowhunter` (+2); siege ignores their 7/9 entirely. |
> | **cannot win a won game** | the 12-tile leash means it **cannot reach an enemy base**. A power that only works on your own ground is structurally not a leader's tool — the leader is not the one being attacked. |
> | **cannot be banked** | it is a *placement*, not a save. Held uncast it pays nothing; hoarding is strictly worse than using it. |
> | **precedent** | `spawnUnit` already bypasses `popCap` (it only does `p.popUsed++`). Zero new machinery. |
>
> **Why Tidy Up could not be nerfed.** The axis is categorical, not numerical: **a leader's only loss condition is one catastrophic engagement.** A free perfect disengage deletes that condition. Any surviving version held on a 1-charge banked resource is still that object with worse numbers. The spec cleared it on damage and denial — but Tidy Up wins by **subtraction**, and that axis was never tested.

#### 🤠 wranglers — `gather 1.04, buildingHp 0.92`

| wish | lane/tier | GIFT | REACH | POWER |
|---|---|---|---|---|
| *R2 Nobody Under the Couch* | Hearth W1 | | | |
| **The Whole Herd** 🐎 | March W1 | **L** 100 snacks + 3 free Block Houses (90 b) = **190 R** | **UNIT: The Longhorn** 🐄 | **Round-Up** ×2 — 6 s: every friendly unit within 8 tiles moves +50% toward a point you pick (a rally, **not** a teleport) |
| **Mend the Fence** 🔨 | Keep W1 | **T** free `pockets` (125 R; workers carry +4) — **`buildingHp ×1.2` is cut** | 2 free Storage Baskets + 8 free Block Walls (140 b) = **265 R** | ×2 — `sweep`: instantly repair every friendly building within 8 tiles to full |
| **Bring 'Em All Home** 🏠 | Hearth W2 | **L** 400 snacks + 2 free Snack Mats (90 b) = **490 R** | **UNIT: Old Blue** 🐕 — and Old Blue fetches Lost Toys on its own (`u.carryLost` already exists and already pays `LOST_TOYS.bounty` 80) | ×1 — `sweep`: every worker instantly deposits its carry and returns to its node |
| *R6 Loose Floorboard* | March W2 | | | |
| **Don't Touch the Herd** 🐂 | Keep W2 | **S** `armorOther += 1` ≈ 160 R | 1 free Log Fort (180 R) + 100 snacks = **440 R** | **Circle the Wagons** ×1 — `zone` 18 s: friendly units within 6 tiles take −30% damage and heal 4 hp/s; **must be cast within 12 tiles of a building you own** |

#### 🪶 plains — `speedInfantry 1.05, buildingHp 0.9`

| wish | lane/tier | GIFT | REACH | POWER |
|---|---|---|---|---|
| **Move the Camp** ⛺ | Hearth W1 | **L** 120 snacks + 3 free Snack Mats (135 b) = **255 R** | — | **Move the Camp** ×2 — pick up one completed non-chest building you own and re-place it anywhere you have vision. *An event, not a rate. Zero seconds.* |
| **What Walks With Us** 🐾 | March W1 | **L** 80 snacks + 4 free Block Houses (120 b) = **200 R** | **UNIT: The Painted Pony** 🐎 | ×2 — `zone` r6, 14 s: friendly units inside move +35% and take −20% ranged damage |
| *R1 Left the Light On* | Keep W1 | | | |
| **Follow the Season** 🍂 | Hearth W2 | **S** `mods.farmRate = 1.25` → Snack Mats gather **1.0** instead of 0.8 — **cut from 2×**, and the **−35% pile depletion is cut entirely** | 4 free Snack Mats (180 b) + 200 snacks = **460 R** | ×1 — for 30 s every Snack Mat you own yields double |
| *R6 Loose Floorboard* | March W2 | | | |
| **Keeping Everything That Does** 🗿 | Keep W2 | **T** free `reinforced` (300 R; all military +15% hp) | **UNIT: The Old Stone** 🗿 *mega* + 1 free Great Teepee (180 R) = **480 R** | ×1 — `burst` 60 damage in 3 tiles at a point you aim; the ground there becomes a **permanent** zone slowing enemies 25% |

#### 🚪 The six Room Wishes — all lump, none carries a unit

| wish | lane | GIFT | REACH / POWER |
|---|---|---|---|
| **R1 Left the Light On** 💡 | Keep | **W1:** **L** 1 free Watch Tower (150 R) + 120 blocks = **270 R**. **W2 (pet alternate):** 2 Watch Towers (300 R) + 180 blocks = **480 R** | POWER ×2 (×1 at W2) — a `light` zone r10/20 s (r14/30 s at W2) revealed to your team. ⚠️ **sim writes the zone; the view reads it.** `FogOfWar.vis` is per-client view state and reading it in sim desyncs instantly |
| **R2 Nobody Under the Couch** 🛋️ | Hearth | **L** 200 snacks + 80 blocks = **280 R** | POWER ×2 — `claim`: reveal every Lost Toy and instantly collect **2** (`LOST_TOYS.bounty: 80` each, `data.js:2168`) |
| **R3 Teach Them a Flag** 🚩 | March | **L** 100 snacks | REACH — the nearest unclaimed Wild Toy camp joins you now (`WILD_TRIBES.comp: ['scout','soldier','soldier']` + `bounty: 60`, `data.js:2124`); **if the map has no camp, the same three toys muster at your chest instead** (5 of 12 maps have no `tribes` — a dead reach is a trap). ≈ **300 R**. POWER ×2 — 30 s, your military counts double when contesting a camp |
| **R4 Ask the Cat Nicely** 🐈 | Keep | **L** the House Cat (or Yard Dog) becomes yours — `owner = you`, swat 9 → 13, `bonus:{worker:4}`. **One entity ⇒ pure lump.** + 150 snacks ≈ **450 R** | POWER ×1 **She's In A Mood** — the cat sprints to a point you choose and swats there for 20 s. `needs:'pet'` |
| **R5 Junk Drawer** 🗄️ | Hearth | **L** 150 snacks + 150 blocks + 100 buttons + 50 marbles + 1 free Storage Basket = **500 R** | POWER ×1 — `sweep`: every worker instantly deposits its carry, and one resource pile you pick refills to 200. *At minute 6–10 with 1–9 minutes left, a lump is the correct shape. A rate is not.* |
| **R6 Loose Floorboard** 🕳️ | March | **L** 250 blocks + 150 snacks = **400 R** | REACH — a **permanent** Loose Board `zone` (r5, `t: -1`) placed within 12 tiles of a building you own: enemy ground units inside move −35%; yours are unaffected (they know which board creaks). ≈ **500 R**. POWER ×1 **Creak** — 8 s: the board's radius doubles and enemies inside lose their current order |

> **The Floorboard "mouths" are cut.** A pair of linked teleport entities needed a third entity kind, `playerAlive`/`reqAge2Count`/AI-census/`blocked`/`stats.razed` exclusions **and** its own snapshot key — verified: `snapshot()`'s catch-all at `game.js:2374` returns `{k:'o', …}` and `restore()`'s bare `else` builds a **Lost Sticker**, so a saved-and-reloaded mouth silently becomes a free `STICKER.incomePerSec` node. A permanent zone does all the fiction's work with machinery that already round-trips.
>
> **R2 is a human-only edge and must not be tuned from battery data.** The AI never seeks strays (documented, deliberate — the SP fantasy, like Empire cards), so R2 will read weaker in Batteries A and B than in Kyle's hands.

### 3.9 The 16-unit roster

**Rules, all enforced:** every `modelKey` is an existing `MODEL_MANIFEST` key (verified `data.js:596-673`) — **never add a manifest entry**, `loadUnitModels` (`models.js:342`) downloads every manifest key and an alias re-downloads the GLB. **Never set `def.faction`** — there are **eleven** read sites (`game.js:2660, 2715, 4107, 4238, 4280` · `ui.js:212, 579, 662` · `main.js:558, 560, 561`), and the AI fort pick at `4238` is a bare `Object.keys(UNITS).find(k => UNITS[k].faction === …)` a new faction-tagged unit can hijack. **Append wish units at the END of the `UNITS` literal** — insertion order is the AI's `find()` order. `tint: {color, amount, rough, metalness?, emissive?, emissiveIntensity?}` — **no `scale` in the tint**; scale comes from `targetHeight` only, because `makeProcView` never sets `view.model` and the role-silhouette multiply at `models.js:1513` is `view.model`-guarded.

Rendered height = `targetHeight × 1.16` for `mega`, ×1.0 otherwise.

| # | faction / lane / tier | unit | `modelKey` | `targetHeight` → rendered vs donor | delta | age |
|---|---|---|---|---|---|---|
| 1 | classic · Hearth · W1 | **The Standard Bearer** 🚩 | `lancer` | 0.78 vs Pogo Lancer 0.62 | **+26%** | 2 |
| 2 | classic · Keep · W2 | **The Long Gun** 🎯 | `trebuchet` | 0.86 vs 0.70 (both ×1.07 siege) | **+23%** | 2 |
| 3 | bricks · Keep · W1 | **The Cornerstone** 🧱 | `knight` | 0.66 vs Castle Knight 0.52 | **+27%** | 2 |
| 4 | bricks · March · W2 | **The Copy** 📦 *mega* | `tank` | 0.998 vs General's Tank 0.812 | **+23%** | **3** |
| 5 | plush · Hearth · W1 | **The Night Light** 💡 | `medic` | 0.72 vs Plush Medic 0.52 | **+38%** + it **glows** | 2 |
| 6 | plush · March · W2 | **The Rocking Horse** 🎠 | `charger` | 0.76 vs Mounted Charger 0.62 | **+23%** | 2 |
| 7 | racers · March · W1 | **The Slot Car** 🏁 | `dragster` | 0.58 vs Nitro Dragster 0.42 | **+38%** | 2 |
| 8 | racers · Hearth · W2 | **The Pace Car** 🚙 | `cart` | 0.64 vs Delivery Cart 0.50 | **+28%** | 2 |
| 9 | bots · Hearth · W1 | **Unit 4** 🔧 | `forgotten` | 0.46 vs 0.60 | **−23%**, **zero skirmish collision** | 2 |
| 10 | bots · Keep · W2 | **Rewound** ⚙️ *mega* | `forgottenking` | 1.10 vs The First Forgotten 1.276 | **−14%**, **zero skirmish collision** | **3** |
| 11 | knights · March · W1 | **The Hatchling** 🥚 | `dragon` | 0.45 vs Toy Dragon 1.218 | **−63%** | 2 |
| 12 | knights · Keep · W2 | **The Empty Suit** 🛡️ *mega* | `titanbot` | 1.16 vs Titan Bot 0.90 | **+29%** | **3** |
| 13 | wranglers · March · W1 | **The Longhorn** 🐄 | `bear` | 0.66 vs Big Bear Hug 0.85 | **−22%** | 2 |
| 14 | wranglers · Hearth · W2 | **Old Blue** 🐕 | `thunderhoof` | 0.50 vs Thunderhoof 0.905 | **−45%** | 2 |
| 15 | plains · March · W1 | **The Painted Pony** 🐎 | `rider` | 0.74 vs Lasso Rider 0.62 | **+19%** | 2 |
| 16 | plains · Keep · W2 | **The Old Stone** 🗿 *mega* | `golem` | 1.102 vs Brick Golem 0.70 | **+57%** | **3** |

**Silhouette rulings, made explicitly.**
- **`forgotten` and `forgottenking` are the cleanest chassis in the game for a wish unit** — the Forgotten One and The First Forgotten are AI-only survival horde, never player-buildable, so collision in every skirmish, campaign and MP match is **zero**. The only overlap is Survival, where bots-vs-Forgotten is the fiction rather than a bug.
- **The Hatchling is same-army on purpose.** It is the baby of your own dragon: 63% smaller, jade instead of red. That is not a collision, it is the joke landing.
- **The Empty Suit is an accepted single-matchup risk** (knights-vs-bots, 2 of 56 ordered pairs): +29% and near-white metalness 0.85 against titanbot's gunmetal `0x7a828f`. **Named fallback if playtest disagrees: `colossus` 1.10 → 0.95.**
- **The Slot Car is the roster's thinnest ruling** — same-army with the Nitro Dragster, saved by +38% and a tier gap (age 2 vs age 3). **Named fallback: `monster` @0.55, −37% vs Monster Truck's 0.87 rendered.**
- **The Night Light's bloom is its silhouette.** Verified numerically: `0xffd97a` → linear (1.0, 0.695, 0.194); × 2.6 → (2.6, 1.81, 0.50); luma **1.88**, past `bloomThreshold 1.0` *and* past the +0.55 soft knee (`post.js:129`). Bloom bleeds beyond the silhouette, so it survives even the 7-px surveying zoom. It is the only unit in the roster that reads at maximum zoom-out.
- **Plains A2 is `golem`, not `dragon`** — the Painted Plains do not have dragons, and `golem` is fielded only by the Brick Golem at 0.70.
- **No base-disc work.** `BASE_DISC_CUT` (`models.js:297`) is keyed by manifest key and applied at load, so a re-tinted `knight` or `charger` inherits the already-pruned mesh for free. The other twelve chassis ship un-cut today and are unchanged.

**The tint call site — the one placement that matters:**

```js
// models.js createUnitView — BETWEEN line 1499 and the addCommonRings call at 1500
if (def.tint) applyUnitTint(view, def.tint);
addCommonRings(view, def, owner, def.tags.includes('siege') ? 0.42 : 0.32);
```

Before the rings, the traverse never sees the contact shadow, the team ring or the selection ring — so **team colour is safe**. All three view-construction sites (`spawnUnit` 1730, `restore` 2382, `convertUnit` 3794) route through `createUnitView`, so the tint round-trips through saves and survives conversion with zero snapshot work.

**`applyUnitTint` must clone before it mutates.** `Object3D.clone()` and `cloneSkinned` (`models.js:400+`) **share materials between instances** — `applyUnitTier`'s own comment says so. Mutating `material.color` without cloning repaints every other toy on that GLB, **including the enemy's General's Tank when you field The Copy.** And it must **not** touch `_tierInit`, `_tierMats` or `_baseScale` — see Patch 12.

**Wish units never enter a `trains` array.** `ui.js:662` filters the trains loop only on `def.faction`, so a faction-less unit in `trains` shows a button to everyone; and the AI's faction-workshop picker (`game.js:4276-4280`) picks uniformly from `opts`, so a wish unit joins `opts` for **every** seat, is picked ~1/len of the time, `trainUnit` refuses, and that building trains nothing that tick, all match — a permanent AI throughput regression from a pure-data line, which would contaminate Battery B against the very baseline it exists to compare with. The train button is a `cmds.push` in `ui.buildCommandsFor` **after** the trains loop and **before** the single `buildCard(cmds)` call, guarded by `hasWishUnit(me, key) && w.unit.at.includes(first.type)`.

The one sim gate, in `trainUnit` right after the faction check at **`game.js:2715`**:
```js
if (def.wish && !this.hasWishUnit(b.owner, type)) {
  if (b.owner === this.myId) this.alert(`${def.name} is not one of your wishes.`, 'warn');
  return false;   // LOUD — every other rejection in trainUnit alerts
}
```
⚠️ **`trainUnit` never checks `b.def.trains.includes(type)`** — that is why the AI fort pick at `:4238` works at all. So `def.wish` is the only gate.

**Fallbacks.** `if (proceduralEra) registry = {}` (`models.js:1488`), and a failed GLB load leaves `registry[key]` undefined (`:365-368`). Every wish unit therefore declares a `proc:` fallback (its donor's `proc` kind where one exists, else `'soldier'`), or it becomes a grey box in Toy Box Zero.

**`PORTRAITS` is keyed by the model registry, not `UNITS`** (`models.js:2292`). One line each after `renderPortraits(registry, BUILDINGS)` (`main.js:249`): `PORTRAITS.standard = PORTRAITS.soldier;` — otherwise all sixteen fall back to `U_ICONS[k] || '🧸'` and show the same teddy.

**The Codex leak.** `main.js:1353` builds the "toys" tab from `Object.keys(UNITS)` — all sixteen wish units would be publicly listed to every player of every faction. Filter `!def.wish` there (Slice 2), and add a `wishes:` bucket to `lore.js` (it is a nested `{factions, units, …}` object at `lore.js:7-8` with nowhere for them to degrade into).

---

## 4 · THE CORRECTED 8 × 2 × 3 MENU

Read Hearth → March → Keep. **Bold = carries the wish unit.** *Italic = Room Wish.*

| faction | 🕯️ HEARTH W1 | 👣 MARCH W1 | 🛡️ KEEP W1 | 🕯️ HEARTH W2 | 👣 MARCH W2 | 🛡️ KEEP W2 |
|---|---|---|---|---|---|---|
| 🎁 **classic** | **Quartermaster's List** ⟨Standard Bearer 🚩⟩ | *R3 Teach Them a Flag* | Dig In | *R5 Junk Drawer* | Second Wave | **The Long Watch** ⟨Long Gun 🎯⟩ |
| 🧱 **bricks** | Sort By Colour | What the Picture Showed | **One Brick Taller** ⟨Cornerstone 🧱⟩ | Everything Is Spare Parts | **We Watched Them Build It** ⟨The Copy 📦 *mega*⟩ | Click. Done. |
| 🧸 **plush** | **Leave It On** ⟨Night Light 💡⟩ | *R3 Teach Them a Flag* | Hold the Line, Hug the Prisoners | The Warm Heap | **Ride or Rescue** ⟨Rocking Horse 🎠⟩ | *R4 Ask the Cat Nicely* ⁽ᵃ⁾ |
| 🏎️ **racers** | *R2 Nobody Under the Couch* | **All the Way Wound** ⟨Slot Car 🏁⟩ | Marshals on the Track | **Sponsorship** ⟨Pace Car 🚙⟩ | Folded From the Instructions | *R4 Ask the Cat Nicely* ⁽ᵃ⁾ |
| 🤖 **bots** | **Maintenance Report** ⟨Unit 4 🔧⟩ | Still Ticking | *R1 Left the Light On* | *R5 Junk Drawer* | Nobody Came | **Nobody Winds Us But Us** ⟨Rewound ⚙️ *mega*⟩ |
| 🏰 **knights** | Somebody Asked For Us | **The Warm Egg** ⟨Hatchling 🥚⟩ | To Be Raised | Everything Came With It | Nine Hundred Bedtimes | **The Old Guard** ⟨Empty Suit 🛡️ *mega*⟩ |
| 🤠 **wranglers** | *R2 Nobody Under the Couch* | **The Whole Herd** ⟨Longhorn 🐄⟩ | Mend the Fence | **Bring 'Em All Home** ⟨Old Blue 🐕⟩ | *R6 Loose Floorboard* | Don't Touch the Herd |
| 🪶 **plains** | Move the Camp | **What Walks With Us** ⟨Painted Pony 🐎⟩ | *R1 Left the Light On* | Follow the Season | *R6 Loose Floorboard* | **Keeping Everything That Does** ⟨Old Stone 🗿 *mega*⟩ |

⁽ᵃ⁾ `needs:'pet'`; alternate = **R1 Left the Light On @ W2**, declared as the 4th id.

**Structural properties, and only the true ones.** Delete *"the wish unit's lane is never predictable: March ×9, Keep ×5, Hearth ×2"* — counting across 16 slots hides the per-faction truth. The honest claims:

- **Distribution: Hearth 5 · March 6 · Keep 5** (was 1 / 10 / 5).
- **No faction's two units share a lane — 8 of 8.**
- **Every faction reaches a toy without picking March — 8 of 8.** (classic H+K · bricks K · plush H · racers H · bots H+K · knights K · wranglers H · plains K.)
- **Six factions have exactly one March toy; two have none; none has two.**
- **All four `mega` units are Wish II.** Three sit in Keep, one in March. *The lane that contains the big scary toy is no longer the lane that contains everything.*
- **No Room Wish carries a unit** — a Room Wish appears in two factions' menus, so a unit on one would be reachable by two tribes with one tint.
- Every faction gets exactly one wish per lane per tier. No menu can be two economy picks and a finisher.
- Each Room Wish appears in exactly two menus, in a **different lane at W1 than at W2** for every faction that gets one (classic March→Hearth ✓ · plush March→Keep ✓ · racers Hearth→Keep ✓ · bots Keep→Hearth ✓ · wranglers Hearth→March ✓ · plains Keep→March ✓).
- **Knights and bricks are 100% bespoke** — six wishes each.

### "Keep now holds three megas — is Keep the new auto-pick?"

No, and the answer is a stat line, not an argument: **every Keep mega is melee-only, `range ≤ 1.2`, `speed ≤ 1.2`.** The Empty Suit (7/9 armour), Rewound and The Old Stone (`slam: 2.4`, `bonus:{building:16}` at melee range) punish an army that walks into them; none can *reach* an opponent's base in the time a 7–15 minute match has left. The March mega — The Copy on the `tank` chassis, 6 range, splash 2.0 — is the one with reach. That is the lane difference, expressed as geometry.

### Four factions, two picks, genuinely different armies

The four Review 2 named as *"2 of 3 lanes are pure spreadsheets."*

**🎁 classic — a centre, or a crowd.** *Hearth → Keep (both toys):* the Standard Bearer, then the Long Gun. Your army acquires a **centre it does not want to leave** — an aura body your soldiers cluster around while your workers gather 12% faster in the same circle — and a piece that fires 55 siege at anything `mega` and is useless against infantry. You fight set-piece defensive engagements on your own half because two of your units are punished for leaving it. *March → March (no new unit, and still toys):* *Teach Them a Flag* hands you a Wild Toy camp — `scout + soldier + soldier` **plus 60 buttons**; *Second Wave* promotes the standing army and the next eight. Same unit types, more of them, all veteran. One build changes the army's **shape**, the other its **size**. Both put toys on the board — which is why classic's March lane survives having no unit def in it.

**🧱 bricks — a gun line, or a golem count.** *Keep → March:* the Cornerstone (armour 5/8, `bonus:{siege:10}`, speed 0.85) plugs your gate, so you deliberately leave a hole and let them come to it; then The Copy at 6 range and 2.0 splash outranges every ground body on the board from behind that hole. Bricks stop being a turtle and become **an artillery position with bait**. *Hearth → Hearth:* *Sort By Colour* + *Everything Is Spare Parts*. Brick Golems cost **190 blocks + 60 marbles** — and bricks' structural problem is that blocks are also their walls. The unit list is identical; the **ratio is not**: four golems where you used to field two walls and a golem.

**🤖 bots — an anvil, or a longer life.** *Hearth → Keep (both toys):* Unit 4, then Rewound. Zap Bots (`atkPierce +1`, `atkSpeed 0.9`, range 4.2) firing from behind a service bot healing 4 hp/s, with a 520-hp mega that regenerates 8 hp/s whenever it has not swung in four seconds standing in front. This is the answer to `speedInfantry 0.95` that **does not cancel the number**: you stop needing to march. *March → March:* *Still Ticking* + *Nobody Came* — the same bots, refusing to die, produced without pause. The difference is **positional**: one build wants a chokepoint, the other a front line.

**🏎️ racers — a self-sufficient raid, or a survivable one.** *March → Hearth (both toys):* the Slot Car (spd 5.29, `bonus:{worker:7}`), then the Pace Car. The pack **never comes home** — the truck goes with it, healing 6 hp/s at speed 3.4, faster than everything it repairs. A mobile forward base is a shape this game does not currently contain, and racers get it **without a flier**. *Keep → Keep:* `armorOther += 1` takes 0/0 wheels to 1/1, and the House Cat becomes a 13-damage predator you aim at their economy. One build makes the raid self-sufficient; the other makes the raiders survivable and **outsources the raid entirely**.

---

## 5 · THE TECHNICAL PATCHES

All anchors below were verified as **exact whole-line matches, one occurrence each** (including leading whitespace), against the live files this pass. `game.js` has drifted under this spec before — **re-verify before applying.**

Verified anchor lines: `game.js` — 43, 291, 314, 329, 1695, 1749, 2232, 2257, 2260, 2264, 2323, 2329, 2339, 2398, 2416, 2599, 2600, 2778, 2896, 3268, 4923 · `main.js` — 1786, 1791, 1809 · `net.js` — 99, 154, 186 · `data.js` — 393 (via the line above it, which *is* unique) · `models.js` — 1499/1500, 1550.

**Cadence fact that sizes Patch 1.** `stateHash()` is **not** called per tick. `net.js:224` calls it only when `this.tick % 100 === 0` — once per 5 sim-seconds per client — plus once at the end of `__ttNetTest` (`main.js:1882`). The added fold is ≤ (31 techs + 18 mods keys + ≤2 wishes + ≤2 charges) memoised Map lookups per player, ≈ 200 lookups every 5 seconds at 4 players. **That is why the answer is "compute it fresh, never cache it."** A dirty-flag cache on `p.techs` would reintroduce the exact bug being fixed the first time a future grant site forgot to invalidate — and it would fail *silently*.

---

### PATCH 0 — hash helpers + `ADDITIVE_MODS`

**`game.js:43`** — ANCHOR:
```js
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
```
REPLACE WITH:
```js
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

// ---------------- desync-hash helpers (stateHash only) ----------------
// A stable 32-bit code for any string key — tech ids, mods keys, wish ids, zone
// kinds, aura kinds. Memoised, so stateHash() pays one Map lookup per entry.
// Every client derives the same code from the same literal, so no table ever
// travels. Forced ODD so a code is never 0 — a zero code would multiply its
// entry straight out of the hash.
const HASH_CODES = new Map();
function keyCode(s) {
  let c = HASH_CODES.get(s);
  if (c === undefined) {
    c = 5381 | 0;
    for (let i = 0; i < s.length; i++) c = (Math.imul(c, 33) ^ s.charCodeAt(i)) | 0;
    c |= 1;
    HASH_CODES.set(s, c);
  }
  return c;
}
// Order-independent fold of a SET of string keys. Accumulate with `+` ONLY
// (Law 4 — Set iteration order is identical across clients today but is not
// guaranteed to survive a restore), and SQUARE each code so the fold is
// non-linear: with a plain sum, two different subsets of a 31-key tech pool can
// cancel into the same total, and the whole point of this fix is that they must not.
function foldKeys(iter) {
  let h = 0 | 0;
  for (const s of iter) { const c = keyCode(s); h = (h + Math.imul(c, c)) | 0; }
  return h;
}
// The mods that ADD rather than multiply. ⚠️ `armorOther` was MISSING from the
// inline whitelist at game.js:329 — it is additive (initialises to 0 at :311,
// and `quilting` does `m.armorOther += 1` at :1863), so any faction or wish
// declaring `armorOther` would have been MULTIPLIED into 0 and silently done
// nothing. One shared Set so the faction loop and applyWish can never disagree
// about a key's arithmetic again.
const ADDITIVE_MODS = new Set(['carry', 'atkMelee', 'atkPierce',
  'armorInfantry', 'armorOther', 'atkVehicle']);
```

**`game.js:329`** — ANCHOR:
```js
        if (k === 'carry' || k === 'atkMelee' || k === 'atkPierce' || k === 'armorInfantry' || k === 'atkVehicle') {
```
REPLACE WITH:
```js
        if (ADDITIVE_MODS.has(k)) {
```

---

### PATCH 1 — `stateHash` is blind to wishes (and to two things it should already see)

**1a · `game.js:2260`** — ANCHOR:
```js
      h = (h + p.age * 53 + p.techs.size * 59) | 0;
```
REPLACE WITH:
```js
      h = (h + p.age * 53) | 0;
      // ⚠️ FIXED: this line read `+ p.techs.size * 59`, which hashed the COUNT,
      // not the contents. Grant tech A on one client and tech B on the other and
      // the hash AGREED — __ttNetTest was provably blind to every tech-granting
      // desync in the game, wishes included.
      h = (h + Math.imul(foldKeys(p.techs), 59)) | 0;
      // ⚠️ FIXED: p.mods was absent ENTIRELY. Faction mods (:326-334), applyTech
      // (:1831) and now applyWish all write here, and none of it was visible to
      // the hash until it eventually moved a unit. Quantised to 1/4096 (any
      // change ≥0.025% shows) and mixed with the KEY, so the fold is
      // order-independent AND a value landing on the wrong key still shows.
      // (A NaN mod quantises to 0 on both clients: it stays in sync but hides —
      // that is what G6's headless zero-throw pass is for, not this.)
      let mh = 0 | 0;
      for (const k in p.mods) mh = (mh + Math.imul(keyCode(k), (p.mods[k] * 4096) | 0)) | 0;
      h = (h + Math.imul(mh, 61)) | 0;
      // wish state: picks, charges, the clocks, the offer state, the deferred
      // gift and the wreck accumulator. `+` only — Law 4.
      if (p.wishes) h = (h + Math.imul(foldKeys(p.wishes), 67)) | 0;
      if (p.wishCharges) {
        let ch = 0 | 0;
        // (v|0)+1 so "spent down to 0" can never hash the same as "never held it"
        for (const k in p.wishCharges) ch = (ch + Math.imul(keyCode(k), (p.wishCharges[k] | 0) + 1)) | 0;
        h = (h + Math.imul(ch, 71)) | 0;
      }
      h = (h + ((p.wishCd || 0) * 8 | 0) * 73 + ((p.wishT || 0) * 8 | 0) * 79
             + (p.wishOffered | 0) * 83 + ((p.wreck || 0) | 0) * 89) | 0;
      if (p.wishHold) h = (h + Math.imul(keyCode(p.wishHold), 97)) | 0;
      // ⚠️ stats.lost is now SIM-LOAD-BEARING — it fires the early Bell. It was
      // never hashed before because nothing read it.
      h = (h + (p.stats.lost | 0) * 101) | 0;
```

**1b · `game.js:2257`** — ANCHOR:
```js
      if (e.kind === 'objective') h = (h + (e.holder + 2) * 29 + ((e.holdTime || 0) * 8 | 0) * 3) | 0;
```
REPLACE WITH:
```js
      if (e.kind === 'objective') h = (h + (e.holder + 2) * 29 + ((e.holdTime || 0) * 8 | 0) * 3) | 0;
      // an aura is sim state living ON the unit; a squad buff applied on one
      // client and not another must show HERE, not 200 ticks later in positions.
      // +1 on the clock so a live aura rounding to t=0 never hashes as "no aura".
      if (e.aura) h = (h + Math.imul(keyCode(e.aura.k),
        ((e.aura.t * 8) | 0) + 1 + (e.aura.used ? 4096 : 0))) | 0;
```

**1c · `game.js:2264`** — ANCHOR:
```js
    // commodity prices are shared sim state — fold them in
```
REPLACE WITH:
```js
    // ⚠️ zones live OUTSIDE this.entities, so the entity loop above never sees
    // them — and they multiply speedOf (:1779) and startSwing (:3250). Un-hashed,
    // a zone that exists on one client and not another is invisible until the
    // speed difference finally moves a toy. `+` only (Law 4); z.id is safe as a
    // multiplier because nextId starts at 1, never 0.
    for (const z of this.zones) {
      h = (h + Math.imul(keyCode(z.kind), z.id) + (z.owner + 2) * 3) | 0;
      h = (h + ((z.x * 64) | 0) * 7 + ((z.z * 64) | 0) * 13
             + ((z.r * 16) | 0) * 5 + ((z.t * 8) | 0) * 11) | 0;
    }
    // commodity prices are shared sim state — fold them in
```

---

### PATCH 2 — `u.aura` at all five sites

**2a · birth — `game.js:1749`** — ANCHOR:
```js
      dead: false, wasMoving: false, spawnT: fromBuilding ? 0.35 : 0,
```
REPLACE WITH:
```js
      aura: null, // born aura-less, so `undefined` never reaches stateHash
      dead: false, wasMoving: false, spawnT: fromBuilding ? 0.35 : 0,
```

**2b · writer — `game.js:2339`** — ANCHOR:
```js
            fleeResume: this.encOrder(e.fleeResume), bellResume: this.encOrder(e.bellResume),
```
REPLACE WITH:
```js
            fleeResume: this.encOrder(e.fleeResume), bellResume: this.encOrder(e.bellResume),
            // ⚠️ this record is an explicit WHITELIST, not a spread — a field not
            // named here does not survive a save. An aura is FLAT PRIMITIVES ONLY
            // ({k, t, used}); if a power ever needs an aura to point at an entity
            // it must be id-encoded the way encOrder does, or restore relinks it
            // to an object from the previous match.
            aura: e.aura ? { ...e.aura } : null,
```

**2c · reader — `game.js:2416`** — ANCHOR:
```js
          dead: false, wasMoving: false, spawnT: 0,
```
REPLACE WITH:
```js
          aura: se.aura ? { ...se.aura } : null,
          dead: false, wasMoving: false, spawnT: 0,
```

**2d · death — `game.js:2896`** — ANCHOR:
```js
      this.players[e.owner].stats.lost++;
```
REPLACE WITH:
```js
      this.players[e.owner].stats.lost++;
      e.aura = null; // a corpse keeps hashing until removeT expires — and a
                     // resurrect power must never hand a toy back its old buff
```

**2e · the tick — `game.js:3268`** — ANCHOR:
```js
    if (u.garrisoned) return; // tucked away inside a building
```
REPLACE WITH:
```js
    if (u.garrisoned) return; // tucked away inside a building
    // aura clock. SIM code — no Math.random here (the sparkle is vfx.js). Ticked
    // BEFORE the order block so a buff expiring this frame does not get one free
    // swing at the old rate. A garrisoned toy's aura freezes, deliberately and
    // identically on every client — the same treatment u.cd already gets.
    if (u.aura) { u.aura.t -= dt; if (u.aura.t <= 0) u.aura = null; }
```

---

### PATCH 3 — `this.zones`

**3a · constructor — `game.js:291`** — ANCHOR:
```js
    this.projectiles = [];
```
REPLACE WITH:
```js
    this.projectiles = [];
    // Zone powers (Green Light, Yellow Flag, Dig In, the Loose Board…) are SIM
    // objects that deliberately live OUTSIDE `this.entities` — no hp, not
    // targetable, therefore never seen by nearestEnemy (:3050), pickTarget
    // (:3064), the right-click gate (:2617) or playerAlive. Records are flat
    // primitives plus an optional view handle:
    //     { id, kind, owner, x, z, r, t }        // t < 0 ⇒ permanent
    // ⚠️ ids come from `this.nextId++`, the SAME counter as entities, on purpose:
    // nextId already round-trips (restore, :2575), so a restored zone can never
    // collide with an entity minted later in the resumed match.
    this.zones = [];
```

**3b · snapshot — `game.js:2323`** — ANCHOR:
```js
      timeline: this.timeline,
```
REPLACE WITH:
```js
      timeline: this.timeline,
      // ⚠️ EXPLICIT FIELD LIST, never `{...z}`. A zone carries `z.view` (a
      // THREE.Group), and Object3D has a `parent` back-reference — so spreading
      // it makes JSON.stringify(game.snapshot()) at main.js:340 throw
      // "Converting circular structure to JSON", inside a try/catch that reports
      // it to the player as "Save failed — storage may be full." The save breaks
      // with a diagnostic pointing at the wrong thing entirely. Every other
      // entity record in this function is an explicit list for the same reason.
      zones: this.zones.map((z) => ({
        id: z.id, kind: z.kind, owner: z.owner, x: z.x, z: z.z, r: z.r, t: z.t,
        tiles: z.tiles || null,   // Take the Stairs: [i, j, priorBlockedByte, …]
      })),
```

**3c · restore — `game.js:2599`** — ANCHOR:
```js
    this.timeline = snap.timeline || [];
```
REPLACE WITH:
```js
    // zones: tolerant default, NO save-version bump — restore's established
    // pattern IS the migration (`se.progPid ?? -1` at :2489, `se.type || 'mouse'`
    // at :2452). A pre-wish v2 blob simply loads with no zones.
    // ⚠️ the sweep at the top of restore() (:2382) removes ENTITY views only.
    // Zones are not entities, so their meshes would survive into the restored
    // match as orphans. Drop them here, then rebuild from the saved records.
    for (const z of this.zones) z.view && this.scene.remove(z.view.group);
    this.zones = (snap.zones || []).map((z) => ({ ...z, view: null }));
    for (const z of this.zones) this.addZoneView(z); // view-only, consumes NO rng
    this.timeline = snap.timeline || [];
```

**3d · the tick — `game.js:4923`** — ANCHOR:
```js
    this.updateObjectives(dt);
```
REPLACE WITH:
```js
    this.updateObjectives(dt);
    this.updateZones(dt); // lifetimes tick AFTER updateUnit has read them, so a
                          // zone always delivers its full first tick everywhere
```

…with the method beside `updateObjectives`:
```js
  // pure sim: no rng, no Math.random, no cb.* — the ring/decal is vfx's problem.
  updateZones(dt) {
    if (!this.zones.length) return;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.t < 0) continue;                       // permanent (t: -1)
      z.t -= dt;
      if (z.t <= 0) {
        // a stair restores exactly the bytes it cleared, in the order it cleared
        // them, so a building placed meanwhile cannot be un-blocked by expiry
        if (z.tiles) for (let k = 0; k < z.tiles.length; k += 3) {
          const ix = idx(z.tiles[k], z.tiles[k + 1]);
          if (this.blocked[ix] === 0) this.blocked[ix] = z.tiles[k + 2];
        }
        z.view && this.scene.remove(z.view.group);
        this.zones.splice(i, 1);
      }
    }
  }
```

---

### PATCH 4 — restored wishes are DATA

> **`restore()` MUST NEVER CALL `applyWish`.**

**4a · construction — `game.js:314`** — ANCHOR:
```js
      stats: { gathered: 0, trained: 0, lost: 0, kills: 0, razed: 0,
```
REPLACE WITH:
```js
      // wish state. `wishes` is an ORDERED array of chosen ids (≤2);
      // `wishCharges` is {wishId: charges left}; `wishCd` is the shared recast
      // clock; `wishOffered` is which bell has rung; `wishT` is the 45 s answer
      // window; `wishHold` is the one deferred gift (the Toy Dragon); `wreck` is
      // the block value of buildings destroyed this match (bricks W2).
      wishes: [], wishCharges: {}, wishCd: 0, wishOffered: 0, wishT: 0,
      wishHold: null, wreck: 0,
      stats: { gathered: 0, trained: 0, lost: 0, kills: 0, razed: 0, wishesCast: 0,
```
…and in the `mods` literal three lines up, add `farmRate: 1, wallHp: 1,` (both multiplicative — **do not** add them to `ADDITIVE_MODS`).

**4b · writer — `game.js:2329`** — ANCHOR:
```js
        techs: [...p.techs], mods: { ...p.mods }, stats: { ...p.stats }, bell: !!p.bell,
```
REPLACE WITH:
```js
        techs: [...p.techs], mods: { ...p.mods }, stats: { ...p.stats }, bell: !!p.bell,
        // wish state is DATA in both directions: written here, read back verbatim
        // in restore(), never re-derived by re-running applyWish.
        wishes: [...p.wishes], wishCharges: { ...p.wishCharges },
        wishCd: p.wishCd, wishOffered: p.wishOffered, wishT: p.wishT,
        wishHold: p.wishHold, wreck: p.wreck,
```

**4c · reader — `game.js:2398`** — ANCHOR:
```js
      p.bell = sp.bell;
```
REPLACE WITH:
```js
      p.bell = sp.bell;
      // ⚠️⚠️ THE RULE THAT PREVENTS MODS DOUBLING — the single most likely
      // regression in this whole feature:
      //   RESTORED WISHES ARE DATA. THIS FUNCTION NEVER CALLS applyWish.
      // The lines below are the WHOLE of wish loading. p.mods was already rebuilt
      // verbatim by the Object.assign two lines up (:2396), so every stat a wish
      // granted is ALREADY here. Re-applying would run `m.carry += 4` /
      // `m.gather *= 1.15` a second time — permanently, silently, and only on the
      // client that loaded the save.
      // ⚠️ do not be reassured by testing a TECH-granting wish: applyTech
      // early-returns on p.techs.has (:1832), so techs are idempotent and hide the
      // bug. Test a MODS-granting wish. (G3.)
      p.wishes = sp.wishes ? [...sp.wishes] : [];
      p.wishCharges = { ...(sp.wishCharges || {}) };
      p.wishCd = sp.wishCd || 0;
      p.wishOffered = sp.wishOffered || 0;
      p.wishT = sp.wishT || 0;
      p.wishHold = sp.wishHold || null;
      p.wreck = sp.wreck || 0;
```

---

### PATCH 5 — the commands, `castWish`, and the optimism ban

**5a · `game.js:2232`** — ANCHOR:
```js
      case 'age': { const b = ent(c.id); if (b && b.owner === pid) this.startAgeUp(b); break; }
```
REPLACE WITH:
```js
      case 'age': { const b = ent(c.id); if (b && b.owner === pid) this.startAgeUp(b); break; }
      // ⚠️ the pick NO LONGER rides the age command. `startAgeUp` and ui.js:735
      // are untouched by this feature — which also makes the ⏫ enabled()/
      // reqBuildings guard-order hole (a legitimately clickable button in a state
      // startAgeUp rejects) stop mattering for wishes entirely.
      case 'wish': {
        const p = this.players[pid];
        if (p.wishOffered !== 2 || p.wishes.length >= 2) break;   // already answered
        const offer = this.wishOffer(this.factionKeys[pid], 2);   // pure — Law 2
        if (!offer.includes(c.k)) break;                          // never trust the wire
        this.applyWish(pid, c.k);
        p.wishT = 0;
        break;
      }
      case 'cast': this.castWish(pid, c.k, c.x, c.z); break;
```

**5b · the sole writer — insert immediately before `game.js:2778`** — ANCHOR:
```js
  // ---------- combat ----------
```
REPLACE WITH:
```js
  // ---------- wishes ----------
  // ⚠️⚠️ THE OPTIMISM BAN. castWish and applyWish are the ONLY writers of
  // p.wishes / p.wishCharges / p.wishCd / p.wishOffered / p.wishT / p.wishHold,
  // and the ONLY way in is execCommand. No UI path may pre-decrement a charge,
  // "reserve" a pick, or grey a card by mutating sim state for responsiveness.
  // In lockstep the local client would then run one tick with different state
  // from every other client — an instant desync, now caught by stateHash at the
  // very next 100-tick sample (net.js:224) instead of never. The UI may READ this
  // state freely and may show its own purely-visual "sent" styling; it may never
  // write. This is the contract every existing command already honours:
  // ui.js:736 issues {t:'age'} and waits, it does not set p.aging.
  castWish(pid, wishKey, x, z) {
    const p = this.players[pid];
    if (!p.wishes.includes(wishKey)) return false;     // not this player's wish
    if (!(p.wishCharges[wishKey] > 0)) return false;   // out of charges
    if (p.wishCd > 0) return false;                    // still on the clock
    const w = WISHES[wishKey];
    // Law 7: a Keep-lane power must be cast on, or within 12 tiles of, a
    // completed building you own. Checked HERE, not in the UI.
    if (w.lane === 'keep' && !this.nearOwnBuilding(pid, x, z, 12)) return false;
    p.wishCharges[wishKey]--;                          // ← the only decrement
    p.wishCd = WISH_RULES.cd;
    p.stats.wishesCast++;
    this.runPowerFx(pid, wishKey, x, z);
    return true;
  }

  // ---------- combat ----------
```

---

### PATCH 6 — `fp` is a smoke test; `stateHash()` is the gate

`fp`'s formula is deliberately **unchanged** — every historical battery result in `CLAUDE.md` is recorded against it and rewriting it would invalidate them all.

**6a · `main.js:1786`** — ANCHOR:
```js
  let si = 0;
```
REPLACE WITH:
```js
  let si = 0;
  // opts.hashAt = [tick, …] — mid-run stateHash samples. Mirrors the
  // survivalDawn/zeroEra precedent: QA-only, off by default, consumes NO rng, so
  // a soak with hashAt set is byte-identical to one without.
  const hashAt = new Set(opts.hashAt || []);
  const hashes = {};
```

**6b · `main.js:1791`** — ANCHOR:
```js
      g.update(0.1);
```
REPLACE WITH:
```js
      g.update(0.1);
      // G4 in one call: name the ticks and read `hashes` back. Sample the tick
      // AFTER a scripted {t:'wish'} lands and you have proven stateHash sees a
      // mods-only or techs-only wish IMMEDIATELY, rather than 200 ticks later
      // when divergence finally reaches positions.
      if (hashAt.has(t)) hashes[t] = g.stateHash();
```

**6c · `main.js:1809`** — ANCHOR:
```js
  return { seed, winnerTeam, over: g.over, ticks: t, simSec: Math.round(t * 0.1), err, armies, ages, res, facs, fp, surv, kinds, stats, personas };
```
REPLACE WITH:
```js
  // ⚠️ `fp` (built above) is a SMOKE TEST, not the gate. It is
  // Σ(x*71 + z*137 + hp*13) | entities.length | rng cursor — it carries NO player
  // state: not techs, not mods, not age, not wishes. A mods-shaped wish (say
  // `armorOther += 1`) changes nothing fp can see until the difference finally
  // reaches a position, and G1 passes the entire way there.
  // `hash` is stateHash(), which now folds techs BY CONTENT, p.mods, stats.lost,
  // wish state, this.zones and u.aura — the same function net.js:224 and
  // __ttNetTest (main.js:1882) already gate MP on.
  //   RULE: G1 asserts `fp`. G4 asserts `hash`. A wish is not green until `hash`
  //   moves on the tick the wish lands.
  const hash = g.stateHash();
  const wishes = g.players.map((p) => [...(p.wishes || [])]);
  return { seed, winnerTeam, over: g.over, ticks: t, simSec: Math.round(t * 0.1), err, armies, ages, res, facs, fp, hash, hashes, wishes, surv, kinds, stats, personas };
```

---

### PATCH 7 — the Bell

**`game.js:4880`** (the `update()` head; the anchor is the 6-space-indented line, distinct from the 4-space one at `:2600`) — ANCHOR:
```js
      this.taunted = true;
```
REPLACE WITH:
```js
      this.taunted = true;
```
…then insert immediately after the closing `}` of that `if` block, before `if (this.time > 600) this.narrate('clock10');`:
```js
    // ---- THE BELL: Wish II, on the room's clock, not on your bank ----
    // Rings for EVERY living seat at WISH_RULES.bell. The accelerator only ever
    // runs downhill: a seat that has lost `hurt` toys gets it as early as
    // `bellEarly`, never later, never past 180. stats.lost is hardship, not
    // score — a boomer with 40 workers and no army never trips it.
    for (const p of this.players) {
      if (p.wishOffered >= 2 || p.den || !this.playerAlive(p)) continue;
      const due = (this.time >= WISH_RULES.bell)
        || (this.time >= WISH_RULES.bellEarly && p.stats.lost >= WISH_RULES.hurt);
      if (!due) continue;
      p.wishOffered = 2;
      p.wishT = WISH_RULES.window;
      if (p.isAI) {
        // deterministic on every client — the AI answers on the same tick
        this.applyWish(p.id, this.aiPickWish(p.id, this.wishOffer(this.factionKeys[p.id], 2), 2));
        p.wishT = 0;
      } else if (p.id === this.myId) {
        this.cb.wishBar && this.cb.wishBar(this.wishOffer(this.factionKeys[p.id], 2));
      }
    }
    for (const p of this.players) {
      if (p.wishCd > 0) p.wishCd -= dt;
      if (p.wishT <= 0) continue;
      p.wishT -= dt;
      if (p.wishT > 0) continue;
      // ⚠️ the sim NEVER waits on a client. On expiry a human seat takes
      // offer[0] — pure, faction-authored, plannable, and it consumes NO rng
      // draw, so a dropped human cannot perturb a stream a live one leaves alone.
      if (p.wishes.length < 2) this.applyWish(p.id, this.wishOffer(this.factionKeys[p.id], 2)[0]);
      p.wishT = 0;
    }
    // the one deferred gift in the catalogue (Law: gift-legality). Cheap: a
    // string compare per player per tick, and it is null in every normal match.
    for (const p of this.players) if (p.wishHold) this.tryReleaseWishHold(p.id);
```

---

### PATCH 8 — Wish I: resolution, then application

**8a · resolution — `game.js:380`** — ANCHOR:
```js
    this.time = 0;
```
REPLACE WITH:
```js
    // ---- WISH I: resolved here, applied at the tail of setup() ----
    // ⚠️ the roll is consumed for EVERY seat even when pinned — exactly the
    // faction roll's discipline (:322-325) and the persona roll's (:347). Skip it
    // for a pinned seat and Battery A (pinned) and Battery B (free) run on
    // different rng streams and are not comparable, and no pinned soak's fp will
    // ever match a live game that picked the same wishes.
    // Resolution and APPLICATION are deliberately split: free buildings and free
    // toys need a placed starting base, which does not exist until setup().
    this.wish1Keys = this.players.map((p) => {
      const offer = this.wishOffer(this.factionKeys[p.id], 1);   // pure, tier 1 has no `needs`
      const rolled = this.aiPickWish(p.id, offer, 1);            // exactly offer.length draws
      const pinned = this.playerDefs[p.id].wish1;
      return offer.includes(pinned) ? pinned : rolled;
    });
    this.time = 0;
```

**8b · application — `game.js:1035`** — ANCHOR:
```js
    this.fog.update(this.entities);
```
REPLACE WITH:
```js
    // Wish I gifts land now, on a board that exists: free buildings auto-site
    // deterministically off each player's starting chest (baskets at the two
    // nearest resource nodes by di²+dj², ties by tile index; houses and mats on a
    // fixed spiral). No rng — the siting is a pure function of the generated map.
    for (const p of this.players) if (!p.den) this.applyWish(p.id, this.wish1Keys[p.id]);
    this.fog.update(this.entities);
```

---

### PATCH 9 — MP: Wish I rides the roster exactly like `faction`

**`net.js:186`** — ANCHOR:
```js
        conn.on('open', () => conn.send({ type: 'hello', name: (hello.name || '').slice(0, 16), faction: hello.faction || 'classic' }));
```
REPLACE WITH:
```js
        conn.on('open', () => conn.send({ type: 'hello', name: (hello.name || '').slice(0, 16), faction: hello.faction || 'classic', wish1: hello.wish1 || null }));
```

**`net.js:99`** — ANCHOR:
```js
      if (d.faction) this.config.seats[id].faction = d.faction; // the guest's own civ
```
REPLACE WITH:
```js
      if (d.faction) this.config.seats[id].faction = d.faction; // the guest's own civ
      if (d.wish1) this.config.seats[id].wish1 = d.wish1;       // …and the guest's own wish
```

**`net.js:154`** — ANCHOR:
```js
        faction: (s.faction && s.faction !== 'random') ? s.faction : null,
```
REPLACE WITH:
```js
        faction: (s.faction && s.faction !== 'random') ? s.faction : null,
        // the host deals the wish with the seed, exactly as it deals the civ. An
        // unfilled human seat becomes an AI and its null wish1 is simply rolled.
        wish1: s.wish1 || null,
```

---

### PATCH 10 — the pre-wish-save warning, said out loud

**`game.js:2600`** (4-space indent — distinct from `:4880`) — ANCHOR:
```js
    this.taunted = true;
```
REPLACE WITH:
```js
    // ⚠️ USER-VISIBLE DATA LOSS, SAID OUT LOUD. A save written before Bedtime
    // Wishes shipped comes back with no wish state at all. Wish I is resolved in
    // the constructor from playerDefs — which a legacy snapshot's opts do not
    // carry — so that player finishes the match with no first wish. `[]` is
    // truthy, so this fires only for a genuinely pre-wish blob, never for a
    // player who simply hasn't reached the Bell.
    if (!snap.players[0].wishes) {
      this.alert('This save was made before Bedtime Wishes — its first wishes are gone. The Bell will still ring. Start a new match to make both.', 'warn');
    }
    this.taunted = true;
```

---

### PATCH 11 — the titan counter (Slice 1, not Slice 3)

**`data.js:392`** — ANCHOR (verified unique):
```js
    hp: 85, atk: 26, atkType: 'siege', interval: 3.6, range: 6.5, minRange: 2,
```
REPLACE WITH:
```js
    hp: 85, atk: 26, atkType: 'siege', interval: 3.6, range: 6.5, minRange: 2,
    // ⚠️ `mega` was a live tag iterated by applyDamage (:2782) that NOTHING used
    // as a bonus key. The Sticker Catapult is the universal answer: age 3, the
    // shared Siege Workshop, every faction. 36/shot vs a titan, and siege
    // bypasses unit armour entirely (armorOf reads def.armor['siege'], undefined
    // on every unit ⇒ 0). A free Toy Dragon dies in 18 shots / 65 s solo, ~22 s
    // to three, kited from 6.5 range against its 2.2. The Long Gun (55) is now
    // the BEST answer, not the ONLY one.
```
…and change the following line from `bonus: { building: 14 },` to `bonus: { building: 14, mega: 10 },`.

---

### PATCH 12 — `applyUnitTint`

`models.js`, ~20 lines, inserted above `applyUnitTier` (`:1526`), called from `createUnitView` between `:1499` and `:1500`.

```js
// Re-cast an existing GLB in a new plastic. ⚠️ THREE RULES, each learned from a
// real failure mode in this file:
//  1. CLONE EVERY MATERIAL FIRST. Object3D.clone() and cloneSkinned (:400+) SHARE
//     materials between instances — applyUnitTier's own comment says so. A naive
//     traverse-and-set repaints every other toy on that GLB, including the
//     ENEMY's General's Tank the moment you field The Copy.
//  2. NEVER set view._tierInit / _tierMats / _baseScale. _baseScale is assigned
//     ONLY inside applyUnitTier's `if (!view._tierInit)` guard (:1550), and :1583
//     does setScalar(view._baseScale * …) — claim the flag here and every wish
//     toy's matrix goes NaN the first time it hits 3 kills or its line is
//     upgraded. Let applyUnitTier run its own init over the already-tinted
//     clones: that is what gives "tier0 captures the tint" for free, and a tier-0
//     restore then lands on the tint rather than the donor's factory colour.
//  3. NO scale here. Scale is targetHeight's job (makeModelView :797-799); the
//     role multiply at :1513 is view.model-guarded and makeProcView never sets it.
export function applyUnitTint(view, t) {
  const root = view.model || view.group;
  const col = new THREE.Color(t.color);
  root.traverse((n) => {
    if (!n.isMesh || !n.material) return;
    const arr = Array.isArray(n.material) ? n.material : [n.material];
    const owned = arr.map((m) => {
      const c = m.clone();                                   // rule 1
      if (c.color) c.color.lerp(col, t.amount ?? 0.85);
      if (t.rough !== undefined && c.roughness !== undefined) c.roughness = t.rough;
      if (t.metalness !== undefined && c.metalness !== undefined) c.metalness = t.metalness;
      if (t.emissive !== undefined && c.emissive) {
        c.emissive.setHex(t.emissive);
        c.emissiveIntensity = t.emissiveIntensity ?? 1;
      }
      c.needsUpdate = true;
      return c;
    });
    n.material = Array.isArray(n.material) ? owned : owned[0];
  });
}
```

---

### What is deliberately NOT changed

- **`fp`'s formula** — historical batteries are recorded against it (Patch 6).
- **The snapshot version — still `v: 2`.** `restore` has no migration machinery; tolerant reads *are* the migration, and Patches 3c/4c follow the two existing precedents exactly.
- **`Object.assign(p.mods, sp.mods)` at `game.js:2396`** — already correct, and it is *why* Patch 4's rule is one sentence instead of a rework.
- **`startAgeUp` and `ui.js:735-736`** — untouched. The trigger move deletes that whole surface.
- **The entity loop's `h * 31 + e.id` in `stateHash`** — order-dependent, but entity array order is identical across clients and it has been the shipped invariant for months. All *new* folds use `+` per Law 4; the old one is not retrofitted.

---

## 6 · BUILD ORDER

### Slice 0 — the engine. Nothing playable; everything after is data. (~320 lines)

1. Patch 0 (hash helpers + the `armorOther` whitelist fix). **Ship first — it is a live bug today.**
2. Patch 4a: the player fields, `stats.wishesCast`, and the two new `mods` keys.
3. Patch 3: `this.zones` + `updateZones` + `addZoneView`.
4. Patch 2: `u.aura` at all five sites.
5. Patch 1: the full `stateHash` block, **including the two pre-existing blind-spot fixes**. Ship this before anything else in the feature, or `__ttNetTest` is blind to everything that follows.
6. Patches 4b/4c (snapshot/restore) and Patch 10 (the legacy-save warning).
7. The four read sites (§2.7) with `if (!this.zones.length && !u.aura) return …` early-outs.
8. `WISH_RULES`, `wishOffer`, `wishPowersOf`, `hasWishUnit`, `applyWish`, `castWish`, `tryReleaseWishHold`, `nearOwnBuilding`; Patch 5 (`case 'wish'`, `case 'cast'`); Patch 7 (the Bell); Patch 8 (Wish I).
9. The 8 `POWER_FX` kernels + the kernel invariant.
10. `aiPickWish` + `wishScore` + the AI's Wish-II answer beside the tribe manager.
11. Patch 6 (`hash`/`hashes`/`wishes` in the soak return) + the `wishScript` pin.
12. Patch 9 (three `net.js` lines) + the faction-select wish row in `main.js`.
13. UI: `<div id="wishbar">` in the HTML, added to the `--ui-text` zoom list at **`toybox-tactics.html:279`** (**`#hud` stays excluded** — it is anchored and zooming it breaks the layout); `updateWishBar` in `main.js`, wired into `loop()` **and** the hidden-tab `setInterval` and **deliberately not** into `__ttStep` (the trailer-capture path — a wish card must never appear in a capture, exactly as TIPS was treated); aim mode on `n`; the `1`/`2`/`3` guard (§8).

### Slice 1 — the vertical slice: **knights + bots**, 12 wishes, playable.

Not classic. Review 2 is right: classic is the most reskin-heavy half of the catalogue, and the first thing anyone plays should be the half the feature is *about*. **Knights are the measured 32% outlier** (the loudest signal), and **bots carry the strongest fiction in the document** — *Nobody Came*, *Still Ticking*, *Nobody Winds Us But Us*. That is 12 wishes: 10 tribe + R1 + R5. **Zero wish units** — both factions' units wait for Slice 2, which proves the unit-less path is fat enough on its own.

**Also in Slice 1, non-negotiably: Patch 11 (`bonus:{mega:10}` on the catapult).** Otherwise the free Toy Dragon is uncounterable in the very slice it ships in.

**At the end of Slice 1 the feature is fully playable, fully deterministic, fully MP-safe, and testable end to end** — and **Battery E can start**, because Slice 1 logs human picks.

### Slice 2 — `applyUnitTint` + the 16 units.
Patch 12 (~20 lines) + 16 `UNITS` entries appended at the **end** of the literal + 16 `PORTRAITS` aliases + the wish-gated `cmds.push` in `ui.buildCommandsFor` + the `def.wish` gate in `trainUnit` + the `!def.wish` filter at `main.js:1353`. **No `trains` array is touched.** Verified visually via the self-photograph recipe: `renderer.setSize(1600,900,false)` → `__ttRender()` → `toDataURL` **in the same synchronous task** → POST to `tools-shot-receiver.mjs` on :8399. Take **matched pairs**, toggling one thing.

### Slice 3 — the remaining 6 factions (30 wishes) + the 4 remaining Room Wishes.
Pure data plus whichever kernel args are new. **Take the Stairs ships here, last**, with the pre-emptive fallback already applied (14 s, one corridor at a time) and gated on Battery A's terraced pool.

### Slice 4 — presentation.
8 new `CINE` rows (`main.js:3075`); `NARRATOR` text keys for `wish`, `bell`, `onemorenight` (⚠️ **do NOT add them to `NARRATOR_VO`** unless a `.wav` exists — that gate is what stops 404s in production, and VO bills per second); `lore.js` entries keyed by wish id under a new `wishes:` bucket; the wish line on the faction-preview screen; 3 `beyond: true` achievements in `chronicle.js` (⚠️ `beyond` so they never gate NG+ or Toy Box Zero); the Replay Shelf copy line (§8).

**Free presentation the system inherits, one line each:** screen flash (`main.js:3060`), letterbox bars (`:3054`), zoom-punch, `vfx.shockwave`, `vfx.pillar`, `vfx.beam` (built for the Mecha-Titan, shaped exactly like an arc of static), `vfx.promote` (already the "this toy just got better" beat, already fired by `applyTech`, so the grammar is pre-taught), `vfx.stains.stain`, `vfx.litter.drop`, `sfx.playAt`, `cb.dialogue`, `speakAI`, `cb.focus`, `sfx.footsteps()`.

**Cost: ~320 lines of machinery, 0 credits. Art budget: zero.** Every visual is an existing VFX pool, an existing `CINE`-row combination, an existing GLB re-scaled and re-tinted, or an existing unit def.

---

## 7 · VERIFICATION PLAN

> ## **`stateHash()` IS THE GATE. `fp` IS A SMOKE TEST.**
>
> `__ttSoak`'s `fp` (`main.js:1800-1801`) is `Σ(x*71 + z*137 + hp*13) | entities.length | rng cursor` — **no player state at all**: not techs, not mods, not age, not wishes. A mods-shaped wish changes nothing `fp` can see until the difference finally reaches a position, and G1 passes the entire way there. `stateHash()` — after Patch 1 — folds techs by content, `p.mods`, `stats.lost`, wish state, `this.zones` and `u.aura`, and it is the same function `net.js:224` and `__ttNetTest` already gate MP on. **A wish is not green until `hash` moves on the tick the wish lands.**

### Seven gates. Nothing ships until all seven pass.

**G1 · Soak fingerprint identity (smoke).** Same seed + same `script` (including `{t:'wish'}` and `{t:'cast'}`) ⇒ byte-identical `fp`, ×2 maps × ×2 faction pairs, `err === null`. Then one soak per power that spawns, places, converts or kills.

**G2 · MP lockstep.** `__ttNetTest({humans:2, ai:2, ticks:900})` asserting **`r.inSync === true`** — ⚠️ assert `=== true`, never `!== false`; the field is `undefined` on a thrown harness and `undefined !== false` passes. Repeat with `3h+1ai`, and with a **`dropAt` timed inside the 45 s `wishT` window** — that is the exact case the non-blocking picker relies on: the dropped seat must take `offer[0]` and consume no draw.

**G3 · Snapshot round-trip, at the worst moment.** save → JSON → restore → compare, in a match with: an active zone, a **permanent** zone (`t: -1`), a live aura on ≥3 units, a `{k:'wound'}` aura with `used: true`, `p.wishOffered === 2` with `p.wishT` partly elapsed and no pick yet, a non-null `p.wishHold`, a non-zero `p.wreck`, and a power at 1-of-2 charges mid-cooldown. ⚠️⚠️ **Assert `p.mods` is not doubled** — and assert it on a **mods**-granting wish, not a tech-granting one. That is the single most likely regression in the entire feature.

**G4 · The hash-sensitivity test — the one that matters.** Two `Game`s, identical seed, one handed wish A and one wish B via `wishScript`. Assert `stateHash()` **differs at the tick the wish lands**, not 200 ticks later. Repeat for a **mods-only** wish, a **techs-only** wish, a **zone-creating** power and an **aura-only** power. Now a single call: `__ttSoak({..., hashAt:[T, T+1]})`. **If any of the four does not differ immediately, Patch 1 is wrong and `__ttNetTest` is provably blind to that class of change.**

**G5 · Replay.** `cmdLog` carries both command shapes for free via `issue()`'s deep clone. Record a match with two picks and three casts; verify byte-identical at the frame fingerprint. The version stamp (djb2 of `data.js`+`game.js`) will refuse pre-wish recordings — **that is correct; do not "fix" it** (see §8).

**G6 · Headless safety.** One soak per power with `cb = {alert, selection, age, gameOver}` only (that is exactly the soak stub, `main.js:1750-1751`), asserting zero throws — every `cb.cinematic`/`cb.shake`/`cb.focus`/`cb.dialogue`/`cb.wishBar` guarded, `this.sfx` guarded, `this.fx` unguarded (it is real in soak). ⚠️ Wrap each job in its own try/catch: `g.setup()` sits **outside** `__ttSoak`'s try block, so a throw there escapes an async battery loop as an unhandled rejection and the battery dies silently mid-run. Also assert the kernel invariant explicitly: fire every area power on a board with a cat, a dog, a roomba, 3 critters and 5 lost toys inside the radius, and assert zero throws and zero hp changes on non-unit/non-building entities.

**G7 · Live, 60 seconds, zero console errors** — with a `console.error` **hook** installed, **not** by reading the buffer, which retains errors across navigations. Plus the Green Light assertion: **with Green Light active, no unit's position ever occupies a tile where `grid.blocked` is true.** Unit separation and blocked-tile rejection are different code paths; the flag is threaded at the **separation site specifically**. Non-negotiable — a wheel tunnelling through a wall is a bug shaped exactly like a feature.

### The balance battery

⚠️ **Harness rules, non-negotiable, all learned the hard way.** **Mirror seat order or the run is garbage** — seat-0 measured 67–77% across three batteries. Pump via **`MessageChannel`, never `setTimeout`** — hidden-tab intensive throttling clamps chained timers to ~1/min. Drive batches synchronously from the agent side (`window.__RUN(n)`); a 30 s eval timeout does **not** kill page JS, so launch and poll rather than poking. Keep the tab foregrounded or expect ~40 min for 60 full-length games. **Pin `persona` per seat explicitly — the pin already exists in `playerDefs` (`game.js:352`) and rides through `snapshot`'s `opts` — and report it in every row.** Rushers and boomers bias the AI's own picks and will otherwise contaminate the read.

```js
__ttSoak({ …, persona-pinned playerDefs,
  wishScript: { 0: ['digin','longwatch'], 1: ['toberaised','oldguard'] },
  hashAt: [3600, 3601] })
// returns  wishes, hash, hashes, stats (incl. wishesCast)
```

**Battery A — lane parity (288 games, ~10 min).** 8 factions × 3 lane-pure lines (Hearth/Hearth, March/March, Keep/Keep) × **2 seat orders** × 2 maps (`playmat` open / `bookshelf` terraced) × 3 seeds. Control opponent: classic with wishes disabled. **Pass bar: no lane's edge above the positional floor exceeds ±10 on *both* pools.** *Tune from both pools or do not tune.*
Named fallbacks, pre-declared: **Take the Stairs** — if bricks-March > +12 on terraced and ≤ +2 on open, cut to 1 charge. **The Keep megas** — if any Keep line exceeds +12 on both pools, that is the mega arriving too cheap, not the lane; raise the wish-mega costs by 20%, not the lane's gifts. **ONE MORE NIGHT** — if knights-Keep exceeds +12, cut `n` from 3 to 2.

**Battery B — did the feature move the spread? (224 games, ~10 min).** All 28 faction pairs × 2 seat orders × 2 maps × 1 seed, wishes **on**, AI picking freely. Compare directly against the 2026-08-04 280-game baseline (plush 54, wranglers 50, classic/bots/plains 46, bricks 41, racers 34, knights 32). **Question: did knights and racers come off the floor, and did plush stay put?**
⚠️ **Battery B must also report seat-0 win rate, before and after.** Review 2 §0 is right that this feature rides the largest unexplained number in the codebase. The old trigger multiplied it (seat 0 ages first more often, so it wished first). **The corrected trigger — a wall-clock Bell that ignores age entirely — should *reduce* the delta. That is a falsifiable prediction and the cheapest available proof the fix worked.** Without it you will ship an amplifier and read it as a faction result.

**Battery C — auto-pick detection (free, no games).** `aiPickWish` 10,000× per faction/tier with `wishScore` flattened to 5 and jitter live; the distribution must be ~33/33/33. Any deviation is a bug in the bias table, not a design finding. Then run with real `wishScore` — **that distribution is the AI's personality, and it should be legible** ("rushers take March").

**Battery D — the mixed paths (optional, 288 games).** The six mixed lane-pairs × 8 factions × 2 seat orders × 2 maps × 1 seed. Only worth running if A and B are clean; the point is that no *combination* is disproportionate to its parts.

**Battery E — the human pick log (free, and the only battery that can see this defect).** Battery A measures lane *edge*; Battery C measures the *AI's* distribution. **Neither can detect an auto-pick driven by desire.** Slice 1 ships writing `p.wishes` to `tt-journal` (which already exists) and to the game-over card. **Pass bar: after 20 of Kyle's games, no lane exceeds 45% of picks.** If March is still > 55%, the redistribution failed, and the next move is to take March's *gift* tier down — not to add more units.

**The power instrument.** Report **median `stats.wishesCast` in every battery. If it is under 2, the powers are decoration and eight `POWER_FX` kernels bought a stat line.** Hoarding should no longer be optimal — every Wish II power is either a placement (which pays in uptime, so banking it costs you the thing it does) or a one-shot with a strictly-better-now payoff — but *should* is a hypothesis, and this is how you falsify it.

**Re-pool note.** Sandbox, underbed and livingroom likely play "terraced" since the ridge work; the split above uses `playmat`/`bookshelf` as the clean poles. If Battery A shows a map-pool disagreement, **re-pool before tuning anything.**

⚠️ **The stale-data trap.** The 07-12 line "Draws: 15% open / 22% terraced" is **historical** — it predates the map/terrain overhaul. A previous session read it as current and nearly re-tuned the stalemate ramp. The 07-22 diagnostic concluded 12/12; the 07-20 battery had 1 draw in 60. **Measure before you tune.**

---

## 8 · KNOWN CONSEQUENCES

These ship. Each is correct behaviour. **None may be quietly fixed, and none may be quietly hidden.**

**1 · Every Replay Shelf bottle and every shared `TT1.` code dies.** The stamp is a djb2 over the concatenated text of `data.js` + `game.js` (`main.js:1941-1945`); this feature changes both. All ten bottles in `tt-replay-shelf` (`main.js:1974`) and every code Kyle has ever shared will refuse playback at `main.js:1951`. **This is correct — the log would tell a different story under new tuning.** But the Shelf is a feature Kyle built *and advertised as shareable*, so Slice 4 owes one line of copy on the Shelf screen (`openShelf()`) and the release note owes the sentence: **"Bedtime Wishes retires every existing replay bottle and share code."** Kyle finding out by clicking a dead bottle is the failure mode.

**2 · A campaign save in progress permanently loses its first wish.** Wish I is resolved in the constructor from `playerDefs`, which a legacy snapshot's `opts` do not carry. A resumed pre-wish save therefore finishes with **no first wish** — the Bell still rings, so it gets one, not two. Patch 10 says so to the player's face. Fix is copy, not code.

**3 · Control groups 1–3 are suspended for up to 45 seconds, once per match.** `1-9` is control-group recall (`main.js:2733`); the picker needs digits. The guard is an explicit early-return **placed before** the control-group branch, active only while `p.wishT > 0` and this seat has not answered, and `Ctrl+1/2/3` still assigns. It lifts the instant a card is clicked. `m` is mute (`main.js:2724`), `n` is genuinely free and is the aim key. **This is a real cost, bounded and once — do not paper over it.**

**4 · Six unit names are unrecoverable from the source file and have been re-authored here.** The Rocking Horse, The Longhorn, The Painted Pony, Unit 4, Old Blue and The Pace Car. Their lanes, chassis, silhouette deltas and host buildings are specified regardless, because that is what changed. If §3 of the original is ever recovered, restore the **names** only; do not re-derive the rest.

**5 · The Slot Car is a same-army silhouette on the racers' own Nitro Dragster.** +38% and a tier gap carry it, but it is the thinnest ruling in the roster. Fallback pre-declared: `monster` @ 0.55.

**6 · Bricks' Take the Stairs mutates `grid.blocked`.** It is the only power that touches the pathfinding grid. It restores exactly the bytes it cleared, in order, and skips any tile something has since built on. It ships **last** (Slice 3) and is gated on Battery A's terraced pool. If it does not survive that gate, cut it — *What the Picture Showed* still has a 240 R gift and bricks still have five other wishes.

**7 · R2's Lost Toy collection is a human-only edge.** The AI never seeks strays (documented, deliberate — the SP fantasy, like Empire cards). R2 will read weaker in Batteries A and B than in Kyle's hands. **Do not tune R2 from battery data.**

**8 · An age-2 building can be gifted to a player still in the Bedtime Age.** Deliberate — the Bell exists to help whoever is behind, and refusing them the gift would invert the whole fix. It is the one place the wish system knowingly outranks the age ladder.

**9 · Two live bugs are fixed in passing and are not part of this feature.** `p.techs.size` hashing the tech **count** instead of its contents (`game.js:2260`), and `armorOther` missing from the additive-mods whitelist (`:329`). Both exist today. Both make `__ttNetTest` weaker today. Ship them in Slice 0 whatever happens to the rest.

---

## APPENDIX — THE LAWS TO CARVE INTO THE BIBLE

1. **A Wish I power gets 2 charges and creates nothing permanent. A Wish II power gets 1 charge and may create permanent objects.** **Wish I is picked before the match; Wish II is picked at the Bell.** No pricing, no cooldown escape hatch, no exceptions. *(The law governs **powers**. Units and buildings have always been gifts — a `mega` in the Keep lane is a Wish II object and is not a violation. Say so, because at a glance the three Keep megas look like one.)*
2. **`wishOffer` never calls `this.rng()`.** The offer is a pure function of faction + tier (+ sim-side map config and `zeroEra` at tier 2 only), so it is identical live, in MP, in a replay and in a soak — and it is *plannable*, which is what makes a pick an identity rather than a slot machine.
3. **The AI's draw is unconditional.** Exactly `offer.length` rng draws per pick, always, before any `continue` — **including when pinned by `wishScript` or `playerDefs.wish1`.** Same discipline as `game.js:322` and `:347`, same reason.
4. **Every wish `stateHash` fold accumulates with `+`, never `h * 31 + …`, and each element term is non-linear** (`Math.imul(c, c)` for key sets; `Math.imul(keyCode(k), value)` for keyed maps). Order-independence is the invariant; non-linearity is what stops two different subsets of a 31-key pool cancelling into the same sum.
5. **The pay-curve law.** Every gift is typed **lump / tech / signature**, at most **one tech and one signature per faction**, and lumps are ≥ 60% of the catalogue. The axis is **per-unit versus per-player**, not flat versus multiplier: `+2 armour on every infantry` is flat *and* snowball-shaped.
6. **No wish may cancel a faction penalty.** Seven forbidden keys, listed in §3.3. If a faction is weak, **change its number.**
7. **Keep-lane powers are leashed to your own territory** — cast on, or within 12 tiles of, a completed building you own. **No power may perform a mass disengage of any kind.**
8. **`if (e.kind !== 'unit' && e.kind !== 'building') continue;` is the first line of every `POWER_FX` kernel**, and any power without a casting entity supplies a synthetic attacker with a real def.
9. **No wish creates a new entity kind.** Permanent objects are ordinary buildings or permanent zones (`t: -1`) — both already round-trip. The `snapshot` catch-all at `game.js:2374` (`{k:'o'}` → a **Lost Sticker** on reload) must never see anything a wish made.
10. **`needs:` predicates are legal only on Wish II**, and must read `this.zeroEra` as well as map config. Wish I is pure `wishOffer(faction, 1)`: two strings in, three ids out, callable before `setup()`.
11. **The Hearth Law.** A Hearth wish returns more than it cost within 180 sim-seconds of landing, and ≥ half arrives as an object.
12. **The Gift-Legality Law.** A wish gift may create objects of age ≤ 2. Age-3 objects are forbidden — one exception, the Toy Dragon, which waits in `p.wishHold`.
13. **The Titan Law.** No wish puts a **permanent** `mega` on the board before the Fort Age.
14. **Restored wishes are DATA. `restore()` never calls `applyWish`.** Techs are idempotent and will hide this bug; test the mods.
15. **Nothing outside `execCommand` writes wish state.** No local decrement, no reservation, no optimistic grey-out.
16. **`fp` is a smoke test; `stateHash()` is the gate.** Anything that can change `p.mods`, `p.techs`, `p.wishes`, `p.stats.lost`, `this.zones` or `u.aura` without moving a unit is invisible to `fp` by construction.

**Files touched.** `toybox/data.js` — `WISH_RULES`, `WISHES` (42), `POWERS`, `FACTIONS[k].wishes`, 16 `UNITS` entries appended at the end, `bonus:{mega:10}` on `catapult`, 3 `NARRATOR` keys · `toybox/game.js` — ~230 lines: the engine, 8 kernels, `castWish`/`applyWish`/`wishOffer`/`aiPickWish`, the Bell, the AI manager, snapshot/restore/hash, 2 new mods keys, the `armorOther` whitelist fix, the `trainUnit` gate, the `kill()` wound branch · `toybox/models.js` — ~22 lines: `applyUnitTint` + its one call site · `toybox/main.js` — ~100 lines: the faction-select wish row, `updateWishBar`, aim mode, 8 `CINE` rows, 16 `PORTRAITS` aliases, the Codex filter, **wired into `loop()` AND the hidden-tab `setInterval`, and deliberately NOT into `__ttStep`** · `toybox/ui.js` — ~8 lines: the wish-unit train button only (**the ⏫ `onClick` is untouched**) · `toybox/net.js` — 3 lines · `toybox-tactics.html` — ~14 lines: `<div id="wishbar">` + CSS, added to the `--ui-text` zoom list (**`#hud` stays excluded**); the bar reuses `.e-enc` / `.e-enc-card` / `.e-ttl` / `.e-dim` / `.diff-btn` — global classes, not `#empire`-scoped (`toybox-tactics.html:386, 525, 536, 538, 621`) — **so the picker costs zero new CSS.**

**Art budget consumed: zero.**
---

# RECHECK 1 — DESIGN

## 1 · March auto-pick: GONE structurally. Counts verified.

Units per lane per faction, from §3.9 cross-checked against the §4 menu:

| faction | Hearth | March | Keep | two units share a lane? | toy without March? |
|---|---|---|---|---|---|
| classic | Standard Bearer (W1) | — | Long Gun (W2) | no | ✓ H+K |
| bricks | — | The Copy (W2) | Cornerstone (W1) | no | ✓ K |
| plush | Night Light (W1) | Rocking Horse (W2) | — | no | ✓ H |
| racers | Pace Car (W2) | Slot Car (W1) | — | no | ✓ H |
| bots | Unit 4 (W1) | — | Rewound (W2) | no | ✓ H+K |
| knights | — | Hatchling (W1) | Empty Suit (W2) | no | ✓ K |
| wranglers | Old Blue (W2) | Longhorn (W1) | — | no | ✓ H |
| plains | — | Painted Pony (W1) | Old Stone (W2) | no | ✓ K |
| **total** | **5** | **6** | **5** | **0/8** | **8/8** |

Both claims hold. Review 2's "four factions can go two full games without a new toy" is dead — every faction now has at most **one** toyless lane, down from two.

**But the desire auto-pick is relocated, not eliminated.** All four megas are W2, three of them in Keep (bots, knights, plains). For those three factions the Keep W2 card is the one with the titan on it, which is exactly the shape Review 2 named ("the lane where a new toy appears wins on desire before it wins on math"). §4's rebuttal — melee-only, `range ≤ 1.2` — is a *math* answer to a *desire* problem, the same category error the review flagged. Battery E is the only instrument that can see it, and it needs 20 of Kyle's games to fire.

**Unaddressed from §4:** "even the lane that does change your army changes it into a recoloured version of a toy you already field." Still 16 re-tinted existing GLBs, art budget zero. The spec doesn't claim to answer this; it stands.

## 2 · Hearth: trap largely fixed by the trigger move, but the Hearth Law is violated by its own catalogue

The trap was "compounds from minute 6, minute 6 is halfway." Moving Wish I to t=0 and converting rates to lumps fixes that — a 250 R lump at t=0 compounds for the whole match, and a 500 R lump at the Bell is ~6 Block Soldiers *now*. That is a real fix, and Law 11 is the right law.

The catalogue does not obey it. Law 11 requires ≥ half the value as an object (toy/building/body):

| Hearth wish | object value / total | % |
|---|---|---|
| bricks Sort By Colour | 150/250 | 60 ✓ |
| plains Move the Camp | 135/255 | 53 ✓ |
| plush The Warm Heap | ~350/550 | 64 ✓ |
| knights Everything Came With It | 270/520 | 52 ✓ |
| knights Somebody Asked For Us | 110/260 | 42 ✗ |
| plush Leave It On | 90/210 | 43 ✗ |
| classic Quartermaster's List | 100/250 | 40 ✗ |
| bots Maintenance Report | 100/250 | 40 ✗ |
| plains Follow the Season | 180/460 | 39 ✗ |
| bricks Everything Is Spare Parts | 100/500 | 20 ✗ |
| wranglers Bring 'Em All Home | 90/490 | 18 ✗ |
| classic / bots R5 Junk Drawer | 50/500 | 10 ✗ |
| racers Sponsorship | 0/500 | 0 ✗ |
| racers / wranglers R2 (Hearth W1) | 0/280 | 0 ✗ |

**12 of 16 Hearth entries fail the spec's own §3.4 clause; four are at 0%.** The law is stated in §3.4 and in Appendix Law 11 and is never applied to the table. Either fix the gifts or delete the clause — a law the shipping catalogue breaks 75% of the time is worse than no law.

Payoffs do land inside 7–15 min: yes, W1 at t=0, W2 lumps at 6:00. That half is genuinely fixed.

## 3 · Ratio: inverted, arithmetic is honest, but it measures one of three layers

Recount from §3.8: 20 bespoke Lump + 6 Room Lump = **26**; 8 Tech; 8 Signature; 36 bespoke + 6 Room = **42**. 26/42 = **62%** lump, 16/42 = **38%** army-proportional. Every number in §3.2 checks out.

The reframe is also correct: Review 2 listed `+2 armour on every infantry` as a snowball item three clauses after saying flat grants are comeback-shaped. `+2 armour` is flat *and* per-unit. The spec is right and the review was wrong; per-unit vs per-player is the real axis.

**The gap: the ratio counts the GIFT layer only.** The POWER layer went uncounted before and after, and it contains several unbounded army-proportional effects — *Nobody Winds Us But Us* ("every friendly unit that would die instead survives at 1 hp"), *The Warm Heap* ("every friendly unit on the map heals 40 hp"), *Dig In*, *Green Light* (all wheels). Those pay 3× to a 24-army over an 8-army, exactly like the mods the pass converted away from. "86% → 38%" is true as scoped and incomplete as a snowball argument.

## 4 · Tidy Up: CUT. Replacement is free of *that* flaw; two smaller ones ride along

Correctly cut, and correctly diagnosed — the axis was categorical (a leader's only loss condition is one catastrophic engagement), so no numeric nerf survives. ONE MORE NIGHT adds bodies rather than subtracting an engagement, is a lump (1200 hp is decisive on 5 toys, +10% on 40), is focusable and out-rangeable, and `bonus:{heavy:n}` already exists on crossbow/paladin/bowhunter. The disengage flaw is genuinely gone.

Two residues:

- **"A power that only works on your own ground is structurally not a leader's tool — the leader is not the one being attacked" is an assertion, not a proof.** A player ahead on economy absorbing a desperation counterattack is precisely the leader, at home, being attacked. The magnitude is bounded so it's a much smaller problem than Tidy Up, but the argument as written doesn't carry.
- **The Suits lying down runs through `kill()` (`game.js:2896`), which does `stats.lost++` unconditionally for any unit.** Two consequences the spec never mentions: `stats.lost` is now sim-load-bearing (it fires the early Bell) and is now hashed, so a power that self-inflicts +3 to it pollutes the one signal §2.2 advertises as "hardship, not score"; and it silently voids the `longestnight` achievement (`bestWave≥3 & 0 losses`) for any knights player in Survival. Needs an explicit exemption at the lie-down site.

## 5 · Snowball trigger: genuinely FIXED, not relabelled — with one hole

Wish I at t=0 for everyone and a wall-clock Bell at 360 s for every living seat removes purchase from the trigger entirely. Nobody can be priced out. This is more than Review 2 asked for (it only wanted Wish I moved) and it is the correct fix. Predicting a *reduction* in the seat-0 delta and mandating Battery B report it before/after is the right falsifiable test.

**The accelerator is cheaper to farm than §2.2 claims, and the promised test does not exist.** The claim is "6 fed toys is ≥ 360 resources of production." The floor is `sockpuppet` at **30 snacks** (`data.js:173`) — 6 = **180 R** and 36 s of training, for the Bell three minutes early. §2.2 says "Assert it once in the battery; do not build a mechanism for it," and then **no gate in §7 and no battery A–E contains that assertion.** Add it or the stance is unbacked.

**The other hole is bigger: Wish I only exists on the skirmish lobby path.** `main.js:2073-2110` builds `playerDefs` on eight distinct paths. Slice 0 item 12 adds a wish row to faction-select, which feeds `buildLobbyDefs()` only. Campaign (28 missions, both the `campFactions` path and the `allies/foes` path at `:2102`), Empire battles (`:2076`), and the survival defender seat (`:2095`) carry no `wish1` — so the *human's* Wish I is silently rolled by `aiPickWish` with jitter, unchosen, in every one of those modes. Not in §8's Known Consequences, not in the build order, not in any gate. (Replay is fine — `main.js:2160` spreads `{...d}` so `wish1` round-trips on the SP-skirmish path replays actually use. I checked, because the spec asserts it without evidence.)

## 6 · New traps introduced by the reshuffle — three, one serious

**(a) Nine Hundred Bedtimes is now a possible dead card, and it's the one that can't afford to be.** Titan Law makes the free dragon require a Dragon Roost *and* Fort Age, else it parks in `wishHold`. §2.2 argues at length that `AGE_UPS[2]` (800 snacks + 350 buttons + 55 s, plus two Playmat-Age buildings) is "the single most unbuyable thing in the game" and "the pressured player never reaches it." Both cannot be true. This wish's gift layer is explicitly *empty* otherwise — "nothing else — the dragon is the wish" — so a behind knights player who picks it at the Bell may receive a burst power and literally nothing else, for the rest of the match. Every other mega wish has a 425–480 R floor underneath it; this one has zero. That is the exact inversion the Bell was built to prevent, and it lands on the 32% faction the dragon exists to rescue.

**(b) The parity defence for the dragon contradicts the spec's own thesis.** §1 keeps it "because parity is now enforced by price (dragon 460 R vs Hearth 520 R vs Keep 425 R)." Everywhere else the document argues objects beat rates and capability beats equivalent-value economy (§3.4, §4, §3.2). Resource-equivalence is the one currency the spec spends 40 pages saying is not the currency.

**(c) Keep-at-W1 is the new t=0 trap for two factions.** §3.4's corollary — "a 'repair every damaged building' gift is worth nothing at t=0" — is applied to Hearth and never to Keep, where the same shape sits:
- **bricks One Brick Taller (Keep W1):** `wallHp ×1.8` **+ retroactive on standing walls**. At t=0 you own zero walls, so the retroactive half pays exactly nothing and the multiplier pays nothing until you choose to build walls. The Cornerstone is `age: 2`, untrainable. The gift is 10 free Block Walls you did not want at 0:30.
- **knights To Be Raised (Keep W1):** `buildingHp ×1.15` retroactive over a starting base of a chest and a couple of buildings — a fraction of its stated 180 R.
- classic Dig In and plush Hold the Line are milder versions (armour/heal are live, the walls and medics idle).

The trigger move solved Hearth's timing problem by relocating it to Keep. The fix is the spec's own rule, extended: a W1 gift may not be retroactive, for the same reason a W1 gift may not be a repair.

**Minor:** R2 at Hearth W1 (racers, wranglers) is 280 R of pure resource with a human-only power (§8 item 7) — the two weakest W1 cards in the book. And Review 2 §7's specific asymmetry complaint ("a mid-match pick should be responsive to the match; your AI's scoring is and your offer is not") is half-answered — the pre-game half is now right, but the Bell's offer is still a fixed menu while `wishScore` keeps situational terms. Defensible as plannability, but not acknowledged.

## Code claims: spot-checked, and they hold

Every anchor I tested is a unique whole-line match: `game.js` 43, 291, 380, 1035, 1779, 1826-28, 2260, 2323, 2329, 2896, 4880 (6-space, distinct from 4-space at 2600), plus `// ---------- combat ----------` ×1 and `this.updateObjectives(dt);` ×1. Confirmed real and as described: `p.techs.size * 59` hashes the **count** (2260); `armorOther` is initialised to 0 at :311 and omitted from the additive whitelist at :329, so it would be multiplied into zero; `m` is mute (`main.js:2724`) and `1-9` is control-group recall with `Ctrl` for assign (`:2733`); catapult is `atk 26 / siege / 3.6 s / range 6.5, bonus:{building:14}` (`data.js:389-393`), so `+mega:10` = 36/shot as claimed; `farm.farmRate 0.8` vs `worker gatherRate 1.35`, and `game.js:3715` multiplies by `mods.gather * mods.gatherSnacks` with no `farmRate` term — so 0.8 × 1.25 = 1.0 and the "needs its own term at that line" warning are both correct. The two pre-existing bugs in §8 item 9 are real and worth shipping alone.

---

# VERDICT: **BUILDABLE — Slice 0 and Slice 1 can start today.**

All six original blockers from Review 1 are resolved (Wind-Up Alarm and Floorboard mouths cut; kernel invariant with the synthetic-attacker rule; no new entity kind; clone-before-mutate with `_tierInit`/`_baseScale` untouched; wish units out of `trains`; `n` not `m`). Review 2's Strongest Recommendation is implemented and exceeded. The March auto-pick is gone by construction, the ratio is genuinely inverted, and Tidy Up is cut rather than nerfed.

**Fix on paper before Slice 1 ships (cheap, no code):**
1. **Give Nine Hundred Bedtimes a floor.** A Fort-Age-gated gift with an empty gift layer is a dead card for the player the Bell exists to protect. Add ~200 R of age-≤2 object beneath it, or move the dragon to a lane whose card already has a floor.
2. **Extend the t=0 rule to Keep W1.** No W1 gift may be retroactive. Rewrite bricks' One Brick Taller and knights' To Be Raised, or move both signatures to W2.
3. **Reconcile the Hearth Law with the Hearth table** — 12 of 16 entries fail the ≥50%-object clause today. Fix the gifts or delete the clause.
4. **Add `wish1` to the campaign, Empire and survival `playerDefs` paths** (`main.js:2076, 2095, 2102, 2110`), or state in §8 that those modes roll the human's first wish unchosen.
5. **Exempt the ONE MORE NIGHT Suits from `stats.lost`** at the lie-down site.
6. **Put the Bell-farming assertion into §7** (feed 6 sock puppets at 30 snacks each before 3:00 and assert the Bell does not become the dominant line) — §2.2 promises it and no gate contains it.

**Two arguments to stop making, because they're the weak points a playtest will find:** "a power that only works on your own ground is structurally not a leader's tool," and dragon parity by resource-equivalence. Both are the spec arguing against its own thesis. Neither blocks the build; both should be replaced with the Battery E number when it exists.
---

# RECHECK 2 — TECHNICAL

Verification complete. All 31 patch anchors, both hash-blindness claims, the aura/zone round-trip surfaces, the command boundary, the sim-purity sweep, all 16 modelKeys, and the gate choice were checked against the live files.

## VERDICT: **SAFE TO BUILD — after five small corrections**, all confined to text the spec itself leaves under-specified. Nothing in the architecture is wrong. Every load-bearing code claim I could check is true, and several are exact to the line.

---

## 1 · Anchors: 31/31 present, 31/31 unique, 31/31 at the claimed line

Verified by exact whole-line string match with occurrence counting across `game.js` (5038 L), `main.js` (4230 L), `net.js`, `data.js`, `models.js`, `toybox-tactics.html`.

`game.js` 43, 291, 314, 329, 380, 1035, 1749, 2232, 2257, 2260, 2264, 2323, 2329, 2339, 2398, 2416, 2599, 2600, 2778, 2896, 3268, 4880, 4923 · `main.js` 1786, 1791, 1809 · `net.js` 99, 154, 186 · `data.js` 392 — **all UNIQUE, all lineOK=true.**

The one non-unique string is `bonus: { building: 14 },` — **3 occurrences** (`data.js:122, 393, 586`). The spec already flags this and anchors on the unique line above it (`data.js:392`, verified unique). Correct as written; the applier must use the two-line context, never the bare line.

Both `taunted = true` lines resolve correctly by indentation: `game.js:2600` (4-space, `restore` tail) and `game.js:4880` (6-space, `update` head). Patch 7's insertion point is exactly right — `}` at 4882, `if (this.time > 600) this.narrate('clock10');` at **4883**.

## 2 · stateHash: both blind spots are real; the fold is sound and effectively free

`game.js:2260` reads `h = (h + p.age * 53 + p.techs.size * 59) | 0;` — **the tech COUNT**. `p.mods` appears nowhere in `stateHash` (2239–2267). `p.stats.lost` likewise. `__ttNetTest`'s `inSync` is computed from `stateHash()` (`main.js:1883`), so it is provably blind to every tech-content and mods desync **today**.

I ran the proposed helpers against the real key sets:
- `TECHS` = **exactly 31 keys**; `mods` = **exactly 18 after the patch** — both spec figures exact.
- **0 collisions** across all 31 singletons and all 465 pairs.
- Order-independent: **true**.
- **8.74 ms for 20 000 full folds** ⇒ 0.00044 ms per fold ⇒ **~0.0017 ms every 5 s at 4 players**. `net.js:224` confirms `if (this.tick % 100 === 0 && this.tick > 0)`. "Compute fresh, never cache" is correct and costs nothing.

The `armorOther` bug is real and latent: initialised `armorOther: 0` (`game.js:312`), read at `:1801`, written by `quilting` at `:1863`, **absent from the additive whitelist at `:329`** — a faction declaring it would be multiplied into 0. No shipped faction does, so it is latent, not live.

## 3 · aura / zones round-trip: writer and reader both required, and Patch 3c is load-bearing

The unit snapshot record (`game.js:2333-2340`) is an **explicit whitelist, not a spread**; restore rebuilds an explicit literal (`:2408-2417`). Both patch points necessary and correctly placed.

`restore`'s sweep at **`game.js:2382`** is `for (const e of this.entities) e.view && this.scene.remove(e.view.group);` — **entities only**. Zone views would orphan into the restored match. Patch 3c catches a real leak.

`nextId` round-trips (`:2312` → restore) so the shared-counter ruling holds. And Law 9 is fully justified: `snapshot`'s catch-all `return { k: 'o', ... }` at **`:2374`** meets restore's bare `else` at **`:2538`**, which builds a **Lost Sticker** with `STICKER.incomePerSec` (`:2543-2546`).

## 4 · No optimism, anywhere — today or in the patch

`grep -nE "(g|game)\.players\[[^]]+\]\.[a-zA-Z]+ *(=|\+\+|--|\+=|-=)"` over `ui.js` + `main.js` returns **zero hits**; so does a sweep for UI writes to `.hp/.order/.owner/.stance/.queue/.aging/.techs/.mods`. `ui.js:736` issues `{t:'age'}` and never touches `p.aging` — the precedent is exact. `issue()` deep-clones into `cmdLog` (`game.js:2140`), and `execCommand(pid, c)` is the sole route (`net.js:280`, `main.js:1790`, replay `game.js:4874`). Both new cases read `this.players[pid]`, never trusting the wire for identity.

## 5 · Sim purity: clean

`game.js` contains **exactly one `Math.random`**, at `:2815`, nested inside `if (this.fx && seen)` → `if (showImpact)` — view-only, never touches `this.rng`. **Zero `localStorage` in `game.js`.** Soak stub is exactly `{ alert(){}, selection(){}, age(){}, gameOver(){} }` (`main.js:1750`) with `fx` real (`new VFX(s)`, `:1741`) and `sfx: null` — so the G6 guard list is right. `vfx.beam` (537), `promote` (761), `shockwave` (512), `pillar` (518) all exist.

Law 8's justification checks out precisely: `applyDamage` calls `target.view.markDamaged()` and `target.view.hpBar.set(...)` **unguarded** (`:2793-2794`) and dereferences `attacker.x/z` (`:2786`); the only reason pets/critters are safe today is the kind filter at **`:3050`** and **`:3064`**, verbatim as cited.

## 6 · Art: zero new assets needed

**All 16 modelKeys exist in `MODEL_MANIFEST`** (60 keys, `data.js:596`). Donor rendered heights confirmed and every delta in §3.9 is arithmetically correct — *provided the table's mega figures are read as rendered* (see Blocker B). `loadUnitModels` iterates the manifest at `models.js:351`, so an alias adds no download; a failed load leaves `registry[key]` undefined (`:363-366`), so the `proc:` fallback rule is real. `BASE_DISC_CUT` is applied to the **proto at load** (`models.js:359`) — re-tinted clones inherit pruning free. `makeModelView` sets `view.model` (`:792`); `makeProcView`/`makeBoxView` do **not** — so `view.model || view.group` and "no scale in the tint" are both correct. `entry.proto.clone(true)` / `cloneSkinned` (`:406`) **share materials** — Patch 12's rule 1 is mandatory, and `_baseScale` is assigned only inside the `_tierInit` guard (**`:1551`**), consumed by `setScalar` at **`:1583`**, so rule 2 is mandatory too.

## 7 · The plan gates on the right thing

`fp` is `Σ(x*71 + z*137 + hp*13) | entities.length | rng cursor` (`main.js:1800-1801`) — **zero player state**. `inSync` derives from `stateHash()`. The gate choice is correct.

---

# THE FIVE BLOCKERS

**A · `aiPickWish` on human seats will crash every match.** Patch 8a calls it for **every** seat (correctly, for rng discipline), but `this.aiState[pid]` is populated only for AI seats — `if (!p.isAI) continue;` at `game.js:340`. §2.9 says `wishScore` biases "per faction × persona". Written the obvious way, `this.aiState[pid].persona` throws in the constructor. Tier 2 is safe (gated on `p.isAI`, human expiry uses `offer[0]`); **tier 1 is not.** `wishScore` must read `const st = this.aiState[pid]; const persona = (st && st.persona) || 'balanced';`.

**B · The four mega rows quote RENDERED heights under a column labelled `targetHeight`.** The spec's own rule is `rendered = targetHeight × 1.16` for mega. Written literally, Empty Suit `targetHeight: 1.16` renders at **1.3456**. Required def values: The Copy **0.860**, Rewound **0.948**, Empty Suit **1.000**, Old Stone **0.950**. This matters most for **Rewound**: at raw `1.10` it renders at **1.276 — identical to The First Forgotten's 1.276**, and the −14% ruling becomes 0%.

**C · Patch 7 calls `playerAlive` unthrottled, every tick, per seat.** `playerAlive` (`game.js:4498-4515`) allocates via `this.entities.filter(...)` plus two `some()` scans. The game itself calls it **every 0.5 s** (`winT = 0.5`, `:5029`); as written the Bell runs it **10× that** for the whole pre-Bell window (~28 800 calls/match at 4 seats), in the hottest loop, with the battery as the gate. Free fix — compute `due` first:
```js
const due = (this.time >= WISH_RULES.bell)
  || (this.time >= WISH_RULES.bellEarly && p.stats.lost >= WISH_RULES.hurt);
if (!due || p.wishOffered >= 2 || p.den || !this.playerAlive(p)) continue;
```

**D · `mods.wallHp` at `game.js:1695` sits on the ALL-buildings line.** `const hpMult = (plating ? 1.2 : 1) * mods.buildingHp * (upTech ? upTech.hpMul : 1);` — §2.6 says only "multiplicative, read at 1695". Unqualified it becomes a second `buildingHp`, which also breaks Law 6 for wranglers and plains (whose penalty key *is* `buildingHp`). The `def.wall || def.gate` gate must be spelled out.

**E · MP: nothing populates the host's own `config.seats[0].wish1`.** `startMatch` reads `s.wish1` for every seat (`net.js:154`), and the three patched lines only cover the guest→host path. Verified that `playerDefs` ships whole in the `start` payload (`net.js:167`), so once seat 0 is filled the rest is automatic — but `mpConfig()` must write it. Also: `WISH_RULES`/`WISHES`/`POWERS` are not added to `game.js`'s data.js import list (`game.js:8-12`).

# TWO NUMERIC CORRECTIONS (assertions the spec presents as measured)

**F · §3.6's catapult math ignores `hpMult`.** `spawnUnit:1739` gives `hp = def.hp * (training ? 1.15 : 1) * mods.unitHp * (elite ? 1.25 : 1)`. Knights carry `unitHp: 1.05` ⇒ dragon floor **672**, with `training` **772.8**. So 18 shots / 65 s is a best case; realistic is **19–22 shots, 68–79 s solo**. Separately, "siege bypasses unit armour" is true of `def.armor` — **verified: not one unit in the game defines `armor.siege`** — but `armorOf:1801` adds `mods.armorOther` regardless of atkType, so a knights player holding `quilting` takes the catapult to 35/shot. The conclusion survives; restate the numbers so a future session doesn't check them and find them wrong.

**G · Flight is not unprecedented.** `Whirly Drone` (racers, age 2) already ships `fly: true`. Read sites are exactly as cited (`game.js:3166`, `:3225`), and there genuinely is no `fly` bonus key and no anti-air — so the *decision* is right; the honest argument is "one untested flier is already live, don't add a second."

# CITATION DRIFT (harmless, for the applier)

`models.js:1550`→**1551** (`_baseScale`; guard opens 1533) · `ui.js:662`→**661** · `game.js:2452`→**2457**, `:2489`→**2487** · `models.js:365-368`→**363-366** · `data.js:31`→**30** · `models.js:2292`→**2295-2304** · the three `createUnitView` sites are **1736 / 2405 / 3804** (the cited 1730/2382/3794 are function heads).

**Everything else landed exactly**, including `game.js:4951` (the timeline score formula, verbatim), `:3715` (the farm's inline `mods.gather * mods.gatherSnacks` — confirming farms bypass `gatherRateOf` at `:1826-1828`), `:1779`, `:3250`, `:2617`, `:4498`, `:2374`, `:2382`, `:1833` (`applyTech` idempotence — the trap Law 14 warns about is real), `net.js:99/154/186/224`, `main.js:1353/1750/1790/1800/1883/2724/2733/3075/4178/4216`, `toybox-tactics.html:279/386/525/536/538/621` (all five CSS classes global and unscoped; `#hud` explicitly excluded from the zoom list; no `#wishbar` collision), `post.js:129`, `data.js:596/2124/2168`, and the full FACTIONS mods table plus all eight free-tech prices — **exact, every one**.

Also confirmed: `n` is free (`CARD_KEYS = ['q','e','r','y','u','i','o','p','k','j']`, `main.js:2747`); `1-9` is control-group recall with `Ctrl` assigning (`:2733`); `trainUnit` never checks `b.def.trains.includes(type)` (verified across the whole function, `:2710-2725`) — which is what makes "wish units never enter a `trains` array" work; the AI `opts` picker at `:4276-4280` and fort `find()` at `:4238` are exactly as described; `spawnUnit` only does `p.popUsed++` (`:1753`) with the popCap gate living in the queue drain (`:3912`), so `overPop` needs no new machinery; and exactly **5 of 12 maps** carry no `tribes` (canyon, kitchen, bookshelf, livingroom, bathtub), with `bathtub` the only pet-free map — the `needs:'pet'` predicate is correct across all twelve.
---

## 9 · BUILD STATE (2026-08-23) — SLICE 1 SHIPPED, ALL GATES GREEN

Slices 0+1 are LIVE: the engine, the 12-wish knights/bots/room catalogue, the
draft modal, the wish bar, aim mode, the menu pre-pick, the AI picker + the
AI wish-power manager, Patch 10 and Patch 11. Two deliberate deviations from
this spec, both improvements:

1. **Patch 9 (net.js roster pin) was NOT built — the pre-pick rides `issue()`
   instead.** The menu pick is auto-issued as a normal `{t:'wish'}` command
   when the offer window opens. Replays record it free, MP relays it free,
   zero protocol change, and the optimism ban holds by construction. The spec
   predates the idea; do not "restore" Patch 9.
2. **THE FUSE LAW landed in Slice 1** (research synthesis rank 2, 6/6 source
   convergence): burst/chain plant an `omen` zone (1.8s, amber ring) and
   detonate against positions at THAT tick. `WISH_RULES.fuse`. Friendly
   powers stay instant. Plus THE PUBLIC WISH (rank 1, partial): casts are
   announced to the rival; an early Bell is announced to the aggressor.

**Scope:** skirmish, MP, survival. NOT campaign missions (gated on missionEvents — every mission sets it), NOT tutorial, NOT zeroEra.

**Gate results:** G1 ✓ (fp+hash ×2 maps ×2 runs) · G2 ✓ (2h+2ai, 3h+1ai,
drop INSIDE the wish window — all `inSync === true`) · G3 ✓ (torture: live
omen with payload, permanent zone t:-1, ward on a BUILDING, spent omn save,
mid-window, mid-cooldown — hash-equal, mods NOT doubled) · G4 ✓ (hash
diverges at the landing tick) · G5 ✓ (a live match with the menu pre-pick + 2 casts, bottled to the Shelf, replayed on a fresh page: stateHash@700 = 876405031 on BOTH — the pre-pick rode cmdLog as a real wish command) · G6 ✓
(kernels on a cat/roomba/critter/stray board, 0 throws) · G7 ✓ (live hook,
0 errors, menu→match→cast→Bell all driven).
⚠️ G3 CAUGHT A REAL BUG on its first run: auras were snapshotted on UNITS
only, so a ward on a chest was silently lost on restore. Auras now ride both
unit and building snapshot branches. Any new aura carrier needs its branch.

**Battery C (pick personality):** at jitter×0.35 every persona picked the SAME
card 100% of the time — legible but stale. Widened to ×2.0: favored lane ~70%.
rusher→March, boomer→Hearth, balanced→Keep(74%). Tier-2 situational terms
(behind-on-army→March, fat-on-workers→Hearth, bleeding→Keep) verified live.

**Slice-1 lane battery (48 games, mirrored seats, personas pinned 'balanced',
hard AI, playmat+bookshelf × seeds 11/47, wished faction vs wishless classic
control): 0 errors, 8 draws, median wishesCast 3.**
| lane | knights | bots |
|---|---|---|
| hearth | 69% (cast 2.1) | 100% (cast 0.9) |
| march | 100% (cast 3.0) | 94% (cast 3.0) |
| keep | 75% (cast 1.8) | 50% (cast 1.0) |

Readings, NO TUNE at n=8/cell: (1) wished-vs-control runs hot everywhere —
that is the asymmetric control design working, not inflation. (2) March casts
every charge (3.0) because bursts always find a target; hearth/keep powers are
situational and under-trigger for the AI — a MANAGER threshold question, not
a wish-number question. (3) **bots/keep 50% is the hall light being a
HUMAN-value wish**: the AI's managers scan entities directly, so vision buys
it nothing — the same documented class as Lost Toys ("the SP fantasy"). Do
not tune `lighton` from AI batteries, ever. (4) Watch item for the full
Battery A: knights March +25 over its own hearth on this pool pair.

**The research synthesis** (2 workflows, 7+16 agents, ~2.3M tokens): ranked
top-12 lives in the session task output; the bible carries the shortlist.
Next builds in order: rank 3 `bonus:{wish}` (Slice 2, with the roster),
rank 4 DEVOUT ECHO, rank 6 INFORMED BELL, rank 7 VALUE HAS A BODY (anchored
zones), rank 12 THE BIG LIGHT. Distilled laws already carved into the bible:
a cast is never silent; hostile power arrives with a shadow; every strange
toy is pre-answered by a class rule; lasting value has a body; rates die,
emitters live; charges are a fixed allowance; match payoff to runway; verbs
over numbers.

### 9.1 The adversarial review (29 agents, 5 lenses × verify) — 21 real defects, ALL FIXED

Run after all seven gates were green. The gates are blind to deterministic
*spec* failures (both clients agree on the wrong thing), and that is exactly
what the review found. Every item below is fixed and re-verified:

**Sim:**
- Gifted age-2 buildings were SILENTLY DROPPED — `canPlace` age-gated them, so
  `lighton`'s tower NEVER landed (Wish I is always Age 1) and the Bell-tier
  towers/robolab vanished for the hurt Age-1 seat the early Bell exists for.
  `canPlace(owner,type,i,j,gift)` now skips the age gate for gifts ONLY.
- Baskets hugged the chest (a pantry nobody needs — Hearth Law violation by
  siting). `giftBuildings` now has three siting shapes: drop-offs at the nearest
  resource nodes (total-order sort, no rng), wall runs as ONE LINE facing map
  centre with the gate in the middle slot (gate gifted FIRST, 11 candidate
  slots so one blocked tile can't break the run), everything else on the chest
  ring. A gifted gate never stacks on a gifted wall.
- `deposit` nulled `carryType`, which idled every returning hauler and re-tasked
  it to snacks 5s later. Now mirrors the chest deposit exactly (handicap applied,
  carryType kept, phase back to 'to').
- Strafing Run promised "buildings feel it most" with no `bmul` — now 7/3 = 140.
- A toy killed INSIDE a building (wish bursts reach them; nothing else ever
  could) left a ghost in `garrisonIds` — `kill()` releases the slot.
- A pinned AI seat skipped its rng draws (Law 3) — it rolls, then honours the pin.
- `instant` could finish the Wonder (skipping the rival's only warning) — excluded;
  and it now runs the normal completion tail so builders don't idle.
- `mendone` spent a charge on a full-hp building — needs real damage now.
- Old Guard's omn was identical to bots' and unleashed (a siege tool) — it is
  now **Hold the Line**, leashed to 12 tiles of an own building (Law 7); bots'
  Wind Each Other stays map-wide on purpose.
- `restore()` ALERTED before the UI existed → a legacy-save resume CRASHED to a
  dead page. Deferred to the first tick, and the copy now says the TRUE thing
  (the draft is re-offered, not lost).
- A save mid-window resumed with the timer ticking and no modal — `showWishOffer`
  re-shows once per (seat,tier) per Game; replay playback never shows it.

**UI:** building-targeted casts use the `'building'` kind filter and a miss keeps
aim mode + warns + spends nothing; the modal closes on game over and digits go
inert; phone widths wrap the cards; foe chips re-derive after a load from
charges-below-max.

⚠️ **THE MODULE-CACHE TRAP (cost an hour):** a live game recorded right after a
`game.js` edit replayed to a DIFFERENT hash, twice, while two replays agreed with
each other. The replay path is sound — a controlled live→bottle→replay pair on
the final code matched at all 16 checkpoints (frames 1…300, pick + cast in the
log). The browser's ES-module cache can execute a stale `game.js` while
`fetch()` stamps the fresh one, so the version stamp cannot catch it. After any
sim edit, hard-reload before recording a bottle you intend to replay.

---

## 10 · SLICES 2+3 BUILD STATE (2026-08-24) — THE WHOLE CATALOGUE IS LIVE

42 wishes, 16 wish units, 8 menus, the Devout Echo (rank 4), `bonus:{wish:6}`
on the Button Archer (rank 3, simplified: ONE shared counter instead of eight
per-faction heroes — one number, every faction pre-answered; per-faction hero
flavor is open). Fleet-authored (8 authors + 8 law-checkers, ~2.8M tokens),
spliced by `splice-catalogue.mjs` with import-validation, verified same-day.

**Deviations from §3.8, all deliberate and lawful:**
- Take the Stairs: DEFERRED as pre-authorized (§8.6). `picture`'s power ships
  as Prefab Panel (place one wall) until Battery A's terraced pool clears it.
- R4 Ask the Cat Nicely: DEFERRED via its own declared alternate (R1@W2,
  `lightonw2`) — claiming the cat flips `owner` on an entity every sim system
  treats as untargetable; too invasive for this pass.
- `sort` picks deepest→scarcest automatically (no from/to picker) — "sorting
  the pile" reads better as one click and avoids a chooser UI.
- Green Light: +60% wheeled speed only; the ignore-separation clause is cut
  (the felt half is the speed; the separation hack risks wall-tunnelling —
  the exact G7 assertion the spec warned about).
- Sponsorship trainboost: ×3 speed, NOT cost-zero (cost is paid at enqueue;
  a refund hook is not worth the surface).
- One More Night (knights) = the spec's TRUE spawn version (3 Empty Suits,
  45s life, 12-tile leash, lie down past it); bots' Wind Each Other keeps the
  map-wide omn aura. The §9.1 leashed-aura interim is superseded.
- movecamp excludes garrisoned buildings (stranded passenger positions) and
  walls/gates/chest; placement re-validates via canPlace(gift) with rollback.

**Defects found DURING the build** (beyond the review batches): the chosenWish
TDZ boot crash (armed by classic gaining wishes), clickdone/floorboard kernel
shapes normalized (place→placeany, zone→floorboard), lost-toy `carrier: -1`
sentinel broke claimlost + Old Blue's fetch, Empty Suit metalness rendered
black, Old Stone needed `stripMap`, suit-clock overwrite guards.

**Next**: the Slice-2/3 adversarial review's confirmed findings (running),
Battery A at full 8-faction scale, Take the Stairs behind it, R4's cat claim
as its own slice, per-faction hero counters, wish lore.js bucket + Slice 4
presentation (CINE rows, foe-chip pips, path names).

### 10.1 The Slice 2+3 review (46 agents, 36 confirmed = 14 unique defects, ALL FIXED)

⚠️ It took THREE launches: two died on session/model limits returning
`confirmed: []`. **A workflow that returns zero findings may not have run —
check `<failures>` before believing it.** The third run put the agents on
`model: 'opus'` and completed 46/46.

**Two were CRITICAL and both were dead features shipping as live cards:**
- **`fx.heal` had no read site.** Plush's *Leave It On* — a Wish-I power —
  spent a charge and a 12s cooldown to render a disc that healed nothing, and
  wranglers' *Circle the Wagons* silently lost half its effect. Now healed on
  the medic cadence (0.5s) in `updateZones`, team-scoped per the TEAM CONTRACT.
- **`z.creakT` was written and never decremented** — and because the Loose
  Board is planted `t: -1`, `updateZones` hit the permanent-zone early-out
  before any timer work. The Creak's doubled radius was permanent, across
  saves. The tick now runs BEFORE the `t < 0` continue.

**The rest:** `mods.wallHp` had no read site (One Brick Taller only boosted
walls that already existed) — wired into `addBuilding`, ⚠️ **and `retroWallHp`
had to move BEFORE `giftBuildings` or the ten gifted walls take 1.8 twice
(3.24×)**; `gift.units` had no handler (hugline's two free medics never
spawned, and the card rendered an empty gift line — both fixed); `claimlost`
set `dead` without `removed`, so the corpse stayed in `entities`+`stateHash`
but not the snapshot — **save/load stopped being hash-equal**; Old Blue picked
a stray up and stopped, because the fetch gate was `carryLost == null` and
nothing walked him home; three AI arms could never fire (`mendr` on
foundations, `wreckwindow` on an OFFENSIVE trigger, `flagcamp` gated on
`ai.attacking` while the tribe manager only approaches camps when
`!ai.attacking` — mutually exclusive); the Standard Bearer couldn't refresh
its OWN circle (70% uptime); `regen.idle` unread; `spareparts` `frac` ignored;
`countoff` burned a charge on an aging chest (the queue is frozen then);
mend kernels healed foundations to full without advancing `built`; `instant`
left the hp bar at 5%; ground casts pinged before the sim decided.
**The Standing Stone's promised permanent slow was implemented, not
weakened** — a `zoneAfter` rider on the omen payload (the fuse still governs
the damage half), because §3.8 asked for it.

**Re-verified after:** determinism ×3 (fx.heal, wallHp+zoneAfter, and a
classic/racers pair), MP ×3 shapes, the 12-map sweep, snapshot hash-equal with
everything live, and each fix numerically (medics +2, heal 9→35, wall 405 =
250×1.8×0.9 exactly, creak 8→6).

### 10.2 Lane battery, BOTH pools (72 games, mirrored, personas pinned)

| lane | pool A (playmat/47) | pool B (bookshelf/11) | castAvg |
|---|---|---|---|
| 🕯️ Hearth | 54% | 71% | 1.8 |
| 👣 March | **75%** | 63% | 2.2 |
| 🛡️ Keep | 50% | 54% | 1.8–2.3 |

Median `wishesCast` **2** — the powers clear the spec's "not decoration" bar.
**NO TUNE**: March's 75% on the open pool drops to 63% on the terraced one and
Hearth inverts (54→71) — *the pools disagree*, which is exactly the case the
standing rule refuses to tune from. Per-faction cells are n=2 (a 2-game cell
can only read 0/50/100) and are pure noise — do not read them. What the run
DOES establish: 0 errors in 72 games, every faction drafts and casts, and the
control (classic, now wished) is a live opponent rather than a dummy.
⚠️ Both pools are single-seed. A real Battery A wants 3 seeds × 2 pools.
