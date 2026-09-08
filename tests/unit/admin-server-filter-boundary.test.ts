import { expect, test } from "bun:test";
import {
  nextAdminUsersPage,
  adminFeatureIndexFile,
} from "../../src/templates/apps/fragments/admin/users-page.js";
import { adminSchemaFiles } from "../../src/templates/apps/fragments/admin/feature-schema.js";

test("Next server reads import filter values from a neutral module instead of the client feature barrel", () => {
  for (const mode of ["single", "monorepo"] as const) {
    const options = {
      mode,
      framework: "next" as const,
      database: "postgres" as const,
      sourceRoot: mode === "single" ? ("src" as const) : ("apps/web/src" as const),
    };
    const page = nextAdminUsersPage(options).content;
    const index = adminFeatureIndexFile(options).content;
    expect(index.startsWith('"use client";')).toBe(true);
    expect(page).toContain('import { AdminUsersFeature } from "@/features/admin-users";');
    expect(page).toContain(
      'import { DEFAULT_ADMIN_USERS_FILTERS } from "@/features/admin-users/types";',
    );
    expect(page).not.toContain("AdminUsersFeature, DEFAULT_ADMIN_USERS_FILTERS");
    const neutral = adminSchemaFiles(options).find(({ path }) =>
      path.endsWith("/types.ts"),
    )!.content;
    expect(neutral).not.toContain('"use client"');
    const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(
      neutral
        .replace(/^import[^;]+;\s*/gm, "")
        .replace(/^export type \{[^}]+\};?\s*/gm, "")
        .replace(/^export /gm, ""),
    );
    const defaults = new Function(`${executable}; return DEFAULT_ADMIN_USERS_FILTERS;`)() as {
      page: number;
      limit: number;
    };
    expect((defaults.page - 1) * defaults.limit).toBe(0);
    expect(defaults.limit).toBe(20);
  }
});
