# BEDTIME WISHES — design spec + hostile reviews

_Produced 2026-08-20 by an 9-agent design pass (AoM research + reuse audit + 4 design lenses
+ integration + 2 hostile reviews). **NOT YET BUILDABLE** — see the two review sections._

---

155hp, 10 melee, 1.2s, spd **2.9**, vision **11**, `bonus:{worker:8, ranged:6}`, 105s+45b, 18s | bigteepee |
| 16 | plains A2 | **The Old Stone** 🗿 | `golem` 0.70 → **0.95** + `stomp`, `mega` | 1.10 rendered | 380hp, 17 melee, 1.8s, **`slam:2.4`**, 6/7 armour, `bonus:{building:16, ranged:6}`, 200s+130m, 36s | bigteepee, fort |

**Two silhouette-collision rulings, made explicitly:**

- **Plains A2 is `golem`, not `dragon`.** The UNITS pass flagged its own Thunderbird as the roster's thinnest margin — a third unit on the `dragon` mesh. Overruled: the Painted Plains do not have dragons, and the pass's own spec'd swap-in ("The Old Stone, which was here before the room") is better tribe fiction *and* removes the collision entirely. `golem` GLB is fielded only by the Brick Golem at 0.70 rendered; The Old Stone renders at 1.10 in ochre-and-turquoise — **57% taller, opposite palette.**
- **Knights A2 stays `titanbot`, pushed to 1.00.** At the UNITS pass's 0.90 it was only 16% taller than the Tin Bots' own Titan Bot. At 1.00 × 1.16 mega = **1.16 rendered vs 0.90 — 29% taller** — and the tint is near-white high-metalness (`0xdfe4ec`, metalness 0.85) against titanbot's gunmetal-and-orange `0x7a828f`. Accepted as a **single-matchup risk** (knights-vs-bots, 2 of 56 ordered pairs). **Named fallback if playtest disagrees: `colossus` 1.10 → 0.95.**

**The tint field.** Every wish unit carries `tint: {color, amount, rough, metalness?, emissive?, emissiveIntensity?}`. **No `scale` in the tint** — scale comes from `targetHeight` only, because `makeProcView` never sets `view.model` and the role-silhouette multiply at `models.js:1513` is `view.model`-guarded.

**The bloom check, done numerically** (The Night Light): `0xffd97a` → linear (1.0, 0.695, 0.194); × 2.6 → (2.6, 1.81, 0.50); luma **1.88**, past `bloomThreshold 1.0` *and* past the +0.55 soft knee (`post.js:129`). It blooms, and bloom bleeds beyond the silhouette — so it survives even the 7-px surveying zoom. This is the only unit in the roster that reads at maximum zoom-out.

**Five traps, each with its fix:**

1. ⚠️ **Never add a `MODEL_MANIFEST` entry.** `loadUnitModels` (`models.js:342`) downloads every manifest key; an alias re-downloads the GLB. Use `modelKey` only. **Every `modelKey` above is a verified existing manifest key** (`soldier, crossbow, knight, tank, hypno, charger, scout, drone, lancer, forgottenking, dragon, titanbot, thunderhoof, forgotten, bear, golem` — all confirmed at `data.js:596-669`).
2. ⚠️ **Never set `def.faction`.** Six sites read it and would leak the unit where it must not appear: `trainUnit` (`game.js:2692`), the second gate at `2637`, `ui.buildCommandsFor` (`ui.js:662`), `buildTechTree`'s `visible()` (`ui.js:212`), the AI faction-workshop filter (`game.js:4246`), and — worst — **the AI fort pick at `game.js:4212`, a bare `Object.keys(UNITS).find(k => UNITS[k].faction === …)` that a new faction-tagged unit can hijack.** Gate on `p.wishes` and all six stay clean.
3. **The one sim gate**, in `trainUnit` right after the faction check at `game.js:2692`:
   `if (def.wish && !this.hasWishUnit(b.owner, type)) return false;`
   Everything else is cosmetic.
4. ⚠️ **Append wish units at the END of the `UNITS` object literal.** Even without `faction:`, insertion order is the AI's `find()` search order.
5. ⚠️ **`PORTRAITS` is keyed by the model registry, not `UNITS`** (`models.js:2293`). Each wish unit needs one line after `renderPortraits(registry, BUILDINGS)` (`main.js:249`): `PORTRAITS.standard = PORTRAITS.soldier;` — otherwise all sixteen fall back to `U_ICONS[k] || '🧸'` and show the same teddy.

**The tint call site — and why it is the one placement that matters.**

```js
// models.js createUnitView, between line 1499 and the addCommonRings call at 1500
if (def.tint) applyUnitTint(view, def.tint);
addCommonRings(view, def, owner, …);
```

⚠️⚠️ It **must** run before `addCommonRings` and it **must** run inside `createUnitView`, not as a post-pass:
- Before the rings, the traverse never sees the contact shadow, the team ring or the selection ring — so **team colour is safe**. (`applyUnitTier` uses `view.model || view.group`, and `makeProcView` never sets `view.model`, so on a fallback view the traverse *would* reach the rings.)
- Inside `createUnitView`, `applyUnitTier`'s per-material `tier0` snapshot captures the **already-tinted** material, so steel/gold veteran promotions compose on top for free and a tier-0 restore lands on the tint, not the donor's factory colour.
- All three view-construction sites — `spawnUnit` (`1720`), `restore` (`2384`), `convertUnit` (`3781`) — route through `createUnitView`, so **the tint round-trips through saves and survives conversion with zero snapshot work.**

**`applyUnitTint(view, t)` is ~20 lines**, mirroring `applyUnitTier`'s init block (`models.js:1531-1550`) and then overwriting `userData.tier0`.

**The UI train button** goes in `ui.buildCommandsFor` after the existing `trains` loop, guarded by `hasWishUnit(me, key) && w.unit.at.includes(first.type)`. It is a `cmds.push` **before** the single `buildCard(cmds)` call, so no stable-DOM violation. ⚠️ It *does* shift that building's hotkey assignments by one, permanently, at the moment of the age-up — acceptable precisely because it is a once-per-match structural change, not per-tick churn.

**The `mega` tag.** Four units carry it (The Copy, Rewound, The Empty Suit, The Old Stone). That buys three things with no code: the `cinematic('mega')` unbox beat and `narrate('mega')` (both already fired from `spawnUnit`, `game.js:1741-1745`, one-shot per match via `_told_mega`), the ×1.16 silhouette scale, and — critically — **they become legal targets for `bonus:{mega:n}`, i.e. The Long Gun counters them.** `mega` is already a live tag iterated by `applyDamage` (`game.js:2759`) and **nothing in the game currently uses it as a bonus key.** AoM's hero-vs-myth triangle is one data line away and The Long Gun is that line: **55 siege per shot vs anything mega**, and siege bypasses def armour, so a Brick Colossus (720 hp) dies in 13 shots while the same gun needs 7 for a 95-hp Castle Knight. A dedicated titan-killer that is useless against infantry.

---

## 4. THE 8 FACTION MENUS

`FACTIONS[k].wishes = { 1: [...], 2: [...] }`, read in lane order Hearth → March → Keep. **Bold = carries the wish unit.** Age-2 lists may hold a 4th id (the `needs` alternate); `wishOffer` filters to exactly three.

| faction | AGE 1 🕯️ Hearth | AGE 1 👣 March | AGE 1 🛡️ Keep | AGE 2 🕯️ Hearth | AGE 2 👣 March | AGE 2 🛡️ Keep |
|---|---|---|---|---|---|---|
| 🎁 **classic** | Quartermaster's List | *R3 Teach Them a Flag* | **Dig In** | *R5 Junk Drawer* | Second Wave | **The Long Watch** |
| 🧱 **bricks** | Sort By Colour | **What the Picture Showed** | One Brick Taller | Everything Is Spare Parts | **We Watched Them Build It** | Click. Done. |
| 🧸 **plush** | **Leave It On** | *R3 Teach Them a Flag* | Hold the Line, Hug the Prisoners | The Warm Heap | **Ride or Rescue** | *R4 Ask the Cat Nicely* ⁽ᵃ⁾ |
| 🏎️ **racers** | *R2 Nobody Under the Couch* | **All the Way Wound** | Marshals on the Track | Sponsorship | **Folded From the Instructions** | *R4 Ask the Cat Nicely* ⁽ᵃ⁾ |
| 🤖 **bots** | Maintenance Report | **Still Ticking** | *R1 Left the Light On* | *R5 Junk Drawer* | **Nobody Came** | Nobody Winds Us But Us |
| 🏰 **knights** | Somebody Asked For Us | **The Warm Egg** | To Be Raised | Everything Came With It | Nine Hundred Bedtimes | **The Old Guard** |
| 🤠 **wranglers** | *R2 Nobody Under the Couch* | **The Whole Herd** | Mend the Fence | Bring 'Em All Home | *R6 Loose Floorboard* | **Don't Touch the Herd** |
| 🪶 **plains** | Move the Camp | **What Walks With Us** | *R1 Left the Light On* | Follow the Season | *R6 Loose Floorboard* | **Keeping Everything That Does** |

