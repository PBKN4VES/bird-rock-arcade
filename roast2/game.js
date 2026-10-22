// Roast Master 5000: drawing, input and screens. Rules live in logic.js; roast levels and pickers come from ../logic.js.
(function () {
  'use strict';

  var R1 = window.RoastLogic;      // original game: LEVELS, pickLevel, pickCoffee
  var L = window.Roast2Logic;
  var POOL = window.COFFEES;

  // Colors and font in one place so skins and tweaks are easy. (Same palette as Roast Master and Fill Master.)
  var THEME = {
    font: "'Press Start 2P', ui-monospace, monospace",
    ink: '#0f1c26', wall: '#173547', wall2: '#1d4259', floor: '#12293a',
    metal: '#8fa7b3', metalDark: '#5d7584', blue: '#4298B5', blueDark: '#2c6a80', blueLight: '#9ad0e3',
    cream: '#f6edd6', gold: '#f2c744', goldDim: '#7d6419', red: '#e0503f', green: '#6fd16f', bean: '#8a5a2b',
    flames: ['#f2c744', '#e0703a', '#e0503f'],
    beanStops: [[0, [143, 174, 74]], [170, [185, 194, 74]], [300, [224, 184, 76]],
      [380, [201, 138, 60]], [415, [154, 90, 42]], [440, [106, 58, 26]],
      [460, [58, 32, 16]], [480, [28, 14, 6]]]
  };

  // The real Bird Rock bags (same looks as Fill Master): single origins are sky blue, blends are cream with a label band,
  // and Monkey Bite is black with a gorilla.
  var BODIES = {
    blue:  { body: '#7ab8d9', shade: '#5b9bbd', seal: '#4c88a8', word: '#f6f3ea' },
    cream: { body: '#ece7d8', shade: '#d6cfbc', seal: '#c4bca6', word: '#4298B5' },
    black: { body: '#1c1c1e', shade: '#0b0b0c', seal: '#2e2e31', word: '#f6f3ea' }
  };
  var SINGLE_LOOK = { body: 'blue', bg: '#f6f3ea', fg: '#0f1c26', stripe: '#e0503f' };
  var BLEND_LOOKS = {
    'Bird Rock Blend':    { body: 'cream', bg: '#4298B5', fg: '#f6f3ea' },
    'Cafe Del Sol':       { body: 'cream', bg: '#e5b83a', fg: '#0f1c26' },
    'Midnight Surf':      { body: 'cream', bg: '#1c1c1e', fg: '#f6f3ea' },
    'The Optimist':       { body: 'cream', bg: '#fbf7ea', fg: '#0f1c26', stripe: '#2f9e6a' },
    'Little Italy Blend': { body: 'cream', bg: '#d4503a', fg: '#f6f3ea' },
    'Monkey Bite':        { body: 'black', gorilla: true }
  };
  function lookFor(c) { return BLEND_LOOKS[c.name] || SINGLE_LOOK; }

  var W = 320, H = 308;
  var DX = 70, DY = 56;               // the roaster art is drawn in the original 240 x 300 layout, shifted by this much
  var HOPPER_X = 160, BELT_Y = 66;    // bags tip into the hopper at HOPPER_X
  var FIRST_LEAD = 80;                 // px the first bag starts back from the hopper: about 3.5 s of belt at the start
  var SPAWN_X = -30, MIN_SEP = 42;
  var BAG_CX = 234, BAG_BOTTOM = 252, BAG_W = 36, BAG_H = 60;
  var DRUM_X = DX + 90, DRUM_Y = DY + 105;   // drum center on the canvas

  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    batches: $('batches'), points: $('points'), best: $('best'), plabel: $('plabel'), coffee: $('coffee'), notes: $('notes'),
    level: $('level'), strikes: $('strikes'), banner: $('banner'), pour: $('pour'), status: $('status'),
    title: $('title'), over: $('over'), start: $('start'), again: $('again'), sound: $('sound'),
    score: $('score'), newBest: $('new-best'), rCoffee: $('review-coffee'), rNotes: $('review-notes'),
    rLast: $('review-last'), rStats: $('review-stats'), rLevels: $('review-levels')
  };

  // ---- game state ----
  var state = 'title';           // title | running | failing | over
  var points = 0, roasted = 0, perfects = 0, streak = 0, resolved = 0, strikes = 0, startBest = 0;
  var results = [], bags = [], spawned = 0, charged = 0, prevLevel = null, prevCoffee = null;
  var speed = L.beltSpeed(1), held = false, canHeat = false;
  var drum = freshDrum();
  var lastGood = null, lastBagCoffee = null, shownBags = 0, bagBounce = 0;
  var shake = 0, flash = 0, crackText = 0, beltOff = 0, timer = 0, floaters = [], panelKey = '';
  var best = readBest();
  var soundOn = true, ac = null;   // on by default; the browser only starts audio after the first tap (Start)
  var bannerTimeout = 0;

  function freshDrum() {
    // phase: idle | ready (bag just tipped in, start bar running) | roasting | result
    return { phase: 'idle', batch: null, s: null, t: 0, startSecs: 0, heated: false, success: false, landed: true };
  }

  function readBest() {
    try { return parseInt(localStorage.getItem('roast2.bestScore'), 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) { try { localStorage.setItem('roast2.bestScore', String(v)); } catch (e) { /* private mode */ } }

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
  // A burst of noise. ftype ('highpass' | 'lowpass') and freq shape it, so noise can sound like a click or a rumble.
  function noise(dur, vol, delay, ftype, freq) {
    if (!ac) return;
    var n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    var s = ac.createBufferSource(), g = ac.createGain(); s.buffer = buf; g.gain.value = vol;
    if (ftype) { var f = ac.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; s.connect(f); f.connect(g); } else s.connect(g);
    g.connect(ac.destination); s.start(ac.currentTime + (delay || 0));
  }
  // Three different cues: beans pouring in (a soft whoosh and a "go" blip), the burner lighting
  // (a low rising whoomp), and first crack (sharp pops).
  function sfx(name) {
    if (!soundOn) return;
    ensureAudio();
    if (name === 'heat') { tone(70, 0.35, 'sine', 0.16, 0, 140); tone(105, 0.3, 'triangle', 0.06, 0.03, 210); noise(0.4, 0.14, 0, 'lowpass', 500); }
    else if (name === 'ready') { noise(0.25, 0.18); tone(880, 0.08, 'square', 0.05, 0.05); }   // beans pour in, "go"
    else if (name === 'crack') {
      noise(0.04, 0.8, 0, 'highpass', 2000); tone(1600, 0.05, 'square', 0.06, 0, 400);
      noise(0.05, 0.7, 0.1, 'highpass', 1500); noise(0.035, 0.6, 0.19, 'highpass', 2500);
    }
    else if (name === 'hit') { tone(520, 0.1, 'square', 0.07); tone(780, 0.14, 'square', 0.07, 0.09); }
    else if (name === 'perfect') { tone(520, 0.09, 'square', 0.07); tone(780, 0.09, 'square', 0.07, 0.08); tone(1040, 0.2, 'square', 0.07, 0.16); }
    else if (name === 'fail') { tone(300, 0.5, 'sawtooth', 0.08, 0, 70); }
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
    el.batches.textContent = roasted;
    el.points.textContent = fmt(points);
    el.best.textContent = fmt(best);
    for (var i = 0; i < el.strikes.children.length; i++) el.strikes.children[i].className = i < strikes ? 'on' : '';
    el.strikes.setAttribute('aria-label', strikes + ' of ' + L.MAX_STRIKES + ' strikes');
  }
  function setHeld(v) { held = v; el.pour.classList.toggle('down', v); }

  function spawn(x) {
    spawned++;
    var level = R1.pickLevel(prevLevel), coffee = R1.pickCoffee(prevCoffee, POOL);
    prevLevel = level.id; prevCoffee = coffee.name;
    bags.push({ x: x, n: spawned, coffee: coffee, level: level, p: L.batchParams(spawned), status: 'incoming', prog: 0 });
  }

  function startRun() {
    points = 0; roasted = 0; perfects = 0; streak = 0; resolved = 0; strikes = 0; startBest = best;
    results = []; bags = []; floaters = []; spawned = 0; charged = 0; prevLevel = null; prevCoffee = null;
    lastGood = null; lastBagCoffee = null; shownBags = 0; bagBounce = 0; panelKey = '';
    drum = freshDrum(); speed = L.beltSpeed(1); setHeld(false); canHeat = false;
    var first = HOPPER_X - 8 - FIRST_LEAD;   // the first bag starts well back on the belt so the player can settle in
    spawn(first); spawn(first - L.SPACING); spawn(first - 2 * L.SPACING);
    el.title.hidden = true; el.over.hidden = true;
    el.pour.disabled = false;
    state = 'running';
    sfx('start');
    hud();
    say('Shift started. When a bag tips into the roaster, hold to heat within a second or two, then let go at the target temperature.');
  }

  // A bag reached the hopper.
  function arrive(b) {
    if (drum.phase === 'idle') loadBatch(b);
    else if (drum.phase === 'roasting') {
      // the next bag arrived before this batch was dropped
      resolved++;
      strike('slow', DRUM_X);
      drum = freshDrum(); canHeat = false;
      if (state === 'running') loadBatch(b);
    }
    // ready or result: the bag waits at the hopper for a moment
  }

  // The bag tips in and the start bar begins. The roast is ready to heat at once (the pour is only for looks).
  function loadBatch(b) {
    b.status = 'dumping'; b.prog = 0;
    drum = freshDrum();
    drum.phase = 'ready'; drum.batch = b; drum.s = L.newRoast(); drum.startSecs = L.startSecs(b.n);
    charged++;
    sfx('ready');
    say('Roasting ' + b.coffee.name + ', ' + b.level.label + ' roast. Target ' + b.level.drop + ' degrees. Hold now.');
  }

  // Holding is allowed any time, even a moment before the bag tips in: it then starts heating right away.
  function press() {
    if (state !== 'running' || held) return;
    setHeld(true); canHeat = true;
    sfx('heat');                                   // the burner lights whenever the button goes down, beans or not
  }
  // Letting go drops the beans at once, judged on the temperature right then.
  function release() {
    if (!held) return;
    setHeld(false);
    if (canHeat && drum.phase === 'roasting' && drum.heated) {
      var b = drum.batch;
      finishBatch(L.judgeRoast(drum.s.temp, b.level.drop, b.p, drum.s.cracked).result);
    }
    canHeat = false;
  }

  // Judge a finished batch. result: 'perfect' | 'hit' | 'early' | 'late' | 'nostart'
  function finishBatch(result) {
    var b = drum.batch, n = resolved + 1;
    resolved++;
    drum.phase = 'result'; drum.t = 0; canHeat = false;
    if (result === 'perfect' || result === 'hit') {
      var pts = L.scoreFor(result, n, streak);
      streak = result === 'perfect' ? streak + 1 : 0;
      if (result === 'perfect') perfects++;
      points += pts; roasted++;
      results.push({ result: result, coffee: b.coffee, level: b.level });
      lastGood = { coffee: b.coffee, result: result };
      drum.success = true; drum.landed = false;
      if (points > best) { best = points; saveBest(best); }
      hud();
      banner((result === 'perfect' ? 'PERFECT! +' : 'NICE! +') + pts, false);
      floaters.push({ x: DRUM_X, y: DY + 52, text: '+' + pts, color: result === 'perfect' ? THEME.gold : THEME.cream, life: 0.9 });
      sfx(result);
      flash = result === 'perfect' ? 0.5 : 0;
      say((result === 'perfect' ? 'Perfect' : 'Nice') + '. ' + pts + ' points. Score ' + points + '.');
    } else {
      strike(result === 'late' ? 'burnt' : result, DRUM_X);
    }
  }

  function strike(reason, x) {
    strikes++; streak = 0;
    banner(L.STRIKE_LABELS[reason], true);
    floaters.push({ x: x, y: DY + 52, text: 'X', color: THEME.red, life: 0.9 });
    sfx('fail');
    shake = 0.25;
    hud();
    say(L.STRIKE_LABELS[reason].replace('!', '') + '. Strike ' + strikes + ' of ' + L.MAX_STRIKES + '.');
    if (strikes >= L.MAX_STRIKES) {
      state = 'failing'; timer = 1.3; setHeld(false); canHeat = false;
      el.pour.disabled = true;
    }
  }

  // How many batches were roasted at each roast level (Light, Medium, Dark, Dark+), in the original game's level order.
  function renderLevels() {
    var html = R1.LEVELS.map(function (lv) {
      var count = results.filter(function (r) { return r.level.id === lv.id; }).length;
      return '<div class="lvl' + (count ? '' : ' none') + '"><b>' + count + '</b><span>' + lv.label + '</span></div>';
    }).join('');
    el.rLevels.innerHTML = html;
    el.rLevels.hidden = results.length === 0;
    el.rLevels.setAttribute('aria-label', R1.LEVELS.map(function (lv) {
      return results.filter(function (r) { return r.level.id === lv.id; }).length + ' ' + lv.label;
    }).join(', ') + ' roasts');
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
    renderLevels();
    el.rStats.textContent = roasted + (roasted === 1 ? ' batch' : ' batches') + ' roasted · ' + perfects + ' perfect';
    el.again.disabled = true;
    el.over.hidden = false;
    setTimeout(function () { el.again.disabled = false; el.again.focus(); }, 500); // stops a stray tap from skipping the card
    say('Shift over. Overall score ' + points + '. ' + el.rStats.textContent + '.');
  }

  // ---- input: hold to heat ----
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
  // If the page loses focus mid-heat, let go instead of getting stuck.
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', function () { if (document.hidden) release(); });

  // ---- update ----
  function refreshPanel() {
    var cur = drum.batch && drum.phase !== 'idle' ? drum.batch : null, label = 'Now roasting';
    if (!cur) {
      label = 'Up next';
      bags.forEach(function (b) { if (b.status === 'incoming' && (!cur || b.x > cur.x)) cur = b; });
    }
    var key = cur ? label + cur.n : '';
    if (key === panelKey) return;
    panelKey = key;
    el.plabel.textContent = label;
    el.coffee.textContent = cur ? cur.coffee.name : '';
    el.notes.textContent = cur ? cur.coffee.notes.join(' · ') : '';
    el.level.textContent = cur ? cur.level.label + ' roast: drop at ' + cur.level.drop + '°F' : '';
  }

  function updateDrum(dt) {
    var b = drum.batch, s = drum.s;
    if (drum.phase === 'ready') {
      drum.t += dt;
      if (held && canHeat) { drum.phase = 'roasting'; drum.t = 0; }
      else if (drum.t >= drum.startSecs) {           // the start bar ran out to the left
        resolved++;
        drum.phase = 'result'; drum.t = 0; drum.success = false; canHeat = false;
        strike('nostart', DRUM_X);
        return;
      }
    }
    if (drum.phase === 'roasting') {
      if (held && canHeat) {
        drum.heated = true;
        if (L.heat(s, b.p, dt)) { shake = 0.3; flash = 1; crackText = 0.7; sfx('crack'); }
        if (L.isBurnt(s.temp, b.level.drop, b.p)) finishBatch('late');
      }
    } else if (drum.phase === 'result') {
      drum.t += dt;
      if (drum.success && !drum.landed && drum.t >= 0.7) {
        drum.landed = true; lastBagCoffee = b.coffee; shownBags = results.length; bagBounce = 1;
      }
      if (drum.t >= L.RESULT_SECS) drum = freshDrum();
    }
  }

  function update(dt) {
    shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt * 3); crackText = Math.max(0, crackText - dt);
    bagBounce = Math.max(0, bagBounce - dt * 3);
    floaters.forEach(function (f) { f.y -= 26 * dt; f.life -= dt; });
    floaters = floaters.filter(function (f) { return f.life > 0; });

    if (state === 'running' || state === 'failing') {
      speed += (L.beltSpeed(charged + 1) - speed) * Math.min(1, dt * 2.5);   // ease to the new speed, no jerk
      beltOff += speed * dt;
    }

    if (state === 'running') {
      // move the bags along the belt; the front one stops at the hopper, the others queue behind it
      var inc = bags.filter(function (b) { return b.status === 'incoming'; }).sort(function (a, b) { return b.x - a.x; });
      var ahead = null, lead = null;
      inc.forEach(function (b) {
        var nx = b.x + speed * dt;
        if (!ahead) { if (nx >= HOPPER_X) { nx = HOPPER_X; lead = b; } }
        else if (nx > ahead.x - MIN_SEP) nx = ahead.x - MIN_SEP;
        b.x = nx; ahead = b;
      });
      bags.forEach(function (b) { if (b.status === 'dumping') b.prog += dt / L.DUMP_SECS; });
      bags = bags.filter(function (b) { return !(b.status === 'dumping' && b.prog >= 1); });
      var rear = null;
      bags.forEach(function (b) { if (b.status === 'incoming' && (!rear || b.x < rear.x)) rear = b; });
      if (!rear || rear.x - L.SPACING >= SPAWN_X) spawn(rear ? rear.x - L.SPACING : SPAWN_X);
      if (lead) arrive(lead);
      updateDrum(dt);
      refreshPanel();
    } else if (state === 'failing') {
      updateDrum(dt);
      timer -= dt;
      if (timer <= 0) showReview();
    }
    canvas.style.transform = shake > 0 ? 'translate(' + (Math.random() * 6 - 3).toFixed(1) + 'px,' + (Math.random() * 6 - 3).toFixed(1) + 'px)' : '';
  }

  // ---- drawing (pixel art with fillRect) ----
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function disc(cx, cy, r, c) {
    ctx.fillStyle = c;
    for (var y = -r; y <= r; y++) { var w = Math.floor(Math.sqrt(r * r - y * y)); ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
  }
  function beanColor(tmp) {
    var s = THEME.beanStops, i = 0;
    while (i < s.length - 2 && tmp > s[i + 1][0]) i++;
    var a = s[i], b = s[i + 1], k = Math.max(0, Math.min(1, (tmp - a[0]) / (b[0] - a[0])));
    return 'rgb(' + [0, 1, 2].map(function (n) { return Math.round(a[1][n] + (b[1][n] - a[1][n]) * k); }).join(',') + ')';
  }
  function bean(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    rect(x + 1, y, 5, 1, c); rect(x, y + 1, 7, 3, c); rect(x + 1, y + 4, 5, 1, c);
    rect(x + 1, y + 2, 5, 1, 'rgba(0,0,0,0.35)');
  }
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
  function blocks(str, cx, y, s, color) {
    var adv = 4 * s, x0 = Math.round(cx - (str.length * adv - s) / 2);
    for (var i = 0; i < str.length; i++) {
      var g = GLYPHS[str[i]];
      for (var r = 0; r < 5; r++) for (var c = 0; c < 3; c++) if (g[r][c] === '1') rect(x0 + i * adv + c * s, y + r * s, s, s, color);
    }
  }

  // Bird Rock retail bag (same drawing as Fill Master's belt bags): top seal, van badge, big BIRD ROCK lettering, label band.
  function drawBag(cx, bottom, coffee) {
    var look = lookFor(coffee), B = BODIES[look.body], w = BAG_W, x = Math.round(cx) - w / 2, top = bottom - BAG_H, i;
    rect(x, top + 4, w, BAG_H - 4, B.body);
    rect(x + w - 4, top + 4, 4, BAG_H - 4, B.shade);
    rect(x, top, w, 4, B.seal);
    for (i = 1; i < 9; i++) rect(x + i * 4 - 1, top + 1, 2, 2, B.shade);
    disc(cx, top + 12, 4, B.word); rect(cx - 2, top + 11, 5, 2, B.body);
    rect(x + w - 8, top + 8, 4, 4, B.word); rect(x + w - 7, top + 9, 2, 2, B.body);
    if (look.gorilla) {
      rect(cx - 7, top + 18, 14, 11, B.word);
      rect(cx - 5, top + 21, 3, 2, '#e5b83a'); rect(cx + 3, top + 21, 3, 2, '#e5b83a');
      rect(cx - 4, top + 25, 9, 3, B.body); rect(cx - 3, top + 25, 7, 1, B.word);
      blocks('MONKEY', cx, top + 32, 1, B.word);
      blocks('BITE', cx, top + 40, 1, B.word);
      rect(x + 3, top + 48, w - 6, 5, '#e5b83a');
      rect(x + 6, top + 50, w - 12, 1, '#1c1c1e');
    } else {
      blocks('BIRD', cx, top + 19, 2, B.word);
      blocks('ROCK', cx, top + 31, 2, B.word);
      rect(cx - 12, top + 43, 24, 2, B.word);
      rect(x + 3, top + 47, w - 6, 11, look.bg);
      if (look.stripe) rect(x + 3, top + 56, w - 6, 2, look.stripe);
      text(code(coffee.name), x + 6, top + 55, 8, look.fg, 'left');
      rect(x + w - 10, top + 49, 6, 6, look.fg);
      rect(x + w - 9, top + 50, 1, 1, look.bg); rect(x + w - 7, top + 52, 1, 1, look.bg); rect(x + w - 6, top + 50, 1, 1, look.bg);
    }
    rect(cx - 8, top + BAG_H - 2, 16, 1, B.word);
  }

  // A bag on the belt. While it tips into the hopper it sinks and fades.
  function drawBeltBag(b) {
    var prog = b.status === 'dumping' ? Math.min(1, b.prog) : 0;
    ctx.globalAlpha = 1 - prog * 0.9;
    drawBag(b.x, BELT_Y + Math.round(prog * 12), b.coffee);
    ctx.globalAlpha = 1;
  }

  function drawBelt() {
    var end = HOPPER_X + 22, off = ((beltOff % 16) + 16) % 16;
    rect(0, BELT_Y, end, 8, '#2a3f4c'); rect(0, BELT_Y, end, 2, THEME.metal);
    for (var x = -16 + off; x < end; x += 16) if (x > 0) rect(x, BELT_Y + 3, 8, 3, '#3a5666');
    rect(0, BELT_Y + 8, end, 4, THEME.metalDark);
    rect(12, BELT_Y + 12, 6, 24, THEME.metalDark); rect(96, BELT_Y + 12, 6, 24, THEME.metalDark);
    disc(end, BELT_Y + 5, 6, THEME.metalDark); disc(end, BELT_Y + 5, 4, THEME.metal);   // end roller
  }

  var BEANS = [];
  for (var bi = 0; bi < 18; bi++) BEANS.push({ a: bi * 2.4, d: 6 + (bi * 7) % 24, w: 0.5 + (bi % 5) * 0.12 });

  // The roaster is drawn in the original game's coordinates (translated by DX, DY).
  function drawRoaster(sec, temp, hot) {
    var f;
    rect(-DX, 196, W, 4, THEME.wall2);                       // shelf line
    rect(48, 150, 8, 40, THEME.metalDark); rect(124, 150, 8, 40, THEME.metalDark);
    rect(36, 188, 108, 8, THEME.metal); rect(36, 194, 108, 2, THEME.metalDark);
    var heating = drum.phase === 'roasting' && held && canHeat;   // beans are actually being heated
    for (f = 0; f < 8; f++) {
      if (held && (state === 'running' || state === 'failing')) {   // flames follow the button, even with no beans in the drum
        var fh = Math.round((3 + Math.random() * 9) * (0.8 + hot));
        rect(62 + f * 7, 176 - fh, 5, fh, THEME.flames[(f + Math.floor(sec * 8)) % 3]);
      } else rect(62 + f * 7, 174, 5, 2, THEME.blue);       // pilot flame
    }

    disc(90, 105, 51, THEME.ink); disc(90, 105, 48, THEME.metal); disc(90, 105, 42, THEME.metalDark); disc(90, 105, 39, '#0b141b');
    if (drum.batch && drum.phase !== 'idle') {
      var col = beanColor(temp), wob = hot * 1.2 + 0.4;
      var flight = drum.phase === 'result' && drum.success ? Math.min(1, drum.t / 0.7) : 0;   // beans travel from the drum into the bag
      var tx = BAG_CX - DX, ty = BAG_BOTTOM - BAG_H - DY + 4;
      BEANS.forEach(function (b) {
        var a = b.a + sec * b.w * (0.8 + hot * 2.2);
        var bx = 90 + b.d * Math.cos(a) * 1.15 - 3, by = 112 + b.d * Math.sin(a) * 0.9 - 2 + (b.d * 0.15);
        if (heating) by += Math.sin(sec * 18 + b.a) * wob * 0.6;
        if (flight > 0) {
          if (flight >= 1) return;
          var e = flight * flight;
          bx += (tx - bx) * e; by += (ty - by) * e - Math.sin(flight * Math.PI) * 14;
        }
        bean(bx, by, col);
      });
    }
    rect(58, 76, 3, 3, 'rgba(255,255,255,0.45)'); rect(61, 73, 5, 2, 'rgba(255,255,255,0.35)');   // glass shine

    // hopper (the belt ends just above it) and the beans pouring in while a bag tips
    rect(70, 24, 40, 4, THEME.metal);
    for (var r = 0; r < 14; r++) rect(72 + Math.floor(r / 2), 28 + r, 36 - Math.floor(r / 2) * 2, 1, THEME.metalDark);
    rect(84, 42, 12, 8, THEME.metalDark); rect(84, 42, 12, 2, THEME.metal);
    if (drum.batch && drum.batch.status === 'dumping' && drum.batch.prog < 1) {
      for (f = 0; f < 4; f++) rect(88 + (f % 2) * 4, 50 + ((f * 9 + sec * 120) % 40), 3, 3, THEME.bean);
    }

  }

  var G = { x: 12, y: 270, w: 296, h: 16 };
  function gx(tmp) { return G.x + (Math.max(L.GAUGE_LO, Math.min(L.GAUGE_HI, tmp)) - L.GAUGE_LO) / (L.GAUGE_HI - L.GAUGE_LO) * G.w; }

  // The bar under the roaster: a start bar that runs out to the left while a bag has just tipped in, then the temperature gauge.
  function drawGauge(sec) {
    var gb = drum.batch && drum.phase !== 'idle' ? drum.batch : null, s = drum.s, k;
    rect(0, 258, W, H - 258, THEME.floor);
    rect(G.x - 3, G.y - 3, G.w + 6, G.h + 6, THEME.ink); rect(G.x, G.y, G.w, G.h, '#22353f');
    if (drum.phase === 'ready') {
      var frac = Math.max(0, 1 - drum.t / drum.startSecs), w = Math.round(G.w * frac);
      var col = frac > 0.5 ? THEME.green : frac > 0.25 ? THEME.gold : THEME.red;
      rect(G.x, G.y, w, G.h, col); rect(G.x, G.y, w, 3, 'rgba(255,255,255,0.35)'); rect(G.x, G.y + G.h - 3, w, 3, 'rgba(0,0,0,0.25)');
      text('HOLD NOW!', W / 2, G.y - 14, 8, Math.floor(sec * 6) % 2 ? THEME.cream : THEME.gold, 'center');
      return;
    }
    if (gb) {
      var p = gb.p, target = gb.level.drop, lo = target - p.window, hi = target + p.window, pr = Math.min(p.perfect, p.window);
      rect(gx(hi), G.y, G.x + G.w - gx(hi), G.h, 'rgba(224,80,63,0.35)');                       // burn zone
      rect(gx(lo), G.y, Math.max(2, gx(hi) - gx(lo)), G.h, THEME.goldDim);                     // hit window
      rect(gx(target - pr), G.y, Math.max(2, gx(target + pr) - gx(target - pr)), G.h, THEME.gold);   // perfect
      // The bar fills with Bird Rock blue as the beans heat up.
      var fillW = Math.round(gx(s.temp) - G.x);
      if (s.temp > L.GAUGE_LO && fillW > 0) {
        rect(G.x, G.y, fillW, G.h, THEME.blue);
        rect(G.x, G.y, fillW, 3, THEME.blueLight);
        rect(G.x, G.y + G.h - 3, fillW, 3, THEME.blueDark);
        for (k = 400; k < L.GAUGE_HI; k += 10) if (gx(k) < G.x + fillW) rect(Math.round(gx(k)), G.y, 1, G.h, 'rgba(15,28,38,0.35)');   // 10°F notches
      }
      // Target edges stay visible on top of the fill so the player can see where to stop.
      rect(Math.round(gx(lo)) - 1, G.y, 2, G.h, THEME.gold); rect(Math.round(gx(hi)) - 1, G.y, 2, G.h, THEME.gold);
      rect(gx(target - pr), G.y + G.h - 3, Math.max(2, gx(target + pr) - gx(target - pr)), 3, THEME.gold);
      if (s.temp < L.GAUGE_LO) text('HEATING...', W / 2, G.y - 14, 8, THEME.blueLight, 'center');
      var nx = Math.round(gx(s.temp));
      rect(nx - 1, G.y - 6, 3, G.h + 12, THEME.cream);
      rect(nx - 3, G.y - 8, 7, 3, THEME.cream);
    } else if (state === 'running') {
      text('NEXT BATCH...', W / 2, G.y - 14, 8, THEME.blueLight, 'center');
    }
    [400, 420, 440, 460].forEach(function (v) {
      rect(Math.round(gx(v)), G.y + G.h, 1, 4, THEME.blueLight);
      text(v + '°F', gx(v), G.y + G.h + 14, 8, THEME.blueLight, 'center');
    });
  }

  function draw(sec) {
    var s = drum.s, temp = s ? s.temp : 0, hot = Math.min(1, temp / 480);
    ctx.clearRect(0, 0, W, H);
    rect(0, 0, W, H, THEME.wall);
    rect(0, 0, W, 4, THEME.wall2);
    drawBelt();
    bags.forEach(drawBeltBag);
    ctx.save(); ctx.translate(DX, DY);
    drawRoaster(sec, temp, hot);
    ctx.restore();
    if (lastBagCoffee) {
      var dy = -Math.round(Math.sin(bagBounce * Math.PI) * 5);
      drawBag(BAG_CX, BAG_BOTTOM + dy, lastBagCoffee);
      if (shownBags > 0) text('x' + shownBags, BAG_CX, BAG_BOTTOM - BAG_H - 6, 8, THEME.cream, 'center');
    }
    if (drum.batch && drum.phase !== 'idle') {                                   // temperature readout beside the roaster
      text(Math.round(temp) + '°F', 8, DY + 68, 16, THEME.cream, 'left');
      text('TARGET', 8, DY + 90, 8, THEME.blueLight, 'left');
      text(drum.batch.level.drop + '°F', 8, DY + 104, 8, THEME.gold, 'left');
    }
    if (crackText > 0) {
      var k = 1 + (0.7 - crackText) * 0.6;
      text('CRACK!', DRUM_X, DRUM_Y + 7, Math.round(22 * k), THEME.gold, 'center');
    }
    floaters.forEach(function (f) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 2));
      text(f.text, f.x, f.y, 10, f.color, 'center');
      ctx.globalAlpha = 1;
    });
    if (state === 'running' || state === 'failing') {
      text('BELT x' + (speed / L.BELT_BASE).toFixed(1), W - 8, 16, 8, THEME.blueLight, 'right');
      if (streak >= 2) text('COMBO x' + streak, W - 8, 30, 8, THEME.gold, 'right');
    }
    drawGauge(sec);
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
  window.__roast2 = {
    advance: function (sec) { while (sec > 0) { var d = Math.min(0.05, sec); update(d); sec -= d; } draw(performance.now() / 1000); },
    press: press, release: release,
    get: function () {
      var b = drum.batch;
      return { state: state, points: points, roasted: roasted, strikes: strikes, resolved: resolved, speed: speed, held: held, canHeat: canHeat,
        phase: drum.phase, temp: drum.s ? drum.s.temp : null, cracked: drum.s ? drum.s.cracked : null, startLeft: drum.phase === 'ready' ? drum.startSecs - drum.t : null,
        batch: b ? { n: b.n, coffee: b.coffee.name, target: b.level.drop, level: b.level.id, crack: b.p.crackTemp, postRate: b.p.postRate, preRate: b.p.preRate, window: b.p.window, perfect: b.p.perfect } : null,
        bags: bags.map(function (b2) { return { x: Math.round(b2.x), status: b2.status, coffee: b2.coffee.name }; }) };
    }
  };
})();
