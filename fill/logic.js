// Fill Master 3000: game rules with no drawing code, so they can be tested on their own.
// Works in the browser (window.FillLogic) and in Node (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FillLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var TARGET = 10;             // ounces in a Bird Rock retail bag
  var GAUGE_MAX = 15;          // top of the weight gauge
  var MAX_STRIKES = 3;
  var ZONE_HALF = 21;          // px either side of the spout where a bag can take beans
  var BAG_W = 36;
  var MIN_GAP = 84;            // px between bag centers; wider than the zone plus a bag, so only one bag is ever fillable
  var SPEED_START = 30;        // belt px per second
  var SPEED_STEP = 3.2;        // faster for every bag that gets through
  var SPEED_CAP = 95;          // reached around bag 21

  // n is the bag's number in the run (1-based).
  function beltSpeed(n) { return Math.min(SPEED_CAP, SPEED_START + SPEED_STEP * Math.max(0, n - 1)); }

  // Seconds a bag spends where it can be filled.
  function dwellSecs(speed) { return 2 * ZONE_HALF / speed; }

  // Difficulty by bag number. rng is injectable so tests are repeatable.
  // Pour rate is in ounces per second and differs bag to bag. The window is set in seconds of timing,
  // so it is +/- (rate x seconds) ounces around 10 oz and the timing always feels the same size.
  function bagParams(n, rng) {
    rng = rng || Math.random;
    var i = Math.max(0, n - 1);
    var speed = beltSpeed(n);
    var dwell = dwellSecs(speed);
    var minRate = TARGET / (0.75 * dwell);                // the fill always fits in 75% of the time under the spout
    var rate = minRate * (1 + 0.35 * rng());
    var winSecs = Math.max(0.07, 0.24 - 0.014 * i);       // narrows to its floor by bag 13
    var window_ = rate * winSecs;
    return {
      bag: n,
      speed: speed,
      dwell: dwell,
      rate: rate,
      window: window_,
      perfect: Math.min(window_, Math.max(rate * 0.035, window_ * 0.4))   // dead-center radius
    };
  }

  // Distance between one bag center and the next, uneven on purpose.
  function gapFor(n, rng) {
    rng = rng || Math.random;
    var i = Math.max(0, n - 1);
    var hi = Math.max(MIN_GAP + 10, 130 - 1.8 * i);
    return MIN_GAP + rng() * (hi - MIN_GAP);
  }

  // Ounces in the bag after pouring for `held` seconds.
  function weightAt(rate, held) { return Math.max(0, rate * held); }

  function perfectRadius(p) { return Math.min(p.perfect, p.window); }

  // Judge a bag at `weight` ounces. Returns { result: 'perfect'|'hit'|'under'|'over', delta }
  function judgeFill(weight, p) {
    var delta = weight - TARGET;
    var a = Math.abs(delta);
    if (a <= perfectRadius(p)) return { result: 'perfect', delta: delta };
    if (a <= p.window) return { result: 'hit', delta: delta };
    return { result: delta < 0 ? 'under' : 'over', delta: delta };
  }

  // The bag overflows the moment the weight passes the window, even if the player is still holding.
  function isOverflow(weight, p) { return weight > TARGET + p.window; }

  // Arcade scoring: whole numbers, no cap, higher is better (easy to rank on a leaderboard).
  //   on target = 100, perfect = 200, +20 for every 5 bags into the run, +50 for each perfect in a row before this one (up to 5).
  // `n` is the bag's number in the run; `streak` is how many perfects in a row came right before this bag.
  function scoreFor(result, n, streak) {
    if (result !== 'perfect' && result !== 'hit') return 0;
    var base = result === 'perfect' ? 200 : 100;
    var bonus = 20 * Math.floor(Math.max(0, n - 1) / 5);
    var combo = result === 'perfect' ? 50 * Math.min(5, Math.max(0, streak || 0)) : 0;
    return base + bonus + combo;
  }

  // Random coffee that never repeats the previous one. rng defaults to Math.random.
  function pickCoffee(prevName, pool, rng) {
    rng = rng || Math.random;
    var choices = pool.length > 1 ? pool.filter(function (c) { return c.name !== prevName; }) : pool;
    return choices[Math.floor(rng() * choices.length)];
  }

  // Strike reasons: under, over, spill (poured with no bag), missed (a bag went by untouched).
  var STRIKE_LABELS = { under: 'TOO LIGHT!', over: 'OVERFLOW!', spill: 'SPILLED!', missed: 'MISSED!' };

  return {
    TARGET: TARGET, GAUGE_MAX: GAUGE_MAX, MAX_STRIKES: MAX_STRIKES, ZONE_HALF: ZONE_HALF, BAG_W: BAG_W,
    MIN_GAP: MIN_GAP, SPEED_START: SPEED_START, SPEED_CAP: SPEED_CAP, STRIKE_LABELS: STRIKE_LABELS,
    beltSpeed: beltSpeed, dwellSecs: dwellSecs, bagParams: bagParams, gapFor: gapFor, weightAt: weightAt,
    judgeFill: judgeFill, isOverflow: isOverflow, scoreFor: scoreFor, pickCoffee: pickCoffee
  };
});
