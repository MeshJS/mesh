import { Asset, Budget, BuilderData } from "@meshsdk/core";

import { _MeshTxBuilderV2 } from "./builder-core";

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
