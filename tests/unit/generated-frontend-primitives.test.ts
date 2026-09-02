// @allow-long 940: one inventory gate compares every reviewed primitive and consumer category across four generated web targets
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSync } from "oxc-parser";
import { ui as uiVersions } from "../../packages/versions/src/index.js";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type PrimitiveCategory =
  | "ad-hoc-empty-state"
  | "field-composition"
  | "internal-icon-size"
  | "manual-overlay-z-index"
  | "nonfunctional-select"
  | "partial-notification-bell"
  | "pending-boolean-or-spinner"
  | "presentation-network-access"
  | "product-semantic-style"
  | "radix-as-child"
  | "raw-form-control"
  | "raw-interactive-markup"
  | "unsafe-type-escape"
  | "ungrouped-select-item";

interface PrimitiveRecord {
  category: PrimitiveCategory;
  path: string;
  evidence: string;
}

interface GeneratedTarget {
  label: string;
  mode: "monorepo" | "single";
  framework: "nextjs" | "tanstack-start";
  sourceRoot: string;
  manifestPath: string;
  files: TemplateFile[];
}

const config = (
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start" = "nextjs",
): ProjectConfig => ({
  name: "primitive-contract",
  runtime: "bun",
  version: "0.1.0",
  mode,
  billing: [],
  features: [],
  database: "postgres",
  framework,
  apps: ["web"],
  preset: "saas",
});

const targets: GeneratedTarget[] = [
  {
    label: "next-monorepo",
    mode: "monorepo",
    framework: "nextjs",
    sourceRoot: "apps/web/src",
    manifestPath: "apps/web/package.json",
    files: generateProjectFiles(config("monorepo"), { dryRun: false }),
  },
  {
    label: "single-next",
    mode: "single",
    framework: "nextjs",
    sourceRoot: "src",
    manifestPath: "package.json",
    files: generateProjectFiles(config("single"), { dryRun: false }),
  },
  {
    label: "tanstack-monorepo",
    mode: "monorepo",
    framework: "tanstack-start",
    sourceRoot: "apps/web/src",
    manifestPath: "apps/web/package.json",
    files: generateProjectFiles(config("monorepo", "tanstack-start"), { dryRun: false }),
  },
  {
    label: "single-tanstack",
    mode: "single",
    framework: "tanstack-start",
    sourceRoot: "src",
    manifestPath: "package.json",
    files: generateProjectFiles(config("single", "tanstack-start"), { dryRun: false }),
  },
];

function source(target: GeneratedTarget, relativePath: string): string {
  const path = `${target.sourceRoot}/${relativePath}`;
  return target.files.find((file) => file.path === path)?.content ?? "";
}

interface ReviewedGapRecord {
  category: PrimitiveCategory;
  relativePath: string;
  ordinal: number;
}

interface ConsumerPaths {
  adminUsers: string;
  adminFilters: string;
  adminCreate: string;
  adminUserActions: string;
  adminUserTable: string;
  adminSchema: string;
  adminTranslations: string;
  adminHook: string;
  dangerZone: string;
  header: string;
}

function consumerPaths(target: GeneratedTarget): ConsumerPaths {
  const feature = "features/admin-users";
  if (target.framework === "tanstack-start") {
    return {
      adminUsers: `${feature}/index.tsx`,
      adminFilters: `${feature}/components/filters.tsx`,
      adminCreate: `${feature}/components/create-user-form.tsx`,
      adminUserActions: `${feature}/components/user-row.tsx`,
      adminUserTable: `${feature}/components/user-table.tsx`,
      adminSchema: `${feature}/schema.ts`,
      adminTranslations: `${feature}/translations.ts`,
      adminHook: `${feature}/hooks/use-admin-users.ts`,
      dangerZone: "features/settings/danger-zone-section.tsx",
      header: "components/header.tsx",
    };
  }
  return {
    adminUsers: `${feature}/index.tsx`,
    adminFilters: `${feature}/components/filters.tsx`,
    adminCreate: `${feature}/components/create-user-form.tsx`,
    adminUserActions: `${feature}/components/user-row.tsx`,
    adminUserTable: `${feature}/components/user-table.tsx`,
    adminSchema: `${feature}/schema.ts`,
    adminTranslations: `${feature}/translations.ts`,
    adminHook: `${feature}/hooks/use-admin-users.ts`,
    dangerZone: "app/settings/components/danger-zone-card.tsx",
    header: "components/header.tsx",
  };
}

function repeatedReviewedRecord(
  category: PrimitiveCategory,
  relativePath: string,
  count = 1,
): ReviewedGapRecord[] {
  return Array.from({ length: count }, (_, ordinal) => ({
    category,
    relativePath,
    ordinal: ordinal + 1,
  }));
}

