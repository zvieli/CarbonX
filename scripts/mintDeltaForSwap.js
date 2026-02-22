import hre from 'hardhat';
const { ethers } = hre;

async function main() {
  const raw = '0x414bf3890000000000000000000000001db6f0b4e780c7eccd9736090627e824e4abe83d000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb9226600000000000000000000000000000000000000000000000000000000699b83b50000000000000000000000000000000000000000000003193d8172a1fa66000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
  const from = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
  const router = '0xe592427a0aece92de3edee1f18e0157c05861564';

  const types = ['address','address','uint24','address','uint256','uint256','uint256','uint160'];
  const payload = raw.slice(10);
  const [params] = ethers.AbiCoder.defaultAbiCoder().decode([`tuple(${types.join(',')})`], '0x' + payload);
  const [tokenIn, tokenOut, fee, recipient, deadline, amountIn] = params;

  const token = await ethers.getContractAt('IERC20', tokenIn);
  const balance = await token.balanceOf(from);
  if (balance >= amountIn) {
    console.log('No mint required; balance >= amountIn');
    return;
  }

  const diff = amountIn.sub(balance);
  console.log('Minting missing amount to', from, 'diff:', diff.toString());

  const [deployer] = await ethers.getSigners();
  const ecoToken = await ethers.getContractAt('EcoToken', (await hre.deployments?.get?.('EcoToken'))?.address || (await hre.ethers.getContractFactory('EcoToken')).address).catch(() => null);
  // Fallback: use generic attach if deployment info not available
  let contract = ecoToken;
  if (!contract) {
    contract = await ethers.getContractAt('EcoToken', (await ethers.getSigners())[0] ? (await ethers.getSigners())[0].address : deployer.address).catch(() => null);
  }

  // Try mint via token interface (owner)
  try {
    const tx = await token.connect(deployer).mint(from, diff);
    await tx.wait();
    console.log('Mint tx completed:', tx.hash);
  } catch (err) {
    console.error('Mint failed:', err.message || err);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
