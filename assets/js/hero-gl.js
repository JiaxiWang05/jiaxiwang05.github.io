/* Endoscopic lumen shader for the hero scope (raw WebGL1).
   Usage: JWScope.mount(lensElement) -> { setAdvance(0..1), setBurst(0..1) }
   Falls back to the CSS poster gradient if WebGL is unavailable or motion is reduced. */

(function () {
  "use strict";

  var VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
  var FRAG = [
    "precision highp float;",
    "uniform vec2 u_res;uniform float u_time;uniform float u_adv;uniform vec2 u_ptr;uniform float u_burst;uniform float u_oct;",
    "float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
    "float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);",
    " return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}",
    "float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){if(float(i)>=u_oct)break;v+=a*noise(p);p*=2.03;a*=.5;}return v;}",
    "void main(){",
    " vec2 uv=(gl_FragCoord.xy-.5*u_res)/min(u_res.x,u_res.y);",
    " vec2 c=vec2(.07,.09)+u_ptr*.07;",
    " vec2 p=uv-c*(1.-u_burst);",
    " float r=length(p);float a=atan(p.y,p.x);",
    " float depth=.2/(r+.02)+u_time*.32+u_adv*9.;",
    " float ang=a/6.2831853;",
    " vec2 q=vec2(ang*7.,depth*.55);",
    " float w=fbm(q+vec2(0.,u_time*.04));",
    " float n=fbm(q*1.7+vec2(w*1.6,0.));",
    " float ridge=1.-abs(sin((ang*7.+n*1.3)*3.14159+depth*.5));",
    " ridge=pow(ridge,2.2);",
    " float wall=smoothstep(.05,.95,n*.85+ridge*.55);",
    " vec3 coral=vec3(1.,.333,.271),mag=vec3(1.,.18,.545),deep=vec3(.07,.004,.04),spec=vec3(1.,.89,.855);",
    " vec3 green=vec3(.078,.878,.627),cyan=vec3(0.,.776,.871),amber=vec3(1.,.76,.1);",
    " vec3 col=mix(coral*.45,coral,wall);",
    " col=mix(col,mag,smoothstep(.5,1.,ridge)*.7);",
    " col=mix(col,amber,smoothstep(.75,1.,n)*.25);",
    " float sp=pow(max(0.,ridge*n*1.25),5.)*2.6;",
    " col+=spec*sp*.8;",
    " float light=smoothstep(.0,.5,r);",
    " col=mix(deep,col,light);",
    " col*=smoothstep(.012,.11,r);",
    " vec2 tp=p-vec2(.045,.035);",
    " float tg=exp(-dot(tp,tp)*110.);",
    " col+=green*tg*(.75+.35*sin(u_time*2.6));",
    " col+=cyan*pow(smoothstep(.32,.7,r),3.)*.22;",
    " col=mix(col,vec3(.122,.239,1.),u_burst*u_burst);",
    " float R=length(uv);",
    " col*=smoothstep(.5,.43,R);",
    " col+=(hash(gl_FragCoord.xy+fract(u_time)*91.)-.5)*.06;",
    " gl_FragColor=vec4(col,1.);",
    "}"
  ].join("\n");

  function mount(lens) {
    var api = { setAdvance: function () {}, setBurst: function () {} };
    if (!lens) return api;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return api;
    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    var gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) return api;

    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return api;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return api;
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    ["u_res", "u_time", "u_adv", "u_ptr", "u_burst", "u_oct"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    var mobile = window.matchMedia("(max-width: 760px)").matches;
    var dprCap = mobile ? 1 : 1.5;
    gl.uniform1f(U.u_oct, mobile ? 2 : 4);
    lens.appendChild(canvas);
    canvas.style.opacity = "0";
    canvas.style.transition = "opacity 1.2s cubic-bezier(.16,1,.3,1)";

    function resize() {
      var r = lens.getBoundingClientRect();
      var d = Math.min(window.devicePixelRatio || 1, dprCap);
      canvas.width = Math.max(2, Math.round(r.width * d));
      canvas.height = Math.max(2, Math.round(r.height * d));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.u_res, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener("resize", resize);

    var adv = 0, burst = 0, px = 0, py = 0, tx = 0, ty = 0;
    if (window.matchMedia("(pointer: fine)").matches) {
      window.addEventListener("pointermove", function (e) {
        tx = (e.clientX / window.innerWidth - 0.5) * 2;
        ty = -(e.clientY / window.innerHeight - 0.5) * 2;
      }, { passive: true });
    }

    var visible = true, running = false, t0 = performance.now(), first = true;
    function frame(now) {
      if (!visible || document.hidden) { running = false; return; }
      px += (tx - px) * 0.06; py += (ty - py) * 0.06;
      gl.uniform1f(U.u_time, (now - t0) / 1000);
      gl.uniform1f(U.u_adv, adv);
      gl.uniform1f(U.u_burst, burst);
      gl.uniform2f(U.u_ptr, px, py);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (first) { first = false; canvas.style.opacity = "1"; }
      requestAnimationFrame(frame);
    }
    function start() { if (!running && visible && !document.hidden) { running = true; requestAnimationFrame(frame); } }
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; start(); }, { rootMargin: "100px" }).observe(lens);
    document.addEventListener("visibilitychange", start);
    start();

    api.setAdvance = function (v) { adv = v; };
    api.setBurst = function (v) { burst = v; };
    return api;
  }

  window.JWScope = { mount: mount };
})();
