import { Assets, UTxO } from "../types";
// import * as lib from "@emurgo/cardano-serialization-lib-browser/cardano_serialization_lib.js";
import SerializationLib from "../provider/serializationlib.js";

export const fromHex = (hex) => Buffer.from(hex, "hex");

export const toHex = (bytes) => Buffer.from(bytes).toString("hex");

export const fromLovelace = (lovelace) => lovelace / 1000000;

export const toLovelace = (ada) => ada * 1000000;

export const fromStr = (str) => Buffer.from(str, "utf-8");

export const toStr = (bytes) => String.fromCharCode.apply(String, bytes);

export const HexToAscii = (string) => fromHex(string).toString("ascii");

export const assetsToValue = (assets: Assets) => {
  const multiAsset = SerializationLib.Instance.MultiAsset.new();
  const lovelace = assets["lovelace"];
  const units = Object.keys(assets);
  const policies = Array.from(
    new Set(
      units
        .filter((unit) => unit !== "lovelace")
        .map((unit) => unit.slice(0, 56))
    )
  );
  policies.forEach((policy) => {
    const policyUnits = units.filter((unit) => unit.slice(0, 56) === policy);
    const assetsValue = SerializationLib.Instance.Assets.new();
    policyUnits.forEach((unit) => {
      assetsValue.insert(
        SerializationLib.Instance.AssetName.new(fromHex(unit.slice(56))),
        SerializationLib.Instance.BigNum.from_str(assets[unit].toString())
      );
    });
    multiAsset.insert(
      SerializationLib.Instance.ScriptHash.from_bytes(fromHex(policy)),
      assetsValue
    );
  });
  const value = SerializationLib.Instance.Value.new(
    SerializationLib.Instance.BigNum.from_str(
      lovelace ? lovelace.toString() : "0"
    )
  );
  if (units.length > 1 || !lovelace) value.set_multiasset(multiAsset);
  return value;
};

export const StringToBigNum = (string) =>
  SerializationLib.Instance.BigNum.from_str(string);

export const utxoToCore = (utxo: UTxO) => {
  const output = SerializationLib.Instance.TransactionOutput.new(
    SerializationLib.Instance.Address.from_bech32(utxo.address),
    assetsToValue(utxo.assets)
  );

  return SerializationLib.Instance.TransactionUnspentOutput.new(
    SerializationLib.Instance.TransactionInput.new(
      SerializationLib.Instance.TransactionHash.from_bytes(
        fromHex(utxo.txHash)
      ),
      utxo.outputIndex
    ),
    output
  );
};

export const StringToAddress = (string) =>
  SerializationLib.Instance.Address.from_bech32(string);

export const harden = (num) => {
  return 0x80000000 + num;
};

/**
 *
 * @param {JSON} output
 * @param {BaseAddress} address
 * @returns
 */
export const utxoFromJson = async (output, address) => {
  return SerializationLib.Instance.TransactionUnspentOutput.new(
    SerializationLib.Instance.TransactionInput.new(
      SerializationLib.Instance.TransactionHash.from_bytes(
        Buffer.from(output.tx_hash || output.txHash, "hex")
      ),
      output.output_index || output.txId
    ),
    SerializationLib.Instance.TransactionOutput.new(
      // SerializationLib.Instance.Address.from_bytes(Buffer.from(address, "hex")),
      StringToAddress(address),
      await assetsToValue(output.amount)
    )
  );
};

export const valueToAssets = (value) => {
  const assets: { unit: string; quantity: string }[] = [];
  assets.push({ unit: "lovelace", quantity: value.coin().to_str() });
  if (value.multiasset()) {
    const multiAssets = value.multiasset().keys();
    for (let j = 0; j < multiAssets.len(); j++) {
      const policy = multiAssets.get(j);
      const policyAssets = value.multiasset().get(policy);
      const assetNames = policyAssets.keys();
      for (let k = 0; k < assetNames.len(); k++) {
        const policyAsset = assetNames.get(k);
        const quantity = policyAssets.get(policyAsset);
        const asset = toHex(policy.to_bytes()) + toHex(policyAsset.name());
        assets.push({
          unit: asset,
          quantity: quantity.to_str(),
        });
      }
    }
  }
  return assets;
};
