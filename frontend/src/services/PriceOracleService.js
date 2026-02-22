import { ethers } from "ethers";
import ContractAddresses from "../../contracts/contract-addresses.json";

// Constants (Mainnet Fork)
const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const QUOTER_V2_ADDRESS = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
const CHAINLINK_ETH_USD_FEED = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const ECO_TOKEN_ADDRESS = ContractAddresses.EcoToken;
const POOL_FEE = 3000; // 0.3%

// Minimal ABIs
const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"
];

const QUOTER_V2_ABI = [
  "function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
];

const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
];

const CHAINLINK_ABI = [
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"
];

let provider = null;
let cachedPoolAddress = null;

export const initProvider = (web3Provider) => {
    if (web3Provider) {
        provider = web3Provider;
    } else {
        // Fallback to a read-only provider if no wallet connected
        // For local hardhat node
        provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545"); 
    }
};

export const getPrices = async () => {
    if (!provider) initProvider();

    try {
        // 1. Get Pool Address (with caching)
        if (!cachedPoolAddress) {
            const factory = new ethers.Contract(UNISWAP_V3_FACTORY, FACTORY_ABI, provider);
            const poolAddress = await factory.getPool(WETH_ADDRESS, ECO_TOKEN_ADDRESS, POOL_FEE);
            
            if (poolAddress === ethers.ZeroAddress) {
                console.warn("Pool not found");
                return { ecoEth: "0", ethUsd: "0", rawPrice: 0 };
            }
            cachedPoolAddress = poolAddress;
        }

        // 2. Get Slot0 (Price)
        const pool = new ethers.Contract(cachedPoolAddress, POOL_ABI, provider);
        const [sqrtPriceX96] = await pool.slot0();

        // 3. Calculate Price: (sqrtPriceX96 / 2^96) ^ 2
        // We want ETH per ECO or ECO per ETH? 
        // Usually we want "1 ETH = X ECO"
        // If token0 is WETH and token1 is ECO: Price = ECO / ETH
        // If token0 is ECO and token1 is WETH: Price = ETH / ECO
        
        // Check sort order
        const isToken0Weth = BigInt(WETH_ADDRESS) < BigInt(ECO_TOKEN_ADDRESS);
        
        // Calculate SqrtPrice safely using BigInt math for the numerator
        // Price = (sqrtPriceX96 / 2^96)^2
        // We calculate (sqrtPriceX96^2 * 10^18) / 2^192 to keep precision and get a scaled number
        // Then standard formatUnits
        
        const n = BigInt(sqrtPriceX96);
        const shifted192 = BigInt(1) << BigInt(192);
        
        // We want 18 decimals of precision for the price
        // price * 1e18 = (n^2 * 1e18) / 2^192
        const numerator = (n * n) * BigInt(10)**BigInt(18);
        const priceReference18 = numerator / shifted192;
        
        // Convert to float
        const priceNum = Number(priceReference18) / 1e18;

        let ecoPerEth = 0;
        if (isToken0Weth) {
             // price is token1/token0 -> ECO/ETH
             ecoPerEth = priceNum;
        } else {
             // price is token0/token1 -> ETH/ECO
             // We need inverted price: 1/Price
             ecoPerEth = priceNum === 0 ? 0 : 1 / priceNum;
             // OR safer:
             // 1 / ( (n^2)/2^192 ) = 2^192 / n^2
             // scaled: (2^192 * 1e18) / n^2
        }

        // 4. Get Chainlink Data
        const feed = new ethers.Contract(CHAINLINK_ETH_USD_FEED, CHAINLINK_ABI, provider);
        const [, answer] = await feed.latestRoundData();
        // Chainlink ETH/USD has 8 decimals
        const ethUsd = Number(ethers.formatUnits(answer, 8));

        return {
            ecoEth: ecoPerEth.toFixed(2),
            ethUsd: ethUsd.toFixed(2),
            rawPrice: ecoPerEth // Use ecoPerEth as rawPrice for easier calculations
        };

    } catch (error) {
        console.error("Oracle Error:", error);
        return { ecoEth: "2500.00", ethUsd: "3000.00", rawPrice: 2500 }; // Fallback
    }
};

export const getQuote = async (amountIn, isEthToEco) => {
    if (!provider) initProvider();
    try {
        const quoter = new ethers.Contract(QUOTER_V2_ADDRESS, QUOTER_V2_ABI, provider);
        const tokenIn = isEthToEco ? WETH_ADDRESS : ECO_TOKEN_ADDRESS;
        const tokenOut = isEthToEco ? ECO_TOKEN_ADDRESS : WETH_ADDRESS;
        
        const params = {
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: ethers.parseEther(amountIn.toString()),
            fee: POOL_FEE,
            sqrtPriceLimitX96: 0
        };

        // Use staticCall to simulate the transaction and get the return value
        const result = await quoter.quoteExactInputSingle.staticCall(params);
        return ethers.formatEther(result.amountOut);
    } catch (error) {
        console.error("Quoter Error:", error);
        return null;
    }
};
