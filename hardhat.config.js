import "@nomicfoundation/hardhat-toolbox";
import "hardhat-tracer";

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: "0.8.28",
  networks: {
    hardhat: {
      forking: {
        url: "https://eth-mainnet.g.alchemy.com/v2/C71xjjRnVc5bmInmm-AQ3",
      },
      chainId: 31337,
      initialBaseFeePerGas: 0,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
   
  },
  tracer: {
    enabled: true,
    nameTags: {
      // Known Uniswap V3 Addresses (Mainnet)
      "0x1F98431c8aD98523631AE4a59f267346ea31F984": "UniswapV3Factory",
      "0xE592427A0AEce92De3Edee1F18E0157C05861564": "SwapRouter",
      "0xC36442b4a4522E871399CD717aBDD847Ab11FE88": "NonfungiblePositionManager",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": "WETH",
      "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419": "Chainlink ETH/USD",
      "0x61fFE014bA17989E743c5F6cB21bF9697530B21e": "QuoterV2",
      "0x7d4e742018fb52e48b08be73d041c18b21de6fb5": "Uniswap Permit2"
    }
  }
};

export default config;