// @allow-long 350: SEO fragments for sitemap/robots/manifest/viewport + generateMetadata example
/**
 * SEO fragments — sitemap, robots, manifest, viewport, per-page metadata
 * Shared between Next.js (MetadataRoute) and TanStack (route exports)
 */

export type RouterType = "next" | "tanstack";

export function sitemapFileContent(router: RouterType = "next", hasBilling = true): string {
  const tanstackBillingEntry = hasBilling
    ? "  <url><loc>http://localhost:3000/billing</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>\n"
    : "";
  const nextBillingEntry = hasBilling
    ? '    { url: `${base}/billing`, changeFrequency: "weekly", priority: 0.5 },\n'
    : "";
  if (router === "tanstack") {
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>http://localhost:3000/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>http://localhost:3000/dashboard</loc><changefreq>daily</changefreq><priority>0.8</priority></url>
${tanstackBillingEntry}  <url><loc>http://localhost:3000/settings</loc><changefreq>weekly</changefreq><priority>0.4</priority></url>
</urlset>
`;
  }
  return `import type { MetadataRoute } from "next";
import { env } from "@repo/config/next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.NEXT_PUBLIC_APP_URL;
  return [
    { url: \`\${base}/\`, changeFrequency: "daily", priority: 1 },
    { url: \`\${base}/dashboard\`, changeFrequency: "daily", priority: 0.8 },
${nextBillingEntry}    { url: \`\${base}/settings\`, changeFrequency: "weekly", priority: 0.4 },
  ];
}
`;
}

export function robotsFileContent(router: RouterType = "next"): string {
  if (router === "tanstack") {
    return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Sitemap: http://localhost:3000/sitemap.xml
`;
  }
  return `import type { MetadataRoute } from "next";
import { env } from "@repo/config/next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/"] },
    sitemap: \`\${env.NEXT_PUBLIC_APP_URL}/sitemap.xml\`,
  };
}
`;
}

export function manifestFileContent(router: RouterType = "next"): string {
  if (router === "tanstack") {
    return `${JSON.stringify(
      {
        name: "GhostInit App",
        short_name: "GhostInit",
        description: "Your opinionated modular monolith",
        start_url: "/",
        display: "standalone",
        background_color: "#17171c",
        theme_color: "#17171c",
        icons: [
          { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
          { src: "/icon.png", sizes: "512x512", type: "image/png" },
        ],
      },
      null,
      2,
    )}\n`;
  }
  return `import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GhostInit App",
    short_name: "GhostInit",
    description: "Your opinionated modular monolith",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
`;
}

export function viewportFileContent(router: RouterType = "next"): string {
  if (router === "tanstack") {
    return `export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  colorScheme: "light dark",
};
`;
  }
  return `import type { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  colorScheme: "light dark",
};
`;
}

export function generateMetadataContent(): string {
  return `import type { Metadata } from "next";
import { env } from "@repo/config/next";

export async function generateMetadata(): Promise<Metadata> {
  const title = "GhostInit — Modular Monolith";
  const description = "Bun + oRPC + Better Auth starter with SEO-ready metadata";
  const base = env.NEXT_PUBLIC_APP_URL;
  return {
    title,
    description,
    alternates: { canonical: base },
    openGraph: {
      title,
      description,
      url: base,
      siteName: "GhostInit",
      images: [{ url: \`\${base}/opengraph-image.png\`, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
`;
}

export function opengraphImageContent(): string {
  return `import { ImageResponse } from "next/og";

export const alt = "GhostInit";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image(): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#000", color: "#fff", fontSize: 64 }}>GhostInit</div>
    ),
    { ...size }
  );
}
`;
}
