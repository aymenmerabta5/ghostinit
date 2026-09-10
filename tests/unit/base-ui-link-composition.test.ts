import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import type { ProjectConfig } from "../../src/lib/config";
import { generateProjectFiles } from "../../src/templates/default";

type Framework = "nextjs" | "tanstack-start";
type Mode = "monorepo" | "single";
type Node = Record<string, unknown>;

const MATRIX: Array<{
  label: string;
  mode: Mode;
  framework: Framework;
  billing: ProjectConfig["billing"];
}> = [
  {
    label: "Monorepo Next.js without providers",
    mode: "monorepo",
    framework: "nextjs",
    billing: [],
  },
  {
    label: "Monorepo Next.js with billing",
    mode: "monorepo",
    framework: "nextjs",
    billing: ["stripe"],
  },
  {
    label: "Monorepo TanStack Start without providers",
    mode: "monorepo",
    framework: "tanstack-start",
    billing: [],
  },
  {
    label: "Monorepo TanStack Start with billing",
    mode: "monorepo",
    framework: "tanstack-start",
    billing: ["stripe"],
  },
  { label: "Single Next.js without providers", mode: "single", framework: "nextjs", billing: [] },
  {
    label: "Single Next.js with billing",
    mode: "single",
    framework: "nextjs",
    billing: ["stripe"],
  },
  {
    label: "Single TanStack Start without providers",
    mode: "single",
    framework: "tanstack-start",
    billing: [],
  },
  {
    label: "Single TanStack Start with billing",
    mode: "single",
    framework: "tanstack-start",
    billing: ["stripe"],
  },
];

const TARGETS: Record<Mode, Record<Framework, Record<string, number>>> = {
  monorepo: {
    nextjs: {
      "apps/web/src/components/marketing/hero.tsx": 2,
      "apps/web/src/features/dashboard/components/dashboard-header.tsx": 0,
      "apps/web/src/features/dashboard/components/checks-card.tsx": 1,
      "apps/web/src/features/dashboard/components/identity-card.tsx": 2,
      "apps/web/src/features/dashboard/components/actions-card.tsx": 0,
      "apps/web/src/features/system/not-found.tsx": 1,
      "apps/web/src/features/system/unauthorized.tsx": 1,
      "apps/web/src/features/system/forbidden.tsx": 1,
    },
    "tanstack-start": {
      "apps/web/src/components/marketing/hero.tsx": 2,
      "apps/web/src/features/dashboard/components/dashboard-header.tsx": 0,
      "apps/web/src/features/dashboard/components/checks-card.tsx": 1,
      "apps/web/src/features/dashboard/components/identity-card.tsx": 2,
      "apps/web/src/features/dashboard/components/actions-card.tsx": 0,
      "apps/web/src/features/system/not-found.tsx": 1,
      "apps/web/src/features/system/unauthorized.tsx": 1,
      "apps/web/src/features/system/forbidden.tsx": 1,
    },
  },
  single: {
    nextjs: {
      "src/components/marketing/hero.tsx": 2,
      "src/features/dashboard/dashboard-overview.tsx": 0,
      "src/features/dashboard/components/identity-card.tsx": 2,
      "src/features/dashboard/components/quick-actions.tsx": 0,
      "src/features/system/not-found.tsx": 1,
    },
    "tanstack-start": {
      "src/components/marketing/hero.tsx": 2,
      "src/features/dashboard/dashboard-overview.tsx": 0,
      "src/features/dashboard/components/identity-card.tsx": 2,
      "src/features/dashboard/components/quick-actions.tsx": 0,
      "src/features/system/not-found.tsx": 1,
    },
  },
};

function config(
  mode: Mode,
  framework: Framework,
  billing: ProjectConfig["billing"],
): ProjectConfig {
  return {
    name: "demo",
    runtime: "bun",
    version: "0.1.0",
    mode,
    billing,
    features: [],
    database: "postgres",
    framework,
    apps: ["web"],
  } as ProjectConfig;
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null;
}

