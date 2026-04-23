/**
 * ============================================================
 *  Challenge-Response Authentication
 * ============================================================
 *  Nonce-based challenge-response using HMAC-SHA256.
 *  Prevents replay attacks — challenges expire after 30 s.
 *
 *  Flow:
 *    1. Client requests a challenge  →  GET /auth/challenge
 *    2. Server returns { challengeId, nonce, expiresAt }
 *    3. Client signs:  HMAC-SHA256(nonce, masterKey)
 *    4. Client sends { challengeId, response }
 *    5. Server verifies and issues short-lived session token
 * ============================================================
 */

"use strict";

const crypto = require("crypto");
const { AUTH } = require("../shared/constants");

// In-memory challenge store (per-node). Keyed by challengeId.
const pendingChallenges = new Map();

// Cleanup expired challenges every 60 s
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of pendingChallenges) {
    if (now > c.expiresAt) pendingChallenges.delete(id);
  }
}, 60_000).unref();

/**
 * Generate a fresh challenge for the client.
 *
 * @returns {{ challengeId: string, nonce: string, expiresAt: number }}
 */
function generateChallenge() {
  const challengeId = crypto.randomBytes(16).toString("hex");
  const nonce = crypto.randomBytes(AUTH.CHALLENGE_SIZE_BYTES).toString("hex");
  const expiresAt = Date.now() + AUTH.CHALLENGE_EXPIRY_MS;

  pendingChallenges.set(challengeId, { nonce, expiresAt, used: false });

  return { challengeId, nonce, expiresAt };
}

/**
 * Verify a client's response to a challenge.
 *
 * The client should compute: HMAC-SHA256(nonce, derivedKey)
 * and send it as `response` (hex string).
 *
 * @param {string} challengeId
 * @param {string} response       — hex-encoded HMAC
 * @param {Buffer} derivedKey     — the user's PBKDF2-derived master key
 * @returns {boolean}
 */
function verifyResponse(challengeId, response, derivedKey) {
  const challenge = pendingChallenges.get(challengeId);

  if (!challenge) return false;
  if (challenge.used) return false;
  if (Date.now() > challenge.expiresAt) {
    pendingChallenges.delete(challengeId);
    return false;
  }

  // Mark as used immediately (one-time use)
  challenge.used = true;
  pendingChallenges.delete(challengeId);

  // Compute expected HMAC
  const expected = crypto
    .createHmac("sha256", derivedKey)
    .update(Buffer.from(challenge.nonce, "hex"))
    .digest("hex");

  // Constant-time comparison
  if (response.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(response, "hex"),
    Buffer.from(expected, "hex")
  );
}

/**
 * Generate a short-lived session token after successful auth.
 *
 * @param {string} userId
 * @param {number} [ttlMs=300000] — 5 minutes default
 * @returns {{ token: string, expiresAt: number }}
 */
function issueSessionToken(userId, ttlMs = 300_000) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + ttlMs;
  return { token, userId, expiresAt };
}

module.exports = {
  generateChallenge,
  verifyResponse,
  issueSessionToken,
};
