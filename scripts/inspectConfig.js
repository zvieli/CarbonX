
import hre from "hardhat";

async function main() {
    const replacer = (key, value) =>
        typeof value === 'bigint' ? value.toString() : value;

    console.log("Network Config:", JSON.stringify(hre.config.networks.hardhat, replacer, 2));
    
    // Check if forking is enabled in the runtime network object
    if (hre.network.config.forking) {
        console.log("Forking Config Found:", hre.network.config.forking);
    } else {
        console.log("No forking config found in hre.network.config");
    }
}

main();
