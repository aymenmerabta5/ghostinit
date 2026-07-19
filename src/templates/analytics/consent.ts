import type { ProjectMode } from "../../lib/addons.js";

export function sharedConsentContent(_mode: ProjectMode): string {
  return `/**
 * Consent management — GDPR-friendly opt-in/out.
 */

export type ConsentStatus = "granted" | "denied" | "pending" | "unknown";
export type ConsentCategory = "necessary" | "analytics" | "marketing" | "preferences";

export interface ConsentState {
  status: ConsentStatus;
  categories: Record<ConsentCategory, boolean>;
  timestamp?: string;
  version: number;
}

const STORAGE_KEY = "ghostinit:consent";
const COOKIE_KEY = "ghostinit_consent";
const CONSENT_VERSION = 1;

const DEFAULT_STATE: ConsentState = {
  status: "unknown",
  categories: {
    necessary: true,
    analytics: false,
    marketing: false,
    preferences: false,
  },
  version: CONSENT_VERSION,
};

function canUseStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const k = "__consent_test__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function writeCookie(name: string, value: string, days = 365): void {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = name + "=" + encodeURIComponent(value) + "; expires=" + expires + "; path=/; SameSite=Lax" + secure;
}

export function getConsentState(): ConsentState {
  if (!canUseStorage()) {
    const cookieRaw = readCookie(COOKIE_KEY);
    if (cookieRaw) {
      try {
        return JSON.parse(cookieRaw) as ConsentState;
      } catch {
        return DEFAULT_STATE;
      }
    }
    return DEFAULT_STATE;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CONSENT_VERSION) return DEFAULT_STATE;
    return parsed;
  } catch {
    return DEFAULT_STATE;
  }
}

export function hasConsent(category: ConsentCategory = "analytics"): boolean {
  const state = getConsentState();
  if (state.status === "granted") return Boolean(state.categories[category]);
  if (state.status === "denied") return false;
  return false;
}

export function isConsentRequired(): boolean {
  const state = getConsentState();
  return state.status === "unknown" || state.status === "pending";
}

export function setConsent(
  categories: Partial<Record<ConsentCategory, boolean>>,
  status: ConsentStatus = "granted",
): ConsentState {
  const prev = getConsentState();
  const next: ConsentState = {
    status,
    categories: { ...prev.categories, ...categories },
    timestamp: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
  next.categories.necessary = true;
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }
  writeCookie(COOKIE_KEY, JSON.stringify(next));
  trySyncPostHogConsent(next);
  return next;
}

export function optIn(categories?: ConsentCategory[]): ConsentState {
  if (!categories) {
    return setConsent({ analytics: true, marketing: true, preferences: true }, "granted");
  }
  const patch: Partial<Record<ConsentCategory, boolean>> = {};
  for (const c of categories) patch[c] = true;
  return setConsent(patch, "granted");
}

export function optOut(categories?: ConsentCategory[]): ConsentState {
  if (!categories) {
    return setConsent({ analytics: false, marketing: false, preferences: false }, "denied");
  }
  const patch: Partial<Record<ConsentCategory, boolean>> = {};
  for (const c of categories) patch[c] = false;
  const nextCategories = { ...getConsentState().categories, ...patch };
  const hasAnyGranted = nextCategories.analytics || nextCategories.marketing || nextCategories.preferences;
  return setConsent(patch, hasAnyGranted ? "granted" : "denied");
}

export function resetConsent(): void {
  if (canUseStorage()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
  writeCookie(COOKIE_KEY, "", -1);
}

function trySyncPostHogConsent(state: ConsentState): void {
  if (typeof window === "undefined") return;
  try {
    const w = window as any;
    const ph = w.posthog;
    if (!ph) return;
    if (state.categories.analytics) {
      ph.opt_in_capturing?.();
    } else {
      ph.opt_out_capturing?.();
    }
  } catch {}
}

export function onConsentChange(cb: (state: ConsentState) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      try {
        cb(getConsentState());
      } catch {}
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
`;
}
