// Bird Rock Arcade Top 100 page: one tab per game, the board for the chosen game below.
(function () {
  var L = window.ScoresLogic;
  var LB = window.Leaderboard;
  var GAMES = window.ARCADE_GAMES || [];
  var tabs = document.getElementById('tabs');
  var rows = document.getElementById('rows');
  var title = document.getElementById('board-title');
  var note = document.getElementById('note');
  if (!tabs || !rows) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fmt(n) { return String(Math.max(0, Math.floor(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  var current = '';
  var buttons = {};

  function select(id, push) {
    var game = GAMES.filter(function (g) { return g.id === id; })[0];
    if (!game) return;
    current = id;
    GAMES.forEach(function (g) {
      buttons[g.id].setAttribute('aria-current', g.id === id ? 'true' : 'false');
    });
    title.textContent = game.title;
    title.style.setProperty('--cab', game.color);
    rows.innerHTML = '';
    if (push && window.history && history.replaceState) history.replaceState(null, '', '?game=' + id);

    if (!LB || !LB.endpoint()) { note.textContent = 'LEADERBOARD SOON'; return; }
    note.textContent = 'LOADING…';
    LB.fetchGame(id, L.SIZE, function (err, top) {
      if (current !== id) return;   // a slow answer for a tab the player already left
      if (err) { note.textContent = 'LEADERBOARD OFFLINE. TRY AGAIN SOON'; return; }
      var list = L.rowsFor(top);
      rows.innerHTML = '';
      list.forEach(function (r) {
        var li = el('li', r.rank <= 3 ? 'podium' : '');
        li.appendChild(el('span', 'r', String(r.rank)));
        li.appendChild(el('span', 't', r.tag));
        li.appendChild(el('span', 's', fmt(r.score)));
        rows.appendChild(li);
      });
      note.textContent = L.noteFor(list.length);
    });
  }

  GAMES.forEach(function (g) {
    var b = el('button', 'tab', g.title);
    b.type = 'button';
    b.style.setProperty('--cab', g.color);
    b.addEventListener('click', function () { select(g.id, true); });
    buttons[g.id] = b;
    tabs.appendChild(b);
  });

  select(L.pickGame(window.location.search, GAMES), false);
})();
