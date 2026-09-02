import { file, type TemplateFile } from "../../shared.js";

export function tanstackLocaleSwitcherFile(filePath: string): TemplateFile {
  return file(
    filePath,
    `import * as React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isValidLocale, localeLabels, locales } from "../i18n/config.js";
import { useI18n, useTranslations } from "../lib/i18n.js";

export interface LocaleSwitcherProps {
  className?: string;
}

export function LocaleSwitcher({ className }: LocaleSwitcherProps): React.JSX.Element {
  const { locale, setLocale } = useI18n();
  const t = useTranslations("localeSwitcher");
  const [isPending, startTransition] = React.useTransition();
  const items = locales.map((availableLocale) => ({
    label: localeLabels[availableLocale],
    value: availableLocale,
  }));

  function handleChange(value: string): void {
    if (!isValidLocale(value) || value === locale) return;
    startTransition(() => setLocale(value));
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
