import '@/lib/env'
import { createFileRoute } from '@tanstack/react-router'

const RUST_BACKEND_URL =
  process.env.RUST_BACKEND_URL || 'http://127.0.0.1:8080'

const FORWARDED_REQUEST_HEADERS = [
  'authorization',
  'x-api-key',
  'content-type',
  'accept',
  'mcp-protocol-version',
  'mcp-session-id',
  'origin',
  'access-control-request-method',
  'access-control-request-headers',
  // Client IP chain, used by the backend for Service Account IP allowlists
  // (trusted only when STARWARD_TRUST_PROXY_HEADERS=true on the backend).
  'x-forwarded-for',
  'x-real-ip',
] as const

const PRESERVED_RESPONSE_HEADERS = new Set([
  'content-type',
  'mcp-session-id',
  'mcp-protocol-version',
  'allow',
  'www-authenticate',
  'cache-control',
  'access-control-expose-headers',
])

async function proxyMcpToRust(request: Request): Promise<Response> {
  const incomingUrl = new URL(request.url)
  const targetUrl = new URL(`/api/mcp${incomingUrl.search}`, RUST_BACKEND_URL)

  const headers = new Headers()
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const val = request.headers.get(name)
    if (val) {
      headers.set(name, val)
    }
  }
  if (!headers.has('accept')) {
    headers.set('accept', 'application/json, text/event-stream')
  }

  const method = request.method.toUpperCase()
  const hasBody = !['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(method)
  const body = hasBody ? await request.arrayBuffer() : undefined

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
    })

    const responseHeaders = new Headers()
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase()
      if (
        PRESERVED_RESPONSE_HEADERS.has(lower) ||
        lower.startsWith('access-control-allow-')
      ) {
        responseHeaders.set(key, value)
      }
    })
    // MCP tools/resources can return decrypted secrets: never cache responses.
    if (!responseHeaders.has('cache-control')) {
      responseHeaders.set('cache-control', 'no-store')
    }

    if (upstream.status === 202 || upstream.status === 204) {
      return new Response(null, {
        status: upstream.status,
        headers: responseHeaders,
      })
    }

    const upstreamBody = await upstream.arrayBuffer()
    return new Response(upstreamBody, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch (err) {
    console.error('Rust MCP proxy error:', err)
    return Response.json(
      {
        error: {
          code: 'BACKEND_UNAVAILABLE',
          message:
            'Backend Rust non raggiungibile. Assicurati che sia avviato sulla porta 8080.',
        },
      },
      {
        status: 502,
        headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
      },
    )
  }
}

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      GET: async ({ request }) => proxyMcpToRust(request),
      POST: async ({ request }) => proxyMcpToRust(request),
      DELETE: async ({ request }) => proxyMcpToRust(request),
      OPTIONS: async ({ request }) => proxyMcpToRust(request),
    },
  },
})
