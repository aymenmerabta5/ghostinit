import { nativeMessagingCommandFiles } from "../../src/templates/apps/fragments/messaging/native-command-gate.js";
import { generatedFormHarness } from "./generated-form-harness.js";

export function messagingCommandHarness() {
  const files = nativeMessagingCommandFiles("features/messaging", "@");
  const source = (name: string) => files.find((file) => file.path.endsWith(`/${name}.ts`))!.content;
  const runtime = generatedFormHarness(source("use-messaging-command-scope"), [
    "createMessagingCommandScope",
  ]);
  const scope = runtime.render("createMessagingCommandScope") as {
    activate(): () => void;
    getSnapshot(): { isPending: boolean; error: Error | null };
  };
  const retire = scope.activate();
  const signatureModule = generatedFormHarness(source("command-types"), ["messagingSendSignature"]);
  return {
    scope,
    retire,
    signature: signatureModule.module.messagingSendSignature as (input: {
      conversationId: string;
      body: string;
      clientMessageKey: string;
      attachment?: unknown;
    }) => string | readonly unknown[],
    wrapperSource: `${source("command-types")}\n${source("use-messaging-command-mutation")}`,
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  };
}
