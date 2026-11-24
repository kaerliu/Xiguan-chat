/*
 * 通知推送：新线索、转人工请求推到企业微信群机器人，或写入简道云表单。
 * 规则以老项目 xiguan-chatbot 的「通知与业务系统」为基线，见 PRD-渠道与通知推送-v0.1.md。
 * 这里的配置保存即生效，不进草稿和发布，单独存在浏览器本地（xiguan-agent-notify）。
 * 依赖 app.js / agent-config.js / agent-capabilities.js 的全局：state、leads、icon、toast、renderApp、
 * esc、badge、field、nowClock、cfgPage、cfgPanel、renderCfgHeader（均在调用时才访问）。
 */

const NT_STORAGE_KEY = 'xiguan-agent-notify'
const NT_MAX_BOTS = 5
const NT_FIXED = '__value__'
const NT_URL_HELP = '地址等同于往这个群发消息的凭证，不要外传。'

const NT_EVENTS = [['lead', '新线索'], ['handoff', '请求人工']]
const NT_SCOPES = [['all', '全部线索'], ['high', '仅高意向线索']]

/** 线索里可以写进简道云字段、或在模板里用 {键} 引用的内容。 */
const NT_LEAD_SOURCES = [
  ['name', '访客称呼'], ['company', '公司 / 组织'], ['contact', '首选联系方式'], ['phone', '手机号'], ['wechat', '微信'], ['email', '邮箱'],
  ['need_summary', '需求摘要'], ['conversation_summary', '会话摘要'], ['grade_label', '线索意向'], ['grade_reason', '意向判断依据'],
  ['classification_label', '线索分类'], ['suggested_next_step', '建议下一步'], ['source_page', '来源页面'], ['landing_url', '落地页'],
  ['referrer', '来源网址 (referrer)'], ['utm_source', 'utm_source'], ['utm_medium', 'utm_medium'], ['utm_campaign', 'utm_campaign'],
  ['utm_term', 'utm_term'], ['utm_content', 'utm_content'], ['replay_url', '会话回放链接'], ['session_id', '会话 ID'], ['lead_id', '线索 ID'], ['submitted_at', '留资时间']
]

/** 预览用的示例线索（对应「线索」里的张先生）。 */
const NT_SAMPLE = {
  name: '张先生', company: '星云制造集团', phone: '13856785721', wechat: '', email: '', contact: '13856785721',
  need_summary: '评估集团经营分析方案，关注多组织数据整合和制造业同行案例',
  conversation_summary: '访客来自制造企业，正在评估数据分析工具，主要场景是集团经营分析，希望先看两份同行案例。',
  grade_label: '高意向', grade_reason: '明确处于选型阶段，主动要案例并留下手机号', classification_label: '产品咨询',
  suggested_next_step: '24 小时内电话联系，先发制造业经营分析案例', source_page: 'https://www.fanruan.com/finereport',
  landing_url: 'https://www.fanruan.com/finereport?utm_source=baidu', referrer: 'https://www.baidu.com/',
  utm_source: 'baidu', utm_medium: 'cpc', utm_campaign: 'finereport-2026', utm_term: '报表工具', utm_content: '',
  replay_url: 'https://test.xiguan.cn/console/sessions/pg_5ec', session_id: 'pg_5ec', lead_id: 'lead_8f21', submitted_at: '2026-11-24 11:56'
}

/* ---------- 简道云示例数据（原型里代替开放平台接口） ---------- */

const NT_JDY_APPS = [{ id: 'app_sales', name: '销售管理' }, { id: 'app_mkt', name: '市场活动' }]
const NT_JDY_FORMS = {
  app_sales: [{ id: 'entry_lead', name: '线索登记' }, { id: 'entry_opp', name: '商机跟进' }, { id: 'entry_customer', name: '客户档案' }],
  app_mkt: [{ id: 'entry_signup', name: '活动报名' }]
}
const NT_JDY_WIDGETS = {
  entry_lead: [
    { name: '_widget_1716000000001', label: '客户姓名', type: 'text' },
    { name: '_widget_1716000000002', label: '公司名称', type: 'text' },
    { name: '_widget_1716000000003', label: '手机', type: 'phone' },
    { name: '_widget_1716000000004', label: '微信号', type: 'text' },
    { name: '_widget_1716000000005', label: '邮箱', type: 'text' },
    { name: '_widget_1716000000006', label: '需求描述', type: 'textarea' },
    { name: '_widget_1716000000007', label: '意向程度', type: 'radiogroup', options: ['高意向', '跟进中', '待识别', '培育中'] },
    { name: '_widget_1716000000008', label: '线索来源', type: 'combo', options: ['官网 AI 接待', '展会', '电话咨询', '合作伙伴'] },
    { name: '_widget_1716000000009', label: '关注产品', type: 'checkboxgroup', options: ['FineReport', 'FineBI', 'FineDataLink'] },
    { name: '_widget_1716000000010', label: '来源页面', type: 'text' },
    { name: '_widget_1716000000011', label: '会话链接', type: 'text' },
    { name: '_widget_1716000000012', label: '留资时间', type: 'datetime' },
    { name: '_widget_1716000000013', label: '跟进销售', type: 'user' },
    { name: '_widget_1716000000014', label: '附件', type: 'upload' },
    { name: '_widget_1716000000015', label: '备注', type: 'textarea' }
  ],
  default: [
    { name: '_widget_1716000000101', label: '客户姓名', type: 'text' },
    { name: '_widget_1716000000102', label: '联系电话', type: 'phone' },
    { name: '_widget_1716000000103', label: '公司名称', type: 'text' },
    { name: '_widget_1716000000104', label: '备注', type: 'textarea' }
  ]
}
const NT_JDY_TYPES = { text: '单行文本', textarea: '多行文本', radiogroup: '单选按钮组', combo: '下拉框', checkboxgroup: '复选框组', combocheck: '下拉复选框', number: '数字', datetime: '日期时间', phone: '手机', user: '成员单选', upload: '附件' }
const NT_JDY_SUPPORTED = ['text', 'textarea', 'radiogroup', 'combo', 'checkboxgroup', 'combocheck', 'number', 'datetime', 'phone']
const NT_JDY_LIST_TYPES = ['checkboxgroup', 'combocheck']
/** 「按名称自动匹配」：表单字段名 → 线索字段或固定值。 */
const NT_JDY_AUTO = {
  客户姓名: { source: 'name' }, 公司名称: { source: 'company' }, 手机: { source: 'phone' }, 联系电话: { source: 'phone' },
  微信号: { source: 'wechat' }, 邮箱: { source: 'email' }, 需求描述: { source: 'need_summary' }, 意向程度: { source: 'grade_label' },
  线索来源: { value: '官网 AI 接待' }, 来源页面: { source: 'source_page' }, 会话链接: { source: 'replay_url' }, 留资时间: { source: 'submitted_at' },
  备注: { value: '{conversation_summary}' }
}

