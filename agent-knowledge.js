/* ==========================================================================
   知识库：数据源列表 / 添加知识 / 知识源详情 / Q&A / 未答列表 / 检索设置 / 回答时的匹配
   界面参照控制台原型（吸管控制台-单文件复刻.html），规则以知识库评审 PRD 及 11/5 决议清单为准。
   依赖：agent-config.js（cfg、esc、cfgPanel、cfgPage…）、agent-capabilities.js（badge）、app.js（icon、toast、renderApp）
   ========================================================================== */

/** 一期支持的格式（决议 9）：图片暂不支持。 */
const KB_FORMATS = ['txt', 'md', 'csv', 'json', 'docx', 'xlsx', 'xls', 'pdf', 'html']
const KB_STATUS = { processing: ['', '处理中'], syncing: ['', '同步中'], ready: ['success', '可用'], failed: ['danger', '失败'] }
const KB_TYPE_UNIT = { file: ['个', '文件'], site: ['个', '网站'], text: ['个', '文本片段'], qa: ['条', ' Q&A'] }
const KB_UNANSWERED_REASON = { no_kb: '知识未命中', self_test_no_kb: '自动试题未通过' }
const KB_MODE = { fixed: '固定答复', rewrite: 'AI 改写' }
const KB_SITE_LIMIT = 30

const kbNorm = text => String(text || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
const kbBigrams = text => { const t = kbNorm(text); const set = new Set(); for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2)); if (t.length === 1) set.add(t); return set }
/** 字符二元组 Dice 系数，用来模拟「问法相似度」。 */
function kbSimilarity(a, b) {
  const x = kbBigrams(a)
  const y = kbBigrams(b)
  if (!x.size || !y.size) return 0
  let hit = 0
  x.forEach(item => { if (y.has(item)) hit += 1 })
  return (2 * hit) / (x.size + y.size)
}

/* ---------- 示例数据 ---------- */

function kbQa(id, title, questions, answer, mode, created, keywords = []) {
  return { id, type: 'qa', title, questions, answer, mode, keywords, created, status: 'ready', get name() { return this.title.trim() || this.questions[0] || '未命名 Q&A' }, get meta() { return KB_MODE[this.mode] } }
}

function kbSeedSources() {
  return [
    kbQa(4, 'Widget 会影响官网加载速度吗？', ['Widget 会影响官网加载速度吗？', '嵌入后网站会变慢吗？'], '不会。Widget 脚本异步加载，体积约 30KB，首屏渲染完成后才初始化对话窗口。', 'rewrite', '11/11 14:16', ['加载速度']),
    kbQa(3, '可以免费试用吗？', ['可以免费试用吗？', '有没有试用版？'], '可以。免费版每月提供 200 次会话和 1 个智能体，注册后即可使用，无需绑定信用卡。', 'rewrite', '11/11 14:16', ['试用']),
    kbQa(2, '支持私有化部署吗？', ['支持私有化部署吗？', '能部署在自己的服务器上吗？'], '支持。企业版提供私有化部署方案，可以部署在你们自己的服务器或专有云上，具体请联系销售获取报价。', 'rewrite', '11/11 14:16', ['私有化']),
    {
      id: 1, type: 'file', name: '吸管Chat产品介绍.md', format: 'md', size: '12 KB', created: '11/11 14:16', status: 'ready', importAs: 'doc', tags: ['产品'],
      entries: [
        { id: 11, title: '产品概述', body: '吸管 Chat 是一款嵌入企业官网的 AI 智能客服与获客助手，基于企业自己的资料回答访客问题，并在合适的时机收集联系方式、转给人工。' },
        { id: 12, title: '核心功能', body: '实时问答、留资表单、转人工、资料交付、推荐消息和主动弹窗。所有能力都可以在控制台按需开关。' },
        { id: 13, title: '知识库', body: '支持上传 TXT、Markdown、CSV、JSON、Word、Excel、PDF、HTML 文件，也可以抓取官网页面、直接写文本片段或配置 Q&A。' },
        { id: 14, title: '部署方式', body: '在官网 </body> 前粘贴一行 Widget 脚本即可上线，无需改动现有页面；支持设置允许嵌入的域名，防止脚本被盗用。' },
        { id: 15, title: '数据安全', body: '所有数据按工作区隔离存储，传输全程 HTTPS 加密；访客联系方式的查看会记录审计日志。' }
      ],
      tests: [
        { id: 21, question: '吸管 Chat 能做什么？', pass: true },
        { id: 22, question: '如何在官网上部署吸管 Chat？', pass: true },
        { id: 23, question: '知识库支持哪些文件格式？', pass: true },
        { id: 24, question: '企业版是否提供私有化部署选项？', pass: false },
        { id: 25, question: '专业版是否支持人工接管和工单管理功能？', pass: false },
        { id: 26, question: '免费版每月包含多少次会话额度？', pass: false }
      ],
      removed: [
        { id: 31, title: '目录', reason: '少于 8 个字的记录不入库', restorable: false },
        { id: 32, title: '更新日志', reason: '正文太少', restorable: true, body: '2026-10 起支持留资弹窗。' }
      ]
    }
  ]
}

function kbSeedUnanswered() {
  return [
    { id: 7, question: '怎么收费？专业版多少钱', reason: 'no_kb', time: '11/11 14:19' },
    { id: 6, question: '访客的联系方式谁能看到？', reason: 'no_kb', time: '11/11 14:17' },
    { id: 5, question: '怎么收费？', reason: 'no_kb', time: '11/11 14:17' },
    { id: 4, question: '企业版是否提供私有化部署选项？', reason: 'self_test_no_kb', time: '11/11 14:16' },
    { id: 3, question: '专业版是否支持人工接管和工单管理功能？', reason: 'self_test_no_kb', time: '11/11 14:16' },
    { id: 2, question: '免费版每月包含多少次会话额度？', reason: 'self_test_no_kb', time: '11/11 14:16' },
    { id: 1, question: '你们产品能做什么？', reason: 'no_kb', time: '11/11 14:14' }
  ]
}

cfg.sources = kbSeedSources()
cfg.unanswered = kbSeedUnanswered()
Object.assign(cfg, { kbDrawer: null, kbDetail: null, kbDetailTab: 'entries', kbEntryEdit: null, kbBulk: false, kbSelected: [], kbConfirm: null, kbMenu: null })

let kbSeq = 1000
const kbId = () => (kbSeq += 1)
const kbFind = id => cfg.sources.find(item => item.id === Number(id))
const kbQas = () => cfg.sources.filter(item => item.type === 'qa')
const kbBoundButtons = qa => cfg.draft.appearance.quickButtons.filter(button => String(button.qa) === String(qa.id))

/* ---------- 回答时知识库怎么参与（PRD 4.4 + 决议 3、4） ---------- */

/**
 * 只在当前智能体自己的知识库里匹配；Q&A 标题不参与匹配。
 * 直接命中只有两种：快捷按钮绑定、第一句原句一致（忽略空格和标点）；其他由「AI」结合上下文判断。
 * 返回 { text, route, qa, refs, insufficient }。
 */
function kbAnswer(question, { button = false, first = false } = {}) {
  const qas = kbQas().filter(item => item.status === 'ready')
  const reply = (qa, route) => ({ text: qa.mode === 'fixed' ? qa.answer : `${qa.answer}`, route, qa, refs: 1 })
  if (button) {
    const bound = cfg.draft.appearance.quickButtons.find(item => item.text === question && item.qa)
    const qa = bound && qas.find(item => String(item.id) === String(bound.qa))
    if (qa) return reply(qa, 'button')
  }
  const exact = qas.find(qa => qa.questions.some(q => kbNorm(q) && kbNorm(q) === kbNorm(question)))
  if (exact && first) return reply(exact, 'exact')
  const candidates = qas.map(qa => ({ qa, score: exact === qa ? 1 : Math.max(...qa.questions.map(q => kbSimilarity(q, question))) }))
    .filter(item => item.score >= 0.45).sort((a, b) => b.score - a.score).slice(0, 3)
  if (candidates[0] && candidates[0].score >= 0.6) return { ...reply(candidates[0].qa, 'judge'), candidates: candidates.length }
  // 都没命中：检索知识资料（候选 Q&A 只作参考）
  const entries = cfg.sources.filter(item => item.type !== 'qa' && item.status === 'ready').flatMap(item => (item.entries || []).map(entry => ({ entry, score: kbSimilarity(`${entry.title}${entry.body}`, question) })))
  const refs = entries.filter(item => item.score >= 0.08).sort((a, b) => b.score - a.score).slice(0, 3)
  const canned = widgetAnswers.find(([pattern]) => pattern.test(question))
  if (canned) {
    const insufficient = canned[1].includes('未知')
    return { text: canned[1], route: insufficient ? 'none' : 'doc', refs: insufficient ? 0 : Math.max(1, refs.length), insufficient, candidates: candidates.length }
  }
  if (refs.length && refs[0].score >= 0.16) return { text: `根据资料「${refs[0].entry.title}」：${refs[0].entry.body}`, route: 'doc', refs: refs.length, candidates: candidates.length }
  return { text: widgetFallback, route: 'none', refs: 0, insufficient: true, candidates: candidates.length }
}

const KB_ROUTE_LABEL = { button: '快捷按钮绑定，直接命中', exact: '第一句与问法原句一致，直接命中', judge: 'AI 结合上下文判断命中', doc: '没有命中 Q&A，检索知识资料', none: '没有命中 Q&A，资料依据不足' }

/* ---------- 列表 ---------- */

function kbFiltered() {
  const keyword = cfg.kbSearch.trim().toLowerCase()
  const list = cfg.sources.filter(item => {
    if (item.type === 'qa') return false
    if (cfg.kbType !== 'all' && item.type !== cfg.kbType) return false
    if (!keyword) return true
    const text = `${item.name}${(item.tags || []).join('')}`
    return text.toLowerCase().includes(keyword)
  })
  return cfg.kbSort === 'new' ? list : [...list].reverse()
}

function kbRowDetail(item) {
  if (item.type === 'qa') return `${KB_MODE[item.mode]} · ${item.questions.length} 个问法`
  if (item.status === 'syncing') return `已同步 ${item.synced} / ${item.pages.filter(page => page.checked).length} 页`
  if (item.status === 'processing') return '正在后台处理'
  if (item.status === 'failed') return '处理失败，不参与回答'
  if (item.importAs === 'qa') return `导入 ${item.qaCount ?? 0} 条 Q&A${item.conflicts?.length ? `，跳过 ${item.conflicts.length} 行` : ''}`
  return `${(item.entries || []).length} 条内容`
}

