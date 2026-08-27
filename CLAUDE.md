# The Keeper's Bible — Kyle's Workspace & Age of Toys

Written by Claude Fable 5 at the end of its run (2026-07-11), so no future session
re-derives what was learned the hard way. Trust this file; verify only when the
code visibly disagrees.

## Workspace map (this folder holds MULTIPLE projects)

| Project | Where | Notes |
|---|---|---|
| **Age of Toys** (flagship RTS) | repo root: `toybox-tactics.html` + `toybox/` + `assets/` | This file's main subject. Deploys via `push-web.ps1` → `../toybox-deploy` → GitHub Pages |
| **Age of Toys — Godot port** (Steam path) | `age-of-toys-godot/` | Godot 4.7 faithful port, **M1–M21 done (2026-07-26)** — sim, 6 factions, 11 maps, 4 modes, 23-mission campaign, survival, save/replays, **lockstep MP over real ENet**, naval, terrain, HUD parity, meta screens, art pass, options/pause/export presets, UI parity, pets, real elevation, corner spawns, battle scars/night/living bases, and the spectacle layer (cinematic beats, THE KID, seasons, toy-blood). ⚠️ this row said "M1–M3" until 2026-07-20 and "M1–M17" until 2026-07-26 — TRUST THE PORT'S OWN `README.md`, it is the milestone authority. **`PORT_BIBLE.md`** (written 2026-07-20) = the DELTA spec: what the web gained after M17 (Empire Mode entirely, the cat/dog/Roomba, THE KID, battle scars, deepening night, positional audio, seasons, corner spawns, survival card) + all invariants/traps/voice. Hand both docs to a port session. data exported from data.js → `data/game_data.json` (never hand-edit); GLBs are DECOMPRESSED copies (no Draco). Headless tests in `tests/` |
| Chameleon (hide & seek) | `chameleon*.html` + `assets/audio/` root files | Its audio lives in `assets/audio/` root — do NOT deploy those with Age of Toys |
| Choose Wisely / Nine Circles / Still Breathing / SOUTH | own subfolders, own git repos | Branching storybook games; THE SHELF hub at `games-hub/` links the four |
| **QUARRY** (alien hunting sim) | `quarry/` | First-person Predator-flavoured hunting sim, Three.js. **M1 complete + verified 2026-08-11.** `QUARRY_BIBLE.md` is the authority — read its handoff note, §13 (code + the seven view bugs + how to photograph a page the pane can't composite) and §14 (invariants). Strict sim/view split: `sim.js` is deterministic, NO `Math.random`, `node test-sim.mjs` = 70 tests, run after EVERY sim change. Serve with `node serve.mjs 8455`. Next is M2 (the Reckoning); don't add species/worlds first. ⚠️ scoring numbers are SOLVER OUTPUT — edit `tools/solve-scoring.py`, never hand-tune |
| Grocery Price Scout | `grocery-price-scout*` | Has its own CLAUDE.md |

Global rules: portable Node at `C:\Users\kylef\tools\node` (not on PATH — prefix it);
gh CLI at `~/tools/gh/bin/gh.exe` authed as kylefriesmarketing; NEVER read GLB/mp3/mp4
binaries (Kyle watches token spend — use metadata, `gltf-transform inspect`, or targeted
scripts); Kyle prefers DOM checks over screenshots.

---

# AGE OF TOYS — the deep dive

A storybook AoE-style RTS. Live: https://kylefriesmarketing.github.io/toybox-tactics/
(repo `kylefriesmarketing/toybox-tactics`, fed from `../toybox-deploy` by `push-web.ps1`).
**Standing directive: after any change, verify, then push live via `push-web.ps1`.**

## Architecture (one page)

- `toybox-tactics.html` — ALL CSS in one `<style>` block, all overlay DOM. Theme via
  `:root` vars ("Bedtime Amber"). Wood frame = border-image `assets/ui/panel-frame.png` slice 130.
- `toybox/main.js` — boot (asset loading + lore cards), menu/lobby/campaign/codex/intro-cutscene/
  watch-mode UI logic, `startGame()`, input, camera (`cam`, `clampCam()`), the render loop
  (sub-stepped setInterval keeps sim alive in hidden tabs — this is why headless testing works).
- `toybox/game.js` — the ENTIRE deterministic sim: `Game` class, pathfinding, combat, economy,
  AI (`aiUpdate`, 1s ticks), narrator, mission events, snapshot/restore, `matchStory()`.
- `toybox/data.js` — ALL tuning/content: UNITS, BUILDINGS, TECHS, FACTIONS (+commanders),
  MAPS, CAMPAIGN (16 missions), MISSION_EVENTS, EPILOGUES, TAUNTS, AI_LINES, NARRATOR, INTRO,
  MODEL_MANIFEST. Balance changes go HERE and only here.
- `toybox/models.js` — GLB loading (`makeGLTFLoader()` = shared DRACOLoader), registries
  (unit/building/map/furniture), procedural fallbacks, `createGround` + per-theme surrounds,
  `PORTRAITS` (runtime icon renders), `applyUnitTier` (whole-body recast).
- `toybox/ui.js` — HUD, command card (stable DOM — NEVER rebuild buttons on the ticker or
  clicks get eaten), alerts, barks, game-over card.
- `toybox/lore.js` (codex text, lazy-loaded), `toybox/chronicle.js` (achievements + lifetime
  stats), `toybox/barks.js` (unit voice lines), `vfx.js`, `sfx.js`, `net.js` (PeerJS lockstep,
  STAR topology — up to 4 humans; see the Multiplayer section).

## The iron invariants

1. **Determinism**: everything inside `Game` uses `this.rng` (seeded LCG) — NEVER `Math.random`
   in sim code. UI-only features (alerts, barks, matchStory, camera) may use `Math.random`.
   MP is lockstep command-passing: both clients simulate; only inputs travel. Any sim change
   must be identical given the same seed + commands.
2. **`startGame` has `if (game) return`** — there are NO same-page restarts. "Play Again" and
   campaign flow do `location.reload()`. Consequence for testing: `window.__ttStart(diff,map)`
   works ONCE per page load; later calls silently no-op and you'll read the stale `window.game`.
   `window.__ttSoak(opts, maxTicks)` is ALWAYS safe (creates an independent headless Game,
   returns `{winnerTeam, ticks, ages, armies, res, err}`) — use it for batteries and soaks.
3. **Sim vs view**: unit gait/animation, fog draping, VFX are view-only and never run headless.
   `def.pop` is cosmetic (spawnUnit does popUsed++ regardless).
4. **Save format** (`snapshot()`/`restore()`, v2): opts/time/rng-state/grids/players/entities
   (orders encoded by id) + `told` (narrator one-shots) + `evDone` (mission-event flags).
   On campaign resume, set `g.missionEvents` BEFORE `restore()` or event states are lost.
   New persistent state you add MUST round-trip: write a save→JSON→restore→compare test.
5. **Elimination rule**: a player survives with a production building OR (worker + any building).
   Objectives say "raze every building" on purpose; a `foothold` narrator beat fires when a
   rival has buildings but no production.

## Content systems (how to extend)

- **New unit**: def in UNITS (copy a similar one; `naval`, `gait`, `faction`, `gatherNaval`
  are the special flags) + MODEL_MANIFEST entry + GLB at `assets/units/<key>/model.glb`
  (procedural `proc:` fallback otherwise) + add to a building's `trains`. Age-gating and
  faction-filtering in the UI are automatic. Barks: add `<key>` (or `<key>@<faction>`) to barks.js.
- **New faction** (knights, 2026-07-12, is the worked example — SIX factions now): FACTIONS
  entry (label/icon/desc/mods/commander) auto-populates civ pickers, codex, crest
  (`assets/ui/crest-<f>.png`, onerror-hidden) AND auto-loads `house-<f>.glb`/`chest-<f>.glb`
  from assets/buildings (main.js derives the list from FACTIONS keys). Then: unique units
  (faction: flag), unique building (trains + its civ tech; tech needs a `case` in game.js
  applyTech AND a spot in the AI research list ~line 3244), `worker-<f>` MODEL_MANIFEST entry,
  factionHouse/factionWall procedural branches in models.js, EPILOGUES/TAUNTS(×3 personas)/
  AI_LINES(×4 events)/barks/lore entries, portrait `assets/ui/cmdr-<f>.jpg` 440×440.
  Knights roster: knight/crossbow/charger(age2 @roost), paladin(fort)/trebuchet(workshop)/
  dragon(mega @roost)/wargalley(dock); roost + tower-knights GLBs are REAL now (baked on the
  07-12 top-up). Knights walls = stone blocks + merlons (factionWall branch, rises per age);
  knights gate = a real lifting PORTCULLIS (buildingGeometry gate branch — the grille Group IS
  userData.gateBar, same 0.45→1.5 lerp contract; the only faction-unique gate in the game).
- **New mission**: append to CAMPAIGN (id/map/faction/enemy/gameMode/difficulty/startRes/
  brief/objective/victory/defeat, optional `bonus`, `enemyBoost`, `endingArt`, `secret`);
  plate = `assets/campaign/<id>.jpg` (auto-hidden if missing); moments in MISSION_EVENTS
  (`at` sim-seconds; types: bare text, `spawn`, `boost`). The secret `midnight` mission is
  hidden until all 15 non-secret missions are done.
- **Codex**: lore.js entries keyed by unit/building/map/faction key; missing keys degrade to desc.
- **Achievements**: add to ACHIEVEMENTS in chronicle.js — `check(ctx)` gets
  `{g, win, me, chron, earnedCount}`; new sim stats belong in the players' `stats` object
  (init at Game constructor) and increment at the event site.

## The asset pipeline that works (Higgsfield MCP)

⚠️ BILLING DRIFT (2026-07-12): `image_to_3d` now bills a FLAT 30cr per model (the ~5-7cr
   seen on 07-11 was the anomaly), while `nano_banana` images currently bill 0cr. Check
   `transactions` after the first job of a batch — prices move between sessions. A "full
   faction" is ~10-12 bakes = 300-360cr, not 140.

1. `generate_image` model `nano_banana_pro`, plain-white-bg "molded plastic toy, 3/4 view,
   product render for 3D scanning" prompt (~2cr). NEVER ask for transparency (you get painted
   checkerboard); use `remove_background` for real alpha.
2. Vet via the `_min.webp` thumbnail (one Read), or montage several with System.Drawing.
3. `generate_3d` model `image_to_3d`, `should_texture:true`, medias `[{value:<image job_id>,
   role:'image'}]`. Preflight said 30cr but Ultra billed ~5-7cr — preflights are unreliable;
   **audio (`seed_audio`) bills by DURATION. ⚠️ the rate MOVED: the 07-11 note said ~1cr/s
   (~150cr for 14 lines); **measured 2026-07-27 it is ~0.08cr/s** — an 8.9s narrator line
   billed 0.7cr, so all 16 narrator beats ≈ 10cr, not 135. A whole VO pass is now pocket
   change. The lesson isn't the number, it's that the number MOVES ~10x between sessions:
   generate ONE item, read `transactions`, then size the batch.
   Hard-confirm any spend estimated over ~25cr.**
4. `job_display(id)` → `results.rawUrl` GLB. Download, then run
   `scratchpad gltf-tools/fix-all.mjs`-style processing: **strip normalTexture** (AI normal
   maps render as dents on flat plastic), keep 2048 color (webp q92) for flat-colored models,
   then draco. Codec package is `draco3dgltf`, NOT `draco3d`. AI meshes only simplify ~17%
   (disconnected shells) — don't chase decimation.
5. If image_to_3d returns `nsfw` twice on a toy, the image reads as a "person" — reprompt as
   a device/contraption, don't retry.

## Testing & verification recipes

- Soak: `await window.__ttSoak({factions:['a','b'],diff:'hard',map,seed}, ticks)` — err must
  be null. Battery = loop soaks in-page storing to a window var, poll with short evals
  (yield 40ms between games so polls land). Soak also takes `playerDefs` (any seat mix),
  `script: [{t, pid, c}]` (commands executed at tick t via `g.execCommand` — exactly what
  net.js does, so this IS the co-op/MP determinism harness; human seats stay human) and
  returns `fp` (end-state entity sum + rng cursor: same seed+script ⇒ byte-identical fp).
  Trick: `c.ids` can be a blind 1..90 range — execCommand owner-filters, so it deterministically
  hits only pid's units.
- Live checks: one map per page reload (see invariant 2). `window.game`, `window.__ui`,
  `window.__ttGL()` (renderer/scene/camera), `window.__ttSfx()` (ambKind checks) are the handles.
  ⚠️ Calling `__ttStart` mid-boot removes #menu before boot's tail touches it — boot line ~216
  is null-guarded for this; keep it that way.
- Screenshots: `preview_screenshot` TIMES OUT on this WebGL page. Instead render offscreen:
  `new THREE.WebGLRenderer({preserveDrawingBuffer:true})` → render `game.scene` with your own
  camera → `toDataURL` → POST to a local HttpListener (scratchpad `shot-receiver3.ps1`, port
  8399) — CDP downloads are silently blocked; don't pipe base64 through tool results.
  Hide fog first: `game.fog.plane.visible = false` (restore after).
- PowerShell traps: `Out-File -Encoding utf8` writes a BOM (strip before JSON.parse in node);
  Remove-Item is sandbox-blocked on some paths (use Move-Item); no `&&` in PS 5.1.

## Ammunition that looks like ammunition (2026-07-28, free — view-only)

Every shot in the game used to be the SAME glowing sphere — arrows, bullets and
catapult stones were visually identical. `makeProjectileMesh(kind,color,size,glow)`
in models.js now builds real ammo along **+Z** (the toybox forward axis): `arrow`
(shaft + steel head + 2 fletches), `bolt` (short/thick), `bullet` (stretched
tracer capsule), `stone` (irregular tumbling icosahedron), `band`, sphere fallback.
- Kind is inferred in `spawnProjectile` unless a def sets `projectile.shape`:
  band → band; **splash + arc → stone (lobbed), splash + FLAT → bullet (rocket)**
  — getting that pair backwards made the bazooka fire boulders; pierce + arc →
  arrow, pierce + flat → bolt; else bullet.
- `pr.oriented` (arrow/bolt/bullet/band) makes `updateProjectiles` point the mesh
  down its own flight path: yaw from the ground vector, pitch from the **analytic
  slope** of the arc term (`dy = (toY-fromY) + arc*4*(1-2f)`), so an arrow noses
  over as it falls. Spinning rocks skip this and tumble on two axes instead.
- All view-only (mesh + rotation); positions were already sim-side. Determinism
  and MP re-verified.

## 🎬 THE TRAILER (2026-07-28) — shareable page + the no-ffmpeg video pipeline

**Share link: https://kylefriesmarketing.github.io/toybox-tactics/trailer/** — a
storybook page with the 47s gameplay trailer embedded (canvas player, Alistair
narration, end-card CTA into the game). Lives at `../toybox-deploy/trailer/`
(~40MB: 6 shard .bins + audio.wav + cards). ⚠️ NOT in push-web's robocopy list —
edit it in the deploy repo directly, like README.md. The 157MB master AVI is a
GitHub Release (`trailer-v1`) — for Steam/YouTube, run it through any editor for
a full-720p MP4.

⚠️⚠️ **"THE TRAILER IS BLURRY" — it is the TILT-SHIFT, not the encode.** Kyle
reported blur twice; the first fix (re-encode 640×360 → native 960×540) barely
helped because the real cause was baked into the frames: the capture ran through
the miniature-look post pass, whose defocus blurs everything outside a narrow
band. Stunning in play, reads as out-of-focus VIDEO. **Before any capture meant
for video, flatten the pass**: `post.p.blurMax = 0.16; bandHalf = 0.34;
bandSoft = 0.5; vignette = 0.20` (keep bloom + grade). Capture at 1280×720 and
downsample to 960×540 — supersampling beats encoding at target size. Diagnose by
READING a master frame, not by re-encoding on a hunch.

