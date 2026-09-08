import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import {
  connectUpgrade,
  startNextUpgradeFixture,
} from "../helpers/next-upgrade-runtime-fixture.js";

function generatedServer(mode: "monorepo" | "single"): string {
  const files = generateProjectFiles(
    projectConfigSchema.parse({
      name: "next-upgrade",
      mode,
      runtime: "bun",
      framework: "nextjs",
      database: "postgres",
      preset: "custom",
      apps: ["web"],
      auth: true,
      api: true,
      messaging: true,
      billing: [],
      features: [],
      cache: "none",
      deploy: "none",
    }),
    { dryRun: true },
  );
  const path = mode === "monorepo" ? "apps/web/server.ts" : "next-server.ts";
  const source = files.find((file) => file.path === path)?.content;
  if (!source) throw new Error(`Missing ${path}`);
  return source;
}

describe("generated Next upgrade ownership", () => {
  for (const runtime of ["node", "bun"] as const) {
    test(`${runtime} admits the application upgrade before any HTTP warmup`, async () => {
      const fixture = await startNextUpgradeFixture(generatedServer("single"), runtime, false);
      const first = connectUpgrade(fixture.port);
      try {
        expect(await first.sendUpgrade("/api/ws")).toBe(401);
      } finally {
        first.socket.destroy();
        await fixture.close();
      }
    }, 15_000);

    for (const development of [false, true]) {
      test(`${runtime}/${development ? "development" : "production"} preserves the selected application and framework upgrade owners`, async () => {
        const source = generatedServer(runtime === "node" ? "single" : "monorepo");
        const fixture = await startNextUpgradeFixture(source, runtime, development);
        const connections: ReturnType<typeof connectUpgrade>[] = [];
        const connection = () => {
          const value = connectUpgrade(fixture.port);
          connections.push(value);
          return value;
        };
        try {
          const keepalive = connection();
          keepalive.socket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${fixture.port}\r\n\r\n`);
          expect(await keepalive.response()).toBe(200);
          const anonymous = connection();
          expect(await anonymous.sendUpgrade("/api/ws")).toBe(401);
          const application = connection();
          expect(await application.sendUpgrade("/api/ws?client=probe", true)).toBe(101);
          if (!development) {
            const retired = connection();
            const unknown = connection();
            expect(
              await Promise.all([
                retired.sendUpgrade("/api/realtime"),
                unknown.sendUpgrade("/unclaimed/path"),
                keepalive.sendUpgrade("/unclaimed/keepalive"),
              ]),
            ).toEqual([404, 404, 404]);
          }
          const hmr = connection();
          const hmrStatus = await hmr.sendUpgrade("/install-prefix/_next/hmr?id=native-probe");
          expect(hmrStatus).toBe(development ? 101 : 404);
          if (development) {
            await new Promise((resolve) => setTimeout(resolve, 5_250));
            expect(application.socket.destroyed).toBe(false);
            expect(hmr.socket.destroyed).toBe(false);
            const reset = connection();
            await expect(reset.sendUpgrade("/early-error")).rejects.toThrow(
              "Socket closed before an upgrade response",
            );
            expect(await connection().sendUpgrade("/api/ws")).toBe(401);
          }
        } finally {
          for (const client of connections) client.socket.destroy();
          await fixture.close();
        }
      }, 20_000);
    }
  }
});
