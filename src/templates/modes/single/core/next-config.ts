import {
  cacheComponentsConfigBlock,
  nextConfigHeadersFunction,
  posthogRewritesBlock,
} from "../../../apps/fragments/core/security.js";
import { NEXT_COMPILER_OPTIONS, NEXT_TYPE_INCLUDES } from "../../../tooling/next-typescript.js";

export function singleNextConfigContent(
  hasEve: boolean,
  hasI18n = false,
  hasPdf = false,
  hasCloudflare = false,
  hasConvex = false,
  hasPaddle = false,
): string {
  const headers = nextConfigHeadersFunction(hasConvex, hasPaddle);
  const rewrites = posthogRewritesBlock();
  const imports = [
    "import type { NextConfig } from 'next';",
    ...(hasCloudflare
      ? ["import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';"]
      : []),
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
    ...(hasCloudflare
      ? ['if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();', ""]
      : []),
    "const config: NextConfig = {",
    cacheComponentsConfigBlock(hasCloudflare),
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
          ...NEXT_COMPILER_OPTIONS,
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          incremental: true,
          types: ["bun-types/test", "node"],
          paths: {
            "@/*": ["./src/*"],
            "@/server/*": ["./src/server/*"],
            "@/components/*": ["./src/components/*"],
            "@/lib/*": ["./src/lib/*"],
          },
        },
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ...NEXT_TYPE_INCLUDES],
        exclude: ["node_modules", ".ghostinit"],
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
