// Fill Master 3000: drawing, input and screens. Rules live in logic.js.
(function () {
  'use strict';

  var L = window.FillLogic;
  var POOL = window.COFFEES;

  // Colors and font in one place so skins and tweaks are easy. (Same palette as Roast Master.)
  var THEME = {
    font: "'Press Start 2P', ui-monospace, monospace",
    ink: '#0f1c26', wall: '#173547', wall2: '#1d4259', floor: '#12293a',
    metal: '#8fa7b3', metalDark: '#5d7584', blue: '#4298B5', blueDark: '#2c6a80', blueLight: '#9ad0e3',
    cream: '#f6edd6', gold: '#f2c744', goldDim: '#7d6419', red: '#e0503f', green: '#6fd16f', bean: '#8a5a2b'
  };

  // The real Bird Rock bags (from Roger's screenshots, 2026-10-21): single origins are sky blue, blends are cream
  // with a label band, and Monkey Bite is black with a gorilla. Sizes: body, shade, top seal, big lettering.
  var BODIES = {
    blue:  { body: '#7ab8d9', shade: '#5b9bbd', seal: '#4c88a8', word: '#f6f3ea' },
    cream: { body: '#ece7d8', shade: '#d6cfbc', seal: '#c4bca6', word: '#4298B5' },
    black: { body: '#1c1c1e', shade: '#0b0b0c', seal: '#2e2e31', word: '#f6f3ea' }
  };
  var SINGLE_LOOK = { body: 'blue', bg: '#f6f3ea', fg: '#0f1c26', stripe: '#e0503f' };
  var BLEND_LOOKS = {
    'Bird Rock Blend':   { body: 'cream', bg: '#4298B5', fg: '#f6f3ea' },
    'Cafe Del Sol':      { body: 'cream', bg: '#e5b83a', fg: '#0f1c26' },
    'Midnight Surf':     { body: 'cream', bg: '#1c1c1e', fg: '#f6f3ea' },
    'The Optimist':      { body: 'cream', bg: '#fbf7ea', fg: '#0f1c26', stripe: '#2f9e6a' },
    'Little Italy Blend': { body: 'cream', bg: '#d4503a', fg: '#f6f3ea' },
    'Monkey Bite':       { body: 'black', gorilla: true }
  };
  function lookFor(c) { return BLEND_LOOKS[c.name] || SINGLE_LOOK; }

  var W = 320, H = 256;
  var STATION_X = 232;           // the spout, about three-quarters of the way along the belt
  var BELT_Y = 170;              // top of the belt; bags stand on it
  var BAG_H = 60, SPAWN_X = -20;
  var ZH = L.ZONE_HALF;

  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');   // briefly swapped to an offscreen canvas while a bag is painted
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    bagcount: $('bagcount'), points: $('points'), best: $('best'), coffee: $('coffee'), notes: $('notes'), strikes: $('strikes'),
    banner: $('banner'), pour: $('pour'), status: $('status'),
    title: $('title'), over: $('over'), start: $('start'), again: $('again'), sound: $('sound'),
    score: $('score'), newBest: $('new-best'), rCoffee: $('review-coffee'), rNotes: $('review-notes'),
    rLast: $('review-last'), rKey: $('review-key'), rStats: $('review-stats'), rBags: $('review-bags')
  };

  // ---- game state ----
  var state = 'title';           // title | running | failing | over
  var points = 0, filled = 0, perfects = 0, streak = 0, resolved = 0, strikes = 0, startBest = 0;
  var bags = [], results = [];   // results: one entry per filled bag, 'hit' or 'perfect'
  var speed = L.SPEED_START, nextGap = 100, prevCoffee = null;
  var held = false, pouring = false;
  var lastGood = null, lastReason = null;
  var spillT = 0, shake = 0, flash = 0, beltOff = 0, timer = 0, floaters = [];
  var best = readBest();
  var soundOn = true, ac = null;   // on by default; the browser only starts audio after the first tap (Start)
  var bannerTimeout = 0;

  function readBest() {
    try { return parseInt(localStorage.getItem('fill3000.bestScore'), 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) { try { localStorage.setItem('fill3000.bestScore', String(v)); } catch (e) { /* private mode */ } }

  // ---- sound (off by default; tiny synth, no files) ----
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
    if (name === 'pour') { noise(0.12, 0.25); tone(220, 0.06, 'square', 0.04); }
    else if (name === 'hit') { tone(520, 0.1, 'square', 0.07); tone(780, 0.14, 'square', 0.07, 0.09); }
    else if (name === 'perfect') { tone(520, 0.09, 'square', 0.07); tone(780, 0.09, 'square', 0.07, 0.08); tone(1040, 0.2, 'square', 0.07, 0.16); }
    else if (name === 'fail') { tone(300, 0.5, 'sawtooth', 0.08, 0, 70); }
    else if (name === 'spill') { noise(0.3, 0.5); tone(180, 0.25, 'sawtooth', 0.06, 0, 70); }
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
    el.bagcount.textContent = filled;
    el.points.textContent = fmt(points);
    el.best.textContent = fmt(best);
    for (var i = 0; i < el.strikes.children.length; i++) el.strikes.children[i].className = i < strikes ? 'on' : '';
    el.strikes.setAttribute('aria-label', strikes + ' of ' + L.MAX_STRIKES + ' strikes');
  }
  function setHeld(v) {
    held = v;
    el.pour.classList.toggle('down', v);
  }

  function spawn(x) {
    var c = L.pickCoffee(prevCoffee, POOL);
    prevCoffee = c.name;
    bags.push({ x: x, coffee: c, status: 'incoming', p: null, weight: 0, result: null, doneT: 0 });
    nextGap = L.gapFor(resolved + 1);
  }

  function startRun() {
    points = 0; filled = 0; perfects = 0; streak = 0; resolved = 0; strikes = 0; startBest = best;
    bags = []; results = []; floaters = []; lastGood = null; lastReason = null; prevCoffee = null;
    speed = L.beltSpeed(1); setHeld(false); pouring = false; spillT = 0;
    spawn(150);                                  // first bag starts partway along so play begins quickly
    el.title.hidden = true; el.over.hidden = true;
    el.pour.disabled = false;
    state = 'running';
    sfx('start');
    hud();
    say('Shift started. Hold to pour when a bag is under the spout, and let go at ' + L.TARGET + ' ounces.');
  }

  function openBag() {
    for (var i = 0; i < bags.length; i++) if (bags[i].status === 'open') return bags[i];
    return null;
  }

  function press() {
    if (state !== 'running' || held) return;
    setHeld(true);
    if (openBag()) { pouring = true; sfx('pour'); }
    else spill();
  }
  function release() {
    if (!held) return;
    setHeld(false);
    if (pouring) {
      var b = openBag();
      pouring = false;
      if (b) finish(b, true);
    }
  }

  function spill() {
    spillT = 0.6;
    strike('spill', STATION_X);
  }

  // Judge a bag. `poured` is true when the player let go; false when the bag simply rolled out of the zone.
  function finish(b, poured) {
    pouring = false;
    var n = resolved + 1;
    var result = (!poured && b.weight <= 0) ? 'missed' : L.judgeFill(b.weight, b.p).result;
    b.status = 'done'; b.result = result; b.doneT = 0;
    resolved++;
    if (result === 'perfect' || result === 'hit') {
      var pts = L.scoreFor(result, n, streak);
      streak = result === 'perfect' ? streak + 1 : 0;
      if (result === 'perfect') perfects++;
      points += pts; filled++;
      results.push({ result: result, coffee: b.coffee });
      lastGood = { coffee: b.coffee, result: result };
      if (points > best) { best = points; saveBest(best); }
      hud();
      banner((result === 'perfect' ? 'PERFECT! +' : 'NICE! +') + pts, false);
      floaters.push({ x: b.x, y: BELT_Y - BAG_H - 8, text: '+' + pts, color: result === 'perfect' ? THEME.gold : THEME.cream, life: 0.9 });
      sfx(result);
      flash = result === 'perfect' ? 0.5 : 0;
      say((result === 'perfect' ? 'Perfect' : 'Nice') + '. ' + pts + ' points. Score ' + points + '.');
    } else {
      strike(result, b.x);
    }
  }

  function strike(reason, x) {
    strikes++; streak = 0; lastReason = reason;
    banner(L.STRIKE_LABELS[reason], true);
    floaters.push({ x: x, y: BELT_Y - BAG_H - 8, text: 'X', color: THEME.red, life: 0.9 });
    sfx(reason === 'spill' ? 'spill' : 'fail');
    shake = 0.25;
    hud();
    say(L.STRIKE_LABELS[reason].replace('!', '') + '. Strike ' + strikes + ' of ' + L.MAX_STRIKES + '.');
    if (strikes >= L.MAX_STRIKES) {
      state = 'failing'; timer = 1.3; pouring = false;
      el.pour.disabled = true;
    }
  }

  // Little Bird Rock bag icons for each filled bag, in that coffee's bag color (gold label = perfect).
  function bagSvg(coffee, perfect) {
    var B = BODIES[lookFor(coffee).body];
    return '<svg viewBox="0 0 16 20" aria-hidden="true">' +
      '<rect x="0" y="2" width="16" height="18" fill="' + B.body + '"/><rect x="12" y="2" width="4" height="18" fill="' + B.shade + '"/>' +
      '<rect x="0" y="0" width="16" height="3" fill="' + B.seal + '"/>' +
      '<rect x="4" y="5" width="8" height="2" fill="' + B.word + '"/><rect x="4" y="8" width="8" height="2" fill="' + B.word + '"/>' +
      '<rect x="3" y="12" width="10" height="6" fill="' + (perfect ? '#f2c744' : '#f6edd6') + '"/>' +
      '<rect x="5" y="14" width="6" height="2" fill="#0f1c26"/></svg>';
  }
  function renderBags() {
    var MAX = 30, html = results.slice(0, MAX).map(function (r) { return bagSvg(r.coffee, r.result === 'perfect'); }).join('');
    if (results.length > MAX) html += '<span class="more">+' + (results.length - MAX) + '</span>';
    el.rBags.innerHTML = html;
    el.rBags.hidden = results.length === 0;
    el.rBags.setAttribute('aria-label', results.length + ' bags filled');
  }

  function showReview() {
    state = 'over';
    el.pour.disabled = true;
    el.score.textContent = fmt(points);
    el.newBest.hidden = !(points > 0 && points > startBest);
    el.rLast.hidden = !lastGood;
    if (lastGood) {
      el.rCoffee.textContent = lastGood.coffee.name;
      el.rNotes.textContent = lastGood.coffee.notes.join(' · ');
    }
    renderBags();
    el.rKey.hidden = results.length === 0;
    el.rStats.textContent = filled + (filled === 1 ? ' bag' : ' bags') + ' filled · ' + perfects + ' perfect';
    el.again.disabled = true;
    el.over.hidden = false;
    if (window.Leaderboard) Leaderboard.show({ game: 'fill', score: points, mount: document.getElementById('lb') });
    setTimeout(function () { el.again.disabled = false; if (!(window.Leaderboard && Leaderboard.typing())) el.again.focus(); }, 500); // stops a stray tap from skipping the card
    say('Shift over. Overall score ' + points + '. ' + el.rStats.textContent + '.');
  }

  // ---- input: hold to pour ----
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
  bindHold(el.pour);
  bindHold(canvas);
  el.start.addEventListener('click', startRun);
  el.again.addEventListener('click', startRun);
  window.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' || state !== 'running') return;
    e.preventDefault();
    if (!e.repeat) press();
  });
  window.addEventListener('keyup', function (e) {
    if (e.code !== 'Space' || state !== 'running') return;
    e.preventDefault();
    release();
  });
  // If the page loses focus mid-pour, let go instead of getting stuck.
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', function () { if (document.hidden) release(); });

  // ---- update ----
  function update(dt) {
    shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt * 3); spillT = Math.max(0, spillT - dt);
    floaters.forEach(function (f) { f.y -= 26 * dt; f.life -= dt; });
    floaters = floaters.filter(function (f) { return f.life > 0; });

    if (state === 'running' || state === 'failing') {
      speed += (L.beltSpeed(resolved + 1) - speed) * Math.min(1, dt * 2.5);   // ease to the new speed, no jerk
      beltOff += speed * dt;
      bags.forEach(function (b) { b.x += speed * dt; if (b.status === 'done') b.doneT += dt; });
    }

    if (state === 'running') {
      var last = bags[bags.length - 1];
      if (!last || last.x - SPAWN_X >= nextGap) spawn(SPAWN_X);

      bags.slice().forEach(function (b) {
        if (b.status === 'incoming' && Math.abs(b.x - STATION_X) <= ZH) {
          b.status = 'open';
          b.p = L.bagParams(resolved + 1);
        }
        if (b.status === 'open') {
          if (pouring) {
            b.weight += b.p.rate * dt;
            if (L.isOverflow(b.weight, b.p)) { finish(b, true); return; }
          }
          if (b.status === 'open' && b.x > STATION_X + ZH) finish(b, b.weight > 0);
        }
      });

      // Panel shows the coffee of the bag at (or nearest to) the spout.
      var cur = null;
      bags.forEach(function (b) { if (b.status !== 'done' && (!cur || b.x > cur.x)) cur = b; });
      if (cur && el.coffee.textContent !== cur.coffee.name) {
        el.coffee.textContent = cur.coffee.name;
        el.notes.textContent = cur.coffee.notes.join(' · ');
      }
    } else if (state === 'failing') {
      timer -= dt;
      if (timer <= 0) showReview();
    }

    bags = bags.filter(function (b) { return b.x < W + 24; });
    canvas.style.transform = shake > 0 ? 'translate(' + (Math.random() * 6 - 3).toFixed(1) + 'px,' + (Math.random() * 6 - 3).toFixed(1) + 'px)' : '';
  }

  // ---- drawing (pixel art with fillRect) ----
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function text(str, x, y, size, color, align) {
    ctx.font = size + 'px ' + THEME.font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, Math.round(x), Math.round(y));
  }
  // Two-letter label code, skipping "The": Monkey Bite -> MB, The Optimist -> OP.
  function code(name) {
    var words = name.split(/\s+/).filter(function (w) { return w.toLowerCase() !== 'the'; });
    return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
  }

  // 3x5 block letters for the big BIRD ROCK lettering and the Monkey Bite name.
  var GLYPHS = {
    B: ['110', '101', '110', '101', '110'], I: ['111', '010', '010', '010', '111'], R: ['110', '101', '110', '101', '101'],
    D: ['110', '101', '101', '101', '110'], O: ['111', '101', '101', '101', '111'], C: ['111', '100', '100', '100', '111'],
    K: ['101', '101', '110', '101', '101'], M: ['101', '111', '111', '101', '101'], N: ['111', '101', '101', '101', '101'],
    E: ['111', '100', '110', '100', '111'], Y: ['101', '101', '010', '010', '010'], T: ['111', '010', '010', '010', '010']
  };
  // Draws `str` centered on cx with its top at y; each letter pixel is `s` px square.
  function blocks(str, cx, y, s, color) {
    var adv = 4 * s, x0 = Math.round(cx - (str.length * adv - s) / 2);
    for (var i = 0; i < str.length; i++) {
      var g = GLYPHS[str[i]];
      for (var r = 0; r < 5; r++) for (var c = 0; c < 3; c++) if (g[r][c] === '1') rect(x0 + i * adv + c * s, y + r * s, s, s, color);
    }
  }
  function disc(cx, cy, r, c) {
    ctx.fillStyle = c;
    for (var y = -r; y <= r; y++) { var w = Math.floor(Math.sqrt(r * r - y * y)); ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
  }

  // Bird Rock retail bag, drawn from the real bags: top seal, van badge, big BIRD ROCK lettering, and a
  // label band with the coffee's two-letter code (the full name is shown in the panel above).
  function paintBag(b, bagCx, top) {
    var look = lookFor(b.coffee), B = BODIES[look.body], w = L.BAG_W;
    var x = bagCx - w / 2, cx = bagCx;
    rect(x, top + 4, w, BAG_H - 4, B.body);
    rect(x + w - 4, top + 4, 4, BAG_H - 4, B.shade);                         // shaded side
    rect(x, top, w, 4, B.seal);                                              // top seal
    for (var i = 1; i < 9; i++) rect(x + i * 4 - 1, top + 1, 2, 2, B.shade);   // crimp marks
    disc(cx, top + 12, 4, B.word); rect(cx - 2, top + 11, 5, 2, B.body);     // van badge
    rect(x + w - 8, top + 8, 4, 4, B.word); rect(x + w - 7, top + 9, 2, 2, B.body);   // "whole bean" dot
    if (look.gorilla) {
      rect(cx - 7, top + 18, 14, 11, B.word);                                // gorilla face
      rect(cx - 5, top + 21, 3, 2, '#e5b83a'); rect(cx + 3, top + 21, 3, 2, '#e5b83a');   // eyes
      rect(cx - 4, top + 25, 9, 3, B.body); rect(cx - 3, top + 25, 7, 1, B.word);       // mouth and teeth
      blocks('MONKEY', cx, top + 32, 1, B.word);
      blocks('BITE', cx, top + 40, 1, B.word);
      rect(x + 3, top + 48, w - 6, 5, '#e5b83a');                            // gold notes strip
      rect(x + 6, top + 50, w - 12, 1, '#1c1c1e');
    } else {
      blocks('BIRD', cx, top + 19, 2, B.word);
      blocks('ROCK', cx, top + 31, 2, B.word);
      rect(cx - 12, top + 43, 24, 2, B.word);                                // "COFFEE ROASTERS" line
      rect(x + 3, top + 47, w - 6, 11, look.bg);                             // label
      if (look.stripe) rect(x + 3, top + 56, w - 6, 2, look.stripe);
      text(code(b.coffee.name), x + 6, top + 55, 8, look.fg, 'left');
      rect(x + w - 10, top + 49, 6, 6, look.fg);                             // QR block
      rect(x + w - 9, top + 50, 1, 1, look.bg); rect(x + w - 7, top + 52, 1, 1, look.bg); rect(x + w - 6, top + 50, 1, 1, look.bg);
    }
    rect(cx - 8, top + BAG_H - 2, 16, 1, B.word);                            // "empowered by great coffee" line
    if (b.result === 'perfect') rect(x - 1, top - 1, w + 2, 1, THEME.gold);
    else if (b.status === 'done' && b.result !== 'hit') rect(x, top, w, BAG_H, 'rgba(224,80,63,0.4)');
  }

  // The bag fattens as beans go in: painted flat to a small offscreen canvas, then copied to the screen one pixel row
  // at a time, each row stretched a little wider toward the middle. The top seal and the bottom stay put, so it
  // looks like a pillow-shaped bag. A quick jiggle plays when the pour ends.
  var BULGE = 0.17;                  // how much wider the belly gets at full weight (0.17 = 17%)
  var bagCv = document.createElement('canvas');
  bagCv.width = L.BAG_W + 4; bagCv.height = BAG_H + 2;
  var bagCtx = bagCv.getContext('2d');
  function drawBagAt(b) {
    var fill = Math.max(0, Math.min(1.3, b.weight / L.TARGET));
    var amp = BULGE * fill;
    if (b.status === 'done') amp += Math.exp(-b.doneT * 6) * Math.sin(b.doneT * 24) * 0.06;   // settle: a quick wobble
    var cx = Math.round(b.x), top = BELT_Y - BAG_H;
    if (amp < 0.01) { paintBag(b, cx, top); return; }

    var screen = ctx;
    ctx = bagCtx; bagCtx.clearRect(0, 0, bagCv.width, bagCv.height);
    paintBag(b, bagCv.width / 2, 1);
    ctx = screen;
    ctx.imageSmoothingEnabled = false;                                       // keep the pixels crisp
    for (var r = 0; r < bagCv.height; r++) {
      var dw = Math.round(bagCv.width * (1 + amp * Math.sin(Math.PI * r / bagCv.height)));
      ctx.drawImage(bagCv, 0, r, bagCv.width, 1, Math.round(cx - dw / 2), top - 1 + r, dw, 1);
    }
  }

  function drawMachine(sec) {
    var mx = STATION_X, ob = openBag();
    rect(mx - 8, 0, 16, 8, THEME.metal);                                     // feed pipe
    rect(mx - 33, 8, 66, 60, THEME.ink); rect(mx - 31, 10, 62, 56, THEME.metalDark); rect(mx - 31, 10, 62, 4, THEME.metal);
    rect(mx - 26, 20, 52, 18, THEME.ink); rect(mx - 24, 22, 48, 14, '#0b141b');              // scale display
    text(ob ? Math.min(99.9, ob.weight).toFixed(1) : L.TARGET.toFixed(1), mx - 23, 33, 8, ob ? THEME.gold : THEME.goldDim, 'left');
    text('OZ', mx + 23, 33, 6, THEME.blueLight, 'right');
    var lamp = spillT > 0 ? THEME.red : ob ? THEME.green : '#33444f';
    rect(mx + 17, 46, 10, 10, THEME.ink); rect(mx + 18, 47, 8, 8, lamp);                      // ready light
    text('BR', mx - 22, 58, 8, THEME.blueLight, 'left');
    rect(mx - 9, 66, 18, 6, THEME.metal);                                    // spout
    rect(mx - 5, 72, 10, 28, THEME.metalDark); rect(mx - 5, 72, 2, 28, THEME.metal);
    rect(mx - 7, 100, 14, 4, THEME.metal);
  }

  // Beans falling from the spout: into the bag while pouring, onto the belt on a spill.
  function drawStream(sec) {
    var k, y, bottom;
    if (spillT > 0) {
      bottom = BELT_Y;
      for (k = 0; k < 8; k++) { y = 104 + ((k * 7 + sec * 120) % (bottom - 104)); rect(STATION_X - 3 + (k % 3) * 3, y, 3, 3, THEME.bean); }
      for (k = 0; k < 7; k++) rect(STATION_X - 14 + k * 4 - Math.round((0.6 - spillT) * 8), BELT_Y - 3 - (k % 2) * 2, 3, 3, THEME.bean);
    } else if (pouring && openBag()) {
      for (k = 0; k < 4; k++) { y = 104 + ((k * 5 + sec * 90) % 20); rect(STATION_X - 2 + (k % 2) * 2 - 1, y, 3, 3, THEME.bean); }
    }
  }

  function drawBelt() {
    rect(0, BELT_Y, W, 14, '#2a3f4c'); rect(0, BELT_Y, W, 2, THEME.metal);
    var off = ((beltOff % 16) + 16) % 16;
    for (var x = -16 + off; x < W; x += 16) rect(x, BELT_Y + 6, 8, 3, '#3a5666');             // rollers slide along
    rect(0, BELT_Y + 14, W, 4, THEME.metalDark);
    for (var px = 24; px < W; px += 96) rect(px, BELT_Y + 18, 6, 30, THEME.metalDark);          // legs
    // Fill pad: lights up when a bag is in the zone
    rect(STATION_X - ZH, BELT_Y + 2, ZH * 2, 2, openBag() ? THEME.green : THEME.blueLight);
  }

  var G = { x: 12, y: 216, w: 296, h: 16 };
  function ox(oz) { return G.x + Math.max(0, Math.min(L.GAUGE_MAX, oz)) / L.GAUGE_MAX * G.w; }
  function gaugeBag() {
    var ob = openBag();
    if (ob) return ob;
    var recent = null;
    bags.forEach(function (b) { if (b.status === 'done' && b.p && b.doneT < 0.7) recent = b; });
    return recent;
  }

  function drawGauge() {
    var gb = gaugeBag();
    rect(0, 206, W, H - 206, THEME.floor);
    rect(G.x - 3, G.y - 3, G.w + 6, G.h + 6, THEME.ink); rect(G.x, G.y, G.w, G.h, '#22353f');
    if (gb) {
      var p = gb.p, lo = L.TARGET - p.window, hi = L.TARGET + p.window, pr = Math.min(p.perfect, p.window);
      rect(ox(hi), G.y, G.x + G.w - ox(hi), G.h, 'rgba(224,80,63,0.35)');                   // overflow zone
      rect(ox(lo), G.y, Math.max(2, ox(hi) - ox(lo)), G.h, THEME.goldDim);                   // hit window
      rect(ox(L.TARGET - pr), G.y, Math.max(2, ox(L.TARGET + pr) - ox(L.TARGET - pr)), G.h, THEME.gold);   // perfect
      // The bar fills with Bird Rock blue as the bag fills, like a power meter.
      var fillW = Math.round(ox(gb.weight) - G.x), k;
      if (fillW > 0) {
        rect(G.x, G.y, fillW, G.h, THEME.blue);
        rect(G.x, G.y, fillW, 3, THEME.blueLight);                                           // lit top edge
        rect(G.x, G.y + G.h - 3, fillW, 3, THEME.blueDark);                                  // shaded bottom edge
        for (k = 1; k < L.GAUGE_MAX; k++) if (ox(k) < G.x + fillW) rect(Math.round(ox(k)), G.y, 1, G.h, 'rgba(15,28,38,0.35)');   // 1 oz notches
      }
      // Target edges stay visible on top of the fill so the player can see where to stop.
      rect(Math.round(ox(lo)) - 1, G.y, 2, G.h, THEME.gold); rect(Math.round(ox(hi)) - 1, G.y, 2, G.h, THEME.gold);
      rect(ox(L.TARGET - pr), G.y + G.h - 3, Math.max(2, ox(L.TARGET + pr) - ox(L.TARGET - pr)), 3, THEME.gold);
      var nx = Math.round(ox(gb.weight));
      rect(nx - 1, G.y - 6, 3, G.h + 12, THEME.cream);
      rect(nx - 3, G.y - 8, 7, 3, THEME.cream);
    } else if (state === 'running') {
      text('NEXT BAG...', W / 2, G.y - 12, 8, THEME.blueLight, 'center');
    }
    [0, L.TARGET / 2, L.TARGET, L.GAUGE_MAX].forEach(function (v) {
      rect(Math.round(ox(v)), G.y + G.h, 1, 4, v === L.TARGET ? THEME.gold : THEME.blueLight);
      // "oz" after each number; the end labels are tucked inward so they don't run off the canvas
      text(v + 'oz', v === 0 ? ox(v) - 3 : v === L.GAUGE_MAX ? ox(v) + 3 : ox(v), G.y + G.h + 14, 8, v === L.TARGET ? THEME.gold : THEME.blueLight,
        v === 0 ? 'left' : v === L.GAUGE_MAX ? 'right' : 'center');
    });
  }

  function draw(sec) {
    ctx.clearRect(0, 0, W, H);
    rect(0, 0, W, H, THEME.wall);
    rect(0, 0, W, 4, THEME.wall2);
    drawMachine(sec);
    drawBelt();
    drawStream(sec);
    bags.forEach(drawBagAt);
    floaters.forEach(function (f) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 2));
      text(f.text, f.x, f.y, 10, f.color, 'center');
      ctx.globalAlpha = 1;
    });
    if (state === 'running' || state === 'failing') {
      if (streak >= 2) text('COMBO x' + streak, 8, 16, 8, THEME.gold, 'left');
      text('BELT x' + (speed / L.SPEED_START).toFixed(1), 8, streak >= 2 ? 30 : 16, 8, THEME.blueLight, 'left');
    }
    drawGauge();
    if (flash > 0) rect(0, 0, W, H, 'rgba(255,255,255,' + (flash * 0.4).toFixed(2) + ')');
  }

  // ---- main loop ----
  var lastTs = 0;
  function frame(ts) {
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0); lastTs = ts;
    update(dt); draw(ts / 1000);
    requestAnimationFrame(frame);
  }
  hud();
  requestAnimationFrame(frame);

  // Test hook (drive and read the game from automated checks)
  window.__fill = {
    advance: function (sec) { while (sec > 0) { var d = Math.min(0.05, sec); update(d); sec -= d; } draw(performance.now() / 1000); },
    press: press, release: release,
    get: function () {
      var ob = openBag();
      return { state: state, points: points, filled: filled, strikes: strikes, resolved: resolved, speed: speed, pouring: pouring,
        open: ob ? { x: ob.x, weight: ob.weight, rate: ob.p.rate, window: ob.p.window, perfect: ob.p.perfect, coffee: ob.coffee.name } : null,
        bags: bags.map(function (b) { return { x: Math.round(b.x), status: b.status, result: b.result }; }), lastReason: lastReason };
    }
  };
})();
