import { MeshTxBuilder, RefTxIn, Voter, VotingProcedure } from "@meshsdk/core";
import { SpendRedeemerBuilder } from "./spend";
import { MintRedeemerBuilder } from "./mint";
import { WithdrawRedeemerBuilder } from "./withdrawal";
import { VoteRedeemerBuilder } from "./vote";

export interface _MeshTxBuilderV2
  extends Omit<MeshTxBuilder, ScriptMethodsToDrop> {
  spendPlutusV1(txHash: string, txIndex: number): SpendRedeemerBuilder;
  spendPlutusV2(txHash: string, txIndex: number): SpendRedeemerBuilder;
  spendPlutusV3(txHash: string, txIndex: number): SpendRedeemerBuilder;

  mintPlutusV1(
    quantity: string,
    policyId: string,
    assetName: string,
  ): MintRedeemerBuilder;
  mintPlutusV2(
    quantity: string,
    policyId: string,
    assetName: string,
  ): MintRedeemerBuilder;
  mintPlutusV3(
    quantity: string,
    policyId: string,
    assetName: string,
  ): MintRedeemerBuilder;

  withdrawPlutusV1(
    rewardAddress: string,
    amount: string,
  ): WithdrawRedeemerBuilder;
  withdrawPlutusV2(
    rewardAddress: string,
    amount: string,
  ): WithdrawRedeemerBuilder;
  withdrawPlutusV3(
    rewardAddress: string,
    amount: string,
  ): WithdrawRedeemerBuilder;

  votePlutusV1(
    voter: Voter,
    govActionId: RefTxIn,
    votingProcedure: VotingProcedure,
  ): VoteRedeemerBuilder;
  votePlutusV2(
    voter: Voter,
    govActionId: RefTxIn,
    votingProcedure: VotingProcedure,
  ): VoteRedeemerBuilder;
  votePlutusV3(
    voter: Voter,
    govActionId: RefTxIn,
    votingProcedure: VotingProcedure,
  ): VoteRedeemerBuilder;
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
