// Pour-Over Power Hour: drawing, input and screens. Rules live in logic.js.
(function () {
  'use strict';

  var L = window.PourLogic;
  var POOL = window.COFFEES;

  // Colors and font in one place so skins and tweaks are easy. (Same palette as the other games.)
  var THEME = {
    font: "'Press Start 2P', ui-monospace, monospace",
    ink: '#0f1c26', wall: '#173547', wall2: '#1d4259', floor: '#12293a',
    metal: '#8fa7b3', metalDark: '#5d7584', blue: '#4298B5', blueDark: '#2c6a80', blueLight: '#9ad0e3',
    cream: '#f6edd6', gold: '#f2c744', goldDim: '#7d6419', red: '#e0503f', green: '#6fd16f',
    kettle: { body: '#4b7050', light: '#7aa67d', shade: '#34523a', baseDark: '#2a4630' },
    water: '#8fd0ee', roast: { light: '#e3c27e', medium: '#b9803f', dark: '#7a4a24' }, coffee: '#6b4423', coffeeDark: '#4a2d16', glass: '#1d3d4f', handle: '#5f8fa5', ceramic: '#b9c7cc', ceramicLight: '#e1eaec', ceramicShade: '#8fa1a8', wood: '#8a5a2b', woodLight: '#a8743a'
  };

  var W = 368, H = 256, SLOT = 46;
  var LAST_X = W - 66;            // furthest right a spout may sit: the kettle body extends about 62 px to its right
  // Vertical layout of the bar (canvas pixels).
  var Y = { rim: 112, coneH: 24, server: 139, serverH: 37, counter: 178, floor: 190, pips: 196, bar: 208, label: 232, mark: 244 };

  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    level: $('level'), served: $('served'), points: $('points'), best: $('best'), label: $('label'), coffee: $('coffee'), notes: $('notes'),
    strikes: $('strikes'), banner: $('banner'), status: $('status'), left: $('left'), right: $('right'), load: $('load'), pour: $('pour'),
    title: $('title'), over: $('over'), start: $('start'), again: $('again'), sound: $('sound'),
    score: $('score'), newBest: $('new-best'), rCoffee: $('review-coffee'), rNotes: $('review-notes'),
    rLast: $('review-last'), rStats: $('review-stats'), rCups: $('review-cups')
  };

  // ---- game state ----
  var state = 'title';           // title | running | failing | over
  var bar = L.createBar(POOL);   // idle bar behind the title card
  bar.events.length = 0;
  var startBest = 0, timer = 0, shake = 0, flash = 0, kx = 0, nudge = 0, tilt = 0;   // tilt: 0 = upright on its base, 1 = tipped to pour
  var floaters = [], keys = { left: false, right: false }, lastDir = 0, buffered = null, repeatT = 0;
  var best = readBest();
  var soundOn = true, ac = null;   // on by default; the browser only starts audio after the first tap (Start)
  var bannerTimeout = 0, panelKey = '', loadLabel = 'Load';

  function readBest() {
    try { return parseInt(localStorage.getItem('pourover.bestScore'), 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) { try { localStorage.setItem('pourover.bestScore', String(v)); } catch (e) { /* private mode */ } }

  // ---- layout helpers ----
  // Stations run left to right: the water tap (index -1), then the drippers (0, 1, 2...). They are centered, but the row
  // is held far enough left that the kettle (spout on the left, body on the right) always fits at the last dripper.
  function cx(i) {
    var n = bar.drippers.length, first = Math.min((W - (n + 1) * SLOT) / 2 + SLOT / 2, LAST_X - SLOT * n);
    return Math.round(first + SLOT * (i + 1));
  }

  // ---- sound (tiny synth, no files) ----
  function ensureAudio() {
    if (!ac) { var A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); }
    if (ac && ac.state === 'suspended') ac.resume();
  }
  function tone(freq, dur, type, vol, delay, slideTo) {
    if (!ac) return;
    var t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol || 0.08, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol) {
    if (!ac) return;
    var n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    var s = ac.createBufferSource(), g = ac.createGain(); s.buffer = buf; g.gain.value = vol;
    s.connect(g); g.connect(ac.destination); s.start();
  }
  // One water drop: a short sine "bloop" whose pitch rises quickly, like a drip landing in a full cup.
  function drip(delay) {
    var f = 620 + Math.random() * 380;
    tone(f, 0.09, 'sine', 0.09, delay, f * 1.7);
  }
  function sfx(name) {
    if (!soundOn) return;
    ensureAudio();
    if (name === 'pour') { for (var i = 0; i < 6; i++) drip(i * 0.19 + Math.random() * 0.04); }   // drip, drip, drip across the 1.2s pour
    else if (name === 'load') { tone(200, 0.05, 'square', 0.06); tone(300, 0.07, 'square', 0.06, 0.05); }
    else if (name === 'fill') { noise(0.9, 0.12); tone(180, 0.9, 'sine', 0.05, 0, 520); }
    else if (name === 'order') { tone(660, 0.05, 'square', 0.025); }
    else if (name === 'call') { tone(880, 0.07, 'square', 0.05); tone(880, 0.07, 'square', 0.05, 0.1); }
    else if (name === 'red') { tone(1240, 0.06, 'square', 0.05); tone(1240, 0.06, 'square', 0.05, 0.08); tone(1240, 0.06, 'square', 0.05, 0.16); }
    else if (name === 'early') { tone(150, 0.07, 'square', 0.04); }
    else if (name === 'hit') { tone(520, 0.1, 'square', 0.07); tone(780, 0.14, 'square', 0.07, 0.09); }
    else if (name === 'perfect') { tone(520, 0.09, 'square', 0.07); tone(780, 0.09, 'square', 0.07, 0.08); tone(1040, 0.2, 'square', 0.07, 0.16); }
    else if (name === 'fail') { tone(300, 0.5, 'sawtooth', 0.08, 0, 70); }
    else if (name === 'level') { tone(392, 0.09, 'square', 0.06); tone(523, 0.09, 'square', 0.06, 0.09); tone(659, 0.09, 'square', 0.06, 0.18); tone(784, 0.2, 'square', 0.06, 0.27); }
    else if (name === 'start') { tone(440, 0.08, 'square', 0.06); tone(660, 0.12, 'square', 0.06, 0.08); }
  }
  el.sound.addEventListener('click', function () {
    soundOn = !soundOn;
    el.sound.setAttribute('aria-pressed', String(soundOn));
    el.sound.textContent = 'Sound: ' + (soundOn ? 'on' : 'off');
    if (soundOn) { ensureAudio(); sfx('start'); }
  });

  // ---- flow ----
  function say(msg) { el.status.textContent = msg; }
  function banner(text, bad) {
    el.banner.textContent = text;
    el.banner.className = 'banner show' + (bad ? ' bad' : '');
    clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(function () { el.banner.className = 'banner' + (bad ? ' bad' : ''); }, 800);
  }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function hud() {
    el.level.textContent = bar.level;
    el.served.textContent = bar.served;
    el.points.textContent = fmt(bar.points);
    el.best.textContent = fmt(best);
    for (var i = 0; i < el.strikes.children.length; i++) el.strikes.children[i].className = i < bar.strikes ? 'on' : '';
    el.strikes.setAttribute('aria-label', bar.strikes + ' of ' + L.MAX_STRIKES + ' strikes');
  }
  function setControls(on) {
    [el.left, el.right, el.load, el.pour].forEach(function (b) { b.disabled = !on; });
  }

  // The panel shows the coffee in the dripper under the kettle, or else the next order waiting, or the tap's water level.
  // An order's roast sets its waits: light roasts are slow, dark roasts quick.
  function roastLine(c) {
    var r = c && L.ROASTS[c.roast || 'medium'];
    return r ? r.name + ' roast' : '';
  }
  function panel() {
    if (bar.pos < 0) {
      var wk = 'tap|' + bar.water;
      if (wk === panelKey) return;
      panelKey = wk;
      el.label.textContent = 'Water tap';
      el.coffee.textContent = 'Kettle: ' + bar.water + ' of ' + L.KETTLE_CAP + ' pours';
      el.notes.textContent = bar.water >= L.KETTLE_CAP ? 'Full. Go brew!' : 'Press Load (Down or S) to fill it.';
      return;
    }
    var d = bar.drippers[bar.pos], c = d && d.coffee, lab = 'Brewing here';
    if (!c) { c = bar.queue[0]; lab = 'Next order'; }
    var w = c && L.recipeWaits(c, bar.params);
    var info = c ? ' · ' + roastLine(c) + (lab === 'Next order' ? ' · waits ' + Math.round(w.t1) + 's, ' + Math.round(w.t2) + 's' : '') : '';
    var key = lab + '|' + (c ? c.name + c.roast : '') + '|' + bar.level;
    if (key === panelKey) return;
    panelKey = key;
    el.label.textContent = lab + info;
    el.coffee.textContent = c ? c.name : 'No orders yet';
    el.notes.textContent = c ? c.notes.join(' · ') : '';
  }

  function startRun() {
    bar = L.createBar(POOL); bar.events.length = 0;
    startBest = best; floaters = []; buffered = null; keys.left = keys.right = false; lastDir = 0;
    kx = cx(0); panelKey = ''; loadLabel = 'Load';
    el.load.querySelector('.face').lastChild.nodeValue = 'Load'; el.load.querySelector('.face use').setAttribute('href', '#i-down');
    el.title.hidden = true; el.over.hidden = true;
    setControls(true);
    state = 'running';
    sfx('start');
    hud();
    say('Shift started. Load an empty dripper with Down, then pour with Space.');
  }

  // ---- reacting to what happened in the rules (events) ----
  function handleEvents() {
    var evs = bar.events; bar.events = [];
    evs.forEach(function (e) {
      var x = e.i >= 0 && e.i !== undefined ? cx(e.i) : W / 2;
      if (e.type === 'order') { if (state === 'running') sfx('order'); }
      else if (e.type === 'load') { sfx('load'); say('Loaded ' + e.coffee.name + '. Pour now.'); }
      else if (e.type === 'pour') { sfx('pour'); say('Pour ' + e.n + ' of 3. ' + e.water + ' pours of water left.'); }
      else if (e.type === 'call') { sfx('call'); say('Dripper ' + (e.i + 1) + ' needs pour ' + e.pourNum + '.'); }
      else if (e.type === 'red') { sfx('red'); }
      else if (e.type === 'early') { sfx('early'); nudge = 0.15; }
      else if (e.type === 'fill') { sfx('fill'); say('Filling the kettle.'); }
      else if (e.type === 'full') { sfx('early'); nudge = 0.15; say('The kettle is already full.'); }
      else if (e.type === 'dry') { sfx('early'); nudge = 0.15; banner('NO WATER!', true); say('The kettle is empty. Go to the tap on the left and press Load to fill it.'); }
      else if (e.type === 'noTicket') { sfx('early'); nudge = 0.15; banner('NO ORDER!', true); }
      else if (e.type === 'blocked') { sfx('early'); nudge = 0.15; }
      else if (e.type === 'ruined') { floaters.push({ x: x, y: Y.rim - 6, text: 'X', color: THEME.red, life: 0.9 }); }
      else if (e.type === 'strike') {
        banner(L.STRIKE_LABELS[e.reason], true);
        if (e.reason === 'backlog') floaters.push({ x: 40, y: 40, text: 'X', color: THEME.red, life: 0.9 });
        sfx('fail'); shake = 0.25; hud();
        say(L.STRIKE_LABELS[e.reason].replace('!', '') + '. Strike ' + e.strikes + ' of ' + L.MAX_STRIKES + '.');
      }
      else if (e.type === 'served') {
        if (bar.points > best) { best = bar.points; saveBest(best); }
        banner((e.result === 'perfect' ? 'PERFECT! +' : 'NICE! +') + e.points, false);
        floaters.push({ x: x, y: Y.rim - 6, text: '+' + e.points, color: e.result === 'perfect' ? THEME.gold : THEME.cream, life: 1 });
        sfx(e.result); flash = e.result === 'perfect' ? 0.5 : 0; hud();
        say((e.result === 'perfect' ? 'Perfect' : 'Nice') + '. ' + e.points + ' points. Score ' + bar.points + '.');
      }
      else if (e.type === 'levelup') {
        var lvl = e.level, ns = e.newStation;
        setTimeout(function () { if (state === 'running') { banner(ns ? 'NEW STATION!' : 'LEVEL ' + lvl, false); sfx('level'); } }, 450);
        hud();
        say('Level ' + lvl + (ns ? '. A new dripper opened.' : '.'));
      }
      else if (e.type === 'over') { state = 'failing'; timer = 1.3; setControls(false); keys.left = keys.right = false; buffered = null; }
    });
  }

  // Little cup icons, one for each pour over served.
  function cupSvg() {
    return '<svg viewBox="0 0 16 20" aria-hidden="true">' +
      '<rect x="1" y="0" width="14" height="2" fill="#8fa7b3"/><rect x="2" y="2" width="12" height="3" fill="#f6edd6"/>' +
      '<rect x="4" y="5" width="8" height="3" fill="#f6edd6"/><rect x="6" y="8" width="4" height="2" fill="#f6edd6"/>' +
      '<rect x="3" y="11" width="10" height="8" fill="#1d3d4f"/><rect x="3" y="11" width="10" height="2" fill="#4298B5"/>' +
      '<rect x="4" y="14" width="8" height="5" fill="#6b4423"/></svg>';
  }
  function renderCups() {
    var MAX = 30, r = bar.results;
    var html = r.slice(0, MAX).map(cupSvg).join('');
    if (r.length > MAX) html += '<span class="more">+' + (r.length - MAX) + '</span>';
    el.rCups.innerHTML = html;
    el.rCups.hidden = r.length === 0;
    el.rCups.setAttribute('aria-label', r.length + ' pour overs served');
  }

  function showReview() {
    state = 'over';
    el.score.textContent = fmt(bar.points);
    el.newBest.hidden = !(bar.points > 0 && bar.points > startBest);
    el.rLast.hidden = !bar.lastGood;
    if (bar.lastGood) {
      el.rCoffee.textContent = bar.lastGood.coffee.name;
      el.rNotes.textContent = bar.lastGood.coffee.notes.join(' · ');
    }
    renderCups();
    el.rStats.textContent = bar.served + (bar.served === 1 ? ' pour over' : ' pour overs') + ' served · level ' + bar.level;
    el.again.disabled = true;
    el.over.hidden = false;
    if (window.ShareCard) ShareCard.show({ game: 'pourover', score: bar.points, line: el.rStats.textContent, mount: document.getElementById('share') });
    if (window.Leaderboard) Leaderboard.show({ game: 'pourover', score: bar.points, mount: document.getElementById('lb') });
    setTimeout(function () { el.again.disabled = false; if (!(window.Leaderboard && Leaderboard.typing())) el.again.focus(); }, 500);   // stops a stray tap from skipping the card
    say('Shift over. Overall score ' + bar.points + '. ' + el.rStats.textContent + '.');
  }

  // ---- input ----
  // Load and pour pressed while the kettle is still busy wait a moment (0.3 s) and then fire, so quick fingers aren't punished.
  function act(kind) {
    if (state !== 'running') return;
    if (bar.lock > 0) { buffered = { kind: kind, t: 0.3 }; return; }
    fire(kind);
  }
  function fire(kind) { if (kind === 'load') L.load(bar); else L.pour(bar); }
  function setKey(dir, down) {
    if (dir < 0) keys.left = down; else keys.right = down;
    if (down) { lastDir = dir; repeatT = HOLD_DELAY; if (state === 'running') L.move(bar, dir); }
    else if (lastDir === dir) lastDir = keys.left ? -1 : keys.right ? 1 : 0;
  }
  // A tap is one step. Holding a key waits a moment, then keeps stepping at a calm pace (not every frame).
  var HOLD_DELAY = 0.3, HOLD_STEP = 0.2;
  function heldDir() {
    if (keys.left && keys.right) return lastDir;
    return keys.left ? -1 : keys.right ? 1 : 0;
  }

  function bindDir(node, dir) {
    node.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { node.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      node.classList.add('down'); setKey(dir, true);
    });
    function up(e) { e.preventDefault(); node.classList.remove('down'); setKey(dir, false); }
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { node.addEventListener(ev, up); });
    node.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  function bindTap(node, kind) {
    node.addEventListener('pointerdown', function (e) { e.preventDefault(); node.classList.add('down'); act(kind); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { node.addEventListener(ev, function () { node.classList.remove('down'); }); });
    node.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  bindDir(el.left, -1); bindDir(el.right, 1);
  bindTap(el.load, 'load'); bindTap(el.pour, 'pour');
  el.start.addEventListener('click', startRun);
  el.again.addEventListener('click', startRun);

  var KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'load', KeyS: 'load', Space: 'pour'
  };
  // The matching on-screen button presses down while its key is held, so the keyboard and the buttons visibly agree.
  var KEYBTN = { left: el.left, right: el.right, load: el.load, pour: el.pour };
  function lightKey(k, on) { if (KEYBTN[k]) KEYBTN[k].classList.toggle('down', on); }
  window.addEventListener('keydown', function (e) {
    var k = KEYMAP[e.code];
    if (!k || state !== 'running' || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    lightKey(k, true);
    if (e.repeat) return;
    if (k === 'left') setKey(-1, true); else if (k === 'right') setKey(1, true); else act(k);
  });
  window.addEventListener('keyup', function (e) {
    var k = KEYMAP[e.code];
    lightKey(k, false);
    if (k === 'left') setKey(-1, false); else if (k === 'right') setKey(1, false);
  });
  // If the page loses focus mid-move, stop sliding instead of getting stuck.
  function releaseKeys() { keys.left = keys.right = false; lastDir = 0; Object.keys(KEYBTN).forEach(function (k) { lightKey(k, false); }); }
  window.addEventListener('blur', releaseKeys);
  document.addEventListener('visibilitychange', function () { if (document.hidden) releaseKeys(); });

  // ---- update ----
  function update(dt) {
    var wantLabel = bar.pos < 0 ? 'Fill' : 'Load';
    if (wantLabel !== loadLabel) {                                        // at the tap the Load key fills the kettle
      loadLabel = wantLabel;
      el.load.querySelector('.face').lastChild.nodeValue = wantLabel;
      el.load.querySelector('.face use').setAttribute('href', wantLabel === 'Fill' ? '#i-drop' : '#i-down');
      el.load.setAttribute('aria-label', wantLabel === 'Fill' ? 'Fill the kettle at the tap' : 'Load the dripper under the kettle');
    }
    var dd = bar.drippers[bar.pos], want = state !== 'title' && dd && dd.state === 'pouring' ? 1 : 0;
    tilt += (want - tilt) * Math.min(1, dt * 14);                         // ease the tip forward and back
    shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt * 3); nudge = Math.max(0, nudge - dt);
    floaters.forEach(function (f) { f.y -= 26 * dt; f.life -= dt; });
    floaters = floaters.filter(function (f) { return f.life > 0; });

    if (state === 'running') {
      L.tick(bar, dt);
      if (buffered) {
        buffered.t -= dt;
        if (bar.lock <= 0) { var b = buffered; buffered = null; fire(b.kind); }
        else if (buffered.t <= 0) buffered = null;
      }
      var hd = heldDir();
      if (hd) {
        repeatT -= dt;
        if (repeatT <= 0 && L.move(bar, hd)) repeatT = HOLD_STEP;
        else if (repeatT <= 0 && bar.lock <= 0 && bar.moveCd <= 0) repeatT = HOLD_STEP;   // at the end of the bar: keep the rhythm
      }
      panel();
    } else if (state === 'failing') {
      timer -= dt;
      if (timer <= 0) showReview();
    }
    handleEvents();
    var target = cx(bar.pos);
    kx += (target - kx) * Math.min(1, dt * 18);
    canvas.style.transform = shake > 0 ? 'translate(' + (Math.random() * 6 - 3).toFixed(1) + 'px,' + (Math.random() * 6 - 3).toFixed(1) + 'px)' : '';
  }

  // ---- drawing (pixel art with fillRect) ----
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function text(str, x, y, size, color, align) {
    ctx.font = size + 'px ' + THEME.font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, Math.round(x), Math.round(y));
  }
  // Two-letter ticket code, skipping "The": Monkey Bite -> MB, The Optimist -> OP.
  function code(name) {
    var words = name.split(/\s+/).filter(function (w) { return w.toLowerCase() !== 'the'; });
    return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
  }

  function drawQueue(sec) {
    text('ORDERS', 8, 17, 8, THEME.blueLight, 'left');
    var full = bar.queue.length >= L.MAX_QUEUE, warn = full && Math.floor(sec * 4) % 2 === 0;
    for (var k = 0; k < L.MAX_QUEUE; k++) {
      var x = 66 + k * 38, y = 4;
      if (k >= bar.queue.length) { rect(x, y, 34, 22, THEME.floor); continue; }
      rect(x, y, 34, 22, k === 0 ? THEME.gold : (warn ? THEME.red : THEME.cream));
      rect(x + 1, y + 1, 32, 20, warn ? '#f4a89c' : THEME.cream);
      text(code(bar.queue[k].name), x + 17, y + 12, 8, THEME.ink, 'center');
      rect(x + 3, y + 15, 28, 5, THEME.floor);
      var rs = bar.queue[k].roast || 'medium';                                              // roast colour; a longer bar means longer waits
      rect(x + 3, y + 15, rs === 'light' ? 28 : rs === 'dark' ? 12 : 20, 5, THEME.roast[rs]);
    }
    // thin timer: how soon the next order lands
    var f = Math.max(0, Math.min(1, 1 - bar.nextOrder / bar.params.gap));
    rect(66, 29, 34 + 38 * 4, 2, THEME.floor);
    if (state === 'running') rect(66, 29, (34 + 38 * 4) * f, 2, THEME.blueLight);
  }

  function waterFrac(d) {
    if (d.state === 'pouring') return 0.45 + 0.5 * (1 - d.t / L.POUR_SECS);
    if (d.state === 'waiting') return 0.12 + 0.83 * (d.t / (d.pourNum === 1 ? d.t1 : d.t2));
    if (d.state === 'calling') return 0.1;
    if (d.state === 'drawdown') return 0.35 * (d.t / L.DRAWDOWN_SECS);
    return 0;
  }
  function serverFrac(d) {
    if (d.state === 'drawdown') return 0.5 + 0.5 * (1 - d.t / L.DRAWDOWN_SECS);
    if (d.state === 'pouring' || d.state === 'waiting' || d.state === 'calling') return 0.1 + 0.18 * (d.pourNum - 1) + (d.state === 'pouring' ? 0 : 0.1);
    return 0;
  }

  // Width of the glass server at row r (0 = top): narrow neck, waist, then a wide flared bottom. Always even so it centres on the pixel grid.
  function sw(r) {
    var w = r < 10 ? 20 - 4 * r / 10 : 16 + 18 * (r - 10) / (Y.serverH - 11);
    return 2 * Math.round(w / 2);
  }

  // One Kalita 185: flat-bottomed cone dripper on a glass server, with pour pips, a timer bar and a label.
  function drawSlot(i, sec) {
    var d = bar.drippers[i], x = cx(i), n, blink = false, col = THEME.gold;
    var calling = d.state === 'calling';
    if (calling) {
      col = d.red ? THEME.red : THEME.gold;
      blink = Math.floor(sec / (d.red ? 0.18 : 0.45)) % 2 === 0;
      if (blink) rect(x - 23, 96, 46, 142, d.red ? 'rgba(224,80,63,0.38)' : 'rgba(242,199,68,0.28)');
    } else if (d.state === 'ruined') {
      rect(x - 23, 96, 46, 142, 'rgba(224,80,63,0.3)');
    }
    rect(x - 20, Y.rim - 8, 40, 3, calling ? (blink ? col : THEME.goldDim) : d.state === 'empty' ? '#22353f' : THEME.metalDark);   // lamp strip

    // glass server: hourglass shape (narrow top, waist, wide flared bottom) with a handle, coffee collecting at the bottom
    var S = Y.server, r, w, sf = serverFrac(d), sh = Math.round(sf * Y.serverH);
    for (r = 0; r < Y.serverH; r++) rect(x - sw(r) / 2 - 1, S + r, sw(r) + 2, 1, THEME.ink);            // dark outline
    for (r = 0; r < Y.serverH; r++) rect(x - sw(r) / 2, S + r, sw(r), 1, THEME.glass);
    rect(x - sw(0) / 2, S, sw(0), 1, '#6f93a5');                                                         // lit rim
    for (r = 14; r < Y.serverH - 3; r++) rect(x - sw(r) / 2 + 2, S + r, 1, 1, 'rgba(255,255,255,0.22)');  // glass shine
    rect(x + sw(10) / 2, S + 10, 12, 2, THEME.handle); rect(x + 19, S + 10, 2, 20, THEME.handle);        // handle loop
    rect(x + sw(29) / 2 - 1, S + 28, 7, 2, THEME.handle);
    for (r = Y.serverH - 1; r >= Y.serverH - sh && r >= 0; r--) rect(x - sw(r) / 2 + 1, S + r, sw(r) - 2, 1, r === Y.serverH - sh ? THEME.coffeeDark : THEME.coffee);
    // a thin drip falling into the server while water is running through
    if (d.state === 'pouring' || d.state === 'waiting' || d.state === 'drawdown') {
      for (r = 3; r < Y.serverH - sh - 1; r += 4) rect(x, S + r + Math.floor(sec * 14) % 4, 1, 2, THEME.water);
    }

    // Kalita 185: a wide ceramic cone with a flat bottom and a side handle
    var filled = d.state !== 'empty' && d.state !== 'ruined';
    var wf = waterFrac(d), iw;
    rect(x + 14, Y.rim + 3, 11, 2, THEME.ceramic); rect(x + 22, Y.rim + 3, 3, 9, THEME.ceramic);          // handle loop
    rect(x + 14, Y.rim + 10, 11, 2, THEME.ceramicShade); rect(x + 23, Y.rim + 4, 2, 8, THEME.ceramicShade);
    for (r = 0; r < Y.coneH; r += 2) {
      w = Math.round(38 - 22 * r / Y.coneH);
      rect(x - w / 2, Y.rim + r, w, 2, r === 0 ? THEME.ceramicLight : THEME.ceramic);
      rect(x + w / 2 - 3, Y.rim + r, 3, 2, THEME.ceramicShade);                                        // shaded right wall
      iw = w - 6;
      if (r >= 2 && iw > 2) {
        var inWater = wf > 0 && r >= Y.coneH * (1 - wf), inBed = filled && r >= Y.coneH - 6;
        rect(x - w / 2 + 3, Y.rim + r, iw, 2, inWater ? THEME.water : inBed ? THEME.coffee : filled ? THEME.cream : '#5f7078');
      }
    }
    rect(x - 21, Y.rim - 2, 42, 3, THEME.ceramicLight);                                                // flared rim
    rect(x - 6, Y.rim + 6, 10, 1, THEME.ceramicShade); rect(x - 3, Y.rim + 7, 4, 1, THEME.ceramicShade);   // "Kalita" script
    rect(x - 14, Y.rim + Y.coneH, 28, 3, THEME.woodLight); rect(x - 14, Y.rim + Y.coneH + 2, 28, 1, THEME.wood);   // wooden ring the dripper sits on
    if (d.state === 'ruined') { text('X', x, Y.rim + 18, 16, THEME.red, 'center'); }

    // pour pips
    for (var k = 0; k < 3; k++) {
      var px = x - 18 + k * 13, done = k < d.pourNum && d.state !== 'empty' && d.state !== 'ruined';
      rect(px, Y.pips, 10, 8, done ? THEME.gold : THEME.ink);
      if (!done) rect(px + 1, Y.pips + 1, 8, 6, d.state === 'empty' ? '#1a2f3d' : THEME.blueDark);
    }

    // timer bar: time to the next call, or time left to answer a call
    rect(x - 20, Y.bar, 40, 6, THEME.ink);
    var bf = 0, bc = THEME.blueLight;
    if (d.state === 'waiting') bf = d.t / (d.pourNum === 1 ? d.t1 : d.t2);
    else if (calling) { bf = 1 - d.t / d.win; bc = col; }
    else if (d.state === 'drawdown') { bf = d.t / L.DRAWDOWN_SECS; bc = THEME.coffee; }
    else if (d.state === 'pouring') { bf = 1; bc = THEME.blueLight; }
    if (bf > 0) rect(x - 19, Y.bar + 1, Math.round(38 * Math.max(0, Math.min(1, bf))), 4, bc);

    // roast: colour strip under the timer bar, longer = longer waits (same as the ticket)
    if (d.coffee && d.state !== 'ruined') {
      var rs2 = d.coffee.roast || 'medium';
      rect(x - 20, Y.bar + 8, rs2 === 'light' ? 40 : rs2 === 'dark' ? 16 : 28, 3, THEME.roast[rs2]);
    }

    // label
    if (calling) { if (blink) text('GO ' + (d.pourNum + 1), x, Y.label, 8, col, 'center'); }
    else if (d.state === 'loaded') text('GO 1', x, Y.label, 8, THEME.cream, 'center');
    else if (d.coffee && d.state !== 'ruined') text(code(d.coffee.name), x, Y.label, 8, THEME.blueLight, 'center');

    // kettle marker
    if (i === bar.pos && state !== 'title') rect(x - 20, Y.mark, 40, 3, THEME.gold);
  }

  // The kettle is a flared-cone electric gooseneck on a square base, with a flat lid, wood knob and angled wood handle.
  // Drawn relative to the spout tip (which sits over the dripper). It always faces the same way: spout left, body right.
  // While pouring it lifts off its base and tips forward about the spout. The kettle is painted flat on a small
  // offscreen canvas, then turned with no smoothing, so the tilt keeps the crisp pixel look.
  var SPOUT = [[76,0,3],[77,1,2],[78,2,2],[79,3,2],[80,3,2],[81,4,2],[82,4,2],[83,5,2],[84,5,2],[85,5,2],[86,5,2],
    [87,6,2],[88,6,2],[89,6,2],[90,6,2],[91,7,2],[92,7,3],[93,8,4],[94,9,5]];
  var KS = 1.5, KB = 101;          // kettle scale, and the row its base sits on (just above the drippers)
  var KW = 72, KH = 44, KTIP_X = 4, KTIP_Y = 8;   // offscreen canvas size, and where the spout tip sits on it
  var TILT_MAX = 0.26, LIFT = 4;   // radians (about 15 degrees) and pixels lifted off the base at full tilt
  var kCv = document.createElement('canvas');
  kCv.width = KW; kCv.height = KH;
  var kCtx = kCv.getContext('2d');
  function drawKettle(sec) {
    var tx = Math.round(kx), d = bar.drippers[bar.pos];
    var pouring = d && d.state === 'pouring', wob = nudge > 0 ? Math.round(Math.sin(sec * 60) * 2) : 0;
    tx += wob;
    var ox = 0, oy = 0;
    // Rectangles are placed in the 1x design grid, then scaled, so neighbouring pieces never leave gaps.
    function ky(y) { return Math.round(KB - (KB - y) * KS); }
    function kr(dx, y, w, h, c) {
      var x0 = Math.round(dx * KS), x1 = Math.round((dx + w) * KS), y0 = ky(y);
      rect(ox + x0, oy + y0, x1 - x0, ky(y + h) - y0, c);
    }
    var K = THEME.kettle, tipY = ky(76), i, y;
    var lift = Math.round(tilt * LIFT), ang = -tilt * TILT_MAX;

    // base stays on the counter (you lift a Stagg off its base to pour)
    ox = tx; oy = 0;
    kr(8, 96, 24, 5, K.baseDark); kr(8, 96, 24, 1, K.shade);
    kr(27, 94, 5, 3, K.light); kr(27, 94, 5, 1, K.body);
    kr(10, 98, 3, 1, THEME.cream);

    // pour stream, falling from the tip into the dripper once the kettle has tipped
    if (pouring && tilt > 0.5) {
      var sy = tipY - lift + 2;
      for (y = sy; y < Y.rim - 2; y += 6) {
        var o = Math.floor((sec * 40) % 6), yy = Math.max(sy, y + o - 6);
        rect(tx, yy, 2, 4, THEME.water);
      }
    }

    // kettle: spout, flared body, lid, handle (painted flat first)
    var screen = ctx;
    ctx = kCtx; kCtx.clearRect(0, 0, KW, KH);
    ox = KTIP_X; oy = KTIP_Y - tipY;
    for (i = 0; i < SPOUT.length; i++) { kr(SPOUT[i][1], SPOUT[i][0], SPOUT[i][2], 1, K.body); kr(SPOUT[i][1], SPOUT[i][0], 1, 1, K.light); }
    for (y = 76; y < 96; y++) {                                      // body: narrow at the top, wide at the bottom
      var hw = Math.round(6 + (y - 76) / 20 * 3.5), left = 20 - hw, w = hw * 2;
      kr(left, y, w, 1, K.body);
      kr(left, y, 2, 1, K.light);                                    // lit left edge
      kr(left + w - 3, y, 3, 1, K.shade);                            // shaded right edge
    }
    kr(14, 75, 12, 2, K.light); kr(14, 76, 12, 1, K.shade);          // lid
    kr(17, 72, 6, 3, THEME.wood); kr(17, 72, 6, 1, THEME.woodLight);   // wood knob
    kr(26, 79, 3, 4, K.shade);                                       // green collar
    kr(28, 80, 3, 2, THEME.wood); kr(29, 79, 3, 2, THEME.wood); kr(30, 78, 3, 2, THEME.wood);   // wood handle: up and out...
    for (y = 77; y <= 91; y++) {                                     // ...then down to the right
      var hx = 32 + Math.round((y - 77) * 0.43);
      kr(hx, y, 3, 1, THEME.wood); kr(hx, y, 1, 1, THEME.woodLight);
    }
    ctx = screen;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (tilt < 0.02) ctx.drawImage(kCv, tx - KTIP_X, tipY - KTIP_Y);
    else { ctx.translate(tx, tipY - lift); ctx.rotate(ang); ctx.drawImage(kCv, -KTIP_X, -KTIP_Y); }
    ctx.restore();
  }

  // The water tap at the left end of the bar: a hot-water urn with a pipe up to a faucet that hangs over the kettle's lid.
  function drawTap(sec) {
    var tx = cx(-1), fx = tx + 30, here = bar.pos < 0, low = bar.water <= 2;
    rect(tx - 21, 124, 36, 55, THEME.ink); rect(tx - 20, 125, 34, 53, THEME.blueDark); rect(tx - 20, 125, 6, 53, THEME.blue);   // urn
    rect(tx - 14, 120, 22, 5, THEME.metal);                                                                                   // urn cap
    rect(tx - 6, 140, 16, 26, THEME.ink); rect(tx - 5, 141, 14, 24, '#1d3d4f');                                               // level window
    rect(tx - 5, 141 + 12, 14, 12, THEME.water); rect(tx - 5, 153, 14, 2, THEME.blueLight);
    rect(tx - 12, 46, 4, 74, THEME.metalDark); rect(tx - 12, 46, 2, 74, THEME.metal);                                        // pipe up the wall
    rect(tx - 12, 42, 46, 4, THEME.metalDark); rect(tx - 12, 42, 46, 2, THEME.metal);                                        // arm over the kettle
    rect(fx - 3, 46, 7, 4, THEME.metal); rect(fx - 1, 50, 3, 3, THEME.metalDark);                                            // faucet
    if (bar.fillT > 0 && here) {
      for (var yy = 53; yy < 58; yy += 3) rect(fx - 1 + (Math.floor(sec * 30 + yy) % 2), yy, 2, 2, THEME.water);
    }
    var blink = low && Math.floor(sec * 4) % 2 === 0;
    text('FILL', tx, Y.label, 8, here ? THEME.gold : blink ? THEME.red : THEME.blueLight, 'center');
    if (here && state !== 'title') rect(tx - 20, Y.mark, 40, 3, THEME.gold);
  }

  // How much water is left in the kettle: one pip per pour, flashing red when nearly dry.
  function drawWater(sec) {
    var low = bar.water <= 2 && state === 'running', blink = low && Math.floor(sec * 4) % 2 === 0, x0 = W - 8 - (L.KETTLE_CAP * 7 - 2);
    text('WATER', W - 8, 15, 8, blink ? THEME.red : THEME.blueLight, 'right');
    for (var k = 0; k < L.KETTLE_CAP; k++) rect(x0 + k * 7, 19, 5, 7, k < bar.water ? (low ? THEME.red : THEME.water) : THEME.floor);
  }

  function draw(sec) {
    ctx.clearRect(0, 0, W, H);
    rect(0, 0, W, H, THEME.wall);
    rect(0, 0, W, 3, THEME.wall2);
    rect(0, 34, W, 2, THEME.wall2);
    drawQueue(sec);
    drawWater(sec);
    rect(0, Y.floor, W, H - Y.floor, THEME.floor);
    drawTap(sec);
    for (var i = 0; i < bar.drippers.length; i++) drawSlot(i, sec);
    rect(0, Y.counter, W, 12, THEME.wood); rect(0, Y.counter, W, 3, THEME.woodLight);        // counter top
    drawKettle(sec);
    floaters.forEach(function (f) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 2));
      text(f.text, f.x, f.y, 10, f.color, 'center');
      ctx.globalAlpha = 1;
    });
    if (flash > 0) rect(0, 0, W, H, 'rgba(255,255,255,' + (flash * 0.4).toFixed(2) + ')');
  }

  // ---- main loop ----
  var lastTs = 0;
  function frame(ts) {
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0); lastTs = ts;
    update(dt); draw(ts / 1000);
    requestAnimationFrame(frame);
  }
  kx = cx(0);
  hud(); panel();
  requestAnimationFrame(frame);

  // Test hook (drive and read the game from automated checks)
  window.__pour = {
    advance: function (sec) { while (sec > 0) { var d = Math.min(0.05, sec); update(d); sec -= d; } draw(performance.now() / 1000); },
    act: act, setKey: setKey,
    get bar() { return bar; },
    get: function () {
      return { state: state, level: bar.level, water: bar.water, served: bar.served, points: bar.points, strikes: bar.strikes, pos: bar.pos, queue: bar.queue.length,
        drippers: bar.drippers.map(function (d) { return { state: d.state, pourNum: d.pourNum, red: d.red }; }), lastReason: bar.lastReason };
    }
  };
})();
