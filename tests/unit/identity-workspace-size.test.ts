import { describe, expect, test } from "bun:test";
import { extname, posix } from "node:path";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import {
  analyzeFrontendFile,
  classifyFrontendFile,
} from "../../src/lib/architecture/frontend/index.js";

type Framework = "nextjs" | "tanstack-start";
type Mode = "monorepo" | "single";

const FEATURE_FILES = [
  "access.ts",
  "permissions.ts",
  "components/invitations-card.tsx",
  "components/invitation-row.tsx",
  "components/members-card.tsx",
  "components/member-identity.tsx",
  "components/member-row.tsx",
  "components/team-members.tsx",
  "components/organizations-card.tsx",
  "components/teams-card.tsx",
  "components/workspace-error.tsx",
  "identity-workspace.tsx",
  "mutations.ts",
  "queries.ts",
  "types.ts",
  "schema.ts",
  "use-workspace-selection.ts",
  "use-workspace-organizations.ts",
  "use-workspace-members.ts",
  "use-workspace-teams.ts",
  "use-workspace-invitations.ts",
  "workspace-organizations.tsx",
  "workspace-members.tsx",
  "workspace-teams.tsx",
  "workspace-invitations.tsx",
] as const;

function config(mode: Mode, framework: Framework): ProjectConfig {
  return projectConfigSchema.parse({
    name: `identity-workspace-${mode}-${framework}`,
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework,
    database: "postgres",
    apps: ["web"],
    preset: "saas",
    cache: "none",
    deploy: "none",
    auth: true,
    api: true,
    email: true,
    analytics: false,
    eve: false,
    i18n: false,
    pdf: false,
    billing: [],
    features: [],
    messaging: false,
    storage: false,
    notifications: false,
    featureFlags: "none",
    jobs: false,
  });
}

