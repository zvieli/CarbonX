import hre from "hardhat";
import { network } from "hardhat";

async function main() {
  // אנחנו מתחברים ל-localhost כדי לראות את הלוגים בטרמינל השני
  // Make `ethers` usage robust: if `hre.ethers` is undefined (plugin not injected),
  // fall back to using the provider and `provider.getSigner(addr)`.
  let ethers = hre.ethers;
  let provider = hre.ethers?.provider;

  // Hardhat 3 support: try to connect if ethers is missing
  if (!ethers && network && typeof network.connect === 'function') {
    try {
        console.log("Attempting Hardhat 3 network connection...");
        const connected = await network.connect();
        if (connected.ethers) {
            ethers = connected.ethers;
            provider = connected.ethers.provider;
            console.log("Hardhat 3 connection successful.");
        }
    } catch (e) {
        console.log("Hardhat 3 connection attempt failed:", e.message);
    }
  }

  let rpc;
  if (!ethers) {
    // Try dynamically importing the Hardhat runtime again
    try {
      const hardhat = await import("hardhat");
      ethers = hardhat.ethers;
      provider = hardhat.ethers?.provider;
    } catch (e) {
      ethers = undefined;
    }
  }

  let sender, receiver;
  if (ethers && ethers.getSigners) {
    [sender, receiver] = await ethers.getSigners();
  } else {
    // Fallback: use the Hardhat network provider RPC directly (eth_accounts, eth_sendTransaction)
    // Use direct JSON-RPC over HTTP as a robust fallback (works for localhost node)
    const rpcUrl = (hre.network && hre.network.config && hre.network.config.url) || process.env.RPC_URL || "http://127.0.0.1:8545";
    rpc = async (method, params = []) => {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j.result;
    };

    const accounts = await rpc("eth_accounts", []);
    if (!accounts || accounts.length < 2) throw new Error("Not enough accounts available from provider (eth_accounts returned none)");
    const senderAddress = accounts[0];
    const receiverAddress = accounts[1];

    // Minimal signer-like wrappers with `address` and `sendTransaction`
    sender = {
      address: senderAddress,
      sendTransaction: async (tx) => {
        const params = [{ from: senderAddress, to: tx.to, value: tx.value }];
        const txHash = await rpc("eth_sendTransaction", params);
        return { hash: txHash, wait: async () => {
          // poll for receipt
          while (true) {
            const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
            if (receipt) return receipt;
            await new Promise((r) => setTimeout(r, 500));
          }
        }};
      }
    };

    receiver = { address: receiverAddress };
  }

  console.log("\n--- Sanity Check: ETH Transfer ---");
  
  // Get and print current block number
  let currentBlock;
  if (ethers && ethers.provider) {
    currentBlock = await ethers.provider.getBlockNumber();
  } else {
    const bnHex = await rpc("eth_blockNumber", []);
    currentBlock = parseInt(bnHex, 16);
  }
  console.log("Current Block Number:", currentBlock);

  // Check Mainnet Whale Balance (Beacon Deposit Contract)
  const whaleAddr = "0x00000000219ab540356cBB839Cbe05303d7705Fa";
  console.log("Checking Whale Balance:", whaleAddr);
  let whaleBal;
  // Define getBalance early for use here
  const _getBalance = async (addr) => {
    if (ethers && ethers.provider) return ethers.provider.getBalance(addr);
    const hex = await rpc("eth_getBalance", [addr, "latest"]);
    return BigInt(hex);
  };
  whaleBal = await _getBalance(whaleAddr);
  console.log("Whale Balance (Wei):", whaleBal.toString());

  console.log("Sender:", sender.address);
  console.log("Receiver:", receiver.address);

  // בדיקת יתרה לפני
  async function getBalance(addr) {
    if (ethers && ethers.provider) return ethers.provider.getBalance(addr);
    const hex = await rpc("eth_getBalance", [addr, "latest"]);
    return BigInt(hex);
  }

  function formatEther(bn) {
    if (ethers && ethers.formatEther) return ethers.formatEther(bn);
    // bn may be BigInt or hex string
    const n = typeof bn === "bigint" ? bn : BigInt(bn);
    const asStr = n.toString();
    // naive decimal division
    const whole = asStr.slice(0, -18) || "0";
    const frac = asStr.slice(-18).padStart(18, "0");
    // trim trailing zeros
    return whole + "." + frac.replace(/0+$/, "") || whole;
  }

  function parseEtherStr(amountStr) {
    if (ethers && ethers.parseEther) return ethers.parseEther(amountStr);
    // return hex string of wei
    const parts = amountStr.split(".");
    const whole = BigInt(parts[0] || "0");
    const frac = (parts[1] || "").padEnd(18, "0").slice(0, 18);
    const wei = whole * 1000000000000000000n + BigInt(frac);
    return '0x' + wei.toString(16);
  }

  const beforeBalance = await getBalance(receiver.address);
  console.log("Receiver Balance Before:", formatEther(beforeBalance), "ETH");

  console.log("\n🚀 Sending 1 ETH...");
  
  // שליחת הטרנזקציה
  const value = ethers && ethers.parseEther ? ethers.parseEther("1.0") : parseEtherStr("1.0");
  const tx = await sender.sendTransaction({
    to: receiver.address,
    value,
  });

  // מחכים שהטרנזקציה תיכנס לבלוק
  await tx.wait();

  // בדיקת יתרה אחרי
  const afterBalance = await getBalance(receiver.address);
  console.log("Receiver Balance After:", formatEther(afterBalance), "ETH");
  console.log("-----------------------------------\n");
}

main().catch(console.error);