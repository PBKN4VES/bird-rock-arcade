// Pour-Over Power Hour: game rules with no drawing code, so they can be tested on their own.
// Works in the browser (window.PourLogic) and in Node (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PourLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var MAX_STRIKES = 3;
  var POUR_SECS = 1.2;         // one pour; the kettle is locked in place while it runs
  var LOAD_SECS = 0.3;         // dropping in the filter and coffee
  var MOVE_SECS = 0.12;         // time to slide the kettle one dripper over
  var DRAWDOWN_SECS = 3;       // water drains through after the third pour, then the drink is served
  var RUIN_SECS = 0.8;         // how long a ruined brew sits there before the dripper is cleared
  var YELLOW_FRAC = 0.6;       // the call window is yellow for the first 60%, then red
  var MAX_QUEUE = 5;           // order tickets that can wait before a customer walks out
  var MIN_BOARD = 2;           // the order board is topped up when it drops below this, so it can never be cleared
  var RUSH_SECS = 0.5;         // ...with the next order landing this soon after a load drops it below the minimum
  var START_TICKETS = 2;       // orders already waiting when the shift starts
  var LEVEL_EVERY = 4;         // drinks served per level
  var JITTER = 0.1;            // each drink's waits vary by +/-10% so calls never fall into a pattern
  var MAX_DRIPPERS = 6;
  var KETTLE_CAP = 9;          // pours the kettle holds (3 drinks); refill it at the tap at the left end of the bar
  var FILL_SECS = 1.2;         // the kettle is locked in place while it fills
  var MIN_WAIT = 3;            // no recipe waits less than this between pours

  // Every order is a light, medium or dark roast, and the roast sets how long the waits are: light roasts bloom
  // slowly (long waits), dark roasts are quick. m1 / m2 scale the level's T1 / T2. The roast is shown on the ticket.
  var ROASTS = {
    light:  { name: 'Light',  m1: 1.5,  m2: 1.25 },
    medium: { name: 'Medium', m1: 1.0,  m2: 1.0 },
    dark:   { name: 'Dark',   m1: 0.6,  m2: 0.75 }
  };
  function pickRoast(rng) { var r = rng(); return r < 0.3 ? 'light' : r < 0.7 ? 'medium' : 'dark'; }
  // The waits (before the small random jitter) an order will have at the given level parameters.
  function recipeWaits(order, p) {
    var r = ROASTS[order && order.roast] || ROASTS.medium;
    return { t1: Math.max(MIN_WAIT, p.t1 * r.m1), t2: Math.max(MIN_WAIT, p.t2 * r.m2) };
  }

  // Difficulty by level. n = Kalita 185s on the bar, gap = seconds between new orders, t1 = wait between pour 1 and 2,
  // t2 = wait between pour 2 and 3, win = seconds to answer a call (yellow, then red).
  var LEVELS = [
    { n: 3, gap: 10.0, t1: 9, t2: 9, win: 7.0 },
    { n: 4, gap: 7.5, t1: 8, t2: 8, win: 6.0 },
    { n: 5, gap: 5.5, t1: 8, t2: 7, win: 5.0 },
    { n: 5, gap: 4.8, t1: 7, t2: 7, win: 4.4 },
    { n: 6, gap: 4.2, t1: 7, t2: 6, win: 3.8 },
    { n: 6, gap: 3.8, t1: 6, t2: 6, win: 3.4 },
    { n: 6, gap: 3.5, t1: 6, t2: 5, win: 3.1 }
  ];

  function levelParams(level) {
    var i = Math.max(1, level) - 1;
    if (i < LEVELS.length) return LEVELS[i];
    var k = i - (LEVELS.length - 1);                      // levels past the table keep squeezing, down to a floor
    return {
      n: MAX_DRIPPERS,
      gap: Math.max(3.0, LEVELS[LEVELS.length - 1].gap - 0.2 * k),
      t1: Math.max(4, LEVELS[LEVELS.length - 1].t1 - 0.25 * k),
      t2: Math.max(4, LEVELS[LEVELS.length - 1].t2 - 0.25 * k),
      win: Math.max(2.6, LEVELS[LEVELS.length - 1].win - 0.1 * k)
    };
  }
  function levelFor(served) { return 1 + Math.floor(served / LEVEL_EVERY); }

  // Arcade scoring: whole numbers, no cap (same shape as the other games).
  //   served = 100, perfect (every call answered in yellow) = 200, +20 for every 5 drinks into the run,
  //   +50 for each perfect in a row before this one (up to 5). `n` is the drink's number in the run.
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

  // Strike reasons: missed (a call ran out), backlog (too many tickets waiting).
  var STRIKE_LABELS = { missed: 'TOO LATE!', backlog: 'ORDER WALKED!' };

  // ---- the bar: all the rules in one small simulation, driven by tick / move / load / pour ----
  // Dripper states: empty, loaded, pouring, waiting, calling, drawdown, ruined.
  function newDripper() { return { state: 'empty', t: 0, pourNum: 0, coffee: null, t1: 0, t2: 0, win: 0, red: false, allYellow: true }; }

  function createBar(pool, rng) {
    rng = rng || Math.random;
    var bar = {
      pool: pool, rng: rng, time: 0, level: 1, params: levelParams(1), served: 0, perfects: 0, points: 0, streak: 0,
      strikes: 0, over: false, pos: 0, water: KETTLE_CAP, fillT: 0, lock: 0, moveCd: 0, queue: [], nextOrder: 0, drippers: [], events: [],
      prevCoffee: null, results: [], lastGood: null, lastReason: null
    };
    for (var i = 0; i < bar.params.n; i++) bar.drippers.push(newDripper());
    for (var k = 0; k < START_TICKETS; k++) addOrder(bar);
    bar.nextOrder = bar.params.gap;
    return bar;
  }

  function emit(bar, ev) { bar.events.push(ev); }

  function strike(bar, reason, i) {
    bar.strikes++; bar.streak = 0; bar.lastReason = reason;
    emit(bar, { type: 'strike', reason: reason, i: i, strikes: bar.strikes });
    if (bar.strikes >= MAX_STRIKES) { bar.over = true; emit(bar, { type: 'over' }); }
  }

  function addOrder(bar) {
    var c = pickCoffee(bar.prevCoffee, bar.pool, bar.rng);
    bar.prevCoffee = c.name;
    var order = { name: c.name, kind: c.kind, notes: c.notes, roast: pickRoast(bar.rng) };
    bar.queue.push(order);
    emit(bar, { type: 'order', coffee: order });
    if (bar.queue.length > MAX_QUEUE) {          // the oldest customer gives up and leaves
      bar.queue.shift();
      strike(bar, 'backlog', -1);
    }
  }

  function serve(bar, i) {
    var d = bar.drippers[i], n = bar.served + 1;
    var result = d.allYellow ? 'perfect' : 'hit';
    var pts = scoreFor(result, n, bar.streak);
    bar.streak = result === 'perfect' ? bar.streak + 1 : 0;
    if (result === 'perfect') bar.perfects++;
    bar.points += pts; bar.served = n;
    bar.results.push({ result: result, coffee: d.coffee });
    bar.lastGood = { coffee: d.coffee, result: result };
    emit(bar, { type: 'served', i: i, result: result, points: pts, coffee: d.coffee });
    bar.drippers[i] = newDripper();
    var lvl = levelFor(bar.served);
    if (lvl > bar.level) {
      bar.level = lvl; bar.params = levelParams(lvl);
      var added = false;
      while (bar.drippers.length < bar.params.n) { bar.drippers.push(newDripper()); added = true; }
      emit(bar, { type: 'levelup', level: lvl, newStation: added });
    }
  }

  function stepDripper(bar, i, dt) {
    var d = bar.drippers[i];
    if (d.state === 'pouring') {
      d.t -= dt;
      if (d.t <= 0) {
        if (d.pourNum < 3) { d.state = 'waiting'; d.t = d.pourNum === 1 ? d.t1 : d.t2; }
        else { d.state = 'drawdown'; d.t = DRAWDOWN_SECS; }
      }
    } else if (d.state === 'waiting') {
      d.t -= dt;
      if (d.t <= 0) { d.state = 'calling'; d.t = 0; d.red = false; emit(bar, { type: 'call', i: i, pourNum: d.pourNum + 1 }); }
    } else if (d.state === 'calling') {
      d.t += dt;
      if (!d.red && d.t >= d.win * YELLOW_FRAC) { d.red = true; emit(bar, { type: 'red', i: i }); }
      if (d.t >= d.win) { d.state = 'ruined'; d.t = RUIN_SECS; emit(bar, { type: 'ruined', i: i }); strike(bar, 'missed', i); }
    } else if (d.state === 'drawdown') {
      d.t -= dt;
      if (d.t <= 0) serve(bar, i);
    } else if (d.state === 'ruined') {
      d.t -= dt;
      if (d.t <= 0) bar.drippers[i] = newDripper();
    }
  }

  function tick(bar, dt) {
    if (bar.over) return;
    bar.time += dt;
    bar.lock = Math.max(0, bar.lock - dt);
    bar.moveCd = Math.max(0, bar.moveCd - dt);
    bar.fillT = Math.max(0, bar.fillT - dt);
    bar.nextOrder -= dt;
    while (bar.nextOrder <= 0 && !bar.over) { addOrder(bar); bar.nextOrder += bar.params.gap; }
    for (var i = 0; i < bar.drippers.length && !bar.over; i++) stepDripper(bar, i, dt);
  }

  // Slide the kettle one dripper over (dir is -1 or +1). The kettle can't move while pouring or loading.
  function move(bar, dir) {
    if (bar.over || bar.lock > 0 || bar.moveCd > 0) return false;
    var np = Math.max(-1, Math.min(bar.drippers.length - 1, bar.pos + (dir < 0 ? -1 : 1)));   // -1 is the tap
    if (np === bar.pos) return false;
    bar.pos = np; bar.moveCd = MOVE_SECS;
    emit(bar, { type: 'move', pos: np });
    return true;
  }

  // Load the dripper under the kettle with a filter and coffee (needs an empty dripper and a waiting ticket).
  // At the tap, the same key fills the kettle instead.
  function load(bar) {
    if (bar.over || bar.lock > 0) return false;
    if (bar.pos < 0) {
      if (bar.water >= KETTLE_CAP) { emit(bar, { type: 'full' }); return false; }
      bar.water = KETTLE_CAP; bar.lock = FILL_SECS; bar.fillT = FILL_SECS;
      emit(bar, { type: 'fill' });
      return true;
    }
    var d = bar.drippers[bar.pos];
    if (d.state !== 'empty') { emit(bar, { type: 'blocked', i: bar.pos }); return false; }
    if (!bar.queue.length) { emit(bar, { type: 'noTicket', i: bar.pos }); return false; }
    var p = bar.params, j = function () { return 1 - JITTER + 2 * JITTER * bar.rng(); };
    d.coffee = bar.queue.shift();
    // A busy bar keeps the orders coming: if the board is running low, the next order arrives almost at once
    // (so a fast player gets more orders sooner, and the board is never empty).
    if (bar.queue.length < MIN_BOARD && bar.nextOrder > RUSH_SECS) bar.nextOrder = RUSH_SECS;
    if (!bar.queue.length) { addOrder(bar); bar.nextOrder = Math.max(bar.nextOrder, RUSH_SECS); }
    d.state = 'loaded'; d.pourNum = 0; d.red = false; d.allYellow = true;
    var w = recipeWaits(d.coffee, p);
    d.t1 = w.t1 * j(); d.t2 = w.t2 * j(); d.win = p.win;
    bar.lock = LOAD_SECS;
    emit(bar, { type: 'load', i: bar.pos, coffee: d.coffee });
    return true;
  }

  // Pour: starts pour 1 on a loaded dripper, or answers a yellow/red call. Anything else is "too early" (no penalty).
  function pour(bar) {
    if (bar.over || bar.lock > 0) return false;
    var d = bar.drippers[bar.pos];
    if (!d || (d.state !== 'loaded' && d.state !== 'calling')) { emit(bar, { type: 'early', i: bar.pos }); return false; }
    if (bar.water <= 0) { emit(bar, { type: 'dry', i: bar.pos }); return false; }     // out of water: go to the tap
    bar.water--;
    if (d.state === 'calling') d.allYellow = d.allYellow && !d.red;
    d.pourNum++; d.state = 'pouring'; d.t = POUR_SECS; d.red = false;
    bar.lock = POUR_SECS;
    emit(bar, { type: 'pour', i: bar.pos, n: d.pourNum, water: bar.water });
    return true;
  }

  return {
    MAX_STRIKES: MAX_STRIKES, POUR_SECS: POUR_SECS, LOAD_SECS: LOAD_SECS, MOVE_SECS: MOVE_SECS, DRAWDOWN_SECS: DRAWDOWN_SECS,
    RUIN_SECS: RUIN_SECS, YELLOW_FRAC: YELLOW_FRAC, MAX_QUEUE: MAX_QUEUE, MIN_BOARD: MIN_BOARD, RUSH_SECS: RUSH_SECS, START_TICKETS: START_TICKETS, LEVEL_EVERY: LEVEL_EVERY,
    JITTER: JITTER, MAX_DRIPPERS: MAX_DRIPPERS, KETTLE_CAP: KETTLE_CAP, FILL_SECS: FILL_SECS, MIN_WAIT: MIN_WAIT, ROASTS: ROASTS, recipeWaits: recipeWaits, LEVELS: LEVELS, STRIKE_LABELS: STRIKE_LABELS,
    levelParams: levelParams, levelFor: levelFor, scoreFor: scoreFor, pickCoffee: pickCoffee,
    createBar: createBar, tick: tick, move: move, load: load, pour: pour
  };
});
