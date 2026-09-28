/* TOTAL SIGNAL ACADEMY — phosphor field behind every screen.
   Driven by the real analyser, so the ambience is literally the game audio. */
(function (root) {
  'use strict';

  const F = { canvas: null, ctx: null, w: 0, h: 0, dpr: 1, dust: [], flash: 0, tint: '#5ef2ff', t: 0 };
  const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    if (!F.canvas) return;
    F.dpr = Math.min(2, root.devicePixelRatio || 1);
    F.w = root.innerWidth;
    F.h = root.innerHeight;
    F.canvas.width = Math.floor(F.w * F.dpr);
    F.canvas.height = Math.floor(F.h * F.dpr);
    F.canvas.style.width = F.w + 'px';
    F.canvas.style.height = F.h + 'px';
    F.ctx.setTransform(F.dpr, 0, 0, F.dpr, 0, 0);
    seed();
  }

  function seed() {
    F.dust = [];
    const n = reduce ? 0 : Math.min(70, Math.round((F.w * F.h) / 26000));
    for (let i = 0; i < n; i++) {
      F.dust.push({
        x: Math.random() * F.w,
        y: Math.random() * F.h,
        z: 0.25 + Math.random() * 0.75,
        r: 0.5 + Math.random() * 1.4
      });
    }
  }

  function flash(amount, tint) {
    F.flash = Math.min(1, F.flash + amount);
    if (tint) F.tint = tint;
  }

  function grid(ctx, y) {
    ctx.save();
    ctx.strokeStyle = 'rgba(94,242,255,0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const p = ((F.t * 0.09 + i / 14) % 1);
      const yy = y + Math.pow(p, 2.6) * (F.h - y);
      ctx.moveTo(0, yy);
      ctx.lineTo(F.w, yy);
    }
    const cx = F.w / 2;
    for (let i = -12; i <= 12; i++) {
      ctx.moveTo(cx + i * 14, y);
      ctx.lineTo(cx + i * (F.w / 9), F.h);
    }
    ctx.stroke();
    ctx.restore();
  }

  function trace(ctx, amp) {
    const data = root.Sig ? root.Sig.S.data : null;
    const mid = F.h * 0.46;
    const span = Math.min(150, F.h * 0.22);
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(94,242,255,0.5)';
    ctx.shadowColor = 'rgba(94,242,255,0.85)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    const N = 180;
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * F.w;
      let v;
      if (data && data.length) {
        const idx = Math.floor((i / N) * (data.length - 1));
        v = (data[idx] - 128) / 128;
      } else {
        v = Math.sin(i * 0.22 + F.t * 1.6) * 0.06 * Math.sin(i * 0.05 + F.t * 0.4);
      }
      const y = mid + v * span * (0.45 + amp * 1.9);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  }

  function bars(ctx) {
    const spec = root.Sig ? root.Sig.spectrum() : null;
    if (!spec) return;
    const n = 56;
    const w = F.w / n;
    const base = F.h - 2;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.pow(i / n, 1.7) * (spec.length * 0.55));
      const v = spec[idx] / 255;
      const h = Math.pow(v, 1.5) * F.h * 0.2;
      const hue = 186 + v * 60;
      ctx.fillStyle = 'hsla(' + hue + ',90%,62%,0.24)';
      ctx.fillRect(i * w + 1, base - h, w - 2, h);
    }
    ctx.restore();
  }

  function motes(ctx) {
    if (!F.dust.length) return;
    ctx.save();
    ctx.fillStyle = 'rgba(180,240,255,0.5)';
    for (const d of F.dust) {
      d.y -= d.z * 0.22;
      if (d.y < -4) { d.y = F.h + 4; d.x = Math.random() * F.w; }
      ctx.globalAlpha = 0.05 + d.z * 0.16;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
  }

  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    const ctx = F.ctx;
    if (!ctx) return;
    F.t += 0.016;
    const amp = root.Sig ? root.Sig.level() : 0;
    ctx.clearRect(0, 0, F.w, F.h);
    grid(ctx, F.h * 0.28);
    trace(ctx, amp);
    bars(ctx);
    motes(ctx);
    if (F.flash > 0.001) {
      ctx.save();
      ctx.globalAlpha = F.flash * 0.13;
      ctx.fillStyle = F.tint;
      ctx.fillRect(0, 0, F.w, F.h);
      ctx.restore();
      F.flash *= 0.88;
    }
  }

  function init(canvas) {
    F.canvas = canvas;
    F.ctx = canvas.getContext('2d', { alpha: true });
    resize();
    root.addEventListener('resize', resize, { passive: true });
    if (!raf) frame();
  }

  root.FX = { init, flash, resize };
})(window);
