import { file, type TemplateFile } from "../../../shared.js";
import type { DesktopMode } from "../model.js";
import { desktopAdminCreateSource } from "./admin-users.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../../fragments/native-i18n.js";

export function desktopAdminCreateFeatureFiles(
  root: string,
  mode: DesktopMode,
  hasI18n: boolean,
): TemplateFile[] {
  const i18n = nativeI18nTemplate(hasI18n, "adminUsers", nativeI18nImportPath("desktop", mode));
  let source = desktopAdminCreateSource(false, mode, hasI18n);
  const setupStart = source.indexOf("  const session = useQuery(");
  const setupEnd = source.indexOf("  if (authPending)", setupStart);
  let setup = source
    .slice(setupStart, setupEnd)
    .replace(
      "  const session = useQuery(desktopQueryOptions.me());\n  const authPending = session.isPending;\n  const userRole = session.data?.user?.banned ? null : session.data?.user?.role;",
      "  const identity = useAdminIdentity();\n  const authPending = identity.isPending;\n  const userRole = identity.role;",
    )
    .replace(
      "const createUser = useMutation(orpc.adminUsers.create.mutationOptions());",
      "const createUser = useCreateAdminUserMutation();",
    )
    .replace("const form = useForm({", "const form = useAppForm({");
  const schemaStart = setup.indexOf("  const createUserSchema =");
  const schemaEnd = setup.indexOf("\n", schemaStart);
  const schema = setup.slice(schemaStart, schemaEnd);
  let schemaExpression = schema.slice(schema.indexOf("= ") + 2).replace(/;$/, "");
  const messages = {
    nameRequired: i18n.value("validation.nameRequired", "Name required"),
    emailInvalid: i18n.value("validation.emailInvalid", "Enter a valid email"),
    passwordTooShort: i18n.value(
      "validation.passwordTooShort",
      "Password must be at least 8 characters",
    ),
    passwordTooLong: i18n.value(
      "validation.passwordTooLong",
      "Password must be 128 characters or fewer",
    ),
  };
  for (const [key, value] of Object.entries(messages))
    schemaExpression = schemaExpression.replaceAll(value, `messages.${key}`);
  setup =
    setup.slice(0, schemaStart) +
    `  const messages = { ${Object.entries(messages)
      .map(([key, value]) => `${key}: ${value}`)
      .join(
        ", ",
      )} };\n  const createUserSchema = adminCreateSchema(messages);\n  const fieldValidators = adminFieldValidators(messages);` +
    setup.slice(schemaEnd);
  source =
    source.slice(0, setupStart) +
    "  const { authPending, userRole, form, roleItems, error, fieldValidators } = state;\n" +
    source.slice(setupEnd);
  source = source
    .replace(
      /^import.*(?:@tanstack\/react-query|@tanstack\/react-form|desktopQueryOptions|from "zod").*;\n/gm,
      "",
    )
    .replace("import { createFileRoute, Link, useRouter }", "import { Link }")
    .replace(/export const Route = createFileRoute\([^]*?\}\);\n\n/, "")
    .replace(
      "function AdminCreateUserPage()",
      "export function AdminCreateUserView({ state }: { state: AdminCreateState }): React.JSX.Element",
    )
    .replace(
      'import * as React from "react";',
      'import * as React from "react";\nimport { Form } from "@/components/ui/form";\nimport type { AdminCreateState } from "../use-create-admin-user";',
    );
  for (const name of ["name", "email", "password"]) {
    source = source.replace(
      new RegExp(`<form\\.Field name="${name}"[^]*?>\\{\\(field\\) =>`),
      `<form.Field name="${name}" validators={fieldValidators.${name}}>{(field) =>`,
    );
  }
  source = source
    .replace(
      /<form onSubmit=[^]*?className="flex flex-col gap-4">/,
      '<form.AppForm><Form form={form} className="flex flex-col gap-4">',
    )
    .replace("</form>", "</Form></form.AppForm>")
    .replace(
      /<Button type="submit">([^]*?)<\/Button>/,
      "<form.SubmitButton>$1</form.SubmitButton>",
    );
  const identityStart = source.indexOf('<form.Field name="name"');
  const accessStart = source.indexOf('<form.Field name="password"', identityStart);
  const fieldsEnd = source.indexOf("<form.SubmitButton>", accessStart);
  const identityFields = source.slice(identityStart, accessStart);
  const accessFields = source.slice(accessStart, fieldsEnd);
  const fieldView = (
    name: string,
    fields: string,
    access: boolean,
  ): string => `import type * as React from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
${access ? 'import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";' : ""}
import type { AdminCreateState } from "../use-create-admin-user";
${i18n.importLine}
export function ${name}({ state }: { state: Pick<AdminCreateState, "form" | "fieldValidators"${access ? ' | "roleItems"' : ""}> }): React.JSX.Element {
${i18n.hookLine}
  const { form, fieldValidators${access ? ", roleItems" : ""} } = state;
  return <>${fields}</>;
}
`;
  source = (
    source.slice(0, identityStart) +
    "<AdminIdentityFields state={state} /><AdminAccessFields state={state} />" +
    source.slice(fieldsEnd)
  )
    .replace(
      /^import.*(?:components\/ui\/field|components\/ui\/input|components\/ui\/select).*;\n/gm,
      "",
    )
    .replace(
      'import { Form } from "@/components/ui/form";',
      'import { Form } from "@/components/ui/form";\nimport { AdminIdentityFields } from "./create-identity-fields";\nimport { AdminAccessFields } from "./create-access-fields";',
    )
    .replace(
      "authPending, userRole, form, roleItems, error, fieldValidators",
      "authPending, userRole, form, error",
    );
  return [
    file(
      `${root}/create-screen.tsx`,
      `import type * as React from "react";
import { useCreateAdminUser } from "./use-create-admin-user";
import { AdminCreateUserView } from "./components/create-user-view";
export function AdminCreateUserScreen(): React.JSX.Element { return <AdminCreateUserView state={useCreateAdminUser()} />; }
`,
    ),
    file(`${root}/components/create-user-view.tsx`, source),
    file(
      `${root}/components/create-identity-fields.tsx`,
      fieldView("AdminIdentityFields", identityFields, false),
    ),
    file(
      `${root}/components/create-access-fields.tsx`,
      fieldView("AdminAccessFields", accessFields, true),
    ),
    file(
      `${root}/use-create-admin-user.ts`,
      `import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import { useAppForm } from "@/components/ui/form";
import { useAdminIdentity } from "./queries";
import { useCreateAdminUserMutation } from "./mutations";
import { adminCreateSchema, adminFieldValidators } from "./validation";
${i18n.importLine}
export function useCreateAdminUser() {
${i18n.hookLine}
${setup}
  return { authPending, userRole, form, roleItems, error, fieldValidators };
}
export type AdminCreateState = ReturnType<typeof useCreateAdminUser>;
`,
    ),
    file(
      `${root}/validation.ts`,
      `import { z } from "zod";
interface AdminValidationMessages { nameRequired: string; emailInvalid: string; passwordTooShort: string; passwordTooLong: string; }
export function adminCreateSchema(messages: AdminValidationMessages) { return ${schemaExpression}; }
export function adminFieldValidators(messages: AdminValidationMessages) {
  return {
    name: { onChange: ({ value }: { value: string }) => value.trim().length ? undefined : messages.nameRequired },
    email: { onChange: ({ value }: { value: string }) => value.includes("@") ? undefined : messages.emailInvalid,
      onSubmit: ({ value }: { value: string }) => z.email().safeParse(value).success ? undefined : messages.emailInvalid },
    password: { onChange: ({ value }: { value: string }) => value.length >= 8 ? undefined : messages.passwordTooShort },
  };
}
`,
    ),
  ];
}
