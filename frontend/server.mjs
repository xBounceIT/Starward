import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { Readable } from 'node:stream'
import serverEntry from './dist/server/server.js'

const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number(process.env.PORT || 3000)
const CLIENT_DIR = resolve(process.cwd(), 'dist/client')
const APP_VERSION = (() => {
  const fromEnv = process.env.APP_VERSION?.trim().replace(/^v/, '')
  if (fromEnv) return fromEnv
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    )
    return pkg.version || '0.0.0-dev'
  } catch {
    return '0.0.0-dev'
  }
})()

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

// CSP allows the app's own assets plus the Google Fonts stylesheets/fonts it
// links, and inline script/style (the SSR bootstrap script and theme init).
// Everything else is locked to 'self'.
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ')

function applySecurityHeaders(target, { html = false, protocol = 'http' } = {}) {
  target['X-Content-Type-Options'] = 'nosniff'
  target['X-Frame-Options'] = 'DENY'
  target['Referrer-Policy'] = 'strict-origin-when-cross-origin'
  if (html) {
    target['Content-Security-Policy'] = CSP_POLICY
  }
  // HSTS is only meaningful (and only honored by browsers) over HTTPS.
  if (protocol === 'https') {
    target['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
  }
}

function tryServeStatic(req, res, pathname, protocol) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  if (pathname === '/' || pathname.startsWith('/api/')) return false

  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    return false
  }

  const normalized = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '')
  const fullPath = resolve(CLIENT_DIR, `.${normalized}`)
  if (!fullPath.startsWith(CLIENT_DIR)) return false
  if (!existsSync(fullPath)) return false

  const stats = statSync(fullPath)
  if (!stats.isFile()) return false

  const ext = extname(fullPath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'
  const isHashedAsset = pathname.startsWith('/assets/')

  const headers = {
    'Content-Type': contentType,
    'Content-Length': stats.size,
    'Cache-Control': isHashedAsset
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600',
  }
  applySecurityHeaders(headers, {
    html: ext === '.html',
    protocol,
  })
  res.writeHead(200, headers)

  if (req.method === 'HEAD') {
    res.end()
  } else {
    createReadStream(fullPath).pipe(res)
  }
  return true
}

const server = createServer(async (req, res) => {
  try {
    const protocol =
      (req.headers['x-forwarded-proto'] &&
        String(req.headers['x-forwarded-proto']).split(',')[0].trim()) ||
      'http'
    const host =
      (req.headers['x-forwarded-host'] &&
        String(req.headers['x-forwarded-host']).split(',')[0].trim()) ||
      req.headers.host ||
      `localhost:${PORT}`
    const url = new URL(req.url || '/', `${protocol}://${host}`)

    if (tryServeStatic(req, res, url.pathname, protocol)) {
      return
    }

    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v)
      } else {
        headers.set(key, value)
      }
    }

    const method = req.method || 'GET'
    const hasBody = method !== 'GET' && method !== 'HEAD'
    const init = {
      method,
      headers,
      ...(hasBody
        ? {
            body: Readable.toWeb(req),
            duplex: 'half',
          }
        : {}),
    }

    const webRequest = new Request(url, init)
    const webResponse = await serverEntry.fetch(webRequest)

    const outHeaders = {}
    webResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') return
      outHeaders[key] = value
    })

    const setCookies =
      typeof webResponse.headers.getSetCookie === 'function'
        ? webResponse.headers.getSetCookie()
        : []
    if (setCookies.length > 0) {
      outHeaders['set-cookie'] = setCookies
    }

    applySecurityHeaders(outHeaders, {
      html: (webResponse.headers.get('content-type') || '').includes('text/html'),
      protocol,
    })

    res.writeHead(webResponse.status, outHeaders)

    if (!webResponse.body || method === 'HEAD') {
      res.end()
      return
    }

    const nodeStream = Readable.fromWeb(webResponse.body)
    nodeStream.on('error', () => res.destroy())
    nodeStream.pipe(res)
  } catch (err) {
    console.error('Starward frontend server error:', err)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    }
    res.end('Internal Server Error')
  }
})

server.listen(PORT, HOST, () => {
  console.log(
    `Starward frontend v${APP_VERSION} listening on http://${HOST}:${PORT}`,
  )
})
