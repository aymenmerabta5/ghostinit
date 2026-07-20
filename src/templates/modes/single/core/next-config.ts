import { SECURITY_HEADERS, REWRITES } from "../config.js";

export function singleNextConfigContent(hasEve: boolean): string {
  if (hasEve) {
    return [
      "import type { NextConfig } from 'next';",
      "import { withEve } from 'eve/next';",
      "",
      "const config: NextConfig = {",
      SECURITY_HEADERS,
      REWRITES,
      "};",
      "",
      '// Eve hybrid for single mode: agent/ inside Next root mounted same-origin via withEve({ eveRoot: "./agent" })',
      "// Single dev server, single deploy, zero CORS, cookie auth flows Better Auth",
      "const nextConfig = withEve(config, {",
      '  eveRoot: "./agent",',
      "});",
      "",
      "// Fix: withEve may add experimental.turbo which is invalid in Next 16 (Unrecognized key(s) in object: 'turbo' at experimental)",
      "if ((nextConfig as unknown as { experimental?: { turbo?: unknown } }).experimental?.turbo) {",
      "  delete (nextConfig as unknown as { experimental?: { turbo?: unknown } }).experimental.turbo;",
      "}",
      "",
      "export default nextConfig;",
      "",
    ].join("\n");
  } else {
    return [
      "import type { NextConfig } from 'next';",
      "",
      "const config: NextConfig = {",
      SECURITY_HEADERS,
      REWRITES,
      "};",
      "",
      "export default config;",
      "",
    ].join("\n");
  }
}

export function singleTsConfigContent(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2024",
          lib: ["ES2024", "DOM", "DOM.Iterable"],
          jsx: "preserve",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          incremental: true,
          plugins: [{ name: "next" }],
          baseUrl: ".",
          paths: {
            "@/*": ["./src/*"],
            "@/server/*": ["./src/server/*"],
            "@/components/*": ["./src/components/*"],
            "@/lib/*": ["./src/lib/*"],
          },
        },
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        exclude: ["node_modules"],
      },
      null,
      2,
    ) + "\n"
  );
}

export function singlePostCss(): string {
  return [
    '/** @type {import("postcss-load-config").Config} */',
    "const config = {",
    "  plugins: {",
    '    "@tailwindcss/postcss": {},',
    "  },",
    "};",
    "",
    "export default config;",
    "",
  ].join("\n");
}
