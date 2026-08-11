export type ExchangeProvider = "kalshi" | "polymarket";

export interface ExchangeField {
  label: string;
  keyType: string;
  placeholder: string;
  helpText: string;
  helpLink: string;
  permissionsNote: string;
}

export interface ExchangeConfig {
  provider: ExchangeProvider;
  name: string;
  description: string;
  fields: ExchangeField[];
}

export const EXCHANGE_CONFIGS: ExchangeConfig[] = [
  {
    provider: "kalshi",
    name: "Kalshi",
    description: "CFTC-regulated US prediction market",
    fields: [
      {
        label: "API Key",
        keyType: "api_key",
        placeholder: "KXUSER-xxxxxxxx-xxxx",
        helpText: "Generate at kalshi.com under Settings \u2192 API Keys.",
        helpLink: "https://kalshi.com/account/settings",
        permissionsNote: "Requires read + trade permissions. Do not enable withdraw.",
      },
      {
        label: "Private Key",
        keyType: "private_key",
        placeholder: "-----BEGIN EC PRIVATE KEY-----",
        helpText: "The PEM private key downloaded when creating your API key. Cannot be re-downloaded.",
        helpLink: "https://trading-api.readme.io/reference/getting-started",
        permissionsNote: "Used to sign API requests. Encrypted at rest on our servers.",
      },
    ],
  },
  {
    provider: "polymarket",
    name: "Polymarket",
    description: "Crypto prediction market on Polygon",
    fields: [
      {
        label: "Private Key",
        keyType: "private_key",
        placeholder: "0x...",
        helpText: "MetaMask: click the \u22EE menu on your account \u2192 Account details \u2192 Show private key. Starts with 0x.",
        helpLink: "https://support.metamask.io/configure/accounts/how-to-export-an-accounts-private-key",
        permissionsNote: "Signs trade orders. Cannot move funds outside Polymarket.",
      },
      {
        label: "Deposit Address",
        keyType: "funder_address",
        placeholder: "0x...",
        helpText: "Your Polymarket deposit address \u2014 found at polymarket.com/settings under \u2018Deposit Address\u2019.",
        helpLink: "https://polymarket.com/settings?tab=export-private-key",
        permissionsNote: "Identifies your wallet for deposits and balance checks.",
      },
    ],
  },
];
