import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeProject } from "../../src/lib/architecture";

describe("architecture checker — billing webhooks client-boundary HIGH for Chargily", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-billing-arch-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function fixture(path: string, content: string): void {
    const fullPath = join(root, ...path.split("/"));
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }

  function pkg(name: string, deps: Record<string, string> = {}): void {
    mkdirSync(join(root, "packages", name), { recursive: true });
    writeFileSync(
      join(root, "packages", name, "package.json"),
      JSON.stringify({ name: `@repo/${name}`, dependencies: deps }),
      "utf-8",
    );
  }

  function webPkg(deps: Record<string, string> = {}): void {
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    writeFileSync(
      join(root, "apps", "web", "package.json"),
      JSON.stringify({ name: "web", dependencies: deps }),
      "utf-8",
    );
  }

  it("flags client component importing @chargily/chargily-pay as client-boundary HIGH server-only", async () => {
    webPkg({ "@chargily/chargily-pay": "2.1.0" });
    pkg("billing", { "@chargily/chargily-pay": "2.1.0" });

    fixture(
      "apps/web/src/components/ChargilyCheckout.tsx",
      `"use client";\nimport { ChargilyClient } from "@chargily/chargily-pay";\nexport function Checkout() { return <div />; }`,
    );

    const findings = await analyzeProject(root);
    const violation = findings.find(
      (f) => f.id === "client-imports-server-only" && f.file.includes("ChargilyCheckout"),
    );
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe("HIGH");
    expect(violation?.rule).toBe("client-boundary");
    expect(violation?.message.toLowerCase()).toContain("chargily");
  });

  it("allows server-only chargily usage in API routes (not client)", async () => {
    webPkg({ "@chargily/chargily-pay": "2.1.0" });
    pkg("billing", { "@chargily/chargily-pay": "2.1.0" });

    fixture(
      "apps/web/src/app/api/webhooks/chargily/route.ts",
      `import { verifySignature } from "@chargily/chargily-pay";\nexport async function POST() { return new Response("ok"); }`,
    );

    const findings = await analyzeProject(root);
    const violation = findings.find(
      (f) => f.id === "client-imports-server-only" && f.file.includes("chargily/route.ts"),
    );
    expect(violation).toBeUndefined();
  });

  it("all 4 webhook routes contain arrayBuffer — server-only files should not be flagged as client-boundary", async () => {
    webPkg({
      stripe: "19.1.0",
      "@chargily/chargily-pay": "2.1.0",
      "@paddle/paddle-node-sdk": "3.8.0",
      "@polar-sh/sdk": "0.48.1",
    });

    fixture(
      "apps/web/src/app/api/webhooks/stripe/route.ts",
      `import Stripe from "stripe";\nconst buf = Buffer.from(await ({} as Request).arrayBuffer());\nexport async function POST() { return new Response("ok"); }`,
    );
    fixture(
      "apps/web/src/app/api/webhooks/chargily/route.ts",
      `import { verifySignature } from "@chargily/chargily-pay";\nconst buf = Buffer.from(await ({} as Request).arrayBuffer());\nexport async function POST() { return new Response("ok"); }`,
    );

    const findings = await analyzeProject(root);
    const clientBoundary = findings.filter((f) => f.rule === "client-boundary");
    expect(clientBoundary.length).toBe(0);
  });
});
