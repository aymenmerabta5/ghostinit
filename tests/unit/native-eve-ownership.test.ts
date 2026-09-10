import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { deferred } from "../helpers/generated-form-harness.js";

interface Session {
  sessionId: string;
  nextIndex: number;
}
interface Result {
  message: string;
  session: Session;
}
interface InvokeOptions {
  signal: AbortSignal;
  onText(text: string): void;
}

function fixture(app: "mobile" | "desktop") {
  const files = generateProjectFiles(
    projectConfigSchema.parse({
      name: "eve-owner",
      runtime: "bun",
      mode: "monorepo",
      framework: "nextjs",
      database: "postgres",
      preset: "custom",
      apps: ["web", app],
      auth: true,
      api: true,
      email: false,
      eve: true,
      billing: [],
      features: [],
    }),
  );
  const root = `apps/${app}/src/${app === "desktop" ? "renderer/" : ""}features/agent`;
  const source = ["model.ts", "use-agent-conversation.ts"]
    .map((name) => {
      const file = files.find(({ path }) => path === `${root}/${name}`);
      if (!file) throw new Error("Missing native Eve conversation source");
      return file.content;
    })
    .join("\n");
  const events: unknown[] = [];
  const calls: { message: string; previous: Session | null; options: InvokeOptions }[] = [];
  const cleanups: (() => void)[] = [];
  const results: ReturnType<typeof deferred<Result>>[] = [];
  let current = true;
  const bindings = {
    useRef: (value: unknown) => ({ current: value }),
    useReducer: (_reducer: unknown, initial: unknown) => [
      initial,
      (event: unknown) => events.push(event),
    ],
    useEffect: (effect: () => () => void) => {
      cleanups.push(effect());
    },
    useAuthOwnedMutation: (
      operation: (message: string, isCurrent: () => boolean) => Promise<void>,
    ) => ({
      run: (message: string) => operation(message, () => current),
      isPending: false,
      error: null,
    }),
    invokeAgent: (message: string, previous: Session | null, options: InvokeOptions) => {
      calls.push({ message, previous, options });
      const result = deferred<Result>();
      results.push(result);
      return result.promise;
    },
  };
  const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.replace(/^import[^;]+;\s*/gm, "").replace(/^export /gm, ""),
  );
  const useConversation = new Function(
    ...Object.keys(bindings),
    executable + "\nreturn useAgentConversation;",
  )(...Object.values(bindings)) as (
    waiting: string,
    error: string,
  ) => { send(message: string): Promise<void> };
  const conversation = useConversation("waiting", "failed");
  return {
    conversation,
    events,
    calls,
    results,
    retire: () => {
      current = false;
    },
    unmount: () => cleanups.forEach((cleanup) => cleanup()),
  };
}

describe("native Eve conversation ownership", () => {
  for (const app of ["mobile", "desktop"] as const) {
    test(`${app} aborts its active stream and suppresses later chunks on unmount`, async () => {
      const subject = fixture(app);
      const pending = subject.conversation.send("hello");
      subject.calls[0]!.options.onText("first chunk");
      const before = subject.events.length;
      subject.unmount();
      expect(subject.calls[0]!.options.signal.aborted).toBe(true);
      subject.calls[0]!.options.onText("obsolete chunk");
      subject.results[0]!.resolve({ message: "", session: { sessionId: "old", nextIndex: 7 } });
      await pending;
      expect(subject.events).toHaveLength(before);
    });

    test(`${app} advances only its confirmed owned session cursor`, async () => {
      const subject = fixture(app);
      const first = subject.conversation.send("first");
      expect(subject.calls[0]!.previous).toBeNull();
      const cursor = { sessionId: "same-session", nextIndex: 4 };
      subject.results[0]!.resolve({ message: "ready", session: cursor });
      await first;
      const second = subject.conversation.send("continue");
      expect(subject.calls[1]!.previous).toEqual(cursor);
      const before = subject.events.length;
      subject.retire();
      subject.calls[1]!.options.onText("another account's completion");
      subject.results[1]!.resolve({ message: "", session: { sessionId: "other", nextIndex: 9 } });
      await second;
      expect(subject.events).toHaveLength(before);
      subject.unmount();
    });
  }
});