function identifierName(value: unknown): string | undefined {
  if (!isNode(value) || value.type !== "JSXIdentifier") return undefined;
  return typeof value.name === "string" ? value.name : undefined;
}

function attribute(opening: Node, name: string): Node | undefined {
  if (!Array.isArray(opening.attributes)) return undefined;
  return opening.attributes.find(
    (candidate): candidate is Node =>
      isNode(candidate) &&
      candidate.type === "JSXAttribute" &&
      identifierName(candidate.name) === name,
  );
}

function stringAttribute(opening: Node, name: string): string | undefined {
  const value = attribute(opening, name)?.value;
  if (!isNode(value) || value.type !== "Literal") return undefined;
  return typeof value.value === "string" ? value.value : undefined;
}

function isExplicitFalse(value: Node | undefined): boolean {
  const container = value?.value;
  if (!isNode(container) || container.type !== "JSXExpressionContainer") return false;
  const expression = container.expression;
  return isNode(expression) && expression.type === "Literal" && expression.value === false;
}

function renderTarget(opening: Node): Node | undefined {
  const container = attribute(opening, "render")?.value;
  if (!isNode(container) || container.type !== "JSXExpressionContainer") return undefined;
  const expression = container.expression;
  if (!isNode(expression) || expression.type !== "JSXElement") return undefined;
  return isNode(expression.openingElement) ? expression.openingElement : undefined;
}

function walk(value: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(value)) {
    for (const entry of value) walk(entry, visit);
    return;
  }
  if (!isNode(value)) return;
  if (typeof value.type === "string") visit(value);
  for (const [key, child] of Object.entries(value)) {
    if (key === "type" || key === "start" || key === "end") continue;
    walk(child, visit);
  }
}

function auditMenuGroups(path: string, source: string): string[] {
  const parsed = parseSync(path, source);
  const violations = parsed.errors.map((error) => `${path}: ${error.message}`);
  const visit = (value: unknown, groups: number): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child, groups);
      return;
    }
    if (!isNode(value)) return;
    const name =
      value.type === "JSXElement" && isNode(value.openingElement)
        ? identifierName(value.openingElement.name)
        : undefined;
    if (name === "DropdownMenu" || name === "DropdownMenuSub") groups = 0;
    if (name === "DropdownMenuGroup") groups += 1;
    if ((name === "DropdownMenuLabel" || name === "DropdownMenuItem") && groups === 0) {
      violations.push(`${path}: ${name} must belong to a DropdownMenuGroup`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "type" && key !== "start" && key !== "end") visit(child, groups);
    }
  };
  visit(parsed.program, 0);
  return violations;
}

