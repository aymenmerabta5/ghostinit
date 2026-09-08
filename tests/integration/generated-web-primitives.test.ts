// @allow-long 900: one bounded cross-platform harness owns two generated targets, interaction/layout and keyboard clipping contracts, server readiness, and process-tree cleanup
import { describe, expect, test } from "bun:test";
import { existsSync, realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { createServer } from "node:net";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { runtime } from "../../packages/versions/src/index.js";
import type { ProjectConfig } from "../../src/lib/config.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { redact } from "../../src/lib/logger.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { desktopUiAlertContent } from "../../src/templates/apps/desktop/ui/surfaces.js";
import { adminFiltersFile } from "../../src/templates/apps/fragments/admin/filters.js";
import { adminSchemaFiles } from "../../src/templates/apps/fragments/admin/feature-schema.js";
import { adminTranslationsFile } from "../../src/templates/apps/fragments/admin/translations.js";
import {
  adminUserRowFile,
  adminUserRowConfirmationFile,
} from "../../src/templates/apps/fragments/admin/user-row.js";
import { adminUserTableFile } from "../../src/templates/apps/fragments/admin/user-table.js";
import { createGeneratedProcessEnv } from "../helpers/generated-web-primitives-env.js";
import { resolveLocalPlaywrightInvocation } from "../helpers/generated-playwright-cli.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";
import { ProcessTreeTerminationError, terminateProcessTree } from "../helpers/process-tree.js";
import { startIsolatedE2EPostgres, type E2EPostgresRuntime } from "./e2e-postgres.js";

interface RunningServer {
  kind: BrowserTargetKind;
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

const REQUIRED_BUN_VERSION = runtime.bun;
const BUN_EXECUTABLE = process.execPath;
const DIAGNOSTIC_TAIL_LENGTH = 128 * 1024;

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
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Alert as DesktopAlert, AlertTitle as DesktopAlertTitle, AlertDescription as DesktopAlertDescription } from "@/components/desktop-alert-contract";
import { AdminUserFilters } from "@/features/admin-users/components/filters";
import { UserTable } from "@/features/admin-users/components/user-table";
import type { AdminUser } from "@/features/admin-users/types";
import { TriangleAlert } from "lucide-react";

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

const initialAdminUser: AdminUser = {
  id: "application-admin",
  identityId: "identity-admin",
  name: "Workspace administrator",
  email: "administrator.with.a.long.identifier@example.test",
  role: "admin",
  banned: false,
};

export default function PrimitiveContractPage(): React.JSX.Element {
  const [role, setRole] = useState("user");
  const [marked, setMarked] = useState("none");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [alertActions, setAlertActions] = useState(0);
  const [adminUser, setAdminUser] = useState(initialAdminUser);
  const [adminMutations, setAdminMutations] = useState<string[]>([]);
  const [hydrationState, setHydrationState] = useState("waiting");
  useEffect(() => setHydrationState("ready"), []);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
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
      <section data-testid="admin-layout" aria-label="Admin filter alignment">
        <AdminUserFilters search={appliedSearch} isFetching={false} onApply={(input) => setAppliedSearch(input.search)} onClear={() => setAppliedSearch("")} />
        <output data-testid="applied-search">{appliedSearch}</output>
      </section>
      <section id="layout-controls" className="grid gap-4">
        {[{ kind: "web", Root: Alert, Title: AlertTitle, Description: AlertDescription }, { kind: "desktop", Root: DesktopAlert, Title: DesktopAlertTitle, Description: DesktopAlertDescription }].flatMap(({ kind, Root, Title, Description }) => [false, true].map((icon) => {
          const id = kind + (icon ? "-icon" : "-plain");
          return <Root key={id} data-testid={id}>
            {icon ? <TriangleAlert data-testid={id + "-icon"} aria-hidden /> : null}
            <Title data-testid={id + "-title"}>Unable to complete the operation</Title>
            <Description>Retry the operation or review its details.</Description>
            <Button data-testid={id + "-retry"} variant="outline" onClick={() => setAlertActions((value) => value + 1)}>Retry operation</Button>
            <Button data-testid={id + "-link"} variant="outline" render={<a href="#layout-controls" />} nativeButton={false}>View details</Button>
          </Root>;
        }))}
        <output data-testid="alert-actions">{alertActions}</output>
      </section>
      </div>
      <section data-testid="admin-row-layout" className="grid gap-3 p-6" aria-label="Admin row actions">
        <Button data-testid="before-admin-actions" onClick={() => { setAdminUser(initialAdminUser); setAdminMutations([]); }}>Reset admin row</Button>
        <UserTable users={[adminUser]} total={1} totalIsExact rolePendingId={null} banPendingId={null}
          onToggleRole={async (identityId, currentRole) => {
            setAdminMutations((actions) => [...actions, "role:" + identityId + ":" + currentRole]);
            setAdminUser((user) => ({ ...user, role: currentRole === "admin" ? "user" : "admin" }));
            return true;
          }}
          onToggleBanned={async (identityId, currentlyBanned) => {
            setAdminMutations((actions) => [...actions, "ban:" + identityId + ":" + currentlyBanned]);
            setAdminUser((user) => ({ ...user, banned: !currentlyBanned }));
            return true;
          }} />
        <Button data-testid="after-admin-actions">After admin row</Button>
        <output data-testid="admin-mutations">{adminMutations.join("|")}</output>
      </section>
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

async function measureFocusedActionGeometry(action: Locator) {
  return action.evaluate((element) => {
    const container = element.closest('[data-slot="table-container"]');
    if (!container) throw new Error("Admin action has no scrolling table container");
    const clip = container.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const left = Math.max(0, clip.left + container.clientLeft);
    const right = Math.min(innerWidth, clip.left + container.clientLeft + container.clientWidth);
    const top = Math.max(0, clip.top + container.clientTop);
    const bottom = Math.min(innerHeight, clip.top + container.clientTop + container.clientHeight);
    return {
      label: element.textContent?.trim(),
      direction: getComputedStyle(container).direction,
      viewport: { width: innerWidth, height: innerHeight },
      rect: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height },
      clip: { left, right, top, bottom },
      scroll: { left: container.scrollLeft, top: container.scrollTop, width: container.scrollWidth, height: container.scrollHeight },
      focused: element === document.activeElement,
      focusVisible: element.matches(":focus-visible"),
      contained: box.left >= left - 1 && box.right <= right + 1 && box.top >= top - 1 && box.bottom <= bottom + 1,
    };
  });
}

async function expectFocusedActionUnclipped(action: Locator, phase: string): Promise<void> {
  let geometry = await measureFocusedActionGeometry(action);
  try {
    await expectFocusVisible(action);
    await expect.poll(async () => {
      geometry = await measureFocusedActionGeometry(action);
      return geometry.contained;
    }, { timeout: 2000 }).toBe(true);
  } catch (error) {
    throw new Error("Admin action clipping at " + phase + ": " + JSON.stringify(geometry), { cause: error });
  }
}

test("shared primitives preserve keyboard, focus, controlled value, and mark-read behavior", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push(String(response.status()) + " " + new URL(response.url()).pathname);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const navigation = await page.goto("/primitive-contract");
  const destination = new URL(page.url());
  if (
    navigation === null ||
    navigation.status() !== 200 ||
    destination.pathname !== "/primitive-contract" ||
    destination.search !== ""
  ) {
    throw new Error(
      "Primitive fixture navigation failed: status=" + String(navigation?.status()) +
      " url=" + page.url() + " body=" + (await page.locator("body").innerText()).slice(0, 2_000),
    );
  }
  try {
    await expect(page.getByTestId("hydration-state")).toHaveText("ready", { timeout: 30_000 });
  } catch {
    throw new Error(
      "Primitive fixture did not finish authenticated hydration: title=" + (await page.title()) +
      " body=" + (await page.locator("body").innerText()).slice(0, 4_000) +
      " pageErrors=" + JSON.stringify(pageErrors) +
      " consoleErrors=" + JSON.stringify(consoleErrors) +
      " failedResponses=" + JSON.stringify(failedResponses),
    );
  }
  expect(pageErrors).toEqual([]);
  expect(consoleErrors, JSON.stringify(failedResponses)).toEqual([]);

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
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const direction of ["ltr", "rtl"]) {
      await page.evaluate((value) => { document.documentElement.dir = value; }, direction);
      const filter = page.getByTestId("admin-layout");
      const input = filter.getByRole("searchbox");
      const submit = filter.getByRole("button", { name: "Search", exact: true });
      await filter.locator("label").click();
      await expect(input).toBeFocused();
      const descriptionIds = (await input.getAttribute("aria-describedby"))!.split(" ");
      expect(descriptionIds.length).toBeGreaterThan(0);
      const description = page.locator('[id="' + descriptionIds[0] + '"]');
      await expect(description).toBeVisible();
      const inputBox = (await input.boundingBox())!;
      const submitBox = (await submit.boundingBox())!;
      if (width >= 640) expect(Math.abs(inputBox.y - submitBox.y)).toBeLessThanOrEqual(1);
      else expect(submitBox.y).toBeGreaterThanOrEqual((await description.boundingBox())!.y + (await description.boundingBox())!.height);
      await input.fill("x".repeat(121));
      await submit.click();
      await expect(input).toHaveAttribute("aria-invalid", "true");
      const errorId = await input.getAttribute("aria-errormessage");
      const fieldError = page.locator('[id="' + errorId + '"]');
      await expect(fieldError).toBeVisible();
      expect((await input.getAttribute("aria-describedby"))!.split(" ")).toContain(errorId);
      if (width >= 640) expect(Math.abs((await input.boundingBox())!.y - (await submit.boundingBox())!.y)).toBeLessThanOrEqual(1);
      else expect((await submit.boundingBox())!.y).toBeGreaterThanOrEqual((await fieldError.boundingBox())!.y + (await fieldError.boundingBox())!.height);
      await input.fill("review@example.test");
      await submit.click();
      await expect(page.getByTestId("applied-search")).toHaveText("review@example.test");
      await filter.getByRole("button", { name: /Clear/ }).click();
      await expect(input).toHaveValue("");
      for (const id of ["web-plain", "web-icon", "desktop-plain", "desktop-icon"]) {
        const titleBox = (await page.getByTestId(id + "-title").boundingBox())!;
        const alertBox = (await page.getByTestId(id).boundingBox())!;
        for (const suffix of ["-retry", "-link"]) {
          const control = page.getByTestId(id + suffix);
          const box = (await control.boundingBox())!;
          const size = await control.evaluate((element) => {
            const css = getComputedStyle(element);
            const range = document.createRange(); range.selectNodeContents(element);
            return { text: range.getBoundingClientRect().width, padding: parseFloat(css.paddingLeft) + parseFloat(css.paddingRight) };
          });
          expect(size.padding).toBeGreaterThanOrEqual(24);
          expect(box.width).toBeGreaterThanOrEqual(size.text + size.padding - 1);
          expect(box.width).toBeLessThan(alertBox.width - 32);
          const start = direction === "rtl" ? box.x + box.width : box.x;
          const titleStart = direction === "rtl" ? titleBox.x + titleBox.width : titleBox.x;
          expect(Math.abs(start - titleStart)).toBeLessThanOrEqual(1);
        }
        if (id.endsWith("-icon")) {
          const icon = (await page.getByTestId(id + "-icon").boundingBox())!;
          if (direction === "rtl") expect(icon.x).toBeGreaterThan(titleBox.x + titleBox.width);
          else expect(icon.x + icon.width).toBeLessThan(titleBox.x);
        }
        await page.getByTestId(id + "-retry").click();
      }
      const adminTable = page.getByTestId("admin-row-layout");
      const beforeActions = adminTable.getByTestId("before-admin-actions");
      await beforeActions.focus();
      await page.keyboard.press("Enter");
      const container = adminTable.locator('[data-slot="table-container"]');
      await container.evaluate((element) => { element.scrollLeft = 0; });
      const dimensions = await container.evaluate((element) => ({ viewport: element.clientWidth, content: element.scrollWidth }));
      if (width < 640) expect(dimensions.content).toBeGreaterThan(dimensions.viewport);
      else expect(dimensions.viewport).toBeGreaterThanOrEqual(960);
      const row = adminTable.locator("tbody tr").first();
      const roleAction = row.getByRole("button").nth(0);
      const banAction = row.getByRole("button").nth(1);
      await expect(roleAction).toHaveText("Remove administrator role");
      await page.keyboard.press("Tab");
      await expectFocusedActionUnclipped(roleAction, "initial-role-tab");
      await page.keyboard.press("Tab");
      await expectFocusedActionUnclipped(banAction, "initial-ban-tab");
      const roleBox = (await roleAction.boundingBox())!;
      const banBox = (await banAction.boundingBox())!;
      if (width < 640) {
        expect(Math.abs(roleBox.x - banBox.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(roleBox.width - banBox.width)).toBeLessThanOrEqual(1);
        expect(banBox.y).toBeGreaterThanOrEqual(roleBox.y + roleBox.height + 4);
      } else {
        expect(Math.abs(roleBox.y - banBox.y)).toBeLessThanOrEqual(1);
        if (direction === "rtl") expect(banBox.x + banBox.width).toBeLessThan(roleBox.x);
        else expect(roleBox.x + roleBox.width).toBeLessThan(banBox.x);
      }
      await page.keyboard.press("Enter");
      const confirmation = page.getByRole("alertdialog", { name: "Suspend this account?" });
      await expect(confirmation).toBeVisible();
      const cancel = confirmation.getByRole("button", { name: "Cancel", exact: true });
      await expectFocusVisible(cancel);
      await page.keyboard.press("Enter");
      await expect(confirmation).toHaveCount(0);
      await expectFocusedActionUnclipped(banAction, "cancel-restoration");
      await expect(adminTable.getByTestId("admin-mutations")).toHaveText("");
      await page.keyboard.press("Enter");
      await expectFocusVisible(cancel);
      await page.keyboard.press("Tab");
      await expectFocusVisible(confirmation.getByRole("button", { name: "Suspend account", exact: true }));
      await page.keyboard.press("Enter");
      await expect(adminTable.getByTestId("admin-mutations")).toHaveText("ban:identity-admin:false");
      await expect(confirmation).toHaveCount(0);
      await expect(banAction).toHaveText("Restore access");
      await expectFocusedActionUnclipped(banAction, "mutation-restoration");
      await page.keyboard.press("Tab");
      await expectFocusVisible(adminTable.getByTestId("after-admin-actions"));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    }
  }
  await expect(page.getByTestId("alert-actions")).toHaveText("16");
  expect(pageErrors).toEqual([]);
  expect(consoleErrors, JSON.stringify(failedResponses)).toEqual([]);
});
`;

function projectConfig(kind: BrowserTargetKind): ProjectConfig {
  return {
    name: "primitive-contract",
    // CI retains Bun coverage; local Next leaves memory for the in-process database.
    runtime: kind === "next-monorepo" && !process.env.CI ? "node" : "bun",
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
  const adminOptions = {
    database: "postgres",
    i18n: false,
    mode: kind === "next-monorepo" ? "monorepo" : "single",
    framework: kind === "next-monorepo" ? "next" : "tanstack",
    sourceRoot: kind === "next-monorepo" ? "apps/web/src" : "src",
  } as const;
  for (const file of [
    adminFiltersFile(adminOptions),
    ...adminSchemaFiles(adminOptions),
    adminTranslationsFile(adminOptions),
    adminUserRowFile(adminOptions),
    adminUserRowConfirmationFile(adminOptions),
    adminUserTableFile(adminOptions),
  ]) {
    await transaction.write(file.path, file.content);
  }
  await transaction.write(
    adminOptions.sourceRoot + "/components/desktop-alert-contract.tsx",
    desktopUiAlertContent(adminOptions.mode),
  );
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
    stdout = (stdout + chunk).slice(-DIAGNOSTIC_TAIL_LENGTH);
  });
  child.stderr.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-DIAGNOSTIC_TAIL_LENGTH);
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
  console.log(`[generated-web-primitives] child: pid=${child.pid} executable=${basename(command)}`);
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
  await runBounded(BUN_EXECUTABLE, args, cwd, env, 900_000);
}

async function runBunx(cwd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  await runBounded(BUN_EXECUTABLE, ["x", ...args], cwd, env, 120_000);
}

export function startServer(target: BrowserTarget): RunningServer {
  const args =
    target.kind === "next-monorepo"
      ? ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(target.port)]
      : ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(target.port)];
  const child = spawn(BUN_EXECUTABLE, args, {
    cwd: target.appRoot,
    env: target.env,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log(
    `[generated-web-primitives] ${target.kind} server: pid=${child.pid} runtime=${projectConfig(target.kind).runtime}`,
  );
  const output = capture(child);
  return { kind: target.kind, child, ...output };
}

export async function waitForHttp200(
  url: string,
  server: RunningServer,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastProbe = "HTTP probe not attempted";
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null || server.child.signalCode !== null) {
      throw new Error(
        `Generated server exited before readiness:\n${server.stdout().slice(-12_000)}\n${server.stderr().slice(-12_000)}`,
      );
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      lastProbe = `HTTP ${response.status}`;
      await response.body?.cancel();
      if (response.status === 200) return;
    } catch (error) {
      lastProbe = error instanceof Error ? error.message : String(error);
    }
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(
    `Timed out waiting for ${url} (last probe: ${lastProbe}):\n${server.stdout().slice(-12_000)}\n${server.stderr().slice(-12_000)}`,
  );
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
  const memory = () =>
    `parentPid=${process.pid} parentRssMiB=${Math.round(process.memoryUsage().rss / 1024 ** 2)}`;
  console.log(`[generated-web-primitives] ${label}: start ${memory()}`);
  try {
    await operation();
  } finally {
    console.log(`[generated-web-primitives] ${label}: ${Date.now() - startedAt}ms ${memory()}`);
  }
}

function verifyTempRoot(root: string): void {
  const absoluteRoot = resolve(root);
  const relativeToTemp = relative(realpathSync.native(tmpdir()), absoluteRoot);
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
  test("HTTP readiness does not depend on framework startup announcements", async () => {
    const port = await reservePort();
    const child = spawn(
      BUN_EXECUTABLE,
      [
        "-e",
        `Bun.serve({ hostname: "127.0.0.1", port: ${port}, fetch: () => new Response("ok") });`,
      ],
      {
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const output = capture(child);
    const runningServer: RunningServer = {
      kind: "single-tanstack",
      child,
      ...output,
    };
    try {
      await waitForHttp200(`http://127.0.0.1:${port}`, runningServer, 5_000);
      expect(`${runningServer.stdout()}${runningServer.stderr()}`).not.toMatch(/ready in|Local:/i);
    } finally {
      await terminateProcessTree(child);
    }
  });

  test("Next monorepo and single TanStack primitives share the interaction contract", async () => {
    expect(Bun.version).toBe(REQUIRED_BUN_VERSION);
    const roots = [
      createTemporaryWorkspace("ghostinit-web-primitives-"),
      createTemporaryWorkspace("ghostinit-web-primitives-"),
    ];
    const targets: BrowserTarget[] = [];
    const servers = new Map<string, RunningServer>();
    const rootRemovalAllowed = new Map(roots.map((root) => [root, true]));
    let postgres: E2EPostgresRuntime | undefined;
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
      // Serial installs avoid shared-cache and isolated-linker contention on
      // Windows. The first clean target warms Bun's cache for the second.
      for (const target of targets) {
        await runStage(`${target.kind} verified dependency bootstrap`, () =>
          runBun(target.root, ["run", "install:bootstrap"], target.env),
        );
      }
      expect(
        existsSync(join(nextTarget.appRoot, "node_modules", "@playwright", "test", "package.json")),
      ).toBe(true);

      await runStage("next-monorepo isolated PostgreSQL", async () => {
        postgres = await startIsolatedE2EPostgres();
        nextTarget.env = { ...nextTarget.env, ...postgres.environment };
        await runBun(
          nextTarget.root,
          ["run", "--cwd", "packages/database", "db:push"],
          nextTarget.env,
        );
      });

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
        if (target.kind === "next-monorepo") {
          // The client provider needs this separately compiled route to finish hydration.
          await runStage("next-monorepo session route readiness", () =>
            waitForHttp200(`${target.url}/api/auth/get-session`, runningServer, 120_000),
          );
        }
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
      const diagnostics = [...servers.values()]
        .map(
          (server) =>
            `${server.kind} server diagnostics:\n${server.stdout().slice(-12_000)}\n${server.stderr().slice(-12_000)}`,
        )
        .join("\n");
      operationError = diagnostics
        ? new Error(
            String(
              redact(`${error instanceof Error ? error.message : String(error)}\n${diagnostics}`),
            ),
          )
        : error;
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
    if (postgres) {
      try {
        await runStage("isolated PostgreSQL shutdown", () => postgres.close());
      } catch (error) {
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
  }, 2_400_000);
});
