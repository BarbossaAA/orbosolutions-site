/* LUMEN Studio - CTA band night field.
   Living version of the band's static radial glow: volumetric violet,
   drifting dust-stars, pointer bloom. Paints over .cta-band::before;
   on failure the canvas is simply removed and the CSS glow stands. */
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
    'float fbm(vec2 p){float s=0.0,a=0.5;for(int i=0;i<3;i++){s+=a*snoise(p);p=p*2.03+17.1;a*=0.5;}return s;}\n' +
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n';

  var FRAG =
    'precision highp float;\n' +
    'uniform vec2 u_res;\nuniform float u_time;\nuniform vec2 u_mouse;\n' +
    'uniform float u_scroll;\nuniform float u_intro;\nuniform float u_dpr;\n' + NOISE +
    'void main(){\n' +
    '  vec2 uv=gl_FragCoord.xy/u_res;\n' +
    '  float aspect=u_res.x/u_res.y;\n' +
    '  vec2 p=uv*vec2(aspect,1.0);\n' +
    '  float t=u_time*0.05;\n' +
    '  vec3 col=vec3(0.086,0.075,0.122);\n' +                       /* #16131F */
    /* volumetric violet rising from the bottom (uv bottom-up: strong near 0) */
    '  float vol=(fbm(p*1.2+vec2(-t*0.3,t*0.5))*0.5+0.5);\n' +
    '  col=mix(col,vec3(0.424,0.361,1.0),smoothstep(0.85,0.0,uv.y)*vol*0.34);\n' +
    /* faint upper haze, echoes the old second radial */
    '  col=mix(col,vec3(0.616,0.42,1.0),smoothstep(0.55,1.25,uv.y)*vol*0.10);\n' +
    /* sparse dust-stars: cell hash, twinkle, right-to-left drift */
    '  float gap=42.0*u_dpr;\n' +
    '  vec2 sp=gl_FragCoord.xy+vec2(-u_time*8.0*u_dpr,0.0);\n' +
    '  vec2 cell=floor(sp/gap);\n' +
    '  float hs=hash(cell);\n' +
    '  vec2 cp=fract(sp/gap)-vec2(hash(cell+7.3),hash(cell+3.1));\n' +
    '  float star=step(0.93,hs)*smoothstep(0.06,0.0,length(cp));\n' +
    '  float tw=sin(u_time*0.4+hs*6.28)*0.5+0.5;\n' +
    '  col+=vec3(0.85,0.82,1.0)*star*(0.25+0.55*tw);\n' +
    /* pointer bloom (band-local coords; falls off fast, ~0 outside) */
    '  vec2 mp=clamp(u_mouse,vec2(-0.3),vec2(1.3))*vec2(aspect,1.0);\n' +
    '  col+=exp(-length(p-mp)*4.0)*vec3(0.616,0.549,1.0)*0.18;\n' +
    '  col+=(hash(gl_FragCoord.xy+fract(u_time)*100.0)-0.5)*0.02;\n' +
    '  gl_FragColor=vec4(col,1.0);\n' +
    '}\n';

  var canvases = document.querySelectorAll('.cta-canvas');
  for (var i = 0; i < canvases.length; i++) {
    (function (canvas) {
      var inst = LUMEN_GL.mount({
        canvas: canvas,
        frag: FRAG,
        fragCheap: null,
        curatedTime: 25.0,
        scrollRange: 600,
        localPointer: true
      });
      if (!inst && canvas.parentElement) canvas.parentElement.removeChild(canvas);
    })(canvases[i]);
  }
})();
