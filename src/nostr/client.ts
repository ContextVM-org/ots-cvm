import type { ResolvedTargetEvent } from '../domain/job.ts';
import {
  finalizeEvent,
  kinds,
  nip19,
  SimplePool,
  type NostrEvent,
} from 'nostr-tools';
import { AppLogger } from '../logger.ts';
import { isHex } from './utils.ts';

interface ResolveResult {
  eventId?: string;
  relays: string[];
  author?: string;
  kind?: number;
  identifier?: string;
}

export class NostrClient {
  private readonly pool = new SimplePool({
    enablePing: true,
    enableReconnect: true,
  });

  public constructor(
    private readonly defaultRelays: string[],
    private readonly attestationRelayUrls: string[],
    private readonly logger: AppLogger
  ) {}

  public async resolveAndFetchTarget(
    input: string
  ): Promise<ResolvedTargetEvent> {
    const resolved = this.resolveInput(input);

    let event: NostrEvent | null = null;
    if (resolved.eventId) {
      event = (await this.pool.get(resolved.relays, {
        ids: [resolved.eventId],
      })) as NostrEvent | null;
    } else if (
      resolved.author &&
      typeof resolved.kind === 'number' &&
      resolved.identifier !== undefined
    ) {
      event = (await this.pool.get(resolved.relays, {
        authors: [resolved.author],
        kinds: [resolved.kind],
        '#d': [resolved.identifier],
      })) as NostrEvent | null;
    }

    if (!event) {
      throw new Error(`Unable to resolve target event for input: ${input}`);
    }

    return {
      eventId: event.id,
      kind: event.kind,
      pubkey: event.pubkey,
      relays: resolved.relays,
      event,
    };
  }

  public async publishAttestation(
    secretKey: Uint8Array,
    target: ResolvedTargetEvent,
    otsBase64: string
  ): Promise<string> {
    const publishRelays = [
      ...new Set([
        ...this.attestationRelayUrls,
        ...target.relays,
        ...this.defaultRelays,
      ]),
    ];

    const signedEvent = finalizeEvent(
      {
        kind: kinds.OpenTimestamps,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['e', target.eventId, target.relays[0] ?? ''],
          ['k', String(target.kind)],
        ],
        content: otsBase64,
      },
      secretKey
    );

    this.logger.info('Publishing NIP-03 attestation', {
      targetEventId: target.eventId,
      attestationEventId: signedEvent.id,
      publishRelays,
      relayHint: target.relays[0] ?? null,
      configuredAttestationRelays: this.attestationRelayUrls,
      targetRelays: target.relays,
    });

    await Promise.any(this.pool.publish(publishRelays, signedEvent));

    this.logger.info('Published NIP-03 attestation', {
      targetEventId: target.eventId,
      attestationEventId: signedEvent.id,
      publishRelays,
    });

    return signedEvent.id;
  }

  public async fetchAttestationProofBase64(
    target: ResolvedTargetEvent
  ): Promise<string | null> {
    const lookupRelays = [
      ...new Set([
        ...target.relays,
        ...this.attestationRelayUrls,
        ...this.defaultRelays,
      ]),
    ];

    const events = (await this.pool.querySync(lookupRelays, {
      kinds: [kinds.OpenTimestamps],
      '#e': [target.eventId],
      limit: 10,
    })) as NostrEvent[];

    const attestation =
      events
        .slice()
        .sort((left, right) => right.created_at - left.created_at)[0] ?? null;

    if (!attestation) {
      this.logger.info('No NIP-03 attestation found for target event', {
        targetEventId: target.eventId,
        lookupRelays,
      });
      return null;
    }

    this.logger.info('Fetched NIP-03 attestation for target event', {
      targetEventId: target.eventId,
      attestationEventId: attestation.id,
      lookupRelays,
    });

    return attestation.content;
  }

  private resolveInput(input: string): ResolveResult {
    const normalized = input.trim();
    if (isHex(normalized)) {
      return {
        eventId: normalized.toLowerCase(),
        relays: [...this.defaultRelays],
      };
    }

    const decoded = nip19.decode(normalized);
    if (decoded.type === 'nevent') {
      return {
        eventId: decoded.data.id,
        relays: decoded.data.relays?.length
          ? decoded.data.relays
          : [...this.defaultRelays],
        author: decoded.data.author,
        kind: decoded.data.kind,
      };
    }

    if (decoded.type === 'note') {
      return { eventId: decoded.data, relays: [...this.defaultRelays] };
    }

    if (decoded.type === 'naddr') {
      return {
        relays: decoded.data.relays?.length
          ? decoded.data.relays
          : [...this.defaultRelays],
        author: decoded.data.pubkey,
        kind: decoded.data.kind,
        identifier: decoded.data.identifier,
      };
    }

    throw new Error(`Unsupported Nostr reference type: ${decoded.type}`);
  }
}
