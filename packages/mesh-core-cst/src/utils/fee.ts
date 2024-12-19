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
  const tierSize = 25600;
  let currentRefScriptSize = refScriptSize;
  let multiplier = 1.2;
  while (currentRefScriptSize >= tierSize) {
    fee += tierSize * multiplier * minFeeRefScriptCostPerByte;
    currentRefScriptSize -= tierSize;
    multiplier *= multiplier;
  }
  if (currentRefScriptSize > 0) {
    fee += currentRefScriptSize * multiplier * minFeeRefScriptCostPerByte;
  }
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
          BigInt(priceMemDenominator.toString()) +
        BigInt(1);
      scriptFee +=
        (redeemer.exUnits().steps() * BigInt(priceStepNumerator.toString())) /
          BigInt(priceStepDenominator.toString()) +
        BigInt(1);
    }
  }
  return BigInt(fee) + scriptFee;
};