import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { z } from "zod";

const contract = oc.prefix("/api").router({
  greet: oc
    .route({ method: "POST", path: "/greet" })
    .input(z.object({ names: z.array(z.string()).min(1) }))
    .output(z.object({ greetings: z.array(z.string()) })),
});

const implemented = implement(contract);
const router = implemented.router({
  greet: implemented.greet.handler(({ input }) => ({
    greetings: input.names.map((n) => `Hello ${n}`),
  })),
});

const sym = Object.getOwnPropertySymbols(router);
console.log(
  "symbol props",
  sym.map((s) => s.toString()),
);

const handler = new RPCHandler(router);
const matcher = handler.standardHandler.matcher;
console.log("tree keys", Object.keys(matcher.tree));