function reviewedRecords(target: GeneratedTarget): ReviewedGapRecord[] {
  const consumers = consumerPaths(target);
  const shared = [
    ...repeatedReviewedRecord("field-composition", "components/form-fields/SelectField.tsx"),
    ...repeatedReviewedRecord("field-composition", "components/form-fields/PasswordField.tsx"),
    ...repeatedReviewedRecord("internal-icon-size", "components/form-fields/PasswordField.tsx", 2),
    ...repeatedReviewedRecord("internal-icon-size", "components/NotificationBell.tsx"),
    ...repeatedReviewedRecord("internal-icon-size", "components/ui/checkbox.tsx"),
    ...repeatedReviewedRecord("manual-overlay-z-index", "components/ui/alert-dialog.tsx", 3),
    ...repeatedReviewedRecord("manual-overlay-z-index", "components/ui/dialog.tsx", 2),
    ...repeatedReviewedRecord("manual-overlay-z-index", "components/ui/dropdown-menu.tsx", 4),
    ...repeatedReviewedRecord("manual-overlay-z-index", "components/ui/popover.tsx", 2),
    ...repeatedReviewedRecord("manual-overlay-z-index", "components/ui/select.tsx"),
    ...repeatedReviewedRecord("manual-overlay-z-index", "components/ui/sheet.tsx", 2),
    ...repeatedReviewedRecord("manual-overlay-z-index", "components/ui/surface-styles.ts", 3),
    ...repeatedReviewedRecord("manual-overlay-z-index", "components/ui/tooltip.tsx", 2),
    ...repeatedReviewedRecord("nonfunctional-select", "components/ui/select.tsx"),
    ...repeatedReviewedRecord("partial-notification-bell", "components/NotificationBell.tsx"),
    ...repeatedReviewedRecord("pending-boolean-or-spinner", "components/ui/form.tsx"),
    ...repeatedReviewedRecord("ungrouped-select-item", "components/form-fields/SelectField.tsx"),
  ];
  const consumer = [
    ...repeatedReviewedRecord("radix-as-child", consumers.adminUserActions, 2),
    ...repeatedReviewedRecord("radix-as-child", consumers.dangerZone),
    ...repeatedReviewedRecord("radix-as-child", consumers.header),
    ...repeatedReviewedRecord("ad-hoc-empty-state", consumers.adminUsers),
    ...repeatedReviewedRecord("raw-form-control", consumers.adminFilters),
    ...repeatedReviewedRecord("raw-form-control", consumers.adminCreate),
  ];
  return [...shared, ...consumer];
}

function addMissingTokens(
  records: PrimitiveRecord[],
  category: PrimitiveCategory,
  path: string,
  content: string,
  tokens: string[],
): void {
  for (const token of tokens) {
    if (!content.includes(token)) records.push({ category, path, evidence: `missing ${token}` });
  }
}

function addFieldAssociationRecords(
  records: PrimitiveRecord[],
  path: string,
  content: string,
  id: string,
): void {
  const label = new RegExp(`<FieldLabel\\b[^>]*htmlFor=["']${id}["']`).exec(content);
  if (label === null || label.index === undefined) {
    records.push({
      category: "field-composition",
      path,
      evidence: `missing FieldLabel association for ${id}`,
    });
    return;
  }
  const fieldOpenings = [...content.slice(0, label.index).matchAll(/<Field(?:\s|>)/g)];
  const fieldStart = fieldOpenings.at(-1)?.index ?? label.index;
  const fieldEnd = content.indexOf("</Field>", label.index);
  const field = content.slice(fieldStart, fieldEnd === -1 ? content.length : fieldEnd);
  const requirements = [
    "data-invalid=",
    `id="${id}"`,
    "aria-invalid=",
    "aria-describedby=",
    "aria-errormessage=",
    `${id}-description`,
    `${id}-error`,
  ];
  for (const requirement of requirements) {
    if (!field.includes(requirement) && !field.includes(requirement.replaceAll('"', "'"))) {
      records.push({
        category: "field-composition",
        path,
        evidence: `${id} missing ${requirement}`,
      });
    }
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function rawInteractiveElements(path: string, content: string): string[] {
  const parsed = parseSync(path, content);
  const raw: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (!isObject(value)) return;
    if (value.type === "JSXOpeningElement" && isObject(value.name)) {
      const name = value.name.name;
      if (name === "button" || name === "input" || name === "select") raw.push(name);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "type" && key !== "start" && key !== "end") visit(child);
    }
  };
  visit(parsed.program);
  return raw;
}

