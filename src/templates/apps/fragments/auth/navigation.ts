import type { RouterType } from "./imports.js";
export type { RouterType } from "./imports.js";

export function signInNavigateLogic(router: RouterType): string {
  if (router === "tanstack") {
    return `      if ('twoFactorRedirect' in result.data && (result.data as any).twoFactorRedirect) {
        void navigate({ to: '/2fa' })
        return
      }
      void navigate({ to: '/dashboard' })`;
  }
  return `      if ("twoFactorRedirect" in result.data && result.data.twoFactorRedirect) {
        router.push("/2fa");
        return;
      }
      router.push("/dashboard");`;
}
export function signUpNavigateLogic(router: RouterType): string {
  if (router === "tanstack") return `      void navigate({ to: '/dashboard' })`;
  return `      router.push("/dashboard");`;
}
export function authBackLink(router: RouterType, to: string, label: string): string {
  if (router === "tanstack")
    return `<Link to="${to}" className="text-sm text-muted-foreground hover:text-foreground">${label}</Link>`;
  return `<Link href="${to}" className="text-sm text-muted-foreground hover:text-foreground">\n          ${label}\n        </Link>`;
}
export function linkTo(
  router: RouterType,
  to: string,
  className: string,
  children: string,
): string {
  if (router === "tanstack") return `<Link to="${to}" className="${className}">${children}</Link>`;
  return `<Link href="${to}" className="${className}">${children}</Link>`;
}