function formatSource(path: string, content: string): string {
  const result = Bun.spawnSync([process.execPath, "x", "oxfmt", "--stdin-filepath", path], {
    stdin: new TextEncoder().encode(content),
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.exitCode, `${path}: ${new TextDecoder().decode(result.stderr)}`).toBe(0);
  return new TextDecoder().decode(result.stdout);
}

function importCandidates(path: string, specifier: string, sourceRoot: string): string[] {
  const unresolved = specifier.startsWith("@/")
    ? `${sourceRoot}/${specifier.slice(2)}`
    : posix.normalize(posix.join(posix.dirname(path), specifier));
  const withoutJs = unresolved.replace(/\.js$/, "");
  return [
    unresolved,
    withoutJs,
    `${withoutJs}.ts`,
    `${withoutJs}.tsx`,
    `${withoutJs}/index.ts`,
    `${withoutJs}/index.tsx`,
  ];
}

describe("generated identity workspace boundaries", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} emits bounded parseable files with closed imports`, () => {
        const generated = generateProjectFiles(config(mode, framework), { dryRun: true });
        const byPath = new Map(generated.map((entry) => [entry.path, entry.content]));
        const sourceRoot = mode === "monorepo" ? "apps/web/src" : "src";
        const featureRoot = `${sourceRoot}/features/identity-workspace`;
        const featureFiles = generated.filter(({ path }) => path.startsWith(`${featureRoot}/`));

        const expectedFeatureFiles = [...FEATURE_FILES];
        expect(featureFiles.map(({ path }) => path).sort()).toEqual(
          expectedFeatureFiles.map((name) => `${featureRoot}/${name}`).sort(),
        );

        const unresolvedImports: string[] = [];
        for (const generatedFile of featureFiles) {
          const parsed = parseFile(generatedFile.content, extname(generatedFile.path));
          expect(parsed.diagnostics, generatedFile.path).toEqual([]);
          const formatted = formatSource(generatedFile.path, generatedFile.content);
          if (generatedFile.path.endsWith(".tsx")) {
            const maximum = generatedFile.path.endsWith("/identity-workspace.tsx") ? 120 : 150;
            expect(formatted.split(/\r?\n/).length, generatedFile.path).toBeLessThan(maximum);
          }
          // Workflow ownership and the reviewed 200/20 budgets apply to formatted output.
          const formattedAst = parseFile(formatted, extname(generatedFile.path));
          expect(
            analyzeFrontendFile({
              file: generatedFile.path,
              source: formatted,
              program: formattedAst.program,
              comments: formattedAst.comments,
              imports: formattedAst.importReferences,
            }),
            generatedFile.path,
          ).toEqual([]);
          if (classifyFrontendFile(generatedFile.path) === "workflow")
            expect(generatedFile.path).toMatch(/\/use-workspace-[^/]+\.ts$/);
          expect(generatedFile.content, generatedFile.path).not.toContain("@allow-long");
          if (generatedFile.path.includes("/components/")) {
            expect(parsed.imports, generatedFile.path).not.toContain("@tanstack/react-query");
            expect(parsed.imports, generatedFile.path).not.toContain("@/lib/orpc");
          }

          for (const specifier of parsed.imports.filter(
            (candidate) => candidate.startsWith("./") || candidate.startsWith("@/"),
          )) {
            if (
              !importCandidates(generatedFile.path, specifier, sourceRoot).some((candidate) =>
                byPath.has(candidate),
              )
            ) {
              unresolvedImports.push(`${generatedFile.path} -> ${specifier}`);
            }
          }
        }
        expect(unresolvedImports).toEqual([]);

        const orchestrator = byPath.get(`${featureRoot}/identity-workspace.tsx`);
        expect(orchestrator).toContain('from "./use-workspace-selection"');
        for (const component of [
          "WorkspaceInvitations",
          "WorkspaceMembers",
          "WorkspaceOrganizations",
          "WorkspaceTeams",
        ]) {
          expect(orchestrator, component).toMatch(
            new RegExp(`<${component}\\b[^>]*selection=\\{selection\\}`),
          );
        }
        expect(orchestrator).not.toMatch(/useState\(|useQuery\(|useMutation\(|orpc\.identity/);

        const routePath =
          framework === "nextjs"
            ? `${sourceRoot}/app/settings/workspace/page.tsx`
            : `${sourceRoot}/routes/settings.workspace.tsx`;
        const route = byPath.get(routePath);
        expect(route, routePath).toBeDefined();
        expect(route).toContain('from "@/features/identity-workspace/identity-workspace"');
        expect(parseFile(route ?? "", ".tsx").diagnostics, routePath).toEqual([]);
        expect(formatSource(routePath, route ?? "").split(/\r?\n/).length, routePath).toBeLessThan(
          120,
        );

        const actionSource =
          framework === "nextjs"
            ? (byPath.get(`${sourceRoot}/app/settings/workspace/actions.ts`) ?? "")
            : "";
        const featureSource = [...featureFiles.map(({ content }) => content), actionSource].join(
          "\n",
        );
        for (const operation of [
          "orpc.identity.organizations.list",
          "orpc.identity.organizations.create",
          "orpc.identity.organizations.listMembers",
          "orpc.identity.organizations.changeMemberRole",
          "orpc.identity.organizations.removeMember",
          "orpc.identity.organizations.setActive",
          "orpc.identity.teams.list",
          "orpc.identity.teams.create",
          "orpc.identity.teams.listMembers",
          "orpc.identity.teams.addMember",
          "orpc.identity.teams.removeMember",
          "orpc.identity.teams.setActive",
          "orpc.identity.invitations.list",
          "orpc.identity.invitations.create",
          "orpc.identity.invitations.accept",
          "orpc.identity.invitations.cancel",
        ]) {
          const marker = framework === "nextjs" ? operation.slice(5) : operation;
          expect(featureSource, marker).toContain(marker);
        }
      });
    }
  }
});
