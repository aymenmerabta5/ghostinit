import { parseSync } from "oxc-parser";

export interface RenderedAdapterFile {
  path: string;
  content: string;
}

export function adapterFilesByPath(
  files: ReadonlyArray<RenderedAdapterFile>,
): ReadonlyMap<string, string> {
  return new Map(files.map((entry) => [entry.path, entry.content]));
}

export function adapterSource(files: ReadonlyArray<RenderedAdapterFile>): string {
  return files.map((entry) => `// ${entry.path}\n${entry.content}`).join("\n");
}

export function syntaxFailures(files: ReadonlyArray<RenderedAdapterFile>): string[] {
  const failures: string[] = [];
  for (const entry of files) {
    const parsed = parseSync(entry.path, entry.content);
    for (const error of parsed.errors) {
      failures.push(`${entry.path}: ${error.message}`);
    }

    try {
      const loader = entry.path.endsWith(".tsx") ? "tsx" : "ts";
      new Bun.Transpiler({ loader }).transformSync(entry.content);
    } catch (error) {
      failures.push(
        `${entry.path}: Bun parser: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return failures;
}

export function countMatches(source: string, pattern: RegExp): number {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return Array.from(source.matchAll(new RegExp(pattern.source, flags))).length;
}

export type AtomicAdminRole = "admin" | "user";

export interface AtomicAdminState {
  users: Array<{ id: string; role: AtomicAdminRole; banned: boolean }>;
  audits: Array<{
    action: "admin.user.role_changed";
    actorId: string;
    targetId: string;
    previousRole: AtomicAdminRole;
    role: AtomicAdminRole;
  }>;
}

function adminFailure(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

/** Models the adapter's serializable mutation boundary, not a database implementation. */
export function createAtomicAdminHarness() {
  let state: AtomicAdminState = {
    users: [
      { id: "admin-a", role: "admin", banned: false },
      { id: "admin-b", role: "admin", banned: false },
    ],
    audits: [],
  };
  let transactionTail = Promise.resolve();
  let failAudit = false;

  async function serializable<T>(work: () => Promise<T>): Promise<T> {
    const previous = transactionTail;
    let release = () => {};
    transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const before = structuredClone(state);
    try {
      return await work();
    } catch (error) {
      state = before;
      throw error;
    } finally {
      release();
    }
  }

  return {
    async changeRole(actorId: string, targetId: string, role: AtomicAdminRole) {
      return await serializable(async () => {
        const actor = state.users.find((user) => user.id === actorId);
        if (!actor || actor.role !== "admin" || actor.banned) {
          throw adminFailure("ADMIN_FORBIDDEN", "A current administrator is required");
        }
        const target = state.users.find((user) => user.id === targetId);
        if (!target) throw adminFailure("ADMIN_USER_NOT_FOUND", "User not found");
        if (actor.id === target.id && role !== "admin") {
          throw adminFailure("ADMIN_SELF_ACTION", "Administrators cannot demote themselves");
        }
        if (
          target.role === "admin" &&
          role !== "admin" &&
          state.users.filter((user) => user.role === "admin").length <= 1
        ) {
          throw adminFailure("ADMIN_LAST_ADMIN", "The final administrator cannot be demoted");
        }
        if (target.role === role) return { id: target.id, role, changed: false };

        const previousRole = target.role;
        await Promise.resolve();
        target.role = role;
        if (failAudit) {
          throw adminFailure("ADMIN_AUDIT_FAILED", "The mandatory audit write failed");
        }
        state.audits.push({
          action: "admin.user.role_changed",
          actorId: actor.id,
          targetId: target.id,
          previousRole,
          role,
        });
        return { id: target.id, role, changed: true };
      });
    },
    state: () => state,
    setAuditFailure(value: boolean) {
      failAudit = value;
    },
  };
}
