/* ==========================================================================
   5 SITES PROJECT - hub launcher v2
   Entrance choreography + custom cursor + live WebGL2 row thumbnails +
   ScrambleText tag hover. Degrades cleanly: if GSAP is missing the page
   renders static; if WebGL2 is missing the thumbnails never appear; with
   reduced motion the thumbnails draw one frozen frame each.
   ========================================================================== */

(function () {
  'use strict';

  var docEl = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var hasGSAP = typeof window.gsap !== 'undefined';

  // Assigned by the thumbnail module; called when the intro overlay lifts so
  // the 2s attract loop plays while the rows are actually visible.
  var onIntroLifted = null;

  docEl.classList.add('js');

  /* ------------------------------------------------------------------
     Intro + entrance
     The overlay is display:none in the markup, so without JS (or with
     reduced motion) nothing ever covers the page.
     ------------------------------------------------------------------ */

  if (hasGSAP && !reduceMotion) {
    var gsap = window.gsap;
    var intro = document.getElementById('intro');
    var ticks = intro.querySelectorAll('.intro-tick');
    var mark = intro.querySelector('.intro-mark');

    intro.style.display = 'flex';

    // Initial states (set via JS so a script failure leaves content visible)
    gsap.set(mark, { autoAlpha: 0, y: 10 });
    gsap.set('.title .line-inner', { yPercent: 115 });
    gsap.set('.brand-row > *', { autoAlpha: 0, y: 14 });
    gsap.set('.meta span', { autoAlpha: 0, y: 10 });
    gsap.set('.index li', { autoAlpha: 0, y: 34 });
    gsap.set('.site-foot', { autoAlpha: 0 });

    var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl
      // Overlay: wordmark + five accent ticks light up
      .to(mark, { autoAlpha: 1, y: 0, duration: 0.28 })
      .to(ticks, {
        scaleX: 1,
        duration: 0.2,
        stagger: 0.04,
        ease: 'power2.inOut'
      }, '-=0.1')
      // Overlay lifts away (fully gone ~1.1s in)
      .to(intro, {
        yPercent: -100,
        duration: 0.5,
        ease: 'power4.inOut',
        onComplete: function () {
          intro.style.display = 'none';
          if (onIntroLifted) onIntroLifted();
        }
      }, '+=0.08')
      // Header cascade
      .to('.brand-row > *', { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.05 }, '-=0.3')
      .to('.title .line-inner', { yPercent: 0, duration: 0.6, stagger: 0.07 }, '<')
      .to('.meta span', { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.04 }, '-=0.4')
      // Rows stagger in
      .to('.index li', { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06 }, '-=0.35')
      .to('.site-foot', { autoAlpha: 1, duration: 0.4 }, '-=0.25');
  }

  /* ------------------------------------------------------------------
     Custom cursor - fine pointers only, never with reduced motion.
     One requestAnimationFrame loop; no canvas on this page.
     ------------------------------------------------------------------ */

  if (finePointer && !reduceMotion) {
    var cursor = document.getElementById('cursor');
    var targetX = window.innerWidth / 2;
    var targetY = window.innerHeight / 2;
    var curX = targetX;
    var curY = targetY;
    var shown = false;

    docEl.classList.add('cursor-on');

    window.addEventListener('pointermove', function (e) {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!shown) {
        shown = true;
        curX = targetX;
        curY = targetY;
        cursor.classList.add('is-visible');
      }
      if (!cursorRaf) cursorRaf = window.requestAnimationFrame(tick);
    }, { passive: true });

    document.addEventListener('pointerdown', function () {
      cursor.classList.add('is-down');
    });

    document.addEventListener('pointerup', function () {
      cursor.classList.remove('is-down');
    });

    document.addEventListener('mouseleave', function () {
      cursor.classList.remove('is-visible');
      shown = false;
    });

    // Grow the ring and tint it with each row's accent
    var rows = document.querySelectorAll('.row');
    for (var i = 0; i < rows.length; i++) {
      (function (row) {
        row.addEventListener('pointerenter', function () {
          var accent = getComputedStyle(row).getPropertyValue('--accent').trim();
          cursor.style.setProperty('--cursor-accent', accent);
          cursor.classList.add('is-hover');
        });
        row.addEventListener('pointerleave', function () {
          cursor.style.removeProperty('--cursor-accent');
          cursor.classList.remove('is-hover');
        });
      })(rows[i]);
    }

    // Self-stopping follower: runs only while the ring is still catching up,
    // then parks until the next pointermove restarts it. Zero rAF cost at idle.
    var cursorRaf = 0;
    var tick = function () {
      var dx = targetX - curX;
      var dy = targetY - curY;
      curX += dx * 0.18;
      curY += dy * 0.18;
      if (Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2) {
        curX = targetX;
        curY = targetY;
        cursorRaf = 0;
      } else {
        cursorRaf = window.requestAnimationFrame(tick);
      }
      cursor.style.transform = 'translate3d(' + curX + 'px,' + curY + 'px,0)';
    };
  }

  /* ------------------------------------------------------------------
     Tag scramble - ScrambleTextPlugin decodes each row's tech tags on
     hover. Skipped without GSAP, without the plugin, or with reduced
     motion; tags then simply stay as plain text.
     ------------------------------------------------------------------ */

  if (hasGSAP && !reduceMotion && typeof window.ScrambleTextPlugin !== 'undefined') {
    (function () {
      var g = window.gsap;
      g.registerPlugin(window.ScrambleTextPlugin);

      var rowEls = document.querySelectorAll('.row');
      for (var r = 0; r < rowEls.length; r++) {
        (function (row) {
          var tags = row.querySelectorAll('.row-tags i');
          if (!tags.length) return;
          var originals = [];
          for (var j = 0; j < tags.length; j++) originals.push(tags[j].textContent);

          row.addEventListener('pointerenter', function () {
            for (var k = 0; k < tags.length; k++) {
              g.to(tags[k], {
                duration: 0.65,
                delay: k * 0.08,
                overwrite: 'auto',
                scrambleText: {
                  text: originals[k],
                  chars: '01#/+X*=', // no <> - ScrambleText writes innerHTML
                  speed: 0.6
                }
              });
            }
          });
        })(rowEls[r]);
      }
    })();
  }

  /* ------------------------------------------------------------------
     Live WebGL2 thumbnails - one tiny bespoke fragment shader per row,
     each on its own 200x120 canvas (DPR 1), all driven by ONE shared
     rAF loop. A thumbnail animates only while its row is hovered or
     during an initial 2s attract loop; otherwise it freezes on its
     last frame. No WebGL2 -> the holders stay display:none.

     Context creation + shader compilation for five canvases is real
     main-thread work, so it is deferred to idle time after first paint
     (the intro overlay covers the rows at that point anyway).
     ------------------------------------------------------------------ */

  var initThumbs = function () {
    var holders = document.querySelectorAll('.row-thumb');
    if (!holders.length) return;

    var W = 200;
    var H = 120;

    // Fullscreen triangle from gl_VertexID - no buffers, no attributes.
    var VERT = [
      '#version 300 es',
      'void main(){',
      'vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));',
      'gl_Position=vec4(p*2.0-1.0,0.0,1.0);',
      '}'
    ].join('\n');

    var HEAD = [
      '#version 300 es',
      'precision highp float;',
      'uniform vec2 u_res;',
      'uniform float u_time;',
      'uniform float u_hover;',
      'out vec4 fragColor;',
      'float hash(vec2 p){p=fract(p*vec2(234.34,435.345));p+=dot(p,p+34.23);return fract(p.x*p.y);}',
      ''
    ].join('\n');

    var FRAGS = {

      // AURORA - drifting lime aurora bands
      aurora: HEAD + [
        'void main(){',
        '  vec2 uv = gl_FragCoord.xy / u_res;',
        '  float t = u_time;',
        '  vec3 col = vec3(0.016, 0.028, 0.030);',
        '  for (int i = 0; i < 3; i++) {',
        '    float fi = float(i);',
        '    float c = sin(uv.x * (2.6 + fi * 1.3) + t * (0.50 + fi * 0.21) + fi * 2.1) * 0.16',
        '            + sin(uv.x * (6.0 + fi * 2.0) - t * (0.33 + fi * 0.10) + fi) * 0.05;',
        '    float d = abs(uv.y - (0.38 + fi * 0.16) - c);',
        '    float glow = exp(-d * d * (150.0 - fi * 35.0));',
        '    vec3 tint = mix(vec3(0.78, 0.95, 0.31), vec3(0.24, 0.80, 0.62), fi * 0.45);',
        '    col += tint * glow * (0.55 - fi * 0.13);',
        '  }',
        '  col += vec3(0.78, 0.95, 0.31) * 0.04 * uv.y;',
        '  col *= 1.0 + 0.35 * u_hover;',
        '  fragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'),

      // NEBULA - slowly rotating spiral of glowing dots (pure shader)
      nebula: HEAD + [
        'void main(){',
        '  vec2 q = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;',
        '  float t = u_time * 0.22;',
        '  float r = length(q);',
        '  float a = atan(q.y, q.x) + t - r * 5.5;',
        '  vec2 g = vec2(a * 1.2732, r * 10.0);',
        '  vec2 id = floor(g);',
        '  vec2 f = fract(g) - 0.5;',
        '  float h = hash(id);',
        '  vec2 off = (vec2(hash(id + 7.3), hash(id + 3.1)) - 0.5) * 0.7;',
        '  float d = length(f - off);',
        '  float star = exp(-d * d * 34.0) * (0.35 + 0.65 * h);',
        '  float arm = 0.55 + 0.45 * cos(a * 2.0);',
        '  float fade = smoothstep(0.72, 0.12, r) * smoothstep(0.015, 0.10, r);',
        '  vec3 col = vec3(0.010, 0.016, 0.042);',
        '  col += mix(vec3(0.30, 0.85, 1.0), vec3(0.62, 0.42, 1.0), h) * star * arm * fade;',
        '  col += vec3(0.30, 0.85, 1.0) * exp(-r * r * 16.0) * 0.38;',
        '  col *= 1.0 + 0.4 * u_hover;',
        '  fragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'),

      // PRISM - refractive prism gradient sweep
      prism: HEAD + [
        'float sdTri(vec2 p, float r){',
        '  const float k = 1.7320508;',
        '  p.x = abs(p.x) - r;',
        '  p.y = p.y + r / k;',
        '  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;',
        '  p.x -= clamp(p.x, -2.0 * r, 0.0);',
        '  return -length(p) * sign(p.y);',
        '}',
        'void main(){',
        '  vec2 q = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;',
        '  float t = u_time;',
        '  float d = sdTri(vec2(q.x, -q.y + 0.06), 0.34);',
        '  float inside = smoothstep(0.014, -0.014, d);',
        '  float edge = exp(-abs(d) * 40.0);',
        '  vec2 dir = normalize(vec2(0.80, 0.45));',
        '  vec2 ruv = q - inside * dir * (0.14 + 0.04 * sin(t * 0.7));',
        '  float x = dot(ruv, dir) * 1.8 - t * 0.20;',
        '  vec3 spec = 0.5 + 0.5 * cos(6.2831 * (x + vec3(0.00, 0.33, 0.67)));',
        '  vec3 col = vec3(0.045, 0.035, 0.085);',
        '  col += spec * mix(vec3(0.10, 0.07, 0.16), vec3(0.34, 0.24, 0.55), inside);',
        '  col += vec3(0.62, 0.42, 1.0) * edge * 0.7;',
        '  col *= 1.0 + 0.35 * u_hover;',
        '  fragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'),

      // FLUX - raymarch-ish tunnel rings
      flux: HEAD + [
        'void main(){',
        '  vec2 q = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;',
        '  float t = u_time;',
        '  float r = length(q) + 1e-4;',
        '  float a = atan(q.y, q.x);',
        '  float z = 0.32 / r + t * 1.5;',
        '  float wob = sin(a * 3.0 + t * 0.9) * 0.05 + sin(a * 5.0 - t * 0.6) * 0.03;',
        '  float rings = pow(0.5 + 0.5 * sin((z + wob) * 4.2), 5.0);',
        '  float depth = smoothstep(0.02, 0.5, r);',
        '  vec3 hot = mix(vec3(1.0, 0.29, 0.24), vec3(1.0, 0.60, 0.26), 0.5 + 0.5 * sin(z * 0.7));',
        '  vec3 col = vec3(0.05, 0.012, 0.012);',
        '  col += hot * rings * depth;',
        '  col += vec3(1.0, 0.29, 0.24) * (1.0 - depth) * 0.25;',
        '  col *= 1.0 + 0.4 * u_hover;',
        '  fragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'),

      // TERRA - layered dune bands with grain
      terra: HEAD + [
        'void main(){',
        '  vec2 uv = gl_FragCoord.xy / u_res;',
        '  float t = u_time * 0.3;',
        '  vec3 col = mix(vec3(0.10, 0.075, 0.055), vec3(0.24, 0.17, 0.11), uv.y);',
        '  for (int i = 0; i < 4; i++) {',
        '    float fi = float(i);',
        '    float y = 0.64 - fi * 0.155',
        '            + sin(uv.x * (3.0 + fi * 1.7) + t * (0.5 + fi * 0.18) + fi * 4.7) * 0.05',
        '            + sin(uv.x * (7.0 + fi * 2.3) - t * 0.4 + fi * 2.3) * 0.02;',
        '    float m = smoothstep(y + 0.008, y - 0.008, uv.y);',
        '    vec3 dune = mix(vec3(0.88, 0.75, 0.55), vec3(0.24, 0.155, 0.095), fi / 3.0);',
        '    dune *= 0.92 + 0.08 * sin(uv.x * 16.0 + fi * 2.0 + t * 0.6);',
        '    col = mix(col, dune, m);',
        '  }',
        '  col += (hash(gl_FragCoord.xy + fract(u_time) * 61.7) - 0.5) * 0.06;',
        '  col *= 1.0 + 0.25 * u_hover;',
        '  fragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    };

    // Shared per-row setup helper: canvas + context + program + uniforms.
    function makeThumb(holder, frag) {
      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      var gl = canvas.getContext('webgl2', {
        antialias: false,
        alpha: false,
        depth: false,
        powerPreference: 'low-power'
      });
      if (!gl) return null;

      function compile(type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
      }

      var vs = compile(gl.VERTEX_SHADER, VERT);
      var fs = compile(gl.FRAGMENT_SHADER, frag);
      if (!vs || !fs) return null;

      var prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;

      gl.useProgram(prog);
      gl.viewport(0, 0, W, H);
      gl.uniform2f(gl.getUniformLocation(prog, 'u_res'), W, H);
      var uTime = gl.getUniformLocation(prog, 'u_time');
      var uHover = gl.getUniformLocation(prog, 'u_hover');

      holder.appendChild(canvas);
      return {
        canvas: canvas,
        draw: function (time, hover) {
          gl.uniform1f(uTime, time);
          gl.uniform1f(uHover, hover);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      };
    }

    var thumbs = [];
    for (var i = 0; i < holders.length; i++) {
      var kind = holders[i].getAttribute('data-thumb');
      if (!FRAGS[kind]) continue;
      var made = makeThumb(holders[i], FRAGS[kind]);
      if (!made) continue;

      var th = {
        canvas: made.canvas,
        draw: made.draw,
        time: 20 + i * 7.3, // seeded so frozen frames all differ
        hovered: false,
        hover: 0,
        visible: true
      };
      thumbs.push(th);

      (function (thumb, row) {
        if (!row) return;
        row.addEventListener('pointerenter', function () { thumb.hovered = true; wake(); });
        row.addEventListener('pointerleave', function () { thumb.hovered = false; });
        row.addEventListener('focusin', function () { thumb.hovered = true; wake(); });
        row.addEventListener('focusout', function () { thumb.hovered = false; });
      })(th, holders[i].closest('.row'));
    }

    // No WebGL2 (or every program failed): holders stay display:none.
    if (!thumbs.length) return;
    docEl.classList.add('thumbs-on');

    // Draw one frame everywhere so frozen thumbnails are never blank.
    for (var d0 = 0; d0 < thumbs.length; d0++) thumbs[d0].draw(thumbs[d0].time, 0);

    // Reduced motion: keep the static frames, never animate.
    if (reduceMotion) return;

    // Pause everything while the tab is hidden; wake re-checks activity.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      } else {
        wake();
      }
    });

    // Pause offscreen thumbnails.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        for (var e = 0; e < entries.length; e++) {
          for (var k = 0; k < thumbs.length; k++) {
            if (thumbs[k].canvas === entries[e].target) {
              thumbs[k].visible = entries[e].isIntersecting;
            }
          }
        }
      });
      for (var o = 0; o < thumbs.length; o++) io.observe(thumbs[o].canvas);
    }

    var attractUntil = performance.now() + 2000; // 2s attract loop, then freeze
    var rafId = 0;
    var lastNow = 0;

    // If the intro overlay is running it hides the rows for ~2s; restart the
    // attract window the moment it lifts so the loop is actually seen.
    onIntroLifted = function () {
      attractUntil = performance.now() + 2000;
      wake();
    };

    function anyActive(now) {
      if (now < attractUntil) return true;
      for (var a = 0; a < thumbs.length; a++) {
        if (thumbs[a].hovered || thumbs[a].hover > 0.01) return true;
      }
      return false;
    }

    function frame(now) {
      var dt = Math.min((now - lastNow) / 1000, 0.05);
      lastNow = now;
      var attract = now < attractUntil;

      for (var f = 0; f < thumbs.length; f++) {
        var t = thumbs[f];
        t.hover += ((t.hovered ? 1 : 0) - t.hover) * 0.09; // lerped uniform
        if ((attract || t.hovered || t.hover > 0.01) && t.visible) {
          t.time += dt * (0.65 + 0.55 * t.hover);
          t.draw(t.time, t.hover);
        }
      }

      if (anyActive(now)) {
        rafId = window.requestAnimationFrame(frame);
      } else {
        rafId = 0; // fully frozen until the next hover wakes it
      }
    }

    function wake() {
      if (rafId || reduceMotion) return;
      lastNow = performance.now();
      rafId = window.requestAnimationFrame(frame);
    }

    wake();
  };

  // Defer thumbnail setup past first paint; the 500ms timeout guarantees the
  // attract loop still overlaps the entrance even on a busy main thread.
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(initThumbs, { timeout: 500 });
  } else {
    window.setTimeout(initThumbs, 50);
  }
})();
