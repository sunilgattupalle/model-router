import Database from "better-sqlite3";
import { join } from "path";

const DB_PATH = join(import.meta.dirname, "..", "data", "router.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    migrate(db);
  }
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      prompt_hash TEXT,
      prompt_tokens INTEGER,
      model_selected TEXT NOT NULL,
      rule_matched TEXT,
      escalated_from TEXT,
      confidence REAL
    );

    CREATE TABLE IF NOT EXISTS outcomes (
      decision_id TEXT PRIMARY KEY REFERENCES decisions(id),
      tokens_used INTEGER,
      latency_ms INTEGER,
      status TEXT NOT NULL,
      retries INTEGER DEFAULT 0,
      cost_usd REAL
    );

    CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_decisions_model ON decisions(model_selected);
  `);
}
