const PRODUCT_LOGIC_STORAGE_KEY = 'xiguan-product-logic'

const defaultProductLogic = `# 吸管 AI 接待 · 产品逻辑

## 1. 产品目标

让企业可以用一套清晰的配置流程，完成 AI 接待的角色定义、能力启用、知识维护、外观设置和渠道部署，并通过统一的草稿机制控制何时影响线上访客。

## 2. 页面框架

- 顶部栏代表当前智能体，而不是当前功能页，因此切换功能时始终显示「AI 接待」。
- 左侧导航负责切换功能；当前功能名称和说明放在内容区顶部。
- 概览、角色与提示词、能力、知识库、外观和渠道共用一份草稿状态。
- 保存草稿只保存在当前浏览器；发布上线后才影响访客侧体验。

## 3. 配置原则

- 角色与提示词：定义智能体如何回答以及不能做什么。
- 能力：控制智能体可以执行的动作，关闭后相关工具和提示不进入运行时。
- 知识库：提供可引用的企业资料和标准问答。
- 外观：决定访客看到的入口、对话窗口和品牌表达。
- 渠道：决定智能体部署到哪些网站或业务入口。

## 4. 草稿与发布

- 与线上一致：当前配置和已发布版本完全相同。
- 草稿已保存：本地已有保存版本，但尚未发布。
- 本机草稿有改动：当前内容还未保存，可放弃或保存。
- 发布时同时保存当前草稿，并将其设为线上版本。

## 5. 待验证问题

- 用户是否能理解「保存草稿」与「发布上线」的差异？
- 能力配置较复杂时，列表与详情之间的返回路径是否足够清晰？
- 知识库的资料状态和未答队列是否需要更强的运营提示？
`

const editor = document.querySelector('#logic-editor')
const saveButton = document.querySelector('#logic-save')
const modeBadge = document.querySelector('#logic-mode')
const saveState = document.querySelector('#logic-save-state')
const count = document.querySelector('#logic-count')

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const isLocal = window.location.protocol === 'file:' || localHosts.has(window.location.hostname) || window.location.hostname.endsWith('.local')
const storedContent = localStorage.getItem(PRODUCT_LOGIC_STORAGE_KEY)

editor.value = storedContent || defaultProductLogic
editor.readOnly = !isLocal
saveButton.disabled = !isLocal
modeBadge.textContent = isLocal ? '本地可编辑' : '线上只读'
modeBadge.classList.toggle('readonly', !isLocal)

function updateCount() {
  count.textContent = `${editor.value.length.toLocaleString('zh-CN')} 字`
}

function saveContent() {
  if (!isLocal) return
  localStorage.setItem(PRODUCT_LOGIC_STORAGE_KEY, editor.value)
  saveState.textContent = `已保存 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  saveState.classList.add('saved')
  saveButton.disabled = true
}

editor.addEventListener('input', () => {
  updateCount()
  saveState.textContent = '有未保存改动'
  saveState.classList.remove('saved')
  saveButton.disabled = false
})

saveButton.addEventListener('click', saveContent)
document.addEventListener('keydown', event => {
  if (!isLocal || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
  event.preventDefault()
  saveContent()
})

updateCount()
