/**
 * ============================================================
 *  SQLite Audit Store — append-only, tamper-evident log
 * ============================================================
 *  Each federation node maintains its own audit log in SQLite.
 *  Entries are Ed25519-signed and chained via prev_hash for
 *  tamper detection.
 * ============================================================
 */

"use strict";

const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");
const { createAuditEntry, verifyAuditEntry, hashForAudit } = require("../shared/audit");

class AuditStore {
  /**
   * @param {string} nodeId    — unique node identifier
   * @param {string} secretKey — Base64 Ed25519 secret key
   * @param {string} publicKey — Base64 Ed25519 public key
   * @param {string} [dbDir]   — directory for the SQLite file
   */
  constructor(nodeId, secretKey, publicKey, dbDir) {
    this.nodeId = nodeId;
    this.secretKey = secretKey;
    this.publicKey = publicKey;

    const dbPath = path.join(
      dbDir || path.join(__dirname, "..", "data"),
      `audit_${nodeId}.db`
    );

    this.db = new Database(dbPath);
    this._init();
  }

  _init() {
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        blob_id     TEXT    NOT NULL,
        action      TEXT    NOT NULL,
        node_id     TEXT    NOT NULL,
        timestamp   TEXT    NOT NULL,
        nonce       TEXT    NOT NULL,
        metadata    TEXT,
        signature   TEXT    NOT NULL,
        prev_hash   TEXT,
        entry_hash  TEXT    NOT NULL,
        created_at  TEXT    DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_audit_blob_id ON audit_log(blob_id);
      CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_log(action);
    `);

    // Prepared statements
    this._insertStmt = this.db.prepare(`
      INSERT INTO audit_log (blob_id, action, node_id, timestamp, nonce, metadata, signature, prev_hash, entry_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this._getByBlobStmt = this.db.prepare(
      `SELECT * FROM audit_log WHERE blob_id = ? ORDER BY id ASC`
    );

    this._getLastStmt = this.db.prepare(
      `SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1`
    );

    this._getAllStmt = this.db.prepare(
      `SELECT * FROM audit_log ORDER BY id ASC`
    );
  }

  /**
   * Append a signed audit entry.
   *
   * @param {string} action  — e.g. "STORE_SHARE", "RETRIEVE_SHARE"
   * @param {string} blobId
   * @param {Object} [meta]  — additional metadata
   * @returns {Object} the created entry
   */
  append(action, blobId, meta = {}) {
    const metadata = { blobId, nodeId: this.nodeId, ...meta };
    const entry = createAuditEntry(action, metadata, this.secretKey);

    // Chain hash: hash of previous entry
    const lastRow = this._getLastStmt.get();
    const prevHash = lastRow ? lastRow.entry_hash : "GENESIS";

    // Hash this entry (including prevHash for chaining)
    const entryHash = crypto
      .createHash("sha256")
      .update(prevHash)
      .update(entry.signature)
      .update(entry.timestamp)
      .digest("hex");

    this._insertStmt.run(
      blobId,
      action,
      this.nodeId,
      entry.timestamp,
      entry.nonce,
      JSON.stringify(meta),
      entry.signature,
      prevHash,
      entryHash
    );

    return { ...entry, prevHash, entryHash };
  }

  /**
   * Get audit trail for a specific blob.
   * @param {string} blobId
   * @returns {Array}
   */
  getTrail(blobId) {
    return this._getByBlobStmt.all(blobId);
  }

  /**
   * Verify chain integrity of the entire audit log.
   * @returns {{ valid: boolean, entries: number, errors: string[] }}
   */
  verifyChain() {
    const entries = this._getAllStmt.all();
    const errors = [];
    let prevHash = "GENESIS";

    for (const row of entries) {
      // Verify chain link
      if (row.prev_hash !== prevHash) {
        errors.push(`Entry ${row.id}: broken chain (expected ${prevHash}, got ${row.prev_hash})`);
      }

      // Verify hash
      const expectedHash = crypto
        .createHash("sha256")
        .update(row.prev_hash)
        .update(row.signature)
        .update(row.timestamp)
        .digest("hex");

      if (row.entry_hash !== expectedHash) {
        errors.push(`Entry ${row.id}: hash mismatch`);
      }

      prevHash = row.entry_hash;
    }

    return {
      valid: errors.length === 0,
      entries: entries.length,
      errors,
    };
  }

  /**
   * Close the database connection.
   */
  close() {
    this.db.close();
  }
}

module.exports = AuditStore;
