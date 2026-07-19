/* LUMEN Studio - inner-page hero aurora strip (services, contact).
   Hero light-field language at lower intensity: single warp level, no lens
   ring, no dot grid. Fallback: canvas removed, .page-hero::before stands. */
(function () {
  'use strict';
  if (!window.LUMEN_GL) return;

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

  var FRAG =
    'precision highp float;\n' +
    'uniform vec2 u_res;\nuniform float u_time;\nuniform vec2 u_mouse;\n' +
    'uniform float u_scroll;\nuniform float u_intro;\nuniform float u_dpr;\n' + NOISE +
    'void main(){\n' +
    '  vec2 uv=gl_FragCoord.xy/u_res;\n' +
    '  float aspect=u_res.x/u_res.y;\n' +
    '  vec2 p=uv*vec2(aspect,1.0);\n' +
    '  vec2 m=u_mouse-0.5;\n' +
    '  float t=u_time*0.05;\n' +
    '  vec2 drift=vec2(-t*0.35,t*0.12);\n' +
    '  vec2 q=vec2(fbm(p*0.7+drift+m*0.03),fbm(p*0.7+drift+vec2(5.2,1.3)));\n' +
    '  float f=fbm(p*0.7+0.9*q+m*0.07);\n' +
    '  float cf=f*0.5+0.5;\n' +
    '  float cq=q.y*0.5+0.5;\n' +
    '  float cr=q.x*0.5+0.5;\n' +
    '  vec3 ivory=vec3(0.980,0.980,0.976);\n' +
    /* light biased to the top of the strip (uv bottom-up: top = 1) */
    '  float env=(0.25+0.75*u_intro)*mix(0.25,1.0,smoothstep(0.35,0.9,uv.y));\n' +
    '  vec3 col=ivory;\n' +
    '  col=mix(col,vec3(0.424,0.361,1.000),smoothstep(0.46,1.08,cf)*0.16*env);\n' +
    '  col=mix(col,vec3(1.000,0.690,0.502),smoothstep(0.48,1.10,cq)*0.12*env);\n' +
    '  col=mix(col,vec3(0.588,0.745,1.000),smoothstep(0.50,1.12,cr)*0.10*env);\n' +
    /* dissolve into the page toward the bottom edge */
    '  col=mix(col,ivory,smoothstep(0.42,0.02,uv.y));\n' +
    '  col=mix(col,ivory,u_scroll*0.4);\n' +
    '  col+=(hash(gl_FragCoord.xy+fract(u_time)*100.0)-0.5)*0.016;\n' +
    '  gl_FragColor=vec4(col,1.0);\n' +
    '}\n';

  var canvases = document.querySelectorAll('.pageHeroCanvas');
  for (var i = 0; i < canvases.length; i++) {
    (function (canvas) {
      /* narrow screens: the strip reads near-flat and the opaque canvas would
         hide the CSS tints - let the static gradient tier carry mobile */
      if (innerWidth < 768) {
        if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
        return;
      }
      var inst = LUMEN_GL.mount({
        canvas: canvas,
        frag: FRAG,
        fragCheap: null,
        curatedTime: 12.0,
        scrollRange: 400
      });
      if (!inst && canvas.parentElement) canvas.parentElement.removeChild(canvas);
    })(canvases[i]);
  }
})();