*Italic = Room Wish.* ⁽ᵃ⁾ `needs:'pet'` — the alternate for both plush and racers on `bathtub` is their own faction's opposite-age Keep wish, re-tiered; declare it as the 4th id.

**Structural properties this table has, by construction:**
- Every faction gets exactly one wish per lane per age. No menu can be two economy picks and a finisher.
- Every room-eligible faction's Room Wish sits in a **different lane at age 1 than at age 2** (classic Hearth→March… verify: classic is March@1 → Hearth@2 ✓; plush March→Keep ✓; racers Hearth→Keep ✓; bots Keep→Hearth ✓; wranglers Hearth→March ✓; plains Keep→March ✓).
- Each of the six Room Wishes appears in exactly two menus, and each pair is fiction-justified.
- Knights and bricks are 100% bespoke — six wishes each.
- The wish unit's lane is never predictable: March ×9, Keep ×5, Hearth ×2.

**Two walkthroughs, to show the picks are real:**

**🏰 The Castle Kingdom — three tribes wearing one crest.**
*Path A (March→March):* `chivalry` in Age 2 takes their crippled 0.94 march to **1.015, par for the first time ever**, +2 melee, and a jade hatchling that fires green splash from 2.0 tiles. Wish II hands you a **free Toy Dragon** — 640hp/22 siege/splash 1.6, arriving without 280s+180m and 50s — plus a strafing run doing 140 to buildings. On the Bedroom Playmat this is not the faction the 08-04 battery measured.
*Path B (Keep→Keep):* `steelwork` in Age 2 (+2 armour, +150% wall HP) at a point where nobody can break it, and siege that parks against your walls dies at 20/s. Wish II stacks `buildingHp` to **1.5 base**, self-repairing forts, +2 infantry armour, a 400hp 7/9 Empty Suit, and **Tidy Up**. Nothing here makes a single toy stronger. Path A cannot hold a doorstep against a Colossus. Path B cannot take one.
*Path C (Hearth→Hearth):* `buildRate 1.2`, two free buildings, **Unpacking Day ×2**, then a **free Toy Fort** plus three more free buildings. The Kingdom as the fastest expander in the room, for about four minutes — which is the window they have historically wasted.

**🏎️ The RC Racers — the −17, addressed three ways.**
*Path A (March→March):* Slot Car at spd 5.29 with `bonus:{worker:7}`, Green Light doubling every wheel twice, then the Paper Bomber (a **flying** siege body — fliers ignore ridges, walls and milk lakes entirely, so the Racers can bomb a walled base no ground army can reach), `unitHp ×1.12` fixing the fragility, and Full Send. Never fights a fair fight.
*Path B (Keep→Keep):* `quilting` + `armorOther += 2` turns 0/0 armour into 3/3 on every wheel; Yellow Flag is their only defensive tool in existence; then the cat, +4 vs workers forever, and a 26-damage predator you point at their eco. **The Racers as a map-control faction — an archetype the room currently lacks.**
*Path C (Hearth→Hearth):* `gather ×1.08` cancels the 0.97 outright, the room's lost-and-found funds an early Market, then wheeled kills pay **+12 buttons each** (the raiding *is* the economy), `nitro` free, and 25s of triple-speed zero-cost production.

---

## 5. BALANCE ARGUMENT

**Why no lane is an auto-pick.** The three lanes pay on three different clocks, and the measured match length (7–15 sim-min; 12/12 concluded in the 07-22 diagnostic; 1 draw in 60 on 07-20) keeps all three live. Hearth compounds from minute 6; March is spent in the 90 seconds after you click; Keep pays nothing at all unless you are attacked — and against an AI or human that never attacks, Keep's *gift* and *reach* still bank (free techs, retro HP walks, free buildings), which is the whole point of the layer law.

**Why no wish is a trap.** Every wish's floor is a stat-or-tech grant that pays on every map, in every matchup, against every opponent, before the power is ever cast:
- The **worst-case Keep pick** (Mend the Fence) still hands you `pockets`, 2 Storage Baskets and `buildingHp ×1.2`, which is a permanent above-par correction to a faction penalty.
- The **worst-case power** (Yellow Flag, if the enemy never comes near) is on a wish that also grants `quilting` + `armorOther += 2` — 3/3 armour on every wheel, permanently.
- The one `needs`-gated wish **substitutes** rather than dying.
- Hoarding is impossible to lose to: a Wish I power is 2 charges of something that creates nothing permanent, so there is no reason to save it.

**Why the two "hardest" numbers are correct.** The Wind-Up Alarm's 180 siege in 6 tiles is the largest single instant in the catalogue, and it is the only power that can lose you the game (total friendly fire, 20s visible fuse, 260 hp, 16 seconds for four soldiers to defuse). Tidy Up is the largest disengage button in the game, and it **kills nothing and cannot touch buildings**, so it can never win a match outright — the difference between it and Fimbulwinter.

**Five things I am not sure about. Measure these first.**

| # | risk | why | the specific test |
|---|---|---|---|
| 1 | **TAKE THE STAIRS** (bricks A1) | A 25s walkable corridor over any ridge could flatten the entire terraced map pool. Knights are 50% terraced / 30% open *because* ridges exist; bricks getting a ridge-solvent at **Age 2, twice** may be the single largest map-level swing in the catalogue. | Battery A restricted to `bookshelf`/`canyon`/`sandbox`/`attic`, bricks-March vs field, both seat orders. If bricks-March > +12 edge on terraced and ≤ +2 on open, cut the charges to 1 or the duration to 12s. |
| 2 | **FOLLOW THE SEASON** (plains A2) | Farms at **2× and free** plus **35% slower pile depletion** is the biggest compounding eco swing authored. Snack Mats are already the safest income in the game. | Soak plains-Hearth/Hearth vs plains-March/March at 9000 ticks, compare `stats.gathered` at t=600s. If the delta exceeds +45%, drop farmRate to 1.3 and depletion to 20%. |
| 3 | **STATIC CLING** line-pierce and **THE SPARK HOPPER's** `beam` | Line-pierce scales with the *enemy's formation depth*, not with your unit count. A 7-link chain and a beam that sweeps `rng+1.5 × halfW 0.9` both punish blobs — and this game's AI blobs. Against an AI they may look far stronger than against a human. | Report `stats.kills` per cast in Battery A, and run one soak with the AI forced to `formation:'spread'`. If bots-March's edge collapses under spread, the power is correctly shaped; if it doesn't move, cut links 7→5. |
| 4 | **GREEN LIGHT's `noCollide`** | Ignoring *unit* collision is intended; ignoring *blocked tiles* would let wheels tunnel through walls and ridges, which would be a bug shaped exactly like a feature. | Assert in a soak: with Green Light active, no unit's position ever occupies a tile where `grid.blocked` is true. Non-negotiable. |
| 5 | **The free Toy Dragon** (knights A2 March) | 640hp / 22 siege / splash 1.6 arriving free is the largest single payout in the catalogue — 280 snacks, 180 marbles and 50s of production, delivered at once, priced against nothing but a wish slot. It is deliberate (it is the fix for a 32% faction) and it is the **only** free mega in the catalogue. | If knights-March exceeds +15 edge in Battery A, the fix is **not** to remove the dragon; it is to move it behind an `after:` gate on the A1 Warm Egg, so you must spend both picks to get it. |

**One thing I am deliberately not worried about, and why.** The seat-0 advantage is 67–77% across three batteries and it **swamps** faction skill. A raw win-rate near 50% means "exactly average" only because mirroring cancels the bias. **Any battery that does not mirror seat order produces garbage** — that is now non-negotiable, and it is the reason §7 measures *lane edge above the positional floor*, never raw win rate.

