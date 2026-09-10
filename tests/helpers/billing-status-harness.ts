import { parseSync } from "oxc-parser";
import { posix } from "node:path";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import type { TestElement } from "./generated-form-harness.js";

export const SUBSCRIPTION_CASES = [
  ["active", "subscriptionStatusActive"],
  ["trialing", "subscriptionStatusTrialing"],
  ["past_due", "subscriptionStatusPastDue"],
  ["canceled", "subscriptionStatusCanceled"],
  ["unpaid", "subscriptionStatusUnpaid"],
  ["incomplete", "subscriptionStatusIncomplete"],
  ["incomplete_expired", "subscriptionStatusIncompleteExpired"],
  ["paused", "subscriptionStatusPaused"],
  ["expired", "subscriptionStatusExpired"],
  ["on_trial", "subscriptionStatusOnTrial"],
  ["trial_ended", "subscriptionStatusTrialEnded"],
] as const;
export const INVOICE_CASES = [
  ["draft", "invoiceStatusDraft"],
  ["open", "invoiceStatusOpen"],
  ["paid", "invoiceStatusPaid"],
  ["void", "invoiceStatusVoid"],
  ["uncollectible", "invoiceStatusUncollectible"],
] as const;
export const UNKNOWN_STATUSES = [
  "",
  "future_provider_state",
  "toString",
  "__proto__",
  "constructor",
] as const;
export type BillingTestLocale = "en" | "fr" | "ar";
export type EmittedSources = Map<string, string>;
export interface StatusFunctions {
  formatBillingSubscriptionStatus(status: unknown, translate?: (key: string) => string): string;
  formatBillingInvoiceStatus(status: unknown, translate?: (key: string) => string): string;
}
const CATALOGS = { en: EN_MESSAGES.billing, fr: FR_MESSAGES.billing, ar: AR_MESSAGES.billing };
export function billingTranslate(locale: BillingTestLocale) {
  const catalog: Record<string, unknown> = CATALOGS[locale];
  return (key: string): string => {
    if (!Object.hasOwn(catalog, key) || typeof catalog[key] !== "string")
      throw new Error("Missing emitted billing translation: " + locale + "/" + key);
    return catalog[key];
  };
}
export function emittedSource(files: EmittedSources, path: string): string {
  const source = files.get(path);
  if (source === undefined) throw new Error("Missing emitted file: " + path);
  return source;
}
function parse(path: string, source: string) {
  const parsed = parseSync(path, source);
  if (parsed.errors.length) throw new Error("Emitted syntax error: " + path);
  return parsed.program.body;
}
function exportedFunctions(path: string, source: string): Set<string> {
  return new Set(
    parse(path, source).flatMap((node) =>
      node.type === "ExportNamedDeclaration" &&
      node.declaration?.type === "FunctionDeclaration" &&
      node.declaration.id
        ? [node.declaration.id.name]
        : [],
    ),
  );
}
const transpiler = new Bun.Transpiler({
  loader: "tsx",
  tsconfig: { compilerOptions: { jsx: "react" } },
});
export function evaluateEmitted(
  source: string,
  names: readonly string[],
  bindings: Record<string, unknown> = {},
) {
  let body = source;
  for (const node of parse("emitted.tsx", source)
    .filter((node) => node.type === "ImportDeclaration")
    .reverse())
    body = body.slice(0, node.start) + body.slice(node.end);
  const js = transpiler.transformSync(body.replace(/^export /gm, ""));
  return new Function(...Object.keys(bindings), js + "\nreturn {" + names.join(",") + "};")(
    ...Object.values(bindings),
  ) as Record<string, unknown>;
}
export function statusFunctions(source: string): StatusFunctions {
  return evaluateEmitted(source, [
    "formatBillingSubscriptionStatus",
    "formatBillingInvoiceStatus",
  ]) as unknown as StatusFunctions;
}
function sourceRoot(path: string): string {
  if (path.startsWith("apps/desktop/")) return "apps/desktop/src/renderer";
  if (path.startsWith("apps/mobile/")) return "apps/mobile/src";
  return path.startsWith("apps/web/") ? "apps/web/src" : "src";
}
function localTarget(files: EmittedSources, path: string, specifier: string): string {
  const base = specifier.startsWith("@/")
    ? sourceRoot(path) + "/" + specifier.slice(2)
    : posix.normalize(posix.dirname(path) + "/" + specifier);
  const targets = [
    base,
    base.replace(/\.js$/, ".ts"),
    base.replace(/\.js$/, ".tsx"),
    base + ".ts",
    base + ".tsx",
    base + "/index.ts",
    base + "/index.tsx",
  ];
  const target = targets.find((candidate) => files.has(candidate));
  if (!target) throw new Error("Unresolved emitted import: " + path + " -> " + specifier);
  return target;
}
/** Resolve source imports independently of the injected JSX renderer below. */
export function checkStatusImportClosure(files: EmittedSources): string[] {
  const consumers: string[] = [];
  for (const [path, source] of files) {
    if (!/features\/billing\/.*\.tsx$/.test(path)) continue;
    const imports = parse(path, source).filter((node) => node.type === "ImportDeclaration");
    for (const declaration of imports) {
      const names = declaration.specifiers.flatMap((specifier) => {
        if (specifier.type !== "ImportSpecifier" || specifier.importKind === "type") return [];
        const name =
          specifier.imported.type === "Identifier"
            ? specifier.imported.name
            : specifier.imported.value;
        return /^formatBilling(?:Subscription|Invoice)Status$/.test(name) ? [name] : [];
      });
      if (!names.length) continue;
      if (declaration.importKind === "type")
        throw new Error("Status formatter imported as a type: " + path);
      const target = localTarget(files, path, declaration.source.value);
      if (!target.endsWith("/features/billing/status-labels.ts"))
        throw new Error("Status formatter escaped its feature helper: " + path);
      const exported = exportedFunctions(target, emittedSource(files, target));
      for (const name of names)
        if (!exported.has(name))
          throw new Error("Missing emitted status export: " + target + "#" + name);
      consumers.push(path);
    }
  }
  return [...new Set(consumers)].sort();
}
function element(
  type: unknown,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): unknown {
  if (typeof type === "function") return Reflect.apply(type, undefined, [{ ...props, children }]);
  return { type, props: props ?? {}, children } satisfies TestElement;
}
/** Execute the actual emitted JSX; only leaf primitives and data-owning hooks are substituted. */
export function renderBillingStatusView(
  files: EmittedSources,
  path: string,
  component: string,
  props: Record<string, unknown>,
  locale: BillingTestLocale,
  billing: Record<string, unknown>,
): unknown {
  const source = emittedSource(files, path),
    root = sourceRoot(path);
  const status = statusFunctions(emittedSource(files, root + "/features/billing/status-labels.ts"));
  const translate = billingTranslate(locale);
  const bindings: Record<string, unknown> = {
    React: { createElement: element },
    ...status,
    useSurfaceTranslations: () => translate,
    useSurfaceLocale: () => locale,
    useBillingPage: () => billing,
    supportsBillingPortal: () => true,
  };
  for (const declaration of parse(path, source)) {
    if (declaration.type !== "ImportDeclaration" || declaration.importKind === "type") continue;
    for (const specifier of declaration.specifiers) {
      if (specifier.type === "ImportNamespaceSpecifier" && declaration.source.value === "react")
        continue;
      if (specifier.type !== "ImportSpecifier" || specifier.importKind === "type") continue;
      const name =
        specifier.imported.type === "Identifier"
          ? specifier.imported.name
          : specifier.imported.value;
      const local = specifier.local.name,
        module = declaration.source.value;
      if (name in bindings) {
        bindings[local] = bindings[name];
        continue;
      }
      if (name === "formatBillingInvoiceAmount") {
        bindings[local] = evaluateEmitted(emittedSource(files, localTarget(files, path, module)), [
          name,
        ])[name];
      } else if (name === "BillingInvoices") {
        const target = localTarget(files, path, module);
        bindings[local] = (nextProps: Record<string, unknown>) =>
          renderBillingStatusView(files, target, name, nextProps, locale, billing);
      } else if (
        module.startsWith("@/components/ui/") ||
        module === "react-native" ||
        module.endsWith("/icons") ||
        ["BillingEmptyState", "BillingPaymentLinkForm"].includes(name)
      ) {
        bindings[local] = name;
      } else {
        throw new Error(
          "Undeclared status-render boundary: " + path + " -> " + module + "#" + name,
        );
      }
    }
  }
  const render = evaluateEmitted(source, [component], bindings)[component];
  if (typeof render !== "function") throw new Error("Missing emitted view: " + component);
  return Reflect.apply(render, undefined, [props]);
}
