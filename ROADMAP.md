# AGE OF TOYS — THE IMPROVEMENT ROADMAP
*Lead design pass, 2026-08-19. Every claim below is anchored to the adversarial verification pass; where a proposal's premise turned out to be false, I say so rather than repeating it.*

---

## I. THE FIVE INSIGHTS

These are conceptual gaps, not missing features. Each one was reached independently by two or more of the franchises studied, and each one is confirmed by the game's own measured data.

### 1. The game has systems, but almost no forks.

AoM (minor gods), AoE3 (Politicians) and AoE4 (Landmarks) independently arrived at the same structure: **the age-up is a branching draft, not a fee.** Age of Toys has all the machinery — 31 techs, 8 factions, an age-up that already freezes the economy building (game.js:2683) and already fires a cinematic beat — and the age-up is a price tag.

The consequence is measurable, not aesthetic. Three separate balance batteries (07-29, 08-04, plus the six-faction matrix) put all eight factions in a **+12 … −17 band around a positional floor**. That band is the textbook signature of multiplier asymmetry: `gather 1.04`, `buildingHp 0.92`, `speedInfantry 1.05`. Nobody plays a percentage. A player who picks the Wranglers and a player who picks the Plains are making the same decisions in the same order at the same times.

**What's missing is not content. It is branch points.** The cheapest branch point in the entire document is a two-of-three offer at each age-up: 12 authored objects × 8 per-faction offer tables = 64 distinct build lines, with no new art and no new sim subsystem.

### 2. The economy has no clocks, no frictions and no sinks.

The audit's verdict here is exactly right and worth restating as a design principle: this is a *complete* AoE-family economy — finite depleting nodes, compounding workers, idle-worker routing, forward drop-offs, a market with living mean-reverting prices, town-bell garrison, neutral map income. It out-depths several commercial RTS.

And every resource gathers identically, at the same rate, with the same carry, forever, with no ceiling and no sink. `gatherRateOf` is one multiplier with a snacks-only branch (game.js:1807). All four resources are general-purpose, so watching an opponent's gather split tells you nothing. Killing pays nothing. A dying hauler's carried load is *erased* (game.js:2832 — a real bug, unnoticed for months).

Canon RTS economies are not made of rates. **They are made of risk shapes**: the boar that decays, the drop-off distance that costs you 68% idle, the harvester that is 3000 credits standing in the open. Age of Toys has one gather verb, repeated four times, at zero risk. That is why late-game states resolve into "float 4000 blocks and the AI heuristic literally complains about it" (game.js:4056).

### 3. The best combat system in the game is invisible — and depth is a legibility problem, not a mechanics problem.

38 of 53 units carry a flat bonus-damage table across 9 counter axes, applied at game.js:2748-2750. It is a genuinely good, genuinely AoE2-shaped counter web.

It is surfaced in **zero** places. Not the selection panel (ui.js:334-337 shows hp/atk/melee-pierce armour/speed/rank). Not the command-card tooltip (`unitStatLine`, ui.js:414). Not the codex (main.js:1394-1400). Not the damage numbers. Verification also found there is **no world-hover picking at all** — the single `pointermove` handler (main.js:2468) only tracks the cursor for edge-scroll and building placement.

Three separate audits reached the same conclusion from three directions, and CLAUDE.md already states the lesson: *"if the game feels shallow while having these systems, the gap is DISCOVERABILITY, not mechanics."* A prior session pitched stances, formations and garrison as missing depth — all three were on the command card.

**Corollary that should govern the next six months: before adding a mechanic, check whether the mechanic exists and is merely unseen.** The verification pass in this document killed six proposals on exactly that basis.

### 4. The presentation layer was built before the payload, and that inversion is now an asset.

`cinematic(kind,x,z)` with its 5-beat table, letterbox bars, zoom-punch, shockwave rings, light pillars, `shakeCam`, 8 VFX pools, positional audio with distance attenuation, per-map colour grades, tilt-shift post at 0.284ms, 3D speech bubbles, 71 bark sets, and **32 fully-voiced narrator lines in one committed Alistair preset** — all shipped, all verified, all idle.

There is a spectacle engine here with almost nothing to fire through it. In most projects that ordering is a mistake. Here it means **content is unusually cheap right now**: a one-shot power costs a data entry and an effect function, because the flash, the bars, the pillar, the shake, the voice and the ping are already written and already deterministic-safe (`this.cb.cinematic && …`, undefined in the soak stub).

Fire things through it.

### 5. The room is the game's best writing and does zero mechanical work.

The house cat, the yard dog, the Roomba and THE KID are the most distinctive things in the codebase. THE KID is a full five-phase set piece — footsteps, a colossal sweeping shadow, a procedural hand descending from y=44, camera shakes, bookending alerts (main.js:3227-3305) — and its own header comment says *"The sim never knows."* The grab targets a decor mesh and sets `visible = false` (main.js:3294).

The cat swats for 9, the dog pounces for 6, the Roomba shoves for 1.7 and damages nothing. None of them destroys or disables a building, so nothing punishes packing tight. **The best cast in the game is weather.** In AoE2 the boar is a decision; in Stronghold fire is a layout antagonist; in AoM the Titan is a thing both players plan around. Here the room happens *to* you and you never once make a choice because of it.

Making the room playable — luring it, hiding from it, being punished by it — is the single largest identity gain available for the least new code, because the actors, the state machines, the views and the snapshot round-trips all already exist.

---

## THE COST MODEL (read before ranking anything)

In this codebase, **where a change lands dominates how many lines it is.** The verification pass repeatedly found 30-line diffs that cost a full session and 200-line diffs that cost an afternoon. Four tiers:

| Class | Real cost | Examples |
|---|---|---|
| **View-only** (models/vfx/post/main render paths) | Hours. Ship same day. No verification tax. | Every free pass that shipped in July/August: oomph, life, toy-blood, speech bubbles, construction/death |
| **UI + data-read** (ui.js reading existing sim fields) | Hours. Watch the stable-DOM rule. | The Size-Up, production strip, clickable alerts |
| **Sim, no new state** (pure functions of existing fields) | A session. fp + netTest + soak sweep. | Battle Lines, resource physics multipliers |
| **Sim + new persistent state** | A session for the code, **plus a session for the battery**. Save round-trip mandatory. | Go Still, wishes, spill pickups, squeaky bait |

### Definition of done for any sim change — non-negotiable, reused by every item below

1. `__ttSoak` fingerprint **identical** for the same seed on ≥2 map/faction sets — and, where the feature can be inert, byte-identical to today's build when it never fires.
2. `__ttNetTest` 2h+2ai and 3h+1ai asserting **`inSync === true`** (not `!== false`; undefined reads as passing — a documented trap).
3. Snapshot → JSON → restore → compare, per iron invariant #4.
4. 6–8 map soak sweep, 0 errors, all games conclude.
5. If balance-affecting: mirrored seat orders × **both** map pools. Un-mirrored data is garbage — seat-0 measured at 77/67/67%.