function pendingFormExpectations(
  target: GeneratedTarget,
): Array<{ relativePath: string; count: number; appForm?: boolean }> {
  const auth =
    target.framework === "nextjs"
      ? [
          "app/2fa/page.tsx",
          "app/forgot-password/page.tsx",
          "app/reset-password/page.tsx",
          "components/auth/sign-in-form.tsx",
          "components/auth/sign-up-form.tsx",
        ]
      : [
          "routes/2fa.tsx",
          "routes/forgot-password.tsx",
          "routes/reset-password.tsx",
          "components/auth/sign-in-form.tsx",
          "components/auth/sign-up-form.tsx",
        ];
  const expectations: Array<{ relativePath: string; count: number; appForm?: boolean }> = auth.map(
    (relativePath) => ({ relativePath, count: 1 }),
  );
  const consumers = consumerPaths(target);
  expectations.push({ relativePath: consumers.adminCreate, count: 1, appForm: true });
  if (target.framework === "nextjs") {
    expectations.push({
      relativePath: "app/settings/components/profile-card.tsx",
      count: 1,
    });
  } else {
    expectations.push(
      { relativePath: "features/settings/profile-card.tsx", count: 1 },
      { relativePath: "features/settings/password-card.tsx", count: 1 },
      { relativePath: "features/settings/two-factor-card.tsx", count: 3 },
      { relativePath: "features/settings/danger-zone-section.tsx", count: 1 },
    );
  }
  return expectations;
}

