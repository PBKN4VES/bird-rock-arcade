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
    return { id: w.spawned, x: x, center: c, gap: gap, amp: amp, phase: rng() * Math.PI * 2, scored: false };
  }

  // What the grinder is touching at height y (its center), or null.
  function hitTest(y, pairs, t) {
    var top = y - GRINDER_H / 2, bottom = y + GRINDER_H / 2;
    if (bottom >= GROUND_Y) return 'floor';
    var g0 = GRINDER_X - GRINDER_W / 2, g1 = GRINDER_X + GRINDER_W / 2;
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      if (g1 > p.x + FORGIVE && g0 < p.x + PAIR_W - FORGIVE) {
        var c = pairCenter(p, t);
        if (top < c - p.gap / 2) return 'gull';
        if (bottom > c + p.gap / 2) return 'rock';
      }
    }
    return null;
  }

  // ---- the run ----
  // opts.score starts a run partway in (used by the ?start= test link, and by tests).
  function newWorld(opts) {
    opts = opts || {};
    return {
      y: 112, vy: 0, t: 0, dist: 0, score: opts.score || 0,
      pairs: [], spawned: 0, lastCenter: null, over: null,
      nextX: W + 70                    // where the first pair appears
    };
  }

  // Moves the world forward dt seconds. `held` is whether the crank is being held.
  // Returns a list of events: { type: 'score' } and { type: 'hit', kind: 'gull'|'rock'|'floor' }.
  function stepWorld(w, held, dt, rng) {
    rng = rng || Math.random;
    var events = [];
    if (w.over) return events;
    w.t += dt;

    w.vy += (held ? -LIFT : GRAVITY) * dt;
    w.vy = clamp(w.vy, -MAX_RISE, MAX_FALL);
    w.y += w.vy * dt;
    if (w.y - GRINDER_H / 2 < 0) { w.y = GRINDER_H / 2; if (w.vy < 0) w.vy = 0; }   // the ceiling stops you, it doesn't hurt

    var move = speedFor(w.score) * dt;
    w.dist += move;
    w.nextX -= move;
    w.pairs.forEach(function (p) { p.x -= move; });
    if (w.nextX <= W + 20) { w.pairs.push(makePair(w, w.nextX, rng)); w.nextX += PAIR_SPACING; }
    w.pairs = w.pairs.filter(function (p) { return p.x + PAIR_W > -4; });

    w.pairs.forEach(function (p) {
      if (!p.scored && p.x + PAIR_W < GRINDER_X - GRINDER_W / 2) { p.scored = true; w.score++; events.push({ type: 'score' }); }
    });

    var hit = hitTest(w.y, w.pairs, w.t);
    if (hit) { w.over = hit; events.push({ type: 'hit', kind: hit }); }
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
    speedFor: speedFor, gapFor: gapFor, rankFor: rankFor, pickLine: pickLine,
    pairCenter: pairCenter, makePair: makePair, hitTest: hitTest,
    newWorld: newWorld, stepWorld: stepWorld,
    newDeckState: newDeckState, nextScene: nextScene, sceneSlot: sceneSlot, sceneName: sceneName
  };
});
