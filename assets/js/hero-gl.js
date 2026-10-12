/* hero-gl.js: the endoscopic lumen (raw WebGL1). LIGHT SOURCE, package B.
   Public: window.JWScope
     mount(lens, {role, oct}) -> {setAdvance, setBurst, setTarget, setHold, setDay, setPointer, pause, resume, destroy, live}
     snapshot({size, adv, time, day}) -> dataURL ("" without WebGL); one shared still context, released 4 s after
       the last still.
     snapshotAsync(o, cb) -> cb(blob URL or ""): the same still, rendered in an idle slot and encoded with toBlob.
   Lite (html.jw-lite / JW_LITE): DPR 1, at most 2 octaves, 30 fps, stills capped at 512 px. The shader links in
   the background (KHR_parallel_shader_compile), so a mount never blocks on the compile.
   Roles: "hero" (steer over .hero), "head" (steer over .page-head), "finale" (steer inside .finale), "monitor" (no steer).
   Relights on document "themechange" (u_day tween over detail.duration, ease lumen; u_base/u_pool re-read).
   No WebGL or reduced motion: nothing is appended, the CSS poster on .scope__lens shows. */
(function () {
  "use strict";

  var html = document.documentElement;
  function mq(q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } }
  var REDUCED = mq("(prefers-reduced-motion: reduce)");
  var PHONE = mq("(max-width: 760px)");
  var FINE = mq("(pointer: fine)");
  /* lite mode (phones, tablets, small or slow machines): the head boot script sets html.jw-lite / JW_LITE;
     the same test runs here when it has not landed. Lite = same scene, DPR 1, 2 octaves, 30 fps, smaller stills. */
  var LITE = html.classList.contains("jw-lite") || window.JW_LITE === true || (window.JW_LITE !== false && (
    mq("(pointer: coarse)") || mq("(max-width: 900px)") || (navigator.hardwareConcurrency || 8) <= 4 ||
    (navigator.deviceMemory || 8) <= 4 || !!(navigator.connection && navigator.connection.saveData)));
  var LITE_MS = 30;          /* lite frame budget: at most one lens frame per ~33 ms */
  var LITE_STILL = 512;      /* lite cap for snapshot stills (the CSS scales them to the lens) */

  var VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
  /* Night = fluorescence imaging, pushed hard: hot coral / magenta tissue on a near-black lumen, wet specular
     sparkle, a pointer-steered raking light, chromatic fringes on the folds and the lens rim, an iridescent
     NBI rim, a blooming ICG target (halo + fluorescence wave while held), a saturation and contrast grade.
     Every night-only term is weighted by N = 1 - u_day, so the day image (u_day = 1) is unchanged. */
  var FRAG = [
    "precision highp float;",
    "uniform vec2 u_res,u_ptr,u_tgt;uniform float u_time,u_adv,u_burst,u_oct,u_day,u_hold;uniform vec3 u_base,u_pool;",
    "float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
    "float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);",
    " return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}",
    "float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){if(float(i)>=u_oct)break;v+=a*noise(p);p*=2.03;a*=.5;}return v;}",
    /* the tissue field (x) and its low-frequency warp (y); sampled twice near the atan branch cut (ang = +-.5)
       and blended so the wall has no seam */
    "vec2 field(float ang,float depth){vec2 q=vec2(ang*7.,depth*.55);float w=fbm(q+vec2(0.,u_time*.04));return vec2(fbm(q*1.7+vec2(w*1.6,0.)),w);}",
    "void main(){",
    " vec2 uv=(gl_FragCoord.xy-.5*u_res)/min(u_res.x,u_res.y);",
    " float N=1.-u_day;",
    " vec2 c=u_tgt*.55+u_ptr*.07;",
    " vec2 p=uv-c*(1.-u_burst);",
    " float r=length(p),a=atan(p.y,p.x);",
    " float depth=.2/(r+.02)+u_time*.32+u_adv*9.;",
    " float ang=a/6.2831853;",
    " vec2 f=field(ang,depth);",
    " float sw=smoothstep(.34,.5,abs(ang));",
    " if(sw>0.)f=mix(f,field(ang-sign(ang),depth),sw*.5);",
    " float n=f.x,w=f.y;",
    " float ph=(ang*7.+n*1.3)*3.14159+depth*.5;",
    " float ridge=pow(1.-abs(sin(ph)),2.2);",
    /* chromatic aberration on the folds: red and blue ridges drift apart toward the lens edge (night only) */
    " float ca=.2*N*smoothstep(.04,.42,r);",
    " vec3 rv=vec3(pow(1.-abs(sin(ph+ca)),2.2),ridge,pow(1.-abs(sin(ph-ca)),2.2));",
    " float wall=smoothstep(.05,.95,n*.85+ridge*.55);",
    " vec3 tissue=mix(vec3(1.,.42,.37),vec3(.89,.63,.58),u_day);",
    " vec3 low=mix(vec3(.22,.02,.09),vec3(.62,.30,.30),u_day);",
    " vec3 sheen=mix(vec3(1.,.2,.66),vec3(.96,.77,.79),u_day);",
    " vec3 deep=mix(vec3(.02,.004,.02),vec3(.23,.08,.09),u_day);",
    " vec3 spec=mix(vec3(1.,.94,.98),vec3(1.,.97,.94),u_day);",
    " vec3 col=mix(low,tissue,wall);",
    " col=mix(col,sheen,smoothstep(.5,1.,rv)*mix(.85,.45,u_day));",
    " col=mix(col,vec3(1.,.76,.1),smoothstep(.75,1.,n)*mix(.2,.06,u_day));",
    " col+=spec*pow(max(0.,ridge*n*1.25),5.)*mix(2.6,1.6,u_day);",
    " if(N>0.){",
    "  float rr=smoothstep(.04,.3,r);",
    /* depth tint: the far folds cool to magenta-violet, the near wall stays coral */
    "  col=mix(col,col*vec3(.78,.5,1.4),N*(1.-rr)*.65);",
    /* fluorescent haze where the folds crowd: a cheap bloom read from the low-frequency warp */
    "  col+=N*vec3(1.,.16,.55)*smoothstep(.5,.95,w)*.2*rr;",
    /* wet specular sparkle: sparse glints on the ridges that stream toward the viewer with the depth */
    "  vec2 gq=vec2(ang*96.,depth*26.);float gh=hash(floor(gq)+7.);",
    "  float glint=step(.94,gh)*(1.-smoothstep(0.,.32,length(fract(gq)-.5)))*ridge*ridge*(.55+.45*sin(u_time*6.+gh*60.));",
    "  col+=N*vec3(1.,.97,1.)*glint*1.8*smoothstep(.05,.22,r);",
    /* the scope's light, steered by the pointer, rakes the folds */
    "  vec2 lp=uv-u_ptr*.3-vec2(-.1,.12);",
    "  col+=N*mix(spec,sheen,.35)*ridge*ridge*ridge*exp(-dot(lp,lp)*8.)*.6*rr;",
    " }",
    " col=mix(deep,col,smoothstep(0.,.5,r));",
    " col*=mix(smoothstep(.012,.11,r),.55+.45*smoothstep(0.,.11,r),u_day);",
    " vec2 tp=uv-u_tgt; float d2=dot(tp,tp); float tg=exp(-d2*150.);",
    /* ICG fluorescence = the brightest signal: core, a wide bloom that lights the tissue, and while held a wave */
    " vec3 icg=vec3(.2,1.,.6);",
    /* the halo first dims the coral under it (no olive where green light meets red tissue), then glows */
    " float halo=exp(-d2*26.);",
    " vec3 night=col*(1.-halo*(.22+.4*u_hold))+icg*tg*(.92+.3*sin(u_time*2.6))*(1.+u_hold)*1.2+vec3(.08,.95,.72)*halo*(.12+.2*u_hold)*(.6+.4*wall)*(.3+.7*smoothstep(.02,.2,r));",
    " float wv=fract(u_time*.85),wd=sqrt(d2)-wv*.3;",
    " night+=icg*exp(-wd*wd*1400.)*(1.-wv)*u_hold*1.1;",
    " vec3 day=mix(col,vec3(.03,.46,.35),tg*.5*(1.+u_hold*.6));",
    " col=mix(night,day,u_day);",
    /* NBI rim, night only: iridescent cyan to violet, slowly turning */
    " vec3 irid=mix(vec3(.1,.9,1.),vec3(.95,.25,1.),.5+.5*sin(atan(uv.y,uv.x)+u_time*.35));",
    " col+=irid*pow(smoothstep(.3,.7,r),3.)*.3*N;",
    /* night grade: saturation up, a gentle S-curve for contrast (before the edge and the burst hand-off) */
    " if(N>0.){",
    "  vec3 g=clamp(col,0.,1.);",
    "  g=clamp(mix(vec3(dot(g,vec3(.2126,.7152,.0722))),g,1.14),0.,1.);",
    "  g=mix(g,g*g*(3.-2.*g),.3);",
    "  col=mix(col,g,N);",
    " }",
    " float R=length(uv);",
    " vec3 edge=mix(vec3(0.),vec3(.79,.58,.56),u_day);",
    /* lens rim with a chromatic fringe (night only) */
    " float ce=.012*N;",
    " vec3 em=vec3(smoothstep(.5,.43,R*(1.+ce)),smoothstep(.5,.43,R),smoothstep(.5,.43,R*(1.-ce)));",
    " col=mix(edge,col,mix(em,vec3(1.),u_burst));",
    " col=mix(col,mix(u_base,u_pool,smoothstep(.55,0.,R)),u_burst*u_burst);",
    /* burst: one iridescent light ring sweeps out and is gone when the hand-off lands on ground + pool */
    " float br=R-u_burst*.6;",
    " col+=N*irid*exp(-br*br*300.)*u_burst*(1.-u_burst)*1.4;",
    " col+=(hash(gl_FragCoord.xy+fract(u_time)*91.)-.5)*mix(.04,.03,u_day);",
    " gl_FragColor=vec4(col,1.);",
    "}"
  ].join("\n");
  var UNIFORMS = ["u_res", "u_ptr", "u_tgt", "u_time", "u_adv", "u_burst", "u_oct", "u_day", "u_hold", "u_base", "u_pool"];
  var DEFAULT_TGT = [0.11, 0.075];
  var ROLE_OCT = { hero: 4, head: 3, monitor: 3, finale: 2 };
  var ROLE_REGION = { hero: ".hero", head: ".page-head", finale: ".finale" };

  /* ---------- colour helpers (tokens are hex; accept rgb() too) ---------- */
  function cssVar(name) {
    try {
      if (window.JWTheme && window.JWTheme.color) return window.JWTheme.color(name);
      return getComputedStyle(html).getPropertyValue(name).trim();
    } catch (e) { return ""; }
  }
  function parseColor(s, fb) {
    s = (s || "").trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
    }
    m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
    if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
    return fb;
  }
  function isDay() { return html.getAttribute("data-theme") === "day" ? 1 : 0; }
  function baseColor() { return parseColor(cssVar("--ground"), isDay() ? [0.957, 0.949, 0.933] : [0.043, 0.047, 0.067]); }
  function poolColor() { return parseColor(cssVar("--p-coil"), isDay() ? [0.886, 0.898, 0.973] : [0.153, 0.184, 0.392]); }

  /* ---------- GL program ----------
     compile() only queues the work; finish() reads the link status (a blocking round trip to the GPU process
     while the driver still compiles). programAsync() waits for KHR_parallel_shader_compile to report the link
     done before finish(), so mounting a lens never stalls the main thread on the shader compile. */
  function compile(gl) {
    var vs = gl.createShader(gl.VERTEX_SHADER), fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(vs, VERT); gl.compileShader(vs);
    gl.shaderSource(fs, FRAG); gl.compileShader(fs);
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    return { prog: prog, vs: vs, fs: fs };
  }
  function program(gl) { return finish(gl, compile(gl)); }
  function programAsync(gl, cb) {
    var ext = null;
    try { ext = gl.getExtension("KHR_parallel_shader_compile"); } catch (e) { ext = null; }
    var c = compile(gl);
    if (!ext) { cb(finish(gl, c)); return; }
    (function poll() {
      if (gl.isContextLost()) { cb(null); return; }
      var done = true;
      try { done = !!gl.getProgramParameter(c.prog, ext.COMPLETION_STATUS_KHR); } catch (e) { done = true; }
      if (done) cb(finish(gl, c)); else requestAnimationFrame(poll);
    })();
  }
  function finish(gl, c) {
    var prog = c.prog;
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (window.console && !gl.isContextLost()) {
        [c.vs, c.fs].forEach(function (s) { if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("[JWScope] shader", gl.getShaderInfoLog(s)); });
      }
      return null;
    }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    UNIFORMS.forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    return { prog: prog, U: U };
  }
  function context(canvas, extra) {
    var o = { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" };
    for (var k in extra) o[k] = extra[k];
    try { return canvas.getContext("webgl", o) || canvas.getContext("experimental-webgl", o); } catch (e) { return null; }
  }
  /* WebGL availability is learnt from the first real context (a throwaway probe context costs ~100 ms at load) */
  var glOK = null;
  function supported() {
    if (glOK !== null) return glOK;
    try { var c = document.createElement("canvas"); var g = context(c, {}); glOK = !!g; if (g) release(g); } catch (e) { glOK = false; }
    return glOK;
  }
  function release(gl) { try { var ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); } catch (e) { /* ignore */ } }

  function emitFrame(role) {
    try { document.dispatchEvent(new CustomEvent("jwscope:frame", { detail: { role: role } })); } catch (e) { /* old engines */ }
  }

  /* ---------- scheduler: one rAF loop, at most one lens renders per frame ---------- */
  var instances = [];
  var rafId = 0, lastDraw = 0;
  function schedule() { if (!rafId) rafId = requestAnimationFrame(tick); }
  function tick(now) {
    rafId = 0;
    if (document.hidden) return;
    var best = null;
    for (var i = 0; i < instances.length; i++) {
      var it = instances[i];
      if (it.dead || it.paused || !it.visible || !it.ready) continue;
      if (!best || it.ratio > best.ratio + 0.001) best = it;
    }
    if (!best) return;     /* a lens still compiling calls schedule() itself once it is linked */
    /* lite: 30 fps (a 60 Hz display skips every other frame; the time uniform keeps the motion speed) */
    if (LITE && lastDraw && now - lastDraw < LITE_MS && now >= lastDraw) { schedule(); return; }
    lastDraw = now;
    best.draw(now);
    schedule();
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) schedule(); });

  function noop() {}
  function posterApi(role) {
    setTimeout(function () { emitFrame(role); }, 0);
    return { live: false, setAdvance: noop, setBurst: noop, setTarget: noop, setHold: noop, setDay: noop, setPointer: noop, pause: noop, resume: noop, destroy: noop };
  }

  /* ---------- reduced motion: one still frame of the real shader over the CSS poster ----------
     Nothing is appended and nothing moves; the frame is rendered once per theme on a temporary context
     (snapshot) and repainted after a theme change. Without WebGL the CSS poster stays. */
  var stills = {}, stillLenses = [];
  function applyStill(lens, url) {
    if (!url) return;
    lens.style.backgroundImage = 'url("' + url + '")';
    lens.style.backgroundSize = "cover"; lens.style.backgroundPosition = "center";
  }
  /* rendered in an idle slot and encoded off the critical path (toBlob); the CSS poster shows until then */
  function paintStill(lens) {
    var key = isDay() ? "day" : "night";
    var s = stills[key];
    if (typeof s === "string") { applyStill(lens, s); return; }
    if (s) { s.push(lens); return; }
    stills[key] = [lens];
    snapshotAsync({ size: 800, adv: 0, time: 3.7, day: key === "day" ? 1 : 0 }, function (url) {
      var wait = stills[key];
      stills[key] = url || "";
      if (url && wait && wait.forEach) wait.forEach(function (l) { if ((isDay() ? "day" : "night") === key) applyStill(l, url); });
    });
  }
  document.addEventListener("themechangeend", function () { stillLenses.forEach(paintStill); });

  /* ---------- mount ---------- */
  function mount(lens, opts) {
    opts = opts || {};
    var role = opts.role || (lens && lens.getAttribute("data-scope")) || "hero";
    if (!lens) return posterApi(role);
    if (lens._jwScope) return lens._jwScope;
    if (REDUCED && !opts.poster && glOK !== false) { stillLenses.push(lens); paintStill(lens); }
    if (REDUCED || opts.poster || glOK === false) { lens._jwScope = posterApi(role); return lens._jwScope; }

    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;border-radius:inherit;opacity:0;transition:opacity 1.2s cubic-bezier(.16,1,.3,1);pointer-events:none";
    var gl = context(canvas, {});
    if (!gl) { glOK = false; lens._jwScope = posterApi(role); return lens._jwScope; }
    glOK = true;
    var U = null;
    lens.appendChild(canvas);

    var oct = opts.oct || ROLE_OCT[role] || 3;
    if (PHONE || LITE) oct = Math.min(oct, 2);
    var dprCap = PHONE || LITE ? 1 : 1.5;
    var st = {
      adv: 0, burst: 0, hold: 0, day: isDay(), px: 0, py: 0, tx: 0, ty: 0,
      tgx: DEFAULT_TGT[0], tgy: DEFAULT_TGT[1], base: baseColor(), pool: poolColor()
    };
    var inst = { visible: false, ratio: 0, paused: false, dead: false, ready: false, role: role, draw: draw };
    var first = true, t0 = performance.now(), lost = false;

    function resize() {
      var w = lens.offsetWidth || lens.clientWidth, h = lens.offsetHeight || lens.clientHeight;
      if (!w || !h) return;
      var d = Math.min(window.devicePixelRatio || 1, dprCap);
      var W = Math.max(2, Math.round(w * d)), H = Math.max(2, Math.round(h * d));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      if (!U) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.u_res, canvas.width, canvas.height);
    }
    resize();
    /* the shader compiles in the background; the lens draws (and the canvas fades in) once it is linked */
    programAsync(gl, function (P) {
      if (inst.dead || lost) return;
      if (!P) {
        inst.dead = true; release(gl);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        emitFrame(role);    /* the CSS poster stays; anyone waiting for the first frame is released */
        return;
      }
      U = P.U; inst.ready = true;
      resize();
      gl.uniform1f(U.u_oct, oct);
      schedule();
    });
    if ("ResizeObserver" in window) new ResizeObserver(function () { resize(); schedule(); }).observe(lens);
    else window.addEventListener("resize", function () { resize(); schedule(); });

    function draw(now) {
      if (lost || !U) return;
      st.px += (st.tx - st.px) * 0.06; st.py += (st.ty - st.py) * 0.06;
      gl.uniform1f(U.u_time, (now - t0) / 1000);
      gl.uniform1f(U.u_adv, st.adv);
      gl.uniform1f(U.u_burst, st.burst);
      gl.uniform1f(U.u_hold, st.hold);
      gl.uniform1f(U.u_day, st.day);
      gl.uniform2f(U.u_ptr, st.px, st.py);
      gl.uniform2f(U.u_tgt, st.tgx, st.tgy);
      gl.uniform3f(U.u_base, st.base[0], st.base[1], st.base[2]);
      gl.uniform3f(U.u_pool, st.pool[0], st.pool[1], st.pool[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (first) { first = false; canvas.style.opacity = "1"; emitFrame(role); }
    }

    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); lost = true; inst.ready = false; canvas.style.opacity = "0"; }, false);
    canvas.addEventListener("webglcontextrestored", function () {
      var p2 = program(gl);
      if (!p2) return;
      U = p2.U; lost = false; inst.ready = true; resize(); gl.uniform1f(U.u_oct, oct); first = true; schedule();
    }, false);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        var e = es[es.length - 1];
        inst.visible = e.isIntersecting;
        inst.ratio = e.intersectionRatio;
        if (inst.visible) schedule();
      }, { rootMargin: "80px 0px", threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }).observe(lens);
    } else { inst.visible = true; inst.ratio = 1; }

    /* pointer steer, per role */
    var regionSel = ROLE_REGION[role];
    var region = regionSel && FINE && opts.steer !== false ? lens.closest(regionSel) : null;
    if (region) {
      region.addEventListener("pointermove", function (e) {
        if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
        var r = lens.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        st.tx = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
        st.ty = Math.max(-1, Math.min(1, -(e.clientY - cy) / (window.innerHeight / 2)));
      }, { passive: true });
      region.addEventListener("pointerleave", function () { st.tx = 0; st.ty = 0; });
    }

    instances.push(inst);
    schedule();

    var dayTween = null;
    var api = {
      live: true,
      canvas: canvas,
      setAdvance: function (v) { st.adv = +v || 0; },
      setBurst: function (v) { st.burst = Math.max(0, Math.min(1, +v || 0)); },
      setTarget: function (x, y) { st.tgx = +x || 0; st.tgy = +y || 0; },
      setHold: function (v) { st.hold = Math.max(0, Math.min(1, +v || 0)); },
      setDay: function (v) { if (dayTween) { dayTween.kill(); dayTween = null; } st.day = Math.max(0, Math.min(1, +v || 0)); schedule(); },
      setPointer: function (x, y) { st.tx = x; st.ty = y; },
      state: function () { return { adv: st.adv, burst: st.burst, hold: st.hold, day: st.day, tgt: [st.tgx, st.tgy], visible: inst.visible, ratio: inst.ratio }; },
      pause: function () { inst.paused = true; },
      resume: function () { inst.paused = false; schedule(); },
      destroy: function () { inst.dead = true; release(gl); if (canvas.parentNode) canvas.parentNode.removeChild(canvas); lens._jwScope = null; },
      _settle: function () {
        st.base = baseColor(); st.pool = poolColor();
        if (!dayTween) st.day = isDay();
        schedule();
      },
      _relight: function (detail) {
        st.base = baseColor(); st.pool = poolColor();
        var target = detail && detail.theme === "day" ? 1 : detail && detail.theme === "night" ? 0 : isDay();
        var dur = detail && typeof detail.duration === "number" ? detail.duration : 0;
        if (dayTween) { dayTween.kill(); dayTween = null; }
        if (!dur || !window.gsap) { st.day = target; schedule(); return; }
        var ease = window.JW && window.JW.ease ? window.JW.ease.l : "expo.inOut";
        dayTween = window.gsap.to(st, { day: target, duration: dur / 1000, ease: ease, onUpdate: schedule, onComplete: function () { dayTween = null; } });
        schedule();
      }
    };
    inst.api = api;
    lens._jwScope = api;
    return api;
  }

  /* ---------- relight on theme change ---------- */
  document.addEventListener("themechange", function (e) {
    var d = e && e.detail;
    instances.forEach(function (it) { if (!it.dead && it.api) it.api._relight(d); });
  });
  /* after the iris: re-read the ground and pool tokens; a relight tween still running finishes on its own */
  document.addEventListener("themechangeend", function () {
    instances.forEach(function (it) { if (!it.dead && it.api) it.api._settle(); });
  });

  /* ---------- snapshot: one frame on a shared still context ----------
     The context and its compiled program are kept for a few seconds after the last still, so a burst of stills
     (a theme change repaints every one) pays the context and the shader compile once; then it is released. */
  var snap = null, snapTimer = 0;
  function dropSnap() { snapTimer = 0; if (snap) { release(snap.gl); snap = null; } }
  function snapContext() {
    if (snap && snap.gl.isContextLost()) snap = null;
    if (!snap) {
      var c = document.createElement("canvas");
      c.width = c.height = 64;
      var gl = context(c, { preserveDrawingBuffer: true });
      if (!gl) { glOK = false; return null; }
      glOK = true;
      var P = null;
      try { P = program(gl); } catch (e) { P = null; }
      if (!P) { release(gl); return null; }
      snap = { c: c, gl: gl, U: P.U };
    }
    if (snapTimer) clearTimeout(snapTimer);
    snapTimer = setTimeout(dropSnap, 4000);
    return snap;
  }
  function stillSize(o) {
    var size = Math.max(64, Math.min(2048, o.size || 1024));
    return LITE ? Math.min(size, LITE_STILL) : size;
  }
  /* draws the still into the shared canvas and returns it (null without WebGL) */
  function renderStill(o) {
    if (glOK === false) return null;
    var S = snapContext();
    if (!S) return null;
    var gl = S.gl, U = S.U, c = S.c, size = stillSize(o), b = baseColor(), p = poolColor();
    if (c.width !== size || c.height !== size) { c.width = size; c.height = size; }
    gl.viewport(0, 0, size, size);
    gl.uniform2f(U.u_res, size, size);
    gl.uniform1f(U.u_time, o.time != null ? o.time : 3.7);
    gl.uniform1f(U.u_adv, o.adv != null ? o.adv : 0.35);
    gl.uniform1f(U.u_burst, 0);
    gl.uniform1f(U.u_hold, 0);
    gl.uniform1f(U.u_oct, 4);
    gl.uniform1f(U.u_day, o.day != null ? o.day : isDay());
    gl.uniform2f(U.u_ptr, 0, 0);
    gl.uniform2f(U.u_tgt, o.tgx != null ? o.tgx : DEFAULT_TGT[0], o.tgy != null ? o.tgy : DEFAULT_TGT[1]);
    gl.uniform3f(U.u_base, b[0], b[1], b[2]);
    gl.uniform3f(U.u_pool, p[0], p[1], p[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return c;
  }
  function snapshot(o) {
    o = o || {};
    try {
      var c = renderStill(o);
      return c ? c.toDataURL(o.type || "image/jpeg", 0.9) : "";
    } catch (e) { return ""; }
  }
  /* snapshotAsync(o, cb): the same still, rendered in an idle slot and encoded with toBlob (no long task);
     cb(url) gets a blob: URL ("" without WebGL). o.timeout caps the idle wait (ms, default 900). */
  function snapshotAsync(o, cb) {
    o = o || {}; cb = cb || noop;
    var run = function () {
      var c = null;
      try { c = renderStill(o); } catch (e) { c = null; }
      if (!c) { cb(""); return; }
      if (c.toBlob && window.URL && URL.createObjectURL) {
        try {
          c.toBlob(function (blob) { cb(blob ? URL.createObjectURL(blob) : ""); }, o.type || "image/jpeg", 0.9);
          return;
        } catch (e) { /* tainted or unsupported: fall back */ }
      }
      try { cb(c.toDataURL(o.type || "image/jpeg", 0.9)); } catch (e) { cb(""); }
    };
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: o.timeout || 900 });
    else setTimeout(run, 60);
  }

  window.JWScope = { mount: mount, snapshot: snapshot, snapshotAsync: snapshotAsync, supported: supported, lite: LITE };
})();
