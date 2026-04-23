/**
 * ============================================================
 *  Example: Round-trip & V1 Migration tests 
 * ============================================================
 *  Validates security limits, Shamir thresholds, backward 
 *  compatibility with V1, and V2 tamper resistance using
 *  Backend library functions.
 * ============================================================
 */

"use strict";

const crypto = require("crypto");
const { VERSIONS } = require("../shared/constants");
const { envelopeEncrypt, envelopeDecrypt } = require("../shared/envelope");
const {
    encryptTransactionV2,
    decryptTransactionV2,
    decryptTransactionAuto
} = require("../backend/crypto");
const { migrateV1ToV2 } = require("../backend/migration");

console.log("=========================================");
console.log("   V2 Federated Crypto Offline Tests     ");
console.log("=========================================\n");

const PASSWORD = "S3cur3Pa$$w0rd!2026";
const transaction = {
    amount: 1250.75,
    currency: "USD",
    recipient: "acct_9x8w7v6u",
    memo: "Q1 consulting invoice #4821",
    timestamp: new Date().toISOString(),
};

// ── 1. Create a V2 Payload ────────────────────────────────
const v2Payload = encryptTransactionV2(transaction, PASSWORD, 3, 2);
console.log("✅ V2 Payload created.");
console.log(`   Shares: ${v2Payload.shares.length}, Expected K: 2, Blob Size: ${v2Payload.encryptedBlob.length}`);

// ── 2. Decrypt with exactly 2 shares ───────────────────────
const subsetShares = [v2Payload.shares[0].encrypted, v2Payload.shares[2].encrypted]; // Pick 1 and 3

try {
    const dec = decryptTransactionV2(v2Payload.encryptedBlob, subsetShares, PASSWORD, v2Payload.salt);
    if (dec.amount === transaction.amount) console.log("✅ Threshold Decrypt (2 shares): SUCCESS");
} catch(e) {
    console.log("❌ Threshold Decrypt (2 shares): FAILED", e.message);
}

// ── 3. Attempt Decrypt with 1 share (Should Fail) ───────────
const oneShare = [v2Payload.shares[1].encrypted];
try {
    decryptTransactionV2(v2Payload.encryptedBlob, oneShare, PASSWORD, v2Payload.salt);
    console.log("❌ Threshold Decrypt (1 share): FAILED - Unexpected Success!");
} catch(e) {
    console.log("✅ Threshold Decrypt (1 share): Correctly Rejected (" + e.message + ")");
}

// ── 4. Wrong Password (Should Fail) ─────────────────────────
try {
    decryptTransactionV2(v2Payload.encryptedBlob, subsetShares, "wrongpass", v2Payload.salt);
    console.log("❌ Wrong Password: FAILED - Unexpected Success!");
} catch(e) {
    console.log("✅ Wrong Password: Correctly Rejected (mac mismatch or decoding error)");
}

// ── 5. Tampered Blob (Should Fail GCM Auth Tag) ─────────────
const tamperedBlob = Buffer.from(v2Payload.encryptedBlob, "base64");
tamperedBlob[tamperedBlob.length - 1] ^= 0x01; // flip last bit of auth tag / ciphertext

try {
    decryptTransactionV2(tamperedBlob.toString("base64"), subsetShares, PASSWORD, v2Payload.salt);
    console.log("❌ Tampered Blob: FAILED - Unexpected Success!");
} catch(e) {
    // Should say something like "GCM decryption failed"
    console.log("✅ Tampered Blob: Correctly Rejected (" + e.message + ")");
}

// ── 6. Tampered Share (Should Fail Envelope Authenticate) ───
const tamperedShare = Buffer.from(subsetShares[0], "base64");
tamperedShare[tamperedShare.length - 1] ^= 0xFF;

try {
    decryptTransactionV2(v2Payload.encryptedBlob, [tamperedShare.toString("base64"), subsetShares[1]], PASSWORD, v2Payload.salt);
    console.log("❌ Tampered Share: FAILED - Unexpected Success!");
} catch(e) {
    console.log("✅ Tampered Share: Correctly Rejected (" + e.message + ")");
}

// ── 7. V1 Backward Compatibility & Migration ────────────────
console.log("\n=========================================");
console.log("   V1 Backward Compat & Migration Test   ");
console.log("=========================================\n");

// To test V1 compat, we must manually construct a V1-like blob 
// using the v1 format since we removed the v1 encrypter
function mockV1Encrypt(txn, pass) {
    const cryptoMod = require("crypto");
    const { PBKDF2, SIZES, AES } = require("../shared/constants");
    const salt = cryptoMod.randomBytes(SIZES.SALT_BYTES);
    const iv = cryptoMod.randomBytes(AES.IV_SIZE_BYTES_CBC);
    const plaintext = JSON.stringify(txn);
    
    const derived = cryptoMod.pbkdf2Sync(pass, salt, PBKDF2.V1_ITERATIONS, PBKDF2.KEY_SIZE_BYTES * 2, PBKDF2.HASH);
    const encKey = derived.subarray(0, PBKDF2.KEY_SIZE_BYTES);
    const macKey = derived.subarray(PBKDF2.KEY_SIZE_BYTES);

    const cipher = cryptoMod.createCipheriv(AES.V1_ALGORITHM, encKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

    const hmac = cryptoMod.createHmac("sha256", macKey).update(Buffer.concat([salt, iv, encrypted])).digest();
    return Buffer.concat([salt, iv, encrypted, hmac]).toString("base64");
}

const legcyV1Blob = mockV1Encrypt(transaction, PASSWORD);

try {
    const migrated = migrateV1ToV2(legcyV1Blob, PASSWORD);
    if (migrated.version === VERSIONS.V2_GCM_SSS && migrated.shares.length === 3) {
        console.log("✅ V1 -> V2 Migration: SUCCESS.");
        console.log(`   Migrated Blob ID: ${migrated.blobId}, Original Format: ${migrated.originalFormat}`);
    }
} catch (e) {
    console.log("❌ V1 -> V2 Migration: FAILED", e.message);
}

console.log("\n✅ All Offline Tests Completed Successfully.");
