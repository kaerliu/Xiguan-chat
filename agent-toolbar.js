/*
 * 官网侧边工具栏：模板、按钮编辑器、预览渲染、图片处理。
 * 按源码 shared/site-toolbar.ts、console/src/lib/siteToolbarTemplates.ts、
 * console/src/components/SiteToolbarPanel.tsx 还原。
 * 依赖 agent-config.js 的 cfg / esc / getCfgValue / setCfgValue / cfgColorField 等，均在调用时访问。
 */

const TOOLBAR_LIMITS = { items: 10, label: 8, title: 16, text: 200, rows: 4, rowLabel: 12, rowValue: 40, url: 500, caption: 20, image: 80000 }

const TOOLBAR_ICON_PATHS = {
  phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'],
  wechat: ['M16.2 9.6C15.6 6.4 12.4 4 8.6 4 4.4 4 1 6.8 1 10.2c0 1.9 1.1 3.6 2.7 4.7L3.1 17l2.6-1.3c.9.3 1.9.5 2.9.5', 'M15.6 10.4c3.5 0 6.4 2.3 6.4 5.2 0 1.5-.8 2.8-2 3.7l.4 2-2.2-1.1c-.8.3-1.7.4-2.6.4-3.5 0-6.4-2.3-6.4-5.1s2.9-5.1 6.4-5.1z', 'M5.8 8.6h.01', 'M11.2 8.6h.01', 'M13.4 14.6h.01', 'M17.8 14.6h.01'],
  chat: ['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z', 'M8.5 11.5h.01', 'M12.5 11.5h.01', 'M16.5 11.5h.01'],
  headset: ['M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3', 'M21 16v2a4 4 0 0 1-4 4h-5'],
  tool: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'],
  alert: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 7.5v5', 'M12 16.5h.01'],
  qrcode: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h3v3h-3z', 'M21 14v.01', 'M14 21h.01', 'M18 21h3v-4'],
  form: ['M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.4 2.6a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z'],
  presentation: ['M2 3h20', 'M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3', 'M7 21l5-5 5 5', 'M7 11l3-3 3 2 4-4'],
  calendar: ['M8 2v4', 'M16 2v4', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M3 10h18'],
  document: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
  gift: ['M3 8h18v4H3z', 'M12 8v13', 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7', 'M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5'],
  heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
  mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M22 6l-10 7L2 6'],
  location: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z', 'M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  top: ['M5 3h14', 'M18 13l-6-6-6 6', 'M12 7v14']
}

const TOOLBAR_ICON_OPTIONS = [['phone', '电话'], ['wechat', '微信'], ['chat', '对话'], ['headset', '客服'], ['tool', '技术'], ['alert', '投诉'], ['qrcode', '二维码'], ['form', '表单'], ['presentation', '演示'], ['calendar', '预约'], ['document', '资料'], ['gift', '活动'], ['heart', '关注'], ['user', '个人号'], ['mail', '邮件'], ['location', '地址'], ['top', '顶部']]
const TOOLBAR_ACTION_LABELS = { panel: '悬停弹出面板', link: '打开链接', top: '返回顶部' }

const toolbarIconSvg = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(TOOLBAR_ICON_PATHS[name] || TOOLBAR_ICON_PATHS.chat).map(d => `<path d="${d}"/>`).join('')}</svg>`

/* ---------- 颜色（与 shared/widget-contract 的混色、对比度一致） ---------- */

const parseHex = value => /^#[0-9a-f]{6}$/i.test(String(value)) ? [1, 3, 5].map(i => parseInt(String(value).slice(i, i + 2), 16)) : null
const toHex = rgb => `#${rgb.map(n => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase()}`
const mixHex = (source, target, amount) => { const a = parseHex(source) || [18, 60, 53]; const b = parseHex(target) || a; return toHex(a.map((v, i) => v + (b[i] - v) * amount)) }
const luminance = rgb => { const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrastOf = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
const hexContrast = (first, second) => { const a = parseHex(first); const b = parseHex(second); return a && b ? contrastOf(a, b) : 1 }
const readableTextOn = background => { const rgb = parseHex(background) || [18, 60, 53]; return contrastOf(rgb, [255, 255, 255]) >= contrastOf(rgb, [16, 47, 42]) ? '#FFFFFF' : '#102F2A' }
const onAccentColor = accent => hexContrast(accent, '#FFFFFF') >= 2.2 ? '#FFFFFF' : readableTextOn(accent)

function toolbarThemeVars(t) {
  const accent = t.accent_color
  const bg = t.background_color
  const ink = t.text_color
  const onAccent = onAccentColor(accent)
  return {
    '--cfg-st-accent': accent, '--cfg-st-accent-2': mixHex(accent, '#FFFFFF', 0.28), '--cfg-st-on-accent': onAccent,
    '--cfg-st-on-accent-line': mixHex(accent, onAccent, 0.5), '--cfg-st-bg': bg, '--cfg-st-panel-top': mixHex(bg, accent, 0.05),
    '--cfg-st-ink': ink, '--cfg-st-ink-muted': mixHex(ink, bg, 0.22), '--cfg-st-line': mixHex(bg, ink, 0.12), '--cfg-st-hover': mixHex(bg, accent, 0.07),
    '--cfg-st-top': `${t.position}%`, '--cfg-st-right': `${t.offset_right}px`
  }
}

/* ---------- 数据与模板 ---------- */

function defaultToolbar() {
  return { enabled: false, variant: 'capsule', accent_color: '#1D6FE8', background_color: '#FFFFFF', text_color: '#3A4352', position: 50, offset_right: 16, items: [] }
}

let toolbarSeq = 0
const newToolbarItemId = () => `st_${Date.now().toString(36)}${(toolbarSeq += 1)}${Math.random().toString(36).slice(2, 5)}`

function toolbarItem(icon, label, options = {}) {
  const { panel, ...rest } = options
  return { id: newToolbarItemId(), icon, label, action: 'panel', url: '', highlight: false, new_group: false, ...rest, panel: { title: '', text: '', rows: [], image: '', image_caption: '', ...panel } }
}

const newToolbarItem = () => toolbarItem('chat', '新按钮', { panel: { rows: [{ label: '联系电话', value: '', url: '' }] } })

const SITE_TOOLBAR_TEMPLATES = [
  { id: 'capsule', name: '白色胶囊', description: '白底长胶囊，悬停时图标变色并在左侧弹出信息卡片，适合浅色官网。', style: { variant: 'capsule', accent_color: '#1D6FE8', background_color: '#FFFFFF', text_color: '#3A4352' },
    items: () => [
      toolbarItem('phone', '电话咨询', { panel: { title: '电话咨询', rows: [{ label: '电话热线', value: '400-000-0000 转 1', url: 'tel:4000000000' }, { label: '商务咨询', value: '点击申请专人服务', url: '/contact' }] } }),
      toolbarItem('tool', '技术咨询', { panel: { title: '技术咨询', rows: [{ label: '技术文档', value: '查看帮助中心', url: '/docs' }, { label: '紧急服务热线', value: '400-000-0000 转 2', url: 'tel:4000000000' }] } }),
      toolbarItem('wechat', '微信咨询', { panel: { title: '微信咨询', text: '扫码添加**专属顾问**\n免费获取更多资料', image_caption: '微信扫一扫' } }),
      toolbarItem('alert', '投诉入口', { panel: { title: '投诉与建议', rows: [{ label: '投诉邮箱', value: 'service@example.com', url: 'mailto:service@example.com' }] } })
    ] },
  { id: 'block', name: '品牌色块', description: '整条使用品牌色，白色图标与分隔线，可分成多组，适合视觉更强烈的官网。', style: { variant: 'block', accent_color: '#E60012', background_color: '#FFFFFF', text_color: '#333333' },
    items: () => [
      toolbarItem('heart', '关注我们', { panel: { title: '关注我们', text: '扫码关注**官方公众号**\n第一时间获取产品动态' } }),
      toolbarItem('document', '资料下载', { action: 'link', url: '/resources' }),
      toolbarItem('phone', '售前电话', { new_group: true, panel: { title: '售前电话', rows: [{ label: '售前热线', value: '400-000-0000', url: 'tel:4000000000' }] } }),
      toolbarItem('headset', '售后电话', { panel: { title: '售后电话', rows: [{ label: '售后热线', value: '400-000-0001', url: 'tel:4000000001' }] } }),
      toolbarItem('qrcode', '专家面对面', { panel: { title: '专家面对面', text: '扫码预约**行业专家**\n一对一沟通需求' } }),
      toolbarItem('form', '获取方案', { action: 'link', url: '/contact' })
    ] },
  { id: 'card', name: '分组卡片', description: '首项用渐变色块突出，其余按钮收在白色圆角卡片里，适合只有 2–4 个入口的官网。', style: { variant: 'card', accent_color: '#FF7A1A', background_color: '#FFFFFF', text_color: '#2F3540' },
    items: () => [
      toolbarItem('wechat', '微信咨询', { highlight: true, panel: { title: '微信咨询', text: '扫码添加**专属顾问**\n获取演示与报价', image_caption: '微信扫一扫' } }),
      toolbarItem('phone', '电话咨询', { new_group: true, panel: { title: '电话咨询', rows: [{ label: '咨询热线', value: '400-000-0000', url: 'tel:4000000000' }] } }),
      toolbarItem('presentation', '演示预约', { action: 'link', url: '/demo' }),
      toolbarItem('top', '返回顶部', { action: 'top' })
    ] }
]

/** 打开开关时：还没有按钮就填入当前样式对应的示例。 */
function toggleToolbar(toolbar, enabled) {
  toolbar.enabled = enabled
  if (!enabled || toolbar.items.length) return
  const template = SITE_TOOLBAR_TEMPLATES.find(item => item.id === toolbar.variant) || SITE_TOOLBAR_TEMPLATES[0]
  Object.assign(toolbar, template.style, { items: template.items() })
  cfg.tbExpanded = toolbar.items[0]?.id || null
}

/** 旧版草稿里的简化工具栏数据，统一迁移成与源码一致的结构。 */
function normalizeToolbarDraft(value) {
  const base = defaultToolbar()
  if (!value || typeof value !== 'object' || 'template' in value || !Array.isArray(value.items)) return base
  return { ...base, ...value, items: value.items.map(item => ({ ...toolbarItem('chat', ''), ...item, panel: { title: '', text: '', rows: [], image: '', image_caption: '', ...(item.panel || {}) } })) }
}

/* ---------- 校验 ---------- */

function normalizeToolbarUrl(value) {
  const url = Array.from(String(value || '').trim()).slice(0, TOOLBAR_LIMITS.url).join('')
  if (!url || /\s/.test(url)) return ''
  if (/^https?:\/\/[^/]/i.test(url)) return url
  if (/^(tel|mailto):[^/]/i.test(url)) return url
  if (/^\/(?!\/)/.test(url) || url.startsWith('#')) return url
  return ''
}
const toolbarUrlError = value => String(value || '').trim() && !normalizeToolbarUrl(value) ? '仅支持 https://、tel:、mailto:、站内路径（/ 开头）或 # 锚点' : ''
const toolbarPanelHasContent = panel => Boolean(panel.text.trim() || panel.rows.some(row => row.label.trim() || row.value.trim()) || panel.image)

/* ---------- 图片：方形居中裁切（头像 / 数字人形象 / 二维码） ---------- */

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function loadImageFile(file) {
  const objectUrl = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ image, objectUrl })
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('无法读取这张图片，请换一张重试。')) }
    image.src = objectUrl
  })
}

