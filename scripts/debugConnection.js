
import { ethers } from "ethers";

async function main() {
    const rpcUrl = "https://eth-mainnet.g.alchemy.com/v2/C71xjjRnVc5bmInmm-AQ3";
    console.log("Checking RPC connectivity to:", rpcUrl);

    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const blockNumber = await provider.getBlockNumber();
        console.log("✅ Success! Current Mainnet Block:", blockNumber);
    } catch (error) {
        console.error("❌ Failed to connect to Alchemy:", error.message);
    }
}

main();
