// Cherry Catch: drawing, input, sound and screens. The rules live in logic.js.
(function () {
  'use strict';

  var L = window.CherryLogic;

  // Colors and font in one place so tweaks are easy. (Same palette as the other games.)
  var THEME = {
    font: "'Press Start 2P', ui-monospace, monospace",
    ink: '#0f1c26', blue: '#4298B5', blueDark: '#2c6a80', blueLight: '#9ad0e3',
    cream: '#f6edd6', gold: '#f2c744', red: '#e0503f'
  };
  var CHERRY = { green: '#6aa84f', yellow: '#f2c744', orange: '#f08a24', red: '#e0503f' };
  var SHADE = { green: '#4a7d36', yellow: '#c79a1c', orange: '#b8601a', red: '#a82f24' };
  var ART = {
    outline: '#140f0c', leaf: '#3f7d44', leafHi: '#6bb35e', stem: '#5b3b1e',
    wicker: '#c98b4f', wickerHi: '#e2ae72', wickerShade: '#8a5a2b',
    bird: '#1d2a33', birdHi: '#3b4f5e', beak: '#f08a24', belly: '#e9e4d2'
  };

  var ROCK = { base: '#8a8f94', hi: '#b4b9bd', shade: '#5c6166', hatch: '#454a4e' };
  var BAT = { body: '#3d3150', dark: '#2b2236', eye: '#ff6a55' };
  var POWER_COLOR = { cup: '#7fb6ff', scarecrow: '#e2ae72', sun: '#f2c744' };

  var W = L.W, H = L.H, BY = L.BASKET_Y;
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var pad = document.getElementById('pad');
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    points: $('points'), combo: $('combo'), best: $('best'), lives: $('lives'), banner: $('banner'), hint: $('hint'), status: $('status'),
    title: $('title'), over: $('over'), start: $('start'), again: $('again'), sound: $('sound'), contrast: $('contrast'),
    score: $('score'), newBest: $('new-best'), line: $('over-line'), rank: $('rank'), stats: $('review-stats'), bag: $('bag'), kilos: $('kilos')
  };

  // ---- feel-test switches (read once at load). Any of them makes the run "practice": no best score is saved. ----
  // ?lives=5  ?speed=1.2 (scales fall speed)  ?birds=0  ?miss=3 (every third missed red costs a life)  ?t=60 (start 60 s into the ramp)
  // ?items=0 (the core game: no rocks, bats, leaves or power-ups)  ?rocks=0  ?bats=0  ?leaves=0
  // ?vary=0.3 (fix the random fall-speed spread at +/-30%; 0 = every item falls at the same speed)  ?power=cup|scarecrow|sun (the first falling pickup is that one)  ?golden=1 (start with 2 lives; a golden cherry comes first)
  function readSwitch(name, lo, hi) {
    var m = new RegExp('[?&]' + name + '=(-?[0-9.]+)').exec(window.location.search);
    if (!m) return null;
    var v = parseFloat(m[1]);
    return isNaN(v) ? null : Math.max(lo, Math.min(hi, v));
  }
  function readWord(name, allowed) {
    var m = new RegExp('[?&]' + name + '=([a-z]+)').exec(window.location.search);
    return m && allowed.indexOf(m[1]) >= 0 ? m[1] : null;
  }
  var SWITCH = {
    lives: readSwitch('lives', 1, 99), speed: readSwitch('speed', 0.3, 3), birds: readSwitch('birds', 0, 1),
    miss: readSwitch('miss', 0, 99), t: readSwitch('t', 0, 600),
    items: readSwitch('items', 0, 1), rocks: readSwitch('rocks', 0, 1), bats: readSwitch('bats', 0, 1), leaves: readSwitch('leaves', 0, 1),
    vary: readSwitch('vary', 0, 0.6), golden: readSwitch('golden', 0, 1), power: readWord('power', ['cup', 'scarecrow', 'sun'])
  };
  var practice = false;
  for (var k in SWITCH) if (SWITCH[k] !== null) practice = true;

  // ---- game state ----
  var state = 'title';             // title | running | dying | over
  var world = L.newWorld();
  var sec = 0, shake = 0, flash = 0, hurt = 0, bounce = 0, deathT = 0, readyT = 0, warnFlash = 0;
  var particles = [], floaters = [], clouds = [];
  var startBest = 0, best = readBest();
  var soundOn = true, ac = null;   // on by default; the browser only starts audio after the first tap (Start)
  var contrast = readContrast();
  var bannerTimeout = 0;
  var steerId = null;              // the pointer that is steering the basket, if any
  var keyL = false, keyR = false, keyWas = false;

  function readBest() {
    try { return parseInt(localStorage.getItem('cherry.bestScore'), 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) { try { localStorage.setItem('cherry.bestScore', String(v)); } catch (e) { /* private mode */ } }
  function readContrast() {
    try { return localStorage.getItem('cherry.contrast') === '1'; } catch (e) { return false; }
  }
  function saveContrast(v) { try { localStorage.setItem('cherry.contrast', v ? '1' : '0'); } catch (e) { /* private mode */ } }

  // ---- sound (tiny synth, no files) ----
  // Real crow clips (audio/caw1.wav to caw4.wav, the same four recordings Cherry Picker uses). Loaded once audio starts; until they
  // arrive, or if they cannot load, the scarecrow caw falls back to a made-up synth caw.
  var cawBuffers = [], cawLoading = false;
  function loadCaws() {
    if (cawLoading || !ac || typeof fetch !== 'function') return;
    cawLoading = true;
    ['caw1', 'caw2', 'caw3', 'caw4'].forEach(function (name) {
      fetch('audio/' + name + '.wav')
        .then(function (r) { if (!r.ok) throw new Error('missing'); return r.arrayBuffer(); })
        .then(function (data) { return new Promise(function (ok, no) { ac.decodeAudioData(data, ok, no); }); })
        .then(function (buf) { cawBuffers.push(buf); })
        .catch(function () { /* keep the synth caw */ });
    });
  }
  function caw() {
    if (cawBuffers.length) {
      var src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = cawBuffers[Math.floor(Math.random() * cawBuffers.length)];
      src.playbackRate.value = 0.95 + Math.random() * 0.15; g.gain.value = 0.7;
      src.connect(g); g.connect(ac.destination); src.start();
    } else { tone(520, 0.14, 'sawtooth', 0.07, 0, 330); tone(480, 0.16, 'sawtooth', 0.07, 0.18, 300); }
  }
  function ensureAudio() {
    if (!ac) { var A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); }
    if (ac && ac.state === 'suspended') ac.resume();
    loadCaws();
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
    else if (name === 'catch') { var f = CHIME[Math.max(0, Math.min(CHIME.length - 1, (arg || 1) - 1))]; tone(f, 0.07, 'square', 0.06); tone(f * 2, 0.12, 'square', 0.05, 0.06); }
    else if (name === 'bad') { noise(0.16, 0.3); tone(150, 0.3, 'sawtooth', 0.07, 0, 70); }
    else if (name === 'miss') { tone(300, 0.1, 'triangle', 0.04, 0, 200); }
    else if (name === 'warn') { tone(1500, 0.07, 'square', 0.05); tone(1900, 0.07, 'square', 0.05, 0.1); tone(1500, 0.07, 'square', 0.05, 0.2); }
    else if (name === 'lock') { tone(1100, 0.05, 'square', 0.05); tone(1100, 0.05, 'square', 0.05, 0.09); }
    else if (name === 'swoop') { noise(0.3, 0.1); tone(900, 0.3, 'triangle', 0.05, 0, 250); }
    else if (name === 'steal') { tone(700, 0.12, 'sawtooth', 0.07, 0, 300); tone(500, 0.18, 'sawtooth', 0.06, 0.1, 200); }
    else if (name === 'caw') { caw(); }
    else if (name === 'scare') { tone(1200, 0.06, 'square', 0.05); tone(1700, 0.1, 'square', 0.05, 0.05); }
    else if (name === 'power') { [659, 784, 988, 1319].forEach(function (f3, i) { tone(f3, 0.1, 'square', 0.05, i * 0.07); }); }
    else if (name === 'powerEnd') { tone(660, 0.08, 'triangle', 0.04); tone(440, 0.12, 'triangle', 0.04, 0.08); }
    else if (name === 'life') { [523, 659, 784, 1047].forEach(function (f4, i) { tone(f4, 0.12, 'triangle', 0.07, i * 0.08); }); }
    else if (name === 'leaf') { tone(220, 0.1, 'triangle', 0.04, 0, 120); }
    else if (name === 'over') { [523, 440, 349, 262].forEach(function (f2, i) { tone(f2, 0.2, 'square', 0.06, i * 0.16); }); }
  }
  el.sound.addEventListener('click', function () {
    soundOn = !soundOn;
    el.sound.setAttribute('aria-pressed', String(soundOn));
    el.sound.textContent = 'Sound: ' + (soundOn ? 'on' : 'off');
    if (soundOn) { ensureAudio(); sfx('start'); }
  });
  function applyContrast() {
    el.contrast.setAttribute('aria-pressed', String(contrast));
    el.contrast.textContent = 'Contrast: ' + (contrast ? 'on' : 'off');
    document.body.classList.toggle('contrast', contrast);
  }
  el.contrast.addEventListener('click', function () { contrast = !contrast; saveContrast(contrast); applyContrast(); });
  applyContrast();


  // ---- the burlap sack on the end card ----
  // A 72 x 84 pixel-art sack, modelled on a real green-coffee sack: flat and sewn shut, stitched seams down the sides and across the
  // top, frayed corners, woven texture. Stamped with Roger's 8-bit Bird Rock van logo and "BIRD ROCK COFFEE". No image files needed.
  var FONT = {   // 3 x 5 pixel letters, one string per row
    B: ['110', '101', '110', '101', '110'], I: ['111', '010', '010', '010', '111'], R: ['110', '101', '110', '101', '101'],
    D: ['110', '101', '101', '101', '110'], O: ['010', '101', '101', '101', '010'], C: ['011', '100', '100', '100', '011'],
    K: ['101', '101', '110', '101', '101'], F: ['111', '100', '110', '100', '100'], E: ['111', '100', '110', '100', '111']
  };
  function pixelText(g, str, y, color) {
    var w = str.length * 4 - 1, x0 = Math.round((el.bag.width - w) / 2);
    g.fillStyle = color;
    for (var i = 0; i < str.length; i++) {
      var glyph = FONT[str[i]]; if (!glyph) continue;
      for (var r = 0; r < 5; r++) for (var c = 0; c < 3; c++) if (glyph[r][c] === '1') g.fillRect(x0 + i * 4 + c, y + r, 1, 1);
    }
  }
  // The Bird Rock van, facing right: Roger's pixel-art logo, shrunk once to a 54 x 40 grid (b = teal ink, w = white, . = nothing).
  // Stored as text so no image file is needed; the tiny "BRCR" lettering is too small to survive at this size.
  var VAN = [
    '........bbbb..........................................',
    '.......bbbbbb.........................................',
    '........bbbbbb..........bbbbbbbbbbbbbbbbb.............',
    '.........bbbbbb...bbbbbbbbbbbbbbbbbbbbbbbbbbbbb.......',
    '.........bbbbbbbbbbbbbbbbwwwwwwwwwwwwwwwbbbbbbbbbb....',
    '........bbbbbbbbbbbwwwwwwwwwwwwwwwwwwwwwwwwwwbbbbbbb..',
    '......bbbbbbbwwwwwwwbbbbbbbbbbbbbbbbbbbbbbbwwwwwwbbbb.',
    '......bbwwwwwwbbbbbbbb.............bbb....bbbbbbbb....',
    '......bbbbbbbbbb....bb.............bbb................',
    '.............bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.......',
    '...........bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb......',
    '..........bbbbbbbbbbbwbbbbbbbbbbbbbwwwwwwwwwwbbbb.....',
    '....bbbb.bbbbbbbbbbbbwbbbbbbbbbbbbbwwwwwwwwwwbbwbb....',
    '.........bbbbbwwbbbbbbbbbbbwwbbbbbbwwwwwwwwwwbwwbb....',
    '.bbbbbb.bbbbbbbwbbbbbwwwbbbwbbbbbbbwwwwwwwwwbbwwwb....',
    '........bbbbbbbbbbbwwwwwwbbbbbbbbbbwwwwwwwwwbbwwwb....',
    '...bbb.bbbbbbbbbbwwwwwwbbbbbbbbbbbbwwwwwwwwwbbwwwbb...',
    '.......bbbbbbbbbbwwwwbbwwwbbbbbbbbbwwwwwwwwwbwwwwwb...',
    '.......bbbbwwwbbwwwwbbwwwwbbwwwbbbbwwwwwwwwbbwwwwwb...',
    '.......bbbbbbbbwwwwwbbwwwwbbbbbbbbbbbbbbbbbbbbbwwwb...',
    '.......bbbbbbbbwwwbbbwwwwbbbbbbbbbbwbwwbbbwbbbbbbbbb..',
    '.......bbbbbbbbbbbbwwwwwbbbbbbbbbbbwbwwbbbwbbbbbbbbbb.',
    '.......bbbbbbbbbwwwwwwbbbbbbbbbbbbbwbbbbbbbbbbbbbbbbb.',
    '.......bbbbbbwbbbbwwbbbbbbwbbbbbbbbbbbbbbbbbbbbbbbwwwb',
    '.......bbbbbwbbbbbbbbbbbbbbwbbbbbbbbbbbbbbbbbbbbbbwwwb',
    '...bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbwwwb',
    '.......bbbbbbbbwwwwwwbbbbbbbbbbbbbwwwwwwbbbbbbbbbbbwbb',
    'bbbbbb.bbbbbbbwwwwwwwwwbbbbbbbbbbwwwwwwwwwbbbbbbbbbbb.',
    '..bbb..bbbbbwwwbbbbbbwwwbbbbbbbwwwbbbbbbbwwbbbbbbwwbb.',
    '..bbbb.bbbbbwwbbbbbbbbwwbbbbbbbwwbbbbbbbbwwbbbbbbbbbb.',
    '.......bbbbwwbbbwwwwbbbwwbbbbbwwbbbwwwwbbbwwbbbbbwwb..',
    '.......bbbbwwbbwwbbwwbbwwbbbbbwwbbwwbbwwbbwwbbbbwwbb..',
    '.....bbbbbbwbbwwbbbbwwbbwwbbbwwbbwwbbbbwwbbwbbbbbbb...',
    '......bbbbbwbbwbbbwbwwbbwwbbbwwbbwbbwwbwwbbwbbbbbbb...',
    '.......bbbwwbbwbbwbbwwbbwwbbbwwbbwbbwbbwwbbwwbbbbb....',
    '...........wbbwwbbbbwbbbw.....wbbwwbbbbwbbbw..........',
    '.............bbwwwwwwbb........bbbwwwwwwbb............',
    '.............bbbwwwwbbb.........bbbwwwwbbb............',
    '..............bbbbbbbb...........bbbbbbbb.............',
    '...............bbbbbb.............bbbbbb..............'
  ];
  function drawVan(g, ox, oy) {
    for (var y = 0; y < VAN.length; y++) for (var x = 0; x < VAN[y].length; x++) {
      var c = VAN[y][x];
      if (c === '.') continue;
      g.fillStyle = c === 'b' ? '#027089' : '#f4ead0';
      g.fillRect(ox + x, oy + y, 1, 1);
    }
  }
  function drawBag() {
    var g = el.bag.getContext('2d'), x, y, seed = 7;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    var OUT = '#3b2a1a', BASE = '#c9a26a', LIGHT = '#dbbb86', DARK = '#a98249', SHADE = '#94703f', STITCH = '#f1e6cc';
    var L = 3, T = 3, Rr = 68, Bm = 80;                                           // the sack's edges
    g.clearRect(0, 0, 72, 84);
    for (y = T; y <= Bm; y++) for (x = L; x <= Rr; x++) {
      var corner = (x === L || x === Rr) && (y === T || y === Bm);
      if (corner) continue;
      var r = rnd(), c = ((x >> 1) + (y >> 1)) % 2 ? BASE : LIGHT;               // woven cells
      if (y % 2 === 0 && x % 2 === 1) c = BASE;
      if (r > 0.88) c = DARK;
      if (x >= Rr - 3 || y >= Bm - 2) c = r > 0.5 ? DARK : SHADE;                // shaded right and bottom edges
      if (x === L || x === Rr || y === T || y === Bm) c = OUT;
      g.fillStyle = c; g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = STITCH;                                                         // stitched seams: both sides and the top
    for (y = T + 4; y < Bm - 2; y += 2) { g.fillRect(L + 3, y, 1, 1); g.fillRect(Rr - 3, y, 1, 1); }
    for (x = L + 3; x <= Rr - 3; x += 2) g.fillRect(x, T + 3, 1, 1);
    g.fillStyle = DARK;                                                           // frayed corners
    [[1, 2], [2, 1], [0, 4], [69, 2], [70, 4], [68, 1], [1, 81], [2, 82], [0, 79], [70, 81], [69, 82], [71, 79]].forEach(function (p) { g.fillRect(p[0], p[1], 1, 1); });
    g.fillStyle = LIGHT; [[2, 3], [69, 3], [2, 80], [69, 80]].forEach(function (p) { g.fillRect(p[0], p[1], 1, 1); });
    drawVan(g, 9, 12);
    pixelText(g, 'BIRD ROCK', 57, '#1d4a5e');
    pixelText(g, 'COFFEE', 64, '#1d4a5e');
  }
  drawBag();

  // ---- flow ----
  function say(msg) { el.status.textContent = msg; }
  function banner(text, bad) {
    el.banner.textContent = text;
    el.banner.className = 'banner show' + (bad ? ' bad' : '');
    clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(function () { el.banner.className = 'banner'; }, 1300);
  }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function hud() {
    el.points.textContent = fmt(world.score);
    el.best.textContent = fmt(best);
    el.combo.textContent = world.combo > 1 ? 'x' + world.combo : '';   // the multiplier the NEXT red will get
    var dots = el.lives.children, max = Math.min(6, Math.max(world.maxLives, world.lives));   // feel-test ?lives=99 would otherwise draw 99 icons
    while (dots.length < max) { var i = document.createElement('i'); i.className = 'life'; el.lives.appendChild(i); }
    for (var j = 0; j < dots.length; j++) dots[j].className = 'life' + (j < Math.min(world.lives, 6) ? ' on' : '');
    el.lives.setAttribute('aria-label', world.lives + (world.lives === 1 ? ' life' : ' lives'));
  }

  function startRun() {
    world = L.newWorld({
      seed: Math.floor(Math.random() * 1e9) + 1,
      lives: SWITCH.lives === null ? undefined : Math.round(SWITCH.lives),
      speedScale: SWITCH.speed === null ? undefined : SWITCH.speed,
      birds: SWITCH.birds === null ? undefined : SWITCH.birds !== 0,
      missesPerLife: SWITCH.miss === null ? undefined : Math.round(SWITCH.miss),
      startT: SWITCH.t === null ? 0 : SWITCH.t,
      items: SWITCH.items === null ? undefined : SWITCH.items !== 0,
      rocks: SWITCH.rocks === null ? undefined : SWITCH.rocks !== 0,
      bats: SWITCH.bats === null ? undefined : SWITCH.bats !== 0,
      leaves: SWITCH.leaves === null ? undefined : SWITCH.leaves !== 0,
      vary: SWITCH.vary === null ? undefined : SWITCH.vary,
      golden: SWITCH.golden === 1,
      power: SWITCH.power || undefined
    });
    if (SWITCH.golden === 1 && SWITCH.lives === null) world.lives = 2;   // a golden cherry is only welcome below full lives
    startBest = best;
    particles = []; floaters = []; shake = 0; flash = 0; hurt = 0; bounce = 0; warnFlash = 0; readyT = 0;
    steerId = null; keyL = keyR = keyWas = false; pad.classList.remove('on');
    el.title.hidden = true; el.over.hidden = true;
    state = 'running';
    sfx('start');
    hud();
    banner('READY?');
    say('Slide the basket to catch only the red cherries. ' + world.lives + ' lives.');
  }

  function burst(x, y, n, colors) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 90;
      particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 50, life: 0.5 + Math.random() * 0.4, c: colors[i % colors.length] });
    }
  }

  function die() {
    state = 'dying'; deathT = 0; shake = 0.3; flash = 0.4;
    sfx('over');
  }

  function onEvents(events) {
    events.forEach(function (e) {
      if (e.type === 'catch') {
        var mult = Math.round(e.points / L.POINTS_RED);
        floaters.push({ x: world.basketX, y: BY - 14, text: '+' + e.points, life: 0.8 });
        if (mult > 1) floaters.push({ x: world.basketX, y: BY - 26, text: 'x' + mult, life: 0.8 });
        burst(e.x, BY - 4, 8, [CHERRY.red, THEME.cream, THEME.gold]);
        bounce = 0.2;
        sfx('catch', mult);
        if (!practice && world.score > best) { best = world.score; saveBest(best); }
        hud();
      } else if (e.type === 'bad') {
        var what = e.kind === 'rock' ? 'a rock' : e.kind === 'bat' ? 'a bat' : 'not ripe';
        floaters.push({ x: world.basketX, y: BY - 14, text: 'OUCH', life: 0.8 });
        burst(e.x, BY - 4, 10, e.kind === 'cherry' ? [CHERRY[e.stage], ART.outline] : e.kind === 'rock' ? [ROCK.base, ROCK.hi, ART.outline] : ['#3d3150', '#2b2236', ART.outline]);
        shake = Math.max(shake, 0.2); hurt = 0.35;
        sfx('bad');
        if (e.livesLeft > 0) banner(e.kind === 'rock' ? 'ROCK!' : e.kind === 'bat' ? 'BAT!' : 'NOT RIPE!', true);
        say('That was ' + what + '. ' + e.livesLeft + (e.livesLeft === 1 ? ' life left.' : ' lives left.'));
        hud();
      } else if (e.type === 'leaf') {
        floaters.push({ x: world.basketX, y: BY - 14, text: 'LEAF', life: 0.7 });
        burst(e.x, BY - 4, 5, [ART.leafHi, ART.leaf]);
        sfx('leaf');
        say('A leaf. Combo reset.');
        hud();
      } else if (e.type === 'power') {
        banner(L.POWER_NAMES[e.kind].toUpperCase() + '!');
        floaters.push({ x: world.basketX, y: BY - 14, text: L.POWER_NAMES[e.kind], life: 1.1 });
        burst(e.x, BY - 4, 12, [THEME.gold, THEME.cream, '#ffffff']);
        bounce = 0.2; flash = 0.25;
        sfx('power');
        say(({ cup: 'Slow motion for 5 seconds.', scarecrow: 'Scarecrow. Birds will caw and fly off instead of stealing for 10 seconds.', sun: 'Sunshine. Every cherry is ripe and missing one is free for 4 seconds.' })[e.kind]);
      } else if (e.type === 'powerEnd') {
        if (!e.replaced) { sfx('powerEnd'); say(L.POWER_NAMES[e.kind] + ' wore off.'); }
      } else if (e.type === 'life') {
        banner('EXTRA LIFE!');
        floaters.push({ x: world.basketX, y: BY - 14, text: '+1 LIFE', life: 1 });
        burst(e.x, BY - 4, 12, [THEME.gold, '#ffffff']);
        bounce = 0.25; flash = 0.25;
        sfx('life');
        say('Extra life. ' + e.lives + ' lives.');
        hud();
      } else if (e.type === 'miss') {
        floaters.push({ x: e.x, y: BY - 6, text: 'MISSED', life: 0.6 });
        sfx('miss');
        if (e.costsLife) { shake = Math.max(shake, 0.2); hurt = 0.35; say('Missed a red cherry. ' + e.livesLeft + ' lives left.'); }
        hud();
      } else if (e.type === 'warn') {
        warnFlash = world.bird ? world.bird.warn : L.BIRD_WARN;
        sfx('warn');
        say('Bird coming! Wait until it locks onto a cherry, then tap the bird or press Space.');
      } else if (e.type === 'lock') {
        sfx('lock');
        say('The bird has locked onto a cherry. Tap the bird or press Space now.');
      } else if (e.type === 'swoop') {
        sfx('swoop');
      } else if (e.type === 'steal') {
        floaters.push({ x: e.x, y: e.y, text: 'STOLEN!', life: 0.9 });
        burst(e.x, e.y, 6, [CHERRY.red, ART.bird]);
        shake = Math.max(shake, 0.2); hurt = 0.35;
        sfx('steal');
        if (e.livesLeft > 0) banner('STOLEN!', true);
        say('The bird stole a red cherry and it cost a life. ' + e.livesLeft + (e.livesLeft === 1 ? ' life left.' : ' lives left.'));
        hud();
      } else if (e.type === 'scare') {
        floaters.push({ x: world.bird ? world.bird.x : W / 2, y: world.bird ? world.bird.y + 14 : 60, text: e.by === 'scarecrow' ? 'CAW!' : e.left > 0 ? 'AGAIN!' : 'SHOO!', life: 0.7 });
        sfx(e.by === 'scarecrow' ? 'caw' : 'scare');
        say(e.by === 'scarecrow' ? 'The scarecrow scared the bird. It cawed and flew away.' : e.left > 0 ? 'The bird backed off but it is coming back. Shoo it again.' : 'You scared the bird away.');
      } else if (e.type === 'over') {
        die();
      }
    });
  }

  function showOver() {
    state = 'over';
    el.score.textContent = fmt(world.score);
    el.newBest.hidden = !(!practice && world.score > 0 && world.score > startBest);
    el.line.textContent = (practice ? 'Practice run. ' : '') + L.pickLine(world.cause);
    el.rank.textContent = 'Rank: ' + L.rankFor(world.score);
    el.kilos.textContent = 'You picked ' + L.kilosFor(world.picked).toFixed(1) + ' kg of coffee!';
    el.stats.textContent = 'Cherries picked: ' + world.picked + '. Best combo: x' + world.bestCombo + '.';
    el.again.disabled = true;
    el.over.hidden = false;
    if (window.ShareCard) ShareCard.show({ game: 'cherry', score: world.score, line: L.rankFor(world.score), practice: practice, mount: document.getElementById('share') });
    if (window.Leaderboard) Leaderboard.show({ game: 'cherry', score: world.score, practice: practice, mount: document.getElementById('lb') });
    setTimeout(function () { el.again.disabled = false; if (!(window.Leaderboard && Leaderboard.typing())) el.again.focus(); }, 500);   // stops a stray tap from skipping the card
    say('Game over. Score ' + world.score + '. ' + el.rank.textContent + '. ' + el.kilos.textContent + ' ' + el.stats.textContent);
  }

  // ---- scaring the bird ----
  function scare() {
    if (state !== 'running') return false;
    return L.scareBird(world);
  }

  // ---- input ----
  // Pointer position in canvas units (240 x 320), for the canvas or the touch strip.
  function toCanvas(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  function steer(p) { if (state === 'running') L.setTarget(world, p.x); }
  function bindSteer(node, isPad) {
    node.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      var p = toCanvas(e);
      if (isPad || p.y >= L.SKY_BAND) {
        steerId = e.pointerId;
        try { node.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
        pad.classList.add('on');
        steer(p);
      } else {
        // A press up in the sky band never moves the basket; it scares the bird if one is near.
        var b = world.bird;
        if (b && Math.abs(p.x - b.x) <= 26 && Math.abs(p.y - b.y) <= 26) scare();
      }
    });
    node.addEventListener('pointermove', function (e) {
      var p = toCanvas(e);
      if (steerId === e.pointerId) steer(p);                                   // a drag that started below the band keeps steering
      else if (e.pointerType === 'mouse' && (isPad || p.y >= L.SKY_BAND)) steer(p);   // a mouse needs no button
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      node.addEventListener(ev, function (e) { if (steerId === e.pointerId) stopSteer(); });
    });
    node.addEventListener('lostpointercapture', function (e) { if (steerId === e.pointerId) stopSteer(); });
    node.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  function stopSteer() { steerId = null; pad.classList.remove('on'); }
  bindSteer(canvas, false);
  bindSteer(pad, true);

  el.start.addEventListener('click', startRun);
  el.again.addEventListener('click', startRun);

  function keyDir(e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') return -1;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') return 1;
    return 0;
  }
  window.addEventListener('keydown', function (e) {
    if (state !== 'running') return;
    var d = keyDir(e);
    if (d) { e.preventDefault(); if (d < 0) keyL = true; else keyR = true; }
    else if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) scare(); }
  });
  window.addEventListener('keyup', function (e) {
    var d = keyDir(e);
    if (!d) return;
    if (d < 0) keyL = false; else keyR = false;
  });
  // Keys at the basket's full speed: head for the wall while held; on release, stop where it is.
  function applyKeys() {
    if (keyL !== keyR) { L.setTarget(world, keyL ? 0 : W); keyWas = true; }
    else if (keyWas) { L.setTarget(world, world.basketX); keyWas = false; }
  }
  // If the page loses focus mid-play, let go instead of getting stuck.
  function releaseAll() { keyL = keyR = false; stopSteer(); }
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', function () { if (document.hidden) releaseAll(); });

  // ---- update ----
  function update(dt) {
    sec += dt;
    shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt * 3); hurt = Math.max(0, hurt - dt);
    bounce = Math.max(0, bounce - dt); warnFlash = Math.max(0, warnFlash - dt);
    floaters.forEach(function (f) { f.y -= 20 * dt; f.life -= dt; });
    floaters = floaters.filter(function (f) { return f.life > 0; });
    particles.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; p.life -= dt; });
    particles = particles.filter(function (p) { return p.life > 0 && p.y < H + 4; });
    clouds.forEach(function (c) { c.x += c.v * dt; if (c.x > W + 30) c.x = -40; });

    if (state === 'running') {
      readyT += dt;
      var left = dt;
      while (left > 0 && state === 'running') {
        var step = Math.min(1 / 60, left);
        applyKeys();
        onEvents(L.stepWorld(world, step));
        left -= step;
      }
    } else if (state === 'dying') {
      deathT += dt;
      if (deathT >= 0.8) showOver();
    }
    canvas.style.transform = shake > 0 ? 'translate(' + (Math.random() * 4 - 2).toFixed(1) + 'px,' + (Math.random() * 4 - 2).toFixed(1) + 'px)' : '';
  }

  // ---- drawing (pixel art with fillRect) ----
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function disc(cx, cy, r, c, g) {
    var q = g || ctx;
    q.fillStyle = c;
    for (var y = -r; y <= r; y++) { var w = Math.floor(Math.sqrt(r * r - y * y)); q.fillRect(Math.round(cx) - w, Math.round(cy) + y, w * 2 + 1, 1); }
  }
  function text(str, x, y, size, color, align) {
    ctx.font = size + 'px ' + THEME.font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, Math.round(x), Math.round(y));
  }
  function shadowText(str, x, y, size, color, align) {
    text(str, x + 1, y + 1, size, THEME.ink, align); text(str, x, y, size, color, align);
  }

  // The backdrop that never changes (sky, far hills, coffee-bush rows, tree canopy at the top) is drawn once.
  var bg = document.createElement('canvas'); bg.width = W; bg.height = H;
  (function paintBackdrop() {
    var g = bg.getContext('2d');
    function r2(x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
    r2(0, 0, W, H, THEME.blue);
    r2(0, 70, W, 90, '#59a6c1'); r2(0, 160, W, 80, '#7ab9cf');          // the sky lightens toward the horizon
    disc(30, 262, 60, '#5f9a62', g); disc(150, 280, 90, '#5f9a62', g); disc(250, 262, 62, '#5f9a62', g);   // far hills
    disc(70, 322, 70, '#3f7d44', g); disc(200, 330, 80, '#3f7d44', g);                                    // near hills
    r2(0, 304, W, 16, '#335f37');
    for (var row = 0; row < 2; row++) {                                  // coffee bushes with a few red cherries
      for (var x = row * 9 - 4; x < W + 10; x += 18) {
        disc(x, 308 + row * 8, 9, row ? '#2b5230' : '#3b7140', g);
        disc(x - 3, 305 + row * 8, 3, row ? '#3b7140' : '#4f8a53', g);
        if ((x * 7 + row * 5) % 4 === 0) { r2(x + 2, 306 + row * 8, 2, 2, '#e0503f'); }
      }
    }
    for (var tx = -6; tx < W + 10; tx += 16) {                            // tree canopy along the top, where the cherries grow
      disc(tx, 2, 11, '#2f6b3a', g); disc(tx + 8, -1, 9, '#3f7d44', g);
    }
    r2(0, 0, W, 4, '#2f6b3a');
  })();
  for (var ci = 0; ci < 4; ci++) clouds.push({ x: ci * 70, y: 28 + (ci * 37) % 70, v: 3 + ci * 1.5, s: 1 + (ci % 2) });

  function drawCloud(c) {
    var s = c.s * 6, col = 'rgba(255,255,255,0.55)';
    disc(c.x, c.y, s, col); disc(c.x + s, c.y + 2, s * 0.8, col); disc(c.x - s, c.y + 3, s * 0.7, col);
  }

  // All cherries are the same size (Roger, 2026-11-19: a bigger red made them too easy to spot). Red ones keep a white shine,
  // so ripeness never relies on color alone, and High contrast adds a white ring around them.
  function drawCherry(c) {
    var red = c.stage === 'red', r = L.CHERRY_R, x = Math.round(c.x), y = Math.round(c.y);
    var sway = Math.round(Math.sin(sec * 1.6 + c.spin * 6.28) * 2);
    rect(x + sway - 1, y - r - 5, 2, 6, ART.stem);                         // stem, swinging as the cherry turns
    rect(x + sway + 1, y - r - 5, 4, 2, ART.leaf); rect(x + sway + 2, y - r - 6, 2, 1, ART.leafHi);
    if (red && contrast) disc(x, y, r + 2, '#ffffff');
    disc(x, y, r + 1, ART.outline);
    disc(x, y, r, CHERRY[c.stage]);
    disc(x + 2, y + 2, Math.max(2, r - 3), SHADE[c.stage]);
    rect(x - 3, y - 3, 3, 1, 'rgba(255,255,255,0.45)');
    if (red) { rect(x - 4, y - 4, 2, 2, '#ffffff'); rect(x - 2, y - 4, 1, 1, '#ffffff'); }   // the shine: red only
  }


  // ---- the other things that fall. Every one has its own SHAPE, so nothing depends on color alone. ----
  // A list of [x, y, w, h] boxes drawn with an outline: all the outlines first, then all the fills, so boxes do not eat each other's edges.
  function shape(cx, cy, boxes, color) {
    boxes.forEach(function (b) { rect(cx + b[0] - 1, cy + b[1] - 1, b[2] + 2, b[3] + 2, ART.outline); });
    boxes.forEach(function (b) { rect(cx + b[0], cy + b[1], b[2], b[3], color); });
  }
  // Rock: grey, angular, with dark hatching. Flips sideways now and then as it tumbles.
  var ROCK_ROWS = [[-3, 2], [-5, 4], [-7, 6], [-8, 7], [-8, 8], [-7, 8], [-8, 7], [-7, 6], [-6, 5], [-4, 3]];
  function drawRock(c) {
    var x = Math.round(c.x), y = Math.round(c.y), flip = Math.floor(sec * 3 + c.spin * 8) % 2 ? -1 : 1;
    ROCK_ROWS.forEach(function (r, i) { var x0 = flip > 0 ? r[0] : -r[1], x1 = flip > 0 ? r[1] : -r[0]; rect(x + x0 - 1, y - 6 + i - 1, x1 - x0 + 3, 3, ART.outline); });
    ROCK_ROWS.forEach(function (r, i) {
      var x0 = flip > 0 ? r[0] : -r[1], x1 = flip > 0 ? r[1] : -r[0];
      rect(x + x0, y - 6 + i, x1 - x0 + 1, 1, i < 4 ? ROCK.base : i < 7 ? ROCK.shade : ROCK.hatch === 0 ? ROCK.base : ROCK.shade);
    });
    rect(x - 4 * flip - (flip < 0 ? 2 : 0), y - 4, 3, 2, ROCK.hi); rect(x - 2 * flip - (flip < 0 ? 1 : 0), y - 5, 2, 1, ROCK.hi);   // light from the top left
    for (var h = 0; h < 3; h++) rect(x + (h * 3 - 3) * flip - (flip < 0 ? 1 : 0), y + 1 + h, 3, 1, ROCK.hatch);                       // hatching
  }
  // Bat: dark body, pointed ears, two red eyes, wings that flap.
  function drawBat(c) {
    var x = Math.round(c.x), y = Math.round(c.y), up = Math.floor(sec * 9 + c.spin * 5) % 2 === 0;
    var wl = up ? [[-12, -6, 8, 2], [-10, -4, 7, 2], [-8, -2, 5, 2]] : [[-12, 2, 8, 2], [-10, 0, 7, 2], [-8, -2, 5, 2]];
    var wr = wl.map(function (b) { return [-b[0] - b[2] + 1, b[1], b[2], b[3]]; });
    shape(x, y, wl.concat(wr), BAT.body);
    shape(x, y, [[-3, -3, 7, 8], [-3, -6, 2, 3], [2, -6, 2, 3]], BAT.dark);
    rect(x - 2, y - 1, 1, 1, BAT.eye); rect(x + 2, y - 1, 1, 1, BAT.eye);
  }
  // Leaf: a long flat green leaf with a pale vein, tilting one way then the other as it sways.
  function drawLeaf(c) {
    var x = Math.round(c.x), y = Math.round(c.y), sgn = Math.cos(c.omega * c.age + c.phase) >= 0 ? 1 : -1, i, hf;
    for (i = -7; i <= 7; i++) { hf = Math.round(3 * Math.sqrt(1 - (i / 7.8) * (i / 7.8))); rect(x + i - 1, y + sgn * Math.round(i * 0.5) - hf - 1, 3, 2 * hf + 3, ART.outline); }
    for (i = -7; i <= 7; i++) {
      hf = Math.round(3 * Math.sqrt(1 - (i / 7.8) * (i / 7.8)));
      rect(x + i, y + sgn * Math.round(i * 0.5) - hf, 1, 2 * hf + 1, i % 2 ? '#7dbb55' : '#6bb35e');
      rect(x + i, y + sgn * Math.round(i * 0.5), 1, 1, '#2e5e33');
    }
  }
  // A pickup: a cream disc with a pulsing gold halo, and a little picture inside.
  function drawPickup(c) {
    var x = Math.round(c.x), y = Math.round(c.y), pulse = Math.round(Math.sin(sec * 8) * 1.5), a;
    for (a = 0; a < 12; a++) rect(x + Math.cos(a * Math.PI / 6 + sec) * (13 + pulse) - 1, y + Math.sin(a * Math.PI / 6 + sec) * (13 + pulse) - 1, 2, 2, THEME.gold);
    disc(x, y, 11, ART.outline); disc(x, y, 10, '#fff3c4'); disc(x, y, 8, THEME.cream);
    if (c.kind === 'cup') {
      shape(x, y, [[-4, -1, 8, 7]], '#ffffff'); shape(x, y, [[4, 0, 3, 4]], '#ffffff'); rect(x - 4, y - 1, 8, 2, '#5b3b1e'); rect(x + 5, y + 1, 1, 2, THEME.cream);
      rect(x - 2, y - 5 - Math.round(Math.sin(sec * 6)), 1, 3, '#9fb4c0'); rect(x + 1, y - 6 + Math.round(Math.sin(sec * 6)), 1, 3, '#9fb4c0');   // steam
    } else if (c.kind === 'scarecrow') {
      shape(x, y, [[-1, 1, 2, 7]], '#5b3b1e'); shape(x, y, [[-8, -2, 16, 2], [-4, -6, 8, 4]], '#d9b25a'); rect(x - 4, y - 3, 8, 1, '#a82f24');
    } else if (c.kind === 'sun') {
      for (a = 0; a < 8; a++) rect(x + Math.cos(a * Math.PI / 4) * 7 - 1, y + Math.sin(a * Math.PI / 4) * 7 - 1, 2, 2, '#e08a1e');
      disc(x, y, 4, ART.outline); disc(x, y, 3, '#f2c744');
    } else {   // gold: a golden cherry with a sparkle
      rect(x - 1, y - 7, 2, 4, ART.stem); rect(x + 1, y - 7, 4, 2, ART.leaf);
      disc(x, y + 1, 5, ART.outline); disc(x, y + 1, 4, '#f2c744'); rect(x - 3, y - 1, 2, 2, '#ffffff');
      if (Math.floor(sec * 5) % 2 === 0) { rect(x + 5, y - 6, 1, 5, '#ffffff'); rect(x + 3, y - 4, 5, 1, '#ffffff'); }
    }
  }
  function drawThing(c) {
    if (c.kind === 'cherry') drawCherry(c);
    else if (c.kind === 'rock') drawRock(c);
    else if (c.kind === 'bat') drawBat(c);
    else if (c.kind === 'leaf') drawLeaf(c);
    else drawPickup(c);
  }
  // The scarecrow that stands at the edge of the field while its power-up lasts.
  function drawScarecrow() {
    var x = W - 14, y = BY - 56;
    shape(x, y, [[-1, 0, 3, 52]], '#5b3b1e'); shape(x, y, [[-9, 14, 19, 3]], '#5b3b1e');
    disc(x, y + 6, 5, ART.outline); disc(x, y + 6, 4, '#e2ae72'); rect(x - 2, y + 5, 1, 1, ART.outline); rect(x + 1, y + 5, 1, 1, ART.outline);
    shape(x, y, [[-8, 0, 16, 2], [-4, -5, 8, 5]], '#d9b25a');
    rect(x - 10, y + 17, 3, 4, '#d9b25a'); rect(x + 8, y + 17, 3, 4, '#d9b25a');
  }
  // Tints and a countdown bar for whichever power-up is on.
  function drawPowerOverlay() {
    var p = world.power;
    if (!p) return;
    if (p.kind === 'cup') {
      rect(0, 0, W, H, 'rgba(110,160,255,0.13)');
      ctx.globalAlpha = 0.35;
      world.cherries.forEach(function (c) { rect(c.x, c.y - 22, 1, 10, '#ffffff'); rect(c.x - 4, c.y - 18, 1, 6, '#ffffff'); rect(c.x + 4, c.y - 18, 1, 6, '#ffffff'); });
      ctx.globalAlpha = 1;
    } else if (p.kind === 'sun') {
      rect(0, 0, W, H, 'rgba(255,200,60,0.12)');
      for (var i = 0; i < 7; i++) rect(i * 38 - 20 + Math.sin(sec * 1.5 + i) * 6, 0, 12, 200, 'rgba(255,240,150,0.10)');
    }
    var total = L.POWER_TIME[p.kind], frac = Math.max(0, p.left / total), cx = Math.round(world.basketX);
    if (p.left > 1.5 || Math.floor(sec * 8) % 2 === 0) {            // blinks in the last 1.5 s
      rect(cx - 24, BY - 11, 48, 5, ART.outline); rect(cx - 23, BY - 10, 46, 3, THEME.ink); rect(cx - 23, BY - 10, Math.round(46 * frac), 3, POWER_COLOR[p.kind]);
    }
  }

  function drawBasket() {
    var cx = Math.round(world.basketX), sq = bounce > 0 ? Math.sin((bounce / 0.2) * Math.PI) : 0;
    var top = BY - 2 + Math.round(sq * 2), hgt = 18 - Math.round(sq * 2);
    rect(cx - 24, top - 1, 48, 6, ART.outline); rect(cx - 23, top, 46, 4, ART.wickerHi);       // rim
    for (var row = 0; row < hgt - 4; row++) {                                                  // woven body, narrowing toward the bottom
      var w = 44 - Math.round(row * 0.6), x0 = cx - Math.floor(w / 2), y = top + 4 + row;
      rect(x0 - 1, y, w + 2, 1, ART.outline);
      for (var x = 0; x < w; x += 4) rect(x0 + x, y, 4, 1, (((x >> 2) + (row >> 1)) & 1) ? ART.wicker : ART.wickerShade);
    }
    rect(cx - 20, top + hgt, 40, 1, ART.outline);
    if (hurt > 0 && Math.floor(sec * 20) % 2 === 0) rect(cx - 24, top - 1, 48, hgt + 2, 'rgba(224,80,63,0.55)');
  }

  // The bird: a dark body with a cream belly and an orange beak, flapping. `dir` is the way it faces (1 = right).
  function drawBird(b) {
    var dir = (b.state === 'swoop' || b.state === 'lock') ? ((world.cherries.filter(function (c) { return c.id === b.target; })[0] || { x: b.x + b.dir }).x >= b.x ? 1 : -1)
      : b.state === 'leaving' ? (b.vx >= 0 ? 1 : -1) : b.dir;
    var x = Math.round(b.x), y = Math.round(b.y), up = Math.floor(sec * 10) % 2 === 0;
    function R(dx, dy, w, h, c) { rect(dir > 0 ? x + dx : x - dx - w, y + dy, w, h, c); }
    R(-8, -5, 17, 11, ART.outline);                           // outline
    R(-7, -4, 15, 9, ART.bird);                               // body
    R(-5, 0, 9, 4, ART.belly);                                // belly
    R(5, -7, 7, 7, ART.outline); R(6, -6, 5, 5, ART.bird);    // head
    R(12, -4, 4, 3, ART.outline); R(12, -3, 3, 2, ART.beak);  // beak
    R(9, -5, 1, 1, '#ffffff');                                // eye
    R(-12, -3, 5, 4, ART.outline); R(-11, -2, 4, 2, ART.birdHi);   // tail
    if (up) { R(-3, -13, 6, 9, ART.outline); R(-2, -12, 4, 8, ART.birdHi); }               // wing up
    else { R(-3, 4, 6, 8, ART.outline); R(-2, 5, 4, 6, ART.birdHi); }                      // wing down
    if (b.needs > 1) {                                        // little pips: how many more shoos it takes
      for (var p = 0; p < b.needs - b.shoos; p++) { rect(x - ((b.needs - b.shoos) * 4 - 1) / 2 + p * 4, y - 22, 3, 3, ART.outline); rect(x - ((b.needs - b.shoos) * 4 - 1) / 2 + p * 4 + 1, y - 21, 1, 1, THEME.gold); }
    }
    if (b.loot) { disc(x + dir * 6, y + 9, 4, ART.outline); disc(x + dir * 6, y + 9, 3, CHERRY.red); }
    if (b.state === 'warn' && Math.floor(sec * 6) % 2 === 0) shadowText('!', x, y - 16, 14, THEME.gold, 'center');
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0);
    clouds.forEach(drawCloud);
    var b = world.bird;
    // The cue to shoo: a dotted line from the bird to the cherry it has locked onto, and a ring around that cherry.
    // It shows from lock-on (before the dive) until the dive ends. A shoo only counts while it shows.
    if (b && (b.state === 'lock' || b.state === 'swoop')) {
      var tc = world.cherries.filter(function (c) { return c.id === b.target; })[0];
      if (tc) {
        ctx.globalAlpha = b.state === 'lock' ? 0.9 : 0.55;
        for (var i = 1; i < 10; i++) rect(b.x + (tc.x - b.x) * i / 10, b.y + (tc.y - b.y) * i / 10, 2, 2, '#ffffff');
        ctx.globalAlpha = 1;
        var pr = 11 + Math.round(Math.sin(sec * 14) * 1.5);
        for (var a = 0; a < 12; a++) rect(tc.x + Math.cos(a * Math.PI / 6) * pr - 1, tc.y + Math.sin(a * Math.PI / 6) * pr - 1, 2, 2, THEME.gold);
      }
    }
    if (world.power && world.power.kind === 'scarecrow') drawScarecrow();
    world.cherries.forEach(drawThing);
    drawBasket();
    if (b) drawBird(b);
    drawPowerOverlay();
    particles.forEach(function (p) { rect(p.x, p.y, 3, 3, p.c); });
    floaters.forEach(function (f) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 2));
      shadowText(f.text, f.x, f.y, 8, THEME.gold, 'center');
      ctx.globalAlpha = 1;
    });
    // The warning has to work with the sound off: a flashing red strip across the top while the bird crosses.
    if (warnFlash > 0 && Math.floor(sec * 6) % 2 === 0) { rect(0, 0, W, 5, THEME.red); rect(0, H - 5, W, 5, THEME.red); }
    if (state === 'running' && world.t - (SWITCH.t || 0) < L.FIRST_SPAWN * 0.9) shadowText('READY?', W / 2, 150, 14, THEME.cream, 'center');
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
  window.__cherry = {
    advance: function (s) { while (s > 0) { var d = Math.min(0.05, s); update(d); s -= d; } draw(); },
    start: startRun,
    setTarget: function (x) { L.setTarget(world, x); },
    scare: scare,
    // Puts a cherry of this stage at x, just above the rim by default, so a check can catch or dodge it on purpose.
    drop: function (stage, x, y) {
      var vy = 120, yy = y === undefined ? 250 : y;
      var c = { id: world.nextId++, kind: 'cherry', stage: stage, x: x, y: yy, vy: vy, arrive: world.t + (BY - yy) / vy, spin: 0.5 };
      world.cherries.push(c);
      return c.id;
    },
    // Puts any other falling thing (rock, bat, leaf, cup, scarecrow, sun, gold) at x, just above the rim by default.
    dropItem: function (kind, x, y) {
      var yy = y === undefined ? 250 : y, vy = 120;
      var c = { id: world.nextId++, kind: kind, stage: null, x: x, y: yy, vy: vy * world.speedScale, arrive: world.t + (BY - yy) / (vy * world.speedMul), spin: 0.5, age: 0 };
      if (kind === 'bat' || kind === 'leaf') { c.amp = 0; c.omega = 1; c.phase = 0; c.x0 = x; }   // a still bat or leaf, for looks and catch checks
      world.cherries.push(c);
      return c.id;
    },
    get: function () {
      return {
        state: state, score: world.score, lives: world.lives, combo: world.combo, bestCombo: world.bestCombo, picked: world.picked,
        basketX: world.basketX, targetX: world.targetX, t: world.t, over: world.over, practice: practice,
        power: world.power ? { kind: world.power.kind, left: world.power.left } : null, speedMul: world.speedMul, maxLives: world.maxLives,
        cherries: world.cherries.map(function (c) { return { kind: c.kind, stage: c.stage, x: Math.round(c.x), y: Math.round(c.y) }; }),
        bird: world.bird ? { state: world.bird.state, x: Math.round(world.bird.x), y: Math.round(world.bird.y) } : null
      };
    }
  };
})();
