/* x-palette.js: the ⌘K command palette (desktop showpiece). One self-initialising IIFE, loaded late by the core.js loader
   (never on html.jw-lite). Opens with ⌘K / Ctrl+K, "/" when not typing, or the nav button it injects. Fuzzy search over
   assets/data/search-<lang>.json (lazy-fetched on first open; rebuilt by .dev/tools/build_search.py) plus Actions.
   Combobox + listbox pattern inside a modal dialog; focus is trapped while open and returns to the opener on close.
   Nothing runs while closed: two key listeners, the button, and one themechange listener.
   Debug handle: window.JWX_palette = { open(q), close(), toggle(), state(), search(q), run(id), reload() } */
(function () {
  "use strict";
  if (window.JWX_palette) return;
  var html = document.documentElement, doc = document;
  if (html.classList.contains("jw-lite") || window.JW_LITE === true) return;

  /* ---------------------------------------------------------------- setup */
  var coreEl = doc.querySelector('script[src*="assets/js/core.js"]');
  var BASE = coreEl && coreEl.src ? coreEl.src.replace(/assets\/js\/core\.js.*$/, "") : location.href.replace(/[^/]*([?#].*)?$/, "");
  var LANG = /^zh/i.test(html.getAttribute("lang") || "") ? "zh" : "en";
  var MAC = /Mac|iPhone|iPad|iPod/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || "");
  var MOD = MAC ? "⌘" : "Ctrl";
  function J() { return window.JW || {}; }   /* read late: the engine may (re)attach after this file runs */
  function mq(q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } }
  function reduced() { return mq("(prefers-reduced-motion: reduce)"); }
  var RECENT_KEY = "jw-palette-recent", RECENT_MAX = 5;

  var STR = {
    en: {
      btn: "Search", btnLabel: "Search the site and run actions (" + MOD + " K)",
      dialog: "Search and actions", input: "Search the site", results: "Results",
      placeholder: "Search pages, projects, people and links",
      close: "Close", groups: { recent: "Recent", sug: "Suggested", action: "Actions", page: "Pages", section: "Sections",
        research: "Research and projects", pub: "Publications", xp: "Experience", link: "Links" },
      none: "No results for “{q}”", noneHint: "Try a project, a supervisor, a place or a year.",
      loading: "Loading the search index…", failed: "The search index could not be loaded. Actions still work.",
      count1: "1 result", countN: "{n} results", nav: "move", open: "open", tab: "new tab", esc: "close",
      here: "This page", ext: "Opens in a new tab",
      toDay: "Switch to day theme", toNight: "Switch to night theme", daySub: "White light", nightSub: "Fluorescence",
      langT: "Read this page in Chinese", langS: "中文",
      rvT: "Open the research version", rvS: "Clean and text-first",
      playT: "Play music", pauseT: "Pause music", musicS: "Chopin, Nocturne Op. 9 No. 2",
      copyT: "Copy email address", copied: "Email address copied", copyFail: "Copy failed. The address is {e}",
      cvT: "Download CV", cvS: "PDF",
      ghT: "Open GitHub", liT: "Open LinkedIn", gsT: "Open Google Scholar",
      topT: "Scroll to top", topS: "Back to the start of this page",
      k: { theme: "theme day night dark light mode colour color appearance", lang: "language chinese translate 中文 zh",
        rv: "research version clean text plain simple reader", music: "music sound audio chopin nocturne play pause mute",
        copy: "copy email address mail contact clipboard", cv: "download cv resume pdf curriculum vitae",
        gh: "github code repositories open source profile", li: "linkedin profile network",
        gs: "google scholar citations papers", top: "scroll top back up start beginning" }
    },
    zh: {
      btn: "搜索", btnLabel: "搜索本站或执行操作（" + MOD + " K）",
      dialog: "搜索与操作", input: "搜索本站", results: "搜索结果",
      placeholder: "搜索页面、项目、人物与链接",
      close: "关闭", groups: { recent: "最近", sug: "推荐", action: "操作", page: "页面", section: "章节",
        research: "研究与项目", pub: "论文", xp: "经历", link: "链接" },
      none: "没有与“{q}”相关的结果", noneHint: "可以试试项目名称、导师、地点或年份。",
      loading: "正在载入搜索索引…", failed: "搜索索引载入失败，操作仍可使用。",
      count1: "1 个结果", countN: "{n} 个结果", nav: "选择", open: "打开", tab: "新标签页", esc: "关闭",
      here: "当前页面", ext: "在新标签页中打开",
      toDay: "切换至日间主题", toNight: "切换至夜间主题", daySub: "白光", nightSub: "荧光",
      langT: "切换至本页的英文版", langS: "English",
      rvT: "打开研究版", rvS: "简洁 · 以文字为主",
      playT: "播放音乐", pauseT: "暂停音乐", musicS: "肖邦《降E大调夜曲》作品9第2号",
      copyT: "复制邮箱地址", copied: "邮箱地址已复制", copyFail: "复制失败，邮箱地址为 {e}",
      cvT: "下载简历", cvS: "PDF",
      ghT: "打开GitHub", liT: "打开LinkedIn", gsT: "打开Google学术",
      topT: "回到顶部", topS: "返回本页开头",
      k: { theme: "主题 日间 夜间 深色 浅色 模式 外观 白光 荧光 theme day night dark light", lang: "语言 英文 english language 切换",
        rv: "研究版 简洁 文字版 research version", music: "音乐 声音 肖邦 夜曲 播放 暂停 静音 music chopin",
        copy: "复制 邮箱 电子邮件 地址 联系 email copy", cv: "下载 简历 履历 cv pdf resume",
        gh: "github 代码 仓库 开源 主页", li: "linkedin 领英 个人主页",
        gs: "google scholar 谷歌学术 学术 论文", top: "回到顶部 顶部 返回 滚动 top" }
    }
  }[LANG];
  function fmt(s, v) { for (var k in v) s = s.split("{" + k + "}").join(String(v[k])); return s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var ICONS = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    page: '<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/>',
    section: '<path d="M9.5 4 8 20M16 4l-1.5 16M5 9h14.5M4.5 15H19"/>',
    research: '<circle cx="12" cy="12" r="8.5"/><circle cx="13.4" cy="10.6" r="3.9"/><circle cx="14.4" cy="9.6" r="1.1" fill="currentColor" stroke="none"/>',
    pub: '<path d="M4 5.5h5.5a2.5 2.5 0 0 1 2.5 2.5v12a2 2 0 0 0-2-2H4z"/><path d="M20 5.5h-5.5A2.5 2.5 0 0 0 12 8v12a2 2 0 0 1 2-2h6z"/>',
    xp: '<path d="M6.5 4v16"/><circle cx="6.5" cy="8" r="1.7"/><circle cx="6.5" cy="16" r="1.7"/><path d="M11 8h8.5M11 16h6"/>',
    link: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
    pdf: '<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/><path d="M9 15.5h6M9 12.5h6"/>',
    theme: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" stroke="none"/>',
    lang: '<path d="M3.5 6h9M8 4v2M5.5 6c.8 3.1 2.9 5.4 5.8 6.8M10.5 6c-.8 3.3-3.1 6.1-6.3 7.6"/><path d="m12.5 20 3.6-8.5 3.6 8.5M13.7 17.2h4.8"/>',
    rv: '<rect x="5.5" y="3.5" width="13" height="17" rx="1.5"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5"/>',
    music: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
    cv: '<path d="M12 3.5v11.5"/><path d="m7 10.5 5 5 5-5"/><path d="M5 20.5h14"/>',
    top: '<path d="M12 20V5.5"/><path d="m6 11.5 6-6 6 6"/>',
    ret: '<path d="M19 5v6.5a2 2 0 0 1-2 2H6"/><path d="m9.5 10-3.5 3.5L9.5 17"/>'
  };
  function svg(name, cls) {
    return '<svg class="' + (cls || "xpal__svg") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || ICONS.link) + "</svg>";
  }

  /* ---------------------------------------------------------------- text folding + fuzzy matching */
  var SEP = /[\s\-‐‑‒–—_\/·・:;,.()[\]{}'"“”‘’!?&+@#|<>=*~，。：；、（）《》【】！？]/;
  var CJK = /[㐀-鿿豈-﫿぀-ヿ]/;
  function fold(s) {
    s = String(s || "");
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i), d = c;
      if (c.charCodeAt(0) > 127 && !CJK.test(c)) { try { d = c.normalize("NFD").charAt(0); } catch (e) { d = c; } }
      d = d.toLowerCase().charAt(0) || c;
      if (d === "–" || d === "—" || d === "‐" || d === "‑") d = "-";
      out += d;
    }
    return out;
  }
  function bonusAt(f, j, cam) {
    var c = f.charAt(j);
    if (CJK.test(c)) return 6;
    if (j === 0) return 10;
    var p = f.charAt(j - 1);
    if (SEP.test(p)) return 9;
    if (cam && cam[j]) return 7;
    if (/[0-9]/.test(c) && !/[0-9]/.test(p)) return 5;
    if (CJK.test(p)) return 7;
    return 0;
  }
  var DPM = new Float32Array(32 * 256), DPP = new Int16Array(32 * 256);
  /* best alignment of q in f (both folded). Either a contiguous run (a mid-word run scores lower), or a subsequence
     whose first character and every jump land on a word start, skipping at most one word per jump ("cel" -> Cross-
     Embodiment Learning, "具身" -> 跨具身学习). Consecutive and word-start characters score high, gaps cost. */
  var GAP0 = 5, GAPX = 1.5;
  var WI = new Int16Array(256), BW = new Float32Array(260), BK = new Int16Array(260);
  function fuzzy(q, f, cam) {
    var n = q.length, m = Math.min(f.length, 256), i, j, w;
    if (!n || n > 32 || n > m) return null;
    for (i = 0, j = 0; j < m && i < n; j++) if (f.charCodeAt(j) === q.charCodeAt(i)) i++;
    if (i < n) return null;
    var NEG = -1e9, res = null;
    var at = f.indexOf(q);
    if (at >= 0 && at + n <= m) {
      var b0 = bonusAt(f, at, cam), sc = 16 + b0 * 2 - Math.min(at, 16) * 0.25, pos = [at];
      for (i = 1; i < n; i++) { sc += 20 + Math.max(bonusAt(f, at + i, cam), 6); pos.push(at + i); }
      if (!b0) sc *= n <= 4 ? 0.5 : 0.75;
      res = { score: sc, pos: pos };
    }
    var words = 0;
    for (j = 0; j < m; j++) { if (bonusAt(f, j, cam) > 0 && !SEP.test(f.charAt(j))) words++; WI[j] = words; }
    for (i = 0; i < n; i++) {
      var row = i * m, prow = (i - 1) * m, qc = q.charCodeAt(i);
      if (i > 0) {                       /* best previous-row end per word, linearised for the gap cost */
        for (w = 0; w <= words + 1; w++) { BW[w] = NEG; BK[w] = -1; }
        for (j = 0; j < m; j++) {
          var v = DPM[prow + j];
          if (v > NEG / 2) { v += GAPX * j; w = WI[j]; if (v > BW[w]) { BW[w] = v; BK[w] = j; } }
        }
      }
      for (j = 0; j < m; j++) {
        var idx = row + j;
        DPM[idx] = NEG; DPP[idx] = -1;
        if (f.charCodeAt(j) !== qc) continue;
        var b = bonusAt(f, j, cam);
        if (i === 0) { if (b > 0) DPM[idx] = 16 + b * 2 - Math.min(j, 16) * 0.25; continue; }
        var s1 = NEG, s2 = NEG, k2 = -1;
        if (j >= 1 && DPM[prow + j - 1] > NEG / 2) s1 = DPM[prow + j - 1] + 20 + Math.max(b, 6);
        if (b > 0) {
          w = WI[j];
          for (var d = 1; d <= 2; d++) {
            var ww = w - d;
            if (ww < 0 || BW[ww] <= NEG / 2 || BK[ww] > j - 2) continue;
            var c2 = BW[ww] - GAP0 - GAPX * (j - 1) + 16 + b;
            if (c2 > s2) { s2 = c2; k2 = BK[ww]; }
          }
        }
        if (s1 >= s2 && s1 > NEG / 2) { DPM[idx] = s1; DPP[idx] = j - 1; }
        else if (s2 > NEG / 2) { DPM[idx] = s2; DPP[idx] = k2; }
      }
    }
    var end = -1, top = NEG, last = (n - 1) * m;
    for (j = n - 1; j < m; j++) if (DPM[last + j] > top) { top = DPM[last + j]; end = j; }
    if (end >= 0 && top > NEG / 2 && (n === 1 || top / n >= 14) && (!res || top > res.score)) {
      var p2 = new Array(n);
      for (i = n - 1, j = end; i >= 0; i--) { p2[i] = j; j = DPP[i * m + j]; }
      res = { score: top, pos: p2 };
    }
    return res;
  }
  /* contiguous match (for keywords and long text): prefer an occurrence at a word start */
  function substr(q, f) {
    var at = f.indexOf(q), first = at, tries = 0;
    if (at < 0) return null;
    while (at >= 0 && tries++ < 8) {
      if (bonusAt(f, at) > 0) return { at: at, ws: true };
      at = f.indexOf(q, at + 1);
    }
    return { at: first, ws: false };
  }
  function tokens(q) { return fold(q).split(/\s+/).filter(Boolean).slice(0, 8); }

  function score(item, toks, whole) {
    var total = 0, tpos = [], cpos = [], snip = null, inTitle = 0;
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i], one = tk.length === 1, short = tk.length < 3, len = Math.min(1, 0.35 + tk.length * 0.18);
      var T = fuzzy(tk, item._t, item._tc);
      if (T && one && bonusAt(item._t, T.pos[0], item._tc) === 0) T = null;
      var C = item._c ? fuzzy(tk, item._c) : null;
      if (C && one && bonusAt(item._c, C.pos[0]) === 0) C = null;
      var K = item._k ? substr(tk, item._k) : null;
      if (K && short && !K.ws) K = null;
      var Sm = !one && item._s ? substr(tk, item._s) : null;
      if (Sm && !Sm.ws && tk.length < 4) Sm = null;
      var X = !one && item._x ? substr(tk, item._x) : null;
      if (X && !X.ws) X = null;                   /* long text: word starts only ("bili" is not in "manoeuvrability") */
      var kWord = K && K.ws && !one && (K.at + tk.length >= item._k.length || SEP.test(item._k.charAt(K.at + tk.length)));
      var sc = { t: T ? T.score + 6 : 0, c: C ? C.score * 0.55 : 0,
        k: K ? (kWord ? (item.g === "action" ? 110 : 40) : (K.ws ? 30 : 14)) * len * (one ? 0.5 : 1) : 0,
        s: Sm ? (Sm.ws ? 22 : 12) * len : 0, x: X ? (X.ws ? 16 : 8) * len : 0 };
      var from = "", best = 0;
      for (var f in sc) if (sc[f] > best) { best = sc[f]; from = f; }
      if (!best) return null;
      if (T) { tpos = tpos.concat(T.pos); inTitle++; } else if (C) cpos = cpos.concat(C.pos);
      if (!snip && from !== "t" && from !== "c") {
        if (Sm && from === "s") snip = { f: "s", at: Sm.at };
        else if (X) snip = { f: "x", at: X.at };
        else if (Sm) snip = { f: "s", at: Sm.at };
        else if (K) snip = { f: "k", at: K.at };
      }
      total += best;
    }
    if (item._t === whole) total += 60;
    else if (item._t.indexOf(whole) === 0) total += 30;
    else if (whole.length > 2 && item._t.indexOf(whole) > 0 && bonusAt(item._t, item._t.indexOf(whole), item._tc) > 0) total += 14;
    if (inTitle === toks.length && toks.length > 1) total += 12;
    total *= item.w || 1;
    if (item.g === "page") total += 6;
    if (recentIds().indexOf(item.i) >= 0) total += 5;
    return { item: item, score: total, tpos: tpos, cpos: cpos, snip: snip };
  }

  /* ---------------------------------------------------------------- state */
  var S = { open: false, q: "", active: 0, flat: [], index: null, loading: null, error: false, opener: null, lenisStopped: false, closing: null };
  var root, scrim, panel, input, list, live, footCount, closeBtn, navBtn, toast;

  function store(get, val) {
    try {
      if (get) return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") || [];
      localStorage.setItem(RECENT_KEY, JSON.stringify(val));
    } catch (e) { /* storage blocked: recent picks are a convenience */ }
    return [];
  }
  var recentCache = null;
  function recentIds() { if (!recentCache) { recentCache = store(true); if (!Array.isArray(recentCache)) recentCache = []; } return recentCache; }
  function remember(id) {
    var r = recentIds().filter(function (x) { return x !== id; });
    r.unshift(id); r = r.slice(0, RECENT_MAX); recentCache = r; store(false, r);
  }

  function camel(s) {                          /* "BiliVLA", "EndoWAM": a capital after a small letter starts a word */
    var o = null;
    for (var i = 1; i < s.length; i++) if (/[a-z]/.test(s.charAt(i - 1)) && /[A-Z]/.test(s.charAt(i))) (o = o || {})[i] = 1;
    return o;
  }
  function prepItem(it) {
    it._tc = camel(it.t);
    it._t = fold(it.t); it._c = it.c ? fold(it.c) : ""; it._k = it.k ? fold(it.k) : "";
    it._s = it.s ? fold(it.s) : ""; it._x = it.x ? fold(it.x) : "";
    return it;
  }
  function ensureIndex() {
    if (S.index || S.loading) return S.loading;
    S.error = false;
    S.loading = fetch(BASE + "assets/data/search-" + LANG + ".json", { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        d.items = (d.items || []).filter(function (it) { return it && it.t && it.u; }).map(prepItem);
        d.byId = {}; d.items.forEach(function (it) { d.byId[it.i] = it; });
        S.index = d;
      })
      .catch(function (e) { S.error = true; if (window.console) console.warn("[palette] index", e); })
      .then(function () { S.loading = null; if (S.open) render(true); });
    return S.loading;
  }

  /* ---------------------------------------------------------------- the page: actions */
  function el(sel) { return doc.querySelector(sel); }
  function visible(n) { return !!(n && (n.offsetParent || n.getClientRects().length)); }
  function emailAddr() {
    var b = el("[data-copy]");
    if (b && /@/.test(b.getAttribute("data-copy"))) return b.getAttribute("data-copy");
    if (S.index && S.index.meta && S.index.meta.email) return S.index.meta.email;
    var m = el('a[href^="mailto:"]');
    return m ? m.getAttribute("href").slice(7).split("?")[0] : null;
  }
  function profile(re, metaKey) {
    var a = Array.prototype.slice.call(doc.querySelectorAll("a[href]")).filter(function (x) { return re.test(x.getAttribute("href")); })[0];
    if (a) return a.href;
    return S.index && S.index.meta ? S.index.meta[metaKey] || null : null;
  }
  function actions() {
    var out = [], T = window.JWTheme, k = STR.k;
    var theme = T && T.get ? T.get() : (html.getAttribute("data-theme") === "day" ? "day" : "night");
    var tbtn = el(".theme-toggle, [data-theme-toggle]");
    if (!(T && T.forced) && !html.classList.contains("theme-forced") && (T || tbtn)) {
      out.push({ i: "act:theme", ic: "theme", t: theme === "day" ? STR.toNight : STR.toDay, s: theme === "day" ? STR.nightSub : STR.daySub, k: k.theme,
        run: function () { if (T && T.toggle) T.toggle(visible(tbtn) ? tbtn : null); else if (tbtn) tbtn.click(); } });
    }
    var lang = el(".nav .lang a[hreflang]") || el(".lang a[hreflang]");
    if (lang) out.push({ i: "act:lang", ic: "lang", t: lang.getAttribute("aria-label") || STR.langT, s: STR.langS, k: k.lang, run: function () { lang.click(); } });
    var rv = el(".switcher__btn") || el(".menu__rv") || el('a[href*="research-version/"]');
    if (rv) {
      var hint = el(".switcher__hint");
      out.push({ i: "act:rv", ic: "rv", t: STR.rvT, s: hint && hint.textContent.trim() ? hint.textContent.trim() : STR.rvS, k: k.rv,
        run: function () { rv.click(); } });
    }
    var mb = el(".music-btn"), audio = doc.getElementById("jw-music");
    if (mb) {
      var playing = mb.getAttribute("aria-pressed") === "true" || !!(audio && !audio.paused);
      out.push({ i: "act:music", ic: "music", t: playing ? STR.pauseT : STR.playT, s: STR.musicS, k: k.music, run: function () { mb.click(); } });
    }
    var mail = emailAddr();
    if (mail) out.push({ i: "act:copy", ic: "copy", t: STR.copyT, s: mail, k: k.copy, run: function () { copyEmail(mail); } });
    var cvA = el('a[href$="cv.pdf"][download]') || el('a[href$="cv.pdf"]');
    var cvHref = cvA ? cvA.href : (S.index && S.index.meta && S.index.meta.cv ? BASE + S.index.meta.cv : null);
    if (cvHref) out.push({ i: "act:cv", ic: "cv", t: STR.cvT, s: STR.cvS, k: k.cv, run: function () { download(cvHref); } });
    var gh = profile(/^https:\/\/github\.com\/[^/]+\/?$/, "github");
    if (gh) out.push({ i: "act:github", ic: "link", t: STR.ghT, s: gh.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), k: k.gh, e: 1, run: function () { openTab(gh); } });
    var li = profile(/^https:\/\/(www\.)?linkedin\.com\/in\//, "linkedin");
    if (li) out.push({ i: "act:linkedin", ic: "link", t: STR.liT, s: li.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), k: k.li, e: 1, run: function () { openTab(li); } });
    var gs = profile(/scholar\.google\./, "scholar");
    if (gs) out.push({ i: "act:scholar", ic: "link", t: STR.gsT, s: gs.replace(/^https?:\/\/(www\.)?/, ""), k: k.gs, e: 1, run: function () { openTab(gs); } });
    out.push({ i: "act:top", ic: "top", t: STR.topT, s: STR.topS, k: k.top, run: function () {
      if (J().scrollTo) J().scrollTo(0, { duration: 1.1 }); else window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
    } });
    out.forEach(function (a) { a.g = "action"; prepItem(a); });
    return out;
  }
  function openTab(url) { var w = window.open(url, "_blank", "noopener,noreferrer"); if (w) try { w.opener = null; } catch (e) { /* ignore */ } }
  function download(href) {
    var a = doc.createElement("a");
    a.href = href; a.setAttribute("download", ""); a.style.display = "none";
    doc.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 0);
  }
  function copyEmail(text) {
    var done = function () { showToast(STR.copied + " · " + text); };
    var fail = function () { showToast(fmt(STR.copyFail, { e: text })); };
    var legacy = function () {
      var ok = false, prev = doc.activeElement;
      try {
        var ta = doc.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
        doc.body.appendChild(ta); ta.select(); ok = doc.execCommand("copy"); ta.remove();
      } catch (e) { ok = false; }
      if (prev && prev.focus) try { prev.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      return ok;
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { legacy() ? done() : fail(); });
    else if (legacy()) done(); else fail();
  }
  var toastT = 0;
  function makeToast() {
    if (toast) return;
    toast = doc.createElement("div");           /* a live region that exists before it speaks, so the message is announced */
    toast.className = "xpal-toast"; toast.setAttribute("role", "status"); toast.setAttribute("aria-live", "polite");
    doc.body.appendChild(toast);
  }
  function showToast(msg) {
    makeToast();
    toast.innerHTML = '<span class="xpal-toast__dot" aria-hidden="true"></span>' + esc(msg);
    void toast.offsetWidth;
    toast.classList.add("is-in");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toast.classList.remove("is-in"); toastT = setTimeout(function () { toast.textContent = ""; }, 500); }, 2600);
  }

  /* ---------------------------------------------------------------- navigation */
  function normPath(p) { return p.replace(/\/index\.html$/, "/").replace(/\.html$/, ""); }
  function resolve(u) { return /^[a-z]+:/i.test(u) ? u : BASE + u; }
  function samePage(url) {
    try { var a = new URL(url, location.href); return a.origin === location.origin && normPath(a.pathname) === normPath(location.pathname); }
    catch (e) { return false; }
  }
  function jumpTo(id) {
    var target = doc.getElementById(id);
    if (!target) { location.hash = id; return; }
    if (!target.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) target.setAttribute("tabindex", "-1");
    try { history.pushState(null, "", "#" + id); } catch (e) { /* file:// */ }
    var gal = target.closest && target.closest(".gallery.is-pinned .gallery__track");
    if (gal) { try { target.focus({ preventScroll: true }); } catch (e) { /* ignore */ } return; }   /* home.js scrolls a focused slide into the pinned track */
    var off = -((J().navOffset && J().navOffset()) || 80);
    if (J().scrollTo) J().scrollTo(target, { offset: off });
    else window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY + off, behavior: reduced() ? "auto" : "smooth" });
    setTimeout(function () { try { target.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, J().lenis ? 900 : 60);
  }
  function go(url) {
    var a = doc.createElement("a");
    a.href = url; a.style.display = "none";
    doc.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 0);   /* the site's own link handling (curtain) applies */
  }
  function activate(item, newTab) {
    if (!item) return;
    remember(item.i);
    if (item.g === "action") {
      close({ instant: true });
      requestAnimationFrame(function () { try { item.run(); } catch (e) { if (window.console) console.warn("[palette]", e); } });
      return;
    }
    var url = resolve(item.u);
    if (/^mailto:/i.test(url)) { close({ instant: true }); location.href = url; return; }
    if (item.e || newTab) { close({ instant: false }); openTab(url); return; }
    if (samePage(url)) {
      close({ instant: false, restore: false });
      if (item.a) jumpTo(item.a);
      else if (J().scrollTo) J().scrollTo(0, { duration: 1.1 }); else window.scrollTo(0, 0);
      return;
    }
    close({ instant: true, restore: false });
    go(url);
  }

  /* ---------------------------------------------------------------- DOM */
  function build() {
    if (root) return;
    root = doc.createElement("div");
    root.className = "xpal"; root.hidden = true;
    root.innerHTML =
      '<div class="xpal__scrim"></div>' +
      '<div class="xpal__panel" role="dialog" aria-modal="true" aria-label="' + esc(STR.dialog) + '">' +
        '<div class="xpal__rim" aria-hidden="true"><i class="xpal__spin"></i></div>' +
        '<div class="xpal__head">' + svg("search", "xpal__svg xpal__glass") +
          '<input class="xpal__input" type="text" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="xpal-list"' +
          ' aria-label="' + esc(STR.input) + '" placeholder="' + esc(STR.placeholder) + '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go">' +
          '<button class="xpal__x" type="button" aria-label="' + esc(STR.close) + '"><kbd class="xpal-kbd">esc</kbd></button>' +
        "</div>" +
        '<div class="xpal__list" id="xpal-list" role="listbox" aria-label="' + esc(STR.results) + '" data-lenis-prevent></div>' +
        '<div class="xpal__foot" aria-hidden="true">' +
          '<span class="xpal__keys"><span><kbd class="xpal-kbd">↑</kbd><kbd class="xpal-kbd">↓</kbd>' + esc(STR.nav) + "</span>" +
          '<span><kbd class="xpal-kbd">↵</kbd>' + esc(STR.open) + "</span>" +
          '<span><kbd class="xpal-kbd">' + esc(MOD) + '</kbd><kbd class="xpal-kbd">↵</kbd>' + esc(STR.tab) + "</span>" +
          '<span><kbd class="xpal-kbd">esc</kbd>' + esc(STR.esc) + "</span></span>" +
          '<span class="xpal__count"></span>' +
        "</div>" +
        '<p class="xpal__live vh" role="status" aria-live="polite"></p>' +
      "</div>";
    doc.body.appendChild(root);
    makeToast();
    scrim = root.querySelector(".xpal__scrim"); panel = root.querySelector(".xpal__panel");
    input = root.querySelector(".xpal__input"); list = root.querySelector(".xpal__list");
    live = root.querySelector(".xpal__live"); footCount = root.querySelector(".xpal__count"); closeBtn = root.querySelector(".xpal__x");

    input.addEventListener("input", function () { S.q = input.value; S.active = 0; render(false); });
    input.addEventListener("keydown", onInputKey);
    closeBtn.addEventListener("click", function () { close(); });
    scrim.addEventListener("click", function () { close(); });
    panel.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var f = [input, closeBtn], i = f.indexOf(doc.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
    });
    /* wheel over the scrim or the panel chrome never scrolls the page; the list scrolls itself (data-lenis-prevent) */
    root.addEventListener("wheel", function (e) { if (!list.contains(e.target)) e.preventDefault(); }, { passive: false });
    list.addEventListener("mousedown", function (e) { e.preventDefault(); });   /* keep focus in the input */
    list.addEventListener("mousemove", function (e) {
      var o = e.target.closest && e.target.closest(".xpal__opt");
      if (o) { var n = +o.getAttribute("data-n"); if (n !== S.active) setActive(n, false); }
    });
    list.addEventListener("click", function (e) {
      var o = e.target.closest && e.target.closest(".xpal__opt");
      if (o) activate(S.flat[+o.getAttribute("data-n")], e.metaKey || e.ctrlKey || e.shiftKey);
    });
    list.addEventListener("auxclick", function (e) {
      var o = e.button === 1 && e.target.closest && e.target.closest(".xpal__opt");
      if (o) { e.preventDefault(); activate(S.flat[+o.getAttribute("data-n")], true); }
    });
  }

  function injectButton() {
    if (navBtn || !doc.querySelector(".nav__tools")) return;
    var tools = doc.querySelector(".nav__tools");
    navBtn = doc.createElement("button");
    navBtn.type = "button"; navBtn.className = "xpal-btn";
    navBtn.setAttribute("aria-haspopup", "dialog");
    navBtn.setAttribute("aria-expanded", "false");
    navBtn.setAttribute("aria-keyshortcuts", MAC ? "Meta+K /" : "Control+K /");
    navBtn.setAttribute("aria-label", STR.btnLabel);
    navBtn.setAttribute("title", STR.btnLabel);
    navBtn.innerHTML = svg("search", "xpal-btn__i") + '<span class="xpal-btn__t">' + esc(STR.btn) + '</span><kbd class="xpal-kbd xpal-btn__k" aria-hidden="true">' + (MAC ? "⌘K" : "Ctrl K") + "</kbd>";
    var before = tools.querySelector(".music-btn") || tools.querySelector(".theme-toggle") || tools.querySelector(".nav__menu");
    tools.insertBefore(navBtn, before);
    navBtn.addEventListener("click", function () { if (S.open) close(); else open(undefined, navBtn); });
    var warm = function () { ensureIndex(); navBtn.removeEventListener("pointerenter", warm); navBtn.removeEventListener("focus", warm); };
    navBtn.addEventListener("pointerenter", warm); navBtn.addEventListener("focus", warm);
  }

  /* ---------------------------------------------------------------- rendering */
  function hl(text, pos) {
    if (!pos || !pos.length) return esc(text);
    var mark = {}, out = "", on = false;
    pos.forEach(function (p) { mark[p] = 1; });
    for (var i = 0; i < text.length; i++) {
      var m = !!mark[i];
      if (m !== on) { out += m ? "<mark>" : "</mark>"; on = m; }
      out += esc(text.charAt(i));
    }
    return out + (on ? "</mark>" : "");
  }
  function snippet(item, sn, toks) {
    var src = item[sn.f] || "", f = item["_" + sn.f] || "";
    var a = Math.max(0, sn.at - (CJK.test(src.charAt(sn.at)) ? 14 : 34)), b = Math.min(src.length, sn.at + 90);
    if (a > 0) { var sp = src.indexOf(" ", a); if (sp >= 0 && sp < sn.at) a = sp + 1; }
    var part = src.slice(a, b), fpart = f.slice(a, b), pos = [];
    toks.forEach(function (tk) {
      var at = fpart.indexOf(tk);
      while (at >= 0) { for (var i = 0; i < tk.length; i++) pos.push(at + i); at = fpart.indexOf(tk, at + tk.length); }
    });
    return (a > 0 ? "…" : "") + hl(part, pos) + (b < src.length ? "…" : "");
  }
  function crumbHTML(c, pos) {
    if (!c) return "";
    var parts = c.split(" · "), out = [], off = 0;
    parts.forEach(function (p) {
      var local = (pos || []).filter(function (x) { return x >= off && x < off + p.length; }).map(function (x) { return x - off; });
      out.push(hl(p, local));
      off += p.length + 3;
    });
    return out.join('<span class="xpal__sep" aria-hidden="true"> › </span>');
  }
  function iconFor(item) {
    if (item.g === "action") return item.ic || "link";
    if (item.g === "link") return /^mailto:/.test(item.u) ? "mail" : /\.pdf$/i.test(item.u) ? "pdf" : "link";
    return item.g;
  }
  function optionHTML(r, n, toks) {
    var it = r.item, here = it.g === "page" && samePage(resolve(it.u));
    var sub = r.snip ? snippet(it, r.snip, toks) : esc(it.s || "");
    var meta = here ? STR.here : (it.m || "");
    var ext = it.e || it.g === "link" && /^https?:/.test(it.u);
    return '<div class="xpal__opt" role="option" id="xpal-o-' + n + '" data-n="' + n + '" aria-selected="false"' + (it.h ? ' data-hue="' + esc(it.h) + '"' : "") +
      (ext ? ' aria-description="' + esc(STR.ext) + '"' : "") + ">" +
      '<span class="xpal__ico">' + svg(iconFor(it)) + "</span>" +
      '<span class="xpal__main"><span class="xpal__t">' + hl(it.t, r.tpos) + "</span>" +
      ((it.c || sub) ? '<span class="xpal__c">' + (it.c ? '<span class="xpal__crumb">' + crumbHTML(it.c, r.cpos) + "</span>" : "") +
        (sub ? '<span class="xpal__s">' + sub + "</span>" : "") + "</span>" : "") +
      "</span>" +
      (meta ? '<span class="xpal__m">' + esc(meta) + "</span>" : "") +
      '<span class="xpal__go" aria-hidden="true">' + (ext ? svg("link") : svg("ret")) + "</span>" +
      "</div>";
  }
  var GROUP_ORDER = ["page", "section", "research", "pub", "xp", "link", "action"];
  var GROUP_MAX = { page: 5, section: 6, research: 6, pub: 3, xp: 6, link: 5, action: 6 };
  function compute() {
    var q = S.q.trim(), acts = actions(), groups = [];
    if (!q) {
      var by = S.index ? S.index.byId : {}, actBy = {};
      acts.forEach(function (a) { actBy[a.i] = a; });
      var rec = recentIds().map(function (id) { return by[id] || actBy[id]; }).filter(Boolean).slice(0, 4);
      var recIds = rec.map(function (x) { return x.i; });
      if (rec.length) groups.push({ key: "recent", rows: rec.map(function (it) { return { item: it }; }) });
      if (S.index) {
        var sug = (S.index.sug || []).map(function (id) { return by[id]; }).filter(function (x) { return x && recIds.indexOf(x.i) < 0; }).slice(0, 5);
        if (sug.length) groups.push({ key: "sug", rows: sug.map(function (it) { return { item: it }; }) });
      }
      groups.push({ key: "action", rows: acts.filter(function (a) { return recIds.indexOf(a.i) < 0; }).map(function (it) { return { item: it }; }) });
      return { groups: groups, toks: [], total: 0 };
    }
    var toks = tokens(q), whole = toks.join(" "), res = [];
    var pool = (S.index ? S.index.items : []).concat(acts);
    for (var i = 0; i < pool.length; i++) { var r = score(pool[i], toks, whole); if (r) res.push(r); }
    res.sort(function (a, b) { return b.score - a.score; });
    var byG = {};
    res.forEach(function (r) { (byG[r.item.g] = byG[r.item.g] || []).push(r); });
    GROUP_ORDER.forEach(function (g) { if (byG[g]) groups.push({ key: g, rows: byG[g].slice(0, GROUP_MAX[g] || 6), best: byG[g][0].score, all: byG[g].length }); });
    groups.sort(function (a, b) { return (b.best - a.best) || (GROUP_ORDER.indexOf(a.key) - GROUP_ORDER.indexOf(b.key)); });
    return { groups: groups, toks: toks, total: res.length };
  }
  var liveT = 0;
  function render(keepActive) {
    if (!root) return;
    var prevId = keepActive && S.flat[S.active] ? S.flat[S.active].i : null;
    var out = compute(), h = "", n = 0, flat = [];
    out.groups.forEach(function (g) {
      if (!g.rows.length) return;
      var gid = "xpal-g-" + g.key;
      h += '<div class="xpal__group" role="group" aria-labelledby="' + gid + '"><div class="xpal__gh" id="' + gid + '" role="presentation">' +
        esc(STR.groups[g.key] || g.key) + (g.all > g.rows.length ? '<span class="xpal__gn">' + g.rows.length + " / " + g.all + "</span>" : "") + "</div>";
      g.rows.forEach(function (r) { h += optionHTML(r, n++, out.toks); flat.push(r.item); });
      h += "</div>";
    });
    var q = S.q.trim();
    if (q && !flat.length) {
      h = '<div class="xpal__empty" role="presentation"><p class="xpal__empty-t">' + esc(fmt(STR.none, { q: q })) + '</p><p class="xpal__empty-d">' +
        esc(S.error ? STR.failed : S.loading ? STR.loading : STR.noneHint) + "</p></div>";
    } else if (!S.index && (S.loading || S.error)) {
      h += '<p class="xpal__note" role="presentation">' + esc(S.error ? STR.failed : STR.loading) + "</p>";
    }
    S.flat = flat;
    list.innerHTML = h;
    var count = q ? (out.total === 1 ? STR.count1 : fmt(STR.countN, { n: out.total })) : "";
    footCount.textContent = count;
    clearTimeout(liveT);
    liveT = setTimeout(function () { if (S.open) live.textContent = q ? (out.total ? count : fmt(STR.none, { q: q })) : ""; }, 450);
    var keep = -1;
    if (prevId) for (var i = 0; i < flat.length; i++) if (flat[i].i === prevId) { keep = i; break; }
    if (keep < 0) { S.active = 0; list.scrollTop = 0; } else S.active = keep;
    setActive(flat.length ? S.active : -1, keep >= 0);
  }
  function setActive(n, scroll) {
    var prev = list.querySelector('.xpal__opt[aria-selected="true"]');
    if (prev) prev.setAttribute("aria-selected", "false");
    S.active = n;
    if (n < 0) { input.removeAttribute("aria-activedescendant"); return; }
    var o = doc.getElementById("xpal-o-" + n);
    if (!o) return;
    o.setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", o.id);
    if (scroll) {
      var top = o.offsetTop, bot = top + o.offsetHeight, pad = 8;
      if (n === 0) list.scrollTop = 0;
      else if (top - pad < list.scrollTop) list.scrollTop = top - pad - (o.parentNode.firstChild === o.previousSibling ? 28 : 0);
      else if (bot + pad > list.scrollTop + list.clientHeight) list.scrollTop = bot + pad - list.clientHeight;
    }
  }
  function move(d) {
    var n = S.flat.length;
    if (!n) return;
    setActive(((S.active < 0 ? (d > 0 ? -1 : 0) : S.active) + d + n) % n, true);
  }
  function onInputKey(e) {
    if (e.isComposing || e.keyCode === 229) return;   /* IME (Chinese input) is composing */
    var k = e.key;
    if (k === "ArrowDown" || k === "ArrowUp") { e.preventDefault(); move(k === "ArrowDown" ? 1 : -1); }
    else if ((k === "Home" || k === "End") && !e.shiftKey && S.flat.length) { e.preventDefault(); setActive(k === "Home" ? 0 : S.flat.length - 1, true); }
    else if ((k === "PageDown" || k === "PageUp") && S.flat.length) {
      e.preventDefault();
      setActive(Math.max(0, Math.min(S.flat.length - 1, S.active + (k === "PageDown" ? 6 : -6))), true);
    }
    else if (k === "Enter") {
      e.preventDefault();
      if (S.active >= 0) activate(S.flat[S.active], e.metaKey || e.ctrlKey);
    }
  }

  /* ---------------------------------------------------------------- open / close */
  var gsap = function () { return window.gsap || null; };
  function lenis() { return J().lenis || window.lenis || null; }
  function open(q, from) {
    build();
    if (S.closing) { S.closing(); }
    if (S.open) { if (typeof q === "string") { input.value = q; S.q = q; render(false); } input.focus(); return; }
    S.open = true;
    var ae = doc.activeElement;
    S.opener = from || (ae && ae !== doc.body && ae !== html && !root.contains(ae) ? ae : null);   /* null: nothing had focus */
    input.value = typeof q === "string" ? q : ""; S.q = input.value; S.active = 0;
    root.hidden = false;
    html.classList.add("jw-palette-open");
    if (navBtn) navBtn.setAttribute("aria-expanded", "true");
    var L = lenis();
    S.lenisStopped = false;
    if (L && !L.isStopped && L.stop) { L.stop(); S.lenisStopped = true; }
    render(false);
    ensureIndex();
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    var G = gsap();
    if (G) { G.killTweensOf([scrim, panel]); G.set([scrim, panel], { clearProps: "opacity,transform" }); }
    root.classList.remove("is-out");
    if (reduced()) { root.classList.add("is-in"); return; }
    if (G) {
      root.classList.add("is-in", "is-gsap");
      var ease = (J().ease && J().ease.s) || "expo.out";
      G.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out" });
      G.fromTo(panel, { opacity: 0, y: -12, scale: 0.982 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: ease, clearProps: "transform" });
      var rows = Array.prototype.slice.call(list.querySelectorAll(".xpal__gh, .xpal__opt"), 0, 9);
      if (rows.length) G.fromTo(rows, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.36, ease: ease, stagger: 0.022, delay: 0.06, clearProps: "opacity,transform" });
    } else {
      root.classList.remove("is-gsap");
      void root.offsetWidth;
      root.classList.add("is-in");
    }
  }
  function close(opts) {
    if (!S.open || !root) return;
    opts = opts || {};
    S.open = false;
    html.classList.remove("jw-palette-open");
    if (navBtn) navBtn.setAttribute("aria-expanded", "false");
    clearTimeout(liveT); live.textContent = "";
    var L = lenis();
    if (S.lenisStopped && L && L.start) L.start();
    S.lenisStopped = false;
    var opener = S.opener;
    if (opts.restore !== false && opener && opener.focus && doc.contains(opener)) {
      try { opener.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    } else if (doc.activeElement && root.contains(doc.activeElement)) {
      doc.activeElement.blur();
    }
    var finish = function () {
      S.closing = null;
      root.hidden = true;
      root.classList.remove("is-in", "is-out", "is-gsap", "is-closing");
      var G = gsap(); if (G) G.set([scrim, panel], { clearProps: "opacity,transform" });
    };
    var G = gsap();
    if (opts.instant || reduced()) { if (G) G.killTweensOf([scrim, panel]); finish(); return; }
    S.closing = function () { if (G) G.killTweensOf([scrim, panel]); clearTimeout(t); finish(); };
    root.classList.add("is-closing");
    var t = setTimeout(function () { if (S.closing) S.closing(); }, 450);   /* safety net if frames are throttled */
    if (G) {
      G.killTweensOf([scrim, panel]);
      G.to(panel, { opacity: 0, y: -6, scale: 0.99, duration: 0.17, ease: "power2.in" });
      G.to(scrim, { opacity: 0, duration: 0.2, ease: "power1.in", onComplete: function () { if (S.closing) S.closing(); } });
    } else {
      root.classList.add("is-out");
      root.classList.remove("is-in");
      clearTimeout(t);
      t = setTimeout(function () { if (S.closing) S.closing(); }, 220);
    }
  }

  /* ---------------------------------------------------------------- global keys */
  function typing(t) {
    if (!t || !t.closest) return false;
    if (t.isContentEditable) return true;
    return !!t.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
  }
  window.addEventListener("keydown", function (e) {
    if (e.defaultPrevented && !S.open) return;
    if (e.isComposing || e.keyCode === 229) return;
    var k = e.key || "";
    var isK = (e.code === "KeyK" || k.toLowerCase() === "k") && !e.altKey && !e.shiftKey && (e.metaKey !== e.ctrlKey);
    if (isK) {
      var inOurs = root && root.contains(e.target);
      if (!inOurs && typing(e.target)) return;
      if (html.classList.contains("nav-open")) return;
      e.preventDefault();
      if (S.open) close(); else open();
      return;
    }
    if (S.open) {
      if (k === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
      return;
    }
    if (k === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target) && !html.classList.contains("nav-open")) {
      e.preventDefault();
      open();
    }
  }, true);
  /* a focus that escapes the open dialog (a click on the page through some edge) comes back to the input */
  doc.addEventListener("focusin", function (e) {
    if (S.open && root && !root.contains(e.target)) { try { input.focus({ preventScroll: true }); } catch (err) { /* ignore */ } }
  });
  doc.addEventListener("themechange", function () { if (S.open) render(true); });

  /* ---------------------------------------------------------------- init */
  injectButton();
  window.JWX_palette = {
    open: function (q) { open(q); },
    close: function () { close(); },
    toggle: function () { if (S.open) close(); else open(); },
    state: function () {
      return { open: S.open, query: S.q, active: S.active, activeId: S.flat[S.active] ? S.flat[S.active].i : null,
        results: S.flat.map(function (x) { return x.i; }), loaded: !!S.index, error: S.error, lang: LANG, base: BASE,
        items: S.index ? S.index.items.length : 0, recent: recentIds().slice() };
    },
    search: function (q) {
      return ensureIndex() ? ensureIndex().then(function () { return run(q); }) : Promise.resolve(run(q));
      function run(q) { var keep = S.q; S.q = q || ""; var r = compute(); S.q = keep;
        return r.groups.map(function (g) { return { group: g.key, rows: g.rows.map(function (x) { return [x.item.i, x.item.t, Math.round(x.score || 0)]; }) }; }); }
    },
    run: function (id) {
      var it = (S.index && S.index.byId[id]) || actions().filter(function (a) { return a.i === id; })[0];
      if (it) activate(it, false);
      return !!it;
    },
    reload: function () { S.index = null; S.error = false; return ensureIndex(); }
  };
})();
