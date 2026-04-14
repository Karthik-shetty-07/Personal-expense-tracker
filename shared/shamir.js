/**
 * ============================================================
 *  Shamir's Secret Sharing over GF(256)
 * ============================================================
 *  Pure JavaScript implementation — no external dependencies.
 *
 *  splitSecret(secret, n, k)  → n shares, any k can reconstruct
 *  combineShares(shares)      → original secret
 *
 *  Operates on byte arrays. Uses irreducible polynomial
 *  x^8 + x^4 + x^3 + x + 1 (0x11B) for GF(2^8) arithmetic.
 * ============================================================
 */

"use strict";

const crypto = require("crypto");

// ── GF(256) lookup tables ───────────────────────────────────
// Irreducible polynomial: x^8 + x^4 + x^3 + x + 1 = 0x11B
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x = x ^ (x << 1); // multiply by x
    if (x & 0x100) x ^= 0x11b; // reduce modulo polynomial
  }
  // Extend exp table for easy modular lookup
  for (let i = 255; i < 512; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 255];
  }
})();

/**
 * Multiply two elements in GF(256).
 */
function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

/**
 * Multiplicative inverse in GF(256).
 */
function gfInv(a) {
  if (a === 0) throw new Error("Cannot invert zero in GF(256).");
  return EXP_TABLE[255 - LOG_TABLE[a]];
}

/**
 * Evaluate polynomial at x in GF(256) using Horner's method.
 * coeffs[0] = constant term (the secret byte).
 */
function evalPoly(coeffs, x) {
  let result = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) {
    result = gfMul(result, x) ^ coeffs[i];
  }
  return result;
}

// ── public API ──────────────────────────────────────────────

/**
 * Split a secret into n shares, requiring k to reconstruct.
 *
 * @param {Buffer|Uint8Array} secret — the bytes to split
 * @param {number}            n      — total number of shares (2–255)
 * @param {number}            k      — threshold to reconstruct (2–n)
 * @returns {Array<{x: number, y: Buffer}>} n shares
 */
function splitSecret(secret, n, k) {
  if (k < 2) throw new Error("Threshold k must be ≥ 2.");
  if (n < k) throw new Error("Total shares n must be ≥ k.");
  if (n > 255) throw new Error("Maximum 255 shares (GF(256) constraint).");
  if (!secret || secret.length === 0) throw new Error("Secret must be non-empty.");

  const secretBuf = Buffer.isBuffer(secret) ? secret : Buffer.from(secret);
  const shares = [];

  for (let i = 1; i <= n; i++) {
    shares.push({
      x: i,
      y: Buffer.alloc(secretBuf.length),
    });
  }

  // For each byte of the secret, create a random polynomial
  for (let byteIdx = 0; byteIdx < secretBuf.length; byteIdx++) {
    // coeffs[0] = secret byte, coeffs[1..k-1] = random
    const coeffs = new Uint8Array(k);
    coeffs[0] = secretBuf[byteIdx];

    // Random coefficients for degree 1..k-1
    const randomBytes = crypto.randomBytes(k - 1);
    for (let j = 1; j < k; j++) {
      coeffs[j] = randomBytes[j - 1];
    }

    // Evaluate polynomial at each share's x
    for (let s = 0; s < n; s++) {
      shares[s].y[byteIdx] = evalPoly(coeffs, shares[s].x);
    }
  }

  return shares;
}

/**
 * Reconstruct the secret from k or more shares using Lagrange interpolation.
 *
 * @param {Array<{x: number, y: Buffer}>} shares — at least k shares
 * @returns {Buffer} the original secret
 */
function combineShares(shares) {
  if (!shares || shares.length < 2) {
    throw new Error("Need at least 2 shares to reconstruct.");
  }

  // All shares must have the same y length
  const secretLen = shares[0].y.length;
  for (const s of shares) {
    if (s.y.length !== secretLen) {
      throw new Error("All shares must have the same length.");
    }
  }

  const result = Buffer.alloc(secretLen);
  const k = shares.length;

  for (let byteIdx = 0; byteIdx < secretLen; byteIdx++) {
    let secret = 0;

    for (let i = 0; i < k; i++) {
      // Lagrange basis polynomial evaluated at x=0
      let basis = 1;
      for (let j = 0; j < k; j++) {
        if (i === j) continue;
        // basis *= (0 - x_j) / (x_i - x_j)
        // In GF(256), subtraction = XOR, so (0 - x_j) = x_j
        const num = shares[j].x;
        const denom = shares[i].x ^ shares[j].x;
        basis = gfMul(basis, gfMul(num, gfInv(denom)));
      }

      secret ^= gfMul(shares[i].y[byteIdx], basis);
    }

    result[byteIdx] = secret;
  }

  return result;
}

/**
 * Serialize a share to a portable JSON-safe format.
 * @param {{x: number, y: Buffer}} share
 * @returns {{x: number, y: string}} hex-encoded share
 */
function serializeShare(share) {
  return {
    x: share.x,
    y: share.y.toString("hex"),
  };
}

/**
 * Deserialize a share from JSON format.
 * @param {{x: number, y: string}} serialized
 * @returns {{x: number, y: Buffer}}
 */
function deserializeShare(serialized) {
  return {
    x: serialized.x,
    y: Buffer.from(serialized.y, "hex"),
  };
}

module.exports = {
  splitSecret,
  combineShares,
  serializeShare,
  deserializeShare,
  // Expose for testing only
  _gfMul: gfMul,
  _gfInv: gfInv,
};
