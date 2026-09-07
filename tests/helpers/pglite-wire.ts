import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { createConnection, type Socket } from "node:net";

const require = createRequire(import.meta.url);
const pgRequire = createRequire(require.resolve("pg"));
const { serialize } = pgRequire("pg-protocol") as {
  serialize: {
    startup(options: { user: string; database: string }): Buffer;
    parse(options: { text: string; name: string; types: number[] }): Buffer;
    bind(options: { portal: string; statement: string; values: string[] }): Buffer;
    describe(options: { type: string; name: string }): Buffer;
    execute(options: { portal: string; rows: number }): Buffer;
    query(sql: string): Buffer;
    sync(): Buffer;
  };
};

interface Frame {
  readonly type: string;
  readonly body: Buffer;
}

function databaseError(frame: Frame): Error & { code?: string } {
  const fields: Record<string, string> = {};
  let offset = 0;
  while (offset < frame.body.length && frame.body[offset] !== 0) {
    const key = String.fromCharCode(frame.body[offset++]!);
    const end = frame.body.indexOf(0, offset);
    if (end < 0) break;
    fields[key] = frame.body.subarray(offset, end).toString("utf8");
    offset = end + 1;
  }
  return Object.assign(new Error(fields.M ?? "PostgreSQL wire error"), { code: fields.C });
}

function rowValues(frame: Frame): Array<string | null> {
  const result: Array<string | null> = [];
  const columns = frame.body.readUInt16BE(0);
  let offset = 2;
  for (let column = 0; column < columns; column++) {
    const length = frame.body.readInt32BE(offset);
    offset += 4;
    result.push(length < 0 ? null : frame.body.subarray(offset, offset + length).toString("utf8"));
    if (length >= 0) offset += length;
  }
  return result;
}

/** Real TCP frontend using the same serializer as node-postgres. */
export class PGliteWireClient {
  private readonly events = new EventEmitter();
  private readonly frames: Frame[] = [];
  private buffered = Buffer.alloc(0);
  private ended = false;
  private closing: Promise<void> | undefined;
  private readonly socket: Socket;

  constructor(private readonly port: number) {
    this.socket = createConnection({ host: "127.0.0.1", port });
    this.socket.setNoDelay(true);
    this.socket.on("data", (data: Buffer) => {
      this.buffered = Buffer.concat([this.buffered, data]);
      while (this.buffered.length >= 5) {
        const length = this.buffered.readInt32BE(1);
        if (length < 4 || length > 1024 * 1024) {
          this.events.emit("failure", new Error("Invalid PostgreSQL frame length"));
          this.socket.destroy();
          return;
        }
        if (this.buffered.length < length + 1) break;
        this.frames.push({
          type: String.fromCharCode(this.buffered[0]!),
          body: this.buffered.subarray(5, length + 1),
        });
        this.buffered = this.buffered.subarray(length + 1);
        this.events.emit("frame");
      }
    });
    this.socket.on("error", (error) => this.events.emit("failure", error));
    this.socket.on("close", () => {
      this.ended = true;
      this.events.emit("failure", new Error("PostgreSQL connection closed"));
    });
  }

  async start(): Promise<void> {
    if (this.socket.destroyed) throw new Error("PostgreSQL TCP connection failed");
    if (this.socket.connecting)
      await new Promise<void>((resolve, reject) => {
        this.socket.once("connect", resolve);
        this.socket.once("error", reject);
      });
    this.socket.write(serialize.startup({ user: "postgres", database: "postgres" }));
    await this.next("Z");
  }

  private next(type?: string): Promise<Frame> {
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, frame?: Frame): void => {
        clearTimeout(timer);
        this.events.off("frame", inspect);
        this.events.off("failure", failed);
        if (error) reject(error);
        else resolve(frame!);
      };
      const failed = (error: Error) => finish(error);
      const inspect = (): void => {
        const index = this.frames.findIndex(
          (frame) => !type || frame.type === type || frame.type === "E",
        );
        if (index < 0) {
          if (this.ended) failed(new Error("PostgreSQL connection closed"));
          return;
        }
        const frame = this.frames.splice(index, 1)[0]!;
        if (frame.type === "E") failed(databaseError(frame));
        else finish(undefined, frame);
      };
      const timer = setTimeout(
        () => failed(new Error(`PostgreSQL frame ${type ?? "next"} timed out on ${this.port}`)),
        4_000,
      );
      this.events.on("frame", inspect);
      this.events.on("failure", failed);
      inspect();
    });
  }

  async parse(sql: string): Promise<void> {
    this.socket.write(serialize.parse({ text: sql, name: "", types: [] }));
    await this.next("1");
  }

  private async readyRows(): Promise<Array<Array<string | null>>> {
    const rows: Array<Array<string | null>> = [];
    while (true) {
      const frame = await this.next();
      if (frame.type === "D") rows.push(rowValues(frame));
      if (frame.type === "Z") return rows;
    }
  }

  async execute(values: string[]): Promise<Array<Array<string | null>>> {
    this.socket.write(
      Buffer.concat([
        serialize.bind({ portal: "", statement: "", values }),
        serialize.describe({ type: "P", name: "" }),
        serialize.execute({ portal: "", rows: 0 }),
        serialize.sync(),
      ]),
    );
    return this.readyRows();
  }

  async writeBeforeSync(values: string[]): Promise<void> {
    this.socket.write(
      Buffer.concat([
        serialize.bind({ portal: "", statement: "", values }),
        serialize.execute({ portal: "", rows: 0 }),
      ]),
    );
    await this.next("C");
  }

  async bindBeforeSync(values: string[]): Promise<void> {
    this.socket.write(serialize.bind({ portal: "", statement: "", values }));
    await this.next("2");
  }

  async query(sql: string): Promise<Array<Array<string | null>>> {
    this.socket.write(serialize.query(sql));
    return this.readyRows();
  }

  close(): Promise<void> {
    return (this.closing ??= new Promise<void>((resolve) => {
      if (this.ended) {
        resolve();
        return;
      }
      this.socket.once("close", () => resolve());
      this.socket.destroy();
    }));
  }
}

export async function remainsPending(
  promise: Promise<unknown>,
  milliseconds = 40,
): Promise<boolean> {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  return !settled;
}
