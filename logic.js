// Roast Master 5000: game rules with no drawing code, so they can be tested on their own.
// Works in the browser (window.RoastLogic) and in Node (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoastLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Bean temperature facts from Roger (2026-10-21)
  var SPIKE_TEMP = 170;        // beans spike to 170°F when roasting starts
  var CRACK_MIN = 390;         // first crack happens somewhere in 390-410°F, different every round
  var CRACK_MAX = 410;
  var LEVELS = [
    { id: 'light', label: 'Light', drop: 415 },
    { id: 'medium', label: 'Medium', drop: 425 },
    { id: 'dark', label: 'Dark', drop: 440 },
    { id: 'darkplus', label: 'Dark+', drop: 460 }
  ];

  var CHARGE_SECS = 0.7;       // 0 -> 170°F
  var CRACK_PAUSE_SECS = 0.45; // hold at the crack temp so the crack lands

  // Difficulty by round number (1-based). rng is injectable so tests are repeatable.
  // Window is +/- degrees F around the drop temp. The game reaches its hardest setting by round 7.
  function roundParams(n, rng) {
    rng = rng || Math.random;
    var i = Math.max(0, n - 1);
    var window_ = Math.max(1.5, 4.5 - 0.5 * i);
    // Lead time varies a lot each round: a short sprint or a long wait before first crack.
    var climbHi = Math.max(2.2, 3.6 - 0.2 * i);
    var climbLo = 0.9;
    return {
      round: n,
      crackTemp: CRACK_MIN + rng() * (CRACK_MAX - CRACK_MIN),
      climbSecs: climbLo + rng() * (climbHi - climbLo),   // 170°F -> crack temp
      rate: Math.min(32, 14 + 3 * i),                      // °F per second after first crack
      window: window_,
      perfect: Math.max(0.6, window_ * 0.4)                // dead-center radius
    };
  }

  function perfectRadius(p) { return Math.min(p.perfect, p.window); }

  // Bean temperature (°F) t seconds after roasting starts.
  function tempAt(p, t) {
    if (t <= 0) return 0;
    if (t < CHARGE_SECS) {
      var u = t / CHARGE_SECS;
      return SPIKE_TEMP * (1 - (1 - u) * (1 - u));      // fast spike, easing off
    }
    var t1 = CHARGE_SECS + p.climbSecs;
    if (t < t1) return SPIKE_TEMP + (p.crackTemp - SPIKE_TEMP) * ((t - CHARGE_SECS) / p.climbSecs);
    var t2 = t1 + CRACK_PAUSE_SECS;
    if (t < t2) return p.crackTemp;
    return p.crackTemp + p.rate * (t - t2);
  }

  function crackTime(p) { return CHARGE_SECS + p.climbSecs; }

  // Judge a drop at temp `temp` for a target drop temp.
  // Returns { result: 'perfect'|'hit'|'early'|'late', delta }
  function judgeDrop(temp, target, p) {
    var delta = temp - target;
    var a = Math.abs(delta);
    if (a <= perfectRadius(p)) return { result: 'perfect', delta: delta };
    if (a <= p.window) return { result: 'hit', delta: delta };
    return { result: delta < 0 ? 'early' : 'late', delta: delta };
  }

  // The beans burn if the player lets the temp run past the window.
  function isBurnt(temp, target, p) { return temp > target + p.window; }

  // Arcade scoring: whole numbers, no cap, higher is better (easy to rank on a leaderboard).
  //   on target = 100, perfect = 200, +20 per round reached, +50 for each perfect in a row before this one (up to 5).
  // `streak` is how many perfects in a row came right before this roast.
  function scoreFor(result, round, streak) {
    if (result !== 'perfect' && result !== 'hit') return 0;
    var base = result === 'perfect' ? 200 : 100;
    var bonus = 20 * Math.max(0, round - 1);
    var combo = result === 'perfect' ? 50 * Math.min(5, Math.max(0, streak || 0)) : 0;
    return base + bonus + combo;
  }

  // Random picks that never repeat the previous one. rng defaults to Math.random.
  function pickLevel(prevId, rng) {
    rng = rng || Math.random;
    var choices = LEVELS.filter(function (l) { return l.id !== prevId; });
    return choices[Math.floor(rng() * choices.length)];
  }
  function pickCoffee(prevName, pool, rng) {
    rng = rng || Math.random;
    var choices = pool.length > 1 ? pool.filter(function (c) { return c.name !== prevName; }) : pool;
    return choices[Math.floor(rng() * choices.length)];
  }

  // Short line about how the run ended. DRAFT WORDING: Roger approves before launch.
  function endLine(result, hits) {
    if (hits === 0) return 'A ruined first batch. The roaster needs another go.';
    if (result === 'late') return 'Then the next batch burnt. Smoky and ashy at the finish.';
    if (result === 'early') return 'Then the next drop came too soon. Grassy and underdeveloped.';
    return 'Dropped on target.';
  }

  return {
    SPIKE_TEMP: SPIKE_TEMP, CRACK_MIN: CRACK_MIN, CRACK_MAX: CRACK_MAX, LEVELS: LEVELS,
    CHARGE_SECS: CHARGE_SECS, CRACK_PAUSE_SECS: CRACK_PAUSE_SECS,
    roundParams: roundParams, tempAt: tempAt, crackTime: crackTime,
    judgeDrop: judgeDrop, isBurnt: isBurnt, scoreFor: scoreFor,
    pickLevel: pickLevel, pickCoffee: pickCoffee, endLine: endLine
  };
});
