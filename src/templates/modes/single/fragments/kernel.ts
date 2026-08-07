export function singleKernelTypesContent(): string {
  return [
    "export interface BillingSubscription { id: string; provider: string; status: string; currentPeriodEnd?: string | null; priceId?: string | null; customerId?: string | null; }",
    "export interface UseBillingReturn { subscriptions: BillingSubscription[]; loading: boolean; error: string | null; refresh: () => Promise<void>; hasActiveSubscription: boolean; isLoading: boolean; }",
    "export interface AdminUser { id: string; name: string | null; email: string; role: string; banned: boolean; }",
    "export interface UseAdminUsersReturn { data: { users: AdminUser[]; total: number } | null; error: string | null; loading: boolean; refresh: () => Promise<void>; toggleBan: (userId: string, banned: boolean) => Promise<void>; setRole: (userId: string, currentRole: string) => Promise<void>; }",
    "export interface UseCopyReturn { copy: (text: string) => Promise<boolean>; copied: boolean; }",
    "",
  ].join("\n");
}
