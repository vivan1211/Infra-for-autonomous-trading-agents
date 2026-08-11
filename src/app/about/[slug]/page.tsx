"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { DOC_SECTIONS, CATEGORIES, getDocBySlug, getAdjacentDocs } from "../docs-data";
import { AboutNav } from "../about-nav";

/* ─── Typography ─────────────────────────────────────────────────────────── */

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[18px] md:text-[20px] font-semibold text-white mt-12 mb-4">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15px] md:text-[16px] font-semibold text-white mt-8 mb-3">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] md:text-[14px] leading-[1.7] text-white/80 mb-4">{children}</p>;
}
function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-5 space-y-2 text-[13px] md:text-[14px] leading-[1.7] text-white/80 mb-5">{children}</ul>;
}
function OL({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal pl-5 space-y-2 text-[13px] md:text-[14px] leading-[1.7] text-white/80 mb-5">{children}</ol>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[12px] bg-white/[0.05] px-1.5 py-0.5 rounded text-white">{children}</code>;
}
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-gain/40 pl-4 py-3 mb-6">
      <p className="text-[13px] text-white/80 leading-[1.7]">{children}</p>
    </div>
  );
}
function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-[#FF6B8A]/40 pl-4 py-3 mb-6 flex gap-3">
      <AlertTriangle size={14} className="text-[#FF6B8A]/60 shrink-0 mt-1" />
      <p className="text-[13px] text-white/80 leading-[1.7]">{children}</p>
    </div>
  );
}
function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="border border-white/[0.06] rounded-lg overflow-x-auto mb-6">
      <table className="w-full text-[12px] md:text-[13px]">
        <thead>
          <tr className="border-b border-white/[0.08]">
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-2.5 text-white/50 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={`px-4 py-2.5 whitespace-nowrap ${j === 0 ? "text-white font-medium" : "text-white/70"}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function StepItem({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex gap-4 mb-1">
      <div className="flex flex-col items-center">
        <div className="w-7 h-7 rounded-full border border-white/[0.12] flex items-center justify-center text-white/40 text-[11px] font-mono shrink-0">
          {n}
        </div>
        <div className="w-px flex-1 bg-white/[0.06] mt-1.5" />
      </div>
      <div className="pb-6">
        <p className="text-[14px] font-medium text-white">{title}</p>
        <p className="text-[13px] text-white/70 mt-1 leading-[1.6]">{desc}</p>
      </div>
    </div>
  );
}

/* ─── Content by slug ────────────────────────────────────────────────────── */

function DocContent({ slug }: { slug: string }) {
  switch (slug) {
    case "overview": return <OverviewContent />;
    case "how-it-works": return <HowItWorksContent />;
    case "connecting-account": return <ConnectingAccountContent />;
    case "training-vs-live": return <TrainingVsLiveContent />;
    case "strategies": return <StrategiesContent />;
    case "council-v2": return <CouncilV2Content />;
    case "superforecaster": return <SuperforecasterContent />;
    case "council": return <CouncilContent />;
    case "terminal": return <TerminalContent />;
    case "agents": return <AgentsContent />;
    case "benchmarking": return <BenchmarkingContent />;
    case "safeguards": return <SafeguardsContent />;
    case "nuclear-option": return <NuclearOptionContent />;
    default: return <P>Page not found.</P>;
  }
}

/* ─── Overview ───────────────────────────────────────────────────────────── */

function OverviewContent() {
  return (
    <>
      <P>
        Prediction Market Agents is an autonomous prediction market trading platform. Deploy AI agents that
        scan live markets, run structured analysis, and execute trades on real exchanges — 24/7,
        with no manual intervention. Every decision flows through a deterministic safety pipeline
        before capital is ever committed.
      </P>
      <P>
        Agents trade on <strong>Kalshi</strong> (a CFTC-regulated US exchange) and{" "}
        <strong>Polymarket</strong> (a decentralized prediction market on the Polygon blockchain).
        Each exchange has its own credentials, market structure, and settlement rules, but the
        AI analysis pipeline is identical across both — deploy the same strategy on either
        exchange with a single click.
      </P>
      <P>
        The flagship strategy is <strong>Council V2</strong>, a sequential 5-agent adversarial
        debate. Perplexity gathers live web research, then five specialized agents — Forecaster
        (Grok 4.1 Fast), Bull Researcher (Claude Opus 4.6), Bear Researcher (Claude Sonnet 4.6),
        Risk Manager (Claude Opus 4.6), and Trader (Claude Sonnet 4.6) — each build on the previous
        agent{"'"}s output before the Trader makes the final call. A trade only executes when the
        Risk Manager approves and the Trader confirms edge. Also available: <strong>Superforecaster</strong>,
        a research-first strategy where Perplexity gathers comprehensive evidence and a single reasoning
        model applies structured decomposition with base rates to produce calibrated probabilities.
      </P>

      <H2>Core Concepts</H2>
      <UL>
        <li><strong>Multi-Model Debate</strong> — Five AI agents from two providers (xAI and Anthropic) argue through a sequential pipeline where each agent sees and challenges the previous output. No groupthink — disagreement is built in.</li>
        <li><strong>Multi-Exchange Support</strong> — Trade on Kalshi and Polymarket through dedicated bot services. Same AI pipeline, different execution layers.</li>
        <li><strong>Training Mode</strong> — The full pipeline runs end-to-end but no real orders are placed. Test strategy performance risk-free before committing capital.</li>
        <li><strong>Live Trading</strong> — Real orders placed on exchanges through their APIs using your own account credentials.</li>
        <li><strong>Transparency</strong> — Every decision is logged with full reasoning from each agent, weighted confidence scores, and rule validation results. Nothing is a black box.</li>
        <li><strong>Two-Tier Safety</strong> — Per-agent rules and account-level rules validate every trade. Nine hard constraints are checked — the more restrictive limit always wins.</li>
        <li><strong>Emergency Controls</strong> — Stop all agents instantly, or trigger a nuclear shutdown that halts trading and wipes all stored credentials.</li>
        <li><strong>Agent Management</strong> — Monitor running agents in the <Link href="/terminal">Terminal</Link>, review deployed strategies on the <Link href="/agents">Agents</Link> page, and compare historical performance on the <Link href="/leaderboard">Benchmarking</Link> leaderboard.</li>
        <li><strong>Guided Walkthrough</strong> — A built-in interactive tour walks you through every section of the platform — strategies, trades, portfolio, and settings — so you can get oriented before deploying your first agent.</li>
      </UL>

      <Tip>
        New to Prediction Market Agents? Start in <strong>Training mode</strong> and launch the{" "}
        <strong>Guided Walkthrough</strong> from the sidebar to explore the platform
        hands-on. You can deploy your first strategy in under 5 minutes — no capital required.
      </Tip>
    </>
  );
}

/* ─── How It Works ───────────────────────────────────────────────────────── */

function HowItWorksContent() {
  return (
    <>
      <P>
        Every trade on Prediction Market Agents — regardless of strategy, exchange, or mode — flows through the
        same deterministic validation pipeline before it can execute. No AI judgment is involved in
        validation. The pipeline enforces hard, rule-based constraints at two tiers: per-agent rules
        and account-level limits. Only trades that clear every gate reach the exchange.
      </P>
      <P>
        This architecture means you can run multiple agents across Kalshi and Polymarket simultaneously
        and trust that every order is checked against the same rigorous set of controls. Nothing
        reaches the market without passing every rule.
      </P>

      <H2>The Pipeline</H2>
      <div className="mt-4 mb-2">
        <StepItem n={1} title="Agent Decision" desc="The agent's strategy analyzes a market and produces a structured decision: BUY, SELL, or SKIP. The decision includes the market ticker, side (YES/NO), quantity, price, confidence score, the target exchange (Kalshi or Polymarket), and the full chain-of-thought reasoning that led to the call." />
        <StepItem n={2} title="Order Interception" desc="When the agent calls place_order(), a proxy layer intercepts the request before it ever reaches the exchange. The order is queued for validation with a pending status. Read-only operations — fetching markets, checking balances — pass through to the target exchange normally. The agent has no knowledge that its orders are being intercepted and validated." />
        <StepItem n={3} title="Tier 1 — Agent + Global Rules" desc="The orchestrator claims the pending order immediately and runs it through a deterministic rules engine. Every constraint is checked programmatically — no AI is involved. The engine evaluates: max trade size, capital allocation per agent, daily loss limit (kill switch), minimum confidence floor, blocked tickers, max concurrent positions, duplicate position prevention, opposing position check (cannot hold YES and NO on the same market), max trades per day, minimum position size (dust filter), and sell-without-position guard. Both per-agent and global limits are checked for each rule — the more restrictive value always wins." />
        <StepItem n={4} title="Tier 2 — Account Validation" desc="Account-level checks run across all agents owned by the user: global daily trade count, global daily loss across every agent, max trades per market, active trading hours (schedule enforcement), cooldown period between same-market trades, and daily AI API budget. Training and Live environments are tracked independently — training trades never count against live limits and vice versa." />
        <StepItem n={5} title="Safety Check" desc="A final pre-execution gate re-checks the agent's status in the database. If the agent was stopped during the validation window (for example, the user clicked Stop or Stop All), the order is rejected immediately. This prevents stale decisions from reaching the exchange after a user has intervened." />
        <StepItem n={6} title="Execution" desc="If every check passes, the trade is routed based on mode and exchange. In Training mode, the trade is saved as a 'paper' entry with no API call to any exchange — a full simulation. In Live mode, the order is placed on the target exchange: the Kalshi API for Kalshi markets, or the Polymarket API for Polymarket markets. After execution, portfolio snapshots, trade history, and P&L metrics are updated in real time." />
      </div>

      <H2>Rejection Handling</H2>
      <P>
        Every rejected trade is permanently saved to your trade history with the exact rule that
        blocked it and a human-readable explanation. Nothing is silently dropped. You can inspect
        any rejected trade to see precisely why it was stopped — whether it exceeded a position
        limit, failed the confidence floor, hit the daily loss kill switch, or violated any other
        constraint.
      </P>

      <H3>Trade Statuses</H3>
      <DataTable
        headers={["Status", "Meaning"]}
        rows={[
          ["paper", "Training mode — simulated trade, no exchange API call"],
          ["executed", "Live mode — real order filled on Kalshi or Polymarket"],
          ["pending_fill", "Live order submitted, awaiting fill confirmation from the exchange"],
          ["rejected", "Blocked by one or more pipeline rules (reason recorded)"],
          ["skipped", "Agent analyzed the market and decided not to trade"],
          ["cancelled", "User cancelled the order or agent was stopped"],
          ["error", "Execution failure (network, exchange error, or internal issue)"],
        ]}
      />

      <Tip>
        The validation pipeline is identical in Training and Live mode. Every rule, every threshold,
        every constraint is enforced the same way. The only difference is the final step: Training
        saves a simulated record, Live places a real order on the target exchange. This means you
        can validate your strategy in Training with full confidence that it will behave the same
        way when you switch to Live.
      </Tip>
    </>
  );
}

/* ─── Connecting Account ─────────────────────────────────────────────────── */

function ConnectingAccountContent() {
  return (
    <>
      <P>
        Prediction Market Agents trades on prediction markets through exchange APIs. You need to connect at least
        one exchange and an AI API key to start trading. This page covers everything you need to know
        about credentials for each supported exchange, the AI models that power the trading pipeline,
        and how every secret is protected end-to-end.
      </P>

      {/* ── Kalshi ─────────────────────────────── */}
      <H2>Kalshi</H2>

      <H3>What is Kalshi?</H3>
      <P>
        Kalshi is a <strong>CFTC-regulated</strong> (Commodity Futures Trading Commission) prediction market
        exchange based in the United States. It is the first federally regulated exchange dedicated to
        event contracts. Users trade binary contracts on real-world events — economics, politics, weather,
        sports, and more. Each contract pays out $1.00 if the event occurs and $0.00 if it does not.
        Kalshi operates with US dollar balances and standard KYC (Know Your Customer) verification.
      </P>

      <H3>Creating a Kalshi Account</H3>
      <OL>
        <li>Visit <strong>kalshi.com</strong> and click <strong>Sign Up</strong>.</li>
        <li>Complete the registration form with your email, name, and password.</li>
        <li>Verify your identity — Kalshi requires government-issued ID and may ask for proof of address. This is a regulatory requirement (CFTC).</li>
        <li>Fund your account via bank transfer, wire, or debit card.</li>
        <li>Once your account is funded and verified, you can generate API credentials.</li>
      </OL>

      <H3>Generating API Credentials</H3>
      <P>
        Kalshi uses a two-part authentication system: an <strong>API Key</strong> (public identifier) and
        an <strong>EC Private Key</strong> (cryptographic signing key). Together, they allow Prediction Market Agents
        to authenticate requests to the Kalshi API on your behalf.
      </P>
      <div className="mt-4 mb-2">
        <StepItem n={1} title="Navigate to API Settings" desc="Log in to kalshi.com → click your profile icon (top right) → Settings → API Keys. This page manages all your API credentials." />
        <StepItem n={2} title="Generate a New Key Pair" desc="Click 'Generate New API Key'. Kalshi will create both an API Key and a Private Key. Both are shown only once — copy them immediately." />
        <StepItem n={3} title="Save the Private Key File" desc="The private key downloads as a .pem file. Keep this file safe. If you lose it, you must revoke the key and generate a new pair. The private key starts with '-----BEGIN EC PRIVATE KEY-----' and ends with '-----END EC PRIVATE KEY-----'." />
        <StepItem n={4} title="Enter Credentials in Prediction Market Agents" desc="Go to Prediction Market Agents → Settings → Exchanges → Kalshi. Paste your API Key into the 'API Key' field. Paste the entire PEM content (including the BEGIN/END lines) into the 'Private Key' field." />
        <StepItem n={5} title="Test the Connection" desc="Click 'Test & Save'. Prediction Market Agents performs a read-only balance check against the Kalshi API. If successful, you'll see your current balance. If it fails, check the troubleshooting section below." />
      </div>

      <H3>What These Credentials Can and Cannot Do</H3>
      <P>
        Understanding the scope of API credentials is critical for security. Kalshi API keys are
        scoped to trading and read operations only.
      </P>
      <DataTable
        headers={["Permission", "Allowed?"]}
        rows={[
          ["Read account balance", "Yes"],
          ["Read open positions", "Yes"],
          ["Read trade history", "Yes"],
          ["Place orders (buy/sell)", "Yes"],
          ["Cancel open orders", "Yes"],
          ["Read market data", "Yes"],
          ["Withdraw funds", "No — requires web login + 2FA"],
          ["Change account settings", "No"],
          ["Change password or email", "No"],
          ["Access bank/payment info", "No"],
          ["Generate new API keys", "No"],
          ["Revoke other API keys", "No"],
        ]}
      />

      <Tip>
        Kalshi API keys <strong>cannot withdraw funds</strong> or access your bank information. Even if
        credentials were compromised, an attacker could only place trades — they cannot move money out
        of your Kalshi account. You can revoke a compromised key instantly from kalshi.com.
      </Tip>

      <H3>PEM Format Explained</H3>
      <P>
        The private key uses PEM (Privacy-Enhanced Mail) format, which is an encoded representation
        of the key wrapped in header/footer lines, used for cryptographic signature authentication. When you paste it into Prediction Market Agents, include the full
        content — the header, the encoded body, and the footer. Do not add extra whitespace or line breaks.
      </P>

      <H3>Security: How Credentials Are Stored</H3>
      <P>
        Prediction Market Agents encrypts all exchange credentials using <strong>bank-grade authenticated encryption</strong> before storing them in the database. This is the same
        encryption standard used by banks and government agencies.
      </P>
      <UL>
        <li><strong>At rest:</strong> Credentials are encrypted in the database. The raw API key and private key are never stored in plain text.</li>
        <li><strong>In transit:</strong> All API calls between Prediction Market Agents and Kalshi use HTTPS (TLS 1.2+).</li>
        <li><strong>In the UI:</strong> After saving, only a masked preview is shown. The full key is never displayed again.</li>
        <li><strong>Decryption:</strong> Keys are accessed securely only when needed — when the bot service needs to authenticate a request to Kalshi.</li>
      </UL>

      <Warn>
        Never share your Kalshi private key with anyone. If you suspect your credentials have been compromised,
        immediately revoke the API key from kalshi.com and use the <strong>Nuke All</strong> button in Prediction Market Agents
        to delete all stored credentials.
      </Warn>

      <H3>Kalshi Troubleshooting</H3>
      <DataTable
        headers={["Error", "Cause", "Fix"]}
        rows={[
          ["Connection failed", "Invalid API key format", "Verify the key matches the format shown on your Kalshi API settings page"],
          ["401 Unauthorized", "Key revoked or expired", "Generate a new key pair from kalshi.com → Settings → API Keys"],
          ["Invalid PEM", "Malformed private key", "Ensure you pasted the full PEM including BEGIN/END lines with no extra whitespace"],
          ["Signature mismatch", "Key pair mismatch", "The API key and private key must be from the same generation. Regenerate both."],
          ["Insufficient balance", "Connection works, low balance", "Not an error — your connection is valid. Deposit funds on kalshi.com to trade."],
          ["Rate limited (429)", "Too many API calls", "Kalshi rate-limits API access. Prediction Market Agents handles this automatically with backoff."],
          ["Network timeout", "Connectivity issue", "Check your internet connection and try again."],
        ]}
      />

      {/* ── Polymarket ─────────────────────────────── */}
      <H2>Polymarket</H2>

      <H3>What is Polymarket?</H3>
      <P>
        Polymarket is a <strong>decentralized prediction market</strong> built on the <strong>Polygon blockchain</strong>.
        Unlike Kalshi, which is a centralized US-regulated exchange, Polymarket operates as a non-custodial
        platform where trading happens through smart contracts. Users trade binary outcome tokens (YES/NO) using
        USDC (a US dollar stablecoin). Markets are created by the community and resolved through the{" "}
        <strong>UMA Optimistic Oracle</strong>, a decentralized dispute resolution system.
      </P>
      <P>
        Polymarket is accessible globally (with some jurisdictions restricted) and does not require traditional
        KYC for basic trading. It typically has higher volume and more diverse market categories than Kalshi,
        including global politics, crypto events, and pop culture.
      </P>

      <H3>Creating a Polymarket Account</H3>
      <P>
        Prediction Market Agents connects to Polymarket through a <strong>MetaMask</strong> browser wallet. This is the
        recommended and supported account type.
      </P>
      <OL>
        <li>Install the <strong>MetaMask</strong> browser extension from <strong>metamask.io</strong> and create a wallet (or import an existing one).</li>
        <li>Visit <strong>polymarket.com</strong> and click <strong>Log in</strong> or <strong>Sign up</strong>.</li>
        <li>Select <strong>MetaMask</strong> as the connection method. Approve the connection prompt in your MetaMask extension.</li>
        <li>Polymarket creates a smart contract wallet tied to your MetaMask address. This wallet handles all on-chain trading operations.</li>
        <li>Deposit USDC into your Polymarket account to begin trading.</li>
      </OL>

      <H3>Understanding Wallet Architecture</H3>
      <P>
        When you connect MetaMask, Polymarket creates a smart contract wallet
        that wraps your MetaMask address. Understanding this structure helps clarify what credentials Prediction Market Agents needs:
      </P>
      <UL>
        <li><strong>MetaMask wallet:</strong> Your external Ethereum address — the owner key. This is the private key Prediction Market Agents needs to sign orders.</li>
        <li><strong>Smart contract wallet:</strong> A wallet created by Polymarket. It executes trades on-chain and holds your positions. You interact with it through your MetaMask key.</li>
        <li><strong>Key distinction:</strong> The private key you export from MetaMask signs trade orders on Polymarket. It <strong>cannot</strong> withdraw funds from Polymarket — withdrawals require a separate web login flow.</li>
      </UL>

      <H3>Exporting Your Private Key from MetaMask</H3>
      <P>
        Prediction Market Agents needs your MetaMask account&apos;s private key to sign orders on Polymarket on your behalf.
      </P>
      <div className="mt-4 mb-2">
        <StepItem n={1} title="Open MetaMask" desc="Click the MetaMask extension icon in your browser toolbar." />
        <StepItem n={2} title="Select the correct account" desc="Make sure you have selected the same account you used to connect to Polymarket." />
        <StepItem n={3} title="Open Account Details" desc="Click the three-dot menu (⋮) next to the account name → select 'Account details'." />
        <StepItem n={4} title="Show Private Key" desc="Click 'Show private key'. MetaMask will ask you to enter your MetaMask password to confirm." />
        <StepItem n={5} title="Copy the Key" desc="The private key is a 66-character hexadecimal string starting with '0x'. Copy it immediately. Do NOT screenshot it or save it in an unencrypted file." />
      </div>

      <Warn>
        Your private key controls the ability to sign orders on Polymarket. Never share it with
        anyone. Never paste it into any website other than Prediction Market Agents. Prediction Market Agents will never ask for your
        MetaMask <strong>seed phrase</strong> — only the account private key.
      </Warn>

      <H3>Finding Your Deposit Address</H3>
      <P>
        Prediction Market Agents also needs your Polymarket <strong>Deposit Address</strong> to identify your wallet
        for balance checks and position queries.
      </P>
      <OL>
        <li>Log in to <strong>polymarket.com</strong> with MetaMask.</li>
        <li>Navigate to <strong>Settings</strong> (click your profile icon → Settings, or go directly to <Code>polymarket.com/settings</Code>).</li>
        <li>Look for the <strong>Deposit Address</strong> section. This is a <Code>0x</Code> address, 42 characters long.</li>
        <li>Copy the full address. This is <strong>not</strong> the same as your MetaMask address — it is the Polymarket-specific deposit address shown on the settings page.</li>
      </OL>

      <H3>Entering Credentials in Prediction Market Agents</H3>
      <div className="mt-4 mb-2">
        <StepItem n={1} title="Navigate to Exchanges" desc="In Prediction Market Agents, go to Settings → Exchanges → click 'Connect' on Polymarket." />
        <StepItem n={2} title="Complete MFA Verification" desc="The connection modal requires two-factor authentication first. Enter the 6-digit code from your authenticator app. If you haven't set up 2FA yet, you'll be guided through enrollment." />
        <StepItem n={3} title="Enter Private Key" desc="Paste your MetaMask private key (the 0x... hex string) into the 'Private Key' field. It must start with 0x." />
        <StepItem n={4} title="Enter Deposit Address" desc="Paste your Polymarket deposit address (also 0x... format, 42 characters) into the 'Deposit Address' field. Find this at polymarket.com/settings under 'Deposit Address'." />
        <StepItem n={5} title="Test & Save" desc="Click 'Test & Save'. Prediction Market Agents validates the key format and saves your encrypted credentials. Your connection status updates immediately." />
      </div>

      <H3>What Polymarket Credentials Can and Cannot Do</H3>
      <DataTable
        headers={["Permission", "Allowed?"]}
        rows={[
          ["Place orders (buy/sell)", "Yes"],
          ["Cancel open orders", "Yes"],
          ["Read positions and balance", "Yes"],
          ["Read market data", "Yes — no auth needed"],
          ["Withdraw USDC from Polymarket", "No — requires web login"],
          ["Access external wallets or other crypto", "No — scoped to Polymarket CLOB operations"],
          ["Move funds to other addresses", "No — limited to Polymarket exchange operations"],
          ["Change account settings", "No"],
          ["Access other DeFi protocols", "No"],
        ]}
      />

      <Tip>
        Your credentials are tightly scoped. Prediction Market Agents can place and cancel orders on Polymarket&apos;s
        CLOB, but it <strong>cannot withdraw funds</strong>, access other wallets, or interact with any
        blockchain protocol outside Polymarket&apos;s exchange contracts. Even in a worst-case scenario,
        no one can move money out of your Polymarket account using these credentials alone.
      </Tip>

      <H3>Order Signing</H3>
      <P>
        Polymarket uses cryptographic wallet signing for MetaMask-connected
        accounts. Orders are signed through your smart contract wallet — your MetaMask
        key is the owner, and the wallet executes trades on-chain using cryptographic signatures.
      </P>
      <P>
        Prediction Market Agents auto-detects the correct signing method from your deposit address. You do not need
        to configure this manually.
      </P>

      <H3>Security: How Polymarket Credentials Are Stored</H3>
      <P>
        Identical to Kalshi credentials, Polymarket keys are encrypted with <strong>bank-grade encryption</strong> at
        rest in the database. The private key is never stored in plain text. Additionally:
      </P>
      <UL>
        <li><strong>Key-derived credentials:</strong> Some operations derive temporary credentials from your private key as needed. These credentials are accessed securely when needed and cleared when the bot stops.</li>
        <li><strong>No seed phrases:</strong> Prediction Market Agents never asks for or stores your MetaMask seed phrase. Only the account private key is needed.</li>
        <li><strong>Masked display:</strong> After saving, the UI shows only <Code>0x1a2b...ef01</Code> — the full key is never displayed again.</li>
      </UL>

      <H3>Polymarket Troubleshooting</H3>
      <DataTable
        headers={["Error", "Cause", "Fix"]}
        rows={[
          ["Private key must start with 0x", "Invalid key format", "Ensure the key starts with 0x and is 66 characters total (0x + 64 hex chars). Re-export from MetaMask if needed."],
          ["Balance: 0 USDC", "Empty account or wrong deposit address", "Verify the deposit address matches your polymarket.com/settings page. Deposit USDC if the account is empty."],
          ["Signature rejected", "Wrong signature type", "Usually means the auto-detection chose the wrong type. Verify you are using the MetaMask account that is connected to Polymarket."],
          ["API key generation failed", "Derived key error", "Try re-entering your private key. The key may have been corrupted during copy/paste."],
          ["CLOB order rejected", "Insufficient allowance", "Your wallet may need to approve USDC spending on the CLOB contract. This usually happens automatically on first trade via the web UI."],
          ["Network error", "Polygon RPC issue", "Polymarket uses the Polygon network. Temporary RPC outages can cause connection failures. Usually resolves within minutes."],
          ["Enable 2FA first", "MFA not configured", "You must set up two-factor authentication in Settings → Security before connecting any exchange."],
        ]}
      />

      {/* ── AI API Keys ─────────────────────────────── */}
      <H2>AI API Keys</H2>
      <P>
        The Council strategy requires API access to multiple AI models from different providers. Rather than
        configuring separate API keys for each, Prediction Market Agents uses <strong>OpenRouter</strong> as a unified routing
        layer that provides access to all models through a single API key.
      </P>

      <H3>OpenRouter (Primary — Required)</H3>
      <P>
        OpenRouter is an API aggregator that routes requests to multiple AI providers (Anthropic, Google,
        xAI, DeepSeek, OpenAI, and others) through a single endpoint. One OpenRouter API key gives Prediction Market Agents
        access to all models used in the Council debate.
      </P>

      <H3>Getting an OpenRouter API Key</H3>
      <div className="mt-4 mb-2">
        <StepItem n={1} title="Create an Account" desc="Visit openrouter.ai and sign up with Google, GitHub, or email." />
        <StepItem n={2} title="Add Credits" desc="Go to openrouter.ai/credits and add funds. $5-10 is enough for hundreds of debate cycles. OpenRouter uses pay-as-you-go pricing." />
        <StepItem n={3} title="Generate an API Key" desc="Navigate to openrouter.ai/keys → click 'Create Key'. Give it a descriptive name like 'Prediction Market Agents'. Copy the key immediately — it is shown only once." />
        <StepItem n={4} title="Enter in Prediction Market Agents" desc="Go to Prediction Market Agents → Settings → API Keys → OpenRouter. Paste the key and save." />
      </div>

      <H3>Cost Expectations</H3>
      <P>
        Each full Council debate (6 AI agents analyzing one market) costs approximately{" "}
        <strong>$0.02 – $0.08</strong> depending on market complexity and response lengths. The high-confidence
        near-expiry fast-track (single model) costs roughly $0.015 per analysis.
      </P>
      <DataTable
        headers={["Usage Pattern", "Daily Cost Estimate", "Monthly Estimate"]}
        rows={[
          ["Light (10-20 markets/day)", "$0.20 – $1.00", "$6 – $30"],
          ["Moderate (50-100 markets/day)", "$1.00 – $5.00", "$30 – $150"],
          ["Heavy (200+ markets/day)", "$4.00 – $15.00", "$120 – $450"],
        ]}
      />

      <Tip>
        Prediction Market Agents tracks AI spending in real-time. The daily AI budget (default: $10/day) prevents
        runaway costs. When the budget is exhausted, analysis pauses until the next calendar day. You can
        adjust this limit in <strong>Settings → Safeguards</strong>.
      </Tip>

      <H3>Optional: Direct Provider Keys</H3>
      <P>
        For advanced users who already have direct API accounts with individual providers, Prediction Market Agents
        also supports:
      </P>
      <UL>
        <li><strong>Claude API Key</strong> (Anthropic) — Direct access to Claude models, bypassing OpenRouter. Enter at Settings → API Keys → Anthropic.</li>
        <li><strong>OpenAI API Key</strong> — Direct access to GPT/o4-mini models. Enter at Settings → API Keys → OpenAI.</li>
      </UL>
      <P>
        These are optional. If provided, Prediction Market Agents may use them as fallbacks when OpenRouter is
        unavailable. For most users, the OpenRouter key alone is sufficient.
      </P>

      {/* ── Credential Security Summary ─────────────────────────────── */}
      <H2>Credential Security Summary</H2>
      <P>
        Every credential you enter into Prediction Market Agents — exchange keys, private keys, API tokens — is
        protected with the same encryption standard trusted by banks and government agencies.
        Your secrets are never stored in plain text, never logged, and never leave the server
        unencrypted.
      </P>
      <DataTable
        headers={["Aspect", "Implementation"]}
        rows={[
          ["Encryption algorithm", "Bank-grade authenticated encryption"],
          ["Storage", "Encrypted in the database — raw values never written in plain text"],
          ["UI display", "Masked after save (first/last 4 characters only)"],
          ["In-transit", "HTTPS / TLS 1.2+ for all API calls"],
          ["Decryption", "On-demand only when bot needs to authenticate"],
          ["Deletion", "Nuke All permanently deletes all credentials instantly"],
          ["Access logging", "All credential access is logged with timestamps"],
          ["MFA requirement", "Two-factor authentication required before any credential change"],
        ]}
      />

      <Warn>
        <strong>Changing or adding exchange credentials always requires two-factor authentication.</strong>{" "}
        When you click Connect on any exchange, Prediction Market Agents prompts for your authenticator code before
        the credential form appears. If you have not enrolled in 2FA, the modal guides you through
        setup first. This ensures that even if someone accesses your Prediction Market Agents session, they cannot
        modify exchange connections without your authenticator device.
      </Warn>
    </>
  );
}

/* ─── Training vs Live ───────────────────────────────────────────────────── */

function TrainingVsLiveContent() {
  return (
    <>
      <P>
        Every Prediction Market Agents account starts in Training mode — a safe, zero-risk environment where your
        AI agents run the full trading pipeline against real market data without ever placing a real
        order. This safety-first design applies across both supported exchanges, Kalshi and
        Polymarket, so you can evaluate strategies, learn the platform, and build confidence before
        committing real capital.
      </P>

      <DataTable
        headers={["", "Training", "Live"]}
        rows={[
          ["Real money at risk", "No", "Yes"],
          ["Exchange orders", "Simulated (paper)", "Real orders placed"],
          ["AI analysis pipeline", "Full pipeline runs", "Full pipeline runs"],
          ["Rules engine", "All safeguards enforced", "All safeguards enforced"],
          ["Trade status label", "paper", "executed"],
          ["P&L tracking", "Separate training P&L", "Real P&L"],
          ["Default for new accounts", "Yes", "Must be explicitly enabled"],
          ["Supported exchanges", "Kalshi + Polymarket", "Kalshi + Polymarket"],
        ]}
      />

      <H2>Training Mode</H2>
      <P>
        Training mode is the default for every new account and every newly deployed agent. The
        complete pipeline runs end-to-end — markets are scanned, strategies analyze opportunities,
        the rules engine validates every decision — but no real order is ever sent to an exchange.
        Trades are recorded as <Code>paper</Code> trades, and P&amp;L is calculated against live
        market prices from the target exchange (Kalshi prices in cents, Polymarket prices in USDC
        decimals).
      </P>
      <P>
        Because the AI pipeline is identical in both modes, Training results are a reliable preview
        of how your agent would perform with real money. Use Training to compare strategies, tune
        risk parameters, and verify that exchange credentials work before flipping the switch.
      </P>
      <Tip>
        Training mode is not a downgraded experience. Every safeguard, every analysis step, and
        every rule fires exactly as it would in Live mode — the only difference is that the final
        order is simulated instead of submitted.
      </Tip>

      <H2>Live Mode</H2>
      <P>
        Live mode places real orders on the target exchange using your connected account credentials.
        Enabling it is a deliberate, multi-step process:
      </P>
      <OL>
        <li>Go to <strong>Settings &rarr; Safeguards</strong>.</li>
        <li>Toggle the <strong>Live Trading</strong> master switch to enabled.</li>
        <li>Confirm the warning dialog acknowledging that real capital will be used.</li>
        <li>On the strategy detail page, switch the individual agent from Training to <strong>Live</strong>.</li>
      </OL>
      <P>
        Live mode also requires valid exchange credentials for the exchange your strategy targets.
        Kalshi strategies need a Kalshi API key pair. Polymarket strategies need your proxy wallet
        private key and deposit wallet address. Configure both in <strong>Settings &rarr; Exchanges</strong>.
      </P>

      <Warn>
        Live trades use real capital and are irreversible. Kalshi orders execute against their order
        book. Polymarket orders are cryptographically signed and submitted to the CLOB smart
        contracts. Prediction Market Agents cannot recall or undo an order once it reaches the exchange. Always
        test thoroughly in Training mode first.
      </Warn>

      <H2>Two Levels of Control</H2>
      <P>
        Prediction Market Agents gives you two independent safety layers so live trading can never be enabled by
        accident:
      </P>
      <UL>
        <li>
          <strong>Global toggle</strong> — A master switch located in Settings &rarr; Safeguards.
          When this is off, every agent on the account runs in Training regardless of its individual
          setting or which exchange it targets.
        </li>
        <li>
          <strong>Per-agent mode</strong> — Each agent can be set to &quot;training&quot; or
          &quot;live&quot; individually from the strategy detail page or the Agents page. This
          lets you run some agents in Training while others trade live.
        </li>
      </UL>
      <P>
        Both levels must be set to Live before any real order is sent. The global toggle acts as a
        hard master switch — turn it off at any time to instantly revert every agent to Training.
        Training and Live environments are tracked independently: portfolio snapshots, trade history,
        and P&amp;L are all segmented by environment. This segmentation also applies per-exchange,
        so your Kalshi training P&amp;L and Polymarket training P&amp;L never mix.
      </P>

      <H2>Environment Filter</H2>
      <P>
        The dashboard header includes a three-way filter pill — <strong>All</strong>,{" "}
        <strong>Training</strong>, and <strong>Actual</strong> — that controls which data you see
        across the entire platform. The same filter appears at the top of the strategy detail page.
      </P>
      <UL>
        <li><strong>All</strong> — Shows combined data from both Training and Live environments.</li>
        <li><strong>Training</strong> — Shows only paper trades, training P&amp;L, and simulated positions.</li>
        <li><strong>Actual</strong> — Shows only real trades, live P&amp;L, and actual exchange positions.</li>
      </UL>
      <P>
        Use this filter to cleanly separate your testing results from real performance. The filter
        is persistent within a session, so switching pages keeps your selected view. It is available
        on the Portfolio, Trades, Strategy, and Agents pages.
      </P>

      <H2>Guided Walkthrough</H2>
      <P>
        New users are guided through a 13-step interactive walkthrough that teaches the entire
        platform before any trading begins. The walkthrough is presented as a focused overlay that
        highlights one feature at a time and automatically navigates between pages.
      </P>
      <OL>
        <li><strong>Welcome</strong> — Introduction to Prediction Market Agents and what the tour covers.</li>
        <li><strong>Strategy page</strong> — Overview of AI trading strategies and how they work.</li>
        <li><strong>Browse Strategies</strong> — How to explore strategy cards and pick one.</li>
        <li><strong>Training vs Live</strong> — The per-agent mode toggle on the strategy settings panel.</li>
        <li><strong>Configure Your Agent</strong> — Risk limits, position sizing, and market preferences.</li>
        <li><strong>Deploy Your Agent</strong> — How to start an agent with one click.</li>
        <li><strong>Trades page</strong> — Where every trade and its AI reasoning chain are logged.</li>
        <li><strong>Trade History</strong> — Reading trade status, side, entry price, and P&amp;L.</li>
        <li><strong>Portfolio page</strong> — Your command center for tracking overall performance.</li>
        <li><strong>Performance Chart</strong> — Cumulative P&amp;L over time, filterable by mode.</li>
        <li><strong>Open Positions</strong> — Active positions across all agents and exchanges.</li>
        <li><strong>Settings page</strong> — Exchange connections, API keys, and safeguards.</li>
        <li><strong>Completion</strong> — Confirmation that you are ready to start.</li>
      </OL>
      <P>
        The walkthrough can be replayed at any time from the sidebar. For new accounts that have
        not yet been approved for live trading, the tour runs in a forced mode — it cannot be
        skipped — ensuring every user understands the platform before they trade.
      </P>
      <Tip>
        During the walkthrough, the platform displays representative demo data so you can see how
        each page looks with active agents, open positions, and trade history. No real trades are
        placed during the tour.
      </Tip>

      <Warn>
        Live trading carries real financial risk. Markets can move against your positions, and
        prediction markets may resolve differently than your AI agents forecast. Start in Training
        mode, review your agents&apos; decisions, and only enable Live mode with capital you can
        afford to lose.
      </Warn>
    </>
  );
}

/* ─── Strategies ─────────────────────────────────────────────────────────── */

function StrategiesContent() {
  return (
    <>
      <P>
        Strategies define how your AI agents analyze prediction markets, weigh evidence, and decide
        when to trade. Each strategy brings a distinct analytical approach — from multi-model adversarial
        debate to research-driven probabilistic reasoning. Every strategy shares the same risk management
        pipeline, rules engine, and order execution layer.
      </P>

      <DataTable
        headers={["Strategy", "Approach", "Exchange", "Status"]}
        rows={[
          ["Council V2 (Kalshi)", "5-model sequential debate with edge filtering", "Kalshi", "Active"],
          ["Council V2 (Polymarket)", "5-model sequential debate with edge filtering", "Polymarket", "Active"],
          ["Superforecaster (Kalshi)", "Perplexity research + structured decomposition", "Kalshi", "Active"],
          ["Superforecaster (Polymarket)", "Perplexity research + structured decomposition", "Polymarket", "Active"],
          ["Council (Kalshi)", "5-agent parallel ensemble", "Kalshi", "Legacy"],
          ["Council (Polymarket)", "5-agent parallel ensemble", "Polymarket", "Legacy"],
          ["Arbitrage Hunter", "Cross-exchange pricing gap detection", "Multi", "Future"],
          ["Sentiment Alpha", "Real-time news sentiment shifts", "Polymarket", "Future"],
          ["Momentum Rider", "Volume and momentum signal tracking", "Kalshi", "Future"],
        ]}
      />

      <H2>Deploying a Strategy</H2>
      <OL>
        <li>Open <strong>Strategies</strong> in the dashboard and select the strategy you want to deploy.</li>
        <li>Configure deployment settings: duration (minutes, or 0 for unlimited) and cycle frequency (seconds between market scans).</li>
        <li>Optionally set per-agent overrides: max trade size, max positions, daily loss limit, min confidence threshold, max trades per day, and allowed market categories.</li>
        <li>Choose your environment: <strong>Training</strong> (paper trades, no real money) or <strong>Live</strong> (real orders on the exchange).</li>
        <li>Click <strong>Deploy</strong>. The agent launches immediately.</li>
      </OL>
      <P>
        Once deployed, the agent begins scanning markets, analyzing opportunities, and trading
        autonomously. Monitor progress in real-time from the strategy detail page — including live
        terminal logs streamed directly from the agent process.
      </P>

      <H2>Pre-flight Checks</H2>
      <P>
        Before every deployment, the system runs automatic pre-flight checks to prevent common errors:
      </P>
      <UL>
        <li><strong>No duplicate agents:</strong> The target strategy must not already be running for your account.</li>
        <li><strong>Valid credentials:</strong> Live deployments require active exchange credentials — Kalshi API keys or a Polymarket private key, depending on the strategy.</li>
        <li><strong>Live trading switch:</strong> The live trading switch must be turned on for live deployments. Training mode bypasses this check.</li>
      </UL>
      <P>
        If any check fails, deployment is blocked and a clear error message tells you exactly what to fix.
      </P>

      <H2>Council V2</H2>
      <P>
        Council V2 is the flagship strategy — a clean-sheet rewrite of the original Council that delivers
        faster execution, tighter edge filtering, and improved reliability. Three frontier models
        (Grok 4.1 Fast, Claude Opus 4.6, and Claude Sonnet 4.6) power five specialized agents that
        analyze every market through a sequential debate. Each agent builds on the previous output,
        creating a layered argument that surfaces genuine analytical edges rather than noise.
      </P>
      <P>
        Council V2 runs on both Kalshi and Polymarket. The AI pipeline is identical across exchanges —
        only the execution layer differs. Polymarket orders use signed transactions on the
        Polygon blockchain, while Kalshi orders use the standard REST API.
      </P>
      <P>
        For the full architecture deep dive — debate structure, edge calculation, position sizing, and
        risk layers — see{" "}
        <Link href="/about/council-v2" className="text-gain hover:underline">Council V2</Link>.
      </P>

      <H2>The Superforecaster</H2>
      <P>
        The Superforecaster takes a fundamentally different approach. Instead of debating across
        multiple models, it uses <strong>Perplexity Sonar Deep Research</strong> to gather comprehensive
        web research, then a single powerful reasoning model applies structured decomposition from the
        superforecasting literature — breaking questions into sub-questions, establishing base rates
        with real sample sizes, and synthesizing inside and outside views into a calibrated probability.
        Every data point is sourced, never hallucinated.
      </P>
      <P>
        Like Council V2, the Superforecaster runs on both Kalshi and Polymarket with an identical
        analytical pipeline. You choose the reasoning model at deployment time, giving you control
        over the speed-accuracy tradeoff.
      </P>
      <P>
        For the full methodology — research pipeline, decomposition framework, and calibration
        approach — see{" "}
        <Link href="/about/superforecaster" className="text-gain hover:underline">The Superforecaster</Link>.
      </P>

      <H2>The Council (Legacy)</H2>
      <P>
        The original Council strategy uses a 5-agent parallel ensemble where specialized AI models —
        Forecaster, News Analyst, Bull Researcher, Bear Researcher, and Risk Manager — each
        running on a different provider, independently analyze every market opportunity. Their probability
        estimates are combined through a confidence-adjusted weighted average to produce a consensus,
        requiring at least 3 of 5 agents to agree.
      </P>
      <Warn>
        The Council (Legacy) is deprecated. Existing deployments continue to run, but new users should
        choose Council V2 for better performance, faster execution, and active maintenance.
      </Warn>
      <P>
        For historical reference and a detailed walkthrough of the original pipeline, see{" "}
        <Link href="/about/council" className="text-gain hover:underline">The Council (Legacy)</Link>.
      </P>
    </>
  );
}

/* ─── The Council ────────────────────────────────────────────────────────── */

function CouncilContent() {
  return (
    <>
      {/* ── Deprecation Notice ─────────────────────────────── */}
      <Warn>
        The Council (V1) is deprecated. <Link href="/about/council-v2" className="text-[#FF6B8A] underline underline-offset-2">The Council V2</Link> is
        the active replacement with improved architecture, tighter risk controls, and lower latency.
        This page is preserved as a reference for users reviewing historical V1 trades.
      </Warn>

      <P>
        The Council V1 is a 5-agent parallel ensemble strategy that operated on both Kalshi and Polymarket.
        Five specialized AI models — each from a different provider — independently analyze every market
        opportunity. Their probability estimates are combined through a confidence-adjusted weighted average
        to produce a consensus probability, which is then compared against the market price to identify
        tradeable edges.
      </P>
      <P>
        Unlike single-model approaches, the Council forces diversity of perspective. A forecaster anchors
        the base rate, a news analyst scores recent sentiment, a bull makes the strongest YES case, a bear
        counters it, and a risk manager evaluates expected value. The weighted consensus reduces
        hallucination risk, overconfidence bias, and single-point-of-failure errors.
      </P>

      {/* ── Pipeline at a Glance ─────────────────────────────── */}
      <H2>Pipeline at a Glance</H2>
      <P>Every market opportunity flows through 8 stages before any capital moves:</P>
      <div className="mt-4 mb-2">
        <StepItem n={1} title="Market Scanning" desc="Fetch active binary markets from the exchange API. Filter by volume, category, and status. Repeat every 30 seconds." />
        <StepItem n={2} title="Selection & Dedup" desc="Run 6 pre-checks to avoid wasting AI credits on markets already analyzed, below budget, or on cooldown." />
        <StepItem n={3} title="Ensemble Analysis" desc="5 AI agents analyze the market in parallel: Forecaster, News Analyst, Bull Researcher, Bear Researcher, and Risk Manager. Their outputs are aggregated into a weighted consensus." />
        <StepItem n={4} title="Edge Calculation" desc="Compare the consensus probability against the market price. Required edge depends on confidence: 6% at high confidence, 8% at medium, 12% at low. Below 50% confidence always skips." />
        <StepItem n={5} title="Position Sizing" desc="A tier-based system determines how many contracts to buy based on account balance, confidence edge, and Kelly Criterion." />
        <StepItem n={6} title="Risk Checks" desc="Position limits, cash reserves, and the backend rules engine validate the trade. Any failure blocks execution. See Safeguards for details." />
        <StepItem n={7} title="Order Execution" desc="The order is intercepted, queued, and processed by the orchestrator. Training mode saves a paper trade. Live mode places a real order on the exchange." />
        <StepItem n={8} title="Settlement & Exit" desc="Open positions are monitored with dynamic stop-loss and take-profit levels. Auto-exit after max hold time. Settlement checker polls for resolved markets." />
      </div>

      {/* ── The 5 Agents ─────────────────────────────── */}
      <H2>The 5 Agents</H2>
      <P>
        All five agents run in parallel. Each agent produces an independent
        probability estimate and confidence score. The ensemble aggregates these into a single weighted-average
        probability. A minimum of 3 successful agent results is required to produce a consensus.
      </P>
      <DataTable
        headers={["Role", "Model", "Weight", "Purpose"]}
        rows={[
          ["Forecaster", "Grok 4.1 Fast (xAI)", "30%", "Estimates true YES probability using base rates and historical patterns"],
          ["News Analyst", "Claude Sonnet 4.6 (Anthropic)", "20%", "Scores recent news sentiment and relevance to the market"],
          ["Bull Researcher", "o4-mini (OpenAI)", "20%", "Makes the strongest evidence-based YES case with 3-5 arguments"],
          ["Bear Researcher", "Gemini 3.1 Pro Preview (Google)", "15%", "Counters the Bull with counter-evidence and risk factors"],
          ["Risk Manager", "DeepSeek V3.2 (DeepSeek)", "15%", "Calculates expected value, risk score, and recommended position size"],
        ]}
      />

      {/* ── Agent Weights & Consensus ─────────────────────────────── */}
      <H2>Weights and Consensus Logic</H2>
      <P>
        The ensemble computes a confidence-adjusted weighted average. Each agent&apos;s base weight is
        multiplied by its self-reported confidence (floored at 0.1 to prevent zero-weight), so agents
        that are more confident about their estimate contribute more to the final probability.
      </P>
      <P>
        <strong>Formula:</strong> <Code>weighted_prob = sum(prob_i * weight_i * max(conf_i, 0.1)) / sum(weight_i * max(conf_i, 0.1))</Code>
      </P>
      <P>
        If the standard deviation of agent probabilities exceeds 0.25 (the disagreement threshold),
        a confidence penalty of up to 30% is applied. High disagreement signals uncertainty, and the
        system responds by reducing conviction rather than forcing a trade.
      </P>

      {/* ── Agent Role Details ─────────────────────────────── */}
      <H2>Agent Role Details</H2>

      <H3>Forecaster (Grok 4.1 Fast)</H3>
      <P>
        Estimates the true probability that the market resolves YES using a structured 5-step method:
        establish the base rate, assess current conditions, check market structure (single event vs. parlay),
        calibrate toward the base rate when uncertain, and flag edge only when the estimate differs from
        market price by more than 10 percentage points. Must not fabricate statistics.
      </P>
      <P>
        <strong>Output:</strong> <Code>probability</Code>, <Code>confidence</Code>,
        {" "}<Code>base_rate</Code>, <Code>side</Code>, <Code>reasoning</Code>.
      </P>

      <H3>News Analyst (Claude Sonnet 4.6)</H3>
      <P>
        Scores recent news sentiment from -1.0 (strongly bearish) to +1.0 (strongly bullish) and
        relevance from 0.0 to 1.0. Only the last 24-48 hours of developments are treated as meaningful.
        The News Analyst&apos;s probability is derived from sentiment and relevance:
        {" "}<Code>prob = 0.5 + (sentiment * relevance * 0.5)</Code>.
      </P>
      <P>
        <strong>News sources:</strong> Category-aware RSS feeds (NYT, BBC) plus optional Perplexity Sonar Pro
        for real-time web search.
      </P>

      <H3>Bull Researcher (o4-mini)</H3>
      <P>
        Makes the strongest evidence-based YES case with 3-5 concrete arguments. Estimates a
        {" "}<Code>probability_floor</Code> — the minimum reasonable YES probability even if the bear
        is right about some things. Identifies near-term catalysts that could push probability higher.
      </P>

      <H3>Bear Researcher (Gemini 3.1 Pro Preview)</H3>
      <P>
        Counters the Bull&apos;s specific arguments with 3-5 concrete reasons the event is unlikely.
        Estimates a <Code>probability_ceiling</Code> — the maximum reasonable YES probability.
        Highlights risk factors and historical precedents where similar events failed.
      </P>

      <H3>Risk Manager (DeepSeek V3.2)</H3>
      <P>
        The quantitative backbone. Calculates expected value, assigns a risk score (1-10), recommends
        position size using fractional Kelly criterion, and evaluates edge durability.
      </P>
      <UL>
        <li><strong>EV for buying YES at X¢:</strong> <Code>(your_probability * $1.00) - $0.X</Code></li>
        <li><strong>EV for buying NO at Y¢:</strong> <Code>((1 - your_probability) * $1.00) - $0.Y</Code></li>
        <li><strong>Kelly sizing:</strong> <Code>size = (edge / odds) * kelly_fraction</Code></li>
      </UL>

      {/* ── Edge Calculation ─────────────────────────────── */}
      <H2>Edge Calculation</H2>
      <P>
        After the ensemble produces a consensus probability, the agent calculates the edge — the
        difference between the AI&apos;s estimate and the market price. The edge must be in the same
        direction as the proposed trade.
      </P>
      <DataTable
        headers={["Consensus Confidence", "Edge Required", "Reasoning"]}
        rows={[
          ["80%+", "6%+", "High certainty — smaller edge is still worth taking"],
          ["60-79%", "8%+", "Medium certainty — need a clearer mispricing"],
          ["50-59%", "12%+", "Low certainty — only trade if the edge is obvious"],
          ["Below 50%", "Always skip", "Confidence too low regardless of edge"],
        ]}
      />

      {/* ── Position Sizing ─────────────────────────────── */}
      <H2>Position Sizing</H2>
      <P>
        A tier-based system adapts position size to account balance. Smaller accounts allocate a larger
        percentage per trade; larger accounts allocate less to protect capital.
      </P>
      <DataTable
        headers={["Account Size", "Base %", "Max %", "Max Contracts/Order"]}
        rows={[
          ["Under $100", "20%", "40%", "10"],
          ["$100 - $1K", "5%", "15%", "50"],
          ["$1K - $10K", "3%", "8%", "250"],
          ["$10K - $100K", "2%", "5%", "1,000"],
          ["$100K+", "1%", "3%", "5,000"],
        ]}
      />
      <P>
        The base investment is scaled by the confidence edge: <Code>investment * (1 + multiplier * edge)</Code>,
        capped at the tier maximum. After the tier calculation, the Risk Manager&apos;s recommended size acts
        as an additional cap. Quarter-Kelly (<Code>kelly_fraction = 0.25</Code>) is used in production for safety.
      </P>

      {/* ── Risk Checks ─────────────────────────────── */}
      <H2>Risk Checks</H2>
      <P>
        Every trade must pass three layers of deterministic validation: agent-level position limits,
        the backend 11-rule engine, and account-level caps. Any single failure blocks execution.
        All thresholds are configurable from <strong>Settings → Safeguards</strong>.
        See the <Link href="/about/safeguards" className="text-white/90 underline underline-offset-2">Safeguards</Link> page
        for the full rule-by-rule breakdown.
      </P>

      {/* ── Execution & Settlement ─────────────────────────────── */}
      <H2>Execution & Settlement</H2>
      <P>
        The agent never talks directly to the exchange. Every order is intercepted, queued for
        validation, and processed by the orchestrator. Training mode saves
        a paper trade; live mode places a real order. SKIP decisions are also recorded for a complete
        audit trail.
      </P>
      <P>
        Open positions are monitored with dynamic stop-loss and take-profit levels. Positions auto-exit
        after max hold time (default: 240 hours). A settlement checker polls the exchange for resolved
        markets and updates P&L.
      </P>

      {/* ── Polymarket Differences ─────────────────────────────── */}
      <H2>Polymarket Differences</H2>
      <P>
        The same 5-agent ensemble runs on Polymarket with identical AI logic. The differences are in
        how markets are fetched, how orders are signed, and how settlements resolve. The backend detects
        the target exchange from the agent configuration and routes accordingly.
      </P>

      <H3>Market Data</H3>
      <P>
        The Polymarket variant fetches markets from the exchange data API and order book data from the exchange API. Markets are identified by
        condition IDs and token IDs rather than Kalshi tickers.
      </P>

      <H3>Order Signing</H3>
      <P>
        Polymarket orders are signed using cryptographic wallet signatures on the Polygon
        network. Credentials are handled securely as needed from the user&apos;s private key. Wallet-based signing is used for order authentication.
      </P>

      <H3>Settlement</H3>
      <P>
        Polymarket uses the <strong>UMA Optimistic Oracle</strong> for outcome resolution, which introduces
        a dispute window before finality. The settlement checker accounts for this delay when polling for
        resolved markets.
      </P>

      <H3>Kalshi vs. Polymarket Comparison</H3>
      <DataTable
        headers={["Aspect", "Kalshi", "Polymarket"]}
        rows={[
          ["Auth", "Cryptographic signature authentication", "Wallet-based signing"],
          ["Chain", "Off-chain (centralized)", "Polygon"],
          ["Settlement", "Kalshi internal resolution", "UMA Optimistic Oracle"],
          ["Price format", "Cents (1-99)", "Decimal (0.01-0.99)"],
          ["Market IDs", "Ticker strings", "Condition ID + Token ID"],
        ]}
      />

      {/* ── Models & Costs ─────────────────────────────── */}
      <H2>Models & Costs</H2>
      <P>
        All AI requests route through OpenRouter. The ensemble model roster as configured in V1:
      </P>
      <DataTable
        headers={["Model", "Provider", "Role", "Weight"]}
        rows={[
          ["Grok 4.1 Fast", "xAI (via OpenRouter)", "Forecaster", "30%"],
          ["Claude Sonnet 4.6", "Anthropic (via OpenRouter)", "News Analyst", "20%"],
          ["o4-mini", "OpenAI (via OpenRouter)", "Bull Researcher", "20%"],
          ["Gemini 3.1 Pro Preview", "Google (via OpenRouter)", "Bear Researcher", "15%"],
          ["DeepSeek V3.2", "DeepSeek (via OpenRouter)", "Risk Manager", "15%"],
        ]}
      />
      <P>
        A typical full ensemble pass costs approximately <strong>$0.02 - $0.08</strong> depending on market
        complexity and response lengths. The system includes automatic model failover if any provider is temporarily unavailable.
      </P>

      {/* ── All Configurable Settings ─────────────────────────────── */}
      <H2>All Configurable Settings</H2>
      <P>
        Agent-level settings are in the agent&apos;s configuration. Account-level settings are in
        {" "}<strong>Settings → Safeguards</strong>.
      </P>

      <H3>Market Scanning</H3>
      <DataTable
        headers={["Setting", "Default", "Description"]}
        rows={[
          ["Min Volume", "Tiered (50-1,000)", "Minimum contracts traded, scales with account balance"],
          ["Scan Interval", "30s", "Seconds between market scan cycles"],
          ["Max Expiry", "30 days", "Max days to expiry for eligible markets"],
          ["Preferred Categories", "All", "Whitelist (empty = trade all)"],
          ["Excluded Categories", "None", "Blacklist (empty = exclude none)"],
        ]}
      />

      <H3>Ensemble & AI</H3>
      <DataTable
        headers={["Setting", "Default", "Description"]}
        rows={[
          ["Min Models for Consensus", "3", "Minimum successful agents to produce a consensus"],
          ["Disagreement Threshold", "0.25", "Std dev above this triggers confidence penalty"],
          ["Parallel Requests", "true", "Run agents in parallel (vs. sequential fallback)"],
          ["Max Ensemble Cost", "$0.50", "Max cost per ensemble decision"],
          ["Daily AI Budget", "$10", "Daily spending limit on AI API calls"],
          ["Analysis Cooldown", "3 hours", "Min hours between same-market analyses"],
          ["Max Analyses per Market/Day", "4", "Max analyses per market per day"],
          ["AI Temperature", "0", "Model temperature (0 = deterministic)"],
          ["AI Max Tokens", "8,000", "Max tokens per model response"],
        ]}
      />

      <H3>Position Sizing & Risk</H3>
      <DataTable
        headers={["Setting", "Default", "Description"]}
        rows={[
          ["Tier system", "Auto", "Base/max percentages adapt to account size"],
          ["Position Size Multiplier", "1.0", "Multiplier for edge-based scaling"],
          ["Kelly Fraction", "0.25", "Quarter-Kelly for production safety"],
          ["Max Single Position", "30%", "Max % of portfolio per position"],
          ["Max Positions", "3", "Max concurrent open positions"],
          ["Min Balance", "$5", "Minimum balance to start trading"],
        ]}
      />

      <H3>Trading Frequency</H3>
      <DataTable
        headers={["Setting", "Default", "Description"]}
        rows={[
          ["Max Trades per Hour", "20", "Rate limit on trade execution"],
          ["Run Interval", "10 min", "How often the trading cycle runs"],
          ["Position Check Interval", "15s", "How often open positions are checked"],
          ["Processor Workers", "5", "Concurrent market analysis threads"],
        ]}
      />

      <H3>Exit & Risk Management</H3>
      <DataTable
        headers={["Setting", "Default", "Description"]}
        rows={[
          ["Profit Threshold", "20%", "Take profits at this return"],
          ["Loss Threshold", "15%", "Cut losses at this drawdown"],
          ["Max Hold Time", "240 hours", "Auto-exit after 10 days"],
          ["Confidence Decay Threshold", "25%", "Exit if confidence drops this much"],
          ["Max Daily Loss %", "20%", "Daily loss kill switch (% of capital)"],
        ]}
      />

      {/* ── Risk Disclaimer ─────────────────────────────── */}
      <Warn>
        Prediction market trading involves real financial risk. Past performance does not guarantee
        future results. The Council V1 is deprecated and no longer receives updates. If you are starting
        fresh, use <Link href="/about/council-v2" className="text-[#FF6B8A] underline underline-offset-2">The Council V2</Link> instead.
      </Warn>
    </>
  );
}


/* ─── The Superforecaster ───────────────────────────────────────────────── */

function SuperforecasterContent() {
  return (
    <>
      <P>
        The Superforecaster is a research-first prediction strategy that grounds every forecast in sourced,
        real-time evidence. Before the reasoning model ever sees a market question,{" "}
        <strong>Perplexity Sonar Pro</strong> searches the live web for recent developments, historical base rates,
        stakeholder signals, and arguments on both sides of the outcome. The reasoning model receives verified
        facts rather than relying on stale training data — every claim traces back to a real source.
      </P>
      <P>
        Available on both <strong>Kalshi</strong> and <strong>Polymarket</strong>, the Superforecaster takes the
        opposite approach from the Council&apos;s multi-model debate. Where the Council uses breadth (five
        specialist models debating), the Superforecaster uses <strong>depth</strong> — a single powerful
        reasoning model armed with comprehensive, pre-gathered research. Its structured decomposition
        methodology comes directly from the superforecasting literature: decompose the question, anchor to
        base rates with real sample sizes, apply inside and outside views independently, then synthesize a
        calibrated probability weighted by evidence quality.
      </P>
      <P>
        The default reasoning model is <strong>Claude Opus 4.6</strong>, selectable from the bot settings dropdown.
        The research model is always <strong>Perplexity Sonar Pro</strong>, which performs agentic multi-step
        web searches with built-in citation tracking.
      </P>

      {/* ── Pipeline Overview ─────────────────────────────────── */}
      <H2>The Pipeline at a Glance</H2>
      <P>Every market opportunity flows through 8 stages before any capital moves:</P>
      <div className="mt-4 mb-2">
        <StepItem n={1} title="Market Scanning" desc="Fetch active binary markets from the exchange API, filter by volume, expiry, category, and price extremes." />
        <StepItem n={2} title="Selection & Dedup" desc="Skip already-decided markets (configurable cooldown), enforce daily AI budget, and filter by allowed categories." />
        <StepItem n={3} title="Web Research" desc="Perplexity Sonar Pro searches the live web for recent developments, base rate data, stakeholder signals, and arguments for/against. Runs in batches of 3 to respect rate limits." />
        <StepItem n={4} title="Superforecaster Analysis" desc="Two-phase reasoning: Phase 1 audits research for contradictions and hallucinations (quality score 1-10). Phase 2 applies structured decomposition to produce a calibrated probability." />
        <StepItem n={5} title="Edge Calculation" desc="Compare AI probability to market price. Required edge: 4% at high confidence (>=80%), 6% at medium (60-79%), 8% at low (<60%). Always skip below 50% confidence." />
        <StepItem n={6} title="Position Sizing" desc="Tier-based system by account size with Kelly Criterion scaling (quarter-Kelly). Cash reserves, position limits, and exchange minimum order sizes enforced." />
        <StepItem n={7} title="Risk Checks" desc="11 bot-level + 6 account-level rules validated by the backend orchestrator. Any single failure blocks the trade." />
        <StepItem n={8} title="Execution & Settlement" desc="Order intercepted, validated, and routed. Training mode saves paper trades; live mode places real orders on the exchange." />
      </div>

      {/* ── Step 1: Market Scanning ─────────────────────────────── */}
      <H2>Step 1: Market Scanning</H2>
      <P>
        The agent fetches active binary markets from the exchange&apos;s data API. On Kalshi, it uses
        cursor-based pagination (up to 1,000 markets per page, 5 pages max) with server-side filters for
        close time and status. On Polymarket, it queries the data API with offset pagination filtered by volume, active status, and expiry window.
      </P>
      <P>Only markets matching all of these criteria survive the scan:</P>
      <UL>
        <li><strong>Market type:</strong> Binary only — scalar, combo, and multivariate markets are excluded.</li>
        <li><strong>Status:</strong> Active and open only. No closed, settled, or suspended markets.</li>
        <li><strong>Price range:</strong> YES price must be between $0.03 and $0.97. Markets outside this range are effectively resolved.</li>
        <li><strong>Volume:</strong> Must meet the minimum volume threshold (default: 50). Configurable per bot.</li>
        <li><strong>Expiry:</strong> Must close within the configured window (default: 7 days). Markets with at least 1 hour remaining.</li>
        <li><strong>Category:</strong> If allowed categories are configured, only those categories pass. Otherwise all categories are eligible.</li>
      </UL>

      <H3>Category Inference</H3>
      <P>
        Markets are automatically categorized by scanning event tickers and titles for known keywords:
      </P>
      <DataTable
        headers={["Category", "Detected Keywords"]}
        rows={[
          ["Sports", "NBA, NFL, MLB, NHL, NCAA, UFC, Soccer, Tennis, PGA, Golf"],
          ["Crypto", "Bitcoin, BTC, ETH, Crypto, SOL, DOGE, XRP, DeFi"],
          ["Economics", "Fed, CPI, GDP, Inflation, Jobs, Tariff, Oil, Gold, Treasury"],
          ["Politics", "Trump, Biden, Election, Vote, Congress, Senate, President"],
          ["Weather", "Weather, Temperature, Hurricane, Climate, Storm"],
          ["Tech", "AI, Apple, Google, Meta, Microsoft, Tesla, OpenAI"],
          ["Other", "Default when no keywords match"],
        ]}
      />

      <H3>Price Handling</H3>
      <P>
        On Kalshi, prices arrive as dollar strings. The agent computes midpoint prices from the bid/ask
        spread: <Code>yes_price = (yes_bid + yes_ask) / 2</Code>. On Polymarket, prices come from
        the <Code>outcomePrices</Code> array as floats (0.0 to 1.0) representing YES and NO probabilities.
      </P>

      {/* ── Step 2: Selection & Dedup ─────────────────────────────── */}
      <H2>Step 2: Selection & Deduplication</H2>
      <P>
        Before spending AI credits, the agent applies pre-checks to avoid redundant work. Markets that
        fail any check are skipped without calling any AI model.
      </P>
      <div className="mt-4 mb-2">
        <StepItem n={1} title="Backend Dedup" desc="Queries the backend for markets already decided within the cooldown window (default: 6 hours). Markets that were executed, skipped, or rejected are excluded." />
        <StepItem n={2} title="Daily AI Budget" desc="Checks if the daily AI spending limit has been exceeded (default: $10/day). If over budget, all analysis stops until the next day." />
        <StepItem n={3} title="Category Filter" desc="If allowed_categories is configured, markets outside those categories are excluded before any AI call." />
      </div>
      <P>
        After filtering, the top {"{"}config.max_markets_per_cycle{"}"} markets by volume (default: 10) are
        selected for research and analysis in the current cycle.
      </P>

      <DataTable
        headers={["Setting", "Default", "What It Does"]}
        rows={[
          ["Reanalyze Cooldown", "6 hours", "Min hours before the same market can be re-analyzed"],
          ["Daily AI Budget", "$10", "Max daily spend on AI API calls (research + reasoning combined)"],
          ["Max Markets per Cycle", "10", "Top N markets by volume to analyze each cycle"],
          ["Allowed Categories", "All", "Comma-separated category whitelist (empty = trade all)"],
        ]}
      />

      {/* ── Step 3: Web Research ─────────────────────────────── */}
      <H2>Step 3: Web Research (Perplexity Sonar Pro)</H2>
      <P>
        This is the Superforecaster&apos;s defining advantage. Before the reasoning model forms any
        opinion, Perplexity Sonar Pro performs agentic, multi-step web searches and returns structured
        findings with source citations. The research model always runs at temperature 0.0 for
        deterministic, fact-focused output.
      </P>
      <P>
        For each market, the research prompt requests six categories of evidence:
      </P>
      <OL>
        <li><strong>Recent Developments:</strong> Key news from the last 7 days directly relevant to the outcome, with dates, sources, and specific facts. If the event has not occurred yet, the model must state this clearly.</li>
        <li><strong>Base Rate Data:</strong> Historical frequency of similar events. How often have comparable situations resolved YES vs. NO? Specific numbers and sample sizes required.</li>
        <li><strong>Key Stakeholders & Signals:</strong> What have relevant decision-makers, experts, or officials said? Scheduled events (votes, hearings, deadlines) that could force resolution.</li>
        <li><strong>Arguments for YES:</strong> The strongest factual evidence and reasoning that the market resolves YES.</li>
        <li><strong>Arguments for NO:</strong> The strongest factual evidence and reasoning that the market resolves NO.</li>
        <li><strong>Expert & Statistical Signals:</strong> Domain expert opinions, statistical models, polls, and historical patterns. Explicitly excludes prediction market prices — the research focuses on independent evidence only.</li>
      </OL>
      <P>
        Research runs in parallel batches of 3 markets to stay within rate limits, with a 1-second delay
        between batches. Each research call has a 90-second timeout with up to 3 retries on server errors.
        The model receives up to 3,000 tokens of research per market.
      </P>

      <Tip>
        The research prompt includes a critical anti-hallucination guardrail: it injects today&apos;s
        date and instructs the model to never fabricate outcomes or claim events have occurred without
        verifiable sources. If no confirmed result exists, the model must state that explicitly.
      </Tip>

      {/* ── Step 4: Superforecaster Analysis ─────────────────────────────── */}
      <H2>Step 4: Superforecaster Analysis</H2>
      <P>
        The core analysis happens in two mandatory phases within a single model call to the user-selected
        reasoning model (default: <strong>Claude Opus 4.6</strong>). The model must complete Phase 1 before
        beginning Phase 2 — this ordering prevents the model from anchoring to the market price before
        evaluating evidence quality.
      </P>

      <H3>Phase 1: Research Audit</H3>
      <P>
        The model acts as an <strong>adversarial reviewer</strong>, examining the research with the goal
        of finding errors rather than confirming conclusions. It checks for five categories of problems:
      </P>
      <UL>
        <li><strong>Internal Contradictions:</strong> Do any data points conflict with each other? A claimed &quot;52-week low&quot; higher than the current price suggests a data error or stock split.</li>
        <li><strong>Logical Consistency:</strong> Are YES/NO outcome labels applied correctly? Does any argument accidentally support the opposite outcome from what it claims?</li>
        <li><strong>Suspicious Data:</strong> Do any numbers, dates, or claims seem implausible in context? The model cross-checks figures against each other.</li>
        <li><strong>Hallucination Signals:</strong> Does the research claim an event has &quot;already happened&quot; while the market price suggests it has not resolved? Anything dated after today is speculation, not fact.</li>
        <li><strong>Missing Context:</strong> What important information is absent from the research? Key gaps are flagged.</li>
      </UL>
      <P>
        After the audit, the model explicitly states which findings it trusts and will use, which it discards
        and why, and assigns an overall quality score from 1 to 10. If research quality scores below 3,
        the system logs a warning — the model should anchor more heavily to base rates than to thin evidence.
      </P>

      <H3>Phase 2: Probability Estimation via Structured Decomposition</H3>
      <P>
        Using only the findings marked as trusted in Phase 1, the model follows a 7-step methodology
        drawn from the superforecasting literature:
      </P>
      <OL>
        <li><strong>Decompose</strong> — Break the question into independent sub-questions that can be assessed separately.</li>
        <li><strong>Establish Base Rates</strong> — For each sub-question, find the historical frequency of similar events. Must include sample sizes — &quot;3 out of 8 comparable periods since 2017&quot; not just &quot;it has happened before.&quot; If no hard data exists, the model must reason from first principles and state that the estimate is a reasoned guess, not an empirical finding.</li>
        <li><strong>Inside View</strong> — What specific current evidence shifts probability from the base rate? Each adjustment must reference sourced research from Phase 1.</li>
        <li><strong>Outside View</strong> — What does the reference class of similar events suggest, ignoring the specific details? This is the probability anchor.</li>
        <li><strong>Synthesize</strong> — Weight inside and outside views independently, then combine. Strong corroborated evidence justifies larger departures from the base rate. Weak or contradictory evidence means staying close to the outside view.</li>
        <li><strong>Calibrate</strong> — Express as a precise probability (0.00 to 1.00), never using vague words like &quot;likely.&quot;</li>
        <li><strong>Compare to Market</strong> — Only after forming an independent estimate, compare it to the market price. If they agree, the market is fairly priced. If they diverge, explain why with specific evidence. The model must not force an edge where none exists.</li>
      </OL>

      <H3>Output Format</H3>
      <P>
        The model returns structured JSON containing:
      </P>
      <UL>
        <li><Code>research_quality</Code> — Score (1-10), issues found, trusted findings, discarded findings with reasons.</li>
        <li><Code>probability</Code> (0.00-1.00) — Calibrated P(YES) from structured decomposition.</li>
        <li><Code>confidence</Code> (0.00-1.00) — How well-calibrated the estimate is. Higher when evidence is strong and corroborated.</li>
        <li><Code>side</Code> (&quot;YES&quot; or &quot;NO&quot;) — Which side has positive expected value.</li>
        <li><Code>limit_price</Code> (0.01-0.99) — Maximum price the model would pay for the recommended side.</li>
        <li><Code>position_size_pct</Code> (1-25) — Suggested percent of available capital, lower when uncertain.</li>
        <li><Code>should_trade</Code> — Boolean flag indicating whether the model believes genuine edge exists backed by specific evidence.</li>
        <li><Code>reasoning</Code> — Full audit summary followed by step-by-step decomposition, base rate, evidence, probability, and market comparison.</li>
        <li><Code>key_factors</Code> — List of the most important factors driving the estimate.</li>
      </UL>

      <H3>Key Rules</H3>
      <UL>
        <li><strong>Independence first.</strong> The model forms its probability estimate before comparing to the market. It starts from base rates and evidence, not from the current price.</li>
        <li><strong>Never fabricate statistics.</strong> If no hard data exists, reason from first principles and say so explicitly.</li>
        <li><strong>Confidence reflects evidence quality, not probability extremity.</strong> A 90% probability with 40% confidence means the outcome appears very likely but the analysis rests on weak evidence. The edge calculation demands a larger mispricing to compensate.</li>
        <li><strong>Honesty about uncertainty.</strong> High confidence requires strong, corroborated evidence. The model must not force an edge where the market is fairly priced.</li>
      </UL>

      {/* ── Step 5: Edge Calculation ─────────────────────────────── */}
      <H2>Step 5: Edge Calculation & Decision</H2>
      <P>
        After analysis, the agent calculates the edge — the absolute difference between the AI&apos;s
        probability estimate and the market price for the traded side:
      </P>
      <UL>
        <li><Code>edge = |ai_probability - market_price|</Code> for the side being traded.</li>
        <li>For YES trades: <Code>ai_prob = probability</Code>, <Code>market_price = yes_price</Code>.</li>
        <li>For NO trades: <Code>ai_prob = 1 - probability</Code>, <Code>market_price = no_price</Code>.</li>
      </UL>
      <P>
        The trade only proceeds if confidence meets the minimum threshold (50%) AND the edge exceeds
        the tier requirement for that confidence level:
      </P>

      <H3>Required Edge by Confidence</H3>
      <DataTable
        headers={["AI Confidence", "Edge Required", "Reasoning"]}
        rows={[
          [">=80%", ">=4%", "High certainty — strong corroborated evidence justifies a tighter threshold"],
          ["60-79%", ">=6%", "Medium certainty — need a clearer mispricing before committing capital"],
          ["50-59%", ">=8%", "Low certainty — only trade obvious mispricings with wide margins"],
          ["<50%", "Always skip", "Confidence too low to act regardless of apparent edge"],
        ]}
      />
      <Tip>
        Example: AI confidence 75%, AI probability 65%, market YES price $0.58. Edge = |0.65 - 0.58| = 7%.
        Required for 75% confidence = 6%. Since 7% &gt; 6%, this trade passes the edge check and proceeds
        to position sizing.
      </Tip>

      {/* ── Step 6: Position Sizing ─────────────────────────────── */}
      <H2>Step 6: Position Sizing</H2>
      <P>
        Position sizing adapts automatically to account size using a tier-based system. Larger accounts
        allocate a smaller percentage per trade and can hold more contracts per order.
      </P>

      <H3>Tier Table</H3>
      <DataTable
        headers={["Account Size", "Base %", "Max %", "Max Contracts/Order"]}
        rows={[
          ["Under $100", "20%", "40%", "10"],
          ["$100 - $1K", "5%", "15%", "50"],
          ["$1K - $10K", "3%", "8%", "250"],
          ["$10K - $100K", "2%", "5%", "1,000"],
          ["$100K+", "1%", "3%", "5,000"],
        ]}
      />

      <H3>How the Calculation Works</H3>
      <OL>
        <li><strong>Determine available cash:</strong> Subtract the cash reserve (5% of balance) from total cash. If available cash is zero or negative, no trades are placed.</li>
        <li><strong>Look up tier:</strong> Find the row matching the current balance.</li>
        <li><strong>Base investment:</strong> <Code>available_cash x base_pct</Code></li>
        <li><strong>Edge-scaled multiplier:</strong> <Code>scaler = 1.0 + (kelly_multiplier x signed_edge)</Code>, clamped between 0.1x and 3.0x. Stronger edges produce larger positions.</li>
        <li><strong>Apply scaler:</strong> <Code>investment = base_investment x scaler</Code></li>
        <li><strong>Cap at max:</strong> The lesser of <Code>available_cash x max_pct</Code> and <Code>balance x max_position_pct / 100</Code></li>
        <li><strong>Convert to contracts:</strong> <Code>int(investment / market_price)</Code>, capped at <Code>tier_max_contracts</Code></li>
        <li><strong>Enforce minimums:</strong> If the position cost is below <Code>min_position_size</Code> ($1 default), bump to the minimum viable quantity if cash permits.</li>
        <li><strong>Kelly criterion cap:</strong> If the risk manager recommends a lower size, the position is reduced accordingly. Uses quarter-Kelly (0.25 multiplier) for production safety.</li>
      </OL>

      <P>
        On Polymarket, an additional check enforces the exchange&apos;s per-market <Code>orderMinSize</Code> —
        the minimum number of shares the CLOB will accept for that specific market.
      </P>

      <H3>Safety Caps</H3>
      <DataTable
        headers={["Cap", "Default", "Description"]}
        rows={[
          ["Cash reserves", "5%", "Must keep 5% of balance in cash at all times"],
          ["Max single position", "30%", "No single trade can use more than 30% of portfolio"],
          ["Max concurrent positions", "5", "Cannot open more positions until one closes"],
          ["Kelly multiplier", "0.25", "Quarter-Kelly for conservative production sizing"],
          ["Min position size", "$1.00", "Trades costing less than this are not placed"],
        ]}
      />

      {/* ── Step 7: Risk Checks ─────────────────────────────── */}
      <H2>Step 7: Risk Checks</H2>
      <P>
        Every trade must pass three independent layers of validation before execution. Any single
        failure at any layer blocks the trade entirely. For the full breakdown of all rules, see the{" "}
        <Link href="/about/safeguards" className="text-gain hover:underline">Safeguards</Link> page.
      </P>

      <H3>Layer 1: Agent-Level Guards</H3>
      <DataTable
        headers={["Check", "Default", "What Happens"]}
        rows={[
          ["Max concurrent positions", "5", "Cannot open more positions until one closes"],
          ["Max position size", "30% of portfolio", "Single position cannot exceed this"],
          ["Cash reserves minimum", "5%", "Must keep 5% of balance in cash at all times"],
        ]}
      />

      <H3>Layer 2: Backend Rules Engine (11 Rules)</H3>
      <DataTable
        headers={["#", "Rule", "Default", "What It Does"]}
        rows={[
          ["1", "Trade size", "$100 max", "Rejects trades exceeding this cost"],
          ["2", "Capital per agent", "$2,000", "Max capital a single agent can deploy"],
          ["3", "Daily loss limit", "$500", "Kill switch — pauses agent if daily losses exceed this"],
          ["4", "Min confidence", "60%", "Rejects trades below this confidence score"],
          ["5", "Allowed categories", "All", "Whitelist of tradeable categories"],
          ["6", "Blocked tickers", "None", "Blacklist of specific market tickers"],
          ["7", "Max positions", "10", "Concurrent open position limit"],
          ["8", "Duplicate prevention", "On", "Blocks duplicate position on same ticker"],
          ["9", "Opposing position", "Blocked", "Prevents YES and NO on same market"],
          ["10", "Max trades/day", "Unlimited", "Daily trade count limit per agent"],
          ["11", "Sell requires position", "On", "Cannot sell if you don't hold the position"],
        ]}
      />

      <H3>Layer 3: Account-Level Validation</H3>
      <DataTable
        headers={["Check", "Default", "Scope"]}
        rows={[
          ["Max trades/day (global)", "50", "All agents combined"],
          ["Global daily loss", "$500", "Across all agents"],
          ["Max trades per market", "Unlimited", "Any single market"],
          ["Cooldown", "0 hours", "Min time between same-market trades"],
          ["Active hours", "Always", "UTC hours when trading is allowed"],
          ["Daily AI budget", "$50", "Global AI API spend cap"],
        ]}
      />

      <Tip>
        You can configure all rules from <strong>Settings &rarr; Safeguards</strong>. Changes take
        effect on the next validation cycle — no restart or redeployment needed.
      </Tip>

      {/* ── Step 8: Execution & Settlement ─────────────────────────────── */}
      <H2>Step 8: Execution & Settlement</H2>
      <P>
        Once a trade passes all risk checks, it enters the execution pipeline. The agent never talks
        directly to the exchange — every order is intercepted by the backend, queued, and validated
        before execution.
      </P>

      <H3>Execution</H3>
      <UL>
        <li><strong>Training mode:</strong> Saved as a <Code>paper</Code> trade. No exchange API call. P&L is calculated against real market prices.</li>
        <li><strong>Live mode (Kalshi):</strong> A real limit order is placed on Kalshi using cryptographically signed authentication.</li>
        <li><strong>Live mode (Polymarket):</strong> A signed order is submitted to the Polymarket order book with the appropriate token ID, tick size, and neg-risk flag.</li>
        <li><strong>Order interception:</strong> All orders are intercepted and validated by the orchestrator before execution.</li>
      </UL>

      <H3>Settlement</H3>
      <P>
        A settlement checker runs periodically in the backend and polls both exchanges for resolved markets.
      </P>
      <UL>
        <li><strong>Kalshi:</strong> Markets settle internally when the event outcome is confirmed. Typically minutes to hours after the event. Winning contracts pay $1.00 USD.</li>
        <li><strong>Polymarket:</strong> Uses the UMA Optimistic Oracle for decentralized resolution. Undisputed: 2 hours after proposal. Disputed: 4-6 days (UMA token holder vote). Winning tokens pay $1.00 USDC.</li>
      </UL>

      {/* ── Example Walkthrough ─────────────────────────────── */}
      <H2>Example: Full Superforecaster Walkthrough</H2>
      <P>
        Here is how the Superforecaster analyzes a hypothetical market:{" "}
        <strong>&quot;Will Bitcoin exceed $150K by June 30?&quot;</strong> — currently trading at $0.22 YES
        (market implies 22% probability).
      </P>

      <H3>Step 3: Web Research</H3>
      <P>Perplexity Sonar Pro searches the live web and returns structured findings:</P>
      <UL>
        <li><strong>Recent developments:</strong> Bitcoin trading at ~$97K. Spot ETF inflows averaging $400M/week. Halving supply shock already priced in (April 2024). Fed holding rates steady.</li>
        <li><strong>Base rate data:</strong> Bitcoin achieved a 50%+ move in 3 of 8 comparable 6-month periods since 2017 (37.5%). A move from $97K to $150K requires a 55% gain.</li>
        <li><strong>Stakeholder signals:</strong> Standard Chartered targets $150K year-end. Most sell-side analysts project $100-120K range.</li>
        <li><strong>Arguments for YES:</strong> Structural institutional ETF demand, post-halving supply squeeze peaks 12-18 months after halving, improving regulatory clarity.</li>
        <li><strong>Arguments for NO:</strong> 55% move needed in under 3 months, no imminent rate cuts, ETF inflows have plateaued from peak levels, sub-40% base rate for moves of this magnitude.</li>
      </UL>

      <H3>Step 4 Phase 1: Research Audit</H3>
      <UL>
        <li><strong>Contradiction found:</strong> One source says ETF inflows are &quot;accelerating,&quot; another says &quot;plateaued from peak levels.&quot; Both technically true — flows are positive but below all-time highs. Nuance noted.</li>
        <li><strong>Suspicious claims:</strong> None — all statistics trace to verifiable sources.</li>
        <li><strong>Hallucination check:</strong> No claims of events that have not yet occurred.</li>
        <li><strong>Quality rating: 8/10</strong> — strong sourcing, minor contradiction handled appropriately.</li>
      </UL>

      <H3>Step 4 Phase 2: Structured Decomposition</H3>
      <P><strong>Sub-questions:</strong></P>
      <OL>
        <li><strong>Can Bitcoin sustain its trajectory?</strong> Base rate: post-halving bull runs sustained in 5 of 7 cycles (71%). Inside view: ETF inflows positive but decelerating. Assessment: 60%.</li>
        <li><strong>Is a 55% move in ~3 months feasible?</strong> Base rate: achieved in 4 of 15 comparable periods (27%). Inside view: institutional demand is new but price already elevated. Assessment: 25%.</li>
        <li><strong>Are there catalysts to accelerate?</strong> Inside view: no imminent rate cuts, no new ETF approvals pending. Assessment: 15% chance of sufficient catalysts.</li>
      </OL>
      <P><strong>Outside view anchor:</strong> 37.5% base rate for 6-month windows, adjusted to ~25% for a 3-month window.</P>
      <P><strong>Inside view adjustments:</strong> Positive institutional demand (upward), decelerating flows and no macro catalyst (downward). Net: roughly neutral.</P>
      <P><strong>Synthesis:</strong> Anchoring to the adjusted 25% base rate with neutral net adjustments. Final estimate: <strong>24% probability</strong>. Confidence: <strong>72%</strong>.</P>
      <P>Output: <Code>probability: 0.24</Code>, <Code>confidence: 0.72</Code>, <Code>side: &quot;NO&quot;</Code></P>

      <H3>Step 5: Edge Calculation</H3>
      <P>
        The model recommends the NO side. AI thinks P(NO) = 76%, market prices NO at $0.78.
        Edge = |0.76 - 0.78| = 2%. Required at 72% confidence = 6%. Since 2% &lt; 6%,
        the edge is insufficient.
      </P>
      <P>
        <strong>Result: SKIP.</strong> Neither side has sufficient edge. The market is approximately
        fairly priced according to the Superforecaster&apos;s analysis.
      </P>

      <H3>What If the Market Were at $0.12?</H3>
      <P>
        If YES traded at $0.12 (12% implied), the AI&apos;s 24% estimate gives a YES edge of 12%.
        At 72% confidence, the required edge is 6%. Since 12% &gt; 6%, the trade proceeds.
        With a $1,000 account (3% base tier, 5% reserve = $950 available), base investment = $28.50.
        Edge scaler with 12% edge: 1.0 + (0.25 x 0.12) = 1.03x. Investment = ~$29.36.
        Contracts: int($29.36 / $0.12) = 244 contracts, capped at 250 by tier.
      </P>

      {/* ── Polymarket Differences ─────────────────────────────── */}
      <H2>Polymarket Differences</H2>
      <P>
        The Superforecaster runs the same research and analysis pipeline on both exchanges. The differences
        are in market data sourcing, order execution, and settlement mechanics.
      </P>
      <DataTable
        headers={["Aspect", "Kalshi", "Polymarket"]}
        rows={[
          ["Data API", "Kalshi REST API", "Polymarket data API"],
          ["Market ID", "Ticker string (e.g., KXBTC-25MAR21)", "conditionId (0x hex hash)"],
          ["Prices", "Dollar strings, bid/ask midpoint", "outcomePrices array [yes, no]"],
          ["Token IDs", "N/A", "Separate YES and NO token IDs per market"],
          ["Order signing", "Cryptographic signature authentication", "Wallet-based signing"],
          ["Tick size", "1 cent", "Per-market (0.01 or 0.001)"],
          ["Neg-risk", "N/A", "Markets may use neg-risk complement structure"],
          ["Min order size", "1 contract", "Per-market orderMinSize from API"],
          ["Settlement", "Centralized (Kalshi confirms)", "UMA Optimistic Oracle (2h undisputed, 4-6d disputed)"],
          ["Payout currency", "USD", "USDC"],
        ]}
      />
      <P>
        On Polymarket, the agent also tracks additional market metadata: <Code>yes_token_id</Code>,{" "}
        <Code>no_token_id</Code>, <Code>tick_size</Code>, <Code>neg_risk</Code>, and{" "}
        <Code>order_min_size</Code>. These are required for constructing valid CLOB orders. Title-date
        extraction is used as a sanity check for multi-resolution markets where the data API&apos;s{" "}
        <Code>endDate</Code> can be unreliable.
      </P>

      {/* ── Configurable Settings ─────────────────────────────── */}
      <H2>All Configurable Settings</H2>
      <P>
        Every setting listed here can be adjusted per bot. Agent-level settings are in the bot&apos;s
        configuration panel. Account-level settings are in <strong>Settings &rarr; Safeguards</strong>.
      </P>

      <H3>AI & Research</H3>
      <DataTable
        headers={["Setting", "Default", "Description"]}
        rows={[
          ["Reasoning Model", "Claude Opus 4.6", "User-selectable from bot settings dropdown"],
          ["Research Model", "Perplexity Sonar Pro", "Research model (always Perplexity Sonar Pro)"],
          ["AI Temperature", "0.0", "Model temperature (deterministic output)"],
          ["AI Max Tokens", "4,000", "Max tokens per model response"],
          ["AI Timeout", "120s", "Timeout per model call"],
          ["Daily AI Budget", "$10", "Daily spending limit on AI API calls"],
          ["Reanalyze Cooldown", "6 hours", "Min hours between same-market analyses"],
        ]}
      />

      <H3>Market Scanning</H3>
      <DataTable
        headers={["Setting", "Default", "Description"]}
        rows={[
          ["Min Volume", "50", "Minimum volume (contracts or USDC) to be eligible"],
          ["Max Expiry", "7 days", "Markets expiring beyond this window are skipped"],
          ["Max Markets per Cycle", "10", "Top N markets by volume analyzed per cycle"],
          ["Allowed Categories", "All", "Comma-separated category whitelist (empty = all)"],
        ]}
      />

      <H3>Edge Thresholds</H3>
      <DataTable
        headers={["Setting", "Default", "Description"]}
        rows={[
          ["High Confidence Edge", "4%", "Required edge when confidence >= 80%"],
          ["Medium Confidence Edge", "6%", "Required edge when confidence 60-79%"],
          ["Low Confidence Edge", "8%", "Required edge when confidence < 60%"],
          ["Min Confidence", "0.50", "Below this confidence, all trades are skipped"],
        ]}
      />

      <H3>Position Sizing & Risk</H3>
      <DataTable
        headers={["Setting", "Default", "Description"]}
        rows={[
          ["Tier system", "Auto", "Base/max percentages adapt to account size (see tier table)"],
          ["Kelly Multiplier", "0.25", "Quarter-Kelly for conservative production sizing"],
          ["Max Position %", "30%", "Max % of portfolio per position"],
          ["Max Positions", "5", "Max concurrent open positions"],
          ["Min Position Size", "$1.00", "Minimum trade cost to place an order"],
          ["Cash Reserve %", "5%", "Minimum cash reserve maintained at all times"],
        ]}
      />

      <Tip>
        The Superforecaster&apos;s key advantage is evidence grounding. Every prediction is anchored
        to sourced research rather than model intuition. This makes it particularly strong on markets
        where breaking news or fresh data shifts probability in ways that stale training data would miss.
        The structured decomposition methodology — decompose, base rate, inside/outside view, synthesize —
        produces calibrated forecasts that resist the overconfidence typical of unconstrained LLM predictions.
      </Tip>

      <Warn>
        Prediction market trading involves real financial risk. Even with comprehensive research and
        structured methodology, markets can move against well-reasoned positions. The Superforecaster
        is designed for responsible, risk-managed trading with multiple safety layers. Past performance
        does not guarantee future results. Always start in Training mode and only switch to Live
        trading with capital you can afford to lose.
      </Warn>
    </>
  );
}


/* ─── Safeguards ─────────────────────────────────────────────────────────── */

function SafeguardsContent() {
  return (
    <>
      <P>
        Every trade passes through a two-tier rules engine before execution. No order can reach any
        exchange (Kalshi or Polymarket) without passing both tiers. The system is deterministic — no AI judgment in the validation layer,
        only hard programmatic checks.
      </P>

      <H2>Tier 1 — Per-Agent + Global Rules</H2>
      <P>
        Nine constraints are checked against both the agent&apos;s per-agent config and the account&apos;s global
        rules. When both define a limit, the more restrictive value wins.
      </P>
      <DataTable
        headers={["Rule", "Default", "Description"]}
        rows={[
          ["Max trade size", "$100", "Rejects trades exceeding this cost"],
          ["Capital per agent", "$2,000", "Max capital a single agent can use"],
          ["Daily loss limit", "$500", "Pauses agent if daily losses exceed this"],
          ["Min confidence", "60%", "Rejects trades below this confidence score"],
          ["Allowed categories", "All", "Whitelist of tradeable market categories"],
          ["Blocked tickers", "None", "Blacklist of specific market tickers"],
          ["Max positions", "10", "Concurrent open position limit"],
          ["Duplicate prevention", "On", "Blocks same agent from opening duplicate position"],
          ["Opposing position", "Blocked", "Prevents YES and NO on same market"],
        ]}
      />

      <H2>Tier 2 — Account-Level Validation</H2>
      <P>
        Account-wide checks that apply across all agents. These are tracked per-environment — training
        and live limits are counted independently.
      </P>
      <DataTable
        headers={["Rule", "Default", "Description"]}
        rows={[
          ["Max trades / day", "50", "Daily cap across all agents combined"],
          ["Global daily loss", "$500", "Pauses all trading if total losses exceed this"],
          ["Max trades per market", "Unlimited", "Limits total trades on any single market"],
          ["Cooldown", "0 hours", "Min time between same-market trades"],
          ["Active hours", "Always", "Restrict trading to specific UTC hours"],
          ["Daily AI budget", "$50", "Max daily LLM API spend across all agents"],
        ]}
      />

      <H2>Configuring Rules</H2>
      <P>
        All rules are configurable from <strong>Settings → Safeguards</strong>.
        Changes auto-save automatically and take effect on the next validation cycle — no
        restart or redeployment needed.
      </P>

      <H3>How Conflicts Resolve</H3>
      <UL>
        <li><strong>Size limits</strong> — MIN(agent value, global value). The lower limit wins.</li>
        <li><strong>Confidence floors</strong> — MAX(agent value, global value). The higher requirement wins.</li>
        <li><strong>Category filters</strong> — Agent categories OR global categories apply.</li>
        <li><strong>Blocked tickers</strong> — Global only (not configurable per-agent).</li>
      </UL>

      <Tip>
        Rejected trades are visible in your trade history with the exact rule that blocked them
        and an explanation. Use this to tune your settings.
      </Tip>
    </>
  );
}

/* ─── Nuclear Option ─────────────────────────────────────────────────────── */

function NuclearOptionContent() {
  return (
    <>
      <P>
        Prediction Market Agents provides two levels of emergency controls in <strong>Settings → Agent Controls</strong> (desktop sidebar).
        Both are disabled when no agents are running.
      </P>

      <H2>Stop All</H2>
      <UL>
        <li>Gracefully stops all running agents.</li>
        <li>Cancels all pending orders in the validation queue.</li>
        <li>All credentials and configuration preserved.</li>
        <li>Agents can be redeployed immediately from the Strategies page.</li>
      </UL>

      <H2>Nuke All</H2>
      <UL>
        <li>Force-stops all agents immediately, with no grace period.</li>
        <li>Cancels all pending orders in the queue.</li>
        <li>Cancels all open orders on all connected exchanges — Kalshi and Polymarket (live orders fully unwound).</li>
        <li><strong>Deletes all stored API credentials</strong> — exchange keys, AI keys, everything.</li>
        <li>Trade history is preserved.</li>
      </UL>

      <Warn>
        Nuke All is irreversible. All credentials are deleted as a safety measure — this prevents stale
        API keys from being reused in redeployed bots. You must re-enter all keys before trading again.
      </Warn>

      <H3>When to Use Each</H3>
      <DataTable
        headers={["Scenario", "Action"]}
        rows={[
          ["Pause trading temporarily", "Stop All"],
          ["Strategy underperforming", "Stop All"],
          ["Suspect API key compromise", "Nuke All"],
          ["Complete system reset", "Nuke All"],
          ["Market emergency", "Stop All (faster recovery)"],
        ]}
      />

      <H3>Recovery After Nuke All</H3>
      <OL>
        <li>Re-enter exchange credentials in <strong>Settings → Exchanges</strong>.</li>
        <li>Re-enter AI API keys in <strong>Settings → API Keys</strong>.</li>
        <li>Review safeguard settings.</li>
        <li>Deploy a strategy from the <strong>Strategies</strong> page.</li>
      </OL>
    </>
  );
}

/* ─── Council V2 ────────────────────────────────────────────────────────── */

function CouncilV2Content() {
  return (
    <>
      <P>
        Council V2 is the flagship trading strategy powering Prediction Market Agents. It deploys a sequential
        5-agent adversarial debate where each AI builds on the previous agent{"'"}s output — no
        parallel groupthink, no single point of failure. A dedicated research phase gathers live
        web intelligence before the debate begins, and a final Trader agent acts as the decision
        gate: no trade executes unless the math checks out and the Trader confirms edge.
      </P>
      <P>
        Council V2 is available on both <strong>Kalshi</strong> (CFTC-regulated US exchange) and{" "}
        <strong>Polymarket</strong> (decentralized prediction market on Polygon). The AI analysis
        pipeline is identical across both — only the execution layer and edge thresholds differ.
      </P>

      {/* ── V1 vs V2 ──────────────────────────────────────────── */}
      <H2>Key Differences from Council V1</H2>
      <P>
        V2 is a ground-up rewrite that replaces the V1 parallel ensemble with a sequential debate
        architecture. Every design choice targets a specific weakness observed in V1.
      </P>
      <DataTable
        headers={["Aspect", "Council V1", "Council V2"]}
        rows={[
          ["Architecture", "Parallel — agents run simultaneously", "Sequential — each agent sees and responds to prior output"],
          ["Agent Count", "6 agents (incl. News Analyst)", "5 agents + dedicated Research phase"],
          ["Research", "RSS feeds + optional Perplexity", "Perplexity Sonar Deep Research on every market"],
          ["Forecaster Weight", "30%", "35%"],
          ["Bull Model", "OpenAI o4-mini", "Claude Opus 4.6"],
          ["Bear Model", "Gemini 3.1 Pro Preview", "Claude Sonnet 4.6"],
          ["Risk Manager", "DeepSeek V3.2", "Claude Opus 4.6"],
          ["Trader", "Grok 4.1 Fast", "Claude Sonnet 4.6"],
          ["Edge (High Conf)", "6%", "4% (Polymarket) / 6% (Kalshi)"],
          ["Edge (Medium Conf)", "8%", "6% (Polymarket) / 8% (Kalshi)"],
          ["Edge (Low Conf)", "12%", "10% (Polymarket) / 12% (Kalshi)"],
          ["News Analyst", "Dedicated agent (Claude)", "Removed — replaced by Perplexity research phase"],
          ["Consensus Gate", "3 of 5 agents must agree", "Trader has final authority (Risk Manager advises)"],
        ]}
      />

      {/* ── Pipeline Overview ──────────────────────────────────── */}
      <H2>The Pipeline</H2>
      <P>
        Every market opportunity flows through 10 stages. The pipeline is deterministic — the same
        inputs always produce the same sequence of checks and gates. A trade only executes when
        every stage passes.
      </P>
      <div className="mt-4 mb-2">
        <StepItem n={1} title="Market Ingestion" desc="Fetch active binary markets from the exchange API. Filter by volume, expiry, order book status, and price bounds (3%-97%)." />
        <StepItem n={2} title="Category Inference" desc="Classify each market by scanning the title for known keywords — Sports, Crypto, Economics, Politics, Weather, Tech, or Other. Optional category allowlist narrows focus." />
        <StepItem n={3} title="Cooldown & Dedup" desc="Skip markets already analyzed within the cooldown window (default: 6 hours). Prevents wasting AI credits on unchanged conditions." />
        <StepItem n={4} title="Research (Perplexity Sonar Deep Research)" desc="Gather live web intelligence for each market — recent developments, base rate data, stakeholder signals, and arguments for/against. Runs in parallel batches of 3 with rate limiting." />
        <StepItem n={5} title="Forecaster Debate" desc="Grok 4.1 Fast estimates the true YES probability using a 6-step method: research audit, base rate, current conditions, market structure analysis, calibration adjustment, and EV check." />
        <StepItem n={6} title="Bull & Bear Debate" desc="Claude Opus 4.6 argues the YES case with 3-5 evidence-backed arguments. Then Claude Sonnet 4.6 sees the Bull's case and counters every argument. The Bear also checks if the Bull fabricated any data." />
        <StepItem n={7} title="Risk Manager" desc="Claude Opus 4.6 evaluates both sides, calculates EV for BUY YES and BUY NO, picks the better side, recommends position sizing via fractional Kelly, and issues a should_trade verdict." />
        <StepItem n={8} title="Trader Decision Gate" desc="Claude Sonnet 4.6 reviews the full debate transcript and makes the final BUY or SKIP decision. Default stance is to BUY when edge exists — only skips with a specific, concrete reason." />
        <StepItem n={9} title="Edge Filter & Position Sizing" desc="Verify the AI's edge over market price meets the confidence-tiered threshold. Calculate position size using tier-based rules, Kelly criterion cap, and exchange minimum order size." />
        <StepItem n={10} title="Order Execution" desc="Route the order through the intercept pipeline. Training mode saves a paper trade. Live mode places a real limit order on the exchange." />
      </div>

      {/* ── Agents & Models ────────────────────────────────────── */}
      <H2>The 5 Agents + Trader</H2>
      <P>
        V2 uses models from two providers — xAI and Anthropic — routed through OpenRouter.
        Each agent has a specific role in the sequential debate. The Forecaster, Bull, and Bear
        contribute probability estimates with confidence-adjusted weights. The Risk Manager and
        Trader do not contribute to probability aggregation — they govern sizing and execution.
      </P>
      <DataTable
        headers={["Role", "Model", "Weight", "Purpose"]}
        rows={[
          ["Forecaster", "Grok 4.1 Fast (xAI)", "35%", "Anchors the debate — estimates true P(YES) using base rates and structured reasoning"],
          ["Bull Researcher", "Claude Opus 4.6 (Anthropic)", "25%", "Builds the strongest evidence-based YES case with 3-5 arguments and probability floor"],
          ["Bear Researcher", "Claude Sonnet 4.6 (Anthropic)", "20%", "Counters every Bull argument — estimates probability ceiling and flags fabricated data"],
          ["Risk Manager", "Claude Opus 4.6 (Anthropic)", "—", "Calculates EV for both sides, assigns risk score (1-10), recommends sizing via Kelly"],
          ["Trader", "Claude Sonnet 4.6 (Anthropic)", "—", "Final decision gate — BUY or SKIP with limit price and position size"],
        ]}
      />
      <Tip>
        Weights apply only to probability aggregation. The ensemble probability is a confidence-adjusted
        weighted average: each agent{"'"}s weight is multiplied by its self-reported confidence (floored
        at 0.1) before averaging. This means a high-confidence Forecaster naturally dominates a
        low-confidence Bull.
      </Tip>

      {/* ── Research Phase ─────────────────────────────────────── */}
      <H2>Research Phase: Perplexity Sonar Deep Research</H2>
      <P>
        Before the debate begins, every market undergoes a dedicated research step using{" "}
        <strong>Perplexity Sonar Deep Research</strong> — an agentic multi-step web search model. This
        replaced V1{"'"}s RSS-based News Analyst with live, targeted intelligence gathering.
      </P>
      <P>
        For each market, Perplexity is prompted to gather six categories of information:
      </P>
      <OL>
        <li><strong>Recent Developments</strong> — Key news from the last 7 days with dates, sources, and specific facts. If the event has not happened yet, it must say so explicitly.</li>
        <li><strong>Base Rate Data</strong> — Historical frequency of similar events with sample sizes.</li>
        <li><strong>Key Stakeholders & Signals</strong> — Statements from decision-makers, experts, or officials. Scheduled events that could force resolution.</li>
        <li><strong>Arguments for YES</strong> — Strongest evidence and reasoning supporting YES.</li>
        <li><strong>Arguments for NO</strong> — Strongest evidence and reasoning supporting NO.</li>
        <li><strong>Expert & Statistical Signals</strong> — Domain expert opinions, statistical models, polls, and historical patterns. Explicitly excludes prediction market prices to avoid circular reasoning.</li>
      </OL>
      <P>
        Research runs in parallel batches of 3 markets with a 600-second timeout per request and
        automatic retry on server errors (up to 3 attempts with exponential backoff). The generous
        timeout accommodates sonar-deep-research, which can spend several minutes gathering and
        synthesizing sources for complex questions. The research output is injected into every
        subsequent agent{"'"}s prompt as shared context — clearly labeled as pre-gathered data that
        may contain errors, prompting agents to cross-check.
      </P>
      <Warn>
        The research prompt includes today{"'"}s date and instructs Perplexity to never fabricate
        outcomes. If an event is scheduled for today or later, it must state that no confirmed
        result exists. This prevents hallucinated resolution data from contaminating the debate.
      </Warn>

      {/* ── Agent Roles in Detail ──────────────────────────────── */}
      <H2>Agent Roles in Detail</H2>

      <H3>1. Forecaster (Grok 4.1 Fast)</H3>
      <P>
        The Forecaster anchors the entire debate. It receives the market data and Perplexity
        research, then applies a strict 6-step analytical method:
      </P>
      <OL>
        <li><strong>Research Audit</strong> — Note contradictions or suspicious claims in the research. State what can be trusted.</li>
        <li><strong>Base Rate</strong> — Historical frequency of this type of event, with specific sample sizes.</li>
        <li><strong>Current Conditions</strong> — Specific, verifiable evidence that shifts probability from the base rate.</li>
        <li><strong>Market Structure</strong> — Is this a single binary question or part of a multi-outcome event?</li>
        <li><strong>Calibration</strong> — Adjust toward the base rate when uncertain. Overconfidence is the default failure mode.</li>
        <li><strong>EV Check</strong> — Compare estimated probability to market price. Only flag edge if the difference exceeds 5 percentage points.</li>
      </OL>
      <P>
        <strong>Output:</strong> <Code>probability</Code> (0.0-1.0), <Code>confidence</Code> (0.0-1.0),
        {" "}<Code>base_rate</Code>, <Code>side</Code> (yes/no), <Code>key_factors</Code>, and step-by-step <Code>reasoning</Code>.
      </P>
      <P>
        <strong>Anti-hallucination rule:</strong> Must not fabricate base rates, statistics, or
        studies. When hard data is unavailable, reason from first principles and explicitly say so.
      </P>

      <H3>2. Bull Researcher (Claude Opus 4.6)</H3>
      <P>
        The Bull receives the market data, Perplexity research, and the Forecaster{"'"}s probability
        estimate. Its mandate is to construct the strongest possible YES case — but with strict
        evidentiary standards:
      </P>
      <UL>
        <li><strong>Thesis</strong> — One sentence on why this will happen.</li>
        <li><strong>3-5 Key Arguments</strong> — Each must cite specific evidence from the research or verifiable first principles. No fabricated statistics.</li>
        <li><strong>Probability Floor</strong> — The minimum reasonable YES probability even if the Bear is right about some things.</li>
        <li><strong>Catalysts</strong> — Near-term events (1-7 days) that could push probability higher. Only verifiable or scheduled events.</li>
      </UL>
      <P>
        <strong>Key constraint:</strong> It is better to make 2-3 honest arguments than 5 fabricated
        ones. The prompt explicitly prohibits inventing future events or statistics.
      </P>

      <H3>3. Bear Researcher (Claude Sonnet 4.6)</H3>
      <P>
        The Bear sees everything the Bull produced and must directly counter it. This is the
        adversarial core of the system — the Bear is specifically instructed to check whether the
        Bull fabricated any data and call it out.
      </P>
      <UL>
        <li><strong>Counter-Thesis</strong> — One sentence on why this will not happen.</li>
        <li><strong>Counter-Arguments</strong> — 3-5 reasons directly addressing the Bull{"'"}s specific claims.</li>
        <li><strong>Probability Ceiling</strong> — The maximum reasonable YES probability even if the Bull is right about some things.</li>
        <li><strong>Risk Factors</strong> — What could go wrong for YES holders?</li>
        <li><strong>Structural Analysis</strong> — Base rates, market mechanics, and structural arguments (not narrative-driven).</li>
      </UL>
      <P>
        <strong>Key constraint:</strong> Arguments must be statistical and structural. Single
        observations are treated as high-variance noise — the Bear must use base rates and sample sizes.
      </P>

      <H3>4. Risk Manager (Claude Opus 4.6)</H3>
      <P>
        The Risk Manager receives the full debate output and portfolio context. It performs a
        quantitative evaluation of both sides:
      </P>
      <OL>
        <li><strong>True Probability</strong> — Pick a single P(YES) anchored on the Forecaster, adjusted by Bull/Bear bounds. One number — no rambling.</li>
        <li><strong>Expected Value (both sides)</strong> — <Code>EV(BUY YES) = (true_prob x $1.00) - market_price_yes</Code>. <Code>EV(BUY NO) = ((1 - true_prob) x $1.00) - market_price_no</Code>. Pick the side with higher positive EV.</li>
        <li><strong>Risk Score</strong> — Rate 1-10 across liquidity, time risk, information quality, and model disagreement.</li>
        <li><strong>Position Size</strong> — Fractional Kelly: <Code>size_pct = (edge / odds) x 0.25</Code>. Always round down.</li>
        <li><strong>Edge Durability</strong> — Will this edge persist? Fast-moving news means trade smaller.</li>
      </OL>
      <P>
        <strong>Critical rule:</strong> <Code>should_trade</Code> must be <Code>true</Code> if best
        EV exceeds $0.03 per share. The Risk Manager cannot override the math with subjective
        conservatism — it uses <Code>recommended_size_pct</Code> to manage risk instead.
      </P>

      <H3>5. Trader (Claude Sonnet 4.6)</H3>
      <P>
        The Trader is the final decision gate. It receives every agent{"'"}s complete output and
        makes the authoritative BUY or SKIP call. Its default stance is to <strong>execute when
        edge exists</strong> — it should only skip with a concrete, specific reason.
      </P>
      <P>Decision rules hardcoded into the Trader{"'"}s prompt:</P>
      <OL>
        <li>If Risk Manager says <Code>should_trade=true</Code> AND Forecaster shows &gt;5pp edge, default is BUY.</li>
        <li>Bull-Bear disagreement is expected by design — it is NOT a reason to skip.</li>
        <li>If Forecaster and Risk Manager agree on direction, that is strong conviction — BUY.</li>
        <li>Only SKIP when: edge &lt;5pp, market is mispriced in the opposite direction, or a specific flaw in the analysis is identified (e.g., Bull fabricated data).</li>
        <li>Set limit price at or slightly below estimated fair probability for the traded side.</li>
        <li>Size: 5-10% for marginal edge (5-8pp), 15-25% for strong edge (&gt;10pp).</li>
      </OL>
      <P>
        <strong>Fallback:</strong> If the Trader returns empty or invalid JSON but the Risk Manager
        approved the trade, the system falls back to the Risk Manager{"'"}s recommended side and
        executes automatically.
      </P>

      {/* ── Edge Filtering ──────────────────────────────────────── */}
      <H2>Edge Filtering</H2>
      <P>
        After the debate concludes, the system checks whether the AI ensemble found sufficient edge
        over the market price. Edge is the absolute difference between the AI{"'"}s probability estimate
        for the traded side and the current market price. The required edge threshold varies by the
        Forecaster{"'"}s confidence level — higher confidence permits thinner edges.
      </P>
      <DataTable
        headers={["Confidence Tier", "Forecaster Confidence", "Polymarket Edge", "Kalshi Edge"]}
        rows={[
          ["High", ">= 80%", "4%", "6%"],
          ["Medium", ">= 60%", "6%", "8%"],
          ["Low", "< 60%", "10%", "12%"],
        ]}
      />
      <P>
        A minimum ensemble confidence of <strong>50%</strong> is required regardless of edge size.
        Below 50% confidence, the trade is always rejected — the agents are not sufficiently
        certain about their own estimates.
      </P>
      <Tip>
        Polymarket{"'"}s tighter thresholds reflect its deeper liquidity and narrower spreads
        compared to Kalshi. The same strategy can trade more frequently on Polymarket because
        smaller edges are still profitable after execution costs.
      </Tip>

      {/* ── Position Sizing ─────────────────────────────────────── */}
      <H2>Position Sizing</H2>
      <P>
        Position sizing uses a tier-based system scaled by account balance. Smaller accounts take
        proportionally larger positions (up to 40% of balance) because minimum order sizes require
        it. Larger accounts are constrained to avoid concentrated risk.
      </P>

      <H3>Sizing Tiers</H3>
      <DataTable
        headers={["Account Balance", "Base %", "Max %", "Max Contracts"]}
        rows={[
          ["< $100", "20%", "40%", "10"],
          ["< $1,000", "5%", "15%", "50"],
          ["< $10,000", "3%", "8%", "250"],
          ["< $100,000", "2%", "5%", "1,000"],
          ["$100,000+", "1%", "3%", "5,000"],
        ]}
      />

      <H3>Sizing Formula</H3>
      <P>
        The base percentage is scaled by edge strength using a Kelly-inspired multiplier:
      </P>
      <OL>
        <li><Code>edge = ai_probability - market_price</Code> (signed, for the traded side)</li>
        <li><Code>scaler = 1.0 + (kelly_multiplier x edge)</Code>, clamped between 0.1x and 3.0x</li>
        <li><Code>investment = available_cash x base_pct x scaler</Code></li>
        <li>Cap at <Code>max_pct</Code>, <Code>max_contracts</Code>, and <Code>max_position_pct</Code> (default 30% of portfolio)</li>
        <li>If the Risk Manager recommended a specific <Code>recommended_size_pct</Code>, cap at that value (Kelly cap)</li>
        <li>Enforce exchange minimum order size and minimum position value (default $1.00)</li>
      </OL>
      <P>
        The <Code>kelly_multiplier</Code> defaults to <strong>0.25</strong> (quarter-Kelly). This
        is deliberately conservative — full Kelly sizing is theoretically optimal but assumes
        perfect probability estimates, which no AI system achieves. Quarter-Kelly reduces variance
        while preserving most of the expected growth.
      </P>

      <H3>Pre-Trade Guards</H3>
      <UL>
        <li><strong>Position count limit:</strong> Maximum {5} concurrent open positions (configurable in Settings).</li>
        <li><strong>Cash reserve:</strong> 5% of balance is always held back. No trade can dip into the reserve.</li>
        <li><strong>Minimum position size:</strong> Orders below $1.00 are rejected — not worth the execution overhead.</li>
        <li><strong>Exchange minimum:</strong> Each market has a CLOB minimum order size (from the API). Orders below this are rounded up or rejected.</li>
      </UL>

      {/* ── Example Walkthrough ────────────────────────────────── */}
      <H2>Example Walkthrough</H2>
      <P>
        A concrete example of the full pipeline in action:
      </P>
      <div className="mt-4 mb-2">
        <StepItem n={1} title="Ingest" desc={'Market: "Will BTC exceed $120K by April 15?" — YES price $0.35, NO price $0.65, volume $180K USDC, 5 days to expiry. Passes all filters.'} />
        <StepItem n={2} title="Research" desc="Perplexity gathers: BTC at $108K, ETF inflows accelerating, halving supply shock still unfolding, macro uncertainty from Fed rate decision next week. No confirmed breakout above $115K yet." />
        <StepItem n={3} title="Forecaster" desc="Grok estimates P(YES) = 0.22 (22%), confidence 0.75. Base rate for 11%+ BTC moves in 5 days is ~8%. Current momentum and ETF flows push it higher, but $120K is a major psychological resistance." />
        <StepItem n={4} title="Bull Researcher" desc="Claude Opus argues YES: ETF inflows at record pace, halving supply constraint, historical precedent of rapid moves near round numbers. Probability floor: 0.15. Catalyst: Fed decision could trigger risk-on rally." />
        <StepItem n={5} title="Bear Researcher" desc="Claude Sonnet counters: $120K has never been tested, 11% move in 5 days is 92nd percentile, Fed uncertainty cuts both ways, ETF flows can reverse quickly. Probability ceiling: 0.30. Calls out Bull's catalyst as speculative." />
        <StepItem n={6} title="Risk Manager" desc="Claude Opus calculates: P(YES) = 0.24, EV(BUY NO) = (0.76 x $1.00) - $0.65 = +$0.11, EV(BUY YES) = (0.24 x $1.00) - $0.35 = -$0.11. Recommends BUY NO, should_trade=true, size 8%." />
        <StepItem n={7} title="Trader" desc="Claude Sonnet confirms: BUY NO at limit $0.72. Edge is 11pp on the NO side, Risk Manager approved, Forecaster and Bear align. Position size: 8% of available capital." />
        <StepItem n={8} title="Edge Filter" desc="Forecaster confidence 0.75 (medium tier). Required edge: 6%. Actual edge: |0.76 - 0.65| = 11%. Passes." />
        <StepItem n={9} title="Position Sizing" desc="Account balance $500 (tier 2: 5% base, 15% max). Scaler = 1.0 + (0.25 x 0.11) = 1.03x. Investment = $475 x 0.05 x 1.03 = $24.46. At $0.65/share = 37 shares. Risk Manager cap: 8% = $38, no cap hit." />
        <StepItem n={10} title="Execution" desc="Limit order placed: BUY 37 NO shares at $0.72. Routed through intercept pipeline. If live mode, order hits the exchange CLOB." />
      </div>

      {/* ── Polymarket Differences ─────────────────────────────── */}
      <H2>Polymarket-Specific Behavior</H2>
      <P>
        Polymarket operates as a decentralized prediction market on the Polygon blockchain. While
        the AI analysis pipeline is identical to Kalshi, the execution layer has significant
        differences.
      </P>

      <H3>Market Data</H3>
      <P>
        Market data is fetched from Polymarket{"'"}s data API. The bot
        requests active, open binary markets sorted by volume descending, filtered by:
      </P>
      <UL>
        <li>Order book enabled (CLOB markets only)</li>
        <li>Binary market type (excludes scalar/combo)</li>
        <li>Minimum volume threshold (default: 50 USDC)</li>
        <li>Expiry within the configured window (default: 7 days)</li>
        <li>YES price between $0.03 and $0.97 (no edge possible at extremes)</li>
      </UL>

      <H3>Order Signing & CLOB</H3>
      <P>
        Polymarket uses an on-chain Central Limit Order Book (CLOB) with cryptographic
        signing for order authentication. Orders are signed by the wallet{"'"}s private key —
        typically a MetaMask-derived key. The bot handles order construction, signing, and submission through the
        exchange API.
      </P>

      <H3>UMA Oracle Settlement</H3>
      <P>
        Polymarket markets settle via the UMA Optimistic Oracle. Resolution is proposed on-chain,
        and there is a dispute window before finalization. This means settlement can take longer
        than Kalshi{"'"}s centralized resolution, and in rare cases, resolutions can be disputed.
      </P>

      <H3>Polymarket vs Kalshi Comparison</H3>
      <DataTable
        headers={["Aspect", "Polymarket", "Kalshi"]}
        rows={[
          ["Market API", "Polymarket data API", "Kalshi REST API"],
          ["Price Format", "Dollars (0.0-1.0)", "Cents (1-99)"],
          ["Order Auth", "Cryptographic wallet signing", "Cryptographic signature authentication"],
          ["Settlement", "UMA Optimistic Oracle (on-chain)", "Centralized (Kalshi resolves)"],
          ["Currency", "USDC on Polygon", "USD"],
          ["Edge (High Conf)", "4%", "6%"],
          ["Edge (Medium Conf)", "6%", "8%"],
          ["Edge (Low Conf)", "10%", "12%"],
          ["Neg Risk", "Supported (multi-outcome markets)", "N/A"],
          ["Token IDs", "Separate YES/NO token IDs per market", "Single ticker per market"],
        ]}
      />

      {/* ── Models & Costs ─────────────────────────────────────── */}
      <H2>Models & Costs</H2>
      <P>
        All AI calls route through OpenRouter, which provides a single API key for models across
        xAI and Anthropic (plus Perplexity for research). Temperature is set to <strong>0.0</strong>{" "}
        across all agents for deterministic output. Max tokens per call: <strong>4,000</strong>{" "}
        (debate agents) or <strong>8,000</strong> (research). Timeout: <strong>120 seconds</strong>{" "}
        per debate agent, <strong>600 seconds</strong> for research (deep-research can take several
        minutes per market).
      </P>
      <DataTable
        headers={["Agent", "Model", "Provider", "Role in Pipeline"]}
        rows={[
          ["Research", "Perplexity Sonar Deep Research", "Perplexity", "Live web search and evidence gathering"],
          ["Forecaster", "Grok 4.1 Fast", "xAI", "Probability estimation with base rate anchoring"],
          ["Bull Researcher", "Claude Opus 4.6", "Anthropic", "Evidence-based YES advocacy"],
          ["Bear Researcher", "Claude Sonnet 4.6", "Anthropic", "Adversarial counter-arguments"],
          ["Risk Manager", "Claude Opus 4.6", "Anthropic", "EV calculation and position sizing"],
          ["Trader", "Claude Sonnet 4.6", "Anthropic", "Final BUY/SKIP decision gate"],
        ]}
      />
      <P>
        A full pipeline run (research + 5 agents) typically costs $0.10-$0.30 depending on market
        complexity and response length. The daily AI budget (default: <strong>$300.00</strong>) caps
        total spending across all markets analyzed in a 24-hour window.
      </P>

      {/* ── Configurable Settings ──────────────────────────────── */}
      <H2>All Configurable Settings</H2>
      <P>
        Every setting can be configured per bot from the dashboard. Changes take effect on the next cycle.
      </P>

      <H3>Market Filtering</H3>
      <DataTable
        headers={["Setting", "Default", "Description"]}
        rows={[
          ["Min Volume", "50", "Minimum market volume (USDC/contracts) to consider"],
          ["Max Expiry Days", "7", "Skip markets expiring beyond this window"],
          ["Allowed Categories", "All", "Comma-separated list of categories to trade (empty = all)"],
          ["Max Markets per Cycle", "10", "Top N markets by volume to analyze each cycle"],
        ]}
      />

      <H3>Position Sizing & Risk</H3>
      <DataTable
        headers={["Setting", "Default", "Description"]}
        rows={[
          ["Max Positions", "5", "Maximum concurrent open positions"],
          ["Kelly Multiplier", "0.25", "Fraction of Kelly criterion (quarter-Kelly)"],
          ["Max Position %", "30", "Maximum single position as % of portfolio"],
          ["Min Position Size", "$1.00", "Orders below this value are rejected"],
          ["Cash Reserve", "5%", "Percentage of balance always held back"],
        ]}
      />

      <H3>AI & Budget</H3>
      <DataTable
        headers={["Setting", "Default", "Description"]}
        rows={[
          ["Daily AI Budget", "$300.00", "Maximum daily spend on AI API calls"],
          ["Reanalyze Cooldown", "6 hours", "Minimum hours between analyzing the same market"],
          ["AI Temperature", "0.0", "All agents use temperature 0 for deterministic output"],
          ["AI Max Tokens", "4,000 / 8,000", "Debate agents / research (deep-research needs headroom)"],
          ["AI Timeout", "120s", "Per-agent timeout (600s for research — deep-research can run minutes)"],
        ]}
      />

      <H3>Edge Thresholds (Polymarket)</H3>
      <DataTable
        headers={["Setting", "Value", "Description"]}
        rows={[
          ["edge_high_confidence", "4%", "Required edge when forecaster confidence >= 80%"],
          ["edge_medium_confidence", "6%", "Required edge when forecaster confidence >= 60%"],
          ["edge_low_confidence", "10%", "Required edge when forecaster confidence < 60%"],
          ["min_confidence", "50%", "Ensemble confidence floor — below this, always skip"],
        ]}
      />

      <H3>Edge Thresholds (Kalshi)</H3>
      <DataTable
        headers={["Setting", "Value", "Description"]}
        rows={[
          ["edge_high_confidence", "6%", "Required edge when forecaster confidence >= 80%"],
          ["edge_medium_confidence", "8%", "Required edge when forecaster confidence >= 60%"],
          ["edge_low_confidence", "12%", "Required edge when forecaster confidence < 60%"],
          ["min_confidence", "50%", "Ensemble confidence floor — below this, always skip"],
        ]}
      />

      {/* ── Risk Disclaimer ────────────────────────────────────── */}
      <H2>Risk Disclaimer</H2>
      <Warn>
        Council V2 is an experimental AI trading system. Past performance does not guarantee future
        results. AI models can hallucinate, fabricate data, or produce overconfident estimates despite
        the safeguards described above. Prediction markets carry inherent risk of total loss on any
        individual position. Never deploy capital you cannot afford to lose. Always start in{" "}
        <strong>Training mode</strong> to evaluate performance before switching to live trading.
        See <Link href="/about/safeguards" className="text-gain hover:underline">Safeguards</Link>{" "}
        for the full safety architecture.
      </Warn>
    </>
  );
}

/* ─── Terminal ──────────────────────────────────────────────────────────── */

function TerminalContent() {
  return (
    <>
      <P>
        The Terminal is your real-time command center for monitoring every decision
        your AI agents make. Every market scan, every AI debate, every risk-rule
        check, and every order execution streams live to this page — giving you
        full transparency into autonomous trading as it happens.
      </P>

      <H2>Overview</H2>
      <P>
        The Terminal page consolidates two critical data streams into a single
        view: raw execution logs from your running agents, and a structured
        signal pipeline that visualises how each market opportunity progresses
        from initial scan to final execution (or rejection). An action bar at
        the top shows how many agents are currently active and provides
        emergency controls — Stop All and Nuke — for immediate intervention.
      </P>

      <H2>Two-Panel Layout</H2>
      <P>
        The Terminal uses a split-screen layout on desktop, stacking vertically
        on mobile. Each panel has its own agent filter dropdown so you can
        isolate output from a single agent or view all agents simultaneously.
      </P>

      <H3>Left Panel — Terminal Logs</H3>
      <P>
        The left panel is a live, streaming console powered by a persistent
        WebSocket connection to your backend. Every meaningful log line from
        every running agent appears here in reverse-chronological order, with
        colour-coded type badges for instant recognition.
      </P>
      <UL>
        <li>Logs are delivered in real time over WebSocket — no polling, no page refresh required.</li>
        <li>A noise-suppression filter automatically hides low-level HTTP traffic, SDK initialisation chatter, and internal API calls, surfacing only the trading-relevant output you care about.</li>
        <li>Errors and failures always bypass the noise filter — they are never hidden.</li>
        <li>Auto-scroll keeps you pinned to the latest entry. Scroll up manually to pause, and the feed holds position until you return to the top.</li>
        <li>Use the agent dropdown to isolate logs from a single agent, or select &quot;All Agents&quot; for the full firehose.</li>
      </UL>

      <H3>Right Panel — Signals</H3>
      <P>
        The right panel shows the signal pipeline: the structured journey each
        market opportunity takes through your agent&apos;s decision process. Signals
        flow through six stages — Scan, Filter, Debate, Rules, Queue, Execute —
        and the panel offers two ways to watch them.
      </P>
      <UL>
        <li><strong>Cards view</strong> — Groups signals by pipeline stage with count badges, colour-coded headers, and clickable cards that open a detail modal with full reasoning.</li>
        <li><strong>Track view</strong> — A canvas-based race-track animation where each signal appears as a dot travelling left-to-right across stage markers. Killed signals show a red X at the stage they were rejected; executed signals reach the green finish line with a checkmark.</li>
      </UL>
      <P>
        Toggle between views using the Cards / Track switch in the panel header.
        Both views share the same agent filter, so you can drill into a single
        agent&apos;s pipeline at any time.
      </P>

      <H2>The Floating Terminal</H2>
      <P>
        When you navigate away from the Terminal page while agents are running,
        a floating mini-terminal appears in the bottom-right corner of every page
        in the dashboard. It keeps you connected to live execution without
        leaving your current workflow.
      </P>

      <H3>Minimised State</H3>
      <P>
        The minimised state is a compact black pill labelled &quot;Agent Running&quot; with
        a pulsing green dot. Click it to expand the terminal overlay.
      </P>

      <H3>Expanded State</H3>
      <P>
        The expanded overlay shows the last 50 meaningful log lines in a
        scrollable, 240px-tall panel with the same colour-coded log levels as
        the full Terminal. A header displays a live log count and two controls:
        an expand button that navigates to the full Trades page, and a close
        button that minimises the terminal back to a pill.
      </P>

      <H3>Behaviour</H3>
      <UL>
        <li>Auto-opens the moment a WebSocket message arrives from a running agent — you never need to open it manually.</li>
        <li>Applies the same noise-suppression filter as the main Terminal panel, hiding HTTP chatter and SDK internals.</li>
        <li>Auto-scrolls to the latest log entry so the most recent activity is always visible.</li>
        <li>Disappears entirely when no agents are running and no messages are buffered.</li>
      </UL>

      <H2>Understanding Terminal Output</H2>
      <P>
        Every log line is tagged with a colour-coded type badge. The table below
        shows the categories you will encounter and what they mean.
      </P>

      <DataTable
        headers={["Badge", "Colour", "Meaning"]}
        rows={[
          ["LOG", "Grey", "General informational output from the agent process."],
          ["SCAN", "Blue", "Market discovery — fetching eligible markets, upserting data."],
          ["AI", "Orange", "AI model inference — analysis, ensemble predictions, probability estimates."],
          ["RULE", "Amber", "Risk-rule evaluation in progress (edge checks, position limits, cash reserves)."],
          ["RULES \u2713", "Green", "All risk rules passed — the signal is cleared for execution."],
          ["REJECT", "Red", "A risk rule blocked or rejected the trade."],
          ["TRADE", "Green", "Order execution — paper or live trade placed on the exchange."],
          ["ALLOC", "Purple", "Portfolio allocation — Kelly sizing, capital distribution, Sharpe optimisation."],
          ["RISK", "Pink", "Risk monitoring — drawdown alerts, rebalancing, volatility checks."],
          ["ERROR", "Red", "An error or failure that needs attention. Errors are never filtered out."],
        ]}
      />

      <H3>Example Log Patterns</H3>
      <P>
        A typical agent cycle produces logs in this sequence, giving you a
        narrative of the agent&apos;s reasoning from start to finish:
      </P>
      <OL>
        <li><strong>Market scan</strong> — &quot;Fetched 142 eligible markets&quot; / &quot;12 markets to process&quot; (SCAN badge).</li>
        <li><strong>AI analysis</strong> — &quot;Analyzing market: Will X happen?&quot; / &quot;predicted_prob=0.72&quot; (AI badge).</li>
        <li><strong>Risk-rule checks</strong> — &quot;Checking rules...&quot; / &quot;EDGE APPROVED&quot; / &quot;POSITION LIMITS OK&quot; / &quot;CASH RESERVES OK&quot; (RULE/RULES badges).</li>
        <li><strong>Execution</strong> — &quot;Executed position: YES @ 0.45, size $25.00&quot; (TRADE badge).</li>
      </OL>
      <P>
        If a signal is rejected at any stage, you will see a REJECT badge with
        the specific rule that blocked it — for example, &quot;EDGE REJECTED&quot; or
        &quot;CASH RESERVES INSUFFICIENT&quot;.
      </P>

      <H2>Signal Views</H2>

      <H3>Cards View</H3>
      <P>
        The Cards view organises active signals into collapsible stage groups.
        Each stage header shows its label and a live count. Individual signal
        cards display the market ticker, and clicking a card opens a detail
        modal with the full reasoning chain, AI probabilities, and rule
        verdicts for that signal. A stats bar at the top provides an at-a-glance
        summary including the number of signals killed at each stage.
      </P>

      <H3>Track View</H3>
      <P>
        The Track view renders a canvas-based race-track visualisation. Each
        signal is a coloured dot that animates from left to right across
        vertical stage markers (Scan, Filter, Debate, Rules, Queue, Execute).
        Up to 10 signals display simultaneously in parallel lanes. Killed
        signals stop with a red X at the stage where they were rejected and
        fade out. Signals that reach execution hit the green finish line with a
        checkmark. The animation runs at 60fps using requestAnimationFrame for
        smooth, GPU-friendly rendering.
      </P>

      <H2>Action Bar</H2>
      <P>
        Above the two panels, an action bar displays the current agent status
        (e.g., &quot;2 agents running&quot;) with a pulsing green indicator. When agents
        are active, two emergency controls appear:
      </P>
      <UL>
        <li><strong>Stop All</strong> — Gracefully stops all running agents and cancels pending orders. You can redeploy from the Strategies page afterward.</li>
        <li><strong>Nuke</strong> — Force-kills all agents, cancels orders, and deletes all stored API keys. This is a last-resort kill switch; you will need to re-enter exchange credentials to deploy again.</li>
      </UL>
      <P>
        Both actions require confirmation before executing. A link to the Audit
        Logs page is also available for reviewing historical execution records.
      </P>

      <Tip>
        Use the Terminal to debug rejected trades. When a signal is blocked,
        the logs show exactly which rule fired — edge threshold, position limit,
        or cash reserve — so you can adjust your strategy parameters and
        redeploy with confidence.
      </Tip>
    </>
  );
}

/* ─── Agents ────────────────────────────────────────────────────────────── */

function AgentsContent() {
  return (
    <>
      <P>
        The Agents page is the central hub for deploying, monitoring, and managing your AI trading agents.
        From here you control every aspect of how your agents interact with prediction markets — what they
        trade, how much they risk, and when they run. Every trade flows through a transparent pipeline you
        can inspect in real time.
      </P>

      <H2>Agent Cards</H2>
      <P>
        At the top of the page, a horizontally scrollable strip displays all available agents. Each card
        shows the agent name and avatar, the target exchange (Kalshi or Polymarket), strategy description,
        cumulative P&amp;L, and a live status indicator. Cards for running agents display <Code>Stop</Code> and{" "}
        <Code>Nuke</Code> buttons; idle agents show a single <Code>Deploy</Code> button. If an agent is
        missing API keys, an amber warning appears below its card. Agents marked &quot;Coming Soon&quot; are
        visible but not yet deployable. Click any card to select it and load its detail panel below.
      </P>

      <H2>Performance Tab</H2>
      <P>
        The default tab surfaces the numbers that matter. A six-metric dashboard leads with P&amp;L, win rate,
        trade count, average confidence, Sharpe ratio, and best-performing category. Below the metrics sits
        a cumulative P&amp;L chart built from your actual trade history, followed by a two-column layout: open
        positions on the left (with unrealized P&amp;L per market) and a live terminal on the right.
      </P>
      <P>
        The terminal streams real-time WebSocket logs from the running agent — tagged as TRADE, SYSTEM,
        REASONING, or BLOCKED. You can pause and resume the feed without affecting the agent. Beneath
        these panels, a full trade history table lists every trade the agent has made, showing the market
        title, time, category, side (YES/NO), and whether the trade won or lost.
      </P>

      <H2>Settings Tab</H2>
      <P>
        Settings are organized into clear sections and are locked while an agent is running (an amber banner
        reminds you to stop the agent before editing).
      </P>
      <H3>Bot Profile</H3>
      <P>
        Read-only section showing the agent&apos;s description, strategy label, and LLM models used. This
        information is defined by the agent&apos;s codebase and cannot be changed from the dashboard.
      </P>
      <H3>Mode Toggle</H3>
      <P>
        Switch between <strong>Training</strong> and <strong>Live</strong> mode. Training mode simulates
        trades without placing real orders — ideal for evaluating strategy performance risk-free. Switching
        to Live requires your account to have live trading enabled and triggers a confirmation dialog. Live
        mode commits real capital through your production API keys.
      </P>
      <H3>API Key Status</H3>
      <P>
        Displays the configuration state of every key the agent needs — LLM provider keys plus exchange
        credentials (Kalshi or Polymarket). Each key shows a green &quot;Configured&quot; or red
        &quot;Missing&quot; indicator. If any key is missing, the agent cannot be deployed and you are
        directed to the Settings page to add them.
      </P>
      <H3>Trading Rules</H3>
      <P>
        Hard limits enforced by the backend rules engine before any trade is executed. Configurable
        parameters include max trade size, max open positions, daily loss limit, minimum confidence
        threshold, and max trades per day. Additional sections cover market filtering (minimum volume,
        max expiry window) and position sizing (Kelly multiplier, minimum position size, max position
        percentage). Changes auto-save automatically, or you can click <Code>Save Rules</Code>{" "}
        to persist immediately.
      </P>

      <H2>Trade Pipeline Tab</H2>
      <P>
        A step-by-step visual walkthrough of the agent&apos;s reasoning pipeline. Navigate nine steps
        using arrow buttons or the dot indicators: Overview, AI Models, Bot Settings, Market Ingestion,
        News &amp; Sentiment, 5-Model Debate, Edge Filter &amp; Sizing, Rules Engine, and Execution
        &amp; Exit. Each step reveals the exact parameters, thresholds, and data sources the agent
        uses — from which LLM models participate in the adversarial debate to how Kelly sizing calculates
        position amounts.
      </P>
      <P>
        This level of transparency means you never have to wonder why a trade was taken or skipped.
        The pipeline tab turns a black-box AI into an auditable decision process.
      </P>

      <H2>Deploying an Agent</H2>
      <P>
        Clicking <Code>Deploy</Code> on an idle agent opens a deployment dialog where you configure:
      </P>
      <OL>
        <li><strong>Duration</strong> — how long the agent runs (in minutes, or unlimited until manually stopped).</li>
        <li><strong>Cycle interval</strong> — how frequently the agent scans for new trades (default 5 minutes for Kalshi, 2 minutes for Polymarket).</li>
        <li><strong>Capital allocation</strong> — the maximum lifetime spend cap for this deployment.</li>
      </OL>
      <P>
        After confirming, the agent starts immediately and you are redirected to the Trades page to monitor
        execution in real time. The agent card updates to show a running status with Stop and Nuke controls.
      </P>

      <H2>Agent Detail View</H2>
      <P>
        Clicking into an agent (via <Code>/agents/[id]</Code>) opens a dedicated deep-dive page. The
        header shows the agent name, status badge, GitHub repo link, exchange, and uptime. A hero section
        displays total P&amp;L in large type with percentage return and today&apos;s P&amp;L beneath it.
      </P>
      <H3>Cumulative P&amp;L Chart</H3>
      <P>
        A full-width chart plots profit and loss over time with a time-range selector (1W, 1M, 3M, All).
        The chart is built from real trade data, not simulations.
      </P>
      <H3>Stats Grid</H3>
      <P>
        Five metric cards display Total P&amp;L with trend, Win Rate (wins/total), Average Confidence,
        Trades Today, and Capital used out of allocated.
      </P>
      <H3>Trade History with Expandable Reasoning</H3>
      <P>
        Each trade row shows the market name, timestamp, side badge, size, confidence bar, P&amp;L, and
        status pill (executed, paper, open, skipped, error). Clicking a row expands it to reveal the
        agent&apos;s reasoning summary — a one-line conclusion with confidence score. A &quot;Show full
        reasoning&quot; link opens the complete multi-model debate transcript in a monospace panel, so
        you can audit exactly why the agent made each decision.
      </P>
      <H3>Live Reasoning Stream</H3>
      <P>
        A sidebar panel streams real-time agent logs via WebSocket. Entries are color-coded by level —
        green for executed trades and passed rules checks, yellow for in-progress rule evaluation, and
        red for blocked trades and errors. Each line shows a timestamp, level badge, and message.
      </P>

      <H2>Controls</H2>
      <P>
        Three actions are available from both the agent cards and the detail view:
      </P>
      <UL>
        <li><strong>Stop</strong> — gracefully pauses the agent. It retains its configuration and can be resumed.</li>
        <li><strong>Resume</strong> — restarts a stopped agent in paper mode for safety (you can switch to live manually).</li>
        <li><strong>Nuke</strong> — emergency kill switch. Force-stops the agent, deletes all stored API keys, and stops any other running agents. A confirmation dialog warns that you will need to re-enter credentials to deploy again. Use this only when you need to halt everything immediately.</li>
      </UL>

      <Tip>
        Start every new agent in Training mode. Let it run for a few cycles so you can review its reasoning
        in the Trade Pipeline tab and confirm the trading rules feel right before committing real capital.
        You stay in control at every step.
      </Tip>
    </>
  );
}

/* ─── Benchmarking ──────────────────────────────────────────────────────── */

function BenchmarkingContent() {
  return (
    <>
      <P>
        The Benchmarking page is Prediction Market Agents{"'"}s performance analytics engine — a
        real-time leaderboard that ranks every deployed agent by cumulative P&L and
        surfaces the quantitative signals you need to evaluate, compare, and
        optimize your trading strategies. Every metric is derived from actual trade
        execution data, not backtests or simulations.
      </P>

      {/* ── Head-to-Head Comparison ──────────────────────────── */}
      <H2>Head-to-Head Comparison</H2>
      <P>
        At the top of the page, a dual-line chart overlays the cumulative P&L
        curves of your two highest-performing agents. The green line represents
        the current leader; blue represents the runner-up. This chart updates
        in response to the selected time period, so you can compare momentum
        across different horizons — a one-day sprint versus a three-month
        marathon may tell very different stories.
      </P>
      <P>
        Below each line, summary cards display the agent{"'"}s name, avatar, win rate,
        trade count, P&L, and category breakdown for the selected period. Use this
        view to identify which agent is generating edge and whether its performance
        is accelerating or plateauing.
      </P>

      {/* ── Period Selector ──────────────────────────────────── */}
      <H2>Period Selector</H2>
      <P>
        A row of filter buttons lets you slice all performance data by time window.
        The available periods are:
      </P>
      <DataTable
        headers={["Period", "Window", "Use Case"]}
        rows={[
          ["1D", "Last 24 hours", "Intraday performance check after a trading cycle"],
          ["7D", "Last 7 days", "Weekly momentum and short-term trend detection"],
          ["1M", "Last 30 days (default)", "Primary evaluation window for strategy comparison"],
          ["3M", "Last 90 days", "Longer-term consistency and drawdown analysis"],
          ["All", "Full history (365 days)", "Lifetime track record since agent deployment"],
        ]}
      />
      <P>
        Switching periods recalculates the head-to-head chart, the Trades and P&L
        columns in the leaderboard, and the sparkline header label. Win Rate,
        Confidence, and Best Category reflect all-time aggregates regardless of the
        selected period.
      </P>

      {/* ── Leaderboard Table ────────────────────────────────── */}
      <H2>Leaderboard Table</H2>
      <P>
        The full agent roster is displayed in a sortable table ranked by total
        cumulative P&L (descending). Only agents that have executed at least one
        trade — or are currently running — appear in the table.
      </P>
      <DataTable
        headers={["Column", "Description"]}
        rows={[
          ["Rank", "Position in the leaderboard. Gold, silver, and bronze medal icons for the top three; numeric rank for all others."],
          ["Agent", "Avatar, display name, and strategy label. The avatar is color-coded by bot type for instant visual identification."],
          ["Win Rate", "Percentage of trades with positive P&L, shown as a progress bar and numeric value."],
          ["Trades", "Count of placed trades in the selected period. Skipped analyses are shown as a secondary count when present."],
          ["Confidence", "Average forecaster confidence across all analyzed markets, rendered as a progress bar (0-100%)."],
          ["Best Category", "The prediction market category (e.g., Politics, Crypto, Economics) where the agent has the strongest track record."],
          ["P&L", "Net profit or loss for the selected period, color-coded green for gains and red for losses."],
          ["Sparkline", "A miniature cumulative P&L chart showing the all-time equity curve at a glance."],
          ["Status", "Current operational state (Active or Paused) plus the trading mode — Live (real capital) or Paper (simulated)."],
        ]}
      />

      {/* ── Metrics Explained ────────────────────────────────── */}
      <H2>Metrics Explained</H2>
      <H3>Win Rate</H3>
      <P>
        Calculated as <Code>wins / total_trades x 100</Code>. A trade is counted
        as a win if its realized P&L is greater than zero. Win rate alone does not
        capture edge — an agent with 40% win rate but large winners and small
        losers can outperform a 70% win rate agent with the opposite payoff profile.
        Always evaluate win rate alongside P&L.
      </P>

      <H3>Confidence</H3>
      <P>
        The average confidence score returned by the forecasting agent across all
        markets analyzed. Higher confidence indicates the AI model had stronger
        signal from research data and base rates. Confidence directly affects
        position sizing and edge thresholds — high-confidence trades receive
        larger allocations and lower minimum edge requirements.
      </P>

      <H3>Best Category</H3>
      <P>
        Determined by analyzing trade volume and success rate per prediction market
        category. This reveals where each agent has developed a comparative
        advantage — some agents may excel at political markets while others perform
        better on crypto or economic events.
      </P>

      <H3>Sparkline</H3>
      <P>
        The miniature equity curve is built from the agent{"'"}s full trade history,
        plotting cumulative P&L over every executed trade. An upward-sloping curve
        indicates consistent edge; a volatile or declining curve signals strategy
        deterioration or adverse market conditions.
      </P>

      {/* ── Using Benchmarking ───────────────────────────────── */}
      <H2>Using Benchmarking</H2>
      <P>
        The Benchmarking page is designed to support three core analytical workflows:
      </P>

      <H3>1. Strategy Comparison</H3>
      <P>
        Deploy multiple agents with different configurations — varying edge
        thresholds, category filters, position sizing, or AI model selections —
        then let the leaderboard quantify which approach generates superior
        risk-adjusted returns. The head-to-head chart makes divergence between
        two strategies immediately visible.
      </P>

      <H3>2. Trend Detection</H3>
      <P>
        Use the period selector to compare short-term and long-term performance.
        An agent ranked first over 3 months but slipping on the 7-day view may be
        experiencing regime change or model degradation. Conversely, a lower-ranked
        agent with strong recent momentum could be adapting better to current
        market conditions.
      </P>

      <H3>3. Live vs. Paper Evaluation</H3>
      <P>
        The Status column distinguishes agents running with real capital from those
        in paper (training) mode. Before promoting a paper agent to live trading,
        use the leaderboard to verify that its win rate, confidence, and P&L
        trajectory meet your deployment criteria over a statistically meaningful
        sample of trades.
      </P>

      <Tip>
        Switch between time periods frequently. A strategy that looks strong over
        30 days may reveal a different story on the 1-day or 3-month view. The most
        reliable agents show consistent upward equity curves across all time
        horizons.
      </Tip>
    </>
  );
}

/* ─── Sidebar ────────────────────────────────────────────────────────────── */

function DocSidebar({ currentSlug, onNav }: { currentSlug: string; onNav?: () => void }) {
  return (
    <nav className="space-y-1">
      <Link
        href="/about"
        onClick={onNav}
        className="block text-[13px] text-white/40 mb-6 hover:text-white transition-colors"
      >
        ← Documentation
      </Link>
      {CATEGORIES.map((cat) => (
        <div key={cat}>
          <p className="text-[10px] uppercase tracking-[0.15em] text-white/20 font-medium mt-5 mb-2 px-3">
            {cat}
          </p>
          {DOC_SECTIONS.filter((d) => d.category === cat).map((doc) => (
            <Link
              key={doc.slug}
              href={`/about/${doc.slug}`}
              onClick={onNav}
              className={`block px-3 py-2 rounded-lg text-[13px] transition-colors ${
                doc.slug === currentSlug
                  ? "text-gain bg-gain/[0.06]"
                  : "text-white/40 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              {doc.title}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

/* ─── Mobile tabs ────────────────────────────────────────────────────────── */

function MobileTabs({ currentSlug }: { currentSlug: string }) {
  return (
    <div className="flex overflow-x-auto gap-1.5 no-scrollbar px-4 py-3 border-b border-border lg:hidden">
      {DOC_SECTIONS.map((doc) => (
        <Link
          key={doc.slug}
          href={`/about/${doc.slug}`}
          className={`px-3 py-1.5 rounded-full text-[12px] whitespace-nowrap transition-colors shrink-0 ${
            doc.slug === currentSlug
              ? "bg-white/[0.08] text-white"
              : "text-white/30 hover:text-white/50"
          }`}
        >
          {doc.title}
        </Link>
      ))}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function DocPage() {
  const params = useParams();
  const slug = params.slug as string;
  const doc = getDocBySlug(slug);
  const { prev, next } = getAdjacentDocs(slug);

  if (!doc) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-[28px] text-white mb-2">Not Found</h1>
          <p className="text-[14px] text-white/40 mb-6">This page doesn&apos;t exist.</p>
          <Link href="/about" className="text-gain hover:underline text-[14px]">← Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Fixed Nav */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <AboutNav />
      </div>
      <div className="h-16" />

      {/* Mobile tabs */}
      <MobileTabs currentSlug={slug} />

      <div className="lg:grid lg:grid-cols-[220px_1fr] min-h-screen">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block sticky top-16 h-[calc(100vh-64px)] overflow-y-auto border-r border-border bg-black py-8 px-4">
          <DocSidebar currentSlug={slug} />
        </aside>

        {/* Content */}
        <main className="max-w-2xl py-8 lg:py-12 px-5 md:px-8 lg:px-12">
          <div className="pb-6 mb-8 border-b border-white/[0.06]">
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/20 font-medium mb-2">
              {doc.category}
            </p>
            <h1 className="font-display text-[24px] md:text-[32px] text-white leading-tight">
              {doc.title}
            </h1>
            <p className="text-[14px] text-white/30 mt-2">{doc.subtitle}</p>
          </div>

          <DocContent slug={slug} />

          {/* Prev / Next */}
          <div className="flex justify-between mt-16 pt-6 border-t border-white/[0.06]">
            {prev ? (
              <Link
                href={`/about/${prev.slug}`}
                className="flex items-center gap-2 text-[13px] group"
              >
                <ChevronLeft size={14} className="text-white/20 group-hover:-translate-x-0.5 transition-transform" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/15 mb-0.5">Previous</p>
                  <p className="text-white/40 group-hover:text-white transition-colors">{prev.title}</p>
                </div>
              </Link>
            ) : <div />}
            {next ? (
              <Link
                href={`/about/${next.slug}`}
                className="flex items-center gap-2 text-[13px] group text-right"
              >
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/15 mb-0.5">Next</p>
                  <p className="text-white/40 group-hover:text-white transition-colors">{next.title}</p>
                </div>
                <ChevronRight size={14} className="text-white/20 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ) : <div />}
          </div>
        </main>
      </div>
    </div>
  );
}
