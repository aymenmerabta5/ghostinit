// @allow-long 444: one bounded cross-platform harness owns generation, server readiness, browser interaction, and process-tree cleanup
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

type CommandResult =
  | { kind: "exit"; code: number | null }
  | { kind: "error"; error: Error }
  | { kind: "timeout" };

const fixtureRoute = `"use client";

import { useState } from "react";
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
    </main>
  );
}
`;

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
  await page.goto("/primitive-contract");

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

function projectConfig(): ProjectConfig {
  return {
    name: "primitive-contract",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    preset: "saas",
    cache: "none",
    deploy: "none",
    billing: [],
    features: [],
    database: "postgres",
    framework: "nextjs",
    apps: ["web"],
  };
}

async function writeGeneratedFixture(root: string): Promise<void> {
  const transaction = new FsTransaction(root);
  const files = generateProjectFiles(projectConfig(), { dryRun: false });
  for (const file of files) await transaction.write(file.path, file.content);
  await transaction.write("apps/web/src/app/primitive-contract/page.tsx", fixtureRoute);
  await transaction.write("apps/web/e2e/__primitive-contract.spec.ts", playwrightSpec);
  const stagedPaths = transaction.getStagedFiles().map(({ path }) => path);
  expect(stagedPaths).toContain("apps/web/src/app/primitive-contract/page.tsx");
  expect(stagedPaths).toContain("apps/web/e2e/__primitive-contract.spec.ts");
  await transaction.commit();
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

function nativeExecutable(name: "bun", resolved: string): string {
  if (process.platform !== "win32" || !/\.(?:cmd|bat)$/i.test(resolved)) return resolved;
  return Bun.which(`${name}.exe`) ?? resolved;
}

export function startServer(root: string, port: number, env: NodeJS.ProcessEnv): RunningServer {
  const bun = Bun.which("bun");
  if (bun === null) throw new Error("bun executable was not found");
  const child = spawn(
    nativeExecutable("bun", bun),
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: join(root, "apps", "web"),
      env,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
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
  test("Next monorepo primitives work with keyboard and controlled state", async () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-web-primitives-"));
    const webRoot = join(root, "apps", "web");
    let server: RunningServer | undefined;
    let rootRemovalAllowed = true;
    let operationError: unknown;
    try {
      await runStage("generate fixture", () => writeGeneratedFixture(root));
      const port = await reservePort();
      const url = `http://127.0.0.1:${port}`;
      const env = createGeneratedProcessEnv(root, url);
      expect(env.POSTGRES_PASSWORD).toBeTruthy();
      expect(env.BETTER_AUTH_SECRET?.length).toBeGreaterThanOrEqual(32);
      expect(env.BETTER_AUTH_URL).toBeTruthy();
      expect(env.NEXT_PUBLIC_APP_URL).toBe(url);
      expect(env.VITE_APP_URL).toBe(url);
      await runStage("bun install", () => runBun(root, ["install"], env));
      expect(existsSync(join(webRoot, "node_modules", "@playwright", "test", "package.json"))).toBe(
        true,
      );
      await runStage("Playwright Chromium provisioning", () =>
        runLocalPlaywright(webRoot, ["install", "chromium"], env),
      );
      const runningServer = startServer(root, port, env);
      server = runningServer;
      await runStage("Next readiness", () =>
        waitForHttp200(`${url}/primitive-contract`, runningServer, 120_000),
      );
      await runStage("Playwright interaction", () =>
        runLocalPlaywright(webRoot, ["test", "e2e/__primitive-contract.spec.ts"], env),
      );
    } catch (error) {
      if (error instanceof ProcessTreeTerminationError) rootRemovalAllowed = false;
      operationError = error;
    }

    let cleanupError: unknown;
    if (server !== undefined) {
      try {
        await runStage("server process-tree termination", () => terminateProcessTree(server.child));
      } catch (error) {
        rootRemovalAllowed = false;
        cleanupError = error;
      }
    }
    if (rootRemovalAllowed) {
      try {
        verifyTempRoot(root);
        await runStage("temp-root removal", () => rm(root, { recursive: true, force: true }));
      } catch (error) {
        cleanupError = error;
      }
    }

    if (cleanupError !== undefined) throw cleanupError;
    if (operationError !== undefined) throw operationError;
  });
});
