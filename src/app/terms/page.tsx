import Link from "next/link";
import { TrendingUp, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Terms & Conditions",
  description: "Terms and conditions for using Prediction Market Agents AI trading agents on Kalshi and Polymarket prediction markets.",
};

/* ── shared prose helpers ── */
const H1 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-[18px] font-semibold text-white mb-3">{children}</h2>
);
const P = ({ children }: { children: React.ReactNode }) => <p className="mb-3">{children}</p>;
const CAPS = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-3 text-white/50 uppercase text-[13px] leading-relaxed font-medium">{children}</p>
);
const UL = ({ children }: { children: React.ReactNode }) => (
  <ul className="list-disc list-outside ml-5 space-y-1.5 mb-3">{children}</ul>
);

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between h-14 px-6 md:px-10">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <TrendingUp className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
              <span className="text-[16px] font-semibold tracking-tight">Prediction Market Agents</span>
            </Link>
            <Link href="/" className="flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </Link>
          </div>
          <Link href="/login" className="px-5 py-1.5 rounded-full bg-gain text-black text-[13px] font-semibold hover:bg-gain/90 transition-colors">
            Sign In
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-[800px] mx-auto px-6 md:px-10 py-12 md:py-20">
        <h1 className="text-[32px] md:text-[42px] font-bold tracking-tight font-display">
          Terms &amp; Conditions
        </h1>
        <p className="text-[13px] text-white/30 mt-2">Effective Date: March 30, 2026 &middot; Last Updated: March 30, 2026 &middot; Version 2.0</p>
        <div className="mt-8 h-px bg-white/[0.06]" />

        <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-white/60">
          {/* Important notice */}
          <section>
            <CAPS>
              IMPORTANT: PLEASE READ THESE TERMS AND CONDITIONS (&ldquo;TERMS&rdquo;) IN THEIR ENTIRETY BEFORE ACCESSING OR USING THE AGENT NASH PLATFORM.
              THESE TERMS CONTAIN BINDING ARBITRATION PROVISIONS, CLASS ACTION WAIVERS, LIMITATIONS OF LIABILITY, ASSUMPTION OF RISK PROVISIONS,
              INDEMNIFICATION OBLIGATIONS, AND OTHER PROVISIONS THAT MATERIALLY AFFECT YOUR LEGAL RIGHTS. BY ACCESSING, BROWSING, OR USING THE PLATFORM
              IN ANY MANNER, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THESE TERMS. IF YOU DO NOT AGREE TO ALL OF THESE
              TERMS, YOU MUST IMMEDIATELY CEASE ALL USE OF THE PLATFORM.
            </CAPS>
          </section>

          {/* 1. Definitions */}
          <section id="definitions">
            <H1>1. Definitions and Interpretation</H1>
            <P>1.1. In these Terms, unless the context otherwise requires, the following terms shall have the meanings set forth below:</P>
            <P><strong className="text-white/80">&ldquo;Agent&rdquo; or &ldquo;Bot&rdquo;</strong> means any AI-powered trading agent, algorithm, automated strategy, machine learning model, decision-making system, or any combination thereof that is deployed, tested, benchmarked, managed, monitored, or otherwise operated through the Platform, whether developed by the User, by Prediction Market Agents, by third parties, or by any combination of the foregoing.</P>
            <P><strong className="text-white/80">&ldquo;Prediction Market Agents IP&rdquo;</strong> means all intellectual property owned by or licensed to Prediction Market Agents, including but not limited to the Platform, Benchmark Data, meta-model logic, proprietary algorithms, capital routing systems, risk management frameworks, user interfaces, API designs, documentation, trade names, trademarks, service marks, logos, domain names, and all derivative works, improvements, and modifications thereof.</P>
            <P><strong className="text-white/80">&ldquo;Benchmark Data&rdquo;</strong> means all data generated through or derived from Platform operation, including without limitation: performance metrics, P&amp;L data, win/loss records, Sharpe ratios, drawdown data, trade execution logs, order flow data, reasoning traces, confidence scores, model outputs, debate transcripts, strategy drift analytics, risk parameter events, position sizing logs, override events, validation results, error logs, latency measurements, market condition snapshots at time of trade, and any aggregated, anonymized, or derived datasets produced from the foregoing.</P>
            <P><strong className="text-white/80">&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;</strong> refers to Prediction Market Agents and its past, present, and future affiliates, subsidiaries, parent companies, successors, assigns, officers, directors, employees, agents, contractors, licensors, and service providers.</P>
            <P><strong className="text-white/80">&ldquo;Content&rdquo;</strong> means all information, data, text, software, code, analytics, reports, visualizations, rankings, scores, recommendations, and other materials available on, generated by, or transmitted through the Platform.</P>
            <P><strong className="text-white/80">&ldquo;Fund&rdquo;</strong> means any capital pool, investment vehicle, managed account, or similar structure managed by Prediction Market Agents or its affiliates that deploys capital behind strategies benchmarked on the Platform.</P>
            <P><strong className="text-white/80">&ldquo;Losses&rdquo;</strong> means any and all losses, damages, liabilities, deficiencies, claims, actions, judgments, settlements, interest, awards, penalties, fines, costs, and expenses of whatever kind, including reasonable attorneys&rsquo; fees, expert fees, the cost of enforcing any right to indemnification, and the cost of pursuing any insurance providers.</P>
            <P><strong className="text-white/80">&ldquo;Platform&rdquo;</strong> means the Prediction Market Agents website (example.com), all subdomains, APIs, SDKs, dashboards, tools, widgets, mobile applications, software, infrastructure, documentation, and all related services operated, maintained, or provided by Prediction Market Agents, in any form and on any device.</P>
            <P><strong className="text-white/80">&ldquo;Strategy&rdquo;</strong> means any trading methodology, model, algorithm, decision-making framework, parameter configuration, signal generation system, or combination thereof used by or through an Agent on the Platform.</P>
            <P><strong className="text-white/80">&ldquo;Supported Markets&rdquo;</strong> means prediction markets (including but not limited to Polymarket, Kalshi, and any successors or similar platforms), cryptocurrency exchanges, decentralized exchanges, fantasy sports platforms, sports betting platforms, equities exchanges, derivatives exchanges, foreign exchange markets, commodities markets, and any other markets or exchanges integrated with or accessible through the Platform, now or in the future.</P>
            <P><strong className="text-white/80">&ldquo;Third-Party Services&rdquo;</strong> means any third-party exchanges, APIs, data providers, LLM providers, blockchain networks, smart contracts, wallets, payment processors, cloud infrastructure providers, analytics services, and any other services not operated by Prediction Market Agents that the Platform integrates with or relies upon.</P>
            <P><strong className="text-white/80">&ldquo;User,&rdquo; &ldquo;you,&rdquo; or &ldquo;your&rdquo;</strong> refers to any individual, entity, corporation, partnership, trust, or other legal person that accesses, registers for, browses, or uses the Platform in any capacity whatsoever.</P>
            <P><strong className="text-white/80">&ldquo;User Content&rdquo;</strong> means any Strategies, algorithms, code, configurations, data, parameters, API keys, credentials, feedback, communications, or other materials that you upload, submit, deploy, transmit, or otherwise make available through the Platform.</P>
            <P>1.2. Interpretation: (a) headings are for convenience only and do not affect interpretation; (b) &ldquo;including&rdquo; means &ldquo;including without limitation&rdquo;; (c) words in the singular include the plural and vice versa; (d) references to statutes include all regulations, orders, and instruments made under them and any amendments or re-enactments; (e) &ldquo;or&rdquo; is not exclusive; (f) &ldquo;will&rdquo; and &ldquo;shall&rdquo; are mandatory; (g) monetary amounts are in United States dollars unless otherwise specified.</P>
          </section>

          {/* 2. Eligibility */}
          <section id="eligibility">
            <H1>2. Eligibility, Registration, and Account Security</H1>
            <P>2.1. <strong className="text-white/80">Age and Capacity.</strong> You must be at least 18 years of age (or the age of majority in your jurisdiction, whichever is greater) and have the full legal capacity to enter into binding contracts. If you are entering into these Terms on behalf of an entity, you represent that you have the authority to bind that entity.</P>
            <P>2.2. <strong className="text-white/80">Regulatory Compliance.</strong> You are solely and exclusively responsible for determining whether your use of the Platform, including any trading activity conducted through connected exchange accounts, complies with all applicable laws, regulations, rules, orders, and guidelines in your jurisdiction, including but not limited to:</P>
            <UL>
              <li>Securities laws and regulations</li>
              <li>Commodity futures trading laws</li>
              <li>Gambling and prediction market regulations</li>
              <li>Anti-money laundering (AML) and counter-terrorism financing (CTF) laws</li>
              <li>Know Your Customer (KYC) requirements</li>
              <li>Tax reporting and withholding obligations</li>
              <li>International sanctions and export control regimes (including OFAC, EU, UK, and UN sanctions)</li>
              <li>Data protection and privacy laws</li>
              <li>Consumer protection laws</li>
            </UL>
            <CAPS>2.3. AGENT NASH DOES NOT AND CANNOT PROVIDE LEGAL ADVICE REGARDING THE LEGALITY OF YOUR USE OF THE PLATFORM IN YOUR JURISDICTION. THE AVAILABILITY OF THE PLATFORM IN YOUR JURISDICTION DOES NOT CONSTITUTE A REPRESENTATION THAT YOUR USE IS LAWFUL. YOU ASSUME ALL LEGAL AND REGULATORY RISK.</CAPS>
            <P>2.4. <strong className="text-white/80">Prohibited Jurisdictions.</strong> You represent and warrant that you are not: (a) located in, a national of, or a resident of any country or territory subject to comprehensive U.S. (OFAC), EU, UK, or UN sanctions; (b) listed on any U.S., EU, UK, or UN sanctions list, denied party list, or similar restricted party list; (c) owned or controlled by any person or entity described in (a) or (b). Prediction Market Agents reserves the right to restrict access from any jurisdiction at any time without notice.</P>
            <P>2.5. <strong className="text-white/80">Registration.</strong> You must provide accurate, current, and complete registration information and update it promptly if it changes. Providing false, outdated, or misleading information is grounds for immediate termination.</P>
            <P>2.6. <strong className="text-white/80">Account Security.</strong> You are solely responsible for all activity on your account. You must: (a) use a strong, unique password; (b) enable multi-factor authentication when available; (c) safeguard all credentials, API keys, and access tokens; (d) immediately notify us of any unauthorized access or security breach. Prediction Market Agents shall have no liability for any Losses arising from unauthorized account access, regardless of cause, including but not limited to credential theft, phishing, social engineering, malware, or device compromise.</P>
            <P>2.7. <strong className="text-white/80">One Account.</strong> One account per individual or entity. We may terminate all accounts associated with a User found to maintain multiple accounts.</P>
            <P>2.8. <strong className="text-white/80">Right to Refuse.</strong> We reserve the absolute right to refuse registration, suspend, or terminate any account at our sole and unfettered discretion, with or without cause, with or without notice, and without obligation to provide any reason or explanation whatsoever.</P>
          </section>

          {/* 3. Platform Services */}
          <section id="services">
            <H1>3. Platform Services and Scope</H1>
            <P>3.1. Prediction Market Agents provides infrastructure for deploying, benchmarking, governing, and analyzing AI-driven trading agents across liquid markets. Platform services include, without limitation:</P>
            <UL>
              <li>Agent deployment, execution, and monitoring infrastructure</li>
              <li>Performance benchmarking, ranking, and analytics</li>
              <li>Strategy comparison, scoring, and classification</li>
              <li>Risk management, governance, and parameter enforcement</li>
              <li>Capital routing infrastructure and meta-strategy layers</li>
              <li>Benchmark dataset access and licensing</li>
              <li>API and programmatic integration</li>
              <li>Real-time and historical data feeds</li>
              <li>Alerting, notification, and reporting systems</li>
            </UL>
            <P>3.2. <strong className="text-white/80">Nature of Services.</strong> Prediction Market Agents is a technology infrastructure provider. Prediction Market Agents is NOT: (a) a registered broker-dealer, investment adviser, or investment company; (b) a registered commodity trading adviser or commodity pool operator; (c) a money transmitter, money services business, or payment institution; (d) a gambling operator, bookmaker, or betting exchange; (e) a custodian of funds, securities, or digital assets; (f) a fiduciary to any User. Prediction Market Agents does not custody, hold, or control any User funds at any time.</P>
            <P>3.3. <strong className="text-white/80">No Guarantee of Availability.</strong> The Platform is provided on an &ldquo;AS-IS&rdquo; and &ldquo;AS-AVAILABLE&rdquo; basis. We do not guarantee that the Platform will be available, uninterrupted, timely, secure, error-free, or free of viruses or other harmful components. We expressly reserve the right to modify, suspend, discontinue, or terminate any feature, functionality, or the entire Platform at any time, with or without notice, for any reason or no reason, and without liability to you.</P>
            <P>3.4. <strong className="text-white/80">Maintenance and Downtime.</strong> We may perform scheduled or unscheduled maintenance at any time. During maintenance periods, the Platform may be partially or fully unavailable. Agents may be halted, trades may fail, and data may be delayed or lost. You acknowledge that maintenance downtime may result in missed trading opportunities, failed trade executions, or financial losses, and you accept such risks.</P>
            <P>3.5. <strong className="text-white/80">Modification of Services.</strong> We reserve the right to modify, upgrade, downgrade, rebrand, restructure, or fundamentally alter any aspect of the Platform, including pricing, features, APIs, data formats, benchmarking methodologies, ranking algorithms, and scoring criteria, at any time, with or without notice, and without liability to you.</P>
          </section>

          {/* 4. No Investment Advice */}
          <section id="no-investment-advice">
            <H1>4. No Investment Advice; No Fiduciary Duty; No Guarantees</H1>
            <CAPS>4.1. NOTHING ON THE PLATFORM CONSTITUTES OR SHALL BE CONSTRUED AS INVESTMENT ADVICE, FINANCIAL ADVICE, TRADING ADVICE, TAX ADVICE, LEGAL ADVICE, OR ANY OTHER FORM OF PROFESSIONAL ADVICE OR RECOMMENDATION. ALL CONTENT, INCLUDING BENCHMARK DATA, PERFORMANCE METRICS, RANKINGS, SCORES, ANALYTICS, AND STRATEGY COMPARISONS, IS PROVIDED FOR INFORMATIONAL AND EDUCATIONAL PURPOSES ONLY AND SHOULD NOT BE RELIED UPON AS THE BASIS FOR ANY INVESTMENT DECISION.</CAPS>
            <CAPS>4.2. PAST PERFORMANCE IS NOT INDICATIVE OF FUTURE RESULTS. SIMULATED PERFORMANCE DOES NOT REFLECT ACTUAL TRADING. PAPER TRADING RESULTS BEAR NO NECESSARY RELATION TO LIVE TRADING RESULTS. BENCHMARK DATA MAY CONTAIN ERRORS. RANKINGS MAY BE MISLEADING. NO AGENT, STRATEGY, OR FUND CAN GUARANTEE POSITIVE RETURNS. YOU MAY LOSE SOME OR ALL OF YOUR CAPITAL.</CAPS>
            <P>4.3. <strong className="text-white/80">No Fiduciary Duty.</strong> Prediction Market Agents owes no fiduciary duty to any User. No relationship created by these Terms or by your use of the Platform shall be interpreted as creating a fiduciary, advisory, trust, agency, joint venture, partnership, or employment relationship between Prediction Market Agents and any User.</P>
            <P>4.4. <strong className="text-white/80">Independent Decision-Making.</strong> All decisions to deploy Agents, connect exchange accounts, set risk parameters, allocate capital, enter or exit positions, or take any other action through or informed by the Platform are your own decisions, made at your own risk, and based on your own independent judgment. You are solely and exclusively responsible for all financial outcomes, whether positive or negative.</P>
            <P>4.5. <strong className="text-white/80">No Endorsement.</strong> The inclusion, ranking, or display of any Agent, Strategy, exchange, market, or third-party service on the Platform does not constitute an endorsement, recommendation, or guarantee of performance or reliability.</P>
          </section>

          {/* 5. AI and Technology Risk */}
          <section id="risk-disclosures">
            <H1>5. AI and Technology Risk Disclosures</H1>
            <CAPS>5.1. AI HALLUCINATION AND FABRICATION. You acknowledge and accept that AI agents, including but not limited to agents powered by large language models (LLMs), are known to: fabricate data, statistics, citations, and reasoning; produce confident but factually incorrect outputs; misinterpret source material; anchor analysis to existing market prices rather than conducting independent assessment; generate internally inconsistent reasoning; and exhibit unpredictable behavior under novel conditions. AGENT NASH DOES NOT AND CANNOT GUARANTEE THE ACCURACY, RELIABILITY, OR RATIONALITY OF ANY AI AGENT OUTPUT.</CAPS>
            <P>5.2. <strong className="text-white/80">Reasoning Quality Failures.</strong> AI agents deployed on the Platform may exhibit the following known failure modes, among others:</P>
            <UL>
              <li>Citation and data fabrication by research agents</li>
              <li>Anchoring bias (analysis suspiciously correlated with current market prices rather than independent forecasting)</li>
              <li>Position sizing overrides (agents overriding risk management recommendations, including upstream risk manager failures)</li>
              <li>Model disagreement and debate failures (agents failing to identify or correct errors in multi-agent pipelines)</li>
              <li>Confidence miscalibration (agents expressing high confidence in incorrect predictions)</li>
              <li>Schema and format errors causing trade execution failures</li>
              <li>Degraded performance due to LLM model updates, deprecations, or quality regressions by upstream providers</li>
              <li>Prompt injection, jailbreaking, or adversarial manipulation of agent reasoning</li>
              <li>Context window limitations causing agents to ignore relevant information</li>
              <li>Compounding errors in multi-step reasoning chains</li>
            </UL>
            <P>5.3. <strong className="text-white/80">Market Risk.</strong> Trading in prediction markets, cryptocurrencies, equities, derivatives, and other financial instruments involves substantial risk of loss, up to and including total loss of capital. Prices are volatile, unpredictable, and subject to manipulation. Past performance is not predictive of future results. You should never trade with money you cannot afford to lose.</P>
            <P>5.4. <strong className="text-white/80">Technology Risk.</strong> The Platform depends on complex software, hardware, internet connectivity, cloud infrastructure, third-party APIs, LLM providers, blockchain networks, and other technology systems that may fail, degrade, be compromised, or become unavailable. Technology failures may cause: missed trades, duplicate trades, trades at incorrect prices, trades in incorrect amounts, failure to close positions, failure to enforce risk limits, data loss or corruption, delayed or missing notifications, and other adverse outcomes.</P>
            <P>5.5. <strong className="text-white/80">Smart Contract and Blockchain Risk.</strong> Certain Supported Markets operate on blockchain infrastructure and smart contracts. Smart contracts may contain bugs, vulnerabilities, or design flaws; be subject to exploits, hacks, or griefing attacks; experience network congestion, forks, or reorganizations; be modified or deprecated by their operators; or interact unexpectedly with other contracts. Prediction Market Agents has no control over blockchain networks or third-party smart contracts.</P>
            <P>5.6. <strong className="text-white/80">Liquidity and Execution Risk.</strong> Markets may lack sufficient liquidity for optimal execution. Orders may experience significant slippage, partial fills, or complete failure. Market conditions can change between the time an Agent generates a signal and the time a trade is executed. During periods of high volatility, exchange outages, or market stress, execution quality may be severely degraded.</P>
            <P>5.7. <strong className="text-white/80">Exchange and Counterparty Risk.</strong> Third-party exchanges may become insolvent, suspend operations, freeze accounts, seize assets, change terms of service, impose withdrawal limits, delist markets, or otherwise fail to perform. Prediction Market Agents has no control over and assumes no responsibility for the actions, omissions, or failures of any third-party exchange or counterparty.</P>
            <P>5.8. <strong className="text-white/80">Regulatory and Legal Risk.</strong> The regulatory landscape for AI trading, prediction markets, cryptocurrency, and related activities is evolving, uncertain, and varies by jurisdiction. Changes in law, regulation, enforcement practice, or government policy may restrict, prohibit, or criminalize your use of the Platform or certain markets. You assume all regulatory and legal risk.</P>
            <P>5.9. <strong className="text-white/80">Cybersecurity Risk.</strong> The Platform, your devices, third-party exchanges, and the internet generally are vulnerable to cyberattacks, data breaches, unauthorized access, malware, phishing, denial of service attacks, and other security threats. While we implement reasonable security measures, no system is completely secure.</P>
            <P>5.10. <strong className="text-white/80">Model Dependency Risk.</strong> The Platform relies on third-party LLM providers (including but not limited to Anthropic, OpenAI, xAI, Google, DeepSeek, and providers accessed through OpenRouter). These providers may: change model behavior without notice; deprecate or discontinue models; degrade model quality; impose rate limits or usage restrictions; experience outages; or modify their terms of service. Prediction Market Agents cannot guarantee consistent AI model quality or availability.</P>
            <P>5.11. <strong className="text-white/80">Cascade and Systemic Risk.</strong> Multiple Agents operating simultaneously on the same or correlated markets may create systemic risks including: herding behavior, correlated drawdowns, liquidity crises, and cascading failures. Prediction Market Agents&rsquo;s risk management systems may fail to prevent such events.</P>
            <CAPS>5.12. YOU ACKNOWLEDGE THAT YOU HAVE READ AND UNDERSTOOD ALL RISK DISCLOSURES IN THIS SECTION 5 AND THAT YOU VOLUNTARILY ASSUME ALL SUCH RISKS. YOU AGREE THAT AGENT NASH SHALL HAVE NO LIABILITY WHATSOEVER FOR ANY LOSSES ARISING FROM OR RELATED TO ANY OF THE RISKS DESCRIBED HEREIN.</CAPS>
          </section>

          {/* 6. IP */}
          <section id="intellectual-property">
            <H1>6. Intellectual Property, Data Rights, and Licensing</H1>
            <P>6.1. <strong className="text-white/80">Prediction Market Agents IP.</strong> All rights, title, and interest in and to the Prediction Market Agents IP, including the Platform, Benchmark Data, meta-model logic, proprietary algorithms, capital routing systems, risk management frameworks, APIs, documentation, trade dress, and all copyrights, patents, patent applications, trade secrets, trademarks, and other intellectual property rights therein, are and shall remain the sole and exclusive property of Prediction Market Agents. Nothing in these Terms grants you any right, title, or interest in the Prediction Market Agents IP except the limited license expressly set forth in Section 6.4.</P>
            <CAPS>6.2. BENCHMARK DATA OWNERSHIP. ALL BENCHMARK DATA IS THE SOLE AND EXCLUSIVE PROPERTY OF AGENT NASH. By using the Platform, you irrevocably assign to Prediction Market Agents all right, title, and interest (including intellectual property rights) in and to all Benchmark Data generated through your use of the Platform. To the extent any such assignment is not effective under applicable law, you grant Prediction Market Agents a perpetual, irrevocable, worldwide, royalty-free, fully paid-up, exclusive, transferable, sublicensable (through multiple tiers) license to use, reproduce, modify, create derivative works from, distribute, publicly display, publicly perform, commercialize, and otherwise exploit all Benchmark Data for any purpose whatsoever.</CAPS>
            <P>6.3. <strong className="text-white/80">User Content License.</strong> You retain ownership of your pre-existing Strategies and code that you bring to the Platform. However, by deploying, uploading, or otherwise making available any User Content on the Platform, you grant Prediction Market Agents a perpetual, irrevocable, worldwide, royalty-free, fully paid-up, non-exclusive, transferable, sublicensable (through multiple tiers) license to:</P>
            <UL>
              <li>Collect, store, index, cache, and archive all User Content and all data generated by or derived from User Content</li>
              <li>Analyze, benchmark, rank, score, and compare User Content and derived data against other Strategies</li>
              <li>Use User Content and derived data to train, improve, and develop proprietary models, meta-strategy layers, and capital routing algorithms</li>
              <li>Include anonymized and aggregated data derived from User Content in proprietary datasets, public reports, research publications, marketing materials, and investor presentations</li>
              <li>Create derivative works based on patterns, techniques, and insights observed in User Content (excluding verbatim reproduction of proprietary source code)</li>
              <li>Sublicense any of the foregoing rights to affiliates, service providers, research partners, and Fund participants</li>
            </UL>
            <P>6.4. <strong className="text-white/80">Limited License to You.</strong> Subject to your compliance with these Terms, Prediction Market Agents grants you a limited, non-exclusive, non-transferable, non-sublicensable, revocable license to access and use the Platform solely for your own internal purposes. This license does not include any right to: (a) resell, sublicense, or redistribute Platform access; (b) modify, adapt, or create derivative works of the Platform; (c) reverse engineer, decompile, or disassemble any part of the Platform; (d) use the Platform to build a competing product or service; (e) access or extract the Benchmark Data beyond what is displayed in your account dashboard.</P>
            <P>6.5. <strong className="text-white/80">Scraping Prohibition.</strong> You may not scrape, crawl, spider, index, harvest, data mine, or systematically extract any data, content, or information from the Platform by any automated or manual means without express prior written consent from Prediction Market Agents.</P>
            <P>6.6. <strong className="text-white/80">Trademark.</strong> The Prediction Market Agents name, logo, taglines, and all related marks and trade dress are trademarks of Prediction Market Agents. You may not use them without prior written authorization.</P>
            <P>6.7. <strong className="text-white/80">DMCA.</strong> If you believe your intellectual property rights have been infringed, contact hello@example.com with a detailed description of the alleged infringement.</P>
            <P>6.8. <strong className="text-white/80">Survival.</strong> The rights and licenses granted to Prediction Market Agents under this Section 6 shall survive termination or expiration of these Terms and your account.</P>
          </section>

          {/* 7. Prohibited Conduct */}
          <section id="prohibited-conduct">
            <H1>7. User Obligations and Prohibited Conduct</H1>
            <P>7.1. You agree to comply with all applicable laws and regulations in connection with your use of the Platform.</P>
            <P>7.2. You shall not, and shall not permit any third party to:</P>
            <UL>
              <li>Use the Platform for any unlawful, fraudulent, deceptive, or harmful purpose</li>
              <li>Engage in market manipulation, wash trading, front-running, spoofing, layering, or any other form of market abuse</li>
              <li>Submit false, misleading, or fabricated performance data, Strategy descriptions, or account information</li>
              <li>Attempt to gain unauthorized access to the Platform, other User accounts, or any connected systems</li>
              <li>Introduce malicious code, viruses, trojans, worms, ransomware, or any harmful technology</li>
              <li>Interfere with, disrupt, or degrade the operation, security, or integrity of the Platform</li>
              <li>Circumvent, disable, or interfere with any security, authentication, rate limiting, or access control mechanisms</li>
              <li>Manipulate, spoof, or game the benchmarking, ranking, scoring, or capital routing systems</li>
              <li>Reverse engineer, decompile, disassemble, or attempt to derive the source code, algorithms, or proprietary logic of the Platform</li>
              <li>Use the Platform to compete with Prediction Market Agents or to develop a competing product or service</li>
              <li>Resell, sublicense, redistribute, or commercially exploit Platform access, Benchmark Data, or any Prediction Market Agents IP</li>
              <li>Use the Platform on behalf of a sanctioned person, entity, or jurisdiction</li>
              <li>Circumvent geographic restrictions or access the Platform from a prohibited jurisdiction via VPN, proxy, or similar technology</li>
              <li>Share, publish, or disclose Benchmark Data, API documentation, or other confidential information without authorization</li>
              <li>Create multiple accounts or use another person&rsquo;s account without authorization</li>
              <li>Use the Platform to facilitate money laundering, terrorist financing, tax evasion, or any financial crime</li>
              <li>Engage in any activity that could cause reputational harm to Prediction Market Agents</li>
            </UL>
            <P>7.3. <strong className="text-white/80">Consequences.</strong> Violation of any provision of Section 7.2 shall constitute a material breach of these Terms and may result in, at our sole discretion: immediate account suspension or termination; forfeiture of any accrued benefits, credits, or refunds; reporting to law enforcement or regulatory authorities; and legal action seeking damages, injunctive relief, and costs.</P>
          </section>

          {/* 8. API Keys */}
          <section id="api-keys">
            <H1>8. API Keys, Exchange Credentials, and Third-Party Integrations</H1>
            <P>8.1. <strong className="text-white/80">Credential Responsibility.</strong> You are solely and exclusively responsible for the security, management, and proper configuration of all API keys, access tokens, passwords, private keys, seed phrases, and other credentials associated with your account or connected exchange accounts.</P>
            <P>8.2. <strong className="text-white/80">API Key Permissions.</strong> You are solely responsible for ensuring that API keys provided to the Platform have appropriate permission scopes. You should use the minimum permissions necessary and should never provide withdrawal permissions unless explicitly required and documented.</P>
            <CAPS>8.3. CREDENTIAL SECURITY. Prediction Market Agents stores exchange API keys using commercially reasonable encryption methods (AES-256 at rest). HOWEVER, NO SECURITY SYSTEM IS IMPENETRABLE. YOU ACKNOWLEDGE AND ACCEPT THAT: (a) encryption may be compromised; (b) data breaches may occur; (c) credentials may be exposed through vulnerabilities in the Platform, infrastructure providers, or exchange APIs; (d) stolen credentials may result in unauthorized trades or fund withdrawals on connected exchanges; (e) AGENT NASH SHALL HAVE NO LIABILITY FOR ANY LOSSES ARISING FROM THE COMPROMISE, THEFT, EXPOSURE, MISUSE, OR UNAUTHORIZED USE OF YOUR API KEYS OR CREDENTIALS, REGARDLESS OF THE CAUSE, INCLUDING AGENT NASH&rsquo;S OWN NEGLIGENCE.</CAPS>
            <P>8.4. <strong className="text-white/80">Third-Party Service Risk.</strong> The Platform integrates with Third-Party Services. Prediction Market Agents does not control, endorse, or guarantee: the availability, security, accuracy, legality, or performance of any Third-Party Service; the execution, settlement, or finality of trades on third-party exchanges; the solvency or financial condition of any exchange or counterparty; the accuracy of data received from third-party providers; or the continued availability of any LLM model or API.</P>
            <P>8.5. <strong className="text-white/80">Third-Party Terms.</strong> Your use of Third-Party Services is subject to their respective terms, policies, and agreements. It is your sole responsibility to read, understand, and comply with Third-Party Service terms. Conflicts between these Terms and Third-Party Service terms are resolved in favor of these Terms with respect to Prediction Market Agents&rsquo;s obligations and liability.</P>
            <P>8.6. <strong className="text-white/80">Credential Revocation.</strong> You may revoke or rotate your API keys at any time through your exchange account or Platform settings. Active Agents connected to revoked keys will be halted. Prediction Market Agents is not responsible for any losses incurred during the period between key compromise and key revocation.</P>
          </section>

          {/* 9. Trade Execution */}
          <section id="trade-execution">
            <H1>9. Trade Execution, Data Accuracy, and System Performance</H1>
            <P>9.1. <strong className="text-white/80">No Guarantee of Execution.</strong> Prediction Market Agents does not guarantee that any trade signal generated by an Agent will result in a successfully executed trade. Trade execution depends on third-party exchanges, network connectivity, market conditions, and other factors outside Prediction Market Agents&rsquo;s control. Trades may be delayed, fail, execute at different prices, execute in different amounts, be partially filled, be duplicated, or be rejected.</P>
            <CAPS>9.2. VALIDATION LAYER. The Platform employs an AI validation layer that evaluates trade decisions against user-defined risk parameters before execution. YOU ACKNOWLEDGE THAT: (a) the validation layer itself is an AI system subject to errors and failures; (b) the validation layer may approve trades that should have been rejected or reject trades that should have been approved; (c) the validation layer may fail entirely, allowing unvalidated trades to pass through; (d) AGENT NASH SHALL HAVE NO LIABILITY FOR FAILURES, ERRORS, OR OMISSIONS OF THE VALIDATION LAYER.</CAPS>
            <CAPS>9.3. DATA ACCURACY. The Platform displays market data, performance metrics, P&amp;L calculations, and other data sourced from multiple providers. THIS DATA MAY BE INACCURATE, DELAYED, INCOMPLETE, OR ERRONEOUS. Prediction Market Agents does not verify the accuracy of third-party data and makes no representation regarding data quality. You should independently verify all critical data before making decisions.</CAPS>
            <P>9.4. <strong className="text-white/80">System Performance.</strong> The Platform&rsquo;s performance depends on complex, distributed systems including cloud servers, databases, real-time data feeds, AI inference APIs, and exchange connectors. System degradation, high latency, memory errors, database failures, queue overflows, race conditions, and other technical issues may affect Platform operation and trade execution.</P>
            <CAPS>9.5. DATA LOSS. YOU ACKNOWLEDGE AND ACCEPT THAT DATA STORED ON THE PLATFORM, INCLUDING TRADE HISTORY, AGENT LOGS, CONFIGURATIONS, AND BENCHMARK DATA, MAY BE LOST, CORRUPTED, OR RENDERED INACCESSIBLE DUE TO HARDWARE FAILURE, SOFTWARE BUGS, CYBERATTACKS, NATURAL DISASTERS, OR OTHER CAUSES. AGENT NASH SHALL HAVE NO LIABILITY FOR DATA LOSS, REGARDLESS OF CAUSE. YOU ARE SOLELY RESPONSIBLE FOR MAINTAINING YOUR OWN BACKUPS OF CRITICAL DATA.</CAPS>
          </section>

          {/* 10. Fees */}
          <section id="fees">
            <H1>10. Fees, Payments, and Fund Terms</H1>
            <P>10.1. <strong className="text-white/80">Fee Structure.</strong> Access to certain Platform features requires payment of subscription fees, licensing fees, API usage fees, or other charges as published on the Platform or in separate order forms. All fees are quoted exclusive of applicable taxes.</P>
            <CAPS>10.2. NON-REFUNDABLE. ALL FEES ARE NON-REFUNDABLE TO THE MAXIMUM EXTENT PERMITTED BY LAW, regardless of whether you use the services during the paid period, whether your account is suspended or terminated, or whether the Platform experiences outages or issues.</CAPS>
            <P>10.3. <strong className="text-white/80">Automatic Renewal.</strong> Subscriptions automatically renew at the end of each billing period at the then-current rate unless cancelled before the renewal date. It is your sole responsibility to cancel before renewal if you do not wish to continue.</P>
            <P>10.4. <strong className="text-white/80">Price Changes.</strong> We may change pricing at any time with 30 days&rsquo; notice. Continued use after a price change constitutes acceptance.</P>
            <P>10.5. <strong className="text-white/80">Late Payment.</strong> Overdue amounts accrue interest at 1.5% per month or the maximum rate permitted by law, whichever is less. You are responsible for all collection costs, including reasonable attorneys&rsquo; fees.</P>
            <P>10.6. <strong className="text-white/80">Fund Terms.</strong> Fund participation is governed by separate Fund documentation. By participating in the Fund, you acknowledge that: (a) performance fees will be charged as specified; (b) capital is deployed at Prediction Market Agents&rsquo;s sole discretion; (c) Fund performance is not guaranteed; (d) you may lose all invested capital; (e) withdrawal may be subject to lock-up periods, notice requirements, and capacity constraints; (f) the Fund may be wound down at any time.</P>
          </section>

          {/* 11. Limitation of Liability */}
          <section id="limitation-of-liability">
            <H1>11. Limitation of Liability</H1>
            <CAPS>11.1. EXCLUSION OF DAMAGES. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL AGENT NASH OR ANY OF ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, CONTRACTORS, LICENSORS, OR SERVICE PROVIDERS BE LIABLE FOR ANY:</CAPS>
            <UL>
              <li>Indirect, incidental, special, consequential, punitive, or exemplary damages</li>
              <li>Loss of profits, revenue, income, business, savings, or anticipated savings</li>
              <li>Loss of data, goodwill, reputation, or opportunity</li>
              <li>Trading losses of any kind, whether resulting from Platform errors, Agent failures, AI hallucination, third-party service disruptions, exchange failures, or any other cause</li>
              <li>Unauthorized access to, alteration of, loss of, or damage to your data, account, exchange accounts, or funds</li>
              <li>Losses resulting from the compromise, theft, or misuse of API keys or credentials stored on the Platform</li>
              <li>Losses resulting from failed, delayed, duplicated, or erroneous trade executions</li>
              <li>Losses resulting from inaccurate, delayed, or missing market data or Platform analytics</li>
              <li>Losses resulting from Platform downtime, maintenance, outages, or discontinuation</li>
              <li>Losses resulting from changes to LLM models, AI provider outages, or AI reasoning failures</li>
              <li>Losses resulting from regulatory changes, exchange policy changes, or legal proceedings</li>
              <li>Cost of procurement of substitute services</li>
              <li>Any other damages arising out of or related to these Terms or the Platform</li>
            </UL>
            <CAPS>REGARDLESS OF THE THEORY OF LIABILITY (CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR OTHERWISE), AND REGARDLESS OF WHETHER AGENT NASH HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</CAPS>
            <CAPS>11.2. AGGREGATE LIABILITY CAP. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, AGENT NASH&rsquo;S TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THESE TERMS OR THE PLATFORM SHALL NOT EXCEED THE LESSER OF: (A) THE TOTAL FEES ACTUALLY PAID BY YOU TO AGENT NASH IN THE SIX (6) MONTHS IMMEDIATELY PRECEDING THE FIRST EVENT GIVING RISE TO THE CLAIM; OR (B) FIFTY UNITED STATES DOLLARS (US$50).</CAPS>
            <P>11.3. <strong className="text-white/80">Essential Basis.</strong> You acknowledge that the limitations and exclusions in this Section 11 reflect a reasonable and fair allocation of risk between you and Prediction Market Agents, that they form an essential basis of the bargain between the parties, and that Prediction Market Agents would not have entered into these Terms without these limitations.</P>
            <P>11.4. <strong className="text-white/80">Jurisdictional Variation.</strong> Some jurisdictions do not allow the exclusion or limitation of certain damages. In such jurisdictions, Prediction Market Agents&rsquo;s liability shall be limited to the fullest extent permitted by applicable law.</P>
            <P>11.5. <strong className="text-white/80">Time Limitation.</strong> Any claim arising out of or related to these Terms or the Platform must be filed within one (1) year of the event giving rise to the claim. Claims filed after this period are permanently barred.</P>
          </section>

          {/* 12. Indemnification */}
          <section id="indemnification">
            <H1>12. Indemnification</H1>
            <P>12.1. <strong className="text-white/80">General Indemnification.</strong> You shall indemnify, defend, and hold harmless Prediction Market Agents and its affiliates, officers, directors, employees, agents, contractors, licensors, and service providers (collectively, &ldquo;Indemnified Parties&rdquo;) from and against any and all Losses arising out of or related to:</P>
            <UL>
              <li>Your use or misuse of the Platform</li>
              <li>Your violation of these Terms or any applicable law, regulation, or third-party right</li>
              <li>Your trading activity, including all profits and losses</li>
              <li>Any Agent or Strategy you deploy, configure, or operate on the Platform</li>
              <li>Your User Content, including any intellectual property infringement claims</li>
              <li>Your connected exchange accounts and all activity thereon</li>
              <li>Your API keys, credentials, and their use or compromise</li>
              <li>Any claims by third parties arising from your use of the Platform</li>
              <li>Your failure to comply with applicable tax, regulatory, or reporting obligations</li>
              <li>Any misrepresentation or breach of warranty by you</li>
              <li>Any regulatory investigation, enforcement action, or legal proceeding arising from your Platform activity</li>
            </UL>
            <P>12.2. <strong className="text-white/80">Procedure.</strong> Prediction Market Agents shall promptly notify you of any claim subject to indemnification (failure to notify does not relieve your indemnification obligation except to the extent you are materially prejudiced). Prediction Market Agents may, at your expense, assume the exclusive defense and control of any matter subject to indemnification. You may not settle any claim without Prediction Market Agents&rsquo;s prior written consent.</P>
            <P>12.3. <strong className="text-white/80">Survival.</strong> Indemnification obligations survive termination of these Terms and your account.</P>
          </section>

          {/* 13. Disclaimer */}
          <section id="disclaimer">
            <H1>13. Disclaimer of Warranties</H1>
            <CAPS>13.1. THE PLATFORM, ALL CONTENT, BENCHMARK DATA, ANALYTICS, AND ALL SERVICES PROVIDED BY AGENT NASH ARE PROVIDED &ldquo;AS IS,&rdquo; &ldquo;AS AVAILABLE,&rdquo; AND &ldquo;WITH ALL FAULTS,&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE.</CAPS>
            <CAPS>13.2. AGENT NASH EXPRESSLY DISCLAIMS ALL WARRANTIES, INCLUDING WITHOUT LIMITATION:</CAPS>
            <UL>
              <li>Implied warranties of merchantability, fitness for a particular purpose, title, and non-infringement</li>
              <li>Warranties arising from course of dealing, course of performance, or usage of trade</li>
              <li>Warranties regarding the accuracy, completeness, reliability, timeliness, or availability of the Platform or any Content</li>
              <li>Warranties that the Platform will meet your requirements or expectations</li>
              <li>Warranties that the Platform will be uninterrupted, error-free, secure, or free of viruses or harmful components</li>
              <li>Warranties that defects will be corrected or that any data will be preserved</li>
              <li>Warranties regarding the results obtainable from the Platform, including any Agent performance or trading results</li>
              <li>Warranties regarding the quality, accuracy, or reliability of any AI model, LLM, or automated reasoning system</li>
            </UL>
            <CAPS>13.3. NO ORAL OR WRITTEN INFORMATION OR ADVICE GIVEN BY AGENT NASH OR ITS REPRESENTATIVES SHALL CREATE ANY WARRANTY NOT EXPRESSLY STATED IN THESE TERMS.</CAPS>
          </section>

          {/* 14. Confidentiality */}
          <section id="confidentiality">
            <H1>14. Confidentiality</H1>
            <P>14.1. You agree to treat as confidential and not to disclose to any third party: (a) all non-public information about the Platform&rsquo;s architecture, algorithms, benchmarking methodologies, and proprietary systems; (b) Benchmark Data (except as displayed in your own account); (c) API documentation marked as confidential; (d) Fund performance data and investor information; (e) any other information designated as confidential by Prediction Market Agents.</P>
            <P>14.2. This confidentiality obligation survives termination of these Terms for a period of five (5) years, except for trade secrets, which shall remain confidential indefinitely.</P>
          </section>

          {/* 15. Termination */}
          <section id="termination">
            <H1>15. Termination</H1>
            <P>15.1. <strong className="text-white/80">Termination by You.</strong> You may terminate your account at any time by contacting hello@example.com or using account settings. Termination does not relieve you of any obligations accrued prior to termination, including payment obligations.</P>
            <P>15.2. <strong className="text-white/80">Termination by Prediction Market Agents.</strong> We may suspend or terminate your account immediately, with or without cause, with or without notice, at our sole and absolute discretion. Grounds for termination include, without limitation: (a) violation of these Terms; (b) suspected fraud or illegal activity; (c) regulatory requirements; (d) extended inactivity; (e) failure to pay fees; (f) any reason we deem appropriate; or (g) no reason at all.</P>
            <P>15.3. <strong className="text-white/80">Effect of Termination.</strong> Upon termination: (a) your right to access the Platform ceases immediately; (b) all active Agents are halted (open positions on exchanges are NOT automatically closed); (c) you remain responsible for closing positions on your exchange accounts; (d) outstanding fees remain payable; (e) API keys are deleted within 30 days; (f) Benchmark Data is retained by Prediction Market Agents indefinitely; (g) Sections 1, 4, 5, 6, 7, 8.3, 9.5, 10.2, 11, 12, 13, 14, 15.3, 16, 17, and 18 survive termination.</P>
            <P>15.4. <strong className="text-white/80">No Liability for Termination.</strong> Prediction Market Agents shall not be liable to you or any third party for any termination or suspension of your account or access to the Platform.</P>
          </section>

          {/* 16. Governing Law */}
          <section id="governing-law">
            <H1>16. Governing Law and Dispute Resolution</H1>
            <P>16.1. <strong className="text-white/80">Governing Law.</strong> These Terms shall be governed by and construed in accordance with the laws of the Dubai International Financial Centre (DIFC), without regard to its conflict of law provisions.</P>
            <CAPS>16.2. MANDATORY ARBITRATION. ANY DISPUTE, CONTROVERSY, OR CLAIM ARISING OUT OF, RELATING TO, OR IN CONNECTION WITH THESE TERMS, INCLUDING ANY QUESTION REGARDING THEIR EXISTENCE, VALIDITY, INTERPRETATION, PERFORMANCE, BREACH, OR TERMINATION, SHALL BE REFERRED TO AND FINALLY RESOLVED BY BINDING ARBITRATION ADMINISTERED BY THE DIFC-LCIA ARBITRATION CENTRE IN ACCORDANCE WITH THE DIFC-LCIA ARBITRATION RULES IN FORCE AT THE TIME OF FILING.</CAPS>
            <P>16.3. <strong className="text-white/80">Arbitration Terms.</strong> The seat of arbitration shall be Dubai, United Arab Emirates. The language of arbitration shall be English. The tribunal shall consist of a single arbitrator appointed in accordance with the DIFC-LCIA Rules. The arbitrator&rsquo;s decision shall be final and binding and may be entered as a judgment in any court of competent jurisdiction.</P>
            <CAPS>16.4. CLASS ACTION WAIVER. YOU AGREE THAT ANY AND ALL DISPUTES SHALL BE RESOLVED SOLELY ON AN INDIVIDUAL BASIS AND NOT AS A CLASS ACTION, COLLECTIVE ACTION, REPRESENTATIVE ACTION, OR PRIVATE ATTORNEY GENERAL ACTION. YOU IRREVOCABLY WAIVE ANY RIGHT TO PARTICIPATE IN A CLASS, COLLECTIVE, OR REPRESENTATIVE PROCEEDING. THE ARBITRATOR MAY NOT CONSOLIDATE MORE THAN ONE PERSON&rsquo;S CLAIMS AND MAY NOT PRESIDE OVER ANY FORM OF CLASS, COLLECTIVE, OR REPRESENTATIVE PROCEEDING.</CAPS>
            <CAPS>16.5. JURY WAIVER. TO THE EXTENT PERMITTED BY APPLICABLE LAW, YOU IRREVOCABLY WAIVE ANY RIGHT TO TRIAL BY JURY IN ANY ACTION OR PROCEEDING ARISING OUT OF OR RELATED TO THESE TERMS.</CAPS>
            <P>16.6. <strong className="text-white/80">Injunctive Relief.</strong> Notwithstanding the foregoing, Prediction Market Agents may seek injunctive or other equitable relief in any court of competent jurisdiction to prevent the actual or threatened infringement, misappropriation, or violation of Prediction Market Agents&rsquo;s intellectual property rights, data rights, confidentiality rights, or any other proprietary rights.</P>
            <P>16.7. <strong className="text-white/80">Small Claims.</strong> Notwithstanding mandatory arbitration, either party may bring an individual action in small claims court for disputes within that court&rsquo;s jurisdiction.</P>
            <P>16.8. <strong className="text-white/80">Prevailing Party.</strong> The prevailing party in any arbitration or legal proceeding shall be entitled to recover reasonable attorneys&rsquo; fees, expert fees, and costs.</P>
          </section>

          {/* 17. Force Majeure */}
          <section id="force-majeure">
            <H1>17. Force Majeure</H1>
            <P>Prediction Market Agents shall not be liable for any failure or delay in performance resulting from circumstances beyond our reasonable control, including but not limited to: acts of God, natural disasters, epidemics, pandemics, war, armed conflict, terrorism, civil unrest, government actions or restrictions, sanctions, embargoes, exchange outages, blockchain network failures or congestion, smart contract exploits, cyberattacks, DDoS attacks, internet disruptions, power failures, telecommunications failures, infrastructure provider failures, LLM provider outages or model changes, regulatory changes, court orders, labor disputes, supply chain disruptions, and any other event beyond Prediction Market Agents&rsquo;s reasonable control.</P>
          </section>

          {/* 18. General Provisions */}
          <section id="general">
            <H1>18. General Provisions</H1>
            <P>18.1. <strong className="text-white/80">Entire Agreement.</strong> These Terms, together with the Privacy Policy, User Sign-Up Agreement, and any applicable Fund documentation or order forms, constitute the entire agreement between you and Prediction Market Agents. All prior or contemporaneous agreements, representations, and understandings are superseded.</P>
            <P>18.2. <strong className="text-white/80">Severability.</strong> If any provision of these Terms is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect. The invalid provision shall be modified to the minimum extent necessary to make it valid and enforceable while preserving its original intent.</P>
            <P>18.3. <strong className="text-white/80">No Waiver.</strong> No failure or delay by Prediction Market Agents in exercising any right or remedy shall constitute a waiver of that right or remedy. A waiver of any right on one occasion does not constitute a waiver on any subsequent occasion.</P>
            <P>18.4. <strong className="text-white/80">Assignment.</strong> You may not assign, transfer, delegate, or sublicense any of your rights or obligations under these Terms without our prior written consent. Prediction Market Agents may freely assign these Terms and all rights hereunder to any affiliate, successor, or acquirer without notice or consent.</P>
            <P>18.5. <strong className="text-white/80">Third-Party Beneficiaries.</strong> These Terms do not create any third-party beneficiary rights, except that Prediction Market Agents&rsquo;s affiliates, officers, directors, employees, agents, and service providers are intended third-party beneficiaries of the limitation of liability, warranty disclaimer, and indemnification provisions.</P>
            <P>18.6. <strong className="text-white/80">Relationship.</strong> Nothing in these Terms creates a partnership, joint venture, agency, franchise, or employment relationship between the parties.</P>
            <P>18.7. <strong className="text-white/80">Amendments.</strong> We reserve the right to modify these Terms at any time. Material changes will be communicated via email or Platform notification at least 14 days before taking effect. Your continued use of the Platform after the effective date of any change constitutes your acceptance of the modified Terms. If you do not agree to the modified Terms, your sole remedy is to stop using the Platform and close your account.</P>
            <P>18.8. <strong className="text-white/80">Notices.</strong> Notices to Prediction Market Agents shall be sent to hello@example.com. Notices to you shall be sent to the email address on your account or posted on the Platform. Notice is deemed given: (a) if by email, upon sending (whether or not received); (b) if posted on the Platform, upon posting.</P>
            <P>18.9. <strong className="text-white/80">Headings.</strong> Section headings are for reference only and do not affect interpretation.</P>
            <P>18.10. <strong className="text-white/80">Language.</strong> These Terms are drafted in English. In the event of any conflict between the English version and a translation, the English version shall prevail.</P>
            <P>18.11. <strong className="text-white/80">Cumulative Remedies.</strong> All remedies available to Prediction Market Agents under these Terms are cumulative and in addition to any other remedies available at law or in equity.</P>
            <P>18.12. <strong className="text-white/80">Construction.</strong> These Terms shall not be construed against Prediction Market Agents merely because Prediction Market Agents drafted them.</P>
          </section>

          {/* Final acknowledgment */}
          <section id="acknowledgment" className="border-t border-white/[0.06] pt-10">
            <CAPS>BY USING THE AGENT NASH PLATFORM, YOU ACKNOWLEDGE THAT YOU HAVE READ THESE TERMS IN THEIR ENTIRETY, THAT YOU UNDERSTAND THEM, AND THAT YOU AGREE TO BE BOUND BY THEM. IF YOU DO NOT AGREE, DO NOT USE THE PLATFORM.</CAPS>
            <div className="mt-6 text-white/40">
              <p>Prediction Market Agents</p>
              <p><a href="mailto:hello@example.com" className="text-gain hover:underline">hello@example.com</a></p>
              <p>example.com</p>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] px-6 md:px-10 py-6">
        <div className="max-w-[800px] mx-auto flex items-center justify-between">
          <span className="text-[12px] text-white/15">&copy; 2026 Prediction Market Agents</span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="text-[12px] text-white/30 hover:text-white/60 transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
