import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import './Navbar.css';

const Navbar = () => {
    const { account, connectWallet, isOwner } = useWeb3();
    const location = useLocation();

    return (
        <nav className="navbar">
            <div className="container navbar-container">
                <Link to="/" className="navbar-brand">
                    <span className="icon">
                        <img src="/op4.svg" alt="Logo" style={{ width: '100px', height: '100px' }} />
                    </span>
                    <span className="text">Proof Of Green</span>
                </Link>

                <div className="navbar-menu">
                    <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
                        Marketplace
                    </Link>
                    
                    {isOwner && (
                        <Link to="/admin" className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}>
                            Admin Panel
                        </Link>
                    )}

                    <button 
                        className="btn-primary" 
                        onClick={account ? () => {} : connectWallet}
                    >
                        {account 
                            ? `${account.substring(0, 6)}...${account.substring(account.length - 4)}` 
                            : 'Connect Wallet'
                        }
                    </button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
