import { z } from 'zod';

export const timestampResultSchema = z.object({
  targetEventId: z.string().length(64),
  attestationEventId: z.string().length(64),
  message: z
    .string()
    .describe(
      'Human-readable summary indicating whether the attestation was newly published or an existing one was reused'
    ),
});

export const otsProofSummarySchema = z.object({
  fileHash: z.string(),
  bitcoinAttestations: z.number().int().nonnegative(),
  pendingAttestations: z.number().int().nonnegative(),
  attestationHeights: z.array(z.number().int().nonnegative()),
});

export const verifyProofResultSchema = otsProofSummarySchema.extend({
  targetEventId: z.string().length(64),
  digestMatches: z.boolean(),
  bitcoinVerified: z.boolean(),
  verificationMode: z.literal('public-bitcoin-api'),
  provider: z.string(),
  blockHeight: z.number().int().nonnegative().nullable(),
  blockHash: z.string().nullable(),
  attestedTime: z.number().int().nonnegative().nullable(),
  hasPendingAttestations: z.boolean(),
  isPending: z.boolean(),
  message: z.string(),
});

export type TimestampResult = z.infer<typeof timestampResultSchema>;
export type VerifyProofResult = z.infer<typeof verifyProofResultSchema>;
