import { ethers } from 'ethers';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { getGatewayUrl } from '../services/pinata';
import { getQuote } from '../services/PriceOracleService';
import MarketStats from '../components/MarketStats';
import './Marketplace.css';


const Marketplace = () => {
    const { contracts } = useWeb3();
    const [projects, setProjects] = useState([]);
    const [showListedOnly, setShowListedOnly] = useState(false);
    const [loading, setLoading] = useState(true);
    const [ethPreview, setEthPreview] = useState({});

    useEffect(() => {
        if (contracts.ecoNFT && contracts.ecoMarketplace) {
            loadProjects();
        }
    }, [contracts]);

    const loadProjects = async () => {
        try {
            setLoading(true);
            const totalSupply = await contracts.ecoNFT.totalSupply();
            const loadedProjects = [];

            // Loop backwards using tokenByIndex to handle burned tokens correctly
            const total = Number(totalSupply);
            for (let i = total - 1; i >= 0 && i >= total - 20; i--) {
                let tokenId;
                try {
                    tokenId = await contracts.ecoNFT.tokenByIndex(i);
                } catch (e) {
                    console.warn("Skipping token index", i, e);
                    continue;
                }
                
                // Fetch Chain Data
                const projectData = await contracts.ecoNFT.projects(tokenId);
                const tokenURI = await contracts.ecoNFT.tokenURI(tokenId);
                
                // Fetch Listing Info
                let listingInfo = null;
                try {
                    const listing = await contracts.ecoMarketplace.listings(tokenId);
                    // Check if it's listed (price > 0 and not sold) or just sold for history
                    if (listing.price > 0n) {
                        listingInfo = {
                            price: ethers.formatEther(listing.price),
                            seller: listing.seller,
                            sold: listing.sold
                        };
                    }
                } catch (err) { /* Not listed */ }

                // Fetch IPFS Metadata
                let metadata = { name: `Project #${tokenId}`, image: '' };
                try {
                    const gatewayUrl = getGatewayUrl(tokenURI);
                    if (gatewayUrl) {
                      const response = await fetch(gatewayUrl);
                      const jsonMeta = await response.json();
                      if (jsonMeta.image) {
                           jsonMeta.image = getGatewayUrl(jsonMeta.image);
                      }
                      metadata = jsonMeta;
                    }
                } catch (e) {
                    console.warn("Failed to fetch metadata for", tokenId, e);
                }

                loadedProjects.push({
                    id: tokenId,
                    ...projectData,
                    ...metadata,
                    // Parse BigInts for display
                    carbonTons: projectData.carbonTons.toString(),
                    expiryDate: Number(projectData.expiryDate),
                    isRetired: projectData.isRetired,
                    listing: listingInfo
                });
            }

            setProjects(loadedProjects);
            
            // Background pre-fetch ETH prices for listed items
            loadedProjects.forEach(async (p) => {
                if (p.listing && !p.listing.sold) {
                    try {
                        // Project price is in ECO
                        // We need to know how much ETH to pay to get THAT specific amount of ECO
                        // So input is ETH (unknown), output is ECO (known = p.listing.price)
                        
                        // BUT: SwapRouter typically uses exactInput or exactOutput.
                        // Our buyWithETH uses exactInputSingle logic in the contract?
                        // Actually, EcoMarketplace.buyWithETH takes ETH and swaps exactOutput?
                        // Let's check EcoMarketplace.sol CONTRACT.
                        // "swapRouter.exactInputSingle{value: msg.value}(params)"
                        // It uses exactInputSingle with ALL the msg.value. 
                        // So we need to estimate how much ETH gives >= listing.price ECO.
                        
                        // Reverse quote: How much ETH (Input) for X ECO (Output)?
                        // Quoter: quoteExactOutputSingle(tokenIn, tokenOut, amountOut, fee, limit)
                        // But we only have quoteExactInputSingle in our simplified Oracle Service if V2 is strict.
                        // Let's use getQuote(1 ETH) to get rate, then calculate.
                        
                        // Approx: Price = ECO/ETH.  ETH needed = ECO_Price / Rate.
                        // Add buffer.
                        
                        const rate = await getQuote(1, true); // 1 ETH -> ? ECO
                        if (rate) {
                           const ecoPerEth = parseFloat(rate);
                           const ecoPrice = parseFloat(p.listing.price);
                           const estimatedEth = ecoPrice / ecoPerEth;
                           
                           // Add 0.5% buffer for slippage + fees
                           const safeEth = estimatedEth * 1.005; 
                           
                           setEthPreview(prev => ({
                               ...prev,
                               [p.id]: safeEth.toFixed(4)
                           }));
                        }
                    } catch (e) {
                         console.warn("Price preview failed", e);
                    }
                }
            });

        } catch (error) {
            console.error("Error loading projects:", error);
        } finally {
            setLoading(false);
        }
    };

    if (!contracts.ecoNFT) return <div className="container text-center text-accent" style={{marginTop:'5rem'}}>Waiting for connection...</div>;
    
    // Filter logic
    const displayedProjects = showListedOnly 
        ? projects.filter(p => p.listing && !p.listing.sold && !p.isRetired)
        : projects;    

    return (
        <div className="container">
            <MarketStats />
            <div className="marketplace-header glass-panel" style={{marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div>

                   <h1 className="text-gradient">Marketplace</h1>
                   <p style={{color: 'var(--text-secondary)'}}>Discover verified carbon offsets.</p>
                </div>
                
                <div className="filter-controls">
                    <label className="checkbox-wrapper">
                        <input 
                            type="checkbox" 
                            checked={showListedOnly} 
                            onChange={(e) => setShowListedOnly(e.target.checked)} 
                        />
                        <span className="checkbox-custom"></span>
                        <span className="label-text">For Sale Only</span>
                    </label>
                </div>
            </div>
            
            {loading ? (
                <div className="loading-container">
                    <i className="fas fa-circle-notch fa-spin fa-2x text-accent"></i>
                    <p>Loading Assets...</p>
                </div>
            ) : (
                <div className="grid-cards">
                    {displayedProjects.map((project) => (
                        <Link key={project.id} to={`/project/${project.id}`} className="project-card-link">
                            <div className={`card project-card ${project.isRetired ? 'retired-card' : ''}`}>
                                <div className="card-image-wrapper">
                                    {project.image ? (
                                        <img src={getGatewayUrl(project.image)} alt={project.name} />
                                    ) : (
                                        <div className="placeholder-image"><i className="fas fa-leaf"></i></div>
                                    )}
                                    
                                    {/* Status Badges */}
                                    {project.isRetired && <div className="badge retired-badge">RETIRED</div>}
                                    {project.listing?.sold && !project.isRetired && <div className="badge sold-badge">SOLD</div>}
                                </div>

                                <div className="card-content">
                                    <div className="card-title-row">
                                        <h3>{project.name}</h3>
                                        <div className="token-id">#{project.id}</div>
                                    </div>
                                    
                                    <div className="stats-grid">
                                        <div className="stat">
                                            <span className="label">Carbon</span>
                                            <span className="value text-accent">{project.carbonTons} t</span>
                                        </div>
                                        <div className="stat">
                                            <span className="label">Expiry</span>
                                            <span className="value">
                                                {new Date(project.expiryDate * 1000).toLocaleDateString(undefined, {year: '2-digit', month:'short'})}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="card-footer" style={{flexDirection: 'column', alignItems: 'flex-start'}}>
                                        {project.listing && !project.listing.sold && !project.isRetired ? (
                                            <>
                                                <div className="price-display">
                                                    <span className="price-label">Price</span>
                                                    <span className="price-amount text-gradient">{project.listing.price} CX</span>
                                                </div>
                                                {ethPreview[project.id] && (
                                                    <div style={{fontSize: '0.75rem', color: '#95a5a6', marginTop: '0.2rem'}}>
                                                       <i className="fab fa-ethereum"></i> ~{ethPreview[project.id]} ETH
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="status-text">
                                                {project.isRetired ? "Retired Asset" : (project.listing?.sold ? "Recently Sold" : "Not Listed")}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="action-arrow" style={{position: 'absolute', bottom: '1rem', right: '1rem'}}>
                                            <i className="fas fa-arrow-right"></i>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}
                    {projects.length === 0 && <div className="empty-state">No projects found.</div>}
                </div>
            )}
        </div>
    );
};

export default Marketplace;
