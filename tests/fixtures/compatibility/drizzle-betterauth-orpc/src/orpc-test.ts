import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { appRouter } from "./orpc.js";

const handler = new RPCHandler(appRouter);
const link = new RPCLink({
  url: "http://fixture.local/api/orpc",
  async fetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    const result = await handler.handle(request, { prefix: "/api/orpc" });
    return result.response ?? new Response("Not found", { status: 404 });
  },
});
const client: RouterClient<typeof appRouter> = createORPCClient(link);
const hello = await client.hello({ name: "GhostInit" });
const toggle = await client.toggle({ enabled: false });
if (hello.message !== "Hello, GhostInit!") throw new Error("Typed oRPC client returned a bad greeting");
if (toggle.enabled !== false) throw new Error("Typed oRPC client returned a bad toggle value");

console.log("PASS: typed oRPC client and fetch handler round-trip");
