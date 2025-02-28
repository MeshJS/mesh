import { Transaction } from "../types";

export const calculateFees = (
  minFeeA: number,
  minFeeB: number,
  minFeeRefScriptCostPerByte: number,
  priceMem: number,
  priceStep: number,
  tx: Transaction,
  refScriptSize: number,
): bigint => {
  let fee = minFeeB + (tx.toCbor().length / 2) * minFeeA;
  fee += calculateRefScriptFees(refScriptSize, minFeeRefScriptCostPerByte);
  let scriptFee = BigInt(0);
  let priceMemNumerator = priceMem;
  let priceMemDenominator = 1;
  while (priceMemNumerator % 1) {
    priceMemNumerator *= 10;
    priceMemDenominator *= 10;
  }
  let priceStepNumerator = priceStep;
  let priceStepDenominator = 1;
  while (priceStepNumerator % 1) {
    priceStepNumerator *= 10;
    priceStepDenominator *= 10;
  }
  if (tx.witnessSet().redeemers()) {
    for (const redeemer of tx.witnessSet().redeemers()!.values()) {
      scriptFee +=
        (redeemer.exUnits().mem() * BigInt(priceMemNumerator.toString())) /
        BigInt(priceMemDenominator.toString());
      scriptFee +=
        (redeemer.exUnits().steps() * BigInt(priceStepNumerator.toString())) /
        BigInt(priceStepDenominator.toString());
      if (priceMemNumerator % priceMemDenominator !== 0) {
        scriptFee += BigInt(1);
      }
      if (priceStepNumerator % priceStepDenominator !== 0) {
        scriptFee += BigInt(1);
      }
    }
  }
  return BigInt(fee) + scriptFee;
};

const calculateRefScriptFees = (
  refScriptSize: number,
  minFeeRefScriptCostPerByte: number,
  tierMultiplier = 1.2,
): number => {
  let fee = 0;
  const tierSize = 25600;
  let currentRefScriptSize = refScriptSize;
  let multiplier = 1;
  while (currentRefScriptSize >= tierSize) {
    fee += tierSize * multiplier * minFeeRefScriptCostPerByte;
    currentRefScriptSize -= tierSize;
    multiplier *= tierMultiplier;
  }
  if (currentRefScriptSize > 0) {
    fee += currentRefScriptSize * multiplier * minFeeRefScriptCostPerByte;
  }
  fee = Math.ceil(fee);
  return fee;
};