**⚠️ The single most dangerous finding in the whole verification pass:** `stateHash()` (game.js:2220-2241) folds only id / x / z / hp / stance / garrisoned / objective-holder / player res. It does **not** fold `carry`, and it would not fold any new status effect, timer, or resource. That means `__ttNetTest` can report `inSync === true` while two clients disagree about every new field you added. **Extend `stateHash` in the same commit as any new sim state, or your MP verification silently stops covering the thing you just built.**

---

## II. TIER 1 — DO FIRST

Highest value per effort. All seven are code-only. None but #6 touches the deterministic sim. Together they are roughly two weeks and they change how the game *feels to understand*, which is the game's actual deficit.

---

### 1.1 THE SIZE-UP — make the counter web visible
**Verified: BUILD, score 78** (the highest score in the entire evaluation) — for the view half only.

**What:** Hover any enemy with a selection active and the game tells you whether this is your fight.

**Inspired by:** Halo Wars' plain-language counter triangle; AoE2's floating bonus damage.

**Mechanics:**
- Throttled hover pick (~10 Hz) via `game.entityAt` — already fog-gated, so hidden units correctly cannot be sized up. This is new: there is currently no world-hover of any kind.
- Each selected portrait gets **▲ / – / ▼**, computed from `atkOf`, `armorOf`, `def.bonus`, `def.range` — all live entity reads, no new state.
- Two numbers: **seconds for you to kill it / seconds for it to kill you.** Use `def.interval × players[o].mods.atkSpeed` (game.js:3217) and real entity armour, not defs.
- Bonus hits get a tinted, prefixed damage number: hoist the bonus into a local at game.js:2748-2750 and pass it to the existing `DamageNumberPool` call (vfx.js:432), which already sits inside the view-only `if (this.fx && seen)` branch. `+18 vs vehicle` in the unit's colour.
- Counter barks through `ui.maybeBark`, which already routes to the HUD feed *and* the 3D speech bubble. **Caveat:** `maybeBark` has a 6.5s global cooldown and a 45% random drop, so a counter line will usually not fire on the hover you care about. Either add a cooldown-bypass path for this kind, or ship it as garnish and don't sell it as the feature.

**Why toys:** The toys tell you who should take the fight, in their own voices, over their own heads. That is a joke and a UI readout at the same time — the exact register this game wants.

**Effort:** S–M. ui.js, main.js, one hoisted local in game.js, CSS.
**Risk:** Near zero. No sim state, no save change, no battery. Two traps: never rebuild the portrait strip via `innerHTML` on a ticker (clicks get eaten — documented), and `#hud` is deliberately excluded from the `--ui-text` accessibility zoom, so a new HUD panel inherits that exclusion.

**⛔ DO NOT BUNDLE the data.js half.** Adding counter axes for `mega`/`support`, and adding an `armor.siege` field, are *balance changes wearing a UI feature's coat*. Two corrections to the original pitch: no def declares `armor.siege`, but tech armour (`armorInfantry`/`armorOther`) and the steel_/elite_ tiers **do** apply to all damage types, so "siege bypasses all designed armour" is an overstatement; and the 7 siege units already carry `bonus:{building: 8–18}`, so "siege has no headline job" is false. Ship the readout first — it becomes the diagnostic tool that tells you whether the counter web actually has holes worth filling.

---

### 1.2 The retention one-liners (four fixes, one afternoon)

Four separate items, none larger than a few lines, each throwing away a disproportionate amount of value:

| Fix | Where | Why it matters |
|---|---|---|
| Persistent survival high-water mark | `blank()`, chronicle.js:14 — add a wave field; record at survival game-over | `bestWave` currently lives only in the live match. Your furthest night is forgotten every session. That is a leaderboard-shaped hook discarded for one field. |
| Act V Bedtime Story | ACTS arrays in chronicle.js | Act V ships five missions, a bookend page, and no achievement. |
| `LORE.factions.knights` | lore.js | Missing. Degrades silently through `\|\| ''`, so the tribe that headlines Act V renders an empty codex block. |
| Empire → Chronicle bridge | `recordMatch` is never called from empire.js | The game's only real meta-loop (16 named cards, 4 rarities, seeded loot, crafting) is invisible to the rest of the game. Surface the collection and Empire stats in "Your Legend". |

**Effort:** S total. **Risk:** none.

---

### 1.3 Order acknowledgment + clickable alerts
**Verified: PARTIAL_EXTEND** — the "room talks back" pitch is ~70% already shipped, but two gaps in it are real and precisely measured.

**What:** Close the four silent order types and make alerts clickable.

**Mechanics:**
- `rightClick` returns seven result strings (game.js:2579-2613), and both consumers handle only four. **build / trade / garrison / guard get no ping and no bark.** Add the four `else if` ping branches (main.js:2600-2602 and 2226-2228) and four entries to `orderBark` (ui.js:281-283). `maybeBark` already falls back to `set.sel` when a kind is missing, so a partial bark rollout degrades gracefully.
- `alert()` (ui.js:62-71) builds a plain div with `textContent` and zero listeners. Stash `pos` on the div, add a click → `hooks.centerCamera(pos.x, pos.z)`. The hook already exists and is already wired for the minimap (main.js:2219). Add a jump-to-last-alert key while you're there.
- Optional, ~free: the existing attack alert (game.js:2794) already carries `target.x/z` and is already owner-gated — add the compass word ("they're at the north wall") as pure formatting.

**⛔ Two sub-pitches were verified impossible or redundant and must not be built:** "we can't pay for it" describes a state that cannot exist (production is pay-on-enqueue, game.js:2685-2690, refunded on cancel); "the crayons are gone" already exists as a throttled alert with a minimap ping (game.js:3659), behind a precondition that IDLE HANDS dissolves in 5 seconds (game.js:3526).

**Effort:** S — about 25 lines. **Risk:** none. Pure view.

---

### 1.4 NAMED TOYS AND THE MEMORIAL
**Verified: PARTIAL_EXTEND, score 72** — build the naming and memorial, cut the returning-legends tail.

**What:** A toy that reaches rank 2 earns a name. From then on the barks, the death alert and the Chronicle talk about Sergeant Pip.

**Inspired by:** XCOM's soldier names doing emotional work no stat block can.

**Mechanics:**
- Trigger at the existing rank-2 threshold (6 kills, game.js:1774-1775). Name = pure hash of (`g.seedUsed`, unit id, type) over a `TOY_NAMES` table (~120 given names × ~40 toy epithets ≈ 4,800 combinations). **A hash, not `this.rng`** — consumes no rng, adds no sim state, is identical on every client.
- Name label reuses `speechTexture` / `attachSpeech` (models.js:515/558), the canvas-text-over-head system already built for barks.
- Death beat: **`this.alert(..., 'story')`, not `narrate()`.** Narrator beats are one-shot per key via `_told_<key>` flags which are snapshotted (game.js:2293/2548), so a per-toy beat would fire once ever or bloat `told`.
- Fallen named toys append to `tt-memorial` (name, faction, kills, map, cause, night number) → a "Toys We Remember" page beside Your Legend. **Store the string** — do not re-derive it, or a memorial entry renames itself.

**Why toys:** These are somebody's toys. The game's own lore already makes namelessness the villain's wound (lore.js:64 — no initials on his foot, because nobody ever loved him carelessly enough to mark him). Naming is the mechanic that sentence was waiting for.

