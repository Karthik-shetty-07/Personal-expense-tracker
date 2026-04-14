/**
 * ============================================================
 *  Example: Frontend sending encrypted transaction via fetch
 * ============================================================
 *  This file shows how a browser app would use the frontend
 *  crypto.js module to encrypt a transaction before POSTing
 *  it to the backend.
 *
 *  Import: <script type="module" src="client-example.js">
 * ============================================================
 */

import { encryptTransaction } from "../frontend/crypto.js";

const API_URL = "http://localhost:3000/api/transactions";
const AUTH_TOKEN = "demo_token_alice"; // from login flow

/**
 * Send an encrypted transaction to the backend.
 *
 * @param {Object}  txn       – { amount, currency, recipient, memo? }
 * @param {string}  password  – user's password (never sent in cleartext)
 */
async function sendSecureTransaction(txn, password) {
  // ── 1. Encrypt client-side ────────────────────────────
  const encryptedPayload = encryptTransaction(txn, password);

  // ── 2. Send only the encrypted blob ───────────────────
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Token": AUTH_TOKEN,
    },
    body: JSON.stringify({ encryptedPayload }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ── Demo usage ──────────────────────────────────────────────
(async () => {
  try {
    const result = await sendSecureTransaction(
      {
        amount: 500.0,
        currency: "USD",
        recipient: "acct_abc123",
        memo: "Monthly subscription",
      },
      "S3cur3Pa$$w0rd!2026"
    );

    console.log("✅ Server response:", result);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();
