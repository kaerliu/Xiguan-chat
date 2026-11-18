/*
 * 外观页：官网入口（数字人 / 悬浮入口 / 中间按键，可同时开启多个）、手机端入口、对话窗口、
 * 快捷按钮、显示设置；右侧预览（拖动定位、重叠提示、模拟主动消息与留资资料卡）；本页的保存与离开提示。
 * 对应《吸管 PRD｜外观》。官网侧边工具栏见 agent-toolbar.js，对话窗口本体见 agent-config.js 的 renderCfgWidget()。
 * 本文件在 agent-config.js 之前加载（草稿初始化时要用 defaultAppearance / normalizeAppearance）；
 * 对 cfg、esc、cfgField、icon、state、toast、renderApp 等的引用都在调用时才访问。
 */

const mascotOptions = [
  { key: 'headset', name: '耳麦顾问', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200"><ellipse cx="80" cy="193" rx="46" ry="6" fill="#000" opacity=".12"/><path d="M28 196c0-38 23-60 52-60s52 22 52 60z" fill="@C"/><path d="M64 138l16 22 16-22z" fill="#fff"/><rect x="70" y="114" width="20" height="26" rx="9" fill="#EDBE9C"/><circle cx="80" cy="84" r="40" fill="#F7D3B5"/><path d="M40 88C40 57 58 42 80 42s40 15 40 46c-8-16-22-25-40-25-16 0-30 8-40 25z" fill="#2B2A33"/><ellipse cx="66" cy="90" rx="4.5" ry="5.5" fill="#2B2A33"/><ellipse cx="94" cy="90" rx="4.5" ry="5.5" fill="#2B2A33"/><circle cx="58" cy="102" r="6" fill="#FF9C8A" opacity=".5"/><circle cx="102" cy="102" r="6" fill="#FF9C8A" opacity=".5"/><path d="M70 105q10 9 20 0" stroke="#2B2A33" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M37 90a43 43 0 0 1 86 0" stroke="#2B2A33" stroke-width="5" fill="none"/><rect x="31" y="80" width="13" height="24" rx="6.5" fill="@C"/><rect x="116" y="80" width="13" height="24" rx="6.5" fill="@C"/><path d="M37 102q2 18 25 18" stroke="#2B2A33" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="64" cy="120" r="4.5" fill="@C"/></svg>` },
  { key: 'robot', name: '智能机器人', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200"><ellipse cx="80" cy="193" rx="44" ry="6" fill="#000" opacity=".12"/><line x1="80" y1="24" x2="80" y2="42" stroke="#2B2A33" stroke-width="4" stroke-linecap="round"/><circle cx="80" cy="19" r="7" fill="@C"/><rect x="24" y="136" width="16" height="38" rx="8" fill="@C" opacity=".8"/><rect x="120" y="136" width="16" height="38" rx="8" fill="@C" opacity=".8"/><rect x="42" y="126" width="76" height="64" rx="24" fill="@C"/><circle cx="80" cy="157" r="10" fill="#fff" opacity=".85"/><rect x="20" y="70" width="10" height="26" rx="5" fill="@C"/><rect x="130" y="70" width="10" height="26" rx="5" fill="@C"/><rect x="28" y="40" width="104" height="86" rx="34" fill="#EEF1F5"/><rect x="40" y="54" width="80" height="56" rx="24" fill="#22262F"/><rect x="58" y="70" width="12" height="16" rx="6" fill="#7CF0D4"/><rect x="90" y="70" width="12" height="16" rx="6" fill="#7CF0D4"/><path d="M70 95q10 6 20 0" stroke="#7CF0D4" stroke-width="3" fill="none" stroke-linecap="round"/></svg>` },
  { key: 'buddy', name: '萌趣伙伴', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200"><ellipse cx="80" cy="193" rx="50" ry="6" fill="#000" opacity=".12"/><path d="M42 78 38 30l38 28z" fill="@C"/><path d="M118 78l4-48-38 28z" fill="@C"/><path d="M80 50c40 0 62 30 62 74s-26 64-62 64-62-20-62-64 22-74 62-74z" fill="@C"/><ellipse cx="80" cy="152" rx="36" ry="30" fill="#fff" opacity=".9"/><circle cx="62" cy="104" r="7" fill="#22262F"/><circle cx="98" cy="104" r="7" fill="#22262F"/><circle cx="64.5" cy="101.5" r="2.4" fill="#fff"/><circle cx="100.5" cy="101.5" r="2.4" fill="#fff"/><circle cx="49" cy="120" r="7" fill="#FF9C8A" opacity=".6"/><circle cx="111" cy="120" r="7" fill="#FF9C8A" opacity=".6"/><path d="M72 118q8 7 16 0" stroke="#22262F" stroke-width="3" fill="none" stroke-linecap="round"/></svg>` }
]
const mascotSrc = (key, color) => {
  if (key === 'custom') return cfg.draft.appearance.mascotImage
  const item = mascotOptions.find(option => option.key === key) || mascotOptions[0]
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.svg.replaceAll('@C', color))}`
}

const sizeTable = {
  sm: { launcher: 52, font: 16, offset: 4, bar: 58, control: 44, avatar: 34, mark: 32, promptFont: 13, sug: 34, sugFont: 13, gap: 8, pad: 6, mascot: 116 },
  md: { launcher: 60, font: 18, offset: 8, bar: 68, control: 52, avatar: 40, mark: 38, promptFont: 15, sug: 38, sugFont: 14, gap: 10, pad: 7, mascot: 144 },
  lg: { launcher: 68, font: 20, offset: 12, bar: 80, control: 64, avatar: 50, mark: 44, promptFont: 17, sug: 44, sugFont: 15, gap: 12, pad: 7, mascot: 172 }
}
const barLengths = { compact: 600, standard: 768, wide: 960 }
const shapeRadius = { circle: '50%', rounded: '18px', teardrop: '50% 50% 50% 12px' }

/* ---------- 数据：默认值、旧草稿迁移 ---------- */

/* 入口有三种，可以同时开启多个；数字人与卡通形象的配置项下周单独评审，这里保留原有的形象设置 */
const AP_ENTRIES = [
  { key: 'human', name: '数字人', short: '数字人', icon: 'user' },
  { key: 'float', name: '悬浮入口', short: '悬浮入口', icon: 'message' },
  { key: 'bar', name: '中间按键', short: '中间按键', icon: 'panel-bottom' }
]
const AP_ACCENTS = ['#2F7CF6', '#1A6384', '#123C35', '#1E5B4B', '#624A8E', '#FF6A00']
const AP_LIMITS = { quick: 12, quickText: 80, guides: 8, capsuleLabel: 12, barLabel: 20, barInput: 4000, greeting: 24, barQuick: 4 }
/* 预览用的页面尺寸；margin 是入口离上下边缘的最小距离（屏宽 600px 以下为 16px） */
const AP_PAGE = { desktop: { w: 1440, h: 810, margin: 24 }, mobile: { w: 390, h: 760, margin: 16 } }
const AP_SIZE_LABELS = { sm: '小', md: '标准', lg: '大' }
const AP_ICON_OPTIONS = [['question', '「问」字'], ['message', '对话图标'], ['avatar', '助手头像']]
const AP_SHAPE_OPTIONS = [['circle', '圆形'], ['rounded', '圆角方形'], ['teardrop', '水滴形']]
const AP_SIZE_OPTIONS = [['sm', '小'], ['md', '标准'], ['lg', '大']]

/* 官网：onboarding 时填的地址和抓取知识库时读到的主题色。主题色是入口强调色和对话窗口品牌主色的默认值。 */
const AP_SITE_FALLBACK = { url: 'https://www.example.com', theme: '#13795B' }
function apSite() {
  const onboarding = typeof state !== 'undefined' ? state.onboarding : null
  const theme = /^#[0-9a-f]{6}$/i.test(onboarding?.color || '') ? onboarding.color.toUpperCase() : AP_SITE_FALLBACK.theme
  return { url: onboarding?.website || AP_SITE_FALLBACK.url, theme }
}
/** 色板第一个是官网主题色。 */
const apSwatches = list => [apSite().theme, ...list.filter(color => color.toUpperCase() !== apSite().theme)]

let apSeq = 0
const apNewId = () => `qb_${Date.now().toString(36)}${(apSeq += 1)}`
const apClone = value => JSON.parse(JSON.stringify(value))
const apEntryName = key => AP_ENTRIES.find(item => item.key === key)?.name || '悬浮入口'
const apEntryShort = key => AP_ENTRIES.find(item => item.key === key)?.short || '悬浮入口'

function defaultAppearance() {
  const accent = apSite().theme
  return {
    entries: {
      human: { enabled: false, accent, size: 'md', side: 'right', offset: 24, y: 100 },
      float: { enabled: true, accent, size: 'md', side: 'right', offset: 24, y: 100 },
      bar: { enabled: false, accent, size: 'md', y: 100 }
    },
    entryOrder: ['float'], mainEntry: 'float',
    pulse: true,
    floatStyle: 'bubble', bubbleIcon: 'question', bubbleShape: 'teardrop', capsuleLabel: '', guides: [],
    barLabel: '', barLength: 'wide',
    mascot: 'headset', mascotGreeting: '', mascotFloat: true, mascotImage: '',
    // 手机端一期不单独配置样式，继承桌面端悬浮入口，只有位置单独存
    mobile: { side: 'right', offset: 16, y: 100 },
    toolbar: defaultToolbar(),
    name: '吸管 Chat', avatarImage: '',
    welcome: '你好，我是吸管 Chat 智能助手 👋 可以帮你了解产品功能、价格和部署方式。',
    primary: accent, paper: '#FFFFFF',
    quickButtons: [
      { id: 'qb_1', text: '吸管 Chat 能做什么？', tag: '产品功能', qa: '' },
      { id: 'qb_2', text: '怎么收费？', tag: '价格', qa: '' },
      { id: 'qb_3', text: '如何接入官网？', tag: '部署', qa: '' }
    ],
    // 技术支持标识一直显示，关闭属于付费解锁
    keepQuick: false, attribution: true, history: true, historyDays: 180
  }
}

/** 开启的入口按开启先后排；至少保留一个；主入口失效时换成最先开启的那个。 */
function apFixEntries(a) {
  const keys = AP_ENTRIES.map(item => item.key)
  let order = (Array.isArray(a.entryOrder) ? a.entryOrder : []).filter((key, index, list) => keys.includes(key) && a.entries[key]?.enabled && list.indexOf(key) === index)
  keys.forEach(key => { if (a.entries[key].enabled && !order.includes(key)) order.push(key) })
  if (!order.length) { a.entries.float.enabled = true; order = ['float'] }
  a.entryOrder = order
  if (!order.includes(a.mainEntry)) a.mainEntry = order[0]
  return a
}

const apClamp = (value, min, max, fallback) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback }

function normalizeAppearance(stored) {
  const base = defaultAppearance()
  if (!stored || typeof stored !== 'object') return base
  const s = { ...stored }
  if (s.bubbleIcon === 'chat') s.bubbleIcon = 'message'
  if (s.bubbleShape === 'drop') s.bubbleShape = 'teardrop'
  const next = { ...base, ...s }
  next.quickButtons = (Array.isArray(s.quickButtons) ? s.quickButtons : base.quickButtons).slice(0, AP_LIMITS.quick)
    .map((item, index) => ({ id: item?.id || `qb_${index + 1}`, text: String(item?.text ?? ''), tag: item?.tag || `quick_${index + 1}`, qa: item?.qa ?? '' }))
  if (!s.entries || typeof s.entries !== 'object') {
    // 旧版草稿：同一时间只有一个入口，侧边胶囊是单独的开关；气泡和胶囊现在合并成「悬浮入口」的两种样式
    const accent = /^#[0-9a-f]{6}$/i.test(s.accent || '') ? s.accent.toUpperCase() : base.entries.float.accent
    const entries = defaultAppearance().entries
    Object.values(entries).forEach(entry => { entry.accent = accent; entry.enabled = false })
    if (s.entry === 'human') entries.human.enabled = true
    if (s.entry === 'bar') entries.bar.enabled = true
    if (s.sideCapsule || !['human', 'bar'].includes(s.entry)) entries.float.enabled = true
    next.floatStyle = s.sideCapsule ? 'capsule' : 'bubble'
    if (s.sideCapsule) { entries.float.offset = apClamp(s.capsuleRight, 0, 600, 24); entries.float.y = apClamp(s.capsuleTop, 0, 100, 50) }
    next.entries = entries
    next.entryOrder = [s.entry === 'bubble' ? 'float' : s.entry, 'float']
    next.mainEntry = ['human', 'bar'].includes(s.entry) ? s.entry : 'float'
    const lines = String(s.capsuleGuides || '').split('\n').map(line => line.trim()).filter(Boolean)
    next.guides = lines.map(line => next.quickButtons.find(item => item.text.trim() === line)?.id).filter(Boolean)
    ;['entry', 'accent', 'sideCapsule', 'capsuleTop', 'capsuleRight', 'capsuleGuides'].forEach(key => { delete next[key] })
  } else {
    next.entries = Object.fromEntries(Object.keys(base.entries).map(key => [key, { ...base.entries[key], ...(s.entries[key] || {}) }]))
  }
  // 大小原来三种入口共用一个值，现在每个入口各存一个
  if (AP_SIZE_LABELS[s.size]) Object.keys(next.entries).forEach(key => { if (!s.entries?.[key]?.size) next.entries[key].size = s.size })
  Object.values(next.entries).forEach(entry => { if (!AP_SIZE_LABELS[entry.size]) entry.size = 'md' })
  next.mobile = { side: s.mobile?.side === 'left' ? 'left' : 'right', offset: apClamp(s.mobile?.offset, 0, 150, base.mobile.offset), y: apClamp(s.mobile?.y, 0, 100, base.mobile.y) }
  next.attribution = true
  ;['size', 'citations'].forEach(key => { delete next[key] })
  next.toolbar = normalizeToolbarDraft(s.toolbar)
  const ids = next.quickButtons.map(item => item.id)
  // 中间有一版存的是每行一条的文字，按文字找回对应的快捷按钮
  if (typeof next.guides === 'string') next.guides = next.guides.split('\n').map(line => line.trim()).filter(Boolean).map(line => next.quickButtons.find(item => item.text.trim() === line)?.id).filter(Boolean)
  next.guides = (Array.isArray(next.guides) ? next.guides : []).filter((id, index, list) => ids.includes(id) && list.indexOf(id) === index).slice(0, AP_LIMITS.guides)
  return apFixEntries(next)
}

const apA = () => cfg.draft.appearance
const apEnabledKeys = (a = apA()) => a.entryOrder.filter(key => a.entries[key]?.enabled)
const apMainAccent = (a = apA()) => a.entries[a.mainEntry]?.accent || a.primary
const apName = (a = apA()) => a.name.trim() || 'AI 助手'
const apGuideItems = (a = apA()) => a.guides.map(id => a.quickButtons.find(item => item.id === id)).filter(item => item && item.text.trim())
const apQuickShown = (a = apA()) => a.quickButtons.filter(item => item.text.trim())
/** 对话窗口从主入口所在的一侧打开；中间按键居中，原型里按贴右处理（PRD 待定）。 */
const apChatSide = (a = apA()) => (a.mainEntry === 'bar' ? 'right' : a.entries[a.mainEntry].side)

/* ---------- 本页的保存 ---------- */

let apSavedMemo = { source: null, value: '' }
function apSavedSnapshot() {
  if (apSavedMemo.source !== cfg.saved) apSavedMemo = { source: cfg.saved, value: JSON.stringify(JSON.parse(cfg.saved).appearance) }
  return apSavedMemo.value
}
const apDirty = () => JSON.stringify(cfg.draft.appearance) !== apSavedSnapshot()
const apOnPage = () => state.route === 'agent' && state.agentSection === 'appearance'

function apValidate() {
  const a = apA()
  const errors = {}
  if (!a.name.trim()) errors.name = '助手名称不能为空'
  if (!a.welcome.trim()) errors.welcome = '欢迎语不能为空'
  const emptyQuick = a.quickButtons.map((item, index) => (item.text.trim() ? -1 : index)).filter(index => index >= 0)
  if (emptyQuick.length) errors.quick = emptyQuick
  return errors
}

/** 外观页整页一个保存：只把外观写进草稿，别的页面的内容不动。返回是否保存成功。 */
function apSave({ silent = false } = {}) {
  const errors = apValidate()
  cfg.apErrors = errors
  if (Object.keys(errors).length) {
    cfg.accOpen = errors.name || errors.welcome ? 'window' : 'quick'
    cfg.previewSurface = 'chat'
    toast(errors.name || errors.welcome || `第 ${errors.quick[0] + 1} 个快捷按钮还没填「访客看到的问题」`, 'info')
    return false
  }
  const saved = JSON.parse(cfg.saved)
  saved.appearance = apClone(cfg.draft.appearance)
  cfg.saved = JSON.stringify(saved)
  cfgWrite(cfgStorageKeys.saved, saved)
  if (!silent) toast('外观已保存到草稿，发布后访客才看得到')
  return true
}

function apDiscard() {
  cfg.draft.appearance = JSON.parse(apSavedSnapshot())
  cfg.apTemplate = null
  cfg.apErrors = {}
  cfg.uploadError = ''
  // 正展开的入口被撤回成未开启时，改为展开主入口
  const a = cfg.draft.appearance
  if (a.entries[cfg.accOpen] && !a.entries[cfg.accOpen].enabled) cfg.accOpen = a.mainEntry
}

function renderApPageActions() {
  const dirty = apDirty()
  return `<span class="cfg-badge ${dirty ? 'warning' : 'success'}"><i class="cfg-dot"></i>${dirty ? '有未保存的改动' : '已保存'}</span>
    <button type="button" class="cfg-btn ghost" data-action="cfg-ap-discard" ${dirty ? '' : 'disabled'}>放弃改动</button>
    <button type="button" class="cfg-btn primary" data-action="cfg-ap-save" ${dirty ? '' : 'disabled'}>${icon('save', 'sm')}<span>保存</span></button>`
}

function refreshApChrome() {
  const node = document.querySelector('#ap-page-actions')
  if (node) node.innerHTML = renderApPageActions()
}

/** 有未保存的改动时拦住离开外观页的点击，问：保存、放弃或留在本页。 */
function apLeaveGuard(event) {
  if (!apOnPage() || cfg.apLeave || !apDirty()) return false
  const target = event.target.closest('[data-agent-section], [data-route], [data-action="open-personal"], [data-action="restart-onboarding"], [data-action="return-agent-overview"]')
  if (!target || target.dataset.agentSection === 'appearance') return false
  const attr = target.dataset.agentSection ? 'data-agent-section' : target.dataset.route ? 'data-route' : 'data-action'
  cfg.apLeave = { attr, value: target.getAttribute(attr), label: target.textContent.trim() }
  renderApp()
  return true
}

function apLeaveProceed() {
  const leave = cfg.apLeave
  cfg.apLeave = null
  renderApp()
  if (leave) document.querySelector(`[${leave.attr}="${CSS.escape(leave.value)}"]`)?.click()
}

function renderApLeaveModal() {
  if (!cfg.apLeave) return ''
  return `<div class="modal-backdrop" data-ap-leave="stay"><div class="modal" style="width:460px" role="dialog" aria-modal="true" aria-label="外观有未保存的改动"><div class="modal-head"><div><h2>外观有未保存的改动</h2><p>没保存的改动只留在外观页，带不到别的页面。</p></div></div>
    <div class="modal-foot"><button type="button" class="btn ghost" data-ap-leave="stay">留在本页</button><div><button type="button" class="btn" data-ap-leave="discard">放弃改动</button> <button type="button" class="btn primary" data-ap-leave="save">保存并离开</button></div></div></div></div>`
}

window.addEventListener('beforeunload', event => {
  if (typeof cfg === 'undefined' || !apOnPage() || !apDirty()) return
  event.preventDefault()
  event.returnValue = ''
})

/* ---------- 发布窗口里的外观差异 ---------- */

function apDiffSpecs() {
  const on = value => (value ? '开' : '关')
  const text = value => (String(value).trim() ? `「${String(value).trim()}」` : '留空')
  const pos = p => (p.side ? `${p.side === 'left' ? '贴左' : '贴右'} ${p.offset}px，纵向 ${p.y}%` : `居中，纵向 ${p.y}%`)
  const label = (options, value) => options.find(item => item[0] === value)?.[1] || value
  const entry = (key, title) => [
    { label: `${title} · 大小`, paths: [['entries', key, 'size']], fmt: a => AP_SIZE_LABELS[a.entries[key].size] },
    { label: `${title} · 强调色`, paths: [['entries', key, 'accent']], fmt: a => a.entries[key].accent },
    { label: `${title} · 位置`, paths: [['entries', key, 'side'], ['entries', key, 'offset'], ['entries', key, 'y']], fmt: a => pos(a.entries[key]) }
  ]
  return [
    { label: '开启的入口', paths: [['entryOrder'], ['entries', 'human', 'enabled'], ['entries', 'float', 'enabled'], ['entries', 'bar', 'enabled']], fmt: a => apEnabledKeys(a).map(apEntryName).join('、') },
    { label: '主入口', paths: [['mainEntry']], fmt: a => apEntryName(a.mainEntry) },
    { label: '呼吸提醒', paths: [['pulse']], fmt: a => on(a.pulse) },
    { label: '悬浮入口 · 样式', paths: [['floatStyle']], fmt: a => (a.floatStyle === 'capsule' ? '胶囊' : '气泡') },
    { label: '悬浮入口 · 图标', paths: [['bubbleIcon']], fmt: a => label(AP_ICON_OPTIONS, a.bubbleIcon) },
    { label: '悬浮入口 · 形状', paths: [['bubbleShape']], fmt: a => label(AP_SHAPE_OPTIONS, a.bubbleShape) },
    { label: '悬浮入口 · 竖排文案', paths: [['capsuleLabel']], fmt: a => text(a.capsuleLabel) },
    { label: '悬浮入口 · 滚动引导语', paths: [['guides']], fmt: a => `${a.guides.length} 条` },
    ...entry('float', '悬浮入口'),
    { label: '中间按键 · 按钮文案', paths: [['barLabel']], fmt: a => text(a.barLabel) },
    { label: '中间按键 · 长度', paths: [['barLength']], fmt: a => ({ compact: '短', standard: '中', wide: '长' }[a.barLength]) },
    ...entry('bar', '中间按键'),
    { label: '数字人 · 形象', paths: [['mascot'], ['mascotImage']] },
    { label: '数字人 · 招呼语', paths: [['mascotGreeting']], fmt: a => text(a.mascotGreeting) },
    { label: '数字人 · 待机浮动', paths: [['mascotFloat']], fmt: a => on(a.mascotFloat) },
    ...entry('human', '数字人'),
    { label: '手机端入口 · 位置', paths: [['mobile', 'side'], ['mobile', 'offset'], ['mobile', 'y']], fmt: a => pos(a.mobile) },
    { label: '官网侧边工具栏', paths: [['toolbar']], fmt: a => (a.toolbar.enabled ? `开，${a.toolbar.items.length} 个按钮` : '关') },
    { label: '助手头像', paths: [['avatarImage']], fmt: a => (a.avatarImage ? '自定义图片' : '名称首字') },
    { label: '助手名称', paths: [['name']], fmt: a => text(a.name) },
    { label: '欢迎语', paths: [['welcome']] },
    { label: '品牌主色', paths: [['primary']], fmt: a => a.primary },
    { label: '背景色', paths: [['paper']], fmt: a => a.paper },
    { label: '快捷按钮', paths: [['quickButtons']], fmt: a => `${a.quickButtons.length} 个` },
    { label: '首轮对话后继续显示快捷按钮', paths: [['keepQuick']], fmt: a => on(a.keepQuick) },
    { label: '查看聊天记录', paths: [['history']], fmt: a => on(a.history) },
    { label: '聊天记录保留天数', paths: [['historyDays']], fmt: a => `${a.historyDays} 天` }
  ]
}

/** 线上版本和草稿在外观上的差异，逐项列出；paths 相对 appearance。 */
function apDiffItems(online, draft) {
  const pick = (source, path) => path.reduce((value, key) => value?.[key], source)
  return apDiffSpecs().filter(spec => spec.paths.some(path => JSON.stringify(pick(online, path)) !== JSON.stringify(pick(draft, path)))).map(spec => {
    const before = spec.fmt ? spec.fmt(online) : ''
    const after = spec.fmt ? spec.fmt(draft) : ''
    return { label: spec.label, detail: before && after && before !== after ? `${before} → ${after}` : '内容有改动', paths: spec.paths.map(path => ['appearance', ...path]) }
  })
}

/* ---------- 左侧配置 ---------- */

function apSegment(path, options) {
  const value = getCfgValue(path)
  return `<div class="ap-seg" role="radiogroup">${options.map(([key, label]) => `<button type="button" role="radio" aria-checked="${value === key}" data-ap-seg="${path}" data-value="${key}">${label}</button>`).join('')}</div>`
}

/** 位置：横向记贴哪一边和到边的距离（px），纵向记页面高度的百分比。中间按键横向固定居中。 */
function apPositionFields(base, { horizontal = true, max = 600 } = {}) {
  const pos = getCfgValue(base)
  const x = horizontal
    ? cfgField(`横向 · 距${pos.side === 'left' ? '左' : '右'}边 <b data-range-label="${base}.offset">${pos.offset}</b>px`, `<div class="ap-pos-row">${apSegment(`${base}.side`, [['left', '贴左'], ['right', '贴右']])}<input type="range" min="0" max="${max}" step="2" value="${pos.offset}" data-bind="${base}.offset" data-type="number" data-live="preview" aria-label="到边的距离" /></div>`, { full: true })
    : cfgField('横向', '<p class="cfg-readonly">固定居中，只能调纵向</p>', { full: true })
  return `<div class="cfg-subgroup full"><strong>位置</strong></div>${x}
    ${cfgField(`纵向 · <b data-range-label="${base}.y">${pos.y}</b>%`, `<input type="range" min="0" max="100" step="1" value="${pos.y}" data-bind="${base}.y" data-type="number" data-live="preview" aria-label="纵向位置" />`, { full: true, help: '0% 在页面最上，100% 在最下。也可以在右侧预览里直接拖动入口。' })}`
}

const apPulseToggle = () => cfgToggle('appearance.pulse', '呼吸提醒', '入口右上角的红色感叹号和呼吸圈。悬浮入口和中间按键共用这一个开关。', { live: 'preview' })

const apSizeField = (key, help) => cfgField('大小', cfgSelect(`appearance.entries.${key}.size`, AP_SIZE_OPTIONS, { live: 'preview' }), { help })

function apFloatFields() {
  const a = apA()
  const bubble = a.floatStyle !== 'capsule'
  const quick = a.quickButtons.filter(item => item.text.trim())
  const full = a.guides.length >= AP_LIMITS.guides
  const guideList = quick.length
    ? `<div class="ap-checklist">${quick.map(item => { const checked = a.guides.includes(item.id); return `<label class="cfg-checkbox"><input type="checkbox" data-ap-guide-toggle="${esc(item.id)}" ${checked ? 'checked' : ''} ${!checked && full ? 'disabled' : ''} /><span>${esc(item.text)}</span></label>` }).join('')}</div>`
    : `<div class="cfg-empty">引导语从快捷按钮里选，现在还没有快捷按钮。<br /><button type="button" class="cfg-btn sm outline" data-acc="quick">去添加快捷按钮</button></div>`
  return `${cfgField('样式', apSegment('appearance.floatStyle', [['bubble', '气泡'], ['capsule', '胶囊']]), { full: true, help: '同一时间只显示一种；切换后位置、强调色、引导语都保留。' })}
    ${bubble
      ? `${cfgField('图标', cfgSelect('appearance.bubbleIcon', AP_ICON_OPTIONS, { live: 'preview' }))}${cfgField('形状', cfgSelect('appearance.bubbleShape', AP_SHAPE_OPTIONS, { live: 'preview' }))}`
      : cfgField('竖排文案', `<input value="${esc(a.capsuleLabel)}" maxlength="${AP_LIMITS.capsuleLabel}" placeholder="${esc(a.barLabel.trim() || apName(a))}" data-bind="appearance.capsuleLabel" data-live="preview" />`, { full: true, help: `${AP_LIMITS.capsuleLabel} 字以内，建议 2–6 字。留空时依次用中间按键的按钮文案、助手名称。` })}
    ${apSizeField('float', bubble ? '气泡直径 52 / 60 / 68px。' : '胶囊宽 58 / 66 / 74px。')}
    ${cfgColorField('强调色', 'appearance.entries.float.accent', apSwatches(AP_ACCENTS), '第一个色块是从官网读到的主题色。气泡和胶囊共用，文字和图标按对比度自动用白色或深色。')}
    ${apPositionFields('appearance.entries.float')}
    <div class="cfg-subgroup full"><strong>滚动引导语 · 已选 ${a.guides.length} / ${AP_LIMITS.guides}</strong></div>
    <div class="cfg-field full">${guideList}${quick.length ? '<small>3 条以内轮流高亮，超过 3 条每 2.8 秒向上滚一条，鼠标悬停时暂停。访客点一条，等于点对应的快捷按钮。</small>' : ''}</div>
    ${apPulseToggle()}`
}

function apBarFields() {
  const a = apA()
  const quick = apQuickShown(a).slice(0, AP_LIMITS.barQuick)
  return `${cfgField('按钮文案', `<input value="${esc(a.barLabel)}" maxlength="${AP_LIMITS.barLabel}" placeholder="${esc(apName(a))}" data-bind="appearance.barLabel" data-live="preview" />`, { full: true, help: `${AP_LIMITS.barLabel} 字以内，显示在输入栏右侧的按钮上；留空用助手名称。` })}
    ${cfgField('长度', cfgSelect('appearance.barLength', [['compact', '短'], ['standard', '中'], ['wide', '长']], { live: 'preview' }), { help: '最宽约 600 / 768 / 960px，屏幕不够宽时自动收窄。' })}
    ${apSizeField('bar', '高 58 / 68 / 80px。')}
    ${cfgColorField('强调色', 'appearance.entries.bar.accent', apSwatches(AP_ACCENTS), '')}
    ${apPositionFields('appearance.entries.bar', { horizontal: false })}
    <div class="cfg-subgroup full"><strong>快捷问题</strong></div>
    <div class="cfg-field full">${quick.length ? `<div class="ap-chips">${quick.map(item => `<span>${esc(item.text)}</span>`).join('')}</div>` : ''}<small>输入栏上方横向排列，只显示快捷按钮的前 ${AP_LIMITS.barQuick} 个，顺序和快捷按钮一致。<button type="button" class="ap-link" data-acc="quick">${quick.length ? '调整快捷按钮' : '去添加快捷按钮'}</button></small></div>
    ${apPulseToggle()}`
}

function apHumanFields() {
  const a = apA()
  const accent = a.entries.human.accent
  const cards = mascotOptions.map(item => `<button type="button" class="cfg-mascot-option" role="radio" aria-checked="${a.mascot === item.key}" data-mascot="${item.key}" title="${item.name}"><img alt="" src="${mascotSrc(item.key, accent)}" /><span>${item.name}</span></button>`).join('')
  const custom = a.mascotImage
  const busy = cfg.uploadBusy === 'mascot'
  const upload = `<label class="cfg-mascot-option is-upload" role="radio" aria-checked="${a.mascot === 'custom'}" aria-disabled="${busy}">${custom ? `<img src="${esc(custom)}" alt="" />` : `<span class="cfg-mascot-upload-icon">${icon('upload')}</span>`}<span>${busy ? '处理中…' : custom ? '自定义形象' : '上传形象'}</span><input class="cfg-file" type="file" accept="image/png,image/jpeg,image/webp" data-upload="mascot" ${busy ? 'disabled' : ''} /></label>`
  const customActions = a.mascot === 'custom' && custom ? '<div class="cfg-mascot-custom-actions"><button type="button" class="cfg-btn sm ghost" data-action="cfg-mascot-reset">移除自定义形象</button></div>' : ''
  return `<div class="cfg-notice info full"><span class="cfg-notice-icon">${icon('clock', 'sm')}</span><div>数字人（含卡通形象）和留资弹窗另开专项评审（11 月 19 日）。一期做动作动画加状态机，每个动作配一句气泡台词；这里先保留现有的形象设置。</div></div>
    ${cfgField('形象', `<div class="cfg-mascot-picker" role="radiogroup">${cards}${upload}</div>${customActions}${cfg.uploadError && !busy ? `<small class="cfg-error" role="alert">${esc(cfg.uploadError)}</small>` : ''}`, { full: true, help: '预设人物或动物形象；自定义形象建议用透明背景 PNG，原图不超过 4MB。' })}
    ${cfgField('招呼语', `<input value="${esc(a.mascotGreeting)}" maxlength="${AP_LIMITS.greeting}" placeholder="有问题随时问我" data-bind="appearance.mascotGreeting" data-live="preview" />`, { full: true, help: `${AP_LIMITS.greeting} 字以内；有主动消息时由主动消息替代。` })}
    ${cfgToggle('appearance.mascotFloat', '待机浮动', '', { live: 'preview' })}
    ${apSizeField('human', '高 116 / 144 / 172px。')}
    ${cfgColorField('强调色', 'appearance.entries.human.accent', apSwatches(AP_ACCENTS), '')}
    ${apPositionFields('appearance.entries.human')}`
}

function apMobileFields() {
  const a = apA()
  return `<div class="cfg-notice info full"><span class="cfg-notice-icon">${icon('monitor', 'sm')}</span><div>屏宽 760px 以下只显示一个气泡，样式跟桌面端悬浮入口一致${a.floatStyle === 'capsule' ? '（胶囊显示成气泡）' : ''}，这里只调位置。<button type="button" class="ap-link" data-ap-goto-float>去改悬浮入口</button></div></div>
    ${apPositionFields('appearance.mobile', { max: 150 })}`
}

function apWindowFields() {
  const a = apA()
  const errors = cfg.apErrors || {}
  const busy = cfg.uploadBusy === 'avatar'
  const avatar = `<div class="cfg-avatar-control"><span class="cfg-avatar-preview" style="--avatar-primary:${a.primary};--avatar-bg:${a.paper}">${a.avatarImage ? `<img src="${esc(a.avatarImage)}" alt="" />` : esc(Array.from(apName(a))[0])}</span><div class="cfg-avatar-copy"><strong>${a.avatarImage ? '已使用自定义头像' : '当前显示名称首字'}</strong><span>PNG、JPG、WebP，原图不超过 4MB，居中裁成方形。</span><div class="cfg-avatar-actions"><label class="cfg-btn sm outline ${busy ? 'is-disabled' : ''}">${icon('upload', 'xs')}<span>${busy ? '正在处理…' : a.avatarImage ? '更换头像' : '上传头像'}</span><input class="cfg-file" type="file" accept="image/png,image/jpeg,image/webp" data-upload="avatar" ${busy ? 'disabled' : ''} /></label>${a.avatarImage ? '<button type="button" class="cfg-btn sm ghost" data-action="cfg-avatar-reset">恢复成名称首字</button>' : ''}</div></div></div>${cfg.uploadError && !busy ? `<small class="cfg-error" role="alert">${esc(cfg.uploadError)}</small>` : ''}`
  const error = key => (errors[key] ? `<small class="cfg-error" role="alert">${errors[key]}</small>` : '')
  return `${cfgField('助手头像', avatar, { full: true, help: '入口上的头像也用这一张。' })}
    <div class="cfg-field full ${errors.name ? 'has-error' : ''}"><label>助手名称<i class="ap-required">必填</i></label>${cfgInput('appearance.name', { live: 'preview' })}${error('name')}</div>
    <div class="cfg-field full ${errors.welcome ? 'has-error' : ''}"><label>欢迎语<i class="ap-required">必填</i></label>${cfgTextarea('appearance.welcome', { live: 'preview' })}${error('welcome') || '<small>每次新会话的第一条消息。</small>'}</div>
    ${cfgColorField('品牌主色', 'appearance.primary', apSwatches(['#123C35', '#1E5B4B', '#266D5B', '#1A6384', '#7A4F35', '#624A8E']), '用于标题栏、访客消息、按钮。第一个色块是从官网读到的主题色。')}
    ${cfgColorField('背景色', 'appearance.paper', ['#FFFFFF', '#FBF8F1', '#F5F7F6', '#F2F6FA', '#FFF6F1', '#1F2937'], '用于对话区、快捷按钮、输入区，也是中间按键和主动消息气泡的底色。文字和边框颜色自动推算，深色背景会换成浅色文字。')}
    <small class="cfg-inline-hint full">窗口从主入口所在的一侧打开，最大 410×690px；屏宽 600px 以下全屏显示。输入框一期只支持文字。</small>`
}

function apQuickFields() {
  const a = apA()
  const errors = cfg.apErrors?.quick || []
  const barOn = a.entries.bar.enabled
  const qaOptions = [['', '不绑定 · 找同名 Q&A，没有就由 AI 回答'], ...cfg.sources.filter(item => item.type === 'qa').map(item => [String(item.id), `${item.meta === '固定答复' ? '固定' : '改写'} · ${item.name}`])]
  const count = text => Array.from(String(text)).length
  const rows = a.quickButtons.map((item, index) => {
    const bad = errors.includes(index)
    const tags = `${barOn && index < AP_LIMITS.barQuick ? '<span class="cfg-badge">中间按键显示</span>' : ''}${a.guides.includes(item.id) ? '<span class="cfg-badge">滚动引导语</span>' : ''}`
    return `<div class="ap-qb-row ${bad ? 'has-error' : ''}">
      <div class="ap-qb-top">${tags}<span class="ap-qb-tools">
        <button type="button" class="cfg-icon-btn" data-ap-qb-move="${index}:-1" aria-label="上移" ${index === 0 ? 'disabled' : ''}>${icon('arrow-up', 'sm')}</button>
        <button type="button" class="cfg-icon-btn" data-ap-qb-move="${index}:1" aria-label="下移" ${index === a.quickButtons.length - 1 ? 'disabled' : ''}>${icon('arrow-down', 'sm')}</button>
        <button type="button" class="cfg-icon-btn" data-ap-qb-remove="${index}" aria-label="删除快捷按钮：${esc(item.text)}">${icon('trash', 'sm')}</button></span></div>
      <div class="cfg-field"><label>访客看到的问题<i class="ap-required">必填</i><em data-ap-count="appearance.quickButtons.${index}.text">${count(item.text)} / ${AP_LIMITS.quickText}</em></label><input value="${esc(item.text)}" maxlength="${AP_LIMITS.quickText}" data-bind="appearance.quickButtons.${index}.text" data-live="preview" />${bad ? '<small class="cfg-error" role="alert">这一项必填</small>' : ''}</div>
      <div class="cfg-field"><label>绑定 Q&A</label>${cfgSelect(`appearance.quickButtons.${index}.qa`, qaOptions)}</div>
    </div>`
  }).join('')
  const atLimit = a.quickButtons.length >= AP_LIMITS.quick
  return `<div class="cfg-qb">
      <div class="cfg-qb-head"><small>绑定的 Q&A 是固定答复就直接返回，允许改写的作为首要依据。${barOn ? `中间按键取排在前面的 ${AP_LIMITS.barQuick} 个。` : ''}</small><button type="button" class="cfg-btn sm outline" data-action="cfg-qb-add" ${atLimit ? 'disabled' : ''}>${icon('plus', 'xs')}<span>${atLimit ? `已到 ${AP_LIMITS.quick} 个上限` : '添加快捷按钮'}</span></button></div>
      <div class="cfg-qb-list">${rows || '<div class="cfg-empty"><strong>还没有快捷按钮</strong><br />访客照常可以自己输入问题。</div>'}</div>
    </div>
    ${cfgToggle('appearance.keepQuick', '首轮对话后继续显示', '关：访客发出第一条消息后隐藏。开：每次回复后仍显示。', { live: 'preview' })}`
}

function apDisplayFields() {
  const a = apA()
  // 技术支持标识不能关；关闭属于付费解锁，按年收费
  const attribution = cfgToggle('appearance.attribution', '技术支持标识', '一直显示在对话窗口最下方，访客点击打开吸管接待产品首页。关闭需开通付费版（按年收费）。', {})
    .replace('type="checkbox"', 'type="checkbox" disabled')
    .replace('</strong>', '<span class="cfg-badge">付费可关闭</span></strong>')
  return `${attribution}
    ${cfgToggle('appearance.history', '查看聊天记录', '窗口顶部出现「查看历史消息」，按会话分段加载。没有历史记录的访客看不到这个入口。', { live: 'preview', rerender: true })}
    ${cfgField('聊天记录保留天数', `<input type="number" min="1" max="730" value="${a.historyDays}" data-bind="appearance.historyDays" data-type="number" data-clamp="1,730" ${a.history ? '' : 'disabled'} />`, { full: true, help: a.history ? '1–730 天。' : '开启「查看聊天记录」后生效。' })}`
}

function renderAccordionBody(key) {
  if (key === 'float') return apFloatFields()
  if (key === 'bar') return apBarFields()
  if (key === 'human') return apHumanFields()
  if (key === 'mobile') return apMobileFields()
  if (key === 'toolbar') return renderToolbarEditor()
  if (key === 'window') return apWindowFields()
  if (key === 'quick') return apQuickFields()
  return apDisplayFields()
}

function apEntrySummary(key, a) {
  const entry = a.entries[key]
  if (!entry.enabled) return '未开启'
  const where = key === 'bar' ? `居中 · 纵向 ${entry.y}%` : `${entry.side === 'left' ? '贴左' : '贴右'} ${entry.offset}px · 纵向 ${entry.y}%`
  if (key === 'float') return `${a.floatStyle === 'capsule' ? '胶囊' : '气泡'} · ${where}`
  return where
}

/** 主入口只在留资弹窗开启、并且开了两个以上入口时出现：资料卡和数字人的气泡只能从一个地方弹出。 */
function apShowMainEntry(a = apA()) {
  return apEnabledKeys(a).length > 1 && typeof isCapEnabled === 'function' && isCapEnabled('lead_popup')
}

function renderEntryPicker() {
  const a = apA()
  const enabled = apEnabledKeys(a)
  const showMain = apShowMainEntry(a)
  const rows = AP_ENTRIES.map(item => {
    const entry = a.entries[item.key]
    const main = entry.enabled && a.mainEntry === item.key && showMain
    return `<div class="ap-entry-row ${entry.enabled ? 'is-on' : ''}">
      <span class="ap-entry-icon">${icon(item.icon, 'sm')}</span>
      <span class="ap-entry-copy"><strong>${item.name}${main ? '<span class="cfg-badge success">主入口</span>' : ''}${item.key === 'human' ? '<span class="cfg-badge warning">专项评审</span>' : ''}</strong><small>${apEntrySummary(item.key, a)}</small></span>
      <button type="button" class="cfg-switch ${entry.enabled ? 'on' : ''}" role="switch" aria-checked="${entry.enabled}" aria-label="开启${item.name}" data-ap-entry-toggle="${item.key}"></button>
    </div>`
  }).join('')
  const mainField = showMain
    ? `<div class="cfg-form-grid compact">${cfgField('主入口', cfgSelect('appearance.mainEntry', enabled.map(key => [key, apEntryName(key)]), { rerender: true }), { full: true, help: '留资弹窗的资料卡从主入口旁边弹出，对话窗口从它所在的一侧打开。' })}</div>`
    : ''
  return `<section class="cfg-entry-picker" aria-label="官网入口"><div class="cfg-entry-picker-head"><strong>官网入口</strong><small>可以同时开启多个，已开启 ${enabled.length} 个</small></div>
    <div class="ap-entry-list">${rows}</div>${mainField}
  </section>`
}

/* 外观模板：预设几组常见组合，选了右侧预览直接变，再细调。颜色、文案、快捷按钮不动。 */
const AP_TEMPLATES = [
  { key: 'lead', name: '高留资率', note: '胶囊 + 引导语',
    apply: a => {
      Object.assign(a.entries.float, { enabled: true, side: 'right', offset: 24, y: 50 })
      a.entries.bar.enabled = false
      a.entries.human.enabled = false
      a.floatStyle = 'capsule'
      if (!a.capsuleLabel.trim()) a.capsuleLabel = '在线咨询'
      a.guides = a.quickButtons.filter(item => item.text.trim()).slice(0, 3).map(item => item.id)
      a.pulse = true
      a.entryOrder = ['float']
    } },
  { key: 'marketing', name: '高营销', note: '提问栏 + 气泡',
    apply: a => {
      Object.assign(a.entries.bar, { enabled: true, y: 100 })
      Object.assign(a.entries.float, { enabled: true, side: 'right', offset: 24, y: 100 })
      a.entries.human.enabled = false
      a.floatStyle = 'bubble'
      a.barLength = 'wide'
      a.pulse = true
      a.entryOrder = ['bar', 'float']
      a.mainEntry = 'float'
    } },
  { key: 'brand', name: '强品牌展示', note: '大号头像气泡',
    apply: a => {
      Object.assign(a.entries.float, { enabled: true, side: 'right', offset: 24, y: 100, size: 'lg', accent: a.primary })
      a.entries.bar.enabled = false
      a.entries.human.enabled = false
      a.floatStyle = 'bubble'
      a.bubbleIcon = 'avatar'
      a.bubbleShape = 'circle'
      a.guides = []
      a.pulse = false
      a.entryOrder = ['float']
    } }
]

function apTemplateThumb(key) {
  if (key === 'lead') return '<span class="ap-tpl-thumb"><i class="t-site"></i><i class="t-guide"></i><i class="t-guide is-2"></i><i class="t-capsule"></i></span>'
  if (key === 'marketing') return '<span class="ap-tpl-thumb"><i class="t-site"></i><i class="t-chip"></i><i class="t-chip is-2"></i><i class="t-bar"></i><i class="t-bubble"></i></span>'
  return '<span class="ap-tpl-thumb"><i class="t-site"></i><i class="t-bubble is-lg"></i></span>'
}

function renderTemplatePicker() {
  const accent = apMainAccent()
  return `<section class="ap-templates" aria-label="外观模板"><div class="cfg-entry-picker-head"><strong>外观模板</strong></div>
    <div class="ap-tpl-list" style="--tpl-accent:${accent}">${AP_TEMPLATES.map(item => `<button type="button" class="ap-tpl" data-ap-template="${item.key}" aria-pressed="${cfg.apTemplate === item.key}">${apTemplateThumb(item.key)}<strong>${item.name}</strong><small>${item.note}</small></button>`).join('')}</div>
  </section>`
}

function apApplyTemplate(key) {
  const template = AP_TEMPLATES.find(item => item.key === key)
  if (!template) return
  const a = apA()
  template.apply(a)
  apFixEntries(a)
  cfg.apTemplate = key
  cfg.accOpen = apEnabledKeys(a)[0]
  cfg.previewSurface = 'site'
  cfg.apChatOpen = false
  toast(`已套用「${template.name}」，可以继续细调；不满意点「放弃改动」`, 'info')
}

const AP_SECTION_SURFACE = { human: 'site', float: 'site', bar: 'site', mobile: 'mobile', toolbar: 'site', window: 'chat', quick: 'chat', display: 'chat' }

function renderAppearanceConfig() {
  const a = apA()
  const enabled = apEnabledKeys(a)
  // 开了哪些入口，才有哪些入口的配置；关掉的入口不出现在下面（配置留着，再开时还在）
  if (a.entries[cfg.accOpen] && !a.entries[cfg.accOpen].enabled) cfg.accOpen = null
  // 从上到下按配置频率排：已开启的入口 → 快捷按钮 → 对话窗口 → 官网侧边工具栏 → 显示设置 → 手机端入口
  const sections = [
    ...AP_ENTRIES.filter(item => a.entries[item.key].enabled).map(item => [item.key, item.name, apShowMainEntry(a) && a.mainEntry === item.key ? '主入口' : '']),
    ['quick', '快捷按钮', `${a.quickButtons.length} / ${AP_LIMITS.quick} 个`],
    ['window', '对话窗口', ''],
    ['toolbar', '官网侧边工具栏', a.toolbar.enabled ? `已开启 · ${a.toolbar.items.length} 个按钮` : '未开启'],
    ['display', '显示设置', ''],
    ['mobile', '手机端入口', '屏宽 760px 以下']
  ]
  const accordion = `<div class="cfg-accordion">${sections.map(([key, title, note]) => {
    const open = cfg.accOpen === key
    return `<section class="cfg-accordion-item" data-open="${open}"><button type="button" class="cfg-accordion-trigger" data-acc="${key}" aria-expanded="${open}"><span><strong>${title}</strong>${note ? `<small>${note}</small>` : ''}</span>${icon('chevron-down', 'sm')}</button>${open ? `<div class="cfg-accordion-body"><div class="cfg-form-grid compact">${renderAccordionBody(key)}</div></div>` : ''}</section>`
  }).join('')}</div>`
  const surface = cfg.previewSurface
  // 预览顺序：桌面端、对话窗口、手机端
  const tabs = [['site', 'monitor', '桌面端'], ['chat', 'message', '对话窗口'], ['mobile', 'panel-bottom', '手机端']]
  const sim = surface === 'chat'
    ? `<label class="ap-sim">模拟<select data-ap-human aria-label="模拟对话状态"><option value="" ${cfg.apHuman ? '' : 'selected'}>AI 接待</option><option value="1" ${cfg.apHuman ? 'selected' : ''}>人工接入</option></select></label><button type="button" class="cfg-btn sm ghost" data-action="cfg-chat-reset">${icon('rotate', 'xs')}<span>重置对话</span></button>`
    : `<label class="ap-sim">模拟<select data-ap-sim aria-label="模拟访客看到的状态">${[['', '平时'], ['proactive', '有主动消息'], ['lead', '弹出留资资料卡']].map(([key, label]) => `<option value="${key}" ${cfg.apSim === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`
  const stage = `<section class="cfg-preview-stage" aria-label="外观预览">
    <div class="cfg-preview-toolbar"><div class="cfg-surface-switch" role="tablist" aria-label="预览内容">${tabs.map(([key, iconName, label]) => `<button type="button" role="tab" aria-selected="${surface === key}" data-surface="${key}">${icon(iconName, 'xs')}${label}</button>`).join('')}</div>
      <span class="ap-overlap" id="ap-overlap" role="status" hidden></span>${sim}</div>
    <div id="cfg-preview-canvas" class="cfg-preview-canvas is-${surface}">${renderPreviewCanvas()}</div>
  </section>`
  return `<div class="cfg-page is-workbench">${renderCfgHeader({ title: '外观', desc: '改动点保存后进草稿，发布后访客才看得到。', actions: `<div class="ap-page-actions" id="ap-page-actions">${renderApPageActions()}</div>` })}
    ${renderToolbarPendingModal()}${renderApLeaveModal()}
    <div class="cfg-workbench"><aside class="cfg-controls" aria-label="外观配置"><div class="cfg-controls-scroll" data-keep-scroll="cfg-appearance-controls">${renderTemplatePicker()}${renderEntryPicker()}${accordion}</div></aside>${stage}</div>
  </div>`
}

/* ---------- 右侧预览 ---------- */

const apAccentVars = accent => `--xg-color:${accent};--xg-color-highlight:color-mix(in srgb,${accent} 72%,#fff);--xg-on-brand:${readableOn(accent)};--xg-shadow:color-mix(in srgb,${accent} 28%,transparent);--xg-shadow-soft:color-mix(in srgb,${accent} 14%,transparent)`
/** 深色背景自动换成浅色文字。 */
const apInk = paper => (readableOn(paper) === '#FFFFFF' ? '#F3F6F5' : '#102F2A')

function apPageVars(a) {
  return [
    `--xg-paper:${a.paper}`, `--xg-paper-raised:color-mix(in srgb,var(--xg-paper) 45%,${readableOn(a.paper) === '#FFFFFF' ? '#3A4352' : '#fff'})`, `--xg-ink:${apInk(a.paper)}`,
    '--xg-ink-muted:color-mix(in srgb,var(--xg-paper) 42%,var(--xg-ink))', '--xg-border:color-mix(in srgb,var(--xg-paper) 81%,var(--xg-ink))'
  ].join(';')
}

/** 每个入口各自的大小。 */
function apSizeVars(sizeKey, a) {
  const sz = sizeTable[sizeKey] || sizeTable.md
  return [
    `--xg-launcher-size:${sz.launcher}px`, `--xg-launcher-font-size:${sz.font}px`,
    `--xg-prompt-width:${barLengths[a.barLength]}px`, `--xg-prompt-bar-height:${sz.bar}px`, `--xg-prompt-control-height:${sz.control}px`,
    `--xg-prompt-avatar-size:${sz.avatar}px`, `--xg-prompt-mark-size:${sz.mark}px`, `--xg-prompt-font-size:${sz.promptFont}px`,
    `--xg-prompt-suggestion-height:${sz.sug}px`, `--xg-prompt-suggestion-font-size:${sz.sugFont}px`, `--xg-prompt-gap:${sz.gap}px`, `--xg-prompt-padding:${sz.pad}px`,
    `--xg-mascot-height:${sz.mascot}px`
  ].join(';') + ';'
}

const apInitial = a => (a.avatarImage ? `<img src="${esc(a.avatarImage)}" alt="" />` : esc(Array.from(apName(a))[0]))

/** 入口右上角：有未读或主动消息时显示红点（每个入口都有），平时按「呼吸提醒」显示感叹号。 */
function apBadge(pulse) {
  if (cfg.apSim) return '<span class="ap-unread" title="未读红点"></span>'
  return pulse ? '<span class="cfg-lp-attention">!</span>' : ''
}

function apBubbleHtml(a, iconKey) {
  const glyph = iconKey === 'message' ? `<span class="cfg-lp-icon">${icon('message')}</span>` : iconKey === 'avatar' ? `<span class="cfg-lp-icon is-avatar">${apInitial(a)}</span>` : '<span class="cfg-lp-icon is-question">问</span>'
  return `<div class="cfg-lp-bubble">${glyph}${apBadge(a.pulse)}</div>`
}

function apSimMaterial() {
  const rule = (cfg.draft.lead_popup?.rules || []).find(item => item.enabled && item.material?.title) || {}
  return { kind: rule.material?.kind || '白皮书', title: rule.material?.title || '制造业数字化白皮书' }
}
const apSimMessage = () => String(cfg.draft.proactive?.message || '').trim() || '看了一会儿了，需要我帮你对比方案吗？'

/** 主入口旁边的内容：主动消息气泡或留资资料卡；平时是悬浮入口的滚动引导语。 */
function apAside(key, a, main) {
  if (main && cfg.apSim === 'proactive') return `<div class="ap-aside"><div class="ap-proactive">${esc(apSimMessage())}</div></div>`
  if (main && cfg.apSim === 'lead') {
    const material = apSimMaterial()
    return `<div class="ap-aside"><div class="ap-leadcard ${key === 'bar' ? 'is-strip' : ''}"><span class="ap-leadcard-kind">${esc(material.kind)}</span><strong>${esc(material.title)}</strong><span class="ap-leadcard-cta">免费领取</span></div></div>`
  }
  if (key !== 'float') return ''
  const guides = apGuideItems(a)
  if (!guides.length) return ''
  return `<div class="ap-aside"><div class="ap-guides ${guides.length > 3 ? 'is-scroll' : ''}" data-ap-guides><div class="ap-guides-track">${guides.map((item, index) => `<button type="button" class="ap-guide ${index === 0 && guides.length <= 3 ? 'is-active' : ''}" data-ap-guide="${esc(item.id)}"><i>?</i><em>${esc(item.text)}</em></button>`).join('')}</div></div></div>`
}

function apEntryHtml(key, a) {
  const entry = a.entries[key]
  const main = entry.enabled && a.mainEntry === key
  const name = apName(a)
  let core = ''
  if (key === 'float') {
    core = a.floatStyle === 'capsule'
      ? `<div class="cfg-lp-side-tab"><span class="cfg-lp-avatar is-side"><span class="cfg-lp-avatar-media">${apInitial(a)}</span>${apBadge(a.pulse)}</span><span class="cfg-lp-side-label">${esc(a.capsuleLabel.trim() || a.barLabel.trim() || name)}</span></div>`
      : apBubbleHtml(a, a.bubbleIcon)
  } else if (key === 'bar') {
    const quick = apQuickShown(a).slice(0, AP_LIMITS.barQuick)
    core = `<div class="cfg-lp-entry">${quick.length ? `<span class="cfg-lp-suggestions">${quick.map(item => `<button type="button" data-ap-bar-q="${esc(item.id)}">${esc(item.text)}</button>`).join('')}</span>` : ''}
      <span class="cfg-lp-prompt"><span class="cfg-lp-mark">✦</span><input class="cfg-lp-input" maxlength="${AP_LIMITS.barInput}" placeholder="输入你的问题…" aria-label="输入你的问题" data-ap-bar-input /><button type="button" class="cfg-lp-submit" data-ap-bar-submit><span class="cfg-lp-avatar is-prompt"><span class="cfg-lp-avatar-media">${apInitial(a)}</span>${apBadge(a.pulse)}</span><span>${esc(a.barLabel.trim() || name)}</span></button></span></div>`
  } else {
    const greeting = main && cfg.apSim === 'proactive' ? apSimMessage() : main && cfg.apSim === 'lead' ? `送你一份${apSimMaterial().kind}` : a.mascotGreeting.trim() || '有问题随时问我'
    core = `<div class="cfg-lp-mascot ${a.mascotFloat ? 'is-animated' : ''}"><span class="cfg-lp-mascot-greeting">${esc(greeting)}</span><span class="ap-mascot-figure"><img class="cfg-lp-mascot-figure" alt="" draggable="false" src="${mascotSrc(a.mascot, entry.accent)}" />${apBadge(false)}</span></div>`
  }
  // 数字人的主动消息直接换掉招呼语，不再另外出气泡
  const aside = key === 'human' && cfg.apSim === 'proactive' ? '' : apAside(key, a, main)
  const side = key === 'bar' ? 'center' : entry.side
  const level = entry.y > 66 ? 'is-low' : entry.y < 34 ? 'is-high' : 'is-mid'
  const shape = key === 'float' ? `--xg-radius-launcher:${shapeRadius[a.bubbleShape]};` : ''
  return `<div class="ap-entry is-${side} ${level}" data-ap-entry="${key}" style="--ap-off:${entry.offset || 0}px;--ap-y:${entry.y / 100};${shape}${apSizeVars(entry.size, a)}${apAccentVars(entry.accent)}">${core}${aside}</div>`
}

function apChatHtml(a, device) {
  if (!cfg.apChatOpen) return ''
  return `<div class="ap-chat is-${device === 'mobile' ? 'full' : apChatSide(a)}"><div class="cfg-widget-root" data-widget-root data-widget-close-action="cfg-ap-chat-close">${renderCfgWidget({ closeAction: 'cfg-ap-chat-close' })}</div></div>`
}

const AP_SITE_SKELETON = '<div class="cfg-lp-site"><div class="cfg-lp-site-nav"><b></b><span></span><span></span><span></span><span></span></div><div class="cfg-lp-site-hero"><b></b><span></span><span></span><i></i></div><div class="cfg-lp-site-cards"><span></span><span></span><span></span></div></div>'

/** 桌面端预览显示用户填的官网，调位置时能看到官网已有的浮层和客服按钮；地址留空时用示意页。 */
function apSiteUrl() {
  if (cfg.apSiteUrl === undefined) cfg.apSiteUrl = apSite().url
  const value = String(cfg.apSiteUrl || '').trim()
  if (!value) return ''
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try { const url = new URL(candidate); return ['http:', 'https:'].includes(url.protocol) ? url.href : '' } catch { return '' }
}

function renderSitePreview() {
  const a = apA()
  const url = apSiteUrl()
  // 预览只显示已开启的入口
  const keys = AP_ENTRIES.map(item => item.key).filter(key => a.entries[key].enabled)
  const site = url
    ? `${AP_SITE_SKELETON}<iframe class="ap-site-frame" src="${esc(url)}" title="官网预览" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>`
    : AP_SITE_SKELETON
  const address = `<input class="ap-address" value="${esc(cfg.apSiteUrl || '')}" placeholder="填官网地址，在真实页面上调位置" aria-label="官网地址" data-ap-siteurl title="有的官网不允许被嵌入，会显示空白，这时清空地址改看示意页" />${url ? '<button type="button" class="ap-address-btn" data-ap-siteurl-clear>示意页</button>' : ''}`
  return `<div class="cfg-lp is-bare"><div class="cfg-lp-browser"><div class="cfg-lp-chrome"><i></i><i></i><i></i>${address}</div>
    <div class="cfg-lp-viewport"><div class="cfg-lp-page" data-ap-page="desktop" data-ap-margin="${AP_PAGE.desktop.margin}" style="--ap-m:${AP_PAGE.desktop.margin}px;${apPageVars(a)}">${site}${keys.map(key => apEntryHtml(key, a)).join('')}${renderToolbarPreview(a.toolbar)}${apChatHtml(a, 'desktop')}</div></div></div></div>`
}

/** 手机端继承桌面端悬浮入口的样式，只有位置单独存。 */
function renderMobilePreview() {
  const a = apA()
  const m = a.mobile
  const float = a.entries.float
  const aside = cfg.apSim === 'proactive' ? `<div class="ap-aside"><div class="ap-proactive">${esc(apSimMessage())}</div></div>` : cfg.apSim === 'lead' ? apAside('float', a, true) : ''
  const level = m.y > 66 ? 'is-low' : m.y < 34 ? 'is-high' : 'is-mid'
  const entry = `<div class="ap-entry is-${m.side} ${level}" data-ap-entry="mobile" style="--ap-off:${m.offset}px;--ap-y:${m.y / 100};--xg-radius-launcher:${shapeRadius[a.bubbleShape]};${apSizeVars(float.size, a)}${apAccentVars(float.accent)}">${apBubbleHtml({ ...a, pulse: false }, a.bubbleIcon)}${aside}</div>`
  return `<div class="ap-phone"><div class="ap-phone-screen"><div class="cfg-lp-page ap-page-mobile" data-ap-page="mobile" data-ap-margin="${AP_PAGE.mobile.margin}" style="--ap-m:${AP_PAGE.mobile.margin}px;${apPageVars(a)}"><div class="ap-mobile-site"><div class="ap-mobile-nav"><b></b><i></i></div><b></b><span></span><span></span><em></em><div></div><div></div></div>${entry}${apChatHtml(a, 'mobile')}</div></div></div>`
}

function renderPreviewCanvas() {
  if (cfg.previewSurface === 'chat') return `<div class="cfg-chat-preview" data-widget-root>${renderCfgWidget()}</div>`
  return cfg.previewSurface === 'mobile' ? renderMobilePreview() : renderSitePreview()
}

/** 两个入口的位置重叠时在预览上方提示，不拦截保存。 */
function apCheckOverlap() {
  const node = document.querySelector('#ap-overlap')
  if (!node) return
  const entries = [...document.querySelectorAll('[data-ap-page="desktop"] .ap-entry')].map(el => ({ name: apEntryShort(el.dataset.apEntry), rect: el.getBoundingClientRect() }))
  // 侧边工具栏不算入口，但和入口叠在一起时也提醒
  const toolbar = document.querySelector('[data-ap-page="desktop"] .cfg-st')
  if (toolbar) entries.push({ name: '侧边工具栏', rect: toolbar.getBoundingClientRect() })
  const pairs = []
  entries.forEach((one, index) => entries.slice(index + 1).forEach(other => {
    const hit = one.rect.left < other.rect.right && other.rect.left < one.rect.right && one.rect.top < other.rect.bottom && other.rect.top < one.rect.bottom
    if (hit) pairs.push(`${one.name}和${other.name}`)
  }))
  node.hidden = !pairs.length
  node.textContent = pairs.length ? `${pairs.join('、')}位置重叠，可以拖开，不影响保存` : ''
  node.title = node.textContent
}

function fitSitePreview() {
  document.querySelectorAll('.cfg-lp-viewport').forEach(viewport => {
    const page = viewport.querySelector('.cfg-lp-page')
    if (page && viewport.clientWidth) page.style.transform = `scale(${viewport.clientWidth / AP_PAGE.desktop.w})`
  })
  document.querySelectorAll('.ap-phone-screen').forEach(screen => {
    const canvas = screen.closest('.cfg-preview-canvas')
    const page = screen.querySelector('.cfg-lp-page')
    if (!canvas || !page) return
    const scale = Math.min(1, Math.max(0.4, (canvas.clientHeight - 64) / AP_PAGE.mobile.h))
    screen.style.width = `${AP_PAGE.mobile.w * scale}px`
    screen.style.height = `${AP_PAGE.mobile.h * scale}px`
    page.style.transform = `scale(${scale})`
  })
  positionToolbarPanels()
  apCheckOverlap()
}
window.addEventListener('resize', fitSitePreview)

function refreshAppearancePreview() {
  const canvas = document.querySelector('#cfg-preview-canvas')
  if (!canvas) return
  canvas.className = `cfg-preview-canvas is-${cfg.previewSurface}`
  canvas.innerHTML = renderPreviewCanvas()
  fitSitePreview()
}

// 滚动引导语：3 条以内轮流高亮；超过 3 条每 2.8 秒向上滚一条，鼠标悬停时暂停
setInterval(() => {
  document.querySelectorAll('[data-ap-guides]').forEach(box => {
    const track = box.firstElementChild
    const rows = [...track.children]
    if (rows.length < 2 || box.matches(':hover')) return
    if (rows.length <= 3) {
      const current = rows.findIndex(node => node.classList.contains('is-active'))
      rows.forEach((node, index) => node.classList.toggle('is-active', index === (current + 1) % rows.length))
      return
    }
    track.classList.add('is-moving')
    setTimeout(() => { if (track.isConnected) { track.appendChild(track.firstElementChild); track.classList.remove('is-moving') } }, 420)
  })
}, 2800)

/* ---------- 预览里拖动入口 ---------- */

let apDrag = null
let apSuppressClick = false

function apEntryPos(key) { return key === 'mobile' ? apA().mobile : apA().entries[key] }

document.addEventListener('pointerdown', event => {
  if (event.button !== 0 || typeof cfg === 'undefined') return
  const el = event.target.closest?.('.ap-entry')
  const page = el?.closest('[data-ap-page]')
  if (!el || !page || event.target.closest('.ap-aside')) return
  const scale = page.getBoundingClientRect().width / page.offsetWidth
  const rect = el.getBoundingClientRect()
  apDrag = { el, page, key: el.dataset.apEntry, scale, startX: event.clientX, startY: event.clientY, grabX: (event.clientX - rect.left) / scale, grabY: (event.clientY - rect.top) / scale, width: rect.width / scale, height: rect.height / scale, moved: false }
})

document.addEventListener('pointermove', event => {
  const drag = apDrag
  if (!drag) return
  if (!drag.moved) {
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return
    drag.moved = true
    drag.el.classList.add('is-dragging')
    drag.page.classList.add('is-dragging-entry')
    try { drag.el.setPointerCapture(event.pointerId) } catch {}
    document.activeElement?.blur?.()
    window.getSelection()?.removeAllRanges()
  }
  event.preventDefault()
  const pageRect = drag.page.getBoundingClientRect()
  const W = drag.page.offsetWidth
  const H = drag.page.offsetHeight
  const margin = Number(drag.page.dataset.apMargin) || 24
  const pos = apEntryPos(drag.key)
  const left = Math.min(Math.max((event.clientX - pageRect.left) / drag.scale - drag.grabX, 0), Math.max(0, W - drag.width))
  const top = (event.clientY - pageRect.top) / drag.scale - drag.grabY
  const room = H - margin * 2 - drag.height
  pos.y = room > 0 ? Math.round(Math.min(Math.max((top - margin) / room, 0), 1) * 100) : 100
  if (drag.key !== 'bar') {
    // 拖过页面中线时自动换成贴另一边
    pos.side = left + drag.width / 2 < W / 2 ? 'left' : 'right'
    pos.offset = Math.round(pos.side === 'left' ? left : W - left - drag.width)
    drag.el.classList.toggle('is-left', pos.side === 'left')
    drag.el.classList.toggle('is-right', pos.side === 'right')
    drag.el.style.setProperty('--ap-off', `${pos.offset}px`)
  }
  drag.el.style.setProperty('--ap-y', pos.y / 100)
  drag.el.classList.toggle('is-low', pos.y > 66)
  drag.el.classList.toggle('is-high', pos.y < 34)
  drag.el.classList.toggle('is-mid', pos.y >= 34 && pos.y <= 66)
  apCheckOverlap()
  refreshCfgChrome()
})

function apEndDrag() {
  const drag = apDrag
  apDrag = null
  drag?.page.classList.remove('is-dragging-entry')
  if (!drag?.moved) return
  apSuppressClick = true
  setTimeout(() => { apSuppressClick = false; renderApp() }, 0)
}
document.addEventListener('pointerup', apEndDrag)
document.addEventListener('pointercancel', apEndDrag)

/* ---------- 事件 ---------- */

function apToggleEntry(key) {
  const a = apA()
  const entry = a.entries[key]
  if (entry.enabled) {
    if (apEnabledKeys(a).length === 1) { toast('至少保留一个入口，访客才能打开对话', 'info'); return }
    entry.enabled = false
    a.entryOrder = a.entryOrder.filter(item => item !== key)
    if (a.mainEntry === key) { a.mainEntry = a.entryOrder[0]; toast(`主入口换成了「${apEntryName(a.mainEntry)}」`, 'info') }
  } else {
    entry.enabled = true
    a.entryOrder.push(key)
  }
  apFixEntries(a)
}

function apOpenChatWith(text, options) {
  cfg.apChatOpen = true
  refreshAppearancePreview()
  if (text) cfgAsk(text, options)
  else requestAnimationFrame(() => document.querySelector('.ap-chat #cfg-widget-input')?.focus())
}

/** 外观页的点击；返回 true 表示已处理。 */
function apHandleClick(event) {
  const pick = selector => event.target.closest(selector)
  let el
  if (apSuppressClick && pick('[data-ap-page]')) return true
  if ((el = pick('[data-ap-leave]'))) {
    if (el.matches('.modal-backdrop') && event.target !== el) return true
    const choice = el.dataset.apLeave
    if (choice === 'stay') { cfg.apLeave = null; renderApp(); return true }
    if (choice === 'save' && !apSave({ silent: true })) { cfg.apLeave = null; renderApp(); return true }
    if (choice === 'discard') apDiscard()
    apLeaveProceed()
    return true
  }
  if ((el = pick('[data-ap-template]'))) { apApplyTemplate(el.dataset.apTemplate); renderApp(); return true }
  if ((el = pick('[data-ap-goto-float]'))) {
    const a = apA()
    if (!a.entries.float.enabled) apToggleEntry('float')
    cfg.accOpen = 'float'
    cfg.previewSurface = 'site'
    renderApp()
    return true
  }
  if (pick('[data-ap-siteurl-clear]')) { cfg.apSiteUrl = ''; refreshAppearancePreview(); return true }
  if (pick('[data-ap-siteurl]')) return true
  if ((el = pick('[data-ap-entry-toggle]'))) {
    const key = el.dataset.apEntryToggle
    apToggleEntry(key)
    // 刚开启的入口，直接展开它的配置并切到桌面端预览
    if (apA().entries[key].enabled) { cfg.accOpen = key; cfg.previewSurface = 'site' }
    cfg.uploadError = ''
    renderApp()
    return true
  }
  if ((el = pick('[data-acc]'))) {
    const key = el.dataset.acc
    cfg.accOpen = cfg.accOpen === key && el.matches('.cfg-accordion-trigger') ? null : key
    if (cfg.accOpen) cfg.previewSurface = AP_SECTION_SURFACE[key] || 'site'
    cfg.uploadError = ''
    renderApp()
    return true
  }
  if ((el = pick('[data-surface]'))) { cfg.previewSurface = el.dataset.surface; cfg.apChatOpen = false; renderApp(); return true }
  if ((el = pick('[data-ap-seg]'))) { setCfgValue(el.dataset.apSeg, el.dataset.value); renderApp(); return true }
  if ((el = pick('[data-mascot]'))) { apA().mascot = el.dataset.mascot; cfg.uploadError = ''; renderApp(); return true }
  if ((el = pick('[data-ap-qb-remove]'))) {
    const a = apA()
    const [removed] = a.quickButtons.splice(Number(el.dataset.apQbRemove), 1)
    if (removed && a.guides.includes(removed.id)) { a.guides = a.guides.filter(id => id !== removed.id); toast('这个按钮同时从滚动引导语里移除了', 'info') }
    cfg.apErrors = {}
    renderApp()
    return true
  }
  if ((el = pick('[data-ap-qb-move]'))) {
    const [index, step] = el.dataset.apQbMove.split(':').map(Number)
    const a = apA()
    const list = a.quickButtons
    const [item] = list.splice(index, 1)
    list.splice(index + step, 0, item)
    // 滚动引导语跟着快捷按钮的顺序走
    a.guides = list.map(button => button.id).filter(id => a.guides.includes(id))
    cfg.apErrors = {}
    renderApp()
    return true
  }
  // 预览里的入口：点一下打开对话窗口，再点收起
  if ((el = pick('[data-ap-guide]'))) { const item = apA().quickButtons.find(button => button.id === el.dataset.apGuide); if (item) apOpenChatWith(item.text, { button: true }); return true }
  if ((el = pick('[data-ap-bar-q]'))) { const item = apA().quickButtons.find(button => button.id === el.dataset.apBarQ); if (item) apOpenChatWith(item.text, { button: true }); return true }
  if ((el = pick('[data-ap-bar-submit]'))) { const input = el.closest('.cfg-lp-prompt').querySelector('[data-ap-bar-input]'); apOpenChatWith(input.value.trim()); return true }
  if (pick('[data-ap-bar-input]')) return true
  if ((el = pick('.ap-entry'))) {
    if (pick('.ap-aside')) return true
    cfg.apChatOpen = !cfg.apChatOpen
    refreshAppearancePreview()
    return true
  }
  return false
}

function apAction(name) {
  const a = apA()
  if (name === 'cfg-ap-save') { apSave(); renderApp(); return true }
  if (name === 'cfg-ap-discard') { apDiscard(); toast('已放弃本页未保存的改动', 'info'); renderApp(); return true }
  if (name === 'cfg-ap-chat-close') { cfg.apChatOpen = false; refreshAppearancePreview(); return true }
  if (name === 'cfg-powered') { toast('访客点这里会打开吸管接待产品首页', 'info'); return true }
  if (name === 'cfg-qb-add') {
    if (a.quickButtons.length >= AP_LIMITS.quick) return true
    a.quickButtons.push({ id: apNewId(), text: '新按钮', tag: `quick_${a.quickButtons.length + 1}`, qa: '' })
    renderApp()
    return true
  }
  if (name === 'cfg-mascot-reset') { a.mascot = 'headset'; a.mascotImage = ''; cfg.uploadError = ''; renderApp(); return true }
  if (name === 'cfg-avatar-reset') { a.avatarImage = ''; cfg.uploadError = ''; renderApp(); return true }
  return false
}

/** 表单输入后的联动：字数、必填报错、位置标签。 */
function apAfterInput(path, target) {
  if (!path.startsWith('appearance.')) return
  document.querySelectorAll(`[data-ap-count="${path}"]`).forEach(node => { node.textContent = `${Array.from(target.value).length} / ${target.maxLength}` })
  if (cfg.apErrors && Object.keys(cfg.apErrors).length) {
    if (path === 'appearance.name' && target.value.trim()) delete cfg.apErrors.name
    if (path === 'appearance.welcome' && target.value.trim()) delete cfg.apErrors.welcome
    target.closest('.has-error')?.classList.toggle('has-error', !target.value.trim())
  }
}

function apHandleChange(event) {
  const target = event.target
  if (target.matches('[data-ap-guide-toggle]')) {
    const a = apA()
    const id = target.dataset.apGuideToggle
    if (target.checked && a.guides.length < AP_LIMITS.guides) a.guides = a.quickButtons.map(item => item.id).filter(item => a.guides.includes(item) || item === id)
    else a.guides = a.guides.filter(item => item !== id)
    renderApp()
    return true
  }
  if (target.matches('[data-ap-sim]')) { cfg.apSim = target.value; refreshAppearancePreview(); return true }
  if (target.matches('[data-ap-human]')) {
    cfg.apHuman = Boolean(target.value)
    refreshAppearancePreview()
    document.querySelectorAll('[data-widget-stage]').forEach(stage => { stage.scrollTop = stage.scrollHeight })
    return true
  }
  if (target.matches('[data-ap-siteurl]')) { cfg.apSiteUrl = target.value.trim(); refreshAppearancePreview(); return true }
  return false
}

function apHandleKeydown(event) {
  if (event.key === 'Enter' && event.target.matches?.('[data-ap-bar-input]')) {
    if (event.isComposing) return true
    event.preventDefault()
    apOpenChatWith(event.target.value.trim())
    return true
  }
  if (event.key === 'Enter' && event.target.matches?.('[data-ap-siteurl]')) { event.preventDefault(); event.target.blur(); return true }
  if (event.key === 'Escape' && cfg.apLeave) { cfg.apLeave = null; renderApp(); return true }
  return false
}
