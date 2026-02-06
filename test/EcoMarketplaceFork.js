import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("EcoMarketplace (Mainnet Fork)", function () {
  const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  const FEED_ADDRESS = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

  let ecoNFT, ecoToken, marketplace;
  let usdc;
  let owner, seller, buyer;

  async function latestTime(provider) {
    const block = await provider.getBlock("latest");
    return block.timestamp;
  }

  async function increaseTime(provider, seconds) {
     const block = await provider.getBlock("latest");
     const newTime = block.timestamp + seconds;
     await provider.send("evm_setNextBlockTimestamp", [newTime]);
     await provider.send("evm_mine", []);
  }

  beforeEach(async function () {
    [owner, seller, buyer] = await ethers.getSigners();

    // Deploy EcoNFT
    const EcoNFT = await ethers.getContractFactory("EcoNFT");
    ecoNFT = await EcoNFT.deploy();
    await ecoNFT.waitForDeployment();

    // Deploy EcoToken
    const EcoToken = await ethers.getContractFactory("EcoToken");
    ecoToken = await EcoToken.deploy();
    await ecoToken.waitForDeployment();

    // Deploy Marketplace with Real Addresses
    const EcoMarketplace = await ethers.getContractFactory("EcoMarketplace");
    marketplace = await EcoMarketplace.deploy(
      await ecoNFT.getAddress(),
      USDC_ADDRESS,
      WETH_ADDRESS,
      ROUTER_ADDRESS,
      FEED_ADDRESS,
      await ecoToken.getAddress()
    );
    await marketplace.waitForDeployment();

    // Setup Permissions
    await ecoNFT.setMarketplace(await marketplace.getAddress());
    const MINTER_ROLE = await ecoToken.MINTER_ROLE();
    await ecoToken.grantRole(MINTER_ROLE, await marketplace.getAddress());

    // Connect to USDC
    usdc = await ethers.getContractAt("EcoToken", USDC_ADDRESS);
  });

  it("Sanity Check: Verify Mainnet Forking is active", async function () {
    const provider = ethers.provider;

    const blockNumber = await provider.getBlockNumber();
    console.log(`\n🔍 Current Block Number: ${blockNumber}`);
    expect(blockNumber).to.be.gt(19000000, "Error: You are not on a Mainnet Fork!");

    const BINANCE_USDC_WHALE = "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503";
    const whaleBalance = await usdc.balanceOf(BINANCE_USDC_WHALE);
    const formattedBalance = ethers.formatUnits(whaleBalance, 6);
    console.log(`🐳 Binance Whale USDC Balance: ${formattedBalance} USDC`);
    expect(whaleBalance).to.be.gt(0, "Error: Could not fetch USDC balance from Mainnet");

    const aggregatorAbi = [
        "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"
    ];
    const feed = new ethers.Contract(FEED_ADDRESS, aggregatorAbi, provider);
    const roundData = await feed.latestRoundData();
    const ethPrice = Number(roundData[1]) / 1e8;
    console.log(`💰 Live ETH Price from Chainlink: $${ethPrice.toFixed(2)}`);
    expect(ethPrice).to.be.gt(1000, "Error: ETH price from Oracle seems wrong");
    
    console.log("✅ Sanity Check Passed: You are officially on the Mainnet Fork!\n");
});

  it("Full Flow: Mint, List, Buy with ETH", async function () {
    await ecoNFT.mintProject(seller.address, 100, 1);
    const tokenId = 1n; // 1 since it's the first

    const priceUSDC = 100n * 10n**6n; // 100 USDC (6 decimals)
    await ecoNFT.connect(seller).approve(await marketplace.getAddress(), tokenId);
    await marketplace.connect(seller).listNFT(tokenId, priceUSDC);

    // Feed to check price? Not strictly needed if we send plenty
    const sendAmount = ethers.parseEther("1.0");

    const sellerUsdcBefore = await usdc.balanceOf(seller.address);
    const buyerEcoBefore = await ecoToken.balanceOf(buyer.address);

    await marketplace.connect(buyer).buyWithETH(tokenId, { value: sendAmount });

    expect(await ecoNFT.ownerOf(tokenId)).to.equal(buyer.address);

    const buyerEcoAfter = await ecoToken.balanceOf(buyer.address);
    expect(buyerEcoAfter).to.equal(buyerEcoBefore + ethers.parseEther("10"));

    const sellerUsdcAfter = await usdc.balanceOf(seller.address);
    expect(sellerUsdcAfter).to.equal(sellerUsdcBefore + 100n * 10n**6n);
  });

  it("Reverts if expired", async function () {
    const provider = ethers.provider;
    
    await ecoNFT.mintProject(seller.address, 100, 1);
    const tokenId = 1n;

    await ecoNFT.connect(seller).approve(await marketplace.getAddress(), tokenId);
    await marketplace.connect(seller).listNFT(tokenId, 200n * 10n**6n);

    // Warp past expiry (1 day + buffer)
    const block = await provider.getBlock("latest");
    const newTime = block.timestamp + 86400 + 3600;
    
    await provider.send("evm_mine", [newTime]);
    
    await expect(
        marketplace.connect(buyer).buyWithETH(tokenId, { value: ethers.parseEther("1") })
    ).to.be.revertedWithCustomError(marketplace, "ListingExpired");
  });

  it("Royalty Split: Creator (10%) vs Seller (90%)", async function () {
    const creator = owner;
    await ecoNFT.connect(creator).mintProject(creator.address, 100, 365);
    const tokenId = await ecoNFT.totalSupply();

    await ecoNFT.connect(creator).transferFrom(creator.address, seller.address, tokenId);

    const priceUSDC = 100n * 10n**6n;
    await ecoNFT.connect(seller).approve(await marketplace.getAddress(), tokenId);
    await marketplace.connect(seller).listNFT(tokenId, priceUSDC);

    const buyerUsdcBefore = await usdc.balanceOf(buyer.address);
    const sellerUsdcBefore = await usdc.balanceOf(seller.address);
    const creatorUsdcBefore = await usdc.balanceOf(creator.address);

    await marketplace.connect(buyer).buyWithETH(tokenId, { value: ethers.parseEther("1") });

    const sellerUsdcAfter = await usdc.balanceOf(seller.address);
    expect(sellerUsdcAfter).to.equal(sellerUsdcBefore + 90n * 10n**6n);

    const creatorUsdcAfter = await usdc.balanceOf(creator.address);
    expect(creatorUsdcAfter).to.equal(creatorUsdcBefore + 10n * 10n**6n);
  });

  it("Refund Logic: Returns exact excess ETH", async function () {
    await ecoNFT.mintProject(seller.address, 100, 365);
    const tokenId = await ecoNFT.totalSupply();
    const priceUSDC = 100n * 10n**6n;
    await ecoNFT.connect(seller).approve(await marketplace.getAddress(), tokenId);
    await marketplace.connect(seller).listNFT(tokenId, priceUSDC);

    const activeBuyer = buyer;
    const initialEth = await ethers.provider.getBalance(activeBuyer.address);
    const hugeAmount = ethers.parseEther("2.0");

    const tx = await marketplace.connect(activeBuyer).buyWithETH(tokenId, { value: hugeAmount });
    const receipt = await tx.wait();
    
    const gasUsed = receipt.gasUsed * receipt.gasPrice;
    const finalEth = await ethers.provider.getBalance(activeBuyer.address);
    
    const diff = initialEth - finalEth; // Total Cost (Swap + Gas)
    console.log("Total ETH Spent (Swap + Gas):", ethers.formatEther(diff));
    
    expect(diff).to.be.lessThan(ethers.parseEther("0.2"));
  });

  it("Cancel Listing: Prevents purchase", async function () {
    await ecoNFT.mintProject(seller.address, 100, 365);
    const tokenId = await ecoNFT.totalSupply();
    await ecoNFT.connect(seller).approve(await marketplace.getAddress(), tokenId);
    await marketplace.connect(seller).listNFT(tokenId, 100n * 10n**6n);

    await marketplace.connect(seller).cancelListing(tokenId);

    await expect(
        marketplace.connect(buyer).buyWithETH(tokenId, { value: ethers.parseEther("1") })
    ).to.be.revertedWithCustomError(marketplace, "NotListed");
  });

  it("Retired NFT: Cannot be bought", async function () {
    await ecoNFT.mintProject(seller.address, 100, 365);
    const tokenId = await ecoNFT.totalSupply();
    await ecoNFT.connect(seller).approve(await marketplace.getAddress(), tokenId);
    await marketplace.connect(seller).listNFT(tokenId, 100n * 10n**6n);

    await ecoNFT.connect(seller).retire(tokenId);

    await expect(
        marketplace.connect(buyer).buyWithETH(tokenId, { value: ethers.parseEther("1") })
    ).to.be.revertedWithCustomError(marketplace, "TokenRetired");
  });

  it("EcoToken AccessControl: Only marketplace can mint", async function () {
    const randomUser = seller;
    await expect(
        ecoToken.connect(randomUser).mint(randomUser.address, 1000)
    ).to.be.revertedWithCustomError(ecoToken, "AccessControlUnauthorizedAccount");
  });
});
