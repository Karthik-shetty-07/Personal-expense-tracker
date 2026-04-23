/**
 * ============================================================
 *  Federation Client
 * ============================================================
 *  Handles interacting with federation nodes, including 
 *  challenge-response authentication and distributing/gathering 
 *  encrypted Shamir shares.
 * ============================================================
 */

import CryptoJS from "crypto-js";
import { AUTH } from "../shared/constants.js";

/**
 * Fetches a challenge and responds to it using the masterKey to obtain a session/auth verification.
 * In a real scenario with proper routing, this would obtain a session token. 
 * For simplicity in our demo, we just return the headers needed for the challenge response.
 * 
 * @param {string} nodeUrl    - base URL of the node
 * @param {CryptoJS.lib.WordArray} masterKey - PBKDF2 derived master key
 * @returns {Promise<Object>} headers to use for subsequent requests
 */
export async function authenticateWithNode(nodeUrl, masterKey) {
    // 1. Get Challenge
    // Note: the nodeUrl should be complete e.g. http://localhost:3000
    const res = await fetch(`${nodeUrl}/auth/challenge`);
    if (!res.ok) throw new Error(`Node ${nodeUrl} failed to provide challenge: ${res.status}`);
    const challenge = await res.json();

    // 2. Compute HMAC response
    // HMAC-SHA256(nonce, masterKey)
    const nonce = CryptoJS.enc.Hex.parse(challenge.nonce);
    const responseHmac = CryptoJS.HmacSHA256(nonce, masterKey).toString(CryptoJS.enc.Hex);

    // 3. Return the headers that will authenticate the requests
    // Using a custom header paradigm for this demo
    return {
        "X-Challenge-Id": challenge.challengeId,
        "X-Challenge-Response": responseHmac
    };
}

/**
 * Distribute encrypted shares to a set of federation nodes.
 * 
 * @param {string} blobId - ID of the blob
 * @param {Array<{index: number, encrypted: string}>} shares - Array of encrypted shares
 * @param {Array<string>} nodeUrls - Array of node URLs (must match length of shares)
 * @param {CryptoJS.lib.WordArray} masterKey - Key for auth
 * @param {number} version - payload version
 * @returns {Promise<Array>} Results from each node
 */
export async function distributeShares(blobId, shares, nodeUrls, masterKey, version) {
    if (shares.length !== nodeUrls.length) {
        throw new Error("Number of shares must match number of nodes for distribution");
    }

    const promises = shares.map(async (share, i) => {
        const nodeUrl = nodeUrls[i];
        try {
            // In a highly optimized flow, we might cache auth tokens, but we'll do per-request for security
            // Or assume nodes don't require challenge auth for POSTs right away, but let's assume they might
            // For simplicity in our demo server, we didn't add the challenge verification middleware to the route, 
            // but we demonstrate how it *should* work if we did.
            // const authHeaders = await authenticateWithNode(nodeUrl, masterKey);

            const res = await fetch(`${nodeUrl}/api/shares/${blobId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    // ...authHeaders (omitting for smooth demo as middleware wasn't strictly applied to POST)
                },
                body: JSON.stringify({
                    shareIndex: share.index,
                    encryptedShare: share.encrypted,
                    version: version
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || res.statusText);
            }
            return await res.json();
        } catch (error) {
            console.error(`Failed to distribute share ${share.index} to ${nodeUrl}:`, error.message);
            throw error;
        }
    });

    return Promise.all(promises);
}

/**
 * Gather at least K shares from federation nodes.
 * 
 * @param {string} blobId
 * @param {Array<string>} nodeUrls
 * @param {number} k - Threshold
 * @param {CryptoJS.lib.WordArray} masterKey - Key for auth
 * @returns {Promise<Array<string>>} Array of encrypted shares (Base64)
 */
export async function gatherShares(blobId, nodeUrls, k, masterKey) {
    const gatheredShares = [];
    const errors = [];

    // Attempt to fetch from nodes concurrently up to k
    // For simplicity, we just fire to all and take the first k that succeed.
    const promises = nodeUrls.map(async (nodeUrl, index) => {
        try {
             // In a real implementation we would authenticate to GET
             // const authHeaders = await authenticateWithNode(nodeUrl, masterKey);
             
             // Share Index starts at 1, so index + 1 if nodes were strictly assigned 1:1,
             // But actually we have to ask the node what shares it has for this blob.
             // We'll assume the node was assigned shareIndex = index + 1 for this demo mapping.
             const shareIndex = index + 1; 

             const res = await fetch(`${nodeUrl}/api/shares/${blobId}/${shareIndex}`);
             if (!res.ok) throw new Error(`Node returned ${res.status}`);
             
             const data = await res.json();
             return data.encryptedShare;
        } catch (e) {
            errors.push(`${nodeUrl}: ${e.message}`);
            return null; // Failed
        }
    });

    const results = await Promise.all(promises);
    
    for (const res of results) {
        if (res) gatheredShares.push(res);
        if (gatheredShares.length >= k) break; // We have enough
    }

    if (gatheredShares.length < k) {
        throw new Error(`Failed to gather ${k} shares. Only got ${gatheredShares.length}. Errors: ${errors.join(', ')}`);
    }

    return gatheredShares;
}
