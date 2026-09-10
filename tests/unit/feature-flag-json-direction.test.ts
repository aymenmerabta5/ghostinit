import { describe, expect, test } from "bun:test";
import { featureFlagClientFiles } from "../../src/templates/apps/capability-clients/feature-flags.js";
import type { CapabilityClientOptions } from "../../src/templates/apps/capability-clients/shared.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import { elements, generatedFormHarness, textContent } from "../helpers/generated-form-harness.js";

const locales = [
  ["en", EN_MESSAGES.featureFlags],
  ["fr", FR_MESSAGES.featureFlags],
  ["ar", AR_MESSAGES.featureFlags],
] as const;
const result = Object.freeze({
  key: "new-dashboard",
  value: true,
  variant: "fixture-enabled",
  reason: "provider-default",
  version: null,
  evaluatedAt: "2026-09-10T08:00:00.000Z",
  details: { label: "مرحبا / dashboard", escaped: '<tag> & "quoted"' },
});

// Execute emitted JSX: code keeps its own reading direction inside any page locale.
// Browser evidence separately verifies glyph ordering and scroll behavior.
describe("feature flag JSON direction", () => {
  for (const mode of ["single", "monorepo"] as const)
    for (const framework of ["nextjs", "tanstack-start"] as const)
      for (const i18n of [false, true]) {
        const options: CapabilityClientOptions = {
          mode,
          framework,
          i18n,
          apps: ["web", "desktop"],
          notifications: false,
          storage: false,
          featureFlags: true,
          jobs: false,
          requestApplication: true,
        };
        const files = featureFlagClientFiles(options).filter((file) =>
          file.path.endsWith("/components/feature-flag-workspace.tsx"),
        );
        if (files.length !== (mode === "monorepo" ? 2 : 1))
          throw new Error("Missing generated feature flag presenter");
        for (const file of files)
          for (const [locale, messages] of i18n ? locales : [locales[0]]) {
            test(`${mode} ${framework} ${i18n ? locale : "no-i18n"} ${file.path}: keeps JSON LTR and unchanged`, () => {
              const translate = (key: keyof typeof EN_MESSAGES.featureFlags) => messages[key];
              const harness = generatedFormHarness(file.content, ["FeatureFlagWorkspace"], {
                Field: "Field",
                FieldLabel: "FieldLabel",
                Input: "Input",
                useSurfaceTranslations: () => translate,
                useTranslations: () => translate,
              });
              const props = {
                flagKey: "new-dashboard",
                setKey: () => {},
                evaluate: () => {},
                isPending: false,
                error: null,
                result,
              };
              const tree = harness.render("FeatureFlagWorkspace", props);
              const code = elements(tree).filter((node) => node.type === "pre");
              expect(code).toHaveLength(1);
              const pre = code[0];
              if (!pre) throw new Error("Missing feature flag result");
              expect(pre.props.dir).toBe("ltr");
              expect(textContent(pre)).toBe(JSON.stringify(result, null, 2));
              expect(pre.props.style).toBeUndefined();
              expect(elements(tree).find((node) => node.type === "h1")?.children).toEqual([
                messages.title,
              ]);
              expect(
                elements(harness.render("FeatureFlagWorkspace", { ...props, result: null })).some(
                  (node) => node.type === "pre",
                ),
              ).toBe(false);
            });
          }
      }
});
