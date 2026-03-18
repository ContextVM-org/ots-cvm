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
const DEFAULT_OTS_PROOF_TTL_DAYS = 30;
const DEFAULT_OTS_VERIFY_CACHE_TTL_DAYS = 3;
const DEFAULT_CLEANUP_INTERVAL_MINUTES = 1440;

function readList(value: string | undefined, fallback: string[]): string[] {
  return (value ?? fallback.join(','))
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface AppConfig {
  serverPrivateKey: string;
  relayUrls: string[];
  attestationRelayUrls: string[];
  isPublicServer: boolean;
  sqlitePath: string;
  otsDataDir: string;
  otsProofTtlDays: number;
  otsPythonBin: string;
  otsVerifyCacheDir: string;
  otsVerifyCacheTtlDays: number;
  cleanupIntervalMinutes: number;
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
    isPublicServer: process.env.IS_PUBLIC_SERVER === 'true',
    sqlitePath: process.env.SQLITE_PATH ?? 'data/ots-contextvm.sqlite',
    otsDataDir: process.env.OTS_DATA_DIR ?? 'data/ots',
    otsProofTtlDays: readPositiveInt(
      process.env.OTS_PROOF_TTL_DAYS,
      DEFAULT_OTS_PROOF_TTL_DAYS
    ),
    otsPythonBin: process.env.OTS_PYTHON_BIN || 'python3',
    otsVerifyCacheDir:
      process.env.OTS_VERIFY_CACHE_DIR ?? '/tmp/ots-cvm-verify-cache',
    otsVerifyCacheTtlDays: readPositiveInt(
      process.env.OTS_VERIFY_CACHE_TTL_DAYS,
      DEFAULT_OTS_VERIFY_CACHE_TTL_DAYS
    ),
    cleanupIntervalMinutes: readPositiveInt(
      process.env.CLEANUP_INTERVAL_MINUTES,
      DEFAULT_CLEANUP_INTERVAL_MINUTES
    ),
    otsCalendarUrls: readList(process.env.OTS_CALENDARS, DEFAULT_OTS_CALENDARS),
    bitcoinApiUrl:
      process.env.BITCOIN_API_URL ?? 'https://public-btc.nownodes.io',
    logLevel: process.env.LOG_LEVEL === 'debug' ? 'debug' : 'info',
  };
}
