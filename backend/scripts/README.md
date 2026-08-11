# Trade Intelligence System — Run Instructions

## Quick Start

```bash
# From the project root:
cd /path/to/prediction-market-agents

# Run all stages on a CSV:
OPENAI_API_KEY="sk-proj-..." python3 backend/scripts/trade_intelligence.py \
  --stage 1,2,3,4,5 \
  --csv ~/Downloads/YOUR_CSV.csv
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--stage` | *required* | Stages to run: `1,2,3,4,5` (comma-separated) |
| `--csv` | *required* | Path to trades CSV |
| `--bot-type` | all | Filter: `polymarket-v2`, `polymarket-superforecaster`, etc. |
| `--limit` | 500 | Max trades per stage |
| `--output-dir` | `~/Desktop/trade-intelligence` | Where JSON results are saved |
| `--backend` | auto | `openai` (fast, parallel), `claude-cli` (slow), `auto` |
| `--concurrency` | 15 | Parallel API calls (OpenAI only) |

## Stages

| # | Name | AI? | What it does |
|---|------|-----|-------------|
| 1 | Signal Extraction | No | Regex/math on raw_reasoning → signals JSON |
| 2 | AI Autopsy | Yes | GPT-4o classifies each trade's failure mode |
| 3 | Batch Patterns | Yes | GPT-4o finds cross-trade patterns |
| 4 | Parameter Sweep | No | Pure math — sweep confidence/edge thresholds |
| 5 | Platform Stats | No | Aggregate stats |

## Examples

```bash
# Just extract signals (no API needed):
python3 backend/scripts/trade_intelligence.py --stage 1 --csv ~/Downloads/trades.csv

# Autopsy 10 trades to test:
OPENAI_API_KEY="sk-..." python3 backend/scripts/trade_intelligence.py \
  --stage 2 --csv ~/Downloads/trades.csv --limit 10

# Full pipeline, Council V2 only:
OPENAI_API_KEY="sk-..." python3 backend/scripts/trade_intelligence.py \
  --stage 1,2,3,4,5 --csv ~/Downloads/trades.csv --bot-type polymarket-v2

# Use Claude CLI instead of OpenAI:
python3 backend/scripts/trade_intelligence.py \
  --stage 1,2,3,5 --csv ~/Downloads/trades.csv --backend claude-cli
```

## CSV Format

Export from Supabase SQL Editor. Required columns:
```
id, agent_id, bot_type_id, market_ticker, market_title, category,
side, action, count, price, total_cost, confidence, status, pnl,
settled, settled_at, environment, exchange, model, rules_result,
raw_reasoning, timestamp, market_close_time, cf_settled, cf_pnl,
cf_market_result, cf_count
```

## SQL Queries

### Settled trades (won/lost — real PnL):
```sql
SELECT t.id, t.agent_id, ua.bot_type_id, t.market_ticker, t.market_title,
  t.category, t.side, t.action, t.count, t.price, t.total_cost,
  t.confidence, t.status, t.pnl, t.settled, t.settled_at,
  t.environment, t.exchange, t.model, t.rules_result,
  t.raw_reasoning, t.timestamp, t.market_close_time,
  t.cf_settled, t.cf_pnl, t.cf_market_result, t.cf_count
FROM trades t
JOIN user_agents ua ON ua.id = t.agent_id
WHERE t.settled = TRUE AND t.pnl IS NOT NULL
  AND t.status IN ('executed', 'paper', 'pending_fill')
  AND t.pnl != 0
ORDER BY t.timestamp DESC;
```

### Skipped/rejected trades with counterfactual outcomes:
```sql
SELECT t.id, t.agent_id, ua.bot_type_id, t.market_ticker, t.market_title,
  t.category, t.side, t.action, t.count, t.price, t.total_cost,
  t.confidence, t.status, t.pnl, t.settled, t.settled_at,
  t.environment, t.exchange, t.model, t.rules_result,
  t.raw_reasoning, t.timestamp, t.market_close_time,
  t.cf_settled, t.cf_pnl, t.cf_market_result, t.cf_count
FROM trades t
JOIN user_agents ua ON ua.id = t.agent_id
WHERE t.status IN ('skipped', 'rejected')
  AND t.cf_settled = TRUE
  AND t.cf_pnl IS NOT NULL
ORDER BY t.timestamp DESC;
```

### All trades (last 7 days, Polymarket):
```sql
SELECT t.id, t.agent_id, ua.bot_type_id, t.market_ticker, t.market_title,
  t.category, t.side, t.action, t.count, t.price, t.total_cost,
  t.confidence, t.status, t.pnl, t.settled, t.settled_at,
  t.environment, t.exchange, t.model, t.rules_result,
  t.raw_reasoning, t.timestamp, t.market_close_time,
  t.cf_settled, t.cf_pnl, t.cf_market_result, t.cf_count
FROM trades t
JOIN user_agents ua ON ua.id = t.agent_id
WHERE t.exchange = 'polymarket'
  AND t.timestamp >= NOW() - INTERVAL '7 days'
ORDER BY t.timestamp DESC;
```

## Output

Results saved to `~/Desktop/trade-intelligence/`:
```
stage1_signals.json      — per-trade extracted signals
stage2_autopsies.json    — per-trade AI failure mode classification
stage3_patterns.json     — cross-trade patterns + recommendations
stage4_sweep.json        — parameter optimization results
stage5_stats.json        — aggregate platform stats
full_review.txt          — formatted report (if generated)
```
