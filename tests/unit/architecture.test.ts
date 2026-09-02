import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, symlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeProject } from "../../src/lib/architecture";

describe("architecture checker", () => {
  it("returns no findings for an empty project", async () => {
    const empty = mkdtempSync(join(tmpdir(), "ghostinit-architecture-empty-"));
    try {
      const findings = await analyzeProject(empty);
      expect(findings).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("fails closed for a non-existent project root", async () => {
    const findings = await analyzeProject(join(tmpdir(), "ghostinit-does-not-exist", "nested"));
    expect(findings).toContainEqual(
      expect.objectContaining({ id: "project-root-unavailable", severity: "BLOCKER" }),
    );
  });
});

describe("architecture checker fixtures", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-architecture-"));
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

  it("parses TSX/JSX files without parse-error findings", async () => {
    webPkg({ react: "^18", "react-dom": "^18" });
    pkg("modules", { react: "^18" });
    pkg("database");
    pkg("auth");

    fixture(
      "apps/web/src/components/Button.tsx",
      `import * as React from "react"\nexport function Button(props: { label: string }) {\n  return <button>{props.label}</button>;\n}`,
    );
    fixture(
      "apps/web/src/app/sign-in/page.tsx",
      `import { SignInForm } from "../../components/SignInForm";\nexport default function Page() { return <SignInForm />; }`,
    );
    fixture(
      "apps/web/src/components/SignInForm.tsx",
      `export function SignInForm() { return <form />; }`,
    );
    fixture(
      "apps/web/src/index.jsx",
      `import { createRoot } from "react-dom/client";\nexport function bootstrap() { return <div />; }`,
    );
    fixture(
      "packages/modules/src/identity/application/index.tsx",
      `import { eq } from "drizzle-orm";\nexport const App = () => <div />;`,
    );

    const findings = await analyzeProject(root);
    const parseErrors = findings.filter((f) => f.id === "parse-error");
    expect(parseErrors).toEqual([]);
  });

  it("detects database imports outside infrastructure/database", async () => {
    pkg("modules", { react: "^18" });
    pkg("database");

    fixture(
      "packages/modules/src/identity/domain/types.ts",
      `export interface UserProfile { id: string; }`,
    );
    fixture(
      "packages/modules/src/identity/application/get-profile.ts",
      `import { db } from "@repo/database";\nexport function get() { return db; }`,
    );
    fixture(
      "packages/modules/src/identity/infrastructure/database/adapter.ts",
      `import { eq } from "drizzle-orm";\nexport function adapter() {}`,
    );

    const findings = await analyzeProject(root);
    const violation = findings.find((f) => f.id === "database-import-outside-infrastructure");
    expect(violation).toBeDefined();
    expect(violation?.file).toContain("application/get-profile.ts");
    expect(violation?.message).toContain("@repo/database");
  });

  it("allows database imports inside infrastructure/database", async () => {
    pkg("modules", {});
    pkg("database");

    fixture(
      "packages/modules/src/identity/infrastructure/database/adapter.ts",
      `import { db } from "@repo/database";\nimport { eq } from "drizzle-orm";\nexport function adapter() {}`,
    );

    const findings = await analyzeProject(root);
    const violation = findings.find((f) => f.id === "database-import-outside-infrastructure");
    expect(violation).toBeUndefined();
  });

  it("detects cross-module imports", async () => {
    pkg("modules");

    fixture(
      "packages/modules/src/identity/application/use-case.ts",
      `import { billing } from "@repo/modules/billing/domain/types";\nexport const a = 1;`,
    );

    const findings = await analyzeProject(root);
    const violation = findings.find((f) => f.id === "module-to-module-import");
    expect(violation).toBeDefined();
    expect(violation?.message).toContain("identity");
    expect(violation?.message).toContain("billing");
  });

  it("detects relative cross-module imports", async () => {
    pkg("modules");

    fixture(
      "packages/modules/src/billing/domain/types.ts",
      `export interface BillingAccount { id: string; }`,
    );
    fixture(
      "packages/modules/src/identity/application/use-case.ts",
      `import { BillingAccount } from "../../billing/domain/types";\nexport const a = 1;`,
    );

    const findings = await analyzeProject(root);
    const violation = findings.find((f) => f.id === "module-to-module-import");
    expect(violation).toBeDefined();
    expect(violation?.message).toContain("identity");
    expect(violation?.message).toContain("billing");
  });

  it("does not flag relative imports within the same module", async () => {
    pkg("modules");

    fixture(
      "packages/modules/src/identity/domain/types.ts",
      `export interface User { id: string; }`,
    );
    fixture(
      "packages/modules/src/identity/application/use-case.ts",
      `import { User } from "../domain/types";\nexport const a = 1;`,
    );

    const findings = await analyzeProject(root);
    const violation = findings.find((f) => f.id === "module-to-module-import");
    expect(violation).toBeUndefined();
  });

  it("flags public index files importing database packages", async () => {
    pkg("modules", {});
    pkg("database");

    fixture(
      "packages/modules/src/identity/index.ts",
      `import { db } from "@repo/database";\nexport const a = 1;`,
    );

    const findings = await analyzeProject(root);
    const violation = findings.find((f) => f.id === "database-import-outside-infrastructure");
    expect(violation).toBeDefined();
    expect(violation?.file).toContain("identity/index.ts");
  });

  it("detects client components importing @repo/api", async () => {
    webPkg();
    pkg("api");

    fixture(
      "apps/web/src/components/ApiConsumer.tsx",
      `"use client";\nimport { api } from "@repo/api";\nexport function ApiConsumer() { return <div />; }`,
    );

    const findings = await analyzeProject(root);
    const violation = findings.find((f) => f.id === "client-imports-server-only");
    expect(violation).toBeDefined();
    expect(violation?.message).toContain("@repo/api");
  });

  it("detects domain layer importing framework packages", async () => {
    pkg("modules", { react: "^18" });

    fixture(
      "packages/modules/src/identity/domain/types.ts",
      `import { useState } from "react";\nexport interface User {}`,
    );

    const findings = await analyzeProject(root);
    const violation = findings.find((f) => f.id === "domain-imports-framework");
    expect(violation).toBeDefined();
    expect(violation?.rule).toBe("domain-purity");
  });

  it("detects undeclared dependencies", async () => {
    webPkg();

    fixture("apps/web/src/index.ts", `import { eq } from "drizzle-orm";\nexport const a = 1;`);

    const findings = await analyzeProject(root);
    const violation = findings.find((f) => f.id === "undeclared-dependency");
    expect(violation).toBeDefined();
    expect(violation?.message).toContain("drizzle-orm");
  });

  it("detects client components importing server-only packages", async () => {
    webPkg();
    pkg("database");
    pkg("auth");

    fixture(
      "apps/web/src/components/Secret.tsx",
      `"use client";\nimport { db } from "@repo/database";\nexport function Secret() { return <div />; }`,
    );

    const findings = await analyzeProject(root);
    const violation = findings.find((f) => f.id === "client-imports-server-only");
    expect(violation).toBeDefined();
    expect(violation?.message).toContain("@repo/database");
  });

  it("detects package dependency cycles", async () => {
    pkg("database", { "@repo/auth": "workspace:*" });
    pkg("auth", { "@repo/database": "workspace:*" });

    fixture("packages/database/src/index.ts", `export const db = {};`);
    fixture("packages/auth/src/index.ts", `export const auth = {};`);

    const findings = await analyzeProject(root);
    const violation = findings.find((f) => f.id === "package-dependency-cycle");
    expect(violation).toBeDefined();
    expect(violation?.file).toContain("package.json");
    expect(violation?.message).toContain("@repo/database");
    expect(violation?.message).toContain("@repo/auth");
  });

  it("detects reserved module names", async () => {
    pkg("modules");

    fixture("packages/modules/src/auth/domain/types.ts", `export interface A {}`);

    const findings = await analyzeProject(root);
    const violation = findings.find((f) => f.id === "reserved-module-name");
    expect(violation).toBeDefined();
    expect(violation?.message).toContain("auth");
  });

  it("rejects symlinks resolving outside project root", async () => {
    webPkg();
    const externalDir = mkdtempSync(join(tmpdir(), "ghostinit-external-"));
    const srcDir = join(root, "apps", "web", "src");
    mkdirSync(srcDir, { recursive: true });
    try {
      writeFileSync(
        join(externalDir, "stolen.ts"),
        `import { db } from "@repo/database";`,
        "utf-8",
      );
      symlinkSync(externalDir, join(srcDir, "external"));
      fixture("apps/web/src/index.ts", `export const a = 1;`);

      const findings = await analyzeProject(root);
      const violation = findings.find((f) => f.id === "path-traversal-risk");
      expect(violation).toBeDefined();
    } finally {
      rmSync(externalDir, { recursive: true, force: true });
    }
  });

  it("scans tests directories", async () => {
    webPkg({ react: "^18" });

    fixture(
      "apps/web/tests/smoke.test.tsx",
      `import { useState } from "react";\nimport { eq } from "drizzle-orm";`,
    );

    const findings = await analyzeProject(root);
    const undeclared = findings.find((f) => f.id === "undeclared-dependency");
    expect(undeclared?.file).toContain("tests/smoke.test.tsx");
  });

  // --- New tests for layered-dependency, vendor, capability, entrypoint skips ---

  it("detects layered violation Supporting->UI upward (packages/database importing apps/web)", async () => {
    // Supporting level 6 importing UI level 1 is forbidden (source.level > target.level)
    // UI->Supporting allowed (1->6 downward), Supporting->UI forbidden
    webPkg({ react: "^18" });
    pkg("database");

    fixture(
      "apps/web/src/components/Button.tsx",
      `export function Button() { return null as any; }`,
    );
    // From packages/database/src/index.ts, go up 3 levels to root then into apps/web
    fixture(
      "packages/database/src/index.ts",
      `import { Button } from "../../../apps/web/src/components/Button";\nexport const db = { Button };`,
    );

    const findings = await analyzeProject(root);
    const violation = findings.find((f) => f.id === "layered-dependency-violation");
    expect(violation).toBeDefined();
    expect(violation?.file).toContain("packages/database/src/index.ts");
    expect(violation?.message).toContain("Supporting");
    expect(violation?.message).toContain("UI");
    expect(violation?.severity).toBe("HIGH");
  });

  it("allows UI importing Transport and Domain downwards", async () => {
    webPkg({ "@repo/api": "workspace:*", "@repo/modules": "workspace:*" });
    pkg("api");
    pkg("modules");
    pkg("core");

    fixture(
      "packages/modules/src/identity/domain/types.ts",
      `export interface User { id: string; }`,
    );
    // UI file importing Transport (@repo/api) and Domain via modules domain path
    fixture(
      "apps/web/src/routes/page.tsx",
      `import { api } from "@repo/api";\nimport { User } from "@repo/modules/identity/domain/types";\nexport function Page() { return api; }`,
    );

    const findings = await analyzeProject(root);
    const layered = findings.filter((f) => f.id === "layered-dependency-violation");
    // UI (1) -> Transport (2) and Domain (3) is downward allowed, should be no violation
    expect(layered).toEqual([]);
  });

  it("keeps WebSocket authentication and API context inside the transport boundary", async () => {
    webPkg({ "@repo/api": "workspace:*" });
    pkg("api");
    fixture(
      "apps/web/tsconfig.json",
      JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } },
      }),
    );
    fixture(
      "apps/web/src/server/transport/websocket-auth.ts",
      'import { createContext } from "@repo/api";\nexport const trustedWebSocketOrigin = createContext;\n',
    );
    fixture(
      "packages/api/src/index.ts",
      "export function createContext(): boolean { return true; }\n",
    );
    fixture(
      "apps/web/src/app/api/ws/route.ts",
      'import { trustedWebSocketOrigin } from "@/server/transport/websocket-auth";\nexport const GET = trustedWebSocketOrigin;\n',
    );

    const findings = await analyzeProject(root);
    expect(
      findings.filter(
        (finding) =>
          finding.id === "layered-dependency-violation" &&
          finding.file === "apps/web/src/app/api/ws/route.ts",
      ),
    ).toEqual([]);
    expect(findings.filter((finding) => finding.id === "unresolved-owned-import")).toEqual([]);
  });

  it("detects vendor direct import from UI - stripe should flag vendor-isolation", async () => {
    webPkg({ stripe: "22.5.0", react: "^18" });
    fixture(
      "apps/web/src/components/Payment.tsx",
      `import Stripe from "stripe";\nexport function Pay() { return Stripe; }`,
    );

    const findings = await analyzeProject(root);
    const violation = findings.find((f) => f.id === "ui-imports-vendor");
    expect(violation).toBeDefined();
    expect(violation?.file).toContain("Payment.tsx");
    expect(violation?.message).toContain("stripe");
    expect(violation?.rule).toBe("vendor-isolation");
    expect(violation?.severity).toBe("HIGH");
  });

  it("detects capability cross-import billing -> email should flag capability-isolation HIGH", async () => {
    // packages/services/src/billing importing @repo/services/email
    pkg("services", { "@repo/services": "workspace:*" });
    // also need email package to avoid undeclared dep noise? not required but create
    pkg("email");

    fixture(
      "packages/services/src/billing/index.ts",
      `import { send } from "@repo/services/email";\nexport function bill() { return send; }`,
    );
    fixture("packages/services/src/email/index.ts", `export function send() {}`);

    const findings = await analyzeProject(root);
    const violation = findings.find((f) => f.id === "capability-cross-import");
    expect(violation).toBeDefined();
    expect(violation?.message).toContain("billing");
    expect(violation?.message).toContain("email");
    expect(violation?.severity).toBe("HIGH");
    expect(violation?.rule).toBe("capability-isolation");
  });

  it("classifies exact framework entries without exempting lookalike package files", async () => {
    webPkg({ "@repo/database": "workspace:*" });
    pkg("database");

    // __root.tsx is treated as framework entrypoint - even if it imports supporting, layered check is skipped
    // router.tsx likewise. UI normally cannot trigger upward violation (top layer), but we test skip logic:
    // The entrypoint should not produce layered-dependency-violation even when importing anything.
    fixture(
      "apps/web/src/routes/__root.tsx",
      `import { db } from "@repo/database";\nexport const root = db;`,
    );
    fixture(
      "apps/web/src/routes/router.tsx",
      `import { db } from "@repo/database";\nexport const r = db;`,
    );
    // A lookalike filename in a supporting package is not a framework entry.
    fixture(
      "packages/database/src/__root.tsx",
      `import { Button } from "../../../apps/web/src/routes/__root";\nexport const x = Button;`,
    );

    const findings = await analyzeProject(root);
    const layered = findings.filter((f) => f.id === "layered-dependency-violation");
    expect(layered).toHaveLength(1);
    expect(layered[0]?.file).toContain("packages/database/src/__root.tsx");
  });

  it("skips intra-module same BC domain<-application for layered check", async () => {
    pkg("modules");

    fixture(
      "packages/modules/src/identity/domain/types.ts",
      `export interface User { id: string; }`,
    );
    // Same bounded context identity: application importing ../domain/types should be allowed for layered
    fixture(
      "packages/modules/src/identity/application/get-user.ts",
      `import { User } from "../domain/types";\nexport function getUser(): User { return { id: "1" } as any; }`,
    );

    const findings = await analyzeProject(root);
    const layered = findings.filter((f) => f.id === "layered-dependency-violation");
    const crossModule = findings.filter((f) => f.id === "module-to-module-import");
    // Intra-module same BC should not flag layered nor module-to-module
    expect(layered).toEqual([]);
    expect(crossModule).toEqual([]);
  });

  it("does not let createServerFn text exempt a top-level client import", async () => {
    webPkg({ "@repo/database": "workspace:*", "@tanstack/react-start": "workspace:*" });
    pkg("database");
    // Package mock for tanstack start to avoid undeclared dep
    mkdirSync(join(root, "packages", "tanstack"), { recursive: true });

    fixture(
      "apps/web/src/routes/ServerFnGuard.tsx",
      `"use client";\nimport { createServerFn } from "@tanstack/react-start";\nimport { db } from "@repo/database";\nexport const myFn = createServerFn(() => { return db; });`,
    );

    const findings = await analyzeProject(root);
    const clientViolations = findings.filter((f) => f.id === "client-imports-server-only");

    // A top-level client import is not made safe by mentioning createServerFn.
    expect(clientViolations).toHaveLength(1);

    // Sanity: same file without createServerFn SHOULD flag
    fixture(
      "apps/web/src/components/ShouldFlag.tsx",
      `"use client";\nimport { db } from "@repo/database";\nexport function Comp() { return db; }`,
    );
    const findings2 = await analyzeProject(root);
    const shouldFlag = findings2.filter(
      (f) => f.id === "client-imports-server-only" && f.file.includes("ShouldFlag.tsx"),
    );
    expect(shouldFlag.length).toBeGreaterThan(0);
  });
});
