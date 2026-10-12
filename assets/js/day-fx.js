/* day-fx.js: day-only ambient light for the LIGHT SOURCE site: "white light, a hand-coloured anatomical plate in
   sunlight". The calm counterpart of night-fx.js, built on the same frame: one fixed 2D canvas inside .field-backdrop,
   under the paper grain, so it sits behind every section and never takes pointer events.
   - sunlight: a warm window glow and a cool far shade, slow diagonal light shafts that drift, breathe like passing
     clouds and slide with scroll, water caustics rippling inside the shafts, dust motes that glint only where a shaft
     catches them and swirl in the air the pointer pushes;
   - watercolour pigment: the pointer lays soft pigment blooms that spread, soften and dry away, tinted by the project
     hue under it (the nearest data-hue, else the chapter, else a slow walk through the seven hues); a click or tap drops
     a larger bloom with satellite drops. Stains belong to the paper, so they scroll with the page.
   Contrast (WCAG AA): the light colours sit at or above the paper's luminance, so they only lighten the pools. Each
   hue's pigment is its own CSS wash (--p-*) pushed to more chroma at the same luminance, then lifted to at least
   L 0.815 (every day accent needs <= 0.794 for 4.5:1), and the pigment layer covers at most 90%: no day text token
   (ink, body, ink-2, ink-3, the seven accents) drops below 4.5:1 on the paper, a pool peak or a shaft.
   Off under prefers-reduced-motion and in the night theme; waits for the loader; paused while the tab is hidden;
   DPR capped at 1; shafts and pigment drawn at half resolution; 30 fps when idle and on phones. Nothing is built
   (no canvas, buffers, observers or listeners beyond the theme watch) until the theme is first day, and the
   canvas leaves the DOM while the theme is night.
   Lite mode (html.jw-lite, see the head boot script): the same light at half resolution (upscaled by the
   browser), phone counts, a new caustic key every 300 ms (cross-faded), 30 fps while scrolling or after a tap
   and 12 fps at rest.
   Public (QA): window.JWDayFX = {active(), stats(), pause(), resume(), destroy()} */