function drawSquare(image, size, { white = false } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法处理图片。')
  if (white) { context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, size, size) }
  const edge = Math.min(image.naturalWidth, image.naturalHeight)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, (image.naturalWidth - edge) / 2, (image.naturalHeight - edge) / 2, edge, edge, 0, 0, size, size)
  return canvas
}

/** kind：avatar（WebP/PNG，≤ 320K 字符）、mascot（透明 PNG）、toolbar（白底 PNG，≤ 80K 字符）。 */
async function prepareSquareImage(file, kind) {
  const noun = kind === 'avatar' ? '头像' : '图片'
  if (!IMAGE_TYPES.includes(file.type)) throw new Error(`${noun}仅支持 PNG、JPG 或 WebP。`)
  if (file.size > 4 * 1024 * 1024) throw new Error(`${noun}原图不能超过 4 MB。`)
  const { image, objectUrl } = await loadImageFile(file)
  try {
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片尺寸无效。')
    if (Math.max(image.naturalWidth, image.naturalHeight) > 8192) throw new Error(`${noun}边长不能超过 8192 像素。`)
    if (kind === 'toolbar') {
      for (const size of [264, 220]) { const result = drawSquare(image, size, { white: true }).toDataURL('image/png'); if (result.length <= TOOLBAR_LIMITS.image) return result }
      for (const size of [220, 180]) { const result = drawSquare(image, size, { white: true }).toDataURL('image/jpeg', 0.82); if (result.length <= TOOLBAR_LIMITS.image) return result }
      throw new Error('图片压缩后仍然过大，请换一张内容更简单的图片。')
    }
    for (const [size, quality] of [[256, 0.86], [224, 0.78], [192, 0.72]]) {
      const canvas = drawSquare(image, size)
      const webp = canvas.toDataURL('image/webp', quality)
      const result = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png')
      if (result.length <= 320000) return result
    }
    throw new Error(`${noun}压缩后仍然过大，请换一张内容更简单的图片。`)
  } finally { URL.revokeObjectURL(objectUrl) }
}

