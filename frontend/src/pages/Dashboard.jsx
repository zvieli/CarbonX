import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUserDashboard } from '../hooks/useUserDashboard';
import { useWeb3 } from '../context/Web3Context';
import { ethers } from 'ethers';
import './Dashboard.css'; // Will create this next

const Dashboard = () => {
    const { data, loading, refresh } = useUserDashboard();
    const { contracts, account } = useWeb3();
    const [actionLoading, setActionLoading] = useState(false);
    const [status, setStatus] = useState('');

    const handleCopy = () => {
        navigator.clipboard.writeText(account);
        setStatus('Address Copied!');
        setTimeout(() => setStatus(''), 2000);
    };

    // Faucet removed

    const handleRetire = async (id) => {
        if (!window.confirm("Are you sure you want to retire this credit? This action is irreversible.")) return;
        
        try {
            setActionLoading(true);
            setStatus(`Retiring Credit #${id}...`);
            
            // Add gasLimit manually to prevent estimation errors
            const tx = await contracts.ecoNFT.retire(id, { gasLimit: 3000000 });
            await tx.wait();
            
            setStatus('Credit Retired Successfully!');
            alert(`Verified: Credit #${id} has been permanently retired from circulation.`);
            
            refresh();
            // Optional: Reload page to ensure all states are clean
            // setTimeout(() => window.location.reload(), 2000); 
        } catch (error) {
            console.error(error);
            setStatus('Retire Failed: ' + (error.reason || error.message));
        } finally {
            setActionLoading(false);
        }
    };

    const handleEnableExternalTransfers = async () => {
        try {
            setActionLoading(true);
            setStatus('Approving External Transfers...');
            const tx = await contracts.ecoToken.approve(contracts.ecoNFT.target, ethers.MaxUint256);
            await tx.wait();
            setStatus('External Transfers Enabled!');
            alert('Success! You can now transfer tokens via MetaMask while supporting creators.');
        } catch (error) {
            console.error(error);
            setStatus('Approval Failed: ' + (error.reason || error.message));
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return (
        <div className="container dashboard-loading">
            <div className="spinner"></div>
            <p>Loading your green portfolio...</p>
        </div>
    );

    if (!account) return (
         <div className="container text-center" style={{marginTop:'5rem'}}>
             <h2>Please Connect Wallet</h2>
         </div>
    );

    return (
        <div className="container dashboard-page">
            <div className="dashboard-header">
                <div>
                    <h1>My Dashboard</h1>
                    <div className="wallet-address" onClick={handleCopy}>
                        {account} <i className="far fa-copy"></i>
                    </div>
                </div>
                <div className="header-actions">
                    <button 
                        className="cta-button secondary small"
                        onClick={handleEnableExternalTransfers}
                        disabled={actionLoading}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                    >
                        Enable External Transfers
                    </button>
                </div>
            </div>

            {/* Status Message */}
            {status && <div className={`status-banner ${status.includes('Failed') ? 'error' : 'success'}`}>{status}</div>}

            {/* Summary Cards */}
            <div className="stats-grid dashboard-stats">
                <div className="stat-card">
                    <div className="icon-wrapper eco-bg"><i className="fas fa-coins"></i></div>
                    <div className="stat-content">
                        <h3>CX Balance</h3>
                        <div className="value">{data.ecoBalance} CX</div>
                        <div className="sub-value">≈ {data.ecoBalanceEth} ETH</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="icon-wrapper carbon-bg"><i className="fas fa-smog"></i></div>
                    <div className="stat-content">
                        <h3>Total Offset</h3>
                        <div className="value">{data.totalCarbonOffset} Tons</div>
                        <div className="sub-value">Lifecycle Impact</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="icon-wrapper active-bg"><i className="fas fa-check-circle"></i></div>
                    <div className="stat-content">
                        <h3>Active Credits</h3>
                        <div className="value">{data.activeCredits}</div>
                        <div className="sub-value">Tradable Assets</div>
                    </div>
                </div>
            </div>

            {/* Assets Gallery */}
            <h2 className="section-title">My Green Assets</h2>
            {data.myNFTs.length === 0 ? (
                <div className="empty-state">
                    <i className="fas fa-leaf fa-3x"></i>
                    <p>No carbon credits found. Visit the Marketplace!</p>
                    <Link to="/marketplace" className="btn-secondary">Go to Marketplace</Link>
                </div>
            ) : (
                <div className="assets-grid">
                    {data.myNFTs.map(nft => (
                        <div key={nft.id} className={`asset-card ${nft.isRetired ? 'retired' : ''}`}>
                            <div className="asset-image">
                                {nft.image ? <img src={nft.image} alt={nft.name} /> : <div className="placeholder"></div>}
                                <span className={`status-badge ${nft.isRetired ? 'retired' : (nft.isListed ? 'listed' : 'active')}`}>
                                    {nft.isRetired ? 'RETIRED' : (nft.isListed ? `LISTED: ${nft.listingPrice} CX` : 'ACTIVE')}
                                </span>
                            </div>
                            
                            <div className="asset-details">
                                <h4>{nft.name}</h4>
                                <div className="asset-meta">
                                    <span>#{nft.id}</span>
                                    <span>{nft.carbonTons} Tons</span>
                                </div>
                                
                                <div className="asset-actions">
                                    {!nft.isRetired && (
                                        <>
                                            <button 
                                                className="btn-icon retire-btn" 
                                                onClick={() => handleRetire(nft.id)}
                                                title="Retire Credit"
                                                disabled={actionLoading}
                                            >
                                                <i className="fas fa-burn"></i> Retire
                                            </button>
                                            
                                            {!nft.isListed && (
                                                <Link to={`/project/${nft.id}`} className="btn-icon list-btn" title="List for Sale">
                                                    <i className="fas fa-tag"></i> List
                                                </Link>
                                            )}
                                        </>
                                    )}
                                    <Link to={`/project/${nft.id}`} className="btn-icon view-btn" title="View Details">
                                        <i className="fas fa-eye"></i>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Dashboard;
