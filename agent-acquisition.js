/*
 * 主动获客：按条件主动出现在访客面前的功能，从「能力」里单独拿出来成一类。
 * - 列表页：形象引导、留资弹窗、主动弹窗、沉默跟进、测评式营销、资料交付。
 *   除形象引导外，详情页沿用 agent-capabilities.js 里原有的实现，这里只换了入口。
 * - 形象引导详情页（按 11.20 评审结论）：
 *   1. 先填官网网址，读完页面直接生成一组「落点」（每个识别出的区块一个，最多 8 个）。
 *      区块只在后台用来定位，不暴露给用户；用户看到的只有「1 号落点 · 标题」。
 *   2. 出现条件整页统一：访客停在某个落点所在位置满几秒就出现，加上打扰上限。不再每条规则各配一个条件。
 *   3. 落点用左侧目录切换：点编号，右边预览跳过去，配置区只显示这一个落点；在右边滚动页面，目录高亮跟着变。
 *      没有开关，不要就删，要就加。
 *   4. 位置不再有「站在哪」下拉：系统先给一个推荐位置，用户在右边直接拖小吸调整（存相对区块的比例）。
 *   5. 按钮不再绑「能力」，单独配置：留资（字段在这里配）、二维码、资料（上传文件）、打开对话、不设按钮。
 *   右边是 mascot-preview.html（iframe），配置用 postMessage 传过去，改什么演什么。
 *   读页面要靠本地服务（dev-server.js 的 /api/page-snapshot）；没填网址或读不到时，用原型自带的示例官网。
 * 用哪个形象，在「外观 · 数字人」里选；这里只管它在哪出现、说什么、按钮做什么。
 * 数据里仍叫 rules（每个落点一条），省得动草稿 / 发布那一套。
 * 本文件在 agent-config.js 之前加载（草稿初始化要用 DEFAULT_MASCOT_GUIDE）；其余引用都在调用时才访问。
 */

const isAcquisitionCap = id => { const cap = CAPABILITIES.find(item => item.id === id); return Boolean(cap && capInAcquisition(cap)) }

// 没填网址时用示例官网的三个区块；填了网址，区块由预览页读完真实页面后报上来（见 mgBlocks）
const MG_BLOCKS = [['caps', '产品能力'], ['cases', '客户案例'], ['price', '版本与价格']]
// 系统给每个区块推荐的位置（预览页里的四个角之一）；正式版由后端看页面挑
const MG_DEFAULT_SLOT = { caps: 'tr', cases: 'br', price: 'tr' }
const MG_SLOTS = ['tl', 'tr', 'bl', 'br']
const MG_ACTIONS = [['greet', '打招呼'], ['explain', '讲解'], ['point', '指给访客看'], ['offer', '递资料']]
// 按钮点了之后做什么：单独配置，不复用「能力」
const MG_BUTTONS = [['lead', '留资'], ['qr', '二维码'], ['file', '资料'], ['chat', '打开对话'], ['none', '不设按钮']]
const MG_BUTTON_PREVIEW = { lead: 'form', qr: 'qr', file: 'doc', chat: 'chat', none: 'none' }
const MG_BUTTON_DEFAULT = { lead: '留个联系方式', qr: '加顾问微信', file: '领取资料', chat: '问一问', none: '' }
// 留资表单里手机号固定要填，其余可选
const MG_LEAD_FIELDS = [['name', '称呼'], ['company', '公司'], ['need', '需求']]
const MG_MESSAGE_MAX = 40
const MG_BUTTON_MAX = 8
const MG_MAX_POINTS = 8
const MG_PREVIEW_SRC = './mascot-preview.html?v=20261120-pts-1'
// 「让 AI 重写」在原型里是预设的几句轮换
const MG_REWRITES = {
  greet: ['嗨，我是小吸。往下看，我陪你一起', '你好呀，想了解哪块可以直接问我'],
  explain: ['这三块可以单独开，也能一起上。先看哪块的演示？', '设备、质量、经营三块数据能打通。要看演示吗？'],
  point: ['上面这家做汽配的，规模和你们接近。要完整案例集吗？', '这家月结从 3 天缩到 2 小时，案例集里有做法'],
  offer: ['报价和数据量有关。留个手机号，我把报价单发你', '想知道大概多少钱？留个手机号，报价单马上到']
}
// 读完页面后生成落点：按区块的类型（预览页根据标题里的词判断）套一句话术。
// 原型里话术是套模板；正式版由模型读区块内容来写。
const MG_SUGGEST = {
  hero: { action: 'greet', texts: ['嗨，我是小吸。想了解哪块，可以直接问我', '你好呀，往下看的时候有问题随时叫我'], button: 'chat' },
  caps: { action: 'explain', texts: ['想细看这块的话，我给你演示一遍', '这块我熟。要不要看看实际用起来什么样？', '这几项能单独用，也能一起上。先问哪个？'], button: 'chat' },
  cases: { action: 'point', texts: ['这里面有和你们同行的客户。留个手机号，案例集发你', '想看同行怎么用的？留个手机号，我把案例集发你'], button: 'lead' },
  price: { action: 'offer', texts: ['报价和用量有关。留个手机号，我把报价单发你', '想知道大概多少钱？留个手机号，报价单马上到'], button: 'lead' },
  form: { action: 'point', texts: ['不想填这么多？留个手机号，我帮你约演示', '留个手机号就行，我帮你把演示约上'], button: 'lead' },
  other: { action: 'explain', texts: ['这块有想问的，可以直接问我', '看到这儿有疑问的话，点一下我'], button: 'chat' }
}

