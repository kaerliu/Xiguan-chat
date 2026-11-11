const $ = (selector, root = document) => root.querySelector(selector)
const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`

const conversations = [
  {
    id: 1,
    name: 'playground-28526b64 · pg_5ec',
    short: 'P5',
    time: '11:57',
    status: 'human',
    preview: '咱们这边主要是哪个行业，想解决什么业务场景呢？',
    source: '官网产品页',
    location: '上海',
    device: 'Mac · Chrome',
    visits: 4,
    tags: ['高意向', '产品咨询'],
    messages: [
      { from: 'visitor', text: '你好，我们是一家制造企业，正在评估数据分析工具。', time: '11:48' },
      { from: 'ai', text: '您好！很高兴为您介绍。为了给您更准确的建议，想先了解一下，您目前最希望解决的是生产经营分析、管理驾驶舱，还是报表填报场景呢？', time: '11:49' },
      { from: 'visitor', text: '主要是集团经营分析，也想看看有没有同行案例。', time: '11:52' },
      { from: 'ai', text: '明白了。针对集团经营分析，我们有覆盖多组织、多数据源和经营指标体系的成熟方案。我可以先给您两份制造行业案例，也可以安排顾问进一步沟通。方便留下手机号与公司名称吗？', time: '11:53' }
    ]
  },
  {
    id: 2,
    name: 'playground-28526b64 · pg_959',
    short: 'P9',
    time: '14:28',
    status: 'ai',
    preview: '您好！请问您是想了解帆软的哪方面内容？',
    source: '博客文章',
    location: '杭州',
    device: 'Windows · Edge',
    visits: 2,
    tags: ['初次访问'],
    messages: [
      { from: 'visitor', text: 'FineReport 和 FineBI 有什么区别？', time: '14:26' },
      { from: 'ai', text: '简单来说，FineReport 更擅长复杂报表、填报与打印；FineBI 更偏向业务人员自助分析和可视化探索。您更关注固定报表建设，还是灵活的数据分析呢？', time: '14:28' }
    ]
  },
  {
    id: 3,
    name: 'events-fanruan · visitor_813',
    short: 'V8',
    time: '昨天',
    status: 'ai',
    preview: '个人试用版是否支持多人同时访问？',
    source: '活动落地页',
    location: '深圳',
    device: 'iPhone · Safari',
    visits: 6,
    tags: ['试用咨询'],
    messages: [
      { from: 'visitor', text: '个人试用版是否支持多人同时访问？', time: '昨天 18:22' },
      { from: 'ai', text: '个人试用版包含完整功能，但有并发限制，适合个人学习与验证。若用于团队协作或生产环境，建议申请企业试用。', time: '昨天 18:22' }
    ]
  }
]

const leads = [
  ['张先生', '星云制造集团', '138****5721', '集团经营分析', '高意向', '今天 11:56'],
  ['王女士', '云图科技', 'wang@yun*****.com', 'BI 产品选型', '跟进中', '今天 10:34'],
  ['陈经理', '远航零售', '186****0943', '门店数据分析', '高意向', '昨天 16:20'],
  ['刘老师', '智源教育', 'liu@zhi*****.cn', '教育行业方案', '待识别', '昨天 09:12'],
  ['匿名访客', '—', '未获取', 'FineReport 试用', '培育中', '11 月 8 日']
]

const qaItems = [
  ['FineReport 和 FineBI 的主要区别是什么？', 'FineReport 侧重固定格式的复杂报表开发，面向 IT 人员；FineBI 侧重灵活的自助数据分析，面向业务人员。', '已命中知识库'],
  ['个人试用版是否支持多人同时访问？', '个人试用版包含完整功能，但有并发限制。用于团队协作时建议申请企业试用。', 'AI 已优化'],
  ['是否支持国产数据库和信创环境？', '支持主流国产数据库、操作系统与芯片环境，可根据具体技术栈提供适配清单。', '待人工确认'],
  ['如何申请制造行业案例资料？', '留下公司、姓名与联系方式后，行业顾问会发送对应案例并提供进一步咨询。', '已命中知识库']
]

const state = {
  route: 'conversations',
  profileOpen: false,
  company: '帆软软件',
  conversationMode: 'all',
  activeConversation: 1,
  takeover: false,
  agentSection: 'overview',
  agentTemplate: '售前顾问',
  capabilities: { collect: true, human: true, popup: true, event: false },
  published: false,
  dirty: false,
  debugOpen: false,
  debugMessages: [{ from: 'ai', text: '你好，我是 AI 接待。可以输入一个访客问题来测试当前配置。' }],
  settingsSection: 'workspace',
  onboardingStep: localStorage.getItem('xiguan-onboarding') ? null : 0,
  onboarding: {
    website: 'https://www.example.com',
    goal: '售前获客与产品咨询',
    capabilities: ['信息收集', '人工协作', '主动弹窗'],
    color: '#13795b'
  },
  modal: null
}

const pageMeta = {
  conversations: ['会话运营', '实时接待与人工协作'],
  leads: ['访客线索', '从会话中识别高意向客户'],
  qna: ['Q&A 洞察', '发现访客最关心的问题'],
  agent: ['智能体管理', 'AI 接待'],
  enterprise: ['企业管理', state.company]
}

function toast(message, type = 'success') {
  const node = document.createElement('div')
  node.className = `toast ${type}`
  node.innerHTML = `${icon(type === 'success' ? 'check' : 'bell')}<span>${message}</span>`
  $('#toast-root').appendChild(node)
  setTimeout(() => node.remove(), 2600)
}

function navItem(route, label, iconName, count = '') {
  return `<button class="nav-item ${state.route === route ? 'active' : ''}" data-route="${route}">${icon(iconName)}<span>${label}</span>${count ? `<span class="count">${count}</span>` : ''}</button>`
}

function renderProfileMenu() {
  return `<div class="profile-menu">
    <div class="profile-menu-head"><strong>特尼格尔</strong><span>phenex@fanruan.com</span></div>
    <div class="company-list">
      ${['帆软软件', '星海体验企业'].map(name => `<button class="menu-item" data-company="${name}">${icon('building')}<span>${name}</span>${state.company === name ? `<span class="right">${icon('check')}</span>` : ''}</button>`).join('')}
    </div>
    <button class="menu-item" data-action="open-personal">${icon('settings')}<span>个人设置</span></button>
    <button class="menu-item" data-route="enterprise">${icon('building')}<span>企业管理</span></button>
    <button class="menu-item" data-action="restart-onboarding">${icon('spark')}<span>重新体验创建引导</span></button>
    <button class="menu-item danger" data-action="logout">${icon('external')}<span>退出登录</span></button>
  </div>`
}

function renderApp() {
  const app = $('#app')
  // 重新渲染时保留标记了 data-keep-scroll 的滚动区域位置（智能体搭建页的长表单需要）
  const scrolls = [...document.querySelectorAll('[data-keep-scroll]')].map(el => [el.dataset.keepScroll, el.scrollTop])
  app.innerHTML = `${renderRoute()}${renderOverlays()}`
  scrolls.forEach(([key, top]) => { const el = document.querySelector(`[data-keep-scroll="${key}"]`); if (el) el.scrollTop = top })
  scrollChatBottom()
}

function renderRoute() {
  if (['conversations', 'leads', 'qna'].includes(state.route)) return renderOperationsFrame()
  if (state.route === 'agent') return renderAgent()
  return renderEnterprise()
}

function renderOperationsFrame() {
  return `<div class="operations-page">
    <header class="workspace-header">
      <div class="workspace-name">吸管 · AI 接待</div>
      <div class="tabs">
        <button class="tab ${state.route === 'conversations' ? 'active' : ''}" data-route="conversations">信息</button>
        <button class="tab ${state.route === 'leads' ? 'active' : ''}" data-route="leads">线索</button>
        <button class="tab ${state.route === 'qna' ? 'active' : ''}" data-route="qna">Q&A</button>
      </div>
      <div></div>
    </header>
    ${renderOperationsContent(state.route)}
  </div>`
}

function renderOperationsContent(section, embedded = false) {
  if (section === 'conversations') return renderConversations(embedded)
  if (section === 'leads') return renderLeads()
  return renderQna()
}

function renderContextProfile() {
  return `<div class="context-profile">
    ${state.profileOpen ? renderProfileMenu() : ''}
    <button class="profile-trigger" data-action="toggle-profile"><div class="avatar">特</div><div class="profile-copy"><strong>特尼格尔</strong><span>${state.company}</span></div>${icon('settings')}</button>
  </div>`
}

function filteredConversations() {
  if (state.conversationMode === 'all') return conversations
  return conversations.filter(item => item.status === state.conversationMode)
}

function renderConversations(embedded = false) {
  const current = conversations.find(item => item.id === state.activeConversation) || conversations[0]
  return `<div class="split-shell">
    <section class="conversation-list">
      <div class="context-agent"><span>智能体</span><button class="context-agent-button">${icon('spark')} AI 接待的 agent</button></div>
      <div class="list-head">
        <div class="list-head-row"><strong>全部会话</strong><span class="badge green"><span class="dot"></span>在线</span></div>
        <div class="segmented">
          ${[['all','全部'],['ai','AI'],['human','人工']].map(([key,label]) => `<button class="${state.conversationMode === key ? 'active' : ''}" data-conversation-mode="${key}">${label}</button>`).join('')}
        </div>
        <div class="search" style="margin-top:10px">${icon('search')}<input placeholder="搜索访客或会话内容" /></div>
      </div>
      <div class="conversation-scroll">${filteredConversations().map(item => `<button class="conversation-item ${item.id === current.id ? 'active' : ''}" data-conversation="${item.id}">
        <div class="row"><strong>${item.name}</strong><time>${item.time}</time></div>
        <p>${item.preview}</p><div class="tag-row"><span class="tiny-tag">默认智能体</span><span class="tiny-tag ${item.status}">${item.status === 'ai' ? '● AI' : '● 人工中'}</span></div>
      </button>`).join('')}</div>
      ${embedded ? '' : `<div class="context-bottom"><button class="context-manage" data-route="agent">${icon('grid')} 智能体管理</button>${renderContextProfile()}</div>`}
    </section>
    <section class="chat-pane">
      <div class="chat-head"><div class="chat-user"><div class="avatar">${current.short}</div><div><strong>${current.name}</strong><span>最近活跃 · ${current.time}</span></div></div>
        <div>${state.takeover ? `<button class="btn small" data-action="return-ai">交还 AI</button>` : `<button class="btn small primary" data-action="takeover">人工接管</button>`}</div></div>
      <div class="chat-stream" id="chat-stream"><div class="time-divider">今天 · 访客从 ${current.source} 进入</div>
        ${current.messages.map(message => renderMessage(message)).join('')}
      </div>
      <div class="chat-compose">
        <div class="mode-banner">${icon(state.takeover ? 'users' : 'spark')} ${state.takeover ? '正在以人工身份回复 · AI 已暂停自动发送' : 'AI 正在接待 · 可随时人工接管'}</div>
        <div class="compose-box"><textarea id="message-input" placeholder="${state.takeover ? '输入回复，Enter 发送' : '请先点击「人工接管」后回复'}" ${state.takeover ? '' : 'disabled'}></textarea>
          <div class="compose-actions"><span>Enter 发送 · Shift+Enter 换行</span><button class="btn small primary" data-action="send-message" ${state.takeover ? '' : 'disabled'}>${icon('send')} 发送</button></div></div>
      </div>
    </section>
    <aside class="visitor-pane">
      <div class="visitor-head">访客与意图</div>
      <div class="visitor-section"><h4>访客标识</h4><dl class="meta-grid"><dt>访客 ID</dt><dd>${current.name}</dd><dt>来源</dt><dd>${current.source}</dd><dt>地区</dt><dd>${current.location}</dd><dt>设备</dt><dd>${current.device}</dd><dt>访问次数</dt><dd>${current.visits} 次</dd></dl></div>
      <div class="visitor-section"><h4>AI 识别</h4><div class="tag-row">${current.tags.map(tag => `<span class="badge green">${tag}</span>`).join('')}</div></div>
      <div class="visitor-section"><h4>质量判断</h4><label class="quality-check"><input type="checkbox" /> 技术回答正确</label><label class="quality-check"><input type="checkbox" /> 存在幻觉</label><textarea class="note-box" placeholder="添加内部备注（访客不可见）"></textarea><button class="btn small" style="width:100%;margin-top:8px" data-action="save-note">保存判断</button></div>
      <div class="visitor-section"><button class="btn small ghost" data-action="copy-id">${icon('code')} 复制会话 ID</button><button class="btn small danger" style="margin-top:8px;width:100%">隐私删除</button></div>
    </aside>
  </div>`
}

function renderMessage(message) {
  const label = message.from === 'visitor' ? '访客' : message.from === 'human' ? '人工坐席' : 'AI 接待'
  return `<div class="message ${message.from}">${message.from !== 'visitor' ? `<div class="avatar ${message.from === 'ai' ? 'agent' : ''}">${message.from === 'ai' ? 'AI' : '特'}</div>` : ''}<div class="bubble">${message.text}<div class="message-meta"><span>${label}</span><span>${message.time}</span></div></div>${message.from === 'visitor' ? `<div class="avatar">${label.slice(0,1)}</div>` : ''}</div>`
}

function renderLeads() {
  return `<div class="content"><div class="data-page">
    <div class="page-head"><div><h2>访客线索</h2><p>AI 从会话中自动识别和补全的潜在客户</p></div><div><button class="btn">${icon('external')} 导出</button> <button class="btn primary" data-action="add-lead">${icon('plus')} 新建线索</button></div></div>
    <div class="stat-grid">${[['本周新增','38','↑ 18.7%'],['高意向线索','12','↑ 4 位'],['联系方式获取率','64%','↑ 8.2%'],['人工跟进中','9','3 位今日待办']].map(x => `<div class="card stat-card"><div class="label"><span>${x[0]}</span>${icon('arrow')}</div><div class="value">${x[1]}</div><div class="trend">${x[2]}</div></div>`).join('')}</div>
    <div class="card filter-bar"><div class="search" style="width:240px">${icon('search')}<input placeholder="搜索姓名、公司或联系方式" /></div><select class="select"><option>全部意向</option><option>高意向</option><option>跟进中</option></select><select class="select"><option>全部来源</option><option>官网产品页</option><option>活动落地页</option></select><button class="btn icon-btn">${icon('filter')}</button></div>
    <div class="card table-wrap"><table class="data-table"><thead><tr><th>联系人</th><th>联系方式</th><th>需求 / 用途</th><th>状态</th><th>最近互动</th><th></th></tr></thead><tbody>
      ${leads.map((lead,index) => `<tr><td><div class="contact-cell"><div class="avatar">${lead[0][0]}</div><div><strong>${lead[0]}</strong><span>${lead[1]}</span></div></div></td><td>${lead[2]}</td><td>${lead[3]}</td><td><span class="badge ${lead[4] === '高意向' ? 'orange' : lead[4] === '跟进中' ? 'blue' : 'gray'}">${lead[4]}</span></td><td>${lead[5]}</td><td><button class="btn icon-btn small" data-lead="${index}">${icon('chevron')}</button></td></tr>`).join('')}
    </tbody></table></div>
  </div></div>`
}

function renderQna() {
  return `<div class="content"><div class="data-page"><div class="page-head"><div><h2>Q&A 洞察</h2><p>了解访客问题分布，并持续优化 AI 的回答质量</p></div><button class="btn primary" data-action="add-qna">${icon('plus')} 添加标准问答</button></div>
    <div class="stat-grid">${[['本周问题','126','↑ 21%'],['知识命中率','83%','↑ 6.4%'],['转人工率','11%','↓ 2.1%'],['待人工确认','7','需要处理']].map(x => `<div class="card stat-card"><div class="label"><span>${x[0]}</span>${icon('spark')}</div><div class="value">${x[1]}</div><div class="trend">${x[2]}</div></div>`).join('')}</div>
    <div class="card filter-bar"><div class="search" style="flex:1">${icon('search')}<input placeholder="搜索问题或答案" /></div><select class="select"><option>全部状态</option><option>待人工确认</option><option>已命中知识库</option></select><select class="select"><option>最近 7 天</option><option>最近 30 天</option></select></div>
    <div class="qna-list">${qaItems.map((item,index) => `<div class="card qna-card"><div class="qna-top"><h3>${item[0]}</h3><div><span class="badge ${item[2] === '待人工确认' ? 'orange' : 'green'}">${item[2]}</span><button class="btn icon-btn small" data-qna="${index}">${icon('more')}</button></div></div><p>${item[1]}</p></div>`).join('')}</div>
  </div></div>`
}

const agentNavItems = [
  ['overview','概览','grid'],
  ['prompt','角色与提示词','bot'],
  ['capabilities','能力','plug'],
  ['knowledge','知识库','book'],
  ['appearance','外观','sliders'],
  ['channels','渠道','link']
]

const agentOperationItems = [
  ['conversations','会话','chat'],
  ['leads','线索','users'],
  ['qna','Q&A','spark']
]

function isAgentOperationSection() {
  return agentOperationItems.some(item => item[0] === state.agentSection)
}

function renderAgent() {
  const operationSection = isAgentOperationSection()
  const configSection = isConfigSection()
  const overviewSection = state.agentSection === 'overview'
  const showDebug = overviewSection || (!operationSection && !configSection && state.debugOpen)
  return `<div class="agent-layout ${showDebug ? 'debug-open' : ''} ${operationSection ? 'operation-section' : ''} ${configSection ? 'config-section' : ''}">
    <aside class="agent-nav"><div class="agent-nav-title"><button class="btn icon-btn ghost" data-route="conversations">‹</button><strong>智能体管理</strong></div>
      <button class="nav-item ${state.agentSection === 'overview' ? 'active' : ''}" data-agent-section="overview">${icon('grid')}<span>概览</span></button>
      <div class="agent-nav-divider"></div>
      <button class="nav-item ${state.agentSection === 'prompt' ? 'active' : ''}" data-agent-section="prompt">${icon('bot')}<span>角色与提示词</span></button>
      ${agentNavItems.filter(item => !['overview','prompt'].includes(item[0])).map(item => `<button class="nav-item ${state.agentSection === item[0] ? 'active' : ''}" data-agent-section="${item[0]}">${icon(item[2])}<span>${item[1]}</span></button>`).join('')}
      <div class="agent-nav-divider"></div>
      ${agentOperationItems.map(item => `<button class="nav-item ${state.agentSection === item[0] ? 'active' : ''}" data-agent-section="${item[0]}">${icon(item[2])}<span>${item[1]}</span></button>`).join('')}
      <div class="agent-nav-spacer"></div>${renderContextProfile()}
    </aside>
    ${operationSection || configSection ? '' : `<header class="editor-top"><div><strong style="font-size:13px">AI 接待</strong> ${state.dirty ? '<span class="badge orange">未保存</span>' : state.published ? '<span class="badge green">已上线</span>' : '<span class="badge gray">草稿</span>'}</div>
      <div class="editor-actions"><button class="btn small" data-action="save-agent">保存</button><button class="btn small primary" data-action="publish-agent">${state.published ? '更新上线' : '发布上线'} ${icon('chevron')}</button></div></header>
    `}
    <section class="agent-editor ${operationSection ? 'agent-operation-editor' : ''} ${configSection ? 'agent-config-editor' : ''}"><div class="editor-body">${renderAgentSection()}</div></section>
    ${showDebug ? `<aside class="preview-pane">${renderPreview(!overviewSection)}</aside>` : ''}
  </div>`
}

function renderAgentSection() {
  if (isAgentOperationSection()) return renderOperationsContent(state.agentSection, true)
  if (state.agentSection === 'overview') return renderAgentOverview()
  if (state.agentSection === 'prompt') return renderPersonaConfig()
  if (state.agentSection === 'capabilities') return renderCapabilitiesConfig()
  if (state.agentSection === 'knowledge') return renderKnowledgeConfig()
  if (state.agentSection === 'channels') return renderChannels()
  return renderAppearanceConfig()
}

function renderAgentOverview() {
  const enabled = Object.values(state.capabilities).filter(Boolean).length
  return `<div class="card overview-hero"><div class="overview-profile"><div class="avatar agent">AI</div><div><h2>AI 接待</h2><p>面向官网访客的售前顾问 · 最后编辑于刚刚</p></div></div></div>
    <div class="card summary-card"><div class="summary-head"><h3>角色与提示词</h3><button class="btn small ghost" data-agent-section="prompt">去编辑 ${icon('arrow')}</button></div><div class="summary-body"><p style="margin:0;color:var(--muted);font-size:11px;line-height:1.7">你是帆软官网的真人接待，像一位专业、热情的售前顾问。优先理解访客的行业和场景，再提供相关方案与案例。</p></div></div>
    <div class="card summary-card"><div class="summary-head"><h3>能力</h3><button class="btn small ghost" data-agent-section="capabilities">去编辑 ${icon('arrow')}</button></div><div class="summary-body"><div class="summary-grid"><div class="summary-chip"><strong>${enabled} 项已启用</strong><span>信息收集、人工协作等</span></div><div class="summary-chip"><strong>3 个收集字段</strong><span>姓名、公司、联系方式</span></div><div class="summary-chip"><strong>自动接待</strong><span>全天候运行</span></div></div></div></div>
    <div class="card summary-card"><div class="summary-head"><h3>知识库</h3><button class="btn small ghost" data-agent-section="knowledge">去编辑 ${icon('arrow')}</button></div><div class="summary-body"><div class="summary-grid"><div class="summary-chip"><strong>5 个知识源</strong><span>文档、网页和 Q&A</span></div><div class="summary-chip"><strong>54 条知识</strong><span>结构化率 100%</span></div><div class="summary-chip"><strong>83% 命中率</strong><span>最近 7 天</span></div></div></div></div>
    <div class="card summary-card"><div class="summary-head"><h3>渠道与外观</h3><button class="btn small ghost" data-agent-section="appearance">去编辑 ${icon('arrow')}</button></div><div class="summary-body"><div class="summary-grid"><div class="summary-chip"><strong>2 个网站</strong><span>官网、活动站点</span></div><div class="summary-chip"><strong>品牌色</strong><span>${state.onboarding.color}</span></div><div class="summary-chip"><strong>桌面端入口</strong><span>气泡 + 侧边窗口</span></div></div></div></div>`
}

function renderEditorHeading(title, description) {
  return `<div class="editor-section-head"><div><h2 class="editor-title">${title}</h2><p class="editor-sub">${description}</p></div><button class="btn" data-action="open-debug">调试</button></div>`
}

function renderChannels() {
  return `${renderEditorHeading('渠道', '将 AI 接待部署到官网、活动页或其他业务入口。')}
    <div class="card channel-card"><div class="channel-head"><strong>网站入口</strong><span class="badge green">已启用</span></div><div class="field"><label>允许域名（逗号分隔）</label><input class="input" value="www.fanruan.com, events.fanruan.com" data-dirty="true" /></div><div class="field"><label>站点 ID / 公开 Key</label><input class="input" value="site_d78wTQ1sBF9nRNo0HkgGy1fK2KgwroHmky8WRfF" readonly /></div><div class="field"><label>部署代码</label><div class="code-block">&lt;script src=&quot;https://test.xiguan.cn/presales/widget.js&quot; data-site-key=&quot;site_d78wTQ1sBF9nRNo0HkgGy1fK2KgwroHmky8WRfF&quot; defer&gt;&lt;/script&gt;</div><button class="btn small" style="margin-top:8px" data-action="copy-code">${icon('code')} 复制代码</button></div></div>
    <div class="card channel-card"><div class="channel-head"><strong>IM 工具</strong><span class="badge gray">未连接</span></div><p style="font-size:11px;color:var(--muted);line-height:1.6">连接企业微信、飞书或钉钉，将高意向访客实时推送给销售团队。</p><button class="btn small" data-action="connect-im">连接 IM</button></div>
    <div class="card channel-card"><div class="channel-head"><strong>事件触发</strong><span class="badge blue">2 条规则</span></div><p style="font-size:11px;color:var(--muted)">监听价格页停留超过 30 秒、连续访问产品页 3 次。</p><button class="btn small">管理规则</button></div>`
}

function renderPreview(closeable = false) {
  return `<div class="embedded-debug">
    <div class="embedded-debug-head"><div><strong>调试 AI 接待</strong><span>基于当前草稿，不影响线上访客</span></div>${closeable ? `<button class="btn icon-btn ghost" data-action="close-debug">${icon('close')}</button>` : ''}</div>
    <div class="embedded-debug-body">${state.debugMessages.map(message => `<div class="debug-message ${message.from}"><div class="bubble">${message.text}</div></div>`).join('')}</div>
    <div class="debug-compose"><input id="debug-input" class="input" placeholder="输入一个访客问题..." /><button class="btn primary icon-btn" data-action="debug-send">${icon('send')}</button></div>
  </div>`
}

function renderEnterprise() {
  const personal = ['personal', 'security'].includes(state.settingsSection)
  const sections = personal ? [['personal','个人信息','grid'],['security','账号与安全','shield']] : [['workspace','工作区设置','settings'],['members','成员管理','users']]
  return `<div class="settings-page"><header class="settings-header"><button class="btn icon-btn ghost" data-route="conversations">‹</button><strong>${personal ? '个人设置' : '企业管理'}</strong></header><div class="settings-layout"><aside class="settings-nav">${sections.map(item => `<button class="nav-item ${state.settingsSection === item[0] ? 'active' : ''}" data-settings-section="${item[0]}">${icon(item[2])}<span>${item[1]}</span></button>`).join('')}</aside><section class="settings-main">${renderSettingsSection()}</section></div></div>`
}

function renderSettingsSection() {
  if (state.settingsSection === 'workspace') return `<h2>工作区设置</h2><p>管理企业基本信息、套餐和当前账号权限。</p><div class="settings-grid"><div class="card form-card"><h3>基本信息</h3><div class="field"><label>工作区名称</label><input class="input" value="${state.company}" /></div><div class="field"><label>工作区 ID</label><input class="input" value="aa2dca48-78f7-46cb-8ee7-..." readonly /></div><button class="btn small primary" data-action="save-workspace">保存名称</button></div><div class="card plan-card"><span class="badge blue">Enterprise</span><h3 style="margin:13px 0 4px">套餐与配额</h3><p style="font-size:11px;color:var(--muted)">当前对话 Token</p><div class="usage"><span style="width:62%"></span></div><div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted)"><span>已使用 62%</span><span>62,000 / 100,000</span></div><p style="font-size:11px;color:var(--muted);margin-top:20px">到期时间：2027/08/17</p></div></div><div class="card form-card" style="margin-top:14px"><h3>我的权限</h3><p>你在当前工作区拥有以下角色和能力。</p><div class="role-list"><div class="role-row"><div class="cap-icon">${icon('shield')}</div><div class="copy"><strong>创建者 · 企业管理员</strong><span>管理工作区、成员、AI 接待与全部数据</span></div><span class="badge orange">最高权限</span></div></div></div>`
  if (state.settingsSection === 'members') return `<div class="page-head"><div><h2>成员管理</h2><p>邀请团队成员并分配角色权限。</p></div><button class="btn primary" data-action="invite-member">${icon('plus')} 邀请成员</button></div><div class="card table-wrap"><table class="data-table"><thead><tr><th>成员</th><th>角色</th><th>状态</th><th>加入时间</th><th></th></tr></thead><tbody>${[['特尼格尔','创建者','正常','2026/08/28'],['林安','运营管理员','正常','2026/09/12'],['周明','销售坐席','正常','2026/10/02'],['demo@fanruan.com','查看者','邀请中','—']].map(m => `<tr><td><div class="contact-cell"><div class="avatar">${m[0][0]}</div><div><strong>${m[0]}</strong><span>${m[0].includes('@') ? m[0] : `${m[0].toLowerCase()}@fanruan.com`}</span></div></div></td><td>${m[1]}</td><td><span class="badge ${m[2] === '正常' ? 'green' : 'orange'}">${m[2]}</span></td><td>${m[3]}</td><td><button class="btn icon-btn small">${icon('more')}</button></td></tr>`).join('')}</tbody></table></div>`
  if (state.settingsSection === 'billing') return `<h2>套餐与用量</h2><p>查看本周期用量、限额与续费信息。</p><div class="settings-grid"><div class="card plan-card"><span class="badge blue">Enterprise</span><h3>企业旗舰版</h3><p style="font-size:11px;color:var(--muted)">支持 10 个智能体、50 名成员与高级数据分析。</p><button class="btn small">查看合同</button></div><div class="card form-card"><h3>本周期用量</h3>${[['对话 Token',62],['知识库容量',38],['成员席位',16]].map(x => `<p style="font-size:11px;margin:12px 0 5px">${x[0]}</p><div class="usage"><span style="width:${x[1]}%"></span></div>`).join('')}</div></div>`
  if (state.settingsSection === 'personal') return `<h2>个人设置</h2><p>管理你在吸管中的个人资料与偏好。</p><div class="card form-card" style="max-width:640px"><div style="display:flex;align-items:center;gap:13px;margin-bottom:20px"><div class="avatar" style="width:54px;height:54px">特</div><button class="btn small">更换头像</button></div><div class="field"><label>姓名</label><input class="input" value="特尼格尔" /></div><div class="field"><label>邮箱</label><input class="input" value="phenex@fanruan.com" readonly /></div><div class="field"><label>语言</label><select class="select"><option>简体中文</option><option>English</option></select></div><button class="btn primary" data-action="save-personal">保存更改</button></div>`
  return `<h2>账号与安全</h2><p>管理登录方式、密码和安全记录。</p><div class="card form-card" style="max-width:680px"><h3>登录密码</h3><p>上次修改于 2026 年 8 月 28 日</p><button class="btn small">修改密码</button></div><div class="card form-card" style="max-width:680px"><h3>登录设备</h3><div class="role-row"><div class="cap-icon">${icon('shield')}</div><div class="copy"><strong>Mac mini · 当前设备</strong><span>California, US · 刚刚活跃</span></div><span class="badge green">当前</span></div></div>`
}

