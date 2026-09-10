import { elements, type TestElement } from "./generated-form-harness.js";

export function emittedSource(
  files: readonly { path: string; content: string }[],
  suffix: string,
): string {
  const match = files.find(({ path }) => path.endsWith(suffix));
  if (!match) throw new Error(`Missing emitted admin file ${suffix}`);
  return match.content;
}

export function nodesOf(value: unknown, type: string): TestElement[] {
  return elements(value).filter((element) => element.type === type);
}

export function readStateText(value: unknown): string {
  if (Array.isArray(value)) return value.map(readStateText).join(" ");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object" || !("children" in value)) return "";
  return readStateText((value as TestElement).children);
}

export function translated(key: string, values?: { count?: number }): string {
  return values?.count === undefined ? key : `${key}:${values.count}`;
}

export function adminUiBindings(): Record<string, unknown> {
  return Object.fromEntries(
    [
      "ActivityIndicator",
      "AdminCreateCard",
      "AdminUserActions",
      "AdminUserFilters",
      "AdminUsersPagination",
      "Alert",
      "AlertDescription",
      "AlertTitle",
      "Badge",
      "Button",
      "Card",
      "CardContent",
      "CardDescription",
      "CardHeader",
      "CardTitle",
      "CreateUserForm",
      "Empty",
      "EmptyContent",
      "EmptyDescription",
      "EmptyHeader",
      "EmptyTitle",
      "Input",
      "Link",
      "ScrollView",
      "Separator",
      "Skeleton",
      "Text",
      "UserTable",
      "UserTableSkeleton",
      "View",
    ].map((name) => [name, name]),
  );
}

export function activate(
  tree: unknown,
  label: string,
  event: "onClick" | "onPress" = "onClick",
): void {
  const button = nodesOf(tree, "Button").find((node) => readStateText(node).includes(label));
  if (!button) throw new Error(`Missing button ${label}`);
  const action = button.props[event];
  if (typeof action !== "function") throw new Error(`Missing ${event} for ${label}`);
  action();
}

export const knownAdminUser = {
  id: "account-a",
  authId: "account-a",
  identityId: "identity-a",
  name: "Known member",
  email: "known@example.test",
  role: "user",
  banned: false,
};
