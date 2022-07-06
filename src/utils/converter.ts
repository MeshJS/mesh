import { Assets, UTxO } from "../types";
import * as lib from "@emurgo/cardano-serialization-lib-browser";

export const fromHex = (hex) => Buffer.from(hex, "hex");

export const toHex = (bytes) => Buffer.from(bytes).toString("hex");

export const fromLovelace = (lovelace) => lovelace / 1000000;

export const toLovelace = (ada) => ada * 1000000;

export const fromStr = (str) => Buffer.from(str, "utf-8");

export const toStr = (bytes) => String.fromCharCode.apply(String, bytes);

export const HexToAscii = (string) => fromHex(string).toString("ascii");

export const assetsToValue = (assets: Assets) => {
  const multiAsset = lib.MultiAsset.new();
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
    const assetsValue = lib.Assets.new();
    policyUnits.forEach((unit) => {
      assetsValue.insert(
        lib.AssetName.new(fromHex(unit.slice(56))),
        lib.BigNum.from_str(assets[unit].toString())
      );
    });
    multiAsset.insert(lib.ScriptHash.from_bytes(fromHex(policy)), assetsValue);
  });
  const value = lib.Value.new(
    lib.BigNum.from_str(lovelace ? lovelace.toString() : "0")
  );
  if (units.length > 1 || !lovelace) value.set_multiasset(multiAsset);
  return value;
};

export const StringToBigNum = (string) => lib.BigNum.from_str(string);

export const utxoToCore = (utxo: UTxO): lib.TransactionUnspentOutput => {
  const output = lib.TransactionOutput.new(
    lib.Address.from_bech32(utxo.address),
    assetsToValue(utxo.assets)
  );

  return lib.TransactionUnspentOutput.new(
    lib.TransactionInput.new(
      lib.TransactionHash.from_bytes(fromHex(utxo.txHash)),
      utxo.outputIndex
    ),
    output
  );
};

export const StringToAddress = (string) => lib.Address.from_bech32(string);
