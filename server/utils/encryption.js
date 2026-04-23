const CryptoJS = require('crypto-js');

const PBKDF2_ITERATIONS = 310_000;
const KEY_SIZE_BITS = 256;
const KEY_SIZE_WORDS = KEY_SIZE_BITS / 32;
const SALT_SIZE_WORDS = 128 / 32;
const IV_SIZE_WORDS = 128 / 32;

function deriveKeys(password, salt) {
  const derived = CryptoJS.PBKDF2(password, salt, {
    keySize: KEY_SIZE_WORDS * 2,
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

function safeCompare(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function decrypt(payloadB64, password) {
  if (!payloadB64 || !password) {
    throw new Error("Both payload and password are required.");
  }

  const payload = CryptoJS.enc.Base64.parse(payloadB64);
  const words = payload.words;
  const totalBytes = payload.sigBytes;

  if (totalBytes < 80) {
    throw new Error("Payload too short — possibly corrupted.");
  }

  const saltWords = words.slice(0, SALT_SIZE_WORDS);
  const ivWords = words.slice(SALT_SIZE_WORDS, SALT_SIZE_WORDS + IV_SIZE_WORDS);
  const hmacWords = words.slice(-8);
  const cipherWords = words.slice(
    SALT_SIZE_WORDS + IV_SIZE_WORDS,
    words.length - 8
  );

  const salt = CryptoJS.lib.WordArray.create(saltWords, 16);
  const iv = CryptoJS.lib.WordArray.create(ivWords, 16);
  const hmac = CryptoJS.lib.WordArray.create(hmacWords, 32);
  const ciphertextBytes = totalBytes - 16 - 16 - 32;
  const ciphertext = CryptoJS.lib.WordArray.create(cipherWords, ciphertextBytes);

  const { encKey, macKey } = deriveKeys(password, salt);

  const dataToMac = salt.concat(iv).concat(ciphertext);
  const expectedHmac = CryptoJS.HmacSHA256(dataToMac, macKey);

  if (!safeCompare(hmac.toString(), expectedHmac.toString())) {
    throw new Error("HMAC verification failed");
  }

  const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext });
  const decrypted = CryptoJS.AES.decrypt(cipherParams, encKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const result = decrypted.toString(CryptoJS.enc.Utf8);
  if (!result) {
    throw new Error("Decryption produced empty output");
  }

  return result;
}

module.exports = {
  decrypt,
  decryptTransaction: (payloadB64, password) => JSON.parse(decrypt(payloadB64, password))
};
