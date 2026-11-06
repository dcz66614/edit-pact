/**
 * P012 改稿守约 Edit Pact — T001 本机静态文件服务。
 *
 * Node 内置 http 服务，仅绑定 127.0.0.1，只读 GET/HEAD，不接受
 * 任何上传或业务接口。用法：
 *   node scripts/serve.mjs [--port 4173]
 * 默认端口 4173；主机固定为 127.0.0.1，不可通过参数改成
 * 0.0.0.0 或其他地址。
 */
import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = '127.0.0.1'
const DEFAULT_PORT = 4173

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist'))

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function parsePort(argv) {
  const idx = argv.indexOf('--port')
  if (idx === -1) return DEFAULT_PORT
  const value = Number(argv[idx + 1])
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`invalid --port value: ${argv[idx + 1]}`)
  }
  return value
}

function resolveWithinRoot(requestPath) {
  const decoded = decodeURIComponent(requestPath)
  const candidate = resolve(join(ROOT, normalize(decoded).replace(/^(\.\.[/\\])+/, '')))
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null
  return candidate
}

function serveFile(res, filePath, status = 200) {
  const ext = extname(filePath).toLowerCase()
  res.writeHead(status, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    // index.html must never be cached stale; hashed /assets/* are immutable.
    'cache-control': filePath.endsWith(`${sep}index.html`)
      ? 'no-cache'
      : 'public, max-age=31536000, immutable',
  })
  createReadStream(filePath).pipe(res)
}

const server = http.createServer((req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('method not allowed\n')
      return
    }
    const url = new URL(req.url ?? '/', `http://${HOST}`)
    let filePath = resolveWithinRoot(url.pathname)
    if (filePath === null) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('forbidden\n')
      return
    }
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html')
    }
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      if (req.method === 'HEAD') {
        const ext = extname(filePath).toLowerCase()
        res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' })
        res.end()
        return
      }
      serveFile(res, filePath)
      return
    }
    // SPA fallback: extensionless routes serve index.html; missing
    // asset files are a real 404, not silently rewritten.
    if (!extname(url.pathname)) {
      const indexPath = join(ROOT, 'index.html')
      if (existsSync(indexPath)) {
        serveFile(res, indexPath)
        return
      }
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found\n')
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`internal error: ${err.message}\n`)
  }
})

const port = parsePort(process.argv.slice(2))
server.listen(port, HOST, () => {
  console.log(`p012-edit-pact static server listening on http://${HOST}:${port}/ (root: ${ROOT})`)
})
