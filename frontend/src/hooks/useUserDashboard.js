import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import { getPrices } from '../services/PriceOracleService';
import { getGatewayUrl } from '../services/pinata';

export const useUserDashboard = () => {
    const { contracts, account } = useWeb3();
    const [data, setData] = useState({
        ecoBalance: '0',
        ecoBalanceEth: '0',
        ecoBalanceUsd: '0',
        totalCarbonOffset: 0,
        activeCredits: 0,
        myNFTs: []
    });
    const [loading, setLoading] = useState(true);
    const [blockNumber, setBlockNumber] = useState(0);

    // Listener for new blocks to auto-refresh
    useEffect(() => {
        if (contracts.ecoToken && contracts.ecoToken.runner && contracts.ecoToken.runner.provider) {
            const provider = contracts.ecoToken.runner.provider;
            const onBlock = (blk) => setBlockNumber(blk);
            provider.on("block", onBlock);
            return () => {
                provider.off("block", onBlock);
            };
        }
    }, [contracts.ecoToken]);

    const fetchData = useCallback(async () => {
        if (!account || !contracts.ecoToken || !contracts.ecoNFT || !contracts.ecoMarketplace) return;

        try {
            // 1. Fetch ECO Balance
            const balanceWei = await contracts.ecoToken.balanceOf(account);
            const balanceEco = parseFloat(ethers.formatEther(balanceWei));

            // 2. Fetch Prices (Oracle)
            const prices = await getPrices(); 
            // prices = { ecoEth: "2500.00", ethUsd: "3000.00", rawPrice: 2500 } (approx structure)
            
            // Calculate Value
            // ecoBalanceEth = balanceEco / ecoPerEth ? 
            // Wait, PriceOracleService returns { ecoEth: "2500.00" } which means 1 ETH = 2500 ECO
            // So 1 ECO = 1/2500 ETH.
            // Value in ETH = balanceEco * (1/ecoPerEth)
            const ecoPerEth = parseFloat(prices.ecoEth) || 1;
            const valueEth = balanceEco / ecoPerEth;
            
            const ethUsd = parseFloat(prices.ethUsd) || 0;
            const valueUsd = valueEth * ethUsd;

            // 3. Fetch NFTs (ERC721Enumerable)
            const balanceNFT = await contracts.ecoNFT.balanceOf(account);
            const count = Number(balanceNFT);
            
            // Parallel Fetching using Promise.all
            // Create array of indices [0, 1, ... count-1]
            const indices = Array.from({ length: count }, (_, i) => i);
            
            const tokenIds = await Promise.all(indices.map(async (i) => {
                const tokenId = await contracts.ecoNFT.tokenOfOwnerByIndex(account, i);
                return tokenId;
            }));

            // Fetch details for each Token ID
            const nfts = await Promise.all(tokenIds.map(async (tokenId) => {
                // Fetch Project Data
                const projectData = await contracts.ecoNFT.projects(tokenId);
                const tokenURI = await contracts.ecoNFT.tokenURI(tokenId);
                
                // Fetch Listing Status
                let isListed = false;
                let listingPrice = '0';
                try {
                    const listing = await contracts.ecoMarketplace.listings(tokenId);
                    if (listing.price > 0n && !listing.sold) {
                        isListed = true;
                        listingPrice = ethers.formatEther(listing.price);
                    }
                } catch (e) { /* ignore */ }

                // Fetch IPFS Metadata (Optimistic, maybe heavy for many NFTs)
                // We should probably cache this or load lazily, but for now Promise.all is fine for <50
                let metadata = { name: `Project #${tokenId}`, image: '' };
                try {
                    const url = getGatewayUrl(tokenURI);
                    if (url) {
                        const res = await fetch(url);
                        const jsonMeta = await res.json();
                        if (jsonMeta.image) {
                             jsonMeta.image = getGatewayUrl(jsonMeta.image);
                        }
                        metadata = jsonMeta;
                    }
                } catch (e) { console.warn("Meta error", tokenId); }

                return {
                    id: tokenId.toString(),
                    carbonTons: Number(projectData.carbonTons),
                    isRetired: projectData.isRetired,
                    expiryDate: Number(projectData.expiryDate),
                    isListed,
                    listingPrice,
                    ...metadata
                };
            }));

            // 4. Calculate Summaries
            // Total Offset = Sum of carbon tons ONLY from retired NFTs
            const totalCarbon = nfts.reduce((acc, nft) => {
                return nft.isRetired ? acc + nft.carbonTons : acc;
            }, 0);
            
            const active = nfts.filter(n => !n.isRetired).length;

            setData({
                ecoBalance: balanceEco.toFixed(2),
                ecoBalanceEth: valueEth.toFixed(4),
                ecoBalanceUsd: valueUsd.toFixed(2),
                totalCarbonOffset: totalCarbon,
                activeCredits: active,
                myNFTs: nfts
            });

        } catch (error) {
            console.error("Dashboard Hook Error:", error);
        } finally {
            setLoading(false);
        }

    }, [account, contracts, blockNumber]); // Re-run on block change

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { data, loading, refresh: fetchData };
};
