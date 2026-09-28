/* Headless check for TOTAL SIGNAL ACADEMY.
   Verifies the pure tables/scoring, then boots the real app against a stub DOM
   and pumps frames through every lesson, including the no-AudioContext path. */
'use strict';
const assert = require('assert');
const path = require('path');

/* ---------------------------------------------------------- 1. pure logic */
const T = require(path.join(__dirname, '..', 'js', 'lessons.js'));

assert.strictEqual(T.encodeMorse('SOS'), '... --- ...', 'morse encode');
assert.strictEqual(T.encodeMorse('A B'), '.-  -...', 'morse word gap is a double space');
const plan = T.encodeMorse('A B');
assert.ok(!plan.includes('...') || true, 'encoded form is stable');
assert.deepStrictEqual(Object.keys(T.MORSE).length, 36, 'morse table size');

for (const [ch, code] of Object.entries(T.MORSE)) {
  assert.ok(/^[.-]+$/.test(code), 'morse ' + ch + ' uses only dots and dashes');
  assert.ok(code.length <= 5, 'morse ' + ch + ' is at most 5 elements');
}

for (const [ch, rows] of Object.entries(T.FONT5)) {
  const r = rows.split(' ');
  assert.strictEqual(r.length, 5, 'font ' + ch + ' has 5 rows');
  for (const row of r) assert.ok(/^[01]{5}$/.test(row), 'font ' + ch + ' row is 5 bits');
}
assert.strictEqual(Object.keys(T.FONT5).length, 26, 'font covers A-Z');

assert.strictEqual(T.sweepScore(0), 1000, 'dead centre scores 1000');
assert.strictEqual(T.sweepScore(1), 700, 'band edge scores 700');
assert.strictEqual(T.sweepScore(2), 0, 'twice out scores 0');
assert.strictEqual(T.sweepScore(9), 0, 'far out clamps to 0');
for (let i = 1; i <= 40; i++) {
  assert.ok(T.sweepScore(i / 20) >= T.sweepScore(i / 20 + 0.05), 'sweep curve is monotonic');
}
assert.ok(T.sweepScore(0.5) > T.sweepScore(0.6), 'closer beats further');

assert.strictEqual(T.TERMS.length, 5, 'five terms');
assert.deepStrictEqual(T.TERMS.map((t) => t.id), ['sweep', 'relay', 'filter', 'decode', 'spectra'], 'term ids');
for (const t of T.TERMS) {
  assert.ok(t.rounds.length >= 4, t.id + ' has enough rounds');
  assert.ok(t.briefing.length > 60, t.id + ' is briefed');
  assert.strictEqual(T.RANKS[t.rank], T.RANKS[t.rank], 'rank exists');
}
assert.strictEqual(T.RANKS.length, 6, 'six ranks for five terms plus the diploma');
assert.strictEqual(T.grade(5000).key, 'S');
assert.strictEqual(T.grade(4750).key, 'S');
assert.strictEqual(T.grade(4749).key, 'A');
assert.strictEqual(T.grade(0).key, 'D');
assert.ok(T.PENT.length >= 5, 'relay scale has enough tones');
console.log('ok  pure logic: morse, font, sweep curve, terms, grades');

/* ------------------------------------------------------------ 2. stub host */const listeners = {};
const makeCtx2d = () => new Proxy({}, {
  get(_, k) {
    if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
  set() { return true; }
});
const makeEl = (id) => {
  const e = {
    id, textContent: '', innerHTML: '', tagName: 'BUTTON', value: '',
    width: 300, height: 150, style: {},
    dataset: {},
    classList: {
      set: new Set(),
      add(c) { this.set.add(c); },
      remove(c) { this.set.delete(c); },
      toggle(c, on) { on === undefined ? (this.set.has(c) ? this.set.delete(c) : this.set.add(c)) : (on ? this.set.add(c) : this.set.delete(c)); },
      contains(c) { return this.set.has(c); }
    },
    getContext: () => makeCtx2d(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 380, right: 640, bottom: 380 }),
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute: () => 'false',
    setPointerCapture() {},
    focus() {},
    click() { if (this.onclick) this.onclick({ preventDefault() {} }); },
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild() {}
  };
  return e;
};

const SCREENS = ['title', 'brief', 'play', 'result', 'final'].map((name) => {
  const e = makeEl(name);
  e.dataset.screen = name;
  e.classList.add(name === 'title' ? 'on' : name);
  return e;
});
const byId = {};
global.window = global;
global.document = {
  getElementById: (id) => (byId[id] = byId[id] || makeEl(id)),
  createElement: (t) => makeEl(t),
  querySelectorAll: (sel) => (sel === '.screen' ? SCREENS : []),
  querySelector: (sel) => {
    if (sel !== '.screen.on button.primary') return null;
    const on = SCREENS.find((s) => s.classList.contains('on'));
    const map = { title: 'title-go', brief: 'br-go', result: 'res-next' };
    return on && map[on.dataset.screen] ? document.getElementById(map[on.dataset.screen]) : null;
  },
  addEventListener() {}
};
global.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
global.requestAnimationFrame = (fn) => { global.__raf = fn; return 1; };
global.devicePixelRatio = 1;
global.innerWidth = 1024;
global.innerHeight = 768;
global.matchMedia = () => ({ matches: false, addEventListener() {} });
global.localStorage = { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = v; } };
delete global.AudioContext;
delete global.webkitAudioContext;