function kbStatusChip(item) {
  if (item.status === 'ready') return ''
  const [tone, label] = KB_STATUS[item.status]
  return `<span class="cfg-badge ${tone} kb-status">${item.status === 'processing' || item.status === 'syncing' ? '<i class="kb-spin"></i>' : ''}${label}</span>`
}

function renderKbList() {
  const list = kbFiltered()
  const pages = Math.max(1, Math.ceil(list.length / cfg.kbPageSize))
  cfg.kbPage = Math.min(cfg.kbPage, pages)
  const start = (cfg.kbPage - 1) * cfg.kbPageSize
  const rows = list.slice(start, start + cfg.kbPageSize)
  const selected = new Set(cfg.kbSelected)
  const body = rows.length ? rows.map(item => {
    const type = sourceTypes[item.type]
    return `<div class="cfg-kb-row ${selected.has(item.id) ? 'is-selected' : ''}">
      ${cfg.kbBulk ? `<input type="checkbox" class="kb-check" data-kb-select="${item.id}" ${selected.has(item.id) ? 'checked' : ''} aria-label="选择 ${esc(item.name)}" />` : ''}
      <button type="button" class="cfg-kb-row-main" data-kb-open="${item.id}"><strong>${esc(item.name)}</strong><span>创建于 ${item.created} · ${esc(kbRowDetail(item))}</span></button>
      ${kbStatusChip(item)}<span class="cfg-type-chip">${icon(type.icon, 'xs')}${type.label}</span>
      ${cfg.kbBulk ? '' : `<div class="kb-menu-wrap"><button type="button" class="cfg-icon-btn" data-kb-more="${item.id}" aria-label="${esc(item.name)} 的更多操作" aria-expanded="${cfg.kbMenu === item.id}">${icon('more', 'sm')}</button>${cfg.kbMenu === item.id ? `<div class="kb-menu" role="menu"><button type="button" role="menuitem" data-kb-open="${item.id}">${item.type === 'qa' ? '编辑' : '查看详情'}</button><button type="button" role="menuitem" class="is-danger" data-kb-delete="${item.id}">删除</button></div>` : ''}</div>`}
    </div>`
  }).join('') : `<div class="cfg-empty">${cfg.sources.some(item => item.type !== 'qa') ? '没有匹配的数据源。' : '还没有资料。从上面的入口上传文件、添加网站或添加文本片段。'}</div>`
  const first = cfg.kbPage === 1
  const last = cfg.kbPage === pages
  return `<div class="cfg-kb-rows">${body}</div>
    <div class="cfg-kb-pager"><label>每页 <select id="cfg-kb-size" class="cfg-select" aria-label="每页条数">${[10, 20, 50].map(size => `<option ${cfg.kbPageSize === size ? 'selected' : ''}>${size}</option>`).join('')}</select> 条</label>
      <span class="cfg-kb-pager-spacer">第 ${cfg.kbPage} / ${pages} 页 · 共 ${list.length} 条</span>
      <button type="button" class="cfg-icon-btn" data-kb-page="1" ${first ? 'disabled' : ''} aria-label="第一页">${icon('chevrons-left', 'sm')}</button>
      <button type="button" class="cfg-btn sm ghost" data-kb-page="${cfg.kbPage - 1}" ${first ? 'disabled' : ''}>上一页</button>
      <button type="button" class="cfg-btn sm ghost" data-kb-page="${cfg.kbPage + 1}" ${last ? 'disabled' : ''}>下一页</button>
      <button type="button" class="cfg-icon-btn" data-kb-page="${pages}" ${last ? 'disabled' : ''} aria-label="最后一页">${icon('chevrons-right', 'sm')}</button></div>`
}

function renderKbBulkBar() {
  if (!cfg.kbBulk) return `<button type="button" class="cfg-btn outline" data-action="cfg-kb-bulk">批量选择</button>`
  const visible = kbFiltered()
  const all = visible.length && visible.every(item => cfg.kbSelected.includes(item.id))
  return `<span class="kb-bulk-count">已选 ${cfg.kbSelected.length} 项</span>
    <button type="button" class="cfg-btn sm ghost" data-action="kb-select-all">${all ? '取消全选' : `全选当前筛选结果（${visible.length}）`}</button>
    <button type="button" class="cfg-btn sm danger" data-action="kb-bulk-delete" ${cfg.kbSelected.length ? '' : 'disabled'}>${icon('trash', 'xs')}<span>删除所选</span></button>
    <button type="button" class="cfg-btn outline" data-action="cfg-kb-bulk">取消批量</button>`
}

function renderKbSources() {
  const entries = [
    ['upload', 'file-up', '上传文件', 'PDF、Word、Excel、CSV、TXT、Markdown、JSON、HTML'],
    ['site', 'globe', '添加网站', '抓取公开页面，勾选后同步'],
    ['text', 'text', '添加文本片段', '直接写一段资料']
  ]
  return `<div class="cfg-kb-usage">${icon('database', 'sm')}<span>知识库容量按内容量计算（初始 40 MB）</span><span class="cfg-badge">用量统计即将上线</span></div>
    <section class="cfg-kb-entries" aria-label="添加知识">${entries.map(([key, iconName, title, desc]) => `<button type="button" class="cfg-kb-entry" data-kb-entry="${key}"><span class="cfg-kb-entry-icon">${icon(iconName, 'sm')}</span><strong>${title}</strong><small>${desc}</small></button>`).join('')}
      <button type="button" class="cfg-kb-entry is-planned" disabled title="MCP 归属待定：倾向一期先做成能力调用（见「能力 · MCP 调用」）"><span class="cfg-kb-entry-icon">${icon('server', 'sm')}</span><strong>MCP 知识同步</strong><small>连接企业内容服务自动同步</small><span class="cfg-badge">待定</span></button></section>
    <div class="cfg-toolbar kb-toolbar"><div class="cfg-search wide">${icon('search', 'sm')}<input id="cfg-kb-search" type="search" placeholder="搜索名称或标签" aria-label="搜索数据源" value="${esc(cfg.kbSearch)}" /></div>
      <select id="cfg-kb-type" class="cfg-select" aria-label="按类型筛选"><option value="all">全部类型</option>${Object.entries(sourceTypes).filter(([key]) => key !== 'qa').map(([key, item]) => `<option value="${key}" ${cfg.kbType === key ? 'selected' : ''}>${item.label}</option>`).join('')}</select>
      <select id="cfg-kb-sort" class="cfg-select" aria-label="排序"><option value="new" ${cfg.kbSort === 'new' ? 'selected' : ''}>最新</option><option value="old" ${cfg.kbSort === 'old' ? 'selected' : ''}>最早</option></select>
      <div class="kb-bulk-bar">${renderKbBulkBar()}</div></div>
    <div id="cfg-kb-list">${renderKbList()}</div>`
}

function refreshKbList() {
  const list = document.getElementById('cfg-kb-list')
  if (list) list.innerHTML = renderKbList()
  const bar = document.querySelector('.kb-bulk-bar')
  if (bar) bar.innerHTML = renderKbBulkBar()
}

/* ---------- 未答列表 / 检索设置 ---------- */

function renderKbUnanswered({ showAddQa = false } = {}) {
  const rows = cfg.unanswered.length ? cfg.unanswered.map(item => `<div class="cfg-unanswered-row"><strong>${esc(item.question)}</strong><span>${KB_UNANSWERED_REASON[item.reason] || item.reason} · ${item.time}</span><div class="cfg-unanswered-actions"><button type="button" class="cfg-btn sm outline" data-unanswered-fill="${item.id}">补充答案</button><button type="button" class="cfg-btn sm ghost" data-unanswered-ignore="${item.id}">忽略</button></div></div>`).join('')
    : '<div class="cfg-empty"><strong>当前没有未答问题</strong><br />出现知识缺口后会进入这里等待补充答案。</div>'
  const addQa = showAddQa ? `<button type="button" class="cfg-btn primary" data-kb-entry="qa">${icon('plus', 'xs')}<span>新增 Q&A</span></button>` : ''
  return cfgPanel('未答列表', '来自真实会话里 AI 依据不足和自动试题失败；模型出错不计入。同一个问题每次被问都单独记一条，只能通过 Q&A 关闭缺口。', `<div class="cfg-unanswered-list">${rows}</div>`, { flush: true, actions: `${addQa}<span class="cfg-badge warning">${cfg.unanswered.length} 待处理</span>` })
}

function renderKbSettings() {
  const num = (label, path, help) => cfgField(label, cfgInput(path, { type: 'number', min: 0 }), { help })
  return cfgPanel('高级检索设置', '每个智能体单独设置；只影响知识检索，不改变智能体的角色或业务流程。', `<div class="cfg-form-grid cols-3">
      ${num('检索参考轮数', 'retrieval.turns', '用最近多少轮访客消息构造检索查询，默认 3。')}
      ${num('单条最大字符', 'retrieval.chunkChars', '每条证据进入模型前的最大长度，默认 600。')}
      ${num('上下文总字符', 'retrieval.contextChars', '所有知识资料证据的总预算，默认 2400。')}
      ${cfgField('分类词表', cfgTextarea('retrieval.taxonomy', { placeholder: '可选；用于统一导入资料中的行业、产品、场景标签' }), { full: true, help: '词表内容完全由工作区定义。' })}
      ${cfgField('术语别名', cfgTextarea('retrieval.aliases', { placeholder: '正式名称=简称、旧称\n另一个术语=别名' }), { full: true, help: '每行是一组真正等价的说法，命中任一词都会扩展整组。不要把上位类目和细分类目放在同一组。' })}
    </div>`)
}

/* ---------- 抽屉：上传文件 ---------- */

const kbExt = name => String(name).split('.').pop().toLowerCase()

