import { file, type TemplateFile } from "./shared.js";

export function transactionalAccountDeletionContent(): string {
  return `import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { runWithTransaction } from "@better-auth/core/context";

export function authErrorCode(error: unknown): string | undefined {
  const code = isAPIError(error) ? error.body?.code : undefined;
  return typeof code === "string" ? code : undefined;
}

function isRetainedRecordError(error: unknown): boolean {
  for (let depth = 0; depth < 5 && error && typeof error === "object"; depth++) {
    const code = Reflect.get(error, "code");
    if (code === "23001" || code === "23503") return true;
    error = Reflect.get(error, "cause");
  }
  return false;
}

export function transactionalAccountDeletion(): BetterAuthPlugin {
  return {
    id: "ghostinit-transactional-account-deletion",
    hooks: {
      before: [{
        matcher: (context) => context.path === "/delete-user" || context.path === "/delete-user/callback",
        handler: createAuthMiddleware(async (context) => {
          const adapter = context.context.adapter;
          const original = context.context.internalAdapter;
          // The inner context is a request-local copy, never the shared auth instance.
          return {
            context: {
              context: {
                ...context.context,
                internalAdapter: {
                  ...original,
                  async deleteUser(userId: string): Promise<void> {
                    try {
                      // The SDK deletes credentials and sessions before the retained user row.
                      await runWithTransaction(adapter, () => original.deleteUser(userId));
                    } catch (error) {
                      if (isRetainedRecordError(error)) {
                        throw new APIError("CONFLICT", {
                          code: "ACCOUNT_DELETION_RESTRICTED",
                          message: "This account is referenced by retained records and cannot be deleted.",
                        });
                      }
                      throw error;
                    }
                  },
                },
              },
            },
          };
        }),
      }],
    },
  };
}
`;
}

export function transactionalAccountDeletionFile(root: string): TemplateFile {
  return file(`${root}/account-deletion.ts`, transactionalAccountDeletionContent());
}
