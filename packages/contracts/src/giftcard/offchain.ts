import { MeshTxInitiator, MeshTxInitiatorInput } from '@mesh/common';
import {
  v2ScriptToBech32,
  mConStr0,
  applyObjParamsToScript,
  builtinByteString,
  txOutRef,
  stringToHex,
  getV2ScriptHash,
} from '@meshsdk/mesh-csl';
import blueprint from './aiken-workspace/plutus.json';
import { Asset } from '@meshsdk/core';

export class MeshGiftCardContract extends MeshTxInitiator {
  giftCardCbor = (tokenName: string, utxoTxHash: string, utxoTxId: number) =>
    applyObjParamsToScript(blueprint.validators[0].compiledCode, [
      builtinByteString(stringToHex(tokenName)),
      txOutRef(utxoTxHash, utxoTxId),
    ]);

  redeemCbor = (tokenName: string, policyId: string) =>
    applyObjParamsToScript(blueprint.validators[1].compiledCode, [
      builtinByteString(stringToHex(tokenName)),
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
    const firstUtxo = utxos[0];
    const remainingUtxos = utxos.slice(1);
    const giftCardScript = this.giftCardCbor(
      tokenName,
      firstUtxo.input.txHash,
      firstUtxo.input.outputIndex
    );
    const giftCardPolicy = getV2ScriptHash(giftCardScript);
    const redeemScript = this.redeemCbor(tokenName, giftCardPolicy);
    const redeemAddr = v2ScriptToBech32(redeemScript, undefined, networkId);

    await this.mesh
      .txIn(
        firstUtxo.input.txHash,
        firstUtxo.input.outputIndex,
        firstUtxo.output.amount,
        giftCardPolicy
      )
      .mintPlutusScriptV2()
      .mint('1', giftCardPolicy, stringToHex(tokenName))
      .mintingScript(giftCardScript)
      .mintRedeemerValue(mConStr0([]))
      .txOut(redeemAddr, giftValue)
      .txOutInlineDatumValue(giftCardPolicy)
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

  // redeemGiftCard = async (
  //   giftCardUtxo: UTxO,
  //   networkId = 0
  // ): Promise<string> => {
  //   const { utxos, walletAddress, collateral } =
  //     await this.getWalletInfoForTx();
  //   // const scriptAddr = v2ScriptToBech32(this.scriptCbor, undefined, networkId);

  //   const giftCardValue = parsePlutusValueToAssets(giftCardUtxo.output.amount);

  //   if (inputDatum.constructor === 1) {
  //     const [
  //       initiatorAddressObj,
  //       initiatorAmount,
  //       recipientAddressObj,
  //       recipientAmount,
  //     ] = inputDatum.fields;

  //     const initiatorAddress =
  //       parsePlutusAddressObjToBech32(initiatorAddressObj);
  //     const recipientAddress =
  //       parsePlutusAddressObjToBech32(recipientAddressObj);
  //     const initiatorToReceive = parsePlutusValueToAssets(initiatorAmount);
  //     const recipientToReceive = parsePlutusValueToAssets(recipientAmount);
  //     this.mesh
  //       .txOut(initiatorAddress, initiatorToReceive)
  //       .txOut(recipientAddress, recipientToReceive);
  //   }

  //   await this.mesh
  //     .spendingPlutusScriptV2()
  //     .txIn(
  //       escrowUtxo.input.txHash,
  //       escrowUtxo.input.outputIndex,
  //       escrowUtxo.output.amount,
  //       scriptAddr
  //     )
  //     .spendingReferenceTxInInlineDatumPresent()
  //     .spendingReferenceTxInRedeemerValue(mConStr1([]))
  //     .txInScript(this.scriptCbor)
  //     .requiredSignerHash(serializeBech32Address(walletAddress).pubKeyHash)
  //     .changeAddress(walletAddress)
  //     .txInCollateral(
  //       collateral.input.txHash,
  //       collateral.input.outputIndex,
  //       collateral.output.amount,
  //       collateral.output.address
  //     )
  //     .selectUtxosFrom(utxos)
  //     .complete();
  //   return this.mesh.txHex;
  // };
}
