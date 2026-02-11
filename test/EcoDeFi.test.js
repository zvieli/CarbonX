import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("Proof of Green - DeFi & Marketplace Tests", function () {
  let ecoToken, ecoNFT, ecoMarketplace;
  let owner, seller, buyerStandard, buyerDeFi;
  let weth, nftPositionManager, swapRouter;

  // Uniswap & Mainnet Constants
  const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const POSITION_MANAGER_ADDRESS = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
  const UNISWAP_ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  
  // Test Pricing
  const LISTING_PRICE = ethers.parseEther("100"); // 100 ECO
  
  // Setup: Deploy Infrastructure and Create Liquidity Pool
  before(async function () {
    [owner, seller, buyerStandard, buyerDeFi] = await ethers.getSigners();
    
    // 1. Deploy Core Contracts
    const EcoToken = await ethers.getContractFactory("EcoToken");
    ecoToken = await EcoToken.deploy();

    const EcoNFT = await ethers.getContractFactory("EcoNFT");
    ecoNFT = await EcoNFT.deploy();

    // 2. Add Liquidity to Uniswap V3 (Simulated Deployment Script Logic)
    // We created TestInterfaces.sol to ensure artifacts exist for testing logic
    weth = await ethers.getContractAt("contracts/TestInterfaces.sol:IWETH", WETH_ADDRESS);
    nftPositionManager = await ethers.getContractAt("contracts/TestInterfaces.sol:INonfungiblePositionManager", POSITION_MANAGER_ADDRESS);

    // Calculate SqrtPriceX96 for 1 ETH = 2500 ECO
    // Token0/Token1 ordering is address dependent
    const tokenAddress = await ecoToken.getAddress();
    const token0 = BigInt(WETH_ADDRESS) < BigInt(tokenAddress) ? WETH_ADDRESS : tokenAddress;
    const token1 = BigInt(WETH_ADDRESS) < BigInt(tokenAddress) ? tokenAddress : WETH_ADDRESS;
    const fee = 3000;

    const priceRatio = token0 === WETH_ADDRESS ? 2500 : 1/2500;
    const encodePriceSqrt = (reserve1, reserve0) => {
        return BigInt(Math.floor(Math.sqrt(Number(reserve1) / Number(reserve0)) * 2 ** 96)).toString();
    };
    const sqrtPriceX96 = encodePriceSqrt(priceRatio, 1);

    await nftPositionManager.createAndInitializePoolIfNecessary(token0, token1, fee, sqrtPriceX96);
    
    // Improve Liquidity
    const amountEco = ethers.parseEther("250000");
    const amountEth = ethers.parseEther("100");
    
    await ecoToken.approve(POSITION_MANAGER_ADDRESS, ethers.MaxUint256);
    await weth.deposit({ value: amountEth * 2n });
    await weth.approve(POSITION_MANAGER_ADDRESS, ethers.MaxUint256);

    const params = {
        token0: token0,
        token1: token1,
        fee: fee,
        tickLower: -887220,
        tickUpper: 887220,
        amount0Desired: token0 === WETH_ADDRESS ? amountEth : amountEco,
        amount1Desired: token1 === WETH_ADDRESS ? amountEco : amountEth,
        amount0Min: 0,
        amount1Min: 0,
        recipient: owner.address,
        deadline: Math.floor(Date.now() / 1000) + 60
    };
    
    // Ensure sufficient balance for STF
    if (token0 === WETH_ADDRESS) {
       await weth.deposit({ value: amountEth * 2n }); 
    }
    
    await nftPositionManager.mint(params);

    // 3. Deploy Marketplace
    const EcoMarketplace = await ethers.getContractFactory("EcoMarketplace");
    ecoMarketplace = await EcoMarketplace.deploy(await ecoNFT.getAddress(), await ecoToken.getAddress());

    // 4. Grant Permissions
    await ecoNFT.setMarketplace(await ecoMarketplace.getAddress());
  });

  // --- UNIT TESTS ---

  describe("1. EcoToken Unit Tests", function () {
    it("Should allow Owner to mint manually", async function () {
        const initialBalance = await ecoToken.balanceOf(owner.address);
        await ecoToken.mint(owner.address, ethers.parseEther("100"));
        const newBalance = await ecoToken.balanceOf(owner.address);
        expect(newBalance).to.equal(initialBalance + ethers.parseEther("100"));
    });

    it("Should prevent non-owners from minting", async function () {
        await expect(
            ecoToken.connect(buyerStandard).mint(buyerStandard.address, 100)
        ).to.be.revertedWithCustomError(ecoToken, "OwnableUnauthorizedAccount");
    });

    it("Should allow anyone to use the Faucet (Get 1000 ECO)", async function () {
        await ecoToken.connect(buyerStandard).faucet();
        const balance = await ecoToken.balanceOf(buyerStandard.address);
        expect(balance).to.equal(ethers.parseEther("1000"));
    });
  });

  describe("2. Marketplace Integration Tests", function () {
    let tokenId;

    beforeEach(async function () {
        // Setup: Seller creates a project before each trade test
        // NOTE: In our current EcoNFT, 'createProject' might be restricted or implemented differently.
        // Assuming EcoNFT has a mint function or similar. 
        // Based on previous context, user was admin minting.
        // Let's assume Owner mints and transfers to Seller for listing scenario
        
        // MINT NFT directly to Seller (simulating admin mint or direct mint)
        // Adjust this if your EcoNFT has specific logic
        const tx = await ecoNFT.connect(owner).mintProject(seller.address, 100, 365, "ipfs://test");
        const receipt = await tx.wait();
        // Get Token ID from logs (Transfer event is usually index 0 or 1)
        // Assuming Transfer(address from, address to, uint256 tokenId)
        const event = receipt.logs.find(x => x.fragment && x.fragment.name === 'Transfer'); // Ethers v6 
        // If fragment is missing, fallback to parsing manually, but usually works with hardhat typechain
        // Let's grab the Log: 
        // Hard fallback:
        // Use enumerable to find token
        const count = await ecoNFT.totalSupply();
        tokenId = await ecoNFT.tokenByIndex(count - BigInt(1)); 
    });

    it("Should list a project correctly", async function () {
        // Seller approves Marketplace
        await ecoNFT.connect(seller).approve(await ecoMarketplace.getAddress(), tokenId);

        await expect(ecoMarketplace.connect(seller).listProject(tokenId, LISTING_PRICE))
            .to.emit(ecoMarketplace, "ProjectListed")
            .withArgs(tokenId, seller.address, LISTING_PRICE);
        
        const listing = await ecoMarketplace.listings(tokenId);
        expect(listing.price).to.equal(LISTING_PRICE);
        expect(listing.seller).to.equal(seller.address);
    });

    it("Scenario A: Standard Buy with EcoToken", async function () {
        // 1. Setup Listing
        await ecoNFT.connect(seller).approve(await ecoMarketplace.getAddress(), tokenId);
        await ecoMarketplace.connect(seller).listProject(tokenId, LISTING_PRICE);

        // 2. Buyer gets funds via Faucet
        // (BuyerStandard already got 1000 in previous test, checking balance)
        const buyerBalance = await ecoToken.balanceOf(buyerStandard.address);
        if (buyerBalance < LISTING_PRICE) await ecoToken.connect(buyerStandard).faucet();

        // 3. Approve Marketplace to spend tokens
        await ecoToken.connect(buyerStandard).approve(await ecoMarketplace.getAddress(), LISTING_PRICE);

        // 4. Buy
        await expect(ecoMarketplace.connect(buyerStandard).buyProject(tokenId))
            .to.emit(ecoMarketplace, "ProjectSold")
            .withArgs(tokenId, buyerStandard.address, LISTING_PRICE);

        // 5. Verification
        expect(await ecoNFT.ownerOf(tokenId)).to.equal(buyerStandard.address);
        expect(await ecoToken.balanceOf(seller.address)).to.equal(LISTING_PRICE); // Seller started with 0
    });

    it("Scenario B: Advanced Buy with ETH (Uniswap Swap)", async function () {
        // Need a new Token ID for this test
        // Use mintProject instead of safeMint
         await ecoNFT.connect(owner).mintProject(seller.address, 100, 365, "ipfs://test2");
         // Fetch last token ID
         const count = await ecoNFT.totalSupply();
         const tokenId2 = await ecoNFT.tokenByIndex(count - BigInt(1));

        // 1. Setup Listing
        await ecoNFT.connect(seller).approve(await ecoMarketplace.getAddress(), tokenId2);
        await ecoMarketplace.connect(seller).listProject(tokenId2, LISTING_PRICE);

        // 2. BuyerDeFi needs NO EcoTokens initially (to prove swap works)
        const initialEcobalance = await ecoToken.balanceOf(buyerDeFi.address);
        expect(initialEcobalance).to.equal(0);

        // 3. Calculate Approx ETH needed (1 ETH = 2500 ECO -> 100 ECO = 0.04 ETH)
        // Sending 0.1 ETH to be safe (ensure refund works)
        const ethToSend = ethers.parseEther("0.1");
        
        // 4. Exec buyWithETH
        const initialSellerBalance = await ecoToken.balanceOf(seller.address);
        const initialBuyerEth = await ethers.provider.getBalance(buyerDeFi.address);
        
        const tx = await ecoMarketplace.connect(buyerDeFi).buyWithETH(tokenId2, { value: ethToSend });
        const receipt = await tx.wait();
        
        // Calculate Gas Cost
        const gasCost = receipt.gasUsed * receipt.gasPrice;
        
        // 5. Verifications
        const finalBuyerEth = await ethers.provider.getBalance(buyerDeFi.address);
        const actualEthSpent = initialBuyerEth - finalBuyerEth - gasCost;

        // Approx 0.04 ETH should be spent. 
        // 0.1 sent - 0.04 spent = 0.06 refunded. 
        // Verification: The spent amount should be approx 0.04, NOT 0.1.
        // We use a tolerance of 0.005 ETH to account for slippage/fees.
        // TIGHTENING TOLERANCE: From 0.005 to 0.002 to be more strict about unexpected slippage.
        // 0.002 ETH is still ~6 USD (at 3000 USD/ETH), which covers gas variance but alerts on major slippage.
        const expectedCost = ethers.parseEther("0.04"); 
        expect(actualEthSpent).to.be.closeTo(expectedCost, ethers.parseEther("0.002"));


        // A. NFT Transferred
        expect(await ecoNFT.ownerOf(tokenId2)).to.equal(buyerDeFi.address);

        // B. Seller got Paid in ECO
        const finalSellerBalance = await ecoToken.balanceOf(seller.address);
        expect(finalSellerBalance).to.equal(initialSellerBalance + LISTING_PRICE);

        // C. Buyer has 0 ECO (Swap was exact, no dust left in Buyer wallet)
        expect(await ecoToken.balanceOf(buyerDeFi.address)).to.equal(0);
    });

    // --- EDGE CASES ---

    it("Edge Case: Should revert if ETH sent is insufficient", async function () {
        // Mint & List
        await ecoNFT.connect(owner).mintProject(seller.address, 100, 365, "ipfs://test3");
        const count = await ecoNFT.totalSupply();
        const tokenId3 = await ecoNFT.tokenByIndex(count - BigInt(1));
        await ecoNFT.connect(seller).approve(await ecoMarketplace.getAddress(), tokenId3);
        await ecoMarketplace.connect(seller).listProject(tokenId3, LISTING_PRICE);

        // Try to buy with 0.01 ETH (Requires ~0.04)
        const insufficientEth = ethers.parseEther("0.01");
        
        // Uniswap V3 exactOutputSingle reverts if amountInMaximum is exceeded.
        // The error bubbling up might be "STF" (Safe Transfer Failed) or Uniswap internal error.
        // Or generic revert. We just ensure it reverts.
        await expect(
            ecoMarketplace.connect(buyerDeFi).buyWithETH(tokenId3, { value: insufficientEth })
        ).to.be.reverted; 
    });

    it("Edge Case: Should revert standard buy if Allowance is missing", async function () {
        // Mint & List
        await ecoNFT.connect(owner).mintProject(seller.address, 100, 365, "ipfs://test4");
        const count = await ecoNFT.totalSupply();
        const tokenId4 = await ecoNFT.tokenByIndex(count - BigInt(1));
        await ecoNFT.connect(seller).approve(await ecoMarketplace.getAddress(), tokenId4);
        await ecoMarketplace.connect(seller).listProject(tokenId4, LISTING_PRICE);

        // Buyer has ECO but no approval
        await ecoToken.connect(buyerStandard).faucet();
        // Reset approval just in case
        await ecoToken.connect(buyerStandard).approve(await ecoMarketplace.getAddress(), 0);

        // Expect revert due to lack of allowance (ERC20InsufficientAllowance)
        // Hardhat matchers can check specific custom errors if ABI is known, 
        // otherwise we check for generic revert or specific string.
        await expect(
            ecoMarketplace.connect(buyerStandard).buyProject(tokenId4)
        ).to.be.revertedWithCustomError(ecoToken, "ERC20InsufficientAllowance");
    });

    it("Edge Case: Should revert if project is already sold", async function () {
        // Use previous sold token (tokenId2 from Scenario B)
        // It was sold to buyerDeFi.
        // Try to buy it again (anyone trying)
        
        const count = await ecoNFT.totalSupply();
        const tokenId2 = await ecoNFT.tokenByIndex(count - BigInt(2)); // Use earlier token
        
        // The tokenId2 logic above is tricky because tests run in sequence. 
        // Let's just create a new one, sell it, then try again.
        await ecoNFT.connect(owner).mintProject(seller.address, 100, 365, "ipfs://test5");
        const countNew = await ecoNFT.totalSupply();
        const tokenId5 = await ecoNFT.tokenByIndex(countNew - BigInt(1));
        
        await ecoNFT.connect(seller).approve(await ecoMarketplace.getAddress(), tokenId5);
        await ecoMarketplace.connect(seller).listProject(tokenId5, LISTING_PRICE);
        
        // Buy once (Standard)
        await ecoToken.connect(buyerStandard).approve(await ecoMarketplace.getAddress(), LISTING_PRICE);
        await ecoMarketplace.connect(buyerStandard).buyProject(tokenId5);

        // Buy again
        await expect(
            ecoMarketplace.connect(buyerStandard).buyProject(tokenId5)
        ).to.be.revertedWithCustomError(ecoMarketplace, "AlreadySold");
    });
  });
});
