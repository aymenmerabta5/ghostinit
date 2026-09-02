import { describe, expect, test } from "bun:test";
import {
  listPosixProcessGroupMembers,
  PosixProcessGroupError,
  sendPosixProcessGroupSignal,
} from "../../src/lib/posix-process-groups.js";
import { startPostgresJobsSupervisorContent } from "../../src/templates/adapters/jobs/scripts.js";
import { productionProcessSupervisorContent } from "../../src/templates/root/process-supervisor.js";
import { posixProcessGroupHelpersContent } from "../../src/templates/shared/posix-process-groups.js";

function errno(code: string): Error & { code: string } {
  return Object.assign(new Error(`injected ${code}`), { code });
}

type SignalGroup = (groupPid: number, signal: NodeJS.Signals) => boolean;
type GroupExists = (groupPid: number) => boolean;

function generatedProcessGroupProtocol(
  signal: (target: number, signal: NodeJS.Signals) => unknown,
  inspect: () => unknown = () => ({ error: null, status: 0, signal: null, stdout: "" }),
): { readonly exists: GroupExists; readonly signal: SignalGroup } {
  const source = posixProcessGroupHelpersContent({
    label: "Injected",
    inspectionTimeoutExpression: "5_000",
  });
  return new Function(
    "process",
    "spawnSync",
    `${source}\nreturn { exists: processGroupExists, signal: signalProcessGroup };`,
  )({ platform: "darwin", env: {}, kill: signal }, inspect) as {
    readonly exists: GroupExists;
    readonly signal: SignalGroup;
  };
}

describe("fail-closed POSIX process groups", () => {
  test("discovers Linux group members from /proc stat without signaling", () => {
    const members = listPosixProcessGroupMembers(41, {
      platform: "linux",
      linuxProcessStats: () => [
        "41 (bun) S 1 41 41 0 -1 0",
        "42 (worker with spaces) S 41 41 41 0 -1 0",
        "43 (other) S 1 43 43 0 -1 0",
      ],
    });

    expect(members).toEqual([41, 42]);
  });

  test("discovers macOS group members from a strict ps PID/PGID table", () => {
    const members = listPosixProcessGroupMembers(71, {
      platform: "darwin",
      psProcessTable: () => "  71   71\n  72   71\n  73   73\n",
    });

    expect(members).toEqual([71, 72]);
    expect(() =>
      listPosixProcessGroupMembers(71, {
        platform: "darwin",
        psProcessTable: () => "PID PGID\n",
      }),
    ).toThrow("malformed");
  });

  test("accepts only ESRCH as an atomic group-signal disappearance race", () => {
    const targets: number[] = [];
    expect(
      sendPosixProcessGroupSignal(91, "SIGTERM", {
        signal: (target) => {
          targets.push(target);
          throw errno("ESRCH");
        },
      }),
    ).toBe("missing");
    expect(targets).toEqual([-91]);

    expect(() =>
      sendPosixProcessGroupSignal(91, "SIGKILL", {
        signal: () => {
          throw errno("EPERM");
        },
      }),
    ).toThrow("EPERM");
  });

  test("never converts an EPERM process-table failure into group absence", () => {
    let caught: unknown;
    try {
      listPosixProcessGroupMembers(101, {
        platform: "linux",
        linuxProcessStats: () => {
          throw errno("EPERM");
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PosixProcessGroupError);
    expect((caught as PosixProcessGroupError).code).toBe("EPERM");
  });

  test("generated supervisors share ESRCH/EPERM semantics and avoid signal-0 probes", () => {
    expect(
      generatedProcessGroupProtocol(() => {
        throw errno("ESRCH");
      }).signal(111, "SIGTERM"),
    ).toBe(false);
    expect(() =>
      generatedProcessGroupProtocol(() => {
        throw errno("EPERM");
      }).signal(111, "SIGKILL"),
    ).toThrow("EPERM");
    expect(
      generatedProcessGroupProtocol(
        () => undefined,
        () => ({
          error: null,
          status: 0,
          signal: null,
          stdout: " 111 111\n",
        }),
      ).exists(111),
    ).toBe(true);
    expect(() =>
      generatedProcessGroupProtocol(
        () => undefined,
        () => ({
          error: errno("EPERM"),
          status: null,
          signal: null,
          stdout: "",
          stderr: "",
        }),
      ).exists(111),
    ).toThrow("EPERM");

    for (const source of [
      startPostgresJobsSupervisorContent("single"),
      productionProcessSupervisorContent(["start"]),
    ]) {
      expect(source).toContain('spawnSync("/bin/ps", ["-A", "-o", "pid=", "-o", "pgid="]');
      expect(source).toContain("process.kill(-groupPid, signal)");
      expect(source).not.toMatch(/process\.kill\([^,]+,\s*0\)/);
    }
  });
});
