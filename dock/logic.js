// Forklift Frenzy (folder and id: dock): warehouse rules with no drawing code, so they can be tested on their own.
// Works in the browser (window.DockLogic) and in Node (require). Plan: forklift-plan.md.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DockLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var COLS = 8, ROWS = 10;
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // 0 north (up the screen), 1 east, 2 south, 3 west
  var TOP_FORK = 3;            // fork heights: 0 floor, 1-3 shelf levels
  var FLOOR_STACK = 2;         // pallets sit at most this many high on the floor

  // Feel, in seconds. These are the numbers to tune in F2.
  var MOVE_T = 0.16, TURN_T = 0.22, FORK_T = 0.2, PICK_T = 0.3, DROP_T = 0.3, BUMP_T = 0.12, WRONG_T = 0.5;
  var HIGH_FORK = 2;           // carrying at this height or above is "high": slower (the wobble meter was cut after Roger's F2 play)
  var HIGH_SLOW = 1.6;         // moves and turns take this much longer with a high load
  var PREP_TIME = 5;           // seconds to study the layout before the clock starts

  // Hazards (F3).
  var WALK_T = 0.5;            // a coworker takes one step this often
  var WALK_SLIDE = 0.25;       // ...and is still half in the tile they left for this long
  var HONK_R = 4;              // honking reaches coworkers this many tiles away (steps along the floor grid)
  var HONK_COOL = 0.4;         // seconds between honks (shorter than a coworker step, so you can always warn the next one)
  var ALERT_T = 3;             // a honked coworker keeps clear of the forklift this long
  var DOOR_OPEN = 6, DOOR_SHUT = 3.5, DOOR_WARN = 1.2;   // roll-up door cycle, and the warning flash before it closes
  var HAZARD_T = 4;            // extra timer seconds per coworker, door and moving jack
  var JACK_PARK = 3, JACK_ROLL = 0.6, JACK_GIVEUP = 1.5;   // moving jack: pause at each end, roll time per tile, turn back if blocked this long
  var STRIKES = 3;

  // Score: whole numbers, no cap.
  var SHELF_PTS = 10;          // per pallet shelved in the right bay, times the streak multiplier
  var TIME_PTS = 1;            // per whole second left when a truck is cleared, times the multiplier
  var MULT_CAP = 4;            // multiplier = 1 + strike-free trucks in a row, up to this

  // Warehouse layouts, 8 x 10. R = shelf rack (3 levels), D = loading dock floor, . = floor, # = wall, F = forklift start.
  // Racks in one row are split into bays of 2 (3 when one would be left over); each bay takes one origin.
  var LAYOUTS = [
    ['RRRRRRRR',
     '........',
     '........',
     '.RRRRRR.',
     '........',
     '........',
     '........',
     '...F....',
     '..DDDD..',
     '..DDDD..'],
    ['RRR..RRR',
     '........',
     '.RR..RR.',
     '.RR..RR.',
     '........',
     'R......R',
     'R......R',
     '...F....',
     '.DDDDDD.',
     '.DDDDDD.'],
    ['RRRR.RRR',
     '........',
     '........',
     'RR.RR.RR',
     '........',
     '........',
     '.RR..RR.',
     '...F....',
     'DDDDDDDD',
     '.DDDDDD.']
  ];

  // How big and hard truck n is (n starts at 1). Puzzle ramp raised after Roger's F2 play (2026-10-26): the basics take
  // one or two trucks, so the harder layouts, aisle clutter, deeper stacks and part-full shelves arrive early.
  // F3 (Roger, 2026-10-26): fuller shelves, and one new hazard per band: pallet jacks from truck 2, coworkers from 3,
  // a roll-up door from 5 (the tight layout), and a second jack and coworker from 6 and 7.
  function difficulty(n) {
    return {
      pallets: Math.min(2 + n, 12),
      origins: Math.min(2 + Math.floor((n - 1) / 2), 5),
      layout: n <= 1 ? 0 : n <= 3 ? 1 : 2,
      clutter: n <= 1 ? 0 : Math.min(1 + Math.floor((n - 2) / 2), 3),   // truck pallets left on the warehouse floor, not the dock
      stackBias: n <= 1 ? 0.3 : 0.7,      // chance a dock pallet goes on top of another when it can
      // share of reachable shelf slots already full of stock (truck 1 too, so the warehouse looks lived in: Roger 2026-10-26)
      stock: n <= 1 ? 0.25 : Math.min(0.35 + 0.06 * (n - 2), 0.7),
      jacks: n <= 1 ? 0 : n <= 5 ? 1 : 2,
      movers: n <= 7 ? 0 : n <= 10 ? 1 : 2,   // how many of those jacks roll back and forth (Roger, 2026-10-26)
      walkers: n <= 2 ? 0 : n <= 6 ? 1 : 2,
      doors: n <= 4 ? 0 : 1,
      slack: Math.max(1.3, 1.9 - 0.06 * (n - 1))   // truck timer = solution time x this (plus HAZARD_T per coworker and door)
    };
  }

  // ---- The warehouse ----

  function parseLayout(rows, swing) {
    var h = rows.length, w = rows[0].length, cells = [], start = null;
    for (var y = 0; y < h; y++) {
      if (rows[y].length !== w) throw new Error('layout rows must be the same width');
      for (var x = 0; x < w; x++) {
        var ch = rows[y].charAt(x);
        if (ch === 'F') { start = { x: x, y: y, dir: 0, fork: 0 }; ch = '.'; }
        if ('R.D#'.indexOf(ch) < 0) throw new Error('bad layout character ' + ch);
        cells.push({ k: ch, origin: -1, stack: [], slots: [null, null, null, null], jack: false, door: -1, route: false });
      }
    }
    return { w: w, h: h, cells: cells, pallets: [], start: start, swing: swing !== false,
      limit: 60, planTime: 0, plan: null, truck: 0, origins: 0, doors: [], walkers: [], movers: [] };
  }

  function cellAt(lv, x, y) { return (x < 0 || y < 0 || x >= lv.w || y >= lv.h) ? null : lv.cells[y * lv.w + x]; }
  function isFloor(c) { return !!c && (c.k === '.' || c.k === 'D'); }
  // Bare floor: nothing on it and nothing parked there (a door counts while it is open).
  function isOpen(lv, x, y) {
    var c = cellAt(lv, x, y);
    return isFloor(c) && c.stack.length === 0 && !c.jack && !(c.door >= 0 && !lv.doors[c.door].open);
  }
  // A plain aisle tile where a pallet, a jack or a coworker can be: not dock, not a doorway, not a moving jack's track.
  function isAisle(c) { return !!c && c.k === '.' && !c.jack && c.door < 0 && !c.route; }

  // Adds a pallet jack (an obstacle) or a roll-up door. Doors start open.
  function addJack(lv, x, y) { cellAt(lv, x, y).jack = true; }
  function addDoor(lv, x, y, t) {
    cellAt(lv, x, y).door = lv.doors.length;
    lv.doors.push({ x: x, y: y, open: true, t: t == null ? DOOR_OPEN : t });
  }
  // Adds a pallet jack that rolls back and forth along route (a list of [x, y] tiles in a straight line), starting at
  // the first tile.
  function addMover(lv, route, t) {
    route.forEach(function (r) { cellAt(lv, r[0], r[1]).route = true; });
    cellAt(lv, route[0][0], route[0][1]).jack = true;
    lv.movers.push({ route: route, i: 0, step: 1, x: route[0][0], y: route[0][1], px: route[0][0], py: route[0][1],
      slide: 0, blocked: 0, t: t == null ? JACK_PARK : t });
  }
  // Adds a coworker walking along a row; dx is 1 (east) or -1 (west).
  function addWalker(lv, x, y, dx, t) {
    lv.walkers.push({ x: x, y: y, dx: dx, px: x, py: y, slide: 0, alert: 0, t: t == null ? WALK_T : t });
  }
  // Is a coworker in this tile (or still half in it, having just stepped out)?
  function walkerOn(lv, x, y) {
    return lv.walkers.some(function (w) { return (w.x === x && w.y === y) || (w.slide > 0 && w.px === x && w.py === y); });
  }

  // Adds a pallet. On a rack it needs a shelf level (1-3) and counts as shelved; on the floor it goes on top of the stack.
  function addPallet(lv, origin, x, y, level) {
    var id = lv.pallets.length, c = cellAt(lv, x, y);
    var p = { id: id, origin: origin, shelved: false, lost: false };
    lv.pallets.push(p);
    if (c.k === 'R') { c.slots[level] = id; p.shelved = true; }
    else c.stack.push(id);
    return id;
  }

  function cloneLevel(lv) {
    var o = {};
    for (var k in lv) o[k] = lv[k];
    o.cells = lv.cells.map(function (c) {
      return { k: c.k, origin: c.origin, stack: c.stack.slice(), slots: c.slots.slice(), jack: c.jack, door: c.door, route: c.route };
    });
    o.movers = lv.movers.map(function (m) { var c = {}; for (var k in m) c[k] = m[k]; return c; });
    o.pallets = lv.pallets.map(function (p) { return { id: p.id, origin: p.origin, shelved: p.shelved, lost: p.lost, stock: !!p.stock }; });
    o.doors = lv.doors.map(function (d) { return { x: d.x, y: d.y, open: d.open, t: d.t }; });
    o.walkers = lv.walkers.map(function (w) { var c = {}; for (var k in w) c[k] = w[k]; return c; });
    o.start = copyPose(lv.start);
    return o;
  }
  function copyPose(p) { return { x: p.x, y: p.y, dir: p.dir, fork: p.fork }; }
  function samePose(a, b) { return a.x === b.x && a.y === b.y && a.dir === b.dir && a.fork === b.fork; }
  // Pallets that came on this truck (shelf stock left out).
  function truckPallets(lv) { return lv.pallets.filter(function (p) { return !p.stock; }).length; }
  function remaining(lv) { var n = 0; lv.pallets.forEach(function (p) { if (!p.shelved && !p.lost) n++; }); return n; }

  // ---- One forklift action ----
  // Actions: fwd, back, left, right (90-degree turns), up, down (forks).
  // Returns { kind, pose } where kind is move | turn | fork | pick | drop | wrong | bump. Reads the warehouse, never changes it.
  // rackPick lets the forks take pallets off shelves; only the level generator uses it (shelved pallets stay put in play).
  // top is a second pallet riding on the carried one (Roger, 2026-10-26: a hidden double load, never explained in the
  // game). With one pallet on, driving into another at fork height stacks it on top; down always takes the top one
  // first, and the top one only fits shelf 2 or 3 (or the floor, so a double load can never get stuck).
  function poseStep(lv, p, a, carry, rackPick, top) {
    var d = DIRS[p.dir], ax = p.x + d[0], ay = p.y + d[1];
    var bump = { kind: 'bump', pose: p };
    if (a === 'fwd') {
      if (top == null) {
        var id = pickable(cellAt(lv, ax, ay), p.fork, rackPick && carry == null);
        if (id != null) return { kind: 'pick', pose: p, id: id, x: ax, y: ay, second: carry != null };
      }
      return isOpen(lv, ax, ay) ? { kind: 'move', pose: { x: ax, y: ay, dir: p.dir, fork: p.fork } } : bump;
    }
    if (a === 'back') {
      var bx = p.x - d[0], by = p.y - d[1];
      return isOpen(lv, bx, by) ? { kind: 'move', pose: { x: bx, y: by, dir: p.dir, fork: p.fork } } : bump;
    }
    if (a === 'left' || a === 'right') {
      var nd = (p.dir + (a === 'left' ? 3 : 1)) % 4, n = DIRS[nd];
      // The forks swing wide: the tile beside the front, on the turning side, must be clear.
      if (lv.swing && !isOpen(lv, ax + n[0], ay + n[1])) return bump;
      return { kind: 'turn', pose: { x: p.x, y: p.y, dir: nd, fork: p.fork } };
    }
    if (a === 'up') return p.fork < TOP_FORK ? { kind: 'fork', pose: { x: p.x, y: p.y, dir: p.dir, fork: p.fork + 1 } } : bump;
    if (a === 'down') {
      var load = top != null ? top : carry;
      if (load != null) {
        var c = cellAt(lv, ax, ay), into = dropSlot(c, p.fork);
        // In play, down in front of a floor pallet lowers the forks instead of setting the load on top of it (Roger,
        // 2026-10-26: you have to get the forks down to reach a floor pallet). Only the generator builds floor stacks.
        if (into === 'floor' && p.fork > 0 && !lv.building) into = null;
        if (into === 'rack' && top != null && p.fork < 2) into = null;   // the top of a double load sits too high for shelf 1
        if (into === 'rack' && c.origin !== lv.pallets[load].origin) return { kind: 'wrong', pose: p, x: ax, y: ay };
        if (into) return { kind: 'drop', pose: p, x: ax, y: ay, into: into, top: top != null };
      }
      return p.fork > 0 ? { kind: 'fork', pose: { x: p.x, y: p.y, dir: p.dir, fork: p.fork - 1 } } : bump;
    }
    throw new Error('unknown action ' + a);
  }

  // The pallet the forks would lift from cell c at this height, or null. On the floor only the top of a stack.
  function pickable(c, fork, rackPick) {
    if (!c) return null;
    if (c.k === 'R') return (rackPick && fork >= 1) ? c.slots[fork] : null;
    if (isFloor(c) && c.stack.length && c.stack.length - 1 === fork) return c.stack[fork];
    return null;
  }
  // Where a carried pallet would land in cell c at this height: 'rack', 'floor', or null.
  function dropSlot(c, fork) {
    if (!c) return null;
    if (c.k === 'R') return (fork >= 1 && c.slots[fork] == null) ? 'rack' : null;
    if (isFloor(c) && !c.jack && c.door < 0 && c.stack.length === fork && fork < FLOOR_STACK) return 'floor';
    return null;
  }
  function applyPick(lv, r) {
    var c = cellAt(lv, r.x, r.y);
    if (c.k === 'R') { c.slots[r.pose.fork] = null; lv.pallets[r.id].shelved = false; }
    else c.stack.pop();
    return r.id;
  }
  function applyDrop(lv, r, id) {
    var c = cellAt(lv, r.x, r.y);
    if (r.into === 'rack') { c.slots[r.pose.fork] = id; lv.pallets[id].shelved = true; }
    else c.stack.push(id);
  }
  function duration(kind, high) {
    var slow = high ? HIGH_SLOW : 1;
    return kind === 'move' ? MOVE_T * slow : kind === 'turn' ? TURN_T * slow : kind === 'fork' ? FORK_T :
      kind === 'pick' ? PICK_T : kind === 'drop' ? DROP_T : kind === 'wrong' || kind === 'hit' ? WRONG_T : BUMP_T;
  }

  // ---- Path search over forklift poses (position, facing, fork height) with the pallets held still ----

  var MOVES = ['fwd', 'back', 'left', 'right', 'up', 'down'];
  var INV = { fwd: 'back', back: 'fwd', left: 'right', right: 'left', up: 'down', down: 'up' };

  // Breadth-first search. goal(pose) returns a result when a finishing action works from that pose.
  // Returns the nearest { path, pose, goal } (or every hit, nearest first, when all is true).
  function search(lv, start, carry, rackPick, goal, edgeOk, all) {
    var seen = new Uint8Array(lv.w * lv.h * 16), queue = [{ pose: start, prev: null, a: null }], hits = [];
    seen[poseKey(lv, start)] = 1;
    for (var qi = 0; qi < queue.length; qi++) {
      var node = queue[qi], g = goal(node.pose);
      if (g) {
        var hit = { path: pathOf(node), pose: node.pose, goal: g };
        if (!all) return hit;
        hits.push(hit);
      }
      for (var i = 0; i < MOVES.length; i++) {
        var a = MOVES[i], r = poseStep(lv, node.pose, a, carry, rackPick);
        if (r.kind !== 'move' && r.kind !== 'turn' && r.kind !== 'fork') continue;
        if (edgeOk && !edgeOk(node.pose, a, r)) continue;
        var key = poseKey(lv, r.pose);
        if (seen[key]) continue;
        seen[key] = 1;
        queue.push({ pose: r.pose, prev: node, a: a });
      }
    }
    return all ? hits : null;
  }
  function poseKey(lv, p) { return ((p.y * lv.w + p.x) * 4 + p.dir) * 4 + p.fork; }
  function pathOf(node) { var out = []; for (; node.prev; node = node.prev) out.push(node.a); return out.reverse(); }

  // ---- Level generator ----
  // Builds a solved warehouse (every pallet on a shelf in its own bay), then works backwards: the forklift takes
  // each pallet off its shelf and leaves it on the dock, using only moves that can be undone. Played forwards,
  // those undo moves are a solution, so every level is solvable. The undo list is kept as lv.plan.

  function makeLevel(truckNo, rand, opts) {
    opts = opts || {};
    var d = difficulty(truckNo);
    for (var attempt = 0; attempt < 60; attempt++) {
      var lv = tryLevel(truckNo, d, rand, opts);
      if (lv) return lv;
    }
    throw new Error('could not build truck ' + truckNo);
  }

  function tryLevel(truckNo, d, rand, opts) {
    var lv = parseLayout(LAYOUTS[d.layout], opts.swing);
    lv.building = true;                        // the scramble may stack pallets on the floor; play may not
    lv.truck = truckNo;
    lv.origins = d.origins;
    assignBays(lv, d.origins, rand);
    placeDoors(lv, d.doors, rand);
    if (!placeJacks(lv, d.jacks, d.movers, rand)) return null;

    // Rack tiles the forklift can face at all in the empty warehouse.
    var faceable = {};
    search(lv, lv.start, null, false, function (p) {
      var dd = DIRS[p.dir], c = cellAt(lv, p.x + dd[0], p.y + dd[1]);
      if (c && c.k === 'R') faceable[(p.y + dd[1]) * lv.w + p.x + dd[0]] = true;
      return null;
    }, null, true);

    // Solved warehouse. Origins are spread evenly over the pallets.
    var origins = [];
    for (var i = 0; i < d.pallets; i++) origins.push(i % d.origins);
    shuffle(origins, rand);
    for (i = 0; i < origins.length; i++) {
      var free = [];
      for (var idx in faceable) {
        var c = lv.cells[idx];
        if (c.origin !== origins[i]) continue;
        for (var s = 1; s <= TOP_FORK; s++) if (c.slots[s] == null) free.push([+idx, s]);
      }
      if (!free.length) return null;
      var pick = free[Math.floor(rand() * free.length)];
      addPallet(lv, origins[i], pick[0] % lv.w, Math.floor(pick[0] / lv.w), pick[1]);
    }

    var order = lv.pallets.map(function (p) { return p.id; });
    shuffle(order, rand);

    // Stock already on the shelves: locked, never moves, and leaves fewer (often higher) free slots.
    if (d.stock > 0) {
      for (idx in faceable) {
        c = lv.cells[idx];
        for (s = 1; s <= TOP_FORK; s++) {
          if (c.slots[s] == null && rand() < d.stock) lv.pallets[addPallet(lv, c.origin, idx % lv.w, Math.floor(idx / lv.w), s)].stock = true;
        }
      }
    }

    // Which truck pallets end up left on the warehouse floor instead of the dock.
    var onFloor = {};
    shuffle(order.slice(), rand).slice(0, d.clutter).forEach(function (id) { onFloor[id] = true; });

    // Scramble backwards.
    var pose = copyPose(lv.start), undo = [];
    for (i = 0; i < order.length; i++) {
      var id = order[i];
      var got = search(lv, pose, null, true, function (p) {
        var r = poseStep(lv, p, 'fwd', null, true);
        return r.kind === 'pick' && r.id === id ? r : null;
      }, undoable(lv, null), false);
      if (!got) return null;
      pushUndo(undo, got.path);
      undo.push('down');                       // undoing a pick is setting it back down
      applyPick(lv, got.goal);
      pose = got.pose;

      var floor = !!onFloor[id];
      var spots = search(lv, pose, id, false, function (p) {
        var r = poseStep(lv, p, 'down', id, false);
        if (r.kind !== 'drop' || r.into !== 'floor') return null;
        var cc = cellAt(lv, r.x, r.y);
        return floor ? (isAisle(cc) && cc.stack.length === 0 ? r : null) : (cc.k === 'D' ? r : null);
      }, undoable(lv, id), true);
      if (!spots.length) return null;
      var put = pickSpot(lv, spots, floor, d, rand);
      pushUndo(undo, put.path);
      undo.push('fwd');                        // undoing a set-down is picking it up again
      applyDrop(lv, put.goal, id);
      pose = put.pose;
    }
    while (pose.fork > 0) { undo.push('up'); pose = { x: pose.x, y: pose.y, dir: pose.dir, fork: pose.fork - 1 }; }

    lv.building = false;
    lv.start = pose;
    lv.plan = undo.reverse();
    var sim = simulate(lv, lv.start, lv.plan);
    if (!sim.ok) return null;
    placeWalkers(lv, d.walkers, rand);
    lv.planTime = sim.time;
    lv.limit = Math.ceil(sim.time * d.slack) + 2 + HAZARD_T * (lv.walkers.length + lv.doors.length + lv.movers.length);
    return lv;
  }

  // A gap in a rack row: racks left and right, floor in front and behind (a way through the shelving).
  function isGap(lv, x, y) {
    var c = cellAt(lv, x, y), l = cellAt(lv, x - 1, y), r = cellAt(lv, x + 1, y);
    return !!c && c.k === '.' && !!l && l.k === 'R' && !!r && r.k === 'R' &&
      isFloor(cellAt(lv, x, y - 1)) && isFloor(cellAt(lv, x, y + 1));
  }
  // Roll-up doors go in a gap, so the other gap is the way around. Each starts part way through its open time so it
  // does not shut the moment play starts.
  function placeDoors(lv, n, rand) {
    var gaps = [];
    for (var y = 1; y < lv.h - 1; y++) for (var x = 1; x < lv.w - 1; x++) if (isGap(lv, x, y)) gaps.push([x, y]);
    shuffle(gaps, rand);
    for (var i = 0; i < Math.min(n, gaps.length); i++) addDoor(lv, gaps[i][0], gaps[i][1], DOOR_OPEN * (0.6 + 0.4 * rand()));
  }

  // Pallet jacks park on aisle tiles, often in front of a shelf (which blocks that face), never next to the forklift's
  // start and never where they would cut the floor in two. The first `movers` of them roll along a short track, and
  // the floor must stay connected wherever on it they are. Returns false if they could not all be placed.
  function placeJacks(lv, n, movers, rand) {
    var s = lv.start;
    for (var k = 0; k < n; k++) {
      var spots = [], byRack = [];
      for (var y = 0; y < lv.h; y++) for (var x = 0; x < lv.w; x++) {
        // Never in a gap through the shelving: with a roll-up door shut in the other gap, that would seal half the floor.
        if (!isAisle(cellAt(lv, x, y)) || isGap(lv, x, y) || Math.abs(x - s.x) + Math.abs(y - s.y) < 2) continue;
        spots.push([x, y]);
        if (DIRS.some(function (dd) { var nb = cellAt(lv, x + dd[0], y + dd[1]); return nb && nb.k === 'R'; })) byRack.push([x, y]);
      }
      var pool = shuffle((byRack.length && rand() < 0.6 ? byRack : spots).slice(), rand), placed = false;
      for (var i = 0; i < pool.length && !placed; i++) {
        var c = cellAt(lv, pool[i][0], pool[i][1]);
        c.jack = true;
        if (!floorConnected(lv)) { c.jack = false; continue; }
        if (k >= movers) { placed = true; continue; }
        var route = jackRoute(lv, pool[i][0], pool[i][1], rand);
        c.jack = false;
        if (route) { addMover(lv, route, JACK_PARK * (0.4 + 0.6 * rand())); placed = true; }
      }
      if (!placed) return false;
    }
    return true;
  }
  // A straight track of 1 or 2 more aisle tiles from (x, y), where the jack never cuts the floor in two.
  function jackRoute(lv, x, y, rand) {
    var s = lv.start, len = rand() < 0.5 ? 1 : 2, dirs = shuffle(DIRS.slice(), rand), home = cellAt(lv, x, y);
    for (var j = 0; j < dirs.length; j++) {
      var route = [[x, y]], ok = true;
      for (var step = 1; step <= len && ok; step++) {
        var tx = x + dirs[j][0] * step, ty = y + dirs[j][1] * step, c = cellAt(lv, tx, ty);
        if (!isAisle(c) || c.stack.length || isGap(lv, tx, ty) || Math.abs(tx - s.x) + Math.abs(ty - s.y) < 2) ok = false;
        else route.push([tx, ty]);
      }
      if (!ok) continue;
      home.jack = false;
      var good = route.every(function (r) {
        var cr = cellAt(lv, r[0], r[1]);
        cr.jack = true;
        var conn = floorConnected(lv);
        cr.jack = false;
        return conn;
      });
      home.jack = true;
      if (good) return route;
    }
    return null;
  }
  // Can every bare floor tile be reached from the start (ignoring which way the forklift faces), with the doors open
  // and again with them all shut? (A jack in front of the open gap must not seal half the floor while a door is down.)
  function floorConnected(lv) {
    if (!reachAll(lv)) return false;
    if (!lv.doors.length) return true;
    lv.doors.forEach(function (d) { d.open = false; });
    var ok = reachAll(lv);
    lv.doors.forEach(function (d) { d.open = true; });
    return ok;
  }
  function reachAll(lv) {
    var seen = {}, queue = [[lv.start.x, lv.start.y]], total = 0, reached = 0;
    lv.cells.forEach(function (c, i) { if (isOpen(lv, i % lv.w, Math.floor(i / lv.w))) total++; });
    seen[lv.start.y * lv.w + lv.start.x] = true;
    while (queue.length) {
      var q = queue.shift();
      reached++;
      DIRS.forEach(function (dd) {
        var nx = q[0] + dd[0], ny = q[1] + dd[1], key = ny * lv.w + nx;
        if (!seen[key] && isOpen(lv, nx, ny)) { seen[key] = true; queue.push([nx, ny]); }
      });
    }
    return reached === total;
  }

  // Coworkers walk along aisle rows (one per row), starting a few tiles from the forklift.
  function placeWalkers(lv, n, rand) {
    var rows = [];
    for (var y = 0; y < lv.h; y++) {
      var spots = [];
      for (var x = 0; x < lv.w; x++) {
        var c = cellAt(lv, x, y);
        if (isAisle(c) && !c.stack.length && Math.abs(x - lv.start.x) + Math.abs(y - lv.start.y) >= 3) spots.push(x);
      }
      if (spots.length >= 3) rows.push({ y: y, spots: spots });
    }
    shuffle(rows, rand);
    for (var i = 0; i < Math.min(n, rows.length); i++) {
      var r = rows[i], sx = r.spots[Math.floor(rand() * r.spots.length)];
      addWalker(lv, sx, r.y, rand() < 0.5 ? 1 : -1, WALK_T * (1 + rand()));
    }
  }

  // Where the scramble leaves a pallet. Floor clutter prefers the tile in front of a shelf (it blocks that face);
  // dock pallets prefer going on top of another (the bottom one has to wait). Otherwise any spot, not just the nearest.
  function pickSpot(lv, spots, floor, d, rand) {
    var better = spots.filter(function (h) {
      var g = h.goal;
      if (!floor) return cellAt(lv, g.x, g.y).stack.length === 1;
      return DIRS.some(function (dd) { var n = cellAt(lv, g.x + dd[0], g.y + dd[1]); return n && n.k === 'R'; });
    });
    var pool = better.length && rand() < (floor ? 0.7 : d.stackBias) ? better : spots;
    return pool[Math.floor(rand() * pool.length)];
  }

  function pushUndo(undo, path) { for (var i = 0; i < path.length; i++) undo.push(INV[path[i]]); }
  // A move is allowed in the scramble only if its opposite, in real play, puts the forklift straight back.
  function undoable(lv, carry) {
    return function (p, a, r) {
      var back = poseStep(lv, r.pose, INV[a], carry, false);
      return back.kind === r.kind && samePose(back.pose, p);
    };
  }

  function assignBays(lv, k, rand) {
    var bays = [];
    for (var y = 0; y < lv.h; y++) {
      var run = [];
      for (var x = 0; x <= lv.w; x++) {
        var c = x < lv.w ? cellAt(lv, x, y) : null;
        if (c && c.k === 'R') run.push(y * lv.w + x);
        else if (run.length) { splitRun(run, bays); run = []; }
      }
    }
    shuffle(bays, rand);
    bays.forEach(function (bay, j) { bay.forEach(function (idx) { lv.cells[idx].origin = j % k; }); });
  }
  function splitRun(run, bays) {
    for (var i = 0; i < run.length; i += 2) {
      if (run.length - i === 3) { bays.push(run.slice(i)); return; }
      bays.push(run.slice(i, i + 2));
    }
  }
  function shuffle(arr, rand) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }

  // Plays a list of actions on a copy of the warehouse with the real rules (no clock, doors held open, no coworkers).
  // ok means every pallet ended up shelved with no bumps or wrong bays on the way.
  function simulate(lv0, pose, actions) {
    var lv = stillLevel(lv0), carry = null, time = 0;
    for (var i = 0; i < actions.length; i++) {
      var r = poseStep(lv, pose, actions[i], carry, false);
      time += duration(r.kind, carry != null && pose.fork >= HIGH_FORK);
      if (r.kind === 'bump' || r.kind === 'wrong') return { ok: false, time: time, at: i };
      if (r.kind === 'pick') carry = applyPick(lv, r);
      else if (r.kind === 'drop') { applyDrop(lv, r, carry); carry = null; }
      pose = r.pose;
    }
    return { ok: remaining(lv) === 0 && carry == null, time: time };
  }
  // A copy with the moving parts stopped: every door open, no coworkers. Plans are made on this.
  function stillLevel(lv0) {
    var lv = cloneLevel(lv0);
    lv.doors.forEach(function (d) { d.open = true; });
    lv.walkers = [];
    return lv;
  }

  // ---- Bot ----
  // Greedy and independent of the generator's plan: lift the nearest pallet that can reach a free shelf in its
  // own bay, deliver it, repeat. Returns the action list, or null if it gets stuck.
  function botPlan(lv0, pose0) {
    var lv = stillLevel(lv0), pose = copyPose(pose0), plan = [];
    while (remaining(lv) > 0) {
      var picks = search(lv, pose, null, false, function (p) {
        var r = poseStep(lv, p, 'fwd', null, false);
        return r.kind === 'pick' ? r : null;
      }, null, true);
      var tried = {}, done = false;
      for (var i = 0; i < picks.length && !done; i++) {
        var pk = picks[i], id = pk.goal.id;
        if (tried[id]) continue;
        tried[id] = true;
        var after = cloneLevel(lv);
        applyPick(after, pk.goal);
        var del = search(after, pk.pose, id, false, shelfGoal(after, id), null, false);
        if (!del) continue;
        applyDrop(after, del.goal, id);
        plan = plan.concat(pk.path, ['fwd'], del.path, ['down']);
        lv = after;
        pose = del.pose;
        done = true;
      }
      if (!done) return null;
    }
    return plan;
  }
  function shelfGoal(lv, id) {
    return function (p) { var r = poseStep(lv, p, 'down', id, false); return r.kind === 'drop' && r.into === 'rack' ? r : null; };
  }

  // ---- A run: trucks one after another until three strikes ----
  // States: prep (5 s look, no controls, no clock) -> play -> cleared | failed (timer ran out) -> startTruck -> ...; over.

  function newRun(rand, opts) {
    opts = opts || {};
    var run = { rand: rand || Math.random, opts: opts, truckNo: opts.truckNo || 1, score: 0, strikes: 0, streak: 0,
      trucksCleared: 0, shelved: 0, state: 'idle', prep: 0, truck: null, events: [] };
    startTruck(run);
    return run;
  }

  // Starts the next truck: a bigger one after a clear, a fresh one of the same size after a timeout.
  function startTruck(run) {
    if (run.state === 'over') return;
    var make = run.opts.makeLevel || makeLevel;
    var lv = make(run.truckNo, run.rand, run.opts);
    run.truck = { lv: lv, pose: copyPose(lv.start), from: null, carry: null, top: null, time: 0, limit: lv.limit, busy: 0,
      honkCool: 0, strikes: 0, shelved: 0 };
    run.state = 'prep';
    run.prep = PREP_TIME;
    emit(run, 'truck', { n: run.truckNo });
  }
  function skipPrep(run) { if (run.state === 'prep') { run.prep = 0; run.state = 'play'; emit(run, 'go', {}); } }

  function mult(run) { return 1 + Math.min(run.streak, MULT_CAP - 1); }

  // One button press. Ignored (returns null) during prep, between trucks, or while the last action is still running.
  // 'honk' works even while the forklift is busy (once a second).
  function act(run, a) {
    var tr = run.truck;
    if (a === 'honk') return honk(run);
    if (run.state !== 'play' || tr.busy > 0) return null;
    var lv = tr.lv, p = tr.pose, high = (tr.carry != null && p.fork >= HIGH_FORK) || tr.top != null;   // a double load is slow too
    var r = poseStep(lv, p, a, tr.carry, false, tr.top);
    // Driving into a coworker (or forking a floor pallet they are standing by) is a strike; the forklift stays put.
    if ((r.kind === 'move' && walkerOn(lv, r.pose.x, r.pose.y)) ||
        ((r.kind === 'pick' || (r.kind === 'drop' && r.into === 'floor')) && walkerOn(lv, r.x, r.y))) r = { kind: 'hit', pose: p };
    tr.busy = duration(r.kind, high);
    tr.from = p;
    emit(run, r.kind, { action: a });
    if (r.kind === 'move' || r.kind === 'fork' || r.kind === 'turn') tr.pose = r.pose;
    else if (r.kind === 'hit') coworkerStrike(run);
    else if (r.kind === 'pick') { if (r.second) tr.top = applyPick(lv, r); else tr.carry = applyPick(lv, r); }
    else if (r.kind === 'drop') {
      if (r.top) { applyDrop(lv, r, tr.top); tr.top = null; }
      else { applyDrop(lv, r, tr.carry); tr.carry = null; }
      if (r.into === 'rack') {
        var pts = SHELF_PTS * mult(run);
        run.score += pts;
        tr.shelved++;
        run.shelved++;
        emit(run, 'shelve', { points: pts });
      }
    } else if (r.kind === 'wrong') strike(run, 'wrong');   // the pallet stays on the forks
    checkClear(run);
    return r;
  }

  // Advances the clock. Call every frame with the frame time in seconds.
  function tick(run, dt) {
    if (run.state === 'prep') {
      run.prep -= dt;
      if (run.prep <= 0) { run.prep = 0; run.state = 'play'; emit(run, 'go', {}); }
      return;
    }
    if (run.state !== 'play') return;
    var tr = run.truck;
    tr.time += dt;
    tr.busy = Math.max(0, tr.busy - dt);
    if (tr.busy < 1e-9) tr.busy = 0;
    tr.honkCool = Math.max(0, tr.honkCool - dt);
    tickDoors(run, dt);
    tickMovers(run, dt);
    tickWalkers(run, dt);
    if (run.state !== 'play') return;
    if (!tr.lv.untimed && tr.time >= tr.limit) {   // tutorial lessons (lv.untimed) have no clock
      emit(run, 'timeout', {});
      strike(run, 'timeout');
      if (run.state !== 'over') run.state = 'failed';
    }
  }

  function checkClear(run) {
    var tr = run.truck;
    if (run.state !== 'play' || tr.carry != null || !tr.lv.pallets.length || remaining(tr.lv) > 0) return;
    var bonus = tr.lv.untimed ? 0 : Math.floor(Math.max(0, tr.limit - tr.time)) * TIME_PTS * mult(run);
    run.score += bonus;
    if (tr.strikes === 0) run.streak++;
    run.trucksCleared++;
    run.truckNo++;
    run.state = 'cleared';
    emit(run, 'clear', { bonus: bonus });
  }

  // ---- Hazards in play ----

  // Tiles the forklift is in: where it is, plus where it came from while a move is still running.
  function forkliftOn(tr, x, y) {
    if (tr.pose.x === x && tr.pose.y === y) return true;
    return tr.busy > 0 && tr.from && tr.from.x === x && tr.from.y === y;
  }

  // Honk: coworkers in range who are walking toward the forklift turn around, and all of them keep clear for ALERT_T.
  function honk(run) {
    var tr = run.truck;
    if (run.state !== 'play' || tr.honkCool > 0) return null;
    tr.honkCool = HONK_COOL;
    var p = tr.pose, heard = 0;
    tr.lv.walkers.forEach(function (w) {
      if (Math.abs(w.x - p.x) + Math.abs(w.y - p.y) > HONK_R) return;
      heard++;
      w.alert = ALERT_T;
      if (w.x !== p.x && (p.x - w.x > 0) === (w.dx > 0)) w.dx = -w.dx;
    });
    emit(run, 'honk', { heard: heard });
    return { kind: 'honk', heard: heard };
  }

  // Doors: open DOOR_OPEN seconds, shut DOOR_SHUT. A door never comes down on the forklift or a coworker; it waits.
  function tickDoors(run, dt) {
    var tr = run.truck, lv = tr.lv;
    lv.doors.forEach(function (d, i) {
      d.t -= dt;
      if (d.t > 0) return;
      if (d.open) {
        if (forkliftOn(tr, d.x, d.y) || walkerOn(lv, d.x, d.y)) { d.t = 0; return; }
        d.open = false; d.t += DOOR_SHUT;
      } else { d.open = true; d.t += DOOR_OPEN; }
      emit(run, 'door', { i: i, open: d.open });
    });
  }

  // Moving jacks roll one tile per JACK_ROLL along their track and pause JACK_PARK at each end. While rolling they fill
  // both tiles. They never bump anything: if the next tile is taken they wait, and after JACK_GIVEUP they turn back.
  function tickMovers(run, dt) {
    var tr = run.truck, lv = tr.lv;
    lv.movers.forEach(function (m) {
      if (m.slide > 0) {
        m.slide -= dt;
        if (m.slide > 0) return;
        m.slide = 0;
        cellAt(lv, m.px, m.py).jack = false;
      }
      m.t -= dt;
      if (m.t > 0) return;
      var ni = m.i + m.step;
      if (ni < 0 || ni >= m.route.length) { m.step = -m.step; ni = m.i + m.step; }
      var nx = m.route[ni][0], ny = m.route[ni][1], c = cellAt(lv, nx, ny);
      if (c.jack || c.stack.length || forkliftOn(tr, nx, ny) || walkerOn(lv, nx, ny)) {
        m.t = 0.2;
        m.blocked += 0.2;
        if (m.blocked >= JACK_GIVEUP) { m.blocked = 0; m.step = -m.step; }
        return;
      }
      m.blocked = 0;
      m.px = m.x; m.py = m.y; m.x = nx; m.y = ny; m.i = ni;
      c.jack = true;
      m.slide = JACK_ROLL;
      m.t = (ni === 0 || ni === m.route.length - 1) ? JACK_PARK : 0;   // rolls straight through the middle of a 3-tile track
      emit(run, 'jack', {});
    });
  }

  // Coworkers walk their row, turning back at anything in the way. Unless they heard a honk recently, they don't
  // look up: walking into the forklift is a strike.
  function tickWalkers(run, dt) {
    var tr = run.truck, lv = tr.lv;
    for (var i = 0; i < lv.walkers.length && run.state === 'play'; i++) {
      var w = lv.walkers[i];
      w.slide = Math.max(0, w.slide - dt);
      w.alert = Math.max(0, w.alert - dt);
      w.t -= dt;
      if (w.t > 0) continue;
      w.t += WALK_T;
      if (stepWalker(run, w, w.dx, 0)) continue;
      if (run.state !== 'play') return;
      w.dx = -w.dx;
      // Boxed in both ways (often between a shelf and the forklift): step into the row above or below instead.
      if (!stepWalker(run, w, w.dx, 0) && run.state === 'play') {
        var away = tr.pose.y > w.y ? -1 : 1;
        if (!stepWalker(run, w, 0, away, true)) stepWalker(run, w, 0, -away, true);
      }
    }
  }
  // One step by (dx, dy). People squeeze past floor pallets and jacks; shelves, walls, the dock and doorways stop them.
  // Side steps (careful) never go toward the forklift.
  function stepWalker(run, w, dx, dy, careful) {
    var tr = run.truck, lv = tr.lv, nx = w.x + dx, ny = w.y + dy, c = cellAt(lv, nx, ny);
    if (!c || c.k !== '.' || c.door >= 0) return false;
    if (lv.walkers.some(function (o) { return o !== w && ((o.x === nx && o.y === ny) || (o.slide > 0 && o.px === nx && o.py === ny)); })) return false;
    if (forkliftOn(tr, nx, ny)) {
      if (careful || w.alert > 0) return false;
      emit(run, 'hit', { walked: true });
      coworkerStrike(run);
      return false;
    }
    w.px = w.x; w.py = w.y; w.x = nx; w.y = ny; w.slide = WALK_SLIDE;
    return true;
  }
  // After a bump everyone keeps clear for a moment, so one mistake is one strike.
  function coworkerStrike(run) {
    run.truck.lv.walkers.forEach(function (w) { w.alert = Math.max(w.alert, ALERT_T); });
    strike(run, 'coworker');
  }

  // why: wrong (wrong bay), timeout, coworker (bumped a coworker: "Safety Meeting")
  function strike(run, why) {
    run.strikes++;
    run.truck.strikes++;
    run.streak = 0;
    emit(run, 'strike', { why: why, count: run.strikes });
    // forgiving (the tutorial): strikes still show, but never end the run
    if (!run.opts.forgiving && run.strikes >= STRIKES) { run.state = 'over'; emit(run, 'over', { score: run.score }); }
  }

  function emit(run, type, data) { data.type = type; run.events.push(data); }
  function takeEvents(run) { var e = run.events; run.events = []; return e; }

  return {
    COLS: COLS, ROWS: ROWS, DIRS: DIRS, TOP_FORK: TOP_FORK, FLOOR_STACK: FLOOR_STACK,
    MOVE_T: MOVE_T, TURN_T: TURN_T, FORK_T: FORK_T, PICK_T: PICK_T, DROP_T: DROP_T, BUMP_T: BUMP_T, WRONG_T: WRONG_T,
    HIGH_FORK: HIGH_FORK, HIGH_SLOW: HIGH_SLOW, PREP_TIME: PREP_TIME, STRIKES: STRIKES,
    WALK_T: WALK_T, WALK_SLIDE: WALK_SLIDE, HONK_R: HONK_R, HONK_COOL: HONK_COOL, ALERT_T: ALERT_T,
    DOOR_OPEN: DOOR_OPEN, DOOR_SHUT: DOOR_SHUT, DOOR_WARN: DOOR_WARN, HAZARD_T: HAZARD_T,
    SHELF_PTS: SHELF_PTS, TIME_PTS: TIME_PTS, MULT_CAP: MULT_CAP, LAYOUTS: LAYOUTS,
    difficulty: difficulty, parseLayout: parseLayout, cellAt: cellAt, isOpen: isOpen, addPallet: addPallet,
    addJack: addJack, addDoor: addDoor, addWalker: addWalker, addMover: addMover, walkerOn: walkerOn,
    JACK_PARK: JACK_PARK, JACK_ROLL: JACK_ROLL, JACK_GIVEUP: JACK_GIVEUP,
    cloneLevel: cloneLevel, remaining: remaining, truckPallets: truckPallets, poseStep: poseStep, duration: duration,
    makeLevel: makeLevel, simulate: simulate, botPlan: botPlan,
    newRun: newRun, startTruck: startTruck, skipPrep: skipPrep, mult: mult, act: act, tick: tick, takeEvents: takeEvents
  };
});
