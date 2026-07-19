import { ExitCode } from "../../lib/errors.js";
import {
  isInteractiveMode,
  normalizeBillingSelection,
  normalizeFeaturesSelection,
  PROJECT_NAME_RE,
  PROJECT_NAME_MESSAGE,
} from "../../lib/interactive.js";
import type { GlobalOptions } from "../types.js";
import { validateProjectName } from "./validation.js";

class CancelledError extends Error {
  constructor() {
    super("Operation cancelled");
    this.name = "CancelledError";
  }
}

export { CancelledError };

export interface PromptResult {
  name: string;
  mode: "monorepo" | "single";
  framework: "nextjs" | "tanstack-start";
  database: "postgres" | "convex" | "none";
  billing: string[];
  features: string[];
  noInstall: boolean;
  cancelled?: boolean;
  exitCode?: number;
}

export function getIsInteractive(options: GlobalOptions): boolean {
  return isInteractiveMode({
    json: options.json,
    yes: options.yes,
    ci: options.ci,
    isTTY: Boolean(process.stdout.isTTY && process.stdin.isTTY),
  });
}

export async function promptInteractive(
  initialName: string | undefined,
  initial: {
    mode: string;
    framework: string;
    database: string;
    billing: string[];
    features: string[];
    noInstall: boolean;
  },
): Promise<PromptResult> {
  const clackModule = (await import("@clack/prompts")) as unknown as Record<string, unknown> & {
    intro: unknown;
  };
  const p =
    (clackModule.default as typeof import("@clack/prompts") | undefined) ??
    (clackModule as unknown as typeof import("@clack/prompts"));

  p.intro("GhostInit v0.1 — create your project");

  let name = initialName;

  if (!name) {
    const nameResult = await p.text({
      message: "What is your project named?",
      placeholder: "my-app",
      validate(value) {
        if (!value || value.trim().length === 0) return "Project name is required";
        if (!PROJECT_NAME_RE.test(value)) return PROJECT_NAME_MESSAGE;
      },
    });
    if (p.isCancel(nameResult)) {
      p.cancel("Operation cancelled.");
      return {
        name: "",
        mode: initial.mode as any,
        framework: initial.framework as any,
        database: initial.database as any,
        billing: initial.billing,
        features: initial.features,
        noInstall: initial.noInstall,
        cancelled: true,
        exitCode: ExitCode.CANCELLED,
      };
    }
    name = nameResult as string;
  }

  let attempts = 0;
  while (attempts < 5) {
    try {
      validateProjectName(name as string);
      break;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (attempts >= 4) {
        p.cancel(`Invalid project name after ${attempts + 1} attempts: ${reason}`);
        return {
          name: name as string,
          mode: initial.mode as any,
          framework: initial.framework as any,
          database: initial.database as any,
          billing: initial.billing,
          features: initial.features,
          noInstall: initial.noInstall,
          cancelled: true,
          exitCode: ExitCode.CANCELLED,
        };
      }
      const retry = await p.text({
        message: `Project name invalid (${reason}) — please enter a valid name:`,
        placeholder: "my-app",
        initialValue: name,
        validate(value) {
          if (!value || value.trim().length === 0) return "Project name is required";
          try {
            if (value) validateProjectName(value);
          } catch (e) {
            return e instanceof Error ? e.message : PROJECT_NAME_MESSAGE;
          }
          if (!PROJECT_NAME_RE.test(value)) return PROJECT_NAME_MESSAGE;
          return undefined;
        },
      });
      if (p.isCancel(retry)) {
        p.cancel("Operation cancelled.");
        return {
          name: name as string,
          mode: initial.mode as any,
          framework: initial.framework as any,
          database: initial.database as any,
          billing: initial.billing,
          features: initial.features,
          noInstall: initial.noInstall,
          cancelled: true,
          exitCode: ExitCode.CANCELLED,
        };
      }
      name = retry as string;
      attempts++;
    }
  }

  let group: Record<string, unknown>;
  try {
    group = await p.group(
      {
        mode: () =>
          p.select({
            message: "Project structure?",
            initialValue: initial.mode,
            options: [
              {
                value: "monorepo",
                label: "Monorepo",
                hint: "recommended for AI — apps/web + apps/eve + packages/* + apps/api",
              },
              {
                value: "single",
                label: "Single",
                hint: "all-in-one — src/app + server/ + agent/",
              },
            ],
          }),
        framework: () =>
          p.select({
            message: "Frontend framework?",
            initialValue: initial.framework,
            options: [
              { value: "nextjs", label: "Next.js", hint: "App Router 16.2.10 RSC" },
              {
                value: "tanstack-start",
                label: "TanStack Start",
                hint: "Vite + file-based router SSR",
              },
            ],
          }),
        database: () =>
          p.select({
            message: "Database provider?",
            initialValue: initial.database,
            options: [
              { value: "postgres", label: "PostgreSQL", hint: "Drizzle + PG 18.4 (default)" },
              { value: "convex", label: "Convex", hint: "Realtime + serverless" },
              { value: "none", label: "None", hint: "No database" },
            ],
          }),
        billing: () =>
          p.multiselect({
            message: "Billing providers? (space to select, enter to confirm)",
            initialValues: initial.billing.length > 0 ? initial.billing : [],
            required: false,
            options: [
              { value: "none", label: "None", hint: "No billing" },
              { value: "stripe", label: "Stripe", hint: "global cards, subscription-native" },
              { value: "chargily", label: "Chargily", hint: "Algeria EDAHABIA/CIB, checkout-only" },
              { value: "paddle", label: "Paddle", hint: "MoR global tax 5% + 50c" },
              { value: "polar", label: "Polar", hint: "MoR open-source 4% + metering + license" },
            ],
          }),
        features: () =>
          p.multiselect({
            message: "Additional features?",
            initialValues: initial.features,
            required: false,
            options: [
              { value: "eve", label: "Eve", hint: "durable AI agent hybrid via withEve()" },
              { value: "i18n", label: "i18n", hint: "next-intl internationalization" },
            ],
          }),
        install: () =>
          p.confirm({
            message: "Install dependencies with Bun?",
            initialValue: !initial.noInstall,
          }),
      },
      {
        onCancel: () => {
          p.cancel("Operation cancelled.");
          throw new CancelledError();
        },
      },
    );
  } catch (err) {
    if (err instanceof CancelledError) {
      return {
        name: name as string,
        mode: initial.mode as any,
        framework: initial.framework as any,
        database: initial.database as any,
        billing: initial.billing,
        features: initial.features,
        noInstall: initial.noInstall,
        cancelled: true,
        exitCode: ExitCode.CANCELLED,
      };
    }
    throw err;
  }

  if (
    Object.values(group as Record<string, unknown>).some((v) => v === "canceled" || p.isCancel(v))
  ) {
    return {
      name: name as string,
      mode: initial.mode as any,
      framework: initial.framework as any,
      database: initial.database as any,
      billing: initial.billing,
      features: initial.features,
      noInstall: initial.noInstall,
      cancelled: true,
      exitCode: ExitCode.CANCELLED,
    };
  }

  const mode = (group.mode as any) ?? initial.mode;
  const framework = (group.framework as any) ?? initial.framework;
  const database = (group.database as any) ?? initial.database;
  const billing = normalizeBillingSelection((group.billing as string[]) ?? []);
  const features = normalizeFeaturesSelection((group.features as string[]) ?? []);
  const shouldInstall = group.install as boolean | undefined;
  const noInstall = shouldInstall !== undefined ? !shouldInstall : initial.noInstall;

  const billingLabel = billing.length ? ` + billing:${billing.join(",")}` : "";
  const featuresLabel = features.length ? ` + ${features.join(",")}` : "";
  const frameworkLabel = framework ? ` + ${framework}` : "";
  p.outro(
    `Scaffolding ${name} with ${mode}${frameworkLabel} + ${database}${billingLabel}${featuresLabel}...`,
  );

  return {
    name: name as string,
    mode,
    framework,
    database,
    billing,
    features,
    noInstall,
  };
}
