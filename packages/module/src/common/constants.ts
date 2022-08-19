import { csl } from '@mesh/core';
import type { Costmdls } from '@mesh/core';
import type { Era } from './types';

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
  maxCollateralInputs: 3,
};

export const POLICY_ID_LENGTH = 56;

export const REDEEMER_TAGS = {
  CERT: csl.RedeemerTag.new_cert(),
  MINT: csl.RedeemerTag.new_mint(),
  REWARD: csl.RedeemerTag.new_reward(),
  SPEND: csl.RedeemerTag.new_spend(),
};

export const SUPPORTED_COST_MODELS = new Map<Era, Costmdls>([
  ['ALONZO', csl.TxBuilderConstants.plutus_alonzo_cost_models()],
  ['VASIL', csl.TxBuilderConstants.plutus_vasil_cost_models()],
]);

export const SUPPORTED_NETWORKS = new Map<number, string>([
  [0, 'testnet'],
  [1, 'mainnet'],
]);
