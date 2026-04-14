/**
 * ============================================================
 *  Shared Constants — Cryptographic Tunables
 * ============================================================
 *  Single source of truth for all crypto params shared between
 *  frontend (crypto-js) and backend (Node native crypto).
 * ============================================================
 */

"use strict";

// ── payload version tags ────────────────────────────────────
const VERSIONS = {
  V1_CBC_HMAC: 0x01, // legacy: AES-256-CBC + HMAC-SHA256
  V2_GCM_SSS: 0x02, // current: AES-256-GCM + Shamir + federation
};

// ── PBKDF2 ──────────────────────────────────────────────────
const PBKDF2 = {
  V1_ITERATIONS: 310_000, // legacy (OWASP 2023)
  V2_ITERATIONS: 600_000, // current (OWASP 2024+)
  HASH: "sha256",
  KEY_SIZE_BYTES: 32, // 256 bits
};

// ── AES ─────────────────────────────────────────────────────
const AES = {
  V1_ALGORITHM: "aes-256-cbc",
  V2_ALGORITHM: "aes-256-gcm",
  KEY_SIZE_BYTES: 32,
  IV_SIZE_BYTES_CBC: 16, // 128 bits (CBC)
  IV_SIZE_BYTES_GCM: 12, // 96 bits (GCM recommended)
  AUTH_TAG_BYTES: 16, // GCM authentication tag
  BLOCK_SIZE_BYTES: 16,
};

// ── Shamir Secret Sharing ───────────────────────────────────
const SHAMIR = {
  TOTAL_SHARES: 3, // N — number of federation nodes
  THRESHOLD: 2, // K — minimum shares to reconstruct
  PRIME_FIELD: 256, // GF(2^8) — operates on bytes
};

// ── Salt / HMAC ─────────────────────────────────────────────
const SIZES = {
  SALT_BYTES: 16,
  HMAC_BYTES: 32,
  DEK_BYTES: 32, // Data Encryption Key = 256 bits
  SHARE_ID_BYTES: 16, // unique ID per encrypted blob
};

// ── Challenge-Response Auth ─────────────────────────────────
const AUTH = {
  CHALLENGE_SIZE_BYTES: 32,
  CHALLENGE_EXPIRY_MS: 30_000, // 30 seconds
  NONCE_SIZE_BYTES: 24,
};

// ── Ed25519 Audit ───────────────────────────────────────────
const AUDIT = {
  SIGNATURE_BYTES: 64,
  PUBLIC_KEY_BYTES: 32,
  SECRET_KEY_BYTES: 64,
};

// ── Federation ──────────────────────────────────────────────
const FEDERATION = {
  HEARTBEAT_INTERVAL_MS: 15_000,
  PEER_TIMEOUT_MS: 45_000,
  MAX_SHARE_SIZE_BYTES: 4096,
  REQUEST_TIMEOUT_MS: 10_000,
};

module.exports = {
  VERSIONS,
  PBKDF2,
  AES,
  SHAMIR,
  SIZES,
  AUTH,
  AUDIT,
  FEDERATION,
};
