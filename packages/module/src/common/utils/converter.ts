import { csl } from '../../core';
import type { Value } from '../../core';
import type { Asset } from '../types/Asset';

/* -----------------[ Address ]----------------- */

export const toAddress = (bech32: string) => csl.Address.from_bech32(bech32);

export const toBaseAddress = (bech32: string) => csl.BaseAddress.from_address(toAddress(bech32));

export const toEnterpriseAddress = (bech32: string) => csl.EnterpriseAddress.from_address(toAddress(bech32));

/* -----------------[ Bytes ]----------------- */

export const fromBytes = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

export const toBytes = (hex: string) => Buffer.from(hex, 'hex') as Uint8Array;

/* -----------------[ Lovelace ]----------------- */

export const fromLovelace = (lovelace: number) => lovelace / 1_000_000;

export const toLovelace = (ada: number) => ada * 1_000_000;

/* -----------------[ Value ]----------------- */

const POLICY_ID_LENGTH = 56;

export const fromValue = (value: Value) => {
  const assets: Asset[] = [
    { unit: 'lovelace', quantity: value.coin().to_str() },
  ];

  const multiasset = value.multiasset();
  if (multiasset !== undefined) {
    const policies = multiasset.keys();
    for (let i = 0; i < policies.len(); i += 1) {
      const policyId = policies.get(i);
      const policyAssets = multiasset.get(policyId);
      if (policyAssets !== undefined) {
        const policyAssetNames = policyAssets.keys();
        for (let j = 0; j < policyAssetNames.len(); j += 1) {
          const assetName = policyAssetNames.get(j);
          const quantity = policyAssets.get(assetName) ?? csl.BigNum.from_str('0');
          const assetId = fromBytes(policyId.to_bytes()) + fromBytes(assetName.name());
          assets.push({ unit: assetId, quantity: quantity.to_str() });
        }
      }
    }
  }

  return assets;
};

export const toValue = (assets: Asset[]) => {
  const lovelace = assets.find((asset) => asset.unit === 'lovelace');
  const policies = [
    ...new Set<string>(
      assets
        .filter((asset) => asset.unit !== 'lovelace')
        .map((asset) => asset.unit.slice(0, POLICY_ID_LENGTH))
    ),
  ];

  const multiAsset = csl.MultiAsset.new();
  policies.forEach((policyId) => {
    const policyAssets = csl.Assets.new();
    assets
      .filter((asset) => asset.unit.slice(0, POLICY_ID_LENGTH) === policyId)
      .forEach((asset) => {
        policyAssets.insert(
          csl.AssetName.new(toBytes(asset.unit.slice(POLICY_ID_LENGTH))),
          csl.BigNum.from_str(asset.quantity)
        );
      });

    multiAsset.insert(
      csl.ScriptHash.from_bytes(toBytes(policyId)),
      policyAssets
    );
  });

  const value = csl.Value.new(csl.BigNum.from_str(lovelace ? lovelace.quantity : '0'));

  if (assets.length > 1 || !lovelace) {
    value.set_multiasset(multiAsset);
  }

  return value;
};