⚠️⚠️ **"CLUNKY / NOT CRYSTAL CLEAR" — the flipbook player was the problem, and
`ffmpeg IS INSTALLED NOW` at `C:\Users\kylef\tools\ffmpeg\ffmpeg.exe` (+ffprobe,
gyan.dev 8.1.2, downloaded 2026-07-28 with Kyle's OK).** The old page decoded a
JPEG **per frame in JS** — software video decode, hence the jank — and per-frame
JPEG has NO interframe compression, hence 71MB for a soft 960×540. One ffmpeg
call gives **1280×720 H.264 in 33MB**: double the resolution at half the size,
hardware-decoded by a plain `<video>` tag. **Always prefer a real MP4.** The
canvas/shard player is dead — do not rebuild it.
```
ffmpeg -framerate 30 -c:v mjpeg -i "frames/f%05d.png" -i narration.wav \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 128k -ac 2 -shortest out.mp4
```
⚠️ `-c:v mjpeg` BEFORE `-i` is mandatory: the shot receiver names files `.png`
but writes whatever bytes it was POSTed, so ffmpeg's PNG parser chokes
("Invalid PNG signature 0xFFD8…" = it's actually a JPEG). `+faststart` puts the
moov atom first so the video streams instead of waiting for a full download.

⚠️⚠️ **"CUT UP / SKIPPING LIKE IT'S BADLY LOADING" (2026-07-29) — it was the
CAMERA, not the encode, not the frame rate, and not a time-lapse.** Three of the
five shots aimed at `busiest()`, a **raw centroid of all aggro units, recomputed
every frame**. One toy dying yanks that mean instantly: measured **2.98 tiles of
camera movement between two adjacent frames**. Fed straight to `cam.position`,
that is a hard cut in the middle of a shot — ~17 of them across 47s.
- **Never point a camera at a raw centroid.** Low-pass it:
  `foc.x += (b.x - foc.x) * 0.015` per frame (≈1.1s time constant at 60fps).
  Same measurement after: worst frame 0.068 tiles — **44x smaller**.
- The old capture also called `g.update()` **directly, bypassing `tick()`**, so
  `vfx`/`marker`/`ui` never advanced — debris hung in the air and nothing settled.
  Use **`window.__ttStep(dt, fx, fz)`** (main.js): one frame exactly as `loop()`
  draws it, minus input and the player camera. Anything view-side that belongs in
  a captured frame belongs in that function.
- ⚠️ The hidden-tab `setInterval` **advances the sim between your capture
  batches** — a 51.4 delta spike at the batch seam, as jarring as a real cut.
  Call **`window.__ttCapMode(true)`** first; it makes that interval return early.
  Confirm it worked by checking `g.time` advanced by exactly `frames × 0.05`.
- Capture at **60fps, one 0.05 tick per frame = a smooth 3x speed-up.** 2820
  frames ≈ 70s of wall time at ~25ms/frame; +18% file size over 30fps (34.6 → 40.8MB).
  Fire `__TRRUN()` un-awaited and poll a counter — the 30s eval timeout does not
  kill page JS, and a single uninterrupted run has no batch seams at all.
- ⚠️ The match can **END mid-capture** (`g.over`) and freeze the board. 2820
  frames eats 141 sim-seconds; hard/playmat concludes at ~7 sim-min. Start the
  window around 2.5–3 min and assert `over === false` at the end.
- The autostart human seat is IDLE, so there is only ever ONE army. For capture
  only: `g.players[0].isAI = true; g.aiState[0] = JSON.parse(JSON.stringify(g.aiState[1]))`
  → a real two-sided battle.
- **MEASURE smoothness, don't eyeball it** (you cannot watch video anyway):
  ```
  ffmpeg -c:v mjpeg -i "f%05d.png" -vf "scale=320:180,tblend=all_mode=difference,\
    signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null -
  ```
  Per-frame mean luma delta. Spikes >3σ = visible jumps. Legit shot cuts spike
  too, so classify by frame index. Old: 21 spikes, 17 of them mid-shot artifacts.
  New: **4 spikes, all 4 at the intended cuts, 0 mid-shot.** That is the pass bar.
- ⚠️ Tighter framing was TRIED and is worse: the army spreads out, so the centroid
  lands on empty mat and a close camera just fills frame with a bean-bag. The wide
  shots show the most game. Real improvement needs authored shots that follow
  specific units, not a tighter radius.

**The legacy pipeline (kept for reference — superseded by ffmpeg above)**: capture = drive the sim manually + render →
toDataURL per frame → POST to the shot receiver; mux = `tools-frames-to-avi.mjs`
(hand-built MJPEG/PCM AVI, optional interleaved WAV); demux BACK =
`tools-avi-extract.mjs` (00dc chunks are whole JPEGs, 01wb chunks are PCM —
⚠️ read the auds strf for the REAL format: the mixed track is 24kHz STEREO, a
mono assumption makes a half-speed WAV); web player = `tools-pack-shards.mjs`
(frames → 6 binary shards + offsets JSON) + a canvas player clocked by
**WebAudio** (`ac.currentTime`, not an <audio> element — media elements report
NaN duration in the hidden pane and have autoplay quirks; decodeAudioData is the
decisive wav validity test). All three tools at repo root. Trailer wavs + cards
in `~/Downloads/age-of-toys-trailer-audio/` + the AVI beside them.

## Deploy

`push-web.ps1 "message"` — copies `toybox-tactics.html`→`index.html`, robocopies a HARDCODED
folder list (toybox/, assets/{lib,ui,map,buildings,furniture,campaign,intro}, units minus
_legacy, audio/vo ONLY), commits + pushes `../toybox-deploy`. **A new asset folder ships only
if you add a robocopy line.** `.nojekyll` in the deploy repo is critical. README.md and media/
in toybox-deploy are committed by `git add -A` but never robocopied — edit them there directly.

## Balance state (battery-derived; latest 2026-07-12 six-faction matrix)

Tournament method: `__ttSoak` matrix, ordered faction pairs × maps × seeds, hard AI, 9000
ticks, always mirror seat order (seat-0 advantage ≈59%).

**2026-07-12 TWO-POOL matrix, all 30 six-faction pairs × 2 maps each (120 games, 0 errs):**
| faction | open (playmat+kitchen) | terraced (bookshelf+canyon) | overall |
|---|---|---|---|
| knights | 47 | 65 | 56 |
| racers | 69 | 50 | 59 |
| plush | 53 | 53 | 53 |
| bricks | 50 | 53 | 52 |
| bots | 41 | 38 | 40 |
| classic | 41 | 38 | 39 |

Draws: 15% open / 22% terraced (terrain-driven). Readings: knights = the chokepoint faction
by design (their walls/armor own terraces; honest 47 in the open) — no tune. Racers swing
hardest by map; fine overall — no tune. **Classic + bots are the soft pair (~39-40 overall,
consistent across three batteries)** — next session's candidates for a GENTLE buff (classic
has no mods at all; consider a small one, e.g. +5% infantry HP or cheaper Tent). Tune from
BOTH pools or don't tune.

**2026-07-20 POST-TERRAIN battery (30 ordered pairs × playmat/sandbox, seed 47, 60 games,
0 errs, 1 draw):** plush 60 (70 open!), bricks 55, classic 50, bots 45, racers 45,
knights 40 (30 open / 50 terraced — the designed chokepoint shape finally shows in data).
**The old classic+bots soft-pair flag is RESOLVED by the map overhaul** (classic 39→50);
plush is the new top at +10 but single-seed — NO tune applied; re-check plush with a
second seed before touching anything.
**2026-07-20 PLUSH CONFIRMATION (3 fresh seeds 101/202/303, plush-vs-field, 2 seat orders,
playmat+sandbox, 37 games sampled — tab-throttling killed the full 60):** plush 57% overall
(21/37), and the map split FLIPPED vs the single-seed run — 37% open playmat (was 70), 78%
terraced sandbox (was 50). Two seed-sets disagreeing that hard = NOISE; 57% is unremarkable
in the 40-60 spread. **VERDICT: the single-seed plush=60 was noise, NO plush tune. ✅** One
real signal survived: plush is genuinely strong on heavily-terraced sandbox (78%) — worth a
watch if sandbox ever feels plush-dominated, but one map ≠ a faction problem. ⚠️ soaks are
MUCH slower now (cat/dog/roomba/critters live every tick); a backgrounded tab throttles them
to a crawl — keep the tab foregrounded or expect ~40min for 60 full-length games. ⚠️ AMBIENCE HUM FIX same day: the R6 room-tone
`hum()` was a raw endless sawtooth (AWFUL drone — Kyle report); now breathing triangle
at ~1/3 energy, the 52Hz underbed sub-drone is DELETED, tv/bees trimmed, and ALL
continuous beds are tracked in `sfx.ambNodes` + stopped on every startAmbience switch
(they used to leak/stack forever).

**History:** 07-11 pre-tuning: classic 48, plush 45, racers 39, bots 36, bricks 31 →
tuned (bricks speedInf .97 + bHP 1.25; bots speedInf .95; racers gather .97) →
bricks 46, bots 50, plush 48, classic 40, racers 38. The late-game stalemate ramp
(wave threshold shrinks 25%/min after minute 12) shipped but did NOT move the draw rate
in its validation (13/60 vs 12/60 baseline) — the 15% above may reflect map pool as much
as the ramp. Don't re-tune the ramp without a controlled A/B.

## BALANCE BATTERY: the two new factions (2026-07-29, 104 games, free)

**Method**: 26 ordered pairs (wranglers + plains, each vs all 6 field factions
and each other, in BOTH seat orders) × 2 maps (playmat = open, bookshelf =
terraced) × 2 seeds (11/47), hard AI, 9000 ticks. 0 errors, 14 draws (13.5%,
in line with history). New factions get n=56 each — the best-sampled rows in
the table; the field factions are n=16 and their numbers are NOISE, so do not
read them as a general rating (they only played the two new factions).

**Raw win rate (both seat orders merged, so positional bias cancels):**
| faction | overall | open | terraced |
|---|---|---|---|
| plains | **51%** | 54 | 48 |
| wranglers | **46%** | 50 | 41 |

**⚠️⚠️ THE BIG FINDING — SEAT-0 ADVANTAGE IS ~77%, NOT THE ~59% THIS FILE USED
TO CLAIM.** Measured across 90 decided games: seat0 avg 77% / seat1 avg 25%.
It reproduces on BOTH maps (playmat 78%, bookshelf 82%) and BOTH seeds (76%,
84%) — **systemic, not a map quirk**. Consequences:
1. **Any battery that does not mirror seat order produces garbage.** This is
   now non-negotiable, not a nicety.
2. A raw win rate near 50% means "exactly average" only because the mirror
   cancels the bias — the seat effect SWAMPS faction skill, so a 104-game
   battery has low power. To see faction skill, split by seat and compare each
   faction to the positional floor (below).
3. It may be a real first-player-advantage issue in the GAME (it would matter
   in MP). Not investigated — **worth its own session**. Suspect spawn/resource
   asymmetry at seat 0, or turn order in some per-tick loop.

**Skill above the positional floor** (seat0 avg 77% / seat1 avg 25%; edge = how
far above/below a faction performs, 0 = exactly average):
| faction | edge | as seat0 | as seat1 |
|---|---|---|---|
| classic | +12 | 88% | 38% |
| bricks | +8 | 81% | 38% |
| plush | +5 | 94% | 19% |
| knights | +5 | 69% | 44% |
| **plains** | **0** | 75% (n=28) | 27% (n=28) |
| **wranglers** | **−6** | 73% (n=28) | 18% (n=28) |
| bots | −7 | 75% | 13% |
| racers | −17 | 63% | 6% |

**VERDICT: NO TUNE.** Plains is dead centre (edge 0). Wranglers is −6, inside
the existing spread (+12 … −17) and comparable to bots (−7). Neither new
faction is an outlier. Wranglers' terraced 41% vs open 50% DISAGREE across
pools, and the standing rule is tune from BOTH pools or not at all.

**⚠️ The "Wranglers field zero army and lose in 5 minutes" pathology is NOT
REAL.** Checked every game for a side ending with 0 army, ≤2 trained, and a
loss: **0 occurrences in 104 games.** The one collapse seen while hunting a
trailer matchup was a single unlucky seed. Do not "fix" it.

⚠️ HARNESS NOTE: a hidden Browser pane throttles BOTH timers (setTimeout drops
to ~1/min after a few minutes) and compute. Two async battery loops stalled
dead this way. **Drive batches synchronously from the agent side instead**
(`window.__RUN(n)` pattern) — and note that a 30s eval timeout does NOT kill
the page's JS, so the work continues; just poll `__BR.length` afterwards.

## WOODLINE-MAP BATTERY (2026-08-04, 280 games, free): NO TUNE, stands acquitted

**Method**: all 28 faction pairs × BOTH seat orders (mirroring is non-negotiable
— seat-0 measured 67% here, 77% on 07-29) × the 4 stand maps, one seed per map
(oldoak 11 / playground 47 / attic 31 / garden 101). 224 games + a 56-game
control, **0 errors**, 9.5 + 2.5 min. ⚠️ Battery infra: the async pump yields
via **MessageChannel, never setTimeout** — hidden-tab intensive throttling
clamps chained timers to 1/min and would have stretched 224 yields into hours;
macrotask-via-postMessage is unthrottled and lets CDP polls land between games.

**Overall (mirrored, n=56/faction):** plush 54, wranglers 50, classic/bots/
plains 46, bricks 41, racers 34, knights 32. Spread is within the historical
band (knights have ranged 40→56→40 across batteries; racers were already the
−17 floor). Per-map cells are n=14 single-seed = directional only. **NO TUNE**
— the standing rule requires both pools, and nothing here is outside variance.

**The oldoak draw scare + the CONTROL that acquitted the stands**: oldoak drew
17/56 (30%) vs playground 3 / attic 1 / garden 7. Before touching the stands,
the same 56 games were rerun with `MAPS.oldoak.stands = null` mutated live
in-page (the survivalDawn trick — data.js exports are live objects):
**13/56 draws (23%) WITHOUT stands.** Oldoak at seed 11 was already draw-heavy
(mask + centerHill + roots); the woodlines add ~7pp. Faction numbers replicate
across both runs (bricks 14% both times, knights 29 both) — stable map+seed
properties, not stand noise. Stands kept as-shipped. Watch item: if oldoak
feels stall-y in play, the pre-existing density is the suspect, not the trees.

**Seat-0 again**: 67% overall (79/83/75 on three maps) — third battery
confirming the systemic first-seat advantage. ⚠️ GARDEN INVERTED: seat-0 won
only 31% at seed 101. Single seed = curiosity, but file it with the seat-0
investigation: garden's groves (count 5, odd, unmirrored) are the only
asymmetric terrain in the game.

## The AI (2026-07-22) — read the ⚠️ before "fixing" stalemates

⚠️ **THE STALE-DATA TRAP.** The 07-12 matrix line "Draws: 15% open / 22% terraced" is
**historical** — it predates the map/terrain overhaul. A session read it as current,
concluded "games don't conclude, it's the biggest quality problem in the game," and
nearly spent itself re-tuning the late-game stalemate ramp. **A fresh 12-game diagnostic
(6 maps × 2 seeds, classic mirrors, hard, 9000 ticks) concluded 12/12 at 7-15 sim-min,
most decisively (loser at 0 army).** The 07-20 battery agrees (1 draw in 60). The
chokepoint/ridge work fixed stalling. Measure before you tune; the draw numbers in the
balance section are dated snapshots, not a live readout.

⚠️ Corollary: **don't compare sim-minutes across two different batteries** unless both
computed the field the same way — an apparent "control map got faster" was purely a
measurement artifact between two harnesses. Compare fingerprints, or nothing.

**Tribe contest manager** (`aiUpdate`, just before the defense/attack managers): the AI
now seeks Wild Toy camps. Mirrors the sticker manager's shape — `ai.tribeT` (18s first,
20s after), only when `!ai.attacking && military.length >= 4`, picks the nearest unclaimed
camp with a −60 score bonus for one a RIVAL is mid-hold on (arriving at all resets their
progress, so denial is worth the walk), and sends ≤3 **ground** military (`!m.def.naval` —
the camp scan at `updateCamp` ignores workers and boats, so naval would march and never
count). Measured: **tribes claimed went 1/16 → 14/16** across the same 8 map/seed pairs,
0 errs, and 4 of 8 games split 1/1 between the two AIs — a real contest, not a sweep.
Before this the camps were decoration in AI games and a free gift to any human.
- Determinism, MP lockstep (2h+2ai and 3h+1ai, `inSync === true`), and save round-trip
  all re-verified — pets and AI both consume rng, so any AI change is MP/replay-affecting.
- `ai.tribeT` is deliberately NOT snapshotted, consistent with `stickerT`/`raidT`.
- **Lost Toys are still AI-blind ON PURPOSE** (0/16 seats ever carried one home). That's
  the documented human edge — the SP fantasy, like Empire cards. Don't "fix" it.
- QA hook: `__ttSoak` now returns `stats` (per-player stat blocks) alongside `kinds`, so a
  test can assert a seat ENGAGED with a system rather than merely coexisting with it.

⚠️ Harness gotcha found the hard way: `g.setup()` sits OUTSIDE `__ttSoak`'s try block, so a
throw there escapes an async battery loop as an unhandled rejection and the battery dies
silently mid-run (looks like "stuck at 7/12"). Wrap each job in its own try/catch. Also:
polling a battery with heavy evals can itself kill the chain — launch, then wait, don't poke.
Live tabs throttle hard (0.1 sim-min in 100s), so prove AI behavior headlessly, not live.
`THREE` is module-scoped — you cannot `new Game(...)` from the console; use `__ttSoak` or
`window.game`, and note AI state is `g.aiState[pid]`, NOT `p.ai`.

## Toy-blood: hit/death debris & stains (2026-07-24, free — vfx.js is view-only)

The toybox has no blood, so struck toys shed their OWN material. All in `vfx.js`,
all view-only (Math.random, never `this.rng`) — determinism/MP re-verified.
- **Directional spatter**: `PiecePool.spawn` now takes `{dir, spread, up}`. When
  `dir` is given (the strike angle `atan2(tx-ax, tz-az)`, the game's (sinθ,cosθ)
  convention) pieces spray in a cone THAT way instead of a symmetric puff. The
  `dir===null` path is byte-unchanged. ⚠️ the radial scatter uses (cosθ,sinθ) for
  (x,z) but the game's world-direction convention is (sinθ,cosθ) — the directional
  branch uses the latter or the spray flies perpendicular to the blow (caught in review).
- **`chip(x,y,z,debris,dir,hard)`**: sheds 2 pieces (4 for siege) along `dir`, a
  fluff wisp for `debris.fluff` toys, and a small ground scuff. Fires on 55% of
  normal hits / 100% of siege (was 30/85 and non-directional).
- **`death(x,z,debris,dir)`**: `dir` = killing blow angle (from `killer` in `kill()`,
  null-safe for the cat/roomba/null-killer path). Burst fans away from the killer,
  a broad material stain marks where it fell, and 3 settled litter pieces trail in
  the knock direction — the room's record of which way it went down.
- **`StainPool`** (new, cap 48): soft radial-gradient decals tinted per-hit by the
  toy's debris colour (dulled −0.14 L), renderOrder 350 (under sticker splats 400),
  fade over 24–34s. The toy-safe "pool of blood". `stains.stain(x,z,color,radius,peak)`.
Verified: soak determinism identical, MP 2h+2ai inSync, directional velocity bias
(meanVz 2.78 along dir=0 vs 1.5 lateral), stains light, death trail drops, knights+
plush fluff path clean, 0 console errors. Screenshots still time out (WebGL page) —
proved via pool census + velocity sampling, not pixels.

## EIGHT FACTIONS: Wranglers + Painted Plains (2026-07-27, ~310cr) + NO-DISC RULE

Two factions in one pass — the classic toy-set pairing, both written as heroes:
- **wranglers** 🤠 "The Wranglers" (Marshal Tess, The Quick Draw): mods {gather 1.04,
  buildingHp .92}; uniques gunslinger (fast-fire pierce) + rider (3.1 speed lasso
  cavalry); Log Fort (trains both, tech `roundup`: +1 atk, +8% infantry speed);
  house-wranglers.glb log cabin + procedural notched-log factionHouse + split-rail
  factionWall.
- **plains** 🪶 "The Painted Plains" (Chief Swift River, The Wind-Reader): mods
  {speedInfantry 1.05, buildingHp .9}; uniques brave (1.1s-interval melee + shield)
  + bowhunter (range 5.2, vision 8, arcing arrows); Great Teepee (tech `windrunner`:
  +1 atk, +10% speed); procedural teepee factionHouse + painted-pole factionWall.
- 9 bakes (~30-35cr each, prices DRIFTED UP mid-day): 6 units incl. both faction
  workers, logfort/bigteepee/house-wranglers GLBs. All installed draco-only ~3.2MB —
  ⚠️ sharp's native binary fails under node 24 (ERR_DLOPEN_FAILED), so webp texture
  compression is SKIPPED for now; `tools-glb-diet.mjs` degrades gracefully. A future
  session with a working sharp can re-diet these to ~700KB each.
