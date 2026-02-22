import hre from 'hardhat';
const { ethers } = hre;

async function main() {
  // Raw failing tx data (from your error message)
  const raw = '0x414bf3890000000000000000000000001db6f0b4e780c7eccd9736090627e824e4abe83d000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb9226600000000000000000000000000000000000000000000000000000000699b83b50000000000000000000000000000000000000000000003193d8172a1fa66000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
  const from = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
  const router = '0xe592427a0aece92de3edee1f18e0157c05861564';

  console.log('Decoding calldata...');

  const candidates = [
    ['address','address','uint24','address','uint256','uint256','uint256','uint160'],
    ['address','address','uint24','address','uint160','uint256','uint256','uint256'],
    ['address','address','uint24','address','uint256','uint256','uint160','uint256'],
  ];

  const abiCoder = ethers.AbiCoder.prototype;
  for (const types of candidates) {
    try {
      // calldata after 4 byte selector
      const payload = raw.slice(10);
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode([`tuple(${types.join(',')})`], '0x' + payload);
      console.log('Candidate types:', types);
      console.log(JSON.stringify(decoded[0], null, 2));
    } catch (e) {
      // skip
    }
  }

  // Try a known ExactInputSingle layout per Uniswap interface
  try {
    const types = ['address','address','uint24','address','uint256','uint256','uint256','uint160'];
    const payload = raw.slice(10);
    const [params] = ethers.AbiCoder.defaultAbiCoder().decode([`tuple(${types.join(',')})`], '0x' + payload);
    const [tokenIn, tokenOut, fee, recipient, deadline, amountIn, amountOutMin, sqrtPriceLimitX96] = params;
    console.log('\nParsed as ExactInputSingle params:');
    console.log({ tokenIn, tokenOut, fee: fee.toString(), recipient, deadline: deadline.toString(), amountIn: amountIn.toString(), amountOutMin: amountOutMin.toString(), sqrtPriceLimitX96: sqrtPriceLimitX96.toString() });

    // Check balances / allowances
    const token = await ethers.getContractAt('IERC20', tokenIn);
    const allowance = await token.allowance(from, router);
    const balance = await token.balanceOf(from);
    console.log('\nOn-chain checks for tokenIn:');
    console.log('from:', from);
    console.log('router:', router);
    console.log('allowance:', allowance.toString());
    console.log('balance:', balance.toString());

  } catch (err) {
    console.error('Failed to decode with ExactInputSingle layout:', err.message || err);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
