import { describe, expect, test } from "bun:test";
import { workspaceShellFiles } from "../../src/templates/apps/fragments/header/index.js";
import { elements, generatedFormHarness, textContent } from "../helpers/generated-form-harness.js";

const icons = Object.fromEntries(
  [
    "LayoutDashboard",
    "Bot",
    "MessageSquare",
    "Bell",
    "FolderOpen",
    "Flag",
    "Workflow",
    "CreditCard",
    "FileText",
    "Settings2",
    "ShieldCheck",
  ].map((name) => [name, name]),
);

function files(router: "next" | "tanstack", all = true) {
  const output = workspaceShellFiles(router, {
    sourceRoot: "src",
    hasAuth: true,
    hasBilling: all,
    hasAdminNavigation: all,
    hasPdf: all,
    hasMessaging: all,
    navigation: { eve: all, notifications: all, storage: all, featureFlags: all, jobs: all },
  });
  return (name: string) => output.find(({ path }) => path.endsWith(`/${name}.tsx`))!.content;
}

describe("workspace shell identity and navigation", () => {
  for (const router of ["next", "tanstack"] as const) {
    test(`${router} keeps capability links and private roles scoped to the current identity`, () => {
      const read = files(router);
      const nav = generatedFormHarness(
        read("workspace-navigation"),
        ["WorkspaceNavigation", "workspaceSection"],
        { ...icons, Link: "Link" },
      );
      const destinations = (isAdmin: boolean, pending = false) =>
        elements(nav.render("WorkspaceNavigation", { pathname: "/dashboard", isAdmin, pending }))
          .filter((element) => element.type === "Link")
          .map((element) => element.props.href ?? element.props.to);
      expect(destinations(false)).toEqual([
        "/dashboard",
        ...(router === "next" ? ["/agent"] : []),
        "/messages",
        "/notifications",
        "/storage",
        "/feature-flags",
        "/jobs",
        "/billing",
        "/pdf",
        "/settings",
      ]);
      expect(destinations(true)).toContain(router === "next" ? "/admin/users" : "/admin");
      expect(destinations(true, true)).toEqual([]);
      expect(nav.module.workspaceSection!("/settings/workspace")).toBe("settings");
      expect(nav.module.workspaceSection!("/admin/users/create")).toBe("admin");
      for (const path of [
        "/",
        "/sign-in",
        "/sign-up",
        "/forgot-password",
        "/reset-password",
        "/2fa",
        "/custom-page",
      ])
        expect(nav.module.workspaceSection!(path)).toBeUndefined();
      const active = elements(
        nav.render("WorkspaceNavigation", { pathname: "/admin/users/create", isAdmin: true }),
      ).filter((element) => element.props["aria-current"] === "page");
      expect(active).toHaveLength(1);
      expect(textContent(active[0]).trim()).toBe("admin");
      const limited = generatedFormHarness(
        files(router, false)("workspace-navigation"),
        ["WorkspaceNavigation"],
        { ...icons, Link: "Link" },
      );
      const limitedLinks = elements(
        limited.render("WorkspaceNavigation", { pathname: "/dashboard", isAdmin: true }),
      ).filter((element) => element.type === "Link");
      expect(limitedLinks.map((element) => element.props.href ?? element.props.to)).toEqual([
        "/dashboard",
        "/settings",
      ]);
    });

    test(`${router} uses canonical identity without extra requests or restoring stale provider roles`, () => {
      const read = files(router);
      const oldUser = { name: "Previous owner", email: "old@example.test", role: "admin" };
      const currentUser = { name: "Current owner", email: "current@example.test", role: "user" };
      const session = { user: oldUser, isPending: false, error: null as Error | null };
      const canonical = {
        hasCanonicalApi: true,
        currentRequest: { user: currentUser as typeof currentUser | null },
        isPending: false,
        error: null as Error | null,
      };
      let pathname = "/dashboard";
      const harness = generatedFormHarness(read("app-shell"), ["AppShell"], {
        useAuth: () => session,
        useQueryAuthSession: () => canonical,
        usePathname: () => pathname,
        useRouterState: () => pathname,
        workspaceSection: (path: string) =>
          path.startsWith("/dashboard") ? "dashboard" : undefined,
        Header: "Header",
        HeaderActions: "HeaderActions",
        WorkspaceSidebar: "WorkspaceSidebar",
        WorkspaceNavigationTrigger: "WorkspaceNavigationTrigger",
      });
      const rendered = () => elements(harness.render("AppShell", { children: "page-content" }));
      const actions = () => rendered().find((element) => element.type === "HeaderActions")!.props;
      expect(actions().user).toEqual(currentUser);
      expect(actions().isAuthenticated).toBe(true);
      canonical.isPending = true;
      expect(actions()).toMatchObject({ user: null, pending: true, isAuthenticated: false });
      expect(rendered().some((element) => element.type === "WorkspaceSidebar")).toBe(true);
      canonical.isPending = false;
      canonical.error = new Error("private lookup failure");
      expect(actions().user).toBeNull();
      canonical.error = null;
      canonical.currentRequest.user = null;
      expect(actions().user).toBeNull();
      canonical.hasCanonicalApi = false;
      expect(actions().user).toEqual(oldUser);
      session.isPending = true;
      expect(actions().user).toBeNull();
      pathname = "/sign-in";
      expect(rendered().some((element) => element.type === "WorkspaceSidebar")).toBe(false);
      expect(read("app-shell")).not.toMatch(/\bfetch\(|useQuery\(|orpcClient|api\.users/);
    });
  }
});
