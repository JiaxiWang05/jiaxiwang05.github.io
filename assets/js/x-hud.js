/* x-hud.js: NIGHT HUD TELEMETRY (desktop showpiece). A quiet instrument readout in the screen margins, like the
   overlay of a surgical navigation system. Night theme only, viewport >= 1200 px, fine pointer, never html.jw-lite.
   Left margin: insertion-depth ruler (page height = 0-420 mm) with a marker at the scroll position, the depth
   readout and the chapter under the viewport centre ([data-chapter]). Right margin: normalised cursor position
   (with a Y marker on a mirrored ruler), a frame counter, the measured rAF rate and a lumen-phase dial.
   One slow 1 px scanline sweeps both margins every 6 s (transform + opacity only).
   Never covers content or fixed UI: each margin picks a wide face (horizontal text) or a narrow face (a 22 px
   strip with vertical text) from the measured content column, and every part (head, ruler, foot) is hidden while
   page content, the nav, the "Research version" switcher, the toast or the music note would touch it.
   Detection is geometry only: an idle DOM scan (after the reveal, a resize, a chapter change, a ScrollTrigger
   refresh) lists every inky element (text, media, boxes) within 100 px of the content column edges or beyond,
   grouped by top-level block; a probe (~10 Hz while scrolling, 3 Hz while things settle, 1 Hz at rest) re-reads
   the rects of the blocks near the band, looking ahead by the scroll speed. All reads happen in a task after the
   frame has painted, never in rAF, and never as hit tests (elementFromPoint forces a pre-paint update that can
   block on the compositor commit). Hidden while the menu, a dialog / palette / scope mode is open, and in print.
   Costs: rAF counts frames and does work at ~10 Hz (text nodes in its own contain:strict layer, marker transforms);
   the loop stops while the tab is hidden, by day, below 1200 px, and after close(). Reduced motion: no loop,
   no sweep, no dial; values refresh on scroll / pointer input only.
   Loaded late by the core.js loader; initialises immediately. Debug: window.JWX_hud = {open, close, state, probe, scan} */
