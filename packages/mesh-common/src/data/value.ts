/**
 * It is suggested to keep the value representation as map of map,
 * where first key as policy id, second key as asset name, and final value as quantity.
 */

import { Asset } from "../types";
import { BigNum } from "../utils";
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

/**
 * @typealias Value
 * @description
 * Represents the Cardano data Value in JSON format as a nested associative map structure.
 * Aiken alias, can be converted into Aiken's `Value` type with `from_asset_list` in standard library (https://aiken-lang.github.io/stdlib/cardano/assets.html#from_asset_list).
 *
 * @purpose
 * TODO
 *
 * @property {AssocMap<CurrencySymbol, AssocMap<TokenName, Integer>>}
 *   Maps a policyId (empty string for lovelace) to a map of token names and their quantities.
 *   - Each token name maps to an integer quantity.
 *   - Example: `assocMap([[currencySymbol(""), assocMap([[tokenName(""), integer(1000000)]])]])`
 *
 * @remarks
 * **Invariants / edge cases**
 * - Quantities must be non-negative integers.
 * - The policyId for lovelace is an empty string.
 * - Token names are empty string for lovelace.
 * - All entries must be valid Cardano asset units and quantities.
 *
 * @example
 * // Full example with realistic values
 * const v: Value = assocMap([
 *   [currencySymbol(""), assocMap([[tokenName(""), integer(1000000)]])], // lovelace
 *   [currencySymbol("5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a"), assocMap([[tokenName("7075707079"), integer(5)], [tokenName("6b697474656e"), integer(10)]])]
 * ]);
 *
 * @see MeshValue.Value
 */
export type Value = AssocMap<CurrencySymbol, AssocMap<TokenName, Integer>>;

/**
 * @typealias MValue
 * @description
 * Represents the Cardano data Value in Mesh Data type as a nested map structure.
 * Aiken alias, can be converted into Aiken's `Value` type with `from_asset_list` in standard library (https://aiken-lang.github.io/stdlib/cardano/assets.html#from_asset_list).
 *
 * @purpose
 * TODO
 *
 * @property {Map<string, Map<string, bigint>>}
 *   Maps a policyId (empty string for lovelace) to a map of token names and their quantities.
 *   - Each token name maps to a bigint quantity.
 *   - Example: `Map([["", Map([["", 1000000n]])], ["5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a", Map([["7075707079", 5n]])]])`
 *
 * @remarks
 * **Invariants / edge cases**
 * - Quantities must be non-negative bigints.
 * - The policyId for lovelace is an empty string.
 * - Token names are empty string for lovelace.
 * - All entries must be valid Cardano asset units and quantities.
 *
 * @example
 * const m: MValue = new Map([
 *   ["", new Map([["", 1000000n]])], // lovelace
 *   ["5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a", new Map([["7075707079", 5n], ["6b697474656e", 10n]])] // tokens
 * ]);
 *
 * @see MeshValue.MValue
 */
export type MValue = Map<string, Map<string, bigint>>;

/**
 * @function value
 * @description
 * Converts an array of Cardano Asset objects into a Cardano data Value in JSON representation.
 *
 * @purpose
 * TODO
 *
 * @param {Asset[]} assets
 * Array of asset objects to convert.
 *   - Each asset must have a `unit` (`policyId + tokenName` or `lovelace`) and a `quantity` (stringified integer).
 *   - Example value: `[ { unit: "lovelace", quantity: "1000000" }, { unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079", quantity: "5" } ]`
 *
 * @returns {Value}
 * Cardano data Value in JSON representation.
 *   - Shape: `AssocMap<CurrencySymbol, AssocMap<TokenName, Integer>>`
 *   - Each key is a policyId (empty string for lovelace), mapping to token names and their quantities.
 *   - Example: `assocMap([[currencySymbol(""), assocMap([[tokenName(""), integer(1000000)]])]])`
 *
 * @throws {Error}
 * If assets contain invalid units or quantities (not enforced here, but downstream logic may fail).
 *
 * @example
 * // Minimal usage
 * const assets = [
 *   { unit: "lovelace", quantity: "1000000" },
 *   { unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079", quantity: "5" }
 * ];
 * const jsonValue = value(assets);
 *
 * @see MeshValue
 * @see https://meshjs.dev/apis/data/value#convertor---converts-assets-into-cardano-data-value-in-json
 */
