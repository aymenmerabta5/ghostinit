import { file, type TemplateFile } from "../../shared.js";

export function tanstackLocaleSwitcherFile(filePath: string): TemplateFile {
  return file(
    filePath,
    `"use client";
import * as React from "react";
import { locales, localeNames, type Locale } from "../i18n/config.js";
import { useI18n } from "../lib/i18n.js";

export interface LocaleSwitcherProps { className?: string; }

export function LocaleSwitcher({ className }: LocaleSwitcherProps): React.JSX.Element {
  const { locale, setLocale } = useI18n();
  const [isPending, startTransition] = React.useTransition();
  function handleChange(nextLocale: Locale): void { if (nextLocale === locale) return; startTransition(() => setLocale(nextLocale)); }
  return (
    <label className={className} aria-label="Language">
      <span className="sr-only">Language</span>
      <select value={locale} onChange={(e) => handleChange(e.target.value as Locale)} disabled={isPending} className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-50" aria-busy={isPending}>
        {locales.map((cur) => (<option key={cur} value={cur}>{localeNames[cur]}</option>))}
      </select>
    </label>
  );
}
export function LocaleSwitcherInline({ className }: LocaleSwitcherProps): React.JSX.Element {
  const { locale, setLocale } = useI18n();
  const [isPending, startTransition] = React.useTransition();
  function handleChange(nextLocale: Locale): void { if (nextLocale === locale) return; startTransition(() => setLocale(nextLocale)); }
  return (
    <div className={className} role="group" aria-label="Language">
      {locales.map((cur) => (<button key={cur} type="button" onClick={() => handleChange(cur)} disabled={isPending || cur === locale} aria-current={cur === locale ? "true" : undefined} aria-label={localeNames[cur]} className={cur === locale ? "h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground" : "h-8 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground hover:bg-accent"}>{cur.toUpperCase()}</button>))}
    </div>
  );
}
`,
  );
}
