import { oc } from "@orpc/contract";
import { implement, os, type RouterClient } from "@orpc/server";
import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { z } from "zod";

const helloContract = oc
  .route({ method: "GET", path: "/hello" })
  .input(z.object({ name: z.string() }))
  .output(z.object({ message: z.string() }));

const toggleContract = oc
  .route({ method: "POST", path: "/toggle" })
  .input(z.object({ enabled: z.boolean() }))
  .output(z.object({ enabled: z.boolean() }));

export const appContract = {
  hello: helloContract,
  toggle: toggleContract,
};

const implementer = implement(appContract);

export const appRouter = os.prefix("/api").router(
  implementer.router({
    hello: implementer.hello.handler(({ input }) => {
      return { message: `Hello, ${input.name}!` };
    }),
    toggle: implementer.toggle.handler(({ input }) => {
      return { enabled: input.enabled };
    }),
  }),
);

const link = new RPCLink({
  url: "http://localhost:3000/api/orpc",
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const client: RouterClient<typeof appRouter> = createORPCClient(link);

export async function generateOpenAPI(): Promise<unknown> {
  const generator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  });

  const spec = await generator.generate(appRouter, {
    info: {
      title: "Fixture API",
      version: "1.0.0",
    },
    servers: [{ url: "/" }],
  });

  return spec;
}
