import { file, type TemplateFile } from "../shared.js";

export function eveTsconfig(): TemplateFile {
  return file(
    "apps/eve/tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2024",
          module: "ESNext",
          moduleResolution: "bundler",
          lib: ["ES2024"],
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
          types: ["node"],
          paths: {
            "#*": ["./agent/*"],
            "#evals/*": ["./evals/*"],
            "@repo/*": ["../../packages/*/src"],
          },
          outDir: "./dist",
          rootDir: ".",
        },
        include: ["agent/**/*", "lib/**/*"],
        exclude: ["node_modules", "dist", ".eve"],
      },
      null,
      2,
    ) + "\n",
  );
}

export function eveGitignore(): TemplateFile {
  return file("apps/eve/.gitignore", `node_modules\n.eve\ndist\n.env\n.env.local\n*.log\n`);
}
export function eveVercelIgnore(): TemplateFile {
  return file("apps/eve/.vercelignore", `node_modules\n.eve\n`);
}
export function eveReadme(projectName: string): TemplateFile {
  return file(
    "apps/eve/README.md",
    `# ${projectName} — Eve Durable Agent
Uses eve@0.24.6 filesystem-first durable backend agents.
Agent directory: agent/agent.ts + instructions.md + tools/ + skills/ + channels/ + schedules/ + subagents/
Quick start: cd apps/eve && bun install && npx eve dev
Docs: node_modules/eve/docs/README.md
`,
  );
}
