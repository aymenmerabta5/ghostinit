// @allow-long 340: two-router matrix covers settled identity states, owner retry, navigation lifetimes, and public-route admission
import { describe, expect, test } from "bun:test";
import {
  headerActionsContent,
  workspaceShellFiles,
} from "../../src/templates/apps/fragments/header/index.js";
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
    "PanelLeft",
  ].map((name) => [name, name]),
);
const account = { name: "Current owner", email: "current@example.test", role: "user" };
const authenticated = (admin = false) => ({
  status: "authenticated",
  user: { ...account, role: admin ? "admin" : "user" },
});
const publicPaths = [
  "/",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/2fa",
  "/custom-page",
  "/workspace",
  "/two-factor",
  "/billing/cancel",
  "/billing/success",
  "/billing/paddle-checkout",
];

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
  return (name: string) =>
    output.find(({ path }) => path.endsWith(`/${name}.tsx`) || path.endsWith(`/${name}.ts`))!
      .content;
}

function navigation(read: (name: string) => string) {
  return generatedFormHarness(
    read("workspace-navigation"),
    ["WorkspaceNavigation", "workspaceSection"],
    { ...icons, Link: "Link", WorkspaceIdentityStatus: "IdentityStatus" },
  );
}

describe("workspace shell identity and navigation", () => {
  for (const router of ["next", "tanstack"] as const) {
    test(`${router} keeps capability links and private roles scoped to the current identity`, () => {
      const nav = navigation(files(router));
      const destinations = (identity: unknown) =>
        elements(nav.render("WorkspaceNavigation", { pathname: "/dashboard", identity }))
          .filter((element) => element.type === "Link")
          .map((element) => element.props.href ?? element.props.to);
      expect(destinations(authenticated())).toEqual([
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
      expect(destinations(authenticated(true))).toContain(
        router === "next" ? "/admin/users" : "/admin",
      );
      for (const identity of [
        { status: "pending" },
        { status: "anonymous" },
        { status: "error", retry() {} },
      ])
        expect(destinations(identity)).toEqual([]);
      expect(nav.module.workspaceSection!("/settings/workspace")).toBe("settings");
      expect(nav.module.workspaceSection!("/admin/users/create")).toBe("admin");
      expect(nav.module.workspaceSection!("/billing")).toBe("billing");
      expect(nav.module.workspaceSection!("/billing/")).toBe("billing");
      for (const path of publicPaths) {
        expect(nav.module.workspaceSection!(path), path).toBeUndefined();
        expect(nav.module.workspaceSection!(`${path}/`), path).toBeUndefined();
      }
      const active = elements(
        nav.render("WorkspaceNavigation", {
          pathname: "/admin/users/create",
          identity: authenticated(true),
        }),
      ).filter((element) => element.props["aria-current"] === "page");
      expect(active).toHaveLength(1);
      expect(textContent(active[0]).trim()).toBe("admin");
      const limited = navigation(files(router, false));
      const links = elements(
        limited.render("WorkspaceNavigation", {
          pathname: "/dashboard",
          identity: authenticated(true),
        }),
      ).filter((element) => element.type === "Link");
      expect(links.map((element) => element.props.href ?? element.props.to)).toEqual([
        "/dashboard",
        "/settings",
      ]);
    });

    test(`${router} distinguishes settled states from pending and uses the owner's retry`, () => {
      const read = files(router);
      const state = generatedFormHarness(read("workspace-identity"), ["resolveWorkspaceIdentity"]);
      const status = generatedFormHarness(read("workspace-identity-status"), [
        "WorkspaceIdentityStatus",
      ]);
      const actions = generatedFormHarness(
        headerActionsContent(router, true, true),
        ["HeaderActions"],
        {
          Link: "Link",
          HeaderUserMenu: "UserMenu",
          ThemeToggle: "ThemeToggle",
          LocaleSwitcher: "LocaleSwitcher",
          NotificationInboxBell: "NotificationBell",
        },
      );
      let retries = 0;
      const retry = () => {
        retries++;
      };
      const resolve = (pending: boolean, error: unknown, user: unknown = account) =>
        state.module.resolveWorkspaceIdentity!({ pending, error, user, retry });
      const pending = resolve(true, new Error("stale error"));
      expect(pending).toEqual({ status: "pending" });
      const pendingTree = status.render("WorkspaceIdentityStatus", { identity: pending });
      expect(elements(pendingTree).filter((node) => node.type === "Skeleton")).toHaveLength(3);
      expect(elements(pendingTree)[0]?.props).toMatchObject({
        "aria-busy": true,
        "aria-label": "accountLoading",
      });
      const anonymous = resolve(false, null, null);
      expect(anonymous).toEqual({ status: "anonymous" });
      const anonymousTree = status.render("WorkspaceIdentityStatus", { identity: anonymous });
      expect(textContent(anonymousTree)).toContain("notSignedIn");
      expect(elements(anonymousTree).some((node) => node.type === "Skeleton")).toBe(false);
      const failure = resolve(false, new Error("private failure"));
      expect(failure).toEqual({ status: "error", retry });
      const failedTree = status.render("WorkspaceIdentityStatus", { identity: failure });
      expect(textContent(failedTree)).toContain("accountUnavailable");
      expect(textContent(failedTree)).not.toMatch(/notSignedIn|private failure|Current owner/);
      expect(elements(failedTree).some((node) => node.type === "Skeleton")).toBe(false);
      (elements(failedTree).find((node) => node.type === "Button")!.props.onClick as () => void)();
      expect(retries).toBe(1);
      for (const identity of [pending, anonymous, failure, authenticated()]) {
        const tree = actions.render("HeaderActions", { identity });
        const nodes = elements(tree);
        const signedIn = (identity as { status: string }).status === "authenticated";
        expect(nodes.some((node) => node.type === "UserMenu")).toBe(signedIn);
        expect(nodes.some((node) => node.type === "NotificationBell")).toBe(signedIn);
        if (identity === failure) {
          expect(textContent(tree)).toContain("accountUnavailable");
          expect(textContent(tree)).not.toMatch(/signIn|signUp/);
          (
            nodes.find((node) => node.props["aria-label"] === "retryAccount")!.props
              .onClick as () => void
          )();
        }
      }
      expect(retries).toBe(2);
    });

    test(`${router} passes the same discriminated state to desktop and mobile navigation`, () => {
      const read = files(router);
      const sidebar = generatedFormHarness(read("workspace-sidebar"), ["WorkspaceSidebar"], {
        HeaderBrand: "HeaderBrand",
        WorkspaceNavigation: "Navigation",
      });
      const mobile = generatedFormHarness(
        read("workspace-navigation-trigger"),
        ["WorkspaceNavigationTrigger"],
        {
          ...icons,
          BrandWordmark: "BrandWordmark",
          WorkspaceNavigation: "Navigation",
          Sheet: "Sheet",
          SheetTitle: "SheetTitle",
          SheetContent: "SheetContent",
          SheetTrigger: "SheetTrigger",
        },
      );
      for (const identity of [
        { status: "pending" },
        { status: "anonymous" },
        { status: "error", retry() {} },
        authenticated(),
      ]) {
        for (const [harness, name] of [
          [sidebar, "WorkspaceSidebar"],
          [mobile, "WorkspaceNavigationTrigger"],
        ] as const) {
          const tree = harness.render(name, { pathname: "/dashboard", identity });
          const nav = elements(tree).find((node) => node.type === "Navigation")!;
          expect(nav.props.identity).toBe(identity);
          expect(nav.props).not.toHaveProperty("pending");
          if (identity.status === "anonymous" || identity.status === "error")
            expect(elements(tree).some((node) => node.type === "Skeleton")).toBe(false);
        }
      }
      const props = { pathname: "/dashboard", identity: authenticated() };
      let tree = mobile.render("WorkspaceNavigationTrigger", props);
      (
        elements(tree).find((node) => node.type === "Sheet")!.props.onOpenChange as (
          open: boolean,
        ) => void
      )(true);
      tree = mobile.render("WorkspaceNavigationTrigger", props);
      expect(elements(tree).find((node) => node.type === "Sheet")!.props.open).toBe(true);
      (elements(tree).find((node) => node.type === "Navigation")!.props.onNavigate as () => void)();
      tree = mobile.render("WorkspaceNavigationTrigger", props);
      expect(elements(tree).find((node) => node.type === "Sheet")!.props.open).toBe(false);
      expect(read("workspace-navigation-trigger")).toContain("[pathname, owner]");
    });

    test(`${router} uses canonical identity without restoring stale provider roles or styling public billing as private`, () => {
      const read = files(router);
      const oldUser = { name: "Previous owner", email: "old@example.test", role: "admin" };
      let canonicalRetries = 0;
      let providerRetries = 0;
      const session = {
        user: oldUser as typeof oldUser | null,
        isPending: false,
        error: null as Error | null,
        refetch: () => {
          providerRetries++;
        },
      };
      const canonical = {
        hasCanonicalApi: true,
        currentRequest: { user: account as typeof account | null },
        isPending: false,
        error: null as Error | null,
        retry: () => {
          canonicalRetries++;
        },
      };
      let context: typeof canonical | null = canonical;
      const state = generatedFormHarness(read("workspace-identity"), ["resolveWorkspaceIdentity"]);
      const nav = navigation(read);
      let pathname = "/dashboard";
      const harness = generatedFormHarness(read("app-shell"), ["AppShell"], {
        useAuth: () => session,
        useQueryAuthSession: () => context,
        usePathname: () => pathname,
        useRouterState: () => pathname,
        workspaceSection: nav.module.workspaceSection,
        resolveWorkspaceIdentity: state.module.resolveWorkspaceIdentity,
        Header: "Header",
        HeaderActions: "HeaderActions",
        WorkspaceSidebar: "WorkspaceSidebar",
        WorkspaceNavigationTrigger: "WorkspaceNavigationTrigger",
      });
      const rendered = () => elements(harness.render("AppShell", { children: "page-content" }));
      const identity = () =>
        rendered().find((node) => node.type === "HeaderActions")!.props.identity;
      expect(identity()).toEqual({ status: "authenticated", user: account });
      canonical.isPending = true;
      expect(identity()).toEqual({ status: "pending" });
      expect(rendered().some((node) => node.type === "WorkspaceSidebar")).toBe(true);
      canonical.isPending = false;
      canonical.error = new Error("private lookup failure");
      expect(identity()).toMatchObject({ status: "error" });
      (identity() as { retry(): void }).retry();
      expect(canonicalRetries).toBe(1);
      expect(providerRetries).toBe(0);
      canonical.error = null;
      canonical.currentRequest.user = null;
      expect(identity()).toEqual({ status: "anonymous" });
      canonical.hasCanonicalApi = false;
      expect(identity()).toEqual({ status: "authenticated", user: oldUser });
      context = null;
      session.error = new Error("provider detail");
      expect(identity()).toMatchObject({ status: "error" });
      (identity() as { retry(): void }).retry();
      expect(providerRetries).toBe(1);
      for (const status of ["pending", "authenticated", "anonymous", "error"]) {
        session.isPending = status === "pending";
        session.error = status === "error" ? new Error("failure") : null;
        session.user = status === "anonymous" ? null : oldUser;
        for (const publicPath of publicPaths.flatMap((path) => [path, `${path}/`])) {
          pathname = publicPath;
          expect(
            rendered().some((node) => node.type === "WorkspaceSidebar"),
            `${status}/${pathname}`,
          ).toBe(false);
          expect(rendered().find((node) => node.type === "Header")!.props).toMatchObject({
            workspace: false,
            navigation: undefined,
          });
        }
      }
      expect(read("app-shell")).not.toMatch(/\bfetch\(|useQuery\(|orpcClient|api\.users/);
    });
  }
});
