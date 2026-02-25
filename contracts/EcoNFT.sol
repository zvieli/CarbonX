// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { ERC721URIStorage } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract EcoNFT is ERC721Enumerable, ERC721URIStorage, Ownable {
    struct ProjectData {
        uint128 carbonTons;
        uint64 creationDate;
        uint64 expiryDate;
        bool isRetired;
        address originalCreator;
    }

    event ProjectRetired(uint256 indexed tokenId);

    error NotMarketplace();
    error NotTokenOwner();
    error InvalidExpiry();

    mapping(uint256 => ProjectData) public projects;
    mapping(uint256 => uint256[]) public priceHistory;
    mapping(uint256 => address) public projectCreators;

    uint256 private _nextTokenId;
    address public marketplace;

    modifier onlyMarketplace() {
        if (msg.sender != marketplace) revert NotMarketplace();
        _;
    }

    constructor() ERC721("CarbonX Credit", "CXC") Ownable(msg.sender) {}

    function setMarketplace(address newMarketplace) external onlyOwner {
        marketplace = newMarketplace;
    }

    function mintProject(address creator, uint256 tons, uint256 expiryDays, string memory uri) external onlyOwner returns (uint256) {
        if (expiryDays == 0) revert InvalidExpiry();
        uint256 tokenId = ++_nextTokenId;
        
        // Mint directly to the Creator (Decentralized distribution)
        _safeMint(creator, tokenId);
        _setTokenURI(tokenId, uri);

        projectCreators[tokenId] = creator;

        projects[tokenId] = ProjectData({
            carbonTons: uint128(tons),
            creationDate: uint64(block.timestamp),
            expiryDate: uint64(block.timestamp + (expiryDays * 1 days)),
            isRetired: false,
            originalCreator: creator
        });

        return tokenId;
    }

    function recordSale(uint256 tokenId, uint256 price) external onlyMarketplace {
        priceHistory[tokenId].push(price);
    }

    function retire(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        projects[tokenId].isRetired = true;
        emit ProjectRetired(tokenId);
    }

    function priceHistoryLength(uint256 tokenId) external view returns (uint256) {
        return priceHistory[tokenId].length;
    }

    function isApprovedForAll(address owner, address operator) public view override(ERC721, IERC721) returns (bool) {
        if (operator == marketplace && marketplace != address(0)) {
            return true;
        }
        return super.isApprovedForAll(owner, operator);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Enumerable, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }
}
