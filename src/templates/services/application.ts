// @allow-long 700: request facade renderer keeps its public API and actor-bound delegation auditable
import type { ProjectMode } from "../../lib/addons.js";
import { applicationRateLimitContent } from "../api/rate-limit.js";
import { file, type TemplateFile } from "../shared.js";

export interface RequestApplicationSelection {
  readonly admin: boolean;
  readonly billing: boolean;
  readonly featureFlags?: boolean;
  readonly identity: boolean;
  readonly messaging?: boolean;
  readonly notifications: boolean;
}

function serviceRoot(mode: ProjectMode): string {
  return mode === "monorepo" ? "packages/services/src" : "src/server/services";
}

function stableServicesModule(mode: ProjectMode): string {
  return mode === "monorepo" ? "@repo/services" : "@/server/services";
}

function errorsContent(): string {
  return `import "server-only";

export type RequestApplicationErrorCode =
  | "APPLICATION_UNAUTHENTICATED"
  | "APPLICATION_ACCOUNT_SUSPENDED"
  | "APPLICATION_EMAIL_NOT_VERIFIED"
  | "APPLICATION_ADMIN_REQUIRED"
  | "APPLICATION_CAPABILITY_UNAVAILABLE"
  | "APPLICATION_BAD_REQUEST"
  | "APPLICATION_NOT_FOUND"
  | "APPLICATION_NOT_IMPLEMENTED"
  | "APPLICATION_CONFLICT"
  | "APPLICATION_RATE_LIMITED"
  | "APPLICATION_RATE_LIMIT_UNAVAILABLE"
  | "APPLICATION_INTERNAL_ERROR";

export class RequestApplicationError extends Error {
  readonly code: RequestApplicationErrorCode;
  constructor(code: RequestApplicationErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RequestApplicationError";
    this.code = code;
  }
}
`;
}

function typesContent(): string {
  return `import "server-only";

export interface RequestPrincipal {
  readonly userId: string;
  readonly identityUserId: string;
  readonly sessionId: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string | null;
  readonly role: string | null;
  readonly banned: boolean;
  readonly authenticatedAt: Date;
  readonly activeOrganizationId: string | null;
  readonly activeTeamId: string | null;
}

export interface CurrentUserDto {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: string | null;
  readonly banned: boolean;
}

export interface CurrentRequestDto {
  readonly user: CurrentUserDto | null;
  readonly sessionId: string | null;
  readonly activeOrganizationId: string | null;
  readonly activeTeamId: string | null;
}

export interface ConversationDto {
  readonly id: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PublicRecord = Readonly<Record<string, unknown>>;
export interface BillingSnapshotDto {
  readonly subscriptions: readonly PublicRecord[];
  readonly invoices: readonly PublicRecord[];
  readonly usageEvents: readonly PublicRecord[];
  readonly licenseKeys: readonly PublicRecord[];
}

export interface BillingCheckoutInput {
  readonly provider: "stripe" | "chargily" | "paddle" | "polar";
  readonly planId: "pro";
  readonly successUrl: string;
  readonly failureUrl?: string;
  readonly cancelUrl?: string;
  readonly quantity?: number;
  readonly requestKey: string;
}

export interface BillingCheckoutDto {
  readonly id: string;
  readonly url: string;
  readonly provider: "stripe" | "chargily" | "paddle" | "polar";
  readonly status: string;
}

export interface BillingPortalInput {
  readonly provider: "stripe" | "chargily" | "paddle" | "polar";
  readonly returnUrl: string;
}

export interface BillingPaymentLinkInput {
  readonly provider: "stripe" | "chargily" | "paddle" | "polar";
  readonly name: string;
  readonly items: readonly { readonly price: string; readonly quantity: number }[];
  readonly afterCompletionMessage?: string;
}
`;
}

