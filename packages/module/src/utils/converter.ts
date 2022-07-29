import { Assets, UTxO } from '../types';
// import * as lib from "@emurgo/cardano-serialization-lib-browser/cardano_serialization_lib";
import { csl } from '../core';
import { PlutusData } from '../types/core';

export const fromHex = (hex: any) => Buffer.from(hex, 'hex');

export const toHex = (bytes: any) => Buffer.from(bytes).toString('hex');

export const fromLovelace = (lovelace: any) => lovelace / 1000000;

export const toLovelace = (ada: any) => ada * 1000000;

export const fromStr = (str: any) => Buffer.from(str, 'utf-8');

export const toStr = (bytes: any) => String.fromCharCode.apply(String, bytes);

export const fromFloat = (
  float: string
): { numerator: string; denominator: string } => {
  const parts = float.split('.');

  const numerator = `${parseInt(parts[1], 10)}`;
  const denominator = '1' + '0'.repeat(parts[1].length);

  return { numerator, denominator };
};

export const HexToAscii = (string: any) => fromHex(string).toString('ascii');

export const assetsToValue = (assets: Assets) => {
  const multiAsset = csl.MultiAsset.new();
  const lovelace = assets['lovelace'];
  const units = Object.keys(assets);
  const policies = Array.from(
    new Set(
      units
        .filter((unit) => unit !== 'lovelace')
        .map((unit) => unit.slice(0, 56))
    )
  );
  policies.forEach((policy) => {
    const policyUnits = units.filter((unit) => unit.slice(0, 56) === policy);
    const assetsValue = csl.Assets.new();
    policyUnits.forEach((unit) => {
      assetsValue.insert(
        csl.AssetName.new(fromHex(unit.slice(56))),
        csl.BigNum.from_str(assets[unit].toString())
      );
    });
    multiAsset.insert(csl.ScriptHash.from_bytes(fromHex(policy)), assetsValue);
  });
  const value = csl.Value.new(
    csl.BigNum.from_str(lovelace ? lovelace.toString() : '0')
  );
  if (units.length > 1 || !lovelace) value.set_multiasset(multiAsset);
  
  return value;
};

export const StringToBigNum = (string: any) => csl.BigNum.from_str(string);

export const utxoToCore = (utxo: UTxO) => {
  const output = csl.TransactionOutput.new(
    csl.Address.from_bech32(utxo.address),
    assetsToValue(utxo.assets)
  );

  return csl.TransactionUnspentOutput.new(
    csl.TransactionInput.new(
      csl.TransactionHash.from_bytes(fromHex(utxo.txHash)),
      utxo.outputIndex
    ),
    output
  );
};

export const StringToAddress = (string: any) => csl.Address.from_bech32(string);

export const harden = (num: any) => {
  return 0x80000000 + num;
};

/**
 *
 * @param {JSON} output
 * @param {BaseAddress} address
 * @returns
 */
export const utxoFromJson = async (output: any, address: any) => {
  return csl.TransactionUnspentOutput.new(
    csl.TransactionInput.new(
      csl.TransactionHash.from_bytes(
        Buffer.from(output.tx_hash || output.txHash, 'hex')
      ),
      output.output_index || output.txId
    ),
    csl.TransactionOutput.new(
      // csl.Address.from_bytes(Buffer.from(address, "hex")),
      StringToAddress(address),
      await assetsToValue(output.amount)
    )
  );
};

export const valueToAssets = (value: any) => {
  const assets: { unit: string; quantity: string }[] = [];
  assets.push({ unit: 'lovelace', quantity: value.coin().to_str() });
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

export const getAddressKeyHashHex = (address: string) => {
  let addr = csl.BaseAddress.from_address(csl.Address.from_bech32(address))
    ?.payment_cred()
    .to_keyhash()
    ?.to_bytes();
  if (addr) return toHex(addr);
  return null;
};

export const getAddressKeyHash = (address: string) => {
  return csl.BaseAddress.from_address(csl.Address.from_bech32(address))
    ?.payment_cred()
    .to_keyhash();
};

export const plutusDataToHex = (datum: PlutusData) => {
  return toHex(csl.hash_plutus_data(datum).to_bytes());
};
