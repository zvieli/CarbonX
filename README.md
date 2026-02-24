# CarbonX (CX)

This repository is a small DeFi / carbon‑credit demo combining an ERC20 token (CX), ERC721 carbon‑credit NFTs, a marketplace and Uniswap V3 liquidity to showcase lifecycle flows for issuing, listing, buying and retiring carbon credits.

**Current project status (2026-02-23)**

- Goal: provide a minimal environment to mint carbon‑credit NFTs, inject liquidity (Uniswap V3), trade credits and permanently retire them to record offsets on‑chain.
- Contracts:
   - `EcoToken.sol` (ERC20): initial supply is now 0; owner can `mint(...)`. The `faucet()` helper has been removed.
   - `EcoNFT.sol` (ERC721Enumerable): stores `projects[tokenId]` with `carbonTons`, `expiryDate`, `isRetired`. `retire()` marks a project retired and emits `ProjectRetired`.
   - `EcoMarketplace.sol`: marketplace with listing/buying flows; `listProject` now rejects listing if the NFT `isRetired`.

- Frontend:
   - Main pages: Dashboard (root `/`), Marketplace (`/marketplace`), Exchange (`/exchange`), Admin (`/admin`), Project details (`/project/:id`).
   - `useUserDashboard` hook fetches balances, NFTs and metadata (IPFS gateway conversion) and computes summaries. `totalCarbonOffset` counts only retired NFTs.
   - After actions (mint, list, buy, retire) the UI navigates back to the Dashboard (`/`) to reflect updated state.
   - Calls which previously risked gas estimation issues include `gasLimit: 3000000` where appropriate (e.g. `retire`, marketplace buys).

- Scripts:
   - `scripts/deploy.js` deploys contracts, mints the exact amount needed for liquidity (`ecoToken.mint(deployer, 250000)`), initializes Uniswap V3 pool and adds concentrated liquidity, and writes artifacts to `frontend/contracts`.

- Tests: `test/EcoDeFi.test.js` contains integration/stability checks executed against Hardhat (or a fork).

**Key recent changes**
- Removed the faucet: there is no free mint for arbitrary addresses anymore (security/eco control).
- Admin supply policy: constructor no longer mints; deploy script mints only the liquidity amount so admin balance is effectively 0 after liquidity provisioning.
- Marketplace blocks listing of retired NFTs.
- Dashboard and Project pages use navigation to `/` after transactions rather than full reloads.

**Quick start (development)**

1. Install dependencies (project root):

```bash
npm install
```

2. Start a local Hardhat node (separate terminal):

```bash
npm run node
```

3. Deploy contracts to local node:

```bash
npm run deploy
```

4. Start frontend (in `frontend/`):

```bash
cd frontend
npm install
npm run dev
```

5. Run tests:

```bash
npm test
```

**Rebuild artifacts / frontend ABI sync**
- The deploy script copies contract artifacts to `frontend/contracts`. If you change contracts, re-run:

```bash
npm run compile
npm run deploy
```

and, to refresh the built frontend bundle (optional):

```bash
cd frontend
npm run build
```

**Notes & next steps**
- Consider moving admin minting to a timelocked multisig for production.
- Add additional oracle redundancies for price feeds.
- If you want, I can also: update the repository README with badges, or add a short checklist for production hardening.

If you want the README translated to English or expanded with architecture diagrams and command examples, tell me which sections to expand.
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
````markdown
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

Run the test suite (includes Unit tests and Mainnet Fork integration tests) using the npm script:

```shell
npm run test
```

## Deployment

This project uses standard Hardhat scripts (no Ignition). Use the npm script to run the deploy script locally:

```shell
npm run deploy
```

To deploy to a specific network (for example `localhost`), pass the network flag through the npm script:

```shell
npm run deploy -- --network localhost
```

## Running a local Hardhat node (fork)

Start a local Hardhat node that forks mainnet (make sure your forking URL in the `node` script is correct):

```shell
npm run node
```

This will run the command defined in `package.json` which includes the `--fork` option.

## Frontend

Start the frontend dev server from the project root:

```shell
npm run front
```

## Project Structure

- **contracts/**: Solidity smart contracts (`EcoNFT.sol`, `EcoToken.sol`, `EcoMarketplace.sol`).
- **scripts/**: Deployment scripts (`deploy.js`) and maintenance scripts.
- **test/**: Tests converted to JavaScript (`EcoChain.js`, `EcoMarketplaceFork.js`).
- **hardhat.config.js**: Configuration file (ES Module).

## License

MIT

````
