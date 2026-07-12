// ============================================================
// AGE OF TOYS — unit voice barks (text). Pure UI flavor: a toy
// says a line when you select it or send it somewhere. Never
// touches the sim. Keys: <unitKey> or <unitKey>@<faction> for
// tribe-specific overrides of shared units. kinds: sel/move/atk.
// ============================================================

export const BARKS = {
  _default: {
    sel: ['Reporting!', 'Ready to play.', 'You picked me!'],
    move: ['On my way.', 'Crossing the rug.'],
    atk: ['For the room!', 'No takebacks!'],
  },

  // ---- workers: each tribe hears its own ----
  worker: {
    sel: ['Small hands, big plans.', 'Where do you want it?', 'Buddy reporting!'],
    move: ['Walking, walking…', 'Shortcut through the rug.'],
    atk: ['I have a hammer and I am upset.', 'This counts as overtime!'],
  },
  'worker@bricks': {
    sel: ['Stud-side up!', 'Measured twice already.', 'Klik says hi.'],
    move: ['Laying a path as I go.', 'Snap, snap, snap.'],
    atk: ['I build. I can also un-build.', 'Structural criticism incoming!'],
  },
  'worker@plush': {
    sel: ['Soft but employed.', 'Mmh? Oh! Working!', 'Stuffed and ready.'],
    move: ['Waddling with purpose.', 'Save me a warm spot.'],
    atk: ['This hug is NOT optional.', 'Pardon me. Bonk.'],
  },
  'worker@racers': {
    sel: ['Pit crew, ready!', 'Clock me.', 'Zero to chores in two seconds.'],
    move: ['Racing line!', 'Beat you there.'],
    atk: ['Wrench says hello!', 'This is a penalty lap for YOU.'],
  },
  'worker@bots': {
    sel: ['Unit ready. Mostly wound.', 'Task queue open.', 'Beep. That means yes.'],
    move: ['Recalculating… done. Walking.', 'Tick, tick, tick.'],
    atk: ['Applying percussive maintenance.', 'Warranty: voided.'],
  },

  // ---- shared army: each tribe drills its own recruits ----
  'soldier@bricks': {
    sel: ['Load-bearing and proud.', 'Snapped in, sir.', 'Stud count nominal.'],
    move: ['Rerouting, brick by brick.', 'On the grid.'],
    atk: ['Time for demolition!', 'By the blueprint — CHARGE!'],
  },
  'soldier@plush': {
    sel: ['Reporting softly.', 'Seams tight, heart soft.', 'Present and huggable.'],
    move: ['Padding over.', 'Marshmallow march!'],
    atk: ['Fluff and fury!', 'For the Colonel!'],
  },
  'soldier@racers': {
    sel: ['Infantry, reluctantly.', 'I run everywhere, sir.', 'Pit crew combat division.'],
    move: ['Sprinting, obviously.', 'First one there wins!'],
    atk: ['Fast hands, faster fists!', 'Contact! Finally!'],
  },
  'soldier@bots': {
    sel: ['Unit answering. Wound to spec.', 'Orders parse cleanly.', 'Standing by. Literally standing.'],
    move: ['Executing walk.exe.', 'March cadence locked.'],
    atk: ['Hostility subroutine: GLEEFUL.', 'For the mainspring!'],
  },
  'scout@bricks': {
    sel: ['Surveyor ready.', 'I count studs AND enemies.', 'Measuring twice, riding once.'],
    move: ['Charting the way.', 'Site inspection, at speed.'],
    atk: ['Unplanned demolition!', 'This wasn\'t in the survey!'],
  },
  'scout@plush': {
    sel: ['Soft-pawed and silent.', 'I see everything. I judge nothing.', 'Whisker patrol!'],
    move: ['Tip-toe, tip-toe.', 'Sneaking adorably.'],
    atk: ['A scout must do what a scout must do!', 'Surprise cuddle of violence!'],
  },
  'scout@racers': {
    sel: ['Recon at redline.', 'Map? I AM the map.', 'Lap scout, ready.'],
    move: ['Gone already.', 'Corner. Corner. STRAIGHT.'],
    atk: ['Drive-by justice!', 'Didn\'t even slow down!'],
  },
  'scout@bots': {
    sel: ['Sensors warm.', 'Periscope legs deployed.', 'Observing. Always observing.'],
    move: ['Plotting optimal sneak.', 'Quiet servos engaged.'],
    atk: ['Data says: BONK.', 'Recon by fire!'],
  },
  'archer@bricks': {
    sel: ['Angles calculated.', 'String tension: regulation.', 'Trajectory approved by committee.'],
    move: ['Repositioning the firing line.', 'Higher ground, per the plans.'],
    atk: ['Loose, by the numbers!', 'Structural weakness: YOU!'],
  },
  'archer@plush': {
    sel: ['Bow strung with yarn and menace.', 'Softest sniper alive.', 'Eyes up here. Button eyes.'],
    move: ['Floating to a vantage.', 'Somewhere comfy with a view.'],
    atk: ['A volley of firm opinions!', 'Pillow-fletched and lethal-ish!'],
  },
  'archer@racers': {
    sel: ['Fastest draw in the toybox.', 'Arrows? Basically tiny cars.', 'Nocked before you asked.'],
    move: ['Racing to high ground.', 'Vantage lap!'],
    atk: ['Rapid release!', 'Eat fletching!'],
  },
  'archer@bots': {
    sel: ['Ballistics online.', 'Windage computed. Twice.', 'The math is loaded.'],
    move: ['Relocating firing solution.', 'New coordinates accepted.'],
    atk: ['Solution found: FIRE.', 'Precision, with feeling!'],
  },
  scout: {
    sel: ['Eyes open!', 'I saw something. I always see something.', 'Point me at the dark.'],
    move: ['Going where the map is grey!', 'Back before bedtime.'],
    atk: ['I am mostly legs, but FINE.', 'Surprise!'],
  },
  soldier: {
    sel: ['Molded ready, sir.', 'One pose, all heart.', 'Green and keen.'],
    move: ['Marching.', 'Boots first. Always boots first.'],
    atk: ['Hold the line!', 'For Greenboots!'],
  },
  spear: {
    sel: ['Pointy end forward, yes?', 'Toothpick brigade!', 'Anti-wheel department.'],
    move: ['Advancing politely.', 'Single file, big feelings.'],
    atk: ['Poke first, questions later!', 'Cavalry? What cavalry?'],
  },
  archer: {
    sel: ['String checked. Twice.', 'High shelf, please.', 'I see far and complain little.'],
    move: ['Relocating the archery club.', 'Somewhere with a view.'],
    atk: ['Rubber-tipped and righteous!', 'Loose!'],
  },
  flinger: {
    sel: ['Spoon loaded.', 'Physics is my co-pilot.', 'Got any marbles? Asking for the enemy.'],
    move: ['Rolling the argument forward.', 'Gravity travels with us.'],
    atk: ['INCOMING OPINION!', 'Catch!'],
  },
  raider: {
    sel: ['Wound up and morally flexible.', 'Fast. Questions slow.', 'Point me at their snacks.'],
    move: ['Gone before the echo.', 'Vroom means yes.'],
    atk: ['Uninvited and expensive!', 'Smash and dash!'],
  },
  catapult: {
    sel: ['The heavy argument is listening.', 'Walls fear me. Correctly.', 'Wound and profound.'],
    move: ['Slowly. Conclusively.', 'The siege takes the scenic route.'],
    atk: ['Delivering the verdict!', 'Duck, everyone!'],
  },
  ram: {
    sel: ['Doors. Show me doors.', 'Rolling pin of destiny.', 'Knock knock.'],
    move: ['Momentum en route.', 'Coming through. Eventually.'],
    atk: ['NO DOOR IS SAFE!', 'Open UP!'],
  },
  hero: {
    sel: ['The Kid picked me first. Every time.', 'Someone has to be brave first.', 'I carry the light.'],
    move: ['Follow the lamp!', 'Where I go, courage follows.'],
    atk: ['For every toy in the box!', 'Stories need this part!'],
  },
  medic: {
    sel: ['Needle, thread, and patience.', 'Who is leaking?', 'The stitching never stops.'],
    move: ['Coming — keep pressure on the seam!', 'Hold your stuffing in.'],
    atk: ['I heal. I can also UN-heal.', 'This will sting. Everything stings.'],
  },
  cart: {
    sel: ['Route memorized. Robbers memorized too.', 'Cargo happy, wheels happier.', 'Delivery buddy!'],
    move: ['Toot toot, commerce coming through.', 'The route provides.'],
    atk: ['I honk in your general direction!', 'This was NOT on the manifest!'],
  },
  hypno: {
    sel: ['Whose side are YOU on?', 'Round and round the question goes.', 'Look closely. Closer.'],
    move: ['Wobbling with intent.', 'Spinning over.'],
    atk: ['Forget your orders. Take mine.', 'You were always on our side.'],
  },
  king: {
    sel: ['The crown listens.', 'A king belongs with his toys.', 'Speak, Commander.'],
    move: ['The court travels.', 'Guard me well.'],
    atk: ['Even kings bite!', 'How DARE you.'],
  },

  // ---- faction uniques ----
  grenadier: {
    sel: ['Jacks in the bag, grin on the face.', 'Safety notes were read. Once.', 'Lobber, ready!'],
    move: ['Jangling forward.', 'Mind the bounce.'],
    atk: ['Fire in the toy hole!', 'Special delivery!'],
  },
  bazooka: {
    sel: ['Kneeling is a stance, not a mood.', 'Backblast area clear-ish.', 'Boom buddy, ready.'],
    move: ['Repositioning the kaboom.', 'Somewhere with sightlines.'],
    atk: ['Goodbye, wall!', 'AIMING AWAY FROM THE GOLDFISH!'],
  },
  tank: {
    sel: ['The General\'s own. Purring.', 'Treads warm, manners cold.', 'Armor answers.'],
    move: ['Advancing conclusively.', 'Flattening the debate.'],
    atk: ['One setting: FORWARD!', 'The turret agrees.'],
  },
  golem: {
    sel: ['Assembled and agreeable.', 'Every brick volunteered.', 'CLICK. Ready.'],
    move: ['Stomping in fourths.', 'The wall goes walking.'],
    atk: ['SHARE THE BRICKS!', 'Built to bonk.'],
  },
  lancer: {
    sel: ['Boing, sir!', 'Vertical solutions ready.', 'Springs checked!'],
    move: ['Boing. Boing. Boing.', 'Over, not through!'],
    atk: ['DEATH FROM UP-ISH!', 'Pogo says hello!'],
  },
  colossus: {
    sel: ['The cathedral is awake.', 'A thousand studs, one purpose.', 'We are assembled.'],
    move: ['Walking. The floor apologizes.', 'Processional pace.'],
    atk: ['BRICK BY BRICK, YOU FALL!', 'Hear the click of doom.'],
  },
  bear: {
    sel: ['Hug protocols ready.', 'Soft outside. Very outside.', 'Mrrph. Yes?'],
    move: ['Waddling to the rescue.', 'Save some war for me.'],
    atk: ['MANDATORY HUG!', 'This is an educational experience!'],
  },
  sockpuppet: {
    sel: ['Fresh from the drawer!', 'We volunteer! Both of us!', 'Sock and awe.'],
    move: ['Swaying that way.', 'Dance-marching!'],
    atk: ['UNFAIR? IT IS CALLED DANCING!', 'Flop attack!'],
  },
  mamabear: {
    sel: ['Who woke Mama?', 'The glass case is open. Regret it.', 'Where are my cubs.'],
    move: ['Coming. Slowly. Certainly.', 'The floor knows to clear.'],
    atk: ['THE HUG IS FINAL.', 'For the little ones!'],
  },
  drone: {
    sel: ['Airspace acquired.', 'Humming the one note I know.', 'Rotors ready.'],
    move: ['Flying over your traffic.', 'Altitude is an attitude.'],
    atk: ['Delivering the grudge!', 'Zap from above!'],
  },
  dragster: {
    sel: ['Hall record holder. Allegedly.', 'Green means GO and everything means green.', 'Fueled and foolish.'],
    move: ['THROUGH!', 'Watch the paint!'],
    atk: ['RAMMING SPEED!', 'The finish line is YOU!'],
  },
  monster: {
    sel: ['Idling at eleven.', 'Big wheels, bigger plans.', 'The weather report says ME.'],
    move: ['Everything is a ramp.', 'Rolling thunder, literally.'],
    atk: ['MONSTER JAM!', 'Your fort is my speed bump!'],
  },
  zapbot: {
    sel: ['Static: collected. Target: pending.', 'Carpet-charged and cheerful.', 'Bzzt. Hello.'],
    move: ['Shuffling to build charge.', 'Crackling over.'],
    atk: ['SHARE THE SPARK!', 'Tag. You are ionized.'],
  },
  titanbot: {
    sel: ['Three robots. One grudge.', 'Filing cabinet, walking.', 'Assembled opinion online.'],
    move: ['Clunk. Clunk. Progress.', 'Heavy thoughts en route.'],
    atk: ['DROPPED LIKE FURNITURE!', 'Processing: SMASH.'],
  },
  mecha: {
    sel: ['Every spare gear reporting.', 'The masterwork is listening.', 'Floorboards, brace.'],
    move: ['The workshop walks.', 'Advancing by the manual.'],
    atk: ['FULL WIND RELEASE!', 'Maintenance complete. YOURS BEGINS.'],
  },

  // ---- navy ----
  skimmer: {
    sel: ['Nets ready! Water tidy!', 'The bath provides.', 'Skimming service, ahoy.'],
    move: ['Paddling over.', 'Reading the ripples.'],
    atk: ['I have a net and NO fear!', 'Rude! Splashing rudely back!'],
  },
  tugboat: {
    sel: ['Ferry line, armed division.', 'Departures on time. Always.', 'Toot.'],
    move: ['Chugging over.', 'Mind the wake.'],
    atk: ['ALL ABOARD THE PROBLEM!', 'Harbor rules: MY rules!'],
  },
  duckboat: {
    sel: ['Squeak of war, ready.', 'Adorable is a weapons class.', 'Quack. Tactically.'],
    move: ['Paddling menacingly.', 'Bobbing on approach.'],
    atk: ['SQUEAK AND DESTROY!', 'Fear the bath toy!'],
  },
  'navy-classic': {
    sel: ['Destroyer answering.', 'Gray, grave, and floating.', 'Deck gun polished, sir.'],
    move: ['Steaming as ordered.', 'Making way.'],
    atk: ['Fire mission: the deep end!', 'By the book — BOOM.'],
  },
  'navy-bricks': {
    sel: ['Ironclad. Emphasis on clad.', 'Slow is a strategy.', 'Displacing water and doubt.'],
    move: ['Still coming. Notice that.', 'Turning… turning… turned.'],
    atk: ['THE WALL FLOATS AND FIGHTS!', 'Stud-side cannon!'],
  },
  'navy-plush': {
    sel: ['Should not float. Floats anyway.', 'Cork, courage, and a teddy up front.', 'Arr, softly.'],
    move: ['Sailing on stubbornness.', 'The patchwork catches wind!'],
    atk: ['BOARD THEM WITH KINDNESS! AND CANNON!', 'Yo ho, gently!'],
  },
  'navy-racers': {
    sel: ['Photo finish, floating edition.', 'Four capsizes, four podiums.', 'Throttle: yes.'],
    move: ['Wake? What wake? MY wake.', 'Lap of the bath!'],
    atk: ['TORPEDO LINE!', 'Eat spray!'],
  },
  'navy-bots': {
    sel: ['Running silent. Saying this quietly.', 'Periscope sees all.', 'Tick… tick… ready.'],
    move: ['Diving to cruising depth.', 'Plotting the quiet way.'],
    atk: ['CALCULATED SPLASH!', 'Torpedo, with regards.'],
  },
};
