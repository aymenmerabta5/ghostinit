/**
 * Header shared – getInitials + shared structure constants
 */
export type RouterType = "next" | "tanstack";

export const getInitialsFunction = `function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\\s+/);
    if (parts.length >= 2) {
      return \`\${parts[0][0]}\${parts[parts.length - 1][0]}\`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "U";
}`;

export function getInitialsTanstackVariant(): string {
  return `function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\\s+/)
    if (parts.length >= 2) {
      return \`\${parts[0][0]}\${parts[parts.length - 1][0]}\`.toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }
  if (email) return email.slice(0, 2).toUpperCase()
  return 'U'
}`;
}

export const sharedHeaderStructure = {
  shellClass:
    "sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60",
  innerClass: "mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-6 md:px-8",
  logo: `<span className="text-sm font-semibold tracking-tight">GhostInit</span>`,
  badge: `<Badge variant="secondary" className="hidden sm:inline-flex">modular monolith</Badge>`,
  navItems: [
    { label: "Dashboard", href: "/dashboard", to: "/dashboard" },
    { label: "Billing", href: "/billing", to: "/billing" },
    { label: "Settings", href: "/settings", to: "/settings" },
    { label: "Admin", href: "/admin/users", to: "/admin", adminOnly: true },
  ],
};
