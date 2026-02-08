import "@nomicfoundation/hardhat-toolbox";

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: "0.8.28",
  networks: {
    // hardhat: {
     
    //   chainId: 31337,
    //   initialBaseFeePerGas: 0
    // },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    },
   
  }
};

export default config;