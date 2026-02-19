import hre from "hardhat";
const { ethers } = hre;
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Uniswap V3 Artifacts
const ARTIFACTS = {
  UniswapV3Factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  NonfungiblePositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
};

const encodePriceSqrt = (reserve1, reserve0) => {
  return BigInt(
    Math.floor(Math.sqrt(Number(reserve1) / Number(reserve0)) * 2 ** 96)
  ).toString();
};

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("🚀 Deploying specific DeFi environment with account:", deployer.address);

    const contractsDir = path.join(__dirname, "..", "frontend", "contracts");
    if (!fs.existsSync(contractsDir)) {
        fs.mkdirSync(contractsDir, { recursive: true });
    }

    const saveFrontendFiles = async (addresses) => {
        fs.writeFileSync(
            path.join(contractsDir, "contract-addresses.json"),
            JSON.stringify(addresses, null, 2)
        );

        // Save ABIs
        const contractNames = ["EcoNFT", "EcoToken", "EcoMarketplace"];
        for (const name of contractNames) {
            const artifact = await hre.artifacts.readArtifact(name);
            fs.writeFileSync(
                path.join(contractsDir, `${name}.json`),
                JSON.stringify(artifact, null, 2)
            );
        }
        console.log("Contracts saved to frontend/contracts");
    };

    // 1. Deploy EcoNFT
    const EcoNFT = await ethers.getContractFactory("EcoNFT");
    const ecoNFT = await EcoNFT.deploy();
    await ecoNFT.waitForDeployment();
    const ecoNFTAddress = await ecoNFT.getAddress();
    console.log("✅ EcoNFT deployed to:", ecoNFTAddress);

    // 2. Deploy EcoToken (ERC20)
    const EcoToken = await ethers.getContractFactory("EcoToken");
    const ecoToken = await EcoToken.deploy();
    await ecoToken.waitForDeployment();
    const ecoTokenAddress = await ecoToken.getAddress();
    console.log("✅ EcoToken deployed to:", ecoTokenAddress);

    // 3. Create Uniswap V3 Pool (WETH / EcoToken) - Concentrated Liquidity
    console.log("🌊 Creating Concentrated Liquidity Pool...");
    
    // Sort tokens strictly by address (Uniswap Requirement)
    const token0 = BigInt(ARTIFACTS.WETH) < BigInt(ecoTokenAddress) ? ARTIFACTS.WETH : ecoTokenAddress;
    const token1 = BigInt(ARTIFACTS.WETH) < BigInt(ecoTokenAddress) ? ecoTokenAddress : ARTIFACTS.WETH;
    const fee = 3000; // 0.3%

    // Calculate initial price and ticks based on token ordering
    let sqrtPriceX96;
    let tickLower, tickUpper;

    // We proceed assuming WETH is approximately 2500 ECO
    // If token0 is WETH, price is ~2500 ECO per WETH (Price = token1/token0 = ECO/WETH)
    // If token0 is ECO, price is ~1/2500 WETH per ECO (Price = token1/token0 = WETH/ECO)
    
    if (token0 === ARTIFACTS.WETH) {
        // Price = 2500
        // sqrtPrice = 50
        // sqrtPriceX96 = 50 * 2^96
        console.log("🔹 Token0 is WETH (Price ~ 2500 ECO/ETH)");
        sqrtPriceX96 = BigInt(50) * (2n ** 96n);
        tickLower = 76200;
        tickUpper = 80100;
    } else {
        // Price = 1/2500
        // sqrtPrice = 1/50 = 0.02
        // sqrtPriceX96 = 0.02 * 2^96 = 2^96 / 50
        console.log("🔹 Token0 is ECO (Price ~ 0.0004 ETH/ECO)");
        sqrtPriceX96 = (2n ** 96n) / 50n;
        tickLower = -80100;
        tickUpper = -76200;
    }

    const nftPositionManager = await ethers.getContractAt("contracts/TestInterfaces.sol:INonfungiblePositionManager", ARTIFACTS.NonfungiblePositionManager);
    
    // Initialize Pool
    console.log("Initializing pool with SqrtPriceX96:", sqrtPriceX96.toString());
    await nftPositionManager.createAndInitializePoolIfNecessary(
      token0,
      token1,
      fee,
      sqrtPriceX96
    );
    console.log("✅ Pool Created & Initialized");

    // 4. Add Concentrated Liquidity
    console.log("💧 Adding Concentrated Liquidity...");
    
    const amountEco = ethers.parseEther("25000"); // 25k ECO
    const amountEth = ethers.parseEther("10");    // 10 ETH

    // Approve Position Manager to spend ECO
    await ecoToken.approve(ARTIFACTS.NonfungiblePositionManager, ethers.MaxUint256);
    
    // Wrap ETH to WETH and Approve
    // We wrap extra to be safe
    const weth = await ethers.getContractAt("contracts/TestInterfaces.sol:IWETH", ARTIFACTS.WETH);
    await weth.deposit({ value: amountEth * 2n });
    await weth.approve(ARTIFACTS.NonfungiblePositionManager, ethers.MaxUint256);

    const params = {
      token0: token0,
      token1: token1,
      fee: fee,
      tickLower: tickLower,
      tickUpper: tickUpper,
      amount0Desired: token0 === ARTIFACTS.WETH ? amountEth : amountEco,
      amount1Desired: token1 === ARTIFACTS.WETH ? amountEth : amountEco,
      amount0Min: 0, 
      amount1Min: 0, 
      recipient: deployer.address,
      deadline: Math.floor(Date.now() / 1000) + 60 * 10
    };

    console.log("Mint Params:", {
        token0, 
        token1, 
        tickLower, 
        tickUpper, 
        amount0: params.amount0Desired.toString(), 
        amount1: params.amount1Desired.toString()
    });

    const tx = await nftPositionManager.mint(params);
    await tx.wait();
    console.log("✅ Concentrated Liquidity Added successfully");

    // 5. Deploy EcoMarketplace
    const EcoMarketplace = await ethers.getContractFactory("EcoMarketplace");
    const ecoMarketplace = await EcoMarketplace.deploy(ecoNFTAddress, ecoTokenAddress);
    await ecoMarketplace.waitForDeployment();
    const marketplaceAddress = await ecoMarketplace.getAddress();
    console.log("✅ EcoMarketplace deployed to:", marketplaceAddress);

    // 6. Setup Permissions
    await ecoNFT.setMarketplace(marketplaceAddress);
    
    // Save Artifacts
    await saveFrontendFiles({
        EcoNFT: ecoNFTAddress,
        EcoToken: ecoTokenAddress,
        EcoMarketplace: marketplaceAddress
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
