/* 评审后主流程。沿用原配置页与访客组件；服务结果由独立演示入口模拟。 */
/* 首次设置是工作台上的一个弹窗：输入网址、读取、确认都在这同一个弹窗里，两条路径只是初始状态不同。
   读取期间只在弹窗里放动画、文案和读到的真实结果（公司、图标、定位、品牌色），不可交互，也不改动工作台；
   用户点确认后才写入配置。读取失败和用户取消一样处理：什么都不保存，回到输入网址。 */
const obKey = 'xiguan-onboarding-v4'
const obParams = new URLSearchParams(location.search)
let obSaved = cfgRead(obKey)
const obFlag = localStorage.getItem('xiguan-onboarding')
// phase：landing 落地页｜website 弹窗等待输入｜reading 弹窗读取中｜done 弹窗等待确认（尚未生效）｜ready 已确认，在工作台里
const ob = {
  phase: obSaved?.ready || obFlag ? 'ready' : localStorage.getItem('xiguan-onboarding-account') ? 'website' : 'landing',
  website: obSaved?.website || '', name: obSaved?.name || '你的官网', color: obSaved?.color || '',
  summary: obSaved?.summary || '', pages: obSaved?.pages || [], icon: obSaved?.icon || '', questions: obSaved?.questions || [],
  progress: 0, tick: -1, error: '', dialog: null, epoch: 0, expanded: false,
  skipped: obFlag === 'skipped' && !obSaved?.ready,
  preview: obParams.get('preview') === 'blocked' ? 'blocked' : 'loading',
  colorFailed: obParams.get('color') === 'fallback',
  readFailed: obParams.get('parse') === 'failed',
  shared: false
}
if (obParams.get('flow') === 'new') {ob.phase = 'landing';ob.website='';ob.skipped=false}
if (obParams.get('flow') === 'direct') {ob.phase = 'website';ob.website='';ob.skipped=false}
if (obSaved?.website) {
  state.onboarding.website=obSaved.website
  state.onboarding.color=obSaved.color || cfg.draft.appearance.primary
}
state.onboardingStep = null
const obOriginalRoute = renderRoute
const obOriginalRender = renderApp
const obOriginalPreview = renderOverviewPreview
const obTicks = [12,25,38,50,63,75,88,100]
const obInSetup = () => ['website','reading','done'].includes(ob.phase)
const obCard = '#ob-setup-card:not([data-closing])'

function obBrand() { return `<span class="ob-logo">${icon('spark')}</span><strong>吸管<span> · AI 接待</span></strong>` }
function obWelcome() { return `你好，我是${ob.name}的 AI 接待。想了解产品或解决方案？我来为你介绍。` }
// 常用问题是读取官网时一并生成的（见 obSiteData）；没有生成结果时退回三条通用问题。
const obGenericQuestions = ['你们的产品能做什么？','适合哪些业务场景？','如何了解产品报价？']
function obQuick() { return (ob.questions.length?ob.questions.map(item=>item.q):obGenericQuestions).map(text=>({id:apNewId(),text,tag:'',qa:''})) }
// 借用上游的访客组件渲染一份临时外观，不改动当前草稿和调试对话。
function obWidgetWith(patch) {
  const current=cfg.draft.appearance, chat=cfg.chat, typing=cfg.typing
  try {
    cfg.draft.appearance={...defaultAppearance(),history:false,...patch}
    cfg.chat=[];cfg.typing=false
    return renderCfgWidget({resetAction:'cfg-chat-reset'})
  } finally {cfg.draft.appearance=current;cfg.chat=chat;cfg.typing=typing}
}
function obLanding() {
  return `<main class="ob-landing"><header class="ob-site-header"><a class="ob-wordmark" href="./index.html">${obBrand()}</a><nav><button class="btn ghost" data-ob="login">登录</button><button class="btn primary" data-ob="login">免费注册</button></nav></header>
    <section class="ob-hero"><div class="ob-hero-copy"><div class="ob-kicker">吸管 · 官网 AI 接待</div><h1>每一位官网访客，<br>都有一位懂业务的接待。</h1><p>输入企业官网，自动准备知识与默认配置。<br>在真实官网界面里，体验 AI 如何回答客户的问题。</p>
    <form id="ob-entry-form" class="ob-entry-form"><label for="ob-entry-url">企业官网</label><div><input id="ob-entry-url" name="website" placeholder="https://www.your-company.com" autocomplete="url" spellcheck="false" required value="${esc(ob.website)}"><button class="btn primary" type="submit">免费开始 ${icon('arrow')}</button></div><small id="ob-entry-error"></small></form><div class="ob-hero-notes"><span>${icon('check')} 自动学习官网</span><span>${icon('check')} 沿用官网主题色</span><span>${icon('check')} 随时调整配置</span></div></div>
    <div class="ob-entry-preview"><div class="ob-entry-preview-label">${icon('chat')} 访客对话窗口<span>基于企业自己的资料回答</span></div><div class="ob-entry-widget" inert>${obWidgetWith({primary:'#123C35'})}</div></div></section><footer class="ob-entry-footer">连接官网后，即可预览、试问，并邀请同事一起体验。</footer></main>`
}

