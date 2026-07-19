/**
 * Polar SDK type definitions.
 */

export type PolarSdkConstructor = new (opts: { accessToken?: string; server?: string }) => {
  checkouts: {
    create: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    get?: (input: { id: string }) => Promise<Record<string, unknown>>;
    list?: (input?: Record<string, unknown>) => Promise<unknown>;
  };
  subscriptions: {
    create: (input: { productId: string; customerId: string }) => Promise<Record<string, unknown>>;
    list?: (input?: Record<string, unknown>) => AsyncIterable<unknown> | Promise<unknown>;
    get?: (input: { id: string }) => Promise<Record<string, unknown>>;
  };
  customers: {
    create: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    list: (input: Record<string, unknown>) => AsyncIterable<unknown> | Promise<unknown>;
    get?: (input: { id: string }) => Promise<Record<string, unknown>>;
    update?: (input: {
      id: string;
      customerUpdate: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;
  };
  customerSessions: {
    create: (input: {
      externalCustomerId?: string;
      customerId?: string;
    }) => Promise<Record<string, unknown>>;
  };
  events: {
    ingest: (input: { events: Array<Record<string, unknown>> }) => Promise<Record<string, unknown>>;
  };
  webhooks: {
    createWebhookEndpoint: (input: {
      url: string;
      format: string;
      events: string[];
      organizationId: string;
      name?: string;
    }) => Promise<Record<string, unknown>>;
    listWebhookEndpoints?: (input?: Record<string, unknown>) => Promise<unknown>;
  };
  licenseKeys?: {
    list?: (input: Record<string, unknown>) => AsyncIterable<unknown> | Promise<unknown>;
  };
  benefitGrants?: {
    list?: (input: Record<string, unknown>) => AsyncIterable<unknown> | Promise<unknown>;
  };
  customerSeats?: { listSeats?: (input: Record<string, unknown>) => Promise<unknown> };
};