function authenticatedFeatureFlagContent(mode: ProjectMode): string {
  const serviceImport = mode === "monorepo" ? "@repo/services" : "@/server/services";
  return `import "server-only";
import { featureFlagPostHog, featureFlags } from "${serviceImport}";

export interface AuthenticatedFeatureFlagUser {
  readonly id: string;
  readonly email: string;
  readonly role: string | null;
  readonly banned: boolean;
}

function timeoutMs(): number {
  const value = Number(process.env.FEATURE_FLAG_TIMEOUT_MS ?? "2500");
  if (!Number.isInteger(value) || value < 100 || value > 30_000) {
    throw new featureFlags.FeatureFlagError(
      "FEATURE_FLAG_PROVIDER_UNAVAILABLE",
      "FEATURE_FLAG_TIMEOUT_MS is outside safe bounds",
    );
  }
  return value;
}

export async function evaluateAuthenticatedFeatureFlag(
  user: AuthenticatedFeatureFlagUser,
  key: string,
) {
  if (user.banned) {
    throw new featureFlags.FeatureFlagError(
      "FEATURE_FLAG_SUBJECT_REQUIRED",
      "An active user is required",
    );
  }
  const subject = featureFlagPostHog.createAuthenticatedFeatureFlagSubject(user.id, {
    email: user.email,
    ...(user.role ? { role: user.role } : {}),
  });
  const provider = featureFlagPostHog.createPostHogFeatureFlagAdapter({
    apiKey: process.env.POSTHOG_API_KEY ?? "",
    host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    timeoutMs: timeoutMs(),
  });
  const value = await featureFlags.createFeatureFlagService({ provider }).evaluate(subject, key);
  return { ...value, evaluatedAt: value.evaluatedAt.toISOString() };
}
`;
}

