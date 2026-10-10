/* Procedural "specimens" for the research plates. Each [data-specimen] gets an SVG
   drawn in the plate's ink colour, animated only while on screen. */

(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasGsap = typeof window.gsap !== "undefined";

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function svg(host) {
    var s = el("svg", { viewBox: "0 0 400 400", "aria-hidden": "true", fill: "none", stroke: "currentColor" });
    host.appendChild(s);
    return s;
  }
  function label(s, x, y, text, anchor) {
    var t = el("text", { x: x, y: y, "text-anchor": anchor || "start", fill: "currentColor", stroke: "none", "font-family": "Geist Mono, monospace", "font-size": "10", "letter-spacing": "1.4" }, s);
    t.textContent = text.toUpperCase();
    return t;
  }
  /* run fn(t) every frame while host is visible */
  function loop(host, fn) {
    if (reduced) { fn(1.2); return; }
    var on = false, t0 = performance.now();
    var tick = function (now) { if (!on) return; fn((now - t0) / 1000); requestAnimationFrame(tick); };
    new IntersectionObserver(function (es) {
      var v = es[0].isIntersecting;
      if (v && !on) { on = true; requestAnimationFrame(tick); } else if (!v) on = false;
    }, { rootMargin: "80px" }).observe(host);
  }
  function scrub(host, onP) {
    if (!hasGsap || reduced || !window.ScrollTrigger) { onP(1); return; }
    window.ScrollTrigger.create({ trigger: host.closest(".plate, section") || host, start: "top 80%", end: "center 45%", scrub: 0.6, onUpdate: function (s) { onP(s.progress); } });
  }

  var builders = {
    /* three different kinematic chains tracing one shared trajectory */
    embodiment: function (host) {
      var s = svg(host);
      var traj = el("path", { d: "M90 150 C150 90 250 90 310 150 C340 180 300 230 240 220 C180 210 140 260 170 300", "stroke-dasharray": "4 7", "stroke-width": "1.6", opacity: ".7" }, s);
      traj.setAttribute("data-draw", "");
      var bases = [[40, 380, [140, 120, 70]], [360, 380, [160, 100]], [200, 20, [90, 90, 70, 50]]];
      var chains = bases.map(function (b, k) {
        var g = el("g", {}, s);
        el("rect", { x: b[0] - 22, y: b[1] - (k === 2 ? 0 : 10), width: 44, height: 10, fill: "currentColor", stroke: "none" }, g);
        return { b: b, pl: el("polyline", { "stroke-width": k === 2 ? "5" : "3.5", "stroke-linecap": "round", "stroke-linejoin": "round" }, g),
          joints: b[2].map(function () { return el("circle", { r: "5", fill: "currentColor", stroke: "none" }, g); }),
          tip: el("circle", { r: "9", "stroke-width": "2" }, g) };
      });
      var len = traj.getTotalLength();
      var pt = el("circle", { r: "4", fill: "currentColor", stroke: "none" }, s);
      label(s, 20, 24, "Shared action space");
      label(s, 380, 24, "3 embodiments", "end");
      /* simple CCD-like IK toward a moving point on the trajectory */
      var ang = chains.map(function (c) { return c.b[2].map(function (_, i) { return i === 0 ? -Math.PI / 2 : 0.2; }); });
      loop(host, function (t) {
        chains.forEach(function (c, k) {
          var p = traj.getPointAtLength(((t * 0.08 + k * 0.33) % 1) * len);
          var A = ang[k], L = c.b[2];
          for (var it = 0; it < 6; it++) {
            for (var j = L.length - 1; j >= 0; j--) {
              var pts = fk(c.b, A, L);
              var jx = pts[j][0], jy = pts[j][1], ex = pts[L.length][0], ey = pts[L.length][1];
              var a1 = Math.atan2(ey - jy, ex - jx), a2 = Math.atan2(p.y - jy, p.x - jx);
              A[j] += (a2 - a1) * 0.5;
            }
          }
          var P = fk(c.b, A, L);
          c.pl.setAttribute("points", P.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" "));
          c.joints.forEach(function (j, i) { j.setAttribute("cx", P[i][0]); j.setAttribute("cy", P[i][1]); });
          c.tip.setAttribute("cx", P[L.length][0]); c.tip.setAttribute("cy", P[L.length][1]);
          if (k === 0) { pt.setAttribute("cx", p.x); pt.setAttribute("cy", p.y); }
        });
      });
      function fk(b, A, L) {
        var x = b[0], y = b[1] - (b[1] < 100 ? -10 : 10), a = 0, out = [[x, y]];
        for (var i = 0; i < L.length; i++) { a += A[i]; x += Math.cos(a) * L[i]; y += Math.sin(a) * L[i]; out.push([x, y]); }
        return out;
      }
      if (b0()) ang[2][0] = Math.PI / 2;
      function b0() { return true; }
    },

    /* retinal fundus: vessel tree drawn by scroll, sample dots 25/50/100/200, three camera rings */
    fundus: function (host) {
      var s = svg(host);
      [188, 176, 164].forEach(function (r, i) { el("circle", { cx: 200, cy: 200, r: r, "stroke-width": "1", "stroke-dasharray": i === 0 ? "2 6" : i === 1 ? "10 6" : "1 4", opacity: ".55" }, s); });
      el("circle", { cx: 200, cy: 200, r: 150, fill: "currentColor", stroke: "none", opacity: ".1" }, s);
      var disc = el("circle", { cx: 262, cy: 192, r: 24, fill: "#FFC21A", stroke: "currentColor", "stroke-width": "2" }, s);
      el("circle", { cx: 262, cy: 192, r: 10, fill: "#FFF3D1", stroke: "none" }, s);
      var g = el("g", { "stroke-width": "2.2", "stroke-linecap": "round", "data-draw": "" }, s);
      var vessels = [
        "M262 172 C240 130 200 100 150 92", "M262 172 C270 130 260 100 240 70", "M262 212 C240 260 200 290 150 300",
        "M262 212 C275 255 265 290 245 325", "M240 180 C200 170 150 160 90 175", "M240 205 C200 215 150 230 95 230",
        "M200 102 C190 120 170 130 140 128", "M205 290 C190 275 170 270 140 272", "M150 165 C130 150 110 150 85 140", "M150 232 C130 250 110 255 90 262"
      ];
      vessels.forEach(function (d, i) { el("path", { d: d, opacity: i < 4 ? "1" : ".7", "stroke-width": i < 4 ? "2.6" : "1.6" }, g); });
      var dots = [];
      for (var i = 0; i < 200; i++) {
        var a = i * 2.39996, r = 18 + Math.sqrt(i / 200) * 124;
        dots.push(el("circle", { cx: (200 + Math.cos(a) * r).toFixed(1), cy: (200 + Math.sin(a) * r).toFixed(1), r: "2.4", fill: "currentColor", stroke: "none", opacity: "0" }, s));
      }
      var nLab = label(s, 20, 388, "n = 0");
      label(s, 380, 388, "3 cameras", "end");
      var ticks = [25, 50, 100, 200];
      ticks.forEach(function (v, k) { label(s, 20 + k * 52, 24, String(v)); });
      scrub(host, function (p) {
        var n = Math.round(p * 200);
        var shown = 0; for (var k = 0; k < ticks.length; k++) if (n >= ticks[k]) shown = ticks[k];
        dots.forEach(function (d, i) { d.setAttribute("opacity", i < shown ? "1" : i < n ? ".25" : "0"); });
        nLab.textContent = "N = " + shown;
      });
      loop(host, function (t) { disc.setAttribute("r", (24 + Math.sin(t * 2.4) * 1.5).toFixed(2)); });
    },

    /* bile-duct lumen with a grounding box */
    lumen: function (host) {
      var s = svg(host);
      var rings = [];
      for (var i = 0; i < 9; i++) rings.push(el("ellipse", { cx: 200, cy: 200, rx: 180 - i * 19, ry: 170 - i * 18, "stroke-width": (2.4 - i * .2).toFixed(2), opacity: (0.35 + i * 0.07).toFixed(2) }, s));
      var hole = el("ellipse", { cx: 238, cy: 176, rx: 22, ry: 18, fill: "currentColor", stroke: "none" }, s);
      var box = el("path", { d: "M196 138v-14h14 M266 124h14v14 M280 214v14h-14 M210 228h-14v-14", "stroke-width": "3", "stroke-linecap": "square" }, s);
      var path = el("path", { d: "M200 390 C190 320 230 260 238 186", "stroke-width": "3", "stroke-linecap": "round", "stroke-dasharray": "2 9", "data-draw": "" }, s);
      label(s, 290, 118, "Target");
      label(s, 20, 24, "ERCP phantom");
      loop(host, function (t) {
        rings.forEach(function (r, i) {
          var k = i / 9, w = Math.sin(t * 1.4 - i * 0.6) * 4;
          r.setAttribute("cx", (200 + 38 * k + Math.sin(t * .7) * 6 * k).toFixed(1));
          r.setAttribute("cy", (200 - 24 * k + Math.cos(t * .6) * 5 * k).toFixed(1));
          r.setAttribute("rx", (180 - i * 19 + w).toFixed(1));
        });
        var hx = 238 + Math.sin(t * .7) * 6, hy = 176 + Math.cos(t * .6) * 5;
        hole.setAttribute("cx", hx.toFixed(1)); hole.setAttribute("cy", hy.toFixed(1));
        box.setAttribute("transform", "translate(" + (hx - 238).toFixed(1) + " " + (hy - 176).toFixed(1) + ")");
      });
    },

    /* 150 synchronised segments as a 10 x 15 grid filling with scroll */
    grid: function (host) {
      var s = svg(host);
      var tiles = [];
      for (var r = 0; r < 15; r++) for (var c = 0; c < 10; c++) {
        tiles.push(el("rect", { x: 40 + c * 32, y: 22 + r * 23, width: 26, height: 18, fill: "currentColor", stroke: "none", opacity: ".12" }, s));
      }
      var count = label(s, 40, 392, "0 / 150 segments");
      label(s, 360, 392, "224 x 224", "end");
      scrub(host, function (p) {
        var n = Math.round(p * 150);
        tiles.forEach(function (t, i) { t.setAttribute("opacity", i < n ? (i === n - 1 ? "1" : ".85") : ".12"); });
        count.textContent = (n + " / 150 segments").toUpperCase();
      });
      loop(host, function (t) {
        var k = Math.floor(t * 9) % 150;
        tiles[k].setAttribute("opacity", "1");
      });
    },

    /* three electromagnetic coils at 120 degrees, field lines, three-legged robot */
    coils: function (host) {
      var s = svg(host);
      var field = el("g", { "stroke-width": "1.4", opacity: ".8" }, s);
      var lines = [];
      for (var k = 0; k < 3; k++) {
        var a = (k * 120 - 90) * Math.PI / 180, b = ((k + 1) * 120 - 90) * Math.PI / 180;
        for (var m = 0; m < 4; m++) {
          var r1 = 140, bow = 40 + m * 26;
          var x1 = 200 + Math.cos(a) * r1, y1 = 200 + Math.sin(a) * r1, x2 = 200 + Math.cos(b) * r1, y2 = 200 + Math.sin(b) * r1;
          var mid = (a + b) / 2, cx = 200 + Math.cos(mid) * (r1 - bow * 2.2), cy = 200 + Math.sin(mid) * (r1 - bow * 2.2);
          lines.push(el("path", { d: "M" + x1 + " " + y1 + " Q" + cx + " " + cy + " " + x2 + " " + y2, "stroke-dasharray": "6 8" }, field));
        }
      }
      var coils = [];
      for (var i = 0; i < 3; i++) {
        var g = el("g", { transform: "rotate(" + (i * 120) + " 200 200)" }, s);
        el("rect", { x: 172, y: 18, width: 56, height: 54, rx: 6, fill: "currentColor", stroke: "none" }, g);
        for (var w = 0; w < 6; w++) el("line", { x1: 176, y1: 24 + w * 8, x2: 224, y2: 24 + w * 8, stroke: "#1F3DFF", "stroke-width": "2" }, g);
        coils.push(g);
      }
      var bot = el("g", {}, s);
      el("circle", { cx: 200, cy: 200, r: 18, fill: "currentColor", stroke: "none" }, bot);
      var legs = [0, 1, 2].map(function () { return el("path", { "stroke-width": "5", "stroke-linecap": "round" }, bot); });
      label(s, 20, 392, "Coil 1  Coil 2  Coil 3");
      loop(host, function (t) {
        lines.forEach(function (l, i) { l.setAttribute("stroke-dashoffset", String(-t * 40 * (i % 2 ? 1 : 1.3))); });
        var phase = Math.floor(t * 1.5) % 3;
        coils.forEach(function (c, i) { c.setAttribute("opacity", i === phase ? "1" : ".45"); });
        var lift = Math.sin(t * 6) * 0.5 + 0.5;
        legs.forEach(function (l, i) {
          var a = (i * 120 - 90 + Math.sin(t * 3 + i) * 12) * Math.PI / 180;
          var kx = 200 + Math.cos(a) * 34, ky = 200 + Math.sin(a) * 34 - (i === phase ? lift * 10 : 0);
          var fx = 200 + Math.cos(a) * 58, fy = 200 + Math.sin(a) * 58;
          l.setAttribute("d", "M200 200 Q" + kx.toFixed(1) + " " + (ky - 14).toFixed(1) + " " + fx.toFixed(1) + " " + fy.toFixed(1));
        });
        bot.setAttribute("transform", "rotate(" + (Math.sin(t * .8) * 18).toFixed(2) + " 200 200)");
      });
    },

    /* pose skeleton driving a waveform */
    pose: function (host) {
      var s = svg(host);
      var bones = [[0, 1], [1, 2], [2, 3], [1, 4], [4, 5], [1, 6], [6, 7], [6, 8], [8, 9], [6, 10], [10, 11]];
      var lines = bones.map(function () { return el("line", { "stroke-width": "6", "stroke-linecap": "round" }, s); });
      var joints = []; for (var i = 0; i < 12; i++) joints.push(el("circle", { r: i === 0 ? 16 : 5, fill: "currentColor", stroke: "none" }, s));
      var wave = el("path", { "stroke-width": "2.4", "stroke-linejoin": "round" }, s);
      el("line", { x1: 20, y1: 340, x2: 380, y2: 340, "stroke-width": "1", opacity: ".3" }, s);
      label(s, 20, 24, "MediaPipe landmarks");
      label(s, 380, 392, "Sound", "end");
      var hist = [];
      loop(host, function (t) {
        var sw = Math.sin(t * 2.2), sw2 = Math.sin(t * 2.2 + 1.7), hip = Math.sin(t * 4.4) * 4;
        var P = [
          [200, 62 + hip], [200, 98 + hip],
          [200 - 40 - sw * 14, 120 - sw * 40], [200 - 62 - sw * 30, 82 - sw * 60],
          [200 + 40 + sw2 * 14, 120 - sw2 * 36], [200 + 66 + sw2 * 24, 90 - sw2 * 64],
          [200, 186 + hip],
          [200, 186 + hip],
          [178 + sw * 10, 236], [172 + sw * 18, 288],
          [222 - sw * 10, 236], [228 - sw * 18, 288]
        ];
        bones.forEach(function (b, i) { var a = P[b[0]], c = P[b[1]]; lines[i].setAttribute("x1", a[0]); lines[i].setAttribute("y1", a[1]); lines[i].setAttribute("x2", c[0]); lines[i].setAttribute("y2", c[1]); });
        joints.forEach(function (j, i) { j.setAttribute("cx", P[i][0].toFixed(1)); j.setAttribute("cy", P[i][1].toFixed(1)); });
        hist.push((P[3][1] - 82) * 0.4 + (P[5][1] - 90) * 0.3);
        if (hist.length > 90) hist.shift();
        wave.setAttribute("d", hist.map(function (v, i) { return (i ? "L" : "M") + (20 + i * 4) + " " + (340 + v * Math.sin(i * 0.9 + t * 8) * 0.6).toFixed(1); }).join(" "));
      });
    }
  };

  document.querySelectorAll("[data-specimen]").forEach(function (host) {
    var b = builders[host.getAttribute("data-specimen")];
    if (b) b(host);
  });
})();
