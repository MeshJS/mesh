import { Budget, BuilderData } from "@meshsdk/core";

import { _MeshTxBuilderV2 } from "./builder-core";

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
