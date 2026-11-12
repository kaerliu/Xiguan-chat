const http = require('node:http')
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
  '.png': 'image/png'
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