function collectPrimitiveRecords(target: GeneratedTarget): PrimitiveRecord[] {
  const records: PrimitiveRecord[] = [];
  const ui = (name: string): [string, string] => {
    const path = `${target.sourceRoot}/components/ui/${name}`;
    return [path, target.files.find((file) => file.path === path)?.content ?? ""];
  };
  const selectFieldPath = `${target.sourceRoot}/components/form-fields/SelectField.tsx`;
  const passwordFieldPath = `${target.sourceRoot}/components/form-fields/PasswordField.tsx`;
  const notificationPath = `${target.sourceRoot}/components/NotificationBell.tsx`;
  const selectField = source(target, "components/form-fields/SelectField.tsx");
  const passwordField = source(target, "components/form-fields/PasswordField.tsx");
  const notification = source(target, "components/NotificationBell.tsx");
  const [selectPath, select] = ui("select.tsx");
  const [formPath, form] = ui("form.tsx");

  addMissingTokens(records, "field-composition", selectFieldPath, selectField, [
    "<Field",
    "<FieldLabel",
    "<FieldDescription",
    "aria-describedby={describedBy}",
    "<Select items={options}",
    "<SelectGroup>",
  ]);
  addMissingTokens(records, "field-composition", passwordFieldPath, passwordField, [
    "<Field",
    "<FieldLabel",
    "<InputGroup",
    "<InputGroupInput",
    "<InputGroupAddon",
    "data-disabled={disabled || undefined}",
  ]);
  if (
    !passwordField.includes("{ label, error, description, className, id, disabled, ref, ...props }")
  ) {
    records.push({
      category: "field-composition",
      path: passwordFieldPath,
      evidence: "PasswordField does not destructure disabled",
    });
  }
  if ((passwordField.match(/disabled=\{disabled\}/g) ?? []).length < 2) {
    records.push({
      category: "field-composition",
      path: passwordFieldPath,
      evidence: "PasswordField does not disable both input and reveal action",
    });
  }

  for (const [path, content] of [
    [passwordFieldPath, passwordField],
    [notificationPath, notification],
    ui("checkbox.tsx"),
    [selectPath, select],
    ui("dialog.tsx"),
    ui("dropdown-menu.tsx"),
    ui("sheet.tsx"),
  ] as Array<[string, string]>) {
    for (const match of content.matchAll(
      /<(?:Bell|Check|Eye|EyeOff|X|ChevronRight)\b[^>]*\bclassName=[^>]*(?:size-|\bh-|\bw-)/g,
    )) {
      records.push({ category: "internal-icon-size", path, evidence: match[0] });
    }
  }

  for (const name of [
    "alert-dialog.tsx",
    "dialog.tsx",
    "dropdown-menu.tsx",
    "popover.tsx",
    "select.tsx",
    "sheet.tsx",
    "surface-styles.ts",
    "tooltip.tsx",
  ]) {
    const [path, content] = ui(name);
    for (const match of content.matchAll(/\bz-(?:\d+|auto|\[[^\]]+\])/g)) {
      records.push({ category: "manual-overlay-z-index", path, evidence: match[0] });
    }
  }

  for (const name of ["button.tsx", "dialog.tsx", "dropdown-menu.tsx", "sheet.tsx"]) {
    const [path, content] = ui(name);
    for (const match of content.matchAll(/\basChild\b/g)) {
      records.push({ category: "radix-as-child", path, evidence: match[0] });
    }
  }

  for (const name of [
    "alert-dialog.tsx",
    "breadcrumb.tsx",
    "checkbox.tsx",
    "dialog.tsx",
    "popover.tsx",
    "select.tsx",
    "sheet.tsx",
    "surface-styles.ts",
    "table.tsx",
    "tabs.tsx",
    "textarea.tsx",
    "tooltip.tsx",
  ]) {
    const [path, content] = ui(name);
    for (const match of content.matchAll(
      /\b(?:font-serif|text-heading|backdrop-blur(?:-[^\s"']+)?|bg-black\/[^\s"']+)/g,
    )) {
      records.push({ category: "product-semantic-style", path, evidence: match[0] });
    }
  }

  addMissingTokens(records, "nonfunctional-select", selectPath, select, [
    'from "@base-ui/react/select"',
    "<BaseSelect.Root",
    "items={resolvedItems}",
    "onValueChange={handleValueChange}",
    "<BaseSelect.Portal>",
    "<BaseSelect.Positioner",
    "<BaseSelect.Popup",
    "<BaseSelect.List>",
  ]);
  addMissingTokens(records, "partial-notification-bell", notificationPath, notification, [
    "<Popover>",
    "<PopoverTrigger",
    'aria-label={t("title")}',
    '<PopoverTitle>{t("title")}</PopoverTitle>',
    "<PopoverDescription>",
    "<Empty>",
    "formatNotification(notification.type, notification.payload)",
    "getNotificationHref(notification.type, notification.payload)",
    "onClick={async () => {",
    "if (notification.readAt === null) await onMarkRead?.(notification.id);",
    "if (destination) onNavigate?.(destination.href);",
  ]);

  addMissingTokens(records, "pending-boolean-or-spinner", formPath, form, [
    "export function AppFormSubmitButton",
    "<form.Subscribe selector=",
    "disabled={!canSubmit || isSubmitting}",
    "<Spinner data-icon=",
    "SubmitButton: AppFormSubmitButton",
  ]);
  for (const forbidden of ["isPending?:", "isPending={", "border-t-transparent"]) {
    if (form.includes(forbidden)) {
      records.push({ category: "pending-boolean-or-spinner", path: formPath, evidence: forbidden });
    }
  }
  for (const file of target.files.filter(({ path }) => path.startsWith(`${target.sourceRoot}/`))) {
    if (file.content.includes("isPending={")) {
      records.push({
        category: "pending-boolean-or-spinner",
        path: file.path,
        evidence: "stale isPending binding",
      });
    }
  }

  for (const { relativePath, count, appForm } of pendingFormExpectations(target)) {
    const path = `${target.sourceRoot}/${relativePath}`;
    const content = [
      source(target, relativePath),
      ...(relativePath === "features/settings/two-factor-card.tsx"
        ? [source(target, "features/settings/use-two-factor-settings.ts")]
        : []),
    ].join("\n");
    const useFormCount = (content.match(/\buse(?:App)?Form\(\{/g) ?? []).length;
    const subscribeCount = (content.match(/<(?:form|[A-Za-z][A-Za-z0-9]*Form)\.Subscribe\b/g) ?? [])
      .length;
    const appSubmitCount = (
      content.match(/<(?:form|[A-Za-z][A-Za-z0-9]*Form)\.SubmitButton\b/g) ?? []
    ).length;
    const submitContractCount = subscribeCount + appSubmitCount;
    for (const [evidence, actual] of [
      ["concrete form hook call", useFormCount],
      ["subscribed submit contract", submitContractCount],
    ] as const) {
      if (actual < count) {
        records.push({
          category: "pending-boolean-or-spinner",
          path,
          evidence: `expected ${count} ${evidence} occurrence(s), received ${actual}`,
        });
      }
    }
    if (appForm) {
      addMissingTokens(records, "field-composition", path, content, [
        "<form.AppForm>",
        "<form.AppField",
        "<form.SubmitButton",
      ]);
    }
  }
  if (selectField.includes("<SelectContent>{options.map")) {
    records.push({
      category: "ungrouped-select-item",
      path: selectFieldPath,
      evidence: "SelectItem rendered directly in SelectContent",
    });
  }

  for (const [path, content] of [
    [selectFieldPath, selectField],
    [passwordFieldPath, passwordField],
    [notificationPath, notification],
    [selectPath, select],
  ] as Array<[string, string]>) {
    for (const element of rawInteractiveElements(path, content)) {
      records.push({ category: "raw-interactive-markup", path, evidence: `<${element}>` });
    }
  }

  const consumers = consumerPaths(target);
  const consumerEntries = Object.values(consumers).filter(
    (relativePath): relativePath is string => typeof relativePath === "string",
  );
  for (const relativePath of new Set(consumerEntries)) {
    const path = `${target.sourceRoot}/${relativePath}`;
    const content = source(target, relativePath);
    for (const match of content.matchAll(/\basChild\b/g)) {
      records.push({ category: "radix-as-child", path, evidence: match[0] });
    }
  }

  const adminUsersPath = `${target.sourceRoot}/${consumers.adminUsers}`;
  const adminUsers = [
    source(target, consumers.adminUsers),
    source(target, "features/admin-users/components/user-results.tsx"),
  ].join("\n");
  addMissingTokens(records, "ad-hoc-empty-state", adminUsersPath, adminUsers, [
    "<Empty",
    "<EmptyHeader",
    "<EmptyTitle",
    "<EmptyDescription",
    "<EmptyContent",
  ]);
  if (/text-center[^>]*>\s*No users/i.test(adminUsers)) {
    records.push({
      category: "ad-hoc-empty-state",
      path: adminUsersPath,
      evidence: "styled No users fallback",
    });
  }

  const adminFiltersPath = `${target.sourceRoot}/${consumers.adminFilters}`;
  const adminFilters = source(target, consumers.adminFilters);
  addMissingTokens(records, "field-composition", adminFiltersPath, adminFilters, [
    "<form.AppForm>",
    "<form.AppField",
    "<field.TextField",
    "const translate = useAdminUsersTranslations()",
    "validators: { onSubmit: adminUsersFilterSchema(translate) }",
    'label={translate("filters.label")}',
    'description={translate("filters.description")}',
    'placeholder={translate("filters.placeholder")}',
    "<form.SubmitButton",
    'pendingLabel={translate("filters.searching")}',
    '{translate("filters.search")}',
    'role="status"',
    'aria-live="polite"',
    'translate("filters.updating")',
    'aria-label={translate("pagination.label")}',
  ]);

  const adminCreatePath = `${target.sourceRoot}/${consumers.adminCreate}`;
  const adminCreate = source(target, consumers.adminCreate);
  addMissingTokens(records, "field-composition", adminCreatePath, adminCreate, [
    "<FieldGroup",
    "<form.AppForm>",
    "<form.AppField",
    "<field.TextField",
    "<field.PasswordField",
    "<form.SubmitButton",
    "const translate = useAdminUsersTranslations()",
    "validators: { onSubmit: createAdminUserSchema(translate) }",
    'label={translate("create.nameLabel")}',
    'description={translate("create.nameDescription")}',
    'label={translate("create.emailLabel")}',
    'description={translate("create.emailDescription")}',
    'label={translate("create.passwordLabel")}',
    'description={translate("create.passwordDescription")}',
    'label={translate("create.roleLabel")}',
    'description={translate("create.roleDescription")}',
    'role="alert"',
    'aria-live="polite"',
    'translate("create.creating")',
    'pendingLabel={translate("create.creatingPending")}',
  ]);
  addMissingTokens(records, "nonfunctional-select", adminCreatePath, adminCreate, [
    "<field.SelectField",
    "const roleOptions = [",
    '{ label: translate("roles.user"), value: "user" }',
    '{ label: translate("roles.admin"), value: "admin" }',
    "options={roleOptions}",
  ]);

  for (const [relativePath, content] of [
    [consumers.adminFilters, adminFilters],
    [consumers.adminCreate, adminCreate],
  ] as const) {
    const path = `${target.sourceRoot}/${relativePath}`;
    for (const element of rawInteractiveElements(path, content).filter(
      (name) => name === "input" || name === "select",
    )) {
      records.push({ category: "raw-form-control", path, evidence: `<${element}>` });
    }
  }

  const adminUserTablePath = `${target.sourceRoot}/${consumers.adminUserTable}`;
  const adminUserTable = source(target, consumers.adminUserTable);
  addMissingTokens(records, "field-composition", adminUserTablePath, adminUserTable, [
    "<TableCaption>",
    'scope="col"',
    'translate("table.account")',
    'translate("table.role")',
    'translate("table.status")',
    'translate("table.actions")',
    'aria-busy="true"',
    'aria-label={translate("table.loading")}',
  ]);

  const adminUserActionsPath = `${target.sourceRoot}/${consumers.adminUserActions}`;
  const adminUserActions = [
    source(target, consumers.adminUserActions),
    source(target, "features/admin-users/components/user-row-confirmation.tsx"),
  ].join("\n");
  addMissingTokens(records, "field-composition", adminUserActionsPath, adminUserActions, [
    "<AlertDialogTitle>",
    "<AlertDialogDescription>",
    'type="button"',
    "aria-busy={pending}",
    'translate("dialogs.cancel")',
    'translate("dialogs.saving")',
  ]);

  for (const relativePath of [
    consumers.adminUsers,
    consumers.adminFilters,
    consumers.adminCreate,
    consumers.adminUserActions,
    consumers.adminUserTable,
  ]) {
    const path = `${target.sourceRoot}/${relativePath}`;
    const content = source(target, relativePath);
    for (const match of content.matchAll(
      /\bfetch\s*\(|@\/lib\/orpc|convex\/react|authClient|\buse(?:Query|Mutation)\s*\(/g,
    )) {
      records.push({
        category: "presentation-network-access",
        path,
        evidence: match[0],
      });
    }
  }

  const adminSchemaPath = `${target.sourceRoot}/${consumers.adminSchema}`;
  const adminSchema = source(target, consumers.adminSchema);
  addMissingTokens(records, "field-composition", adminSchemaPath, adminSchema, [
    'export const adminUserRoleSchema = z.enum(["user", "admin"])',
    "export function adminUsersFilterSchema(translate: AdminUsersTranslate)",
    "export function createAdminUserSchema(translate: AdminUsersTranslate)",
    'translate("validation.searchTooLong")',
    'translate("validation.emailInvalid")',
  ]);
  const adminTranslationsPath = `${target.sourceRoot}/${consumers.adminTranslations}`;
  const adminTranslations = source(target, consumers.adminTranslations);
  addMissingTokens(records, "field-composition", adminTranslationsPath, adminTranslations, [
    "export const ADMIN_USERS_MESSAGE_KEYS",
    "export type AdminUsersTranslate",
    "export function useAdminUsersTranslations(): AdminUsersTranslate",
    "const translateEnglish: AdminUsersTranslate",
  ]);
  if (/next-intl|@\/lib\/i18n/.test(adminTranslations)) {
    records.push({
      category: "presentation-network-access",
      path: adminTranslationsPath,
      evidence: "i18n runtime leaked into a feature-off target",
    });
  }
  const adminHookPath = `${target.sourceRoot}/${consumers.adminHook}`;
  const adminHook = source(target, consumers.adminHook);
  addMissingTokens(records, "field-composition", adminHookPath, adminHook, [
    "useAdminUsersData(filters",
    "useAdminUserMutations()",
    "AdminUsersFilterInput",
    "CreateAdminUserInput",
  ]);
  for (const [path, content] of [
    [adminSchemaPath, adminSchema],
    [adminTranslationsPath, adminTranslations],
    [adminHookPath, adminHook],
  ] as Array<[string, string]>) {
    for (const match of content.matchAll(/\bas unknown as\b|:\s*any\b|@ts-ignore/g)) {
      records.push({ category: "unsafe-type-escape", path, evidence: match[0] });
    }
  }
  for (const match of adminHook.matchAll(/\bfetch\s*\(|\buseEffect\s*\(/g)) {
    records.push({
      category: "presentation-network-access",
      path: adminHookPath,
      evidence: match[0],
    });
  }

  if (/different email or name|email or name/i.test(adminUsers)) {
    records.push({
      category: "product-semantic-style",
      path: adminUsersPath,
      evidence: "search copy claims unsupported name matching",
    });
  }

  if (target.mode === "single") {
    const forgotPath =
      target.framework === "nextjs" ? "app/forgot-password/page.tsx" : "routes/forgot-password.tsx";
    const resetPath =
      target.framework === "nextjs" ? "app/reset-password/page.tsx" : "routes/reset-password.tsx";
    const forgot = source(target, forgotPath);
    const reset = source(target, resetPath);
    if (forgot.includes("<form.AppField")) {
      addMissingTokens(records, "field-composition", `${target.sourceRoot}/${forgotPath}`, forgot, [
        '<form.AppField name="email">',
        "<field.TextField",
      ]);
    } else {
      addFieldAssociationRecords(
        records,
        `${target.sourceRoot}/${forgotPath}`,
        forgot,
        "forgot-email",
      );
    }
    if (reset.includes("<form.AppField")) {
      addMissingTokens(records, "field-composition", `${target.sourceRoot}/${resetPath}`, reset, [
        '<form.AppField name="newPassword">',
        '<form.AppField name="confirmPassword">',
        "<field.PasswordField",
      ]);
    } else {
      for (const id of ["new-password", "confirm-password"]) {
        addFieldAssociationRecords(records, `${target.sourceRoot}/${resetPath}`, reset, id);
      }
    }
  }

  if (target.mode === "single" && target.framework === "tanstack-start") {
    const settingsPath = `${target.sourceRoot}/features/settings`;
    const settings = target.files
      .filter(({ path }) => path.startsWith(`${settingsPath}/`))
      .map(({ content }) => content)
      .join("\n");
    addMissingTokens(records, "field-composition", settingsPath, settings, [
      'from "@/components/ui/form"',
      "useAppForm({",
      '<form.AppField name="password">',
      "<field.PasswordField",
    ]);
    addMissingTokens(records, "nonfunctional-select", settingsPath, settings, [
      'from "@/components/ui/select"',
      "const securityActions = SETTINGS_ACTIONS.map",
      "label: t(action.labelKey)",
      "items={securityActions}",
      "onValueChange=",
      "<SelectGroup>",
      "<SelectItem",
    ]);
    addMissingTokens(records, "ad-hoc-empty-state", settingsPath, settings, [
      'from "@/components/ui/empty"',
      "<Empty",
      "<EmptyHeader",
      "<EmptyTitle",
      "<EmptyDescription",
      "<EmptyContent",
    ]);
    addMissingTokens(records, "radix-as-child", settingsPath, settings, [
      'from "@/components/ui/dialog"',
      "<Dialog",
      "<DialogTrigger render={<Button",
      "<DialogTitle",
    ]);
    for (const element of rawInteractiveElements(settingsPath, settings).filter(
      (name) => name === "input" || name === "select",
    )) {
      records.push({ category: "raw-form-control", path: settingsPath, evidence: `<${element}>` });
    }
    for (const match of settings.matchAll(/\bas unknown as\b|Route\.useRouteContext\(\) as/g)) {
      records.push({ category: "unsafe-type-escape", path: settingsPath, evidence: match[0] });
    }
  }

  const headerPath = `${target.sourceRoot}/${consumers.header}`;
  const header = [
    source(target, consumers.header),
    source(target, "components/header-actions.tsx"),
    source(target, "components/header-user-menu.tsx"),
  ].join("\n");
  addMissingTokens(records, "radix-as-child", headerPath, header, [
    "<DropdownMenuTrigger",
    "render={<Button",
    "<Avatar",
  ]);

  const userActionsPath = `${target.sourceRoot}/${consumers.adminUserActions}`;
  const userActions = [
    source(target, consumers.adminUserActions),
    source(target, "features/admin-users/components/user-row-confirmation.tsx"),
  ].join("\n");
  if (target.framework === "nextjs") {
    if ((userActions.match(/<Button\b/g) ?? []).length < 4) {
      records.push({
        category: "radix-as-child",
        path: userActionsPath,
        evidence: "missing accessible role/ban action and confirmation buttons",
      });
    }
  }

  if (consumers.dangerZone !== undefined) {
    const path = `${target.sourceRoot}/${consumers.dangerZone}`;
    const content = source(target, consumers.dangerZone);
    if (!content.includes("<DialogTrigger render={<Button")) {
      records.push({
        category: "radix-as-child",
        path,
        evidence: "missing composed danger-zone Dialog trigger",
      });
    }
  }

  return records;
}

describe("generated shared frontend primitives", () => {
  test("Task 3 surface source uses the Product register vocabulary", () => {
    const surfaceSource = readFileSync(
      resolve(import.meta.dir, "../../src/templates/apps/fragments/lib/surface-styles.ts"),
      "utf8",
    );
    expect(surfaceSource.toLowerCase()).not.toContain("editorial");
  });

  test("browser contract checks page and console errors after all interactions", () => {
    const integration = readFileSync(
      resolve(import.meta.dir, "../integration/generated-web-primitives.test.ts"),
      "utf8",
    );
    expect(integration.match(/expect\(pageErrors\)\.toEqual\(\[\]\)/g)).toHaveLength(2);
    expect(integration.match(/expect\(consoleErrors\)\.toEqual\(\[\]\)/g)).toHaveLength(2);
    expect(integration.lastIndexOf("expect(pageErrors).toEqual([])")).toBeGreaterThan(
      integration.indexOf("disabledReveal.click"),
    );
  });

  for (const target of targets) {
    test(`${target.label} enumerates and parses every reviewed primitive record`, () => {
      const inventory = reviewedRecords(target);
      expect(inventory).toHaveLength(36);
      const reviewedRelativePaths = new Set([
        ...inventory.map(({ relativePath }) => relativePath),
        ...pendingFormExpectations(target).map(({ relativePath }) => relativePath),
        ...Object.values(consumerPaths(target)),
      ]);
      expect(
        [...reviewedRelativePaths].filter((relativePath) => source(target, relativePath) === ""),
      ).toEqual([]);
      const diagnostics = target.files
        .filter(({ path }) => {
          if (!path.startsWith(`${target.sourceRoot}/`) || !path.endsWith(".tsx")) return false;
          return reviewedRelativePaths.has(path.slice(target.sourceRoot.length + 1));
        })
        .flatMap(({ path, content }) =>
          parseSync(path, content).errors.map((error) => `${path}: ${error.message}`),
        );
      expect(diagnostics).toEqual([]);
    });

    test(`${target.label} has zero reviewed primitive and consumer inventory records`, () => {
      const records = collectPrimitiveRecords(target);
      const counts = Object.fromEntries(
        [
          "ad-hoc-empty-state",
          "field-composition",
          "internal-icon-size",
          "manual-overlay-z-index",
          "nonfunctional-select",
          "partial-notification-bell",
          "pending-boolean-or-spinner",
          "presentation-network-access",
          "product-semantic-style",
          "radix-as-child",
          "raw-form-control",
          "raw-interactive-markup",
          "unsafe-type-escape",
          "ungrouped-select-item",
        ].map((category) => [
          category,
          records.filter((record) => record.category === category).length,
        ]),
      );
      expect(counts, JSON.stringify(records, null, 2)).toEqual({
        "ad-hoc-empty-state": 0,
        "field-composition": 0,
        "internal-icon-size": 0,
        "manual-overlay-z-index": 0,
        "nonfunctional-select": 0,
        "partial-notification-bell": 0,
        "pending-boolean-or-spinner": 0,
        "presentation-network-access": 0,
        "product-semantic-style": 0,
        "radix-as-child": 0,
        "raw-form-control": 0,
        "raw-interactive-markup": 0,
        "unsafe-type-escape": 0,
        "ungrouped-select-item": 0,
      });
    });

    test(`${target.label} declares the configured icon and server-only dependencies`, () => {
      const manifestSource =
        target.files.find((file) => file.path === target.manifestPath)?.content ?? "{}";
      const manifest = JSON.parse(manifestSource) as {
        dependencies?: Record<string, string>;
      };
      expect(manifest.dependencies?.["lucide-react"]).toBe(uiVersions["lucide-react"]);
      expect(manifest.dependencies?.["server-only"]).toBe("0.0.1");
    });
  }

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode} ${framework} keeps feature-off fallback and feature-on translations explicit`, () => {
        const sourceRoot = mode === "monorepo" ? "apps/web/src" : "src";
        const translationPath = `${sourceRoot}/features/admin-users/translations.ts`;
        const disabledFiles = generateProjectFiles(config(mode, framework), { dryRun: false });
        const enabledFiles = generateProjectFiles(
          { ...config(mode, framework), features: ["i18n"] },
          { dryRun: false },
        );
        const disabled = disabledFiles.find(({ path }) => path === translationPath)?.content ?? "";
        const enabled = enabledFiles.find(({ path }) => path === translationPath)?.content ?? "";
        const enabledFeature = enabledFiles
          .filter(({ path }) => path.startsWith(`${sourceRoot}/features/admin-users/`))
          .map(({ content }) => content)
          .join("\n");

        expect(disabled).toContain("const translateEnglish: AdminUsersTranslate");
        expect(disabled).toContain("return translateEnglish");
        expect(disabled).not.toContain("useFrameworkTranslations");
        expect(enabled).toContain(
          framework === "nextjs" ? 'from "next-intl"' : 'from "@/lib/i18n"',
        );
        expect(enabled).toContain('useFrameworkTranslations("adminUsers")');
        expect(enabled).not.toContain("translateEnglish");
        expect(enabledFeature).toContain('description={translate("filters.description")}');
        expect(enabledFeature).toContain('aria-label={translate("table.loading")}');
      });
    }
  }

  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} TanStack declares the configured icon and server-only dependencies`, () => {
      const files = generateProjectFiles(
        { ...config(mode), framework: "tanstack-start" },
        { dryRun: false },
      );
      const manifestPath = mode === "monorepo" ? "apps/web/package.json" : "package.json";
      const manifestSource = files.find((file) => file.path === manifestPath)?.content ?? "{}";
      const manifest = JSON.parse(manifestSource) as {
        dependencies?: Record<string, string>;
      };
      expect(manifest.dependencies?.["lucide-react"]).toBe(uiVersions["lucide-react"]);
      expect(manifest.dependencies?.["server-only"]).toBe("0.0.1");
    });
  }
});
