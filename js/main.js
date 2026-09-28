/* TOTAL SIGNAL ACADEMY — application: screen router, save file, lesson runtimes. */
(function (root) {
  'use strict';

  const T = root.TSA;
  const { clamp, rnd, rndInt, pick, shuffle } = T;
  const { boot, tone } = root.Sig;
  const { flash } = root.FX;
  const KEY = 'tsa-save-v1';
  const MAX_TOTAL = 5000;

  const PAL = {
    cyan: '#5ef2ff', amber: '#ffb545', rose: '#ff5f9e',
    lime: '#a6ff6e', violet: '#b18cff'
  };

  const el = (id) => document.getElementById(id);
  const screens = {};
  document.querySelectorAll('.screen').forEach((s) => { screens[s.dataset.screen] = s; });

  const stage = el('stage');
  const sctx = stage.getContext('2d');
  const overlay = el('overlay');
  const promptEl = el('prompt');
  const hintEl = el('hint');
  const barEl = el('termbar');
  const scoreEl = el('score');
  const pipsEl = el('pips');
  const liveEl = el('live');

  const G = {
    term: 0, round: 0, roundPts: 0, termRaw: 0, termStart: 0,
    total: 0, best: 0, unlocked: 1, running: null,
    w: 0, h: 0, dpr: 1
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ best: G.best, unlocked: G.unlocked }));
    } catch (e) { /* storage blocked: play on, just no persistence */ }
  }
  const loaded = load();
  G.best = loaded.best || 0;
  G.unlocked = clamp(loaded.unlocked || 1, 1, 5);

  function show(name) {
    Object.keys(screens).forEach((k) => screens[k].classList.toggle('on', k === name));
    const f = screens[name].querySelector('button');
    if (f) f.focus({ preventScroll: true });
  }
  const say = (msg) => { liveEl.textContent = msg; };
  const shownScore = () => G.termStart + G.termRaw + G.roundPts;

  function good() {
    [523.25, 659.25, 987.77].forEach((f, i) => tone(f, 0.14, { at: i * 0.075, gain: 0.2, type: 'triangle' }));
    flash(0.7, PAL.lime);
  }
  function bad() {
    tone(138, 0.3, { gain: 0.2, type: 'sawtooth', filter: 500, glide: 74 });
    flash(0.55, PAL.rose);
  }
  function fanfare() {
    [392, 523.25, 659.25, 784, 1046.5].forEach((f, i) =>
      tone(f, 0.2, { at: i * 0.11, gain: 0.18, type: 'triangle' }));
    flash(1, PAL.amber);
  }

  /* ---------------------------------------------------------------- layout */
  function layout() {
    G.dpr = Math.min(2, root.devicePixelRatio || 1);
    const r = stage.getBoundingClientRect();
    G.w = Math.max(240, Math.round(r.width));
    G.h = Math.max(160, Math.round(r.height));
    stage.width = Math.floor(G.w * G.dpr);
    stage.height = Math.floor(G.h * G.dpr);
    sctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    sctx.textBaseline = 'middle';
  }
  const clearStage = () => sctx.clearRect(0, 0, G.w, G.h);
  const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

  function label(text, size, color, y, align) {
    sctx.save();
    sctx.font = '600 ' + (size || 12) + 'px ' + MONO;
    sctx.fillStyle = color || 'rgba(180,230,255,0.75)';
    sctx.textAlign = align || 'center';
    sctx.fillText(text, align === 'right' ? G.w - 14 : align === 'left' ? 14 : G.w / 2, y);
    sctx.restore();
  }
  function meter(x, y, w, h, v, color) {
    sctx.save();
    sctx.fillStyle = 'rgba(255,255,255,0.07)';
    sctx.fillRect(x, y, w, h);
    sctx.fillStyle = color;
    sctx.shadowColor = color;
    sctx.shadowBlur = 10;
    sctx.fillRect(x, y, w * clamp(v, 0, 1), h);
    sctx.restore();
  }
  const pointerPos = (e) => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /* -------------------------------------------------------------- overlays */
  const overlayHTML = (html) => { overlay.innerHTML = html; overlay.classList.add('on'); };
  const overlayOff = () => { overlay.classList.remove('on'); overlay.innerHTML = ''; };
  const choices = (list) => list.map((v, i) =>
    '<button class="choice" data-i="' + i + '">' + v + '</button>').join('');
  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b && G.running && G.running.onChoice) G.running.onChoice(+b.dataset.i, b);
  });

  /* ============================================================= I. CALIBRATION */
  function Sweep(cfg) {
    let probe = rnd(0, 1), dir = 1, target = 0, done = 0, sum = 0, flashT = 0, verdict = '';
    const locks = cfg.locks;

    function newTarget() { target = rnd(0.16, 0.84); }
    function lock() {
      const t = Math.abs(probe - target) / cfg.half;
      const pts = T.sweepScore(t);
      sum += pts; done++; verdict = pts >= 940 ? 'PERFECT LOCK' : pts >= 800 ? 'LOCKED' : pts > 0 ? 'DRIFT' : 'MISSED';
      flashT = 1;
      pts >= 800 ? good() : bad();
      if (done >= locks) { G.roundPts = sum / locks; finishRound(); }
      else { newTarget(); dir = probe < target ? 1 : -1; }
    }
    return {
      prompt: 'Centre the probe. ' + locks + ' locks required.',
      hint: 'SPACE or CLICK to lock the probe',
      enter() { newTarget(); dir = 1; },
      key(e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); lock(); } },
      click() { lock(); },
      update(dt) {
        probe += dir * cfg.speed * dt;
        if (probe > 1) { probe = 1; dir = -1; }
        if (probe < 0) { probe = 0; dir = 1; }
        flashT = Math.max(0, flashT - dt * 2.2);
      },
      draw() {
        clearStage();
        const m = 46, w = G.w - m * 2, y = G.h * 0.5;
        sctx.fillStyle = 'rgba(255,255,255,0.05)';
        sctx.fillRect(m, y - 4, w, 8);
        const tx = m + target * w, hw = cfg.half * w;
        const g = sctx.createLinearGradient(tx - hw, 0, tx + hw, 0);
        g.addColorStop(0, 'rgba(255,181,69,0.04)');
        g.addColorStop(0.5, 'rgba(255,181,69,0.30)');
        g.addColorStop(1, 'rgba(255,181,69,0.04)');
        sctx.fillStyle = g;
        sctx.fillRect(tx - hw, y - 46, hw * 2, 92);
        sctx.save();
        sctx.strokeStyle = PAL.amber;
        sctx.shadowColor = PAL.amber;
        sctx.shadowBlur = 16;
        sctx.lineWidth = 2;
        sctx.beginPath();
        sctx.moveTo(tx - hw, y - 46); sctx.lineTo(tx - hw, y + 46);
        sctx.moveTo(tx + hw, y - 46); sctx.lineTo(tx + hw, y + 46);
        sctx.stroke();
        sctx.shadowColor = flashT > 0 ? PAL.lime : PAL.cyan;
        sctx.strokeStyle = flashT > 0 ? PAL.lime : PAL.cyan;
        sctx.shadowBlur = 22;
        sctx.lineWidth = 2.5;
        sctx.beginPath();
        sctx.moveTo(m + probe * w, y - 62); sctx.lineTo(m + probe * w, y + 62);
        sctx.stroke();
        sctx.restore();
        label('PROBE  ' + (probe * 100).toFixed(1) + ' kHz', 11, 'rgba(180,230,255,0.6)', y + 88);
        if (verdict) label(verdict, 15, flashT > 0 ? PAL.lime : PAL.amber, y - 100);
        label('LOCKS  ' + done + ' / ' + locks, 12, 'rgba(180,230,255,0.7)', 22);
        meter(m, G.h - 16, w, 4, done / locks, PAL.cyan);
      }
    };
  }

  /* ============================================================== II. RELAY */
  function Relay(cfg) {
    const pads = cfg.pads;
    let seq = [], step = 0, phase = 'listen', wrong = 0, lit = -1, flashT = 0, oopsT = 0;

    function play() {
      phase = 'listen'; step = 0; lit = -1;
      tone(880, 0.12, { gain: 0.14, type: 'sine' });
      let t = 0.34;
      for (const n of seq) { tone(T.PENT[n], 0.3, { at: t, gain: 0.3, type: 'triangle' }); t += 0.44; }
      setTimeout(() => { if (phase === 'listen') { phase = 'repeat'; say('Repeat the burst. ' + seq.length + ' tones.'); } },
        (t + 0.2) * 1000);
    }
    function press(n) {
      if (phase !== 'repeat') return;
      tone(T.PENT[n], 0.22, { gain: 0.3, type: 'triangle' });
      lit = n; flashT = 1;
      if (seq[step] === n) {
        step++;
        if (step >= seq.length) { G.roundPts = clamp(1000 - wrong * 220, 0, 1000); good(); finishRound(); }
      } else {
        wrong++; phase = 'oops'; oopsT = 0.7; bad();
        say('Miscalculated. The burst is being re-sent.');
      }
    }
    function padRect(i) {
      const pw = Math.min(92, (G.w - 40) / pads - 10), gap = 12;
      const x0 = (G.w - (pads * pw + (pads - 1) * gap)) / 2;
      return { x: x0 + i * (pw + gap), y: G.h * 0.4, w: pw, h: pw };
    }
    return {
      prompt: 'Repeat the burst exactly. ' + cfg.len + ' tones.',
      hint: 'Keys 1-' + pads + ' or CLICK the pads',
      enter() {
        seq = [];
        for (let i = 0; i < cfg.len; i++) seq.push(rndInt(0, pads - 1));
        wrong = 0; play();
      },
      key(e) { const i = '12345'.indexOf(e.key); if (i >= 0 && i < pads) press(i); },
      click(p) {
        for (let i = 0; i < pads; i++) {
          const r = padRect(i);
          if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) { press(i); return; }
        }
      },
      update(dt) {
        flashT = Math.max(0, flashT - dt * 3.2);
        if (flashT <= 0) lit = -1;
        if (phase === 'oops') { oopsT -= dt; if (oopsT <= 0) play(); }
      },
      draw() {
        clearStage();
        const y = G.h * 0.4;
        for (let i = 0; i < pads; i++) {
          const r = padRect(i), on = lit === i;
          sctx.save();
          sctx.fillStyle = on ? 'rgba(94,242,255,0.38)' : 'rgba(255,255,255,0.05)';
          sctx.strokeStyle = on ? PAL.cyan : 'rgba(160,220,255,0.3)';
          sctx.shadowColor = PAL.cyan;
          sctx.shadowBlur = on ? 24 : 0;
          sctx.lineWidth = on ? 2 : 1;
          sctx.beginPath();
          if (sctx.roundRect) sctx.roundRect(r.x, r.y, r.w, r.h, 10); else sctx.rect(r.x, r.y, r.w, r.h);
          sctx.fill(); sctx.stroke();
          sctx.restore();
          label(String(i + 1), Math.round(r.w * 0.36), on ? '#04212a' : 'rgba(180,230,255,0.6)', r.y + r.h / 2);
        }
        const msg = phase === 'listen' ? 'LISTEN' : phase === 'oops' ? 'MISCALCULATED' : 'REPEAT  ' + step + ' / ' + seq.length;
        label(msg, 14, phase === 'oops' ? PAL.rose : PAL.amber, y - 34);
        if (phase === 'repeat') {
          const w = 6, gapx = 9, x0 = G.w / 2 - (seq.length * gapx - 3) / 2;
          for (let i = 0; i < seq.length; i++) {
            sctx.fillStyle = i < step ? PAL.cyan : 'rgba(255,255,255,0.16)';
            sctx.fillRect(x0 + i * gapx, y + pads * 0 + 150, w, w);
          }
        }
      }
    };
  }

  /* ============================================================ III. FILTER */
  const WORDS = {
    3: ['SUN', 'ION', 'DUB', 'ARC'],
    4: ['SIGN', 'ECHO', 'GLOW', 'RUST', 'DUNE'],
    5: ['ETHER', 'WAVE', 'NOISE', 'QUIET', 'ORBIT'],
    6: ['SIGNAL', 'CIPHER', 'ARCADE', 'BEACON'],
    7: ['ANTENNA', 'CARRIER', 'HARMONIC', 'RELAYED']
  };
  const FLO = 130, FHI = 6200, LOGN = Math.log(FHI / FLO);

  function Filter(cfg) {
    const word = pick(WORDS[cfg.carriers]);
    let carriers = [], centre = 900, q = 6, lo = 0, hi = 1, dragging = null;
    let held = 0, slop = 0, wasMulti = false, elapsed = 0, state = 'listen';

    const toLog = (f) => clamp(Math.log(f / FLO) / LOGN, 0, 1);
    const toFreq = (x) => FLO * Math.exp(clamp(x, 0, 1) * LOGN);
    const halfLog = () => 0.5 * Math.log(root.Sig.windowRatio(q)) / LOGN;
    const inside = () => carriers.filter((c) => !c.locked && toLog(c.f) >= lo && toLog(c.f) <= hi);
    const solo = () => { const i = inside(); return i.length === 1 ? i[0] : null; };

    function applyCentre(x) {
      const c = clamp(x, 0, 1);
      const hw = halfLog();
      const nlo = clamp(c - hw, 0, 1 - 2 * hw);
      centre = nlo + hw;
      lo = nlo; hi = nlo + 2 * hw;
      root.Sig.setWindow(toFreq(centre), q);
    }
    function build() {
      carriers = [];
      const slots = shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
      for (let i = 0; i < cfg.carriers; i++) {
        const f = toFreq((slots[i] + 0.5) / 8);
        carriers.push({ f, ch: word[i], locked: false });
      }
      carriers.sort((a, b) => a.f - b.f);
      root.Sig.openReceiver();
      root.Sig.receiverCarriers(carriers.map((c) => c.f));
      root.Sig.receiverNoise(cfg.noise);
      q = Math.min(5, cfg.qMax);
      applyCentre(toLog(carriers[0].f));
      held = 0; slop = 0; wasMulti = false; elapsed = 0; state = 'listen';
      say('Isolate all ' + cfg.carriers + ' carriers. The word is ' + cfg.carriers + ' letters.');
    }

    return {
      prompt: 'Isolate all ' + cfg.carriers + ' carriers.',
      hint: 'Drag the WINDOW · drag the Q slider to narrow · hold ONE carrier',
      enter: build,
      exit: () => root.Sig.closeReceiver(),
      get dragging() { return dragging; },
      clickStart(p) { dragging = p.y > G.h - 40 ? 'q' : 'win'; this.click(p); },
      click(p) {
        if (dragging === 'q') {
          q = clamp(1.2 + (1 - clamp((p.x - 24) / (G.w - 48), 0, 1)) * (cfg.qMax - 1.2), 1.2, cfg.qMax);
          applyCentre(centre);
        } else {
          applyCentre(p.x / G.w);
          dragging = 'win';
        }
      },
      clickEnd() { dragging = null; },
      update(dt) {
        elapsed += dt;
        if (dragging === 'win') {
          const multi = inside().length > 1;
          if (multi && !wasMulti) slop++;
          wasMulti = multi;
        }
        const c = solo();
        if (c) {
          state = 'hold'; held = Math.min(1.2, held + dt);
          if (held >= 1.2) {
            c.locked = true; held = 0; good();
            if (carriers.every((x) => x.locked)) {
              G.roundPts = clamp(1000 - slop * 60 - Math.max(0, elapsed - 25) * 8, 0, 1000);
              state = 'done';
              setTimeout(finishRound, 900);
            } else say('Carrier logged as ' + c.ch + '. ' + carriers.filter((x) => !x.locked).length + ' remain.');
          }
        } else {
          state = 'listen';
          held = Math.max(0, held - dt * 2);
        }
      },
      draw() {
        clearStage();
        const m = 26, w = G.w - m * 2, top = 44, h = G.h - top - 116;
        sctx.fillStyle = 'rgba(94,242,255,0.05)';
        sctx.fillRect(m + lo * w, top, (hi - lo) * w, h);
        sctx.save();
        sctx.strokeStyle = PAL.cyan;
        sctx.shadowColor = PAL.cyan;
        sctx.shadowBlur = 18;
        sctx.lineWidth = 1.5;
        sctx.strokeRect(m + lo * w, top, (hi - lo) * w, h);
        sctx.restore();
        [130, 400, 1200, 3200, 6200].forEach((f, i) => {
          const x = m + (i / 4) * w;
          sctx.fillStyle = 'rgba(180,230,255,0.14)';
          sctx.fillRect(x, top + h, 1, 5);
          label(String(f), 10, 'rgba(180,230,255,0.4)', top + h + 15);
        });
        carriers.forEach((c) => {
          const x = m + toLog(c.f) * w;
          const on = x >= m + lo * w && x <= m + hi * w;
          sctx.save();
          sctx.fillStyle = c.locked ? PAL.lime : on ? PAL.amber : 'rgba(160,220,255,0.5)';
          sctx.shadowColor = c.locked ? PAL.lime : on ? PAL.amber : 'transparent';
          sctx.shadowBlur = c.locked ? 18 : on ? 14 : 0;
          sctx.beginPath();
          sctx.arc(x, top + h * 0.5, c.locked ? 7 : 5, 0, 6.2832);
          sctx.fill();
          if (c.locked) label(c.ch, 16, PAL.lime, top + h * 0.5 - 22);
          sctx.restore();
        });
        const ins = inside().length, s = solo();
        label('CARRIERS IN WINDOW  ' + ins, 12, ins > 1 ? PAL.amber : PAL.cyan, 18);
        label('SLOP  ' + slop + '   ELAPSED  ' + elapsed.toFixed(0) + 's', 10, 'rgba(180,230,255,0.4)', 18, 'right');
        label(s ? 'HOLD  ' + held.toFixed(1) + 's' : ins === 0 ? 'NOTHING IN WINDOW — SLIDE OR NARROW' : ins > 1 ? 'TOO MANY CARRIERS — NARROW WITH Q' : 'ALL CARRIERS LOGGED',
          12, s ? PAL.amber : 'rgba(255,181,69,0.7)', 34);
        meter(m, top + h + 30, w, 5, held / 1.2, PAL.amber);
        const qw = G.w - 48, qpct = (q - 1.2) / (cfg.qMax - 1.2);
        sctx.fillStyle = 'rgba(255,255,255,0.08)';
        sctx.fillRect(24, G.h - 30, qw, 5);
        sctx.fillStyle = PAL.violet;
        sctx.shadowColor = PAL.violet;
        sctx.shadowBlur = 10;
        sctx.fillRect(24, G.h - 30, qw * qpct, 5);
        label('Q  ' + q.toFixed(1) + '   ·   BANDWIDTH x' + root.Sig.windowRatio(q).toFixed(2) + '   ·   drag the purple bar to narrow',
          10, 'rgba(180,230,255,0.45)', G.h - 10);
        if (state === 'done') {
          label(carriers.map((c) => c.ch).join(''), 40, PAL.lime, G.h * 0.5, 'left');
        }
      }
    };
  }

  /* ============================================================= IV. DECODE */
  const MESSAGES = [
    ['HELLO STATION', 'KEEP THE LINE OPEN', 'DO NOT ANSWER THE SECOND CALL', 'THE OCEAN IS NOT EMPTY'],
    ['LISTEN TO THE STATIC', 'TWO SHIPS PASSING NIGHTLY', 'THE ARCHIVE COUNTS US', 'SEND A NUMBER NOT A NAME'],
    ['WE LEARNED THE PATTERN', 'SOMETHING IS REPEATING', 'DO NOT TRUST THE QUIET PART', 'THE TOWER IS NOT A TOWER'],
    ['NINE AND NINE ELEVEN', 'KEEP THE FREQUENCY WARM', 'ALL STATIONS ANSWER', 'IT NEVER STOPS BROADCASTING']
  ];
  function Decode(cfg) {
    const [answer, ...rest] = pick(MESSAGES);
    const options = shuffle([answer, ...shuffle(rest).slice(0, 3)]);
    const answerIdx = options.indexOf(answer);
    let wrong = 0, usedSlow = false, playing = false;

    function cues() { el('d-slow').textContent = usedSlow ? 'SLOW KEY: ON' : 'SLOW KEY: OFF'; }
    function send() {
      if (playing) return;
      playing = true;
      root.Sig.playMorse(T.encodeMorse(answer), usedSlow ? cfg.wpm / 2 : cfg.wpm, () => {
        playing = false;
        say('Transmission complete. Choose the decoding.');
        el('d-state').textContent = 'STANDBY';
      });
      el('d-state').textContent = 'TRANSMITTING';
    }
    return {
      prompt: 'A transmission has arrived. Name it.',
      hint: 'TRANSMIT to hear it again · SLOW KEY halves the speed',
      enter() {
        overlayHTML(
          '<div class="panel">' +
          '<div class="btns"><button id="d-play" class="choice">TRANSMIT</button>' +
          '<button id="d-slow" class="choice">SLOW KEY: OFF</button></div>' +
          '<p class="state" id="d-state">STANDBY</p>' +
          '<div class="opts">' + choices(options) + '</div></div>');
        el('d-play').onclick = send;
        el('d-slow').onclick = () => { usedSlow = !usedSlow; cues(); send(); };
        send();
      },
      onChoice(i, btn) {
        if (i === answerIdx) {
          btn.classList.add('hit');
          G.roundPts = clamp(1000 - wrong * 260 - (usedSlow ? 90 : 0), 0, 1000);
          good(); say('Correct. ' + answer);
          setTimeout(finishRound, 480);
        } else {
          wrong++; btn.classList.add('miss'); bad();
          say('Not that one. Replay the transmission.');
        }
      },
      key(e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); send(); } },
      draw() {
        clearStage();
        label('CONTINUOUS WAVE · ' + cfg.wpm + ' WPM · KEY 720 Hz', 12, 'rgba(180,230,255,0.5)', G.h / 2);
      },
      exit: overlayOff
    };
  }

  /* ============================================================ V. SPECTRA */
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  function Spectra(cfg) {
    const letter = pick(ALPHA);
    const cells = T.FONT5[letter].split(' ').map((row, y) =>
      row.split('').map((v, x) => (v === '1' ? [x, y] : null)).filter(Boolean)).flat();
    const options = shuffle([letter, ...shuffle(ALPHA.filter((c) => c !== letter)).slice(0, 7)]);
    const ROWS = 150, COLS = 760;
    let wrong = 0, plate = null, off = 0;

    function build() {
      plate = document.createElement('canvas');
      plate.width = COLS; plate.height = ROWS;
      const p = plate.getContext('2d');
      const img = p.createImageData(COLS, ROWS);
      let s = 0x2f6e2b1;
      const nz = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      const cw = 108, chh = 26, ox = (COLS - 5 * cw) / 2, oy = (ROWS - 5 * chh) / 2;
      for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
          const a = (cfg.noise * 0.9) * nz() + cfg.noise * 0.25 * nz();
          let v = a;
          for (const c of cells) {
            const dx = (x - (ox + (c[0] + 0.5) * cw)) / (cw * 0.62);
            const dy = (y - (oy + (c[1] + 0.5) * chh)) / (chh * 0.9);
            const d2 = dx * dx + dy * dy;
            if (d2 < 9) v += Math.exp(-d2) * 1.5 * (0.72 + 0.28 * Math.sin(x * 0.4 + c[1]));
          }
          const k = clamp(v, 0, 1.6);
          const i = (y * COLS + x) * 4;
          img.data[i] = clamp(k * 235, 0, 255);
          img.data[i + 1] = clamp(k * 250 * (0.35 + 0.75 * (1 - y / ROWS)), 0, 255);
          img.data[i + 2] = clamp(k * 170 * (1 - y / ROWS) + 26, 0, 255);
          img.data[i + 3] = 255;
        }
      }
      p.putImageData(img, 0, 0);
      off = 0;
    }
    return {
      prompt: 'A letter is buried in the drift. Name it.',
      hint: 'Read the waterfall, then choose the letter',
      enter() {
        build();
        overlayHTML('<div class="panel"><div class="opts wide">' + choices(options) + '</div></div>');
      },
      onChoice(i, btn) {
        if (options[i] === letter) {
          btn.classList.add('hit');
          G.roundPts = clamp(1000 - wrong * 300, 0, 1000);
          good(); say('Correct. The letter was ' + letter + '.');
          setTimeout(finishRound, 480);
        } else { wrong++; btn.classList.add('miss'); bad(); say('That is noise. Look again.'); }
      },
      key(e) {
        const i = ALPHA.indexOf(e.key.toUpperCase());
        if (i >= 0) { const b = overlay.querySelectorAll('button')[i]; if (b) this.onChoice(i, b); }
      },
      update(dt) { off = (off + dt * 26) % COLS; },
      draw() {
        clearStage();
        if (!plate) return;
        const h = G.h - 34, k = h / ROWS;
        sctx.save();
        sctx.imageSmoothingEnabled = true;
        sctx.shadowColor = PAL.lime;
        sctx.shadowBlur = 12;
        sctx.drawImage(plate, -off, 0, COLS * k, h);
        sctx.drawImage(plate, COLS * k - off, 0, COLS * k, h);
        sctx.restore();
        label('ARCHIVE WATERFALL · NOISE ' + Math.round(cfg.noise * 100) + '%', 10, 'rgba(180,230,255,0.45)', G.h - 14);
      }
    };
  }

  /* ---------------------------------------------------------------- routing */
  const RUNTIME = { sweep: Sweep, relay: Relay, filter: Filter, decode: Decode, spectra: Spectra };
  let last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    if (screens.play.classList.contains('on') && G.running) {
      G.running.update(dt);
      G.running.draw();
    }
  }
  requestAnimationFrame(loop);

  function pips() {
    const term = T.TERMS[G.term];
    pipsEl.innerHTML = '';
    for (let i = 0; i < term.rounds.length; i++) {
      const p = document.createElement('i');
      p.className = i < G.round ? 'on' : i === G.round ? 'cur' : '';
      pipsEl.appendChild(p);
    }
  }
  function hud() {
    const term = T.TERMS[G.term];
    barEl.textContent = 'TERM ' + term.numeral + ' · ' + term.title;
    scoreEl.textContent = String(clamp(shownScore(), 0, MAX_TOTAL)).padStart(4, '0');
    pips();
  }

  function startRound() {
    const term = T.TERMS[G.term];
    const r = RUNTIME[term.id](term.rounds[G.round]);
    G.running = r;
    overlayOff();
    promptEl.textContent = r.prompt;
    hintEl.textContent = r.hint;
    layout();
    if (r.enter) r.enter();
    hud();
    say('Term ' + term.numeral + '. ' + term.title + '. ' + r.prompt);
  }
  function finishRound() {
    const term = T.TERMS[G.term];
    G.termRaw += Math.round(G.roundPts);
    G.roundPts = 0;
    G.round++;
    if (G.running && G.running.exit) G.running.exit();
    G.running = null;
    if (G.round >= term.rounds.length) termDone();
    else startRound();
  }
  function termDone() {
    const term = T.TERMS[G.term];
    G.total = clamp(G.termStart + Math.round(G.termRaw / term.rounds.length), 0, MAX_TOTAL);
    G.unlocked = Math.max(G.unlocked, Math.min(5, G.term + 2));
    G.best = Math.max(G.best, G.total);
    save();
    el('res-term').textContent = 'TERM ' + term.numeral + ' · ' + term.title;
    el('res-score').textContent = G.total;
    el('res-rank').textContent = T.RANKS[term.rank];
    el('res-note').textContent = 'Term average over ' + term.rounds.length + ' exercises. The academy has logged your result.';
    el('res-next').textContent = G.term >= 4 ? 'CLAIM YOUR DIPLOMA' : 'PROCEED TO TERM ' + T.TERMS[G.term + 1].numeral;
    show('result');
    fanfare();
    hud();
  }
  function beginTerm(i) {
    G.term = clamp(i, 0, 4);
    G.round = 0; G.roundPts = 0; G.termRaw = 0;
    G.termStart = G.total;
    const t = T.TERMS[G.term];
    el('br-term').textContent = 'TERM ' + t.numeral;
    el('br-title').textContent = t.title;
    el('br-rank').textContent = 'RANK ON COMPLETION · ' + T.RANKS[t.rank];
    el('br-text').textContent = t.briefing;
    el('br-controls').textContent = t.controls;
    el('br-go').textContent = G.term === 0 ? 'BEGIN' : 'RETAKE TERM';
    show('brief');
    say('Term ' + t.numeral + '. ' + t.title + '. ' + t.briefing);
  }
  function graduate() {
    const g = T.grade(G.total);
    G.best = Math.max(G.best, G.total);
    save();
    el('fin-score').textContent = G.total;
    el('fin-grade').textContent = g.key;
    el('fin-title').textContent = g.title;
    el('fin-note').textContent = g.note;
    el('fin-best').textContent = G.best;
    show('final');
    [392, 523.25, 659.25, 784, 1046.5, 1318.5].forEach((f, i) =>
      tone(f, 0.55, { at: i * 0.15, gain: 0.13, type: 'triangle' }));
    flash(1, PAL.amber);
  }
  function home() {
    el('title-best').textContent = G.best;
    el('title-unlocked').textContent = G.unlocked;
    show('title');
    say('Total Signal Academy. Press enter to enrol.');
  }
  const abort = () => {
    if (G.running && G.running.exit) G.running.exit();
    G.running = null; G.round = 0; G.roundPts = 0; G.termRaw = 0;
    G.total = G.termStart;
    home();
  };

  /* ------------------------------------------------------------------ input */
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === 'm' || e.key === 'M') { el('mute').click(); return; }
    const rt = screens.play.classList.contains('on') ? G.running : null;
    if (rt) {
      if (tag === 'button' && (e.key === ' ' || e.key === 'Enter')) return;
      if (rt.key) rt.key(e);
      if (rt.key || e.key === ' ') e.preventDefault();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      const btn = document.querySelector('.screen.on button.primary');
      if (btn) { e.preventDefault(); btn.click(); }
    }
  });

  stage.addEventListener('pointerdown', (e) => {
    boot();
    if (!G.running || G.running.onChoice) return;
    const p = pointerPos(e);
    if (G.running.clickStart) G.running.clickStart(p);
    else if (G.running.click) G.running.click(p);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!G.running || !G.running.dragging) return;
    G.running.click(pointerPos(e));
  });
  const endDrag = () => { if (G.running && G.running.clickEnd) G.running.clickEnd(); };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('pointerleave', endDrag);
  addEventListener('resize', () => { if (screens.play.classList.contains('on')) layout(); }, { passive: true });

  el('title-go').onclick = () => { boot(); beginTerm(0); };
  el('br-go').onclick = () => { boot(); show('play'); startRound(); };
  el('res-next').onclick = () => { if (G.term >= 4) graduate(); else beginTerm(G.term + 1); };
  el('fin-again').onclick = () => { G.total = 0; G.termStart = 0; G.unlocked = 1; save(); home(); el('title-go').focus(); };
  el('fin-menu').onclick = home;
  el('abort').onclick = abort;
  el('mute').onclick = function () {
    const off = this.getAttribute('aria-pressed') === 'true';
    this.setAttribute('aria-pressed', String(!off));
    this.textContent = !off ? 'AUDIO OFF' : 'AUDIO ON';
    root.Sig.setMuted(!off);
  };

  root.TSA_APP = { G, beginTerm, startRound, finishRound, show, home };
  home();
})(window);
