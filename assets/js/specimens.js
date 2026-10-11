/* specimens.js: procedural research figures (spec §9). LIGHT SOURCE, package B.
   Public: window.JWSpec.build(host, name, {mini}) -> {setStep?, destroy}
   Every [data-specimen] outside .peek is built on DOMContentLoaded (after core.js has defined JW).
   Colour comes only from the token classes .sp-acc .sp-acc-fill .sp-ink .sp-soft .sp-fill .sp-deep
   .sp-label .sp-label--acc .sp-glow, so a specimen relights with its figure's data-hue and the theme. */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  function mq(q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } }
  var REDUCED = mq("(prefers-reduced-motion: reduce)");
  var FINE = mq("(pointer: fine)");
  var ZH = /^zh/i.test(document.documentElement.getAttribute("lang") || "");
  var TXT = ZH ? {
    space: "共享动作空间", three: "3种具身形态", cams: "3台相机", n: "n = ", target: "目标", phantom: "ERCP体模",
    path: "规划路径", count: function (n) { return n + " / 150个片段"; }, seg: function (i) { return "片段" + i + " / 150"; },
    crop: "224 × 224", coil: function (i) { return "线圈" + i; }, landmarks: "MediaPipe关键点", sound: "声音"
  } : {
    space: "Shared action space", three: "3 embodiments", cams: "3 cameras", n: "n = ", target: "Target", phantom: "ERCP phantom",
    path: "Planned path", count: function (n) { return n + " / 150 segments"; }, seg: function (i) { return "Segment " + i + " / 150"; },
    crop: "224 × 224", coil: function (i) { return "Coil " + i; }, landmarks: "MediaPipe landmarks", sound: "Sound"
  };
  var STEPS = [25, 50, 100, 200];

  /* ---------- helpers ---------- */
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function f1(v) { return (Math.round(v * 10) / 10).toString(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function damp(rate, dt) { return 1 - Math.exp(-rate * dt); }
  function G() { return window.gsap || null; }
  function ease(k) { var J = window.JW; return J && J.ease ? J.ease[k] : ({ s: "expo.out", l: "expo.inOut", v: "back.out(1.6)" })[k]; }
  function toLocal(svg, cx, cy) {
    var m = svg.getScreenCTM();
    if (!m) return { x: 200, y: 200 };
    var p = svg.createSVGPoint(); p.x = cx; p.y = cy;
    p = p.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function label(ctx, x, y, text, anchor, acc) {
    if (!ctx.labels) return null;
    var t = el("text", { x: x, y: y, "text-anchor": anchor || "start", class: "sp-label" + (acc ? " sp-label--acc" : "") }, ctx.svg);
    t.textContent = text;
    return t;
  }
  function setText(t, s) { if (t && t.textContent !== s) t.textContent = s; }
  function loop(ctx, fn, opts) {
    opts = opts || {};
    if (ctx.mini) opts.margin = "0px";
    var J = window.JW;
    var h;
    if (J && J.loop) h = J.loop(ctx.host, fn, opts);
    else if (REDUCED) { fn(1.2, 0); h = { stop: function () {}, kick: function (n) { for (var i = 0; i < (n || 8); i++) fn(1.2, 0.25); } }; }
    else {
      var on = true, dead = false, t = 0, last = performance.now();
      var raf = function (now) { if (dead) return; var dt = Math.min(0.05, (now - last) / 1000); last = now; if (on && !document.hidden) { t += dt; fn(t, dt); } requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
      h = { stop: function () { dead = true; } };
    }
    ctx.cleanups.push(function () { h.stop(); });
    ctx.kick = function (n) { if (REDUCED && h.kick) h.kick(n); };
    return h;
  }
  function kick(ctx, n) { if (ctx.kick) ctx.kick(n); }
  function scrollDriver(ctx, onP, opts) {
    var g = G(), ST = window.ScrollTrigger;
    if (!g || !ST || REDUCED || ctx.mini || ctx.inGallery) return null;
    opts = opts || {};
    var trig = ctx.host.closest(".rs, .slide, .chapter, section") || ctx.fig || ctx.host;
    var st = ST.create({ trigger: trig, start: opts.start || "top 75%", end: opts.end || "bottom 55%", onUpdate: function (s) { onP(s.progress); }, onRefresh: function (s) { onP(s.progress); } });
    ctx.cleanups.push(function () { st.kill(); });
    return st;
  }
  function onceVisible(ctx, fn, threshold) {
    if (!("IntersectionObserver" in window)) { fn(); return; }
    var io = new IntersectionObserver(function (es) {
      var e = es[es.length - 1];
      if (e.isIntersecting && e.intersectionRatio >= (threshold || 0.5)) { io.disconnect(); fn(); }
    }, { threshold: [0, threshold || 0.5, 1] });
    io.observe(ctx.host);
    ctx.cleanups.push(function () { io.disconnect(); });
  }
  function pointerTrack(ctx, handlers) {
    if (!ctx.interactive) return;
    var svg = ctx.svg, host = ctx.host;
    host.addEventListener("pointermove", function (e) {
      var p = toLocal(svg, e.clientX, e.clientY);
      if (handlers.move) { handlers.move(p, e); kick(ctx); }
    });
    host.addEventListener("pointerleave", function (e) { if (handlers.leave) { handlers.leave(e); kick(ctx); } });
    host.addEventListener("pointerdown", function (e) {
      var p = toLocal(svg, e.clientX, e.clientY);
      if (handlers.down) { handlers.down(p, e); kick(ctx); }
    });
    host.addEventListener("pointerup", function (e) { if (handlers.up) { handlers.up(toLocal(svg, e.clientX, e.clientY), e); kick(ctx); } });
    host.addEventListener("pointercancel", function (e) { if (handlers.leave) { handlers.leave(e); kick(ctx); } });
  }
  function setBusy(ctx, on) {
    if (!ctx.fig) return;
    ctx.fig._jwBusy = !!on;
    if (on && window.JW && window.JW.explain) window.JW.explain.close(ctx.fig);
  }
  /* path point by arc length on a polyline sample (cheap and independent of pathLength) */
  function sampler(pathEl) {
    var len = pathEl.getTotalLength();
    return { len: len, at: function (f) { var p = pathEl.getPointAtLength(((f % 1) + 1) % 1 * len); return { x: p.x, y: p.y }; } };
  }
  function drawFrac(p, a, b) {
    var v = Math.max(0, b - a);
    if (v <= 0.0005) { p.style.opacity = "0"; return; }
    p.style.opacity = "";
    p.style.strokeDasharray = v.toFixed(4) + " 2";
    p.style.strokeDashoffset = (-a).toFixed(4);
  }

  /* ---------- night relight: neon bloom on the accent strokes + night-only light details ----------
     Night is fluorescence imaging, so accent groups (.sp-glow) get a two-radius SVG bloom (tight core glow
     plus a wide halo) and a few extra light details (comet trails, vessel pulses, sparks, a scan line).
     Day keeps the quiet engraved plate: the inline filter is removed and the details are hidden. */
  var NEON_ID = "jw-neon", neonGroups = [], nightEls = [];
  function isNight() { return document.documentElement.getAttribute("data-theme") !== "day"; }
  function ensureNeonDefs() {
    if (document.getElementById(NEON_ID)) return;
    var holder = el("svg", { width: 0, height: 0, "aria-hidden": "true", focusable: "false" });
    holder.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    var defs = el("defs", {}, holder);
    var f = el("filter", { id: NEON_ID, filterUnits: "userSpaceOnUse", x: -80, y: -80, width: 560, height: 560, "color-interpolation-filters": "sRGB" }, defs);
    el("feGaussianBlur", { "in": "SourceGraphic", stdDeviation: 2.4, result: "b1" }, f);
    el("feGaussianBlur", { "in": "SourceGraphic", stdDeviation: 8, result: "b2" }, f);
    var m = el("feMerge", {}, f);
    ["b2", "b2", "b1", "SourceGraphic"].forEach(function (n) { el("feMergeNode", { "in": n }, m); });
    (document.body || document.documentElement).appendChild(holder);
  }
  function applyNeon(g, night) { g.style.filter = night ? "url(#" + NEON_ID + ")" : ""; }
  function neon(g) {
    if (!g || g._jwNeon) return;
    g._jwNeon = true;
    ensureNeonDefs();
    neonGroups.push(g);
    applyNeon(g, isNight());
  }
  function nightOnly(e) { nightEls.push(e); e.style.display = isNight() ? "" : "none"; return e; }
  var themeHooks = [];
  function onTheme(host, fn) { themeHooks.push({ host: host, fn: fn }); try { fn(isNight()); } catch (e) { /* decorative */ } }
  function relight() {
    var n = isNight();
    neonGroups = neonGroups.filter(function (g) { return g.isConnected; });
    nightEls = nightEls.filter(function (e) { return e.isConnected; });
    neonGroups.forEach(function (g) { applyNeon(g, n); });
    nightEls.forEach(function (e) { e.style.display = n ? "" : "none"; });
    themeHooks = themeHooks.filter(function (h) { return h.host.isConnected; });
    themeHooks.forEach(function (h) { try { h.fn(n); } catch (e) { /* decorative */ } });
  }
  document.addEventListener("themechange", relight);
  function neonAll(svg) { Array.prototype.forEach.call(svg.querySelectorAll(".sp-glow"), neon); if (svg.classList && svg.classList.contains("sp-glow")) neon(svg); }

  /* ================================================================ builders */
  var B = {};

  /* --- embodiment: three kinematic chains reach one shared target --------- */
  B.embodiment = function (ctx) {
    var s = ctx.svg;
    el("path", { class: "sp-soft", d: "M24 370H376", "stroke-dasharray": "2 6" }, s);
    el("path", { class: "sp-soft", d: "M140 30H260", "stroke-dasharray": "2 6" }, s);
    var traj = el("path", { class: "sp-soft", d: "M92 156C150 92 252 92 306 150C338 184 300 232 242 222C182 212 142 258 170 300", "stroke-dasharray": "3 7" }, s);
    var T = sampler(traj);
    var robots = [
      { base: [70, 362], L: [118, 104, 72], a0: -Math.PI / 2, w: 1.75, plate: [46, 8] },
      { base: [330, 362], L: [150, 116], a0: -Math.PI / 2, w: 1.75, plate: [40, 8] },
      { base: [200, 38], L: [82, 78, 62, 46], a0: Math.PI / 2, w: 1.5, plate: [52, 8] }
    ];
    var ink = el("g", {}, s), acc = el("g", { class: "sp-glow" }, s);
    robots.forEach(function (r, k) {
      var py = k === 2 ? r.base[1] - r.plate[1] : r.base[1];
      el("rect", { class: "sp-fill", x: r.base[0] - r.plate[0] / 2, y: py, width: r.plate[0], height: r.plate[1], rx: 1.5 }, ink);
      r.line = el("polyline", { class: "sp-ink", "stroke-width": r.w, fill: "none" }, ink);
      r.joints = r.L.map(function () { return el("circle", { class: "sp-fill", r: 3.4 }, ink); });
      r.tip = el("circle", { class: "sp-acc", r: 6.5, "stroke-width": 1.5, fill: "none" }, acc);
      r.A = r.L.map(function (_, i) { return i === 0 ? r.a0 : (k === 2 ? 0.25 : -0.3); });
      r.goal = { x: 200, y: 200 };
      r.rate = [5.5, 4.2, 3.4][k];
    });
    var comet = nightOnly(el("polyline", { class: "sp-acc", "stroke-width": 2, fill: "none", opacity: 0.55, "stroke-linecap": "round", "stroke-linejoin": "round" }, acc));
    var hist = [];
    var tg = el("g", {}, acc);
    var ring = el("circle", { class: "sp-acc", r: 11, "stroke-width": 1.25, fill: "none", opacity: 0.6 }, tg);
    el("circle", { class: "sp-acc-fill", r: 3 }, tg);
    el("path", { class: "sp-acc", d: "M-18 0h-6M18 0h6M0 -18v-6M0 18v6", "stroke-width": 1.25 }, tg);
    label(ctx, 20, 26, TXT.space);
    label(ctx, 380, 26, TXT.three, "end");

    function fk(r) {
      var x = r.base[0], y = r.base[1] + (r.a0 > 0 ? 0 : 0), a = 0, out = [[x, y]];
      for (var i = 0; i < r.L.length; i++) { a += r.A[i]; x += Math.cos(a) * r.L[i]; y += Math.sin(a) * r.L[i]; out.push([x, y]); }
      return out;
    }
    function ik(r, g, iters, gain) {
      for (var it = 0; it < iters; it++) {
        for (var j = r.L.length - 1; j >= 0; j--) {
          var P = fk(r), J = P[j], Ee = P[r.L.length];
          var a1 = Math.atan2(Ee[1] - J[1], Ee[0] - J[0]), a2 = Math.atan2(g.y - J[1], g.x - J[0]);
          r.A[j] += wrapAngle(a2 - a1) * gain;
        }
      }
    }
    var ptr = null, manual = null, manualT = 0, goal = { x: 200, y: 200 };
    pointerTrack(ctx, {
      move: function (p, e) { if (e.pointerType === "mouse" || e.pointerType === "pen") ptr = p; },
      leave: function () { ptr = null; },
      up: function (p, e) { if (e.pointerType === "touch") { manual = p; manualT = 2.6; } }
    });
    var first = true;
    loop(ctx, function (t, dt) {
      var path = T.at(t * 0.055);
      var want = ptr || (manual && manualT > 0 ? manual : path);
      if (manualT > 0) manualT -= dt;
      if (first) { goal.x = want.x; goal.y = want.y; }
      var k = first ? 1 : damp(9, dt);
      goal.x += (want.x - goal.x) * k; goal.y += (want.y - goal.y) * k;
      tg.setAttribute("transform", "translate(" + f1(goal.x) + " " + f1(goal.y) + ")");
      ring.setAttribute("r", f1(11 + Math.sin(t * 3.2) * 1.6));
      hist.push(f1(goal.x) + "," + f1(goal.y)); if (hist.length > 26) hist.shift();
      if (comet.style.display !== "none") comet.setAttribute("points", hist.join(" "));
      robots.forEach(function (r) {
        var kk = first ? 1 : damp(r.rate, dt);
        r.goal.x += (goal.x - r.goal.x) * kk; r.goal.y += (goal.y - r.goal.y) * kk;
        ik(r, r.goal, first ? 40 : 3, first ? 0.6 : 0.42);
        var P = fk(r);
        r.line.setAttribute("points", P.map(function (q) { return f1(q[0]) + "," + f1(q[1]); }).join(" "));
        r.joints.forEach(function (c, i) { c.setAttribute("cx", f1(P[i][0])); c.setAttribute("cy", f1(P[i][1])); });
        var e = P[r.L.length];
        r.tip.setAttribute("cx", f1(e[0])); r.tip.setAttribute("cy", f1(e[1]));
      });
      first = false;
    });
    return {};
  };

  /* --- fundus: disc, vessel tree, 200 phyllotaxis dots, 3 camera rings ---- */
  B.fundus = function (ctx) {
    var s = ctx.svg, g = G();
    var rings = el("g", {}, s);
    [[188, "2 6"], [180, "14 6"], [172, "1 4"]].forEach(function (r) { el("circle", { class: "sp-soft", cx: 200, cy: 200, r: r[0], "stroke-dasharray": r[1], fill: "none" }, rings); });
    el("circle", { class: "sp-deep", cx: 200, cy: 200, r: 150 }, s);
    el("circle", { class: "sp-ink", cx: 200, cy: 200, r: 150, fill: "none", "stroke-width": 1.25, opacity: 0.55 }, s);
    el("circle", { class: "sp-fill", cx: 148, cy: 206, r: 15, opacity: 0.14 }, s);
    var vg = el("g", { class: "sp-ink", fill: "none" }, s);
    var V = [
      "M262 172C240 130 200 102 150 94", "M262 172C270 132 260 102 240 72", "M262 212C240 258 200 288 150 298",
      "M262 212C275 254 265 288 245 322", "M242 182C200 172 152 162 92 176", "M242 204C200 214 152 228 96 230",
      "M200 104C190 120 170 130 140 128", "M205 290C190 276 170 270 140 272", "M150 166C130 152 110 150 86 140", "M150 232C130 250 110 255 90 262"
    ];
    var vessels = V.map(function (d, i) { return el("path", { d: d, pathLength: 1, "stroke-width": i < 4 ? 1.75 : 1.25, opacity: i < 4 ? 1 : 0.7 }, vg); });
    /* night: light pulses run down the main vessels from the disc */
    var flowG = nightOnly(el("g", { class: "sp-glow", fill: "none" }, s));
    var flows = V.slice(0, 6).map(function (d, i) { return el("path", { class: "sp-acc", d: d, pathLength: 1, "stroke-width": i < 4 ? 2.2 : 1.6, "stroke-dasharray": "0.06 0.94", "stroke-linecap": "round", opacity: 0 }, flowG); });
    var vesselP = 0;
    var base = el("g", {}, s), act = el("g", { class: "sp-glow" }, s);
    var dots = [], on = [];
    for (var i = 0; i < 200; i++) {
      var a = i * 2.39996, r = 18 + Math.sqrt(i / 200) * 124;
      var cx = f1(200 + Math.cos(a) * r), cy = f1(200 + Math.sin(a) * r);
      el("circle", { class: "sp-fill", cx: cx, cy: cy, r: 1.5, opacity: 0.16 }, base);
      dots.push(el("circle", { class: "sp-acc-fill", cx: cx, cy: cy, r: 0 }, act));
      on.push(false);
    }
    var disc = el("g", { class: "sp-glow" }, s);
    el("circle", { class: "sp-acc-fill", cx: 262, cy: 192, r: 24, opacity: 0.16 }, disc);
    el("circle", { class: "sp-acc", cx: 262, cy: 192, r: 24, fill: "none", "stroke-width": 1.5 }, disc);
    var cup = el("circle", { class: "sp-acc-fill", cx: 262, cy: 192, r: 10, opacity: 0.55 }, disc);
    var nLab = label(ctx, 20, 392, TXT.n + "0", "start", true);
    label(ctx, 380, 392, TXT.cams, "end");

    var cur = 0, onStep = null, seq = null;
    function drawVessels(p) { vesselP = p; vessels.forEach(function (v, i) { var k = clamp(p * 1.25 - i * 0.025, 0, 1); drawFrac(v, 0, k); }); }
    function setStep(n, instant) {
      n = clamp(Math.round(+n || 0), 0, 200);
      var from = cur; cur = n;
      setText(nLab, TXT.n + n);
      if (onStep) onStep(n);
      var add = [], rem = [];
      for (var i = 0; i < 200; i++) { var want = i < n; if (want !== on[i]) { on[i] = want; (want ? add : rem).push(dots[i]); } }
      if (instant || REDUCED || !g) { add.forEach(function (d) { d.setAttribute("r", "2.3"); }); rem.forEach(function (d) { d.setAttribute("r", "0"); }); return; }
      if (add.length) { g.killTweensOf(add); g.to(add, { attr: { r: 2.3 }, duration: 0.32, ease: "back.out(2.2)", stagger: { amount: 0.5 } }); }
      if (rem.length) { g.killTweensOf(rem); g.to(rem, { attr: { r: 0 }, duration: 0.18, ease: "power2.in", stagger: { amount: 0.2, from: "end" } }); }
      return from;
    }
    var api = {
      setStep: function (n) { if (seq) { seq.kill(); seq = null; } setStep(n); },
      onStep: function (fn) { onStep = fn; },
      step: function () { return cur; }
    };
    var initial = ctx.initialStep || 200;
    if (ctx.mini || REDUCED || !g) {
      drawVessels(1); setStep(initial, true);
    } else if (ctx.inGallery || !window.ScrollTrigger) {
      drawVessels(0); setStep(0, true);
      onceVisible(ctx, function () {
        g.to({ p: 0 }, { p: 1, duration: 1.4, ease: ease("s"), onUpdate: function () { drawVessels(this.targets()[0].p); } });
        seq = g.timeline();
        STEPS.forEach(function (n, i) { seq.add(function () { setStep(n); }, 0.2 + i * 0.6); });
      });
    } else {
      drawVessels(0); setStep(25, true);
      var lastIdx = 0;
      scrollDriver(ctx, function (p) {
        drawVessels(clamp(p / 0.35, 0, 1));
        var idx = Math.min(3, Math.floor(p * 4.0001));
        if (idx !== lastIdx) { lastIdx = idx; setStep(STEPS[idx]); }
      }, { start: "top 80%", end: "bottom 45%" });
    }
    loop(ctx, function (t) {
      rings.setAttribute("transform", "rotate(" + f1(t * 4) + " 200 200)");
      cup.setAttribute("r", f1(10 + Math.sin(t * 2.2) * 1.1));
      if (flowG.style.display !== "none") {
        var vis = clamp((vesselP - 0.8) / 0.2, 0, 1);
        flows.forEach(function (f, i) {
          f.setAttribute("stroke-dashoffset", (-((t * 0.42 + i * 0.17) % 1)).toFixed(3));
          f.setAttribute("opacity", (vis * (i < 4 ? 0.95 : 0.6)).toFixed(2));
        });
      }
      if (ctx.mini) { var k = Math.floor(t / 1.3) % 4; if (STEPS[k] !== cur) setStep(STEPS[k]); }
    });
    return api;
  };

  /* --- lumen: duct rings, opening, grounding bracket, dotted path --------- */
  B.lumen = function (ctx) {
    var s = ctx.svg, g = G();
    var scene = el("g", {}, s);
    var rings = [];
    for (var i = 0; i < 9; i++) rings.push(el("ellipse", { class: "sp-ink", fill: "none", "stroke-width": i < 3 ? 1.25 : 1.5, opacity: f1(0.28 + i * 0.08) }, scene));
    onTheme(s, function (night) {
      rings.forEach(function (r, i) {
        var lit = night && i >= 4;
        r.setAttribute("class", lit ? "sp-acc" : "sp-ink");
        r.setAttribute("opacity", lit ? f1(0.22 + (i - 4) * 0.16) : f1(0.28 + i * 0.08));
      });
    });
    var hole = el("ellipse", { class: "sp-deep", rx: 22, ry: 18 }, scene);
    var rim = el("ellipse", { class: "sp-ink", rx: 22, ry: 18, fill: "none", "stroke-width": 1.5 }, scene);
    var acc = el("g", { class: "sp-glow" }, s);
    var path = el("path", { class: "sp-acc", fill: "none", "stroke-width": 2.2, "stroke-linecap": "round", "stroke-dasharray": "0.1 7" }, acc);
    var bOuter = el("g", {}, acc), bInner = el("g", {}, bOuter);
    el("path", { class: "sp-acc", d: "M-40 -22v-14h14M26 -36h14v14M40 22v14h-14M-26 36h-14v-14", "stroke-width": 1.75, fill: "none" }, bInner);
    el("path", { class: "sp-acc", d: "M-5 0h10M0 -5v10", "stroke-width": 1.25, opacity: 0.7 }, bInner);
    var tLab = label(ctx, 0, 0, TXT.target, "start", true);
    label(ctx, 20, 26, TXT.phantom);
    label(ctx, 20, 392, TXT.path);

    var flare = nightOnly(el("circle", { class: "sp-acc", r: 30, "stroke-width": 1.5, fill: "none", opacity: 0 }, bOuter));
    var P = { x: 0, y: 0 }, Pw = { x: 0, y: 0 }, bx = 238, by = 176, lastMove = 0, lastLock = -9, locked = false, drag = null, now = 0;
    function lock() {
      lastLock = now; locked = true;
      if (g && !REDUCED) {
        g.fromTo(bInner, { scale: 1.22, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.5, ease: ease("v") });
        if (flare.style.display !== "none") g.fromTo(flare, { attr: { r: 30 }, opacity: 0.9 }, { attr: { r: 84 }, opacity: 0, duration: 0.9, ease: "power2.out" });
      }
    }
    if (ctx.interactive) {
      if (!FINE) ctx.host.style.touchAction = "pan-y";
      pointerTrack(ctx, {
        move: function (p, e) {
          if (e.pointerType === "mouse" || e.pointerType === "pen") { Pw.x = clamp((p.x - 200) / 200, -1, 1); Pw.y = clamp((p.y - 200) / 200, -1, 1); lastMove = now; locked = false; }
          else if (drag) { Pw.x = clamp(drag.px + (p.x - drag.x) / 120, -1, 1); Pw.y = clamp(drag.py + (p.y - drag.y) / 120, -1, 1); lastMove = now; locked = false; }
        },
        down: function (p, e) { if (e.pointerType === "touch") drag = { x: p.x, y: p.y, px: Pw.x, py: Pw.y }; },
        up: function () { drag = null; },
        leave: function (e) { drag = null; if (!e || e.pointerType === "mouse") { Pw.x = 0; Pw.y = 0; lastMove = now; locked = false; } }
      });
    }
    var first = true;
    loop(ctx, function (t, dt) {
      now = t;
      var k = first ? 1 : damp(6, dt);
      P.x += (Pw.x - P.x) * k; P.y += (Pw.y - P.y) * k;
      var sx = P.x * 10, sy = P.y * 10;
      var hx = 238 + Math.sin(t * 0.7) * 5 + sx, hy = 176 + Math.cos(t * 0.6) * 4 + sy;
      rings.forEach(function (r, i) {
        var d = i / 8, w = Math.sin(t * 1.4 - i * 0.6) * 3.2;
        r.setAttribute("cx", f1(200 + (hx - 200) * d * 0.95 + sx * 0.3 * (1 - d)));
        r.setAttribute("cy", f1(200 + (hy - 200) * d * 0.95 + sy * 0.3 * (1 - d)));
        r.setAttribute("rx", f1(180 - i * 19 + w));
        r.setAttribute("ry", f1(170 - i * 18 + w * 0.8));
      });
      hole.setAttribute("cx", f1(hx)); hole.setAttribute("cy", f1(hy));
      rim.setAttribute("cx", f1(hx)); rim.setAttribute("cy", f1(hy));
      var kb = first ? 1 : damp(4.5, dt);
      bx += (hx - bx) * kb; by += (hy - by) * kb;
      bOuter.setAttribute("transform", "translate(" + f1(bx) + " " + f1(by) + ")");
      path.setAttribute("d", "M200 392C190 330 " + f1(bx - 12) + " " + f1(by + 92) + " " + f1(bx) + " " + f1(by + 16));
      path.setAttribute("stroke-dashoffset", f1(-t * 12));
      if (tLab) { tLab.setAttribute("x", f1(bx + 46)); tLab.setAttribute("y", f1(by - 30)); }
      if (!locked && t - lastMove > 0.3 && t - lastLock > 2.6 && Math.hypot(hx - bx, hy - by) < 2.5) lock();
      first = false;
    });
    return {};
  };

  /* --- grid: 150 synchronised segments, 10 x 15 tiles ---------------------- */
  B.grid = function (ctx) {
    var s = ctx.svg, g = G();
    var tiles = [];
    for (var r = 0; r < 15; r++) for (var c = 0; c < 10; c++) {
      tiles.push(el("rect", { class: "sp-fill", x: 40 + c * 32, y: 24 + r * 23, width: 26, height: 18, rx: 1.5, opacity: 0.14 }, s));
    }
    var acc = el("g", { class: "sp-glow" }, s);
    var scan = nightOnly(el("rect", { class: "sp-acc-fill", x: 34, y: 21, width: 332, height: 3, rx: 1.5, opacity: 0 }, acc));
    var hover = el("rect", { class: "sp-acc", width: 32, height: 24, rx: 3, fill: "none", "stroke-width": 1.5, opacity: 0 }, acc);
    var cLab = label(ctx, 40, 392, TXT.count(0), "start", true);
    label(ctx, 360, 392, TXT.crop, "end");
    var n = 0, play = -1, hov = -1, state = [];
    function paint(i) {
      var want = i === hov ? 3 : i === play ? 2 : i < n ? 1 : 0;
      if (state[i] === want) return;
      state[i] = want;
      var t = tiles[i];
      t.setAttribute("class", want ? "sp-acc-fill" : "sp-fill");
      t.setAttribute("opacity", want === 0 ? "0.14" : want === 1 ? "0.72" : "1");
    }
    function setN(v) {
      v = clamp(Math.round(v), 0, 150);
      if (v === n) return;
      var a = Math.min(v, n), b = Math.max(v, n);
      n = v;
      for (var i = a; i < b; i++) paint(i);
      if (hov < 0) setText(cLab, TXT.count(n));
    }
    function setHover(i) {
      var old = hov; hov = i;
      if (old >= 0) paint(old);
      if (i >= 0) {
        paint(i);
        hover.setAttribute("x", 37 + (i % 10) * 32); hover.setAttribute("y", 21 + Math.floor(i / 10) * 23); hover.setAttribute("opacity", "1");
        setText(cLab, TXT.seg(i + 1));
      } else { hover.setAttribute("opacity", "0"); setText(cLab, TXT.count(n)); }
    }
    for (var k = 0; k < 150; k++) paint(k);
    function tileAt(p) {
      var c = Math.floor((p.x - 37) / 32), r = Math.floor((p.y - 21) / 23);
      if (c < 0 || c > 9 || r < 0 || r > 14) return -1;
      return r * 10 + c;
    }
    if (ctx.interactive) pointerTrack(ctx, {
      move: function (p, e) { if (e.pointerType === "mouse" || e.pointerType === "pen") setHover(tileAt(p)); },
      leave: function (e) { if (!e || e.pointerType !== "touch") setHover(-1); },
      up: function (p, e) { if (e.pointerType === "touch") { var i = tileAt(p); setHover(i === hov ? -1 : i); } }
    });
    if (ctx.mini || REDUCED || !g) setN(150);
    else if (ctx.inGallery || !window.ScrollTrigger) {
      onceVisible(ctx, function () { var o = { v: 0 }; g.to(o, { v: 150, duration: 1.6, ease: "power2.out", onUpdate: function () { setN(o.v); } }); });
    } else scrollDriver(ctx, function (p) { setN(p * 150); }, { start: "top 80%", end: "center 45%" });
    loop(ctx, function (t) {
      var lim = Math.max(1, n);
      var k = n ? Math.floor(t * 7) % lim : -1;
      if (k !== play) { var old = play; play = k; if (old >= 0) paint(old); if (k >= 0) paint(k); }
      if (scan.style.display !== "none") {
        var rows = Math.max(1, Math.ceil(n / 10)), u = (t * 0.32) % 1;
        scan.setAttribute("y", f1(20 + u * rows * 23));
        scan.setAttribute("opacity", (n ? 0.85 * Math.sin(Math.PI * u) : 0).toFixed(2));
      }
    });
    return {};
  };

  /* --- coils: three coils at 120 degrees drive a three-legged robot -------- */
  B.coils = function (ctx) {
    var s = ctx.svg, g = G();
    var C = { x: 200, y: 206 }, R = 110;
    var field = el("g", { fill: "none" }, s);
    var coils = [-90, 30, 150].map(function (deg, i) {
      var a = deg * Math.PI / 180, px = C.x + Math.cos(a) * 156, py = C.y + Math.sin(a) * 156;
      var grp = el("g", { transform: "translate(" + f1(px) + " " + f1(py) + ") rotate(" + (deg + 90) + ")" }, s);
      el("rect", { class: "sp-ink", x: -30, y: -17, width: 60, height: 34, rx: 5, fill: "none", "stroke-width": 1.5 }, grp);
      var core = el("rect", { class: "sp-acc-fill", x: -22, y: -10, width: 44, height: 20, rx: 2, opacity: 0.35 }, grp);
      for (var w = 0; w < 6; w++) el("line", { class: "sp-soft", x1: -19 + w * 7.6, y1: -14, x2: -19 + w * 7.6, y2: 14, "stroke-width": 1.25 }, grp);
      var face = { x: C.x + Math.cos(a) * 134, y: C.y + Math.sin(a) * 134, a: a };
      var lines = [-12, 0, 12].map(function () { return el("path", { class: "sp-soft", "stroke-width": 1.25, "stroke-dasharray": "4 6" }, field); });
      var lab = label(ctx, f1(C.x + Math.cos(a) * 192), f1(C.y + Math.sin(a) * 192 + 4), TXT.coil(i + 1), Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "end" : "start");
      return { core: core, face: face, lines: lines, lab: lab, act: -1 };
    });
    var sparkG = nightOnly(el("g", { class: "sp-glow" }, s));
    var sparks = [0, 1, 2, 3, 4, 5].map(function () { return el("circle", { class: "sp-acc-fill", r: 2.4, opacity: 0 }, sparkG); });
    var bot = el("g", { class: "sp-glow" }, s);
    el("circle", { r: 40, fill: "transparent", stroke: "none" }, bot);
    var legs = [0, 1, 2].map(function () { return el("path", { class: "sp-acc", "stroke-width": 1.75, fill: "none" }, bot); });
    el("circle", { class: "sp-deep", r: 15 }, bot);
    el("circle", { class: "sp-acc", r: 15, fill: "none", "stroke-width": 1.75 }, bot);
    el("circle", { class: "sp-acc-fill", r: 3.2 }, bot);
    var pos = { x: C.x, y: C.y + 10 };
    function clampR(p) { var dx = p.x - C.x, dy = p.y - C.y, d = Math.hypot(dx, dy); return d > R ? { x: C.x + dx / d * R, y: C.y + dy / d * R } : { x: p.x, y: p.y }; }
    function place(p) { pos = clampR(p); if (g) g.set(bot, { x: pos.x, y: pos.y }); else bot.setAttribute("transform", "translate(" + f1(pos.x) + " " + f1(pos.y) + ")"); }
    place(pos);
    function readPos() { if (g) { pos.x = +g.getProperty(bot, "x"); pos.y = +g.getProperty(bot, "y"); } return pos; }
    var dragging = false;
    if (ctx.interactive && g) {
      if (window.Draggable) {
        var snapFn = function (pt) { return clampR(pt); };
        window.Draggable.create(bot, {
          type: "x,y", inertia: !!window.InertiaPlugin && !REDUCED, liveSnap: { points: snapFn }, snap: { points: snapFn },
          cursor: "grab", activeCursor: "grabbing", zIndexBoost: false,
          onPress: function () { dragging = true; setBusy(ctx, true); },
          onDrag: function () { kick(ctx, 1); },
          onRelease: function () { dragging = false; setTimeout(function () { setBusy(ctx, false); }, 60); }
        });
      } else {
        var drag = null;
        bot.style.touchAction = "none"; bot.style.cursor = "grab";
        bot.addEventListener("pointerdown", function (e) { e.preventDefault(); drag = toLocal(s, e.clientX, e.clientY); drag.ox = pos.x; drag.oy = pos.y; try { bot.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } dragging = true; setBusy(ctx, true); });
        bot.addEventListener("pointermove", function (e) { if (!drag) return; var p = toLocal(s, e.clientX, e.clientY); place({ x: drag.ox + p.x - drag.x, y: drag.oy + p.y - drag.y }); kick(ctx, 1); });
        var end = function () { drag = null; dragging = false; setBusy(ctx, false); };
        bot.addEventListener("pointerup", end); bot.addEventListener("pointercancel", end);
      }
      ctx.host.addEventListener("keydown", function (e) {
        var k = e.key, dx = k === "ArrowLeft" ? -10 : k === "ArrowRight" ? 10 : 0, dy = k === "ArrowUp" ? -10 : k === "ArrowDown" ? 10 : 0;
        if (!dx && !dy) return;
        e.preventDefault();
        var p = clampR({ x: readPos().x + dx, y: pos.y + dy });
        if (REDUCED) { place(p); kick(ctx, 1); } else g.to(bot, { x: p.x, y: p.y, duration: 0.25, ease: "power2.out", overwrite: true });
      });
    }
    loop(ctx, function (t) {
      if (ctx.mini) place({ x: C.x + Math.cos(t * 0.6) * 72, y: C.y + Math.sin(t * 0.6) * 72 });
      var p = readPos();
      var best = 0, bd = Infinity;
      coils.forEach(function (c, i) { var d = Math.hypot(p.x - c.face.x, p.y - c.face.y); if (d < bd) { bd = d; best = i; } });
      coils.forEach(function (c, i) {
        var on = i === best;
        if (c.act !== +on) {
          c.act = +on;
          c.core.setAttribute("opacity", on ? "1" : "0.35");
          c.lines.forEach(function (l) { l.setAttribute("class", on ? "sp-acc" : "sp-soft"); l.setAttribute("opacity", on ? "0.9" : "0.32"); });
          if (c.lab) c.lab.setAttribute("class", "sp-label" + (on ? " sp-label--acc" : ""));
        }
        var ta = c.face.a + Math.PI / 2;
        c.lines.forEach(function (l, j) {
          var off = (j - 1) * 13, sx = c.face.x + Math.cos(ta) * off, sy = c.face.y + Math.sin(ta) * off;
          var ex = p.x + Math.cos(ta) * off * 0.4, ey = p.y + Math.sin(ta) * off * 0.4;
          var mx = (sx + ex) / 2 + Math.cos(ta) * off * 1.6, my = (sy + ey) / 2 + Math.sin(ta) * off * 1.6;
          l.setAttribute("d", "M" + f1(sx) + " " + f1(sy) + "Q" + f1(mx) + " " + f1(my) + " " + f1(ex) + " " + f1(ey));
          l.setAttribute("stroke-dashoffset", f1(-t * (on ? 28 : 8)));
        });
      });
      if (sparkG.style.display !== "none") {
        var ls = coils[best].lines;
        sparks.forEach(function (sp, j) {
          var line = ls[j % ls.length], len = 0;
          try { len = line.getTotalLength(); } catch (e) { len = 0; }
          if (!len) { sp.setAttribute("opacity", "0"); return; }
          var u = (t * (dragging ? 1.3 : 0.8) + j * 0.37) % 1, q = line.getPointAtLength(u * len);
          sp.setAttribute("cx", f1(q.x)); sp.setAttribute("cy", f1(q.y));
          sp.setAttribute("opacity", (Math.sin(Math.PI * u) * 0.95).toFixed(2));
        });
      }
      var aim = Math.atan2(coils[best].face.y - p.y, coils[best].face.x - p.x);
      legs.forEach(function (l, i) {
        var a = aim + Math.PI + (i - 1) * 2.0944 + Math.sin(t * 5 + i * 2.1) * (dragging ? 0.28 : 0.12);
        var kx = Math.cos(a) * 24, ky = Math.sin(a) * 24, fx = Math.cos(a) * 36, fy = Math.sin(a) * 36;
        var bend = a + 0.5;
        l.setAttribute("d", "M" + f1(Math.cos(a) * 14) + " " + f1(Math.sin(a) * 14) + "Q" + f1(kx + Math.cos(bend) * 6) + " " + f1(ky + Math.sin(bend) * 6) + " " + f1(fx) + " " + f1(fy));
      });
    });
    return {};
  };

  /* --- pose: 12 landmarks, the raised arm follows the pointer, a waveform -- */
  B.pose = function (ctx) {
    var s = ctx.svg;
    var base = el("line", { class: "sp-soft", x1: 24, y1: 358, x2: 376, y2: 358, "stroke-width": 1 }, s);
    void base;
    var body = el("g", { "stroke-width": 2, fill: "none", "stroke-linecap": "round" }, s);
    var BONES = [[0, 1], [6, 7], [0, 6], [1, 7], [0, 2], [2, 4], [6, 8], [8, 10], [7, 9], [9, 11]];
    var bones = BONES.map(function () { return el("line", { class: "sp-ink" }, body); });
    var neck = el("line", { class: "sp-ink" }, body);
    var head = el("circle", { class: "sp-ink", r: 17 }, body);
    var acc = el("g", { class: "sp-glow", "stroke-width": 2, fill: "none", "stroke-linecap": "round" }, s);
    var trail = nightOnly(el("polyline", { class: "sp-acc", "stroke-width": 1.5, opacity: 0.5, "stroke-linejoin": "round" }, acc)), wHist = [];
    var upper = el("line", { class: "sp-acc" }, acc), fore = el("line", { class: "sp-acc" }, acc);
    var wave = el("path", { class: "sp-acc", "stroke-width": 1.75, "stroke-linejoin": "round" }, acc);
    var joints = [];
    for (var i = 0; i < 12; i++) joints.push(el("circle", { class: i === 1 || i === 3 || i === 5 ? "sp-acc-fill" : "sp-fill", r: 3.4 }, i === 1 || i === 3 || i === 5 ? acc : body));
    label(ctx, 20, 26, TXT.landmarks);
    label(ctx, 380, 392, TXT.sound, "end");
    /* 0 L shoulder, 1 R shoulder, 2 L elbow, 3 R elbow, 4 L wrist, 5 R wrist, 6 L hip, 7 R hip, 8 L knee, 9 R knee, 10 L ankle, 11 R ankle */
    var ptr = null, tgt = { x: 300, y: 70 }, wrist = { x: 300, y: 70 }, amp = 3, hist = [];
    for (var h0 = 0; h0 < 88; h0++) hist.push(3);
    pointerTrack(ctx, {
      move: function (p) { ptr = p; },
      leave: function () { ptr = null; }
    });
    if (ctx.interactive && !FINE) ctx.host.style.touchAction = "pan-y";
    var L1 = 62, L2 = 58, first = true;
    loop(ctx, function (t, dt) {
      var sway = Math.sin(t * 1.3) * 3, bob = Math.sin(t * 2.6) * 1.6;
      var Ls = { x: 160 + sway, y: 112 + bob }, Rs = { x: 240 + sway, y: 112 + bob };
      var Lh = { x: 176 + sway * 0.4, y: 212 }, Rh = { x: 224 + sway * 0.4, y: 212 };
      var want = ptr ? { x: clamp(ptr.x, 150, 390), y: clamp(ptr.y, 10, 330) } : { x: Rs.x + Math.cos(-1.57 + Math.sin(t * 1.6) * 0.95) * 100, y: Rs.y + Math.sin(-1.57 + Math.sin(t * 1.6) * 0.95) * 100 };
      var k = first ? 1 : damp(ptr ? 14 : 6, dt);
      tgt.x += (want.x - tgt.x) * k; tgt.y += (want.y - tgt.y) * k;
      var dx = tgt.x - Rs.x, dy = tgt.y - Rs.y, d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 1, L1 + L2 - 0.5);
      var a = Math.atan2(dy, dx), phi = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
      var E = { x: Rs.x + Math.cos(a + phi) * L1, y: Rs.y + Math.sin(a + phi) * L1 };
      var W = { x: Rs.x + Math.cos(a) * d, y: Rs.y + Math.sin(a) * d };
      var sp = dt > 0 ? Math.hypot(W.x - wrist.x, W.y - wrist.y) / dt : 0;
      wrist = W;
      wHist.push(f1(W.x) + "," + f1(W.y)); if (wHist.length > 20) wHist.shift();
      if (trail.style.display !== "none") trail.setAttribute("points", wHist.join(" "));
      amp = Math.max(3, amp * Math.exp(-dt * 3), Math.min(26, sp * 0.05));
      var swing = Math.sin(t * 1.5) * 0.18;
      var Le = { x: Ls.x - 18 + Math.sin(swing) * 20, y: Ls.y + 54 }, Lw = { x: Le.x - 6 + Math.sin(swing * 2) * 18, y: Le.y + 52 };
      var Lk = { x: 170 + sway * 0.2, y: 268 }, Rk = { x: 230 + sway * 0.2, y: 268 };
      var La = { x: 166, y: 322 }, Ra = { x: 234, y: 322 };
      var J = [Ls, Rs, Le, E, Lw, W, Lh, Rh, Lk, Rk, La, Ra];
      BONES.forEach(function (b, i) { var p = J[b[0]], q = J[b[1]]; bones[i].setAttribute("x1", f1(p.x)); bones[i].setAttribute("y1", f1(p.y)); bones[i].setAttribute("x2", f1(q.x)); bones[i].setAttribute("y2", f1(q.y)); });
      upper.setAttribute("x1", f1(Rs.x)); upper.setAttribute("y1", f1(Rs.y)); upper.setAttribute("x2", f1(E.x)); upper.setAttribute("y2", f1(E.y));
      fore.setAttribute("x1", f1(E.x)); fore.setAttribute("y1", f1(E.y)); fore.setAttribute("x2", f1(W.x)); fore.setAttribute("y2", f1(W.y));
      var hx = 200 + sway, hy = 72 + bob;
      head.setAttribute("cx", f1(hx)); head.setAttribute("cy", f1(hy));
      neck.setAttribute("x1", f1(hx)); neck.setAttribute("y1", f1(hy + 17)); neck.setAttribute("x2", f1(hx)); neck.setAttribute("y2", f1(Ls.y));
      joints.forEach(function (c, i) { c.setAttribute("cx", f1(J[i].x)); c.setAttribute("cy", f1(J[i].y)); });
      hist.push(amp); if (hist.length > 88) hist.shift();
      var dd = "";
      for (var j = 0; j < hist.length; j++) {
        var x = 376 - (hist.length - 1 - j) * 4, env = Math.sin(Math.PI * j / 88);
        var y = 358 + hist[j] * env * Math.sin(j * 0.55 - t * 9) * 0.9;
        dd += (j ? "L" : "M") + f1(x) + " " + f1(y);
      }
      wave.setAttribute("d", dd);
      first = false;
    });
    return {};
  };

  /* ================================================================ schematic life
     The engineering schematics are authored SVG (svg.schem, drawn on by core.js via data-draw). This layer
     adds one quiet motion and one pointer response to each, without touching the drawn strokes:
       agv   the fork carriage lifts (pointer height sets it), the guide tape runs, the tape sensor blinks
       heart the heart beats, the transfer coil turns and sends power rings; the pointer near the coil raises the rate
       track the vehicle drives out, touches the target and returns; the pointer's x drives it
       hpc   packets circulate a ring of four nodes (MPI-style); hovering a node makes it broadcast */
  var SCHEM = {};
  function kids(g, sel) { return g ? Array.prototype.slice.call(g.querySelectorAll(sel)) : []; }
  function schemKind(svg) {
    if (svg.classList.contains("schem--head")) return "agv";
    var fig = svg.closest(".fig"), info = fig && fig.querySelector(".fig__info");
    var id = (info && info.getAttribute("aria-controls")) || "";
    var m = /^ex-(agv|heart|track|hpc)/.exec(id);
    if (m) return m[1];
    var d = Array.prototype.map.call(svg.querySelectorAll("path"), function (p) { return p.getAttribute("d") || ""; }).join("|");
    if (/M310 250h60/.test(d)) return "agv";
    if (/C120 270 70 220 70 160/.test(d)) return "heart";
    if (/M60 260h70/.test(d)) return "track";
    if (/M180 120h40/.test(d)) return "hpc";
    return "";
  }
  SCHEM.agv = function (c) {
    var acc = c.svg.querySelector("g.sp-acc"), soft = c.svg.querySelector("g.sp-soft");
    var tape = soft && soft.querySelector("path[stroke-dasharray]");
    var tines = kids(acc, "path").filter(function (p) { return /^M310 (250|290)h60/.test(p.getAttribute("d") || ""); });
    if (!acc || !tines.length) return;
    var load = el("rect", { class: "sp-acc", x: 324, y: 224, width: 40, height: 26, rx: 2, "stroke-width": 1.25 }, acc);
    var strap = el("path", { class: "sp-acc", d: "M324 237h40", "stroke-width": 1, opacity: 0.5 }, acc);
    var sensor = el("circle", { class: "sp-acc-fill", cx: 165, cy: 330, r: 2.5 }, acc);
    var lift = 0.2, want = null, first = true;
    pointerTrack(c, {
      move: function (p, e) { if (e.pointerType !== "touch" || c.dragging) want = clamp((292 - p.y) / 150, 0, 1); },
      down: function (p) { c.dragging = true; want = clamp((292 - p.y) / 150, 0, 1); },
      up: function () { c.dragging = false; },
      leave: function () { want = null; c.dragging = false; }
    });
    loop(c, function (t, dt) {
      var auto = 0.12 + 0.62 * (0.5 - 0.5 * Math.cos(t * 0.8));
      var goal = want != null ? want : auto;
      lift += (goal - lift) * (first ? 1 : damp(want != null ? 9 : 3, dt));
      var tr = "translate(0 " + f1(-lift * 118) + ")";
      tines.forEach(function (p) { p.setAttribute("transform", tr); });
      load.setAttribute("transform", tr); strap.setAttribute("transform", tr);
      if (tape) tape.setAttribute("stroke-dashoffset", f1(t * 22));
      sensor.setAttribute("opacity", (0.35 + 0.65 * Math.max(0, Math.sin(t * 5.5))).toFixed(2));
      first = false;
    });
  };
  SCHEM.heart = function (c) {
    var acc = c.svg.querySelector("g.sp-acc"), soft = c.svg.querySelector("g.sp-soft");
    if (!acc) return;
    var heart = acc.querySelector("path"), circles = kids(acc, "circle");
    var coil = circles[0], ring = circles[1];
    var waves = [0, 1, 2].map(function () { return el("circle", { class: "sp-acc", cx: 200, cy: 190, r: 54, "stroke-width": 1, fill: "none", opacity: 0 }, acc); });
    var ecg = kids(soft, "path").slice(0, 2).map(function (p) { try { return sampler(p); } catch (e) { return null; } }).filter(Boolean);
    var blip = el("circle", { class: "sp-acc-fill", r: 2.6 }, acc);
    var near = 0, nearW = 0, phase = 0, births = [-9, -9, -9], wi = 0, lastBeat = -1;
    pointerTrack(c, {
      move: function (p) { nearW = clamp(1 - Math.hypot(p.x - 200, p.y - 190) / 170, 0, 1); },
      leave: function () { nearW = 0; }
    });
    function pulse(x, w) { return Math.exp(-(x * x) / (2 * w * w)); }
    loop(c, function (t, dt) {
      near += (nearW - near) * damp(4, dt);
      var rate = 1.05 + near * 0.75;
      phase += dt * rate;
      var ph = phase % 1, beat = Math.floor(phase);
      if (beat !== lastBeat && dt > 0) { lastBeat = beat; births[wi] = t; wi = (wi + 1) % 3; }
      var b = pulse(ph, 0.05) + 0.55 * pulse(ph - 0.3, 0.05) + pulse(ph - 1, 0.05);
      if (heart) heart.setAttribute("transform", "translate(200 205) scale(" + (1 + 0.045 * b).toFixed(4) + ") translate(-200 -205)");
      if (coil) coil.setAttribute("opacity", (0.65 + 0.35 * b).toFixed(2));
      if (ring) ring.setAttribute("transform", "rotate(" + f1(t * (16 + near * 30)) + " 200 190)");
      waves.forEach(function (w, i) {
        var age = (t - births[i]) / 1.3;
        if (age < 0 || age > 1) { w.setAttribute("opacity", "0"); return; }
        w.setAttribute("r", f1(54 + age * 70));
        w.setAttribute("opacity", ((1 - age) * (0.45 + near * 0.4)).toFixed(3));
      });
      if (ecg.length) {
        var f = (phase * 0.5) % 1, k = f < 0.5 ? 0 : 1, u = (f % 0.5) * 2;
        var S = ecg[Math.min(k, ecg.length - 1)], q = S.at(u * 0.999);
        blip.setAttribute("cx", f1(q.x)); blip.setAttribute("cy", f1(q.y));
      }
    }, { staticT: 1.2 });
  };
  SCHEM.track = function (c) {
    var acc = c.svg.querySelector("g.sp-acc"), soft = c.svg.querySelector("g.sp-soft");
    if (!acc) return;
    var parts = kids(acc, "path, circle");
    var body = parts[0], wheels = parts.filter(function (e) { return e.tagName.toLowerCase() === "circle"; });
    var target = parts[parts.length - 1];
    var arc = soft && soft.querySelector("path[stroke-dasharray]");
    var spokes = wheels.map(function (w) {
      var cx = +w.getAttribute("cx"), cy = +w.getAttribute("cy"), r = +w.getAttribute("r");
      return { el: el("path", { class: "sp-acc", d: "M" + cx + " " + (cy - r + 4) + "V" + (cy + r - 4) + "M" + (cx - r + 4) + " " + cy + "H" + (cx + r - 4), "stroke-width": 1, opacity: 0.6 }, acc), cx: cx, cy: cy };
    });
    var X = 88, x = 0, want = null, last = 0, first = true;
    pointerTrack(c, {
      move: function (p, e) { if (e.pointerType !== "touch" || c.dragging) want = clamp((p.x - 120) / 200, 0, 1) * X; },
      down: function (p) { c.dragging = true; want = clamp((p.x - 120) / 200, 0, 1) * X; },
      up: function () { c.dragging = false; },
      leave: function () { want = null; c.dragging = false; }
    });
    function ease(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
    loop(c, function (t, dt) {
      var P = t % 6.4, auto;
      if (P < 2.4) auto = ease(P / 2.4) * X; else if (P < 3.2) auto = X; else if (P < 5.6) auto = (1 - ease((P - 3.2) / 2.4)) * X; else auto = 0;
      var goal = want != null ? want : auto;
      x += (goal - x) * (first ? 1 : damp(want != null ? 8 : 30, dt));
      var tr = "translate(" + f1(x) + " 0)";
      if (body) body.setAttribute("transform", tr);
      wheels.forEach(function (w) { w.setAttribute("transform", tr); });
      spokes.forEach(function (s) { s.el.setAttribute("transform", tr + " rotate(" + f1(x / 16 * 57.3) + " " + s.cx + " " + s.cy + ")"); });
      var touch = clamp((x - (X - 10)) / 10, 0, 1);
      if (target && target !== body) target.setAttribute("transform", "translate(345 285) scale(" + (1 + touch * 0.16).toFixed(3) + ") translate(-345 -285)");
      if (arc) arc.setAttribute("stroke-dashoffset", f1(-(x - last) * 2 + (+arc.getAttribute("stroke-dashoffset") || 0)));
      last = x; first = false;
    });
  };
  SCHEM.hpc = function (c) {
    var acc = c.svg.querySelector("g.sp-acc");
    if (!acc) return;
    var nodes = kids(acc, "rect");
    if (nodes.length < 4) return;
    var C = nodes.map(function (r) { return { x: +r.getAttribute("x") + +r.getAttribute("width") / 2, y: +r.getAttribute("y") + +r.getAttribute("height") / 2 }; });
    var glows = nodes.map(function (r) { return el("rect", { class: "sp-acc-fill", x: r.getAttribute("x"), y: r.getAttribute("y"), width: r.getAttribute("width"), height: r.getAttribute("height"), opacity: 0 }, acc); });
    glows.forEach(function (g) { acc.insertBefore(g, acc.firstChild); });
    var RING = [0, 1, 3, 2];
    var packets = [0, 1, 2, 3].map(function () { return el("circle", { class: "sp-acc-fill", r: 4, opacity: 0 }, acc); });
    var hot = -1, flash = [0, 0, 0, 0];
    pointerTrack(c, {
      move: function (p) { var k = -1; C.forEach(function (q, i) { if (Math.abs(p.x - q.x) < 64 && Math.abs(p.y - q.y) < 64) k = i; }); hot = k; },
      down: function (p) { var k = -1; C.forEach(function (q, i) { if (Math.abs(p.x - q.x) < 64 && Math.abs(p.y - q.y) < 64) k = i; }); hot = k; },
      leave: function () { hot = -1; }
    });
    loop(c, function (t, dt) {
      var STEP = 0.9, k = Math.floor(t / STEP), u = (t % STEP) / STEP, m = Math.min(1, u / 0.7), e = m * m * (3 - 2 * m);
      var pairs, dir = Math.floor(k / 3) % 2 ? 3 : 1;          /* three steps clockwise, three back (reduce, then gather) */
      if (hot >= 0) pairs = [0, 1, 2, 3].filter(function (i) { return i !== hot; }).map(function (j) { return [hot, j]; });
      else pairs = RING.map(function (from, i) { return [from, RING[(i + dir) % 4]]; });
      packets.forEach(function (pk, i) {
        var pr = pairs[i];
        if (!pr) { pk.setAttribute("opacity", "0"); return; }
        var a = C[pr[0]], b = C[pr[1]];
        pk.setAttribute("cx", f1(a.x + (b.x - a.x) * e)); pk.setAttribute("cy", f1(a.y + (b.y - a.y) * e));
        pk.setAttribute("opacity", (u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25).toFixed(2));
        if (u >= 0.7) flash[pr[1]] = Math.max(flash[pr[1]], 1);
      });
      glows.forEach(function (g, i) {
        flash[i] = Math.max(0, flash[i] - (dt || 0) * 2.2);
        g.setAttribute("opacity", ((i === hot ? 0.16 : 0) + flash[i] * 0.2).toFixed(3));
      });
    });
  };
  function schem(svg) {
    if (!svg || svg._jwSchem) return;
    var kind = schemKind(svg);
    if (!kind || !SCHEM[kind]) return;
    svg._jwSchem = true;
    var host = svg.closest(".fig__stage") || svg.parentNode || svg;
    var ctx = { host: host, fig: svg.closest(".fig"), svg: svg, mini: false, art: !svg.closest(".fig"), labels: false, interactive: true, inGallery: false, cleanups: [] };
    if (!FINE) host.style.touchAction = "pan-y";
    try { SCHEM[kind](ctx); } catch (e) { if (window.console) console.warn("[JWSpec] schem", kind, e); }
    try { neonAll(svg); } catch (e) { /* relight is decorative */ }
  }

  /* ================================================================ build */
  function build(host, name, opts) {
    opts = opts || {};
    if (!host || !B[name]) return null;
    if (host._jwSpec) return host._jwSpec;
    var fig = host.closest(".fig");
    var mini = !!opts.mini;
    var art = !fig && !mini;
    var svg = el("svg", { class: "sp sp--" + name, viewBox: "0 0 400 400", "aria-hidden": "true", focusable: "false", fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" });
    svg.style.cssText = "display:block;width:100%;height:auto;overflow:visible";
    var ctx = {
      host: host, fig: fig, svg: svg, mini: mini, art: art, labels: !mini && !art, interactive: !mini,
      inGallery: !!host.closest(".gallery"), cleanups: [], initialStep: 200
    };
    if (name === "fundus" && fig) {
      var pressed = fig.querySelector('[data-step][aria-pressed="true"]');
      if (pressed) ctx.initialStep = +pressed.getAttribute("data-step") || 200;
    }
    host.appendChild(svg);
    var api;
    try { api = B[name](ctx) || {}; } catch (e) { if (window.console) console.warn("[JWSpec]", name, e); api = {}; }
    try { neonAll(svg); } catch (e) { /* relight is decorative */ }
    api.destroy = function () {
      ctx.cleanups.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } });
      if (window.gsap) window.gsap.killTweensOf(svg.querySelectorAll("*"));
      if (svg.parentNode) svg.parentNode.removeChild(svg);
      host._jwSpec = null;
    };
    host._jwSpec = api;
    if (name === "fundus" && fig && !mini && api.setStep) wireSteps(fig, api);
    return api;
  }
  function wireSteps(fig, api) {
    var btns = Array.prototype.slice.call(fig.querySelectorAll("[data-step]"));
    if (!btns.length) return;
    var sync = function (n) { btns.forEach(function (b) { b.setAttribute("aria-pressed", String(+b.getAttribute("data-step") === n)); }); };
    if (api.onStep) api.onStep(sync);
    if (api.step) sync(api.step());
    btns.forEach(function (b) {
      b.addEventListener("click", function () { api.setStep(+b.getAttribute("data-step")); });
    });
  }
  function buildAll() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-specimen]"), function (host) {
      if (host.closest(".peek")) return;
      build(host, host.getAttribute("data-specimen"), {});
    });
    Array.prototype.forEach.call(document.querySelectorAll("svg.schem"), schem);
    if (window.ScrollTrigger && window.gsap) { try { window.ScrollTrigger.refresh(); } catch (e) { /* ignore */ } }
  }

  window.JWSpec = { build: build, buildAll: buildAll, schem: schem, neon: neon, nightOnly: nightOnly, relight: relight };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildAll);
  else setTimeout(buildAll, 0);
})();