---

## 6. BUILD ORDER

**Slice 0 — the engine. Nothing is playable; everything after is data.** (~300 lines)
1. `p.wishes / pendingWish / wishCharges / wishCd / wishLock` + `stats.wishesCast` at `game.js:307`.
2. `this.zones = []` + the tick in `update()` after `updateObjectives`; `u.aura` + its tick in `updateUnit`.
3. The three read-site multiplies (`speedOf`, `startSwing`, `applyDamage`) with `if (!this.zones.length) return 1;` early-outs, plus the `noHigh` guard.
4. `snapshot`/`restore` (no version bump) and the **full** `stateHash` block from §2.12 — **including the two pre-existing blind-spot fixes** (tech content, `p.mods`). Ship this before anything else, or `__ttNetTest` is blind to everything that follows.
5. The five new `p.mods` keys + the shared `ADDITIVE_MODS` Set (and the `armorOther` whitelist fix at `game.js:329`).
6. `wishOffer`, `wishPowersOf`, `hasWishUnit`, `applyWish`, `castWish`, `startAgeUp(chest, wishKey)`, `case 'age'` + `c.w`, `case 'wish'`, the `p.age++` wiring, the `wishCd`/`wishLock` tick, the `trainUnit` gate.
7. The 8 `POWER_FX` kernels + the `POWER_AI` table shell.
8. `aiPickWish` + the AI wish manager beside the tribe manager.
9. UI: `<div id="wish">` and `<div id="wishbar">` in the HTML; `#wish` and `#wishbar` added to the `--ui-text` zoom list at `toybox-tactics.html:279` (**`#hud` stays excluded**); `showWishPick` and `updateWishBar` in main.js; aim mode + the `N`/`M` keybinds (verified free against `main.js:2680-2731`); the one-line `ui.js:735` change.

**Slice 1 — the vertical slice: 2 factions, 12 wishes, playable.** Ship **classic** (no faction mods — the cleanest baseline) and **knights** (the measured 32% outlier — the loudest signal). That is 12 wishes: 10 tribe + R3 + R5. Two wish units: The Standard Bearer and The Long Gun (classic) — knights' units wait for Slice 2, so knights' 6 wishes are pure gift/reach/power and prove the unit-less path is fat enough on its own. **At the end of Slice 1 the feature is fully playable, fully deterministic, fully MP-safe, and testable end to end.**

**Slice 2 — `applyUnitTint` + the 16 units.** One `models.js` function (~20 lines), 16 `UNITS` entries, 16 `PORTRAITS` aliases, 16 additions to faction `trains` arrays. This is the slice that can be verified visually via the self-photograph recipe (`tools-shot-receiver.mjs` on :8399) — take matched pairs, toggling one thing.

**Slice 3 — the remaining 6 factions (30 wishes) + the 4 remaining Room Wishes.** Pure data plus whichever `POWER_FX` args are new. Nothing structural.

**Slice 4 — presentation.** 8 new `CINE` rows (`main.js:3068`); `NARRATOR` text keys for `wish`, `tidyup`, `alarm` (⚠️ **do NOT add them to `NARRATOR_VO`** unless a `.wav` exists — that gate is what stops 404s in production, and VO bills per second); `lore.js` entries keyed by wish id (missing keys degrade to `blurb`); the wish line on the faction-preview screen; 3 `beyond: true` achievements in `chronicle.js` (⚠️ `beyond` so they never gate NG+ or Toy Box Zero).

**Presentation the system inherits for free, at 1 line each:** screen flash (`main.js:3060`), letterbox bars (`:3054`), zoom-punch, `vfx.shockwave`, `vfx.pillar`, `vfx.beam` (built for the Mecha-Titan, shaped exactly like an arc of static), `vfx.promote` (already the "this toy just got better" beat, already fired by `applyTech`, so the grammar is pre-taught), `vfx.stains.stain`, `vfx.litter.drop` (permanent decals — marbles are *still there* after the zone lapses, a lovely lie the view tells), `sfx.playAt` positional audio, `cb.dialogue` commander reactions, `speakAI` rival lines, `cb.focus` camera moments, `sfx.footsteps()` (written for THE KID and currently used once).

**Cost: ~300 lines of machinery, 0 credits.** After Slice 0, a wish is a data entry and a wish unit is a `UNITS` entry with a `modelKey`.

---

## 7. VERIFICATION PLAN

**Seven gates. Nothing ships until all seven pass.**

**G1 · Soak fingerprint identity.** Same seed + same `script` (including `{t:'age', w}` and `{t:'wish'}` commands) ⇒ **byte-identical `fp`**. Run ×2 maps × ×2 faction pairs, `err === null`. Then one soak per power that spawns, teleports, resurrects, converts or kills.

**G2 · MP lockstep.** `__ttNetTest({humans:2, ai:2, ticks:900})` asserting **`r.inSync === true`** — ⚠️ assert `=== true`, never `!== false`; the field is `undefined` on a thrown harness and `undefined !== false` passes. This is the documented trap that has bitten before. Repeat with `3h+1ai`, and with a **`dropAt` timed inside the 40s `p.aging` window** — that is the exact case §2.18 relies on.

**G3 · Snapshot round-trip, taken at the worst moment.** save → JSON → restore → compare, in a match with: an active zone, a live aura on ≥3 units, a ticking 20s Alarm fuse, two Floorboard mouths, `pendingWish` non-null **mid-`aging`**, and a power sitting at 1-of-2 charges mid-cooldown with `wishLock` partially elapsed. ⚠️⚠️ **Assert `p.mods` is not doubled.** That is the single most likely regression in the entire feature.

**G4 · The hash-sensitivity test — the one that matters.** Two `Game`s, identical seed, one handed wish A and one wish B via `script`. Assert `stateHash()` **differs at the tick the wish lands**, not 200 ticks later when divergence finally reaches positions. Repeat for a mods-only wish, a techs-only wish, a zone-creating power, and an aura-only power. **If any of the four does not differ immediately, the §2.12 addition is wrong and `__ttNetTest` is provably blind to that class of change.**

**G5 · Replay.** `cmdLog` carries both command shapes for free via `issue()`'s deep clone. Record a match with two picks and three casts; verify byte-identical at the frame fingerprint. The version stamp (djb2 of `data.js`+`game.js`) will refuse pre-wish recordings — **that is correct; do not "fix" it.**

**G6 · Headless safety.** One soak per power with `cb = {alert, selection, age, gameOver}` only, asserting zero throws — every `cb.cinematic`/`cb.shake`/`cb.focus`/`cb.dialogue` guarded, `this.sfx` guarded, `this.fx` unguarded (it is real in soak). ⚠️ Wrap each job in its own try/catch: `g.setup()` sits **outside** `__ttSoak`'s try block, so a throw there escapes an async battery loop as an unhandled rejection and the battery dies silently mid-run.

**G7 · Live, 60 seconds, zero console errors** — with a `console.error` hook installed, **not** by reading the buffer, which retains errors across navigations. Plus the Green Light blocked-tile assertion from §5 risk #4.

### The balance battery

⚠️ **Harness rules, non-negotiable, all learned the hard way:** mirror seat order or the run is garbage (seat-0 measured 67–77% across three batteries). Pump via **`MessageChannel`, never `setTimeout`** — hidden-tab intensive throttling clamps chained timers to 1/min and would stretch 288 yields into hours. Drive batches synchronously from the agent side (`window.__RUN(n)`); a 30s eval timeout does **not** kill page JS, so launch and poll rather than poking. Keep the tab foregrounded or expect ~40 min for 60 full-length games.

**New soak hook**, mirroring the existing `survivalDawn`/`zeroEra` precedent:
```js
__ttSoak({ …, wishScript: { 0: ['dig_in','long_watch'], 1: ['to_be_raised','old_guard'] } })
// returns  wishes: g.players.map(p => [...p.wishes])   and  p.stats.wishesCast
```
Pin `persona` per seat explicitly, and **report it in every row** — rusher/boomer bias the AI's own picks and will otherwise contaminate the read.

**Battery A — lane parity (288 games, ~10 min).** 8 factions × 3 lane-pure lines (Hearth/Hearth, March/March, Keep/Keep) × 2 seat orders × 2 maps (`playmat` open / `bookshelf` terraced) × 3 seeds. Control opponent: classic with wishes disabled. **Question: does any lane dominate, and does any lane collapse on one map pool?** Pass bar: no lane's edge above the positional floor exceeds ±10 on **both** pools. *The standing rule applies — tune from both pools or don't tune.*

