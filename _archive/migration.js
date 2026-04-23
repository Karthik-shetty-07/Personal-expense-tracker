/**
 * ============================================================
 *  V1 → V2 Migration Utility
 * ============================================================
 *  Re-encrypts v1 (CBC+HMAC) payloads into v2 (GCM+Shamir)
 *  format and distributes shares to federation nodes.
 *
 *  Migration flow:
 *    1. Decrypt v1 payload with user password
 *    2. Re-encrypt as v2 with envelope + Shamir
 *    3. Distribute shares to federation nodes
 *    4. Return new v2 blob + metadata
 *    5. Old v1 payload can then be archived/deleted
 * ============================================================
 */

"use strict";

const { decryptV1Legacy } = require("../shared/envelope");
const { encryptTransactionV2 } = require("./crypto");
const { SHAMIR } = require("../shared/constants");

/**
 * Migrate a single v1 payload to v2.
 *
 * @param {string}  v1PayloadB64  — Base64 v1 encrypted payload
 * @param {string}  password      — user's password (same as used for v1)
 * @param {number}  [n]           — total shares (default from constants)
 * @param {number}  [k]           — threshold (default from constants)
 * @returns {Object} v2 encryption result
 */
function migrateV1ToV2(v1PayloadB64, password, n = SHAMIR.TOTAL_SHARES, k = SHAMIR.THRESHOLD) {
  // 1. Decrypt v1
  const plaintext = decryptV1Legacy(v1PayloadB64, password);

  let transaction;
  try {
    transaction = JSON.parse(plaintext);
  } catch {
    throw new Error("V1 payload did not contain valid JSON.");
  }

  // 2. Re-encrypt as v2
  const v2Result = encryptTransactionV2(transaction, password, n, k);

  return {
    ...v2Result,
    migrated: true,
    migratedAt: new Date().toISOString(),
    originalFormat: "v1-cbc-hmac",
  };
}

/**
 * Batch migrate multiple v1 payloads.
 *
 * @param {Array<{id: string, payload: string}>} items
 * @param {string} password
 * @returns {Array<{id: string, result?: Object, error?: string}>}
 */
function batchMigrateV1ToV2(items, password) {
  return items.map(({ id, payload }) => {
    try {
      const result = migrateV1ToV2(payload, password);
      return { id, result };
    } catch (err) {
      return { id, error: err.message };
    }
  });
}

/**
 * Generate a migration report.
 *
 * @param {Array} results — output of batchMigrateV1ToV2
 * @returns {Object}
 */
function migrationReport(results) {
  const succeeded = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);

  return {
    total: results.length,
    succeeded: succeeded.length,
    failed: failed.length,
    failures: failed.map((f) => ({ id: f.id, error: f.error })),
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  migrateV1ToV2,
  batchMigrateV1ToV2,
  migrationReport,
};
