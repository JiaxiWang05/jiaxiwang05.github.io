/* home.js: the homepage score (spec §7). LIGHT SOURCE, package B.
   1 hero (intro, pin, burst hand-off, drag / click / hold / keyboard)   2 statement illumination
   3 currently peek   4 EndoWAM horizon monitor   5 pinned horizontal gallery   6 numbers extras
   7 experience dock   8 beyond spotlight. Every piece is optional: missing markup never throws. */
(function () {
  "use strict";
  var JW = window.JW;
  if (!JW) return;
  var gsap = window.gsap || null;
  var ST = gsap && window.ScrollTrigger ? window.ScrollTrigger : null;
  var reduced = JW.reduced, fine = JW.fine;
  var E = JW.ease || { s: "expo.out", l: "expo.inOut", v: "back.out(1.6)" };
  var doc = document;

  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smoothstep(a, b, x) { var t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function f1(v) { return (Math.round(v * 10) / 10).toString(); }
  function mq(q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } }
  function safe(fn) { return function () { try { return fn.apply(this, arguments); } catch (e) { if (window.console) console.warn("[home]", e); } }; }
  function noop() {}
  var NOSCOPE = { live: false, setAdvance: noop, setBurst: noop, setTarget: noop, setHold: noop, setDay: noop, setPointer: noop, pause: noop, resume: noop };
  function mountScope(lens, opts) { return lens && window.JWScope ? window.JWScope.mount(lens, opts) : NOSCOPE; }
  function drawFrac(p, a, b) {
    if (!p) return;
    var v = Math.max(0, b - a);
    if (v <= 0.0005) { p.style.opacity = "0"; return; }
    p.style.opacity = "";
    p.style.strokeDasharray = v.toFixed(4) + " 2";
    p.style.strokeDashoffset = (-a).toFixed(4);
  }
  function fontsReady(cap) {
    return new Promise(function (resolve) {
      var done = false, fin = function () { if (!done) { done = true; resolve(); } };
      setTimeout(fin, cap || 800);
      try { if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(fin, fin); else fin(); } catch (e) { fin(); }
    });
  }
  function explainClose(fig) { if (JW.explain && fig) JW.explain.close(fig); }
  function cursor(label) { if (JW.cursor && JW.cursor.force) JW.cursor.force(label); }

  /* ================================================================ 1. HERO (§7.1) */
  function initHero() {
    var hero = $(".hero");
    if (!hero) return;
    var fig = $(".scope", hero), stage = $(".scope__stage", hero), lens = $(".scope__lens", hero), hud = $(".scope__hud", hero);
    var halo = $(".scope__halo", hero), handle = $(".scope__handle", hero), hint = $(".scope__hint", hero), legend = $(".scope__legend", hero);
    var name = $(".hero__name", hero), aff = $(".hero__aff", hero), role = $(".hero__role", hero), fact = $(".hero__fact", hero);
    var ctas = $$(".hero__ctas > *", hero);
    var scope = mountScope(lens, { role: "hero", oct: 4 });
    if (!gsap || !fig) { if (name) name.classList.add("is-split"); return; }

    /* the HUD overflows the lens by design (viewBox -34..594 over 0..560); a global svg max-width would squash it */
    if (hud) { hud.style.maxWidth = "none"; hud.style.maxHeight = "none"; }
    var tgt = hud && $(".hud-target", hud);
    var plan = hud ? $$(".hud-plan .hud-case, .hud-plan .hud-path", hud) : [];
    var wps = hud ? $$(".hud-plan .wp", hud) : [];
    var leader = hud && $(".note--target .leader", hud);
    var notes = hud ? $$(".note", hud) : [];
    var holdRing = hud && $(".hud-hold", hud);
    var solidRings = hud ? $$(".hud-ring:not(.hud-ring--dash), .hud-tick", hud) : [];
    var dashRings = hud ? $$(".hud-ring--dash", hud) : [];
    var FR = [0.10, 0.30, 0.50, 0.70, 0.86];
    var S = { x: 342, y: 238, drawn: 1, consumed: 0, p: 0, hold: 0, extra: 0 };
    var pop = gsap.parseEase("back.out(3)") || function (t) { return t; };
    var m = tgt && /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(tgt.getAttribute("transform") || "");
    if (m) { S.x = +m[1]; S.y = +m[2]; }

    plan.forEach(function (p) { p.setAttribute("pathLength", "1"); });
    if (holdRing) { holdRing.setAttribute("pathLength", "1"); holdRing.style.opacity = "0"; }
    wps.forEach(function (w) { w.setAttribute("cx", "0"); w.setAttribute("cy", "0"); });
    if (wps.length) gsap.set(wps, { transformOrigin: "50% 50%" });
    if (tgt) gsap.set(tgt, { x: S.x, y: S.y, transformOrigin: "50% 50%" });
    if (notes.length) gsap.set(notes, { transformOrigin: "0% 0%" });

    /* geometry */
    function bez(x, y) {
      var P = [[258, 520], [232, 400], [x - 12, y + 84], [x, y + 8]], pts = [], acc = [0], N = 48;
      for (var i = 0; i <= N; i++) {
        var t = i / N, u = 1 - t;
        var px = u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0];
        var py = u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1];
        pts.push([px, py]);
        if (i) acc.push(acc[i - 1] + Math.hypot(px - pts[i - 1][0], py - pts[i - 1][1]));
      }
      var L = acc[N];
      return function (f) {
        var d = f * L, j = 1;
        while (j < N && acc[j] < d) j++;
        var k = (d - acc[j - 1]) / ((acc[j] - acc[j - 1]) || 1);
        return { x: pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * k, y: pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * k };
      };
    }
    function hudMap() {
      if (!hud) return null;
      var hr = hud.getBoundingClientRect(), vb = hud.viewBox && hud.viewBox.baseVal;
      if (!hr.width || !vb || !vb.width) return null;
      return { k: hr.width / vb.width, cx: hr.left + hr.width / 2, cy: hr.top + hr.height / 2, ux: vb.x + vb.width / 2, uy: vb.y + vb.height / 2 };
    }
    function svgToUv(x, y) {
      var h = hudMap(), lr = lens ? lens.getBoundingClientRect() : null;
      if (!h || !lr || !lr.width) return [(x - 280) / 560, -(y - 280) / 560];
      var px = h.cx + (x - h.ux) * h.k, py = h.cy + (y - h.uy) * h.k;
      return [(px - (lr.left + lr.width / 2)) / lr.width, -(py - (lr.top + lr.height / 2)) / lr.width];
    }
    function placeHandle() {
      if (!handle || !stage) return;
      var h = hudMap(), sr = stage.getBoundingClientRect();
      if (!h || !sr.width) return;
      var px = h.cx + (S.x - h.ux) * h.k, py = h.cy + (S.y - h.uy) * h.k;
      handle.style.left = (50 + (px - (sr.left + sr.width / 2)) / sr.width * 100).toFixed(3) + "%";
      handle.style.top = (50 + (py - (sr.top + sr.height / 2)) / sr.height * 100).toFixed(3) + "%";
    }
    function renderPlan() {
      plan.forEach(function (p) { drawFrac(p, S.consumed, S.drawn); });
      wps.forEach(function (w, i) {
        var v = pop(clamp01((S.drawn - FR[i]) / 0.14)) * clamp01((FR[i] - S.consumed) / 0.05);
        gsap.set(w, { scale: v, opacity: v > 0.01 ? 1 : 0 });
      });
    }
    function placeTarget(x, y, skipUv) {
      S.x = x; S.y = y;
      if (tgt) gsap.set(tgt, { x: x, y: y });
      var d = "M258 520C232 400 " + f1(x - 12) + " " + f1(y + 84) + " " + f1(x) + " " + f1(y + 8);
      plan.forEach(function (p) { p.setAttribute("d", d); });
      var at = bez(x, y);
      wps.forEach(function (w, i) { var q = at(FR[i]); gsap.set(w, { x: q.x, y: q.y }); });
      if (leader) leader.setAttribute("d", "M" + f1(x + 36) + " " + f1(y - 40) + "L452 70h110");
      placeHandle();
      var uv = skipUv ? [(x - 280) / 560, -(y - 280) / 560] : svgToUv(x, y);
      scope.setTarget(uv[0], uv[1]);
    }
    var lockT = 0;
    /* lock-on ripples: two thin rings in the target colour expand from the bracket (HUD only, aria-hidden) */
    var ripples = [];
    if (hud && tgt && !reduced) {
      for (var ri = 0; ri < 2; ri++) {
        var rc = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
        rc.setAttribute("class", "hud-ripple"); rc.setAttribute("r", "30"); rc.setAttribute("fill", "none");
        rc.style.stroke = "var(--hud-target)"; rc.style.strokeWidth = "1.5"; rc.style.opacity = "0"; rc.style.pointerEvents = "none";
        rc.style.vectorEffect = "non-scaling-stroke";
        hud.insertBefore(rc, tgt);
        ripples.push(rc);
      }
    }
    function ripple(big) {
      if (!ripples.length) return;
      ripples.forEach(function (rc, i) {
        gsap.killTweensOf(rc);
        rc.setAttribute("cx", f1(S.x)); rc.setAttribute("cy", f1(S.y));
        gsap.fromTo(rc, { attr: { r: 34 }, opacity: big ? 0.95 : 0.75 }, { attr: { r: big ? 128 : 92 }, opacity: 0, duration: big ? 1.1 : 0.85, delay: i * 0.16, ease: "power2.out" });
      });
    }
    function lock(big) {
      fig.classList.add("is-locked");
      clearTimeout(lockT);
      lockT = setTimeout(function () { fig.classList.remove("is-locked"); }, 600);
      if (!tgt || reduced) return;
      gsap.fromTo(tgt, { scale: big ? 1.4 : 1.25 }, { scale: 1, duration: 0.5, ease: E.v, overwrite: "auto" });
      ripple(big);
    }
    placeTarget(S.x, S.y, true);
    window.addEventListener("resize", function () { placeHandle(); });

    /* ---- intro (on JW.onReady; same choreography, plus the HUD lock-on so the first frame is complete) ---- */
    var chars = [];
    if (name && (reduced || !window.SplitText)) name.classList.add("is-split");
    var introDone = reduced;
    if (!reduced) {
      S.drawn = 0;
      renderPlan();
      var I = gsap.timeline({ paused: true, onComplete: function () { introDone = true; } });
      I.fromTo(fig, { clipPath: "circle(0% at 50% 50%)", scale: 1.15, rotation: -20 },
        { clipPath: "circle(75% at 50% 50%)", scale: 1, rotation: 0, duration: 1.6, ease: E.s, onComplete: function () { fig.style.clipPath = ""; placeHandle(); placeTarget(S.x, S.y); } }, 0);
      if (halo) I.fromTo(halo, { opacity: 0 }, { opacity: 1, duration: 1.6, ease: "power1.out" }, 0.2);
      if (aff) I.fromTo(aff, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: E.s }, 0.3);
      if (role) I.fromTo(role, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, ease: E.s }, 0.55);
      if (fact) I.fromTo(fact, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: E.s }, 0.7);
      if (ctas.length) I.fromTo(ctas, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, ease: E.v, stagger: 0.07 }, 0.75);
      if (solidRings.length && window.DrawSVGPlugin) I.fromTo(solidRings, { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.6, ease: E.s, stagger: 0.05, clearProps: "strokeDasharray,strokeDashoffset" }, 0.4);
      if (dashRings.length) I.fromTo(dashRings, { opacity: 0 }, { opacity: 1, duration: 1.2, ease: "power1.out" }, 0.6);
      I.to(S, { drawn: 1, duration: 1.1, ease: "power1.inOut", onUpdate: renderPlan }, 1.0);
      if (tgt) I.fromTo(tgt, { scale: 2.4, rotation: 45, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.7, ease: E.v, onComplete: function () { lock(false); } }, 1.7);
      if (notes.length) I.fromTo(notes, { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.6, ease: E.s, stagger: 0.06 }, 2.0);
      if (legend) I.fromTo(legend, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.6, ease: E.s }, 1.9);
      if (hint) I.fromTo(hint, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power1.out" }, 1.4);
      JW.onReady(function () {
        fontsReady(1100).then(function () {
          if (name && window.SplitText) {
            try { chars = new window.SplitText(name, { type: "words,chars", wordsClass: "wd", charsClass: "ch" }).chars; } catch (e) { chars = []; }
            if (chars.length) {
              gsap.set(chars, { yPercent: 110, rotateX: -40, opacity: 0, transformOrigin: "50% 100%" });
              I.to(chars, { yPercent: 0, rotateX: 0, opacity: 1, stagger: 0.018, duration: 1, ease: E.s }, 0.1);
              nameHover();
            }
          }
          if (name) name.classList.add("is-split");
          I.play(0);
        });
      });
    } else renderPlan();

    /* hero name: chars lean toward the pointer (fine pointer, after the intro) */
    function nameHover() {
      if (!chars.length || !fine || reduced) return;
      var lift = null, centres = null;
      name.addEventListener("pointerenter", function () {
        if (!introDone) return;
        if (!lift) lift = chars.map(function (c) { return gsap.quickTo(c, "yPercent", { duration: 0.5, ease: "power3" }); });
        centres = chars.map(function (c) { var r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
      });
      name.addEventListener("pointermove", function (e) {
        if (!introDone || !centres || !lift) return;
        chars.forEach(function (c, i) { var d = Math.hypot(e.clientX - centres[i][0], e.clientY - centres[i][1]); lift[i](-8 * Math.max(0, 1 - d / 160)); });
      });
      name.addEventListener("pointerleave", function () { if (introDone && lift) lift.forEach(function (f) { f(0); }); });
    }

    /* ---- pin, fly-through and burst (§7.1) ---- */
    var relocked = false, hintGone = false, relST = null;
    function onPin(p) {
      S.p = p;
      scope.setAdvance(p + S.extra);
      var b = clamp01((p - 0.8) / 0.2);
      scope.setBurst(b);
      if (JW.pool) JW.pool.set("coil", relST && relST.progress > 0 ? 0 : b, "hero");
      S.consumed = clamp01((p - 0.05) / 0.7) * 0.8;
      renderPlan();
      if (p > 0.5 && JW.explain && JW.explain.isOpen(fig)) explainClose(fig);
      if (p >= 0.42 && !relocked) { relocked = true; lock(true); } else if (p < 0.36) relocked = false;
      if (hint && introDone) {
        if (p > 0.02 && !hintGone) { hintGone = true; gsap.to(hint, { opacity: 0, duration: 0.3, overwrite: "auto" }); }
        else if (p <= 0.01 && hintGone) { hintGone = false; gsap.to(hint, { opacity: 1, duration: 0.4, overwrite: "auto" }); }
      }
    }
    if (!reduced && ST) {
      var mm = gsap.matchMedia();
      mm.add({ desk: "(min-width: 761px)", phone: "(max-width: 760px)" }, function (c) {
        var desk = c.conditions.desk;
        var text = [aff, name, role, fact].filter(Boolean).concat(ctas);
        var tl = gsap.timeline({
          defaults: { ease: "none" },
          onUpdate: function () { onPin(tl.progress()); },
          scrollTrigger: {
            trigger: hero, start: "top top", end: desk ? "+=180%" : "+=100%", pin: true, scrub: 0.8, anticipatePin: 1, refreshPriority: 10,
            onLeave: function () { if (JW.pool && !(relST && relST.progress > 0)) JW.pool.hold("coil"); if (JW.toast) JW.toast.maybeShow("hero"); },
            onEnterBack: function () { if (JW.pool) JW.pool.release("coil"); },
            onToggle: function (s) { fig.style.willChange = s.isActive ? "transform" : ""; }
          }
        });
        tl.to({}, { duration: 1 }, 0);
        if (desk) {
          if (aff) tl.fromTo(aff, { yPercent: 0 }, { yPercent: -8, duration: 0.62, immediateRender: false }, 0);
          if (name) tl.fromTo(name, { yPercent: 0 }, { yPercent: -18, duration: 0.62, immediateRender: false }, 0);
          [role, fact].filter(Boolean).forEach(function (el) { tl.fromTo(el, { yPercent: 0 }, { yPercent: -30, duration: 0.62, immediateRender: false }, 0); });
          if (ctas.length) tl.fromTo(ctas, { yPercent: 0 }, { yPercent: -36, duration: 0.62, immediateRender: false }, 0);
        }
        if (text.length) tl.fromTo(text, { opacity: 1 }, { opacity: 0, duration: 0.17, immediateRender: false }, 0.45);
        tl.fromTo(fig, { scale: 1, xPercent: 0 }, { scale: 1.25, xPercent: desk ? -30 : 0, duration: 0.8, immediateRender: false }, 0);
        if (hud) tl.fromTo(hud, { opacity: 1 }, { opacity: 0, duration: 0.12, immediateRender: false }, 0.78);
        tl.to(fig, { scale: desk ? 7 : 5, duration: 0.2, ease: "power2.in" }, 0.8);
        if (halo) tl.fromTo(halo, { opacity: 1 }, { opacity: 0, duration: 0.2, immediateRender: false }, 0.8);
        tl.fromTo(fig, { opacity: 1 }, { opacity: 0, duration: 0.04, immediateRender: false }, 0.96);
        return function () { fig.style.willChange = ""; };
      });
      var prof = $(".statement-stage");
      if (prof) {
        var rel = function (s) { if (JW.pool && s.progress > 0) { JW.pool.release("coil"); JW.pool.set("coil", 0, "hero"); } };
        relST = ST.create({ trigger: prof, start: "center center", end: "bottom top", onUpdate: rel, onRefresh: rel, onLeave: rel });
      }
    }

    /* ---- interactivity: drag, click to place, hold, keyboard (§7.1) ---- */
    if (!hud || !stage) return;
    function enabled() { return S.p <= 0.5; }
    function toSvg(cx, cy) {
      var mtx = hud.getScreenCTM();
      if (!mtx) return { x: S.x, y: S.y };
      var pt = hud.createSVGPoint(); pt.x = cx; pt.y = cy;
      var r = pt.matrixTransform(mtx.inverse());
      return { x: r.x, y: r.y };
    }
    function clampT(p) { var dx = p.x - 280, dy = p.y - 280, d = Math.hypot(dx, dy); if (d > 230) { p.x = 280 + dx / d * 230; p.y = 280 + dy / d * 230; } return p; }
    var moveTw = null, goal = { x: S.x, y: S.y };
    function moveTo(x, y, dur, ease, after) {
      goal.x = x; goal.y = y;
      if (moveTw) { moveTw.kill(); moveTw = null; }
      if (reduced || !dur) { placeTarget(x, y); if (after) after(); return; }
      var o = { x: S.x, y: S.y };
      moveTw = gsap.to(o, { x: x, y: y, duration: dur, ease: ease, onUpdate: function () { placeTarget(o.x, o.y); }, onComplete: function () { moveTw = null; if (after) after(); } });
    }

    var dragging = false, grab = null;
    if (handle) {
      handle.addEventListener("pointerdown", function (e) {
        if (!enabled() || (e.button && e.button > 0)) return;
        e.preventDefault(); e.stopPropagation();
        try { handle.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
        dragging = true;
        if (moveTw) { moveTw.kill(); moveTw = null; }
        var p0 = toSvg(e.clientX, e.clientY);
        grab = { dx: S.x - p0.x, dy: S.y - p0.y };
        fig.classList.add("is-dragging");
        fig._jwBusy = true;
        explainClose(fig);
        cursor(JW.t("cursor.drag"));
      });
      handle.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var p = toSvg(e.clientX, e.clientY);
        p.x += grab.dx; p.y += grab.dy;
        clampT(p);
        goal.x = p.x; goal.y = p.y;
        placeTarget(p.x, p.y);
      });
      var endDrag = function () {
        if (!dragging) return;
        dragging = false;
        fig.classList.remove("is-dragging");
        cursor(null);
        setTimeout(function () { fig._jwBusy = false; }, 80);
        lock(false);
      };
      handle.addEventListener("pointerup", endDrag);
      handle.addEventListener("pointercancel", endDrag);
      handle.addEventListener("lostpointercapture", endDrag);
    }

    var holding = false, holdT = 0, holdFull = false, decayTw = null, down = null, holdTimer = 0;
    function holdTick(time, dms) {
      var dt = Math.min(0.05, (dms || 16) / 1000);
      holdT += dt;
      S.hold = Math.min(1, holdT / 2);
      S.extra += dt * 0.35;
      scope.setHold(S.hold);
      scope.setAdvance(S.p + S.extra);
      drawFrac(holdRing, 0, S.hold);
      if (S.hold >= 1 && !holdFull) { holdFull = true; lock(true); }
    }
    function startHold() {
      if (holding || !enabled()) return;
      holding = true; holdT = 0; holdFull = false;
      if (decayTw) { decayTw.kill(); decayTw = null; }
      fig.classList.add("is-holding");
      fig._jwBusy = true;
      explainClose(fig);
      cursor(JW.t("cursor.hold"));
      gsap.ticker.add(holdTick);
    }
    function endHold() {
      if (!holding) return;
      holding = false;
      gsap.ticker.remove(holdTick);
      fig.classList.remove("is-holding");
      cursor(null);
      setTimeout(function () { fig._jwBusy = false; }, 80);
      decayTw = gsap.to(S, { extra: 0, hold: 0, duration: reduced ? 0.01 : 1.2, ease: "power2.out", onUpdate: function () {
        scope.setAdvance(S.p + S.extra); scope.setHold(S.hold); drawFrac(holdRing, 0, S.hold);
      } });
    }
    stage.addEventListener("pointerdown", function (e) {
      if (!enabled() || (e.button && e.button > 0)) return;
      if (e.target.closest && e.target.closest(".scope__handle, a, button")) return;
      down = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType, moved: false };
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () { if (down) startHold(); }, 280);
    });
    stage.addEventListener("pointermove", function (e) { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true; });
    window.addEventListener("pointerup", function (e) {
      if (!down) return;
      var d = down; down = null;
      clearTimeout(holdTimer);
      if (holding) { endHold(); return; }
      if ((d.type === "mouse" || d.type === "pen") && !d.moved && performance.now() - d.t < 250 && enabled()) {
        var p = toSvg(e.clientX, e.clientY);
        if (Math.hypot(p.x - 280, p.y - 280) <= 280) {
          clampT(p);
          moveTo(p.x, p.y, 0.6, E.v, function () { fig.classList.add("is-locked"); clearTimeout(lockT); lockT = setTimeout(function () { fig.classList.remove("is-locked"); }, 600); if (!reduced) ripple(false); });
        }
      }
    });
    window.addEventListener("pointercancel", function () { down = null; clearTimeout(holdTimer); if (holding) endHold(); });
    stage.addEventListener("contextmenu", function (e) { if (holding || down) e.preventDefault(); });
    stage.addEventListener("keydown", function (e) {
      if (!enabled()) return;
      var k = e.key, step = e.shiftKey ? 36 : 12, dx = 0, dy = 0;
      if (k === "ArrowLeft") dx = -step; else if (k === "ArrowRight") dx = step; else if (k === "ArrowUp") dy = -step; else if (k === "ArrowDown") dy = step;
      if (dx || dy) { e.preventDefault(); var p = clampT({ x: goal.x + dx, y: goal.y + dy }); moveTo(p.x, p.y, 0.22, "power2.out"); return; }
      if (k === "Enter") { e.preventDefault(); lock(true); return; }
      if (k === " " || k === "Spacebar") { e.preventDefault(); if (!e.repeat) startHold(); }
    });
    stage.addEventListener("keyup", function (e) { if ((e.key === " " || e.key === "Spacebar") && holding) { e.preventDefault(); endHold(); } });
    stage.addEventListener("blur", function () { if (holding) endHold(); });
  }

  /* ================================================================ 2. STATEMENT (§7.2) */
  var CJK = /[⺀-⿿　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/;
  function segmentWords(root) {
    var seg = null;
    try { seg = window.Intl && Intl.Segmenter ? new Intl.Segmenter("zh", { granularity: "word" }) : null; } catch (e) { seg = null; }
    var out = [], walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var text = node.nodeValue, frag = doc.createDocumentFragment();
      var parts = [];
      if (seg) { var it = seg.segment(text); for (var s of it) parts.push(s.segment); }
      else parts = Array.from(text);
      parts.forEach(function (p) {
        if (!p.trim()) { frag.appendChild(doc.createTextNode(p)); return; }
        var sp = doc.createElement("span"); sp.className = "w"; sp.textContent = p; frag.appendChild(sp); out.push(sp);
      });
      node.parentNode.replaceChild(frag, node);
    });
    return out;
  }
  function initStatement() {
    var st = $(".statement[data-illuminate]");
    if (!st || reduced || !gsap || !ST) return;
    JW.onReady(function () { fontsReady(1500).then(function () { illuminate(st); if (ST) ST.refresh(); }); });
  }
  function illuminate(st) {
    var words = [];
    if (JW.lang === "zh" && CJK.test(st.textContent)) words = segmentWords(st);
    else if (window.SplitText) words = new window.SplitText(st, { type: "words", wordsClass: "w" }).words;
    else return;
    if (!words.length) return;
    var em = $$("em", st);
    gsap.set(words, { "--lit": 0 });
    var mm = gsap.matchMedia();
    mm.add({ desk: "(min-width: 761px)", phone: "(max-width: 760px)" }, function (c) {
      var stageEl = st.closest(".statement-stage") || st;
      var trig = c.conditions.desk ? { trigger: stageEl, start: "top 20%", end: "bottom 80%", scrub: 0.6 } : { trigger: st, start: "top 85%", end: "bottom 45%", scrub: 0.6 };
      var tl = gsap.timeline({ scrollTrigger: trig });
      tl.fromTo(words, { "--lit": 0 }, { "--lit": 1, stagger: 0.1, ease: "none", duration: 0.5 }, 0);
      if (em.length) {
        var inner = em.map(function (e) { return $$(".w", e); }).reduce(function (a, b) { return a.concat(b); }, []);
        if (inner.length) {
          var i0 = words.indexOf(inner[0]);
          tl.fromTo(em, { "--lit": 0 }, { "--lit": 1, ease: "none", duration: 0.5 + 0.1 * (inner.length - 1) }, Math.max(0, i0) * 0.1);
        }
      }
    });
  }

  /* ================================================================ 3. CURRENTLY: cursor peek (§7.3) */
  function initPeek() {
    var rows = $$(".index-item[data-peek]");
    if (!rows.length || !gsap || !fine || !mq("(min-width: 1000px)")) return;
    var peek = doc.createElement("div");
    peek.className = "peek"; peek.setAttribute("aria-hidden", "true");
    var pstage = doc.createElement("div"); pstage.className = "peek__stage";
    peek.appendChild(pstage);
    doc.body.appendChild(peek);
    peek.style.left = "0px"; peek.style.top = "0px"; peek.style.pointerEvents = "none";
    gsap.set(peek, { x: -400, y: -400, clipPath: "circle(0% at 50% 50%)" });
    var xTo = gsap.quickTo(peek, "x", { duration: reduced ? 0.01 : 0.5, ease: "power3" });
    var yTo = gsap.quickTo(peek, "y", { duration: reduced ? 0.01 : 0.5, ease: "power3" });
    var cache = [], lensEls = [], active = null, shown = false, hideT = 0;
    function size() { return peek.offsetWidth || 220; }
    function paintLens(l) {
      if (!window.JWScope || !window.JWScope.snapshot) return;
      var url = window.JWScope.snapshot({ size: 440 });
      if (url) { l.style.backgroundImage = "url(" + url + ")"; l.style.backgroundSize = "cover"; l.style.backgroundPosition = "50% 50%"; }
    }
    doc.addEventListener("themechangeend", function () { lensEls.forEach(paintLens); });
    function content(row) {
      var i = rows.indexOf(row);
      if (cache[i]) return cache[i];
      var nm = row.getAttribute("data-peek");
      var box = doc.createElement("div");
      box.className = "peek__item";
      box.style.cssText = "position:absolute;inset:0;display:none";
      pstage.appendChild(box);
      if (nm === "lens") {
        var l = doc.createElement("div"); l.className = "scope__lens"; l.style.inset = "-16%"; box.appendChild(l);
        paintLens(l); lensEls.push(l);
      } else if (window.JWSpec) {
        box.className += " peek__spec";
        window.JWSpec.build(box, nm, { mini: true });
      }
      cache[i] = box;
      return box;
    }
    function activate(row) {
      clearTimeout(hideT);
      if (active === row && shown) return;
      if (active) active.classList.remove("is-active");
      active = row; row.classList.add("is-active");
      peek.setAttribute("data-hue", row.getAttribute("data-hue") || "nbi");
      cache.forEach(function (b) { if (b) b.style.display = "none"; });
      content(row).style.display = "block";
      if (!shown) {
        shown = true;
        gsap.to(peek, { clipPath: "circle(50% at 50% 50%)", duration: reduced ? 0 : 0.42, ease: E.s, overwrite: "auto" });
      }
    }
    function deactivate(row) {
      if (row && row !== active) return;
      hideT = setTimeout(function () {
        if (active) active.classList.remove("is-active");
        active = null; shown = false;
        gsap.to(peek, { clipPath: "circle(0% at 50% 50%)", duration: reduced ? 0 : 0.24, ease: "power2.in", overwrite: "auto" });
      }, 40);
    }
    function follow(e) { var s = size(); xTo(e.clientX + 24); yTo(e.clientY - s / 2); }
    rows.forEach(function (row) {
      row.addEventListener("pointerenter", function (e) {
        if (e.pointerType !== "mouse") return;
        var s = size();
        if (!shown) { gsap.set(peek, { x: e.clientX + 24, y: e.clientY - s / 2 }); }
        activate(row); follow(e);
      });
      row.addEventListener("pointermove", function (e) { if (e.pointerType === "mouse") follow(e); });
      row.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") deactivate(row); });
      row.addEventListener("focus", function () {
        var fv = true; try { fv = row.matches(":focus-visible"); } catch (er) { fv = true; }
        if (!fv) return;
        var r = row.getBoundingClientRect(), s = size();
        gsap.set(peek, { x: r.right - s, y: r.top + r.height / 2 - s / 2 });
        activate(row);
      });
      row.addEventListener("blur", function () { deactivate(row); });
    });
    window.addEventListener("scroll", function () { if (shown && active && !active.matches(":hover") && doc.activeElement !== active) deactivate(active); }, { passive: true });
  }

  /* ================================================================ 4. MONITOR (§7.4) */
  function initMonitor() {
    var mon = $(".monitor");
    if (!mon || !gsap) return;
    var section = mon.closest(".pubstage") || mon;
    var lens = $(".monitor__lens", mon), svg = $(".monitor__hud", mon), live = $(".mon-live", mon);
    var ghosts = $$(".mon-ghost", mon), paths = $$(".mon-path", mon), fill = $(".monitor__fill", mon);
    var readout = $(".monitor__readout", mon), ticks = $$(".monitor__tick", mon);
    var K = [{ x: 296, y: 236, s: 0.62 }, { x: 326, y: 196, s: 0.8 }, { x: 352, y: 150, s: 1 }];
    paths.forEach(function (p) { p.setAttribute("pathLength", "1"); });
    if (live) gsap.set(live, { x: K[2].x, y: K[2].y, scale: 1, transformOrigin: "50% 50%" });
    if (fill) gsap.set(fill, { transformOrigin: "0% 50%" });
    var motion = !reduced && !!ST && mq("(min-width: 761px)");
    var scope = NOSCOPE, geo = null, armed = true, cur = 1;
    function measure() {
      if (!svg || !lens) { geo = null; return; }
      var sr = svg.getBoundingClientRect(), lr = lens.getBoundingClientRect(), vb = svg.viewBox && svg.viewBox.baseVal;
      if (!sr.width || !lr.width || !vb) { geo = null; return; }
      var k = vb.width / sr.width;
      geo = { cx: (lr.left + lr.width / 2 - sr.left) * k + vb.x, cy: (lr.top + lr.height / 2 - sr.top) * k + vb.y, w: lr.width * k };
    }
    function frame(p) {
      p = clamp01(p); cur = p;
      var a = p <= 0.5 ? K[0] : K[1], b = p <= 0.5 ? K[1] : K[2], f = p <= 0.5 ? p / 0.5 : (p - 0.5) / 0.5;
      var x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, s = a.s + (b.s - a.s) * f;
      if (live) gsap.set(live, { x: x, y: y, scale: s });
      ghosts.forEach(function (g) { var k = parseFloat(g.getAttribute("data-k")) || 0; g.style.opacity = smoothstep(k, k + 0.1, p + 0.0001).toFixed(3); });
      paths.forEach(function (pp) { drawFrac(pp, 0, Math.max(0.001, p)); });
      if (fill) gsap.set(fill, { scaleX: p });
      if (readout) readout.textContent = "t + " + p.toFixed(2) + "k";
      var best = null, bd = 9;
      ticks.forEach(function (t) { var d = Math.abs((parseFloat(t.getAttribute("data-k")) || 0) - p); if (d < bd) { bd = d; best = t; } });
      ticks.forEach(function (t) { var on = t === best; t.classList.toggle("is-active", on); if (on) t.setAttribute("aria-current", "true"); else t.removeAttribute("aria-current"); });
      if (p >= 0.8 && armed) { armed = false; if (live && !reduced) gsap.fromTo(live, { scale: 1.25 * s }, { scale: s, duration: 0.5, ease: E.v, overwrite: "auto" }); }
      else if (p < 0.7) armed = true;
      if (scope.live) {
        if (!geo) measure();
        if (geo) scope.setTarget((x - geo.cx) / geo.w, -(y - geo.cy) / geo.w);
        scope.setAdvance(p * 1.4);
      }
    }
    window.addEventListener("resize", function () { geo = null; });
    if (motion) {
      if (lens && window.JWScope) {
        var mountNow = function () { if (!scope.live) { scope = mountScope(lens, { role: "monitor", oct: 3 }); measure(); frame(cur); } };
        if ("IntersectionObserver" in window) {
          var io = new IntersectionObserver(function (es) { if (es[es.length - 1].isIntersecting) { io.disconnect(); mountNow(); } }, { rootMargin: "50% 0px" });
          io.observe(lens);
        } else mountNow();
      }
      var proxy = { p: 0 };
      var tw = gsap.to(proxy, {
        p: 1, ease: "none", onUpdate: function () { frame(proxy.p); },
        scrollTrigger: { trigger: section, start: "top 55%", end: "bottom 85%", scrub: 0.6, onRefresh: function () { geo = null; } }
      });
      frame(0);
      var jumpTo = function (k, immediate) {
        var st = tw.scrollTrigger;
        if (!st) return;
        var y = st.start + clamp01(k) * (st.end - st.start);
        if (JW.scrollTo) JW.scrollTo(y, { duration: immediate ? 0.35 : 1, immediate: false }); else window.scrollTo(0, y);
      };
      ticks.forEach(function (t) {
        t.addEventListener("click", function () { jumpTo(parseFloat(t.getAttribute("data-k")) || 0); });
      });
      scrubTrack(function (k, dragging) { jumpTo(k, dragging); });
      /* the pointer over the screen leans the lumen's vanishing point (steer), like the hero */
      var screen = $(".monitor__screen", mon);
      if (screen && fine) {
        screen.addEventListener("pointermove", function (e) {
          if (e.pointerType !== "mouse" || !scope.live || !scope.setPointer) return;
          var r = screen.getBoundingClientRect();
          scope.setPointer(((e.clientX - r.left) / r.width - 0.5) * 2, -((e.clientY - r.top) / r.height - 0.5) * 2);
        });
        screen.addEventListener("pointerleave", function () { if (scope.live && scope.setPointer) scope.setPointer(0, 0); });
      }
    } else {
      frame(1);
      /* phone / reduced motion: no live lens, but one still frame of the real shader (rendered once on a
         temporary context when the monitor comes near) replaces the CSS poster, aimed at the t + k bracket */
      if (lens && window.JWScope && window.JWScope.snapshot) {
        var paintStill = function () {
          measure();
          var o = { size: 720, adv: 1.4, time: 3.7 };
          if (geo) { o.tgx = (K[2].x - geo.cx) / geo.w; o.tgy = -(K[2].y - geo.cy) / geo.w; }
          var url = window.JWScope.snapshot(o);
          if (url) { lens.style.backgroundImage = 'url("' + url + '")'; lens.style.backgroundSize = "cover"; lens.style.backgroundPosition = "center"; }
        };
        var stillDone = false;
        var stillNow = function () { if (!stillDone) { stillDone = true; paintStill(); } };
        if ("IntersectionObserver" in window) {
          var sio = new IntersectionObserver(function (es) { if (es[es.length - 1].isIntersecting) { sio.disconnect(); stillNow(); } }, { rootMargin: "60% 0px" });
          sio.observe(lens);
        } else stillNow();
        doc.addEventListener("themechangeend", function () { if (stillDone) paintStill(); });
      }
      var still = null;
      var go = function (k, dragging) {
        k = clamp01(k);
        if (still) { still.kill(); still = null; }
        if (reduced || dragging) { frame(k); return; }
        var o = { p: cur };
        still = gsap.to(o, { p: k, duration: 0.6, ease: E.s, onUpdate: function () { frame(o.p); } });
      };
      ticks.forEach(function (t) {
        t.addEventListener("click", function () { go(parseFloat(t.getAttribute("data-k")) || 0); });
      });
      scrubTrack(go);
    }
    /* the track itself is a scrubber: press anywhere on it (or drag along it) to move along the horizon */
    function scrubTrack(cb) {
      var track = $(".monitor__track", mon), bar = $(".monitor__scrub", mon);
      if (!track || !bar) return;
      var kAt = function (e) { var r = track.getBoundingClientRect(); return clamp01((e.clientX - r.left) / (r.width || 1)); };
      var down = false;
      bar.addEventListener("pointerdown", function (e) {
        if (e.target.closest && e.target.closest(".monitor__tick")) return;
        if (e.button && e.button > 0) return;
        down = true;
        try { bar.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
        cb(kAt(e), false);
      });
      bar.addEventListener("pointermove", function (e) { if (down) cb(kAt(e), true); });
      var up = function () { down = false; };
      bar.addEventListener("pointerup", up); bar.addEventListener("pointercancel", up); bar.addEventListener("lostpointercapture", up);
    }
  }

  /* ================================================================ 5. GALLERY (§7.5) */
  function initGallery() {
    var gal = $(".gallery");
    if (!gal) return;
    var vp = $(".gallery__viewport", gal), track = $(".gallery__track", gal);
    var slides = track ? $$(".slide", track) : [];
    var n = slides.length;
    if (!n) return;
    var ticks = $$(".gallery__ticks i", gal), rolls = $$(".gallery__count .roll b", gal);
    slides.forEach(function (s, i) {
      var card = $(".slide__card", s);
      if (card && !$(".slide__pos", card)) {
        var v = doc.createElement("span"); v.className = "vh slide__pos"; v.textContent = JW.t("gallery.of", { n: i + 1, total: n }) + ". ";
        card.insertBefore(v, card.firstChild);
      }
    });
    var activeIdx = -1, presence = 0, dists = slides.map(function (_, i) { return i ? 1 : 0; });
    /* counter: one numeral at a time. The old one leaves upward and fades before the new one rises in, so two
       numerals never overlap mid-roll (a sizer keeps the box; every numeral is stacked on it) */
    var roll = $(".gallery__count .roll", gal), rollCur = -1;
    if (roll && rolls.length) {
      roll.style.position = "relative";
      var sizer = rolls[0].cloneNode(true);
      sizer.setAttribute("aria-hidden", "true"); sizer.style.visibility = "hidden";
      roll.insertBefore(sizer, roll.firstChild);
      rolls.forEach(function (b) { b.style.position = "absolute"; b.style.left = "0"; b.style.top = "0"; b.style.width = "100%"; b.style.transform = "none"; b.style.opacity = "0"; });
    }
    function showRoll(i) {
      if (!rolls.length || i === rollCur) return;
      var prev = rollCur, dir = prev < 0 ? 0 : (i > prev ? 1 : -1);
      rollCur = i;
      rolls.forEach(function (b, k) {
        if (k === i || k === prev) return;
        if (gsap) { gsap.killTweensOf(b); gsap.set(b, { opacity: 0, yPercent: 0 }); } else b.style.opacity = "0";
      });
      var nb = rolls[i], ob = prev >= 0 ? rolls[prev] : null;
      if (!gsap || reduced || !dir) {
        if (ob) { if (gsap) { gsap.killTweensOf(ob); gsap.set(ob, { opacity: 0, yPercent: 0 }); } else ob.style.opacity = "0"; }
        if (gsap) { gsap.killTweensOf(nb); gsap.set(nb, { opacity: 1, yPercent: 0 }); } else nb.style.opacity = "1";
        return;
      }
      gsap.to(ob, { yPercent: -110 * dir, opacity: 0, duration: 0.26, ease: "power2.in", overwrite: true });
      gsap.fromTo(nb, { yPercent: 110 * dir, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, delay: 0.14, ease: E.s, overwrite: true });
    }
    function setActive(i) {
      if (i === activeIdx || i < 0) return;
      activeIdx = i;
      slides.forEach(function (s, k) {
        s.classList.toggle("is-active", k === i);
        if (k !== i && JW.explain) { var f = $(".fig[data-explain]", s); if (f && JW.explain.isOpen(f)) JW.explain.close(f); }
      });
      ticks.forEach(function (t, k) { t.classList.toggle("is-active", k === i); });
      showRoll(i);
    }
    function pools() {
      if (!JW.pool || reduced) return;
      slides.forEach(function (s, i) { JW.pool.set(s.getAttribute("data-hue"), presence * smoothstep(0.6, 0.15, dists[i]), "gallery"); });
    }
    setActive(0);
    function presenceTrigger(edge) {
      if (!ST || reduced) return null;
      var host = gal.parentElement && gal.parentElement.classList.contains("pin-spacer") ? gal.parentElement : gal;
      var upd = function (s) { presence = smoothstep(0, edge, s.progress) * (1 - smoothstep(1 - edge, 1, s.progress)); pools(); };
      return ST.create({ trigger: host, start: "top center", end: "bottom center", onUpdate: upd, onRefresh: upd });
    }
    if (!gsap) return;
    var mm = gsap.matchMedia();
    mm.add({ pin: "(min-width: 1000px) and (prefers-reduced-motion: no-preference)", native: "(max-width: 999px), (prefers-reduced-motion: reduce)" }, function (c) {
      if (c.conditions.pin && ST) {
        gal.classList.add("is-pinned");
        var layout = [], points = [];
        var setO = slides.map(function (s) { return gsap.quickSetter(s, "opacity"); });
        var setS = slides.map(function (s) { return gsap.quickSetter(s, "scale"); });
        var dist = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };
        var measure = function () {
          var x = gsap.getProperty(track, "x") || 0;
          layout = slides.map(function (s) { var r = s.getBoundingClientRect(); return { c: r.left + r.width / 2 - x, w: r.width || 1 }; });
          var D = dist() || 1;
          points = layout.map(function (l) { return clamp01((l.c - window.innerWidth / 2) / D); });
        };
        /* neighbours never peek in at the edges: a slide is fully lit at the centre, fades out by the time it is
           three quarters of a slide away, and stops taking the pointer once it is faded (focus still reaches it,
           and focusing it scrolls it to the centre) */
        var faded = slides.map(function () { return false; });
        var frame = function () {
          if (!layout.length) return;
          var x = gsap.getProperty(track, "x") || 0, mid = window.innerWidth / 2, best = 0, bd = 9;
          layout.forEach(function (l, i) {
            var d = Math.abs(l.c + x - mid) / l.w, k = 1 - Math.min(1, d);
            dists[i] = d;
            var o = 1 - smoothstep(0.3, 0.74, d);
            setO[i](o < 0.004 ? 0 : o); setS[i](0.94 + 0.06 * k);
            var f = o < 0.05;
            if (f !== faded[i]) { faded[i] = f; slides[i].style.pointerEvents = f ? "none" : ""; }
            if (d < bd) { bd = d; best = i; }
          });
          if (bd < 0.5) setActive(best);
          pools();
        };
        var snapTo = function (v) {
          if (!points.length) return v;
          var best = points[0];
          points.forEach(function (p) { if (Math.abs(p - v) < Math.abs(best - v)) best = p; });
          return best;
        };
        var tween = gsap.to(track, {
          x: function () { return -dist(); }, ease: "none", onUpdate: frame,
          scrollTrigger: {
            trigger: gal, pin: true, scrub: 1, start: "top top", end: function () { return "+=" + dist(); }, invalidateOnRefresh: true, refreshPriority: 5, anticipatePin: 1,
            snap: { snapTo: snapTo, duration: { min: 0.25, max: 0.6 }, ease: "power2.inOut", delay: 0.08, inertia: false },
            onRefresh: function () { measure(); frame(); },
            onToggle: function (s) { track.style.willChange = s.isActive ? "transform" : ""; }
          }
        });
        slides.forEach(function (s, i) {
          var num = $(".slide__num", s), figw = $(".slide__fig", s);
          var cfg = { trigger: s, containerAnimation: tween, start: "left right", end: "right left", scrub: true };
          if (num) gsap.fromTo(num, { xPercent: 20 }, { xPercent: -20, ease: "none", scrollTrigger: cfg });
          if (figw) gsap.fromTo(figw, { xPercent: -12 }, { xPercent: 12, ease: "none", scrollTrigger: { trigger: s, containerAnimation: tween, start: "left right", end: "right left", scrub: true } });
          s.addEventListener("focusin", function () {
            if (vp) vp.scrollLeft = 0;
            var st = tween.scrollTrigger;
            if (!st || !points.length) return;
            JW.scrollTo(st.start + points[i] * (st.end - st.start), { duration: 0.8 });
          });
        });
        measure();
        var pres = presenceTrigger(0.05);
        return function () {
          if (pres) pres.kill();
          gal.classList.remove("is-pinned");
          track.style.willChange = "";
          slides.forEach(function (s) { s.style.pointerEvents = ""; });
          gsap.set(slides, { clearProps: "opacity,scale,transform" });
        };
      }
      /* native snap carousel: the ruler and pools follow the nearest slide; neighbours are dimmed (not hidden,
         so the swipe stays discoverable) */
      if (!vp) return;
      var centres = [];
      var measureN = function () { centres = slides.map(function (s) { return s.offsetLeft + s.offsetWidth / 2; }); };
      var raf = 0;
      var onScroll = function () {
        raf = 0;
        if (!centres.length) measureN();
        var mid = vp.scrollLeft + vp.clientWidth / 2, best = 0, bd = Infinity;
        centres.forEach(function (cx, i) {
          var d = Math.abs(cx - mid); dists[i] = d / (slides[i].offsetWidth || 1);
          if (!reduced) slides[i].style.opacity = (0.32 + 0.68 * (1 - smoothstep(0.15, 0.8, dists[i]))).toFixed(3);
          if (d < bd) { bd = d; best = i; }
        });
        setActive(best); pools();
      };
      var sc = function () { if (!raf) raf = requestAnimationFrame(onScroll); };
      var rs = function () { measureN(); onScroll(); };
      vp.addEventListener("scroll", sc, { passive: true });
      window.addEventListener("resize", rs);
      rs();
      var presN = presenceTrigger(0.2);
      return function () { if (presN) presN.kill(); vp.removeEventListener("scroll", sc); window.removeEventListener("resize", rs); slides.forEach(function (s) { s.style.opacity = ""; }); };
    });
  }

  /* ================================================================ 6. NUMBERS extras (§7.6) */
  function initNumbers() {
    if (!gsap || reduced || !fine) return;
    $$(".gauge[data-gauge]").forEach(function (g) {
      var arc = $(".gauge__arc", g), odo = $("[data-odo]", g), v = parseFloat(g.getAttribute("data-gauge")) || 0, last = 0;
      if (!arc) return;
      g.addEventListener("pointerenter", function (e) {
        if (e.pointerType !== "mouse") return;
        var now = performance.now(), cur = parseFloat((arc.style.strokeDasharray || "").split(/[ ,]+/)[0]);
        if (now - last < 1500 || Math.abs(cur - v) > 0.5 || gsap.isTweening(arc)) return;
        last = now;
        gsap.fromTo(arc, { strokeDasharray: "0 100" }, { strokeDasharray: v + " 100", duration: 0.7, ease: E.s });
        if (odo && JW.odo) JW.odo(odo, 0);
      });
    });
    $$(".tally").forEach(function (t) {
      var rect = $(".tally__frame rect", t), odo = $("[data-odo]", t), last = 0;
      t.addEventListener("pointerenter", function (e) {
        if (e.pointerType !== "mouse" || performance.now() - last < 1500) return;
        last = performance.now();
        if (rect && window.DrawSVGPlugin && !gsap.isTweening(rect)) gsap.fromTo(rect, { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.6, ease: E.s });
        if (odo && JW.odo && !odo.querySelector("span")) JW.odo(odo, 0);
      });
    });
  }

  /* ================================================================ 7. EXPERIENCE (§7.7) */
  function initExperience() {
    var xp = $(".xp");
    if (!xp || !gsap || !ST || reduced) return;
    var word = $(".xp__word", xp), title = $(".xp__title", xp), sub = $(".xp__sub", xp), img = $(".xp__img", xp);
    var marquee = $(".marquee", xp), stageEl = $(".xp__stage", xp), glyphs = $(".xp__glyphs", xp);
    if (!word || !title || !stageEl) return;
    var painted = false;
    function paint() {
      if (!img || !window.JWScope || !window.JWScope.snapshot) return;
      /* the lumen's vanishing point sits above the word, so the glyphs show the lit folds, not the dark centre */
      var url = window.JWScope.snapshot({ size: 1024, tgx: 0, tgy: 0.52, adv: 0.62, time: 5.3 });
      if (url) { img.setAttribute("href", url); painted = true; }
    }
    doc.addEventListener("themechangeend", function () { if (painted) paint(); });
    var mm = gsap.matchMedia();
    mm.add("(min-width: 1000px) and (prefers-reduced-motion: no-preference)", function () {
      xp.classList.add("xp--live");
      var io = null;
      if (!painted) {
        if ("IntersectionObserver" in window) {
          io = new IntersectionObserver(function (es) { if (es[es.length - 1].isIntersecting) { io.disconnect(); paint(); } }, { rootMargin: "150% 0px" });
          io.observe(xp);
        } else paint();
      }
      var meas = null, cache = null;
      function glyphBox() {
        try {
          if (!meas) {
            meas = doc.createElementNS("http://www.w3.org/2000/svg", "text");
            meas.setAttribute("class", "xp__glyphs"); meas.setAttribute("x", glyphs ? glyphs.getAttribute("x") || "800" : "800");
            meas.setAttribute("y", glyphs ? glyphs.getAttribute("y") || "292" : "292"); meas.setAttribute("text-anchor", "middle");
            meas.setAttribute("opacity", "0"); meas.setAttribute("aria-hidden", "true");
            meas.textContent = glyphs ? glyphs.textContent : title.textContent;
            word.appendChild(meas);
          }
          var b = meas.getBBox();
          if (b && b.width) return b;
        } catch (e) { /* fall through */ }
        return { x: 200, y: 60, width: 1200, height: 260 };
      }
      function fit() {
        if (cache) return cache;
        var r = word.getBoundingClientRect();
        var x0 = +gsap.getProperty(word, "x") || 0, y0 = +gsap.getProperty(word, "y") || 0, s0 = +gsap.getProperty(word, "scale") || 1;
        var W = r.width / s0, H = r.height / s0, Cx = r.left + r.width / 2 - x0, Cy = r.top + r.height / 2 - y0;
        var vb = word.viewBox && word.viewBox.baseVal, vw = vb && vb.width ? vb.width : 1600, vh = vb && vb.height ? vb.height : 360;
        var k = Math.min(W / vw, H / vh), ox = (W - vw * k) / 2, oy = (H - vh * k) / 2;
        var gb = glyphBox();
        var Gx = Cx - W / 2 + ox + (gb.x - (vb ? vb.x : 0) + gb.width / 2) * k, Gy = Cy - H / 2 + oy + (gb.y - (vb ? vb.y : 0) + gb.height / 2) * k;
        var range = doc.createRange(); range.selectNodeContents(title);
        var tr = range.getBoundingClientRect();
        if (!tr.width) tr = title.getBoundingClientRect();
        var s = tr.width / Math.max(1, gb.width * k);
        var Dx = tr.left + tr.width / 2, Dy = tr.top + tr.height / 2;
        cache = { x: Dx - Cx - s * (Gx - Cx), y: Dy - Cy - s * (Gy - Cy), s: s };
        return cache;
      }
      var reset = function () { cache = null; };
      ST.addEventListener("refreshInit", reset);
      var tl = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: stageEl, start: "top top", end: "bottom bottom", scrub: 0.8, invalidateOnRefresh: true } });
      tl.to({}, { duration: 1 }, 0);
      tl.fromTo(word, { x: 0, y: 0, scale: 1 }, { x: function () { return fit().x; }, y: function () { return fit().y; }, scale: function () { return fit().s; }, duration: 0.7 }, 0);
      if (img) tl.fromTo(img, { x: 0, rotation: 0, scale: 1 }, { x: -120, rotation: 4, scale: 1.08, transformOrigin: "50% 50%", duration: 0.7 }, 0);
      if (marquee) tl.fromTo(marquee, { opacity: 1, yPercent: 0 }, { opacity: 0, yPercent: 40, duration: 0.5 }, 0);
      tl.fromTo(word, { opacity: 1 }, { opacity: 0, duration: 0.14 }, 0.72);
      tl.fromTo(title, { opacity: 0 }, { opacity: 1, duration: 0.14 }, 0.72);
      if (sub) tl.fromTo(sub, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.14 }, 0.86);
      return function () {
        xp.classList.remove("xp--live");
        ST.removeEventListener("refreshInit", reset);
        if (io) io.disconnect();
        if (meas && meas.parentNode) meas.parentNode.removeChild(meas);
        meas = null;
      };
    });
  }

  /* ================================================================ 8. BEYOND: alive by default (§7.8, revised)
     Each pane carries a small living drawing in its own hue (leadership: a design network with a bracket that
     hops between nodes; art: spectrum orbs and a brush stroke; sport: a disc in flight). The resting spotlight
     drifts on its own and follows the pointer on hover. On desktop the accordion follows the scroll (the pane
     under the reading line opens, so every description is seen without hovering); hover and focus override. */
  var SVGNS = "http://www.w3.org/2000/svg";
  function sv(tag, attrs, parent) {
    var e = doc.createElementNS(SVGNS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  var PANE_ART = {
    network: function (svg) {
      var g0 = sv("g", {}, svg);
      for (var gx = 0; gx < 11; gx++) for (var gy = 0; gy < 7; gy++) sv("circle", { class: "sp-fill", cx: 20 + gx * 36, cy: 22 + gy * 36, r: 1.1, opacity: 0.18 }, g0);
      var C = { x: 200, y: 128 }, nodes = [];
      for (var i = 0; i < 8; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 4 + (i % 2 ? 0.18 : -0.1), rr = i % 2 ? 1 : 0.78;
        nodes.push({ x: C.x + Math.cos(a) * 158 * rr, y: C.y + Math.sin(a) * 92 * rr, glow: 0 });
      }
      var links = sv("g", {}, svg);
      nodes.forEach(function (n, i) {
        var m = nodes[(i + 1) % nodes.length];
        sv("line", { class: "sp-soft", x1: n.x, y1: n.y, x2: m.x, y2: m.y, "stroke-width": 1, "stroke-dasharray": "2 5" }, links);
        n.spoke = sv("line", { class: "sp-soft", x1: C.x, y1: C.y, x2: n.x, y2: n.y, "stroke-width": 1 }, links);
      });
      var acc = sv("g", { class: "sp-glow" }, svg);
      nodes.forEach(function (n) {
        n.halo = sv("circle", { class: "sp-acc", cx: n.x, cy: n.y, r: 9, "stroke-width": 1.25, opacity: 0 }, acc);
        n.dot = sv("circle", { class: "sp-acc-fill", cx: n.x, cy: n.y, r: 3.2, opacity: 0.55 }, acc);
      });
      var leadRing = sv("circle", { class: "sp-acc", cx: C.x, cy: C.y, r: 13, "stroke-width": 1.5 }, acc);
      sv("circle", { class: "sp-acc-fill", cx: C.x, cy: C.y, r: 5 }, acc);
      var pulses = [0, 1, 2].map(function (k) { return { el: sv("circle", { class: "sp-acc-fill", r: 2.6, opacity: 0 }, acc), t: -k * 0.45, to: k * 3 }; });
      var br = sv("g", {}, acc);
      sv("path", { class: "sp-acc", d: "M-18 -10v-8h8M10 -18h8v8M18 10v8h-8M-10 18h-8v-8", "stroke-width": 1.75 }, br);
      var bpos = { x: nodes[1].x, y: nodes[1].y }, bgoal = 1, hopT = 0, ptr = null;
      return {
        pointer: function (p) { ptr = p; },
        tick: function (t, dt) {
          leadRing.setAttribute("r", (13 + Math.sin(t * 2.4) * 2).toFixed(2));
          pulses.forEach(function (pu) {
            pu.t += dt / 0.95;
            if (pu.t >= 1) { nodes[pu.to].glow = 1; pu.t = 0; pu.to = (pu.to + 3 + Math.floor(t * 7) % 3) % nodes.length; }
            if (pu.t < 0) { pu.el.setAttribute("opacity", "0"); return; }
            var n = nodes[pu.to], e = 1 - Math.pow(1 - pu.t, 2);
            pu.el.setAttribute("cx", (C.x + (n.x - C.x) * e).toFixed(1)); pu.el.setAttribute("cy", (C.y + (n.y - C.y) * e).toFixed(1));
            pu.el.setAttribute("opacity", (0.95 * (1 - Math.max(0, pu.t - 0.8) * 5)).toFixed(2));
          });
          hopT += dt;
          if (ptr) {
            var best = 0, bd = 1e9;
            nodes.forEach(function (n, i) { var d = Math.hypot(n.x - ptr.x, n.y - ptr.y); if (d < bd) { bd = d; best = i; } });
            bgoal = best; hopT = 0;
          } else if (hopT > 1.7) { hopT = 0; bgoal = (bgoal + 3) % nodes.length; nodes[bgoal].glow = 1; }
          var gN = nodes[bgoal], k = 1 - Math.exp(-dt * 7);
          bpos.x += (gN.x - bpos.x) * k; bpos.y += (gN.y - bpos.y) * k;
          var lockS = 1 + 0.35 * Math.max(0, 1 - hopT * 3);
          br.setAttribute("transform", "translate(" + bpos.x.toFixed(1) + " " + bpos.y.toFixed(1) + ") scale(" + lockS.toFixed(3) + ")");
          nodes.forEach(function (n, i) {
            n.glow = Math.max(0, n.glow - dt * 1.4);
            var on = i === bgoal ? 1 : n.glow;
            n.halo.setAttribute("opacity", (on * 0.9).toFixed(2));
            n.halo.setAttribute("r", (9 + (1 - n.glow) * 6 * (i === bgoal ? 0 : 1)).toFixed(1));
            n.dot.setAttribute("opacity", (0.45 + on * 0.55).toFixed(2));
            n.spoke.setAttribute("opacity", (0.35 + on * 0.65).toFixed(2));
          });
        }
      };
    },
    orbs: function (svg) {
      var hues = ["coil", "nbi", "icg", "disc", "fundus", "mucosa", "ppix"], C = { x: 200, y: 124 };
      var g = sv("g", {}, svg);
      var orbs = hues.map(function (h, i) {
        var c = sv("circle", { class: "sp-acc-fill", "data-hue": h, r: 40, opacity: 0.5 }, g);
        c.style.mixBlendMode = "var(--orb-blend, screen)";
        return { el: c, a0: i / hues.length * Math.PI * 2 };
      });
      var acc = sv("g", { class: "sp-glow" }, svg);
      var stroke = sv("path", { class: "sp-acc", d: "M40 214C96 168 132 236 190 200S292 150 360 186", "stroke-width": 2.2, "stroke-linecap": "round", pathLength: 1 }, acc);
      var tip = sv("circle", { class: "sp-acc-fill", r: 3.4 }, acc);
      var len = 0; try { len = stroke.getTotalLength(); } catch (e) { len = 0; }
      var ptr = null, off = { x: 0, y: 0 };
      return {
        pointer: function (p) { ptr = p; },
        tick: function (t, dt) {
          var k = 1 - Math.exp(-dt * 3);
          off.x += ((ptr ? (ptr.x - C.x) * 0.25 : Math.sin(t * 0.5) * 14) - off.x) * k;
          off.y += ((ptr ? (ptr.y - C.y) * 0.25 : Math.cos(t * 0.4) * 8) - off.y) * k;
          orbs.forEach(function (o, i) {
            var a = o.a0 + t * 0.22, rad = 44 + Math.sin(t * 0.9 + i) * 10;
            o.el.setAttribute("cx", (C.x + off.x + Math.cos(a) * rad * 1.5).toFixed(1));
            o.el.setAttribute("cy", (C.y + off.y + Math.sin(a) * rad * 0.8).toFixed(1));
            o.el.setAttribute("r", (34 + Math.sin(t * 1.3 + i * 0.9) * 6).toFixed(1));
          });
          var ph = (t % 4.2) / 4.2, draw = Math.min(1, ph / 0.55), fade = ph > 0.8 ? 1 - (ph - 0.8) / 0.2 : 1;
          stroke.style.strokeDasharray = draw.toFixed(4) + " 2";
          stroke.setAttribute("opacity", fade.toFixed(2));
          if (len) { var q = stroke.getPointAtLength(draw * len); tip.setAttribute("cx", q.x.toFixed(1)); tip.setAttribute("cy", q.y.toFixed(1)); }
          tip.setAttribute("opacity", (fade * (draw < 1 ? 1 : 0.4)).toFixed(2));
        }
      };
    },
    disc: function (svg) {
      sv("path", { class: "sp-soft", d: "M16 236H384", "stroke-width": 1 }, svg);
      var path = sv("path", { class: "sp-ink", d: "M30 222C110 40 270 10 372 96", "stroke-width": 1.25, "stroke-dasharray": "4 8", fill: "none", opacity: 0.7 }, svg);
      var acc = sv("g", { class: "sp-glow" }, svg);
      var trail = sv("path", { class: "sp-acc", d: "M30 222C110 40 270 10 372 96", "stroke-width": 2.2, "stroke-linecap": "round", pathLength: 1, opacity: 0.9 }, acc);
      var disc = sv("g", {}, acc);
      sv("ellipse", { class: "sp-deep", rx: 26, ry: 8 }, disc);
      sv("ellipse", { class: "sp-acc", rx: 26, ry: 8, "stroke-width": 1.5 }, disc);
      sv("ellipse", { class: "sp-acc", rx: 15, ry: 4.2, "stroke-width": 1.1, opacity: 0.7 }, disc);
      var mark = sv("circle", { class: "sp-acc-fill", r: 2.4 }, disc);
      var len = 0; try { len = path.getTotalLength(); } catch (e) { len = 0; }
      var p = 0, phase = 0, spin = 0;
      return {
        pointer: function () {},
        throwIt: function () { phase = 0; },
        tick: function (t, dt) {
          phase += dt;
          var fl = 2.8, rest = 0.9;
          if (phase > fl + rest) phase = 0;
          var u = Math.min(1, phase / fl);
          p = 1 - Math.pow(1 - u, 2.2);
          spin += dt * (14 - 9 * u);
          var a = Math.max(0, p - 0.3);
          trail.style.strokeDasharray = Math.max(0.0005, p - a).toFixed(4) + " 2";
          trail.style.strokeDashoffset = (-a).toFixed(4);
          trail.setAttribute("opacity", (phase > fl ? Math.max(0, 1 - (phase - fl) / rest) : 0.95).toFixed(2));
          if (!len) return;
          var q = path.getPointAtLength(p * len), q2 = path.getPointAtLength(Math.min(len, p * len + 2));
          var ang = Math.atan2(q2.y - q.y, q2.x - q.x) * 180 / Math.PI;
          disc.setAttribute("transform", "translate(" + q.x.toFixed(1) + " " + q.y.toFixed(1) + ") rotate(" + (ang * 0.35).toFixed(1) + ") scale(" + (0.75 + p * 0.45).toFixed(3) + ")");
          mark.setAttribute("cx", (Math.cos(spin) * 22).toFixed(1)); mark.setAttribute("cy", (Math.sin(spin) * 6.8).toFixed(1));
        }
      };
    }
  };
  function initBeyond() {
    var row = $(".beyond__row"), panes = $$(".beyond .pane");
    if (!panes.length) return;
    var hovering = false, focusIn = false, auto = -1;
    panes.forEach(function (p) {
      p.addEventListener("focusin", function () { focusIn = true; panes.forEach(function (q) { q.classList.toggle("is-open", q === p); q.style.flexGrow = ""; }); });
      p.addEventListener("focusout", function (e) {
        if (e.relatedTarget && row && row.contains(e.relatedTarget)) return;
        focusIn = false; p.classList.remove("is-open"); applyAuto();
      });
    });
    /* the scroll-lit pane takes the open look (light, rule, numeral) but keeps its width (flex-grow 1), so
       the text of its neighbours never reflows or clips; pointer and focus still grow a pane as styled */
    function applyAuto() {
      if (hovering || focusIn) return;
      panes.forEach(function (q, i) { var on = i === auto; q.classList.toggle("is-open", on); q.style.flexGrow = on ? "1" : ""; });
    }
    var desk = mq("(min-width: 1000px) and (pointer: fine)");
    if (!desk || !gsap) return;
    if (row) {
      row.addEventListener("pointerenter", function (e) { if (e.pointerType !== "mouse") return; hovering = true; panes.forEach(function (q) { q.classList.remove("is-open"); q.style.flexGrow = ""; }); });
      row.addEventListener("pointerleave", function (e) { if (e.pointerType !== "mouse") return; hovering = false; applyAuto(); });
    }
    if (ST && !reduced && row) {
      var upd = function (s) { var i = Math.max(0, Math.min(panes.length - 1, Math.floor(s.progress * panes.length))); if (s.progress <= 0 || s.progress >= 1) i = s.progress <= 0 ? 0 : panes.length - 1; if (i !== auto) { auto = i; applyAuto(); } };
      ST.create({ trigger: row, start: "top 72%", end: "bottom 38%", onUpdate: upd, onRefresh: upd });
    } else { auto = 0; applyAuto(); }
    var KIND = { coil: "network", ppix: "orbs", fundus: "disc" }, ORDER = ["network", "orbs", "disc"];
    panes.forEach(function (p, i) {
      /* living drawing */
      var kind = KIND[p.getAttribute("data-hue")] || ORDER[i % 3], art = null;
      if (!$(".pane__art", p)) {
        var box = doc.createElement("span");
        box.className = "pane__art"; box.setAttribute("aria-hidden", "true");
        var svg = sv("svg", { viewBox: "0 0 400 260", preserveAspectRatio: "xMidYMid meet", fill: "none", focusable: "false" });
        box.appendChild(svg);
        var spot = $(".pane__spot", p);
        if (spot && spot.nextSibling) p.insertBefore(box, spot.nextSibling); else p.insertBefore(box, p.firstChild);
        try { art = PANE_ART[kind](svg); } catch (e) { art = null; }
        if (art && window.JWSpec && window.JWSpec.neon) $$(".sp-glow", svg).forEach(window.JWSpec.neon);
        if (art) {
          var toLocal = function (e) {
            var m = svg.getScreenCTM(); if (!m) return null;
            var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; pt = pt.matrixTransform(m.inverse());
            return { x: pt.x, y: pt.y };
          };
          p.addEventListener("pointermove", function (e) { if (e.pointerType === "mouse") art.pointer(toLocal(e)); });
          p.addEventListener("pointerleave", function () { art.pointer(null); });
          p.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse" && art.throwIt) art.throwIt(); });
          if (JW.loop) JW.loop(p, function (t, dt) { art.tick(t, dt || 0); }, { margin: "0px", t0: i * 1.3 });
        }
      }
      /* spotlight: drifts at rest, follows the pointer on hover */
      var o = { x: 50, y: 70 }, inside = false;
      var write = function () { p.style.setProperty("--mx", o.x.toFixed(2) + "%"); p.style.setProperty("--my", o.y.toFixed(2) + "%"); };
      var xTo = gsap.quickTo(o, "x", { duration: reduced ? 0.01 : 0.4, ease: "power3", onUpdate: write });
      var yTo = gsap.quickTo(o, "y", { duration: reduced ? 0.01 : 0.4, ease: "power3", onUpdate: write });
      write();
      p.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "mouse") return;
        var r = p.getBoundingClientRect();
        xTo((e.clientX - r.left) / (r.width || 1) * 100);
        yTo((e.clientY - r.top) / (r.height || 1) * 100);
      });
      p.addEventListener("pointerenter", function (e) {
        if (e.pointerType !== "mouse") return;
        inside = true;
        var r = p.getBoundingClientRect();
        xTo((e.clientX - r.left) / (r.width || 1) * 100); yTo((e.clientY - r.top) / (r.height || 1) * 100);
      });
      p.addEventListener("pointerleave", function () { inside = false; });
      if (!reduced && JW.loop) JW.loop(p, function (t) {
        if (inside) return;
        xTo(50 + Math.sin(t * 0.37 + i * 2.1) * 26);
        yTo(62 + Math.cos(t * 0.29 + i * 1.3) * 18);
      }, { margin: "0px", t0: i * 0.9 });
    });
  }

  /* ---------- boot ---------- */
  safe(initHero)();
  safe(initStatement)();
  safe(initPeek)();
  safe(initMonitor)();
  safe(initGallery)();
  safe(initNumbers)();
  safe(initExperience)();
  safe(initBeyond)();
  if (ST) { try { ST.sort(); } catch (e) { /* older ScrollTrigger */ } }
})();
