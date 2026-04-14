/**
 * ============================================================
 *  Frontend Keyring Utility
 * ============================================================
 *  Manages derivation of master key and safe-wiping of keys 
 *  from memory. Note: in JS, absolute memory wiping is tough 
 *  due to GC, but overwriting TypedArrays is effective.
 * ============================================================
 */

import CryptoJS from "crypto-js";
import { PBKDF2, SIZES } from "../shared/constants.js";

/**
 * Derive master key from password and salt.
 * 
 * @param {string} password 
 * @param {string} saltHex  - hex encoded salt
 * @returns {CryptoJS.lib.WordArray} 32-byte master key
 */
export function deriveMasterKey(password, saltHex) {
  const salt = CryptoJS.enc.Hex.parse(saltHex);
  
  const derived = CryptoJS.PBKDF2(password, salt, {
    keySize: PBKDF2.KEY_SIZE_BYTES / 4, // in 32-bit words (32 / 4 = 8)
    iterations: PBKDF2.V2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });

  return derived;
}

/**
 * Generate a random salt for new encryptions.
 * @returns {string} hex encoded 16-byte salt
 */
export function generateSalt() {
  const words = SIZES.SALT_BYTES / 4; 
  return CryptoJS.lib.WordArray.random(words * 4).toString(CryptoJS.enc.Hex);
}

/**
 * Attempt to zero out a WordArray in memory.
 * 
 * @param {CryptoJS.lib.WordArray} wordArray 
 */
export function wipeKey(wordArray) {
  if (wordArray && wordArray.words) {
    for (let i = 0; i < wordArray.words.length; i++) {
        wordArray.words[i] = 0;
    }
  }
}
