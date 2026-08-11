import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { type PublicTrade } from "@/lib/api";
import PublicTradeClient from "./client";

/* ── Config ── */
const SITE_URL = 'https://www.example.com';
const API_BASE = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || SITE_URL;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ── Server-side fetch ── */
async function fetchTrade(slugOrId: string): Promise<PublicTrade | null> {
  const isUUID = UUID_RE.test(slugOrId);
  const endpoint = isUUID
    ? `${API_BASE}/api/public/trades/${slugOrId}`
    : `${API_BASE}/api/public/trades/by-slug/${slugOrId}`;

  try {
    const res = await fetch(endpoint, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/* ── Helpers for metadata ── */
function extractKeyFactor(rawReasoning: string | undefined | null): string {
  if (!rawReasoning) return '';
  const marker = '---DEBATE_RESULTS_JSON---';
  const idx = rawReasoning.indexOf(marker);
  if (idx < 0) return '';
  try {
    const json = JSON.parse(rawReasoning.slice(idx + marker.length).trim());
    // Try superforecaster first, then forecaster
    const sf = json.superforecaster || json.forecaster;
    if (sf?.key_factors && sf.key_factors.length > 0) return String(sf.key_factors[0]);
    // Fall back to bull researcher first argument
    if (json.bull_researcher?.key_arguments?.length > 0) return String(json.bull_researcher.key_arguments[0]);
    return '';
  } catch {
    return '';
  }
}

function getEnsembleProbability(rawReasoning: string | undefined | null, confidence: number | undefined | null): number | null {
  if (!rawReasoning) return confidence ? Math.round(confidence * 100) : null;
  const marker = '---DEBATE_RESULTS_JSON---';
  const idx = rawReasoning.indexOf(marker);
  if (idx < 0) return confidence ? Math.round(confidence * 100) : null;
  try {
    const json = JSON.parse(rawReasoning.slice(idx + marker.length).trim());
    // Superforecaster probability takes priority
    if (json.superforecaster?.probability != null) {
      return Math.round(Number(json.superforecaster.probability) * 100);
    }
    // Weighted ensemble
    const forecasterProb = json.forecaster?.probability != null ? Number(json.forecaster.probability) : null;
    const bullProb = json.bull_researcher?.probability != null ? Number(json.bull_researcher.probability) : null;
    const bearProb = json.bear_researcher?.probability != null ? Number(json.bear_researcher.probability) : null;
    if (forecasterProb != null) {
      const weights = [
        { prob: forecasterProb, w: 0.35 },
        ...(bullProb != null ? [{ prob: bullProb, w: 0.25 }] : []),
        ...(bearProb != null ? [{ prob: bearProb, w: 0.20 }] : []),
      ];
      const totalW = weights.reduce((s, x) => s + x.w, 0);
      return Math.round((weights.reduce((s, x) => s + x.prob * x.w, 0) / totalW) * 100);
    }
    return confidence ? Math.round(confidence * 100) : null;
  } catch {
    return confidence ? Math.round(confidence * 100) : null;
  }
}

/* ── generateMetadata ── */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;

  // If UUID, return minimal metadata — the page component will redirect
  if (UUID_RE.test(slug)) {
    return { robots: { index: false } };
  }

  const trade = await fetchTrade(slug);
  if (!trade) {
    return {
      title: 'Trade Not Found | Prediction Market Agents',
      robots: { index: false },
    };
  }

  const exchange = trade.exchange === 'polymarket' ? 'Polymarket' : 'Kalshi';
  const prob = getEnsembleProbability(trade.raw_reasoning, trade.confidence);
  const side = trade.side.toUpperCase();
  const keyFactor = extractKeyFactor(trade.raw_reasoning);
  const marketTitle = trade.market_title || trade.market_ticker;
  // Keep title under ~60 chars for Google SERP display
  const titleBase = marketTitle.length > 50 ? marketTitle.slice(0, 47) + '...' : marketTitle;
  const title = `${titleBase} | ${exchange} AI Analysis`;
  const probStr = prob != null ? `${prob}%` : '';
  // Keep description under ~155 chars for Google snippet
  const descParts = [
    probStr ? `AI consensus: ${probStr} ${side} at $${trade.price.toFixed(2)} on ${exchange}.` : `AI analysis: ${side} at $${trade.price.toFixed(2)} on ${exchange}.`,
    keyFactor ? `${keyFactor.slice(0, 80)}.` : '',
    'Full bull vs bear AI debate.',
  ].filter(Boolean).join(' ');
  const description = descParts.slice(0, 160);

  const canonical = `${SITE_URL}/t/${slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'Prediction Market Agents',
      type: 'article',
      publishedTime: trade.timestamp,
      ...(trade.settled_at ? { modifiedTime: trade.settled_at } : {}),
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    other: {
      'article:published_time': trade.timestamp,
      ...(trade.settled_at ? { 'article:modified_time': trade.settled_at } : {}),
      'article:section': trade.category || 'Prediction Markets',
      'article:tag': exchange,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

/* ── Page Component ── */
export default async function PublicTradePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // UUID redirect: fetch trade by ID, get its slug, 301 redirect
  if (UUID_RE.test(slug)) {
    const trade = await fetchTrade(slug);
    if (!trade?.slug) return notFound();
    redirect('/t/' + trade.slug);
  }

  // Fetch trade for JSON-LD
  const trade = await fetchTrade(slug);
  if (!trade) return notFound();

  // Build JSON-LD structured data
  const exchange = trade.exchange === 'polymarket' ? 'Polymarket' : 'Kalshi';
  const prob = getEnsembleProbability(trade.raw_reasoning, trade.confidence);
  const keyFactor = extractKeyFactor(trade.raw_reasoning);
  const canonical = `${SITE_URL}/t/${slug}`;
  const probStr = prob != null ? `${prob}%` : '';
  const description = [
    probStr ? `Prediction Market Agents AI consensus: ${probStr} ${trade.side.toUpperCase()} at $${trade.price.toFixed(2)} on ${exchange}.` : `Prediction Market Agents AI analysis: ${trade.side.toUpperCase()} at $${trade.price.toFixed(2)} on ${exchange}.`,
    keyFactor ? `${keyFactor}.` : '',
    'Full bull vs bear debate by AI forecasting agents.',
  ].filter(Boolean).join(' ');

  // Parse debate for FAQ
  const faqEntries: { question: string; answer: string }[] = [];
  if (trade.raw_reasoning) {
    const marker = '---DEBATE_RESULTS_JSON---';
    const idx = trade.raw_reasoning.indexOf(marker);
    if (idx >= 0) {
      try {
        const debate = JSON.parse(trade.raw_reasoning.slice(idx + marker.length).trim());
        const marketName = trade.market_title || trade.market_ticker;

        if (prob != null) {
          faqEntries.push({
            question: `What is the AI prediction for "${marketName}"?`,
            answer: `Prediction Market Agents's AI ensemble assigns a ${probStr} probability to ${trade.side.toUpperCase()} on ${exchange}.`,
          });
        }
        if (debate.bull_researcher?.key_arguments?.length > 0) {
          faqEntries.push({
            question: `What are the bull arguments for "${marketName}"?`,
            answer: debate.bull_researcher.key_arguments.slice(0, 3).join('. ') + '.',
          });
        }
        if (debate.bear_researcher?.key_arguments?.length > 0) {
          faqEntries.push({
            question: `What are the bear arguments for "${marketName}"?`,
            answer: debate.bear_researcher.key_arguments.slice(0, 3).join('. ') + '.',
          });
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: trade.market_title || trade.market_ticker,
        description,
        url: canonical,
        datePublished: trade.timestamp,
        ...(trade.settled_at ? { dateModified: trade.settled_at } : {}),
        author: {
          '@type': 'Organization',
          name: 'Prediction Market Agents',
          url: SITE_URL,
        },
        publisher: {
          '@type': 'Organization',
          name: 'Prediction Market Agents',
          url: SITE_URL,
        },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
        articleSection: trade.category || 'Prediction Markets',
        keywords: [exchange, 'prediction market', 'AI analysis', trade.side, trade.category].filter(Boolean),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Prediction Market Agents', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: trade.market_title || trade.market_ticker, item: canonical },
        ],
      },
      ...(faqEntries.length > 0
        ? [{
            '@type': 'FAQPage',
            mainEntity: faqEntries.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
              },
            })),
          }]
        : []),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <PublicTradeClient initialTrade={trade} />
    </>
  );
}
