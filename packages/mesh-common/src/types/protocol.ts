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

export const castProtocol = (data: any): Protocol => {
  return {
    epoch: Number(data.epoch),
    minFeeA: Number(data.minFeeA),
    minFeeB: Number(data.minFeeB),
    maxBlockSize: Number(data.maxBlockSize),
    maxTxSize: Number(data.maxTxSize),
    maxBlockHeaderSize: Number(data.maxBlockHeaderSize),
    keyDeposit: Number(data.keyDeposit),
    poolDeposit: Number(data.poolDeposit),
    decentralisation: Number(data.decentralisation),
    minPoolCost: data.minPoolCost.toString(),
    priceMem: Number(data.priceMem),
    priceStep: Number(data.priceStep),
    maxTxExMem: data.maxTxExMem.toString(),
    maxTxExSteps: data.maxTxExSteps.toString(),
    maxBlockExMem: data.maxBlockExMem.toString(),
    maxBlockExSteps: data.maxBlockExSteps.toString(),
    maxValSize: Number(data.maxValSize),
    collateralPercent: Number(data.collateralPercent),
    maxCollateralInputs: Number(data.maxCollateralInputs),
    coinsPerUtxoSize: Number(data.coinsPerUtxoSize),
  };
};
