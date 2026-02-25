import { useState } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { uploadToIPFS, testConnection } from '../services/pinata';
import { ethers } from 'ethers';
import { useNavigate } from 'react-router-dom';
import './AdminMint.css';
import './AdminMintStatus.css';

const AdminMint = () => {
    const { contracts, isOwner, loading } = useWeb3();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        tons: '',
        expiryDays: '365', // Default 1 year
        price: '', // New Price Field
        creatorAddress: '' // Optional Creator Address for Royalties
    });
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null); // Image Preview
    const [status, setStatus] = useState('');
    const [pinataStatus, setPinataStatus] = useState(null); // 'checking', 'success', 'error'
    const [progressStep, setProgressStep] = useState(0); // 0: Idle, 1: IPFS, 2: Mint, 3: Approve, 4: List
    const [isMinting, setIsMinting] = useState(false);

    if (loading) return <div className="container">Loading...</div>;
    if (!isOwner) return <div className="container"><p className="error-text">Access Denied: Admin only.</p></div>;

    const checkPinata = async () => {
        setPinataStatus('checking');
        setStatus('Checking IPFS Connection...');
        const result = await testConnection();
        if (result.success) {
            setPinataStatus('success');
            setStatus('IPFS Connection Verified');
        } else {
            setPinataStatus('error');
            setStatus(`IPFS Error: ${result.message}`);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            
            // Create Preview URL
            const objectUrl = URL.createObjectURL(selectedFile);
            setPreview(objectUrl);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Basic Validation
        if (!file || !formData.name || !formData.tons || !formData.price) {
            setStatus("Please fill in all fields (including Price).");
            return;
        }

        // Address Validation
        if (formData.creatorAddress && !ethers.isAddress(formData.creatorAddress)) {
            setStatus("Error: Invalid Creator Wallet Address.");
            return;
        }

        try {
            setIsMinting(true);
            
            // --- Step 1: IPFS Upload ---
            setProgressStep(1);
            setStatus("Uploading Metadata to IPFS...");

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

            // --- Step 2: Minting ---
            setProgressStep(2);
            setStatus("Minting CarbonX Project...");
            
            const adminAddress = await contracts.ecoNFT.runner.getAddress();
            // detailed: Use user input if valid, else default to admin
            const finalCreator = (formData.creatorAddress && ethers.isAddress(formData.creatorAddress)) 
                ? formData.creatorAddress 
                : adminAddress;

            const txMint = await contracts.ecoNFT.mintProject(
                finalCreator, // New Signature: creator first
                formData.tons,
                formData.expiryDays,
                tokenURI
            );
            
            setStatus("Waiting for Block Confirmation...");
            const receipt = await txMint.wait();
            
            // Parse Token ID from logs
            let tokenId = null;
            for (const log of receipt.logs) {
                try {
                    const parsed = contracts.ecoNFT.interface.parseLog(log);
                    if (parsed.name === 'Transfer') {
                        tokenId = parsed.args[2]; // tokenId is the 3rd argument in Transfer(from, to, tokenId)
                        break;
                    }
                } catch (e) { /* ignore other logs */ }
            }

            if (!tokenId) throw new Error("Failed to retrieve Token ID from receipt");
            console.log("Minted Token ID:", tokenId.toString());

            // --- Step 3: Listing (Approve + List) ---
            // Only list if Admin owns it (i.e. creator == admin)
            if (finalCreator.toLowerCase() === adminAddress.toLowerCase()) {
                setProgressStep(3);
                
                // Approve Marketplace
                setStatus("Approving Marketplace Contract...");
                const marketplaceAddress = await contracts.ecoMarketplace.getAddress();
                const txApprove = await contracts.ecoNFT.approve(marketplaceAddress, tokenId);
                await txApprove.wait();

                // List Project
                setStatus("Listing Token for Sale...");
                const priceWei = ethers.parseEther(formData.price.toString());
                const txList = await contracts.ecoMarketplace.listProject(tokenId, priceWei);
                await txList.wait();
                
                setStatus("Project Successfully Launched! Redirecting...");
            } else {
                setStatus(`Project Minted to ${finalCreator.slice(0,6)}...! (Auto-Listing skipped as you are not the owner)`);
                // Skip listing step visually
                setProgressStep(2); 
            }

            // Redirect to Dashboard
            setTimeout(() => {
                navigate('/');
            }, 3000);
            if (finalCreator.toLowerCase() === adminAddress.toLowerCase()) {
                setProgressStep(4); // Done
            }
            
        } catch (error) {
            console.error(error);
            setStatus(`Error: ${error.reason || error.message}`);
            setProgressStep(0);
        } finally {
            setIsMinting(false);
        }
    };

    return (
        <div className="container mint-page">
            <h2 className="page-title">Deploy New Asset</h2>
            
            <div className="admin-grid">
                {/* Left Column: Form */}
                <div className="card form-card">
                    {/* Progress Stepper */}
                    <div className="stepper-container">
                        <div className={`step-item ${progressStep >= 1 ? 'active' : ''} ${progressStep > 1 ? 'completed' : ''}`}>
                            <div className="step-icon"><i className="fas fa-cloud-upload-alt"></i></div>
                            <span>IPFS</span>
                        </div>
                        <div className={`step-line ${progressStep >= 2 ? 'active' : ''}`}></div>
                        <div className={`step-item ${progressStep >= 2 ? 'active' : ''} ${progressStep > 2 ? 'completed' : ''}`}>
                            <div className="step-icon"><i className="fas fa-cube"></i></div>
                            <span>Mint</span>
                        </div>
                        <div className={`step-line ${progressStep >= 3 ? 'active' : ''}`}></div>
                        <div className={`step-item ${progressStep >= 3 ? 'active' : ''} ${progressStep >= 3 ? 'completed' : ''}`}>
                            <div className="step-icon"><i className="fas fa-tag"></i></div>
                            <span>List</span>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Project Name</label>
                            <input name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Amazon Reforestation" />
                        </div>
                        
                        <div className="form-group">
                            <label>Description</label>
                            <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Project details and impact..." />
                        </div>

                        <div className="form-row">
                            <div className="form-group half">
                                <label>Carbon Tons</label>
                                <input name="tons" type="number" value={formData.tons} onChange={handleChange} placeholder="100" />
                            </div>

                            <div className="form-group half">
                                <label>Expiry (Days)</label>
                                <input name="expiryDays" type="number" value={formData.expiryDays} onChange={handleChange} />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Creator Wallet (Optional)</label>
                            <input 
                                name="creatorAddress" 
                                value={formData.creatorAddress} 
                                onChange={handleChange} 
                                placeholder="0x... (Leave empty to use your address)" 
                                className="font-mono text-sm"
                            />
                            <small className="form-text text-muted" style={{display:'block', marginTop:'4px', fontSize:'0.8em', color:'#888'}}>
                                Receives 10% royalty on sales. Defaults to Admin if empty.
                            </small>
                        </div>

                        <div className="form-group">
                            <label>Listing Price (CX)</label>
                            <input name="price" type="number" step="0.01" value={formData.price} onChange={handleChange} placeholder="e.g. 500" />
                        </div>

                        <div className="form-group">
                            <label>Project Image</label>
                            <div className="file-upload-wrapper">
                                <input type="file" id="file-upload" onChange={handleFileChange} accept="image/*" hidden />
                                <label htmlFor="file-upload" className="file-upload-label">
                                    <i className="fas fa-image"></i> {file ? file.name : "Choose Image"}
                                </label>
                            </div>
                        </div>

                        <div className="form-group">
                             <button type="button" onClick={checkPinata} className="btn-secondary btn-sm" disabled={pinataStatus === 'checking'}>
                                {pinataStatus === 'checking' ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-wifi"></i>} Check IPFS Connection
                             </button>
                             {pinataStatus === 'success' && <span className="text-success ml-2"> <i className="fas fa-check-circle"></i> Connected</span>}
                             {pinataStatus === 'error' && <span className="text-error ml-2"> <i className="fas fa-times-circle"></i> Failed</span>}
                        </div>

                        {status && (
                            <div className={`status-message ${status.includes("Error") ? "error" : "info"}`}>
                                {isMinting && <i className="fas fa-circle-notch fa-spin"></i>}
                                <span>{status}</span>
                            </div>
                        )}

                        <button type="submit" className="btn-primary full-width" disabled={isMinting}>
                            {isMinting ? "Processing Transaction..." : "Deploy to Blockchain"}
                        </button>
                    </form>
                </div>

                {/* Right Column: Live Preview */}
                <div className="preview-column">
                    <h3>Live Preview</h3>
                    <div className="nft-card-preview">
                        <div className="card-image-container">
                            {preview ? (
                                <img src={preview} alt="Preview" className={`preview-img ${progressStep === 1 ? 'scanning' : ''}`} />
                            ) : (
                                <div className="placeholder-image">
                                    <i className="fas fa-leaf"></i>
                                </div>
                            )}
                            {progressStep === 1 && <div className="scan-line"></div>}
                            <div className="card-badge">{formData.tons || '0'} Tons</div>
                        </div>
                        <div className="card-content">
                            <h4>{formData.name || 'Project Name'}</h4>
                            <p className="card-desc">{formData.description || 'Description will appear here...'}</p>
                            <div className="card-footer">
                                <div className="price-tag">
                                    <span className="label">Price</span>
                                    <span className="value">{formData.price || '0'} CX</span>
                                </div>
                                <button className="btn-outline btn-sm">Buy Now</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminMint;