/** 一个落点的默认按钮配置（各类按钮的设置都留着，切换按钮类型时不丢）。 */
const mgButtonDefaults = () => ({ lead_fields: { name: false, company: true, need: false }, lead_done: '收到，顾问会尽快联系你', lead_follow: '顺便问一句，你们大概多少人会用？我按规模帮你估个区间。', qr_image: '', qr_note: '扫码加顾问微信，案例集马上发你', file_name: '', file_gate: true })
const mgPoint = (id, block, name, action, message, ability, extra = {}) => ({ id, ai: true, block, block_name: name, name, position: MG_DEFAULT_SLOT[block] || 'tr', action, message, ability, button_label: MG_BUTTON_DEFAULT[ability], ...mgButtonDefaults(), ...extra })

const DEFAULT_MASCOT_GUIDE = {
  enabled: true, page_url: '', appear_after: 2, max_per_visit: 3, lead_rules_free: true, button_color_mode: 'brand', button_color: '#f27a1a',
  rules: [
    mgPoint('mg_caps', 'caps', '产品能力', 'explain', MG_REWRITES.explain[0], 'chat', { button_label: '看演示' }),
    mgPoint('mg_cases', 'cases', '客户案例', 'point', MG_REWRITES.point[0], 'qr', { button_label: '要案例集', qr_image: '顾问微信二维码.png' }),
    mgPoint('mg_price', 'price', '版本与价格', 'offer', MG_REWRITES.offer[0], 'lead', { button_label: '领取报价单' })
  ]
}

