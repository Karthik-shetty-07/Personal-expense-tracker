/**
 * ============================================================
 *  Frontend Encryption Utility — crypto.js (V2 Federated)
 * ============================================================
 *  • Generates random DEK -> encrypts data (AES-256-GCM)
 *  • Splits DEK via Shamir
 *  • Encrypts shares via masterKey
 *  • Wipes sensitive in-memory data
 * ============================================================
 */

import CryptoJS from "crypto-js";
import { VERSIONS, AES, SHAMIR } from "../shared/constants.js";
import { splitSecret, combineShares, serializeShare, deserializeShare } from "../shared/shamir.js";
import { deriveMasterKey, generateSalt, wipeKey } from "./keyring.js";
import { generateDEK, generateBlobId, envelopeEncrypt, envelopeDecrypt, detectVersion } from "../shared/envelope.js";
import { distributeShares, gatherShares } from "./federation-client.js";

// Note: To make `shared` code fully isomorphic without polyfills on the frontend,
// we map Buffer operations here. However, since the shared code uses Node `crypto` directly, 
// for the browser, we'll implement the Browser equivalent logic right here OR 
// rely on something like WebCrypto/crypto-js. 
// Since our shared/envelope.js uses Node Buffers and `crypto`, we will implement the 
// exact same cryptographic operations here using CryptoJS for true browser compatibility,
// maintaining format compatibility with the backend!

/**
 * Browser-compatible Envelope Encrypt (v2) using CryptoJS
 * 
 * Payload formats:
 *   v2: version(1B) ‖ iv(12B) ‖ authTag(16B) ‖ ciphertext
 */
function browserEnvelopeEncryptGCM(plaintextString, dekWordArray) {
    // Note: CryptoJS does NOT natively support GCM. It only supports CBC, CTR, OFB, CFB, ECB.
    // For a real production app upgrading from CBC to GCM in the browser, you'd use WebCrypto API:
    // window.crypto.subtle.encrypt({ name: "AES-GCM", ... })
    // See Open Questions in the plan regarding implementation limits.
    // For the sake of this codebase, we will simulate the format using AES-CBC + HMAC but pack it exactly 
    // like V2 if we strictly had to, OR we implement the WebCrypto bridge. 
    // Let's use WebCrypto API as it is the standard modern Browser way for GCM!
    // Since WebCrypto is async, we will make this an async function.
    throw new Error("browserEnvelopeEncryptGCM must be implemented with WebCrypto API for GCM support in browser, or backend must do it. See async implementation below.");
}

async function webCryptoEncryptGCM(plaintextString, dekUint8) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintextString);
    const iv = crypto.getRandomValues(new Uint8Array(AES.IV_SIZE_BYTES_GCM));
    
    const key = await crypto.subtle.importKey(
        "raw",
        dekUint8,
        { name: "AES-GCM" },
        false,
        ["encrypt"]
    );

    const aad = encoder.encode("transaction-v2");

    const encryptedBuffer = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv,
            additionalData: aad,
            tagLength: AES.AUTH_TAG_BYTES * 8 // in bits
        },
        key,
        data
    );

    const encryptedData = new Uint8Array(encryptedBuffer);
    
    // WebCrypto appends the auth tag at the end of the ciphertext.
    const ciphertextLen = encryptedData.length - AES.AUTH_TAG_BYTES;
    const ciphertext = encryptedData.slice(0, ciphertextLen);
    const authTag = encryptedData.slice(ciphertextLen);

    // Assemble: version(1B) + iv(12B) + authTag(16B) + ciphertext
    const payload = new Uint8Array(1 + AES.IV_SIZE_BYTES_GCM + AES.AUTH_TAG_BYTES + ciphertextLen);
    payload[0] = VERSIONS.V2_GCM_SSS;
    payload.set(iv, 1);
    payload.set(authTag, 1 + AES.IV_SIZE_BYTES_GCM);
    payload.set(ciphertext, 1 + AES.IV_SIZE_BYTES_GCM + AES.AUTH_TAG_BYTES);

    return payload; // Uint8Array
}

async function webCryptoDecryptGCM(payloadUint8, dekUint8) {
    if (payloadUint8[0] !== VERSIONS.V2_GCM_SSS) {
        throw new Error("Not a V2 payload");
    }

    const iv = payloadUint8.slice(1, 1 + AES.IV_SIZE_BYTES_GCM);
    const authTag = payloadUint8.slice(1 + AES.IV_SIZE_BYTES_GCM, 1 + AES.IV_SIZE_BYTES_GCM + AES.AUTH_TAG_BYTES);
    const ciphertext = payloadUint8.slice(1 + AES.IV_SIZE_BYTES_GCM + AES.AUTH_TAG_BYTES);

    // WebCrypto expects [ciphertext + authTag] together
    const dataToDecrypt = new Uint8Array(ciphertext.length + authTag.length);
    dataToDecrypt.set(ciphertext, 0);
    dataToDecrypt.set(authTag, ciphertext.length);

    const key = await crypto.subtle.importKey(
        "raw",
        dekUint8,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );

    const aad = new TextEncoder().encode("transaction-v2");

    const decryptedBuffer = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv,
            additionalData: aad,
            tagLength: AES.AUTH_TAG_BYTES * 8
        },
        key,
        dataToDecrypt
    );

    return new TextDecoder().decode(decryptedBuffer);
}

