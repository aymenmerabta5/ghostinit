import { afterAll, describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { FsTransaction } from "../../src/lib/fs.js";
import { oxlintConfig } from "../../src/templates/root/config.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";
import { flush } from "../helpers/generated-form-harness.js";
import {
  billingLoaderSelections,
  billingRouteHarness,
  generatedBillingRoute,
} from "../helpers/tanstack-billing-loader-harness.js";

const prefix = "ghostinit-billing-loader-lint-";
const temporary: string[] = [];
afterAll(() => {
  for (const directory of temporary) {
    if (
      dirname(directory) !== realpathSync.native(tmpdir()) ||
      !basename(directory).startsWith(prefix)
    )
      throw new Error("Refusing unsafe billing loader fixture cleanup");
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("generated TanStack billing loader admission", () => {
  for (const mode of ["single", "monorepo"] as const)
    for (const database of ["postgres", "convex"] as const) {
      for (const selection of billingLoaderSelections)
        test(
          mode + "/" + database + "/" + selection.id + " preserves scoped reads and result shape",
          async () => {
            const generated = generatedBillingRoute(mode, database, selection.billing);
            const h = billingRouteHarness(generated.source);
            const online = selection.billing.some((provider) => provider !== "manual");
            expect(h.route.path).toBe("/billing");
            expect(h.route.component).toBe(h.component);
            expect(await h.route.beforeLoad({ context: h.context })).toEqual({
              queryScope: h.queryScope,
            });
            expect(h.calls).toEqual([{ kind: "authorize", input: h.queryClient }]);
            const result = h.route.loader({ context: h.context });
            expect(h.calls.slice(1)).toEqual(
              online
                ? [
                    { kind: "session", input: h.context },
                    { kind: "snapshot", input: h.context },
                  ]
                : [{ kind: "session", input: h.context }],
            );
            const owner = Object.freeze({ user: { id: "owner" }, queryScope: h.queryScope });
            const snapshot = Object.freeze({ subscriptions: [], invoices: [] });
            if (online) {
              let settled = false;
              void result.then(
                () => {
                  settled = true;
                },
                () => {
                  settled = true;
                },
              );
              h.snapshot.resolve(snapshot);
              await flush();
              expect(settled).toBe(false);
              h.session.resolve(owner);
              expect(await result).toEqual([owner, snapshot]);
            } else {
              expect(result).toBe(h.session.promise);
              expect(generated.source).not.toContain("loadInitialBillingSnapshot");
              h.session.resolve(owner);
              expect(await result).toBe(owner);
            }
            // This route warms scoped queries; its component does not consume a loader tuple.
            expect(generated.page).not.toMatch(/\b(?:useLoaderData|loaderData)\b/);
          },
        );

      test(
        mode + "/" + database + " keeps authorization and manual read failures unchanged",
        async () => {
          const source = generatedBillingRoute(mode, database, ["manual"]).source;
          const denied = billingRouteHarness(source),
            failure = new Error("Session admission refused");
          denied.failAuthorization(failure);
          await expect(denied.route.beforeLoad({ context: denied.context })).rejects.toBe(failure);
          expect(denied.calls).toEqual([{ kind: "authorize", input: denied.queryClient }]);
          const h = billingRouteHarness(source),
            readFailure = new Error("Owned protected read cancelled");
          const result = h.route.loader({ context: h.context });
          expect(result).toBe(h.session.promise);
          const rejected = expect(result).rejects.toBe(readFailure);
          h.session.reject(readFailure);
          await rejected;
          expect(h.calls).toEqual([{ kind: "session", input: h.context }]);
          const sync = billingRouteHarness(source);
          sync.failReadSynchronously(readFailure);
          expect(() => sync.route.loader({ context: sync.context })).toThrow(readFailure);
          expect(sync.calls).toEqual([{ kind: "session", input: sync.context }]);
        },
      );

      test(
        mode + "/" + database + " online reads start concurrently and propagate either failure",
        async () => {
          const source = generatedBillingRoute(mode, database, [
            "manual",
            "chargily",
            "stripe",
          ]).source;
          for (const failing of ["session", "snapshot"] as const) {
            const h = billingRouteHarness(source),
              failure = new Error(failing + " failed");
            const result = h.route.loader({ context: h.context });
            expect(h.calls).toEqual([
              { kind: "session", input: h.context },
              { kind: "snapshot", input: h.context },
            ]);
            const rejected = expect(result).rejects.toBe(failure);
            h[failing].reject(failure);
            await rejected;
            h[failing === "session" ? "snapshot" : "session"].resolve({ retained: true });
            await flush();
            expect(h.calls).toHaveLength(2);
          }
        },
      );
    }

  test("actual generated lint accepts every route and rejects the original one-promise form", async () => {
    const directory = createTemporaryWorkspace(prefix);
    temporary.push(directory);
    const transaction = new FsTransaction(directory),
      valid: string[] = [],
      controls: string[] = [];
    const config = oxlintConfig();
    await transaction.write(config.path, config.content);
    for (const mode of ["single", "monorepo"] as const)
      for (const database of ["postgres", "convex"] as const) {
        for (const selection of billingLoaderSelections) {
          const { source } = generatedBillingRoute(mode, database, selection.billing);
          const path = "routes/" + mode + "-" + database + "-" + selection.id + ".tsx";
          await transaction.write(path, source);
          valid.push(join(directory, path));
          if (selection.id === "manual") {
            const legacy = source.replace(
              "loader: ({ context }) => loadProtectedRoute(context)",
              "loader: ({ context }) => Promise.all([loadProtectedRoute(context)])",
            );
            expect(legacy).not.toBe(source);
            const legacyPath = "legacy/legacy-" + mode + "-" + database + ".tsx";
            await transaction.write(legacyPath, legacy);
            controls.push(join(directory, legacyPath));
          }
        }
      }
    expect(transaction.getStagedFiles()).toHaveLength(valid.length + controls.length + 1);
    await transaction.commit();
    const node = Bun.which("node");
    if (!node) throw new Error("Node is required for installed oxlint verification");
    const requirePackage = createRequire(import.meta.url);
    const executable = join(
      dirname(requirePackage.resolve("oxlint/package.json")),
      "bin",
      "oxlint",
    );
    const lint = (paths: string[]) =>
      Bun.spawnSync(
        [
          node,
          executable,
          "--config",
          join(directory, config.path),
          "--deny-warnings",
          "--no-ignore",
          "--format",
          "unix",
          ...paths,
        ],
        { cwd: directory, stdout: "pipe", stderr: "pipe", timeout: 30_000 },
      );
    const positive = lint(valid);
    expect(positive.exitCode, positive.stdout.toString() + positive.stderr.toString()).toBe(0);
    const negative = lint(controls),
      output = negative.stdout.toString() + negative.stderr.toString();
    expect(negative.exitCode).not.toBe(0);
    expect(output).toContain("no-single-promise-in-promise-methods");
    for (const path of controls) expect(output).toContain(basename(path));
  });
});