export const value = (assets: Asset[]) => {
  return MeshValue.fromAssets(assets).toJSON();
};

/**
 * @function mValue
 * @description
 * Converts an array of Cardano Asset objects into a Cardano data Value in Mesh Data type (MValue).
 *
 * @purpose
 * TODO
 *
 * @param {Asset[]} assets
 * Array of asset objects to convert.
 *   - Each asset must have a `unit` (`policyId + tokenName` or `lovelace`) and a `quantity` (stringified integer).
 *   - Example value: `[ { unit: "lovelace", quantity: "1000000" }, { unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079", quantity: "5" } ]`
 *
 * @returns {MValue}
 * Cardano data Value in Mesh Data type.
 *   - Shape: `Map<string, Map<string, bigint>>`
 *   - Each key is a policyId (empty string for lovelace), mapping to token names and their quantities.
 *   - Example: `Map([["", Map([["", 1000000n]])], ["5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a", Map([["7075707079", 5n]])]])`
 *
 * @throws {Error}
 * If assets contain invalid units or quantities (not enforced here, but downstream logic may fail).
 *
 * @example
 * // Minimal usage
 * const assets = [
 *   { unit: "lovelace", quantity: "1000000" },
 *   { unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079", quantity: "5" }
 * ];
 * const value = mValue(assets);
 *
 * @see MeshValue
 * @see https://meshjs.dev/apis/data/value#convertor---converts-assets-into-cardano-data-value-in-mesh-data-type
 */
