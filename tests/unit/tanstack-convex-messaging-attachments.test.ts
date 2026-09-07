import { describe, expect, test } from "bun:test";
import { extname, posix } from "node:path";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { z } from "zod";

type Mode = "monorepo" | "single";

const CLIENT_FILES = [
  "convex-messages.tsx",
  "convex-messaging-data.ts",
  "convex-messaging-queries.ts",
  "convex-attachment-upload.ts",
  "convex-message-composer.tsx",
  "convex-message-thread.tsx",
] as const;

function config(mode: Mode, messaging: boolean, storage: boolean): ProjectConfig {
  return projectConfigSchema.parse({
    name: `tanstack-convex-messaging-${mode}`,
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework: "tanstack-start",
    database: "convex",
    apps: ["web"],
    preset: "custom",
    cache: "none",
    deploy: "none",
    auth: messaging || storage,
    api: messaging || storage,
    email: false,
    analytics: false,
    eve: false,
    i18n: false,
    pdf: false,
    billing: [],
    features: [],
    messaging,
    storage,
    notifications: false,
    featureFlags: "none",
    jobs: false,
  });
}

function formattedLineCount(path: string, content: string): number {
  const result = Bun.spawnSync(
    [process.execPath, "x", "--no-install", "oxfmt", "--stdin-filepath", path],
    {
      stdin: new TextEncoder().encode(content),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  expect(result.exitCode, `${path}: ${new TextDecoder().decode(result.stderr)}`).toBe(0);
  return new TextDecoder().decode(result.stdout).split(/\r?\n/).length;
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
    `${withoutJs}.js`,
    `${withoutJs}.d.ts`,
    `${withoutJs}/index.ts`,
    `${withoutJs}/index.tsx`,
  ];
}

function content(files: Map<string, string>, path: string): string {
  const value = files.get(path);
  expect(value, path).toBeDefined();
  return value ?? "";
}

describe("TanStack Convex web messaging attachments", () => {
  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} validates Convex query DTOs before rendering or selecting a conversation`, () => {
      const generated = generateProjectFiles(config(mode, true, true), { dryRun: true });
      const byPath = new Map(generated.map((entry) => [entry.path, entry.content]));
      const root = mode === "monorepo" ? "apps/web/" : "";
      const componentRoot = `${root}src/routes/-components/messages`;
      const source = content(byPath, `${componentRoot}/convex-messaging-data.ts`);
      const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(
        source.replace(/^import[^\n]*\n/gm, "").replace(/^export /gm, ""),
      );
      const schemas = new Function(
        "z",
        `${javascript}; return { convexConversationSchema, convexConversationListSchema, convexMessagePageSchema, convexTypingListSchema };`,
      )(z) as Record<string, z.ZodType>;
      expect(
        schemas.convexConversationListSchema!.parse([
          { _id: "conversation-1", internal: "not a UI field" },
        ]),
      ).toEqual([{ _id: "conversation-1" }]);
      expect(() => schemas.convexConversationSchema!.parse(null)).toThrow();
      expect(() => schemas.convexConversationSchema!.parse({ _id: "" })).toThrow();
      const page = {
        messages: [
          {
            _id: "message-1",
            body: "hello",
            attachments: [
              {
                id: "attachment-1",
                url: "https://fixture.convex.cloud/api/storage/file-1",
                originalName: "hello.txt",
              },
            ],
          },
        ],
        nextCursor: null,
      };
      expect(schemas.convexMessagePageSchema!.parse(page)).toEqual(page);
      for (const invalid of [
        null,
        { messages: "wrong", nextCursor: null },
        { messages: [{ _id: "message-1", attachments: null }], nextCursor: null },
        { messages: [{ _id: "message-1", body: 42, attachments: [] }], nextCursor: null },
        { ...page, nextCursor: 42 },
      ]) {
        expect(() => schemas.convexMessagePageSchema!.parse(invalid)).toThrow();
      }
      expect(schemas.convexTypingListSchema!.parse([{ userId: "user-1" }])).toEqual([
        { userId: "user-1" },
      ]);
      expect(() => schemas.convexTypingListSchema!.parse([{ userId: 42 }])).toThrow();
      const route = content(byPath, `${root}src/routes/messages.tsx`);
      const messagingPage = content(byPath, `${componentRoot}/convex-messages.tsx`);
      const thread = content(byPath, `${componentRoot}/convex-message-thread.tsx`);
      const queries = content(byPath, `${componentRoot}/convex-messaging-queries.ts`);
      expect(queries).toContain("const rawConversations: unknown = useQuery");
      expect(queries).toContain("rawConversations === undefined ? undefined");
      expect(queries).toContain("convexConversationSchema.parse(await start");
      expect(queries).toContain("const rawMessages: unknown = useQuery");
      expect(queries).toContain("rawMessages === undefined ? undefined");
      expect(route).toContain('from "./-components/messages/convex-messages"');
      expect(route).toContain("component: ConvexMessagesPage");
      expect(route).toContain("requireProtectedRoute(context.queryClient)");
      expect(route).toContain("loadInitialConversations(context)");
      expect(route).not.toContain("React.useState");
      expect(messagingPage).toContain("useConvexConversations()");
      expect(messagingPage).toContain("messagingConversationsQueryKey(scope)");
      expect(thread).toContain("useConvexMessages(conversationId)");
      expect(`${source}\n${queries}\n${route}\n${messagingPage}\n${thread}`).not.toMatch(
        /\bas any\b|@ts-(?:ignore|expect-error|nocheck)/,
      );
    });
    test(`${mode} emits bounded parseable clients with closed imports`, () => {
      const generated = generateProjectFiles(config(mode, true, true), { dryRun: true });
      const byPath = new Map(generated.map((entry) => [entry.path, entry.content]));
      const root = mode === "monorepo" ? "apps/web/" : "";
      const sourceRoot = `${root}src`;
      const componentRoot = `${sourceRoot}/routes/-components/messages`;
      const paths = [
        `${sourceRoot}/routes/messages.tsx`,
        ...CLIENT_FILES.map((name) => `${componentRoot}/${name}`),
      ];

      const unresolvedImports: string[] = [];
      for (const path of paths) {
        const generatedContent = content(byPath, path);
        const parsed = parseFile(generatedContent, extname(path));
        expect(parsed.diagnostics, path).toEqual([]);
        expect(formattedLineCount(path, generatedContent), path).toBeLessThan(
          path.endsWith("/messages.tsx") ? 120 : 150,
        );
        expect(generatedContent, path).not.toContain("@allow-long");
        for (const specifier of parsed.imports.filter(
          (candidate) => candidate.startsWith("./") || candidate.startsWith("@/"),
        )) {
          if (
            !importCandidates(path, specifier, sourceRoot).some((candidate) =>
              byPath.has(candidate),
            )
          ) {
            unresolvedImports.push(`${path} -> ${specifier}`);
          }
        }
      }
      expect(unresolvedImports).toEqual([]);
    });

    test(`${mode} uploads first and submits the returned attachment id`, () => {
      const generated = generateProjectFiles(config(mode, true, true), { dryRun: true });
      const byPath = new Map(generated.map((entry) => [entry.path, entry.content]));
      const root = mode === "monorepo" ? "apps/web/" : "";
      const componentRoot = `${root}src/routes/-components/messages`;
      const upload = content(byPath, `${componentRoot}/convex-attachment-upload.ts`);
      const composer = content(byPath, `${componentRoot}/convex-message-composer.tsx`);
      const thread = content(byPath, `${componentRoot}/convex-message-thread.tsx`);
      const uploadRoute = content(byPath, `${root}src/routes/api/messaging/attachments.ts`);

      expect(upload).toContain('fetch("/api/messaging/attachments"');
      expect(upload).toContain('method: "POST"');
      expect(upload).toContain('credentials: "same-origin"');
      expect(upload).toContain('"X-Ghostinit-Conversation-Id": String(conversationId)');
      expect(upload).toContain('body.append("file", file)');
      expect(upload).toContain('body.append("conversationId", String(conversationId))');
      expect(composer).toContain('type="file"');
      expect(composer).toContain("reusableConvexAttachmentId(");
      expect(composer).toContain("attachmentId = await uploadConvexMessageAttachment(");
      expect(composer).toContain("attachmentIds = [attachmentId]");
      expect(composer).toContain("...(attachmentIds ? { attachmentIds } : {})");
      expect(composer.indexOf("await uploadConvexMessageAttachment(")).toBeLessThan(
        composer.indexOf("await sendMessage({"),
      );
      expect(composer).toContain("if ((!trimmed && !file) || submitInFlight.current) return");
      expect(thread).toContain("href={attachment.url}");
      expect(thread).not.toContain("fetch(");
      expect(thread).not.toContain("/api/messaging/attachments");
      expect(uploadRoute).toContain('import { createServerOnlyFn } from "@tanstack/react-start"');
      expect(uploadRoute).toContain("const dispatchAttachmentUpload = createServerOnlyFn(");
      expect(uploadRoute).toContain("await import(");
      expect(uploadRoute).toContain('"@/server/http/messaging/attachments-upload.server"');
      expect(uploadRoute).toContain("return await uploadConvexAttachment(request)");
      expect(uploadRoute).toContain("POST: ({ request }");
      expect(uploadRoute).toContain("dispatchAttachmentUpload(request)");
      expect(uploadRoute).not.toContain("GET:");
    });

    for (const storage of [false, true] as const) {
      test(`${mode} does not leak messaging attachment UI when messaging is off and storage=${storage}`, () => {
        const generated = generateProjectFiles(config(mode, false, storage), { dryRun: true });
        const root = mode === "monorepo" ? "apps/web/" : "";
        expect(
          generated.some(
            ({ path }) =>
              path === `${root}src/routes/messages.tsx` ||
              path.startsWith(`${root}src/routes/-components/messages/convex-`) ||
              path === `${root}src/routes/api/messaging/attachments.ts` ||
              path === `${root}src/server/http/messaging/attachments-upload.server.ts`,
          ),
        ).toBe(false);
      });
    }
  }
});
