import { file, type TemplateFile } from "../../shared.js";

export function nextLocaleSwitcherComponent(filePath: string): TemplateFile {
  return file(
    filePath,
    `"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  defaultLocale,
  isValidLocale,
  localeCookieMaxAge,
  localeCookieName,
  localeLabels,
  locales,
  type Locale,
} from "../i18n/config.js";
import { useRouter } from "../i18n/navigation.js";

export interface LocaleSwitcherProps {
  className?: string;
}

function writeLocaleCookie(locale: Locale): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    localeCookieName +
    "=" +
    encodeURIComponent(locale) +
    "; Path=/; Max-Age=" +
    localeCookieMaxAge +
    "; SameSite=Lax" +
    secure;
}

export function LocaleSwitcher({ className }: LocaleSwitcherProps): React.JSX.Element {
  const t = useTranslations("localeSwitcher");
  const currentLocale = useLocale();
  const locale = isValidLocale(currentLocale) ? currentLocale : defaultLocale;
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const items = locales.map((availableLocale) => ({
    label: localeLabels[availableLocale],
    value: availableLocale,
  }));

  function handleChange(value: string): void {
    if (!isValidLocale(value) || value === locale) return;
    writeLocaleCookie(value);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className={className} data-slot="locale-switcher">
      <Select items={items} value={locale} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger aria-label={t("label")} aria-busy={isPending}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {locales.map((availableLocale) => (
              <SelectItem key={availableLocale} value={availableLocale}>
                {t(availableLocale)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function LocaleSwitcherInline({ className }: LocaleSwitcherProps): React.JSX.Element {
  return <LocaleSwitcher className={className} />;
}
`,
  );
}
