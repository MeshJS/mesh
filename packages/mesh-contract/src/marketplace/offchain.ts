import {
  ConStr0,
  conStr0,
  CurrencySymbol,
  currencySymbol,
  Integer,
  integer,
  mConStr0,
  mConStr1,
  parseAssetUnit,
  PubKeyAddress,
  pubKeyAddress,
  TokenName,
  tokenName,
} from "@meshsdk/common";
import {
  deserializeAddress,
  deserializeDatum,
  Quantity,
  serializeAddressObj,
  serializePlutusScript,
  Unit,
  UTxO,
} from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";

import { MeshTxInitiator, MeshTxInitiatorInput } from "../common";
import blueprint from "./aiken-workspace/plutus.json";

export const MeshMarketplaceBlueprint = blueprint;

export type MarketplaceDatum = ConStr0<
  [PubKeyAddress, Integer, CurrencySymbol, TokenName]
>;
export const marketplaceDatum = (
  sellerAddress: string,
  lovelaceFee: number,
  assetHex: string,
): MarketplaceDatum => {
  const { pubKeyHash, stakeCredentialHash } = deserializeAddress(sellerAddress);
  const { policyId, assetName } = parseAssetUnit(assetHex);
  return conStr0([
    pubKeyAddress(pubKeyHash, stakeCredentialHash),
    integer(lovelaceFee),
    currencySymbol(policyId),
    tokenName(assetName),
  ]);
};

export class MeshMarketplaceContract extends MeshTxInitiator {
  ownerAddress: string;
  feePercentageBasisPoint: number;
  scriptCbor: string;

  constructor(
    inputs: MeshTxInitiatorInput,
    ownerAddress: string,
    feePercentageBasisPoint: number,
  ) {
    super(inputs);
    this.ownerAddress = ownerAddress;
    this.feePercentageBasisPoint = feePercentageBasisPoint;
    const { pubKeyHash, stakeCredentialHash } =
      deserializeAddress(ownerAddress);
    this.scriptCbor = applyParamsToScript(
      blueprint.validators[0]!.compiledCode,
      [
        pubKeyAddress(pubKeyHash, stakeCredentialHash),
        integer(feePercentageBasisPoint),
      ],
      "JSON",
    );
  }

  listAsset = async (asset: string, price: number) => {
    const { utxos, walletAddress } = await this.getWalletInfoForTx();

    const assetMap = new Map<Unit, Quantity>();
    assetMap.set(asset, "1");

    const { address: scriptAddr } = serializePlutusScript(
      { code: this.scriptCbor, version: "V2" },
      undefined,
      this.networkId,
    );

    const tokenForSale = [{ unit: asset, quantity: "1" }];
    const outputDatum = marketplaceDatum(walletAddress, price, asset);

    await this.mesh
      .txOut(scriptAddr, tokenForSale)
      .txOutInlineDatumValue(outputDatum, "JSON")
      .changeAddress(walletAddress)
      .selectUtxosFrom(utxos)
      .complete();

    return this.mesh.txHex;
  };

  delistAsset = async (marketplaceUtxo: UTxO) => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();

    await this.mesh
      .spendingPlutusScriptV2()
      .txIn(
        marketplaceUtxo.input.txHash,
        marketplaceUtxo.input.outputIndex,
        marketplaceUtxo.output.amount,
        marketplaceUtxo.output.address,
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue(mConStr1([]))
      .txInScript(this.scriptCbor)
      .changeAddress(walletAddress)
      .requiredSignerHash(deserializeAddress(walletAddress).pubKeyHash)
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

  purchaseAsset = async (marketplaceUtxo: UTxO) => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();

    const inputDatum = deserializeDatum<MarketplaceDatum>(
      marketplaceUtxo.output.plutusData!,
    );

    // const listingPrice = inputDatum.fields[1].int.toString();

    const inputLovelace = marketplaceUtxo.output.amount.find(
      (a) => a.unit === "lovelace",
    )!.quantity;

    const tx = this.mesh
      .spendingPlutusScriptV2()
      .txIn(
        marketplaceUtxo.input.txHash,
        marketplaceUtxo.input.outputIndex,
        marketplaceUtxo.output.amount,
        marketplaceUtxo.output.address,
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
      .selectUtxosFrom(utxos);

    let ownerToReceiveLovelace =
      ((inputDatum.fields[1].int as number) * this.feePercentageBasisPoint) /
      10000;
    if (this.feePercentageBasisPoint > 0 && ownerToReceiveLovelace < 1000000) {
      ownerToReceiveLovelace = 1000000;
    }

    if (ownerToReceiveLovelace > 0) {
      const ownerAddress = this.ownerAddress;
      const ownerToReceive = [
        {
          unit: "lovelace",
          quantity: Math.ceil(ownerToReceiveLovelace).toString(),
        },
      ];
      tx.txOut(ownerAddress, ownerToReceive);
    }

    const sellerToReceiveLovelace =
      (inputDatum.fields[1].int as number) + Number(inputLovelace);

    if (sellerToReceiveLovelace > 0) {
      const sellerAddress = serializeAddressObj(
        inputDatum.fields[0],
        this.networkId,
      );
      const sellerToReceive = [
        {
          unit: "lovelace",
          quantity: sellerToReceiveLovelace.toString(),
        },
      ];
      tx.txOut(sellerAddress, sellerToReceive);
    }
    await tx.complete();

    return this.mesh.txHex;
  };

  relistAsset = async (marketplaceUtxo: UTxO, newPrice: number) => {
    const { utxos, walletAddress, collateral } =
      await this.getWalletInfoForTx();
    const inputAsset = marketplaceUtxo.output.amount.find(
      (a) => a.unit !== "lovelace",
    )!.unit;

    const tokenForSale = [{ unit: inputAsset, quantity: "1" }];
    const outputDatum = marketplaceDatum(walletAddress, newPrice, inputAsset);

    const { address: scriptAddr } = serializePlutusScript(
      { code: this.scriptCbor, version: "V2" },
      undefined,
      this.networkId,
    );

    await this.mesh
      .spendingPlutusScriptV2()
      .txIn(
        marketplaceUtxo.input.txHash,
        marketplaceUtxo.input.outputIndex,
        marketplaceUtxo.output.amount,
        marketplaceUtxo.output.address,
      )
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue(mConStr1([]))
      .txInScript(this.scriptCbor)
      .txOut(scriptAddr, tokenForSale)
      .txOutInlineDatumValue(outputDatum, "JSON")
      .changeAddress(walletAddress)
      .requiredSignerHash(deserializeAddress(walletAddress).pubKeyHash)
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
