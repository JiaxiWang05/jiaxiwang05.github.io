/* Background music: Chopin, Nocturne in E-flat major, Op. 9 No. 2 (Frank Levy, Musopen, public domain).
   Tries to start on page open; browsers block sound until the visitor interacts, so it otherwise starts on
   the first click, tap or key press. The nav button pauses and resumes; a pause is remembered. Playback
   position carries across pages. Music pauses when a demo video starts. */
(function () {
  "use strict";
  var audio = document.getElementById("jw-music");
  var btn = document.querySelector(".music-btn");
  var note = document.querySelector(".music-note");
  if (!audio || !btn) return;

  var PREF = "jw-music";      // localStorage: "off" after the visitor pauses
  var POS = "jw-music-pos";   // sessionStorage: playback position between pages
  var TARGET = 0.42;
  var html = document.documentElement;
  var get = function (s, k) { try { return s.getItem(k); } catch (e) { return null; } };
  var put = function (s, k, v) { try { s.setItem(k, v); } catch (e) { /* storage blocked */ } };

  var fadeTimer = null;
  function fade(to, ms, done) {
    clearInterval(fadeTimer);
    var from = audio.volume, t0 = performance.now();
    fadeTimer = setInterval(function () {
      var k = Math.min(1, (performance.now() - t0) / ms);
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) { clearInterval(fadeTimer); if (done) done(); }
    }, 40);
  }

  function setUI(playing) {
    btn.setAttribute("aria-pressed", playing ? "true" : "false");
    var label = playing ? btn.getAttribute("data-label-pause") : btn.getAttribute("data-label-play");
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    html.classList.toggle("music-on", playing);
  }

  var noteTimer = null;
  function showNote() {
    if (!note) return;
    note.hidden = false;
    requestAnimationFrame(function () { note.classList.add("is-in"); });
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () {
      note.classList.remove("is-in");
      setTimeout(function () { note.hidden = true; }, 600);
    }, 4200);
  }

  var resumed = false;
  function play(fromGesture) {
    if (!resumed) {
      var p = parseFloat(get(sessionStorage, POS));
      if (p > 0) { try { audio.currentTime = p; } catch (e) { /* not seekable yet */ } }
      resumed = true;
    }
    audio.volume = 0;
    var pr = audio.play();
    if (pr && pr.then) {
      return pr.then(function () {
        setUI(true); fade(TARGET, 2600); if (fromGesture !== "silent") showNote(); return true;
      }, function () { setUI(false); return false; });
    }
    setUI(true); fade(TARGET, 2600); return Promise.resolve(true);
  }

  function pause(remember) {
    if (remember) put(localStorage, PREF, "off");
    fade(0, 500, function () { audio.pause(); });
    setUI(false);
  }

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (audio.paused) { put(localStorage, PREF, "on"); play(true); }
    else pause(true);
  });

  // pause for demo videos
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest(".video__btn, .video") && !audio.paused) pause(false);
  }, true);

  window.addEventListener("pagehide", function () {
    if (!audio.paused) put(sessionStorage, POS, String(audio.currentTime || 0));
    else put(sessionStorage, POS, "0");
  });

  setUI(false);
  if (get(localStorage, PREF) === "off") return;

  // try immediately (works when the browser allows autoplay), otherwise on the first gesture
  var armed = false;
  function onGesture(e) {
    if (e && e.target && e.target.closest && e.target.closest(".music-btn, .video, .video__btn")) return;
    disarm();
    if (audio.paused && get(localStorage, PREF) !== "off") play(true);
  }
  function arm() {
    if (armed) return; armed = true;
    ["pointerdown", "keydown", "touchstart"].forEach(function (t) { window.addEventListener(t, onGesture, { passive: true }); });
  }
  function disarm() {
    ["pointerdown", "keydown", "touchstart"].forEach(function (t) { window.removeEventListener(t, onGesture); });
  }
  play("auto").then(function (ok) { if (!ok) arm(); });
})();
