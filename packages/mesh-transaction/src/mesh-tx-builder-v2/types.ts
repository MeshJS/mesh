import { Asset, Budget, BuilderData, RefTxIn, Voter, VotingProcedure } from "@meshsdk/common";

import { MeshTxBuilder } from "../mesh-tx-builder";

// ── Core V2 Builder Interface ──────────────────────────────────────────

export interface _MeshTxBuilderV2
  extends Omit<MeshTxBuilder, ScriptMethodsToDrop> {
  spendPlutusV1(txHash: string, txIndex: number): SpendScriptBuilder;
  spendPlutusV2(txHash: string, txIndex: number): SpendScriptBuilder;
  spendPlutusV3(txHash: string, txIndex: number): SpendScriptBuilder;

  mintPlutusV1(
    quantity: string,
    policyId: string,
    assetName: string,
  ): MintScriptBuilder;
  mintPlutusV2(
    quantity: string,
    policyId: string,
    assetName: string,
  ): MintScriptBuilder;
  mintPlutusV3(
    quantity: string,
    policyId: string,
    assetName: string,
  ): MintScriptBuilder;

  withdrawPlutusV1(
    rewardAddress: string,
    amount: string,
  ): WithdrawScriptBuilder;
  withdrawPlutusV2(
    rewardAddress: string,
    amount: string,
  ): WithdrawScriptBuilder;
  withdrawPlutusV3(
    rewardAddress: string,
    amount: string,
  ): WithdrawScriptBuilder;

  votePlutusV1(
    voter: Voter,
    govActionId: RefTxIn,
    votingProcedure: VotingProcedure,
  ): VoteScriptBuilder;
  votePlutusV2(
    voter: Voter,
    govActionId: RefTxIn,
    votingProcedure: VotingProcedure,
  ): VoteScriptBuilder;
  votePlutusV3(
    voter: Voter,
    govActionId: RefTxIn,
    votingProcedure: VotingProcedure,
  ): VoteScriptBuilder;
}

type ScriptMethodsToDrop =
  | "spendingPlutusScript"
  | "spendingPlutusScriptV1"
  | "spendingPlutusScriptV2"
  | "spendingPlutusScriptV3"
  | "spendingTxInReference"
  | "spendingReferenceTxInInlineDatumPresent"
  | "spendingReferenceTxInRedeemerValue"
  | "mintPlutusScript"
  | "mintPlutusScriptV1"
  | "mintPlutusScriptV2"
  | "mintPlutusScriptV3"
  | "mintingScript"
  | "mintTxInReference"
  | "mintReferenceTxInRedeemerValue"
  | "mintRedeemerValue"
  | "withdrawalPlutusScript"
  | "withdrawalPlutusScriptV1"
  | "withdrawalPlutusScriptV2"
  | "withdrawalPlutusScriptV3"
  | "withdrawalScript"
  | "withdrawalTxInReference"
  | "withdrawalReferenceTxInRedeemerValue"
  | "withdrawalRedeemerValue"
  | "votePlutusScript"
  | "votePlutusScriptV1"
  | "votePlutusScriptV2"
  | "votePlutusScriptV3"
  | "voteScript"
  | "voteTxInReference"
  | "voteReferenceTxInRedeemerValue"
  | "voteRedeemerValue"
  | "txInScript"
  | "txInDatumValue"
  | "txInInlineDatumPresent"
  | "txInRedeemerValue";

// ── Spend Builder Types ────────────────────────────────────────────────

export interface SpendScriptBuilder {
  script(scriptCbor: string): SpendRedeemerBuilder;
  referenceScript(
    refTxHash: string,
    refTxIndex: number,
    scriptSize?: string,
    scriptHash?: string,
  ): SpendRedeemerBuilder;
}

export interface SpendRedeemerBuilder {
  redeemerJson(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): SpendTxOutBuilder;
  redeemerCbor(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): SpendTxOutBuilder;
}

export interface SpendTxOutBuilder {
  txOut(address: string, amount: Asset[]): SpendDatumBuilder;
}

export interface SpendDatumBuilder {
  datumHash(datumHash: string): _MeshTxBuilderV2;
  datumCbor(datumCbor: BuilderData["content"]): _MeshTxBuilderV2;
  datumJson(datumJson: BuilderData["content"]): _MeshTxBuilderV2;
}

// ── Mint Builder Types ─────────────────────────────────────────────────

export interface MintScriptBuilder {
  script(scriptCbor: string): MintRedeemerBuilder;
  referenceScript(
    txHash: string,
    txIndex: number,
    scriptSize?: string,
    scriptHash?: string,
  ): MintRedeemerBuilder;
}

export interface MintRedeemerBuilder {
  redeemerJson(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): MintTxOutBuilder;
  redeemerCbor(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): MintTxOutBuilder;
}

export interface MintTxOutBuilder {
  txOut(address: string, amount: Asset[]): _MeshTxBuilderV2;
}

// ── Vote Builder Types ─────────────────────────────────────────────────

export interface VoteScriptBuilder {
  script(scriptCbor: string): VoteRedeemerBuilder;
  referenceScript(
    txHash: string,
    txIndex: number,
    scriptSize?: string,
    scriptHash?: string,
  ): VoteRedeemerBuilder;
}

export interface VoteRedeemerBuilder {
  redeemerJson(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): _MeshTxBuilderV2;
  redeemerCbor(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): _MeshTxBuilderV2;
}

// ── Withdrawal Builder Types ───────────────────────────────────────────

export interface WithdrawScriptBuilder {
  script(scriptCbor: string): WithdrawRedeemerBuilder;
  referenceScript(
    txHash: string,
    txIndex: number,
    scriptSize?: string,
    scriptHash?: string,
  ): WithdrawRedeemerBuilder;
}

export interface WithdrawRedeemerBuilder {
  redeemerJson(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): _MeshTxBuilderV2;
  redeemerCbor(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): _MeshTxBuilderV2;
}
