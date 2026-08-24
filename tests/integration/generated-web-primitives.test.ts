// @allow-long 560: one bounded cross-platform harness owns two generated targets, server readiness, browser interaction, and process-tree cleanup
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { createServer } from "node:net";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { ProjectConfig } from "../../src/lib/config.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { createGeneratedProcessEnv } from "../helpers/generated-web-primitives-env.js";
import { resolveLocalPlaywrightInvocation } from "../helpers/generated-playwright-cli.js";
import { ProcessTreeTerminationError, terminateProcessTree } from "../helpers/process-tree.js";

interface RunningServer {
  child: ChildProcessWithoutNullStreams;
  stdout: () => string;
  stderr: () => string;
}

type BrowserTargetKind = "next-monorepo" | "single-tanstack";

interface BrowserTarget {
  kind: BrowserTargetKind;
  root: string;
  appRoot: string;
  fixturePath: string;
  port: number;
  url: string;
  env: NodeJS.ProcessEnv;
}

type CommandResult =
  | { kind: "exit"; code: number | null }
  | { kind: "error"; error: Error }
  | { kind: "timeout" };

const fixtureRoute = `"use client";

import { useEffect, useState } from "react";
import {
  Field,
  FieldLabel,
  InputGroup,
  InputGroupInput,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type SelectOption,
} from "@/components/ui/select";
import {
  NotificationBell,
  type NotificationItem,
} from "@/components/NotificationBell";
import { PasswordField } from "@/components/form-fields/PasswordField";

const roles: readonly SelectOption[] = [
  { label: "User", value: "user" },
  { label: "Admin", value: "admin" },
];

const notifications: NotificationItem[] = [
  {
    id: "notification-1",
    type: "team_invite",
    payload: { message: "You were invited to the platform team." },
    readAt: null,
    createdAt: "2026-08-23T00:00:00.000Z",
  },
];

export default function PrimitiveContractPage(): React.JSX.Element {
  const [role, setRole] = useState("user");
  const [marked, setMarked] = useState("none");
  const [hydrationState, setHydrationState] = useState("waiting");
  useEffect(() => setHydrationState("ready"), []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Primitive contract</h1>
      <Field>
        <FieldLabel htmlFor="name">Name</FieldLabel>
        <InputGroup>
          <InputGroupInput id="name" />
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel id="role-label">Role</FieldLabel>
        <Select items={roles} value={role} onValueChange={setRole}>
          <SelectTrigger aria-labelledby="role-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Select items={roles} value="user" disabled>
        <SelectTrigger aria-label="Disabled role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <PasswordField id="disabled-password" label="Disabled password" disabled defaultValue="secret" />
      <NotificationBell notifications={notifications} onMarkRead={setMarked} />
      <output data-testid="role-value">{role}</output>
      <output data-testid="disabled-role-value">user</output>
      <output data-testid="marked-value">{marked}</output>
      <output data-testid="hydration-state" className="sr-only">{hydrationState}</output>
    </main>
  );
}
`;

function fixtureRouteFor(kind: BrowserTargetKind): string {
  if (kind === "next-monorepo") return fixtureRoute;
  return fixtureRoute
    .replace(
      'import { useEffect, useState } from "react";',
      'import { useEffect, useState } from "react";\nimport { createFileRoute } from "@tanstack/react-router";',
    )
    .concat(
      '\nexport const Route = createFileRoute("/primitive-contract")({ component: PrimitiveContractPage });\n',
    );
}

