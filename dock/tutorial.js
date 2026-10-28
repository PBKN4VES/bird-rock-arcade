// Forklift Frenzy tutorial (Roger, 2026-10-28): short hand-built lessons with no timer, one idea each, in the order the
// real shift brings them in. Strikes show but never end the run. game.js runs them; logic.test.js checks each can be finished.
// Lesson text uses {DRIVE} {UP} {DOWN} {HONK}; game.js fills them in for swipe, buttons or keyboard.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'));
  else root.DockTutorial = factory(root.DockLogic);
})(typeof self !== 'undefined' ? self : this, function (L) {

  // The plain warehouse most lessons use: one shelf row at the top, the dock at the bottom.
  var OPEN = ['RRRRRRRR', '........', '........', '........', '........', '........', '........', '...F....', '..DDDD..', '..DDDD..'];
  // The same, with a second shelf row and one gap through it.
  function walled(gaps) {
    var row = 'RRRRRRRR'.split('');
    gaps.forEach(function (x) { row[x] = '.'; });
    var rows = OPEN.slice(); rows[3] = row.join(''); return rows;
  }

  // Builds a lesson warehouse: every shelf in bay 0 unless set otherwise, no clock.
  function base(rows, origins) {
    var lv = L.parseLayout(rows, false);
    lv.cells.forEach(function (c) { if (c.k === 'R') c.origin = 0; });
    lv.origins = origins || 1;
    lv.untimed = true;
    lv.limit = 0;
    return lv;
  }
  // Shelf stock already in place (locked, not part of the lesson). levels: which shelves (1-3) are full.
  function stock(lv, x, y, levels) {
    var c = L.cellAt(lv, x, y);
    levels.forEach(function (s) { lv.pallets[L.addPallet(lv, c.origin, x, y, s)].stock = true; });
  }
  function fillRow(lv, y, levels) { for (var x = 0; x < lv.w; x++) if (L.cellAt(lv, x, y).k === 'R') stock(lv, x, y, levels); }

  var LESSONS = [
    {
      name: 'PICK UP AND SHELVE',
      intro: '{DRIVE} Pick up the pallet and put it on a shelf.',
      build: function () {
        var lv = base(OPEN);
        stock(lv, 0, 0, [1, 2]); stock(lv, 1, 0, [3]); stock(lv, 6, 0, [1]); stock(lv, 7, 0, [1, 2, 3]);
        L.addPallet(lv, 0, 3, 5);
        return lv;
      }
    },
    {
      name: 'STACKS AND HIGH SHELVES',
      intro: 'Two pallets are stacked on the dock: take the top one first. Shelf 1 is full, so use shelf 2 or 3.',
      build: function () {
        var lv = base(OPEN);
        lv.start = { x: 3, y: 6, dir: 0, fork: 0 };
        fillRow(lv, 0, [1]);
        stock(lv, 2, 0, [3]); stock(lv, 5, 0, [2]);
        L.addPallet(lv, 0, 3, 8); L.addPallet(lv, 0, 3, 8);
        return lv;
      }
    },
    {
      name: 'MATCH THE BAY',
      intro: 'Two coffees now. Each pallet goes in the bay with its color and code (listed under the warehouse).',
      build: function () {
        var lv = base(['RRRRRRRR', '........', '........', '.RRRRRR.', '........', '........', '........', '...F....', '..DDDD..', '..DDDD..'], 2);
        for (var x = 0; x < 8; x++) {
          L.cellAt(lv, x, 0).origin = x < 4 ? 0 : 1;
          if (x >= 1 && x <= 6) L.cellAt(lv, x, 3).origin = x < 4 ? 1 : 0;
        }
        stock(lv, 0, 0, [1, 2]); stock(lv, 5, 0, [1]); stock(lv, 2, 3, [1]); stock(lv, 6, 3, [2, 3]);
        L.addPallet(lv, 0, 2, 8); L.addPallet(lv, 1, 5, 8);
        return lv;
      }
    },
    {
      name: 'PALLET JACK',
      intro: 'A pallet jack is parked in the gap. Drive around it to reach the top shelves.',
      build: function () {
        var lv = base(walled([3, 6]));
        fillRow(lv, 3, [1, 2, 3]);
        stock(lv, 1, 0, [1]); stock(lv, 4, 0, [1, 2]);
        L.addJack(lv, 3, 3);
        L.addPallet(lv, 0, 3, 5);
        return lv;
      }
    },
    {
      name: 'COWORKERS',
      intro: 'A coworker is walking the aisle and not looking. Press {HONK} when you get close so they keep clear.',
      build: function () {
        var lv = base(OPEN);
        stock(lv, 0, 0, [1]); stock(lv, 4, 0, [1, 2]); stock(lv, 7, 0, [2]);
        L.addWalker(lv, 0, 3, 1);
        L.addPallet(lv, 0, 3, 5);
        return lv;
      }
    },
    {
      name: 'ROLL-UP DOOR',
      intro: 'The only way through is a roll-up door. It flashes red before it shuts. Wait for it to open.',
      build: function () {
        var lv = base(walled([3]));
        fillRow(lv, 3, [1, 2, 3]);
        stock(lv, 2, 0, [1]); stock(lv, 5, 0, [1, 3]);
        L.addDoor(lv, 3, 3, 2.5);   // shuts soon after the lesson starts, so you see it happen
        L.addPallet(lv, 0, 3, 5);
        return lv;
      }
    },
    {
      name: 'MOVING JACK',
      intro: 'This jack rolls along the dashed track. Its light blinks before it moves. Let it pass or go around.',
      build: function () {
        var lv = base(OPEN);
        stock(lv, 1, 0, [1, 2]); stock(lv, 6, 0, [1]);
        L.addMover(lv, [[2, 3], [3, 3], [4, 3]], 1);
        L.addPallet(lv, 0, 3, 5);
        return lv;
      }
    },
    {
      name: 'PUT IT TOGETHER',
      intro: 'A real truck, still with no clock. In a shift every truck is timed, and three strikes end it.',
      build: function (rand) {
        var lv = L.makeLevel(3, rand, { swing: false });   // truck 3 of a real shift: a parked jack and a coworker
        lv.untimed = true;
        return lv;
      }
    }
  ];

  // For newRun's makeLevel option: truck n is lesson n.
  function makeLevel(n, rand) {
    var lesson = LESSONS[Math.min(n, LESSONS.length) - 1], lv = lesson.build(rand || Math.random);
    lv.truck = n;
    return lv;
  }

  return { LESSONS: LESSONS, makeLevel: makeLevel };
});