// —— 弹窗示意图的背景：颗粒感流动渐变 ——
// 移植自 GrainyGradient（原组件基于 React + three.js）。这里直接用 WebGL 画一个铺满的矩形，不引入任何依赖；
// 着色器的噪声、波形和颗粒都照原样保留，配色换成了产品的陶土与橙色系，去掉了点击产生涟漪的部分（背景不接收点击）。
// 浏览器不支持 WebGL 或着色器编译失败时什么都不画，露出样式里的浅灰底色。
const obShaderVertex = `
  attribute vec2 position;
  varying vec2 vUv;
  void main() { vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }
`
const obShaderFragment = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  uniform vec3 iResolution;
  uniform float iTime;
  varying vec2 vUv;

  const float noiseIntensity = 1.55;
  const float noiseScale = 2.0;
  const float noiseSpeed = 0.15;
  const float waveNoiseIntensity = 1.2;
  const float waveNoiseScale1 = 0.5;
  const float waveNoiseScale2 = 0.8;
  const float waveNoiseScale3 = 1.2;
  const float waveNoiseSpeed1 = 0.24;
  const float waveNoiseSpeed2 = 0.2;
  const float waveNoiseSpeed3 = 0.3;
  const float GRAIN_SPEED = 2.0;
  const float GRAIN_INTENSITY = 0.075;
  const float GRAIN_MEAN = 0.0;
  const float GRAIN_VARIANCE = 0.5;

  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)), dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
  vec2 warp(vec2 p) {
    float n1 = noise(p * waveNoiseScale1 + vec2(iTime * waveNoiseSpeed1, 0.0));
    float n2 = noise(p * waveNoiseScale1 + vec2(0.0, iTime * waveNoiseSpeed2));
    float n3 = noise(p * waveNoiseScale2 + vec2(iTime * -waveNoiseSpeed3, iTime * waveNoiseSpeed3)) * 0.5;
    float n4 = noise(p * waveNoiseScale3 + vec2(iTime * waveNoiseSpeed3, -iTime * waveNoiseSpeed3)) * 0.3;
    return p + vec2(n1 + n3, n2 + n4) * waveNoiseIntensity;
  }
  float gaussian(float z, float u, float o) {
    return (1.0 / (o * sqrt(2.0 * 3.1415))) * exp(-(((z - u) * (z - u)) / (2.0 * (o * o))));
  }
  vec3 channelMix(vec3 a, vec3 b, vec3 w) { return vec3(mix(a.r, b.r, w.r), mix(a.g, b.g, w.g), mix(a.b, b.b, w.b)); }
  vec3 overlay(vec3 a, vec3 b, float w) {
    return mix(a, channelMix(2.0 * a * b, vec3(1.0) - 2.0 * (vec3(1.0) - a) * (vec3(1.0) - b), step(vec3(0.5), a)), w);
  }
  // 七个颜色之间逐段平滑过渡（插值方式与原组件一致，写成不依赖数组下标的形式）。
  // 调色板用产品的陶土与橙色系：暖米白 → 浅杏 → 橙 → 陶土 → 深棕。
  vec3 multiColorGradient(float t) {
    float s = clamp(t, 0.0, 1.0) * 6.0;
    vec3 c = vec3(251.0, 243.0, 234.0) / 255.0;
    c = mix(c, vec3(246.0, 223.0, 200.0) / 255.0, smoothstep(0.0, 1.0, clamp(s, 0.0, 1.0)));
    c = mix(c, vec3(242.0, 184.0, 128.0) / 255.0, smoothstep(0.0, 1.0, clamp(s - 1.0, 0.0, 1.0)));
    c = mix(c, vec3(232.0, 133.0, 61.0) / 255.0, smoothstep(0.0, 1.0, clamp(s - 2.0, 0.0, 1.0)));
    c = mix(c, vec3(200.0, 86.0, 31.0) / 255.0, smoothstep(0.0, 1.0, clamp(s - 3.0, 0.0, 1.0)));
    c = mix(c, vec3(154.0, 63.0, 24.0) / 255.0, smoothstep(0.0, 1.0, clamp(s - 4.0, 0.0, 1.0)));
    c = mix(c, vec3(58.0, 26.0, 12.0) / 255.0, smoothstep(0.0, 1.0, clamp(s - 5.0, 0.0, 1.0)));
    return c;
  }
  vec3 applyGrain(vec3 color, vec2 uv) {
    float t = iTime * GRAIN_SPEED;
    float seed = dot(uv, vec2(12.9898, 78.233));
    float grainNoise = fract(sin(seed) * 43758.5453 + t);
    grainNoise = gaussian(grainNoise, GRAIN_MEAN, GRAIN_VARIANCE * GRAIN_VARIANCE);
    vec3 grain = vec3(grainNoise) * (1.0 - color);
    return overlay(color, grain, GRAIN_INTENSITY);
  }
  void main() {
    vec2 fragCoord = vUv * iResolution.xy;
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    vec2 warpedUv = warp(uv);
    float simplexNoise = snoise(vec3(warpedUv * noiseScale, iTime * noiseSpeed)) * noiseIntensity;
    warpedUv += simplexNoise;
    float phase1 = iTime * 0.6;
    float phase2 = iTime * 0.4;
    float archFactor = 1.0 - length(warpedUv) * 0.5;
    float wave1 = sin(warpedUv.x * 3.0 + phase1) * 0.5 * archFactor;
    float wave2 = sin(warpedUv.x * 5.0 - phase2) * 0.3 * archFactor;
    float wave3 = sin(warpedUv.y * 4.0 + phase1 * 0.7) * 0.15;
    float parabolicArch = -(warpedUv.x * warpedUv.x) * 0.2;
    float breathing = sin(iTime * 0.5) * 0.1 + 0.9;
    float combinedWave = (wave1 + wave2 + wave3 + parabolicArch) * breathing * 0.3;
    float gradientPos = vUv.y + combinedWave * 0.3;
    float smoothGradientPos = smoothstep(0.0, 1.0, clamp(1.0 - gradientPos, 0.0, 1.0));
    gl_FragColor = vec4(applyGrain(multiColorGradient(smoothGradientPos), vUv), 1.0);
  }
