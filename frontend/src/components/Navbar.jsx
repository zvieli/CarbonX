import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import './Navbar.css';

const Navbar = () => {
    const { account, connectWallet, isOwner } = useWeb3();
    const location = useLocation();

    // Mock Faucet Function
    const handleFaucet = () => {
        alert("Faucet: 1000 ECO Tokens requested! (Logic to be implemented)");
    };

    return (
        <nav className="navbar">
            <div className="container navbar-container glass-panel">
                <Link to="/" className="navbar-brand">
                    <img src="/op4.svg" alt="Logo" className="logo-icon" />
                    <span className="text text-gradient">Proof Of Green</span>
                </Link>

                <div className="navbar-menu">
                    <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
                        Dashboard
                    </Link>

                    <Link to="/marketplace" className={`nav-link ${location.pathname === '/marketplace' ? 'active' : ''}`}>
                        Marketplace
                    </Link>

                    <Link to="/exchange" className={`nav-link ${location.pathname === '/exchange' ? 'active' : ''}`}>
                        Exchange
                    </Link>
                    
                    {isOwner && (
                        <Link to="/admin" className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}>
                            Admin Panel
                        </Link>
                    )}

                    <button className="btn-outline faucet-btn" onClick={handleFaucet}>
                        <i className="fas fa-faucet"></i> Get Free ECO
                    </button>

                    {account ? (
                        <div className="wallet-badge">
                            <span className="indicator"></span>
                            {account.substring(0, 6)}...{account.substring(account.length - 4)}
                        </div>
                    ) : (
                        <button className="btn-primary" onClick={connectWallet}>
                            Connect Wallet
                        </button>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
