// Forklift Frenzy (folder and id: dock): drawing, input and screens. Rules live in logic.js.
// Feel-test switches: ?swing=1 strict swing turns (default turns in place, Roger 2026-10-26), ?prep=N seconds of study time,
// ?truck=N first truck, ?trucks=N trucks per shift (default: no limit, the run goes until three strikes).
// ?lesson=N opens the tutorial at lesson N, skipping the title card.
(function () {
  'use strict';

  var L = window.DockLogic, TUT = window.DockTutorial;

  // Colors and font in one place so tweaks are easy. (Same palette as the other games.)
  var THEME = {
    font: "'Press Start 2P', ui-monospace, monospace",
    ink: '#0f1c26', blue: '#4298B5', blueDark: '#2c6a80', blueLight: '#9ad0e3',
    cream: '#f6edd6', gold: '#f2c744', red: '#e0503f', green: '#6cc070'
  };
  var ART = {
    outline: '#140f0c',
    floor: '#3b4851', floorSeam: '#33404a', dock: '#4a4a3c', dockSeam: '#403f33', wall: '#1d2830',
    rack: '#22303a', beam: '#e07b2a', upright: '#2c6a80', slot: '#121b22', slotNum: '#3d4f5c',
    pallet: '#b07a45', palletDark: '#7d532b', burlap: '#c9a66b', burlapDark: '#9c7c48',
    body: '#f2c744', bodyDark: '#b8901f', tire: '#111111', guard: '#1b1b1b', seat: '#3a3a3a',
    steel: '#a9b5bd', steelDark: '#5d6a73',
    jack: '#d23a2a', jackDark: '#8a2218', vest: '#f08a24', vestStripe: '#f6edd6', skin: '#d9a77c', hat: '#f2f2f2',
    shutter: '#7d8b94', shutterDark: '#56636b'
  };
  var ORIGIN_COLORS = ['#e0503f', '#5fb8e0', '#6cc070', '#b583d9', '#f08a24'];

  var T = 32, W = L.COLS * T, H = L.ROWS * T;
  var SHIFT = readNum('trucks', 0, 0, 50);          // trucks in one shift; 0 = no limit (F3: hazards arrive at trucks 2, 3 and 5)
  var FIRST_TRUCK = readNum('truck', 1, 1, 30);
  var PREP = readNum('prep', L.PREP_TIME, 0, 30);
  var SWING = /[?&]swing=1/.test(window.location.search);   // strict swing blocked too many turns (a third, even in an empty warehouse)
  var BETWEEN = 2.2;                                 // seconds of banner between trucks
  var REPEAT = { fwd: true, back: true, up: true, down: true };   // holding these keeps going; turns are one per press
  var LESSON = readNum('lesson', 0, 0, 20);
  var DESK = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;   // mouse and keyboard

  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    points: $('points'), time: $('time'), forks: $('forks'), strikes: $('strikes'), banner: $('banner'), bays: $('bays'),
    status: $('status'), title: $('title'), over: $('over'), start: $('start'), again: $('again'), sound: $('sound'),
    score: $('score'), newBest: $('new-best'), line: $('over-line'), stats: $('review-stats'),
    tutorial: $('tutorial'), done: $('done'), doneStart: $('done-start'), doneAgain: $('done-again'), how: $('how'),
    coachN: $('coach-n'), coachIntro: $('coach-intro'), coachStep: $('coach-step'), skip: $('skip'), swipe: $('swipe'),
    pad: document.querySelector('.pad')
  };
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.ctl'));

  // ---- state ----
  var mode = 'title';             // title | play | between | over
  var run = null, origins = [];   // origins[i] = { name, code, color } for this truck
  var held = [], queued = [], stopRepeat = false;   // queued: taps made while the forklift was busy (up to 2)
  var anim = null;                // the action being animated: { kind, from, to, dur, action }
  var betweenT = 0, overT = -1, overLine = '', overGood = false, lastPrepSec = -1;
  var sec = 0, shake = 0, flash = 0, particles = [], floaters = [];
  var best = readBest(), startBest = 0;
  var soundOn = true, ac = null;
  var bannerTimeout = 0;
  var seen = {}, news = '';       // hazards met so far this run, and the one introduced on this truck
  var tutorial = false;           // this run is the tutorial (no clock, strikes never end it, nothing saved or ranked)
  var steer = readSteer();        // 'swipe' or 'buttons'
  var goTurn = false;             // the action just taken came from a swipe (a swipe's turn does not stop a held drive)

  function readNum(key, def, lo, hi) {
    var m = new RegExp('[?&]' + key + '=(\\d+(?:\\.\\d+)?)').exec(window.location.search);
    return m ? Math.max(lo, Math.min(hi, parseFloat(m[1]))) : def;
  }
  function readBest() { try { return parseInt(localStorage.getItem('dock.bestScore'), 10) || 0; } catch (e) { return 0; } }
  function saveBest(v) { try { localStorage.setItem('dock.bestScore', String(v)); } catch (e) { /* private mode */ } }
  // Swipe steering is the default on phones (Roger, 2026-10-26: the forklift-relative buttons were confusing there).
  function readSteer() {
    var v = null;
    try { v = localStorage.getItem('dock.steer'); } catch (e) { /* private mode */ }
    return v === 'swipe' || v === 'buttons' ? v : (DESK ? 'buttons' : 'swipe');
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
  // Forklift horn: like a car horn, two buzzy notes a clashing interval apart (about 415 and 494 Hz), held at full
  // volume and cut off sharply. A low-pass filter takes the fizz off the top so it reads as a horn, not a buzzer.
  function toot() {
    if (!ac) return;
    var t0 = ac.currentTime, end = t0 + 0.26;
    var filter = ac.createBiquadFilter(), out = ac.createGain();
    filter.type = 'lowpass'; filter.frequency.value = 1800; filter.Q.value = 2;
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.linearRampToValueAtTime(0.11, t0 + 0.01);
    out.gain.setValueAtTime(0.11, end - 0.03);
    out.gain.linearRampToValueAtTime(0.0001, end);
    filter.connect(out); out.connect(ac.destination);
    [[415, 'sawtooth'], [494, 'sawtooth'], [207, 'square']].forEach(function (v) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = v[1]; o.frequency.value = v[0];
      g.gain.value = v[1] === 'square' ? 0.25 : 0.5;
      o.connect(g); g.connect(filter); o.start(t0); o.stop(end + 0.02);
    });
  }

  function sfx(name) {
    if (!soundOn) return;
    ensureAudio();
    if (name === 'start') { tone(440, 0.08, 'square', 0.06); tone(660, 0.12, 'square', 0.06, 0.08); }
    else if (name === 'tick') tone(520, 0.06, 'square', 0.04);
    else if (name === 'go') { tone(660, 0.08, 'square', 0.06); tone(990, 0.16, 'square', 0.06, 0.08); }
    else if (name === 'drive') { noise(0.05, 0.04); tone(70, 0.06, 'square', 0.025); }
    else if (name === 'reverse') { tone(1150, 0.07, 'square', 0.035); }                       // the backing-up beep
    else if (name === 'turn') tone(260, 0.12, 'triangle', 0.035, 0, 200);
    else if (name === 'forkUp') tone(180, 0.18, 'sawtooth', 0.025, 0, 300);
    else if (name === 'forkDown') tone(300, 0.18, 'sawtooth', 0.025, 0, 180);
    else if (name === 'pick') { noise(0.06, 0.12); tone(160, 0.08, 'square', 0.04); }
    else if (name === 'drop') { noise(0.1, 0.18); tone(110, 0.1, 'square', 0.04); }
    else if (name === 'shelve') { noise(0.06, 0.1); tone(700, 0.07, 'square', 0.06, 0.04); tone(1050, 0.12, 'square', 0.06, 0.1); }
    else if (name === 'bump') tone(80, 0.08, 'square', 0.05);
    else if (name === 'wrong') { tone(140, 0.35, 'sawtooth', 0.08); tone(120, 0.35, 'sawtooth', 0.06, 0.05); }
    else if (name === 'honk') toot();
    else if (name === 'hit') { noise(0.15, 0.25); tone(1800, 0.5, 'sine', 0.06, 0.12, 1400); }      // thud, then the safety whistle
    else if (name === 'door') noise(0.35, 0.05);
    else if (name === 'clear') { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.1, 'square', 0.06, i * 0.08); }); tone(1319, 0.3, 'triangle', 0.07, 0.32); }
    else if (name === 'timeout') { for (var i = 0; i < 3; i++) { tone(880, 0.12, 'square', 0.05, i * 0.22); tone(660, 0.1, 'square', 0.05, i * 0.22 + 0.11); } }
    else if (name === 'over') { tone(392, 0.2, 'square', 0.06); tone(311, 0.2, 'square', 0.06, 0.2); tone(262, 0.4, 'square', 0.06, 0.4); }
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
    bannerTimeout = setTimeout(function () { el.banner.className = 'banner'; }, 1700);
  }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }

  function startRun() { begin(false); }
  function startTutorial(n) { begin(true, n); }
  function begin(tut, lesson) {
    tutorial = tut;
    document.body.classList.toggle('tut', tut);
    run = tut ? L.newRun(Math.random, { truckNo: lesson || 1, swing: false, makeLevel: TUT.makeLevel, forgiving: true })
      : L.newRun(Math.random, { truckNo: FIRST_TRUCK, swing: SWING });
    startBest = best;
    particles = []; floaters = []; shake = 0; flash = 0; anim = null; queued = []; overT = -1; seen = {};
    el.title.hidden = true; el.over.hidden = true; el.done.hidden = true;
    setControls(true);
    mode = 'play';
    sfx('start');
    onEvents(L.takeEvents(run));
  }

  // Each truck gets its own coffees from coffees.js (single origins only), one per bay origin.
  function pickOrigins(k) {
    var pool = (window.COFFEES || []).filter(function (c) { return c.kind === 'single'; }).map(function (c) { return c.name; });
    while (pool.length < k) pool.push('Origin ' + (pool.length + 1));
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    var used = {}, out = [];
    for (i = 0; i < k; i++) {
      var name = pool[i], code = codeFor(name);
      if (used[code]) code = (name.replace(/[^A-Za-z]/g, '').slice(0, 1) + (i + 1)).toUpperCase();
      used[code] = true;
      out.push({ name: name, code: code, color: ORIGIN_COLORS[i % ORIGIN_COLORS.length] });
    }
    return out;
  }
  function codeFor(name) {
    var words = name.split(/\s+/).filter(function (w) { return /[A-Za-z]/.test(w); });
    return (words.length > 1 ? words[0].charAt(0) + words[1].charAt(0) : name.slice(0, 2)).toUpperCase();
  }
  function showBays() {
    el.bays.innerHTML = '';
    origins.forEach(function (o) {
      var s = document.createElement('span'), i = document.createElement('i'), b = document.createElement('b');
      i.style.background = o.color; b.textContent = o.code;
      s.appendChild(i); s.appendChild(b); s.appendChild(document.createTextNode(o.name));
      el.bays.appendChild(s);
    });
  }

  function truckIndex() { return run.truckNo - FIRST_TRUCK + 1; }   // 1-based within this shift

  // The first truck with a new hazard says what it is, during the study time.
  var HAZARD_NEWS = {
    jacks: ['NEW: PALLET JACK', 'Pallet jack parked in the way. Drive around it.'],
    walkers: ['NEW: COWORKERS  HONK!', 'Coworkers on the floor. Honk so they keep clear; bumping one is a strike.'],
    doors: ['NEW: ROLL-UP DOOR', 'Roll-up door: it opens and shuts. It flashes before it closes.'],
    movers: ['NEW: MOVING JACK', 'A pallet jack rolls back and forth along the marked track. Its light blinks before it moves.']
  };
  function hazardNews(lv) {
    var have = { jacks: lv.cells.some(function (c) { return c.jack; }), walkers: lv.walkers.length > 0, doors: lv.doors.length > 0,
      movers: lv.movers.length > 0 };
    var out = null;
    ['movers', 'jacks', 'walkers', 'doors'].forEach(function (k) { if (have[k] && !seen[k]) { seen[k] = true; out = out || HAZARD_NEWS[k]; } });
    return out;
  }

  function onEvents(events) {
    var tr = run.truck;
    events.forEach(function (e) {
      if (e.type === 'truck') {
        origins = pickOrigins(tr.lv.origins);
        showBays();
        anim = null; queued = []; lastPrepSec = -1;
        if (tutorial) { startLesson(); return; }
        if (PREP > 0) run.prep = PREP; else L.skipPrep(run);
        banner('TRUCK ' + truckIndex() + (SHIFT ? ' OF ' + SHIFT : ''));
        var nw = hazardNews(tr.lv);
        news = nw ? nw[0] : '';
        say('Truck ' + truckIndex() + ': ' + L.truckPallets(tr.lv) + ' pallets. ' + (nw ? nw[1] + ' ' : '') + 'Study the warehouse.');
      } else if (e.type === 'go') { sfx('go'); if (!tutorial) { banner('GO!'); say('Go!'); } }
      else if (e.type === 'honk') sfx('honk');
      else if (e.type === 'door') { if (!e.open) sfx('door'); }
      else if (e.type === 'hit') {
        sfx('hit'); banner('SAFETY MEETING!', true); shake = 0.3; flash = 0.2;
        say((e.walked ? 'A coworker walked into the forklift.' : 'You bumped a coworker.') + (tutorial ? '' : ' Strike.') + ' Honk to warn them.');
      }
      else if (e.type === 'move') sfx(e.action === 'back' ? 'reverse' : 'drive');
      else if (e.type === 'turn') sfx('turn');
      else if (e.type === 'fork') sfx(e.action === 'up' ? 'forkUp' : 'forkDown');
      else if (e.type === 'pick') sfx('pick');
      else if (e.type === 'drop') sfx('drop');
      else if (e.type === 'bump') sfx('bump');
      else if (e.type === 'shelve') {
        sfx('shelve');
        var c = forkPoint();
        floaters.push({ x: c.x, y: c.y - 6, text: tutorial ? 'NICE!' : '+' + e.points, life: 0.9 });
        say(tutorial ? 'Shelved.' : 'Shelved. Plus ' + e.points + '.');
      } else if (e.type === 'wrong') {
        sfx('wrong'); banner('WRONG BAY!', true); shake = 0.25; say(tutorial ? 'Wrong bay.' : 'Wrong bay. Strike.');
      } else if (e.type === 'timeout') {
        sfx('timeout'); banner("TIME'S UP!", true); say('Time is up. Strike.');
      } else if (e.type === 'clear') {
        sfx('clear');
        if (tutorial) { banner('LESSON CLEARED!'); say('Lesson cleared.'); }
        else {
          banner('TRUCK CLEARED!' + (e.bonus ? '\n+' + e.bonus + ' TIME' : ''));
          say('Truck cleared. Time bonus ' + e.bonus + '.');
        }
      } else if (e.type === 'over') {
        overT = 1.2; overGood = false;
        overLine = ['Three strikes. Safety meeting at 3.', 'Forklift license under review.', 'The pallets win this round.'][Math.floor(Math.random() * 3)];
      }
      if (e.type === 'strike' || e.type === 'shelve' || e.type === 'clear') hud();
      if (!tutorial && (e.type === 'shelve' || e.type === 'clear')) { if (run.score > best) { best = run.score; saveBest(best); } }
    });
    if (run.state === 'cleared' || run.state === 'failed') { mode = 'between'; betweenT = BETWEEN; held = []; queued = []; }
  }

  function showOver() {
    mode = 'over';
    setControls(false);
    held = []; queued = [];
    el.score.textContent = fmt(run.score);
    el.newBest.hidden = !(run.score > 0 && run.score > startBest);
    el.line.textContent = overLine;
    el.line.className = 'over-line' + (overGood ? ' good' : '');
    el.stats.textContent = 'Trucks cleared: ' + run.trucksCleared + (SHIFT ? ' of ' + SHIFT : '') + ' · Pallets shelved: ' + run.shelved + ' · Best: ' + fmt(best);
    el.again.disabled = true;
    el.over.hidden = false;
    // Feel-test switches make it a practice run: no poster, not ranked.
    var practice = FIRST_TRUCK > 1 || SHIFT > 0 || SWING || PREP !== L.PREP_TIME;
    var line = 'Trucks cleared: ' + run.trucksCleared + ' · Pallets shelved: ' + run.shelved;
    if (window.ShareCard) ShareCard.show({ game: 'dock', score: run.score, line: line, practice: practice, mount: document.getElementById('share') });
    if (window.Leaderboard) Leaderboard.show({ game: 'dock', score: run.score, practice: practice, mount: document.getElementById('lb') });
    setTimeout(function () { el.again.disabled = false; if (!(window.Leaderboard && Leaderboard.typing())) el.again.focus(); }, 500);   // stops a stray tap from skipping the card
    sfx(overGood ? 'clear' : 'over');
    say('Shift over. ' + overLine + ' Score ' + run.score + '.');
  }

  // ---- tutorial ----
  // Control words for the coach, to match how this player steers.
  function words() {
    if (steer === 'swipe') return { drive: 'Swipe the way you want to go; hold to keep driving.', into: 'Swipe toward it',
      up: 'Forks \u25B2', down: 'Forks \u25BC', honk: 'Honk' };
    if (DESK) return { drive: 'Arrow keys or WASD drive and turn.', into: 'Press Up', up: 'Forks up (E)', down: 'Forks down (Q)',
      honk: 'Honk (Space)' };
    return { drive: '\u25B2 \u25BC drive, \u25C0 \u25B6 turn.', into: 'Press \u25B2', up: 'Forks \u25B2', down: 'Forks \u25BC', honk: 'Honk' };
  }
  function fill(str) {
    var w = words();
    return str.replace('{DRIVE}', w.drive).replace('{HONK}', w.honk).replace('{UP}', w.up).replace('{DOWN}', w.down);
  }
  function setText(node, str) { if (node.textContent !== str) node.textContent = str; }

  function startLesson() {
    var n = run.truckNo, lesson = TUT.LESSONS[n - 1];
    L.skipPrep(run);
    news = '';
    el.coachN.textContent = 'LESSON ' + n + ' OF ' + TUT.LESSONS.length + ': ' + lesson.name;
    el.coachIntro.textContent = fill(lesson.intro);
    banner('LESSON ' + n);
    say('Lesson ' + n + ': ' + lesson.name.toLowerCase() + '. ' + fill(lesson.intro));
  }
  function skipLesson() {
    if (!tutorial || !run || (mode !== 'play' && mode !== 'between')) return;
    releaseAll();
    if (run.state !== 'cleared') run.truckNo++;   // a cleared lesson has already moved on
    if (run.truckNo > TUT.LESSONS.length) { showDone(); return; }
    run.state = 'idle';
    mode = 'play';
    L.startTruck(run);
    onEvents(L.takeEvents(run));
  }
  function showDone() {
    mode = 'over';
    setControls(false);
    held = []; queued = [];
    el.done.hidden = false;
    sfx('clear');
    say('Tutorial complete. You are cleared to drive.');
    setTimeout(function () { el.doneStart.focus(); }, 300);
  }

  // The coach's next tip, from what the forklift is facing right now. Hazards first.
  function coachStep() {
    var tr = run.truck, lv = tr.lv, p = tr.pose, d = L.DIRS[p.dir], w = words();
    var ahead = L.cellAt(lv, p.x + d[0], p.y + d[1]);
    if (run.state === 'cleared') return 'Lesson cleared!';
    if (lv.walkers.some(function (k) { return k.alert <= 0 && Math.abs(k.x - p.x) + Math.abs(k.y - p.y) <= 3; }))
      return 'Coworker close! Press ' + w.honk + ' now.';
    if (ahead && ahead.door >= 0 && !lv.doors[ahead.door].open) return 'The door is shut. Wait here for it to open.';
    if (ahead && ahead.jack) return ahead.route ? 'Jack in the way. Wait for it to roll on, or go around.' : 'Pallet jack in the way. Drive around it.';
    if (tr.carry == null) {
      if (ahead && ahead.k !== 'R' && ahead.stack.length) {
        var need = ahead.stack.length - 1;
        if (p.fork === need) return 'Lined up! ' + w.into + ' to slide the forks in and pick it up.';
        if (p.fork < need) return 'Two stacked: raise the forks to level ' + need + ' with ' + w.up + ' to take the top one.';
        return 'Lower the forks with ' + w.down + ' to reach it.';
      }
      return 'Drive to a pallet on the floor and face it.';
    }
    var load = lv.pallets[tr.top != null ? tr.top : tr.carry], code = (origins[load.origin] || {}).code;
    var r = L.poseStep(lv, p, 'down', tr.carry, false, tr.top);
    if (r.kind === 'drop' && r.into === 'rack') return 'Green box: it fits! ' + w.down + ' sets it down.';
    if (r.kind === 'wrong') return 'Red box: wrong bay! This pallet goes in ' + code + '.';
    if (ahead && ahead.k === 'R') {
      if (ahead.origin !== load.origin) return 'This bay is ' + (origins[ahead.origin] || {}).code + '. Find ' + code + '.';
      if (ahead.slots[1] != null && ahead.slots[2] != null && ahead.slots[3] != null) return 'This shelf is full. Try the one next to it.';
      if (p.fork === 0) return 'Right bay. Raise the forks to a shelf with ' + w.up + '.';
      return 'That level is taken. ' + w.up + ' or ' + w.down + ' to a free one.';
    }
    return 'Got it! Take it to a shelf marked ' + code + ' (same color) and face it.';
  }

  // ---- steering choice ----
  function setSteer(v) {
    steer = v;
    try { localStorage.setItem('dock.steer', v); } catch (e) { /* private mode */ }
    el.pad.classList.toggle('swipe-on', v === 'swipe');
    Array.prototype.forEach.call(document.querySelectorAll('[data-steer]'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-steer') === v));
    });
    el.how.textContent = (v === 'swipe' ? 'Swipe the way you want to go: the forklift turns to face it, and keeps driving while you hold.'
      : '\u25B2\u25BC drive \u00B7 \u25C0\u25B6 turn.') + ' Forks \u25B2\u25BC lift and lower.';
    if (tutorial && run) el.coachIntro.textContent = fill(TUT.LESSONS[Math.min(run.truckNo, TUT.LESSONS.length) - 1].intro);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-steer]'), function (b) {
    b.addEventListener('click', function () { setSteer(b.getAttribute('data-steer')); });
  });
  setSteer(steer);

  function setControls(on) { buttons.forEach(function (b) { b.disabled = !on; b.classList.remove('on'); }); }

  function hud() {
    if (!run) return;
    if (tutorial) { setText(el.coachStep, coachStep()); return; }
    var tr = run.truck, left = Math.max(0, Math.ceil(tr.limit - tr.time));
    el.points.textContent = fmt(run.score);
    el.time.textContent = run.state === 'prep' ? tr.limit : left;
    el.time.className = run.state === 'play' && left <= 10 ? 'low' : '';
    var f = tr.pose.fork;
    el.forks.textContent = f === 0 ? 'Floor' : 'Shelf ' + f;
    var s = '';
    for (var i = 0; i < L.STRIKES; i++) s += i < run.strikes ? 'X' : '-';
    el.strikes.textContent = s;
    el.strikes.className = run.strikes ? 'low' : '';
  }

  // ---- input ----
  // Presses while the forklift is still busy are remembered (two deep) so quick taps feel responsive.
  function press(a) {
    if (mode !== 'play' || !run || (run.state !== 'play' && run.state !== 'prep')) return;
    if (a === 'honk') { if (L.act(run, 'honk')) onEvents(L.takeEvents(run)); return; }   // instant, even mid-move
    if (held.indexOf(a) < 0) held.push(a);
    stopRepeat = false;
    if (run.state === 'play' && queued.length < 2) queued.push(a);
  }
  function release(a) {
    var i = held.indexOf(a);
    if (i >= 0) held.splice(i, 1);
  }
  function releaseAll() { held = []; buttons.forEach(function (b) { b.classList.remove('on'); }); }

  buttons.forEach(function (b) {
    var a = b.getAttribute('data-a');
    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (b.disabled) return;
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      b.classList.add('on');
      press(a);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
      b.addEventListener(ev, function () { b.classList.remove('on'); release(a); });
    });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  var KEYS = { ArrowUp: 'fwd', KeyW: 'fwd', ArrowDown: 'back', KeyS: 'back', ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right', KeyE: 'up', KeyR: 'up', PageUp: 'up', KeyQ: 'down', KeyF: 'down', PageDown: 'down',
    Space: 'honk' };
  window.addEventListener('keydown', function (e) {
    var a = KEYS[e.code];
    if (!a || mode !== 'play') return;
    e.preventDefault();
    if (!e.repeat) press(a);
  });
  window.addEventListener('keyup', function (e) { var a = KEYS[e.code]; if (a) release(a); });
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', function () { if (document.hidden) releaseAll(); });
  el.start.addEventListener('click', startRun);
  el.again.addEventListener('click', startRun);
  el.tutorial.addEventListener('click', function () { startTutorial(1); });
  el.doneStart.addEventListener('click', startRun);
  el.doneAgain.addEventListener('click', function () { startTutorial(1); });
  el.skip.addEventListener('click', skipLesson);

  // A swipe is a screen direction ('go0' up, 'go1' right, 'go2' down, 'go3' left). Already facing it: drive forward.
  // Otherwise turn toward it (two turns for a U-turn), so holding a swipe turns, then keeps driving that way.
  function resolve(a) {
    var diff = (+a.charAt(2) - run.truck.pose.dir + 4) % 4;
    return diff === 0 ? 'fwd' : diff === 3 ? 'left' : 'right';
  }
  function isGo(a) { return a.charAt(0) === 'g'; }
  // The next action to try: a queued tap first, otherwise a held button that repeats.
  function nextAction() {
    goTurn = false;
    var a;
    if (queued.length) {
      a = queued.shift();
      if (!isGo(a)) return a;
      if ((+a.charAt(2) - run.truck.pose.dir + 4) % 4 === 2) queued.unshift(a);   // a quick swipe back finishes its U-turn
      goTurn = true;
      return resolve(a);
    }
    if (stopRepeat || !held.length) return null;
    a = held[held.length - 1];
    if (isGo(a)) { goTurn = true; return resolve(a); }
    return REPEAT[a] ? a : null;
  }

  // Swipe pad and the warehouse itself: a drag of 16 px picks a direction; changing direction mid-drag steers again.
  function bindSwipe(node) {
    var id = null, sx = 0, sy = 0, dir = -1;
    node.addEventListener('pointerdown', function (e) {
      if (steer !== 'swipe' || mode !== 'play') return;
      e.preventDefault();
      id = e.pointerId; sx = e.clientX; sy = e.clientY; dir = -1;
      try { node.setPointerCapture(id); } catch (err) { /* older browsers */ }
      el.swipe.classList.add('on');
    });
    node.addEventListener('pointermove', function (e) {
      if (e.pointerId !== id) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
      var nd = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
      sx = e.clientX; sy = e.clientY;
      if (nd === dir) return;
      if (dir >= 0) release('go' + dir);
      dir = nd;
      press('go' + nd);
    });
    function end(e) {
      if (e.pointerId !== id) return;
      if (dir >= 0) release('go' + dir);
      id = null; dir = -1;
      el.swipe.classList.remove('on');
    }
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { node.addEventListener(ev, end); });
    node.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  bindSwipe(el.swipe);
  bindSwipe(canvas);

  // ---- update ----
  function update(dt) {
    sec += dt;
    shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt * 3);
    floaters.forEach(function (f) { f.y -= 20 * dt; f.life -= dt; });
    floaters = floaters.filter(function (f) { return f.life > 0; });
    particles.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt; });
    particles = particles.filter(function (p) { return p.life > 0; });

    if (mode === 'play' && run) {
      var left = dt;
      while (left > 0 && mode === 'play') {
        var step = Math.min(1 / 60, left);
        var tr = run.truck;
        if (run.state === 'play' && tr.busy === 0) {
          var a = nextAction();
          if (a) {
            var from = tr.pose, r = L.act(run, a);
            if (r) {
              anim = { kind: r.kind, from: from, to: tr.pose, dur: tr.busy, action: a };
              if (r.kind !== 'move' && r.kind !== 'fork' && !(r.kind === 'turn' && goTurn)) stopRepeat = true;   // after a pick, drop or bump, let go first
            }
          }
        }
        if (run.state === 'prep') {
          var s = Math.ceil(run.prep);
          if (s !== lastPrepSec) { lastPrepSec = s; if (s > 0) sfx('tick'); }
        }
        L.tick(run, step);
        onEvents(L.takeEvents(run));
        left -= step;
      }
      hud();
    } else if (mode === 'between') {
      betweenT -= dt;
      if (betweenT <= 0) {
        if (tutorial && run.truckNo > TUT.LESSONS.length) showDone();
        else if (run.state === 'cleared' && SHIFT && run.trucksCleared >= SHIFT) {
          overGood = true;
          overLine = 'Shift complete! All ' + SHIFT + ' trucks unloaded.';
          showOver();
        } else {
          L.startTruck(run);
          mode = 'play';
          onEvents(L.takeEvents(run));
        }
      }
    }
    if (overT > 0) { overT -= dt; if (overT <= 0) { overT = -1; showOver(); } }
    canvas.style.transform = shake > 0 ? 'translate(' + (Math.random() * 6 - 3).toFixed(1) + 'px,' + (Math.random() * 6 - 3).toFixed(1) + 'px)' : '';
  }

  function burst(x, y, n, colors) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 90;
      particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, c: colors[i % colors.length] });
    }
  }

  // ---- drawing (pixel art with fillRect) ----
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function text(str, x, y, size, color, align) {
    ctx.font = size + 'px ' + THEME.font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, Math.round(x), Math.round(y));
  }
  function shadowText(str, x, y, size, color, align) { text(str, x + 1, y + 1, size, THEME.ink, align); text(str, x, y, size, color, align); }
  function strokeBox(x, y, w, h, c) { rect(x, y, w, 2, c); rect(x, y + h - 2, w, 2, c); rect(x, y, 2, h, c); rect(x + w - 2, y, 2, h, c); }

  function originOf(id) { var p = run.truck.lv.pallets[id]; return origins[p.origin] || { code: '?', color: '#888' }; }

  // Where the forklift is drawn right now, in pixels and radians (eased between tiles while an action runs).
  function drawnPose() {
    var tr = run.truck, p = tr.pose, e = 1;
    if (anim && anim.dur > 0) e = 1 - tr.busy / anim.dur;
    if (!anim || e >= 1) return { x: p.x * T + T / 2, y: p.y * T + T / 2, ang: p.dir * Math.PI / 2, fork: p.fork, e: 1 };
    var f = anim.from, t = anim.to, k = e * e * (3 - 2 * e);
    var dd = ((t.dir - f.dir + 6) % 4) - 2;
    var x = (f.x + (t.x - f.x) * k) * T + T / 2, y = (f.y + (t.y - f.y) * k) * T + T / 2;
    if (anim.kind === 'bump' || anim.kind === 'wrong' || anim.kind === 'hit') {     // a little nudge forward and back
      var d = L.DIRS[f.dir], n = Math.sin(e * Math.PI) * (anim.action === 'back' ? -2 : 2);
      x += d[0] * n; y += d[1] * n;
    }
    return { x: x, y: y, ang: (f.dir + dd * k) * Math.PI / 2, fork: f.fork + (t.fork - f.fork) * k, e: e };
  }
  function forkPoint() {
    var dp = drawnPose();
    return { x: dp.x + Math.sin(dp.ang) * 12, y: dp.y - Math.cos(dp.ang) * 12 };
  }

  function drawFloor(lv, x, y, c) {
    var px = x * T, py = y * T;
    if (c.k === '#') { rect(px, py, T, T, ART.wall); return; }
    var dock = c.k === 'D';
    rect(px, py, T, T, dock ? ART.dock : ART.floor);
    rect(px, py, T, 1, dock ? ART.dockSeam : ART.floorSeam);
    rect(px, py, 1, T, dock ? ART.dockSeam : ART.floorSeam);
    if (dock) {
      var up = L.cellAt(lv, x, y - 1);
      if (!up || up.k !== 'D') for (var i = 0; i < T; i += 8) { rect(px + i, py, 4, 3, THEME.gold); rect(px + i + 4, py, 4, 3, ART.outline); }
    }
  }

  function drawRack(x, y, c, hiSlot, hiColor) {
    var px = x * T, py = y * T, o = origins[c.origin] || { code: '', color: '#666' };
    rect(px, py, T, T, ART.rack);
    rect(px, py, 2, T, ART.upright); rect(px + T - 2, py, 2, T, ART.upright);
    rect(px, py + 1, T, 2, ART.beam); rect(px, py + T - 3, T, 2, ART.beam);
    rect(px + 3, py + 4, T - 6, 9, o.color);
    text(o.code, px + T / 2, py + 12, 6, THEME.ink, 'center');
    for (var s = 1; s <= L.TOP_FORK; s++) {
      var sx = px + 3 + (s - 1) * 9, sy = py + 15;
      rect(sx, sy, 8, 12, ART.slot);
      var id = c.slots[s];
      if (id != null) {
        rect(sx, sy, 8, 12, ART.burlap);
        rect(sx, sy + 4, 8, 3, originOf(id).color);
        rect(sx, sy + 11, 8, 1, ART.palletDark);
      } else text(String(s), sx + 4, sy + 9, 5, ART.slotNum, 'center');
      if (s === hiSlot) strokeBox(sx - 1, sy - 1, 10, 14, hiColor);
    }
  }

  // A pallet of burlap bags seen from above, with its origin tag. s scales it (carried loads look bigger when lifted).
  function drawPallet(cx, cy, id, s) {
    var o = originOf(id), h = 11 * s;
    rect(cx - h - 1, cy - h - 1, 2 * h + 2, 2 * h + 2, ART.outline);
    rect(cx - h, cy - h, 2 * h, 2 * h, ART.pallet);
    rect(cx - h + 2 * s, cy - h + 2 * s, 2 * h - 4 * s, 2 * h - 4 * s, ART.burlap);
    rect(cx - 0.5, cy - h + 2 * s, 1, 2 * h - 4 * s, ART.burlapDark);
    rect(cx - h + 2 * s, cy - 0.5, 2 * h - 4 * s, 1, ART.burlapDark);
    rect(cx - 7 * s, cy - 4 * s, 14 * s, 8 * s, o.color);
    text(o.code, cx, cy + 3 * s, Math.max(5, Math.round(6 * s)), THEME.ink, 'center');
  }
  function drawStack(x, y, c, hi) {
    var cx = x * T + T / 2, cy = y * T + T / 2;
    if (c.stack.length === 2) {
      drawPallet(cx + 2, cy + 2, c.stack[0], 1);
      drawPallet(cx - 1, cy - 1, c.stack[1], 1);
      var b = originOf(c.stack[0]);                  // the badge shows the bottom pallet's color
      rect(cx + 6, cy - 15, 10, 9, ART.outline); rect(cx + 7, cy - 14, 8, 7, b.color);
      text('2', cx + 11, cy - 8, 5, THEME.ink, 'center');
    } else drawPallet(cx, cy, c.stack[0], 1);
    if (hi) strokeBox(x * T + 1, y * T + 1, T - 2, T - 2, hi);
  }

  // Roll-up door in a rack gap: hazard stripes on the frame, flashing red just before it shuts, a grey shutter when shut.
  function drawDoor(d) {
    var px = d.x * T, py = d.y * T, warn = d.open && d.t < L.DOOR_WARN && Math.floor(sec * 8) % 2 === 0;
    if (!d.open) {
      rect(px, py, T, T, ART.shutter);
      for (var i = 3; i < T; i += 4) rect(px, py + i, T, 1, ART.shutterDark);
    }
    var stripe = warn ? THEME.red : THEME.gold;
    for (var k = 0; k < T; k += 8) {
      rect(px + k, py, 4, 3, stripe); rect(px + k + 4, py, 4, 3, ART.outline);
      rect(px + k, py + T - 3, 4, 3, stripe); rect(px + k + 4, py + T - 3, 4, 3, ART.outline);
    }
  }

  // A parked pallet jack from above: red body and handle, two steel forks.
  // A pallet jack from above at pixel (px, py): red body and handle, two steel forks. light = amber lamp on the
  // handle (a moving jack blinks it just before it rolls).
  function drawJack(px, py, light) {
    rect(px + 7, py + 3, 18, 10, ART.outline); rect(px + 8, py + 4, 16, 8, ART.jack); rect(px + 8, py + 10, 16, 2, ART.jackDark);
    rect(px + 15, py + 1, 2, 4, ART.outline); rect(px + 11, py, 10, 2, ART.outline);          // handle
    rect(px + 8, py + 13, 5, 17, ART.outline); rect(px + 19, py + 13, 5, 17, ART.outline);    // forks
    rect(px + 9, py + 13, 3, 16, ART.steel); rect(px + 20, py + 13, 3, 16, ART.steel);
    if (light) { rect(px + 14, py + 5, 4, 4, ART.outline); rect(px + 15, py + 6, 2, 2, THEME.gold); }
  }
  // A moving jack's track: a faint dashed line through the middle of each tile it uses.
  function drawTrack(m) {
    for (var i = 0; i < m.route.length; i++) {
      var cx = m.route[i][0] * T + T / 2, cy = m.route[i][1] * T + T / 2;
      var horiz = m.route.length > 1 && m.route[0][1] === m.route[1][1];
      for (var k = -12; k <= 8; k += 8) {
        if (horiz) rect(cx + k, cy - 1, 4, 2, '#55636d');
        else rect(cx - 1, cy + k, 2, 4, '#55636d');
      }
    }
  }
  function drawMover(m) {
    var k = m.slide > 0 ? 1 - m.slide / L.JACK_ROLL : 1;
    var px = (m.px + (m.x - m.px) * k) * T, py = (m.py + (m.y - m.py) * k) * T;
    var soon = m.slide === 0 && m.t < 0.9 && Math.floor(sec * 8) % 2 === 0;
    drawJack(px, py, soon || m.slide > 0);
  }

  // A coworker from above: hard hat, hi-vis vest, legs that swing as they walk. A red ! when they are about to
  // walk into you and have not heard a honk.
  function drawWalker(w, fp) {
    var k = w.slide > 0 ? 1 - w.slide / L.WALK_SLIDE : 1;
    var cx = (w.px + (w.x - w.px) * k) * T + T / 2, cy = (w.py + (w.y - w.py) * k) * T + T / 2;
    var step = Math.sin(sec * 12) * 3;
    rect(cx - 4, cy + 3 + step, 3, 5, ART.outline); rect(cx + 1, cy + 3 - step, 3, 5, ART.outline);   // legs
    rect(cx - 6, cy - 4, 12, 9, ART.outline); rect(cx - 5, cy - 3, 10, 7, ART.vest);
    rect(cx - 5, cy, 10, 1, ART.vestStripe);
    rect(cx - 4, cy - 9, 8, 7, ART.outline); rect(cx - 3, cy - 8, 6, 5, ART.hat); rect(cx - 3, cy - 4, 6, 1, ART.skin);
    var gap = fp.x - w.x, toward = w.y === fp.y && gap !== 0 && (gap > 0) === (w.dx > 0) && Math.abs(gap) <= 2;
    if (w.alert > 0) shadowText('~', cx, cy - 11, 6, THEME.blueLight, 'center');
    else if (toward && Math.floor(sec * 6) % 2 === 0) shadowText('!', cx, cy - 11, 8, THEME.red, 'center');
  }

  function drawForklift(dp, carry, top) {
    ctx.save();
    ctx.translate(Math.round(dp.x), Math.round(dp.y));
    ctx.rotate(dp.ang);
    // Drawn facing up the screen; the forks are at the front (negative y).
    rect(-12, -3, 3, 6, ART.tire); rect(9, -3, 3, 6, ART.tire); rect(-12, 8, 3, 6, ART.tire); rect(9, 8, 3, 6, ART.tire);
    rect(-11, -6, 22, 21, ART.outline);
    rect(-10, -5, 20, 19, ART.body);
    rect(-10, 10, 20, 4, ART.bodyDark);                      // counterweight
    rect(-4, 2, 8, 6, ART.seat);
    rect(-8, -3, 16, 1, ART.guard); rect(-8, 8, 16, 1, ART.guard); rect(-8, -3, 1, 12, ART.guard); rect(7, -3, 1, 12, ART.guard);
    rect(-9, -9, 18, 4, ART.steelDark);                      // mast
    var lift = dp.fork;                                       // forks look a bit shorter/lighter as they go up
    rect(-7, -16, 3, 8, lift > 0.5 ? ART.steel : ART.steelDark); rect(4, -16, 3, 8, lift > 0.5 ? ART.steel : ART.steelDark);
    if (carry != null) {
      var s = 0.75 + 0.06 * lift;
      var slide = anim && anim.kind === 'pick' && dp.e < 1 ? (1 - dp.e) * 14 : 0;
      var slideBottom = top != null ? 0 : slide;               // the pallet that just came on is the one that slides in
      ctx.globalAlpha = 0.35; rect(-8 + lift * 1.5, -20 + lift * 1.5 - slideBottom, 17, 17, '#000'); ctx.globalAlpha = 1;
      drawPallet(0, -12 - slideBottom, carry, s);
      if (top != null) {                                        // second pallet: up a level, so a little bigger and offset
        ctx.globalAlpha = 0.35; rect(-6, -19 - slide, 15, 15, '#000'); ctx.globalAlpha = 1;
        drawPallet(-2, -15 - slide, top, s + 0.08);
      }
    }
    ctx.restore();
    // Fork height: 4 pips beside the forklift (floor at the bottom).
    var facingRight = Math.round(dp.ang / (Math.PI / 2)) % 4 === 1;   // keep the pips off the load
    var ix = Math.round(dp.x) + (facingRight ? -18 : 14), iy = Math.round(dp.y) - 13;
    if (ix > W - 5) ix = Math.round(dp.x) - 18;
    if (ix < 1) ix = Math.round(dp.x) + 14;
    rect(ix - 1, iy - 1, 6, 4 * 5 + 1, ART.outline);
    for (var i = 0; i < 4; i++) rect(ix, iy + (3 - i) * 5, 4, 4, i <= Math.round(dp.fork) ? THEME.gold : '#3a4650');
  }

  function draw() {
    rect(0, 0, W, H, ART.floor);
    if (!run) { drawIdle(); return; }
    var tr = run.truck, lv = tr.lv, p = tr.pose, d = L.DIRS[p.dir];
    var ax = p.x + d[0], ay = p.y + d[1];

    // What the forks would do with the tile ahead: green = pick up / set down there, red = wrong bay.
    var hint = null;
    if ((run.state === 'play' || run.state === 'prep') && tr.busy === 0) {
      // (No hint for stacking a second pallet on: the double load is left for players to discover.)
      var r = tr.carry == null ? L.poseStep(lv, p, 'fwd', null, false) : L.poseStep(lv, p, 'down', tr.carry, false, tr.top);
      if (r.kind === 'pick' || r.kind === 'drop') hint = THEME.green;
      else if (r.kind === 'wrong') hint = THEME.red;
    }

    for (var y = 0; y < lv.h; y++) for (var x = 0; x < lv.w; x++) {
      var c = L.cellAt(lv, x, y), here = hint && x === ax && y === ay;
      if (c.k === 'R') drawRack(x, y, c, here ? p.fork : 0, hint);
      else {
        drawFloor(lv, x, y, c);
        if (c.door >= 0) drawDoor(lv.doors[c.door]);
        if (c.jack && !c.route) drawJack(x * T, y * T, false);
        if (c.stack.length) drawStack(x, y, c, here ? hint : null);
        else if (here) strokeBox(x * T + 1, y * T + 1, T - 2, T - 2, hint);
      }
    }

    lv.movers.forEach(drawTrack);
    lv.movers.forEach(drawMover);
    lv.walkers.forEach(function (w) { drawWalker(w, p); });
    drawForklift(drawnPose(), tr.carry, tr.top);

    particles.forEach(function (q) { rect(q.x, q.y, 2, 2, q.c); });
    floaters.forEach(function (f) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 2));
      shadowText(f.text, f.x, f.y, 8, THEME.gold, 'center');
      ctx.globalAlpha = 1;
    });

    if (run.state === 'prep') {
      var n = Math.max(1, Math.ceil(run.prep));
      // Sits on row 1, the open aisle in every layout, so no shelf is hidden while you study.
      ctx.globalAlpha = 0.8; rect(0, T + 4, W, news ? 46 : 34, THEME.ink); ctx.globalAlpha = 1;
      shadowText('STUDY THE LAYOUT', W / 2, T + 18, 8, THEME.blueLight, 'center');
      shadowText(L.truckPallets(tr.lv) + ' PALLETS  ' + n, W / 2, T + 32, 8, THEME.gold, 'center');
      if (news) shadowText(news, W / 2, T + 44, 7, THEME.red, 'center');
    }
    if (flash > 0) rect(0, 0, W, H, 'rgba(255,255,255,' + (flash * 0.5).toFixed(2) + ')');
  }

  // Behind the title card: the first warehouse layout, empty.
  var idleLv = L.parseLayout(L.LAYOUTS[0]);
  function drawIdle() {
    for (var y = 0; y < idleLv.h; y++) for (var x = 0; x < idleLv.w; x++) {
      var c = L.cellAt(idleLv, x, y);
      if (c.k === 'R') { rect(x * T, y * T, T, T, ART.rack); rect(x * T, y * T + 1, T, 2, ART.beam); rect(x * T, y * T + T - 3, T, 2, ART.beam); }
      else drawFloor(idleLv, x, y, c);
    }
  }

  // ---- main loop ----
  var lastTs = 0;
  function frame(ts) {
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0); lastTs = ts;
    update(dt); draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (LESSON) startTutorial(Math.min(LESSON, TUT.LESSONS.length));

  // Test hook (drive and read the game from automated checks)
  window.__dock = {
    start: startRun, tutorial: startTutorial, skip: skipLesson, coach: function () { return el.coachStep.textContent; },
    swipe: function (n) { press('go' + n); release('go' + n); }, steer: setSteer,
    advance: function (s) { while (s > 0) { var d = Math.min(0.05, s); update(d); s -= d; } draw(); },
    tap: function (a) { press(a); release(a); },
    honk: function () { press('honk'); },
    hold: press, release: release,
    run: function () { return run; },
    get: function () {
      return run && { mode: mode, state: run.state, truck: run.truckNo, score: run.score, strikes: run.strikes,
        pose: run.truck.pose, carry: run.truck.carry, left: L.remaining(run.truck.lv), limit: run.truck.limit, time: run.truck.time,
        origins: origins };
    }
  };
})();
