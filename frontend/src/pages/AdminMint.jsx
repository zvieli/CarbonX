import { useState } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { uploadToIPFS } from '../services/pinata';
import './AdminMint.css';
import './AdminMintStatus.css';

const AdminMint = () => {
    const { contracts, isOwner, loading } = useWeb3();
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        tons: '',
        expiryDays: '365', // Default 1 year
    });
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState('');
    const [progressStep, setProgressStep] = useState(0); // 0: Idle, 1: IPFS, 2: Wallet Sign, 3: Confirmation
    const [isMinting, setIsMinting] = useState(false);

    if (loading) return <div className="container">Loading...</div>;
    if (!isOwner) return <div className="container"><p className="error-text">Access Denied: Admin only.</p></div>;

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file || !formData.name || !formData.tons) {
            setStatus("Please fill in all fields.");
            return;
        }

        try {
            setIsMinting(true);
            setProgressStep(1);
            setStatus("Uploading image and metadata to IPFS...");

            // 1. Upload Metadata to Pinata
            const metadata = {
                name: formData.name,
                description: formData.description,
                attributes: [
                    { trait_type: "Carbon Tons", value: formData.tons },
                    { trait_type: "Expiry Days", value: formData.expiryDays }
                ]
            };
            
            const tokenURI = await uploadToIPFS(file, metadata);
            console.log("Uploaded URI:", tokenURI);

            // 2. Mint on Blockchain
            setProgressStep(2);
            setStatus("Please confirm transaction in your wallet...");
            
            const tx = await contracts.ecoNFT.mintProject(
                await contracts.ecoNFT.runner.getAddress(), // Mint to self (admin) first
                formData.tons,
                formData.expiryDays,
                tokenURI
            );
            
            setProgressStep(3);
            setStatus("Waiting for block confirmation...");
            await tx.wait();

            setStatus("Successfully Minted!");
            setFormData({ name: '', description: '', tons: '', expiryDays: '365' });
            setFile(null);
            setProgressStep(0);
        } catch (error) {
            console.error(error);
            setStatus(`Error: ${error.message}`);
            setProgressStep(0);
        } finally {
            setIsMinting(false);
        }
    };

    return (
        <div className="container mint-page">
            <div className="card mint-card">
                <h2>Create New Carbon Credit</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Project Name</label>
                        <input name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Amazon Reforestation" />
                    </div>
                    
                    <div className="form-group">
                        <label>Description</label>
                        <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Project details..." />
                    </div>

                    <div className="form-group">
                        <label>Carbon Tons</label>
                        <input name="tons" type="number" value={formData.tons} onChange={handleChange} placeholder="100" />
                    </div>

                    <div className="form-group">
                        <label>Expiry (Days)</label>
                        <input name="expiryDays" type="number" value={formData.expiryDays} onChange={handleChange} />
                    </div>

                    <div className="form-group">
                        <label>Project Image</label>
                        <input type="file" onChange={handleFileChange} accept="image/*" />
                    </div>

                    {status && (
                        <div className={`status-box step-${progressStep}`}>
                            <p>{status}</p>
                            {progressStep > 0 && (
                                <div className="progress-indicators">
                                    <span className={progressStep >= 1 ? "active" : ""}>IPFS</span>
                                    <span className="arrow">→</span>
                                    <span className={progressStep >= 2 ? "active" : ""}>Sign</span>
                                    <span className="arrow">→</span>
                                    <span className={progressStep >= 3 ? "active" : ""}>Confirm</span>
                                </div>
                            )}
                        </div>
                    )}

                    <button type="submit" className="btn-primary" disabled={isMinting}>
                        {isMinting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-plus"></i>}
                        Mint Token
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AdminMint;
