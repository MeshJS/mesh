import {
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  Network,
  Protocol,
  SLOT_CONFIG_NETWORK,
  UTxO,
} from "@meshsdk/common";

import { toTxUnspentOutput } from "../utils";

/**
 * Balances a transaction with Scalus: sets every redeemer's execution units, the fee, and the
 * lovelace of one change output, until the three agree.
 *
 * Mesh evaluates scripts before it adds change outputs, so the units it declares can be wrong for
 * the transaction it finally builds: a script sees the whole transaction, and an extra output can
 * change what it costs. This runs the loop instead. Coin selection and change placement stay with
 * `MeshTxBuilder`; only the numbers move, in the output you name.
 *
 * @param tx - the built transaction, as CBOR hex
 * @param utxos - every UTxO the transaction's inputs, collateral and reference inputs name
 * @param params - the protocol parameters, as `fetchProtocolParameters` returns them
 * @param network - which network, for slot arithmetic
 * @param changeOutputIndex - which output absorbs the difference, counting from 0
 * @param protocolMajorVersion - the ledger protocol version to cost against
 * @param costModels - cost models by Plutus version, defaulting to the mainnet ones
 * @param extraSigners - hex key hashes for signatures the transaction does not name, such as the
 *   keys a native script requires. Inferred signers are always included as well
 * @returns the balanced transaction as CBOR hex, ready to sign
 */
export const balanceTxWithScalus = async (
  tx: string,
  utxos: UTxO[],
  params: Protocol,
  network: Network,
  changeOutputIndex: number,
  protocolMajorVersion: number,
  costModels: number[][] = [
    DEFAULT_V1_COST_MODEL_LIST,
    DEFAULT_V2_COST_MODEL_LIST,
    DEFAULT_V3_COST_MODEL_LIST,
  ],
  extraSigners: string[] = [],
): Promise<string> => {
  // Keep native import() in the CJS build: Scalus is ESM-only.
  const { balancer } = await import("scalus");

  // CIP-30 `transaction_unspent_output` is `[input, output]`, which is what Scalus takes.
  const pairs = utxos.map((utxo) => toTxUnspentOutput(utxo).toCbor().toString());

  const slots = SLOT_CONFIG_NETWORK[network];

  const balanced = balancer.balanceTx(
    tx,
    pairs,
    {
      zeroTime: slots.zeroTime,
      zeroSlot: slots.zeroSlot,
      slotLength: slots.slotLength,
    },
    scalusParams(params, protocolMajorVersion, costModels),
    changeOutputIndex,
    extraSigners,
  );
  return Buffer.from(balanced).toString("hex");
};

/**
 * Mesh's `Protocol` as the record Scalus reads. Every number is one Mesh already holds, so there is
 * no JSON round trip: the deposits Scalus does not consult while balancing stay at zero.
 */
const scalusParams = (
  p: Protocol,
  protocolMajorVersion: number,
  costModels: number[][],
) => ({
  txFeePerByte: p.minFeeA,
  txFeeFixed: p.minFeeB,
  maxTxSize: p.maxTxSize,
  maxValueSize: p.maxValSize,
  stakeAddressDeposit: p.keyDeposit,
  stakePoolDeposit: p.poolDeposit,
  dRepDeposit: 0,
  govActionDeposit: 0,
  utxoCostPerByte: p.coinsPerUtxoSize,
  priceMemory: p.priceMem,
  priceSteps: p.priceStep,
  maxTxExecutionMemory: Number(p.maxTxExMem),
  maxTxExecutionSteps: Number(p.maxTxExSteps),
  collateralPercentage: p.collateralPercent,
  maxCollateralInputs: p.maxCollateralInputs,
  minFeeRefScriptCostPerByte: p.minFeeRefScriptCostPerByte,
  protocolMajorVersion,
  costModels: {
    PlutusV1: costModels[0],
    PlutusV2: costModels[1],
    PlutusV3: costModels[2],
  },
});
