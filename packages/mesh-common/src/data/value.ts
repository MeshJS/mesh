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
}

export class MeshValue {
  value: Record<string, bigint>;

  constructor(value: Record<string, bigint> = {}) {
    this.value = value;
}

  /**
   * 
   * @param assets 
   * @returns 
   */
  static fromAssets = (assets: Asset[]): MeshValue => {
      const value = new MeshValue();
      value.addAssets(assets);
      return value;
  };

  /**
   * 
   * @param plutusValue 
   * @returns 
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
   * Add an asset to the Value class's value record. If an asset with the same unit already exists in the value record, the quantity of the
   * existing asset will be increased by the quantity of the new asset. If no such asset exists, the new asset will be added to the value record.
   * @param asset
   * @returns this
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
   * Add an array of assets to the Value class's value record. If an asset with the same unit already exists in the value record, the quantity of the
   * existing asset will be increased by the quantity of the new asset. If no such asset exists, the new assets under the array of assets will be added to the value record.
   * @param assets
   * @returns this
   */
  addAssets = (assets: Asset[]): this => {
    assets.forEach((asset) => {
      this.addAsset(asset);
    });
    return this;
  };

  /**
   * Substract an asset from the Value class's value record. If an asset with the same unit already exists in the value record, the quantity of the
   * existing asset will be decreased by the quantity of the new asset. If no such asset exists, an error message should be printed.
   * @param asset
   * @returns this
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
   * Subtract an array of assets from the Value class's value record. If an asset with the same unit already exists in the value record, the quantity of the
   * existing asset will be decreased by the quantity of the new asset. If no such asset exists, an error message should be printed.
   * @param assets
   * @returns this
   */
  negateAssets = (assets: Asset[]): this => {
    assets.forEach((asset) => {
      this.negateAsset(asset);
    });
    return this;
  };

  /**
   * Get the quantity of asset object per unit
   * @param unit
   * @returns
   */
  get = (unit: string): bigint => {
    return this.value[unit] ? BigInt(this.value[unit]) : BigInt(0);
  };

  /**
   * Get all assets (return Record of Asset[])
   * @param
   * @returns Record<string, Asset[]>
   */
  units = (): Record<string, { unit: string; quantity: bigint }[]> => {
    const result: Record<string, { unit: string; quantity: bigint }[]> = {};
    Object.keys(this.value).forEach((unit) => {
      if (!result[unit]) {
        result[unit] = [];
      }
      result[unit].push({ unit, quantity: BigInt(this.value[unit]!) });
    });
    return result;
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
  }

  toData = () => {}

  toJSON = () => {
    const assets = this.toAssets()
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
}