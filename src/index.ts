import { Signer, ethers } from "ethers";
import dotenv from "dotenv";
import { erc20Abi } from "viem";
import uniswapAbi from "./uniswapAbi.json";
import zapContractAbi from "./zapAbi.json";
import stakingAbi from "./stakingAbi.json";

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
const WethTokenAddress = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd"; // WBNB now, mainnet will be WETH
const PairAddress = "0x387B579EB0c1204f1DB886a56b575599eAd3bE4c" //ZONE/WETH pair. WBNB now, mainnet will be WETH

const Address0 = "0x0000000000000000000000000000000000000000"
const OtherTokenAddress = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"; // USDT

const FEES = 0 // Mainnet will be 400

async function main() {
  // ZAP IN FLOW

  // const zapInQuote = await getZapInQuote(ZoneTokenAddress, "10", [], FEES, 10) // ZapIn via ZONE
  // const zapInQuote = await getZapInQuote(WethTokenAddress, "0.0000001", [], FEES, 10) // ZapIn via WETH or Native ETH
  // const zapInQuote = await getZapInQuote(OtherTokenAddress, "0.001", [OtherTokenAddress, WethTokenAddress], FEES, 10) // ZapIn via OtherToken

  // zapIn(ZoneTokenAddress, "10", zapInQuote[3]) //ZapIn with Zone
  // zapIn(WethTokenAddress, "0.0000001", zapInQuote[3]) //ZapIn with WETH
  // zapIn(Address0, "0.001", zapInQuote[3]) //ZapIn with Native ETH. BNB now, mainnet will be ETH.
  // zapIn(OtherTokenAddress, "0.001", zapInQuote[3]) //ZapIn via OtherToken

  // ZAP OUT FLOW

  // const zapOutQuote = await getZapOutQuote(ZoneTokenAddress, "0.00001", FEES, 10) // ZapOut via ZONE
  // const zapOutQuote = await getZapOutQuote(WethTokenAddress, "0.00001", FEES, 10) // ZapOut via WETH or Native ETH
  const zapOutQuote = await getZapOutQuote(OtherTokenAddress, "0.00001", FEES, 10) // ZapOut via OtherToken

  // zapOut(ZoneTokenAddress, "0.00001", zapOutQuote) //ZapOut with Zone
  // zapOut(WethTokenAddress, "0.00001", zapOutQuote) //ZapOut with WETH
  // zapOut(Address0, "0.00001", zapOutQuote) //ZapOut with Native ETH. BNB now, mainnet will be ETH.
  zapOut(OtherTokenAddress, "0.00001", zapOutQuote) //ZapOut with OtherToken

  // STAKING FLOW

  // getUserDataFromStakingContract()
  // harvestRewards()
}

async function getZapInQuote(fromToken: string, amount: string, path: Array<String>, feesBasisPoints: any, slippageTolerance: any) {

  const decimals = await getTokenDecimals(fromToken)
  const amountIn = ethers.utils.parseUnits(amount, decimals)

  const quoteData = await zapContract.quoteZapIn(fromToken, amountIn, path, feesBasisPoints)

  const slippage = 1 - Number(slippageTolerance) / 100;
  const lpTokensWithSlippage = quoteData[2].mul(ethers.BigNumber.from(Math.floor(slippage * 100))).div(ethers.BigNumber.from(100));

  console.log({
    "zone": ethers.utils.formatUnits(quoteData[0]),
    "weth": ethers.utils.formatUnits(quoteData[1]),
    "lpTokens": ethers.utils.formatUnits(quoteData[2]),
    "minLpTokens": ethers.utils.formatUnits(lpTokensWithSlippage)
  })

  return [quoteData[0], quoteData[1], quoteData[2], lpTokensWithSlippage]
}

async function getZapOutQuote(toToken: string, lpTokensAmount: string, feesBasisPoints: any, slippageTolerance: any) {

  const decimals = await getTokenDecimals(toToken)
  console.log("decimals===>", decimals)
  const lpTokensAdjusted = ethers.utils.parseUnits(lpTokensAmount);

  let pathWeth: Array<String> = []
  let pathZone: Array<String> = []
  if (toToken !== ZoneTokenAddress && toToken !== WethTokenAddress) {
    pathWeth = [WethTokenAddress, toToken]
    pathZone = [ZoneTokenAddress, WethTokenAddress, toToken]
  } else {
    pathWeth = [WethTokenAddress, toToken]
    pathZone = [ZoneTokenAddress, toToken]
  }

  const quoteData = await zapContract.calculateTokensOut(toToken, lpTokensAdjusted, pathWeth, pathZone, feesBasisPoints)
  
  const slippage = 1 - Number(slippageTolerance) / 100;
  const tokensWithSlippage = quoteData[2].mul(ethers.BigNumber.from(Math.floor(slippage * 100))).div(ethers.BigNumber.from(100));

  console.log({
    "zone": ethers.utils.formatUnits(quoteData[0]),
    "weth": ethers.utils.formatUnits(quoteData[1]),
    "tokens": ethers.utils.formatUnits(quoteData[2], decimals),
    "minTokens": ethers.utils.formatUnits(tokensWithSlippage, decimals)
  })

  return [quoteData[0], quoteData[1], quoteData[2], tokensWithSlippage]
}