function renderKbUploadDrawer(d) {
  const files = d.files.map((file, index) => `<li><span class="kb-file-ext">${esc(kbExt(file.name).toUpperCase())}</span><span class="kb-file-name">${esc(file.name)}</span><small>${esc(file.size)}</small>${file.error ? `<em class="kb-file-error">${esc(file.error)}</em>` : ''}<button type="button" class="cfg-icon-btn" data-kb-file-remove="${index}" aria-label="移除 ${esc(file.name)}">${icon('close', 'xs')}</button></li>`).join('')
  const ok = d.files.filter(file => !file.error).length
  return kbDrawerShell('上传文件', '导入在后台进行，可以离开页面，在列表里看状态。', `
    <label class="kb-drop"><input type="file" multiple accept="${KB_FORMATS.map(ext => `.${ext}`).join(',')}" data-kb-file-input hidden />
      <span class="kb-drop-icon">${icon('upload')}</span><strong>点击或拖拽文件到这里上传</strong><small>可一次选择多份资料</small>
      <span class="kb-formats">${KB_FORMATS.map(ext => `<span>.${ext}</span>`).join('')}</span></label>
    <button type="button" class="cfg-btn sm ghost kb-sample" data-action="kb-sample-files">${icon('plus', 'xs')}<span>没有文件？用示例资料试试</span></button>
    ${files ? `<ul class="kb-file-list" aria-label="待上传文件">${files}</ul>` : ''}
    <p class="kb-note">${icon('alert', 'xs')}<span>原文件会保留，先转成 Markdown 再切分；表格每行作为一条记录并保留列名；扫描版 PDF 自动走文字识别。图片暂不支持。</span></p>
    <div class="cfg-field"><label for="kb-import-as">导入为</label><select id="kb-import-as" data-kb-import-as><option value="doc" ${d.importAs === 'doc' ? 'selected' : ''}>知识资料（默认）· 语义检索</option><option value="qa" ${d.importAs === 'qa' ? 'selected' : ''}>Q&A · 默认固定答复</option></select>
      <small>普通文件默认作为知识资料；表头和 Q&A 模板一致的 Excel 直接按 Q&A 导入。AI 只给类型建议和字段映射，判断不对可以在详情里改类型后重新处理。</small></div>
    <div class="kb-template">${icon('download', 'xs')}<span>下载 Q&A Excel 模板：标题、问法、标准答案、回答方式；多个问法写在同一格，换行分隔。</span><button type="button" class="cfg-btn sm outline" data-action="kb-template">下载模板</button></div>`,
    `<button type="button" class="cfg-btn ghost" data-action="kb-upload-reset" ${d.files.length ? '' : 'disabled'}>重置</button><button type="button" class="cfg-btn primary" data-action="kb-upload-submit" ${ok ? '' : 'disabled'}>${icon('upload', 'xs')}<span>添加 ${ok || ''} 个文件</span></button>`)
}

function kbAddFiles(list) {
  const d = cfg.kbDrawer
  for (const file of list) {
    const ext = kbExt(file.name)
    const sizeKb = Math.max(1, Math.round((file.size || 0) / 1024))
    d.files.push({ name: file.name, size: file.sizeLabel || `${sizeKb} KB`, error: KB_FORMATS.includes(ext) ? '' : (/^(png|jpe?g|gif|webp|bmp|heic)$/.test(ext) ? '图片暂不支持' : '不支持的格式') })
  }
  renderApp()
}

function kbGenerateEntries(name) {
  const base = name.replace(/\.[^.]+$/, '')
  return [
    { id: kbId(), title: `${base} · 概述`, body: `${base} 的主要内容概述，由原文件转成 Markdown 后按标题切分。` },
    { id: kbId(), title: `${base} · 适用场景`, body: '适合的行业与客户规模、典型使用场景和上线周期。' },
    { id: kbId(), title: `${base} · 常见问题`, body: '整理自原文件末尾的常见问题章节，每个问题一条记录。' }
  ]
}

function kbEntriesToMarkdown(entries) {
  return (entries || []).map(entry => `## ${entry.title}\n\n${entry.body || ''}`.trim()).join('\n\n')
}

function kbMarkdownToEntries(markdown, name) {
  const fallbackTitle = name.replace(/\.[^.]+$/, '') || '文档内容'
  const entries = []
  let title = fallbackTitle
  let body = []
  let hasHeading = false
  const push = () => {
    const text = body.join('\n').trim()
    if (text || hasHeading) entries.push({ id: kbId(), title, body: text })
    body = []
  }
  String(markdown || '').split(/\r?\n/).forEach(line => {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/)
    if (!heading) return body.push(line)
    if (body.some(part => part.trim()) || hasHeading) push()
    title = heading[1].trim() || fallbackTitle
    hasHeading = true
  })
  push()
  return entries.length ? entries : [{ id: kbId(), title: fallbackTitle, body: String(markdown || '').trim() }]
}

function kbSourceMarkdown(source) {
  if (typeof source.markdown !== 'string') source.markdown = kbEntriesToMarkdown(source.entries)
  return source.markdown
}

function kbSyncSourceMarkdown(source) {
  if (source?.type === 'file' && source.importAs !== 'qa') source.markdown = kbEntriesToMarkdown(source.entries)
}

function kbSubmitUpload() {
  const d = cfg.kbDrawer
  const files = d.files.filter(file => !file.error)
  files.forEach(file => {
    const ext = kbExt(file.name)
    const asQa = d.importAs === 'qa'
    const looksQa = !asQa && /xlsx?|csv/.test(ext) && /问答|faq|q&a|qa/i.test(file.name)
    const source = { id: kbId(), type: 'file', name: file.name, format: ext, size: file.size, created: nowStamp(), status: 'processing', importAs: asQa ? 'qa' : 'doc', tags: [], entries: [], tests: [], removed: [], suggestion: looksQa ? '识别到「问题」「答案」两列，这份表格更像 Q&A' : '' }
    cfg.sources.unshift(source)
    setTimeout(() => kbFinishProcessing(source.id), 1800 + Math.random() * 1200)
  })
  cfg.kbDrawer = null
  toast(`已添加 ${files.length} 个文件，正在后台处理`)
  renderApp()
}

function kbFinishProcessing(id) {
  const source = kbFind(id)
  if (!source || source.status !== 'processing') return
  if (/失败|broken/i.test(source.name)) { Object.assign(source, { status: 'failed', error: '文件损坏或加密，无法解析' }); return kbRefreshAfterAsync() }
  if (source.importAs === 'qa') {
    // Q&A 导入：每行一条 Q&A；与已有问法冲突的行跳过并报告原因（决议 8）
    const rows = [['怎么收费？', '标准版 ¥999/月，专业版 ¥2999/月，企业版按需报价。'], ['可以免费试用吗？', '可以，注册后即可使用免费版。'], ['支持哪些语言？', '支持中文和英文，其他语言即将上线。']]
    const existing = new Set(kbQas().flatMap(qa => qa.questions.map(kbNorm)))
    const skipped = []
    rows.forEach(([q, a]) => {
      if (existing.has(kbNorm(q))) { skipped.push({ title: q, reason: '与已有 Q&A 的问法重复，已保留原有内容' }); return }
      const qa = kbQa(kbId(), q, [q], a, 'fixed', nowStamp())
      cfg.sources.unshift(qa)
      kbCloseMatched(qa)
    })
    Object.assign(source, { status: 'ready', entries: [], conflicts: skipped, qaCount: rows.length - skipped.length })
  } else {
    const entries = kbGenerateEntries(source.name)
    Object.assign(source, { status: 'ready', entries, markdown: kbEntriesToMarkdown(entries), tests: [{ id: kbId(), question: `${source.name.replace(/\.[^.]+$/, '')}适合什么客户？`, pass: true }, { id: kbId(), question: '上线需要多长时间？', pass: false }], removed: [{ id: kbId(), title: '页眉页脚', reason: '模板内容，自动去掉', restorable: false }] })
    const failed = source.tests.filter(test => !test.pass)
    failed.forEach(test => cfg.unanswered.unshift({ id: kbId(), question: test.question, reason: 'self_test_no_kb', time: nowStamp() }))
  }
  if (cfg.kbDrawer?.kind === 'detail' && cfg.kbDrawer.id === source.id) cfg.kbDrawer.markdown = source.importAs === 'qa' ? null : source.markdown
  kbRefreshAfterAsync()
}

/** 后台任务完成后只刷新知识库相关的界面，不打断正在编辑的输入框。 */
function kbRefreshAfterAsync() {
  if (state.agentSection !== 'knowledge') return
  const typing = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)
  // 正在看的详情跟着刷新；正在输入或开着其他抽屉时只刷新列表
  if (typing || (cfg.kbDrawer && cfg.kbDrawer.kind !== 'detail')) { refreshKbList(); return }
  renderApp()
}

/* ---------- 抽屉：添加网站（列出页面 → AI 标噪音 → 勾选 → 同步） ---------- */

const KB_SITE_PAGES = [
  ['/', '首页'], ['/product', '产品介绍'], ['/product/chat', '吸管 Chat'], ['/product/knowledge', '知识库'], ['/product/leads', '线索管理'],
  ['/pricing', '价格'], ['/cases', '客户案例'], ['/cases/manufacturing', '制造业案例'], ['/cases/education', '教育行业案例'], ['/cases/saas', 'SaaS 案例'],
  ['/docs', '帮助中心'], ['/docs/install', '安装 Widget'], ['/docs/faq', '常见问题'], ['/blog', '博客'], ['/blog/ai-reception', 'AI 接待实践'], ['/blog/lead-capture', '留资转化技巧'],
  ['/about', '关于我们'], ['/zh-tw', '繁體首頁'], ['/zh-tw/product', '產品介紹'], ['/zh-tw/pricing', '價格'], ['/ru', 'Главная'], ['/ru/product', 'Продукт']
]
const kbNoise = path => /^\/(zh-tw|ru|en|ja)(\/|$)/.test(path) ? '多语言重复版本' : ''
const kbGroupOf = path => `/${path.split('/')[1] || ''}`

