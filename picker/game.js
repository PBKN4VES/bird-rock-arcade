// Cherry Picker: drawing, input, sound and screens. The rules live in logic.js.
(function () {
  'use strict';

  var L = window.PickerLogic;

  // Colors and font in one place so tweaks are easy. (Same palette as the other games, and the same cherries as Cherry Catch.)
  var THEME = {
    font: "'Press Start 2P', ui-monospace, monospace",
    ink: '#0f1c26', blue: '#4298B5', blueDark: '#2c6a80', blueLight: '#9ad0e3',
    cream: '#f6edd6', gold: '#f2c744', red: '#e0503f'
  };
  var CHERRY = { green: '#6aa84f', yellow: '#f2c744', orange: '#f08a24', red: '#e0503f', overripe: '#5a2d3d' };
  var SHADE = { green: '#4a7d36', yellow: '#c79a1c', orange: '#b8601a', red: '#a82f24', overripe: '#35182a' };
  var ART = {
    outline: '#140f0c', leaf: '#3f7d44', leafHi: '#6bb35e', stem: '#5b3b1e',
    bark: '#7a5230', barkHi: '#9b6f43', barkShade: '#4f3320',
    bird: '#1d2a33', birdHi: '#3b4f5e', beak: '#f08a24', belly: '#e9e4d2'
  };
  // The hillside, one cooler-to-warmer green per tier (high is cooler and bluer, low is warmer).
  var HILL = {
    high: { base: '#2f6b5e', top: '#4a8c78', dot: '#3b7f6c' },
    mid:  { base: '#3d7a45', top: '#5a9a52', dot: '#4a8d4c' },
    low:  { base: '#5c8a3a', top: '#7aa84a', dot: '#6c9a42' }
  };
  var BAND_TOP = { high: 66, mid: 140, low: 218 };
  var TIER_IDS = L.TIERS.map(function (t) { return t.id; });          // high, mid, low: one list for every loop below
  function nextTier(tier) { return TIER_IDS[TIER_IDS.indexOf(tier) + 1] || null; }
  var SKY = ['#3b8fae', '#4298B5', '#58a8c2', '#73b9d0', '#9ad0e3'];

  var W = L.W, H = L.H;
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    points: $('points'), best: $('best'), time: $('time'), combo: $('combo'), banner: $('banner'), hint: $('hint'), status: $('status'),
    title: $('title'), over: $('over'), start: $('start'), again: $('again'), sound: $('sound'), contrast: $('contrast'),
    score: $('score'), newBest: $('new-best'), rank: $('rank'), stats: $('review-stats'), practice: $('practice')
  };

  // ---- feel-test switches (read once at load). Any of them makes the run "practice": no best score is saved. ----
  // ?birds=0  ?speed=1.3 (faster ripening)  ?t=45 (start 45 s into the ramp: a 15-second round of the frantic end)
  var query = window.location.search;
  // A value must be a plain number (3 or 1.3) followed by "&" or the end; anything else (".", "1.2.3", "05x") is ignored.
  function readNum(name) {
    var m = new RegExp('[?&]' + name + '=([0-9]+(?:\\.[0-9]+)?)(?:&|$)').exec(query);
    return m ? parseFloat(m[1]) : null;
  }
  var SW = { birds: !/[?&]birds=0(?:&|$)/.test(query), speed: readNum('speed'), t: readNum('t') };
  // ?caw=A to E picks the caw version (see caw.html); not a practice switch.
  var CAW = (/[?&]caw=([A-Ea-e])/.exec(query) || [0, 'A'])[1].toUpperCase();
  // ?debug=1 turns on the window.__picker test hook (bottom of this file). It can force cherries red, so it also makes the run practice.
  var DEBUG = /[?&]debug=1(?:&|$)/.test(query);
  var practice = !SW.birds || SW.speed !== null || SW.t !== null || DEBUG;

  // ---- game state ----
  var state = 'title';             // title | running | over
  var world = newRun();
  var sec = 0, shake = 0, flash = 0;
  var particles = [], floaters = [], rings = [], flyers = [], bandFlash = { high: 0, mid: 0, low: 0 };
  var order = L.SLOTS.map(function (s, i) { return i; }).sort(function (a, b) { return L.SLOTS[a].x - L.SLOTS[b].x || L.SLOTS[a].y - L.SLOTS[b].y; });
  var sel = 0, selShown = false;   // keyboard selection (an index into `order`); the ring shows after the first arrow press
  var warned15 = false, lastTick = -1, birdHit = {}, hover = null;      // birdHit: seconds left of each bird's white hit-flash, by bird id
  var startBest = 0, best = readBest();
  var soundOn = true, ac = null;   // on by default; the browser only starts audio after the first tap (Start)
  var contrast = readContrast();
  var bannerTimeout = 0;
  var hudCache = {};
  var app = $('app');
  // While a card (title or end) is up, the game page behind it is switched off so Tab and screen readers stay on the card.
  function setCardOpen(open) { app.inert = open; }
  function clearHover() { hover = null; canvas.style.cursor = ''; }

  function newRun() {
    var o = { rng: Math.random, birds: SW.birds };
    if (SW.speed !== null) o.speedScale = SW.speed;
    if (SW.t !== null) o.startT = SW.t;
    return L.newWorld(o);
  }
  function readBest() {
    try { return parseInt(localStorage.getItem('picker.bestScore'), 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) { try { localStorage.setItem('picker.bestScore', String(v)); } catch (e) { /* private mode */ } }
  function readContrast() {
    try { return localStorage.getItem('picker.contrast') === '1'; } catch (e) { return false; }
  }
  function saveContrast(v) { try { localStorage.setItem('picker.contrast', v ? '1' : '0'); } catch (e) { /* private mode */ } }

  // ---- sound (tiny synth, no files) ----
  function ensureAudio() {
    if (!ac) { var A = window.AudioContext || window.webkitAudioContext; if (A) { ac = new A(); PickerCaw.loadSamples(ac); } }
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
  var CHIME = [523, 587, 659, 784, 880];   // a pentatonic climb: each red in a row rings higher
  function sfx(name, arg) {
    if (!soundOn) return;
    ensureAudio();
    if (name === 'start') { tone(440, 0.08, 'square', 0.06); tone(660, 0.12, 'square', 0.06, 0.08); }
    else if (name === 'pick') { var f = CHIME[Math.max(0, Math.min(CHIME.length - 1, (arg || 1) - 1))]; tone(f, 0.07, 'square', 0.06); tone(f * 2, 0.12, 'square', 0.05, 0.06); }
    else if (name === 'perfect') { [1319, 1568, 2093].forEach(function (f2, i) { tone(f2, 0.08, 'triangle', 0.05, 0.1 + i * 0.05); }); }
    else if (name === 'bad') { noise(0.16, 0.25); tone(150, 0.25, 'sawtooth', 0.06, 0, 70); }
    else if (name === 'leaf') { tone(220, 0.1, 'triangle', 0.02, 0, 120); }
    else if (name === 'warn') {                                                   // caw, caw: a bird has landed
      if (!PickerCaw.sample(ac, 'caw1', 0, 0.8)) PickerCaw.play(ac, CAW, 0, 0.45);
      if (!PickerCaw.sample(ac, 'caw2', 0.55, 0.8)) PickerCaw.play(ac, CAW, 0.4, 0.45);
    }
    else if (name === 'scare') { if (!PickerCaw.sample(ac, 'caw3', 0, 0.85, 1.15)) PickerCaw.play(ac, CAW, 0, 0.5, { pitch: 1.2, len: 0.6 }); }   // a quick, startled caw
    else if (name === 'steal') { if (!PickerCaw.sample(ac, 'caw4', 0, 0.9, 0.9)) PickerCaw.play(ac, CAW, 0, 0.55, { pitch: 0.85, len: 1.6 }); }   // a long, low caw: it got the cherry
    else if (name === 'overripe') { tone(180, 0.14, 'triangle', 0.05, 0, 110); }
    else if (name === 'tick') { tone(1000, 0.05, 'square', 0.04); }
    else if (name === 'fanfare') { [523, 659, 784, 1047, 1319].forEach(function (f3, i) { tone(f3, 0.14, 'square', 0.06, i * 0.09); }); tone(1568, 0.3, 'triangle', 0.06, 0.45); }
  }
  el.sound.addEventListener('click', function () {
    soundOn = !soundOn;
    el.sound.setAttribute('aria-pressed', String(soundOn));
    el.sound.textContent = 'Sound: ' + (soundOn ? 'on' : 'off');
    if (soundOn) { ensureAudio(); sfx('start'); }
  });
  function applyContrast() {
    el.contrast.setAttribute('aria-pressed', String(contrast));
    el.contrast.textContent = 'High contrast: ' + (contrast ? 'on' : 'off');
    document.body.classList.toggle('contrast', contrast);
  }
  el.contrast.addEventListener('click', function () { contrast = !contrast; saveContrast(contrast); applyContrast(); });
  applyContrast();

  // ---- flow ----
  function say(msg) { el.status.textContent = msg; }
  function banner(text, bad) {
    el.banner.textContent = text;
    el.banner.className = 'banner show' + (bad ? ' bad' : '');
    clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(function () { el.banner.className = 'banner'; }, 1500);
  }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function setText(node, key, value) { if (hudCache[key] !== value) { hudCache[key] = value; node.textContent = value; } }
  function hud() {
    setText(el.points, 'points', fmt(world.score));
    setText(el.best, 'best', fmt(best));
    setText(el.time, 'time', String(Math.max(0, Math.ceil(world.timeLeft - 1e-9))));
    var c = world.combo > 1 ? 'x' + world.combo : '';      // the multiplier the NEXT red will get; blank at x1
    setText(el.combo, 'combo', c);
    var cls = 'combo' + (world.combo >= 5 ? ' c5' : world.combo >= 3 ? ' c3' : '');
    if (hudCache.comboCls !== cls) { hudCache.comboCls = cls; el.combo.className = cls; }
    var label = world.combo > 1 ? 'Next red worth times ' + world.combo : 'No combo';
    if (hudCache.comboLabel !== label) { hudCache.comboLabel = label; el.combo.setAttribute('aria-label', label); }
  }

  function startRun() {
    world = newRun();
    startBest = best;
    particles = []; floaters = []; rings = []; flyers = []; bandFlash = { high: 0, mid: 0, low: 0 };
    shake = 0; flash = 0; warned15 = false; lastTick = -1; sel = 0; selShown = false;
    el.title.hidden = true; el.over.hidden = true;
    setCardOpen(false); clearHover(); birdHit = {};
    state = 'running';
    ensureAudio();
    sfx('start');
    hudCache = {};
    hud();
    say('Harvest day. You have ' + Math.ceil(world.timeLeft) + ' seconds. Pick the red cherries.');
  }

  function burst(x, y, n, colors) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 90;
      particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.5 + Math.random() * 0.4, c: colors[i % colors.length], s: 3 });
    }
  }
  function floater(x, y, text, color) { floaters.push({ x: Math.max(24, Math.min(W - 24, x)), y: y - 10, text: text, color: color, life: 0.9 }); }

  // What a click, tap or key did. Same path for all of them.
  function handleAction(ev) {
    if (!ev) return;
    clearHover();                      // the cherry or bird under the pointer may be gone now; the next mouse move sets it again
    if (ev.type === 'pick') {
      if (ev.stage === 'red') {
        sfx('pick', ev.mult);
        burst(ev.x, ev.y, 10, ['#e0503f', '#f6edd6', '#f2c744']);
        rings.push({ x: ev.x, y: ev.y, r: 8, life: 0.3 });
        floater(ev.x, ev.y, '+' + ev.points, THEME.cream);
        if (ev.perfect) { sfx('perfect'); floater(ev.x, ev.y - 12, 'PERFECT', THEME.gold); }
      } else {
        sfx('bad');
        burst(ev.x, ev.y, 8, [CHERRY[ev.stage], SHADE[ev.stage]]);
        floater(ev.x, ev.y, ev.delta < 0 ? String(ev.delta) : 'OOPS', THEME.red);   // the real loss (the score can't go below 0)
        shake = Math.max(shake, 0.18);
      }
    } else if (ev.type === 'scare' && ev.partial) {            // a tough bird: it only hops back, and needs another tap
      sfx('scare');
      burst(ev.x, ev.y, 10, ['#ffffff', '#e9e4d2', '#1d2a33']);
      rings.push({ x: ev.x, y: ev.y, r: 6, life: 0.3 });
      floater(ev.x, ev.y - 6, 'AGAIN!', THEME.gold);
      flash = Math.max(flash, 0.2); shake = Math.max(shake, 0.06);
      birdHit[ev.id] = 0.2;
      try { if (navigator.vibrate) navigator.vibrate(20); } catch (e) { /* not supported (iPhones) */ }
      say('The bird hopped back. Tap it again.');
    } else if (ev.type === 'scare') {
      sfx('scare');
      burst(ev.x, ev.y, 18, ['#ffffff', '#e9e4d2', '#3b4f5e', '#1d2a33']);
      rings.push({ x: ev.x, y: ev.y, r: 6, life: 0.35 }); rings.push({ x: ev.x, y: ev.y, r: 15, life: 0.3 });
      floater(ev.x, ev.y - 6, 'SHOO!', THEME.gold);
      flash = Math.max(flash, 0.4); shake = Math.max(shake, 0.1);
      flyers.push({ x: ev.x, y: ev.y, vx: (ev.x < W / 2 ? 1 : -1) * 70, vy: -60, life: 0.9, age: 0 });
      try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) { /* not supported (iPhones) */ }
      say('Bird shooed away.');
    }
    hud();
  }

  // What the game itself did while time passed.
  function onEvents(events) {
    events.forEach(function (e) {
      if (e.type === 'warn') {
        sfx('warn'); bandFlash[e.tier] = 1.2;
        banner('BIRD!', true);
        say('A bird landed on the ' + e.tier + ' branch.');
      } else if (e.type === 'steal') {
        sfx('steal');
        burst(e.x, e.y, 14, ['#e0503f', '#e9e4d2', '#1d2a33']);
        floater(e.x, e.y, 'STOLEN!', THEME.red);
        flyers.push({ x: e.bx, y: e.by, vx: (e.bx < W / 2 ? -1 : 1) * 60, vy: -55, life: 1.1, loot: true });
        shake = Math.max(shake, 0.12);
        say('The bird stole a cherry.');
      } else if (e.type === 'overripe') {
        sfx('overripe');
        if (e.comboReset) floater(L.SLOTS[e.slot].x, L.SLOTS[e.slot].y, 'MISSED', THEME.blueLight);
      } else if (e.type === 'drop') {
        particles.push({ x: L.SLOTS[e.slot].x - 3, y: L.SLOTS[e.slot].y, vx: 0, vy: 10, life: 1.0, c: CHERRY.overripe, s: 6 });
      } else if (e.type === 'grow') {
        sfx('leaf');
      } else if (e.type === 'over') {
        endRound();
      }
    });
    // clock cues
    if (state === 'running' && world.ready <= 0) {
      if (!warned15 && world.timeLeft <= 15) { warned15 = true; banner('LAST 15 SECONDS!'); say('15 seconds left.'); }
      var whole = Math.ceil(world.timeLeft - 1e-9);
      if (whole <= 5 && whole >= 1 && whole !== lastTick) { lastTick = whole; sfx('tick'); }
    }
    hud();
  }

  function endRound() {
    state = 'over';
    sfx('fanfare');
    var isBest = !practice && world.score > 0 && world.score > startBest;
    if (!practice && world.score > best) { best = world.score; saveBest(best); }
    var rank = L.rankFor(world.score);
    el.score.textContent = fmt(world.score);
    el.newBest.hidden = !isBest;
    el.rank.textContent = 'Rank: ' + rank;
    el.stats.textContent = 'Cherries picked: ' + world.picked + '. Perfect: ' + world.perfects + '. Best combo: x' + world.bestCombo + '.';
    el.practice.hidden = !practice;
    el.again.disabled = true;
    el.over.hidden = false;
    setCardOpen(true); clearHover();
    if (window.ShareCard) ShareCard.show({ game: 'picker', score: world.score, line: rank, practice: practice, mount: document.getElementById('share') });
    if (window.Leaderboard) Leaderboard.show({ game: 'picker', score: world.score, practice: practice, mount: document.getElementById('lb') });
    setTimeout(function () { el.again.disabled = false; if (!(window.Leaderboard && Leaderboard.typing())) el.again.focus(); }, 500);   // stops a stray tap from skipping the card
    hud();
    say('Harvest over. Score ' + world.score + '. ' + rank + '. ' + el.stats.textContent);
  }

  // ---- input ----
  el.start.addEventListener('click', startRun);
  el.again.addEventListener('click', startRun);
  // A mouse or trackpad is less precise than a finger, so those clicks get bigger targets (see MOUSE_HIT_R in logic.js).
  function canvasPoint(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  function isMouse(e) { return e.pointerType === 'mouse' || e.pointerType === 'pen'; }
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (state !== 'running') return;
    var pt = canvasPoint(e), mouse = isMouse(e);
    var ev = L.tapAt(world, pt.x, pt.y, { mouse: mouse });
    if (ev) handleAction(ev);
    else if (world.ready <= 0 && !world.over) rings.push({ x: pt.x, y: pt.y, r: 3, life: 0.2 });   // an empty tap costs nothing; just a small ripple
  });
  canvas.addEventListener('pointermove', function (e) {          // mouse only: highlight what a click would hit
    if (state !== 'running' || !isMouse(e)) { clearHover(); return; }
    var pt = canvasPoint(e);
    hover = world.ready > 0 ? null : L.targetAt(world, pt.x, pt.y, { mouse: true });
    canvas.style.cursor = hover ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', clearHover);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('keydown', function (e) {
    if (state !== 'running') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;                       // leave browser shortcuts (Cmd+D, Ctrl+S ...) alone
    var k = e.code;
    if ((k === 'Space' || k === 'Enter') && e.target && e.target.closest && e.target.closest('button')) return;   // let the Sound and High contrast buttons work
    if (k === 'ArrowLeft' || k === 'KeyA') { e.preventDefault(); sel = selShown ? (sel + order.length - 1) % order.length : sel; selShown = true; }
    else if (k === 'ArrowRight' || k === 'KeyD') { e.preventDefault(); sel = selShown ? (sel + 1) % order.length : sel; selShown = true; }
    else if (k === 'ArrowUp' || k === 'KeyW' || k === 'ArrowDown' || k === 'KeyS') {   // jump to the nearest cherry in the row above or below
      e.preventDefault();
      if (!selShown) { selShown = true; return; }
      var cur = L.SLOTS[order[sel]], ti = TIER_IDS.indexOf(cur.tier) + (k === 'ArrowUp' || k === 'KeyW' ? -1 : 1);
      if (ti < 0 || ti >= TIER_IDS.length) return;
      var bestI = -1, bestD = Infinity;
      order.forEach(function (si, oi) { var d = Math.abs(L.SLOTS[si].x - cur.x); if (L.SLOTS[si].tier === TIER_IDS[ti] && d < bestD) { bestD = d; bestI = oi; } });
      if (bestI >= 0) sel = bestI;
    } else if (k === 'Space' || k === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      if (!selShown) { selShown = true; return; }       // the first press just shows the ring
      handleAction(L.pickSlot(world, order[sel]));
    } else if (k === 'KeyB') {
      e.preventDefault();
      if (!e.repeat) handleAction(L.scareBird(world));
    }
  });

  // ---- update ----
  function update(dt) {
    sec += dt;
    shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt * 3); Object.keys(birdHit).forEach(function (id) { birdHit[id] = Math.max(0, birdHit[id] - dt); });
    TIER_IDS.forEach(function (k) { bandFlash[k] = Math.max(0, bandFlash[k] - dt); });
    floaters.forEach(function (f) { f.y -= 22 * dt; f.life -= dt; });
    floaters = floaters.filter(function (f) { return f.life > 0; });
    particles.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 380 * dt; p.life -= dt; });
    particles = particles.filter(function (p) { return p.life > 0 && p.y < H + 4; });
    rings.forEach(function (r) { r.r += 60 * dt; r.life -= dt; });
    rings = rings.filter(function (r) { return r.life > 0; });
    flyers.forEach(function (f) { f.age = (f.age || 0) + dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy -= 20 * dt; f.life -= dt; });
    flyers = flyers.filter(function (f) { return f.life > 0; });
    if (state === 'running') onEvents(L.stepWorld(world, dt));      // stepWorld already splits big steps into 1/60 s pieces
    canvas.style.transform = shake > 0 ? 'translate(' + (Math.random() * 4 - 2).toFixed(1) + 'px,' + (Math.random() * 4 - 2).toFixed(1) + 'px)' : '';
  }

  // ---- drawing (pixel art with fillRect) ----
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function disc(cx, cy, r, c) {
    ctx.fillStyle = c;
    for (var y = -r; y <= r; y++) { var w = Math.floor(Math.sqrt(r * r - y * y)); ctx.fillRect(Math.round(cx) - w, Math.round(cy) + y, w * 2 + 1, 1); }
  }
  // A hollow ring between radii r2 (inner) and r1 (outer).
  function ring(cx, cy, r1, r2, c) {
    ctx.fillStyle = c;
    for (var y = -r1; y <= r1; y++) {
      var wo = Math.floor(Math.sqrt(r1 * r1 - y * y)), wi = Math.abs(y) < r2 ? Math.floor(Math.sqrt(r2 * r2 - y * y)) : -1;
      if (wi < 0) ctx.fillRect(Math.round(cx) - wo, Math.round(cy) + y, wo * 2 + 1, 1);
      else { ctx.fillRect(Math.round(cx) - wo, Math.round(cy) + y, wo - wi, 1); ctx.fillRect(Math.round(cx) + wi + 1, Math.round(cy) + y, wo - wi, 1); }
    }
  }
  function text(str, x, y, size, color, align) {
    ctx.font = size + 'px ' + THEME.font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, Math.round(x), Math.round(y));
  }
  function shadowText(str, x, y, size, color, align) {
    text(str, x + 1, y + 1, size, THEME.ink, align); text(str, x, y, size, color, align);
  }
  function hash(n) { n = Math.imul((n | 0) + 0x9e3779b9, 0x85ebca6b); n ^= n >>> 15; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 13; return n >>> 0; }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  // ---- the scenery: a coffee mountainside ----
  // Drawn once into an offscreen canvas (it never changes); drawClouds() and everything that moves are drawn on top each frame.
  var SLOPE = 12;                                      // each terrace rises this many px from left to right, so it reads as a slope
  var WALL = { face: '#7a5c3e', dark: '#5b4530', stone: '#8d6d4b' };
  var LEAF = { dark: '#2a6636', main: '#3b8444', hi: '#86cf72', rim: '#143a22' };
  var bg = document.createElement('canvas'); bg.width = W; bg.height = H;
  var bgCtx = bg.getContext('2d');
  function topAt(tier, x) { return BAND_TOP[tier] - SLOPE * (x / W); }
  function branchY(tier, x) {
    var pts = L.BRANCH_PATHS[tier], k;
    for (k = 1; k < pts.length - 1 && x > pts[k].x; k++) { /* find the segment */ }
    var a = pts[k - 1], b = pts[k], f = b.x === a.x ? 0 : Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
    return a.y + (b.y - a.y) * f;
  }
  // A forested green mountain with angular, faceted ridgelines (the Colombian coffee hills): the outline is a few straight runs with
  // kinks, a lumpy tree-line along the top, lit left side and shaded right side, clumps of dark and light canopy, and pale green
  // clearings (farms) on the slope. pts is the ridgeline as [x, y] corners; peakX is where light turns to shade;
  // clearings are [x, y, width, dir] where dir -1 rises to the right and +1 falls to the right, following the slope.
  var HILL_A = { lit: '#3f8f52', shade: '#2a6b45', dark: '#1f5638', hi: '#62b064', clear: '#a3d06b', clearLo: '#7fb556' };
  var HILL_B = { lit: '#5aa076', shade: '#427f60', dark: '#33704f', hi: '#7dbb8a', clear: '#b0d780', clearLo: '#8cc062' };
  function ridgeY(pts, x) {
    for (var k = 1; k < pts.length; k++) {
      if (x <= pts[k][0] || k === pts.length - 1) { var a = pts[k - 1], b = pts[k]; return a[1] + (b[1] - a[1]) * clamp01((x - a[0]) / (b[0] - a[0])); }
    }
    return pts[0][1];
  }
  function hill(pts, peakX, c, clearings) {
    var bottom = 96, edge = peakX + 8, peakTop = ridgeY(pts, peakX), x, k;
    for (x = pts[0][0]; x <= pts[pts.length - 1][0]; x++) {
      var top = Math.round(ridgeY(pts, x) - hash(x * 7 + peakX) % 2);
      if (top >= bottom) continue;
      // Light comes from the upper left: the sunlit face is a wedge under the ridge on the left, and everything right of the peak is shaded.
      var shadeFrom = x > edge ? top : Math.min(bottom, Math.max(top, Math.round(peakTop + 6 + (edge - x) * 2.2 + hash(x * 31 + peakX) % 2)));
      rect(x, top, 1, shadeFrom - top, c.lit); rect(x, shadeFrom, 1, bottom - shadeFrom, c.shade);
      if (shadeFrom > top) rect(x, top, 1, 1, c.hi);                                                // sunlit tree-line
      for (k = 0; k < 3; k++) {                                                                     // canopy clumps
        var v = hash(x * 13 + k * 101 + peakX), y = top + 3 + v % Math.max(1, bottom - top - 3), inShade = y >= shadeFrom;
        rect(x, y, 2, 2, v % 3 === 0 ? (inShade ? c.shade : c.hi) : c.dark);
      }
    }
    (clearings || []).forEach(function (cl) {                                                       // pale farm clearings
      for (var i = 0; i < cl[2]; i++) {
        var yy = cl[1] + cl[3] * Math.floor(i / 3), edgeIn = (i < 2 || i > cl[2] - 3) ? 1 : 0;
        rect(cl[0] + i, yy + edgeIn, 1, 3 - edgeIn, c.clear); rect(cl[0] + i, yy + 3, 1, 1, c.clearLo);
      }
    });
  }

  // A small hillside town (the church with twin towers, cream and terracotta houses), like the one in the reference photo.
  // (x, y) is the left end of the street, y is the ground line.
  function town(x, y) {
    var WALLS = ['#efe3c8', '#e6d3a4', '#d9b99b', '#f3ecd9'], ROOFS = ['#c4623a', '#a8502f', '#d27a4a'];
    [[0, 6, 4], [7, 5, 5], [13, 6, 4], [28, 5, 5], [34, 7, 4], [42, 5, 4]].forEach(function (h, i) {   // houses: [dx, width, height]
      rect(x + h[0], y - h[2], h[1], h[2], WALLS[i % WALLS.length]);
      rect(x + h[0], y - h[2] - 1, h[1], 1, ROOFS[(i * 2 + 1) % ROOFS.length]);
      rect(x + h[0] + 1, y - 2, 1, 1, '#5b4530');                                                       // a little door or window
    });
    var cx = x + 19;                                                                                    // the church
    rect(cx, y - 6, 9, 6, '#f3ecd9'); rect(cx, y - 7, 9, 1, '#a8502f');
    rect(cx, y - 13, 3, 7, '#f3ecd9'); rect(cx + 6, y - 13, 3, 7, '#f3ecd9');                          // two towers
    rect(cx, y - 15, 3, 2, '#f6f2e6'); rect(cx + 6, y - 15, 3, 2, '#f6f2e6');                          // white spires
    rect(cx + 1, y - 16, 1, 1, '#f6f2e6'); rect(cx + 7, y - 16, 1, 1, '#f6f2e6');
    rect(cx + 4, y - 4, 1, 4, '#5b4530');                                                               // the door
    rect(cx + 1, y - 11, 1, 2, '#5b4530'); rect(cx + 7, y - 11, 1, 2, '#5b4530');                      // tower windows
  }

  // Foreground: big glossy banana-type leaves arching in from the bottom corners (drawn behind the cherries, so they never hide one).
  // (x, y) is the stem end; len is how far it reaches (dir +1 right, -1 left); arch is how high it bows; w is its widest.
  var BANANA = { dark: '#2a6636', main: '#4a9a3e', hi: '#8fd06a', rim: '#143a22', rib: '#cfe9a0' };
  function bananaLeaf(x, y, len, tipRise, arch, w, dir) {
    var i;
    for (i = 0; i <= len; i++) {
      var t = i / len, cx = x + dir * i, cy = Math.round(y - tipRise * t - arch * Math.sin(Math.PI * t));
      var hw = Math.max(1, Math.round(w / 2 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7)));
      rect(cx, cy - hw - 1, 1, 1, BANANA.rim); rect(cx, cy + hw + 1, 1, 1, BANANA.rim);                 // outline
      rect(cx, cy - hw, 1, hw + 1, BANANA.main); rect(cx, cy + 1, 1, hw, BANANA.dark);                  // lit top half, shaded underside
      rect(cx, cy - hw, 1, 1, BANANA.hi);
      rect(cx, cy, 1, 1, BANANA.rib);                                                                   // the midrib
      if (i % 5 === 2 && hw > 2) { rect(cx + dir, cy - 1, 1, 1, BANANA.rib); rect(cx + dir * 2, cy - 2, 1, 1, BANANA.rib); rect(cx + dir, cy + 2, 1, 1, BANANA.dark); }   // side veins
    }
  }
  function drawSceneryStatic() {
    for (var i = 0; i < SKY.length; i++) rect(0, i * 18, W, 18, SKY[i]);
    disc(214, 20, 9, '#f6edd6'); disc(214, 20, 7, THEME.gold);                                     // sun
    for (var x = 0; x < W; x += 2) { var h = 20 + Math.abs(Math.sin(x * 0.045)) * 18 + Math.sin(x * 0.13) * 4; rect(x, 84 - h, 2, h + 14, '#7fb3a0'); }   // far, hazy blue-green ridge
    hill([[116, 96], [140, 64], [160, 46], [178, 33], [196, 27], [212, 38], [230, 50], [250, 72]], 196, HILL_B, [[214, 49, 22, 1]]);   // the farther hill, hazier
    hill([[-10, 92], [16, 52], [30, 39], [52, 21], [70, 11], [88, 27], [106, 34], [122, 46], [142, 64], [156, 96]], 70, HILL_A,    // the nearer, bigger hill
      [[34, 46, 22, -1], [92, 44, 22, 1]]);
    town(150, 57);
    TIER_IDS.forEach(drawBandStatic);
    TIER_IDS.forEach(drawTreeStatic);
    TIER_IDS.forEach(drawLabel);                                                                  // the elevation labels never change either
    bananaLeaf(-6, 322, 64, 6, 20, 16, 1); bananaLeaf(8, 326, 48, 2, 14, 12, 1);                  // foreground leaves, bottom left
    bananaLeaf(246, 322, 60, 5, 19, 16, -1); bananaLeaf(232, 326, 46, 2, 13, 12, -1);             // and bottom right
  }
  function drawBandStatic(tier) {
    var c = HILL[tier], next = nextTier(tier);
    for (var x = 0; x < W; x += 4) {
      var top = Math.round(topAt(tier, x + 2));
      rect(x, top, 4, H - top, c.base);
      rect(x, top - 1, 4, 3, c.top);                                  // the grass lip
      rect(x, top + 2, 4, 6, WALL.face); rect(x, top + 7, 4, 1, WALL.dark);   // the terrace wall, cut into the slope
      if (hash(x * 3 + top) % 3 === 0) rect(x, top + 3 + hash(x) % 3, 3, 1, WALL.stone);
    }
    for (var i = 0; i < 34; i++) {                                    // grass tufts
      var hx = hash(i * 31 + BAND_TOP[tier]) % W, y0 = topAt(tier, hx) + 12, y1 = (next ? topAt(next, hx) : H) - 4;
      if (y1 > y0) rect(hx, y0 + hash(i * 17 + BAND_TOP[tier]) % (y1 - y0), 3, 2, c.dot);
    }
  }

  // One glossy leaf at (x, y): dx = +1 grows to the right, -1 to the left; vy = -1 grows up, +1 down; k scales it.
  var LEAF_OUT = [[0, -1, 4, 3], [3, -3, 5, 4], [7, -4, 3, 3]], LEAF_FILL = [[1, 0, 3, 1], [3, -2, 4, 2], [7, -3, 2, 1]], LEAF_GLOSS = [[3, -2, 3, 1]];
  function leaf(x, y, dx, vy, k, back) {
    function bars(list, c) {
      list.forEach(function (b) {
        var bx = Math.round(b[0] * k), by = Math.round(b[1] * k), bw = Math.max(1, Math.round(b[2] * k)), bh = Math.max(1, Math.round(b[3] * k));
        rect(dx > 0 ? x + bx : x - bx - bw, vy < 0 ? y + by : y - by - bh, bw, bh, c);
      });
    }
    bars(LEAF_OUT, LEAF.rim); bars(LEAF_FILL, back ? LEAF.dark : LEAF.main); bars(LEAF_GLOSS, back ? LEAF.main : LEAF.hi);
  }
  // Each tier is a small coffee tree: dense, dark, glossy leaves around a woody branch that grows from a trunk at the right, with the
  // cherries hanging in clusters in front. The bird walks along the branch.
  function drawTreeStatic(tier) {
    var x0 = Math.round(L.BRANCH_PATHS[tier][0].x), x1 = Math.round(L.BRANCH_PATHS[tier][L.BRANCH_PATHS[tier].length - 1].x);
    var next = nextTier(tier), seed = BAND_TOP[tier] * 7;
    var i, x, by;
    for (i = 0; i < 80; i++) {                                         // the leafy mass behind the branch: dark, big and overlapping
      x = x0 - 2 + hash(i * 13 + seed) % (x1 - x0 + 6); by = branchY(tier, Math.min(x, x1));
      var up = hash(i * 7 + seed) % 100 < 72;
      leaf(x, Math.round(up ? by - 4 - hash(i * 3 + seed) % 22 : by + 3 + hash(i * 3 + seed) % 8), hash(i + seed) % 2 ? 1 : -1, up ? -1 : 1, 1.3 + (hash(i * 5 + seed) % 3) * 0.25, true);
    }
    // trunk, planted in a grassy mound
    var ty = Math.round(branchY(tier, x1)), tx = x1 - 7, bottom = (next ? Math.round(topAt(next, x1)) : H) - 1;
    rect(tx - 1, ty - 7, 16, bottom - ty + 6, ART.outline);
    rect(tx, ty - 6, 14, bottom - ty + 5, ART.bark);
    rect(tx, ty - 6, 3, bottom - ty + 5, ART.barkHi); rect(tx + 11, ty - 6, 3, bottom - ty + 5, ART.barkShade);
    rect(tx + 5, ty + 12, 2, 5, ART.barkShade); rect(tx + 8, ty + 24, 2, 4, ART.barkShade);
    rect(tx - 5, bottom - 5, 24, 4, HILL[tier].top); rect(tx - 3, bottom - 7, 20, 3, HILL[tier].top);
    // the branch: woody, thick at the trunk and thinner toward the tip
    for (x = x0; x <= x1; x++) {
      var y = branchY(tier, x), th = 3 + Math.round(3 * (x - x0) / (x1 - x0)), top = Math.round(y - th / 2);
      rect(x, top - 1, 1, 1, ART.outline); rect(x, top + th, 1, 1, ART.outline);
      rect(x, top, 1, th, ART.bark); rect(x, top, 1, 1, ART.barkHi); rect(x, top + th - 1, 1, 1, ART.barkShade);
    }
    for (i = 0; i < 46; i++) {                                         // leaves in front of the branch: a lighter green, gloss on top
      x = x0 + hash(i * 11 + seed + 1) % (x1 - x0 - 6); by = branchY(tier, x);
      leaf(x, Math.round(by - 1 - hash(i * 3 + seed + 2) % 15), hash(i * 2 + seed) % 2 ? 1 : -1, -1, 1.2 + (hash(i * 5 + seed + 3) % 3) * 0.25, false);
    }
  }
  function renderScenery() {
    var keep = ctx; ctx = bgCtx;
    try { drawSceneryStatic(); } finally { ctx = keep; }
  }
  // The elevation labels use the pixel font, which may still be downloading at first paint. Once it is ready, draw the scenery again.
  function redrawWhenFontReady() {
    if (document.fonts && document.fonts.load) document.fonts.load('6px "Press Start 2P"').then(renderScenery, function () { /* keep the fallback font */ });
  }
  // Clouds in the sky and the warm tint of the last 15 seconds move, so they are drawn each frame over the stored scenery.
  function drawClouds(warm) {
    [[20, 14, 0.9], [110, 30, 0.6], [160, 6, 0.75]].forEach(function (c) {
      var cx = ((c[0] + sec * c[2] * 3) % (W + 60)) - 30;
      rect(cx, c[1] + 3, 28, 5, '#f6edd6'); rect(cx + 5, c[1], 16, 4, '#f6edd6'); rect(cx + 2, c[1] + 8, 24, 2, '#d3dde4');
    });
    if (warm > 0) rect(0, 0, W, 60, 'rgba(240,140,60,' + (warm * 0.3).toFixed(2) + ')');
  }

  // A small label for the tier's elevation, in the left strip (the strip is only 34 px wide, so the type is small).
  function drawLabel(tier) {
    var t = L.tierOf(tier), by = L.BRANCH_PATHS[tier][0].y;
    var str = Math.floor(t.masl / 1000) + ',' + String(t.masl % 1000).padStart(3, '0');
    rect(1, by - 14, L.LABEL_W - 2, 22, 'rgba(15,28,38,0.45)');
    shadowText(str, 3, by - 4, 6, THEME.cream, 'left');
    shadowText('m', 3, by + 5, 6, THEME.blueLight, 'left');
  }

  // Each slot is a little cluster of three cherries, like the real thing, all in the same stage (the tap target is the whole cluster).
  // Red ones carry a white shine on every cherry (ripeness never relies on color alone); overripe ones are darker, smaller and dented;
  // High contrast adds a white ring around a red cluster (drawn later, above the mist).
  var CLUSTER = [[-5, -3], [5, -3], [0, 4]];
  function drawCherryBall(x, y, r, st) {
    disc(x, y, r + 1, ART.outline);
    disc(x, y, r, CHERRY[st]);
    disc(x + 1, y + 1, Math.max(2, r - 2), SHADE[st]);
    if (st === 'overripe') {
      rect(x - 1, y - r + 1, 3, 1, SHADE.overripe);                // the dent
      rect(x - r + 1, y, 1, 3, SHADE.overripe); rect(x + r - 2, y - 1, 1, 3, SHADE.overripe);   // wrinkles
    } else {
      rect(x - 2, y - 2, 2, 1, 'rgba(255,255,255,0.45)');
      if (st === 'red') { rect(x - 3, y - 3, 2, 2, '#ffffff'); rect(x - 1, y - 3, 1, 1, '#ffffff'); }   // the shine: red only
    }
  }
  function drawCherry(i) {
    var sl = world.slots[i], c = sl.cherry;
    if (!c) return;
    var st = L.stageAt(c, world.t), S = L.SLOTS[i];
    var age = world.t - c.grown, grow = age < 0.35 ? 0.35 + 0.65 * clamp01(age / 0.35) : 1;       // grow-in after a regrow
    var r = Math.max(2, Math.round((st === 'overripe' ? 5 : 6) * grow));
    var wob = (st === 'orange' || st === 'red') ? Math.round(Math.sin(sec * (st === 'red' ? 9 : 5) + i * 1.7)) : 0;
    var x = S.x + wob, y = S.y;
    rect(x - 1, y - 13, 2, 5, ART.stem); rect(x - 6, y - 9, 12, 1, ART.stem);            // the stem and its little fork
    CLUSTER.forEach(function (o) { drawCherryBall(x + o[0], y + o[1], r, st); });
  }

  // Mist: rounded, swirling clouds drifting across the high tier. Drawn in solid colors on a small offscreen canvas, then laid over the
  // scene at MIST_ALPHA so overlapping puffs do not pile up. Cherries show through at about 40%. It never blocks a tap.
  var MIST_TOP = BAND_TOP.high - 4, MIST_H = BAND_TOP.mid - 2 - MIST_TOP;   // the cloud layer covers the high tier (y 62 to 138), never the middle one
  var mistCan = document.createElement('canvas'); mistCan.width = W; mistCan.height = MIST_H;
  var mistCtx = mistCan.getContext('2d');
  // Three clouds. Each puff is [dx, dy, radius] from the cloud's centre (cx, cy in layer coordinates).
  var CLOUDS = [
    { dx: -54, cy: 30, puffs: [[-20, 4, 10], [-6, -3, 13], [9, -1, 12], [21, 5, 9], [0, 7, 11]] },
    { dx: 0,   cy: 42, puffs: [[-26, 5, 11], [-11, -4, 14], [5, -7, 15], [20, -2, 13], [32, 6, 10], [4, 9, 13]] },
    { dx: 56,  cy: 28, puffs: [[-18, 4, 9], [-3, -3, 12], [11, 0, 12], [22, 6, 8], [2, 7, 10]] }
  ];
  function drawMist() {
    var m = world.mist;
    if (!m) return;
    var life = clamp01((world.t - m.start) / 0.8) * clamp01((m.until - world.t) / 0.8);
    var keep = ctx; ctx = mistCtx; mistCtx.clearRect(0, 0, W, MIST_H);
    try {
      CLOUDS.forEach(function (cl, ci) {
        var cx = m.x + cl.dx, pos = cl.puffs.map(function (p, pi) {          // each puff drifts in a slow little circle: the swirl
          return [cx + p[0] + Math.sin(sec * 1.1 + pi * 1.3 + ci) * 2.5, cl.cy + p[1] + Math.cos(sec * 0.8 + pi * 1.7 + ci) * 1.6, p[2]];
        });
        pos.forEach(function (p) { disc(p[0], p[1] + 2, p[2], '#cfe0ea'); });             // the shaded underside
        pos.forEach(function (p) { disc(p[0], p[1], p[2], '#f4f9fb'); });                  // the body
        pos.forEach(function (p) { disc(p[0] - p[2] * 0.3, p[1] - p[2] * 0.35, Math.round(p[2] * 0.45), '#ffffff'); });   // highlights
        var big = pos[1];                                                                  // a curl on the biggest puff
        for (var k = 0; k < 30; k++) {
          var th = 0.5 + k * 0.17 + sec * 0.5, r = 1.5 + k * 0.28;
          if (r < big[2] - 2) rect(big[0] + Math.cos(th) * r, big[1] + Math.sin(th) * r, 2, 2, '#b9d0dd');
        }
      });
    } finally { ctx = keep; }
    ctx.globalAlpha = L.MIST_ALPHA * life; ctx.drawImage(mistCan, 0, MIST_TOP); ctx.globalAlpha = 1;
  }

  // The bird: dark body, cream belly, orange beak. Standing (or hopping along the branch) when `walk`; flapping when `fly`.
  function drawBirdSprite(x, y, dir, fly, loot, white) {
    x = Math.round(x); y = Math.round(y);
    var BODY = white ? '#ffffff' : ART.bird, HI = white ? '#ffffff' : ART.birdHi, BELLY = white ? '#ffffff' : ART.belly;
    var up = Math.floor(sec * 10) % 2 === 0;
    function R(dx, dy, w, h, c) { rect(dir > 0 ? x + dx : x - dx - w, y + dy, w, h, c); }
    R(-8, -5, 17, 11, ART.outline);
    R(-7, -4, 15, 9, BODY);
    R(-5, 0, 9, 4, BELLY);
    R(5, -7, 7, 7, ART.outline); R(6, -6, 5, 5, BODY);
    R(12, -4, 4, 3, ART.outline); R(12, -3, 3, 2, ART.beak);
    R(9, -5, 1, 1, '#ffffff');
    R(-12, -3, 5, 4, ART.outline); R(-11, -2, 4, 2, ART.birdHi);
    if (fly) {
      if (up) { R(-3, -13, 6, 9, ART.outline); R(-2, -12, 4, 8, ART.birdHi); }
      else { R(-3, 4, 6, 8, ART.outline); R(-2, 5, 4, 6, ART.birdHi); }
    } else {
      R(-4, -2, 7, 4, ART.birdHi);                            // folded wing
      R(-3, 6, 1, 2, ART.beak); R(2, 6, 1, 2, ART.beak);      // legs on the branch
    }
    if (loot) { disc(x + dir * 6, y + 9, 4, ART.outline); disc(x + dir * 6, y + 9, 3, CHERRY.red); }
  }
  function drawBird(b) {
    var p = L.birdPos(world, b), hop = b.state === 'walk' && Math.floor(sec * 8) % 2 === 0 ? -1 : 0;
    drawBirdSprite(p.x, p.y + hop, b.dir >= 0 ? 1 : -1, b.state === 'land' && b.stateT < 0.25, false, (birdHit[b.id] || 0) > 0);
    if (b.needs > 1) {                                          // pips: how many more shoos it takes
      var n = b.needs - b.hits;
      for (var k = 0; k < n; k++) { var px = Math.round(p.x - (n * 6 - 2) / 2 + k * 6); rect(px, p.y - 22, 5, 5, ART.outline); rect(px + 1, p.y - 21, 3, 3, THEME.gold); }
    }
    if (b.state === 'land' && Math.floor(sec * 6) % 2 === 0) shadowText('!', p.x, p.y - 12, 14, THEME.gold, 'center');
  }

  function draw() {
    var warm = world.timeLeft <= 15 && state !== 'title' ? clamp01((15 - world.timeLeft) / 15) : 0;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0);
    drawClouds(warm);
    L.SLOTS.forEach(function (s, i) { drawCherry(i); });
    drawMist();
    if (contrast) {                                          // the ring goes ABOVE the mist so ripeness stays readable
      L.SLOTS.forEach(function (s, i) {
        var c = world.slots[i].cherry;
        if (c && L.stageAt(c, world.t) === 'red') ring(s.x, s.y, L.CHERRY_R + 4, L.CHERRY_R + 2, '#ffffff');
      });
    }
    TIER_IDS.forEach(function (tier) {                       // a flash on the branch where the bird lands (visible with sound off)
      if (bandFlash[tier] > 0) {
        var on = Math.floor(sec * 8) % 2 === 0, bt = BAND_TOP[tier], nt = nextTier(tier), nx = nt ? BAND_TOP[nt] : H;
        if (on) { ctx.globalAlpha = 0.35; rect(0, bt, W, nx - bt, '#ffffff'); ctx.globalAlpha = 1; }
        rect(0, bt, W, 2, on ? THEME.gold : THEME.red); rect(0, nx - 2, W, 2, on ? THEME.gold : THEME.red);
      }
    });
    if (hover && state === 'running') {                       // mouse only: what a click would hit
      var hp = hover.kind === 'bird' ? L.birdPos(world, hover.bird) : L.SLOTS[hover.slot];
      if (hp) ring(hp.x, hp.y, (hover.kind === 'bird' ? 17 : L.CHERRY_R + 6), (hover.kind === 'bird' ? 15 : L.CHERRY_R + 4), '#ffffff');
    }
    world.flock.forEach(drawBird);
    flyers.forEach(function (f) {
      ctx.globalAlpha = clamp01(f.life * 2);
      drawBirdSprite(f.x, f.y, f.vx >= 0 ? 1 : -1, true, f.loot, f.age !== undefined && f.age < 0.14);
      ctx.globalAlpha = 1;
    });
    if (selShown && state === 'running') {
      var S = L.SLOTS[order[sel]];
      ring(S.x, S.y, L.CHERRY_R + 7, L.CHERRY_R + 5, THEME.gold);
    }
    rings.forEach(function (r) { ctx.globalAlpha = clamp01(r.life * 4); ring(r.x, r.y, Math.round(r.r) + 1, Math.round(r.r), '#ffffff'); ctx.globalAlpha = 1; });
    particles.forEach(function (p) { rect(p.x, p.y, p.s || 3, p.s || 3, p.c); });
    floaters.forEach(function (f) {
      ctx.globalAlpha = clamp01(f.life * 2);
      shadowText(f.text, f.x, f.y, 10, f.color, 'center');
      ctx.globalAlpha = 1;
    });
    if (state === 'running' && world.ready > 0 && Math.floor(sec * 4) % 2 === 0) shadowText('READY?', W / 2, 44, 14, THEME.gold, 'center');
    if (flash > 0) rect(0, 0, W, H, 'rgba(255,255,255,' + (flash * 0.5).toFixed(2) + ')');
  }

  // ---- main loop ----
  var lastTs = 0;
  function frame(ts) {
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0); lastTs = ts;
    update(dt); draw();
    requestAnimationFrame(frame);
  }
  renderScenery();
  redrawWhenFontReady();
  hud();
  setCardOpen(true);                  // the title card is showing: put keyboard focus on its button
  el.start.focus();
  requestAnimationFrame(frame);

  // Test hook (drive and read the game from automated checks). Only exists when the page is opened with ?debug=1.
  if (DEBUG) window.__picker = {
    advance: function (s) { while (s > 0) { var d = Math.min(0.05, s); update(d); s -= d; } draw(); },
    start: startRun,
    tap: function (x, y) { var ev = L.tapAt(world, x, y); handleAction(ev); return ev; },
    pick: function (i) { var ev = L.pickSlot(world, i); handleAction(ev); return ev; },
    scare: function () { var ev = L.scareBird(world); handleAction(ev); return ev; },
    // Puts the cherry in slot i into a stage right now (for checking scoring in the browser). Red lasts 30 s so it stays red.
    setStage: function (i, stage) {
      var now = world.t, c = world.slots[i].cherry, D = 1000;
      if (!c) { c = { id: 900 + i, grown: now - 10 }; world.slots[i].cherry = c; world.slots[i].regrowAt = null; }
      if (stage === 'green') { c.toYellow = now + D; c.toOrange = now + 2 * D; c.toRed = now + 3 * D; c.toOver = c.toRed + 1; }
      else if (stage === 'yellow') { c.toYellow = now; c.toOrange = now + D; c.toRed = now + 2 * D; c.toOver = c.toRed + 1; }
      else if (stage === 'orange') { c.toYellow = now - 1; c.toOrange = now; c.toRed = now + D; c.toOver = c.toRed + 1; }
      else if (stage === 'red') { c.toYellow = now - 2; c.toOrange = now - 1; c.toRed = now; c.toOver = now + 30; }
      else { c.toYellow = now - 3; c.toOrange = now - 2; c.toRed = now - 1; c.toOver = now; }
      c.toDrop = c.toOver + L.OVERRIPE_TIME; c.stage = L.stageAt(c, now);
    },
    get: function () {
      var bp = L.birdPos(world);                                    // the first bird; birds lists them all
      return {
        state: state, score: world.score, combo: world.combo, timeLeft: world.timeLeft, ready: world.ready, over: world.over, best: best,
        practice: practice, mist: !!world.mist, selected: selShown ? order[sel] : -1, picked: world.picked, perfects: world.perfects,
        slots: world.slots.map(function (s) { return { tier: s.tier, stage: s.cherry ? L.stageAt(s.cherry, world.t) : null }; }),
        bird: world.bird ? { state: world.bird.state, tier: world.bird.tier, x: bp.x, y: bp.y } : null,
        birds: world.flock.map(function (b) { var q = L.birdPos(world, b); return { id: b.id, state: b.state, tier: b.tier, x: q.x, y: q.y }; })
      };
    }
  };
})();
