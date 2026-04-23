/**
 * ============================================================
 *  Ed25519 Audit Trail — signed, tamper-proof event log
 * ============================================================
 *  Every encryption/decryption/share event is signed with
 *  an Ed25519 key so the audit trail can be independently
 *  verified by any party.
 * ============================================================
 */

"use strict";

const nacl = require("tweetnacl");
const naclUtil = require("tweetnacl-util");
const crypto = require("crypto");

/**
 * Generate an Ed25519 signing keypair.
 * @returns {{ publicKey: string, secretKey: string }} Base64-encoded keys
 */
function generateSigningKeyPair() {
  const pair = nacl.sign.keyPair();
  return {
    publicKey: naclUtil.encodeBase64(pair.publicKey),
    secretKey: naclUtil.encodeBase64(pair.secretKey),
  };
}

/**
 * Create a signed audit entry.
 *
 * @param {string}  action     — e.g. "ENCRYPT", "DECRYPT", "STORE_SHARE", "REVOKE_SHARE"
 * @param {Object}  metadata   — arbitrary fields: blobId, nodeId, shareIndex, etc.
 * @param {string}  secretKey  — Base64-encoded Ed25519 secret key
 * @returns {Object} audit entry with signature
 */
function createAuditEntry(action, metadata, secretKey) {
  const entry = {
    action,
    timestamp: new Date().toISOString(),
    nonce: crypto.randomBytes(16).toString("hex"),
    ...metadata,
  };

  // Canonical JSON for deterministic signing
  const canonical = JSON.stringify(entry, Object.keys(entry).sort());
  const message = naclUtil.decodeUTF8(canonical);
  const sk = naclUtil.decodeBase64(secretKey);

  const signature = nacl.sign.detached(message, sk);

  return {
    ...entry,
    signature: naclUtil.encodeBase64(signature),
  };
}

/**
 * Verify an audit entry's Ed25519 signature.
 *
 * @param {Object}  entry     — signed audit entry (with .signature field)
 * @param {string}  publicKey — Base64-encoded Ed25519 public key
 * @returns {boolean} true if signature is valid
 */
function verifyAuditEntry(entry, publicKey) {
  const { signature, ...rest } = entry;
  if (!signature) return false;

  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  const message = naclUtil.decodeUTF8(canonical);
  const sig = naclUtil.decodeBase64(signature);
  const pk = naclUtil.decodeBase64(publicKey);

  return nacl.sign.detached.verify(message, sig, pk);
}

/**
 * Hash a share (or any data) for audit logging without exposing the share.
 * @param {Buffer|string} data
 * @returns {string} SHA-256 hex digest
 */
function hashForAudit(data) {
  return crypto
    .createHash("sha256")
    .update(typeof data === "string" ? Buffer.from(data, "hex") : data)
    .digest("hex");
}

module.exports = {
  generateSigningKeyPair,
  createAuditEntry,
  verifyAuditEntry,
  hashForAudit,
};
