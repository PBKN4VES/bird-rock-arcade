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
  var SPEED_STEP = 2.4;        // faster for every bag that gets through (was 3.2 before bag sizes and damaged bags were added)
  var SPEED_CAP = 80;          // reached around bag 21 (was 95)
  var SIZE_K = 0.6;            // how much a bag's size stretches the hold: fill time grows with (size / 10 oz) ^ 0.6
  var KRAFT_SIZES = [4, 6];    // Blue Label bags: 4 oz or 6 oz
  var BIG_TARGET = 32;         // the 2 lb bag, in ounces; a standard (blue or white) bag can be 10 oz or this
  var BIG_BAG_FROM = 7;        // the 2 lb bag joins the mix at this bag number
  var KRAFT_FROM = 4;          // Blue Label bags start here
  var DAMAGED_FROM = 7;        // tipped-over bags (do not fill) start here

  // n is the bag's number in the run (1-based).
  function beltSpeed(n) { return Math.min(SPEED_CAP, SPEED_START + SPEED_STEP * Math.max(0, n - 1)); }

  // Seconds a bag spends where it can be filled.
  function dwellSecs(speed, zoneHalf) { return 2 * (zoneHalf || ZONE_HALF) / speed; }

  // Each size has its own footprint. Bigger bags take longer to fill, so they get a wider fill zone (and are drawn wider).
  function zoneHalfFor(target) { return Math.ceil(ZONE_HALF * Math.max(1, Math.pow(target / TARGET, SIZE_K))); }
  function bagWidthFor(target) { return target >= 20 ? 50 : target >= 8 ? BAG_W : target >= 5 ? 30 : 26; }
  function bagHeightFor(target) { return target >= 20 ? 64 : target >= 8 ? 60 : target >= 5 ? 50 : 44; }

  // Difficulty by bag number. rng is injectable so tests are repeatable.
  // Pour rate is in ounces per second and differs bag to bag. The window is set in seconds of timing,
  // so it is +/- (rate x seconds) ounces around 10 oz and the timing always feels the same size.
  // `target` is the bag's size in ounces (10 when left out). Size changes how long the player must hold, not just the
  // number on the gauge: pour rate scales with size more gently than the size itself, so a 4 oz bag is a quick tap
  // and a 2 lb bag is a long hold. The timing window is still the same number of seconds at every size.
  function bagParams(n, rng, target) {
    rng = rng || Math.random;
    target = target || TARGET;
    var i = Math.max(0, n - 1);
    var speed = beltSpeed(n);
    var zh = zoneHalfFor(target);
    var dwell = dwellSecs(speed, zh);
    var stdDwell = dwellSecs(speed);
    var minRate = TARGET / (0.75 * stdDwell);             // a 10 oz fill always fits in 75% of the time under the spout
    var rate = minRate * (1 + 0.35 * rng()) * Math.pow(target / TARGET, 1 - SIZE_K);
    var winSecs = Math.max(0.07, 0.24 - 0.014 * i);       // narrows to its floor by bag 13
    var window_ = rate * winSecs;
    return {
      bag: n,
      target: target,
      zoneHalf: zh,
      speed: speed,
      dwell: dwell,
      rate: rate,
      window: window_,
      // Top of the gauge: always 15 for a 10 oz bag (as before); other sizes get 1.5x their size or more, so the overflow zone fits.
      gaugeMax: target === TARGET ? GAUGE_MAX : Math.ceil(Math.max(1.5 * target, target + 1.5 * window_)),
      perfect: Math.min(window_, Math.max(rate * 0.035, window_ * 0.4))   // dead-center radius
    };
  }

  // Distance between one bag center and the next, uneven on purpose.
  // `minGap` is the closest the next bag may sit (see minGapBetween); it defaults to the 10 oz bag spacing.
  function gapFor(n, rng, minGap) {
    rng = rng || Math.random;
    minGap = minGap || MIN_GAP;
    var i = Math.max(0, n - 1);
    var hi = Math.max(minGap + 10, 130 - 1.8 * i);
    return minGap + rng() * (hi - minGap);
  }

  // Closest two neighbors may sit: both fill zones and both bag bodies fit, so only one bag is ever fillable.
  // For two 10 oz bags this is the old 84. A bag spec is { zoneHalf, width }.
  function minGapBetween(a, b) { return a.zoneHalf + b.zoneHalf + (a.width + b.width) / 2 + 6; }

  // Ounces in the bag after pouring for `held` seconds.
  function weightAt(rate, held) { return Math.max(0, rate * held); }

  function perfectRadius(p) { return Math.min(p.perfect, p.window); }

  // Judge a bag at `weight` ounces. Returns { result: 'perfect'|'hit'|'under'|'over', delta }
  function judgeFill(weight, p) {
    var delta = weight - (p.target || TARGET);
    var a = Math.abs(delta);
    if (a <= perfectRadius(p)) return { result: 'perfect', delta: delta };
    if (a <= p.window) return { result: 'hit', delta: delta };
    return { result: delta < 0 ? 'under' : 'over', delta: delta };
  }

  // The bag overflows the moment the weight passes the window, even if the player is still holding.
  function isOverflow(weight, p) { return weight > (p.target || TARGET) + p.window; }

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

  // What the next bag on the belt is. Three kinds:
  //   standard: a Bird Rock bag (blue single origin or white blend, any coffee): 10 oz, or from bag 7 sometimes the 2 lb bag (32 oz)
  //   kraft:    a Blue Label bag (single origin), 4 oz or 6 oz
  //   damaged:  a tipped-over, torn bag. Do NOT fill it; pouring on it is a spill strike, letting it pass is free.
  // `n` is how many bags have been filled so far plus one (it gates when each kind starts), `prev` is the previous
  // spec (so a damaged bag never follows a damaged bag and the same coffee never repeats).
  function specFor(kind, target, coffee) {
    var zh = kind === 'damaged' ? ZONE_HALF : zoneHalfFor(target);
    return {
      kind: kind, target: kind === 'damaged' ? 0 : target, coffee: coffee || null, zoneHalf: zh,
      width: kind === 'damaged' ? 60 : bagWidthFor(target), height: kind === 'damaged' ? 36 : bagHeightFor(target)
    };
  }
  function bigChance(n) { return n < BIG_BAG_FROM ? 0 : Math.min(0.35, 0.2 + 0.01 * (n - BIG_BAG_FROM)); }
  function kraftChance(n) { return n < KRAFT_FROM ? 0 : Math.min(0.5, 0.3 + 0.01 * (n - KRAFT_FROM)); }
  function damagedChance(n) { return n < DAMAGED_FROM ? 0 : Math.min(0.18, 0.1 + 0.005 * (n - DAMAGED_FROM)); }
  function pickBag(n, prev, pool, rng) {
    rng = rng || Math.random;
    var prevName = prev && prev.coffee ? prev.coffee.name : null;
    var roll = rng();
    if (damagedChance(n) > 0 && (!prev || prev.kind !== 'damaged') && roll < damagedChance(n)) return specFor('damaged', 0, null);
    roll = rng();
    if (roll < kraftChance(n)) {
      var singles = pool.filter(function (c) { return c.kind === 'single'; });
      if (singles.length) {
        return specFor('kraft', KRAFT_SIZES[Math.floor(rng() * KRAFT_SIZES.length)], pickCoffee(prevName, singles, rng));
      }
    }
    var big = rng() < bigChance(n) && !(prev && prev.target >= 20);          // no two 2 lb bags in a row
    return specFor('standard', big ? BIG_TARGET : TARGET, pickCoffee(prevName, pool, rng));
  }

  // Strike reasons: under, over, spill (poured with no bag), missed (a bag went by untouched), damaged (poured on a tipped-over bag).
  var STRIKE_LABELS = { under: 'TOO LIGHT!', over: 'OVERFLOW!', spill: 'SPILLED!', missed: 'MISSED!', damaged: 'DAMAGED BAG!' };

  return {
    TARGET: TARGET, GAUGE_MAX: GAUGE_MAX, MAX_STRIKES: MAX_STRIKES, ZONE_HALF: ZONE_HALF, BAG_W: BAG_W,
    MIN_GAP: MIN_GAP, SPEED_START: SPEED_START, SPEED_CAP: SPEED_CAP, STRIKE_LABELS: STRIKE_LABELS,
    KRAFT_SIZES: KRAFT_SIZES, BIG_TARGET: BIG_TARGET, bigChance: bigChance, KRAFT_FROM: KRAFT_FROM, BIG_BAG_FROM: BIG_BAG_FROM, DAMAGED_FROM: DAMAGED_FROM,
    zoneHalfFor: zoneHalfFor, bagWidthFor: bagWidthFor, bagHeightFor: bagHeightFor, minGapBetween: minGapBetween,
    pickBag: pickBag, specFor: specFor, kraftChance: kraftChance, damagedChance: damagedChance,
    beltSpeed: beltSpeed, dwellSecs: dwellSecs, bagParams: bagParams, gapFor: gapFor, weightAt: weightAt,
    judgeFill: judgeFill, isOverflow: isOverflow, scoreFor: scoreFor, pickCoffee: pickCoffee
  };
});
