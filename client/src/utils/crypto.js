/**
 * ============================================================
 *  Frontend Encryption Utility — crypto.js
 * ============================================================
 *  AES-256-CBC  |  PBKDF2 key derivation  |  HMAC-SHA256
 *
 *  • Every encryption produces a fresh random IV.
 *  • A separate HMAC key is derived so the ciphertext is
 *    authenticated (encrypt-then-MAC).
 *  • The raw password is never stored; derived keys live only
 *    in closure scope and are discarded after each call.
 * ============================================================
 */

import CryptoJS from "crypto-js";

// ── tunables ────────────────────────────────────────────────
const PBKDF2_ITERATIONS = 310_000; // OWASP 2023 recommendation
const KEY_SIZE_BITS = 256;
const KEY_SIZE_WORDS = KEY_SIZE_BITS / 32; // 8 words = 32 bytes
const IV_SIZE_WORDS = 128 / 32; // AES block = 16 bytes
const SALT_SIZE_WORDS = 128 / 32; // 16 bytes

// ── helpers ─────────────────────────────────────────────────

/**
 * Derive two independent keys from (password, salt):
 *   • encKey  → used for AES-256-CBC
 *   • macKey  → used for HMAC-SHA256
 */
function deriveKeys(password, salt) {
  // Derive 64 bytes total, then split
  const derived = CryptoJS.PBKDF2(password, salt, {
    keySize: KEY_SIZE_WORDS * 2, // 64 bytes → two 32-byte keys
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });

  const encKey = CryptoJS.lib.WordArray.create(
    derived.words.slice(0, KEY_SIZE_WORDS),
    KEY_SIZE_BITS / 8
  );
  const macKey = CryptoJS.lib.WordArray.create(
    derived.words.slice(KEY_SIZE_WORDS),
    KEY_SIZE_BITS / 8
  );

  return { encKey, macKey };
}

/**
 * Constant-time comparison (mitigates timing side-channels).
 * Both arguments are hex strings.
 */
function safeCompare(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ── public API ──────────────────────────────────────────────

/**
 * Encrypt a plain-text string.
 *
 * @param {string}  plaintext  – the data to protect
 * @param {string}  password   – user-supplied password
 * @returns {string} Base-64 encoded payload  (salt‖iv‖ciphertext‖hmac)
 */
export function encrypt(plaintext, password) {
  if (!plaintext || !password) {
    throw new Error("Both plaintext and password are required.");
  }

  // 1. Random salt + IV
  const salt = CryptoJS.lib.WordArray.random(SALT_SIZE_WORDS * 4);
  const iv = CryptoJS.lib.WordArray.random(IV_SIZE_WORDS * 4);

  // 2. Derive enc + mac keys
  const { encKey, macKey } = deriveKeys(password, salt);

  // 3. AES-256-CBC encrypt
  const ciphertext = CryptoJS.AES.encrypt(plaintext, encKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  // 4. HMAC over (salt ‖ iv ‖ ciphertext)
  const dataToMac = salt
    .concat(iv)
    .concat(ciphertext.ciphertext);
  const hmac = CryptoJS.HmacSHA256(dataToMac, macKey);

  // 5. Assemble:  salt (16 B) + iv (16 B) + ciphertext + hmac (32 B)
  const payload = salt
    .concat(iv)
    .concat(ciphertext.ciphertext)
    .concat(hmac);

  return CryptoJS.enc.Base64.stringify(payload);
}

/**
 * Decrypt a payload produced by `encrypt()`.
 *
 * @param {string}  payloadB64  – Base-64 encoded payload
 * @param {string}  password    – the same password used to encrypt
 * @returns {string} original plaintext
 * @throws {Error}  on tampered / incorrect password
 */
export function decrypt(payloadB64, password) {
  if (!payloadB64 || !password) {
    throw new Error("Both payload and password are required.");
  }

  const payload = CryptoJS.enc.Base64.parse(payloadB64);
  const words = payload.words;
  const totalBytes = payload.sigBytes;

  // Minimum: salt(16) + iv(16) + cipher(≥16) + hmac(32) = 80
  if (totalBytes < 80) {
    throw new Error("Payload too short — possibly corrupted.");
  }

  // ── split ───────────────────────────────────────────────
  const saltWords = words.slice(0, SALT_SIZE_WORDS);
  const ivWords = words.slice(SALT_SIZE_WORDS, SALT_SIZE_WORDS + IV_SIZE_WORDS);
  const hmacWords = words.slice(-8); // last 32 bytes = 8 words
  const cipherWords = words.slice(
    SALT_SIZE_WORDS + IV_SIZE_WORDS,
    words.length - 8
  );

  const salt = CryptoJS.lib.WordArray.create(saltWords, 16);
  const iv = CryptoJS.lib.WordArray.create(ivWords, 16);
  const hmac = CryptoJS.lib.WordArray.create(hmacWords, 32);
  const ciphertextBytes =
    totalBytes - 16 /* salt */ - 16 /* iv */ - 32; /* hmac */
  const ciphertext = CryptoJS.lib.WordArray.create(
    cipherWords,
    ciphertextBytes
  );

  // ── derive keys ─────────────────────────────────────────
  const { encKey, macKey } = deriveKeys(password, salt);

  // ── verify HMAC (encrypt-then-MAC) ──────────────────────
  const dataToMac = salt.concat(iv).concat(ciphertext);
  const expectedHmac = CryptoJS.HmacSHA256(dataToMac, macKey);

  if (!safeCompare(hmac.toString(), expectedHmac.toString())) {
    throw new Error(
      "HMAC verification failed — data may be tampered or password is wrong."
    );
  }

  // ── decrypt ─────────────────────────────────────────────
  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext,
  });

  const decrypted = CryptoJS.AES.decrypt(cipherParams, encKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const result = decrypted.toString(CryptoJS.enc.Utf8);
  if (!result) {
    throw new Error("Decryption produced empty output — wrong password?");
  }

  return result;
}

/**
 * Convenience: encrypt a transaction object → Base-64 string.
 *
 * @param {Object}  txn       – e.g. { amount, to, memo, … }
 * @param {string}  password  – user password
 * @returns {string}
 */
export function encryptTransaction(txn, password) {
  if (typeof txn !== "object" || txn === null) {
    throw new Error("Transaction must be a non-null object.");
  }
  return encrypt(JSON.stringify(txn), password);
}

/**
 * Convenience: decrypt a Base-64 payload → transaction object.
 */
export function decryptTransaction(payloadB64, password) {
  const json = decrypt(payloadB64, password);
  try {
    return JSON.parse(json);
  } catch {
    throw new Error("Decrypted data is not valid JSON.");
  }
}