`
function obShader(canvas) {
  const gl=canvas?.getContext('webgl',{antialias:false,alpha:false})
  if(!gl) return
  const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);return gl.getShaderParameter(shader,gl.COMPILE_STATUS)?shader:null}
  const vertex=compile(gl.VERTEX_SHADER,obShaderVertex), fragment=compile(gl.FRAGMENT_SHADER,obShaderFragment)
  if(!vertex || !fragment) return
  const program=gl.createProgram()
  gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program)
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)) return
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW)
  const position=gl.getAttribLocation(program,'position')
  gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0)
  const time=gl.getUniformLocation(program,'iTime'), resolution=gl.getUniformLocation(program,'iResolution')
  // 系统开启「减少动态效果」时只画一帧静止的渐变。
  const still=matchMedia('(prefers-reduced-motion: reduce)').matches, start=performance.now()
  const frame=now=>{
    if(!canvas.isConnected) return
    const ratio=Math.min(devicePixelRatio || 1,2), width=Math.round(canvas.clientWidth*ratio), height=Math.round(canvas.clientHeight*ratio)
    if(width && height) {
      if(canvas.width!==width || canvas.height!==height) {canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height)}
      gl.uniform1f(time,(now-start)/1000);gl.uniform3f(resolution,width,height,1)
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4)
      canvas.dataset.ready=''
    }
    if(!still || !canvas.width) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

// —— 等待时的刮刮卡：刮开银箔露出顾问微信二维码，领取 6 个月免费额度 ——
// 移植自 Scratch Card（Louis Studios，原组件基于 React）。保留了拉丝银箔、带毛边的刮痕、跟随指针的硬币和刮落的碎屑；
// 版式改成横向小卡片以放进弹窗，银箔下面从兑换码换成二维码，去掉了自动演示和复制按钮。
// 刮开面积达到阈值后整块银箔淡出，保证二维码完整可扫；键盘在银箔上按回车或空格也能直接揭开。
// 刮开之后卡片下方的提示文字收起，只留卡面和二维码。
function obScratch(root) {
  const card=root?.querySelector('.ob-scratch-card'), panel=root?.querySelector('.ob-scratch-panel')
  const foil=root?.querySelector('.ob-scratch-foil'), flakeCanvas=root?.querySelector('.ob-scratch-flakes')
  const coin=root?.querySelector('.ob-scratch-coin'), hint=root?.querySelector('.ob-scratch-hint')
  const ctx=foil?.getContext('2d'), flakeCtx=flakeCanvas?.getContext('2d')
  if(!ctx || !flakeCtx) return
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches
  const BRUSH_RX=13, BRUSH_RY=8, STAMP_STEP=4, CELL=3, THRESHOLD=.415, COIN_D=36, COIN_LIFT=13, MAX_FLAKES=260
  const FOIL=[200,201,211], WHITE=[255,255,255], BLACK=[0,0,0]
  const mix=(a,b,t)=>a.map((value,i)=>value+(b[i]-value)*t)
  const rgba=(c,a=1)=>`rgba(${c.map(Math.round).join(',')},${a})`
  const clamp=(v,a,b)=>v<a?a:v>b?b:v
  const hash2=(x,y)=>{let h=(x*374761393+y*668265263)|0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296}
  const vnoise=(x,y)=>{
    const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi, u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf)
    const a=hash2(xi,yi), b=hash2(xi+1,yi), c=hash2(xi,yi+1), d=hash2(xi+1,yi+1)
    return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v
  }
  let seed=7
  const rng=()=>{seed=(seed+0x6d2b79f5)>>>0;let t=seed;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}
  const S={w:0,h:0,dpr:1,texture:null,brushes:[],mask:document.createElement('canvas'),stamps:[],grid:new Uint8Array(0),gx:0,gy:0,covered:0,
    flakes:[],revealed:false,started:false,foilAlpha:1,fadeStart:0,dirty:true,flakesDirty:false,raf:0,last:0,
    ptr:{x:0,y:0,down:false,inside:false,has:false,vx:0,last:0,kind:'mouse'},coin:{rot:0,press:0,show:0}}

  // 拉丝银箔：横向两道高光，细密的水平拉丝纹，中间印着提示文字。
  const paintFoil=(w,h,dpr,label)=>{
    const W=Math.max(1,Math.round(w*dpr)), H=Math.max(1,Math.round(h*dpr)), canvas=document.createElement('canvas')
    canvas.width=W;canvas.height=H
    const c=canvas.getContext('2d')
    const stops=[[0,mix(FOIL,BLACK,.03)],[.3,mix(FOIL,WHITE,.44)],[.52,mix(FOIL,BLACK,.025)],[.76,mix(FOIL,WHITE,.32)],[1,mix(FOIL,BLACK,.1)]], ramp=[]
    for(let x=0;x<W;x++) {
      const u=x/Math.max(1,W-1);let i=0
      while(i<stops.length-2 && u>stops[i+1][0]) i++
      const t=clamp((u-stops[i][0])/(stops[i+1][0]-stops[i][0]),0,1)
      ramp.push(mix(stops[i][1],stops[i+1][1],.5-.5*Math.cos(Math.PI*t)))
    }
    const image=c.createImageData(W,H), data=image.data, k=1/dpr
    for(let y=0;y<H;y++) {
      const yy=y*k
      for(let x=0;x<W;x++) {
        const xx=x*k, wy=yy+.9*Math.sin(xx*.16+yy*.3)+.6*Math.sin(xx*.047-yy*.21)
        const grain=1+(vnoise(xx*.05,wy*.85)-.5)*.026+(vnoise(xx*.03+40,wy*.28)-.5)*.04, color=ramp[x], o=(y*W+x)*4
        data[o]=clamp(color[0]*grain,0,255);data[o+1]=clamp(color[1]*grain,0,255);data[o+2]=clamp(color[2]*grain,0,255);data[o+3]=255
      }
    }
    c.putImageData(image,0,0)
    const edge=Math.max(1,Math.round(dpr*.75))
    c.fillStyle=rgba(mix(FOIL,WHITE,.5),.55);c.fillRect(0,0,W,edge)
    c.fillStyle=rgba(mix(FOIL,BLACK,.2),.25);c.fillRect(0,H-edge,W,edge)
    c.scale(dpr,dpr)
    c.fillStyle=rgba(mix(FOIL,BLACK,.53));c.font='600 12px -apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans SC",sans-serif'
    c.textAlign='center';c.textBaseline='middle';c.fillText(label,w/2,h/2+.5,w-12)
    return canvas
  }
  // 刮痕笔刷：一个椭圆，边缘带粗粒和细砂，叠起来像真的刮过。
  const paintBrushes=dpr=>{
    const rx=BRUSH_RX*dpr, ry=BRUSH_RY*dpr, W=Math.ceil(rx*2)+4, H=Math.ceil(ry*2)+4, g=1/dpr, list=[]
    for(let v=0;v<4;v++) {
      const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H
      const c=canvas.getContext('2d'), image=c.createImageData(W,H), data=image.data
      for(let y=0;y<H;y++) for(let x=0;x<W;x++) {
        const nx=(x-W/2)/rx, ny=(y-H/2)/ry, r=Math.sqrt(nx*nx+ny*ny)
        const lump=vnoise(x*g*.18+v*31,y*g*.3+v*17)-.5, grain=hash2(Math.floor(x*g*1.3)+v*997,Math.floor(y*g*1.3))-.5
        const alpha=clamp((1-(r+lump*.26+grain*.16))/.24,0,1)*(.9+.1*(vnoise(x*g*.5+v*7,y*g*.9)>.35?1:.4)), o=(y*W+x)*4
        data[o]=data[o+1]=data[o+2]=255;data[o+3]=Math.round(alpha*255)
      }
      c.putImageData(image,0,0);list.push(canvas)
    }
    return list
  }
  const drawStamp=(stamp,target)=>{
    const brush=S.brushes[stamp.v%Math.max(1,S.brushes.length)]; if(!brush) return
    target.setTransform(1,0,0,1,stamp.x*S.dpr,stamp.y*S.dpr);target.rotate(stamp.r)
    target.drawImage(brush,-brush.width/2,-brush.height/2);target.setTransform(1,0,0,1,0,0)
  }
  const markGrid=(x,y)=>{
    const rx=BRUSH_RX*.86, ry=BRUSH_RY*.86
    const x0=Math.max(0,Math.floor((x-rx)/CELL)), x1=Math.min(S.gx-1,Math.floor((x+rx)/CELL)), y0=Math.max(0,Math.floor((y-ry)/CELL)), y1=Math.min(S.gy-1,Math.floor((y+ry)/CELL))
    for(let gy=y0;gy<=y1;gy++) for(let gx=x0;gx<=x1;gx++) {
      const dx=((gx+.5)*CELL-x)/rx, dy=((gy+.5)*CELL-y)/ry, i=gy*S.gx+gx
      if(dx*dx+dy*dy<=1 && !S.grid[i]) {S.grid[i]=1;S.covered++}
    }
  }
  // 银箔的贴图、蒙版和笔刷跟随面板尺寸重建；刮痕按位置保存并重放，所以尺寸变化不会丢。
  const build=()=>{
    const w=panel.clientWidth, h=panel.clientHeight, dpr=Math.min(3,devicePixelRatio || 1)
    if(!w || !h) return
    if(w!==S.w || h!==S.h || dpr!==S.dpr || !S.texture) {
      S.w=w;S.h=h;S.dpr=dpr
      foil.width=Math.round(w*dpr);foil.height=Math.round(h*dpr)
      S.texture=paintFoil(w,h,dpr,'刮开领取');S.brushes=paintBrushes(dpr)
      S.mask.width=foil.width;S.mask.height=foil.height
      S.gx=Math.ceil(w/CELL);S.gy=Math.ceil(h/CELL);S.grid=new Uint8Array(S.gx*S.gy);S.covered=0
      const maskCtx=S.mask.getContext('2d')
      for(const stamp of S.stamps) {drawStamp(stamp,maskCtx);markGrid(stamp.x,stamp.y)}
    }
    flakeCanvas.width=Math.round(root.clientWidth*dpr);flakeCanvas.height=Math.round(root.clientHeight*dpr)
    S.dirty=true;S.flakesDirty=true;kick()
  }
  const panelOrigin=()=>{const a=root.getBoundingClientRect(), b=panel.getBoundingClientRect();return [b.left-a.left,b.top-a.top]}
  const spawnFlake=(x,y,dx)=>{
    if(reduced) return
    const [ox,oy]=panelOrigin(), fast=rng()<.5, side=rng()<.5+.2*Math.sign(dx || 1)?1:-1
    const angle=(rng()-.5)*(fast?.5:2.2), speed=fast?260+rng()*420:30+rng()*150, tone=rng()
    const color=tone<.45?mix(FOIL,BLACK,.32+rng()*.16):tone<.8?mix(FOIL,BLACK,.12+rng()*.12):mix(FOIL,WHITE,.25)
    S.flakes.push({x:ox+x+(rng()-.5)*BRUSH_RX*2,y:oy+y+(rng()-.5)*BRUSH_RY*2.2,vx:Math.cos(angle)*speed*side,vy:Math.sin(angle)*speed-20*rng(),r:rng()*Math.PI,vr:(rng()-.5)*22,len:2+rng()*2.4,w:1.1+rng()*.8,col:rgba(color),age:0,life:.7+rng()*.7})
    if(S.flakes.length>MAX_FLAKES) S.flakes.splice(0,S.flakes.length-MAX_FLAKES)
    S.flakesDirty=true
  }
  const reveal=()=>{
    if(S.revealed) return
    S.revealed=true;S.started=true;S.fadeStart=performance.now()
    root.dataset.state='revealed'
    hint.textContent=''
    panel.removeAttribute('role');panel.removeAttribute('tabindex');panel.setAttribute('aria-label','顾问微信二维码')
    kick()
  }
  // 从上一个接触点刮到当前点（坐标相对银箔面板）。快速划过留下一串不均匀的刮痕，慢慢拖是一条均匀的带子。
  const scrape=(x0,y0,x1,y1,speed)=>{
    const maskCtx=S.mask.getContext('2d'), dx=x1-x0, dy=y1-y0, dist=Math.hypot(dx,dy)
    const count=Math.max(1,Math.ceil(dist/clamp(speed/115,STAMP_STEP,20))), step=dist/count
    let any=false
    for(let i=1;i<=count;i++) {
      const t=i/count, x=x0+dx*t+(rng()-.5)*2, y=y0+dy*t+(rng()-.5)*5
      if(x<-BRUSH_RX || x>S.w+BRUSH_RX || y<-BRUSH_RY || y>S.h+BRUSH_RY) continue
      const stamp={x,y,v:Math.floor(rng()*4),r:(rng()-.5)*.22}
      S.stamps.push(stamp);drawStamp(stamp,maskCtx);markGrid(x,y);any=true
      let chips=step*.1
      while(chips>0) {if(rng()<Math.min(1,chips)) spawnFlake(x,y,dx);chips-=1}
    }
    if(!any) return
    S.dirty=true
    if(!S.started) {S.started=true;root.dataset.state='started'}
    if(!S.revealed && S.covered/(S.gx*S.gy)>=THRESHOLD) reveal()
  }
  const toRoot=event=>{const r=root.getBoundingClientRect();return [event.clientX-r.left,event.clientY-r.top]}
  const inCard=(x,y)=>{const a=root.getBoundingClientRect(), b=card.getBoundingClientRect();return x>=b.left-a.left && x<=b.right-a.left && y>=b.top-a.top && y<=b.bottom-a.top}
  const move=(x,y,down,time)=>{
    const p=S.ptr
    if(p.has) {
      const dt=Math.max(1,time-p.last)/1000
      p.vx=p.vx*.35+((x-p.x)/dt)*.65
      if(down && p.down && !S.revealed) {const [ox,oy]=panelOrigin();scrape(p.x-ox,p.y-oy,x-ox,y-oy,Math.hypot(x-p.x,y-p.y)/dt)}
    }
    p.x=x;p.y=y;p.last=time;p.has=true;p.down=down;p.inside=inCard(x,y)
    kick()
  }
  card.addEventListener('pointerdown',event=>{
    if(event.button!==0 && event.pointerType==='mouse') return
    build()
    S.ptr.kind=event.pointerType;S.ptr.has=false
    try {card.setPointerCapture(event.pointerId)} catch {}
    if(event.pointerType==='mouse') event.preventDefault()
    move(...toRoot(event),true,performance.now())
  })
  card.addEventListener('pointermove',event=>{S.ptr.kind=event.pointerType;move(...toRoot(event),S.ptr.down && (event.buttons&1)===1,performance.now())})
  const release=event=>move(...toRoot(event),false,performance.now())
  card.addEventListener('pointerup',release);card.addEventListener('pointercancel',release)
  card.addEventListener('pointerleave',()=>{if(!S.ptr.down) {S.ptr.inside=false;kick()}})
  panel.addEventListener('keydown',event=>{if(!S.revealed && (event.key==='Enter' || event.key===' ')) {event.preventDefault();build();reveal()}})

  const step=()=>{
    S.raf=0
    if(!root.isConnected) return
    const now=performance.now(), dt=Math.min(.1,Math.max(0,(now-S.last)/1000)), p=S.ptr, c=S.coin
    S.last=now
    let busy=false
    // 银箔淡出
    if(S.revealed && S.foilAlpha>0) {S.foilAlpha=1-clamp((now-S.fadeStart)/(reduced?200:450),0,1);S.dirty=true;busy=true}
    // 硬币：跟着指针走，按横向速度倾斜，按下时略微压低
    const show=(p.inside || (p.down && p.kind!=='mouse')) && !S.revealed?1:0
    c.show+=(show-c.show)*(1-Math.exp(-dt*22))
    c.rot+=((reduced?0:clamp(p.vx*.0062,-22,22))-c.rot)*(1-Math.exp(-dt*16));p.vx*=Math.exp(-dt*9)
    c.press+=((p.down?1:0)-c.press)*(1-Math.exp(-dt*20))
    if(Math.abs(c.show-show)>.01 || Math.abs(c.rot)>.05 || Math.abs(c.press-(p.down?1:0))>.01) busy=true
    // 只有硬币真的在显示时才隐藏系统指针；刮开之后硬币退场，指针恢复正常，不会出现「鼠标不见了」。
    root.toggleAttribute('data-coin',show===1)
    coin.style.opacity=c.show.toFixed(3);coin.style.visibility=c.show>.01?'visible':'hidden'
    coin.style.transform=`translate3d(${(p.x-COIN_D/2).toFixed(2)}px,${(p.y-COIN_LIFT-COIN_D/2).toFixed(2)}px,0) rotate(${c.rot.toFixed(2)}deg) scale(${(1-.07*c.press).toFixed(4)})`
    // 碎屑：在卡面上滑一段，慢下来后淡出
    if(S.flakes.length) {
      const drag=Math.exp(-dt*3.4)
      for(const f of S.flakes) {f.vx*=drag;f.vy=f.vy*drag+40*dt;f.x+=f.vx*dt;f.y+=f.vy*dt;f.r+=f.vr*dt;f.vr*=drag;f.age+=dt}
      S.flakes=S.flakes.filter(f=>f.age<f.life)
      S.flakesDirty=true;busy=true
    }
    if(S.flakesDirty) {
      S.flakesDirty=false
      flakeCtx.setTransform(1,0,0,1,0,0);flakeCtx.clearRect(0,0,flakeCanvas.width,flakeCanvas.height)
      for(const f of S.flakes) {
        const cos=Math.cos(f.r)*S.dpr, sin=Math.sin(f.r)*S.dpr
        flakeCtx.setTransform(cos,sin,-sin,cos,f.x*S.dpr,f.y*S.dpr)
        flakeCtx.globalAlpha=.92*clamp((f.life-f.age)/.35,0,1);flakeCtx.fillStyle=f.col
        flakeCtx.fillRect(-f.len/2,-f.w/2,f.len,f.w)
      }
      flakeCtx.globalAlpha=1;flakeCtx.setTransform(1,0,0,1,0,0)
    }
    // 银箔 = 贴图减去刮痕蒙版
    if(S.dirty && S.texture) {
      S.dirty=false
      ctx.globalCompositeOperation='copy';ctx.globalAlpha=S.foilAlpha;ctx.drawImage(S.texture,0,0,foil.width,foil.height)
      if(S.stamps.length) {ctx.globalCompositeOperation='destination-out';ctx.globalAlpha=1;ctx.drawImage(S.mask,0,0)}
      ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1
    }
    if(busy || S.dirty || S.flakesDirty) S.raf=requestAnimationFrame(step)
  }
  function kick() {if(!S.raf) {S.last=performance.now();S.raf=requestAnimationFrame(step)}}
  new ResizeObserver(build).observe(panel)
  build()
}
const obScratchCoin = `<svg viewBox="0 0 52 52" width="100%" height="100%"><defs><radialGradient id="ob-coin-face" cx="0.36" cy="0.3" r="0.8"><stop offset="0" stop-color="#f1e0a4"/><stop offset="0.55" stop-color="#e9cf6c"/><stop offset="1" stop-color="#d9c064"/></radialGradient><linearGradient id="ob-coin-rim" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#cdb65f"/><stop offset="1" stop-color="#a3914c"/></linearGradient></defs><circle cx="26" cy="26" r="25.5" fill="#a3914c"/><circle cx="26" cy="26" r="24" fill="url(#ob-coin-rim)"/><circle cx="26" cy="26" r="22.8" fill="url(#ob-coin-face)"/><circle cx="26" cy="26" r="22.8" fill="none" stroke="#a3914c" stroke-opacity="0.5" stroke-width="0.8"/><path d="M22.6 22.4 L27.4 18.8 L27.4 33.4" fill="none" stroke="#f1e0a4" stroke-opacity="0.7" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" transform="translate(0.6 0.7)"/><path d="M22.6 22.4 L27.4 18.8 L27.4 33.4" fill="none" stroke="#958445" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`

