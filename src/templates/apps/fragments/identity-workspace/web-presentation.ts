import { identityWorkspaceInvitationsCardContent } from "./web-invitations.js";
import { identityWorkspaceInvitationRowContent } from "./web-invitation-row.js";
import { identityWorkspaceMembersCardContent } from "./web-members.js";
import { identityWorkspaceOrganizationsCardContent } from "./web-organizations.js";
import { identityWorkspaceTeamsCardContent } from "./web-teams.js";

export function identityWorkspacePresentationContents(hasI18n = false) {
  return [
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
