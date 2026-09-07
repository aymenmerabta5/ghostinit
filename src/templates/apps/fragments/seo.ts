// @allow-long 350: SEO fragments for sitemap/robots/manifest/viewport + generateMetadata example
/**
 * SEO fragments — sitemap, robots, manifest, viewport, per-page metadata
 * Shared between Next.js (MetadataRoute) and TanStack (route exports)
 */

export type RouterType = "next" | "tanstack";

export function sitemapFileContent(router: RouterType = "next"): string {
  if (router === "tanstack") {
    return `export default function sitemap() {
  const base = process.env.VITE_APP_URL ?? "http://localhost:3000";
  return [
    { url: \`\${base}/\`, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: \`\${base}/dashboard\`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: \`\${base}/billing\`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.5 },
  ];
}
`;
  }
  return `import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return [
    { url: \`\${base}/\`, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: \`\${base}/dashboard\`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: \`\${base}/billing\`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.5 },
    { url: \`\${base}/settings\`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.4 },
  ];
}
`;
}

export function robotsFileContent(router: RouterType = "next"): string {
  if (router === "tanstack") {
    return `export default function robots() {
  const base = process.env.VITE_APP_URL ?? "http://localhost:3000";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/"] },
    sitemap: \`\${base}/sitemap.xml\`,
  };
}
`;
  }
  return `import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/"] },
    sitemap: \`\${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/sitemap.xml\`,
  };
}
`;
}

export function manifestFileContent(router: RouterType = "next"): string {
  if (router === "tanstack") {
    return `export default function manifest() {
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

export async function generateMetadata(): Promise<Metadata> {
  const title = "GhostInit — Modular Monolith";
  const description = "Bun + oRPC + Better Auth starter with SEO-ready metadata";
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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

export default async function Image(): Promise<ImageResponse> {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#000", color: "#fff", fontSize: 64 }}>GhostInit</div>
    ),
    { ...size }
  );
}
`;
}
