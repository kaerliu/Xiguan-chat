const http = require('node:http')
const https = require('node:https')
const zlib = require('node:zlib')
const fs = require('node:fs/promises')
const path = require('node:path')

const host = '127.0.0.1'
const port = Number(process.env.PORT) || 8123
const root = __dirname
const productLogicFile = path.join(root, 'product-logic.md')
const maxProductLogicBytes = 1024 * 1024

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  response.end(body)
}

async function saveProductLogic(request, response) {
  let content = ''
  for await (const chunk of request) {
    content += chunk
    if (Buffer.byteLength(content) > maxProductLogicBytes) {
      send(response, 413, '内容超过 1 MB，无法保存。')
      return
    }
  }
  await fs.writeFile(productLogicFile, content, 'utf8')
  send(response, 200, JSON.stringify({ saved: true }), 'application/json; charset=utf-8')
}

async function serveStatic(request, response, pathname) {
  const relativePath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '')
  const filePath = path.resolve(root, relativePath)
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    send(response, 403, 'Forbidden')
    return
  }
  try {
    const content = await fs.readFile(filePath)
    const type = contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
    response.end(request.method === 'HEAD' ? undefined : content)
  } catch (error) {
    send(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not Found' : 'Server Error')
  }
}

/*
 * 页面快照：给「主动获客 · 形象引导」读真实官网用。
 * 浏览器不能跨域读别人网站的结构，很多官网也禁止被嵌进 iframe。所以由本地服务去抓网页，
 * 去掉脚本、补上资源的基准地址后原样返回；预览页用 srcdoc 把它放进同源的 iframe，
 * 这样才能识别区块、算站位。图片和样式仍从对方站点加载。
 * 只在本地服务下可用（GitHub Pages 这类静态托管没有这个接口，预览页会退回示例官网）。
 */
const snapshotMaxBytes = 5 * 1024 * 1024
const snapshotCacheMs = 5 * 60 * 1000
const snapshotCache = new Map()

function sendJson(response, status, data) {
  send(response, status, JSON.stringify(data), 'application/json; charset=utf-8')
}

function fetchRemote(target, redirects = 0) {
  return new Promise((resolve, reject) => {
    const client = target.protocol === 'https:' ? https : http
    const request = client.get(target, {
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    }, remote => {
      const status = remote.statusCode || 0
      if (status >= 300 && status < 400 && remote.headers.location) {
        remote.resume()
        if (redirects >= 5) return reject(new Error('跳转次数太多'))
        let next
        try { next = new URL(remote.headers.location, target) } catch (_) { return reject(new Error('跳转地址无效')) }
        if (!/^https?:$/.test(next.protocol)) return reject(new Error('跳转到了不支持的地址'))
        return resolve(fetchRemote(next, redirects + 1))
      }
      if (status >= 400) { remote.resume(); return reject(new Error(`对方返回了 ${status}`)) }
      const chunks = []
      let size = 0
      remote.on('data', chunk => {
        size += chunk.length
        if (size > snapshotMaxBytes) { request.destroy(new Error('页面超过 5 MB，读不了')); return }
        chunks.push(chunk)
      })
      remote.on('error', reject)
      remote.on('end', () => {
        let body = Buffer.concat(chunks)
        const encoding = String(remote.headers['content-encoding'] || '').toLowerCase()
        try {
          if (encoding.includes('br')) body = zlib.brotliDecompressSync(body)
          else if (encoding.includes('gzip')) body = zlib.gunzipSync(body)
          else if (encoding.includes('deflate')) body = zlib.inflateSync(body)
        } catch (_) { return reject(new Error('页面内容解压失败')) }
        resolve({ url: target.href, type: String(remote.headers['content-type'] || ''), body })
      })
    })
    request.on('timeout', () => request.destroy(new Error('12 秒内没有响应')))
    request.on('error', error => reject(new Error(error.code === 'ENOTFOUND' ? '找不到这个域名' : error.code === 'ECONNREFUSED' ? '对方拒绝了连接' : error.message || '连接失败')))
  })
}