// —— 首次设置弹窗 ——
// 这里只输出稳定的骨架，各区域内容由 obPaint 按状态填入，读取过程中不重建弹窗（保住输入焦点和过渡动画）。
// 中间的示意图是一个不可操作的迷你对话窗口，浮在流动的渐变背景上，用读到的图标、名称、品牌色和常用问题逐步填上。
function obSetupCard() {
  return `<div id="ob-setup-head" aria-live="polite"></div>
    <form id="ob-setup-form" class="ob-url-bar" novalidate>${icon('globe')}<input id="ob-setup-url" name="website" aria-label="企业官网" placeholder="https://www.your-company.com" autocomplete="url" spellcheck="false" value="${esc(ob.website)}"><button class="btn ghost small" type="button" data-ob="cancel-read">取消</button><button class="btn primary" type="submit" id="ob-setup-submit">开始读取 ${icon('arrow')}</button></form>
    <span id="ob-setup-note" role="alert"></span>
    <div class="ob-scene" aria-hidden="true"><canvas class="ob-scene-shader"></canvas><div class="ob-scene-widget"><div class="ob-scene-head"><span class="ob-scene-avatar" id="ob-scene-avatar"></span><span class="ob-scene-name" id="ob-scene-name"></span></div><div class="ob-scene-body"><i></i><i></i><div class="ob-scene-quick" id="ob-scene-quick"></div></div><span class="ob-scene-scan"></span></div></div>
    <div class="ob-setup-status"><div class="ob-progress-track"><i id="ob-setup-bar"></i></div><span id="ob-setup-step" role="status"></span></div>
    <div class="ob-findings-label">读取后你会得到</div>
    <ul class="ob-findings"><li id="ob-find-who"></li><li id="ob-find-pages"></li><li id="ob-find-look"></li></ul>
    <div class="ob-scratch" data-state="idle"><div class="ob-scratch-card" role="group" aria-label="6 个月免费额度"><div class="ob-scratch-copy"><span>添加顾问微信</span><strong>6 个月</strong><em>免费额度</em></div><div class="ob-scratch-panel" role="button" tabindex="0" aria-label="刮开查看顾问微信二维码"><div class="ob-qr">${obQr()}<span>${icon('spark')}</span></div><canvas class="ob-scratch-foil" aria-hidden="true"></canvas></div></div><canvas class="ob-scratch-flakes" aria-hidden="true"></canvas><div class="ob-scratch-coin" aria-hidden="true">${obScratchCoin}</div><p class="ob-scratch-hint" aria-live="polite">刮开银色区域，领取 6 个月免费额度</p></div>
    <div class="ob-setup-actions"><button class="btn primary" type="button" data-ob="confirm">确认并开始使用 ${icon('arrow')}</button><button class="ob-setup-skip" type="button" data-ob="cancel-read">换一个网址</button></div>
    <button class="ob-setup-skip" type="button" data-ob="skip">稍后再说</button>`
}
// 弹窗挂在 body 上，工作台重绘不会影响它；是否显示只取决于当前阶段。
function obSetupSync() {
  let card=document.querySelector(obCard)
  if(!obInSetup() || ob.shared) {if(card) obSetupClose(card);return}
  if(card) return
  card=document.createElement('dialog')
  card.id='ob-setup-card';card.className='ob-setup';card.dataset.step=ob.phase
  card.setAttribute('aria-label','连接企业官网');card.setAttribute('closedby','none')
  card.addEventListener('cancel',event=>event.preventDefault())
  card.innerHTML=obSetupCard()
  document.body.appendChild(card);card.showModal()
  obShader(card.querySelector('.ob-scene-shader'))
  obScratch(card.querySelector('.ob-scratch'))
}
// 收起弹窗：淡出后再移除，返回的 Promise 在焦点可以回到工作台时完成。
function obSetupClose(card) {
  card.dataset.closing=''
  const done=()=>{card.close();card.remove()}
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) {done();return Promise.resolve()}
  const timing={duration:180,easing:'cubic-bezier(.2,0,0,1)',fill:'forwards'}
  card.animate([{opacity:1},{opacity:0}],{...timing,pseudoElement:'::backdrop'})
  const fade=card.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(8px) scale(.98)'}],timing).finished
  // 页面在后台时动画不会推进，超时后直接收起，避免弹窗滞留。
  return Promise.race([fade,new Promise(resolve=>setTimeout(resolve,400))]).then(done,done)
}
function obPut(selector, key, html) {
  const node=document.querySelector(selector)
  if(node && node.dataset.k!==key) {node.dataset.k=key;node.innerHTML=html}
  return node
}
// 完成态的对号：一条线先是圆角方框，随后沿路径流动、收成一个对号（路径和动画取自 motion 的 CheckBox 组件）。
// 原组件靠点击切换；这里只在这一行完成时播放一次「方框 → 对号」，不可点击。
function obCheckMark() {
  return `<i class="ob-mark ob-check" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M 2.45 24.95 V 33.95 C 2.45 35.9382 4.0618 37.55 6.05 37.55 H 33.95 C 35.9382 37.55 37.55 35.9382 37.55 33.95 V 6.05 C 37.55 4.0618 35.9382 2.45 33.95 2.45 H 6.05 C 4.0618 2.45 2.45 4.0618 2.45 6.05 V 22.0617 C 2.45 23.0443 2.8516 23.9841 3.5616 24.6633 L 10.0451 30.8649 C 11.5404 32.2952 13.9308 32.1735 15.2731 30.5988 L 36.2 6.05"/></svg></i>`
}
// 文案的分工：标题说现在这一步；动画下面的一句话说正在做什么（读完后不再重复，生效与否由按钮「确认并开始使用」表达）；
// 三行在读取前说「你会得到什么」，读取时逐行换成读到的真实结果，只展示、不能改。
function obSetupCopy() {
  if(ob.phase==='reading') return '正在读取你的官网'
  if(ob.phase==='done') return '读取完成'
  return '输入官网，生成你的 AI 接待'
}
function obSetupStep() {
  if(ob.phase!=='reading') return ''
  return ob.tick<1?'正在识别公司名称和图标…':ob.tick<5?'正在学习产品与服务页面…':ob.tick<6?'正在提取品牌色…':'正在生成常用问题…'
}
function obFinding(kind) {
  const reading=ob.phase==='reading', tick=ob.phase==='done'?7:reading?ob.tick:-2
  const stateOf=(from,to)=>tick>=to?'done':reading&&tick>=from?'active':'pending'
  const row=(status,glyph,body,extra='')=>({status,html:`${status==='done'?obCheckMark():`<i class="ob-mark">${icon(glyph)}</i>`}<div class="ob-find-body">${body}</div>${extra}`})
  if(kind==='who') {
    const status=stateOf(-1,1)
    if(status!=='done') return {key:status,...row(status,'building','<strong>带公司名称和图标的接待窗口</strong>')}
    return {key:`done${ob.icon}`,...row(status,'building',`<div class="ob-who">${ob.icon?`<img class="ob-site-icon" src="${esc(ob.icon)}" alt="" referrerpolicy="no-referrer">`:''}<strong>${esc(ob.name)}</strong></div><p>${esc(ob.summary)}</p>`)}
  }
  if(kind==='pages') {
    const status=stateOf(1,5), read=Math.min(ob.pages.length,Math.max(0,tick))
    if(status==='pending') return {key:status,...row(status,'book','<strong>学过官网内容的知识库</strong>')}
    if(status==='active') return {key:`active${read}`,...row(status,'book',`<strong>学过官网内容的知识库</strong><p>第 ${read} 页 · ${esc(ob.pages[read-1]?.name || '')}</p>`)}
    return {key:'done',...row(status,'book',`<strong>已学习 ${ob.pages.length} 个页面</strong>`)}
  }
  const status=stateOf(5,6), swatch=`<span class="ob-color-swatch" style="--ob-site-color:${esc(ob.color)}"></span>`
  if(status!=='done') return {key:status,...row(status,'palette','<strong>与官网一致的品牌色</strong>')}
  return ob.colorFailed
    ? {key:'done-fallback',...row(status,'palette','<strong>先使用默认配色</strong><p>没识别出品牌色，确认后可在「外观」里更换。</p>',swatch)}
    : {key:'done',...row(status,'palette','<strong>已提取品牌色</strong>',swatch)}
}
// 示意图：迷你对话窗口，依次填上图标与名称、品牌色、常用问题。纯展示，不是工作台里那个真实窗口。
function obPaintScene(main) {
  const known=ob.phase==='done' || (ob.phase==='reading' && ob.tick>=1)
  const colored=ob.phase==='done' || (ob.phase==='reading' && ob.tick>=6)
  const scene=main.querySelector('.ob-scene')
  scene.dataset.stage=ob.phase==='done'?3:colored?2:known?1:0
  scene.style.setProperty('--ob-scene-color',colored?ob.color:'')
  // 标题栏文字随品牌色深浅取黑或白（和真实对话窗口同一套算法），浅色品牌色上也能看清。
  scene.style.setProperty('--ob-scene-on',colored?readableOn(ob.color):'')
  // 白底上的品牌色文字（头像首字、常用问题）：品牌色很浅时压深一些，否则看不清。
  scene.style.setProperty('--ob-scene-text',colored?(readableOn(ob.color)==='#FFFFFF'?ob.color:`color-mix(in srgb, ${ob.color} 45%, #102F2A)`):'')
  obPut('#ob-scene-avatar',`${known}|${ob.icon}`,known?(ob.icon?`<img src="${esc(ob.icon)}" alt="" referrerpolicy="no-referrer">`:esc(Array.from(ob.name)[0] || '')):'')
  obPut('#ob-scene-name',`${known}|${ob.name}`,known?`${esc(ob.name)} · AI 接待`:'')
  obPut('#ob-scene-quick',String(ob.phase==='done'),ob.phase==='done'?obQuick().map(item=>`<span>${esc(item.text)}</span>`).join(''):'')
}
function obPaint() {
  const main=document.querySelector(obCard); if(!main) return
  main.dataset.step=ob.phase
  // 刮刮卡等第一行结果出来之后再滑入，让用户先看到「正在读自己的官网」。
  main.toggleAttribute('data-wait',ob.phase==='reading' && ob.tick>=1)
  obPut('#ob-setup-head',ob.phase,`<h1>${obSetupCopy()}</h1>`)
  const locked=ob.phase!=='website', input=main.querySelector('#ob-setup-url')
  input.readOnly=locked
  if(locked) input.value=ob.website
  main.querySelector('#ob-setup-bar').style.width=`${ob.phase==='reading'?ob.progress:ob.phase==='done'?100:0}%`
  main.querySelector('#ob-setup-note').textContent=ob.error
  main.querySelector('#ob-setup-step').textContent=obSetupStep()
  for(const kind of ['who','pages','look']) {
    const finding=obFinding(kind), row=obPut(`#ob-find-${kind}`,finding.key,finding.html)
    row.className=finding.status
  }
  obPaintScene(main)
}
// 落地页进入工作台用浏览器的视图过渡做一次淡入淡出。
function obSwap(update) {
  if(!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {update();return Promise.resolve()}
  // 页面在后台时浏览器会跳过过渡（更新照常执行），这里把跳过当作正常情况处理。
  const transition=document.startViewTransition(update)
  transition.ready.catch(()=>{});transition.finished.catch(()=>{})
  return transition.updateCallbackDone.catch(()=>{})
}

renderRoute = function () { return ob.shared ? obSharedPage() : ob.phase === 'landing' ? obLanding() : obOriginalRoute() }
renderOnboarding = () => ''
renderApp = function () {
  obOriginalRender()
  document.body.classList.toggle('ob-expanded', ob.expanded)
  obSetupSync()
  obPaint()
  obBindFrame()
}

// 标题、切换、官网浏览器与对话窗口全部来自上游，只接入分享、放大和预览异常。
renderOverviewPreview = function () {
  let html = obOriginalPreview()
  const actions = `<div class="ob-debug-actions"><button class="cfg-btn sm ghost" data-ob="share">${icon('link','xs')}<span>分享</span></button><button class="cfg-icon-btn" data-ob="expand" title="${ob.expanded?'退出放大':'放大预览'}">${icon(ob.expanded?'minimize':'maximize','xs')}</button></div>`
  html = html.replace(/<\/div><\/div>\s*<div class="overview-preview-body">/, `</div>${actions}</div><div class="overview-preview-body" id="ob-preview-target">`)
  html = html.replace('<iframe title="用户官网预览"', '<iframe id="ob-site-frame" title="用户官网预览"')
  if (ob.skipped || obInSetup()) {
    // 确认之前官网不会出现在这里：弹窗打开期间只是占位；跳过设置的用户在这里有重新连接的入口。
    html = html.replace(/(<div class="website-preview-url">)[^<]*(<\/div>)/,'$1尚未连接官网$2')
    html = html.replace(/<iframe id="ob-site-frame"[^>]*><\/iframe>/, `<div class="ob-unavailable">${icon('globe')}<h3>还没有连接企业官网</h3><p>连接后，助手会学习官网内容，并在这里展示访客看到的效果。</p>${ob.skipped?'<div><button class="btn primary small" data-ob="connect">连接官网</button></div>':''}</div>`)
  } else if (ob.preview === 'blocked') {
    const url = previewWebsiteUrl(state.onboarding.website)
    const fallback = `<div class="ob-unavailable">${icon('globe')}<h3>官网暂时无法在这里展示</h3><p>该网站可能限制了嵌入预览，你仍然可以正常试问助手。</p><div><button class="btn primary small" data-ob="try">进入对话窗口</button><a class="btn small" href="${esc(url)}" target="_blank" rel="noopener noreferrer">打开官网 ${icon('external','xs')}</a></div></div>`
    html = html.replace(/<iframe id="ob-site-frame"[^>]*><\/iframe>/, fallback)
  } else {
    html=html.replace('<div class="website-preview-frame">', '<div class="website-preview-frame"><div class="ob-site-hint" hidden></div>')
  }
  return html
}

function obBindFrame() {
  const frame = document.querySelector('#ob-site-frame')
  if (!frame || frame.dataset.bound) return
  frame.dataset.bound='true'
  const hint = frame.parentElement.querySelector('.ob-site-hint')
  const timer = setTimeout(()=>{
    if(!frame.isConnected || !hint) return
    hint.hidden=false
    hint.innerHTML=`官网加载较慢？<button data-ob="try">直接试问助手</button>`
  },8000)
  frame.addEventListener('load',()=>{
    clearTimeout(timer)
    if(hint) {
      hint.hidden=false
      hint.innerHTML=`<button data-ob="blocked">官网无法预览？</button>`
    }
  },{once:true})
}

function obValidate(value) {
  const text = value.trim()
  if (!text || /\s/.test(text)) return null
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) return null
    return url.href
  } catch { return null }
}

