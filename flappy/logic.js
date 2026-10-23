// Flappy Grinder: game rules with no drawing code, so they can be tested on their own.
// Works in the browser (window.FlappyLogic) and in Node (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FlappyLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var W = 320, H = 256;
  var GROUND_Y = 224;          // top of the pavement strip; the play area is 0..GROUND_Y
  var GRINDER_X = 84;          // the grinder never moves sideways
  var GRINDER_W = 10;          // hit box (the drawn grinder is a little bigger)
  var GRINDER_H = 30;

  // Feel. All in pixels and seconds; these are the numbers to tune.
  var GRAVITY = 600;           // px/s^2 pulling down while the crank is idle (was 760; eased after Roger's play)
  var LIFT = 1250;             // px/s^2 pushing up while the crank is held
  var MAX_FALL = 210;          // px/s (was 260)
  var MAX_RISE = 170;          // px/s

  // Difficulty by score (pairs cleared).
  var SPEED_START = 78;        // how fast the scenery and obstacles scroll, px/s
  var SPEED_STEP = 1.5;        // faster for every pair cleared
  var SPEED_CAP = 118;         // reached at 27 pairs
  var GAP_START = 96;          // opening between the gulls and the rock, px
  var GAP_SHRINK = 1.2;
  var GAP_MIN = 72;            // reached at 20 pairs
  var PAIR_W = 28;             // width of the gull column and the rock stack
  var PAIR_SPACING = 132;      // px between the left edges of neighbouring pairs
  var TOP_MIN = 26, BOT_MIN = 26;   // always leave at least this much gull and this much rock on screen
  var MAX_STEP = 78;           // the next gap is never more than this far above or below the last one
  var FORGIVE = 2;             // px shaved off each obstacle edge so near misses feel fair
  var BOB_FROM = 20;           // from this score on, some gull columns bob up and down (was 6)
  var BOB_MAX = 16, BOB_RATE = 2.0;

  var SCENE_EVERY = 10;        // the background changes to another cafe every this many points

  // Power-ups (Roger, 2026-10-22). One at a time; no on-screen timer, the grinder blinks as one wears off.
  // gold = invulnerable: scatters gulls and breaks rocks it touches. rocket = flames under the grinder burn away rocks.
  // burrs = red burrs: the grinder (and its hit box) shrinks 20%.
  var POWER_KINDS = ['gold', 'rocket', 'burrs'];
  var POWER_TIME = { gold: 5, rocket: 6, burrs: 8 };   // seconds; gold is Roger's 5 s, the other two are first guesses
  var POWER_NAMES = { gold: 'Golden Grinder', rocket: 'Rocket Grind', burrs: 'Red Burrs' };
  var POWER_BLINK = 2;         // the last this many seconds the grinder blinks (was 1.5; Roger wanted it more obvious)
  var POWER_FROM = 5;          // no pickups before this score
  var POWER_GAP_MIN = 6, POWER_GAP_MAX = 10;   // pairs between one pickup and the next
  var BURR_SCALE = 0.8;        // red burrs: drawn grinder and hit box both shrink to this
  var FLAME_LEN = 44;          // rocket: how far the flames reach below the grinder, px
  var PICKUP_R = 7;            // pickup radius, px
  var GRACE = 0.3;             // seconds of safety from gulls and rocks right after a power-up ends

  // The 11 cafes. `name` is what the player sees; ids are used by scenes.js.
  var SCENES = [
    { id: 'birdrock',    name: 'Bird Rock, La Jolla' },
    { id: 'morena',      name: 'Morena' },
    { id: 'bressi',      name: 'Bressi Ranch' },
    { id: 'encinitas',   name: 'Encinitas' },
    { id: 'torrey',      name: 'Torrey Pines' },
    { id: 'littleitaly', name: 'Little Italy' },
    { id: 'waterfront',  name: 'Waterfront' },
    { id: 'liberty',     name: 'Liberty Station' },
    { id: 'village',     name: 'The Village' },
    { id: 'parkmarket',  name: 'Park & Market' },
    { id: 'ucsd',        name: 'UCSD' }
  ];
  var SCENE_IDS = SCENES.map(function (s) { return s.id; });

  var RANKS = [
    { min: 0,  title: 'Green Bean' },
    { min: 3,  title: 'Barista Trainee' },
    { min: 10, title: 'Roaster' },
    { min: 20, title: 'Head Roaster' },
    { min: 35, title: 'Master Grinder' }
  ];

  // What the end card says, by what the grinder hit.
  var LINES = {
    gull:  ['Gull attack!', 'Squawk! Stolen!', 'Fowl play!'],
    rock:  ['Rocky ending!', 'Channeling!', 'Hit a rock!'],
    floor: ['Stale beans!', 'Too coarse!', 'Dropped the grind!']
  };

  function speedFor(score) { return Math.min(SPEED_CAP, SPEED_START + SPEED_STEP * Math.max(0, score)); }
  function gapFor(score) { return Math.max(GAP_MIN, GAP_START - GAP_SHRINK * Math.max(0, score)); }
  function rankFor(score) {
    var r = RANKS[0];
    for (var i = 0; i < RANKS.length; i++) if (score >= RANKS[i].min) r = RANKS[i];
    return r.title;
  }
  function pickLine(kind, rng) {
    rng = rng || Math.random;
    var pool = LINES[kind] || LINES.floor;
    return pool[Math.floor(rng() * pool.length)];
  }

  // ---- obstacles ----
  function bobAmpFor(score, rng) {
    if (score < BOB_FROM || rng() >= 0.5) return 0;
    return Math.min(BOB_MAX, 4 + (score - BOB_FROM) * 1.2);
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // The vertical middle of a pair's gap at time t (bobbing pairs sway around their base).
  function pairCenter(p, t) { return p.center + p.amp * Math.sin(p.phase + t * BOB_RATE); }

  // A new pair at x. The gap sits within reach of the previous one and leaves room for gulls above and rock below.
  function makePair(w, x, rng) {
    var gap = gapFor(w.score);
    var amp = bobAmpFor(w.score, rng);
    var lo = TOP_MIN + gap / 2 + amp, hi = GROUND_Y - BOT_MIN - gap / 2 - amp;
    var c;
    if (w.lastCenter == null) c = (lo + hi) / 2;
    else c = clamp(w.lastCenter - MAX_STEP + rng() * 2 * MAX_STEP, lo, hi);
    w.lastCenter = c;
    w.spawned++;
    var p = { id: w.spawned, x: x, center: c, gap: gap, amp: amp, phase: rng() * Math.PI * 2, scored: false,
      gullsGone: false, rockGone: false, pickup: null };
    maybePickup(w, p, rng);
    return p;
  }

  // ---- power-ups ----
  // Puts a pickup in this pair's gap when one is due. Waits while a power-up is active or another pickup is still out.
  function maybePickup(w, p, rng) {
    if (w.score < POWER_FROM - 2) return;          // pairs spawn about two ahead of the grinder
    if (w.power || w.pairs.some(function (q) { return q.pickup && !q.pickup.got; })) return;
    if (--w.pickupIn > 0) return;
    var pool = POWER_KINDS.filter(function (k) { return k !== w.lastPower; });
    var kind = pool[Math.floor(rng() * pool.length)];
    w.lastPower = kind;
    w.pickupIn = POWER_GAP_MIN + Math.floor(rng() * (POWER_GAP_MAX - POWER_GAP_MIN + 1));
    p.pickup = { kind: kind, got: false };
  }
  function givePower(w, kind) { w.power = { kind: kind, left: POWER_TIME[kind], total: POWER_TIME[kind] }; }
  // How big the grinder is right now (1, or BURR_SCALE with red burrs).
  function scaleOf(w) { return w.power && w.power.kind === 'burrs' ? BURR_SCALE : 1; }
  // True during the last POWER_BLINK seconds of a power-up.
  function powerFading(w) { return !!(w.power && w.power.left <= POWER_BLINK); }
  function pickupY(p, t) { return pairCenter(p, t); }

  // What the grinder is touching at height y (its center), or null. `scale` shrinks the hit box (red burrs).
  // Gulls that were scattered and rocks that were broken no longer count.
  function hitWhat(y, pairs, t, scale) {
    scale = scale || 1;
    var hh = GRINDER_H * scale / 2, hw = GRINDER_W * scale / 2;
    var top = y - hh, bottom = y + hh;
    if (bottom >= GROUND_Y) return { kind: 'floor', pair: null };
    var g0 = GRINDER_X - hw, g1 = GRINDER_X + hw;
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      if (g1 > p.x + FORGIVE && g0 < p.x + PAIR_W - FORGIVE) {
        var c = pairCenter(p, t);
        if (!p.gullsGone && top < c - p.gap / 2) return { kind: 'gull', pair: p };
        if (!p.rockGone && bottom > c + p.gap / 2) return { kind: 'rock', pair: p };
      }
    }
    return null;
  }
  function hitTest(y, pairs, t, scale) { var h = hitWhat(y, pairs, t, scale); return h ? h.kind : null; }

  // ---- the run ----
  // opts.score starts a run partway in (used by the ?start= test link, and by tests).
  function newWorld(opts) {
    opts = opts || {};
    return {
      y: 112, vy: 0, t: 0, dist: 0, score: opts.score || 0,
      pairs: [], spawned: 0, lastCenter: null, over: null,
      nextX: W + 70,                   // where the first pair appears
      power: null, lastPower: null, grace: 0,
      pickupIn: opts.pickupIn || 1     // the first pickup comes at the first chance (score POWER_FROM)
    };
  }

  // Moves the world forward dt seconds. `held` is whether the crank is being held.
  // Returns a list of events: { type: 'score' }, { type: 'hit', kind: 'gull'|'rock'|'floor' },
  // { type: 'power', kind } (picked up), { type: 'powerEnd', kind }, and { type: 'smash', what: 'gull'|'rock', pair }.
  function stepWorld(w, held, dt, rng) {
    rng = rng || Math.random;
    var events = [];
    if (w.over) return events;
    w.t += dt;

    if (w.power) {
      w.power.left -= dt;
      if (w.power.left <= 0) { events.push({ type: 'powerEnd', kind: w.power.kind }); w.power = null; w.grace = GRACE; }
    }
    if (w.grace > 0) w.grace = Math.max(0, w.grace - dt);
    var scale = scaleOf(w), half = GRINDER_H * scale / 2;

    w.vy += (held ? -LIFT : GRAVITY) * dt;
    w.vy = clamp(w.vy, -MAX_RISE, MAX_FALL);
    w.y += w.vy * dt;
    if (w.y - half < 0) { w.y = half; if (w.vy < 0) w.vy = 0; }   // the ceiling stops you, it doesn't hurt

    var move = speedFor(w.score) * dt;
    w.dist += move;
    w.nextX -= move;
    w.pairs.forEach(function (p) { p.x -= move; });
    if (w.nextX <= W + 20) { w.pairs.push(makePair(w, w.nextX, rng)); w.nextX += PAIR_SPACING; }
    w.pairs = w.pairs.filter(function (p) { return p.x + PAIR_W > -4; });

    w.pairs.forEach(function (p) {
      if (!p.scored && p.x + PAIR_W < GRINDER_X - GRINDER_W / 2) { p.scored = true; w.score++; events.push({ type: 'score' }); }
    });

    // Picking up: the pickup's circle touches the grinder's box.
    var hw = GRINDER_W * scale / 2;
    w.pairs.forEach(function (p) {
      if (!p.pickup || p.pickup.got) return;
      var px = p.x + PAIR_W / 2, py = pickupY(p, w.t);
      var dx = Math.max(0, Math.abs(px - GRINDER_X) - hw), dy = Math.max(0, Math.abs(py - w.y) - half);
      if (dx * dx + dy * dy <= PICKUP_R * PICKUP_R) {
        p.pickup.got = true;
        if (w.power) events.push({ type: 'powerEnd', kind: w.power.kind, replaced: true });
        givePower(w, p.pickup.kind);
        events.push({ type: 'power', kind: p.pickup.kind });
      }
    });
    var kind = w.power ? w.power.kind : null;
    if (kind === 'burrs' && scaleOf(w) !== scale) { scale = scaleOf(w); half = GRINDER_H * scale / 2; }

    // Rocket: rocks whose tops are within reach of the flames burn away.
    if (kind === 'rocket') {
      var reach = w.y + half + FLAME_LEN, f0 = GRINDER_X - 4, f1 = GRINDER_X + 4;
      w.pairs.forEach(function (p) {
        if (p.rockGone || f1 <= p.x || f0 >= p.x + PAIR_W) return;
        if (pairCenter(p, w.t) + p.gap / 2 < reach) { p.rockGone = true; events.push({ type: 'smash', what: 'rock', pair: p }); }
      });
    }

    for (var guard = 0; guard < 3; guard++) {
      var hit = hitWhat(w.y, w.pairs, w.t, scale);
      if (!hit) break;
      if (hit.kind !== 'floor' && w.grace > 0) break;
      if (kind === 'gold') {                       // golden: nothing hurts. Gulls scatter, rocks break, the pavement holds you up.
        if (hit.kind === 'floor') { w.y = GROUND_Y - half - 0.01; if (w.vy > 0) w.vy = 0; break; }
        if (hit.kind === 'gull') hit.pair.gullsGone = true; else hit.pair.rockGone = true;
        events.push({ type: 'smash', what: hit.kind, pair: hit.pair });
        continue;
      }
      w.over = hit.kind; events.push({ type: 'hit', kind: hit.kind });
      break;
    }
    return events;
  }

  // ---- which cafe is on screen ----
  // st = { deck: [], last: null } is kept between calls. Every cafe is shown once before any repeats,
  // in a fresh random order each round, and a new round never opens with the cafe just shown.
  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1)), tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }
  function newDeckState() { return { deck: [], last: null }; }
  function nextScene(st, ids, rng) {
    rng = rng || Math.random;
    ids = ids || SCENE_IDS;
    if (!st.deck.length) {
      st.deck = shuffle(ids.slice(), rng);
      if (ids.length > 1 && st.deck[0] === st.last) { var k = 1 + Math.floor(rng() * (ids.length - 1)); var s = st.deck[0]; st.deck[0] = st.deck[k]; st.deck[k] = s; }
    }
    st.last = st.deck.shift();
    return st.last;
  }
  // Which scene slot a score belongs to: slot 0 for 0..9, slot 1 for 10..19, and so on.
  function sceneSlot(score) { return Math.floor(Math.max(0, score) / SCENE_EVERY); }
  function sceneName(id) {
    for (var i = 0; i < SCENES.length; i++) if (SCENES[i].id === id) return SCENES[i].name;
    return id;
  }

  return {
    W: W, H: H, GROUND_Y: GROUND_Y, GRINDER_X: GRINDER_X, GRINDER_W: GRINDER_W, GRINDER_H: GRINDER_H,
    GRAVITY: GRAVITY, LIFT: LIFT, MAX_FALL: MAX_FALL, MAX_RISE: MAX_RISE,
    SPEED_START: SPEED_START, SPEED_CAP: SPEED_CAP, GAP_START: GAP_START, GAP_MIN: GAP_MIN,
    PAIR_W: PAIR_W, PAIR_SPACING: PAIR_SPACING, TOP_MIN: TOP_MIN, BOT_MIN: BOT_MIN, MAX_STEP: MAX_STEP,
    SCENE_EVERY: SCENE_EVERY, SCENES: SCENES, SCENE_IDS: SCENE_IDS, LINES: LINES,
    POWER_KINDS: POWER_KINDS, POWER_TIME: POWER_TIME, POWER_NAMES: POWER_NAMES, POWER_BLINK: POWER_BLINK,
    POWER_FROM: POWER_FROM, POWER_GAP_MIN: POWER_GAP_MIN, POWER_GAP_MAX: POWER_GAP_MAX,
    BURR_SCALE: BURR_SCALE, FLAME_LEN: FLAME_LEN, PICKUP_R: PICKUP_R, GRACE: GRACE,
    givePower: givePower, scaleOf: scaleOf, powerFading: powerFading, pickupY: pickupY, hitWhat: hitWhat,
    speedFor: speedFor, gapFor: gapFor, rankFor: rankFor, pickLine: pickLine,
    pairCenter: pairCenter, makePair: makePair, hitTest: hitTest,
    newWorld: newWorld, stepWorld: stepWorld,
    newDeckState: newDeckState, nextScene: nextScene, sceneSlot: sceneSlot, sceneName: sceneName
  };
});