function renderKbSiteDrawer(d) {
  if (d.step === 'pick') return renderKbSitePick(d)
  const modes = [['crawl', '抓取链接'], ['sitemap', '站点地图'], ['single', '单个链接']]
  const tips = { crawl: '只抓取同域公开页面；抓取完成后可按路径勾选要入库的页面。', sitemap: '读取站点的 sitemap.xml 发现页面，抓取完成后同样可以勾选。', single: '只抓取这一个页面，不经过勾选，直接入库。' }
  return kbDrawerShell('添加网站', '抓取公开页面并在后台同步。', `
    <div class="segmented kb-site-modes" role="tablist">${modes.map(([key, label]) => `<button type="button" role="tab" aria-selected="${d.mode === key}" class="${d.mode === key ? 'active' : ''}" data-kb-site-mode="${key}">${label}</button>`).join('')}</div>
    <div class="cfg-field"><label for="kb-site-url">${d.mode === 'sitemap' ? 'sitemap 地址' : '网址'}</label><div class="kb-url"><select data-kb-site-proto aria-label="协议"><option ${d.proto === 'https://' ? 'selected' : ''}>https://</option><option ${d.proto === 'http://' ? 'selected' : ''}>http://</option></select><input id="kb-site-url" value="${esc(d.url)}" placeholder="${d.mode === 'sitemap' ? 'www.example.com/sitemap.xml' : 'www.example.com'}" data-kb-site-url /></div><small>${tips[d.mode]}</small></div>
    ${d.mode === 'single' ? '' : `<details class="kb-adv" ${d.advOpen ? 'open' : ''}><summary data-kb-site-adv>高级选项</summary><div class="cfg-field"><label>最多抓取页数</label><p class="capability-readonly">当前每次最多 ${KB_SITE_LIMIT} 页；更大规模的站点同步即将上线。</p></div></details>`}
    ${d.loading ? `<div class="kb-loading"><i class="kb-spin"></i><span>正在列出能访问到的页面…</span></div>` : ''}`,
    `<span></span><button type="button" class="cfg-btn primary" data-action="kb-site-crawl" ${d.loading ? 'disabled' : ''}>${icon('globe', 'xs')}<span>${d.mode === 'single' ? '添加页面' : '抓取页面'}</span></button>`)
}

function renderKbSitePick(d) {
  const keyword = d.search.trim().toLowerCase()
  const groups = {}
  d.pages.forEach((page, index) => {
    if (keyword && !`${page.path}${page.title}`.toLowerCase().includes(keyword)) return
    const key = kbGroupOf(page.path)
    ;(groups[key] ||= []).push({ ...page, index })
  })
  const checked = d.pages.filter(page => page.checked).length
  const locked = d.locked
  const tree = Object.entries(groups).map(([group, pages]) => {
    const on = pages.filter(page => page.checked).length
    const noise = kbNoise(group)
    return `<li class="kb-tree-group"><label class="kb-tree-head"><input type="checkbox" data-kb-site-group="${esc(group)}" ${on === pages.length ? 'checked' : ''} ${on && on < pages.length ? 'data-partial="1"' : ''} ${locked ? 'disabled' : ''} /><strong>${esc(group)}</strong><span class="kb-tree-count">${pages.length} 页</span>${noise ? `<span class="cfg-badge warning" title="AI 判断">${icon('spark', 'xs')}${noise}，默认不勾选</span>` : ''}</label>
      <ul>${pages.map(page => `<li><label><input type="checkbox" data-kb-site-page="${page.index}" ${page.checked ? 'checked' : ''} ${locked ? 'disabled' : ''} /><span>${esc(page.title)}</span><code>${esc(page.path)}</code></label></li>`).join('')}</ul></li>`
  }).join('')
  return kbDrawerShell(locked ? '页面（同步中不可修改）' : '选择页面', `${esc(d.proto + d.url)} · 已找到 ${d.pages.length} 个页面`, `
    ${locked ? `<div class="cfg-notice"><span class="cfg-notice-icon">${icon('alert', 'sm')}</span><div>同步过程中不能修改勾选的页面，同步完成后可以调整并重抓。</div></div>` : `<p class="kb-note">${icon('spark', 'xs')}<span>AI 标出了可能是噪音的路径（如多语言重复版本）并默认不勾选，你可以改。</span></p>`}
    <div class="cfg-search">${icon('search', 'sm')}<input type="search" placeholder="搜索页面路径" value="${esc(d.search)}" data-kb-site-search aria-label="搜索页面路径" /></div>
    <ul class="kb-tree">${tree || '<li class="cfg-empty">没有匹配的页面。</li>'}</ul>
    <p class="kb-note">${icon('alert', 'xs')}<span>另有 3 个页面因正文太少或抓取失败被剔除，入库后可在详情的「被剔除内容」里复核。</span></p>`,
    locked ? `<span></span><button type="button" class="cfg-btn outline" data-action="kb-drawer-close">关闭</button>`
      : `<button type="button" class="cfg-btn ghost" data-action="kb-site-back">${d.sourceId ? '取消' : '重新输入'}</button><button type="button" class="cfg-btn primary" data-action="kb-site-sync" ${checked ? '' : 'disabled'}>${icon('refresh', 'xs')}<span>${d.sourceId ? '重抓' : '开始同步'}（${checked} 页）</span></button>`)
}

function kbSiteCrawl() {
  const d = cfg.kbDrawer
  const url = d.url.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!url || !/\./.test(url)) { toast('请输入要抓取的网址，例如 www.example.com', 'info'); return }
  d.url = url
  if (d.mode === 'single') {
    const source = { id: kbId(), type: 'site', name: `${d.proto}${url}`, created: nowStamp(), status: 'processing', tags: [], pages: [{ path: '/', title: url, checked: true }], synced: 0, entries: [], tests: [], removed: [] }
    cfg.sources.unshift(source)
    setTimeout(() => { Object.assign(source, { status: 'ready', synced: 1, entries: [{ id: kbId(), title: url, body: '页面正文（已去掉导航、页脚等模板内容）。' }] }); kbRefreshAfterAsync() }, 1600)
    cfg.kbDrawer = null
    toast('页面已加入，正在后台处理')
    return renderApp()
  }
  d.loading = true
  renderApp()
  setTimeout(() => {
    if (cfg.kbDrawer !== d) return
    Object.assign(d, { loading: false, step: 'pick', search: '', pages: KB_SITE_PAGES.map(([path, title]) => ({ path, title, checked: !kbNoise(path) })) })
    renderApp()
  }, 900)
}

function kbSiteSync() {
  const d = cfg.kbDrawer
  const pages = d.pages.map(page => ({ ...page }))
  let source = d.sourceId && kbFind(d.sourceId)
  if (source) Object.assign(source, { pages, status: 'syncing', synced: 0 })
  else {
    source = { id: kbId(), type: 'site', name: `${d.proto}${d.url}`, created: nowStamp(), status: 'syncing', tags: [], pages, synced: 0, entries: [], tests: [], removed: [{ id: kbId(), title: '/search', reason: '正文太少', restorable: true, body: '站内搜索结果页。' }, { id: kbId(), title: '/login', reason: '抓取失败（需要登录）', restorable: false }, { id: kbId(), title: '/404', reason: '正文太少', restorable: false }] }
    cfg.sources.unshift(source)
  }
  const total = pages.filter(page => page.checked).length
  const timer = setInterval(() => {
    if (!kbFind(source.id)) return clearInterval(timer)
    source.synced = Math.min(total, source.synced + Math.ceil(total / 6))
    if (source.synced >= total) {
      clearInterval(timer)
      Object.assign(source, { status: 'ready', entries: pages.filter(page => page.checked).map(page => ({ id: kbId(), title: page.title, body: `${page.title}页面的正文（${page.path}），已去掉导航、页脚等模板内容。` })), tests: [{ id: kbId(), question: '你们有哪些行业的客户案例？', pass: true }] })
    }
    kbRefreshAfterAsync()
  }, 700)
  cfg.kbDrawer = null
  toast(`开始同步 ${total} 个页面，可以离开页面，在列表里看进度`)
  renderApp()
}

/* ---------- 抽屉：文本片段 ---------- */

function renderKbTextDrawer(d) {
  return kbDrawerShell('添加文本片段', '直接写一段资料，保存后立即可被检索。', `
    <div class="cfg-field"><label for="kb-text-title">标题</label><input id="kb-text-title" value="${esc(d.title)}" placeholder="例如：售后服务说明" data-kb-text="title" maxlength="80" /></div>
    <div class="cfg-field"><label for="kb-text-body">正文</label><textarea id="kb-text-body" rows="12" placeholder="粘贴或输入资料内容" data-kb-text="body">${esc(d.body)}</textarea><small>${d.body.length.toLocaleString()} 字</small></div>`,
    `<button type="button" class="cfg-btn ghost" data-action="kb-drawer-close">取消</button><button type="button" class="cfg-btn primary" data-action="kb-text-save">保存</button>`)
}

/* ---------- 抽屉：新增试题 ---------- */

function renderKbTestDrawer(d) {
  const sources = cfg.sources.filter(item => item.type !== 'qa' && item.status === 'ready')
  const options = sources.map(source => `<option value="${source.id}" ${String(d.sourceId) === String(source.id) ? 'selected' : ''}>${esc(source.name)}（${(source.tests || []).length}/20）</option>`).join('')
  return kbDrawerShell('新增试题', '添加一道用于检查知识资料能否正确回答的问题；保存后立即运行。', `
    <div class="cfg-field"><label for="kb-test-source">知识资料</label><select id="kb-test-source" data-kb-test-new-source>${options}</select><small>试题会归属到所选资料，每份资料最多 20 题。</small></div>
    <div class="cfg-field"><label for="kb-test-question">试题</label><textarea id="kb-test-question" rows="5" maxlength="200" placeholder="例如：企业版是否支持私有化部署？" data-kb-test-new-question>${esc(d.question)}</textarea></div>`,
    `<button type="button" class="cfg-btn ghost" data-action="kb-drawer-close">取消</button><button type="button" class="cfg-btn primary" data-action="kb-test-save">保存并运行</button>`)
}

/* ---------- 抽屉：Q&A（新增 / 编辑 / 补充未答问题） ---------- */

