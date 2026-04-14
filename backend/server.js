/**
 * ============================================================
 *  Federation Node Server — Express API
 * ============================================================
 *  Each instance is an independent federation node that:
 *    • Stores encrypted key shares (SQLite)
 *    • Provides challenge-response authentication
 *    • Maintains a signed audit trail
 *    • Discovers and heartbeats peers
 *
 *  Zero-knowledge: the node NEVER sees DEKs or plaintext data.
 * ============================================================
 */

"use strict";

require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const crypto = require("crypto");
const FederationNode = require("./federation-node");
const { generateChallenge, verifyResponse } = require("./challenge-auth");
const { FEDERATION, SHAMIR } = require("../shared/constants");
const { decryptTransactionAuto, encryptTransactionV2 } = require("./crypto");

/**
 * Create an Express app for a federation node.
 *
 * @param {Object} opts
 * @param {string} opts.nodeId
 * @param {number} opts.port
 * @param {string} [opts.dbDir]
 * @returns {{ app: express.Express, node: FederationNode }}
 */
function createNodeServer(opts) {
  const node = new FederationNode(opts);
  const app = express();

  // ── Security Middleware ─────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",")
        : "*",
      methods: ["GET", "POST", "DELETE"],
    })
  );
  app.use(express.json({ limit: "64kb" }));

  // ── Rate Limiter ────────────────────────────────────────
  const rateLimitMap = new Map();
  app.use((req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, start: now };
    if (now - entry.start > 60_000) {
      entry.count = 1;
      entry.start = now;
    } else {
      entry.count += 1;
    }
    rateLimitMap.set(ip, entry);
    if (entry.count > 60) {
      return res.status(429).json({ error: "Rate limit exceeded." });
    }
    next();
  });

  // ── Auth: Challenge ─────────────────────────────────────
  app.get("/auth/challenge", (_req, res) => {
    const challenge = generateChallenge();
    res.json(challenge);
  });

  // ── Store Share ─────────────────────────────────────────
  app.post("/api/shares/:blobId", (req, res) => {
    try {
      const { blobId } = req.params;
      const { shareIndex, encryptedShare, version } = req.body;

      if (!shareIndex || !encryptedShare) {
        return res.status(400).json({ error: "shareIndex and encryptedShare required." });
      }

      if (typeof shareIndex !== "number" || shareIndex < 1 || shareIndex > 255) {
        return res.status(400).json({ error: "shareIndex must be 1-255." });
      }

      if (typeof encryptedShare !== "string" || encryptedShare.length > FEDERATION.MAX_SHARE_SIZE_BYTES * 2) {
        return res.status(400).json({ error: "Invalid encryptedShare." });
      }

      const result = node.storeShare(blobId, shareIndex, encryptedShare, version || 2);

      res.status(201).json({
        success: true,
        ...result,
      });
    } catch (err) {
      console.error(`[${node.nodeId}] Store error:`, err.message);
      res.status(500).json({ error: "Failed to store share." });
    }
  });

  // ── Retrieve Share ──────────────────────────────────────
  app.get("/api/shares/:blobId/:shareIndex", (req, res) => {
    try {
      const { blobId, shareIndex } = req.params;
      const row = node.retrieveShare(blobId, parseInt(shareIndex, 10));

      if (!row) {
        return res.status(404).json({ error: "Share not found or revoked." });
      }

      res.json({
        blobId: row.blob_id,
        shareIndex: row.share_index,
        encryptedShare: row.encrypted_share,
        shareHash: row.share_hash,
        version: row.version,
      });
    } catch (err) {
      console.error(`[${node.nodeId}] Retrieve error:`, err.message);
      res.status(500).json({ error: "Failed to retrieve share." });
    }
  });

  // ── Revoke Share ────────────────────────────────────────
  app.delete("/api/shares/:blobId/:shareIndex", (req, res) => {
    try {
      const { blobId, shareIndex } = req.params;
      node.revokeShare(blobId, parseInt(shareIndex, 10));
      res.json({ success: true, message: "Share revoked." });
    } catch (err) {
      res.status(500).json({ error: "Failed to revoke share." });
    }
  });

  // ── Revoke All Shares for a Blob ────────────────────────
  app.delete("/api/shares/:blobId", (req, res) => {
    try {
      node.revokeAllShares(req.params.blobId);
      res.json({ success: true, message: "All shares revoked." });
    } catch (err) {
      res.status(500).json({ error: "Failed to revoke shares." });
    }
  });

  // ── List Blobs ──────────────────────────────────────────
  app.get("/api/blobs", (_req, res) => {
    res.json(node.listBlobs());
  });

  // ── Audit Trail ─────────────────────────────────────────
  app.get("/api/audit/:blobId", (req, res) => {
    const trail = node.audit.getTrail(req.params.blobId);
    res.json({ blobId: req.params.blobId, entries: trail });
  });

  // ── Audit Chain Verification ────────────────────────────
  app.get("/api/audit/verify/chain", (_req, res) => {
    const result = node.audit.verifyChain();
    res.json(result);
  });

  // ── Peer Registration ──────────────────────────────────
  app.post("/federation/peers", (req, res) => {
    const { nodeId, url, publicKey } = req.body;
    if (!nodeId || !url) {
      return res.status(400).json({ error: "nodeId and url required." });
    }
    node.registerPeer(nodeId, url, publicKey);
    res.json({ success: true, message: `Peer ${nodeId} registered.` });
  });

  // ── Heartbeat ───────────────────────────────────────────
  app.post("/federation/heartbeat", (req, res) => {
    const { nodeId } = req.body;
    if (nodeId) node.heartbeat(nodeId);
    res.json({ ack: true, from: node.nodeId });
  });

  // ── Health / Status ─────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json(node.getStatus());
  });

  // ── Legacy v1 Transaction Endpoint (backward compat) ───
  app.post("/api/transactions/legacy", (req, res) => {
    try {
      const { encryptedPayload, password } = req.body;
      if (!encryptedPayload || !password) {
        return res.status(400).json({ error: "encryptedPayload and password required." });
      }

      const result = decryptTransactionAuto(encryptedPayload, password);
      if (result.version !== 1) {
        return res.status(400).json({ error: "Use /api/transactions for v2 payloads." });
      }

      console.log(`[${node.nodeId}] ✅ V1 legacy transaction decrypted:`, result.transaction);
      res.json({
        success: true,
        version: 1,
        message: "V1 transaction decrypted (legacy).",
        deprecation: "⚠️ V1 format is deprecated. Please migrate to v2.",
        txnId: `TXN-${Date.now()}`,
      });
    } catch (err) {
      console.error(`[${node.nodeId}] V1 decrypt error:`, err.message);
      res.status(400).json({ error: "Failed to decrypt v1 payload." });
    }
  });

  return { app, node };
}

/**
 * Start a standalone federation node server.
 */
function startNode(opts) {
  const { app, node } = createNodeServer(opts);
  const server = app.listen(opts.port, () => {
    console.log(`🔗 Federation node [${node.nodeId}] listening on :${opts.port}`);
    console.log(`   Public key: ${node.keys.publicKey.slice(0, 20)}…`);
  });
  return { app, node, server };
}

// ── Standalone execution ────────────────────────────────────
if (require.main === module) {
  const PORT = parseInt(process.env.PORT || "3000", 10);
  const NODE_ID = process.env.NODE_ID || "node-standalone";
  startNode({ nodeId: NODE_ID, port: PORT });
}

module.exports = { createNodeServer, startNode };
