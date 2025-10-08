import { Protocol } from "../types/protocol";

export const DEFAULT_PROTOCOL_PARAMETERS: Protocol = {
  epoch: 0,
  coinsPerUtxoSize: 4310,
  priceMem: 0.0577,
  priceStep: 0.0000721,
  minFeeA: 44,
  minFeeB: 155381,
  keyDeposit: 2000000,
  maxTxSize: 16384,
  maxValSize: 5000,
  poolDeposit: 500000000,
  maxCollateralInputs: 3,
  decentralisation: 0,
  maxBlockSize: 98304,
  collateralPercent: 150,
  maxBlockHeaderSize: 1100,
  minPoolCost: "340000000",
  maxTxExMem: "16000000",
  maxTxExSteps: "10000000000",
  maxBlockExMem: "80000000",
  maxBlockExSteps: "40000000000",
  minFeeRefScriptCostPerByte: 15,
};

export const DREP_DEPOSIT = "500000000";
export const VOTING_PROPOSAL_DEPOSIT = "100000000000";

export const resolveTxFees = (
  txSize: number,
  minFeeA = DEFAULT_PROTOCOL_PARAMETERS.minFeeA,
  minFeeB = DEFAULT_PROTOCOL_PARAMETERS.minFeeB,
) => {
  const fees = BigInt(minFeeA) * BigInt(txSize) + BigInt(minFeeB);

  return fees.toString();
};
