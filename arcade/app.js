// Bird Rock Arcade: builds the cabinets from ARCADE_GAMES and fills in each player's saved best score.
(function () {
  var L = window.ArcadeLogic;
  var GAMES = window.ARCADE_GAMES || [];
  var floor = document.getElementById('floor');
  if (!floor) return;

  // Merely touching window.localStorage can throw when storage is blocked, so look it up safely.
  function store() { try { return window.localStorage; } catch (e) { return null; } }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function cabinet(g) {
    var best = L.readBest(store(), g.bestKey);
    var li = el('li', 'slot');

    var a = el('a', 'cab');
    a.href = g.href; a.target = '_blank'; a.rel = 'noopener';
    a.style.setProperty('--cab', g.color);
    a.setAttribute('aria-label', 'Play ' + g.title + (g.sub ? ' ' + g.sub : '') + '. ' + g.blurb +
      (best ? ' Your best: ' + L.formatScore(best) + '.' : '') + ' Opens in a new tab.');

    var mq = el('span', 'marquee', g.title);
    if (g.sub) mq.appendChild(el('small', null, g.sub));
    var bezel = el('span', 'bezel');
    // The screen is a screenshot of the real game (see shots/), so the cabinet matches what you play.
    var shot = el('img', 'screen');
    shot.src = g.shot; shot.alt = ''; shot.width = 5; shot.height = 4;
    shot.style.objectPosition = g.shotPos || '50% 50%';
    if (g.shotFit) shot.style.objectFit = g.shotFit;
    bezel.appendChild(shot);
    var bestEl = el('span', 'best', 'YOUR BEST');
    bestEl.appendChild(el('b', null, L.bestLabel(best)));
    a.appendChild(mq); a.appendChild(bezel);
    a.appendChild(el('span', 'blurb', g.blurb));
    a.appendChild(bestEl);
    a.appendChild(el('span', 'coin', 'INSERT COIN'));
    a.appendChild(el('span', 'play', 'PLAY'));
    li.appendChild(a);

    // Top 3 panel. entries stays empty until the leaderboard (project M4) hands scores over.
    var rows = L.slotsFor([]);
    var panel = el('div', 'top3');
    panel.appendChild(el('h2', null, 'TOP 3'));
    var ol = el('ol');
    rows.forEach(function (row) {
      var item = el('li', row.empty ? 'empty' : '');
      item.appendChild(el('span', null, String(row.rank)));
      item.appendChild(el('span', null, row.tag));
      item.appendChild(el('span', 'pts', row.score));
      ol.appendChild(item);
    });
    panel.appendChild(ol);
    if (L.allEmpty(rows)) panel.appendChild(el('p', 'soon', 'LEADERBOARD SOON'));
    li.appendChild(panel);
    return li;
  }

  GAMES.forEach(function (g) { floor.appendChild(cabinet(g)); });

  // Coming back from a game tab: refresh the saved bests.
  function refresh() {
    var bests = floor.querySelectorAll('.best b');
    GAMES.forEach(function (g, i) { if (bests[i]) bests[i].textContent = L.bestLabel(L.readBest(store(), g.bestKey)); });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  window.addEventListener('focus', refresh);
})();
