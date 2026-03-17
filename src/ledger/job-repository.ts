import type { Database } from 'bun:sqlite';
import type { TimestampRecord } from '../domain/job.ts';

interface JobRow {
  id: number;
  target_input: string;
  target_event_id: string;
  target_event_kind: number | null;
  target_event_pubkey: string | null;
  source_relays_json: string;
  attestation_event_id: string;
  created_at: string;
  updated_at: string;
}

function pickDefined<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

export interface CreateJobInput {
  targetInput: string;
  targetEventId: string;
  targetEventKind: number | null;
  targetEventPubkey: string | null;
  sourceRelays: string[];
  attestationEventId: string;
}

export interface UpdateTimestampRecordInput {
  targetEventKind?: number | null;
  targetEventPubkey?: string | null;
  sourceRelays?: string[];
  attestationEventId?: string;
}

function mapRow(row: JobRow | null): TimestampRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    targetInput: row.target_input,
    targetEventId: row.target_event_id,
    targetEventKind: row.target_event_kind,
    targetEventPubkey: row.target_event_pubkey,
    sourceRelays: JSON.parse(row.source_relays_json) as string[],
    attestationEventId: row.attestation_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class JobRepository {
  public constructor(private readonly database: Database) {}

  public findByTargetEventId(targetEventId: string): TimestampRecord | null {
    const statement = this.database.query<JobRow, [string]>(`
      SELECT *
      FROM timestamp_jobs
      WHERE target_event_id = ?1
      LIMIT 1
    `);

    return mapRow(statement.get(targetEventId) ?? null);
  }

  public create(input: CreateJobInput): TimestampRecord {
    const timestamp = new Date().toISOString();

    this.database
      .query(
        `
          INSERT INTO timestamp_jobs (
            target_input,
            target_event_id,
            target_event_kind,
            target_event_pubkey,
            source_relays_json,
            attestation_event_id,
            created_at,
            updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        `
      )
      .run(
        input.targetInput,
        input.targetEventId,
        input.targetEventKind,
        input.targetEventPubkey,
        JSON.stringify(input.sourceRelays),
        input.attestationEventId,
        timestamp,
        timestamp
      );

    const job = this.findByTargetEventId(input.targetEventId);
    if (!job) {
      throw new Error(`Failed to create job for event ${input.targetEventId}`);
    }

    return job;
  }

  public updateByTargetEventId(
    targetEventId: string,
    input: UpdateTimestampRecordInput
  ): TimestampRecord {
    const current = this.findByTargetEventId(targetEventId);
    if (!current) {
      throw new Error(`Job not found for event ${targetEventId}`);
    }

    const nextUpdatedAt = new Date().toISOString();

    this.database
      .query(
        `
          UPDATE timestamp_jobs
          SET
            target_event_kind = ?2,
            target_event_pubkey = ?3,
            source_relays_json = ?4,
            attestation_event_id = ?5,
            updated_at = ?6
          WHERE target_event_id = ?1
        `
      )
      .run(
        targetEventId,
        pickDefined(input.targetEventKind, current.targetEventKind),
        pickDefined(input.targetEventPubkey, current.targetEventPubkey),
        JSON.stringify(pickDefined(input.sourceRelays, current.sourceRelays)),
        pickDefined(input.attestationEventId, current.attestationEventId),
        nextUpdatedAt
      );

    const job = this.findByTargetEventId(targetEventId);
    if (!job) {
      throw new Error(`Failed to reload job for event ${targetEventId}`);
    }

    return job;
  }
}
