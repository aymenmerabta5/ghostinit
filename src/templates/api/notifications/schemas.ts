export function notificationsSchemasContent(): string {
  return `import { z } from "zod";

const notificationDataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const notificationRecordDtoSchema = z.object({
  id: z.string().min(1).max(128),
  kind: z.string().min(1).max(128),
  title: z.string(),
  body: z.string(),
  href: z.string().nullable(),
  data: z.record(z.string(), notificationDataValueSchema),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});

export const notificationDeviceDtoSchema = z.object({
  id: z.string().min(1).max(128),
  platform: z.enum(["web", "ios", "android"]),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  disabledAt: z.iso.datetime().nullable(),
});
`;
}
