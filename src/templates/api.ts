// @allow-long 600: oRPC contract + router + procedures aggregation with billing+messaging conditional (DM-only postgres WS, convex native)
import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import * as v from "./versions.js";

/**
 * @param hasBilling — billing oRPC procedures and the billing domain demo are
 * emitted only when this is true. Without billing, @repo/billing does not exist
 * and including a `getBillingProvider` import fails the generation-matrix guard.
 * @param hasMessaging — messaging oRPC procedures (postgres DM-only) via @repo/realtime
 */
export function apiPackage(hasBilling = true, hasMessaging = false): TemplateFile[] {
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
          ...(hasMessaging ? { "@repo/realtime": "workspace:*" } : {}),
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
    banned?: boolean | null;
  };
  sessionId?: string;
}

export async function createContext(headers: Headers): Promise<ApiContext> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user) {
    return {};
  }
  const raw = session.user as unknown as { role?: string; banned?: boolean };
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: raw.role ?? "user",
      banned: raw.banned ?? null,
    },
    sessionId: (session.session as unknown as { id?: string })?.id,
  };
}

// RBAC helpers — Stagio pattern with effective role + ORPCError codes
export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}
export function requireUser(ctx: ApiContext) {
  if (!ctx.user?.id) {
    // Import lazily to avoid circular; but we can throw ORPCError string and map later
    throw new Error("UNAUTHORIZED");
  }
  if (ctx.user.banned) {
    throw new Error("ACCOUNT_SUSPENDED");
  }
  return ctx.user;
}
export function requireAdmin(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!isAdminRole((user as { role?: string }).role)) {
    throw new Error("FORBIDDEN");
  }
  return user;
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

// oRPC middleware — Stagio pattern: protected + admin with banned check
export async function protectedProcedure(ctx: ApiContext) {
  if (!ctx.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  if ((ctx.user as unknown as { banned?: boolean })?.banned) throw new ORPCError("FORBIDDEN", { message: "Account suspended", data: { code: "ACCOUNT_SUSPENDED" } } as unknown as never);
  return ctx.user;
}
export async function adminProcedure(ctx: ApiContext) {
  if (!ctx.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  if ((ctx.user as { role?: string }).role !== "admin" && (ctx.user as { role?: string }).role !== "super_admin") throw new ORPCError("FORBIDDEN", { message: "Forbidden — admin only" });
  return ctx.user;
}
`,
    ),
    file(
      "packages/api/src/middleware/rate-limit.ts",
      `import { ORPCError } from "@orpc/server";

// Stagio granular rate limits — Generous/Standard/Strict with memory + Upstash Redis fallback.
// When UPSTASH_REDIS_REST_URL is set, this would use @upstash/redis; fallback is in-memory.
const hits = new Map<string, { count: number; reset: number }>();

function checkRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || now > cur.reset) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  cur.count++;
  if (cur.count > limit) throw new ORPCError("TOO_MANY_REQUESTS", { message: "Too many requests — slow down" });
}

// Per-role buckets matching Stagio's rate-limited-procedures.ts
export function rateLimitGenerous(key: string): void { checkRateLimit(key, 100, 60_000); }
export function rateLimitStandard(key: string): void { checkRateLimit(key, 60, 60_000); }
export function rateLimitStrict(key: string): void { checkRateLimit(key, 20, 60_000); }
export function rateLimit(key: string, limit = 60, windowMs = 60_000): void { checkRateLimit(key, limit, windowMs); }
`,
    ),
    file(
      "packages/api/src/utils/service-error.ts",
      `import { ORPCError } from "@orpc/server";

type ORPCStatusCode = ConstructorParameters<typeof ORPCError>[0];

interface CodedORPCErrorOptions {
  message: string;
  meta?: Record<string, unknown>;
  cause?: unknown;
}

