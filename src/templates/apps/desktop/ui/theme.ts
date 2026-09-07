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

function storedTheme(value: unknown): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

function localTheme(): Theme | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem("ghostinit-theme-v1");
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && "theme" in parsed) {
          const candidate = storedTheme(parsed.theme);
          if (candidate) return candidate;
        }
      } catch {}
    }
    return storedTheme(localStorage.getItem("ghostinit-theme"));
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeRaw] = React.useState<Theme>("light");
  const [initialized, setInitialized] = React.useState(false);
  const userSelected = React.useRef(false);
  const pendingWrite = React.useRef<Promise<void>>(Promise.resolve());

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      let candidate: Theme | null = null;
      if (typeof window !== "undefined") {
        try {
          candidate = storedTheme((await window.desktopBridge.getClientSettings())?.theme);
        } catch {}
        candidate ??= localTheme();
        if (!candidate) {
          try {
            candidate = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches
              ? "dark" : "light";
          } catch {}
        }
      }
      if (!mounted) return;
      if (!userSelected.current) setThemeRaw(candidate ?? "light");
      setInitialized(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  React.useEffect(() => {
    if (!initialized || typeof window === "undefined") return;
    let current = true;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("ghostinit-theme-v1", JSON.stringify({ v: 1, theme }));
        localStorage.setItem("ghostinit-theme", theme);
      }
    } catch {}
    // Keep bridge writes ordered so an older request cannot overwrite a newer choice.
    pendingWrite.current = pendingWrite.current.then(async () => {
      if (!current) return;
      try {
        const bridge = window.desktopBridge;
        const previous = await bridge.getClientSettings();
        if (!current) return;
        await bridge.setClientSettings({ ...previous, theme });
      } catch {
        // A failed read must not replace unknown saved settings with a theme-only object.
      }
    });
    return () => { current = false; };
  }, [theme, initialized]);

  const setTheme = React.useCallback((next: Theme) => {
    userSelected.current = true;
    setThemeRaw(next);
  }, []);
  const toggle = React.useCallback(() => {
    userSelected.current = true;
    setThemeRaw((previous) => (previous === "dark" ? "light" : "dark"));
  }, []);

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
