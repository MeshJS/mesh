import { csl } from '@mesh/core';
import type { Costmdls } from '@mesh/core';
import type { Budget, Era, Protocol } from './types';

export const DEFAULT_REDEEMER_BUDGET: Budget = {
  mem: 7000000,
  steps: 3000000000,
};

export const DEFAULT_PROTOCOL_PARAMETERS: Protocol = {
  epoch: 0,
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
  decentralisation: 0,
  maxBlockSize: 98304,
  collateralPercent: 150,
  maxBlockHeaderSize: 1100,
  minPoolCost: '340000000',
  maxTxExMem: '16000000',
  maxTxExSteps: '10000000000',
  maxBlockExMem: '80000000',
  maxBlockExSteps: '40000000000',
};

export const HARDENED_KEY_START = 0x80000000;

export const LANGUAGE_VERSIONS = {
  V1: csl.Language.new_plutus_v1(),
  V2: csl.Language.new_plutus_v2(),
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
  ['BABBAGE', csl.TxBuilderConstants.plutus_vasil_cost_models()],
]);

export const SUPPORTED_HANDLES = new Map<number, string>([
  [csl.NetworkInfo.testnet().network_id(), '8d18d786e92776c824607fd8e193ec535c79dc61ea2405ddf3b09fe3'],
  [csl.NetworkInfo.mainnet().network_id(), 'f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a'],
]);

export const SUPPORTED_WALLETS = [
  'eternl',
  'flint',
  'nami',
  'nufi',
];
