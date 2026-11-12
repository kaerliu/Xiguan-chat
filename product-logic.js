const PRODUCT_LOGIC_PATH = './product-logic.md'
const PRODUCT_LOGIC_SAVE_PATH = './api/product-logic'
const LEGACY_STORAGE_KEY = 'xiguan-product-logic'

const editor = document.querySelector('#logic-editor')
const saveButton = document.querySelector('#logic-save')
const modeBadge = document.querySelector('#logic-mode')
const saveState = document.querySelector('#logic-save-state')
const count = document.querySelector('#logic-count')
const footnote = document.querySelector('#logic-footnote')

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const isLocal = window.location.protocol === 'http:' && localHosts.has(window.location.hostname)
let savedContent = ''

editor.readOnly = !isLocal
saveButton.hidden = !isLocal
modeBadge.textContent = isLocal ? '本地可编辑' : '在线只读'
modeBadge.classList.toggle('readonly', !isLocal)
footnote.textContent = isLocal
  ? '保存会直接更新仓库中的 product-logic.md；提交代码时请一并提交该文件。'
  : '内容来自当前部署版本，仅供查看；修改请在本地开发环境完成并随代码提交。'

function updateCount() {
  count.textContent = `${editor.value.length.toLocaleString('zh-CN')} 字`
}

function setSaveState(text, saved = false) {
  saveState.textContent = text
  saveState.classList.toggle('saved', saved)
}

async function loadContent() {
  try {
    const response = await fetch(`${PRODUCT_LOGIC_PATH}?v=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`读取失败（${response.status}）`)
    const repositoryContent = await response.text()
    const legacyContent = isLocal ? localStorage.getItem(LEGACY_STORAGE_KEY) : ''
    savedContent = repositoryContent
    editor.value = legacyContent || repositoryContent
    if (legacyContent && legacyContent !== repositoryContent) {
      setSaveState('检测到浏览器旧草稿，保存后将写入仓库')
      saveButton.disabled = false
    } else {
      setSaveState(isLocal ? '已加载仓库版本' : '当前部署版本', true)
      saveButton.disabled = true
    }
    updateCount()
  } catch (error) {
    editor.value = ''
    editor.placeholder = '产品逻辑内容加载失败'
    saveButton.disabled = true
    setSaveState(error.message)
    updateCount()
  }
}

async function saveContent() {
  if (!isLocal || editor.value === savedContent) return
  saveButton.disabled = true
  setSaveState('正在写入仓库文件…')
  try {
    const response = await fetch(PRODUCT_LOGIC_SAVE_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: editor.value
    })
    if (!response.ok) throw new Error(await response.text() || `保存失败（${response.status}）`)
    savedContent = editor.value
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    setSaveState(`已写入 product-logic.md · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`, true)
  } catch (error) {
    setSaveState(`${error.message}；请确认使用 npm run dev 启动`)
    saveButton.disabled = false
  }
}

editor.addEventListener('input', () => {
  updateCount()
  setSaveState(editor.value === savedContent ? '内容未修改' : '有未保存改动', editor.value === savedContent)
  saveButton.disabled = editor.value === savedContent
})

saveButton.addEventListener('click', saveContent)
document.addEventListener('keydown', event => {
  if (!isLocal || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
  event.preventDefault()
  saveContent()
})

loadContent()
