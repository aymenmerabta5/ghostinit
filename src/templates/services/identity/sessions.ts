import { serverOnly } from "./shared.js";

export function identitySessionsContent(): string {
  return `${serverOnly}
import { IdentityDomainError } from "./errors.js";
import { assertFreshSession, assertIdentityActor } from "./policy.js";
import {
  DEFAULT_FRESH_SESSION_MAXIMUM_AGE_MS,
  recordIdentityAudit,
  runIdentityMutation,
  type IdentityUseCaseDependencies,
} from "./application.js";
import type { IdentityActor, IdentitySession, MutationResult } from "./contracts.js";

export interface SessionUseCases {
  list(actor: IdentityActor): Promise<IdentitySession[]>;
  revoke(actor: IdentityActor, sessionId: string): Promise<MutationResult<IdentitySession>>;
  revokeOthers(actor: IdentityActor): Promise<{ revokedCount: number; changed: boolean }>;
}

export function createSessionUseCases(dependencies: IdentityUseCaseDependencies): SessionUseCases {
  const now = dependencies.now ?? (() => new Date());
  const freshMaximumAgeMs =
    dependencies.freshSessionMaximumAgeMs ?? DEFAULT_FRESH_SESSION_MAXIMUM_AGE_MS;

  return {
    async list(actor) {
      assertIdentityActor(actor);
      return await dependencies.adapter.query.listSessions(actor.userId);
    },

    async revoke(actor, sessionId) {
      assertIdentityActor(actor);
      const occurredAt = now();
      return await runIdentityMutation(dependencies.adapter, async ({ identity, audit }) => {
        const target = await identity.getSession(sessionId);
        if (!target) {
          throw new IdentityDomainError("IDENTITY_SESSION_NOT_FOUND", "Session not found");
        }
        if (target.userId !== actor.userId) {
          throw new IdentityDomainError("IDENTITY_SESSION_FORBIDDEN", "A session can only be revoked by its owner");
        }
        if (target.revokedAt) return { value: target, changed: false };
        if (target.id !== actor.sessionId) {
          assertFreshSession(actor, occurredAt, freshMaximumAgeMs);
        }
        const revoked = await identity.revokeSession({
          sessionId: target.id,
          userId: actor.userId,
          revokedAt: occurredAt,
        });
        await recordIdentityAudit(audit, {
          action: "identity.session.revoked",
          actorId: actor.userId,
          targetId: target.id,
          metadata: { currentSession: target.id === actor.sessionId },
          occurredAt,
        });
        return { value: revoked, changed: true };
      });
    },

    async revokeOthers(actor) {
      assertIdentityActor(actor);
      const occurredAt = now();
      assertFreshSession(actor, occurredAt, freshMaximumAgeMs);
      return await runIdentityMutation(dependencies.adapter, async ({ identity, audit }) => {
        const current = await identity.getSession(actor.sessionId);
        if (!current) {
          throw new IdentityDomainError("IDENTITY_SESSION_NOT_FOUND", "Current session not found");
        }
        if (current.userId !== actor.userId) {
          throw new IdentityDomainError("IDENTITY_SESSION_FORBIDDEN", "The current session does not belong to the actor");
        }
        const revokedCount = await identity.revokeOtherSessions({
          userId: actor.userId,
          exceptSessionId: actor.sessionId,
          revokedAt: occurredAt,
        });
        if (revokedCount === 0) return { revokedCount, changed: false };
        await recordIdentityAudit(audit, {
          action: "identity.session.others_revoked",
          actorId: actor.userId,
          targetId: actor.sessionId,
          metadata: { revokedCount },
          occurredAt,
        });
        return { revokedCount, changed: true };
      });
    },
  };
}
`;
}
