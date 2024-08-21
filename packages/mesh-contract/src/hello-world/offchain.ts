import {
  Asset,
  BuiltinByteString,
  ConStr0,
  deserializeAddress,
  Integer,
  serializePlutusScript,
  UTxO,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";

import { MeshTxInitiator, MeshTxInitiatorInput } from "../common";
import blueprint from "./aiken-workspace/plutus.json";

export type HelloWorldDatum = ConStr0<
  [Integer, BuiltinByteString, BuiltinByteString]
>;

export const MeshHelloWorldBlueprint = blueprint;

export class MeshHelloWorldContract extends MeshTxInitiator {
  scriptCbor = applyParamsToScript(blueprint.validators[0]!.compiledCode, []);

  constructor(inputs: MeshTxInitiatorInput) {
    super(inputs);
  }

  getScript = () => {
    const { address } = serializePlutusScript(
      { code: this.scriptCbor, version: "V2" },
      undefined,
      this.networkId,
    );
    return {
      scriptAddr: address,
    };
  };

  lockAsset = async (assets: Asset[]): Promise<string> => {
    const { utxos, walletAddress } = await this.getWalletInfoForTx();
    const { scriptAddr } = this.getScript();
    const signerHash = deserializeAddress(walletAddress).pubKeyHash;

    await this.mesh
      .txOut(scriptAddr, assets)
      .txOutDatumHashValue(signerHash)
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .complete();
    return this.mesh.txHex;
  };

  unlockAsset = async (scriptUtxo: UTxO, message: string): Promise<string> => {
    return "this.mesh.txHex";
  };

  getUtxoByTxHash = async (txHash: string): Promise<UTxO | undefined> => {
    return await this._getUtxoByTxHash(txHash, this.scriptCbor);
  };
}
