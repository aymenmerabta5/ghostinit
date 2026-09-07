import { describe, expect, it } from "bun:test";
import { billingFiles } from "../../src/templates/billing-generator.js";

function subscriptionsContent(): string {
  return (
    billingFiles({
      mode: "monorepo",
      addons: {
        billing: { inUse: true },
        chargily: { inUse: true },
      } as never,
    }).find((entry) => entry.path.endsWith("providers/chargily/subscriptions.ts"))?.content ?? ""
  );
}

function loadListSubscriptions(client: { listCheckouts: (limit: number) => Promise<unknown> }) {
  const source = subscriptionsContent()
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];\r?\n/g, "")
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/^export /gm, "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  return new Function(
    "ensureServerOnly",
    "getChargilyClient",
    "mapChargilyStatusToDomain",
    `${javascript}; return listChargilySubscriptions;`,
  )(
    () => {},
    () => client,
    () => "active",
  ) as (input?: Record<string, unknown>) => Promise<unknown[]>;
}

describe("Chargily subscription reads fail closed", () => {
  it("propagates SDK failures instead of fabricating an empty successful result", async () => {
    const list = loadListSubscriptions({
      async listCheckouts() {
        throw new Error("provider unavailable");
      },
    });

    await expect(list()).rejects.toThrow("provider unavailable");
  });

  it("rejects provider rows without a stable checkout id", async () => {
    const list = loadListSubscriptions({
      async listCheckouts() {
        return { data: [{ status: "paid", metadata: {} }] };
      },
    });

    await expect(list()).rejects.toThrow("missing a stable id");
  });

  it("does not emit random identifiers or a catch-all empty-list fallback", () => {
    const content = subscriptionsContent();
    expect(content).not.toContain("genId(");
    expect(content).not.toMatch(/catch\s*\{\s*return \[\];/);
    expect(content).toContain("Chargily checkout response is missing a stable id");
  });
});
