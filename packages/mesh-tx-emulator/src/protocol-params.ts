import type { CardanoInfo, ProtocolParams } from "scalus";

import type { Protocol } from "@meshsdk/common";
import { castProtocol } from "@meshsdk/common";

/** Protocol parameters in the shape the Blockfrost API, and Scalus, read and write */
type BlockfrostParams = Record<string, any>;

const toBlockfrost = (params: ProtocolParams): BlockfrostParams =>
  JSON.parse(params.toBlockfrostJson());

/** A decimal number as an exact fraction: `0.0577` is 577/10000, `7e-7` is 7/10000000 */
export const toFraction = (value: number | string) => {
  const [mantissa = "0", exponent = "0"] = String(value)
    .toLowerCase()
    .split("e");
  const [whole = "0", fraction = ""] = mantissa.split(".");
  const scale = fraction.length - Number(exponent);
  const numerator = BigInt(whole + fraction);
  return scale >= 0
    ? { numerator, denominator: 10n ** BigInt(scale) }
    : { numerator: numerator * 10n ** BigInt(-scale), denominator: 1n };
};

/** Epochs a governance action stays open to votes */
export const govActionLifetime = (params: ProtocolParams): number =>
  Number(toBlockfrost(params).gov_action_lifetime);

/** The protocol parameters as the cquisitor validator reads them */
export const toCquisitorParams = (params: ProtocolParams) => {
  const bf = toBlockfrost(params);
  return {
    adaPerUtxoByte: BigInt(bf.coins_per_utxo_size),
    collateralPercentage: Number(bf.collateral_percent),
    costModels: {
      plutusV1: bf.cost_models_raw.PlutusV1,
      plutusV2: bf.cost_models_raw.PlutusV2,
      plutusV3: bf.cost_models_raw.PlutusV3,
    },
    drepDeposit: BigInt(bf.drep_deposit),
    executionPrices: {
      memPrice: toFraction(bf.price_mem),
      stepPrice: toFraction(bf.price_step),
    },
    governanceActionDeposit: BigInt(bf.gov_action_deposit),
    maxBlockBodySize: Number(bf.max_block_size),
    maxBlockExecutionUnits: {
      mem: BigInt(bf.max_block_ex_mem),
      steps: BigInt(bf.max_block_ex_steps),
    },
    maxBlockHeaderSize: Number(bf.max_block_header_size),
    maxCollateralInputs: Number(bf.max_collateral_inputs),
    maxEpochForPoolRetirement: Number(bf.e_max),
    maxTransactionSize: Number(bf.max_tx_size),
    maxTxExecutionUnits: {
      mem: BigInt(bf.max_tx_ex_mem),
      steps: BigInt(bf.max_tx_ex_steps),
    },
    maxValueSize: Number(bf.max_val_size),
    minFeeCoefficientA: BigInt(bf.min_fee_a),
    minFeeConstantB: BigInt(bf.min_fee_b),
    minPoolCost: BigInt(bf.min_pool_cost),
    protocolVersion: [
      Number(bf.protocol_major_ver),
      Number(bf.protocol_minor_ver),
    ],
    referenceScriptCostPerByte: toFraction(bf.min_fee_ref_script_cost_per_byte),
    stakeKeyDeposit: BigInt(bf.key_deposit),
    stakePoolDeposit: BigInt(bf.pool_deposit),
  };
};

/** Mesh `Protocol` fields, by the Blockfrost name Scalus reads them under */
const BLOCKFROST_NAMES: Partial<Record<keyof Protocol, string>> = {
  minFeeA: "min_fee_a",
  minFeeB: "min_fee_b",
  maxBlockSize: "max_block_size",
  maxTxSize: "max_tx_size",
  maxBlockHeaderSize: "max_block_header_size",
  keyDeposit: "key_deposit",
  poolDeposit: "pool_deposit",
  minPoolCost: "min_pool_cost",
  priceMem: "price_mem",
  priceStep: "price_step",
  maxTxExMem: "max_tx_ex_mem",
  maxTxExSteps: "max_tx_ex_steps",
  maxBlockExMem: "max_block_ex_mem",
  maxBlockExSteps: "max_block_ex_steps",
  maxValSize: "max_val_size",
  collateralPercent: "collateral_percent",
  maxCollateralInputs: "max_collateral_inputs",
  coinsPerUtxoSize: "coins_per_utxo_size",
  minFeeRefScriptCostPerByte: "min_fee_ref_script_cost_per_byte",
};

/** The protocol parameters as a Mesh `Protocol`, every field the one transactions are checked with */
export const toMeshProtocol = (
  params: ProtocolParams,
  epoch: number,
): Protocol => {
  const bf = toBlockfrost(params);
  return castProtocol({
    epoch,
    ...Object.fromEntries(
      Object.entries(BLOCKFROST_NAMES).map(([field, name]) => [
        field,
        bf[name],
      ]),
    ),
  });
};

/**
 * A network's info with some of its protocol parameters replaced. Parameters a Mesh `Protocol`
 * does not carry (governance deposits and lifetimes, protocol version, thresholds) keep the
 * network's own values.
 * @param costModels The Plutus V1, V2 and V3 cost models
 */
export const withProtocol = (
  info: CardanoInfo,
  lib: typeof import("scalus"),
  protocol: Partial<Protocol>,
  costModels?: number[][],
): CardanoInfo => {
  const bf = toBlockfrost(info.protocolParams);
  for (const [field, name] of Object.entries(BLOCKFROST_NAMES)) {
    const value = protocol[field as keyof Protocol];
    // In the type Scalus writes the field with: a string for lovelace, a number otherwise
    if (value !== undefined && value !== null)
      bf[name] = typeof bf[name] === "string" ? String(value) : Number(value);
  }
  if (costModels && costModels.length === 3)
    bf.cost_models_raw = {
      PlutusV1: costModels[0],
      PlutusV2: costModels[1],
      PlutusV3: costModels[2],
    };
  return info.withProtocolParams(
    lib.ProtocolParams.fromBlockfrostJson(JSON.stringify(bf)),
  );
};
