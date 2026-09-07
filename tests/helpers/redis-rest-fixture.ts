type RedisAtom = string | number | boolean | null;
export type RedisFixtureCommand = RedisAtom[];
type RedisResult = string | number | null | RedisResult[];

function isCommand(value: unknown): value is RedisFixtureCommand {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        item === null ||
        typeof item === "string" ||
        typeof item === "boolean" ||
        (typeof item === "number" && Number.isFinite(item)),
    )
  );
}

/**
 * Local wire-contract fixture, not Redis or an Upstash service. It models only
 * GET/SET/DEL/SCAN and EX expiry used by the generated cache. The actual pinned
 * SDK owns command serialization, auto-pipelining and result decoding.
 */
export function startRedisRestFixture() {
  const values = new Map<string, { value: string; expiresAt: number | null }>();
  const scans = new Map<string, string[]>();
  const commands: RedisFixtureCommand[] = [];
  let nextCursor = 1;
  let requests = 0;

  const current = (key: string) => {
    const entry = values.get(key);
    if (entry && entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      values.delete(key);
      return undefined;
    }
    return entry;
  };

  function execute(command: RedisFixtureCommand): RedisResult {
    commands.push(command);
    const name = String(command[0]).toUpperCase();
    if (name === "GET") return current(String(command[1]))?.value ?? null;
    if (name === "SET") {
      if (values.size >= 256) throw new Error("Fixture key limit exceeded");
      const ttl = String(command[3]).toUpperCase() === "EX" ? Number(command[4]) : null;
      if (ttl !== null && (!Number.isSafeInteger(ttl) || ttl <= 0))
        throw new Error("Invalid EX expiry");
      values.set(String(command[1]), {
        value: String(command[2]),
        expiresAt: ttl === null ? null : Date.now() + ttl * 1000,
      });
      return "OK";
    }
    if (name === "DEL") {
      let deleted = 0;
      for (const key of command.slice(1)) if (values.delete(String(key))) deleted += 1;
      return deleted;
    }
    if (name === "SCAN") {
      const cursor = String(command[1]);
      let remaining: string[];
      if (cursor === "0") {
        const match = command.findIndex((atom) => String(atom).toUpperCase() === "MATCH");
        const pattern = String(command[match + 1]);
        if (match < 0 || !pattern.endsWith("*") || pattern.slice(0, -1).includes("*")) {
          throw new Error("Fixture requires a literal prefix wildcard");
        }
        remaining = [...values.keys()]
          .filter((key) => current(key) && key.startsWith(pattern.slice(0, -1)))
          .sort();
      } else {
        const captured = scans.get(cursor);
        if (!captured) throw new Error("Unknown fixture SCAN cursor");
        remaining = captured;
        scans.delete(cursor);
      }
      const page = remaining.slice(0, 2);
      const rest = remaining.slice(2);
      if (rest.length === 0) return ["0", page];
      if (scans.size >= 32) throw new Error("Fixture cursor limit exceeded");
      const following = String(nextCursor++);
      scans.set(following, rest);
      return [following, page];
    }
    throw new Error("Unsupported fixture command");
  }

  function encode(value: RedisResult): RedisResult {
    if (typeof value === "string") return Buffer.from(value).toString("base64");
    if (Array.isArray(value)) return value.map(encode);
    return value;
  }

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 2,
    maxRequestBodySize: 64 * 1024,
    async fetch(request) {
      if (++requests > 256)
        return Response.json({ error: "Fixture request limit exceeded" }, { status: 429 });
      if (
        request.method !== "POST" ||
        request.headers.get("authorization") !== "Bearer fixture-only-token"
      ) {
        return Response.json({ error: "Unauthorized fixture request" }, { status: 401 });
      }
      try {
        const body: unknown = await request.json();
        const pipeline = new URL(request.url).pathname === "/pipeline";
        const batch = pipeline && Array.isArray(body) ? body : [body];
        if (batch.length > 32 || !batch.every(isCommand))
          throw new Error("Invalid fixture request");
        const result = batch.map((command) => {
          const value = execute(command);
          return {
            result: request.headers.get("upstash-encoding") === "base64" ? encode(value) : value,
          };
        });
        return Response.json(pipeline ? result : result[0]);
      } catch {
        return Response.json({ error: "Redis REST fixture rejected the command" }, { status: 400 });
      }
    },
  });
  return { server, commands, url: `http://127.0.0.1:${server.port}` };
}
