import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { getGatewayUrl } from '../services/pinata';
import './ProjectDetails.css';

const ProjectDetails = () => {
    const { id } = useParams();
    const { contracts, isOwner, account } = useWeb3();
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState("");

    useEffect(() => {
        if (contracts.ecoNFT) {
            loadProjectDetails();
        }
    }, [contracts, id]);

    const loadProjectDetails = async () => {
        try {
            setLoading(true);
            const projectData = await contracts.ecoNFT.projects(id);
            const tokenURI = await contracts.ecoNFT.tokenURI(id);
            const ownerOf = await contracts.ecoNFT.ownerOf(id);
            
            // IPFS Fetch
            let metadata = { name: `Project #${id}`, image: '' };
            const gatewayUrl = getGatewayUrl(tokenURI);
            if (gatewayUrl) {
                const response = await fetch(gatewayUrl);
                metadata = await response.json();
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

    const retireToken = async () => {
        if (!project) return;
        try {
            setStatus("Retiring token...");
            const tx = await contracts.ecoNFT.retire(id);
            await tx.wait();
            setStatus("Token Retired Successfully!");
            loadProjectDetails();
        } catch (error) {
            console.error(error);
            setStatus("Error retiring token.");
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

                    <div className="actions">
                        {isMyToken && !project.isRetired && (
                            <button className="btn-primary bg-danger" onClick={retireToken}>
                                Retire Credit (Consume)
                            </button>
                        )}
                        {!isMyToken && !project.isRetired && (
                            <button className="btn-primary" disabled>
                                Buy on Marketplace (Checking Listings...)
                            </button>
                        )}
                    </div>
                     {status && <p className="status-message">{status}</p>}
                </div>
            </div>
        </div>
    );
};

export default ProjectDetails;
