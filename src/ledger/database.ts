import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Database } from 'bun:sqlite';

export function openDatabase(path: string): Database {
  mkdirSync(dirname(path), { recursive: true });

  const database = new Database(path, { create: true, strict: true });
  database.run('PRAGMA journal_mode = WAL;');
  database.run('PRAGMA foreign_keys = ON;');

  database.run(`
    CREATE TABLE IF NOT EXISTS timestamp_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_input TEXT NOT NULL,
      target_event_id TEXT NOT NULL UNIQUE,
      target_event_kind INTEGER,
      target_event_pubkey TEXT,
      source_relays_json TEXT NOT NULL DEFAULT '[]',
      attestation_event_id TEXT NOT NULL,
      ots_path TEXT,
      error_message TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);

  return database;
}
