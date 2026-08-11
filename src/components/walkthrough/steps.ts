export interface WalkthroughStep {
  id: string;
  page: string;
  type: "welcome" | "banner";
  title: string;
  description: string;
}

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  // ── Welcome ──
  {
    id: "welcome",
    page: "/portfolio",
    type: "welcome",
    title: "Welcome to Prediction Market Agents",
    description:
      "Your AI trading command center. This quick tour covers everything you need to deploy autonomous trading agents on prediction markets.",
  },

  // ── Strategies ──
  {
    id: "strategies",
    page: "/strategy",
    type: "banner",
    title: "Pick a Strategy",
    description:
      "Each card is a pre-built AI agent — from multi-model debate councils to deep research forecasters. Tap one to configure and deploy it.",
  },

  // ── Strategy Detail ──
  {
    id: "strategy-detail",
    page: "/strategy/polymarket-v2",
    type: "banner",
    title: "Deploy Your Agent",
    description:
      "Set risk limits, choose training or live mode, then hit Deploy. Your agent will autonomously scan markets and execute trades.",
  },

  // ── Terminal ──
  {
    id: "terminal",
    page: "/terminal",
    type: "banner",
    title: "Terminal",
    description:
      "Live view of your agents in action — active cycles, market scans, and the real-time signal pipeline as trades flow through.",
  },

  // ── Trade Detail ──
  {
    id: "trade-detail",
    page: "/trades/demo-trade-1",
    type: "banner",
    title: "AI Reasoning",
    description:
      "Each trade page shows the full analysis — which agents contributed, what signals were detected, and why the decision was made.",
  },

  // ── Evaluations ──
  {
    id: "evaluations",
    page: "/evaluations/visuals",
    type: "banner",
    title: "Evaluations",
    description:
      "After every trade settles, the system runs a post-mortem — scoring each AI agent, detecting behavioral patterns, and finding optimal thresholds.",
  },

  // ── Portfolio ──
  {
    id: "portfolio",
    page: "/portfolio",
    type: "banner",
    title: "Portfolio",
    description:
      "Track total P&L, open positions, and performance charts across all your agents and exchanges in one view.",
  },
];
