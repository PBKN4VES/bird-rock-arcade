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

    // Top 3 panel: blank until the leaderboard answers (see loadTop).
    var panel = el('div', 'top3');
    panel.setAttribute('data-game', g.id);
    panel.appendChild(el('h2', null, 'TOP 3'));
    li.appendChild(panel);
    drawTop(panel, [], LB && LB.endpoint() ? 'loading' : 'off');
    // Opens the Top 100 page on this game's tab (hidden while the leaderboard is off).
    if (LB && LB.endpoint()) {
      var more = el('a', 'top100', 'SEE TOP 100');
      more.href = '../scores/?game=' + encodeURIComponent(g.id);
      panel.appendChild(more);
    }
    return li;
  }

  function drawTop(panel, entries, status) {
    var rows = L.slotsFor(entries);
    var old = panel.querySelectorAll('ol, .soon');
    for (var i = 0; i < old.length; i++) panel.removeChild(old[i]);
    var ol = el('ol');
    rows.forEach(function (row) {
      var item = el('li', row.empty ? 'empty' : '');
      item.appendChild(el('span', null, String(row.rank)));
      item.appendChild(el('span', null, row.tag));
      item.appendChild(el('span', 'pts', row.score));
      ol.appendChild(item);
    });
    panel.appendChild(ol);
    var note = L.panelNote(status, rows);
    if (note) panel.appendChild(el('p', 'soon', note));
  }

  var LB = window.Leaderboard;
  GAMES.forEach(function (g) { floor.appendChild(cabinet(g)); });

  // Everyone's top 3 per game, in one request. At most every 20 seconds (the server reuses a copy for a minute anyway).
  var lastLoad = 0;
  function loadTop() {
    if (!LB || !LB.endpoint() || Date.now() - lastLoad < 20000) return;
    lastLoad = Date.now();
    LB.fetchAll(L.SLOT_COUNT, function (err, boards) {
      var panels = floor.querySelectorAll('.top3');
      for (var i = 0; i < panels.length; i++) {
        var id = panels[i].getAttribute('data-game');
        drawTop(panels[i], err ? [] : (boards[id] || []), err ? 'error' : 'ok');
      }
    });
  }
  loadTop();
  var foot = document.getElementById('foot-note');
  if (foot && LB && LB.endpoint()) foot.textContent = 'YOUR BEST stays on this device. TOP 3 is everyone who plays.';

  // Coming back from a game tab: refresh the saved bests and the Top 3.
  function refresh() {
    var bests = floor.querySelectorAll('.best b');
    GAMES.forEach(function (g, i) { if (bests[i]) bests[i].textContent = L.bestLabel(L.readBest(store(), g.bestKey)); });
    loadTop();
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  window.addEventListener('focus', refresh);
})();
