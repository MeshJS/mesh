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

export const value = (assets: Asset[]) => {
  return MeshValue.fromAssets(assets).toJSON();
};

/**
 * MeshValue provide utility to handle the Cardano value manipulation. It offers certain axioms:
 * 1. No duplication of asset - adding assets with same asset name will increase the quantity of the asset in the same record.
 * 2. No zero and negative entry - the quantity of the asset should not be zero or negative.
 * 3. Sanitization of lovelace asset name - the class handle back and forth conversion of lovelace asset name to empty string.
 * 4. Easy convertion to Cardano data - offer utility to convert into either Mesh Data type and JSON type for its Cardano data representation.
 */
export class MeshValue {
  value: Record<string, bigint>;

  constructor(value: Record<string, bigint> = {}) {
    this.value = value;
  }

  /**
   * Converting assets into MeshValue
   * @param assets The assets to convert
   * @returns MeshValue
   */
  static fromAssets = (assets: Asset[]): MeshValue => {
    const value = new MeshValue();
    value.addAssets(assets);
    return value;
  };

  /**
   * Converting Value (the JSON representation of Cardano data Value) into MeshValue
   * @param plutusValue The Value to convert
   * @returns MeshValue
   */
  static fromValue = (plutusValue: Value): MeshValue => {
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

    return MeshValue.fromAssets(assets);
  };

  /**
   * Add an asset to the Value class's value record.
   * @param asset The asset to add
   * @returns The updated MeshValue object
   */
  addAsset = (asset: Asset): this => {
    const quantity = BigInt(asset.quantity);
    const { unit } = asset;

    if (this.value[unit]) {
      this.value[unit] += quantity;
    } else {
      this.value[unit] = quantity;
    }
    return this;
  };

  /**
   * Add an array of assets to the Value class's value record.
   * @param assets The assets to add
   * @returns The updated MeshValue object
   */
  addAssets = (assets: Asset[]): this => {
    assets.forEach((asset) => {
      this.addAsset(asset);
    });
    return this;
  };

  /**
   * Substract an asset from the Value class's value record.
   * @param asset The asset to subtract
   * @returns The updated MeshValue object
   */
  negateAsset = (asset: Asset): this => {
    const { unit, quantity } = asset;

    const currentQuantity = this.value[unit] || BigInt(0);
    const newQuantity = currentQuantity - BigInt(quantity);

    if (newQuantity === BigInt(0)) {
      delete this.value[unit];
    } else {
      this.value[unit] = newQuantity;
    }
    return this;
  };

  /**
   * Subtract an array of assets from the Value class's value record.
   * @param assets The assets to subtract
   * @returns The updated MeshValue object
   */
  negateAssets = (assets: Asset[]): this => {
    assets.forEach((asset) => {
      this.negateAsset(asset);
    });
    return this;
  };

  /**
   * Get the quantity of asset object per unit
   * @param unit The unit to get the quantity of (e.g., "ADA")
   * @returns The quantity of the asset
   */
  get = (unit: string): bigint => {
    return this.value[unit] ? BigInt(this.value[unit]) : BigInt(0);
  };

  /**
   * Get all asset units
   * @returns The asset units
   */
  units = (): string[] => {
    return Object.keys(this.value);
  };

  /**
   * Check if the value is greater than or equal to an inputted value
   * @param unit - The unit to compare (e.g., "ADA")
   * @param other - The value to compare against
   * @returns boolean
   */
  // geq = (unit: string, other: Value): boolean => {
  //     const thisValue = this.get(unit);
  //     const otherValue = other.get(unit);
  //     return thisValue >= otherValue;
  // };

  geq = (unit: string, other: MeshValue): boolean => {
    if (this.value[unit] === undefined || other.value[unit] === undefined) {
      return false;
    }
    return BigInt(this.value[unit]) >= BigInt(other.value[unit]);
  };

  /**
   * Check if the value is less than or equal to an inputted value
   * @param unit - The unit to compare (e.g., "ADA")
   * @param other - The value to compare against
   * @returns boolean
   */
  // leq = (unit: string, other: Value): boolean => {
  //     const thisValue = this.get(unit);
  //     const otherValue = other.get(unit);
  //     if (otherValue === undefined) {
  //         return false;
  //     }

  //     return thisValue <= otherValue;
  // };

  leq = (unit: string, other: MeshValue): boolean => {
    if (this.value[unit] === undefined || other.value[unit] === undefined) {
      return false;
    }
    return BigInt(this.value[unit]) <= BigInt(other.value[unit]);
  };

  /**
   * Check if the value is empty
   * @param
   * @returns boolean
   */
  isEmpty = (): boolean => {
    return Object.keys(this.value).length === 0;
  };

  /**
   * Merge the given values
   * @param values
   * @returns this
   */
  merge = (values: MeshValue | MeshValue[]): this => {
    const valuesArray = Array.isArray(values) ? values : [values];

    valuesArray.forEach((other) => {
      Object.entries(other.value).forEach(([key, value]) => {
        this.value[key] =
          (this.value[key] !== undefined
            ? BigInt(this.value[key])
            : BigInt(0)) + BigInt(value);
      });
    });

    return this;
  };

  toAssets = (): Asset[] => {
    const assets: Asset[] = [];
    Object.entries(this.value).forEach(([unit, quantity]) => {
      assets.push({ unit, quantity: quantity.toString() });
    });
    return assets;
  };

  toData = () => {};

  toJSON = () => {
    const assets = this.toAssets();
    const valueMapToParse: [CurrencySymbol, AssocMap<TokenName, Integer>][] =
      [];
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
}
