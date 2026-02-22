import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import { getPrices, getQuote } from '../services/PriceOracleService';
import './Exchange.css';

// Uniswap V3 SwapRouter on Mainnet
const SWAP_ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // Mainnet WETH

const Exchange = () => {
    const { contracts, account, loading: web3Loading, connectWallet } = useWeb3();
    const [stats, setStats] = useState({ ecoEth: '0', ethUsd: '0', rawPrice: 0 });
    const [inputAmount, setInputAmount] = useState('');
    const [outputAmount, setOutputAmount] = useState('');
    const [isEthToEco, setIsEthToEco] = useState(true);
    const [balances, setBalances] = useState({ eth: '0.0', eco: '0.0' });
    const [needsApproval, setNeedsApproval] = useState(false);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [priceImpact, setPriceImpact] = useState({ percent: 0, color: 'var(--success)' });

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await getPrices();
                if (data) setStats(data);
            } catch (error) {
                console.error("Failed to fetch prices", error);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 10000); // 10s poll
        return () => clearInterval(interval);
    }, []);

    // Fetch Balances
    useEffect(() => {
        const fetchBalances = async () => {
            if (!account || !contracts.ecoToken) return;
            try {
                // ETH Balance
                const provider = contracts.ecoToken.runner.provider;
                const ethBal = await provider.getBalance(account);
                
                // ECO Balance
                const ecoBal = await contracts.ecoToken.balanceOf(account);
                
                setBalances({
                    eth: parseFloat(ethers.formatEther(ethBal)).toFixed(4),
                    eco: parseFloat(ethers.formatEther(ecoBal)).toFixed(2)
                });
            } catch (error) {
                console.error("Error fetching balances:", error);
            }
        };

        if (account) {
            fetchBalances();
            const interval = setInterval(fetchBalances, 10000);
            return () => clearInterval(interval);
        }
    }, [account, contracts]);

    // Check Allowance (Only when selling ECO)
    useEffect(() => {
        const checkAllowance = async () => {
            // Only need approval if we are converting ECO -> ETH
            if (isEthToEco || !inputAmount || !account || !contracts.ecoToken) {
                setNeedsApproval(false);
                return;
            }

            try {
                const amountWei = ethers.parseEther(inputAmount);
                const allowance = await contracts.ecoToken.allowance(account, SWAP_ROUTER_ADDRESS);
                
                if (allowance < amountWei) {
                    setNeedsApproval(true);
                } else {
                    setNeedsApproval(false);
                }
            } catch (error) {
                console.error("Error checking allowance:", error);
            }
        };

        const timer = setTimeout(checkAllowance, 500); // Debounce
        return () => clearTimeout(timer);
    }, [inputAmount, isEthToEco, account, contracts]);

    // Auto-calculate output when input changes
    useEffect(() => {
        const calculateQuote = async () => {
            if (!inputAmount || isNaN(inputAmount) || parseFloat(inputAmount) <= 0) {
                setOutputAmount('');
                setPriceImpact({ percent: 0, color: 'var(--success)' });
                return;
            }

            const inVal = parseFloat(inputAmount);
            const spotPrice = parseFloat(stats.ecoEth); // ECO per ETH (e.g. 2500)

            // Get exact quote including impact
            const quoteOut = await getQuote(inVal, isEthToEco);
            
            if (quoteOut) {
                const outVal = parseFloat(quoteOut);
                
                // Calculate Impact
                // Execution Price = Output / Input
                // If ETH -> ECO: ExPrice (ECO/ETH) = outVal / inVal. Ideal = spotPrice.
                // If ECO -> ETH: ExPrice (ETH/ECO) = outVal / inVal. Ideal = 1/spotPrice.
                
                let executionPrice = 0;
                let idealPrice = 0;
                let impact = 0;

                if (isEthToEco) {
                    executionPrice = outVal / inVal;
                    idealPrice = spotPrice;
                    // Impact = (Ideal - Execution) / Ideal
                    if (idealPrice > 0) impact = ((idealPrice - executionPrice) / idealPrice) * 100;
                } else {
                    // Start w/ spotPrice (ECO/ETH). Ideal Price (ETH/ECO) = 1/spotPrice
                    executionPrice = outVal / inVal; 
                    idealPrice = spotPrice > 0 ? 1 / spotPrice : 0;
                    if (idealPrice > 0) impact = ((idealPrice - executionPrice) / idealPrice) * 100;
                }
                
                // Set Color
                let color = 'var(--success)'; // Green
                if (impact > 1 && impact <= 3) color = '#f39c12'; // Yellow
                if (impact > 3) color = '#e74c3c'; // Red

                setPriceImpact({ percent: impact.toFixed(2), color });
                setOutputAmount(isEthToEco ? outVal.toFixed(2) : outVal.toFixed(6));
            } else {
                 // Fallback to estimation if quote fails
                 const rate = spotPrice;
                 let estimatedOut = isEthToEco ? inVal * rate : (rate > 0 ? inVal / rate : 0);
                 const afterFee = estimatedOut * 0.997; 
                 setOutputAmount(isEthToEco ? afterFee.toFixed(2) : afterFee.toFixed(6));
            }
        };

        const timer = setTimeout(calculateQuote, 500); // 500ms Debounce
        return () => clearTimeout(timer);

    }, [inputAmount, stats.ecoEth, isEthToEco]);

    const handleApprove = async () => {
        if (!inputAmount) return;
        setLoading(true);
        setStatus("Approving ECO...");

        try {
            const amountWei = ethers.parseEther(inputAmount);
            // Approve slightly more to be safe or exact amount
            const tx = await contracts.ecoToken.approve(SWAP_ROUTER_ADDRESS, amountWei);
            await tx.wait();
            
            setStatus("Approval Successful! You can swap now.");
            setNeedsApproval(false);
        } catch (error) {
            console.error(error);
            setStatus("Approval Failed: " + (error.reason || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleSwap = async () => {
        if (!inputAmount || parseFloat(inputAmount) <= 0) {
            setStatus("Please enter a valid amount");
            return;
        }
        setLoading(true);
        setStatus("Starting Swap...");

        try {
            if (!contracts.ecoToken) throw new Error("Wallet not fully connected");
            const signer = contracts.ecoToken.runner;
            if (!signer) throw new Error("Signer not found");

            // We need a router instance connected to the Signer to send transactions
            const routerAbi = [
                "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
                // Note: For advanced ETH output, we would need multicall + unwrapWETH9, but exactInputSingle returns WETH if tokenOut is WETH.
                // We will stick to WETH output for simplicity in V3 unless we add multicall logic.
            ];

            const router = new ethers.Contract(SWAP_ROUTER_ADDRESS, routerAbi, signer);
            const ecoAddress = await contracts.ecoToken.getAddress();
            const amountInWei = ethers.parseEther(inputAmount);
            
            const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20m

            if (isEthToEco) {
                // ETH -> ECO
                // Standard: Send ETH value, tokenIn is WETH address
                const params = {
                    tokenIn: WETH_ADDRESS,
                    tokenOut: ecoAddress,
                    fee: 3000,
                    recipient: account,
                    deadline: deadline,
                    amountIn: amountInWei,
                    amountOutMinimum: 0, 
                    sqrtPriceLimitX96: 0
                };
                
                const tx = await router.exactInputSingle(params, { value: amountInWei });
                setStatus("Transaction sent! Waiting...");
                await tx.wait();

            } else {
                // ECO -> ETH (WETH)
                // Requires Approval (handled by UI state)
                
                const params = {
                    tokenIn: ecoAddress,
                    tokenOut: WETH_ADDRESS,
                    fee: 3000,
                    recipient: account, // User gets WETH
                    deadline: deadline,
                    amountIn: amountInWei,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                };
                
                // No value sent, just standard ERC20 swap
                const tx = await router.exactInputSingle(params);
                setStatus("Transaction sent! Waiting...");
                await tx.wait();
            }

            setStatus("Swap Successful! 🌿");
            setInputAmount('');
            setOutputAmount('');
            setTimeout(() => setStatus(''), 5000);
            
        } catch (error) {
            console.error(error);
            setStatus("Swap Failed: " + (error.reason || error.message));
        } finally {
            setLoading(false);
        }
    };

    const toggleDirection = () => {
        setIsEthToEco(!isEthToEco);
        setInputAmount('');
        setOutputAmount('');
    };

    if (web3Loading) return <div className="container">Loading Web3...</div>;

    const tokenIn = isEthToEco ? { symbol: 'ETH', name: 'Ethereum', balance: balances.eth } : { symbol: 'ECO', name: 'EcoToken', balance: balances.eco };
    const tokenOut = isEthToEco ? { symbol: 'ECO', name: 'EcoToken', balance: balances.eco } : { symbol: 'ETH', name: 'Ethereum (WETH)', balance: balances.eth };

    return (
        <div className="container exchange-page">
            <div className="swap-box glass-panel">
                <div className="swap-header">
                    <h2><i className="fas fa-exchange-alt"></i> Green Swap</h2>
                    <p>Instant {isEthToEco ? "ETH » ECO" : "ECO » ETH"} Exchange</p>
                </div>

                <div className="swap-body">
                    {/* Input Field */}
                    <div className="input-container">
                        <div className="label-row">
                            <label>You Pay</label>
                            <span className="balance">Balance: {tokenIn.balance}</span>
                        </div>
                        <div className="input-row">
                            <input 
                                type="number" 
                                placeholder="0.0" 
                                value={inputAmount}
                                onChange={(e) => setInputAmount(e.target.value)}
                            />
                            <div className={`token-badge ${tokenIn.symbol === 'ECO' ? 'eco' : ''}`}>
                                {tokenIn.symbol === 'ECO' ? <i className="fas fa-leaf"></i> : <i className="fab fa-ethereum"></i>}
                                &nbsp;{tokenIn.symbol}
                            </div>
                        </div>
                    </div>

                    {/* Toggle Arrow */}
                    <div className="swap-arrow-container" onClick={toggleDirection}>
                         <div className="swap-arrow-circle">
                            <i className="fas fa-arrow-down"></i>
                         </div>
                    </div>

                    {/* Output Field */}
                    <div className="input-container">
                        <div className="label-row">
                            <label>You Receive (Est.)</label>
                            <span className="balance">Balance: {tokenOut.balance}</span>
                        </div>
                        <div className="input-row">
                            <input 
                                type="text" 
                                placeholder="0.0" 
                                readOnly 
                                value={outputAmount}
                                className="readonly-input"
                            />
                            <div className={`token-badge ${tokenOut.symbol === 'ECO' ? 'eco' : ''}`}>
                                {tokenOut.symbol === 'ECO' ? <i className="fas fa-leaf"></i> : <i className="fab fa-ethereum"></i>}
                                &nbsp;{tokenOut.symbol}
                            </div>
                        </div>
                    </div>

                    <div className="price-info">
                        <div className="rate-row">
                            <span>Rate</span>
                            <span>1 ETH ≈ {stats.ecoEth} ECO</span>
                        </div>
                        {parseFloat(inputAmount) > 0 && (
                            <div className="rate-row" style={{marginTop: '0.5rem', color: priceImpact.color}}>
                                <span>Price Impact</span>
                                <span>
                                    {priceImpact.percent}% 
                                    <span style={{fontSize:'0.8em', marginLeft:'5px'}}>
                                        ({parseFloat(priceImpact.percent) < 1 ? 'Optimal' : 
                                          parseFloat(priceImpact.percent) < 3 ? 'Warning' : 'High Slippage'})
                                    </span>
                                </span>
                            </div>
                        )}
                    </div>

                    {!account ? (
                        <button className="swap-btn connect-mode" onClick={connectWallet}>
                            Connect Wallet
                        </button>
                    ) : (
                        <button 
                            className={`swap-btn ${needsApproval ? 'approve-mode' : 'swap-mode'}`}
                            onClick={needsApproval ? handleApprove : handleSwap}
                            disabled={loading || (!needsApproval && (!inputAmount || parseFloat(inputAmount) <= 0))}
                        >
                            {loading ? <i className="fas fa-circle-notch fa-spin"></i> : (needsApproval ? `Approve ${isEthToEco ? 'ETH' : 'ECO'}` : "Swap Now")}
                        </button>
                    )}

                    {status && (
                        <div className={`status-msg ${status.includes("Failed") ? "error" : "success"}`}>
                            {status}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Exchange;
