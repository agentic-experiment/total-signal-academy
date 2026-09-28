/* TOTAL SIGNAL ACADEMY — pure data + pure logic. No DOM, no Web Audio.
   Loaded first; everything else reads from window.TSA. */
(function (root) {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const MORSE = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
    I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
    Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
    Y: '-.--', Z: '--..',
    0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
    5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.'
  };

  const FONT5 = {
    A: '01110 10001 11111 10001 10001', B: '11110 10001 11110 10001 11110',
    C: '01110 10001 10000 10001 01110', D: '11100 10010 10001 10010 11100',
    E: '11111 10000 11110 10000 11111', F: '11111 10000 11110 10000 10000',
    G: '01110 10001 10111 10001 01111', H: '10001 10001 11111 10001 10001',
    I: '01110 00100 00100 00100 01110', J: '00111 00010 00010 10010 01100',
    K: '10001 10010 11100 10010 10001', L: '10000 10000 10000 10000 11111',
    M: '10001 11011 10101 10001 10001', N: '10001 11001 10101 10011 10001',
    O: '01110 10001 10001 10001 01110', P: '11110 10001 11110 10000 10000',
    Q: '01110 10001 10001 10110 01101', R: '11110 10001 11110 10010 10001',
    S: '01111 10000 01110 00001 11110', T: '11111 00100 00100 00100 00100',
    U: '10001 10001 10001 10001 01110', V: '10001 10001 10001 01010 00100',
    W: '10001 10001 10101 11011 10001', X: '10001 01010 00100 01010 10001',
    Y: '10001 01010 00100 00100 00100', Z: '11111 00010 00100 01000 11111'
  };

  const PENT = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

  const encodeMorse = (text) =>
    text
      .toUpperCase()
      .split(' ')
      .map((w) => w.split('').map((ch) => MORSE[ch] || '').join(' '))
      .join('  ');

  /* Acceptance curve for the calibration sweep.
     t is distance-from-centre measured in half-widths of the target band.
     Dead centre = 1000. Edge of band = 700. Twice the edge = 0. */
  function sweepScore(t) {
    if (!(t >= 0)) return 0;
    return t <= 1 ? Math.round(1000 - 300 * t) : Math.round(Math.max(0, 700 - 700 * (t - 1)));
  }

  const RANKS = [
    'CADET', 'SIGNALMAN', 'OPERATOR', 'CRYPTONOMIST', 'ARCHIVIST',
    'PROFESSOR OF TOTAL SIGNAL'
  ];

  const TERMS = [
    {
      id: 'sweep',
      numeral: 'I',
      title: 'CALIBRATION',
      rank: 1,
      briefing: 'Every operator begins by learning where the needle is. The academy will sweep a probe across an unlabelled band. Lock it inside the target window. Too wide and the professors will notice.',
      controls: 'SPACE or CLICK to lock the probe.',
      rounds: [
        { locks: 3, half: 0.090, speed: 0.62 },
        { locks: 3, half: 0.068, speed: 0.70 },
        { locks: 3, half: 0.052, speed: 0.78 },
        { locks: 4, half: 0.040, speed: 0.88 }
      ]
    },
    {
      id: 'relay',
      numeral: 'II',
      title: 'ECHO MEMORY',
      rank: 2,
      briefing: 'A relay station repeats only what you send it. We will transmit a burst of tones; you will return it in order. The academy does not forgive a single misplaced note.',
      controls: 'Keys 1-5 or CLICK the pads to repeat the burst.',
      rounds: [
        { len: 3, pads: 4 },
        { len: 4, pads: 4 },
        { len: 5, pads: 5 },
        { len: 6, pads: 5 },
        { len: 7, pads: 5 }
      ]
    },
    {
      id: 'filter',
      numeral: 'III',
      title: 'SEPARATION',
      rank: 3,
      briefing: 'A crowded band is only noise until you decide what to keep. Slide the receiver window across the spectrum and narrow it until a single carrier stands alone. Hold it steady and the academy will log the letter.',
      controls: 'Drag the WINDOW handle, drag the Q slider to narrow, hold on ONE carrier.',
      rounds: [
        { carriers: 3, noise: 0.10, qMax: 22 },
        { carriers: 4, noise: 0.16, qMax: 18 },
        { carriers: 5, noise: 0.22, qMax: 15 },
        { carriers: 6, noise: 0.28, qMax: 12 },
        { carriers: 7, noise: 0.34, qMax: 10 }
      ]
    },
    {
      id: 'decode',
      numeral: 'IV',
      title: 'DECIPHERMENT',
      rank: 4,
      briefing: 'Continuous wave. No voice, no picture — only a key tapping in the dark. Read the transmission and name what it says. Use the slow key if you must; the hour is long.',
      controls: 'LISTEN, then choose the correct decoding. SLOW re-renders at half speed.',
      rounds: [{ wpm: 16 }, { wpm: 18 }, { wpm: 20 }, { wpm: 22 }]
    },
    {
      id: 'spectra',
      numeral: 'V',
      title: 'ARCHIVE READER',
      rank: 5,
      briefing: 'The deepest vault stores its records as heat: frequency against time, light where something once burned. A letter is buried in the drift. Find it, and the academy will sign your diploma.',
      controls: 'Read the waterfall, then choose the letter it spells.',
      rounds: [
        { noise: 0.10 }, { noise: 0.17 }, { noise: 0.24 }, { noise: 0.32 }
      ]
    }
  ];

  function grade(total) {
    if (total >= 4750) return { key: 'S', title: 'TOTAL SIGNAL', note: 'The band is wide open. Nothing left to teach you.' };
    if (total >= 4000) return { key: 'A', title: 'SIGNAL EXCELLENCE', note: 'Clean lock on every carrier we threw at you.' };
    if (total >= 3200) return { key: 'B', title: 'OPERATIONAL', note: 'Serviceable. The archive will accept you.' };
    if (total >= 2400) return { key: 'C', title: 'PROVISIONAL', note: 'You heard something. We are not yet sure it was intentional.' };
    return { key: 'D', title: 'RE-ENROLLED', note: 'Return to Term I. The band was never yours.' };
  }

  const api = {
    clamp, lerp, rnd, rndInt, pick, shuffle,
    MORSE, FONT5, PENT, RANKS, TERMS,
    encodeMorse, sweepScore, grade
  };

  root.TSA = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
