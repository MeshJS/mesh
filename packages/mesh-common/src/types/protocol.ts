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
  minFeeRefScriptCostPerByte: number;
};

export const castProtocol = (
  data: Partial<Record<keyof Protocol, any>>,
): Protocol => {
  const result: Partial<Record<keyof Protocol, number | string>> = {};

  for (const rawKey in DEFAULT_PROTOCOL_PARAMETERS) {
    const key = rawKey as keyof Protocol;
    const defaultValue = DEFAULT_PROTOCOL_PARAMETERS[key];
    const value = data[key];
    if (typeof defaultValue === "number") {
      result[key] = !value && value !== 0 ? defaultValue : Number(value);
    } else if (typeof defaultValue === "string") {
      result[key] = !value && value !== "" ? defaultValue : value.toString();
    }
  }

  return result as Protocol;
};
