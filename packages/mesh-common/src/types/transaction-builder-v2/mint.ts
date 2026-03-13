import { Asset, Budget, BuilderData } from "@meshsdk/core";
import { _MeshTxBuilderV2 } from "./builder-core";

export interface MintRedeemerBuilder {
    redeemerJson(
      redeemer: BuilderData["content"],
      exUnits?: Budget,
    ): MintScriptBuilder;
    redeemerCbor(
      redeemer: BuilderData["content"],
      exUnits?: Budget,
    ): MintScriptBuilder;
  }
  export interface MintScriptBuilder {
    script(scriptCbor: string): MintTxOutBuilder;
    referenceScript(
      txHash: string,
      txIndex: number,
      scriptSize?: string,
      scriptHash?: string,
    ): MintTxOutBuilder;
  }
  export interface MintTxOutBuilder {
    txOut(address: string, amount: Asset[]): _MeshTxBuilderV2;
  }