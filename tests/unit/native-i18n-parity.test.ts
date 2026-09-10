// @allow-long 620: one focused AST audit keeps native reachability, catalogs, fallbacks, and RTL matrices in sync
import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

describe.each(["stripe", "paddle", "polar"] as const)("%s billing selection", (globalProvider) => {
  type AstNode = Record<string, unknown> & { type: string };
  type Mode = "monorepo" | "single";
  type NativeTarget = "mobile" | "desktop";

  const modes = ["monorepo", "single"] as const;
  const targets = ["mobile", "desktop"] as const;
  const locales = ["en", "fr", "ar"] as const;
  const visibleAttributes = new Set([
    "accessibilityHint",
    "accessibilityLabel",
    "aria-description",
    "aria-label",
    "alt",
    "placeholder",
    "title",
  ]);
  const physicalDirectionClass =
    /\b(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|scroll-ml|scroll-mr)-|\b(?:clear|float|origin|text)-(?:left|right)\b/;
  // Exact product, protocol, and configuration identifiers remain invariant in every locale.
  const invariantTechnicalCopy = new Set([
    "G",
    "Electron 44 • TanStack Router",
    "oRPC + TanStack Query • Better Auth • safeStorage •",
    "• electron-updater",
    "VITE_API_URL",
    "window.desktopBridge",
    "v",
  ]);

  const frontendSurfacePaths: Readonly<Record<NativeTarget, readonly string[]>> = {
    mobile: ["app/_layout.tsx", "app/+not-found.tsx", "app/index.tsx"],
    desktop: [
      "src/renderer/routes/__root.tsx",
      "src/renderer/routes/index.tsx",
      "src/renderer/components/theme-toggle.tsx",
    ],
  };
  const monorepoServerSurfacePaths: Readonly<Record<NativeTarget, readonly string[]>> = {
    mobile: [
      "app/dashboard.tsx",
      "app/settings.tsx",
      "app/billing.tsx",
      "app/admin.tsx",
      "app/workspace.tsx",
      "app/2fa.tsx",
      "app/agent.tsx",
      "app/pdf.tsx",
      "app/(app)/messages.tsx",
      "app/(auth)/sign-in.tsx",
      "app/(auth)/sign-up.tsx",
      "app/(auth)/forgot-password.tsx",
      "app/(auth)/reset-password.tsx",
      "app/(auth)/magic-link.tsx",
      "app/(auth)/verify-email.tsx",
      "src/features/app-shell/header.tsx",
      "src/components/sign-out-button.tsx",
    ],
    desktop: [
      "src/renderer/routes/dashboard.tsx",
      "src/renderer/routes/settings.tsx",
      "src/renderer/routes/billing.tsx",
      "src/renderer/routes/admin.tsx",
      "src/renderer/routes/admin.users.tsx",
      "src/renderer/routes/admin.users.create.tsx",
      "src/renderer/routes/2fa.tsx",
      "src/renderer/routes/agent.tsx",
      "src/renderer/routes/pdf.tsx",
      "src/renderer/routes/messages.tsx",
      "src/renderer/routes/sign-in.tsx",
      "src/renderer/routes/sign-up.tsx",
      "src/renderer/routes/forgot-password.tsx",
      "src/renderer/routes/reset-password.tsx",
      "src/renderer/routes/magic-link.tsx",
      "src/renderer/routes/verify-email.tsx",
      "src/renderer/routes/workspace.tsx",
    ],
  };
  const monorepoFamilyCPaths: Readonly<Record<NativeTarget, readonly string[]>> = {
    mobile: [
      "app/notifications.tsx",
      "app/storage.tsx",
      "app/feature-flags.tsx",
      "app/jobs.tsx",
      "src/features/notifications/page.tsx",
      "src/features/storage/page.tsx",
      "src/features/feature-flags/page.tsx",
      "src/features/jobs/page.tsx",
    ],
    desktop: [
      "src/renderer/routes/notifications.tsx",
      "src/renderer/routes/storage.tsx",
      "src/renderer/routes/feature-flags.tsx",
      "src/renderer/routes/jobs.tsx",
      "src/renderer/features/notifications/page.tsx",
      "src/renderer/features/storage/page.tsx",
      "src/renderer/features/feature-flags/page.tsx",
      "src/renderer/features/jobs/page.tsx",
    ],
  };
  const englishFallbacks: Readonly<Record<Mode, Record<NativeTarget, readonly string[]>>> = {
    monorepo: {
      mobile: ["Not found", "Sign in", "Dashboard", "Billing", "Messages"],
      desktop: ["GhostInit desktop", "Sign in", "Dashboard", "Billing", "Messages"],
    },
    single: {
      mobile: ["Not found", "Your next idea,", "with a head start."],
      desktop: ["GhostInit desktop", "Frontend-only workspace"],
    },
  };

  function generated(mode: Mode, target: NativeTarget, i18n: boolean): TemplateFile[] {
    const isMonorepo = mode === "monorepo";
    const result = resolveCreateConfig({
      name: "native-i18n-parity",
      runtime: "bun",
      mode,
      framework: "nextjs",
      database: isMonorepo ? "postgres" : "none",
      databaseWasExplicit: isMonorepo,
      apps: isMonorepo ? ["web", "mobile", "desktop"] : [target],
      preset: isMonorepo ? "custom" : "frontend",
      cache: isMonorepo ? "redis" : "none",
      deploy: "none",
      billing: isMonorepo ? ["chargily", globalProvider] : [],
      features: [],
      withAuth: isMonorepo,
      withApi: isMonorepo,
      withEmail: isMonorepo,
      withAnalytics: true,
      withEve: isMonorepo,
      withI18n: i18n,
      withPdf: isMonorepo,
      withMessaging: isMonorepo,
      withStorage: isMonorepo,
      withNotifications: isMonorepo,
      featureFlags: isMonorepo ? "posthog" : "none",
      withJobs: isMonorepo,
    });
    if (!result.ok) throw new Error(result.message);
    return generateProjectFiles(result.config, { dryRun: true });
  }

  function prefix(mode: Mode, target: NativeTarget): string {
    if (mode === "single") return "";
    return target === "mobile" ? "apps/mobile/" : "apps/desktop/";
  }

  function platformPath(mode: Mode, target: NativeTarget, path: string): string {
    return `${prefix(mode, target)}${path}`;
  }

  function source(files: readonly TemplateFile[], path: string): string {
    const entry = files.find((candidate) => candidate.path === path);
    if (!entry) throw new Error(`Missing generated file: ${path}`);
    return entry.content;
  }

  function surfaceFiles(
    files: readonly TemplateFile[],
    mode: Mode,
    target: NativeTarget,
  ): TemplateFile[] {
    const root = prefix(mode, target);
    return files.filter(({ path }) => {
      if (!path.startsWith(root)) return false;
      const relative = path.slice(root.length);
      const featureOwner = /\/features\/.+\.(?:tsx|ts)$/.test(relative);
      if (!path.endsWith(".tsx") && !(featureOwner && /\/use-[^/]+\.ts$/.test(relative)))
        return false;
      if (target === "mobile") {
        return (
          relative.startsWith("app/") ||
          relative === "src/components/providers.tsx" ||
          relative === "src/components/sign-out-button.tsx" ||
          relative.startsWith("src/features/")
        );
      }
      return (
        relative.startsWith("src/renderer/routes/") ||
        relative === "src/renderer/components/theme-toggle.tsx" ||
        relative.startsWith("src/renderer/features/")
      );
    });
  }

  function nativeSourceFiles(
    files: readonly TemplateFile[],
    mode: Mode,
    target: NativeTarget,
  ): TemplateFile[] {
    const root = prefix(mode, target);
    return files.filter(({ path }) => {
      if (!path.startsWith(root) || !/\.[cm]?[jt]sx?$/.test(path)) return false;
      const relative = path.slice(root.length);
      if (target === "mobile") {
        return (
          relative.startsWith("app/") ||
          (relative.startsWith("src/") && !relative.startsWith("src/server/"))
        );
      }
      return (
        relative.startsWith("src/renderer/") ||
        relative === "src/main.ts" ||
        relative === "src/preload.ts"
      );
    });
  }

  function runtimePath(mode: Mode, target: NativeTarget): string {
    const relative = target === "mobile" ? "src/lib/i18n.tsx" : "src/renderer/lib/i18n.tsx";
    return platformPath(mode, target, relative);
  }

  function catalogPath(mode: Mode, target: NativeTarget, locale: string): string {
    const root = target === "mobile" ? "src" : "src/renderer";
    return platformPath(mode, target, `${root}/i18n/messages/${locale}.json`);
  }

  function isNode(value: unknown): value is AstNode {
    return (
      typeof value === "object" && value !== null && typeof Reflect.get(value, "type") === "string"
    );
  }

  function walk(
    value: unknown,
    visit: (node: AstNode, parent?: AstNode) => void,
    parent?: AstNode,
  ): void {
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry, visit, parent);
      return;
    }
    if (!isNode(value)) return;
    visit(value, parent);
    for (const [key, child] of Object.entries(value)) {
      if (key === "type" || key === "start" || key === "end") continue;
      walk(child, visit, value);
    }
  }

  function identifier(node: unknown): string | undefined {
    return isNode(node) && (node.type === "Identifier" || node.type === "JSXIdentifier")
      ? typeof node.name === "string"
        ? node.name
        : undefined
      : undefined;
  }

  function literal(node: unknown): string | undefined {
    return isNode(node) && node.type === "Literal" && typeof node.value === "string"
      ? node.value
      : undefined;
  }

  function callName(node: AstNode): string | undefined {
    if (node.type !== "CallExpression") return undefined;
    const direct = identifier(node.callee);
    if (direct) return direct;
    if (!isNode(node.callee) || node.callee.type !== "MemberExpression") return undefined;
    return identifier(node.callee.property);
  }

  function expressionStrings(node: unknown): string[] {
    if (!isNode(node)) return [];
    const direct = literal(node);
    if (direct !== undefined) return [direct];
    if (node.type === "TemplateLiteral" && Array.isArray(node.quasis)) {
      return node.quasis.flatMap((quasi) => {
        if (!isNode(quasi) || typeof quasi.value !== "object" || quasi.value === null) return [];
        const cooked: unknown = Reflect.get(quasi.value, "cooked");
        return typeof cooked === "string" ? [cooked] : [];
      });
    }
    if (node.type === "ConditionalExpression") {
      return [...expressionStrings(node.consequent), ...expressionStrings(node.alternate)];
    }
    if (node.type === "LogicalExpression" || node.type === "BinaryExpression") {
      return [...expressionStrings(node.left), ...expressionStrings(node.right)];
    }
    return [];
  }

  function nestedStrings(node: unknown): string[] {
    const values: string[] = [];
    walk(node, (candidate) => {
      const value = literal(candidate);
      if (value !== undefined) values.push(value);
      if (
        candidate.type !== "TemplateElement" ||
        typeof candidate.value !== "object" ||
        candidate.value === null
      )
        return;
      const cooked: unknown = Reflect.get(candidate.value, "cooked");
      if (typeof cooked === "string") values.push(cooked);
    });
    return values;
  }

  function objectPropertyStrings(node: unknown, propertyName: string): string[] {
    const values: string[] = [];
    walk(node, (candidate) => {
      if (candidate.type !== "Property" || identifier(candidate.key) !== propertyName) return;
      values.push(...expressionStrings(candidate.value));
    });
    return values;
  }

  function readable(value: string): string | undefined {
    const normalized = value.replace(/\s+/g, " ").trim();
    return /\p{L}/u.test(normalized) ? normalized : undefined;
  }

  interface ScreenAudit {
    readonly translations: ReadonlySet<string>;
    readonly hardcoded: readonly string[];
    readonly physicalClasses: readonly string[];
    readonly diagnostics: readonly string[];
    readonly workflowFallbacks: readonly string[];
  }

  function hasCommandOutcomeType(value: unknown): boolean {
    let found = false;
    walk(value, (node) => {
      if (
        node.type === "TSTypeReference" &&
        identifier(node.typeName) === "MessagingCommandOutcome"
      )
        found = true;
    });
    return found;
  }

  function isCommandOutcomeStatus(
    property: AstNode,
    parents: ReadonlyMap<AstNode, AstNode>,
    callbacks: ReadonlySet<string>,
  ): boolean {
    if (
      identifier(property.key) !== "status" ||
      !["ignored", "error", "success"].includes(literal(property.value) ?? "")
    )
      return false;
    let value = parents.get(property);
    if (value?.type !== "ObjectExpression") return false;
    let parent = parents.get(value);
    while (parent?.type === "ConditionalExpression") {
      if (parent.consequent !== value && parent.alternate !== value) return false;
      value = parent;
      parent = parents.get(value);
    }
    if (
      parent?.type !== "CallExpression" ||
      !Array.isArray(parent.arguments) ||
      parent.arguments[0] !== value
    )
      return false;
    if (callbacks.has(identifier(parent.callee) ?? "")) return true;
    if (
      !isNode(parent.callee) ||
      identifier(parent.callee.object) !== "Promise" ||
      identifier(parent.callee.property) !== "resolve"
    )
      return false;
    let owner = parents.get(parent);
    if (owner?.type !== "ReturnStatement") return false;
    while (
      owner &&
      !["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(owner.type)
    )
      owner = parents.get(owner);
    return owner !== undefined && hasCommandOutcomeType(owner.returnType);
  }

  function auditScreen(path: string, content: string): ScreenAudit {
    const parsed = parseSync(path, content);
    const diagnostics = parsed.errors.map((error) => `${path}: ${error.message}`);
    const translators = new Map<string, string>();
    const translations = new Set<string>();
    const hardcoded: string[] = [];
    const physicalClasses: string[] = [];
    const workflowFallbacks: string[] = [];
    const parents = new Map<AstNode, AstNode>();
    const outcomeCallbacks = new Set<string>();
    walk(parsed.program, (node, parent) => {
      if (parent) parents.set(node, parent);
      if (
        node.type === "FunctionDeclaration" &&
        Array.isArray(node.params) &&
        hasCommandOutcomeType(node.params[0])
      ) {
        const name = identifier(node.id);
        if (name) outcomeCallbacks.add(name);
      }
      if (node.type === "VariableDeclarator" && isNode(node.id) && isNode(node.id.typeAnnotation)) {
        const signature = node.id.typeAnnotation.typeAnnotation;
        if (
          isNode(signature) &&
          signature.type === "TSFunctionType" &&
          Array.isArray(signature.params) &&
          hasCommandOutcomeType(signature.params[0])
        ) {
          const name = identifier(node.id);
          if (name) outcomeCallbacks.add(name);
        }
      }
    });
    const recordCopy = (context: string, values: readonly string[]) => {
      for (const value of values) {
        const text = readable(value);
        if (text && !invariantTechnicalCopy.has(text)) {
          hardcoded.push(`${path}: ${context}: ${JSON.stringify(text)}`);
        }
      }
    };

    walk(parsed.program, (node) => {
      if (node.type !== "VariableDeclarator" || !isNode(node.init)) return;
      if (callName(node.init) !== "useTranslations") return;
      const local = identifier(node.id);
      const namespace = Array.isArray(node.init.arguments)
        ? literal(node.init.arguments[0])
        : undefined;
      if (!local || !namespace)
        diagnostics.push(`${path}: useTranslations requires literal namespace`);
      else translators.set(local, namespace);
    });

    walk(parsed.program, (node, parent) => {
      if (node.type === "CallExpression") {
        const name = callName(node);
        if (name && /^use[A-Z]/.test(name) && Array.isArray(node.arguments)) {
          for (const argument of node.arguments) {
            workflowFallbacks.push(
              ...expressionStrings(argument).flatMap((value) => readable(value) ?? []),
            );
          }
        }
        const namespace = name ? translators.get(name) : undefined;
        if (namespace) {
          const key = Array.isArray(node.arguments) ? literal(node.arguments[0]) : undefined;
          if (!key) diagnostics.push(`${path}: ${name} requires a literal translation key`);
          else translations.add(`${namespace}.${key}`);
        }
        if (
          name &&
          /^set(?:[A-Z][A-Za-z0-9]*)?(?:Error|Feedback|Message|Notice|Saved|Status|Success)$/.test(
            name,
          )
        ) {
          recordCopy(
            `${name} state message`,
            Array.isArray(node.arguments) ? expressionStrings(node.arguments[0]) : [],
          );
        }
      }

      if (node.type === "JSXText" && typeof node.value === "string") {
        recordCopy("JSX text", [node.value]);
      }

      if (node.type === "JSXExpressionContainer" && parent?.type !== "JSXAttribute") {
        recordCopy("JSX expression", expressionStrings(node.expression));
      }

      if (
        node.type === "Property" &&
        ["error", "message", "notice", "status", "text", "label", "description", "title"].includes(
          identifier(node.key) ?? "",
        ) &&
        !isCommandOutcomeStatus(node, parents, outcomeCallbacks)
      ) {
        recordCopy(`${identifier(node.key)} state value`, expressionStrings(node.value));
      }
      if (
        node.type === "VariableDeclarator" &&
        /^(?:displayedError|error|feedback|message|notice|status)$/.test(identifier(node.id) ?? "")
      ) {
        recordCopy(`${identifier(node.id)} workflow value`, expressionStrings(node.init));
      }

      if (node.type !== "JSXAttribute") return;
      const name = identifier(node.name);
      const value =
        isNode(node.value) && node.value.type === "JSXExpressionContainer"
          ? expressionStrings(node.value.expression)
          : [literal(node.value) ?? ""];
      if (
        name &&
        (visibleAttributes.has(name) ||
          /(?:Label|Placeholder|Description|Title|Message|Error|Success)$/.test(name))
      )
        recordCopy(`${name} attribute`, value);
      if (
        name === "options" &&
        isNode(node.value) &&
        node.value.type === "JSXExpressionContainer"
      ) {
        recordCopy("navigation title", objectPropertyStrings(node.value.expression, "title"));
      }
      if (name === "className") {
        const classNames = isNode(node.value) ? nestedStrings(node.value) : value;
        for (const className of classNames) {
          if (physicalDirectionClass.test(className)) physicalClasses.push(`${path}: ${className}`);
        }
      }
    });

    return { translations, hardcoded, physicalClasses, diagnostics, workflowFallbacks };
  }

  function leafMessages(value: unknown, path = ""): ReadonlyMap<string, string> {
    if (typeof value !== "object" || value === null) return new Map();
    const leaves = new Map<string, string>();
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (typeof child === "string") leaves.set(childPath, child);
      else if (typeof child === "object" && child !== null)
        for (const [leafPath, message] of leafMessages(child, childPath))
          leaves.set(leafPath, message);
      else leaves.set(childPath, "");
    }
    return leaves;
  }

  describe("maximal native i18n parity", () => {
    test("distinguishes typed command discriminants from visible status and message copy", () => {
      const protocol = `type MessagingCommandOutcome<T> = { status: "ignored" } | { status: "error"; error: Error; isCurrent(): boolean };
function finish(result: MessagingCommandOutcome<void>): void {}
function command(): Promise<MessagingCommandOutcome<void>> {
  let settle!: (result: MessagingCommandOutcome<void>) => void;
  finish({ status: "error", error: new Error("technical failure"), isCurrent: () => true });
  settle(current ? { status: "ignored" } : { status: "ignored" });
  return Promise.resolve({ status: "ignored" });
}`;
      const negative = auditScreen("command.ts", protocol);
      expect(negative.diagnostics).toEqual([]);
      expect(negative.hardcoded).toEqual([]);
      const positive = auditScreen(
        "screen.tsx",
        `${protocol}
const viewState = { status: "error" };
setStatus("ignored");
finish({ status: "error", message: "Payment failed" });
const view = <View statusLabel="error" />;`,
      );
      expect(positive.hardcoded).toHaveLength(4);
      expect(positive.hardcoded.join("\n")).toContain("Payment failed");
    });
    test("audits copy passed through typed props, workflow arguments and template literals", () => {
      const positive = auditScreen(
        "screen.tsx",
        'const status = `Uploaded ${id}`; useConversation("Waiting for an action", "Request failed"); const view = <View submitLabel="Send" />;',
      );
      expect(positive.hardcoded.join("\n")).toContain("Uploaded");
      expect(positive.hardcoded.join("\n")).toContain("Send");
      expect(positive.workflowFallbacks).toEqual(["Waiting for an action", "Request failed"]);
      const negative = auditScreen(
        "screen.tsx",
        'import { useConversation } from "./request-failed"; useConversation(waiting, failed); const view = <View submitLabel={translated} />;',
      );
      expect(negative.hardcoded).toEqual([]);
      expect(negative.workflowFallbacks).toEqual([]);
    });
    test("keeps frontend surfaces in both modes and server-backed surfaces behind a monorepo host", () => {
      for (const target of targets) {
        for (const enabled of [false, true] as const) {
          for (const mode of modes) {
            const files = generated(mode, target, enabled);
            const paths = new Set(files.map(({ path }) => path));
            for (const route of frontendSurfacePaths[target]) {
              expect(
                paths.has(platformPath(mode, target, route)),
                `${mode}/${target}: ${route}`,
              ).toBe(true);
            }
            for (const route of [
              ...monorepoServerSurfacePaths[target],
              ...monorepoFamilyCPaths[target],
            ]) {
              expect(
                paths.has(platformPath(mode, target, route)),
                `${mode}/${target}: ${route}`,
              ).toBe(mode === "monorepo");
            }
          }
        }
      }
    });

    test("rejects maximal single native selections while allowing analytics and i18n", () => {
      for (const target of targets) {
        const result = resolveCreateConfig({
          name: `native-i18n-reachability-${target}`,
          runtime: "bun",
          mode: "single",
          framework: "nextjs",
          database: "postgres",
          databaseWasExplicit: true,
          apps: [target],
          preset: "custom",
          cache: "redis",
          deploy: "none",
          billing: ["chargily", globalProvider],
          features: [],
          withAuth: true,
          withApi: true,
          withEmail: true,
          withAnalytics: true,
          withEve: true,
          withI18n: true,
          withPdf: true,
          withMessaging: true,
          withStorage: true,
          withNotifications: true,
          featureFlags: "posthog",
          withJobs: true,
        });
        expect(result.ok, target).toBe(false);
        if (result.ok) throw new Error(`single ${target} server capabilities must remain blocked`);
        expect(result.reason).toBe("single-native-server-capabilities-unsupported");
        expect(result.unsupportedSelections).toEqual(
          expect.arrayContaining([
            "database:postgres",
            "auth",
            "api",
            "email",
            `billing:${["chargily", globalProvider].sort().join(",")}`,
            "messaging",
            "storage",
            "cache:redis",
            "pdf",
            "eve",
            "notifications",
            "feature-flags:posthog",
            "jobs",
          ]),
        );
        expect(result.unsupportedSelections).not.toContain("analytics");
        expect(result.unsupportedSelections).not.toContain("i18n");
      }
    });

    test("localizes native screen copy through literal catalog keys and enables RTL", () => {
      const violations: string[] = [];
      for (const mode of modes) {
        for (const target of targets) {
          const files = generated(mode, target, true);
          const catalogs = locales.map((locale) =>
            leafMessages(JSON.parse(source(files, catalogPath(mode, target, locale)))),
          );
          const englishPaths = [...(catalogs[0]?.keys() ?? [])].sort();
          for (const [index, catalog] of catalogs.entries()) {
            expect([...catalog.keys()].sort(), `${mode}/${target}/${locales[index]}`).toEqual(
              englishPaths,
            );
            expect(
              [...catalog].filter(([, message]) => message.trim().length === 0),
              `${mode}/${target}/${locales[index]} empty messages`,
            ).toEqual([]);
          }

          const audits = surfaceFiles(files, mode, target).map(({ path, content }) => ({
            path,
            audit: auditScreen(path, content),
          }));
          expect(
            new Set(audits.flatMap(({ audit }) => [...audit.translations])).size,
            `${mode}/${target} extracted native catalog keys`,
          ).toBeGreaterThan(0);
          for (const { audit } of audits) {
            violations.push(...audit.diagnostics, ...audit.hardcoded, ...audit.physicalClasses);
            for (const key of audit.translations) {
              for (const [index, catalog] of catalogs.entries()) {
                const message = catalog.get(key);
                if (!message?.trim())
                  violations.push(`${mode}/${target}/${locales[index]}: missing ${key}`);
              }
            }
          }

          const runtime = `${source(files, runtimePath(mode, target))}\n${source(files, runtimePath(mode, target).replace(/i18n\.tsx$/, "i18n-model.ts"))}`;
          expect(runtime).toContain('ar: "rtl"');
          if (target === "mobile") {
            expect(runtime).toContain("I18nManager.allowRTL(true)");
            expect(runtime).toContain("I18nManager.forceRTL(rtl)");
            expect(runtime).toContain("<View style={{ flex: 1, direction }}>");
          } else {
            expect(runtime).toContain("document.documentElement.lang = locale");
            expect(runtime).toContain("document.documentElement.dir = localeDirection[locale]");
          }
        }
      }
      expect(violations).toEqual([]);
    });

    test("keeps English fallbacks but no native i18n closure when disabled", () => {
      const violations: string[] = [];
      for (const mode of modes) {
        for (const target of targets) {
          const enabled = generated(mode, target, true);
          const disabled = generated(mode, target, false);
          const disabledPaths = new Set(disabled.map(({ path }) => path));
          expect(disabledPaths.has(runtimePath(mode, target))).toBe(false);
          for (const locale of locales)
            expect(disabledPaths.has(catalogPath(mode, target, locale))).toBe(false);

          const disabledNativeSource = nativeSourceFiles(disabled, mode, target)
            .map(({ content }) => content)
            .join("\n");
          expect(disabledNativeSource).not.toMatch(
            /(?:from\s+|import\s*\()\s*["'][^"']*(?:\/i18n|i18n\/)[^"']*["']/,
          );
          expect(disabledNativeSource).not.toContain("useTranslations(");
          const disabledSurfaceSource = surfaceFiles(disabled, mode, target)
            .map(({ content }) => content)
            .join("\n");
          for (const fallback of englishFallbacks[mode][target]) {
            expect(disabledSurfaceSource, `${mode}/${target}: ${fallback}`).toContain(fallback);
          }

          for (const enabledFile of surfaceFiles(enabled, mode, target)) {
            const audit = auditScreen(enabledFile.path, enabledFile.content);
            if (audit.translations.size === 0) continue; // route-only wrappers intentionally have no copy
            const disabledContent = source(disabled, enabledFile.path);
            const disabledAudit = auditScreen(enabledFile.path, disabledContent);
            if (
              disabledAudit.hardcoded.length === 0 &&
              disabledAudit.workflowFallbacks.length === 0
            ) {
              violations.push(
                `${mode}/${target}: ${enabledFile.path} lost its English fallback copy`,
              );
            }
          }
        }
      }
      expect(violations).toEqual([]);
    });
  });
});
