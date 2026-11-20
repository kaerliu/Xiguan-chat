/* 评审后主流程。沿用原配置页与访客组件；服务结果由独立演示入口模拟。 */
/* 首次设置不弹窗：它占用工作台左侧的概览栏，输入、读取、失败、完成都在这一栏里，两条路径只是初始状态不同。 */
/* 右侧调试台随进度实时变化：打开官网、弹出对话窗口、换上主题色，读完生成常用问题，可以直接点着试问。 */
const obKey = 'xiguan-onboarding-v4'
const obParams = new URLSearchParams(location.search)
let obSaved = cfgRead(obKey)
const obFlag = localStorage.getItem('xiguan-onboarding')
// phase：landing 落地页｜website 等待输入｜reading 读取中｜failed 读取失败｜done 已读完并写入配置，左栏仍是设置结果｜ready 左栏回到概览
const ob = {
  phase: obSaved?.ready || obFlag ? 'ready' : localStorage.getItem('xiguan-onboarding-account') ? 'website' : 'landing',
  website: obSaved?.website || localStorage.getItem('xiguan-onboarding-pending-url') || '', name: obSaved?.name || '你的官网',
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
const obOriginalOverview = renderAgentOverview
const obTicks = [12,25,38,50,63,75,88,100]
const obNeutral = '#D9DEDB'
const obInSetup = () => ['website','reading','failed','done'].includes(ob.phase)

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

// —— 首次设置栏 ——
// 设置面板渲染在概览栏的位置，读完后才换回概览。这里只输出稳定的骨架，各区域内容由 obPaint 按状态填入，
// 读取过程中不重建面板（保住输入焦点和过渡动画）。
// 面板在读完之后被整页重绘时（比如点「开始试问」切到对话窗口）带 data-still：直接显示最终样子，不重播出现动画。
function obSetupPanel() {
  return `<div class="ob-setup ob-setup-panel" data-step="${ob.phase}" ${ob.phase==='done'?'data-still':''} data-keep-scroll="ob-setup"><div id="ob-setup-head" aria-live="polite"></div>
    <form id="ob-setup-form" class="ob-url-bar" novalidate>${icon('globe')}<input id="ob-setup-url" name="website" aria-label="企业官网" placeholder="https://www.your-company.com" autocomplete="url" spellcheck="false" value="${esc(ob.website)}"><button class="btn ghost small" type="button" data-ob="edit-url">修改</button><button class="btn primary" type="submit" id="ob-setup-submit"></button></form>
    <div class="ob-setup-status"><div class="ob-progress-track"><i id="ob-setup-bar"></i></div><span id="ob-setup-note" role="alert"></span></div>
    <div class="ob-findings-label">读取后你会得到</div>
    <ul class="ob-findings"><li id="ob-find-who"></li><li id="ob-find-pages"></li><li id="ob-find-look"></li></ul>
    <div class="ob-setup-actions"><button class="btn primary" type="button" data-ob="try">开始试问 ${icon('arrow')}</button></div>
    <button class="ob-setup-skip" type="button" data-ob="skip">稍后再说</button></div>`
}
renderAgentOverview = function () { return obInSetup() ? obSetupPanel() : obOriginalOverview() }
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
// 文案的分工：标题说现在这一步的目的；副标题只在需要用户做下一件事时出现；
// 三行在读取前说「你会得到什么」，读取时逐行变成正在做的事和识别到的结果，不再另外用一句话重复当前步骤。
function obSetupCopy() {
  if(ob.phase==='reading') return ['正在读取你的官网','']
  if(ob.phase==='done') return ['你的 AI 接待准备好了','']
  if(ob.phase==='failed') return ['暂时读不到这个官网','网站可能暂时不可用或限制了访问，检查网址后重试。']
  return ['输入官网，生成你的 AI 接待','']
}
function obFinding(kind) {
  const reading=ob.phase==='reading', tick=ob.phase==='done'?7:reading?ob.tick:-2
  const stateOf=(from,to)=>tick>=to?'done':reading&&tick>=from?'active':'pending'
  const row=(status,glyph,body,extra='')=>({status,html:`${status==='done'?obCheckMark():`<i class="ob-mark">${icon(glyph)}</i>`}<div class="ob-find-body">${body}</div>${extra}`})
  if(kind==='who') {
    const status=stateOf(-1,1)
    if(status!=='done') return {key:status,...row(status,'building',`<strong>${status==='active'?'正在读取公司名称和图标':'带公司名称和图标的接待窗口'}</strong>`)}
    return {key:`done${ob.icon}`,...row(status,'building',`<label class="ob-name-edit">${ob.icon?`<img class="ob-site-icon" src="${esc(ob.icon)}" alt="" referrerpolicy="no-referrer">`:''}<input id="ob-name-input" aria-label="公司名称" maxlength="40" spellcheck="false" value="${esc(ob.name)}" readonly><span>可修改</span></label><p>${esc(ob.summary)}</p>`)}
  }
  if(kind==='pages') {
    const status=stateOf(1,5), read=Math.min(ob.pages.length,Math.max(0,tick))
    if(status==='pending') return {key:status,...row(status,'book','<strong>学过官网内容的知识库</strong>')}
    if(status==='active') return {key:`active${read}`,...row(status,'book',`<strong>正在学习官网内容</strong><p>第 ${read} 页 · ${esc(ob.pages[read-1]?.name || '')}</p>`)}
    return {key:'done',...row(status,'book',`<strong>已学习 ${ob.pages.length} 个页面</strong><details class="ob-pages"><summary>查看页面 ${icon('chevron-down')}</summary><ul>${ob.pages.map(page=>`<li>${icon('file')}${esc(page.name)}</li>`).join('')}</ul></details>`)}
  }
  const status=stateOf(5,6), swatch=`<span class="ob-color-swatch" style="--ob-site-color:${esc(state.onboarding.color)}"></span>`
  if(status!=='done') return {key:status,...row(status,'palette',`<strong>${status==='active'?'正在匹配品牌色':'与官网一致的品牌色'}</strong>`)}
  return ob.colorFailed
    ? {key:'done-fallback',...row(status,'palette','<strong>先使用默认配色</strong><p>没识别出品牌色，可在「外观」里更换。</p>',swatch)}
    : {key:'done',...row(status,'palette','<strong>已沿用官网配色</strong>',swatch)}
}
function obWidgetStage() { return ob.phase!=='reading'?0:ob.tick>=6?2:ob.tick>=1?1:0 }
// 读取过程中，右侧官网上的对话窗口用一份临时外观跟着进度走：认出公司后弹出（带名称与欢迎语），随后换上主题色。
// 这段时间它不可操作；读完后由 obFinish 换成正式配置并放开。
function obPaintWidget() {
  const shell=document.querySelector('.website-chat-window'), root=shell?.querySelector('[data-widget-root]')
  if(!root || !['reading','failed'].includes(ob.phase)) return
  const stage=obWidgetStage(), key=`${stage}|${ob.name}|${ob.icon}`
  shell.inert=true
  if(root.dataset.k===key) return
  const vars=['--w-primary','--w-on-primary','--w-on-paper'], old=root.dataset.k?root.querySelector('.cfg-widget'):null
  const from=old?vars.map(name=>old.style.getPropertyValue(name)):null
  root.dataset.k=key;shell.dataset.obStage=stage
  root.innerHTML=obWidgetWith({name:`${ob.name} · AI 接待`,avatarImage:ob.icon,welcome:obWelcome(),primary:stage>=2?state.onboarding.color:obNeutral,quickButtons:[]})
  // 重绘后先放回旧颜色再换成新颜色，让主题色是「染」上去的，而不是闪一下。
  const next=root.querySelector('.cfg-widget'), to=vars.map(name=>next.style.getPropertyValue(name))
  if(from && from[0] && from[0]!==to[0]) {
    vars.forEach((name,i)=>next.style.setProperty(name,from[i]))
    void next.offsetWidth
    vars.forEach((name,i)=>next.style.setProperty(name,to[i]))
  }
}
function obPaint() {
  const main=document.querySelector('.ob-setup-panel'); if(!main) return
  main.dataset.step=ob.phase
  const [title,sub]=obSetupCopy()
  obPut('#ob-setup-head',ob.phase,`<h1>${title}</h1>${sub?`<p>${sub}</p>`:''}`)
  const locked=ob.phase==='reading'||ob.phase==='done', input=main.querySelector('#ob-setup-url')
  input.readOnly=locked
  if(locked) input.value=ob.website
  obPut('#ob-setup-submit',ob.phase,`${ob.phase==='failed'?'重新读取':'开始读取'} ${icon('arrow')}`)
  main.querySelector('#ob-setup-bar').style.width=`${ob.phase==='reading'?ob.progress:ob.phase==='done'?100:0}%`
  const note=main.querySelector('#ob-setup-note')
  note.textContent=ob.error
  for(const kind of ['who','pages','look']) {
    const finding=obFinding(kind), row=obPut(`#ob-find-${kind}`,finding.key,finding.html)
    row.className=finding.status
  }
  const name=main.querySelector('#ob-name-input'); if(name) name.readOnly=ob.phase!=='done'
  obPaintWidget()
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
  obPaint()
  obBindFrame()
}

// 标题、切换、官网浏览器与对话窗口全部来自上游，只接入分享、放大和预览异常。
renderOverviewPreview = function () {
  // 读取中途切到别的页面再回来时，上游会把对话窗口收起；读取期间它应当一直在。
  if (ob.phase === 'reading') state.websiteChatOpen = true
  let html = obOriginalPreview()
  const actions = `<div class="ob-debug-actions"><button class="cfg-btn sm ghost" data-ob="share">${icon('link','xs')}<span>分享</span></button><button class="cfg-icon-btn" data-ob="expand" title="${ob.expanded?'退出放大':'放大预览'}">${icon(ob.expanded?'minimize':'maximize','xs')}</button></div>`
  html = html.replace(/<\/div><\/div>\s*<div class="overview-preview-body">/, `</div>${actions}</div><div class="overview-preview-body" id="ob-preview-target">`)
  html = html.replace('<iframe title="用户官网预览"', '<iframe id="ob-site-frame" title="用户官网预览"')
  if (ob.skipped || ob.phase === 'website') {
    // 还没有官网时不展示示例网站：等待输入时说明接下来会发生什么；跳过设置的用户在这里有重新连接的入口。
    const empty = ob.skipped
      ? '<h3>还没有连接企业官网</h3><p>连接后，助手会学习官网内容，并在这里展示访客看到的效果。</p><div><button class="btn primary small" data-ob="connect">连接官网</button></div>'
      : '<h3>输入官网后，这里会打开你的官网</h3>'
    html = html.replace(/(<div class="website-preview-url">)[^<]*(<\/div>)/,'$1尚未连接官网$2')
    html = html.replace(/<iframe id="ob-site-frame"[^>]*><\/iframe>/, `<div class="ob-unavailable">${icon('globe')}${empty}</div>`)
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

function obSiteData() {
  const host = new URL(ob.website).hostname
  const fanruan = /(^|\.)fanruan\.com$/.test(host)
  ob.name = fanruan ? '帆软软件' : /xiguan|finesales/.test(host) ? '吸管 AI 接待' : host
  ob.summary = fanruan ? '提供 FineReport 报表与 FineBI 商业智能产品，帮助企业完成报表制作、数据分析与经营决策。' : /xiguan|finesales/.test(host) ? '为企业官网提供 AI 售前接待，基于业务资料回答产品与方案问题，帮助访客了解产品并发起咨询。' : '此地址已带入官网预览。当前演示使用通用接待资料展示配置，真实业务内容将在接入官网解析服务后生成。'
  ob.pages = [{name:'官网首页',path:'/'},{name:fanruan?'FineReport 产品介绍':'AI 接待产品介绍',path:'/products/'},{name:fanruan?'FineBI 商业智能':'解决方案',path:'/solutions/'},{name:'行业应用',path:'/industries/'},{name:'常见问题',path:'/faq/'}]
  state.onboarding.color = ob.colorFailed ? '#13795B' : fanruan ? '#1677FF' : '#13795B'
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

// 读取过程只推进左栏的状态和右侧对话窗口的临时外观；一开始读取，右侧就打开这个官网。
async function obStartReading() {
  localStorage.setItem('xiguan-onboarding-pending-url',ob.website)
  ob.phase='reading';ob.progress=0;ob.tick=-1;ob.error='';ob.icon=''
  state.onboarding.website=ob.website;state.previewMode='website';state.websiteChatOpen=true
  obSiteData()
  if(document.querySelector('.ob-landing')) obSwap(renderApp); else renderApp()
  const epoch=++ob.epoch
  obReadIcon(epoch)
  for (const [tick,percent] of obTicks.entries()) {
    await new Promise(resolve=>setTimeout(resolve, 900))
    if (epoch !== ob.epoch) return
    if (ob.readFailed && percent === 38) {
      // 演示用的失败只触发一次，修改网址或重试后可以走通。
      ob.readFailed=false;ob.phase='failed';obPaint()
      document.querySelector('#ob-setup-url')?.focus()
      return
    }
    ob.tick=tick;ob.progress=percent
    if(percent<100) obPaint()
  }
  obFinish()
}
// 官网图标：直接取站点根目录的 favicon，读到就用作对话窗口头像；读不到则保持名称首字，不提示。
// 图标可能比读取过程晚到，所以读完之后到达也会补写进正式配置。
function obReadIcon(epoch) {
  const probe=new Image()
  probe.referrerPolicy='no-referrer'
  probe.onload=()=>{
    if(epoch!==ob.epoch || probe.naturalWidth<2) return
    ob.icon=probe.src
    if(ob.phase==='done') {
      cfg.draft.appearance.avatarImage=ob.icon
      cfg.saved=JSON.stringify(cfg.draft);cfgWrite(cfgStorageKeys.saved,cfg.draft)
      obSaved={...obSaved,icon:ob.icon};cfgWrite(obKey,obSaved)
      refreshWidget()
    }
    obPaint()
  }
  probe.src=`${new URL('/favicon.ico',ob.website).href}#site-icon`
}
// 读完就写入默认配置：右侧对话窗口原位换成正式配置、出现常用问题并放开操作，用户可以直接点着试问。
// 左栏停在结果上，不自动换走。
function obFinish() {
  ob.phase='done';ob.skipped=false
  state.previewMode='website';state.websiteChatOpen=true
  let shell=document.querySelector('.website-chat-window')
  if(shell) shell.dataset.obStage='3'
  obApplyDefaults()
  obSaved={ready:true,website:ob.website,name:ob.name,icon:ob.icon,summary:ob.summary,pages:ob.pages,questions:ob.questions,sources:cfg.sources,color:state.onboarding.color}
  cfgWrite(obKey,obSaved);localStorage.setItem('xiguan-onboarding','done')
  if(!shell && state.route==='agent' && state.agentSection==='overview') {
    // 对话窗口不在页面上（比如读取失败后被收起过）：重绘一次把它带出来。
    renderApp();shell=document.querySelector('.website-chat-window')
    if(shell) shell.dataset.obStage='3'
  } else obPaint()
  if(shell) {
    shell.inert=false
    // 出现动画只播这一次，之后窗口重绘（发消息、新会话）不再重播。
    setTimeout(()=>{delete shell.dataset.obStage},1200)
  }
}
// 完成后改公司名称：配置已经写入，所以直接改正式配置并刷新右侧窗口。
function obRename(value) {
  ob.name=value.trim() || new URL(ob.website).hostname
  cfg.draft.appearance.name=`${ob.name} · AI 接待`;cfg.draft.appearance.welcome=obWelcome()
  cfg.saved=JSON.stringify(cfg.draft);cfgWrite(cfgStorageKeys.saved,cfg.draft)
  obSaved={...obSaved,name:ob.name};cfgWrite(obKey,obSaved)
  refreshWidget()
}
// 左栏换回概览：问完第一个问题后自动发生（那时注意力在右侧的回答上，设置面板的任务已经结束，
// 下一步该调配置了）。右侧的官网或对话窗口原样保留，只重绘左栏并淡入。
function obEnter() {
  if(ob.phase!=='done') return
  ob.phase='ready'
  const editor=document.querySelector('.agent-editor>.editor-body')
  if(!editor || state.route!=='agent' || state.agentSection!=='overview') return
  editor.innerHTML=renderAgentSection()
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches) editor.firstElementChild?.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:280,easing:'cubic-bezier(.2,0,0,1)'})
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
  if(/功能|产品|介绍|做什么|场景|用途|服务/.test(question)) return {text:`${ob.summary}\n\n你更关心哪一类业务场景？我可以帮你继续了解。`,route:'doc',refs:Math.min(ob.pages.length,2)}
  const available=cfg.sources.filter(x=>x.status==='ready').flatMap(x=>x.entries||[]).find(x=>kbSimilarity(`${x.title}${x.body}`,question)>=.16)
  return available ? {text:available.body,route:'doc',refs:1} : {text:'当前官网资料中还没有这个问题的可靠依据。你可以进一步说明需求，或通过官网咨询我们。',route:'none',refs:0,insufficient:true}
}

// 第一次问答：回答出现后稍等片刻，再把左栏从设置结果换成概览。
const obAnswerWithSite = kbAnswer
kbAnswer = function(...args) {
  const result=obAnswerWithSite(...args)
  if(ob.phase==='done') setTimeout(obEnter,900)
  return result
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
  if (id==='ob-setup-form' && !['website','failed'].includes(ob.phase)) return
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
  if(event.target.id==='ob-name-input' && ob.phase==='done') obRename(event.target.value)
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
    else {ob.phase='website';obSwap(renderApp).then(()=>document.querySelector('#ob-setup-url')?.focus())}
  }
  if(action==='edit-url') {
    ob.epoch++;ob.phase='website';ob.error='';state.websiteChatOpen=false;renderApp()
    const input=document.querySelector('#ob-setup-url');input?.focus();input?.select()
  }
  if(action==='skip') {
    ob.epoch++;ob.error='';ob.phase='ready';state.websiteChatOpen=false
    localStorage.removeItem('xiguan-onboarding-pending-url')
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
    renderApp();document.querySelector('#ob-setup-url')?.focus()
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
  if(!obSaved?.ready) {ob.website='https://www.fanruan.com/';state.onboarding.website=ob.website;obSiteData();obApplyDefaults({persist:false})}
  state.previewMode='website';state.websiteChatOpen=false;state.debugConfigTab='knowledge'
}
renderApp()
if(ob.phase==='website') document.querySelector('#ob-setup-url')?.focus()
