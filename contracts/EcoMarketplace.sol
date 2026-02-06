// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { AggregatorV3Interface } from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import { ISwapRouter } from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

interface IPeripheryPayments {
    function refundETH() external payable;
}

interface IEcoNFT is IERC721 {
    function projects(uint256 tokenId)
        external
        view
        returns (
            uint128 carbonTons,
            uint64 creationDate,
            uint64 expiryDate,
            bool isRetired,
            address originalCreator
        );

    function recordSale(uint256 tokenId, uint256 price) external;
}

interface IEcoToken is IERC20 {
    function mint(address to, uint256 amount) external;
}

contract EcoMarketplace {
    using SafeERC20 for IERC20;

    struct Listing {
        address seller;
        uint256 priceInUSDC;
    }

    error NotTokenOwner();
    error NotApproved();
    error InvalidPrice();
    error NotListed();
    error ListingStale();
    error ListingExpired();
    error InsufficientETH();
    error TokenRetired();
    error InvalidOraclePrice();

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 priceInUSDC);
    event Purchased(uint256 indexed tokenId, address indexed buyer, uint256 priceInUSDC);
    event ListingCanceled(uint256 indexed tokenId, address indexed seller);

    IEcoNFT public immutable ecoNFT;
    IERC20 public immutable usdc;
    IEcoToken public immutable ecoToken;
    ISwapRouter public immutable swapRouter;
    AggregatorV3Interface public immutable ethUsdFeed;
    address public immutable weth;

    mapping(uint256 => Listing) public listings;

    constructor(address nft, address usdcAddress, address wethAddress, address router, address ethUsdFeedAddress, address ecoTokenAddress) {
        ecoNFT = IEcoNFT(nft);
        usdc = IERC20(usdcAddress);
        weth = wethAddress;
        swapRouter = ISwapRouter(router);
        ethUsdFeed = AggregatorV3Interface(ethUsdFeedAddress);
        ecoToken = IEcoToken(ecoTokenAddress);
    }

    function listNFT(uint256 tokenId, uint256 priceInUSDC) external {
        if (priceInUSDC == 0) revert InvalidPrice();
        if (ecoNFT.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (!ecoNFT.isApprovedForAll(msg.sender, address(this)) && ecoNFT.getApproved(tokenId) != address(this)) {
            revert NotApproved();
        }

        listings[tokenId] = Listing({ seller: msg.sender, priceInUSDC: priceInUSDC });
        emit Listed(tokenId, msg.sender, priceInUSDC);
    }

    function cancelListing(uint256 tokenId) external {
        Listing memory listing = listings[tokenId];
        if (listing.seller == address(0)) revert NotListed();
        if (listing.seller != msg.sender) revert NotTokenOwner();

        delete listings[tokenId];
        emit ListingCanceled(tokenId, msg.sender);
    }

    function buyWithETH(uint256 tokenId) external payable {
        Listing memory listing = listings[tokenId];
        if (listing.seller == address(0)) revert NotListed();
        if (ecoNFT.ownerOf(tokenId) != listing.seller) revert ListingStale();

        address originalCreator;
        {
            (,, uint64 expiryDate, bool isRetired, address creator) = ecoNFT.projects(tokenId);
            if (block.timestamp > expiryDate) revert ListingExpired();
            if (isRetired) revert TokenRetired();
            originalCreator = creator;
        }

        {
            // Price from Chainlink
            (, int256 ethUsdPrice,,,) = ethUsdFeed.latestRoundData();
            if (ethUsdPrice <= 0) revert InvalidOraclePrice();

            // Required Wei with 2% buffer
            uint256 requiredWei = ((listing.priceInUSDC * 1e20) / uint256(ethUsdPrice)) * 102 / 100;
            if (msg.value < requiredWei) revert InsufficientETH();
        }

        // Uniswap Swap
        ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter.ExactOutputSingleParams({
            tokenIn: weth,
            tokenOut: address(usdc),
            fee: 3000,
            recipient: address(this),
            deadline: block.timestamp,
            amountOut: listing.priceInUSDC,
            amountInMaximum: msg.value,
            sqrtPriceLimitX96: 0
        });

        // Execute Swap
        // Router refunds unused ETH as WETH to this contract
        swapRouter.exactOutputSingle{ value: msg.value }(params);

        // Unwrap WETH refund via Router
        IPeripheryPayments(address(swapRouter)).refundETH();

        // Refund EXACT surplus only based on actual balance returned
        uint256 balanceLeft = address(this).balance;
        if (balanceLeft > 0) {
            (bool success, ) = payable(msg.sender).call{value: balanceLeft}("");
            require(success, "Refund failed");
        }

        // Royalties
        uint256 royalty = listing.priceInUSDC / 10;
        uint256 sellerAmount = listing.priceInUSDC - royalty;

        usdc.safeTransfer(listing.seller, sellerAmount);
        usdc.safeTransfer(originalCreator, royalty);

        // State Update
        delete listings[tokenId];
        ecoNFT.recordSale(tokenId, listing.priceInUSDC);
        ecoNFT.safeTransferFrom(listing.seller, msg.sender, tokenId);

        // Reward
        ecoToken.mint(msg.sender, 10 * 10**18);

        emit Purchased(tokenId, msg.sender, listing.priceInUSDC);
    }
    receive() external payable {}
}
