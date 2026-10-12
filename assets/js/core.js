/* core.js: LIGHT SOURCE motion engine (package B). Public: window.JW.
   Declarative: pages carry data-attributes (spec §5.3); this file drives them.
   Order of scripts: gsap + plugins, lenis, theme.js, hero-gl.js, specimens.js, core.js, pages/<page>.js */
(function () {
  "use strict";

  var html = document.documentElement;
  var doc = document;
  function mq(q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } }
  var reduced = mq("(prefers-reduced-motion: reduce)");
  var fine = mq("(pointer: fine)");
  var mobile = mq("(max-width: 760px)");
  /* lite mode (phones, tablets, small or low-power devices): decided once by the head boot script
     (html.jw-lite / window.JW_LITE); the coarse-pointer / narrow-screen test is the fallback when it is absent */
  var LITE = html.classList.contains("jw-lite") || window.JW_LITE === true ||
    (window.JW_LITE !== false && (mq("(pointer: coarse)") || mq("(max-width: 900px)") ||
      (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 ||
      !!(navigator.connection && navigator.connection.saveData)));
  var touch = !fine && (mq("(pointer: coarse)") || mq("(hover: none)"));
  var lang = /^zh/i.test(html.getAttribute("lang") || "") ? "zh" : "en";
  var gsap = window.gsap || null;
  var ST = gsap && window.ScrollTrigger ? window.ScrollTrigger : null;

  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smoothstep(a, b, x) { var t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } return null; }
  function safe(fn) { return function () { try { return fn.apply(this, arguments); } catch (e) { if (window.console) console.warn("[JW]", e); } }; }
  /* run fn when the main thread is idle (with a deadline), so one-off heavy work stays out of scroll frames */
  function idle(fn, timeout) {
    if (window.requestIdleCallback) return window.requestIdleCallback(function () { fn(); }, { timeout: timeout || 1200 });
    return setTimeout(fn, 60);
  }
  /* quiet: like idle, but also waits for a pause in scrolling (no scroll event for 400 ms, no finger down), so a
     one-off long task (a WebGL context, a JPEG encode) does not land in a swipe. `deadline` (absolute ms, or a
     function returning it) caps the wait. */
  var lastScrollT = 0, fingers = 0;
  window.addEventListener("scroll", function () { lastScrollT = performance.now(); }, { passive: true });
  window.addEventListener("touchstart", function (e) { fingers = e.touches ? e.touches.length : 1; }, { passive: true });
  window.addEventListener("touchend", function (e) { fingers = e.touches ? e.touches.length : 0; }, { passive: true });
  window.addEventListener("touchcancel", function () { fingers = 0; }, { passive: true });
  function quiet(fn, deadline) {
    var t0 = performance.now();
    var check = function () {
      var now = performance.now(), dl = typeof deadline === "function" ? deadline() : deadline;
      if ((now - lastScrollT > 400 && !fingers) || now >= (dl || t0 + 8000)) idle(fn, 500);
      else setTimeout(check, 200);
    };
    check();
  }

  /* ---------- i18n (§5.6) ---------- */
  var EN = {
    "theme.switch": "Switch between day and night theme",
    "menu.open": "Open menu", "menu.close": "Close menu",
    "copy.done": "Copied", "copy.status": "Email address copied.",
    "copy.fail": "Copy failed. Select the address above and copy it manually.",
    "explain.show": "What this shows", "explain.hide": "Close explanation",
    "cursor.play": "Play", "cursor.open": "Open", "cursor.drag": "Drag", "cursor.steer": "Steer", "cursor.hold": "Hold",
    "video.title": "Video", "gallery.of": "{n} of {total}"
  };
  var ZH = {
    "theme.switch": "切换日间与夜间主题",
    "menu.open": "打开菜单", "menu.close": "关闭菜单",
    "copy.done": "已复制", "copy.status": "邮箱地址已复制。", "copy.fail": "复制失败，请选中上方地址后手动复制。",
    "explain.show": "图示说明", "explain.hide": "关闭说明",
    "cursor.play": "播放", "cursor.open": "打开", "cursor.drag": "拖动", "cursor.steer": "操控", "cursor.hold": "按住",
    "video.title": "视频", "gallery.of": "第{n}项，共{total}项"
  };
  var I18N = {};
  try { var node = doc.getElementById("jw-i18n"); if (node) I18N = JSON.parse(node.textContent) || {}; } catch (e) { I18N = {}; }
  function t(key, vars) {
    var s = I18N[key] || (lang === "zh" ? ZH[key] : EN[key]) || EN[key] || key;
    if (vars) for (var k in vars) s = s.split("{" + k + "}").join(String(vars[k]));
    return s;
  }

  /* ---------- the JW object ---------- */
  var JW = window.JW = window.JW || {};
  JW.reduced = reduced; JW.fine = fine; JW.mobile = mobile; JW.lang = lang; JW.lite = LITE; JW.touch = touch; JW.idle = idle; JW.quiet = quiet;
  JW.t = t; JW.smoothstep = smoothstep; JW.clamp01 = clamp01;
  JW.ready = []; JW.started = false;
  JW.onReady = function (fn) { if (JW.started) safe(fn)(); else JW.ready.push(fn); };
  JW.lenis = null;
  JW.ease = { s: "expo.out", l: "expo.inOut", v: "back.out(1.6)", scalpel: "expo.out", lumen: "expo.inOut", servo: "back.out(1.6)", linear: "none" };

  /* ---------- JW.loop: one ticker, gated to the central 60 % of the viewport (§9.1) ---------- */
  var loops = [];
  var tickerOn = false;
  /* lite: ambient loops step at ~30 fps (every 2nd frame at 60 Hz, every 4th at 120 Hz) with the summed dt,
     all on the same frames so the frames in between stay free; opts.fps >= 60 keeps a loop at full rate */
  var LITE_STEP = 0.028, liteAcc = 0;
  function loopTick(time, deltaMs) {
    if (doc.hidden) return;
    var dt = Math.min(0.05, (deltaMs || 16.7) / 1000);
    var step = dt, half = true;
    if (LITE) {
      liteAcc += dt;
      if (liteAcc >= LITE_STEP) { step = Math.min(0.1, liteAcc); liteAcc = 0; } else half = false;
    }
    for (var i = 0; i < loops.length; i++) {
      var L = loops[i];
      if (!L.on || L.dead) continue;
      L.t += dt;
      if (L.full) { try { L.fn(L.t, dt); } catch (e) { L.dead = true; if (window.console) console.warn("[JW.loop]", e); } continue; }
      if (!half) continue;
      try { L.fn(L.t, step); } catch (e) { L.dead = true; if (window.console) console.warn("[JW.loop]", e); }
    }
  }
  function ensureTicker() {
    if (tickerOn) return;
    tickerOn = true;
    if (gsap) gsap.ticker.add(loopTick);
    else {
      var last = performance.now();
      var raf = function (now) { loopTick(now / 1000, now - last); last = now; requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }
  JW.loop = function (host, fn, opts) {
    opts = opts || {};
    if (reduced) {
      /* one static frame; kick(n) re-renders it after an interaction (n settling steps, so damped values arrive at once) */
      var T = opts.staticT != null ? opts.staticT : 1.2;
      try { fn(T, 0); } catch (e) { /* static frame */ }
      return { stop: function () {}, set: function () {}, kick: function (n) { for (var i = 0; i < (n || 8); i++) { try { fn(T, 0.25); } catch (e) { return; } } } };
    }
    var L = { fn: fn, on: false, t: opts.t0 || 0, dead: false, io: null, full: !LITE || (opts.fps || 0) >= 60 };
    if (host && "IntersectionObserver" in window) {
      L.io = new IntersectionObserver(function (es) { L.on = es[es.length - 1].isIntersecting; }, { rootMargin: opts.margin || "-20% 0px -20% 0px" });
      L.io.observe(host);
    } else L.on = true;
    loops.push(L);
    ensureTicker();
    return {
      stop: function () { L.dead = true; if (L.io) L.io.disconnect(); var i = loops.indexOf(L); if (i >= 0) loops.splice(i, 1); },
      set: function (on) { L.on = !!on; },
      kick: function () { /* the ticker is already running */ }
    };
  };

  /* ---------- JW.pathAt: arc-length sampler for a static SVG path, evaluated in JS ----------
     Replaces per-frame getPointAtLength (which re-measures the path and forces a style recalc). The d string
     (M L H V C S Q T Z, absolute or relative) is flattened once into a polyline; anything it cannot parse
     (arcs) is sampled once from the element instead. at(f) -> {x, y} for f = 0..1 of the length (clamped). */
  function flattenPath(d, N, px, py, mv) {
    var tok = String(d || "").match(/[MmLlHhVvCcSsQqTtZzAa]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
    if (!tok || !tok.length) return false;
    var i = 0, cmd = "", prev = "", x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, qx = 0, qy = 0, bad = false;
    function num() { var v = parseFloat(tok[i++]); if (isNaN(v)) bad = true; return v; }
    function pt(X, Y, move) { if (move && px.length) mv[px.length] = true; px.push(X); py.push(Y); }
    function cubic(x1, y1, x2, y2, x3, y3) {
      for (var s = 1; s <= N; s++) {
        var t = s / N, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
        pt(a * x + b * x1 + c * x2 + e * x3, a * y + b * y1 + c * y2 + e * y3);
      }
      x = x3; y = y3;
    }
    function quad(x1, y1, x2, y2) {
      for (var s = 1; s <= N; s++) {
        var t = s / N, u = 1 - t;
        pt(u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2);
      }
      x = x2; y = y2;
    }
    while (i < tok.length && !bad) {
      if (/^[A-Za-z]$/.test(tok[i])) cmd = tok[i++];
      else if (!cmd) return false;
      var C = cmd.toUpperCase(), rel = cmd !== C, ox = rel ? x : 0, oy = rel ? y : 0;
      if (C === "Z") { pt(sx, sy); x = sx; y = sy; prev = "Z"; cmd = ""; continue; }
      if (C === "M") { x = sx = num() + ox; y = sy = num() + oy; pt(x, y, true); cmd = rel ? "l" : "L"; prev = "L"; continue; }
      if (C === "L") { x = num() + ox; y = num() + oy; pt(x, y); prev = "L"; continue; }
      if (C === "H") { x = num() + ox; pt(x, y); prev = "L"; continue; }
      if (C === "V") { y = num() + oy; pt(x, y); prev = "L"; continue; }
      if (C === "C" || C === "S") {
        var x1, y1;
        if (C === "C") { x1 = num() + ox; y1 = num() + oy; }
        else if (prev === "C") { x1 = 2 * x - cx; y1 = 2 * y - cy; }
        else { x1 = x; y1 = y; }
        var x2 = num() + ox, y2 = num() + oy, x3 = num() + ox, y3 = num() + oy;
        if (bad) break;
        cubic(x1, y1, x2, y2, x3, y3); cx = x2; cy = y2; prev = "C"; continue;
      }
      if (C === "Q" || C === "T") {
        var q1, r1;
        if (C === "Q") { q1 = num() + ox; r1 = num() + oy; }
        else if (prev === "Q") { q1 = 2 * x - qx; r1 = 2 * y - qy; }
        else { q1 = x; r1 = y; }
        var q2 = num() + ox, r2 = num() + oy;
        if (bad) break;
        quad(q1, r1, q2, r2); qx = q1; qy = r1; prev = "Q"; continue;
      }
      return false;                                   /* arcs and anything unknown: sample the element */
    }
    return !bad && px.length > 0;
  }
  JW.pathAt = function (src, steps) {
    var el = src && typeof src === "object" ? src : null;
    var px = [], py = [], mv = [];
    if (!flattenPath(el ? el.getAttribute("d") : src, steps || 32, px, py, mv) && el && el.getTotalLength) {
      px = []; py = []; mv = [];
      try {
        var L0 = el.getTotalLength(), M = 64;
        for (var s = 0; s <= M; s++) { var q = el.getPointAtLength(L0 * s / M); px.push(q.x); py.push(q.y); }
      } catch (e) { px = []; py = []; }
    }
    var n = px.length, acc = [0];
    for (var j = 1; j < n; j++) acc.push(acc[j - 1] + (mv[j] ? 0 : Math.hypot(px[j] - px[j - 1], py[j] - py[j - 1])));
    var len = n ? acc[n - 1] : 0, hint = 1;
    return {
      len: len,
      at: function (f) {
        if (!n) return { x: 0, y: 0 };
        if (n < 2 || !len) return { x: px[0], y: py[0] };
        var dd = (f > 0 ? (f < 1 ? f : 1) : 0) * len, k = hint < n ? hint : n - 1;
        while (k > 1 && acc[k - 1] > dd) k--;
        while (k < n - 1 && acc[k] < dd) k++;
        hint = k;
        var seg = acc[k] - acc[k - 1], u = seg > 0 ? (dd - acc[k - 1]) / seg : 1;
        return { x: px[k - 1] + (px[k] - px[k - 1]) * u, y: py[k - 1] + (py[k] - py[k - 1]) * u };
      }
    };
  };

  /* ---------- always-on behaviour (works without GSAP) ---------- */

  var year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* videos */
  safe(function () {
    $$("[data-video]").forEach(function (wrap) {
      var btn = $(".video__btn", wrap) || $("button", wrap);
      if (!btn) return;
      btn.addEventListener("click", function () {
        var f = doc.createElement("iframe");
        f.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(wrap.getAttribute("data-video")) + "?autoplay=1&rel=0";
        f.title = wrap.getAttribute("data-title") || t("video.title");
        f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        f.setAttribute("allowfullscreen", "");
        f.referrerPolicy = "strict-origin-when-cross-origin";
        btn.remove();
        wrap.appendChild(f);
        wrap.classList.add("is-playing");
        try { f.focus(); } catch (e) { /* ignore */ }
      });
    });
  })();

  /* copy + bracket lock (§6.8) */
  function lockAnim(lock) {
    if (!lock) return;
    lock.classList.add("is-locked");
    clearTimeout(lock._jwT);
    if (gsap && !reduced) {
      gsap.killTweensOf(lock);
      gsap.fromTo(lock, { scale: 2.4, rotation: 45, opacity: 0, transformOrigin: "50% 50%" },
        { scale: 1, rotation: 0, opacity: 1, duration: 0.6, ease: JW.ease.v });
      gsap.to(lock, { opacity: 0, duration: 0.3, delay: 2.4, ease: "power1.out", onComplete: function () { lock.classList.remove("is-locked"); } });
    } else {
      lock.style.opacity = "1";
      lock._jwT = setTimeout(function () { lock.style.opacity = "0"; lock.classList.remove("is-locked"); }, 2400);
    }
  }
  JW.lock = lockAnim;
  function copyText(text) {
    return new Promise(function (resolve, reject) {
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(resolve, function () { legacy() ? resolve() : reject(); }); return; }
      legacy() ? resolve() : reject();
      function legacy() {
        try {
          var ta = doc.createElement("textarea");
          ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
          doc.body.appendChild(ta); ta.select();
          var ok = doc.execCommand("copy"); ta.remove(); return ok;
        } catch (e) { return false; }
      }
    });
  }
  safe(function () {
    $$("[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () {
        var scope = b.closest("[data-copy-scope]");
        var status = (scope && $("[data-copy-status]", scope)) || $("#copy-status");
        var lock = scope && $(".lock", scope);
        var labelNode = null;
        for (var i = b.childNodes.length - 1; i >= 0; i--) { if (b.childNodes[i].nodeType === 3 && b.childNodes[i].nodeValue.trim()) { labelNode = b.childNodes[i]; break; } }
        var original = labelNode ? labelNode.nodeValue : null;
        copyText(b.getAttribute("data-copy")).then(function () {
          if (status) status.textContent = t("copy.status");
          if (labelNode) { labelNode.nodeValue = t("copy.done"); clearTimeout(b._jwT); b._jwT = setTimeout(function () { labelNode.nodeValue = original; }, 2400); }
          b.classList.add("is-done"); setTimeout(function () { b.classList.remove("is-done"); }, 2400);
          lockAnim(lock);
        }, function () {
          if (status) status.textContent = t("copy.fail");
        });
      });
    });
  })();

  /* language links carry the hash (§6.4) */
  doc.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest("a[hreflang]");
    if (a && location.hash && a.href.indexOf("#") < 0) a.href = a.href + location.hash;
  }, true);

  /* menu with focus trap (§6.1) */
  var menuBtn = $(".nav__menu"), menu = $("#menu"), nav = $(".nav");
  function focusables(root) {
    return $$('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])', root).filter(function (el) { return el.offsetParent !== null || el === doc.activeElement; });
  }
  function setMenu(open, restore) {
    if (!menuBtn || !menu) return;
    if (html.classList.contains("nav-open") === open) return;
    html.classList.toggle("nav-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", t(open ? "menu.close" : "menu.open"));
    try { menu.inert = !open; } catch (e) { /* ignore */ }
    if (JW.lenis) { if (open) JW.lenis.stop(); else JW.lenis.start(); }
    if (nav) nav.classList.remove("is-hidden");
    if (open) {
      var links = $$("a", menu);
      if (gsap && !reduced && links.length) {
        gsap.fromTo(links, { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.6, ease: JW.ease.s, stagger: 0.05, delay: 0.08, clearProps: "transform,opacity" });
      }
      setTimeout(function () { var f = focusables(menu)[0]; if (f) f.focus(); }, 60);
    } else if (restore) menuBtn.focus();
  }
  JW.menu = { open: function () { setMenu(true); }, close: function (r) { setMenu(false, r); } };
  if (menuBtn && menu) {
    try { menu.inert = true; } catch (e) { /* ignore */ }
    menuBtn.addEventListener("click", function () { setMenu(!html.classList.contains("nav-open"), true); });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false, false); });
    doc.addEventListener("keydown", function (e) {
      if (!html.classList.contains("nav-open")) return;
      if (e.key === "Escape") { e.preventDefault(); setMenu(false, true); return; }
      if (e.key === "Tab") {
        var list = [menuBtn].concat(focusables(menu));
        var i = list.indexOf(doc.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); list[list.length - 1].focus(); }
        else if (!e.shiftKey && (i === list.length - 1 || i < 0)) { e.preventDefault(); list[0].focus(); }
      }
    });
    window.addEventListener("resize", function () { if (window.innerWidth >= 1000) setMenu(false, false); });
  }

  /* fallback styles for markup this package adds (zero specificity via :where, so site.css always wins).
     They only make sure the close button and the Beyond pane art are usable even before the stylesheet
     knows about them. */
  safe(function () {
    if (doc.getElementById("jw-m-fallback")) return;
    var st = doc.createElement("style");
    st.id = "jw-m-fallback";
    st.textContent = [
      ":where(.explain__x){display:none}",
      ":where(.js .explain .explain__x){position:absolute;top:10px;right:10px;z-index:3;display:grid;place-items:center;width:32px;height:32px;margin:0;padding:0;border:1px solid var(--line-strong,rgba(255,255,255,.3));border-radius:50%;background:var(--surface,#14151c);color:var(--ink-2,#c8c8d0);cursor:pointer;transition:color .2s,border-color .2s,transform .3s}",
      ":where(.js .explain .explain__x)::after{content:\"\";position:absolute;inset:-6px;border-radius:50%}",
      ":where(.js .explain .explain__x):hover{color:var(--acc,#fff);border-color:var(--acc,#fff);transform:rotate(90deg)}",
      ":where(.js .explain .explain__x) svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round}",
      ":where(.js .explain .explain__k){padding-right:40px}",
      ":where(.pane__art){position:absolute;left:0;right:0;top:15%;height:50%;z-index:0;pointer-events:none;overflow:visible}",
      ":where(.pane__art) svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}",
      /* infinite CSS loops hold still while their section is off-screen (see pauseOffscreen below) */
      ".jw-offscreen .slide__card,.jw-offscreen .slide__card::before,.jw-offscreen .slide__card::after,.jw-offscreen .pane__spot::before,.jw-offscreen .live-dot::after{animation-play-state:paused!important}"
    ].join("\n");
    var head = doc.head || doc.documentElement;
    head.insertBefore(st, head.firstChild);
  })();

  /* explanation cards (§5.7, revised): opened ONLY by the (i) button (click / tap / Enter / Space); closed by
     the x inside the card, the (i) again, Escape, a pointer-down outside the card, or the figure leaving the
     viewport. No hover or focus opening, so a card never appears while someone plays with a figure. The card
     never takes pointer events outside itself, and on the hero it is moved off the lens if it would cover the
     drag / hold area. Focus returns to the (i) on close. Works without GSAP. */
  var Explain = (function () {
    var current = null;
    function parts(fig) {
      if (fig._jwEx) return fig._jwEx;
      var info = $(".fig__info", fig);
      var id = info && info.getAttribute("aria-controls");
      var card = (id && doc.getElementById(id)) || $(".explain", fig);
      var stage = $(".scope__stage, .fig__stage, .monitor__screen", fig);
      var x = card && $(".explain__x", card);
      fig._jwEx = { info: info, card: card, stage: stage, x: x, open: false, moved: false, clearT: 0 };
      return fig._jwEx;
    }
    function sync(fig) {
      var p = parts(fig);
      if (p.card) {
        p.card.classList.toggle("is-open", p.open);
        p.card.classList.toggle("is-pinned", p.open);
        p.card.style.pointerEvents = "";
      }
      fig.classList.toggle("is-explaining", p.open);
      if (p.info) {
        p.info.setAttribute("aria-expanded", String(p.open));
        var vh = $(".vh", p.info);
        if (vh) vh.textContent = t(p.open ? "explain.hide" : "explain.show");
      }
      if (p.x) p.x.tabIndex = p.open ? 0 : -1;
    }
    /* keep the hero card off the lens: only acts when the stylesheet's placement would cover the circle */
    function clearMove(p) {
      if (!p.moved || !p.card) return;
      p.moved = false;
      ["left", "right", "top", "bottom", "width"].forEach(function (k) { p.card.style.removeProperty(k); });
    }
    function avoidStage(fig) {
      var p = parts(fig);
      if (!p.card || !p.stage || !fig.matches(".scope")) return;
      clearTimeout(p.clearT);
      clearMove(p);
      var cs = getComputedStyle(p.card);
      if (cs.position !== "absolute" && cs.position !== "fixed") return;
      var sr = p.stage.getBoundingClientRect(), cr = p.card.getBoundingClientRect(), fr = fig.getBoundingClientRect();
      if (!sr.width || !cr.width) return;
      var cx = sr.left + sr.width / 2, cy = sr.top + sr.height / 2, R = Math.min(sr.width, sr.height) / 2;
      var nx = Math.max(cr.left, Math.min(cx, cr.right)), ny = Math.max(cr.top, Math.min(cy, cr.bottom));
      if (Math.hypot(nx - cx, ny - cy) >= R - 1) return;          /* already clear of the lens */
      var w = cr.width, h = cr.height, gap = 24;
      var left = sr.left - fr.left - w - gap;                       /* to the left of the lens, bottom-aligned */
      var top = sr.bottom - fr.top - h;
      if (fr.left + left < 12) {                                    /* no room on the left: under the lens */
        left = sr.left - fr.left + (sr.width - w) / 2;
        top = sr.bottom - fr.top + 16;
      }
      p.card.style.right = "auto"; p.card.style.bottom = "auto";
      p.card.style.left = left.toFixed(1) + "px"; p.card.style.top = top.toFixed(1) + "px";
      p.card.style.width = w.toFixed(1) + "px";
      p.moved = true;
    }
    function open(fig) {
      if (!fig) return;
      var p = parts(fig);
      if (!p.card) return;
      if (current && current !== fig) close(current, "switch");
      p.open = true;
      current = fig;
      sync(fig);
      avoidStage(fig);
    }
    function close(fig, how) {
      fig = fig || current;
      if (!fig) return;
      var p = parts(fig);
      if (!p.open) return;
      var focusInside = p.card && p.card.contains(doc.activeElement);
      p.open = false;
      if (current === fig) current = null;
      sync(fig);
      if (p.info && (how === "x" || how === "esc" || (focusInside && how !== "outside"))) {
        try { p.info.focus({ preventScroll: true }); } catch (e) { p.info.focus(); }
      }
      if (p.moved) { clearTimeout(p.clearT); p.clearT = setTimeout(function () { if (!p.open) clearMove(p); }, 420); }
    }
    function toggle(fig) { if (parts(fig).open) close(fig, "info"); else open(fig); }
    function isOpen(fig) { return !!(fig && parts(fig).open); }
    function init() {
      var figs = $$(".fig[data-explain]");
      figs.forEach(function (fig) {
        var p = parts(fig);
        if (!p.card) return;
        sync(fig);
        if (p.info) p.info.addEventListener("click", function (e) { e.preventDefault(); toggle(fig); });
        if (p.x) { p.x.hidden = false; p.x.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); close(fig, "x"); }); }
      });
      doc.addEventListener("keydown", function (e) {
        if (e.key !== "Escape" || !current || html.classList.contains("nav-open")) return;
        close(current, "esc");
      });
      /* a pointer-down anywhere outside the open card (and outside its own (i), which toggles) closes it */
      doc.addEventListener("pointerdown", function (e) {
        if (!current) return;
        var p = parts(current), tg = e.target;
        if (p.card && p.card.contains(tg)) return;
        if (p.info && p.info.contains(tg)) return;
        close(current, "outside");
      }, true);
      /* a card whose figure scrolls away closes itself */
      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (en) { if (!en.isIntersecting && isOpen(en.target)) close(en.target, "away"); });
        }, { threshold: 0 });
        figs.forEach(function (f) { io.observe(f); });
      }
      window.addEventListener("resize", function () { if (current) avoidStage(current); });
    }
    return { open: function (fig) { open(fig); }, close: function (fig) { close(fig, "api"); }, toggle: toggle, isOpen: isOpen, init: init };
  })();
  JW.explain = Explain;
  safe(Explain.init)();

  /* off-screen sections pause their infinite CSS loops (the spinning gallery rim animates a registered custom
     property, i.e. style + paint on the main thread every frame, even 5000 px below the viewport) */
  safe(function pauseOffscreen() {
    if (!("IntersectionObserver" in window)) return;
    var hosts = $$(".gallery, .beyond");
    $$(".live-dot").forEach(function (d) {
      var h = d.closest("section, header, footer, .rs") || d.parentElement;
      if (h && hosts.indexOf(h) < 0) hosts.push(h);
    });
    if (!hosts.length) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { e.target.classList.toggle("jw-offscreen", !e.isIntersecting); });
    }, { rootMargin: "80px 0px" });
    hosts.forEach(function (h) { io.observe(h); });
  })();

  /* ---------- pools (§6.7) ---------- */
  var Pool = (function () {
    var backdrop = $(".field-backdrop");
    var layers = {}, channels = {}, holds = {}, setters = {}, leftOwner = {}, shown = {};
    var factor = mobile ? 0.6 : 1;
    function ensureBackdrop() {
      if (backdrop) return backdrop;
      backdrop = doc.createElement("div");
      backdrop.className = "field-backdrop"; backdrop.setAttribute("aria-hidden", "true");
      doc.body.insertBefore(backdrop, doc.body.firstChild);
      return backdrop;
    }
    function layer(hue) {
      if (layers[hue]) return layers[hue];
      var b = ensureBackdrop();
      var el = doc.createElement("div");
      el.className = "pool"; el.setAttribute("data-hue", hue); el.style.opacity = "0";
      var grain = $(".grain", b);
      if (grain) b.insertBefore(el, grain); else b.appendChild(el);
      layers[hue] = el; channels[hue] = {};
      setters[hue] = gsap ? gsap.quickSetter(el, "opacity") : function (v) { el.style.opacity = v; };
      return el;
    }
    function apply(hue) {
      layer(hue);
      var ch = channels[hue], m = 0, owner = null;
      for (var k in ch) { if (ch[k].v > m) { m = ch[k].v; owner = ch[k]; } }
      if (holds[hue]) m = 1;
      /* scroll handlers call this every frame; only a changed value reaches the style */
      var val = Math.round(clamp01(m) * factor * 1000) / 1000;
      if (shown[hue] !== val) {
        shown[hue] = val; setters[hue](val);
        /* lite: an unlit pool leaves the compositor (each one is a full-screen layer) */
        if (LITE) layers[hue].style.visibility = val > 0 ? "" : "hidden";
      }
      if (!mobile) {
        var left = !!(owner && owner.left && !holds[hue]);
        if (left !== leftOwner[hue]) { leftOwner[hue] = left; if (left) layers[hue].style.setProperty("--px", "26%"); else layers[hue].style.removeProperty("--px"); }
      }
    }
    function set(hue, v, channel, left) {
      if (!hue) return;
      layer(hue);
      var c = channels[hue][channel || "js"] || (channels[hue][channel || "js"] = { v: 0, left: false });
      c.v = +v || 0; c.left = !!left;
      apply(hue);
    }
    function hold(hue) { holds[hue] = true; apply(hue); }
    function release(hue) { if (!holds[hue]) return; holds[hue] = false; apply(hue); }
    function init() {
      var secs = $$("[data-chapter][data-hue]").filter(function (s) { return s.getAttribute("data-pool") !== "none"; });
      if (!secs.length) return;
      secs.forEach(function (s) { layer(s.getAttribute("data-hue")); });
      if (reduced || !ST) {
        if (!("IntersectionObserver" in window)) return;
        /* static light: the chapter under the viewport centre owns the pool; an unlit chapter (no hue, or
           data-pool="none") switches every pool off */
        var all = $$("[data-chapter]").filter(function (el) { return !(el.parentElement && el.parentElement.closest("[data-chapter]")); });
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            if (!e.isIntersecting) return;
            var s = e.target, hue = s.getAttribute("data-hue");
            Object.keys(channels).forEach(function (h) { set(h, 0, "rm"); });
            if (hue && s.getAttribute("data-pool") !== "none") set(hue, 1, "rm", s.getAttribute("data-pool") === "left");
          });
        }, { rootMargin: "-50% 0px -50% 0px" });
        all.forEach(function (s) { io.observe(s); });
        return;
      }
      secs.forEach(function (s, i) {
        var hue = s.getAttribute("data-hue"), left = s.getAttribute("data-pool") === "left", ch = "s" + i;
        ST.create({
          trigger: s, start: "top center", end: "bottom center",
          onUpdate: function (self) { var p = self.progress; set(hue, smoothstep(0, 0.22, p) * (1 - smoothstep(0.78, 1, p)), ch, left); },
          onRefresh: function (self) { var p = self.progress; set(hue, smoothstep(0, 0.22, p) * (1 - smoothstep(0.78, 1, p)), ch, left); }
        });
      });
    }
    return { set: set, hold: hold, release: release, init: init, layer: layer };
  })();
  JW.pool = { set: Pool.set, hold: Pool.hold, release: Pool.release };

  /* ---------- toast + switcher shimmer (§6.5) ---------- */
  var switcher = $(".switcher"), toast = $("#switch-toast");
  var loaderDone = false, toastShown = false, toastPending = null, toastHideT = 0;
  function shimmer() {
    if (!switcher || reduced) return;
    clearTimeout(switcher._jwT);
    var on = function () {
      switcher.classList.add("is-shimmer");
      switcher._jwT = setTimeout(function () { switcher.classList.remove("is-shimmer"); }, 1700);
    };
    /* restart without a forced reflow: drop the class, let one frame style without it, then add it back */
    if (switcher.classList.contains("is-shimmer")) {
      switcher.classList.remove("is-shimmer");
      requestAnimationFrame(function () { requestAnimationFrame(on); });
    } else on();
  }
  /* html.has-toast keeps the nav in view while the toast shows (replaces an html:has() rule that turned every
     DOM insertion into a full-document style recalc) */
  function hideToast() {
    if (!toast || toast.hidden) return;
    clearTimeout(toastHideT);
    var done = function () { toast.hidden = true; html.classList.remove("has-toast"); if (switcher) switcher.classList.remove("has-toast"); };
    if (gsap && !reduced) gsap.to(toast, { y: 12, opacity: 0, duration: 0.24, ease: "power2.in", onComplete: done });
    else done();
  }
  function showToast() {
    if (!toast || toastShown) return;
    toastShown = true;
    ss("jw-switch-seen", "1");
    toast.hidden = false;
    html.classList.add("has-toast");
    if (nav) nav.classList.remove("is-hidden");
    if (switcher) switcher.classList.add("has-toast");
    shimmer();
    if (gsap && !reduced) gsap.fromTo(toast, { y: 16, opacity: 0, scale: 0.97, transformOrigin: "100% 100%" }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: JW.ease.s, clearProps: "transform" });
    /* a short note, not a banner: it leaves on its own after 5 s, or as soon as the reader scrolls on */
    toastHideT = setTimeout(hideToast, 5000);
    var y0 = window.scrollY, t0 = performance.now();
    var onSc = function () {
      if (toast.hidden) { window.removeEventListener("scroll", onSc); return; }
      if (performance.now() - t0 > 1200 && Math.abs(window.scrollY - y0) > Math.min(480, window.innerHeight * 0.5)) {
        window.removeEventListener("scroll", onSc);
        hideToast();
      }
    };
    window.addEventListener("scroll", onSc, { passive: true });
  }
  JW.toast = {
    maybeShow: function (reason) {
      if (!toast || toastShown || ss("jw-switch-seen") === "1") return;
      if (!loaderDone) { toastPending = reason || "pending"; return; }
      showToast();
    },
    hide: hideToast
  };
  if (toast) {
    var x = $(".switcher__x", toast), go = $(".switcher__go", toast);
    if (x) x.addEventListener("click", hideToast);
    if (go) go.addEventListener("click", function () { ss("jw-switch-seen", "1"); });
    doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && !toast.hidden) hideToast(); });
  }
  var swBtn = $(".switcher__btn");
  if (swBtn) swBtn.addEventListener("click", function () { ss("jw-switch-seen", "1"); });

  /* ---------- no GSAP: show everything and stop here ---------- */
  function revealAllStatic() {
    $$("[data-split]").forEach(function (e) { e.classList.add("is-split"); });
    $$("[data-reveal]").forEach(function (e) { e.style.opacity = "1"; e.style.transform = "none"; e.style.clipPath = "none"; });
  }
  if (!gsap) {
    var l0 = $(".loader"); if (l0) l0.classList.add("is-done");
    revealAllStatic();
    loaderDone = true;
    Pool.init();
    JW.started = true;
    JW.ready.forEach(function (f) { safe(f)(); });
    return;
  }

  /* ---------- GSAP setup ---------- */
  ["ScrollTrigger", "SplitText", "ScrambleTextPlugin", "DrawSVGPlugin", "CustomEase", "Flip", "Draggable", "InertiaPlugin"].forEach(function (p) {
    if (window[p]) { try { gsap.registerPlugin(window[p]); } catch (e) { /* ignore */ } }
  });
  if (window.CustomEase) {
    window.CustomEase.create("scalpel", "M0,0 C0.16,1 0.3,1 1,1");
    window.CustomEase.create("lumen", "M0,0 C0.83,0 0.17,1 1,1");
    window.CustomEase.create("servo", "M0,0 C0.18,0 0.22,1.14 0.52,1.04 C0.7,0.98 0.84,1.005 1,1");
    JW.ease = { s: "scalpel", l: "lumen", v: "servo", scalpel: "scalpel", lumen: "lumen", servo: "servo", linear: "none" };
  }
  var E = JW.ease;
  if (ST) ST.config({ ignoreMobileResize: true });

  /* ---------- smooth scroll (Lenis) ---------- */
  /* not on touch: Lenis never smooths touch (syncTouch off), but its non-passive touchmove listener makes every
     swipe wait for the main thread, and it doubles ScrollTrigger updates. Phones keep native scrolling. */
  var lenis = null;
  if (!reduced && window.Lenis && !(LITE && touch)) {
    try {
      lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.95, touchMultiplier: 1.4 });
      if (ST) lenis.on("scroll", ST.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    } catch (e) { lenis = null; }
  }
  window.lenis = lenis;
  JW.lenis = lenis;
  function navOffset() {
    var h = nav ? nav.offsetHeight : 60;
    var toc = $(".toc");
    if (toc) {
      var cs = getComputedStyle(toc);
      if (cs.position === "sticky" && toc.offsetWidth > window.innerWidth * 0.6) h += toc.offsetHeight;
    }
    return h + 20;
  }
  JW.navOffset = navOffset;
  JW.scrollTo = function (target, opts) {
    opts = opts || {};
    if (lenis) lenis.scrollTo(target, { offset: opts.offset != null ? opts.offset : 0, duration: opts.duration || 1.2, immediate: !!opts.immediate, force: true, easing: function (x) { return 1 - Math.pow(1 - x, 4); } });
    else {
      var y = typeof target === "number" ? target : target.getBoundingClientRect().top + window.scrollY + (opts.offset || 0);
      window.scrollTo({ top: y, behavior: opts.immediate || reduced ? "auto" : "smooth" });
    }
  };
  doc.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || a.classList.contains("skip-link")) return;
    var id = a.getAttribute("href");
    if (id.length < 2) return;
    var target;
    try { target = doc.getElementById(decodeURIComponent(id.slice(1))); } catch (err) { target = null; }
    if (!target) return;
    e.preventDefault();
    JW.scrollTo(target, { offset: -navOffset() });
    try { history.pushState(null, "", id); } catch (err) { /* file:// */ }
    if (!target.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) target.setAttribute("tabindex", "-1");
    setTimeout(function () { try { target.focus({ preventScroll: true }); } catch (err) { /* ignore */ } }, lenis ? 900 : 0);
  });

  /* ---------- nav: scrolled / hidden / progress / counter (§6.1) ---------- */
  if (nav) {
    /* the position is read in the scroll event (style is clean there); the rAF only toggles classes */
    var lastY = window.scrollY, curY = lastY, navRaf = 0, scrolled = null;
    var setHidden = function (h) { if (nav.classList.contains("is-hidden") !== h) nav.classList.toggle("is-hidden", h); };
    var onScroll = function () {
      navRaf = 0;
      var y = curY;
      if ((y > 24) !== scrolled) { scrolled = y > 24; nav.classList.toggle("is-scrolled", scrolled); }
      var focusIn = nav.contains(doc.activeElement);
      if (html.classList.contains("nav-open") || focusIn || y < 600 || (toast && !toast.hidden)) setHidden(false);
      else if (y > lastY + 4) setHidden(true);
      else if (y < lastY - 4) setHidden(false);
      lastY = y;
    };
    window.addEventListener("scroll", function () { curY = window.scrollY; if (!navRaf) navRaf = requestAnimationFrame(onScroll); }, { passive: true });
    nav.addEventListener("focusin", function () { setHidden(false); });
    onScroll();
  }
  var prog = $(".nav__progress"), progBar = prog && $("i", prog);
  if (prog && ST) {
    /* the bar's own transform on its own layer: no custom property on the parent, no nav repaint per frame */
    var lastP = -1;
    var setP = progBar ? function (v) {
      var r = Math.round(v * 10000) / 10000;
      if (r === lastP) return;
      lastP = r; progBar.style.transform = "scaleX(" + r + ")";
    } : function (v) { prog.style.setProperty("--p", v.toFixed(4)); };
    if (progBar) progBar.style.willChange = "transform";
    setP(0);
    ST.create({ start: 0, end: "max", onUpdate: function (s) { setP(s.progress); }, onRefresh: function (s) { setP(s.progress); } });
  }
  safe(function () {
    var count = $(".nav__count");
    if (!count || !ST) return;
    var chapters = $$("[data-chapter]").filter(function (el) { return !(el.parentElement && el.parentElement.closest("[data-chapter]")); });
    if (!chapters.length) return;
    var total = String(chapters.length).padStart(2, "0");
    count.textContent = "";
    var mask = doc.createElement("span"); mask.style.cssText = "display:inline-block;overflow:hidden;vertical-align:bottom;line-height:inherit";
    var num = doc.createElement("span"); num.style.display = "inline-block"; mask.appendChild(num);
    var rest = doc.createElement("span");
    var name = doc.createElement("span"); name.style.display = "inline-block";
    count.appendChild(mask); count.appendChild(rest); count.appendChild(name);
    rest.textContent = " / " + total + " · ";
    var cur = -1;
    var setCount = function (i) {
      if (i === cur) return;
      var dir = i > cur ? 1 : -1, first = cur < 0;
      cur = i;
      var n = String(i + 1).padStart(2, "0"), label = chapters[i].getAttribute("data-chapter") || "";
      if (first || reduced) { num.textContent = n; name.textContent = label; return; }
      gsap.killTweensOf([num, name]);
      gsap.to(num, { yPercent: -100 * dir, duration: 0.12, ease: "power2.in", onComplete: function () {
        num.textContent = n;
        gsap.fromTo(num, { yPercent: 100 * dir }, { yPercent: 0, duration: 0.12, ease: "power2.out" });
      } });
      gsap.to(name, { opacity: 0, duration: 0.1, onComplete: function () { name.textContent = label; gsap.to(name, { opacity: 1, duration: 0.14 }); } });
    };
    setCount(0);
    chapters.forEach(function (el, i) {
      ST.create({ trigger: el, start: "top center", end: "bottom center", onToggle: function (s) { if (s.isActive) setCount(i); } });
    });
  })();

  /* ---------- cursor (§6.2) and magnetic ---------- */
  JW.cursor = { force: function () {}, refresh: function () {} };
  if (fine && !reduced) safe(function () {
    var cur = doc.createElement("div");
    cur.className = "cursor"; cur.setAttribute("aria-hidden", "true");
    cur.innerHTML = '<div class="cursor__ring"></div><div class="cursor__label"></div>';
    doc.body.appendChild(cur);
    var label = cur.lastChild;
    gsap.set(cur, { x: -100, y: -100 });
    var xTo = gsap.quickTo(cur, "x", { duration: 0.35, ease: "power3" });
    var yTo = gsap.quickTo(cur, "y", { duration: 0.35, ease: "power3" });
    var visible = false, forced = null, lastTarget = null;
    var SPEC = { coils: "cursor.drag", embodiment: "cursor.steer", lumen: "cursor.steer", pose: "cursor.steer" };
    function labelFor(target) {
      if (!target || !target.closest) return "";
      var host = target.closest("[data-cursor], .video, .scope__stage, .doc");
      if (!host) return "";
      var own = host.getAttribute("data-cursor");
      if (own) return own;
      if (host.matches(".video, [data-video]")) return t("cursor.play");
      if (host.matches(".doc")) return t("cursor.open");
      if (host.matches(".scope__stage")) return target.closest(".scope__handle") ? t("cursor.drag") : t("cursor.steer");
      var sp = host.getAttribute("data-specimen");
      if (sp && SPEC[sp]) return t(SPEC[sp]);
      return "";
    }
    function update(target) {
      lastTarget = target;
      if (target && target.closest && target.closest("input, textarea, select, [contenteditable]")) { cur.classList.remove("is-visible"); return; }
      if (visible) cur.classList.add("is-visible");
      var text = forced != null ? forced : labelFor(target);
      if (label.textContent !== text) label.textContent = text;
      cur.classList.toggle("has-label", !!text);
      cur.classList.toggle("is-hover", !text && !!(target && target.closest && target.closest("a, button, [data-tilt], [role='button'], label")));
    }
    window.addEventListener("pointermove", function (e) {
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      if (!visible) { visible = true; gsap.set(cur, { x: e.clientX, y: e.clientY }); cur.classList.add("is-visible"); }
      xTo(e.clientX); yTo(e.clientY);
    }, { passive: true });
    doc.addEventListener("pointerover", function (e) { update(e.target); });
    doc.documentElement.addEventListener("pointerleave", function () { cur.classList.remove("is-visible"); visible = false; });
    window.addEventListener("blur", function () { cur.classList.remove("is-visible"); visible = false; });
    JW.cursor = {
      force: function (text) { forced = text == null ? null : String(text); update(lastTarget); },
      refresh: function () { update(lastTarget); }
    };
    $$("[data-magnetic]").forEach(function (m) {
      var mx = gsap.quickTo(m, "x", { duration: 0.6, ease: E.v });
      var my = gsap.quickTo(m, "y", { duration: 0.6, ease: E.v });
      m.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "mouse") return;
        var r = m.getBoundingClientRect();
        mx((e.clientX - r.left - r.width / 2) * 0.15);
        my((e.clientY - r.top - r.height / 2) * 0.15);
      });
      m.addEventListener("pointerleave", function () { mx(0); my(0); });
    });
  })();

  /* ---------- page transition fallback: one ground-coloured curtain (§6.4) ---------- */
  var nativeVT = ("CSSViewTransitionRule" in window) || ("onpagereveal" in window);
  var arriving = false;
  safe(function () {
    if (reduced || nativeVT) { ss("jw-curtain", null); return; }
    var curtain = doc.createElement("div");
    curtain.className = "curtain"; curtain.setAttribute("aria-hidden", "true");
    curtain.style.clipPath = "circle(0px at 50% 50%)"; curtain.style.pointerEvents = "none";
    doc.body.appendChild(curtain);
    arriving = ss("jw-curtain") === "1";
    try { sessionStorage.removeItem("jw-curtain"); } catch (e) { /* ignore */ }
    if (arriving) {
      gsap.fromTo(curtain, { clipPath: "circle(150vmax at 50% 50%)" }, { clipPath: "circle(0vmax at 50% 50%)", duration: 0.7, ease: E.l, delay: 0.05 });
    }
    doc.addEventListener("click", function (e) {
      var a = e.target && e.target.closest && e.target.closest("a[href]");
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (a.target === "_blank" || a.hasAttribute("download")) return;
      var url;
      try { url = new URL(a.href, location.href); } catch (err) { return; }
      if (url.origin !== location.origin || !/(\.html|\/)$/.test(url.pathname)) return;
      if (url.pathname === location.pathname) return;
      e.preventDefault();
      ss("jw-curtain", "1");
      var x0 = e.clientX || window.innerWidth / 2, y0 = e.clientY || window.innerHeight / 2;
      gsap.fromTo(curtain, { clipPath: "circle(0px at " + x0 + "px " + y0 + "px)" },
        { clipPath: "circle(150vmax at " + x0 + "px " + y0 + "px)", duration: 0.6, ease: E.l, onComplete: function () { location.href = a.href; } });
    });
    window.addEventListener("pageshow", function (e) { if (e.persisted) gsap.set(curtain, { clipPath: "circle(0px at 50% 50%)" }); });
  })();

  /* ---------- one-shot entrances with batching (§10) ---------- */
  var pending = [];
  var batch = [], batchRaf = 0;
  var ROLE_DELAY = { figure: 0, title: 0.08, meta: 0.2, body: 0.26 };
  /* lite: at most FLUSH_CAP entrances start per frame (each start reads styles); the rest start on the next
     frames with the delays of the batch they arrived in, less the time already waited */
  var FLUSH_CAP = LITE ? 6 : 1e9, startQ = [], startRaf = 0;
  function drain() {
    startRaf = 0;
    var now = performance.now(), n = 0;
    while (startQ.length && n < FLUSH_CAP) {
      var it = startQ.shift(); n++;
      safe(it.fn)(Math.max(0, it.d - (now - it.t0) / 1000));
    }
    if (startQ.length) startRaf = requestAnimationFrame(drain);
  }
  function flush() {
    batchRaf = 0;
    var b = batch; batch = [];
    var single = b.length === 1, counts = {}, now = performance.now();
    b.forEach(function (it) {
      var k = counts[it.role] = (counts[it.role] || 0) + 1;
      var d = single ? 0 : (ROLE_DELAY[it.role] || 0) + Math.min(k - 1, 5) * 0.06;
      startQ.push({ fn: it.fn, d: d + (it.extra || 0), t0: now });
    });
    if (!startRaf) drain();
  }
  function enqueue(fn, role, extra) { batch.push({ fn: fn, role: role || "body", extra: extra || 0 }); if (!batchRaf) batchRaf = requestAnimationFrame(flush); }
  function onEnter(el, fn, opts) {
    opts = opts || {};
    if (!ST) { fn(0); return; }
    var rec = { done: false, st: null };
    var fire = function () { if (rec.done) return; rec.done = true; enqueue(fn, opts.role, opts.delay); };
    rec.fire = fire;
    rec.st = ST.create({ trigger: opts.trigger || el, start: opts.start || "top 88%", once: true, onEnter: fire, onLeave: fire, onEnterBack: fire });
    pending.push(rec);
  }
  JW.onEnter = onEnter;
  if (ST) ST.addEventListener("refresh", function () {
    var max = ST.maxScroll(window);
    pending = pending.filter(function (r) {
      if (r.done) return false;
      if (r.st && r.st.start >= max - 2) { r.fire(); try { r.st.kill(); } catch (e) { /* ignore */ } return false; }
      return true;
    });
  });
  function roleOf(el) {
    var k = el.getAttribute("data-reveal");
    if (k === "figure" || k === "mask") return "figure";
    if (el.matches(".meta-row, .t-meta, .eyebrow, .page-head__interests, .pub__venue")) return "meta";
    return "body";
  }

  /* ---------- splits (§10, zh rules §3.4) ---------- */
  var CJK = /[⺀-⿿　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/;
  function padMasks(self, el) {
    var masks = (self && self.masks && self.masks.length) ? self.masks : $$("[class*='-mask']", el);
    masks.forEach(function (m) { m.style.paddingBottom = "0.14em"; m.style.marginBottom = "-0.14em"; m.style.paddingRight = "0.08em"; m.style.marginRight = "-0.08em"; });
  }
  /* SplitText measures glyphs, so it waits for the webfonts (capped, so a slow font never hides a heading) */
  function whenFonts(fn, cap) {
    var f = doc.fonts;
    if (!f || f.status === "loaded") { fn(); return; }
    var done = false, go = function () { if (!done) { done = true; fn(); } };
    try { f.ready.then(go, go); } catch (e) { go(); }
    setTimeout(go, cap || 1400);
  }
  JW.whenFonts = whenFonts;
  function splitIn(el, opts) {
    opts = opts || {};
    if (!el || el._jwSplit) return null;
    var mode = el.getAttribute("data-split") || "lines";
    var delay = opts.delay || 0;
    if (reduced || !window.SplitText) { el._jwSplit = true; el.classList.add("is-split"); return null; }
    var text = (el.textContent || "").replace(/\s+/g, "");
    var cjkBlock = CJK.test(text) && !(mode === "chars" && text.length <= 6);
    /* chars are measured once (no autoSplit), so they wait for the webfonts; lines use autoSplit and
       the CJK block reveal measures nothing, so both start at once */
    if (mode === "chars" && !cjkBlock && !opts.fontsOk && doc.fonts && doc.fonts.status !== "loaded") {
      whenFonts(function () { opts.fontsOk = true; splitIn(el, opts); });
      return null;
    }
    el._jwSplit = true;
    if (cjkBlock) {
      el.classList.add("is-split");
      return gsap.fromTo(el, { clipPath: "inset(0 0 100% 0)", y: 16 }, {
        clipPath: "inset(0 0 0% 0)", y: 0, duration: 0.8, ease: E.s, delay: delay,
        onComplete: function () { el.style.clipPath = ""; gsap.set(el, { clearProps: "transform" }); }
      });
    }
    if (mode === "chars") {
      var sc = new window.SplitText(el, { type: CJK.test(text) ? "chars" : "words,chars", charsClass: "ch", wordsClass: "wd" });
      el.classList.add("is-split");
      return gsap.fromTo(sc.chars, { yPercent: 110, rotateX: -40, opacity: 0 }, {
        yPercent: 0, rotateX: 0, opacity: 1, transformOrigin: "50% 100%", stagger: 0.018, duration: 1, ease: E.s, delay: delay,
        onComplete: function () { if (!opts.keep) sc.revert(); }
      });
    }
    var tw = null, ended = false;
    var sl = new window.SplitText(el, {
      type: "lines", mask: "lines", linesClass: "ln", autoSplit: true,
      onSplit: function (self) {
        el.classList.add("is-split");
        padMasks(self, el);
        if (ended) return null;
        tw = gsap.fromTo(self.lines, { yPercent: 100 }, {
          yPercent: 0, stagger: 0.06, duration: 0.8, ease: E.s, delay: delay,
          onComplete: function () { ended = true; try { self.revert(); } catch (e) { /* ignore */ } }
        });
        return tw;
      }
    });
    el.classList.add("is-split");
    return tw || sl;
  }
  JW.splitIn = splitIn;

  /* ---------- reveals (§5.3) ---------- */
  var REVEAL = {
    up: [{ opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5 }],
    fade: [{ opacity: 0 }, { opacity: 1, duration: 0.5 }],
    mask: [{ clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.9 }],
    figure: [{ opacity: 0, y: 24, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.7 }]
  };
  var revealEls = $$("[data-reveal]");
  var splitEls = $$("[data-split]").filter(function (el) { return !el.hasAttribute("data-split-manual"); });
  if (reduced) {
    revealAllStatic();
  } else {
    revealEls.forEach(function (el) {
      var r = REVEAL[el.getAttribute("data-reveal")] || REVEAL.up;
      gsap.set(el, r[0]);
    });
  }

  /* odometers (§7.6): masked digit columns that settle on the HTML value */
  function buildOdo(el) {
    if (el._jwOdo) return el._jwOdo;
    var final = (el.textContent || "").trim();
    if (!final || !/\d/.test(final)) return null;
    el.textContent = "";
    var sr = doc.createElement("span"); sr.className = "vh"; sr.textContent = final;
    var vis = doc.createElement("span"); vis.setAttribute("aria-hidden", "true"); vis.style.cssText = "display:inline-flex;white-space:nowrap";
    var cols = [];
    final.split("").forEach(function (ch, i) {
      if (!/\d/.test(ch)) { var s = doc.createElement("span"); s.textContent = ch; vis.appendChild(s); return; }
      var d = +ch, steps = 3 + ((d * 7 + i * 3) % 4);
      var col = doc.createElement("span");
      col.style.cssText = "position:relative;display:inline-block;overflow:hidden;vertical-align:top";
      var ghost = doc.createElement("span"); ghost.textContent = ch; ghost.style.cssText = "display:inline-block;visibility:hidden";
      var strip = doc.createElement("span"); strip.style.cssText = "position:absolute;left:0;top:0;display:flex;flex-direction:column;text-align:center;width:100%";
      for (var k = steps; k >= -1; k--) { var row = doc.createElement("span"); row.style.display = "block"; row.textContent = String(((d - k) % 10 + 10) % 10); strip.appendChild(row); }
      col.appendChild(ghost); col.appendChild(strip); vis.appendChild(col);
      cols.push({ strip: strip, rows: steps + 2, steps: steps });
    });
    el.appendChild(sr); el.appendChild(vis);
    var api = {
      play: function (delay) {
        var tl = gsap.timeline({ delay: delay || 0, onComplete: function () { el.textContent = final; el._jwOdo = null; } });
        cols.forEach(function (c, i) { tl.fromTo(c.strip, { yPercent: 0 }, { yPercent: -100 * c.steps / c.rows, duration: 0.86, ease: E.v }, i * 0.03); });
        return tl;
      }
    };
    el._jwOdo = api;
    return api;
  }
  JW.odo = function (el, delay) {
    if (reduced || !el) return null;
    var final = el._jwFinal || (el._jwFinal = (el.textContent || "").trim());
    if (!el._jwOdo) { el.textContent = final; buildOdo(el); }
    return el._jwOdo ? el._jwOdo.play(delay) : null;
  };
  var odos = reduced ? [] : $$("[data-odo]");
  odos.forEach(function (el) { el._jwFinal = (el.textContent || "").trim(); buildOdo(el); });

  /* gauges: arcs draw to the value once (§7.6) */
  var gauges = $$("[data-gauge]");
  if (!reduced) gauges.forEach(function (g) {
    var arc = $(".gauge__arc", g);
    if (arc) arc.style.strokeDasharray = "0 100";
  });

  /* draw-on: data-draw "" (scrub) and "enter" (§5.3) */
  function drawTargets(el) {
    var list = el.matches("path, line, polyline, polygon, circle, rect, ellipse") ? [el] : $$("path, line, polyline, polygon, circle, rect, ellipse", el);
    var solid = [], dashed = [];
    list.forEach(function (p) {
      var da = "";
      try { da = getComputedStyle(p).strokeDasharray; } catch (e) { da = p.getAttribute("stroke-dasharray") || ""; }
      if (da && da !== "none") dashed.push(p); else solid.push(p);
    });
    return { solid: solid, dashed: dashed };
  }
  var draws = window.DrawSVGPlugin && !reduced ? $$("[data-draw]") : [];
  draws.forEach(function (el) {
    var d = drawTargets(el);
    el._jwDraw = d;
    if (d.solid.length) gsap.set(d.solid, { drawSVG: "0%" });
    if (d.dashed.length) gsap.set(d.dashed, { opacity: 0 });
  });
  var frames = window.DrawSVGPlugin && !reduced ? $$(".tally__frame rect") : [];
  if (frames.length) gsap.set(frames, { drawSVG: "0%" });

  /* timeline rows start hidden (§7.7) */
  var tlRows = reduced ? [] : $$(".timeline .tl");
  if (tlRows.length) gsap.set(tlRows, { opacity: 0, x: 24 });

  function initEntrances() {
    splitEls.forEach(function (el) {
      if (reduced) { el.classList.add("is-split"); return; }
      onEnter(el, function (d) { splitIn(el, { delay: d }); }, { role: "title" });
    });
    if (!reduced) revealEls.forEach(function (el) {
      var r = REVEAL[el.getAttribute("data-reveal")] || REVEAL.up;
      var kind = el.getAttribute("data-reveal");
      var extra = parseFloat(el.getAttribute("data-delay") || 0) || 0;
      onEnter(el, function (d) {
        var to = {};
        for (var k in r[1]) to[k] = r[1][k];
        to.ease = E.s; to.delay = d;
        to.onComplete = function () { if (kind === "mask") el.style.clipPath = "none"; };
        gsap.fromTo(el, r[0], to);
      }, { role: roleOf(el), delay: extra });
    });
    if (window.ScrambleTextPlugin && !reduced) $$("[data-scramble]").forEach(function (el) {
      var txt = el.textContent;
      onEnter(el, function (d) { gsap.to(el, { duration: 0.8, delay: d, scrambleText: { text: txt, chars: "0123456789", revealDelay: 0.2, speed: 0.6 } }); }, { role: "meta" });
    });
    if (!reduced) {
      var groups = [];
      gauges.forEach(function (g) { var p = g.parentElement || g; if (groups.indexOf(p) < 0) groups.push(p); });
      groups.forEach(function (p) {
        var list = p.matches("[data-gauge]") ? [p] : $$("[data-gauge]", p).filter(function (g) { return g.parentElement === p; });
        onEnter(p, function (d) {
          list.forEach(function (g, i) {
            var arc = $(".gauge__arc", g), v = parseFloat(g.getAttribute("data-gauge")) || 0, odo = $("[data-odo]", g);
            var dd = d + i * 0.12;
            if (arc) gsap.fromTo(arc, { strokeDasharray: "0 100" }, { strokeDasharray: v + " 100", duration: 0.9, ease: E.s, delay: dd });
            if (odo && odo._jwOdo) odo._jwOdo.play(dd);
          });
        }, { role: "figure" });
      });
      odos.forEach(function (el) {
        if (el.closest("[data-gauge]")) return;
        onEnter(el, function (d) { if (el._jwOdo) el._jwOdo.play(d); }, { role: "figure" });
      });
      frames.forEach(function (rect) {
        onEnter(rect.closest(".tally") || rect, function (d) { gsap.to(rect, { drawSVG: "100%", duration: 0.6, ease: E.s, delay: d }); }, { role: "figure" });
      });
      draws.forEach(function (el) {
        var d = el._jwDraw;
        if (el.getAttribute("data-draw") === "enter") {
          onEnter(el, function (dl) {
            if (d.solid.length) gsap.to(d.solid, { drawSVG: "100%", duration: 1.6, ease: E.s, stagger: 0.06, delay: dl });
            if (d.dashed.length) gsap.to(d.dashed, { opacity: 1, duration: 0.8, ease: "power1.out", stagger: 0.08, delay: dl + 0.5 });
          }, { role: "figure" });
        } else if (ST) {
          var host = el.closest(".rs, section, header, .fig") || el;
          var tl = gsap.timeline({ scrollTrigger: { trigger: host, start: "top 78%", end: "center 50%", scrub: 0.8 } });
          if (d.solid.length) tl.to(d.solid, { drawSVG: "100%", ease: "none", stagger: 0.05, duration: 1 }, 0);
          if (d.dashed.length) tl.to(d.dashed, { opacity: 1, ease: "none", duration: 0.4, stagger: 0.1 }, 0.5);
        }
      });
      tlRows.forEach(function (row) {
        onEnter(row, function (d) { gsap.to(row, { opacity: 1, x: 0, duration: 0.5, ease: E.s, delay: d }); }, { role: "body" });
      });
    }
  }

  /* ---------- marquee (±4° velocity skew), tilt, parallax ---------- */
  function initLoops() {
    if (reduced) return;
    $$("[data-marquee]").forEach(function (m) {
      var track = $(".marquee__track", m);
      if (!track || track._jwM) return;
      track._jwM = true;
      var kids = Array.prototype.slice.call(track.children);
      kids.forEach(function (k) { var c = k.cloneNode(true); c.setAttribute("aria-hidden", "true"); track.appendChild(c); });
      var tw = gsap.to(track, { xPercent: -50, duration: parseFloat(m.getAttribute("data-marquee")) || 50, ease: "none", repeat: -1, paused: true });
      var skew = gsap.quickTo(track, "skewX", { duration: 0.5, ease: "power3" });
      if (ST) ST.create({ trigger: m, start: "top bottom", end: "bottom top", onToggle: function (s) { if (s.isActive) tw.play(); else tw.pause(); },
        onUpdate: function (s) { var v = s.getVelocity() / 300; skew(Math.max(-4, Math.min(4, -v))); } });
      else tw.play();
    });
    if (fine) $$("[data-tilt]").forEach(function (el) {
      var rx = gsap.quickTo(el, "rotateX", { duration: 0.6, ease: "power3" });
      var ry = gsap.quickTo(el, "rotateY", { duration: 0.6, ease: "power3" });
      var ty = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3" });
      gsap.set(el, { transformPerspective: 900 });
      el.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") ty(-2); });
      el.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "mouse") return;
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        rx((0.5 - py) * 10); ry((px - 0.5) * 14);
        el.style.setProperty("--gx", (px * 100).toFixed(1) + "%"); el.style.setProperty("--gy", (py * 100).toFixed(1) + "%");
      });
      el.addEventListener("pointerleave", function () { rx(0); ry(0); ty(0); });
    });
    if (ST) $$("[data-speed]").forEach(function (el) {
      var sp = Math.min(0.15, parseFloat(el.getAttribute("data-speed")) || 0) * (mobile ? 0.5 : 1);
      if (!sp) return;
      var host = el.closest("section, header, .rs, .page-head") || el;
      gsap.fromTo(el, { y: sp * 160 }, { y: -sp * 160, ease: "none", scrollTrigger: { trigger: host, start: "top bottom", end: "bottom top", scrub: true } });
    });
  }

  /* ---------- timeline: rail, active row, --rail-acc (§7.7) ---------- */
  function initTimelines() {
    $$(".timeline").forEach(function (tl) {
      var rail = $(".timeline__rail i", tl), rows = $$(".tl", tl);
      if (!rows.length) return;
      if (rail && ST && !reduced) {
        gsap.fromTo(rail, { scaleY: 0, transformOrigin: "50% 0%" }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: tl, start: "top 70%", end: "bottom 60%", scrub: 0.6 } });
      }
      var active = null, centres = [];
      var measure = function () { centres = rows.map(function (r) { var b = r.getBoundingClientRect(); return b.top + window.scrollY + b.height / 2; }); };
      var pick = function () {
        if (!centres.length) measure();
        var c = window.scrollY + window.innerHeight / 2, best = 0, bd = Infinity;
        centres.forEach(function (y, i) { var d = Math.abs(y - c); if (d < bd) { bd = d; best = i; } });
        var row = rows[best];
        if (row === active) return;
        if (active) active.classList.remove("is-active");
        active = row; row.classList.add("is-active");
        var hue = row.getAttribute("data-hue");
        if (hue) tl.style.setProperty("--rail-acc", "var(--c-" + hue + ")");
      };
      if (ST) {
        ST.create({ trigger: tl, start: "top bottom", end: "bottom top", onUpdate: pick, onRefresh: function () { measure(); pick(); } });
      } else {
        window.addEventListener("scroll", pick, { passive: true });
      }
      measure(); pick();
    });
  }

  /* ---------- finale lens: lazy mount, steer inside .finale (§6.8) ---------- */
  function initFinale() {
    var lens = $('.finale .scope__lens[data-scope="finale"]') || $('[data-scope="finale"]');
    if (!lens || !window.JWScope) return;
    var mount = function () { if (!lens._jwScope) window.JWScope.mount(lens, { role: "finale", oct: 2 }); };
    if (reduced) {      /* hero-gl paints one still frame (no canvas, no motion) when the lens comes near */
      if ("IntersectionObserver" in window) {
        var ro = new IntersectionObserver(function (es) { if (es[es.length - 1].isIntersecting) { ro.disconnect(); mount(); } }, { rootMargin: "100% 0px" });
        ro.observe(lens);
      } else mount();
      return;
    }
    /* lite: the context + shader compile is a one-off long task, so it runs in an idle period shortly after the
       intro (the canvas only draws once the lens is on screen), not while the reader is scrolling towards it */
    var mDue = Infinity, mQueued = false;
    var mountSoon = !LITE ? mount : function (wait) {
      mDue = Math.min(mDue, performance.now() + wait);
      if (mQueued) return;
      mQueued = true;
      quiet(mount, function () { return mDue; });
    };
    if (LITE) JW.onReady(function () { setTimeout(function () { mountSoon(9000); }, 4000); });
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) { if (es[es.length - 1].isIntersecting) { io.disconnect(); mountSoon(1200); } }, { rootMargin: "100% 0px" });
      io.observe(lens);
    } else mount();
    var halo = $(".finale .scope__halo");
    if (halo && ST) gsap.fromTo(halo, { opacity: 0 }, { opacity: 1, ease: "none", scrollTrigger: { trigger: lens, start: "top bottom", end: "center 60%", scrub: 0.6 } });
    /* the bookend: scrolling in advances the lumen; pointing at the address (or focusing it) locks the
       fluorescent target onto the centre and brightens it; a successful copy flares it */
    var finale = lens.closest(".finale");
    if (!finale) return;
    var F = { adv: 0, hold: 0, holdW: 0, tx: 0.11, ty: 0.075, txW: 0.11, tyW: 0.075, flare: 0 };
    var sc = function () { return lens._jwScope && lens._jwScope.live ? lens._jwScope : null; };
    if (ST) ST.create({ trigger: finale, start: "top bottom", end: "bottom top", onUpdate: function (s) { F.adv = s.progress * 0.9; } });
    var mail = $(".finale__mail", finale), acts = $(".finale__acts", finale);
    var aim = function (on) { F.holdW = on ? 0.85 : 0; F.txW = on ? 0 : 0.11; F.tyW = on ? 0 : 0.075; };
    [mail, acts].forEach(function (el) {
      if (!el) return;
      el.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") aim(true); });
      el.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") aim(false); });
      el.addEventListener("focusin", function () { aim(true); });
      el.addEventListener("focusout", function () { aim(false); });
    });
    $$("[data-copy]", finale).forEach(function (b) { b.addEventListener("click", function () { F.flare = 1; }); });
    JW.loop(lens, function (t, dt) {
      var s = sc();
      if (!s) return;
      var k = 1 - Math.exp(-(dt || 0.016) * 4);
      F.hold += (F.holdW - F.hold) * k; F.tx += (F.txW - F.tx) * k; F.ty += (F.tyW - F.ty) * k;
      F.flare = Math.max(0, F.flare - (dt || 0) * 0.9);
      s.setHold(Math.min(1, F.hold + F.flare));
      s.setTarget(F.tx, F.ty);
      s.setAdvance(F.adv + F.flare * 0.4);
    }, { margin: "0px" });
  }

  /* ---------- loader (§6.3) and intro ---------- */
  var loader = $(".loader");
  var seen = ss("jw-seen") === "1";
  ss("jw-seen", "1");
  function startIntro(delay) {
    gsap.delayedCall(delay || 0, function () {
      if (JW.started) return;
      JW.started = true;
      loaderDone = true;
      if (lenis) lenis.start();
      else if (loader) loader.style.touchAction = "";
      var list = JW.ready.slice(); JW.ready.length = 0;
      safe(initEntrances)();
      list.forEach(function (f) { safe(f)(); });
      if (ST) { ST.sort(); ST.refresh(); }
      shimmer();
      if (toastPending) setTimeout(function () { JW.toast.maybeShow(toastPending); }, 400);
      var hasHero = !!$(".hero");
      setTimeout(function () { JW.toast.maybeShow("timer"); }, hasHero ? 20000 : 6000);
      if (location.hash && !arriving) {
        var tgt = null;
        try { tgt = doc.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) { tgt = null; }
        if (tgt) setTimeout(function () { JW.scrollTo(tgt, { offset: -navOffset(), immediate: true }); }, 60);
      }
    });
  }
  function finishLoader() {
    if (!loader) return startIntro(0);
    var tl = gsap.timeline({ onComplete: function () { loader.classList.add("is-done"); gsap.set(loader, { clearProps: "clipPath" }); } });
    var eye = $(".loader__eye i", loader);
    if (eye) tl.to(eye, { scale: 26, duration: 0.9, ease: E.l }, 0);
    tl.fromTo(loader, { clipPath: "circle(150% at 50% 50%)" }, { clipPath: "circle(0% at 50% 50%)", duration: 0.9, ease: E.l }, 0.25);
    tl.add(function () { startIntro(0); }, 0.45);
  }
  function runLoader() {
    if (lenis) lenis.stop();
    else if (loader) loader.style.touchAction = "none";     /* native scrolling: a swipe on the loader does not scroll the page under it */
    var pct = $(".loader__pct", loader);
    var shown = { v: 0 }, target = 0, finished = false, t0 = performance.now();
    var write = function () { if (pct) pct.textContent = Math.round(shown.v) + "%"; };
    var chase = gsap.quickTo(shown, "v", { duration: 0.4, ease: "power2.out", onUpdate: write });
    write();
    var badge = $(".loader__badge", loader);
    if (badge) gsap.fromTo(badge, { scale: 0.4, opacity: 0, rotation: -90 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.9, ease: E.s });
    var finish = function () {
      if (finished) return;
      finished = true;
      gsap.to(shown, { v: 100, duration: 0.22, ease: "power1.out", onUpdate: write, onComplete: finishLoader });
    };
    var check = function () {
      if (finished || target < 100) return;
      var el = performance.now() - t0;
      if (el >= 1100) finish(); else setTimeout(finish, 1100 - el);
    };
    var add = function (n) { target = Math.min(100, target + n); chase(target); check(); };
    var once = function (fn) { var done = false; return function () { if (!done) { done = true; fn(); } }; };
    var dcl = once(function () { add(15); });
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", dcl); else dcl();
    var fontsDone = once(function () { add(35); });
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(fontsDone, fontsDone); else fontsDone();
    var lensDone = once(function () { add(35); });
    var heroLens = $('[data-scope="hero"]');
    var loadDone = once(function () { add(15); if (!heroLens) lensDone(); });
    if (heroLens) {
      doc.addEventListener("jwscope:frame", function (e) { if (e.detail && e.detail.role === "hero") lensDone(); });
      if (!window.JWScope) lensDone();
    }
    if (doc.readyState === "complete") loadDone(); else window.addEventListener("load", loadDone);
    setTimeout(function () { target = 100; chase(100); finish(); }, 2600);
  }

  /* ---------- boot ---------- */
  safe(Pool.init)();
  safe(initLoops)();
  safe(initTimelines)();
  safe(initFinale)();
  if (loader && !reduced && !seen) runLoader();
  else {
    if (loader) loader.classList.add("is-done");
    startIntro(arriving ? 0.35 : 0.05);
  }

  if (ST) {
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { ST.refresh(); });
    window.addEventListener("load", function () { ST.refresh(); });
  }

  /* ---------- desktop extras: ⌘K palette, endoscope mode, night HUD ----------
     Loaded after the page has settled, only on a fine pointer at desktop width; phones (jw-lite) request nothing. */
  var EXTRAS = ["palette", "scope", "hud"];
  function loadExtras() {
    if (LITE || !fine || window.innerWidth < 900) return;
    var core = doc.querySelector('script[src*="assets/js/core.js"]');
    var base = core ? core.src.replace(/assets\/js\/core\.js.*$/, "") : "";
    EXTRAS.forEach(function (name) {
      var l = doc.createElement("link");
      l.rel = "stylesheet"; l.href = base + "assets/css/x-" + name + ".css";
      doc.head.appendChild(l);
      var s = doc.createElement("script");
      s.src = base + "assets/js/x-" + name + ".js"; s.async = false;
      doc.body.appendChild(s);
    });
  }
  var extrasOnLoad = function () { idle(loadExtras, 2500); };
  if (doc.readyState === "complete") extrasOnLoad(); else window.addEventListener("load", extrasOnLoad);
})();
