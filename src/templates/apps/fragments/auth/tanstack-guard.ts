/**
 * TanStack auth guard fragment — DRY createServerFn + getRequestHeaders pattern
 * Used by settings.tsx and billing.tsx to avoid duplication of session fetch.
 * Context7: @tanstack/react-start server functions + getRequestHeaders for Better Auth session.
 */

export function tanstackGetSessionFnContent(): string {
  return `const getSessionFn = createServerFn({ method: 'GET' }).handler(async () => {
  const headers = getRequestHeaders() as unknown as Headers
  const session = await (auth as unknown as { api: { getSession: (opts: { headers: Headers }) => Promise<unknown> } }).api.getSession({ headers })
  return session ?? null
})`;
}

export function tanstackAuthBeforeLoadContent(): string {
  return `beforeLoad: async () => {
    const session = await getSessionFn()
    if (!session?.user) throw redirect({ to: '/sign-in' })
    return { session }
  },`;
}

export function tanstackGuardImportsContent(): string {
  return `import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '@repo/auth'`;
}

/**
 * Full guard snippet combining session fn + beforeLoad for inline reuse.
 * Keeps settings / billing routes DRY while preserving existing template structure.
 */
export function tanstackProtectedGuardContent(): string {
  return `${tanstackGetSessionFnContent()}

export const Route = createFileRoute`;
}

export const TANSTACK_GUARD_PATTERN = {
  getSessionFn: tanstackGetSessionFnContent(),
  beforeLoad: tanstackAuthBeforeLoadContent(),
} as const;
