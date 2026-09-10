import { describe, expect, test } from "bun:test";
import { parseSync, Visitor } from "oxc-parser";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Mode = "monorepo" | "single";

function generateDesktop(mode: Mode): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: `desktop-button-${mode}`,
      runtime: "bun",
      version: "0.1.0",
      mode,
      framework: "nextjs",
      database: "postgres",
      apps: ["desktop"],
      preset: "saas",
      cache: "none",
      deploy: "none",
      auth: true,
      api: true,
      email: true,
      analytics: false,
      eve: false,
      i18n: false,
      pdf: false,
      billing: [],
      features: [],
      messaging: false,
      storage: false,
      notifications: false,
      featureFlags: "none",
      jobs: false,
    } satisfies ProjectConfig),
    { dryRun: true },
  );
}

function source(files: readonly TemplateFile[], path: string): string {
  const match = files.find((candidate) => candidate.path === path);
  expect(match, `missing generated file: ${path}`).toBeDefined();
  return match?.content ?? "";
}

function declaredVariants(button: string): ReadonlySet<string> {
  const block = /variant:\s*\{([\s\S]*?)\n\s*\},\n\s*size:/.exec(button)?.[1];
  expect(block, "button variant block").toBeDefined();
  return new Set(
    [...(block ?? "").matchAll(/^\s*([a-z][a-zA-Z]*):/gm)].map((match) => match[1] ?? ""),
  );
}

function buttonSites(files: readonly TemplateFile[]): { path: string; variant: string }[] {
  const sites: { path: string; variant: string }[] = [];
  for (const { path, content } of files) {
    const parsed = parseSync(path, content);
    expect(parsed.errors, path).toEqual([]);
    new Visitor({
      JSXOpeningElement(node) {
        const name = node.name;
        if (
          !(name.type === "JSXIdentifier" && name.name === "Button") &&
          !(name.type === "JSXMemberExpression" && name.property.name === "SubmitButton")
        )
          return;
        const attribute = node.attributes.find(
          (candidate) =>
            candidate.type === "JSXAttribute" &&
            candidate.name.type === "JSXIdentifier" &&
            candidate.name.name === "variant",
        );
        const value = attribute?.type === "JSXAttribute" ? attribute.value : null;
        if (value?.type === "Literal" && typeof value.value === "string")
          sites.push({ path, variant: value.value });
      },
    }).visit(parsed.program);
  }
  return sites;
}

