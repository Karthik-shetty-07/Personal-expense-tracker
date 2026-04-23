/**
 * ============================================================
 *  Backend Crypto — v1/v2 compatible encryption/decryption
 * ============================================================
 *  • v2: AES-256-GCM envelope + Shamir (federated)
 *  • v1: AES-256-CBC + HMAC (legacy, decrypt-only)
 *
 *  This module handles share-level encryption that protects
 *  individual Shamir shares with the user's master key.
 * ============================================================
 */

"use strict";

const crypto = require("crypto");
const { VERSIONS, PBKDF2, AES, SIZES } = require("../shared/constants");
const {
  envelopeEncrypt,
  envelopeDecrypt,
  decryptV1Legacy,
  detectVersion,
  generateDEK,
  generateBlobId,
} = require("../shared/envelope");
const { splitSecret, combineShares, serializeShare, deserializeShare } = require("../shared/shamir");

// ── Key Derivation ──────────────────────────────────────────

/**
 * Derive master key from password + salt (v2 params).
 * Returns a 32-byte Buffer.
 */
function deriveMasterKey(password, salt) {
  return crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2.V2_ITERATIONS,
    PBKDF2.KEY_SIZE_BYTES,
    PBKDF2.HASH
  );
}

/**
 * Generate a random salt.
 * @returns {Buffer}
 */
function generateSalt() {
  return crypto.randomBytes(SIZES.SALT_BYTES);
}

// ── Share Encryption ────────────────────────────────────────

/**
 * Encrypt an individual Shamir share with the user's master key.
 * This ensures federation nodes cannot read the share.
 *
 * @param {{x: number, y: Buffer}} share
 * @param {Buffer} masterKey — 32-byte key derived from password
 * @returns {string} Base64-encoded encrypted share
 */
function encryptShare(share, masterKey) {
  const serialized = JSON.stringify(serializeShare(share));
  const envelope = envelopeEncrypt(serialized, masterKey);
  return envelope.toString("base64");
}

/**
 * Decrypt an individual Shamir share with the user's master key.
 *
 * @param {string} encryptedShareB64
 * @param {Buffer} masterKey
 * @returns {{x: number, y: Buffer}}
 */
function decryptShare(encryptedShareB64, masterKey) {
  const envelope = Buffer.from(encryptedShareB64, "base64");
  const decrypted = envelopeDecrypt(envelope, masterKey);
  const parsed = JSON.parse(decrypted.toString("utf8"));
  return deserializeShare(parsed);
}

// ── Full Encryption Flow (v2) ───────────────────────────────

/**
 * Encrypt transaction data using the v2 federated scheme.
 *
 * Steps:
 *   1. Derive masterKey from password
 *   2. Generate random DEK
 *   3. AES-256-GCM encrypt data with DEK
 *   4. Shamir-split DEK into N shares
 *   5. Encrypt each share with masterKey
 *   6. Return encrypted blob + encrypted shares
 *
 * @param {Object}  txn       — transaction object
 * @param {string}  password  — user password
 * @param {number}  [n=3]     — total shares
 * @param {number}  [k=2]     — threshold
 * @returns {{ blobId, encryptedBlob, salt, shares: Array<{index, encrypted}> }}
 */
function encryptTransactionV2(txn, password, n = 3, k = 2) {
  if (typeof txn !== "object" || txn === null) {
    throw new Error("Transaction must be a non-null object.");
  }

  // 1. Key derivation
  const salt = generateSalt();
  const masterKey = deriveMasterKey(password, salt);

  // 2. Generate random DEK
  const dek = generateDEK();

  // 3. Encrypt transaction with DEK
  const plaintext = JSON.stringify(txn);
  const aad = Buffer.from("transaction-v2");
  const encryptedBlob = envelopeEncrypt(plaintext, dek, aad);

  // 4. Shamir-split DEK
  const rawShares = splitSecret(dek, n, k);

  // 5. Encrypt each share with masterKey
  const encryptedShares = rawShares.map((share) => ({
    index: share.x,
    encrypted: encryptShare(share, masterKey),
  }));

  // 6. Generate blob ID
  const blobId = generateBlobId();

  // Wipe DEK from memory
  dek.fill(0);

  return {
    blobId,
    encryptedBlob: encryptedBlob.toString("base64"),
    salt: salt.toString("hex"),
    shares: encryptedShares,
    version: VERSIONS.V2_GCM_SSS,
  };
}

/**
 * Decrypt transaction data using the v2 federated scheme.
 *
 * Steps:
 *   1. Derive masterKey from password + salt
 *   2. Decrypt K encrypted shares with masterKey
 *   3. Shamir-reconstruct DEK from K shares
 *   4. AES-256-GCM decrypt blob with DEK
 *
 * @param {string}        encryptedBlobB64  — Base64 encrypted blob
 * @param {Array<string>} encryptedShares   — K or more encrypted shares (Base64)
 * @param {string}        password          — user password
 * @param {string}        saltHex           — hex-encoded salt
 * @returns {Object} transaction object
 */
function decryptTransactionV2(encryptedBlobB64, encryptedShares, password, saltHex) {
  // 1. Derive masterKey
  const salt = Buffer.from(saltHex, "hex");
  const masterKey = deriveMasterKey(password, salt);

  // 2. Decrypt shares
  const rawShares = encryptedShares.map((encShare) =>
    decryptShare(encShare, masterKey)
  );

  // 3. Reconstruct DEK
  const dek = combineShares(rawShares);

  // 4. Decrypt blob
  const envelope = Buffer.from(encryptedBlobB64, "base64");
  const aad = Buffer.from("transaction-v2");
  const plaintext = envelopeDecrypt(envelope, dek, aad);

  // Wipe DEK
  dek.fill(0);

  try {
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new Error("Decrypted data is not valid JSON.");
  }
}

// ── Version-aware Decryption ────────────────────────────────

/**
 * Decrypt a transaction payload, auto-detecting version.
 *
 * @param {string}               payload          — Base64 payload
 * @param {string}               password         — user password
 * @param {Object}               [opts]           — v2-specific options
 * @param {Array<string>}        [opts.shares]    — encrypted shares for v2
 * @param {string}               [opts.salt]      — hex salt for v2
 * @returns {Object} transaction
 */
function decryptTransactionAuto(payload, password, opts = {}) {
  const version = detectVersion(payload);

  if (version === VERSIONS.V1_CBC_HMAC) {
    // Legacy v1 path
    const json = decryptV1Legacy(payload, password);
    try {
      return { version: 1, transaction: JSON.parse(json) };
    } catch {
      throw new Error("V1 decrypted data is not valid JSON.");
    }
  }

  if (version === VERSIONS.V2_GCM_SSS) {
    if (!opts.shares || !opts.salt) {
      throw new Error("V2 decryption requires shares and salt.");
    }
    const transaction = decryptTransactionV2(payload, opts.shares, password, opts.salt);
    return { version: 2, transaction };
  }

  throw new Error(`Unknown payload version: 0x${version.toString(16)}`);
}

module.exports = {
  deriveMasterKey,
  generateSalt,
  encryptShare,
  decryptShare,
  encryptTransactionV2,
  decryptTransactionV2,
  decryptTransactionAuto,
  // Re-export for convenience
  generateDEK,
  generateBlobId,
};