export function createCodedORPCError(status: ORPCStatusCode, code: string, { message, meta, cause }: CodedORPCErrorOptions) {
  return new ORPCError(status, { message, data: { code, ...(meta ? { meta } : {}) }, cause } as unknown as never);
}
export function throwCodedORPCError(status: ORPCStatusCode, code: string, options: CodedORPCErrorOptions): never {
  throw createCodedORPCError(status, code, options);
}
export function createServiceORPCError(error: unknown, { codeMap, fallbackMessage, fallbackCode = "BAD_REQUEST" }: { codeMap: Record<string, ORPCStatusCode>; fallbackMessage: string; fallbackCode?: ORPCStatusCode }): never {
  if (error instanceof ORPCError) throw error;
  const svc = error as unknown as { code?: string; message?: string; cause?: unknown };
  if (svc && typeof svc.code === "string" && typeof svc.message === "string") {
    throw new ORPCError(codeMap[svc.code] ?? fallbackCode, { message: svc.message, data: { code: svc.code }, cause: svc.cause ?? error } as unknown as never);
  }
  throw new ORPCError("INTERNAL_SERVER_ERROR", { message: fallbackMessage, cause: error } as unknown as never);
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
    ...(hasMessaging
      ? [
          file(
            "packages/api/src/procedures/messaging/list-conversations.ts",
            `import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { listConversationsUseCase } from "@repo/modules/messaging/application/list-conversations";
import { z } from "zod";
import type { ApiContext } from "../../context.js";
const contract = { listConversations: oc.route({ method: "GET", path: "/messaging/conversations" }).output(z.object({ conversations: z.array(z.record(z.unknown())) })) };
export const messagingListConversationsContract = contract.listConversations;
const implementer = implement<typeof contract, ApiContext>(contract);
export const messagingListConversations = implementer.listConversations.handler(async ({ context }) => {
  if (!context.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  const convs = await listConversationsUseCase({ userId: context.user.id });
  return { conversations: convs as unknown as Record<string, unknown>[] };
});
`,
          ),
          file(
            "packages/api/src/procedures/messaging/list-messages.ts",
            `import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { listMessagesUseCase } from "@repo/modules/messaging/application/list-messages";
import { z } from "zod";
import type { ApiContext } from "../../context.js";
const contract = { listMessages: oc.route({ method: "GET", path: "/messaging/messages" }).input(z.object({ conversationId: z.string().uuid(), limit: z.number().int().min(1).max(50).optional(), cursor: z.string().optional() })).output(z.object({ messages: z.array(z.record(z.unknown())), nextCursor: z.string().nullable() })) };
export const messagingListMessagesContract = contract.listMessages;
const implementer = implement<typeof contract, ApiContext>(contract);
export const messagingListMessages = implementer.listMessages.handler(async ({ input, context }) => {
  if (!context.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  try {
    const out = await listMessagesUseCase({ conversationId: input.conversationId, userId: context.user.id, limit: input.limit, cursor: input.cursor });
    return out as { messages: Record<string, unknown>[]; nextCursor: string | null };
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (msg.includes("Forbidden")) throw new ORPCError("FORBIDDEN", { message: msg });
    throw e;
  }
});
`,
          ),
          file(
            "packages/api/src/procedures/messaging/get-or-create-conversation.ts",
            `import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { getOrCreateConversationUseCase } from "@repo/modules/messaging/application/get-or-create-conversation";
import { z } from "zod";
import type { ApiContext } from "../../context.js";
const contract = { getOrCreateConversation: oc.route({ method: "POST", path: "/messaging/conversations/find-or-create" }).input(z.object({ peerUserId: z.string().uuid() })).output(z.record(z.unknown())) };
export const messagingGetOrCreateConversationContract = contract.getOrCreateConversation;
const implementer = implement<typeof contract, ApiContext>(contract);
export const messagingGetOrCreateConversation = implementer.getOrCreateConversation.handler(async ({ input, context }) => {
  if (!context.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  const conv = await getOrCreateConversationUseCase({ peerUserId: input.peerUserId, currentUserId: context.user.id });
  return conv as unknown as Record<string, unknown>;
});
`,
          ),
          file(
            "packages/api/src/procedures/messaging/send-message.ts",
            `import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { sendMessageUseCase } from "@repo/modules/messaging/application/send-message";
import { z } from "zod";
import type { ApiContext } from "../../context.js";
const contract = { sendMessage: oc.route({ method: "POST", path: "/messaging/messages" }).input(z.object({ conversationId: z.string().uuid(), body: z.string().min(1).max(4000).optional(), replyToId: z.string().uuid().optional(), attachmentIds: z.array(z.string().uuid()).max(5).optional() }).refine((v) => !!v.body || !!v.attachmentIds?.length, "body or attachment required")).output(z.record(z.unknown())) };
export const messagingSendMessageContract = contract.sendMessage;
const implementer = implement<typeof contract, ApiContext>(contract);
export const messagingSendMessage = implementer.sendMessage.handler(async ({ input, context }) => {
  if (!context.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  try {
    const msg = await sendMessageUseCase({ conversationId: input.conversationId, senderId: context.user.id, body: input.body, replyToId: input.replyToId, attachmentIds: input.attachmentIds });
    return msg as unknown as Record<string, unknown>;
  } catch (e) {
    const msg_ = (e as Error)?.message ?? "";
    if (msg_.includes("Forbidden")) throw new ORPCError("FORBIDDEN", { message: msg_ });
    throw e;
  }
});
`,
          ),
          file(
            "packages/api/src/procedures/messaging/mark-read.ts",
            `import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { markReadUseCase } from "@repo/modules/messaging/application/mark-read";
import { z } from "zod";
import type { ApiContext } from "../../context.js";
const contract = { markRead: oc.route({ method: "POST", path: "/messaging/read" }).input(z.object({ conversationId: z.string().uuid(), messageId: z.string().uuid() })).output(z.object({ ok: z.boolean() })) };
export const messagingMarkReadContract = contract.markRead;
const implementer = implement<typeof contract, ApiContext>(contract);
export const messagingMarkRead = implementer.markRead.handler(async ({ input, context }) => {
  if (!context.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  try {
    return await markReadUseCase({ conversationId: input.conversationId, userId: context.user.id, messageId: input.messageId });
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (msg.includes("Forbidden")) throw new ORPCError("FORBIDDEN", { message: msg });
    throw e;
  }
});
`,
          ),
          file(
            "packages/api/src/procedures/messaging/send-typing.ts",
            `import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { z } from "zod";
import type { ApiContext } from "../../context.js";
import { sendTyping } from "@repo/realtime";
import { db } from "@repo/database";
import { conversationParticipants } from "@repo/database";
import { eq, and } from "drizzle-orm";
const contract = { sendTyping: oc.route({ method: "POST", path: "/messaging/typing" }).input(z.object({ conversationId: z.string().uuid(), isTyping: z.boolean() })).output(z.object({ ok: z.boolean() })) };
export const messagingSendTypingContract = contract.sendTyping;
const implementer = implement<typeof contract, ApiContext>(contract);
export const messagingSendTyping = implementer.sendTyping.handler(async ({ input, context }) => {
  if (!context.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  const part = await (db as unknown as { query: { conversationParticipants: { findFirst: (o: unknown) => Promise<unknown> } } }).query.conversationParticipants.findFirst({ where: (t: unknown, { eq: eq2, and: and2 }: { eq: unknown; and: unknown }) => and2(eq2((t as { conversationId: unknown }).conversationId, input.conversationId), eq2((t as { userId: unknown }).userId, context.user!.id)) });
  if (!part) throw new ORPCError("FORBIDDEN", { message: "Forbidden: not a participant" });
  sendTyping(input.conversationId, context.user.id, input.isTyping);
  return { ok: true };
});
`,
          ),
          file(
            "packages/api/src/ws.ts",
            `import { appRouter } from "./router.js";
import type { ApiContext } from "./context.js";
// oRPC WebSocket handler factory — postgres DM-only, uses same router as HTTP
// Adapters: Next/Bun -> @orpc/server/ws or bun-ws, TanStack -> @orpc/server/crossws (experimental)
export function createWsHandler(adapter: "ws" | "bun-ws" | "crossws" = "ws") {
  if (adapter === "crossws") {
    // @ts-ignore — experimental prefix, verified via node_modules/@orpc/server/package.json exports
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@orpc/server/crossws");
    const Cls = (mod.experimental_RPCHandler ?? mod.RPCHandler) as new (router: unknown) => unknown;
    return new Cls(appRouter);
  }
  if (adapter === "bun-ws") {
    const mod = require("@orpc/server/bun-ws");
    const Cls = (mod.RPCHandler ?? mod.BunWsHandler) as new (router: unknown) => unknown;
    return new Cls(appRouter);
  }
  const mod = require("@orpc/server/ws");
  const Cls = (mod.RPCHandler ?? mod.WsHandler) as new (router: unknown) => unknown;
  return new Cls(appRouter);
}
export type WsHandler = ReturnType<typeof createWsHandler>;
`,
          ),
        ]
      : []),
    file(
      "packages/api/src/contract.ts",
      (() => {
        const hasB = hasBilling;
        const hasM = hasMessaging;
        if (hasB && hasM) {
          return `import { healthContract } from "./procedures/health";
import { meContract } from "./procedures/me";
import { billingSubscriptionsContract } from "./procedures/billing/subscriptions";
import { billingCreateCheckoutContract } from "./procedures/billing/create-checkout";
import { billingCreatePortalSessionContract } from "./procedures/billing/create-portal-session";
import { messagingListConversationsContract } from "./procedures/messaging/list-conversations";
import { messagingListMessagesContract } from "./procedures/messaging/list-messages";
import { messagingGetOrCreateConversationContract } from "./procedures/messaging/get-or-create-conversation";
import { messagingSendMessageContract } from "./procedures/messaging/send-message";
import { messagingMarkReadContract } from "./procedures/messaging/mark-read";
import { messagingSendTypingContract } from "./procedures/messaging/send-typing";

export const appContract = {
  health: healthContract,
  me: meContract,
  billing: {
    subscriptions: billingSubscriptionsContract,
    createCheckout: billingCreateCheckoutContract,
    createPortalSession: billingCreatePortalSessionContract,
  },
  messaging: {
    listConversations: messagingListConversationsContract,
    listMessages: messagingListMessagesContract,
    getOrCreateConversation: messagingGetOrCreateConversationContract,
    sendMessage: messagingSendMessageContract,
    markRead: messagingMarkReadContract,
    sendTyping: messagingSendTypingContract,
  },
};
`;
        }
        if (hasB) {
          return `import { healthContract } from "./procedures/health";
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
`;
        }
        if (hasM) {
          return `import { healthContract } from "./procedures/health";
import { meContract } from "./procedures/me";
import { messagingListConversationsContract } from "./procedures/messaging/list-conversations";
import { messagingListMessagesContract } from "./procedures/messaging/list-messages";
import { messagingGetOrCreateConversationContract } from "./procedures/messaging/get-or-create-conversation";
import { messagingSendMessageContract } from "./procedures/messaging/send-message";
import { messagingMarkReadContract } from "./procedures/messaging/mark-read";
import { messagingSendTypingContract } from "./procedures/messaging/send-typing";

export const appContract = {
  health: healthContract,
  me: meContract,
  messaging: {
    listConversations: messagingListConversationsContract,
    listMessages: messagingListMessagesContract,
    getOrCreateConversation: messagingGetOrCreateConversationContract,
    sendMessage: messagingSendMessageContract,
    markRead: messagingMarkReadContract,
    sendTyping: messagingSendTypingContract,
  },
};
`;
        }
        return `import { healthContract } from "./procedures/health";
import { meContract } from "./procedures/me";

export const appContract = {
  health: healthContract,
  me: meContract,
};
`;
      })(),
    ),
    file(
      "packages/api/src/router.ts",
      (() => {
        const hasB = hasBilling;
        const hasM = hasMessaging;
        if (hasB && hasM) {
          return `import { implement, os } from "@orpc/server";
import { appContract } from "./contract";
import { health } from "./procedures/health";
import { me } from "./procedures/me";
import { billingSubscriptions } from "./procedures/billing/subscriptions";
import { billingCreateCheckout } from "./procedures/billing/create-checkout";
import { billingCreatePortalSession } from "./procedures/billing/create-portal-session";
import { messagingListConversations } from "./procedures/messaging/list-conversations";
import { messagingListMessages } from "./procedures/messaging/list-messages";
import { messagingGetOrCreateConversation } from "./procedures/messaging/get-or-create-conversation";
import { messagingSendMessage } from "./procedures/messaging/send-message";
import { messagingMarkRead } from "./procedures/messaging/mark-read";
import { messagingSendTyping } from "./procedures/messaging/send-typing";
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
    messaging: {
      listConversations: messagingListConversations,
      listMessages: messagingListMessages,
      getOrCreateConversation: messagingGetOrCreateConversation,
      sendMessage: messagingSendMessage,
      markRead: messagingMarkRead,
      sendTyping: messagingSendTyping,
    },
  }),
);
`;
        }
        if (hasB) {
          return `import { implement, os } from "@orpc/server";
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
`;
        }
        if (hasM) {
          return `import { implement, os } from "@orpc/server";
import { appContract } from "./contract";
import { health } from "./procedures/health";
import { me } from "./procedures/me";
import { messagingListConversations } from "./procedures/messaging/list-conversations";
import { messagingListMessages } from "./procedures/messaging/list-messages";
import { messagingGetOrCreateConversation } from "./procedures/messaging/get-or-create-conversation";
import { messagingSendMessage } from "./procedures/messaging/send-message";
import { messagingMarkRead } from "./procedures/messaging/mark-read";
import { messagingSendTyping } from "./procedures/messaging/send-typing";
import type { ApiContext } from "./context";

const implementer = implement<typeof appContract, ApiContext>(appContract);

export const appRouter = os.prefix("/api").router(
  implementer.router({
    health,
    me,
    messaging: {
      listConversations: messagingListConversations,
      listMessages: messagingListMessages,
      getOrCreateConversation: messagingGetOrCreateConversation,
      sendMessage: messagingSendMessage,
      markRead: messagingMarkRead,
      sendTyping: messagingSendTyping,
    },
  }),
);
`;
        }
        return `import { implement, os } from "@orpc/server";
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
`;
      })(),
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