function facadeContent(mode: ProjectMode, selection: RequestApplicationSelection): string {
  const capabilityNamespaces = [
    selection.admin ? "admin as adminCapability" : "",
    selection.identity ? "identity as identityCapability" : "",
    selection.notifications ? "notifications as notificationCapability" : "",
  ].filter(Boolean);
  const capabilityImport =
    capabilityNamespaces.length > 0
      ? `import type { ${capabilityNamespaces.join(", ")} } from "${stableServicesModule(mode)}";`
      : "";
  const adminImport = selection.admin
    ? `type AdminActor = adminCapability.AdminActor;
type AdminService = adminCapability.AdminService;`
    : "";
  const identityImport = selection.identity
    ? `type IdentityActor = identityCapability.IdentityActor;
type IdentityService = identityCapability.IdentityService;
type IdentitySession = identityCapability.IdentitySession;
type Organization = identityCapability.Organization;
type OrganizationInvitation = identityCapability.OrganizationInvitation;
type OrganizationMembership = identityCapability.OrganizationMembership;
type OrganizationTeam = identityCapability.OrganizationTeam;
type TeamMembership = identityCapability.TeamMembership;`
    : "";
  const notificationImport = selection.notifications
    ? `type NotificationActor = notificationCapability.NotificationActor;
type NotificationDeviceRegistration = notificationCapability.NotificationDeviceRegistration;
type NotificationRecord = notificationCapability.NotificationRecord;
type NotificationService = notificationCapability.NotificationService;`
    : "";
  const dependencyFields = [
    selection.admin ? "  readonly admin: AdminService;" : "",
    selection.identity ? "  readonly identity: IdentityService;" : "",
    selection.billing ? "  readonly billing: BillingApplicationPort;" : "",
    selection.messaging ? "  readonly messaging: MessagingApplicationPort;" : "",
    selection.notifications ? "  readonly notifications: NotificationService;" : "",
  ]
    .filter(Boolean)
    .join("\n");
  const adminActor = selection.admin
    ? `
function adminActor(principal: RequestPrincipal): AdminActor {
  return {
    id: principal.identityUserId,
    role: principal.role === "admin" || principal.role === "superAdmin" ? "admin" : "user",
    banned: principal.banned,
  };
}
`
    : "";
  const identityActor = selection.identity
    ? `
function identityActor(principal: RequestPrincipal): IdentityActor {
  return {
    userId: principal.userId,
    sessionId: principal.sessionId,
    email: principal.email,
    emailVerified: principal.emailVerified,
    authenticatedAt: principal.authenticatedAt,
    activeOrganizationId: principal.activeOrganizationId,
    activeTeamId: principal.activeTeamId,
  };
}
`
    : "";
  const notificationActor = selection.notifications
    ? `
function notificationActor(principal: RequestPrincipal): NotificationActor {
  return { userId: principal.userId };
}
`
    : "";
  const dtoHelpers = selection.billing
    ? `
function publicValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(publicValue);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (key === "userId" || key === "pushToken" || key === "tokenFingerprint") continue;
    result[key === "_id" && !("id" in source) ? "id" : key] = publicValue(entry);
  }
  return result;
}

function publicRecord(value: unknown): Readonly<Record<string, unknown>> {
  const result = publicValue(value);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new RequestApplicationError("APPLICATION_INTERNAL_ERROR", "Application data is invalid");
  }
  return result as Readonly<Record<string, unknown>>;
}
`
    : "";
  const identityDtoHelpers = selection.identity
    ? `
function toIdentitySessionDto(value: IdentitySession) {
  return { ...value, createdAt: value.createdAt.toISOString(), authenticatedAt: value.authenticatedAt.toISOString(), expiresAt: value.expiresAt.toISOString(), revokedAt: value.revokedAt?.toISOString() ?? null, activeOrganizationId: value.activeOrganizationId ?? null, activeTeamId: value.activeTeamId ?? null };
}
function toOrganizationDto(value: Organization) { return { ...value, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString() }; }
function toOrganizationMembershipDto(value: OrganizationMembership) { return { ...value, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString() }; }
function toOrganizationInvitationDto(value: OrganizationInvitation) { return { ...value, expiresAt: value.expiresAt.toISOString(), createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString() }; }
function toOrganizationTeamDto(value: OrganizationTeam) { return { ...value, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString() }; }
function toTeamMembershipDto(value: TeamMembership) { return { ...value, createdAt: value.createdAt.toISOString() }; }
`
    : "";
  const notificationDtoHelpers = selection.notifications
    ? `
function toNotificationDto(value: NotificationRecord) { return { id: value.id, kind: value.kind, title: value.title, body: value.body, href: value.href, data: value.data, createdAt: value.createdAt.toISOString(), readAt: value.readAt?.toISOString() ?? null }; }
function toNotificationDeviceDto(value: NotificationDeviceRegistration) { return { id: value.id, platform: value.platform, createdAt: value.createdAt.toISOString(), lastSeenAt: value.lastSeenAt.toISOString(), disabledAt: value.disabledAt?.toISOString() ?? null }; }
`
    : "";

  const adminFacade = selection.admin
    ? `
    admin: {
      listUsers: async (input: Parameters<AdminService["listUsers"]>[1]) => {
        const principal = requireAdminPrincipal(requireActivePrincipal(dependencies.principal));
        await dependencies.rateLimit("admin:list:" + principal.userId, 20, 60_000);
        return await dependencies.admin.listUsers(adminActor(principal), input);
      },
      createUser: async (input: Parameters<AdminService["createUser"]>[1]) => {
        const principal = requireAdminPrincipal(requireActivePrincipal(dependencies.principal));
        await dependencies.rateLimit("admin:create:" + principal.userId, 20, 60_000);
        return await dependencies.admin.createUser(adminActor(principal), input);
      },
      changeRole: async (input: { userId: string; role: "user" | "admin" }) => {
        const principal = requireAdminPrincipal(requireActivePrincipal(dependencies.principal));
        await dependencies.rateLimit("admin:role:" + principal.userId, 20, 60_000);
        return await dependencies.admin.changeRole(adminActor(principal), input.userId, input.role);
      },
      setBanned: async (input: { userId: string; banned: boolean; reason?: string }) => {
        const principal = requireAdminPrincipal(requireActivePrincipal(dependencies.principal));
        await dependencies.rateLimit("admin:ban:" + principal.userId, 20, 60_000);
        return await dependencies.admin.setBanned(adminActor(principal), input.userId, input.banned, input.reason);
      },
    },`
    : "";
  const identityFacade = selection.identity
    ? `
    identity: {
      workspace: {
        snapshot: async () => {
          const principal = requireActivePrincipal(dependencies.principal);
          await dependencies.rateLimit("identity:workspace:" + principal.userId, 60, 60_000);
          const actor = identityActor(principal);
          const organizations = (await dependencies.identity.organizations.list(actor)).map(toOrganizationDto);
          const organizationId =
            organizations.some((organization) => organization.id === principal.activeOrganizationId)
              ? principal.activeOrganizationId
              : organizations[0]?.id ?? null;
          if (!organizationId) {
            return { organizations, organizationId: null, teams: [], members: [], invitations: [], teamId: null, teamMembers: [] };
          }
          const canReadInvitations = await dependencies.identity.organizations.hasPermission(
            actor,
            organizationId,
            "invitation:read",
          );
          const [teams, members, invitations] = await Promise.all([
            dependencies.identity.teams.list(actor, organizationId).then((values) => values.map(toOrganizationTeamDto)),
            dependencies.identity.organizations.listMembers(actor, organizationId).then((values) => values.map(toOrganizationMembershipDto)),
            canReadInvitations
              ? dependencies.identity.invitations.list(actor, organizationId).then((values) => values.map(toOrganizationInvitationDto))
              : Promise.resolve([]),
          ]);
          const teamId =
            teams.some((team) => team.id === principal.activeTeamId)
              ? principal.activeTeamId
              : teams[0]?.id ?? null;
          const teamMembers = teamId
            ? (await dependencies.identity.teams.listMembers(actor, organizationId, teamId)).map(toTeamMembershipDto)
            : [];
          return { organizations, organizationId, teams, members, invitations, teamId, teamMembers };
        },
      },
      sessions: {
        list: async () => (await dependencies.identity.sessions.list(identityActor(requireActivePrincipal(dependencies.principal)))).map(toIdentitySessionDto),
        revoke: async (input: { sessionId: string }) => {
          const result = await dependencies.identity.sessions.revoke(identityActor(requireActivePrincipal(dependencies.principal)), input.sessionId);
          return { ...result, value: toIdentitySessionDto(result.value) };
        },
        revokeOthers: async () => await dependencies.identity.sessions.revokeOthers(identityActor(requireActivePrincipal(dependencies.principal))),
      },
      organizations: {
        list: async () => (await dependencies.identity.organizations.list(identityActor(requireActivePrincipal(dependencies.principal)))).map(toOrganizationDto),
        create: async (input: { name: string; slug: string }) => {
          const result = await dependencies.identity.organizations.create(identityActor(requireActivePrincipal(dependencies.principal)), input);
          return { ...result, organization: toOrganizationDto(result.organization) };
        },
        setActive: async (input: { organizationId: string }) => await dependencies.identity.organizations.setActive(identityActor(requireActivePrincipal(dependencies.principal)), input.organizationId),
        listMembers: async (input: { organizationId: string }) => (await dependencies.identity.organizations.listMembers(identityActor(requireActivePrincipal(dependencies.principal)), input.organizationId)).map(toOrganizationMembershipDto),
        changeMemberRole: async (input: Parameters<IdentityService["organizations"]["changeMemberRole"]>[1]) => {
          const result = await dependencies.identity.organizations.changeMemberRole(identityActor(requireActivePrincipal(dependencies.principal)), input);
          return { ...result, value: toOrganizationMembershipDto(result.value) };
        },
        removeMember: async (input: Parameters<IdentityService["organizations"]["removeMember"]>[1]) => await dependencies.identity.organizations.removeMember(identityActor(requireActivePrincipal(dependencies.principal)), input),
        hasPermission: async (input: { organizationId: string; permission: Parameters<IdentityService["organizations"]["hasPermission"]>[2] }) => ({ allowed: await dependencies.identity.organizations.hasPermission(identityActor(requireActivePrincipal(dependencies.principal)), input.organizationId, input.permission) }),
      },
      invitations: {
        list: async (input: { organizationId: string }) => (await dependencies.identity.invitations.list(identityActor(requireActivePrincipal(dependencies.principal)), input.organizationId)).map(toOrganizationInvitationDto),
        create: async (input: Parameters<IdentityService["invitations"]["create"]>[1]) => {
          const result = await dependencies.identity.invitations.create(identityActor(requireActivePrincipal(dependencies.principal)), input);
          return { ...result, invitation: toOrganizationInvitationDto(result.invitation) };
        },
        cancel: async (input: { invitationId: string }) => {
          const result = await dependencies.identity.invitations.cancel(identityActor(requireActivePrincipal(dependencies.principal)), input.invitationId);
          return { ...result, value: toOrganizationInvitationDto(result.value) };
        },
        accept: async (input: { invitationId: string }) => {
          const result = await dependencies.identity.invitations.accept(identityActor(requireActivePrincipal(dependencies.principal)), input.invitationId);
          return { ...result, value: toOrganizationMembershipDto(result.value) };
        },
      },
      teams: {
        list: async (input: { organizationId: string }) => (await dependencies.identity.teams.list(identityActor(requireActivePrincipal(dependencies.principal)), input.organizationId)).map(toOrganizationTeamDto),
        create: async (input: { organizationId: string; name: string }) => {
          const result = await dependencies.identity.teams.create(identityActor(requireActivePrincipal(dependencies.principal)), input.organizationId, input.name);
          return { ...result, team: toOrganizationTeamDto(result.team) };
        },
        setActive: async (input: { organizationId: string; teamId: string }) => await dependencies.identity.teams.setActive(identityActor(requireActivePrincipal(dependencies.principal)), input.organizationId, input.teamId),
        listMembers: async (input: { organizationId: string; teamId: string }) => (await dependencies.identity.teams.listMembers(identityActor(requireActivePrincipal(dependencies.principal)), input.organizationId, input.teamId)).map(toTeamMembershipDto),
        addMember: async (input: Parameters<IdentityService["teams"]["addMember"]>[1]) => {
          const result = await dependencies.identity.teams.addMember(identityActor(requireActivePrincipal(dependencies.principal)), input);
          return { ...result, value: toTeamMembershipDto(result.value) };
        },
        removeMember: async (input: Parameters<IdentityService["teams"]["removeMember"]>[1]) => await dependencies.identity.teams.removeMember(identityActor(requireActivePrincipal(dependencies.principal)), input),
      },
    },`
    : "";
  const billingFacade = selection.billing
    ? `
    billing: {
      subscriptions: async () => {
        const principal = requireVerifiedPrincipal(dependencies.principal);
        await dependencies.rateLimit("billing:subscriptions:" + principal.userId, 60, 60_000);
        const snapshot = await dependencies.billing.subscriptions(principal.userId);
        return {
          subscriptions: snapshot.subscriptions.map(publicRecord),
          invoices: snapshot.invoices.map(publicRecord),
          usageEvents: snapshot.usageEvents.map(publicRecord),
          licenseKeys: snapshot.licenseKeys.map(publicRecord),
        };
      },
      createCheckout: async (input: BillingCheckoutInput) => {
        const principal = requireVerifiedPrincipal(dependencies.principal);
        await dependencies.rateLimit("billing:checkout:" + principal.userId, 10, 60_000);
        return await dependencies.billing.createCheckout(principal, input);
      },
      createPortalSession: async (input: BillingPortalInput) => {
        const principal = requireVerifiedPrincipal(dependencies.principal);
        await dependencies.rateLimit("billing:portal:" + principal.userId, 20, 60_000);
        return await dependencies.billing.createPortalSession(principal, input);
      },
      createPaymentLink: async (input: BillingPaymentLinkInput) => {
        const principal = requireAdminPrincipal(requireVerifiedPrincipal(dependencies.principal));
        await dependencies.rateLimit("billing:payment-link:" + principal.userId, 10, 60_000);
        return await dependencies.billing.createPaymentLink(principal, input);
      },
    },`
    : "";
  const notificationsFacade = selection.notifications
    ? `
    notifications: {
      createSelf: async (input: Parameters<NotificationService["publish"]>[1]) => toNotificationDto(await dependencies.notifications.publish(notificationActor(requireActivePrincipal(dependencies.principal)), input)),
      listInbox: async (input: Parameters<NotificationService["listInbox"]>[1]) => {
        const page = await dependencies.notifications.listInbox(notificationActor(requireActivePrincipal(dependencies.principal)), input);
        return { ...page, items: page.items.map(toNotificationDto) };
      },
      markRead: async (input: { notificationId: string }) => {
        const result = await dependencies.notifications.markRead(notificationActor(requireActivePrincipal(dependencies.principal)), input.notificationId);
        return { ...result, value: toNotificationDto(result.value) };
      },
      registerDevice: async (input: Parameters<NotificationService["registerDevice"]>[1]) => {
        const result = await dependencies.notifications.registerDevice(notificationActor(requireActivePrincipal(dependencies.principal)), input);
        return { ...result, value: toNotificationDeviceDto(result.value) };
      },
    },`
    : "";
  const messagingFacade = selection.messaging
    ? `
    messaging: {
      listConversations: async () => {
        const principal = requireActivePrincipal(dependencies.principal);
        return {
          conversations: await dependencies.messaging.listConversations(principal.userId),
        };
      },
    },`
    : "";
  const billingPort = selection.billing
    ? `
export interface BillingApplicationPort {
  subscriptions(userId: string): Promise<{
    subscriptions: readonly unknown[];
    invoices: readonly unknown[];
    usageEvents: readonly unknown[];
    licenseKeys: readonly unknown[]
  }>;
  createCheckout(principal: RequestPrincipal, input: BillingCheckoutInput): Promise<BillingCheckoutDto>;
  createPortalSession(principal: RequestPrincipal, input: BillingPortalInput): Promise<{ url: string }>;
  createPaymentLink(principal: RequestPrincipal, input: BillingPaymentLinkInput): Promise<{ id: string; url: string }>;
}
`
    : "";
  const messagingPort = selection.messaging
    ? `
export interface MessagingApplicationPort {
  listConversations(userId: string): Promise<ConversationDto[]>;
}
`
    : "";
  const verifiedPrincipal = selection.billing
    ? `
function requireVerifiedPrincipal(principal: RequestPrincipal | null): RequestPrincipal {
  const active = requireActivePrincipal(principal);
  if (!active.emailVerified) throw new RequestApplicationError("APPLICATION_EMAIL_NOT_VERIFIED", "Verified email required");
  return active;
}
`
    : "";

  return `import "server-only";
${capabilityImport}
${adminImport}
${identityImport}
${notificationImport}
import { RequestApplicationError } from "./errors.js";
import type {
${selection.billing ? "  BillingCheckoutDto,\n  BillingCheckoutInput,\n  BillingPaymentLinkInput,\n  BillingPortalInput,\n" : ""}
${selection.messaging ? "  ConversationDto,\n" : ""}
  CurrentRequestDto,
  RequestPrincipal,
} from "./types.js";
${billingPort}
${messagingPort}

export interface RequestApplicationDependencies {
  readonly principal: RequestPrincipal | null;
  readonly rateLimit: (key: string, limit: number, windowMs: number) => Promise<void>;
${dependencyFields}
}

function requireActivePrincipal(principal: RequestPrincipal | null): RequestPrincipal {
  if (!principal) throw new RequestApplicationError("APPLICATION_UNAUTHENTICATED", "Authentication is required");
  if (principal.banned) throw new RequestApplicationError("APPLICATION_ACCOUNT_SUSPENDED", "Account suspended");
  return principal;
}
${verifiedPrincipal}

function requireAdminPrincipal(principal: RequestPrincipal): RequestPrincipal {
  if (principal.role !== "admin" && principal.role !== "superAdmin") {
    throw new RequestApplicationError("APPLICATION_ADMIN_REQUIRED", "Administrator access is required");
  }
  return principal;
}
${adminActor}${identityActor}${notificationActor}${dtoHelpers}${identityDtoHelpers}${notificationDtoHelpers}
export function createRequestApplication(dependencies: RequestApplicationDependencies) {
  return {
    principal: dependencies.principal,
    async me(): Promise<CurrentRequestDto> {
      const principal = dependencies.principal;
      return {
        user: principal ? { id: principal.userId, email: principal.email, name: principal.name, role: principal.role, banned: principal.banned } : null,
        sessionId: principal?.sessionId ?? null,
        activeOrganizationId: principal?.activeOrganizationId ?? null,
        activeTeamId: principal?.activeTeamId ?? null,
      };
    },${adminFacade}${identityFacade}${billingFacade}${messagingFacade}${notificationsFacade}
  } as const;
}

export type RequestApplication = ReturnType<typeof createRequestApplication>;
`;
}