function obDialog(kind) {
  obCloseDialog()
  ob.dialog=kind
  const node=document.createElement('dialog')
  node.id='ob-dialog';node.className=`ob-dialog ob-dialog-${kind}`
  const close=`<button class="btn icon-btn ghost" data-ob="close-dialog" title="关闭">${icon('close')}</button>`
  if(kind==='login') node.innerHTML=`<header class="modal-head"><div class="ob-dialog-brand">${obBrand()}</div><h2>登录吸管</h2><p>微信扫码登录，未注册将自动创建账号</p></header><div class="modal-body"><div class="ob-qr">${obQr()}<span>${icon('spark')}</span></div><div class="ob-qr-caption">使用微信扫一扫</div>${ob.website?`<div class="ob-carried-url">${icon('globe')}<span>${esc(ob.website)}</span>${icon('check')}</div><p class="ob-dialog-note">登录后自动读取，无需再次填写官网</p>`:'<p class="ob-dialog-note">登录后，连接官网即可开始体验</p>'}</div><footer class="modal-foot"><button class="btn ghost small" data-ob="authenticated">体验登录 ${icon('arrow')}</button></footer><button class="ob-dialog-close" data-ob="close-dialog" title="关闭">${icon('close')}</button>`
  else node.innerHTML=`<header class="modal-head"><div><h2>分享助手</h2><p>邀请同事试问当前配置，一起确认回答效果。</p></div>${close}</header><div class="modal-body"><div class="ob-share-permission">${icon('check')} 可以试问<span>仅体验，不可修改配置</span></div><label for="ob-share-url">体验链接</label><div class="ob-share-input"><input id="ob-share-url" readonly value="${esc(obShareUrl())}"><button class="btn primary" data-ob="copy-share">复制链接</button></div><a class="ob-share-open" href="${esc(obShareUrl())}" target="_blank" rel="noopener">打开体验页 ${icon('external')}</a></div><footer class="modal-foot"><span class="ob-modal-note">分享的是当前配置快照，之后的修改不会同步。</span></footer>`
  document.body.appendChild(node);node.showModal()
  node.addEventListener('close',()=>{if(ob.dialog===kind)ob.dialog=null;node.remove()},{once:true})
}
function obCloseDialog() { const node = document.querySelector('#ob-dialog'); if (node) { node.close(); node.remove() } ob.dialog = null }
function obQr() {
  // 不承载认证的演示图案；模拟授权按钮明确标注，不能当作生产二维码。
  let rects = ''
  for (let y=0;y<29;y++) for(let x=0;x<29;x++) {
    const finder = [[0,0],[22,0],[0,22]].find(([a,b])=>x>=a&&x<a+7&&y>=b&&y<b+7)
    let fill = ((x*13+y*7+x*y)%11)<5
    if(finder) { const dx=x-finder[0],dy=y-finder[1]; fill=dx===0||dx===6||dy===0||dy===6||(dx>=2&&dx<=4&&dy>=2&&dy<=4) }
    if(fill) rects+=`<rect x="${x}" y="${y}" width="1" height="1"/>`
  }
  return `<svg viewBox="-2 -2 33 33">${rects}</svg>`
}

