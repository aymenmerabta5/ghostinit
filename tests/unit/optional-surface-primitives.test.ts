import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Framework = "nextjs" | "tanstack-start";
type Database = "postgres" | "convex";

function generate(framework: Framework, database: Database): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "optional-primitives",
      runtime: "bun",
      version: "0.1.0",
      mode: "monorepo",
      framework,
      database,
      apps: ["web", "desktop"],
      preset: "custom",
      cache: "none",
      deploy: "none",
      auth: true,
      api: true,
      email: false,
      i18n: true,
      pdf: true,
      billing: [],
      features: [],
      messaging: true,
      storage: true,
      notifications: false,
      featureFlags: "posthog",
      jobs: true,
      jobsUserFacingApi: true,
    }),
    { dryRun: true, validate: true },
  );
}

function read(files: readonly TemplateFile[], path: string): string {
  const found = files.find((entry) => entry.path === path);
  if (!found) throw new Error(`Missing generated file ${path}`);
  return found.content;
}

const rawInteractiveControl = /<(?:button|input|select|textarea)\b/;

describe("optional shadcn and Base UI surface composition", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`${framework}/${database} composes web and Electron optional controls from primitives`, () => {
        const files = generate(framework, database);
        const webMessages = files
          .filter(
            ({ path }) =>
              path.startsWith("apps/web/src/") &&
              /(?:features\/messaging\/|app\/(?:\(app\)\/)?messages|routes\/(?:-components\/)?messages)/.test(
                path,
              ) &&
              path.endsWith(".tsx"),
          )
          .map(({ content }) => content)
          .join("\n");
        const web = [
          read(files, "apps/web/src/features/storage/page.tsx"),
          read(files, "apps/web/src/features/feature-flags/page.tsx"),
          read(files, "apps/web/src/features/jobs/page.tsx"),
          read(files, "apps/web/src/features/pdf/pdf-workspace.tsx"),
          ...files
            .filter(({ path }) =>
              /^apps\/web\/src\/features\/(?:storage|feature-flags|jobs|pdf)\/.+\.tsx$/.test(path),
            )
            .map(({ content }) => content),
          webMessages,
        ].join("\n");
        const desktop = [
          read(files, "apps/desktop/src/renderer/features/storage/page.tsx"),
          read(files, "apps/desktop/src/renderer/features/feature-flags/page.tsx"),
          read(files, "apps/desktop/src/renderer/features/jobs/page.tsx"),
          read(files, "apps/desktop/src/renderer/routes/pdf.tsx"),
          read(files, "apps/desktop/src/renderer/routes/messages.tsx"),
          ...files
            .filter(({ path }) =>
              /^apps\/desktop\/src\/renderer\/features\/(?:storage|feature-flags|jobs|pdf|messaging)\/.+\.tsx$/.test(
                path,
              ),
            )
            .map(({ content }) => content),
        ].join("\n");

        for (const [target, source] of [
          ["web", web],
          ["desktop", desktop],
        ] as const) {
          expect(source, target).not.toMatch(rawInteractiveControl);
          expect(source, target).toContain('from "@/components/ui/button"');
          expect(source, target).toContain('from "@/components/ui/card"');
          expect(source, target).toContain('from "@/components/ui/input"');
          expect(source, target).toContain("<Button");
          expect(source, target).toContain("<Card");
          expect(source, target).not.toContain("space-y-");
        }

        expect(web).toContain('from "@/components/ui/textarea"');
        expect(web).toContain('from "@/components/ui/select"');
        expect(web).toContain("<SelectGroup>");
        expect(web).toContain('from "@/components/ui/alert"');
        expect(desktop).toContain('from "@/components/ui/textarea"');
        expect(desktop).toContain('from "@/components/ui/select"');
        expect(desktop).toContain("<SelectGroup>");
        expect(desktop).toContain('from "@/components/ui/alert"');

        const desktopManifest = JSON.parse(read(files, "apps/desktop/package.json")) as {
          dependencies?: Record<string, string>;
        };
        for (const path of [
          "apps/web/src/features/feature-flags/page.tsx",
          "apps/desktop/src/renderer/features/feature-flags/page.tsx",
        ]) {
          expect(read(files, path)).toContain("useFeatureFlagEvaluation(");
          const workflowPath = path.replace("page.tsx", "use-feature-flag-evaluation.ts");
          const featureFlags = read(files, workflowPath);
          const queryDeclaration = featureFlags.indexOf("const query = useFeatureFlagQuery(");
          const displayedResult = featureFlags.indexOf("result: query.data");
          expect(queryDeclaration, workflowPath).toBeGreaterThan(-1);
          expect(displayedResult, workflowPath).toBeGreaterThan(queryDeclaration);
          expect(featureFlags).not.toContain("const [result, setResult]");
        }
        expect(desktopManifest.dependencies?.["@base-ui/react"]).toBeDefined();
        expect(desktopManifest.dependencies?.["lucide-react"]).toBeDefined();
        expect(read(files, "apps/desktop/src/renderer/components/ui/select.tsx")).toContain(
          'from "@base-ui/react/select"',
        );
        expect(read(files, "apps/desktop/src/renderer/components/ui/textarea.tsx")).toContain(
          'data-slot="textarea"',
        );
        expect(read(files, "apps/desktop/src/renderer/components/ui/alert.tsx")).toContain(
          'data-slot="alert"',
        );
      });
    }
  }
});
