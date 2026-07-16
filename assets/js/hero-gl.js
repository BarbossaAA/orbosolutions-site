/* LUMEN Studio — hero light field (WebGL tier).
   Mounts a GL canvas above #heroCanvas; on any failure it removes itself and
   the existing 2D aurora (hero.js) runs untouched. */
(function () {
  'use strict';
  if (!window.LUMEN_GL) return;

  var bg = document.querySelector('.hero-bg');
  var heroCanvas = document.getElementById('heroCanvas');
  if (!bg || !heroCanvas) return;

  var NOISE =
    'vec3 permute(vec3 x){return mod(((x*34.0)+1.0)*x,289.0);}\n' +
    'float snoise(vec2 v){\n' +
    '  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);\n' +
    '  vec2 i=floor(v+dot(v,C.yy));\n' +
    '  vec2 x0=v-i+dot(i,C.xx);\n' +
    '  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);\n' +
    '  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;\n' +
    '  i=mod(i,289.0);\n' +
    '  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));\n' +
    '  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);\n' +
    '  m=m*m; m=m*m;\n' +
    '  vec3 x=2.0*fract(p*C.www)-1.0;\n' +
    '  vec3 h=abs(x)-0.5;\n' +
    '  vec3 ox=floor(x+0.5);\n' +
    '  vec3 a0=x-ox;\n' +
    '  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);\n' +
    '  vec3 g;\n' +
    '  g.x=a0.x*x0.x+h.x*x0.y;\n' +
    '  g.yz=a0.yz*x12.xz+h.yz*x12.yw;\n' +
    '  return 130.0*dot(m,g);\n' +
    '}\n' +
    'float fbm(vec2 p){float s=0.0,a=0.6;for(int i=0;i<2;i++){s+=a*snoise(p);p=p*2.03+17.1;a*=0.45;}return s;}\n' +
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n';

  var HEAD =
    'precision highp float;\n' +
    'uniform vec2 u_res;\nuniform float u_time;\nuniform vec2 u_mouse;\n' +
    'uniform float u_scroll;\nuniform float u_intro;\nuniform float u_dpr;\n' + NOISE;

  /* shared tail: color lobes, masks, lens ring, dot grid, grain.
     uv is bottom-up (gl_FragCoord space). */
  function tail(lensExpr, lensRadius) {
    return (
    '  vec3 ivory=vec3(0.980,0.976,0.969);\n' +
    '  float env=(0.25+0.75*u_intro)*mix(0.15,1.0,smoothstep(0.14,0.52,uv.y));\n' +
    '  vec3 col=ivory;\n' +
    '  col=mix(col,vec3(0.424,0.361,1.000),smoothstep(0.52,1.15,cf)*0.17*env);\n' +
    '  col=mix(col,vec3(1.000,0.690,0.502),smoothstep(0.55,1.18,cq)*0.13*env);\n' +
    '  col=mix(col,vec3(0.588,0.745,1.000),smoothstep(0.58,1.20,cr)*0.11*env);\n' +
    '  col=mix(col,ivory,smoothstep(0.75,1.15,length(uv-vec2(0.5,0.55))));\n' +
    '  col=mix(col,ivory,u_scroll*0.35);\n' +
    /* glass lens ring — aspect-corrected, counter-parallax */
    '  vec2 lensC=' + lensExpr + '-m*0.13;\n' +
    '  float dl=abs(length(pa-lensC)-' + lensRadius + ');\n' +
    '  float band=smoothstep(0.07,0.0,dl);\n' +
    '  col=mix(col,col*vec3(0.985,0.982,1.01)-vec3(0.012,0.014,-0.004),band*0.55);\n' +
    '  col=mix(col,vec3(0.424,0.361,1.0),smoothstep(0.006,0.0,dl)*0.10);\n' +
    '  col=mix(col,vec3(0.72,0.66,1.0),smoothstep(0.012,0.0,abs(dl-0.045))*0.045);\n' +
    /* dot grid, matching the 2D aurora: 34px, drift 4px/s, fades downward from top */
    '  float gap=34.0*u_dpr;\n' +
    '  vec2 cellp=mod(gl_FragCoord.xy+vec2(mod(u_time*4.0*u_dpr,gap),0.0),gap)-vec2(gap*0.5);\n' +
    '  float dm=smoothstep(1.3*u_dpr,0.5*u_dpr,length(cellp));\n' +
    '  float topFrac=1.0-uv.y;\n' +
    '  float dfade=clamp(1.0-topFrac/0.72,0.0,1.0)*step(topFrac,0.72);\n' +
    '  col=mix(col,vec3(0.078,0.071,0.122),dm*0.0225*dfade);\n' +
    /* film-grain continuity */
    '  col+=(hash(gl_FragCoord.xy+fract(u_time)*100.0)-0.5)*0.018;\n' +
    '  gl_FragColor=vec4(col,1.0);\n' +
    '}\n');
  }

  /* FULL: two-level domain warp, three mouse gains = depth (12 snoise) */
  var FRAG_FULL = HEAD +
    'void main(){\n' +
    '  vec2 uv=gl_FragCoord.xy/u_res;\n' +
    '  float aspect=u_res.x/u_res.y;\n' +
    '  vec2 pa=uv*vec2(aspect,1.0);\n' +
    '  vec2 p=pa;\n' +
    '  vec2 m=u_mouse-0.5;\n' +
    '  float t=u_time*0.05;\n' +
    '  p.y-=(1.0-u_intro)*0.12;\n' +
    '  vec2 drift=vec2(-t*0.35,t*0.12);\n' +
    '  vec2 q=vec2(fbm(p*0.9+drift+m*0.02),fbm(p*0.9+drift+vec2(5.2,1.3)));\n' +
    '  vec2 r=vec2(fbm(p*0.9+0.9*q+vec2(1.7,9.2)+m*0.06),fbm(p*0.9+0.9*q+vec2(8.3,2.8)));\n' +
    '  float f=fbm(p*0.9+1.1*r+m*0.09);\n' +
    '  float cf=f*0.5+0.5;\n' +
    '  float cq=q.y*0.5+0.5;\n' +
    '  float cr=r.x*0.5+0.5;\n' +
    tail('vec2(0.24*aspect,0.58)', '0.20');

  /* CHEAP: single warp level (7 snoise), ring recentered for portrait */
  var FRAG_CHEAP = HEAD +
    'void main(){\n' +
    '  vec2 uv=gl_FragCoord.xy/u_res;\n' +
    '  float aspect=u_res.x/u_res.y;\n' +
    '  vec2 pa=uv*vec2(aspect,1.0);\n' +
    '  vec2 p=pa;\n' +
    '  vec2 m=u_mouse-0.5;\n' +
    '  float t=u_time*0.05;\n' +
    '  p.y-=(1.0-u_intro)*0.12;\n' +
    '  vec2 drift=vec2(-t*0.35,t*0.12);\n' +
    '  vec2 q=vec2(fbm(p*0.9+drift+m*0.03),fbm(p*0.9+drift+vec2(5.2,1.3)));\n' +
    '  float f=fbm(p*0.9+1.1*q+m*0.09);\n' +
    '  float cf=f*0.5+0.5;\n' +
    '  float cq=q.y*0.5+0.5;\n' +
    '  float cr=q.x*0.5+0.5;\n' +
    tail('vec2(0.5*aspect,0.62)', '0.14');

  var canvas = document.createElement('canvas');
  canvas.id = 'heroGL';
  canvas.setAttribute('aria-hidden', 'true');
  bg.insertBefore(canvas, heroCanvas);

  var inst = LUMEN_GL.mount({
    canvas: canvas,
    frag: FRAG_FULL,
    fragCheap: FRAG_CHEAP,
    preferCheap: innerWidth < 768,
    curatedTime: 40.0,
    scrollRange: 600
  });

  if (!inst) {
    bg.removeChild(canvas);
    return; /* Tier 2: hero.js 2D aurora runs untouched */
  }

  heroCanvas.dataset.gl = '1';
  heroCanvas.style.display = 'none';
  document.documentElement.classList.add('gl');
})();
