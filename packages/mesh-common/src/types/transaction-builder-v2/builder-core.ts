import { MeshTxBuilder, RefTxIn, Voter, VotingProcedure } from "@meshsdk/core";
import { SpendScriptBuilder } from "./spend";
import { MintScriptBuilder } from "./mint";
import { WithdrawScriptBuilder } from "./withdrawal";
import { VoteScriptBuilder } from "./vote";

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
