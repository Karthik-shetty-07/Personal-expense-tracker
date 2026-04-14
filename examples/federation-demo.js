/**
 * ============================================================
 *  Example: Federated Network Demo (V2)
 * ============================================================
 *  Launches 3 independent federation nodes (Express APIs), 
 *  then tests the V2 encryption flow end-to-end.
 * ============================================================
 */

"use strict";

const { startNode } = require("../backend/server");
const { encryptTransactionV2, decryptTransactionV2 } = require("../backend/crypto");

// Use globalThis.fetch available in Node 18+
// To keep it simple, we'll bypass the HTTP route in this local demo 
// and directly hit the node class instances to simulate the network!
// Let's actually spin up the HTTP servers so it is a REAL integration test!

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
    console.log("🚀 Starting Federation Network Demo...\n");

    // 1. Start 3 Nodes on different ports
    const nodes = [
        startNode({ nodeId: "node_A", port: 4001 }),
        startNode({ nodeId: "node_B", port: 4002 }),
        startNode({ nodeId: "node_C", port: 4003 })
    ];

    await sleep(1000); // give them a second to start

    console.log(`\n✅ 3 Federation Nodes Online.\n`);

    const PASSWORD = "SuperSecretFederatedPassword!2026";
    const transaction = {
        amount: 50000,
        currency: "USD",
        recipient: "acct_crypto_vault",
        timestamp: new Date().toISOString()
    };

    console.log("━━━ Original Transaction ━━━");
    console.log(transaction);
    console.log("");

    // 2. Encrypt locally (simulating client)
    console.log("🔐 Encrypting payload (AES-GCM + split DEK 3 ways)...");
    const v2Result = encryptTransactionV2(transaction, PASSWORD, 3, 2);
    
    console.log(`Blob ID: ${v2Result.blobId}`);
    console.log(`Payload Version: V${v2Result.version}`);
    console.log(`Salt: ${v2Result.salt}`);
    console.log(`Shares Created: ${v2Result.shares.length}`);
    console.log("");

    // 3. Distribute shares via HTTP
    console.log("📡 Distributing shares to nodes via HTTP...");
    const urls = ["http://localhost:4001", "http://localhost:4002", "http://localhost:4003"];
    
    for (let i = 0; i < urls.length; i++) {
        const share = v2Result.shares[i];
        const res = await globalThis.fetch(`${urls[i]}/api/shares/${v2Result.blobId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shareIndex: share.index,
                encryptedShare: share.encrypted,
                version: v2Result.version
            })
        });
        const data = await res.json();
        console.log(`  ➔ Stored Share ${share.index} on ${urls[i]} (${res.status}) [Hash: ${data.shareHash}]`);
    }
    console.log("");

    // 4. Gather K out of N shares
    console.log("📡 Retrieving 2-of-3 shares to reconstruct DEK...");
    const K = 2;
    const gatheredShares = [];
    
    // We only need to ask 2 nodes! We will skip node 4002.
    const nodesToAsk = [urls[0], urls[2]]; // nodes A and C are index 0, 2 -> shareIndex 1, 3
    const indexToAsk = [1, 3]; 
    
    for (let i=0; i < K; i++) {
        const url = nodesToAsk[i];
        const idx = indexToAsk[i];
        const res = await globalThis.fetch(`${url}/api/shares/${v2Result.blobId}/${idx}`);
        const data = await res.json();
        console.log(`  ➔ Retrieved Share ${data.shareIndex} from ${url}`);
        gatheredShares.push(data.encryptedShare);
    }
    console.log("");

    // 5. Decrypt Payload
    console.log("🔓 Reconstructing DEK and Decrypting GCM Payload...");
    try {
        const decryptedTxn = decryptTransactionV2(
            v2Result.encryptedBlob,
            gatheredShares, // only gave it 2 shares!
            PASSWORD,
            v2Result.salt
        );
        console.log("━━━ Decrypted Transaction ━━━");
        console.log(decryptedTxn);
        console.log("\n✅ Decryption SUCCESS with Threshold 2-of-3!\n");
    } catch (e) {
        console.error("❌ Decryption FAILED:", e.message);
    }

    // 6. Check Audit Logs
    console.log("📜 Checking Audit Trail on Node A...");
    const auditRes = await globalThis.fetch(`${urls[0]}/api/audit/${v2Result.blobId}`);
    const auditData = await auditRes.json();
    console.log(`Found ${auditData.entries.length} audit entries for this blob.`);
    auditData.entries.forEach(entry => {
        console.log(`  ➔ ${entry.action} at ${entry.timestamp} [Sig: ${entry.signature.slice(0,10)}...]`);
    });
    
    console.log("\n🧹 Shutting down nodes...");
    nodes.forEach(n => n.server.close());
    setTimeout(()=> process.exit(0), 500);

})();
