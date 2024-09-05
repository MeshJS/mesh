import {
  builtinByteString,
  BuiltinByteString,
  Integer,
  List,
  mConStr0,
  mConStr1,
  outputReference,
  PlutusScript,
  stringToHex,
  txOutRef,
} from "@meshsdk/common";
import {
  Asset,
  deserializeDatum,
  resolveScriptHash,
  serializePlutusScript,
  UTxO,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";

import { MeshTxInitiator, MeshTxInitiatorInput } from "../common";
import blueprintV1 from "./aiken-workspace-v1/plutus.json";
import blueprintV2 from "./aiken-workspace-v2/plutus.json";

export class MeshGiftCardContract extends MeshTxInitiator {
  tokenNameHex: string = "";
  paramUtxo: UTxO["input"] = { outputIndex: 0, txHash: "" };

  giftCardCbor = (
    tokenNameHex: string,
    utxoTxHash: string,
    utxoTxId: number,
  ) => {
    let scriptCbor;
    let utxo;
    switch (this.version) {
      case 2:
        scriptCbor = blueprintV2.validators[0]!.compiledCode;
        utxo = outputReference(utxoTxHash, utxoTxId);
        break;
      default:
        scriptCbor = blueprintV1.validators[0]!.compiledCode;
        utxo = txOutRef(utxoTxHash, utxoTxId);
        break;
    }

    return applyParamsToScript(
      scriptCbor,
      [builtinByteString(tokenNameHex), utxo],
      "JSON",
    );
  };

  redeemCbor = (tokenNameHex: string, policyId: string) => {
    let scriptCbor;
    switch (this.version) {
      case 2:
        scriptCbor = blueprintV2.validators[2]!.compiledCode;
        break;
      default:
        scriptCbor = blueprintV1.validators[1]!.compiledCode;
    }

    return applyParamsToScript(scriptCbor, [tokenNameHex, policyId]);
  };

  constructor(
    inputs: MeshTxInitiatorInput,
    tokenNameHex?: string,
    paramUtxo?: UTxO["input"],
  ) {
    super(inputs);
    if (tokenNameHex) {
      this.tokenNameHex = tokenNameHex;
    }
    if (paramUtxo) {
      this.paramUtxo = paramUtxo;
    }
  }

  createGiftCard = async (
    tokenName: string,
    giftValue: Asset[],
  ): Promise<string> => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();
    const tokenNameHex = stringToHex(tokenName);
    const firstUtxo = utxos[0];
    if (firstUtxo === undefined) throw new Error("No UTXOs available");
    const remainingUtxos = utxos.slice(1);
    const giftCardScript = this.giftCardCbor(
      tokenNameHex,
      firstUtxo.input.txHash,
      firstUtxo.input.outputIndex,
    );

    const giftCardPolicy = resolveScriptHash(
      giftCardScript,
      this.languageVersion,
    );

    const redeemScript: PlutusScript = {
      code: this.redeemCbor(tokenNameHex, giftCardPolicy),
      version: this.languageVersion,
    };

    const redeemAddr = serializePlutusScript(
      redeemScript,
      undefined,
      this.networkId,
    ).address;

    await this.mesh
      .txIn(
        firstUtxo.input.txHash,
        firstUtxo.input.outputIndex,
        firstUtxo.output.amount,
        firstUtxo.output.address,
      )
      .mintPlutusScript(this.languageVersion)
      .mint("1", giftCardPolicy, tokenNameHex)
      .mintingScript(giftCardScript)
      .mintRedeemerValue(mConStr0([]))
      .txOut(redeemAddr, [
        ...giftValue,
        { unit: giftCardPolicy + tokenNameHex, quantity: "1" },
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
        collateral.output.address,
      )
      .selectUtxosFrom(remainingUtxos)
      .complete();

    this.tokenNameHex = tokenNameHex;
    this.paramUtxo = firstUtxo.input;

    return this.mesh.txHex;
  };

  redeemGiftCard = async (giftCardUtxo: UTxO): Promise<string> => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();

    const inlineDatum = deserializeDatum<List>(
      giftCardUtxo.output.plutusData!,
    ).list;
    const paramTxHash = (inlineDatum[0] as BuiltinByteString).bytes;
    const paramTxId = (inlineDatum[1] as Integer).int as number;
    const tokenNameHex = (inlineDatum[2] as BuiltinByteString).bytes;
    const giftCardScript = this.giftCardCbor(
      tokenNameHex,
      paramTxHash,
      paramTxId,
    );

    const giftCardPolicy = resolveScriptHash(
      giftCardScript,
      this.languageVersion,
    );

    const redeemScript = this.redeemCbor(tokenNameHex, giftCardPolicy);

    await this.mesh
      .spendingPlutusScript(this.languageVersion)
      .txIn(
        giftCardUtxo.input.txHash,
        giftCardUtxo.input.outputIndex,
        giftCardUtxo.output.amount,
        giftCardUtxo.output.address,
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue("")
      .txInScript(redeemScript)
      .mintPlutusScript(this.languageVersion)
      .mint("-1", giftCardPolicy, tokenNameHex)
      .mintingScript(giftCardScript)
      .mintRedeemerValue(mConStr1([]))
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
    return await this._getUtxoByTxHash(txHash);
  };
}