/* ---------- 预览：侧边工具栏（含弹出面板） ---------- */

function emphasisHtml(text) {
  return esc(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

function toolbarPanelHtml(item, t) {
  const rows = item.panel.rows.filter(row => row.label.trim() || row.value.trim())
  const main = `${item.panel.text.trim() ? `<p class="cfg-st-panel-text">${emphasisHtml(item.panel.text)}</p>` : ''}${rows.length ? `<dl class="cfg-st-panel-rows">${rows.map(row => `<div class="cfg-st-panel-row">${row.label ? `<dt>${esc(row.label)}：</dt>` : ''}<dd>${normalizeToolbarUrl(row.url) ? `<a href="${esc(normalizeToolbarUrl(row.url))}" data-demo-link>${esc(row.value || row.url)}</a>` : esc(row.value)}</dd></div>`).join('')}</dl>` : ''}`
  const figure = item.panel.image ? `<figure class="cfg-st-panel-figure"><img alt="${esc(item.panel.image_caption || `${item.label}二维码`)}" src="${esc(item.panel.image)}" />${item.panel.image_caption ? `<figcaption>${esc(item.panel.image_caption)}</figcaption>` : ''}</figure>` : ''
  return `<div class="cfg-st-panel" data-panel-for="${esc(item.id)}" data-open="${cfg.tbExpanded === item.id}" role="region" aria-label="${esc(item.panel.title || item.label)}"><div class="cfg-st-panel-head">${toolbarIconSvg(item.icon, 28)}<strong>${esc(item.panel.title || item.label)}</strong></div><div class="cfg-st-panel-body">${main ? `<div class="cfg-st-panel-main">${main}</div>` : ''}${figure}</div></div>`
}

function renderToolbarPreview(t) {
  const items = t.items.filter(item => item.label.trim())
  if (!t.enabled || !items.length) return ''
  const groups = []
  items.forEach((item, index) => { if (index === 0 || item.new_group) groups.push([]); groups[groups.length - 1].push(item) })
  const vars = Object.entries(toolbarThemeVars(t)).map(([k, v]) => `${k}:${v}`).join(';')
  const panels = []
  const html = groups.map(group => {
    const solo = group.length === 1 && group[0].highlight && t.variant !== 'block'
    return `<div class="cfg-st-group" data-solo-highlight="${solo}">${group.map(item => {
      const hasPanel = item.action === 'panel' && toolbarPanelHasContent(item.panel)
      if (hasPanel) panels.push(toolbarPanelHtml(item, t))
      const open = hasPanel && cfg.tbExpanded === item.id
      return `<button type="button" class="cfg-st-item" data-highlight="${item.highlight && t.variant !== 'block'}" ${hasPanel ? `data-active="${open}" data-panel-trigger="${esc(item.id)}"` : ''}>${toolbarIconSvg(item.icon, 26)}<span class="cfg-st-label">${esc(item.label)}</span></button>`
    }).join('')}</div>`
  }).join('')
  return `<div class="cfg-st" data-variant="${t.variant}" style="${vars}">${html}${panels.join('')}</div>`
}

/** 弹出面板与触发按钮垂直居中对齐（预览渲染后调用）。 */
function positionToolbarPanels() {
  document.querySelectorAll('.cfg-st-panel[data-open="true"]').forEach(panel => {
    const trigger = document.querySelector(`[data-panel-trigger="${CSS.escape(panel.dataset.panelFor)}"]`)
    if (trigger) panel.style.setProperty('--cfg-st-panel-y', `${trigger.offsetTop + trigger.offsetHeight / 2}px`)
  })
}

/* ---------- 编辑器 ---------- */

function renderToolbarEditor() {
  const t = cfg.draft.appearance.toolbar
  const capsuleOn = cfg.draft.appearance.sideCapsule
  const block = t.variant === 'block'
  const templates = SITE_TOOLBAR_TEMPLATES.map(template => {
    const theme = toolbarThemeVars({ ...t, ...template.style })
    const thumbVars = Object.entries(theme).map(([k, v]) => `${k.replace('--cfg-st-', '--xg-st-')}:${v}`).join(';')
    const thumbItems = template.items().slice(0, 4)
    return `<button type="button" class="site-toolbar-template" role="radio" aria-checked="${t.items.length > 0 && t.variant === template.id}" data-tb-template="${template.id}">
      <span class="site-toolbar-thumb is-${template.id}" style="${thumbVars}" aria-hidden="true">${thumbItems.map((item, index) => `<span class="${template.id === 'card' && index === 0 ? 'is-highlight' : ''}${template.id === 'card' && index === 1 ? ' is-break' : ''}">${toolbarIconSvg(item.icon, 13)}<em>${esc(item.label)}</em></span>`).join('')}</span>
      <span class="site-toolbar-template-copy"><strong>${template.name}</strong><small>${template.description}</small></span></button>`
  }).join('')
  const items = t.items.map((item, index) => renderToolbarItem(t, item, index)).join('')
  return `${cfgToggle('appearance.toolbar.enabled', '在官网右侧显示侧边工具栏', '访客悬停或点击按钮查看弹出面板，或直接跳转链接；窄屏（≤760px）自动隐藏，避免遮挡移动端页面。', { rerender: true })}
    ${cfgField('样式模板', `<div class="site-toolbar-templates" role="radiogroup" aria-label="侧边工具栏样式模板">${templates}</div>`, { full: true, help: '首次套用会同时填入示例按钮；已有按钮时可选择只换样式。示例里的电话、链接仅为占位，请替换为官网真实信息。' })}
    ${cfgColorField('强调色', 'appearance.toolbar.accent_color', ['#1D6FE8', '#E60012', '#FF7A1A', '#07C160', '#6D4AFF', '#123C35'], block ? '作为整条工具栏底色，文字自动选择高对比色。' : '用于悬停与选中、强调按钮以及弹出面板标题。', { full: false })}
    ${cfgColorField(block ? '弹出面板底色' : '工具栏底色', 'appearance.toolbar.background_color', ['#FFFFFF', '#F5F8FF', '#FBF8F1', '#F4F1FA', '#1F2937'], block ? '' : '同时作为弹出面板底色。', { full: false })}
    ${cfgColorField('文字颜色', 'appearance.toolbar.text_color', ['#3A4352', '#2F3540', '#333333', '#102F2A', '#FFFFFF'], '按钮文字与弹出面板正文的颜色；图标会自动略浅一些。')}
    ${cfgField(`垂直位置 · <b data-range-label="appearance.toolbar.position">${t.position}</b>%`, `<input type="range" min="10" max="90" step="5" value="${t.position}" data-bind="appearance.toolbar.position" data-type="number" data-live="preview" />`, { help: '50% 为垂直居中；靠近 10% / 90% 时整条工具栏贴近顶部 / 底部且不会超出屏幕。' })}
    ${cfgField(`距右侧 · <b data-range-label="appearance.toolbar.offset_right">${t.offset_right}</b>px`, `<input type="range" min="0" max="240" step="4" value="${t.offset_right}" data-bind="appearance.toolbar.offset_right" data-type="number" data-live="preview" />`, { help: capsuleOn ? '已开启「侧边咨询胶囊」，两者都在页面右侧，请在预览中确认没有重叠。' : '0 为紧贴浏览器右边缘。' })}
    <div class="cfg-field full"><div class="notification-title"><strong>按钮（${t.items.length}/${TOOLBAR_LIMITS.items}）</strong><button type="button" class="cfg-btn sm outline" data-action="cfg-toolbar-add" ${t.items.length >= TOOLBAR_LIMITS.items ? 'disabled' : ''}>${icon('plus', 'xs')}<span>添加按钮</span></button></div>
      ${t.items.length ? '' : '<small>还没有按钮。选择上方模板快速开始，或点击「添加按钮」从空白开始。</small>'}
      <div class="site-toolbar-items">${items}</div></div>`
}

function renderToolbarItem(t, item, index) {
  const expanded = cfg.tbExpanded === item.id
  const labelMissing = !item.label.trim()
  const linkError = item.action === 'link' ? (item.url.trim() ? toolbarUrlError(item.url) : '请填写链接地址，否则按钮点击后不会跳转。') : ''
  const base = `appearance.toolbar.items.${index}`
  const head = `<div class="site-toolbar-item-head">
    <button type="button" class="site-toolbar-item-toggle" aria-expanded="${expanded}" data-tb-toggle="${item.id}"><span class="site-toolbar-item-icon">${toolbarIconSvg(item.icon)}</span><strong>${esc(item.label.trim() || '未命名按钮')}</strong><small>${TOOLBAR_ACTION_LABELS[item.action]}${item.new_group && index > 0 ? ' · 新分组' : ''}${item.highlight ? ' · 强调' : ''}</small>${labelMissing || linkError ? '<span class="site-toolbar-item-warning">待完善</span>' : ''}</button>
    <button type="button" class="cfg-icon-btn" aria-label="上移「${esc(item.label)}」" data-tb-move="${index}:-1" ${index === 0 ? 'disabled' : ''}>${icon('arrow-up', 'sm')}</button>
    <button type="button" class="cfg-icon-btn" aria-label="下移「${esc(item.label)}」" data-tb-move="${index}:1" ${index === t.items.length - 1 ? 'disabled' : ''}>${icon('arrow-down', 'sm')}</button>
    <button type="button" class="cfg-icon-btn" aria-label="删除「${esc(item.label)}」" data-tb-remove="${index}">${icon('trash', 'sm')}</button></div>`
  if (!expanded) return `<div class="site-toolbar-item" data-expanded="false">${head}</div>`
  const busy = cfg.tbImageBusy === item.id
  const rowsHtml = item.panel.rows.map((row, ri) => {
    const rowError = toolbarUrlError(row.url)
    return `<div class="site-toolbar-row"><input aria-label="第 ${ri + 1} 行名称" value="${esc(row.label)}" maxlength="${TOOLBAR_LIMITS.rowLabel}" placeholder="电话热线" data-bind="${base}.panel.rows.${ri}.label" data-live="preview" /><input aria-label="第 ${ri + 1} 行内容" value="${esc(row.value)}" maxlength="${TOOLBAR_LIMITS.rowValue}" placeholder="400-000-0000" data-bind="${base}.panel.rows.${ri}.value" data-live="preview" /><input aria-label="第 ${ri + 1} 行链接" value="${esc(row.url)}" maxlength="${TOOLBAR_LIMITS.url}" placeholder="可选：tel:4000000000" data-bind="${base}.panel.rows.${ri}.url" data-live="preview" data-tb-validate="1" /><button type="button" class="cfg-icon-btn" aria-label="删除第 ${ri + 1} 行" data-tb-row-remove="${index}:${ri}">${icon('close', 'sm')}</button>${rowError ? `<small class="site-toolbar-error">${rowError}</small>` : ''}</div>`
  }).join('')
  const panelEditor = item.action === 'panel' ? `<div class="site-toolbar-panel-editor full">
      ${cfgField('面板标题', `<input value="${esc(item.panel.title)}" maxlength="${TOOLBAR_LIMITS.title}" placeholder="${esc(item.label)}" data-bind="${base}.panel.title" data-live="preview" />`)}
      ${cfgField('说明文字', `<textarea rows="2" maxlength="${TOOLBAR_LIMITS.text}" placeholder="扫码添加**专属顾问**" data-bind="${base}.panel.text" data-live="preview">${esc(item.panel.text)}</textarea>`, { help: '可换行；用 **两个星号** 包住的文字会以强调色加粗显示。' })}
      <div class="cfg-field"><div class="notification-title"><label>信息行</label><button type="button" class="cfg-btn sm ghost" data-tb-row-add="${index}" ${item.panel.rows.length >= TOOLBAR_LIMITS.rows ? 'disabled' : ''}>${icon('plus', 'xs')}<span>添加一行</span></button></div>${rowsHtml}<small>例如“电话热线：400-000-0000”。填写链接后内容以强调色显示并可点击，电话用 tel:、邮箱用 mailto:。</small></div>
      <div class="cfg-field"><label>二维码 / 图片</label><div class="site-toolbar-image"><span class="site-toolbar-image-preview">${item.panel.image ? `<img src="${esc(item.panel.image)}" alt="" />` : toolbarIconSvg('qrcode', 22)}</span><div>
        <div class="cfg-avatar-actions"><label class="cfg-btn sm outline ${busy ? 'is-disabled' : ''}"><span>${busy ? '正在处理…' : item.panel.image ? '更换图片' : '上传图片'}</span><input class="cfg-file" type="file" accept="image/png,image/jpeg,image/webp" data-upload="toolbar:${item.id}" ${busy ? 'disabled' : ''} /></label>${item.panel.image ? `<button type="button" class="cfg-btn sm ghost" data-tb-image-clear="${index}">移除</button>` : ''}</div>
        <input aria-label="图片说明" value="${esc(item.panel.image_caption)}" maxlength="${TOOLBAR_LIMITS.caption}" placeholder="图片下方说明，例如“微信扫一扫”" data-bind="${base}.panel.image_caption" data-live="preview" /></div></div>
        ${cfg.tbImageError?.id === item.id ? `<small class="site-toolbar-error" role="alert">${esc(cfg.tbImageError.message)}</small>` : ''}<small>自动居中裁切为方形，显示在面板右侧；适合微信、公众号等二维码。</small></div></div>` : ''
  const linkField = item.action === 'link' ? cfgField('链接地址', `<input value="${esc(item.url)}" maxlength="${TOOLBAR_LIMITS.url}" placeholder="https://www.example.com/contact 或 /contact" data-bind="${base}.url" data-tb-validate="1" />`, { full: true, help: `<span class="${linkError ? 'site-toolbar-error' : ''}" data-tb-link-hint>${esc(linkError || '外部网址在新标签页打开；站内路径、tel:、mailto: 在当前页打开。')}</span>` }) : ''
  return `<div class="site-toolbar-item" data-expanded="true">${head}<div class="site-toolbar-item-body cfg-form-grid">
    ${cfgField('按钮名称', `<input value="${esc(item.label)}" maxlength="${TOOLBAR_LIMITS.label}" data-bind="${base}.label" data-live="preview" data-tb-validate="1" />`, { help: labelMissing ? '按钮名称不能为空。' : `${TOOLBAR_LIMITS.label} 字以内，例如“电话咨询”。` })}
    ${cfgField('点击效果', cfgSelect(`${base}.action`, [['panel', '悬停 / 点击弹出面板'], ['link', '打开链接'], ['top', '返回页面顶部']], { live: 'preview', rerender: true }))}
    <div class="cfg-field full"><label>图标</label><div class="site-toolbar-icon-picker" role="radiogroup" aria-label="「${esc(item.label)}」的图标">${TOOLBAR_ICON_OPTIONS.map(([value, label]) => `<button type="button" role="radio" aria-checked="${item.icon === value}" title="${label}" data-tb-icon="${index}:${value}">${toolbarIconSvg(value)}<span>${label}</span></button>`).join('')}</div></div>
    <label class="cfg-checkbox"><input type="checkbox" data-bind="${base}.highlight" data-live="preview" data-rerender="1" ${item.highlight ? 'checked' : ''} ${t.variant === 'block' ? 'disabled' : ''} /><span>强调显示（强调色填充）${t.variant === 'block' ? ' · 色块样式下不适用' : ''}</span></label>
    <label class="cfg-checkbox"><input type="checkbox" data-bind="${base}.new_group" data-live="preview" data-rerender="1" ${item.new_group ? 'checked' : ''} ${index === 0 ? 'disabled' : ''} /><span>从这个按钮开始另起一组</span></label>
    ${linkField}${panelEditor}</div></div>`
}

/* ---------- 事件 ---------- */

function tbApplyTemplate(id, withContent) {
  const t = cfg.draft.appearance.toolbar
  const template = SITE_TOOLBAR_TEMPLATES.find(item => item.id === id)
  Object.assign(t, template.style, { enabled: true })
  if (withContent) { t.items = template.items(); cfg.tbExpanded = t.items[0]?.id || null }
  cfg.tbPending = null
  renderApp()
}

/** 工具栏相关点击；返回 true 表示已处理。 */
function tbHandleClick(event) {
  const pick = selector => event.target.closest(selector)
  const t = cfg.draft.appearance.toolbar
  let el
  if ((el = pick('[data-tb-template]'))) {
    if (!t.items.length) tbApplyTemplate(el.dataset.tbTemplate, true)
    else { cfg.tbPending = el.dataset.tbTemplate; renderApp() }
    return true
  }
  if ((el = pick('[data-tb-toggle]'))) { cfg.tbExpanded = cfg.tbExpanded === el.dataset.tbToggle ? null : el.dataset.tbToggle; renderApp(); return true }
  if ((el = pick('[data-tb-move]'))) { const [index, step] = el.dataset.tbMove.split(':').map(Number); const [item] = t.items.splice(index, 1); t.items.splice(index + step, 0, item); renderApp(); return true }
  if ((el = pick('[data-tb-remove]'))) { t.items.splice(Number(el.dataset.tbRemove), 1); renderApp(); return true }
  if ((el = pick('[data-tb-icon]'))) { const [index, icon] = el.dataset.tbIcon.split(':'); t.items[Number(index)].icon = icon; renderApp(); return true }
  if ((el = pick('[data-tb-row-add]'))) { t.items[Number(el.dataset.tbRowAdd)].panel.rows.push({ label: '', value: '', url: '' }); renderApp(); return true }
  if ((el = pick('[data-tb-row-remove]'))) { const [index, row] = el.dataset.tbRowRemove.split(':').map(Number); t.items[index].panel.rows.splice(row, 1); renderApp(); return true }
  if ((el = pick('[data-tb-image-clear]'))) { t.items[Number(el.dataset.tbImageClear)].panel.image = ''; renderApp(); return true }
  if ((el = pick('[data-tb-pending]'))) {
    const choice = el.dataset.tbPending
    if (choice === 'cancel') { cfg.tbPending = null; renderApp() } else tbApplyTemplate(cfg.tbPending, choice === 'replace')
    return true
  }
  if (event.target.matches('[data-tb-backdrop]')) { cfg.tbPending = null; renderApp(); return true }
  return false
}

function tbAction(name) {
  const t = cfg.draft.appearance.toolbar
  if (name !== 'cfg-toolbar-add') return false
  const created = newToolbarItem()
  t.items.push(created)
  cfg.tbExpanded = created.id
  renderApp()
  return true
}

/** 图片上传（头像、数字人形象、二维码）。 */
async function handleUpload(input) {
  const file = input.files?.[0]
  const [kind, id] = String(input.dataset.upload).split(':')
  if (!file) return
  try {
    if (kind === 'toolbar') { cfg.tbImageBusy = id; cfg.tbImageError = null; renderApp() }
    else { cfg.uploadBusy = kind; cfg.uploadError = ''; renderApp() }
    const image = await prepareSquareImage(file, kind === 'avatar' ? 'avatar' : kind === 'toolbar' ? 'toolbar' : 'mascot')
    const a = cfg.draft.appearance
    if (kind === 'avatar') a.avatarImage = image
    else if (kind === 'mascot') { a.mascot = 'custom'; a.mascotImage = image }
    else cfg.draft.appearance.toolbar.items.find(item => item.id === id).panel.image = image
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : '图片处理失败，请重试。'
    if (kind === 'toolbar') cfg.tbImageError = { id, message }
    else cfg.uploadError = message
  } finally {
    cfg.tbImageBusy = ''
    cfg.uploadBusy = ''
    renderApp()
  }
}

function renderToolbarPendingModal() {
  const template = SITE_TOOLBAR_TEMPLATES.find(item => item.id === cfg.tbPending)
  if (!template) return ''
  return `<div class="modal-backdrop" data-tb-backdrop><div class="modal" style="width:480px"><div class="modal-head"><div><h2>套用「${template.name}」模板</h2><p>当前已有按钮。可以只替换样式和配色、保留现有按钮内容，也可以连同示例按钮一起替换。</p></div></div>
    <div class="modal-foot"><span></span><div><button type="button" class="btn" data-tb-pending="cancel">取消</button> <button type="button" class="btn" data-tb-pending="replace">替换为示例按钮</button> <button type="button" class="btn primary" data-tb-pending="style">只换样式</button></div></div></div></div>`
}
