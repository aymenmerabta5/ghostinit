import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { capabilityClientFiles } from "../../src/templates/apps/capability-clients/index.js";
import {
  featureRoot,
  type CapabilityClientOptions,
} from "../../src/templates/apps/capability-clients/shared.js";
import { authOwnedMutationContent } from "../../src/templates/apps/fragments/auth-owned-mutation.js";
import { capabilityOperationQueryHarness } from "../helpers/capability-operation-query-harness.js";
import { queryMutationHarness } from "../helpers/query-mutation-harness.js";
import {
  deferred,
  elements,
  flush,
  generatedFormHarness,
  textContent,
} from "../helpers/generated-form-harness.js";

type Feature = "jobs" | "storage" | "feature-flags";
const operations = {
  jobs: ["enqueue", "refresh", "cancel"],
  storage: ["upload", "download", "remove"],
  "feature-flags": ["evaluate"],
} as const;
const components = {
  jobs: "JobsPage",
  storage: "StoragePage",
  "feature-flags": "FeatureFlagsPage",
};
const featureFiles = {
  jobs: {
    workflow: "use-job-workspace.ts",
    view: "components/job-workspace.tsx",
    component: "JobWorkspace",
  },
  storage: {
    workflow: "use-storage-workspace.ts",
    view: "components/storage-workspace.tsx",
    component: "StorageWorkspace",
  },
  "feature-flags": {
    workflow: "use-feature-flag-evaluation.ts",
    view: "components/feature-flag-workspace.tsx",
    component: "FeatureFlagWorkspace",
  },
} as const;
const errors: Record<string, string> = {
  enqueue: "enqueueError",
  refresh: "lookupError",
  cancel: "cancelError",
  upload: "uploadError",
  download: "downloadError",
  remove: "removeError",
  evaluate: "error",
};
const outputs: Record<string, unknown> = {
  enqueue: { run: { id: "completed-run" } },
  refresh: { id: "completed-run" },
  cancel: { run: { id: "completed-run" } },
  upload: { id: "completed-object" },
  download: { base64: btoa("completed-text") },
  remove: undefined,
  evaluate: { value: "completed-flag" },
};

function harness(options: CapabilityClientOptions, feature: Feature) {
  const target = options.apps[0]!;
  const files = capabilityClientFiles(options);
  const root = featureRoot(options.mode, target, feature);
  const read = (path: string) => {
    const file = files.find((entry) => entry.path === `${root}/${path}`);
    if (!file) throw new Error(`Missing emitted ${feature}/${path}`);
    return file.content;
  };
  const selected = featureFiles[feature];
  const source = [
    authOwnedMutationContent(),
    read("queries.ts"),
    ...(feature === "feature-flags" ? [] : [read("mutations.ts")]),
    read(selected.workflow),
    read(selected.view),
    read("page.tsx"),
  ].join("\n");
  const first = deferred<unknown>();
  const second = deferred<unknown>();
  const queue = [first, second];
  let calls = 0;
  const invoked: string[] = [];
  let generation = 0;
  const invoke = (operation: string) => {
    calls += 1;
    invoked.push(operation);
    const next = queue.shift();
    if (!next) throw new Error("Unexpected duplicate operation");
    return next.promise;
  };
  const queries = capabilityOperationQueryHarness();
  const mutation = queryMutationHarness();
  const ui = generatedFormHarness(source, [components[feature], selected.component], {
    useAuthOwnedEffect: () => () => {
      const captured = generation;
      return () => captured === generation;
    },
    useQueryClient: () => queries.client,
    useQuery: queries.useQuery,
    useMutation: mutation.useMutation,
    currentQueryAuthGeneration: () => generation,
    subscribeQueryAuthGeneration: () => () => {},
    currentQueryAuthScope: () => ({
      userId: `owner-${generation}`,
      sessionId: `session-${generation}`,
    }),
    authScopedQueryKey: (scope: { userId: string; sessionId: string }, key: readonly unknown[]) => [
      "auth",
      scope.userId,
      scope.sessionId,
      ...key,
    ],
    initialUserFeatureFlagQueryKey: (scope: { userId: string; sessionId: string }) => [
      "auth",
      scope.userId,
      scope.sessionId,
      "feature-flags",
      "new-dashboard",
    ],
    orpcClient: {
      jobs: {
        enqueue: () => invoke("enqueue"),
        getRun: () => invoke("refresh"),
        cancelRun: () => invoke("cancel"),
      },
      storage: {
        uploadBase64: () => invoke("upload"),
        downloadBase64: () => invoke("download"),
        remove: () => invoke("remove"),
      },
      featureFlags: { evaluate: () => invoke("evaluate") },
    },
    useTranslations: () => (key: string) => key,
    base64ToUtf8: atob,
    ...Object.fromEntries(
      ["ScrollView", "View", "Text", "Field", "FieldLabel", "Input", "Textarea"].map((name) => [
        name,
        name,
      ]),
    ),
  });
  const render = () => {
    const screen = ui.render(components[feature], { initialResult: null });
    const view = elements(screen).find((node) => node.type === ui.module[selected.component]);
    if (!view)
      throw new Error(`Emitted ${components[feature]} did not compose ${selected.component}`);
    return ui.render(selected.component, view.props);
  };
  function click(action: string, tree = render()) {
    if (feature === "feature-flags" && target !== "mobile") {
      const form = elements(tree).find((node) => node.type === "form")!;
      (form.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault() {} });
      return;
    }
    const button = elements(tree).find(
      (node) => node.type === "Button" && textContent(node).trim() === action,
    )!;
    (button.props[target === "mobile" ? "onPress" : "onClick"] as () => void)();
  }
  return {
    first,
    second,
    render,
    click,
    calls: () => calls,
    invoked: () => [...invoked],
    loseOwner: () => {
      generation += 1;
    },
  };
}

