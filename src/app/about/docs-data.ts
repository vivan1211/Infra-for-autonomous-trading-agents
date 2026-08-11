export interface DocSection {
  slug: string;
  title: string;
  category: string;
  subtitle: string;
}

export const DOC_SECTIONS: DocSection[] = [
  { slug: "overview", title: "What is Prediction Market Agents?", category: "Getting Started", subtitle: "An introduction to AI-powered prediction market trading." },
  { slug: "how-it-works", title: "How It Works", category: "Getting Started", subtitle: "The trade pipeline from market scan to execution." },
  { slug: "connecting-account", title: "Connecting Your Account", category: "Setup", subtitle: "Link your exchange and configure API keys." },
  { slug: "training-vs-live", title: "Training vs Live Mode", category: "Setup", subtitle: "Simulate trades risk-free or go live with real capital." },
  { slug: "strategies", title: "Strategies", category: "Strategies", subtitle: "AI trading strategies available on the platform." },
  { slug: "council-v2", title: "Council V2", category: "Strategies", subtitle: "Sequential 5-agent debate with Trader decision gate, live research, and edge filtering." },
  { slug: "superforecaster", title: "The Superforecaster", category: "Strategies", subtitle: "Research-first structured decomposition for Kalshi and Polymarket." },
  { slug: "council", title: "The Council (Legacy)", category: "Strategies", subtitle: "The original 5-agent parallel ensemble for Kalshi and Polymarket." },
  { slug: "terminal", title: "Terminal", category: "Dashboard", subtitle: "Live execution feed and signal monitoring." },
  { slug: "agents", title: "Agents", category: "Dashboard", subtitle: "Deploy, configure, and monitor AI trading agents." },
  { slug: "benchmarking", title: "Benchmarking", category: "Dashboard", subtitle: "Agent rankings, performance comparison, and P&L leaderboard." },
  { slug: "safeguards", title: "Safeguards & Rules", category: "System", subtitle: "Two-tier rules engine protecting every trade on every exchange." },
  { slug: "nuclear-option", title: "Nuclear Option", category: "System", subtitle: "Emergency controls to stop all trading instantly." },
];

export const CATEGORIES = ["Getting Started", "Setup", "Strategies", "Dashboard", "System"];

export function getDocBySlug(slug: string): DocSection | undefined {
  return DOC_SECTIONS.find((d) => d.slug === slug);
}

export function getAdjacentDocs(slug: string): { prev: DocSection | null; next: DocSection | null } {
  const idx = DOC_SECTIONS.findIndex((d) => d.slug === slug);
  return {
    prev: idx > 0 ? DOC_SECTIONS[idx - 1] : null,
    next: idx < DOC_SECTIONS.length - 1 ? DOC_SECTIONS[idx + 1] : null,
  };
}
