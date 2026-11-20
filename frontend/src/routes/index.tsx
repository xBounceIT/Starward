import { createFileRoute, redirect } from '@tanstack/react-router'
import { getServerSessionFn } from '@/lib/auth-server'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await getServerSessionFn()
    if (session?.user) {
      throw redirect({ to: '/vault' })
    }
    throw redirect({ to: '/login' })
  },
  component: () => null,
})
