import {
  Asset,
  conStr0,
  ConStr0,
  mConStr0,
  mConStr1,
  MeshValue,
  pubKeyAddress,
  PubKeyAddress,
  UTxO,
  value,
  Value,
} from "@meshsdk/common";
import {
  deserializeAddress,
  deserializeDatum,
  serializeAddressObj,
  serializePlutusScript,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";

import { MeshTxInitiator, MeshTxInitiatorInput } from "../common";
import blueprint from "./aiken-workspace/plutus.json";

export const MeshSwapBlueprint = blueprint;

export type SwapDatum = ConStr0<[PubKeyAddress, Value, Value]>;

export class MeshSwapContract extends MeshTxInitiator {
  scriptCbor = applyParamsToScript(blueprint.validators[0]!.compiledCode, []);
  scriptAddress: string;

  constructor(inputs: MeshTxInitiatorInput) {
    super(inputs);
    this.scriptAddress = serializePlutusScript(
      { code: this.scriptCbor, version: "V2" },
      undefined,
      inputs.networkId,
    ).address;
  }

  initiateSwap = async (
    toProvide: Asset[],
    toReceive: Asset[],
  ): Promise<string> => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();
    const { pubKeyHash, stakeCredentialHash } =
      deserializeAddress(walletAddress);
    const swapDatum: SwapDatum = conStr0([
      pubKeyAddress(pubKeyHash, stakeCredentialHash),
      value(toProvide),
      value(toReceive),
    ]);

    await this.mesh
      .txOut(this.scriptAddress, toProvide)
      .txOutInlineDatumValue(swapDatum, "JSON")
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

  acceptSwap = async (swapUtxo: UTxO): Promise<string> => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();
    const inlineDatum = deserializeDatum<SwapDatum>(
      swapUtxo.output.plutusData!,
    );
    const initiatorAddress = serializeAddressObj(
      inlineDatum.fields[0],
      this.networkId,
    );
    const initiatorToReceive = inlineDatum.fields[2];

    await this.mesh
      .spendingPlutusScriptV2()
      .txIn(
        swapUtxo.input.txHash,
        swapUtxo.input.outputIndex,
        swapUtxo.output.amount,
        swapUtxo.output.address,
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue(mConStr1([]))
      .txInScript(this.scriptCbor)
      .txOut(
        initiatorAddress,
        MeshValue.fromValue(initiatorToReceive).toAssets(),
      )
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

  cancelSwap = async (swapUtxo: UTxO): Promise<string> => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();
    const inlineDatum = deserializeDatum<SwapDatum>(
      swapUtxo.output.plutusData!,
    );
    const initiatorAddress = serializeAddressObj(
      inlineDatum.fields[0],
      this.networkId,
    );
    await this.mesh
      .spendingPlutusScriptV2()
      .txIn(
        swapUtxo.input.txHash,
        swapUtxo.input.outputIndex,
        swapUtxo.output.amount,
        swapUtxo.output.address,
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue(mConStr0([]))
      .txInScript(this.scriptCbor)
      .changeAddress(walletAddress)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address,
      )
      .requiredSignerHash(deserializeAddress(initiatorAddress).pubKeyHash)
      .selectUtxosFrom(utxos)
      .complete();
    return this.mesh.txHex;
  };

  getUtxoByTxHash = async (txHash: string): Promise<UTxO | undefined> => {
    return await this._getUtxoByTxHash(txHash, this.scriptCbor);
  };
}
