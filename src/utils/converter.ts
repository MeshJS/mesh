import { Assets, UTxO } from "../types";
// import * as lib from "@emurgo/cardano-serialization-lib-browser/cardano_serialization_lib.js";
import Cardano from "../provider/serializationlib.js";

export const fromHex = (hex) => Buffer.from(hex, "hex");

export const toHex = (bytes) => Buffer.from(bytes).toString("hex");

export const fromLovelace = (lovelace) => lovelace / 1000000;

export const toLovelace = (ada) => ada * 1000000;

export const fromStr = (str) => Buffer.from(str, "utf-8");

export const toStr = (bytes) => String.fromCharCode.apply(String, bytes);

export const HexToAscii = (string) => fromHex(string).toString("ascii");

export const assetsToValue = (assets: Assets) => {
  const multiAsset = Cardano.Instance.MultiAsset.new();
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
    const assetsValue = Cardano.Instance.Assets.new();
    policyUnits.forEach((unit) => {
      assetsValue.insert(
        Cardano.Instance.AssetName.new(fromHex(unit.slice(56))),
        Cardano.Instance.BigNum.from_str(assets[unit].toString())
      );
    });
    multiAsset.insert(Cardano.Instance.ScriptHash.from_bytes(fromHex(policy)), assetsValue);
  });
  const value = Cardano.Instance.Value.new(
    Cardano.Instance.BigNum.from_str(lovelace ? lovelace.toString() : "0")
  );
  if (units.length > 1 || !lovelace) value.set_multiasset(multiAsset);
  return value;
};

export const StringToBigNum = (string) => Cardano.Instance.BigNum.from_str(string);

export const utxoToCore = (utxo: UTxO) => {
  const output = Cardano.Instance.TransactionOutput.new(
    Cardano.Instance.Address.from_bech32(utxo.address),
    assetsToValue(utxo.assets)
  );

  return Cardano.Instance.TransactionUnspentOutput.new(
    Cardano.Instance.TransactionInput.new(
      Cardano.Instance.TransactionHash.from_bytes(fromHex(utxo.txHash)),
      utxo.outputIndex
    ),
    output
  );
};

export const StringToAddress = (string) => Cardano.Instance.Address.from_bech32(string);

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
  return Cardano.Instance.TransactionUnspentOutput.new(
    Cardano.Instance.TransactionInput.new(
      Cardano.Instance.TransactionHash.from_bytes(
        Buffer.from(output.tx_hash || output.txHash, "hex")
      ),
      output.output_index || output.txId
    ),
    Cardano.Instance.TransactionOutput.new(
      Cardano.Instance.Address.from_bytes(Buffer.from(address, "hex")),
      await assetsToValue(output.amount)
    )
  );
};
