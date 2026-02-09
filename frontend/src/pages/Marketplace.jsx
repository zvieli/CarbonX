import { ethers } from 'ethers';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { getGatewayUrl } from '../services/pinata';
import './Marketplace.css';

const Marketplace = () => {
    const { contracts } = useWeb3();
    const [projects, setProjects] = useState([]);
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
                
                // Check Listing
                let listingInfo = null;
                try {
                    const listing = await contracts.ecoMarketplace.listings(tokenId);
                    if (listing && listing.price > 0n && !listing.sold) {
                        listingInfo = {
                            price: ethers.formatEther(listing.price),
                            seller: listing.seller
                        };
                    }
                } catch (err) {
                    console.warn("Listing check failed", tokenId);
                }

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

    if (!contracts.ecoNFT) return <div className="container text-center">Please connect wallet...</div>;

    return (
        <div className="container">
            <h1 className="page-title">Reforesation Projects</h1>
            
            {loading ? (
                <div className="loading-spinner">Loading...</div>
            ) : (
                <div className="grid-cards">
                    {projects.map((project) => (
                        <Link key={project.id} to={`/project/${project.id}`} className="project-card-link">
                            <div className={`card project-card ${project.isRetired ? 'retired' : ''}`}>
                                <div className="card-image-wrapper">
                                    {project.image ? (
                                        <img src={getGatewayUrl(project.image)} alt={project.name} />
                                    ) : (
                                        <div className="placeholder-image">🌿</div>
                                    )}
                                    {project.isRetired && <div className="badge retired-badge">RETIRED</div>}
                                    {project.listing && !project.isRetired && (
                                        <div className="badge price-badge">{project.listing.price} ECO</div>
                                    )}
                                </div>
                                <div className="card-content">
                                    <h3>{project.name}</h3>
                                    <div className="stat-row">
                                        <span><i className="fas fa-leaf"></i> {project.carbonTons} Tons</span>
                                        <span><i className="fas fa-clock"></i> {new Date(project.expiryDate * 1000).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}
                    {projects.length === 0 && <p>No projects found.</p>}
                </div>
            )}
        </div>
    );
};

export default Marketplace;
