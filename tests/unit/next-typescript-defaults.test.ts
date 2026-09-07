import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { singleTsConfigContent } from "../../src/templates/modes/single/core/next-config.js";
import { tsConfigFiles } from "../../src/templates/packages/typescript-config.js";

const nativeOptions = {
  allowJs: true,
  noEmit: true,
  isolatedModules: true,
  jsx: "react-jsx",
  plugins: [{ name: "next" }],
};
const nextTypes = [".next/types/**/*.ts", ".next/dev/types/**/*.ts"];

describe("native Next TypeScript defaults", () => {
  test("single Next is complete before Next can rewrite its generator-owned config", () => {
    const config = JSON.parse(singleTsConfigContent());
    expect(config.compilerOptions).toMatchObject(nativeOptions);
    expect(config.include).toEqual(expect.arrayContaining(nextTypes));
    expect(config.exclude).toContain(".ghostinit");
    expect(config.exclude).not.toContain(".next");
  });

  test("both Next preset renderers agree and generated dev types remain included", () => {
    const direct = JSON.parse(
      tsConfigFiles().find(({ path }) => path.endsWith("/nextjs.json"))!.content,
    );
    const resolution = resolveCreateConfig({
      name: "native-next-config",
      mode: "monorepo",
      framework: "nextjs",
      runtime: "bun",
      apps: ["web"],
      preset: "frontend",
      database: "none",
      databaseWasExplicit: true,
      billing: [],
      features: [],
    });
    if (!resolution.ok) throw new Error(resolution.message);
    const plan = buildProjectGenerationPlan(resolution.resolvedConfig);
    const preset = JSON.parse(
      plan.files.find(
        ({ physicalPath }) => physicalPath === "packages/typescript-config/nextjs.json",
      )!.content,
    );
    const app = JSON.parse(
      plan.files.find(({ physicalPath }) => physicalPath === "apps/web/tsconfig.json")!.content,
    );
    expect(direct.compilerOptions).toMatchObject(nativeOptions);
    expect(preset.compilerOptions).toMatchObject(nativeOptions);
    expect(app.include).toEqual(expect.arrayContaining(nextTypes));
    expect(app.exclude).not.toContain(".next");
    expect(app.exclude).toContain(".ghostinit");
  });

  test("Next defaults do not enter shared, TanStack, or React-library compiler policy", () => {
    for (const file of tsConfigFiles().filter(({ path }) =>
      /\/(base|tanstack|react-library)\.json$/.test(path),
    )) {
      const options = JSON.parse(file.content).compilerOptions;
      expect(options.allowJs, file.path).toBeUndefined();
      expect(options.isolatedModules, file.path).toBeUndefined();
      expect(options.plugins, file.path).toBeUndefined();
    }
  });
});
