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

// Integer square-root (BigInt) using Newton's method
const integerSqrt = (value) => {
    if (value < 0n) throw new Error('sqrt only works on non-negative integers');
    if (value < 2n) return value;
    let x0 = value;
    let x1 = (value >> 1n) + 1n;
    while (x1 < x0) {
        x0 = x1;
        x1 = (value / x1 + x1) >> 1n;
    }
    return x0;
};

// BigInt-safe encode sqrt price: sqrt(reserve1/reserve0) * 2^96
// We compute sqrt( reserve1 * 2^192 / reserve0 ) to avoid floating point.
const encodePriceSqrtBigInt = (reserve1, reserve0) => {
    const r1 = BigInt(reserve1);
    const r0 = BigInt(reserve0);
    const Q192 = 2n ** 192n;
    const value = (r1 * Q192) / r0; // scaled by 2^192
    const sqrt = integerSqrt(value);
    return sqrt.toString();
};

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("🚀 Deploying CarbonX (CX) environment with account:", deployer.address);
    console.log("----------------------------------------------------");

    // Dummy transaction to change nonce and generate fresh addresses
    console.log("🔄 Sending dummy transaction to reset nonce...");
    await deployer.sendTransaction({
        to: deployer.address,
        value: ethers.parseEther("0.1")
    });

    const contractsDir = path.join(__dirname, "..", "frontend", "contracts");
    
    // Clean directory contents if it exists, otherwise create it
    if (fs.existsSync(contractsDir)) {
        const files = fs.readdirSync(contractsDir);
        for (const file of files) {
            fs.unlinkSync(path.join(contractsDir, file));
        }
        console.log(`🧹 Cleared old artifacts from ${contractsDir}`);
    } else {
        fs.mkdirSync(contractsDir, { recursive: true });
    }

    const saveFrontendFiles = async (addresses) => {
        // Save Addresses
        fs.writeFileSync(
            path.join(contractsDir, "contract-addresses.json"),
            JSON.stringify(addresses, null, 2)
        );

        // Save ABIs - Physically copying the artifact content
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

    // 1. Deploy EcoToken (ERC20) - FIRST
    const EcoToken = await ethers.getContractFactory("EcoToken");
    const ecoToken = await EcoToken.deploy();
    await ecoToken.waitForDeployment();
    const ecoTokenAddress = await ecoToken.getAddress();
    console.log("✅ CarbonX Token (CX) deployed to:", ecoTokenAddress);

    // 2. Deploy EcoNFT (ERC721) - SECOND (Depends on EcoToken)
    const EcoNFT = await ethers.getContractFactory("EcoNFT");
    const ecoNFT = await EcoNFT.deploy(ecoTokenAddress);
    await ecoNFT.waitForDeployment();
    const ecoNFTAddress = await ecoNFT.getAddress();
    console.log("✅ CarbonX NFT deployed to:", ecoNFTAddress);

    // Initial Mint for Liquidity (Admin Allocation)
    console.log("🌱 Minting initial 250,000 CX for liquidity...");
    await (await ecoToken.mint(deployer.address, ethers.parseEther('250000'))).wait();
    console.log("✅ Minted.");

    // 3. Deploy EcoMarketplace (Depends on EcoNFT and EcoToken)
    const EcoMarketplace = await ethers.getContractFactory("EcoMarketplace");
    const ecoMarketplace = await EcoMarketplace.deploy(ecoNFTAddress, ecoTokenAddress);
    await ecoMarketplace.waitForDeployment();
    const ecoMarketplaceAddress = await ecoMarketplace.getAddress();
    console.log("✅ EcoMarketplace deployed to:", ecoMarketplaceAddress);

    // 4. Configuration: Link Contracts
    console.log("🔗 Config: Linking Contracts...");
    await ecoNFT.setMarketplace(ecoMarketplaceAddress);
    await ecoNFT.setExempt(ecoMarketplaceAddress, true); // Exempt Marketplace from Royalties
    console.log("   > Marketplace set in NFT contract & Exempted");

    // 5. Create Uniswap V3 Pool (WETH / CX) - Concentrated Liquidity
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
        // Price = 2500 ECO per ETH -> numerator/denominator = 2500/1
        console.log("🔹 Token0 is WETH (Price ~ 2500 CX/ETH)");
        sqrtPriceX96 = encodePriceSqrtBigInt(2500n, 1n);
        tickLower = 69060;
        tickUpper = 85200;
    } else {
        // Price = 1/2500 ETH per ECO -> numerator/denominator = 1/2500
        console.log("🔹 Token0 is CX (Price ~ 0.0004 ETH/CX)");
        sqrtPriceX96 = encodePriceSqrtBigInt(1n, 2500n);
        tickLower = -85200;
        tickUpper = -69060;
    }

    const nftPositionManager = await ethers.getContractAt("contracts/INonfungiblePositionManager.sol:INonfungiblePositionManager", ARTIFACTS.NonfungiblePositionManager);
    
        // Initialize Pool
        console.log("Initializing pool with SqrtPriceX96:", sqrtPriceX96.toString());
        await nftPositionManager.createAndInitializePoolIfNecessary(
            token0,
            token1,
            fee,
            sqrtPriceX96
        );
        console.log("✅ Pool Created & Initialized");

        // Verify pool slot0.sqrtPriceX96 matches expected value (sanity check)
        try {
            const factory = await ethers.getContractAt("IUniswapV3Factory", ARTIFACTS.UniswapV3Factory);
            const poolAddress = await factory.getPool(token0, token1, fee);
            if (poolAddress === ethers.ZeroAddress || poolAddress === "0x0000000000000000000000000000000000000000") {
                console.warn("⚠️ Pool address not found from factory — skipping slot0 verification");
            } else {
                const pool = await ethers.getContractAt("IUniswapV3Pool", poolAddress);
                const slot0 = await pool.slot0();
                const deployedSqrt = BigInt(slot0.sqrtPriceX96.toString());
                const expected = BigInt(sqrtPriceX96.toString());
                const diff = deployedSqrt > expected ? deployedSqrt - expected : expected - deployedSqrt;
                const tolerance = expected / 100n; // 1% tolerance
                console.log("Pool slot0.sqrtPriceX96:", deployedSqrt.toString());
                if (diff <= tolerance) {
                    console.log("✅ slot0.sqrtPriceX96 within 1% of expected value");
                } else {
                    console.warn("⚠️ slot0.sqrtPriceX96 differs from expected by more than 1%", { expected: expected.toString(), deployed: deployedSqrt.toString(), diff: diff.toString() });
                }
            }
        } catch (verifyErr) {
            console.warn("⚠️ Could not verify pool slot0:", verifyErr.message || verifyErr);
        }

    // 4. Add Concentrated Liquidity
    console.log("💧 Adding Concentrated Liquidity...");
    
    const amountEco = ethers.parseEther("250000"); // 250k CX
    const amountEth = ethers.parseEther("100");    // 100 ETH

    // Approve Position Manager to spend CX
    await ecoToken.approve(ARTIFACTS.NonfungiblePositionManager, ethers.MaxUint256);
    
    // Wrap ETH to WETH and Approve
    // We wrap extra to be safe
    const weth = await ethers.getContractAt("contracts/INonfungiblePositionManager.sol:IWETH", ARTIFACTS.WETH);
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

    // Save Artifacts
    await saveFrontendFiles({
        EcoNFT: ecoNFTAddress,
        EcoToken: ecoTokenAddress,
        EcoMarketplace: ecoMarketplaceAddress
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
