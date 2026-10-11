/* theme.js: LIGHT SOURCE day/night system. Public: window.JWTheme. Events on document: "themechange", "themechangeend".
   FORCE_THEME: the night-only release pins the theme. shell.py (FORCE_THEME) writes <html data-force-theme="night"
   class="theme-forced">; CSS hides the toggle under .theme-forced. While it is set, the stored choice, the system
   preference, other tabs and toggle clicks are ignored and set() only accepts the forced theme. Rebuild with
   shell.FORCE_THEME = None to bring the toggle back: nothing in this file needs to change. */
(function () {
  "use strict";
  var html = document.documentElement;
  var KEY = "jw-theme", DUR = 900, EASE = "cubic-bezier(.7,0,.2,1)";
  var META = { night: "#05050A", day: "#F4F2EE" };
  var FORCE_THEME = (function (v) { return v === "night" || v === "day" ? v : null; })(html.getAttribute("data-force-theme"));
  if (FORCE_THEME) { html.setAttribute("data-theme", FORCE_THEME); html.classList.add("theme-forced"); }
  var mqLight = window.matchMedia("(prefers-color-scheme: light)");
  var mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var I18N = {};
  try { I18N = JSON.parse(document.getElementById("jw-i18n").textContent); } catch (e) { /* English defaults below */ }
  var T = function (k, d) { return I18N[k] || d; };
  var busy = false;
  var feather = !!(window.CSS && CSS.supports && ("registerProperty" in CSS) &&
    (CSS.supports("mask-image", "radial-gradient(#000, transparent)") || CSS.supports("-webkit-mask-image", "radial-gradient(#000, transparent)")));

  function stored() { try { var v = localStorage.getItem(KEY); return v === "day" || v === "night" ? v : null; } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode: session only */ } }
  function get() { return html.getAttribute("data-theme") === "day" ? "day" : "night"; }
  function color(name) { return getComputedStyle(html).getPropertyValue(name).trim(); }
  function emit(type, detail) { document.dispatchEvent(new CustomEvent(type, { detail: detail })); }

  function sync(theme, spin) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", META[theme]);
    Array.prototype.forEach.call(document.querySelectorAll("[data-theme-toggle]"), function (b) {
      b.setAttribute("aria-label", theme === "day" ? T("theme.toNight", "Switch to night theme (fluorescence)") : T("theme.toDay", "Switch to day theme (white light)"));
      b.setAttribute("data-state", theme);
      var tip = b.querySelector(".tt__tip");
      if (tip) tip.textContent = theme === "day" ? T("theme.day", "Day · White light") : T("theme.night", "Night · Fluorescence");
      var dial = parseFloat(b.style.getPropertyValue("--dial"));
      if (isNaN(dial)) dial = theme === "day" ? 0 : 180; else if (spin) dial += 180;
      b.style.setProperty("--dial", dial + "deg");
    });
  }
  function apply(theme, spin) { html.setAttribute("data-theme", theme); sync(theme, spin); }
  function centre(el) {
    if (!el) { var t = document.querySelector("[data-theme-toggle]"); el = t && t.offsetParent ? t : null; }
    if (!el) return { x: window.innerWidth - 48, y: 32 };
    var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function veil(theme, o, r, update, done) {             /* fallback when there is no View Transitions API */
    if (!document.body.animate) { update(); done(); return; }
    var v = document.createElement("div"); v.className = "theme-veil"; v.setAttribute("aria-hidden", "true");
    v.style.background = META[theme]; document.body.appendChild(v);
    var c0 = "circle(0px at " + o.x + "px " + o.y + "px)", c1 = "circle(" + r + "px at " + o.x + "px " + o.y + "px)";
    v.animate({ clipPath: [c0, c1] }, { duration: DUR * .62, easing: EASE, fill: "forwards" }).onfinish = function () {
      update();
      v.animate({ opacity: [1, 0] }, { duration: 380, easing: "ease-out", fill: "forwards" }).onfinish = function () { v.remove(); done(); };
    };
  }
  function set(theme, opts) {
    opts = opts || {};
    var prev = get();
    if ((theme !== "day" && theme !== "night") || theme === prev || busy) return;
    if (FORCE_THEME && theme !== FORCE_THEME) return;
    if (opts.persist !== false) save(theme);
    var reduced = mqReduce.matches || opts.animate === false;
    var o = opts.origin || centre(opts.from);
    var detail = { theme: theme, previous: prev, duration: reduced ? 0 : DUR, reduced: reduced, origin: o };
    if (reduced) { apply(theme, true); emit("themechange", detail); emit("themechangeend", detail); return; }
    busy = true;
    var toggles = document.querySelectorAll("[data-theme-toggle]");
    Array.prototype.forEach.call(toggles, function (b) { b.classList.add("is-switching"); });
    var W = window.innerWidth, H = window.innerHeight;
    var r = Math.ceil(Math.hypot(Math.max(o.x, W - o.x), Math.max(o.y, H - o.y)));
    var band = Math.round(Math.min(W, H) * .14), toDay = theme === "day";
    html.style.setProperty("--tx", o.x + "px"); html.style.setProperty("--ty", o.y + "px"); html.style.setProperty("--vt-band", band + "px");
    var update = function () { apply(theme, true); emit("themechange", detail); };
    var done = function () {
      html.classList.remove("theme-vt", "to-day", "to-night", "vt-feather", "vt-clip");
      Array.prototype.forEach.call(toggles, function (b) { b.classList.remove("is-switching"); });
      busy = false; emit("themechangeend", detail);
    };
    if (!document.startViewTransition) { veil(theme, o, r, update, done); return; }
    html.classList.add("theme-vt", toDay ? "to-day" : "to-night", feather ? "vt-feather" : "vt-clip");
    var vt;
    try { vt = document.startViewTransition({ update: update, types: ["theme"] }); }
    catch (e) { vt = document.startViewTransition(update); }      /* older engines: function form */
    vt.ready.then(function () {
      var pseudo = toDay ? "::view-transition-new(root)" : "::view-transition-old(root)";
      var kf;
      if (feather) { var a = "0px", b = (r + band) + "px"; kf = { "--vt-r": toDay ? [a, b] : [b, a] }; }
      else {
        var c0 = "circle(0px at " + o.x + "px " + o.y + "px)", c1 = "circle(" + r + "px at " + o.x + "px " + o.y + "px)";
        kf = { clipPath: toDay ? [c0, c1] : [c1, c0] };
      }
      html.animate(kf, { duration: DUR, easing: EASE, fill: "both", pseudoElement: pseudo });
    }).catch(function () {});
    vt.finished.then(done, done);
  }

  sync(get(), false);
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-theme-toggle]");
    if (b && !FORCE_THEME) set(get() === "day" ? "night" : "day", { from: b });
  });
  var onSystem = function () { if (!FORCE_THEME && !stored()) set(mqLight.matches ? "day" : "night", { persist: false }); };
  if (mqLight.addEventListener) mqLight.addEventListener("change", onSystem); else if (mqLight.addListener) mqLight.addListener(onSystem);
  window.addEventListener("storage", function (e) {
    if (!FORCE_THEME && e.key === KEY && (e.newValue === "day" || e.newValue === "night")) set(e.newValue, { persist: false, animate: false });
  });
  window.JWTheme = { get: get, set: set, color: color, forced: FORCE_THEME,
    toggle: function (from) { if (!FORCE_THEME) set(get() === "day" ? "night" : "day", { from: from }); } };
})();
