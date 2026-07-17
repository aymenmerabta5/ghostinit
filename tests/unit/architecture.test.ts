import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, symlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeProject } from "../../src/lib/architecture";

describe("architecture checker", () => {
  it("returns no findings for an empty project", async () => {
    const findings = await analyzeProject("/dev/null/nonexistent");
    expect(findings).toEqual([]);
  });

  it("returns empty findings for a non-existent path", async () => {
    const findings = await analyzeProject("/nonexistent/path");
    expect(findings).toEqual([]);
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
});
