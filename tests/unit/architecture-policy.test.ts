import { describe, expect, test } from "bun:test";
import {
  ALLOWED_LAYER_EDGES,
  getLayerFromFilePath,
  getLayerFromImport,
  isLayerEdgeAllowed,
  type ArchitectureLayer,
} from "../../src/lib/architecture/rules/layer-policy.js";
import { isFrameworkEntryPoint } from "../../src/lib/architecture/utils.js";
import { checkVendorIsolation } from "../../src/lib/architecture/rules/vendor.js";

const layers: ArchitectureLayer[] = [
  "UI",
  "Transport",
  "Domain",
  "Application",
  "Vendors",
  "Supporting",
];

describe("architecture layer policy", () => {
  test("publishes an explicit, complete six by six edge matrix", () => {
    expect(Object.keys(ALLOWED_LAYER_EDGES).toSorted()).toEqual([...layers].toSorted());
    const expected: Record<ArchitectureLayer, ArchitectureLayer[]> = {
      UI: layers,
      Transport: ["Transport", "Domain", "Application", "Vendors", "Supporting"],
      Domain: ["Domain", "Supporting"],
      Application: ["Domain", "Application", "Vendors", "Supporting"],
      Vendors: ["Domain", "Vendors", "Supporting"],
      Supporting: ["Supporting"],
    };
    for (const source of layers) {
      for (const target of layers) {
        expect(isLayerEdgeAllowed(source, target), `${source} -> ${target}`).toBe(
          expected[source].includes(target),
        );
      }
    }
  });

  test("classifies all generated runtime families", () => {
    const cases: Array<[string, ArchitectureLayer]> = [
      ["apps/web/src/app/page.tsx", "UI"],
      ["apps/mobile/app/index.tsx", "UI"],
      ["apps/desktop/src/renderer/routes/index.tsx", "UI"],
      ["apps/desktop/src/renderer/adapters/messaging/convex.ts", "Transport"],
      ["src/renderer/adapters/messaging/convex.ts", "Transport"],
      ["apps/mobile/src/adapters/messaging/postgres.ts", "Transport"],
      ["src/adapters/messaging/postgres.ts", "Transport"],
      ["apps/mobile/src/lib/auth-client.ts", "Transport"],
      ["apps/mobile/src/lib/orpc.ts", "Transport"],
      ["apps/mobile/src/lib/realtime.ts", "Transport"],
      ["apps/desktop/src/renderer/lib/orpc.ts", "Transport"],
      ["apps/desktop/src/renderer/lib/realtime.ts", "Transport"],
      ["apps/desktop/src/main.ts", "Transport"],
      ["apps/web/src/app/api/health/route.ts", "Transport"],
      ["apps/web/src/server/http/rpc.server.ts", "Transport"],
      ["apps/web/src/server/http/webhooks/stripe.server.ts", "Transport"],
      ["src/server/http/webhooks/paddle.server.ts", "Transport"],
      ["src/server/http/webhooks/stripe.server.ts", "Transport"],
      ["apps/web/src/server/transport/websocket-auth.ts", "Transport"],
      ["apps/web/server/transport/websocket-auth.ts", "Transport"],
      ["src/server/transport/websocket-auth.ts", "Transport"],
      ["server/transport/websocket-auth.ts", "Transport"],
      ["apps/web/src/server/config/env.ts", "Supporting"],
      ["packages/api/src/index.ts", "Transport"],
      ["packages/api/src/procedures/users.ts", "Transport"],
      ["packages/services/src/application/composition/adapters/identity/convex.ts", "Application"],
      ["packages/core/src/identity/domain/user.ts", "Domain"],
      ["packages/services/src/identity/application/service.ts", "Application"],
      ["packages/jobs-runtime/src/adapters/jobs/postgres.ts", "Application"],
      ["apps/eve/agent/tools/check.ts", "Application"],
      ["packages/billing/src/providers/stripe/client.ts", "Vendors"],
      ["convex/users.ts", "Vendors"],
      ["packages/database/src/index.ts", "Supporting"],
      ["tooling/architecture/src/index.ts", "Supporting"],
      ["src/app/page.tsx", "UI"],
      ["src/routes/api/health.ts", "Transport"],
    ];
    for (const [file, expected] of cases) {
      expect(getLayerFromFilePath(file)?.name, file).toBe(expected);
    }
  });

  test("framework entry recognition is exact and never a global filename bypass", () => {
    expect(isFrameworkEntryPoint("apps/web/src/routes/__root.tsx")).toBe(true);
    expect(isFrameworkEntryPoint("src/router.tsx")).toBe(true);
    expect(isFrameworkEntryPoint("apps/mobile/app/_layout.tsx")).toBe(true);
    expect(isFrameworkEntryPoint("packages/database/src/__root.tsx")).toBe(false);
    expect(isFrameworkEntryPoint("src/components/router.tsx")).toBe(false);
    expect(getLayerFromFilePath("packages/database/src/__root.tsx")?.name).toBe("Supporting");
  });

  test("classifies third-party auth clients as vendors behind typed client transports", () => {
    expect(getLayerFromImport("better-auth/react")?.name).toBe("Vendors");
    expect(getLayerFromImport("better-auth/client/plugins")?.name).toBe("Vendors");
  });

  test("allows provider SDKs only in the explicit server webhook transport tree", () => {
    const serverFindings: Parameters<typeof checkVendorIsolation>[0] = [];
    checkVendorIsolation(
      serverFindings,
      "apps/web/src/server/http/webhooks/stripe.server.ts",
      "stripe",
    );
    checkVendorIsolation(
      serverFindings,
      "src/server/http/webhooks/paddle.server.ts",
      "@paddle/paddle-node-sdk",
    );
    expect(serverFindings).toEqual([]);

    const uiFindings: Parameters<typeof checkVendorIsolation>[0] = [];
    checkVendorIsolation(uiFindings, "apps/web/src/app/billing/page.tsx", "stripe");
    expect(uiFindings).toContainEqual(expect.objectContaining({ id: "ui-imports-vendor" }));
  });
});