(function () {
  "use strict";

  var html = document.documentElement, doc = document, win = window;
  if (win.JWDayFX) return;
  function mql(q) { try { return win.matchMedia(q); } catch (e) { return null; } }
  function mq(q) { var m = mql(q); return !!(m && m.matches); }
  var RM = mql("(prefers-reduced-motion: reduce)");
  if (RM && RM.matches) return;

  function off(w, h) { var c = doc.createElement("canvas"); c.width = w; c.height = h; return c; }
  var canvas = doc.createElement("canvas");
  var ctx = null, lightC = off(2, 2), lctx = null, pigC = off(2, 2), pctx = null;
  try {
    ctx = canvas.getContext("2d", { alpha: true });
    lctx = lightC.getContext("2d", { alpha: true });
    pctx = pigC.getContext("2d", { alpha: true });
  } catch (e) { ctx = null; }
  if (!ctx || !lctx || !pctx) return;

  var FINE = mq("(pointer: fine)") && mq("(hover: hover)");
  var LITE = html.classList.contains("jw-lite") || win.JW_LITE === true || (win.JW_LITE !== false && (
    mq("(pointer: coarse)") || mq("(max-width: 900px)") || (navigator.hardwareConcurrency || 8) <= 4 ||
    (navigator.deviceMemory || 8) <= 4 || !!(navigator.connection && navigator.connection.saveData)));
  var PHONE = mq("(max-width: 760px)") || LITE;   /* lite gets the phone counts and buffer scales */
  var RS = LITE ? 0.5 : 1;                         /* main canvas resolution scale (CSS stretches it) */
  var TAU = Math.PI * 2;
  var LS = PHONE ? 0.34 : 0.5;     /* light buffer scale: shafts are soft, half resolution is plenty */
  var PS = PHONE ? 0.5 : 1;        /* pigment buffer scale: full size on desktop keeps the tide lines crisp */
  var CAP = 0.9;                   /* max pigment coverage (see the contrast note above) */
  var PIG_FLOOR = 0.815;           /* min pigment luminance (see the contrast note above) */
  var BEAM_A = 0.44;               /* shafts fall from the upper left, 25 degrees off vertical */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function now() { return (win.performance && performance.now) ? performance.now() : Date.now(); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rgba(c, a) { return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + clamp(a, 0, 1).toFixed(3) + ")"; }

  /* ---------- colour: CSS colour -> [r, g, b]; pigment = the hue's wash with more chroma at the same luminance ---------- */
  var probeC = off(1, 1), probe = null;
  try { probe = probeC.getContext("2d", { willReadFrequently: true }); } catch (e) { probe = null; }
  function toRgb(str) {
    str = (str || "").trim();
    if (!str) return null;
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str);
    if (m) {
      var h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    if (!probe) return null;
    try {
      probe.fillStyle = "#010203"; probe.fillStyle = str;
      if (String(probe.fillStyle).toLowerCase() === "#010203") return null;
      probe.clearRect(0, 0, 1, 1); probe.fillRect(0, 0, 1, 1);
      var d = probe.getImageData(0, 0, 1, 1).data;
      return d[3] > 0 ? [d[0], d[1], d[2]] : null;
    } catch (e) { return null; }
  }
  function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function unlin(v) { v = clamp(v, 0, 1); return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); }
  function lum(c) { return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  function pigmentOf(wash) {
    var p = [lin(wash[0]), lin(wash[1]), lin(wash[2])];
    var L0 = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2], k = 1.7, i;
    for (i = 0; i < 3; i++) {
      if (p[i] > L0 + 1e-6) k = Math.min(k, 0.98 * (1 - L0) / (p[i] - L0));
      else if (p[i] < L0 - 1e-6) k = Math.min(k, 0.98 * L0 / (L0 - p[i]));
    }
    var out = [], lift = (Math.max(L0 + 0.012, PIG_FLOOR) - L0) / Math.max(1e-6, 1 - L0);
    for (i = 0; i < 3; i++) {
      var q = L0 + k * (p[i] - L0);                       /* chroma push in linear light: luminance unchanged */
      q += lift * (1 - q);                                /* then lift toward white to the luminance floor */
      out.push(Math.round(unlin(q)));
    }
    return out;
  }
  var HUES = ["coil", "nbi", "icg", "disc", "fundus", "mucosa", "ppix"];
  var WASH = { coil: "#E2E5F8", nbi: "#D9EFF1", icg: "#DAF0E6", disc: "#F5EBCF", fundus: "#F6E2D0", mucosa: "#F6DDD7", ppix: "#F4DCE7" };
  var PIG = {};
  function readPalette() {
    var cs = null;
    try { cs = getComputedStyle(html); } catch (e) { cs = null; }
    HUES.forEach(function (h) {
      var w = toRgb(cs ? cs.getPropertyValue("--p-" + h) : "");
      if (!w || lum(w) < 0.6) w = toRgb(WASH[h]);          /* never build pigment from night's deep pools */
      PIG[h] = pigmentOf(w);
    });
  }
  /* light colours: luminance 0.88 to 0.93, so over the paper (0.889) they shift hue and over a pool they only lighten */
  var SUN = [255, 242, 204], GLOW = [255, 246, 226], SHADE = [235, 242, 255];

  /* ---------- pigment sprites: alpha masks drawn once, tinted per hue on demand ---------- */
  var MS = 128, masks = [], tinted = {};
  function blobPath(g, cx, cy, R, n, amp) {
    var ph = [rnd(0, TAU), rnd(0, TAU), rnd(0, TAU)], pts = [], i;
    for (i = 0; i < n; i++) {
      var a = i / n * TAU;
      var r = R * (1 + amp * (0.5 * Math.sin(3 * a + ph[0]) + 0.3 * Math.sin(5 * a + ph[1]) + 0.2 * Math.sin(9 * a + ph[2])) + rnd(-0.03, 0.03));
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    g.beginPath();
    g.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
    for (i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    g.closePath();
  }
  function softDot(g, x, y, r, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(0,0,0," + a + ")"); gr.addColorStop(0.6, "rgba(0,0,0," + (a * 0.6) + ")"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  function hardMask() {          /* wet on dry: a flat wash, a dark tide line where the pigment dried, granulation, back-runs */
    var c = off(MS, MS), g = c.getContext("2d"), C = MS / 2, R = MS * 0.37, k;
    g.fillStyle = "#000"; g.strokeStyle = "#000"; g.lineJoin = "round";
    blobPath(g, C, C, R, 40, 0.17);
    g.globalAlpha = 0.5; g.fill();
    g.globalAlpha = 0.22; g.lineWidth = 8; g.stroke();
    g.globalAlpha = 0.85; g.lineWidth = 2.2; g.stroke();
    g.save(); g.clip();
    for (k = 0; k < 240; k++) {
      g.globalAlpha = rnd(0.04, 0.16);
      g.beginPath(); g.arc(rnd(C - R * 1.2, C + R * 1.2), rnd(C - R * 1.2, C + R * 1.2), rnd(0.4, 1.3), 0, TAU); g.fill();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "destination-out";
    for (k = 0; k < 3; k++) softDot(g, C + rnd(-R, R) * 0.4, C + rnd(-R, R) * 0.4, rnd(0.16, 0.32) * R, 0.42);
    g.restore();
    return c;
  }
  function softMask() {          /* wet in wet: overlapping feathered blots, pigment creeping out along wet fibres */
    var c = off(MS, MS), g = c.getContext("2d"), C = MS / 2, R = MS * 0.44, k, a, d;
    for (k = 0; k < 7; k++) { a = rnd(0, TAU); d = rnd(0, R * 0.32); softDot(g, C + Math.cos(a) * d, C + Math.sin(a) * d, rnd(0.45, 0.68) * R, 0.32); }
    for (k = 0; k < 16; k++) { a = rnd(0, TAU); d = rnd(0.55, 0.82) * R; softDot(g, C + Math.cos(a) * d, C + Math.sin(a) * d, rnd(0.07, 0.18) * R, 0.28); }
    g.fillStyle = "#000";
    for (k = 0; k < 140; k++) {
      a = rnd(0, TAU); d = Math.sqrt(Math.random()) * R * 0.75;
      g.globalAlpha = rnd(0.03, 0.1);
      g.beginPath(); g.arc(C + Math.cos(a) * d, C + Math.sin(a) * d, rnd(0.4, 1.2), 0, TAU); g.fill();
    }
    return c;
  }
  function spritesFor(h) {
    var col = PIG[h] || PIG.nbi, key = col.join(",");
    var t = tinted[h];
    if (t && t.key === key) return t.list;
    var list = masks.map(function (m) {
      var c = off(MS, MS), g = c.getContext("2d");
      g.drawImage(m, 0, 0);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = rgba(col, 1); g.fillRect(0, 0, MS, MS);
      return c;
    });
    tinted[h] = { key: key, list: list };
    return list;
  }
  var moteS = off(16, 16);
  (function () {
    var g = moteS.getContext("2d"), gr = g.createRadialGradient(8, 8, 0, 8, 8, 8);
    gr.addColorStop(0, "rgba(255,253,242,1)"); gr.addColorStop(0.22, "rgba(238,200,116,.95)");
    gr.addColorStop(0.55, "rgba(226,178,88,.32)"); gr.addColorStop(1, "rgba(226,178,88,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 16, 16);
  })();

  /* ---------- caustics: a small tileable water-caustic texture, recomputed ~12x a second and cross-faded ---------- */
  var CT = LITE ? 40 : PHONE ? 44 : 64, CT_MS = LITE ? 300 : 80;
  var tiles = [off(CT, CT), off(CT, CT)], tileG = [tiles[0].getContext("2d"), tiles[1].getContext("2d")];
  var cimg = null;
  try { cimg = tileG[0].createImageData(CT, CT); } catch (e) { cimg = null; }
  var pats = [null, null], cur = 0, cLast = -1, cMs = 0, cN = 0;
  function causticTile(g, time) {
    var d = cimg.data, i = 0, x, y, n;
    for (y = 0; y < CT; y++) {
      var py = y / CT * TAU - 250;
      for (x = 0; x < CT; x++) {
        var px = x / CT * TAU - 250, ix = px, iy = py, c = 1;
        for (n = 0; n < 5; n++) {
          var t = time * (1 - 3.5 / (n + 1));
          var nx = px + Math.cos(t - ix) + Math.sin(t + iy), ny = py + Math.sin(t - iy) + Math.cos(t + ix);
          ix = nx; iy = ny;
          var sa = Math.sin(ix + t), sb = Math.cos(iy + t);
          var a = px * 0.005 / (Math.abs(sa) > 1e-5 ? sa : 1e-5), b = py * 0.005 / (Math.abs(sb) > 1e-5 ? sb : 1e-5);
          c += 1 / Math.sqrt(a * a + b * b);
        }
        c = 1.17 - Math.pow(c / 5, 1.4);
        var v = Math.pow(Math.abs(c), 8);
        d[i] = 255; d[i + 1] = 253; d[i + 2] = 244; d[i + 3] = clamp(v * 1.5 - 0.05, 0, 1) * 255;
        i += 4;
      }
    }
    g.putImageData(cimg, 0, 0);
  }
  function updateCaustics(t) {
    if (!cimg) return 1;
    if (cLast >= 0 && t - cLast < CT_MS) return clamp((t - cLast) / CT_MS, 0, 1);
    var t0 = now();
    cur = 1 - cur;
    causticTile(tileG[cur], t / 1000 * 0.2 + 23);
    try { pats[cur] = lctx.createPattern(tiles[cur], "repeat"); } catch (e) { pats[cur] = null; }
    if (!pats[1 - cur]) pats[1 - cur] = pats[cur];
    cMs += now() - t0; cN++;
    cLast = t;
    return 0;
  }

  /* ---------- the canvas ---------- */
  canvas.className = "day-fx";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:1;display:block;pointer-events:none;" +
    "opacity:0;transition:opacity 1.4s cubic-bezier(.16,1,.3,1)";
  var W = 0, H = 0, DPR = 1;
  function host() {
    var b = doc.querySelector(".field-backdrop");
    if (b) return b;
    b = doc.createElement("div");
    b.className = "field-backdrop"; b.setAttribute("aria-hidden", "true");
    b.style.cssText = "position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none";
    doc.body.insertBefore(b, doc.body.firstChild);
    return b;
  }
  function attach() {
    var b = host(), grain = b.querySelector(".grain");
    if (grain) b.insertBefore(canvas, grain); else b.appendChild(canvas);   /* the paper grain lies over the pigment */
  }
  function resize() {
    var w = win.innerWidth || html.clientWidth, h = win.innerHeight || html.clientHeight;
    if (!w || !h) return;
    var d = Math.min(win.devicePixelRatio || 1, 1) * RS;
    if (w === W && h === H && d === DPR) return;
    var sx = W ? w / W : 1, sy = H ? h / H : 1;
    W = w; H = h; DPR = d;
    canvas.width = Math.max(2, Math.round(w * d)); canvas.height = Math.max(2, Math.round(h * d));
    lightC.width = Math.max(2, Math.ceil(w * LS)); lightC.height = Math.max(2, Math.ceil(h * LS));
    pigC.width = Math.max(2, Math.ceil(w * PS)); pigC.height = Math.max(2, Math.ceil(h * PS));
    for (var i = 0; i < motes.length; i++) { motes[i].x *= sx; motes[i].y *= sy; }
    seed();
    measure();
  }

  /* ---------- chapters (cached offsets; re-measured on layout changes) ---------- */
  var secs = [];
  function collect() {
    secs = Array.prototype.slice.call(doc.querySelectorAll("[data-chapter]")).filter(function (el) {
      return !(el.parentElement && el.parentElement.closest("[data-chapter]"));
    }).map(function (el) {
      var h = el.getAttribute("data-hue");
      return { el: el, hue: h && HUES.indexOf(h) >= 0 ? h : null, top: 0, bot: 0 };
    });
  }
  function measure() {
    var sy = readSY();
    for (var i = 0; i < secs.length; i++) {
      var s = secs[i], p = s.el.parentElement;
      var box = p && p.classList && p.classList.contains("pin-spacer") ? p : s.el;
      var r = box.getBoundingClientRect();
      s.top = r.top + sy; s.bot = r.bottom + sy;
    }
  }
  var curHue = null;
  function updateChapter(sy) {
    var c = sy + H * 0.5, hue = null;
    for (var i = 0; i < secs.length; i++) { if (c >= secs[i].top && c < secs[i].bot) { hue = secs[i].hue; break; } }
    curHue = hue;
  }

  /* ---------- shafts ---------- */
  var beams = [];
  function seedBeams() {
    var n = PHONE ? 3 : 5;
    beams = [];
    for (var i = 0; i < n; i++) {
      beams.push({ u: (i + rnd(-0.22, 0.22)) / n, w: rnd(0.05, 0.13) * (i % 2 ? 1 : 1.5), a: rnd(0.6, 1),
        ph: rnd(0, TAU), sp: rnd(0.5, 1.4) });
    }
  }
  var cA = Math.cos(BEAM_A), sA = Math.sin(BEAM_A);
  var SPAN = 1, PROF_N = PHONE ? 48 : 96, prof = new Float32Array(PROF_N + 1), beamShift = 0, cloud = 1;
  /* beam intensity across the shafts, sampled once per frame: used by the shaft gradient and by the motes */
  function buildProfile(tt, sy) {
    SPAN = W * cA + H * sA + 120;
    beamShift = tt * 0.0035 + sy * 0.1 / SPAN;      /* slow drift of the sun, plus scroll parallax */
    cloud = 0.8 + 0.2 * Math.sin(tt * 0.05) * Math.sin(tt * 0.031 + 1.3);   /* clouds passing */
    for (var k = 0; k <= PROF_N; k++) prof[k] = 0;
    for (var i = 0; i < beams.length; i++) {
      var b = beams[i], wf = Math.max(b.w, 70 / SPAN), half = wf / 2;
      var a = b.a * cloud * (0.7 + 0.3 * (0.5 + 0.5 * Math.sin(tt * 0.11 * b.sp + b.ph)));
      var c = b.u + beamShift * b.sp; c -= Math.floor(c);
      for (var j = 0; j <= PROF_N; j++) {
        var u = j / PROF_N, du = Math.abs(u - c);
        if (du > 0.5) du = 1 - du;                    /* the span wraps */
        if (du >= half) continue;
        var t = 1 - du / half, f = t < 0.6 ? t / 0.6 * 0.75 : 0.75 + (t - 0.6) / 0.4 * 0.25;
        var v = a * f * f * (3 - 2 * f);
        if (v > prof[j]) prof[j] = v;
      }
    }
  }
  function beamAt(x, y) {
    var X = x - W / 2, Y = y - H / 2;
    var u = (X * cA - Y * sA) / SPAN + 0.5, v = (X * sA + Y * cA);
    if (u < 0 || u > 1) return 0;
    var fu = u * PROF_N, j = Math.floor(fu), w = fu - j;
    var p = prof[j] * (1 - w) + prof[Math.min(PROF_N, j + 1)] * w;
    var R = Math.sqrt(W * W + H * H) / 2 + 20;
    return p * (1 - 0.64 * clamp((v + R) / (2 * R), 0, 1));
  }
  function renderLight(t, sy) {
    var g = lctx, R = Math.sqrt(W * W + H * H) / 2 + 20, i;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    g.clearRect(0, 0, lightC.width, lightC.height);
    g.setTransform(LS * cA, -LS * sA, LS * sA, LS * cA, LS * W / 2, LS * H / 2);   /* rotate(-BEAM_A) about the centre */
    var gr = g.createLinearGradient(-SPAN / 2, 0, SPAN / 2, 0);
    for (i = 0; i <= PROF_N; i++) gr.addColorStop(i / PROF_N, rgba(SUN, prof[i]));
    /* caustics, masked by the shafts, then the shafts themselves underneath. Two layers of the same texture at
       different scales, angles and drifts, so the net never reads as a repeating tile */
    var f = updateCaustics(t);
    if (pats[cur]) {
      var M = (typeof DOMMatrix === "function") ? DOMMatrix : null, sc = PHONE ? 3.2 : 4.2;
      for (var L = 0; L < 2; L++) {
        for (i = 0; i < 2; i++) {
          var p = pats[i], al = (i === cur ? f : 1 - f) * (L ? 0.75 : 1);
          if (!p || al < 0.01) continue;
          if (M && p.setTransform) {
            try {
              p.setTransform(L ? new M().translateSelf(t * 0.004 - sy * 0.12, sy * 0.3).rotateSelf(41).scaleSelf(sc * 1.63)
                               : new M().translateSelf(-sy * 0.05, -sy * 0.22 + t * 0.006).scaleSelf(sc));
            } catch (e) { /* static texture */ }
          } else if (L) continue;
          g.fillStyle = p; g.globalAlpha = al; g.fillRect(-R, -R, 2 * R, 2 * R);
        }
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = "destination-in";
      g.fillStyle = gr; g.fillRect(-R, -R, 2 * R, 2 * R);
      g.globalCompositeOperation = "destination-over";
    }
    g.fillStyle = gr; g.globalAlpha = 1; g.fillRect(-R, -R, 2 * R, 2 * R);
    /* shafts fade with distance from the window */
    g.globalCompositeOperation = "destination-in";
    var fg = g.createLinearGradient(0, -R, 0, R);
    fg.addColorStop(0, "rgba(0,0,0,1)"); fg.addColorStop(0.5, "rgba(0,0,0,.74)"); fg.addColorStop(1, "rgba(0,0,0,.36)");
    g.fillStyle = fg; g.fillRect(-R, -R, 2 * R, 2 * R);
    g.globalCompositeOperation = "source-over";
  }

  /* ---------- motes ---------- */
  var motes = [];
  function makeMote() {
    var z = 0.3 + Math.random() * 0.7;
    return { x: Math.random() * W, y: Math.random() * H, z: z, size: 1 + z * 2, vx: rnd(-4, 4) * z, vy: rnd(-3, 2) * z,
      ix: 0, iy: 0, ph: rnd(0, TAU), tw: rnd(0.8, 2.6), sf: rnd(0.1, 0.4) };
  }
  function seed() {
    var n = PHONE ? 28 : clamp(Math.round(W * H / 18000), 40, 90);
    while (motes.length < n) motes.push(makeMote());
    if (motes.length > n) motes.length = n;
  }

  /* ---------- pigment ---------- */
  var dabs = [], MAXD = PHONE ? 60 : 150;
  var ptr = { x: 0, y: 0, on: false, lt: 0, vx: 0, vy: 0, acc: 0, dist: 0 };
  var lastTarget = null, lastHue = null, lastInput = 0;
  function walkHue() { return HUES[Math.floor(ptr.dist / 420) % HUES.length]; }
  function hueAt(target) {
    if (target !== lastTarget) {
      lastTarget = target;
      var el = target && target.closest ? target.closest("[data-hue]") : null, h = el ? el.getAttribute("data-hue") : null;
      lastHue = h && HUES.indexOf(h) >= 0 ? h : null;
    }
    return lastHue || curHue || walkHue();
  }
  function addDab(x, y, h, o) {
    dabs.push({ x: x, y: y, h: h, t0: now() + (o.delay || 0), r0: o.r0, r1: o.r1, life: o.life, grow: o.grow, a: o.a,
      rot: o.rot != null ? o.rot : rnd(0, TAU), sx: o.sx || 1, hv: Math.random() < 0.5 ? 0 : 1, sv: Math.random() < 0.5 ? 2 : 3,
      hard: o.hard != null ? o.hard : rnd(0.35, 1) });
    if (dabs.length > MAXD) dabs.splice(0, dabs.length - MAXD);
  }
  function drop(x, y, h) {
    addDab(x, y, h, { r0: 18, r1: rnd(100, 135), life: 3.4, grow: 1.7, a: 0.85, hard: 1 });
    addDab(x, y, h, { r0: 10, r1: rnd(60, 82), life: 2.9, grow: 1.1, a: 0.55, hard: 0.2 });
    var n = 5 + Math.floor(Math.random() * 4);
    for (var i = 0; i < n; i++) {
      var a = rnd(0, TAU), d = rnd(70, 150);
      addDab(x + Math.cos(a) * d, y + Math.sin(a) * d, h, { r0: 3, r1: rnd(9, 24), life: rnd(1.8, 2.8), grow: 0.6, a: 0.8, hard: 1, delay: rnd(40, 200) });
    }
    lastInput = now();
    wake();
  }
  function onMove(e) {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    var t = now(), x = e.clientX, y = e.clientY;
    if (ptr.on && running && shown) {
      var dx = x - ptr.x, dy = y - ptr.y, dtp = Math.max(8, t - ptr.lt), d = Math.sqrt(dx * dx + dy * dy);
      ptr.vx = dx / dtp * 1000; ptr.vy = dy / dtp * 1000;
      var sp = Math.sqrt(ptr.vx * ptr.vx + ptr.vy * ptr.vy);
      var h = hueAt(e.target), rb = clamp(60 - sp * 0.014, 26, 60), gap = rb * 0.62, rot = Math.atan2(dy, dx);
      ptr.dist += d; ptr.acc += d;
      var k = 0;
      /* blooms overlap by about a third, so each wet edge stays visible: a chain of washes, not an airbrush line */
      while (ptr.acc >= gap && k < 8) {
        ptr.acc -= gap; k++;
        var f = d > 0 ? clamp(1 - ptr.acc / d, 0, 1) : 1;
        addDab(ptr.x + dx * f, ptr.y + dy * f, h, {
          r0: rb * rnd(0.25, 0.4), r1: rb * rnd(0.8, 1.2), life: rnd(2.4, 3.4), grow: rnd(1, 1.6),
          a: rnd(0.75, 1), rot: rot + rnd(-0.3, 0.3), sx: 1 + clamp(sp / 2200, 0, 0.6), hard: rnd(0.6, 1) });
      }
      if (ptr.acc > gap) ptr.acc = 0;
      if (sp > 900 && Math.random() < 0.3) {         /* a fast flick throws a few drops off the brush */
        var nx = -dy / (d || 1), ny = dx / (d || 1), side = Math.random() < 0.5 ? -1 : 1, o = rnd(12, 34);
        addDab(x + nx * o * side, y + ny * o * side, h, { r0: 2, r1: rnd(5, 12), life: rnd(1.2, 2), grow: 0.4, a: 0.85, hard: 1 });
      }
      /* the brush pushes the air: motes nearby drift with it */
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i], mx = m.x - x, my = m.y - y, md2 = mx * mx + my * my;
        if (md2 < 25600) { var w = 1 - Math.sqrt(md2) / 160; m.ix += ptr.vx * 0.05 * w; m.iy += ptr.vy * 0.05 * w; }
      }
    }
    ptr.x = x; ptr.y = y; ptr.on = true; ptr.lt = t;
    lastInput = t;
    wake();
  }
  function onLeave(e) { if (!e.relatedTarget) { ptr.on = false; ptr.acc = 0; } }
  var touchDown = null;
  function onDown(e) {
    if (!running || !shown) return;
    if (e.pointerType === "touch") { touchDown = { x: e.clientX, y: e.clientY, t: now() }; return; }
    if (e.button !== 0) return;
    drop(e.clientX, e.clientY, hueAt(e.target));
  }
  function onUp(e) {
    if (e.pointerType !== "touch" || !touchDown) return;
    var dx = e.clientX - touchDown.x, dy = e.clientY - touchDown.y;
    if (running && shown && now() - touchDown.t < 350 && dx * dx + dy * dy < 120) drop(e.clientX, e.clientY, hueAt(e.target));
    touchDown = null;
  }

  /* ---------- state ---------- */
  var running = false, raf = 0, last = 0, paused = false, dead = false, shown = false, built = false, fadeIn = 0;
  /* the scroll position comes from the passive scroll listener (style is clean there); frames never read it */
  var curSY = 0;
  function readSY() { curSY = win.scrollY || win.pageYOffset || 0; return curSY; }
  var lastSY = 0, vScroll = 0, heroLens = null, heroVis = true, heroIO = null, heroBlock = false;
  var fpsN = 0, fpsT = 0, fps = 0, frameMs = 0;
  var t0 = now();

  function isDay() { return html.getAttribute("data-theme") === "day"; }
  function loaderBusy() {
    var L = doc.querySelector(".loader");
    if (!L || L.classList.contains("is-done") || html.classList.contains("jw-seen")) return false;
    try { var cs = getComputedStyle(L); if (cs.display === "none" || cs.visibility === "hidden") return false; } catch (e) { return false; }
    return true;
  }
  function watchHero() {
    if (heroLens || heroIO) return;
    heroLens = doc.querySelector('.scope__lens[data-scope="hero"]');
    if (heroLens && "IntersectionObserver" in win) {
      heroVis = false;
      heroIO = new IntersectionObserver(function (es) { heroVis = es[es.length - 1].isIntersecting; }, { rootMargin: "40px 0px" });
      heroIO.observe(heroLens);
    }
  }
  function updateHero() {
    /* mid-burst the hero lens covers the viewport: nothing behind it to light */
    if (!heroLens) watchHero();
    heroBlock = false;
    if (!heroLens || !heroVis) return;         /* off screen: no layout read */
    var r = heroLens.getBoundingClientRect();
    if (r.bottom < 0 || r.top > H || !r.width) return;
    var api = heroLens._jwScope, st = api && api.state ? api.state() : null;
    var b = st ? st.burst || 0 : 0;
    heroBlock = b > 0.6 && b < 0.86;
  }

  function step(dt, tt) {
    var sy = curSY;
    var dy = sy - lastSY; lastSY = sy;
    if (Math.abs(dy) > H * 1.2) { dy = 0; dabs.length = 0; }     /* an anchor jump leaves the stains behind */
    vScroll += (dy / dt - vScroll) * Math.min(1, dt * 8);
    updateChapter(sy);
    updateHero();
    buildProfile(tt, sy);

    var decay = Math.exp(-dt * 1.4);
    for (var i = 0; i < motes.length; i++) {
      var p = motes[i];
      p.ix *= decay; p.iy *= decay;
      p.x += (p.vx + p.ix + Math.sin(tt * p.sf + p.ph) * 6 * p.z) * dt;
      p.y += (p.vy + p.iy + Math.cos(tt * p.sf * 0.8 + p.ph) * 4 * p.z) * dt - dy * p.z * 0.4;
      if (p.y < -12) { p.y += H + 24; p.x = Math.random() * W; } else if (p.y > H + 12) { p.y -= H + 24; p.x = Math.random() * W; }
      if (p.x < -12) p.x += W + 24; else if (p.x > W + 12) p.x -= W + 24;
    }
    var tn = now();
    for (var j = dabs.length - 1; j >= 0; j--) {
      var d = dabs[j];
      d.y -= dy;                                       /* stains are on the paper: they scroll with it */
      if ((tn - d.t0) / 1000 >= d.life || d.y < -300 || d.y > H + 300) dabs.splice(j, 1);
    }
  }

  /* ---------- drawing ---------- */
  function radial(x, y, rad, c, a, mid) {
    if (a < 0.004 || rad < 1) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rgba(c, a)); g.addColorStop(mid, rgba(c, a * 0.5)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function renderPigment(tn) {
    var g = pctx;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, pigC.width, pigC.height);
    var drawn = 0;
    for (var i = 0; i < dabs.length; i++) {
      var d = dabs[i], age = (tn - d.t0) / 1000;
      if (age <= 0) continue;
      var k = age / d.life;
      if (k >= 1) continue;
      var gk = 1 - Math.pow(1 - clamp(age / d.grow, 0, 1), 3);
      var r = d.r0 + (d.r1 - d.r0) * gk;
      var a = d.a * clamp(age / 0.08, 0, 1) * (1 - sstep(0.3, 1, k));     /* holds while wet, then dries away */
      if (a < 0.01) continue;
      var sp = spritesFor(d.h), c = Math.cos(d.rot), s = Math.sin(d.rot);
      g.setTransform(PS * c * d.sx, PS * s * d.sx, -PS * s, PS * c, PS * d.x, PS * d.y);
      /* a fresh wash has a hard wet edge; as it spreads the edge softens into the paper */
      var ha = a * d.hard * (1 - 0.35 * gk), sa = a * (0.2 + 0.5 * gk) * (1.2 - 0.6 * d.hard);
      if (ha > 0.01) { g.globalAlpha = clamp(ha, 0, 1); g.drawImage(sp[d.hv], -r, -r, 2 * r, 2 * r); }
      if (sa > 0.01) { g.globalAlpha = clamp(sa, 0, 1); g.drawImage(sp[d.sv], -r, -r, 2 * r, 2 * r); }
      drawn++;
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    return drawn;
  }
  function render(t, tt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    if (heroBlock) return;
    var M = Math.max(W, H), sy = lastSY;

    /* window light from the upper left, cool shade toward the far corner */
    radial(W * (-0.05 + 0.03 * Math.sin(tt * 0.03)), -H * 0.14, M * 0.95, GLOW, 0.62 * (0.75 + 0.25 * cloud), 0.42);
    radial(W * 1.05, H * 1.12, M * 0.85, SHADE, 0.5, 0.5);

    /* shafts with caustics */
    renderLight(t, sy);
    ctx.drawImage(lightC, 0, 0, W, H);

    /* pigment */
    if (dabs.length && renderPigment(now())) {
      ctx.globalAlpha = CAP;
      ctx.drawImage(pigC, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    /* motes glint only where a shaft catches them */
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i], bi = beamAt(m.x, m.y);
      if (bi < 0.03) continue;
      var tw = 0.5 + 0.5 * Math.sin(tt * m.tw + m.ph);
      var al = Math.pow(bi, 0.8) * (0.35 + 0.65 * tw) * (0.55 + 0.45 * m.z);
      if (al < 0.02) continue;
      var s = m.size * 4 * (0.85 + 0.3 * tw);
      ctx.globalAlpha = clamp(al, 0, 1);
      ctx.drawImage(moteS, m.x - s / 2, m.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- loop ---------- */
  function idle(t) { return t - lastInput > 1800 && Math.abs(vScroll) < 10 && !dabs.length; }
  /* minimum ms between drawn frames: desktop 60 fps while something moves, else 30; phones 30; lite 30 / 12 */
  function gap(t) {
    var rest = idle(t);
    if (LITE) return rest ? 80 : 30;
    return PHONE || rest ? 30 : 0;
  }
  function frame(t) {
    raf = 0;
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!shown) {
      if (loaderBusy()) { last = 0; lastSY = curSY; return; }
      shown = true; fadeIn = 2;
    }
    if (fadeIn && --fadeIn === 0) canvas.style.opacity = "1";   /* fade in once its opacity 0 has been styled */
    var dms = last ? t - last : 16.7;
    if (last && dms < gap(t)) return;
    last = t;
    var dt = clamp(dms / 1000, 0.001, 0.05), tt = (t - t0) / 1000, f0 = now();
    step(dt, tt);
    render(t, tt);
    frameMs += ((now() - f0) - frameMs) * 0.05;
    fpsN++;
    if (!fpsT) fpsT = t;
    else if (t - fpsT > 1000) { fps = Math.round(fpsN * 1000 / (t - fpsT)); fpsN = 0; fpsT = t; }
  }
  function wake() { if (running && !raf) raf = requestAnimationFrame(frame); }
  function start() {
    if (dead || paused || running || doc.hidden || !isDay()) return;
    running = true; last = 0; lastSY = readSY(); vScroll = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  var offTimer = 0;
  function reattach() {
    if (canvas.parentNode) return false;
    attach();
    if (ro) ro.observe(doc.body);
    collect(); measure();
    return true;
  }
  function detach() {
    if (ro) ro.disconnect();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);   /* no layer, no paint while the theme is night */
  }
  function themeSync() {
    if (dead) return;
    if (isDay()) {
      if (offTimer) { clearTimeout(offTimer); offTimer = 0; }
      if (!built) { build(); return; }
      readPalette();
      if (reattach()) { canvas.style.opacity = "0"; if (shown) fadeIn = 2; }
      else if (shown) canvas.style.opacity = "1";
      start();
    } else if (built) {
      canvas.style.opacity = "0";
      if (!offTimer) offTimer = setTimeout(function () {
        offTimer = 0;
        if (!isDay()) { stop(); dabs.length = 0; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); detach(); }
      }, 1500);
    }
  }

  var listeners = [];
  function on(t, type, fn, opt) { t.addEventListener(type, fn, opt); listeners.push([t, type, fn, opt]); }
  var mo = null, ro = null;

  function destroy() {
    dead = true; stop();
    if (offTimer) clearTimeout(offTimer);
    listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
    listeners = [];
    if (mo) mo.disconnect();
    if (ro) ro.disconnect();
    if (heroIO) heroIO.disconnect();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  /* the light itself: built the first time the theme is day */
  function build() {
    if (built || dead) return;
    built = true;
    masks = [hardMask(), hardMask(), softMask(), softMask()];
    readPalette();
    seedBeams();
    attach();
    collect();
    resize();
    measure();
    updateChapter(readSY());
    watchHero();

    on(win, "resize", function () { resize(); measure(); }, { passive: true });
    on(win, "load", function () { collect(); measure(); });
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { if (canvas.parentNode) measure(); });
    if (win.ScrollTrigger && win.ScrollTrigger.addEventListener) {
      try { win.ScrollTrigger.addEventListener("refresh", function () { if (canvas.parentNode) measure(); }); } catch (e) { /* older GSAP */ }
    }
    if ("ResizeObserver" in win) { ro = new ResizeObserver(function () { measure(); }); ro.observe(doc.body); }
    if (FINE) {
      on(win, "pointermove", onMove, { passive: true });
      on(doc, "mouseout", onLeave, { passive: true });
      on(win, "blur", function () { ptr.on = false; ptr.acc = 0; });
    }
    on(win, "pointerdown", onDown, { passive: true });
    on(win, "pointerup", onUp, { passive: true });
    on(win, "scroll", function () { readSY(); lastInput = now(); wake(); }, { passive: true });
    on(doc, "visibilitychange", function () { if (doc.hidden) stop(); else start(); });
    start();
  }

  /* always: watch the theme (and reduced motion); everything else waits for day */
  function init() {
    if (dead) return;
    on(doc, "themechange", themeSync);
    on(doc, "themechangeend", themeSync);
    if ("MutationObserver" in win) { mo = new MutationObserver(themeSync); mo.observe(html, { attributes: true, attributeFilter: ["data-theme"] }); }
    if (RM) {
      var onRM = function (e) { if (e.matches) destroy(); };
      if (RM.addEventListener) RM.addEventListener("change", onRM); else if (RM.addListener) RM.addListener(onRM);
    }
    if (isDay()) build();
  }

  win.JWDayFX = {
    active: function () { return running && shown && isDay(); },
    stats: function () {
      return { running: running, shown: shown, day: isDay(), fps: fps, frameMs: +frameMs.toFixed(2),
        causticMs: cN ? +(cMs / cN).toFixed(2) : 0, dabs: dabs.length, motes: motes.length, beams: beams.length,
        hue: curHue, pigment: PIG, size: [canvas.width, canvas.height], light: [lightC.width, lightC.height],
        fine: FINE, phone: PHONE, lite: LITE, built: built, attached: !!canvas.parentNode, heroBlock: heroBlock };
    },
    pause: function () { paused = true; stop(); },
    resume: function () { paused = false; start(); },
    destroy: destroy
  };

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
