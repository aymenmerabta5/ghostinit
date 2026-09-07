import { file, type TemplateFile } from "../shared.js";
import { convexMessagingPublicContent } from "./convex-public.js";
import { convexMessagingInternalContent } from "./convex-internal.js";
import { convexMessagingServerContent } from "./convex-server.js";

export function convexMessagingDatabaseFiles(): TemplateFile[] {
  return [
    file("convex/messaging.ts", convexMessagingPublicContent()),
    file("convex/messagingInternal.ts", convexMessagingInternalContent()),
    file("convex/messagingServer.ts", convexMessagingServerContent()),
  ];
}
