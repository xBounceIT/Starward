import '@/lib/env'
import { createFileRoute } from '@tanstack/react-router'
import { SignJWT } from 'jose'
import { auth, ensureAuthMigrated } from '@/lib/auth'

const RUST_BACKEND_URL =
  process.env.RUST_BACKEND_URL || 'http://127.0.0.1:8080'

const STARWARD_AUTH_SECRET =
  process.env.STARWARD_AUTH_SECRET ||
  'dev-starward-auth-secret-change-in-production-32chars'

async function proxyToRust(request: Request, splat: string) {
  await ensureAuthMigrated()
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session?.user) {
    return Response.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Sessione non valida o scaduta. Effettua il login.',
        },
      },
      { status: 401 },
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

  const incomingUrl = new URL(request.url)
  const targetUrl = new URL(
    `/api/${splat}${incomingUrl.search}`,
    RUST_BACKEND_URL,
  )

  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token}`)
  const contentType = request.headers.get('content-type')
  if (contentType) {
    headers.set('Content-Type', contentType)
  }
  headers.set('Accept', 'application/json')

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
      { status: 502 },
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
