const _SUPERFORECASTER_SHORT = "Perplexity researches the web, then a single reasoning model decomposes questions into sub-questions with base rates to produce calibrated probabilities.";
const _SUPERFORECASTER_LONG = "A research-first prediction agent that gathers comprehensive evidence from the live web via Perplexity before a single reasoning model applies structured decomposition \u2014 breaking questions into sub-questions, establishing base rates with sample sizes, and synthesizing inside and outside views into a calibrated probability. Every data point is sourced, never hallucinated.";
const _COUNCIL_SHORT = "6 AI agents debate every trade \u2014 Bull and Bear argue, Risk Manager runs the math, Trader only acts when 3+ agents agree.";
const _COUNCIL_LONG = "A 6-agent adversarial debate system where specialized AI models \u2014 Forecaster, News Analyst, Bull Researcher, Bear Researcher, Risk Manager, and Trader \u2014 each running on a different provider, analyze every market through a structured debate. The Bull and Bear directly counter each other\u2019s arguments, the Risk Manager calculates expected value, and the Trader can only act when at least 3 of 5 agents agree.";
const _TAIL_BUYER_SHORT = "Buys near-zero probability contracts (0.1\u20132\u00a2) at scale, collecting $1 on rare hits. Pure rule-based, no AI.";
const _TAIL_BUYER_LONG = "A mechanical tail-buying strategy that scans for contracts priced between 0.1 and 2 cents, then buys the cheap side at fixed size. No AI models, no debate, no edge calculation \u2014 purely rule-based volume buying of extreme-tail outcomes. Hold to resolution only.";

export const BOT_DESCRIPTIONS: Record<string, { short: string; long: string }> = {
  // Canonical IDs
  "superforecaster":            { short: _SUPERFORECASTER_SHORT, long: _SUPERFORECASTER_LONG },
  "superforecaster-polymarket": { short: _SUPERFORECASTER_SHORT, long: _SUPERFORECASTER_LONG + " Trades on Polymarket via CLOB with EIP-712 signed orders." },
  "ensemble-5":                 { short: _COUNCIL_SHORT, long: _COUNCIL_LONG },
  "ensemble-5-polymarket":      { short: _COUNCIL_SHORT, long: _COUNCIL_LONG + " Trades on Polymarket via CLOB with EIP-712 signed orders on the Polygon blockchain." },
  // Alias IDs (used by some API responses)
  "kalshi-superforecaster":     { short: _SUPERFORECASTER_SHORT, long: _SUPERFORECASTER_LONG },
  "polymarket-superforecaster": { short: _SUPERFORECASTER_SHORT, long: _SUPERFORECASTER_LONG + " Trades on Polymarket via CLOB with EIP-712 signed orders." },
  "polymarket-council":         { short: _COUNCIL_SHORT, long: _COUNCIL_LONG + " Trades on Polymarket via CLOB with EIP-712 signed orders on the Polygon blockchain." },
  "kalshi-v2":                  { short: _COUNCIL_SHORT, long: _COUNCIL_LONG },
  "polymarket-v2":              { short: _COUNCIL_SHORT, long: _COUNCIL_LONG + " Trades on Polymarket via CLOB with EIP-712 signed orders on the Polygon blockchain." },
  "polymarket-tail-buyer":      { short: _TAIL_BUYER_SHORT, long: _TAIL_BUYER_LONG + " Trades on Polymarket via CLOB with EIP-712 signed orders." },
  "kalshi-tail-buyer":          { short: _TAIL_BUYER_SHORT, long: _TAIL_BUYER_LONG },
};

export function getBotDescription(botTypeId: string | undefined, fallback?: string): string {
  if (!botTypeId) return fallback || "";
  return BOT_DESCRIPTIONS[botTypeId]?.long || BOT_DESCRIPTIONS[botTypeId]?.short || fallback || "";
}

export function getBotShortDescription(botTypeId: string | undefined, fallback?: string): string {
  if (!botTypeId) return fallback || "";
  return BOT_DESCRIPTIONS[botTypeId]?.short || fallback || "";
}
