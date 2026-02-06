import hre from "hardhat";
import { ethers } from "ethers";

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_WHALE = "0x55fe002aeff02f77364de339a1292923a15844b8"; // Circle USDC Treasury

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address owner) external view returns (uint256)",
];

async function main() {
  const { network, ethers: hreEthers } = hre;

  await network.provider.send("hardhat_impersonateAccount", [USDC_WHALE]);
  await network.provider.send("hardhat_setBalance", [
    USDC_WHALE,
    "0x56BC75E2D63100000", // 100 ETH
  ]);

  const whaleSigner = await hreEthers.getImpersonatedSigner(USDC_WHALE);
  const [recipient] = await hreEthers.getSigners();

  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, whaleSigner);
  const amount = hreEthers.parseUnits("10000", 6);

  const before = await usdc.balanceOf(recipient.address);
  const tx = await usdc.transfer(recipient.address, amount);
  await tx.wait();
  const after = await usdc.balanceOf(recipient.address);

  console.log(`USDC received: ${hreEthers.formatUnits(after - before, 6)} USDC`);

  await network.provider.send("hardhat_stopImpersonatingAccount", [USDC_WHALE]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
