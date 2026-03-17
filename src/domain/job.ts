export interface TimestampRecord {
  id: number;
  targetInput: string;
  targetEventId: string;
  targetEventKind: number | null;
  targetEventPubkey: string | null;
  sourceRelays: string[];
  attestationEventId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimestampResult {
  status: 'completed';
  targetEventId: string;
  attestationEventId: string;
  message: string;
}

export interface ResolvedTargetEvent {
  eventId: string;
  kind: number;
  pubkey: string;
  relays: string[];
  event: {
    id: string;
    kind: number;
    pubkey: string;
    created_at: number;
    tags: string[][];
    content: string;
    sig: string;
  };
}
