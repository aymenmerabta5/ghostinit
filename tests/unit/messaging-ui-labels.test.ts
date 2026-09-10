import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import {
  messagingConvexNextFiles,
  messagingConvexTanstackFiles,
  messagingNextFiles,
  messagingTanstackFiles,
} from "../../src/templates/apps/fragments/messaging/index.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";

describe("web messaging explains ID-based recipients honestly", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const [name, render] of [
      ["next/postgres", messagingNextFiles],
      ["tanstack/postgres", messagingTanstackFiles],
      ["next/convex", messagingConvexNextFiles],
      ["tanstack/convex", messagingConvexTanstackFiles],
    ] as const) {
      test(`${mode}/${name} has an associated visible label and neutral conversation name`, () => {
        const files = render(mode);
        const content = files.map((file) => file.content).join("\n");
        if (name.includes("/convex")) {
          expect(content).toContain('<form.AppField name="peerUserId">');
          expect(content).toContain(
            '<field.TextField label={t("peerUserId")} description={t("peerUserIdHelp")}',
          );
        } else {
          expect(content).toContain(
            '<FieldLabel htmlFor="message-recipient">{t("peerUserId")}</FieldLabel>',
          );
          expect(content).toContain('id="message-recipient"');
          expect(content).toContain('aria-describedby="message-recipient-help"');
        }
        expect(content).toContain('t("peerUserIdHelp")');
        expect(content).toContain('t("conversation")');
        expect(content).not.toContain("peerName");
        expect(content).not.toContain("listUsers");
        for (const file of files.filter((file) => file.path.endsWith(".tsx"))) {
          expect(parseSync(file.path, file.content, { lang: "tsx" }).errors, file.path).toEqual([]);
        }
      });
    }
  }

  test("all bundled locales describe the same controls", () => {
    for (const catalog of [EN_MESSAGES, FR_MESSAGES, AR_MESSAGES]) {
      const messaging = catalog.messaging as Record<string, unknown>;
      for (const key of ["conversation", "peerUserId", "peerUserIdHelp"]) {
        expect(typeof messaging[key], key).toBe("string");
        expect(String(messaging[key]).length, key).toBeGreaterThan(0);
      }
    }
  });
});