function decodeHtml(body, type) {
  const head = body.subarray(0, 4096).toString('latin1')
  const label = (type.match(/charset=["']?([\w-]+)/i) || head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1] || 'utf-8'
  try { return new TextDecoder(label).decode(body) } catch (_) { return new TextDecoder('utf-8').decode(body) }
}

/** 去掉脚本和会拦截嵌入的声明，补上基准地址；懒加载图片换成真实地址、滚动到才出现的内容强制显示（脚本去掉后它们不会自己出来）。 */
function buildSnapshot(html, pageUrl) {
  const attr = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  let out = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*>/gi, '')
    .replace(/<meta[^>]+http-equiv\s*=\s*["']?(?:content-security-policy|refresh|x-frame-options)["']?[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<link[^>]+rel\s*=\s*["']?(?:preload|prefetch|modulepreload|manifest)["']?[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  out = out.replace(/<img\b[^>]*>/gi, tag => {
    const lazy = tag.match(/\s(?:data-src|data-original|data-lazy-src|data-lazyload|data-lazy|data-url)\s*=\s*(?:"([^"]+)"|'([^']+)')/i)
    const url = lazy && (lazy[1] || lazy[2])
    if (!url || /^data:/i.test(url)) return tag
    return tag.replace(/\ssrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '').replace(/\sloading\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '').replace(/^<img\b/i, `<img src="${attr(url)}"`)
  })
  const inject = `<base href="${attr(pageUrl)}"><meta name="referrer" content="no-referrer"><style>html{scroll-behavior:auto!important}[data-aos],.aos-init,.wow,.animated,.reveal,[data-scroll],[data-animate],.lazyload,.lazyloading{opacity:1!important;visibility:visible!important;transform:none!important;animation:none!important}</style>`
  return /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, match => match + inject) : inject + out
}

async function servePageSnapshot(response, raw) {
  let target
  try { target = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) } catch (_) { return sendJson(response, 400, { error: '网址格式不对' }) }
  if (!/^https?:$/.test(target.protocol) || !target.hostname.includes('.') && target.hostname !== 'localhost') return sendJson(response, 400, { error: '网址格式不对' })
  const cached = snapshotCache.get(target.href)
  if (cached && Date.now() - cached.at < snapshotCacheMs) return sendJson(response, 200, cached.data)
  try {
    const remote = await fetchRemote(target)
    if (remote.type && !/html|xml|text\/plain/i.test(remote.type)) return sendJson(response, 415, { error: '这个地址返回的不是网页' })
    const html = decodeHtml(remote.body, remote.type)
    const title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    const data = { url: remote.url, title, html: buildSnapshot(html, remote.url) }
    snapshotCache.set(target.href, { at: Date.now(), data })
    sendJson(response, 200, data)
  } catch (error) {
    sendJson(response, 502, { error: `读不到这个页面：${error.message || '连接失败'}` })
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`)
  try {
    if (url.pathname === '/api/product-logic') {
      if (request.method !== 'PUT') {
        response.writeHead(405, { Allow: 'PUT' })
        response.end()
        return
      }
      await saveProductLogic(request, response)
      return
    }
    if (url.pathname === '/api/analytics') {
      if (request.method !== 'POST') {
        response.writeHead(405, { Allow: 'POST' })
        response.end()
        return
      }
      let raw = ''
      for await (const chunk of request) {
        raw += chunk
        if (Buffer.byteLength(raw) > 16 * 1024) break
      }
      try { console.log('[埋点上报]', JSON.parse(raw)) } catch (_) {}
      response.writeHead(204, { 'Cache-Control': 'no-store' })
      response.end()
      return
    }
    if (url.pathname === '/api/page-snapshot') {
      if (request.method !== 'GET') {
        response.writeHead(405, { Allow: 'GET' })
        response.end()
        return
      }
      await servePageSnapshot(response, String(url.searchParams.get('url') || '').trim())
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' })
      response.end()
      return
    }
    await serveStatic(request, response, url.pathname)
  } catch (error) {
    console.error(error)
    send(response, 500, 'Server Error')
  }
})

server.listen(port, host, () => {
  console.log(`吸管原型本地服务：http://${host}:${port}`)
})
