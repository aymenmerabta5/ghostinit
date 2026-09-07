import type { DesktopMode } from "../model.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../../fragments/native-i18n.js";

export function desktopThemeProviderContent(): string {
  return `import * as React from "react";

type Theme = "light" | "dark";

const ThemeContext = React.createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
} | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeRaw] = React.useState<Theme>("light");

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (typeof window === "undefined") return;
        const bridge = window.desktopBridge;
        const stored = await bridge.getClientSettings();
        let candidate: Theme | null = (stored?.theme as Theme | undefined) ?? null;
        if (!candidate) {
          try {
            if (typeof localStorage !== "undefined") {
              const raw = localStorage.getItem("ghostinit-theme-v1");
              if (raw) {
                try { candidate = (JSON.parse(raw) as { theme: Theme }).theme ?? null; } catch { candidate = localStorage.getItem("ghostinit-theme") as Theme | null; }
              } else {
                candidate = localStorage.getItem("ghostinit-theme") as Theme | null;
              }
            }
          } catch {}
        }
        if (candidate === "dark" || candidate === "light") {
          if (mounted) setThemeRaw(candidate);
          return;
        }
        if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
          if (mounted) setThemeRaw("dark");
        }
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    try {
      if (typeof localStorage !== "undefined") {
        // Versioned key following client-localstorage-schema: version + minimize
        localStorage.setItem("ghostinit-theme-v1", JSON.stringify({ v: 1, theme }));
        localStorage.setItem("ghostinit-theme", theme); // legacy compat
      }
      const bridge = window.desktopBridge;
      bridge
        .getClientSettings()
        .then((previous) => bridge.setClientSettings({ ...previous, theme }))
        .catch(() => bridge.setClientSettings({ theme }));
    } catch {}
  }, [theme]);

  const setTheme = React.useCallback((t: Theme) => setThemeRaw(t), []);
  const toggle = React.useCallback(() => setThemeRaw((p) => (p === "dark" ? "light" : "dark")), []);

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
`;
}

export function desktopThemeToggleContent(hasI18n = false, mode: DesktopMode = "monorepo"): string {
  const i18n = nativeI18nTemplate(hasI18n, "theme", nativeI18nImportPath("desktop", mode));
  const switchLabel = hasI18n
    ? 'theme === "dark" ? t("switchToLight") : t("switchToDark")'
    : '`Switch to ${theme === "dark" ? "light" : "dark"} mode`';
  return `import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "../lib/theme";
${i18n.importLine}

export function ThemeToggle() {
${i18n.hookLine}
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        type="button"
        size="icon"
        variant="outline"
        disabled
        aria-label={${i18n.value("toggle", "Toggle theme")}}
      >
        <span className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      onClick={toggle}
      aria-label={${switchLabel}}
      className="relative"
    >
      <Sun aria-hidden className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon aria-hidden className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">${i18n.child("toggle", "Toggle theme")}</span>
    </Button>
  );
}
`;
}
