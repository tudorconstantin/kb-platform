import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { conf } from "./config.js";

let _db: Database.Database;

export function getDb(): Database.Database {
  if (!_db) {
    mkdirSync(dirname(conf.dbPath), { recursive: true });
    _db = new Database(conf.dbPath);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
  }
  return _db;
}

export function initDb(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      is_admin INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      key_hash TEXT NOT NULL,
      label TEXT DEFAULT 'default',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vaults (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      visibility TEXT DEFAULT 'private' CHECK(visibility IN ('public','unlisted','private')),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(owner_id, slug)
    );

    CREATE TABLE IF NOT EXISTS vault_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vault_id INTEGER NOT NULL REFERENCES vaults(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      role TEXT DEFAULT 'viewer' CHECK(role IN ('editor','viewer')),
      UNIQUE(vault_id, user_id)
    );
  `);
}
