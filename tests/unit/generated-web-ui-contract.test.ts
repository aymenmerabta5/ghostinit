import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webUiFiles } from "../../src/templates/apps/fragments/web-ui/index.js";
import { notificationsLibFiles } from "../../src/templates/apps/fragments/lib/notifications.js";
import { authPackage } from "../../src/templates/auth.js";
import { settingsTwoFactorCard } from "../../src/templates/apps/fragments/settings/two-factor-card.js";

const content = (files: Array<{ path: string; content: string }>, path: string): string =>
  files.find((file) => file.path === path)?.content ?? "";

describe("shared web UI contracts", () => {
  test("Select is controlled Base UI composition", () => {
    const source = content(webUiFiles(), "apps/web/src/components/ui/select.tsx");
    expect(source).toContain('from "@base-ui/react/select"');
    expect(source).toContain("<BaseSelect.Root");
    expect(source).toContain("items={resolvedItems}");
    expect(source).toContain("value={value}");
    expect(source).toContain("onValueChange={handleValueChange}");
    expect(source).toContain("disabled={disabled}");
    expect(source).toContain("BaseSelect.Positioner");
    expect(source).toContain("BaseSelect.List");
    expect(source).toContain("export const SelectGroup");
    expect(source).not.toContain("<button");
  });

  test("SelectField supplies items and groups item children", () => {
    const source = content(webUiFiles(), "apps/web/src/components/form-fields/SelectField.tsx");
    expect(source).toContain("<Select items={options}");
    expect(source).toContain("<SelectGroup>");
    expect(source).toContain("</SelectGroup>");
  });

  test("notification items format content and mark unread items from the click", () => {
    const source = content(notificationsLibFiles(), "apps/web/src/components/NotificationBell.tsx");
    expect(source).toContain("formatNotification(notification.type, notification.payload)");
    expect(source).toContain("onClick={() => onMarkRead?.(notification.id)}");
    expect(source).toContain("<PopoverTitle>Notifications</PopoverTitle>");
    expect(source).toContain("<Empty>");
    expect(source).not.toContain('<Bell className="size-5"');
  });

  test("shared auth output has no stale pending or callback bindings", () => {
    const form = content(webUiFiles(), "apps/web/src/components/ui/form.tsx");
    expect(form).not.toContain("isPending?:");
    const twoFactor = settingsTwoFactorCard().content;
    expect(twoFactor).not.toContain("import { Button }");
    expect(twoFactor).not.toContain("as unknown as");
    const auth = content(authPackage(), "packages/auth/src/server.ts");
    expect(auth).not.toContain("({ user, url, token })");
    expect(auth).not.toContain("as unknown as");
  });

  test("rendered fixture gives the disabled Select real items and immutable interactions", () => {
    const integration = readFileSync(
      resolve(import.meta.dir, "../integration/generated-web-primitives.test.ts"),
      "utf8",
    );
    const disabledSelect = integration.slice(
      integration.indexOf('<Select items={roles} value="user" disabled>'),
      integration.indexOf("<NotificationBell"),
    );
    expect(disabledSelect).toContain("<SelectContent>");
    expect(disabledSelect).toContain("<SelectGroup>");
    expect(disabledSelect).toContain('<SelectItem value="user">User</SelectItem>');
    expect(disabledSelect).toContain('<SelectItem value="admin">Admin</SelectItem>');
    expect(integration).toContain('data-testid="disabled-role-value"');
    expect(integration).toContain('toHaveAttribute("aria-expanded", "false")');
    expect(integration).toContain('toHaveAttribute("data-disabled", "")');
    expect(integration).toContain("await disabledTrigger.focus()");
    expect(integration).toContain("await expect(disabledTrigger).not.toBeFocused()");
    expect(integration).toContain('await page.keyboard.press("Space")');
    expect(integration).toContain('getByTestId("disabled-role-value")');
  });

  test("rendered fixture proves a disabled PasswordField cannot reveal its value", () => {
    const integration = readFileSync(
      resolve(import.meta.dir, "../integration/generated-web-primitives.test.ts"),
      "utf8",
    );
    expect(integration).toContain("<PasswordField");
    expect(integration).toContain('label="Disabled password"');
    expect(integration).toContain('getByRole("button", { name: "Show password" })');
    expect(integration).toContain("await expect(disabledReveal).toBeDisabled()");
    expect(integration).toContain(
      'await expect(disabledPassword).toHaveAttribute("type", "password")',
    );
  });
});
