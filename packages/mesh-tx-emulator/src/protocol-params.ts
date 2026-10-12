import type { CardanoInfo, ProtocolParams } from "scalus";

import type { Protocol } from "@meshsdk/common";

/** Protocol parameters in the shape the Blockfrost API, and Scalus, read and write */
type BlockfrostParams = Record<string, any>;

const toBlockfrost = (params: ProtocolParams): BlockfrostParams =>
  JSON.parse(params.toBlockfrostJson());

/** A decimal number as an exact fraction: `0.0577` is 577/10000 */
const toFraction = (value: number | string) => {
  const [whole = "0", fraction = ""] = String(value).split(".");
  return {
    numerator: BigInt(whole + fraction),
    denominator: 10n ** BigInt(fraction.length),
  };
};

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

/**
 * A network's info with its protocol parameters replaced by fetched ones. Parameters a Mesh
 * `Protocol` does not carry (governance deposits, protocol version, thresholds) keep the
 * network's own values.
 */
export const withProtocol = (
  info: CardanoInfo,
  lib: typeof import("scalus"),
  protocol: Protocol,
  costModels?: number[][],
): CardanoInfo => {
  const bf = toBlockfrost(info.protocolParams);
  Object.assign(bf, {
    min_fee_a: protocol.minFeeA,
    min_fee_b: protocol.minFeeB,
    max_block_size: protocol.maxBlockSize,
    max_tx_size: protocol.maxTxSize,
    max_block_header_size: protocol.maxBlockHeaderSize,
    key_deposit: String(protocol.keyDeposit),
    pool_deposit: String(protocol.poolDeposit),
    min_pool_cost: String(protocol.minPoolCost),
    price_mem: protocol.priceMem,
    price_step: protocol.priceStep,
    max_tx_ex_mem: String(protocol.maxTxExMem),
    max_tx_ex_steps: String(protocol.maxTxExSteps),
    max_block_ex_mem: String(protocol.maxBlockExMem),
    max_block_ex_steps: String(protocol.maxBlockExSteps),
    max_val_size: String(protocol.maxValSize),
    collateral_percent: protocol.collateralPercent,
    max_collateral_inputs: protocol.maxCollateralInputs,
    coins_per_utxo_size: String(protocol.coinsPerUtxoSize),
    min_fee_ref_script_cost_per_byte: protocol.minFeeRefScriptCostPerByte,
  });
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
