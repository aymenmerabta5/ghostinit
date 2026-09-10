/** Public entrypoint for the cohesive shell sign-out workflow. */
import type { RouterType } from "./shared.js";

export function signOutButtonContent(_router: RouterType): string {
  return 'export { SignOutButton } from "@/features/app-shell/sign-out-button";\n';
}
