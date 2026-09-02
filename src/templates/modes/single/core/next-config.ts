import {
  cacheComponentsConfigBlock,
  nextConfigHeadersFunction,
  posthogRewritesBlock,
} from "../../../apps/fragments/core/security.js";

export function singleNextConfigContent(hasEve: boolean, hasI18n = false, hasPdf = false): string {
  const headers = nextConfigHeadersFunction();
  const rewrites = posthogRewritesBlock();
  const imports = [
    "import type { NextConfig } from 'next';",
    ...(hasEve ? ["import { withEve, type EveNextConfigFunction } from 'eve/next';"] : []),
    ...(hasI18n ? ["import createNextIntlPlugin from 'next-intl/plugin';"] : []),
  ];
  const intlSetup = hasI18n
    ? ["const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');", ""]
    : [];
  const exportLines = hasEve
    ? [
        "// The Next project root is also the Eve application root; withEve discovers agent/.",
        `const withEveConfig = withEve(${hasI18n ? "withNextIntl(config)" : "config"});`,
        "",
        "// Eve returns a Next config function, so resolve it before normalizing fields.",
        "const nextConfig: EveNextConfigFunction<NextConfig> = async (phase, context) => {",
        "  const resolved = await withEveConfig(phase, context);",
        "  const experimental = resolved.experimental;",
        '  if (!experimental || !Reflect.has(experimental, "turbo")) return resolved;',
        "  const normalizedExperimental = { ...experimental };",
        '  Reflect.deleteProperty(normalizedExperimental, "turbo");',
        "  return { ...resolved, experimental: normalizedExperimental };",
        "};",
        "",
        "export default nextConfig;",
      ]
    : [hasI18n ? "export default withNextIntl(config);" : "export default config;"];

  return [
    ...imports,
    "",
    "const config: NextConfig = {",
    cacheComponentsConfigBlock,
    "  reactStrictMode: true,",
    "  poweredByHeader: false,",
    ...(hasPdf
      ? [
          "  outputFileTracingIncludes: {",
          '    "/api/pdf": [',
          '      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf",',
          '      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf",',
          '      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif.ttf",',
          '      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif-Bold.ttf",',
          "    ],",
          "  },",
        ]
      : []),
    headers,
    rewrites,
    "};",
    "",
    ...intlSetup,
    ...exportLines,
    "",
  ].join("\n");
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
          types: ["bun-types/test", "node"],
          plugins: [{ name: "next" }],
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
