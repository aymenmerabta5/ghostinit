import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { RPCLink } from "@orpc/client/fetch";
import { z } from "zod";

const contract = oc
  .prefix("/api")
  .route({ method: "POST", path: "/greet" })
  .input(z.object({ names: z.array(z.string()).min(1) }))
  .output(z.object({ greetings: z.array(z.string()) }));

const impl = implement(contract);

const router = impl.router({
  greet: impl.greet.handler(({ input }) => ({
    greetings: input.names.map((n) => `Hello ${n}`),
  })),
});

const handler = new RPCHandler(router);

async function run() {
  // Test ORPCError construction (v1.14 API: constructor(code, options))
  let threw = false;
  try {
    throw new ORPCError("NOT_FOUND", { message: "missing" });
  } catch (e: any) {
    if (e.code === "NOT_FOUND" && e.message === "missing") threw = true;
  }
  console.log("ORPCError construct", threw);

  // Test OpenAPI generator
  const spec = await new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  }).generate(router, {
    info: { title: "Fixture API", version: "1.0.0" },
    servers: [{ url: "http://localhost:3000/api" }],
  });
  console.log("OpenAPI paths", Object.keys((spec as any).paths ?? {}));

  // Test RPCHandler route matching
  const res = await handler.handle(
    new Request("http://localhost:3000/api/greet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ names: ["World"] }),
    }),
  );
  console.log("RPCHandler matched", res.matched, "status", res.response?.status);
  if (res.response) {
    const bodyClone = res.response.clone();
    console.log("RPCHandler body preview", (await bodyClone.text()).slice(0, 200));
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