**Battery B — did the feature move the spread? (224 games, ~10 min).** All 28 faction pairs × 2 seat orders × 2 maps × 1 seed, wishes **on**, AI picking freely. Compare directly against the 2026-08-04 280-game baseline (plush 54, wranglers 50, classic/bots/plains 46, bricks 41, racers 34, knights 32). **Question: did knights and racers come off the floor, and did plush stay put?** This is the only battery that answers the design's actual thesis.

**Battery C — auto-pick detection (free, no games).** Run `aiPickWish` 10,000 times per faction/age with `aiScore` flattened to 5 and jitter live; report the pick distribution. It should be ~33/33/33. Any deviation is a bug in the lane-bias or situational terms, not a design finding. Then run it with real `aiScore` and report — **that distribution is the AI's personality, and it should be legible.**

**Battery D — the mixed paths (optional, 288 games).** The six mixed lane-pairs (Hearth→March, Hearth→Keep, March→Hearth, March→Keep, Keep→Hearth, Keep→March), 8 factions × 2 seat orders × 2 maps × 1 seed. Only worth running if A and B are clean; the point is to check that no *combination* is disproportionate to its parts.

**Re-pool note.** Sandbox, underbed and livingroom likely play "terraced" since the ridge work; the two-pool split above uses `playmat`/`bookshelf` as the clean poles. If Battery A shows a map-pool disagreement, re-pool before tuning anything.

---

## 8. CUT LIST

**Cut from the architecture:**
- **Two options per age-up** (POWERS pass). 4 paths/faction is exhausted in four games. Three gives 9 and costs one flexbox row.
- **A favour / wish currency.** A fifth resource means a gather loop, a HUD chip, `AI.gatherRatio` tables for three ages, market entries, and `RES_TYPES` rippling through `snapshot`/`stateHash`/`pay`/`canAfford`. Pricing a recast in buttons makes the power a purchase, which is a different and worse object.
- **Repeatable / cooldown-only powers.** Retold's own patch history is the evidence. Staying once-per-tier is what buys us permanent objects: the Alarm, the Floorboard and Tidy Up would all be broken as repeatables and are all safe as events.
- **`p.unlocks`** (MENUS pass) and **`p.wishCast`** (POWERS pass) — both derivable from `p.wishes` and `p.wishCharges`. Fewer fields, fewer save holes, fewer hash holes.
- **A new command for the pick.** `{t:'age'}` already carries it; `cmdLog` deep-clones and `net.js` ships whole objects, so one string field is free.
- **Wish buttons on the command card.** `buildCard` does `card.innerHTML = ''` (`ui.js:746`) and `KEYS = ['Q','E','R','Y','U','I','O','P','K','J']` assigns hotkeys in push order — three wish cards would renumber **every** existing shortcut in the game. The modal and `#wishbar` avoid it entirely.
- **A save-version bump to v3.** `Game.restore` has no migration machinery at all; its pattern is tolerant defaults at the read site, and those defaults *are* the migration.
- **Any hold-to-win wish.** `RELIC_VICTORY = false` stands. Nothing here reintroduces one.
- **Fog-gated targeting.** `FogOfWar.vis` is per-client view state; a sim decision that reads it desyncs instantly. Sim-side range gates only.