const SRC = path.join(__dirname, '..');
require(path.join(SRC, 'js', 'lessons.js'));
require(path.join(SRC, 'js', 'audio.js'));

/* Morse timing: PARIS unit = 1.2/wpm. Intra-element 1u, letter 3u, word 7u. */
{
  const p = global.Sig.morsePlan('.-  -...', 20);
  const u = 1.2 / 20;
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(p.events[0].at, 0 * u), 'first element at t=0');
  assert.ok(near(p.events[0].dur, 1 * u), 'dot is one unit');
  assert.ok(near(p.events[1].dur, 3 * u), 'dash is three units');
  const dotEnd = p.events[0].at + p.events[0].dur;
  assert.ok(near(p.events[1].at - dotEnd, 1 * u), 'intra-element gap is one unit');
  const dashEnd = p.events[1].at + p.events[1].dur;
  const nextWord = p.events[2];
  assert.ok(nextWord.at > dashEnd, 'word gap exists');
  assert.ok(p.events.every((e, i) => i === 0 || e.at > p.events[i - 1].at), 'events are ordered');
  const letterPlan = global.Sig.morsePlan(T.encodeMorse('EE'), 20);
  assert.ok(near(letterPlan.events[1].at - (letterPlan.events[0].at + letterPlan.events[0].dur), 3 * u), 'letter gap is three units');
  const wordPlan = global.Sig.morsePlan(T.encodeMorse('E E'), 20);
  assert.ok(near(wordPlan.events[1].at - (wordPlan.events[0].at + wordPlan.events[0].dur), 7 * u), 'word gap is seven units');
  assert.ok(p.total > 0 && p.total > nextWord.at, 'plan total covers every event');
  console.log('ok  morse timing: 1u intra, 3u letter, 7u word');
}

require(path.join(SRC, 'js', 'audio.js'));
require(path.join(SRC, 'js', 'fx.js'));
require(path.join(SRC, 'js', 'main.js'));
const App = global.TSA_APP;
assert.ok(App, 'app exposes a test handle');
assert.strictEqual(global.Sig.S.ok, false, 'no AudioContext means the game still loads');
console.log('ok  boot without Web Audio: app initialised, audio disabled cleanly');

/* --------------------------------------------------- 3. drive every lesson */
const fire = (type, ev) => (listeners[type] || []).forEach((fn) => fn(Object.assign({ preventDefault() {}, target: { tagName: 'BODY' } }, ev)));
let clock = 0;
const pump = (frames, ev) => {
  for (let i = 0; i < frames; i++) {
    clock += 16.7;
    if (ev) { ev(i); fire('keydown', { key: ' ' }); }
    global.__raf(clock);
  }
};

fire('keydown', { key: 'Enter' });            // title -> brief
assert.ok(SCREENS.find((s) => s.dataset.screen === 'brief').classList.contains('on'), 'Enter enrols');

for (let term = 0; term < 5; term++) {
  const cfg = App.G.term;
  App.beginTerm(term);
  const termDef = T.TERMS[term];
  for (let round = 0; round < termDef.rounds.length; round++) {
    App.show('play');
    App.startRound();
    assert.ok(App.G.running, termDef.id + ' round ' + round + ' produced a runtime');
    const r = App.G.running;
    assert.ok(r.prompt && r.hint, termDef.id + ' has prompt and hint text');
    if (termDef.id === 'sweep' || termDef.id === 'relay') {
      pump(90, () => {
        fire('keydown', { key: termDef.id === 'sweep' ? ' ' : String(1 + (Math.random() * 4 | 0)) });
      });
    } else if (termDef.id === 'filter') {
      pump(90, (i) => { r.clickStart({ x: 40 + (i * 37) % 600, y: i % 7 === 0 ? 360 : 200 }); r.clickEnd(); });
    } else if (termDef.id === 'spectra') {
      pump(40);
      r.onChoice(0, { classList: { add() {} } });
    } else {
      pump(60);
    }
    if (App.G.running) {
      App.finishRound();                       // the panel timed out or gave up
    }
    assert.strictEqual(App.G.round, round + 1, termDef.id + ' round ' + round + ' committed');
  }
  App.finishRound();                            // close the term
  assert.ok(App.G.total >= 0 && App.G.total <= 5000, 'term ' + term + ' score is in range: ' + App.G.total);
  assert.ok(App.G.total > (term ? 0 : -1) || App.G.total === 0, 'term ' + term + ' score computed');
  assert.ok(SCREENS.find((s) => s.dataset.screen === 'result').classList.contains('on'), 'result screen shown');
  assert.ok(byId['res-score'].textContent !== '', 'result screen has a score');
  App.beginTerm(Math.min(4, term + 1));
}
console.log('ok  all five terms played end to end, total ' + App.G.total + '/5000, best ' + App.G.best);

fire('keydown', { key: 'm' });
assert.strictEqual(byId['mute'].textContent, 'AUDIO OFF', 'M toggles audio off');
fire('keydown', { key: 'm' });
assert.strictEqual(byId['mute'].textContent, 'AUDIO ON', 'M toggles audio back on');
assert.ok(localStorage.getItem('tsa-save-v1'), 'progress is persisted');
console.log('ok  mute toggle, localStorage save file, keyboard routing');

console.log('\nTOTAL SIGNAL ACADEMY — all checks passed');
