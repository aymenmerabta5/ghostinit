import { EN_MESSAGES } from "../../../i18n/messages/en.js";
import { file, type TemplateFile } from "../../../shared.js";
import { adminFeatureRoot, type AdminTemplateOptions } from "./model.js";

function flattenMessages(
  value: unknown,
  prefix = "",
  output: Record<string, string> = {},
): Record<string, string> {
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") output[path] = child;
    else flattenMessages(child, path, output);
  }
  return output;
}

function adapterContent(options: AdminTemplateOptions): string {
  const englishMessages = flattenMessages(EN_MESSAGES.adminUsers);
  const keys = Object.keys(englishMessages).sort();
  const frameworkImport = !options.i18n
    ? ""
    : options.framework === "next"
      ? 'import { useTranslations as useFrameworkTranslations } from "next-intl";'
      : 'import { useTranslations as useFrameworkTranslations } from "@/lib/i18n";';
  const hookImplementation = options.i18n
    ? `export function useAdminUsersTranslations(): AdminUsersTranslate {
  const translate = useFrameworkTranslations("adminUsers");
  return (key, values) => translate(key, values);
}`
    : `const ENGLISH_ADMIN_USERS_MESSAGES: Readonly<Record<AdminUsersMessageKey, string>> = ${JSON.stringify(englishMessages, null, 2)};

function interpolate(message: string, values?: AdminUsersTranslationValues): string {
  if (!values) return message;
  return message.replace(/\\{(\\w+)\\}/g, (placeholder, key: string) => {
    const value = values[key];
    return value === undefined ? placeholder : String(value);
  });
}

const translateEnglish: AdminUsersTranslate = (key, values) =>
  interpolate(ENGLISH_ADMIN_USERS_MESSAGES[key], values);

export function useAdminUsersTranslations(): AdminUsersTranslate {
  return translateEnglish;
}`;

  return `"use client";

${frameworkImport}
import { resolveRpcError } from "@/lib/query-client";

export const ADMIN_USERS_MESSAGE_KEYS = ${JSON.stringify(keys, null, 2)} as const;

export type AdminUsersMessageKey = (typeof ADMIN_USERS_MESSAGE_KEYS)[number];
export type AdminUsersTranslationValues = Readonly<Record<string, string | number>>;
export type AdminUsersTranslate = (
  key: AdminUsersMessageKey,
  values?: AdminUsersTranslationValues,
) => string;

${hookImplementation}

export function formatAdminUsersAccountCount(
  translate: AdminUsersTranslate,
  count: number,
  exact: boolean,
): string {
  const displayCount = exact ? String(count) : String(count) + "+";
  const key = count === 1 && exact ? "counts.accountOne" : "counts.accountMany";
  return translate(key, { count: displayCount });
}

const ERROR_KEYS: Readonly<Record<string, AdminUsersMessageKey>> = {
  ACCOUNT_SUSPENDED: "errors.actorBanned",
  ADMIN_ACTOR_BANNED: "errors.actorBanned",
  ADMIN_FORBIDDEN: "errors.forbidden",
  ADMIN_LAST_ADMIN: "errors.lastAdmin",
  ADMIN_SELF_ACTION: "errors.selfAction",
  ADMIN_USER_NOT_FOUND: "errors.userNotFound",
  BAD_REQUEST: "errors.validation",
  FORBIDDEN: "errors.forbidden",
  INTERNAL_SERVER_ERROR: "errors.requestFailed",
  NOT_FOUND: "errors.userNotFound",
  TOO_MANY_REQUESTS: "errors.rateLimited",
  UNAUTHORIZED: "errors.unauthorized",
  VALIDATION_ERROR: "errors.validation",
};

export function translateAdminUsersError(
  error: unknown,
  translate: AdminUsersTranslate,
  fallbackKey: "errors.createFailed" | "errors.requestFailed" = "errors.requestFailed",
): string | null {
  if (!error) return null;
  const rpcError = resolveRpcError(error);
  const code = rpcError?.applicationCode ?? rpcError?.transportCode;
  return translate((code && ERROR_KEYS[code]) || fallbackKey);
}
`;
}

export function adminTranslationsFile(options: AdminTemplateOptions): TemplateFile {
  return file(`${adminFeatureRoot(options)}/translations.ts`, adapterContent(options));
}
