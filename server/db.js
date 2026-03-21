import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, "..", "server.db");

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS citizens (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      aadhaar_id      TEXT UNIQUE NOT NULL,
      full_name       TEXT NOT NULL,
      date_of_birth   TEXT NOT NULL,
      gender          TEXT NOT NULL,
      district        TEXT NOT NULL,
      registered_wallet TEXT DEFAULT NULL,
      verified_at     TEXT DEFAULT NULL,
      created_at      TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet
      ON citizens(registered_wallet)
      WHERE registered_wallet IS NOT NULL;

    CREATE TABLE IF NOT EXISTS admins (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address  TEXT UNIQUE NOT NULL,
      label           TEXT NOT NULL DEFAULT '',
      granted_by      TEXT NOT NULL,
      created_at      TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function findByAadhaar(aadhaarId) {
  return getDb().prepare("SELECT * FROM citizens WHERE aadhaar_id = ?").get(aadhaarId);
}

export function isWalletLinked(walletAddress) {
  const row = getDb()
    .prepare("SELECT id FROM citizens WHERE registered_wallet = ?")
    .get(walletAddress.toLowerCase());
  return !!row;
}

export function linkWallet(aadhaarId, walletAddress) {
  getDb()
    .prepare(
      "UPDATE citizens SET registered_wallet = ?, verified_at = datetime('now') WHERE aadhaar_id = ?"
    )
    .run(walletAddress.toLowerCase(), aadhaarId);
}

// --- Citizen management ---

export function insertCitizen({ aadhaar_id, full_name, date_of_birth, gender, district }) {
  return getDb()
    .prepare(
      "INSERT INTO citizens (aadhaar_id, full_name, date_of_birth, gender, district) VALUES (?, ?, ?, ?, ?)"
    )
    .run(aadhaar_id, full_name, date_of_birth, gender, district);
}

export function getAllCitizens() {
  return getDb().prepare("SELECT * FROM citizens ORDER BY id").all();
}

export function deleteCitizen(aadhaarId) {
  return getDb().prepare("DELETE FROM citizens WHERE aadhaar_id = ? AND registered_wallet IS NULL").run(aadhaarId);
}

// --- Admin management ---

export function isAdmin(walletAddress) {
  const row = getDb()
    .prepare("SELECT id FROM admins WHERE wallet_address = ?")
    .get(walletAddress.toLowerCase());
  return !!row;
}

export function addAdmin(walletAddress, label, grantedBy) {
  return getDb()
    .prepare("INSERT OR IGNORE INTO admins (wallet_address, label, granted_by) VALUES (?, ?, ?)")
    .run(walletAddress.toLowerCase(), label, grantedBy.toLowerCase());
}

export function removeAdmin(walletAddress) {
  return getDb()
    .prepare("DELETE FROM admins WHERE wallet_address = ?")
    .run(walletAddress.toLowerCase());
}

export function getAllAdmins() {
  return getDb().prepare("SELECT * FROM admins ORDER BY id").all();
}