export const mValue = (assets: Asset[]) => {
  return MeshValue.fromAssets(assets).toData();
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
   * @function fromAssets
   * @description
   * Converts an array of Cardano Asset objects into a MeshValue instance, aggregating quantities by asset unit.
   *
   * @purpose
   * Use this to initialize a MeshValue from a list of assets, such as those from transaction outputs.
   *
   * @param {Asset[]} assets
   * Array of asset objects to convert.
   *   - Each asset must have a `unit` (`policyId + tokenName` or `lovelace`) and a `quantity` (stringified integer).
   *   - Example value: `{ unit: "lovelace", quantity: "1000000" }`
   *
   * @returns {MeshValue}
   * MeshValue instance representing the aggregated assets.
   *   - Contains a value record: `{ [unit: string]: bigint }`
   *   - Example: `MeshValue { value: { lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n } }`
   *
   * @throws {Error}
   * If assets contain invalid units or quantities (not enforced here, but downstream logic may fail).
   *
   * @example
   * // Minimal usage
   * const mv = MeshValue.fromAssets([
   *   { unit: "lovelace", quantity: "1000000" },
   *   { unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079", quantity: "5" }
   * ]);
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#convertor---converts-assets-into-meshvalue-with-parameters---asset
   */
  static fromAssets = (assets: Asset[]): MeshValue => {
    const value = new MeshValue();
    value.addAssets(assets);
    return value;
  };

  /**
   * @function fromValue
   * @description
   * Converts a Cardano data Value (JSON representation) into a MeshValue instance by extracting assets and their quantities.
   * Handles conversion of policy IDs and token names, including special handling for lovelace.
   *
   * @purpose
   * Use this to transform Cardano data Value objects (e.g., from Plutus scripts) into MeshValue for further manipulation or conversion.
   *
   * @param {Value} plutusValue
   * The Cardano Value to convert.
   *   - Must be a valid JSON representation of Cardano data Value.
   *   - Example value: `assocMap([[currencySymbol(""), assocMap([[tokenName(""), integer(1000000)]])]])`
   *
   * @returns {MeshValue}
   * MeshValue instance representing the extracted assets.
   *   - Aggregates all assets found in the Value.
   *   - Example: `MeshValue { value: { lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n } }`
   *
   * @throws {Error}
   * If the Value structure is invalid or contains malformed asset data (not enforced here, but downstream logic may fail).
   *
   * @example
   * // Minimal usage 1
   * const mv = MeshValue.fromValue(plutusValue);
   * // Minimal usage 2
   * const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
   * const plutusValue: Value = value(val);
   * const assets: Asset[] = MeshValue.fromValue(plutusValue).toAssets();
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#convertor---converts-value-the-json-representation-of-cardano-data-value-into-meshvalue
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
   * @function addAsset
   * @description
   * Adds a single Cardano asset to the MeshValue, updating the quantity if the asset unit already exists.
   *
   * @purpose
   * Use this to incrementally build or update a MeshValue with new assets, such as when processing transaction outputs or aggregating balances.
   *
   * @param {Asset} asset
   * The asset to add.
   *   - Must have a `unit` (`policyId + tokenName` or `lovelace`) and a `quantity` (stringified integer).
   *   - Example value: `{ unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079", quantity: "10" }`
   *
   * @returns {this}
   * The updated MeshValue instance for chaining.
   *   - The internal value record will reflect the new or updated asset quantity.
   *   - Example: `meshValue.addAsset({ unit: "lovelace", quantity: "1000000" })`
   *
   * @throws {Error}
   * If the asset quantity is invalid. It should be a valid string that could be converted to a BigInt.
   *
   * @example
   * // Add a single asset
   * const value = new MeshValue();
   * const singleAsset: Asset = { unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079", quantity: "100" };
   * value.addAsset(singleAsset);
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#operator---add-an-asset-to-the-value-classs-value-record-with-parameters---asset
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
   * @function addAssets
   * @description
   * Adds an array of Cardano assets to the MeshValue, aggregating quantities and ensuring no duplicate asset units.
   * Each asset is processed and merged into the value record.
   *
   * @purpose
   * Use this to efficiently add multiple assets to a MeshValue, such as when processing batch transaction outputs or aggregating balances.
   *
   * @param {Asset[]} assets
   * Array of asset objects to add.
   *   - Each asset must have a `unit` (`policyId + tokenName` or `lovelace`) and a `quantity` (stringified integer).
   *   - Example value: `[ { unit: "lovelace", quantity: "1000000" }, { unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079", quantity: "5" } ]`
   *
   * @returns {this}
   * The updated MeshValue instance for chaining.
   *   - The internal value record will reflect the new or updated asset quantities.
   *   - Example: `MeshValue { value: { lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n } }`
   *
   * @throws {Error}
   * If any asset quantity is invalid (not enforced here, but downstream logic may fail).
   *
   * @example
   * // Add multiple assets
   * const value = new MeshValue();
   * const assets: Asset[] = [
   *   { unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079", quantity: "100" },
   *   { unit: "lovelace", quantity: "10" },
   * ];
   * value.addAssets(assets);
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#operator---add-an-array-of-assets-to-the-value-classs-value-record-with-parameters---assets
   */
  addAssets = (assets: Asset[]): this => {
    assets.forEach((asset) => {
      this.addAsset(asset);
    });
    return this;
  };

  /**
   * @function negateAsset
   * @description
   * Subtracts a single Cardano asset from the MeshValue, reducing the quantity or removing the asset if the quantity reaches zero.
   *
   * @purpose
   * Use this to decrement or remove an asset from a MeshValue, such as when processing transaction inputs or burning tokens.
   *
   * @param {Asset} asset
   * The asset to subtract.
   *   - Must have a `unit` (`policyId + tokenName` or `lovelace`) and a `quantity` (stringified integer).
   *   - Example value: `{ unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079", quantity: "10" }`
   *
   * @returns {this}
   * The updated MeshValue instance for chaining.
   *   - The internal value record will reflect the reduced or removed asset quantity.
   *   - Example: `MeshValue { value: { lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n } }`
   *
   * @throws {Error}
   * If the asset quantity is invalid or subtraction results in a negative value (not enforced here, but downstream logic may fail).
   *
   * @example
   * // Subtract a single asset
   * const value = new MeshValue();
   * value.value = { lovelace: 10n };
   * value.negateAsset({ unit: "lovelace", quantity: "5" });
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#operator---substract-an-asset-from-the-value-classs-value-record-with-parameters---asset
   */
  negateAsset = (asset: Asset): this => {
    const { unit, quantity: assetQty } = asset;
    const quantity = BigNum.new(this.value[unit]);
    quantity.clampedSub(BigNum.new(assetQty));

    if (quantity.value === BigInt(0)) {
      delete this.value[unit];
    } else {
      this.value[unit] = quantity.value;
    }
    return this;
  };

  /**
   * @function negateAssets
   * @description
   * Subtracts an array of Cardano assets from the MeshValue, reducing quantities or removing assets if their quantities reach zero.
   * Each asset is processed and merged into the value record by subtraction.
   *
   * @purpose
   * Use this to efficiently subtract multiple assets from a MeshValue, such as when processing batch transaction inputs or burning tokens.
   *
   * @param {Asset[]} assets
   * Array of asset objects to subtract.
   *   - Each asset must have a `unit` (`policyId + tokenName` or `lovelace`) and a `quantity` (stringified integer).
   *   - Example value: `[ { unit: "lovelace", quantity: "1000000" }, { unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079", quantity: "5" } ]`
   *
   * @returns {this}
   * The updated MeshValue instance for chaining.
   *   - Example: `MeshValue { value: { lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n } }`
   *
   * @throws {Error}
   * If any asset quantity is invalid or subtraction results in a negative value (not enforced here, but downstream logic may fail).
   *
   * @example
   * // Subtract multiple assets
   * const value = new MeshValue();
   * value.value = { lovelace: 20n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 10n };
   * value.negateAssets([
   *   { unit: "lovelace", quantity: "5" },
   *   { unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079", quantity: "3" },
   * ]);
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#operator---substract-an-array-of-assets-from-the-value-classs-value-record-with-parameters---assets
   */
  negateAssets = (assets: Asset[]): this => {
    assets.forEach((asset) => {
      this.negateAsset(asset);
    });
    return this;
  };

  /**
   * @function get
   * @description
   * Retrieves the quantity of a specific asset from the MeshValue by its unit (`policyId + tokenName` or `lovelace`).
   *
   * @purpose
   * Use this to query the current quantity of a particular asset in the MeshValue, such as for balance checks or conditional logic.
   *
   * @param {string} unit
   * The asset unit to retrieve (`policyId + tokenName` or `lovelace`).
   *   - Example value: `"lovelace"` or `"5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079"`
   *
   * @returns {bigint | undefined}
   * The quantity of the asset as a bigint, or undefined if not present.
   *   - Shape: `bigint | undefined`
   *   - Example: `1000000n` or `undefined`
   *
   * @throws {Error}
   * None (safe query; returns undefined if not found).
   *
   * @example
   * // Get the quantity of lovelace
   * const value = new MeshValue({ lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n });
   * const lovelaceAmount = value.get("lovelace"); // 1000000n
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#accessor---get-the-quantity-of-asset-object-per-lovelace-unit
   */
  get = (unit: string): bigint => {
    return this.value[unit] ? BigInt(this.value[unit]) : BigInt(0);
  };

  /**
   * @function getPolicyAssets
   * @description
   * Retrieves all assets and their quantities for a given policyId from the MeshValue.
   *
   * @purpose
   * Use this to filter assets by policy.
   *
   * @param {string} policyId
   * The policyId to retrieve assets for.
   *   - Example value: `"5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a"`
   *
   * @returns {{ [assetName: string]: bigint }}
   * An object mapping asset names to quantities.
   *   - Shape: `{ [assetName: string]: bigint }`
   *   - Example: `{ "7075707079": 100n, "6b697474656e": 50n }`
   *
   * @throws {Error}
   * None (safe query; returns empty object if not found).
   *
   * @example
   * // Get all assets for a policyId
   * const value = new MeshValue({ "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 100n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a6b697474656e": 50n });
   * const assets = value.getPolicyAssets("5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a"); // { "7075707079": 100n, "6b697474656e": 50n }
   *
   * @see MeshValue
   */
  getPolicyAssets = (policyId: string): Asset[] => {
    const assets: Asset[] = [];

    Object.entries(this.value).forEach(([unit, quantity]) => {
      if (unit.startsWith(policyId)) {
        assets.push({
          unit,
          quantity: quantity.toString(),
        });
      }
    });

    return assets;
  };

  /**
   * @function units
   * @description
   * Returns an array of all asset units present in the MeshValue, including lovelace and all policyId.
   *
   * @purpose
   * TODO
   *
   * @returns {string[]}
   * Array of asset unit strings.
   *   - Shape: `string[]`
   *   - Example: `[ "lovelace", "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079", "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a6b697474656e" ]`
   *
   * @throws {Error}
   * None (safe query; returns empty array if no assets).
   *
   * @example
   * // Get all units in the value
   * const value = new MeshValue({ lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 100n });
   * const allUnits = value.units(); // [ "lovelace", "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079" ]
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#accessor---get-all-asset-units-with-no-parameters-needed
   */
  units = (): string[] => {
    return Object.keys(this.value);
  };

  /**
   * @function geq
   * @description
   * Checks if the MeshValue contains quantities greater than or equal to those in another MeshValue for all asset units.
   *
   * @purpose
   * Use this to validate sufficient balances for transactions, withdrawals, or conditional logic.
   *
   * @param {MeshValue} other
   * The MeshValue to compare against.
   *   - Example value: `MeshValue { value: { lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 2n } }`
   *
   * @returns {boolean}
   * True if this MeshValue has all asset quantities greater than or equal to the other; false otherwise.
   *   - Shape: `boolean`
   *   - Example: `true`
   *
   * @throws {Error}
   * None (safe comparison).
   *
   * @example
   * // Check if value has enough assets
   * const value = new MeshValue({ lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n });
   * const required = new MeshValue({ lovelace: 500000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 2n });
   * const isEnough = value.geq(required); // true
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#comparator---check-if-the-value-is-greater-than-or-equal-to-another-value-with-parameters---other
   */
  geq = (other: MeshValue): boolean => {
    return Object.keys(other.value).every((key) => this.geqUnit(key, other));
  };

  /**
   * @function geqUnit
   * @description
   * Checks if the quantity of a specific asset unit in the MeshValue is greater than or equal to a given amount.
   *
   * @purpose
   * Use this to validate if a particular asset unit meets a minimum required quantity, such as for transaction checks or conditional logic.
   *
   * @param {string} unit
   * The asset unit to check (`lovelace` or `policyId + tokenName`).
   *   - Example value: `"lovelace"` or `"5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079"`
   *
   * @param {MeshValue} other
   * The MeshValue to compare against.
   *   - Example value: `MeshValue { value: { lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n } }`
   *
   * @returns {boolean}
   * True if the asset quantity is greater than or equal to the amount; false otherwise.
   *   - Shape: `boolean`
   *   - Example: `true`
   *
   * @throws {Error}
   * None (safe comparison).
   *
   * @example
   * // Check if lovelace is enough
   * const value = new MeshValue({ lovelace: 1000000n });
   * const isEnough = value.geqUnit("lovelace", 500000n); // true
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#comparator---check-if-the-value-is-greater-than-or-equal-to-another-value-with-parameters---unit-other
   */
  geqUnit = (unit: string, other: MeshValue): boolean => {
    if (this.value[unit] === undefined || other.value[unit] === undefined) {
      return false;
    }
    return BigInt(this.value[unit]) >= BigInt(other.value[unit]);
  };

  /**
   * @function leq
   * @description
   * Checks if the MeshValue contains quantities less than or equal to those in another MeshValue for all asset units.
   *
   * @purpose
   * Use this to validate if a MeshValue does not exceed another value, such as for limits, quotas, or conditional logic.
   *
   * @param {MeshValue} other
   * The MeshValue to compare against.
   *   - Example value: `MeshValue { value: { lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n } }`
   *
   * @returns {boolean}
   * True if this MeshValue has all asset quantities less than or equal to the other; false otherwise.
   *   - Shape: `boolean`
   *   - Example: `true`
   *
   * @throws {Error}
   * None (safe comparison).
   *
   * @example
   * // Check if value does not exceed another
   * const value = new MeshValue({ lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n });
   * const limit = new MeshValue({ lovelace: 2000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 10n });
   * const isWithinLimit = value.leq(limit); // true
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#comparator---check-if-the-value-is-less-than-or-equal-to-another-value-with-parameters---other
   */
  leq = (other: MeshValue): boolean => {
    return Object.keys(this.value).every((key) => this.leqUnit(key, other));
  };

  /**
   * @function leqUnit
   * @description
   * Checks if the quantity of a specific asset unit in the MeshValue is less than or equal to the quantity in another MeshValue.
   *
   * @purpose
   * Use this to validate if a particular asset unit does not exceed the quantity in another MeshValue, such as for limits, quotas, or conditional logic.
   *
   * @param {string} unit
   * The asset unit to check (`lovelace` or `policyId + tokenName`).
   *   - Example value: `"lovelace"` or `"5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079"`
   *
   * @param {MeshValue} other
   * The MeshValue to compare against.
   *   - Example value: `MeshValue { value: { lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n } }`
   *
   * @returns {boolean}
   * True if the asset quantity in this value is less than or equal to the quantity in the other MeshValue; false otherwise.
   *   - Shape: `boolean`
   *   - Example: `true`
   *
   * @throws {Error}
   * None (safe comparison).
   *
   * @example
   * // Check if lovelace does not exceed another MeshValue
   * const value = new MeshValue({ lovelace: 1000000n });
   * const limit = new MeshValue({ lovelace: 2000000n });
   * const isWithinLimit = value.leqUnit("lovelace", limit); // true
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#comparator---check-if-the-specific-unit-of-value-is-less-than-or-equal-to-that-unit-of-another-value-with-parameters---unit-other
   */
  leqUnit = (unit: string, other: MeshValue): boolean => {
    if (this.value[unit] === undefined || other.value[unit] === undefined) {
      return false;
    }
    return BigInt(this.value[unit]) <= BigInt(other.value[unit]);
  };

  /**
   * @function eq
   * @description
   * Checks if the MeshValue contains exactly the same asset units and quantities as another MeshValue.
   *
   * @purpose
   * Use this to validate strict equality between two MeshValue instances, such as for transaction matching, state comparison, or testing.
   *
   * @param {MeshValue} other
   * The MeshValue to compare against.
   *   - Example value: `MeshValue { value: { lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n } }`
   *
   * @returns {boolean}
   * True if both MeshValues have the same units and quantities; false otherwise.
   *   - Shape: `boolean`
   *   - Example: `true`
   *
   * @throws {Error}
   * None (safe comparison).
   *
   * @example
   * // Check if two MeshValues are equal
   * const valueA = new MeshValue({ lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n });
   * const valueB = new MeshValue({ lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n });
   * const isEqual = valueA.eq(valueB); // true
   *
   * @see MeshValue
   */
  eq = (other: MeshValue): boolean => {
    return Object.keys(this.value).every((key) => this.eqUnit(key, other));
  };

  /**
   * @function eqUnit
   * @description
   * Checks if the quantity of a specific asset unit in the MeshValue is exactly equal to the quantity in another MeshValue.
   *
   * @purpose
   * Use this to validate strict equality for a particular asset unit between two MeshValue instances, such as for transaction matching or conditional logic.
   *
   * @param {string} unit
   * The asset unit to check (`lovelace` or `policyId + tokenName`).
   *   - Example value: `"lovelace"` or `"5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079"`
   *
   * @param {MeshValue} other
   * The MeshValue to compare against.
   *   - Example value: `MeshValue { value: { lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n } }`
   *
   * @returns {boolean}
   * True if both MeshValues have the same quantity for the given unit; false otherwise.
   *   - Shape: `boolean`
   *   - Example: `true`
   *
   * @throws {Error}
   * None (safe comparison).
   *
   * @example
   * // Check if lovelace quantity is equal in two MeshValues
   * const valueA = new MeshValue({ lovelace: 1000000n });
   * const valueB = new MeshValue({ lovelace: 1000000n });
   * const isEqual = valueA.eqUnit("lovelace", valueB); // true
   *
   * @see MeshValue
   */
  eqUnit = (unit: string, other: MeshValue): boolean => {
    if (this.value[unit] === undefined || other.value[unit] === undefined) {
      return false;
    }
    return BigInt(this.value[unit]) === BigInt(other.value[unit]);
  };

  /**
   * @function isEmpty
   * @description
   * Checks if the MeshValue contains no assets or all asset quantities are zero.
   *
   * @purpose
   * Use this to validate if a MeshValue represents an empty or zero balance, such as for transaction checks, filtering, or initialization.
   *
   * @returns {boolean}
   * True if the MeshValue is empty or all quantities are zero; false otherwise.
   *   - Shape: `boolean`
   *   - Example: `true`
   *
   * @throws {Error}
   * None (safe check).
   *
   * @example
   * // Check if a MeshValue is empty
   * const value = new MeshValue();
   * const isEmpty = value.isEmpty(); // true
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#comparator---check-if-the-value-is-empty
   */
  isEmpty = (): boolean => {
    return Object.keys(this.value).length === 0;
  };

  /**
   * @function merge
   * @description
   * Merges another MeshValue into this MeshValue, combining asset quantities for all units (`lovelace` and `policyId + tokenName`).
   *
   * @purpose
   * Use this to aggregate balances, combine transaction outputs, or accumulate assets from multiple sources.
   *
   * @param {MeshValue | MeshValue[]} values
   * The MeshValue to merge into this one. Could be a single instance or an array of instances.
   *   - Example value: `MeshValue { value: { lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 1n } }`
   *
   * @returns {this}
   * The updated MeshValue instance with merged quantities.
   *   - Example: `MeshValue { value: { lovelace: 1500000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 7n } }`
   *
   * @throws {Error}
   * None (safe merge).
   *
   * @example
   * // Merge two MeshValues
   * const valueA = new MeshValue({ lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n });
   * const valueB = new MeshValue({ lovelace: 500000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 2n });
   * valueA.merge(valueB); // valueA now has { lovelace: 1500000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 7n }
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#operator---merge-the-given-values-with-parameters---values
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

  /**
   * @function toAssets
   * @description
   * Converts the MeshValue into an array of asset objects, each with a unit (`lovelace` and `policyId + tokenName`) and quantity as a string.
   *
   * @purpose
   * Use this to transform a MeshValue into a standard asset array for serialization, transaction building, or API responses.
   *
   * @returns {Asset[]}
   * Array of asset objects representing the MeshValue.
   *   - Example: `[ { unit: "lovelace", quantity: "1000000" }, { unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079", quantity: "5" } ]`
   *
   * @throws {Error}
   * None (safe conversion).
   *
   * @example
   * // Convert MeshValue to asset array
   * const value = new MeshValue({ lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n });
   * const assets = value.toAssets(); // [ { unit: "lovelace", quantity: "1000000" }, { unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079", quantity: "5" } ]
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#convertor---converts-the-meshvalue-object-into-an-array-of-asset
   */
  toAssets = (): Asset[] => {
    const assets: Asset[] = [];
    Object.entries(this.value).forEach(([unit, quantity]) => {
      assets.push({ unit, quantity: quantity.toString() });
    });
    return assets;
  };

  /**
   * @function toData
   * @description
   * Converts the MeshValue into a Cardano data Value (JSON representation), suitable for use in Plutus scripts or on-chain data.
   *
   * @purpose
   * Use this to serialize a MeshValue for smart contract interactions, chain data, or interoperability with Cardano tooling.
   *
   * @returns {MValue}
   * Cardano data Value representing the MeshValue.
   *   - Example: `Map([[currencySymbol(""), Map([[tokenName(""), integer(1000000)]])]])`
   *
   * @throws {Error}
   * None (safe conversion).
   *
   * @example
   * // Convert MeshValue to Cardano data Value
   * const val: Asset[] = [
   *   {
   *     unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079",
   *     quantity: "100",
   *   },
   *   {
   *     unit: "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a6b697474656e",
   *     quantity: "200",
   *   },
   * ];
   * const plutusValue: Value = value(val);
   * const data = MeshValue.fromValue(plutusValue).toData();
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#convertor---converts-the-meshvalue-object-into-cardano-data-value-in-mesh-data-type
   */
  toData = (): MValue => {
    const valueMap: MValue = new Map();
    this.toAssets().forEach((asset) => {
      const sanitizedName = asset.unit.replace("lovelace", "");
      const policy = sanitizedName.slice(0, 56) || "";
      const token = sanitizedName.slice(56) || "";

      if (!valueMap.has(policy)) {
        valueMap.set(policy, new Map());
      }

      const tokenMap = valueMap.get(policy)!;
      const quantity = tokenMap?.get(token);
      if (!quantity) {
        tokenMap.set(token, BigInt(asset.quantity));
      } else {
        tokenMap.set(token, quantity + BigInt(asset.quantity));
      }
    });

    return valueMap;
  };

  /**
   * @function toJSON
   * @description
   * Converts the MeshValue into a plain JSON object, mapping each asset unit (`lovelace` or `policyId + tokenName`) to its quantity as a string.
   *
   * @purpose
   * TODO
   *
   * @returns {Value}
   * JSON object representing the MeshValue.
   *   - Example: `{ "lovelace": "1000000", "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": "5" }`
   *
   * @throws {Error}
   * None (safe conversion).
   *
   * @example
   * // Convert MeshValue to JSON
   * const value = new MeshValue({ lovelace: 1000000n, "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": 5n });
   * const json = value.toJSON(); // { "lovelace": "1000000", "5ac3d4bdca238105a040a565e5d7e734b7c9e1630aec7650e809e34a7075707079": "5" }
   *
   * @see MeshValue
   * @see https://meshjs.dev/apis/data/value#convertor---converts-the-meshvalue-object-into-a-json-representation-of-cardano-data-value
   */
  toJSON = (): Value => {
    const valueMapToParse: [CurrencySymbol, AssocMap<TokenName, Integer>][] =
      [];
    const valueMap: { [key: string]: { [key: string]: number } } = {};

    this.toAssets().forEach((asset) => {
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
