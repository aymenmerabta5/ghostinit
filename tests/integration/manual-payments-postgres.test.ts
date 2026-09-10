import { expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as orm from "drizzle-orm";
import * as pg from "drizzle-orm/pg-core";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { postgresManualPaymentSchemaContent } from "../../src/templates/billing/manual/schema.js";
import { postgresManualPaymentRepositoryContent } from "../../src/templates/billing/manual/repository.js";
import {
  evaluateManualTemplate,
  manualDomainBindings,
  manualSubmitInput,
  testManualService,
} from "../helpers/manual-payments-harness.js";

test("emitted PostgreSQL manual payment repository isolates receipts and credits each reviewed payment once", async () => {
  const database = await PGlite.create();
  try {
    const users = pg.pgTable("users", {
      id: pg.text("id").primaryKey(),
      role: pg.text("role"),
      banned: pg.boolean("banned").notNull().default(false),
      emailVerified: pg.boolean("email_verified").notNull().default(true),
    });
    const tables = evaluateManualTemplate<Record<string, pg.PgTable>>(
      postgresManualPaymentSchemaContent(),
      ["manualPayments", "manualCreditLedger"],
      { ...pg, sql: orm.sql, users },
    );
    const schema = { users, ...tables };
    for (const statement of await generateMigration(
      generateDrizzleJson({}),
      generateDrizzleJson(schema),
    ))
      await database.exec(statement);
    await database.exec(
      "insert into users (id,role) values ('alice','user'),('bob','user'),('admin','admin'),('admin2','superAdmin')",
    );
    const db = drizzle(database, { schema });
    const blobs = new Map<string, Uint8Array>();
    let failStorage = false;
    let truncateNextWrite = false;
    const deletedBlobs: string[] = [];
    const repository = evaluateManualTemplate<{ postgresManualPaymentRepository: unknown }>(
      postgresManualPaymentRepositoryContent("monorepo"),
      ["postgresManualPaymentRepository"],
      {
        ...orm,
        ...tables,
        ...manualDomainBindings(),
        db,
        users,
        createHash,
        randomUUID,
        getFile: async (key: string) => blobs.get(key) ?? null,
        deleteFile: async (key: string) => {
          deletedBlobs.push(key);
          blobs.delete(key);
        },
        putFile: async (data: Uint8Array, originalName: string, mimeType: string, key: string) => {
          if (failStorage) throw new Error("fixture storage unavailable");
          if (blobs.has(key)) throw new Error("fixture exclusive create conflict");
          if (truncateNextWrite) {
            truncateNextWrite = false;
            blobs.set(key, new Uint8Array(0));
            throw new Error("fixture interrupted local write");
          }
          blobs.set(key, data.slice());
          return { storageKey: key, originalName, mimeType, byteSize: data.byteLength };
        },
      },
    ).postgresManualPaymentRepository;
    const service = testManualService(repository);
    const first = await service.submit({ id: "alice" }, manualSubmitInput(1));
    expect(first.status).toBe("pending");
    expect(first).not.toHaveProperty("receiptKey");
    expect(first).not.toHaveProperty("requestFingerprint");
    expect((await service.summary({ id: "alice" })).balanceMinor).toBe(0);
    await expect(service.receipt({ id: "bob" }, first.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await service.list({ id: "bob" })).items).toEqual([]);
    expect((await service.receipt({ id: "alice" }, first.id)).data).toEqual(
      manualSubmitInput(1).receipt.data,
    );
    expect((await service.receipt({ id: "admin" }, first.id)).data).toEqual(
      manualSubmitInput(1).receipt.data,
    );
    await expect(
      service.review({ id: "alice", role: "admin" }, { id: first.id, decision: "approved" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const replay = await service.submit({ id: "alice" }, manualSubmitInput(1));
    expect(replay.id).toBe(first.id);
    expect(blobs.size).toBe(1);
    await expect(
      service.submit({ id: "alice" }, { ...manualSubmitInput(1), amountMinor: 200 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.submit(
        { id: "alice" },
        { ...manualSubmitInput(1), requestKey: "another-receipt-request" },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(service.submit({ id: "bob" }, manualSubmitInput(1))).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const approvals = await Promise.all([
      service.review(
        { id: "admin" },
        { id: first.id, decision: "approved", reason: "Transfer verified" },
      ),
      service.review(
        { id: "admin2" },
        { id: first.id, decision: "approved", reason: "Concurrent review" },
      ),
    ]);
    expect(approvals.map((payment) => payment.status)).toEqual(["approved", "approved"]);
    expect(approvals[0]?.reviewerId).toBe(approvals[1]?.reviewerId);
    expect((await service.summary({ id: "alice" })).balanceMinor).toBe(12500);
    expect((await database.query("select * from manual_credit_ledger")).rows).toHaveLength(1);
    await expect(
      service.review(
        { id: "admin" },
        { id: first.id, decision: "rejected", reason: "Changed mind" },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const rejected = await service.submit({ id: "alice" }, manualSubmitInput(2));
    await service.review(
      { id: "admin" },
      { id: rejected.id, decision: "rejected", reason: "Transfer could not be verified" },
    );
    expect((await service.summary({ id: "alice" })).balanceMinor).toBe(12500);
    expect((await database.query("select * from manual_credit_ledger")).rows).toHaveLength(1);
    const own = await service.submit({ id: "admin" }, manualSubmitInput(3));
    await expect(
      service.review({ id: "admin" }, { id: own.id, decision: "approved" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    failStorage = true;
    await expect(service.submit({ id: "alice" }, manualSubmitInput(4))).rejects.toThrow(
      "fixture storage unavailable",
    );
    expect((await service.list({ id: "alice" })).items).toHaveLength(2);
    const reservation = (
      await database.query<{ id: string }>(
        "select id from manual_payments where request_key = 'manual-fixture-request-4'",
      )
    ).rows[0];
    failStorage = false;
    await expect(
      service.submit(
        { id: "alice" },
        {
          ...manualSubmitInput(4),
          requestKey: "refreshed-browser-request",
          amountMinor: 200,
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.submit(
        { id: "bob" },
        {
          ...manualSubmitInput(4),
          requestKey: "refreshed-browser-request",
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const resumed = await service.submit(
      { id: "alice" },
      {
        ...manualSubmitInput(4),
        requestKey: "refreshed-browser-request",
      },
    );
    expect(resumed.id).toBe(reservation?.id);
    expect(resumed.status).toBe("pending");
    await expect(
      service.submit(
        { id: "alice" },
        {
          ...manualSubmitInput(4),
          requestKey: "refreshed-browser-request",
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (
        await database.query(
          "select * from manual_payments where request_key = 'manual-fixture-request-4'",
        )
      ).rows,
    ).toHaveLength(1);

    // A failed ledger insert must roll back the review status, reviewer, and time.
    await database.query(
      "insert into manual_credit_ledger (payment_id,owner_id,amount_minor) values ($1,'alice',12500)",
      [resumed.id],
    );
    await expect(
      service.review({ id: "admin" }, { id: resumed.id, decision: "approved" }),
    ).rejects.toThrow();
    expect(
      (
        await database.query<{ status: string; reviewer_id: string | null }>(
          "select status,reviewer_id from manual_payments where id=$1",
          [resumed.id],
        )
      ).rows[0],
    ).toEqual({ status: "pending", reviewer_id: null });
    await database.query("delete from manual_credit_ledger where payment_id=$1", [resumed.id]);

    // The local storage adapter truncates failed exclusive writes; only uploading
    // reservations may repair that empty object, with concurrent retries serialized.
    truncateNextWrite = true;
    await expect(service.submit({ id: "alice" }, manualSubmitInput(6))).rejects.toThrow(
      "fixture interrupted local write",
    );
    const repaired = await Promise.all([
      service.submit({ id: "alice" }, manualSubmitInput(6)),
      service.submit({ id: "alice" }, manualSubmitInput(6)),
    ]);
    expect(repaired[0]?.id).toBe(repaired[1]?.id);
    expect(repaired[0]?.status).toBe("pending");
    expect(deletedBlobs).toHaveLength(1);
    expect((await service.receipt({ id: "alice" }, repaired[0]!.id)).data).toEqual(
      manualSubmitInput(6).receipt.data,
    );

    // Non-empty corrupt receipts fail closed, even for an unfinished reservation.
    failStorage = true;
    await expect(service.submit({ id: "alice" }, manualSubmitInput(7))).rejects.toThrow(
      "fixture storage unavailable",
    );
    failStorage = false;
    const corrupted = (
      await database.query<{ receipt_key: string }>(
        "select receipt_key from manual_payments where request_key='manual-fixture-request-7'",
      )
    ).rows[0]!;
    blobs.set(corrupted.receipt_key, new TextEncoder().encode("corrupt"));
    await expect(service.submit({ id: "alice" }, manualSubmitInput(7))).rejects.toThrow(
      "Reserved receipt contents changed",
    );
    expect(deletedBlobs).toHaveLength(1);
    expect(blobs.get(corrupted.receipt_key)).toEqual(new TextEncoder().encode("corrupt"));

    // A finalized payment is never rewritten, even if its blob later becomes empty.
    const completed = (
      await database.query<{ receipt_key: string }>(
        "select receipt_key from manual_payments where id=$1",
        [first.id],
      )
    ).rows[0]!;
    blobs.set(completed.receipt_key, new Uint8Array(0));
    expect((await service.submit({ id: "alice" }, manualSubmitInput(1))).status).toBe("approved");
    expect(blobs.get(completed.receipt_key)?.byteLength).toBe(0);
    expect(deletedBlobs).toHaveLength(1);
    await expect(service.receipt({ id: "alice" }, first.id)).rejects.toThrow(
      "unavailable or changed",
    );
    blobs.set(completed.receipt_key, manualSubmitInput(1).receipt.data);

    await database.exec("update users set role='user' where id='admin'");
    await expect(
      service.review({ id: "admin", role: "admin" }, { id: resumed.id, decision: "approved" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await database.exec("update users set banned=true where id='alice'");
    await expect(service.receipt({ id: "alice" }, first.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(service.submit({ id: "alice" }, manualSubmitInput(5))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await database.exec("update users set email_verified=false where id='bob'");
    await expect(service.summary({ id: "bob" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(database.query("delete from users where id='alice'")).rejects.toThrow();
    await expect(database.query("delete from users where id='admin'")).rejects.toThrow();
  } finally {
    await database.close();
  }
}, 100000);