// Helpers for WordArray <-> Uint8Array
function wordToUint8Array(wordArray) {
    const words = wordArray.words;
    const sigBytes = wordArray.sigBytes;
    const u8 = new Uint8Array(sigBytes);
    for (let i = 0; i < sigBytes; i++) {
        const byte = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        u8[i] = byte;
    }
    return u8;
}

function uint8ToHex(u8array) {
    return Array.from(u8array).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToUint8(hexString) {
    const match = hexString.match(/.{1,2}/g);
    return new Uint8Array(match ? match.map(byte => parseInt(byte, 16)) : []);
}

function uint8ToBase64(u8array) {
    return btoa(String.fromCharCode.apply(null, u8array));
}

function base64ToUint8(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Encrypt Share utility using AES-GCM (which acts as EnvelopeEncrypt for shares)
 */
async function encryptShareBrowser(shareObj, masterKeyUint8) {
    const serialized = JSON.stringify(serializeShare(shareObj));
    const encryptedUint8 = await webCryptoEncryptGCM(serialized, masterKeyUint8);
    return uint8ToBase64(encryptedUint8);
}

async function decryptShareBrowser(encryptedB64, masterKeyUint8) {
    const encryptedUint8 = base64ToUint8(encryptedB64);
    const decryptedStr = await webCryptoDecryptGCM(encryptedUint8, masterKeyUint8);
    const parsed = JSON.parse(decryptedStr);
    return deserializeShare(parsed); // x: num, y: Buffer/Uint8
}

/**
 * Frontend V2 Federated Encrypt (Async due to WebCrypto)
 */
export async function encryptTransaction(txn, password, nodeUrls, n = SHAMIR.TOTAL_SHARES, k = SHAMIR.THRESHOLD) {
    if (typeof txn !== "object" || txn === null) throw new Error("Transaction must be a non-null object.");
    
    // 1. Key Derivation
    const saltHex = generateSalt();
    const masterKeyWord = deriveMasterKey(password, saltHex);
    const masterKeyUint8 = wordToUint8Array(masterKeyWord);

    // 2. DEK Generation
    const dekUint8 = crypto.getRandomValues(new Uint8Array(32));

    // 3. Encrypt Transaction with DEK
    const plaintextString = JSON.stringify(txn);
    const encryptedBlobUint8 = await webCryptoEncryptGCM(plaintextString, dekUint8);
    const encryptedBlobB64 = uint8ToBase64(encryptedBlobUint8);

    // 4. Shamir-split DEK
    // Note: Node Buffer maps well to Uint8Array for our shared Shamir logic
    const rawShares = splitSecret(dekUint8, n, k);

    // 5. Encrypt Shares with MasterKey
    const encryptedShares = [];
    for (const share of rawShares) {
        const enc = await encryptShareBrowser(share, masterKeyUint8);
        encryptedShares.push({ index: share.x, encrypted: enc });
    }

    // 6. Generate Blob ID
    const blobIdHex = crypto.getRandomValues(new Uint8Array(16));
    const blobId = uint8ToHex(blobIdHex);

    // 7. Distribute Shares over network
    await distributeShares(blobId, encryptedShares, nodeUrls, masterKeyWord, VERSIONS.V2_GCM_SSS);

    // Clean memory
    wipeKey(masterKeyWord);
    dekUint8.fill(0);

    return {
        blobId,
        encryptedBlob: encryptedBlobB64,
        salt: saltHex,
        version: VERSIONS.V2_GCM_SSS
    };
}

/**
 * Frontend V2 Federated Decrypt (Async)
 */
export async function decryptTransaction(blobId, encryptedBlobB64, password, saltHex, nodeUrls, k = SHAMIR.THRESHOLD) {
    // 1. Key Derivation
    const masterKeyWord = deriveMasterKey(password, saltHex);
    const masterKeyUint8 = wordToUint8Array(masterKeyWord);

    // 2. Gather Shares
    const encryptedSharesList = await gatherShares(blobId, nodeUrls, k, masterKeyWord);

    // 3. Decrypt Shares
    const rawShares = [];
    for (const encShare of encryptedSharesList) {
        rawShares.push(await decryptShareBrowser(encShare, masterKeyUint8));
    }

    // 4. Combine Shares to get DEK
    const dekUint8 = combineShares(rawShares); // Returns Uint8Array / Buffer

    // 5. Decrypt Blob
    const blobUint8 = base64ToUint8(encryptedBlobB64);
    const jsonStr = await webCryptoDecryptGCM(blobUint8, dekUint8);

    const transaction = JSON.parse(jsonStr);

    // Clean memory
    wipeKey(masterKeyWord);
    dekUint8.fill(0); // works if its Uint8Array or Buffer

    return transaction;
}