(function () {
  "use strict";
  if (window.JWX_hud) return;

  var html = document.documentElement, doc = document, win = window;
  function mql(q) { try { return win.matchMedia(q); } catch (e) { return null; } }
  var mFine = mql("(pointer: fine)"), mWide = mql("(min-width: 1200px)"), mRM = mql("(prefers-reduced-motion: reduce)");
  var LITE = html.classList.contains("jw-lite") || win.JW_LITE === true || !!(win.JW && win.JW.lite);
  if (LITE || !(mFine && mFine.matches) || !doc.body) {
    win.JWX_hud = { disabled: true, open: function () {}, close: function () {}, state: function () { return { disabled: true }; } };
    return;
  }

  var ZH = /^zh/i.test(html.getAttribute("lang") || "");
  /* zh: 深度 (depth), 光标 (cursor), 帧 (frame), 管腔相位 (lumen phase), 章节 (chapter): the terms of the zh pages */
  var S = ZH
    ? { depth: "\u6df1\u5ea6", cursor: "\u5149\u6807", frm: "\u5e27", lumen: "\u7ba1\u8154\u76f8\u4f4d", ch: "\u7ae0\u8282" }
    : { depth: "DEPTH", cursor: "CURSOR", frm: "FRM", lumen: "LUMEN \u03c6", ch: "CH" };
  var RM = !!(mRM && mRM.matches);

  /* geometry constants (px) */
  var EW = 16, GAP = 18, WMIN = 104, WMAX = 184;   /* wide face: edge offset, gap to content, width range */
  var EN = 12, NW = 22, GAPN = 12;                  /* narrow face: edge offset, width, gap to content */
  var HEAD = 30, FOOT = 46, GV = 12, DIV = 42;      /* head / foot rows, vertical gaps, ruler divisions */
  var MM = 420;                                     /* page height maps to 0-420 mm */
  var LUMEN_RATE = 0.32;                            /* lumen advance per second (hero-gl.js depth term) */
  var HUES = { coil: 1, nbi: 1, icg: 1, disc: 1, fundus: 1, mucosa: 1, ppix: 1 };

  function $(s, r) { return (r || doc).querySelector(s); }
  function el(tag, cls, parent, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.appendChild(doc.createTextNode(text));
    if (parent) parent.appendChild(e);
    return e;
  }
  function tn(parent, text) { var t = doc.createTextNode(text); parent.appendChild(t); return t; }
  function setT(nodes, s) { for (var i = 0; i < nodes.length; i++) if (nodes[i].nodeValue !== s) nodes[i].nodeValue = s; }
  function pad(n, w) { var s = String(n); while (s.length < w) s = "0" + s; return s; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function now() { return performance.now(); }
  function listen(t, ev, fn, o) { t.addEventListener(ev, fn, o || false); return function () { t.removeEventListener(ev, fn, o || false); }; }
  function onMq(m, fn) {
    if (!m) return;
    if (m.addEventListener) m.addEventListener("change", fn); else if (m.addListener) m.addListener(fn);
  }

  /* ---------------------------------------------------------------- DOM */
  var root = el("div", "jwx-hud" + (ZH ? " jwx-hud--zh" : "") + (RM ? " jwx-hud--still" : ""));
  root.setAttribute("aria-hidden", "true");
  root.hidden = true;

  var N = { depth: [], idx: [], ch: [], x: [], y: [], frm: [], hz: [], ph: [] };   /* text nodes, one per face */
  var MK = { l: [], r: [] };                                                        /* ruler markers */
  var RINGS = [];
  var PARTS = { l: { w: [], n: [] }, r: { w: [], n: [] } };                         /* collision units */
  var PANEL = {};

  function ruler(parent, side, labels) {
    var r = el("div", "jwx-hud__part jwx-hud__rule", parent);
    el("i", "jwx-hud__ticks", r);
    if (labels) labels.forEach(function (l) { var s = el("span", "jwx-hud__lbl", r, l[0]); s.style.top = l[1] + "%"; });
    var mk = el("div", "jwx-hud__mk", r); el("i", "", mk);
    MK[side].push(mk);
    return r;
  }
  function ring(parent) { var g = el("span", "jwx-hud__ring", parent); RINGS.push(g); return g; }

  function buildLeft() {
    var p = el("div", "jwx-hud__p jwx-hud__p--l is-x", root);
    /* wide face */
    var fw = el("div", "jwx-hud__f jwx-hud__f--w", p);
    var h = el("div", "jwx-hud__part jwx-hud__head", fw);
    el("span", "jwx-hud__k", h, S.depth);
    var v = el("span", "jwx-hud__v", h); N.depth.push(tn(el("b", "", v), "000.0")); tn(v, " mm");
    var r = ruler(fw, "l", [["0", 0], ["100", 100 / 4.2], ["200", 200 / 4.2], ["300", 300 / 4.2], ["400", 400 / 4.2]]);
    var f = el("div", "jwx-hud__part jwx-hud__foot", fw);
    var k = el("span", "jwx-hud__k", f); tn(k, S.ch + " "); N.idx.push(tn(k, "00 / 00"));
    N.ch.push(tn(el("span", "jwx-hud__ch", f), "\u2014"));
    PARTS.l.w = [h, r, f];
    /* narrow face: a ruler strip with vertical text beside it */
    var fn = el("div", "jwx-hud__f jwx-hud__f--n", p);
    var rn = ruler(fn, "l", null);
    var a = el("div", "jwx-hud__part jwx-hud__vt jwx-hud__vt--a", fn);
    el("span", "jwx-hud__k", a, S.depth + " "); N.depth.push(tn(el("b", "", a), "000.0")); tn(a, " mm");
    var b = el("div", "jwx-hud__part jwx-hud__vt jwx-hud__vt--b", fn);
    N.idx.push(tn(el("span", "jwx-hud__k", b), "00/00")); tn(b, " ");
    N.ch.push(tn(el("span", "jwx-hud__ch", b), "\u2014"));
    PARTS.l.n = [a, rn, b];
    el("div", "jwx-hud__scan", p);
    return p;
  }
  function buildRight() {
    var p = el("div", "jwx-hud__p jwx-hud__p--r is-x", root);
    var fw = el("div", "jwx-hud__f jwx-hud__f--w", p);
    var h = el("div", "jwx-hud__part jwx-hud__head", fw);
    el("span", "jwx-hud__k", h, S.cursor);
    var v = el("span", "jwx-hud__v", h);
    tn(v, "X "); N.x.push(tn(el("b", "", v), "0.500")); tn(v, "\u2002Y "); N.y.push(tn(el("b", "", v), "0.500"));
    var r = ruler(fw, "r", [["0.0", 0], ["0.5", 50], ["1.0", 100]]);
    var f = el("div", "jwx-hud__part jwx-hud__foot", fw);
    var f1 = el("span", "jwx-hud__row", f); el("span", "jwx-hud__k", f1, S.frm); tn(f1, " "); N.frm.push(tn(el("b", "", f1), "000000"));
    var f2 = el("span", "jwx-hud__row", f); N.hz.push(tn(el("b", "", f2), "--")); tn(f2, " "); el("span", "jwx-hud__u", f2, "Hz");
    var f3 = el("span", "jwx-hud__row", f); ring(f3); tn(f3, " "); el("span", "jwx-hud__k", f3, S.lumen); tn(f3, " "); N.ph.push(tn(el("b", "", f3), "0.000"));
    PARTS.r.w = [h, r, f];
    var fn = el("div", "jwx-hud__f jwx-hud__f--n", p);
    var rn = ruler(fn, "r", null);
    var a = el("div", "jwx-hud__part jwx-hud__vt jwx-hud__vt--a", fn);
    tn(a, "X "); N.x.push(tn(el("b", "", a), "0.500")); tn(a, " Y "); N.y.push(tn(el("b", "", a), "0.500"));
    var b = el("div", "jwx-hud__part jwx-hud__vt jwx-hud__vt--b", fn);
    ring(b); tn(b, " ");
    el("span", "jwx-hud__k", b, S.frm + " "); N.frm.push(tn(el("b", "", b), "000000"));
    tn(b, " \u00b7 "); N.hz.push(tn(el("b", "", b), "--")); tn(b, " "); el("span", "jwx-hud__u", b, "Hz");
    PARTS.r.n = [a, rn, b];
    el("div", "jwx-hud__scan", p);
    return p;
  }
  PANEL.l = buildLeft();
  PANEL.r = buildRight();
  doc.body.appendChild(root);

  /* ---------------------------------------------------------------- state */
  var st = {
    ready: false, night: html.getAttribute("data-theme") !== "day", wide: !!(mWide && mWide.matches),
    visible: !doc.hidden, printing: false, menu: html.classList.contains("nav-open"), modal: false, closed: false,
    running: false, shown: false
  };
  var geo = { vw: 0, vh: 0, top: 0, height: 0, R: 0, colL: 0, colR: 0, base: { l: "x", r: "x" }, W: { l: 0, r: 0 } };
  var face = { l: "x", r: "x" }, off = { l: [false, false, false], r: [false, false, false] }, upCount = { l: 0, r: 0 };
  var chap = { el: null, name: "", idx: 0, total: 0, hue: "nbi" };
  var ptr = { x: -1, y: -1 };
  var scrollY0 = win.scrollY || 0, maxScroll = 0, docHT = 0;
  var frames = 0, hz = 0, hzT = 0, hzN = 0, lastUpd = 0, lastY = 0, vel = 0, phase = 0;
  var lastMk = { l: -1, r: -1 };
  var raf = 0, checkQ = 0, slowT = 0, pumpT = 0, resizeT = 0, scanQ = 0, chapT = 0;
  var probeY = -1e9, probeT = 0, forceProbe = true, probes = 0, probeMs = 0, scanMs = 0, scanT = 0, scanY = -1e9;
  var intruders = 0, unbind = [], io = null, handles = [], handlesT = 0, why = { l: [], r: [] }, movedT = 0;
  var boxyCache = typeof WeakMap === "function" ? new WeakMap() : null;
  var range = doc.createRange ? doc.createRange() : null;

  /* ---------------------------------------------------------------- geometry (on resize; reads, then writes) */
  function column() {
    var vw = geo.vw, best = null, bw = 0;
    var list = doc.querySelectorAll("main .wrap, .hero__grid, .page-head__inner, footer .wrap");
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (r.width > 320 && r.width < vw - 8 && r.width > bw) { best = r; bw = r.width; }
    }
    if (best) return { l: Math.round(best.left), r: Math.round(best.right) };
    var g = Math.max(16, Math.min(56, vw * 0.04)), w = Math.min(1328, vw - 2 * g);
    return { l: Math.round((vw - w) / 2), r: Math.round((vw + w) / 2) };
  }
  function layout() {
    var de = doc.documentElement;
    geo.vw = de.clientWidth || win.innerWidth; geo.vh = win.innerHeight;
    var vw = geo.vw, vh = geo.vh;
    var nav = $(".nav"), navH = nav ? nav.offsetHeight : 60;
    var sw = $(".switcher"), swTop = vh - 96;
    if (sw) { var r = sw.getBoundingClientRect(); if (r.height > 0 && r.top > vh * 0.5) swTop = r.top; }
    var col = column(); geo.colL = col.l; geo.colR = col.r;
    skipRoots();
    var bandT = navH + 44, bandB = swTop - 28;
    var avail = Math.min(bandB - bandT, Math.round(vh * 0.62));
    var R = Math.min(DIV * 9, Math.floor((avail - HEAD - FOOT - 2 * GV - 1) / DIV) * DIV);
    var ok = R >= DIV * 4;
    var Ht = HEAD + GV + R + 1 + GV + FOOT;
    var top = Math.max(bandT, Math.min(Math.round(vh / 2 - Ht / 2), bandB - Ht));
    geo.R = R; geo.top = top; geo.height = Ht;
    ["l", "r"].forEach(function (s) {
      var free = s === "l" ? col.l : vw - col.r;
      var wfree = free - EW - GAP;
      geo.base[s] = !ok ? "x" : wfree >= WMIN ? "w" : free - EN - NW - GAPN >= 0 ? "n" : "x";
      geo.W[s] = Math.max(WMIN, Math.min(WMAX, wfree));
      var p = PANEL[s];
      p.style.top = top + "px"; p.style.height = Ht + "px";
      p.style.width = Math.max(EW + geo.W[s], EN + NW) + "px";
      p.style.setProperty("--pw", geo.W[s] + "px");
      p.style.setProperty("--rt", (HEAD + GV) + "px");
      p.style.setProperty("--rh", R + "px");
      p.style.setProperty("--tk", (R / DIV) + "px");
    });
    if (!ok) { setFace("l", "x"); setFace("r", "x"); }
    forceProbe = true;
  }

  /* ---------------------------------------------------------------- collision detection */
  var MEDIA = /^(IMG|VIDEO|CANVAS|IFRAME|PICTURE|INPUT|BUTTON|SELECT|TEXTAREA|svg)$/;
  var SKIPTAG = /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|BR|WBR|SOURCE|TRACK|LINK|META|defs|clipPath|mask|linearGradient|radialGradient|stop|filter|symbol|title|desc)$/;
  var SKIP = [root];
  function skipRoots() {
    var s = [root];
    [".nav", "#menu", ".loader", ".curtain", ".switcher", "#switch-toast", ".field-backdrop", ".cursor", ".peek",
      ".skip-link", ".music-note", ".theme-veil"].forEach(function (q) {
      var l = doc.querySelectorAll(q); for (var i = 0; i < l.length; i++) s.push(l[i]);
    });
    SKIP = s;
    return s;
  }
  function hasText(e) {
    for (var n = e.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && /\S/.test(n.nodeValue)) return true;
    return false;
  }
  function alphaOf(c) {
    if (!c || c === "transparent") return 0;
    var m = /\/\s*([\d.]+)(%?)\s*\)$/.exec(c);
    if (m) return parseFloat(m[1]) / (m[2] ? 100 : 1);
    m = /^rgba\(([^)]+)\)$/.exec(c);
    if (m) return parseFloat(m[1].split(",")[3]);
    return 1;
  }
  function boxy(e) {
    var v = boxyCache ? boxyCache.get(e) : undefined;
    if (v !== undefined) return v;
    var cs = getComputedStyle(e);
    v = alphaOf(cs.backgroundColor) > 0.04 || cs.backgroundImage !== "none" ||
      (cs.borderTopStyle !== "none" && parseFloat(cs.borderTopWidth) > 0 && alphaOf(cs.borderTopColor) > 0.04) ||
      (cs.borderLeftStyle !== "none" && parseFloat(cs.borderLeftWidth) > 0 && alphaOf(cs.borderLeftColor) > 0.04);
    if (boxyCache) boxyCache.set(e, v);
    return v;
  }
  function fullBleed(r) { return r.left <= 1 && r.right >= geo.vw - 1; }
  function tiny(e) { var r = e.getBoundingClientRect(); return r.width <= 2 && r.height <= 2; }   /* sr-only (.vh) */
  /* painted at all? (fully transparent / hidden ancestors do not count; cached for one probe) */
  var visMemo = null;
  function painted(e) {
    var chain = [], ok = true, x;
    for (x = e; x && x.nodeType === 1 && x !== doc.body; x = x.parentElement) {
      if (visMemo && visMemo.has(x)) { ok = visMemo.get(x); break; }
      chain.push(x);
      var cs = getComputedStyle(x);
      if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.02) { ok = false; break; }
    }
    if (visMemo) for (var i = 0; i < chain.length; i++) visMemo.set(chain[i], ok);
    return ok;
  }
  function decor(e) { return !!(e.closest && e.closest('[aria-hidden="true"]')); }
  /* ink rectangles of one element (text line boxes, media boxes, card boxes), pushed onto out */
  function ink(e, out, r) {
    var tag = e.tagName;
    if (!r.width && !r.height) return;
    if (e instanceof SVGElement && tag !== "svg") { out.push({ r: r, e: e }); return; }
    if (MEDIA.test(tag)) { if (!(fullBleed(r) && decor(e))) out.push({ r: r, e: e }); return; }
    if (hasText(e) && range && !(r.width <= 2 && r.height <= 2) && !(e.parentElement && tiny(e.parentElement))) {
      for (var n = e.firstChild; n; n = n.nextSibling) {
        if (n.nodeType !== 3 || !/\S/.test(n.nodeValue)) continue;
        range.selectNodeContents(n);
        var l = range.getClientRects();
        for (var i = 0; i < l.length; i++) if (l[i].width) out.push({ r: l[i], e: e });
      }
    }
    if (!fullBleed(r) && boxy(e)) out.push({ r: r, e: e });
  }
  /* Idle DOM scan. Only geometry reads (layout), never hit tests: elementFromPoint forces a pre-paint lifecycle
     update that can block the main thread until the compositor finishes its commit.
     Collects every inky element that reaches within EDGE_Z of the column edges or beyond (offscreen included),
     grouped by top-level block (main's children, the footer...; a ScrollTrigger pin-spacer is such a child), so a
     probe re-measures only the blocks that overlap the HUD band. */
  var EDGE_Z = 100, blocks = [];
  function blockRoots() {
    var out = [], main = $("main"), c;
    var add = function (e) { if (e && !SKIPTAG.test(e.tagName) && !inSkip(e)) out.push(e); };
    if (main) for (c = main.firstElementChild; c; c = c.nextElementSibling) add(c);
    for (c = doc.body.firstElementChild; c; c = c.nextElementSibling) if (c !== main) add(c);
    return out;
  }
  function scan() {
    scanQ = 0;
    if (!st.shown) return;
    var t0 = now(), cl = geo.colL + EDGE_Z, cr = geo.colR - EDGE_Z, total = 0;
    skipRoots();
    var accept = { acceptNode: function (n) { return SKIPTAG.test(n.tagName) || SKIP.indexOf(n) >= 0 ? 2 : 1; } };
    blocks = blockRoots().map(function (b) {
      var items = [], w = doc.createTreeWalker(b, 1, accept), n = b;
      do {
        var r = n.getBoundingClientRect();
        if ((!r.width && !r.height) || (r.left >= cl && r.right <= cr)) continue;
        var tag = n.tagName;
        if (n instanceof SVGElement && tag !== "svg") { if (tag === "text") items.push(n); }
        else if (MEDIA.test(tag)) { if (!(fullBleed(r) && decor(n))) items.push(n); }
        else if (hasText(n)) items.push(n);
        else if (!fullBleed(r) && boxy(n)) items.push(n);
      } while ((n = w.nextNode()));
      total += items.length;
      return { el: b, items: items };
    }).filter(function (b) { return b.items.length > 0; });
    intruders = total;
    scanMs = Math.round((now() - t0) * 10) / 10; scanT = now(); scanY = scrollPos().y;
    forceProbe = true;
  }
  function queueScan(delay) {
    if (scanQ || !st.shown) return;
    var run = function () { scanQ = 0; if (st.shown) scan(); };
    scanQ = setTimeout(function () {
      if (win.requestIdleCallback) win.requestIdleCallback(run, { timeout: 1500 }); else run();
    }, delay || 0);
  }
  function fixedRects(out) {
    var nav = $(".nav"), sw = $(".switcher"), toast = $("#switch-toast"), note = $(".music-note");
    var add = function (e) { if (e) out.push({ r: e.getBoundingClientRect(), e: e }); };
    add(nav); add(sw);
    if (toast && !toast.hidden) add($(".switcher__toast-in", toast) || toast);
    if (note && !note.hidden) add(note);
    var av = doc.querySelectorAll("[data-hud-avoid]");
    for (var i = 0; i < av.length; i++) add(av[i]);
  }
  function hits(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
  function inSkip(e) { for (var i = 0; i < SKIP.length; i++) if (SKIP[i].contains(e)) return true; return false; }
  function probe() {
    var t0 = now();
    probes++;
    var look = 36 + Math.min(240, Math.abs(vel) * 0.16);
    var fixed = [], rects = [], stale = false;
    fixedRects(fixed);
    /* content near the band (blocks first, then their tracked elements) */
    var lo = geo.top - look, hi = geo.top + geo.height + look;
    for (var b = 0; b < blocks.length; b++) {
      var B = blocks[b];
      if (!B.el.isConnected) { stale = true; continue; }
      var br = B.el.getBoundingClientRect();
      if (br.bottom < lo - 240 || br.top > hi + 240) continue;
      for (var i = 0; i < B.items.length; i++) {
        var c = B.items[i];
        if (!c.isConnected) { stale = true; continue; }
        var cr = c.getBoundingClientRect();
        if (cr.bottom < lo || cr.top > hi) continue;
        ink(c, rects, cr);
      }
    }
    if (stale) queueScan(200);
    var res = {};
    visMemo = typeof Map === "function" ? new Map() : null;
    var hit = function (box, list, s) {
      for (var j = 0; j < list.length; j++) {
        if (!hits(box, list[j].r) || !painted(list[j].e)) continue;
        if (why[s].length < 4) {
          var e = list[j].e, q = list[j].r;
          why[s].push(e.tagName.toLowerCase() + (e.className && e.className.baseVal == null ? "." + String(e.className).split(" ")[0] : "") +
            "@" + Math.round(q.left) + "," + Math.round(q.top) + "," + Math.round(q.right) + "," + Math.round(q.bottom));
        }
        return true;
      }
      return false;
    };
    why = { l: [], r: [] };
    ["l", "r"].forEach(function (s) {
      res[s] = { w: [false, false, false], n: [false, false, false] };
      ["w", "n"].forEach(function (f) {
        if (f === "w" && geo.base[s] !== "w") { res[s].w = [true, true, true]; return; }
        PARTS[s][f].forEach(function (part, k) {
          var r = part.getBoundingClientRect(), g = f === "w" ? GAP : GAPN;
          var box = { left: s === "l" ? r.left - 4 : r.left - g, right: s === "l" ? r.right + g : r.right + 4, top: r.top - 12, bottom: r.bottom + 12 };
          if (hit(box, fixed, s)) { res[s][f][k] = true; return; }
          /* content moves with the scroll: look ahead by the scroll speed */
          box.top = r.top - look; box.bottom = r.bottom + look;
          if (hit(box, rects, s)) res[s][f][k] = true;
        });
      });
    });
    visMemo = null;
    ["l", "r"].forEach(function (s) { decide(s, res[s]); });
    probeY = scrollPos().y; probeT = now(); forceProbe = false;
    probeMs = Math.round((now() - t0) * 100) / 100;
  }
  function any(a) { return a[0] || a[1] || a[2]; }
  function decide(s, col) {
    var base = geo.base[s], f;
    if (base === "x") f = "x";
    else if (base === "w" && !any(col.w)) {
      /* back up to the wide face only after two clear probes in a row (no flicker at an edge) */
      if (face[s] === "w" || face[s] === "x" || ++upCount[s] >= 2) { f = "w"; upCount[s] = 0; } else f = "n";
    } else { f = "n"; upCount[s] = 0; }
    setFace(s, f, f === "x" ? null : col[f]);
  }
  function setFace(s, f, o) {
    var p = PANEL[s];
    o = o || [true, true, true];
    if (face[s] !== f) { p.classList.remove("is-" + face[s]); p.classList.add("is-" + f); face[s] = f; }
    var parts = f === "x" ? [] : PARTS[s][f];
    for (var k = 0; k < 3; k++) {
      if (parts[k] && parts[k].classList.contains("is-off") !== o[k]) parts[k].classList.toggle("is-off", o[k]);
      off[s][k] = !!o[k];
    }
    var scanOn = f !== "x" && !any(o);
    if (p.classList.contains("is-scan") !== scanOn) p.classList.toggle("is-scan", scanOn);
  }

  /* ---------------------------------------------------------------- modal / overlay detection */
  /* a class token that says an overlay is open: jwx-*-open / *-active..., or modal-open, palette-is-open, dialog-on... */
  function overlayClass(c) {
    var t = String(c || "").toLowerCase().split(/\s+/);
    for (var i = 0; i < t.length; i++) {
      var k = t[i];
      if (k === "nav-open" || !/-(open|opened|on|active|visible|shown)$/.test(k)) continue;
      if (k.indexOf("jwx-") === 0 || /palette|modal|dialog|lightbox|overlay|cmdk|scope/.test(k)) return true;
    }
    return false;
  }
  function shown(e) {
    if (e.hidden || (e.closest && e.closest("[hidden]"))) return false;
    if (!e.getClientRects().length) return false;
    var cs = getComputedStyle(e);
    return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0.01;
  }
  function modalOpen() {
    if (overlayClass(html.className) || overlayClass(doc.body.className)) return true;
    var l = doc.querySelectorAll('[aria-modal="true"], dialog[open]');
    for (var i = 0; i < l.length; i++) if (!root.contains(l[i]) && shown(l[i])) return true;
    /* sibling features expose window.JWX_<name>.state(); an open / active one counts as an overlay */
    if (now() - handlesT > 2000) {
      handlesT = now(); handles = [];
      try { Object.keys(win).forEach(function (k) { if (k.indexOf("JWX_") === 0 && k !== "JWX_hud") handles.push(k); }); } catch (e) { handles = []; }
    }
    for (i = 0; i < handles.length; i++) {
      var h = win[handles[i]];
      if (!h || typeof h.state !== "function") continue;
      try { var s = h.state(); if (s && (s.open === true || s.active === true || s.closing === true)) return true; } catch (e) { /* ignore */ }
    }
    return false;
  }

  /* ---------------------------------------------------------------- readouts */
  function scrollPos() {
    var L = win.lenis || (win.JW && win.JW.lenis);
    if (L && typeof L.scroll === "number" && L.limit > 0) return { y: L.scroll, max: L.limit };
    return { y: scrollY0, max: maxScroll };
  }
  function setChapter(e) {
    if (!e || e === chap.el) return;
    var all = doc.querySelectorAll("[data-chapter]");
    var i = Array.prototype.indexOf.call(all, e);
    var hue = e.getAttribute("data-hue");
    if (!HUES[hue]) { var d = e.querySelector("[data-hue]"); hue = d ? d.getAttribute("data-hue") : "nbi"; }
    if (!HUES[hue]) hue = "nbi";
    chap.el = e; chap.name = e.getAttribute("data-chapter") || ""; chap.idx = i + 1; chap.total = all.length;
    setT(N.ch, chap.name || "\u2014");
    setT([N.idx[0]], pad(chap.idx, 2) + " / " + pad(chap.total, 2));
    setT([N.idx[1]], pad(chap.idx, 2) + "/" + pad(chap.total, 2));
    if (chap.hue !== hue) { root.classList.remove("jwx-hud--" + chap.hue); root.classList.add("jwx-hud--" + hue); chap.hue = hue; }
    forceProbe = true;
    clearTimeout(chapT); chapT = setTimeout(function () { queueScan(0); }, 500);
  }
  function update(t, dt) {
    var sp = scrollPos();
    var dy = sp.y - lastY; lastY = sp.y;
    vel = vel * 0.5 + (dt > 0 ? dy / (dt / 1000) : 0) * 0.5;
    var p = sp.max > 0 ? clamp01(sp.y / sp.max) : 0;
    var d = (p * MM).toFixed(1); if (d.length < 5) d = pad(d, 5);
    setT(N.depth, d);
    if (Math.abs(p - lastMk.l) > 0.0004) { lastMk.l = p; var tf = "translateY(" + (p * 100).toFixed(2) + "%)"; MK.l.forEach(function (m) { m.style.transform = tf; }); }
    if (ptr.x >= 0 && geo.vw) {
      var nx = clamp01(ptr.x / geo.vw), ny = clamp01(ptr.y / geo.vh);
      setT(N.x, nx.toFixed(3)); setT(N.y, ny.toFixed(3));
      if (Math.abs(ny - lastMk.r) > 0.0004) { lastMk.r = ny; var tr = "translateY(" + (ny * 100).toFixed(2) + "%)"; MK.r.forEach(function (m) { m.style.transform = tr; }); }
    }
    if (!RM) {
      setT(N.frm, pad(frames % 1000000, 6));
      if (hz) setT(N.hz, String(Math.round(hz)));
      phase = (t / 1000 * LUMEN_RATE) % 1;
      setT(N.ph, phase.toFixed(3));
    }
  }
  function check() {
    checkQ = 0;
    if (!st.running) return;
    var m = modalOpen();
    if (m !== st.modal) { st.modal = m; applyVis(); }
    if (!st.shown) return;
    var t = now();
    if (t - docHT > 2000) { docHT = t; maxScroll = Math.max(0, doc.documentElement.scrollHeight - geo.vh); }
    if (!chap.el) pickChapter();
    if (!scanT) scan();   /* the first reveal waits for the first scan (one-off, a few ms) */
    var y = scrollPos().y;
    if (Math.abs(y - probeY) > 2) movedT = t;
    /* while scrolling: every update; for 2.5 s after (reveals, pinned scenes settling): 3 Hz; then 1 Hz */
    if (forceProbe || Math.abs(y - probeY) > 2 || t - probeT > (t - movedT < 2500 ? 300 : 1000)) probe();
    if (t - scanT > 5000 && Math.abs(y - scanY) > geo.vh * 0.5) queueScan(0);
  }
  /* the chapter whose box contains the viewport centre (used before the observer has reported) */
  function pickChapter() {
    var all = doc.querySelectorAll("[data-chapter]"), mid = geo.vh / 2, pick = null;
    for (var i = 0; i < all.length; i++) { var r = all[i].getBoundingClientRect(); if (r.top <= mid && r.bottom >= mid) pick = all[i]; }
    if (pick) setChapter(pick);
  }

  /* ---------------------------------------------------------------- loop */
  function frame(t) {
    raf = 0;
    if (!st.running) return;
    raf = requestAnimationFrame(frame);
    frames++; hzN++;
    if (!hzT) hzT = t;
    else if (t - hzT >= 500) { hz = (hzN - 1) * 1000 / (t - hzT); hzT = t; hzN = 1; }
    if (t - lastUpd < 95) return;
    var dt = lastUpd ? t - lastUpd : 100; lastUpd = t;
    if (st.shown) update(t, dt);
    if (!checkQ) checkQ = setTimeout(check, 0);   /* layout reads after this frame has painted */
  }
  function pump() {   /* reduced motion: refresh on input, at most every 100 ms */
    if (pumpT || !st.running) return;
    pumpT = setTimeout(function () { pumpT = 0; if (!st.running) return; var t = now(); update(t, 100); check(); }, 100);
  }
  function measureRate() {   /* reduced motion: one short rAF sample for the rate readout, then static values */
    var n = 0, t0 = 0;
    var step = function (t) {
      if (!t0) t0 = t;
      if (++n < 31) { requestAnimationFrame(step); return; }
      hz = 30 * 1000 / (t - t0); frames = n;
      setT(N.hz, String(Math.round(hz))); setT(N.frm, pad(frames, 6));
      setT(N.ph, ((t / 1000 * LUMEN_RATE) % 1).toFixed(3));
    };
    requestAnimationFrame(step);
  }

  function start() {
    if (st.running) return;
    st.running = true;
    layout();
    lastUpd = 0; hzT = 0; hzN = 0;
    unbind.push(listen(win, "scroll", function () { scrollY0 = win.scrollY; if (RM) pump(); }, { passive: true }));
    unbind.push(listen(win, "pointermove", function (e) { ptr.x = e.clientX; ptr.y = e.clientY; if (RM) pump(); }, { passive: true }));
    unbind.push(listen(win, "resize", function () {
      if (!root.classList.contains("is-sizing")) root.classList.add("is-sizing");
      clearTimeout(resizeT);
      resizeT = setTimeout(function () {
        if (st.running) { layout(); if (st.shown) probe(); queueScan(200); }
        root.classList.remove("is-sizing");
      }, 180);
    }));
    if ("IntersectionObserver" in win) {
      var live = [];
      io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var i = live.indexOf(e.target);
          if (e.isIntersecting && i < 0) live.push(e.target); else if (!e.isIntersecting && i >= 0) live.splice(i, 1);
        });
        /* innermost / last in document order wins */
        var pick = null;
        live.forEach(function (n) { if (!pick || (pick.compareDocumentPosition(n) & 4)) pick = n; });
        if (pick) setChapter(pick);
      }, { rootMargin: "-50% 0px -50% 0px", threshold: 0 });
      Array.prototype.forEach.call(doc.querySelectorAll("[data-chapter]"), function (n) { io.observe(n); });
    }
    if (RM) {
      unbind.push(listen(doc, "keydown", pump, true));
      unbind.push(listen(doc, "click", pump, true));
      slowT = setInterval(function () { if (!pumpT) { update(now(), 100); check(); } }, 1000);
      measureRate();
      setTimeout(pump, 0);
    } else {
      /* the dial follows performance.now() * LUMEN_RATE, the same clock as the readout */
      var period = 1 / LUMEN_RATE, ph0 = (now() / 1000 * LUMEN_RATE) % 1;
      RINGS.forEach(function (g) { g.style.animationDelay = (-ph0 * period).toFixed(3) + "s"; });
      raf = requestAnimationFrame(frame);
    }
    queueScan(300);
  }
  function stop() {
    if (!st.running) return;
    st.running = false;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    clearTimeout(checkQ); checkQ = 0; clearTimeout(pumpT); pumpT = 0; clearInterval(slowT); slowT = 0;
    clearTimeout(resizeT); root.classList.remove("is-sizing"); clearTimeout(scanQ); scanQ = 0; clearTimeout(chapT);
    unbind.forEach(function (f) { f(); }); unbind = [];
    if (io) { io.disconnect(); io = null; }
    chap.el = null;
    setFace("l", "x"); setFace("r", "x");   /* a restart shows nothing until the first probe has decided */
  }
  function applyVis() {
    var active = st.night && st.wide && st.visible && !st.printing && !st.closed;
    if (active) start(); else stop();
    root.hidden = !active;
    var show = active && st.ready && !st.menu && !st.modal;
    var was = st.shown;
    st.shown = show;
    root.classList.toggle("is-off", active && !show);
    if (show && !was) {
      forceProbe = true; probeY = -1e9;
      if (!root.classList.contains("is-in")) {
        /* first reveal: let one frame style the hidden state, then fade in */
        requestAnimationFrame(function () { requestAnimationFrame(function () { if (st.shown) root.classList.add("is-in"); }); });
      }
      if (st.running) { update(now(), 100); if (!checkQ) checkQ = setTimeout(check, 0); }
      queueScan(120);
    }
  }

  /* ---------------------------------------------------------------- wiring */
  doc.addEventListener("themechange", function (e) {
    var th = e && e.detail && e.detail.theme;
    st.night = th ? th !== "day" : html.getAttribute("data-theme") !== "day";
    applyVis();
  });
  if (typeof MutationObserver === "function") {
    new MutationObserver(function () {
      var n = html.getAttribute("data-theme") !== "day", m = html.classList.contains("nav-open");
      if (n !== st.night || m !== st.menu) { st.night = n; st.menu = m; applyVis(); }
    }).observe(html, { attributes: true, attributeFilter: ["class", "data-theme"] });
  }
  onMq(mWide, function () { st.wide = !!mWide.matches; applyVis(); });
  doc.addEventListener("visibilitychange", function () { st.visible = !doc.hidden; applyVis(); });
  win.addEventListener("beforeprint", function () { st.printing = true; applyVis(); });
  win.addEventListener("afterprint", function () { st.printing = false; applyVis(); });
  if (win.ScrollTrigger && win.ScrollTrigger.addEventListener) {
    try { win.ScrollTrigger.addEventListener("refresh", function () { docHT = 0; if (st.running) { layout(); queueScan(100); } }); } catch (e) { /* older GSAP */ }
  }

  /* fade in after the intro: core.js runs JW.onReady callbacks when the loader opens; then wait for it to finish */
  function whenReady(cb) {
    var go = function () {
      var t0 = now();
      (function wait() {
        var L = $(".loader");
        if (!L || L.classList.contains("is-done") || now() - t0 > 6000) setTimeout(cb, 450);
        else setTimeout(wait, 120);
      })();
    };
    var JW = win.JW;
    if (JW && typeof JW.onReady === "function") JW.onReady(go);
    else if (doc.readyState === "complete") go();
    else win.addEventListener("load", go);
  }
  whenReady(function () { st.ready = true; applyVis(); });
  applyVis();

  win.JWX_hud = {
    open: function () { st.closed = false; st.ready = true; applyVis(); return this.state(); },
    close: function () { st.closed = true; applyVis(); return this.state(); },
    probe: function () { if (st.shown) probe(); return this.state(); },
    scan: function () { if (st.shown) scan(); return this.state(); },
    state: function () {
      var rect = function (s) {
        if (face[s] === "x") return null;
        var f = PANEL[s].querySelector(".jwx-hud__f--" + face[s]).getBoundingClientRect();
        return { left: Math.round(f.left), top: Math.round(f.top), right: Math.round(f.right), bottom: Math.round(f.bottom) };
      };
      return {
        active: st.running, shown: st.shown, ready: st.ready, night: st.night, wide: st.wide, visible: st.visible,
        menu: st.menu, modal: st.modal, closed: st.closed, printing: st.printing, reduced: RM, lang: ZH ? "zh" : "en",
        face: { l: face.l, r: face.r }, base: { l: geo.base.l, r: geo.base.r }, off: { l: off.l.slice(), r: off.r.slice() },
        chapter: { name: chap.name, idx: chap.idx, total: chap.total, hue: chap.hue },
        depth: N.depth[0].nodeValue, cursor: [N.x[0].nodeValue, N.y[0].nodeValue], frames: frames, hz: Math.round(hz),
        phase: N.ph[0].nodeValue, intruders: intruders, blocks: blocks.length, why: { l: why.l.slice(), r: why.r.slice() }, scanMs: scanMs, probeMs: probeMs, probes: probes,
        geo: { vw: geo.vw, vh: geo.vh, top: geo.top, height: geo.height, R: geo.R, colL: geo.colL, colR: geo.colR, W: { l: geo.W.l, r: geo.W.r } },
        rect: { l: rect("l"), r: rect("r") }
      };
    }
  };
})();
