/* Jiaxi Wang — research site
   Header state, mobile menu, click-to-play videos, copy email, footer year. */

(function () {
  "use strict";

  var isZh = /^zh\b/i.test(document.documentElement.lang || "");
  var text = isZh ? {
    openMenu: "打开菜单", closeMenu: "关闭菜单", video: "视频", copied: "已复制",
    copyOk: "邮箱地址已复制。", copyFail: "复制失败，请选中上方地址后手动复制。"
  } : {
    openMenu: "Open menu", closeMenu: "Close menu", video: "Video", copied: "Copied",
    copyOk: "Email address copied.", copyFail: "Copy failed. Select the address above and copy it manually."
  };

  var header = document.querySelector(".site-header");
  var nav = document.querySelector(".nav");
  var navToggle = document.querySelector(".nav__toggle");

  /* ---------- header border on scroll ---------- */

  function onScroll() {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 4);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- mobile menu ---------- */

  function setNavOpen(open) {
    if (!nav || !navToggle) return;
    nav.classList.toggle("nav--open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? text.closeMenu : text.openMenu);
  }

  if (navToggle) {
    navToggle.addEventListener("click", function () {
      setNavOpen(!nav.classList.contains("nav--open"));
    });
  }

  document.querySelectorAll(".nav__links a").forEach(function (link) {
    link.addEventListener("click", function () { setNavOpen(false); });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && nav && nav.classList.contains("nav--open")) {
      setNavOpen(false);
      navToggle.focus();
    }
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 760) setNavOpen(false);
  });

  /* ---------- click-to-play videos ---------- */

  document.querySelectorAll("[data-video]").forEach(function (wrap) {
    var videoId = wrap.getAttribute("data-video");
    var title = wrap.getAttribute("data-title") || text.video;
    var preview = wrap.querySelector(".video__preview");
    if (!preview || !videoId) return;

    preview.addEventListener("click", function () {
      var frame = document.createElement("div");
      frame.className = "video__frame";
      var iframe = document.createElement("iframe");
      iframe.src = "https://www.youtube-nocookie.com/embed/" + videoId + "?autoplay=1&rel=0";
      iframe.title = title;
      iframe.setAttribute("allowfullscreen", "");
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      frame.appendChild(iframe);
      preview.remove();
      wrap.appendChild(frame);
      iframe.focus();
    });
  });

  /* ---------- copy email ---------- */

  var status = document.getElementById("copy-status");

  function showStatus(message) {
    if (!status) return;
    status.textContent = message;
  }

  function fallbackCopy(text) {
    var helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "absolute";
    helper.style.left = "-9999px";
    document.body.appendChild(helper);
    helper.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
    document.body.removeChild(helper);
    return ok;
  }

  document.querySelectorAll("[data-copy]").forEach(function (button) {
    var label = button.textContent;
    button.addEventListener("click", function () {
      var address = button.getAttribute("data-copy") || "";
      if (!address) return;

      function done(ok) {
        if (ok) {
          button.textContent = text.copied;
          showStatus(text.copyOk);
          window.setTimeout(function () { button.textContent = label; }, 2400);
        } else {
          showStatus(text.copyFail);
        }
      }

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(address).then(
          function () { done(true); },
          function () { done(fallbackCopy(address)); }
        );
      } else {
        done(fallbackCopy(address));
      }
    });
  });

  /* ---------- footer year ---------- */

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