**Cut from the unit roster:**
- **Weapon-part swapping.** `attachHandWeapon` (`models.js:961`) fires only in the skinned branch and only with a `RightHand`/`LeftHand` bone — and even then a rifle→longarm swap is **4–6 px** at default zoom. It cannot carry a unit's identity.
- **`proc:` bodies as a primary look.** Every `proc:` kind has a `MODEL_MANIFEST` entry (verified through line 669), so the branch only runs on a failed load or in Toy Box Zero — and it ignores `targetHeight` entirely, so there is no scale lever. Fallback only, never a design. **Rule: every wish unit's `modelKey` must be a manifest key.**
- **"Sir Hector's Half-Painted"** (a knight silver down one side, bare grey down the other). Perfect fiction — it is literally the commander's bio — but `applyUnitTint` lerps every material uniformly, and "half" is a per-mesh spatial split no shared function can infer across differently-authored GLBs. **It needs art. Cut.**
- **Same-chassis "bigger mega" palette swaps** (a bigger Monster Truck for racers, a bigger Colossus for bricks). That is exactly the failure the brief warns about. Replaced by The Paper Bomber and The Copy.
- **Twenty MENUS-pass units** (Rifle Line, Veteran Sergeant, Sandbag Gunner, Wall-Hopper, Snap Turret, Stud Titan, Cuddle Guard, Bruin, Outrunner, Pace Car, Wrecker, Arc Bot, Sentinel, Bulwark Bot, Squire, Half-Painted Guard, Ranch Hand, Trail Boss, Far-Watcher, Wind Runner). One unit per faction per age keeps the roster at 16, keeps `UNITS` searchable (insertion order is the AI's `find()` order), and **every kept unit has a measured silhouette delta**. Several of the cut ones are good — the **Wrecker** (110hp `trample:8` dragster) is the designated tuning lever if Racers stay at the floor after Battery B, and the **Pace Car** (mobile repair truck) is the reserve if `armorOther += 2` proves insufficient.
- **AI rigging** (`3d_rigging`). Already tested and rejected 2026-07-29 at 32cr: baked root motion translates `Hips` by (−23, −34, +48) across one attack — the toy walks off its own sim-authoritative tile; 8.1 MB per clip × 4 = 32.5 MB for **one** unit; and `pruneBaseDisc` is never called in the skinned `clips` branch, so a rigged bake violates the NO-DISC RULE on arrival. **Re-read that entry before ever spending on it again.**

**Cut from the power list — held in reserve** (for a ninth faction, the campaign, Toy Box Zero, or Empire Mode). Each is fully specified in the POWERS pass and needs no new machinery given the 8 kernels:
- **The Vacuum** 🌪️ — the economy assassin. An 8s / 22-tile / 4-tile-wide sweep, 20 pulses of 11 siege, dragging light toys at 2.5 tiles/s and heavy ones at 1.35, workers dropping their carry, Snack Mats taking 40/pulse. Cut only because the Roomba already occupies the vacuum silhouette as a pet and R6 owns the March-lane room slot.
- **Toy Box Tipped** 📦 — 4 free Forgotten Ones (190hp/13atk/pop 2 each = **760 hp and 52 attack**, over pop, `spawnUnit` bypassing `popCap`). The best free-army payout available at zero art cost. Designated as the **9th-faction / campaign** payout.
- **Show and Tell** 🎤 — mass conversion. Genuinely cheap (`convertUnit` at `game.js:3771` is complete: pop transfer, order clear, view rebuild, badge re-attach, tier re-application) and therefore risks being obviously correct.
- **Spilled Marbles** 🔮, **Lamp Sweep** 💡, **Crumb Trail** 🍪, **Hold Position** 🛡️, **Hold the Gate** 🚪.

**Merged rather than cut** — these ideas survive inside other wishes: Blanket Fort's heal-everyone-inside → Circle the Wagons; Snack Time's instant-deposit → The Junk Drawer's power; Sticker Chart's +3 kills → Second Wave's gift; The Whistle → She's In A Mood; Wind-Up Key → Wind Everyone; "The Shelf They Will Be Put Back On" → The Old Guard's reach.

**Cut on quantity grounds:**
- **Free megas for three factions** (dragon, Iron Horse, Thunderhoof). Reduced to **one** — the Toy Dragon, for the tribe whose entire fiction is the warm egg in the roost. Three would make a free titan a norm rather than a beat.
- **The MENUS pass's 4 Room Wishes → 6, and the "knights and bricks get none" rule kept.** Six ×2 appearances exactly fills the 12 room slots left by the two denied tribes.

---

## APPENDIX — the four laws to carve into the bible when this ships

1. **A Wish I power gets 2 charges and creates nothing permanent. A Wish II power gets 1 charge and may create permanent objects.** No pricing, no cooldown escape hatch, no exceptions.
2. **`wishOffer` never calls `this.rng()`.** The offer is a pure function of faction + age + sim-side map config, so it is identical live, in MP, in a replay and in a soak — and it is *plannable*, which is what makes a pick an identity rather than a slot machine.
3. **The AI's jitter draw is unconditional.** Exactly `offer.length` rng draws per pick, always, before any `continue`. (Same discipline as `game.js:322`, same reason.)
4. **The wish `stateHash` loops accumulate with `+`, never `h * 31 + …`.** Set and object iteration order is identical across clients today but is not guaranteed to stay so through `restore`. Order-independent accumulation is the invariant.

**Files touched:** `toybox/data.js` (`WISHES`, `POWERS`, `FACTIONS[k].wishes`, 16 `UNITS` entries, 16 additions to `trains` arrays, 3 `NARRATOR` keys) · `toybox/game.js` (~170 lines: the engine, the 8 kernels, `castWish`, `applyWish`, `wishOffer`, `aiPickWish`, the AI manager, snapshot/restore/hash, the `noHigh` guard, the `storyGuard` line in `kill()`, the `trainUnit` gate, 5 new mods keys, the `armorOther` whitelist fix) · `toybox/models.js` (~20 lines: `applyUnitTint` + its one call site) · `toybox/main.js` (~90 lines: `showWishPick`, `updateWishBar`, aim mode, 8 `CINE` rows, 16 `PORTRAITS` aliases, **wired into `loop()` AND the hidden-tab `setInterval`, and deliberately NOT into `__ttStep`** — the trailer-capture path; a power button must never appear in a capture, exactly as TIPS was treated) · `toybox/ui.js` (~13 lines: the ⏫ `onClick`, one line, plus the wish-unit train button) · `toybox-tactics.html` (~16 lines: `<div id="wish">`, `<div id="wishbar">` + its CSS, both added to the `--ui-text` zoom list; **the modal reuses `.e-enc` / `.e-enc-card` / `.e-ttl` / `.e-dim` / `.diff-btn` — global classes, not `#empire`-scoped — so the pick screen costs zero new CSS**).

**Art budget consumed: zero.** Every visual is an existing VFX pool, an existing `CINE`-row combination, an existing GLB re-scaled and re-tinted, or an existing unit def.

---

# HOSTILE REVIEW 1 — TECHNICAL

# HOSTILE REVIEW — "Bedtime Wishes" vs. the real code at `C:\Users\kylef\Downloads\New folder\toybox\`

**Verdict: the architecture is sound and the cut list is genuinely good, but six things are wrong enough to break the build or the game, and three of them are the spec contradicting itself. Do not write Slice 0 until Blockers 1–6 are resolved on paper.**

Credit first, because it makes the rest credible: `def.modelKey` really does already exist (`models.js:1492` — `registry[facWorker || def.modelKey || key]`), `def.targetHeight` really does override the manifest (`models.js:797-799`, and only inside `makeModelView`, so the "proc has no scale lever" claim is right), all sixteen named modelKeys are real manifest entries (`data.js:597-673`), `mega` really is an unused bonus key (`applyDamage` iterates `target.def.tags` at `game.js:2782-2784`; no `bonus:{mega:…}` exists in `data.js`), `attachHandWeapon` really does bail without a hand bone (`models.js:767-771`, called at `:961` after `play('idle',0)`), and every `.e-enc`/`.e-ttl`/`.e-dim`/`.diff-btn` class really is global, not `#empire`-scoped (`toybox-tactics.html:386, 525, 536, 538, 621`). The `armorOther` whitelist gap is real (`game.js:330` omits it from the additive list; only `quilting` at `:1863` touches it today). `game.js:322` and `:329` are cited exactly right.

---

## BLOCKERS

### 1. The Wind-Up Alarm has no legal shape in this engine
There is no third attackable entity kind. Both target scans hard-filter it out:
- `game.js:3050` — `if (e.kind !== 'unit' && e.kind !== 'building') continue;` (`nearestEnemy`)
- `game.js:3064` — same line in `pickTarget`
- `game.js:2617` — the manual right-click attack gate: `(target.kind === 'unit' || target.kind === 'building')`

"260 hp, 16 seconds for four soldiers to defuse" therefore requires the Alarm to be a **unit** or a **building**, and the spec never says which. Both have consequences it doesn't price:

- **As a building:** `playerAlive` (`game.js:4498-4515`) returns true on `mine.some(e => e.kind==='building') && mine.some(worker)`. **A ticking bomb keeps a dead player alive** — that is a stalemate generator, and stalemates are the one failure mode this game has repeatedly fought. It also occupies `blocked` tiles, counts toward `up.reqAge2Count` if `age>=2`, enters the AI's building census, and pays `stats.razed`.
- **As a unit:** it consumes `popUsed`, is scored by `pickTarget`, gets `speedOf`/`updateUnit` every tick, and `kill()` (`game.js:2894-2896`) decrements `popUsed` and increments `stats.lost`.

**Required before code:** name the kind, and add an explicit `playerAlive` exclusion. Same question applies to the Floorboard "mouths" and anything else in the "may create permanent objects" tier.

### 2. Any area-damage kernel crashes the tick loop
`applyDamage` (`game.js:2779-2864`) unconditionally does, at `:2793-2794`:
```js
target.view.markDamaged();
target.view.hpBar.set(target.hp / target.maxHp);
```
`hpBar`/`markDamaged` are attached only in `addCommonRings` (`models.js:730-735`, units) and `createBuildingView` (`models.js:2379-2382`). Critter, cat, dog, roomba, camp and lost-toy views have neither, and those entities have no `hp`/`maxHp` at all. Nothing calls `applyDamage` on them today **only because both target scans filter by kind** — a radius sweep that iterates `this.entities` does not.

The Alarm's "total friendly fire in 6 tiles", Static Cling's 7-link chain, the Spark Hopper beam and Tidy Up all iterate radius. Every one will hand `applyDamage` a mouse and take down the whole update loop — the exact failure family already documented in MAP LIFE Round 6.

Also unstated: `applyDamage` dereferences `attacker.x/z` (`:2798`), `attacker.def.aggro` (`:2836`) and `attacker.owner` (`:2851`). **There is no null-attacker path.** A power with no casting entity needs a synthetic attacker carrying a real def, or its own damage routine.

**Required:** `e.kind === 'unit' || e.kind === 'building'` as the first line of every kernel, stated as an invariant in the appendix laws.

### 3. A new entity kind is silently corrupted by save/load
`snapshot()`'s entity map ends with a catch-all at `game.js:2373`:
```js
return { k: 'o', id: e.id, x: e.x, z: e.z, holder: e.holder };
```
and `restore()`'s matching chain ends with a bare `else` (`game.js:2534-2545`) that builds a **Lost Sticker** — which still pays `STICKER.incomePerSec` to its holder. So a saved-and-reloaded Wind-Up Alarm becomes a free income node for whoever is standing near it. No error, no warning. Same shape in the update dispatch (`game.js:4912-4921`): an unrecognised kind simply never ticks.

### 4. `applyUnitTint` as specified NaNs every promoted wish unit
The spec says it mirrors `applyUnitTier`'s init block "and then overwrites `userData.tier0`." That init block (`models.js:1535-1556`) is guarded by `if (!view._tierInit)` and is the **only** place `view._baseScale` is set. The function's last line, `models.js:1583`:
```js
if (view.model) view.model.scale.setScalar(view._baseScale * (tier >= 2 ? 1.1 : 1));
```
If `applyUnitTint` sets `_tierInit`/`_tierMats`, `_baseScale` is `undefined` → `setScalar(NaN)` → the model matrix goes NaN the first time that toy hits 3 kills or its line gets `steel_`/`elite_`.

**Correct shape:** clone the materials, set colours, **do not touch `_tierInit`, `_tierMats` or `_baseScale`**. Let `applyUnitTier` run its own init over the already-tinted clones — that gives the "tier0 captures the tint" property the spec wants, for free.

Unstated and equally fatal: `Object3D.clone()` and `cloneSkinned` (`models.js:400+`) **share materials between instances** — `applyUnitTier`'s own comment says so ("they're shared across clones"). Mutating `material.color` without cloning first repaints every other toy on that GLB, **including the enemy's General's Tank when you field The Copy.** "~20 lines" is exactly the framing that produces a naive traverse-and-set. Put clone-before-mutate in the spec.

### 5. Internal contradiction: wish units in `trains` arrays
§3 trap #2 says gate on `p.wishes`, never `def.faction`. §6 Slice 2 says "16 additions to faction `trains` arrays." These cannot both hold.

- `ui.js:662` filters the trains loop **only** on `def.faction`. A faction-less wish unit in `trains` shows a button to everyone, always. Its `enabled()` (`ui.js:670`) checks only cost/age/queue, so the button is clickable and the new `def.wish` gate in `trainUnit` returns `false` **silently** — every other rejection in `trainUnit` at least alerts.
- The AI's faction-workshop picker (`game.js:4276-4280`) filters on `(!d.faction || d.faction === this.factionKeys[owner])`, then picks uniformly from `opts`. A wish unit joins `opts` for **every** seat, is picked ~1/len of the time, and `trainUnit` refuses — that building trains nothing that tick, all match. A permanent AI throughput regression from a pure-data line, which will contaminate Battery B against the 2026-08-04 baseline it exists to compare with.

Pick one: wish units live **only** in the wish-gated `cmds.push`, never in `trains`.

Also worth knowing: **`trainUnit` never checks `b.def.trains.includes(type)`** (`game.js:2710-2724`). That is why the AI fort pick at `:4238` works at all. So `def.wish` is your only gate — make it loud, not a bare `return false`.

### 6. "N/M verified free" is false — `M` is mute
`main.js:2724-2727`:
```js
if (k === 'm') { sfx.setMuted(!sfx.muted); setMuteVisual(sfx.muted); }
```
That is **inside** the range the spec cites as checked (`main.js:2680-2731`). The handler has no early return, so binding a power to M would cast **and** mute. `n` is genuinely free; `CARD_KEYS` (`main.js:2747`) is `q,e,r,y,u,i,o,p,k,j`, so the card is not the conflict — the mute is.

---

## THE SEVEN HUNTS

**1 · Choices not through `execCommand`.** The `{t:'age', w}` piggyback is correct — `net.js:211/234/263` ships whole command objects, `issue()` deep-clones into `cmdLog` (`game.js:2140`), and `case 'age'` already exists (`game.js:2232`). Two holes:

- **The pick can be silently discarded.** The ⏫ `enabled()` (`ui.js:734`) is `aging <= 0 && canAfford(...)` — it does **not** check `up.reqBuildings` or `up.reqAge2Count`. Those live only inside `startAgeUp` (`game.js:2752-2769`), which alerts and returns false. So the button is legitimately clickable in a failing state today. `pendingWish` must be written **inside** `startAgeUp`, after every guard, on the `return true` path only.
- **Client-side optimism.** Nothing in the spec forbids `showWishPick`/`updateWishBar` decrementing `wishCharges` locally for responsiveness before the command round-trips. In lockstep that is an instant desync. Say it out loud.

**2 · New sim state missing from hash/snapshot.** The spec's `stateHash` block is the right call and the diagnosis is correct — `p.techs.size` (`game.js:2260`) hashes the **count**, not the content, and `p.mods` is absent entirely, so `__ttNetTest` (which asserts on `stateHash()`, `main.js:1882-1883`) is provably blind to a tech-granting or mods-granting wish. G4 is the right gate. But the build order never says to do these:

- **`u.aura` is not in the `k:'u'` field list.** `snapshot`'s unit record (`game.js:2333-2341`) is an explicit whitelist, not a spread. Writer *and* reader (`game.js:2409-2417`) both need the field.
- **`this.zones` lives outside `entities` and has no snapshot key at all.**
- `p.mods` doubling is a **narrower** risk than the spec claims, and that matters. `restore` does `Object.assign(p.mods, sp.mods)` (`game.js:2395`) — assignment on a freshly constructed Game — and `snapshot` writes `mods: {...p.mods}` (`game.js:2327`), so any new mods key round-trips for free and cannot double by itself. Doubling happens **only** if `restore` re-runs `applyWish` over restored `p.wishes`. State the rule instead: *restored wishes are data, never re-applied.* (Granted techs are safe either way — `applyTech` early-returns on `p.techs.has`, `game.js:1833`.)

**3 · `Math.random` / `cb.cinematic` / `localStorage` in sim.** The soak `cb` stub is exactly `{alert, selection, age, gameOver}` (`main.js:1750-1751`), `this.fx` is a real `VFX` (`:1742`), `this.sfx` is `null` — all three match the spec. But the house rule as written is too blunt: **`applyDamage` already calls `Math.random()` at `game.js:2815`**, inside the `if (this.fx && seen)` view gate. The real rule is "no `Math.random` on a path that can reach hp, position, order or the rng cursor." Write it that way or a builder copies the wrong half. No `localStorage`-into-sim risk found — but note `wishOffer`'s `needs:'pet'` predicate (below) is the one place a sim decision reads config that doesn't match reality.

**4 · Units that actually need art.** The tinting story survives scrutiny (see the credit paragraph). Two real gaps:

- **`if (proceduralEra) registry = {}` (`models.js:1488`).** In Toy Box Zero every wish unit falls through `def.proc` — which **none of the sixteen specify** — to `makeBoxView`. Same on a GLB load failure (`loadUnitModels` pushes to `failures` and leaves `registry[key]` undefined, `models.js:365-368`). A unit whose entire identity is "an existing GLB, re-tinted" has nothing left. Give each one a `proc:` fallback.
- **`PORTRAITS` aliasing is necessary but not sufficient.** `renderPortraits` does iterate the unit **registry** (`models.js:2292-2298`), so the alias line is right and `main.js:249` is the right place. But `main.js:1353` builds the Codex "toys" tab from `Object.keys(UNITS)` — **all sixteen wish units will be publicly listed to every player of every faction**, spoiling the surprise, and `lore.js` is a nested `{factions, units, …}` object (`lore.js:7-8`) with no `wishes:` bucket to degrade into. Not an art gap; still not free.

**5 · Effects needing a new subsystem.** Beyond Blocker 1: the zone multiplies at `speedOf` (`game.js:1779`) and `startSwing` (`game.js:3251`) are genuinely cheap and correct — both already read `players[owner].mods`, so a zone term slots beside `mods.speedAll` / `mods.atkSpeed` with no plumbing. `mega`-as-bonus-key is verified free. `noCollide` is the one the spec flags but doesn't design: unit separation and `blocked`-tile rejection are different code paths, so "ignore units, not tiles" needs the flag threaded at the specific separation site — an assertion in a soak is a test, not an implementation.

**6 · Save version / replays.** No snapshot bump needed — correct. `restore` has no migration machinery and its established pattern is tolerant reads (`se.progPid ?? -1` at `game.js:2489`, `se.type || 'mouse'` at `:2452`). Consequence the spec doesn't state: a **campaign save in progress permanently loses the wishes for ages already passed.** And the replay stamp (djb2 of `data.js`+`game.js` text) means **all ten Replay Shelf bottles and every shared `TT1.` code go dead on the first character changed.** "Do not fix it" is right; say out loud that it ships as user-visible data loss on a feature Kyle built and advertised as shareable.

**7 · Deterministic AI picker.** Yes — *if* `aiPickWish` draws from `this.rng` (Appendix law 3 covers it). Two gaps:

- **The `wishScript` pin must still consume the draws.** There is an exact precedent the spec doesn't cite: the faction roll (`game.js:322-325`) and persona roll (`game.js:~344-348`) both consume their draw *even when pinned*, with comments explaining that saves/replays/MP diverge otherwise. If a pinned wish skips `aiPickWish`, Battery A (pinned) and Battery B (free) run on different rng streams and are not comparable, and no pinned soak's `fp` will ever match a live game that picked the same wishes. Copy the persona pin's shape exactly.
- **The AI's age-up can fail and re-draw.** `game.js:4228` calls `this.startAgeUp(chest)` bare, guarded only by `saving && canAfford` — same missing `reqBuildings` check. A failing age-up burns jitter draws and retries next tick. Deterministic (every client runs the AI), so MP-safe, but Battery C's 10,000-call distribution is then not the in-game distribution.
- **`fp` is not a wish fingerprint.** `__ttSoak`'s fp (`main.js:1800-1801`) is `Σ(x*71 + z*137 + hp*13) | entities.length | rng.getState()` — **no player state at all**: not techs, not mods, not age. G1 will pass two runs differing only in a mods-shaped wish until the difference reaches positions. Fold `stateHash()` into the soak return, or say plainly that G1 is a smoke test and G4 is the gate.

---

## TWO MORE, UNPROMPTED

**`needs:'pet'` is map-config-shaped, but the pet is `zeroEra`-gated.** `this.map.cat !== false` / `this.map.dog` are wrapped in `if (!this.zeroEra)` at `game.js:1029-1033`. Toy Box Zero runs on a normal map key, so a `wishOffer` reading map config alone offers "Ask the Cat Nicely" in a match with no cat. `bathtub` (`data.js:966-981`, `cat: false`, no `dog`) is the only case the spec's alternate handles. `game.zeroEra` is sim-side (set at `main.js:2188`, one line before `setup()`), so the predicate can and must read it.

**The modal is a real-time blackout in MP.** The RTS lockstep does not ready-gate the way Empire does; a client sitting in `showWishPick` keeps sending empty batches and the match runs on. Reusing `.e-enc` is CSS-correct but borrows a **turn-based** interaction pattern for a real-time game: pressing ⏫ costs the player their army for as long as it takes to read three cards, on top of the 40 s `p.aging`. Empire's modals had no clock. This one does. Consider a non-blocking `#wishbar`-style picker with a timeout default.

---

## LINE CITATIONS: `game.js` HAS MOVED UNDER THIS SPEC

`models.js`, `ui.js` and `toybox-tactics.html` land on the nose — `models.js:342` (`loadUnitModels`) ✓, `:1513/1514` (silhouette) ✓, `ui.js:212/213` (`visible()`) ✓, `:735` (⏫ onClick) ✓, `:746` (`buildCard`) ✓, `html:279` (zoom list, and `#hud` correctly excluded) ✓.

`game.js` is exact below ~line 700 and then drifts progressively:

| spec says | actually |
|---|---|
| `spawnUnit` 1720 | **1730** |
| mega beat 1741-1745 | **1758-1762** |
| `trainUnit` 2692 | **2710**, faction check **2715** |
| "second gate" 2637 | **2660** — `:2637` is `case 'garrison'`, unrelated |
| `applyDamage` 2759 | **2779**, bonus loop **2782** |
| `convertUnit` 3771 / 3781 | **3794** |
| AI fort pick 4212 | **4238** |
| AI workshop filter 4246 | **4276-4280** |
| `CINE` (main.js) 3068 | **3075** |
| `PORTRAITS` (models.js) 2293 | **2292** |

And the `def.faction` audit is short: there are **eleven** read sites, not six — `game.js:2660, 2715, 4107, 4238, 4280` · `ui.js:212, 579, 662` · `main.js:558, 560, 561`. The three the spec missed (`ui.js:579`, `main.js:558-561`, `game.js:4107`) happen to be benign for a faction-less unit, which is luck, not analysis. **Re-derive every `game.js` line by content before it goes in the bible.**

---

# HOSTILE REVIEW 2 — DESIGN

# HOSTILE DESIGN REVIEW — "Bedtime Wishes"

Verified against `C:\Users\kylef\Downloads\New folder\toybox\data.js` and `toybox\game.js`. Numbers below are from the code, not the spec.

---

## 0. The fact that reframes everything

`data.js:22` — `AGES = ['Bedtime Age', 'Playmat Age', 'Fort Age']`. `AGE_UPS` has exactly two keys: **400 snacks + 150 blocks + 40s**, then **800 snacks + 350 buttons + 55s**.

So the trigger you chose is the one thing in this game that **a losing player cannot buy.** Not "gets later" — *never gets.* A player being pressured at minute 5 does not spend 800 snacks, 350 buttons and 55 seconds of chest downtime; that is precisely the moment they cannot. The winner clicks age-up because nothing is stopping them.

**You have built a comeback-shaped fiction on top of a snowball-shaped trigger.** Every other criticism below is downstream of this one.

Worse in context: three batteries measured seat-0 at **67–77%**. Seat 0 ages first more often. Seat 0 therefore gets more wishes, sooner. This feature multiplies the largest unexplained problem in the codebase, and **no battery in §7 reports the seat-0 delta before/after.** Battery B measures faction spread. Add seat-0 win rate to it or you will ship an amplifier and read it as a faction result.

---

## 1. Auto-picks

**The free Toy Dragon (knights March@2) is not a choice, it is a reward for reading the table.** 640hp / 22 siege / splash 1.6, free, against "a free Toy Fort plus three more free buildings" (Hearth) and "self-repairing forts + 2 armour" (Keep). You priced it yourself: 280 snacks + 180 marbles + 50s of production. Nothing in the other two lanes is within 3× of that. Your named fallback — gate it behind the A1 Warm Egg — makes it *worse*: now both picks are forced, and knights have a solved book.

**March is the auto-pick across the whole system, and it isn't a stat auto-pick.** By your own table, ~10 of 16 wish units sit in March, 5 in Keep, **1 in Hearth**. Seven of eight factions get zero new toys from the economy lane, ever. In a game whose fantasy is *toys*, "the lane where a new toy appears" wins on desire before it wins on math — and **Battery A cannot detect this.** It measures lane edge. Battery C measures the *AI's* distribution. Nothing in §7 logs a human pick. Ship Slice 1 to Kyle and log `p.wishes`; if March is >55% you have a two-lane game.

**Follow the Season (plains Hearth@2) is a phase change, not a buff.** `data.js:787` — `farm.farmRate: 0.8` vs worker `gatherRate: 1.35`. Farms are deliberately 41% *slower* than piles: infinite-but-slow. Doubling to 1.6 makes a farm **1.19× a pile, infinite, with zero walk time**, and you also make them free and slow pile depletion 35%. That is four multiplicative economy effects on one card. And `game.js:3715` multiplies farm yield by `mods.gather * mods.gatherSnacks`, so it stacks with whatever Move the Camp granted at age 1. **Your own fallback (farmRate 1.3) is still 1.6× base and still beats a pile once travel is counted.** The correct fallback is 1.0–1.1.

---

## 2. Traps

**Hearth is the trap lane, for seven factions.** It compounds from minute 6 in a game your own diagnostics say concludes at 7–15 minutes, it contains one unit in the entire roster, and its payoff is "have more resources at the moment the match ends." You defend it with "compounds from minute 6." Minute 6 is halfway.

**Mend the Fence (wranglers Keep@1).** You name it your own worst pick and defend it with `pockets` + 2 Storage Baskets + `buildingHp ×1.2`. Wranglers ship `buildingHp: 0.92` (`data.js:2237`). So the reward for this pick is *becoming a normal faction*. Meanwhile The Whole Herd hands you a toy. One option removes a designed penalty, the other adds a capability. Capability wins every time, because the penalty is already priced into everything else you own.

**Yellow Flag.** You concede its floor is zero. A defensive power with 2 charges and a zero floor is not a tool you build around; it is a thing you forget you have. The attached gift (`quilting` + `armorOther += 2`) is doing 100% of the work, which means the *power* is decoration.

**The Long Gun.** You state it is the only `bonus:{mega:n}` unit in the game — and you're right, I checked every `bonus` key in `data.js` (raider/ranged/building/worker/vehicle/infantry/heavy/siege/ship/soldier; no `mega`). It is behind classic's **Keep** lane. Either megas are already killable, and the Long Gun is redundant flavour; or they aren't, and classic's Keep lane is mandatory. Both readings kill the choice. A titan-counter is not a lane preference in a game with eight titans.

---

## 3. Snowball — the AoM sin, and you committed it three ways

**(a) The trigger.** Covered in §0. This is the big one.

**(b) The catalogue is multiplicative.** `gather ×1.08`, `unitHp ×1.12`, `buildingHp ×1.5`, `farmRate 2×`, `buildRate 1.2`, `speedInf`, `+2 armour on every infantry`, veterancy on your standing army. **Flat grants are comeback-shaped; multiplier grants are snowball-shaped.** A free building pays a fixed amount whether you have four toys or forty. `+2 armour on every infantry` and `Second Wave`'s free `+3 kills` pay *proportionally to the army you already have*, which means they pay the player who is already winning the fight. Your catalogue is roughly 80% multipliers. Count them and invert the ratio.

**(c) Tidy Up is the worst offender and you cleared it on the wrong test.** You compared it to Fimbulwinter on damage and denial, concluded "it kills nothing and cannot touch buildings, so it can never win a match outright," and shipped it. Wrong axis. **A leader's only loss condition is one catastrophic engagement.** A free perfect disengage deletes that condition. It converts "I'm ahead but I might throw it" into "I'm ahead." That is the definition of winning a won game — it just does it by subtraction. Tidy Up is more snowball-y than the dragon, not less, because it has no counterplay at all.

**(d) The unflagged one: a flying siege unit.** I traced `def.fly` — `game.js:3166` (`steer` beelines, no pathfinder) and `game.js:3225` (`move` checks only `inMap`). A flier ignores walls, ridges, cliffs, water, unit collision and the entire pathfinder. There is **no `fly` bonus key anywhere in `UNITS`** and no anti-air concept in the game. Your risk table worries about TAKE THE STAIRS — a **25-second** ridge corridor — and does not mention **The Paper Bomber, a permanent unwallable siege platform.** Ridges, chokepoints and walls are the balance backbone of five of your maps and the entire reason knights read 50% terraced. Handing racers a permanent flying siege unit is a larger map-level swing than every item in §5 combined. Racers already own a flier (Whirly Drone, `data.js:182`) but it's `bonus:{worker:2}` — a harasser. Siege is a different object.

---

## 4. Different armies, or different numbers?

Mostly different numbers, and I can be exact.

The **only** army-composition lever in the entire system is the 16 wish units — everything else is mods, techs, free buildings and events. Powers are moments, not compositions.

Per faction, both units and their lanes:

| faction | unit lanes | verdict |
|---|---|---|
| **classic** | Keep, Keep | 2 of 3 lanes are pure spreadsheets |
| **bricks** | March, March | 2 of 3 lanes are pure spreadsheets |
| **racers** | March, March | 2 of 3 lanes are pure spreadsheets |
| **bots** | March, March | 2 of 3 lanes are pure spreadsheets |
| plush | Hearth, March | Keep is a spreadsheet |
| knights | March, Keep | Hearth is a spreadsheet |
| wranglers | March, Keep | Hearth is a spreadsheet |
| plains | March, Keep | Hearth is a spreadsheet |

**Four of eight factions can go two full games without a single new toy.** Every faction has at least one dead lane. And the units themselves are existing GLBs re-tinted and re-scaled — so even the lane that *does* change your army changes it into a recoloured version of a toy you already field. In a game about toys, that is the least toy-like possible expression of "new".

Your line "the wish unit's lane is never predictable: March ×9, Keep ×5, Hearth ×2" is sleight of hand — it counts across 16 slots, not per faction, and it hides that March holds two thirds of them.

---

## 5. Is the fiction real?

**The names are toybox. The mechanics are AoE.** That gap is the weakest thing in the document.

Genuinely irreplaceable — could not exist in another game: *Nobody Came*, *Nobody Winds Us But Us*, *Still Ticking*, *What the Picture Showed*, *We Watched Them Build It*, *Somebody Asked For Us*, *Nine Hundred Bedtimes*, *The Warm Egg*, *Leave It On*, *Tidy Up*, *Folded From the Instructions*, and all six Room Wishes. That list is very good. *Nobody Came* is the best thing in the spec.

Reskins — swap five words and they ship in AoE2 unaltered: **Dig In** (Fortify), **Second Wave** (reinforcements), **The Long Watch** (tower tech), **One Brick Taller** (wall HP), **Marshals on the Track**, **Sponsorship**, **Mend the Fence** (repair), **To Be Raised**, **The Old Guard** (veterancy), **Bring 'Em All Home**, **Quartermaster's List**, **Maintenance Report**, **Keeping Everything That Does**, **Move the Camp / Follow the Season** (farm upgrades).

Note the pattern: **classic and plains are almost entirely reskin — and classic is the faction you picked for the Slice 1 vertical slice.** The first thing anyone plays is the least distinctive half of the feature. Ship **knights + bots** instead: knights are the 32% outlier (your own reason) and bots carry the strongest fiction in the document. That proves the feature is *about* something on day one.

The root cause: **your lane axis is Hearth / March / Keep — economy, army, defense.** That is the most generic triad in the genre. The fiction lives entirely in the leaf names. The abandonment/being-loved axis your best wishes are actually about (*nobody came*, *somebody asked for us*, *leave it on*) is never a mechanic anywhere. If the toybox fiction were load-bearing, the three lanes would be something like **be played with / be put away / be lost** — and each would mean something a bedroom means and a fortress doesn't.

---

## 6. Once-per-game — right call, wrong charge split

Once-per-tier is correct and your Retold reasoning holds. Two corrections:

**The charges are backwards.** Wish I gets 2 charges early; by the time you'd spend the second, you've aged up and gotten Wish II, so charge #2 routinely evaporates. Wish II gets 1 charge and lands with 3–6 minutes of match left. **Instrument this: report median `stats.wishesCast` in every battery. If it's under 2, the powers are decoration and you built eight `POWER_FX` kernels for a stat line.**

**Your no-hoarding argument only covers Wish I.** You argue a Wish I power creates nothing permanent so there's no reason to save it — fine. Wish II is 1 charge and explicitly *may* create permanent objects. The correct play is therefore to hold it for the decisive fight. That is hoarding, it is optimal, and it means the Wish II power is invisible for most of the match and then decides it.

**Repeatable candidates:** the zero-floor defensive ones (Yellow Flag, Hold the Line). A defensive tool you can't rely on isn't a tool. A long cooldown, no charge count, small effect would make Keep a lane you *play* rather than a lane you bank.

---

## 7. Does it improve the first 10 minutes?

**No. It improves minutes 5–15 and does nothing at all before then.**

First age-up is 400 snacks + 150 blocks + a 40s research; second is 800 + 350 + 55s. Realistically Wish I lands around minute 4–5 and Wish II around 8–10, in matches that end at 7–15. The opening — the stretch your own depth audit identifies as the real problem ("the gap is DISCOVERABILITY, not mechanics") — is untouched. You added a modal at minute 5.

And the pick is made with **full information about the game state and a fixed three-option menu.** Your Law #2 says the offer must be pure because that makes it *plannable*, "an identity rather than a slot machine." Correct — and then you placed the pick at the moment when planning is already over. A pick with fixed options and no new information should be made **before** the match. A pick made mid-match should be **responsive to the match** — which your AI's scoring is (situational terms) and your offer is not. You built that asymmetry backwards.

---

## THE SINGLE STRONGEST RECOMMENDATION

**Move Wish I out of the first age-up and into the pre-game, alongside faction select. Keep Wish II at the second age-up.**

One move. It kills, in order:

1. **The snowball trigger, for half the system.** Everyone gets Wish I at t=0 regardless of who is ahead. The player getting rushed still has an identity. Right now they have nothing.
2. **The dead opening.** Wish I now shapes build order, resource priority and scout timing — it is a thing you *play the first ten minutes with*, not a thing the first ten minutes earns you.
3. **The plannability contradiction.** Your Law #2 finally means what it says. A fixed, pure, three-option menu is exactly right *before* a match — that's why AoM's god pick works — and exactly wrong during one.
4. **Half the MP surface.** The pick becomes part of `playerDefs`, dealt with the seed. `§2.18`'s 40-second `p.aging` window hazard, `pendingWish` mid-`aging` in G3, and the `dropAt`-inside-the-aging-window case in G2 all cease to exist for Wish I. `wishOffer` is already a pure function of faction + age + map config — it can be called before `setup()` with zero change.
5. **Battery A's confound.** Lane-pure lines currently entangle "is this lane good" with "did this seat get to age up." Pre-game Wish I decouples them.

It also converts the AI's pick from an invisible mid-match decision into a legible pre-match one, which is what makes rival identity readable — the thing you say in §7 you want Battery C to prove.

**Two things to do while you're there, in order of value:**

- **Stop routing faction fixes through wishes.** Racers `gather: 0.97`, bots `speedInfantry: 0.95`, bricks `speedInfantry: 0.97` all carry literal `// battery-tuned` comments in `data.js` — they are measured decisions. Wishes that cancel them (racers Hearth `gather ×1.08`, wranglers Keep `buildingHp ×1.2`, knights March speed-to-par) don't fix a weak faction; they make the faction weak when unpicked and fixed when picked, which makes its win rate a function of pick distribution. **You will never be able to read the balance table again.** If knights are at 32%, change the 0.94. That costs one number and stays measurable.
- **Give Hearth a toy.** One unit across sixteen is why the economy lane is a trap for seven factions. Move one March unit per faction into Hearth or Keep so no faction has two units in one lane — that single reshuffle is what turns "different numbers" into "different armies" for classic, bricks, racers and bots.

**And before Battery A: cut the Paper Bomber, or add a `fly` bonus key.** A permanent unwallable siege platform in a game with no anti-air is not a balance risk to be measured — it's a terrain system to be deleted.