// 是否是带有示例解析结果的站点（帆软、吸管）。其他域名只有通用占位内容。
function obIsSample() {
  try {return /(^|\.)fanruan\.com$|xiguan|finesales/.test(new URL(ob.website).hostname)} catch {return false}
}
function obSiteData() {
  const host = new URL(ob.website).hostname
  const fanruan = /(^|\.)fanruan\.com$/.test(host)
  ob.name = fanruan ? '帆软软件' : /xiguan|finesales/.test(host) ? '吸管 AI 接待' : host
  ob.summary = fanruan ? '提供 FineReport 报表与 FineBI 商业智能产品，帮助企业完成报表制作、数据分析与经营决策。' : /xiguan|finesales/.test(host) ? '为企业官网提供 AI 售前接待，基于业务资料回答产品与方案问题，帮助访客了解产品并发起咨询。' : '已读取官网上的公开页面，助手会据此向访客介绍产品与服务。'
  ob.pages = [{name:'官网首页',path:'/'},{name:fanruan?'FineReport 产品介绍':/xiguan|finesales/.test(host)?'AI 接待产品介绍':'产品介绍',path:'/products/'},{name:fanruan?'FineBI 商业智能':'解决方案',path:'/solutions/'},{name:'行业应用',path:'/industries/'},{name:'常见问题',path:'/faq/'}]
  ob.color = ob.colorFailed ? '#13795B' : fanruan ? '#1677FF' : '#13795B'
  // 常用问题与回答：示例站点给出贴合业务的内容；未知域名没有真实解析结果，只给通用问题，回答走下面的通用规则。
  ob.questions = fanruan ? [
    {q:'FineReport 和 FineBI 有什么区别？',a:'FineReport 侧重报表制作，适合格式固定的报表、填报和数据大屏；FineBI 侧重自助分析，业务人员可以自己拖拽数据做探索。\n\n你更关心报表制作，还是数据分析？'},
    {q:'适合哪些行业和业务场景？',a:'官网的「行业应用」介绍了不同行业的用法，常见场景包括经营分析、销售管理和生产报表。\n\n方便说说你所在的行业吗？我可以帮你找对应的介绍。'},
    {q:'可以申请试用吗？',a:'可以，官网提供免费试用入口，提交申请后就能体验产品。\n\n需要我告诉你从哪里申请吗？'}
  ] : /xiguan|finesales/.test(host) ? [
    {q:'吸管能接到我们的官网上吗？',a:'可以。吸管以对话窗口的形式嵌入企业官网，访客在官网上就能直接提问。\n\n你们的官网是自建的，还是用了建站平台？'},
    {q:'回答是基于我们自己的资料吗？',a:'是的。吸管会学习你提供的业务资料，回答产品与方案问题时以这些资料为依据。\n\n你想先让它学习哪些内容？'},
    {q:'访客想进一步沟通时怎么办？',a:'访客可以直接在对话里发起咨询，帮助你把有意向的访客转成线索。\n\n需要我介绍一下咨询是怎么流转的吗？'}
  ] : obGenericQuestions.map(q=>({q,a:''}))
}

