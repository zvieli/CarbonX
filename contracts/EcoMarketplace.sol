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

interface IEcoNFT {
    function projects(uint256 tokenId) external view returns (uint128, uint64, uint64, bool, address);
    function projectCreators(uint256 tokenId) external view returns (address);
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
    
    event ProjectListed(uint256 indexed tokenId, address indexed seller, uint256 price, uint256 timestamp);
    event ProjectSold(uint256 indexed tokenId, address indexed buyer, uint256 price, uint256 timestamp);

    error NotListed();
    error AlreadySold();
    error IncorrectPrice();
    error TokenTransferFailed();

    constructor(address _nftContract, address _ecoToken) {
        nftContract = IERC721(_nftContract);
        ecoToken = IERC20(_ecoToken);
    }

    function listProject(uint256 tokenId, uint256 price) external {
        // Prevent listing of retired or expired NFTs
        (,, uint64 expiryDate, bool isRetired,) = IEcoNFT(address(nftContract)).projects(tokenId);
        require(!isRetired, "Cannot list retired NFT");
        require(block.timestamp < expiryDate, "Cannot list expired NFT");
        
        listings[tokenId] = Listing({
            tokenId: tokenId,
            seller: msg.sender,
            price: price,
            sold: false
        });

        emit ProjectListed(tokenId, msg.sender, price, block.timestamp);
    }

    // Standard Buy: User pays with EcoToken (Requires Approve)
    function buyProject(uint256 tokenId) external nonReentrant {
        Listing storage listing = listings[tokenId];
        if (listing.price == 0) revert NotListed();
        if (listing.sold) revert AlreadySold();

        // Check if expired during listing
        (,, uint64 expiryDate, bool isRetired,) = IEcoNFT(address(nftContract)).projects(tokenId);
        require(!isRetired, "NFT is retired");
        require(block.timestamp < expiryDate, "NFT has expired");

        // Calculate 10% royalty - LOGIC MOVED TO EcoNFT (or handled here + exempt)
        // User requested: "Marketplace transfers full amount... Marketplace sets itself as exempt"
        // If we do that, we rely on EcoNFT to charge royalty.
        // BUT EcoNFT charges sender. Sender is SELLER in transferFrom(seller, buyer).
        // So EcoNFT will charge SELLER 10%.
        // Therefore, Marketplace should send 100% to Seller. Seller then pays 10% to Creator via EcoNFT hook.
        
        // Transfer FULL price to seller
        ecoToken.safeTransferFrom(msg.sender, listing.seller, listing.price);

        listing.sold = true;
        // Marketplace is NOT exempt in this flow, so EcoNFT hook triggers on transferFrom
        // Wait, User said: "Marketplace defines itself as exempt... OR NFT detects call from marketplace... to avoid double charge".
        // If Marketplace IS exempt, EcoNFT does nothing. Then 0 royalty is paid.
        // It seems the user wants:
        // A) Marketplace handles it (Legacy) + Exempt. 
        // B) Marketplace sends 100% to seller -> EcoNFT charges seller 10% (New).
        // The user said: "Marketplace will transfer the full amount from buyer to seller." This implies B.
        // "The trick: ... Marketplace will set itself as exempt".
        // If Marketplace is exempt, EcoNFT logic: if (!isExempt[msg.sender])...
        // Who is msg.sender? Marketplace.
        // So if Marketplace is exempt, EcoNFT logic SKIPS.
        // Then NO royalty is paid. 
        // CONTADICTION in user prompt?
        // "Alternatively: Marketplace continues to collect 10%... but transfer is exempt."
        // Let's stick to the "Alternatively" as it guarantees royalty Payment.
        // It says: "Delete manual calculation... Marketplace transfers full amount... Marketplace sets itself as exempt". 
        // If I do that, royalty is lost.
        // Unless... the user thinks EcoNFT charges the BUYER?
        // EcoNFT logic: `transferFrom(from, creator, amount)`. `from` is the NFT sender (Seller).
        // So if Marketplace sends 100% to Seller. Then calls `nft.transferFrom(Seller, Buyer)`.
        // EcoNFT sees `msg.sender` = Marketplace.
        // If Marketplace is NOT exempt: `ecoToken.transferFrom(Seller, Creator, 10%)`.
        // This works! Seller receives 100%, pays 10%. Net 90%.
        // So Marketplace must NOT be exempt?
        // User said: "Marketplace will define itself as exempt... to avoid double payment".
        // This implies the user *thought* they would keep the manual calculation.
        // BUT, they also said "Delete the manual calculation".
        // So if I delete manual calculation, I must NOT be exempt for the logic to fire in EcoNFT.
        // BUT, the prompt says "Marketplace will define itself as exempt".
        // Let me re-read carefully.
        // "Marketplace defines itself as exempt... OR... to prevent double charging."
        // Calculate 10% royalty
        uint256 royalty = (listing.price * 10) / 100;
        uint256 sellerAmount = listing.price - royalty;

        address creator = IEcoNFT(address(nftContract)).projectCreators(tokenId);
        
        // Transfer to Creator (Royalty)
        if (creator != address(0)) {
             ecoToken.safeTransferFrom(msg.sender, creator, royalty);
        } else {
             sellerAmount += royalty;
        }

        // Transfer to Seller
        ecoToken.safeTransferFrom(msg.sender, listing.seller, sellerAmount);

        listing.sold = true;
        nftContract.safeTransferFrom(listing.seller, msg.sender, tokenId);

        emit ProjectSold(tokenId, msg.sender, listing.price, block.timestamp);
    }

    // Advanced Buy: User pays with ETH -> Auto-Swap to EcoToken -> Buy
    function buyWithETH(uint256 tokenId) external payable nonReentrant {
        Listing storage listing = listings[tokenId];
        if (listing.price == 0) revert NotListed();
        if (listing.sold) revert AlreadySold();
        
        // Check if expired during listing
        (,, uint64 expiryDate, bool isRetired,) = IEcoNFT(address(nftContract)).projects(tokenId);
        require(!isRetired, "NFT is retired");
        require(block.timestamp < expiryDate, "NFT has expired");

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
                deadline: block.timestamp + 60,
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
        // Calculate 10% royalty
        uint256 royalty = (listing.price * 10) / 100;
        uint256 sellerAmount = listing.price - royalty;

        address creator = IEcoNFT(address(nftContract)).projectCreators(tokenId);

        if (creator != address(0)) {
             ecoToken.safeTransfer(creator, royalty);
        } else {
             sellerAmount += royalty;
        }

        ecoToken.safeTransfer(listing.seller, sellerAmount);
        
        listing.sold = true;
        nftContract.safeTransferFrom(listing.seller, msg.sender, tokenId);

        emit ProjectSold(tokenId, msg.sender, listing.price, block.timestamp);
    }

    // Allow receiving ETH (for WETH unwrapping)
    receive() external payable {}
}
