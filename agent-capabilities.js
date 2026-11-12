/*
 * 能力页：能力列表、每个能力的配置详情与右侧演示。
 * 按源码 console/src/pages/ActionsPage.tsx、components/demo/*、
 * 以及原型 overrides（测评式营销 / 留资弹窗 / 推荐消息 / MCP 调用）逐项还原。
 * 依赖 agent-config.js（cfg、esc、cfgPanel、renderCfgHeader…）与 app.js（icon、state、toast、renderApp），均在调用时访问。
 */

/* ---------- 常量与默认配置 ---------- */

/* 留资字段：一期只有六个系统字段，类型固定、可以关不能删；启用、显示名称、必填、顺序、占位文字、给 AI 的说明在能力里设。 */
const LEAD_SYSTEM_FIELDS = [
  { key: 'name', label: '姓名', type: '单行文本', placeholder: '怎么称呼你', ask: '怎么称呼你？' },
  { key: 'company', label: '公司', type: '单行文本', placeholder: '公司名称', ask: '你们是哪家公司？' },
  { key: 'phone', label: '手机号', type: '手机号', placeholder: '11 位手机号', ask: '方便留个手机号吗？顾问会尽快联系你。' },
  { key: 'wechat', label: '微信号', type: '单行文本', placeholder: '微信号', ask: '方便留个微信号吗？顾问加你微信沟通。' },
  { key: 'email', label: '邮箱', type: '邮箱', placeholder: 'name@company.com', ask: '方便留个邮箱吗？' },
  { key: 'use_case', label: '需求', type: '多行文本', placeholder: '想解决什么问题', ask: '主要想解决什么问题？' }
]
const LEAD_FIELD_META = Object.fromEntries(LEAD_SYSTEM_FIELDS.map(item => [item.key, item]))
const CONTACT_FIELDS = ['phone', 'wechat', 'email']
const LEAD_DEFAULT_MESSAGES = { success: '已收到，顾问会带着这次的聊天记录联系你。', failure: '提交没有成功，请稍后再试。' }
const LEAD_FORM_FIELD_WARN = 4
const HANDOFF_DEFAULT_MESSAGES = { online: '已为你提交转人工，前面还有 {排队人数} 位，预计等待 {分钟} 分钟。', offline: '现在人工不在线，留个联系方式，我们会尽快联系你。' }
const PROACTIVE_MESSAGE_MAX = 60
const IDLE_MAX_PER_SESSION = 3

function defaultLeadFields() {
  const on = { name: true, company: true, phone: true, wechat: true }
  return LEAD_SYSTEM_FIELDS.map(item => ({ key: item.key, label: item.label, enabled: Boolean(on[item.key]), required: false, placeholder: item.placeholder, ai_hint: '' }))
}

/** 把旧草稿（fields 为分组名数组 + form_fields）迁移成新的字段列表，并补齐缺省值。 */
function normalizeLeadCapture(lead) {
  const base = capabilityDefaults().actions.lead_capture
  const next = { ...base, ...(lead || {}) }
  const defaults = defaultLeadFields()
  let fields
  if (Array.isArray(next.fields) && next.fields.length && typeof next.fields[0] === 'object') {
    const seen = new Set()
    fields = next.fields.filter(item => item && LEAD_FIELD_META[item.key] && !seen.has(item.key) && seen.add(item.key)).map(item => ({ ...defaults.find(d => d.key === item.key), ...item }))
    defaults.forEach(item => { if (!seen.has(item.key)) fields.push({ ...item, enabled: false }) })
  } else if (Array.isArray(next.fields)) {
    const group = key => CONTACT_FIELDS.includes(key) ? 'contact' : key
    const shown = Array.isArray(lead?.form_fields) ? new Map(lead.form_fields.filter(Boolean).map(item => [item.field, item])) : null
    fields = defaults.map(item => {
      const allowed = next.fields.includes(group(item.key))
      return { ...item, enabled: allowed && (shown ? shown.has(item.key) : true), required: Boolean(shown?.get(item.key)?.required) }
    })
  } else fields = defaults
  delete next.form_fields
  next.fields = fields
  next.interaction = next.interaction === 'text' ? 'text' : 'widget'
  next.max_invites = Math.min(3, Math.max(1, Number(next.max_invites) || 2))
  if (typeof next.success_message !== 'string') next.success_message = LEAD_DEFAULT_MESSAGES.success
  if (typeof next.failure_message !== 'string') next.failure_message = LEAD_DEFAULT_MESSAGES.failure
  return next
}

const leadFieldsOf = lead => (lead?.fields || []).filter(item => item && typeof item === 'object' && LEAD_FIELD_META[item.key])
const enabledLeadFields = lead => leadFieldsOf(lead).filter(item => item.enabled)
const leadHasContactField = lead => enabledLeadFields(lead).some(item => CONTACT_FIELDS.includes(item.key))
/** 访客看到的字段名：运营改过名就用新名字。 */
function fieldLabel(key, lead = C().actions.lead_capture) {
  const item = leadFieldsOf(lead).find(field => field.key === key)
  return (item?.label || '').trim() || LEAD_FIELD_META[key]?.label || key
}
const leadMessage = (lead, kind) => String(lead?.[`${kind}_message`] || '').trim() || LEAD_DEFAULT_MESSAGES[kind]