// 读取过程只推进弹窗里的状态，不保存任何东西，也不改动工作台。读完停在确认页。
async function obStartReading() {
  ob.phase='reading';ob.progress=0;ob.tick=-1;ob.error='';ob.icon=''
  obSiteData()
  if(document.querySelector('.ob-landing')) obSwap(renderApp); else {obSetupSync();obPaint()}
  const epoch=++ob.epoch
  obReadIcon(epoch)
  for (const [tick,percent] of obTicks.entries()) {
    await new Promise(resolve=>setTimeout(resolve, 900))
    if (epoch !== ob.epoch) return
    // 演示用的失败只触发一次，重新输入后可以走通。
    if (ob.readFailed && percent === 38) {ob.readFailed=false;obAbort('没能读取这个官网，没有保存任何内容。请检查网址后重新输入。');return}
    ob.tick=tick;ob.progress=percent
    if(percent<100) obPaint()
  }
  ob.phase='done';obPaint()
  document.querySelector('[data-ob="confirm"]')?.focus({preventScroll:true})
}
// 取消、换一个网址、读取失败是同一种处理：丢掉这次读到的所有内容，回到输入网址。区别只是失败时多一句说明。
function obAbort(message='') {
  ob.epoch++;ob.phase='website';ob.error=message;ob.icon='';ob.tick=-1;ob.progress=0
  obPaint()
  const input=document.querySelector('#ob-setup-url');input?.focus();input?.select()
}
// 官网图标：直接取站点根目录的 favicon，读到就显示在弹窗里，确认后用作对话窗口头像；读不到则用名称首字。
// 图标可能比确认还晚到，那种情况下补写进已生效的配置。
function obReadIcon(epoch) {
  const probe=new Image()
  probe.referrerPolicy='no-referrer'
  probe.onload=()=>{
    if(epoch!==ob.epoch || probe.naturalWidth<2) return
    ob.icon=probe.src
    if(ob.phase==='ready') {
      cfg.draft.appearance.avatarImage=ob.icon
      cfg.saved=JSON.stringify(cfg.draft);cfgWrite(cfgStorageKeys.saved,cfg.draft)
      obSaved={...obSaved,icon:ob.icon};cfgWrite(obKey,obSaved)
      refreshWidget()
    }
    obPaint()
  }
  probe.src=`${new URL('/favicon.ico',ob.website).href}#site-icon`
}
// 用户确认：这一刻才把读到的内容写成默认配置并保存，然后收起弹窗。
// 工作台随之打开这个官网，官网上的对话窗口直接展开，带着常用问题，可以马上试问。
function obConfirm() {
  if(ob.phase!=='done') return
  ob.phase='ready';ob.skipped=false
  state.onboarding.website=ob.website;state.onboarding.color=ob.color
  enterAgentOverview();state.websiteChatOpen=true
  obApplyDefaults()
  obSaved={ready:true,website:ob.website,name:ob.name,icon:ob.icon,summary:ob.summary,pages:ob.pages,questions:ob.questions,sources:cfg.sources,color:ob.color}
  cfgWrite(obKey,obSaved);localStorage.setItem('xiguan-onboarding','done')
  const card=document.querySelector(obCard), closed=card?obSetupClose(card):Promise.resolve()
  renderApp()
  closed.then(()=>document.querySelector('#cfg-widget-input')?.focus({preventScroll:true}))
}

function obApplyDefaults({persist=true}={}) {
  cfg.draft=defaultConfigDraft()
  cfg.draft.general=personaTemplates[1].general; cfg.draft.guardrails=personaTemplates[1].guardrails
  cfg.draft.appearance.primary=state.onboarding.color
  for(const entry of Object.values(cfg.draft.appearance.entries)) entry.accent=state.onboarding.color
  cfg.draft.appearance.name=`${ob.name} · AI 接待`
  cfg.draft.appearance.avatarImage=ob.icon
  cfg.draft.appearance.welcome=obWelcome()
  cfg.draft.appearance.quickButtons=obQuick()
  cfg.draft.appearance.paper='#FFFFFF'
  cfg.draft.appearance.history=false
  cfg.chat=[];cfg.chatHistory=0;cfg.chatStartedAt=nowClock()
  state.debugConfigTab='knowledge'
  cfg.sources=obSources()
  cfg.unanswered=[]
  cfg.saved=JSON.stringify(cfg.draft); if(persist)cfgWrite(cfgStorageKeys.saved,cfg.draft)
  refreshWidget()
  refreshCfgChrome()
}

