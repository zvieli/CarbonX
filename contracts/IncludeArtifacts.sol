// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

contract IncludeArtifacts {
    // This contract is just to force Hardhat to compile these interfaces
    // so we can use them in tests via getContractAt("InterfaceName", ...)
}
