import { Budget, BuilderData } from "@meshsdk/core";

import { _MeshTxBuilderV2 } from "./builder-core";

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
