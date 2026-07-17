import { appRouter } from "./orpc";
import { RPCHandler } from "@orpc/server/fetch";

const handler = new RPCHandler(appRouter);
for (const path of ["/hello", "/toggle", "/api/orpc/hello"]) {
  for (const method of ["GET", "POST"]) {
    const req = new Request("http://localhost:3000" + path, { method });
    const res = await handler.handle(req);
    console.log(method, path, "matched", res.matched, "status", res.response?.status ?? "none");
  }
}
