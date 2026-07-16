/* LUMEN Studio — hero aurora canvas (light, soft, slow) */
(function () {
  'use strict';

  var canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  if (canvas.dataset.gl === '1') return; /* WebGL tier active (hero-gl.js) */

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;
  var mouseX = 0.5, mouseY = 0.5;
  var targetX = 0.5, targetY = 0.5;

  /* soft pastel blobs on ivory */
  var blobs = [
    { hue: [157, 107, 255], a: 0.16, r: 0.42, x: 0.80, y: 0.20, sx: 0.00016, sy: 0.00021, px: 0.9, py: 0.0 },
    { hue: [255, 176, 128], a: 0.13, r: 0.38, x: 0.12, y: 0.30, sx: 0.00019, sy: 0.00014, px: 2.1, py: 4.2 },
    { hue: [108, 92, 255], a: 0.11, r: 0.46, x: 0.55, y: 0.90, sx: 0.00013, sy: 0.00017, px: 3.7, py: 1.4 },
    { hue: [150, 190, 255], a: 0.11, r: 0.34, x: 0.35, y: 0.10, sx: 0.00021, sy: 0.00012, px: 5.2, py: 2.8 }
  ];

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    W = Math.max(1, Math.floor(rect.width));
    H = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);

    /* ivory base */
    ctx.fillStyle = '#FAF9F7';
    ctx.fillRect(0, 0, W, H);

    mouseX += (targetX - mouseX) * 0.03;
    mouseY += (targetY - mouseY) * 0.03;

    var maxDim = Math.max(W, H);

    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      var bx = (b.x + Math.sin(t * b.sx + b.px) * 0.09 + (mouseX - 0.5) * 0.045 * (i + 1)) * W;
      var by = (b.y + Math.cos(t * b.sy + b.py) * 0.09 + (mouseY - 0.5) * 0.045 * (i + 1)) * H;
      var br = b.r * maxDim;

      var g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      var c = b.hue;
      g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + b.a + ')');
      g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }

    /* ultra-subtle dot grid, fades toward the bottom */
    ctx.fillStyle = 'rgba(20,18,31,0.045)';
    var gap = 34;
    var ox = (t * 0.004) % gap;
    for (var x = -ox; x < W; x += gap) {
      for (var y = 0; y < H * 0.72; y += gap) {
        var fade = 1 - y / (H * 0.72);
        ctx.globalAlpha = 0.5 * fade;
        ctx.fillRect(x, y, 1.4, 1.4);
      }
    }
    ctx.globalAlpha = 1;
  }

  var rafId = null;
  function loop(t) {
    draw(t);
    rafId = requestAnimationFrame(loop);
  }

  resize();
  window.addEventListener('resize', resize);

  if (reduced) {
    draw(0); /* single static frame */
  } else {
    window.addEventListener('pointermove', function (e) {
      targetX = e.clientX / window.innerWidth;
      targetY = e.clientY / window.innerHeight;
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
      } else if (!rafId) {
        rafId = requestAnimationFrame(loop);
      }
    });

    rafId = requestAnimationFrame(loop);
  }
})();
