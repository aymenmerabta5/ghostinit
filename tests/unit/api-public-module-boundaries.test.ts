import { describe, expect, it } from "bun:test";
import { apiPackage } from "../../src/templates/api.js";

function procedureSource(area: "billing" | "messaging"): string {
  return apiPackage(true, true, false)
    .filter((entry) => entry.path.startsWith(`packages/api/src/procedures/${area}/`))
    .map((entry) => entry.content)
    .join("\n");
}

describe("generated API module boundaries", () => {
  it("keeps billing transport thin over the request application facade", () => {
    const source = procedureSource("billing");

    expect(source.match(/context\.application\.billing\./g) ?? []).toHaveLength(4);
    expect(source).not.toMatch(/@repo\/(?:modules|billing|database)/);
    expect(source).not.toMatch(
      /createCheckoutService|createPortalSessionService|getBillingProvider/,
    );
    expect(source.match(/z\.record\(z\.string\(\), z\.unknown\(\)\)/g) ?? []).toHaveLength(4);
    expect(source).not.toContain("z.record(z.unknown())");
  });

  it("composes messaging through the application-owned service port", () => {
    const source = procedureSource("messaging");

    expect(source).not.toContain("@repo/modules/messaging");
    // Six request/response procedures plus the typed event-iterator subscription
    // all resolve the application-owned messaging composition boundary.
    expect(source.match(/from "\.\.\/\.\.\/composition\/messaging";/g) ?? []).toHaveLength(7);
    expect(source.match(/createMessagingServiceForRequest\(\)/g) ?? []).toHaveLength(6);
    expect(source.match(/toMessagingActor\(user\)/g) ?? []).toHaveLength(7);
    expect(source.match(/subscribeToMessagingEvents\(/g) ?? []).toHaveLength(1);
    expect(source).not.toContain("z.record(");

    const composition = apiPackage(true, true, false).find(
      (entry) => entry.path === "packages/api/src/composition/messaging.ts",
    )?.content;
    expect(composition).toContain('import { messaging } from "@repo/services"');
    expect(composition).not.toContain("createAttachmentStorageService");
    expect(composition).toContain("const repository: messaging.MessagingRepositoryPort");
  });
});
