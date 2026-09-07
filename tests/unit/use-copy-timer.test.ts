import { describe, expect, test } from "bun:test";
import {
  tanstackUseCopyHookContent,
  useCopyHookContent,
} from "../../src/templates/apps/fragments/core/hooks.js";

describe("generated web use-copy timer", () => {
  test.each([
    ["Next.js", useCopyHookContent],
    ["TanStack Start", tanstackUseCopyHookContent],
  ])("uses browser timer types and preserves cleanup for %s", (_framework, renderHook) => {
    const source = renderHook();

    expect(source).toContain("React.useRef<number | null>(null)");
    expect(source).not.toContain("ReturnType<typeof window.setTimeout>");
    expect(source).not.toContain("ReturnType<typeof setTimeout>");
    expect(source).toContain(
      "timeoutRef.current = window.setTimeout(() => setCopied(false), 2000)",
    );
    expect(source.match(/window\.clearTimeout\(timeoutRef\.current\)/g)).toHaveLength(2);
  });
});
