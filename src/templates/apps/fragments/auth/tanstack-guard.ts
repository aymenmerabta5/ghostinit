/**
 * TanStack auth guard fragment — DRY createServerFn + getRequestHeaders pattern
 * Used by settings.tsx and billing.tsx to avoid duplication of session fetch.
 * Context7: @tanstack/react-start server functions + getRequestHeaders for Better Auth session.
 */

export function tanstackGetSessionFnContent(): string {
  return `type SessionResult = { user?: { id: string; email: string; name?: string | null; role?: string } } | null
type SessionAuth = { api: { getSession: (opts: { headers: Headers }) => Promise<SessionResult> } }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasSessionApi(value: unknown): value is SessionAuth {
  return isRecord(value) && isRecord(value.api) && typeof value.api.getSession === 'function'
}

const getSessionFn = createServerFn({ method: 'GET' }).handler(async () => {
  const headers = new Headers()
  getRequestHeaders().forEach((value, key) => headers.set(key, value))
  const authCandidate: unknown = auth
  if (!hasSessionApi(authCandidate)) throw new Error('Configured auth adapter does not expose a session API')
  const session = await authCandidate.api.getSession({ headers })
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
