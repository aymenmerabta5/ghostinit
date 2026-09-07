export function currentRequestSchemaContent(indentation = 0): string {
  const prefix = " ".repeat(indentation);
  return [
    "z.object({",
    "  user: z.object({",
    "    id: z.string(),",
    "    email: z.string(),",
    "    name: z.string().nullable(),",
    "    role: z.string().nullable(),",
    "    banned: z.boolean(),",
    "  }).nullable(),",
    "  sessionId: z.string().nullable(),",
    "  activeOrganizationId: z.string().nullable(),",
    "  activeTeamId: z.string().nullable(),",
    "})",
  ]
    .map((line) => prefix + line)
    .join("\n");
}
