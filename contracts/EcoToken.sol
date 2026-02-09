// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EcoToken is ERC20, Ownable {
    constructor() ERC20("EcoToken", "ECO") Ownable(msg.sender) {
        // Mint initial supply to the deployer (Owner)
        _mint(msg.sender, 100000000 * 10 ** decimals());
    }

    // Allow owner to mint more tokens (Liquidity management)
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    // Faucet for testing: Anyone can get 1000 tokens
    function faucet() external {
        _mint(msg.sender, 1000 * 10 ** decimals());
    }
}
