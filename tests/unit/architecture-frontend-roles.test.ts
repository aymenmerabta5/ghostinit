import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { analyzeProjectReport } from "../../src/lib/architecture/analyzer.js";
import { getLayerFromFilePath } from "../../src/lib/architecture/rules/layer-policy.js";
import { classifyFrontendFile } from "../../src/lib/architecture/frontend/index.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
async function analyze(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-frontend-roles-"));
  roots.push(root);
  const transaction = new FsTransaction(root);
  await transaction.write(
    "package.json",
    JSON.stringify({ name: "fixture", dependencies: { react: "1", convex: "1", zod: "1" } }),
  );
  for (const [path, source] of Object.entries(files)) await transaction.write(path, source);
  await transaction.commit();
  return analyzeProjectReport(root);
}

describe("resolved frontend roles in the full architecture checker", () => {
  test.each(["src", "apps/web/src", "apps/desktop/src/renderer"])(
    "%s provider-named presentation folders remain checked views",
    async (base) => {
      const report = await analyze({
        [`${base}/features/catalog/components/tabs.tsx`]:
          '"use client"; import { Panel } from "./providers/panel"; export const Tabs = () => <Panel />;',
        [`${base}/features/catalog/components/providers/panel.tsx`]:
          'import { Rows } from "./rows"; export const Panel = () => <Rows />;',
        [`${base}/features/catalog/components/providers/rows.tsx`]:
          "export const Rows = () => <div />;",
      });
      expect(report.findings).toEqual([]);
      expect(
        getLayerFromFilePath(`${base}/features/catalog/components/providers/panel.tsx`)?.name,
      ).toBe("UI");
    },
  );

  test("provider views cannot import backend providers, SDKs, domain implementations, or hide server taint", async () => {
    const report = await analyze({
      "src/features/catalog/components/view.tsx":
        '"use client"; import { bad } from "./providers/panel"; export { bad };',
      "src/features/catalog/components/providers/panel.tsx":
        'import { secret } from "../../../../server/billing/providers/stripe"; export const bad = secret;',
      "src/server/billing/providers/stripe.ts":
        'import "server-only"; export const secret = "private";',
      "src/features/catalog/components/providers/direct.tsx":
        'import Stripe from "stripe"; import { Rule } from "../../../../domain/rule"; export { Stripe, Rule };',
      "src/domain/rule.ts": "export class Rule {}",
    });
    const ids = report.findings.map(({ id }) => id);
    expect(ids).toContain("feature-imports-server-layer");
    expect(ids).toContain("ui-imports-vendor");
    expect(ids).toContain("client-transitive-server-import");
  });

  test("Convex root data adapters may use client references and erased models", async () => {
    const report = await analyze({
      "convex/_generated/api.js":
        'import { anyApi, componentsGeneric } from "convex/server"; export const api = anyApi; export const internal = anyApi; export const components = componentsGeneric();',
      "convex/_generated/dataModel.d.ts": "export type Id<T> = string & { readonly table: T };",
      "src/features/messages/queries.ts":
        '"use client"; import { api } from "../../../convex/_generated/api"; export const list = () => api;',
      "src/features/messages/mutations.ts":
        '"use client"; import { api } from "../../../convex/_generated/api"; export const send = () => api;',
      "src/features/messages/model.ts":
        'import type { Id } from "../../../convex/_generated/dataModel"; export type MessageId = Id<"messages">;',
    });
    expect(report.findings).toEqual([]);
  });

  test("Convex exceptions cannot admit server exports, nested generated trees, runtime models or presentation data clients", async () => {
    const report = await analyze({
      "convex/_generated/api.js": "export const api = {};",
      "convex/_generated/server.js": "export const query = {};",
      "convex/_generated/dataModel.ts": "export const model = {};",
      "src/convex/_generated/api.js": "export const api = {};",
      "src/features/messages/queries.ts":
        '"use client"; import { query } from "../../../convex/_generated/server"; import { api } from "../../convex/_generated/api"; export { query, api };',
      "src/features/messages/model.ts":
        'import { model } from "../../../convex/_generated/dataModel"; export { model };',
      "src/features/messages/components/view.tsx":
        '"use client"; import { api } from "../../../../convex/_generated/api"; export const View = () => <p>{String(api)}</p>;',
    });
    expect(
      report.findings.filter(({ id }) => id === "feature-imports-server-layer").length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      report.findings.some(
        ({ id, specifier }) =>
          id === "feature-imports-server-layer" && specifier === "../../convex/_generated/api",
      ),
    ).toBe(true);
    expect(
      report.findings.some(
        ({ id, file }) =>
          id === "feature-presentation-imports-data-access" && file.endsWith("view.tsx"),
      ),
    ).toBe(true);
    expect(report.findings.some(({ id }) => id === "client-transitive-server-import")).toBe(true);
  });

  test("a generated API filename cannot conceal a transitive server dependency", async () => {
    const report = await analyze({
      "convex/_generated/api.js": 'import { server } from "../secret"; export const api = server;',
      "convex/secret.ts": 'import "server-only"; export const server = {};',
      "src/features/messages/queries.ts":
        '"use client"; import { api } from "../../../convex/_generated/api"; export const query = () => api;',
    });
    expect(
      report.findings.some(
        ({ id, file }) =>
          id === "client-transitive-server-import" && file === "src/features/messages/queries.ts",
      ),
    ).toBe(true);
  });

  test.each(["apps/mobile/src", "apps/desktop/src/renderer", "src/renderer", "src"])(
    "%s auth models are pure supporting contracts",
    async (base) => {
      const app = /^apps\/([^/]+)/.exec(base)?.[1];
      const report = await analyze({
        ...(app
          ? {
              [`apps/${app}/package.json`]: JSON.stringify({
                name: app,
                dependencies: { zod: "1" },
              }),
            }
          : {}),
        [`${base}/lib/auth-client.ts`]:
          'import { isProvider } from "./auth-model"; export { schema } from "./auth-validation"; export { isProvider };',
        [`${base}/lib/auth-model.ts`]:
          'export const isProvider = (value: string) => value === "google";',
        [`${base}/lib/auth-validation.ts`]:
          'import { z } from "zod"; export const schema = z.string();',
      });
      expect(report.findings).toEqual([]);
      expect(getLayerFromFilePath(`${base}/lib/auth-model.ts`)?.name).toBe("Supporting");
      expect(classifyFrontendFile(`${base}/lib/auth-validation.ts`)).toBe("model");
    },
  );

  test("supporting auth filenames cannot smuggle UI hooks or server/network behavior", async () => {
    const report = await analyze({
      "apps/mobile/src/lib/auth-model.ts":
        'import { useState } from "react"; export const value = () => useState(0);',
      "apps/mobile/src/lib/auth-validation.ts":
        'import fs from "node:fs"; export const request = () => fetch("/private"); export { fs };',
    });
    expect(report.findings.some(({ id }) => id === "frontend-model-purity")).toBe(true);
    expect(report.findings.some(({ id }) => id === "frontend-remote-owner")).toBe(true);
    expect(getLayerFromFilePath("apps/mobile/src/lib/auth-model-extra.ts")?.name).toBe("UI");
  });

  test("only observed Convex provider paths are infrastructure", () => {
    for (const path of [
      "apps/web/src/components/providers/convex-client-provider.tsx",
      "apps/mobile/src/components/convex-client-provider.tsx",
      "src/components/convex-client-provider.tsx",
      "src/renderer/lib/providers.tsx",
    ])
      expect(classifyFrontendFile(path)).toBe("infrastructure");
    for (const path of [
      "src/components/providers/receipt.tsx",
      "src/components/providers/unreviewed-provider.tsx",
      "src/features/x/components/providers/provider-card.tsx",
      "src/components/convex-client-provider-copy.tsx",
    ])
      expect(classifyFrontendFile(path)).toBe("view");
  });
});
