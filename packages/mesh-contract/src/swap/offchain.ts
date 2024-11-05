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
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";

import { MeshTxInitiator, MeshTxInitiatorInput } from "../common";
import blueprintV1 from "./aiken-workspace-v1/plutus.json";
import blueprintV2 from "./aiken-workspace-v2/plutus.json";

export type SwapDatum = ConStr0<[PubKeyAddress, Value, Value]>;

export class MeshSwapContract extends MeshTxInitiator {
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
      .spendingPlutusScript(this.languageVersion)
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
      .spendingPlutusScript(this.languageVersion)
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
