// Bird Rock Arcade: page rules with no drawing code, so they can be tested on their own.
// Works in the browser (window.ArcadeLogic) and in Node (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ArcadeLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var SLOT_COUNT = 3;          // rows in each cabinet's Top 3 panel
  var TAG_BLANK = '---';

  // Best score saved by a game on this device. storage is injectable (and may throw, as Safari does
  // in some frames), so any problem just means "no score yet".
  function readBest(storage, key) {
    try {
      var n = parseInt(storage.getItem(key), 10);
      return n > 0 ? n : 0;
    } catch (e) { return 0; }
  }

  // 1600 -> "1,600". Done by hand so it never depends on the browser's locale.
  function formatScore(n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function bestLabel(n) { return n > 0 ? formatScore(n) : '--'; }

  // The Top 3 panel's rows. entries is what the leaderboard will hand over later:
  // [{ tag, score }, ...] already ranked. Today it is empty, so every row shows as a blank slot.
  function slotsFor(entries) {
    var list = Array.isArray(entries) ? entries : [];
    var rows = [];
    for (var i = 0; i < SLOT_COUNT; i++) {
      var e = list[i];
      var live = !!(e && e.tag && e.score > 0);
      rows.push({
        rank: i + 1,
        tag: live ? String(e.tag) : TAG_BLANK,
        score: live ? formatScore(e.score) : '0',
        empty: !live
      });
    }
    return rows;
  }

  // True when no slot holds a real entry, so the panel can say "LEADERBOARD SOON".
  function allEmpty(rows) { return rows.every(function (r) { return r.empty; }); }

  return {
    SLOT_COUNT: SLOT_COUNT, readBest: readBest, formatScore: formatScore, bestLabel: bestLabel,
    slotsFor: slotsFor, allEmpty: allEmpty
  };
});