const playwrightSpec = `import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectFocusVisible(locator: Locator): Promise<void> {
  await expect(locator).toBeFocused();
  expect(await locator.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
}

async function expectActiveFocusVisible(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.activeElement?.matches(":focus-visible"))).toBe(true);
}

test("shared primitives preserve keyboard, focus, controlled value, and mark-read behavior", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/primitive-contract");
  await expect(page.getByTestId("hydration-state")).toHaveText("ready", { timeout: 30_000 });
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  const nameInput = page.getByLabel("Name");
  await page.locator('label[for="name"]').click();
  await expect(nameInput).toBeFocused();

  await page.keyboard.press("Tab");
  const roleTrigger = page.getByRole("combobox", { name: "Role", exact: true });
  await expectFocusVisible(roleTrigger);

  await page.keyboard.press("Space");
  await expect(page.getByRole("option", { name: "Admin" })).toBeVisible();
  await expectActiveFocusVisible(page);

  await page.keyboard.press("ArrowDown");
  await expectActiveFocusVisible(page);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("role-value")).toHaveText("admin");
  await expectFocusVisible(roleTrigger);

  await page.keyboard.press("Tab");
  const notificationTrigger = page.getByRole("button", { name: "Notifications" });
  await expectFocusVisible(notificationTrigger);
  await page.keyboard.press("Enter");

  const unreadNotification = page.getByRole("button", { name: /Team Invite/ });
  await expect(unreadNotification).toBeVisible();
  const unreadIsFocused = await unreadNotification.evaluate(
    (element) => element === element.ownerDocument.activeElement,
  );
  if (!unreadIsFocused) await page.keyboard.press("Tab");
  await expectFocusVisible(unreadNotification);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("marked-value")).toHaveText("notification-1");
  await expectFocusVisible(unreadNotification);
  await page.keyboard.press("Escape");

  const disabledTrigger = page.getByRole("combobox", { name: "Disabled role", exact: true });
  await expect(disabledTrigger).toBeDisabled();
  await expect(disabledTrigger).toHaveAttribute("data-disabled", "");
  await expect(disabledTrigger).toHaveAttribute("aria-expanded", "false");
  await nameInput.focus();
  await disabledTrigger.focus();
  await expect(disabledTrigger).not.toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(disabledTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("disabled-role-value")).toHaveText("user");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await disabledTrigger.click({ force: true });
  await expect(disabledTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("disabled-role-value")).toHaveText("user");
  await expect(page.getByRole("listbox")).toHaveCount(0);

  const disabledPassword = page.getByLabel("Disabled password");
  const disabledReveal = page.getByRole("button", { name: "Show password" });
  await expect(disabledPassword).toBeDisabled();
  await expect(disabledPassword).toHaveAttribute("type", "password");
  await expect(disabledReveal).toBeDisabled();
  await disabledReveal.click({ force: true });
  await expect(disabledPassword).toHaveAttribute("type", "password");
});
`;

function projectConfig(kind: BrowserTargetKind): ProjectConfig {
  return {
    name: "primitive-contract",
    runtime: "bun",
    version: "0.1.0",
    mode: kind === "next-monorepo" ? "monorepo" : "single",
    preset: kind === "next-monorepo" ? "saas" : "custom",
    cache: "none",
    deploy: "none",
    billing: [],
    features: [],
    database: "postgres",
    framework: kind === "next-monorepo" ? "nextjs" : "tanstack-start",
    apps: ["web"],
    ...(kind === "single-tanstack"
      ? { auth: false, api: false, email: false, analytics: false }
      : {}),
  };
}

async function writeGeneratedFixture(
  root: string,
  kind: BrowserTargetKind,
): Promise<{ appRoot: string; fixturePath: string }> {
  const transaction = new FsTransaction(root);
  const files = generateProjectFiles(projectConfig(kind), { dryRun: false });
  for (const file of files) await transaction.write(file.path, file.content);
  const appRoot = kind === "next-monorepo" ? join(root, "apps", "web") : root;
  const fixturePath =
    kind === "next-monorepo"
      ? "apps/web/src/app/primitive-contract/page.tsx"
      : "src/routes/primitive-contract.tsx";
  await transaction.write(fixturePath, fixtureRouteFor(kind));
  if (kind === "next-monorepo") {
    await transaction.write("apps/web/e2e/__primitive-contract.spec.ts", playwrightSpec);
  }
  const stagedPaths = transaction.getStagedFiles().map(({ path }) => path);
  expect(stagedPaths).toContain(".env.local");
  expect(stagedPaths).toContain(fixturePath);
  if (kind === "next-monorepo") {
    expect(stagedPaths).toContain("apps/web/e2e/__primitive-contract.spec.ts");
  }
  await transaction.commit();
  expect(existsSync(join(root, ".env.local"))).toBe(true);
  return { appRoot, fixturePath };
}

