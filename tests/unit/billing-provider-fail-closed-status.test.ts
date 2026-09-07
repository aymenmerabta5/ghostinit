import { describe, expect, test } from "bun:test";
import { mapChargilyStatusToDomain } from "../../src/templates/billing/providers/chargily/client";
import { mapSubscriptionStatus as mapPaddleSubscriptionStatus } from "../../src/templates/billing/providers/paddle/mappers";
import { mapPolarSubscriptionStatus } from "../../src/templates/billing/providers/polar/mappers";
import { mapStripeStatusToDomain } from "../../src/templates/billing/providers/stripe/mappers";
import type { SubscriptionStatus } from "../../src/templates/billing/providers/interface";

interface StatusMapperCase {
  provider: string;
  entitledStatus: string;
  map: (status: string | undefined) => SubscriptionStatus;
}

const cases: StatusMapperCase[] = [
  { provider: "stripe", entitledStatus: "active", map: mapStripeStatusToDomain },
  { provider: "chargily", entitledStatus: "paid", map: mapChargilyStatusToDomain },
  { provider: "paddle", entitledStatus: "active", map: mapPaddleSubscriptionStatus },
  { provider: "polar", entitledStatus: "active", map: mapPolarSubscriptionStatus },
];

describe("billing subscription status mappers fail closed", () => {
  for (const providerCase of cases) {
    test(`${providerCase.provider} maps only a known entitled status to active`, () => {
      expect(providerCase.map(providerCase.entitledStatus)).toBe("active");
    });

    test(`${providerCase.provider} maps unknown and missing statuses to non-entitled`, () => {
      for (const raw of [undefined, "", "future_provider_status"]) {
        const status = providerCase.map(raw);
        expect(status).toBe("incomplete");
        expect(status).not.toBe("active");
        expect(status).not.toBe("trialing");
      }
    });
  }
});
