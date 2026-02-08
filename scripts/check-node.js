import hre from "hardhat";

async function main() {
  const { ethers } = hre;
  console.log("Connecting to http://127.0.0.1:8545...");
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

  const network = await provider.getNetwork();
  console.log(`Chain ID: ${network.chainId}`);

  const ecoNFTAddress = "0x2a75a9AfF7d909002fc458b765CB92F47350464B";
  const code = await provider.getCode(ecoNFTAddress);
  console.log(`Code at ${ecoNFTAddress}: ${code.slice(0, 50)}... (Length: ${code.length})`);

  const blockNumber = await provider.getBlockNumber();
  console.log(`Current Block Number: ${blockNumber}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
