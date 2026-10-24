// Flappy Grinder: drawing, input and screens. Rules live in logic.js; the cafe backdrops live in scenes.js.
(function () {
  'use strict';

  var L = window.FlappyLogic;
  var S = window.FlappyScenes;

  // Colors and font in one place so tweaks are easy. (Same palette as the other games.)
  var THEME = {
    font: "'Press Start 2P', ui-monospace, monospace",
    ink: '#0f1c26', blue: '#4298B5', blueDark: '#2c6a80', blueLight: '#9ad0e3',
    cream: '#f6edd6', gold: '#f2c744', red: '#e0503f'
  };
  // The look of the real Bird Rock art (Roger's bag screenshots, 2026-10-21): white gulls with black ink outlines and
  // orange bills, brown hatched rocks. The grinder is wood with a steel crank and a glass jar.
  var ART = {
    outline: '#140f0c',
    gull: '#fbfaf5', gullShade: '#d3dde4', gullTip: '#9fb0bb', bill: '#f08a24', cap: '#2c6a80',
    rock: '#8a6650', rockHi: '#a98369', rockShade: '#6f4f3c', rockHatch: '#3a2a23',
    wood: '#c98b4f', woodHi: '#e2ae72', woodShade: '#8a5a2b', steel: '#b9c4cc', steelDark: '#7b8a95',
    glass: '#bfe6f2', grounds: '#4a2f18'
  };
  // Power-up looks: the golden grinder, and the red burr ring.
  var GOLD = { wood: '#e9b730', woodHi: '#fff0a0', woodShade: '#b07d12', steel: '#fff6c8', steelDark: '#c99a1e' };
  var RED = { steel: '#e0443a', steelDark: '#8e1b16' };
  var POWER_COLOR = { gold: '#f2c744', rocket: '#ff8a2a', burrs: '#e0443a' };
  var GRAB_TIME = 0.7;             // length of the pick-up animation, seconds

  var W = L.W, H = L.H, GY = L.GROUND_Y, GX = L.GRINDER_X;
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');   // drawPlayer briefly points this at an offscreen canvas
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    points: $('points'), best: $('best'), banner: $('banner'), crank: $('crank'), hint: $('hint'), status: $('status'),
    title: $('title'), over: $('over'), start: $('start'), again: $('again'), sound: $('sound'),
    score: $('score'), newBest: $('new-best'), line: $('over-line'), rank: $('rank'), stats: $('review-stats')
  };

  // ---- game state ----
  var state = 'title';             // title | ready | running | dying | over
  var world = L.newWorld();
  var held = false, heldFor = 0, crankAngle = 0, spin = 1.5, clickT = 0;
  var sec = 0, scroll = 0, shake = 0, flash = 0, deathT = 0, deadVy = 0;
  var deck = L.newDeckState(), sceneId = null, prevScene = null, fade = 1, curSlot = 0;
  var particles = [], floaters = [], flyers = [];
  var grabT = 9, grabKind = null, roarT = 0;   // time since the last pick-up, and which one
  var overLine = '', startBest = 0, startScore = readStart();
  var best = readBest();
  var soundOn = true, ac = null;   // on by default; the browser only starts audio after the first tap (Start)
  var bannerTimeout = 0;

  function readBest() {
    try { return parseInt(localStorage.getItem('flappy.bestScore'), 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) { try { localStorage.setItem('flappy.bestScore', String(v)); } catch (e) { /* private mode */ } }
  // ?start=9 begins a run at 9 points, so the next cafe is one pair away (for checking the scene change).
  function readStart() {
    var m = /[?&]start=(\d+)/.exec(window.location.search);
    return m ? Math.min(500, parseInt(m[1], 10)) : 0;
  }
  // ?power=gold|rocket|burrs starts the run with that power-up (for checking the look).
  function powerForced() { var m = /[?&]power=([a-z]+)/.exec(window.location.search); return m && L.POWER_TIME[m[1]] ? m[1] : null; }
  function sceneForced() { var m = /[?&]scene=([a-z]+)/.exec(window.location.search); return m ? m[1] : null; }

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
  function sfx(name) {
    if (!soundOn) return;
    ensureAudio();
    if (name === 'start') { tone(440, 0.08, 'square', 0.06); tone(660, 0.12, 'square', 0.06, 0.08); }
    else if (name === 'click') { noise(0.03, 0.12); tone(180, 0.03, 'square', 0.03); }      // one crank tick
    else if (name === 'score') { tone(700, 0.07, 'square', 0.06); tone(1050, 0.12, 'square', 0.06, 0.06); }
    else if (name === 'scene') { tone(520, 0.09, 'square', 0.06); tone(660, 0.09, 'square', 0.06, 0.09); tone(880, 0.09, 'square', 0.06, 0.18); tone(1320, 0.2, 'square', 0.06, 0.27); }
    else if (name === 'power') { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.1, 'square', 0.06, i * 0.05); }); tone(1568, 0.25, 'triangle', 0.07, 0.25); }
    else if (name === 'powerEnd') { tone(784, 0.1, 'square', 0.05); tone(523, 0.16, 'square', 0.05, 0.1); }
    else if (name === 'scatter') { tone(900, 0.12, 'square', 0.05, 0, 1600); tone(1100, 0.1, 'square', 0.04, 0.06, 1800); }
    else if (name === 'smash') { noise(0.22, 0.3); tone(140, 0.2, 'square', 0.06, 0, 50); }
    else if (name === 'roar') { noise(0.12, 0.06); }
    else if (name === 'hit') { noise(0.3, 0.45); tone(260, 0.45, 'sawtooth', 0.08, 0, 60); }
  }
  el.sound.addEventListener('click', function () {
    soundOn = !soundOn;
    el.sound.setAttribute('aria-pressed', String(soundOn));
    el.sound.textContent = 'Sound: ' + (soundOn ? 'on' : 'off');
    if (soundOn) { ensureAudio(); sfx('start'); }
  });

  // ---- flow ----
  function say(msg) { el.status.textContent = msg; }
  function banner(text) {
    el.banner.textContent = text;
    el.banner.className = 'banner show';
    clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(function () { el.banner.className = 'banner'; }, 1700);
  }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function hud() { el.points.textContent = fmt(world.score); el.best.textContent = fmt(best); }
  function setHeld(v) {
    held = v;
    if (!v) heldFor = 0;
    el.crank.classList.toggle('down', v);
  }

  function pickScene() {
    var forced = sceneForced();
    return forced && S.draw[forced] ? forced : L.nextScene(deck, L.SCENE_IDS);
  }
  function changeScene() {
    prevScene = sceneId; sceneId = L.nextScene(deck, L.SCENE_IDS); fade = 0;
    banner(L.sceneName(sceneId));
    sfx('scene');
    say('Now at ' + L.sceneName(sceneId) + '.');
  }

  function startRun() {
    world = L.newWorld({ score: startScore });
    startBest = best;
    particles = []; floaters = []; flyers = []; shake = 0; flash = 0; scroll = 0; grabT = 9; grabKind = null;
    var forcedPower = powerForced();
    if (forcedPower) { L.givePower(world, forcedPower); grabT = 0; grabKind = forcedPower; }
    setHeld(false);
    sceneId = pickScene(); prevScene = null; fade = 1; curSlot = L.sceneSlot(world.score);
    el.title.hidden = true; el.over.hidden = true;
    el.crank.disabled = false;
    state = 'ready';
    el.hint.classList.remove('gone');
    sfx('start');
    hud();
    banner(L.sceneName(sceneId));
    say('Hold to crank the grinder up, let go to fall. Starting at ' + L.sceneName(sceneId) + '.');
  }

  function press() {
    if (state === 'ready') { state = 'running'; el.hint.classList.add('gone'); }   // the how-to-play line is pre-game only
    if (state !== 'running' || held) return;
    setHeld(true);
  }
  function release() { if (held) setHeld(false); }

  function burst(x, y, n, colors) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 110;
      particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.6 + Math.random() * 0.5, c: colors[i % colors.length] });
    }
  }

  // Gulls in a column fly off in all directions (golden grinder).
  function scatterGulls(p) {
    var c = L.pairCenter(p, world.t), cy = c - p.gap / 2 - 9, k = 0;
    while (cy > -14) {
      flyers.push({ x: p.x + L.PAIR_W / 2, y: cy, vx: -30 + Math.random() * 110, vy: -70 - Math.random() * 90, life: 1.4, capped: hash(p.id * 13 + k) % 3 === 0, ph: Math.random() });
      cy -= 14; k++;
    }
  }
  // A rock stack bursts into chunks (golden grinder or rocket flames).
  function breakRock(p) {
    var top = L.pairCenter(p, world.t) + p.gap / 2, cx = p.x + L.PAIR_W / 2;
    for (var y = top + 8; y < GY; y += 14) burst(cx, y, 8, [ART.rock, ART.rockHi, ART.rockShade, ART.rockHatch]);
    shake = Math.max(shake, 0.12);
  }

  function die(kind) {
    setHeld(false);
    state = 'dying'; deathT = 0; deadVy = -140; shake = 0.3; flash = 0.5;
    overLine = L.pickLine(kind);
    burst(GX, world.y, 18, [ART.grounds, ART.wood, ART.woodShade, ART.steel]);
    sfx('hit');
    el.crank.disabled = true;
    say(overLine + ' Score ' + world.score + '.');
  }

  function onEvents(events) {
    events.forEach(function (e) {
      if (e.type === 'score') {
        floaters.push({ x: GX, y: world.y - 30, text: '+1', life: 0.8 });
        sfx('score');
        if (world.score > best) { best = world.score; saveBest(best); }
        var slot = L.sceneSlot(world.score);
        if (slot > curSlot) { curSlot = slot; changeScene(); }
        hud();
      } else if (e.type === 'power') {
        grabT = 0; grabKind = e.kind;
        banner(L.POWER_NAMES[e.kind].toUpperCase() + '!');
        burst(GX, world.y, 16, [POWER_COLOR[e.kind], THEME.cream, THEME.gold]);
        flash = Math.max(flash, 0.25);
        sfx('power');
        say(L.POWER_NAMES[e.kind] + '!');
      } else if (e.type === 'powerEnd') {
        if (!e.replaced) { sfx('powerEnd'); say(L.POWER_NAMES[e.kind] + ' wore off.'); }
      } else if (e.type === 'smash') {
        if (e.what === 'gull') { scatterGulls(e.pair); sfx('scatter'); } else { breakRock(e.pair); sfx('smash'); }
        floaters.push({ x: e.pair.x + L.PAIR_W / 2, y: world.y - 24, text: e.what === 'gull' ? 'SHOO!' : 'CRUNCH!', life: 0.7 });
      } else if (e.type === 'hit') {
        die(e.kind);
      }
    });
  }

  function showOver() {
    state = 'over';
    el.score.textContent = fmt(world.score);
    el.newBest.hidden = !(world.score > 0 && world.score > startBest);
    el.line.textContent = overLine;
    el.rank.textContent = 'Rank: ' + L.rankFor(world.score);
    el.stats.textContent = 'Last stop: ' + L.sceneName(sceneId);
    el.again.disabled = true;
    el.over.hidden = false;
    if (window.ShareCard) ShareCard.show({ game: 'flappy', score: world.score, line: el.rank.textContent, practice: startScore > 0 || !!powerForced(), mount: document.getElementById('share') });
    if (window.Leaderboard) Leaderboard.show({ game: 'flappy', score: world.score, practice: startScore > 0 || !!powerForced(), mount: document.getElementById('lb') });
    setTimeout(function () { el.again.disabled = false; if (!(window.Leaderboard && Leaderboard.typing())) el.again.focus(); }, 500);   // stops a stray tap from skipping the card
    say('Game over. ' + overLine + ' Score ' + world.score + '. ' + el.rank.textContent + '.');
  }

  // ---- input: hold to crank ----
  function bindHold(node) {
    node.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { node.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      press();
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      node.addEventListener(ev, function (e) { e.preventDefault(); release(); });
    });
    node.addEventListener('lostpointercapture', release);
    node.addEventListener('pointerleave', function (e) {
      if (!(node.hasPointerCapture && node.hasPointerCapture(e.pointerId))) release();   // no capture, so the finger left the button
    });
    node.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  bindHold(el.crank);
  bindHold(canvas);
  el.start.addEventListener('click', startRun);
  el.again.addEventListener('click', startRun);
  window.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' || (state !== 'ready' && state !== 'running')) return;
    e.preventDefault();
    if (!e.repeat) press();
  });
  window.addEventListener('keyup', function (e) {
    if (e.code !== 'Space' || (state !== 'ready' && state !== 'running')) return;
    e.preventDefault();
    release();
  });
  // If the page loses focus mid-flight, let go instead of getting stuck.
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', function () { if (document.hidden) release(); });

  // ---- update ----
  function update(dt) {
    sec += dt;
    shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt * 3);
    if (fade < 1) fade = Math.min(1, fade + dt * 1.25);
    floaters.forEach(function (f) { f.y -= 22 * dt; f.life -= dt; });
    floaters = floaters.filter(function (f) { return f.life > 0; });
    particles.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; p.life -= dt; });
    particles = particles.filter(function (p) { return p.life > 0 && p.y < H + 4; });
    flyers.forEach(function (f) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy -= 30 * dt; f.life -= dt; });
    flyers = flyers.filter(function (f) { return f.life > 0 && f.y > -20; });
    grabT += dt;
    if (state === 'running' && world.power && world.power.kind === 'rocket') {
      roarT -= dt; if (roarT <= 0) { roarT = 0.12; sfx('roar'); }
      if (Math.random() < dt * 30) particles.push({ x: GX - 3 + Math.random() * 6, y: world.y + 18 + Math.random() * 20, vx: -40 - Math.random() * 40, vy: 30 + Math.random() * 40, life: 0.3, c: Math.random() < 0.5 ? '#ffd54a' : '#ff7a1a' });
    }

    // The crank spins up while held and winds down when let go; each turn clicks.
    spin += ((held ? 15 : 1.6) - spin) * Math.min(1, dt * (held ? 9 : 3));
    crankAngle += spin * dt;
    if (held) { heldFor += dt; clickT += dt; if (clickT >= 0.1) { clickT = 0; sfx('click'); } } else clickT = 0.1;

    if (state === 'ready') {
      world.y = 112 + Math.sin(sec * 3) * 4;
      scroll += 12 * dt;
    } else if (state === 'running') {
      var left = dt, before = world.dist;
      while (left > 0 && state === 'running') {
        var step = Math.min(1 / 60, left);
        onEvents(L.stepWorld(world, held, step));
        left -= step;
      }
      scroll += world.dist - before;
    } else if (state === 'dying') {
      deathT += dt;
      deadVy += 900 * dt; world.y = Math.min(GY - L.GRINDER_H / 2, world.y + deadVy * dt);
      if (deathT >= 0.9) showOver();
    } else {
      scroll += 12 * dt;
    }
    canvas.style.transform = shake > 0 ? 'translate(' + (Math.random() * 6 - 3).toFixed(1) + 'px,' + (Math.random() * 6 - 3).toFixed(1) + 'px)' : '';
  }

  // ---- drawing (pixel art with fillRect) ----
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function disc(cx, cy, r, c) {
    ctx.fillStyle = c;
    for (var y = -r; y <= r; y++) { var w = Math.floor(Math.sqrt(r * r - y * y)); ctx.fillRect(Math.round(cx) - w, Math.round(cy) + y, w * 2 + 1, 1); }
  }
  function text(str, x, y, size, color, align) {
    ctx.font = size + 'px ' + THEME.font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, Math.round(x), Math.round(y));
  }
  function shadowText(str, x, y, size, color, align) {
    text(str, x + 1, y + 1, size, THEME.ink, align); text(str, x, y, size, color, align);
  }
  function hash(n) { n = Math.imul((n | 0) + 0x9e3779b9, 0x85ebca6b); n ^= n >>> 15; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 13; return n >>> 0; }
  // Calls fn(x, k) at x = -offset, -offset + period, ... across the screen; k numbers each copy so scenes can vary them.
  function tile(period, offset, fn) {
    var o = ((offset % period) + period) % period, base = Math.floor(offset / period);
    for (var i = -1, x = -o - period; x < W; i++, x += period) fn(x, base + i);
  }
  var P = { W: W, H: H, GY: GY, rect: rect, disc: disc, text: text, tile: tile, hash: hash };

  function drawScene(id) {
    var fn = S.draw[id];
    if (fn) fn(P, scroll, sec);
    else { rect(0, 0, W, H, '#173547'); }
    rect(0, 0, W, GY, 'rgba(15,28,38,0.16)');     // pushes the cafe back so the obstacles stand out
  }

  // Gull facing left, wings up or down. `capped` gulls wear the little teal cap from the bag art.
  function drawGull(cx, cy, up, capped) {
    var body = [[cx - 6, cy - 3, 14, 7], [cx + 8, cy - 2, 5, 3], [cx - 10, cy - 6, 7, 7]];
    var wing = up ? [[cx - 2, cy - 11, 4, 9], [cx + 2, cy - 15, 5, 8]] : [[cx - 2, cy + 3, 4, 7], [cx + 2, cy + 4, 5, 7]];
    var bill = [[cx - 14, cy - 3, 5, 2]];
    var all = body.concat(wing, bill);
    all.forEach(function (r) { rect(r[0] - 1, r[1] - 1, r[2] + 2, r[3] + 2, ART.outline); });
    body.concat(wing).forEach(function (r) { rect(r[0], r[1], r[2], r[3], ART.gull); });
    rect(cx - 14, cy - 3, 5, 2, ART.bill);
    rect(cx - 5, cy + 1, 12, 2, ART.gullShade);
    rect(up ? cx + 3 : cx + 3, up ? cy - 15 : cy + 9, 4, 1, ART.gullTip);
    rect(cx - 8, cy - 4, 1, 1, ART.outline);
    if (capped) { rect(cx - 9, cy - 9, 6, 3, ART.outline); rect(cx - 8, cy - 8, 4, 1, ART.cap); rect(cx - 11, cy - 7, 3, 1, ART.outline); }
  }
  function drawGulls(p, gapTop) {
    var cx = p.x + L.PAIR_W / 2, k = 0, cy = gapTop - 9;
    while (cy > -14) {
      var up = ((sec * 7 + k * 0.37 + p.id * 0.61) % 1) < 0.5;
      drawGull(cx + (k % 2 ? 2 : -1), cy, up, hash(p.id * 13 + k) % 3 === 0);
      cy -= 14; k++;               // close enough together that the column reads as solid
    }
  }

  // A stack of round boulders from the pavement up to topY (the top of the stack is exactly the hit box), with ink outlines,
  // a light patch and hatch marks like the bag art.
  function drawRock(p, topY) {
    var r = 13, cx = p.x + L.PAIR_W / 2, boulders = [], y, i = 0;
    for (y = GY - r + 1; y > topY + r + 4; y -= 19, i++) boulders.push({ x: cx + hash(p.id * 7 + i) % 3 - 1, y: y, r: r - hash(p.id * 5 + i) % 2 });
    boulders.push({ x: cx, y: topY + r, r: r });
    boulders.forEach(function (b) { disc(b.x, b.y, b.r + 1, ART.outline); });
    boulders.forEach(function (b, j) {
      disc(b.x, b.y, b.r, ART.rock);
      disc(b.x - 4, b.y - 4, 5, ART.rockHi);
      rect(b.x + 3, b.y + 4, 6, 3, ART.rockShade);
      var h = hash(p.id * 11 + j);
      rect(b.x - 6 + h % 5, b.y + 1, 1, 3, ART.rockHatch); rect(b.x - 5 + h % 5, b.y + 4, 1, 2, ART.rockHatch);
      rect(b.x + 2 + h % 4, b.y - 4, 1, 3, ART.rockHatch); rect(b.x + 3 + h % 4, b.y - 1, 1, 2, ART.rockHatch);
    });
  }

  // The wooden hand grinder: steel crank turning on top, wood body, steel ring, glass jar filling with grounds.
  function drawGrinder(cx, cy, angle, fillPx, pal) {
    var o = ART.outline, A = {};
    for (var key in ART) A[key] = ART[key];
    if (pal) for (key in pal) A[key] = pal[key];
    var ARTx = ART; ART = A;          // the body below reads ART; swap in the power-up colors for this one drawing
    try { drawGrinderBody(cx, cy, angle, fillPx, o); } finally { ART = ARTx; }
  }
  function drawGrinderBody(cx, cy, angle, fillPx, o) {
    // crank: the arm swings toward and away from the viewer, so from the side it slides left and right
    var kx = Math.round(Math.cos(angle) * 11), front = Math.sin(angle) > 0;
    var ay = cy - 19;
    rect(cx - 1, ay - 1, 3, 4, o);
    var x0 = Math.min(cx, cx + kx), aw = Math.abs(kx) + 1;
    rect(x0 - 1, ay - 1, aw + 2, 4, o); rect(x0, ay, aw, 2, ART.steel);
    var hw = front ? 5 : 3;
    rect(cx + kx - Math.floor(hw / 2) - 1, ay - 8, hw + 2, 9, o);
    rect(cx + kx - Math.floor(hw / 2), ay - 7, hw, 7, front ? ART.wood : ART.woodShade);
    if (front) rect(cx + kx - Math.floor(hw / 2), ay - 7, 1, 7, ART.woodHi);
    // lid, body, ring, jar
    rect(cx - 5, cy - 16, 10, 3, o); rect(cx - 4, cy - 15, 8, 1, ART.steel);
    rect(cx - 6, cy - 14, 12, 19, o); rect(cx - 5, cy - 13, 10, 17, ART.wood);
    rect(cx - 5, cy - 13, 2, 17, ART.woodHi); rect(cx + 2, cy - 13, 3, 17, ART.woodShade);
    rect(cx - 7, cy + 3, 14, 4, o); rect(cx - 6, cy + 4, 12, 2, ART.steel); rect(cx - 6, cy + 5, 12, 1, ART.steelDark);
    rect(cx - 6, cy + 6, 12, 10, o); rect(cx - 5, cy + 7, 10, 8, ART.glass);
    if (fillPx > 0) rect(cx - 5, cy + 15 - fillPx, 10, fillPx, ART.grounds);
    rect(cx - 4, cy + 8, 1, 4, 'rgba(255,255,255,0.7)');
  }

  // ---- power-ups: pickups, flames, and the grinder with its current power ----
  function drawPickup(kind, x, y) {
    var pulse = 1 + Math.round(Math.sin(sec * 6));
    ctx.globalAlpha = 0.35; disc(x, y, L.PICKUP_R + 2 + pulse, POWER_COLOR[kind]); ctx.globalAlpha = 1;
    disc(x, y, L.PICKUP_R + 1, ART.outline); disc(x, y, L.PICKUP_R, THEME.cream);
    if (kind === 'gold') {                       // a golden coffee bean
      rect(x - 3, y - 5, 6, 10, ART.outline); rect(x - 4, y - 4, 8, 8, ART.outline);
      rect(x - 2, y - 4, 4, 8, GOLD.wood); rect(x - 3, y - 3, 6, 6, GOLD.wood);
      rect(x - 2, y - 3, 1, 2, GOLD.woodHi);
      rect(x, y - 3, 1, 2, GOLD.woodShade); rect(x - 1, y - 1, 1, 2, GOLD.woodShade); rect(x, y + 1, 1, 2, GOLD.woodShade);
    } else if (kind === 'rocket') {              // a little rocket, nose up, flame flickering
      rect(x - 2, y - 6, 4, 2, THEME.red); rect(x - 3, y - 4, 6, 7, ART.outline); rect(x - 2, y - 4, 4, 6, '#fbfaf5');
      rect(x - 1, y - 2, 2, 2, THEME.blue);
      rect(x - 4, y + 1, 2, 3, THEME.blueDark); rect(x + 2, y + 1, 2, 3, THEME.blueDark);
      rect(x - 1, y + 3, 2, Math.floor(sec * 12) % 2 ? 3 : 2, '#ff8a2a');
    } else {                                     // a red burr: toothed ring with a hole
      disc(x, y, 5, RED.steelDark); disc(x, y, 4, RED.steel);
      for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4 + sec * 2; rect(x + Math.cos(a) * 5 - 1, y + Math.sin(a) * 5 - 1, 2, 2, RED.steelDark); }
      disc(x, y, 1, THEME.cream);
    }
  }
  function drawFlames(cx, top, len) {
    var f = Math.floor(sec * 20);
    for (var y = 0; y < len; y += 2) {
      var k = y / len, wob = (hash(f * 31 + y) % 3) - 1;
      var w = Math.max(2, Math.round(9 * (1 - k * 0.8)));
      rect(cx - w / 2 + wob, top + y, w, 2, k < 0.15 ? '#fff6c8' : k < 0.45 ? '#ffd54a' : k < 0.8 ? '#ff8a2a' : '#e0443a');
      if (k < 0.5) rect(cx - 1 + wob, top + y, 2, 2, '#fffbe6');
    }
  }
  // An offscreen canvas for drawing the grinder small and crisp (red burrs).
  var gCan = document.createElement('canvas'); gCan.width = 40; gCan.height = 56;
  var gCtx = gCan.getContext('2d');
  function drawPlayer() {
    var jar = Math.min(8, Math.floor(world.score / 4));
    var pw = world.power, kind = pw ? pw.kind : null;
    var showFx = !!kind, fading = !!kind && L.powerFading(world);
    if (fading) {                                // blinking as it wears off: glow on, then nearly see-through, faster near the end
      var rate = 4 + 12 * (1 - pw.left / L.POWER_BLINK);
      showFx = Math.floor(sec * rate) % 2 === 0;
    }
    var dim = fading && !showFx;
    var grabbing = grabT < GRAB_TIME && grabKind === kind;
    var g = grabbing ? grabT / GRAB_TIME : 1;
    // Size: red burrs shrink to 80% with a little squash-and-bounce while picking up.
    var scale = kind === 'burrs' ? L.BURR_SCALE : 1;
    if (kind === 'burrs' && grabbing) scale = 1 - (1 - L.BURR_SCALE) * Math.min(1, g * 1.6) + Math.sin(g * Math.PI * 3) * 0.06 * (1 - g);
    var y = Math.round(world.y);
    var pal = null;
    if (showFx && kind === 'gold') pal = grabbing && g < 0.25 ? { wood: '#fffbe6', woodHi: '#ffffff', woodShade: '#fff0a0', steel: '#ffffff', steelDark: '#fff0a0' } : GOLD;
    if (showFx && kind === 'burrs') pal = RED;
    if (fading && showFx) {                      // a glow in the power-up's color on the "on" beats
      ctx.globalAlpha = 0.45; disc(GX, y - 2, Math.round(22 * scale), POWER_COLOR[kind]);
      ctx.globalAlpha = 0.7; disc(GX, y - 2, Math.round(15 * scale), '#fffbe6'); ctx.globalAlpha = 1;
    }
    if (dim) ctx.globalAlpha = 0.25;             // and nearly see-through on the "off" beats
    if (showFx && kind === 'rocket') drawFlames(GX, y + Math.round(16 * scale), grabbing && g < 0.5 ? L.FLAME_LEN + 16 : L.FLAME_LEN);
    if (scale === 1) drawGrinder(GX, y, crankAngle, jar, pal);
    else {
      var keep = ctx; ctx = gCtx; gCtx.clearRect(0, 0, 40, 56);
      try { drawGrinder(20, 32, crankAngle, jar, pal); } finally { ctx = keep; }
      ctx.imageSmoothingEnabled = false;
      var dw = Math.round(40 * scale), dh = Math.round(56 * scale);
      ctx.drawImage(gCan, Math.round(GX - 20 * scale), Math.round(y - 32 * scale), dw, dh);
    }
    ctx.globalAlpha = 1;
    if (showFx && kind === 'gold' && Math.floor(sec * 8) % 3 === 0) {   // twinkles
      var a = sec * 5; rect(GX + Math.cos(a) * 11, y + Math.sin(a) * 15, 2, 2, '#fffbe6');
    }
    if (grabbing) {                              // the pick-up ring
      ctx.globalAlpha = 1 - g;
      var r = Math.round(10 + g * 30), col = POWER_COLOR[kind];
      for (var i = 0; i < 16; i++) { var b = i * Math.PI / 8; rect(GX + Math.cos(b) * r - 1, y + Math.sin(b) * r - 1, 3, 3, col); }
      ctx.globalAlpha = 1;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (prevScene && fade < 1) {
      drawScene(prevScene);
      ctx.globalAlpha = fade; drawScene(sceneId); ctx.globalAlpha = 1;
    } else if (sceneId) {
      drawScene(sceneId);
    } else {
      drawScene(L.SCENE_IDS[0]);
    }
    var t = world.t;
    world.pairs.forEach(function (p) {
      var c = L.pairCenter(p, t);
      if (!p.gullsGone) drawGulls(p, c - p.gap / 2);
      if (!p.rockGone) drawRock(p, c + p.gap / 2);
      if (p.pickup && !p.pickup.got) drawPickup(p.pickup.kind, p.x + L.PAIR_W / 2, L.pickupY(p, t));
    });
    flyers.forEach(function (f) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.5));
      drawGull(f.x, f.y, ((sec * 14 + f.ph) % 1) < 0.5, f.capped);
      ctx.globalAlpha = 1;
    });
    if (sceneId) {
      rect(0, GY + 11, W, 16, 'rgba(15,28,38,0.6)');       // keeps the cafe name readable on light pavement
      shadowText(L.sceneName(sceneId).toUpperCase(), W / 2, GY + 22, 8, THEME.cream, 'center');
    }
    drawPlayer();
    particles.forEach(function (p) { rect(p.x, p.y, 3, 3, p.c); });
    floaters.forEach(function (f) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 2));
      shadowText(f.text, f.x, f.y, 10, THEME.gold, 'center');
      ctx.globalAlpha = 1;
    });
    if (state === 'running' || state === 'dying') shadowText(String(world.score), W / 2, 36, 20, THEME.cream, 'center');
    if (state === 'ready' && Math.floor(sec * 2) % 2 === 0) shadowText('HOLD TO CRANK', W / 2, 166, 10, THEME.gold, 'center');
    if (flash > 0) rect(0, 0, W, H, 'rgba(255,255,255,' + (flash * 0.5).toFixed(2) + ')');
  }

  // ---- main loop ----
  var lastTs = 0;
  function frame(ts) {
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0); lastTs = ts;
    update(dt); draw();
    requestAnimationFrame(frame);
  }
  hud();
  requestAnimationFrame(frame);

  // Test hook (drive and read the game from automated checks)
  window.__flappy = {
    advance: function (s) { while (s > 0) { var d = Math.min(0.05, s); update(d); s -= d; } draw(); },
    press: press, release: release, start: startRun,
    power: function (kind) { L.givePower(world, kind); grabT = 0; grabKind = kind; },
    // Draws one cafe at a given scroll distance onto another canvas's context (for contact sheets of all the backdrops).
    snap: function (id, px, dest, dx, dy, k) {
      var keep = [sceneId, prevScene, fade, scroll, world.pairs, particles, floaters, state];
      sceneId = id; prevScene = null; fade = 1; scroll = px; world.pairs = []; particles = []; floaters = []; state = 'over';
      draw();
      dest.drawImage(canvas, dx, dy, W * k, H * k);
      sceneId = keep[0]; prevScene = keep[1]; fade = keep[2]; scroll = keep[3]; world.pairs = keep[4]; particles = keep[5]; floaters = keep[6]; state = keep[7];
    },
    get: function () {
      return { power: world.power ? { kind: world.power.kind, left: world.power.left } : null,
        pickups: world.pairs.filter(function (p) { return p.pickup && !p.pickup.got; }).map(function (p) { return { kind: p.pickup.kind, x: Math.round(p.x) }; }),
        state: state, score: world.score, y: world.y, vy: world.vy, over: world.over, scene: sceneId, prevScene: prevScene, fade: fade,
        pairs: world.pairs.map(function (p) { return { x: Math.round(p.x), center: Math.round(p.center), gap: Math.round(p.gap), amp: p.amp }; }), line: overLine };
    }
  };
})();
