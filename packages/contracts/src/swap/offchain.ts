import { MeshTxInitiator, MeshTxInitiatorInput } from '@mesh/common';
import {
  List,
  Asset,
  UTxO,
  mConStr0,
  mConStr1,
  pubKeyAddress,
  value,
  PubKeyAddress,
  Value,
  parsePlutusValueToAssets,
} from '@meshsdk/common';
import {
  applyParamsToScript,
  parseDatumCbor,
  parsePlutusAddressObjToBech32,
  serializeBech32Address,
  v2ScriptToBech32,
} from '@meshsdk/core-csl';
import blueprint from './aiken-workspace/plutus.json';

export class MeshSwapContract extends MeshTxInitiator {
  tokenNameHex: string = '';
  paramUtxo: UTxO['input'] = { outputIndex: 0, txHash: '' };
  scriptCbor = applyParamsToScript(blueprint.validators[0].compiledCode, []);
  scriptAddress: string;

  constructor(
    inputs: MeshTxInitiatorInput,
    tokenNameHex?: string,
    paramUtxo?: UTxO['input']
  ) {
    super(inputs);
    if (tokenNameHex) {
      this.tokenNameHex = tokenNameHex;
    }
    if (paramUtxo) {
      this.paramUtxo = paramUtxo;
    }
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
    await this.mesh
      .txOut(this.scriptAddress, toProvide)
      .txOutInlineDatumValue(
        [
          pubKeyAddress(pubKeyHash, stakeCredential),
          value(toProvide),
          value(toReceive),
        ],
        'JSON'
      )
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
    const inlineDatum = parseDatumCbor<List>(swapUtxo.output.plutusData!).list;
    const initiatorAddress = parsePlutusAddressObjToBech32(
      inlineDatum[0] as PubKeyAddress
    );
    const initiatorToReceive = inlineDatum[2] as Value;

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
    const inlineDatum = parseDatumCbor<List>(swapUtxo.output.plutusData!).list;
    const initiatorAddress = parsePlutusAddressObjToBech32(
      inlineDatum[0] as PubKeyAddress
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
