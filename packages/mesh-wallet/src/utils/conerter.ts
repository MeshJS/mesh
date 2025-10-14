import { Cardano, Serialization } from "@cardano-sdk/core";
import { Hash32ByteBase16 } from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";

import { Asset, UTxO } from "@meshsdk/common";

export const toTxUnspentOutput = (utxo: UTxO) => {
  const txInput = new Serialization.TransactionInput(
    Cardano.TransactionId(utxo.input.txHash),
    BigInt(utxo.input.outputIndex),
  );

  const txOutput = new Serialization.TransactionOutput(
    Cardano.Address.fromBech32(utxo.output.address),
    toValue(utxo.output.amount),
  );

  if (utxo.output.dataHash !== undefined) {
    txOutput.setDatum(
      Serialization.Datum.fromCore(Hash32ByteBase16(utxo.output.dataHash)),
    );
  }

  if (utxo.output.plutusData !== undefined) {
    const plutusData = Serialization.PlutusData.fromCbor(
      HexBlob(utxo.output.plutusData),
    );
    const datum = new Serialization.Datum(undefined, plutusData);
    txOutput.setDatum(datum);
  }

  if (utxo.output.scriptRef !== undefined) {
    txOutput.setScriptRef(
      Serialization.Script.fromCbor(HexBlob(utxo.output.scriptRef)),
    );
  }

  return new Serialization.TransactionUnspentOutput(txInput, txOutput);
};

export const toValue = (assets: Asset[]) => {
  const multiAsset: Cardano.TokenMap = new Map();
  assets
    .filter((asset) => asset.unit !== "lovelace" && asset.unit !== "")
    .forEach((asset) => {
      multiAsset.set(Cardano.AssetId(asset.unit), BigInt(asset.quantity));
    });

  const lovelace = assets.find(
    (asset) => asset.unit === "lovelace" || asset.unit === "",
  );
  const value = new Serialization.Value(
    BigInt(lovelace ? lovelace.quantity : 0),
  );

  if (assets.length > 1 || !lovelace) {
    value.setMultiasset(multiAsset);
  }

  return value;
};
