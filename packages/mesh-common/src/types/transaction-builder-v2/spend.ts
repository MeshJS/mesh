import { Asset, Budget, BuilderData } from "@meshsdk/core";
import { _MeshTxBuilderV2 } from "./builder-core";

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