function renderKbQaDrawer(d) {
  const fill = d.fromId ? cfg.unanswered.find(item => item.id === d.fromId) : null
  const qa = d.id ? kbFind(d.id) : null
  const bound = qa ? kbBoundButtons(qa) : []
  const fillModes = fill ? `<div class="kb-fill"><p>访客问题：<strong>${esc(fill.question)}</strong></p>
      <div class="segmented kb-fill-modes" role="tablist"><button type="button" class="${d.fillMode === 'new' ? 'active' : ''}" data-kb-fill-mode="new">新建一条 Q&A</button><button type="button" class="${d.fillMode === 'append' ? 'active' : ''}" data-kb-fill-mode="append">加到已有 Q&A 的问法里</button></div>
      <small>Q&A 里有问法和未答问题一致时，这些未答问题会自动关闭。</small></div>` : ''
  if (fill && d.fillMode === 'append') {
    const options = kbQas().map(item => `<option value="${item.id}" ${String(d.appendTo) === String(item.id) ? 'selected' : ''}>${esc(item.name)}（${item.questions.length} 个问法）</option>`).join('')
    return kbDrawerShell('补充答案', '把这个问题加到已有 Q&A 的问法里，以后访客这样问就会匹配到它。', `${fillModes}
      <div class="cfg-field"><label for="kb-append-to">加到哪条 Q&A</label><select id="kb-append-to" data-kb-append-to>${options}</select></div>
      ${d.appendTo ? `<div class="kb-qa-preview"><small>这条 Q&A 的答案</small><p>${esc(kbFind(d.appendTo)?.answer || '')}</p></div>` : ''}`,
      `<button type="button" class="cfg-btn ghost" data-action="kb-drawer-close">取消</button><button type="button" class="cfg-btn primary" data-action="kb-qa-append" ${d.appendTo ? '' : 'disabled'}>加入问法并关闭缺口</button>`)
  }
  const questions = d.questions.map((q, index) => `<div class="kb-question"><input value="${esc(q)}" placeholder="访客会怎么问？" data-kb-qa-question="${index}" aria-label="问法 ${index + 1}" maxlength="200" /><button type="button" class="cfg-icon-btn" data-kb-qa-question-remove="${index}" aria-label="删除问法 ${index + 1}" ${d.questions.length <= 1 ? 'disabled title="至少保留一个问法"' : ''}>${icon('close', 'xs')}</button></div>`).join('')
  const modes = [['fixed', '固定答复', '命中后原样返回，不调用模型'], ['rewrite', 'AI 改写', '以答案为依据，结合上下文回复']]
  return kbDrawerShell(fill ? '补充答案' : qa ? '编辑 Q&A' : '新增 Q&A', '配置问法、标准答案和回答方式。', `${fillModes}
    <div class="cfg-notice"><span class="cfg-notice-icon">${icon('alert', 'sm')}</span><div>固定答复会把答案原样发给访客，不要在答案里写给 AI 的指令（比如“请告诉客户…”）。</div></div>
    <div class="cfg-field"><label for="kb-qa-title">标题</label><input id="kb-qa-title" value="${esc(d.title)}" placeholder="留空时用第一个问法" data-kb-qa="title" maxlength="80" /><small>标题只用于列表展示，不参与匹配。</small></div>
    <div class="cfg-field"><label>问法 <b>${d.questions.length}</b></label><div class="kb-questions">${questions}</div>
      <button type="button" class="cfg-btn sm outline kb-add-question" data-action="kb-qa-question-add">${icon('plus', 'xs')}<span>添加问法</span></button>
      <small>按问法相似度找候选，再由 AI 结合最近 3 轮对话判断是否命中；只有快捷按钮绑定和第一句原句一致会直接命中。</small></div>
    <div class="cfg-field"><label for="kb-qa-answer">标准答案</label><textarea id="kb-qa-answer" rows="6" placeholder="写下有依据、可公开的答案；可附资料链接" data-kb-qa="answer">${esc(d.answer)}</textarea></div>
    <div class="cfg-field"><label>回答方式</label><div class="kb-modes" role="radiogroup">${modes.map(([key, title, desc]) => `<button type="button" role="radio" aria-checked="${d.mode === key}" class="kb-mode ${d.mode === key ? 'is-current' : ''}" data-kb-qa-mode="${key}"><strong>${title}</strong><small>${desc}</small></button>`).join('')}</div></div>
    <div class="cfg-field"><label for="kb-qa-keywords">关键词</label><input id="kb-qa-keywords" value="${esc(d.keywords)}" placeholder="可选，多个用顿号或逗号分隔，如：报价、价格" data-kb-qa="keywords" /><small>帮助找到这条 Q&A 作为候选，不会直接命中；每个 2～40 个字。</small></div>
    ${qa ? `<dl class="kb-meta"><div><dt>创建时间</dt><dd>${qa.created}</dd></div><div><dt>绑定的快捷按钮</dt><dd>${bound.length ? bound.map(button => `「${esc(button.text)}」`).join('') : '无'}</dd></div></dl>` : ''}`,
    `${qa ? `<button type="button" class="cfg-btn ghost is-danger" data-kb-delete="${qa.id}">${icon('trash', 'xs')}<span>删除</span></button>` : '<span></span>'}<div class="kb-foot-actions"><button type="button" class="cfg-btn ghost" data-action="kb-drawer-close">取消</button><button type="button" class="cfg-btn primary" data-action="kb-qa-save">${fill ? '新建 Q&A 并关闭缺口' : '保存'}</button></div>`)
}

function kbOpenQa(qa, extra = {}) {
  cfg.kbMenu = null
  cfg.kbDrawer = qa
    ? { kind: 'qa', id: qa.id, title: qa.title, questions: [...qa.questions], answer: qa.answer, mode: qa.mode, keywords: qa.keywords.join('、'), ...extra }
    : { kind: 'qa', title: '', questions: [extra.question || ''], answer: '', mode: 'fixed', keywords: '', ...extra }
  renderApp()
  requestAnimationFrame(() => document.querySelector(qa || extra.question ? '#kb-qa-answer' : '[data-kb-qa-question="0"]')?.focus())
}

/** Q&A 新增或修改后，问法和未答问题一致的自动关闭。 */
function kbCloseMatched(qa) {
  const keys = new Set(qa.questions.map(kbNorm))
  const before = cfg.unanswered.length
  cfg.unanswered = cfg.unanswered.filter(item => !keys.has(kbNorm(item.question)))
  return before - cfg.unanswered.length
}

function kbSaveQa() {
  const d = cfg.kbDrawer
  const questions = d.questions.map(q => q.trim()).filter(Boolean)
  const answer = d.answer.trim()
  const keywords = d.keywords.split(/[、,，\s]+/).map(k => k.trim()).filter(Boolean)
  if (!questions.length) return toast('至少填写一个问法', 'info')
  if (!answer) return toast('请填写标准答案', 'info')
  if (keywords.some(k => k.length < 2 || k.length > 40)) return toast('关键词每个 2～40 个字', 'info')
  const dup = kbQas().find(item => item.id !== d.id && item.questions.some(q => questions.map(kbNorm).includes(kbNorm(q))))
  if (dup) return toast(`问法和「${dup.name}」重复，同一个问法只能属于一条 Q&A`, 'info')
  let qa = d.id && kbFind(d.id)
  if (qa) Object.assign(qa, { title: d.title.trim(), questions, answer, mode: d.mode, keywords })
  else { qa = kbQa(kbId(), d.title.trim(), questions, answer, d.mode, nowStamp(), keywords); cfg.sources.unshift(qa) }
  if (d.fromId) { const row = cfg.unanswered.find(item => item.id === d.fromId); if (row && !questions.some(q => kbNorm(q) === kbNorm(row.question))) qa.questions.push(row.question) }
  const closed = kbCloseMatched(qa)
  cfg.kbDrawer = null
  toast(closed ? `Q&A 已保存，同时关闭了 ${closed} 个未答问题` : d.id ? 'Q&A 已保存，立即按新内容匹配' : 'Q&A 已添加，立即生效')
  renderApp()
}

function kbAppendQuestion() {
  const d = cfg.kbDrawer
  const qa = kbFind(d.appendTo)
  const row = cfg.unanswered.find(item => item.id === d.fromId)
  if (!qa || !row) return
  if (!qa.questions.some(q => kbNorm(q) === kbNorm(row.question))) qa.questions.push(row.question)
  const closed = kbCloseMatched(qa)
  cfg.kbDrawer = null
  toast(`已加到「${qa.name}」的问法里，关闭了 ${closed} 个未答问题`)
  renderApp()
}

/* ---------- 抽屉：知识资料详情 ---------- */

function renderKbMarkdownEditor(source, d, busy) {
  if (d.markdown == null) d.markdown = kbSourceMarkdown(source)
  return `<section class="kb-markdown-editor">
    <header class="kb-markdown-editor-head"><div><h3>Markdown 全文</h3><p>直接编辑转换后的完整文档；保存后会重新拆分内容条目并重建检索索引。</p></div><button type="button" class="cfg-btn primary" data-action="kb-markdown-save" ${busy ? 'disabled' : ''}>${icon('save', 'xs')}<span>保存全文</span></button></header>
    <textarea data-kb-markdown aria-label="Markdown 全文" spellcheck="false" ${busy ? 'disabled' : ''}>${esc(d.markdown)}</textarea>
    <footer><span>Markdown</span><span>${d.markdown.length.toLocaleString()} 字</span></footer>
  </section>`
}

function renderKbDetailSection(title, count, body, cls = '') {
  return `<section class="kb-detail-section ${cls}"><header><h3>${title}</h3><span>${count}</span></header><div class="kb-detail-section-body">${body}</div></section>`
}

