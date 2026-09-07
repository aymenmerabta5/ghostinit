import { identityWorkspaceInvitationsCardContent } from "./web-invitations.js";
import { identityWorkspaceInvitationRowContent } from "./web-invitation-row.js";
import {
  identityWorkspaceMemberRowContent,
  identityWorkspaceMembersCardContent,
} from "./web-members.js";
import { identityWorkspaceOrganizationsCardContent } from "./web-organizations.js";
import {
  identityWorkspaceTeamMembersContent,
  identityWorkspaceTeamsCardContent,
} from "./web-teams.js";
import { identityWorkspaceMemberIdentityContent } from "./web-member-identity.js";

export function identityWorkspacePresentationContents(hasI18n = false) {
  return [
    {
      path: "components/member-identity.tsx",
      content: identityWorkspaceMemberIdentityContent(hasI18n),
    },
    { path: "components/member-row.tsx", content: identityWorkspaceMemberRowContent(hasI18n) },
    { path: "components/team-members.tsx", content: identityWorkspaceTeamMembersContent(hasI18n) },
    {
      path: "components/invitations-card.tsx",
      content: identityWorkspaceInvitationsCardContent(hasI18n),
    },
    {
      path: "components/invitation-row.tsx",
      content: identityWorkspaceInvitationRowContent(hasI18n),
    },
    {
      path: "components/members-card.tsx",
      content: identityWorkspaceMembersCardContent(hasI18n),
    },
    {
      path: "components/organizations-card.tsx",
      content: identityWorkspaceOrganizationsCardContent(hasI18n),
    },
    { path: "components/teams-card.tsx", content: identityWorkspaceTeamsCardContent(hasI18n) },
  ] as const;
}
