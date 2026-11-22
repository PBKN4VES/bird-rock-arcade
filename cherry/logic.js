// Cherry Catch: game rules with no drawing code, so they can be tested on their own.
// Works in the browser (window.CherryLogic) and in Node (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CherryLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Size. Canvas y grows downward. Everything is in canvas pixels and seconds; these are the numbers to tune.
  var W = 240, H = 320;
  var BASKET_Y = 290;          // rim height: a cherry is caught when its center passes this line
  var BASKET_W = 44;           // basket width
  var BASKET_SPEED = 420;      // px/s, the fastest the basket moves toward its target (mouse, touch and keys alike)
  var CHERRY_R = 7;
  var GROUND_Y = 312;          // below this a cherry is gone
  var SKY_BAND = 120;          // input only: the top of the canvas does not steer, so a tap there can scare the bird
  var CATCH_SLACK = 2;         // px of forgiveness either side of the basket

  // Rules
  var MAX_LIVES = 3;
  var POINTS_RED = 10;
  var COMBO_CAP = 5;
  var STAGES = ['green', 'yellow', 'orange', 'red'];
  var MISSES_PER_LIFE = 0;     // 0 = a missed red never costs a life; 3 = every third missed red does (feel-test switch)
  var FIRST_SPAWN = 1.0;       // seconds of "ready" before the first cherry appears

  // Difficulty ramp: everything moves in one direction by seconds into the run, and stops at its cap.
  var RAMP_END = 120;          // seconds until the ramp reaches its caps
  var FALL_START = 70, FALL_CAP = 190;           // fall speed, px/s
  var SPAWN_START = 1.0, SPAWN_CAP = 0.36;       // seconds between cherries
  var RED_START = 0.2, RED_CAP = 0.5;            // share of cherries that are ripe
  var BIRD_EVERY_START = 16, BIRD_EVERY_CAP = 6;  // seconds between birds
  var BIRD_FIRST = 12;         // no bird before this many seconds

  // Spawn fairness (the part that makes the game beatable)
  var SPAWN_TRIES = 8;         // tries to find a fair x; the spawn is skipped if none works
  var SAME_TIME = 0.15;        // two cherries arriving this close together must not both fit in one basket if either is bad
  var REACH_FACTOR = 0.8;      // two reds must be reachable from each other at 80% of basket speed
  var WALL_WINDOW = 0.3, WALL_MAX = 2;   // at most 2 cherries arrive in any 0.3 s, so there is always a safe place to stand

  // Bird
  var BIRD_WARN = 0.8;         // seconds of heads-up (the bird crosses the top) before it locks on; shrinks to BIRD_WARN_CAP with the ramp.
                             // Shorter than before (1.2 and 0.8): the lock-on now carries the time budget (Roger, 2026-11-20)
  var BIRD_WARN_CAP = 0.4;
  var BIRD_CROSS = 230;        // px the bird covers across the top during the warning
  var BIRD_Y = 40;             // height it flies at during the warning
  var BIRD_SPEED = 260;        // px/s while swooping or flying off; rises to BIRD_SPEED_CAP with the ramp, so late cherries can still be reached
  var BIRD_SPEED_CAP = 460;
  var BIRD_GRAB_R = 8;         // px: steals when its center is this close to the cherry's
  var STEAL_LINE = BASKET_Y - 40;   // the bird never steals below this, so it never snatches from inside the basket
  var BIRD_TOUGH2 = 40, BIRD_TOUGH3 = 80;   // from these seconds on, a bird needs 2 (then 3) shoos before it gives up (Roger, 2026-11-19)
  var BIRD_REGROUP = 0.6;      // a shooed-but-not-beaten bird flies back up, waits this long, then locks on again
  // Lock-on (Roger, 2026-11-20): the dotted line and ring appear on the target BEFORE the dive, and a shoo only counts from then on.
  // The bird's mere presence is not the trigger; the line is. Shrinks with the ramp like the warning, but never below BIRD_LOCK_CAP.
  var BIRD_LOCK = 0.6;
  var BIRD_LOCK_CAP = 0.4;

  // Items (Roger, 2026-11-20: still too easy; add things to dodge and things to grab). First-guess numbers, tuned from play.
  var ROCK_FROM = 25;                      // rocks never fall before this many seconds
  var ROCK_START = 0.07, ROCK_CAP = 0.16;  // share of spawns that are rocks
  var BAT_FROM = 35, BAT_START = 0.06, BAT_CAP = 0.12;
  var BAT_AMP = 20, BAT_PERIOD = 0.9;      // a bat zig-zags 20 px either side of its line, one full wiggle every 0.9 s
  var LEAF_FROM = 15, LEAF_START = 0.06, LEAF_CAP = 0.10;
  var LEAF_AMP = 28, LEAF_PERIOD = 2.4, LEAF_FALL = 0.55;   // a leaf drifts side to side and falls at 55% of the normal speed
  // Random fall speed (Roger, 2026-11-21): each falling thing gets its own speed, random and NOT tied to its kind, within +/- a spread
  // of the normal fall speed. The spread grows with the ramp. Leaves are exempt (they already drift on purpose).
  var VARY_START = 0.08, VARY_CAP = 0.20;
  var SWAY_MARGIN = 6;                     // extra px of space the spawner keeps around swaying items
  var POWER_FROM = 20, POWER_GAP_MIN = 20, POWER_GAP_MAX = 30;   // power-up slots
  var POWER_KINDS = ['cup', 'scarecrow', 'sun'];
  var POWER_TIME = { cup: 5, scarecrow: 10, sun: 4 };
  var POWER_NAMES = { cup: 'Coffee Cup', scarecrow: 'Scarecrow', sun: 'Sunshine' };
  var SLOW_FACTOR = 0.65;                  // coffee cup: everything that falls moves at 65% speed
  var GOLD_FROM = 60, GOLD_MIN_GAP = 90, GOLD_CHANCE = 0.15;   // golden cherry: +1 life, rare
  // End card: each red cherry caught stands for 1 kg of ripe cherries picked, and about 5 kg of ripe cherries dry-mill down to
  // 1 kg of green coffee. So one catch = 0.2 kg. (A game rule built on a rough real ratio, not a measured yield.)
  var KG_PER_CHERRY = 0.2;
  function kilosFor(picked) { return Math.round(picked * KG_PER_CHERRY * 10) / 10; }

  // Ranks, highest first. Thresholds come from the perfect-play bot in logic.test.js.
  var RANKS = [
    { name: 'Head Roaster', min: 4000 },     // a perfect bot scores 4460 to 5780 in 150 s
    { name: 'Farm Manager', min: 2500 },
    { name: 'Harvest Lead', min: 1200 },
    { name: 'Cherry Picker', min: 400 },
    { name: 'Apprentice Picker', min: 0 }
  ];

  // ---- ramp ----
  function ramp(t) { return Math.max(0, Math.min(1, t / RAMP_END)); }
  function lerp(a, b, k) { return k >= 1 ? b : a + (b - a) * k; }   // exact at the cap
  function fallSpeed(t) { return lerp(FALL_START, FALL_CAP, ramp(t)); }
  function spawnEvery(t) { return lerp(SPAWN_START, SPAWN_CAP, ramp(t)); }
  function redChance(t) { return lerp(RED_START, RED_CAP, ramp(t)); }
  function birdEvery(t) { return lerp(BIRD_EVERY_START, BIRD_EVERY_CAP, ramp(t)); }
  // Each bird's speed and warning are fixed when it appears. Cherries fall faster as the run goes on, so the bird has to as well,
  // or by the time a late warning ends every red is already too low to steal (found in play-testing, 2026-11-19).
  function birdSpeed(t) { return lerp(BIRD_SPEED, BIRD_SPEED_CAP, ramp(t)); }
  function birdWarn(t) { return lerp(BIRD_WARN, BIRD_WARN_CAP, ramp(t)); }
  function birdLock(t) { return lerp(BIRD_LOCK, BIRD_LOCK_CAP, ramp(t)); }
  // The spread of random fall speeds at time t: 0.08 at the start, 0.20 from the end of the ramp. `override` (the ?vary= switch) fixes it.
  function varySpread(t, override) { return override === null || override === undefined ? lerp(VARY_START, VARY_CAP, ramp(t)) : override; }
  function rockChance(t) { return t < ROCK_FROM ? 0 : lerp(ROCK_START, ROCK_CAP, ramp(t)); }
  function batChance(t) { return t < BAT_FROM ? 0 : lerp(BAT_START, BAT_CAP, ramp(t)); }
  function leafChance(t) { return t < LEAF_FROM ? 0 : lerp(LEAF_START, LEAF_CAP, ramp(t)); }

  // Repeatable random numbers (mulberry32). All randomness goes through w.rng; never Math.random in here.
  function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var x = a;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Falling things carry a `kind`: 'cherry', the hazards 'rock', 'bat', 'leaf', and the pickups 'cup', 'scarecrow', 'sun', 'gold'.
  function isRed(c) { return c.kind === 'cherry' && c.stage === 'red'; }
  // "Bad" = something the spawner must never let one basket position catch together with anything else by accident.
  function isBad(c) { return (c.kind === 'cherry' && c.stage !== 'red') || c.kind === 'rock' || c.kind === 'bat' || c.kind === 'leaf'; }
  function isPower(c) { return c.kind === 'cup' || c.kind === 'scarecrow' || c.kind === 'sun' || c.kind === 'gold'; }
  function swaysItem(c) { return c.kind === 'bat' || c.kind === 'leaf'; }
  // Where the item will be when it reaches the rim. Bats and leaves sway, so this is not their x now; straight fallers: just x.
  function arriveX(c) { return c.ax === undefined ? c.x : c.ax; }

  function newWorld(opts) {
    opts = opts || {};
    var t0 = opts.startT || 0;
    return {
      t: t0, score: 0, lives: opts.lives || MAX_LIVES, maxLives: Math.max(MAX_LIVES, opts.lives || MAX_LIVES), combo: 1, bestCombo: 1, picked: 0,
      cherries: [], bird: null, basketX: W / 2, targetX: W / 2, over: null,
      rng: opts.rng || makeRng(opts.seed === undefined ? 1 : opts.seed),
      missesPerLife: opts.missesPerLife === undefined ? MISSES_PER_LIFE : opts.missesPerLife,
      speedScale: opts.speedScale || 1, vary: opts.vary === undefined ? null : opts.vary, birdsOn: opts.birds !== false,
      birdDir: 1, misses: 0, steals: 0, scares: 0, birdsSeen: 0, nextId: 1, pending: [],
      itemsOn: opts.items !== false, rocksOn: opts.rocks !== false, batsOn: opts.bats !== false, leavesOn: opts.leaves !== false,
      power: null, speedMul: 1, lastPower: null, lastGold: -1e9, goldNow: !!opts.golden, firstPower: opts.power || null, cause: null,
      nextPower: opts.power || opts.golden ? t0 + FIRST_SPAWN + 1 : Math.max(POWER_FROM, t0 + 5), powersCaught: 0, rocksCaught: 0, batsCaught: 0, leavesCaught: 0, golds: 0,
      nextSpawn: t0 + FIRST_SPAWN, nextBird: Math.max(BIRD_FIRST, t0 + 4)
    };
  }

  function clampX(x) { return Math.max(BASKET_W / 2, Math.min(W - BASKET_W / 2, x)); }
  function setTarget(w, x) { w.targetX = clampX(x); }

  // When a cherry reaches the rim. Known at spawn because its fall speed never changes.
  function arrivalTime(w, c) { return c.arrive; }
  // The red cherry closest to the ground, or null.
  function lowestRed(w) {
    var best = null;
    for (var i = 0; i < w.cherries.length; i++) {
      var c = w.cherries[i];
      if (isRed(c) && (!best || c.y > best.y)) best = c;
    }
    return best;
  }

  function rankFor(score) {
    for (var i = 0; i < RANKS.length; i++) if (score >= RANKS[i].min) return RANKS[i].name;
    return RANKS[RANKS.length - 1].name;
  }

  // ---- spawning ----
  function pickStage(w) {
    var p = ramp(w.t);
    if (w.rng() < redChance(w.t)) return 'red';
    // Early cherries are mostly green; later more are orange.
    var g = 0.6 - 0.3 * p, y = 0.3, r = w.rng();
    if (r < g) return 'green';
    if (r < g + y) return 'yellow';
    return 'orange';
  }

  // Is a new cherry at x (arriving at time `arrive`) fair given everything already falling?
  function fairSpawn(w, cand) {
    var near = [], i, c, mul = w.speedMul || 1;
    // Gaps are measured in normal-speed seconds (real gap x speedMul). Slow-motion stretches every gap by the same amount, so a
    // layout that is fair at normal speed stays fair while slowed and after it ends; one placed fair only while slowed would not.
    for (i = 0; i < w.cherries.length; i++) {
      c = w.cherries[i];
      var d = Math.abs(c.arrive - cand.arrive) * mul, dx = Math.abs(arriveX(c) - arriveX(cand));
      var margin = BASKET_W + 4 + (swaysItem(c) || swaysItem(cand) ? SWAY_MARGIN : 0);
      // (a) a red can never be caught together with a bad thing by accident (and no two bad ones together)
      if (d < SAME_TIME && (isBad(c) || isBad(cand)) && !(dx > margin)) return false;
      // (b) every red is reachable from every other red, whichever lands first
      if (isRed(cand) && isRed(c) && dx > BASKET_SPEED * d * REACH_FACTOR) return false;
      if (d < WALL_WINDOW) near.push(c.arrive * mul);
    }
    // (c) no walls: at most WALL_MAX cherries arrive within any WALL_WINDOW
    near.push(cand.arrive * mul);
    near.sort(function (a, b) { return a - b; });
    for (i = 0; i < near.length; i++) {
      var n = 0;
      for (var j = i; j < near.length && near[j] - near[i] < WALL_WINDOW; j++) n++;
      if (n > WALL_MAX) return false;
    }
    return true;
  }

  // Which kind comes next? A power-up slot (when one is due) beats the normal roll. Returns {kind, slot}.
  function powerFalling(w) {
    for (var i = 0; i < w.cherries.length; i++) if (isPower(w.cherries[i])) return true;
    return false;
  }
  function chooseKind(w) {
    if (w.itemsOn && w.t >= w.nextPower && !w.power && !powerFalling(w)) {
      var gold = (w.goldNow || (w.t >= GOLD_FROM && w.t - w.lastGold >= GOLD_MIN_GAP && w.rng() < GOLD_CHANCE)) && w.lives < w.maxLives;
      if (gold) return { kind: 'gold', slot: true };
      if (w.firstPower) return { kind: w.firstPower, slot: true };
      var opts = POWER_KINDS.filter(function (k) { return k !== w.lastPower; });
      return { kind: opts[Math.floor(w.rng() * opts.length)], slot: true };
    }
    if (w.itemsOn) {
      var r = w.rng(), rock = w.rocksOn ? rockChance(w.t) : 0, bat = w.batsOn ? batChance(w.t) : 0, leaf = w.leavesOn ? leafChance(w.t) : 0;
      if (r < rock) return { kind: 'rock' };
      if (r < rock + bat) return { kind: 'bat' };
      if (r < rock + bat + leaf) return { kind: 'leaf' };
    }
    return { kind: 'cherry' };
  }

  // Everything that falls is made here. A new thing is only added where it is fair (see fairSpawn); if no spot works it is skipped.
  // A skipped power-up slot is not forced: it tries again at the next spawn.
  function spawnThing(w) {
    var pick = chooseKind(w), kind = pick.kind;
    var stage = kind === 'cherry' ? (w.power && w.power.kind === 'sun' ? 'red' : pickStage(w)) : null;
    var vy = fallSpeed(w.t) * w.speedScale * (kind === 'leaf' ? LEAF_FALL : 1);
    // A random speed for this one item, chosen once, before the fairness checks, so they judge its real arrival time.
    var spread = kind === 'leaf' ? 0 : varySpread(w.t, w.vary);
    if (spread > 0) vy *= 1 + spread * (2 * w.rng() - 1);
    var T = (BASKET_Y + CHERRY_R) / vy;       // seconds of item-time from spawn to the rim
    var cand = { id: w.nextId, kind: kind, stage: stage, x: 0, y: -CHERRY_R, vy: vy, arrive: w.t + T / w.speedMul, spin: w.rng(), age: 0 };
    var lo = CHERRY_R + 2, hi = W - CHERRY_R - 2;
    for (var k = 0; k < SPAWN_TRIES; k++) {
      if (swaysItem(cand)) {
        var amp = kind === 'bat' ? BAT_AMP : LEAF_AMP, per = kind === 'bat' ? BAT_PERIOD : LEAF_PERIOD;
        cand.amp = amp; cand.omega = 2 * Math.PI / per; cand.phase = w.rng() * 2 * Math.PI;
        cand.x0 = lo + amp + w.rng() * (hi - lo - 2 * amp);
        cand.x = cand.x0 + amp * Math.sin(cand.phase);
        cand.ax = cand.x0 + amp * Math.sin(cand.omega * T + cand.phase);
      } else cand.x = lo + w.rng() * (hi - lo);
      if (fairSpawn(w, cand)) {
        w.nextId++; w.cherries.push(cand);
        if (pick.slot) {
          w.nextPower = w.t + POWER_GAP_MIN + w.rng() * (POWER_GAP_MAX - POWER_GAP_MIN);
          w.firstPower = null;
          if (kind === 'gold') { w.lastGold = w.t; w.goldNow = false; } else w.lastPower = kind;
        }
        return cand;
      }
    }
    return null;
  }

  // ---- the bird ----
  // Which red can the bird reach soonest, flying straight at it, while it is still above STEAL_LINE?
  // Steps the cherry's known path forward in 1/60 s steps with the bird homing on it, the same way stepWorld moves them.
  // `delay`: seconds the bird hovers (locked on) before it starts to move; cherries keep falling meanwhile.
  function pickTarget(w, bird, delay) {
    var best = null, mv = (bird.speed || BIRD_SPEED) / 60, mul = w.speedMul || 1;
    delay = delay || 0;
    for (var i = 0; i < w.cherries.length; i++) {
      var c = w.cherries[i];
      if (!isRed(c) || c.y > STEAL_LINE) continue;
      var bx = bird.x, by = bird.y, cvy = c.vy * mul, cy = c.y + cvy * delay;
      if (cy > STEAL_LINE) continue;
      for (var s = 1; s <= 480; s++) {
        cy += cvy / 60;
        if (cy > STEAL_LINE) break;
        var dx = c.x - bx, dy = cy - by, d = Math.sqrt(dx * dx + dy * dy);
        if (d <= mv) { bx = c.x; by = cy; d = 0; } else { bx += dx / d * mv; by += dy / d * mv; d -= mv; }
        if (d <= BIRD_GRAB_R) { if (!best || s < best.s) best = { cherry: c, s: s, eta: s / 60 + delay }; break; }
      }
    }
    return best;
  }

  // A bird is only sent when it could actually take a red: look ahead to the end of its warning (cherries keep falling meanwhile)
  // and see whether any red is still within its reach. Otherwise a bird would arrive with nothing to steal.
  // If the player catches that red meanwhile, the bird just flies off.
  function redWorthWatching(w) {
    var warn = birdWarn(w.t), lock = birdLock(w.t), ahead = [];
    for (var i = 0; i < w.cherries.length; i++) {
      var c = w.cherries[i];
      if (isRed(c)) ahead.push({ kind: c.kind, stage: c.stage, x: c.x, y: c.y + c.vy * (w.speedMul || 1) * warn, vy: c.vy });
    }
    var from = { x: w.birdDir > 0 ? -10 + BIRD_CROSS : W + 10 - BIRD_CROSS, y: BIRD_Y, speed: birdSpeed(w.t) };
    return !!pickTarget({ cherries: ahead, speedMul: w.speedMul }, from, lock);
  }
  // How many shoos a bird that appears at time t takes before it flies off for good.
  function shoosNeeded(t) { return t >= BIRD_TOUGH3 ? 3 : t >= BIRD_TOUGH2 ? 2 : 1; }
  function spawnBird(w, ev) {
    var dir = w.birdDir;
    w.birdDir = w.rng() < 0.5 ? 1 : -1;
    w.birdsSeen++;
    w.bird = { id: w.birdsSeen, needs: shoosNeeded(w.t), shoos: 0, speed: birdSpeed(w.t), warn: birdWarn(w.t), lock: birdLock(w.t), state: 'warn', dir: dir, x: dir > 0 ? -10 : W + 10, y: BIRD_Y, stateT: 0, swoopT: 0, target: 0, repicks: 0, loot: false, vx: 0, vy: 0 };
    ev.push({ type: 'warn', dir: dir });
  }
  function leave(b) {
    b.state = 'leaving';
    var dir = b.x < W / 2 ? -1 : 1;
    b.vx = dir * b.speed * 0.8; b.vy = -b.speed * 0.6;
  }
  // The bird picks its cherry and hovers: the dotted line and ring show now, and the player can shoo it from now on.
  function beginLock(w, ev) {
    var b = w.bird, pick = pickTarget(w, b, b.lock);
    if (!pick) { leave(b); return; }          // nothing to go for: it just flies away
    b.state = 'lock'; b.target = pick.cherry.id; b.stateT = 0; b.eta = pick.eta;
    ev.push({ type: 'lock', targetId: pick.cherry.id, lock: b.lock, eta: pick.eta });
  }
  function beginSwoop(w, ev) {
    var b = w.bird;
    b.state = 'swoop'; b.swoopT = 0;
    ev.push({ type: 'swoop', targetId: b.target, eta: b.eta - b.lock });
  }
  function findCherry(w, id) {
    for (var i = 0; i < w.cherries.length; i++) if (w.cherries[i].id === id) return w.cherries[i];
    return null;
  }
  function stepBird(w, dt, ev) {
    var b = w.bird;
    var scarecrow = w.power && w.power.kind === 'scarecrow';
    // With the scarecrow up, birds still come, but the moment one would lock on it caws and flies off (Roger, 2026-11-21).
    // A bird already locked on or diving when the scarecrow is caught caws and flies off at once. It can never steal.
    if (scarecrow && b && b.state !== 'leaving' && b.state !== 'warn') {
      leave(b); ev.push({ type: 'scare', left: 0, by: 'scarecrow' }); return;
    }
    if (!b) {
      if (w.birdsOn && w.t >= w.nextBird && redWorthWatching(w)) spawnBird(w, ev);
      return;
    }
    if (b.state === 'warn') {
      b.x += b.dir * (BIRD_CROSS / b.warn) * dt; b.stateT += dt;
      if (b.stateT >= b.warn) {
        if (scarecrow) { leave(b); ev.push({ type: 'scare', left: 0, by: 'scarecrow' }); }
        else beginLock(w, ev);
      }
    } else if (b.state === 'lock') {           // hovering, line on the target; the dive starts when the lock-on ends
      b.stateT += dt;
      var lc = findCherry(w, b.target);
      if (!lc || lc.y > STEAL_LINE) { leave(b); return; }   // the player caught it (or it fell too low): the bird gives up
      if (b.stateT >= b.lock) beginSwoop(w, ev);
    } else if (b.state === 'swoop') {
      b.swoopT += dt;
      var c = findCherry(w, b.target);
      if (!c || c.y > STEAL_LINE) {            // caught, missed or too low to steal: look once more, then give up
        var pick = b.repicks < 1 ? pickTarget(w, b) : null;
        b.repicks++;
        if (!pick) { leave(b); return; }
        c = pick.cherry; b.target = c.id; b.eta = pick.eta;
      }
      var dx = c.x - b.x, dy = c.y - b.y, d = Math.sqrt(dx * dx + dy * dy), mv = b.speed * dt;
      if (d <= mv) { b.x = c.x; b.y = c.y; d = 0; } else { b.x += dx / d * mv; b.y += dy / d * mv; d -= mv; }
      if (d <= BIRD_GRAB_R) {                  // a steal: the cherry is gone and it costs a life (Roger, 2026-11-20)
        w.cherries.splice(w.cherries.indexOf(c), 1);
        w.steals++; b.loot = true;
        ev.push({ type: 'steal', stage: c.stage, x: c.x, y: c.y, livesLeft: Math.max(0, w.lives - 1) });
        leave(b);
        loseLife(w, ev, 'bird');
      }
    } else if (b.state === 'regroup') {        // shooed but not beaten: climbs back to the top, then comes again
      b.stateT += dt;
      if (b.y > BIRD_Y) b.y = Math.max(BIRD_Y, b.y - b.speed * dt);
      if (b.stateT >= BIRD_REGROUP && b.y <= BIRD_Y) beginLock(w, ev);
    } else {                                   // leaving
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -16 || b.x < -20 || b.x > W + 20) {
        w.bird = null; w.nextBird = w.t + birdEvery(w.t);
        ev.push({ type: 'birdGone' });
      }
    }
  }

  // Tap, click or Space on the bird. True if it counted: only once the bird has locked on (the dotted line is showing) or is diving.
  // While it crosses the sky (warn) or climbs back (regroup) a shoo does nothing: the line is the cue, not the bird's presence.
  // A tougher bird (see shoosNeeded) backs off and comes again until it has been shooed enough times.
  function scareBird(w) {
    var b = w.bird;
    if (!b || w.over || (b.state !== 'lock' && b.state !== 'swoop')) return false;
    b.shoos++; w.scares++;
    if (b.shoos >= b.needs) { leave(b); w.pending.push({ type: 'scare', left: 0 }); }
    else { b.state = 'regroup'; b.stateT = 0; w.pending.push({ type: 'scare', left: b.needs - b.shoos }); }
    return true;
  }

  // End-card lines by what cost the last life (3 each).
  var LINES = {
    cherry: ['Not ripe yet. Red means ready.', 'That one needed more time on the branch.', 'Green is for next week.'],
    rock: ['Rock bottom!', 'That was a rock, not a cherry.', 'Hard to roast a rock.'],
    bat: ['Bats in the basket!', 'Something with wings in there.', 'That was no cherry.'],
    bird: ['The bird got the last one.', 'Fine feathered thief.', 'Birds eat first around here.']
  };
  function pickLine(cause, rng) {
    var l = LINES[cause] || LINES.cherry;
    return l[Math.floor((rng || Math.random)() * l.length) % l.length];
  }

  // ---- the main step ----
  // What cost the last life decides the line on the end card: 'cherry', 'rock', 'bat', 'bird' (or 'miss' with the miss-3 switch).
  function loseLife(w, ev, cause) {
    w.lives--; w.combo = 1; w.cause = cause || 'cherry';
    if (w.lives <= 0) { w.lives = 0; w.over = 'lives'; ev.push({ type: 'over', kind: 'lives', cause: w.cause }); return true; }
    return false;
  }
  function setSpeedMul(w) {
    var m = w.power && w.power.kind === 'cup' ? SLOW_FACTOR : 1;
    if (m === w.speedMul) return;
    w.speedMul = m;
    // Arrival times are real seconds, so they change when time slows or speeds up. Every item scales the same way, so spacing is kept.
    for (var i = 0; i < w.cherries.length; i++) { var c = w.cherries[i]; c.arrive = w.t + (BASKET_Y - c.y) / (c.vy * m); }
  }
  function endPower(w, ev, replaced) {
    var k = w.power.kind;
    w.power = null;
    ev.push({ type: 'powerEnd', kind: k, replaced: !!replaced });
  }
  function catchPickup(w, c, ev) {
    if (c.kind === 'gold') {
      w.golds++;
      if (w.lives < w.maxLives) w.lives++;
      ev.push({ type: 'life', lives: w.lives, x: c.x });
      return;
    }
    if (w.power) endPower(w, ev, true);
    w.power = { kind: c.kind, left: POWER_TIME[c.kind] };
    w.powersCaught++;
    if (c.kind === 'sun') {
      for (var i = 0; i < w.cherries.length; i++) {
        var o = w.cherries[i];
        if (o.kind === 'cherry' && o.stage !== 'red') { o.stage = 'red'; o.sunny = true; }   // sunny: not placed fairly as a red; a miss is free
      }
    }
    setSpeedMul(w);
    ev.push({ type: 'power', kind: c.kind, time: POWER_TIME[c.kind], x: c.x });
  }

  function stepWorld(w, dt) {
    var ev = w.pending.splice(0), i;
    if (w.over || !(dt > 0)) return ev;

    // The basket heads for the target at no more than BASKET_SPEED.
    var gap = w.targetX - w.basketX, mv = BASKET_SPEED * dt;
    w.basketX = Math.abs(gap) <= mv ? w.targetX : w.basketX + (gap > 0 ? mv : -mv);

    // Things that fall (and the spawn timer) run on item-time: the coffee cup slows them. The basket and the bird keep real time.
    var idt = dt * w.speedMul;
    if (w.t >= w.nextSpawn) { spawnThing(w); w.nextSpawn = w.t + spawnEvery(w.t) / w.speedMul; }

    // Things fall; catches and misses.
    var keep = [], sunny = w.power && w.power.kind === 'sun';
    for (i = 0; i < w.cherries.length; i++) {
      var c = w.cherries[i], prev = c.y;
      c.y += c.vy * idt; c.age += idt;
      if (c.amp) c.x = c.x0 + c.amp * Math.sin(c.omega * c.age + c.phase);
      if (prev < BASKET_Y && c.y >= BASKET_Y && Math.abs(c.x - w.basketX) <= BASKET_W / 2 + CATCH_SLACK) {
        if (isRed(c)) {
          var pts = POINTS_RED * w.combo;
          w.score += pts; w.picked++;
          if (w.combo > w.bestCombo) w.bestCombo = w.combo;
          w.combo = Math.min(COMBO_CAP, w.combo + 1);
          ev.push({ type: 'catch', stage: c.stage, points: pts, combo: w.combo, x: c.x });
        } else if (isPower(c)) {
          catchPickup(w, c, ev);
          if (c.kind !== 'gold') sunny = w.power && w.power.kind === 'sun';
        } else if (c.kind === 'leaf') {            // a leaf: no life, but the combo breaks
          w.combo = 1; w.leavesCaught++;
          ev.push({ type: 'leaf', x: c.x });
        } else {                                   // an unripe cherry, a rock or a bat: a life
          if (c.kind === 'rock') w.rocksCaught++; else if (c.kind === 'bat') w.batsCaught++;
          ev.push({ type: 'bad', kind: c.kind, stage: c.stage, livesLeft: Math.max(0, w.lives - 1), x: c.x });
          if (loseLife(w, ev, c.kind)) return ev;
        }
        continue;
      }
      if (c.y > GROUND_Y) {
        if (isRed(c) && !sunny) {                  // (sunshine: many reds are out of reach, so misses are free while it lasts)
          w.combo = 1; w.misses++;
          var costs = w.missesPerLife > 0 && w.misses % w.missesPerLife === 0;
          ev.push({ type: 'miss', costsLife: costs, livesLeft: costs ? Math.max(0, w.lives - 1) : w.lives, x: c.x });
          if (costs && loseLife(w, ev, 'cherry')) return ev;
        }
        continue;
      }
      keep.push(c);
    }
    w.cherries = keep;

    if (w.power) {                                 // the power-up wears off in real seconds
      w.power.left -= dt;
      if (w.power.left <= 0) { endPower(w, ev, false); setSpeedMul(w); }
    }

    stepBird(w, dt, ev);
    if (w.over) return ev;
    w.t += dt;
    return ev;
  }

  return {
    W: W, H: H, BASKET_Y: BASKET_Y, BASKET_W: BASKET_W, BASKET_SPEED: BASKET_SPEED, CHERRY_R: CHERRY_R,
    GROUND_Y: GROUND_Y, SKY_BAND: SKY_BAND, CATCH_SLACK: CATCH_SLACK,
    MAX_LIVES: MAX_LIVES, POINTS_RED: POINTS_RED, COMBO_CAP: COMBO_CAP, STAGES: STAGES,
    MISSES_PER_LIFE: MISSES_PER_LIFE, FIRST_SPAWN: FIRST_SPAWN,
    RAMP_END: RAMP_END, FALL_START: FALL_START, FALL_CAP: FALL_CAP, SPAWN_START: SPAWN_START, SPAWN_CAP: SPAWN_CAP,
    RED_START: RED_START, RED_CAP: RED_CAP, BIRD_EVERY_START: BIRD_EVERY_START, BIRD_EVERY_CAP: BIRD_EVERY_CAP,
    BIRD_FIRST: BIRD_FIRST, SAME_TIME: SAME_TIME, REACH_FACTOR: REACH_FACTOR, WALL_WINDOW: WALL_WINDOW, WALL_MAX: WALL_MAX,
    BIRD_WARN: BIRD_WARN, BIRD_WARN_CAP: BIRD_WARN_CAP, BIRD_LOCK: BIRD_LOCK, BIRD_LOCK_CAP: BIRD_LOCK_CAP, birdLock: birdLock, BIRD_CROSS: BIRD_CROSS, BIRD_SPEED_CAP: BIRD_SPEED_CAP, BIRD_Y: BIRD_Y, BIRD_SPEED: BIRD_SPEED,
    BIRD_GRAB_R: BIRD_GRAB_R, STEAL_LINE: STEAL_LINE, BIRD_TOUGH2: BIRD_TOUGH2, BIRD_TOUGH3: BIRD_TOUGH3, BIRD_REGROUP: BIRD_REGROUP, RANKS: RANKS,
    birdSpeed: birdSpeed, birdWarn: birdWarn, fallSpeed: fallSpeed, spawnEvery: spawnEvery, redChance: redChance, birdEvery: birdEvery,
    shoosNeeded: shoosNeeded, makeRng: makeRng, isRed: isRed, isBad: isBad, clampX: clampX,
    newWorld: newWorld, setTarget: setTarget, stepWorld: stepWorld, scareBird: scareBird,
    ROCK_FROM: ROCK_FROM, BAT_FROM: BAT_FROM, LEAF_FROM: LEAF_FROM, BAT_AMP: BAT_AMP, LEAF_AMP: LEAF_AMP, LEAF_FALL: LEAF_FALL, SWAY_MARGIN: SWAY_MARGIN,
    POWER_FROM: POWER_FROM, POWER_GAP_MIN: POWER_GAP_MIN, POWER_GAP_MAX: POWER_GAP_MAX, POWER_KINDS: POWER_KINDS, POWER_TIME: POWER_TIME,
    POWER_NAMES: POWER_NAMES, SLOW_FACTOR: SLOW_FACTOR, GOLD_FROM: GOLD_FROM, GOLD_MIN_GAP: GOLD_MIN_GAP, GOLD_CHANCE: GOLD_CHANCE,
    KG_PER_CHERRY: KG_PER_CHERRY, kilosFor: kilosFor,
    varySpread: varySpread, VARY_START: VARY_START, VARY_CAP: VARY_CAP, rockChance: rockChance, batChance: batChance, leafChance: leafChance, isPower: isPower, arriveX: arriveX, pickLine: pickLine, LINES: LINES,
    rankFor: rankFor, lowestRed: lowestRed, arrivalTime: arrivalTime, pickTarget: pickTarget, fairSpawn: fairSpawn
  };
});