function renderKbDetailDrawer(d) {
  const source = kbFind(d.id)
  if (!source) return ''
  const isSite = source.type === 'site'
  const busy = source.status === 'processing' || source.status === 'syncing'
  const [tone, label] = KB_STATUS[source.status]
  const about = [
    ['来源', isSite ? esc(source.name) : source.type === 'text' ? '手动添加' : `${esc(source.name)}${source.size ? ` · ${esc(source.size)}` : ''}`],
    ['状态', `<span class="cfg-badge ${tone}">${label}</span>${source.status === 'syncing' ? ` 已同步 ${source.synced} / ${source.pages.filter(page => page.checked).length} 页` : ''}`],
    ['导入为', source.type === 'file' ? `${source.importAs === 'qa' ? 'Q&A' : '知识资料'}${busy ? '' : ` <button type="button" class="cfg-btn sm ghost" data-action="kb-switch-import">改为${source.importAs === 'qa' ? '知识资料' : ' Q&A '}并重新处理</button>`}` : '知识资料'],
    ['内容条目', source.importAs === 'qa' ? `${source.qaCount ?? 0} 条 Q&A（在列表里各占一行）` : `${(source.entries || []).length} 条`],
    ['添加时间', source.created]
  ]
  if (source.type === 'file') about.splice(1, 0, ['原文件', `已保留${source.format ? ` .${esc(source.format)}` : ''}，转成 Markdown 后切分`])
  const notices = [
    source.status === 'processing' ? `<div class="cfg-notice info"><span class="cfg-notice-icon"><i class="kb-spin"></i></span><div>正在后台处理，完成后状态会变为「可用」。可以离开页面。</div></div>` : '',
    source.status === 'failed' ? `<div class="cfg-notice danger"><span class="cfg-notice-icon">${icon('alert', 'sm')}</span><div><strong>处理失败，不参与回答。</strong>原因：${esc(source.error || '未知错误')}</div><div class="cfg-notice-actions"><button type="button" class="cfg-btn sm outline" data-action="kb-reprocess">重新处理</button></div></div>` : '',
    source.updating ? `<div class="cfg-notice info"><span class="cfg-notice-icon"><i class="kb-spin"></i></span><div>新版本「${esc(source.updating)}」处理中；处理成功后才切换，当前仍用旧内容回答，失败时保留旧内容。</div></div>` : '',
    source.suggestion && source.importAs === 'doc' ? `<div class="cfg-notice"><span class="cfg-notice-icon">${icon('spark', 'sm')}</span><div><strong>AI 建议：</strong>${esc(source.suggestion)}。当前仍按知识资料导入。</div><div class="cfg-notice-actions"><button type="button" class="cfg-btn sm outline" data-action="kb-switch-import">改为 Q&A 并重新处理</button></div></div>` : '',
    source.conflicts?.length ? `<div class="cfg-notice"><span class="cfg-notice-icon">${icon('alert', 'sm')}</span><div><strong>${source.conflicts.length} 行已跳过：</strong>${source.conflicts.map(row => `「${esc(row.title)}」${esc(row.reason)}`).join('；')}</div></div>` : ''
  ].join('')
  const detailContent = source.importAs === 'qa' ? '' : `<div class="kb-detail-stack">
    ${source.type === 'file' ? renderKbMarkdownEditor(source, d, busy) : ''}
    ${renderKbDetailSection('内容条目', (source.entries || []).length, renderKbEntries(source), 'kb-detail-entries')}
    ${renderKbDetailSection('被剔除内容', (source.removed || []).length, renderKbRemoved(source), 'kb-detail-removed')}</div>`
  const actions = [
    source.type === 'file' ? `<button type="button" class="cfg-btn sm outline" data-action="kb-new-version" ${busy || source.updating ? 'disabled' : ''}>${icon('upload', 'xs')}<span>上传新版本</span></button>` : '',
    isSite ? `<button type="button" class="cfg-btn sm outline" data-action="kb-site-adjust" ${busy ? 'disabled title="同步过程中不能修改勾选的页面"' : ''}>${icon('refresh', 'xs')}<span>调整页面并重抓</span></button>` : '',
    `<button type="button" class="cfg-btn sm outline" data-action="kb-reprocess" ${busy ? 'disabled' : ''}>${icon('rotate', 'xs')}<span>重新处理</span></button>`
  ].join('')
  return kbDrawerShell(esc(source.name), source.type === 'text' ? '文本片段' : isSite ? '网站' : '知识资料详情', `
    ${notices}
    <dl class="kb-about">${about.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <div class="cfg-field"><label for="kb-tags">知识标签</label><div class="kb-tags"><input id="kb-tags" value="${esc((source.tags || []).join('、'))}" placeholder="例如：售前、产品" data-kb-tags /><button type="button" class="cfg-btn sm outline" data-action="kb-save-tags">保存标签</button></div><small>智能体可按标签圈定知识范围。</small></div>
    <div class="kb-detail-actions">${actions}</div>
    ${detailContent}`,
    `<button type="button" class="cfg-btn ghost is-danger" data-kb-delete="${source.id}">${icon('trash', 'xs')}<span>删除</span></button><button type="button" class="cfg-btn outline" data-action="kb-drawer-close">关闭</button>`, { wide: true })
}

function renderKbEntries(source) {
  if (!source.entries?.length) return `<div class="cfg-empty">${source.status === 'ready' ? '没有内容条目。' : '处理完成后，这里会列出 AI 实际读到的每一条内容。'}</div>`
  const edit = cfg.kbEntryEdit
  return `<p class="kb-tab-tip">逐条查看 AI 实际读到的标题与正文。编辑的是原文条目，保存后系统会重建相关检索片段；整份资料重新上传或网站重抓时，手动编辑不保留。</p>
    <ol class="kb-entries">${source.entries.map(entry => edit?.id === entry.id
      ? `<li class="is-editing"><input value="${esc(edit.title)}" data-kb-entry-edit="title" aria-label="条目标题" /><textarea rows="5" data-kb-entry-edit="body" aria-label="条目正文">${esc(edit.body)}</textarea><div class="kb-entry-actions"><button type="button" class="cfg-btn sm ghost" data-action="kb-entry-cancel">取消</button><button type="button" class="cfg-btn sm primary" data-action="kb-entry-save">保存</button></div></li>`
      : `<li><div><strong>${esc(entry.title)}</strong><p>${esc(entry.body)}</p></div><div class="kb-entry-actions"><button type="button" class="cfg-btn sm ghost" data-kb-entry-open="${entry.id}">编辑</button><button type="button" class="cfg-btn sm ghost is-danger" data-kb-entry-delete="${entry.id}">删除</button></div></li>`).join('')}</ol>`
}

function kbAllTests() {
  return cfg.sources.flatMap(source => (source.tests || []).map(test => ({ source, test })))
}

function renderKbTests() {
  const rows = kbAllTests()
  const failed = rows.filter(({ test }) => !test.pass).length
  const canAdd = cfg.sources.some(item => item.type !== 'qa' && item.status === 'ready')
  const body = rows.length
    ? `<ul class="kb-tests kb-tests-all">${rows.map(({ source, test }) => `<li><span class="cfg-badge ${test.pass ? 'success' : 'warning'}">${test.pass ? '通过' : '未通过'}</span><span>${esc(test.question)}</span>${test.pass ? '' : `<button type="button" class="cfg-btn sm outline" data-kb-test-source="${source.id}" data-kb-test-fix="${test.id}">修正这题</button>`}</li>`).join('')}</ul>`
    : `<div class="cfg-empty kb-tests-empty"><strong>暂无自动试题</strong><br />知识资料入库后会自动出题。</div>`
  return cfgPanel(`${rows.length} 题 · ${failed} 题未通过`, '当前知识库中全部知识资料的自动试题；每份资料最多 20 题，答不上的题会进入未答队列。', body, {
    cls: 'kb-tests-panel',
    flush: Boolean(rows.length),
    actions: `<button type="button" class="cfg-btn primary" data-action="kb-test-new" ${canAdd ? '' : 'disabled title="请先添加可用的知识资料"'}>${icon('plus', 'xs')}<span>新增试题</span></button><button type="button" class="cfg-btn outline" data-action="kb-tests-rerun" ${rows.length ? '' : 'disabled'}>${icon('refresh', 'xs')}<span>重新运行</span></button>`
  })
}

function renderKbRemoved(source) {
  const rows = source.removed || []
  if (!rows.length) return '<div class="cfg-empty">没有被剔除的内容。</div>'
  return `<p class="kb-tab-tip">网页导航、页脚等模板内容会自动去掉；正文太少的页面和少于 8 个字的记录放在这里，可人工复核后恢复进库。</p>
    <ul class="kb-removed">${rows.map(row => `<li><div><strong>${esc(row.title)}</strong><small>${esc(row.reason)}</small></div>${row.restorable ? `<button type="button" class="cfg-btn sm outline" data-kb-restore="${row.id}">恢复进库</button>` : '<span class="kb-muted">仅诊断，不可恢复</span>'}</li>`).join('')}</ul>`
}

/* ---------- 删除确认（4.7 删除规则） ---------- */

function renderKbConfirm() {
  const c = cfg.kbConfirm
  if (!c) return ''
  if (c.kind === 'entry') {
    return `<div class="modal-backdrop kb-confirm" data-kb-confirm-backdrop><div class="modal" role="alertdialog" aria-labelledby="kb-confirm-title" style="width:440px">
      <div class="modal-head"><div><h2 id="kb-confirm-title">删除这条内容？</h2><p>「${esc(c.title)}」删除后立即停止参与回答，不可恢复。</p></div></div>
      <div class="modal-foot"><span></span><div><button type="button" class="btn" data-action="kb-confirm-cancel">取消</button> <button type="button" class="btn danger" data-action="kb-confirm-ok">确认删除</button></div></div></div></div>`
  }
  const items = c.ids.map(kbFind).filter(Boolean)
  const counts = {}
  items.forEach(item => { counts[item.type] = (counts[item.type] || 0) + 1 })
  const summary = Object.entries(counts).map(([type, n]) => `${n} ${KB_TYPE_UNIT[type][0]}${KB_TYPE_UNIT[type][1]}`).join('、')
  const docs = items.filter(item => item.type !== 'qa')
  const buttons = items.filter(item => item.type === 'qa').flatMap(qa => kbBoundButtons(qa).map(button => `「${esc(button.text)}」`))
  return `<div class="modal-backdrop kb-confirm" data-kb-confirm-backdrop><div class="modal" role="alertdialog" aria-labelledby="kb-confirm-title" style="width:480px">
    <div class="modal-head"><div><h2 id="kb-confirm-title">将删除 ${summary}</h2><p>删除后立即停止参与回答，不可恢复。</p></div></div>
    <div class="modal-body kb-confirm-body">
      ${items.length === 1 ? `<p>「${esc(items[0].name)}」</p>` : ''}
      ${docs.some(item => item.entries?.length) ? '<p>知识资料下的全部内容条目和自动试题会一起删除。</p>' : ''}
      ${buttons.length ? `<div class="cfg-notice"><span class="cfg-notice-icon">${icon('alert', 'sm')}</span><div><strong>受影响的快捷按钮：</strong>${buttons.join('')}。删除后这些按钮改为按按钮文字匹配。</div></div>` : ''}
    </div>
    <div class="modal-foot"><span></span><div><button type="button" class="btn" data-action="kb-confirm-cancel">取消</button> <button type="button" class="btn danger" data-action="kb-confirm-ok">确认删除</button></div></div></div></div>`
}

function kbConfirmDelete() {
  const c = cfg.kbConfirm
  if (c.kind === 'entry') {
    const source = kbFind(c.sourceId)
    if (source) {
      source.entries = source.entries.filter(entry => entry.id !== c.entryId)
      kbSyncSourceMarkdown(source)
      if (cfg.kbDrawer?.kind === 'detail' && cfg.kbDrawer.id === source.id) cfg.kbDrawer.markdown = source.markdown
    }
    cfg.kbConfirm = null
    toast('内容条目已删除，已重建相关检索片段')
    return renderApp()
  }
  const ids = new Set(c.ids)
  cfg.sources.filter(item => ids.has(item.id) && item.type === 'qa').forEach(qa => kbBoundButtons(qa).forEach(button => { button.qa = '' }))
  cfg.sources = cfg.sources.filter(item => !ids.has(item.id))
  cfg.kbSelected = cfg.kbSelected.filter(id => !ids.has(id))
  if (cfg.kbDrawer && ids.has(cfg.kbDrawer.id)) cfg.kbDrawer = null
  cfg.kbConfirm = null
  toast(`已删除 ${ids.size} 项，已停止参与回答`)
  refreshCfgChrome()
  renderApp()
}

