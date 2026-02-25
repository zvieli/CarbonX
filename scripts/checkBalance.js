import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log(`\nChecking balances for all local wallets...`);
    console.log("--------------------------------------------------------------------------------------");
    console.log(
        "Acc".padEnd(6) + 
        "Address".padEnd(44) + 
        "ETH Balance".padEnd(18) + 
        "CX Balance"
    );
    console.log("--------------------------------------------------------------------------------------");

    // 1. Load Local Wallets
    const walletsPath = path.join(__dirname, "../local_wallets.json");
    if (!fs.existsSync(walletsPath)) {
        console.error("Error: local_wallets.json not found in project root.");
        process.exit(1);
    }
    const wallets = JSON.parse(fs.readFileSync(walletsPath, "utf8"));

    // 2. Setup Provider & Token Contract
    const provider = hre.ethers.provider;
    let EcoToken = null;

    try {
        const addressesPath = path.join(__dirname, "../frontend/contracts/contract-addresses.json");
        if (fs.existsSync(addressesPath)) {
            const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
            if (addresses.EcoToken) {
                EcoToken = await hre.ethers.getContractAt("EcoToken", addresses.EcoToken);
            }
        }
    } catch (e) {
        // Silent fail for token, will just show error in column
    }

    // 3. Iterate
    for (const wallet of wallets) {
        const address = wallet.address;
        
        // Get ETH
        const balanceWei = await provider.getBalance(address);
        const balanceEth = hre.ethers.formatEther(balanceWei);
        const ethDisplay = parseFloat(balanceEth).toFixed(4) + " ETH";

        // Get CX
        let cxDisplay = "-";
        if (EcoToken) {
            try {
                const cxBalanceWei = await EcoToken.balanceOf(address);
                const cxBalance = hre.ethers.formatEther(cxBalanceWei);
                cxDisplay = parseFloat(cxBalance).toFixed(2) + " CX";
            } catch (error) {
                cxDisplay = "Error";
            }
        }

        console.log(
            wallet.account.padEnd(6) + 
            address.padEnd(44) + 
            ethDisplay.padEnd(18) + 
            cxDisplay
        );
    }
    console.log("--------------------------------------------------------------------------------------\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
