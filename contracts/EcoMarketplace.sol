// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

// Minimal WETH Interface
interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

contract EcoMarketplace is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Listing {
        uint256 tokenId;
        address seller;
        uint256 price; // Price in EcoToken
        bool sold;
    }

    IERC721 public nftContract;
    IERC20 public ecoToken;
    ISwapRouter public constant swapRouter = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);
    address public constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    mapping(uint256 => Listing) public listings;
    
    event ProjectListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event ProjectSold(uint256 indexed tokenId, address indexed buyer, uint256 price);

    error NotListed();
    error AlreadySold();
    error IncorrectPrice();
    error TokenTransferFailed();

    constructor(address _nftContract, address _ecoToken) {
        nftContract = IERC721(_nftContract);
        ecoToken = IERC20(_ecoToken);
    }

    function listProject(uint256 tokenId, uint256 price) external {
        listings[tokenId] = Listing({
            tokenId: tokenId,
            seller: msg.sender,
            price: price,
            sold: false
        });

        emit ProjectListed(tokenId, msg.sender, price);
    }

    // Standard Buy: User pays with EcoToken (Requires Approve)
    function buyProject(uint256 tokenId) external nonReentrant {
        Listing storage listing = listings[tokenId];
        if (listing.price == 0) revert NotListed();
        if (listing.sold) revert AlreadySold();

        ecoToken.safeTransferFrom(msg.sender, listing.seller, listing.price);

        listing.sold = true;
        nftContract.safeTransferFrom(listing.seller, msg.sender, tokenId);

        emit ProjectSold(tokenId, msg.sender, listing.price);
    }

    // Advanced Buy: User pays with ETH -> Auto-Swap to EcoToken -> Buy
    function buyWithETH(uint256 tokenId) external payable nonReentrant {
        Listing storage listing = listings[tokenId];
        if (listing.price == 0) revert NotListed();
        if (listing.sold) revert AlreadySold();

        // 1. Wrap ETH
        IWETH(WETH9).deposit{value: msg.value}();

        // 2. Approve Router
        IERC20(WETH9).approve(address(swapRouter), msg.value);

        // 3. Swap WETH -> ECO
        ISwapRouter.ExactOutputSingleParams memory params =
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: WETH9,
                tokenOut: address(ecoToken),
                fee: 3000,
                recipient: address(this),
                deadline: block.timestamp,
                amountOut: listing.price,
                amountInMaximum: msg.value,
                sqrtPriceLimitX96: 0
            });

        uint256 amountIn = swapRouter.exactOutputSingle(params);

        // 4. Refund leftover ETH
        if (amountIn < msg.value) {
            uint256 refund = msg.value - amountIn;
            IWETH(WETH9).withdraw(refund);
            (bool success, ) = msg.sender.call{value: refund}("");
            require(success, "ETH Refund failed");
        }

        // 5. Reset Approval
        IERC20(WETH9).approve(address(swapRouter), 0);

        // 6. Complete Purchase
        ecoToken.safeTransfer(listing.seller, listing.price);
        
        listing.sold = true;
        nftContract.safeTransferFrom(listing.seller, msg.sender, tokenId);

        emit ProjectSold(tokenId, msg.sender, listing.price);
    }

    // Allow receiving ETH (for WETH unwrapping)
    receive() external payable {}
}
