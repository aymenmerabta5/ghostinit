import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  packagedDesktopExecutableCandidates,
  packagedDesktopLaunchCommand,
} from "../integration/e2e-build-process.js";
import { desktopElectronBuilderYmlContent } from "../../src/templates/apps/desktop/tooling.js";

describe("packaged Electron executable resolution", () => {
  const desktopRoot = join("D:", "generated", "apps", "desktop");

  test("targets unpacked application executables on every supported host", () => {
    expect(packagedDesktopExecutableCandidates(desktopRoot, "demo-app", "win32")).toContain(
      join(desktopRoot, "out", "win-unpacked", "demo-app.exe"),
    );
    expect(packagedDesktopExecutableCandidates(desktopRoot, "demo-app", "linux")).toContain(
      join(desktopRoot, "out", "linux-unpacked", "demo-app"),
    );
    expect(packagedDesktopExecutableCandidates(desktopRoot, "demo-app", "darwin")).toContain(
      join(desktopRoot, "out", "mac", "demo-app.app", "Contents", "MacOS", "demo-app"),
    );
  });

  test("pins the Linux executable name to the portable project name", () => {
    expect(desktopElectronBuilderYmlContent("demo-app")).toContain(
      "linux:\n  target: AppImage\n  executableName: demo-app",
    );
  });

  test("rejects unsafe product names and unsupported hosts", () => {
    expect(() => packagedDesktopExecutableCandidates(desktopRoot, "../demo", "win32")).toThrow(
      "safe desktop product name",
    );
    expect(() => packagedDesktopExecutableCandidates(desktopRoot, "demo", "aix")).toThrow(
      "Unsupported Electron launch platform",
    );
  });

  test("uses Xvfb only on Linux and isolates Electron user data", () => {
    const executable = join(desktopRoot, "out", "linux-unpacked", "demo-app");
    const userData = join(desktopRoot, ".smoke-user-data");
    expect(packagedDesktopLaunchCommand(executable, userData, "linux")).toEqual({
      command: "xvfb-run",
      args: [
        "-a",
        executable,
        "--no-sandbox",
        `--user-data-dir=${userData}`,
        "--ghostinit-startup-smoke",
      ],
    });
    for (const platform of ["win32", "darwin"] as const) {
      const command = packagedDesktopLaunchCommand(executable, userData, platform);
      expect(command.command, platform).toBe(executable);
      expect(command.args, platform).toEqual([
        `--user-data-dir=${userData}`,
        "--ghostinit-startup-smoke",
      ]);
      expect(command.args, platform).not.toContain("--headless");
    }
  });
});
