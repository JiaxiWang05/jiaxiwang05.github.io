/* Homepage: hero intro + pinned endoscope fly-through that bursts into the cobalt chapter. */
(function () {
  "use strict";
  if (!window.gsap || !window.JW) return;
  var gsap = window.gsap, JW = window.JW, E = JW.ease;
  var hero = document.querySelector(".hero");
  if (!hero) return;
  var lens = hero.querySelector(".scope__lens");
  var scope = window.JWScope ? window.JWScope.mount(lens) : { setAdvance: function () {}, setBurst: function () {} };
  var name = hero.querySelector(".hero__name");
  var hud = hero.querySelector(".scope__hud");

  JW.onReady(function () {
    if (JW.reduced) return;
    var tl = gsap.timeline();
    tl.fromTo(".scope", { clipPath: "circle(0% at 50% 50%)", scale: 1.15, rotate: -20 }, { clipPath: "circle(75% at 50% 50%)", scale: 1, rotate: 0, duration: 1.6, ease: E.s }, 0);
    if (name) tl.add(JW.splitIn(name) || gsap.to({}, {}), 0.1);
    tl.from(".hero__logo", { y: 30, opacity: 0, duration: 0.9, ease: E.s }, 0.3)
      .from(".hero__role", { y: 40, opacity: 0, duration: 1, ease: E.s }, 0.55)
      .from(".hero .pills > *", { y: 30, opacity: 0, scale: 0.8, duration: 0.9, ease: E.v, stagger: 0.07 }, 0.75)
      .from(".hero__scroll", { opacity: 0, duration: 1 }, 1.2)
      .add(function () { var t = hero.querySelector("[data-type]"); if (t && t._typeStart) t._typeStart(); }, 0.9);
    if (hud && window.DrawSVGPlugin) {
      tl.fromTo(hud.querySelectorAll(".ring, .tick"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.6, ease: E.s, stagger: 0.05 }, 0.4);
    }
  });

  if (JW.reduced || !window.ScrollTrigger) return;

  var mm = gsap.matchMedia();
  mm.add({ desk: "(min-width: 761px)", phone: "(max-width: 760px)" }, function (ctx) {
    var desk = ctx.conditions.desk;
    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: hero, start: "top top", end: desk ? "+=180%" : "+=100%", pin: true, scrub: 0.8, refreshPriority: 10,
        onUpdate: function (s) { scope.setAdvance(s.progress); scope.setBurst(gsap.utils.clamp(0, 1, (s.progress - 0.8) / 0.2)); }
      }
    });
    if (hud) {
      tl.fromTo(hud.querySelector(".path"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.5, ease: "none" }, 0.05)
        .fromTo(hud.querySelectorAll(".wp"), { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.08, stagger: 0.07, ease: "back.out(3)" }, 0.1)
        .fromTo(hud.querySelector(".bracket"), { scale: 2.4, rotate: 45, opacity: 0, transformOrigin: "50% 50%" }, { scale: 1, rotate: 0, opacity: 1, duration: 0.18, ease: E.v }, 0.42)
        .fromTo(hud.querySelectorAll(".note"), { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.12, stagger: 0.06 }, 0.55);
    }
    tl.to(".hero__text", { yPercent: -12, opacity: 0.0, duration: 0.25, ease: "none" }, 0.62)
      .to(".hero__scroll", { opacity: 0, duration: 0.1 }, 0)
      .to(".scope", { scale: desk ? 1.25 : 1.1, xPercent: desk ? -30 : 0, duration: 0.8, ease: "none" }, 0)
      .to(".scope__hud", { opacity: 0, duration: 0.12 }, 0.78)
      .to(".scope", { scale: desk ? 7 : 5, duration: 0.2, ease: "power2.in" }, 0.8)
      .to(".burst", { scale: 400, duration: 0.18, ease: "power2.in" }, 0.82);
  });
  window.ScrollTrigger.sort();
  window.ScrollTrigger.refresh();
})();
