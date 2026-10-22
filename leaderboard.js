// Bird Rock Arcade leaderboard, browser side. One file shared by the four games and the arcade hub.
// The server is a Google Apps Script web app (../leaderboard/Code.gs, outside site/). Its address is in
// leaderboard-config.js; while that is blank, everything here stays switched off and the games play as before.
//
// In a game's score card:  Leaderboard.show({ game: 'fill', score: 1200, mount: <div class="lb"> })
//   shows the top 10 and, if the run makes it, asks for 3 initials (classic arcade rule).
// In the hub:  Leaderboard.fetchAll(3, function (err, boards) { ... })
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else root.Leaderboard = factory(root);
})(typeof self !== 'undefined' ? self : this, function (win) {
  var BOARD_SIZE = 10;
  var TAG_KEY = 'arcade.initials';     // last initials used on this device, offered next time
  var DEV_KEY = 'arcade.lbUrl';        // local testing only: an endpoint set with ?lb=... on localhost
  var TIMEOUT_MS = 8000;

  // ---- rules (no page code; tested in leaderboard.test.js) ----

  // Whatever was typed -> up to 3 capital letters.
  function cleanTag(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); }
  function validTag(s) { return /^[A-Z]{3}$/.test(s); }

  // Same rule as rankFor in Code.gs: where a score would land on the board (1..10), or 0. Ties go below.
  function rankFor(top, score) {
    if (!(score > 0)) return 0;
    var above = 0;
    for (var i = 0; i < top.length; i++) if (top[i].score >= score) above++;
    return above < BOARD_SIZE ? above + 1 : 0;
  }

  // The score needed to get on a full board (one more than 10th place), or 1 if there's still room.
  function needed(top) { return top.length < BOARD_SIZE ? 1 : top[BOARD_SIZE - 1].score + 1; }

  // The board's rows, with the player's pending or saved run marked. Always 10 rows, blanks shown as ---.
  function rowsFor(top, mark) {
    var list = top.slice();
    if (mark && mark.pending) list.splice(mark.rank - 1, 0, { tag: '???', score: mark.score });
    var rows = [];
    for (var i = 0; i < BOARD_SIZE; i++) {
      var e = list[i];
      rows.push({ rank: i + 1, tag: e ? e.tag : '---', score: e ? e.score : 0, empty: !e, you: !!(mark && mark.rank === i + 1) });
    }
    return rows;
  }

  // Short message for each server error code.
  var ERRORS = {
    blocked: 'PICK OTHER INITIALS', tag: 'TYPE 3 LETTERS', low: 'SO CLOSE! THE BOARD JUST MOVED',
    busy: 'BUSY. TRY AGAIN', score: 'SCORE NOT ACCEPTED', game: 'SCORE NOT ACCEPTED', bad: 'TRY AGAIN'
  };
  function errorText(code) { return ERRORS[code] || 'COULD NOT SAVE. TRY AGAIN'; }

  function fmt(n) { return String(Math.max(0, Math.floor(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  var api = {
    BOARD_SIZE: BOARD_SIZE, cleanTag: cleanTag, validTag: validTag, rankFor: rankFor, needed: needed,
    rowsFor: rowsFor, errorText: errorText
  };
  if (!win || !win.document) return api;

  // ---- browser ----
  var doc = win.document;
  function store() { try { return win.localStorage; } catch (e) { return null; } }
  function get(k) { try { return store().getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { if (v) store().setItem(k, v); else store().removeItem(k); } catch (e) { /* private mode */ } }

  // The server address. On localhost, ?lb=http://127.0.0.1:8788 (once, on any page) points every page at the
  // local preview server instead; ?lb= with nothing clears it. Ignored on the live site.
  function endpoint() {
    var host = win.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      var m = /[?&]lb=([^&]*)/.exec(win.location.search);
      if (m) put(DEV_KEY, decodeURIComponent(m[1]));
      var dev = get(DEV_KEY);
      if (dev) return dev;
    }
    return String(win.LEADERBOARD_URL || '');
  }

  function request(method, query, body, done) {
    var url = endpoint();
    if (!url) { done('off'); return; }
    var ctrl = win.AbortController ? new win.AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
    // A POST with a plain-text body is a "simple request": no extra permission round trip, which Apps Script can't answer.
    var opts = { method: method, redirect: 'follow', signal: ctrl ? ctrl.signal : undefined };
    if (body) opts.body = JSON.stringify(body);
    win.fetch(url + (query || ''), opts)
      .then(function (r) { return r.json(); })
      .then(function (data) { clearTimeout(timer); done(null, data); })
      .catch(function () { clearTimeout(timer); done('net'); });
  }

  function fetchAll(limit, done) {
    request('GET', '?limit=' + (limit || 3), null, function (err, data) {
      if (err || !data || !data.ok) done(err || 'bad');
      else done(null, data.boards || {});
    });
  }

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var run = 0;   // bumps on every show(), so a slow answer from an earlier game can't draw over a new one

  function show(o) {
    var mount = o.mount;
    if (!mount || !endpoint()) { if (mount) mount.hidden = true; return; }
    var my = ++run;
    var score = o.practice ? 0 : Math.floor(Number(o.score) || 0);
    mount.hidden = false;
    mount.innerHTML = '';
    var head = el('p', 'eyebrow lb-head', 'HIGH SCORES');
    var body = el('div', 'lb-body');
    var status = el('p', 'lb-msg', 'LOADING…');
    status.setAttribute('role', 'status');
    mount.appendChild(head); mount.appendChild(body); mount.appendChild(status);

    request('GET', '?game=' + encodeURIComponent(o.game), null, function (err, data) {
      if (my !== run) return;
      if (err || !data || !data.ok) { status.textContent = 'LEADERBOARD OFFLINE'; return; }
      var top = data.top || [];
      var rank = rankFor(top, score);
      if (rank) ask(top, rank); else board(top, null, score > 0 && !o.practice ? 'TOP 10 NEEDS ' + fmt(needed(top)) : (o.practice ? 'TEST RUN: NOT RANKED' : ''));
    });

    // Draws the 10 rows into `into` (default: the whole body, replacing what's there).
    function board(top, mark, msg, into) {
      if (!into) { body.innerHTML = ''; into = body; }
      var ol = el('ol', 'lb-list');
      rowsFor(top, mark).forEach(function (r) {
        var li = el('li', (r.empty ? 'empty' : '') + (r.you ? ' you' : ''));
        li.appendChild(el('span', 'r', String(r.rank)));
        li.appendChild(el('span', 't', r.tag));
        li.appendChild(el('span', 's', r.empty ? '0' : fmt(r.score)));
        ol.appendChild(li);
      });
      into.appendChild(ol);
      status.textContent = msg || '';
    }

    // The run made the board: show where it lands and ask for initials.
    function ask(top, rank) {
      head.textContent = 'NEW HIGH SCORE! #' + rank;
      body.innerHTML = '';
      var form = el('form', 'lb-form');
      var label = el('label', null, 'YOUR INITIALS');
      var input = el('input', 'lb-input');
      input.type = 'text'; input.maxLength = 3; input.required = true;
      input.autocomplete = 'off'; input.spellcheck = false;
      input.setAttribute('autocapitalize', 'characters'); input.setAttribute('autocorrect', 'off');
      input.setAttribute('enterkeyhint', 'done'); input.setAttribute('aria-label', 'Your initials, 3 letters');
      input.setAttribute('data-1p-ignore', ''); input.setAttribute('data-lpignore', 'true');   // keep password managers out of it
      input.value = cleanTag(get(TAG_KEY));
      var btn = el('button', 'btn lb-save', 'SAVE');
      btn.type = 'submit';
      label.appendChild(input);
      form.appendChild(label); form.appendChild(btn);
      body.appendChild(form);
      board(top, { pending: true, rank: rank, score: score }, '', body);

      input.addEventListener('input', function () {
        var c = cleanTag(input.value);
        if (c !== input.value) input.value = c;
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var tag = cleanTag(input.value);
        if (!validTag(tag)) { status.textContent = errorText('tag'); input.focus(); return; }
        btn.disabled = true; input.disabled = true; btn.textContent = 'SAVING…';
        request('POST', '', { game: o.game, tag: tag, score: score }, function (err, res) {
          if (my !== run) return;
          if (!err && res && res.ok) {
            put(TAG_KEY, tag);
            head.textContent = 'HIGH SCORES';
            board(res.top || top, { rank: res.rank }, res.rank ? 'YOU\'RE #' + res.rank + '!' : 'SAVED');
            return;
          }
          var code = (res && res.error) || err;
          if (code === 'low' && res && res.top) { head.textContent = 'HIGH SCORES'; board(res.top, null, errorText('low')); return; }
          btn.disabled = false; input.disabled = false; btn.textContent = 'SAVE';
          status.textContent = errorText(code);
          if (code === 'blocked' || code === 'tag') { input.value = ''; input.focus(); }
        });
      });
      // Focus the box only on devices with a keyboard; on phones a focused box can pop the keyboard over the card.
      if (!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches)) input.focus();
    }
  }

  // True while the player is typing initials, so a game doesn't move focus to its "again" button.
  function typing() {
    var a = doc.activeElement;
    return !!(a && a.classList && a.classList.contains('lb-input'));
  }

  api.endpoint = endpoint; api.fetchAll = fetchAll; api.show = show; api.typing = typing;
  return api;
});
