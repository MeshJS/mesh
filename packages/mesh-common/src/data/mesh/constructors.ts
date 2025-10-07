import { Data } from "../../types";

/**
 * @typealias MConStr
 * @description
 * Represents a Mesh Data constructor object for custom data types.
 *
 * @purpose
 * Used to encode Cardano Plutus data constructors with an index and associated fields.
 *
 * @property {N} alternative
 *   The constructor index number (e.g., 0, 1, 2, 3).
 * @property {T} fields
 *   The fields or data associated with the constructor.
 *   - Example: `{ alternative: 0, fields: [data1, data2] }`
 */
export type MConStr<N = 0, T = any> = { alternative: N; fields: T };

/**
 * @typealias MConStr0
 * @description
 * Represents a Mesh Data index 0 constructor object for custom data types.
 *
 * @purpose
 * Used for Cardano Plutus data encoding with constructor index 0.
 *
 * @property {0} alternative
 *   The constructor index number (always 0).
 * @property {T} fields
 *   The fields or data associated with the constructor.
 *   - Example: `{ alternative: 0, fields: [data1, data2] }`
 */
export type MConStr0<T = any> = MConStr<0, T>;

/**
 * @typealias MConStr1
 * @description
 * Represents a Mesh Data index 1 constructor object for custom data types.
 *
 * @purpose
 * Used for Cardano Plutus data encoding with constructor index 1.
 *
 * @property {1} alternative
 *   The constructor index number (always 1).
 * @property {T} fields
 *   The fields or data associated with the constructor.
 *   - Example: `{ alternative: 1, fields: [data1, data2] }`
 */
export type MConStr1<T = any> = MConStr<1, T>;

/**
 * @typealias MConStr2
 * @description
 * Represents a Mesh Data index 2 constructor object for custom data types.
 *
 * @purpose
 * Used for Cardano Plutus data encoding with constructor index 2.
 *
 * @property {2} alternative
 *   The constructor index number (always 2).
 * @property {T} fields
 *   The fields or data associated with the constructor.
 *   - Example: `{ alternative: 2, fields: [data1, data2] }`
 */
export type MConStr2<T = any> = MConStr<2, T>;

/**
 * @typealias MConStr3
 * @description
 * Represents a Mesh Data index 3 constructor object for custom data types.
 * Used for Cardano Plutus data encoding with constructor index 3.
 *
 * @purpose
 * Enables developers to define index 3 constructor objects for Cardano smart contract data serialization.
 *
 * @property {3} alternative
 *   The constructor index number (always 3).
 * @property {T} fields
 *   The fields or data associated with the constructor.
 *   - Example: `{ alternative: 3, fields: [data1, data2] }`
 */
export type MConStr3<T = any> = MConStr<3, T>;

/**
 * @function mConStr
 * @description
 * Creates a Mesh Data constructor object for custom data types with a specified constructor index and fields.
 *
 * @purpose
 * TODO
 *
 * @param {number} alternative
 * The constructor index number.
 *   - Must be a non-negative integer.
 *   - Example value: `2`
 *
 * @param {Data[]} fields
 * The items in the array to be included as fields.
 *   - Must be an array of Data objects.
 *   - Example value: `[data1, data2]`
 *
 * @returns {MConStr<number, Data[]>}
 * Mesh Data constructor object with the specified index and provided fields.
 *   - Example: `{ alternative: 2, fields: [data1, data2] }`
 */
export const mConStr = <N extends number, T extends Data[]>(
  alternative: N,
  fields: T,
): MConStr<N, T> => ({
  alternative,
  fields,
});

/**
 * @function mConStr0
 * @description
 * Creates a Mesh Data index 0 constructor object for custom data types.
 *
 * @purpose
 * TODO
 *
 * @param {Data[]} fields
 * The items in the array to be included as fields.
 *   - Must be an array of Data objects.
 *   - Example value: `[data1, data2]`
 *
 * @returns {MConStr0<Data[]>}
 * Mesh Data constructor object with index 0 and provided fields.
 *   - Example: `{ alternative: 0, fields: [data1, data2] }`
 */
export const mConStr0 = <T extends Data[]>(fields: T): MConStr0<T> => ({
  alternative: 0,
  fields,
});

/**
 * @function mConStr1
 * @description
 * Creates a Mesh Data index 1 constructor object for custom data types.
 *
 * @purpose
 * TODO
 *
 * @param {Data[]} fields
 * The items in the array to be included as fields.
 *   - Must be an array of Data objects.
 *   - Example value: `[data1, data2]`
 *
 * @returns {MConStr1<Data[]>}
 * Mesh Data constructor object with index 1 and provided fields.
 *   - Example: `{ alternative: 1, fields: [data1, data2] }`
 */
export const mConStr1 = <T extends Data[]>(fields: T): MConStr1<T> => ({
  alternative: 1,
  fields,
});

/**
 * @function mConStr2
 * @description
 * Creates a Mesh Data index 2 constructor object for custom data types.
 *
 * @purpose
 * TODO
 *
 * @param {Data[]} fields
 * The items in the array to be included as fields.
 *   - Must be an array of Data objects.
 *   - Example value: `[data1, data2]`
 *
 * @returns {MConStr2<Data[]>}
 * Mesh Data constructor object with index 2 and provided fields.
 *   - Example: `{ alternative: 2, fields: [data1, data2] }`
 */
export const mConStr2 = <T extends Data[]>(fields: T): MConStr2<T> => ({
  alternative: 2,
  fields,
});

/**
 * @function mConStr3
 * @description
 * Creates a Mesh Data index 3 constructor object for custom data types.
 *
 * @purpose
 * TODO
 *
 * @param {Data[]} fields
 * The items in the array to be included as fields.
 *   - Must be an array of Data objects.
 *   - Example value: `[data1, data2]`
 *
 * @returns {MConStr3<Data[]>}
 * Mesh Data constructor object with index 3 and provided fields.
 *   - Example: `{ alternative: 3, fields: [data1, data2] }`
 */
export const mConStr3 = <T extends Data[]>(fields: T): MConStr3<T> => ({
  alternative: 3,
  fields,
});
