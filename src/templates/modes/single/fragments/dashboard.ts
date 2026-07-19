/**
 * Shared dashboard cards between Next and TanStack.
 */
export const dashboardCards = {
  profileTitle: "Profile",
  quickActionsTitle: "Quick actions",
  billingTitle: "Billing",
  settingsTitle: "Settings",
};

export function profileDescription(email: string, name: string | null): string {
  return `Signed in as ${email}. Name ${name ?? "not set"}.`;
}