export async function reservePort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Unable to reserve a TCP port"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(port);
      });
    });
  });
}

function capture(child: ChildProcessWithoutNullStreams): {
  stdout: () => string;
  stderr: () => string;
} {
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  return { stdout: () => stdout, stderr: () => stderr };
}

async function runBounded(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<void> {
  const child = spawn(command, args, {
    cwd,
    env,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = capture(child);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const exit: Promise<CommandResult> = new Promise((resolveResult) => {
    child.once("exit", (code) => resolveResult({ kind: "exit", code }));
    child.once("error", (error) => resolveResult({ kind: "error", error }));
  });
  const timeout: Promise<CommandResult> = new Promise((resolveResult) => {
    timer = setTimeout(() => resolveResult({ kind: "timeout" }), timeoutMs);
  });

  try {
    const result = await Promise.race([exit, timeout]);
    if (timer !== undefined) clearTimeout(timer);
    if (result.kind === "timeout") {
      await terminateProcessTree(child);
      throw new Error(
        `Timed out running ${command} ${args.join(" ")}\n${output.stderr().slice(-12_000)}`,
      );
    }
    if (result.kind === "error") throw result.error;
    if (result.code !== 0) {
      throw new Error(
        `Command failed (${result.code}): ${command} ${args.join(" ")}\n${output.stdout().slice(-12_000)}\n${output.stderr().slice(-12_000)}`,
      );
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) await terminateProcessTree(child);
  }
}

async function runBun(cwd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const bun = Bun.which("bun");
  if (bun === null) throw new Error("bun executable was not found");
  await runBounded(nativeExecutable("bun", bun), args, cwd, env, 600_000);
}

async function runBunx(cwd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const bunx = Bun.which("bunx");
  if (bunx === null) throw new Error("bunx executable was not found");
  await runBounded(nativeExecutable("bunx", bunx), args, cwd, env, 120_000);
}

function nativeExecutable(name: "bun" | "bunx", resolved: string): string {
  if (process.platform !== "win32" || !/\.(?:cmd|bat)$/i.test(resolved)) return resolved;
  return Bun.which(`${name}.exe`) ?? resolved;
}

export function startServer(target: BrowserTarget): RunningServer {
  const bun = Bun.which("bun");
  if (bun === null) throw new Error("bun executable was not found");
  const args =
    target.kind === "next-monorepo"
      ? ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(target.port)]
      : ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(target.port)];
  const child = spawn(nativeExecutable("bun", bun), args, {
    cwd: target.appRoot,
    env: target.env,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = capture(child);
  return { child, ...output };
}

export async function waitForHttp200(
  url: string,
  server: RunningServer,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null || server.child.signalCode !== null) {
      throw new Error(`Generated server exited before readiness:\n${server.stderr()}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.status === 200) return;
    } catch {
      // The readiness endpoint is not accepting connections yet.
    }
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${url}:\n${server.stderr()}`);
}

export async function runLocalPlaywright(
  webRoot: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const invocation = resolveLocalPlaywrightInvocation(webRoot, args);
  await runBounded(invocation.command, invocation.args, webRoot, env, 300_000);
}

async function runStage(label: string, operation: () => Promise<void>): Promise<void> {
  const startedAt = Date.now();
  console.log(`[generated-web-primitives] ${label}: start`);
  try {
    await operation();
  } finally {
    console.log(`[generated-web-primitives] ${label}: ${Date.now() - startedAt}ms`);
  }
}

function verifyTempRoot(root: string): void {
  const absoluteRoot = resolve(root);
  const relativeToTemp = relative(resolve(tmpdir()), absoluteRoot);
  if (
    relativeToTemp === "" ||
    relativeToTemp.startsWith("..") ||
    isAbsolute(relativeToTemp) ||
    !basename(absoluteRoot).startsWith("ghostinit-web-primitives-")
  ) {
    throw new Error(`Refusing to remove unverified temp root: ${absoluteRoot}`);
  }
}

describe("generated web primitive interactions", () => {
  test("Next monorepo and single TanStack primitives share the interaction contract", async () => {
    const roots = [
      mkdtempSync(join(tmpdir(), "ghostinit-web-primitives-")),
      mkdtempSync(join(tmpdir(), "ghostinit-web-primitives-")),
    ];
    const targets: BrowserTarget[] = [];
    const servers = new Map<string, RunningServer>();
    const rootRemovalAllowed = new Map(roots.map((root) => [root, true]));
    let operationError: unknown;
    try {
      for (const [index, kind] of (["next-monorepo", "single-tanstack"] as const).entries()) {
        const root = roots[index];
        let generated: { appRoot: string; fixturePath: string } | undefined;
        await runStage(`${kind} generate fixture`, async () => {
          generated = await writeGeneratedFixture(root, kind);
        });
        if (generated === undefined) throw new Error(`Failed to generate ${kind}`);
        const port = await reservePort();
        const url = `http://127.0.0.1:${port}`;
        const env = createGeneratedProcessEnv(root, url);
        expect(env.POSTGRES_PASSWORD).toBeTruthy();
        expect(env.BETTER_AUTH_SECRET?.length).toBeGreaterThanOrEqual(32);
        expect(env.BETTER_AUTH_URL).toBeTruthy();
        expect(env.NEXT_PUBLIC_APP_URL).toBe(url);
        expect(env.VITE_APP_URL).toBe(url);
        targets.push({ kind, root, ...generated, port, url, env });
      }

      const nextTarget = targets[0];
      const tanstackTarget = targets[1];
      await Promise.all([
        runStage("next-monorepo bun install", () =>
          runBun(nextTarget.root, ["install"], nextTarget.env),
        ),
        runStage("single-tanstack bun install", () =>
          runBun(tanstackTarget.root, ["install"], tanstackTarget.env),
        ),
      ]);
      expect(
        existsSync(join(nextTarget.appRoot, "node_modules", "@playwright", "test", "package.json")),
      ).toBe(true);

      for (const target of targets) {
        if (target.kind === "single-tanstack") {
          await runStage("single-tanstack route generation", () =>
            runBunx(target.appRoot, ["--no-install", "tsr", "generate"], target.env),
          );
        }
        await runStage(`${target.kind} Playwright Chromium provisioning`, () =>
          runLocalPlaywright(nextTarget.appRoot, ["install", "chromium"], target.env),
        );
        const runningServer = startServer(target);
        servers.set(target.root, runningServer);
        await runStage(`${target.kind} readiness`, () =>
          waitForHttp200(`${target.url}/primitive-contract`, runningServer, 120_000),
        );
        await runStage(`${target.kind} Playwright interaction`, () =>
          runLocalPlaywright(
            nextTarget.appRoot,
            ["test", "e2e/__primitive-contract.spec.ts"],
            target.env,
          ),
        );
        await runStage(`${target.kind} server process-tree termination`, () =>
          terminateProcessTree(runningServer.child),
        );
        servers.delete(target.root);
      }
    } catch (error) {
      if (error instanceof ProcessTreeTerminationError) {
        for (const root of servers.keys()) rootRemovalAllowed.set(root, false);
      }
      operationError = error;
    }

    let cleanupError: unknown;
    for (const [root, server] of servers) {
      try {
        await runStage("server process-tree termination", () => terminateProcessTree(server.child));
      } catch (error) {
        rootRemovalAllowed.set(root, false);
        cleanupError ??= error;
      }
    }
    await Promise.all(
      roots.toReversed().map(async (root) => {
        if (!rootRemovalAllowed.get(root)) return;
        try {
          verifyTempRoot(root);
          await runStage("temp-root removal", () => rm(root, { recursive: true, force: true }));
        } catch (error) {
          cleanupError ??= error;
        }
      }),
    );

    if (cleanupError !== undefined) throw cleanupError;
    if (operationError !== undefined) throw operationError;
  });
});
