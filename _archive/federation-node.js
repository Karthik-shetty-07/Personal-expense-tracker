/**
 * ============================================================
 *  Federation Node — Share Storage & Peer Management
 * ============================================================
 *  Each node stores encrypted key shares in SQLite.
 *  Nodes discover peers, send heartbeats, and can
 *  report their status to the federation ring.
 *
 *  Zero-knowledge: the node never sees the DEK or plaintext.
 *  It stores only encrypted share blobs provided by the client.
 * ============================================================
 */

"use strict";

const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");
const { FEDERATION } = require("../shared/constants");
const { generateSigningKeyPair } = require("../shared/audit");
const AuditStore = require("./audit-store");

class FederationNode {
  /**
   * @param {Object} opts
   * @param {string} opts.nodeId     — unique identifier (e.g. "node-a")
   * @param {number} opts.port       — HTTP port
   * @param {string} [opts.dbDir]    — directory for SQLite files
   * @param {Object} [opts.keys]     — { publicKey, secretKey } Ed25519 pair
   */
  constructor(opts) {
    this.nodeId = opts.nodeId;
    this.port = opts.port;
    this.dbDir = opts.dbDir || path.join(__dirname, "..", "data");

    // Ensure db dir exists
    const fs = require("fs");
    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }

    // Ed25519 identity
    this.keys = opts.keys || generateSigningKeyPair();

    // Peer registry
    this.peers = new Map(); // nodeId → { url, publicKey, lastSeen }

    // Share storage (SQLite)
    const dbPath = path.join(this.dbDir, `shares_${this.nodeId}.db`);
    this.db = new Database(dbPath);
    this._initDB();

    // Audit log
    this.audit = new AuditStore(
      this.nodeId,
      this.keys.secretKey,
      this.keys.publicKey,
      this.dbDir
    );
  }

  _initDB() {
    this.db.pragma("journal_mode = WAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shares (
        blob_id         TEXT NOT NULL,
        share_index     INTEGER NOT NULL,
        encrypted_share TEXT NOT NULL,
        share_hash      TEXT NOT NULL,
        version         INTEGER NOT NULL DEFAULT 2,
        created_at      TEXT DEFAULT (datetime('now')),
        revoked         INTEGER DEFAULT 0,
        PRIMARY KEY (blob_id, share_index)
      );

      CREATE INDEX IF NOT EXISTS idx_shares_blob ON shares(blob_id);
    `);

    this._storeStmt = this.db.prepare(`
      INSERT OR REPLACE INTO shares (blob_id, share_index, encrypted_share, share_hash, version)
      VALUES (?, ?, ?, ?, ?)
    `);

    this._getStmt = this.db.prepare(
      `SELECT * FROM shares WHERE blob_id = ? AND share_index = ? AND revoked = 0`
    );

    this._getByBlobStmt = this.db.prepare(
      `SELECT * FROM shares WHERE blob_id = ? AND revoked = 0`
    );

    this._revokeStmt = this.db.prepare(
      `UPDATE shares SET revoked = 1 WHERE blob_id = ? AND share_index = ?`
    );

    this._revokeAllStmt = this.db.prepare(
      `UPDATE shares SET revoked = 1 WHERE blob_id = ?`
    );

    this._listBlobsStmt = this.db.prepare(
      `SELECT DISTINCT blob_id, version, created_at FROM shares WHERE revoked = 0 ORDER BY created_at DESC`
    );
  }

  // ── Share Operations ────────────────────────────────────

  /**
   * Store an encrypted key share.
   *
   * @param {string} blobId         — unique ID for the encrypted data
   * @param {number} shareIndex     — which share (1-based)
   * @param {string} encryptedShare — the encrypted share data (hex or base64)
   * @param {number} [version=2]    — protocol version
   * @returns {Object} storage confirmation
   */
  storeShare(blobId, shareIndex, encryptedShare, version = 2) {
    const shareHash = crypto
      .createHash("sha256")
      .update(encryptedShare)
      .digest("hex");

    this._storeStmt.run(blobId, shareIndex, encryptedShare, shareHash, version);

    // Audit
    this.audit.append("STORE_SHARE", blobId, {
      shareIndex,
      shareHash,
      version,
    });

    return { blobId, shareIndex, shareHash, nodeId: this.nodeId };
  }

  /**
   * Retrieve an encrypted share.
   *
   * @param {string} blobId
   * @param {number} shareIndex
   * @returns {Object|null}
   */
  retrieveShare(blobId, shareIndex) {
    const row = this._getStmt.get(blobId, shareIndex);

    if (row) {
      this.audit.append("RETRIEVE_SHARE", blobId, {
        shareIndex,
        shareHash: row.share_hash,
      });
    }

    return row || null;
  }

  /**
   * Retrieve all shares for a blob stored on this node.
   */
  getSharesForBlob(blobId) {
    return this._getByBlobStmt.all(blobId);
  }

  /**
   * Revoke (soft-delete) a specific share.
   */
  revokeShare(blobId, shareIndex) {
    this._revokeStmt.run(blobId, shareIndex);
    this.audit.append("REVOKE_SHARE", blobId, { shareIndex });
  }

  /**
   * Revoke all shares for a blob (used during key rotation).
   */
  revokeAllShares(blobId) {
    this._revokeAllStmt.run(blobId);
    this.audit.append("REVOKE_ALL_SHARES", blobId);
  }

  /**
   * List all active blobs.
   */
  listBlobs() {
    return this._listBlobsStmt.all();
  }

  // ── Peer Management ─────────────────────────────────────

  /**
   * Register a peer node.
   */
  registerPeer(nodeId, url, publicKey) {
    this.peers.set(nodeId, {
      url,
      publicKey,
      lastSeen: Date.now(),
    });
  }

  /**
   * Update peer's last-seen timestamp.
   */
  heartbeat(nodeId) {
    const peer = this.peers.get(nodeId);
    if (peer) peer.lastSeen = Date.now();
  }

  /**
   * Get all active peers (seen within PEER_TIMEOUT_MS).
   */
  getActivePeers() {
    const now = Date.now();
    const active = [];
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen <= FEDERATION.PEER_TIMEOUT_MS) {
        active.push({ nodeId: id, ...peer });
      }
    }
    return active;
  }

  /**
   * Node status for health checks.
   */
  getStatus() {
    return {
      nodeId: this.nodeId,
      port: this.port,
      publicKey: this.keys.publicKey,
      peers: this.getActivePeers().length,
      blobs: this.listBlobs().length,
      auditIntegrity: this.audit.verifyChain(),
    };
  }

  /**
   * Graceful shutdown.
   */
  close() {
    this.audit.close();
    this.db.close();
  }
}

module.exports = FederationNode;