async function zapIn(tokenAddress: string, amount: string, minPoolTokens: any) {

  let amountToZap;
  let swapTarget = Address0
  let swapData = "0x"

  if (tokenAddress === Address0) {
    amountToZap = ethers.utils.parseUnits(amount)
    swapTarget = WethTokenAddress
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

  if (tokenAddress !== ZoneTokenAddress && tokenAddress !== WethTokenAddress && tokenAddress !== Address0) {
    swapTarget = routerContractAddress

    let path = [tokenAddress, WethTokenAddress];
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current time
    swapData = routerContract.interface.encodeFunctionData("swapExactTokensForTokens", [
      amountToZap,
      ethers.constants.Zero, // assuming 0 as the minimum amount out for estimation purposes. TODO
      path,
      zapContractAddress, // The recipient of the tokens post-swap
      deadline
    ]);
  }

  const gasEstimate = await zapContract.estimateGas.ZapIn(tokenAddress, amountToZap, minPoolTokens, swapTarget, swapData, {
    value: tokenAddress === Address0 ? amountToZap : 0
  })
  console.log("Estimated Gas:", gasEstimate);
  // try {
  //   const zapTx = await zapContract.ZapIn(tokenAddress, amountToZap, minPoolTokens, swapTarget, swapData, {
  //     value: tokenAddress === Address0 ? amountToZap : 0,
  //     gasLimit: gasEstimate.mul(2)
  //   });

  //   await zapTx.wait();
  //   console.log("Zap in successful:", zapTx);
  // } catch (err) {
  //   console.log("Zap in unsuccessful:", err);
  // }
}

async function zapOut(tokenAddress: string, lpTokensAmount: string, zapOutQuoteData: any) {

  const tokenContract = new ethers.Contract(PairAddress, erc20Abi, signer);
  const decimals = await getTokenDecimals(PairAddress);
  
  const lpTokensAdjusted = ethers.utils.parseUnits(lpTokensAmount, decimals);

  const allowance = await checkAllowance(PairAddress)
  console.log("allowance===>", ethers.utils.formatUnits(allowance, decimals))
  if (allowance.lt(lpTokensAdjusted)) {
    console.log("ALLOWANCE LOW, TRANSACTION TO APPROVE TOKEN SPEND");
    try {
      const approveTx = await tokenContract.approve(
        process.env.ZAP_ADDRESS,
        lpTokensAdjusted
      );

      const approveReceipt = await approveTx.wait();

      // Check if the transaction was successful
      if (approveReceipt.status === 1) {
        const newAllowance = await checkAllowance(PairAddress);
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

  let swapTargets, swapData;

  if (tokenAddress === ZoneTokenAddress) {

    swapTargets = [routerContractAddress, routerContractAddress]

    let path = [WethTokenAddress, ZoneTokenAddress]
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current time
    let callData = routerContract.interface.encodeFunctionData("swapExactTokensForTokensSupportingFeeOnTransferTokens", [
      zapOutQuoteData[1], // WETH amount
      ethers.constants.Zero, // assuming 0 as the minimum amount out for estimation purposes. TODO
      path,
      zapContractAddress, // The recipient of the tokens post-swap
      deadline
    ]);
  
    swapData = ["0x", callData]
  } else if (tokenAddress === WethTokenAddress) {

    swapTargets = [routerContractAddress, routerContractAddress]
    
    let path = [ZoneTokenAddress, WethTokenAddress]
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current time
    let callData = routerContract.interface.encodeFunctionData("swapExactTokensForTokensSupportingFeeOnTransferTokens", [
      zapOutQuoteData[0], // ZONE amount
      ethers.constants.Zero, // assuming 0 as the minimum amount out for estimation purposes. TODO
      path,
      zapContractAddress, // The recipient of the tokens post-swap
      deadline
    ]);

    swapData = [callData, "0x"] //TODO: Switch order on Mainnet
  } else if (tokenAddress === Address0) {

    swapTargets = [routerContractAddress, routerContractAddress]

    let path = [ZoneTokenAddress, WethTokenAddress]
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current time
    let callData = routerContract.interface.encodeFunctionData("swapExactTokensForETHSupportingFeeOnTransferTokens", [
      zapOutQuoteData[0], // ZONE amount
      ethers.constants.Zero, // assuming 0 as the minimum amount out for estimation purposes. TODO
      path,
      zapContractAddress, // The recipient of the tokens post-swap
      deadline
    ]);

    swapData = [callData, "0x"] //TODO: Switch order on Mainnet
  } else {

    swapTargets = [routerContractAddress, routerContractAddress]

    let pathWethToOtherToken = [WethTokenAddress, OtherTokenAddress]
    let pathZoneToOtherToken = [ZoneTokenAddress, WethTokenAddress, OtherTokenAddress]
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current time
    let callData_0 = routerContract.interface.encodeFunctionData("swapExactTokensForTokens", [
      zapOutQuoteData[1], // WETH amount
      ethers.constants.Zero, // assuming 0 as the minimum amount out for estimation purposes. TODO
      pathWethToOtherToken,
      zapContractAddress, // The recipient of the tokens post-swap
      deadline
    ]);
    let callData_1 = routerContract.interface.encodeFunctionData("swapExactTokensForTokensSupportingFeeOnTransferTokens", [
      zapOutQuoteData[0], // ZONE amount
      ethers.constants.Zero, // assuming 0 as the minimum amount out for estimation purposes. TODO
      pathZoneToOtherToken,
      zapContractAddress, // The recipient of the tokens post-swap
      deadline
    ]);

    swapData = [callData_0, callData_1]
  }

  const gasEstimate = await zapContract.estimateGas.ZapOut(tokenAddress, lpTokensAdjusted, zapOutQuoteData[3], swapTargets, swapData)
  console.log("Estimated Gas:", gasEstimate);
  // try {
  //   const zapTx = await zapContract.ZapOut(tokenAddress, lpTokensAdjusted, zapOutQuoteData[3], swapTargets, swapData);

  //   await zapTx.wait();
  //   console.log("Zap in successful:", zapTx);
  // } catch (err) {
  //   console.log("Zap in unsuccessful:", err);
  // }
}

async function harvestRewards() {
  const gasEstimate = await stakingContract.estimateGas.harvestRewards()
  console.log("Estimated Gas:", gasEstimate);
  // try {
  //   const harvestTx = await stakingContract.harvestRewards({
  //     gasLimit: gasEstimate.mul(2)
  //   });

  //   await harvestTx.wait();
  //   console.log("Harvest successful:", harvestTx);
  // } catch (err) {
  //   console.log("Harvest unsuccessful:", err);
  // }
}

// 0. Last Rewards Timestamp
// 1. Total staked (LP) => tokensStaked
// 2. User staked (LP) => userStakingData amount
// 3. User claimable rewards (ZONE) => getUserRewardsAccrued
// 4. APY (%) => APY 

async function getUserDataFromStakingContract() {

  const getUserRewardsAccrued = await stakingContract.getUserRewardsAccrued(signer.address)
  console.log("getUserRewardsAccrued===>", ethers.utils.formatUnits(getUserRewardsAccrued))

  const userStakingData = await stakingContract.poolStaker(signer.address)
  console.log("userStakingData amount===>", ethers.utils.formatUnits(userStakingData[0]))
  console.log("userStakingData rewards===>", ethers.utils.formatUnits(userStakingData[1]))
  console.log("userStakingData rewardDebt===>", ethers.utils.formatUnits(userStakingData[2]))

  const tokensStaked = await stakingContract.tokensStaked()
  console.log("tokensStaked===>", ethers.utils.formatUnits(tokensStaked))

  const lastRewardedTimestamp = await stakingContract.lastRewardedTimestamp()
  console.log("lastRewardedTimestamp===>", lastRewardedTimestamp.toString())

  const rewardTokensPerSecond = await stakingContract.rewardTokensPerSecond()
  console.log("rewardTokensPerSecond===>", ethers.utils.formatUnits(rewardTokensPerSecond))

  const totalRewardsPerYear = rewardTokensPerSecond.mul(31536000)
  console.log("totalRewardsPerYear===>", ethers.utils.formatUnits(totalRewardsPerYear))
  const APY = (totalRewardsPerYear.div(tokensStaked)).mul(100)
  console.log("APY %===>", APY.toString())
}

// HELPER FUNCTIONS

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