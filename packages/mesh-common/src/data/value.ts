/**
 * It is suggested to keep the value representation as map of map,
 * where first key as policy id, second key as asset name, and final value as quantity.
 */

import { Asset } from "../types";
import {
  assocMap,
  AssocMap,
  CurrencySymbol,
  currencySymbol,
  Integer,
  integer,
  TokenName,
  tokenName,
} from "./json";

export type Value = AssocMap<CurrencySymbol, AssocMap<TokenName, Integer>>;

export type MValue = Map<string, Map<string, bigint>>;

export const value = (assets: Asset[]): Value => {
  const valueMapToParse: [CurrencySymbol, AssocMap<TokenName, Integer>][] = [];
  const valueMap: { [key: string]: { [key: string]: number } } = {};

  assets.forEach((asset) => {
    const sanitizedName = asset.unit.replace("lovelace", "");
    const policy = sanitizedName.slice(0, 56) || "";
    const token = sanitizedName.slice(56) || "";

    if (!valueMap[policy]) {
      valueMap[policy] = {};
    }

    if (!valueMap[policy]![token]) {
      valueMap[policy]![token] = Number(asset.quantity);
    } else {
      valueMap[policy]![token] += Number(asset.quantity);
    }
  });

  Object.keys(valueMap).forEach((policy) => {
    const policyByte = currencySymbol(policy);
    const tokens: [TokenName, Integer][] = Object.keys(valueMap[policy]!).map(
      (name) => [tokenName(name), integer(valueMap[policy]![name]!)],
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
      const unit = unsanitizedUnit === "" ? "lovelace" : unsanitizedUnit;
      assets.push({ unit, quantity });
    });
  });

  return assets;
};
