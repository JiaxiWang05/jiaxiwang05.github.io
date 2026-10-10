/* Jiaxi Wang — motion engine.
   Declarative: pages only add data-attributes.
   data-field  data-chapter  data-split  data-scramble  data-count  data-speed  data-reveal
   data-pop  data-ghost  data-draw  data-marquee  data-tilt  data-type  data-magnetic
   data-video  data-copy  data-cursor  (+ .plates sticky stack, .timeline rail)            */

(function () {
  "use strict";

  var html = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(pointer: fine)").matches;
  var mobile = window.matchMedia("(max-width: 760px)").matches;
  var hasGsap = typeof window.gsap !== "undefined";

  var FIELDS = {
    lumen: "#000000", coil_cobalt: "#1F3DFF", paper: "#F2F5F7", icg_green: "#14E0A0",
    fundus_orange: "#FF7A12", mucosa_coral: "#FF5545", nbi_cyan: "#00C6DE",
    ppix_magenta: "#FF2E8B", disc_amber: "#FFC21A"
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  window.JW = { reduced: reduced, fine: fine, mobile: mobile, fields: FIELDS, ready: [] };

  /* ---------- always-on behaviour (no GSAP needed) ---------- */

  function initVideos() {
    $$("[data-video]").forEach(function (wrap) {
      var btn = $(".video__btn", wrap);
      if (!btn) return;
      btn.addEventListener("click", function () {
        var f = document.createElement("iframe");
        f.src = "https://www.youtube-nocookie.com/embed/" + wrap.getAttribute("data-video") + "?autoplay=1&rel=0";
        f.title = wrap.getAttribute("data-title") || "Video";
        f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        f.setAttribute("allowfullscreen", "");
        f.referrerPolicy = "strict-origin-when-cross-origin";
        btn.remove();
        wrap.appendChild(f);
        f.focus();
      });
    });
  }

  function initCopy() {
    var status = $("#copy-status");
    $$("[data-copy]").forEach(function (b) {
      var label = b.textContent;
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-copy");
        var done = function (ok) {
          b.textContent = ok ? "Copied" : label;
          if (status) status.textContent = ok ? "Email address copied." : "Copy failed. Select the address above.";
          setTimeout(function () { b.textContent = label; }, 2200);
        };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); });
        else done(false);
      });
    });
  }

  function initMenu() {
    var t = $(".nav__toggle");
    if (!t) return;
    var set = function (open) {
      html.classList.toggle("nav-open", open);
      t.setAttribute("aria-expanded", String(open));
      t.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      if (window.lenis) open ? window.lenis.stop() : window.lenis.start();
    };
    t.addEventListener("click", function () { set(!html.classList.contains("nav-open")); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
    $$(".menu a").forEach(function (a) { a.addEventListener("click", function () { set(false); }); });
  }

  var y = $("#year");
  if (y) y.textContent = String(new Date().getFullYear());
  initVideos();
  initCopy();
  initMenu();

  if (!hasGsap) {
    var l = $(".loader"); if (l) l.classList.add("is-done");
    $$("[data-split]").forEach(function (e) { e.classList.add("is-split"); });
    return;
  }

  /* ---------- GSAP setup ---------- */

  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  gsap.registerPlugin(ST);
  ["SplitText", "ScrambleTextPlugin", "DrawSVGPlugin", "CustomEase"].forEach(function (p) { if (window[p]) gsap.registerPlugin(window[p]); });
  if (window.CustomEase) {
    CustomEase.create("scalpel", "M0,0 C0.16,1 0.3,1 1,1");
    CustomEase.create("lumen", "M0,0 C0.83,0 0.17,1 1,1");
    CustomEase.create("servo", "M0,0 C0.18,0 0.22,1.14 0.52,1.04 C0.7,0.98 0.84,1.005 1,1");
    CustomEase.create("hinge", "M0,0 C0.32,0 0.12,1.1 0.6,1.03 C0.78,1.005 0.88,1 1,1");
  }
  var E = window.CustomEase ? { s: "scalpel", l: "lumen", v: "servo", h: "hinge" } : { s: "expo.out", l: "expo.inOut", v: "back.out(1.6)", h: "back.out(1.4)" };
  window.JW.ease = E;

  /* ---------- smooth scroll ---------- */

  var lenis = null;
  if (!reduced && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9, touchMultiplier: 1.4 });
    window.lenis = lenis;
    lenis.on("scroll", ST.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href");
        if (id.length < 2) return;
        var target = $(id);
        if (!target) return;
        e.preventDefault();
        lenis.scrollTo(target, { offset: -64, duration: 1.6, easing: function (t) { return 1 - Math.pow(1 - t, 4); } });
      });
    });
  }
  window.JW.lenis = lenis;

  /* ---------- field backdrop: body colour morphs per chapter ---------- */

  var backdrop = document.createElement("div");
  backdrop.className = "field-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  document.body.prepend(backdrop);
  var fieldEls = $$(".chapter[data-field], .hero[data-field], .page-head[data-field]");
  if (fieldEls.length) {
    html.classList.add("fields-live");
    backdrop.style.background = FIELDS[fieldEls[0].getAttribute("data-field")] || "#000";
    fieldEls.forEach(function (el) {
      var c = FIELDS[el.getAttribute("data-field")] || "#000";
      ST.create({
        trigger: el, start: "top 60%", end: "bottom 60%",
        onToggle: function (self) { if (self.isActive) gsap.to(backdrop, { backgroundColor: c, duration: reduced ? 0 : 0.9, ease: "power2.out", overwrite: true }); }
      });
    });
  }

  /* ---------- nav: progress colorbar + chapter counter + scramble hover ---------- */

  var bar = $(".colorbar");
  if (bar) {
    ST.create({ start: 0, end: "max", onUpdate: function (s) { bar.style.setProperty("--p", s.progress.toFixed(4)); } });
  }
  var count = $(".nav__count");
  var chapters = $$("[data-chapter]");
  if (count && chapters.length) {
    var total = String(chapters.length).padStart(2, "0");
    var setCount = function (i) {
      var txt = String(i + 1).padStart(2, "0") + " / " + total + "  " + (chapters[i].getAttribute("data-chapter") || "");
      if (window.ScrambleTextPlugin && !reduced) gsap.to(count, { duration: 0.6, scrambleText: { text: txt, chars: "01<>/+-", speed: 0.6 } });
      else count.textContent = txt;
    };
    setCount(0);
    chapters.forEach(function (el, i) {
      ST.create({ trigger: el, start: "top 50%", end: "bottom 50%", onToggle: function (s) { if (s.isActive) setCount(i); } });
    });
  }
  if (window.ScrambleTextPlugin && !reduced) {
    $$(".nav__links a").forEach(function (a) {
      var t = a.textContent;
      a.addEventListener("mouseenter", function () { gsap.to(a, { duration: 0.5, scrambleText: { text: t, chars: "01<>/+-", speed: 0.8 } }); });
    });
  }

  /* ---------- cursor + magnetic ---------- */

  if (fine && !reduced) {
    var cur = document.createElement("div");
    cur.className = "cursor";
    cur.setAttribute("aria-hidden", "true");
    cur.innerHTML = '<div class="cursor__ring"></div><div class="cursor__dot"></div>';
    document.body.appendChild(cur);
    var ring = cur.firstChild;
    var xTo = gsap.quickTo(cur, "x", { duration: 0.45, ease: "power3" });
    var yTo = gsap.quickTo(cur, "y", { duration: 0.45, ease: "power3" });
    window.addEventListener("pointermove", function (e) { xTo(e.clientX); yTo(e.clientY); }, { passive: true });
    document.addEventListener("pointerover", function (e) {
      var media = e.target.closest(".video, [data-cursor]");
      var hover = e.target.closest("a, button, [data-tilt]");
      cur.classList.toggle("is-media", !!media);
      cur.classList.toggle("is-hover", !media && !!hover);
      ring.textContent = media ? (media.getAttribute("data-cursor") || "Play") : "";
    });
    $$("[data-magnetic]").forEach(function (m) {
      var mx = gsap.quickTo(m, "x", { duration: 0.6, ease: E.v });
      var my = gsap.quickTo(m, "y", { duration: 0.6, ease: E.v });
      m.addEventListener("pointermove", function (e) {
        var r = m.getBoundingClientRect();
        mx((e.clientX - r.left - r.width / 2) * 0.3);
        my((e.clientY - r.top - r.height / 2) * 0.3);
      });
      m.addEventListener("pointerleave", function () { mx(0); my(0); });
    });
  }

  /* ---------- page transitions: seven-colour curtain fallback ---------- */

  var curtain = document.createElement("div");
  curtain.className = "curtain";
  curtain.setAttribute("aria-hidden", "true");
  curtain.innerHTML = "<i></i><i></i><i></i><i></i><i></i><i></i><i></i>";
  document.body.appendChild(curtain);
  var cols = $$("i", curtain);
  var nativeVT = "onpagereveal" in window;
  var arriving = false;
  try { arriving = sessionStorage.getItem("jw-curtain") === "1"; sessionStorage.removeItem("jw-curtain"); } catch (e) { /* storage blocked */ }
  if (arriving && !nativeVT && !reduced) {
    gsap.set(cols, { scaleY: 1, transformOrigin: "top" });
    gsap.to(cols, { scaleY: 0, duration: 0.8, ease: E.l, stagger: 0.05, delay: 0.05 });
  }
  if (!reduced && !nativeVT) {
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a");
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      if (a.target === "_blank" || a.hasAttribute("download")) return;
      var url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !/\.html$|\/$/.test(url.pathname) || (url.pathname === location.pathname && url.hash)) return;
      e.preventDefault();
      try { sessionStorage.setItem("jw-curtain", "1"); } catch (err) { /* ignore */ }
      gsap.set(cols, { transformOrigin: "bottom" });
      gsap.to(cols, { scaleY: 1, duration: 0.6, ease: E.l, stagger: 0.04, onComplete: function () { location.href = a.href; } });
    });
    window.addEventListener("pageshow", function (e) { if (e.persisted) gsap.set(cols, { scaleY: 0 }); });
  }

  /* ---------- effects ---------- */

  function onEnter(el, fn, start) {
    if (reduced) { fn(true); return; }
    ST.create({ trigger: el, start: start || "top 85%", once: true, onEnter: function () { fn(false); } });
  }

  function splitIn(el, delay) {
    if (!window.SplitText || reduced) { el.classList.add("is-split"); return null; }
    var mode = el.getAttribute("data-split") || "chars";
    var type = mode === "lines" ? "lines" : mode === "words" ? "lines,words" : "lines,words,chars";
    var s = new window.SplitText(el, { type: type, mask: "lines", linesClass: "split-line" });
    el.classList.add("is-split");
    var targets = mode === "lines" ? s.lines : mode === "words" ? s.words : s.chars;
    return gsap.from(targets, {
      yPercent: 115, rotateX: mode === "chars" ? -70 : 0, opacity: 0, transformOrigin: "50% 100%",
      duration: mode === "lines" ? 1.1 : 1.0, ease: E.s, stagger: mode === "chars" ? 0.018 : 0.05, delay: delay || 0
    });
  }
  window.JW.splitIn = splitIn;

  $$("[data-split]").forEach(function (el) {
    if (el.hasAttribute("data-split-manual")) return;
    onEnter(el, function (now) { if (now) el.classList.add("is-split"); else splitIn(el); });
  });

  if (window.ScrambleTextPlugin) {
    $$("[data-scramble]").forEach(function (el) {
      var txt = el.textContent;
      onEnter(el, function (now) { if (!now) gsap.to(el, { duration: 1.1, scrambleText: { text: txt, chars: "01<>/+-", revealDelay: 0.25, speed: 0.5 } }); });
    });
  }

  $$("[data-count]").forEach(function (el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var dec = (el.getAttribute("data-count").split(".")[1] || "").length;
    onEnter(el, function (now) {
      if (now) { el.textContent = target.toFixed(dec); return; }
      var o = { v: 0 };
      gsap.to(o, { v: target, duration: 2.2, ease: "power3.out", onUpdate: function () { el.textContent = o.v.toFixed(dec); } });
    });
  });

  $$("[data-reveal]").forEach(function (el) {
    var kind = el.getAttribute("data-reveal");
    var from = kind === "mask" ? { clipPath: "inset(0 0 100% 0)" }
      : kind === "scale" ? { opacity: 0, scale: 0.82 }
      : kind === "blur" ? { opacity: 0, filter: "blur(18px)", y: 30 }
      : { opacity: 0, y: 60 };
    var to = kind === "mask" ? { clipPath: "inset(0 0 0% 0)" }
      : kind === "scale" ? { opacity: 1, scale: 1 }
      : kind === "blur" ? { opacity: 1, filter: "blur(0px)", y: 0 }
      : { opacity: 1, y: 0 };
    onEnter(el, function (now) {
      if (now) { gsap.set(el, to); return; }
      gsap.fromTo(el, from, Object.assign({ duration: kind === "mask" ? 1.4 : 1.1, ease: E.s, delay: parseFloat(el.getAttribute("data-delay") || 0) }, to));
    });
  });

  if (!reduced) {
    $$("[data-speed]").forEach(function (el) {
      var sp = parseFloat(el.getAttribute("data-speed")) * (mobile ? 0.5 : 1);
      var host = el.closest("section, .plate, header") || el;
      gsap.fromTo(el, { y: sp * 160 }, { y: -sp * 160, ease: "none", scrollTrigger: { trigger: host, start: "top bottom", end: "bottom top", scrub: true } });
    });

    $$("[data-pop]").forEach(function (el) {
      var ang = mobile ? -40 : -82;
      if (el.parentElement) el.parentElement.style.perspective = "1400px";
      gsap.fromTo(el, { rotateX: ang, transformOrigin: "50% 100%", opacity: 0.2, z: -120 },
        { rotateX: 0, opacity: 1, z: 0, ease: E.h, scrollTrigger: { trigger: el, start: "top 98%", end: "top 45%", scrub: 0.8 } });
    });

    $$("[data-ghost]").forEach(function (el) {
      if (!window.SplitText) return;
      var s = new window.SplitText(el, { type: "chars" });
      var host = el.closest("section, .plate, header") || el;
      gsap.to(s.chars, {
        x: function (i) { return ((i * 73) % 81) - 40; },
        y: function (i) { return ((i * 37) % 121) - 60; },
        rotate: function (i) { return ((i * 53) % 51) - 25; },
        opacity: 0, ease: "none",
        scrollTrigger: { trigger: host, start: "center center", end: "bottom top", scrub: 0.8 }
      });
      gsap.from(el, { xPercent: 8, ease: "none", scrollTrigger: { trigger: host, start: "top bottom", end: "center center", scrub: true } });
    });

    $$("[data-tilt]").forEach(function (el) {
      var g = document.createElement("span"); g.className = "glare"; el.appendChild(g);
      var rx = gsap.quickTo(el, "rotateX", { duration: 0.6, ease: "power3" });
      var ry = gsap.quickTo(el, "rotateY", { duration: 0.6, ease: "power3" });
      gsap.set(el, { transformPerspective: 900 });
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        rx((0.5 - py) * 14); ry((px - 0.5) * 18);
        el.style.setProperty("--gx", px * 100 + "%"); el.style.setProperty("--gy", py * 100 + "%");
      });
      el.addEventListener("pointerleave", function () { rx(0); ry(0); });
    });
  }

  if (window.DrawSVGPlugin) {
    $$("[data-draw]").forEach(function (el) {
      var paths = el.matches("path, line, polyline, circle, rect, ellipse") ? [el] : $$("path, line, polyline, circle, ellipse", el);
      if (reduced) return;
      if (el.getAttribute("data-draw") === "enter") {
        onEnter(el, function () { gsap.fromTo(paths, { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.8, ease: E.s, stagger: 0.08 }); });
      } else {
        var host = el.closest("section, .plate, header") || el;
        gsap.fromTo(paths, { drawSVG: "0%" }, { drawSVG: "100%", ease: "none", stagger: 0.05, scrollTrigger: { trigger: host, start: "top 75%", end: "center center", scrub: 0.8 } });
      }
    });
  }

  $$("[data-type]").forEach(function (el) {
    var full = el.textContent.trim();
    if (reduced) return;
    el.textContent = "";
    var caret = document.createElement("span"); caret.className = "caret";
    var txt = document.createTextNode("");
    el.appendChild(txt); el.appendChild(caret);
    var start = function () {
      var i = 0;
      var tick = function () { i++; txt.nodeValue = full.slice(0, i); if (i < full.length) setTimeout(tick, 22 + Math.random() * 18); };
      setTimeout(tick, parseFloat(el.getAttribute("data-delay") || 0) * 1000);
    };
    if (el.hasAttribute("data-type-manual")) el._typeStart = start; else onEnter(el, start);
  });

  $$("[data-marquee]").forEach(function (m) {
    var track = $(".marquee__track", m);
    if (!track || reduced) return;
    track.innerHTML += track.innerHTML;
    var tl = gsap.to(track, { xPercent: -50, duration: parseFloat(m.getAttribute("data-marquee")) || 30, ease: "none", repeat: -1 });
    var skew = gsap.quickTo(track, "skewX", { duration: 0.4, ease: "power3" });
    if (lenis) lenis.on("scroll", function (l) {
      var v = l.velocity || 0;
      tl.timeScale(1 + Math.min(Math.abs(v) / 6, 5) * (v < 0 ? -1 : 1));
      skew(Math.max(-12, Math.min(12, -v * 0.6)));
    });
  });

  /* timeline rail */
  $$(".timeline").forEach(function (t) {
    var i = $(".timeline__rail i", t);
    if (!i || reduced) return;
    gsap.fromTo(i, { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: t, start: "top 70%", end: "bottom 60%", scrub: true } });
    $$(".tl", t).forEach(function (row) {
      gsap.from(row, { x: 60, opacity: 0, duration: 1, ease: E.s, scrollTrigger: { trigger: row, start: "top 85%", once: true } });
    });
  });

  /* sticky-stack plates with rolling counter */
  $$(".plates").forEach(function (wrap) {
    var plates = $$(".plate", wrap);
    var rolls = $$(".plates__counter .roll b", wrap);
    plates.forEach(function (p, i) {
      ST.create({ trigger: p, start: "top 55%", end: "bottom 55%", onToggle: function (s) {
        if (s.isActive) rolls.forEach(function (b) { b.style.transform = "translateY(" + (-i * 100) + "%)"; });
      } });
      if (reduced || mobile) return;
      var next = plates[i + 1];
      var grid = $(".plate__grid", p);
      if (next && grid) {
        gsap.to(grid, { scale: 0.84, opacity: 0.15, filter: "blur(8px)", ease: "none", scrollTrigger: { trigger: next, start: "top bottom", end: "top top", scrub: true } });
      }
      var spec = $(".plate__specimen", p);
      if (spec) gsap.fromTo(spec, { rotateY: -24, rotateX: 10, scale: 0.8 }, { rotateY: 0, rotateX: 0, scale: 1, ease: E.h, transformPerspective: 1200, scrollTrigger: { trigger: p, start: "top 90%", end: "top 20%", scrub: 0.8 } });
    });
  });

  /* ---------- loader / intro ---------- */

  var loader = $(".loader");
  var intro = function () { window.JW.ready.forEach(function (f) { f(); }); window.JW.started = true; };
  window.JW.onReady = function (f) { if (window.JW.started) f(); else window.JW.ready.push(f); };

  var seen = false;
  try { seen = sessionStorage.getItem("jw-seen") === "1"; sessionStorage.setItem("jw-seen", "1"); } catch (e) { /* ignore */ }

  if (loader && !reduced && !seen) {
    if (lenis) lenis.stop();
    var pct = $(".loader__pct", loader);
    var o = { v: 0 };
    var tl = gsap.timeline({ onComplete: function () { loader.classList.add("is-done"); if (lenis) lenis.start(); ST.refresh(); } });
    tl.from(".loader__badge", { scale: 0.4, opacity: 0, rotate: -90, duration: 0.9, ease: E.s })
      .to(o, { v: 100, duration: 1.3, ease: "power2.inOut", onUpdate: function () { if (pct) pct.textContent = Math.round(o.v) + "%"; } }, 0.1)
      .to(".loader__eye i", { scale: 26, duration: 0.9, ease: E.l }, ">-0.1")
      .to(loader, { clipPath: "circle(0% at 50% 50%)", duration: 0.9, ease: E.l }, "<0.25")
      .add(intro, "<0.2");
  } else {
    if (loader) loader.classList.add("is-done");
    gsap.delayedCall(arriving ? 0.35 : 0.05, intro);
  }

  window.addEventListener("load", function () { ST.refresh(); });
})();
