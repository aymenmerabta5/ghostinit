import { createServer, type Server, type Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { startPostgresWorker } from "../helpers/e2e-postgres-worker.js";

const LOOPBACK_HOST = "127.0.0.1";
const E2E_DATABASE_NAME = "postgres";
const E2E_DATABASE_USER = "ghostinit_e2e";
const E2E_DATABASE_PASSWORD = "GHOSTINIT_E2E_NON_CREDENTIAL";

export interface E2EPostgresRuntime {
  readonly environment: Readonly<Record<string, string>>;
  close(): Promise<void>;
}

function postgresEnvironment(port: number): Readonly<Record<string, string>> {
  const authority = `${LOOPBACK_HOST}:${port}`;
  return Object.freeze({
    DATABASE_URL:
      `postgresql://${E2E_DATABASE_USER}:${E2E_DATABASE_PASSWORD}` +
      `@${authority}/${E2E_DATABASE_NAME}?sslmode=disable`,
    DATABASE_POOL_SIZE: "4",
    DATABASE_SSL: "false",
    POSTGRES_DB: E2E_DATABASE_NAME,
    POSTGRES_HOST: LOOPBACK_HOST,
    POSTGRES_PASSWORD: E2E_DATABASE_PASSWORD,
    POSTGRES_PORT: String(port),
    POSTGRES_USER: E2E_DATABASE_USER,
  });
}

/**
 * Start a real PostgreSQL engine compiled to WASM behind the official TCP
 * socket adapter in a directly owned Node child. Its memory stays in the E2E
 * process tree; loopback and an OS-assigned port keep the fixture isolated.
 */
export async function startIsolatedE2EPostgres(): Promise<E2EPostgresRuntime> {
  const worker = await startPostgresWorker({
    workerPath: fileURLToPath(new URL("./e2e-postgres-worker.mjs", import.meta.url)),
  });
  return {
    environment: postgresEnvironment(worker.port),
    close: worker.close,
  };
}

function fatalAuthenticationResponse(): Buffer {
  const fields = Buffer.concat([
    Buffer.from("SFATAL\0", "utf8"),
    Buffer.from("VFATAL\0", "utf8"),
    Buffer.from("C28P01\0", "utf8"),
    Buffer.from(`Mpassword authentication failed for user "${E2E_DATABASE_USER}"\0`, "utf8"),
    Buffer.from([0]),
  ]);
  const message = Buffer.allocUnsafe(fields.length + 5);
  message.writeUInt8("E".charCodeAt(0), 0);
  message.writeUInt32BE(fields.length + 4, 1);
  fields.copy(message, 5);
  return message;
}

function rejectPostgresStartup(socket: Socket): void {
  let pending = Buffer.alloc(0);
  socket.on("data", (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4) {
      const packetLength = pending.readUInt32BE(0);
      if (packetLength < 8 || pending.length < packetLength) return;
      const packet = pending.subarray(0, packetLength);
      pending = pending.subarray(packetLength);
      // PostgreSQL SSLRequest. The E2E URL disables SSL, but handle this for
      // clients that still negotiate before sending their StartupMessage.
      if (packetLength === 8 && packet.readUInt32BE(4) === 80_877_103) {
        socket.write("N");
        continue;
      }
      socket.end(fatalAuthenticationResponse());
      return;
    }
  });
}

function listenLoopback(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Authentication-rejecting PostgreSQL server has no TCP address"));
        return;
      }
      resolve(address.port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, LOOPBACK_HOST);
  });
}

/** A deterministic 28P01 peer used to prove production supervision still fails closed. */
export async function startRejectingE2EPostgresAuthentication(): Promise<E2EPostgresRuntime> {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    rejectPostgresStartup(socket);
  });
  const port = await listenLoopback(server);
  let closed = false;
  return {
    environment: postgresEnvironment(port),
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (closed) {
          resolve();
          return;
        }
        closed = true;
        for (const socket of sockets) socket.destroy();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