const mgGuide = () => C().mascot_guide
const mgLabel = (list, value) => list.find(item => item[0] === value)?.[1] || ''
/** 后台的区块：没填网址是示例官网的三个；填了网址是读页面识别出来的（还没读回来时，先用落点里记着的名字顶上）。 */
function mgBlocks() {
  const g = mgGuide()
  if (!g.page_url) return MG_BLOCKS
  if (cfg.mgPage?.url === g.page_url) return cfg.mgPage.blocks.map(block => [block.id, block.name])
  const seen = new Map()
  g.rules.forEach(rule => { if (rule.block_name) seen.set(rule.block, rule.block_name) })
  return [...seen]
}
const mgBlockInfo = id => (cfg.mgPage?.url === mgGuide().page_url ? cfg.mgPage.blocks : []).find(block => block.id === id)
/** 页面读回来了，但这个落点挂的区块在页面上找不到了（页面改版）：访客那边退回入口原位。 */
const mgBlockMissing = rule => Boolean(mgGuide().page_url) && cfg.mgPage?.url === mgGuide().page_url && !mgBlockInfo(rule.block)
const mgDefaultSlot = id => mgBlockInfo(id)?.slot || MG_DEFAULT_SLOT[id] || 'tr'
const mgNormalizeUrl = value => { const text = String(value || '').trim(); return !text ? '' : /^https?:\/\//i.test(text) ? text : `https://${text}` }
const mgPointName = (rule, index) => String(rule.name || '').trim() || `落点 ${index + 1}`

/** 老草稿换成落点的结构：每条都挂在一个区块上；出现条件、开关、站在哪下拉都去掉了；按钮不再绑能力。草稿、已保存、已发布三份一起改，不算改动。 */
function mgNormalize() {
  const oldAbility = { lead_capture: 'lead', asset_delivery: 'file', human_handoff: 'chat', recommendations: 'chat' }
  ;[cfg.draft, cfg.saved, cfg.published].forEach(d => {
    const g = d?.mascot_guide
    if (!g) return
    if (typeof g.page_url !== 'string') g.page_url = ''
    if (!Number(g.appear_after)) g.appear_after = 2
    if (!g.button_color_mode) g.button_color_mode = 'brand'
    if (!g.button_color) g.button_color = '#f27a1a'
    g.rules = (g.rules || []).filter(rule => !rule.trigger || rule.trigger === 'block') // 老的「停留几秒」规则不挂在任何位置上，去掉
    g.rules.forEach(rule => {
      ;['trigger', 'delay_seconds', 'enabled', 'page_label', 'page_pattern'].forEach(key => { delete rule[key] })
      if (oldAbility[rule.ability]) rule.ability = oldAbility[rule.ability]
      if (!MG_BUTTONS.some(item => item[0] === rule.ability)) rule.ability = 'chat'
      if (![...MG_SLOTS, 'custom'].includes(rule.position)) rule.position = MG_DEFAULT_SLOT[rule.block] || 'tr'
      if (rule.position !== 'custom') delete rule.offset
      if (!rule.name) rule.name = rule.block_name || mgLabel(MG_BLOCKS, rule.block) || ''
      const defaults = mgButtonDefaults()
      Object.keys(defaults).forEach(key => { if (rule[key] === undefined) rule[key] = defaults[key] })
    })
  })
}

/** 发布前的检查，接在 capIssues() 里。 */
function mgIssues(d = C()) {
  const g = d.mascot_guide
  if (!g?.enabled) return []
  const issues = []
  if (!g.rules.length) issues.push('形象引导：至少要有一个落点')
  g.rules.forEach((rule, index) => {
    const who = `形象引导「${index + 1} 号落点」`
    if (!String(rule.message || '').trim()) issues.push(`${who}：话术不能为空`)
    if (rule.ability !== 'none' && !String(rule.button_label || '').trim()) issues.push(`${who}：设了按钮就要写按钮文案`)
    if (rule.ability === 'qr' && !rule.qr_image) issues.push(`${who}：按钮是二维码，要先上传二维码图片`)
    if (rule.ability === 'file' && !rule.file_name) issues.push(`${who}：按钮是资料，要先上传资料文件`)
  })
  return issues
}

/* ---------- 列表页 ---------- */

function renderAcquisitionConfig() {
  if (cfg.capDetail && isAcquisitionCap(cfg.capDetail)) return renderCapabilitiesConfig()
  return cfgPage('acquisition', `${renderCfgHeader({ title: '主动获客', desc: '访客还没开口时，按页面上的行为主动出现，再用按钮把访客带到留资；测评、资料交付这类专门用来换线索的能力也在这里配。留资表单、转人工等对话里用的能力仍在「能力」里。' })}
    <section class="cfg-body">
      <div class="cfg-cap-grid">${renderCapabilityListCards('acquisition')}</div>
    </section>`)
}

/* ---------- 形象引导详情 ---------- */

/** 当前落点里，按钮那一类自己的设置。 */
function mgButtonConfig(rule, base) {
  if (rule.ability === 'lead') {
    return `<div class="cfg-field full"><label>访客要填的</label>
        <div class="mg-checks"><label class="console-checkbox"><input type="checkbox" checked disabled /><span>手机号（必填）</span></label>${MG_LEAD_FIELDS.map(([key, label]) => capCheck(`${base}.lead_fields.${key}`, label, 'data-mg-rerender="1"')).join('')}</div>
        <small>这里的表单单独配，不跟「留资」能力里的字段走：气泡里填的越少越好。</small></div>
      ${field('提交后显示', capInput(`${base}.lead_done`, 'maxlength="30" data-live="mascot"'), { full: true })}
      ${field('提交后追问', capTextarea(`${base}.lead_follow`, 2, 'maxlength="60" placeholder="留空就不追问" data-live="mascot"'), { full: true, help: '提交成功后，小吸在卡片里接着问这一句。访客回了，才展开对话窗，这一问一答带进对话里接着聊；留空则只显示上面的提示语。' })}`
  }
  if (rule.ability === 'qr') {
    return `<div class="cfg-field full"><label>二维码图片</label>${mgUpload(rule, 'qr', '上传二维码', '企业微信、个人微信、飞书都可以')}</div>
      ${field('二维码旁边的说明', capInput(`${base}.qr_note`, 'maxlength="24" data-live="mascot"'), { full: true })}`
  }
  if (rule.ability === 'file') {
    return `<div class="cfg-field full"><label>资料文件</label>${mgUpload(rule, 'file', '上传文件', 'PDF、PPT、Word，单个不超过 20 MB')}<small>资料具体怎么交付还在定，可能放二期；原型里先按「上传一个文件」做。</small></div>
      <div class="cfg-field full">${capCheck(`${base}.file_gate`, '先留手机号，再给资料', 'data-mg-rerender="1"')}</div>`
  }
  if (rule.ability === 'chat') return '<p class="mg-button-note">点了之后打开对话窗，并把这句话术作为第一条消息带进去。</p>'
  return ''
}

/** 原型里的「上传」：点一下当作传好了一个示例文件。 */
function mgUpload(rule, kind, label, help) {
  const name = kind === 'qr' ? rule.qr_image : rule.file_name
  return name
    ? `<div class="mg-upload is-done">${icon(kind === 'qr' ? 'qr' : 'file', 'sm')}<span>${esc(name)}</span><button type="button" class="cfg-btn sm ghost" data-action="cfg-mg-upload" data-mg-kind="${kind}">更换</button><button type="button" class="cfg-icon-btn" aria-label="删除" data-action="cfg-mg-unload" data-mg-kind="${kind}">${icon('close', 'sm')}</button></div>`
    : `<button type="button" class="mg-upload" data-action="cfg-mg-upload" data-mg-kind="${kind}">${icon('upload', 'sm')}<span><strong>${label}</strong><small>${help}</small></span></button>`
}

/** 当前落点的配置。 */
function mgPointForm(rule, index) {
  const base = `mascot_guide.rules.${index}`
  const custom = rule.position === 'custom'
  const g = mgGuide()
  return `<div class="mg-point-form">
      <div class="mg-point-head"><span class="mg-point-no">${index + 1}</span>${capInput(`${base}.name`, 'class="console-input" maxlength="20" aria-label="落点名称" placeholder="落点名称" data-mg-title="1"')}${rule.ai ? badge('info', 'AI 建议') : ''}${g.rules.length > 1 ? `<button type="button" class="cfg-icon-btn" aria-label="删除这个落点" title="删除这个落点" data-mg-remove="${index}">${icon('trash', 'sm')}</button>` : ''}</div>
      ${mgBlockMissing(rule) ? capNotice('<strong>页面上找不到这个落点的位置了。</strong>官网可能改版了，访客那边小吸会留在入口原位。可以删掉，或在右边把小吸拖到新位置。') : ''}
      <p class="mg-pos-hint">${icon('pointer', 'xs')}<span>${custom ? '位置是你拖过的。' : '位置是系统推荐的。'}在右边直接拖小吸就能调整。</span>${custom ? '<button type="button" class="cfg-btn sm ghost" data-action="cfg-mg-reset-pos">恢复推荐位置</button>' : ''}</p>
      <div class="cfg-form-grid">
        ${field('形象动作', capSelect(`${base}.action`, MG_ACTIONS, 'data-mg-rerender="1"'))}
        ${field('按钮点了之后', capSelect(`${base}.ability`, MG_BUTTONS, 'data-mg-rerender="1"'))}
        ${field('话术', `${capTextarea(`${base}.message`, 2, `maxlength="${MG_MESSAGE_MAX}" data-live="mascot" data-mg-count="1"`)}<div class="mg-tools"><small data-mg-counter>${String(rule.message || '').length} / ${MG_MESSAGE_MAX}</small><button type="button" class="cfg-btn sm ghost" data-mg-ai="${index}">${icon('spark', 'xs')}<span>让 AI 重写</span></button></div>`, { full: true })}
        ${rule.ability !== 'none' ? field('按钮文案', capInput(`${base}.button_label`, `maxlength="${MG_BUTTON_MAX}" placeholder="例如：领取报价单" data-live="mascot"`), { full: true }) : ''}
        ${mgButtonConfig(rule, base)}
      </div>
    </div>`
}

function mgSections() {
  mgNormalize()
  const d = C()
  const g = d.mascot_guide
  const a = d.appearance
  if (!g.rules.some(rule => rule.id === cfg.mgActive)) cfg.mgActive = g.rules[0]?.id || ''
  const humanOn = Boolean(a.entries.human.enabled)
  const option = mascotOptions.find(item => item.key === a.mascot)
  const mascotName = a.mascot === 'custom' ? '自定义形象' : option?.name || '形象'
  const mascotNote = !humanOn
    ? capNotice('<strong>外观里还没开启数字人入口。</strong>访客看不到形象，落点会改由主入口用普通气泡说同一句话；右边按开启后的效果演示。', '<button type="button" class="cfg-btn sm outline" data-agent-section="appearance">去外观开启</button>')
    : option?.animated ? '' : capNotice(`<strong>「${esc(mascotName)}」没有动作素材。</strong>访客看到的是静态形象加气泡；右边按小吸演示。`, '<button type="button" class="cfg-btn sm outline" data-agent-section="appearance">去外观更换</button>')
  const mascot = capSection('mascot_guide:mascot', '形象', humanOn && Boolean(option?.animated), false, `<div class="mg-mascot-row"><img alt="" src="${esc(mascotSrc(a.mascot, a.entries.human.accent))}" /><div><strong>${esc(mascotName)}</strong><small>${humanOn ? `数字人入口 · ${apEntrySummary('human', a)}` : '数字人入口未开启'}</small></div><button type="button" class="cfg-btn sm outline" data-agent-section="appearance">去外观更换</button></div>${mascotNote}`)

  const read = cfg.mgRead || {}
  const info = g.page_url && cfg.mgPage?.url === g.page_url ? cfg.mgPage : null
  const urlValue = cfg.mgUrlInput ?? g.page_url
  const pageState = read.status === 'loading'
    ? '<p class="mg-page-state">正在读取页面，找落点、算位置…</p>'
    : `${read.status === 'error' ? capNotice(`<strong>${esc(read.error)}</strong>`) : ''}${info
      ? `<p class="mg-page-state"><strong>${esc(info.title || info.url)}</strong>读完了，生成了 ${g.rules.length} 个落点，在下面逐个改。</p>
        <div class="mg-page-actions"><button type="button" class="cfg-btn sm outline" data-action="cfg-mg-suggest" ${info.blocks.length ? '' : 'disabled'}>${icon('spark', 'xs')}<span>重新生成落点</span></button><button type="button" class="cfg-btn sm ghost" data-action="cfg-mg-sample"><span>改回示例官网</span></button></div>`
      : g.page_url ? '<p class="mg-page-state">正在读取页面…</p>' : '<p class="mg-page-state">现在用的是原型自带的示例官网。</p>'}`
  const page = capSection('mascot_guide:page', '官网页面', Boolean(info), true, `<div class="cfg-field full"><label>页面网址</label>
      <div class="mg-url-row"><input class="console-input" type="url" inputmode="url" data-mg-url value="${esc(urlValue)}" placeholder="https://www.example.com/" ${read.status === 'loading' ? 'disabled' : ''} /><button type="button" class="cfg-btn sm primary" data-action="cfg-mg-read" ${read.status === 'loading' ? 'disabled' : ''}>读取页面</button></div>
      <small>读完会按页面内容生成落点和话术，现有落点会被替换。原型里话术按区块类型套模板，正式版由模型读页面内容来写。</small></div>
    ${pageState}`)

  const appear = capSection('mascot_guide:appear', '出现规则（整页统一）', true, false, `<div class="cfg-form-grid">
      <div class="cfg-field full"><label>什么时候出现</label><span class="proto-inline">访客停在某个落点所在的位置满 <input class="console-input" type="number" min="1" max="10" value="${g.appear_after}" data-bind="mascot_guide.appear_after" data-type="number" data-clamp="1,10" data-mg-replay="1" /> 秒，小吸跳过去说话</span><small>所有落点用同一个条件；页面在滚动、访客在输入时不算。</small></div>
      <div class="cfg-field"><label>每次访问最多主动出现</label><span class="proto-inline"><input class="console-input" type="number" min="1" max="8" value="${g.max_per_visit}" data-bind="mascot_guide.max_per_visit" data-type="number" data-clamp="1,8" data-mg-replay="1" /> 次</span></div>
      <div class="cfg-field"><label>按钮颜色</label><span class="proto-inline">${capSelect('mascot_guide.button_color_mode', [['brand', '跟随品牌色'], ['custom', '自定义']], 'class="console-select" data-mg-rerender="1"')}${g.button_color_mode === 'custom' ? `<input type="color" class="mg-color" value="${esc(g.button_color)}" data-bind="mascot_guide.button_color" data-live="mascot" aria-label="按钮颜色" />` : ''}</span></div>
      <div class="cfg-field full">${capCheck('mascot_guide.lead_rules_free', '带留资、二维码或资料按钮的落点不占次数', 'data-mg-replay="1"')}<small>不勾的话，次数用完后排在后面的留资落点不会出现。</small></div>
    </div>
    <ul class="lead-rules"><li>没设落点的地方，小吸不跳过去，待在入口原位。</li><li>同一个落点一次访问只出现一次。</li><li>访客关掉气泡后，本次访问不再主动出现；访客自己点形象，它照常回应。</li><li>已经留过联系方式的访客，不再出带留资、二维码或资料按钮的落点。</li></ul>`)

  const activeIndex = g.rules.findIndex(rule => rule.id === cfg.mgActive)
  const points = capSection('mascot_guide:points', `落点（${g.rules.length} / ${MG_MAX_POINTS}）`, !mgIssues().length, true, `<div class="mg-points">
      <nav class="mg-rail" aria-label="落点">
        ${g.rules.map((rule, index) => `<button type="button" class="mg-rail-num ${rule.id === cfg.mgActive ? 'is-active' : ''} ${mgBlockMissing(rule) ? 'is-missing' : ''}" data-mg-focus="${rule.id}" aria-label="${index + 1} 号落点：${esc(mgPointName(rule, index))}"><span>${index + 1}</span><em class="mg-rail-tip">${esc(mgPointName(rule, index))}</em></button>`).join('')}
        <button type="button" class="mg-rail-add" data-action="cfg-mg-add" aria-label="加一个落点" title="${g.rules.length >= MG_MAX_POINTS ? `最多 ${MG_MAX_POINTS} 个落点` : '在当前落点后面加一个'}" ${g.rules.length >= MG_MAX_POINTS ? 'disabled' : ''}>${icon('plus', 'sm')}</button>
      </nav>
      ${activeIndex >= 0 ? mgPointForm(g.rules[activeIndex], activeIndex) : '<p class="mg-empty">还没有落点。读取页面自动生成，或点左边的 + 加一个。</p>'}
    </div>
    <p class="mg-points-foot">鼠标放在编号上看落点名称；点编号，右边跳到那个位置。在右边滚动页面，编号高亮跟着变。</p>`)

  return `${page}${mascot}${appear}${points}`
}

function renderMgLead() {
  const lead = cfg.mgLead
  if (!lead) return ''
  return `<div class="proto-sales-card"><div class="proto-sales-head">${icon('user-check', 'sm')}<strong>销售在「线索」里看到的</strong>${badge('success', '新线索')}</div>
    <dl><div><dt>联系方式</dt><dd>138****1234</dd></div><div><dt>来源</dt><dd>形象引导 · ${esc(lead.from)}</dd></div><div><dt>浏览路径</dt><dd>${esc(lead.path)}</dd></div><div><dt>通过</dt><dd>${badge('info', esc(lead.ability))}</dd></div></dl>
    <small>线索带着是哪个落点带来的，数据分析里可以按落点比留资率。</small></div>`
}

function renderMascotGuideDetail(cap) {
  cfg.mgLead = null
  const preview = `<div class="mg-preview">
      <iframe class="mg-frame" data-mg-frame src="${MG_PREVIEW_SRC}" title="形象引导效果预览" scrolling="no"></iframe>
      <div class="popup-preview-actions"><button type="button" class="cfg-btn sm outline" data-action="cfg-mg-play">${icon('refresh', 'xs')}<span>从头播放</span></button><button type="button" class="cfg-btn sm ghost" data-action="cfg-mg-dismiss"><span>演示访客关掉气泡</span></button><small>点左边的编号只预览那个落点，这时可以直接拖小吸改位置；在这里滚动页面，左边跟着切到最近的落点。气泡里的按钮也可以点。</small></div>
      <div data-mg-lead></div>
    </div>`
  return cfgPage('cap-mascot_guide', `<div class="capability-workbench mg-workbench">
    <section class="capability-workbench-main">
      <div class="capability-workbench-scroll" data-keep-scroll="cfg-cap-mascot_guide-scroll">
        <section class="cfg-body">${capIssueNotices('mascot_guide')}<div class="capability-sections" data-mg-main>${mgSections()}</div></section>
      </div>
    </section>
    <aside class="capability-workbench-debug" aria-label="形象引导演示">${renderCapabilityDebugPanel(cap, '按左边的落点，演示访客一路往下看的过程。没填网址时用原型自带的示例官网。', preview, { title: '官网效果预览', restart: false })}</aside>
  </div>`)
}

/* ---------- 和预览页（iframe）通信 ---------- */

function mgPayload() {
  const d = C()
  const g = d.mascot_guide
  return {
    // 这个网址上次没读成（比如不是用本地服务打开的）：先按示例官网演，不反复去读
    page: { url: cfg.mgPageDown === g.page_url ? '' : g.page_url || '' },
    rules: g.rules.map((rule, index) => ({
      id: rule.id, on: Boolean(g.enabled), ai: Boolean(rule.ai), name: mgPointName(rule, index), no: index + 1,
      cond: 'block', sec: Number(g.appear_after) || 2, block: rule.block || 'caps',
      follow: true, slot: rule.position, from: null, rx: rule.offset?.x ?? null, ry: rule.offset?.y ?? null, so: rule.offset?.s || 0, act: rule.action,
      text: String(rule.message || ''), btn: rule.ability === 'none' ? '' : String(rule.button_label || ''), abil: MG_BUTTON_PREVIEW[rule.ability] || 'none',
      fields: MG_LEAD_FIELDS.filter(([key]) => rule.lead_fields?.[key]).map(item => item[1]), done: String(rule.lead_done || ''), follow: String(rule.lead_follow || '').trim(),
      qr: rule.qr_image || '', qrNote: String(rule.qr_note || ''), file: rule.file_name || '', gate: rule.file_gate !== false
    })),
    opt: { max: Number(g.max_per_visit) || 3, leadFree: Boolean(g.lead_rules_free), float: Boolean(d.appearance.entries.float.enabled), btnColor: g.button_color_mode === 'custom' ? g.button_color : '' }
  }
}

/** 按识别出的区块生成落点：每个区块一个，最多 8 个，话术按区块类型套模板。 */
function mgSuggestRules(blocks) {
  const stamp = Date.now().toString(36)
  const seen = {} // 同一类区块有好几个时，话术轮着用，别一模一样
  return blocks.slice(0, MG_MAX_POINTS).map(block => {
    const kind = MG_SUGGEST[block.kind] ? block.kind : 'other'
    const tpl = MG_SUGGEST[kind]
    const text = tpl.texts[(seen[kind] = (seen[kind] ?? -1) + 1) % tpl.texts.length]
    return { ...mgPoint(`mg_${stamp}_${block.id}`, block.id, block.name, tpl.action, text.slice(0, MG_MESSAGE_MAX), tpl.button), kind, position: block.slot || 'tr' }
  })
}

/** 页面重新读回来之后，把落点对到现在的区块上：编号对不上就按名字找；都找不到的留着，界面上标出来。 */
function mgRematch(blocks) {
  ;[cfg.draft, cfg.saved, cfg.published].forEach(d => (d?.mascot_guide?.rules || []).forEach(rule => {
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

/** 把当前配置发给预览页。focus：只预览这个落点；play：从头播放（follow）或演示关掉气泡（dismiss）。 */
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
      // 刚点的「读取页面」：记下网址，按区块生成落点替换现有的
      cfg.mgRead = null
      g.page_url = m.asked
      const rules = mgSuggestRules(cfg.mgPage.blocks)
      if (rules.length) { g.rules = rules; cfg.mgActive = rules[0].id }
      else cfg.mgRead = { status: 'error', error: '页面读到了，但没找到能放落点的地方，落点没有动。可以换一个页面试试。' }
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
  else if (m.type === 'inview') {
    // 在右边滚动页面，停在了另一个落点附近：左边切到那个落点（预览页那边已经摆好了，不用再推）
    if (m.id && m.id !== cfg.mgActive && mgGuide().rules.some(rule => rule.id === m.id)) { cfg.mgActive = m.id; mgRefreshMain() }
  }
  else if (m.type === 'place') {
    // 在预览里拖了小吸：把位置写回这个落点，只重画左边。拖到了别的区块上就挂到那个区块，名字不变
    const rule = mgGuide().rules.find(item => item.id === m.id)
    if (!rule) return
    rule.position = m.slot
    if (m.block && m.block !== rule.block) { rule.block = m.block; rule.block_name = mgLabel(mgBlocks(), m.block) || rule.block_name }
    if (m.slot === 'custom') rule.offset = { x: m.rx, y: m.ry, s: m.so || 0 }
    else delete rule.offset
    mgRefreshMain()
  }
  else if (m.type === 'lead') { cfg.mgLead = { from: m.from, path: m.path, ability: m.ability === 'doc' ? '资料' : '留资' }; mgRefreshLead() }
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
const mgActiveRule = () => mgGuide().rules.find(rule => rule.id === cfg.mgActive)

function mgHandleClick(event) {
  if (!mgOnPage()) return false
  const pick = selector => event.target.closest(selector)
  const g = mgGuide()
  let el
  if ((el = pick('[data-mg-remove]'))) {
    const index = Number(el.dataset.mgRemove)
    g.rules.splice(index, 1)
    cfg.mgActive = g.rules[Math.min(index, g.rules.length - 1)]?.id || ''
    mgRefreshMain()
    mgPush({ focus: cfg.mgActive })
    return true
  }
  if ((el = pick('[data-mg-ai]'))) {
    const rule = g.rules[Number(el.dataset.mgAi)]
    const tpl = g.page_url ? MG_SUGGEST[rule.kind] : null
    const options = tpl ? tpl.texts.map(text => text.slice(0, MG_MESSAGE_MAX)) : MG_REWRITES[rule.action] || []
    rule.message = options[(options.indexOf(rule.message) + 1) % options.length] || rule.message
    mgRefreshMain()
    mgPush({ focus: rule.id })
    return true
  }
  el = pick('[data-action]')
  const name = el?.dataset.action || ''
  if (name === 'cfg-mg-add') {
    if (g.rules.length >= MG_MAX_POINTS) return true
    // 加在当前落点后面，挂到同一个区块上，挑一个这个区块里还没人用的角；之后在右边拖到想要的位置
    const current = mgActiveRule()
    const block = current?.block || mgBlocks()[0]?.[0] || 'caps'
    const taken = g.rules.filter(rule => rule.block === block).map(rule => rule.position)
    const slot = [mgDefaultSlot(block), ...MG_SLOTS].find(key => !taken.includes(key)) || mgDefaultSlot(block)
    const baseName = current?.name || mgLabel(mgBlocks(), block) || '新落点'
    const rule = { ...mgPoint(`mg_${Date.now().toString(36)}`, block, `${baseName} · 2`, 'explain', '这块有想问的，可以直接问我', 'chat'), ai: false, position: slot }
    g.rules.splice(current ? g.rules.indexOf(current) + 1 : g.rules.length, 0, rule)
    cfg.mgActive = rule.id
    mgRefreshMain()
    mgPush({ focus: rule.id })
    return true
  }
  if (name === 'cfg-mg-reset-pos') {
    const rule = mgActiveRule()
    if (rule) { rule.position = mgDefaultSlot(rule.block); delete rule.offset }
    mgRefreshMain()
    mgPush({ focus: cfg.mgActive })
    return true
  }
  if (name === 'cfg-mg-upload' || name === 'cfg-mg-unload') {
    // 原型里不真的传文件：点上传当作传好了一个示例文件
    const rule = mgActiveRule()
    if (!rule) return true
    const kind = el.dataset.mgKind
    const sample = name === 'cfg-mg-unload' ? '' : kind === 'qr' ? '顾问微信二维码.png' : (rule.file_name === '产品白皮书.pdf' ? '客户案例集.pdf' : '产品白皮书.pdf')
    if (kind === 'qr') rule.qr_image = sample; else rule.file_name = sample
    mgRefreshMain()
    mgPush({ focus: rule.id })
    return true
  }
  if (name === 'cfg-mg-read') { mgReadPage(); return true }
  if (name === 'cfg-mg-suggest') {
    const rules = mgSuggestRules(cfg.mgPage?.blocks || [])
    if (rules.length) { g.rules = rules; cfg.mgActive = rules[0].id }
    mgRefreshMain()
    mgPush({ play: 'follow' })
    return true
  }
  if (name === 'cfg-mg-sample') {
    // 改回示例官网：落点也换回示例官网的那几个（真实页面的落点挂着的区块在示例官网里不存在）
    g.page_url = ''
    g.rules = JSON.parse(JSON.stringify(DEFAULT_MASCOT_GUIDE.rules))
    cfg.mgActive = g.rules[0].id
    cfg.mgUrlInput = ''; cfg.mgRead = null; cfg.mgPage = null; cfg.mgPageDown = ''
    const input = document.querySelector('[data-mg-url]')
    if (input) input.value = ''
    mgRefreshMain()
    mgPush({ play: 'follow' })
    return true
  }
  if (name === 'cfg-mg-play') { mgPush({ play: 'follow' }); return true }
  if (name === 'cfg-mg-dismiss') { mgPush({ play: 'dismiss' }); return true }
  // 点左边目录里的编号：切到这个落点，右边跳过去
  if ((el = pick('[data-mg-focus]'))) {
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
    // 下拉框、勾选框改了会影响下面出现哪些字段：补上默认值后只重画左边
    const rule = mgActiveRule()
    const before = rule?.ability
    setCfgValue(target.dataset.bind, readBoundValue(target))
    if (rule && target.dataset.bind.endsWith('.ability') && before !== rule.ability) {
      // 换了按钮类型：文案还是上一类的默认值（或空着）就换成这一类的默认值
      const label = String(rule.button_label || '').trim()
      if (!label || label === MG_BUTTON_DEFAULT[before]) rule.button_label = MG_BUTTON_DEFAULT[rule.ability]
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
    // 次数上限、出现条件这类设置要从头播一遍才看得出差别
    if (target.type === 'checkbox') setCfgValue(target.dataset.bind, target.checked)
    refreshCfgChrome()
    mgPush({ play: 'follow' })
    return true
  }
  if (target.matches('[data-mg-title]')) { setCfgValue(target.dataset.bind, readBoundValue(target)); mgRefreshMain(); mgPush({ focus: cfg.mgActive }); return true }
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
