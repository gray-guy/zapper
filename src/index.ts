import { Signer, ethers } from "ethers";
import dotenv from "dotenv";
import { erc20Abi } from "viem";
import uniswapAbi from "./uniswapAbi.json";
import zapContractAbi from "./zapAbi.json";
import stakingAbi from "./stakingAbi.json";
import { sendTransaction } from "viem/_types/actions/wallet/sendTransaction";

dotenv.config();

if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY is not defined in the environment variables");
}
if (!process.env.ROUTER_V2_ADDRESS) {
  throw new Error("ROUTER_V2_ADDRESS is not defined in the environment variables");
}
if (!process.env.ZAP_ADDRESS) {
  throw new Error("ZAP_CONTRACT_ADDRESS is not defined in the environment variables");
}
if (!process.env.STAKING_ADDRESS) {
  throw new Error("STAKING_ADDRESS is not defined in the environment variables");
}

const zapContractAddress = process.env.ZAP_ADDRESS;
const routerContractAddress = process.env.ROUTER_V2_ADDRESS;
const stakingContractAddress = process.env.STAKING_ADDRESS;

// ALREADY SET IN FRONT-END
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_PROVIDER);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const zapContract = new ethers.Contract(zapContractAddress, zapContractAbi, signer);
const routerContract = new ethers.Contract(routerContractAddress, uniswapAbi, signer);
const stakingContract = new ethers.Contract(stakingContractAddress, stakingAbi, signer);

// Token Pair
const ZoneTokenAddress = "0x4d4B826a97Cdf819808A63F7A66223D79f8Cc9f5"; // ZONE
const WethTokenAddress = "0x0dE8FCAE8421fc79B29adE9ffF97854a424Cad09"; // WBNB now, mainnet will be WETH
const Address0 = "0x0000000000000000000000000000000000000000"

const OtherTokenAddress = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"; // USDT

async function main() {
  // ZAP IN FLOW

  // TODO: calculate minPoolTokens for slippage

  // zapIn(ZoneTokenAddress, "50", "0.000000001", Address0, "0x") //ZapIn with Zone
  // zapIn(WethTokenAddress, "50", "0.000000001", Address0, "0x") //ZapIn with WETH
  // zapIn(Address0, "0.001", "0.000000001", WethTokenAddress, "0x") //ZapIn with Native ETH. BNB now, mainnet will be ETH.

  // zapIn via any other token
  // let callData = await prepareSwapData(OtherTokenAddress, WethTokenAddress, "0.0001")
  // zapIn(OtherTokenAddress, "0.0001", "0.000001", routerContractAddress, callData)

  // TODO: ZAP OUT FLOW

  // Staking Flow

  // harvestRewards()
}

async function zapIn(tokenAddress: string, amount: string, minPoolTokens: string, swapTarget: string, swapData: string) {

  let amountToZap;
  if (tokenAddress === Address0) {
    amountToZap = ethers.utils.parseUnits(amount);   
  } else {
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, signer);
    const decimals = await getTokenDecimals(tokenAddress);
    amountToZap = ethers.utils.parseUnits(amount, decimals);

    const allowance = await checkAllowance(tokenAddress)
    console.log("allowance===>", ethers.utils.formatUnits(allowance, decimals))

    if (allowance.lt(amountToZap)) {
      console.log("ALLOWANCE LOW, TRANSACTION TO APPROVE TOKEN SPEND");
      try {
        const approveTx = await tokenContract.approve(
          process.env.ZAP_ADDRESS,
          amountToZap
        );

        const approveReceipt = await approveTx.wait();

        // Check if the transaction was successful
        if (approveReceipt.status === 1) {
          const newAllowance = await checkAllowance(tokenAddress);
          console.log("newAllowance===>", ethers.utils.formatUnits(newAllowance, decimals));
        } else {
          console.log("Approve transaction failed");
          return;
        }
      } catch (err) {
        console.log("Approve Failed", err);
        return;
      }
    } else {
      console.log("ALLOWANCE MATCHED, CONTINUE");
    }
  }

  const minPoolTokensAdjusted = ethers.utils.parseUnits(minPoolTokens);
  const gasEstimate = await zapContract.estimateGas.ZapIn(tokenAddress, amountToZap, minPoolTokensAdjusted, swapTarget, swapData, {
    value: tokenAddress === Address0 ? amountToZap : 0
  })
  console.log("Estimated Gas:", gasEstimate);
  // try {
  //   const zapTx = await zapContract.ZapIn(tokenAddress, amountToZap, minPoolTokensAdjusted, swapTarget, swapData, {
  //     value: tokenAddress === Address0 ? amountToZap : 0,
  //     gasLimit: gasEstimate.mul(2)
  //   });

  //   await zapTx.wait();
  //   console.log("Zap in successful:", zapTx);
  // } catch (err) {
  //   console.log("Zap in unsuccessful:", err);
  // }
}

async function harvestRewards() {
  const gasEstimate = await stakingContract.estimateGas.harvestRewards()
  console.log("Estimated Gas:", gasEstimate);
  try {
    const harvestTx = await stakingContract.harvestRewards({
      gasLimit: gasEstimate.mul(2)
    });

    await harvestTx.wait();
    console.log("Harvest successful:", harvestTx);
  } catch (err) {
    console.log("Harvest unsuccessful:", err);
  }
}

// HELPER FUNCTIONS

async function prepareSwapData(fromToken: string, toToken: string, amount: string): Promise<string> {
  const decimals = await getTokenDecimals(fromToken);
  const amountToSwap = ethers.utils.parseUnits(amount, decimals); // Adjust the decimal according to the token

  // Define the path for the swap
  const path = [fromToken, toToken];

  // Encode the swap function call
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current time
  const swapData = routerContract.interface.encodeFunctionData("swapExactTokensForTokens", [
      amountToSwap,
      ethers.constants.Zero, // assuming 0 as the minimum amount out for estimation purposes. TODO
      path,
      zapContractAddress, // The recipient of the tokens post-swap
      deadline
  ]);

  return swapData;
}

// Check token allowance
async function checkAllowance(token: string) {
  const tokenContract = new ethers.Contract(token, erc20Abi, signer);

  const allowance = await tokenContract.allowance(
    signer.address, // user's wallet address
    process.env.ZAP_ADDRESS
  );

  return allowance;
}

// Get token decimals
async function getTokenDecimals(tokenAddress: any) {
  const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, signer);
  const decimals = await tokenContract.decimals();
  return decimals;
}

main();

// const zapInData = zapContract.interface.encodeFunctionData(
//   "ZapIn",
//   [
//     tokenAddress,
//     amountToZap,
//     minPoolTokensAdjusted,
//     swapTarget,
//     swapData
//   ]
// );

// const zapTx = await sendTransaction(signer, {
//   to: zapContractAddress,
//   data: zapInData,
//   gasLimit: 1000000,
// })