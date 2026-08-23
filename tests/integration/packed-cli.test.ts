import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

test("the exact npm tarball contains types and runs when installed", () => {
  const temp = mkdtempSync(join(tmpdir(), "ghostinit-pack-"));
  try {
    execFileSync("bun", ["run", "build"], { cwd: root, stdio: "pipe", shell: false });
    const npmArgs = ["pack", "--json", "--pack-destination", temp];
    const packJson =
      process.platform === "win32"
        ? execFileSync(
            process.env.ComSpec ?? "cmd.exe",
            ["/d", "/s", "/c", `npm pack --json --pack-destination ${temp}`],
            { cwd: root, encoding: "utf8", shell: false },
          )
        : execFileSync("npm", npmArgs, { cwd: root, encoding: "utf8", shell: false });
    const [{ filename, files }] = JSON.parse(packJson) as Array<{
      filename: string;
      files: Array<{ path: string }>;
    }>;
    expect(files.map(({ path }) => path)).toContain("dist/cli.d.ts");
    expect(files.map(({ path }) => path)).toContain("dist/cli.js");

    writeFileSync(
      join(temp, "package.json"),
      JSON.stringify({ name: "consumer", private: true, type: "module" }),
    );
    execFileSync(
      "bun",
      ["add", "--exact", join(temp, filename), "typescript@7.0.2", "@types/bun@1.4.0"],
      { cwd: temp, stdio: "pipe", shell: false },
    );

    const installedPackage = JSON.parse(
      readFileSync(join(temp, "node_modules", "ghostinit", "package.json"), "utf8"),
    ) as { types: string; exports: { ".": { types: string; default: string } } };
    expect(installedPackage.types).toBe("dist/cli.d.ts");
    expect(installedPackage.exports["."].types).toBe("./dist/cli.d.ts");
    expect(installedPackage.exports["."].default).toBe("./dist/cli.js");
    expect(
      readFileSync(join(temp, "node_modules", "ghostinit", "src", "cli.ts"), "utf8").split(
        /\r?\n/,
        1,
      )[0],
    ).toBe("#!/usr/bin/env bun");

    writeFileSync(join(temp, "index.ts"), 'import { main } from "ghostinit";\nvoid main;\n');
    writeFileSync(
      join(temp, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2024",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          types: ["bun"],
        },
        include: ["index.ts"],
      }),
    );
    expect(
      execFileSync("bunx", ["--no-install", "tsc", "--version"], {
        cwd: temp,
        encoding: "utf8",
        shell: false,
      }).trim(),
    ).toBe("Version 7.0.2");
    execFileSync("bunx", ["--no-install", "tsc", "--noEmit"], {
      cwd: temp,
      stdio: "pipe",
      shell: false,
    });

    const bin = [
      join(temp, "node_modules", ".bin", "ghostinit.exe"),
      join(temp, "node_modules", ".bin", "ghostinit.cmd"),
      join(temp, "node_modules", ".bin", "ghostinit"),
    ].find(existsSync);
    expect(bin).toBeDefined();
    const version =
      process.platform === "win32" && bin!.endsWith(".cmd")
        ? execFileSync(
            process.env.ComSpec ?? "cmd.exe",
            ["/d", "/s", "/c", `call "${bin}" --version`],
            {
              cwd: temp,
              encoding: "utf8",
              shell: false,
            },
          ).trim()
        : execFileSync(bin!, ["--version"], {
            cwd: temp,
            encoding: "utf8",
            shell: false,
          }).trim();
    expect(version).toMatch(/^ghostinit \d+\.\d+\.\d+$/);
    expect(readdirSync(temp)).toContain(filename);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}, 100_000);