describe("generated desktop Button variants", () => {
  for (const mode of ["monorepo", "single"] as const) {
    test(`types and styles every destructive identity action in ${mode} output`, () => {
      const files = generateDesktop(mode);
      const appRoot = mode === "monorepo" ? "apps/desktop/" : "";
      const componentRoot =
        mode === "monorepo" ? `${appRoot}src/renderer/components/ui` : "src/components/ui";
      const buttonPath = `${componentRoot}/button.tsx`;
      const formPath = `${componentRoot}/form.tsx`;
      const workspacePath = `${appRoot}src/renderer/routes/workspace.tsx`;
      const settingsPath = `${appRoot}src/renderer/routes/settings.tsx`;
      const featureRoot = `${appRoot}src/renderer/features`;
      const workspaceRoot = `${featureRoot}/identity-workspace`;
      const settingsRoot = `${featureRoot}/settings`;
      const deletionRoot = `${featureRoot}/account-deletion`;
      const button = source(files, buttonPath);
      const form = source(files, formPath);
      const workspace = source(files, workspacePath);
      const settings = source(files, settingsPath);
      const memberRow = source(files, `${workspaceRoot}/components/member-row.tsx`);
      const invitationRow = source(files, `${workspaceRoot}/components/invitation-row.tsx`);
      const invitations = source(files, `${workspaceRoot}/components/invitations-card.tsx`);
      const membersWorkflow = source(files, `${workspaceRoot}/use-workspace-members.ts`);
      const invitationsWorkflow = source(files, `${workspaceRoot}/use-workspace-invitations.ts`);
      const twoFactor = source(files, `${settingsRoot}/components/two-factor-view.tsx`);
      const twoFactorWorkflow = source(files, `${settingsRoot}/use-two-factor-settings.ts`);
      const settingsMutations = source(files, `${settingsRoot}/mutations.ts`);
      const deletion = source(files, `${deletionRoot}/components/danger-zone-view.tsx`);
      const deletionWorkflow = source(files, `${deletionRoot}/use-account-deletion.ts`);
      const deletionMutations = source(files, `${deletionRoot}/mutations.ts`);
      const sessions = source(files, `${settingsRoot}/components/sessions-view.tsx`);
      const featureFiles = files.filter(({ path }) =>
        [workspaceRoot, settingsRoot, deletionRoot].some((root) => path.startsWith(`${root}/`)),
      );
      const sites = buttonSites([
        { path: buttonPath, content: button },
        { path: formPath, content: form },
        { path: workspacePath, content: workspace },
        { path: settingsPath, content: settings },
        ...featureFiles,
      ]);

      expect(workspace).toContain("features/identity-workspace/identity-workspace");
      expect(settings).toContain("features/settings/settings-screen");
      expect(button).toContain("VariantProps<typeof buttonVariants>");
      expect(button).toContain(
        'destructive: "border border-destructive/40 bg-card text-destructive shadow-control hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"',
      );
      expect(button).toContain('default: "h-10 px-4 py-2"');
      expect(button).toContain('icon: "size-10 p-0"');
      expect(button).toContain("data-loading={loading || undefined}");
      expect(button).toContain("aria-busy={loading || undefined}");
      expect(button).toContain("disabled={disabled || loading}");
      expect(form).toContain('import { Button, type ButtonProps } from "./button"');
      expect(form).toContain("ButtonProps & { pendingLabel?: React.ReactNode }");
      expect(form).toContain('<Button {...props} type="submit"');
      expect(form).toContain("disabled={props.disabled || !canSubmit || isSubmitting}");

      const variants = declaredVariants(button);
      for (const { path, variant } of sites) {
        expect(
          variants.has(variant),
          `${mode}: unsupported Button variant ${variant} in ${path}`,
        ).toBe(true);
      }
      expect(
        sites.filter(
          ({ path, variant }) => path.startsWith(`${workspaceRoot}/`) && variant === "destructive",
        ),
        `${mode}: workspace sites`,
      ).toHaveLength(2);
      expect(memberRow).toContain(
        'variant="destructive" disabled={pending} onClick={() => model.remove(membership)}',
      );
      expect(membersWorkflow).toContain(
        "if (organizationId && selection.access.canManageMember(membership)) void remove.run({ organizationId, membershipId: membership.id })",
      );
      expect(invitationRow).toContain(
        'variant="destructive" disabled={pending} onClick={onCancel}',
      );
      expect(invitations).toContain("onCancel={() => model.cancel(invitation)}");
      expect(invitationsWorkflow).toContain(
        "if (selection.access.canWriteInvitations && invitations.isSuccess) void cancel.run({ invitationId: invitation.id })",
      );
      expect(deletion).toContain('<DialogTrigger render={<Button variant="destructive" />}');
      expect(deletion).toContain(
        '<form.SubmitButton className="w-auto" variant="destructive" disabled={pending}',
      );
      expect(deletionWorkflow).toContain(
        'createRequiredPasswordSchema(t("validation.passwordRequired"))',
      );
      expect(deletionWorkflow).toContain("await mutation.run(value.password)");
      expect(deletionMutations).toContain("identityClient.deleteAccount(");
      expect(sessions).toContain(
        'variant="destructive" onClick={state.revokeOtherSessions} disabled={state.sessions.length <= 1 || state.isRevokingOthers}',
      );
      expect(twoFactorWorkflow).toContain(
        'createRequiredPasswordSchema(t("validation.passwordRequired"))',
      );
      expect(twoFactorWorkflow).toContain(
        'const disableForm = useAppForm({ defaultValues: { password: "" }, validators: { onSubmit: passwordSchema }',
      );
      expect(twoFactorWorkflow).toContain(
        'complete.run({ kind: "disable", password: value.password',
      );
      expect(settingsMutations).toContain(
        "identityClient.disableTwoFactor({ password: input.password })",
      );
      expect(
        twoFactor,
        `${mode}: disabling two-factor authentication remains destructive`,
      ).toContain('<disableForm.SubmitButton className="w-auto self-start" variant="destructive"');
      expect(
        sites.filter(
          ({ path, variant }) =>
            (path.startsWith(`${settingsRoot}/`) || path.startsWith(`${deletionRoot}/`)) &&
            variant === "destructive",
        ),
        `${mode}: two-factor, session revocation, and account deletion sites`,
      ).toHaveLength(4);
    });
  }
});
