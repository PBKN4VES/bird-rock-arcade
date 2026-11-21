// Cherry Picker: the crow's caw, made from scratch with the browser's sound tools (no sound files).
// A real caw is a rough, buzzy croak that stays at nearly the same pitch (a quick pitch slide sounds like a laser), so each version here is:
//   two slightly out-of-tune buzzy waves  ->  loudness chopped by a fast flutter (the rasp)  ->  mixed with a little hiss
//   ->  two "vowel" filters (the throat shape that makes it sound like "aw")  ->  a quick swell and fade.
(function (root) {
  var VARIANTS = {
    A: { name: 'A: buzzy caw',            f0: 600, f1: 540, flutter: 90, depth: 0.7, formants: [[900, 4], [1800, 5]], hiss: 0.35, dur: 0.28, wobble: 0.02, click: false },
    B: { name: 'B: raspy, more hiss',      f0: 480, f1: 440, flutter: 70, depth: 0.5, formants: [[750, 3], [1500, 4]], hiss: 0.8,  dur: 0.30, wobble: 0.03, click: false },
    C: { name: 'C: harsh and high',        f0: 720, f1: 650, flutter: 60, depth: 1.0, formants: [[1200, 2], [2400, 3]], hiss: 0.5, dur: 0.25, wobble: 0.04, click: false },
    D: { name: 'D: "kaw" with a hard start', f0: 560, f1: 500, flutter: 80, depth: 0.8, formants: [[850, 4], [1700, 5]], hiss: 0.45, dur: 0.30, wobble: 0.03, click: true },
    E: { name: 'E: low and slow',          f0: 380, f1: 330, flutter: 55, depth: 0.7, formants: [[700, 3], [1400, 4]], hiss: 0.5,  dur: 0.45, wobble: 0.03, click: true }
  };

  var hissBuf = null;
  function hiss(ac) {
    if (!hissBuf || hissBuf.sampleRate !== ac.sampleRate) {
      var n = Math.floor(ac.sampleRate * 0.8), d;
      hissBuf = ac.createBuffer(1, n, ac.sampleRate); d = hissBuf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return hissBuf;
  }

  // Plays one caw. opts: pitch (multiplies the pitch, default 1), len (multiplies the length, default 1).
  function play(ac, key, delay, vol, opts) {
    if (!ac) return;
    var v = VARIANTS[key] || VARIANTS.A, o = opts || {}, pm = o.pitch || 1, lm = o.len || 1;
    var t0 = ac.currentTime + (delay || 0) + 0.005, dur = v.dur * lm, end = t0 + dur;
    var out = ac.createGain(), env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    env.gain.setValueAtTime(vol, t0 + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    out.connect(env); env.connect(ac.destination);

    // the voice: two buzzy waves a hair apart, a gentle fall in pitch, and a little random wobble
    var voice = ac.createGain(), stops = [];
    [1, 1.013].forEach(function (mult) {
      var osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(v.f0 * pm * mult, t0);
      osc.frequency.linearRampToValueAtTime(v.f1 * pm * mult, end);
      var wob = ac.createOscillator(), wg = ac.createGain();
      wob.frequency.value = 31; wg.gain.value = v.f0 * pm * v.wobble;
      wob.connect(wg); wg.connect(osc.frequency);
      osc.connect(voice); osc.start(t0); wob.start(t0); stops.push(osc, wob);
    });
    // the rasp: loudness chopped by a fast flutter
    var chop = ac.createGain(), fl = ac.createOscillator(), fg = ac.createGain();
    chop.gain.value = 1 - v.depth / 2; fl.type = 'sine'; fl.frequency.value = v.flutter;
    fg.gain.value = v.depth / 2; fl.connect(fg); fg.connect(chop.gain); fl.start(t0); stops.push(fl);
    voice.connect(chop);
    // a little hiss, so it is not a pure tone
    var hs = ac.createBufferSource(), hf = ac.createBiquadFilter(), hg = ac.createGain();
    hs.buffer = hiss(ac); hs.loop = true; hf.type = 'highpass'; hf.frequency.value = 500; hg.gain.value = v.hiss * 0.5;
    hs.connect(hf); hf.connect(hg); hs.start(t0); stops.push(hs);
    // the throat: two "vowel" filters side by side
    v.formants.forEach(function (f) {
      var bp = ac.createBiquadFilter(), g = ac.createGain();
      bp.type = 'bandpass'; bp.frequency.value = f[0]; bp.Q.value = f[1]; g.gain.value = 1.4;
      chop.connect(bp); hg.connect(bp); bp.connect(g); g.connect(out);
    });
    // a hard start: a tiny click of noise, like the "k" in "kaw"
    if (v.click) {
      var cs = ac.createBufferSource(), cf = ac.createBiquadFilter(), cg = ac.createGain();
      cs.buffer = hiss(ac); cf.type = 'bandpass'; cf.frequency.value = 1800; cf.Q.value = 0.8;
      cg.gain.setValueAtTime(0.9, t0); cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
      cs.connect(cf); cf.connect(cg); cg.connect(out); cs.start(t0); cs.stop(t0 + 0.04);
    }
    stops.forEach(function (n) { n.stop(end + 0.03); });
  }

  // ---- real crow recordings (audio/caw1.wav to caw4.wav, cut from a crow sound-effect sample Roger supplied) ----
  // They are loaded once audio starts. Until they arrive (or if they cannot load, e.g. when the page is opened as a plain file) the
  // game falls back to the made-up caw above.
  var FILES = ['caw1', 'caw2', 'caw3', 'caw4'], buffers = {}, loading = false;
  function loadSamples(ac, base) {
    if (loading || !ac || typeof fetch !== 'function') return;
    loading = true;
    FILES.forEach(function (name) {
      fetch((base || '') + 'audio/' + name + '.wav')
        .then(function (r) { if (!r.ok) throw new Error('missing'); return r.arrayBuffer(); })
        .then(function (data) { return new Promise(function (ok, no) { ac.decodeAudioData(data, ok, no); }); })
        .then(function (buf) { buffers[name] = buf; })
        .catch(function () { /* keep the made-up caw */ });
    });
  }
  // Plays one recording. Returns false if it is not loaded yet (the caller then uses the made-up caw). rate changes pitch and speed.
  function sample(ac, name, delay, vol, rate) {
    var buf = buffers[name];
    if (!ac || !buf) return false;
    var src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = buf; src.playbackRate.value = rate || 1; g.gain.value = vol;
    src.connect(g); g.connect(ac.destination); src.start(ac.currentTime + (delay || 0) + 0.005);
    return true;
  }

  root.PickerCaw = { VARIANTS: VARIANTS, play: play, loadSamples: loadSamples, sample: sample };
})(typeof self !== 'undefined' ? self : this);
