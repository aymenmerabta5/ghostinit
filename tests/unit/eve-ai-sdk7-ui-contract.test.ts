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
      const root = mode === "single" ? "src" : "apps/web/src";
      const readFeature = (relative: string) => {
        const featurePath = `${root}/features/agent/${relative}`;
        const content = files.find((file) => file.path === featurePath)?.content;
        if (!content) throw new Error(`Missing generated Eve feature: ${featurePath}`);
        expect(parseSync(featurePath, content).errors).toEqual([]);
        return content;
      };
      const screen = readFeature("page.tsx");
      const workspace = readFeature("components/agent-workspace.tsx");
      const workflow = readFeature("use-agent-conversation.ts");
      const mutation = readFeature("mutations.ts");
      const transcript = readFeature("components/agent-transcript.tsx");
      const prompt = readFeature("components/agent-prompt.tsx");
      expect(page).toContain('export { AgentPage as default } from "@/features/agent/page"');
      expect(screen).toContain("<AgentWorkspace {...useAgentConversation()} />");
      expect(workspace).toContain("onInputChange={setInput} onSend={submit}");
      expect(workflow).toContain("sendAgentPrompt(agent, value.input)");
      // The transport adapter sends the text itself; the view delegates form submission.
      expect(mutation).toContain("agent.send(input)");
      expect(mutation).not.toMatch(/agent\.send\(\s*\{\s*(?:message|text)\s*:/);
      expect(prompt).toContain("event.preventDefault(); onSend();");
      expect(transcript).toContain("message.parts.map");
      expect(transcript).toMatch(/part\.type === ["']text["']/);
      expect(transcript).toContain("part.text");
      expect(transcript).not.toMatch(/message\.content|\bcontent\?:\s*string/);

      const generatedSource = files.map((file) => file.content).join("\n");
      expect(generatedSource).not.toMatch(/agent\.send\(\s*\{\s*(?:message|text)\s*:/);
      expect(generatedSource).not.toMatch(/sendMessage\(\s*\{\s*message\s*:/);
    });
  }

  test("keeps the generated agent runtime on the AI SDK 7 catalog line", () => {
    expect(v.eve.ai).toMatch(/^7\./);
  });
});
