/* night-fx.js: night-only ambient light for the LIGHT SOURCE site (package N-gl).
   One fixed 2D canvas inside .field-backdrop, so it sits behind every section and never takes pointer events:
   - fluorescence dust: depth parallax on scroll, streaks with scroll speed, swirls round the pointer and warps
     out of the hero lens during the fly-through;
   - scroll-driven aurora: two light pools and two light filaments in the current and the next chapter hue;
   - a cursor light with an additive spectral trail and shed sparks (fine pointer only);
   - bloom behind the hovered or keyboard-focused key element;
   - a light ripple on every click or tap.
   Off under prefers-reduced-motion and in the day theme; waits for the loader; paused while the tab is hidden;
   DPR capped at 1; 30 fps when idle and on phones. Nothing is built (no canvas, observers or listeners beyond
   the theme watch) until the theme is first night, and the canvas leaves the DOM while the theme is day.
   Lite mode (html.jw-lite, see the head boot script): the same light at half resolution (upscaled by the
   browser), the phone particle counts, 30 fps while scrolling or after a tap and 15 fps at rest.
   Public (QA): window.JWNightFX = {active(), stats(), pause(), resume(), destroy()} */
(function () {
  "use strict";

  var html = document.documentElement, doc = document, win = window;
  if (win.JWNightFX) return;
  function mql(q) { try { return win.matchMedia(q); } catch (e) { return null; } }
  function mq(q) { var m = mql(q); return !!(m && m.matches); }
  var RM = mql("(prefers-reduced-motion: reduce)");
  if (RM && RM.matches) return;

  var canvas = doc.createElement("canvas");
  var ctx = null;
  try { ctx = canvas.getContext("2d", { alpha: true }); } catch (e) { ctx = null; }
  if (!ctx) return;

  var FINE = mq("(pointer: fine)") && mq("(hover: hover)");
  var LITE = html.classList.contains("jw-lite") || win.JW_LITE === true || (win.JW_LITE !== false && (
    mq("(pointer: coarse)") || mq("(max-width: 900px)") || (navigator.hardwareConcurrency || 8) <= 4 ||
    (navigator.deviceMemory || 8) <= 4 || !!(navigator.connection && navigator.connection.saveData)));
  var PHONE = mq("(max-width: 760px)") || LITE;   /* lite gets the phone counts (dust, bokeh, one filament) */
  var RS = LITE ? 0.5 : 1;                         /* canvas resolution scale (CSS stretches it to the viewport) */
  var TAU = Math.PI * 2;
  var BLOOM_SEL = ".btn, .chip, .slide__card, .pane, .index-item, .tally, .gauge, .video, .monitor__screen, .scope__stage, " +
    ".finale__email, .finale__cta, .switcher__btn, .theme-toggle, .card, .doc, [data-tilt], .rs__fig, .fig__stage, .tl, .spec-sheet";

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function now() { return (win.performance && performance.now) ? performance.now() : Date.now(); }

  /* ---------- colour: any CSS colour string -> [r, g, b] via a 1x1 canvas; then pushed to neon ---------- */
  var probeC = doc.createElement("canvas"); probeC.width = probeC.height = 1;
  var probe = null;
  try { probe = probeC.getContext("2d", { willReadFrequently: true }); } catch (e) { probe = null; }
  var rgbCache = {};
  function toRgb(str) {
    str = (str || "").trim();
    if (!str) return null;
    if (rgbCache[str]) return rgbCache[str];
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str), out = null;
    if (m) {
      var h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      out = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    } else if (probe) {
      try {
        probe.fillStyle = "#010203"; probe.fillStyle = str;
        if (String(probe.fillStyle).toLowerCase() !== "#010203") {
          probe.clearRect(0, 0, 1, 1); probe.fillRect(0, 0, 1, 1);
          var d = probe.getImageData(0, 0, 1, 1).data;
          if (d[3] > 0) out = [d[0], d[1], d[2]];
        }
      } catch (e) { out = null; }
    }
    if (out) rgbCache[str] = out;
    return out;
  }
  function toRgbA(str) {
    var m = /rgba?\(([^)]*)\)/i.exec(str || "");
    if (!m) return str && str !== "transparent" ? 1 : 0;
    var parts = m[1].split(/[\s,\/]+/).filter(Boolean);
    return parts.length > 3 ? parseFloat(parts[3]) : 1;
  }
  function neon(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn, h = 0, s = 0;
    if (d > 1e-6) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    s = Math.max(s, 0.92); l = clamp(l, 0.56, 0.66);
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m0 = l - c / 2, o;
    if (h < 60) o = [c, x, 0]; else if (h < 120) o = [x, c, 0]; else if (h < 180) o = [0, c, x];
    else if (h < 240) o = [0, x, c]; else if (h < 300) o = [x, 0, c]; else o = [c, 0, x];
    return [Math.round((o[0] + m0) * 255), Math.round((o[1] + m0) * 255), Math.round((o[2] + m0) * 255)];
  }
  var HUES = ["coil", "nbi", "icg", "disc", "fundus", "mucosa", "ppix"];
  var FALLBACK = { coil: "#8C9BFF", nbi: "#5ED3E5", icg: "#52DDB0", disc: "#F0C462", fundus: "#F6A266", mucosa: "#FF8E80", ppix: "#F483BC" };
  var NEON = {}, PEARL = [236, 226, 255];
  function readPalette() {
    var cs = null;
    try { cs = getComputedStyle(html); } catch (e) { cs = null; }
    HUES.forEach(function (h) {
      var v = cs ? cs.getPropertyValue("--c-" + h) : "";
      NEON[h] = neon(toRgb(v) || toRgb(FALLBACK[h]));
    });
  }
  function hueRgb(h) { return NEON[h] || NEON.nbi; }
  function elRgb(el) {
    try {
      var v = getComputedStyle(el).getPropertyValue("--acc");
      var c = toRgb(v);
      if (c) return neon(c);
    } catch (e) { /* fall through */ }
    return slot[0].slice();
  }
  function rgba(c, a) { return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + clamp(a, 0, 1).toFixed(3) + ")"; }
  function mixRgb(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  /* ---------- palette slots: 0 = this chapter, 1 = the next chapter, 2 = pearl ---------- */
  var slot = [[94, 211, 229], [140, 155, 255], PEARL.slice()];
  var slotT = [slot[0].slice(), slot[1].slice(), PEARL.slice()];
  var sprites = [null, null, null], bokehs = [null, null, null], spriteRgb = [null, null, null];
  function buildSprite(i) {
    var c = slot[i], S = 48;
    var cv = sprites[i] || doc.createElement("canvas");
    cv.width = cv.height = S;
    var g = cv.getContext("2d");
    g.clearRect(0, 0, S, S);
    var core = mixRgb(c, [255, 255, 255], 0.6);
    var gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, rgba(core, 1));
    gr.addColorStop(0.12, rgba(c, 0.85));
    gr.addColorStop(0.35, rgba(c, 0.22));
    gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    /* bokeh: an out-of-focus disc with a brighter rim, as a lens renders a far light */
    var B = 96, bv = bokehs[i] || doc.createElement("canvas");
    bv.width = bv.height = B;
    var h = bv.getContext("2d");
    h.clearRect(0, 0, B, B);
    var bg = h.createRadialGradient(B / 2, B / 2, 0, B / 2, B / 2, B / 2);
    bg.addColorStop(0, rgba(c, 0.55)); bg.addColorStop(0.7, rgba(c, 0.6)); bg.addColorStop(0.86, rgba(mixRgb(c, [255, 255, 255], 0.2), 0.72));
    bg.addColorStop(0.95, rgba(c, 0.25)); bg.addColorStop(1, rgba(c, 0));
    h.fillStyle = bg; h.fillRect(0, 0, B, B);
    sprites[i] = cv; bokehs[i] = bv; spriteRgb[i] = c.slice();
  }
  function syncSprites() {
    for (var i = 0; i < 3; i++) {
      var o = spriteRgb[i], c = slot[i];
      if (!o || Math.abs(o[0] - c[0]) > 2 || Math.abs(o[1] - c[1]) > 2 || Math.abs(o[2] - c[2]) > 2) buildSprite(i);
    }
  }

  /* ---------- the canvas ---------- */
  canvas.className = "night-fx";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:2;display:block;pointer-events:none;" +
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
  function resize() {
    var w = win.innerWidth || html.clientWidth, h = win.innerHeight || html.clientHeight;
    if (!w || !h) return;
    var d = Math.min(win.devicePixelRatio || 1, 1) * RS;
    if (w === W && h === H && d === DPR) return;
    var sx = W ? w / W : 1, sy = H ? h / H : 1;
    W = w; H = h; DPR = d;
    canvas.width = Math.max(2, Math.round(w * d)); canvas.height = Math.max(2, Math.round(h * d));
    for (var i = 0; i < dust.length; i++) { dust[i].x *= sx; dust[i].y *= sy; }
    seed();
    measure();
  }

  /* ---------- chapters (cached offsets; re-measured on layout changes) ---------- */
  var secs = [];
  function collect() {
    secs = Array.prototype.slice.call(doc.querySelectorAll("[data-chapter]")).filter(function (el) {
      return !(el.parentElement && el.parentElement.closest("[data-chapter]"));
    }).map(function (el) {
      return { el: el, hue: el.getAttribute("data-hue") || "nbi", hero: el.classList.contains("hero"), top: 0, bot: 0 };
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

  /* ---------- dust ---------- */
  var dust = [];
  function makeMote(x, y) {
    var z = 0.25 + Math.random() * 0.75, u = Math.random();
    return {
      x: x != null ? x : Math.random() * W, y: y != null ? y : Math.random() * H,
      z: z, size: 0.7 + z * 1.9, base: 0.28 + z * 0.5,
      vx: (Math.random() - 0.5) * 8 * z, vy: -(3 + Math.random() * 9) * z,
      ix: 0, iy: 0, mx: 0, my: 0,
      ph: Math.random() * TAU, tw: 0.6 + Math.random() * 2.2, sf: 0.15 + Math.random() * 0.5,
      slot: u < 0.55 ? 0 : u < 0.85 ? 1 : 2, glow: 0
    };
  }
  var bokeh = [];
  function seed() {
    var n = PHONE ? 46 : clamp(Math.round(W * H / 9500), 60, 160);
    while (dust.length < n) dust.push(makeMote());
    if (dust.length > n) dust.length = n;
    var nb = PHONE ? 3 : 7;
    while (bokeh.length < nb) {
      bokeh.push({ x: Math.random() * W, y: Math.random() * H, r: (PHONE ? 26 : 38) + Math.random() * (PHONE ? 40 : 80), a: 0.05 + Math.random() * 0.06,
        z: 0.08 + Math.random() * 0.14, vx: (Math.random() - 0.5) * 6, vy: -2 - Math.random() * 5, ph: Math.random() * TAU, slot: bokeh.length % 3 === 2 ? 1 : bokeh.length % 3 });
    }
    if (bokeh.length > nb) bokeh.length = nb;
  }
  var sparks = [];   /* short-lived motes shed by a fast cursor */

  /* ---------- input ---------- */
  var ptr = { x: -9999, y: -9999, on: false, a: 0, vx: 0, vy: 0, lt: 0 };
  var trail = [];
  var lastInput = 0;
  var TRAIL_MS = 720;
  var pulses = [];
  var blooms = [];
  var hoverEl = null, focusEl = null;

  function onMove(e) {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    var t = now(), x = e.clientX, y = e.clientY;
    if (ptr.on) {
      var dx = x - ptr.x, dy = y - ptr.y, dtp = Math.max(8, t - ptr.lt);
      ptr.vx = dx / dtp * 1000; ptr.vy = dy / dtp * 1000;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > 16) {   /* fill gaps so a fast flick stays a ribbon, not a dotted line */
        var steps = Math.min(6, Math.floor(d / 16));
        for (var k = 1; k <= steps; k++) trail.push({ x: ptr.x + dx * k / (steps + 1), y: ptr.y + dy * k / (steps + 1), t: t - (steps + 1 - k) * 4 });
      }
      var sp = Math.sqrt(ptr.vx * ptr.vx + ptr.vy * ptr.vy);
      if (sp > 650 && sparks.length < 70 && Math.random() < 0.6) {
        sparks.push({ x: x, y: y, vx: -ptr.vx * 0.08 + (Math.random() - 0.5) * 90, vy: -ptr.vy * 0.08 + (Math.random() - 0.5) * 90, life: 0, max: 0.5 + Math.random() * 0.5, size: 1 + Math.random() * 1.6, slot: Math.random() < 0.5 ? 0 : 1 });
      }
    }
    ptr.x = x; ptr.y = y; ptr.on = true; ptr.lt = t;
    trail.push({ x: x, y: y, t: t });
    if (trail.length > 64) trail.splice(0, trail.length - 64);
    lastInput = t;
    wake();
  }
  function onLeave(e) { if (!e.relatedTarget) { ptr.on = false; } }
  function addPulse(x, y, rgb) {
    pulses.push({ x: x, y: y, t0: now(), rgb: rgb || slot[0].slice() });
    if (pulses.length > 6) pulses.shift();
    for (var i = 0; i < dust.length; i++) {
      var p = dust[i], dx = p.x - x, dy = p.y - y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 320) { var f = (1 - d / 320) * 320 * p.z; p.ix += dx / d * f; p.iy += dy / d * f; p.glow = Math.max(p.glow, 1 - d / 320); }
    }
    lastInput = now();
    wake();
  }
  var touchDown = null;
  function onDown(e) {
    if (e.pointerType === "touch") { touchDown = { x: e.clientX, y: e.clientY, t: now() }; return; }
    if (e.button !== 0) return;
    var b = e.target && e.target.closest ? e.target.closest(BLOOM_SEL) : null;
    addPulse(e.clientX, e.clientY, b ? elRgb(b) : null);
  }
  function onUp(e) {
    if (e.pointerType !== "touch" || !touchDown) return;
    var dx = e.clientX - touchDown.x, dy = e.clientY - touchDown.y;
    if (now() - touchDown.t < 350 && dx * dx + dy * dy < 120) addPulse(e.clientX, e.clientY, null);
    touchDown = null;
  }
  function bloomFor(el, on) {
    if (!el) return;
    for (var i = 0; i < blooms.length; i++) if (blooms[i].el === el) { blooms[i].target = on ? 1 : 0; wake(); return; }
    if (!on) return;
    var cs = null, rad = 0, circle = false, soft = false;
    try { cs = getComputedStyle(el); } catch (e) { cs = null; }
    if (cs) {
      var br = cs.borderTopLeftRadius || "0";
      if (/%$/.test(br)) circle = parseFloat(br) >= 50; else rad = parseFloat(br) || 0;
      /* an element with no surface and no full border (a text row, a hairline list item) gets only the underglow */
      var bg = toRgbA(cs.backgroundColor);
      soft = !(bg > 0.05) && !(parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderLeftWidth) > 0);
    }
    blooms.push({ el: el, a: 0, target: 1, rgb: elRgb(el), rad: rad, circle: circle, soft: soft });
    if (blooms.length > 4) blooms.shift();
    wake();
  }
  function onOver(e) {
    var el = e.target && e.target.closest ? e.target.closest(BLOOM_SEL) : null;
    if (el === hoverEl) return;
    if (hoverEl && hoverEl !== focusEl) bloomFor(hoverEl, false);
    hoverEl = el;
    if (el) bloomFor(el, true);
  }
  function onDocOut(e) {
    if (!e.relatedTarget && hoverEl) { if (hoverEl !== focusEl) bloomFor(hoverEl, false); hoverEl = null; }
  }
  function onFocusIn(e) {
    var el = e.target && e.target.closest ? e.target.closest(BLOOM_SEL) : null;
    var vis = false;
    try { vis = e.target.matches(":focus-visible"); } catch (x) { vis = true; }
    if (focusEl && focusEl !== el && focusEl !== hoverEl) bloomFor(focusEl, false);
    focusEl = el && vis ? el : null;
    if (focusEl) bloomFor(focusEl, true);
  }
  function onFocusOut() {
    if (focusEl && focusEl !== hoverEl) bloomFor(focusEl, false);
    focusEl = null;
  }

  /* ---------- state ---------- */
  var running = false, raf = 0, last = 0, paused = false, dead = false, shown = false, built = false, fadeIn = 0;
  /* the scroll position comes from the passive scroll listener (read there, after ScrollTrigger's own read, so
     style is clean); the frame loop never reads window.scrollY */
  var curSY = 0;
  function readSY() { curSY = win.scrollY || win.pageYOffset || 0; return curSY; }
  var lastSY = 0, vScroll = 0, curIdx = -1, secP = 0, auroraI = 0.4;
  var heroLens = null, heroVis = true, heroIO = null, heroCx = 0, heroCy = 0, heroOn = false, lastAdv = -1, warp = 0, heroBurst = 0;
  var fpsN = 0, fpsT = 0, fps = 0;
  var t0 = now();

  function isNight() { return html.getAttribute("data-theme") !== "day"; }
  function loaderBusy() {
    var L = doc.querySelector(".loader");
    if (!L || L.classList.contains("is-done") || html.classList.contains("jw-seen")) return false;
    try { var cs = getComputedStyle(L); if (cs.display === "none" || cs.visibility === "hidden") return false; } catch (e) { return false; }
    return true;
  }

  function updateChapter(sy) {
    var c = sy + H * 0.5, idx = -1;
    for (var i = 0; i < secs.length; i++) { if (c >= secs[i].top && c < secs[i].bot) { idx = i; break; } }
    if (idx < 0 && secs.length) idx = c < secs[0].top ? 0 : secs.length - 1;
    curIdx = idx;
    if (idx < 0) { slotT[0] = hueRgb("nbi"); slotT[1] = hueRgb("coil"); secP = 0.5; auroraI = 0.45; return; }
    var s = secs[idx], nx = secs[idx + 1] || secs[idx - 1] || s;
    var h = Math.max(1, s.bot - s.top);
    secP = clamp((c - s.top) / h, 0, 1);
    if (s.hero) { slotT[0] = hueRgb("icg"); slotT[1] = hueRgb("ppix"); auroraI = 0.32; }
    else {
      slotT[0] = hueRgb(s.hue);
      slotT[1] = hueRgb(nx.hue !== s.hue ? nx.hue : (HUES[(HUES.indexOf(s.hue) + 3) % HUES.length]));
      /* like the pools, the light dims toward each chapter boundary but never goes fully dark */
      auroraI = 0.38 + 0.62 * sstep(0, 0.2, secP) * (1 - sstep(0.8, 1, secP));
    }
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
  function updateHero(dt) {
    if (!heroLens) watchHero();
    heroOn = false;
    if (!heroLens) { warp *= 0.9; return; }
    /* off screen (most of the page): no layout read at all */
    if (!heroVis) { warp *= Math.exp(-dt * 4); lastAdv = -1; heroBurst = 0; return; }
    var r = heroLens.getBoundingClientRect();
    if (r.bottom < 0 || r.top > H || !r.width) { warp *= Math.exp(-dt * 4); lastAdv = -1; heroBurst = 0; return; }
    heroOn = true;
    heroCx = r.left + r.width / 2; heroCy = r.top + r.height / 2;
    var api = heroLens._jwScope, st = api && api.state ? api.state() : null;
    if (!st) return;
    heroBurst = st.burst || 0;
    var adv = st.adv || 0;
    if (lastAdv >= 0) {
      var rate = Math.abs(adv - lastAdv) / Math.max(dt, 0.001);
      warp += (clamp(rate * 1.7, 0, 1.6) - warp) * Math.min(1, dt * 6);
    }
    lastAdv = adv;
  }

  function step(dt, tt) {
    var sy = curSY;
    var dy = sy - lastSY; lastSY = sy;
    if (Math.abs(dy) > H * 1.2) dy = 0;          /* an anchor jump is not a streak */
    vScroll += (dy / dt - vScroll) * Math.min(1, dt * 8);
    updateChapter(sy);
    updateHero(dt);

    var k = 1 - Math.exp(-dt * 2.4);
    for (var s = 0; s < 2; s++) { slot[s] = mixRgb(slot[s], slotT[s], k); }
    syncSprites();

    ptr.a += ((ptr.on && FINE ? 1 : 0) - ptr.a) * Math.min(1, dt * 5);
    var decay = Math.exp(-dt * 1.7), R = 170, R2 = R * R;
    var wx = heroCx, wy = heroCy, wf = heroOn ? warp : 0;
    for (var i = 0; i < dust.length; i++) {
      var p = dust[i];
      p.ix *= decay; p.iy *= decay; p.glow *= Math.exp(-dt * 2.5);
      var vx = p.vx + p.ix + Math.sin(tt * p.sf + p.ph) * 7 * p.z, vy = p.vy + p.iy;
      if (ptr.on && FINE) {
        var dxp = p.x - ptr.x, dyp = p.y - ptr.y, d2 = dxp * dxp + dyp * dyp;
        if (d2 < R2) {
          var d = Math.sqrt(d2) || 1, f = 1 - d / R;
          vx += (-dyp / d * 120 + dxp / d * 60) * f * p.z;   /* swirl round the light, a little outward */
          vy += (dxp / d * 120 + dyp / d * 60) * f * p.z;
          p.glow = Math.max(p.glow, f);
        }
      }
      if (wf > 0.02) {
        var ux = p.x - wx, uy = p.y - wy, ud = Math.sqrt(ux * ux + uy * uy) || 1;
        var push = wf * (260 + ud * 0.9) * p.z;
        vx += ux / ud * push; vy += uy / ud * push;
      }
      p.mx = vx * dt; p.my = vy * dt - dy * p.z * 0.45;
      p.x += p.mx; p.y += p.my;
      if (wf > 0.05 && (p.x < -24 || p.x > W + 24 || p.y < -24 || p.y > H + 24)) {
        /* during the fly-through, motes that leave the screen re-enter at the lens, so the stream keeps coming */
        var a = Math.random() * TAU, rr = 20 + Math.random() * 120;
        p.x = wx + Math.cos(a) * rr; p.y = wy + Math.sin(a) * rr; p.ix = p.iy = 0; p.mx = p.my = 0;
        continue;
      }
      if (p.y < -24) { p.y += H + 48; p.x = Math.random() * W; }
      else if (p.y > H + 24) { p.y -= H + 48; p.x = Math.random() * W; }
      if (p.x < -24) p.x += W + 48; else if (p.x > W + 24) p.x -= W + 48;
    }
    for (var o = 0; o < bokeh.length; o++) {
      var k2 = bokeh[o];
      k2.x += (k2.vx + Math.sin(tt * 0.11 + k2.ph) * 4) * dt; k2.y += k2.vy * dt - dy * k2.z;
      if (k2.y < -k2.r) { k2.y += H + 2 * k2.r; k2.x = Math.random() * W; } else if (k2.y > H + k2.r) { k2.y -= H + 2 * k2.r; k2.x = Math.random() * W; }
      if (k2.x < -k2.r) k2.x += W + 2 * k2.r; else if (k2.x > W + k2.r) k2.x -= W + 2 * k2.r;
    }
    for (var j = sparks.length - 1; j >= 0; j--) {
      var q = sparks[j];
      q.life += dt;
      if (q.life >= q.max) { sparks.splice(j, 1); continue; }
      q.vx *= Math.exp(-dt * 2.2); q.vy = q.vy * Math.exp(-dt * 2.2) + 30 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt - dy * 0.3;
    }
    var tn = now();
    while (trail.length && tn - trail[0].t > TRAIL_MS) trail.shift();
    for (var b = blooms.length - 1; b >= 0; b--) {
      var B = blooms[b];
      B.a += (B.target - B.a) * Math.min(1, dt * (B.target ? 7 : 4.5));
      if (!B.target && B.a < 0.01) blooms.splice(b, 1);
    }
    for (var u = pulses.length - 1; u >= 0; u--) if (tn - pulses[u].t0 > 1000) pulses.splice(u, 1);
  }

  /* ---------- drawing ---------- */
  function blob(x, y, rad, c, a, sy) {
    if (a < 0.004 || rad < 1) return;
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, rgba(c, a)); g.addColorStop(0.35, rgba(c, a * 0.55));
    g.addColorStop(0.7, rgba(c, a * 0.16)); g.addColorStop(1, rgba(c, 0));
    ctx.save();
    ctx.translate(x, y); if (sy && sy !== 1) ctx.scale(1, sy);
    ctx.fillStyle = g; ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
    ctx.restore();
  }
  function glowStroke(path, passes, a) {
    for (var i = 0; i < passes.length; i++) {
      ctx.lineWidth = passes[i][0]; ctx.globalAlpha = clamp(passes[i][1] * a, 0, 1);
      ctx.stroke(path);
    }
    ctx.globalAlpha = 1;
  }
  var RIBBON = [[46, 0.02], [24, 0.036], [10, 0.065], [3.5, 0.12], [1.2, 0.34]];
  function ribbon(yb, amp, ph, c0, c1, a, tilt) {
    if (a < 0.01) return;
    var n = 7, pts = [];
    for (var i = 0; i <= n; i++) {
      var x = -0.1 * W + i * (1.2 * W / n);
      pts.push([x, yb + tilt * (i / n - 0.5) * H + amp * Math.sin(ph + i * 0.9) + amp * 0.4 * Math.sin(ph * 1.7 + i * 1.9)]);
    }
    var path = new Path2D();
    path.moveTo(pts[0][0], pts[0][1]);
    for (var j = 1; j < n; j++) {
      var mx = (pts[j][0] + pts[j + 1][0]) / 2, my = (pts[j][1] + pts[j + 1][1]) / 2;
      path.quadraticCurveTo(pts[j][0], pts[j][1], mx, my);
    }
    path.lineTo(pts[n][0], pts[n][1]);
    var g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, rgba(c0, 0)); g.addColorStop(0.18, rgba(c0, 1));
    g.addColorStop(0.55, rgba(mixRgb(c0, c1, 0.5), 1)); g.addColorStop(0.86, rgba(c1, 1)); g.addColorStop(1, rgba(c1, 0));
    ctx.strokeStyle = g; ctx.lineCap = "round"; ctx.lineJoin = "round";
    glowStroke(path, RIBBON, a);
  }
  function roundRect(path, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    path.moveTo(x + r, y); path.lineTo(x + w - r, y); path.arcTo(x + w, y, x + w, y + r, r);
    path.lineTo(x + w, y + h - r); path.arcTo(x + w, y + h, x + w - r, y + h, r);
    path.lineTo(x + r, y + h); path.arcTo(x, y + h, x, y + h - r, r);
    path.lineTo(x, y + r); path.arcTo(x, y, x + r, y, r); path.closePath();
  }
  var BLOOM = [[38, 0.05], [20, 0.09], [9, 0.15], [3, 0.32], [1.2, 0.5]];
  var PULSE = [[18, 0.07], [7, 0.16], [2, 0.5]];
  var TRAIL = [[24, 0.075], [10, 0.16], [3, 0.42], [1.2, 0.9]];

  function render(tt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    /* mid-burst the lens covers the viewport: nothing to light behind it (it fades out from .96 of the pin) */
    if (heroOn && heroBurst > 0.6 && heroBurst < 0.86) return;
    ctx.globalCompositeOperation = "lighter";
    var c0 = slot[0], c1 = slot[1], M = Math.max(W, H);
    var vs = clamp(Math.abs(vScroll) / 2400, 0, 1);

    /* aurora pools: this chapter's light drifts up as you read it, the next one rises from below */
    var ai = auroraI * (1 + vs * 0.35);
    /* peaks stay low (<= .08) so text over a CSS pool peak keeps AA; the vividness lives in the thin lights */
    blob(W * (0.84 + 0.04 * Math.sin(tt * 0.07)), H * (0.3 - 0.4 * (secP - 0.5)), M * 0.55, c0, 0.075 * ai, 0.75);
    blob(W * (0.1 + 0.05 * Math.sin(tt * 0.05 + 2)), H * (1.08 - 0.45 * secP), M * 0.5, c1, (0.025 + 0.055 * sstep(0.25, 1, secP)) * ai, 0.7);
    if (!PHONE) blob(W * (0.5 + 0.3 * Math.sin(tt * 0.031)), H * (0.5 + 0.35 * Math.cos(tt * 0.023)), M * 0.38, PEARL, 0.022 * ai, 0.6);

    /* aurora filaments: phase follows time and scroll, so reading makes the light flow */
    var ph = tt * 0.16 + lastSY * 0.0016;
    ribbon(H * (0.16 + 0.05 * Math.sin(tt * 0.09)), H * 0.06, ph, c0, c1, (0.55 + 0.45 * vs) * ai, -0.08);
    if (!PHONE) ribbon(H * (0.86 + 0.04 * Math.sin(tt * 0.07 + 1)), H * 0.05, -ph * 0.8 + 2, c1, c0, (0.4 + 0.5 * vs) * ai, 0.06);

    /* bokeh: far lights out of focus, drifting slower than the dust */
    for (var bo = 0; bo < bokeh.length; bo++) {
      var K = bokeh[bo], kr = K.r * 2;
      ctx.globalAlpha = clamp(K.a * (0.7 + 0.3 * Math.sin(tt * 0.4 + K.ph)) * (0.6 + 0.6 * ai), 0, 1);
      ctx.drawImage(bokehs[K.slot], K.x - kr / 2, K.y - kr / 2, kr, kr);
    }
    ctx.globalAlpha = 1;

    /* bloom behind hovered / focused key elements */
    for (var b = 0; b < blooms.length; b++) {
      var B = blooms[b];
      if (B.a < 0.01 || !B.el.isConnected) continue;
      var r = B.el.getBoundingClientRect();
      if (r.bottom < -60 || r.top > H + 60 || !r.width) continue;
      if (!B.soft) {
        var path = new Path2D();
        if (B.circle) path.arc(r.left + r.width / 2, r.top + r.height / 2, Math.min(r.width, r.height) / 2, 0, TAU);
        else roundRect(path, r.left, r.top, r.width, r.height, B.rad);
        ctx.strokeStyle = rgba(B.rgb, 1); ctx.lineJoin = "round";
        glowStroke(path, BLOOM, B.a * 0.95);
      }
      blob(r.left + r.width / 2, r.bottom - r.height * 0.1, Math.max(r.width, r.height) * 0.7, B.rgb, (B.soft ? 0.09 : 0.13) * B.a, Math.min(1, (r.height + 80) / (r.width + 80)));
    }

    /* cursor light and its spectral trail */
    if (ptr.a > 0.01) {
      blob(ptr.x, ptr.y, 260, c0, 0.12 * ptr.a);
      blob(ptr.x, ptr.y, 54, mixRgb(c0, [255, 255, 255], 0.5), 0.16 * ptr.a);
      var n = trail.length, tn = now();
      if (n > 1) {
        for (var ps = 0; ps < TRAIL.length; ps++) {
          /* butt caps on the glow passes: round caps would overlap at every joint and bead the halo */
          ctx.lineCap = ps === TRAIL.length - 1 ? "round" : "butt";
          for (var i = 1; i < n; i++) {
            var a0 = trail[i - 1], a1 = trail[i];
            var life = 1 - (tn - a1.t) / TRAIL_MS;
            if (life <= 0) continue;
            var u = i / (n - 1);
            ctx.strokeStyle = rgba(mixRgb(c1, c0, u), 1);
            ctx.lineWidth = TRAIL[ps][0] * (0.25 + 0.75 * life);
            ctx.globalAlpha = clamp(TRAIL[ps][1] * life * life * ptr.a * 1.4, 0, 1);
            ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }
    }

    /* ripples */
    var tq = now();
    for (var q = 0; q < pulses.length; q++) {
      var P = pulses[q], kq = clamp((tq - P.t0) / 1000, 0, 1), e = 1 - Math.pow(1 - kq, 3);
      var pp = new Path2D(); pp.arc(P.x, P.y, 14 + 300 * e, 0, TAU);
      ctx.strokeStyle = rgba(P.rgb, 1);
      glowStroke(pp, PULSE, Math.pow(1 - kq, 2));
      blob(P.x, P.y, 150, P.rgb, 0.22 * Math.pow(1 - kq, 3));
    }

    /* dust: streaks first (one path per palette slot), then the glowing motes */
    ctx.lineCap = "round";
    for (var sl = 0; sl < 3; sl++) {
      var sp = new Path2D(), any = false;
      for (var i2 = 0; i2 < dust.length; i2++) {
        var m = dust[i2];
        if (m.slot !== sl) continue;
        var L2 = m.mx * m.mx + m.my * m.my;
        if (L2 < 2.2) continue;
        sp.moveTo(m.x - m.mx * 2.6, m.y - m.my * 2.6); sp.lineTo(m.x, m.y); any = true;
      }
      if (any) { ctx.strokeStyle = rgba(slot[sl], 1); ctx.lineWidth = 1.4; ctx.globalAlpha = 0.5; ctx.stroke(sp); }
    }
    for (var i3 = 0; i3 < dust.length; i3++) {
      var d = dust[i3];
      var tw = 0.55 + 0.45 * Math.sin(tt * d.tw + d.ph);
      var al = d.base * tw * (1 + d.glow * 1.6);
      var s = d.size * 7 * (1 + d.glow * 0.7);
      ctx.globalAlpha = clamp(al, 0, 1);
      ctx.drawImage(sprites[d.slot], d.x - s / 2, d.y - s / 2, s, s);
    }
    for (var i4 = 0; i4 < sparks.length; i4++) {
      var k = sparks[i4], lf = 1 - k.life / k.max, ss = k.size * 8;
      ctx.globalAlpha = clamp(lf * 0.95, 0, 1);
      ctx.drawImage(sprites[k.slot], k.x - ss / 2, k.y - ss / 2, ss, ss);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---------- loop ---------- */
  function idle(t) {
    return t - lastInput > 1800 && Math.abs(vScroll) < 10 && !pulses.length && warp < 0.02 &&
      !blooms.some(function (b) { return Math.abs(b.target - b.a) > 0.02; });
  }
  /* minimum ms between drawn frames: desktop 60 fps while something moves, else 30; phones 30; lite 30 / 15 */
  function gap(t) {
    var rest = idle(t);
    if (LITE) return rest ? 60 : 30;
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
    var dt = clamp(dms / 1000, 0.001, 0.05);
    var tt = (t - t0) / 1000;
    step(dt, tt);
    render(tt);
    fpsN++;
    if (!fpsT) fpsT = t;
    else if (t - fpsT > 1000) { fps = Math.round(fpsN * 1000 / (t - fpsT)); fpsN = 0; fpsT = t; }
  }
  function wake() { if (running && !raf) raf = requestAnimationFrame(frame); }
  function start() {
    if (dead || paused || running || doc.hidden || !isNight()) return;
    running = true; last = 0; lastSY = readSY(); vScroll = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  var offTimer = 0;
  function attach() {
    if (canvas.parentNode) return false;
    host().appendChild(canvas);
    if (ro) ro.observe(doc.body);
    collect(); measure();
    return true;
  }
  function detach() {
    if (ro) ro.disconnect();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);   /* no layer, no paint while the theme is day */
  }
  function themeSync() {
    if (dead) return;
    if (isNight()) {
      if (offTimer) { clearTimeout(offTimer); offTimer = 0; }
      if (!built) { build(); return; }
      readPalette(); rgbCache = {};
      for (var i = 0; i < blooms.length; i++) blooms[i].rgb = elRgb(blooms[i].el);
      if (attach()) { canvas.style.opacity = "0"; if (shown) fadeIn = 2; }
      else if (shown) canvas.style.opacity = "1";
      start();
    } else if (built) {
      canvas.style.opacity = "0";
      if (!offTimer) offTimer = setTimeout(function () {
        offTimer = 0;
        if (!isNight()) { stop(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); detach(); }
      }, 900);
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

  /* the light itself: built the first time the theme is night */
  function build() {
    if (built || dead) return;
    built = true;
    readPalette();
    slot[0] = hueRgb("icg").slice(); slot[1] = hueRgb("ppix").slice();
    syncSprites();
    host().appendChild(canvas);
    collect();
    resize();
    measure();
    updateChapter(readSY());
    slot[0] = slotT[0].slice(); slot[1] = slotT[1].slice(); syncSprites();
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
      on(doc, "pointerover", onOver, { passive: true });
      on(doc, "mouseout", onDocOut, { passive: true });
      on(doc, "mouseout", onLeave, { passive: true });
      on(win, "blur", function () { ptr.on = false; });
    }
    on(doc, "focusin", onFocusIn);
    on(doc, "focusout", onFocusOut);
    on(win, "pointerdown", onDown, { passive: true });
    on(win, "pointerup", onUp, { passive: true });
    on(win, "scroll", function () { readSY(); lastInput = now(); wake(); }, { passive: true });
    on(doc, "visibilitychange", function () { if (doc.hidden) stop(); else start(); });
    start();
  }

  /* always: watch the theme (and reduced motion); everything else waits for night */
  function init() {
    if (dead) return;
    on(doc, "themechange", themeSync);
    on(doc, "themechangeend", themeSync);
    if ("MutationObserver" in win) { mo = new MutationObserver(themeSync); mo.observe(html, { attributes: true, attributeFilter: ["data-theme"] }); }
    if (RM) {
      var onRM = function (e) { if (e.matches) destroy(); };
      if (RM.addEventListener) RM.addEventListener("change", onRM); else if (RM.addListener) RM.addListener(onRM);
    }
    if (isNight()) build();
  }

  win.JWNightFX = {
    active: function () { return running && shown && isNight(); },
    stats: function () {
      return { running: running, shown: shown, night: isNight(), fps: fps, dust: dust.length, sparks: sparks.length, blooms: blooms.length,
        pulses: pulses.length, trail: trail.length, chapter: curIdx >= 0 && secs[curIdx] ? secs[curIdx].hue : null, warp: +warp.toFixed(3),
        size: [canvas.width, canvas.height], fine: FINE, phone: PHONE, lite: LITE, built: built, attached: !!canvas.parentNode };
    },
    pause: function () { paused = true; stop(); },
    resume: function () { paused = false; start(); },
    destroy: destroy
  };

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
