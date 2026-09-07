export const profileUpdateValidationImports = `import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";`;

export function profileUpdateValidationContent(): string {
  return `function profileUpdateValidation(): BetterAuthPlugin {
  return {
    id: "ghostinit-profile-update-validation",
    hooks: {
      before: [{
        matcher: (context) => context.path === "/update-user",
        handler: createAuthMiddleware(async (context) => {
          if (context.body?.name === undefined) return;
          const name = typeof context.body.name === "string" ? context.body.name.trim() : "";
          if (name.length < 1 || name.length > 50) {
            throw new APIError("BAD_REQUEST", {
              code: "INVALID_NAME",
              message: "Name must be between 1 and 50 characters.",
            });
          }
          return { context: { ...context, body: { ...context.body, name } } };
        }),
      }],
    },
  };
}
`;
}
