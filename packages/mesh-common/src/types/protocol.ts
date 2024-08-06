import { DEFAULT_PROTOCOL_PARAMETERS } from "../constants";

export type Protocol = {
  epoch: number;
  minFeeA: number;
  minFeeB: number;
  maxBlockSize: number;
  maxTxSize: number;
  maxBlockHeaderSize: number;
  keyDeposit: number;
  poolDeposit: number;
  decentralisation: number;
  minPoolCost: string;
  priceMem: number;
  priceStep: number;
  maxTxExMem: string;
  maxTxExSteps: string;
  maxBlockExMem: string;
  maxBlockExSteps: string;
  maxValSize: number;
  collateralPercent: number;
  maxCollateralInputs: number;
  coinsPerUtxoSize: number;
};

export const castProtocol = (data: Record<keyof Protocol, any>): Protocol => {
  const {
    epoch,
    minFeeA,
    minFeeB,
    maxBlockSize,
    maxTxSize,
    maxBlockHeaderSize,
    keyDeposit,
    poolDeposit,
    decentralisation,
    minPoolCost,
    priceMem,
    priceStep,
    maxTxExMem,
    maxTxExSteps,
    maxBlockExMem,
    maxBlockExSteps,
    maxValSize,
    collateralPercent,
    maxCollateralInputs,
    coinsPerUtxoSize,
  } = DEFAULT_PROTOCOL_PARAMETERS;

  const result = {
    epoch: Number(data.epoch) || epoch,
    minFeeA: Number(data.minFeeA) || minFeeA,
    minFeeB: Number(data.minFeeB) || minFeeB,
    maxBlockSize: Number(data.maxBlockSize) || maxBlockSize,
    maxTxSize: Number(data.maxTxSize) || maxTxSize,
    maxBlockHeaderSize: Number(data.maxBlockHeaderSize) || maxBlockHeaderSize,
    keyDeposit: Number(data.keyDeposit) || keyDeposit,
    poolDeposit: Number(data.poolDeposit) || poolDeposit,
    decentralisation: Number(data.decentralisation) || decentralisation,
    minPoolCost: data.minPoolCost.toString() || minPoolCost,
    priceMem: Number(data.priceMem) || priceMem,
    priceStep: Number(data.priceStep) || priceStep,
    maxTxExMem: data.maxTxExMem.toString() || maxTxExMem,
    maxTxExSteps: data.maxTxExSteps.toString() || maxTxExSteps,
    maxBlockExMem: data.maxBlockExMem.toString() || maxBlockExMem,
    maxBlockExSteps: data.maxBlockExSteps.toString() || maxBlockExSteps,
    maxValSize: Number(data.maxValSize) || maxValSize,
    collateralPercent: Number(data.collateralPercent) || collateralPercent,
    maxCollateralInputs:
      Number(data.maxCollateralInputs) || maxCollateralInputs,
    coinsPerUtxoSize: Number(data.coinsPerUtxoSize) || coinsPerUtxoSize,
  };

  return result;
};
