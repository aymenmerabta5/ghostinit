import { file, type TemplateFile } from "./shared.js";
import type { ProjectMode } from "../lib/addons.js";

function accessContent(): string {
  return `import { createAccessControl } from "better-auth/plugins/access";

const statement = {
  user: ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "get", "update"],
  session: ["list", "revoke", "delete"],
} as const;

export const ac = createAccessControl(statement);

// Role ladder: superAdmin (everything) > admin (manage users) > member (self) > viewer (read-only).
// Rename or extend these to your domain — they are examples, not requirements.

export const superAdmin = ac.newRole({
  user: ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "get", "update"],
  session: ["list", "revoke", "delete"],
});

export const admin = ac.newRole({
  user: ["create", "list", "set-role", "ban", "set-password", "get", "update"],
  session: ["list", "revoke", "delete"],
});

export const member = ac.newRole({
  user: [],
  session: ["list"],
});

export const viewer = ac.newRole({
  user: ["list"],
  session: ["list"],
});
`;
}

export function accessFiles(mode: ProjectMode = "monorepo"): TemplateFile[] {
  if (mode === "single") {
    return [file("src/lib/access.ts", accessContent())];
  }
  // Kernel package already exists via packages/core.ts — only add the access file, do not recreate package.json
  return [file("packages/kernel/src/access.ts", accessContent())];
}
