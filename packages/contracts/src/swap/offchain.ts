import { MeshTxInitiator, MeshTxInitiatorInput } from '@mesh/common';
import {
  Asset,
  UTxO,
  mConStr0,
  mConStr1,
  pubKeyAddress,
  value,
  PubKeyAddress,
  Value,
  parsePlutusValueToAssets,
  conStr0,
  ConStr0,
} from '@meshsdk/common';
import {
  applyParamsToScript,
  parseDatumCbor,
  parsePlutusAddressObjToBech32,
  serializeBech32Address,
  v2ScriptToBech32,
} from '@meshsdk/core-csl';
import blueprint from './aiken-workspace/plutus.json';

export type SwapDatum = ConStr0<[PubKeyAddress, Value, Value]>;

export class MeshSwapContract extends MeshTxInitiator {
  scriptCbor = applyParamsToScript(blueprint.validators[0].compiledCode, []);
  scriptAddress: string;

  constructor(inputs: MeshTxInitiatorInput) {
    super(inputs);
    this.scriptAddress = v2ScriptToBech32(
      this.scriptCbor,
      undefined,
      this.networkId
    );
  }

  initiateSwap = async (
    toProvide: Asset[],
    toReceive: Asset[]
  ): Promise<string> => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();
    const { pubKeyHash, stakeCredential } =
      serializeBech32Address(walletAddress);
    const swapDatum: SwapDatum = conStr0([
      pubKeyAddress(pubKeyHash, stakeCredential),
      value(toProvide),
      value(toReceive),
    ]);

    await this.mesh
      .txOut(this.scriptAddress, toProvide)
      .txOutInlineDatumValue(swapDatum, 'JSON')
      .changeAddress(walletAddress)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address
      )
      .selectUtxosFrom(utxos)
      .complete();

    return this.mesh.txHex;
  };

  acceptSwap = async (swapUtxo: UTxO): Promise<string> => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();
    const inlineDatum = parseDatumCbor<SwapDatum>(swapUtxo.output.plutusData!);
    const initiatorAddress = parsePlutusAddressObjToBech32(
      inlineDatum.fields[0]
    );
    const initiatorToReceive = inlineDatum.fields[2];

    await this.mesh
      .spendingPlutusScriptV2()
      .txIn(
        swapUtxo.input.txHash,
        swapUtxo.input.outputIndex,
        swapUtxo.output.amount,
        swapUtxo.output.address
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue(mConStr1([]))
      .txInScript(this.scriptCbor)
      .txOut(initiatorAddress, parsePlutusValueToAssets(initiatorToReceive))
      .changeAddress(walletAddress)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address
      )
      .selectUtxosFrom(utxos)
      .complete();
    return this.mesh.txHex;
  };

  cancelSwap = async (swapUtxo: UTxO): Promise<string> => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();
    const inlineDatum = parseDatumCbor<SwapDatum>(swapUtxo.output.plutusData!);
    const initiatorAddress = parsePlutusAddressObjToBech32(
      inlineDatum.fields[0]
    );
    await this.mesh
      .spendingPlutusScriptV2()
      .txIn(
        swapUtxo.input.txHash,
        swapUtxo.input.outputIndex,
        swapUtxo.output.amount,
        swapUtxo.output.address
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue(mConStr0([]))
      .txInScript(this.scriptCbor)
      .changeAddress(walletAddress)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address
      )
      .requiredSignerHash(serializeBech32Address(initiatorAddress).pubKeyHash)
      .selectUtxosFrom(utxos)
      .complete();
    return this.mesh.txHex;
  };

  getUtxoByTxHash = async (txHash: string): Promise<UTxO | undefined> => {
    return await this._getUtxoByTxHash(this.scriptCbor, txHash);
  };
}
