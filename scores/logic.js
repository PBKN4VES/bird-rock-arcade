// Bird Rock Arcade Top 100 page: the rules, with no page code (tested in logic.test.js).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScoresLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var SIZE = 100;

  // The game to show first: ?game=fill when it names a real game, else the first one.
  function pickGame(search, games) {
    var m = /[?&]game=([^&]*)/.exec(String(search || ''));
    var want = m ? decodeURIComponent(m[1]) : '';
    for (var i = 0; i < games.length; i++) if (games[i].id === want) return want;
    return games.length ? games[0].id : '';
  }

  // Ranked [{ tag, score }] -> numbered rows, at most 100.
  function rowsFor(top) {
    return (top || []).slice(0, SIZE).map(function (e, i) { return { rank: i + 1, tag: e.tag, score: e.score }; });
  }

  // The line under the list: a count, or an invitation when the board is empty.
  function noteFor(count) {
    if (!count) return 'NO SCORES YET. BE THE FIRST!';
    return count >= SIZE ? 'TOP ' + SIZE + ' SHOWN' : count + (count === 1 ? ' SCORE SO FAR' : ' SCORES SO FAR');
  }

  return { SIZE: SIZE, pickGame: pickGame, rowsFor: rowsFor, noteFor: noteFor };
});
