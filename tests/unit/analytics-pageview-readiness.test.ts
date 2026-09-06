import { describe, expect, test } from "bun:test";
import {
  clientPageViewContent,
  singlePageViewContent,
} from "../../src/templates/analytics/pageview.js";
import { singleComponentsHooksContent } from "../../src/templates/analytics/provider.js";

interface Capture {
  name: string;
  properties: { $current_url: string; $pathname: string };
}
interface Client {
  capture(name: string, properties: Capture["properties"]): void;
}
interface Context {
  client: Client | null;
  isLoaded: boolean;
  isEnabled: boolean;
}

function trackerRuntime(source: string, hook = false) {
  const events: Capture[] = [];
  const client: Client = {
    capture(name, properties) {
      events.push({ name, properties });
    },
  };
  let context: Context = { client: null, isLoaded: false, isEnabled: true };
  let location = new URL("https://app.example.test/landing?token=synthetic-secret");
  const refs: Array<{ current: unknown }> = [];
  let refIndex = 0;
  let previousDependencies: unknown[] | undefined;
  let lastEffect: (() => void) | undefined;
  let pendingEffect: (() => void) | undefined;
  const browser = { location, __GHOSTINIT_CONSENT__: true };
  const useRef = (initial: unknown) => {
    const index = refIndex++;
    return (refs[index] ??= { current: initial });
  };
  const useEffect = (operation: () => void, dependencies: unknown[]) => {
    if (
      !previousDependencies ||
      dependencies.some((value, index) => !Object.is(value, previousDependencies?.[index]))
    ) {
      previousDependencies = [...dependencies];
      lastEffect = operation;
      pendingEffect = operation;
    }
  };
  const javascript = new Bun.Transpiler({ loader: "tsx" }).transformSync(
    source
      .replace(/^import\s+[\s\S]*?;\r?\n/gm, "")
      .replace(/^export default [^;]+;\r?\n/gm, "")
      .replace(/^export\s+/gm, ""),
  );
  const render = new Function(
    "useRef",
    "useEffect",
    "usePostHogContext",
    "getPostHogClient",
    "usePathname",
    "useSearchParams",
    "useLocation",
    "window",
    `${javascript}; return ${hook ? "usePostHogPageViewTracker" : "PostHogPageView"};`,
  )(
    useRef,
    useEffect,
    () => context,
    () => context.client,
    () => location.pathname,
    () => location.searchParams,
    () => ({ pathname: location.pathname, searchStr: location.search }),
    browser,
  ) as (enabled?: boolean) => void;

  function update(next: Partial<Context> = {}, path?: string, enabled = true): void {
    context = { ...context, ...next };
    if (path) {
      location = new URL(path, location.origin);
      browser.location = location;
    }
    refIndex = 0;
    pendingEffect = undefined;
    render(enabled);
    pendingEffect?.();
  }
  return { events, client, update, replay: () => lastEffect?.() };
}

const cases = (["nextjs", "tanstack-start"] as const).flatMap((framework) => [
  { name: `monorepo/${framework}`, source: clientPageViewContent("monorepo", framework) },
  { name: `single/${framework}`, source: singlePageViewContent(framework) },
  {
    name: `monorepo/${framework}/hook`,
    source: clientPageViewContent("monorepo", framework),
    hook: true,
  },
]);

describe("generated analytics pageview readiness", () => {
  for (const entry of cases) {
    test(`${entry.name} captures the initial URL when the provider becomes ready`, () => {
      const tracker = trackerRuntime(entry.source, entry.hook);
      tracker.update();
      expect(tracker.events).toEqual([]);
      tracker.update({ client: tracker.client, isLoaded: false });
      expect(tracker.events).toEqual([]);
      tracker.update({ isLoaded: true });
      expect(tracker.events).toEqual([
        {
          name: "$pageview",
          properties: expect.objectContaining({
            $current_url: "https://app.example.test/landing",
            $pathname: "/landing",
          }),
        },
      ]);
    });

    test(`${entry.name} deduplicates effect replay while tracking navigation`, () => {
      const tracker = trackerRuntime(entry.source, entry.hook);
      tracker.update({ client: tracker.client, isLoaded: true });
      tracker.replay();
      tracker.replay();
      tracker.update();
      expect(tracker.events).toHaveLength(1);
      tracker.update({}, "/landing?token=a-different-secret");
      expect(tracker.events).toHaveLength(1);
      tracker.update({}, "/next?tab=activity&token=synthetic-secret");
      tracker.replay();
      expect(tracker.events).toHaveLength(2);
      expect(tracker.events[1]?.properties.$current_url).toBe(
        "https://app.example.test/next?tab=activity",
      );
    });

    test(`${entry.name} honors disabled provider state even with an existing client`, () => {
      const tracker = trackerRuntime(entry.source, entry.hook);
      tracker.update({ client: tracker.client, isLoaded: true, isEnabled: false });
      tracker.replay();
      tracker.update({}, "/next");
      expect(tracker.events).toEqual([]);
      tracker.update({ isEnabled: true });
      expect(tracker.events).toHaveLength(1);
      expect(tracker.events[0]?.properties.$pathname).toBe("/next");
    });

    if (entry.hook) {
      test(`${entry.name} waits for its explicit enabled option`, () => {
        const tracker = trackerRuntime(entry.source, true);
        tracker.update({ client: tracker.client, isLoaded: true }, undefined, false);
        expect(tracker.events).toEqual([]);
        tracker.update({}, undefined, true);
        tracker.replay();
        expect(tracker.events).toHaveLength(1);
      });
    }
  }

  test("the single provider exports the working pageview component rather than a no-op", () => {
    const hooks = singleComponentsHooksContent();
    expect(hooks).toContain('export { PostHogPageView } from "./posthog-pageview.js";');
    expect(hooks).not.toContain("export function PostHogPageView()");
  });
});
