import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/t/', '/about', '/privacy', '/terms'],
        disallow: [
          '/api/',
          '/login',
          '/signup',
          '/forgot-password',
          '/reset-password',
          '/onboarding',
          '/mfa-verify',
          // Dashboard routes (behind auth but shouldn't be crawled)
          '/portfolio',
          '/portfolio-old',
          '/portfolio-v2',
          '/trades',
          '/trades-v2',
          '/agents',
          '/strategy',
          '/settings',
          '/terminal',
          '/memory',
          '/evaluations',
          '/logs',
          '/leaderboard',
          '/setup',
          '/compare',
          '/insights',
          '/markets',
          '/bots',
          // Test/dev routes
          '/test-design',
          '/test-design-preview',
          '/test-trades',
          '/test-portfolio',
          '/test-strategy',
          '/trades-v2-mockup',
        ],
      },
    ],
    sitemap: 'https://www.example.com/sitemap.xml',
  };
}
