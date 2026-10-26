// Bird Rock Arcade share card (M3), browser side. One file shared by the four games.
// On a game's score card:  ShareCard.show({ game: 'fill', score: 1200, line: '12 bags filled · 3 perfect', mount: <div id="share"> })
// draws a 1080 x 1350 poster (logo, game, big score, arcade address) into an image, then a SHARE button hands it to the
// phone's share menu (or saves it as a PNG where there is no share menu). Phones also get a SAVE TO PHOTOS button.
// If the run makes the leaderboard, leaderboard.js
// fires an "arcade:saved" event and the poster is redrawn with the player's rank and initials.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else root.ShareCard = factory(root);
})(typeof self !== 'undefined' ? self : this, function (win) {
  var W = 1080, H = 1350;
  var GAMES = {
    fill:     { title: 'Fill Master 3000',     color: '#4298B5' },
    pourover: { title: 'Pour-Over Power Hour', color: '#5b8c5a' },
    flappy:   { title: 'Flappy Grinder',       color: '#8a5fb0' },
    roast2:   { title: 'Roast Master 5000',    color: '#c8553d' }
  };
  var INK = '#0f1c26', WALL = '#173547', BLUE = '#4298B5', BLUE_LIGHT = '#9ad0e3', CREAM = '#f6edd6', GOLD = '#f2c744';

  // ---- rules (no page code; tested in share.test.js) ----

  function fmt(n) { return String(Math.max(0, Math.floor(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function titleFor(game) { return GAMES[game] ? GAMES[game].title : 'Bird Rock Arcade'; }

  // "pbkn4ves.github.io/bird-rock-arcade/arcade/" -> shown without the https:// and the last slash.
  function displayUrl(href) { return String(href || '').replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, ''); }

  // The line under the score: the player's rank and initials once saved, else nothing.
  function badgeText(tag, rank) { return tag && rank ? '#' + rank + ' ON THE BOARD · ' + tag : ''; }

  function fileName(game, score) { return 'bird-rock-' + game + '-' + Math.max(0, Math.floor(Number(score) || 0)) + '.png'; }

  function shareText(game, score, url) {
    return 'I scored ' + fmt(score) + ' on ' + titleFor(game) + ' at the Bird Rock Arcade. Think you can beat it? ' + url;
  }

  // Largest font size (from `start` down to `min`, in steps of 2) at which `text` fits in `maxW`, given measure(text, px) -> width.
  function fitSize(measure, text, maxW, start, min) {
    var px = start;
    while (px > min && measure(text, px) > maxW) px -= 2;
    return px;
  }

  // A web page can't write into the Photos app directly. iPhones and iPads do it through the share menu's
  // "Save Image" row; other phones put a downloaded picture in the gallery/Downloads. iPads can pose as Macs, hence the touch check.
  function savesViaShareMenu(ua, platform, touchPoints) {
    return /iPad|iPhone|iPod/.test(String(ua || '')) || (platform === 'MacIntel' && touchPoints > 1);
  }

  var api = {
    W: W, H: H, savesViaShareMenu: savesViaShareMenu, GAMES: GAMES, fmt: fmt, titleFor: titleFor, displayUrl: displayUrl, badgeText: badgeText,
    fileName: fileName, shareText: shareText, fitSize: fitSize
  };
  if (!win || !win.document) return api;

  // ---- browser ----
  var doc = win.document;
  var FONT = '"Press Start 2P", ui-monospace, Menlo, monospace';
  // Where this file lives: the pictures are found relative to it, so the card works from any game's folder.
  var BASE = (doc.currentScript && doc.currentScript.src) ? doc.currentScript.src : win.location.href;
  function asset(path) { return new win.URL(path, BASE).href; }
  var arcadeUrl = function () { return asset('arcade/'); };

  var images = {};
  function loadImage(path) {
    if (!images[path]) {
      images[path] = new Promise(function (resolve) {
        var im = new win.Image();
        im.onload = function () { resolve(im); };
        im.onerror = function () { resolve(null); };   // a missing picture just leaves its spot blank
        im.src = asset(path);
      });
    }
    return images[path];
  }
  function loadFont() {
    if (!doc.fonts || !doc.fonts.load) return Promise.resolve();
    return doc.fonts.load('40px "Press Start 2P"').catch(function () {});
  }

  function draw(o) {
    var cv = doc.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var g = GAMES[o.game] || { title: 'Bird Rock Arcade', color: BLUE };
    function measure(t, px) { c.font = px + 'px ' + FONT; return c.measureText(t).width; }
    function text(t, x, y, px, color, shadow) {
      c.font = px + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      if (shadow) { c.fillStyle = INK; c.fillText(t, x + Math.round(px / 14), y + Math.round(px / 14)); }
      c.fillStyle = color; c.fillText(t, x, y);
    }
    function fitText(t, x, y, start, min, maxW, color, shadow) { text(t, x, y, fitSize(measure, t, maxW, start, min), color, shadow); }

    // background, double pixel border
    c.fillStyle = INK; c.fillRect(0, 0, W, H);
    c.fillStyle = WALL; c.fillRect(30, 30, W - 60, H - 60);
    c.strokeStyle = BLUE; c.lineWidth = 12; c.strokeRect(30, 30, W - 60, H - 60);
    c.strokeStyle = g.color; c.lineWidth = 6; c.strokeRect(54, 54, W - 108, H - 108);

    // logo
    if (o.logo) { var lh = 220, lw = Math.round(lh * o.logo.width / o.logo.height); c.drawImage(o.logo, (W - lw) / 2, 80, lw, lh); }

    // game name
    fitText(g.title.toUpperCase(), W / 2, 385, 56, 28, W - 220, GOLD, true);

    // framed screenshot of the game
    var fx = 190, fy = 432, fw = 700, fh = 360;
    c.fillStyle = INK; c.fillRect(fx - 10, fy - 10, fw + 20, fh + 20);
    c.strokeStyle = g.color; c.lineWidth = 8; c.strokeRect(fx - 10, fy - 10, fw + 20, fh + 20);
    if (o.shot) {
      var s = Math.min(fw / o.shot.width, fh / o.shot.height), sw = o.shot.width * s, sh = o.shot.height * s;
      c.drawImage(o.shot, fx + (fw - sw) / 2, fy + (fh - sh) / 2, sw, sh);
    }

    // score
    text('OVERALL SCORE', W / 2, 855, 30, BLUE_LIGHT);
    fitText(fmt(o.score), W / 2, 1005, 130, 56, W - 200, CREAM, true);
    if (o.line) fitText(String(o.line).toUpperCase(), W / 2, 1068, 26, 14, W - 180, BLUE_LIGHT);

    // rank badge (only once the run is on the leaderboard)
    var badge = badgeText(o.tag, o.rank);
    if (badge) {
      var bs = fitSize(measure, badge, W - 260, 30, 16), bw = measure(badge, bs) + 56;
      c.fillStyle = GOLD; c.fillRect((W - bw) / 2, 1100, bw, 68);
      text(badge, W / 2, 1100 + 44, bs, INK);
    }

    // call to action
    text('CAN YOU BEAT IT?', W / 2, 1220, 26, GOLD);
    fitText(displayUrl(arcadeUrl()).toUpperCase(), W / 2, 1262, 22, 12, W - 160, CREAM);
    return cv;
  }

  function render(o) {
    return Promise.all([loadFont(), loadImage('assets/stacked-white.png'), loadImage('arcade/shots/' + o.game + '.png')]).then(function (r) {
      var cv = draw({ game: o.game, score: o.score, line: o.line, tag: o.tag, rank: o.rank, logo: r[1], shot: r[2] });
      return new Promise(function (resolve) { cv.toBlob(function (b) { resolve(b); }, 'image/png'); });
    });
  }

  function el(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  var run = 0;   // bumps on every show(), so a slow image from an earlier game can't replace a newer one

  function show(o) {
    var mount = o.mount;
    var score = Math.floor(Number(o.score) || 0);
    if (!mount) return;
    var my = ++run;
    if (mount._shareOff) mount._shareOff();
    mount.innerHTML = '';
    if (o.practice || score <= 0 || !win.URL || !doc.createElement('canvas').toBlob) { mount.hidden = true; return; }
    mount.hidden = false;

    var file = null, tag = '', rank = 0;
    var btn = el('button', 'btn share-btn', 'Preparing…');
    btn.type = 'button'; btn.disabled = true;
    // Second button, phones only (where the share menu can take a file): put the picture in Photos.
    var saveBtn = el('button', 'btn share-btn share-save', 'Save to Photos');
    saveBtn.type = 'button'; saveBtn.hidden = true;
    var nav = win.navigator || {};
    var viaMenu = savesViaShareMenu(nav.userAgent, nav.platform, nav.maxTouchPoints);
    var hint = el('p', 'lb-msg share-hint', 'THEN TAP "SAVE IMAGE"');
    hint.hidden = true;
    var msg = el('p', 'lb-msg');
    msg.setAttribute('role', 'status');
    mount.appendChild(btn); mount.appendChild(saveBtn); mount.appendChild(hint); mount.appendChild(msg);

    function canShareFile() {
      return !!(file && win.navigator && win.navigator.canShare && win.navigator.share && win.navigator.canShare({ files: [file] }));
    }
    function build() {
      var mine = my;
      btn.disabled = true; btn.textContent = 'Preparing…';
      render({ game: o.game, score: score, line: o.line, tag: tag, rank: rank }).then(function (blob) {
        if (mine !== my || run !== my) return;
        if (!blob) { mount.hidden = true; return; }
        file = new win.File([blob], fileName(o.game, score), { type: 'image/png' });
        var phone = canShareFile();
        btn.textContent = phone ? 'Share score' : 'Save image';
        saveBtn.hidden = !phone; saveBtn.disabled = false;
        hint.hidden = !(phone && viaMenu);
        btn.disabled = false;
      });
    }

    function download() {
      var url = win.URL.createObjectURL(file);
      var a = el('a'); a.href = url; a.download = file.name;
      doc.body.appendChild(a); a.click(); doc.body.removeChild(a);
      setTimeout(function () { win.URL.revokeObjectURL(url); }, 4000);
    }

    // Everything the click does must start inside the click itself, or phones refuse to open the share menu.
    btn.addEventListener('click', function () {
      if (!file) return;
      msg.textContent = '';
      if (canShareFile()) {
        win.navigator.share({ files: [file], title: titleFor(o.game), text: shareText(o.game, score, arcadeUrl()) })
          .then(function () { msg.textContent = 'SHARED!'; })
          .catch(function (e) { if (!e || e.name !== 'AbortError') msg.textContent = 'COULD NOT SHARE. TRY AGAIN'; });
        return;
      }
      download();
      msg.textContent = 'IMAGE SAVED';
    });

    saveBtn.addEventListener('click', function () {
      if (!file) return;
      msg.textContent = '';
      if (viaMenu && canShareFile()) {
        // The picture alone (no text or link), so the menu leads with "Save Image".
        win.navigator.share({ files: [file] })
          .catch(function (e) { if (!e || e.name !== 'AbortError') msg.textContent = 'COULD NOT SAVE. TRY AGAIN'; });
        return;
      }
      download();
      msg.textContent = 'SAVED. CHECK PHOTOS OR DOWNLOADS';
    });

    // leaderboard.js says when the run is saved: redraw the poster with rank and initials.
    function onSaved(e) {
      var d = e && e.detail;
      if (my !== run || !d || d.game !== o.game || d.score !== score || !d.rank) return;
      tag = d.tag; rank = d.rank; msg.textContent = '';
      build();
    }
    doc.addEventListener('arcade:saved', onSaved);
    mount._shareOff = function () { doc.removeEventListener('arcade:saved', onSaved); };
    build();
  }

  api.show = show; api.render = render;
  return api;
});
