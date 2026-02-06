import hre from "hardhat";

const { ethers } = hre;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    const MAINNET_ADDRESSES = {
        usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        uniswapV3Router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        ethUsdFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    };

    // 1. Deploy EcoNFT
    const EcoNFT = await ethers.getContractFactory("EcoNFT");
    const ecoNFT = await EcoNFT.deploy();
    await ecoNFT.waitForDeployment();
    console.log("EcoNFT address:", await ecoNFT.getAddress());

    // 2. Deploy EcoToken
    const EcoToken = await ethers.getContractFactory("EcoToken");
    const ecoToken = await EcoToken.deploy();
    await ecoToken.waitForDeployment();
    console.log("EcoToken address:", await ecoToken.getAddress());

    // 3. Deploy EcoMarketplace
    const EcoMarketplace = await ethers.getContractFactory("EcoMarketplace");
    const ecoMarketplace = await EcoMarketplace.deploy(
        await ecoNFT.getAddress(),
        MAINNET_ADDRESSES.usdc,
        MAINNET_ADDRESSES.weth,
        MAINNET_ADDRESSES.uniswapV3Router,
        MAINNET_ADDRESSES.ethUsdFeed,
        await ecoToken.getAddress()
    );
    await ecoMarketplace.waitForDeployment();
    console.log("EcoMarketplace address:", await ecoMarketplace.getAddress());

    // 4. Setup Permissions
    // setMarketplace
    const setMktTx = await ecoNFT.setMarketplace(await ecoMarketplace.getAddress());
    await setMktTx.wait();
    console.log("EcoNFT setMarketplace executed");

    // grantRole MINTER_ROLE
    const MINTER_ROLE = await ecoToken.MINTER_ROLE();
    const roleTx = await ecoToken.grantRole(MINTER_ROLE, await ecoMarketplace.getAddress());
    await roleTx.wait();
    console.log("EcoToken grantRole executed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
