import {
  Asset,
  BuiltinByteString,
  ConStr0,
  deserializeAddress,
  Integer,
  mConStr0,
  stringToHex,
  UTxO,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";

import { MeshTxInitiator, MeshTxInitiatorInput } from "../common";
import blueprintV1 from "./aiken-workspace-v1/plutus.json";
import blueprintV2 from "./aiken-workspace-v2/plutus.json";

export type HelloWorldDatum = ConStr0<
  [Integer, BuiltinByteString, BuiltinByteString]
>;

export class MeshHelloWorldContract extends MeshTxInitiator {
  scriptCbor: string;
  scriptAddress: string;

  constructor(inputs: MeshTxInitiatorInput) {
    super(inputs);
    this.scriptCbor = this.getScriptCbor();
    this.scriptAddress = this.getScriptAddress(this.scriptCbor);
  }

  getScriptCbor = () => {
    switch (this.version) {
      case 2:
        return applyParamsToScript(blueprintV2.validators[0]!.compiledCode, []);
      default:
        return applyParamsToScript(blueprintV1.validators[0]!.compiledCode, []);
    }
  };

  lockAsset = async (assets: Asset[]): Promise<string> => {
    const { utxos, walletAddress } = await this.getWalletInfoForTx();

    const signerHash = deserializeAddress(walletAddress).pubKeyHash;

    await this.mesh
      .txOut(this.scriptAddress, assets)
      .txOutDatumHashValue(mConStr0([signerHash]))
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .complete();
    return this.mesh.txHex;
  };

  unlockAsset = async (scriptUtxo: UTxO, message: string): Promise<string> => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();
    const signerHash = deserializeAddress(walletAddress).pubKeyHash;

    await this.mesh
      .spendingPlutusScript(this.languageVersion)
      .txIn(
        scriptUtxo.input.txHash,
        scriptUtxo.input.outputIndex,
        scriptUtxo.output.amount,
        scriptUtxo.output.address,
      )
      .txInScript(this.scriptCbor)
      .txInRedeemerValue(mConStr0([stringToHex(message)]))
      .txInDatumValue(mConStr0([signerHash]))
      .requiredSignerHash(signerHash)
      .changeAddress(walletAddress)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .selectUtxosFrom(utxos)
      .complete();

    return this.mesh.txHex;
  };

  getUtxoByTxHash = async (txHash: string): Promise<UTxO | undefined> => {
    return await this._getUtxoByTxHash(txHash, this.scriptCbor);
  };
}