/* ---------- 抽屉外壳 ---------- */

function kbDrawerShell(title, desc, body, foot, { wide = false } = {}) {
  // 只在第一次打开时播放滑入动画，之后重新渲染不再闪动
  const entering = cfg.kbDrawer && !cfg.kbDrawer.shown
  if (cfg.kbDrawer) cfg.kbDrawer.shown = true
  return `<div class="kb-drawer-backdrop ${entering ? 'is-entering' : ''}" data-kb-drawer-backdrop></div>
    <aside class="kb-drawer ${wide ? 'is-wide' : ''} ${entering ? 'is-entering' : ''}" role="dialog" aria-modal="true" aria-labelledby="kb-drawer-title">
      <header class="kb-drawer-head"><div><h2 id="kb-drawer-title">${title}</h2>${desc ? `<p>${desc}</p>` : ''}</div><button type="button" class="cfg-icon-btn" data-action="kb-drawer-close" aria-label="关闭">${icon('close', 'sm')}</button></header>
      <div class="kb-drawer-body">${body}</div>
      <footer class="kb-drawer-foot">${foot}</footer>
    </aside>`
}

function renderKbOverlay() {
  const d = cfg.kbDrawer
  const drawer = !d ? '' : d.kind === 'upload' ? renderKbUploadDrawer(d) : d.kind === 'site' ? renderKbSiteDrawer(d) : d.kind === 'text' ? renderKbTextDrawer(d) : d.kind === 'test' ? renderKbTestDrawer(d) : d.kind === 'qa' ? renderKbQaDrawer(d) : renderKbDetailDrawer(d)
  return `${drawer}${renderKbConfirm()}`
}

/* ---------- 页面 ---------- */

function renderKnowledgeConfig() {
  const docs = cfg.sources.filter(item => item.type !== 'qa').length
  const tabs = [['sources', '数据源', ''], ['tests', '自动试题', ''], ['unanswered', '未答列表', ''], ['settings', '检索设置', '']]
  const panel = cfg.kbTab === 'unanswered' ? renderKbUnanswered({ showAddQa: true }) : cfg.kbTab === 'settings' ? renderKbSettings() : cfg.kbTab === 'tests' ? renderKbTests() : renderKbSources()
  return cfgPage(`knowledge-${cfg.kbTab}`, `${renderCfgHeader({
      title: '知识库',
      desc: '智能体答得准不准，取决于它手里有没有企业自己的资料。文件、网站与文本片段都在这里维护。',
      extra: `<span class="cfg-badge success">${docs} 份资料</span>`,
      actions: `<button type="button" class="cfg-btn outline" data-action="cfg-kb-refresh">${icon('refresh', 'sm')}<span>刷新</span></button>`
    })}
    <div class="cfg-tabs-bar"><div class="cfg-tabs" role="tablist" aria-label="知识库标签">${tabs.map(([key, label, count]) => `<button type="button" role="tab" aria-selected="${cfg.kbTab === key}" class="${cfg.kbTab === key ? 'active' : ''}" data-kb-tab="${key}"><span>${label}</span>${count !== '' ? `<b>${count}</b>` : ''}</button>`).join('')}</div></div>
    <section class="cfg-body" role="tabpanel">${panel}</section>
    ${renderKbOverlay()}`)
}

/* ---------- 事件 ---------- */

function kbOpenSource(item) {
  cfg.kbMenu = null
  if (item.type === 'qa') return kbOpenQa(item)
  cfg.kbDrawer = { kind: 'detail', id: item.id, markdown: item.type === 'file' && item.importAs !== 'qa' ? kbSourceMarkdown(item) : null }
  cfg.kbEntryEdit = null
  renderApp()
}

function kbHandleClick(event) {
  const pick = selector => event.target.closest(selector)
  let el
  if (cfg.kbMenu && !pick('.kb-menu-wrap')) { cfg.kbMenu = null; refreshKbList() }
  if ((el = pick('[data-kb-tab]'))) { cfg.kbTab = el.dataset.kbTab; cfg.kbDrawer = null; renderApp(); return true }
  if ((el = pick('[data-kb-entry]'))) {
    const key = el.dataset.kbEntry
    if (key === 'qa') return kbOpenQa(null), true
    cfg.kbDrawer = key === 'upload' ? { kind: 'upload', files: [], importAs: 'doc' } : key === 'site' ? { kind: 'site', mode: 'crawl', proto: 'https://', url: '', step: 'input', advOpen: false } : { kind: 'text', title: '', body: '' }
    renderApp()
    requestAnimationFrame(() => document.querySelector('#kb-site-url, #kb-text-title')?.focus())
    return true
  }
  if ((el = pick('[data-kb-open]'))) { const item = kbFind(el.dataset.kbOpen); if (item) kbOpenSource(item); return true }
  if ((el = pick('[data-kb-more]'))) { const id = Number(el.dataset.kbMore); cfg.kbMenu = cfg.kbMenu === id ? null : id; refreshKbList(); return true }
  if ((el = pick('[data-kb-delete]'))) { cfg.kbMenu = null; cfg.kbConfirm = { kind: 'sources', ids: [Number(el.dataset.kbDelete)] }; renderApp(); return true }
  if ((el = pick('[data-kb-select]'))) {
    const id = Number(el.dataset.kbSelect)
    cfg.kbSelected = el.checked ? [...new Set([...cfg.kbSelected, id])] : cfg.kbSelected.filter(item => item !== id)
    refreshKbList()
    return true
  }
  if ((el = pick('[data-kb-page]'))) { if (el.disabled) return true; cfg.kbPage = Number(el.dataset.kbPage); refreshKbList(); return true }
  if ((el = pick('[data-unanswered-fill]'))) {
    const row = cfg.unanswered.find(item => item.id === Number(el.dataset.unansweredFill))
    if (row) kbOpenQa(null, { question: row.question, fromId: row.id, fillMode: 'new', appendTo: kbQas()[0]?.id || '' })
    return true
  }
  if ((el = pick('[data-unanswered-ignore]'))) { cfg.unanswered = cfg.unanswered.filter(row => row.id !== Number(el.dataset.unansweredIgnore)); toast('已忽略该问题'); renderApp(); return true }
  if (event.target.matches('[data-kb-drawer-backdrop]')) { cfg.kbDrawer = null; cfg.kbEntryEdit = null; renderApp(); return true }
  if (event.target.matches('[data-kb-confirm-backdrop]')) { cfg.kbConfirm = null; renderApp(); return true }
  if ((el = pick('[data-kb-file-remove]'))) { cfg.kbDrawer.files.splice(Number(el.dataset.kbFileRemove), 1); renderApp(); return true }
  if ((el = pick('[data-kb-site-mode]'))) { cfg.kbDrawer.mode = el.dataset.kbSiteMode; renderApp(); return true }
  if ((el = pick('[data-kb-site-adv]'))) { event.preventDefault(); cfg.kbDrawer.advOpen = !cfg.kbDrawer.advOpen; renderApp(); return true }
  if ((el = pick('[data-kb-fill-mode]'))) { cfg.kbDrawer.fillMode = el.dataset.kbFillMode; renderApp(); return true }
  if ((el = pick('[data-kb-qa-mode]'))) { cfg.kbDrawer.mode = el.dataset.kbQaMode; renderApp(); return true }
  if ((el = pick('[data-kb-qa-question-remove]'))) { if (cfg.kbDrawer.questions.length > 1) { cfg.kbDrawer.questions.splice(Number(el.dataset.kbQaQuestionRemove), 1); renderApp() } return true }
  if ((el = pick('[data-kb-entry-open]'))) { const entry = kbFind(cfg.kbDrawer.id)?.entries.find(item => item.id === Number(el.dataset.kbEntryOpen)); if (entry) { cfg.kbEntryEdit = { ...entry }; renderApp() } return true }
  if ((el = pick('[data-kb-entry-delete]'))) { const entry = kbFind(cfg.kbDrawer.id)?.entries.find(item => item.id === Number(el.dataset.kbEntryDelete)); if (entry) { cfg.kbConfirm = { kind: 'entry', sourceId: cfg.kbDrawer.id, entryId: entry.id, title: entry.title }; renderApp() } return true }
  if ((el = pick('[data-kb-test-fix]'))) { const test = kbFind(el.dataset.kbTestSource)?.tests.find(item => item.id === Number(el.dataset.kbTestFix)); if (test) { const row = cfg.unanswered.find(item => kbNorm(item.question) === kbNorm(test.question)); kbOpenQa(null, { question: test.question, fromId: row?.id, fillMode: 'new', appendTo: kbQas()[0]?.id || '' }) } return true }
  if ((el = pick('[data-kb-restore]'))) {
    const source = kbFind(cfg.kbDrawer.id)
    const row = source?.removed.find(item => item.id === Number(el.dataset.kbRestore))
    if (row) { source.removed = source.removed.filter(item => item !== row); source.entries.push({ id: kbId(), title: row.title, body: row.body || row.title }); kbSyncSourceMarkdown(source); cfg.kbDrawer.markdown = source.markdown; toast('内容已恢复进库'); renderApp() }
    return true
  }
  return false
}

