/* eslint-disable @typescript-eslint/no-explicit-any */
import { Asset } from '@mesh/types';

export type ConStr<N = any, T = any> = { constructor: N; fields: T };
export type ConStr0<T = any> = ConStr<0, T>;
export type ConStr1<T = any> = ConStr<1, T>;
export type ConStr2<T = any> = ConStr<2, T>;
export type Bool = ConStr0<[]> | ConStr1<[]>;
export type BuiltinByteString = { bytes: string };
export type Integer = { int: number };
export type List = { list: PlutusData[] };
export type ValidatorHash = BuiltinByteString;
export type PaymentPubKeyHash = BuiltinByteString;
export type PubKeyHash = PaymentPubKeyHash;
export type POSIXTime = Integer;
export type CurrencySymbol = BuiltinByteString;
export type TokenName = BuiltinByteString;
export type MaybeStakingHash =
  | ConStr1<[]>
  | ConStr0<[ConStr0<[ConStr0<[BuiltinByteString]>]>]>;
export type PubKeyAddress = ConStr0<[ConStr0<[PubKeyHash]>, MaybeStakingHash]>;
export type ScriptAddress = ConStr0<
  [ConStr1<[ValidatorHash]>, MaybeStakingHash]
>;
export type AssetClass = ConStr0<[CurrencySymbol, TokenName]>;
export type TxOutRef = ConStr0<[ConStr0<[BuiltinByteString]>, Integer]>;
export type AssocMapItem<K, V> = { k: K; v: V };
export type DictItem<K, V> = { k: K; v: V };
export type AssocMap<K, V> = { map: AssocMapItem<K, V>[] };
export type Dict<K, V> = { map: DictItem<K, V>[] };
export type Tuple<K, V> = ConStr0<[K, V]>;
export type Value = AssocMap<CurrencySymbol, AssocMap<TokenName, Integer>>;
export type PlutusData =
  | BuiltinByteString
  | Integer
  | MaybeStakingHash
  | PubKeyAddress
  | ScriptAddress
  | AssetClass
  | PaymentPubKeyHash
  | PubKeyHash
  | POSIXTime
  | TxOutRef;

export const conStr = <N, T>(constructor: N, fields: T): ConStr<N, T> => ({
  constructor,
  fields,
});
export const conStr0 = <T>(fields: T): ConStr0<T> => conStr<0, T>(0, fields);
export const conStr1 = <T>(fields: T): ConStr1<T> => conStr<1, T>(1, fields);
export const conStr2 = <T>(fields: T): ConStr2<T> => conStr<2, T>(2, fields);
export const bool = (b: boolean): Bool =>
  b ? conStr1<[]>([]) : conStr0<[]>([]);
export const builtinByteString = (bytes: string): BuiltinByteString => ({
  bytes,
});
export const integer = (int: number): Integer => ({ int });
export const list = (pList: PlutusData[]): List => ({ list: pList });
export const currencySymbol = (bytes: string): CurrencySymbol =>
  builtinByteString(bytes);
export const tokenName = (bytes: string): TokenName => builtinByteString(bytes);
export const maybeStakingHash = (stakeCredential: string): MaybeStakingHash => {
  if (stakeCredential === '') {
    return conStr1<[]>([]);
  }
  return conStr0<[ConStr0<[ConStr0<[BuiltinByteString]>]>]>([
    conStr0([conStr0([builtinByteString(stakeCredential)])]),
  ]);
};
export const pubKeyAddress = (
  bytes: string,
  stakeCredential?: string
): PubKeyAddress =>
  conStr0([
    conStr0([builtinByteString(bytes)]),
    maybeStakingHash(stakeCredential || ''),
  ]);
export const scriptAddress = (
  bytes: string,
  stakeCredential?: string
): ScriptAddress =>
  conStr0([
    conStr1([builtinByteString(bytes)]),
    maybeStakingHash(stakeCredential || ''),
  ]);
export const assetClass = (policyId: string, assetName: string): AssetClass =>
  conStr0([currencySymbol(policyId), tokenName(assetName)]);

export const txOutRef = (txHash: string, index: number): TxOutRef =>
  conStr0([conStr0([builtinByteString(txHash)]), integer(index)]);
export const paymentPubKeyHash = (bytes: string): PaymentPubKeyHash =>
  builtinByteString(bytes);
export const pubKeyHash = (bytes: string): PubKeyHash =>
  builtinByteString(bytes);
export const posixTime = (int: number): POSIXTime => ({ int });
export const assocMap = <K, V>(itemsMap: [K, V][]): AssocMap<K, V> => ({
  map: itemsMap.map(([k, v]) => ({ k, v })),
});
export const dict = <K, V>(itemsMap: [K, V][]): AssocMap<K, V> => ({
  map: itemsMap.map(([k, v]) => ({ k, v })),
});
export const tuple = <K, V>(key: K, value: V): Tuple<K, V> =>
  conStr0([key, value]);
export const value = (assets: Asset[]): Value => {
  const valueMapToParse: [CurrencySymbol, AssocMap<TokenName, Integer>][] = [];
  const valueMap: { [key: string]: { [key: string]: number } } = {};

  assets.forEach((asset) => {
    const sanitizedName = asset.unit.replace('lovelace', '');
    const policy = sanitizedName.slice(0, 56) || '';
    const token = sanitizedName.slice(56) || '';

    if (!valueMap[policy]) {
      valueMap[policy] = {};
    }

    if (!valueMap[policy][token]) {
      valueMap[policy][token] = Number(asset.quantity);
    } else {
      valueMap[policy][token] += Number(asset.quantity);
    }
  });

  Object.keys(valueMap).forEach((policy) => {
    const policyByte = currencySymbol(policy);
    const tokens: [TokenName, Integer][] = Object.keys(valueMap[policy]).map(
      (name) => [tokenName(name), integer(valueMap[policy][name])]
    );

    const policyMap = assocMap(tokens);
    valueMapToParse.push([policyByte, policyMap]);
  });

  return assocMap(valueMapToParse);
};

export const parsePlutusValueToAssets = (plutusValue: Value): Asset[] => {
  const assets: Asset[] = [];

  plutusValue.map.forEach((policyMap) => {
    const policy = policyMap.k.bytes;
    policyMap.v.map.forEach((tokenMap) => {
      const token = tokenMap.k.bytes;
      const quantity = tokenMap.v.int.toString();
      const unsanitizedUnit = policy + token;
      const unit = unsanitizedUnit === '' ? 'lovelace' : unsanitizedUnit;
      assets.push({ unit, quantity });
    });
  });

  return assets;
};
