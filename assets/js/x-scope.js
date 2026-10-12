/* x-scope.js: ENDOSCOPE MODE (easter egg, desktop only). The page becomes the view down an endoscope: a dark
   surround, a circular lens that follows the pointer on a soft spring, rim ticks, a crosshair, a lagging
   "future target" bracket with its predicted path, and a mono readout (depth from scroll, angle, frame count).
   Hold Shift for NBI (narrow-band imaging) inside the lens.
   Triggers: the E key (no modifiers, not while typing; E again or Esc exits) and the footer "Do not press" button.
   Loaded late by the core.js loader (never on html.jw-lite / coarse pointers); initialises immediately.
   Inactive cost: one keydown listener and the button. Everything else is built on first use and only runs while on.
   Debug: window.JWX_scope = { open(x, y), close(), toggle(), nbi(on), state() } */
(function () {
  "use strict";
  if (window.JWX_scope) return;

  var html = document.documentElement, doc = document;
  function mq(q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } }
  if (html.classList.contains("jw-lite") || window.JW_LITE === true || !mq("(pointer: fine)")) {
    window.JWX_scope = { disabled: true, state: function () { return { disabled: true }; } };
    return;
  }

  var zh = /^zh/i.test(html.getAttribute("lang") || "");
  var S = zh ? {
    btn: "请勿按下", btnSr: "（内镜模式，快捷键 E）",
    hint: '内镜模式 · 按住 <kbd>Shift</kbd> 切换窄带成像 · <kbd>Esc</kbd> 退出',
    hintSr: "内镜模式已开启。按住 Shift 切换窄带成像，按 Esc 退出。", off: "已退出内镜模式。",
    wl: "白光成像", fl: "荧光成像", nbi: "窄带成像",
    depth: "深度", angle: "角度", frame: "帧", target: "未来目标 t + k"
  } : {
    btn: "Do not press", btnSr: " (endoscope mode, shortcut E)",
    hint: 'Endoscope mode · hold <kbd>Shift</kbd> for NBI · <kbd>Esc</kbd> to exit',
    hintSr: "Endoscope mode on. Hold Shift for NBI, press Escape to exit.", off: "Endoscope mode off.",
    wl: "WHITE LIGHT", fl: "FLUORESCENCE", nbi: "NBI",
    depth: "DEPTH", angle: "∠", frame: "FR", target: "FUTURE TARGET t + k"
  };
  var SVGNS = "http://www.w3.org/2000/svg";
  var PX_MM = 0.264583;            /* 1 CSS px = 1/96 in */
  var IRIS_MS = 600;
  var LUMEN = "cubic-bezier(.83, 0, .17, 1)", SERVO = "cubic-bezier(.18, 0, .22, 1.14)";

  /* ---------- state ---------- */
  var active = false, closing = false, built = false, nbiOn = false, rm = false;
  var root, lens, iris, vig, hud, hudG, tgt, dots = [], txtMode, txtRead, toastEl, live, btn = null;
  var R = 180, W = 0, vw = 1440, tagFlip = false;
  var px = 0, py = 0, havePtr = false, lastPX = 0, lastPY = 0, lastTs = 0, pvx = 0, pvy = 0;
  var L = { x: 0, y: 0, vx: 0, vy: 0 }, B = { x: 0, y: 0, vx: 0, vy: 0 };
  var raf = 0, lastT = 0, tickT = 0, t0 = 0, toastT = 0, resizeT = 0, closeT = 0;
  var anims = [], opener = null, lastRead = "", lastMode = "";

  function reduced() { return mq("(prefers-reduced-motion: reduce)"); }
  function el(tag, cls, parent) { var e = doc.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  function sv(tag, attrs, parent) {
    var e = doc.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function pad(n, w) { var s = String(n); while (s.length < w) s = "0" + s; return s; }
  function typing(t) {
    if (!t || !t.closest) return false;
    if (t.isContentEditable) return true;
    return !!t.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='combobox'], [role='searchbox']");
  }

  /* ---------- DOM (built on first open) ---------- */
  function build() {
    if (built) return;
    built = true;
    root = el("div", "xscope");
    root.setAttribute("aria-hidden", "true");
    root.hidden = true;
    lens = el("div", "xscope__lens", root);              /* backdrop-filter circle: outside the clipped iris */
    iris = el("div", "xscope__iris", root);
    vig = el("div", "xscope__vig", iris);
    hud = sv("svg", { "class": "xscope__hud", focusable: "false" }, iris);
    for (var i = 0; i < 4; i++) dots.push(el("i", "xscope__wp", iris));
    tgt = el("div", "xscope__tgt", iris);
    tgt.innerHTML = '<svg viewBox="-24 -24 48 48" width="48" height="48" focusable="false">' +
      '<path class="xs-case" d="M-18 -11v-7h7M11 -18h7v7M18 11v7h-7M-11 18h-7v-7"/>' +
      '<path class="xs-bracket" d="M-18 -11v-7h7M11 -18h7v7M18 11v7h-7M-11 18h-7v-7"/></svg>' +
      '<span class="xscope__tag"></span>';
    tgt.lastChild.textContent = S.target;
    doc.body.appendChild(root);

    toastEl = el("div", "xscope-toast", doc.body);
    toastEl.setAttribute("aria-hidden", "true");
    toastEl.innerHTML = '<i aria-hidden="true"></i><span>' + S.hint + "</span>";
    live = el("div", "xscope-sr", doc.body);
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
  }

  /* HUD geometry in px (1 SVG unit = 1 CSS px), rebuilt on open and resize */
  function layoutHud() {
    vw = window.innerWidth;
    R = Math.max(60, (lens.offsetWidth || 360) / 2);
    W = Math.ceil(2 * (R + 60));
    var h = W / 2;
    hud.setAttribute("viewBox", -h + " " + -h + " " + W + " " + W);
    hud.setAttribute("width", W); hud.setAttribute("height", W);
    hud.style.marginLeft = hud.style.marginTop = -h + "px";
    while (hud.firstChild) hud.removeChild(hud.firstChild);
    var defs = sv("defs", {}, hud);
    var a = R + 20, b = R + 31;
    sv("path", { id: "xs-arc-t", d: "M" + -a + " 0A" + a + " " + a + " 0 0 1 " + a + " 0" }, defs);
    sv("path", { id: "xs-arc-b", d: "M" + -b + " 0A" + b + " " + b + " 0 0 0 " + b + " 0" }, defs);
    hudG = sv("g", { "class": "xs-g" }, hud);
    sv("circle", { "class": "xs-rim2", r: R + 7 }, hudG);
    var minor = "", major = "";
    for (var d = 0; d < 360; d += 6) {
      var rad = d * Math.PI / 180, big = d % 30 === 0, r0 = R + 9, r1 = r0 + (big ? 9 : 4);
      var s = "M" + (Math.sin(rad) * r0).toFixed(1) + " " + (-Math.cos(rad) * r0).toFixed(1) +
              "L" + (Math.sin(rad) * r1).toFixed(1) + " " + (-Math.cos(rad) * r1).toFixed(1);
      if (big) major += s; else minor += s;
    }
    sv("path", { "class": "xs-tick", d: minor }, hudG);
    sv("path", { "class": "xs-tick xs-tick--major", d: major }, hudG);
    sv("circle", { "class": "xs-rim", r: R }, hudG);
    sv("path", { "class": "xs-notch", d: "M-6 " + (-R + 1) + "L6 " + (-R + 1) + "L0 " + (-R + 10) + "Z" }, hudG);
    sv("path", { "class": "xs-cross", d: "M-20 0H-7M7 0H20M0 -20V-7M0 7V20" }, hudG);
    sv("circle", { "class": "xs-dot", r: 1.6 }, hudG);
    var t1 = sv("text", { "class": "xs-txt xs-mode" }, hudG);
    txtMode = sv("textPath", { href: "#xs-arc-t", startOffset: "50%", "text-anchor": "middle" }, t1);
    var t2 = sv("text", { "class": "xs-txt" }, hudG);
    txtRead = sv("textPath", { href: "#xs-arc-b", startOffset: "50%", "text-anchor": "middle" }, t2);
    lastRead = lastMode = "";
    tick();
  }

  /* ---------- motion ---------- */
  function apply() {
    var t = "translate3d(" + L.x.toFixed(1) + "px," + L.y.toFixed(1) + "px,0)";
    lens.style.transform = t; vig.style.transform = t; hud.style.transform = t;
    tgt.style.transform = "translate3d(" + B.x.toFixed(1) + "px," + B.y.toFixed(1) + "px,0)";
    var flip = B.x > vw - 240;                    /* keep the tag on screen near the right edge */
    if (flip !== tagFlip) { tagFlip = flip; tgt.classList.toggle("is-flip", flip); }
    /* predicted action path: a quadratic from the lens centre to the bracket, bowed to one side */
    var dx = B.x - L.x, dy = B.y - L.y, dist = Math.sqrt(dx * dx + dy * dy);
    var k = Math.max(0, Math.min(1, (dist - 18) / 50));
    var cx = L.x + dx * 0.5 - dy * 0.22, cy = L.y + dy * 0.5 + dx * 0.22;
    for (var i = 0; i < dots.length; i++) {
      var u = (i + 1) / (dots.length + 1), w = 1 - u;
      var x = w * w * L.x + 2 * w * u * cx + u * u * B.x, y = w * w * L.y + 2 * w * u * cy + u * u * B.y;
      dots[i].style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0) scale(" + k.toFixed(2) + ")";
    }
  }
  function spring(s, tx, ty, k, zeta, dt) {
    var c = 2 * zeta * Math.sqrt(k);
    s.vx += (k * (tx - s.x) - c * s.vx) * dt; s.vy += (k * (ty - s.y) - c * s.vy) * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (Math.abs(tx - s.x) + Math.abs(ty - s.y) < 0.2 && Math.abs(s.vx) + Math.abs(s.vy) < 0.5) {
      s.x = tx; s.y = ty; s.vx = s.vy = 0;
      return true;
    }
    return false;
  }
  function frame(now) {
    raf = 0;
    if (!active) return;
    var dt = Math.min(0.05, Math.max(0.001, (now - (lastT || now - 16)) / 1000));
    lastT = now;
    if (rm) {
      L.x = B.x = px; L.y = B.y = py; L.vx = L.vy = B.vx = B.vy = 0;
      apply();
      return;
    }
    var dec = Math.exp(-dt / 0.09);
    pvx *= dec; pvy *= dec;
    if (Math.abs(pvx) + Math.abs(pvy) < 2) pvx = pvy = 0;
    var a = spring(L, px, py, 120, 0.78, dt);
    /* the bracket aims ahead of the hand (velocity lead) but on a slower spring, so it trails, then settles */
    var lx = pvx * 0.24, ly = pvy * 0.24, lm = Math.sqrt(lx * lx + ly * ly), cap = R * 0.6;
    if (lm > cap) { lx *= cap / lm; ly *= cap / lm; }
    var b = spring(B, px + lx, py + ly, 34, 0.62, dt);
    apply();
    if (!(a && b && !pvx && !pvy)) kick();
    else lastT = 0;
  }
  function kick() { if (!raf && active && !doc.hidden) raf = requestAnimationFrame(frame); }

  /* ---------- readout (10 Hz text on its own nodes) ---------- */
  function modeText() {
    if (nbiOn) return S.nbi;
    return html.getAttribute("data-theme") === "day" ? S.wl : S.fl;
  }
  function tick() {
    if (!txtRead) return;
    var y = window.scrollY || window.pageYOffset || 0;
    var depth = y * PX_MM, di = Math.floor(depth);
    var ang = Math.round((Math.atan2(L.x - window.innerWidth / 2, -(L.y - window.innerHeight / 2)) * 180 / Math.PI + 360) % 360) % 360;
    var fr = t0 ? Math.floor((performance.now() - t0) / (1000 / 60)) % 1000000 : 0;
    var s = S.depth + " " + pad(di, 4) + "." + Math.floor((depth - di) * 10) + " mm · " + S.angle + " " + pad(ang, 3) +
      "° · " + S.frame + " " + pad(fr, 6);
    if (s !== lastRead) { txtRead.textContent = s; lastRead = s; }
    var m = modeText();
    if (m !== lastMode) { txtMode.textContent = m; lastMode = m; }
  }
  function startTick() { stopTick(); if (active && !doc.hidden) tickT = setInterval(tick, 100); }
  function stopTick() { if (tickT) { clearInterval(tickT); tickT = 0; } }

  /* ---------- listeners that exist only while the mode is on ---------- */
  function onMove(e) {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    var x = e.clientX, y = e.clientY, ts = e.timeStamp || performance.now();
    if (havePtr) {
      var dt = ts - lastTs;
      if (dt > 0 && dt < 120) {
        var ivx = Math.max(-3000, Math.min(3000, (x - lastPX) / dt * 1000));
        var ivy = Math.max(-3000, Math.min(3000, (y - lastPY) / dt * 1000));
        pvx = pvx * 0.6 + ivx * 0.4; pvy = pvy * 0.6 + ivy * 0.4;
      }
    }
    havePtr = true; lastPX = px = x; lastPY = py = y; lastTs = ts;
    if (nbiOn !== !!e.shiftKey && !typing(doc.activeElement)) setNbi(!!e.shiftKey);
    kick();
  }
  function onKeyUp(e) { if (e.key === "Shift") setNbi(false); }
  function onBlur() { setNbi(false); }
  function onVis() {
    if (doc.hidden) { stopTick(); if (raf) { cancelAnimationFrame(raf); raf = 0; } setNbi(false); }
    else if (active) { lastT = 0; startTick(); kick(); }
  }
  function onResize() {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (!active) return;
      px = Math.min(px, window.innerWidth); py = Math.min(py, window.innerHeight);
      layoutHud(); kick();
    }, 120);
  }
  function listen(on) {
    var f = on ? "addEventListener" : "removeEventListener";
    window[f]("pointermove", onMove, { passive: true });
    window[f]("keyup", onKeyUp);
    window[f]("blur", onBlur);
    window[f]("resize", onResize);
    doc[f]("visibilitychange", onVis);
  }

  function setNbi(on) {
    on = !!on && active;
    if (on === nbiOn) return;
    nbiOn = on;
    if (root) root.classList.toggle("is-nbi", on);
    if (txtMode) { lastMode = ""; tick(); }
  }

  /* ---------- iris (clip-path circle from the button / cursor) ---------- */
  function stopAnims() { anims.forEach(function (a) { try { a.cancel(); } catch (e) {} }); anims = []; }
  function irisAnim(open, ox, oy, done) {
    stopAnims();
    var w = window.innerWidth, h = window.innerHeight;
    var far = Math.ceil(Math.sqrt(Math.pow(Math.max(ox, w - ox), 2) + Math.pow(Math.max(oy, h - oy), 2))) + 8;
    if (rm || !iris.animate) { done(); return; }
    var at = " at " + Math.round(ox) + "px " + Math.round(oy) + "px)";
    var small = "circle(0px" + at, big = "circle(" + far + "px" + at;
    var a = iris.animate([{ clipPath: open ? small : big }, { clipPath: open ? big : small }],
      { duration: IRIS_MS, easing: LUMEN, fill: "both" });
    var b = lens.animate([{ opacity: open ? 0 : 1 }, { opacity: open ? 1 : 0 }],
      { duration: open ? IRIS_MS : IRIS_MS * 0.7, easing: LUMEN, fill: "both" });
    var c = hudG.animate(open
      ? [{ transform: "rotate(-24deg) scale(.82)", opacity: 0 }, { transform: "none", opacity: 1 }]
      : [{ transform: "none", opacity: 1 }, { transform: "rotate(18deg) scale(.86)", opacity: 0 }],
      { duration: open ? IRIS_MS + 200 : IRIS_MS, easing: open ? SERVO : LUMEN, fill: "both" });
    anims = [a, b, c];
    /* opening: each animation drops its fill when it ends (no clip-path left behind); closing: done() hides it all */
    [b, c].forEach(function (x) { x.onfinish = function () { if (open && anims.indexOf(x) >= 0) x.cancel(); }; });
    a.onfinish = function () { if (anims[0] !== a) return; if (open) a.cancel(); done(); };
  }

  /* ---------- toast + announcements ---------- */
  function toast(show) {
    clearTimeout(toastT);
    if (!toastEl) return;
    toastEl.classList.toggle("is-on", !!show);
    if (show) toastT = setTimeout(function () { toastEl.classList.remove("is-on"); }, 4200);
  }
  function announce(text) {
    if (!live) return;
    live.textContent = "";
    setTimeout(function () { live.textContent = text; }, 60);
  }

  /* ---------- open / close ---------- */
  function pointerGuess() {
    var c = doc.querySelector(".cursor.is-visible");
    if (c && window.gsap) {
      var x = +window.gsap.getProperty(c, "x"), y = +window.gsap.getProperty(c, "y");
      if (isFinite(x) && isFinite(y) && x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight) return [x, y];
    }
    return [window.innerWidth / 2, window.innerHeight / 2];
  }
  function open(ox, oy, from) {
    if (active) return;
    build();
    clearTimeout(closeT);
    if (ox == null || oy == null) { var g = pointerGuess(); ox = g[0]; oy = g[1]; }
    active = true; closing = false;
    opener = from || null;
    root.hidden = false;
    rm = reduced();
    root.classList.toggle("is-reduced", rm);
    layoutHud();
    px = L.x = B.x = ox; py = L.y = B.y = oy;
    L.vx = L.vy = B.vx = B.vy = pvx = pvy = 0;
    havePtr = false; lastT = 0;
    t0 = performance.now();
    apply();
    listen(true);
    startTick();
    if (btn) btn.setAttribute("aria-pressed", "true");
    irisAnim(true, ox, oy, function () {});
    toast(true);
    announce(S.hintSr);
  }
  function close() {
    if (!active) return;
    active = false; closing = true;
    setNbi(false);
    listen(false);
    stopTick();
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    toast(false);
    if (btn) btn.setAttribute("aria-pressed", "false");
    var cx = Math.max(0, Math.min(window.innerWidth, L.x)), cy = Math.max(0, Math.min(window.innerHeight, L.y));
    var finish = function () {
      clearTimeout(closeT);
      if (active || !closing) return;
      closing = false;
      stopAnims();
      root.hidden = true;
      root.classList.remove("is-nbi");
    };
    closeT = setTimeout(finish, IRIS_MS + 900);
    irisAnim(false, cx, cy, finish);
    /* focus returns to the opener only if focus has not moved on; never scroll the page to reach it */
    var ae = doc.activeElement;
    if (opener && opener.isConnected && (!ae || ae === doc.body || ae === opener)) {
      try { opener.focus({ preventScroll: true }); } catch (e) {}
    }
    opener = null;
    announce(S.off);
  }
  function toggle(ox, oy, from) { if (active) close(); else open(ox, oy, from); }

  /* ---------- the only always-on listener ---------- */
  doc.addEventListener("keydown", function (e) {
    var k = e.key;
    if (active && k === "Escape") { close(); return; }
    if (active && k === "Shift") { if (!typing(e.target)) setNbi(true); return; }
    if ((k === "e" || k === "E") && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.repeat &&
        !e.isComposing && !typing(e.target)) {
      e.preventDefault();
      var ae = doc.activeElement;
      toggle(null, null, ae && ae !== doc.body ? ae : null);
    }
  });

  /* ---------- the footer button ---------- */
  var base = doc.querySelector(".footer__base");
  if (base) {
    btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "xscope-btn";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-keyshortcuts", "E");
    btn.innerHTML = '<span class="xscope-btn__led" aria-hidden="true"></span><span class="xscope-btn__t"></span>' +
      '<kbd class="xscope-btn__k" aria-hidden="true">E</kbd><span class="xscope-sr"></span>';
    btn.querySelector(".xscope-btn__t").textContent = S.btn;
    btn.querySelector(".xscope-sr").textContent = S.btnSr;
    btn.addEventListener("click", function (e) {
      var r = btn.getBoundingClientRect();
      var ox = r.left + r.width / 2, oy = r.top + r.height / 2;
      if (e.detail > 0 && e.clientX) { ox = e.clientX; oy = e.clientY; }
      toggle(ox, oy, btn);
    });
    base.appendChild(btn);
  }

  window.JWX_scope = {
    open: function (x, y) { open(x, y, null); },
    close: close,
    toggle: function () { toggle(); },
    nbi: function (on) { setNbi(on); },
    state: function () {
      return {
        active: active, closing: closing, nbi: nbiOn, built: built, button: !!btn,
        lens: { x: Math.round(L.x), y: Math.round(L.y) }, target: { x: Math.round(B.x), y: Math.round(B.y) },
        r: R, running: !!raf, ticking: !!tickT, readout: lastRead, mode: lastMode
      };
    }
  };
})();