/** 某个能力开启时有哪些不能发布的问题（能力页直接标出，发布时拦住）。 */
function capIssues(id, d = C()) {
  const issues = []
  if (id === 'proactive' && d.proactive.enabled && !String(d.proactive.message || '').trim()) issues.push('主动弹窗：主动消息开启时，默认文案不能为空')
  if (id === 'idle_follow_up' && d.idle_follow_up.enabled) {
    if (!d.idle_follow_up.steps.length) issues.push('沉默跟进：开启时至少要有一条跟进话术')
    else if (d.idle_follow_up.steps.some(step => !String(step.message || '').trim())) issues.push('沉默跟进：开启时话术不能为空')
  }
  if (id === 'mcp' && d.mcp.enabled && d.mcp.servers.some(server => !/^https:\/\//i.test(String(server.url || '').trim()))) issues.push('MCP 调用：服务地址只接受 HTTPS')
  return issues
}

/** 发布前的硬性校验；有问题返回提示文字。 */
function capPublishError() {
  const issue = ['proactive', 'idle_follow_up', 'mcp'].flatMap(id => capIssues(id))[0]
  if (issue) return `${issue}，否则不能发布`
  if (!leadHasContactField(C().actions.lead_capture)) return '留资表单的手机号、微信号、邮箱至少启用一项，否则不能发布'
  return ''
}

const TRIGGER_LABELS = { ai: 'AI 在对话中判断后调用', page: '前端按页面规则触发', entry: '访客点入口或 AI 邀请' }
const TRIGGER_ICONS = { ai: 'bot', entry: 'message', page: 'monitor' }

const ASSESSMENT_SUMMARY = '用几道选择题给访客做个小测评，自动出一份匹配的方案；想看完整方案先留联系方式。比直接要电话更自然，线索还自带需求画像。'
const LEAD_POPUP_SUMMARY = '不同页面弹出不同营销资料，如白皮书、案例集、测算表；访客留下联系方式后领取，线索带着“对什么感兴趣”。'
const RECOMMENDATIONS_SUMMARY = 'AI 在回答之后给出几个可以点的下一步问题，访客点一下就当作发了这句话。'
const MCP_SUMMARY = '在对话时实时调用企业接入的 MCP 服务，查库存、实时价格、订单状态、可预约时段这类会变的数据。'

/* testing: 一期不做的能力，原型里保留并标「测试」 */
const CAPABILITIES = [
  { id: 'lead_capture', name: '留资表单', icon: 'user-check', trigger: 'ai', summary: '收集访客的联系方式和需求，存成一条线索。AI 判断什么时候邀请，按你选的收集方式弹表单或在对话里问。', interaction: { kind: 'widget', label: '联系表单' } },
  { id: 'assessment', name: '测评式营销', icon: 'circle-check', trigger: 'entry', summary: ASSESSMENT_SUMMARY, interaction: { kind: 'widget', label: '测评卡片' }, testing: true },
  { id: 'human_handoff', name: '转人工', icon: 'headset', trigger: 'ai', summary: '把对话加入控制台的人工列表，由销售或客服接管。', interaction: { kind: 'text', label: '纯文字' } },
  { id: 'asset_delivery', name: '资料交付', icon: 'file', trigger: 'ai', summary: '把知识库中带链接的资料以卡片形式发给访客；与引用溯源是两条独立通道。', interaction: { kind: 'widget', label: '资料卡片' }, testing: true },
  { id: 'recommendations', name: '推荐消息', icon: 'messages', trigger: 'ai', summary: RECOMMENDATIONS_SUMMARY, interaction: { kind: 'widget', label: '回答下方的一排按钮' } },
  { id: 'mcp', name: 'MCP 调用', icon: 'plug', trigger: 'ai', summary: MCP_SUMMARY, interaction: { kind: 'text', label: '纯文字' } },
  { id: 'lead_popup', name: '留资弹窗', icon: 'book', trigger: 'page', summary: LEAD_POPUP_SUMMARY, interaction: { kind: 'widget', label: '资料弹窗' }, testing: true },
  { id: 'proactive', name: '主动弹窗', icon: 'spark', trigger: 'page', summary: '访客还没开口时，按页面自动打开对话窗，或者先在入口旁边弹一句主动消息。', interaction: { kind: 'text', label: '自动打开对话窗 / 主动消息气泡' } },
  { id: 'idle_follow_up', name: '沉默跟进', icon: 'clock', trigger: 'page', summary: '访客开口、助手回复后访客迟迟不回，按顺序补发运营写好的跟进话术。', interaction: { kind: 'text', label: '纯文字' } }
]
const testingBadge = cap => cap.testing ? '<span class="cfg-badge warning" title="一期不做，原型里保留供测试">测试</span>' : ''

const DEFAULT_ASSESSMENT = {
  enabled: true,
  title: '官网获客力测评',
  intro: '4 道选择题，大约 1 分钟。答完马上告诉你官网获客处在哪个阶段，以及最适合你的提升方案。',
  entry_label: '免费测一测：你的官网获客力打几分？',
  show_entry_button: true,
  ai_invite: true,
  instructions: '访客在比较方案、不确定选哪个版本，或问“适不适合我们”时，邀请对方做测评；访客拒绝后不再重复邀请。',
  questions: [
    { id: 'q_traffic', title: '你的官网每月大概有多少访客？', multiple: false, options: [{ id: 'o1', label: '1 千以内', score: 0 }, { id: 'o2', label: '1 千 – 1 万', score: 10 }, { id: 'o3', label: '1 万 – 5 万', score: 20 }, { id: 'o4', label: '5 万以上', score: 30 }] },
    { id: 'q_today', title: '现在访客来咨询，主要怎么接待？', multiple: false, options: [{ id: 'o1', label: '没有在线咨询入口', score: 0 }, { id: 'o2', label: '留言表单，隔天回复', score: 5 }, { id: 'o3', label: '人工在线客服', score: 15 }, { id: 'o4', label: '有机器人，但经常答不准', score: 20 }] },
    { id: 'q_pain', title: '最想解决哪些问题？（可多选）', multiple: true, options: [{ id: 'o1', label: '夜间和周末没人接待', score: 5 }, { id: 'o2', label: '访客多、留资少', score: 10 }, { id: 'o3', label: '销售跟进不及时', score: 10 }, { id: 'o4', label: '不知道访客关心什么', score: 5 }] },
    { id: 'q_team', title: '有几位销售或客服在跟进线索？', multiple: false, options: [{ id: 'o1', label: '1 – 2 人', score: 5 }, { id: 'o2', label: '3 – 10 人', score: 10 }, { id: 'o3', label: '10 人以上', score: 20 }] }
  ],
  results: [
    { id: 'r_start', name: '起步型', min_score: 0, max_score: 39, headline: '先把咨询接住', diagnosis: '访客量和咨询链路都还在早期，现在最大的损失是“有人来了，没人接”。', plan: ['上线 AI 客服，7×24 小时接待，夜间和周末也不漏咨询', '导入官网和产品资料，常见问题由 AI 直接回答', '开启留资表单，有意向的访客一个都不错过'], cta_label: '免费开通', cta_url: 'https://xiguan.cn/signup' },
    { id: 'r_grow', name: '成长型', min_score: 40, max_score: 69, headline: '把流量变成线索', diagnosis: '已经有稳定流量，但大部分访客看完就走了，留资率还有很大提升空间。', plan: ['用快捷问题和主动弹窗，让更多访客愿意开口', 'AI 识别购买意向，在合适时机邀请留资，并自动给线索评级', '新线索实时推送到企业微信，销售 5 分钟内跟进'], cta_label: '预约产品演示', cta_url: 'https://xiguan.cn/demo' },
    { id: 'r_scale', name: '进阶型', min_score: 70, max_score: 100, headline: '打通线索到成交', diagnosis: '流量和团队都已成规模，关键是让每条线索被正确的人、在正确的时间跟进。', plan: ['按产品线配置多个智能体，各自回答、分别统计', '复杂需求一键转人工并生成工单，销售无缝接手', '线索与 CRM 打通，按渠道归因每一笔成交'], cta_label: '联系专属顾问', cta_url: 'https://xiguan.cn/contact' }
  ],
  gate: 'summary_first',
  attach_to_lead: true
}

const ASSESSMENT_GATES = [
  { value: 'summary_first', label: '先看结论，留资解锁完整方案', description: '访客先拿到等级和第一条建议，再留联系方式看全部内容；体验好，留资意愿最高。', recommended: true },
  { value: 'before_result', label: '留资后才出结果', description: '答完题先填联系方式再看结果；线索最多，但会有部分访客放弃。' },
  { value: 'none', label: '不要求留资', description: '直接给完整方案，方案下方保留一个「预约顾问」入口，适合做品牌口碑。' }
]

const POPUP_TRIGGERS = [
  { value: 'delay', label: '停留一段时间后', hint: '访客在页面停留满设定秒数后弹出' },
  { value: 'scroll', label: '页面滚动到一定位置', hint: '访客往下看到设定比例时弹出，说明在认真读' },
  { value: 'exit', label: '准备离开时', hint: '鼠标移向浏览器顶部（要关页面）时弹出，挽留一下' }
]
const POPUP_DELIVERIES = [
  { value: 'download', label: '提交后直接下载', hint: '体验最好，留资率最高' },
  { value: 'email', label: '发送到访客邮箱', hint: '能验证邮箱真实性；表单会要求填写邮箱' },
  { value: 'advisor', label: '由顾问发送', hint: '适合报价单等需要沟通的资料；提交后提示顾问会联系' }
]
const MATERIAL_KINDS = ['白皮书', '案例集', '测算工具', '产品手册', '资料包']

const DEFAULT_LEAD_POPUP = {
  enabled: true, frequency_days: 7, skip_known_visitors: true, attach_to_lead: true,
  rules: [
    { id: 'popup_pricing', enabled: true, page_pattern: '/pricing*', page_label: '价格页', trigger: 'delay', delay_seconds: 20, scroll_percent: 50, material: { kind: '测算工具', title: '官网获客 ROI 测算表', description: '填入月访客量和客单价，3 分钟算出上线 AI 客服后每月多拿多少线索。', highlights: ['按行业预置转化率基准', '自动生成投入产出对比图', '可直接发给老板看'], file_name: '官网获客ROI测算表.xlsx', file_size: '86 KB' }, button_label: '免费领取测算表', delivery: 'download' },
    { id: 'popup_blog', enabled: true, page_pattern: '/blog/*', page_label: '博客文章', trigger: 'scroll', delay_seconds: 15, scroll_percent: 60, material: { kind: '白皮书', title: '2026 B2B 官网 AI 客服落地白皮书', description: '42 页，覆盖选型、上线、运营三个阶段，附 12 个常见坑和解决办法。', highlights: ['选型评估清单', '知识库搭建 SOP', '留资率提升 3 倍的话术模板'], file_name: 'B2B官网AI客服落地白皮书.pdf', file_size: '4.2 MB' }, button_label: '下载白皮书', delivery: 'email' },
    { id: 'popup_cases', enabled: true, page_pattern: '/cases*', page_label: '客户案例', trigger: 'exit', delay_seconds: 10, scroll_percent: 50, material: { kind: '案例集', title: '20 家 SaaS 企业官网获客案例集', description: '按行业整理的真实上线数据：上线前后的留资率、响应时间和成交周期变化。', highlights: ['覆盖 SaaS、教育、企业服务', '每个案例附关键配置截图', '平均留资率提升 2.7 倍'], file_name: 'SaaS官网获客案例集.pdf', file_size: '6.8 MB' }, button_label: '领取案例集', delivery: 'download' },
    { id: 'popup_enterprise', enabled: false, page_pattern: '/enterprise*', page_label: '企业版介绍', trigger: 'delay', delay_seconds: 30, scroll_percent: 50, material: { kind: '产品手册', title: '私有化部署方案说明', description: '部署架构、硬件要求、安全合规认证和实施周期说明。', highlights: ['部署架构图', '等保与数据合规说明', '标准实施排期'], file_name: '私有化部署方案说明.pdf', file_size: '2.1 MB' }, button_label: '获取方案说明', delivery: 'advisor' }
  ]
}

/* 推荐消息：一期只做 AI 生成；固定的推荐问题用外观里的快捷按钮 */
const REC_MAX_CHARS = 20
const REC_SHOW_MODES = [
  { value: 'ai', title: '由 AI 判断', sees: 'AI 觉得这一轮有值得接着问的，才在回答下方给出', fit: '大多数官网，不打扰访客' },
  { value: 'always', title: '每轮都给', sees: '每次回答下方都有几条可以点的问题', fit: '想尽量拉长对话、引导留资' }
]
const DEFAULT_RECOMMENDATIONS = {
  enabled: true, show: 'ai', max_items: 3,
  instructions: '访客问完功能后，推荐他问价格或同行案例；不推荐和当前话题无关的问题。'
}
/* 演示用：模拟 AI 按当前话题生成的追问（原型里没有真模型） */
const DEMO_REC_TOPICS = [
  { keywords: ['功能', '能做', '能力', '客服', '线索'], items: ['能接入企业微信吗？', '线索评级是怎么判断的？', '夜间也能自动回复吗？', '支持上传哪些格式的资料？'] },
  { keywords: ['价格', '收费', '多少钱', '版本', '专业版', '试用'], items: ['专业版和企业版有什么区别？', '有没有和我们同行业的客户案例可以参考一下呢？', '可以免费试用吗？', '超出会话量怎么计费？'] },
  { keywords: ['接入', '部署', '安装', '脚本', '私有化', '官网'], items: ['需要技术人员配合吗？', '支持私有化部署吗？', '上线大概需要多久？'] },
  { keywords: ['安全', '数据', '隐私', '加密', '权限'], items: ['访客联系方式谁能看到？', '数据存在哪里？', '支持单点登录吗？'] }
]
const DEMO_REC_FALLBACK = ['有同行业的客户案例吗？', '和传统在线客服有什么区别？']

/* MCP：一期只开放查询类工具；最多 3 个服务；只接受 HTTPS */
const MCP_MAX_SERVERS = 3
const MCP_TIMEOUT_SECONDS = 10
const MCP_MAX_RESULT_KB = 20
const MCP_AUTH = [['none', '无'], ['header', '请求头里的密钥']]
const DEFAULT_MCP = {
  enabled: true,
  instructions: '访客问到订单、发票进度或想预约演示时去查；参数不全先问访客，不猜。',
  servers: [{
    id: 'srv_business', name: '吸管业务系统（演示）', url: 'https://api.example.com/mcp', auth: 'header', key_saved: true, status: 'connected', failures_24h: 0,
    tools: [
      { id: 'tool_order', name: 'query_order', label: '查询订单与发票', enabled: true, read_only: true, description: '访客询问订单、付款或发票进度时调用；需要订单号（XG 开头）。没有订单号时先向访客要。', params: [{ name: 'order_id', label: '订单号', required: true, example: 'XG20261108001' }], sample_result: { order_id: 'XG20261108001', plan: '专业版（年付）', amount: 35760, paid_at: '2026-11-08', invoice_status: '已开具', invoice_no: 'INV-2026-11-0832', invoice_sent_to: 'f***@yunfan.example' } },
      { id: 'tool_slots', name: 'query_demo_slots', label: '查询可预约的演示时段', enabled: true, read_only: true, description: '访客想预约产品演示、问什么时候有空时调用；需要城市（线下）或“线上”。', params: [{ name: 'city', label: '城市或“线上”', required: true, example: '上海' }], sample_result: { city: '上海', slots: ['11-14 周五 14:00', '11-17 周一 10:00', '11-18 周二 15:30'] } },
      { id: 'tool_status', name: 'service_status', label: '查询服务状态', enabled: true, read_only: true, description: '访客反馈打不开、很慢或问系统是否正常时调用，不需要参数。', params: [], sample_result: { status: 'operational', components: [{ name: '对话服务', status: '正常' }, { name: '知识库检索', status: '正常' }, { name: '企业微信推送', status: '轻微延迟' }] } },
      { id: 'tool_ticket', name: 'query_ticket', label: '查询工单进度', enabled: false, read_only: null, description: '访客询问之前提交的问题处理到哪一步时调用；需要工单号（TKT 开头）。', params: [{ name: 'ticket_id', label: '工单号', required: true, example: 'TKT-000002' }], sample_result: { ticket_id: 'TKT-000002', status: '等待客户', assignee: '小周', updated_at: '2026-11-10 10:20' } },
      { id: 'tool_booking', name: 'update_booking', label: '修改预约', enabled: false, read_only: false, description: '修改访客已有的演示预约时间。', params: [{ name: 'booking_id', label: '预约号', required: true, example: 'BK-1029' }, { name: 'slot', label: '新时段', required: true, example: '11-17 周一 10:00' }], sample_result: { booking_id: 'BK-1029', slot: '11-17 周一 10:00' } },
      { id: 'tool_stock', name: 'query_stock_v1', label: '查询库存（旧版）', enabled: true, read_only: true, offline: true, description: '访客问具体型号有没有货时调用。', params: [{ name: 'sku', label: '型号', required: true, example: 'XG-PRO' }], sample_result: {} }
    ]
  }]
}

/** 旧草稿里的 MCP 配置迁移：写入类工具一期不开放，OAuth 改为请求头密钥，去掉不再使用的过程卡片设置。 */
function normalizeMcp(mcp) {
  const base = JSON.parse(JSON.stringify(DEFAULT_MCP))
  if (!mcp || typeof mcp !== 'object') return base
  const servers = Array.isArray(mcp.servers) && mcp.servers.length ? mcp.servers.slice(0, MCP_MAX_SERVERS) : base.servers
  return {
    enabled: mcp.enabled !== false,
    instructions: typeof mcp.instructions === 'string' ? mcp.instructions : base.instructions,
    servers: servers.map(server => ({
      ...server,
      auth: server.auth === 'none' ? 'none' : 'header',
      key_saved: server.key_saved ?? server.auth !== 'none',
      failures_24h: Number(server.failures_24h) || 0,
      tools: (server.tools || []).map(tool => {
        const readOnly = 'read_only' in tool ? tool.read_only : tool.kind === 'write' ? false : tool.kind === 'read' ? true : null
        return { ...tool, read_only: readOnly, enabled: readOnly === false ? false : Boolean(tool.enabled) }
      })
    }))
  }
}

/** 旧草稿里的推荐消息：预设场景、兜底问题、推荐区标题都不再使用。 */
function normalizeRecommendations(rec) {
  const base = { ...DEFAULT_RECOMMENDATIONS }
  if (!rec || typeof rec !== 'object') return base
  return {
    enabled: rec.enabled !== false,
    show: rec.show === 'always' ? 'always' : 'ai',
    max_items: Math.min(4, Math.max(1, Number(rec.max_items) || 3)),
    instructions: typeof rec.instructions === 'string' ? rec.instructions : base.instructions
  }
}

/** 智能体配置里与能力有关的部分（录制配置 + 原型演示数据）。 */
function capabilityDefaults() {
  return {
    actions: {
      lead_capture: { enabled: true, interaction: 'widget', form_size: 'medium', fields: defaultLeadFields(), max_invites: 2, success_message: LEAD_DEFAULT_MESSAGES.success, failure_message: LEAD_DEFAULT_MESSAGES.failure, instructions: '访客问到报价、试用、演示时邀请留手机号；先把他的问题答完再邀请。访客拒绝后不再追问，继续正常回答。' },
      human_handoff: { enabled: true, instructions: '访客明确要求人工、连续两次答不上、或者表达不满时转人工；转之前告诉访客要等一会。', online_message: HANDOFF_DEFAULT_MESSAGES.online, offline_message: HANDOFF_DEFAULT_MESSAGES.offline, help_url: 'https://help.xiguan.cn' },
      asset_delivery: { enabled: false, mode: 'immediate', max_items: 3, instructions: '访客明确索要白皮书、案例、产品手册或下载链接时，发送知识库里带链接的资料卡片。' }
    },
    auto_open: { enabled: false, delay_seconds: 5, page_rules: [{ pattern: '/pricing*', enabled: true, delay_seconds: 15 }, { pattern: '/enterprise*', enabled: true, delay_seconds: 10 }] },
    proactive: { enabled: false, instructions: '访客回复主动消息时，先按他正在看的页面介绍对应产品。', idle_seconds: 30, message: '看了一会儿了，需要我帮你对比一下各个版本吗？', page_rules: [{ pattern: '/docs/*', enabled: true, idle_seconds: 45, message: '接入遇到问题了吗？可以直接问我。' }, { pattern: '/cases*', enabled: true, idle_seconds: 30, message: '想看和你们同行业的案例吗？告诉我你们是做什么的。' }] },
    idle_follow_up: { enabled: false, instructions: '访客回复跟进时，先帮他把上一个问题问清楚。', steps: [{ idle_seconds: 60, message: '还在吗？如果方便，可以告诉我你们现在最想解决的问题，我帮你看看适合哪个方案。' }, { idle_seconds: 300, message: '先不打扰了。想了解价格、部署或数据安全的话随时问我；也可以留个联系方式，顾问会把资料发给你。' }] },
    assessment: JSON.parse(JSON.stringify(DEFAULT_ASSESSMENT)),
    lead_popup: JSON.parse(JSON.stringify(DEFAULT_LEAD_POPUP)),
    recommendations: JSON.parse(JSON.stringify(DEFAULT_RECOMMENDATIONS)),
    mcp: JSON.parse(JSON.stringify(DEFAULT_MCP))
  }
}

/* ---------- 演示回答：与原型 mock 相同的回答库与每轮处理规则 ---------- */

const DEMO_ANSWERS = [
  ['吸管 Chat 能做什么？', '吸管 Chat 是一款嵌入企业官网的 AI 智能客服与获客助手，主要具备以下能力：\n\n1.  **实时问答**：基于企业上传的产品资料、FAQ 和官网内容，自动回答访客问题。\n2.  **线索获取**：在对话过程中识别合适时机，邀请访客留下联系方式，将匿名流量转化为销售线索。'],
  ['怎么收费？专业版多少钱', '目前资料中没有关于吸管 Chat 收费标准或专业版价格的信息，这部分内容未知。\n\n如需了解具体报价，建议留下联系方式，由顾问为您提供详细方案。请问您希望如何称呼？'],
  ['如何接入官网？', '接入吸管 Chat 非常简单，只需在官网 `</body>` 标签前粘贴一行 Widget 脚本即可上线，无需改动现有页面。同时支持设置允许嵌入的域名，防止脚本被盗用。'],
  ['我想找人工客服聊聊', '已将您的对话加入人工客服队列，顾问上线后会尽快与您联系。'],
  ['怎么收费？', '吸管 Chat 有三个版本：\n- **免费版**：每月 200 次会话，1 个智能体，适合试用。\n- **专业版**：每月 2980 元，10000 次会话，5 个智能体，支持人工接管和工单。\n- **企业版**：按需报价，支持私有化部署、单点登录和专属客户成功经理。\n\n可以先从免费版开始体验，会话量不够时再升级。'],
  ['能接入企业微信吗？', '可以。新线索和转人工提醒可以推送到企业微信群机器人，配置一个 Webhook 地址就行，发送失败会自动重试。'],
  ['支持上传哪些格式的资料？', '支持 PDF、Word、Markdown、Excel 等文档，也可以填写官网地址自动抓取页面。上传后系统会自动切分、向量化并建立索引，回答时会附上资料来源。'],
  ['线索评级是怎么判断的？', 'AI 会根据对话内容给线索打 A/B/C 等级，同时生成需求摘要和建议的跟进动作。评级标准可以在控制台里按你们的理想客户画像来配置。'],
  ['夜间也能自动回复吗？', '可以。AI 会基于你们上传的资料实时回答，夜间和周末也一样；有意向的访客会被邀请留下联系方式，第二天销售直接跟进。'],
  ['能识别访客的购买意向吗？', '能。AI 会在对话中识别购买意向，在合适的时机邀请访客填写留资表单，并自动给线索评级、生成跟进建议。'],
  ['专业版和企业版有什么区别？', '主要区别在规模和部署方式：\n- **专业版**：每月 2980 元，10000 次会话、5 个智能体，支持人工接管和工单。\n- **企业版**：按需报价，在专业版基础上支持私有化部署、单点登录，并配备专属客户成功经理。'],
  ['可以免费试用吗？', '可以。免费版每月提供 200 次会话和 1 个智能体，注册后即可使用，无需绑定信用卡。'],
  ['支持按年付费吗？', '资料里没有年付方式的说明，我不确定。可以留下联系方式，让顾问帮你确认年付价格和优惠。'],
  ['老客户续费有优惠吗？', '资料里没有续费优惠的信息，这个需要顾问确认。方便的话留个联系方式，我让顾问联系你。'],
  ['超出会话量怎么计费？', '资料里没有超出会话量的计费说明。专业版每月包含 10000 次会话；如果预计会超出，建议联系顾问确认，或者考虑按需报价的企业版。'],
  ['需要技术人员配合吗？', '基本不需要。只要在官网 `</body>` 前粘贴一行 Widget 脚本就能上线，不用改动现有页面；能改网站代码的同事几分钟就能完成。'],
  ['支持私有化部署吗？', '支持。企业版提供私有化部署方案，可以部署在你们自己的服务器或专有云上，具体请联系销售获取报价。'],
  ['Widget 会影响加载速度吗？', '不会。Widget 脚本异步加载，体积约 30KB，首屏渲染完成后才初始化对话窗口。'],
  ['上线大概需要多久？', '接入本身只要粘贴一行脚本，几分钟就能完成。主要时间花在导入产品资料和检查回答效果上，资料准备好的话当天就能上线。'],
  ['能放在小程序里吗？', '资料里只提到在官网嵌入 Widget 脚本，没有小程序接入的说明。如果有这个需求，可以留个联系方式让顾问确认。'],
  ['访客联系方式谁能看到？', '只有工作区里有权限的成员能看到。线索列表里联系方式默认部分隐藏，查看完整联系方式会记录审计日志。'],
  ['数据存在哪里？', '所有数据按工作区隔离存储，传输全程 HTTPS 加密。具体的机房和地域资料里没有写；如果有合规要求，企业版也支持私有化部署到你们自己的服务器。'],
  ['支持单点登录吗？', '支持，单点登录是企业版的功能。'],
  ['可以导出全部聊天记录吗？', '资料里没有聊天记录导出的说明。线索可以在控制台导出为 CSV；聊天记录的导出方式建议找顾问确认。'],
  ['有等保认证吗？', '资料里没有等保认证的信息，我不确定。目前能确认的是：数据按工作区隔离存储、全程 HTTPS 加密，敏感信息可以设置不外露。'],
  ['有同行业的客户案例吗？', '资料里还没有整理好的行业案例。方便的话留下联系方式和所在行业，顾问可以发给你相近行业的上线数据。'],
  ['怎么联系销售顾问？', '可以直接在这里留下联系方式，或者告诉我“转人工”，我会把对话转给销售顾问，他们会尽快联系你。'],
  ['能先看看产品演示吗？', '可以。留下联系方式和方便的时间，顾问会安排一次线上演示；也可以先注册免费版，自己上手体验。'],
  ['和传统在线客服有什么区别？', '传统在线客服要有人一直盯着，下班就没人接；吸管 Chat 由 AI 基于你们的资料自动回答，随时在线，还会在对话中识别购买意向、邀请留资并给线索评级。复杂问题仍然可以一键转给人工。']
]

const INTENT_WORDS = ['价格', '收费', '多少钱', '报价', '试用', '采购', '购买', '演示', '方案', '合作', '开通', '私有化']
const HANDOFF_WORDS = ['人工', '真人', '客服', '转接', '投诉']
const TECH_WORDS = ['安装', '报错', '错误', '失败', '打不开', '接入不了']
const MATERIAL_WORDS = ['资料', '手册', '白皮书', '案例', '下载', '文档', '报价单']
const DEMO_MATERIALS = [
  { title: '吸管 Chat 产品手册', url: 'https://www.example.com/files/product-manual.pdf', kind: 'PDF', keywords: ['手册', '产品', '资料'] },
  { title: '2026 B2B 官网 AI 客服落地白皮书', url: 'https://www.example.com/files/whitepaper.pdf', kind: 'PDF', keywords: ['白皮书', '选型'] },
  { title: '20 家 SaaS 企业官网获客案例集', url: 'https://www.example.com/files/cases.pdf', kind: 'PDF', keywords: ['案例', '客户'] },
  { title: '私有化部署方案说明', url: 'https://www.example.com/files/private-deployment.pdf', kind: 'PDF', keywords: ['私有化', '部署'] },
  { title: '吸管 Chat 报价单（2026 版）', url: 'https://www.example.com/files/quote.xlsx', kind: 'XLSX', keywords: ['报价', '价格'] }
]

/** 问题原文一致时直接用对应回答，否则按字面重合度挑最接近的一条（与 mock 相同）。 */
function baseAnswer(message) {
  const text = String(message || '').trim()
  const exact = DEMO_ANSWERS.find(([question]) => question === text)
  if (exact) return exact[1]
  const qa = cfg.sources.find(item => item.type === 'qa' && item.answer && item.name.trim() === text)
  if (qa) return qa.answer
  const score = question => { let hits = 0; for (const ch of new Set(text)) if (question.includes(ch)) hits += 1; return hits }
  return [...DEMO_ANSWERS].sort((a, b) => score(b[0]) - score(a[0]))[0][1]
}

const REFUSE_WORDS = ['不用了', '不需要', '不方便', '不想留', '不留', '算了', '先不', '不用', '没必要', '暂时不']
const SELF_LEAD_WORDS = ['联系我', '留个电话', '留个联系方式', '留联系方式', '留下联系方式', '怎么联系', '加个微信', '加微信', '给我回电', '打给我', '让顾问联系']

const hasContactIn = values => CONTACT_FIELDS.some(key => String(values?.[key] || '').trim())
const newLeadSession = () => ({ handoffOnline: true, handoffQueue: 2, handoffRequested: false, human: false, captured: false, leadId: '', values: {}, invites: 0, refused: false, asking: null, queue: [], lastInvited: false, followUpAsked: false, failSave: false })
const onlineLead = () => normalizeLeadCapture((JSON.parse(cfg.published).actions || capabilityDefaults().actions).lead_capture)

/** 只取访客明确说出的值；关掉的字段不收集。 */
function extractLeadValues(message, lead) {
  const text = String(message || '')
  const allow = new Set(enabledLeadFields(lead).map(item => item.key))
  const company = text.match(/([一-龥A-Za-z]{2,12}(?:科技|集团|公司|教育|咨询|网络|软件|信息|物流))/)?.[1]?.replace(/^(我们公司是|我们是|我们|我是|公司是|来自|在)/, '')
  const found = {
    phone: text.match(/(?:\+\d{1,3}[\s-]?)?1[3-9]\d{9}/)?.[0],
    email: text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0],
    wechat: text.match(/(?:微信|wx|vx|wechat)[号是:：\s]*([A-Za-z][-_A-Za-z0-9]{5,19})/i)?.[1],
    company,
    name: text.match(/(?:我叫|我姓|叫我|称呼我)\s*([一-龥A-Za-z]{1,6}?)(?=[，,。.！!\s\d]|就|电话|手机|微信|$)/)?.[1] || text.match(/我是\s*([一-龥]{1,3}(?:先生|女士|经理|总))/)?.[1]
  }
  return Object.fromEntries(Object.entries(found).filter(([key, value]) => value && allow.has(key)).map(([key, value]) => [key, value.trim()]))
}

/** AI 正在问某个非联系方式字段时，把访客的直接回答当作这一项的值。 */
function answerFor(key, message) {
  const text = String(message || '').trim()
  if (!text || text.length > 60 || /[?？]/.test(text)) return ''
  const value = text.replace(/^(我叫|我姓|叫我|我们公司是|我们是|公司是|是|主要是|想)/, '').replace(/[。.！!]$/, '').trim()
  if (key === 'name' && value.length > 10) return ''
  return value
}

function askText(key, lead) {
  const label = fieldLabel(key, lead)
  if (key === 'name') return '怎么称呼你？'
  if (CONTACT_FIELDS.includes(key)) return `方便留个${label}吗？顾问会尽快联系你。`
  if (key === 'use_case') return `方便说说你的${label}吗？比如想解决什么问题。`
  return `方便说一下你的${label}吗？`
}

/** 对话方式要问的字段：按顺序，必填的都问；没有必填的联系方式时，补问第一个启用的联系方式。 */
function textAskQueue(lead, values) {
  const list = enabledLeadFields(lead).filter(item => !String(values[item.key] || '').trim())
  const requiredContact = list.some(item => item.required && CONTACT_FIELDS.includes(item.key))
  const firstContact = list.find(item => CONTACT_FIELDS.includes(item.key))
  return list.filter(item => item.required || (!hasContactIn(values) && !requiredContact && item === firstContact)).map(item => item.key)
}

/** 保存到同一条线索：还没有联系方式时先暂存，不生成线索。 */
function saveSessionLead(session) {
  if (session.failSave) return { ok: false }
  if (session.leadId) { updateDemoLead(session.leadId, session.values); return { ok: true, id: session.leadId, created: false } }
  if (!hasContactIn(session.values)) return { ok: true, pending: true }
  session.leadId = addDemoLead(session.values, session.values.use_case || '—')
  session.captured = true
  return { ok: true, id: session.leadId, created: true }
}

function pickMaterials(message, limit) {
  const matched = DEMO_MATERIALS.filter(item => item.keywords.some(word => message.includes(word)))
  return (matched.length ? matched : DEMO_MATERIALS.slice(0, 1)).slice(0, Math.max(1, limit)).map(item => ({ title: item.title, url: item.url, kind: item.kind, meta: 'www.example.com' }))
}

/** 调试台每轮处理（回答按线上已发布的配置）。session 见 newLeadSession()。 */
function playgroundTurn(message, session) {
  const meta = { suggestLeadForm: false, leadCaptured: false, leadMerged: false, leadSaveFailed: false, leadId: null, got: [], refused: false, invited: false, selfRequest: false, asked: null, note: '', handoffRequested: false, materials: [], humanMode: false }
  if (session.human) return { text: '', meta: { ...meta, humanMode: true } }
  const online = JSON.parse(cfg.published).actions || capabilityDefaults().actions
  const lead = normalizeLeadCapture(online.lead_capture)
  const handoff = online.human_handoff || {}
  const asset = online.asset_delivery || {}
  const has = words => words.some(word => message.includes(word))
  const textMode = lead.interaction === 'text'
  const plain = baseAnswer(message)
  const base = handoff.enabled && String(handoff.help_url || '').trim() && has(TECH_WORDS) ? `${plain}\n\n安装、报错这类问题也可以先看帮助中心：${handoff.help_url.trim()}` : plain
  const canInvite = lead.enabled && leadHasContactField(lead)
  const wasInvited = session.lastInvited
  const asking = session.asking
  session.lastInvited = false
  const isQuestion = /[?？]|吗$|呢$/.test(message.trim()) || has(INTENT_WORDS)
  const askNext = (prefix, key) => { session.asking = key; return `${prefix}${askText(key, lead)}` }

  // 访客明确拒绝：本次会话不再邀请
  const got = extractLeadValues(message, lead)
  if ((wasInvited || asking) && has(REFUSE_WORDS) && !hasContactIn(got)) {
    Object.assign(session, { refused: true, asking: null, queue: [] })
    return { text: isQuestion ? base : '好的，不留也没关系。还有什么想了解的，随时问我。', meta: { ...meta, refused: true } }
  }

  // 访客说出的值：联系方式是平台行为，能力关闭也记录；合并进同一条线索
  if (asking && !got[asking] && !CONTACT_FIELDS.includes(asking)) { const value = answerFor(asking, message); if (value) got[asking] = value }
  if (Object.keys(got).length) {
    Object.assign(session.values, got)
    meta.got = Object.keys(got)
    const saved = saveSessionLead(session)
    if (!saved.ok) meta.leadSaveFailed = true
    else if (saved.created) Object.assign(meta, { leadCaptured: true, leadId: saved.id })
    else if (saved.id) Object.assign(meta, { leadMerged: true, leadId: saved.id })
    const opener = isQuestion ? `${base}\n\n` : '好的。'
    if (asking) {
      session.queue = session.queue.filter(key => !session.values[key])
      const next = session.queue.shift()
      if (next) return { text: askNext(opener, next), meta: { ...meta, asked: next } }
      session.asking = null
    } else if (lead.enabled && session.captured && !session.refused && !session.followUpAsked) {
      // 拿到联系方式后不再弹表单；还没填的字段（已有联系方式时不再追要别的联系方式），AI 顺带问一项
      const missing = enabledLeadFields(lead).find(item => !CONTACT_FIELDS.includes(item.key) && !String(session.values[item.key] || '').trim())
      if (missing) { session.followUpAsked = true; session.queue = []; return { text: askNext(`${opener}顺便问一下，`, missing.key), meta: { ...meta, asked: missing.key } } }
    }
    return { text: isQuestion ? base : '好的，还有其他想了解的可以继续问我。', meta }
  }
  const ignored = Boolean(asking)
  if (ignored) Object.assign(session, { asking: null, queue: [] })
  if (ignored) meta.note = '访客没有回答这一项，AI 先回答问题，这一轮不再追问。'

  // 转人工：一次会话只发起一次；有人在线发排队消息，没人在线时留资表单开着就接着邀请（不占邀请次数）
  if (handoff.enabled && has(HANDOFF_WORDS)) {
    const queue = session.handoffQueue
    if (session.handoffRequested) {
      const text = session.handoffOnline ? `已经帮你提交过转人工了，前面还有 ${queue} 位，预计等待 ${handoffMinutes(queue)} 分钟。人工接入前我先继续帮你。` : '人工现在还不在线，有新进展会第一时间联系你。还有什么我可以先帮你的？'
      return { text, meta: { ...meta, handoffRepeat: true } }
    }
    session.handoffRequested = true
    if (session.handoffOnline) return { text: handoffText(handoffMessage(handoff, 'online'), queue), meta: { ...meta, handoffRequested: true } }
    meta.handoffOffline = true
    if (!canInvite || session.captured) return { text: '现在人工不在线，暂时转不了。还有什么我可以先帮你的？', meta }
    const offline = handoffMessage(handoff, 'offline')
    session.lastInvited = true
    Object.assign(meta, { invited: true, handoffInvite: true })
    if (!textMode) return { text: offline, meta: { ...meta, suggestLeadForm: true } }
    const queueFields = textAskQueue(lead, session.values)
    const first = queueFields.shift()
    session.queue = queueFields
    return { text: askNext(`${offline}\n\n`, first), meta: { ...meta, asked: first } }
  }
  if (asset.enabled && has(MATERIAL_WORDS)) {
    if (asset.mode === 'immediate' || session.captured) return { text: '好的，这是相关资料，点开即可查看：', meta: { ...meta, materials: pickMaterials(message, Number(asset.max_items) || 1) } }
    if (asset.mode === 'contact_required') {
      session.lastInvited = canInvite
      return { text: textMode ? '资料已经准备好了。方便留个手机号或微信吗？留下后我把下载链接发给你。' : '资料已经准备好了，留下联系方式就能获取下载链接。', meta: { ...meta, suggestLeadForm: canInvite && !textMode } }
    }
    return { text: '这份资料需要由顾问发送给你，我已经帮你转给人工顾问。', meta: { ...meta, handoffRequested: Boolean(handoff.enabled) } }
  }

  // 邀请：访客自己要留不受次数限制；AI 主动邀请受次数和拒绝限制
  const selfRequest = canInvite && has(SELF_LEAD_WORDS)
  if (selfRequest && session.captured) return { text: '好的，顾问会尽快联系你。还有什么想先了解的，可以继续问我。', meta }
  const aiInvite = canInvite && !ignored && has(INTENT_WORDS) && !session.captured && !session.refused
  if (aiInvite && session.invites >= lead.max_invites) meta.note = `本次会话已主动邀请 ${session.invites} 次，到达上限，不再邀请。`
  if (selfRequest || (aiInvite && session.invites < lead.max_invites)) {
    if (selfRequest) session.refused = false
    else session.invites += 1
    session.lastInvited = true
    Object.assign(meta, { invited: true, selfRequest })
    if (!textMode) return { text: selfRequest ? '好的，在下面留个联系方式就行，顾问会尽快联系你。' : `${base}\n\n方便留个联系方式吗？我让顾问把详细信息发给你。`, meta: { ...meta, suggestLeadForm: true } }
    const queue = textAskQueue(lead, session.values)
    const first = queue.shift()
    session.queue = queue
    return { text: askNext(selfRequest ? '好的。' : `${base}\n\n`, first), meta: { ...meta, asked: first } }
  }
  return { text: base, meta }
}

/** 演示中生成的调试线索，同步到「线索」列表；同一会话后补的信息合并进同一行。 */
const demoLeadRows = {}
const leadContactText = values => values.phone || values.wechat || values.email || '未获取'
function addDemoLead(contact, need) {
  const id = `demo-lead-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  try {
    const row = [contact.name || '调试访客', contact.company || '调试会话', leadContactText(contact), need || '—', '跟进中', '刚刚', '调试不推送']
    leads.unshift(row)
    demoLeadRows[id] = row
  } catch (_) {}
  return id
}
function updateDemoLead(id, values) {
  const row = demoLeadRows[id]
  if (!row) return
  if (values.name) row[0] = values.name
  if (values.company) row[1] = values.company
  row[2] = leadContactText(values)
  if (values.use_case) row[3] = values.use_case
  row[5] = '刚刚'
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/* ---------- 读写配置 ---------- */

const C = () => cfg.draft

function isCapEnabled(id) {
  const d = C()
  if (['lead_capture', 'human_handoff', 'asset_delivery'].includes(id)) return Boolean(d.actions[id].enabled)
  if (id === 'proactive') return Boolean(d.auto_open.enabled || d.proactive.enabled)
  if (id === 'idle_follow_up') return Boolean(d.idle_follow_up.enabled)
  return Boolean(d[id]?.enabled)
}

function setCapEnabled(id, enabled) {
  const d = C()
  if (['lead_capture', 'human_handoff', 'asset_delivery'].includes(id)) d.actions[id].enabled = enabled
  else if (id === 'proactive') {
    // 关闭时自动打开与主动消息都停；开启时默认打开自动弹窗。
    d.auto_open.enabled = enabled ? (d.auto_open.enabled || !d.proactive.enabled) : false
    d.proactive.enabled = enabled ? d.proactive.enabled : false
  } else if (id === 'idle_follow_up') {
    // 不再自动补空话术：开启时话术为空会在能力页标出、不能发布；关闭时允许留着空话术
    d.idle_follow_up.enabled = enabled
  } else d[id].enabled = enabled
}

/** 表单里显示的字段（按顺序）：{ field, label, required, placeholder }。留资弹窗、测评也沿用这份设置。 */
function normalizeFormFields(lead = C().actions.lead_capture) {
  return enabledLeadFields(lead).map(item => ({ field: item.key, label: fieldLabel(item.key, lead), required: Boolean(item.required), placeholder: item.placeholder || '' }))
}

/* ---------- 通用片段 ---------- */

function capSection(key, title, done, defaultOpen, body) {
  const open = cfg.secOpen[key] ?? defaultOpen
  return `<details class="capability-section" data-sec="${key}" ${open ? 'open' : ''}><summary><span class="capability-section-status ${done ? 'is-done' : ''}" aria-label="${done ? '已完成' : '待完善'}">${done ? icon('check') : ''}</span><strong>${title}</strong>${icon('chevron-down', 'capability-section-chevron')}</summary><div class="capability-section-body">${body}</div></details>`
}

function capNotice(text, action = '') {
  return `<div class="cfg-notice warning" role="status"><span class="cfg-notice-icon">${icon('alert', 'sm')}</span><div>${text}</div>${action ? `<div class="cfg-notice-actions">${action}</div>` : ''}</div>`
}

function capNotices(selected) {
  const a = C().actions
  let html = ''
  if (a.human_handoff.enabled && (!selected || selected === 'human_handoff')) html += capNotice('<strong>外部接管提醒尚未配置。</strong>访客的转人工请求仍会进入「人工」列表，但不会额外推送到企业微信。', '<button type="button" class="cfg-btn sm outline" data-agent-section="channels">配置通知通道</button>')
  if (a.asset_delivery.enabled && a.asset_delivery.mode === 'contact_required' && !a.lead_capture.enabled && (!selected || selected === 'asset_delivery' || selected === 'lead_capture')) html += capNotice('资料设置为“收集联系方式后交付”，但留资表单未开启，链接将一直被隐藏。')
  return html
}

function capHeader(cap, enabled, extraBadge = '') {
  return `<header class="capability-detail-head">
    <button type="button" class="cfg-btn sm ghost" data-action="cfg-cap-back">${icon('arrow-left', 'xs')}<span>能力</span></button>
    <span class="capability-detail-title"><span class="capability-card-icon">${icon(cap.icon, 'sm')}</span><h1>${cap.name}</h1>${cap.isNew ? '<span class="cfg-badge info">新</span>' : ''}${testingBadge(cap)}${renderCfgStatus()}${extraBadge}</span>
    <span class="cfg-capdetail-spacer"></span>
    <label class="cfg-capdetail-switch"><span>${enabled ? '已开启' : '未开启'}</span><button type="button" class="cfg-switch ${enabled ? 'on' : ''}" role="switch" aria-checked="${enabled}" aria-label="启用${cap.name}" data-cap-toggle="${cap.id}"></button></label>
    <div class="cfg-action-group" id="cfg-actions">${renderCfgDraftActions()}</div>
  </header>`
}

function valueBanner(cls, title, text, fit, steps) {
  return `<div class="${cls}-banner"><div class="${cls}-banner-copy"><strong>${title}</strong><p>${text}</p><small>${fit}</small></div>
    <ol class="${cls}-steps">${steps.map(([iconName, stepTitle, stepText], index) => `<li><span class="${cls}-step-icon">${icon(iconName, 'sm')}</span><strong>${index + 1}. ${stepTitle}</strong><small>${stepText}</small></li>`).join('')}</ol></div>`
}

const capInput = (path, attrs = '') => `<input value="${esc(getCfgValue(path) ?? '')}" data-bind="${path}" ${attrs} />`
const capNumber = (path, min, max, attrs = '') => `<input type="number" min="${min}" max="${max}" value="${esc(getCfgValue(path) ?? '')}" data-bind="${path}" data-type="number" data-clamp="${min},${max}" ${attrs} />`
const capTextarea = (path, rows, attrs = '') => `<textarea rows="${rows}" data-bind="${path}" ${attrs}>${esc(getCfgValue(path) ?? '')}</textarea>`
const capLines = (path, rows, attrs = '') => `<textarea rows="${rows}" data-bind="${path}" data-type="lines" ${attrs}>${esc((getCfgValue(path) || []).join('\n'))}</textarea>`
const capCheck = (path, label, attrs = '') => `<label class="console-checkbox"><input type="checkbox" data-bind="${path}" ${getCfgValue(path) ? 'checked' : ''} ${attrs} /><span>${label}</span></label>`
const capSelect = (path, options, attrs = '') => `<select data-bind="${path}" ${attrs}>${options.map(([value, label]) => `<option value="${esc(value)}" ${String(getCfgValue(path)) === String(value) ? 'selected' : ''}>${label}</option>`).join('')}</select>`
const field = (label, control, { help = '', full = false } = {}) => `<div class="cfg-field ${full ? 'full' : ''}">${label ? `<label>${label}</label>` : ''}${control}${help ? `<small>${help}</small>` : ''}</div>`
const badge = (tone, text) => `<span class="cfg-badge ${tone}">${text}</span>`

/* ---------- 能力列表 ---------- */

function renderCapabilityListCards() {
  const keyword = cfg.capSearch.trim().toLowerCase()
  const rows = CAPABILITIES.filter(item => (cfg.capTrigger === 'all' || item.trigger === cfg.capTrigger) && (!keyword || `${item.name}${item.summary}`.toLowerCase().includes(keyword)))
  if (!rows.length) return '<div class="cfg-empty">没有匹配的能力，换个关键词或触发方式再试试。</div>'
  return rows.map(item => {
    const on = isCapEnabled(item.id)
    return `<article class="cfg-cap-card ${item.isNew ? 'is-new' : ''}" aria-label="${item.name}">
      <div class="cfg-cap-top"><span class="cfg-cap-icon">${icon(item.icon)}</span><button type="button" class="cfg-switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="启用${item.name}" data-cap-toggle="${item.id}"></button></div>
      <h2 class="cfg-cap-name">${item.name}${item.isNew ? badge('info', '新') : ''}${testingBadge(item)}${on && capIssues(item.id).length ? badge('warning', '待完善') : ''}</h2>
      <p class="cfg-cap-trigger">${icon(TRIGGER_ICONS[item.trigger], 'xs')}${TRIGGER_LABELS[item.trigger]}</p>
      <p class="cfg-cap-summary">${item.summary}</p>
      <div class="cfg-cap-foot"><span class="cfg-cap-state ${on ? 'is-on' : ''}">${on ? '已开启' : '未开启'}</span><button type="button" class="cfg-btn sm outline" data-cap-config="${item.id}">配置</button></div>
    </article>`
  }).join('')
}

function renderCapabilitiesConfig() {
  const cap = CAPABILITIES.find(item => item.id === cfg.capDetail)
  if (cap) {
    if (cap.id === 'lead_capture') return renderLeadCaptureDetail(cap)
    if (cap.id === 'assessment') return renderAssessmentDetail(cap)
    if (cap.id === 'lead_popup') return renderLeadPopupDetail(cap)
    if (cap.id === 'recommendations') return renderRecommendationsDetail(cap)
    if (cap.id === 'mcp') return renderMcpDetail(cap)
    if (cap.id === 'human_handoff') return renderHandoffDetail(cap)
    if (cap.id === 'proactive') return renderProactiveDetail(cap)
    if (cap.id === 'idle_follow_up') return renderIdleDetail(cap)
    return renderCapabilityDetail(cap)
  }
  return cfgPage('capabilities', `${renderCfgHeader({ title: '能力', desc: '按需打开智能体能做的事。关闭后，对应提示、工具、回执和会话状态都不会进入运行时。', extra: renderCfgStatus() })}
    <section class="cfg-body">${renderCfgHint()}${capNotices(null)}
      <div class="cfg-toolbar"><div class="cfg-search">${icon('search', 'sm')}<input id="cfg-cap-search" type="search" placeholder="搜索能力" aria-label="搜索能力" value="${esc(cfg.capSearch)}" /></div>
        <select id="cfg-cap-trigger" class="cfg-select" aria-label="按触发方式筛选"><option value="all">全部触发方式</option>${Object.entries(TRIGGER_LABELS).map(([key, label]) => `<option value="${key}" ${cfg.capTrigger === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="cfg-cap-grid" id="cfg-cap-grid">${renderCapabilityListCards()}</div>
    </section>`)
}

/* ---------- 通用能力详情（目前只有资料交付在用） ---------- */

function renderCapabilityDetail(cap) {
  const d = C()
  const a = d.actions
  const id = cap.id
  const enabled = isCapEnabled(id)
  const sec = name => `${id}:${name}`
  const whenToUse = ['human_handoff', 'asset_delivery'].includes(id)
  const placeholders = { human_handoff: '写清哪些情况应转交，以及转交前需要告诉用户什么。', asset_delivery: '例如：仅在访客明确索要资料、案例或下载链接时发送。' }

  const general = capSection(sec('general'), '通用', !whenToUse || Boolean(a[id].instructions.trim()), true, `<div class="cfg-form-grid">
      ${field('做什么', `<p class="capability-readonly">${cap.summary}</p>`, { full: true })}
      ${whenToUse
        ? field('什么时候用', capTextarea(`actions.${id}.instructions`, 4, `maxlength="4000" placeholder="${placeholders[id]}" data-cap-done="${sec('general')}"`), { full: true, help: '写给智能体的调用时机，会作为该能力的租户配置进入运行时；能力关闭时不会出现。也可以把更完整的节奏写在角色指令中。' })
        : field('什么时候用', '<p class="capability-readonly">由下方「触发规则」中的页面与时间规则决定，不经过 AI 判断。</p>', { full: true })}
    </div>`)

  const interaction = capSection(sec('interaction'), '交互形式', true, false, `<div class="capability-interaction" role="radiogroup" aria-label="交互形式">${['text', 'widget'].map(kind => {
      const current = cap.interaction.kind === kind
      return `<div class="capability-interaction-option ${current ? 'is-current' : ''}" role="radio" aria-checked="${current}" aria-disabled="${!current}"><strong>${kind === 'text' ? '纯文字' : '小组件'}</strong><small>${!current ? '当前能力不支持' : cap.interaction.label === '纯文字' ? '当前使用' : `当前使用：${cap.interaction.label}`}</small></div>`
    }).join('')}</div><small class="capability-hint">交互形式由能力决定，暂不支持切换。</small>`)

  const widgetBody = id === 'asset_delivery'
    ? `<div class="cfg-form-grid">${field('每轮最多展示资料卡片', capNumber('actions.asset_delivery.max_items', 1, 10), { help: '可配置 1～10 条；平台不替你的智能体固定数量。' })}</div>`
    : '<p class="capability-readonly">该能力以纯文字交互，没有小组件。</p>'
  const widget = capSection(sec('widget'), '小组件', true, false, `${widgetBody}<div class="capability-planned-row">${icon('spark', 'xs')}<span>用 AI 编辑小组件的内容与样式</span>${badge('', '即将上线')}</div>`)

  const fields = capSection(sec('fields'), '需要访客提供的字段', true, false, id === 'asset_delivery'
    ? '<p class="capability-readonly">默认无需访客提供字段。交付条件为“收集联系方式后交付”时，依赖「留资表单」先收集联系方式。</p>'
    : '<p class="capability-readonly">无需访客提供字段。</p>')

  let more = ''
  if (id === 'human_handoff') more = capSection(sec('more'), '更多设置', true, false, `<div class="cfg-form-grid">${field('帮助中心地址（可选）', capInput('actions.human_handoff.help_url', 'type="url" placeholder="https://help.example.com"'))}</div>`)
  if (id === 'asset_delivery') more = capSection(sec('more'), '更多设置', true, false, `<div class="cfg-form-grid">${field('交付条件', capSelect('actions.asset_delivery.mode', [['immediate', '立即交付'], ['contact_required', '收集联系方式后交付'], ['human_only', '仅由人工交付']], 'data-rerender="1"'), { help: '“立即交付”会明确告诉模型：相关链接应在当前回复直接给出，不能拿资料交换联系方式。' })}</div>`)

  return cfgPage(`cap-${id}`, `${capHeader(cap, enabled)}
    <section class="cfg-body">${renderCfgHint()}${capNotices(id)}
      <div class="agent-config-layout capability-demo-layout">
        <div class="agent-config-main capability-sections">${general}${interaction}${widget}${fields}${more}</div>
        <aside class="agent-config-side capability-demo-side">${renderDemoPanel(id, enabled)}</aside>
      </div>
    </section>`)
}

/* ---------- 留资表单详情：通用 / 收集方式 / 字段 / 表单样式 / 消息 / 次数 ---------- */

const LEAD_MODES = [
  { value: 'widget', title: '表单', sees: 'AI 回复下方出现联系表单，一次填完提交', fit: '要的字段多，想一次拿全' },
  { value: 'text', title: '对话', sees: 'AI 在对话里一项一项问，访客直接打字回答', fit: '不想打断对话，只要一两项' }
]

function renderLeadCaptureDetail(cap) {
  const lead = C().actions.lead_capture
  const enabled = isCapEnabled('lead_capture')
  const sec = name => `lead_capture:${name}`
  const formMode = lead.interaction !== 'text'
  const fields = leadFieldsOf(lead)
  const enabledCount = fields.filter(item => item.enabled).length
  const hasContact = leadHasContactField(lead)

  const general = capSection(sec('general'), '通用', Boolean(lead.instructions.trim()), true, `<div class="cfg-form-grid">
      ${field('做什么', '<p class="capability-readonly">收集访客的联系方式和需求，存成一条线索。AI 判断什么时候邀请，按你选的收集方式弹表单或在对话里问。</p>', { full: true })}
      ${field('什么时候用', capTextarea('actions.lead_capture.instructions', 4, `maxlength="4000" placeholder="比如：访客问到报价、试用、演示时邀请留手机号；先把他的问题答完再邀请。" data-cap-done="${sec('general')}"`), { full: true, help: '写给 AI 的邀请时机，进入运行时；能力关闭时不会出现。能力开关优先于这里的指令。选「对话」方式时，收集规则也写在这里。' })}
    </div>`)

  const mode = capSection(sec('mode'), '收集方式', true, true, `<div class="lead-modes" role="radiogroup" aria-label="收集方式">${LEAD_MODES.map(item => {
      const current = (lead.interaction === 'text' ? 'text' : 'widget') === item.value
      return `<button type="button" class="lead-mode ${current ? 'is-current' : ''}" role="radio" aria-checked="${current}" data-lead-interaction="${item.value}"><strong>${item.title}${item.value === 'widget' ? badge('', '默认') : ''}</strong><span><em>访客看到</em>${item.sees}</span><span><em>适合</em>${item.fit}</span></button>`
    }).join('')}</div>
    <small class="capability-hint">不管选哪种，访客在对话里主动说出的手机号、微信号、邮箱都会被记录，补进同一条线索（这项能力关闭时也会记录）；收集方式只决定 AI 主动邀请时用哪种形式。</small>
    ${!formMode ? '<small class="capability-hint">对话方式下「必填」没法强制，格式不对只能靠 AI 追问。</small>' : ''}`)

  const rows = fields.map((item, index) => {
    const meta = LEAD_FIELD_META[item.key]
    const path = `actions.lead_capture.fields.${index}`
    const contact = CONTACT_FIELDS.includes(item.key)
    return `<li class="lead-field ${item.enabled ? '' : 'is-off'}" data-lead-row="${index}">
      <div class="lead-field-top">
        <span class="lead-field-handle" title="拖动调整顺序" aria-hidden="true" data-lead-handle>⋮⋮</span>
        <label class="cfg-toggle-control lead-field-switch"><input type="checkbox" role="switch" aria-label="启用${esc(meta.label)}" data-bind="${path}.enabled" ${item.enabled ? 'checked' : ''} data-rerender="1" /><i></i></label>
        <input class="lead-field-name" value="${esc(item.label)}" maxlength="20" aria-label="${esc(meta.label)}的显示名称" placeholder="${esc(meta.label)}" data-bind="${path}.label" data-demo-sync="1" />
        <span class="lead-field-type">${meta.type}${contact ? ' · 联系方式' : ''}</span>
        <label class="console-checkbox lead-field-required"><input type="checkbox" data-bind="${path}.required" ${item.required ? 'checked' : ''} ${item.enabled ? '' : 'disabled'} data-rerender="1" /><span>必填</span></label>
        <span class="lead-field-move"><button type="button" class="cfg-btn sm ghost" aria-label="上移${esc(meta.label)}" data-lead-move="${index}:-1" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" class="cfg-btn sm ghost" aria-label="下移${esc(meta.label)}" data-lead-move="${index}:1" ${index === fields.length - 1 ? 'disabled' : ''}>↓</button></span>
      </div>
      ${item.enabled ? `<div class="lead-field-more">
        <label class="${formMode ? '' : 'is-dim'}"><span>占位文字<small>表单方式用</small></span><input value="${esc(item.placeholder || '')}" maxlength="40" placeholder="${esc(meta.placeholder)}" data-bind="${path}.placeholder" data-demo-sync="1" /></label>
        <label class="${formMode ? 'is-dim' : ''}"><span>给 AI 的说明<small>对话方式用</small></span><input value="${esc(item.ai_hint || '')}" maxlength="200" placeholder="例如：${esc(meta.ask)}" data-bind="${path}.ai_hint" /></label>
      </div>` : ''}
    </li>`
  }).join('')
  const fieldsSec = capSection(sec('fields'), '字段', hasContact, true, `
    ${!hasContact ? capNotice('<strong>手机号、微信号、邮箱至少启用一项，否则不能发布。</strong>访客至少填一种联系方式才生成线索。') : ''}
    ${formMode && enabledCount > LEAD_FORM_FIELD_WARN ? `<div class="cfg-notice info" role="status"><span class="cfg-notice-icon">${icon('alert', 'sm')}</span><div>已启用 ${enabledCount} 个字段。字段越多，填写的人越少。</div></div>` : ''}
    <ol class="lead-fields" aria-label="字段">${rows}</ol>
    <small class="capability-hint">拖动或用 ↑↓ 调整顺序，表单和对话都按这个顺序。六个系统字段类型固定，可以关、不能删；改名后，已有线索里这一项按新名字显示。</small>
    <small class="capability-hint">必填：表单方式下不填不能提交；对话方式下 AI 会问到这一项，访客不答也不强求。AI 只存访客明确说出的值，不推测。</small>`)

  const style = capSection(sec('style'), '表单样式', true, false, `${!formMode ? '<p class="capability-readonly">当前为「对话」方式，访客看不到联系表单；切回「表单」后生效。</p>' : ''}
    <div class="cfg-form-grid">${field('尺寸', capSelect('actions.lead_capture.form_size', [['small', '小 · 先显示“填写信息”，点开再展开'], ['medium', '标准'], ['large', '大']]), { help: '小尺寸能给 AI 的回复多留一些空间。' })}</div>
    <div class="capability-planned-row">${icon('spark', 'xs')}<span>用 AI 编辑表单的内容与样式</span>${badge('', '即将上线')}</div>`)

  const messages = capSection(sec('messages'), '消息', true, false, `<div class="cfg-form-grid">
      ${field('成功消息', capTextarea('actions.lead_capture.success_message', 2, `maxlength="200" placeholder="${LEAD_DEFAULT_MESSAGES.success}" data-demo-sync="1"`), { full: true, help: '表单提交成功，或对话里拿到联系方式并保存成功后显示。最多 200 字，留空用默认文案。' })}
      ${field('失败消息', capTextarea('actions.lead_capture.failure_message', 2, `maxlength="200" placeholder="${LEAD_DEFAULT_MESSAGES.failure}" data-demo-sync="1"`), { full: true, help: '网络或服务出错、没有保存成功时显示。最多 200 字，留空用默认文案。' })}
    </div><small class="capability-hint">只有保存成功才显示成功消息，AI 自己不会说“已记录”。字段校验的提示由平台固定，不在这里配。</small>`)

  const times = capSection(sec('times'), '次数', true, false, `<div class="cfg-form-grid">${field('每次会话 AI 最多主动邀请', capSelect('actions.lead_capture.max_invites', [[1, '1 次'], [2, '2 次（默认）'], [3, '3 次']], 'data-type="number"'), { help: '弹一次表单或在对话里问一次联系方式，各算一次。' })}</div>
    <ul class="lead-rules"><li>访客明确拒绝后，本次会话不再邀请；访客关掉表单算没回应，不算拒绝。</li><li>已经拿到联系方式后，不再弹表单；还没填的字段，AI 可以在对话里顺带问。</li><li>访客自己说要留联系方式时，不受次数限制。</li></ul>`)

  return cfgPage('cap-lead_capture', `${capHeader(cap, enabled)}
    <section class="cfg-body">${renderCfgHint()}${capNotices('lead_capture')}
      <div class="agent-config-layout capability-demo-layout">
        <div class="agent-config-main capability-sections">${general}${mode}${fieldsSec}${style}${messages}${times}</div>
        <aside class="agent-config-side capability-demo-side">${renderDemoPanel('lead_capture', enabled)}</aside>
      </div>
    </section>`)
}

/* ---------- 详情页公共分区：通用（做什么 + 什么时候用）、固定的交互形式 ---------- */

function capGeneral(cap, path, { label = '什么时候用', placeholder = '', help = '' } = {}) {
  const value = String(getCfgValue(path) || '')
  return capSection(`${cap.id}:general`, '通用', Boolean(value.trim()), true, `<div class="cfg-form-grid">
      ${field('做什么', `<p class="capability-readonly">${cap.summary}</p>`, { full: true })}
      ${field(label, capTextarea(path, 4, `maxlength="4000" placeholder="${esc(placeholder)}"`), { full: true, help: `${help}最多 4000 字，只在能力开启时进入 AI 的上下文。` })}
    </div>`)
}

const capFixedInteraction = (cap, text) => capSection(`${cap.id}:interaction`, '交互形式', true, false, `<p class="capability-readonly"><strong>${cap.interaction.label}</strong>（固定）。${text}</p>`)
const capRules = (cap, items, open = false) => capSection(`${cap.id}:rules`, '规则', true, open, `<ul class="lead-rules">${items.map(item => `<li>${item}</li>`).join('')}</ul>`)
const capIssueNotices = id => capIssues(id).map(text => capNotice(`<strong>${text}。</strong>改好之前不能发布。`)).join('')

function capDetailPage(cap, enabled, sections, side) {
  return cfgPage(`cap-${cap.id}`, `${capHeader(cap, enabled)}
    <section class="cfg-body">${renderCfgHint()}${capNotices(cap.id)}${enabled ? capIssueNotices(cap.id) : ''}
      <div class="agent-config-layout capability-demo-layout">
        <div class="agent-config-main capability-sections">${sections.join('')}</div>
        <aside class="agent-config-side capability-demo-side">${side}</aside>
      </div>
    </section>`)
}

/* ---------- 转人工 ---------- */

const handoffMinutes = queue => Math.min(60, queue * 5)
const handoffText = (template, queue) => String(template).replace(/\{排队人数\}/g, queue).replace(/\{分钟\}/g, handoffMinutes(queue))
const handoffMessage = (h, kind) => String(h?.[`${kind}_message`] || '').trim() || HANDOFF_DEFAULT_MESSAGES[kind]

function renderHandoffDetail(cap) {
  const lead = C().actions.lead_capture
  const enabled = isCapEnabled('human_handoff')
  const general = capGeneral(cap, 'actions.human_handoff.instructions', { placeholder: '比如：访客明确要求人工、连续两次答不上、或者表达不满时转人工；转之前告诉访客要等一会。', help: '写给 AI 的转人工时机。写得收紧一些，免得 AI 把自己能答的问题也转出去。' })
  const interaction = capFixedInteraction(cap, '发起转人工后，访客看到下面的在线或不在线消息。')
  const messages = capSection('human_handoff:messages', '消息', true, true, `<div class="cfg-form-grid">
      ${field('有人在线时的消息', capTextarea('actions.human_handoff.online_message', 2, `maxlength="200" placeholder="${HANDOFF_DEFAULT_MESSAGES.online}" data-demo-sync="1"`), { full: true, help: '可以插入 {排队人数} 和 {分钟}。排队人数是前面还在等人工的会话数，预计等待按每位 5 分钟算，最多显示 60 分钟。留空用默认文案。' })}
      ${field('没人在线时的消息', capTextarea('actions.human_handoff.offline_message', 2, `maxlength="200" placeholder="${HANDOFF_DEFAULT_MESSAGES.offline}" data-demo-sync="1"`), { full: true, help: lead.enabled ? '留资表单开着：发完这句接着邀请留资，不占留资表单的邀请次数。' : '留资表单没开：只告知访客暂时没人在线，不邀请留资。' })}
    </div><small class="capability-hint">“有人在线”指工作区有成员开着控制台。</small>`)
  const more = capSection('human_handoff:more', '帮助中心与通知', true, false, `<div class="cfg-form-grid">
      ${field('帮助中心地址（可选）', capInput('actions.human_handoff.help_url', 'type="url" placeholder="https://help.example.com"'), { full: true, help: '访客问安装、报错这类技术问题时，AI 可以给出这个地址。' })}
      ${field('外部通知', '<p class="capability-readonly">在「通知与业务系统」里配企业微信；不配也会进人工列表。</p>', { full: true })}
    </div>`)
  const rules = capRules(cap, ['一次会话只发起一次转人工。访客再次要求时，告诉他当前的排队情况，不重复通知。', '发起后到人工点接管之前，AI 继续回答；接管后 AI 不再回复；人工交还后 AI 接着聊。', 'AI 只能说“已提交转人工”，不能说“已经接通”。', '人工一直没接时 AI 继续回答；一期不做等待超时提醒和重发通知。', '能力关闭时，访客要人工，AI 按指令和知识库正常回复，但不能说已经转了。'])
  return capDetailPage(cap, enabled, [general, interaction, messages, more, rules], renderDemoPanel('human_handoff', enabled))
}

/* ---------- 主动弹窗 ---------- */

function proactiveOverlaps(d = C()) {
  if (!d.auto_open.enabled || !d.proactive.enabled) return []
  const autoPatterns = new Set(d.auto_open.page_rules.filter(rule => rule.enabled !== false).map(rule => rule.pattern.trim()))
  const both = d.proactive.page_rules.filter(rule => rule.enabled !== false && autoPatterns.has(rule.pattern.trim())).map(rule => rule.pattern.trim())
  return both.length ? both : ['全站默认']
}

function renderProactiveDetail(cap) {
  const d = C()
  const enabled = isCapEnabled('proactive')
  const general = capGeneral(cap, 'proactive.instructions', { label: '访客回应后怎么接', placeholder: '比如：访客回复主动消息时，先按他正在看的页面介绍对应产品。', help: '弹不弹、什么时候弹由下面的规则决定，不经过 AI 判断；这里写访客回应之后 AI 怎么接。' })
  const overlaps = proactiveOverlaps(d)
  const interaction = capSection('proactive:interaction', '交互形式', d.auto_open.enabled || d.proactive.enabled, true, `<div class="cfg-form-grid">
      <div class="full">${capCheck('auto_open.enabled', '自动打开对话窗', 'data-rerender="1"')}</div>
      <div class="full">${capCheck('proactive.enabled', '主动消息气泡：先在入口旁边弹一句', 'data-rerender="1"')}</div>
    </div>
    <small class="capability-hint">两种可以都开。一次访问（30 分钟）里自动打开、主动消息最多出现一个；同一页面都命中时只取自动打开。</small>
    ${overlaps.length ? `<div class="cfg-notice info" role="status"><span class="cfg-notice-icon">${icon('alert', 'sm')}</span><div>${overlaps[0] === '全站默认' ? '两种都开着：没有单独停用的页面两种都会命中，' : `规则重叠：${overlaps.map(esc).join('、')} 两种都会命中，`}这些页面只会自动打开对话窗，不弹主动消息。</div></div>` : ''}`)

  const autoRules = d.auto_open.page_rules.map((rule, index) => `<div class="notification-block"><div class="cfg-form-grid">
      ${field('页面（URL 通配）', capInput(`auto_open.page_rules.${index}.pattern`, 'placeholder="/pricing*" data-demo-sync="1" data-rerender="1"'))}
      ${field('覆盖延迟（秒）', `<input type="number" min="0" max="60" value="${rule.delay_seconds ?? ''}" placeholder="${d.auto_open.delay_seconds}" data-bind="auto_open.page_rules.${index}.delay_seconds" data-type="number-or-null" data-clamp="0,60" data-demo-sync="1" />`)}
      ${capCheck(`auto_open.page_rules.${index}.enabled`, '这个页面启用（取消即单页停用）', 'data-demo-sync="1" data-rerender="1"')}
      <button type="button" class="cfg-btn sm ghost" data-rule-remove="auto_open:${index}">${icon('trash', 'xs')}<span>删除规则</span></button>
    </div></div>`).join('')
  const auto = capSection('proactive:auto', '自动打开对话窗', true, d.auto_open.enabled, `${!d.auto_open.enabled ? '<p class="capability-readonly">没开「自动打开对话窗」，下面的设置先不生效。</p>' : ''}<div class="cfg-form-grid">
      ${field('默认时机：进入页面后（秒）', capNumber('auto_open.delay_seconds', 0, 60, 'data-demo-sync="1"'), { help: '0–60 秒，默认 5 秒。' })}
      ${field('不再触发', '', { help: '每次访问最多自动打开一次；访客手动关闭后本次不再触发。' })}
      <div class="cfg-field full"><div class="notification-title"><strong>页面规则（${d.auto_open.page_rules.length} / 50）</strong><button type="button" class="cfg-btn sm outline" data-rule-add="auto_open" ${d.auto_open.page_rules.length >= 50 ? 'disabled' : ''}>${icon('plus', 'xs')}<span>添加规则</span></button></div>${autoRules ? `<div class="notification-config">${autoRules}</div>` : ''}<small>从上到下第一条匹配的生效；没有规则时用全站默认。</small></div>
    </div>`)

  const tooLong = [d.proactive.message, ...d.proactive.page_rules.map(rule => rule.message)].filter(text => Array.from(String(text || '')).length > PROACTIVE_MESSAGE_MAX).length
  const msgRules = d.proactive.page_rules.map((rule, index) => `<div class="notification-block"><div class="cfg-form-grid">
      ${field('页面（URL 通配）', capInput(`proactive.page_rules.${index}.pattern`, 'placeholder="/docs/*" data-demo-sync="1" data-rerender="1"'))}
      ${field('覆盖等待（秒）', `<input type="number" min="10" max="300" value="${rule.idle_seconds ?? ''}" placeholder="${d.proactive.idle_seconds}" data-bind="proactive.page_rules.${index}.idle_seconds" data-type="number-or-null" data-clamp="10,300" data-demo-sync="1" />`)}
      ${field('覆盖文案（留空沿用默认）', capInput(`proactive.page_rules.${index}.message`, `maxlength="${PROACTIVE_MESSAGE_MAX}" data-demo-sync="1" data-rerender="1"`), { full: true, help: `最多 ${PROACTIVE_MESSAGE_MAX} 字。` })}
      ${capCheck(`proactive.page_rules.${index}.enabled`, '这个页面启用（取消即单页停用）', 'data-demo-sync="1" data-rerender="1"')}
      <button type="button" class="cfg-btn sm ghost" data-rule-remove="proactive:${index}">${icon('trash', 'xs')}<span>删除规则</span></button>
    </div></div>`).join('')
  const emptyMessage = d.proactive.enabled && !String(d.proactive.message || '').trim()
  const message = capSection('proactive:message', '主动消息', !emptyMessage && !tooLong, d.proactive.enabled, `${!d.proactive.enabled ? '<p class="capability-readonly">没开「主动消息气泡」，下面的设置先不生效。</p>' : ''}
    ${tooLong ? capNotice(`有 ${tooLong} 条主动消息超过 ${PROACTIVE_MESSAGE_MAX} 字，气泡里放不下，请改短。`) : ''}
    <div class="cfg-form-grid">
      ${field('默认时机：停留未开口（秒）', capNumber('proactive.idle_seconds', 10, 300, 'data-demo-sync="1"'), { help: '10–300 秒，默认 30 秒。' })}
      ${field('不再触发', '', { help: '访客已开口、已留资或手动关闭后不再触发。' })}
      ${field(`默认主动消息${d.proactive.enabled ? ' *' : ''}`, capTextarea('proactive.message', 2, `maxlength="${PROACTIVE_MESSAGE_MAX}" placeholder="比如：看了一会儿了，需要我帮你对比一下各个版本吗？" data-demo-sync="1" data-rerender="1"`), { full: true, help: `最多 ${PROACTIVE_MESSAGE_MAX} 字；主动消息开启时必填。入口是数字人形象时，主动消息暂时替代形象上方的招呼语。` })}
      <div class="cfg-field full"><div class="notification-title"><strong>页面规则（${d.proactive.page_rules.length} / 50）</strong><button type="button" class="cfg-btn sm outline" data-rule-add="proactive" ${d.proactive.page_rules.length >= 50 ? 'disabled' : ''}>${icon('plus', 'xs')}<span>添加规则</span></button></div>${msgRules ? `<div class="notification-config">${msgRules}</div>` : ''}<small>从上到下第一条匹配的生效，可以覆盖等待时间和文案。</small></div>
    </div>`)
  const rules = capRules(cap, ['访客在主动消息出现后开口，这条主动消息作为助手的第一条消息记入对话，AI 知道访客回的是哪句。', '一期只有网页渠道；以后接企业微信这类渠道时，规则触发类不生效。'])
  return capDetailPage(cap, enabled, [general, interaction, auto, message, rules], renderDemoPanel('proactive', enabled))
}

/* ---------- 沉默跟进 ---------- */

function renderIdleDetail(cap) {
  const d = C()
  const enabled = isCapEnabled('idle_follow_up')
  const steps = d.idle_follow_up.steps
  const general = capGeneral(cap, 'idle_follow_up.instructions', { label: '访客回应后怎么接', placeholder: '比如：访客回复跟进时，先帮他把上一个问题问清楚。', help: '什么时候发由下面的话术和等待时间决定；这里写访客回复跟进话术后 AI 怎么接。' })
  const interaction = capFixedInteraction(cap, '窗口开着时是一条助手消息，窗口收起时以气泡出现在入口旁边。')
  const list = steps.map((step, index) => `<div class="notification-block"><div class="cfg-form-grid">
      ${field(index === 0 ? '助手回复后等待（秒）' : '上一条跟进后等待（秒）', capNumber(`idle_follow_up.steps.${index}.idle_seconds`, 15, 3600))}
      ${field(`第 ${index + 1} 条话术${enabled ? ' *' : ''}`, capTextarea(`idle_follow_up.steps.${index}.message`, 2, 'maxlength="1000" placeholder="填写固定的跟进文案，例如追问需求或给出下一步选项" data-rerender="1"'), { full: true })}
      <button type="button" class="cfg-btn sm ghost" data-idle-remove="${index}">${icon('trash', 'xs')}<span>删除</span></button>
    </div></div>`).join('')
  const ready = !enabled || (steps.length && steps.every(step => step.message.trim()))
  const stepsSec = capSection('idle_follow_up:steps', '跟进话术', ready, true, `<div class="cfg-form-grid"><div class="cfg-field full">
      <div class="notification-title"><strong>话术（${steps.length} / 3）</strong><button type="button" class="cfg-btn sm outline" data-action="cfg-idle-add" ${steps.length >= 3 ? 'disabled' : ''}>${icon('plus', 'xs')}<span>添加一条</span></button></div>
      ${list ? `<div class="notification-config">${list}</div>` : '<small>还没有话术。开启时至少要有一条，空着不能发布。</small>'}
      <small>最多 3 条，按顺序发，每条最多 1000 字；第一条从助手回复后算，之后每条从上一条跟进后算，15–3600 秒。话术是固定文案，一期不做 AI 生成。</small>
    </div></div>`)
  const rules = capRules(cap, ['只在访客页面还开着时发。访客离开后过了等待时长很久（至少 5 分钟）才回来，不补发过期的话术。', '访客回复后计时重置，从第一条重新开始；但一次会话里跟进话术加起来最多发 3 条，重置计时不重置总数。', '转人工、等待人工、正在生成回复时不发。', '关闭时允许留着空话术；开启时话术不能为空。'], true)
  return capDetailPage(cap, enabled, [general, interaction, stepsSec, rules], renderDemoPanel('idle_follow_up', enabled))
}

/* ---------- 演示：访客对话窗口 ---------- */

const DEMO_SUBTITLES = {
  lead_capture: '在窗口里直接对话。AI 判断合适时会邀请留资，提交后生成一条调试线索。',
  human_handoff: '访客要求人工后，在下方「客服工作台」接管并回复。可以切换有人在线 / 没人在线，看访客收到哪条消息。',
  asset_delivery: '向助手索要资料，按「交付条件」演示交付方式；知识库里带链接的资料才会以卡片发送。',
  proactive: '切换页面，看对话窗何时自动打开、主动消息何时出现；点开主动消息后回一句，看 AI 怎么接。时间按 5 倍速演示。',
  idle_follow_up: '先问一个问题，然后不回复，看助手按顺序补发跟进话术；一次会话最多 3 条。时间按 10 倍速演示。'
}

let demoSeq = 1

function newDemo(id) {
  return { id, epoch: Date.now(), messages: [], busy: false, session: newLeadSession(), decision: '', leadId: '', error: '', mode: 'ai', requestedAt: 0, lastVisitor: '', log: '', calls: [], pending: null, confirm: null, pattern: null, elapsed: 0, started: Date.now(), state: 'browsing', openedBy: '', stepIndex: 0, idleFrom: null, offset: 0, sending: false, idleSent: 0, forms: {}, tools: {} }
}

function demoFor(id) {
  if (!cfg.demo || cfg.demo.id !== id) cfg.demo = newDemo(id)
  return cfg.demo
}

function demoPush(demo, message) {
  const id = demoSeq++
  demo.messages.push({ ...message, id })
  return id
}

function demoUpdate(demo, id, patch) {
  demo.messages = demo.messages.map(item => item.id === id ? { ...item, ...patch } : item)
}

function demoAlive(demo, epoch) { return cfg.demo === demo && demo.epoch === epoch }

/** 逐字显示一条消息（主动消息、沉默跟进、演示脚本里的回答）。 */
async function demoSay(demo, text, extra = {}) {
  const epoch = demo.epoch
  const id = demoPush(demo, { kind: 'assistant', text: '', streaming: true, ...extra })
  refreshDemo()
  await sleep(300)
  for (let i = 6; i < text.length + 6; i += 6) {
    if (!demoAlive(demo, epoch)) return id
    demoUpdate(demo, id, { text: text.slice(0, i) })
    refreshDemo()
    await sleep(24)
  }
  demoUpdate(demo, id, { text, streaming: false })
  refreshDemo()
  return id
}

/** 走一轮调试台：显示“输入中”，再逐字显示回答，返回本轮处理结果。 */
async function demoAnswer(demo, question) {
  const epoch = demo.epoch
  const id = demoPush(demo, { kind: 'assistant', text: '', streaming: true })
  refreshDemo()
  await sleep(500)
  const { text, meta } = playgroundTurn(question, demo.session)
  if (!demoAlive(demo, epoch)) return { text, meta }
  if (meta.humanMode) {
    demo.messages = demo.messages.filter(item => item.id !== id)
    refreshDemo()
    return { text, meta }
  }
  for (let i = 6; i < text.length + 6; i += 6) {
    if (!demoAlive(demo, epoch)) return { text, meta }
    demoUpdate(demo, id, { text: text.slice(0, i) })
    refreshDemo()
    await sleep(30)
  }
  demoUpdate(demo, id, { text, streaming: false, ...(meta.materials.length ? { materials: meta.materials } : {}) })
  refreshDemo()
  return { text, meta }
}

async function demoRun(demo, script) {
  demo.busy = true
  refreshDemo()
  try { await script() } finally { demo.busy = false; refreshDemo() }
}

function demoMarkdown(text) {
  return esc(text).split('\n').map(line => line.replace(/^\s*-\s+/, '• ').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>')).join('\n')
}

const demoMeta = (sender, label = '') => `<div class="xg-widget-message-meta xg-widget-message-meta--assistant"><span class="xg-widget-message-sender">${esc(sender)}</span><time>${nowClock()}</time>${label ? `<span class="demo-meta-label">${esc(label)}</span>` : ''}</div>`

function widgetStyle() {
  const a = C().appearance
  return `--xg-widget-primary:${a.primary};--xg-widget-paper:${a.paper};--xg-widget-on-primary:${readableOn(a.primary)};--xg-widget-primary-hover:color-mix(in srgb,${a.primary} 88%,#000);--xg-widget-primary-soft:color-mix(in srgb,${a.paper} 92%,${a.primary});--xg-widget-primary-border:color-mix(in srgb,${a.paper} 68%,${a.primary});--xg-widget-accent-on-paper:${a.primary}`
}

/** 访客对话窗口：沿用 Widget 外壳样式，可输入、可点击。 */
function renderDemoWidget(demo, { quick = null, statusText = '在线', notice = '', closeable = false, compact = false, scope = 'demo' } = {}) {
  const a = C().appearance
  const brand = a.name.trim() || 'AI 助手'
  const chips = quick ?? a.quickButtons.map(item => item.text).filter(Boolean)
  const hasUser = demo.messages.some(item => item.kind === 'user')
  return `<div class="demo-widget ${compact ? 'is-compact' : ''}"><div class="xg-widget-shell" style="${widgetStyle()}">
    <header class="xg-widget-header"><div class="xg-widget-identity"><span class="xg-widget-avatar">${esc(Array.from(brand)[0])}</span><div class="xg-widget-identity-copy"><strong>${esc(brand)}</strong><small class="xg-widget-status">${statusText}</small></div></div>${closeable ? '<button type="button" class="xg-widget-header-action" aria-label="关闭" title="关闭" data-demo-close>×</button>' : ''}</header>
    <section class="xg-widget-messages"><div class="xg-widget-message-list" data-demo-list>
      ${demoMeta(brand)}<div class="xg-widget-message xg-widget-message--assistant">${demoMarkdown(a.welcome)}</div>
      ${!hasUser && chips.length ? `<div class="xg-widget-quick-actions demo-quick">${chips.map(label => `<button type="button" ${demo.busy ? 'disabled' : ''} data-demo-send="${esc(label)}">${esc(label)}</button>`).join('')}</div>` : ''}
      ${demo.messages.map(message => renderDemoMessage(demo, message, brand)).join('')}
    </div></section>
    <footer class="xg-widget-composer">${notice ? `<div class="demo-notice">${notice}</div>` : ''}
      <div class="xg-widget-input-row"><textarea rows="1" placeholder="输入你的问题…" data-demo-input="${scope}"></textarea><button type="button" class="xg-widget-send" aria-label="发送" data-demo-submit="${scope}">↗</button></div>
      ${a.attribution ? '<div class="xg-powered-slot"><span class="xg-powered"><span class="xg-powered__mark" aria-hidden="true"></span><span class="xg-powered__text">吸管 提供技术支持</span></span></div>' : ''}
    </footer>
  </div></div>`
}

function renderDemoMessage(demo, message, brand) {
  if (message.kind === 'user') return `<div class="xg-widget-message xg-widget-message--user">${esc(message.text)}</div>`
  if (message.kind === 'assistant') {
    const materials = message.materials && !message.streaming ? `<div class="xg-widget-material-list"><span class="xg-widget-material-label">相关资料</span>${message.materials.map(item => `<a class="xg-widget-material demo-material" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" data-demo-link>${icon('file', 'xs')}<span><strong>${esc(item.title)}</strong><small>${[item.kind, item.meta].filter(Boolean).join(' · ')}</small></span>${icon('download', 'xs')}</a>`).join('')}</div>` : ''
    return `${demoMeta(brand, message.label)}<div class="xg-widget-message xg-widget-message--assistant">${message.text ? demoMarkdown(message.text) : '<span class="demo-typing"><i></i><i></i><i></i></span>'}${materials}</div>`
  }
  if (message.kind === 'human') return `${demoMeta(message.sender)}<div class="xg-widget-message xg-widget-message--human">${esc(message.text)}</div>`
  if (message.kind === 'status') return `<div class="xg-widget-status-message ${message.tone === 'error' ? 'xg-widget-status-message--error' : ''} demo-status is-${message.tone || 'ok'}">${esc(message.text)}</div>`
  if (message.kind === 'lead_form') return renderDemoLeadForm(demo, message)
  if (message.kind === 'tool') {
    const trace = message.trace
    const open = demo.tools[message.id]
    return `<div class="demo-tool is-${trace.status}"><button type="button" data-demo-tool="${message.id}"><span class="demo-tool-icon">${icon('plug', 'xs')}</span><span class="demo-tool-name">${trace.status === 'running' ? `正在${trace.label}…` : `已${trace.label}`}</span>${trace.durationMs != null ? `<small>${trace.durationMs} ms</small>` : ''}${icon('chevron-down', 'xs')}</button>${open ? `<pre>${esc(JSON.stringify({ tool: trace.name, arguments: trace.args, ...(trace.result ? { result: trace.result } : {}) }, null, 2))}</pre>` : ''}</div>`
  }
  return ''
}

function renderDemoLeadForm(demo, message) {
  if (message.done || message.closed) return ''
  const fields = normalizeFormFields()
  if (!fields.some(item => CONTACT_FIELDS.includes(item.field))) return ''
  const size = ['small', 'medium', 'large'].includes(message.size) ? message.size : 'medium'
  const form = demo.forms[message.id] || (demo.forms[message.id] = { expanded: size !== 'small', values: {}, errors: {} })
  const errors = form.errors || {}
  const control = item => {
    const attrs = `data-demo-form-field="${message.id}:${item.field}" placeholder="${esc(item.placeholder)}" ${errors[item.field] ? 'aria-invalid="true"' : ''}`
    if (item.field === 'use_case') return `<textarea rows="2" ${attrs}>${esc(form.values[item.field] || '')}</textarea>`
    const type = item.field === 'phone' ? 'type="tel" inputmode="tel"' : item.field === 'email' ? 'type="email" inputmode="email"' : 'type="text"'
    return `<input ${type} value="${esc(form.values[item.field] || '')}" ${attrs} />`
  }
  const close = `<button type="button" class="xg-widget-lead-close" aria-label="关闭表单" title="关闭" data-demo-form-close="${message.id}">×</button>`
  return `<div class="xg-widget-lead-card xg-widget-lead-card--${size} ${form.expanded ? 'is-expanded' : ''} demo-lead"><div class="xg-widget-lead-intro"><h3>${esc(message.title)}</h3><p>${esc(message.description)}</p></div>
    ${form.expanded ? `<form data-demo-form="${message.id}" novalidate>${fields.map(item => `<label data-field="${item.field}"><span>${esc(item.label)}${item.required ? ' *' : ''}</span>${control(item)}${errors[item.field] ? `<small class="xg-widget-lead-field-error" role="alert">${esc(errors[item.field])}</small>` : ''}</label>`).join('')}<button type="submit">${esc(message.submitLabel)}</button></form>` : `<button type="button" class="xg-widget-lead-expand" data-demo-expand="${message.id}">填写信息</button>`}${close}
  </div>`
}

/** 平台固定的字段校验：必填、手机号（11 位或带国家区号）、邮箱格式、至少一种联系方式。返回 { 字段: 提示 }。 */
function validateLeadForm(fields, values) {
  const errors = {}
  const value = key => String(values[key] || '').trim()
  fields.forEach(item => {
    const v = value(item.field)
    if (!v) { if (item.required) errors[item.field] = `请填写${item.label}`; return }
    if (item.field === 'phone' && !/^(?:(?:\+?86)?1[3-9]\d{9}|\+\d{7,17})$/.test(v.replace(/[\s-]/g, ''))) errors.phone = '请填写 11 位手机号，或带国家区号的号码'
    if (item.field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors.email = '邮箱格式不对'
  })
  const contacts = fields.filter(item => CONTACT_FIELDS.includes(item.field))
  if (!contacts.length) errors._form = '没有可填写的联系方式'
  else if (!contacts.some(item => value(item.field)) && !contacts.some(item => errors[item.field])) errors[contacts[0].field] = `${contacts.map(item => item.label).join('、')}至少填一项`
  return errors
}

function validateContact(fields, values) {
  return Object.values(validateLeadForm(fields, values))[0] || ''
}

const demoHints = (demo, items) => `<div class="demo-hints">${Array.from(new Set(items.filter(Boolean))).slice(0, 4).map(item => `<button type="button" ${demo.busy ? 'disabled' : ''} data-demo-send="${esc(item)}">${esc(item)}</button>`).join('')}</div>`
const quickLabels = () => C().appearance.quickButtons.map(item => item.text).filter(Boolean)
const leadLink = demo => demo.leadId ? `<div class="demo-panel demo-lead-result"><div class="demo-panel-head">${icon('user-check', 'xs')}<strong>已生成调试线索</strong>${badge('success', '调试')}</div><small>调试会话产生的线索不会推送通知，在「线索」里勾选「含调试会话」可以看到。</small><button type="button" class="cfg-btn sm outline" data-action="cfg-go-leads">${icon('arrow', 'xs')}<span>去线索页查看</span></button></div>` : ''

function renderDemoPanel(id, enabled) {
  const answersOnline = ['lead_capture', 'human_handoff', 'asset_delivery'].includes(id)
  const changed = cfgSnapshot() !== cfg.published
  const body = `${!enabled ? `<div class="demo-off-note">能力还没开启，访客暂时看不到${answersOnline ? '；开启并发布后，下面的对话才会出现这项能力。' : '；下面演示开启后的效果。'}</div>` : ''}
    ${enabled && answersOnline && changed ? '<div class="demo-off-note">有未发布的改动：回答仍按线上版本，发布后再试一次。</div>' : ''}
    <div data-demo-root>${renderDemoBody(id)}</div>`
  return cfgPanel('演示', DEMO_SUBTITLES[id], `<div class="demo-preview">${body}</div>`, { cls: 'widget-preview-frame', actions: `<button type="button" class="cfg-btn sm ghost" data-action="cfg-demo-restart">${icon('refresh', 'xs')}<span>重新开始</span></button>` })
}

function renderDemoBody(id) {
  const demo = demoFor(id)
  if (id === 'lead_capture') {
    const lead = onlineLead()
    const st = demo.session
    const stats = [badge('', `${lead.interaction === 'text' ? '对话' : '表单'}方式`), badge(st.invites >= lead.max_invites ? 'warning' : '', `已主动邀请 ${st.invites} / ${lead.max_invites} 次`), st.refused ? badge('warning', '访客已拒绝') : '', st.leadId ? badge('success', '已生成线索') : badge('', '还没有线索')].join('')
    return `${renderDemoWidget(demo)}
    <div class="demo-panel"><div class="demo-panel-head">${icon('spark', 'xs')}<strong>试试这样问</strong></div>${demoHints(demo, ['我想了解一下价格', '我叫王明，在星云科技', '不用了，谢谢', '你们怎么联系我？'])}
      <div class="demo-lead-stats">${stats}</div><p>${demo.decision || '还没开始对话。'}</p>${demo.error ? `<small class="demo-error">${esc(demo.error)}</small>` : ''}
      <label class="console-checkbox"><input type="checkbox" data-demo-failsave ${st.failSave ? 'checked' : ''} /><span>模拟保存失败</span></label>
      <small>是否邀请由 AI 按左侧「什么时候用」和对话内容判断；收集方式、次数、消息按线上版本，表单字段和尺寸跟随左侧草稿。</small></div>${leadLink(demo)}`
  }
  if (id === 'human_handoff') {
    const waited = Math.max(0, Math.round((Date.now() - demo.requestedAt) / 1000))
    const tone = demo.mode === 'ai' ? '' : demo.mode === 'waiting' ? 'warning' : 'success'
    return `${renderDemoWidget(demo, { statusText: demo.mode === 'human' ? '人工客服在线' : '在线', notice: demo.mode === 'waiting' ? '正在为你转接人工客服…' : demo.mode === 'human' ? '人工客服正在为你服务' : '' })}
      <div class="demo-panel"><div class="demo-panel-head">${icon('headset', 'xs')}<strong>客服工作台</strong>${badge(tone, demo.mode === 'ai' ? 'AI 接待中' : demo.mode === 'waiting' ? '待接管' : '人工接待中')}</div>
        <div class="demo-handoff-sim"><label class="console-checkbox"><input type="checkbox" data-demo-offline ${demo.session.handoffOnline ? '' : 'checked'} ${demo.session.handoffRequested ? 'disabled' : ''} /><span>模拟没人在线</span></label>${demo.session.handoffOnline ? `<small>前面排队 ${demo.session.handoffQueue} 位，预计 ${handoffMinutes(demo.session.handoffQueue)} 分钟</small>` : `<small>${onlineLead().enabled ? '留资表单开着：发完不在线消息接着邀请留资' : '留资表单没开：只告知暂时没人在线'}</small>`}</div>
        ${demo.mode === 'ai' ? `<p>${demo.decision || '访客还在和 AI 对话。AI 按左侧「什么时候用」判断需要人工时，会提交转人工。'}</p>${demoHints(demo, ['我想找人工客服', '安装的时候报错了怎么办？', '你们怎么收费？'])}` : ''}
        ${demo.mode === 'waiting' ? `<p><strong>新的转人工请求</strong> · 已等待 <span data-demo-waited>${waited}</span> 秒</p><small>人工接管之前 AI 继续回答；访客再要人工只告诉他排队情况，不重复通知。这条调试会话也会出现在「人工」列表里（需勾选含调试会话）。</small>${demoHints(demo, ['再帮我转一下人工', '你们怎么收费？'])}<button type="button" class="cfg-btn sm primary" data-action="cfg-demo-takeover">${icon('headset', 'xs')}<span>接管对话</span></button>` : ''}
        ${demo.mode === 'human' ? `${demo.lastVisitor ? `<small>访客最近说：${esc(demo.lastVisitor)}</small>` : ''}<div class="demo-reply"><input class="console-input" placeholder="以人工身份回复访客，回车发送" data-demo-reply /><button type="button" class="cfg-btn sm primary" data-action="cfg-demo-reply">发送</button></div><button type="button" class="cfg-btn sm ghost" data-action="cfg-demo-release">${icon('bot', 'xs')}<span>交还 AI</span></button>` : ''}
        ${demo.error ? `<small class="demo-error">${esc(demo.error)}</small>` : ''}</div>`
  }
  if (id === 'asset_delivery') {
    const delivery = C().actions.asset_delivery
    const modeLabel = delivery.mode === 'immediate' ? '立即交付' : delivery.mode === 'contact_required' ? '收集联系方式后交付' : '仅由人工交付'
    return `${renderDemoWidget(demo)}
      <div class="demo-panel"><div class="demo-panel-head">${icon('file', 'xs')}<strong>交付情况</strong>${badge('info', modeLabel)}</div>${demoHints(demo, ['有相关资料可以发我吗？', '有产品手册吗？', ...quickLabels()])}<p>${demo.log || '还没开始对话。'}</p>${demo.error ? `<small class="demo-error">${esc(demo.error)}</small>` : ''}<small>每轮最多 ${delivery.max_items} 份；只有被本轮回答采用、且带链接的知识库资料才会以卡片发送。</small></div>${leadLink(demo)}`
  }
  if (id === 'proactive') return renderProactiveDemo(demo)
  if (id === 'idle_follow_up') return renderIdleDemo(demo)
  return ''
}

/* 主动弹窗演示：按当前草稿的页面规则，5 倍速 */
function wildcardMatches(pattern, url) {
  const normalized = String(pattern || '').trim()
  if (!normalized) return false
  const expression = normalized.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  let candidates = [url]
  try { const parsed = new URL(url); candidates = [parsed.href, `${parsed.pathname}${parsed.search}${parsed.hash}`] } catch (_) {}
  const matcher = new RegExp(`^${expression}$`, 'i')
  return candidates.some(candidate => matcher.test(candidate))
}
const bounded = (value, fallback, min, max) => { const n = Number(value); return Number.isFinite(n) && value !== null && value !== '' ? Math.min(max, Math.max(min, n)) : fallback }
function selectWidgetTrigger(autoOpen, proactive, url) {
  if (autoOpen.enabled) {
    const rule = autoOpen.page_rules.find(item => wildcardMatches(item.pattern, url))
    if (rule?.enabled !== false) return { kind: 'auto_open', delayMs: bounded(rule?.delay_seconds, bounded(autoOpen.delay_seconds, 5, 0, 60), 0, 60) * 1000 }
  }
  if (proactive.enabled) {
    const rule = proactive.page_rules.find(item => wildcardMatches(item.pattern, url))
    if (rule?.enabled === false) return null
    const message = String(rule?.message || proactive.message || '').trim()
    if (message) return { kind: 'proactive', delayMs: bounded(rule?.idle_seconds, bounded(proactive.idle_seconds, 30, 10, 300), 10, 300) * 1000, message }
  }
  return null
}
const PROACTIVE_PAGE_INTROS = [
  { key: 'pricing', text: '价格页上的三个版本主要差在会话额度和人工协作，我可以按你们的访客量帮你挑一个。' },
  { key: 'enterprise', text: '企业版支持私有化部署、单点登录和专属顾问，适合对数据安全要求高的团队。' },
  { key: 'docs', text: '接入只要在官网加一行脚本，几分钟就能上线；遇到哪一步卡住了可以直接告诉我。' },
  { key: 'cases', text: '我们有制造、教育、企业服务等行业的案例，告诉我你们做什么，我挑同行的给你看。' }
]
const examplePath = pattern => pattern.trim().replace(/\/\*/g, '/getting-started').replace(/\*/g, '') || '/'

function proactiveTrigger(demo) {
  const d = C()
  const effective = d.auto_open.enabled || d.proactive.enabled ? d : { ...d, auto_open: { ...d.auto_open, enabled: true } }
  const patterns = Array.from(new Set(['/', ...d.auto_open.page_rules.map(rule => rule.pattern), ...d.proactive.page_rules.map(rule => rule.pattern)].filter(Boolean)))
  if (!demo.pattern || !patterns.includes(demo.pattern)) demo.pattern = patterns[1] ?? '/'
  const path = examplePath(demo.pattern)
  return { patterns, path, trigger: selectWidgetTrigger(effective.auto_open, effective.proactive, `https://www.example.com${path}`) }
}

function renderProactiveDemo(demo) {
  const brand = C().appearance.name.trim() || 'AI 助手'
  const { patterns, path, trigger } = proactiveTrigger(demo)
  const signature = JSON.stringify([path, trigger])
  if (demo.signature !== signature) { Object.assign(demo, { signature, elapsed: 0, started: Date.now(), state: 'browsing', openedBy: '', messages: [], epoch: Date.now(), session: newLeadSession(), closedManually: false, proactiveMsg: '', decision: '' }) }
  const ruleText = !trigger ? '这个页面不会主动打扰访客' : trigger.kind === 'auto_open' ? `停留 ${trigger.delayMs / 1000} 秒后自动打开对话` : `停留 ${trigger.delayMs / 1000} 秒后显示主动消息「${esc(trigger.message)}」`
  return `<div class="site-demo" style="--site-demo-primary:${C().appearance.primary}">
      <div class="site-demo-tabs" role="tablist" aria-label="选择页面">${patterns.map(item => `<button type="button" role="tab" aria-selected="${item === demo.pattern}" class="${item === demo.pattern ? 'is-current' : ''}" data-demo-pattern="${esc(item)}">${item === '/' ? '首页' : esc(item)}</button>`).join('')}</div>
      <div class="site-demo-browser"><div class="site-demo-chrome" aria-hidden="true"><i></i><i></i><i></i><span>www.example.com${esc(path)}</span></div>
        <div class="site-demo-page"><div class="site-demo-nav"><b></b><span></span><span></span><span></span><em></em></div><div class="site-demo-hero"><strong>${path === '/' ? '首页' : esc(path)}</strong><span></span><span></span></div><div class="site-demo-cards"><span></span><span></span><span></span></div><div class="site-demo-lines"><span></span><span></span><span></span><span></span></div>
          ${demo.state === 'browsing' ? `<div class="site-demo-hint">${icon('clock', 'xs')}${demo.closedManually ? '访客手动关闭了对话窗，本次访问不再触发' : `访客停留 <span data-demo-elapsed>${demo.elapsed}</span> 秒 · ${ruleText}`}</div>` : ''}
          ${demo.state === 'bubble' && trigger?.kind === 'proactive' ? `<button type="button" class="demo-proactive-bubble" data-action="cfg-demo-open-bubble"><strong>${esc(brand)}</strong>${esc(trigger.message)}</button>` : ''}
          ${demo.state === 'open' ? `<div class="demo-site-chat">${renderDemoWidget(demo, { quick: [], closeable: true, compact: true })}</div>` : `<button type="button" class="demo-launcher" aria-label="打开对话" data-action="cfg-demo-launch">${esc(Array.from(brand)[0])}</button>`}
        </div></div></div>
    <div class="demo-panel"><div class="demo-panel-head">${icon('spark', 'xs')}<strong>这个页面的规则</strong></div><p>${ruleText}。${demo.openedBy ? `<br />本次：${demo.openedBy}。` : ''}${demo.decision ? `<br />${esc(demo.decision)}` : ''}</p><small>页面规则从上到下第一条匹配的生效，没有命中时用全站默认。自动打开和主动消息同时命中时只取自动打开；一次访问最多出现一个。改左侧设置后会从头演示。</small></div>`
}

/* 沉默跟进演示：10 倍速 */
function idleSeconds(demo) { return demo.idleFrom == null ? 0 : Math.floor(((Date.now() - demo.idleFrom) / 1000) * 10) + demo.offset }

function renderIdleDemo(demo) {
  const steps = C().idle_follow_up.steps.filter(step => step.message.trim())
  const step = steps[demo.stepIndex]
  const seconds = idleSeconds(demo)
  let status
  if (!steps.length) status = '<p>左侧还没有跟进话术，先添加一步。</p>'
  else if (demo.idleSent >= IDLE_MAX_PER_SESSION) status = `<p>本次会话已经发满 ${IDLE_MAX_PER_SESSION} 条跟进话术，之后访客再沉默也不再发；访客回复不会重置这个总数。</p>`
  else if (demo.idleFrom == null) status = '<p>访客发出一条消息、助手回复后开始计时。先问一个问题，然后别回复。</p>'
  else if (step) status = `<p>访客已沉默 <span data-demo-idle>${seconds}</span> 秒 · 第 ${demo.stepIndex + 1}/${steps.length} 条跟进将在 ${step.idle_seconds} 秒时发出</p><div class="demo-progress"><i data-demo-progress style="width:${Math.min(100, (seconds / step.idle_seconds) * 100)}%"></i></div><button type="button" class="cfg-btn sm ghost" data-action="cfg-demo-forward">${icon('arrow', 'xs')}<span>快进到这一条</span></button>`
  else status = `<p>${steps.length} 条跟进话术都已发出。访客再次发言后会重新计时。</p>`
  return `${renderDemoWidget(demo)}<div class="demo-panel"><div class="demo-panel-head">${icon('clock', 'xs')}<strong>沉默计时</strong>${badge('', '10 倍速')}${badge(demo.idleSent >= IDLE_MAX_PER_SESSION ? 'warning' : '', `本次会话已发 ${demo.idleSent} / ${IDLE_MAX_PER_SESSION} 条`)}</div>${status}${demoHints(demo, quickLabels())}<small>访客一回复就停止跟进，下一轮回答后从第一条重新计时；一次会话加起来最多 ${IDLE_MAX_PER_SESSION} 条。</small></div>`
}

/** 留资相关的系统消息与决策说明（留资表单、资料交付两个演示共用）。 */
function applyLeadMeta(demo, meta) {
  const lead = onlineLead()
  const names = keys => keys.map(key => fieldLabel(key, lead)).join('、')
  const notes = []
  if (meta.leadSaveFailed) { demoPush(demo, { kind: 'status', tone: 'error', text: leadMessage(lead, 'failure') }); notes.push('保存没有成功，显示了失败消息；访客可以再发一次。') }
  if (meta.leadCaptured) { demoPush(demo, { kind: 'status', text: leadMessage(lead, 'success') }); demo.leadId = meta.leadId; notes.push(`访客在对话里给出了${names(meta.got)}，保存成功后才显示成功消息，生成了一条线索。${lead.enabled ? '' : '（能力关闭时也会记录，这是平台行为。）'}`) }
  else if (meta.leadMerged) notes.push(`访客补充了${names(meta.got)}，合并进同一条线索。`)
  else if (meta.got.length && !meta.leadSaveFailed) notes.push(`记下了${names(meta.got)}；还没有联系方式，暂不生成线索，拿到后合并进同一条。`)
  if (meta.refused) notes.push('访客明确拒绝了，本次会话不再邀请。')
  if (meta.handoffInvite) notes.push('转人工时没人在线，留资表单开着，接着邀请留资；不占留资表单的邀请次数。')
  else if (meta.invited) notes.push(meta.selfRequest ? '访客自己说要留联系方式，不受邀请次数限制。' : `AI 判断这一轮适合邀请（第 ${demo.session.invites} / ${lead.max_invites} 次）。`)
  if (meta.asked) { const hint = leadFieldsOf(lead).find(item => item.key === meta.asked)?.ai_hint?.trim(); notes.push(`在对话里问「${fieldLabel(meta.asked, lead)}」${hint ? `，按「给 AI 的说明」：${hint}` : ''}。`) }
  if (meta.note) notes.push(meta.note)
  return notes
}

/* 发送一句访客消息：按当前演示的能力处理 */
function demoSend(text) {
  const value = String(text || '').trim()
  const demo = cfg.demo
  if (!value || !demo || demo.busy) return
  const id = demo.id
  if (id === 'mcp') return mcpSend(demo, value)
  if (id === 'human_handoff') demo.lastVisitor = value
  if (id === 'idle_follow_up') { demo.idleFrom = null; demo.stepIndex = 0; demo.offset = 0 }
  if (id === 'proactive' && demo.proactiveMsg && !demo.messages.some(item => item.kind === 'user')) {
    return demoRun(demo, async () => {
      demoPush(demo, { kind: 'user', text: value })
      const { path } = proactiveTrigger(demo)
      const affirm = /^(好|好的|嗯|可以|需要|要|行|是的?|对)[!！。.~～]*$/.test(value)
      const intro = PROACTIVE_PAGE_INTROS.find(item => path.includes(item.key))?.text || '吸管 Chat 可以 7×24 小时接待官网访客，回答产品问题、识别意向并留下线索。'
      await demoSay(demo, affirm ? `好的。你正在看「${path}」，先简单介绍一下：${intro}` : baseAnswer(value))
      demo.decision = `访客回的是主动消息「${demo.proactiveMsg}」，AI 知道上下文，按「访客回应后怎么接」：${String(C().proactive.instructions || '').trim() || '（未填写）'}`
    })
  }
  demoRun(demo, async () => {
    demoPush(demo, { kind: 'user', text: value })
    const { meta } = await demoAnswer(demo, value)
    const formSize = onlineLead().form_size
    if (id === 'lead_capture') {
      const notes = applyLeadMeta(demo, meta)
      if (meta.suggestLeadForm) { demoPush(demo, { kind: 'lead_form', title: '留下联系方式', description: '方便的话留个联系方式，我们会尽快联系你。', submitLabel: '提交', size: formSize }); notes.push('弹出了联系表单。') }
      demo.decision = notes.join(' ') || 'AI 判断这一轮还不适合邀请。'
    }
    if (id === 'human_handoff') {
      const notes = applyLeadMeta(demo, meta)
      if (meta.handoffRequested) {
        demoPush(demo, { kind: 'status', text: '已提交转人工' })
        demo.mode = 'waiting'
        demo.requestedAt = Date.now()
      }
      if (meta.handoffOffline) notes.unshift('没人在线：对话没有进入待接管，发了没人在线时的消息。')
      if (meta.handoffRepeat) notes.unshift('访客再次要求人工：只告诉他当前排队情况，不重复通知。')
      if (meta.suggestLeadForm) demoPush(demo, { kind: 'lead_form', title: '留下联系方式', description: '人工上线后会尽快联系你。', submitLabel: '提交', size: formSize })
      demo.decision = notes.join(' ')
    }
    if (id === 'asset_delivery') {
      applyLeadMeta(demo, meta)
      demo.log = meta.materials.length ? `本轮交付了 ${meta.materials.length} 份资料。` : '本轮没有交付资料：可能是问题与资料无关、交付条件未满足，或知识库里没有带链接的资料。'
      if (meta.handoffRequested) demoPush(demo, { kind: 'status', text: '已提交人工接管请求' })
      if (meta.suggestLeadForm) demoPush(demo, { kind: 'lead_form', title: '留下联系方式', description: '留下联系方式后即可获取资料。', submitLabel: '提交', size: formSize })
    }
    if (id === 'idle_follow_up') demo.idleFrom = Date.now()
  })
}

function demoSubmitLead(messageId) {
  const demo = cfg.demo
  const form = demo?.forms[messageId]
  if (!form) return
  const lead = C().actions.lead_capture
  const fields = normalizeFormFields()
  form.errors = validateLeadForm(fields, form.values)
  if (Object.keys(form.errors).length) return refreshDemo()
  demo.error = ''
  if (demo.session.failSave) {
    // 保存失败：显示失败消息，表单保留已填内容，可以重新提交
    demoPush(demo, { kind: 'status', tone: 'error', text: leadMessage(lead, 'failure') })
    demo.decision = '保存没有成功：显示失败消息，表单保留已填内容。取消「模拟保存失败」后重新提交，只会生成一条线索。'
    return refreshDemo()
  }
  const values = Object.fromEntries(fields.map(item => [item.field, String(form.values[item.field] || '').trim()]).filter(([, value]) => value))
  Object.assign(demo.session.values, values)
  const created = !demo.session.leadId
  const saved = saveSessionLead(demo.session)
  demoUpdate(demo, messageId, { done: true })
  demoPush(demo, { kind: 'status', text: leadMessage(lead, 'success') })
  if (demo.id === 'asset_delivery') demoPush(demo, { kind: 'status', text: '再问一次即可拿到资料' })
  demo.leadId = saved.id || demo.leadId
  demo.decision = created ? '表单提交成功，生成了一条线索。之后不再弹表单。' : '表单提交成功，补进了同一条线索，不会重复生成。'
  refreshDemo()
}

function demoCloseLeadForm(messageId) {
  const demo = cfg.demo
  if (!demo) return
  demoUpdate(demo, messageId, { closed: true })
  demo.session.lastInvited = false
  demo.decision = '访客关掉了表单：算没回应，不算拒绝。还有邀请次数时，AI 之后仍可能再邀请。'
  refreshDemo()
}

/* 刷新演示区域：保留输入框草稿与焦点，消息列表滚到底部 */
function refreshDemo() {
  const roots = document.querySelectorAll('[data-demo-root]')
  if (!roots.length || !cfg.demo) return
  const active = document.activeElement
  const keep = active && active.closest('[data-demo-root]') && (active.matches('textarea, input')) ? { key: active.matches('[data-demo-input]') ? `[data-demo-input="${active.dataset.demoInput}"]` : active.matches('[data-demo-reply]') ? '[data-demo-reply]' : active.dataset.demoFormField ? `[data-demo-form-field="${active.dataset.demoFormField}"]` : null, value: active.value, start: active.selectionStart } : null
  const drafts = [...document.querySelectorAll('[data-demo-root] [data-demo-input], [data-demo-root] [data-demo-reply]')].map(node => [node.matches('[data-demo-reply]') ? '[data-demo-reply]' : `[data-demo-input="${node.dataset.demoInput}"]`, node.value])
  roots.forEach(root => { root.innerHTML = renderDemoRoot() })
  drafts.forEach(([selector, value]) => { const node = document.querySelector(`[data-demo-root] ${selector}`); if (node && value) node.value = value })
  if (keep?.key) { const node = document.querySelector(`[data-demo-root] ${keep.key}`); if (node) { node.focus(); try { node.setSelectionRange(keep.start, keep.start) } catch (_) {} } }
  document.querySelectorAll('[data-demo-list]').forEach(list => { list.scrollTop = list.scrollHeight })
}

function renderDemoRoot() {
  const id = cfg.demo?.id
  if (id === 'mcp') return renderMcpDemo(cfg.demo)
  return renderDemoBody(id)
}

/* 计时：主动弹窗 5 倍速、沉默跟进 10 倍速、转人工等待秒数 */
setInterval(() => {
  const demo = cfg.demo
  if (!demo || !document.querySelector('[data-demo-root]')) return
  if (demo.id === 'proactive' && demo.state === 'browsing' && !demo.closedManually) {
    demo.elapsed = Math.floor(((Date.now() - demo.started) / 1000) * 5)
    const { trigger } = proactiveTrigger(demo)
    if (trigger && demo.elapsed * 1000 >= trigger.delayMs) {
      if (trigger.kind === 'auto_open') { demo.state = 'open'; demo.openedBy = `停留 ${trigger.delayMs / 1000} 秒后自动打开` } else demo.state = 'bubble'
      refreshDemo()
    } else { const node = document.querySelector('[data-demo-elapsed]'); if (node) node.textContent = demo.elapsed }
  }
  if (demo.id === 'idle_follow_up' && demo.idleFrom != null) {
    const steps = C().idle_follow_up.steps.filter(step => step.message.trim())
    const step = steps[demo.stepIndex]
    const seconds = idleSeconds(demo)
    if (step && !demo.sending && demo.idleSent < IDLE_MAX_PER_SESSION && seconds >= step.idle_seconds) {
      demo.sending = true
      demo.idleSent += 1
      demoSay(demo, step.message, { label: '沉默跟进' }).then(() => { demo.sending = false; demo.stepIndex += 1; demo.idleFrom = Date.now(); demo.offset = 0; refreshDemo() })
    } else if (step) {
      const node = document.querySelector('[data-demo-idle]'); if (node) node.textContent = seconds
      const bar = document.querySelector('[data-demo-progress]'); if (bar) bar.style.width = `${Math.min(100, (seconds / step.idle_seconds) * 100)}%`
    }
  }
  if (demo.id === 'human_handoff' && demo.mode === 'waiting') {
    const node = document.querySelector('[data-demo-waited]'); if (node) node.textContent = Math.max(0, Math.round((Date.now() - demo.requestedAt) / 1000))
  }
}, 200)

/* ---------- 测评式营销 ---------- */

let protoSeq = 0
const newProtoId = prefix => `${prefix}_${Date.now().toString(36)}${(protoSeq += 1)}`
const maxScore = questions => questions.reduce((sum, q) => sum + (q.multiple ? q.options.reduce((s, o) => s + Math.max(0, o.score), 0) : Math.max(0, ...q.options.map(o => o.score))), 0)
function percentScore(questions, answers) {
  const max = maxScore(questions)
  const raw = questions.reduce((sum, q) => sum + q.options.filter(o => answers[q.id]?.includes(o.id)).reduce((s, o) => s + o.score, 0), 0)
  return max ? Math.round((raw / max) * 100) : 0
}
const matchResult = (results, score) => results.find(r => score >= r.min_score && score <= r.max_score) ?? [...results].sort((a, b) => Math.abs(a.min_score - score) - Math.abs(b.min_score - score))[0]
function rangeIssues(results) {
  const issues = []
  const sorted = [...results].sort((a, b) => a.min_score - b.min_score)
  let cursor = 0
  for (const r of sorted) {
    if (r.min_score > r.max_score) issues.push(`「${r.name || '未命名方案'}」的最低分大于最高分`)
    if (r.min_score > cursor) issues.push(`${cursor}–${r.min_score - 1} 分没有对应方案`)
    if (r.min_score < cursor) issues.push(`「${r.name || '未命名方案'}」与上一个方案的分数区间重叠`)
    cursor = Math.max(cursor, r.max_score + 1)
  }
  if (cursor <= 100) issues.push(`${cursor}–100 分没有对应方案`)
  return issues
}

function renderAssessmentDetail(cap) {
  const d = C()
  const s = d.assessment
  const issues = rangeIssues(s.results)
  const questionsReady = s.questions.length > 0 && s.questions.every(q => q.title.trim() && q.options.length >= 2 && q.options.every(o => o.label.trim()))
  const resultsReady = s.results.length > 0 && !issues.length && s.results.every(r => r.name.trim() && r.plan.some(line => line.trim()))
  const needsLead = s.gate !== 'none' && !d.actions.lead_capture.enabled
  const sec = name => `assessment:${name}`

  const entry = capSection(sec('entry'), '测评与入口', Boolean(s.title.trim() && s.entry_label.trim()), true, `<div class="cfg-form-grid">
    ${field('测评名称', capInput('assessment.title', 'maxlength="30" data-live="assess"'), { help: '显示在答题卡片顶部，建议点明“测什么”。' })}
    ${field('入口文案', capInput('assessment.entry_label', 'maxlength="30" data-live="assess"'), { help: '用“免费、几分钟、测出…”这类说法，点击率更高。' })}
    ${field('开场说明', capTextarea('assessment.intro', 2, 'maxlength="200" data-live="assess"'), { full: true, help: '访客点开测评后先看到这段话：告诉对方要答几题、花多久、能得到什么。' })}
    <div class="cfg-field full"><label>访客从哪里进入测评</label><div class="assess-entry-options">
      <label class="console-checkbox"><input type="checkbox" data-bind="assessment.show_entry_button" data-rerender="1" ${s.show_entry_button ? 'checked' : ''} /><span><strong>欢迎语下方显示入口按钮</strong><small>排在快捷问题最前面，访客一打开对话就能看到。</small></span></label>
      <label class="console-checkbox"><input type="checkbox" data-bind="assessment.ai_invite" data-rerender="1" ${s.ai_invite ? 'checked' : ''} /><span><strong>AI 在对话中适时邀请</strong><small>访客犹豫、比较方案时，由 AI 判断后发出邀请。</small></span></label>
    </div></div>
    ${s.ai_invite ? field('什么时候邀请', capTextarea('assessment.instructions', 2, 'maxlength="1000" placeholder="例如：访客问“适不适合我们”“该选哪个版本”时邀请。"'), { full: true, help: '写给智能体的邀请时机；能力关闭时不会进入运行时。' }) : ''}
  </div>`)

  const questions = capSection(sec('questions'), `题目（${s.questions.length} 道）`, questionsReady, true, `<div class="assess-editor">${s.questions.map((q, qi) => `<div class="assess-q">
      <div class="assess-q-head"><span class="assess-q-index">第 ${qi + 1} 题</span>
        <select class="console-select" aria-label="题型" data-assess-multiple="${qi}"><option value="single" ${q.multiple ? '' : 'selected'}>单选</option><option value="multiple" ${q.multiple ? 'selected' : ''}>多选</option></select>
        <span class="cfg-capdetail-spacer"></span>
        <button type="button" class="cfg-icon-btn" aria-label="上移" data-assess-move="${qi}:-1" ${qi === 0 ? 'disabled' : ''}>${icon('arrow-up', 'sm')}</button>
        <button type="button" class="cfg-icon-btn" aria-label="下移" data-assess-move="${qi}:1" ${qi === s.questions.length - 1 ? 'disabled' : ''}>${icon('arrow-down', 'sm')}</button>
        <button type="button" class="cfg-icon-btn" aria-label="删除题目" data-assess-qremove="${qi}" ${s.questions.length <= 1 ? 'disabled' : ''}>${icon('trash', 'sm')}</button></div>
      <input class="console-input assess-q-title" aria-label="第 ${qi + 1} 题题目" value="${esc(q.title)}" placeholder="题目，例如：你的官网每月大概有多少访客？" data-bind="assessment.questions.${qi}.title" data-live="assess" />
      <div class="assess-options-edit"><div class="assess-options-head"><span>选项</span><span>分值</span><span></span></div>
        ${q.options.map((o, oi) => `<div class="assess-option-row"><input class="console-input" aria-label="选项文字" value="${esc(o.label)}" placeholder="选项 ${oi + 1}" data-bind="assessment.questions.${qi}.options.${oi}.label" data-live="assess" /><input class="console-input" aria-label="分值" type="number" min="0" max="100" value="${o.score}" data-bind="assessment.questions.${qi}.options.${oi}.score" data-type="number" data-clamp="0,100" data-live="assess" /><button type="button" class="cfg-icon-btn" aria-label="删除选项" data-assess-oremove="${qi}:${oi}" ${q.options.length <= 2 ? 'disabled' : ''}>${icon('close', 'sm')}</button></div>`).join('')}
        <button type="button" class="cfg-btn sm ghost" data-assess-oadd="${qi}" ${q.options.length >= 6 ? 'disabled' : ''}>${icon('plus', 'xs')}<span>添加选项</span></button></div>
    </div>`).join('')}
    <div class="assess-editor-foot"><button type="button" class="cfg-btn sm outline" data-action="cfg-assess-qadd" ${s.questions.length >= 8 ? 'disabled' : ''}>${icon('plus', 'xs')}<span>添加题目</span></button><small>建议 3–5 道题。分值越高，代表需求越强、越适合高阶方案；满分 ${maxScore(s.questions)}，访客得分会换算成百分制。</small></div>
  </div>`)

  const results = capSection(sec('results'), `结果方案（${s.results.length} 档）`, resultsReady, true, `<div class="assess-editor">
    ${issues.length ? capNotice(`<strong>得分区间需要调整：</strong>${issues.join('；')}。`) : ''}
    ${s.results.map((r, ri) => `<div class="assess-q assess-r">
      <div class="assess-q-head"><input class="console-input assess-r-name" aria-label="方案等级" value="${esc(r.name)}" placeholder="等级，例如：成长型" data-bind="assessment.results.${ri}.name" data-live="assess" />
        <span class="assess-range">得分<input class="console-input" aria-label="最低分" type="number" min="0" max="100" value="${r.min_score}" data-bind="assessment.results.${ri}.min_score" data-type="number" data-clamp="0,100" data-rerender="1" />–<input class="console-input" aria-label="最高分" type="number" min="0" max="100" value="${r.max_score}" data-bind="assessment.results.${ri}.max_score" data-type="number" data-clamp="0,100" data-rerender="1" /></span>
        <span class="cfg-capdetail-spacer"></span>
        <button type="button" class="cfg-icon-btn" aria-label="删除方案" data-assess-rremove="${ri}" ${s.results.length <= 1 ? 'disabled' : ''}>${icon('trash', 'sm')}</button></div>
      <div class="cfg-form-grid">
        ${field('一句话结论', capInput(`assessment.results.${ri}.headline`, 'placeholder="例如：把流量变成线索" data-live="assess"'))}
        ${field('诊断说明', capInput(`assessment.results.${ri}.diagnosis`, 'placeholder="告诉访客现在处在什么阶段" data-live="assess"'))}
        ${field('推荐方案（每行一条）', capLines(`assessment.results.${ri}.plan`, 3, 'data-live="assess"'), { full: true })}
        ${field('行动按钮', capInput(`assessment.results.${ri}.cta_label`, 'placeholder="例如：预约产品演示" data-live="assess"'))}
        ${field('按钮链接', capInput(`assessment.results.${ri}.cta_url`, 'type="url" placeholder="https://"'))}
      </div></div>`).join('')}
    <div class="assess-editor-foot"><button type="button" class="cfg-btn sm outline" data-action="cfg-assess-radd" ${s.results.length >= 5 ? 'disabled' : ''}>${icon('plus', 'xs')}<span>添加方案</span></button><small>按访客的百分制得分匹配方案；各档区间要连起来覆盖 0–100 分。</small></div>
  </div>`)

  const gate = capSection(sec('gate'), '留资与线索', !needsLead, false, `<div class="assess-gates" role="radiogroup" aria-label="留资时机">${ASSESSMENT_GATES.map(item => `<button type="button" role="radio" aria-checked="${s.gate === item.value}" class="${s.gate === item.value ? 'is-current' : ''}" data-assess-gate="${item.value}"><strong>${item.label}${item.recommended ? badge('success', '推荐') : ''}</strong><small>${item.description}</small></button>`).join('')}</div>
    <small class="capability-hint">表单字段沿用「留资表单」能力里的设置，访客至少要留一种联系方式。</small>
    ${capCheck('assessment.attach_to_lead', '把答题记录和测评结果写入线索，销售跟进时直接可见')}`)

  const banner = `<div class="assess-banner"><div class="assess-banner-copy"><strong>把“要电话”变成“送方案”</strong><p>访客更愿意为一份“专门给我的方案”留下联系方式。答题过程本身就是需求调研，每条线索都带着规模、现状和痛点。</p><small>适合需要诊断、有多个版本或套餐的业务：SaaS 选型、教育课程、装修、保险、医美、企业服务…</small></div>
    <ol class="assess-steps">${[['circle-check', '访客答题', '3–5 道选择题，1 分钟答完'], ['spark', '自动出方案', '按得分匹配最合适的方案'], ['user-check', '留资解锁', '想看完整方案，先留联系方式']].map(([iconName, title, text], index) => `<li><span class="assess-step-icon">${icon(iconName, 'sm')}</span><strong>${index + 1}. ${title}</strong><small>${text}</small></li>`).join('')}</ol></div>`

  return cfgPage('cap-assessment', `${capHeader(cap, s.enabled)}
    <section class="cfg-body">${renderCfgHint()}${capNotices('assessment')}
      ${needsLead ? capNotice('<strong>留资表单未开启。</strong>测评会直接给出完整方案，不会收集联系方式。', '<button type="button" class="cfg-btn sm outline" data-cap-config="lead_capture">去开启留资表单</button>') : ''}
      <div class="agent-config-layout assess-layout">
        <div class="agent-config-main">${banner}<div class="capability-sections">${entry}${questions}${results}${gate}</div></div>
        <aside class="agent-config-side assess-side">${cfgPanel('访客体验预览', '可以直接点选作答，体验访客从测评到留资的完整过程；显示当前草稿。', `<div data-assess-root>${renderAssessPreview()}</div>`, { cls: 'widget-preview-frame' })}</aside>
      </div>
    </section>`)
}

function assessDemo() {
  const s = C().assessment
  const signature = JSON.stringify([s.questions, s.results, s.gate, s.intro, s.entry_label, s.title])
  if (!cfg.assess || cfg.assess.signature !== signature) cfg.assess = { signature, phase: 'welcome', steps: [], index: 0, answers: {}, lead: null, form: { values: {}, error: '' } }
  return cfg.assess
}

function renderAssessPreview() {
  const d = C()
  const s = d.assessment
  const st = assessDemo()
  const brand = d.appearance.name.trim() || 'AI 助手'
  const questions = s.questions.filter(q => q.title.trim() && q.options.length)
  const score = percentScore(questions, st.answers)
  const result = matchResult(s.results, score)
  const leadEnabled = s.gate !== 'none' && d.actions.lead_capture.enabled
  const unlocked = s.gate === 'none' || Boolean(st.lead) || !d.actions.lead_capture.enabled
  const question = questions[st.index]
  const assistant = text => `<div class="assess-assistant">${demoMeta(brand)}<div class="xg-widget-message xg-widget-message--assistant">${text}</div></div>`
  const leadCard = (title, description, submit) => {
    const fields = normalizeFormFields().filter(item => item.field !== 'use_case')
    return `<div class="xg-widget-lead-card assess-lead"><div class="xg-widget-lead-intro"><h3>${esc(title)}</h3><p>${esc(description)}</p></div><form data-assess-form novalidate>${fields.map(item => `<label data-field="${item.field}"><span>${esc(item.label)}${item.required ? ' *' : ''}</span><input value="${esc(st.form.values[item.field] || '')}" placeholder="${esc(item.placeholder || '')}" data-assess-field="${item.field}" /></label>`).join('')}${st.form.error ? `<p class="xg-widget-lead-error" role="alert">${esc(st.form.error)}</p>` : ''}<button type="submit">${esc(submit)}</button></form></div>`
  }
  let body = ''
  if (st.phase === 'welcome') body = `<div class="assess-quick">${s.show_entry_button ? `<button type="button" class="assess-entry" data-action="cfg-assess-start">${icon('circle-check', 'xs')}${esc(s.entry_label)}</button>` : ''}<div class="xg-widget-quick-actions">${d.appearance.quickButtons.filter(item => item.text.trim()).map(item => `<button type="button" aria-disabled="true" title="预览只演示测评流程">${esc(item.text)}</button>`).join('')}</div>${!s.show_entry_button ? '<button type="button" class="assess-ai-invite" data-action="cfg-assess-start">演示：AI 在对话中邀请访客做测评</button>' : ''}</div>`
  body += st.steps.map(step => step.kind === 'user' ? `<div class="xg-widget-message xg-widget-message--user">${esc(step.text)}</div>` : assistant(esc(step.text))).join('')
  if (st.phase === 'quiz' && question) {
    body += `<div class="assess-card" aria-label="${esc(s.title)}"><div class="assess-card-head"><strong>${esc(s.title)}</strong><span>${st.index + 1} / ${questions.length}</span></div><div class="assess-progress"><i style="width:${((st.index + 1) / questions.length) * 100}%"></i></div><h3>${esc(question.title)}</h3>
      <div class="assess-options ${question.multiple ? 'is-multiple' : ''}" role="${question.multiple ? 'group' : 'radiogroup'}">${question.options.map(option => { const picked = st.answers[question.id]?.includes(option.id); return `<button type="button" class="${picked ? 'is-picked' : ''}" role="${question.multiple ? 'checkbox' : 'radio'}" aria-checked="${Boolean(picked)}" data-assess-choose="${question.id}:${option.id}"><span class="assess-option-mark">${picked ? icon('check') : ''}</span>${esc(option.label)}</button>` }).join('')}</div>
      <div class="assess-card-foot">${st.index > 0 ? '<button type="button" class="assess-link" data-action="cfg-assess-prev">上一题</button>' : '<span></span>'}${question.multiple ? `<button type="button" class="assess-next" data-action="cfg-assess-next" ${st.answers[question.id]?.length ? '' : 'disabled'}>${st.index + 1 < questions.length ? '下一题' : '查看结果'}</button>` : ''}</div></div>`
  }
  if (st.phase === 'thinking') body += assistant('<span class="assess-typing"><i></i><i></i><i></i></span> 正在根据你的回答生成方案…')
  if (st.phase === 'gate') body += assistant('测评结果已经生成。留下联系方式，马上查看你的得分和专属方案。') + leadCard('查看你的测评结果', '结果和方案会同步发给你，方便之后回看。', '查看结果')
  if (st.phase === 'result' && result) {
    const plan = result.plan.filter(line => line.trim())
    const visible = unlocked ? plan : plan.slice(0, 1)
    const hidden = unlocked ? [] : plan.slice(1)
    body += assistant('测完啦！这是根据你的回答给出的结果👇')
    body += `<div class="assess-result"><div class="assess-result-head"><div class="assess-score" style="--assess-score:${score * 3.6}deg"><strong>${score}</strong><small>分</small></div><div><span class="assess-level">${esc(result.name)}</span><h3>${esc(result.headline)}</h3></div></div><p>${esc(result.diagnosis)}</p>
      <div class="assess-plan"><span>推荐方案</span><ol>${visible.map(item => `<li>${esc(item)}</li>`).join('')}</ol>${hidden.length ? `<div class="assess-plan-locked"><ol start="${visible.length + 1}" aria-hidden="true">${hidden.map(item => `<li>${esc(item)}</li>`).join('')}</ol><span>${icon('shield', 'xs')}还有 ${hidden.length} 条建议，留资后解锁</span></div>` : ''}</div>
      ${unlocked && result.cta_label ? `<a class="assess-cta" href="${esc(result.cta_url || '#')}" data-demo-link>${esc(result.cta_label)}</a>` : ''}</div>`
    if (!unlocked && leadEnabled) body += leadCard('解锁完整方案', `留下联系方式，获取完整的「${result.headline}」方案，顾问还会帮你做一次免费解读。`, '解锁完整方案')
    if (st.lead) body += '<div class="xg-widget-status-message">已收到，顾问会尽快联系你</div>'
    body += '<button type="button" class="assess-link assess-restart" data-action="cfg-assess-start">重新测一次</button>'
  }
  const sales = st.lead && s.attach_to_lead ? `<div class="assess-sales-card"><div class="assess-sales-head">${icon('user-check', 'sm')}<strong>销售在「线索」里看到的</strong>${badge('success', '新线索')}</div>
    <dl><div><dt>访客</dt><dd>${esc(st.lead.name || '未留姓名')}${st.lead.company ? ` · ${esc(st.lead.company)}` : ''}</dd></div><div><dt>联系方式</dt><dd>${esc(st.lead.phone || st.lead.wechat || st.lead.email || '')}</dd></div><div><dt>测评结果</dt><dd>${badge('info', esc(result?.name || ''))} ${score} 分 · ${esc(result?.headline || '')}</dd></div></dl>
    <ul>${s.questions.map(q => { const picked = q.options.filter(o => st.answers[q.id]?.includes(o.id)).map(o => o.label); return picked.length ? `<li><span>${esc(q.title)}</span><b>${esc(picked.join('、'))}</b></li>` : '' }).join('')}</ul>
    <small>答题记录随线索一起保存，销售跟进时不用再从头问需求。</small><button type="button" class="cfg-btn sm outline" data-action="cfg-go-leads">${icon('arrow', 'xs')}<span>去线索页查看</span></button></div>` : ''
  return `<div class="assess-preview"><div class="assess-preview-frame"><div class="xg-widget-shell" style="${widgetStyle()}">
    <header class="xg-widget-header"><div class="xg-widget-identity"><span class="xg-widget-avatar">${esc(Array.from(brand)[0])}</span><div class="xg-widget-identity-copy"><strong>${esc(brand)}</strong><small class="xg-widget-status">在线</small></div></div><button type="button" class="xg-widget-header-action" aria-label="重新开始预览" title="重新开始预览" data-action="cfg-assess-restart">×</button></header>
    <section class="xg-widget-messages"><div class="xg-widget-message-list" data-demo-list>${demoMeta(brand)}<div class="xg-widget-message xg-widget-message--assistant">${demoMarkdown(d.appearance.welcome)}</div>${body}</div></section>
    <footer class="xg-widget-composer"><div class="xg-widget-input-row"><textarea rows="1" disabled placeholder="${st.phase === 'quiz' ? '直接点选上面的选项作答' : '输入你的问题…'}"></textarea><button type="button" class="xg-widget-send" disabled aria-label="发送">↗</button></div>${d.appearance.attribution ? '<div class="xg-powered-slot"><span class="xg-powered"><span class="xg-powered__mark" aria-hidden="true"></span><span class="xg-powered__text">吸管 提供技术支持</span></span></div>' : ''}</footer>
  </div></div>${sales}</div>`
}

function refreshAssess() {
  const root = document.querySelector('[data-assess-root]')
  if (!root) return
  root.innerHTML = renderAssessPreview()
  root.querySelectorAll('[data-demo-list]').forEach(list => { list.scrollTop = list.scrollHeight })
}

function assessFinish(st) {
  const s = C().assessment
  const questions = s.questions.filter(q => q.title.trim() && q.options.length)
  const picked = questions.map(q => q.options.filter(o => st.answers[q.id]?.includes(o.id)).map(o => o.label).join('、')).filter(Boolean)
  st.steps.push({ kind: 'user', text: `已完成 ${questions.length} 道题：${picked.join(' / ')}` })
  st.phase = 'thinking'
  refreshAssess()
  setTimeout(() => { if (cfg.assess !== st) return; st.phase = s.gate === 'before_result' && s.gate !== 'none' && C().actions.lead_capture.enabled ? 'gate' : 'result'; refreshAssess() }, 900)
}

function assessAdvance(st) {
  const questions = C().assessment.questions.filter(q => q.title.trim() && q.options.length)
  if (st.index + 1 < questions.length) { st.index += 1; refreshAssess() } else assessFinish(st)
}

/* ---------- 留资弹窗 ---------- */

const triggerLabel = rule => rule.trigger === 'delay' ? `停留 ${rule.delay_seconds} 秒后` : rule.trigger === 'scroll' ? `滚动到 ${rule.scroll_percent}% 时` : '准备离开时'
const samplePath = pattern => pattern.trim().replace(/\/\*/g, '/how-to-choose-ai-chatbot').replace(/\*/g, '') || '/'

function renderLeadPopupDetail(cap) {
  const d = C()
  const p = d.lead_popup
  if (!p.rules.some(rule => rule.id === cfg.popupActive)) cfg.popupActive = p.rules[0]?.id || ''
  const rulesReady = p.rules.some(rule => rule.enabled) && p.rules.every(rule => rule.page_pattern.trim() && rule.material.title.trim())
  const rules = capSection('lead_popup:rules', `弹窗规则（${p.rules.filter(rule => rule.enabled).length}/${p.rules.length} 条启用）`, rulesReady, true, `<div class="proto-cards">${p.rules.map((rule, index) => {
      const active = rule.id === cfg.popupActive
      const base = `lead_popup.rules.${index}`
      return `<div class="proto-item ${active ? 'is-active' : ''} ${rule.enabled ? '' : 'is-off'}" data-popup-focus="${rule.id}">
        <div class="proto-item-head"><button type="button" class="cfg-switch ${rule.enabled ? 'on' : ''}" role="switch" aria-checked="${rule.enabled}" aria-label="启用${esc(rule.page_label)}规则" data-popup-toggle="${index}"></button><strong>${esc(rule.page_label || '未命名页面')}</strong><code>${esc(rule.page_pattern)}</code>${badge('', triggerLabel(rule))}<span class="cfg-capdetail-spacer"></span>${p.rules.length > 1 ? `<button type="button" class="cfg-icon-btn" aria-label="删除规则" data-popup-remove="${index}">${icon('trash', 'sm')}</button>` : ''}</div>
        ${active ? `<div class="cfg-form-grid">
          ${field('页面名称', capInput(`${base}.page_label`, 'data-live="popup"'))}
          ${field('页面规则', capInput(`${base}.page_pattern`, 'placeholder="/pricing*" data-live="popup"'))}
          ${field('弹出时机', capSelect(`${base}.trigger`, POPUP_TRIGGERS.map(item => [item.value, item.label]), 'data-rerender="1"'), { help: POPUP_TRIGGERS.find(item => item.value === rule.trigger)?.hint })}
          <div class="cfg-field">${rule.trigger === 'delay' ? `<label>停留秒数</label>${capNumber(`${base}.delay_seconds`, 3, 300, 'data-live="popup"')}` : rule.trigger === 'scroll' ? `<label>滚动比例（%）</label>${capNumber(`${base}.scroll_percent`, 10, 100, 'step="10" data-live="popup"')}` : '<label>离开意图</label><p class="capability-readonly">桌面端检测鼠标移出页面顶部；手机端改为快速上滑返回时触发。</p>'}</div>
          ${field('资料类型', capSelect(`${base}.material.kind`, MATERIAL_KINDS.map(kind => [kind, kind]), 'data-live="popup"'))}
          ${field('资料名称', capInput(`${base}.material.title`, 'placeholder="例如：2026 行业白皮书" data-live="popup"'))}
          ${field('一句话介绍', capInput(`${base}.material.description`, 'data-live="popup"'), { full: true })}
          ${field('资料亮点（每行一条，显示在弹窗里）', capLines(`${base}.material.highlights`, 3, 'data-live="popup"'), { full: true })}
          ${field('资料文件', `<div class="proto-file">${icon('file', 'xs')}<span>${esc(rule.material.file_name)}</span><small>${esc(rule.material.file_size)}</small></div>`, { help: '原型中为示例文件；正式版从知识库或上传文件中选择。' })}
          ${field('按钮文案', capInput(`${base}.button_label`, 'data-live="popup"'))}
          ${field('交付方式', capSelect(`${base}.delivery`, POPUP_DELIVERIES.map(item => [item.value, item.label]), 'data-rerender="1"'), { full: true, help: POPUP_DELIVERIES.find(item => item.value === rule.delivery)?.hint })}
        </div>` : ''}
      </div>`
    }).join('')}</div>
    <div class="proto-editor-foot"><button type="button" class="cfg-btn sm outline" data-action="cfg-popup-add" ${p.rules.length >= 8 ? 'disabled' : ''}>${icon('plus', 'xs')}<span>添加规则</span></button><small>一个页面命中多条规则时，用排在最前面的那条。页面规则写法和「主动弹窗」一致，* 匹配任意字符。</small></div>`)
  const freq = capSection('lead_popup:freq', '频率与线索', true, false, `<div class="cfg-form-grid">
    <div class="cfg-field"><label>同一访客最多</label><span class="proto-inline"><input class="console-input" type="number" min="1" max="90" value="${p.frequency_days}" data-bind="lead_popup.frequency_days" data-type="number" data-clamp="1,90" data-live="popup" /> 天弹一次</span><small>所有规则合计；访客关掉弹窗也算一次，避免反复打扰。</small></div>
    <div class="cfg-field full">${capCheck('lead_popup.skip_known_visitors', '已经留过联系方式的访客不再弹', 'data-live="popup"')}${capCheck('lead_popup.attach_to_lead', '把领取的资料和来源页面写入线索，销售跟进时直接可见')}</div>
  </div>`)
  return cfgPage('cap-lead_popup', `${capHeader(cap, p.enabled)}
    <section class="cfg-body">${renderCfgHint()}${capNotices('lead_popup')}
      ${!d.actions.lead_capture.enabled ? capNotice('<strong>留资表单未开启。</strong>弹窗的表单字段沿用「留资表单」的设置，开启后才能收集联系方式。', '<button type="button" class="cfg-btn sm outline" data-cap-config="lead_capture">去开启留资表单</button>') : ''}
      <div class="agent-config-layout proto-layout">
        <div class="proto-main">${valueBanner('proto', '用一份好资料，换一个联系方式', '访客在价格页、博客、案例页停留时，最关心的东西不一样。按页面送上对口的资料，比统一弹“留个电话”更自然；领了什么资料，也说明了对方在意什么。', '适合内容型获客：有白皮书、案例集、报价单、测算工具等可下载资料的 B2B 业务。', [['globe', '按页面匹配', '不同页面配置不同资料'], ['clock', '合适时机弹出', '停留、滚动或准备离开时'], ['download', '留资领取', '提交后下载 / 发邮箱 / 顾问发送']])}<div class="capability-sections">${rules}${freq}</div></div>
        <aside class="agent-config-side proto-side">${cfgPanel('官网效果预览', '切换页面看不同资料；可以直接填写提交，体验访客领取的完整过程。', `<div data-popup-root>${renderPopupPreview()}</div>`, { cls: 'widget-preview-frame' })}</aside>
      </div>
    </section>`)
}

function popupDemo() {
  const p = C().lead_popup
  const rule = p.rules.find(item => item.id === cfg.popupActive) ?? p.rules[0]
  const signature = JSON.stringify(rule)
  if (!cfg.popup || cfg.popup.signature !== signature) {
    const st = { signature, phase: 'waiting', contact: {}, form: { values: {}, error: '' } }
    cfg.popup = st
    if (rule?.enabled) setTimeout(() => { if (cfg.popup === st && st.phase === 'waiting') { st.phase = 'open'; refreshPopup() } }, 1200)
  }
  return { st: cfg.popup, rule }
}

function popupFields(rule) {
  const fields = normalizeFormFields().filter(item => item.field !== 'use_case')
  if (rule.delivery !== 'email') return fields
  return [...fields.filter(item => item.field !== 'email'), { field: 'email', label: fieldLabel('email'), required: true, placeholder: LEAD_FIELD_META.email.placeholder }]
}

function renderPopupPreview() {
  const p = C().lead_popup
  const { st, rule } = popupDemo()
  if (!rule) return '<p class="capability-readonly">还没有弹窗规则。</p>'
  const path = samplePath(rule.page_pattern)
  const fileType = (rule.material.file_name.split('.').pop() || '文件').toUpperCase()
  const contact = st.contact
  let card = ''
  if (st.phase === 'open' || st.phase === 'done') {
    const body = st.phase === 'open'
      ? `<form class="popup-body" data-popup-form novalidate><p>${esc(rule.material.description)}</p><ul class="popup-highlights">${rule.material.highlights.filter(item => item.trim()).map(item => `<li>${icon('check', 'xs')}${esc(item)}</li>`).join('')}</ul>
          <div class="popup-fields">${popupFields(rule).map(item => `<label><span>${esc(item.label)}${item.required ? ' *' : ''}</span><input value="${esc(st.form.values[item.field] || '')}" placeholder="${esc(item.placeholder || '')}" data-popup-field="${item.field}" /></label>`).join('')}</div>
          ${st.form.error ? `<p class="popup-error" role="alert">${esc(st.form.error)}</p>` : ''}<button type="submit" class="popup-submit">${esc(rule.button_label || '免费领取')}</button><small class="popup-privacy">提交即表示同意我们的顾问就该资料与你联系</small></form>`
      : `<div class="popup-body popup-done"><span class="popup-done-icon">${icon('check')}</span>${rule.delivery === 'download' ? `<strong>已开始下载</strong><p>《${esc(rule.material.title)}》正在下载，没有反应可以点下面的按钮。</p><button type="button" class="popup-submit">${icon('download', 'xs')}${esc(rule.material.file_name)}（${esc(rule.material.file_size)}）</button>` : rule.delivery === 'email' ? `<strong>已发送到你的邮箱</strong><p>《${esc(rule.material.title)}》已发送到 ${esc(contact.email || '')}，几分钟内没收到请检查垃圾箱。</p>` : `<strong>已收到你的申请</strong><p>顾问会在 1 个工作日内把《${esc(rule.material.title)}》发给你，并解答相关问题。</p>`}</div>`
    card = `<div class="popup-overlay"><div class="popup-card" role="dialog" aria-label="${esc(rule.material.title)}"><button type="button" class="popup-close" aria-label="关闭弹窗" data-action="cfg-popup-close">×</button><div class="popup-cover"><span class="popup-kind">${esc(rule.material.kind)}</span><strong>${esc(rule.material.title)}</strong><small>${fileType} · ${esc(rule.material.file_size)}</small></div>${body}</div></div>`
  }
  return `<div class="popup-preview" style="--popup-primary:${C().appearance.primary}">
    <div class="popup-rule-tabs" role="tablist" aria-label="选择要预览的页面">${p.rules.map(item => `<button type="button" role="tab" aria-selected="${item.id === rule.id}" class="${item.id === rule.id ? 'is-current' : ''}" data-popup-tab="${item.id}">${esc(item.page_label || '未命名页面')}${item.enabled ? '' : '<small>已停用</small>'}</button>`).join('')}</div>
    <div class="popup-site"><div class="popup-site-chrome" aria-hidden="true"><i></i><i></i><i></i><span>www.example.com${esc(path)}</span></div>
      <div class="popup-site-page"><div class="popup-site-nav"><b></b><span></span><span></span><span></span><em></em></div><div class="popup-site-hero"><strong>${esc(rule.page_label)}</strong><span></span><span></span></div><div class="popup-site-cards"><span></span><span></span><span></span></div><div class="popup-site-lines"><span></span><span></span><span></span><span></span></div>
        ${st.phase === 'waiting' ? `<div class="popup-trigger-hint">${icon('clock', 'xs')}${rule.enabled ? `触发条件：${triggerLabel(rule)}（演示中 1 秒后弹出）` : '这条规则已停用，访客不会看到弹窗'}</div>` : ''}
        ${card}
        ${st.phase === 'closed' ? `<div class="popup-trigger-hint is-muted">${icon('close', 'xs')}访客关闭了弹窗，${esc(rule.page_label)}在频率限制内不会再弹</div>` : ''}
      </div></div>
    <div class="popup-preview-actions"><button type="button" class="cfg-btn sm ghost" data-action="cfg-popup-replay">${icon('refresh', 'xs')}<span>重新演示</span></button><small>同一访客 ${p.frequency_days} 天内最多弹一次${p.skip_known_visitors ? '；已留资的访客不再弹' : ''}。</small></div>
    ${st.phase === 'done' && p.attach_to_lead ? `<div class="proto-sales-card"><div class="proto-sales-head">${icon('user-check', 'sm')}<strong>销售在「线索」里看到的</strong>${badge('success', '新线索')}</div><dl><div><dt>访客</dt><dd>${esc(contact.name || '未留姓名')}${contact.company ? ` · ${esc(contact.company)}` : ''}</dd></div><div><dt>联系方式</dt><dd>${esc(contact.phone || contact.wechat || contact.email || '')}</dd></div><div><dt>领取资料</dt><dd>${badge('info', esc(rule.material.kind))} 《${esc(rule.material.title)}》</dd></div><div><dt>来源页面</dt><dd>${esc(rule.page_label)} · ${esc(path)}</dd></div></dl><small>访客对什么内容感兴趣，从领取的资料就能看出来，跟进时可以直接聊这份资料。</small><button type="button" class="cfg-btn sm outline" data-action="cfg-go-leads">${icon('arrow', 'xs')}<span>去线索页查看</span></button></div>` : ''}
  </div>`
}

function refreshPopup() {
  const root = document.querySelector('[data-popup-root]')
  if (root) root.innerHTML = renderPopupPreview()
}

/* ---------- 推荐消息 ---------- */

/** 演示：模拟 AI 按当前对话生成推荐。超长的单条丢掉、不截断；访客问过的不再推荐。 */
function recommend(config, question, answer, asked, { fail = false } = {}) {
  if (fail) return { items: [], dropped: [], reason: '生成失败：这一轮不显示推荐，不影响回答。' }
  // 演示里按访客这句话判断话题（真实环境由 AI 按当前对话和这一轮用到的资料生成）
  const topic = DEMO_REC_TOPICS.find(item => item.keywords.some(word => question.includes(word)))
  if (!topic && config.show !== 'always') return { items: [], dropped: [], reason: 'AI 判断这一轮没有值得接着问的，不给推荐。' }
  const max = Math.min(4, Math.max(1, Number(config.max_items) || 3))
  const seen = new Set(asked.map(item => item.trim()))
  const items = []
  const dropped = []
  for (const value of topic ? topic.items : DEMO_REC_FALLBACK) {
    if (items.length >= max) break
    if (seen.has(value) || items.includes(value)) continue
    if (Array.from(value).length > REC_MAX_CHARS) { dropped.push(value); continue }
    items.push(value)
  }
  // 可以推荐引向已开启能力的说法，比如留资表单开着时推“我想预约演示”
  const leadItem = '我想预约演示'
  if (C().actions.lead_capture.enabled && topic && !seen.has(leadItem)) { if (items.length >= max) items.pop(); items.push(leadItem) }
  return { items, dropped, reason: topic ? `AI 按当前话题（${topic.keywords[0]}）生成了 ${items.length} 条。` : '没有明确话题，按「每轮都给」给了通用的下一步问题。' }
}

function renderRecommendationsDetail(cap) {
  const r = C().recommendations
  const enabled = isCapEnabled('recommendations')
  const general = capGeneral(cap, 'recommendations.instructions', { placeholder: '比如：访客问完功能后，推荐他问价格或同行案例；不推荐和当前话题无关的问题。', help: '写给 AI 的推荐要求，只约束推荐问题怎么生成，不影响回答本身。' })
  const interaction = capFixedInteraction(cap, '访客点一下就当作发了这句话，也可以不点、直接打字。固定的推荐问题用外观里的快捷按钮做，这里不提供手工填写。')
  const settings = capSection('recommendations:settings', '推荐设置', true, true, `<div class="lead-modes" role="radiogroup" aria-label="什么时候出现">${REC_SHOW_MODES.map(item => `<button type="button" class="lead-mode ${r.show === item.value ? 'is-current' : ''}" role="radio" aria-checked="${r.show === item.value}" data-rec-show="${item.value}"><strong>${item.title}${item.value === 'ai' ? badge('', '默认') : ''}</strong><span><em>访客看到</em>${item.sees}</span><span><em>适合</em>${item.fit}</span></button>`).join('')}</div>
    <div class="cfg-form-grid">
      ${field('每轮最多几条', capSelect('recommendations.max_items', [1, 2, 3, 4].map(n => [n, `${n} 条${n === 3 ? '（默认）' : ''}`]), 'data-type="number" data-live="rec"'))}
      ${field('每条最多字数', `<p class="capability-readonly">平台固定 ${REC_MAX_CHARS} 字</p>`, { help: '超长的单条直接丢掉，不截断。' })}
    </div>`)
  const rules = capRules(cap, ['只根据当前对话和这一轮用到的资料生成，不推荐知识库里没有的内容；可以推荐引向已开启能力的说法，比如留资表单开着时推“我想预约演示”。', '和快捷按钮同时存在：有推荐消息的那一轮，快捷按钮收起；没有推荐消息时，快捷按钮按外观里「首轮对话后继续显示」的设置。', '生成失败、结果为空、超长或格式不对时，这一轮不显示，不影响回答。', '不让访客多等：推荐消息和回答一起出来，或者在回答显示完之后补上。', '访客点了推荐消息，这句话按普通访客消息处理，走 Q&A 匹配和知识检索。', '人工接管中不生成推荐消息。'])
  const side = cfgPanel('演示', '直接提问或点推荐继续聊；改左侧设置后，最近一轮的推荐会按新设置重算。', `<div class="demo-preview">${enabled ? '' : '<div class="demo-off-note">能力还没开启，访客暂时看不到；下面演示开启后的效果。</div>'}<div data-rec-root>${renderRecPreview()}</div></div>`, { cls: 'widget-preview-frame' })
  return capDetailPage(cap, enabled, [general, interaction, settings, rules], side)
}

function recState() {
  if (!cfg.rec) cfg.rec = { turns: [], busy: false, fail: false }
  return cfg.rec
}

function renderRecPreview() {
  const d = C()
  const r = d.recommendations
  const st = recState()
  const brand = d.appearance.name.trim() || 'AI 助手'
  const last = st.turns.at(-1)
  // 配置变了：最近一轮的推荐按新配置重算（生成失败的那一轮保持失败）
  if (last?.done && !last.failed) Object.assign(last, recommend(r, last.question, last.answer, st.turns.map(t => t.question)))
  const quick = d.appearance.quickButtons.filter(item => item.text.trim())
  const lastHasRec = Boolean(last?.done && last.items.length)
  const showQuick = quick.length && !st.busy && (!st.turns.length || (!lastHasRec && d.appearance.keepQuick))
  const turns = st.turns.map(turn => `<div class="xg-widget-message xg-widget-message--user">${esc(turn.question)}</div>${demoMeta(brand)}<div class="xg-widget-message xg-widget-message--assistant">${turn.answer ? demoMarkdown(turn.answer) : '<span class="rec-typing"><i></i><i></i><i></i></span>'}</div>${turn.done && turn === last && turn.items.length ? `<div class="rec-chips">${turn.items.map(item => `<button type="button" ${st.busy ? 'disabled' : ''} data-rec-ask="${esc(item)}">${icon('arrow', 'xs')}${esc(item)}</button>`).join('')}</div>` : ''}`).join('')
  return `<div class="rec-preview"><div class="rec-preview-frame"><div class="xg-widget-shell" style="${widgetStyle()}">
    <header class="xg-widget-header"><div class="xg-widget-identity"><span class="xg-widget-avatar">${esc(Array.from(brand)[0])}</span><div class="xg-widget-identity-copy"><strong>${esc(brand)}</strong><small class="xg-widget-status">在线</small></div></div><button type="button" class="xg-widget-header-action" aria-label="清空对话" title="清空对话" data-action="cfg-rec-clear">×</button></header>
    <section class="xg-widget-messages"><div class="xg-widget-message-list" data-demo-list>${demoMeta(brand)}<div class="xg-widget-message xg-widget-message--assistant">${demoMarkdown(d.appearance.welcome)}</div>${turns}${showQuick ? `<div class="xg-widget-quick-actions rec-quick">${quick.map(item => `<button type="button" data-rec-ask="${esc(item.text)}">${esc(item.text)}</button>`).join('')}</div>` : ''}</div></section>
    <footer class="xg-widget-composer"><div class="xg-widget-input-row"><textarea rows="1" placeholder="输入你的问题…" data-demo-input="rec"></textarea><button type="button" class="xg-widget-send" aria-label="发送" data-demo-submit="rec">↗</button></div>${d.appearance.attribution ? '<div class="xg-powered-slot"><span class="xg-powered"><span class="xg-powered__mark" aria-hidden="true"></span><span class="xg-powered__text">吸管 提供技术支持</span></span></div>' : ''}</footer>
  </div></div>
  <div class="rec-debug"><div class="rec-debug-head">${icon('filter', 'xs')}<strong>这一轮的推荐</strong>${badge('', r.show === 'always' ? '每轮都给' : '由 AI 判断')}${badge('', `最多 ${r.max_items} 条`)}</div>
    ${last?.done ? `<p>${esc(last.reason || '')}</p>${last.dropped?.length ? `<p>丢掉了超过 ${REC_MAX_CHARS} 字的：${last.dropped.map(item => `「${esc(item)}」`).join('')}（不截断）。</p>` : ''}<small>${lastHasRec ? '这一轮有推荐，快捷按钮收起。' : d.appearance.keepQuick ? '这一轮没有推荐，快捷按钮按外观设置继续显示。' : '这一轮没有推荐；外观里没开「首轮对话后继续显示」，快捷按钮不显示。'}</small>` : `<small>${st.busy ? '正在生成回答…' : '先问一个问题，或者点上面的快捷按钮。'}</small>`}
    <label class="console-checkbox"><input type="checkbox" data-demo-recfail ${st.fail ? 'checked' : ''} /><span>模拟下一轮生成失败</span></label>
    <button type="button" class="cfg-btn sm ghost" data-action="cfg-rec-clear" ${st.busy || !st.turns.length ? 'disabled' : ''}>${icon('refresh', 'xs')}<span>清空对话</span></button></div></div>`
}

function refreshRec() {
  const root = document.querySelector('[data-rec-root]')
  if (!root) return
  const input = root.querySelector('[data-demo-input="rec"]')
  const draft = input?.value || ''
  const focused = document.activeElement === input
  root.innerHTML = renderRecPreview()
  const next = root.querySelector('[data-demo-input="rec"]')
  if (next && draft) next.value = draft
  if (next && focused) next.focus()
  root.querySelectorAll('[data-demo-list]').forEach(list => { list.scrollTop = list.scrollHeight })
}

async function recAsk(question) {
  const text = String(question || '').trim()
  const st = recState()
  if (!text || st.busy) return
  const asked = [...st.turns.map(turn => turn.question), text]
  const turn = { id: Date.now(), question: text, answer: '', done: false, items: [] }
  st.turns.push(turn)
  st.busy = true
  const input = document.querySelector('[data-demo-input="rec"]')
  if (input) input.value = ''
  refreshRec()
  await sleep(500)
  const answer = baseAnswer(text)
  for (let i = 6; i < answer.length + 6; i += 6) {
    if (cfg.rec !== st) return
    turn.answer = answer.slice(0, i)
    refreshRec()
    await sleep(30)
  }
  // 推荐在回答显示完之后补上
  const failed = st.fail
  st.fail = false
  Object.assign(turn, { answer, done: true, failed }, recommend(C().recommendations, text, answer, asked, { fail: failed }))
  st.busy = false
  refreshRec()
}

/* ---------- MCP 调用 ---------- */

const mcpToolKind = tool => tool.offline ? 'offline' : tool.read_only === false ? 'write' : tool.read_only === true ? 'read' : 'unknown'
const MCP_KIND_BADGE = { read: ['', '只读'], unknown: ['warning', '未声明只读'], write: ['danger', '会改数据 · 一期不开放'], offline: ['warning', '工具已下线'] }

function renderMcpDetail(cap) {
  const m = C().mcp
  const enabled = isCapEnabled('mcp')
  if (!cfg.mcpTest) cfg.mcpTest = {}
  const general = capGeneral(cap, 'mcp.instructions', { placeholder: '比如：访客问到具体型号有没有货、什么时候到货时去查；参数不全先问访客。', help: '整个能力一段；每个工具另有自己的说明，见下面的工具列表。' })
  const interaction = capFixedInteraction(cap, 'AI 用返回的数据组织回答，访客看不到调用过程。返回结果配小组件一期不做。')
  const servers = m.servers.map((server, si) => {
    const https = /^https:\/\//i.test(String(server.url || '').trim())
    const enabledTools = server.tools.filter(tool => tool.enabled && !tool.offline).length
    const keyField = server.auth === 'none' ? '' : field('密钥', server.key_saved
      ? `<div class="mcp-key-saved">${badge('success', '已保存')}<small>保存后不再明文显示，也不进草稿</small><button type="button" class="cfg-btn sm ghost" data-mcp-key-reset="${si}">更换</button></div>`
      : `<div class="mcp-key-saved"><input type="password" placeholder="粘贴请求头里的密钥" data-mcp-key="${si}" autocomplete="off" /><button type="button" class="cfg-btn sm outline" data-mcp-key-save="${si}">保存</button></div>`, { help: '密钥单独保存到服务端，不随草稿发布。' })
    const tools = server.tools.map((tool, ti) => {
      const kind = mcpToolKind(tool)
      const active = cfg.mcpTool === tool.id
      const [tone, label] = MCP_KIND_BADGE[kind]
      const confirming = cfg.mcpConfirm === tool.id
      const test = cfg.mcpTest[tool.id]
      const switchOn = tool.enabled && kind !== 'write'
      return `<div class="proto-item ${active ? 'is-active' : ''} ${switchOn && kind !== 'offline' ? '' : 'is-off'}" data-mcp-focus="${tool.id}"><div class="proto-item-head"><button type="button" class="cfg-switch ${switchOn ? 'on' : ''}" role="switch" aria-checked="${switchOn}" aria-label="启用${esc(tool.label)}" data-mcp-toggle="${si}:${ti}" ${kind === 'write' ? 'disabled title="会改数据的工具一期不开放"' : ''}></button><strong>${esc(tool.label)}</strong><code>${esc(tool.name)}</code>${badge(tone, label)}${tool.discovered ? badge('info', '新发现') : ''}</div>
        ${confirming ? `<div class="cfg-notice warning mcp-confirm" role="alertdialog"><span class="cfg-notice-icon">${icon('alert', 'sm')}</span><div>这个工具没有声明只读。确认<strong>这个工具只查数据、不改数据</strong>后才能勾选。</div><div class="cfg-notice-actions"><button type="button" class="cfg-btn sm primary" data-mcp-confirm="${si}:${ti}">确认只查数据</button><button type="button" class="cfg-btn sm ghost" data-mcp-confirm-cancel>取消</button></div></div>` : ''}
        ${active ? `<div class="cfg-form-grid">
          ${kind === 'offline' ? `<div class="cfg-field full">${capNotice('<strong>工具已下线：</strong>服务里已经没有这个工具，不再给 AI 用。可以关掉或删掉这项勾选。')}</div>` : ''}
          ${kind === 'write' ? '<div class="cfg-field full"><p class="capability-readonly">下单、改预约这类会改数据的工具一期不开放：官网访客没有身份验证，写数据风险大。</p></div>' : ''}
          ${field('工具说明（写给 AI）', capTextarea(`mcp.servers.${si}.tools.${ti}.description`, 2, 'maxlength="1000"'), { full: true, help: '默认带出工具自己的描述，可以改成业务说法，告诉 AI 什么问题该用它。' })}
          <div class="cfg-field full"><label>参数</label>${tool.params.length ? `<table class="console-table mcp-params"><thead><tr><th>参数</th><th>说明</th><th>必填</th><th>示例</th></tr></thead><tbody>${tool.params.map(param => `<tr><td><code>${esc(param.name)}</code></td><td>${esc(param.label)}</td><td>${param.required ? '是' : '否'}</td><td>${esc(param.example)}</td></tr>`).join('')}</tbody></table>` : '<p class="capability-readonly">不需要参数。</p>'}<small>参数由服务提供；服务里参数变了按新参数用。AI 只用访客明确说出的值，缺的先问，不猜。</small></div>
          ${kind === 'read' || kind === 'unknown' ? `<div class="cfg-field full"><label>测试调用</label><div class="mcp-test">${tool.params.map(param => `<input placeholder="${esc(param.label)}（如 ${esc(param.example)}）" data-mcp-arg="${tool.id}:${esc(param.name)}" value="${esc(test?.args?.[param.name] || '')}" />`).join('')}<button type="button" class="cfg-btn sm outline" data-mcp-run="${si}:${ti}">${icon('plug', 'xs')}<span>测试调用</span></button></div><small>直接调用工具看返回结果，不经过 AI。</small>${test ? `<pre class="mcp-test-result ${test.error ? 'is-error' : ''}">${esc(test.error || JSON.stringify(test.result, null, 2))}</pre>` : ''}</div>` : ''}
        </div>` : ''}</div>`
    }).join('')
    return capSection(`mcp:server:${server.id}`, `服务：${esc(server.name || '未命名服务')}`, https && server.status === 'connected', true, `<div class="cfg-form-grid">
        ${field('服务名称', capInput(`mcp.servers.${si}.name`, 'maxlength="40"'))}
        ${field('鉴权方式', capSelect(`mcp.servers.${si}.auth`, MCP_AUTH, 'data-rerender="1"'))}
        ${field('服务地址', capInput(`mcp.servers.${si}.url`, 'type="url" placeholder="https://" data-rerender="1"'), { full: true, help: https ? '只接受 HTTPS。' : '<span class="mcp-error">只接受 HTTPS 地址。</span>' })}
        ${keyField}
      </div>
      <div class="mcp-server-status">${badge(server.status === 'connected' ? 'success' : 'warning', server.status === 'connected' ? '已连接' : '连接异常')}<small>${server.status === 'connected' ? `发现 ${server.tools.length} 个工具，已启用 ${enabledTools} 个` : esc(server.error || '连不上')} · 最近 24 小时失败 ${server.failures_24h || 0} 次</small><button type="button" class="cfg-btn sm ghost" data-mcp-test="${si}">${icon('refresh', 'xs')}<span>测试连接</span></button>${m.servers.length > 1 ? `<button type="button" class="cfg-btn sm ghost" data-mcp-remove="${si}">${icon('trash', 'xs')}<span>移除服务</span></button>` : ''}</div>
      <div class="notification-title"><strong>工具</strong><small>只有勾选的工具会给 AI 用，新发现的工具默认不勾。</small></div>
      <div class="proto-cards">${tools}</div>`)
  }).join('')
  const addServer = `<div class="proto-editor-foot"><button type="button" class="cfg-btn sm outline" data-action="cfg-mcp-add" ${m.servers.length >= MCP_MAX_SERVERS ? 'disabled' : ''}>${icon('plus', 'xs')}<span>接入服务（${m.servers.length} / ${MCP_MAX_SERVERS}）</span></button></div>`
  const rules = capRules(cap, ['一期只启用查询类工具。服务声明为只读的可以直接勾选；没声明的，勾选时要确认“这个工具只查数据、不改数据”。', '参数只用访客明确说出的值，缺的先问，不猜；前面几轮说过的型号、城市可以用。', '每轮回答前最多调用一个工具；要连续查两次的问题，分两轮回答。', `单次调用最多等 ${MCP_TIMEOUT_SECONDS} 秒，返回内容最大 ${MCP_MAX_RESULT_KB}KB，超时或超长都算失败；返回的内容只当数据用，里面写的指令不执行。`, '事实以返回结果为准。没查到就说没查到，不能拿知识库里的旧数据充当实时结果。', '服务、工具勾选和说明走草稿发布；密钥不进草稿，单独保存到服务端。'])
  const demo = demoFor('mcp')
  const side = cfgPanel('演示', '直接在窗口里问订单发票、演示时段或系统状态；返回数据为示例。', `<div class="demo-preview">${enabled ? '' : '<div class="demo-off-note">能力还没开启，访客暂时用不到；下面演示开启后的效果。</div>'}<div data-demo-root>${renderMcpDemo(demo)}</div></div>`, { cls: 'widget-preview-frame', actions: `<button type="button" class="cfg-btn sm ghost" data-action="cfg-demo-restart">${icon('refresh', 'xs')}<span>重新开始</span></button>` })
  return capDetailPage(cap, enabled, [general, interaction, servers, addServer, rules], side)
}

const mcpTools = () => C().mcp.servers.flatMap(server => server.tools)
const mcpUsable = name => mcpTools().find(item => item.name === name && item.enabled && !item.offline && item.read_only !== false)
const firstHit = (text, words) => words.find(word => text.includes(word))

function renderMcpDemo(demo) {
  const usable = mcpTools().filter(item => item.enabled && !item.offline && item.read_only !== false)
  return `${renderDemoWidget(demo, { quick: ['帮我查一下订单 XG20261108001 的发票开了没', '想约个产品演示，上海这周有空吗？', '你们系统现在正常吗？'] })}
    <div class="demo-panel"><div class="demo-panel-head">${icon('plug', 'xs')}<strong>调用记录</strong>${badge('', `${usable.length} 个工具可用`)}${badge('', '仅控制台可见')}</div>
      ${demo.calls.length ? `<ul class="mcp-calls">${demo.calls.map(item => `<li><span><strong>${esc(item.label)}</strong><code>${esc(item.name)}(${esc(Object.entries(item.args).map(([k, v]) => `${k}: ${v}`).join(', '))})</code></span><small>${item.ms} ms</small>${badge(item.ok ? 'success' : 'danger', item.ok ? '成功' : '超时')}</li>`).join('')}</ul>` : '<p>还没有调用。</p>'}
      <label class="console-checkbox"><input type="checkbox" data-demo-mcpfail ${demo.mcpFail ? 'checked' : ''} /><span>模拟服务超时（${MCP_TIMEOUT_SECONDS} 秒没返回）</span></label>
      <small>访客只看到 AI 用返回数据组织的文字回答。每轮最多调用一个工具。</small></div>`
}

async function mcpCall(demo, name, args) {
  const def = mcpUsable(name)
  const ok = !demo.mcpFail
  const ms = ok ? 300 + Math.round(Math.random() * 600) : MCP_TIMEOUT_SECONDS * 1000
  await sleep(ok ? ms : 900)
  demo.calls.unshift({ label: def.label, name, args, ms, ok })
  refreshDemo()
  return ok
}

async function mcpFailReply(demo) {
  const online = JSON.parse(cfg.published).actions || capabilityDefaults().actions
  const alt = online.human_handoff?.enabled ? '需要的话我可以帮你转人工确认。' : online.lead_capture?.enabled ? '可以留个联系方式，查到后顾问联系你。' : ''
  await demoSay(demo, `抱歉，系统暂时查不到，稍后再试一次。${alt}`)
}

function mcpSend(demo, text) {
  demoRun(demo, async () => {
    demoPush(demo, { kind: 'user', text })
    const orderId = text.match(/XG\d{6,}/i)?.[0]?.toUpperCase()
    const order = mcpUsable('query_order')
    if (order && (orderId || firstHit(text, ['订单', '发票', '付款']) || demo.pending?.tool === 'query_order')) {
      if (!orderId) { demo.pending = { tool: 'query_order' }; await demoSay(demo, '可以帮你查。请告诉我订单号，在付款成功的邮件里，以 XG 开头。'); return }
      demo.pending = null
      if (!(await mcpCall(demo, 'query_order', { order_id: orderId }))) return mcpFailReply(demo)
      const result = { ...order.sample_result, order_id: orderId }
      await demoSay(demo, `查到了：订单 ${orderId} 是**${result.plan}**，金额 ${Number(result.amount).toLocaleString()} 元，${result.paid_at} 已付款。\n发票${result.invoice_status}（${result.invoice_no}），已发送到 ${result.invoice_sent_to}。`)
      return
    }
    const slots = mcpUsable('query_demo_slots')
    const city = firstHit(text, ['线上', '上海', '北京', '深圳', '杭州', '广州', '南京', '无锡']) || (demo.pending?.tool === 'query_demo_slots' ? text.replace(/[，。,.\s]/g, '').slice(0, 6) : '')
    if (slots && (firstHit(text, ['演示', '预约', '有空', '时段']) || demo.pending?.tool === 'query_demo_slots')) {
      if (!city) { demo.pending = { tool: 'query_demo_slots' }; await demoSay(demo, '可以帮你查可预约的时段。想约线上，还是哪个城市线下？'); return }
      demo.pending = null
      if (!(await mcpCall(demo, 'query_demo_slots', { city }))) return mcpFailReply(demo)
      await demoSay(demo, `查了一下，${city}最近可以约的演示时段有：${slots.sample_result.slots.join('、')}。你看哪个合适？`)
      return
    }
    const status = mcpUsable('service_status')
    if (status && firstHit(text, ['正常', '故障', '宕机', '打不开', '很慢', '状态', '异常'])) {
      if (!(await mcpCall(demo, 'service_status', {}))) return mcpFailReply(demo)
      await demoSay(demo, '刚查了一下：系统整体运行**正常**，对话服务和知识库检索都没问题；企业微信推送有轻微延迟（约 1–2 分钟），不影响对话。')
      return
    }
    await demoAnswer(demo, text)
  })
}

/** 测试连接：模拟三种失败原因；连上后列出工具，新发现的默认不勾。 */
function mcpTestConnection(si) {
  const server = C().mcp.servers[si]
  const url = String(server.url || '').trim()
  let error = ''
  if (!/^https:\/\//i.test(url)) error = '地址不通：只接受 HTTPS 地址'
  else if (server.auth === 'header' && !server.key_saved) error = '鉴权失败：还没保存密钥'
  else if (/fail|error/i.test(url)) error = '地址不通：连接超时'
  else if (!/\/mcp\/?$/i.test(url)) error = '不是 MCP 服务：这个地址没有返回工具列表'
  if (error) { Object.assign(server, { status: 'error', error }); renderApp(); toast(error, 'info'); return }
  Object.assign(server, { status: 'connected', error: '' })
  if (!server.tools.some(tool => tool.name === 'query_price')) server.tools.push({ id: newProtoId('tool'), name: 'query_price', label: '查询实时价格', enabled: false, read_only: true, discovered: true, description: '访客问具体版本、席位数的实时价格时调用。', params: [{ name: 'plan', label: '版本', required: true, example: '专业版' }], sample_result: { plan: '专业版', price_per_year: 35760, currency: 'CNY' } })
  renderApp()
  toast(`连接正常，发现 ${server.tools.filter(tool => !tool.offline).length} 个工具`)
}

/* ---------- 事件 ---------- */

function capPathValue(el) {
  const type = el.dataset.type
  if (el.type === 'checkbox') return el.checked
  if (type === 'lines') return el.value.split('\n')
  if (type === 'number-or-null') return el.value === '' ? null : Number(el.value)
  if (type === 'number') return el.value === '' ? '' : Number(el.value)
  return el.value
}

/** data-bind 写入后刷新各预览（不整页重绘，保留输入焦点）。 */
function capLiveRefresh(target) {
  if (target.dataset.live === 'assess') refreshAssess()
  if (target.dataset.live === 'popup') refreshPopup()
  if (target.dataset.live === 'rec') refreshRec()
  if (target.dataset.demoSync) refreshDemo()
}

function capHandleChange(event) {
  const target = event.target
  if (target.dataset.clamp && target.matches('[data-bind]') && target.value !== '') {
    const [min, max] = target.dataset.clamp.split(',').map(Number)
    const value = Math.min(max, Math.max(min, Number(target.value) || min))
    if (String(value) !== target.value) { target.value = value; setCfgValue(target.dataset.bind, value); refreshCfgChrome() }
  }
  if (target.matches('[data-assess-multiple]')) { C().assessment.questions[Number(target.dataset.assessMultiple)].multiple = target.value === 'multiple'; renderApp(); return true }
  if (target.matches('[data-demo-failsave]')) { if (cfg.demo) cfg.demo.session.failSave = target.checked; return true }
  if (target.matches('[data-demo-offline]')) { if (cfg.demo) cfg.demo.session.handoffOnline = !target.checked; refreshDemo(); return true }
  if (target.matches('[data-demo-recfail]')) { recState().fail = target.checked; return true }
  if (target.matches('[data-demo-mcpfail]')) { if (cfg.demo) cfg.demo.mcpFail = target.checked; return true }
  return false
}

function capHandleInput(event) {
  const target = event.target
  if (target.matches('[data-demo-form-field]')) {
    const [id, name] = target.dataset.demoFormField.split(':')
    const form = cfg.demo?.forms[Number(id)]
    if (form) form.values[name] = target.value
    return true
  }
  if (target.matches('[data-assess-field]')) { assessDemo().form.values[target.dataset.assessField] = target.value; return true }
  if (target.matches('[data-popup-field]')) { cfg.popup.form.values[target.dataset.popupField] = target.value; return true }
  if (target.id === 'cfg-cap-search') { cfg.capSearch = target.value; $('#cfg-cap-grid').innerHTML = renderCapabilityListCards(); return true }
  return false
}

function capHandleSubmit(event) {
  const form = event.target
  if (form.matches('[data-demo-form]')) { event.preventDefault(); demoSubmitLead(Number(form.dataset.demoForm)); return true }
  if (form.matches('[data-assess-form]')) {
    event.preventDefault()
    const st = assessDemo()
    const error = validateContact(normalizeFormFields().filter(item => item.field !== 'use_case'), st.form.values)
    st.form.error = error
    if (!error) {
      st.lead = { ...st.form.values }
      if (st.phase === 'gate') st.phase = 'result'
      if (C().assessment.attach_to_lead) addDemoLead(st.lead, `通过「${C().assessment.title}」测评留资。`)
    }
    refreshAssess()
    return true
  }
  if (form.matches('[data-popup-form]')) {
    event.preventDefault()
    const { st, rule } = popupDemo()
    const error = validateContact(popupFields(rule), st.form.values)
    st.form.error = error
    if (!error) {
      st.contact = { ...st.form.values }
      st.phase = 'done'
      if (C().lead_popup.attach_to_lead) addDemoLead(st.contact, `领取《${rule.material.title}》。`)
    }
    refreshPopup()
    return true
  }
  return false
}

function capHandleKeydown(event) {
  const target = event.target
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return false
  if (target.matches('[data-demo-input]')) {
    event.preventDefault()
    if (target.dataset.demoInput === 'rec') recAsk(target.value)
    else { const value = target.value; target.value = ''; demoSend(value) }
    return true
  }
  if (target.matches('[data-demo-reply]')) { event.preventDefault(); capAction('cfg-demo-reply'); return true }
  return false
}

function capAction(name, el) {
  const d = C()
  const demo = cfg.demo
  if (name === 'cfg-cap-back') { cfg.capDetail = null; renderApp(); return true }
  if (name === 'cfg-demo-restart') { if (demo) cfg.demo = newDemo(demo.id); renderApp(); return true }
  if (name === 'cfg-go-leads') { state.agentSection = 'leads'; cfg.capDetail = null; renderApp(); toast('调试线索已加入「线索」列表'); return true }
  if (name === 'cfg-demo-takeover' && demo) { demo.mode = 'human'; demo.session.human = true; demoPush(demo, { kind: 'status', text: '人工客服已接入', tone: 'info' }); refreshDemo(); return true }
  if (name === 'cfg-demo-release' && demo) { demo.mode = 'ai'; demo.session.human = false; demoPush(demo, { kind: 'status', text: '已回到 AI 助手', tone: 'info' }); refreshDemo(); return true }
  if (name === 'cfg-demo-reply' && demo) {
    const input = document.querySelector('[data-demo-reply]')
    const content = input?.value.trim()
    if (!content) return true
    input.value = ''
    demoPush(demo, { kind: 'human', text: content, sender: '人工客服' })
    refreshDemo()
    return true
  }
  if (name === 'cfg-demo-launch' && demo) { demo.state = 'open'; demo.openedBy = '访客自己点开'; refreshDemo(); return true }
  if (name === 'cfg-demo-open-bubble' && demo) {
    const { trigger } = proactiveTrigger(demo)
    if (trigger?.kind === 'proactive') { demo.state = 'open'; demo.openedBy = '访客点击了主动消息'; demo.proactiveMsg = trigger.message; demoPush(demo, { kind: 'assistant', text: trigger.message, label: '主动消息' }); demo.decision = '主动消息已作为助手的第一条消息记入对话。回一句试试，比如「好的」。'; refreshDemo() }
    return true
  }
  if (name === 'cfg-demo-forward' && demo) {
    const steps = d.idle_follow_up.steps.filter(step => step.message.trim())
    const step = steps[demo.stepIndex]
    if (step) { demo.idleFrom = Date.now(); demo.offset = step.idle_seconds }
    return true
  }
  if (name === 'cfg-idle-add') {
    const steps = d.idle_follow_up.steps
    const previous = steps.at(-1)?.idle_seconds ?? 30
    steps.push({ idle_seconds: Math.min(3600, previous * 2), message: '' })
    renderApp()
    return true
  }
  if (name === 'cfg-assess-start') {
    const st = assessDemo()
    const s = d.assessment
    Object.assign(st, { steps: [{ kind: 'user', text: s.entry_label }, { kind: 'assistant', text: s.intro }], index: 0, answers: {}, lead: null, phase: 'quiz', form: { values: {}, error: '' } })
    refreshAssess()
    return true
  }
  if (name === 'cfg-assess-restart') { cfg.assess = null; refreshAssess(); return true }
  if (name === 'cfg-assess-prev') { const st = assessDemo(); st.index = Math.max(0, st.index - 1); refreshAssess(); return true }
  if (name === 'cfg-assess-next') { assessAdvance(assessDemo()); return true }
  if (name === 'cfg-assess-qadd') { d.assessment.questions.push({ id: newProtoId('q'), title: '', multiple: false, options: [{ id: newProtoId('o'), label: '', score: 0 }, { id: newProtoId('o'), label: '', score: 10 }] }); renderApp(); return true }
  if (name === 'cfg-assess-radd') { d.assessment.results.push({ id: newProtoId('r'), name: '', min_score: 0, max_score: 0, headline: '', diagnosis: '', plan: [''], cta_label: '', cta_url: '' }); renderApp(); return true }
  if (name === 'cfg-popup-add') {
    const rule = { id: newProtoId('popup'), enabled: true, page_pattern: '/', page_label: '新页面', trigger: 'delay', delay_seconds: 15, scroll_percent: 50, material: { kind: '资料包', title: '', description: '', highlights: [''], file_name: '资料.pdf', file_size: '1 MB' }, button_label: '免费领取', delivery: 'download' }
    d.lead_popup.rules.push(rule)
    cfg.popupActive = rule.id
    renderApp()
    return true
  }
  if (name === 'cfg-popup-close') { cfg.popup.phase = 'closed'; refreshPopup(); return true }
  if (name === 'cfg-popup-replay') { cfg.popup = null; refreshPopup(); return true }
  if (name === 'cfg-rec-clear') { cfg.rec = null; refreshRec(); return true }
  if (name === 'cfg-mcp-add') {
    if (d.mcp.servers.length >= MCP_MAX_SERVERS) return true
    d.mcp.servers.push({ id: newProtoId('srv'), name: '新服务', url: 'https://', auth: 'header', key_saved: false, status: 'error', error: '还没测试连接', failures_24h: 0, tools: [] })
    renderApp()
    return true
  }
  return false
}

/** 能力页的点击；返回 true 表示已处理。 */
function capHandleClick(event) {
  const pick = selector => event.target.closest(selector)
  let el
  if ((el = pick('[data-demo-link]'))) { event.preventDefault(); return true }
  if ((el = pick('[data-cap-toggle]'))) { const id = el.dataset.capToggle; setCapEnabled(id, !isCapEnabled(id)); renderApp(); return true }
  if ((el = pick('[data-cap-config]'))) { cfg.capDetail = el.dataset.capConfig; cfg.demo = null; cfg.assess = null; cfg.popup = null; cfg.rec = null; renderApp(); return true }
  if ((el = pick('[data-demo-send]'))) { if (cfg.demo?.id === 'mcp' || cfg.demo) demoSend(el.dataset.demoSend); return true }
  if ((el = pick('[data-demo-submit]'))) {
    const scope = el.dataset.demoSubmit
    const input = document.querySelector(`[data-demo-input="${scope}"]`)
    if (scope === 'rec') recAsk(input?.value)
    else { const value = input?.value; if (input) input.value = ''; demoSend(value) }
    return true
  }
  if ((el = pick('[data-demo-expand]'))) { const form = cfg.demo?.forms[Number(el.dataset.demoExpand)]; if (form) { form.expanded = true; refreshDemo() } return true }
  if ((el = pick('[data-demo-tool]'))) { const id = Number(el.dataset.demoTool); cfg.demo.tools[id] = !cfg.demo.tools[id]; refreshDemo(); return true }

  if ((el = pick('[data-demo-close]'))) { Object.assign(cfg.demo, { state: 'browsing', closedManually: true }); refreshDemo(); return true }
  if ((el = pick('[data-demo-pattern]'))) { cfg.demo.pattern = el.dataset.demoPattern; refreshDemo(); return true }
  if ((el = pick('[data-lead-interaction]'))) { C().actions.lead_capture.interaction = el.dataset.leadInteraction; renderApp(); return true }
  if ((el = pick('[data-lead-move]'))) { const [index, step] = el.dataset.leadMove.split(':').map(Number); moveLeadField(index, index + step); return true }
  if ((el = pick('[data-demo-form-close]'))) { demoCloseLeadForm(Number(el.dataset.demoFormClose)); return true }
  if ((el = pick('[data-rule-add]'))) {
    const key = el.dataset.ruleAdd
    const d = C()
    d[key].page_rules.push(key === 'auto_open' ? { pattern: '*', enabled: true, delay_seconds: d.auto_open.delay_seconds } : { pattern: '*', enabled: true, idle_seconds: d.proactive.idle_seconds, message: '' })
    renderApp()
    return true
  }
  if ((el = pick('[data-rule-remove]'))) { const [key, index] = el.dataset.ruleRemove.split(':'); C()[key].page_rules.splice(Number(index), 1); renderApp(); return true }
  if ((el = pick('[data-idle-remove]'))) { C().idle_follow_up.steps.splice(Number(el.dataset.idleRemove), 1); renderApp(); return true }
  if ((el = pick('[data-assess-choose]'))) {
    const [questionId, optionId] = el.dataset.assessChoose.split(':')
    const st = assessDemo()
    const question = C().assessment.questions.find(q => q.id === questionId)
    if (question.multiple) {
      const current = st.answers[questionId] ?? []
      st.answers[questionId] = current.includes(optionId) ? current.filter(id => id !== optionId) : [...current, optionId]
      refreshAssess()
    } else { st.answers[questionId] = [optionId]; assessAdvance(st) }
    return true
  }
  if ((el = pick('[data-assess-move]'))) { const [index, step] = el.dataset.assessMove.split(':').map(Number); const list = C().assessment.questions; const [item] = list.splice(index, 1); list.splice(index + step, 0, item); renderApp(); return true }
  if ((el = pick('[data-assess-qremove]'))) { C().assessment.questions.splice(Number(el.dataset.assessQremove), 1); renderApp(); return true }
  if ((el = pick('[data-assess-oremove]'))) { const [qi, oi] = el.dataset.assessOremove.split(':').map(Number); C().assessment.questions[qi].options.splice(oi, 1); renderApp(); return true }
  if ((el = pick('[data-assess-oadd]'))) { C().assessment.questions[Number(el.dataset.assessOadd)].options.push({ id: newProtoId('o'), label: '', score: 0 }); renderApp(); return true }
  if ((el = pick('[data-assess-rremove]'))) { C().assessment.results.splice(Number(el.dataset.assessRremove), 1); renderApp(); return true }
  if ((el = pick('[data-assess-gate]'))) { C().assessment.gate = el.dataset.assessGate; renderApp(); return true }
  if ((el = pick('[data-popup-toggle]'))) { const rule = C().lead_popup.rules[Number(el.dataset.popupToggle)]; rule.enabled = !rule.enabled; renderApp(); return true }
  if ((el = pick('[data-popup-remove]'))) { event.stopPropagation(); C().lead_popup.rules.splice(Number(el.dataset.popupRemove), 1); renderApp(); return true }
  if ((el = pick('[data-popup-tab]'))) { cfg.popupActive = el.dataset.popupTab; renderApp(); return true }
  if ((el = pick('[data-popup-focus]')) && el.dataset.popupFocus !== cfg.popupActive && !event.target.closest('input, textarea, select')) { cfg.popupActive = el.dataset.popupFocus; renderApp(); return true }
  if ((el = pick('[data-rec-show]'))) { C().recommendations.show = el.dataset.recShow; renderApp(); return true }
  if ((el = pick('[data-rec-ask]'))) { recAsk(el.dataset.recAsk); return true }
  if ((el = pick('[data-mcp-toggle]'))) {
    const [si, ti] = el.dataset.mcpToggle.split(':').map(Number)
    const tool = C().mcp.servers[si].tools[ti]
    if (tool.read_only === false) return true
    if (!tool.enabled && tool.read_only == null) { cfg.mcpConfirm = tool.id; cfg.mcpTool = tool.id; renderApp(); return true }
    tool.enabled = !tool.enabled
    renderApp()
    return true
  }
  if ((el = pick('[data-mcp-confirm]'))) { const [si, ti] = el.dataset.mcpConfirm.split(':').map(Number); Object.assign(C().mcp.servers[si].tools[ti], { read_only: true, enabled: true }); cfg.mcpConfirm = ''; renderApp(); return true }
  if ((el = pick('[data-mcp-confirm-cancel]'))) { cfg.mcpConfirm = ''; renderApp(); return true }
  if ((el = pick('[data-mcp-test]'))) { mcpTestConnection(Number(el.dataset.mcpTest)); return true }
  if ((el = pick('[data-mcp-remove]'))) { C().mcp.servers.splice(Number(el.dataset.mcpRemove), 1); renderApp(); return true }
  if ((el = pick('[data-mcp-key-reset]'))) { C().mcp.servers[Number(el.dataset.mcpKeyReset)].key_saved = false; renderApp(); return true }
  if ((el = pick('[data-mcp-key-save]'))) {
    const si = Number(el.dataset.mcpKeySave)
    const input = document.querySelector(`[data-mcp-key="${si}"]`)
    if (!input?.value.trim()) { toast('先填密钥', 'info'); return true }
    C().mcp.servers[si].key_saved = true
    renderApp()
    toast('密钥已单独保存到服务端，不再明文显示')
    return true
  }
  if ((el = pick('[data-mcp-run]'))) {
    const [si, ti] = el.dataset.mcpRun.split(':').map(Number)
    const tool = C().mcp.servers[si].tools[ti]
    const args = Object.fromEntries(tool.params.map(param => [param.name, document.querySelector(`[data-mcp-arg="${tool.id}:${param.name}"]`)?.value.trim() || '']))
    const missing = tool.params.filter(param => param.required && !args[param.name]).map(param => param.label)
    cfg.mcpTest[tool.id] = missing.length ? { args, error: `缺少必填参数：${missing.join('、')}` } : { args, result: { ...tool.sample_result, ...Object.fromEntries(Object.entries(args).filter(([, v]) => v)) } }
    renderApp()
    return true
  }
  if ((el = pick('[data-mcp-focus]')) && el.dataset.mcpFocus !== cfg.mcpTool && !event.target.closest('input, textarea, select, button')) { cfg.mcpTool = el.dataset.mcpFocus; renderApp(); return true }
  return false
}

/* <details> 展开状态：重新渲染时保持 */
document.addEventListener('toggle', event => {
  const target = event.target
  if (target.matches?.('details[data-sec]')) cfg.secOpen[target.dataset.sec] = target.open
}, true)

document.addEventListener('submit', event => { capHandleSubmit(event) })

/* 留资字段排序：按住左侧把手拖动 */
function moveLeadField(from, to) {
  const list = C().actions.lead_capture.fields
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
  renderApp()
}
let leadDragFrom = null
document.addEventListener('mousedown', event => {
  const handle = event.target.closest?.('[data-lead-handle]')
  const row = handle?.closest('[data-lead-row]')
  if (row) row.draggable = true
})
document.addEventListener('dragstart', event => {
  const row = event.target.closest?.('[data-lead-row]')
  if (!row || !row.draggable) return
  leadDragFrom = Number(row.dataset.leadRow)
  row.classList.add('is-dragging')
  try { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(leadDragFrom)) } catch (_) {}
})
document.addEventListener('dragover', event => {
  if (leadDragFrom == null) return
  const row = event.target.closest?.('[data-lead-row]')
  if (!row) return
  event.preventDefault()
  document.querySelectorAll('.lead-field.is-drop-target').forEach(node => node !== row && node.classList.remove('is-drop-target'))
  row.classList.add('is-drop-target')
})
document.addEventListener('drop', event => {
  if (leadDragFrom == null) return
  const row = event.target.closest?.('[data-lead-row]')
  if (!row) return
  event.preventDefault()
  const from = leadDragFrom
  leadDragFrom = null
  moveLeadField(from, Number(row.dataset.leadRow))
})
document.addEventListener('dragend', () => {
  leadDragFrom = null
  document.querySelectorAll('[data-lead-row]').forEach(node => { node.draggable = false; node.classList.remove('is-dragging', 'is-drop-target') })
})
