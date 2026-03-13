import { Asset, Budget, BuilderData } from "@meshsdk/core";
import { _MeshTxBuilderV2 } from "./builder-core";

export interface SpendRedeemerBuilder {
    redeemerJson(
      redeemer: BuilderData["content"],
      exUnits?: Budget,
    ): SpendScriptBuilder;
    redeemerCbor(
      redeemer: BuilderData["content"],
      exUnits?: Budget,
    ): SpendScriptBuilder;
  }
  
  export interface SpendScriptBuilder {
    script(scriptCbor: string): SpendDatumBuilder;
    referenceScript(
      refTxHash: string,
      refTxIndex: number,
      scriptSize?: string,
      scriptHash?: string,
    ): SpendDatumBuilder;
  }
  export interface SpendDatumBuilder {
    datumHash(datumHash: string): SpendTxOutBuilder;
    datumCbor(datumCbor: BuilderData["content"]): SpendTxOutBuilder;
    datumJson(datumJson: BuilderData["content"]): SpendTxOutBuilder;
  }

  export interface SpendTxOutBuilder {
    txOut(address: string, amount: Asset[]): _MeshTxBuilderV2;
  }