import { describe, expect, test } from "bun:test";
import {
  desktopRouteRootContent,
  desktopShellFeatureFiles,
} from "../../src/templates/apps/desktop/shell/root.js";
import { desktopAdminFeatureFiles } from "../../src/templates/apps/desktop/routes/admin-feature.js";
import { fullDesktopCapabilities } from "../../src/templates/apps/desktop/model.js";
import { expoAdminFeatureFiles } from "../../src/templates/apps/fragments/identity-workspace/expo-admin.js";
import { analyzeFrontendFile } from "../../src/lib/architecture/frontend/index.js";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { deferred, generatedFormHarness } from "../helpers/generated-form-harness.js";

const desktop = desktopAdminFeatureFiles("monorepo", false);
const mobile = expoAdminFeatureFiles("monorepo", false);
const read = (files: typeof desktop, suffix: string) =>
  files.find(({ path }) => path.endsWith(suffix))!.content;

describe("native shell and admin ownership preserves behavior", () => {
  test("desktop access guards check selected protected routes before admitting a session", async () => {
    let user: object | null = null;
    let reads = 0;
    const harness = generatedFormHarness(
      desktopRouteRootContent(fullDesktopCapabilities, "monorepo"),
      ["requireAuthenticatedDesktopRoute"],
      {
        DesktopAppShell: "Shell",
        createRootRoute: (options: unknown) => options,
        readDesktopSession: async () => {
          reads++;
          return { data: { user } };
        },
        redirect: ({ to }: { to: string }) => new Error(`redirect:${to}`),
      },
    );
    const guard = harness.module.requireAuthenticatedDesktopRoute!;
    await guard("/");
    await guard("/sign-in");
    expect(reads).toBe(0);
    await expect(guard("/admin/users")).rejects.toThrow("redirect:/sign-in");
    expect(reads).toBe(1);
    user = { id: "current" };
    await guard("/dashboard");
    expect(reads).toBe(2);
  });

  test("desktop row operations stay locked through mutation and list invalidation", async () => {
    const events: string[] = [];
    let role = deferred<void>();
    const operations = {
      changeRole: {
        error: null,
        reset() {},
        mutateAsync: (value: unknown) => {
          events.push(JSON.stringify(value));
          return role.promise;
        },
      },
      changeBan: {
        error: null,
        reset() {},
        mutateAsync: async () => {
          events.push("ban");
        },
      },
      refresh: async () => {
        events.push("refresh");
      },
    };
    const harness = generatedFormHarness(
      read(desktop, "use-admin-user-actions.ts"),
      ["useAdminUserActions"],
      { useAdminRowMutations: () => operations },
    );
    const user = { authId: "account", role: "user", banned: false };
    const render = () =>
      harness.render("useAdminUserActions", user) as {
        pending: string | null;
        run(operation: "role" | "ban"): Promise<void>;
      };
    const state = render();
    const first = state.run("role");
    expect(render().pending).toBe("role");
    await state.run("ban");
    expect(events).toEqual(['{"userId":"account","role":"admin"}']);
    role.resolve();
    await first;
    expect(events.at(-1)).toBe("refresh");
    expect(render().pending).toBeNull();
    events.length = 0;
    role = deferred<void>();
    const failed = render().run("role");
    role.reject(new Error("denied"));
    await failed;
    expect(events).toEqual(['{"userId":"account","role":"admin"}']);
    expect(render().pending).toBeNull();
  });

  test("Expo create form keeps rejected input and clears accepted credentials while retaining its selected role", async () => {
    let accepted = false;
    let calls = 0;
    const harness = generatedFormHarness(
      read(mobile, "/model.ts") + "\n" + read(mobile, "use-admin-forms.ts"),
      ["useAdminCreateForm"],
    );
    harness.render("useAdminCreateForm", {
      create: async () => {
        calls++;
        return accepted;
      },
    });
    const form = harness.forms[0]!;
    await form.handleSubmit();
    expect(calls).toBe(0);
    Object.assign(form.values, {
      name: "Ada",
      email: "ada@example.test",
      password: "safe-password",
      role: "admin",
    });
    await form.handleSubmit();
    expect(calls).toBe(1);
    expect(form.values.password).toBe("safe-password");
    accepted = true;
    await form.handleSubmit();
    expect(calls).toBe(2);
    expect(form.values).toEqual({ name: "", email: "", password: "", role: "admin" });
  });

  test("desktop update feedback resets once and schedules no work after unmount", async () => {
    const source = read(
      desktopShellFeatureFiles(fullDesktopCapabilities, "monorepo"),
      "use-update-check.ts",
    );
    let request = deferred<void>();
    const timers = new Map<number, () => void>();
    let serial = 0;
    let resets = 0;
    const harness = generatedFormHarness(source, ["useUpdateCheck"], {
      useUpdateCheckMutation: () => ({
        isPending: false,
        error: null,
        data: null,
        mutateAsync: () => request.promise,
        reset: () => resets++,
      }),
      setTimeout: (callback: () => void, delay: number) => {
        expect(delay).toBe(3000);
        timers.set(++serial, callback);
        return serial;
      },
      clearTimeout: (id: number) => timers.delete(id),
    });
    const state = harness.render("useUpdateCheck") as { check(): Promise<void> };
    harness.flushEffects();
    const checked = state.check();
    request.resolve();
    await checked;
    expect(timers.size).toBe(1);
    timers.values().next().value!();
    expect(resets).toBe(1);
    request = deferred<void>();
    const pending = state.check();
    harness.unmount();
    request.resolve();
    await pending;
    expect(timers.size).toBe(0);
  });

  test("both packaging modes produce parsed admin owners under their actual platform rules", () => {
    for (const mode of ["monorepo", "single"] as const)
      for (const translated of [false, true]) {
        for (const [platform, files] of [
          ["electron", desktopAdminFeatureFiles(mode, translated)],
          ["expo", expoAdminFeatureFiles(mode, translated)],
        ] as const) {
          for (const { path, content } of files) {
            const parsed = parseFile(content, path.endsWith("x") ? "tsx" : "ts");
            expect(parsed.diagnostics, path).toEqual([]);
            expect(
              analyzeFrontendFile({
                file: path,
                source: content,
                program: parsed.program,
                comments: parsed.comments,
                imports: parsed.importReferences,
                platform,
              }),
              path,
            ).toEqual([]);
          }
        }
      }
  });
});
