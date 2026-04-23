/**
 * ============================================================
 *  Envelope Encryption — AES-256-GCM (v2) + CBC fallback (v1)
 * ============================================================
 *  • v2: AES-256-GCM with random 12-byte IV, 16-byte authTag
 *  • v1: AES-256-CBC + HMAC-SHA256 (legacy, read-only)
 *
 *  Payload formats:
 *    v2: version(1B) ‖ iv(12B) ‖ authTag(16B) ‖ ciphertext
 *    v1: salt(16B) ‖ iv(16B) ‖ ciphertext ‖ hmac(32B)
 * ============================================================
 */

"use strict";

const crypto = require("crypto");
const { VERSIONS, AES, SIZES, PBKDF2 } = require("./constants");

// ── v2: AES-256-GCM ────────────────────────────────────────

/**
 * Generate a random Data Encryption Key (DEK).
 * @returns {Buffer} 32-byte random DEK
 */
function generateDEK() {
  return crypto.randomBytes(SIZES.DEK_BYTES);
}

/**
 * Generate a unique blob ID for tracking shares.
 * @returns {string} hex-encoded 16-byte ID
 */
function generateBlobId() {
  return crypto.randomBytes(SIZES.SHARE_ID_BYTES).toString("hex");
}

/**
 * Encrypt data with AES-256-GCM (v2 envelope).
 *
 * @param {string|Buffer} plaintext
 * @param {Buffer}        dek        — 32-byte Data Encryption Key
 * @param {Buffer}        [aad]      — optional Additional Authenticated Data
 * @returns {Buffer} version(1) ‖ iv(12) ‖ authTag(16) ‖ ciphertext
 */
function envelopeEncrypt(plaintext, dek, aad) {
  if (!Buffer.isBuffer(dek) || dek.length !== AES.KEY_SIZE_BYTES) {
    throw new Error(`DEK must be a ${AES.KEY_SIZE_BYTES}-byte Buffer.`);
  }

  const iv = crypto.randomBytes(AES.IV_SIZE_BYTES_GCM);
  const cipher = crypto.createCipheriv(AES.V2_ALGORITHM, dek, iv, {
    authTagLength: AES.AUTH_TAG_BYTES,
  });

  if (aad) cipher.setAAD(aad);

  const data =
    typeof plaintext === "string"
      ? Buffer.from(plaintext, "utf8")
      : plaintext;

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Assemble: version(1B) + iv(12B) + authTag(16B) + ciphertext
  return Buffer.concat([
    Buffer.from([VERSIONS.V2_GCM_SSS]),
    iv,
    authTag,
    encrypted,
  ]);
}

/**
 * Decrypt a v2 GCM envelope.
 *
 * @param {Buffer} envelope — output of envelopeEncrypt()
 * @param {Buffer} dek      — same DEK used for encryption
 * @param {Buffer} [aad]    — same AAD used for encryption
 * @returns {Buffer} plaintext
 */
function envelopeDecrypt(envelope, dek, aad) {
  if (!Buffer.isBuffer(dek) || dek.length !== AES.KEY_SIZE_BYTES) {
    throw new Error(`DEK must be a ${AES.KEY_SIZE_BYTES}-byte Buffer.`);
  }

  const version = envelope[0];
  if (version !== VERSIONS.V2_GCM_SSS) {
    throw new Error(
      `Expected v2 envelope (0x02), got 0x${version.toString(16)}`
    );
  }

  const iv = envelope.subarray(1, 1 + AES.IV_SIZE_BYTES_GCM);
  const authTag = envelope.subarray(
    1 + AES.IV_SIZE_BYTES_GCM,
    1 + AES.IV_SIZE_BYTES_GCM + AES.AUTH_TAG_BYTES
  );
  const ciphertext = envelope.subarray(
    1 + AES.IV_SIZE_BYTES_GCM + AES.AUTH_TAG_BYTES
  );

  const decipher = crypto.createDecipheriv(AES.V2_ALGORITHM, dek, iv, {
    authTagLength: AES.AUTH_TAG_BYTES,
  });

  decipher.setAuthTag(authTag);
  if (aad) decipher.setAAD(aad);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    throw new Error(`GCM decryption failed (tampered or wrong key): ${err.message}`);
  }
}

// ── v1: AES-256-CBC + HMAC (legacy, decrypt only) ──────────

/**
 * Decrypt a v1 legacy payload (CBC + HMAC).
 * Used for backward compatibility during migration.
 *
 * @param {string} payloadB64 — Base-64 encoded v1 payload
 * @param {string} password   — user password
 * @returns {string} plaintext
 */
function decryptV1Legacy(payloadB64, password) {
  const payload = Buffer.from(payloadB64, "base64");

  const minLen = SIZES.SALT_BYTES + AES.IV_SIZE_BYTES_CBC + AES.BLOCK_SIZE_BYTES + SIZES.HMAC_BYTES;
  if (payload.length < minLen) {
    throw new Error("V1 payload too short — possibly corrupted.");
  }

  // Split: salt(16) | iv(16) | ciphertext | hmac(32)
  const salt = payload.subarray(0, SIZES.SALT_BYTES);
  const iv = payload.subarray(SIZES.SALT_BYTES, SIZES.SALT_BYTES + AES.IV_SIZE_BYTES_CBC);
  const hmacReceived = payload.subarray(payload.length - SIZES.HMAC_BYTES);
  const ciphertext = payload.subarray(
    SIZES.SALT_BYTES + AES.IV_SIZE_BYTES_CBC,
    payload.length - SIZES.HMAC_BYTES
  );

  // Derive keys (v1 params)
  const derived = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2.V1_ITERATIONS,
    PBKDF2.KEY_SIZE_BYTES * 2,
    PBKDF2.HASH
  );
  const encKey = derived.subarray(0, PBKDF2.KEY_SIZE_BYTES);
  const macKey = derived.subarray(PBKDF2.KEY_SIZE_BYTES);

  // Verify HMAC
  const hmacExpected = crypto
    .createHmac("sha256", macKey)
    .update(Buffer.concat([salt, iv, ciphertext]))
    .digest();

  if (!crypto.timingSafeEqual(hmacReceived, hmacExpected)) {
    throw new Error("V1 HMAC verification failed — tampered or wrong password.");
  }

  // Decrypt CBC
  const decipher = crypto.createDecipheriv(AES.V1_ALGORITHM, encKey, iv);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Detect payload version from raw bytes.
 *
 * @param {string|Buffer} payload — Base-64 string or Buffer
 * @returns {number} VERSIONS.V1_CBC_HMAC or VERSIONS.V2_GCM_SSS
 */
function detectVersion(payload) {
  const buf =
    typeof payload === "string"
      ? Buffer.from(payload, "base64")
      : payload;

  if (buf.length === 0) throw new Error("Empty payload");

  // v2 payloads start with 0x02 version byte
  if (buf[0] === VERSIONS.V2_GCM_SSS) return VERSIONS.V2_GCM_SSS;

  // Otherwise assume v1 (no version byte — legacy format)
  return VERSIONS.V1_CBC_HMAC;
}

module.exports = {
  generateDEK,
  generateBlobId,
  envelopeEncrypt,
  envelopeDecrypt,
  decryptV1Legacy,
  detectVersion,
};
