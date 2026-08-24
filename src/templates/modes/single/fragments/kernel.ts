export function singleKernelTypesContent(): string {
  return [
    "export interface BillingSubscription { id: string; provider: string; status: string; currentPeriodEnd?: string | null; priceId?: string | null; customerId?: string | null; }",
    "export interface UseBillingReturn { subscriptions: BillingSubscription[]; loading: boolean; error: string | null; refresh: () => Promise<void>; hasActiveSubscription: boolean; isLoading: boolean; }",
    'export const USER_ROLES = ["user", "admin"] as const;',
    "export type UserRole = (typeof USER_ROLES)[number];",
    "export interface AdminUser { id: string; name: string | null; email: string; role: UserRole; banned: boolean; }",
    "export interface UseAdminUsersReturn { data: { users: AdminUser[]; total: number } | null; error: string | null; loading: boolean; refresh: () => Promise<void>; toggleBan: (userId: string, banned: boolean) => Promise<void>; setRole: (userId: string, currentRole: UserRole) => Promise<void>; }",
    'export function isUserRole(value: unknown): value is UserRole { return value === "user" || value === "admin"; }',
    "export interface UseCopyReturn { copy: (text: string) => Promise<boolean>; copied: boolean; }",
    "",
  ].join("\n");
}
