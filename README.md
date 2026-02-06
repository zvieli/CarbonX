# EcoChain - POG (Proof of Green) 

This project implements an Eco-friendly NFT marketplace using **Hardhat**, **Ethers.js v6**, and **JavaScript (ESM)**. It allows for minting generic carbon credit projects as NFTs, trading them on a marketplace, and retiring them to offset carbon.
The project has been refactored from TypeScript/Ignition to standard **JavaScript ESM** scripts for simplicity.

## Features

- **EcoNFT**: ERC721 Token representing carbon credit projects. Supports carbon tonnage tracking and retirement.
- **EcoToken**: ERC20 Reward token.
- **EcoMarketplace**: Marketplace to buy/sell EcoNFTs using ETH (swapped via Uniswap V3) or direct listing mechanisms.
- **Mainnet Forking**: Tests run against a mainnet fork to utilize real Uniswap V3 pools and Chainlink Oracles.

## Prerequisites

- Node.js (v18+ recommended)
- NPM or Yarn
- Alchemy/Infura API Key (for Mainnet Forking in `hardhat.config.js`)

## Installation

1. Clone the repository.
2. Install dependencies:
   ```shell
   npm install
   ```
3. Update `hardhat.config.js` with your forking URL if running fork tests.

## Testing

Run the test suite (includes Unit tests and Mainnet Fork integration tests):

```shell
npx hardhat test
```

## Deployment

This project uses standard Hardhat scripts (no Ignition).

To deploy to the local Hardhat Network:
```shell
npx hardhat run scripts/deploy.js
```

To deploy to a specific network (e.g., localhost or sepolia):
```shell
npx hardhat run scripts/deploy.js --network localhost
```

## Project Structure

- **contracts/**: Solidity smart contracts (`EcoNFT.sol`, `EcoToken.sol`, `EcoMarketplace.sol`).
- **scripts/**: Deployment scripts (`deploy.js`) and maintenance scripts.
- **test/**: Tests converted to JavaScript (`EcoChain.js`, `EcoMarketplaceFork.js`).
- **hardhat.config.js**: Configuration file (ES Module).

## License

MIT
