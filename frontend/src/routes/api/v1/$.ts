import { requireProdEnv } from '@/lib/env'
import { createFileRoute } from '@tanstack/react-router'
import { SignJWT } from 'jose'
import { auth, ensureAuthMigrated } from '@/lib/auth'

const RUST_BACKEND_URL =
  process.env.RUST_BACKEND_URL || 'http://127.0.0.1:8080'

// Shared HS256 secret with the Rust backend: required in production, dev
// default allowed only when STARWARD_DEV_MODE=true.
const STARWARD_AUTH_SECRET = requireProdEnv(
  'STARWARD_AUTH_SECRET',
  'dev-starward-auth-secret-change-in-production-32chars',
)

function extractIncomingApiKey(request: Request): string | null {
  const xApiKey = request.headers.get('x-api-key')?.trim()
  if (xApiKey) {
    return xApiKey
  }

  const authHeader = request.headers.get('authorization')?.trim()
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(sw_\S+)$/i)
    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

async function resolveUpstreamAuthHeader(
  request: Request,
): Promise<string | Response> {
  const apiKey = extractIncomingApiKey(request)
  if (apiKey) {
    return `Bearer ${apiKey}`
  }

  await ensureAuthMigrated()
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session?.user) {
    return Response.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message:
            'Sessione non valida o API Key mancante. Effettua il login o fornisci una API Key valida.',
        },
      },
      {
        status: 401,
        headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
      },
    )
  }

  const secretKey = new TextEncoder().encode(STARWARD_AUTH_SECRET)
  const token = await new SignJWT({
    sub: session.user.id,
    email: session.user.email,
    name: session.user.name || session.user.email,
    image: session.user.image ?? null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(secretKey)

  return `Bearer ${token}`
}

async function proxyToRust(request: Request, splat: string) {
  const authOrResponse = await resolveUpstreamAuthHeader(request)
  if (authOrResponse instanceof Response) {
    return authOrResponse
  }

  const incomingUrl = new URL(request.url)
  const targetUrl = new URL(
    `/api/${splat}${incomingUrl.search}`,
    RUST_BACKEND_URL,
  )

  const headers = new Headers()
  headers.set('Authorization', authOrResponse)
  const contentType = request.headers.get('content-type')
  if (contentType) {
    headers.set('Content-Type', contentType)
  }
  headers.set('Accept', 'application/json')

  // Forward the client IP chain so the Rust backend can enforce Service
  // Account IP allowlists. The backend only trusts these headers when
  // STARWARD_TRUST_PROXY_HEADERS=true (i.e. when this frontend is itself
  // reachable only through a proxy that overwrites them).
  for (const name of ['x-forwarded-for', 'x-real-ip'] as const) {
    const value = request.headers.get(name)
    if (value) {
      headers.set(name, value)
    }
  }

  const hasBody = !['GET', 'HEAD'].includes(request.method.toUpperCase())
  const body = hasBody ? await request.arrayBuffer() : undefined

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
    })

    const responseHeaders = new Headers()
    const upstreamContentType = upstream.headers.get('content-type')
    if (upstreamContentType) {
      responseHeaders.set('Content-Type', upstreamContentType)
    }
    // These endpoints can return decrypted secrets: never let browsers or
    // intermediaries cache the responses.
    responseHeaders.set('Cache-Control', 'no-store')
    responseHeaders.set('Pragma', 'no-cache')

    if (upstream.status === 204) {
      return new Response(null, { status: 204, headers: responseHeaders })
    }

    const upstreamBody = await upstream.arrayBuffer()
    return new Response(upstreamBody, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch (err) {
    console.error('Rust backend proxy error:', err)
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

export const Route = createFileRoute('/api/v1/$')({
  server: {
    handlers: {
      GET: async ({ request, params }) => proxyToRust(request, params._splat ?? ''),
      POST: async ({ request, params }) => proxyToRust(request, params._splat ?? ''),
      PATCH: async ({ request, params }) => proxyToRust(request, params._splat ?? ''),
      PUT: async ({ request, params }) => proxyToRust(request, params._splat ?? ''),
      DELETE: async ({ request, params }) => proxyToRust(request, params._splat ?? ''),
    },
  },
})