/* ---------- 状态 ---------- */

function ntDefaults() {
  return {
    wecom: {
      bots: [
        { id: 'bot_sales', name: '销售线索群', url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=3f2a9c1e-58b7-4d0a-9e61-7c2b5d8a4f10', events: { lead: true, handoff: false }, scope: 'all' },
        { id: 'bot_service', name: '客服值班群', url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=b81d07e4-2c6a-4f39-8d15-6e0a3c9f72b4', events: { lead: false, handoff: true }, scope: 'all' }
      ]
    },
    jdy: { enabled: false, apiKey: '', apiKeySet: false, baseUrl: '', appId: '', appName: '', entryId: '', entryName: '', fields: {}, delay: 5, startTrigger: false, startWorkflow: false }
  }
}

function ntLoad() {
  const base = ntDefaults()
  let stored = null
  try { stored = JSON.parse(localStorage.getItem(NT_STORAGE_KEY) || 'null') } catch (_) {}
  if (!stored || typeof stored !== 'object') return base
  const bots = Array.isArray(stored.wecom?.bots) ? stored.wecom.bots : base.wecom.bots
  return {
    wecom: { bots: bots.map(bot => ({ ...base.wecom.bots[0], ...bot, events: { lead: false, handoff: false, ...(bot.events || {}) } })) },
    jdy: { ...base.jdy, ...(stored.jdy || {}), apiKey: '' }
  }
}

const ntClone = value => JSON.parse(JSON.stringify(value))
const ntInitial = ntLoad()

const nt = {
  view: null, // null 首页 / 'wecom' / 'jdy'
  saved: JSON.stringify(ntInitial),
  form: ntClone(ntInitial),
  leave: false,
  previewEvent: 'lead', previewBot: 0,
  tests: {}, // 群机器人测试结果：{ state: 'sending' | 'ok' | 'fail', text }
  errors: {},
  jdyApps: [], jdyForms: [], jdyBusy: '', jdyError: '', jdyFilter: '',
  records: [
    { id: 'r5', time: '今天 11:57', event: 'lead', target: '企业微信 · 销售线索群', subject: '张先生 · 星云制造集团', status: 'success' },
    { id: 'r4', time: '今天 11:49', event: 'handoff', target: '企业微信 · 客服值班群', subject: '会话 pg_5ec', status: 'success' },
    { id: 'r3', time: '今天 10:35', event: 'lead', target: '企业微信 · 销售线索群', subject: '王女士 · 云图科技', status: 'failed', error: '重试 3 次仍失败：企业微信返回 45009，接口调用超过频率限制', leadName: '王女士' },
    { id: 'r2', time: '昨天 16:21', event: 'lead', target: '企业微信 · 销售线索群', subject: '陈经理 · 远航零售', status: 'success' },
    { id: 'r1', time: '昨天 09:13', event: 'lead', target: '企业微信 · 销售线索群', subject: '刘老师 · 智源教育', status: 'success' }
  ]
}

const ntSaved = () => JSON.parse(nt.saved)
const ntSectionDirty = key => Boolean(key) && JSON.stringify(nt.form[key]) !== JSON.stringify(ntSaved()[key])

function ntIsUrl(value) {
  try {
    const url = new URL(String(value).trim())
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.')
  } catch (_) { return false }
}

/** 接口地址只保留协议和域名：用户常把完整接口地址粘进来。 */
function ntBaseUrl(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    return `${url.protocol}//${url.host}`
  } catch (_) { return text }
}

const ntTemplate = text => String(text || '').replace(/\{([a-z_]+)\}/g, (_, key) => NT_SAMPLE[key] ?? '').trim()
const ntEventLabel = key => (NT_EVENTS.find(item => item[0] === key) || [])[1] || key
const ntWidgets = j => (j.entryId ? NT_JDY_WIDGETS[j.entryId] || NT_JDY_WIDGETS.default : [])
const ntMapped = j => Object.entries(j.fields).filter(([, m]) => m.source || String(m.value || '').trim())

function ntSetPath(path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  keys.reduce((obj, key) => obj[key], nt.form)[last] = value
}

function ntWecomStatus(config) {
  const ready = config.wecom.bots.filter(bot => ntIsUrl(bot.url))
  const failed = nt.records.filter(item => item.status === 'failed' && item.target.startsWith('企业微信')).length
  if (!ready.length) return { tone: '', label: '待配置', meta: '还没有群机器人' }
  if (failed) return { tone: 'warning', label: `${failed} 条推送失败`, meta: `${ready.length} 个群` }
  return { tone: 'success', label: '可用', meta: `${ready.length} 个群` }
}

function ntJdyIssues(j) {
  const issues = []
  if (!j.apiKeySet && !String(j.apiKey || '').trim()) issues.push('尚未填写简道云 API Key。')
  if (!j.entryId) issues.push('尚未选择要写入的简道云表单。')
  if (!ntMapped(j).length) issues.push('尚未配置任何字段映射。')
  return issues
}

function ntJdyStatus(config) {
  const j = config.jdy
  if (!j.enabled) return { tone: '', label: '未启用', meta: '' }
  if (ntJdyIssues(j).length) return { tone: 'warning', label: '配置不完整', meta: '' }
  return { tone: 'success', label: '写入可用', meta: `${j.appName} / ${j.entryName}` }
}

/* ---------- 首页 ---------- */

function renderNotifications() {
  if (nt.view === 'wecom') return renderNtWecom()
  if (nt.view === 'jdy') return renderNtJdy()
  return renderNtHome()
}

function ntCard({ key, logo, theme, name, desc, events, status, soon = false }) {
  return `<article class="nt-card ${soon ? 'is-soon' : ''}" aria-label="${name}">
    <div class="nt-card-top"><span class="nt-logo ${theme}">${logo}</span>${soon ? badge('', '敬请期待') : badge(status.tone, status.label)}</div>
    <h2>${name}</h2>
    <p>${desc}</p>
    <div class="nt-card-events">${events.map(item => `<span>${item}</span>`).join('')}</div>
    <div class="nt-card-foot"><small>${soon ? '' : esc(status.meta)}</small>${soon ? '' : `<button type="button" class="cfg-btn sm outline" data-nt-open="${key}">配置</button>`}</div>
  </article>`
}

function ntRecordsTable() {
  const statusBadge = item => item.status === 'success' ? badge('success', '已送达') : badge('danger', '失败')
  return `<table class="data-table nt-records"><thead><tr><th>时间</th><th>事件</th><th>线索 / 会话</th><th>推送到</th><th>结果</th><th></th></tr></thead><tbody>
    ${nt.records.map(item => `<tr><td>${esc(item.time)}</td><td>${ntEventLabel(item.event)}</td><td><strong>${esc(item.subject)}</strong></td><td>${esc(item.target)}</td>
      <td>${statusBadge(item)}${item.error ? `<small>${esc(item.error)}</small>` : ''}</td>
      <td>${item.status === 'failed' ? `<button type="button" class="cfg-btn sm outline" data-nt-repush="${item.id}">${icon('refresh', 'xs')}<span>重推</span></button>` : ''}</td></tr>`).join('')}
  </tbody></table>`
}

function ntRules() {
  const rules = [
    ['新线索', '访客留资、AI 判断完意向后推送；判断失败也会带兜底文案推送，不会卡住。'],
    ['请求人工', '访客发起转人工时推送，同一会话只推一次；一期不做超时提醒和重发。'],
    ['调试会话', '概览和能力调试台里产生的线索、转人工都不推送。'],
    ['失败重试', '每条推送最多试 4 次，间隔约 30 秒、1 分钟、2 分钟；仍失败会出现在推送记录和「线索」里，可以手动重推。'],
    ['生效范围', '保存后只对之后产生的线索和转人工生效，不补推历史数据。']
  ]
  return `<dl class="nt-rules">${rules.map(([term, text]) => `<dt>${term}</dt><dd>${text}</dd>`).join('')}</dl>`
}

function renderNtHome() {
  const saved = ntSaved()
  const cards = [
    ntCard({ key: 'wecom', logo: '企', theme: 'wecom', name: '企业微信群机器人', desc: '新线索和转人工提醒推送到企业微信群，销售、客服在群里第一时间看到。', events: ['新线索', '请求人工'], status: ntWecomStatus(saved) }),
    ntCard({ key: 'jdy', logo: '简', theme: 'jdy', name: '简道云表单', desc: '新线索按字段映射自动写入简道云表单，可以接着触发线索分配或审批流程。', events: ['新线索'], status: ntJdyStatus(saved) }),
    ntCard({ key: 'feishu', logo: '飞', theme: 'feishu', name: '飞书群机器人', desc: '新线索和转人工提醒推送到飞书群。', events: ['新线索', '请求人工'], soon: true }),
    ntCard({ key: 'dingtalk', logo: '钉', theme: 'dingtalk', name: '钉钉群机器人', desc: '新线索和转人工提醒推送到钉钉群。', events: ['新线索', '请求人工'], soon: true }),
    ntCard({ key: 'webhook', logo: icon('code'), theme: 'webhook', name: '通用 Webhook', desc: '事件以 JSON 推送到你自己的系统或 CRM，带签名校验。', events: ['新线索', '请求人工'], soon: true }),
    ntCard({ key: 'email', logo: icon('message'), theme: 'email', name: '邮件', desc: '新线索和转人工提醒发送到指定邮箱。', events: ['新线索', '请求人工'], soon: true })
  ]
  return cfgPage('notifications', `${renderCfgHeader({ title: '通知推送', desc: '新线索和转人工请求产生时，推送到销售、客服在用的工具，或者写进业务系统。这里的配置保存后立即生效，不进入草稿和发布。', extra: badge('info', '保存即生效') })}
    <section class="cfg-body">
      <div class="nt-grid">${cards.join('')}</div>
      ${cfgPanel('推送记录', '最近的推送结果。失败会自动重试，仍失败的可以在这里重推。', ntRecordsTable(), { flush: true })}
      ${cfgPanel('推送规则', '', ntRules())}
    </section>`)
}

/* ---------- 详情页通用 ---------- */

function ntActions(key) {
  const dirty = ntSectionDirty(key)
  return `${dirty ? badge('warning', '有未保存的改动') : badge('success', '已保存')}
    <button type="button" class="cfg-btn ghost" data-nt-discard ${dirty ? '' : 'disabled'}>放弃改动</button>
    <button type="button" class="cfg-btn primary" data-nt-save ${dirty ? '' : 'disabled'}>${icon('save', 'sm')}<span>保存</span></button>`
}

function ntDetailHeader(key, { title, desc, before = '' }) {
  return renderCfgHeader({
    title, desc,
    crumb: `<button type="button" class="cfg-crumb" data-nt-back>${icon('arrow-left', 'xs')}<span>通知推送</span></button>`,
    actions: `${before}<span id="nt-actions" class="cfg-action-group">${ntActions(key)}</span>`
  })
}

function ntLeaveNotice() {
  if (!nt.leave) return ''
  return `<div class="cfg-notice" role="alert"><span class="cfg-notice-icon">${icon('alert', 'sm')}</span><div>还有没保存的改动，离开前要保存吗？</div>
    <div class="cfg-notice-actions"><button type="button" class="cfg-btn sm primary" data-nt-leave="save">保存并返回</button> <button type="button" class="cfg-btn sm outline" data-nt-leave="discard">放弃改动</button> <button type="button" class="cfg-btn sm ghost" data-nt-leave="stay">留在本页</button></div></div>`
}

function ntDetailPage(key, header, main, side) {
  return cfgPage(`nt-${key}`, `${header}
    <section class="cfg-body"><div class="agent-config-layout nt-layout"><div class="agent-config-main">${ntLeaveNotice()}${main}</div><div id="nt-side" class="agent-config-side">${side}</div></div></section>`)
}

/* ---------- 企业微信群机器人 ---------- */

function ntBotCard(bot, index) {
  const base = `wecom.bots.${index}`
  const test = nt.tests[bot.id]
  const error = nt.errors[bot.id]
  const scopes = NT_SCOPES.map(([value, label]) => `<option value="${value}" ${bot.scope === value ? 'selected' : ''}>${label}</option>`).join('')
  return `<article class="nt-bot">
    <header class="nt-bot-head"><span class="nt-logo wecom sm">企</span>
      <input class="nt-bot-name" value="${esc(bot.name)}" data-nt="${base}.name" maxlength="20" aria-label="群名称" placeholder="群名称，例如：销售线索群" />
      <button type="button" class="cfg-btn sm outline" data-nt-bot-test="${index}" ${test?.state === 'sending' ? 'disabled' : ''}>${icon('send', 'xs')}<span>发送测试消息</span></button>
      <button type="button" class="cfg-btn sm ghost" data-nt-bot-remove="${index}" aria-label="删除${esc(bot.name)}" title="删除">${icon('trash', 'xs')}</button>
    </header>
    <div class="cfg-form-grid">
      ${field('Webhook 地址', `<input type="url" value="${esc(bot.url)}" data-nt="${base}.url" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…" spellcheck="false" ${error ? 'aria-invalid="true"' : ''} />`, { full: true, help: error ? `<span class="nt-error">${esc(error)}</span>` : NT_URL_HELP })}
      <div class="cfg-field"><label>接收的事件</label><div class="nt-checks">${NT_EVENTS.map(([key, label]) => `<label class="console-checkbox"><input type="checkbox" data-nt="${base}.events.${key}" ${bot.events[key] ? 'checked' : ''} /><span>${label}</span></label>`).join('')}</div></div>
      ${field('新线索范围', `<select data-nt="${base}.scope" ${bot.events.lead ? '' : 'disabled'}>${scopes}</select>`, { help: bot.events.lead ? '「请求人工」不受这项影响。' : '没有订阅「新线索」。' })}
    </div>
    ${test ? `<p class="nt-test ${test.state}" role="status">${test.state === 'sending' ? '正在发送测试消息…' : esc(test.text)}</p>` : ''}
  </article>`
}

function ntWecomMessage(event, bot) {
  const s = NT_SAMPLE
  const rows = event === 'lead'
    ? [['手机号', s.phone], ['微信 / 邮箱', s.wechat || s.email || '-'], ['名称 / 组织', s.company || s.name], ['摘要', s.need_summary], ['判断', s.grade_reason], ['来源页面', s.source_page]]
    : [['访客', `${s.name} · ${s.company}`], ['原因', '访客要求人工报价'], ['最近一句', '能不能找个人给我报个价？'], ['来源页面', s.source_page]]
  const title = event === 'lead' ? `新联系人记录 · ${s.grade_label}` : '访客请求人工接入'
  return `<div class="nt-wecom-chat"><span class="nt-wecom-avatar">${icon('bot', 'xs')}</span><div class="nt-wecom-bubble"><small>${esc(bot.name || '群机器人')}</small>
    <div class="nt-wecom-md"><strong>${title}</strong>${rows.map(([label, value]) => `<p><span>${label}：</span>${esc(value)}</p>`).join('')}<p><span>会话：</span><a>${event === 'lead' ? '查看会话摘要' : '进入会话接管'}</a></p></div></div></div>`
}

function renderNtWecomSide() {
  const bots = nt.form.wecom.bots
  const index = Math.min(nt.previewBot, Math.max(bots.length - 1, 0))
  const bot = bots[index]
  const tabs = `<div class="nt-seg" role="tablist">${NT_EVENTS.map(([key, label]) => `<button type="button" role="tab" aria-selected="${nt.previewEvent === key}" class="${nt.previewEvent === key ? 'active' : ''}" data-nt-preview-event="${key}">${label}</button>`).join('')}</div>`
  const pick = bots.length > 1 ? `<select class="cfg-select nt-preview-bot" data-nt-preview-bot aria-label="预览哪个群">${bots.map((item, i) => `<option value="${i}" ${i === index ? 'selected' : ''}>${esc(item.name || `群机器人 ${i + 1}`)}</option>`).join('')}</select>` : ''
  let body
  if (!bot) body = '<div class="cfg-empty">添加群机器人后可以预览消息。</div>'
  else if (!bot.events[nt.previewEvent]) body = `<div class="cfg-empty">「${esc(bot.name || '这个群')}」没有订阅「${ntEventLabel(nt.previewEvent)}」，不会收到这条消息。</div>`
  else body = ntWecomMessage(nt.previewEvent, bot)
  const steps = `<ol class="nt-steps"><li>在电脑端企业微信打开要接收通知的群。</li><li>群设置 → 群机器人 → 添加机器人，起个名字。</li><li>复制机器人的 Webhook 地址粘贴到左边，点「发送测试消息」确认群里能收到。</li></ol>`
  return `${cfgPanel('消息预览', '按示例线索生成，实际内容以线索为准。', `<div class="nt-preview-tools">${tabs}${pick}</div>${body}`)}
    ${cfgPanel('怎么添加群机器人', '', steps)}`
}

function renderNtWecom() {
  const bots = nt.form.wecom.bots
  const list = bots.length ? bots.map(ntBotCard).join('') : '<div class="cfg-empty">还没有群机器人。添加一个，把新线索推到销售群。</div>'
  const add = bots.length < NT_MAX_BOTS
    ? `<button type="button" class="cfg-btn outline" data-nt-bot-add>${icon('plus', 'sm')}<span>添加群机器人</span></button>`
    : `<small class="nt-muted">最多添加 ${NT_MAX_BOTS} 个群机器人。</small>`
  const main = cfgPanel('群机器人', '每个群单独选择接收哪些事件；同一事件会推送到所有订阅了它的群。', `<div class="nt-bots">${list}</div><div class="nt-bots-foot">${add}</div>`)
  return ntDetailPage('wecom', ntDetailHeader('wecom', { title: '企业微信群机器人', desc: '在企业微信群里添加群机器人，把它的 Webhook 地址填到这里。保存后立即生效。' }), main, renderNtWecomSide())
}

function ntTestBot(index) {
  const bot = nt.form.wecom.bots[index]
  if (!bot) return
  const url = bot.url.trim()
  if (!url) nt.tests[bot.id] = { state: 'fail', text: '先填写 Webhook 地址。' }
  else if (!ntIsUrl(url)) nt.tests[bot.id] = { state: 'fail', text: 'Webhook 地址无效，必须是完整的 HTTP(S) 地址。' }
  else {
    nt.tests[bot.id] = { state: 'sending' }
    setTimeout(() => {
      const ok = /^https:\/\/qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=[\w-]{8,}/.test(url)
      nt.tests[bot.id] = ok
        ? { state: 'ok', text: `测试消息已发送（${nowClock()}），去群里确认一下。` }
        : { state: 'fail', text: '发送失败：企业微信返回 93000，Webhook 地址无效或机器人已被移出群。' }
      if (state.route === 'agent' && state.agentSection === 'notifications' && nt.view === 'wecom') renderApp()
    }, 700)
  }
  renderApp()
}

/* ---------- 简道云表单 ---------- */

function ntMapControl(widget, mapping) {
  if (!NT_JDY_SUPPORTED.includes(widget.type)) return '<small class="nt-muted">该字段类型暂不支持写入</small>'
  const choice = mapping ? (mapping.source || NT_FIXED) : ''
  const sources = NT_LEAD_SOURCES.map(([key, label]) => `<option value="${key}" ${choice === key ? 'selected' : ''}>${label}</option>`).join('')
  const select = `<select data-nt-map="${widget.name}" aria-label="${esc(widget.label)}写入内容"><option value="">不写入</option><optgroup label="线索字段">${sources}</optgroup><option value="${NT_FIXED}" ${choice === NT_FIXED ? 'selected' : ''}>固定值 / 模板</option></select>`
  if (choice !== NT_FIXED) return `<div class="nt-map-control">${select}</div>`
  const value = mapping.value || ''
  const fixed = widget.options && !NT_JDY_LIST_TYPES.includes(widget.type)
    ? `<select data-nt-map-value="${widget.name}" aria-label="${esc(widget.label)}固定值"><option value="">选择表单选项</option>${widget.options.map(option => `<option ${value === option ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select>`
    : `<input value="${esc(value)}" data-nt-map-value="${widget.name}" aria-label="${esc(widget.label)}固定值" placeholder="${NT_JDY_LIST_TYPES.includes(widget.type) ? '多个选项用顿号分隔，如：FineReport、FineBI' : '如：AI 客服，或 {need_summary} 回放：{replay_url}'}" />`
  return `<div class="nt-map-control">${select}${fixed}</div>`
}

function ntJdyValue(widget, mapping) {
  const text = String((mapping.source ? NT_SAMPLE[mapping.source] : ntTemplate(mapping.value)) ?? '').trim()
  if (!text) return ''
  if (widget.type === 'number') return Number.isFinite(Number(text)) ? String(Number(text)) : ''
  if (NT_JDY_LIST_TYPES.includes(widget.type)) return text.split(/[,，、;；\n]+/).map(item => item.trim()).filter(Boolean).join(' / ')
  return text.slice(0, widget.type === 'textarea' ? 20000 : 2000)
}

function ntAddMinutes(clock, minutes) {
  const [h, m] = clock.split(':').map(Number)
  const total = h * 60 + m + Number(minutes || 0)
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function renderNtJdySide() {
  const j = nt.form.jdy
  const issues = ntJdyIssues(j)
  const rows = ntWidgets(j).filter(widget => j.fields[widget.name]).map(widget => [widget.label, ntJdyValue(widget, j.fields[widget.name])]).filter(([, value]) => value)
  const notice = !j.enabled
    ? `<div class="cfg-notice info nt-side-notice"><span class="cfg-notice-icon">${icon('alert', 'sm')}</span><div>还没启用，保存后也不会写入。</div></div>`
    : issues.length
      ? `<div class="cfg-notice nt-side-notice"><span class="cfg-notice-icon">${icon('alert', 'sm')}</span><div>${issues.join('<br>')}</div></div>`
      : ''
  const body = rows.length
    ? `<dl class="nt-record">${rows.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`
    : '<div class="cfg-empty">还没有映射字段，左边选好表单后配置。</div>'
  return cfgPanel('写入预览', '按示例线索「张先生 · 星云制造集团」生成，空值字段不写入。', `${notice}<p class="nt-when">${icon('clock', 'xs')}<span>示例线索 11:56 留资，${Number(j.delay) || 0} 分钟后（${ntAddMinutes('11:56', j.delay)}）写入，只写一次。</span></p>${body}`)
}

function renderNtJdy() {
  const j = nt.form.jdy
  const keyReady = Boolean(j.apiKey.trim() || j.apiKeySet)
  const widgets = ntWidgets(j)
  const mapped = ntMapped(j).length

  const connect = cfgPanel('连接简道云', '用简道云开放平台的 API Key 读取应用和表单。', `<div class="cfg-form-grid">
    ${field('API Key', `<input type="password" autocomplete="off" value="${esc(j.apiKey)}" data-nt="jdy.apiKey" placeholder="${j.apiKeySet ? '已配置，留空保持不变' : '在简道云「开放平台 › 密钥管理」创建'}" />`, { help: '保存后不再显示，只能重新填写覆盖。' })}
    ${field('接口地址（可选）', `<input type="url" value="${esc(j.baseUrl)}" data-nt="jdy.baseUrl" placeholder="公有云留空；私有部署填域名，如 https://jdy.example.com" spellcheck="false" />`, { help: '粘贴完整接口地址也可以，保存时只保留协议和域名。' })}
  </div>`)

  const appControl = nt.jdyApps.length
    ? `<select data-nt-jdy-app><option value="">请选择应用</option>${nt.jdyApps.map(app => `<option value="${app.id}" ${j.appId === app.id ? 'selected' : ''}>${esc(app.name)}</option>`).join('')}</select>`
    : `<div class="nt-inline"><button type="button" class="cfg-btn outline" data-nt-jdy-load ${keyReady && nt.jdyBusy !== 'apps' ? '' : 'disabled'}>${icon('refresh', 'sm')}<span>${nt.jdyBusy === 'apps' ? '读取中…' : j.appId ? '重新选择应用' : '读取应用列表'}</span></button>${j.appName ? `<span class="nt-muted">当前：${esc(j.appName)}</span>` : ''}</div>`
  const visibleForms = nt.jdyFilter.trim() ? nt.jdyForms.filter(item => item.name.includes(nt.jdyFilter.trim())) : nt.jdyForms
  const formControl = nt.jdyForms.length
    ? `<div class="nt-form-picker"><input value="${esc(nt.jdyFilter)}" data-nt-jdy-filter aria-label="筛选表单" placeholder="筛选 ${nt.jdyForms.length} 个表单" />
        <select data-nt-jdy-form><option value="">请选择表单</option>${visibleForms.map(item => `<option value="${item.id}" ${j.entryId === item.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></div>`
    : `<p class="nt-muted nt-placeholder">${nt.jdyBusy === 'forms' ? '正在读取表单…' : esc(j.entryName) || '先选择应用'}</p>`
  const target = cfgPanel('目标表单', j.entryName ? `新线索会写入「${esc(j.appName)} / ${esc(j.entryName)}」。` : '选择要写入的应用和表单。', `${nt.jdyError ? `<div class="cfg-notice danger nt-side-notice" role="alert"><span class="cfg-notice-icon">${icon('alert', 'sm')}</span><div>${esc(nt.jdyError)}</div></div>` : ''}
    <div class="cfg-form-grid">${field('应用', appControl, { help: keyReady ? '' : '先填写 API Key。' })}${field('表单', formControl)}</div>`)

  const table = widgets.length
    ? `<table class="data-table nt-map-table" aria-label="简道云字段映射"><thead><tr><th>表单字段</th><th>写入内容</th></tr></thead><tbody>
        ${widgets.map(widget => `<tr class="${NT_JDY_SUPPORTED.includes(widget.type) ? '' : 'is-off'}"><td><strong>${esc(widget.label)}</strong><small>${NT_JDY_TYPES[widget.type] || widget.type} · ${widget.name}</small></td><td>${ntMapControl(widget, j.fields[widget.name])}</td></tr>`).join('')}
      </tbody></table>
      <p class="nt-map-foot">模板可以引用 {name}、{phone}、{need_summary}、{replay_url} 等线索字段的键。单选、下拉字段的固定值必须和表单选项文字完全一致；值为空的字段不写入。</p>`
    : '<div class="cfg-empty nt-map-empty">选好表单后，这里会列出表单的全部字段。</div>'
  const mapping = cfgPanel('字段映射', `${mapped} 个字段会被写入。`, table, { flush: true, actions: `<button type="button" class="cfg-btn sm outline" data-nt-jdy-auto ${widgets.length ? '' : 'disabled'}>${icon('spark', 'xs')}<span>按名称自动匹配</span></button>` })

  const timing = cfgPanel('写入时机', '', `<div class="cfg-form-grid">
    ${field('留资后等待（分钟）', `<input type="number" min="0" max="60" value="${esc(j.delay)}" data-nt="jdy.delay" data-nt-type="number" />`, { help: '0–60，默认 5。访客常在留下手机号之后才说公司、称呼，等待期间补充的信息会一并写入。' })}
    <div class="cfg-field"><label>写入后</label><div class="nt-checks col">
      <label class="console-checkbox"><input type="checkbox" data-nt="jdy.startTrigger" ${j.startTrigger ? 'checked' : ''} /><span>触发智能助手（如线索自动分配）</span></label>
      <label class="console-checkbox"><input type="checkbox" data-nt="jdy.startWorkflow" ${j.startWorkflow ? 'checked' : ''} /><span>发起流程（仅流程表单）</span></label>
    </div></div>
  </div>`)

  const toggle = `<label class="cfg-capdetail-switch"><span>${j.enabled ? '已启用' : '未启用'}</span><button type="button" class="cfg-switch ${j.enabled ? 'on' : ''}" role="switch" aria-checked="${j.enabled}" aria-label="启用简道云表单写入" data-nt-jdy-toggle></button></label>`
  return ntDetailPage('jdy', ntDetailHeader('jdy', { title: '简道云表单', desc: '新线索产生后，按字段映射在指定的简道云表单里新建一条数据。只对之后产生的线索生效。', before: toggle }), `${connect}${target}${mapping}${timing}`, renderNtJdySide())
}

function ntJdyLoadApps() {
  const j = nt.form.jdy
  const key = j.apiKey.trim()
  nt.jdyError = ''
  if (key && key.length < 8) { nt.jdyError = '简道云错误 17018：API Key 无效'; return renderApp() }
  nt.jdyBusy = 'apps'
  renderApp()
  setTimeout(() => {
    nt.jdyBusy = ''
    nt.jdyApps = NT_JDY_APPS
    if (j.appId) nt.jdyForms = NT_JDY_FORMS[j.appId] || []
    if (nt.view === 'jdy') renderApp()
  }, 600)
}

function ntJdySelectApp(appId) {
  const j = nt.form.jdy
  const app = NT_JDY_APPS.find(item => item.id === appId)
  Object.assign(j, { appId, appName: app?.name || '', entryId: '', entryName: '', fields: {} })
  nt.jdyForms = []
  nt.jdyFilter = ''
  if (!appId) return renderApp()
  nt.jdyBusy = 'forms'
  renderApp()
  setTimeout(() => {
    nt.jdyBusy = ''
    nt.jdyForms = NT_JDY_FORMS[appId] || []
    if (nt.view === 'jdy') renderApp()
  }, 400)
}

function ntJdyAutoMatch() {
  const j = nt.form.jdy
  let count = 0
  ntWidgets(j).forEach(widget => {
    const rule = NT_JDY_AUTO[widget.label]
    if (!rule || !NT_JDY_SUPPORTED.includes(widget.type)) return
    j.fields[widget.name] = { ...rule }
    count += 1
  })
  toast(count ? `已按名称匹配 ${count} 个字段，可以继续调整` : '没有找到名称能对上的字段', count ? 'success' : 'info')
  renderApp()
}

/* ---------- 保存、放弃、离开 ---------- */

function ntSave(key) {
  const form = nt.form
  if (key === 'wecom') {
    nt.errors = {}
    form.wecom.bots.forEach((bot, index) => {
      bot.name = bot.name.trim() || `群机器人 ${index + 1}`
      bot.url = bot.url.trim()
      if (!bot.url) nt.errors[bot.id] = '还没有填 Webhook 地址。'
      else if (!ntIsUrl(bot.url)) nt.errors[bot.id] = 'Webhook 地址无效，必须是完整的 HTTP(S) 地址。'
      else if (!bot.events.lead && !bot.events.handoff) nt.errors[bot.id] = '至少选择一个要接收的事件。'
    })
    if (Object.keys(nt.errors).length) {
      toast('有群机器人没配好，改好再保存', 'info')
      renderApp()
      return false
    }
  }
  if (key === 'jdy') {
    const j = form.jdy
    if (j.apiKey.trim()) j.apiKeySet = true
    j.apiKey = ''
    j.baseUrl = ntBaseUrl(j.baseUrl)
    j.delay = Math.min(60, Math.max(0, Math.round(Number(j.delay) || 0)))
    j.fields = Object.fromEntries(ntMapped(j))
  }
  const saved = ntSaved()
  saved[key] = ntClone(form[key])
  nt.saved = JSON.stringify(saved)
  try { localStorage.setItem(NT_STORAGE_KEY, nt.saved) } catch (_) {}
  if (key === 'wecom') toast('企业微信群机器人已保存，立即生效')
  else if (!form.jdy.enabled) toast('已保存，简道云写入还没启用', 'info')
  else if (ntJdyIssues(form.jdy).length) toast('已保存，但配置不完整，暂时不会写入', 'info')
  else toast('简道云表单写入已生效，新线索会自动写入所选表单')
  return true
}

function ntDiscard(key) {
  nt.form[key] = ntClone(ntSaved()[key])
  nt.errors = {}
  nt.tests = {}
  nt.jdyError = ''
}

function ntRepush(id) {
  const record = nt.records.find(item => item.id === id)
  if (!record) return
  Object.assign(record, { status: 'success', error: '', time: '刚刚' })
  const row = leads.find(item => item[0] === record.leadName)
  if (row) row[6] = '已推送'
  toast(`已重新推送到${record.target}`)
  renderApp()
}

/** 「线索」页重推成功后，推送记录里对应的失败也算送达。 */
function ntMarkLeadPushed(name) {
  nt.records.forEach(item => { if (item.leadName === name && item.status === 'failed') Object.assign(item, { status: 'success', error: '', time: '刚刚' }) })
}

function ntRefreshChrome() {
  const actions = document.getElementById('nt-actions')
  if (actions) actions.innerHTML = ntActions(nt.view)
  const side = document.getElementById('nt-side')
  if (side) side.innerHTML = nt.view === 'jdy' ? renderNtJdySide() : renderNtWecomSide()
}

/* ---------- 事件 ---------- */

const ntOnPage = () => state.route === 'agent' && state.agentSection === 'notifications'

function ntHandleClick(event) {
  const pick = selector => event.target.closest(selector)
  let el
  // 从侧边栏切换页面时回到首页；有没保存的改动就留在详情页，回来还能接着改
  if ((el = pick('[data-agent-section]')) && !el.closest('.cfg-page')) {
    if (!ntSectionDirty(nt.view)) nt.view = null
    nt.leave = false
    return false
  }
  if ((el = pick('[data-nt-goto]'))) { nt.view = el.dataset.ntGoto; nt.leave = false; return false }
  if (!ntOnPage()) return false

  if ((el = pick('[data-nt-open]'))) {
    nt.view = el.dataset.ntOpen
    nt.leave = false
    if (!ntSectionDirty(nt.view)) Object.assign(nt, { jdyApps: [], jdyForms: [], jdyFilter: '', jdyError: '', tests: {}, errors: {} })
    renderApp()
    return true
  }
  if ((el = pick('[data-nt-repush]'))) { ntRepush(el.dataset.ntRepush); return true }
  if (pick('[data-nt-back]')) {
    if (ntSectionDirty(nt.view)) nt.leave = true
    else nt.view = null
    renderApp()
    return true
  }
  if ((el = pick('[data-nt-leave]'))) {
    const choice = el.dataset.ntLeave
    if (choice === 'save' && !ntSave(nt.view)) return true
    if (choice === 'discard') ntDiscard(nt.view)
    nt.leave = false
    if (choice !== 'stay') nt.view = null
    renderApp()
    return true
  }
  if ((el = pick('[data-nt-save]'))) { if (!el.disabled && ntSave(nt.view)) { nt.leave = false; renderApp() } return true }
  if ((el = pick('[data-nt-discard]'))) { if (!el.disabled) { ntDiscard(nt.view); toast('已放弃未保存的改动', 'info'); renderApp() } return true }

  if (pick('[data-nt-bot-add]')) {
    const bots = nt.form.wecom.bots
    if (bots.length >= NT_MAX_BOTS) return true
    bots.push({ id: `bot_${Date.now().toString(36)}`, name: `群机器人 ${bots.length + 1}`, url: '', events: { lead: true, handoff: true }, scope: 'all' })
    nt.previewBot = bots.length - 1
    renderApp()
    return true
  }
  if ((el = pick('[data-nt-bot-remove]'))) {
    const [bot] = nt.form.wecom.bots.splice(Number(el.dataset.ntBotRemove), 1)
    if (bot) { delete nt.tests[bot.id]; delete nt.errors[bot.id] }
    nt.previewBot = 0
    renderApp()
    return true
  }
  if ((el = pick('[data-nt-bot-test]'))) { ntTestBot(Number(el.dataset.ntBotTest)); return true }
  if ((el = pick('[data-nt-preview-event]'))) { nt.previewEvent = el.dataset.ntPreviewEvent; ntRefreshChrome(); return true }

  if (pick('[data-nt-jdy-toggle]')) { nt.form.jdy.enabled = !nt.form.jdy.enabled; renderApp(); return true }
  if ((el = pick('[data-nt-jdy-load]'))) { if (!el.disabled) ntJdyLoadApps(); return true }
  if ((el = pick('[data-nt-jdy-auto]'))) { if (!el.disabled) ntJdyAutoMatch(); return true }
  return false
}

function ntHandleInput(event) {
  const target = event.target
  if (!ntOnPage()) return false
  if (target.matches('[data-nt]') && target.type !== 'checkbox' && target.tagName !== 'SELECT') {
    ntSetPath(target.dataset.nt, target.dataset.ntType === 'number' ? (target.value === '' ? '' : Number(target.value)) : target.value)
    const bot = target.dataset.nt.match(/^wecom\.bots\.(\d+)\.url$/)
    if (bot) {
      const id = nt.form.wecom.bots[Number(bot[1])]?.id
      if (nt.errors[id] || nt.tests[id]) {
        delete nt.errors[id]
        delete nt.tests[id]
        target.removeAttribute('aria-invalid')
        const help = target.closest('.cfg-field')?.querySelector('small')
        if (help) help.textContent = NT_URL_HELP
        target.closest('.nt-bot')?.querySelector('.nt-test')?.remove()
      }
    }
    if (target.dataset.nt === 'jdy.apiKey') {
      nt.jdyError = ''
      const load = document.querySelector('[data-nt-jdy-load]')
      if (load) load.disabled = !(target.value.trim() || nt.form.jdy.apiKeySet)
    }
    ntRefreshChrome()
    return true
  }
  if (target.matches('[data-nt-map-value]')) {
    const mapping = nt.form.jdy.fields[target.dataset.ntMapValue]
    if (mapping) mapping.value = target.value
    ntRefreshChrome()
    return true
  }
  if (target.matches('[data-nt-jdy-filter]')) {
    nt.jdyFilter = target.value
    const select = document.querySelector('[data-nt-jdy-form]')
    const keyword = target.value.trim()
    if (select) select.innerHTML = `<option value="">请选择表单</option>${nt.jdyForms.filter(item => !keyword || item.name.includes(keyword)).map(item => `<option value="${item.id}" ${nt.form.jdy.entryId === item.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}`
    return true
  }
  return false
}

function ntHandleChange(event) {
  const target = event.target
  if (!ntOnPage()) return false
  if (target.matches('[data-nt]') && (target.type === 'checkbox' || target.tagName === 'SELECT')) {
    ntSetPath(target.dataset.nt, target.type === 'checkbox' ? target.checked : target.value)
    renderApp()
    return true
  }
  if (target.matches('[data-nt="jdy.delay"]')) {
    nt.form.jdy.delay = Math.min(60, Math.max(0, Math.round(Number(target.value) || 0)))
    renderApp()
    return true
  }
  if (target.matches('[data-nt-map]')) {
    const fields = nt.form.jdy.fields
    const name = target.dataset.ntMap
    if (!target.value) delete fields[name]
    else if (target.value === NT_FIXED) fields[name] = { value: fields[name]?.value || '' }
    else fields[name] = { source: target.value }
    renderApp()
    return true
  }
  if (target.matches('[data-nt-jdy-app]')) { ntJdySelectApp(target.value); return true }
  if (target.matches('[data-nt-jdy-form]')) {
    const j = nt.form.jdy
    const entry = nt.jdyForms.find(item => item.id === target.value)
    Object.assign(j, { entryId: target.value, entryName: entry?.name || '', fields: {} })
    renderApp()
    return true
  }
  if (target.matches('[data-nt-preview-bot]')) { nt.previewBot = Number(target.value); ntRefreshChrome(); return true }
  return target.matches('[data-nt-map-value], [data-nt-jdy-filter], [data-nt]')
}