function indexContent(selection: RequestApplicationSelection): string {
  return `export type { RequestApplication } from "./facade.js";
export { createRequestApplicationForRequest } from "./server.js";
${selection.featureFlags ? 'export { evaluateAuthenticatedFeatureFlag, type AuthenticatedFeatureFlagUser } from "./feature-flags.js";\n' : ""}export { RequestApplicationError, type RequestApplicationErrorCode } from "./errors.js";
export type { BillingCheckoutDto, BillingCheckoutInput, BillingPaymentLinkInput, BillingPortalInput, BillingSnapshotDto, ConversationDto, CurrentRequestDto, CurrentUserDto, PublicRecord } from "./types.js";
`;
}

export function requestApplicationFiles(
  mode: ProjectMode,
  selection: RequestApplicationSelection,
  serverContent: string,
): TemplateFile[] {
  const root = `${serviceRoot(mode)}/application`;
  return [
    file(`${root}/errors.ts`, errorsContent()),
    file(`${root}/types.ts`, typesContent()),
    file(`${root}/facade.ts`, facadeContent(mode, selection)),
    ...(selection.featureFlags
      ? [file(`${root}/feature-flags.ts`, authenticatedFeatureFlagContent(mode))]
      : []),
    file(`${root}/rate-limit.ts`, applicationRateLimitContent()),
    file(`${root}/server.ts`, serverContent),
    file(`${root}/index.ts`, indexContent(selection)),
  ];
}
