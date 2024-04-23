import { MeshTxInitiator, MeshTxInitiatorInput } from '@mesh/common';
import {
  v2ScriptToBech32,
  mConStr0,
  applyObjParamsToScript,
  builtinByteString,
  txOutRef,
  stringToHex,
  getV2ScriptHash,
  parseDatumCbor,
  BuiltinByteString,
  List,
  Integer,
  mConStr1,
  applyParamsToScript,
} from '@meshsdk/mesh-csl';
import blueprint from './aiken-workspace/plutus.json';
import { Asset, UTxO } from '@meshsdk/core';

export class MeshGiftCardContract extends MeshTxInitiator {
  scriptCbor = applyParamsToScript(blueprint.validators[0].compiledCode, []); // todo hinson, this is not returning the correct address

  giftCardCbor = (tokenNameHex: string, utxoTxHash: string, utxoTxId: number) =>
    applyObjParamsToScript(blueprint.validators[0].compiledCode, [
      builtinByteString(tokenNameHex),
      txOutRef(utxoTxHash, utxoTxId),
    ]);

  redeemCbor = (tokenNameHex: string, policyId: string) =>
    applyObjParamsToScript(blueprint.validators[1].compiledCode, [
      builtinByteString(tokenNameHex),
      builtinByteString(policyId),
    ]);

  constructor(inputs: MeshTxInitiatorInput) {
    super(inputs);
  }

  createGiftCard = async (
    tokenName: string,
    giftValue: Asset[],
    networkId = 0
  ): Promise<string> => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();
    const tokenNameHex = stringToHex(tokenName);
    const firstUtxo = utxos[0];
    const remainingUtxos = utxos.slice(1);
    const giftCardScript = this.giftCardCbor(
      tokenNameHex,
      firstUtxo.input.txHash,
      firstUtxo.input.outputIndex
    );
    const giftCardPolicy = getV2ScriptHash(giftCardScript);
    const redeemScript = this.redeemCbor(tokenNameHex, giftCardPolicy);
    const redeemAddr = v2ScriptToBech32(redeemScript, undefined, networkId);

    await this.mesh
      .txIn(
        firstUtxo.input.txHash,
        firstUtxo.input.outputIndex,
        firstUtxo.output.amount,
        firstUtxo.output.address
      )
      .mintPlutusScriptV2()
      .mint('1', giftCardPolicy, tokenNameHex)
      .mintingScript(giftCardScript)
      .mintRedeemerValue(mConStr0([]))
      .txOut(redeemAddr, [
        ...giftValue,
        { unit: giftCardPolicy + tokenNameHex, quantity: '1' },
      ])
      .txOutInlineDatumValue([
        firstUtxo.input.txHash,
        firstUtxo.input.outputIndex,
        tokenNameHex,
      ])
      .changeAddress(walletAddress)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address
      )
      .selectUtxosFrom(remainingUtxos)
      .complete();
    return this.mesh.txHex;
  };

  redeemGiftCard = async (giftCardUtxo: UTxO): Promise<string> => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();

    const inlineDatum = parseDatumCbor<List>(
      giftCardUtxo.output.plutusData!
    ).list;
    const paramTxHash = (inlineDatum[0] as BuiltinByteString).bytes;
    const paramTxId = (inlineDatum[1] as Integer).int;
    const tokenNameHex = (inlineDatum[2] as BuiltinByteString).bytes;
    const giftCardScript = this.giftCardCbor(
      tokenNameHex,
      paramTxHash,
      paramTxId
    );
    const giftCardPolicy = getV2ScriptHash(giftCardScript);
    const redeemScript = this.redeemCbor(tokenNameHex, giftCardPolicy);

    await this.mesh
      .spendingPlutusScriptV2()
      .txIn(
        giftCardUtxo.input.txHash,
        giftCardUtxo.input.outputIndex,
        giftCardUtxo.output.amount,
        giftCardUtxo.output.address
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue('')
      .txInScript(redeemScript)
      .mintPlutusScriptV2()
      .mint('-1', giftCardPolicy, tokenNameHex)
      .mintingScript(giftCardScript)
      .mintRedeemerValue(mConStr1([]))
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
}
