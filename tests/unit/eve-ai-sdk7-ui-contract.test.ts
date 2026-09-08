import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import * as v from "../../src/templates/versions.js";

function config(mode: "monorepo" | "single"): ProjectConfig {
  return {
    name: `eve-ui-${mode}`,
    runtime: "bun",
    version: "0.1.0",
    mode,
    preset: "custom",
    auth: true,
    api: true,
    email: false,
    analytics: false,
    eve: true,
    i18n: false,
    pdf: false,
    messaging: false,
    storage: false,
    notifications: false,
    featureFlags: "none",
    jobs: false,
    cache: "none",
    deploy: "none",
    billing: [],
    features: ["eve"],
    database: "postgres",
    framework: "nextjs",
    apps: ["web"],
  } as ProjectConfig;
}

describe("Eve UI on the AI SDK 7 message contract", () => {
  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} sends plain text through Eve and renders UIMessage-compatible parts`, () => {
      const files = generateProjectFiles(config(mode), { dryRun: true });
      const path =
        mode === "monorepo" ? "apps/web/src/app/agent/page.tsx" : "src/app/agent/page.tsx";
      const page = files.find((file) => file.path === path)?.content;
      expect(page).toBeDefined();
      if (!page) throw new Error(`Missing generated Eve page: ${path}`);

      expect(parseSync(path, page).errors).toEqual([]);
      // Eve 0.47 wraps AI SDK 7 and accepts string | UserContent. A text-only
      // send is therefore the string itself; direct useChat would use { text }.
      expect(page).toContain("agent.send(input)");
      expect(page).not.toMatch(/agent\.send\(\s*\{\s*(?:message|text)\s*:/);
      expect(page).not.toMatch(/sendMessage\(\s*\{\s*message\s*:/);
      const root = mode === "single" ? "src" : "apps/web/src";
      const transcript = files.find(
        (file) => file.path === `${root}/features/agent/agent-transcript.tsx`,
      )!.content;
      const prompt = files.find(
        (file) => file.path === `${root}/features/agent/agent-prompt.tsx`,
      )!.content;
      expect(prompt).toContain("void onSend(input)");
      expect(transcript).toContain("message.parts.map");
      expect(transcript).toMatch(/part\.type === ["']text["']/);
      expect(transcript).toContain("part.text");
      expect(transcript).not.toMatch(/message\.content|\bcontent\?:\s*string/);

      const generatedSource = files.map((file) => file.content).join("\n");
      expect(generatedSource).not.toMatch(/sendMessage\(\s*\{\s*message\s*:/);
    });
  }

  test("keeps the generated agent runtime on the AI SDK 7 catalog line", () => {
    expect(v.eve.ai).toMatch(/^7\./);
  });
});
