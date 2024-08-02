import { BuiltinByteString, ConStr0, Integer } from "@meshsdk/common";
import { UTxO } from "@meshsdk/core";
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

  getUtxoByTxHash = async (txHash: string): Promise<UTxO | undefined> => {
    return await this._getUtxoByTxHash(this.scriptCbor, txHash);
  };
}
