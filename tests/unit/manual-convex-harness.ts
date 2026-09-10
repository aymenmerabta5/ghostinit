import { convexManualPaymentsContent } from "../../src/templates/database/convex/manual-payments.js";
import { convexManualUploadsContent } from "../../src/templates/database/convex/manual-uploads.js";
import { convexManualHttpContent } from "../../src/templates/database/convex/manual-http.js";
import { convexLibAuthContent } from "../../src/templates/database/convex/lib.js";
import { convexManualRetentionContent } from "../../src/templates/database/convex/manual-retention.js";
import { convexAuthContent } from "../../src/templates/database/convex/auth.js";

type Row = Record<string, unknown> & { _id: string; _creationTime: number };
type Input = Record<string, unknown>;
type Handler = { handler: (ctx: unknown, input: Input) => Promise<unknown> };
type HttpHandler = (ctx: unknown, request: Request) => Promise<Response>;
const transpiler = new Bun.Transpiler({ loader: "ts" });
function execute(source: string, bindings: Record<string, unknown>, exports: string) {
  const javascript = transpiler.transformSync(
    source.replace(/^import .*\r?\n/gm, "").replace(/^export /gm, ""),
  );
  return new Function(...Object.keys(bindings), `${javascript}\nreturn {${exports}};`)(
    ...Object.values(bindings),
  ) as Record<string, unknown>;
}

