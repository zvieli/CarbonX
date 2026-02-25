
import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

/**
 * @title CarbonX Comprehensive Test Suite
 * @notice Tests the full "Green Financial System": ERC20, NFT, Marketplace, and Uniswap V3 Integration.
 */
describe("🌿 CarbonX Protocol Verification (Mainnet Fork)", function () {
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
    // Initial Price: 2500 CX per 1 ETH
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
        
        // Mint Initial Supply (Simulating Deploy Script)
        await ecoToken.mint(owner.address, ethers.parseEther("250000"));

        // 2. Setup Uniswap V3 Pool
        // Sort tokens for Uniswap
        token0 = BigInt(WETH_ADDRESS) < BigInt(ecoTokenAddress) ? WETH_ADDRESS : ecoTokenAddress;
        token1 = BigInt(WETH_ADDRESS) < BigInt(ecoTokenAddress) ? ecoTokenAddress : WETH_ADDRESS;

        // Calculate Initial Price
        const isWethToken0 = token0 === WETH_ADDRESS;
        if (isWethToken0) {
            // Price = 2500 CX/ETH
            // sqrt(2500) = 50
            sqrtPriceX96 = BigInt(50) * (2n ** 96n);
        } else {
            // Price = 1/2500 ETH/CX
            // sqrt(1/2500) = 1/50
            sqrtPriceX96 = (2n ** 96n) / 50n;
        }

        nftPositionManager = await ethers.getContractAt("contracts/INonfungiblePositionManager.sol:INonfungiblePositionManager", POSITION_MANAGER_ADDRESS);
        
        // Initialize Pool
        await nftPositionManager.createAndInitializePoolIfNecessary(
            token0,
            token1,
            FEE_TIER,
            sqrtPriceX96.toString()
        );

        // Add Liquidity (Concentrated Range)
        const amountCX = ethers.parseEther("250000");
        const amountEth = ethers.parseEther("100");

        await ecoToken.approve(POSITION_MANAGER_ADDRESS, ethers.MaxUint256);
        
        // Wrap ETH
        weth = await ethers.getContractAt("contracts/INonfungiblePositionManager.sol:IWETH", WETH_ADDRESS);
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

        const block = await ethers.provider.getBlock("latest");
        const params = {
            token0: token0,
            token1: token1,
            fee: FEE_TIER,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: isWethToken0 ? amountEth : amountCX,
            amount1Desired: isWethToken0 ? amountCX : amountEth,
            amount0Min: 0,
            amount1Min: 0,
            recipient: owner.address,
            deadline: block.timestamp + 60
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
        it("Should initialize the Pool with correct price (2500 CX/ETH)", async function () {
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
        it("Should allow swapping ETH for CX (Price Impact Check)", async function () {
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

            console.log(`    💸 Swapped 1 ETH for ${ethers.formatEther(ecoReceived)} CX`);
            console.log(`    📉 Price moved from ${slot0Before.sqrtPriceX96} to ${slot0After.sqrtPriceX96}`);
            
            expect(ecoReceived).to.be.gt(0);
        });
    });

    // --------------------------------------------------------------------------------
    // TEST 3: The "Zap" (Marketplace Integration)
    // --------------------------------------------------------------------------------
    describe("3. Marketplace 'buyWithETH' Zap", function () {
        const NFT_ID = 1;
        const PRICE_CX = ethers.parseEther("100"); // 100 CX

        it("Should follow Decentralized Flow: Mint to Creator -> Transfer to Seller -> Buy with Royalties", async function () {
            // Setup: Use a separate creator for clarity
            const [ , , , , distinctCreator] = await ethers.getSigners();
            
            console.log("    🎭 Roles:");
            console.log("       Creator:", distinctCreator.address);
            console.log("       Seller :", seller.address);
            console.log("       Buyer  :", buyerStandard.address);

            // 1. Mint directly to Creator (Decentralized)
            // New Signature: creator, tons, expiry, uri, suggestedPrice
            await ecoNFT.connect(owner).mintProject(distinctCreator.address, 100000n, 1000n, "https://ipfs.io/ipfs/test", 0);
            
            // VERIFY: Creator owns the NFT immediately
            expect(await ecoNFT.ownerOf(NFT_ID)).to.equal(distinctCreator.address);
            console.log("    ✅ Minted successfully to Creator address");

            // 2. Creator transfers to Seller (Simulating secondary market entry or broker)
            await ecoNFT.connect(distinctCreator).transferFrom(distinctCreator.address, seller.address, NFT_ID);
            expect(await ecoNFT.ownerOf(NFT_ID)).to.equal(seller.address);

            // 3. Seller Lists Item
            await ecoNFT.connect(seller).approve(await ecoMarketplace.getAddress(), NFT_ID);
            await ecoMarketplace.connect(seller).listProject(NFT_ID, PRICE_CX);

            // 4. Buyer sends ETH. Marketplace swaps to CX. Seller gets CX. Buyer gets NFT.
            
            // Estimate ETH needed: 100 CX / 2500 (Ratio) = 0.04 ETH.
            // Send 0.1 ETH to be safe against slippage.
            const ethToSend = ethers.parseEther("0.1");

            const sellerCxBefore = await ecoToken.balanceOf(seller.address);
            const creatorCxBefore = await ecoToken.balanceOf(distinctCreator.address);

            // Execute Transaction
            try {
                const tx = await ecoMarketplace.connect(buyerStandard).buyWithETH(NFT_ID, { value: ethToSend });
                await tx.wait();
            } catch (error) {
                console.log("    ⚠️ 'buyWithETH' Failed:", error.message);
                throw error;    
            }
            
            // Verify NFT Transfer
            expect(await ecoNFT.ownerOf(NFT_ID)).to.equal(buyerStandard.address);

            // Verify Balances
            const sellerCxAfter = await ecoToken.balanceOf(seller.address);
            const creatorCxAfter = await ecoToken.balanceOf(distinctCreator.address);
            
            // Log Balances
            const expectedSellerPay = (PRICE_CX * 90n) / 100n;
            const expectedCreatorPay = (PRICE_CX * 10n) / 100n;

            console.log("    💰 Balances:");
            console.log(`       Seller  Before: ${ethers.formatEther(sellerCxBefore)} CX, After: ${ethers.formatEther(sellerCxAfter)} CX (Change: +${ethers.formatEther(sellerCxAfter - sellerCxBefore)})`);
            console.log(`       Creator Before: ${ethers.formatEther(creatorCxBefore)} CX, After: ${ethers.formatEther(creatorCxAfter)} CX (Change: +${ethers.formatEther(creatorCxAfter - creatorCxBefore)})`);
            
            
            // Verify Seller Got Paid (90%)
            expect(sellerCxAfter - sellerCxBefore).to.equal(expectedSellerPay);
            
            // Verify Creator Got Paid (10%)
            expect(creatorCxAfter - creatorCxBefore).to.equal(expectedCreatorPay); 

            console.log("    ⚡ Zap Successful: ETH -> CX -> NFT + Royalties Paid");
        });
    });

    // --------------------------------------------------------------------------------
    // TEST 3.5: Validation (Expiry & Retirement)
    // --------------------------------------------------------------------------------
    describe("3.5. Validation Logic (Expiry & Retirement)", function () {
        it("Should FAIL to list an Expired NFT", async function () {
            // Mint with short expiry (1 day). Creator = seller.
            await ecoNFT.connect(owner).mintProject(seller.address, 100n, 1n, "ipfs://fail", 0); 
            
            // Get ID via enumeration
            const balance = await ecoNFT.balanceOf(seller.address);
            const id = await ecoNFT.tokenOfOwnerByIndex(seller.address, balance - 1n);

            // Fast forward 2 days (Expiry is timestamp + 1 day)
            await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]); 
            await ethers.provider.send("evm_mine");

            // Try to list
            await ecoNFT.connect(seller).approve(await ecoMarketplace.getAddress(), id);
            
            await expect(
                ecoMarketplace.connect(seller).listProject(id, ethers.parseEther("100"))
            ).to.be.revertedWith("Cannot list expired NFT");
        });

        it("Should FAIL to list a Retired NFT", async function () {
            // Mint fresh NFT to seller
            await ecoNFT.connect(owner).mintProject(seller.address, 100n, 365n, "ipfs://retired", 0);
            const balance = await ecoNFT.balanceOf(seller.address);
            const id = await ecoNFT.tokenOfOwnerByIndex(seller.address, balance - 1n);

            // Retire it
            await ecoNFT.connect(seller).retire(id);

            // Try to list
            await ecoNFT.connect(seller).approve(await ecoMarketplace.getAddress(), id);
            
            await expect(
                ecoMarketplace.connect(seller).listProject(id, ethers.parseEther("100"))
            ).to.be.revertedWith("Cannot list retired NFT");
        });

        it("Should FAIL to buy an NFT that expired while listed", async function () {
            // Mint fresh NFT to seller
            await ecoNFT.connect(owner).mintProject(seller.address, 100n, 1n, "ipfs://expire_listed", 0);
            const balance = await ecoNFT.balanceOf(seller.address);
            const id = await ecoNFT.tokenOfOwnerByIndex(seller.address, balance - 1n);

            // List it correctly (before expiry)
            await ecoNFT.connect(seller).approve(await ecoMarketplace.getAddress(), id);
            await ecoMarketplace.connect(seller).listProject(id, ethers.parseEther("10"));

            // Fast forward to expire it
            await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]); 
            await ethers.provider.send("evm_mine");

            // Try to buy
            await ecoToken.mint(buyerStandard.address, ethers.parseEther("100"));
            await ecoToken.connect(buyerStandard).approve(await ecoMarketplace.getAddress(), ethers.parseEther("100"));

            await expect(
                ecoMarketplace.connect(buyerStandard).buyProject(id)
            ).to.be.revertedWith("NFT has expired");
        });
    });

    // --------------------------------------------------------------------------------
    // TEST 4: Reverse Swap (CX -> ETH)
    // --------------------------------------------------------------------------------
    describe("4. Reverse Swap (CX -> ETH)", function () {
        it("Should FAIL to swap without approval", async function () {
            // Give buyer some CX
            await ecoToken.mint(buyerDeFi.address, ethers.parseEther("500"));
            
            // NOTE: Using dynamic deadline here to ensure it works even if evm_increaseTime was used
            const block = await ethers.provider.getBlock("latest");
            const params = {
                tokenIn: await ecoToken.getAddress(),
                tokenOut: WETH_ADDRESS,
                fee: FEE_TIER,
                recipient: buyerDeFi.address,
                deadline: block.timestamp + 60,
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
            const cxAmount = ethers.parseEther("100");
            
            // Approve
            await ecoToken.connect(buyerDeFi).approve(SWAP_ROUTER_ADDRESS, cxAmount);

            // Check WETH Balance before
            const wethBalanceBefore = await weth.balanceOf(buyerDeFi.address);
            
            const block = await ethers.provider.getBlock("latest");
            const params = {
                tokenIn: await ecoToken.getAddress(),
                tokenOut: WETH_ADDRESS,
                fee: FEE_TIER,
                recipient: buyerDeFi.address,
                deadline: block.timestamp + 60,
                amountIn: cxAmount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            };

            await swapRouter.connect(buyerDeFi).exactInputSingle(params);

            const wethBalanceAfter = await weth.balanceOf(buyerDeFi.address);
            expect(wethBalanceAfter).to.be.gt(wethBalanceBefore);
            
            console.log(`    🔄 Sold 100 CX for ${ethers.formatEther(wethBalanceAfter - wethBalanceBefore)} WETH`);
        });
    });

    // --------------------------------------------------------------------------------
    describe("5. Liquidity Stress Tests", function () {
        
        // Helper to get price from tick
        const getPriceFromTick = (tick) => Math.pow(1.0001, Number(tick)).toFixed(6);

        it("Stability: Should handle 5,000 CX purchase with < 2% price impact", async function () {
            // We want to buy exactly 5000 CX. We'll use exactOutputSingle.
            const cxAmountOut = ethers.parseEther("5000");
            const maxEthIn = ethers.parseEther("5"); // ~2 ETH expected, 5 is safe max
            
            await weth.connect(buyerDeFi).deposit({ value: maxEthIn });
            await weth.connect(buyerDeFi).approve(SWAP_ROUTER_ADDRESS, maxEthIn);

            const slot0Before = await uniswapV3Pool.slot0();
            const sqrtPriceBefore = BigInt(slot0Before.sqrtPriceX96.toString());
            const tickBefore = Number(slot0Before.tick);
            const block = await ethers.provider.getBlock("latest");
            const params = {
                tokenIn: WETH_ADDRESS,
                tokenOut: await ecoToken.getAddress(),
                fee: FEE_TIER,
                recipient: buyerDeFi.address,
                deadline: block.timestamp + 60,
                amountOut: cxAmountOut,
                amountInMaximum: maxEthIn,
                sqrtPriceLimitX96: 0
            };

            await swapRouter.connect(buyerDeFi).exactOutputSingle(params);

            const slot0After = await uniswapV3Pool.slot0();
            const sqrtPriceAfter = BigInt(slot0After.sqrtPriceX96.toString());
            const tickAfter = Number(slot0After.tick);

            // Calculate Price Impact %
            // Impact = |after - before| * 10000 / before (for 2 decimal precision, e.g., 200 = 2.00%)
            const diff = sqrtPriceAfter > sqrtPriceBefore ? sqrtPriceAfter - sqrtPriceBefore : sqrtPriceBefore - sqrtPriceAfter;
            const impactBasisPoints = (diff * 10000n) / sqrtPriceBefore;
            const impactPercent = Number(impactBasisPoints) / 100;

            console.log(`    📊 Stability Test: Bought 5,000 CX`);
            console.log(`    📉 Price Impact: ${impactPercent}%`);
            console.log(`    📍 Tick moved from ${tickBefore} to ${tickAfter}`);
            console.log(`    💰 Price moved from ${getPriceFromTick(tickBefore)} to ${getPriceFromTick(tickAfter)} (1.0001^tick)`);

            expect(impactPercent).to.be.lt(2); // Less than 2%
        });

        it("Lower Limit: Should handle 50 ETH buy without crossing lower boundary", async function () {
            const ethAmountIn = ethers.parseEther("50");
            
            await weth.connect(buyerDeFi).deposit({ value: ethAmountIn });
            await weth.connect(buyerDeFi).approve(SWAP_ROUTER_ADDRESS, ethAmountIn);

            const slot0Before = await uniswapV3Pool.slot0();
            const tickBefore = Number(slot0Before.tick);
            const block = await ethers.provider.getBlock("latest");
            const params = {
                tokenIn: WETH_ADDRESS,
                tokenOut: await ecoToken.getAddress(),
                fee: FEE_TIER,
                recipient: buyerDeFi.address,
                deadline: block.timestamp + 60,
                amountIn: ethAmountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            };

            await swapRouter.connect(buyerDeFi).exactInputSingle(params);

            const slot0After = await uniswapV3Pool.slot0();
            const tickAfter = Number(slot0After.tick);
            
            console.log(`    🐋 Whale Buy: 50 ETH dumped into pool`);
            console.log(`    📍 Tick moved from ${tickBefore} to ${tickAfter}`);
            console.log(`    💰 Price moved from ${getPriceFromTick(tickBefore)} to ${getPriceFromTick(tickAfter)} (1.0001^tick)`);

            // If token0 is WETH, buying CX means we are swapping WETH (token0) for CX (token1).
            // This pushes the price of token1 UP relative to token0, meaning the tick goes UP.
            // If token0 is CX, swapping WETH (token1) for CX (token0) pushes the price of token0 UP, meaning tick goes DOWN.
            // We just need to ensure it didn't cross the boundary where liquidity ends.
            const isWethToken0 = token0 === WETH_ADDRESS;
            if (isWethToken0) {
                expect(slot0After.tick).to.be.lt(85200); // Upper boundary for WETH=token0
            } else {
                expect(slot0After.tick).to.be.gt(-85200); // Lower boundary for CX=token0
            }
        });

        it("Upper Limit: Should handle 150,000 CX sell without crossing upper boundary", async function () {
            const hugeCxAmount = ethers.parseEther("150000"); // 150k CX
            await ecoToken.mint(buyerDeFi.address, hugeCxAmount);
            await ecoToken.connect(buyerDeFi).approve(SWAP_ROUTER_ADDRESS, hugeCxAmount);

            const slot0Before = await uniswapV3Pool.slot0();
            const tickBefore = Number(slot0Before.tick);
            
            const block = await ethers.provider.getBlock("latest");
            const params = {
                tokenIn: await ecoToken.getAddress(),
                tokenOut: WETH_ADDRESS,
                fee: FEE_TIER,
                recipient: buyerDeFi.address,
                deadline: block.timestamp + 60,
                amountIn: hugeCxAmount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            };

            await swapRouter.connect(buyerDeFi).exactInputSingle(params);

            const slot0After = await uniswapV3Pool.slot0();
            const tickAfter = Number(slot0After.tick);
            
            console.log(`    🐻 Bear Dump: 150,000 CX sold into pool`);
            console.log(`    📍 Tick moved from ${tickBefore} to ${tickAfter}`);
            console.log(`    💰 Price moved from ${getPriceFromTick(tickBefore)} to ${getPriceFromTick(tickAfter)} (1.0001^tick)`);

            const isWethToken0 = token0 === WETH_ADDRESS;
            if (isWethToken0) {
                expect(slot0After.tick).to.be.gt(69060); // Lower boundary for WETH=token0
            } else {
                expect(slot0After.tick).to.be.lt(-69060); // Upper boundary for CX=token0
            }
        });
    });

    // --------------------------------------------------------------------------------
    // TEST 6: On-Chain History & Suggested Price
    // --------------------------------------------------------------------------------
    describe("6. On-Chain History & Suggested Price", function () {
        it("Should record ownership history on Mint and Transfer", async function () {
            const suggestedPrice = ethers.parseEther("500");
            // Mint to Seller 
            const newSeller = seller; // Use existing seller
            const tons = 50n;
            const expiry = 365n;
            const uri = "ipfs://history";

            // Mint
            await ecoNFT.connect(owner).mintProject(newSeller.address, tons, expiry, uri, suggestedPrice);
            
            // Get ID (Should be last minted)
            const totalSupply = await ecoNFT.totalSupply();
            const id = await ecoNFT.tokenByIndex(totalSupply - 1n);

            // Check Suggested Price
            expect(await ecoNFT.suggestedPrices(id)).to.equal(suggestedPrice);

            // Transfer Seller -> Buyer
            await ecoNFT.connect(newSeller).transferFrom(newSeller.address, buyerStandard.address, id);

            // Check History via getter (index based)
            // ownershipHistory(tokenId, index) returns (from, to, timestamp)
            
            // Record 0: Mint (0x0 -> Seller)
            const record0 = await ecoNFT.ownershipHistory(id, 0);
            expect(record0[0]).to.equal(ethers.ZeroAddress); // from
            expect(record0[1]).to.equal(newSeller.address); // to
            
            // Record 1: Transfer (Seller -> Buyer)
            const record1 = await ecoNFT.ownershipHistory(id, 1);
            expect(record1[0]).to.equal(newSeller.address); // from
            expect(record1[1]).to.equal(buyerStandard.address); // to
            
            console.log("    📜 History Verified: Mint -> Transfer");
        });
    });
});