function kbAction(name) {
  const d = cfg.kbDrawer
  const source = d?.kind === 'detail' ? kbFind(d.id) : null
  switch (name) {
    case 'cfg-kb-refresh': toast('知识库已刷新'); renderApp(); return true
    case 'cfg-kb-bulk': cfg.kbBulk = !cfg.kbBulk; cfg.kbSelected = []; cfg.kbMenu = null; refreshKbList(); return true
    case 'kb-select-all': { const ids = kbFiltered().map(item => item.id); const all = ids.every(id => cfg.kbSelected.includes(id)); cfg.kbSelected = all ? [] : ids; refreshKbList(); return true }
    case 'kb-bulk-delete': if (cfg.kbSelected.length) { cfg.kbConfirm = { kind: 'sources', ids: [...cfg.kbSelected] }; renderApp() } return true
    case 'kb-confirm-cancel': cfg.kbConfirm = null; renderApp(); return true
    case 'kb-confirm-ok': kbConfirmDelete(); return true
    case 'kb-drawer-close': cfg.kbDrawer = null; cfg.kbEntryEdit = null; renderApp(); return true
    case 'kb-sample-files': kbAddFiles([{ name: '产品手册-2026.pdf', sizeLabel: '2.4 MB' }, { name: '客户案例.xlsx', sizeLabel: '186 KB' }, { name: '常见问答-FAQ.xlsx', sizeLabel: '42 KB' }]); return true
    case 'kb-upload-reset': d.files = []; renderApp(); return true
    case 'kb-upload-submit': kbSubmitUpload(); return true
    case 'kb-template': toast('已下载 Q&A 导入模板（原型演示）'); return true
    case 'kb-site-crawl': kbSiteCrawl(); return true
    case 'kb-site-back': if (d.sourceId) { cfg.kbDrawer = { kind: 'detail', id: d.sourceId } } else Object.assign(d, { step: 'input' }); renderApp(); return true
    case 'kb-site-sync': kbSiteSync(); return true
    case 'kb-text-save': {
      if (!d.title.trim() || !d.body.trim()) return toast('请填写标题和正文', 'info'), true
      cfg.sources.unshift({ id: kbId(), type: 'text', name: d.title.trim(), created: nowStamp(), status: 'ready', tags: [], entries: [{ id: kbId(), title: d.title.trim(), body: d.body.trim() }], tests: [], removed: [] })
      cfg.kbDrawer = null; toast('文本片段已添加，立即可被检索'); renderApp(); return true
    }
    case 'kb-test-new': {
      const first = cfg.sources.find(item => item.type !== 'qa' && item.status === 'ready')
      if (!first) return toast('请先添加可用的知识资料', 'info'), true
      cfg.kbDrawer = { kind: 'test', sourceId: first.id, question: '' }
      renderApp(); requestAnimationFrame(() => document.querySelector('#kb-test-question')?.focus()); return true
    }
    case 'kb-test-save': {
      const testSource = kbFind(d.sourceId)
      const question = d.question.trim()
      if (!testSource || testSource.type === 'qa') return toast('请选择知识资料', 'info'), true
      if (!question) return toast('请填写试题', 'info'), true
      testSource.tests ||= []
      if (testSource.tests.length >= 20) return toast('每份资料最多添加 20 道试题', 'info'), true
      if (kbAllTests().some(({ test }) => kbNorm(test.question) === kbNorm(question))) return toast('这道试题已经存在', 'info'), true
      const pass = kbAnswer(question).route !== 'none'
      testSource.tests.push({ id: kbId(), question, pass })
      if (!pass) cfg.unanswered.unshift({ id: kbId(), question, reason: 'self_test_no_kb', time: nowStamp() })
      cfg.kbDrawer = null
      toast(pass ? '试题已添加并通过' : '试题已添加，未通过并进入未答列表', pass ? 'success' : 'info')
      renderApp(); return true
    }
    case 'kb-qa-question-add': d.questions.push(''); renderApp(); requestAnimationFrame(() => document.querySelector(`[data-kb-qa-question="${d.questions.length - 1}"]`)?.focus()); return true
    case 'kb-qa-save': kbSaveQa(); return true
    case 'kb-qa-append': kbAppendQuestion(); return true
    case 'kb-markdown-save': {
      const markdownSource = d?.kind === 'detail' ? kbFind(d.id) : null
      const markdown = d?.markdown?.trim() || ''
      if (!markdownSource || markdownSource.type !== 'file' || markdownSource.importAs === 'qa') return true
      if (!markdown) return toast('Markdown 全文不能为空', 'info'), true
      markdownSource.markdown = markdown
      markdownSource.entries = kbMarkdownToEntries(markdown, markdownSource.name)
      d.markdown = markdown
      cfg.kbEntryEdit = null
      toast(`全文已保存，已重新生成 ${markdownSource.entries.length} 条内容并重建检索索引`)
      renderApp(); return true
    }
    case 'kb-save-tags': { const input = document.querySelector('[data-kb-tags]'); source.tags = input.value.split(/[、,，\s]+/).map(t => t.trim()).filter(Boolean); toast('知识标签已更新'); renderApp(); return true }
    case 'kb-reprocess': Object.assign(source, { status: 'processing', error: '' }); if (/失败|broken/i.test(source.name)) source.name = source.name.replace(/失败|broken/gi, ''); setTimeout(() => kbFinishProcessing(source.id), 1500); toast('已开始重新处理并重建索引'); renderApp(); return true
    case 'kb-switch-import': Object.assign(source, { importAs: source.importAs === 'qa' ? 'doc' : 'qa', suggestion: '', status: 'processing', entries: [], tests: [], conflicts: [] }); setTimeout(() => kbFinishProcessing(source.id), 1500); toast(`已改为按${source.importAs === 'qa' ? ' Q&A' : '知识资料'}导入，正在重新处理`); renderApp(); return true
    case 'kb-new-version': {
      const next = source.name.replace(/(\.[^.]+)$/, '-v2$1')
      source.updating = next
      setTimeout(() => { const s = kbFind(source.id); if (!s) return; const entries = kbGenerateEntries(next); Object.assign(s, { updating: '', name: next, created: nowStamp(), entries, markdown: kbEntriesToMarkdown(entries) }); if (cfg.kbDrawer?.kind === 'detail' && cfg.kbDrawer.id === s.id) cfg.kbDrawer.markdown = s.markdown; kbRefreshAfterAsync(); toast(`新版本「${next}」处理成功，已切换`) }, 2200)
      toast('新版本已上传，处理成功后再切换'); renderApp(); return true
    }
    case 'kb-site-adjust': cfg.kbDrawer = { kind: 'site', mode: 'crawl', proto: '', url: source.name, step: 'pick', search: '', sourceId: source.id, pages: source.pages.map(page => ({ ...page })) }; renderApp(); return true
    case 'kb-tests-rerun': cfg.sources.forEach(item => { if (item.tests) item.tests = item.tests.map(test => ({ ...test, pass: test.pass || kbAnswer(test.question).route !== 'none' })) }); toast('全部自动试题已重新运行'); renderApp(); return true
    case 'kb-entry-cancel': cfg.kbEntryEdit = null; renderApp(); return true
    case 'kb-entry-save': {
      const edit = cfg.kbEntryEdit
      if (!edit.title.trim() || !edit.body.trim()) return toast('标题和正文都不能为空', 'info'), true
      const entry = source.entries.find(item => item.id === edit.id)
      Object.assign(entry, { title: edit.title.trim(), body: edit.body.trim() })
      kbSyncSourceMarkdown(source)
      if (d?.kind === 'detail' && d.id === source.id) d.markdown = source.markdown
      cfg.kbEntryEdit = null; toast('已保存，相关检索片段已重建'); renderApp(); return true
    }
  }
  return false
}

function kbHandleInput(event) {
  const t = event.target
  const d = cfg.kbDrawer
  if (t.id === 'cfg-kb-search') { cfg.kbSearch = t.value; cfg.kbPage = 1; refreshKbList(); return true }
  if (!d) return false
  if (t.matches('[data-kb-site-url]')) { d.url = t.value; return true }
  if (t.matches('[data-kb-site-search]')) {
    d.search = t.value
    const pos = t.selectionStart
    renderApp()
    const next = document.querySelector('[data-kb-site-search]')
    if (next) { next.focus(); next.setSelectionRange(pos, pos) }
    return true
  }
  if (t.matches('[data-kb-text]')) { d[t.dataset.kbText] = t.value; return true }
  if (t.matches('[data-kb-test-new-question]')) { d.question = t.value; return true }
  if (t.matches('[data-kb-markdown]')) { d.markdown = t.value; return true }
  if (t.matches('[data-kb-qa]')) { d[t.dataset.kbQa] = t.value; return true }
  if (t.matches('[data-kb-qa-question]')) { d.questions[Number(t.dataset.kbQaQuestion)] = t.value; return true }
  if (t.matches('[data-kb-entry-edit]') && cfg.kbEntryEdit) { cfg.kbEntryEdit[t.dataset.kbEntryEdit] = t.value; return true }
  return false
}

function kbHandleChange(event) {
  const t = event.target
  const d = cfg.kbDrawer
  if (t.id === 'cfg-kb-type') { cfg.kbType = t.value; cfg.kbPage = 1; refreshKbList(); return true }
  if (t.id === 'cfg-kb-sort') { cfg.kbSort = t.value; refreshKbList(); return true }
  if (t.id === 'cfg-kb-size') { cfg.kbPageSize = Number(t.value); cfg.kbPage = 1; refreshKbList(); return true }
  if (!d) return false
  if (t.matches('[data-kb-file-input]')) { kbAddFiles([...t.files]); return true }
  if (t.matches('[data-kb-import-as]')) { d.importAs = t.value; return true }
  if (t.matches('[data-kb-test-new-source]')) { d.sourceId = t.value; return true }
  if (t.matches('[data-kb-site-proto]')) { d.proto = t.value; return true }
  if (t.matches('[data-kb-append-to]')) { d.appendTo = t.value; renderApp(); return true }
  if (t.matches('[data-kb-site-page]')) { d.pages[Number(t.dataset.kbSitePage)].checked = t.checked; renderApp(); return true }
  if (t.matches('[data-kb-site-group]')) { d.pages.forEach(page => { if (kbGroupOf(page.path) === t.dataset.kbSiteGroup) page.checked = t.checked }); renderApp(); return true }
  return false
}

function kbHandleKeydown(event) {
  if (event.key !== 'Escape') return false
  if (cfg.kbConfirm) { cfg.kbConfirm = null; renderApp(); return true }
  if (cfg.kbMenu) { cfg.kbMenu = null; refreshKbList(); return true }
  if (cfg.kbDrawer) { cfg.kbDrawer = null; cfg.kbEntryEdit = null; renderApp(); return true }
  return false
}

/** 拖拽文件到上传区。 */
document.addEventListener('dragover', event => { if (event.target.closest?.('.kb-drop')) { event.preventDefault(); event.target.closest('.kb-drop').classList.add('is-over') } })
document.addEventListener('dragleave', event => { event.target.closest?.('.kb-drop')?.classList.remove('is-over') })
document.addEventListener('drop', event => {
  const zone = event.target.closest?.('.kb-drop')
  if (!zone || cfg.kbDrawer?.kind !== 'upload') return
  event.preventDefault()
  kbAddFiles([...event.dataTransfer.files])
})

/** 渲染后把网站树里「部分勾选」的分组设为半选状态。 */
new MutationObserver(() => document.querySelectorAll('[data-kb-site-group][data-partial]').forEach(box => { box.indeterminate = true })).observe(document.documentElement, { childList: true, subtree: true })
