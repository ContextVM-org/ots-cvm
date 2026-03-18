#!/usr/bin/env bun

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NostrServerTransport, PrivateKeySigner } from '@contextvm/sdk';
import { z } from 'zod';
import { getConfig } from './config.ts';
import { TimestampJobService } from './jobs/service.ts';
import { openDatabase } from './ledger/database.ts';
import { JobRepository } from './ledger/job-repository.ts';
import { AppLogger } from './logger.ts';
import { NostrClient } from './nostr/client.ts';
import { OtsClient } from './ots/client.ts';
import {
  timestampResultSchema,
  verifyProofResultSchema,
} from './ots/schema.ts';

async function main(): Promise<void> {
  const config = getConfig();
  const logger = new AppLogger(config);
  const signer = new PrivateKeySigner(config.serverPrivateKey);
  const database = openDatabase(config.sqlitePath);
  const repository = new JobRepository(database);
  const nostrClient = new NostrClient(
    config.relayUrls,
    config.attestationRelayUrls,
    logger
  );
  const otsClient = new OtsClient(config, nostrClient, logger);
  await otsClient.validateRuntimeDependencies();
  const jobService = new TimestampJobService(
    config,
    repository,
    nostrClient,
    otsClient,
    logger
  );

  const server = new McpServer({
    name: 'ots-contextvm-server',
    version: '0.1.0',
  });

  server.registerTool(
    'ots_event',
    {
      title: 'Timestamp Nostr Event',
      description:
        'Accepts a Nostr event reference and synchronously publishes an OpenTimestamps-backed NIP-03 attestation, reusing an existing recorded attestation when available.',
      inputSchema: {
        target: z
          .string()
          .min(1)
          .describe(
            'Raw event id, nevent, or naddr reference for the target Nostr event'
          ),
        relayUrls: z
          .array(z.string().url())
          .optional()
          .describe(
            'Additional relay URLs to merge into event resolution for the target'
          ),
      },
      outputSchema: timestampResultSchema,
    },
    async ({ target, relayUrls }) => {
      const result = await jobService.requestTimestamp(target, relayUrls);
      const structuredContent: Record<string, unknown> = { ...result };

      return {
        content: [],
        structuredContent,
      };
    }
  );

  server.registerTool(
    'verify_ots',
    {
      title: 'Verify OTS Attestation',
      description: 'Verifies an OpenTimestamps proof for a Nostr event.',
      inputSchema: {
        target: z
          .string()
          .min(1)
          .describe(
            'Raw event id, nevent, or naddr reference for the target Nostr event'
          ),
      },
      outputSchema: verifyProofResultSchema,
    },
    async ({ target }) => {
      const result = await otsClient.verifyEventId(target);
      const structuredContent: Record<string, unknown> = { ...result };

      return {
        content: [],
        structuredContent,
      };
    }
  );

  const transport = new NostrServerTransport({
    signer,
    relayHandler: config.relayUrls,
    serverInfo: {
      name: 'OTS ContextVM Server',
      about:
        'ContextVM server for OpenTimestamps-backed NIP-03 attestations on Nostr events.',
    },
    isPublicServer: config.isPublicServer,
  });

  await server.connect(transport);

  const publicKey = await signer.getPublicKey();
  logger.info('OTS ContextVM server running', {
    publicKey,
    relays: config.relayUrls,
    attestationRelays: config.attestationRelayUrls,
    sqlitePath: config.sqlitePath,
    otsDataDir: config.otsDataDir,
    otsPythonBin: config.otsPythonBin,
    otsVerifyCacheDir: config.otsVerifyCacheDir,
    bitcoinApiUrl: config.bitcoinApiUrl,
  });

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down server');
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'ERROR',
      message: 'Failed to start OTS ContextVM server',
      context: {
        error: error instanceof Error ? error.message : String(error),
      },
    })
  );
  process.exit(1);
});
