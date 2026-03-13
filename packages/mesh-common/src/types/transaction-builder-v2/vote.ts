import { Budget, BuilderData } from "@meshsdk/core";
import { _MeshTxBuilderV2 } from "./builder-core";

export interface VoteRedeemerBuilder {
  redeemerJson(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): VoteScriptBuilder;
  redeemerCbor(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): VoteScriptBuilder;
}
export interface VoteScriptBuilder {
  script(scriptCbor: string): _MeshTxBuilderV2;
  referenceScript(
    txHash: string,
    txIndex: number,
    scriptSize?: string,
    scriptHash?: string,
  ): _MeshTxBuilderV2;
}
