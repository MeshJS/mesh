import { csl } from './csl';
import type { Value } from './csl';
import type { Asset } from './types';

const {
  Address, AssetName, Assets, BaseAddress, BigNum,
  EnterpriseAddress, MultiAsset, ScriptHash, Value,
} = csl;

/* -----------------[ Address ]----------------- */

export const toAddress = (bech32: string) => Address.from_bech32(bech32);

export const toBaseAddress = (bech32: string) => BaseAddress.from_address(toAddress(bech32));

export const toEnterpriseAddress = (bech32: string) => EnterpriseAddress.from_address(toAddress(bech32));

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
      const collectionId = policies.get(i);
      const collectionAssets = multiasset.get(collectionId);
      if (collectionAssets !== undefined) {
        const collectionAssetNames = collectionAssets.keys();
        for (let j = 0; j < collectionAssetNames.len(); j += 1) {
          const assetName = collectionAssetNames.get(j);
          const quantity = collectionAssets.get(assetName) ?? BigNum.from_str('0');
          const assetId = fromBytes(collectionId.to_bytes()) + fromBytes(assetName.name());
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

  const multiAsset = MultiAsset.new();
  policies.forEach((collectionId) => {
    const collectionAssets = Assets.new();
    assets
      .filter((asset) => asset.unit.slice(0, POLICY_ID_LENGTH) === collectionId)
      .forEach((asset) => {
        collectionAssets.insert(
          AssetName.new(toBytes(asset.unit.slice(POLICY_ID_LENGTH))),
          BigNum.from_str(asset.quantity)
        );
      });

    multiAsset.insert(
      ScriptHash.from_bytes(toBytes(collectionId)),
      collectionAssets
    );
  });

  const value = csl.Value.new(BigNum.from_str(lovelace ? lovelace.quantity : '0'));

  if (assets.length > 1 || !lovelace) {
    value.set_multiasset(multiAsset);
  }

  return value;
};
