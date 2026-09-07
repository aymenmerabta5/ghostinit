import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type Element = { type: unknown; props: Record<string, unknown>; children: unknown[] };
function element(
  type: unknown,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): Element {
  return { type, props: props ?? {}, children };
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("type" in value)) return [];
  const node = value as Element;
  return [node, ...node.children.flatMap(nodes)];
}

function harness(i18n: boolean) {
  const result = resolveCreateConfig({
    name: "admin-row-pending",
    runtime: "bun",
    mode: "monorepo",
    framework: "nextjs",
    database: "postgres",
    databaseWasExplicit: true,
    preset: "saas",
    billing: [],
    features: i18n ? ["i18n"] : [],
    apps: ["web", "desktop"],
    cache: "none",
    deploy: "none",
  });
  if (!result.ok) throw new Error(result.message);
  const plan = buildProjectGenerationPlan(result.resolvedConfig, {
    desiredConfig: result.desiredConfig,
  });
  const source = plan.files.find(
    (file) => file.physicalPath === "apps/desktop/src/renderer/routes/admin.users.tsx",
  )?.content;
  if (!source) throw new Error("Missing generated admin users route");
  const instances = new Map<string, { slots: unknown[]; cursor: number }>();
  let active: { slots: unknown[]; cursor: number };
  const queue: Deferred[] = [];
  const calls: Array<{ operation: string; userId: string }> = [];
  const bindings: Record<string, unknown> = {
    React: {
      createElement: element,
      useRef(initial: unknown) {
        const index = active.cursor++;
        return (active.slots[index] ??= { current: initial });
      },
      useState(initial: unknown) {
        const slots = active.slots;
        const index = active.cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [
          slots[index],
          (value: unknown) => {
            slots[index] = value;
          },
        ];
      },
    },
    useMutation({ operation }: { operation: string }) {
      const index = active.cursor++;
      if (!active.slots[index]) {
        const mutation = {
          error: null as Error | null,
          reset() {
            mutation.error = null;
          },
          async mutateAsync(input: { userId: string }) {
            calls.push({ operation, userId: input.userId });
            const next = queue.shift();
            if (!next) throw new Error("Unexpected duplicate request");
            try {
              await next.promise;
            } catch (cause) {
              mutation.error = cause as Error;
              throw cause;
            }
          },
        };
        active.slots[index] = mutation;
      }
      return active.slots[index];
    },
    useQueryClient: () => ({ async invalidateQueries() {} }),
    createFileRoute: () => (options: unknown) => ({ options }),
    useTranslations: () => (key: string) => key,
    orpc: {
      adminUsers: {
        changeRole: { mutationOptions: () => ({ operation: "role" }) },
        setBanned: { mutationOptions: () => ({ operation: "ban" }) },
        list: { key: () => ["admin-users"] },
      },
    },
  };
  for (const name of ["Button", "Alert", "AlertTitle", "AlertDescription"]) bindings[name] = name;
  const executable = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: { compilerOptions: { jsx: "react" } },
  }).transformSync(source.replace(/^import[^;]+;\s*/gm, "").replace(/^export /gm, ""));
  const component = new Function(
    ...Object.keys(bindings),
    `${executable}\nreturn AdminUserActions;`,
  )(...Object.values(bindings)) as (props: unknown) => unknown;
  return {
    queue,
    calls,
    render(id: string) {
      active = instances.get(id) ?? { slots: [], cursor: 0 };
      instances.set(id, active);
      active.cursor = 0;
      return component({
        user: {
          id,
          authId: id,
          name: id,
          email: `${id}@example.test`,
          role: "user",
          banned: false,
        },
      });
    },
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

describe("generated desktop admin row action ownership", () => {
  for (const i18n of [false, true]) {
    test(`i18n=${i18n} immediate duplicates and conflicting actions cannot overlap within a row`, async () => {
      const ui = harness(i18n);
      const first = deferred();
      const second = deferred();
      ui.queue.push(first, second);
      const rowA = nodes(ui.render("user-a")).filter((node) => node.type === "Button");
      const rowB = nodes(ui.render("user-b")).filter((node) => node.type === "Button");
      const click = (button: Element | undefined) => {
        if (!button) throw new Error("Missing admin row action");
        (button.props.onClick as () => void)();
      };
      click(rowA[0]);
      click(rowA[0]);
      click(rowA[1]);
      click(rowB[0]);
      expect(ui.calls).toEqual([
        { operation: "role", userId: "user-a" },
        { operation: "role", userId: "user-b" },
      ]);
      expect(
        nodes(ui.render("user-a"))
          .filter((node) => node.type === "Button")
          .every((node) => node.props.disabled),
      ).toBe(true);
      first.resolve();
      await flush();
      expect(
        nodes(ui.render("user-a"))
          .filter((node) => node.type === "Button")
          .every((node) => !node.props.disabled),
      ).toBe(true);
      expect(
        nodes(ui.render("user-b"))
          .filter((node) => node.type === "Button")
          .every((node) => node.props.disabled),
      ).toBe(true);
      second.reject(new Error("Role update refused"));
      await flush();
      expect(
        nodes(ui.render("user-b")).some(
          (node) => node.type === "Alert" && node.props.role === "alert",
        ),
      ).toBe(true);
      expect(nodes(ui.render("user-a")).some((node) => node.type === "Alert")).toBe(false);
      const retry = deferred();
      ui.queue.push(retry);
      click(nodes(ui.render("user-b")).find((node) => node.type === "Button"));
      expect(ui.calls).toHaveLength(3);
      expect(nodes(ui.render("user-b")).some((node) => node.type === "Alert")).toBe(false);
      retry.resolve();
      await flush();
      expect(
        nodes(ui.render("user-b"))
          .filter((node) => node.type === "Button")
          .every((node) => !node.props.disabled),
      ).toBe(true);
    });
  }
});
