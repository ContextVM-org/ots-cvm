import { hexToBytes } from 'nostr-tools/utils';
import type { AppConfig } from '../config.ts';
import type { TimestampResult } from '../domain/job.ts';
import { JobRepository } from '../ledger/job-repository.ts';
import { AppLogger } from '../logger.ts';
import { NostrClient } from '../nostr/client.ts';
import { OtsClient } from '../ots/client.ts';

export class TimestampJobService {
  private readonly inflightJobs = new Set<string>();

  public constructor(
    private readonly config: AppConfig,
    private readonly repository: JobRepository,
    private readonly nostrClient: NostrClient,
    private readonly otsClient: OtsClient,
    private readonly logger: AppLogger
  ) {}

  public async requestTimestamp(targetInput: string): Promise<TimestampResult> {
    const resolved = await this.nostrClient.resolveAndFetchTarget(targetInput);
    const existing = this.repository.findByTargetEventId(resolved.eventId);

    if (existing) {
      this.logger.info('Returning existing timestamp record', {
        targetInput,
        targetEventId: resolved.eventId,
        attestationEventId: existing.attestationEventId,
      });

      return {
        status: 'completed',
        targetEventId: existing.targetEventId,
        attestationEventId: existing.attestationEventId,
        message: `Attestation already published for ${existing.targetEventId}`,
      };
    }

    if (this.inflightJobs.has(resolved.eventId)) {
      throw new Error(
        `Timestamp request already in progress for ${resolved.eventId}`
      );
    }

    this.inflightJobs.add(resolved.eventId);

    try {
      this.logger.info('Processing timestamp request', {
        targetInput,
        targetEventId: resolved.eventId,
      });

      const proof = await this.otsClient.stampEventId(resolved.eventId);

      this.logger.info('OpenTimestamps proof created', {
        targetEventId: resolved.eventId,
        otsPath: proof.otsPath,
      });

      const attestationEventId = await this.nostrClient.publishAttestation(
        hexToBytes(this.config.serverPrivateKey),
        resolved,
        proof.otsBase64
      );

      this.repository.create({
        targetInput,
        targetEventId: resolved.eventId,
        targetEventKind: resolved.kind,
        targetEventPubkey: resolved.pubkey,
        sourceRelays: resolved.relays,
        attestationEventId,
      });

      this.logger.info('Timestamp request completed', {
        targetEventId: resolved.eventId,
        attestationEventId,
      });

      return {
        status: 'completed',
        targetEventId: resolved.eventId,
        attestationEventId,
        message: `Attestation published for ${resolved.eventId}`,
      };
    } finally {
      this.inflightJobs.delete(resolved.eventId);
    }
  }
}
