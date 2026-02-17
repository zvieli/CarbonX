import { useState, useEffect } from 'react';
import { getPrices } from '../services/PriceOracleService';
import './MarketStats.css';

const MarketStats = () => {
    const [stats, setStats] = useState({ ecoEth: '...', ethUsd: '...' });
    const [pulse, setPulse] = useState(false);

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

    return (
        <div className="market-stats-container glass-panel">
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
    );
};

export default MarketStats;