**⛔ CUT: legends returning tomorrow night.** It carries the entire risk of the feature for the smallest share of the value — replay recording is gated to exactly the SP-skirmish case (main.js:2141), so a localStorage-driven starting army diverges on playback and breaks every share code; host and guest localStorage differ, so MP desyncs instantly; and it is a player-only start-of-match buff the AI never receives.

**Effort:** S–M. **Risk:** Low — no sim state, no save change, no battery.

---

### 1.5 Production overview, select-all-army, and the macro-friction batch
**From the gap map (Tier A #8). Not separately adversarially verified, but the anchors are file:line-exact.**

**What:** Remove the biggest macro frictions, all in ui.js.

**Inspired by:** C&C's sidebar — and specifically the Generals *regression*, which is the most-cited complaint in that series and is present here verbatim.

**Mechanics:**
- `buildCommandsFor` gates every command on `own.length === 1` (ui.js:491), and the queue box shows one selected building. **Selecting two chests gives you no train buttons.** Add an "all production" strip: one chip per production building with its live queue, click to train.
- **Select-all-army** (Ctrl+A), Tab subgroup cycling, clickable portraits in multi-select. None exist.
- Render `u.oq` queued waypoints — the field exists and is never drawn; the move marker is one shared 0.6s ring.

**Effort:** M. Pure ui.js — but ui.js's command card is the stable-DOM danger zone. Diff-and-patch, never rebuild.
**Risk:** None to sim. The only real hazard is the DOM rebuild trap.

---

### 1.6 THE SEAT-0 INVESTIGATION — the highest-value session in this document

**Not a feature. A measured bug that is currently invalidating your ability to evaluate every feature.**

Three independent batteries: **seat 0 wins 77%, 67%, 67%.** It reproduces across both map pools and multiple seeds. The 08-04 battery also found garden *inverted* (seat-0 31% at seed 101) — garden's groves are `count: 5`, odd and unmirrored, the only asymmetric terrain in the game.

Why this outranks features:
- Every balance battery from here on has its statistical power **swamped** by a ±25pp positional effect. The 07-29 run's own note: the seat effect swamps faction skill, so a 104-game battery has low power to detect anything.
- It would be enormously visible in MP, where it is not a measurement artifact but a rigged coin flip.
- It is a hard prerequisite for any scored/timed mode (Dawn, below), where positional advantage compounds instead of being resolved by elimination.

**Method:** build a controlled harness that holds map, factions, seed and difficulty fixed and swaps *only* the seat index; then instrument tick order. Prime suspects, in order: (a) `this.entities` iterates in id order, so seat 0's units acquire targets, resolve attacks and run `separate()` first every tick; (b) spawn/resource placement asymmetry at the seat-0 corner; (c) command execution order within a tick.

**Effort:** M — mostly harness and analysis, possibly a one-line fix.
**Risk:** whatever the fix turns out to be. If it lands in the tick loop, every historical fingerprint and every stored replay is invalidated — which is fine and expected, but plan it as its own release.

---

### 1.7 The reactive-visuals pass (free, view-only, ships in a day)

Kyle cares most about visuals, effects and life. The honest assessment: **the ambient life layer is saturated.** 8 VFX pools, 300–560 instanced ground-cover objects per map, per-map colour grades, weather in six kinds, flyovers, seasons, deepening night, cloud shadows, critter menagerie, three pets, THE KID, battle scars that ghost back next session. More ambience has diminishing returns.

What is *not* saturated is **reactive** visuals — things that respond to the sim. Three, all free:

- **The stumble.** Toys pitch and right themselves over ~0.6s when hit hard. Wire it to the three sources that already displace a unit: cat swat (game.js:1164), dog pounce (1240), Roomba shove (1304). Zero sim state, zero determinism risk, and it answers the question of whether the full knockdown system (Tier 3) is worth its price. *The verifier explicitly recommends this as the first move on that idea.*
- **THE KID misses.** Keep the whole event view-only, but let the shadow fall on a real cluster of toys instead of a decor mesh, add a 6-second alert countdown and a narrator beat, and on close the hand **misses** — the toys flinch and scatter cosmetically. Zero entities removed. This is the verifier's "cheap 80%" and it delivers the drama the sim version was reaching for without the save bump, the limbo queue, the fog-integrity violation, or the Empire roster-loss bug.
- **The dawn lighting prototype.** `updateNight` (main.js:3326-3342) is view-only and monotonic. A reverse branch plus a ramped `post.setLift()` makes the room measurably brighten. Free, beautiful, and it de-risks the Dawn mode decision later.

**Effort:** S each. **Risk:** none. All three are `Math.random`-legal view code.

---

## III. TIER 2 — BIG SWINGS

Transformative and larger. Each is a session or more of code **plus** a verification session. Ordered by value per unit of risk.

---

### 2.1 FORK THE AGE-UP — the draft, and the wishes you draft
**Verified: BUILD, score 68** (cut to five wishes). Also the gap map's #1 Tier-S item. **This is the most important thing in the document.**

**What:** Each age-up offers two of three Bedtime Wishes drawn from a per-faction table. You hold up to three, armed one at a time, and the enemy can see *how many* you have but not *which*.

**Inspired by:** AoM's 36 God Powers; AoE3 Politicians; AoE4 Landmarks; and C&C's rule that the mind game lives in the opponent's *unspent* icons.

**Mechanics — the draft:**
- ⚠️ **There is no ageing pause and one cannot exist under lockstep.** `startAgeUp` (game.js:2714-2741) just sets `p.aging`; completion at 4840-4862 fires alerts and never blocks. The pitch's "existing ageing pause" is fiction.
- Therefore: the offered pair is **derived deterministically from (seed, pid, age)** — a pure salted hash, no rng draw — and the pick arrives as its own `execCommand` case with a **deterministic default** if the player never picks (AFK, drop, or a guest still reading). The offer is a UI moment; the sim never waits.
- Max **3 armed**; **90s** inter-cast lock. Cast = `{c:'wish', key, x, z}`, **2.5s wind-up** with a visible ground marker plus a narrator line.
- Opponent's banner shows a row of grey **❓** per unspent wish; on first use the icon flips to the real one permanently.
- **No charge currency.** Wishes are earned by ageing, full stop. A second economy is an invented number and an extra balance surface.

**Phase 1 — the five cheap wishes** (each 3–15 lines, all modify fields the sim already has):

| Wish | Effect | Implementation note |
|---|---|---|
| 🎖️ HAND-ME-DOWN | One selected unit jumps to rank 3 | Set `u.kills = 10`. Veterancy already derives from kills (game.js:1774-1775) and already snapshots. |
| 🧸 LOST & FOUND | Three of your fallen toys return at your chest at 50% hp | Needs a small per-player fallen list, then `spawnUnit` |
| 😴 NAPTIME | One enemy production building stops producing 20s | One `stopT` field gating the queue tick (game.js:3871) |
| ⚡ STATIC SHOCK | Enemy `vehicle`/`bot`-tagged units within 8 tiles lose 25% current hp | `applyDamage` on a percentage |
| 📦 THE LID | 5-tile disc of blocked tiles for 18s | `this.blocked` is **already** mutated live and cleared on building death (game.js:2903) and obstacle removal (2912), and PathFinder recomputes fresh with no cache. **Must reject placement rather than trap** — a solid disc can strand the units standing inside it. Never block a unit's last free tile; never seal a player in. Restore the tile list on load. |

**Phase 2 — needs a timed-modifier layer that does not exist** (`speedOf` game.js:1760 and `atkOf` 1767 read only permanent tech mods; nothing in the sim carries an expiring stat). Build the layer once, then:
- 🌙 **BEDTIME** — 12-tile radius, **all** units both sides halt 6s. Hitting both sides is the deliberate brake on stacking it with an attack.
- 🔋 **FRESH BATTERIES** — 10-tile, your units +45% speed / +20% attack rate for 25s.
- 🥤 **SPILLED GLUE** — 12-tile puddle, enemies −40% speed for 20s.

**⛔ CUT: THE FLASHLIGHT.** `FogOfWar` (game.js:192-245) is client-local view state updated only for `myTeam`; the sim never reads it for decisions. A reveal wish is sim-inert. Don't ship a power that does nothing on the server of record.

**Why toys:** "The lid", "fresh batteries", "spilled glue", "naptime", "hand-me-down" are objects and events in a bedroom, not fantasy spells. They cost zero art and read as canon on sight. And the persistence matters: a lid and a puddle **change where the fight is**, which is the difference between spectacle and tactics.

**Effort:** L — a data block, one command case, a draft UI, snapshot + stateHash, and **an AI that drafts and casts**, without which the human gets a permanent free edge that invalidates every hard-AI battery number in the file.
**Risk:** High but well-understood. Save-format change; `p.wishes`/`p.wishCd`/live-effect timers must round-trip and appear in stateHash. Balance: mirrored two-pool battery, mandatory.
**Sequencing:** ship the five cheap wishes and prove determinism + save round-trip + `inSync === true` **before** building the modifier layer.

---

### 2.2 BATTLE LINES — melee toys physically block
**Verified: PARTIAL_EXTEND, score 58 — but the best depth-per-line ratio in the entire document.**

**What:** A rank of Block Soldiers actually stops enemies walking through it.

**Inspired by:** AoE2's zone-of-control-by-body; Total War's line-holding.

**The finding:** `separate()` (game.js:3952-3990) is provably symmetric and role-blind — line 3971 computes one scalar `push` and lines 3973-3974 apply the *same* value to both units. No owner comparison, no `def.range` read, `min` hardcoded 0.5 for every pair. Units also never occupy the movement grid at all: `tileOpenFor` and `PathFinder.find` read only `blocked`/`water`/`height`/`gateOwner`. **Armies currently interpenetrate like ghosts.**

**Mechanics — corrected numbers:**
- When both units are within the separation radius and the pusher is melee, the push applied to an **enemy** is **1.3–1.5×** the friendly value, with `min` raised to **~0.65**. Friend-on-friend stays exactly 1.0 so formations and crowding are byte-unchanged. *The pitch's `min` 0.9 × 2.2 gives up to ~0.50 tiles of instantaneous displacement per call at 12.5 calls/sec — that is a catapult, not a wall, and it will fight the stuck detector (`stuckT > 0.7` nulls the path, game.js:3210) into visible jitter.*
- **Melee predicate must be `def.aggro > 0 && def.range <= 1.2`**, not range alone — range ≤1.2 also captures worker 0.7, medic 0.7, trade cart 0.5 and hypno-top 0.6, so a player would wall a chokepoint with twenty workers.
- Raiders (`tags.raider`) take **0.5×** the resistance. Punching through a line is what cavalry is for; this makes it a readable role instead of a stat.
- **Gate the whole thing behind one named constant** at the top of game.js, following the `RELIC_VICTORY = false` precedent. A bad battery result becomes a one-line revert instead of surgery.

**⛔ CUT the steer/pathing half.** `PathFinder` has a uniform step cost and no dynamic cost grid; paths are cached and only recomputed when the goal moves >1.5 tiles; and `lineFree()` short-circuits A* entirely whenever the straight line is terrain-clear — which is exactly the charge-into-the-line case. Making paths flow around a line means a per-tick occupancy cost array plus touching the most load-bearing movement function in the file.

**Why toys:** Toys are solid objects on a hard floor. Two of them cannot occupy the same square inch, and children know it. It also retroactively gives the *existing* stance and formation systems teeth — 'box' becomes a wall, 'spread' acquires a real downside — which is insight #3 applied to combat.

**Effort:** S for the diff. **M–L for the battery**, which is the real cost.
**Risk:** No new state, no save change, no rng — so determinism is structurally safe, but this is the hottest per-tick sim path and it invalidates every stored replay (politely — the version stamp refuses). Two failure modes to measure, not eyeball: (a) the AI has no concept of blocking anywhere in `aiUpdate`, so armies will grind into lines instead of flanking — **watch draw rate**, since stalling was historically this game's worst quality problem; (b) `okShove` refuses shoves onto blocked/water/cliff tiles, so a line backed against water becomes an un-pushable hard wall. Assert no unit can be permanently pinned. Test canyon / bookshelf / attic specifically.

---

### 2.3 GO STILL — the toy's oldest trick
**Verified: REJECT as pitched (score 36); the de-scoped version scores ~65 and I recommend it.**

**What:** A fourth stance. A toy freezes exactly like a toy and stops being a target.

**Inspired by:** C&C stealth with purchased detectors; StarCraft burrow; AoE2's woodline ambush. But the detector here is a nightlight.

**Mechanics — de-scoped:**
- New stance, **hotkey V** (X is already Stop — main.js:2644, ui.js:452). Order cleared, `u.still = true`, `u.stillT = 0`.
- After a **1.2s settle**, the toy is unacquirable: skipped by `nearestEnemy` (3012), `pickTarget` (3025), `nearestEnemyOf` (4393), `fireBeam` (3057), `splash` (3076/3089), and the three pet scans (updateCat 1061, updateDog 1156, updateRoomba 1302). *All eight of these sites already have a `garrisoned` skip — the pattern is written, you are adding one condition to each.*
- Revealed by any enemy inside **its own `def.vision`**; broken by any order. A Pencil Tower reveals at 6.0 tiles — the tower finally has a job besides shooting.
- **⛔ CUT both damage multipliers** (the ×1.5 taken and the ×2.0 first strike). `applyDamage` has no damage-taken multiplier concept at all — only armour subtraction and attacker-side bonuses — so adding one is a new term threaded through every caller, and three stacked multipliers across 8 factions is exactly the change a 224-game battery has low power to evaluate. Ship the acquisition-blindness alone; add the ambush rider later as its own change with its own battery.
- **⛔ The topple and flashlight dependencies do not exist.** Neither is built; do not spec against them.
- **⚠️ Mandatory AI carve-out:** the AI's last-resort scan `nearestEnemyOf(owner, …, 999, () => true)` (game.js:4356) returns null if every remaining enemy is still, idling the assault. Buildings cannot go still and elimination is building-driven, so this cannot make a game unwinnable — but without the carve-out the AI stops attacking. Note also that the AI **never sets stances**: `.stance =` is written in exactly two places, the human command and the unit reset. There is no AI stance manager to extend, so any AI use of this is a new subsystem.
- Workers may go still — a second survival verb beside the town bell, and the honest answer when the chest garrison is full.

**Why toys:** This is not stealth borrowed from another RTS. It is the one rule the entire fiction runs on. It retroactively explains why THE KID never catches a war in progress, it folds the cat, dog and Roomba into the stealth loop for free, and the visual is a *pose*, not an asset — models.js already has idle poses, `deathPose`, and per-view idle glances.

**Effort:** M. Two snapshot fields, one stance button, eight one-line scan conditions, one AI carve-out.
**Risk:** Sim state — MP/replay affecting, save round-trip required, stateHash must include it. Design worry to watch in playtest: auto-reveal means the counterplay is "walk near it", which every attack-move army does for free — so against a moving army still is near-worthless and against a passive one it is a free ambush. That variance is the reason to ship it cheap and measure before investing further.

---

### 2.4 AIM THE CAT — the Squeaky Bait
**Verified: BUILD, score 62. CLAUDE.md's own Depth Audit names "pet luring" as one of only four verified-absent gaps** — unusually strong endorsement, since that audit exists specifically to kill proposals like this one.

**What:** A 35-snack prop that makes the house cat go and sit on your enemy's mining line.

**Inspired by:** AoE2 boar-luring; C&C's tactical use of neutral hazards. Except the neutral is a cat with a state machine.

**Mechanics — corrected:**
- Squeaky Bait: **35 snacks, 6s build, 40 hp** (it can be shot off), **one active per player, 90s cooldown**. The command card is auto-generated from BUILDINGS by age (ui.js:215), so the button appears for free — it just needs a `B_ICONS` entry.
- **Lure radius 12–15 tiles, not 30.** `MAP_N` is 72; a 30-tile lure is 42% of the board, so a midfield bait would own the room's only cat from almost anywhere.
- Lure duration **25s**, then a hard **40s pet-lure immunity** so a pet can never be permanently parked or oscillate between two baits.
- **⚠️ The cat cannot stand on it.** `addBuilding` marks every footprint tile blocked (game.js:1667), and `updateCat` rejects blocked tiles when picking a target (1136) and when stepping (1146). The lure must resolve to the nearest **free adjacent tile**.
- **Deterministic tie-break** when several players have baits out: nearest, then lowest entity id. A non-deterministic tie-break here is a silent MP desync vector.
- **⛔ Drop the Roomba-repel clause.** `updateRoomba` already reflects off any blocked tile (1290-1300), so every existing wall segment already repels it. That half is shipped.
- **The safety assertion that makes this shippable:** gate the entire lure branch so that a game with **zero baits placed produces a byte-identical fingerprint** to today's build.

**Why toys:** No other RTS gets to say "I aimed a cat at your economy." The cat swats *lone* toys within 2.1 tiles for 9 damage on a 6s cooldown — so parking her on a spread-out mining line is precision harassment against exactly the player who spread out. Baiting the yard dog off your own push is real counter-play. And it makes the pets' map assignment (cat indoors, dog outdoors, Roomba on flat floors) into strategic map knowledge.

**Effort:** M. One building def, a lure field on three pet update functions, snapshot + stateHash, one AI heuristic.
**Risk:** Pets are sim actors that consume rng every update — CLAUDE.md flags any pet change as MP/replay-affecting. Save version bump. Inert on bathtub (`cat: false`, no dog, no Roomba) and under `zeroEra` (pets are guarded) — hide the button or accept it. Invisible to every AI-vs-AI battery, so verify with a **scripted** soak (`script:[{t,pid,c}]`), not a matrix.

---

### 2.5 FOUR RESOURCES, FOUR VERBS — the economy's first friction
**Verified: PARTIAL_EXTEND, score 45 as pitched; ~72 for the cheap half. Build the cheap half only.**

**What:** Each resource behaves like the object it is, so where you put your baskets becomes a different puzzle per pile.

**Inspired by:** AoE2 per-source gather rates; RA2's same-price/opposite-risk miners; C&C harvester routing.

**Mechanics — all four verbs, zero new sim state:**

| Resource | Rate | Carry | The verb |
|---|---|---|---|
| **Snacks** | ×1.15 | 10 | **Crumbs go stale.** `u.carry -= 0.35 * dt` while `phase === 'return'`. A 12-tile haul at speed 1.5 ≈ 8s ≈ 2.8 lost ≈ 28% of the load. Crumbs demand a drop-off within ~6 tiles. |
| **Blocks** | ×1.0 | 14 | **Blocks are heavy.** `speedOf(u) × 0.72` while `carryType === 'blocks'`. Distance costs linearly, and you can *see* the slow ones. |
| **Buttons** | ×0.70 | 22 | **Long fill, long trip.** Amortises beautifully on far, safe nodes — and you lose 22 when a raider kills the hauler. |
| **Marbles** | ×1.25 | 10 | **Marbles roll away.** The node loses `take × 1.25` while the worker gains `take`. 25% waste, pure arithmetic, no new state, no rng. |

*(The marble verb above replaces the original 4-second all-or-nothing scoop and the 12% scatter-on-deposit. Both were cut: the scoop punishes a unit the player never watches with an invisible, unattributable loss; the scatter needs a whole new entity kind for a reward the AI is deliberately blind to, and it is the only part that bumps the save format and consumes rng.)*

**Three implementation traps:**
1. **Ordering bug:** `updateGather` computes `const cap = this.carryOf(u)` at game.js:3627 *before* `u.carryType` is assigned at 3682, and the phase flip at 3634 runs off that stale cap. A worker switching piles will bank at the wrong threshold unless this is restructured.
2. **The AI cannot answer staleness.** The economy manager (game.js:4036-4050) assigns workers purely by `AI.gatherRatio` gap with **zero model of haul distance**, and the forward-basket trigger only fires past 15 tiles. Snacks are the AI's largest share (0.55/0.45/0.40 by age) and snacks are exactly what decays. **Make the basket heuristic distance-aware in the same pass** or this ships as a straight AI economy nerf.
3. **Discoverability.** Four new invisible economic rules in a game whose players don't know Hold exists. Ship a TIPS entry ("your crumbs are going stale — build a basket") in the same commit. The TIPS system (main.js:2773) was built for exactly this.

**Why toys:** Nobody has to be taught that a cookie crumb goes stale, that a block is heavy, or that a marble rolls. **The fiction is the tutorial.** It also retroactively makes all 12 existing maps interesting — a map whose marble pouches sit far from the chest now plays completely differently — with zero new map work, and it gives the already-shipped Storage Basket a *per-pile* reason to exist rather than a flat distance rule.

**Effort:** M for the code (a profile table plus three call sites), **L for the battery** — this changes effective income per resource, so it needs the full mirrored 28-pair run on both pools plus a re-check of the START_RES tiers.
**Risk:** Speed and carry are sim state read by pathing and combat; `__ttNetTest` + snapshot round-trip mandatory. **And `u.carry` is not in `stateHash`** — a carry-side desync would stay invisible until it lands in `p.res`. Fold carry into stateHash before shipping any of this.

---

### 2.6 THE SPILL — fix the bug first, then decide about wrecks
**Verified: the `kill()` carry-erasure is a confirmed bug. The SPILL patch alone scores ~75; the full wreck system scores 62; the "pieces and mending bench" variant scores 26.**

**Step 1 — ship the bug fix on its own (~40 lines, this week).**

`kill()` (game.js:2860-2886) decrements pop, bumps `stats.lost`, starts the death view, spawns VFX/SFX — and **never touches `e.carry` / `e.carryType`.** A hauler carrying a full load of blocks evaporates it. Contrast game.js:1348, where the Lost Toy carrier-death path explicitly drops the stray in place. That asymmetry is unnoticed and wrong.

- On death with `carry > 0.5`, drop a **SPILL** pickup carrying the exact load and type. Decays after 60s. Auto-picked up by any worker within 1.4 tiles via the existing `u.carryLost` path, banked at that worker's own chest.
- **Zero rng draws.** Do not copy `scanT: this.rng()` from `addLostToy` (game.js:1321) or you shift the rng cursor on every death. A rng-free implementation makes the fingerprint diff trivially readable and drops the MP risk from "dangerous" to "routine".
- New snapshot code + restore branch + carrier relink, mirroring game.js:2324/2443/2531.
- Note the slot conflict: a worker holds one `carryLost` at a time (the check at 1337 rejects `carryLost != null`), so spills and strays compete. Decide precedence explicitly.

**Why this one is safe when the bigger versions aren't:** it *returns value that already existed* rather than minting new resources, so it carries no snowball risk. And worker harassment happens near bases, where both sides' workers actually are — so the pickup genuinely contests. It also fixes a real feedback gap: killing a loaded worker currently produces no legible reward, so raiding reads as pointless.

**Step 2 — evaluate wrecks separately, later.** A 30%-of-cost drop on every unit death mints resources proportional to combat volume and pays the side that won the fight — the classic comeback-killer, on a game already carrying a 67–77% first-seat advantage. It also needs an AI worker-dispatch manager, because Lost Toys are AI-blind **on purpose** (0/16 seats ever carried one home; CLAUDE.md: *don't 'fix' it*), so a battlefield-recovery system copied from that pattern is a one-way rebate to the human. If it ever ships, consider paying the **loser** a share — "your toys come back to you" fits the fiction better *and* is anti-snowball.

**Effort:** S for Step 1. **Risk:** Low, with the rng discipline above.

---

### 2.7 FACTION IDENTITY — verbs and a deletion
**From the gap map Tier-S #4. Three phases, cheapest first.**

The measured problem: all 8 factions land in a +12…−17 band, all 8 faction buildings are military, and all 8 signature techs (liveammo/interlock/grouphug/nitro/chivalry/roundup/windrunner/overclock) are combat effects. There is **zero economic differentiation** beyond flat percentages.

**Phase 1 — name the mods (free, UI-only).** `mods` are never named, iconed or shown. AoM Retold's "God Blessing" trick: same code, ten times the perceived identity. Give each faction's mod block a name, an icon and one flavour line on the faction card and the civ picker. **Effort: S. Risk: none.**

**Phase 2 — per-faction wish tables (free once 2.1 lands).** Eight offer tables over the same 8–12 authored wishes is the highest-leverage asymmetry available, and it costs data. What a faction *cannot* reach becomes free flavour.

**Phase 3 — one real economy verb and one real subtraction (needs a battery).**
- **Racers:** a hauler that never stops to deposit (the RA2 Chrono Miner shape) — same resources/minute, unraidable.
- **Bricks:** a hauler that carries triple and crawls — same resources/minute, a fat target. *Same price, opposite risk.* This is the cheapest faction asymmetry in the entire canon and it is unbuilt.
- **One faction that cannot build walls.** Identity by subtraction (Mongols, Abbasid, Kane's Wrath). That one deletion will be the most-discussed thing you ship.

⚠️ Note that faction uniqueness in this engine is done with **separate unit keys** gated by `def.faction`, not by parameterising one def — `mods` are player-level multipliers applied at spawn/attack time. Two hauler variants = two UNITS entries, not one def with a variant table.

**Effort:** S / S / L. **Risk:** Phase 3 is a full mirrored two-pool battery and it will move the faction table.

---

## IV. TIER 3 — LATER / NEEDS BUDGET

Real gaps, correctly deprioritised. One line each on what and why-not-yet.

- **Make `def.pop` real** — `p.popUsed++` is unconditional (game.js:1733), so a Galleon and a Worker cost the same slot. One-ish line plus a rebalance of every unit in the game. It's marked "cosmetic" in the invariants; that's a design *choice* quietly costing you the pop cap as a readability budget (Halo Wars' core insight). MP/replay-affecting.
- **A retreat verb** — CoH's biggest anti-misery feature, grep-confirmed absent. Selected units run home at bonus speed, arrive shaken, auto-retaliation suppressed en route. For a free browser RTS whose audience will lose a lot, "the losing player has a verb" is worth more than any new unit. *(Note: do not sell this as "the audit says retreat is missing" — the audit's absent list is active abilities, destructible obstacles, weather-in-sim and pet luring. Stances with a defensive anchor leash already exist.)*
- **DAWN — the 12-minute scored mode** (verified BUILD, score 57). Sixth mode, hard-capped at 12:00, room measurably brightens (reverse `updateNight` + ramped `post` lift), victory at dawn by Floor Score = buildings ×3 + tiles within 6 of your buildings ×0.02 + army value ÷50, shown live for both sides. **Blocked on two things:** the AI has no territory manager and would play Conquest into a loss, and a scored terminus would amplify the seat-0 advantage into something structural. ⚠️ `endGame(0, 'dawn')` and the ui.js cause string are already taken by survival — use a distinct cause. The pretty half (lighting) is free and is in Tier 1.
- **KNOCKED OVER, the sim version** (score 45). Toys fall down and take 1.4s to get up. Ship only after the free stumble proves the fantasy, and restrict toppling to **megas and siege** — the pitch's claim that trample/slam/ram already compute knockback is false in four of eight cases (`trample` game.js:3083 and `slamHit` 3069 are pure damage loops; `impact: 0.5` is a swing-timing fraction). Watch chain-CC and the fact that a downed unit cannot flee, which would turn raids into worker massacres.
- **THE SPRINGS — power source as faction verb** (score 45, de-scoped). Ship **wind-up + stuffing only**: a per-unit `wind` float draining 1.0/s in combat and 0.35/s moving, recovering 8/s near any friendly production building, with plush immune (priced at −8% speed / −5% damage). Skip the Charging Mat, the hand-wind command and the Bricks damage variant. Requires an AI "go home when low" rule or it is a silent nerf to bots and racers, the two factions already at −7 and −17.
- **Weapon line-of-sight + fog-gated target acquisition** — `lineFree()` has 3 call sites, all inside `steer()`, so archers, towers and trebuchets shoot through walls and cliffs; `pickTarget` never checks fog, so units auto-engage what they can't see. The first quietly undermines the walls system the knights are built around. Also fix `forgottenking`'s aggro 10 > vision 9.
- **Art-of-War challenge scenarios** — 5 scenarios × 4 minutes, bronze/silver/gold (reach Age 2 by 5:00; hold a chokepoint; counter a composition; win with 20 workers), plus per-faction mastery checklists. The research is unanimous that this, not a tutorial, is what teaches an RTS — and the campaign config format, objectives chip, TIPS system and `check(ctx)` achievement engine are all already built. This is the cheapest *content* in the document; it sits in Tier 3 only because Tier 1 and 2 change the game more.
- **THE UNBOXING** (score 45) — megas arrive in a 2×2 cardboard crate at 40% of the titan's hp with a 14s public timer; smash it for a 50% refund to the owner and 60 buttons to the attacker. Beautiful fiction, low frequency (megas are a rare age-3 event), and it lands on the two systems that produce silent stalemates: the crate must be excluded from `playerAlive` (game.js:4451, "a worker + ANY standing building"), from the objectives count, from `recalcPop`, and from `reageBuildings`. Ship the alert, **not** a global ping — a global ping contradicts the shipped `seenByMyTeam` fog-integrity work. ⛔ Drop the "siege finally has a job" and "+5 din" justifications; both are false.
- **THE BEDTIME STORY** (score 38) — build it as a **Replay Shelf extension**, not a new system: append `story: game.matchStory(win)` and a cropped sepia plate to the record already being built at main.js:2140-2151, then re-skin `openShelf()` with the bookend parchment CSS. One storage key instead of two, no duplicated replay logs, menu button already wired. Cap plates at 128px JPEG q0.7 (~6KB) — 30 × 40KB PNGs on top of the replay shelf, journal, wear canvases and Empire saves will blow the localStorage quota, and **every write site is wrapped in a silent `catch {}`**, so a blowout fails invisibly and starts eating replays.
- **NIGHTLY DARES** (score 28, trimmed) — a date-seeded map/faction/mode/seed pin using the seed machinery that already exists (main.js:2037-2040), scored off `p.stats`, with exactly three clean data-mutation mutators: GROWTH SPURT, INFESTATION, LIGHTS OUT. ⛔ Cut THE FLOOR IS LAVA (ridge cores are impassable — no toy can stand there), LIGHT SLEEPER (depends on an unbuilt Noise meter) and the extra cats/Roombas (spawn counts are hardcoded singletons and extra pets consume rng). ⚠️ Apply mutations inside `startGame` beside the `zeroEra` line (main.js:2075) or the codex renders mutated numbers; and the replay record has no mutator field while the version stamp hashes *source text*, so a dare bottle would pass the gate and silently desync.
- **COMMANDERS WHO REMEMBER YOU — Part A only** (score 62 blended; Part A alone ~78) — `tt-rivals` bookkeeping, four vendetta lines per commander drawn as a fourth tier on the existing persona×faction TAUNTS table, a cracked portrait frame, a Nemesis achievement. ⚠️ **game.js has zero localStorage references and that boundary is architectural.** Route any AI aggression nudge through `playerDefs` (exactly as per-seat difficulty already is, game.js:347) and hard-zero it in MP and replay, or you get a per-machine AI and instant divergence. Disclose the grudge on the card. **Part B (8 signature rule-breaks) is under-costed by roughly 10× and needs its own 280-game battery — split it out.**
- **Polish batch** — hotkey rebinding (AoE2 shipped it in 1999; the command card has 10 letters for ~19 build buttons); accessibility floor (one `aria-hidden` in the whole page — aria-live on the alert feed, focusable canvas, a responsive HUD breakpoint); `anchor` missing from `restore()`; the ungated `#gm-speed` handler in MP (main.js:443-446 — keyboard +/- is guarded by `if (!net)`, the slider isn't); the missing `story` ALERT_ICON; the dropped 4th `alert()` arg.
- **Conversion counter-tech for the Hypno-Top** — 5s channel, full ownership transfer preserving kills and rank, **no counter-tech, no resistance, no mega exemption.** That is precisely AoE1's Priest mistake. Ship the counter in the same patch as any Hypno change.
- **Siege ally friendly fire as design, not defect** — splash skips only same-owner (game.js:2992), missing the `isEnemy()` test that slam/beam/trample all have. In 2v2 you shell your ally, and no unit refuses the shot. Fix it, or make refusing the shot a designed tension.
- **MP completeness** — played RTS battles in Empire MP (`mpDrain` auto-simulates every encounter), human↔human pact consent UI, chat/ping wheel, latency readout, reconnect. All correctly behind the seat-0 fix.

---

## V. ALREADY BUILT — DO NOT REBUILD

Verification found each of these fully implemented and wired. A prior session burned itself pitching three of them. **Check this list before writing a proposal.**

**Combat & tactics.** Stances (`agg`/`def`/`stand`, with a defensive anchor leash, stand-ground scan clamp, snapshotted, in stateHash, three tooltipped buttons at ui.js:457). Formations (box/line/spread, rotated to travel direction, laterally sorted, cliff-collapse). Garrison (chest 10 / tower 4 / fort 8, occupants untargetable and skipped by *nine* separate acquisition scans, +35% weapon damage each capped at 6). Town Bell with job memory and resume. Attack-move, patrol, guard, attack-ground — all four, on the card and on F/Z/G. Health bars, `DamageNumberPool`, hit-kick and squash. Minimum range with auto-backaway on 6 lobbers. Elevation combat (±25% at a 0.4 threshold). Veterancy at 3/6/10 kills with `applyUnitTier` whole-body retroactive recast. Multi-goal A* over the nearest free ring with a relaxed admissible heuristic — **the strongest subsystem in the codebase.** The AI already counter-picks.

**Economy.** Finite depleting nodes. Age-up occupying the economy building (the boom/rush fork — already the best economic decision in the game). Idle-worker count, gold pulse and `.` cycling. **Idle hands** — a worker with no order for 5s self-assigns to the nearest gather source within 34 tiles, preferring its carryType. The **Storage Basket** forward drop-off, which the AI already builds unprompted whenever a worked node is >15 tiles from a drop-off (game.js:4108). The **Delivery Cart** — a wheeled, ambushable trade unit whose own codex entry jokes about being robbed (the AI is hard-coded never to train one, game.js:4231, which is why nobody has seen it). A living mean-reverting market (sell ×0.97, buy ×1.04, clamped 0.4–2.2). The **Snack Mat farm** — the worker-parked-on-a-building labour sink. A "ran out of resources to gather" alert with a minimap ping (game.js:3659). Neutral map income: sticker trickle 0.4/s, critter bounties, Lost Toy +80, Wild Tribe +3 units +60. Building repair.

**Presentation.** The full cinematic beat table. 32 voiced narrator lines in one Alistair preset, gated by NARRATOR_VO so nothing 404s. 71 bark sets with 3D speech bubbles. Positional audio with panning and distance attenuation. 13 ambience beds, all tracked and stopped on switch. Contact shadows, rim light, tilt-shift post, per-map MAP_GRADES. Toy-blood, directional spatter, per-material death styles, stains, permanent battle-scar wear that **ghosts back next session**. THE KID's complete five-phase sequence — hand, shadow, footsteps, shakes, bookending alerts, `__ttKid` debug handle. Wonder countdown with escalating alerts and a vision-gated ping. KotH live hold with "contested".

**Meta.** 28 campaign missions with plates, 95 scripted beats, living briefings, act bookends, veterans carrying between missions, the Expedition Journal, NG+ with a full parallel voiced script. 31 achievements with a predicate engine. Byte-identical replays with a 10-slot shelf and `TT1.` share codes. Survival with its own Long-Night game-over card. Co-op vs AI. Star-topology lockstep MP for 4 humans with graceful drops. A full turn-based Empire campaign (17 shipped rounds) including readiness, doctrines, cards, diplomacy and PeerJS MP. Tutorial and five contextual TIPS. `__ttSoak` / `__ttNetTest` / `__ttEmpireNet` — a genuinely best-in-class verification harness.

**Also confirmed shipped, and frequently mis-pitched:** every building already repels the Roomba (it reflects off any blocked tile). Siege already carries `bonus:{building: 8–18}`. The market is already a resource sink. `blocked` is already mutated live at runtime and already round-trips through the snapshot.

### Traps and false premises found during verification — do not build against these

| Claim seen in proposals | Reality |
|---|---|
| "the existing ageing pause" | Does not exist. `startAgeUp` sets `p.aging` and never blocks. A pause cannot exist under lockstep. |
| "`busiest()` already computes the densest cluster" | Not in the codebase. Docs-only, from a trailer capture script, and documented there as a **failed** approach (2.98-tile jumps between frames). |
| "trample / slam / the ram already compute knockback" | False. Both are pure `applyDamage` loops; `impact: 0.5` is a swing-timing fraction. |
| "the techs `pockets` and `sorting` are free names" | Both exist (carry +4, snacks +20%) **and are the AI's top two research priorities** (game.js:4136). |
| "age-4 techs" / "the Stash Tin" | There are three ages (`AGE_UPS` has keys 1 and 2). There is no Stash Tin. |
| "the depth audit says retreat is missing" | It doesn't. Its absent list is: active abilities, destructible obstacles, weather-in-sim, pet luring. |
| "fire it through `cb.cinematic`" as a sim input | `cb.cinematic` is **per-client visibility-gated** and undefined in the soak stub. Feeding it into any sim scalar desyncs MP. |
| `endGame(0, 'dawn')` for a new dawn mode | Already taken by survival, with its own epilogue string in ui.js:108. |
| Hotkey X for a new stance | X is Stop. V is free. |
| "`__ttNetTest` will catch it" | Only if you extend `stateHash`. It folds no carry, no timers, no status effects. |
| "obstacles can be destroyed / counted" | `addObstacle` sets blocked tiles and discards the mesh. No entity, no id, no hp, no save record. |

---

## VI. WHAT WOULD MAKE THIS GAME SPECIAL

Every RTS has an economy, a counter web and a superweapon timer. These are the things that could only exist in a game about toys coming alive at night. This is the edge — and the good news is that the two strongest ones are already in the roadmap above.

**Toys go still when someone looks.** No other game gets to ship a stealth button that is *the fiction itself*. It costs a pose, not an asset. It retroactively explains why THE KID never catches a war in progress. It makes a Pencil Tower a nightlight. And it means the counter to stealth is not a detector unit you purchase — it is a toy walking close enough to see. (Tier 2.3.)

**Toys don't die, they break — and someone picks them back up.** The emotional contract of the entire game is that toys get put back in the box, and the sim currently contradicts it four hundred times a match. A wreck you can stand back up, a name that survives on a memorial, a fallen toy returned by a wish — these are the same idea expressed three ways, and together they make a loss *feel like a night in a bedroom* rather than a resource deletion. (Tier 1.4, 2.1, 2.6.)

**The room is the referee.** A sleeping child is the only escalation clock in games that everyone already understands. The full noise-meter version was correctly rejected — it is deep sim surgery, it punishes the aggressor in a game with an unresolved positional bias, and it confiscates the player's most expensive toy, which inverts every other "SP fantasy" decision this project has deliberately made. But the *shape* is right, and the cheap version delivers most of it: THE KID's shadow falls on the biggest knot of toys, you get six seconds, and the hand **misses**. Garrison suddenly reads as "under the lid" — a system the game has and nobody uses, taught by the room instead of a tooltip. (Tier 1.7.)

**The floor is already covered in weapons.** Jacks, dominos, marbles, crayons and bottlecaps are lying on every map right now, worth 80 buttons to a worker. A child does not need to be told what a jack under a giant's foot does, or what happens to a rank of soldiers when a domino goes over. It is an active-ability system made entirely of objects the player already has intuitions about — and the carry, ride-along, drop-on-death and save round-trip are *already written and verified*. The full five-verb version needs a status-effect layer the engine has never had, so ship **one** verb as a spike (the marble roll, or the domino line without the daze — instantaneous line damage, no zones, no timers, no new snapshot key) and find out whether the midfield contest is actually fun before building the rest.

**Titans arrive in a cardboard box.** AoM's Titan Gate is a long, public, half-finished, contestable object. Age of Toys can have exactly that, made of an object the fiction already contains, and it is the game's best come-from-behind moment: the losing player sees the box land and gets fourteen seconds to change the night.

**Everything in the room is held together with tape.** Rejected as an economy (a mandatory chore building gating the game's best moment), but keep the *image*: it is the right visual language for the whole art direction, and it is the honest answer if megas ever need an ongoing cost rather than a one-off price.

**The room must look untouched by morning.** The single best line anyone wrote in this entire process. The full Tidy Meter was correctly rejected — its triggers half don't exist, its "no new actor code" claim is false, and it punishes the losing player with a gather penalty *and* sends the cat after them. But the sentence deserves to exist somewhere cheap: a sweep order that clears a scorch decal for a small button bounty, or one line on the game-over card about whether the room survived the night. The battle-scar wear canvas is already painted and already ghosts across sessions — **that shipped feature is the proof this thesis works.** The room already remembers you. Give the player one way to answer it.

**Dawn is a real deadline.** Every timed mode in every other RTS has to invent a reason for its clock. This one has had a reason since the first line of design: the toys must be back before morning. And the renderer has already been telling the player time is running out — the room measurably dims over twenty sim-minutes — while the economy says take as long as you like. Running the night backwards is the cheapest spectacle in the document and the most honest clock in the genre.

---

## VII. THE ONE-PARAGRAPH VERSION

Age of Toys has a complete AoE-family economy, a deep flat-bonus counter web, a 28-mission campaign, verified 4-human lockstep MP, and a presentation layer beyond most commercial indie RTS — and almost none of it is **visible, forked, or clocked.** The three cheapest high-value moves are all data-and-UI: **show the counters** (Tier 1.1), **fork the age-up** (Tier 2.1), and **make the room playable** (Tier 2.4 + 1.7). The fourth is the one the balance data has been asking for since July: **factions need verbs and a deletion, not multipliers.** And before any of it produces trustworthy numbers, spend one session on the seat-0 bug — 77/67/67% across three batteries is not a balance reading, it is a defect, and it is currently taxing every measurement the project makes.