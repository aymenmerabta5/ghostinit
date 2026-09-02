export function notificationsContractContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
import { notificationDeviceDtoSchema, notificationRecordDtoSchema } from "./schemas.js";

const notificationContractErrors = {
  UNAUTHORIZED: { message: "Authentication is required" },
  FORBIDDEN: { message: "The notification operation is not permitted" },
  NOT_FOUND: { message: "The notification was not found" },
  BAD_REQUEST: { message: "The notification request is invalid" },
  CONFLICT: { message: "The notification device belongs to another account" },
  INTERNAL_SERVER_ERROR: { message: "The notification operation could not be committed" },
} as const;

export const notificationsContract = {
  createSelf: oc
    .route({ method: "POST", path: "/notifications/self" })
    .errors(notificationContractErrors)
    .input(z.object({
      kind: z.string().trim().regex(/^[a-z][a-z0-9._-]{0,127}$/),
      title: z.string().trim().min(1).max(160),
      body: z.string().trim().max(2000),
      href: z.string().trim().startsWith("/").max(512).optional(),
      data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    }))
    .output(notificationRecordDtoSchema),
  listInbox: oc
    .route({ method: "GET", path: "/notifications" })
    .errors(notificationContractErrors)
    .input(z.object({
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().min(1).max(512).optional(),
      unreadOnly: z.boolean().optional(),
    }))
    .output(z.object({ items: z.array(notificationRecordDtoSchema), nextCursor: z.string().nullable() })),
  markRead: oc
    .route({ method: "POST", path: "/notifications/{notificationId}/read" })
    .errors(notificationContractErrors)
    .input(z.object({ notificationId: z.string().min(1).max(128) }))
    .output(z.object({ value: notificationRecordDtoSchema, changed: z.boolean() })),
  registerDevice: oc
    .route({ method: "PUT", path: "/notifications/devices/current" })
    .errors(notificationContractErrors)
    .input(z.object({
      platform: z.enum(["web", "ios", "android"]),
      pushToken: z.string().trim().min(16).max(4096),
    }))
    .output(z.object({ value: notificationDeviceDtoSchema, changed: z.boolean() })),
};
`;
}