export function manualConvexHarness() {
  let tables = new Map<string, Map<string, Row>>();
  let serial = 0;
  const deleted: string[] = [];
  const scheduled: Input[] = [];
  const blobs = new Map<string, Blob>();
  let authId: string | null = "auth-user";
  const config = {
    enabled: true,
    receiverInstructions: "Recipient account",
    allowedMethods: ["BaridiMob"],
  };
  function rows(table: string) {
    let result = tables.get(table);
    if (!result) {
      result = new Map();
      tables.set(table, result);
    }
    return result;
  }
  function seed(table: string, data: Input, id = `${table}-${++serial}`) {
    const row = { ...data, _id: id, _creationTime: Date.now() };
    rows(table).set(id, row);
    return row;
  }
  seed("users", { authId: "auth-user", role: "user", banned: false, emailVerified: true }, "user");
  seed(
    "users",
    { authId: "auth-other", role: "user", banned: false, emailVerified: true },
    "other",
  );
  seed(
    "users",
    { authId: "auth-admin", role: "admin", banned: false, emailVerified: true },
    "admin",
  );
  function get(id: string) {
    for (const collection of tables.values()) {
      const row = collection.get(id);
      if (row) return row;
    }
    return null;
  }
  function query(table: string) {
    const conditions: Array<(row: Row) => boolean> = [];
    let direction = 1;
    const index = {
      eq(field: string, value: unknown) {
        conditions.push((row) => row[field] === value);
        return index;
      },
      gt(field: string, value: number) {
        conditions.push((row) => Number(row[field]) > value);
        return index;
      },
      gte(field: string, value: number) {
        conditions.push((row) => Number(row[field]) >= value);
        return index;
      },
      lte(field: string, value: number) {
        conditions.push((row) => Number(row[field]) <= value);
        return index;
      },
    };
    const matching = () =>
      [...rows(table).values()]
        .filter((row) => conditions.every((condition) => condition(row)))
        .sort(
          (a, b) =>
            direction *
            (Number(a.createdAt ?? a._creationTime) - Number(b.createdAt ?? b._creationTime)),
        );
    const chain = {
      withIndex(_name: string, select: (index: typeof index) => unknown) {
        select(index);
        return chain;
      },
      order(order: string) {
        direction = order === "desc" ? -1 : 1;
        return chain;
      },
      async take(limit: number) {
        return matching().slice(0, limit);
      },
      async first() {
        return matching()[0] ?? null;
      },
      async unique() {
        const found = matching();
        if (found.length > 1) throw new Error("Unique query failed");
        return found[0] ?? null;
      },
      async paginate({ numItems }: { numItems: number }) {
        return { page: matching().slice(0, numItems), isDone: true, continueCursor: "" };
      },
    };
    return chain;
  }
  const db = {
    query,
    async get(id: string) {
      return get(id);
    },
    async insert(table: string, value: Input) {
      return seed(table, value)._id;
    },
    async patch(id: string, value: Input) {
      const row = get(id);
      if (!row) throw new Error("Missing row");
      Object.assign(row, value);
    },
    async delete(id: string) {
      for (const collection of tables.values()) collection.delete(id);
    },
    system: {
      query,
      async get(id: string) {
        return get(id);
      },
    },
  };
  const ctx = {
    db,
    auth: {
      async getUserIdentity() {
        return authId ? { subject: authId } : null;
      },
    },
    storage: {
      async store(blob: Blob) {
        const id = seed("_storage", { size: blob.size, contentType: blob.type })._id;
        blobs.set(id, blob);
        return id;
      },
      async get(id: string) {
        return blobs.get(id) ?? null;
      },
      async delete(id: string) {
        deleted.push(id);
        blobs.delete(id);
        rows("_storage").delete(id);
      },
    },
    scheduler: {
      async runAfter(_delay: number, _reference: unknown, input: Input) {
        scheduled.push(input);
      },
    },
    async runQuery(reference: Handler, input: Input) {
      return await reference.handler(ctx, input);
    },
    async runMutation(reference: Handler, input: Input) {
      return await transaction(reference, input);
    },
  };
  class ConvexError extends Error {
    constructor(readonly data: Input) {
      super(String(data.message));
    }
  }
  const validator = new Proxy(
    {},
    {
      get:
        () =>
        (..._args: unknown[]) => ({}),
    },
  );
  const auth = execute(
    convexLibAuthContent(),
    {
      ConvexError,
      authComponent: {
        async safeGetAuthUser() {
          return authId ? { _id: authId } : null;
        },
      },
    },
    "requireActor,requireAdminActor",
  );
  const retention = execute(
    convexManualRetentionContent(),
    { ConvexError },
    "assertManualPaymentDeletionAllowed",
  );
  const deletionMatch = convexAuthContent("single", false, false, false, true).match(
    /onDelete: async \(ctx, authUser\) => \{([\s\S]*?)\n      \},/,
  );
  if (!deletionMatch) throw new Error("Generated deletion hook not found");
  const deleteAccount = new Function(
    "assertManualPaymentDeletionAllowed",
    `return async (ctx, authUser) => {${deletionMatch[1]}};`,
  )(retention.assertManualPaymentDeletionAllowed) as (
    ctx: unknown,
    authUser: { _id: string },
  ) => Promise<void>;
  const builder = (definition: unknown) => definition;
  const bindings = {
    v: validator,
    internalMutation: builder,
    internalQuery: builder,
    query: builder,
    mutation: builder,
    ConvexError,
    ...auth,
    manualPaymentConfig: config,
  };
  const payments = execute(
    convexManualPaymentsContent(),
    bindings,
    "summary,list,reviewQueue,receipt,submit,review,submissionArgs,submissionFingerprint,existingSubmission,validateSubmission,requireCapacity,requireUnusedReceipt,requireManualActor,paymentDto",
  );
  const internal: Record<string, unknown> = { manualPayments: payments };
  const uploads = execute(
    convexManualUploadsContent(),
    { ...bindings, ...payments, internal },
    "reserve,abandon,expire",
  );
  internal.manualPaymentUploads = uploads;
  const http = execute(
    convexManualHttpContent(),
    { ...bindings, internal, httpAction: builder },
    "uploadReceipt,downloadReceipt",
  ) as Record<string, HttpHandler>;
  let tail: Promise<unknown> = Promise.resolve();
  function transaction(reference: Handler, input: Input) {
    const result = tail.then(async () => {
      const snapshot = structuredClone(tables);
      try {
        return await reference.handler(ctx, input);
      } catch (error) {
        tables = snapshot;
        throw error;
      }
    });
    tail = result.catch(() => undefined);
    return result;
  }
  async function mutation(name: string, input: Input) {
    return await transaction((payments[name] ?? uploads[name]) as Handler, input);
  }
  async function read(name: string, input: Input = {}) {
    return await (payments[name] as Handler).handler(ctx, input);
  }
  async function upload(
    bytes: Uint8Array = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    key = "request_key_000001",
    amount = 120_000,
  ) {
    return await http.uploadReceipt!(
      ctx,
      new Request(
        `https://convex.test/api/manual-payments?amountMinor=${amount}&requestKey=${key}&originalName=receipt.png`,
        {
          method: "POST",
          headers: { "Content-Type": "image/png" },
          body: new Uint8Array(bytes),
        },
      ),
    );
  }
  return {
    ctx,
    rows,
    seed,
    read,
    mutation,
    upload,
    http,
    config,
    deleted,
    scheduled,
    blobs,
    async deleteAccount(id: string) {
      await deleteAccount(ctx, { _id: `auth-${id}` });
    },
    setActor(id: string | null) {
      authId = id ? `auth-${id}` : null;
    },
  };
}