const variants: CapabilityClientOptions[] = [
  ...(["single", "monorepo"] as const).flatMap((mode) =>
    (["nextjs", "tanstack-start"] as const).map((framework) => ({
      mode,
      framework,
      apps: ["web"] as const,
    })),
  ),
  ...(["mobile", "desktop"] as const).map((target) => ({
    mode: "monorepo" as const,
    framework: "nextjs" as const,
    apps: [target],
  })),
].map((variant) => ({
  ...variant,
  notifications: false,
  jobs: true,
  storage: true,
  featureFlags: true,
  i18n: true,
  requestApplication: true,
}));

describe("capability operation ownership", () => {
  test("each standalone capability emits its action and owner hooks for all app targets", () => {
    for (const selected of ["jobs", "storage", "featureFlags", "pdf"] as const) {
      const config = projectConfigSchema.parse({
        name: "owned-operation",
        mode: "monorepo",
        framework: "nextjs",
        database: "postgres",
        apps: ["web", "mobile", "desktop"],
        preset: "custom",
        auth: true,
        api: true,
        email: false,
        analytics: false,
        billing: [],
        features: [],
        messaging: false,
        notifications: false,
        jobs: false,
        storage: false,
        featureFlags: "none",
        pdf: false,
        [selected]: selected === "featureFlags" ? "posthog" : true,
      });
      const paths = new Set(
        generateProjectFiles(config, { dryRun: true }).map((file) => file.path),
      );
      for (const root of ["apps/web/src", "apps/mobile/src", "apps/desktop/src/renderer"]) {
        expect(paths.has(`${root}/hooks/use-auth-owned-effect.ts`), `${selected}/${root}`).toBe(
          true,
        );
        expect(paths.has(`${root}/hooks/use-auth-owned-action.ts`), `${selected}/${root}`).toBe(
          selected !== "pdf",
        );
      }
    }
  });

  test("formatted capability pages retain the existing 200-line page limit", () => {
    const seen = new Set<string>();
    for (const options of variants) {
      for (const file of capabilityClientFiles(options).filter(
        (item) => item.path.includes("/features/") && item.path.endsWith("/page.tsx"),
      )) {
        if (seen.has(file.content)) continue;
        seen.add(file.content);
        const formatted = Bun.spawnSync(
          [process.execPath, "x", "--no-install", "oxfmt", "--stdin-filepath", file.path],
          {
            stdin: new TextEncoder().encode(file.content),
            stdout: "pipe",
            stderr: "pipe",
          },
        );
        expect(formatted.exitCode, new TextDecoder().decode(formatted.stderr)).toBe(0);
        expect(
          new TextDecoder().decode(formatted.stdout).split(/\r?\n/).length,
          file.path,
        ).toBeLessThanOrEqual(200);
      }
    }
  });

  for (const options of variants) {
    const label = `${options.mode}/${options.framework}/${options.apps[0]}`;
    for (const firstAction of operations.jobs) {
      for (const conflictingAction of operations.jobs) {
        if (firstAction === conflictingAction) continue;
        test(`${label}/jobs serializes ${firstAction} -> ${conflictingAction} and admits the next action after completion`, async () => {
          const ui = harness(options, "jobs");
          const initial = ui.render();
          ui.click(firstAction, initial);
          ui.click(conflictingAction, initial);
          expect(ui.invoked()).toEqual([firstAction]);
          expect(
            elements(ui.render())
              .filter((node) => node.type === "Button")
              .every((node) => node.props.disabled === true),
          ).toBe(true);
          ui.first.resolve(outputs[firstAction]);
          await flush();
          expect(textContent(ui.render())).not.toContain("pending");
          ui.click(conflictingAction);
          expect(ui.invoked()).toEqual([firstAction, conflictingAction]);
          ui.second.resolve(outputs[conflictingAction]);
          await flush();
          expect(textContent(ui.render())).not.toContain("pending");
          expect(textContent(ui.render())).not.toContain(errors[conflictingAction]!);
        });
      }
    }
    for (const rejected of [false, true]) {
      test(`${label}/jobs/refresh suppresses ${rejected ? "error" : "success"} after its read owner changes`, async () => {
        const ui = harness(options, "jobs");
        ui.click("refresh");
        expect(ui.invoked()).toEqual(["refresh"]);
        ui.loseOwner();
        if (rejected) ui.first.reject(new Error("Previous owner's lookup failed"));
        else ui.first.resolve(outputs.refresh);
        await flush();
        const tree = ui.render();
        expect(textContent(tree)).not.toContain("completed-");
        expect(textContent(tree)).not.toContain("lookupError");
        expect(textContent(tree)).not.toContain("pending");
        expect(
          elements(tree)
            .filter((node) => node.type === "Input")
            .some((node) => String(node.props.value).includes("completed-")),
        ).toBe(false);
      });
    }
    for (const feature of Object.keys(operations) as Feature[]) {
      for (const action of operations[feature]) {
        test(`${label}/${feature}/${action} prevents duplicate/conflicting requests, shows pending and permits retry`, async () => {
          const ui = harness(options, feature);
          const initial = ui.render();
          ui.click(action, initial);
          ui.click(action, initial);
          ui.click(operations[feature][0], initial);
          expect(ui.calls(), ui.invoked().join(" -> ")).toBe(1);
          const pending = ui.render();
          expect(
            elements(pending)
              .filter((node) => node.type === "Button")
              .every((node) => node.props.disabled === true),
          ).toBe(true);
          expect(textContent(pending)).toContain("pending");
          ui.first.reject(new Error("Controlled request failure"));
          await flush();
          expect(textContent(ui.render())).toContain(errors[action]!);
          expect(
            elements(ui.render())
              .filter((node) => node.type === "Button")
              .every((node) => node.props.disabled === false),
          ).toBe(true);
          ui.click(action);
          expect(ui.calls()).toBe(2);
          ui.second.resolve(outputs[action]);
          await flush();
          expect(textContent(ui.render())).not.toContain(errors[action]!);
          expect(textContent(ui.render())).not.toContain("pending");
        });
      }
      for (const rejected of [false, true]) {
        test(`${label}/${feature} suppresses ${rejected ? "error" : "success"} effects after owner loss`, async () => {
          const ui = harness(options, feature);
          const action = operations[feature][0];
          ui.click(action);
          ui.loseOwner();
          if (rejected) ui.first.reject(new Error("Old owner failure"));
          else ui.first.resolve(outputs[action]);
          await flush();
          const tree = ui.render();
          expect(textContent(tree)).not.toContain("completed-");
          expect(textContent(tree)).not.toContain(errors[action]!);
          expect(
            elements(tree)
              .filter((node) => node.type === "Input")
              .some((node) => String(node.props.value).includes("completed-")),
          ).toBe(false);
        });
      }
    }
  }

  test("Next request flags use the existing request snapshot guard and preserve public evaluation", () => {
    const base = variants[0]!;
    const authenticated = capabilityClientFiles(base).find(
      (file) => file.path === "src/app/feature-flags/page.tsx",
    )!.content;
    expect(authenticated).toContain("const principal = application.principal;");
    expect(authenticated).toContain("userId: principal.identityUserId");
    expect(authenticated).toContain("sessionId: principal.sessionId");
    expect(authenticated).toContain("tenantId: principal.activeOrganizationId");
    expect(authenticated).toContain("teamId: principal.activeTeamId");
    expect(authenticated).toContain("<RequestOwnedSnapshot scope={scope}>");
    expect(authenticated).toContain(
      "if (!current.user || current.user.banned || !principal) return <FeatureFlagsPage initialResult={null} />;",
    );
    const publicRoute = capabilityClientFiles({ ...base, requestApplication: false }).find(
      (file) => file.path === "src/app/feature-flags/page.tsx",
    )!.content;
    expect(publicRoute).not.toContain("RequestOwnedSnapshot");
    expect(publicRoute).toContain("<FeatureFlagsPage initialResult={null} />");
  });
});
