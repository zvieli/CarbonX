import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import { getGatewayUrl } from '../services/pinata';
import { getPrices } from '../services/PriceOracleService';
import './ProjectDetails.css';

const ProjectDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { contracts, isOwner, account } = useWeb3();
    const [project, setProject] = useState(null);
    const [listing, setListing] = useState(null); // Stores listing info
    const [history, setHistory] = useState([]); // Array of {from, to, timestamp}
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("");

    const [listingPrice, setListingPrice] = useState("");
    const [showListingInput, setShowListingInput] = useState(false);

    useEffect(() => {
        if (contracts.ecoNFT && contracts.ecoMarketplace) {
            loadProjectDetails();
        }
    }, [contracts, id]);

    const loadProjectDetails = async () => {
        try {
            setLoading(true);
            const projectData = await contracts.ecoNFT.projects(id);
            const tokenURI = await contracts.ecoNFT.tokenURI(id);
            const ownerOf = await contracts.ecoNFT.ownerOf(id);
            
            // Check Marketplace Listing
            // Listing struct: tokenId, seller, price, sold
            const listingData = await contracts.ecoMarketplace.listings(id);
            if (listingData && listingData.price > 0n && !listingData.sold) {
                setListing({
                    price: ethers.formatEther(listingData.price),
                    seller: listingData.seller
                });
            } else {
                setListing(null);
            }

            // Fetch Suggested Price (for owner listing)
            try {
                const suggested = await contracts.ecoNFT.suggestedPrices(id);
                if (suggested > 0n) {
                    setListingPrice(ethers.formatEther(suggested));
                }
            } catch (e) {
                console.log("No suggested price or fetch failed");
            }

            // Fetch History
            try {
                const history = await contracts.ecoNFT.getProjectHistory(id);
                // history is array of [from, to, timestamp]
                setHistory(history.map(record => ({
                    from: record[0],
                    to: record[1],
                    timestamp: new Date(Number(record[2]) * 1000).toLocaleString()
                })));
            } catch (e) {
                console.log("No history", e);
            }

            // IPFS Fetch
            let metadata = { name: `Project #${id}`, image: '' };
            const gatewayUrl = getGatewayUrl(tokenURI);
            if (gatewayUrl) {
                const response = await fetch(gatewayUrl);
                const jsonMeta = await response.json();
                if (jsonMeta.image) {
                     jsonMeta.image = getGatewayUrl(jsonMeta.image);
                }
                metadata = jsonMeta;
            }

            setProject({
                ...projectData,
                ...metadata,
                owner: ownerOf,
                carbonTons: projectData.carbonTons.toString(),
                expiryDate: new Date(Number(projectData.expiryDate) * 1000).toLocaleDateString(),
                isRetired: projectData.isRetired
            });
        } catch (error) {
            console.error("Error loading details:", error);
            setStatus("Project not found.");
        } finally {
            setLoading(false);
        }
    };

    const handleListProject = async () => {
        if (!listingPrice || isNaN(listingPrice) || parseFloat(listingPrice) <= 0) {
            setStatus("Invalid price");
            return;
        }

        try {
            setStatus("Approving Marketplace...");
            const marketplaceAddress = await contracts.ecoMarketplace.getAddress();
            
            // 1. Approve (Double Transaction UX)
            const approval = await contracts.ecoNFT.getApproved(id);
            if (approval.toLowerCase() !== marketplaceAddress.toLowerCase()) {
                 setStatus("Step 1/2: Approving Marketplace access... (Please sign)");
                 const txApprove = await contracts.ecoNFT.approve(marketplaceAddress, id);
                 await txApprove.wait();
            }

            setStatus("Step 2/2: Confirming Listing... (Please sign)");
            
            // 2. List
            const priceWei = ethers.parseEther(listingPrice);
            const txList = await contracts.ecoMarketplace.listProject(id, priceWei);
            await txList.wait();

            setStatus("Project Listed Successfully!");
            setShowListingInput(false);
            setTimeout(() => navigate('/'), 2000);
        } catch (error) {
            console.error(error);
            setStatus("Listing failed: " + (error.reason || error.message));
        }
    };

    const retireToken = async () => {
        if (!project) return;
        try {
            setStatus("Retiring token...");
            const tx = await contracts.ecoNFT.retire(id);
            await tx.wait();
            setStatus("Token Retired Successfully!");
            setTimeout(() => navigate('/'), 2000);
        } catch (error) {
            console.error(error);
            setStatus("Error retiring token.");
        }
    };

    const buyWithEco = async () => {
        if (!listing) return;
        try {
            setStatus("Approving CarbonX Token...");
            const priceWei = ethers.parseEther(listing.price);
            
            // Check Allowance
            const marketplaceAddr = await contracts.ecoMarketplace.getAddress();
            const allowance = await contracts.ecoToken.allowance(account, marketplaceAddr);
            
            if (allowance < priceWei) {
                const txApprove = await contracts.ecoToken.approve(marketplaceAddr, priceWei);
                await txApprove.wait();
            }

            setStatus("Buy with CX...");
            const txBuy = await contracts.ecoMarketplace.buyProject(id, { gasLimit: 3000000 });
            await txBuy.wait();
            
            setStatus("Purchase Successful!");
            setTimeout(() => navigate('/'), 2000);
        } catch (error) {
            console.error("Buy CX failed:", error);
            setStatus("Purchase failed: " + (error.reason || error.message));
        }
    };

    const buyWithEth = async () => {
        if (!listing) return;
        try {
            setStatus("Calculating minimal ETH required...");
            
            // 1. Get Real-time Price
            const prices = await getPrices();
            const ecoPerEth = parseFloat(prices.ecoEth); // e.g., 2500
            if (!ecoPerEth || ecoPerEth <= 0) throw new Error("Price feed unavailable");

            // 2. Calculate ETH needed (with safety margin)
            // Listing Price (ECO) / (ECO per ETH) = ETH Base Cost
            // We add 2% slippage protection locally to ensure tx doesn't fail due to small price moves
            const listingPriceECO = parseFloat(listing.price);
            const ethBaseCost = listingPriceECO / ecoPerEth;
            const ethWithSlippage = ethBaseCost * 1.05; // 5% buffer (contract refunds difference)

            console.log(`Price: 1 ETH = ${ecoPerEth} CX`);
            console.log(`Cost: ${listingPriceECO} CX -> ${ethBaseCost} ETH`);
            console.log(`Sending: ${ethWithSlippage} ETH (Safety buffer included)`);

            setStatus(`Buying with ETH (DeFi Swap)... Sending ~${ethWithSlippage.toFixed(5)} ETH`);
            
            const valueToSend = ethers.parseEther(ethWithSlippage.toFixed(18));
            const txBuy = await contracts.ecoMarketplace.buyWithETH(id, { 
                value: valueToSend,
                gasLimit: 3000000 
            });
            await txBuy.wait();

            setStatus("Purchase Successful! (Excess ETH Refunded)");
            setTimeout(() => navigate('/'), 2000);
        } catch (error) {
            console.error("Buy ETH failed:", error);
            setStatus("DeFi Purchase failed: " + (error.reason || error.message));
        }
    };


    if (loading) return <div className="container">Loading...</div>;
    if (!project) return <div className="container">not found</div>;

    const isMyToken = account && project.owner.toLowerCase() === account.toLowerCase();

    return (
        <div className="container details-page">
            <div className="details-grid">
                <div className="details-image card">
                     {project.image && <img src={getGatewayUrl(project.image)} alt={project.name} />}
                </div>

                <div className="details-info card">
                    <h1>{project.name}</h1>
                    <p className="description">{project.description}</p>
                    
                    <div className="stats-grid">
                        <div className="stat-box">
                            <label>Carbon Tons</label>
                            <span className="value">{project.carbonTons}</span>
                        </div>
                        <div className="stat-box">
                            <label>Expiry Date</label>
                            <span className="value">{project.expiryDate}</span>
                        </div>
                        <div className="stat-box">
                            <label>Status</label>
                            <span className={`value ${project.isRetired ? 'text-danger' : 'text-accent'}`}>
                                {project.isRetired ? 'RETIRED' : 'Active'}
                            </span>
                        </div>
                    </div>

                    <p className="owner-text">Owner: <span className="mono">{project.owner}</span></p>

                    {listing && (
                        <div className="listing-info">
                            <h3>For Sale</h3>
                            <p className="price-tag">{listing.price} CX</p>
                            <p>or pay with ETH (auto-swap)</p>
                        </div>
                    )}

                    <div className="actions">
                        {isMyToken && !project.isRetired && !listing && !showListingInput && (
                            <button className="btn-secondary" onClick={() => setShowListingInput(true)}>
                                List for Sale
                            </button>
                        )}
                        
                        {isMyToken && showListingInput && (
                             <div className="listing-input-group">
                                <input 
                                    type="number" 
                                    placeholder="Price in CX" 
                                    value={listingPrice}
                                    onChange={(e) => setListingPrice(e.target.value)}
                                    className="price-input"
                                />
                                <div className="button-group-row">
                                    <button className="btn-primary" onClick={handleListProject}>Confirm Listing</button>
                                    <button className="btn-secondary" onClick={() => setShowListingInput(false)}>Cancel</button>
                                </div>
                             </div>
                        )}
                        
                        {isMyToken && !project.isRetired && (
                            <button className="btn-primary bg-danger" onClick={retireToken}>
                                Retire Credit (Consume)
                            </button>
                        )}

                        {!isMyToken && !project.isRetired && listing && (
                            <div className="buy-buttons">
                                <button className="btn-primary" onClick={buyWithEco}>
                                    Buy with CX (Standard)
                                </button>
                                <button className="btn-secondary" onClick={buyWithEth}>
                                    Buy with ETH (DeFi)
                                </button>
                            </div>
                        )}
                        
                        {!isMyToken && !project.isRetired && !listing && (
                            <div className="status-badge-large not-listed-badge">
                                <i className="fas fa-eye-slash"></i> Not Listed for Sale
                            </div>
                        )}


                    </div>
                     {status && <p className="status-message">{status}</p>}
                </div>
                
                {/* History Table */}
                <div className="card full-width history-section">
                    <h3>Ownership History</h3>
                    <table className="history-table">
                        <thead>
                            <tr>
                                <th>From</th>
                                <th>To</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.length === 0 ? (
                                <tr><td colSpan="3">No history recorded</td></tr>
                            ) : (
                                history.map((record, index) => (
                                    <tr key={index}>
                                        <td className="mono">{record.from === ethers.ZeroAddress ? "MINT" : record.from.substring(0,6) + "..." + record.from.substring(38)}</td>
                                        <td className="mono">{record.to === ethers.ZeroAddress ? "BURN" : record.to.substring(0,6) + "..." + record.to.substring(38)}</td>
                                        <td>{record.timestamp}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ProjectDetails;
