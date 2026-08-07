// @allow-long 466: oRPC contract + router + procedures aggregation with billing conditional
import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import * as v from "./versions.js";

/**
 * @param hasBilling — billing oRPC procedures and the billing domain demo are
 * emitted only when this is true. Without billing, @repo/billing does not exist
 * and including a `getBillingProvider` import fails the generation-matrix guard.
 */
export function apiPackage(hasBilling = true): TemplateFile[] {
  return [
    file(
      "packages/api/package.json",
      packageJson({
        name: "@repo/api",
        scripts: codeScripts(),
        exports: {
          ".": "./src/index.ts",
          "./openapi": "./src/openapi.ts",
        },
        dependencies: {
          "@orpc/server": `^${v.orpc["@orpc/server"]}`,
          "@orpc/contract": `^${v.orpc["@orpc/contract"]}`,
          "@orpc/client": `^${v.orpc["@orpc/client"]}`,
          "@orpc/openapi": `^${v.orpc["@orpc/openapi"]}`,
          "@orpc/zod": `^${v.orpc["@orpc/zod"]}`,
          "@repo/auth": "workspace:*",
          "@repo/config": "workspace:*",
          "@repo/contracts": "workspace:*",
          "@repo/database": "workspace:*",
          "@repo/modules": "workspace:*",
          zod: `^${v.validation.zod}`,
        },
        devDependencies: {
          // tsconfig declares types: ["node"] — must be depended on or TS2688.
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/api/tsconfig.json",
      tsconfig({ compilerOptions: { types: ["node"] }, include: ["src/**/*"] }),
    ),
    file(
      "packages/api/src/context.ts",
      `import { auth } from "@repo/auth";

export interface ApiContext {
  user?: {
    id: string;
    email: string;
    name?: string | null;
    role?: string | null;
  };
  sessionId?: string;
}

export async function createContext(headers: Headers): Promise<ApiContext> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user) {
    return {};
  }
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: (session.user as unknown as { role?: string }).role ?? "user",
    },
    sessionId: (session.session as unknown as { id?: string })?.id,
  };
}

// RBAC helpers — throw ORPCError if not authenticated / not admin
export function requireUser(ctx: ApiContext) {
  if (!ctx.user?.id) {
    throw new Error("UNAUTHORIZED");
  }
  return ctx.user;
}
export function requireAdmin(ctx: ApiContext) {
  requireUser(ctx);
  if ((ctx.user as { role?: string }).role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return ctx.user;
}
`,
    ),
    file(
      "packages/api/src/procedures/health.ts",
      `import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { z } from "zod";
import type { ApiContext } from "../context.js";

// Pure oRPC only - oc.route per Context7 /dinwwwh/orpc
const contract = {
  health: oc
    .route({ method: "GET", path: "/health" })
    .output(z.object({ status: z.literal("ok"), time: z.string().datetime() })),
};

export const healthContract = contract.health;

const implementer = implement<typeof contract, ApiContext>(contract);

export const health = implementer.health.handler(async () => ({
  status: "ok" as const,
  time: new Date().toISOString(),
}));
`,
    ),
    file(
      "packages/api/src/middleware/auth.ts",
      `import { ORPCError } from "@orpc/server";
import type { ApiContext } from "../context.js";

// oRPC middleware style — used via implement.use(middleware) or manual check in handler
export async function protectedProcedure(ctx: ApiContext) {
  if (!ctx.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  return ctx.user;
}
export async function adminProcedure(ctx: ApiContext) {
  if (!ctx.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  if ((ctx.user as { role?: string }).role !== "admin") throw new ORPCError("FORBIDDEN", { message: "Forbidden — admin only" });
  return ctx.user;
}
// Rate limit stub — per-route 60/min memory; integrate Upstash Redis when cache=redis
const hits = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit = 60, windowMs = 60_000): void {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || now > cur.reset) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  cur.count++;
  if (cur.count > limit) throw new ORPCError("TOO_MANY_REQUESTS", { message: "Too many requests" });
}
`,
    ),
    file(
      "packages/api/src/procedures/me.ts",
      `import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { z } from "zod";
import type { ApiContext } from "../context.js";

// Pure oRPC only - oc.route + implement + authenticated context auth.api.getSession

const contract = {
  me: oc
    .route({ method: "GET", path: "/me" })
    .output(
      z.object({
        user: z
          .object({
            id: z.string(),
            email: z.string(),
            name: z.string().nullable(),
          })
          .nullable(),
      }),
    ),
};

export const meContract = contract.me;

const implementer = implement<typeof contract, ApiContext>(contract);

export const me = implementer.me.handler(async ({ context }) => {
  const user = context.user;
  return {
    user: user ? { id: user.id, email: user.email, name: user.name ?? null } : null,
  };
});
`,
    ),
    // Procedures that demonstrate the full 6-layer chain:
    // app/api/** (or apps/web fetch) → @repo/api/procedures/* (Transport, oRPC contract-first)
    // → @repo/modules/billing/application/* (Domain application layer, use-cases)
    // → @repo/services/billing/* (Capabilities, business rules + port adapters)
    // → @repo/billing/providers/* (Vendors, SDK wrapper implementations)
    // → @repo/database + @repo/config (Supporting)
    // This is what `ghostinit check` enforces via oxc-parser — it fails on upward
    // imports and on Transport→Vendors direct imports. That check used to be
    // vacuous because the only procedures (health, me) called no use-case.
    ...(hasBilling
      ? [
          file(
            "packages/api/src/procedures/billing/subscriptions.ts",
            `import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { listSubscriptionsUseCase } from "@repo/modules/billing/application/list-subscriptions.usecase";
import { ErrorCode } from "@repo/contracts";
import { z } from "zod";
import type { ApiContext } from "../../context.js";

const contract = {
  list: oc
    .route({ method: "GET", path: "/billing/subscriptions" })
    .errors({ UNAUTHORIZED: { message: "Unauthorized" } })
    .output(
      z.object({
        subscriptions: z.array(z.record(z.unknown())),
        invoices: z.array(z.record(z.unknown())),
        usageEvents: z.array(z.record(z.unknown())),
        licenseKeys: z.array(z.record(z.unknown())),
      }),
    ),
};

export const billingSubscriptionsContract = contract.list;

const implementer = implement<typeof contract, ApiContext>(contract);

export const billingSubscriptions = implementer.list.handler(async ({ context }) => {
  if (!context.user?.id) {
    throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  }
  const result = await listSubscriptionsUseCase(context.user.id);
  if (!result.ok) {
    // Use-case errors are internal — surface as INTERNAL but log the real cause
    // in the observability layer once the oRPC error handler is wired to logger.
    throw new ORPCError(ErrorCode.INTERNAL_ERROR, {
      message: result.error.message,
      cause: result.error,
    });
  }
  return result.value;
});
`,
          ),
          file(
            "packages/api/src/procedures/billing/create-checkout.ts",
            `import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { ErrorCode } from "@repo/contracts";
import { getBillingProvider } from "@repo/billing";
import { createCheckoutUseCase } from "@repo/modules/billing/application/create-checkout.usecase";
import { z } from "zod";
import type { ApiContext } from "../../context.js";

const contract = {
  createCheckout: oc
    .route({ method: "POST", path: "/billing/checkout" })
    .errors({
      UNAUTHORIZED: { message: "Unauthorized" },
      VALIDATION_ERROR: { message: "Invalid input" },
      INTERNAL_ERROR: { message: "Failed to create checkout" },
    })
    .input(
      z.object({
        provider: z.enum(["stripe", "chargily", "paddle", "polar"]),
        priceId: z.string().min(1),
        successUrl: z.string().url(),
        failureUrl: z.string().url().optional(),
        cancelUrl: z.string().url().optional(),
        quantity: z.number().int().positive().optional(),
      }),
    )
    .output(z.object({ id: z.string(), url: z.string() })),
};

export const billingCreateCheckoutContract = contract.createCheckout;

const implementer = implement<typeof contract, ApiContext>(contract);

export const billingCreateCheckout = implementer.createCheckout.handler(
  async ({ input, context }) => {
    if (!context.user?.id || !context.user?.email) {
      throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
    }
    // BillingProvider port — vendor layer is swapped behind this port via factory.
    const billingProvider = await getBillingProvider(input.provider as never);
    const result = await createCheckoutUseCase(
      {
        userId: context.user.id,
        customerEmail: context.user.email,
        provider: input.provider,
        priceId: input.priceId,
        successUrl: input.successUrl,
        failureUrl: input.failureUrl,
        cancelUrl: input.cancelUrl,
        quantity: input.quantity,
      },
      { billingProvider },
    );
    if (!result.ok) {
      const isValidation = /required/i.test(result.error.message);
      throw new ORPCError(
        isValidation ? "VALIDATION_ERROR" : ErrorCode.INTERNAL_ERROR,
        { message: result.error.message, cause: result.error },
      );
    }
    return result.value;
  },
);
`,
          ),
          file(
            "packages/api/src/procedures/billing/create-portal-session.ts",
            `import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { ErrorCode } from "@repo/contracts";
import { getBillingProvider } from "@repo/billing";
import { createPortalSessionUseCase } from "@repo/modules/billing/application/create-portal-session.usecase";
import { z } from "zod";
import type { ApiContext } from "../../context.js";

const contract = {
  createPortalSession: oc
    .route({ method: "POST", path: "/billing/portal" })
    .errors({
      UNAUTHORIZED: { message: "Unauthorized" },
      VALIDATION_ERROR: { message: "Invalid input" },
      INTERNAL_ERROR: { message: "Failed to create portal session" },
    })
    .input(
      z.object({
        provider: z.enum(["stripe", "chargily", "paddle", "polar"]),
        customerId: z.string().min(1),
        returnUrl: z.string().url(),
      }),
    )
    .output(z.object({ url: z.string() })),
};

export const billingCreatePortalSessionContract = contract.createPortalSession;

const implementer = implement<typeof contract, ApiContext>(contract);

export const billingCreatePortalSession = implementer.createPortalSession.handler(
  async ({ input, context }) => {
    if (!context.user?.id) {
      throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
    }
    const billingProvider = await getBillingProvider(input.provider as never);
    const result = await createPortalSessionUseCase(
      {
        provider: input.provider,
        customerId: input.customerId,
        returnUrl: input.returnUrl,
      },
      { billingProvider },
    );
    if (!result.ok) {
      const msg = result.error.message;
      const isValidation = /required/i.test(msg);
      const isNotSupported = /does not support/i.test(msg);
      if (isNotSupported) {
        throw new ORPCError("VALIDATION_ERROR", { message: msg, cause: result.error });
      }
      throw new ORPCError(isValidation ? "VALIDATION_ERROR" : ErrorCode.INTERNAL_ERROR, {
        message: msg,
        cause: result.error,
      });
    }
    return result.value;
  },
);
`,
          ),
        ]
      : []),
    file(
      "packages/api/src/contract.ts",
      hasBilling
        ? `import { healthContract } from "./procedures/health";
import { meContract } from "./procedures/me";
import { billingSubscriptionsContract } from "./procedures/billing/subscriptions";
import { billingCreateCheckoutContract } from "./procedures/billing/create-checkout";
import { billingCreatePortalSessionContract } from "./procedures/billing/create-portal-session";

export const appContract = {
  health: healthContract,
  me: meContract,
  billing: {
    subscriptions: billingSubscriptionsContract,
    createCheckout: billingCreateCheckoutContract,
    createPortalSession: billingCreatePortalSessionContract,
  },
};
`
        : `import { healthContract } from "./procedures/health";
import { meContract } from "./procedures/me";

export const appContract = {
  health: healthContract,
  me: meContract,
};
`,
    ),
    file(
      "packages/api/src/router.ts",
      hasBilling
        ? `import { implement, os } from "@orpc/server";
import { appContract } from "./contract";
import { health } from "./procedures/health";
import { me } from "./procedures/me";
import { billingSubscriptions } from "./procedures/billing/subscriptions";
import { billingCreateCheckout } from "./procedures/billing/create-checkout";
import { billingCreatePortalSession } from "./procedures/billing/create-portal-session";
import type { ApiContext } from "./context";

const implementer = implement<typeof appContract, ApiContext>(appContract);

export const appRouter = os.prefix("/api").router(
  implementer.router({
    health,
    me,
    billing: {
      subscriptions: billingSubscriptions,
      createCheckout: billingCreateCheckout,
      createPortalSession: billingCreatePortalSession,
    },
  }),
);
`
        : `import { implement, os } from "@orpc/server";
import { appContract } from "./contract";
import { health } from "./procedures/health";
import { me } from "./procedures/me";
import type { ApiContext } from "./context";

const implementer = implement<typeof appContract, ApiContext>(appContract);

export const appRouter = os.prefix("/api").router(
  implementer.router({
    health,
    me,
  }),
);
`,
    ),
    file(
      "packages/api/src/index.ts",
      `export { appRouter } from "./router.js";
export { appContract } from "./contract.js";
export { createContext, type ApiContext } from "./context.js";
`,
    ),
    file(
      "packages/api/src/openapi.ts",
      `import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { appRouter } from "./router.js";

// oRPC contract-first, os.prefix("/api") + oc.route.
// The constructor option is \`schemaConverters\` (OpenAPIGeneratorOptions in
// @orpc/openapi); \`converters\` is not a known property and failed to typecheck.

export async function generateOpenAPISpec(): Promise<unknown> {
  const generator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  });
  return generator.generate(appRouter, {
    info: { title: "GhostInit API", version: "0.1.0" },
    servers: [{ url: "http://localhost:3000/api" }],
  });
}
`,
    ),
  ];
}
