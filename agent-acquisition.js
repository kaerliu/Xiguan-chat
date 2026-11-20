/*
 * 主动获客：按条件主动出现在访客面前的功能，从「能力」里单独拿出来成一类。
 * - 列表页：形象引导、留资弹窗、主动弹窗、沉默跟进（CAPABILITIES 里 trigger 为 page 的那几项）。
 *   后三个的详情页沿用 agent-capabilities.js 里原有的实现，这里只换了入口。
 * - 形象引导详情页：左边先填官网页面的网址，读完页面按识别出的区块给出规则建议，再逐条改
 *   （什么条件、站在哪、做什么动作、说什么、按钮调哪个能力）；
 *   右边是 mascot-preview.html（iframe），规则用 postMessage 传过去，改什么演什么。
 *   读页面要靠本地服务（dev-server.js 的 /api/page-snapshot）；没填网址或读不到时，用原型自带的示例官网。
 * 站位有两种，可以并存：每个区块四个预设点位（左上、右上、左下、右下），或者在右边直接拖小吸定一个手动位置。
 * 两种存的都是相对区块的位置：预设点位存编号，手动位置存相对区块内容框的比例和滚动偏移（rule.offset）。
 * 调用方向只有一个：引导规则调用能力（留资、资料交付、转人工、推荐消息），能力不会反过来调用规则。
 * 用哪个形象、形象待在哪，在「外观 · 数字人」里选；这里只管它什么时候出来、说什么。
 * 本文件在 agent-config.js 之前加载（草稿初始化要用 DEFAULT_MASCOT_GUIDE）；其余引用都在调用时才访问。
 */

const isAcquisitionCap = id => { const cap = CAPABILITIES.find(item => item.id === id); return Boolean(cap && capInAcquisition(cap)) }

const MG_TRIGGERS = [['delay', '停留一段时间后'], ['block', '停在某个区块']]
// 没填网址时用示例官网的三个区块；填了网址，区块由预览页读完真实页面后报上来（见 mgBlocks）
const MG_BLOCKS = [['caps', '产品能力'], ['cases', '客户案例'], ['price', '版本与价格']]
const MG_POSITIONS = [['tl', '1 号位 · 左上'], ['tr', '2 号位 · 右上'], ['bl', '3 号位 · 左下'], ['br', '4 号位 · 右下'], ['custom', '手动位置'], ['entry', '留在入口原位']]
// 系统给每个区块先选的点位；正式版可以让 AI 看截图挑
const MG_DEFAULT_SLOT = { caps: 'tr', cases: 'br', price: 'tr' }
const MG_ACTIONS = [['greet', '打招呼'], ['explain', '讲解'], ['point', '指给访客看'], ['offer', '递资料']]
// 按钮能绑的东西：四个基础能力，加上系统自带的「打开对话」
const MG_ABILITIES = [['lead_capture', '留资'], ['asset_delivery', '资料交付'], ['human_handoff', '转人工'], ['recommendations', '推荐消息'], ['chat', '打开对话'], ['none', '不设按钮']]
const MG_ABILITY_PREVIEW = { lead_capture: 'form', asset_delivery: 'doc', human_handoff: 'human', recommendations: 'rec', chat: 'chat', none: 'none' }
const MG_MESSAGE_MAX = 40
const MG_BUTTON_MAX = 8
const MG_MAX_RULES = 8
const MG_PREVIEW_SRC = './mascot-preview.html?v=20261119-6'
// 「让 AI 重写」在原型里是预设的几句轮换
const MG_REWRITES = {
  greet: ['嗨，我是小吸。往下看，我陪你一起', '你好呀，想了解哪块可以直接问我'],
  explain: ['这三块可以单独开，也能一起上。先看哪块的演示？', '设备、质量、经营三块数据能打通。要看演示吗？'],
  point: ['上面这家做汽配的，规模和你们接近。要完整案例集吗？', '这家月结从 3 天缩到 2 小时，案例集里有做法'],
  offer: ['报价和数据量有关。留个手机号，我把报价单发你', '想知道大概多少钱？留个手机号，报价单马上到']
}
// 读完页面后给的规则建议：按区块的类型（预览页根据标题里的词判断）各出一条。
// 原型里话术是套模板，{name} 换成区块标题；正式版由模型读区块内容来写。
const MG_SUGGEST = {
  hero: { trigger: 'delay', action: 'greet', texts: ['嗨，我是小吸。想了解哪块，可以直接问我', '你好呀，往下看的时候有问题随时叫我'], button: '问一问', ability: 'chat' },
  caps: { trigger: 'block', action: 'explain', texts: ['「{name}」想细看的话，我给你演示一遍', '这块我熟。要不要看看实际用起来什么样？'], button: '看演示', ability: 'chat' },
  cases: { trigger: 'block', action: 'point', texts: ['这里面有和你们同行的客户。要完整案例集吗？', '想看同行怎么用的？我把案例集发你'], button: '要案例集', ability: 'chat' },
  price: { trigger: 'block', action: 'offer', texts: ['报价和用量有关。留个手机号，我把报价单发你', '想知道大概多少钱？留个手机号，报价单马上到'], button: '领取报价单', ability: 'lead_capture' },
  form: { trigger: 'block', action: 'point', texts: ['不想填这么多？留个手机号，我帮你约演示', '留个手机号就行，我帮你把演示约上'], button: '预约演示', ability: 'lead_capture' }
}
const MG_KIND_NAMES = { hero: '首屏', caps: '产品介绍', cases: '客户案例', price: '价格', form: '表单', other: '其他' }

