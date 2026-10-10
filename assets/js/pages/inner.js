/* Inner pages: header art (lumen shader, flying disc) and header parallax. */
(function () {
  "use strict";
  if (!window.gsap || !window.JW) return;
  var gsap = window.gsap, JW = window.JW;

  var lens = document.querySelector(".page-head__art .scope__lens");
  if (lens && window.JWScope) {
    var scope = window.JWScope.mount(lens);
    if (!JW.reduced && window.ScrollTrigger) {
      window.ScrollTrigger.create({ trigger: ".page-head", start: "top top", end: "bottom top", scrub: true, onUpdate: function (s) { scope.setAdvance(s.progress * 0.6); } });
    }
  }

  var path = document.querySelector(".disc-path");
  var disc = document.querySelector(".disc");
  if (path && disc) {
    var len = path.getTotalLength();
    var place = function (p) {
      var pt = path.getPointAtLength(p * len), ahead = path.getPointAtLength(Math.min(len, p * len + 2));
      var ang = Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180 / Math.PI;
      disc.setAttribute("transform", "translate(" + pt.x.toFixed(1) + " " + pt.y.toFixed(1) + ") rotate(" + (ang * 0.4).toFixed(1) + ") scale(" + (0.6 + p * 0.6).toFixed(2) + ")");
    };
    place(JW.reduced ? 1 : 0);
    if (!JW.reduced) {
      var o = { p: 0 };
      gsap.to(o, { p: 1, duration: 2.6, ease: "power2.out", delay: 0.6, onUpdate: function () { place(o.p * 0.55); } });
      if (window.ScrollTrigger) window.ScrollTrigger.create({ trigger: ".page-head", start: "top top", end: "bottom top", scrub: 0.6, onUpdate: function (s) { place(0.55 + s.progress * 0.45); } });
    }
  }

  if (!JW.reduced) {
    var art = document.querySelector(".page-head__art");
    if (art) gsap.to(art, { yPercent: -30, rotate: 6, ease: "none", scrollTrigger: { trigger: ".page-head", start: "top top", end: "bottom top", scrub: true } });
    var title = document.querySelector(".page-head__title");
    if (title) gsap.to(title, { yPercent: 20, letterSpacing: "0.02em", ease: "none", scrollTrigger: { trigger: ".page-head", start: "top top", end: "bottom top", scrub: true } });
  }
})();
