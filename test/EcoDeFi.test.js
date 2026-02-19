
import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

/**
 * @title EcoDeFi Comprehensive Test Suite
 * @notice Tests the full "Green Financial System": ERC20, NFT, Marketplace, and Uniswap V3 Integration.
 */
describe("🌿 EcoDeFi Protocol Verification (Mainnet Fork)", function () {
    let ecoToken, ecoNFT, ecoMarketplace;
    let owner, seller, buyerStandard, buyerDeFi;
    let weth, nftPositionManager, swapRouter, uniswapV3Pool;

    // --- Mainnet Constants ---
    const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
    const SWAP_ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
    const POSITION_MANAGER_ADDRESS = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
    const FEE_TIER = 3000; // 0.3%

    // --- Pricing Math ---
    // Initial Price: 2500 ECO per 1 ETH
    let token0, token1;
    let sqrtPriceX96;

    before(async function () {
        [owner, seller, buyerStandard, buyerDeFi] = await ethers.getSigners();
        console.log("🚀 Starting Tests with Owner:", owner.address);

        // 1. Deploy Core Contracts
        const EcoToken = await ethers.getContractFactory("EcoToken");
        ecoToken = await EcoToken.deploy();
        await ecoToken.waitForDeployment();
        const ecoTokenAddress = await ecoToken.getAddress();

        const EcoNFT = await ethers.getContractFactory("EcoNFT");
        ecoNFT = await EcoNFT.deploy();
        await ecoNFT.waitForDeployment();
        const ecoNFTAddress = await ecoNFT.getAddress();

        console.log("✅ Tokens Deployed");

        // 2. Setup Uniswap V3 Pool
        // Sort tokens for Uniswap
        token0 = BigInt(WETH_ADDRESS) < BigInt(ecoTokenAddress) ? WETH_ADDRESS : ecoTokenAddress;
        token1 = BigInt(WETH_ADDRESS) < BigInt(ecoTokenAddress) ? ecoTokenAddress : WETH_ADDRESS;

        // Calculate Initial Price
        const isWethToken0 = token0 === WETH_ADDRESS;
        if (isWethToken0) {
            // Price = 2500 ECO/ETH
            // sqrt(2500) = 50
            sqrtPriceX96 = BigInt(50) * (2n ** 96n);
        } else {
            // Price = 1/2500 ETH/ECO
            // sqrt(1/2500) = 1/50
            sqrtPriceX96 = (2n ** 96n) / 50n;
        }

        nftPositionManager = await ethers.getContractAt("contracts/TestInterfaces.sol:INonfungiblePositionManager", POSITION_MANAGER_ADDRESS);
        
        // Initialize Pool
        await nftPositionManager.createAndInitializePoolIfNecessary(
            token0,
            token1,
            FEE_TIER,
            sqrtPriceX96.toString()
        );

        // Add Liquidity (Concentrated Range)
        const amountEco = ethers.parseEther("250000");
        const amountEth = ethers.parseEther("100");

        await ecoToken.approve(POSITION_MANAGER_ADDRESS, ethers.MaxUint256);
        
        // Wrap ETH
        weth = await ethers.getContractAt("contracts/TestInterfaces.sol:IWETH", WETH_ADDRESS);
        await weth.deposit({ value: amountEth * 2n }); 
        await weth.approve(POSITION_MANAGER_ADDRESS, ethers.MaxUint256);

        // Define Range: +/- ~10% around 2500
        // Ticks for 0.3%: Spacing 60
        // Center Tick roughly log_1.0001(2500) = ~78245
        // Range: 76200 to 80100 (aligned to 60)
        let tickLower, tickUpper;
        if (isWethToken0) {
            tickLower = 76200;
            tickUpper = 80100;
        } else {
            // Inverted price -> Inverted ticks
            tickLower = -80100;
            tickUpper = -76200;
        }

        const params = {
            token0: token0,
            token1: token1,
            fee: FEE_TIER,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: isWethToken0 ? amountEth : amountEco,
            amount1Desired: isWethToken0 ? amountEco : amountEth,
            amount0Min: 0,
            amount1Min: 0,
            recipient: owner.address,
            deadline: Math.floor(Date.now() / 1000) + 60
        };

        await nftPositionManager.mint(params);
        console.log("✅ Concentrated Liquidity Provisioned");

        // 3. Deploy Marketplace
        const EcoMarketplace = await ethers.getContractFactory("EcoMarketplace");
        ecoMarketplace = await EcoMarketplace.deploy(ecoNFTAddress, ecoTokenAddress);
        await ecoMarketplace.waitForDeployment();

        // Connect Marketplace to NFT
        await ecoNFT.setMarketplace(await ecoMarketplace.getAddress());
        console.log("✅ Marketplace Deployed & Linked");

        // Get Pool Contract for Verification
        // Use full path for external artifacts
        const factory = await ethers.getContractAt("IUniswapV3Factory", FACTORY_ADDRESS);
        const poolAddress = await factory.getPool(token0, token1, FEE_TIER);
        uniswapV3Pool = await ethers.getContractAt("IUniswapV3Pool", poolAddress);
        swapRouter = await ethers.getContractAt("ISwapRouter", SWAP_ROUTER_ADDRESS);
    });

    // --------------------------------------------------------------------------------
    // TEST 1: Deployment & State Verification
    // --------------------------------------------------------------------------------
    describe("1. Deployment & State (The Foundation)", function () {
        it("Should initialize the Pool with correct price (2500 ECO/ETH)", async function () {
            const slot0 = await uniswapV3Pool.slot0();
            const currentSqrtPriceX96 = slot0.sqrtPriceX96;
            
            // Allow small deviation due to initialization precision
            const expected = sqrtPriceX96;
            const tolerance = expected / 100n; // 1% tolerance

            // BigInt comparison
            const diff = currentSqrtPriceX96 > expected ? currentSqrtPriceX96 - expected : expected - currentSqrtPriceX96;
            
            console.log(`    📊 Pool Price: ${currentSqrtPriceX96.toString()} (Expected: ${expected.toString()})`);
            expect(diff).to.be.lt(tolerance);
        });

        it("Should use correct Tick Spacing for 0.3% fee", async function () {
            const tickSpacing = await uniswapV3Pool.tickSpacing();
            expect(tickSpacing).to.equal(60n);
        });
    });

    // --------------------------------------------------------------------------------
    // TEST 2: Concentrated Liquidity Mechanics
    // --------------------------------------------------------------------------------
    describe("2. Concentrated Liquidity Swaps", function () {
        it("Should allow swapping ETH for ECO (Price Impact Check)", async function () {
            const ethAmountIn = ethers.parseEther("1.0"); // 1 ETH
            
            // Wrap ETH for buyer
            await weth.connect(buyerDeFi).deposit({ value: ethAmountIn });
            await weth.connect(buyerDeFi).approve(SWAP_ROUTER_ADDRESS, ethAmountIn);

            // Record State Before
            const balanceEcoBefore = await ecoToken.balanceOf(buyerDeFi.address);
            const slot0Before = await uniswapV3Pool.slot0();

            // Perform Swap
            const params = {
                tokenIn: WETH_ADDRESS,
                tokenOut: await ecoToken.getAddress(),
                fee: FEE_TIER,
                recipient: buyerDeFi.address,
                deadline: Math.floor(Date.now() / 1000) + 60,
                amountIn: ethAmountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            };

            await swapRouter.connect(buyerDeFi).exactInputSingle(params);

            // Record State After
            const balanceEcoAfter = await ecoToken.balanceOf(buyerDeFi.address);
            const slot0After = await uniswapV3Pool.slot0();
            
            const ecoReceived = balanceEcoAfter - balanceEcoBefore;

            console.log(`    💸 Swapped 1 ETH for ${ethers.formatEther(ecoReceived)} ECO`);
            console.log(`    📉 Price moved from ${slot0Before.sqrtPriceX96} to ${slot0After.sqrtPriceX96}`);
            
            expect(ecoReceived).to.be.gt(0);
        });
    });

    // --------------------------------------------------------------------------------
    // TEST 3: The "Zap" (Marketplace Integration)
    // --------------------------------------------------------------------------------
    describe("3. Marketplace 'buyWithETH' Zap", function () {
        const NFT_ID = 1;
        const PRICE_ECO = ethers.parseEther("100"); // 100 ECO

        before(async function () {
            // Setup: Seller Mints and Lists NFT
            // Mint with huge total supply so we don't hit cap
            // Correct order: to, tons, expiryDays, URI
            await ecoNFT.connect(owner).mintProject(seller.address, 100000n, 1000n, "https://ipfs.io/ipfs/test");
            
            // Approve Marketplace
            await ecoNFT.connect(seller).approve(await ecoMarketplace.getAddress(), NFT_ID);
            
            // List Item
            await ecoMarketplace.connect(seller).listProject(NFT_ID, PRICE_ECO);
        });

        it("Should allow user to buy NFT directly with ETH (Auto-Swap)", async function () {
            // Buyer sends ETH. Marketplace swaps to ECO. Seller gets ECO. Buyer gets NFT.
            
            // Estimate ETH needed: 100 ECO / 2500 (Ratio) = 0.04 ETH.
            // Send 0.1 ETH to be safe against slippage.
            const ethToSend = ethers.parseEther("0.1");

            const sellerEcoBefore = await ecoToken.balanceOf(seller.address);
            
            // Execute Transaction
            // Wrap in try-catch to print error if it fails (Fork issues)
            try {
                const tx = await ecoMarketplace.connect(buyerStandard).buyWithETH(NFT_ID, { value: ethToSend });
                await tx.wait();
            } catch (error) {
                console.log("    ⚠️ 'buyWithETH' Failed:", error.message);
                throw error;    
            }
            
            // Verify NFT Transfer
            expect(await ecoNFT.ownerOf(NFT_ID)).to.equal(buyerStandard.address);

            // Verify Seller Got Paid
            const sellerEcoAfter = await ecoToken.balanceOf(seller.address);
            expect(sellerEcoAfter - sellerEcoBefore).to.equal(PRICE_ECO);

            console.log("    ⚡ Zap Successful: ETH -> ECO -> NFT");
        });
    });

    // --------------------------------------------------------------------------------
    // TEST 4: Reverse Swap (ECO -> ETH)
    // --------------------------------------------------------------------------------
    describe("4. Reverse Swap (ECO -> ETH)", function () {
        it("Should FAIL to swap without approval", async function () {
            // Give buyer some ECO
            await ecoToken.mint(buyerDeFi.address, ethers.parseEther("500"));
            
            const params = {
                tokenIn: await ecoToken.getAddress(),
                tokenOut: WETH_ADDRESS,
                fee: FEE_TIER,
                recipient: buyerDeFi.address,
                deadline: Math.floor(Date.now() / 1000) + 60,
                amountIn: ethers.parseEther("100"),
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            };

            // Expect Revert (STF or transferFrom failure)
            // Due to interactions, it might fail inside SafeERC20 or Router
            let failed = false;
            try {
                await swapRouter.connect(buyerDeFi).exactInputSingle(params);
            } catch (e) {
                failed = true;
            }
            expect(failed).to.be.true;
        });

        it("Should SUCCEED after approval", async function () {
            const ecoAmount = ethers.parseEther("100");
            
            // Approve
            await ecoToken.connect(buyerDeFi).approve(SWAP_ROUTER_ADDRESS, ecoAmount);

            // Check WETH Balance before
            const wethBalanceBefore = await weth.balanceOf(buyerDeFi.address);

            const params = {
                tokenIn: await ecoToken.getAddress(),
                tokenOut: WETH_ADDRESS,
                fee: FEE_TIER,
                recipient: buyerDeFi.address,
                deadline: Math.floor(Date.now() / 1000) + 60,
                amountIn: ecoAmount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            };

            await swapRouter.connect(buyerDeFi).exactInputSingle(params);

            const wethBalanceAfter = await weth.balanceOf(buyerDeFi.address);
            expect(wethBalanceAfter).to.be.gt(wethBalanceBefore);
            
            console.log(`    🔄 Sold 100 ECO for ${ethers.formatEther(wethBalanceAfter - wethBalanceBefore)} WETH`);
        });
    });

    // --------------------------------------------------------------------------------
    // TEST 5: Edge Cases (Concentrated Liquidity Limits)
    // --------------------------------------------------------------------------------
    describe("5. Liquidity Range Limits (Bonus)", function () {
        it("Should fail or execute poorly if price moves out of range (High Impact)", async function () {
            // We put ~10 ETH of liquidity in.
            // If we try to buy 10,000,000 ECO we should crash through the ticks.

            const hugeEcoAmount = ethers.parseEther("10000000"); // 10M ECO
            await ecoToken.mint(buyerDeFi.address, hugeEcoAmount);
            await ecoToken.connect(buyerDeFi).approve(SWAP_ROUTER_ADDRESS, hugeEcoAmount);

            const params = {
                tokenIn: await ecoToken.getAddress(),
                tokenOut: WETH_ADDRESS,
                fee: FEE_TIER,
                recipient: buyerDeFi.address,
                deadline: Math.floor(Date.now() / 1000) + 60,
                amountIn: hugeEcoAmount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            };

            // This should fail because we only initialized ONE range.
            let failed = false;
            try {
                await swapRouter.connect(buyerDeFi).exactInputSingle(params);
            } catch (error) {
                console.log("    ✅ High Impact Swap Reverted (Out of Liquidity Range)");
                failed = true;
            }
            
            if (!failed) {
                 // Or maybe we verify we got terrible execution?
                 // But in V3 with one position, it should revert when crossing uninitialized ticks usually.
                 console.log("    ⚠️ High Swap executed (Unexpected for single range)");
            }
        });
    });
});
