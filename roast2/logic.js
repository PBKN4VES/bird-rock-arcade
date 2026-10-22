// Roast Master 5000: game rules with no drawing code, so they can be tested on their own.
// Works in the browser (window.Roast2Logic) and in Node (require). Roast levels and the coffee/level pickers
// come from the original game's ../logic.js (window.RoastLogic).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Roast2Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var SPIKE_TEMP = 170;        // beans sit at 170°F the moment a bag tips into the drum
  var CRACK_MIN = 390;         // first crack happens somewhere in 390-410°F, different every batch
  var CRACK_MAX = 410;
  var STALL_SECS = 0.3;        // heating slows to a crawl for a moment at first crack
  var STALL_FACTOR = 0.2;
  var DUMP_SECS = 0.7;         // looks only: the bag empties into the hopper while the player can already start
  var RESULT_SECS = 0.8;
  var MAX_STRIKES = 3;
  var GAUGE_LO = 390, GAUGE_HI = 475;
  var SPACING = 100;           // px between bags on the belt
  var T_BASE = 5.6;            // the old starting gap; the HUD's BELT multiplier is measured against it
  var T_START = T_BASE / 1.3;  // seconds between bags at first: the belt starts at the old x1.3 pace
  var T_STEP = 0.2688;        // bags come faster after every batch (0.24 x 1.12)
  var T_FLOOR = T_BASE / 2.1;  // fastest the belt gets: x2.1 on the HUD
  var HEAT_SHIFT = 8;          // heating starts partway up its ramp so the faster belt stays doable

  // Seconds from one bag arriving at the roaster to the next. A batch must be dropped inside this time.
  function batchSecs(n) { return Math.max(T_FLOOR, T_START - T_STEP * Math.max(0, n - 1)); }
  function beltSpeed(n) { return SPACING / batchSecs(n); }
  var BELT_BASE = SPACING / T_BASE;   // belt speed that the HUD calls x1.0

  // Seconds the player has to start holding once a bag tips in (the bar runs out to the left): 2.0 s, shrinking to 1.0 s by batch 5.
  function startSecs(n) { return Math.max(1.0, 2.0 - 0.25 * Math.max(0, n - 1)); }

  // Timing window in seconds of holding (same idea as Fill Master): the temperature window is this many seconds of heating,
  // so the timing always feels the same size however fast a batch heats.
  // 0.24 s at batch 1, 0.07 s at batch 10, 0.035 s at batch 20, then a slow squeeze to a 0.025 s floor at batch 30.
  function winSecs(n) {
    var k = Math.max(0, n - 1);
    if (k <= 9) return 0.24 - 0.0189 * k;
    if (k <= 19) return 0.07 - 0.0035 * (k - 9);
    return Math.max(0.025, 0.035 - 0.001 * (k - 19));
  }

  // Difficulty by batch number (1-based). rng is injectable so tests are repeatable.
  // Every batch has its own heating speeds and first-crack temp.
  function batchParams(n, rng) {
    rng = rng || Math.random;
    var i = Math.max(0, n - 1) + HEAT_SHIFT;   // heating starts as fast as it used to by batch 1+HEAT_SHIFT, to fit the faster belt
    var lo = Math.min(92, 36 + 1.5 * i), hi = Math.min(110, 39 + 2.0 * i);
    var postRate = lo + rng() * (hi - lo);       // °F per second after first crack while holding
    var window_ = postRate * winSecs(n);
    return {
      batch: n,
      crackTemp: CRACK_MIN + rng() * (CRACK_MAX - CRACK_MIN),
      preRate: 260 + Math.min(140, 12 * i) + rng() * 60,                 // °F per second from 170°F up to first crack while holding
      postRate: postRate,
      window: window_,
      perfect: Math.min(window_ * 0.7, Math.max(postRate * 0.025, window_ * 0.4))   // dead-center radius
    };
  }
  function perfectRadius(p) { return Math.min(p.perfect, p.window); }

  // The roast in the drum. Call heat() while the player holds.
  function newRoast() { return { temp: SPIKE_TEMP, cracked: false, stall: 0 }; }

  function rateNow(s, p) {
    if (!s.cracked) return p.preRate;
    return s.stall > 0 ? p.postRate * STALL_FACTOR : p.postRate;
  }

  // Heat the beans for dt seconds. Returns true on the step first crack happens.
  function heat(s, p, dt) {
    if (!s.cracked) {
      var gain = p.preRate * dt;
      if (s.temp + gain >= p.crackTemp) { s.temp = p.crackTemp; s.cracked = true; s.stall = STALL_SECS; return true; }
      s.temp += gain;
      return false;
    }
    s.temp += rateNow(s, p) * dt;
    if (s.stall > 0) s.stall = Math.max(0, s.stall - dt);
    return false;
  }

  // Judge the temperature at the moment the player lets go. Before first crack is always too early.
  // Returns { result: 'perfect'|'hit'|'early'|'late', delta }
  function judgeRoast(temp, target, p, cracked) {
    var delta = temp - target, a = Math.abs(delta);
    if (!cracked) return { result: 'early', delta: delta };
    if (a <= perfectRadius(p)) return { result: 'perfect', delta: delta };
    if (a <= p.window) return { result: 'hit', delta: delta };
    return { result: delta < 0 ? 'early' : 'late', delta: delta };
  }

  // Holding past the window burns the batch at once.
  function isBurnt(temp, target, p) { return temp > target + p.window; }

  // Seconds a batch needs if the player starts at once and holds the whole way (used to prove each batch is doable).
  function neededSecs(p, target) {
    var pre = (p.crackTemp - SPIKE_TEMP) / p.preRate;
    var stallGain = p.postRate * STALL_FACTOR * STALL_SECS;
    var rest = Math.max(0, target - p.crackTemp - stallGain) / p.postRate;
    return pre + STALL_SECS + rest;
  }

  // Arcade scoring, same shape as Roast Master and Fill Master: whole numbers, no cap.
  //   on target = 100, perfect = 200, +20 for every 5 batches into the run, +50 per perfect in a row before this one (up to 5).
  function scoreFor(result, n, streak) {
    if (result !== 'perfect' && result !== 'hit') return 0;
    var base = result === 'perfect' ? 200 : 100;
    var bonus = 20 * Math.floor(Math.max(0, n - 1) / 5);
    var combo = result === 'perfect' ? 50 * Math.min(5, Math.max(0, streak || 0)) : 0;
    return base + bonus + combo;
  }

  // Strike reasons: early (too cool), burnt (too hot), slow (next bag arrived first), nostart (the start bar ran out).
  var STRIKE_LABELS = { early: 'TOO COOL!', burnt: 'BURNT!', slow: 'TOO SLOW!', nostart: 'NO START!' };

  return {
    SPIKE_TEMP: SPIKE_TEMP, CRACK_MIN: CRACK_MIN, CRACK_MAX: CRACK_MAX, STALL_SECS: STALL_SECS, STALL_FACTOR: STALL_FACTOR,
    DUMP_SECS: DUMP_SECS, RESULT_SECS: RESULT_SECS, MAX_STRIKES: MAX_STRIKES, GAUGE_LO: GAUGE_LO, GAUGE_HI: GAUGE_HI,
    SPACING: SPACING, BELT_BASE: BELT_BASE, T_FLOOR: T_FLOOR, STRIKE_LABELS: STRIKE_LABELS,
    batchSecs: batchSecs, beltSpeed: beltSpeed, startSecs: startSecs, winSecs: winSecs, batchParams: batchParams,
    newRoast: newRoast, rateNow: rateNow, heat: heat, judgeRoast: judgeRoast, isBurnt: isBurnt, neededSecs: neededSecs,
    scoreFor: scoreFor
  };
});
