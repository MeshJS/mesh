import { Budget, BuilderData } from "@meshsdk/core";
import { _MeshTxBuilderV2 } from "./builder-core";

export interface WithdrawRedeemerBuilder {
  redeemerJson(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): WithdrawScriptBuilder;
  redeemerCbor(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): WithdrawScriptBuilder;
}
export interface WithdrawScriptBuilder {
  script(scriptCbor: string): _MeshTxBuilderV2;
  referenceScript(
    txHash: string,
    txIndex: number,
    scriptSize?: string,
    scriptHash?: string,
  ): _MeshTxBuilderV2;
}