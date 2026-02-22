import { useState, useEffect } from 'react';
import { getPrices } from '../services/PriceOracleService';
import './MarketStats.css';

const MarketStats = () => {
    const [stats, setStats] = useState({ ecoEth: '...', ethUsd: '...' });
    const [pulse, setPulse] = useState(false);
    
    // Liquidity Ranges
    const MIN_PRICE = 1000;
    const MAX_PRICE = 5000;

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await getPrices();
                if (data) {
                    setStats(data);
                    triggerPulse();
                }
            } catch (error) {
                console.error("Failed to fetch market stats", error);
            }
        };

        fetchStats();
        // Poll every 10 seconds
        const interval = setInterval(fetchStats, 10000); 

        return () => clearInterval(interval);
    }, []);

    const triggerPulse = () => {
        setPulse(true);
        setTimeout(() => setPulse(false), 1000);
    };

    // Calculate Progress Bar Width
    const calculateProgress = () => {
        const price = parseFloat(stats.ecoEth);
        if (isNaN(price)) return 50; 
        
        // Map [1000, 5000] to [0, 100]
        let percent = ((price - MIN_PRICE) / (MAX_PRICE - MIN_PRICE)) * 100;
        
        // Clamp
        if (percent < 0) percent = 0;
        if (percent > 100) percent = 100;
        
        return percent;
    };
    
    const progress = calculateProgress();
    const isDangerZone = progress < 10 || progress > 90;

    return (
        <div className="market-stats-container glass-panel">
            <div className="stats-row">
                <div className={`stats-item ${pulse ? 'pulse-green' : ''}`}>
                    <span className="stats-label">ECO Price</span>
                    <span className="stats-value">
                       <i className="fab fa-ethereum"></i> 1 ≈ {stats.ecoEth} ECO
                    </span>
                </div>
                <div className="stats-divider"></div>
                <div className={`stats-item ${pulse ? 'pulse-blue' : ''}`}>
                    <span className="stats-label">ETH/USD</span>
                    <span className="stats-value">
                        ${stats.ethUsd}
                    </span>
                </div>
            </div>
            
            {/* Pool Health / Depth Meter */}
            <div className="pool-health-meter">
                 <div className="health-labels">
                     <span>1,000 ECO</span>
                     <span className="health-title" style={{color: isDangerZone ? '#e74c3c' : 'var(--text-secondary)'}}>
                        Liquidity Depth {isDangerZone && '⚠️'}
                     </span>
                     <span>5,000 ECO</span>
                 </div>
                 <div className="health-bar-bg">
                     <div 
                        className="health-bar-fill" 
                        style={{
                            width: `${progress}%`,
                            backgroundColor: isDangerZone ? '#e74c3c' : 'var(--accent-color)'
                        }}
                     ></div>
                     <div className="health-marker" style={{left: `${progress}%`}}></div>
                 </div>
            </div>
        </div>
    );
};

export default MarketStats;