function auditLinkButtons(
  path: string,
  source: string,
  framework: Framework,
): { count: number; violations: string[] } {
  const parsed = parseSync(path, source);
  const violations = parsed.errors.map((error) => `${path}: ${error.message}`);
  let count = 0;

  walk(parsed.program, (element) => {
    if (element.type !== "JSXElement" || !isNode(element.openingElement)) return;
    const opening = element.openingElement;
    if (identifierName(opening.name) !== "Button") return;

    const start = typeof opening.start === "number" ? opening.start : 0;
    const end = typeof opening.end === "number" ? opening.end : start;
    const evidence = source.slice(start, end);
    if (attribute(opening, "asChild")) {
      violations.push(`${path}: Radix-only Button asChild in ${evidence}`);
    }

    const target = renderTarget(opening);
    if (!target) return;
    const targetName = identifierName(target.name);
    if (targetName !== "Link" && targetName !== "a") return;
    count += 1;

    if (!isExplicitFalse(attribute(opening, "nativeButton"))) {
      violations.push(`${path}: rendered ${targetName} Button must set nativeButton={false}`);
    }

    const className = stringAttribute(opening, "className") ?? "";
    if (/(?:^|\s)(?:bg-|border-|font-|shadow-|text-)/.test(className)) {
      violations.push(`${path}: link Button className overrides styling: ${className}`);
    }

    if (targetName === "Link") {
      const routerAttribute = framework === "nextjs" ? "href" : "to";
      if (!attribute(target, routerAttribute)) {
        violations.push(`${path}: ${framework} Link is missing ${routerAttribute}`);
      }
    } else {
      const href = stringAttribute(target, "href");
      if (!href) violations.push(`${path}: rendered anchor is missing href`);
      if (href?.startsWith("http")) {
        const rel = stringAttribute(target, "rel") ?? "";
        if (
          stringAttribute(target, "target") !== "_blank" ||
          !rel.split(/\s+/).includes("noreferrer")
        ) {
          violations.push(`${path}: external anchor must use target=_blank and rel=noreferrer`);
        }
      }
    }

    const closing = element.closingElement;
    const bodyEnd = isNode(closing) && typeof closing.start === "number" ? closing.start : end;
    const bodySource = source.slice(end, bodyEnd);
    const accessibleText = bodySource
      .replace(/<[^>]+>/g, " ")
      .replace(/\{[^}]*\}/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const translatedAccessibleName = /\{\s*[A-Za-z_$][\w$]*\(\s*["'][^"']+["']/.test(bodySource);
    if (
      !/[A-Za-z0-9]/.test(accessibleText) &&
      !translatedAccessibleName &&
      !stringAttribute(opening, "aria-label") &&
      !stringAttribute(target, "aria-label")
    ) {
      violations.push(`${path}: rendered ${targetName} Button has no accessible name`);
    }
  });

  return { count, violations };
}

describe("generated Base UI link-button composition", () => {
  for (const entry of MATRIX) {
    test(`${entry.label} uses render composition with router-safe links`, () => {
      const generated = generateProjectFiles(config(entry.mode, entry.framework, entry.billing), {
        dryRun: false,
      });
      const byPath = new Map(generated.map((file) => [file.path, file.content]));
      const violations: string[] = [];
      const sourceRoot = entry.mode === "monorepo" ? "apps/web/src/" : "src/";

      for (const file of generated.filter(
        ({ path }) => path.startsWith(sourceRoot) && path.endsWith(".tsx"),
      )) {
        for (const match of file.content.matchAll(/<Button\b[^>]*\basChild\b[^>]*>/g)) {
          violations.push(`${file.path}: Radix-only Button asChild in ${match[0]}`);
        }
        if (/<DropdownMenu(?:Label|Item)\b/.test(file.content)) {
          violations.push(...auditMenuGroups(file.path, file.content));
        }
      }

      const userMenu = byPath.get(`${sourceRoot}components/header-user-menu.tsx`);
      expect(userMenu).toContain("<DropdownMenuLabel");

      const targets = { ...TARGETS[entry.mode][entry.framework] };
      if (entry.billing.length > 0 && entry.mode === "monorepo" && entry.framework === "nextjs") {
        targets["apps/web/src/features/billing/components/billing-empty.tsx"] = 1;
      }
      if (
        entry.billing.length > 0 &&
        entry.mode === "single" &&
        entry.framework === "tanstack-start"
      ) {
        const route = byPath.get("src/routes/billing.tsx") ?? "";
        if (!route.includes('import { BillingPage } from "@/features/billing/billing-page"')) {
          violations.push("src/routes/billing.tsx: real shared BillingPage is not mounted");
        }
        targets["src/features/billing/billing-page.tsx"] = 0;
        targets["src/features/billing/components/billing-empty-state.tsx"] = 0;
      }
      for (const [path, expectedCount] of Object.entries(targets)) {
        const source = byPath.get(path);
        if (source === undefined) {
          violations.push(`${path}: expected generated file is missing`);
          continue;
        }
        const audit = auditLinkButtons(path, source, entry.framework);
        violations.push(...audit.violations);
        if (audit.count !== expectedCount) {
          violations.push(
            `${path}: expected ${expectedCount} rendered link Button(s), found ${audit.count}`,
          );
        }
      }

      expect(violations).toEqual([]);
    });
  }
});
