import { generateSecretKey } from 'nostr-tools';
import { bytesToHex } from 'nostr-tools/utils';

const DEFAULT_RELAYS = ['wss://relay.contextvm.org'];
export const DEFAULT_BOOTSTRAP_RELAY_URLS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.snort.social/',
  'wss://nostr.mom/',
  'wss://nostr.oxtr.dev/',
] as const;
const DEFAULT_OTS_CALENDARS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
  'https://ots.btc.catallaxy.com',
];

function readList(value: string | undefined, fallback: string[]): string[] {
  return (value ?? fallback.join(','))
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export interface AppConfig {
  serverPrivateKey: string;
  relayUrls: string[];
  attestationRelayUrls: string[];
  sqlitePath: string;
  otsDataDir: string;
  otsPythonBin: string;
  otsVerifyCacheDir: string;
  otsCalendarUrls: string[];
  bitcoinApiUrl: string;
  logLevel: 'debug' | 'info';
}

export function getConfig(): AppConfig {
  const serverPrivateKey = process.env.SERVER_PRIVATE_KEY;

  if (!serverPrivateKey) {
    console.error(
      'Missing SERVER_PRIVATE_KEY environment variable, generating a new one...'
    );
  }

  return {
    serverPrivateKey: serverPrivateKey ?? bytesToHex(generateSecretKey()),
    relayUrls: readList(process.env.RELAYS, DEFAULT_RELAYS),
    attestationRelayUrls: readList(process.env.ATTESTATION_RELAYS, [
      ...DEFAULT_BOOTSTRAP_RELAY_URLS,
    ]),
    sqlitePath: process.env.SQLITE_PATH ?? 'data/ots-contextvm.sqlite',
    otsDataDir: process.env.OTS_DATA_DIR ?? 'data/ots',
    otsPythonBin: process.env.OTS_PYTHON_BIN || 'python3',
    otsVerifyCacheDir:
      process.env.OTS_VERIFY_CACHE_DIR ?? '/tmp/ots-cvm-verify-cache',
    otsCalendarUrls: readList(process.env.OTS_CALENDARS, DEFAULT_OTS_CALENDARS),
    bitcoinApiUrl:
      process.env.BITCOIN_API_URL ?? 'https://public-btc.nownodes.io',
    logLevel: process.env.LOG_LEVEL === 'debug' ? 'debug' : 'info',
  };
}
