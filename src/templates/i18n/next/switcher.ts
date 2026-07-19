import { file, type TemplateFile } from "../../shared.js";

export function nextLocaleSwitcherComponent(filePath: string): TemplateFile {
  return file(
    filePath,
    `"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "../i18n/navigation.js";
import { locales, localeNames, type Locale } from "../i18n/config.js";

export interface LocaleSwitcherProps { className?: string; }

export function LocaleSwitcher({ className }: LocaleSwitcherProps): React.JSX.Element {
  const t = useTranslations("localeSwitcher");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = React.useTransition();

  function handleChange(nextLocale: Locale): void {
    if (nextLocale === locale) return;
    startTransition(() => {
      // @ts-expect-error typed pathname with locale
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <label className={className} aria-label={t("label")}>
      <span className="sr-only">{t("label")}</span>
      <select value={locale} onChange={(e) => handleChange(e.target.value as Locale)} disabled={isPending} className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-50" aria-busy={isPending}>
        {locales.map((cur) => (
          <option key={cur} value={cur}>{localeNames[cur]} — {t(cur as "en" | "fr" | "ar")}</option>
        ))}
      </select>
    </label>
  );
}

export function LocaleSwitcherInline({ className }: LocaleSwitcherProps): React.JSX.Element {
  const t = useTranslations("localeSwitcher");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = React.useTransition();

  function handleChange(nextLocale: Locale): void {
    if (nextLocale === locale) return;
    startTransition(() => {
      // @ts-expect-error typed pathname with locale
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <div className={className} role="group" aria-label={t("label")}>
      {locales.map((cur) => (
        <button key={cur} type="button" onClick={() => handleChange(cur)} disabled={isPending || cur === locale} aria-current={cur === locale ? "true" : undefined} aria-label={localeNames[cur]} className={cur === locale ? "h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground" : "h-8 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground hover:bg-accent"}>
          {cur.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
`,
  );
}