const DEFAULT_MASCOT_GUIDE = {
  enabled: true, max_per_visit: 3, lead_rules_free: true, page_url: '',
  rules: [
    { id: 'mg_greet', enabled: true, ai: false, trigger: 'delay', delay_seconds: 8, block: 'caps', position: 'entry', action: 'greet', message: MG_REWRITES.greet[0], button_label: '', ability: 'none' },
    { id: 'mg_caps', enabled: true, ai: true, trigger: 'block', delay_seconds: 8, block: 'caps', position: 'tr', action: 'explain', message: MG_REWRITES.explain[0], button_label: '看演示', ability: 'chat' },
    { id: 'mg_cases', enabled: true, ai: true, trigger: 'block', delay_seconds: 8, block: 'cases', position: 'br', action: 'point', message: MG_REWRITES.point[0], button_label: '要案例集', ability: 'chat' },
    { id: 'mg_price', enabled: true, ai: true, trigger: 'block', delay_seconds: 8, block: 'price', position: 'tr', action: 'offer', message: MG_REWRITES.offer[0], button_label: '领取报价单', ability: 'lead_capture' }
  ]
}

const mgGuide = () => C().mascot_guide
const mgLabel = (list, value) => list.find(item => item[0] === value)?.[1] || ''
/** 现在能选的区块：没填网址是示例官网的三个；填了网址是读页面识别出来的（还没读回来时，先用规则里记着的名字顶上）。 */
function mgBlocks() {
  const g = mgGuide()
  if (!g.page_url) return MG_BLOCKS
  if (cfg.mgPage?.url === g.page_url) return cfg.mgPage.blocks.map(block => [block.id, block.name])
  const seen = new Map()
  g.rules.forEach(rule => { if (rule.trigger === 'block' && rule.block_name) seen.set(rule.block, rule.block_name) })
  return [...seen]
}
const mgBlockInfo = id => (cfg.mgPage?.url === mgGuide().page_url ? cfg.mgPage.blocks : []).find(block => block.id === id)
/** 页面读回来了，但这条规则的区块在页面上找不到了（页面改版）：访客那边退回入口原位。 */
const mgBlockMissing = rule => rule.trigger === 'block' && Boolean(mgGuide().page_url) && cfg.mgPage?.url === mgGuide().page_url && !mgBlockInfo(rule.block)
const mgBlockName = rule => mgLabel(mgBlocks(), rule.block) || rule.block_name || '找不到的区块'
const mgDefaultSlot = id => mgBlockInfo(id)?.slot || MG_DEFAULT_SLOT[id] || 'tr'
const mgTriggerText = rule => rule.trigger === 'block' ? `停在「${mgBlockName(rule)}」` : `停留满 ${rule.delay_seconds} 秒`
const mgNormalizeUrl = value => { const text = String(value || '').trim(); return !text ? '' : /^https?:\/\//i.test(text) ? text : `https://${text}` }
const mgRuleTitle = rule => `${mgTriggerText(rule)} · ${mgLabel(MG_ACTIONS, rule.action)}`
const mgHasButton = rule => rule.ability !== 'none' && Boolean(String(rule.button_label || '').trim())
/** 按钮绑定的能力被关掉时，这条规则暂不生效（能力重新打开后跟着恢复）。 */
const mgAbilityOff = rule => !['chat', 'none'].includes(rule.ability) && !isCapEnabled(rule.ability)
const mgRuleActive = rule => rule.enabled && !mgAbilityOff(rule)

/** 站位只对「停在某个区块」的规则有意义；老草稿里的 block 换成这个区块的默认点位。草稿、已保存、已发布三份一起改，不算改动。 */
function mgNormalize() {
  const valid = MG_POSITIONS.map(item => item[0])
  ;[cfg.draft, cfg.saved, cfg.published].forEach(d => {
    if (!d?.mascot_guide) return
    if (typeof d.mascot_guide.page_url !== 'string') d.mascot_guide.page_url = ''
    ;(d.mascot_guide.rules || []).forEach(rule => {
      if (!['delay', 'block'].includes(rule.trigger)) { rule.trigger = 'delay'; rule.delay_seconds = Number(rule.delay_seconds) || 15 } // 「准备离开时」已去掉，老草稿里的改成停留 15 秒
      delete rule.page_label; delete rule.page_pattern // 老草稿里每条规则各填一个页面，现在整个功能只对上面那一个页面
      if (rule.trigger !== 'block') rule.position = 'entry'
      else if (!valid.includes(rule.position)) rule.position = MG_DEFAULT_SLOT[rule.block] || 'tr'
      if (rule.position !== 'custom') delete rule.offset
    })
  })
}

/** 发布前的检查，接在 capIssues() 里。 */
function mgIssues(d = C()) {
  const g = d.mascot_guide
  if (!g?.enabled) return []
  const issues = []
  if (g.rules.some(rule => rule.enabled && !String(rule.message || '').trim())) issues.push('形象引导：启用的规则话术不能为空')
  if (g.rules.some(rule => rule.enabled && rule.ability !== 'none' && !String(rule.button_label || '').trim())) issues.push('形象引导：选了按钮要做的事，就要写按钮文案')
  return issues
}

/* ---------- 列表页 ---------- */

function renderAcquisitionConfig() {
  if (cfg.capDetail && isAcquisitionCap(cfg.capDetail)) return renderCapabilitiesConfig()
  return cfgPage('acquisition', `${renderCfgHeader({ title: '主动获客', desc: '访客还没开口时，按页面上的行为主动出现，再用按钮把访客带到留资；测评、资料交付这类专门用来换线索的能力也在这里配。留资、转人工等对话里用的能力仍在「能力」里。' })}
    <section class="cfg-body">
      <div class="cfg-cap-grid">${renderCapabilityListCards('acquisition')}</div>
    </section>`)
}

/* ---------- 形象引导详情 ---------- */

function mgRuleForm(rule, index) {
  const base = `mascot_guide.rules.${index}`
  const second = rule.trigger === 'delay'
    ? `<label>停留秒数</label>${capNumber(`${base}.delay_seconds`, 3, 300, 'data-live="mascot" data-mg-title="1"')}`
    : `<label>区块</label>${capSelect(`${base}.block`, mgBlocks(), 'data-mg-rerender="1"')}${mgGuide().page_url ? (mgBlockMissing(rule) ? '<small>页面上找不到这个区块了，访客那边小吸会留在入口原位。</small>' : '') : '<small>现在是示例官网的三个区块。填了网址，这里换成页面上识别出来的。</small>'}`
  const abilityOff = mgAbilityOff(rule)
  const abilityName = mgLabel(MG_ABILITIES, rule.ability)
  return `<div class="cfg-form-grid">
      ${field('出现条件', capSelect(`${base}.trigger`, MG_TRIGGERS, 'data-mg-rerender="1"'))}
      <div class="cfg-field">${second}</div>
      ${rule.trigger === 'block' ? field('站在哪', `${capSelect(`${base}.position`, MG_POSITIONS, 'data-mg-rerender="1"')}<small>${rule.position === 'custom' && rule.offset ? `手动位置按区块保存：横向在区块宽度的 ${Math.round(rule.offset.x * 100)}%，纵向在区块高度的 ${Math.round(rule.offset.y * 100)}%。` : ''}也可以在右边直接拖小吸：拖到编号点位附近会吸附，拖到别处记成手动位置。</small>`, { full: true }) : ''}
      ${field('形象动作', capSelect(`${base}.action`, MG_ACTIONS, 'data-mg-rerender="1"'))}
      ${field('按钮点了之后', capSelect(`${base}.ability`, MG_ABILITIES, 'data-mg-rerender="1"'))}
      ${field('话术', `${capTextarea(`${base}.message`, 2, `maxlength="${MG_MESSAGE_MAX}" data-live="mascot" data-mg-count="1"`)}<div class="mg-tools"><small data-mg-counter>${String(rule.message || '').length} / ${MG_MESSAGE_MAX}</small><button type="button" class="cfg-btn sm ghost" data-mg-ai="${index}">${icon('spark', 'xs')}<span>让 AI 重写</span></button></div>`, { full: true })}
      ${rule.ability !== 'none' ? field('按钮文案', capInput(`${base}.button_label`, `maxlength="${MG_BUTTON_MAX}" placeholder="例如：领取报价单" data-live="mascot"`), { full: true }) : ''}
    </div>
    ${abilityOff ? capNotice(`<strong>「${abilityName}」已关闭，这条规则暂不生效。</strong>能力重新打开后规则跟着恢复。`, `<button type="button" class="cfg-btn sm outline" data-cap-config="${rule.ability}">去开启${abilityName}</button>`) : ''}`
}

function mgSections() {
  mgNormalize()
  const d = C()
  // 记下每条规则最近用的预设点位：切到「手动位置」时，小吸先留在这个点位上
  cfg.mgSlotFrom = cfg.mgSlotFrom || {}
  d.mascot_guide.rules.forEach(rule => { if (['tl', 'tr', 'bl', 'br'].includes(rule.position)) cfg.mgSlotFrom[rule.id] = rule.position })
  const g = d.mascot_guide
  const a = d.appearance
  if (!g.rules.some(rule => rule.id === cfg.mgActive)) cfg.mgActive = g.rules[0]?.id || ''
  const humanOn = Boolean(a.entries.human.enabled)
  const option = mascotOptions.find(item => item.key === a.mascot)
  const mascotName = a.mascot === 'custom' ? '自定义形象' : option?.name || '形象'
  const mascotNote = !humanOn
    ? capNotice('<strong>外观里还没开启数字人入口。</strong>访客看不到形象，规则会改由主入口用普通气泡说同一句话；右边按开启后的效果演示。', '<button type="button" class="cfg-btn sm outline" data-agent-section="appearance">去外观开启</button>')
    : option?.animated ? '' : capNotice(`<strong>「${esc(mascotName)}」没有动作素材。</strong>访客看到的是静态形象加气泡；右边按小吸演示。`, '<button type="button" class="cfg-btn sm outline" data-agent-section="appearance">去外观更换</button>')
  const mascot = capSection('mascot_guide:mascot', '形象', humanOn && Boolean(option?.animated), true, `<div class="mg-mascot-row"><img alt="" src="${esc(mascotSrc(a.mascot, a.entries.human.accent))}" /><div><strong>${esc(mascotName)}</strong><small>${humanOn ? `数字人入口 · ${apEntrySummary('human', a)}` : '数字人入口未开启'}</small></div><button type="button" class="cfg-btn sm outline" data-agent-section="appearance">去外观更换</button></div>${mascotNote}`)

  const read = cfg.mgRead || {}
  const info = g.page_url && cfg.mgPage?.url === g.page_url ? cfg.mgPage : null
  const urlValue = cfg.mgUrlInput ?? g.page_url
  const pageState = read.status === 'loading'
    ? '<p class="mg-page-state">正在读取页面，认区块、算站位…</p>'
    : `${read.status === 'error' ? capNotice(`<strong>${esc(read.error)}</strong>`) : ''}${info
      ? `<p class="mg-page-state"><strong>${esc(info.title || info.url)}</strong>识别出 ${info.blocks.length} 个区块${info.blocks.length ? '：' : ''}${info.blocks.map(block => `<span class="mg-block-chip">${esc(block.name)}<i>${MG_KIND_NAMES[block.kind] || '其他'}</i></span>`).join('')}</p>
        <div class="mg-page-actions"><button type="button" class="cfg-btn sm outline" data-action="cfg-mg-suggest" ${info.blocks.length ? '' : 'disabled'}>${icon('spark', 'xs')}<span>重新生成建议</span></button><button type="button" class="cfg-btn sm ghost" data-action="cfg-mg-sample"><span>改回示例官网</span></button></div>`
      : g.page_url ? '<p class="mg-page-state">正在读取页面…</p>' : ''}`
  const page = capSection('mascot_guide:page', '官网页面', Boolean(info), true, `<div class="cfg-field full"><label>页面网址</label>
      <div class="mg-url-row"><input class="console-input" type="url" inputmode="url" data-mg-url value="${esc(urlValue)}" placeholder="https://www.example.com/" ${read.status === 'loading' ? 'disabled' : ''} /><button type="button" class="cfg-btn sm primary" data-action="cfg-mg-read" ${read.status === 'loading' ? 'disabled' : ''}>读取页面</button></div>
      <small>读完会按页面上的区块重新生成下面的规则，现有规则会被替换。原型里话术按区块标题套模板，正式版由模型读页面内容来写。</small></div>
    ${pageState}`)

  const activeCount = g.rules.filter(mgRuleActive).length
  const rulesReady = g.rules.some(rule => rule.enabled) && !mgIssues().length
  const rules = capSection('mascot_guide:guide', `引导规则（${activeCount}/${g.rules.length} 条生效）`, rulesReady, true, `<div class="proto-cards">${g.rules.map((rule, index) => {
      const active = rule.id === cfg.mgActive
      return `<div class="proto-item ${active ? 'is-active' : ''} ${rule.enabled ? '' : 'is-off'}" data-mg-focus="${rule.id}">
        <div class="proto-item-head"><button type="button" class="cfg-switch ${rule.enabled ? 'on' : ''}" role="switch" aria-checked="${rule.enabled}" aria-label="启用这条规则" data-mg-toggle="${index}"></button><strong data-mg-title-of="${rule.id}">${esc(mgRuleTitle(rule))}</strong>${rule.ai ? badge('info', 'AI 建议') : ''}${rule.enabled && mgAbilityOff(rule) ? badge('warning', '暂不生效') : ''}${mgBlockMissing(rule) ? badge('warning', '区块没找到') : ''}<span class="cfg-capdetail-spacer"></span>${g.rules.length > 1 ? `<button type="button" class="cfg-icon-btn" aria-label="删除规则" data-mg-remove="${index}">${icon('trash', 'sm')}</button>` : ''}</div>
        ${active ? mgRuleForm(rule, index) : `<p class="mg-rule-summary">${esc(rule.message)}</p>`}
      </div>`
    }).join('')}</div>
    <div class="proto-editor-foot"><button type="button" class="cfg-btn sm outline" data-action="cfg-mg-add" ${g.rules.length >= MG_MAX_RULES ? 'disabled' : ''}>${icon('plus', 'xs')}<span>添加规则</span></button><small>同一时刻有多条规则的条件都满足，只出排在最前面的那条。同一条规则一次访问只出一次。</small></div>`)

  const control = capSection('mascot_guide:control', '打扰控制', true, false, `<div class="cfg-form-grid">
      <div class="cfg-field"><label>每次访问最多主动出现</label><span class="proto-inline"><input class="console-input" type="number" min="1" max="6" value="${g.max_per_visit}" data-bind="mascot_guide.max_per_visit" data-type="number" data-clamp="1,6" data-mg-replay="1" /> 次</span></div>
      <div class="cfg-field full">${capCheck('mascot_guide.lead_rules_free', '带留资或资料按钮的规则不占次数', 'data-mg-replay="1"')}<small>不勾的话，次数用完后排在后面的留资规则不会出现。</small></div>
    </div>
    <ul class="lead-rules"><li>访客关掉气泡后，本次访问不再主动出现；访客自己点形象，它照常回应。</li><li>页面在滚动、访客在输入时不出现，这一次直接作废，不排队补发。</li><li>已经留过联系方式的访客，不再出带留资或资料按钮的规则。</li></ul>`)

  return `${page}${mascot}${rules}${control}`
}

function renderMgLead() {
  const lead = cfg.mgLead
  if (!lead) return ''
  return `<div class="proto-sales-card"><div class="proto-sales-head">${icon('user-check', 'sm')}<strong>销售在「线索」里看到的</strong>${badge('success', '新线索')}</div>
    <dl><div><dt>联系方式</dt><dd>138****1234</dd></div><div><dt>来源</dt><dd>形象引导 · ${esc(lead.from)}</dd></div><div><dt>浏览路径</dt><dd>${esc(lead.path)}</dd></div><div><dt>通过</dt><dd>${badge('info', esc(lead.ability))}</dd></div></dl>
    <small>线索带着是哪条规则带来的，数据分析里可以按规则比留资率。</small></div>`
}

function renderMascotGuideDetail(cap) {
  cfg.mgLead = null
  const preview = `<div class="mg-preview">
      <iframe class="mg-frame" data-mg-frame src="${MG_PREVIEW_SRC}" title="形象引导效果预览" scrolling="no"></iframe>
      <div class="popup-preview-actions"><button type="button" class="cfg-btn sm outline" data-action="cfg-mg-play">${icon('refresh', 'xs')}<span>从头播放</span></button><button type="button" class="cfg-btn sm ghost" data-action="cfg-mg-dismiss"><span>演示访客关掉气泡</span></button><small>点左边的规则只预览那一条，这时可以点编号或拖小吸改位置，真实页面里可以先滚到想放的地方再拖；气泡里的按钮也可以点。</small></div>
      <div data-mg-lead></div>
    </div>`
  return cfgPage('cap-mascot_guide', `<div class="capability-workbench mg-workbench">
    <section class="capability-workbench-main">
      ${capHeader(cap, mgGuide().enabled)}
      <div class="capability-workbench-scroll" data-keep-scroll="cfg-cap-mascot_guide-scroll">
        <section class="cfg-body">${capIssueNotices('mascot_guide')}<div class="capability-sections" data-mg-main>${mgSections()}</div></section>
      </div>
    </section>
    <aside class="capability-workbench-debug" aria-label="形象引导演示">${renderCapabilityDebugPanel(cap, '按左边的规则，演示访客一路往下看的过程。没填网址时用原型自带的示例官网。', preview, { title: '官网效果预览', restart: false })}</aside>
  </div>`)
}

/* ---------- 和预览页（iframe）通信 ---------- */

function mgPayload() {
  const d = C()
  const g = d.mascot_guide
  return {
    // 这个网址上次没读成（比如不是用本地服务打开的）：先按示例官网演，不反复去读
    page: { url: cfg.mgPageDown === g.page_url ? '' : g.page_url || '' },
    rules: g.rules.map(rule => ({
      id: rule.id, on: g.enabled && mgRuleActive(rule), ai: Boolean(rule.ai),
      cond: rule.trigger === 'delay' ? 'dwell' : rule.trigger, sec: Number(rule.delay_seconds) || 8, block: rule.block || 'caps',
      follow: rule.trigger === 'block' && rule.position !== 'entry', slot: rule.position, from: cfg.mgSlotFrom?.[rule.id] || null, rx: rule.offset?.x ?? null, ry: rule.offset?.y ?? null, so: rule.offset?.s || 0, act: rule.action,
      text: String(rule.message || ''), btn: rule.ability === 'none' ? '' : String(rule.button_label || ''), abil: MG_ABILITY_PREVIEW[rule.ability] || 'none'
    })),
    opt: { max: Number(g.max_per_visit) || 3, leadFree: Boolean(g.lead_rules_free), float: Boolean(d.appearance.entries.float.enabled) }
  }
}

/** 按识别出的区块生成规则建议：首屏出一条打招呼，产品、案例、价格、表单各取第一个区块出一条。 */
function mgSuggestRules(blocks) {
  const rules = []
  const used = new Set()
  const stamp = Date.now().toString(36)
  blocks.forEach(block => {
    const tpl = MG_SUGGEST[block.kind]
    if (!tpl || used.has(block.kind) || rules.length >= 5) return
    used.add(block.kind)
    rules.push({
      id: `mg_${stamp}_${block.id}`, enabled: true, ai: true, kind: block.kind, trigger: tpl.trigger, delay_seconds: 8,
      block: block.id, block_name: block.name, position: tpl.trigger === 'block' ? block.slot : 'entry', action: tpl.action,
      message: tpl.texts[0].replace('{name}', block.name).slice(0, MG_MESSAGE_MAX), button_label: tpl.button, ability: tpl.ability
    })
  })
  return rules
}

/** 页面重新读回来之后，把规则对到现在的区块上：编号对不上就按名字找；都找不到的留着，界面上标「区块没找到」。 */
function mgRematch(blocks) {
  ;[cfg.draft, cfg.saved, cfg.published].forEach(d => (d?.mascot_guide?.rules || []).forEach(rule => {
    if (rule.trigger !== 'block') return
    const same = blocks.find(block => block.id === rule.block)
    if (same && (!rule.block_name || same.name === rule.block_name)) { rule.block_name = same.name; return }
    const byName = blocks.find(block => block.name === rule.block_name)
    if (byName) rule.block = byName.id
  }))
}

/** 点了「读取页面」。 */
function mgReadPage() {
  const input = document.querySelector('[data-mg-url]')
  const url = mgNormalizeUrl(input ? input.value : cfg.mgUrlInput)
  cfg.mgUrlInput = url
  if (input) input.value = url
  if (!url) { cfg.mgRead = { status: 'error', error: '先填一个网址' }; mgRefreshMain(); return }
  cfg.mgRead = { status: 'loading', asked: url }
  cfg.mgPageDown = ''
  mgRefreshMain()
  mgPush({ page: { url }, reload: true })
}

/** 把当前规则发给预览页。focus：只预览这一条；play：从头播放（follow）或演示关掉气泡（dismiss）。 */
function mgPush(extra = {}) {
  const frame = document.querySelector('[data-mg-frame]')
  if (!frame?.contentWindow) return
  try { frame.contentWindow.postMessage({ source: 'xiguan-mg', type: 'config', ...mgPayload(), ...extra }, '*') } catch (_) {}
}

function mgRefreshLead() {
  const root = document.querySelector('[data-mg-lead]')
  if (root) root.innerHTML = renderMgLead()
}

window.addEventListener('message', event => {
  const m = event.data
  if (!m || m.source !== 'xiguan-mg-preview') return
  const frame = document.querySelector('[data-mg-frame]')
  if (!frame || event.source !== frame.contentWindow) return
  if (m.type === 'ready') mgPush({ focus: cfg.mgActive, instant: true })
  else if (m.type === 'blocks') {
    // 预览页读完了真实页面，报上来识别出的区块
    const g = mgGuide()
    const fresh = cfg.mgRead?.status === 'loading' && cfg.mgRead.asked === m.asked
    cfg.mgPage = { url: m.asked, title: m.title, blocks: m.blocks || [] }
    cfg.mgPageDown = ''
    if (fresh) {
      // 刚点的「读取页面」：记下网址，按区块生成建议替换现有规则
      cfg.mgRead = null
      g.page_url = m.asked
      const rules = mgSuggestRules(cfg.mgPage.blocks)
      if (rules.length) { g.rules = rules; cfg.mgActive = rules[0].id; cfg.mgSlotFrom = {} }
      else cfg.mgRead = { status: 'error', error: '页面读到了，但没认出带标题的大区块，规则没有动。可以手动加规则，或换一个页面试试。' }
      mgRefreshMain()
      mgPush({ play: 'follow' })
    } else {
      mgRematch(cfg.mgPage.blocks)
      mgRefreshMain()
      mgPush({ focus: cfg.mgActive, instant: true })
    }
  }
  else if (m.type === 'page-error') {
    const g = mgGuide()
    if (m.asked === g.page_url) cfg.mgPageDown = g.page_url
    cfg.mgRead = { status: 'error', error: m.error }
    mgRefreshMain()
    mgPush({ play: 'follow' })
  }
  else if (m.type === 'height') frame.style.height = `${m.height}px`
  else if (m.type === 'live') document.querySelectorAll('[data-mg-focus]').forEach(node => node.classList.toggle('is-live', node.dataset.mgFocus === m.id))
  else if (m.type === 'place') {
    // 在预览里点了编号点位或拖了小吸：把位置写回这条规则，只重画左边
    const rule = mgGuide().rules.find(item => item.id === m.id)
    if (!rule) return
    rule.position = m.slot
    if (m.block && m.block !== rule.block) { rule.block = m.block; rule.block_name = mgLabel(mgBlocks(), m.block) || rule.block_name } // 拖到了别的区块上
    if (m.slot === 'custom') rule.offset = { x: m.rx, y: m.ry, s: m.so || 0 }
    else delete rule.offset
    mgRefreshMain()
  }
  else if (m.type === 'lead') { cfg.mgLead = { from: m.from, path: m.path, ability: m.ability === 'doc' ? '资料交付' : '留资' }; mgRefreshLead() }
  else if (m.type === 'lead-clear') { if (cfg.mgLead) { cfg.mgLead = null; mgRefreshLead() } }
})

/* ---------- 事件：由 agent-config.js 的 handleConfigClick / handleConfigChange 先交给这里 ---------- */

/** 只重画左边的配置区，不动右边的 iframe（整页重绘会让预览重新加载）。 */
function mgRefreshMain() {
  const root = document.querySelector('[data-mg-main]')
  const input = document.querySelector('[data-mg-url]')
  if (input) cfg.mgUrlInput = input.value // 网址没读之前不进草稿，重画时别把正在填的内容冲掉
  if (root) root.innerHTML = mgSections()
  refreshCfgChrome()
}

const mgOnPage = () => state.route === 'agent' && state.agentSection === 'acquisition' && cfg.capDetail === 'mascot_guide'

function mgHandleClick(event) {
  if (!mgOnPage()) return false
  const pick = selector => event.target.closest(selector)
  const g = mgGuide()
  let el
  if ((el = pick('[data-mg-toggle]'))) {
    const rule = g.rules[Number(el.dataset.mgToggle)]
    rule.enabled = !rule.enabled
    mgRefreshMain()
    mgPush(rule.enabled ? { focus: rule.id } : { play: 'follow' })
    return true
  }
  if ((el = pick('[data-mg-remove]'))) {
    g.rules.splice(Number(el.dataset.mgRemove), 1)
    mgRefreshMain()
    mgPush({ play: 'follow' })
    return true
  }
  if ((el = pick('[data-mg-ai]'))) {
    const rule = g.rules[Number(el.dataset.mgAi)]
    const tpl = mgGuide().page_url ? MG_SUGGEST[rule.kind] : null
    const options = tpl ? tpl.texts.map(text => text.replace('{name}', mgBlockName(rule)).slice(0, MG_MESSAGE_MAX)) : MG_REWRITES[rule.action] || []
    rule.message = options[(options.indexOf(rule.message) + 1) % options.length] || rule.message
    mgRefreshMain()
    mgPush({ focus: rule.id })
    return true
  }
  el = pick('[data-action]')
  const name = el?.dataset.action || ''
  if (name === 'cfg-mg-add') {
    if (g.rules.length >= MG_MAX_RULES) return true
    const first = mgBlocks()[0]
    const rule = first
      ? { id: `mg_${Date.now().toString(36)}`, enabled: true, ai: false, trigger: 'block', delay_seconds: 15, block: first[0], block_name: first[1], position: mgDefaultSlot(first[0]), action: 'explain', message: '想了解这块，可以直接问我', button_label: '问一问', ability: 'chat' }
      : { id: `mg_${Date.now().toString(36)}`, enabled: true, ai: false, trigger: 'delay', delay_seconds: 15, block: '', position: 'entry', action: 'greet', message: '有问题可以直接问我', button_label: '问一问', ability: 'chat' }
    g.rules.push(rule)
    cfg.mgActive = rule.id
    mgRefreshMain()
    mgPush({ focus: rule.id })
    return true
  }
  if (name === 'cfg-mg-read') { mgReadPage(); return true }
  if (name === 'cfg-mg-suggest') {
    const rules = mgSuggestRules(cfg.mgPage?.blocks || [])
    if (rules.length) { g.rules = rules; cfg.mgActive = rules[0].id; cfg.mgSlotFrom = {} }
    mgRefreshMain()
    mgPush({ play: 'follow' })
    return true
  }
  if (name === 'cfg-mg-sample') {
    // 改回示例官网：规则也换回示例官网的那几条（真实页面的规则指着的区块在示例官网里不存在）
    g.page_url = ''
    g.rules = JSON.parse(JSON.stringify(DEFAULT_MASCOT_GUIDE.rules))
    cfg.mgActive = g.rules[0].id
    cfg.mgUrlInput = ''; cfg.mgRead = null; cfg.mgPage = null; cfg.mgPageDown = ''; cfg.mgSlotFrom = {}
    const input = document.querySelector('[data-mg-url]')
    if (input) input.value = ''
    mgRefreshMain()
    mgPush({ play: 'follow' })
    return true
  }
  if (name === 'cfg-mg-play') { mgPush({ play: 'follow' }); return true }
  if (name === 'cfg-mg-dismiss') { mgPush({ play: 'dismiss' }); return true }
  // 点规则卡片的空白处或标题：展开它，并让右边只预览这一条
  if ((el = pick('[data-mg-focus]')) && !pick('input, textarea, select, button, a, label')) {
    if (cfg.mgActive !== el.dataset.mgFocus) { cfg.mgActive = el.dataset.mgFocus; mgRefreshMain() }
    mgPush({ focus: cfg.mgActive })
    return true
  }
  return false
}

function mgHandleChange(event) {
  if (!mgOnPage()) return false
  const target = event.target
  if (!target.matches('[data-bind^="mascot_guide."]')) return false
  if (target.matches('[data-mg-rerender]')) {
    // 下拉框改了会影响下面出现哪些字段：补上默认值后只重画左边
    setCfgValue(target.dataset.bind, target.value)
    const rule = mgGuide().rules.find(item => item.id === cfg.mgActive)
    if (rule) {
      // 换了出现条件或区块：站位回到这个区块的默认点位（手动位置是相对原来那个区块存的，不能沿用）
      if (rule.trigger === 'block' && !mgBlocks().some(item => item[0] === rule.block) && mgBlocks()[0]) rule.block = mgBlocks()[0][0]
      if (rule.trigger === 'block') rule.block_name = mgLabel(mgBlocks(), rule.block) || rule.block_name
      if (rule.trigger !== 'block') rule.position = 'entry'
      else if (target.dataset.bind.endsWith('.trigger') || target.dataset.bind.endsWith('.block')) rule.position = mgDefaultSlot(rule.block)
      if (rule.position !== 'custom') delete rule.offset
      if (rule.ability !== 'none' && !String(rule.button_label || '').trim()) rule.button_label = '了解一下'
    }
    mgRefreshMain()
    mgPush({ focus: cfg.mgActive })
    return true
  }
  // 数字输入框：这里直接收口到上下限（返回 true 之后不会再走通用的处理）
  if (target.dataset.clamp && target.value !== '') {
    const [min, max] = target.dataset.clamp.split(',').map(Number)
    const value = Math.min(max, Math.max(min, Number(target.value) || min))
    target.value = value
    setCfgValue(target.dataset.bind, value)
  }
  if (target.matches('[data-mg-replay]')) {
    // 次数上限这类设置要从头播一遍才看得出差别
    refreshCfgChrome()
    mgPush({ play: 'follow' })
    return true
  }
  if (target.matches('[data-mg-title]')) { mgRefreshMain(); mgPush({ focus: cfg.mgActive }); return true }
  return false
}

/** data-live="mascot" 的输入框每敲一个字都会走到这里：更新字数，并让右边跟着变。 */
function mgLiveRefresh(target) {
  if (target.dataset.live !== 'mascot') return
  if (target.dataset.mgCount) {
    const counter = target.closest('.cfg-field')?.querySelector('[data-mg-counter]')
    if (counter) counter.textContent = `${target.value.length} / ${MG_MESSAGE_MAX}`
  }
  clearTimeout(cfg.mgPushTimer)
  cfg.mgPushTimer = setTimeout(() => mgPush({ focus: cfg.mgActive }), 240)
}

// 网址输入框里按回车，等于点「读取页面」
document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || !event.target.matches?.('[data-mg-url]') || !mgOnPage()) return
  event.preventDefault()
  mgReadPage()
})