- **Permanent GLB kit at `C:\Users\kylef\tools\gltf-kit\`** (npm: @gltf-transform/*,
  draco3dgltf, sharp) — the old scratchpad node_modules was gutted. `tools-glb-diet.mjs`
  at repo root points there. ⚠️ npm blocks sharp's install script — `npm approve-scripts
  sharp` then `npm rebuild sharp`.
- ⚠️ PATCHING LESSON (cost 3 rounds): appending to a data.js sub-block with a regex like
  `king: \{[\s\S]*?knights: [^\n]*\n` matches the FIRST `king:`/`wonder:` in the FILE —
  the King UNIT and Wonder BUILDING, not AI_LINES — and the stray lines land inside
  FACTIONS.knights where they PARSE FINE and hide. Verify by importing the module and
  checking the actual object shape, never by "patch script said ok". Also: bash heredocs
  eat `\\'` escapes — write patch scripts with the Write tool, not `cat <<EOF`.
- ⚠️ lore.js was corrupted by that heredoc mangling and this workspace has NO git —
  restored from `../toybox-deploy/toybox/lore.js` (the deploy repo is the only undo).

**MEGAS (2026-07-28, ~74cr): every faction has its titan now.** ironhorse 🚂 (Wranglers,
'The Iron Horse': rolling siege mega at the logfort — 560hp, siege 22, trample 12, speed
2.2, wind-up locomotive, gait roll) + thunderhoof 🦬 (Plains, 'Thunderhoof': charge mega
at the bigteepee — 640hp, melee 20, trample 10, bonus ranged 8, speed 1.9 = fastest
WALKING mega, gait stomp). Megas need NO special-case code: cinematic beats, narrate,
megaBuilt stat, 1.16 silhouette and trample all key off tags/def fields. Disc-profiled
both: locomotive widens upward from wheels (clean), buffalo bottom band = hoof-spread
(91,58 — a disc reads full-width BOTH axes). Neither cut.

**THE NO-DISC RULE (Kyle, 2026-07-27): no character model stands on a moulded base
disc — ever.** Toys that have come to life need free legs. `BASE_DISC_CUT` in models.js
prunes baked-in discs at load: knight .032, crossbow .062, charger .036, paladin .046,
brave .055, worker-plains .048. `pruneBaseDisc` drops triangles whose 3 verts all sit
under cutY (fraction of geometry height above bbox.min.y), then normalizeToHeight
re-grounds the feet. Diagnose new bakes with a y-slice vertex-density profile: a disc =
full-width band at the very bottom + extent collapse above (brave: plate faces at 0 and
.04-.05 full-width, legs 24%). ⚠️ dragon has NO disc (tail/claws at bottom) — don't cut
it. ⚠️ brave's first cut at .045 left the plate's TOP face (band spans to .05) — the
disc survived visually; cut ABOVE the whole band, then capture to confirm. Bake prompts
now say "standing directly on the ground, no base, no stand" but the baker sometimes
adds one anyway — ALWAYS profile + capture new figure bakes.

## ❌ AI RIGGING (`3d_rigging`) — TESTED 2026-07-29, 32cr, REJECTED. Don't redo it.

Kyle asked whether Higgsfield credits could buy better character animation. One
unit (the Painted Brave) was rigged as a controlled test — 4 clips picked from the
678-clip library (Idle 0 / Casual_Walk 30 / Attack 4 / Shot_and_Fall_Backward 183),
~8cr each. All four jobs succeeded and the rig itself is clean (24 bones, 1
skinned mesh, loads through the existing `clips:` manifest path with 0 errors).
**It still fails, for three independent reasons:**
1. **⚠️ BAKED ROOT MOTION — the disqualifier.** The clips translate the `Hips`
   bone: measured (0.86, 84.0, −10.1) → (−22.1, 49.8, +37.7) across one attack.
   The toy physically walks off its own tile every time it swings, while the sim
   still believes it is standing still. This game's positions are sim-authoritative
   and MP-lockstep, so a view that wanders off-position is not acceptable.
   Strippable (drop the root position tracks) but that is a real pipeline to build.
2. **10x asset size**: 8.1MB per clip × 4 = **32.5MB for ONE unit** vs 3.3MB
   static, because each clip GLB ships its own full copy of the textured mesh.
   Eight units would be ~256MB. Would need a mesh-merge-into-one-GLB step.
3. **The base disc comes back** — `pruneBaseDisc` is only called in the rigless
   `man.model` branch of `loadUnitModels`, never the skinned `clips` branch, so a
   rigged bake violates the NO-DISC RULE on arrival.
**Verdict: reverted** (manifest back to `assets/units/brave/model.glb`, the
original static GLB was never touched; the 32.5MB `brave-rig/` folder deleted).
Scaling to the other seven units would have been ~224cr on top of three unbuilt
pipeline steps. **The code animation we already have is better value**: `meleeLungeZ`
swings, per-unit `gaitBias`, randomised clip phase, and hit-kick all ship today and
cost nothing. Revisit only if someone first builds root-motion stripping + mesh
sharing — and re-read this entry before spending.

## THE OOMPH PASS (2026-08-04, free) — "maps lack the AoE oomph factor"

Kyle's diagnosis was right and the cause was MEASURABLE: maps ran 12-20 decor
props + 2-11 obstacles on ~5,000 tiles — beautifully painted, mostly EMPTY.
Five fixes, four pure-view + one sim:
1. **Instanced ground cover** (`createGroundCover` models.js, `setupGroundCover`
   main.js): 300-560 instances/map (tufts/clover/flowers/crumbs/pebbles/scraps/
   sprinkles/dust/tinsel/shellets) via InstancedMesh — 3-4 draw calls. Per-style
   recipes in `COVER_RECIPES`. Placement PRNG seeded from the ground STYLE, NOT
   game rng — the sim stream is untouched. ⚠️ organic kinds (tuft/clover/flower)
   sample the ground canvas (`userData.groundCanvas`) and require GREEN-dominant
   pixels on playmat/playground/garden/oldoak — first attempt put grass on the
   painted roads and IN the pond. ⚠️ a lone small cone reads as a PIN — tufts
   drop as leaning triples. Sandbox skips the filter (dry tufts on sand are fine).
2. **Building age-dressing** (`applyBuildingAge` models.js, driven by the 1Hz
   baseLife scan): age2 = corner banner in team colour, age3 = + bunting line,
   age4 = + gold finial. Walls/gates excluded on purpose. Views that get rebuilt
   (tier upgrades) lose `_dressAge` and re-dress within 1s — self-healing.
3. **Visible stockpile** (`buildStockpile` models.js): crumb mound / brick stack /
   button tower / marble pyramid grow beside each chest as the player banks
   (level = res/130, cap 4; rebuilt only when a level CHANGES, swept on death).
4. **Water juice** (createWaterSurface + `updateWakes` in main.js): 2 counter-
   scrolling ripple-glint layers (repeat 9, opacity .32 — at repeat 5/op .5 they
   read as CROP CIRCLES), static shore-foam lace on every water/land edge, and
   a fading wake canvas behind moving boats (~7Hz stamps; at 11Hz/r1.6 the wake
   was a solid CONTRAIL — sparser+smaller reads as foam). Wakes piggyback
   updateWeather so they run in both loops + __ttStep with no new wiring.
5. **Woodlines** (SIM: `stands:` config in MAPS → game.js setup, placed after
   groves): point-mirrored dense clusters (8-11 obstacles, r~3.4) with one open
   corridor each (angular gap in the offset loop). Both mirror twins use the
   SAME offset list = exactly fair. On oldoak (trees) / playground (trees) /
   attic (books) / garden (sunflowers). Playmat/kitchen stay open per the
   standing map-identity rules. Verified: fp determinism ×2 maps, 8/8 soaks
   0 errs all concluded 3-6 min, MP 2h+2ai inSync === true.
⚠️ ground cover is live-only (setup in startGame) — headless soaks never see it,
so per-map verification = boot the map and census InstancedMesh counts.

## THE LIFE PASS (2026-08-05, free) — the board acts like it's inhabited

Follow-up to the oomph pass. Four gaps, all view-only:
1. **Piles visibly deplete** (`passiveView.setAmount(f)` in models.js, called from
   `updateGather` after `node.amount -= take`, and from the `k:'r'` restore branch
   so a save reloads a half-mined pile as half-mined). Quantised to 8 levels — the
   scene is only touched when a level CHANGES. Captures each piece's BASE
   transform at construction and multiplies, so it composes with the GLB piles'
   1.15 base scale. ⚠️ that base scale burned a verification round: raw scales
   read 1.15x "wrong" until compared against an untouched pile of the same type.
   Procedural piles (≥3 children) also drop pieces top-down; index 0 always
   survives, which keeps the button JAR standing while its buttons run out.
2. **Workers carry what they gathered** (`view.setCarry(color, on)`, set every
   frame from `u.carry/u.carryType` in updateUnit; early-outs unless it changed).
   Parented to `group`, NOT `model` — a tier recast or hit-flinch would strand it.
   ⚠️ first size (0.16 box at y .29/z .21) read as a floating CRATE; 0.1 at
   y .21/z .14 reads as a held bundle. Captured both to tell.
3. **Footfall scuffs** — the vehicle wheel-dust block gained an `else if` for
   everything else on foot (0.5s fixed interval, `fx.footDust`). ⚠️ the interval
   is FIXED because updateUnit is SIM code; all the randomness lives in vfx.
4. **Idle glances** — idle toys periodically turn their head/body (per-view
   `idlePh` random phase so a squad doesn't fidget in unison).
Verified: fp determinism ×2 map/faction sets, MP 2h+2ai `inSync === true`,
snapshot round-trip incl. restored depletion state, 8-map soak sweep 0 errs,
live 0 console errors, carry mesh present on 19/19 haulers, every worked pile's
scale exactly matching the expected curve. (`muzzle()` flash already existed and
was already wired at spawnProjectile — checked before rebuilding it.)

## CONSTRUCTION & DEATH BY MATERIAL (2026-08-05, free — all view-only)

**Construction.** Buildings now stand inside a **scaffold** (4 poles + 2 plank
rings, `createBuildingView`, struck the instant `f>=1`; walls and gates skip it —
40 scaffolded wall segments is noise) and **RISE OUT OF THE FLOOR** at full
proportions: `meshes.position.y = meshBaseY - (1-f)*(def.height+0.25)`. The mat
is opaque and depth-tested, so the buried part is occluded for free.
- ⚠️ the OLD `meshes.scale.y = f` squashed a half-built tower into a caricature
  of itself. Don't go back to it — captured side by side.
- ⚠️ **per-PART assembly was built, measured, and REMOVED**: only **1 of 24**
  buildings (house) has ≥4 sub-meshes; the other 23 are single merged GLBs with
  nothing to stack, and on the house it looked worse (a flat glass box) than the
  rise. Measure `_buildPartCount` before ever trying this again.
- ⚠️ two dead ends on the way: `box.min.y` groups every piece at the floor (use
  the CENTROID), and bboxes are garbage until `updateMatrixWorld(true)` because
  the view isn't in the scene yet.

**Death by material** (`deathStyleOf(def)` + `deathPose()` in models.js, wired
into all four death paths — rigless, skinned, proc-rig, box):
`fluff → FLOP` (folds and spreads), `brick in debris → SCATTER` (shrinks away as
vfx throws the bricks), `vehicle/roll/spin/hover → CLATTER` (falls hard, tumbles,
one bounce), else `TOPPLE` (the original stiff faceplant). Measured spread:
topple 30 / clatter 13 / flop 6 / scatter 4.
- ⚠️ do NOT key "machine" off a `disc` in debris.shapes — an army man's debris
  carries its base disc, so that read made workers and soldiers clatter like
  robots. Key off `tags/gait/spin/hover`.
- A real baked death CLIP always wins (soldier/archer/bear/medic have one). But
  bear+medic are the two most PLUSH units, so `deathSquash()` layers the
  scale-only part of flop/scatter ON TOP of the clip — the clip animates bones,
  this scales the model root, so they compose.
- ⚠️ `startDeath` captures `_deathBase = scale.clone()` and every pose MULTIPLIES
  it — never assign absolute scale, or you stomp applyUnitTier's veteran recast
  and the per-role silhouette scaling.
Verified: fp determinism, MP 2h+2ai inSync, 6-map soak sweep 0 errs, all four
styles animate (bear sy 1→0.40 & sx→1.20, golem →0.05, dragster/knight →π/2),
every building sinks proportionally and restores to y=0 fully opaque, 0 console
errors. ⚠️ two assertions were wrong before the code was: the contact-shadow disc
is legitimately semi-transparent, and GLB piles carry a 1.15 base scale.

## SPEECH BUBBLES (2026-08-05, free — view-only)

Barks were text in the HUD feed, which never told you WHICH toy spoke. Now the
line also appears in a bubble over the speaker's head.
- `speechTexture(text)` + `attachSpeech(view, group, y)` in models.js give any
  view a `say(text)` / `updateBubble(dt)` pair. Called from all THREE view
  builders (createUnitView, makeProcView, the box fallback) so procedural and
  fallback toys can speak too.
- It's a **Sprite parented to the unit's group**, not DOM — so it tracks the toy
  with no screen projection and no per-frame layout. `depthTest:false` +
  renderOrder 900 keeps it readable over everything.
- Canvas is drawn in Georgia to match the storybook UI; wraps to 2 lines max.
- Wired at the single funnel `ui.maybeBark()` (both selection and order barks
  route through it), and ticked from `updateUnit` — **including the `u.dead`
  early-return branch**, or a toy killed mid-sentence freezes its bubble.
- Lifecycle verified numerically: opacity 0→1, drifts y 0.82→0.92, fades to 0.2,
  then removes and disposes itself. Determinism/MP unaffected (no rng, no sim
  state); soak stubs have no view, hence the `if (u.view.updateBubble)` guard.

## STICKERS ARE NO LONGER A WIN CONDITION IN ANY MODE (2026-08-05, Kyle)

`updateRelics` used to run in every mode but survival, so holding all Lost
Stickers for `RELIC_COUNTDOWN` (180s) ended the match — you could win Conquest
without conquering, or Regicide without touching a King. Every mode already
states its own win condition, so the sticker hold overrode all of them.
**One flag now gates it: `const RELIC_VICTORY = false;`** at the top of game.js
(next to RELIC_COUNTDOWN). The whole countdown mechanism is intact behind it, so
a dedicated "Relic Race" mode can flip it back on without rebuilding anything.
- Stickers are NOT removed — they still spawn, get contested, and pay
  `STICKER.incomePerSec` to the holding team. Measured with all 3 held for 210
  sim-seconds: countdown never started in standard/regicide/koth/sudden, no game
  ended by relics, and the holder still banked **252 buttons** per mode.
- All four modes still conclude on their OWN rules (soaked at seed 404: 5713 /
  5995 / 4855 / 5527 ticks, 0 errs); fp determinism + MP inSync re-verified.
- ⚠️ TEST TRAP: flipping `g.gameMode` to `regicide` mid-match ends the game
  instantly — Kings spawn only when a match STARTS in that mode, so its own
  "no King" rule fires. Not a regression; soak each mode from a fresh start.
- The `'relics'` cause string in endGame/epilogues is deliberately kept so old
  replays and saves that ended that way still read correctly.

## 🐛 WALLS UNALIGNED — **TWO SEPARATE CAUSES** (2026-08-05 playtest) — BOTH FIXED

Kyle reported this TWICE. The second report was not a restatement — there was a
second, unrelated cause, and the first fix was real but incomplete.

**Cause 2 (mine, same day): walls must NOT use the construction "rise".**
The rise sinks a building by its build progress. Walls are built in long RUNS,
so each segment sat at a different DEPTH — ragged bases, which reads exactly as
"the wall doesn't line up" (and you notice it right after ageing up, because
that's when you extend your walls). Walls/gates now keep the original
`meshes.scale.y = f` grow-in, so every base stays planted on the floor and only
the TOPS are ragged. Measured after the fix: bases 0.01/0.01/0/0/0.01 across a
run at progress [1, .75, .5, .25, 1]; tops 1.41/1.06/0.71/0.35/1.41.
Towers/forts/houses still rise (−1.59/−1.47/−0.81 at 40%) and all restore to 0.

## 🐛 CAUSE 1: rebuilt walls forget their run direction (pre-existing) — FIXED

Kyle: *"when I aged up the walls stopped aligning."* Real, and **pre-existing**
(not from the same day's visual passes). A wall's run direction is stored ONLY
as `view.group.rotation.y` (set by `orientWalls`: π/2 for a north-south run, 0
for east-west). `rebuildBuildingView` throws the old group away and builds a
fresh one at rotation 0 — and it re-oriented **gates only**. Age-up calls
`reageBuildings`, which rebuilds every building, so every north-south wall
snapped 90° out of line. Measured: 6/6 walls went 1.571 → 0.
Fix: re-orient on `b.def.wall || b.def.gate` (matching the `addBuilding`
condition), **plus** a settling pass over all walls after `reageBuildings`
finishes — a wall re-oriented mid-loop can be flattened again by a neighbour
rebuilt after it. Verified: both runs hold 1.571/0 across two consecutive
age-ups, gate seats correctly, fp determinism, MP inSync, canyon soak clean.
⚠️ **Any new per-building view state that lives on `view.group` (rotation,
scale, attachments) is destroyed by `rebuildBuildingView` — restore it there.**

## ⚠️ THE DEPTH AUDIT (2026-08-05) — READ BEFORE PROPOSING "MORE TACTICS"

A session pitched stances, formations and garrison-beyond-the-chest as missing
depth. **All three were already built and already on the command card:**
- **Stances** `agg`/`def`/`stand` — `u.stance` (game.js ~1720), `case 'stance'`
  command, defensive `anchor` leash, stand-ground scan radius, snapshotted, in
  stateHash. Three buttons with tooltips in ui.js ~457.
- **Formations** box/line/spread — `g.formation`, threaded through `cmdMove`,
  buttons in ui.js ~478.
- **Garrison** — chest 10, **tower 4, fort 8** (data.js), with a `garrison` order.
**Measure the code before pitching a feature.** The real gaps, verified absent:
active abilities (no system at all — only passive `slam`), destructible
obstacles (obstacles are scenery: blocked tiles + a mesh, no entity/hp/save),
weather affecting the sim (`game.js` reads `weather` ZERO times), pet luring.

**The lesson that mattered more than the audit**: if the game feels shallow
while *having* these systems, the gap is DISCOVERABILITY, not mechanics.

## TACTICAL TIPS (2026-08-05, free — UI-only)

`TIPS` + `updateTips(dt)` in main.js: five one-time nudges that fire only when
the board has just demonstrated why a button exists (shooters being chased →
Hold; empty tower with enemies near → garrison; 8+ selected → formations; 5+
idle aggressive military → Defend; age 2 with 6+ military → Patrol).
- Once each, ever (`tt-tips-seen` in localStorage), 50s lockout between tips,
  4s poll otherwise. Suppressed in tutorial/watch/survival-opening.
- Every predicate is wrapped in try/catch — a tip must never break a match.
- ⚠️ wired into `loop()` AND the hidden-tab interval, but deliberately NOT into
  `__ttStep` (that's the trailer-capture path; tips must not pop into a capture).
- ⚠️ the first wiring only hit `loop()`, which never runs in a hidden tab, so
  nothing fired under test. Check all three call sites when adding a ticker.
Verified: 'defend' and 'hold' each fired on their own trigger and persisted,
determinism fp identical, MP 2h+2ai inSync, 0 console errors.

## Grounding & separation (2026-07-27, free — all view-only)

**Contact shadows.** A capture showed the truth: the Toy Chest cast a shadow and
the army men cast **nothing** — they floated on the mat with only a team ring.
Real shadow-mapping IS on and units DO set castShadow, but the lamp's shadow
camera spans ~96 world units across 2048px (~21px/unit), so a toy's footprint is
a few texels and the depth bias eats it. Retuning the shadow map risks acne
everywhere, so every toy + building now gets a soft AO disc (`makeContactShadow`
in models.js, one shared 64px canvas texture, added in `addCommonRings` and in
`createBuildingView`).
- ⚠️⚠️ **It MUST use `polygonOffset`, not a raised y.** The mat's surface height
  varies, so a fixed world y silently lands *under* the ground and the disc
  depth-fails — it renders NOTHING and looks like the feature never shipped.
  Both 0.014 and 0.019 were tried and captured as invisible. `polygonOffset:
  true, factor/units -6` biases depth only, so the disc hugs whatever surface is
  actually below it. This cost an hour; don't "simplify" it back to a y offset.
- ⚠️ the disc's texture is **black with an alpha falloff**, so `material.color`
  multiplies to black no matter what — tinting it does nothing, drive `opacity`.
  (A red-tint debug test rendered black discs and briefly looked like a bug.)
- ⚠️ debugging trap that cost two rounds: a probe that *replaced* the material to
  test something then left the map-less material behind, so the next test was
  measuring the probe, not the code. Reload between destructive probes.

**Rim light.** A third dim directional (`rim`, 0xbfd8ff) from behind-camera-left
catches toy top-edges so silhouettes don't dissolve into a bright mat.
⚠️ keep it **0.22** — at 0.5 it acted as broad fill, the grass went pale and the
chest's cast shadow nearly vanished (captured, then dialled back).

**Impact.** `applyDamage` now also writes `hitDir` (angle away from the attacker)
and `hitKick` (siege .16 / melee .10 / ranged .06); the view frame offsets the
group along it during the existing `hitT` window, so a struck toy is SHOVED off
the blow instead of only squashing in place. Both fields derive from positions,
so every client computes the same thing — deterministic, but read only by the
renderer, and transient like `hitT` (deliberately not snapshotted).

**Per-map colour identity.** `MAP_GRADES` in post.js gives each of the 12 maps a
tint + exposure `lift`, applied in the composite BEFORE the tone map so it acts
like the room's lamp rather than a filter. Wired via `post.setMapGrade(map)` in
startGame. Underbed is cold blue at 0.94 lift, sandbox sun-warmed at 1.03 —
captured side by side, the rooms finally read as different places. Kept to a few
percent on purpose; this is identity, not an Instagram filter.

**Silhouette by role.** `createUnitView` scales `view.model` (NOT group.scale —
the hit-flinch owns that) by tag: mega 1.16, siege 1.07, workers 0.95. Safe with
veteran promotions because `applyUnitTier` captures `model.scale` as its
`_baseScale` and multiplies on top. Verified worker .95 / soldier 1 / catapult 1.07.

**Animation variety.** Skinned units get a random start phase across every clip
plus a per-unit `gaitBias` (0.94–1.06) on walk timeScale, so a squad reads as
individuals instead of clones marching in lockstep. View-only (Math.random).

## 🎞️ THE MINIATURE LOOK — post-processing (2026-07-26, free) + HOW TO SEE THE GAME

### ⚠️⚠️ SCREENSHOTS ACTUALLY WORK NOW — the old "they time out" note is SOLVED
The Browser pane can't composite this WebGL page, so `computer{screenshot}` and
`preview_screenshot` still fail ("not compositing frames"). **But the page can
photograph itself.** The trick is that a WebGL drawing buffer is only cleared on
COMPOSITE, so `render()` → `toDataURL()` **in the same synchronous task** returns
real pixels — no `preserveDrawingBuffer`, no second renderer needed:
```js
renderer.setSize(1600, 900, false);              // pane never composited → canvas is 0×0
camera.aspect = 1600/900; camera.updateProjectionMatrix(); __ttPost().setSize();
game.fog.plane.visible = false;                  // see the whole board
__ttRender();                                    // same task…
const url = renderer.domElement.toDataURL('image/png');   // …as this
fetch('http://localhost:8399/shot?name=x', {method:'POST', body:url});
```
Receiver: **`tools-shot-receiver.mjs` at the repo root** (kept there on purpose —
a scratchpad copy would die with its session). Run it with the portable node,
port 8399, CORS on; it writes `%TEMP%\toybox-shots\<name>.png` (or pass an out
dir as argv[2]) and prints the path — then just `Read` the PNG. Its header block
carries the full console snippet. **Never pipe base64 through a tool result**
(context blowout). Take matched pairs by toggling ONE thing between two shots —
comparing against a differently-seeded game is not evidence. This unlocks real
visual work; use it.

### The pass itself (`toybox/post.js`, ~230 lines, pure view)
Real toys get photographed with a macro lens, so only a shallow band is sharp —
that tilt-shift falloff is the strongest cue that a scene is SMALL, which is the
whole fantasy. Chain: scene → HDR MSAA target → (bright-pass ¼ → 2× blur = bloom)
+ (copy ½ → blur = defocus) → composite(sharp, defocused, bloom) → canvas.
- ⚠️ **Colour correctness hinges on one three.js fact**: `WebGLPrograms` only
  applies toneMapping when `currentRenderTarget === null`. So the scene lands in
  the RT as LINEAR HDR and the composite shader — which does draw to the canvas —
  applies the same ACES + sRGB via `#include <tonemapping_fragment>` /
  `<colorspace_fragment>` (needs `material.toneMapped = true`). That is why the
  base look is unchanged rather than double-graded. The intermediate materials
  set `toneMapped = false`.
- ⚠️ **`sceneRT.samples = 4`** or post silently costs you the canvas's MSAA and
  everything gets jaggy — a regression that's easy to ship blind.
- ⚠️ **bloomThreshold is LINEAR and this is a BRIGHT world.** The playmat road
  sits just under 1.0, so a low threshold makes the FLOOR glow — 0.18 was a
  total white-out (captured, then fixed). **Threshold 1.0 uses the HDR headroom
  as the gate**: only emissive/additive things (lamps, sparks, the cinematic
  pillar) exceed it. Don't "fix" weak bloom by lowering it; brighten the source.
- `blurMax` is 0.9 and `bandHalf` 0.18 ON PURPOSE — this is an RTS, not a photo;
  units at the screen edge must stay readable. Resist making it prettier.
- **Cost: 0.284 ms GPU at 1920×1080 (1.7% of a 60 fps budget)**, measured with
  `EXT_disjoint_timer_query_webgl2`. ⚠️ `gl.finish()` + wall-clock does NOT work
  in Chrome (it reported post as *faster* than off — a physically impossible
  result that means the probe is invalid, not that the code is fast). Use the
  timer query.
- Toggle: 🎞️ Miniature look in the pause menu (`settings.post`, persisted);
  falls back to a plain render when `!post.available` (needs WebGL2).
- Live tuning without a reload: `__ttPost().p` holds every knob; `__ttRender()`
  draws one frame. Tune → shoot → look → repeat.

## Cinematic moments (2026-07-24, free — all view-only)

A presentation layer for the room's biggest beats: a colour **screen flash**
(`#fx-flash` DOM overlay, `mix-blend:screen`, CSS keyframes restarted via
`void offsetWidth`), **letterbox bars** (`#fx-bars`, slide in ~2.6s), a camera
**zoom-punch** (`cam.punch` → `applyCamera` uses `dist = cam.dist*(1-punch)`,
eases back), plus VFX **shockwave rings** (`ShockwavePool`, expanding ground
rings) and a **light `pillar`** (climbing tapered sparks + base flare + ring).
- Orchestrated by `cinematic(kind, x, z)` in main.js (beat table `CINE`), wired
  through a new `cb.cinematic`. Beats: `mega` (titan unboxed — flash+pillar+wave+
  punch), `megadown` (titan felled — big flash+shake+wave), `wonder` (a Wonder
  rises — flash+pillar+bars), `kingfall` (crown falls — red flash+shake+bars),
  `ageup` (gentle white pulse, no wave/pillar).
- Fired from game.js at: mega unit spawn (`spawnUnit`, gated `owner===myId ||
  visible`), mega/King death (`kill`), wonder standing (`updateWonder`, gated on
  the `ping` visibility), local age-up. **`buildingDeath` also emits a shockwave
  scaled by size** (every fort razing thumps now, no game.js change).
- ⚠️ determinism: `cb.cinematic` is UNDEFINED in `__ttSoak`'s stub cb, so every
  call site is `this.cb.cinematic && ...` — the sim never calls it headless, and
  the VFX it drives are Math.random (view-only). Re-verified: soak fp identical,
  MP 2h+2ai inSync, all 5 beats fire (flash armed + colour, pillar 47 sparks,
  bars shown, ageup adds 0 rings), 0 console errors. Screenshots time out (WebGL)
  — proved via DOM/overlay state + pool census, not pixels.

## Punchier melee swings (2026-07-24, free — models.js is view-only)

`meleeLungeZ(f)` (module-level in models.js) turns a swing into ONE clean beat:
anticipation pull-back (−0.45 to f=0.28) → sharp thrust (peaks +1.0 by f=0.46,
near the impact frame) → ease-out to rest. Replaces the old `Math.sin(_lunge*10)`
WOBBLE that jittered several times per swing. Applied to `model.position.z` (local
+z = toward the foe; the toybox convention where ram-forward is +z, bazooka-recoil −z):
- **rigless** vehicles & **box** fallback: amplitude 0.2, was the sin-wobble.
- **proc** default melee (no catapult-arm/ram/band/tube part): amplitude 0.2 — these
  units used to animate NOTHING on attack; now they lunge.
- **skinned** GLTF melee: amplitude 0.11, applied AFTER `mixer.update(dt)` so it rides
  on top of the attack clip (clips animate bones, not the root — model.position.z is ours).
- ⚠️ **ranged toys never lunge** — gated on `!def.projectile` in every path, so archers
  hold position and fire. Verified: archer lungeSet=false.
- ⚠️ the box/rigless paths only stored `_lunge`; the curve needs the DURATION too, so
  `startAttack` now also stores `_lungeDur` (f = 1 − _lunge/_lungeDur).
Verified by sampling position.z across a swing: soldier/scout (skinned) −0.035→+0.109→0,
spear/worker (rigless) −0.064→+0.199→0, archer flat 0, all return to rest, determinism
identical, 0 errors. (Screenshots time out on WebGL — proved via the position curve.)

## Voice, readability & accessibility (2026-07-22, free)

**⚠️ THE NARRATOR IS NOW ONE VOICE (2026-07-27, ~12cr).** The account switch lost the
old VO's voice (no voice_id was ever recorded, and all Higgsfield voices are presets), so
matching it was impossible — instead ALL 16 first-night beats were re-recorded in a single
preset, **Alistair `d9d5c263-f84e-4752-97b5-3750fcc6fd2f`** (seed_audio). Record that id
here for any future line so the storyteller never splits in two again. Old wavs kept at
`_vo-backup-oldvoice/` (repo root, outside the robocopy tree). NARRATOR_VO now lists all 16.
- ✅ **NARRATOR_NG RECORDED (2026-08-04, ~24cr)**: all 16 second-night lines in the same
  Alistair preset, installed as `assets/audio/vo/<key>-ng.wav`; `NARRATOR_NG_VO` Set in
  data.js gates them and `narrate()` routes ngLine → `<key>-ng.wav`, first night →
  `<key>.wav`, so the voice always reads the sentence on screen. The old "NG beats are
  text-only" suppression is gone. Verified live: mega→mega.wav, ng mega→mega-ng.wav,
  muted→no request, all 16 files GET 200. ⚠️ seed_audio rate MOVED again: measured
  **~0.15cr/s** (1.5cr for a 9.8s line) — double the 07-27 rate. Also ⚠️ Seed Audio hit
  429 rate-limits when two sessions generate at once — pace batches ~12s apart.
- ⚠️ the dev `serve.ps1` answers **HEAD with 500**, so an asset-existence probe must use
  GET — a HEAD sweep reports every file missing and looks like a catastrophe.

**Narrator.** Five new beats for moments that used to pass silently — `tribewon`,
`tribelost`, `strayhome`, `catswat`, `wallbreach` (all with NARRATOR_NG second-night
variants), wired at their event sites in game.js. ⚠️ `narrate()` was fetching
`assets/audio/vo/<key>.wav` for EVERY beat, so the unvoiced `foothold` had been 404ing
in production. New `NARRATOR_VO` Set in data.js lists the 10 beats that actually have a
recording and gates the fetch — verified both directions (voiced beat → 200, unvoiced →
no request at all). **Add a beat's key to NARRATOR_VO only when its .wav exists.**
VO is billed per SECOND, so new beats ship text-only by default.
Barks: `galleon` filled the last real gap (`forgotten`/`forgottenking` are AI-only
survival enemies — never selectable, so barks there would be dead content).

**"Why did I lose?"** `endGame(winnerTeam, reason)` now carries the rule that fired
(`elimination`/`throne`/`wonder`/`relics`/`overrun`/`dawn`) through `cb.gameOver` to a
new `#go-cause` line under the epilogue. The old defeat text hardcoded "your buildings
have fallen", which was simply WRONG in regicide/koth/wonder/relics. The elimination
copy branches on `gameMode` so Sudden Death and Regicide read correctly. An untagged
end hides the line rather than printing a stale one.

**Accessibility** (pause menu, persisted in `tt-settings`):
- 👁️ **Colourblind flags** — `TEAM_PALETTES` in main.js swaps TEAM_COLORS to Okabe-Ito
  (`0x0072b2/0xd55e00/0xf0e442/0xcc79a7`); the default green+vermillion pair collapses
  under deuteranopia/protanopia. Mutated IN PLACE because every module holds the same
  array reference and materials bake colour at build time — so it applies from the NEXT
  battle, and the toggle says so instead of looking broken.
  ⚠️ Four objective markers (tribe camp flag ×2, sticker holder, KotH throne) had the
  team colours HARDCODED in game.js and were missed by the palette — exactly the markers
  you read at a glance. All four now read TEAM_COLORS. The throne's lighter `0x4d9bff`
  became TEAM_COLORS[0], a small deliberate shade change in default mode too.
- 🔠 **Text size** 100–150% — `--ui-text` drives `zoom` on self-contained text panels
  (`#alerts,#dlg-bar,#objectives,#gameover,#tutorial,#gm-card`). **`#hud` is deliberately
  excluded** — it is anchored/absolutely positioned and zooming it breaks the layout.
Verified: determinism, MP lockstep 2h+2ai & 3h+1ai, all 7 cause strings per mode,
palette reaching a real capture via `updateCamp`, console clean.

## The six features above are BUILT (2026-07-12) — how they actually work

1. **NG+ ("The Second Night")**: `ngActive` in main.js (localStorage `tt-ng-active`), progress
   in `tt-campaign-ng`; toggle button renders in `#cm-progress` once `baseCampaignAllDone()`
   (which EXCLUDES `needsAllStories` missions). NG = startRes tier-down map (marathon→high→
   standard→lean; `lean` is a real START_RES tier now, mult 0.5), enemyBoost +0.3 stacked in
   applyMissionMods (boosts by TEAM, not id — allies stay honest), `g.ngPlus` drives
   NARRATOR_NG variant lines in game.js narrate().
2. **Replays ("The Bottled Story")**: SP now runs the SAME fixed 20Hz TICK accumulator as MP
   (`spAccum` in main.js loop + hidden-tab path) — **variable-dt SP is GONE**; this is what
   makes SP deterministic. Game tracks `this.frame` (completed updates); `issue()` records
   `{k: frame, c: cmd}` into `g.cmdLog` (fresh SP only; null on restore/MP/replay). Auto-saved
   at gameOver to `tt-replay-last` with dataHash (djb2 of data.js text), seed (`g.seedUsed`),
   resolved factions + pinned playerDefs. `#replay-btn` on the menu → `startReplay()` →
   `replayLaunch` plumbed through startGame → Game opts.replayLog → feed executes commands
   by frame at update() top; issue() is inert during playback (user can still select/camera).
   Verified byte-identical: fingerprint at frame 4600 matched exactly. Version mismatch = polite refusal.
3. **Touch controls**: pointerType-gated in main.js (no media query): tap select, quick-swipe
   pan, hold-150ms-then-drag = box select, long-press 500ms = contextual command (shared
   `contextualAt()` with the contextmenu handler), two-finger pinch = `cam.tdist`, edge-scroll
   off for touch (`lastPtrType`).
4. **2v2 campaign**: mission `allies:[{faction}]` / `foes:[{faction}]` → startGame builds the
   4-seat playerDefs (team 0 = you + allies). Mission 17 `alliance` (secret, after midnight):
   you+knights vs bots+bricks on livingroom. Campaign list + briefing render multi-crest sides.
5. **Fog integrity**: `g.seenByMyTeam(x, z)` (sim-side vision scan) gates the wonder alert
   pings — message always fires, map ping only with honest vision.
6. **Toy Box Zero**: mission 18 `zero` (secret + `needsAllStories` — the ORIGINAL 21 stories;
   achievements marked `beyond: true` don't count toward the gate). `zeroEra` flag →
   `setProceduralEra(true)` in models.js (units + buildings render procedural) + 'sepia'
   lighting preset in applyMapLighting. Sudden Death, lean, Greenboots-vs-Snug prequel prose.
   No briefing plate yet (credits ran out — `assets/campaign/zero.jpg` auto-hides; generate one
   when topped up, sepia prompt in session notes).

Chronicle has 25 stories now (21 core + 4 `beyond`: secondnight/together/pagezero/act4).
**Campaign is 28 missions (2026-07-20): 25 open (Acts I-V, five each) + midnight + alliance
+ zero.** ⚠️ **ACT V — THE KINGDOM ARRIVES** (indices 20-24, all `beyondTrilogy: true`):
unboxing(bookshelf/knights-v-classic/standard) → portcullis(canyon/v-bots) →
carpetkings(livingroom/v-plush/koth) → oldguard(sandbox/v-classic+plush foes/sudden) →
hearth(garden/knights+classic ALLIED v racers+bots/koth). The knights' chapter: they are a
NEW TOY (a boxed castle), the theme is the fear of being replaced, and it resolves into
family — mission 4 fights the old guard, mission 5 fights BESIDE them. Every map is
terraced/chokepointed because the 07-20 battery proved that's the knights' real identity.
Inserting at 20 SHIFTED the secrets to 25/26/27 — `ACT_HEADERS` updated (20 = Act V,
25 = After the Trilogy) and `ACT_CLOSERS` gained `hearth: 5` + a bookend page 5. NG+ gate
is untouched (beyondTrilogy is excluded — verified 16 gating missions, none from Act V).
**Plates DONE (2026-07-27, 10cr)** — unboxing/portcullis/carpetkings/oldguard/hearth all
generated + installed at 900×600 JPG q86. **Every mission in the campaign now has a plate.**

## THE GREAT OUTDOORS (2026-07-12, Kyle's B+C pick — A built as the dependency)

- **Irregular map shapes**: `MAPS.<k>.mask` = {type:'ellipse'|'kidney', rx, rz, bx?, bz?, br?} —
  pure `maskAt(mask,i,j,N)` in data.js shared by game.js (marks outside tiles `blocked` FIRST
  in setup) and models.js createGround (paints outside as deck/wild-lawn + rim stroke; the
  mat canvas mask painting must never be replaced by generated ground art — loader is skipped
  when mask present). Masks are sized to always contain the start ring (R=N/2-8 since
  2026-07-18 (second push the same day; was -10, before that -15), diagonal seats at ±19.8
  tiles → 1v1 seats (16,56)/(56,16) flush against the [11,56] clamp, chests +2;
  was N/2-15/±14.85 — Kyle wanted corner bases so maps feel bigger; masks were GROWN the same
  day for the same reason: sandbox kidney rx35 rz33 bite br10/bz-30 (was 33/27/12/-26, ~47%
  open → 58%), oldoak ellipse rx35 rz34 (was 34/29) — Kyle's rule: every map uses the full
  mat unless off-limits ground is thematic; rims stay as thin borders. ~8 tiles of diagonal
  start margin remain). addResourceNode already rejects blocked; the obstacle loops got a
  `rectClear` blocked-guard (no-op on classic maps).
- **Rolling terrain**: `dunes:{count,rMin,rMax}` = wobbly mounds wearing 3-band collars
  (E → 2E/3 → E/3, every step ≤ CLIMB 0.3 — walkable from ANY direction, no ramps needed);
  `centerHill:{r}` = deterministic 2-level hill at map center (same collar math);
  `roots: true` + centerHill places the 4×4 'oak' obstacle at the summit + radial root walls.
- **Ridge walls / chokepoints (2026-07-18)**: `ridges:[{i1,j1,i2,j2,w,gaps:[{t,w}]}]` in tile
  coords — AUTHORED (no rng) steep crests: core = E*2.2 + blocked (a natural wall — steps >
  CLIMB), skirt+gap tiles = E/3 walkable. In-code guards skip already-blocked tiles and
  clearHomes(14), so bad authoring can't wall a doorstep. **Ridges lay down FIRST** in the
  terrain section (before plateaus/dunes/hills, which all skip blocked tiles now — plateau
  center pick + fill/ramp/crown loops got blocked-guards). `snapToLand` also escapes BLOCKED
  tiles (not just water), so KotH thrones/stickers slide off crests to the nearest free tile.
  models.js `paintRidges` + `RIDGE_LOOKS` palettes paint each map's walls in its own material
  from the SAME mapCfg.ridges (3-layer shadow/body/crest ellipses, gaps unpainted; livingroom
  adds threaded baubles) — paint and walls always agree. Ground-PNG maps (underbed) composite
  the art INTO the canvas then repaint ridges on top (loader no longer swaps the map when
  ridges exist). **Themed layouts (5 maps)**: sandbox = 3 sand walls (central main-diagonal +
  wing walls; seats sit on the ANTI-diagonal (18,54)/(54,18) — get this right or the wall is
  parallel to the seat axis and useless); underbed = 2 staggered lost-laundry rows (S-bend);
  playground = 2 clipping windrows + open central boulevard; kitchen = 1 gentle spilled-flour
  line, single wide central pass (kitchen stays the open-pool map); livingroom = 1 fallen
  garland across the tree skirt, 3 sagging gaps. All point-symmetric for fairness. NOT ridged
  on purpose: playmat (the pure-open flagship), canyon/bookshelf/garden/oldoak (already
  terraced), attic (war table), bathtub (naval). Verified: paths thread gap centers, koth on
  wall-center maps clean, same-seed fp identical, 0 errs. ⚠️ Sandbox+underbed+livingroom
  likely play "terraced" now — re-pool before the next balance battery.
- **Ground depth (2026-07-18)**: every mat + floor MeshStandardMaterial gets a bumpMap
  derived from its own canvas/PNG (grayscale+contrast copy, `bumpFromCanvas` in createGround;
  bumpScale 0.4 mat / 0.35 floor) — plank grain, grass blades, carpet pile catch light as
  relief. Painters upgraded: playground grass = layered leaning blade strokes + clover;
  livingroom carpet = diagonal vacuum nap bands + directional pile + worn path; kitchen wood
  = wavering two-tone grain streaks + ringed knots.
- **Ground ART + hillshade (2026-07-18, 12cr)**: 9 of 11 map grounds now have nano art
  (added ground-{sandbox,bookshelf,playground,kitchen,livingroom,oldoak}.png at 1k, 2cr each;
  garden + bathtub still canvas — garden's a candidate when topped up). Kyle's call:
  **masked/ridge COMPOSITE mode >> pure replacement** — the loader draws art as base coat,
  then paintMaskBorder() + paintRidges() + hillshade repaint on top (only bookshelf + the
  legacy 3 art maps are pure swaps). `shadeGroundByHeight` (models.js, called in game.js
  setup after applyTerrainToGround): bakes NW-light hillshade from the REAL height grid
  into the ground texture (offscreen tile-shade layer, blur(6px), then over the map; art
  textures get baked to canvas first). View-only, no rng — determinism re-verified. The
  loader's `groundMat.userData.reshade` re-applies shade after async art composite. Art
  prompts must describe the map's painted gameplay markings (track/placemats/tree skirt)
  so the art keeps the map's identity; vet via montage before adopting.
- **MAP LIFE Tier 1 (2026-07-18, free — Kyle's AoE-alive pick)**: (1) **Cloud shadows** —
  setupWeather adds 4 drifting soft-blob shadow planes (y≈0.07, depthWrite off) on outdoor
  maps + playground; drift in updateWeather (runs in BOTH loops already). (2) **Critter
  menagerie** — CRITTER_TYPES in data.js (mouse/crab/snail/candy/ant = capturable;
  bunny = flee, uncatchable; moth = orbit, flies over cliffs; duck = water, befriend from
  dry land, waddles home once captured); MAPS.<k>.critters = [{type,count},...] per-map
  casts (garden has TWO types); createCritterView(type) procedural variants; snapshot
  carries type+hx/hz now (restore used to hardcode 'mouse' — fixed). (3) **Lost Toys** —
  LOST_TOYS in data.js: 5 neutral strays/match (jack/domino/marble/bottlecap/crayon,
  createLostToyView), placed wide + clear of doorsteps; a WORKER (⚠️ identified by
  def.gatherRate NOT def.gather — that bug ate the first test) within 1.4 tiles auto-carries
  (rides along, no order hijack, u.carryLost), bounty +80 buttons pays when the worker next
  passes its OWN chest; carrier death drops the toy in place; stats.strays; full snapshot
  round-trip incl. carrier relink (byte-identical verified). Verified: 8-map soak battery
  0 errs, determinism 4 maps post-fix, pickup→carry→payoff numeric, bunny fled 3.3 tiles,
  save round-trip. AI doesn't SEEK strays (workers stumble on them; human edge — like
  Empire cards, the SP fantasy).
- **MAP LIFE Tier 2 (2026-07-18, free)**: (1) **Indoor weather** — new setupWeather kinds:
  'motes' (playmat/canyon/underbed/attic/bookshelf — hovering twinkle dust), 'steam'
  (kitchen — rising fading curls), 'bubbles' (bathtub — wobbling up), 'glitter'
  (livingroom — slow gold/silver flecks); keys in MAPS.<k>.weather. (2) **Room-tone
  ambience** — startAmbience kinds 'room'/'study' (hush+clock tickTock+creak), 'kitchen'
  (fridge hum+drip), 'tv' (bandpassed murmur w/ speech-swell LFO), 'tub' (echo drips),
  'attic' (rain-on-roof highpass+gust LFO+creaks), 'dark' (deep hush+52Hz house hum);
  breeze base is now OUTDOOR-ONLY; wiring in startGame via AMB_BY_GROUND (playground →
  'day' birdsong; zeroEra stays silent). (3) **Flyovers** — weather.flyKind: 'planes'
  (sandbox/playground/playmat/attic — 3-dart paper squadron, y≈7.5, 16s crossing, every
  45-105s) / 'butterflies' (garden — 2-3 flappers, low+wandering, 34s); forced-spawn via
  `window.__ttWeather()` debug handle (set flyT=0.1). All view-only Math.random; verified
  per-kind live (ambKind + particle counts + flight motion), soak determinism unaffected.
- **MAP LIFE Tier 3 (2026-07-18, +32cr)**: (1) **Sand trails** — setupTracks/updateTracks in
  main.js (both loops): 512px overlay plane y=0.045 on sandbox only; 8Hz stamp of moving
  units (critters smaller) + destination-out fade (~30s). View-only. (2) **Hero landmark
  system** — MAPS.<k>.landmark {kind,i,j,size} → addObstacle placed BEFORE random obstacles;
  sandbox sandcastle 3×3 at (33,18) (⚠️ first authoring at (33,15) was INSIDE the bite circle
  — check bite distance, not just the ellipse). 'sandcastle' in MAP_MODEL_KEYS → GLB at
  assets/map/sandcastle.glb auto-swaps over the procedural three-tower fallback (both built).
  GLB via nano (2cr) → image_to_3d (30cr) → fix-all.mjs diet 8.3MB→683KB (the gltf-tools live
  in the ca792b27 SCRATCHPAD — still on disk, manifest format: [{src,dst,webp}]).
  (3) **Balance re-pool battery (60 games, knights-vs-field, seed 31)**: sandbox knights 7/10
  = TERRACED now (move it in the pools); kitchen 2/10 (stays open); underbed/livingroom/
  playground/playmat 3-4/10 = gentle, keep pools. 0 errs. Single-seed = directional only.
- **MAP LIFE Round 4 (2026-07-18, free — "more life still")**: (1) **WILD TOY TRIBES** —
  WILD_TRIBES in data.js; MAPS.<k>.tribes = 2 on playmat/sandbox/garden/oldoak/playground/
  underbed/attic (NOT bathtub/survival); neutral campfire camps (createCampView: tent/fire/
  3 wild toys/grey pennant, setOwner tints the flag) placed as POINT-MIRRORED pairs at the
  midfield ring (fairness); kind 'camp' entity, sticker-pattern hold scan: MILITARY ground
  toys (no workers/naval) uncontested for 8s → tribe joins the LOWEST pid present (progPid —
  snapshotted, or a save at prog 7.9 pays the wrong player): spawns comp ['scout','soldier',
  'soldier'] + 60 buttons + stats.tribes. Snapshot k:'w' round-trips (verified byte-identical
  incl. captured flag tint on restore). Lore hook: doorstep brief's "teach them the flags".
  (2) **5 new critters**: ladybug (capturable 40), goldfish (water 70), spider (flee 2.0),
  bee (orbit), beetle (capturable 60); most maps have 2-3 species now (garden has 3).
  (3) **Attic ridge**: toppled-atlas wall (26,26)-(46,46) gaps t.3/.7 w6 + attic RIDGE_LOOKS
  (aged paper/leather) — the war table has ONE gentle spine now. Verified: 8-map soaks 0 errs,
  det ×3, live capture (1 soldier held → 3 units joined +60), mirrored placement, console clean.
- **MAP LIFE Round 5 "reactive" (2026-07-18, free)**: (1) **THE HOUSE CAT** — HOUSE_CAT in
  data.js; one per land map (bathtub `cat: false`), kind 'cat' entity: walk/nap state
  machine (naps ANYWHERE incl. chokepoints, view.setNap curls her), SWATS lone toys
  (swatRadius 2.1, 9 dmg + 1.8 knockback, 6s cd — "lone" = no same-team toy within 4;
  kill(e, null) is null-killer-safe), untargetable owner -1. ALL critters scatter within
  3.5 (scatter check runs before flee/capture branches in updateCritter). Snapshot k:'ct'
  {state,stateT,swatT,facing} round-trips + restore re-curls nappers. (2) **Battle scars**
  — setupTracks now runs on EVERY map: sandbox keeps fading footprints; other rooms
  accumulate permanent WEAR (per-ground WEAR_COLORS, low-alpha trample builds visible
  paths over minutes; the cat leaves the biggest prints) + razed buildings paint a
  radial-gradient SCORCH + flung debris (deadSeen set, never fades). (3) **Deepening
  night** — setupNight snapshots all lights' base intensity/color/position; updateNight
  (both loops) lerps by game.time toward NIGHT_TINT 0x6a7ab8, −30% intensity, moon-arc
  rotation of directionals; full depth ~20 sim-min; zeroEra exempt. Verified: 6-map
  soaks 0 errs, det ×2, swat exactly 9 dmg + knock on a LONE toy only, critter scatter,
  nap transition, save round-trip byte-identical w/ cat, scorch pixels painted on kill,
  light dimmed 1.6→1.36 at t=1200. ⚠️ the cat is a SIM ACTOR — she consumes rng every
  update; any cat change is an MP/replay-affecting change.
- **MAP LIFE Round 6 "living world" (2026-07-18, free)**: (1) **Positional audio** —
  sfx.setListener(camX, camZ) fed from both loops; playAt(name, x, z) pans (±0.8 by dx/24)
  + attenuates (1/(1+d/18), silent >55) via a StereoPannerNode threaded through tone()'s
  _spat state; combat call sites converted (attack impact at target, death squeak/material
  at the fallen toy, building crash, splash thud). (2) **Living bases** — setupBaseLife/
  updateBaseLife in main.js (both loops, 1Hz scan): production buildings with a live queue
  puff recycled chimney smoke; house-type buildings get an additive window-glow sprite
  whose opacity = nightF (updateNight now writes module-level nightF) — verified glow 0.25
  at deep night + smoke on busy chest. (3) **Smarter fauna** — ants (uncaptured) patrol a
  real trail home↔spill (hx*0.35 toward center, c.trailFlip toggles, serialized as `tf`
  in the critter snapshot for restore fidelity); orbiters (moth/bee) take rng feeding
  pauses; fireflies spawn clustered (span*0.45) near the oak. ⚠️ TEST GOTCHA that burned
  this session twice: NEVER push a def-less fake entity into game.entities — every sim
  system reads e.def and the whole tick loop dies; clone a real def. And remember the
  console buffer RETAINS errors across navigations — verify with a live console.error
  hook, not the buffer.
- **MAP LIFE Round 7 "showstoppers" (2026-07-18, free — the alive-maps roadmap is DONE)**:
  (1) **THE KID** — pure view spectacle (sim never knows; headless soaks never see it):
  every ~7-12 min (then ~9-16), footsteps (sfx.footsteps) → colossal soft shadow sweeps in
  → a giant procedural hand (palm + 4 fingers + thumb, skin 0xe8b48c) descends from y44 →
  GRABS a decor item (game.js tags decor `userData.decor`; the mesh just goes invisible)
  → lifts away; alerts bookend it; shakeCam beats; zeroEra exempt. Debug: `__ttKid()`
  (set .t=0.1 to summon; phases foot→shadow→descend→grab→lift verified + decor 13→12).
  (2) **The room remembers** — setupTracks ghosts last session's wear in at 35% alpha
  (localStorage `tt-wear-<ground>`, saved at gameOver as a 256px dataURL, non-fading maps
  only) so it decays naturally over a few nights instead of blackening; verified full
  round-trip across reload (882 ghost px at a known mark). ⚠️ verification gotcha: sample
  the canvas where you PAINTED (a wrong-region read produced a false negative first).
- **MAP LIFE Round 8 "the whole menagerie" (2026-07-20, free)**: (1) **THE YARD DOG**
  (YARD_DOG in data.js) — outdoor predator on playground/garden/oldoak/sandbox (those maps
  now `cat: false, dog: true` — dog & cat never share a lawn). kind 'dog': trot→chase→rest
  state machine; spots the nearest MOVING unit/critter within chaseRadius 15, GALLOPS
  (runSpeed 2.0) at it, pounces (6 dmg + 2.8 knock) then flops to rest; barks (playAt);
  view.setGait(run) swaps trot↔bound. Critters scatter wider from a dog (4.5) than a cat
  (updateCritter scatter now picks cat||dog + per-beast radius). (2) **THE ROOMBA** (ROOMBA
  in data.js) — dumb indoor hazard on playmat/livingroom/kitchen (alongside the cat). kind
  'roomba': straight-line trundle, reflects heading + rng scatter on hitting blocked/water/
  edge, SHOVES any bumped unit 1.7 along its heading (no damage), whirs (playAt). (3)
  **Seasonal skins** (main.js, view-only) — season from `new Date().getMonth()`: winter
  snow / spring petals / autumn leaves drift on outdoor maps + a fog color-grade per season;
  `__ttSeason(key)` forces one (today=summer has no drift). ⚠️ pets are SIM ACTORS (consume
  rng — MP/replay-affecting). Spawn scan is ring-first then a deterministic full-board
  fallback (oldoak's hill/roots starved the 40-try ring — a pet that never spawns is a bug).
  `__ttKid`/`__ttSeason` debug handles. Verified: 8-map soaks 0 errs, det ×3, dog pounce
  6dmg+knock+rest, roomba shove 1.7 + stays in-bounds, both save-round-trip, 34 snow
  particles forced, console clean.
- **SURVIVAL game-over card + achievements (2026-07-20, free)**: `survivalGameOver(win)` in
  main.js (branch in the gameOver cb when `game.gameMode==='survival'`) replaces the rival-
  column card with a Long-Night card: ☀️ DAWN / 🌑 OVERRUN title, a wave-progress bar (held/
  dawnWave), a rival-free tally (waves held, furthest wave, Forgotten unmade, toys lost,
  resources, time), and a themed retelling. 3 new beyond achievements in chronicle.js:
  firstlight (bestWave≥6), seenthedawn (survivalWon), longestnight (bestWave≥3 & 0 losses).
  ⚠️ LIVE survival test path: navigate `?mode=survival&start=hard&map=playmat` (the URL
  AUTOSTART block at ~line 249 is the ONLY place a `mode` param sets chosenMode — a bare
  `__ttStart` ignores it). Soak needs explicit `playerDefs:[{team:0,isAI:true,faction},
  {team:1,isAI:false,den:true}]` + gameMode:'survival' + survivalDawn (bare gameMode alone
  leaves g.survival null — the den seat is what triggers setupSurvival). Verified: win+defeat
  cards render, all 3 achievements fire on the right predicates, survival sim deterministic,
  console clean. (Stock AI defender is still weak — the CARD is the fix; real wave tuning
  wants a human playtest, as the SURVIVAL block notes.)
- **HARDENING SWEEP (2026-07-20, free)** — deliberate cross-system bug hunt after the big
  map-life/Empire day. **Found + fixed one real bug:** `zeroEra` was never referenced in
  game.js, so **Toy Box Zero spawned a house cat, a ROBOT VACUUM and 2 wild tribes** into
  the sepia prequel — directly contradicting its own briefing ("no tribes, no names for what
  they were feeling yet"). Pets + tribes are now `!this.zeroEra`-guarded (critters + lost
  toys deliberately KEPT — organic/timeless, not contradicted). ⚠️ `game.zeroEra` is set at
  main.js:2075, exactly ONE line before `game.setup()` — that ordering is load-bearing.
  New QA hooks: `__ttSoak` accepts `zeroEra:true` (mirrors the survivalDawn hook) and now
  returns `kinds` (live entity census by kind) so tests can assert what populates a room.
  **Everything else passed:** byte-identical save with cat+roomba+2 camps+5 strays (one
  MID-CARRY)+critters coexisting; MP lockstep `inSync === true` w/ clients agreeing on every
  pet map incl. a mid-match guest drop (pets consume rng — this was the critical invariant);
  survival×pets; dog-chases-CRITTER (pounce is `prey.kind === 'unit'`-guarded, no undefined-hp
  math); pets stay on legal tiles on masked maps; 11/11 maps soak clean; zeroEra deterministic;
  10s live all-systems run w/ a console.error hook = 0 errors. ⚠️ verification lesson: `r.inSync
  !== false` reads TRUE when the field is undefined — assert `=== true` on harness returns.
- **Art backlog CLOSED (2026-07-18, +14cr, total 26cr today)**: Act IV briefing plates ×5
  (doorstep/dunes/gardenwar/washout/oakcrown) + the sepia zero.jpg + ground-garden.png ALL
  generated + installed — every campaign mission has a plate now, all 11 map grounds have
  art. Plate recipe: read one existing plate for style ("soft gouache storybook"), 3:2,
  prompt from the mission brief's actual imagery, convert PNG→JPG q86 via System.Drawing.
  Balance after: ~229cr (was 254.9 at session start; nano = 2cr/image steady all day).
- **Nature library** (createObstacleMesh kinds): tree/oak/rock/sunflower/roots/bucket/shovel;
  (createDecorMesh kinds): grass/mushroom/daisy/pebble/seashell. Flora carries
  `userData.sway` (amp) — the weather system animates rotation.z around the base.
- **Outdoor maps**: sandbox (kidney + dunes + 'day' sky), garden (terraces + sunflower
  `groves:{kind,count}` + 'gold' sky), oldoak (oval + centerHill + roots + 'dusk' sky).
  Outdoor styles skip the room walls entirely (OUTDOOR flag in createGround) and have their
  own surrounds (watering can/glove/house-wall; fence/pots/gnome/trellis; distant-house/
  porch-light/hedge/wheelbarrow). Lighting presets 'day'/'gold'/'dusk' in applyMapLighting.
- **Weather (view-only)**: `MAPS.<k>.weather` = 'rain'|'seeds'|'fireflies' → setupWeather()
  after game.setup() in startGame; updateWeather(dt) in BOTH loops. Wind sway collects all
  userData.sway nodes. The sim NEVER reads weather.
- **Act IV "The Great Outdoors"** (missions 16-20, ids doorstep/dunes/gardenwar/washout/
  oakcrown): the Bun-Bun rescue. gardenwar = knights' first campaign outing (koth);
  washout = 2v2 alliance sudden-death. All Act IV + alliance + zero carry
  `beyondTrilogy: true` — **NG+ and the "book done" checks exclude beyondTrilogy pages**
  (the original 16 gate NG+; new content never re-locks it). `missionUnlocked`: a DONE page
  never re-locks. ACT_HEADERS keyed by index: 0/5/10/15/20. NO plates yet for Act IV
  (auto-hidden; generate 5 when credits allow).
- The `map-row` and `fac-row` in the HTML are now GENERATED from MAPS/FACTIONS — never
  hardcode those lists again (the knights-invisible bug).
- Replay stamp now hashes data.js + game.js together.

## Campaign immersion suite (2026-07-12, Kyle's A+B+C+D pick)

- **Dialogue**: MISSION_EVENTS beats carry `speaker` (faction key → commander portrait+name,
  or 'narrator' → 📖 The Storyteller) — game.js routes them to `cb.dialogue` instead of
  alert; `#dlg-bar` (main.js showDialogue, queued, auto-timed by length). Every beat in all
  23 missions is voiced; banter added (Hector/Greenboots washout+alliance, Nitro/Hector
  gardenwar). `focus: true` on a SPAWN beat = camera moment.
- **Camera moments**: cb.focus → cameraMoment(x,z): 0.6s glide, 1.3s linger, 0.6s home;
  any pointerdown/WASD cancels. ⚠️ Lives in BOTH loops — the Browser pane runs pages with
  `document.hidden = true`, so anything only in the rAF loop is INVISIBLE to verification
  (and to hidden tabs). Put per-frame view systems in the hidden setInterval path too.
- **Objectives chip**: `#objectives` (main.js updateObjectives, 0.5s cadence, read-only):
  mission objective or mode label + live state (rival buildings left / throne countdown vs
  KOTH_HOLD 120 via holdTeam / kings / chests).
- **Living briefings**: showBriefing stages — Ken Burns drift on the plate (#bf-art-frame
  wrapper), typewriter brief (click anywhere completes), `CMDR_LINES[missionId]` war-table
  quote (data.js, all 23), objective stamp + sfx.
- **Act bookends**: ACT_CLOSERS {finale/shelfking/wayhome/oakcrown} → showBookend once per
  act (localStorage tt-bookend-N), parchment page-turn overlay with stats-derived recap.
- **Expedition Journal**: every campaign game-over appends to tt-journal (auto-composed
  diary from time/kills/losses); read via 📖 Journal button on the campaign screen
  (showingJournal state swaps cm-list).
- **Veterans**: campaign WIN stores up to 3 surviving military types → tt-vets; the NEXT
  campaign mission spawns them at home with kills=3 + rank badge (applyMissionMods,
  deterministic-safe like mission.bonus), then the record is spent.

## Pathfinding (2026-07-12 fix — read before touching PathFinder)

`PathFinder.find()` is a **multi-goal A***: when the destination tile is blocked (resource
piles, building footprints, walls — they all mark `blocked`), the goal set is EVERY free
tile of the nearest free ring around the target (radius up to 10), and the heuristic is
octile-to-center relaxed by `ringR * 1.414` (stays admissible for every ring tile → the
search picks the side that is genuinely closest BY PATH). The pre-fix code pre-picked ONE
ring tile via `nearestFree` scan order (top-left bias), which sent workers around piles —
and around entire wall lines — to an arbitrary far-side tile. Ground-truth tests that must
keep passing: wall-detour path ends adjacent to the pile; knocking a hole in the wall
shortens the path AND the path threads the hole; a worker south of a pile paths 1 step to
the south face. Same-seed soak determinism verified after the change (heap ties are
deterministic; goals Set is only membership-tested).

## EMPIRE MODE (2026-07-14, from Kyle's 53-page Design Bible PDF): Phase 1 slice SHIPPED

Kyle supplied `Toy_Box_RTS_Empire_Mode_Design_Bible.pdf` (53 pages; text extraction lives in
the session scratchpad; §23 is a master build prompt). Docs at repo root:
`EMPIRE_MODE_ARCHITECTURE.md` (integration note + BattleContext/BattleResult contracts) and
`EMPIRE_MODE_CHECKLIST.md` (every task mapped to a bible section — READ IT before Phase 2).
- **Files**: `toybox/empire-data.js` (ALL content: 12-node Appendix-A board, routes, garrison
  templates, upgrades, economy constants) + `toybox/empire.js` (`Empire` = pure deterministic
  campaign sim, `EmpireUI` = SVG board screen; deliberately separable). Menu: `#home-empire`
  → `openEmpire()`; overlay `#empire` in the HTML.
- **The loop**: node-graph armies (MP 3, road 1/rough 2), Parts economy, unit-card rosters
  (strength% + vet pips; casualties persist), neutral garrisons by node type, encounter →
  preview band (Overwhelming…Desperate) → Play / Simulate / Withdraw, capture loot, three
  upgrades, Dominion victory (7/12 + a fort) / capital loss / turn-24 sunrise. AI seat plays
  the same rules (recover→recruit→defend→expand, attacks only when Favored).
- **RTS bridge**: `empireBattleContext()` consulted in startGame (map=node biome, mode/startRes
  from template, seed pinned per-encounter); rosters spawn tagged `u.empireCardId` at each
  chest (strength → hp%); at gameOver main.js harvests tagged survivors →
  `Empire.applyPlayedResult(win, survivors)` → "Return to the Empire" button; boot auto-opens
  the map when `tt-empire.returnToMap` (same reload pattern as campaign — invariant 2).
  Simulated battles use a seeded formula on the SAME UNITS stats (±8% bounded, seed locked at
  encounter creation, never rerolled). Both paths share `applyBattleResult` (idempotent by encId).
- **Save**: `tt-empire`, written at every phase boundary; reload mid-battle-window resumes the
  encounter modal; an abandoned played battle voids `pendingPlay` (encounter re-offered).
- **Testing**: `window.__ttEmpire(seed, turns, script)` — headless, `persist=false` (NEVER
  touches the real save). Verified: same seed+script ⇒ identical stateHash; AI won a full
  campaign in 10 turns; full UI loop + played-battle round trip (77%-strength cards arrived
  at exactly 77% hp; survivors returned healed +6 by the next upkeep — that's the design).
- **Round 2 (same day) SHIPPED**: painted board art (`assets/ui/empire-board.jpg`, Higgsfield
  2cr), Power (⚡ cap 8) + Force March, binary supply (BFS to capital; half yield + no heal
  when cut; vacuum blocks supply too), second armies via Muster (tombstone-unique ids B0/B0_2 —
  a duplicate-id bug the determinism battery caught), The Vacuum house event (telegraphed →
  blocks a route 2 turns, seeded), node intel cards w/ adjacency scouting fog, roster-chip
  battle previews, WAAPI march animations, stats + victory screen, save v1→v2 migration in
  `Empire.load`. Save version bumped to v2.
- **Round 3 (same day) SHIPPED**: Imagination (💡) currency + the **Empire Tree** (4 branches ×
  2 tiers, prereqs, Parts+Imagination, `#e-tree` modal; effects relay/repairs/salvage/workshop/
  reserves/combined/kites/masterplan — Combined Arms applies to played battles too via
  BattleContext attMul/defMul). Second win route **Crown Victory** (hold ARCHIVE crownNeed=4
  turns; tracked in aftermath via tickCrown, recapture resets) + rival victory telegraphs
  (`turnsToWin`, `warned` one-shots, `winHow` on the victory screen). Master Plan reveals
  `s.aiIntent`; Scouting Kites = 2-route fog. Empire **audio** via `setEmpireHooks({sfx})` +
  `esfx()`. AI climbs the tree + contests the crown. Save bumped v2→v3 (migration in `load`).
- **Round 4 (same day) SHIPPED — Card Collection** (`toybox/empire-cards.js`): 16 unique named
  troop cards × 4 rarities (commons → legendary megas: tank/dragon/colossus/mamabear). Each
  card fields a REAL unit; mods are hp+vet, flowing into BOTH sim (`cardsPower` reads c.hp) and
  played battles (BattleContext attSpawns/defSpawns carry key+hp; main.js `dropRoster` applies
  hp mult). **Meta collection** persists across campaigns (`tt-empire-cards`; `emp.coll` — a
  throwaway when `persist===false` so tests never touch storage). Win a human battle → seeded
  `rollLoot(rng, quality)` grants a card (+scraps; discovery nodes = treasure chests); dupes
  melt to scraps; craft missing cards from scraps. UI: recruit **picker** (`showRecruit`, gated
  to owned cards), collection modal (`showCollection`, craft), `flashLoot` reveal, rarity-
  coloured army cards. AI recruits commons only (player's legendaries = the SP power fantasy).
  Save bumped v3→v4 (`load` gives old plain cards a fallback key). `__ttEmpire` return gained
  `cardsWon`/`lastLoot`; determinism re-verified incl. loot draws.
- **Round 5 (same day) SHIPPED**: the painted board art (`assets/ui/empire-board.jpg`, shipped
  round 2) is finally WIRED as an SVG `<image>` backdrop (0.62 opacity + 0.28 dark rect).
  **Stronghold/capital modules** (`E_MODULES`/`E_MODULE_SLOTS` in empire-data): Block Walls
  (+30% hold defence via `wallMul` in preview), Workshop (+8 Parts/turn in income + rest-heal),
  Watchtower (2-route scout in the node card), Barracks (`canRecruitAt` → recruit off-capital).
  `buildModule` + node-card build UI + board `e-modmark`; AI fortifies its forts. AI recruits
  scale by turn (`aiRecruitKey`). Save v4→v5 (nodes gain `modules:[]`). ⚠️ vs a passive test
  opponent the AI wins before it develops forts, so headless rarely shows AI modules — human
  build path is fully verified; determinism holds (modules in stateHash).
- **Round 6 (same day) SHIPPED — onboarding & accessibility (§18, code-only)**: first-run
  How-to-Play guide (`showGuide`; `tt-empire-seen`; reopen via ❔ button or `?`), keyboard
  (`handleKey` attached on show: Space/Enter=End Turn, Esc=close→deselect→leave, C=collection,
  T=tree; battle-decision modal `#e-sim` guarded from Esc/Space skip), `prefers-reduced-motion`
  (skips token FLIP + loot pop), SVG node `<title>` tooltips.
- **Round 7 (same day) SHIPPED — Doctrines (§10, code-only)**: `E_DOCTRINES` (6 swappable
  strategic identities: scavenger/fortified/lightning/warrior/spymaster/dreamer), each a focused
  passive threaded into its system (ownerPowerMul, upkeep MP/imag, preview wallMul, capture,
  awardLoot, buyUpgrade, scouting, masterplan reveal). Slot 1 from start + slot 2 at turn 8;
  swap a committed slot for 2 Power (`setDoctrine`). 🎗️ modal + top-bar chip + `D` key; AI
  picks warrior→fortified. Save v5→v6; doctrines in stateHash; `__ttEmpire` gained
  doctrine/module script actions + `parts` in the return.
- **Round 8 (same day) SHIPPED — House events catalog (§5, code-only)**: the lone Vacuum grew
  into `E_EVENTS` (4 in empire-data.js): 🌪️ Vacuum (closes a road), 🐱 Cat on Patrol (closes a
  road + swats −20 strength, floor 10, off any army on either endpoint), 🔋 Low Battery Night
  (dims ALL Power income to 0 room-wide, no route), 🥤 Spilled Drink (closes a road + floods one
  endpoint node to half yield). One at a time; telegraphs a full turn (⚠️ + per-kind `warn` copy),
  active for `vacuum.duration`(2). `tickEvent` picks a seeded kind at turn≥`vacuum.earliest`,
  route only for `closesRoute` kinds; `blockedRoute()`/`floodedNode()` gate `openRoutesOf`+income,
  `upkeep` zeroes Power when `dimsPower`, swat/flood applied once at warn→active. Per-kind route
  icon + generalized banner + 🥤 flood marker (reused `.e-event`/`.e-ev-ic`/`.e-modmark`, NO new
  CSS, NO save-version bump — event state is transient, already folded into stateHash). Verified:
  0 errs / 1080 headless runs, all 4 telegraph, determinism holds, effects numerically checked
  (route-block, swat −20/floor 10, power 0 vs +1, CENTER flooded to half), live UI renders each.
- **Round 9 (same day) SHIPPED — Aftermath Spoils (§17, code-only)**: storming a capital/
  stronghold/crown (the `lootQuality===2` tier) as the human sets `s.pendingSpoils {node,armyId}`
  in applyBattleResult → a non-dismissable `showSpoils` modal offers ONE reward: 🔩 Salvage
  (+`E_RULES.spoils.parts` 45 Parts), ❤️ Regroup (heal the winning army to 100%), ⚡ Momentum
  (+2 Power, capped). `resolveSpoils(choice)` is a deterministic player choice (no RNG), idempotent.
  HUMAN-only (AI keeps its own economy — the SP power fantasy, like collected cards). Hooked after
  the last encounter (sim path) + in `show()` (resumes an unclaimed pick after a played-battle
  reload); `flashLoot` yields to it; guarded in handleKey (Esc/Space can't skip). `pendingSpoils`
  in stateHash (`sp:`) + save **v6→v7** migration (default null). `__ttEmpire` gained a `spoils`
  script action + `pendingSpoils` in the return. Verified: baseline unaffected, trigger fires,
  all 3 effects numeric, determinism holds (choice changes the hash), modal/keyboard-guard/save-
  round-trip/migration all live-checked, console clean. Reuses `.e-enc` CSS — no new styles.
- **Round 10 (same day) SHIPPED — Readiness meter (§11, code-only)**: per-army `readiness` 0–100
  (starts/musters at 100) — a UNIVERSAL tempo layer (both sides). Fighting a battle costs 34, a
  Force March 12; resting on a supplied friendly node recovers 26/turn (with healing). Effect:
  `readyMul = floor(0.72) + 0.28·(readiness/100)` — a spent army hits up to −28%. Threaded into
  `preview` (attacker→`attMul`, defender-army→`defMul`; garrisons full) and `simulate` reuses
  `p.attMul`; AI's `aiPickTarget` factors its own readiness so it won't throw a tired stack at a
  defended node. `tire()`/`readyMul()` helpers, `readiness` in stateHash + save **v7→v8** migration.
  UI: cyan readiness bar under each army token's strength bar + 💤 badge/tooltip when < 55, plus a
  "worn out" note on the encounter card. Constants in `E_RULES.readiness`. Verified: readyMul curve
  exact, preview softer when tired, tire/regen numeric, save round-trips, **40/40 deterministic /
  0 errors / all games conclude / AI still wins**, live UI present, console clean.
- **Round 11 (same day) SHIPPED — Mission-template variants (§7, code-only)**: `E_TEMPLATE_VARIANTS`
  gives each base template (field/siege/clash/station) 2–3 thematic variants (Dawn Raid/Supply Run,
  Midnight Assault/The Long Siege, Center Stage/Scramble, Power Struggle…). `createEncounter` picks
  one deterministically from a SALTED seed (`nodeId+armyId+'var'`, pure hash — no RNG advance),
  stored as `enc.variant`; `resolveTemplate(enc)` merges base⊕variant. **defBoost stays on the base**
  so preview/simulate odds + headless determinism are UNCHANGED — only the Played RTS match varies
  (gameMode/startRes/label/note). `preview`+`buildBattleContext`+encounter card use resolveTemplate
  (card shows bold label + italic note). No save bump (`enc.variant||0`). Verified: 30/30 seeds
  deterministic + 0 errs, siege variants keep 1.35 defBoost, pick stable + spreads, ctx reflects
  the variant, live card + console clean.
- **Round 12 (same day) SHIPPED — More modules + Citadel (§8, code-only)**: two new build-socket
  modules — 🔌 **Power Cell** (`power_yield` +2 Power/turn while supplied, the first module source of
  Power) and 📚 **Dream Library** (`imag_yield` +3 Imagination/turn, first module source of Imag) —
  threaded into `powerIncome`/`imagIncome`. The capital is now a **3-socket Citadel**
  (`E_MODULE_SLOTS.capital` 2→3); strongholds stay 2. AI fortify list → `walls→workshop→generator`
  (uses the 3rd slot). Node-card build buttons are generated from `E_MODULES` so both appear
  automatically; no save bump (`st.modules` already round-trips). Verified: 30/30 deterministic /
  0 errs, capital=3/stronghold=2, +2 power & +3 imag income, 4th socket rejected, AI builds the
  Power Cell, live card shows all six buttons + a click builds one, console clean.
- **Round 13 (same day) SHIPPED — Empire difficulty levels (§13, code-only)**: `E_DIFFICULTY` three
  tiers chosen at the start of a war — 🌛 Cozy Night (AI income ×0.75, timid band 1.70, easy battles),
  🌙 Lights-Out (×1.0, 1.35, normal), 🌑 Sleep Tight (×1.30, bold 1.12, hard). `diff()` accessor.
  `upkeep` scales the RIVAL's Parts income; `aiPickTarget` uses `diff().aiBand` (was hardcoded 1.35);
  `buildBattleContext` passes `diff().rts`. `setDifficulty` guarded to a fresh war (turn 1, unchosen);
  `s.difficulty`+`s.difficultyChosen` in stateHash (`df`) + save **v8→v9** (in-progress wars keep
  Normal, skip the picker; also fixed the stale fresh `v:6`→`v:9`). UI: `showDifficulty` picker (3
  cards, guarded) on a fresh war + New War, top-bar tier chip. `__ttEmpire` gained a 4th `difficulty`
  param. Verified: per-tier determinism + tiers diverge, income scales 19/26/34, rts easy/normal/hard,
  guard + save + migration, live picker/chip, console clean.
- **Round 14 (2026-07-18, THIS session) SHIPPED — The Third Flag (§15)**: 13th node
  **CAP_C 'Windowsill Keep'** (south, routes to CACHE/POWER/WORK_1) seats a THIRD faction
  (default war: bricks/classic/bots; E_FACTIONS gained colors for all 6). Seat count comes
  from `factions.length` — 2-seat saves stay 2-seat (v9→v10 migration adds relations/grudges/
  eliminated + a neutral CAP_C). `capOf(p)`, seats()/aliveSeats(); endTurn runs every AI seat
  (IGO-UGO); `autoResolveAiBattles` already handled AI-vs-AI. **Capital falls now ELIMINATE
  rivals** (armies boxed, war continues; human capital still ends it; last-alive wins).
  **Diplomacy**: Non-Aggression Pacts (E_RULES.pact: 4 turns, no passage — `reachable()`
  filters partner territory+armies), offer accepted unless you LEAD by 2+ (⚠️ the "desperate
  rival accepts anyway" clause shielded winners — caught by test, removed), break = −3⚡ −6💡
  + 6-turn grudge (aiPickTarget band −0.16 vs the betrayer), pacts/grudges tick in upkeep,
  `aiDiplomacy()`: rivals PACT WITH EACH OTHER when the human leads by 2+ (the gang-up).
  **Smarter rivals**: aiRecruitKey(p) climbs to rare/LEGENDARY cards at turn 16+; midgame
  doctrine SWAP (losing→fortified, winning→warrior, pays doctrineSwapCost). UI: 🕊️ pacts
  chip (P key) → diplomacy modal (offer/break per rival + rival-rival status), tri-count
  territory chip, army dx [-30,30,0], crown chip names the faction. `__ttEmpire` gained
  pact/breakpact script actions; relations/grudges/eliminated in stateHash. Verified:
  determinism, seeds diverge, pact-changes-hash, 3 campaigns conclude (seat 2 won one),
  6 mechanism unit-tests, migration, live 3-seat board + modal, console clean.
- **Round 15 (2026-07-18, THIS session) SHIPPED — Fight, Don't Sim (+2cr board art)**:
  (1) **New board painting** (nano 16:9 → assets/ui/empire-board.jpg 145KB): night bedroom
  war-map whose regions MATCH the node layout (blocks left, army camp right, windowsill
  robots bottom = CAP_C, book tower top = ARCHIVE, ruler bridge + bookends midfield); node
  halos r38, 🎲 rogue markers. (2) **Drill Yard** (`E_RULES.drill`, template 'drill'
  sudden/lean): army at YOUR capital → 🎯 button → pick a card (−15🔩) → a real encounter
  vs 2 sparring dummies queues into the battle window. Strength always restores to 100;
  **+1 vet ONLY on a PLAYED win** (sim earns no pips — the yard rewards showing up);
  `applyDrillResult` bypasses capture/tire/stats. (3) **Rogue Toys** (`E_RULES.rogue`,
  every 5 turns from t4, stays 4): seeded squat on a neutral non-capital node, tiered cards
  (raider/grenadier → +knight → +TANK at t16); `garrisonFor`-equivalent via encCards rogue
  branch; `lootQuality` returns 2 at the rogue node (premium card) + 20 scraps on a human
  win; AI reads rogue strength in aiPickTarget. (4) **Battle-hardened**: ANY regular played
  win → highest-strength surviving card +1 vet (cap 3). `__ttEmpire` gained {type:'drill'};
  rogue in stateHash; save v10 unchanged (rogue transient default). Verified: determinism
  w/ drill in script, drill sim vs played numerics (0 vet vs +1), rogue spawn/clear/bounty
  (+20 scraps + card), hardened +1 on played win, campaigns conclude, live UI (board art,
  drill modal 3 options, halos ×3), console clean.
- **Round 16 (2026-07-18, THIS session) SHIPPED — The Toy Kingdoms (+0cr)**: (1) **Every
  province upgradeable** — E_MODULE_SLOTS now ≥1 for ALL types (capital 3 / stronghold 2 /
  everything else 1) + ⚙️ **Scrap Mill** module (+5🔩/turn, 40 parts) so small holdings earn
  their keep; node-card build UI was already generated from E_MODULES so it appeared free.
  (2) **Fantasy-atlas board** — E_REGIONS: four named realms (Brick Marches W / Green
  Dominion E / Windowsill Reach S / Old Heartlands N), serif-italic realm labels tinted by
  MAJORITY holder ("— held by X —", regionOwner needs a true majority), parchment cartouche
  ("THE BEDROOM FLOOR — a night war of the toy kingdoms"), compass rose; node cards say
  "a province of <realm>". CSS in toybox-tactics.html (.e-region*/.e-cartouche/.e-compass).
  (3) ⚠️ **LATENT BUG FIXED**: buildModule + setDoctrine had `phase !== 'plan'` guards, but
  aiPlan runs during 'resolve' — so the AI had NEVER built a module (since R5) nor set a
  doctrine slot-2/swap (since R14) in real flow. Guards are now human-only (`p === 0 &&`).
  With the fix + a smaller mill buffer, real campaigns show rivals fully kitting citadels
  (walls+workshop+generator), milling 4 provinces, and running BOTH doctrine slots. muster/
  recruit never had guards (that's why those worked). Verified: real-flow AI builds, both
  rivals' doctrine pairs, determinism, campaigns conclude, live UI (4 realm labels, cartouche,
  compass, province line, 1-socket node card), console clean.
- **Round 17 (2026-07-18, THIS session) SHIPPED — The Full Political Toolkit (§15, free)**:
  E_RULES.diplomacy: **Trade Deals** (20🔩/turn ⇄ 2⚡ or 4💡/turn, 3 turns, collapses the turn
  either side can't pay, refused under a grudge), **Open Passage** (15🔩 to a PACT partner,
  3 turns — march their provinces, never their capital; transit stands without battle or
  capture via resolveMove early-return), **Bounty** (25🔩 → the OTHER rival hunts your target:
  +6 node score & band −0.2 vs target for 4 turns — proxy war), **Ceasefire** (10💡, always
  accepted, 2-turn pact entry). s.trades/passages/bounty in state+hash (no save bump,
  defaults). **AI fields YOUR collection** from turn 14 (rare+ owned keys replace its pool —
  SP flavor; empty coll in headless tests keeps determinism). Diplomacy modal grew all verbs
  (data-tradep/tradei/passage/cease/bounty). `__ttEmpire` gained trade/passage/bounty/
  ceasefire actions. +3 Chronicle achievements (beyond): flagteacher (2 tribes), shepherd
  (3 strays), floorfriend (5 critters). Verified: determinism w/ full verb script, trade
  numerics, passage gates + transit, bounty hunter, ceasefire, AI-fields-your-cards, live
  modal (all 5 verb button sets), console clean. **Phase 2 of the Empire bible is COMPLETE.**
- **Phase 3 Push A (2026-07-18, THIS session) SHIPPED — MP campaign foundation**: every
  political verb is seat-generalized (`me = 0` default keeps SP call sites untouched;
  trades now payer-keyed `${me}>${other}` w/ load migration of old flat keys), `s.humans`
  array in state+hash (constructor default [0]), endTurn resolves seats IGO-UGO (humans
  march queued orders, AI seats plan), aftermath: ANY human capital fall ends the war
  (deterministic — no myId in sim), gang-up/aiDiplomacy/postBounty read s.humans (bounty
  hunter must be an AI seat). **MP battles auto-simulate** (`mpDrain` when humans>1:
  finishEncounter(simulate) all + spoils auto-'parts' — played battles stay SP-only in v1;
  the endTurn tail guards double-aftermath via phase check). `empireNetTest(seed, turns,
  scripts)` = `window.__ttEmpireNet`: two full Empire instances, host-canonical command
  order, lockstep endTurn — verified identical hashes both clients, repeatable, script-
  sensitive, SP regression-free. **Push B remaining**: EmpireNet PeerJS relay (net.js
  patterns: room code, hello/seat, host-stamped cmd echo, ready-gated advance, hash
  desync check), seat-aware UI refactor (topbar/sidePanel/board `[0]`→`[mySeat]`), MP
  lobby (🌐), human↔human pact offers need an accept/decline UI (v1 harness auto-accepts
  by the AI rule).
- **⚠️ HARDENING "rogues defended by coincidence" (2026-07-20)**: Rogue Toys were only
  ever fought because EVERY current node type happens to carry an `E_GARRISONS` template
  — neither `resolveMove`'s fight-or-capture gate nor `createEncounter`'s defender
  resolution knew rogues existed. Add one template-less node type later and an army
  strolls past a squatting gang and takes the node free. Fixed in BOTH layers:
  `resolveMove` gains an explicit `rogueHolds` term, and `createEncounter` resolves
  `this.s.rogue.cards` BEFORE `garrisonFor()`. ⚠️ the two-layer nature is the lesson —
  fixing only the gate still capture-walked, because createEncounter independently
  re-resolves defenders and captures when it finds none. Verified: template-less rogue
  node now forces a real fight w/ the rogue cards, normal hunt + 20-scrap bounty intact,
  ordinary undefended neutrals still capture freely, determinism/campaigns/MP green.
- **⚠️ BUGFIX "a pact with a corpse" (2026-07-20)**: an eliminated seat KEEPS its provinces
  (by design — you still have to take them) but its treaties were surviving it too. A live
  pact with a dead seat made `reachable()` refuse to enter that territory, locking the land
  away from EVERY player until the pact happened to expire (≤4 turns). AI was blocked too
  (aiPickTarget also skips atPeace nodes). Fix: `purgeDiplomacy(p)` called from the
  elimination branch in `aftermath()` — wipes relations/grudges/trades/passages and any
  bounty naming the fallen seat (hunter OR target). Verified: territory marchable again,
  determinism + campaigns + MP lockstep all still green, true 2-seat v9 legacy save still
  migrates. Trades/passages already self-cleaned via their isAlive checks; only the pact
  relation leaked.
- **Phase 3 Push B (2026-07-18, THIS session) SHIPPED — THE MP CAMPAIGN IS LIVE**:
  `toybox/empire-net.js` = EmpireNet (PeerJS, peer id 'toybox-emp-'+code, host-stamped cmd
  echo, guests apply ONLY echoes, ready-gated advance, hash reports) + `applyEmpireCmd`
  (the ONE wire→verb translation, validates army ownership per seat). UI: `get ME()` +
  57 seat-0 spots threaded to this.ME (⚠️ the patcher leaked `this.ME` into empireTest —
  reverted; and `owner !== 0` (2 spots incl. the ARMY CLICK GUARD) is a different pattern
  than `owner === 0` — the guest couldn't select armies until fixed), `issue(cmd)` routes
  every mutating click (SP direct / MP relay), End Turn → net.ready() when MP, 🌐 lobby
  (host code / join), beginMp (fresh Empire seed-dealt, humans [0,1], persist=false,
  difficulty pinned), leaveMp restores the SP save. **Verified LIVE 2-tab PeerJS**: host
  QEJG, guest joined, guest's move echoed through the relay, both End Turn → BOTH boards
  Turn 2 with byte-identical logs, consoles clean; SP + harness regression green.
  v2 ideas: played RTS battles via room-handoff, human↔human pact consent UI, 3-human FFA.
- ⚠️ 2026-07-14 billing: nano_banana back to 2cr/image; a PARALLEL session was spending on
  "3D Rigging" (-8cr) the same hour — check `transactions` before batches, as ever.

## Multiplayer — up to 4 HUMANS, star topology (2026-07-14 rewrite): SHIPPED

`net.js` is now a **star**: every guest connects to the host, the host merges all
players' commands per tick and rebroadcasts the combined set. Only human command
streams travel; AI seats run locally on every client (deterministic, no traffic).
- **Why star**: guests only ever wait on the host's merged `cmds` broadcast, never on
  each other. So a dropped guest can't stall anyone but the host, and the host just
  stops requiring that seat (`this.left`) — graceful mid-game drops, no host migration.
- **API**: `host(config, onEvent)` opens a room and resolves with `{code}`; `onEvent`
  fires 'code'/'join'/'leave'/'roster' as friends arrive. Host calls `startMatch()` to
  lock the roster and deal the seed (unfilled Human seats quietly become AI). Guest
  `join(code, {name,faction}, onEvent)` gets 'seat'/'roster' while waiting, resolves on
  'start'. The lockstep loop contract (`flush`/`canStep`/`execTick`) is UNCHANGED, so
  main.js `stepMP` didn't move. `INPUT_DELAY` is 6 now (extra hop through the relay).
- **Lobby** (main.js `mpLobby`/`renderMpLobby`, 3 phases setup/hosting/joining): a
  dynamic seat list you edit — add/remove seats (2–4), per-seat Human/AI dropdown,
  per-seat Team dropdown (free-form A–D, no presets), civ+difficulty pickers on AI
  seats. Host opens a room → friends fill open Human seats → host presses ▶ Start.
  `mpConfig()` builds the net config; `mpReset()` tears down on Back/Leave. `chosenMode`
  === survival is coerced to standard for MP (survival is SP-only).
- **⚠️ Testing MP**: `window.__ttNetTest({humans,ai,seed,ticks,script,dropAt})` wires N
  REAL Net instances in-memory (fake synchronous conns) driving N headless Games — it
  exercises the actual aggregate/finalize/broadcast/execTick paths and asserts every
  client's `stateHash()` stayed identical. This is the authoritative determinism test
  (2/3/4 humans + a mid-match drop all verified in-sync). Live 2-tab PeerJS ALSO works
  (signaling reachable in the sandbox) but the BACKGROUNDED tab's WebRTC throttles, so a
  guest can drop in the gap while you front the host to press Start — do the join→Start
  switch FAST, or just trust `__ttNetTest`. When it holds, real 2-peer hashes match at
  every checkpoint tick (verified: host≡guest at ticks 400/500/600/700).

## Survival — "The Long Night" (2026-07-14, Kyle's "new gameplay system" pick): SHIPPED

A wave-defense mode. The 5th `GAME_MODES` entry (`survival`, 🌙); all tuning lives in the
`SURVIVAL` block in data.js (dawnWave 12, firstWaveAt 42, gap/hardGap pacing, countBase/
countPerWave size, tiered roster, `boss.every` 4, bounty, opening cushion). How it works:
- **The den seat**: playerDefs gets a `{team:1, isAI:false, den:true}` seat. `p.den` skips its
  base in setup (no chest/workers) — it only leaks waves. `setupSurvival(starts)` stores the
  den's corner as the spawn anchor + gives team-0 the opening resource cushion.
- **Wave scheduler** (`updateSurvival`/`spawnSurvivalWave`, called from update() after
  updateKoth): a wave launches at the hardGap deadline OR once the field is clear past the
  gap breather. Composition = deterministic rng draws from the tier whose `from` ≤ wave, size
  grows with the wave, a boss (`forgottenking`) every 4th. Fresh units get `amove` at the
  nearest defender building; a 2.5s re-command keeps the swarm from idling. Clearing a wave
  pays a bounty; clearing `dawnWave` calls `endGame(0)` (victory, `survivalWon`); a full
  team-0 wipe calls `endGame(-1)` (defeat, via the survival branch of `checkWin`).
- **⚠️ Disabled the OTHER win conditions in survival**: `updateWonder`/`updateRelics` early-
  return and setup skips stickers — otherwise uncontested defenders win by relic/sticker hold
  (this bit: a stacked-defender soak "won" at wave 6 with survivalWon=false until fixed).
- **Launch**: SP-only. startGame computes `resolvedMode` and, when survival + not MP/resume/
  replay, overrides playerDefs with [defender(chosenFaction), den]. The 🌙 mode button + the
  objectives-chip survival branch (main.js) + `SURVIVAL` import round it out.
- **Testing**: `__ttSoak` now takes `survivalDawn:N` (temporarily lowers dawnWave so the
  victory branch is reachable headlessly, then restores the shared config) and returns `surv`
  {wave,bestWave,active,won}. Verified: waves escalate, defeat + dawn-victory both fire,
  same-seed fp identical, snapshot round-trips, live game clean. NOTE the stock attack-AI is a
  poor survival defender (falls wave ~8-10 even 4-stacked) — real tuning wants a human playtest;
  all knobs are in the SURVIVAL block. MP-survival + a survival-specific game-over card are TODO.

## The five-option arc (2026-07-13/14, Kyle approved all of A-E): SHIPPED

- **A Smart workers**: audit found 4 of 5 eco rules already existed (flee+resume, depletion
  retarget, rally auto-gather, builder-resume) — only IDLE HANDS was missing: a worker with
  no order for 5s (`u.idleT`, reset in setOrder) self-assigns to the nearest gather source
  within 34 tiles, preferring its carryType. Sim-side, deterministic.
- **B Replay Shelf + share codes**: `tt-replay-shelf` (10 bottles, auto-saved at gameOver);
  menu `#replay-btn` → `openShelf()` (#shelf overlay): ▶ Watch / 📋 Code per row + paste-code
  Uncork. Codes = `'TT1.' + btoa(unescape(encodeURIComponent(JSON.stringify(rec))))`
  (~500 chars/bottle). Version stamp (data.js+game.js djb2) still gates playback.
- **C Outdoor ambience** (sfx.js `startAmbience(kind)`, wired in startGame from
  `mapCfg.outdoor && !zeroEra ? mapCfg.light : null`): 'day' = breeze + falling birdsong
  whistles; 'gold' = breeze + wobbling bee drone (continuous nodes, no timers); 'dusk' =
  breeze + cricket trains + owl hoots. `ambTimers` cleared + `ambKind` guard on re-call;
  indoor maps pass null. All WebAudio-synth, no files. Verified via `__ttSfx().ambKind`.
- **D Co-op MP**: already existed (MP lobby '🤝 Co-op vs AI' presets, 3p [0,0,1] / 4p
  [0,0,1,1]; buildMpDefs seats 0/1 human + 2/3 AI with civ/diff pickers; game.js runs AI for
  isAI seats in MP). RE-VERIFIED post-20Hz/pathfinding/knights: two scripted co-op soaks,
  same seed ⇒ identical fp `297901|254|1067172418`, different seed diverges, 0 errs.
- **E Campaign QA sweep**: all 23 missions headless (missionEvents time-compressed), all
  beats fired, zero errors.

## Next-feature ideas (nothing owed)

- ⚠️ **ART BACKLOG IS EMPTY (2026-07-27).** Every campaign mission has a plate and every
  ground STYLE has art. ⚠️ audit ground art by `MAPS[k].ground || k` (the loader reads
  `assets/map/ground-<style>.png`), NOT by map key — canyon reuses `playmat`'s ground and
  bathtub uses `floor-bathtub.png`, so a naive per-map audit invents two phantom gaps and
  any file you generate for them is never loaded.
- Balance battery for the 20Hz SP switch (soaks already ran fixed-step, so old data stands;
  a fresh 60-gamer would confirm).
- Name-your-bottle UI on the Replay Shelf (records already round-trip; it's pure UI).
- Act IV briefing plates ×5 + zero.jpg sepia plate (auto-hidden until generated).

— Fable. The room is tidy, the book is longer, and the light is still on.

## ROADMAP TIER 1 — FIRST BATCH SHIPPED (2026-08-19, free)

Built from `ROADMAP.md` (45-agent research pass; that file is the authority for
what to build next and, just as importantly, what NOT to rebuild).

1. **THE SIZE-UP** (roadmap's highest-scored item, 78) — hover any visible enemy
   with toys selected and a panel answers "is this my fight?": ▲/–/▼, seconds for
   you to kill it, seconds for it to kill you, and the bonus line (`+10 vs raider`).
   38 of 53 units carry a `def.bonus` counter table that was surfaced NOWHERE.
   `ui.matchup(a,b)` / `ui.sizeUp(target)` re-read exactly what `applyDamage` uses
   — `atkOf`, the tag-match bonus, the ±25%/0.4 elevation rule, `armorOf`, and
   `def.interval × mods.atkSpeed`. **Pure read: no sim state, no rng, no save.**
   Hover is throttled to 10Hz in main.js's `pointermove`, gated on
   `fog.state === 2` so hidden toys can't be scouted by mouse, skipped for touch
   and while placing, and wrapped in try/catch (a readout must never break input).
   Verified: spear→raider reads good / 4s / 10.2s / +10 vs raider; spear→soldier
   reads even. ⚠️ do NOT bundle new counter axes or `armor.siege` — those are
   balance changes wearing a UI feature's coat.
2. **`stateHash()` HARDENED** — it folded only id/x/z/hp/stance/garrisoned/holder/
   res/market, so `__ttNetTest` was **blind** to a hauler's load, a half-built
   wall, a mined-out pile, a promoted veteran and a player's age/techs: those
   could differ between clients and still hash equal. Now folds `carry`, `built`
   (<1), resource `amount`, `kills`, and per-player `age`/`techs.size`.
   Verified each state class flips the hash and restores exactly to baseline.
   ⚠️ **Any new sim state MUST be added here or the MP harness will lie to you.**
3. **Retention one-liners** — `chronicle.blank()` gains `bestWave`/`survivalWins`
   and `recordMatch` records them (your furthest night was previously forgotten
   the moment the tab closed); `act5` achievement added (Act V shipped 5 missions
   and no achievement); `LORE.factions.knights` written (it was MISSING, so the
   tribe that headlines Act V rendered an empty codex block — now 8/8 factions).
Verified: fp determinism, MP 2h+2ai AND 3h+1ai inSync, save round-trip hash-equal,
6-map soak sweep 0 errs, 0 console errors.
⚠️ STILL OPEN from the same batch: the Empire→Chronicle bridge (`recordMatch`
takes a `Game`; Empire has none, so it needs its own recorder — design first).
⚠️ Kyle's `.claude/launch.json` toybox entry was deleted by a parallel session and
had to be restored; the 5-dev-server cap was also full, so this session served on
**8326** via serve.ps1 directly.

### Roadmap Tier 1 — batch 2 (2026-08-19, free, all view/UI)

4. **THE STUMBLE** (`attachStumble` models.js, attached in all 3 unit-view
   builders next to `attachSpeech`): the room shoves toys around — cat swat,
   dog pounce, Roomba barge — and the toy used to slide to its new tile
   perfectly upright, which read as teleporting. Now it pitches away from the
   blow and wobbles back: `f*f*cos((1-f)*13)*lean` over 0.62s. Fired from the
   three existing knockback sites with the away-angle; ticked beside
   `updateBubble` (both live AND dead branches). Verified settling trace
   0.213 → −0.115 → 0.047 → −0.009 → 0. **This is also the cheap test of whether
   the roadmap's full KNOCKED OVER sim system is worth its price.**
5. **DAWN LIGHTING** — `updateNight` was monotonic; the toys' whole deadline is
   morning, so past `DAWN_AT` (1500s) the room now turns and gets LIGHTER,
   warming toward `DAWN_TINT` by `DAWN_OVER` (2400s). Measured: hemisphere
   0.6→1.1, key directional 1.4→2.3 — the room lighting nearly doubles.
   ⚠️ measuring by SUMMING scene light intensity is useless: the bedside lamp is
   a 220-intensity PointLight driven separately in `loop()` and swamps the sum.
   Read the individual lights.
6. **The four silent orders** — `rightClick` returns 7 result strings and both
   consumers handled 4: **build / trade / garrison / guard** produced no ping and
   no bark. All four now ping (own colour) at both consumers and route through
   `orderBark` (maybeBark falls back to `set.sel`, so it degrades gracefully).
Verified: fp determinism, MP 2h+2ai inSync, 4-map soak sweep 0 errs, 0 console errors.

## 🔬 THE SEAT-0 INVESTIGATION (2026-08-20) — LARGELY A MEASUREMENT ARTIFACT

The bible called this "the highest-value session in the document" and suspected a
tick-order defect. **It is not one.** Four controlled experiments:

1. **Combat resolution is FAIR.** Identical 6v6 soldier duels, symmetric spawns,
   both attack-moving: **seat 0 won 4, seat 1 won 4**. The actual predictor was
   POSITION (the left-hand army won 6 of 8), not seat id. So `applyDamage`,
   target acquisition and entity iteration order are not biased.
   ⚠️ trap: after one duel wipes a side the game sets `over`, and `update()` goes
   inert — a second duel silently "ties" 6v6. Reset `g.over=false` between reps.
2. **Start geography is symmetric.** playmat seat 0 vs seat 1: nearest node 6.04
   vs **5.52**, avg of 4 nearest 6.62 vs **5.98**, nodes within 12: 18 vs 17,
   mass within 12: 7543 vs 7126. If anything seat 1 starts marginally BETTER.
   (One real asymmetry: marbles within 14 — 9 vs 2. Worth a look, not a bias.)
3. **⚠️⚠️ THE HARNESS WAS IGNORING `diff:` — CHALLENGED AND UPHELD.** `__ttSoak` read `opts.difficulty`
   only, and EVERY battery in this file passes **`diff:`** — so every historical
   battery labelled "hard AI" actually ran at **normal**. Fixed: the soak now
   accepts `opts.difficulty || opts.diff`. Verified the two now produce different
   fingerprints on the same seed. Symmetric across seats, so it doesn't explain
   the bias — but every documented battery's difficulty label is wrong.
   ⚠️ A later red-team pass (2026-08-20, TWO independent reviewers) claimed this
   was false and that both keys 'always worked'. **They were wrong, and the
   mistake is instructive**: they read the CURRENT file, which contains the fix,
   and never checked history. `git show ff7444a^:toybox/main.js` in the deploy
   repo shows `difficulty: opts.difficulty || 'normal'` — no `opts.diff`. Two
   agents sharing a blind spot is not corroboration. **Check git before
   'correcting' a historical claim about this codebase.**
   They WERE right about a real bug in the same patch: `personas` reported
   `diff.name`, but DIFFICULTIES entries carry **`label`** — so the column was
   always undefined. Now reports label + workerTarget + firstWave (verified
   Playful/18 vs Cranky/21), so the difficulty bit is provable from the return.
4. **CONTROLLING FOR AI PERSONA MAKES IT VANISH.** `__ttSoak` now returns
   `personas` per seat. 60 mirror games (classic v classic, playmat, hard):
   - overall seat-0 **56%** (n=48 decided) — inside noise of 50% at that n
   - **both seats on the IDENTICAL persona: 9/18 = exactly 50%**
   - persona strength is the real effect: **balanced 58%, rusher 56%, boomer 35%**
   Personas are rolled off the shared rng IN SEAT ORDER, so every battery that
   didn't control for them was measuring a random persona matchup with a 23-point
   spread and attributing it to the seat.

**Revised conclusion:** there is no evidence of a structural first-seat advantage
in combat, spawns or tick order. The historical 77/67/67% readings are best
explained by uncontrolled persona matchups (plus, for pre-2026-08-20 runs, an
unintended difficulty). **The real defect found is that `boomer` wins 35%** — an
AI persona balance problem, not a seat problem.
⚠️ Any future battery MUST either pin personas or report them. `__ttSoak` returns
them now; there is no excuse for repeating this.

### Roadmap Tier 1 — batch 3: MACRO FRICTION (2026-08-20, free, UI-only)

7. **THE PRODUCTION STRIP** — fixes the actual reported bug: `buildCommandsFor`
   gates every command on `own.length === 1` (ui.js), so **selecting two Toy
   Chests gave you ZERO train buttons** — the most-cited C&C Generals complaint,
   present here verbatim. Measured before/after: 2 selected → 0 card buttons;
   click a chip → 1 selected → **10 card buttons**.
   `updateProdStrip()` renders one chip per owned `def.trains` building (selected
   or not) with live queue count, progress bar and an IDLE pulse; clicking a chip
   selects that ONE building. ⚠️ **The single-building gate is deliberately NOT
   relaxed** — Demolish/Bell/Age-Up/Market/Tribute would silently act on `own[0]`
   and the train closures hard-bind `first.id`. The strip removes the need.
   ⚠️ Obeys the stable-DOM rule: DOM is rebuilt ONLY when the id:queue signature
   changes; per-tick writes are textContent/style.width/classList on existing
   nodes. Verified the chip node stayed `===` identical across 40 queue ticks.
   ⚠️ Absolutely positioned INSIDE `#hud` so it never joins the flex row — and it
   therefore inherits `#hud`'s deliberate exclusion from the `--ui-text` zoom, so
   its sizes are fixed px on purpose.
8. **SELECT-ALL-ARMY on `V`** — every owned unit with `def.aggro > 0`, excluding
   **workers** (an army order must never yank the economy), the **King** (in
   Regicide he IS the war) and **garrisoned** toys. Camera deliberately does not
   move. Verified all three exclusions.
   ⚠️⚠️ **Do NOT bind `a`/Ctrl+A**: `keys[key] = true` is set BEFORE the keydown
   handler's `!game` return, and the camera pan reads `keys.a` ignoring
   modifiers — Ctrl+A leaves the camera drifting until keyup. `v` was proven free
   in both scopes.
Verified: **fp byte-identical to the pre-patch baseline** on playmat AND
bookshelf (19848|204|677559599 / 126013|187|952265336), MP 2h+2ai and 3h+1ai
inSync, HUD layout intact, 0 console errors.
⚠️ NOT built this batch, and flagged by the recon as traps: relaxing the
single-building gate; fan-out "train at all selected"; cancel-from-chip (46px
target, index-based cancel = destroying real production on a mis-click);
waypoints for multi-unit selections. Tab subgroup cycling + queued-waypoint
rendering are designed and anchored in `ROADMAP.md`'s patch plan but unbuilt.

## 🐛 THE BOOMER WAS DEADLOCKED, NOT WEAK (2026-08-20) — FIXED

The 60-game persona battery said `boomer` wins 35% vs balanced 58%. A design
agent then found the actual cause, and it is not a tuning problem:

**`aiUpdate` capped a boomer's Age-1 army at 4** (`military.length >= 4` → skip
the Training Mat) while the age-up gate required `Math.min(6, ai.wave - 2)`,
which is **always exactly 6** for a boomer (its `firstWave` is base+6 ≥ 12). The
Training Mat is the ONLY source of `aggro > 0` toys in Age 1 — worker/scout are
aggro 0, spear/archer/medic are Age 2 — so 4 < 6 made `saving` unsatisfiable and
`startAgeUp` was **never called**. Measured on bookshelf (no wild camps), seed
13: BOTH boomers spent the entire match in Age 1 with 21 workers and ~2,200
blocks banked. Its only escapes were accidental — training-queue overshoot after
a second Mat, or a Wild Toy camp (+2 soldiers), which only exists on the 7 maps
with `tribes: 2`. On canyon/kitchen/bookshelf/livingroom/bathtub there was **no
escape at all**. That is why it won 35% and not 0%.

**Second cause:** the age-up worker gate read `diff.workerTarget - 3`, and
workerTarget is persona-inflated — so boomer's "+5 workers" also meant "+5
workers before I may age up" (Cranky: rusher 10, balanced 13, **boomer 18**).
The economic persona reached Age 2 dead last.

**The fix (both sim, boomer-only in effect):**
- Age-1 cap bound to the gate: `military.length >= Math.max(4, ageArmy)`, with
  `ageArmy = Math.min(6, ai.wave - 2)` hoisted so the two can never invert again.
- `diff.ageWorkers = Math.min(wTarget, pBase.workerTarget) - 3` — a persona may
  age EARLIER than its difficulty baseline, never later.
- `playerDefs[i].persona` **pin** for batteries (the rng roll is still consumed
  for every seat, exactly like the faction roll, so the stream is unchanged).
- ⚠️ RED-TEAM MANDATORY, and a real trap: the v1-save restore branch now keeps
  the live diff — `Object.assign(this.aiState[1], snap.ai, { diff: ... })`.
  Without it a v1 blob carrying its own diff yields `ageWorkers === undefined`,
  `saving` is permanently false, and THAT AI never ages up. It would have shipped
  a worse bug than the one being fixed.

**Result, measured (32 pinned boomer-v-balanced games, mirrored seats, 4 maps):**
the deadlock is GONE — every boomer still at Age 1 finished with **army 0**
(crushed, not stuck); `deadlockedNotCrushed: 0`. Age spread 7/11/14 across ages.
⚠️ **But the win rate did NOT reach parity: 28% vs balanced.** Then
`firstWave 6 → 3` was tested as the documented follow-up lever and **REVERTED**:
31%, inside noise at n=32, with an identical age spread. **That knob is not the
lever.** The boomer out-economies and never converts its bank; fixing that needs
a behavioural change (an attack trigger tied to its own stockpile), not a number.
⚠️ NOT INERT: ~1/3 of AI seats roll boomer, so fingerprints move for most 2-AI
matches and old replay bottles of those matches will not reproduce.
Verified: fp determinism, MP 2h+2ai AND 3h+1ai inSync, 4-map soak sweep 0 errs.

## 🔒 WISHES SLICE 0, PART 1: THE HASH IS NO LONGER BLIND (2026-08-20)

First real code from `WISHES.md`. Two of these are **pre-existing bugs fixed
today, independent of wishes** — and the first is the worst class of bug this
project can have, because it made the MP harness lie.

1. **`stateHash` hashed `p.techs.size` — the COUNT, not the contents.** Grant
   tech A on one client and tech B on the other and the hash **AGREED**.
   `__ttNetTest` was provably blind to every tech-granting desync in the game.
   Now folds tech CONTENTS via `foldKeys` (order-independent, and each key code
   is SQUARED so two different subsets of the 31-tech pool cannot cancel to the
   same total). Measured: two different single techs now hash −947432736 vs
   1951254272; pre-patch they were identical.
2. **`p.mods` was not hashed AT ALL.** Faction mods and `applyTech` both write
   there and none of it was visible until it eventually moved a unit. Now
   quantised to 1/4096 and mixed with the KEY, so a value landing on the wrong
   key also shows (verified: same value on `gather` vs `unitHp` hashes differ).
3. **`armorOther` was missing from the additive-mods whitelist** (game.js ~329).
   It initialises to 0 and `quilting` does `+= 1`, so any faction or wish
   declaring it would have been **multiplied into 0** and silently done nothing.
   Now one shared `ADDITIVE_MODS` Set so the faction loop and any future grant
   can never disagree about a key's arithmetic.
4. Forward-looking, all guarded and inert until the engine lands: `this.zones`
   (area powers live OUTSIDE `entities`, so the entity loop never sees them),
   `u.aura`, and the wish fields.
⚠️ `keyCode` forces codes ODD — a zero code would multiply its entry straight
out of the hash. Folds accumulate with `+` only, never `*`, because Set
iteration order is not guaranteed to survive a restore.
Verified: every blind spot now flips the hash, the hash restores EXACTLY to
baseline (no false positives), fp determinism, MP 2h+2ai AND 3h+1ai inSync,
save round-trip hash-equal, 6-map soak sweep 0 errs.

## 🐛 "ALL OUR SOLDIERS WERE JUST PLAIN BLOCKS" (2026-08-20 playtest) — FIXED

Kyle, playing classic vs bots: the basic melee soldier rendered as a plain block.
**Not reproducible on local or live** — every unit loaded real GLB geometry, 0
console errors, and the soldier photographs correctly (GLB body + a procedural
rifle: three TINY boxes, 0.05×0.52 dark barrel, 0.07×0.19 brown stock).

**The cause is the loader's failure path, not the view.** `loadUnitModels` gave a
GLB exactly ONE attempt; on failure it logged a `console.warn`, left
`registry[key]` undefined, and every unit of that type silently fell back to a
placeholder BOX. One dropped request on a flaky connection to GitHub Pages
produces precisely "all our soldiers are blocks", with nothing user-visible.
**Fixed**: `loadRetry(url, tries = 3)` with 220/440 ms backoff, wired into BOTH
unit load sites (the rigless `man.model` path and the skinned `clips` path), and
a real failure is now `console.error` naming the consequence instead of a warn
nobody reads.
⚠️ The same single-attempt pattern exists at the BUILDING and MAP loaders
(models.js ~2150/2194) — not changed in this pass, but they have the same defect.

## 🔒 WISHES SLICE 0, PART 2: player state + the doubling rule (2026-08-20)

Patch 4 from `WISHES.md`: `p.wishes/wishCharges/wishCd/wishOffered/wishT/
wishHold/wreck`, `stats.wishesCast`, and two new MULTIPLICATIVE mods keys
(`farmRate`, `wallHp` — deliberately NOT in `ADDITIVE_MODS`). Snapshot writes
them; restore reads them back verbatim.
⚠️⚠️ **THE RULE: restored wishes are DATA. `restore()` NEVER calls `applyWish`.**
`p.mods` is already rebuilt verbatim by the `Object.assign`, so re-applying would
run `m.gather *= x` a SECOND time — permanently, silently, and only on the client
that loaded the save. ⚠️ Do not be reassured by testing a TECH-granting wish:
`applyTech` early-returns on `p.techs.has`, so techs are idempotent and HIDE the
bug. Verified with a MODS-granting wish: gather stayed 1.08, not 1.1664.
Verified: full round-trip of every wish field, hash equal after restore, fp
determinism, MP 2h+2ai inSync, 0 console errors.
⚠️ BUILD NOTE: bash heredocs and `node -e` double-quoted strings EAT backticks
and `${...}` — three comment blocks were mangled that way this session. Use the
Write tool for any patch text containing template literals or backticks.

## 🌙 BEDTIME WISHES SLICE 1 IS LIVE (2026-08-23, ultracode) — knights + bots draft

The AoM-depth civ layer from `WISHES.md` is PLAYABLE: Wish I is a 3-card draft
at match start (pre-pickable on the faction screen, silently auto-issued when
the window opens), Wish II rings at the Bell (360s, or 180s for a seat with
`stats.lost >= 6` — hardship, not score). Three lanes 🕯️Hearth/👣March/🛡️Keep,
12 wishes (knights 6, bots 4, room 2), every wish = gift + a charged power.

**Where everything lives:** `WISHES`/`WISH_RULES` + `FACTIONS.<f>.wishes` menus
in data.js; the engine block ("BEDTIME WISHES") + power kernels in game.js
before `execCommand`; the whole UI ("the draft and the bar") in main.js before
the clickMode machinery; DOM/CSS `#wish-offer`/`#wishbar` in the HTML.

**The laws that got carved in (violate = revert):**
- **THE OPTIMISM BAN.** `applyWish`/`castWish` are the only writers of wish
  state and the only way in is `execCommand` (`{t:'wish'}`, `{t:'cast'}`).
  The UI renders `p.wishes`/`p.wishCharges` and mutates NOTHING — the menu
  pre-pick is auto-ISSUED when the offer opens, so replays/MP record it free
  (this deliberately replaced the spec's net.js Patch 9 — strictly better,
  zero protocol change).
- **THE FUSE LAW** (research pass, 6/6 sources converged): no enemy-facing
  burst lands on the cast tick. burst/chain plant an `omen` zone (amber ring,
  `WISH_RULES.fuse` 1.8s) and `detonate(z)` runs against positions at THAT
  tick — scattering is skill, and hot numbers are safe because EV vs an alert
  player is below paper. Friendly powers (mend/ward/omn/deposit/light) stay
  instant.
- **THE PUBLIC WISH.** A cast is never silent: the rival gets the label
  (`'The rival wished: X!'`), `cb.wishSeen(owner,id)` reveals that wish as a
  countable **foe chip** (`#wishbar-foe`, live charges from public sim state,
  UI-local `seenFoeWishes` Set), and an EARLY Bell is announced to the
  aggressor (a real disengage signal).
- **THE INFORMED BELL** (research rank 6): tier-2 cards carry `wishContextLine()`
  — the SAME board reads the AI picker uses (army delta, gather delta, toys
  lost) — so the human drafts on data, not vibes. Pure reads, `#wo-ctx`.
- **THE TEAM CONTRACT** (pre-declared for Slice 2+): 'friendly' = same TEAM,
  'enemy' = enemy team; same-kind allied EFFECT zones must refresh, never
  stack. (Vision zones like the hall light stack legitimately — two lamps =
  two lit patches.)
- **RESTORED WISHES ARE DATA** — restore() never calls applyWish (mods double).
  ⚠️ auras ride BOTH unit AND building snapshots — the ward on a chest was
  silently lost until the G3 torture test caught it. Any new aura carrier
  needs its snapshot branch.
- AI: `aiPickWish` draws one rng per option UNCONDITIONALLY (stream never
  depends on the choice); jitter×2.0 vs lane-bias 1.0 ⇒ favored lane ~70%,
  personas legible (rusher→March, boomer→Hearth) without every match drafting
  the same card. Tier 2 reads the board (behind on army→March, fat on
  workers→Hearth, bleeding→Keep). The wish-power MANAGER in aiUpdate casts
  like a person: burst into a ≥4 knot, mend a burning keep, One More Night
  only when ≥6 engaged and ≥8 lost. Pure scans, NO rng.
- `wishScript: {pid: [wishI, wishII]}` pins a seat's draft for batteries;
  `hashAt: [ticks]` samples `stateHash` (the GATE — fp is a smoke test);
  soak returns `hash`/`hashes`/`wishes` + `stats[i].wishesCast`.
- zeroEra + tutorial + CAMPAIGN MISSIONS have NO wishes (updateWishes early-
  return; campaign = `this.missionEvents` set, which is ALWAYS true for a
  mission incl. []): the prequel has no names for what they were feeling yet,
  and 28 hand-tuned missions must not be silently re-balanced by a free
  draft. Scripted wishes as mission story beats = a later slice.

**Verified (all seven gates):** G1 fp+hash determinism ×2 maps; G5 replay from a Shelf bottle hash-identical at frame 700 (pre-pick + 2 casts in the log); G2 netTest
2h+2ai AND 3h+1ai AND a drop INSIDE the 45s window, all `inSync === true`;
G3 snapshot torture (live omen w/ payload, permanent zone t:-1, building ward,
spent omn save, mid-window, mid-cooldown) hash-equal, mods NOT doubled; G4
hash diverges at the LANDING tick for mods/tech/zone pins; G6 kernels on a
board with cat+roomba+critters+lost toys, 0 throws; live UI menu→match→cast
loop + digit picks + forced Bell, 0 console errors. AI casts 3/side in a real
match (the powers are not decoration). 48-game lane battery: see WISHES.md
addendum.

**THE REVIEW THAT EARNED ITS KEEP (29 agents, 21 real defects, all fixed —
WISHES.md §9.1 has the list).** The seven gates are blind to deterministic
SPEC failures, and that is what it found: gifted age-2 buildings were
silently dropped by canPlace (lighton's tower NEVER landed), baskets hugged
the chest, walls scattered as bricks, deposit idled every hauler, Strafing
Run had no bmul, burst-killed garrisoned toys left ghosts in garrisonIds, a
pinned AI skipped its draws, instant could finish a Wonder, restore() alerted
before ui existed (legacy-save resume CRASHED). Lessons carved: gifts use
`canPlace(..., gift = true)` (age ladder bypassed, physical rules kept);
`giftBuildings` sites drop-offs at piles / wall runs as a line with the gate
first / the rest on the chest ring; `kill()` releases garrison slots;
Old Guard = **Hold the Line**, leashed 12 tiles (bots' Wind Each Other is
map-wide on purpose); restore() NEVER alerts (flag, say it on tick 1).
⚠️ MODULE-CACHE TRAP: a bottle recorded right after a game.js edit can
replay to a different hash — the browser ran a stale module while fetch()
stamped the fresh text. Hard-reload before recording a replay you'll test.

**Patch 11 shipped with it:** catapult `bonus: {building: 14, mega: 10}` — the
universal titan answer, surfaced automatically by the size-up.

⚠️ KNOWN CONSEQUENCES (correct, do not "fix"): every pre-wish replay bottle
refuses playback (version stamp — correct); a pre-wish save resumes with no
first wish and SAYS SO (Patch 10 alert); control groups 1-3 are suspended
while a draft window is open (Ctrl+1/2/3 still assigns, `n` aims).

**The depth roadmap** (45-idea research pass, 2 workflows, synthesis in
`WISHES.md` §9): next up rank 3 `bonus:{wish}` class counter (Slice 2, ships
with the 16 units), rank 4 THE DEVOUT ECHO (same-lane Wish II arrives
enriched), rank 6 THE INFORMED BELL (context lines on the cards), rank 7
VALUE HAS A BODY (zones anchored to razeable buildings), rank 12 THE BIG
LIGHT (a power that turns the room's lights on — the view hook exists in
updateNight). Principles: rates die emitters live; charges are a fixed
allowance; verbs over numbers.

## 🌙 BEDTIME WISHES SLICES 2+3 (2026-08-24, ultracode) — ALL EIGHT TRIBES WISH

The full catalogue is LIVE: **42 wishes** (36 bespoke + 6 room), **16 wish
units** (donor GLBs re-tinted via `applyUnitTint`, Patch 12), every faction a
3×2 menu, the Devout Echo, and the `bonus:{wish:6}` class counter on the
shared Button Archer. Authored by an 8-agent fleet against the frozen kernel
vocabulary, law-checked by 8 more, spliced + validated by module import
(`splice-catalogue.mjs` pattern — never trust "patch script said ok").

**The kernel vocabulary** (castWish `k:` values — the COMPLETE set; a wish
declaring anything else fails validation): instant(+wallsOnly) · mendone ·
mend · mendr · ward · onemorenight(+leash) · suits · burst(+bmul) · chain ·
light · deposit · countoff · sort · spawn · place · placeany(+cap picker UI) ·
zone(fx: dr/drHold/slowEnemy/speed(+wheeled)/rangedDr/heal/bounty) ·
floorboard(place-then-creak, one power, two casts) · movecamp(two-phase aim) ·
trainboost · unitboost(tag/type/speed/dmgTaken) · farmseason · warmheal ·
wreckwindow · claimlost · flagcamp.
**Gift keys**: res/free/techs/mods/retroBuildingHp/retroWallHp/nextStar/
wreckRefund/revive/claimCamp/unitAt(free dragon ONLY) — and `unit:{key,at:[]}`
UNLOCKS a trainable wish toy (hasWishUnit → the ui.js card button + the LOUD
trainUnit gate). `devout:{charges|res|free}` on tier-2 = the same-lane echo.

**Unit behavior def fields** (updateUnit, deterministic slow-timer scans):
`repair:{rate,r}` (Unit 4) · `regen:{rate}` (Rewound, only out of combat) ·
`fetch:true` (Old Blue seeks strays; combat orders outrank fetching) ·
`auraFlag:{r,mult}` (Standard Bearer stamps k:'flag' on workers → gatherRateOf)
· medic-shape `heal:{rate,range}` (Night Light, Pace Car). Buildings: aura
k:'pace' (Sponsorship ×3 queue speed) · k:'season' (mats ×2) · oldguard
fort/tower self-repair 6 hp/s (hasWish check in updateBuilding).

**New sim state, all hashed + snapshotted**: `p.starNext` (Second Wave — next
N military arrive at ⭐, applied in spawnUnit), `p.wreckT` (Spare Parts'
window), `p.fallen` (the Warm Heap's plush ledger, cap 12, folded by
CONTENTS), the wreck ledger (every building death adds its R to EVERY seat's
`p.wreck`), fx zones (+creakT), suit auras (+hx/hz leash anchor — hashed).

**THE LAWS, new entries:**
- **A suit's life clock is SACRED**: onemorenight/unitboost/flagcamp/auraFlag
  all skip `aura.k === 'suit'` — an overwrite makes an immortal Empty Suit.
- **`carrier` on a lost toy is -1 when uncarried, NOT null** — two kernels
  shipped broken on `== null` until the live smoke caught it. Check sentinels.
- **A baked diffuse map outvotes any colour lerp** — `tint.stripMap` exists
  because Old Stone stayed rainbow at amount 0.95 (the golem's texture won).
- **metalness ≈ 0.85 with no envMap renders BLACK** — the Empty Suit shipped
  bone-white at metalness 0.15 + a whisper of emissive instead.
- **The TDZ trap**: `renderCivPanel` runs at module top-level; every `let` it
  reads must be declared above it. Armed by content (classic gained wishes →
  the wish row evaluated → boot crash). Latent since Slice 1.
- AI casts the new kinds via manager arms (zone→engaged centroid w/ leash
  check, suits→attacked keep, spawn→behind on army, warmheal→5 hurt,
  mendr/sort/countoff/trainboost/farmseason/unitboost...); movecamp/place/
  placeany/floorboard/claimlost stay HUMAN-ONLY (siting judgment — the
  documented Lost Toys class of SP edge).

**Verified**: 6 new factions × pinned-lane soaks vs control 0 errs (AI casts
0-3/side); fp+hash determinism ×2 pairs incl. room-wish scripts; netTest
inSync with 4 new-faction seats; clean-page snapshot torture hash-equal (fx
zone, permanent creaking board, wreckT, pace aura, unlocks); 18-kernel live
smoke; training loop both gate directions; donor-vs-wish lineup photographed.
⚠️ The dirty-page torture ONCE read hash-unequal — hand-corrupted test state
(a stray carried by a unit whose pointer was nulled by hand); the clean-page
run and snap1===snap2 both pass. Don't chase it again.

### The Slice 2+3 review — two dead features found AFTER the gates were green

46 agents, 14 unique defects, all fixed (WISHES.md §10.1 has the list). The
seven gates passed the whole time: **a power that does nothing still
round-trips, still hashes, still stays in sync.** Two Wish cards were shipping
as pure decoration —
- **`fx.heal` had no read site** (plush's Leave It On healed nothing, wranglers'
  Circle the Wagons lost half), and
- **`z.creakT` was never decremented**, and the Loose Board's `t: -1` made
  `updateZones` hit the permanent-zone early-out before any timer work, so the
  Creak was permanent across saves.
**THE LESSON: after adding a data key, grep for its READ SITE.** `mods.wallHp`,
`gift.units`, `regen.idle` and `power.frac` were all granted-and-never-read the
same way; `def.repair` was the mirror image (a behavior block with no def to
drive it — Unit 4 now carries `repair` and mends machines as its fiction says).
⚠️ **Wiring `mods.wallHp` FORCED an ordering fix**: `retroWallHp` ran after
`giftBuildings`, so once walls were boosted at build time the ten gifted walls
took 1.8 twice (3.24×). Retro passes belong BEFORE the gift placement —
`retroBuildingHp` was already ordered that way, for exactly this reason.
⚠️ `claimlost` set `dead` without `removed`: the corpse stayed in `entities`
(hashed) but was dropped by `snapshot` — **save/load silently stopped being
hash-equal.** Any code that retires an entity outside `kill()` must set both.
⚠️ Three AI arms could never fire; the instructive one is `flagcamp`, gated on
`ai.attacking` while the tribe manager only walks toys to camps when
`!ai.attacking` — **mutually exclusive conditions in code that both look
reasonable alone.** Cross-check a new AI trigger against the manager that
creates the state it needs.
⚠️ A review workflow that returns `confirmed: []` MAY NOT HAVE RUN — two
launches died on session/model limits and reported empty. Check `<failures>`,
and put review agents on a different `model:` when the session model is capped.

## 🕳️ THE ROOM GOES DOWN — basins (2026-08-27)

Every height writer in `setup()` was `Math.max` on a zero grid, so the world had
been monotonically NON-NEGATIVE since it was written: a floor with lumps on it.
That is half of why the maps read as a table rather than a place. `basins:` in
MAPS is the other half — authored at ONE point, AUTO-MIRRORED to its
point-symmetric twin (fairness by construction), three walkable bands stepping
by E/3 exactly like the dune collars but downward. On playmat / livingroom /
underbed / garden / kitchen.
⚠️ **Basins go LAST**, immediately before the water flatten — any `Math.max`
writer running after one clobbers it back toward 0.
⚠️ `addResourceNode` hard-rejected any tile not exactly 0/E/2E, so a basin would
have been silently **resource-dead** — negative multiples of E/3 are whitelisted,
or a whole region of the map stops being worth walking to.
⚠️ Basins skip `water` tiles (never dig the bathtub) and `clearHomes(13)`.

⚠️⚠️ **A BASIN DIGS THROUGH THE ROOM FLOOR.** The bedroom surround puts an opaque
floorboard plane at y=-0.02 and a rug at -0.014, both ABOVE a dipped mat — so the
first basin rendered as a flat blob of floor colour punched through the grass.
`sinkRoomFloor()` (called after `computeCorners` + `applyTerrainToGround`) sinks
them below the deepest point the VIEW grid actually reaches, computed rather than
a magic number. It is **geometric, not tag-based** — a tag version missed a plane.

### 🐛 `computeCorners` was SIGN-ASYMMETRIC — fixed same day

Found by the AoE3/4 research pass, in code I had written hours earlier. The
majority-bias test seeded `let hi = 0` while `lo = Infinity`. For a corner whose
four tiles are ALL NEGATIVE — i.e. every corner inside a basin — nothing ever
updates `hi`, so the cliff test `(hi - lo) > CLIMB` measured against a floor that
was not there and reported **cliff: true on a walkable basin collar**, applying
the exact saw-blade snap the test exists to exclude. `hi = -Infinity` + an
isFinite guard. Measured after: 0 comb spikes along a radial out of the basin,
max sim step 0.283 <= CLIMB.
**The lesson: a sentinel seeded at 0 silently assumes its quantity is positive.**
The whole engine had been non-negative, so the assumption was invisible until the
day it was not true.
⚠️ Rises and drops now cap SEPARATELY and ON PURPOSE (`ELEV_BOOST_CAP` 0.7 /
`DEPTH_BOOST_CAP` 1.1): from a top-down camera a hollow reads far weaker than a
hill of the same size, so it is allowed more exaggeration. Named, not accidental.

### `__ttPathAudit` — THE MOVEMENT CHECK (build terrain against this)

`window.__ttPathAudit({map, seed})` floods the walkable board from each seat using
the PathFinder’s OWN `isBlockedFor()` and `climbable()`, so it can never disagree
with how a real toy moves. Reports reach %, **mutual** (can the seats reach each
other at all), reachable resource nodes, isolated pockets of 12+ tiles, and seat
fairness. **Run it after ANY terrain edit** — a ridge that closes a corridor or a
plateau that swallows a resource pocket does not throw, the match just plays wrong.
Basins verified 36/36 (12 maps × 3 seeds), minReach 99.1%, seat spread 0.

## 🌏 THE FAR PLACES — maps that are not in the bedroom (2026-08-27)

Kyle: *"maybe lets take some maps outside of a bedroom or house or even the
realm or imagination and take them into the real world like the mountains of
china or jungles of india i dont know"*.

**The framing that makes this work without breaking the fiction: these are the
places the toys are FROM.** Every toy in the box was manufactured somewhere real
— the army men were moulded in a factory under green mountains, the carved
elephant came off a market stall in a wet country. So a mountain needs no
teleportation and no dream sequence, and After Bedtime stays the game it was.
⚠️ Do NOT re-frame these as "imagination levels": the entire point is that they
are the one thing in the game that is real.

| map | idea | shape | the lesson it teaches |
|---|---|---|---|
| **terraces** 🌾 The Terraced Hills | a hillside cut into steps by somebody patient | 3 real levels, 15.4% of the board elevated (bookshelf 5.4%, oldoak 8.8%) | **height** tells you what you can SEE |
| **jungle** 🐯 The Deep Green | wet dark under a closed canopy | thickest stands in the game + a river basin + a 2-level temple platform | **light** tells you what you can BE SEEN from |

Deliberately opposite: the terraces are a staircase, the jungle is a ceiling.
Both are `outdoor: true` and get **no surround at all** — the OUTDOOR floor paints
their own horizon to every edge, and `addBedroom` would put walls around a mountain.

### `terraces:` — the generator this heightfield was always waiting for

`terraces: [{ i, j, r, levels, riser, flat }]` builds a stepped mountain as
concentric discs of INCREASING height and DECREASING radius; `Math.max` leaves
each ring standing as a flat shelf. Every tile-to-tile step across a ring
boundary is exactly **E/3 = 0.283 <= CLIMB**, so a whole mountain is walkable
from every direction **without one authored ramp**.

This matters beyond one map: the engine’s whole terrain vocabulary is whole
levels joined by E/3 collars, and a hillside rice terrace is literally that
shape. **`centerHill` was hard-capped at 2E; `terraces` climbs as far as `levels`
asks** — the first map in the game to reach level 3 (2.55).
⚠️ Shelf width is `riser + flat`, NOT `flat`. The summit is whatever radius `rad`
has left after the last level — check it, a summit under ~1.5 is a pinhead.
⚠️ **`addResourceNode` was generalised for this.** It hard-rejected any tile that
was not exactly {0, E, 2E}, so every shelf above level 2 would have been silently
**resource-dead** — a whole region nobody has a reason to walk to. It now takes any
WHOLE multiple of E; collar bands (E/3, 2E/3) still fail, which is the point.

### ⚠️ THE DRAW SCARE THAT WAS A MEASUREMENT ARTIFACT — and the control that caught it

The first build’s soaks came back **3 draws in 4 games**, which looks exactly like
the documented elevation-stalemate failure (two armies each parked on a shelf,
±25% elevation damage, neither able to profitably attack). A tune was written:
shrink the mountain, "high ground is contested ground, not a home".

**It was never applied, because the battery included a playmat control.**
48 games — terraces / jungle / **playmat control**, 8 mirrored pairings × 2 seeds,
hard AI, 14000-tick cap, 0 errors:

| map | games | decided | draws | draw % | avg length |
|---|---|---|---|---|---|
| terraces | 16 | 13 | 3 | **19%** | 6.7 min |
| jungle | 16 | 13 | 3 | **19%** | 5.5 min |
| **playmat (control)** | 16 | 13 | 3 | **19%** | 6.8 min |

**Identical on all three**, and 19% is inside the historical 13.5–22% band. The
alarm was the **9000-tick cap**, not the terrain: given room to finish, the new
maps conclude exactly as often as the flagship open map, and jungle resolves
FASTER. ⚠️ **A map battery that reports a draw rate without a control is reporting
nothing** — a tick-cap artifact and a real stalemate are indistinguishable.
The rejected tune is kept at `REJECTED-farplaces-tune.cjs.txt` in the scratchpad.

### ⚠️ IT STILL PHOTOGRAPHED FLAT — profile, not amplitude (again)

Balance was fine and the map still looked like a painted target on a flat mat.
**Two separate causes, and neither was amplitude:**
1. **Aspect ratio.** `r: 23` spread three levels over a 46-tile-wide dome — a 3.26
   unit rise over 23 tiles is an **8° grade**, a swell. Same diagnosis as the
   view-relief pass: PROFILE, NOT AMPLITUDE. `r: 16` runs the same three levels
   over a shorter run for a 12° grade, and the steps read as steps.
2. ⚠️⚠️ **THE PAINT DID NOT AGREE WITH THE TERRAIN.** The painter drew ~18
   decorative bunds at fixed texture radii over 60% of the board, while the
   heightfield stepped 9 times over 48% of it — lining up nowhere. **This is the
   law the ridge work already established** (`paintRidges` reads the SAME
   `mapCfg.ridges` the sim reads, so a wall is always painted where the wall is)
   and the terrace painter had violated it. It now REPLAYS THE GENERATOR’S OWN
   RING WALK from `mapCfg.terraces`, so every bund sits on a real riser and only
   whole levels get standing water. **Any new terrain feature must derive its
   paint from the same config the sim reads — never invent radii.**

⚠️ `ELEV_BOOST_CAP` (0.7) binds hard on a level-3 summit: 2.55 × 1.7 = 4.34 is
clamped to 3.25, so tall terrain gets proportionally LESS view exaggeration than
short terrain. Correct (it is what stops ridges spiking) but worth knowing before
wondering why a taller mountain did not look taller.

**Verified after the reshape** (the gates were re-run because the terrain changed):
movement 8/8 both maps × 4 seeds, 100% reach both seats, 0 pockets, seat spread 0,
every resource node reachable, determinism ok both maps, MP 2h+2ai inSync, 0 errors.
⚠️ Do NOT add `terraces:` to `generateRandomMap` until a random-map battery says so;
that generator already warns about fragmenting boards into pathing stalls.

### ⚠️ Two harness traps this run

- **A long battery must publish partial results.** The 48-game run only assigned
  its rows at the very end, so the first map’s finished 16 games were unreadable
  for 30 minutes. Write each slice to the window var as it completes.
- **`__ttStart` silently no-ops if a soak already made a Game** (invariant 2:
  `if (game) return`). A battery leaves one behind, so a later `__ttStart(d, map)`
  returns the SOAK’S map and you measure the wrong board — this cost a round and
  produced a fake "the generator only reaches 2 levels" bug report. **Start a map
  by URL (`?start=normal&map=<key>`) on a fresh load**, never after a battery.

## 🕯️ THE THREE AGES + THE NINE PATRONS (2026-08-25) — the AoM shape, properly

Kyle playtested: *"when i aged up to the playmat age i didnt get a choice of
civ/god or wishes"*, then *"there should be an initial choice and choice at each
age up so 3 and i think they should be represented by a character like age of
mythology"*, then *"each wish should also give you a one time usable god power."*
All three shipped. **66 wishes, 3 tiers, 9 patrons.**

**THE SHAPE (Age of Mythology, mapped exactly):**
- your **FACTION** = the major god, chosen at the menu.
- **three wishes**, one per age: match start (Bedtime) · the **Playmat age-up** ·
  the **Fort age-up**. The game has exactly 3 ages / 2 age-ups, so it lines up.
- each wish grants **ONE god power, ONE use**, aimed by the player.
- **THE NINE PATRONS** (`PATRONS` + `patronOf(lane,tier)` in data.js) are the
  minor gods — not toys, but the older awake things that were in the bedroom
  first: 🕯️ The Nightlight · ♨️ The Radiator · 🕰️ The Grandmother Clock (hearth
  1/2/3) · 🚪 The Door Left Ajar · 🪟 The Window · 🌙 The Moon in the Window
  (march) · 🧰 The Toy Box · 📚 The Bookshelf · 🛏️ Under the Bed (keep).
  Keyed by **(lane, tier)**, so every one of the 66 wishes derives its patron
  for free — no per-wish authoring. SHARED by all eight tribes on purpose: your
  tribe is yours, the room is older than all of you.

**THE TRIGGER — the age is the ceremony, the clock is only a floor:**
```
tier owed = wishOffered + 1
byAge   = p.age >= tier && time >= ageFloor(tier)      // 240s / 420s
byClock = time >= bell(tier) || (time >= early(tier) && stats.lost >= 6)
```
⚠️ **THE CLOCK IS A FLOOR, NEVER A CEILING.** WISHES.md §2.2's whole argument is
that a pressured player who never reaches the Fort Age must not be locked out of
a wish the winner gets. VERIFIED: a natural game ran ages **[3,2]** — one seat
reached Fort, one did not — and **both finished with 3 wishes**, the laggard's
arriving off the clock.
⚠️ **THE AGE-FLOOR EXISTS BECAUSE OF MARATHON.** `START_RES.marathon` is an 8×
multiplier one click away, and `AGE_UPS[1]` is 400+150+40s — so a marathon start
reaches the Playmat Age inside a minute and Wish II would open **on top of**
Wish I, both inside one 45s answer window. `ageFloor` 240 / `ageFloor3` 420.
INVARIANT: `bellEarly <= ageFloor < bell`, `ageFloor3 < bell3`.
⚠️ `bell3` is **570, measured**: 5/5 sampled games had a seat reach the Fort Age
and matches END at 660-812s — a floor at 660 delivers a wish as the game ends.
⚠️ **An unauthored tier is a NO-OP, never a consumed wish.** `openWish` used to
set `wishOffered = tier` on an empty offer, which silently ate a draft — Kyle's
own bug report, one age later. It now just returns and retries.

**ONE WISH = ONE GOD POWER = ONE USE.** All 66 powers are `charges: 1` (was
tier-1 2 / tier-2 1). ⚠️ The TOTAL is unchanged — old 2 wishes gave 2+1 = 3
casts, new 3 wishes give 1+1+1 = 3 — but each is now a distinct moment instead
of one power fired twice. **The Devout Echo (same lane twice) is the only way to
earn a second use**, which is what makes committing to a lane mean something.
Where a power's fiction is PLURAL it delivers that in one cast: `place` gained
`line: 8` (a wall run is a line or it is not a wall) and `placeany` gained
`count: 3`.

⚠️ **ID COLLISIONS ACROSS FLEET BLOCKS SILENTLY MERGE.** bricks and knights both
authored `kept`; `Object.assign` kept one and the other faction quietly got its
rival's card. The splicer now namespaces the loser (`knightsKept`) and rewrites
its menu. **Any multi-agent authoring splice must check for key collisions** —
and validate by IMPORTING the module, which is how the 23-instead-of-24 count
gave it away.
⚠️ Agents sometimes return blocks with literal backslash-n instead of newlines;
unescape rather than reject.

Verified: determinism ×3 tier-3-pinned pairs, MP 2h+2ai / 3h+1ai / mid-window
drop, 12-map sweep, the lockout test above, the marathon no-stack test, and the
full live three-age arc (three different patron trios, three one-use powers).

### ⚠️ THE KEEP LANE DRAWS, IT DOES NOT LOSE (tier-3 battery, 2026-08-25)

192 games (8 factions × 3 lane-pure triples × mirrored seats × 2 pools × **2
seed-sets**), personas pinned, 0 errors. Keep scores **43%** vs Hearth 65 /
March 62 — and it replicates on both seed-sets AND both pools, which normally
licenses a tune. **It does not here, and the breakdown is why:**

| lane | win | draw | loss |
|---|---|---|---|
| Hearth | 55% | 20% | 25% |
| March | 50% | 23% | 27% |
| **Keep** | **16%** | **55%** | **30%** |

**The loss rates are nearly identical.** Keep's cards prevent defeat exactly as
well as the other lanes' — it just never converts, and 55% of its games run the
clock out to a draw. **Buffing those cards would deepen the turtle and make the
draws WORSE.** Same shape as the boomer: a behavioural gap wearing a balance
problem's clothes. The fix is a **Keep-aware attack trigger** in `aiUpdate`, as
its own job with its own battery — not a number on a card.
**Confirming detail:** Keep is worst for the factions that already own defensive
mods (plush 25, classic/bricks/knights 31 — bricks/knights carry buildingHp
1.25/1.2) and BEST for the two with a buildingHp penalty (wranglers 69, plains
69). Defence stacked on defence is unbreakable and cannot close.
⚠️ And it is an AI reading: the AI cannot convert a defensive advantage, a human
can. Do not quote 43% as a player-facing number — same caveat class as the
Lost Toys human-only edge.
⚠️ Seat-0 was **62% vs 51%** across 192 pinned-persona games. Lower than the
historical 67-77%, still real, still cancelled only by mirroring.

### ⚠️ THE HALF-APPLIED WIDENING (tier-3 review, 2026-08-27)

33 agents, 9 unique defects, all fixed (WISHES.md §12.1). **The theme: opening
the Devout Echo to tier 3 left FOUR sibling gates at `=== 2`** — the card badge,
`aiPickWish`'s board census, its devout nudge, and the Informed Bell line. When
you widen a tier gate, grep the whole codebase for the old literal.
⚠️ `narrate()` is one-shot PER KEY — a tier loop reusing one key silences every
tier after the first. Key beats by tier.
⚠️ **A wish's bodies must MUSTER SOMEWHERE.** `gift.units`/`revive`/`claimCamp`
were anchored to a live Toy Chest and silently dropped without one — and a seat
is ALIVE without a chest, at exactly the 570s+ moment tier 3 lands.
`musterPoint()` falls back chest→production→dropoff→any building→any living toy.
Those gifts also passed `fromBuilding = true` and ATE `p.starNext` charges that
were sold as *train* rewards.
⚠️⚠️ **DO NOT APPLY A FINDER'S FIX BEFORE ITS VERIFIER REPORTS.** I applied a
"foe chips never shed" fix; the verifier proved the guard DELETES the feature (a
rival wish is revealed only once charges < max, which with one-use powers means
exactly 0 — so filter and reveal are mutually exclusive). Reverted to a cosmetic
label. The foe bar is a RECORD, not a live countdown.

## 🏔️ THE ROOM GETS A SHAPE (2026-08-27) — view-side relief, zero sim tiles moved

Kyle: *"i feel like we still need better maps that feel more like a world than
flat."* A 6-agent AoE research pass measured the cause, and it is NOT what it
looks like.

**⚠️ ELEV CANNOT BE RAISED — this is the load-bearing fact.** Every collar in the
game (dunes, centerHill, ridge skirts, the 4-step ramps) steps by `E/3`, and the
pathfinder gate is `|dh| <= CLIMB (0.3)`. That pins `E_max = 0.90`. ELEV is 0.85
— **94% of its legal maximum**. One nudge to 1.0 makes E/3 = 0.333 and every dune
in the game becomes an impassable cliff overnight. Never reach for ELEV.

**THE REAL CAUSE IS PROFILE, NOT AMPLITUDE.** `computeCorners()` averages the 4
touching tiles, so a plateau's 0.85 step is spread across three corner rows =
0.85 over 2 world units = **atan → 23°**. What the code calls a cliff renders as
a grassy swell. 0.85 is not small — a toy is ~0.55, so a level is already 1.5
toy-heights, the same ratio SC2 uses.

**THE FIX, entirely view-side:** `viewCornerH` (a second corner grid) carries a
`VIEW_ELEV 1.7` exaggeration plus a light `CORNER_BIAS 0.3`, and `heightAtWorld`
reads it. The ground mesh and every toy's Y both come from that one function, so
toys stand on the taller hills correctly.

**⚠️ WHY THIS IS NOT A 56-CALL-SITE SWAP.** Every CLIMB comparison in the game
reads **`tileHeight`** (the raw grid), not `heightAtWorld` — verified at pathing,
critters, cat/dog, formations and reachability. `addResourceNode`'s flat-check
reads `this.height` and the RAW `cornerH`. Nothing stores Y in `stateHash`. So
`heightAtWorld` has exactly ONE sim consumer: `applyDamage`'s ±0.4 elevation
rule — and scaling that threshold by the same multiplier (`HI = 0.4 * VIEW_ELEV`)
makes the comparison bit-identical. **fp verified byte-identical.**

**⚠️ TAPERED, NOT LINEAR** (`ELEV_BOOST_CAP 0.7`, a cap on what a corner may
GAIN). Ridge cores sit at `E*2.2 = 1.87` and already read; a flat 1.7× turned a
3-tile-wide ridge into a 3.2-unit spike wall. The terrain that needed help is the
LOW stuff — plateaus at 0.85, collars at 0.28.

**⚠️ CORNER-SNAPPING IS THE WRONG TOOL FOR A CLIFF FACE.** Plateau and ridge
boundaries are RASTERISED to tiles, so a strong bias makes that staircase crisp
and the edge **combs like a saw blade** — captured at 0.75 and 0.55, both
rejected from matched pairs. A whisper (0.3) gives lips definition without
revealing the rasterisation. Real cliff faces want the mesh subdivided and the
face painted in the map's own material (research ranks 2-3) — that is the next
pass, and it is the one that makes hard edges read.

### 🧭 `__ttPathAudit` — THE MOVEMENT CHECK (build it BEFORE touching terrain)

Kyle asked for movement checks across the board, and terrain is the easiest thing
here to break silently: a ridge that closes a corridor, a plateau that swallows a
resource pocket, a mask that strands a seat. None of it throws.
`window.__ttPathAudit({map, seed})` floods the board using the PathFinder's OWN
`isBlockedFor` and `climbable`, so it can never disagree with how a toy actually
moves. Reports per map+seed: `reach` (% of open land each seat can walk to),
`mutual` (can the seats reach EACH OTHER), `nodes` reachable, isolated `pockets`
of 12+ tiles, `spread` (the two seats within 2% — point-mirrored fairness), and a
single `pass`.
⚠️ Flood from a tile BESIDE the chest — the chest blocks its own footprint, so
flooding from (ti,tj) finds nothing and every map "fails". That was the harness's
first bug.
**BASELINE, all 12 maps: reach 99.6-100%, mutual true, ~0 pockets.** That number
IS the flatness — from your chest you can walk to essentially the whole board.
A map with real shape should read 70-85%, the lost coverage being cliffs and
treelines you go AROUND. Verified after the relief pass: **36/36 pass, min reach
99.1%, mutual everywhere** (walkability deliberately unchanged this pass).

## 🕯️ THE CAMPAIGN WISHES NOW (2026-08-27)

28 hand-tuned missions had the flagship system switched off. The original reason
was real — a free draft would quietly re-balance them — but the answer was never
to keep the best content in the game out of single-player. Two changes:

- **Both sides draft**, so a mission's balance shifts symmetrically instead of
  becoming a one-sided gift to the player.
- A mission may **script its picks as story beats** via `mission.wishes`
  (reusing the existing `wishScript` pin — the campaign can do the thing skirmish
  cannot), or opt out entirely with `mission.noWishes` if its scripted difficulty
  genuinely depends on the old shape.

⚠️ The gate is now `zeroEra || tutorial || noWishes` — it no longer keys off
`missionEvents`. **Toy Box Zero stays wish-free by `zeroEra`**, which is the
fiction ("no names for what they were feeling yet") and is verified: `zero`
returns `wishes=[0,0]` while all 27 other missions draft.

**Verified:** full 28-mission headless QA sweep, 0 errors, every non-prequel
mission drafting, median `wishesCast` 1.
⚠️ NOT yet measured: whether any specific mission got materially easier or
harder. The campaign has no battery; that needs a human playthrough or a
per-mission win-rate sweep against the pre-wish baseline. `mission.noWishes` is
the escape hatch if a mission turns out to need it.
