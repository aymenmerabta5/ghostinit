import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { z } from "zod";

// GhostInit templates use `os.prefix` then `implement(contract).router(...)`.
// Verify that v1.14 contract prefix and implement().router compose correctly.
const contract = oc.prefix("/api").router({
  greet: oc
    .route({ method: "POST", path: "/greet" }) // explicit path required for prefix to apply
    .input(z.object({ names: z.array(z.string()).min(1) }))
    .output(z.object({ greetings: z.array(z.string()) })),
});

const impl = implement(contract);

const router = impl.router({
  greet: impl.greet.handler(({ input }) => ({
    greetings: input.names.map((n) => `Hello ${n}`),
  })),
});

const handler = new RPCHandler(router);

async function run() {
  console.log(
    "ORPCError construct",
    (() => {
      try {
        const e = new ORPCError("NOT_FOUND", { message: "missing" });
        return e.code === "NOT_FOUND" && e.message === "missing";
      } catch {
        return false;
      }
    })(),
  );

  const spec = await new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  }).generate(router, {
    info: { title: "Fixture API", version: "1.0.0" },
    servers: [{ url: "http://localhost:3000/api" }],
  });
  console.log("OpenAPI paths", Object.keys((spec as any).paths ?? {}));

  console.log(
    "Matcher tree keys",
    Object.keys((handler as any).standardHandler.matcher.tree ?? {}),
  );

  const res = await handler.handle(
    new Request("http://localhost:3000/api/greet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ names: ["World"] }),
    }),
  );
  console.log("POST /api/greet matched", res.matched, "status", res.response?.status);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
