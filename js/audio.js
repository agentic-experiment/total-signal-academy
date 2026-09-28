/* TOTAL SIGNAL ACADEMY — the signal engine.
   Everything audible in the game is generated here: no audio assets, no network. */
(function (root) {
  'use strict';

  const clamp = root.TSA.clamp;

  const S = {
    ctx: null,
    ok: false,
    master: null,
    analyser: null,
    data: null,
    freq: null,
    muted: false,
    filterBus: null,
    filter: null,
    filterGain: null,
    noiseSrc: null,
    noiseGain: null,
    noiseBuffer: null
  };

  function build() {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.85;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;

    master.connect(comp);
    comp.connect(analyser);
    analyser.connect(ctx.destination);

    S.ctx = ctx;
    S.master = master;
    S.analyser = analyser;
    S.data = new Uint8Array(analyser.fftSize);
    S.freq = new Uint8Array(analyser.frequencyBinCount);
    S.ok = true;
    return true;
  }

  function boot() {
    if (S.ctx) {
      if (S.ctx.state === 'suspended') S.ctx.resume().catch(() => {});
      return S.ok;
    }
    try {
      S.ok = build();
    } catch (e) {
      S.ok = false;
    }
    if (S.ok) {
      S.noiseBuffer = makeNoise(2);
      startDrone();
    }
    return S.ok;
  }

  function makeNoise(seconds) {
    const n = Math.floor(S.ctx.sampleRate * seconds);
    const buf = S.ctx.createBuffer(1, n, S.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57555 * b2 + w * 1.0526913;
      d[i] = clamp((b0 + b1 + b2 + w * 0.1848) * 0.28, -1, 1);
    }
    return buf;
  }

  function now() { return S.ctx.currentTime; }

  function env(node, t, a, hold, r, peak) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.setValueAtTime(Math.max(0.0002, peak), t + a + hold);
    g.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  }

  function tone(freq, dur, opt) {
    if (!S.ok) return;
    opt = opt || {};
    const t = (opt.at || 0) + now();
    const osc = S.ctx.createOscillator();
    const g = S.ctx.createGain();
    osc.type = opt.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opt.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opt.glide), t + dur);
    const a = opt.attack === undefined ? 0.008 : opt.attack;
    const r = opt.release === undefined ? Math.min(0.22, dur * 0.6) : opt.release;
    const peak = opt.gain === undefined ? 0.25 : opt.gain;
    env(g, t, a, Math.max(0.005, dur - a - r), r, peak);
    let tail = osc;
    if (opt.filter) {
      const f = S.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(opt.filter, t);
      f.Q.value = opt.q || 1;
      osc.connect(f);
      tail = f;
    }
    tail.connect(g);
    g.connect(opt.dest || S.master);
    osc.start(t);
    osc.stop(t + dur + r + 0.05);
  }

  function noiseHit(dur, opt) {
    if (!S.ok) return;
    opt = opt || {};
    const t = (opt.at || 0) + now();
    const src = S.ctx.createBufferSource();
    src.buffer = S.noiseBuffer;
    src.loop = true;
    const f = S.ctx.createBiquadFilter();
    f.type = opt.type || 'bandpass';
    f.frequency.setValueAtTime(opt.freq || 1200, t);
    f.Q.value = opt.q || 1;
    const g = S.ctx.createGain();
    const peak = opt.gain === undefined ? 0.2 : opt.gain;
    const a = opt.attack === undefined ? 0.006 : opt.attack;
    const r = opt.release === undefined ? dur * 0.7 : opt.release;
    env(g, t, a, Math.max(0.005, dur - a - r), r, peak);
    src.connect(f); f.connect(g); g.connect(opt.dest || S.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + r + 0.05);
  }

  /* ---- continuous receiver chain, used by Term III ---- */
  function openReceiver() {
    if (!S.ok) return;
    closeReceiver();
    S.filterBus = S.ctx.createGain();
    S.filterBus.gain.value = 1;
    S.filter = S.ctx.createBiquadFilter();
    S.filter.type = 'bandpass';
    S.filter.frequency.value = 800;
    S.filter.Q.value = 6;
    S.filterGain = S.ctx.createGain();
    S.filterGain.gain.value = 1;
    S.filterBus.connect(S.filter);
    S.filter.connect(S.filterGain);
    S.filterGain.connect(S.master);
  }

  function closeReceiver() {
    if (S.noiseSrc) { try { S.noiseSrc.stop(); } catch (e) {} S.noiseSrc = null; }
    S.filterBus = null;
    S.filter = null;
    S.filterGain = null;
  }

  function receiverCarriers(freqs) {
    if (!S.ok || !S.filterBus) return;
    for (let i = 0; i < freqs.length; i++) {
      const o = S.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freqs[i];
      o.connect(S.filterBus);
      o.start();
    }
  }

  function receiverNoise(level) {
    if (!S.ok || !S.filterBus) return;
    S.noiseSrc = S.ctx.createBufferSource();
    S.noiseSrc.buffer = S.noiseBuffer;
    S.noiseSrc.loop = true;
    const g = S.ctx.createGain();
    g.gain.value = level;
    S.noiseSrc.connect(g);
    g.connect(S.filterBus);
    S.noiseSrc.start(0, Math.random() * 1.5);
  }

  function setWindow(freq, q) {
    if (!S.ok || !S.filter) return;
    const t = now();
    S.filter.frequency.setTargetAtTime(freq, t, 0.02);
    S.filter.Q.setTargetAtTime(q, t, 0.02);
  }

  /* Width of the -3dB band as a power ratio, derived from the real filter. */
  const windowRatio = (q) => 1 + 1 / Math.max(0.05, q);

  /* ---- morse ---- */
  function morsePlan(code, wpm) {
    const unit = 1.2 / wpm;
    const items = code.split(' ');
    const events = [];
    let t = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it === '') { t += 4 * unit; continue; }
      for (let j = 0; j < it.length; j++) {
        const sym = it[j];
        if (sym !== '.' && sym !== '-') continue;
        const len = sym === '.' ? unit : unit * 3;
        events.push({ at: t, dur: len, sym });
        t += len + unit;
      }
      t += 2 * unit;
    }
    return { events, total: t + unit };
  }

  function playMorse(code, wpm, onEnd) {
    if (!S.ok) { if (onEnd) setTimeout(onEnd, 100); return 0; }
    const plan = morsePlan(code, wpm);
    const base = now();
    for (const e of plan.events) {
      tone(720, e.dur * 0.92, { at: base + e.at, gain: 0.3, type: 'sine', attack: 0.004, release: 0.01 });
    }
    if (onEnd) {
      const guard = (base + plan.total - now()) * 1000;
      setTimeout(onEnd, Math.max(0, guard));
    }
    return plan.total;
  }

  /* ---- ambience ---- */
  function startDrone() {
    if (!S.ok || S.drone) return;
    const g = S.ctx.createGain();
    g.gain.value = 0.0;
    const lp = S.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    lp.Q.value = 3;
    const a = S.ctx.createOscillator();
    const b = S.ctx.createOscillator();
    a.type = 'sawtooth'; a.frequency.value = 55;
    b.type = 'sawtooth'; b.frequency.value = 55.4;
    const lfo = S.ctx.createOscillator();
    const lfoG = S.ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoG.gain.value = 130;
    lfo.connect(lfoG);
    lfoG.connect(lp.frequency);
    a.connect(lp); b.connect(lp);
    lp.connect(g); g.connect(S.master);
    a.start(); b.start(); lfo.start();
    g.gain.setTargetAtTime(0.035, now(), 2);
    S.drone = { a, b, lfo, g };
  }

  function duck(amount, seconds) {
    if (!S.ok || !S.master) return;
    S.master.gain.setTargetAtTime(S.muted ? 0 : amount, now(), seconds || 0.05);
  }

  function setMuted(m) {
    S.muted = m;
    if (!S.ok) return;
    S.master.gain.setTargetAtTime(m ? 0.0001 : 0.85, now(), 0.08);
  }

  function level() {
    if (!S.ok) return 0;
    S.analyser.getByteTimeDomainData(S.data);
    let sum = 0;
    for (let i = 0; i < S.data.length; i += 4) {
      const v = (S.data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / (S.data.length / 4)) * 3.2);
  }

  function spectrum() {
    if (!S.ok) return null;
    S.analyser.getByteFrequencyData(S.freq);
    return S.freq;
  }

  root.Sig = {
    S,
    boot, tone, noiseHit, openReceiver, closeReceiver, receiverCarriers,
    receiverNoise, setWindow, windowRatio, playMorse, morsePlan, setMuted, level, spectrum, duck
  };
})(window);
