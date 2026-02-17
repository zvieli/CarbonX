import { ethers } from 'ethers';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { getGatewayUrl } from '../services/pinata';
import MarketStats from '../components/MarketStats';
import './Marketplace.css';


const Marketplace = () => {
    const { contracts } = useWeb3();
    const [projects, setProjects] = useState([]);
    const [showListedOnly, setShowListedOnly] = useState(false);
    const [loading, setLoading] = useState(true);

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

            // Loop backwards to show newest first, limit to 20 for now
            const total = Number(totalSupply);
            for (let i = total; i > 0 && i > total - 20; i--) {
                const tokenId = i;
                
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
                      metadata = await response.json();
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

                                    <div className="card-footer">
                                        {project.listing && !project.listing.sold && !project.isRetired ? (
                                            <div className="price-display">
                                                <span className="price-label">Price</span>
                                                <span className="price-amount text-gradient">{project.listing.price} ECO</span>
                                            </div>
                                        ) : (
                                            <div className="status-text">
                                                {project.isRetired ? "Retired Asset" : (project.listing?.sold ? "Recently Sold" : "Not Listed")}
                                            </div>
                                        )}
                                        
                                        <div className="action-arrow">
                                            <i className="fas fa-arrow-right"></i>
                                        </div>
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
