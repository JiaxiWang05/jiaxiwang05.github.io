/* inner.js: inner pages (spec §8). LIGHT SOURCE, package B.
   Head art entrance, head lens (research), title parallax, disc flight (sport), orbs (art),
   TOC and CV rail (active link + progress). Reveals, gauges, odometers, explanations, copy lock and
   specimens come from core.js and specimens.js. Missing markup never throws. */
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
  function safe(fn) { return function () { try { return fn.apply(this, arguments); } catch (e) { if (window.console) console.warn("[inner]", e); } }; }

  var head = $(".page-head");
  var art = head && $(".page-head__art", head);

  /* ---------- head art entrance + gentle drift ---------- */
  function initHeadArt() {
    if (!art || !gsap || reduced) return;
    var scopeEl = $(".scope", art);
    if (scopeEl) {
      gsap.set(scopeEl, { clipPath: "circle(0% at 50% 50%)", scale: 1.12, rotation: -14 });
      JW.onReady(function () {
        gsap.to(scopeEl, { clipPath: "circle(75% at 50% 50%)", scale: 1, rotation: 0, duration: 1.5, ease: E.s, delay: 0.15,
          onComplete: function () { scopeEl.style.clipPath = ""; } });
      });
    } else {
      gsap.set(art, { opacity: 0, y: 24 });
      JW.onReady(function () { gsap.to(art, { opacity: 1, y: 0, duration: 1.1, ease: E.s, delay: 0.2 }); });
    }
    if (ST) {
      var drift = scopeEl || art.firstElementChild || art;
      gsap.fromTo(drift, { yPercent: 0 }, { yPercent: -8, ease: "none", immediateRender: false, scrollTrigger: { trigger: head, start: "top top", end: "bottom top", scrub: true } });
    }
  }

  /* ---------- head lens (research): scroll advance x .6 and pointer steer ---------- */
  function initHeadLens() {
    var lens = head && $('.scope__lens[data-scope="head"]', head);
    if (!lens || !window.JWScope) return;
    var scope = window.JWScope.mount(lens, { role: "head", oct: 3 });   /* reduced motion: one still frame, no canvas */
    if (reduced) return;
    if (!scope.live) return;
    var scrollAdv = 0, extra = 0;
    if (ST) ST.create({ trigger: head, start: "top top", end: "bottom top", onUpdate: function (s) { scrollAdv = s.progress * 0.6; scope.setAdvance(scrollAdv + extra); } });
    /* the fluorescent target follows the pointer inside the lens and drifts home when it leaves; a press
       pushes the view forward (released, it settles back) */
    var host = lens.closest(".scope") || lens;
    var T = { x: 0.11, y: 0.075 }, W = { x: 0.11, y: 0.075 }, inside = false, press = 0, pressW = 0;
    if (fine) {
      host.style.pointerEvents = "auto";
      host.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
        var r = lens.getBoundingClientRect();
        var x = (e.clientX - (r.left + r.width / 2)) / r.width, y = -(e.clientY - (r.top + r.height / 2)) / r.width;
        var d = Math.hypot(x, y), m = 0.36;
        if (d > m) { x = x / d * m; y = y / d * m; }
        W.x = x; W.y = y; inside = true;
      });
      host.addEventListener("pointerleave", function () { inside = false; W.x = 0.11; W.y = 0.075; pressW = 0; });
      host.addEventListener("pointerdown", function () { pressW = 1; });
      window.addEventListener("pointerup", function () { pressW = 0; });
    }
    if (JW.loop) JW.loop(host, function (t, dt) {
      var k = 1 - Math.exp(-(dt || 0.016) * (inside ? 6 : 2.2));
      T.x += (W.x - T.x) * k; T.y += (W.y - T.y) * k;
      scope.setTarget(T.x, T.y);
      press += (pressW - press) * (1 - Math.exp(-(dt || 0.016) * 4));
      extra += (dt || 0) * press * 0.4;
      if (!pressW) extra *= Math.exp(-(dt || 0) * 1.2);
      scope.setHold(press);
      scope.setAdvance(scrollAdv + extra);
    }, { margin: "0px" });
  }

  /* ---------- ghost word: drifts with the scroll and leans away from the pointer ---------- */
  function initGhost() {
    var ghost = head && $(".ghost", head);
    if (!ghost || !gsap || reduced) return;
    gsap.set(ghost, { xPercent: 6, opacity: 0 });
    JW.onReady(function () { gsap.to(ghost, { xPercent: 0, opacity: 1, duration: 1.6, ease: E.s, delay: 0.25 }); });
    if (ST) gsap.fromTo(ghost, { yPercent: 0 }, { yPercent: 28, ease: "none", immediateRender: false, scrollTrigger: { trigger: head, start: "top top", end: "bottom top", scrub: true } });
    if (!fine) return;
    var gx = gsap.quickTo(ghost, "x", { duration: 1.1, ease: "power3" });
    var gy = gsap.quickTo(ghost, "y", { duration: 1.1, ease: "power3" });
    head.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var r = head.getBoundingClientRect();
      gx(-((e.clientX - r.left) / r.width - 0.5) * 36);
      gy(-((e.clientY - r.top) / r.height - 0.5) * 18);
    });
    head.addEventListener("pointerleave", function () { gx(0); gy(0); });
  }

  /* ---------- title parallax: yPercent 0 -> 12 (never letter-spacing) ---------- */
  function initTitle() {
    var title = head && $(".page-head__title", head);
    if (!title || !gsap || !ST || reduced) return;
    gsap.fromTo(title, { yPercent: 0 }, { yPercent: 12, ease: "none", immediateRender: false, scrollTrigger: { trigger: head, start: "top top", end: "bottom top", scrub: true } });
  }

  /* ---------- disc flight (sport) ---------- */
  function initDisc() {
    var path = $(".disc-path"), disc = $(".disc");
    if (!path || !disc) return;
    var len = 0;
    try { len = path.getTotalLength(); } catch (e) { len = 0; }
    if (!len) return;
    /* a light trail behind the disc and a mark on its rim that shows the spin (night: neon bloom) */
    var NS = "http://www.w3.org/2000/svg";
    var trail = doc.createElementNS(NS, "path");
    trail.setAttribute("d", path.getAttribute("d")); trail.setAttribute("class", "sp-acc disc-trail");
    trail.setAttribute("pathLength", "1"); trail.setAttribute("fill", "none"); trail.setAttribute("stroke-width", "2.5"); trail.setAttribute("stroke-linecap", "round");
    trail.style.strokeDasharray = "0 2";
    var glowG = doc.createElementNS(NS, "g"); glowG.setAttribute("class", "sp-glow");
    path.parentNode.insertBefore(glowG, disc); glowG.appendChild(trail); glowG.appendChild(disc);
    var mark = doc.createElementNS(NS, "circle");
    mark.setAttribute("class", "sp-acc-fill"); mark.setAttribute("r", "3.2"); disc.appendChild(mark);
    if (window.JWSpec && window.JWSpec.neon) window.JWSpec.neon(glowG);
    var lastP = 0, spin = 0;
    var place = function (p) {
      p = clamp01(p);
      var pt = path.getPointAtLength(p * len), ahead = path.getPointAtLength(Math.min(len, p * len + 2));
      var ang = Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180 / Math.PI;
      disc.setAttribute("transform", "translate(" + pt.x.toFixed(1) + " " + pt.y.toFixed(1) + ") rotate(" + (ang * 0.4).toFixed(1) + ") scale(" + (0.6 + p * 0.6).toFixed(2) + ")");
      var a = Math.max(0, p - 0.28);
      trail.style.strokeDasharray = Math.max(0.0005, p - a).toFixed(4) + " 2";
      trail.style.strokeDashoffset = (-a).toFixed(4);
      spin += Math.abs(p - lastP) * 60 + 0.02; lastP = p;
      mark.setAttribute("cx", (Math.cos(spin) * 40).toFixed(1)); mark.setAttribute("cy", (Math.sin(spin) * 12).toFixed(1));
    };
    if (reduced || !gsap) { place(0.55); return; }
    var o = { p: 0 }, scrollP = 0, flying = null;
    place(0);
    var throwIt = function (from, to, dur) {
      if (flying) flying.kill();
      o.p = from;
      flying = gsap.to(o, { p: to, duration: dur, ease: "power2.out", onUpdate: function () { place(o.p); }, onComplete: function () { flying = null; } });
    };
    JW.onReady(function () { gsap.delayedCall(0.6, function () { throwIt(0, 0.55, 2.6); }); });
    if (ST) ST.create({ trigger: head || path, start: "top top", end: "bottom top", scrub: 0.6,
      onUpdate: function (s) { scrollP = s.progress; if (!flying) place(0.55 + scrollP * 0.45); } });
    var host = path.closest(".page-head__art") || path.closest("svg");
    if (host) {
      host.style.cursor = fine ? "pointer" : "";
      host.addEventListener("click", function () { throwIt(0, 0.55 + scrollP * 0.45, 1.8); });
      /* at rest the disc keeps spinning and floats a little on the air */
      if (JW.loop) JW.loop(host, function (t) {
        if (flying) return;
        place(0.55 + scrollP * 0.45 + Math.sin(t * 1.1) * 0.006);
      }, { margin: "0px" });
    }
  }

  /* ---------- orbs (art): breathe and orbit at rest, follow the pointer (6-18 px per orb by index) ----------
     Each orb gets an idle orbit (its own phase and radius) plus the pointer offset; the whole rosette turns
     slowly with the scroll. Only `translate` and `scale` are written (no layout). */
  function initOrbs() {
    var orbs = $$(".orbs i");
    if (!orbs.length || !gsap || reduced) return;
    var box = orbs[0].parentElement;
    var st = orbs.map(function (o, i) {
      var s = { x: 0, y: 0, amp: 6 + i * 2, ph: i * 0.9, r: 7 + (i % 3) * 3 };
      s.xTo = gsap.quickTo(s, "x", { duration: 0.6 + i * 0.05, ease: "power3" });
      s.yTo = gsap.quickTo(s, "y", { duration: 0.6 + i * 0.05, ease: "power3" });
      s.el = o;
      return s;
    });
    if (fine) window.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var r = box.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      var nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
      var ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
      st.forEach(function (s) { s.xTo(nx * s.amp * 1.6); s.yTo(ny * s.amp * 1.6); });
    }, { passive: true });
    if (ST) gsap.fromTo(box, { rotation: 0 }, { rotation: 40, ease: "none", immediateRender: false, scrollTrigger: { trigger: head || box, start: "top top", end: "bottom top", scrub: true } });
    if (JW.loop) JW.loop(box, function (t) {
      st.forEach(function (s, i) {
        var ix = Math.cos(t * 0.6 + s.ph) * s.r, iy = Math.sin(t * 0.47 + s.ph * 1.3) * s.r;
        s.el.style.translate = (s.x + ix).toFixed(2) + "px " + (s.y + iy).toFixed(2) + "px";
        s.el.style.scale = (1 + Math.sin(t * 0.8 + i) * 0.045).toFixed(4);
      });
    }, { margin: "0px" });
  }

  /* ---------- TOC and CV rail: active link by centre crossing; progress fill ---------- */
  function initToc() {
    $$(".toc").forEach(function (toc) {
      var links = $$('a[href^="#"]', toc);
      var items = links.map(function (a) {
        var id = a.getAttribute("href").slice(1), sec = null;
        try { sec = doc.getElementById(decodeURIComponent(id)); } catch (e) { sec = null; }
        return { a: a, sec: sec };
      }).filter(function (x) { return x.sec; });
      if (!items.length) return;
      var fillEl = $(".toc__progress i", toc), list = $("ol", toc) || toc;
      var current = null;
      var setActive = function (it) {
        if (it === current) return;
        if (current) { current.a.classList.remove("is-active"); current.a.removeAttribute("aria-current"); }
        current = it;
        if (!it) return;
        it.a.classList.add("is-active"); it.a.setAttribute("aria-current", "location");
        if (list.scrollWidth > list.clientWidth + 4) {
          var left = it.a.offsetLeft - 16;
          try { list.scrollTo({ left: left, behavior: reduced ? "auto" : "smooth" }); } catch (e) { list.scrollLeft = left; }
        }
      };
      if (fillEl) {
        fillEl.style.transformOrigin = "50% 0%";
        if (getComputedStyle(fillEl).transform === "none") fillEl.style.transform = "scaleY(0)";
      }
      var first = items[0].sec, last = items[items.length - 1].sec;
      if (ST) {
        items.forEach(function (it) {
          ST.create({ trigger: it.sec, start: "top center", end: "bottom center", onToggle: function (s) { if (s.isActive) setActive(it); } });
        });
        ST.create({ trigger: first, endTrigger: last, start: "top center", end: "bottom center",
          onUpdate: function (s) { if (fillEl) fillEl.style.transform = "scaleY(" + s.progress.toFixed(4) + ")"; },
          onRefresh: function (s) { if (fillEl) fillEl.style.transform = "scaleY(" + s.progress.toFixed(4) + ")"; },
          onLeaveBack: function () { setActive(null); } });
      } else if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (e) { if (e.isIntersecting) { var it = items.filter(function (x) { return x.sec === e.target; })[0]; if (it) setActive(it); } });
        }, { rootMargin: "-50% 0px -50% 0px" });
        items.forEach(function (it) { io.observe(it.sec); });
        var onScroll = function () {
          if (!fillEl) return;
          var a = first.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2;
          var b = last.getBoundingClientRect().bottom + window.scrollY - window.innerHeight / 2;
          fillEl.style.transform = "scaleY(" + clamp01((window.scrollY - a) / ((b - a) || 1)).toFixed(4) + ")";
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
      }
    });
  }

  safe(initHeadArt)();
  safe(initHeadLens)();
  safe(initGhost)();
  safe(initTitle)();
  safe(initDisc)();
  safe(initOrbs)();
  safe(initToc)();
})();
