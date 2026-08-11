import type { MetadataRoute } from "next";

const SITE_URL = 'https://www.example.com';
// Use BACKEND_URL directly — fetching via SITE_URL creates a circular request during Vercel build.
const API_BASE = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://www.example.com';

// Opt into ISR so the sitemap regenerates hourly at runtime instead of being
// frozen at build time. Without this, a build-time fetch failure produces an
// empty sitemap that stays in production until the next deploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let tradeUrls: MetadataRoute.Sitemap = [];

  try {
    const res = await fetch(`${API_BASE}/api/public/trades/sitemap`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const entries: { slug: string; timestamp: string }[] = await res.json();
      tradeUrls = entries
        .filter((e) => e.slug)
        .map((e) => ({
          url: `${SITE_URL}/t/${e.slug}`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        }));
    } else {
      console.error(`[sitemap] Backend returned non-OK status ${res.status} ${res.statusText} for ${API_BASE}/api/public/trades/sitemap`);
    }
  } catch (err) {
    console.error('[sitemap] Failed to fetch trade URLs:', err);
    // Sitemap generation shouldn't break the build
  }

  console.info(`[sitemap] Included ${tradeUrls.length} trade URL(s) in sitemap`);

  return [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'monthly', priority: 0.3 },
    ...tradeUrls,
  ];
}
