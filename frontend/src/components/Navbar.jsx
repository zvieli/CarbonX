import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import './Navbar.css';

const Navbar = () => {
    const { account, connectWallet, isOwner } = useWeb3();
    const location = useLocation();

    // Faucet removed

    return (
        <nav className="navbar">
            <div className="container navbar-container glass-panel">
                <Link to="/" className="navbar-brand">
                    <img src="/op4.svg" alt="Logo" className="logo-icon" />
                    <span className="text text-gradient">CarbonX</span>
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

                    {/* Faucet removed */}

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
