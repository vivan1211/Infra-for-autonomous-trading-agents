import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/auth";

export const metadata: Metadata = {
  metadataBase: new URL('https://www.example.com'),
  title: {
    default: 'Prediction Market Agents — Build & Deploy AI Trading Agents for Prediction Markets',
    template: '%s — Prediction Market Agents',
  },
  description: 'Build and deploy AI trading agents that analyze Kalshi and Polymarket odds. Multi-agent debates, real-time forecasts, and automated trading. Start free.',
  keywords: ['AI trading', 'prediction markets', 'Kalshi', 'Polymarket', 'AI agents', 'automated trading', 'market forecasting'],
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    siteName: 'Prediction Market Agents',
    type: 'website',
    locale: 'en_US',
    title: 'Prediction Market Agents — Build & Deploy AI Trading Agents',
    description: 'Build and deploy AI trading agents that analyze Kalshi and Polymarket odds. Multi-agent debates, real-time forecasts, and automated trading.',
  },
  twitter: {
    card: 'summary',
    title: 'Prediction Market Agents — AI Trading Agents for Prediction Markets',
    description: 'Build and deploy AI agents that debate prediction market odds on Kalshi & Polymarket.',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.example.com',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark overflow-x-hidden">
      <body className="antialiased bg-bg text-text-primary">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