function obSources() {
  return ob.pages.map((p,i)=>({id:2000+i,name:p.name,type:'site',url:new URL(p.path,ob.website).href,status:'ready',meta:'已就绪',created:nowStamp(),pages:[{path:p.path,title:p.name,checked:true}],entries:[{id:3000+i,title:p.name,body:ob.summary}],removed:[],tests:[]}))
}

// 沿用原调试记录和检索入口，避免返回与企业无关的内置吸管答案。
const obOriginalAnswer = kbAnswer
kbAnswer = function(question, options={}) {
  if(!ob.website) return obOriginalAnswer(question,options)
  if(kbQas().some(qa=>qa.status==='ready' && qa.questions.some(q=>kbSimilarity(q,question)>=.6))) return obOriginalAnswer(question,options)
  const prepared=ob.questions.find(item=>item.a && item.q===String(question).trim())
  if(prepared) return {text:prepared.a,route:'doc',refs:2}
  if(/报价|价格|收费|多少钱/.test(question)) return {text:'官网资料中没有足够的报价信息。具体方案与费用需要结合你的需求进一步确认，你可以通过官网的联系方式咨询。',route:'none',refs:0,insufficient:true}
  // 示例站点用读到的业务描述作答；其他域名没有真实解析结果，只给一句通用的开场。
  if(/功能|产品|介绍|做什么|场景|用途|服务/.test(question)) return {text:`${obIsSample()?ob.summary:'官网资料介绍了产品与服务的基本情况。'}\n\n你更关心哪一类业务场景？我可以帮你继续了解。`,route:'doc',refs:Math.min(ob.pages.length,2)}
  const available=cfg.sources.filter(x=>x.status==='ready').flatMap(x=>x.entries||[]).find(x=>kbSimilarity(`${x.title}${x.body}`,question)>=.16)
  return available ? {text:available.body,route:'doc',refs:1} : {text:'当前官网资料中还没有这个问题的可靠依据。你可以进一步说明需求，或通过官网咨询我们。',route:'none',refs:0,insufficient:true}
}

function obShareUrl() {
  const url = new URL(location.href); url.search=''; url.hash=''
  const snapshot={v:1,name:cfg.draft.appearance.name,color:cfg.draft.appearance.primary,welcome:cfg.draft.appearance.welcome,summary:ob.summary,website:ob.website}
  url.hash='experience='+btoa(unescape(encodeURIComponent(JSON.stringify(snapshot))))
  return url.href
}
function obSharedPage() {
  return `<main class="ob-shared"><header class="ob-site-header"><div class="ob-wordmark">${obBrand()}</div><span class="ob-share-permission">仅体验 · 不可修改配置</span></header><section><div class="ob-kicker">与你分享的 AI 接待</div><h1>${esc(cfg.draft.appearance.name)}</h1><p>像访客一样，聊聊产品与服务。</p><div class="cfg-widget-root" data-widget-root data-widget-reset-action="cfg-chat-reset">${renderCfgWidget({resetAction:'cfg-chat-reset'})}</div><small>当前为前端交互演示，回答由本地示例规则生成。</small></section></main>`
}

document.addEventListener('submit',event=>{
  const id=event.target.id
  if (!['ob-entry-form','ob-setup-form'].includes(id)) return
  event.preventDefault()
  if (id==='ob-setup-form' && ob.phase!=='website') return
  const input=event.target.querySelector('input'), valid=obValidate(input.value)
  if (!valid) {
    const text='请输入有效的企业官网地址，例如 www.fanruan.com'
    if(id==='ob-entry-form') event.target.querySelector('small').textContent=text
    else {ob.error=text;obPaint()}
    input.focus();return
  }
  ob.website=valid;ob.error=''
  if(id==='ob-entry-form') obDialog('login')
  else obStartReading()
})

document.addEventListener('input',event=>{
  if(event.target.id==='ob-setup-url' && ob.error) {ob.error='';obPaint()}
})

document.addEventListener('click',async event=>{
  const restart=event.target.closest('[data-action="restart-onboarding"]')
  if(restart) { event.stopImmediatePropagation(); ob.epoch++;ob.phase='landing';ob.website='';ob.skipped=false;state.onboardingStep=null;obCloseDialog();renderApp();return }
  const button=event.target.closest('[data-ob]'); if(!button)return
  const action=button.dataset.ob
  if(action==='login') obDialog('login')
  if(action==='close-dialog') obCloseDialog()
  if(action==='authenticated') {
    localStorage.setItem('xiguan-onboarding-account','registered')
    obCloseDialog();enterAgentOverview()
    if(ob.website) obStartReading()
    else {ob.phase='website';obSwap(renderApp)}
  }
  if(action==='cancel-read' && ['reading','done'].includes(ob.phase)) obAbort()
  if(action==='confirm') obConfirm()
  if(action==='skip') {
    ob.epoch++;ob.error='';ob.phase='ready';state.websiteChatOpen=false
    if(obSaved?.ready) {
      // 已有助手的用户重新走引导又中途退出：回到原来的官网和配置，不算跳过。
      Object.assign(ob,{website:obSaved.website,name:obSaved.name,icon:obSaved.icon || '',summary:obSaved.summary,pages:obSaved.pages,questions:obSaved.questions || []})
      state.onboarding.website=obSaved.website;state.onboarding.color=obSaved.color || cfg.draft.appearance.primary
    } else {
      ob.website='';ob.skipped=true;localStorage.setItem('xiguan-onboarding','skipped')
    }
    enterAgentOverview();renderApp()
  }
  if(action==='connect') {
    ob.phase='website';ob.website='';ob.error='';ob.skipped=false
    renderApp()
  }
  if(action==='try') {
    state.previewMode='conversation';renderApp();document.querySelector('#cfg-widget-input')?.focus()
  }
  if(action==='expand') {ob.expanded=!ob.expanded;document.body.classList.toggle('ob-expanded',ob.expanded);button.innerHTML=icon(ob.expanded?'close':'external');button.title=ob.expanded?'退出放大':'放大预览'}
  if(action==='blocked') {ob.preview='blocked';renderApp()}
  if(action==='share') obDialog('share')
  if(action==='copy-share') {
    try {await navigator.clipboard.writeText(obShareUrl());button.textContent='已复制'}
    catch {document.querySelector('#ob-share-url').select();button.textContent='请手动复制'}
  }
},true)

if (location.hash.startsWith('#experience=')) {
  try {
    const snapshot=JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(12)))))
    if(snapshot.v!==1 || !/^#[0-9a-f]{6}$/i.test(snapshot.color)) throw new Error('invalid')
    cfg.draft.appearance.history=false
    ob.shared=true;ob.phase='ready';ob.summary=String(snapshot.summary||'');ob.website=String(snapshot.website||'')
    Object.assign(cfg.draft.appearance,{name:String(snapshot.name).slice(0,80),primary:snapshot.color,accent:snapshot.color,welcome:String(snapshot.welcome).slice(0,1000)})
    cfg.draft.appearance.quickButtons=obQuick()
  } catch {ob.phase='landing';toast('体验链接无效，请重新获取链接','error')}
}
if(obSaved?.ready && !ob.shared) {
  cfg.sources=obSaved.sources || obSources()
  cfg.unanswered=obSaved.unanswered || []
}
// 独立的高保真预览入口，示例仅存在内存中，不覆盖浏览器已保存的助手配置。
if(obParams.get('flow')==='preview' && !ob.shared) {
  ob.phase='ready';ob.skipped=false
  if(!obSaved?.ready) {ob.website='https://www.fanruan.com/';state.onboarding.website=ob.website;obSiteData();state.onboarding.color=ob.color;obApplyDefaults({persist:false})}
  state.previewMode='website';state.websiteChatOpen=false;state.debugConfigTab='knowledge'
}
renderApp()
