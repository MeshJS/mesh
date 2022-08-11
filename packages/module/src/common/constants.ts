import { csl } from '@mesh/core';

export const DEFAULT_REDEEMER_BUDGET = {
  mem: 7000000,
  steps: 3000000000,
};

export const DEFAULT_PROTOCOL_PARAMETERS = {
  coinsPerUTxOSize: '4310',
  priceMem: 0.0577,
  priceStep: 0.0000721,
  minFeeA: 44,
  minFeeB: 155381,
  keyDeposit: '2000000',
  maxTxSize: 16384,
  maxValSize: '5000',
  poolDeposit: '500000000',
};

export const MAX_COLLATERAL = 3;

export const POLICY_ID_LENGTH = 56;

export const REDEEMER_TAGS = {
  CERT: csl.RedeemerTag.new_cert(),
  MINT: csl.RedeemerTag.new_mint(),
  REWARD: csl.RedeemerTag.new_reward(),
  SPEND: csl.RedeemerTag.new_spend(),
};
