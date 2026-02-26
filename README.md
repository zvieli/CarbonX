# CarbonX (CX) - Decentralized Carbon Credit Marketplace

**CarbonX** is a comprehensive blockchain platform demonstrating the full lifecycle of Carbon Credits on Ethereum. It integrates ERC20 tokens, ERC721 NFTs, a decentralized marketplace, and Uniswap V3 liquidity to allow seamless trading, retiring, and tracking of environmental assets.

---

## 🚀 Key Features

### 1. **EcoNFT (ERC721 Enumerable)**
- Represents a **Carbon Project** with metadata: `Carbon Tons`, `Expiry Date`, `IsRetired`.
- **On-Chain History:** Tracks transfer ownership history immutably.
- **Enforced Royalties:** 10% royalty paid to the original creator on **every** transfer (even OTC/Wallet-to-Wallet).
- **Retirement Mechanism:** Permanently burns the credit usage (state change) to offset carbon emissions.

### 2. **EcoToken (ERC20)**
- The native currency of the platform.
- Used for purchasing credits and paying royalties.

### 3. **EcoMarketplace**
- Trustless trading of Carbon Credits.
- **DeFi Zap:** Allows users to buy credits directly with **ETH** (auto-swaps to CX via Uniswap V3).
- **Exempt Logic:** Avoids double-taxation of royalties during marketplace sales.

### 4. **DeFi Integration (Uniswap V3)**
- **Concentrated Liquidity:** Provisions liquidity in the 2000-3000 CX/ETH range for high capital efficiency.
- **Oracle Integration:** Initializes pool prices using real-world math ($\sqrt{P_{x96}}$).

---

## 🛠️ Tech Stack

- **Solidity 0.8.20** (Smart Contracts)
- **Hardhat** (Development Environment & Mainnet Forking)
- **Ethers.js v6** (Frontend-Blockchain Interaction)
- **React + Vite** (Frontend)
- **Pinata (IPFS)** (Decentralized Metadata Storage)
- **Uniswap V3** (DEX Integration)

---

## 📦 Installation & Setup

**Prerequisites:**
- Node.js (v18+)
- **Alchemy API Key** (Required for Mainnet Forking in `package.json`)

### 1. Clone & Install
```bash
git clone https://github.com/CarbonX-Project/CarbonX.git
npm install
cd frontend && npm install && cd ..
```

### 2. Start Local Blockchain (Mainnet Fork)
This command forks the Ethereum Mainnet state to your local machine, allowing interaction with real Uniswap contracts.
```bash
npm run node
```
*(Keep this terminal running)*

### 3. Deploy Ecosystem
Deploys contracts, adds liquidity, and syncs artifacts to the frontend.
```bash
npm run deploy
```

### 4. Launch Frontend
```bash
npm run front
```
The app will open at `http://localhost:5173`.

---

## 🧪 Testing

We use Hardhat test suite with Chai assertions.
```bash
npm run test
```
*   Verifies Token/NFT deployment.
*   Tests Uniswap V3 swaps and price impact.
*   Validates Royalty Logic and Marketplace constraints.

---

## 🐛 Known Limitations (For Course Submission)

1.  **External Transfers:** Users MUST click **"Enable External Transfers"** on the Dashboard before sending NFTs directly via MetaMask. This approves the Royalty contract.
2.  **"Sender Pays" Model:** In a direct transfer (gift), the *Sender* pays the 10% royalty fee.
3.  **Admin Listing:** The Admin cannot list an item on behalf of a user immediately after minting (requires user approval).

---

## 📁 Project Structure

```
CarbonX/
├── contracts/          # Solidity Smart Contracts
├── frontend/           # React Application
│   ├── src/
│   ├── public/
│   └── contracts/      # Auto-generated ABIs
├── scripts/            # Deployment & Maintenance Scripts
├── test/               # Integration Tests
└── hardhat.config.js   # Network Configuration
```

---

## 📜 License
MIT

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