function renderOverlays() {
  return `${state.onboardingStep !== null ? renderOnboarding() : ''}${state.modal ? renderModal() : ''}`
}

function renderOnboarding() {
  const step = state.onboardingStep
  const titles = ['创建你的 AI 接待', '连接企业官网', '选择角色与能力', '设置品牌外观', '准备完成']
  if (step === 0) return `<div class="modal-backdrop"><div class="modal wide"><div class="welcome-panel"><div class="welcome-copy"><span class="eyebrow">Welcome to 吸管</span><h1>让官网访客，遇见真正懂业务的 AI</h1><p>只需要几分钟，完成从角色设定、知识连接到网站发布的最小闭环。</p><button class="btn primary" data-action="onboarding-next">开始创建 ${icon('arrow')}</button></div><div class="welcome-visual"><div class="mini-browser"><div class="fake-nav"></div><div class="mini-agent"><strong style="font-size:11px">AI 接待</strong><div class="bubble-line"></div><div class="bubble-line" style="width:72%"></div><div class="widget-quick"><span>产品咨询</span><span>获取案例</span></div></div></div></div></div></div></div>`
  if (step === 4) return `<div class="modal-backdrop"><div class="modal"><div class="finish-view"><div class="finish-check">${icon('check')}</div><h2>AI 接待已创建</h2><p>我们已根据你的选择生成一份可编辑草稿。接下来可以继续调试，确认无误后再发布到官网。</p><div class="finish-list"><div class="finish-item">${icon('link')} 已连接 ${state.onboarding.website}</div><div class="finish-item">${icon('spark')} 角色：${state.onboarding.goal}</div><div class="finish-item">${icon('settings')} ${state.onboarding.capabilities.length} 项能力已启用</div></div><button class="btn primary" style="margin-top:24px" data-action="finish-onboarding">进入智能体管理 ${icon('arrow')}</button></div></div></div>`
  return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="badge green">步骤 ${step} / 3</span><h2 style="margin-top:10px">${titles[step]}</h2><p>${step === 1 ? 'AI 会读取公开页面，帮助你快速生成业务背景。' : step === 2 ? '只需要选择，详细规则可以稍后再配置。' : '让 AI 接待自然地融入你的品牌。'}</p></div><button class="btn icon-btn ghost" data-action="close-onboarding">${icon('close')}</button></div><div class="modal-body">${renderOnboardingStep()}</div><div class="modal-foot"><div class="stepper">${[1,2,3].map(n => `<i class="step-dot ${n === step ? 'active' : ''}"></i>`).join('')}</div><div><button class="btn" data-action="onboarding-back">上一步</button> <button class="btn primary" data-action="onboarding-next">${step === 3 ? '创建 AI 接待' : '继续'} ${icon('arrow')}</button></div></div></div></div>`
}

function renderOnboardingStep() {
  if (state.onboardingStep === 1) return `<div class="field"><label>企业官网</label><input id="onboarding-website" class="input" value="${state.onboarding.website}" placeholder="https://www.example.com" /><small>原型不会真的抓取网站，只用于模拟配置流程。</small></div><div class="card" style="padding:14px;background:var(--canvas)"><strong style="font-size:12px">我们会自动完成</strong><div class="finish-list" style="margin-top:10px"><div class="finish-item">${icon('check')} 识别公司与产品介绍</div><div class="finish-item">${icon('check')} 生成首版业务背景</div><div class="finish-item">${icon('check')} 提取可用公开页面</div></div></div>`
  if (state.onboardingStep === 2) return `<div class="field"><label>主要目标</label><div class="onboarding-cols">${['售前获客与产品咨询','客户服务与问题解答','活动报名与资料领取','内部员工知识助手'].map(goal => `<button class="choice-card ${state.onboarding.goal === goal ? 'selected' : ''}" data-onboarding-goal="${goal}"><span class="choice-check">${icon('check')}</span><strong>${goal}</strong><p>系统会据此生成适合的角色和行为策略。</p></button>`).join('')}</div></div><div class="field"><label>启用能力</label><div class="onboarding-cols">${['信息收集','人工协作','主动弹窗','事件触发'].map(cap => `<button class="choice-card ${state.onboarding.capabilities.includes(cap) ? 'selected' : ''}" data-onboarding-capability="${cap}"><span class="choice-check">${icon('check')}</span><strong>${cap}</strong><p>${cap === '信息收集' ? '在合适时机询问联系方式。' : cap === '人工协作' ? '高意向时提醒销售接管。' : cap === '主动弹窗' ? '根据访客行为主动问候。' : '连接表单和业务系统。'}</p></button>`).join('')}</div></div>`
  const colors = ['#13795b','#167596','#855d42','#6650a4','#d36643']
  return `<div class="field"><label>助手名称</label><input class="input" value="AI 接待" /></div><div class="field"><label>品牌主色</label><div class="color-row">${colors.map(color => `<button class="color-dot ${state.onboarding.color === color ? 'selected' : ''}" style="background:${color}" data-color="${color}"></button>`).join('')}</div></div><div class="field"><label>欢迎语</label><textarea class="textarea">Hi，我是 AI 接待，可以描述您的需求～</textarea></div><div class="chat-widget" style="position:relative;right:auto;bottom:auto;width:100%;box-shadow:none"><div class="widget-head" style="background:${state.onboarding.color}"><div class="avatar">AI</div><div><strong>AI 接待</strong><span>在线 · 通常立即回复</span></div></div><div class="widget-body" style="height:110px"><div class="widget-bubble">Hi，我是 AI 接待，可以描述您的需求～</div></div></div>`
}

function renderDebug() {
  return `<div class="scrim" data-action="close-debug"></div><aside class="overlay-panel"><div class="overlay-head"><div><strong>调试 AI 接待</strong><div style="font-size:10px;color:var(--muted);margin-top:2px">基于当前草稿，不影响线上访客</div></div><button class="btn icon-btn ghost" data-action="close-debug">${icon('close')}</button></div><div class="overlay-body">${state.debugMessages.map(message => `<div class="debug-message ${message.from}"><div class="bubble">${message.text}</div></div>`).join('')}</div><div class="debug-compose"><input id="debug-input" class="input" placeholder="输入一个访客问题..." /><button class="btn primary icon-btn" data-action="debug-send">${icon('send')}</button></div></aside>`
}

function renderModal() {
  if (state.modal === 'invite') return `<div class="modal-backdrop" data-action="close-modal"><div class="modal" style="width:500px" data-modal-card><div class="modal-head"><div><h2>邀请成员</h2><p>成员将通过邮件收到加入工作区的邀请。</p></div><button class="btn icon-btn ghost" data-action="close-modal">${icon('close')}</button></div><div class="modal-body"><div class="field"><label>邮箱地址</label><input id="invite-email" class="input" placeholder="name@company.com" /></div><div class="field"><label>角色</label><select class="select"><option>销售坐席</option><option>运营管理员</option><option>查看者</option></select></div></div><div class="modal-foot"><span></span><button class="btn primary" data-action="submit-invite">发送邀请</button></div></div></div>`
  if (state.modal === 'capability') return `<div class="modal-backdrop" data-action="close-modal"><div class="modal" data-modal-card><div class="modal-head"><div><h2>配置「信息收集」</h2><p>设置 AI 可以收集和联系表单中显示的字段。</p></div><button class="btn icon-btn ghost" data-action="close-modal">${icon('close')}</button></div><div class="modal-body"><div class="field"><label>允许收集的字段</label><div class="onboarding-cols">${['姓名','组织 / 公司','手机号','微信号','邮箱','需求 / 用途'].map((field,index) => `<label class="choice-card ${[0,1,2,4].includes(index) ? 'selected' : ''}"><input type="checkbox" ${[0,1,2,4].includes(index) ? 'checked' : ''} style="display:none" /><strong>${field}</strong><p>可设置是否在联系表单中显示与必填。</p></label>`).join('')}</div></div><div class="field"><label>能力说明（可选）</label><textarea class="textarea" placeholder="例如：仅在用户主动索取资料后邀请填写。"></textarea></div></div><div class="modal-foot"><span></span><button class="btn primary" data-action="save-capability">保存配置</button></div></div></div>`
  return ''
}

function scrollChatBottom() {
  requestAnimationFrame(() => {
    const stream = $('#chat-stream')
    if (stream) stream.scrollTop = stream.scrollHeight
  })
}

function routeTo(route) {
  state.route = route
  state.profileOpen = false
  if (route === 'agent') state.agentSection ||= 'overview'
  renderApp()
}

document.addEventListener('click', event => {
  const route = event.target.closest('[data-route]')
  if (route) return routeTo(route.dataset.route)

  if (handleConfigClick(event)) return

  const conversation = event.target.closest('[data-conversation]')
  if (conversation) {
    state.activeConversation = Number(conversation.dataset.conversation)
    state.takeover = conversations.find(item => item.id === state.activeConversation).status === 'human'
    return renderApp()
  }

  const mode = event.target.closest('[data-conversation-mode]')
  if (mode) {
    state.conversationMode = mode.dataset.conversationMode
    const visible = filteredConversations()
    if (!visible.find(item => item.id === state.activeConversation) && visible[0]) state.activeConversation = visible[0].id
    return renderApp()
  }

  const agentSection = event.target.closest('[data-agent-section]')
  if (agentSection) {
    state.agentSection = agentSection.dataset.agentSection
    if (state.agentSection === 'overview' || isAgentOperationSection()) state.debugOpen = false
    return renderApp()
  }

  const settingsSection = event.target.closest('[data-settings-section]')
  if (settingsSection) {
    state.settingsSection = settingsSection.dataset.settingsSection
    return renderApp()
  }

  const template = event.target.closest('[data-template]')
  if (template) {
    state.agentTemplate = template.dataset.template
    state.dirty = true
    toast(`已应用「${state.agentTemplate}」模板`)
    return renderApp()
  }

  const toggle = event.target.closest('[data-toggle-capability]')
  if (toggle) {
    const key = toggle.dataset.toggleCapability
    state.capabilities[key] = !state.capabilities[key]
    state.dirty = true
    return renderApp()
  }

  const color = event.target.closest('[data-color]')
  if (color) {
    state.onboarding.color = color.dataset.color
    state.dirty = true
    return renderApp()
  }

  const goal = event.target.closest('[data-onboarding-goal]')
  if (goal) {
    state.onboarding.goal = goal.dataset.onboardingGoal
    return renderApp()
  }

  const capability = event.target.closest('[data-onboarding-capability]')
  if (capability) {
    const value = capability.dataset.onboardingCapability
    state.onboarding.capabilities = state.onboarding.capabilities.includes(value) ? state.onboarding.capabilities.filter(item => item !== value) : [...state.onboarding.capabilities, value]
    return renderApp()
  }

  const company = event.target.closest('[data-company]')
  if (company) {
    state.company = company.dataset.company
    state.profileOpen = false
    pageMeta.enterprise[1] = state.company
    toast(`已切换到「${state.company}」`)
    return renderApp()
  }

  const action = event.target.closest('[data-action]')
  if (!action) return
  const name = action.dataset.action
  if (name === 'toggle-profile') { state.profileOpen = !state.profileOpen; return renderApp() }
  if (name === 'takeover') { state.takeover = true; conversations.find(item => item.id === state.activeConversation).status = 'human'; toast('已接管会话，AI 自动回复已暂停'); return renderApp() }
  if (name === 'return-ai') { state.takeover = false; conversations.find(item => item.id === state.activeConversation).status = 'ai'; toast('会话已交还 AI 接待'); return renderApp() }
  if (name === 'send-message') return sendMessage()
  if (name === 'save-note') return toast('质量判断已保存')
  if (name === 'copy-id') return copyText(conversations.find(item => item.id === state.activeConversation).name, '会话 ID 已复制')
  if (name === 'save-agent') { state.dirty = false; toast('草稿已保存'); return renderApp() }
  if (name === 'publish-agent') { state.published = true; state.dirty = false; toast('AI 接待已发布上线'); return renderApp() }
  if (name === 'open-debug') { state.debugOpen = true; return renderApp() }
  if (name === 'close-debug') { state.debugOpen = false; return renderApp() }
  if (name === 'debug-send') return debugSend()
  if (name === 'configure-capability') { state.modal = 'capability'; return renderApp() }
  if (name === 'save-capability') { state.modal = null; state.capabilities.collect = true; state.dirty = true; toast('能力配置已保存'); return renderApp() }
  if (name === 'copy-code') return copyText('<script src="https://test.xiguan.cn/presales/widget.js" data-site-key="site_d78w..."></script>', '部署代码已复制')
  if (name === 'connect-im') return toast('已发起企业微信连接（原型演示）')
  if (name === 'save-workspace' || name === 'save-personal') return toast('设置已保存')
  if (name === 'invite-member') { state.modal = 'invite'; return renderApp() }
  if (name === 'submit-invite') { state.modal = null; toast('邀请邮件已发送'); return renderApp() }
  if (name === 'close-modal') { if (!event.target.closest('[data-modal-card]') || event.target.closest('[data-action="close-modal"]')) { state.modal = null; renderApp() } return }
  if (name === 'onboarding-next') return onboardingNext()
  if (name === 'onboarding-back') { state.onboardingStep = Math.max(1, state.onboardingStep - 1); return renderApp() }
  if (name === 'close-onboarding') { state.onboardingStep = null; return renderApp() }
  if (name === 'finish-onboarding') { localStorage.setItem('xiguan-onboarding', 'done'); state.onboardingStep = null; state.route = 'agent'; state.agentSection = 'overview'; toast('欢迎使用吸管，AI 接待草稿已准备好'); return renderApp() }
  if (name === 'restart-onboarding') { state.profileOpen = false; state.onboardingStep = 0; return renderApp() }
  if (name === 'open-personal') { state.profileOpen = false; state.route = 'enterprise'; state.settingsSection = 'personal'; return renderApp() }
  if (name === 'logout') return toast('这是交互原型，未执行真实退出', 'info')
  if (name === 'add-lead') return toast('新建线索表单已打开（原型演示）')
  if (name === 'add-qna' || name === 'add-knowledge') return toast('添加入口已响应（原型演示）')
})

document.addEventListener('input', event => {
  if (handleConfigInput(event)) return
  if (event.target.matches('[data-dirty]')) state.dirty = true
})

document.addEventListener('change', event => {
  handleConfigChange(event)
})

document.addEventListener('keydown', event => {
  if (handleConfigKeydown(event)) return
  if (event.key !== 'Enter' || event.shiftKey) return
  if (event.target.id === 'message-input') { event.preventDefault(); sendMessage() }
  if (event.target.id === 'debug-input') { event.preventDefault(); debugSend() }
})

function sendMessage() {
  const input = $('#message-input')
  const text = input?.value.trim()
  if (!text || !state.takeover) return
  const current = conversations.find(item => item.id === state.activeConversation)
  current.messages.push({ from: 'human', text, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) })
  current.preview = text
  renderApp()
}

function debugSend() {
  const input = $('#debug-input')
  const text = input?.value.trim()
  if (!text) return
  state.debugMessages.push({ from: 'user', text })
  state.debugMessages.push({ from: 'ai', text: '根据当前知识库，FineReport 更适合复杂报表、填报与打印场景；FineBI 更适合业务人员进行灵活的自助分析。想了解您更关注哪一种使用场景？' })
  renderApp()
}

function onboardingNext() {
  if (state.onboardingStep === 1) {
    const website = $('#onboarding-website')?.value.trim()
    if (!website) return toast('请先填写企业官网', 'info')
    state.onboarding.website = website
  }
  state.onboardingStep = Math.min(4, state.onboardingStep + 1)
  renderApp()
}

async function copyText(text, message) {
  try { await navigator.clipboard.writeText(text) } catch (_) {}
  toast(message)
}

renderApp()
