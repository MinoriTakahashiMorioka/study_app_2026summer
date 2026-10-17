/**
 * クラッカー（紙吹雪）の演出。どの機能からでも使えます。
 *   celebrate();
 * 画面の左下と右下から紙吹雪が飛び出して、ひらひら落ちてきます。
 * 「視差効果を減らす」設定の端末では、量を減らして短めにします。
 */

const COLORS = ['#DB5A35', '#4B57C9', '#1D6B58', '#D89A17', '#B4417E', '#2F6FD6', '#2E9B5F', '#F2C94C'];

export function celebrate({ duration = 3600 } = {}) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '1000' });
  document.body.append(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const random = (min, max) => min + Math.random() * (max - min);
  const gravity = H * 0.00075;
  const particles = [];

  /** (x, y) から、angle（度）の方向に向けて紙吹雪を打ち出す */
  function burst(x, y, angle, count) {
    for (let i = 0; i < count; i++) {
      const a = ((angle + random(-22, 22)) * Math.PI) / 180;
      const speed = H * random(0.022, 0.042);
      particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        w: random(6, 11),
        h: random(9, 16),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        shape: Math.random() < 0.25 ? 'circle' : Math.random() < 0.3 ? 'ribbon' : 'rect',
        rotation: random(0, Math.PI * 2),
        spin: random(-0.25, 0.25),
        wobble: random(0, Math.PI * 2),
        wobbleSpeed: random(0.08, 0.2),
        delay: random(0, 8), // 少しずつ時間差で飛び出す
      });
    }
  }

  const count = reduceMotion ? 40 : 110;
  burst(-10, H + 10, -62, count);     // 左下 → 右上へ
  burst(W + 10, H + 10, -118, count); // 右下 → 左上へ

  let last = performance.now();
  const startedAt = last;

  function frame(now) {
    const dt = Math.min((now - last) / 16.67, 3);
    last = now;
    const elapsed = now - startedAt;
    ctx.clearRect(0, 0, W, H);

    let alive = 0;
    for (const p of particles) {
      if (p.delay > 0) { p.delay -= dt; alive++; continue; }
      p.vx *= 0.985 ** dt;
      p.vy = p.vy * 0.985 ** dt + gravity * dt;
      // 落ちるときはふわっと遅く
      if (p.vy > 0) p.vy = Math.min(p.vy, H * 0.006);
      p.x += (p.vx + Math.sin(p.wobble) * 0.8) * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      p.wobble += p.wobbleSpeed * dt;
      if (p.y > H + 40) continue;
      alive++;

      const fade = elapsed > duration - 600 ? Math.max(0, (duration - elapsed) / 600) : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.scale(1, Math.cos(p.wobble)); // ひらひら回って見えるように
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'ribbon') {
        ctx.fillRect(-p.w / 4, -p.h, p.w / 2, p.h * 2);
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }

    if (alive > 0 && elapsed < duration) requestAnimationFrame(frame);
    else canvas.remove();
  }

  requestAnimationFrame(frame);
}
