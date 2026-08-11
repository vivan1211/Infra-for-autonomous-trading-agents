import Link from "next/link";
import { TrendingUp, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Privacy Policy",
  description: "How Prediction Market Agents protects your data and API credentials when using AI trading agents on prediction markets.",
};

/* ── shared prose helpers ── */
const H1 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-[18px] font-semibold text-white mb-3">{children}</h2>
);
const H2 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[16px] font-semibold text-white/80 mb-2 mt-4">{children}</h3>
);
const P = ({ children }: { children: React.ReactNode }) => <p className="mb-3">{children}</p>;
const CAPS = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-3 text-white/50 uppercase text-[13px] leading-relaxed font-medium">{children}</p>
);
const UL = ({ children }: { children: React.ReactNode }) => (
  <ul className="list-disc list-outside ml-5 space-y-1.5 mb-3">{children}</ul>
);

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="text-[13px] text-white/30 mt-2">Effective Date: March 30, 2026 &middot; Last Updated: March 30, 2026 &middot; Version 2.0</p>
        <div className="mt-8 h-px bg-white/[0.06]" />

        <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-white/60">
          {/* Intro */}
          <section>
            <P>This Privacy Policy (&ldquo;Policy&rdquo;) describes how Prediction Market Agents (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, processes, stores, shares, transfers, retains, and protects information in connection with the Prediction Market Agents platform (example.com), APIs, and all related services (the &ldquo;Platform&rdquo;). By accessing or using the Platform, you consent to all data practices described in this Policy. If you do not consent, do not use the Platform.</P>
          </section>

          {/* 1. Scope */}
          <section id="scope">
            <H1>1. Scope and Application</H1>
            <P>1.1. This Policy applies to all Users, visitors, and any person who accesses or interacts with the Platform in any manner, regardless of whether they create an account.</P>
            <P>1.2. This Policy applies to data collected through the Platform, email communications, customer support interactions, API integrations, and connected third-party services.</P>
            <P>1.3. This Policy does not apply to third-party websites, exchanges, or services linked to or integrated with the Platform. We encourage you to review the privacy policies of all third-party services you interact with.</P>
            <P>1.4. By using the Platform, you represent that you have the authority to consent to data processing on behalf of any entity you represent.</P>
          </section>

          {/* 2. Information We Collect */}
          <section id="information-collected">
            <H1>2. Information We Collect</H1>

            <H2>2.1. Information You Provide Directly</H2>
            <UL>
              <li>Account registration data: full legal name, email address, username, password (cryptographically hashed and salted)</li>
              <li>Identity verification data: government-issued identification documents, proof of residence, selfie/biometric verification images (if KYC/AML verification is required)</li>
              <li>Professional information: organization name, role, title, jurisdiction of residence, professional background, investor accreditation status</li>
              <li>Payment and billing data: payment method details, billing address, transaction history (full payment card numbers are processed by PCI-compliant third-party payment processors and are not stored by Prediction Market Agents)</li>
              <li>Exchange credentials: API keys, secret keys, access tokens, OAuth tokens, and other authentication credentials for connected third-party exchanges (encrypted at rest using AES-256)</li>
              <li>Strategy and code: trading strategies, algorithms, configurations, parameters, source code, and any other materials you upload, deploy, or transmit through the Platform</li>
              <li>Communications: emails, support tickets, chat messages, feedback, survey responses, feature requests, bug reports, and all other correspondence with Prediction Market Agents</li>
              <li>Voluntary disclosures: any additional personal or professional information you voluntarily share through the Platform or in communications with us</li>
            </UL>

            <H2>2.2. Information Collected Automatically</H2>
            <UL>
              <li>Device information: IP address (IPv4 and IPv6), device type, device identifiers, hardware model, operating system and version, browser type and version, screen resolution, language settings, time zone</li>
              <li>Network information: internet service provider, connection type, network latency, proxy/VPN detection indicators</li>
              <li>Usage data: pages visited, features accessed, buttons clicked, navigation paths, session duration, session frequency, time stamps, referral URLs, exit pages, API endpoints called, request/response payloads (excluding sensitive credentials), rate limit events</li>
              <li>Agent execution data: all data generated by or about Agents running on the Platform, including trade signals, trade decisions, approved/rejected trade logs, position sizes, entry/exit prices, execution timestamps, fill rates, slippage data, P&amp;L calculations (realized and unrealized), cumulative returns, win/loss records, Sharpe ratios, Sortino ratios, maximum drawdown, recovery periods, and all other performance metrics</li>
              <li>Reasoning and AI data: full reasoning chains and traces produced by AI agents, model prompts and completions, debate transcripts between multi-agent systems, confidence scores, probability estimates, research outputs, citation lists (including fabricated citations), model version identifiers, inference latency, token usage, and all other AI/ML operational data</li>
              <li>Risk and governance data: risk parameter configurations, position sizing calculations, Kelly fraction inputs and outputs, exposure levels by market and category, risk limit breach events, override events (including Trader overrides and Risk Manager self-multiplying events), validation layer decisions, halt events</li>
              <li>Error and diagnostic data: server logs, application logs, error reports, crash reports, stack traces, database query logs, queue processing logs, webhook delivery logs, and system health metrics</li>
              <li>Blockchain and on-chain data: wallet addresses associated with connected exchange accounts, on-chain transaction data, smart contract interaction data, and publicly available blockchain data</li>
              <li>Cookie and tracking data: cookies, session tokens, local storage identifiers, pixel tags, web beacons, and similar tracking technologies (see Section 10)</li>
            </UL>

            <H2>2.3. Information from Third Parties</H2>
            <UL>
              <li>Exchange data: trade execution confirmations, order book snapshots, settlement data, account balance data, position data, and market data from connected exchanges (Polymarket, Kalshi, and future integrations)</li>
              <li>Market data providers: real-time and historical price data, volume data, liquidity metrics, and event resolution data from prediction markets and other data sources</li>
              <li>Blockchain analytics: publicly available on-chain transaction data, wallet analytics, whale tracking data, and smart contract event data from providers including Polygonscan, Dune Analytics, and similar services</li>
              <li>AI/LLM providers: model inference metadata, usage statistics, error reports, and operational data from OpenRouter, Anthropic, OpenAI, xAI, Google, DeepSeek, and other AI service providers</li>
              <li>Infrastructure providers: server performance metrics, uptime data, error rates, and operational data from Vercel, Supabase, Railway, and other infrastructure providers</li>
              <li>Identity verification providers: KYC/AML screening results, sanctions list matches, PEP (Politically Exposed Person) screening results, and adverse media screening results</li>
              <li>Analytics services: aggregated web analytics, usage patterns, and performance metrics from analytics providers</li>
              <li>Public sources: publicly available information relevant to your account or trading activity</li>
            </UL>
          </section>

          {/* 3. Legal Bases */}
          <section id="legal-bases">
            <H1>3. Legal Bases for Processing</H1>
            <P>3.1. We process your data on the following legal bases:</P>
            <P><strong className="text-white/80">Contract Performance:</strong> Processing necessary to provide the Platform services you requested, manage your account, execute Agent operations, and fulfill our contractual obligations.</P>
            <P><strong className="text-white/80">Legitimate Interests:</strong> Processing necessary for our legitimate business interests, including: Platform improvement and optimization; security and fraud prevention; Benchmark Data collection and analysis; meta-model development; capital routing optimization; product research and development; business analytics; and enforcement of our Terms. We have balanced these interests against your rights and believe they do not override your fundamental rights and freedoms.</P>
            <P><strong className="text-white/80">Consent:</strong> Processing based on your explicit consent, including marketing communications and optional analytics. You may withdraw consent at any time without affecting the lawfulness of processing prior to withdrawal.</P>
            <P><strong className="text-white/80">Legal Obligation:</strong> Processing necessary to comply with applicable laws, regulations, court orders, subpoenas, and governmental requests, including AML/KYC requirements, tax reporting, and sanctions compliance.</P>
            <P><strong className="text-white/80">Vital Interests:</strong> Processing necessary to protect vital interests of you or another person, in rare emergency circumstances.</P>
          </section>

          {/* 4. How We Use Your Information */}
          <section id="how-we-use">
            <H1>4. How We Use Your Information</H1>
            <P>We use collected information for the following purposes:</P>

            <H2>4.1. Platform Operations</H2>
            <UL>
              <li>Providing, maintaining, operating, and improving all Platform features and services</li>
              <li>Creating, managing, and authenticating your account</li>
              <li>Processing payments and managing billing</li>
              <li>Deploying, executing, monitoring, and governing Agents on your behalf</li>
              <li>Connecting to and communicating with third-party exchanges</li>
              <li>Enforcing risk parameters and executing the AI validation layer</li>
              <li>Displaying performance data, rankings, and analytics in your dashboard</li>
            </UL>

            <H2>4.2. Benchmark Data and Proprietary Dataset Development</H2>
            <UL>
              <li>Generating, collecting, storing, and maintaining the Benchmark Dataset</li>
              <li>Computing performance metrics, rankings, and comparative analytics across all Agents and Strategies</li>
              <li>Training, improving, and developing proprietary meta-models, capital routing algorithms, and strategy selection systems</li>
              <li>Analyzing reasoning quality, identifying failure modes (hallucination, anchoring, override patterns), and improving AI agent reliability</li>
              <li>Creating aggregated and anonymized datasets for research, investor presentations, and public reporting</li>
              <li>Supporting Fund operations by providing audited performance data for capital allocation decisions</li>
              <li>Developing and refining the proprietary benchmark methodology and scoring systems</li>
            </UL>

            <H2>4.3. Security and Integrity</H2>
            <UL>
              <li>Detecting, preventing, and investigating fraud, abuse, market manipulation, unauthorized access, and other security threats</li>
              <li>Monitoring for Terms violations and prohibited conduct</li>
              <li>Maintaining audit trails and forensic capabilities</li>
              <li>Protecting the rights, property, and safety of Prediction Market Agents, our Users, and the public</li>
              <li>Conducting security assessments, penetration testing, and vulnerability analysis</li>
            </UL>

            <H2>4.4. Legal and Compliance</H2>
            <UL>
              <li>Complying with applicable laws, regulations, legal processes, and governmental requests</li>
              <li>Conducting KYC/AML verification and sanctions screening</li>
              <li>Fulfilling tax reporting and withholding obligations</li>
              <li>Establishing, exercising, or defending legal claims</li>
              <li>Responding to law enforcement requests and regulatory inquiries</li>
            </UL>

            <H2>4.5. Communications</H2>
            <UL>
              <li>Sending transactional messages (account verification, trade confirmations, risk alerts, security notices)</li>
              <li>Sending service communications (Platform updates, maintenance notices, policy changes, feature announcements)</li>
              <li>Sending Agent performance reports and benchmark notifications</li>
              <li>Sending marketing and promotional communications (with consent, and with opt-out available)</li>
            </UL>

            <H2>4.6. Research and Development</H2>
            <UL>
              <li>Conducting internal research to improve AI agent performance, reliability, and safety</li>
              <li>Developing new features, tools, and services</li>
              <li>Analyzing user behavior and Platform usage patterns to improve user experience</li>
              <li>Benchmarking Platform performance and infrastructure optimization</li>
            </UL>
          </section>

          {/* 5. Benchmark Data */}
          <section id="benchmark-data">
            <H1>5. Benchmark Data &mdash; Special Provisions</H1>
            <CAPS>5.1. CORE ASSET. THE BENCHMARK DATASET IS THE CORE PROPRIETARY ASSET OF AGENT NASH AND CONSTITUTES TRADE SECRET AND CONFIDENTIAL INFORMATION. The Benchmark Dataset comprises longitudinal behavioral data including reasoning traces, confidence calibration data, strategy drift analytics, execution quality metrics, risk management event logs, and all derived models and insights. This dataset is uniquely valuable because it can only be generated through live operation and cannot be replicated through backtesting.</CAPS>
            <P>5.2. <strong className="text-white/80">Ownership and License.</strong> All Benchmark Data is the sole and exclusive property of Prediction Market Agents. By using the Platform, you irrevocably assign to Prediction Market Agents all right, title, and interest in Benchmark Data generated through your activity. Where assignment is not effective, you grant Prediction Market Agents a perpetual, irrevocable, worldwide, royalty-free, exclusive, transferable, sublicensable license to use, reproduce, modify, distribute, commercialize, and exploit all Benchmark Data for any purpose (see Terms and Conditions Section 6.2).</P>
            <P>5.3. <strong className="text-white/80">Uses of Benchmark Data.</strong> Benchmark Data is used to:</P>
            <UL>
              <li>Evaluate, rank, and compare Agent and Strategy performance across markets and timeframes</li>
              <li>Train and improve proprietary meta-models and capital routing algorithms</li>
              <li>Identify and analyze AI reasoning failure modes (hallucination, fabrication, anchoring, override cascades)</li>
              <li>Generate anonymized and aggregated performance reports for investors, research partners, and the public</li>
              <li>Support Fund capital allocation and risk management decisions</li>
              <li>Develop academic and industry research on AI trading agent behavior</li>
              <li>Improve Platform infrastructure, benchmarking methodologies, and scoring algorithms</li>
            </UL>
            <CAPS>5.4. PERPETUAL RETENTION. BENCHMARK DATA IS RETAINED INDEFINITELY. This is fundamental to the integrity and longitudinal value of the dataset. Upon account termination, your Benchmark Data will be anonymized (personal identifiers removed) but the underlying behavioral, performance, and reasoning data will not be deleted. This retention is necessary for: dataset continuity; ongoing model training; historical comparability; regulatory compliance; and the proper functioning of meta-models that depend on longitudinal data.</CAPS>
            <P>5.5. <strong className="text-white/80">No Individual Identification in Public Outputs.</strong> Individual Users and Strategies are not identified by name in public-facing Benchmark Data reports unless you provide explicit written consent. However, anonymized strategy profiles, performance patterns, and behavioral characteristics may be published.</P>
            <P>5.6. <strong className="text-white/80">Benchmark Data is Not Subject to Deletion Requests.</strong> Due to its anonymized, aggregated nature and its essential role in Platform operations, Benchmark Data falls outside the scope of individual data deletion rights (see Section 9.3).</P>
          </section>

          {/* 6. Data Sharing */}
          <section id="data-sharing">
            <H1>6. Data Sharing and Disclosure</H1>
            <P>We may share your information in the following circumstances:</P>
            <P><strong className="text-white/80">6.1. Service Providers and Processors:</strong> We share data with third-party service providers who process data on our behalf, including: cloud hosting and infrastructure providers (Vercel, Supabase, Railway, and their sub-processors); payment processors; email delivery services; analytics providers; identity verification providers; AI/LLM inference providers (OpenRouter, Anthropic, OpenAI, xAI, Google, DeepSeek); customer support tools; and monitoring services. These providers are bound by data processing agreements and may only use your data for the purposes we specify.</P>
            <P><strong className="text-white/80">6.2. Exchange Partners:</strong> When you connect exchange accounts, necessary data (API credentials, trade instructions, and related metadata) is transmitted to and from those exchanges. We do not control how exchanges process your data after transmission.</P>
            <P><strong className="text-white/80">6.3. Fund Operations:</strong> If you participate in the Fund, your performance data, identity information, investor qualification data, and related information may be shared with Fund administrators, auditors, legal counsel, tax advisers, regulatory authorities, and potential or existing limited partners (LPs), as required for Fund operations.</P>
            <P><strong className="text-white/80">6.4. Legal and Regulatory:</strong> We may disclose information: (a) when required by law, subpoena, court order, arbitral order, or governmental request; (b) when we believe disclosure is necessary to comply with applicable law or regulation; (c) to protect the rights, property, or safety of Prediction Market Agents, our Users, or the public; (d) to detect, prevent, or address fraud, security, or technical issues; (e) in connection with legal proceedings or regulatory investigations.</P>
            <P><strong className="text-white/80">6.5. Law Enforcement:</strong> We may disclose information to law enforcement authorities if we have a good faith belief that such disclosure is required or permitted by law, or if we reasonably believe that a User&rsquo;s activity may constitute a criminal offense.</P>
            <P><strong className="text-white/80">6.6. Business Transfers:</strong> In the event of a merger, acquisition, reorganization, bankruptcy, receivership, dissolution, sale of all or substantially all assets, or similar corporate transaction, your information may be transferred as part of that transaction. We will use reasonable efforts to notify you of such transfer, but you acknowledge that notification may not always be possible.</P>
            <P><strong className="text-white/80">6.7. Professional Advisers:</strong> We may share information with our lawyers, accountants, auditors, bankers, insurers, and other professional advisers on a confidential basis.</P>
            <P><strong className="text-white/80">6.8. Affiliates:</strong> We may share information with our current and future parent companies, subsidiaries, and affiliates for the purposes described in this Policy.</P>
            <P><strong className="text-white/80">6.9. Research Partners:</strong> We may share anonymized and aggregated Benchmark Data with academic researchers, industry analysts, and research partners for the purpose of advancing AI trading research. Individual Users are not identified in such sharing.</P>
            <P><strong className="text-white/80">6.10. Aggregated and De-identified Data:</strong> We may share aggregated or de-identified data that cannot reasonably be used to identify you for any purpose whatsoever, including commercial, research, marketing, investor relations, and public reporting purposes, without restriction.</P>
            <P><strong className="text-white/80">6.11. With Your Consent:</strong> We may share your information for purposes not described in this Policy with your explicit consent.</P>
          </section>

          {/* 7. International Transfers */}
          <section id="international-transfers">
            <H1>7. International Data Transfers</H1>
            <P>7.1. Prediction Market Agents operates globally. Your data may be processed in jurisdictions other than your country of residence, including the United Arab Emirates (where Prediction Market Agents is based), the United States (where primary infrastructure providers are hosted), and any other jurisdiction where our service providers or affiliates operate.</P>
            <P>7.2. These jurisdictions may have data protection laws that differ from, and may be less protective than, the laws of your home jurisdiction.</P>
            <P>7.3. Where required by applicable law (including the GDPR), we implement appropriate safeguards for international data transfers, including: Standard Contractual Clauses (SCCs); adequacy decisions by relevant authorities; Binding Corporate Rules; or other approved transfer mechanisms.</P>
            <P>7.4. By using the Platform, you explicitly consent to the transfer and processing of your data in jurisdictions outside your country of residence, including jurisdictions that may not provide equivalent data protection.</P>
          </section>

          {/* 8. Data Retention */}
          <section id="data-retention">
            <H1>8. Data Retention</H1>
            <P>8.1. We retain your data for the periods described below, or for longer periods where required by law, regulation, or legitimate business need:</P>
            <UL>
              <li>Account data (name, email, profile): Duration of account plus 7 years after termination (legal, tax, and audit requirements)</li>
              <li>Benchmark Data (performance, reasoning traces, execution logs): INDEFINITELY (see Section 5.4)</li>
              <li>Payment and billing records: 7 years after the relevant transaction (tax and audit requirements)</li>
              <li>Exchange API keys and credentials: Deleted within 30 days of account termination or exchange disconnection</li>
              <li>Usage logs, analytics, and diagnostic data: Up to 36 months</li>
              <li>Communication records (emails, support tickets): Up to 7 years</li>
              <li>Identity verification documents (KYC): Duration of account plus 6 years after termination (AML requirements)</li>
              <li>Marketing consent records: Duration of account plus 3 years after withdrawal of consent</li>
              <li>Cookie and tracking data: See Section 10</li>
              <li>Server and application logs: Up to 24 months</li>
            </UL>
            <P>8.2. After the applicable retention period, data is either deleted or irreversibly anonymized.</P>
            <P>8.3. We may retain data beyond the stated periods if: (a) required by law or regulation; (b) necessary for ongoing legal proceedings or investigations; (c) necessary to enforce our Terms; or (d) necessary to protect our legitimate interests.</P>
          </section>

          {/* 9. Your Rights */}
          <section id="your-rights">
            <H1>9. Your Rights and Choices</H1>
            <P>9.1. Subject to applicable law and the limitations described below, you may have the following rights:</P>
            <UL>
              <li><strong className="text-white/80">Right of Access:</strong> Request a copy of the personal data we hold about you</li>
              <li><strong className="text-white/80">Right of Rectification:</strong> Request correction of inaccurate or incomplete personal data</li>
              <li><strong className="text-white/80">Right of Erasure (&ldquo;Right to be Forgotten&rdquo;):</strong> Request deletion of your personal data, subject to legal retention requirements and the Benchmark Data exceptions in Sections 5.4 and 5.6</li>
              <li><strong className="text-white/80">Right to Data Portability:</strong> Request your personal data in a structured, commonly used, machine-readable format</li>
              <li><strong className="text-white/80">Right to Object:</strong> Object to processing based on legitimate interests, including profiling</li>
              <li><strong className="text-white/80">Right to Restrict Processing:</strong> Request restriction of processing in certain circumstances</li>
              <li><strong className="text-white/80">Right to Withdraw Consent:</strong> Withdraw consent at any time where processing is based on consent, without affecting the lawfulness of prior processing</li>
              <li><strong className="text-white/80">Right to Non-Discrimination:</strong> We will not discriminate against you for exercising your privacy rights</li>
              <li><strong className="text-white/80">Right to Lodge a Complaint:</strong> File a complaint with your local data protection authority</li>
            </UL>
            <P>9.2. <strong className="text-white/80">Exercising Your Rights.</strong> To exercise any right, contact us at <a href="mailto:hello@example.com" className="text-gain hover:underline">hello@example.com</a> with sufficient information to verify your identity and specify your request. We will respond within 30 days (or as required by applicable law). We may charge a reasonable fee for manifestly unfounded or excessive requests.</P>
            <CAPS>9.3. LIMITATIONS ON RIGHTS. Your rights are subject to the following limitations:</CAPS>
            <UL>
              <li>Benchmark Data is not subject to deletion, portability, or restriction requests due to its anonymized, aggregated nature and its essential role in Platform operations and meta-model training (see Section 5.4 and 5.6)</li>
              <li>Data required for legal compliance (AML/KYC records, tax records, audit trails) cannot be deleted during mandatory retention periods</li>
              <li>Data necessary for the establishment, exercise, or defense of legal claims may be retained regardless of deletion requests</li>
              <li>Anonymized or aggregated data that can no longer identify you is outside the scope of individual data rights</li>
              <li>We may decline requests that are manifestly unfounded, excessive, or that would require disproportionate effort</li>
            </UL>
          </section>

          {/* 10. Cookies */}
          <section id="cookies">
            <H1>10. Cookies and Tracking Technologies</H1>
            <P>10.1. We use the following tracking technologies:</P>
            <P><strong className="text-white/80">Essential Cookies:</strong> Required for Platform operation, including session management, authentication, security tokens, and load balancing. These cannot be disabled without breaking core functionality.</P>
            <P><strong className="text-white/80">Functional Cookies:</strong> Remember your preferences, settings, and configurations to enhance your experience.</P>
            <P><strong className="text-white/80">Analytics Cookies:</strong> Collect aggregated data about Platform usage to help us understand how Users interact with the Platform and identify areas for improvement. We use Vercel Analytics and similar services.</P>
            <P><strong className="text-white/80">Performance Cookies:</strong> Monitor Platform performance, error rates, and infrastructure health.</P>
            <P>10.2. We do NOT use third-party advertising cookies or engage in cross-site behavioral advertising tracking.</P>
            <P>10.3. You may manage non-essential cookies through your browser settings. Disabling cookies may affect Platform functionality.</P>
            <P>10.4. <strong className="text-white/80">Do Not Track (DNT):</strong> We do not currently respond to browser DNT signals. This may change in the future.</P>
          </section>

          {/* 11. Data Security */}
          <section id="data-security">
            <H1>11. Data Security</H1>
            <P>11.1. We implement commercially reasonable technical and organizational security measures, including:</P>
            <UL>
              <li>Encryption of data in transit using TLS 1.2 or higher</li>
              <li>Encryption of sensitive data at rest using AES-256 (including exchange API keys and credentials)</li>
              <li>Cryptographic hashing and salting of passwords (bcrypt or equivalent)</li>
              <li>Role-based access controls and principle of least privilege for internal systems</li>
              <li>Network segmentation and firewall protection</li>
              <li>Regular security assessments, penetration testing, and vulnerability scanning</li>
              <li>Automated monitoring, alerting, and intrusion detection systems</li>
              <li>Incident response procedures and breach notification processes</li>
              <li>Secure software development lifecycle practices</li>
              <li>Employee security training and background checks</li>
              <li>Data backup and disaster recovery procedures</li>
            </UL>
            <CAPS>11.2. DESPITE THESE MEASURES, NO SYSTEM IS COMPLETELY SECURE. WE CANNOT AND DO NOT GUARANTEE THE ABSOLUTE SECURITY OF YOUR DATA. YOU ACKNOWLEDGE THAT: (A) DATA BREACHES CAN OCCUR; (B) ENCRYPTION CAN BE COMPROMISED; (C) UNAUTHORIZED ACCESS MAY OCCUR DESPITE REASONABLE PRECAUTIONS; (D) DATA MAY BE LOST, CORRUPTED, OR DESTROYED; (E) AGENT NASH SHALL NOT BE LIABLE FOR ANY LOSSES ARISING FROM SECURITY INCIDENTS, DATA BREACHES, OR UNAUTHORIZED ACCESS TO YOUR DATA, REGARDLESS OF THE CAUSE, INCLUDING AGENT NASH&rsquo;S OWN NEGLIGENCE, EXCEPT TO THE EXTENT PROHIBITED BY APPLICABLE LAW.</CAPS>
            <P>11.3. You are responsible for: (a) maintaining the security of your own devices, accounts, and credentials; (b) using strong, unique passwords; (c) enabling multi-factor authentication when available; (d) not sharing credentials; (e) monitoring your account for unauthorized activity; (f) promptly reporting security incidents to us.</P>
          </section>

          {/* 12. Children */}
          <section id="children">
            <H1>12. Children&rsquo;s Privacy</H1>
            <P>The Platform is not intended for, marketed to, or designed for use by individuals under 18 years of age (or the age of majority in their jurisdiction). We do not knowingly collect personal data from minors. If we learn that we have collected data from a minor, we will take steps to delete it promptly. If you believe a minor has provided us with personal data, contact us at <a href="mailto:hello@example.com" className="text-gain hover:underline">hello@example.com</a>.</P>
          </section>

          {/* 13. Automated Decision-Making */}
          <section id="automated-decisions">
            <H1>13. Automated Decision-Making and Profiling</H1>
            <P>13.1. The Platform uses automated systems, including AI models and algorithms, to:</P>
            <UL>
              <li>Generate trade signals and execute trading decisions through Agents</li>
              <li>Validate trade decisions against risk parameters via the AI validation layer</li>
              <li>Benchmark, rank, and score Agent and Strategy performance</li>
              <li>Route capital through the meta-strategy layer</li>
              <li>Detect fraud, abuse, and suspicious activity</li>
              <li>Make account risk assessments</li>
            </UL>
            <P>13.2. These automated decisions may have significant effects on your account and trading activity. You acknowledge and consent to such automated processing.</P>
            <P>13.3. Where required by applicable law (e.g., GDPR Article 22), you may have the right to request human review of automated decisions that significantly affect you. To request human review, contact <a href="mailto:hello@example.com" className="text-gain hover:underline">hello@example.com</a>.</P>
          </section>

          {/* 14. AI-Specific Disclosures */}
          <section id="ai-disclosures">
            <H1>14. AI-Specific Data Disclosures</H1>
            <P>14.1. <strong className="text-white/80">LLM Provider Data Sharing.</strong> When Agents execute on the Platform, prompts, market data, and contextual information are sent to third-party LLM providers (including Anthropic, OpenAI, xAI, Google, DeepSeek, and providers accessed through OpenRouter) for inference. These providers may process this data according to their own privacy policies and data retention practices. We use commercially available API agreements, but we cannot guarantee how LLM providers process or retain inference data.</P>
            <P>14.2. <strong className="text-white/80">Model Training Disclosure.</strong> Some LLM providers may use API data for model training unless opted out. Prediction Market Agents uses reasonable efforts to opt out of provider training programs where available, but cannot guarantee that all providers comply. You accept this risk.</P>
            <P>14.3. <strong className="text-white/80">AI Output Retention.</strong> All AI model outputs, including reasoning traces, confidence scores, research outputs, and trade decisions, are permanently logged as part of the Benchmark Dataset.</P>
            <P>14.4. <strong className="text-white/80">AI Hallucination Data.</strong> The Platform&rsquo;s AI agents may produce fabricated data, including false statistics, non-existent citations, and incorrect reasoning. Such fabricated outputs are still collected and retained as Benchmark Data, as they are valuable for understanding and improving AI reliability.</P>
          </section>

          {/* 15. Third-Party Links */}
          <section id="third-party-links">
            <H1>15. Third-Party Links and Services</H1>
            <P>The Platform may contain links to, or integrations with, third-party websites, exchanges, APIs, and services. We are not responsible for the privacy practices, security measures, or content of any third party. We encourage you to review the privacy policies of all third-party services before providing them with any data or credentials.</P>
          </section>

          {/* 16. Jurisdiction-Specific */}
          <section id="jurisdiction">
            <H1>16. Jurisdiction-Specific Provisions</H1>

            <H2>16.1. European Economic Area (EEA) and United Kingdom</H2>
            <UL>
              <li>Our legal bases for processing are detailed in Section 3</li>
              <li>You have the rights described in Section 9, plus the right to lodge a complaint with your local supervisory authority</li>
              <li>International data transfers are safeguarded as described in Section 7</li>
              <li>For GDPR-specific inquiries, contact our Data Protection Officer at <a href="mailto:hello@example.com" className="text-gain hover:underline">hello@example.com</a></li>
              <li>We conduct Data Protection Impact Assessments (DPIAs) for high-risk processing activities</li>
            </UL>

            <H2>16.2. California Residents (CCPA/CPRA)</H2>
            <UL>
              <li>Categories of personal information collected: identifiers, professional information, financial information, internet/network activity, geolocation, inferences, and sensitive personal information</li>
              <li>We do not &ldquo;sell&rdquo; or &ldquo;share&rdquo; personal information as defined under the CCPA/CPRA</li>
              <li>You have the right to know, delete, correct, and opt out of the sale/sharing of personal information</li>
              <li>You have the right to limit the use of sensitive personal information</li>
              <li>We will not discriminate against you for exercising CCPA/CPRA rights</li>
              <li>To submit a request: email <a href="mailto:hello@example.com" className="text-gain hover:underline">hello@example.com</a> or use the designated mechanisms on the Platform</li>
              <li>Authorized agents may submit requests on your behalf with proper documentation</li>
            </UL>

            <H2>16.3. United Arab Emirates and DIFC</H2>
            <UL>
              <li>Data processing is governed by the DIFC Data Protection Law (Law No. 5 of 2020) where applicable</li>
              <li>You have rights of access, rectification, erasure, restriction, portability, and objection under applicable DIFC regulations</li>
              <li>The Commissioner of Data Protection (DIFC) is the relevant supervisory authority</li>
            </UL>

            <H2>16.4. Other Jurisdictions</H2>
            <P>If you are located in a jurisdiction with specific data protection laws not addressed above (e.g., Brazil LGPD, Canada PIPEDA, Australia Privacy Act, Singapore PDPA, South Korea PIPA, Japan APPI), please contact us to discuss your specific rights. We will make commercially reasonable efforts to comply with applicable local requirements.</P>
          </section>

          {/* 17. Data Breach */}
          <section id="data-breach">
            <H1>17. Data Breach Notification</H1>
            <P>17.1. In the event of a personal data breach that is likely to result in a risk to your rights and freedoms, we will:</P>
            <UL>
              <li>Notify the relevant supervisory authority within 72 hours of becoming aware (where required by applicable law)</li>
              <li>Notify affected individuals without undue delay where the breach is likely to result in a high risk to their rights and freedoms</li>
              <li>Document the breach, its effects, and remedial actions taken</li>
            </UL>
            <P>17.2. Breach notification will be provided via email to the address on your account, or by posting a notice on the Platform if email is not feasible. We may also provide notice through other reasonable channels.</P>
            <CAPS>17.3. NOTWITHSTANDING OUR COMMITMENT TO BREACH NOTIFICATION, AGENT NASH&rsquo;S LIABILITY FOR DATA BREACHES IS LIMITED AS SET FORTH IN THE TERMS AND CONDITIONS (SECTION 11). BREACH NOTIFICATION DOES NOT CONSTITUTE AN ADMISSION OF LIABILITY.</CAPS>
          </section>

          {/* 18. Changes */}
          <section id="changes">
            <H1>18. Changes to This Privacy Policy</H1>
            <P>18.1. We may update this Policy from time to time. Material changes will be communicated via email or Platform notification at least 14 days before taking effect.</P>
            <P>18.2. The &ldquo;Last Updated&rdquo; date at the top indicates when this Policy was last revised.</P>
            <P>18.3. Continued use of the Platform after changes take effect constitutes acceptance. If you do not agree to any changes, your sole remedy is to stop using the Platform and close your account.</P>
            <P>18.4. We maintain an archive of prior versions of this Policy available upon request.</P>
          </section>

          {/* 19. Contact */}
          <section id="contact">
            <H1>19. Contact Information</H1>
            <P>For questions, concerns, complaints, or requests regarding this Privacy Policy or our data practices:</P>
            <div className="text-white/40 space-y-1">
              <p>Prediction Market Agents</p>
              <p>Data Protection Contact: <a href="mailto:hello@example.com" className="text-gain hover:underline">hello@example.com</a></p>
              <p>Website: example.com</p>
            </div>
            <p className="mb-3 mt-3">For urgent security matters (data breaches, credential compromise): Include &ldquo;URGENT: SECURITY&rdquo; in your email subject line.</p>
          </section>

          {/* Final acknowledgment */}
          <section id="acknowledgment" className="border-t border-white/[0.06] pt-10">
            <CAPS>BY USING THE AGENT NASH PLATFORM, YOU ACKNOWLEDGE THAT YOU HAVE READ THIS PRIVACY POLICY IN ITS ENTIRETY, THAT YOU UNDERSTAND OUR DATA PRACTICES, AND THAT YOU CONSENT TO THE COLLECTION, USE, PROCESSING, STORAGE, SHARING, AND RETENTION OF YOUR INFORMATION AS DESCRIBED HEREIN.</CAPS>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] px-6 md:px-10 py-6">
        <div className="max-w-[800px] mx-auto flex items-center justify-between">
          <span className="text-[12px] text-white/15">&copy; 2026 Prediction Market Agents</span>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="text-[12px] text-white/30 hover:text-white/60 transition-colors">Terms &amp; Conditions</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
