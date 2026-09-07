import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, posix, resolve } from "node:path";
import { analyzeProjectReport } from "../../src/lib/architecture/index.js";
import { FsTransaction } from "../../src/lib/fs.js";

describe("inward domain dependencies", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ghostinit-domain-boundaries-"));
  });

  afterEach(async () => {
    const target = resolve(root);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith("ghostinit-domain-boundaries-")
    ) {
      throw new Error("Unsafe domain-boundary fixture cleanup");
    }
    await rm(target, { recursive: true, force: true });
  });

  async function analyze(files: Record<string, string>) {
    const transaction = new FsTransaction(root);
    for (const [path, content] of Object.entries(files)) {
      await transaction.write(path, content);
    }
    await transaction.commit();
    const report = await analyzeProjectReport(root);
    expect(report.complete, JSON.stringify(report.findings)).toBe(true);
    return report.findings;
  }

  for (const mode of ["single", "monorepo"] as const) {
    const moduleRoot =
      mode === "single" ? "src/server/modules/orders" : "packages/modules/src/orders";
    const billingRoot = mode === "single" ? "src/server/billing" : "packages/billing/src";

    test(`${mode} application uses its domain without a packaging exception`, async () => {
      const findings = await analyze({
        [`${moduleRoot}/domain/order.ts`]:
          "export interface Order { id: string; }\nexport const orderId = 'order';\n",
        [`${moduleRoot}/application/read-order.ts`]:
          'import { orderId, type Order } from "../domain/order.js";\nexport function readOrder(): Order { return { id: orderId }; }\n',
      });
      expect(findings).toEqual([]);
    });

    test(`${mode} provider implements a domain-owned contract`, async () => {
      const findings = await analyze({
        [`${billingRoot}/domain/port.ts`]:
          "export interface BillingPort { checkout(): Promise<string>; }\n",
        [`${billingRoot}/providers/example.ts`]:
          'import type { BillingPort } from "../domain/port.js";\nexport const provider: BillingPort = { checkout: async () => "checkout" };\n',
      });
      expect(findings).toEqual([]);
    });

    test(`${mode} domain rejects application dependencies even when they are types`, async () => {
      const path = `${moduleRoot}/domain/order.ts`;
      const findings = await analyze({
        [path]:
          'import type { OrderService } from "../application/service.js";\nexport interface Order { service: OrderService; }\n',
        [`${moduleRoot}/application/service.ts`]:
          "export interface OrderService { save(): Promise<void>; }\n",
      });
      expect(findings).toContainEqual(
        expect.objectContaining({
          id: "layered-dependency-violation",
          file: path,
          severity: "HIGH",
        }),
      );
    });

    test(`${mode} domain rejects provider dependencies even when they are types`, async () => {
      const path = `${billingRoot}/domain/order.ts`;
      const findings = await analyze({
        [path]:
          'import type { ProviderOrder } from "../providers/example.js";\nexport type Order = ProviderOrder;\n',
        [`${billingRoot}/providers/example.ts`]: "export interface ProviderOrder { id: string; }\n",
      });
      expect(findings).toContainEqual(
        expect.objectContaining({
          id: "layered-dependency-violation",
          file: path,
          severity: "HIGH",
        }),
      );
    });

    test(`${mode} modules reject another module's domain`, async () => {
      const path = `${moduleRoot}/application/read-order.ts`;
      const customerPath = `${moduleRoot.replace(/\/orders$/, "/customers")}/domain/customer.ts`;
      const findings = await analyze({
        [path]:
          'import type { Customer } from "../../customers/domain/customer.js";\nexport type OrderCustomer = Customer;\n',
        [customerPath]: "export interface Customer { id: string; }\n",
      });
      for (const id of ["module-to-module-import", "capability-cross-import"]) {
        expect(findings).toContainEqual(
          expect.objectContaining({ id, file: path, severity: "HIGH" }),
        );
      }
    });

    test(`${mode} modules access persistence only through their database infrastructure`, async () => {
      const databasePath =
        mode === "single" ? "src/server/db/index.ts" : "packages/database/src/index.ts";
      const applicationPath = `${moduleRoot}/application/read-order.ts`;
      const adapterPath = `${moduleRoot}/infrastructure/database/orders.ts`;
      const databaseImport = (path: string) =>
        `import { db } from "${posix.relative(posix.dirname(path), databasePath).replace(/\.ts$/, ".js")}";\nexport const database = db;\n`;
      const findings = await analyze({
        [databasePath]: "export const db = {};\n",
        [applicationPath]: databaseImport(applicationPath),
        [adapterPath]: databaseImport(adapterPath),
      });
      expect(findings.filter(({ id }) => id === "database-import-outside-infrastructure")).toEqual([
        expect.objectContaining({ file: applicationPath, severity: "HIGH" }),
      ]);
    });

    test(`${mode} reserved module names are rejected`, async () => {
      const path = `${moduleRoot.replace(/\/orders$/, "/auth")}/domain/user.ts`;
      const findings = await analyze({ [path]: "export interface User { id: string; }\n" });
      expect(findings).toContainEqual(
        expect.objectContaining({ id: "reserved-module-name", file: path, severity: "BLOCKER" }),
      );
    });
  }

  test("the core package receives the same framework isolation as domain folders", async () => {
    const path = "packages/core/src/order.ts";
    const findings = await analyze({
      "packages/core/package.json": JSON.stringify({
        name: "@repo/core",
        dependencies: { react: "19.2.8" },
      }),
      [path]: 'import { useState } from "react";\nexport const useOrder = useState;\n',
    });
    expect(findings).toContainEqual(
      expect.objectContaining({ id: "domain-imports-framework", file: path, severity: "HIGH" }),
    );
  });

  test("the core package cannot depend on a supporting persistence implementation", async () => {
    const path = "packages/core/src/order.ts";
    const findings = await analyze({
      [path]:
        'import { db } from "../../database/src/index.js";\nexport const orderRepository = db;\n',
      "packages/database/src/index.ts": "export const db = {};\n",
    });
    expect(findings).toContainEqual(
      expect.objectContaining({
        id: "database-import-outside-infrastructure",
        file: path,
        severity: "HIGH",
      }),
    );
  });
});
