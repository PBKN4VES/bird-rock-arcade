// Cherry Picker: game rules with no drawing code, so they can be tested on their own.
// Works in the browser (window.PickerLogic) and in Node (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PickerLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // ---- size and layout (canvas pixels; y grows downward) ----
  var W = 240, H = 320;
  var CHERRY_R = 9;            // drawn radius
  var HIT_R = 16;              // tap radius (about 23 CSS px on a phone, so a 46 px target)
  var LABEL_W = 34;            // the left strip of each tier is kept free for the elevation label
  var BRANCH_DROP = 10;        // each tier's branch runs this many px above the centre of its cherries

  // Three tiers, top to bottom on screen. ripen = ripening speed (higher = faster), red = red-window multiplier,
  // points = base points for a red pick, band = the y range its cherries live in.
  // Real: cooler air at altitude slows ripening. Game rule (Roger): worth more, so harder to catch (shorter red window).
  var TIERS = [
    { id: 'high', masl: 1900, ripen: 0.75, red: 0.6, points: 20, band: [70, 125] },
    { id: 'mid',  masl: 1500, ripen: 1.0,  red: 0.8, points: 15, band: [145, 205] },
    { id: 'low',  masl: 1100, ripen: 1.25, red: 1.0, points: 10, band: [225, 300] }
  ];
  // The 10 cherry positions: 3 high, 4 mid, 3 low. Every centre is at least 2 x HIT_R + 2 px from every other.
  var SLOTS = [
    { x: 62,  y: 104, tier: 'high' }, { x: 128, y: 112, tier: 'high' }, { x: 196, y: 102, tier: 'high' },
    { x: 56,  y: 178, tier: 'mid' },  { x: 108, y: 186, tier: 'mid' },  { x: 160, y: 176, tier: 'mid' },  { x: 212, y: 184, tier: 'mid' },
    { x: 66,  y: 262, tier: 'low' },  { x: 130, y: 270, tier: 'low' },  { x: 194, y: 260, tier: 'low' }
  ];

  // The branch each tier's bird walks along: a left end, a point above every slot on that tier, a right end.
  // PATH_S[tier] = distance along the branch of each point; SLOT_S[i] = where slot i hangs along its branch.
  var BRANCH_PATHS = {}, PATH_S = {}, PATH_LEN = {}, SLOT_S = [];
  TIERS.forEach(function (tier) {
    var idx = [];
    SLOTS.forEach(function (s, i) { if (s.tier === tier.id) idx.push(i); });
    idx.sort(function (a, b) { return SLOTS[a].x - SLOTS[b].x; });
    var pts = [{ x: LABEL_W + 4, y: SLOTS[idx[0]].y - BRANCH_DROP }];
    idx.forEach(function (i) { pts.push({ x: SLOTS[i].x, y: SLOTS[i].y - BRANCH_DROP, slot: i }); });
    pts.push({ x: W - 8, y: SLOTS[idx[idx.length - 1]].y - BRANCH_DROP });
    var s = 0, cum = [0];
    for (var k = 1; k < pts.length; k++) {
      s += Math.sqrt(Math.pow(pts[k].x - pts[k - 1].x, 2) + Math.pow(pts[k].y - pts[k - 1].y, 2));
      cum.push(s);
    }
    pts.forEach(function (p, j) { if (p.slot !== undefined) SLOT_S[p.slot] = cum[j]; });
    BRANCH_PATHS[tier.id] = pts; PATH_S[tier.id] = cum; PATH_LEN[tier.id] = s;
  });

  // ---- rules ----
  var ROUND_TIME = 60;         // seconds in a harvest day
  var FIRST_READY = 1.0;       // the "READY?" beat: nothing happens and taps are ignored until it ends
  var COMBO_CAP = 5;
  var PERFECT_WINDOW = 0.3;    // a red picked within this many seconds of turning red is a Perfect Pick
  var PERFECT_BONUS = 5;       // flat bonus (not multiplied by the combo)
  var PENALTY = { green: 8, yellow: 5, orange: 3, overripe: 5 };   // points lost for a bad pick
  var SCORE_FLOOR = 0;         // penalties never push the score below this
  var STAGES = ['green', 'yellow', 'orange', 'red', 'overripe'];
  var OVERRIPE_TIME = 2.5;     // how long an overripe cherry hangs before it drops
  var REGROW_DELAY = 0.6;      // an empty slot grows a new green cherry after this long

  // Ripening (seconds at ramp 1.0, before the tier multiplier). Each stage gets a random factor in [0.75, 1.25].
  var GREEN_T = 2.5, YELLOW_T = 1.2, ORANGE_T = 1.0;
  var RIPEN_PACE = 0.98;       // overall ripening speed: 2% slower than the first version (Roger asked for 3 to 5% slower, then nudged it back up 2 points)
  var FACTOR_MIN = 0.75, FACTOR_MAX = 1.25;
  var RED_MIN = 0.45;          // no tier's red window ever falls below this, so a quick player can always hit it
  // Fairness: when a cherry grows, no more than FAIR_MAX cherries may turn red inside any FAIR_WINDOW seconds.
  var FAIR_WINDOW = 0.5, FAIR_MAX = 2, FAIR_TRIES = 8;
  var FAIR_SLIDE = 0.05;       // if every re-roll fails, the cherry is delayed in steps of this many seconds until the rule holds
  var START_AGE = 0.8;         // initial cherries start up to this fraction of the way to red, so they do not ripen in lockstep

  // Mist over the high tier (real: high farms are often in cloud). It never blocks a tap.
  var MIST_FIRST = 15, MIST_EVERY = 14, MIST_JITTER = 3, MIST_TIME = 4, MIST_ALPHA = 0.6;

  // The bird.
  var BIRD_FIRST = 8;          // no bird before this many seconds into the round
  var BIRD_WARN = 1.0;         // lands and warns this long before it starts walking
  var BIRD_WAIT = 3;           // waits this long in total for a red on its tier, then leaves
  var BIRD_GRAB_R = 6;         // steals when it is this close (along the branch) to its target
  var BIRD_HIT_R = 18;         // tap radius
  var BIRD_LIFT = 6;           // the bird's body centre sits this far above the branch
  var BIRD_MIN_TIME = 1.5;     // reaction guarantee: at least this long on the branch (warn + walk) before any steal
  var BIRD_PATROL = 0.6;       // while it waits for a red it paces the branch at this fraction of its walking speed (Roger: it just sat there)
  var BIRD_TOUGH_FROM = 30;    // birds landing from this many seconds in take 2 taps to shoo; after the first it hops back along the branch
  var BIRD_HOP = 45;           // px it hops back along the branch after a first shoo
  var BIRD_DOUBLE_FROM = 20;   // from this many seconds in, two birds can be on the branches at once (never two on the same branch)
  var BIRD_PILE_GAP = 1;       // when a second bird is allowed, it lands this many seconds (plus up to 1.5) after the first, so they overlap
  // A mouse or trackpad is less precise than a finger, so taps made with one get bigger targets (Roger: hard to play with a trackpad).
  var MOUSE_HIT_R = 26, MOUSE_BIRD_R = 28;

  // ---- difficulty ramp, by seconds into the round ----
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, k) { return a + (b - a) * clamp(k, 0, 1); }
  // Ripening speeds up: 1.0 -> 1.4 by t = 45, then 1.4 -> 2.0 by t = 60 (the frantic last 15 seconds).
  function ripenScale(t) { return t <= 45 ? lerp(1.0, 1.4, t / 45) : lerp(1.4, 2.0, (t - 45) / 15); }
  function redWindow(t) { return lerp(1.6, 0.9, t / ROUND_TIME); }       // seconds a cherry stays red (before the tier multiplier)
  function birdEvery(t) { return lerp(12, 7, t / ROUND_TIME); }           // seconds between birds
  function birdSpeed(t) { return lerp(40, 70, t / ROUND_TIME); }         // px/s along the branch
  function maxBirds(t) { return t >= BIRD_DOUBLE_FROM ? 2 : 1; }          // how many birds may be on the branches at once

  // Final ranks. A 60-second round scores very differently from Cherry Catch's endless run, so these come from this game's bot.
  // Roger scooted the whole ladder down (Top of the Tree at 5,500, about 60% of the perfect-play bot's 9,300 to 9,700) so the top rank is
  // reachable for a good human, not just a flawless one. The lower lines are the old ones scaled by the same 5,500 / 8,800.
  var RANKS = [
    { min: 5500, name: 'Top of the Tree' },
    { min: 4400, name: 'Pit Boss' },
    { min: 2500, name: 'Cherry Swiper' },
    { min: 1000, name: 'Don\'t Quit Your Day Job' },
    { min: 0,    name: 'Are You New?' }
  ];
  function rankFor(score) {
    for (var i = 0; i < RANKS.length; i++) if (score >= RANKS[i].min) return RANKS[i].name;
    return RANKS[RANKS.length - 1].name;
  }

  // ---- helpers ----
  function tierOf(id) { for (var i = 0; i < TIERS.length; i++) if (TIERS[i].id === id) return TIERS[i]; return null; }
  function dist(ax, ay, bx, by) { return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by)); }
  // Small repeatable random numbers (mulberry32), used only when the caller gives no rng. Logic never calls Math.random.
  function seededRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var x = a;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Where a point `s` px along a tier's branch is.
  function pathPoint(tier, s) {
    var pts = BRANCH_PATHS[tier], cum = PATH_S[tier];
    s = clamp(s, 0, PATH_LEN[tier]);
    for (var k = 1; k < pts.length; k++) {
      if (s <= cum[k] || k === pts.length - 1) {
        var seg = cum[k] - cum[k - 1], f = seg > 0 ? (s - cum[k - 1]) / seg : 0;
        return { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * f, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * f };
      }
    }
    return { x: pts[0].x, y: pts[0].y };
  }
  // The stage a cherry is in at time t (switch times are stored on the cherry when it grows).
  function stageAt(c, t) {
    if (t < c.toYellow) return 'green';
    if (t < c.toOrange) return 'yellow';
    if (t < c.toRed) return 'orange';
    if (t < c.toOver) return 'red';
    return 'overripe';
  }

  // ---- growing cherries ----
  // True if giving `slotIdx` a cherry that turns red at `red` would put more than FAIR_MAX reds inside FAIR_WINDOW.
  function fairOK(w, slotIdx, red) {
    var times = [];
    for (var i = 0; i < w.slots.length; i++) if (i !== slotIdx && w.slots[i].cherry) times.push(w.slots[i].cherry.toRed);
    times.push(red);
    times.sort(function (a, b) { return a - b; });
    var k = times.indexOf(red);
    for (var j = Math.max(0, k - FAIR_MAX); j <= k && j + FAIR_MAX < times.length; j++) {
      if (times[j + FAIR_MAX] - times[j] <= FAIR_WINDOW) return false;
    }
    return true;
  }
  // Grows a new green cherry in a slot. `at` is when it started to grow; `age` (initial cherries only) shifts its life earlier.
  function growCherry(w, slotIdx, at, initial) {
    var slot = w.slots[slotIdx], tier = tierOf(slot.tier);
    var speed = ripenScale(at) * w.speedScale * tier.ripen * RIPEN_PACE;
    var redW = Math.max(RED_MIN, redWindow(at) * tier.red);
    var c = null;
    for (var tries = 0; tries < FAIR_TRIES; tries++) {
      var f1 = FACTOR_MIN + w.rng() * (FACTOR_MAX - FACTOR_MIN);
      var f2 = FACTOR_MIN + w.rng() * (FACTOR_MAX - FACTOR_MIN);
      var f3 = FACTOR_MIN + w.rng() * (FACTOR_MAX - FACTOR_MIN);
      var dG = GREEN_T * f1 / speed, dY = YELLOW_T * f2 / speed, dO = ORANGE_T * f3 / speed;
      var age = initial ? w.rng() * START_AGE * (dG + dY + dO) : 0;
      var t0 = at - age;
      c = { id: w.nextId++, stage: 'green', grown: at };
      c.toYellow = t0 + dG; c.toOrange = c.toYellow + dY; c.toRed = c.toOrange + dO;
      c.toOver = c.toRed + redW; c.toDrop = c.toOver + OVERRIPE_TIME;
      if (fairOK(w, slotIdx, c.toRed)) break;     // otherwise keep trying
    }
    // Still crowded after FAIR_TRIES: slide this one cherry later in small steps until the rule holds (it only ever gets slower).
    for (var slide = 0; slide < 400 && !fairOK(w, slotIdx, c.toRed); slide++) {
      c.toYellow += FAIR_SLIDE; c.toOrange += FAIR_SLIDE; c.toRed += FAIR_SLIDE; c.toOver += FAIR_SLIDE; c.toDrop += FAIR_SLIDE;
    }
    c.stage = stageAt(c, w.t);
    slot.cherry = c; slot.regrowAt = null;
    return c;
  }
  function removeCherry(w, slot) { slot.cherry = null; slot.regrowAt = w.t + REGROW_DELAY; }

  // ---- the world ----
  function newWorld(opts) {
    opts = opts || {};
    var w = {
      t: Math.max(0, Math.min(ROUND_TIME - 0.001, opts.startT || 0)), ready: FIRST_READY, timeLeft: ROUND_TIME,
      score: 0, combo: 1, bestCombo: 1, picked: 0, pickedByTier: { high: 0, mid: 0, low: 0 }, perfects: 0,
      badPicks: 0, steals: 0, scared: 0, slots: [], flock: [], nextBirdId: 1, mist: null, over: false,
      rng: opts.rng || seededRng(opts.seed === undefined ? 1 : opts.seed),
      birds: opts.birds !== false, mistOn: opts.mist !== false, speedScale: opts.speedScale || 1, nextId: 1
    };
    w.timeLeft = ROUND_TIME - w.t;
    // w.flock is the list of birds on the branches. w.bird is the first one (or null), kept so one-bird code and tests read the same.
    Object.defineProperty(w, 'bird', { enumerable: true, get: function () { return w.flock[0] || null; }, set: function (b) { w.flock = b ? [b] : []; } });
    SLOTS.forEach(function (s) { w.slots.push({ tier: s.tier, cherry: null, regrowAt: null }); });
    for (var i = 0; i < w.slots.length; i++) growCherry(w, i, w.t, true);
    w.nextMist = Math.max(MIST_FIRST, w.t + 2);
    w.nextBird = w.t < BIRD_FIRST ? BIRD_FIRST + w.rng() * 2 : w.t + 3 + w.rng() * 3;
    return w;
  }

  function birdPos(w, b) {
    b = b || w.flock[0];
    if (!b) return null;
    var p = pathPoint(b.tier, b.s);
    return { x: p.x, y: p.y - BIRD_LIFT };
  }
  function isMisted(w, slotIdx) { return !!w.mist && SLOTS[slotIdx].tier === 'high'; }

  // The red cherry on `tier` nearest (along the branch) to position `s`, or -1.
  function nearestRed(w, tier, s) {
    var best = -1, bestD = Infinity;
    for (var i = 0; i < w.slots.length; i++) {
      var sl = w.slots[i];
      if (sl.tier !== tier || !sl.cherry || stageAt(sl.cherry, w.t) !== 'red') continue;
      var d = Math.abs(SLOT_S[i] - s);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  function endBird(w, b) {
    var k = w.flock.indexOf(b);
    if (k >= 0) w.flock.splice(k, 1);
    w.nextBird = w.t + birdEvery(w.t);
  }

  function spawnBird(w, ev) {
    var tier = null, bestD = Infinity, i;
    var taken = w.flock.map(function (o) { return o.tier; });            // one bird per branch
    var free = TIERS.filter(function (t) { return taken.indexOf(t.id) < 0; });
    for (i = 0; i < w.slots.length; i++) {          // the free tier whose red is closest to either end of its branch
      var sl = w.slots[i];
      if (taken.indexOf(sl.tier) >= 0 || !sl.cherry || stageAt(sl.cherry, w.t) !== 'red') continue;
      var d = Math.min(SLOT_S[i], PATH_LEN[sl.tier] - SLOT_S[i]);
      if (d < bestD) { bestD = d; tier = sl.tier; }
    }
    if (!tier) tier = free[Math.floor(w.rng() * free.length) % free.length].id;
    var left = w.rng() < 0.5;
    var nb = { id: w.nextBirdId++, state: 'land', tier: tier, s: left ? 0 : PATH_LEN[tier], dir: left ? 1 : -1, target: -1, onBranch: 0, stateT: 0, waited: 0,
               needs: w.t >= BIRD_TOUGH_FROM ? 2 : 1, hits: 0 };
    w.flock.push(nb);
    ev.push({ type: 'warn', id: nb.id, tier: tier, end: left ? 'left' : 'right' });
    if (w.flock.length < maxBirds(w.t)) w.nextBird = w.t + BIRD_PILE_GAP + w.rng() * 1.5;   // room for another: it follows soon
  }

  // Steps every bird on the branches, then lets a new one land if there is room and its time has come.
  function stepBirds(w, dt, ev) {
    w.flock.slice().forEach(function (b) { stepBird(w, b, dt, ev); });
    if (w.birds && w.flock.length < maxBirds(w.t) && w.t >= w.nextBird) spawnBird(w, ev);
  }
  function stepBird(w, b, dt, ev) {
    b.onBranch += dt;
    if (b.state === 'land') {
      b.stateT += dt;
      if (b.stateT < BIRD_WARN) return;
      b.target = nearestRed(w, b.tier, b.s);
      if (b.target >= 0) { b.state = 'walk'; ev.push({ type: 'walk', id: b.id, tier: b.tier, slot: b.target }); }
      else b.state = 'wait';
    }
    if (b.state === 'wait') {
      b.waited += dt;
      b.s += b.dir * birdSpeed(w.t) * BIRD_PATROL * dt;            // paces back and forth instead of standing still
      if (b.s <= 0) { b.s = 0; b.dir = 1; } else if (b.s >= PATH_LEN[b.tier]) { b.s = PATH_LEN[b.tier]; b.dir = -1; }
      var found = nearestRed(w, b.tier, b.s);
      if (found >= 0) { b.target = found; b.state = 'walk'; ev.push({ type: 'walk', id: b.id, tier: b.tier, slot: found }); }
      else if (b.waited >= BIRD_WAIT) { ev.push({ type: 'birdGone', id: b.id, tier: b.tier }); endBird(w, b); return; }
      else return;
    }
    if (b.state === 'walk') {
      var tsl = w.slots[b.target];
      if (!tsl.cherry || stageAt(tsl.cherry, w.t) !== 'red') {      // target picked, spoiled or stolen: same tier only
        b.target = nearestRed(w, b.tier, b.s);
        if (b.target < 0) { b.state = 'wait'; return; }
        ev.push({ type: 'walk', id: b.id, tier: b.tier, slot: b.target });
      }
      var goal = SLOT_S[b.target], gap = goal - b.s;
      var left = Math.max(0, Math.abs(gap) - BIRD_GRAB_R);           // distance still to walk before it can grab
      var need = BIRD_MIN_TIME - b.onBranch;
      var speed = birdSpeed(w.t);
      if (need > 0) speed = Math.min(speed, left / need);            // slow down rather than skip a short trip
      var move = Math.min(Math.abs(gap), speed * dt);
      if (gap !== 0) { b.dir = gap > 0 ? 1 : -1; b.s += b.dir * move; }
      if (Math.abs(goal - b.s) <= BIRD_GRAB_R && b.onBranch >= BIRD_MIN_TIME) {
        var slot = w.slots[b.target], p = birdPos(w, b);
        removeCherry(w, slot);
        w.combo = 1; w.steals++;
        ev.push({ type: 'steal', id: b.id, slot: b.target, tier: b.tier, x: SLOTS[b.target].x, y: SLOTS[b.target].y, bx: p.x, by: p.y });
        endBird(w, b);
      }
    }
  }

  function stepMist(w, ev) {
    if (!w.mistOn) return;
    if (w.mist && w.t >= w.mist.until) { w.mist = null; ev.push({ type: 'clear' }); }
    if (w.mist) { w.mist.x = -40 + (W + 80) * clamp((w.t - w.mist.start) / MIST_TIME, 0, 1); return; }
    if (w.t >= w.nextMist) {
      w.mist = { start: w.t, until: w.t + MIST_TIME, x: -40 };
      w.nextMist = w.t + MIST_EVERY + (w.rng() * 2 - 1) * MIST_JITTER;
      ev.push({ type: 'mist' });
    }
  }

  // One small step (never more than 1/60 s, so no stage switch or steal is skipped).
  function step1(w, dt, ev) {
    if (w.ready > 0) {                                   // the READY beat: the clock has not started
      w.ready -= dt;
      if (w.ready > 0) return;
      dt = -w.ready; w.ready = 0;
      if (dt <= 0) return;
    }
    dt = Math.min(dt, ROUND_TIME - w.t);
    w.t += dt;
    w.timeLeft = ROUND_TIME - w.t;
    for (var i = 0; i < w.slots.length; i++) {
      var sl = w.slots[i], c = sl.cherry;
      if (c) {
        var st = stageAt(c, w.t);
        if (st !== c.stage) {
          var from = STAGES.indexOf(c.stage), to = STAGES.indexOf(st);
          for (var k = from + 1; k <= to; k++) {
            if (STAGES[k] === 'red') ev.push({ type: 'ripe', slot: i, tier: sl.tier, at: c.toRed });
            if (STAGES[k] === 'overripe') {
              ev.push({ type: 'overripe', slot: i, tier: sl.tier, at: c.toOver, comboReset: w.combo > 1 });
              w.combo = 1;                                // a missed red breaks the combo (no points lost)
            }
          }
          c.stage = st;
        }
        if (w.t >= c.toDrop) {
          ev.push({ type: 'drop', slot: i, tier: sl.tier });
          sl.cherry = null; sl.regrowAt = c.toDrop + REGROW_DELAY;
        }
      }
      if (!sl.cherry && sl.regrowAt !== null && w.t >= sl.regrowAt) {
        growCherry(w, i, sl.regrowAt, false);
        ev.push({ type: 'grow', slot: i, tier: sl.tier });
      }
    }
    stepMist(w, ev);
    stepBirds(w, dt, ev);
    if (w.t >= ROUND_TIME - 1e-9) {
      w.t = ROUND_TIME; w.timeLeft = 0; w.over = true;
      ev.push({ type: 'over', score: w.score, rank: rankFor(w.score) });
    }
  }

  // Advances the world and returns what happened. Large steps are split so nothing is skipped. After `over` it does nothing.
  function stepWorld(w, dt) {
    var ev = [];
    while (dt > 1e-12 && !w.over) {
      var h = Math.min(dt, 1 / 60);
      step1(w, h, ev);
      dt -= h;
    }
    return ev;
  }

  // ---- player actions. All return an event, or null when nothing happened. ----
  // The bird the keyboard shoo (B) goes for: the one walking closest to its cherry, else the first on the branches.
  function mostUrgentBird(w) {
    var best = null, bestD = Infinity;
    w.flock.forEach(function (b) {
      var d = b.state === 'walk' && b.target >= 0 ? Math.abs(SLOT_S[b.target] - b.s) : 1e6;
      if (d < bestD) { bestD = d; best = b; }
    });
    return best;
  }
  // Shoos bird `b` (a click on it), or the most urgent bird when none is given (the B key).
  function scareBird(w, b) {
    if (w.over || w.ready > 0 || !w.flock.length) return null;
    b = b || mostUrgentBird(w);
    if (!b || w.flock.indexOf(b) < 0) return null;
    var p = birdPos(w, b), ev = { type: 'scare', id: b.id, tier: b.tier, state: b.state, x: p.x, y: p.y, partial: false };
    if (b.hits + 1 < b.needs) {                            // a tough bird: the first shoo only makes it hop back along the branch
      b.hits++;
      b.s = clamp(b.s + (b.state === 'walk' && b.target >= 0 ? (SLOT_S[b.target] >= b.s ? -1 : 1) : (b.dir > 0 ? -1 : 1)) * BIRD_HOP, 0, PATH_LEN[b.tier]);
      ev.partial = true; ev.left = b.needs - b.hits;
      return ev;
    }
    w.scared++;
    endBird(w, b);
    return ev;
  }
  function pickSlot(w, i) {
    if (w.over || w.ready > 0) return null;
    var slot = w.slots[i];
    if (!slot || !slot.cherry) return null;
    var c = slot.cherry, stage = stageAt(c, w.t), ev;
    if (stage === 'red') {
      var mult = w.combo, perfect = (w.t - c.toRed) <= PERFECT_WINDOW + 1e-9;
      var pts = tierOf(slot.tier).points * mult + (perfect ? PERFECT_BONUS : 0);
      w.score += pts;
      w.combo = Math.min(COMBO_CAP, w.combo + 1);
      w.bestCombo = Math.max(w.bestCombo, mult);      // the multiplier this pick actually scored at, not the next one
      w.picked++; w.pickedByTier[slot.tier]++;
      if (perfect) w.perfects++;
      ev = { type: 'pick', slot: i, tier: slot.tier, stage: 'red', points: pts, delta: pts, mult: mult, combo: w.combo, perfect: perfect };
    } else {
      var before = w.score;
      w.score = Math.max(SCORE_FLOOR, w.score - PENALTY[stage]);
      w.combo = 1; w.badPicks++;
      ev = { type: 'pick', slot: i, tier: slot.tier, stage: stage, points: -PENALTY[stage], delta: w.score - before, mult: 1, combo: 1, perfect: false };
    }
    ev.x = SLOTS[i].x; ev.y = SLOTS[i].y;
    removeCherry(w, slot);
    return ev;
  }
  // What a point on the canvas would hit: { kind: 'bird', bird }, { kind: 'slot', slot: i } or null. The bird wins over the cherry under it.
  // opts.mouse = true uses the bigger mouse and trackpad targets.
  function targetAt(w, x, y, opts) {
    var mouse = !!(opts && opts.mouse), hitR = mouse ? MOUSE_HIT_R : HIT_R, birdR = mouse ? MOUSE_BIRD_R : BIRD_HIT_R;
    var hitBird = null, hitD = Infinity;
    w.flock.forEach(function (b) {
      var bp = birdPos(w, b), d = dist(x, y, bp.x, bp.y);
      if (d <= birdR && d < hitD) { hitD = d; hitBird = b; }
    });
    if (hitBird) return { kind: 'bird', bird: hitBird };
    var best = -1, bestD = Infinity;
    for (var i = 0; i < w.slots.length; i++) {
      if (!w.slots[i].cherry) continue;
      var d = dist(x, y, SLOTS[i].x, SLOTS[i].y);
      if (d <= hitR && d < bestD) { bestD = d; best = i; }
    }
    return best >= 0 ? { kind: 'slot', slot: best } : null;
  }
  // A click or tap in canvas coordinates. Returns the event, or null for a tap on nothing (which costs nothing).
  function tapAt(w, x, y, opts) {
    if (w.over || w.ready > 0) return null;
    var hit = targetAt(w, x, y, opts);
    if (!hit) return null;
    return hit.kind === 'bird' ? scareBird(w, hit.bird) : pickSlot(w, hit.slot);
  }

  // The next cherry to turn red: { slot, time } (time is seconds into the round), or null. For the test bot.
  function nextRed(w) {
    var best = null;
    for (var i = 0; i < w.slots.length; i++) {
      var c = w.slots[i].cherry;
      if (!c || w.t >= c.toRed) continue;
      if (!best || c.toRed < best.time) best = { slot: i, time: c.toRed };
    }
    return best;
  }

  return {
    W: W, H: H, CHERRY_R: CHERRY_R, HIT_R: HIT_R, LABEL_W: LABEL_W, BRANCH_DROP: BRANCH_DROP,
    TIERS: TIERS, SLOTS: SLOTS, BRANCH_PATHS: BRANCH_PATHS, SLOT_S: SLOT_S, PATH_LEN: PATH_LEN,
    ROUND_TIME: ROUND_TIME, FIRST_READY: FIRST_READY, COMBO_CAP: COMBO_CAP, PERFECT_WINDOW: PERFECT_WINDOW, PERFECT_BONUS: PERFECT_BONUS,
    PENALTY: PENALTY, SCORE_FLOOR: SCORE_FLOOR, STAGES: STAGES, OVERRIPE_TIME: OVERRIPE_TIME, REGROW_DELAY: REGROW_DELAY,
    GREEN_T: GREEN_T, YELLOW_T: YELLOW_T, ORANGE_T: ORANGE_T, RED_MIN: RED_MIN,
    FAIR_WINDOW: FAIR_WINDOW, FAIR_MAX: FAIR_MAX, FAIR_TRIES: FAIR_TRIES,
    MIST_FIRST: MIST_FIRST, MIST_EVERY: MIST_EVERY, MIST_TIME: MIST_TIME, MIST_ALPHA: MIST_ALPHA,
    BIRD_FIRST: BIRD_FIRST, BIRD_WARN: BIRD_WARN, BIRD_WAIT: BIRD_WAIT, BIRD_GRAB_R: BIRD_GRAB_R, BIRD_HIT_R: BIRD_HIT_R,
    BIRD_LIFT: BIRD_LIFT, BIRD_MIN_TIME: BIRD_MIN_TIME, BIRD_PATROL: BIRD_PATROL, BIRD_TOUGH_FROM: BIRD_TOUGH_FROM, BIRD_HOP: BIRD_HOP, BIRD_DOUBLE_FROM: BIRD_DOUBLE_FROM, BIRD_PILE_GAP: BIRD_PILE_GAP, RIPEN_PACE: RIPEN_PACE,
    MOUSE_HIT_R: MOUSE_HIT_R, MOUSE_BIRD_R: MOUSE_BIRD_R,
    RANKS: RANKS, rankFor: rankFor,
    ripenScale: ripenScale, redWindow: redWindow, birdEvery: birdEvery, birdSpeed: birdSpeed, maxBirds: maxBirds,
    newWorld: newWorld, stepWorld: stepWorld, tapAt: tapAt, targetAt: targetAt, pickSlot: pickSlot, scareBird: scareBird, nextRed: nextRed,
    stageAt: stageAt, tierOf: tierOf, birdPos: birdPos, pathPoint: pathPoint, isMisted: isMisted
  };
});
