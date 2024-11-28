import { Data } from "../../types";

/**
 * The Mesh Data constructor object, representing custom data type
 */
export type MConStr<N = 0, T = any> = { alternative: N; fields: T };

/**
 * The Mesh Data index 0 constructor object, representing custom data type
 */
export type MConStr0<T = any> = MConStr<0, T>;

/**
 * The Mesh Data index 1 constructor object, representing custom data type
 */
export type MConStr1<T = any> = MConStr<1, T>;

/**
 * The Mesh Data index 2 constructor object, representing custom data type
 */
export type MConStr2<T = any> = MConStr<2, T>;

/**
 * The Mesh Data index 3 constructor object, representing custom data type
 */
export type MConStr3<T = any> = MConStr<3, T>;

/**
 * The utility function to create a Mesh Data constructor object, representing custom data type
 * @param alternative The constructor index number
 * @param fields The items in array
 * @returns The Mesh Data constructor object
 */
export const mConStr = <N extends number, T extends Data[]>(
  alternative: N,
  fields: T,
): MConStr<N, T> => ({
  alternative,
  fields,
});

/**
 * The utility function to create a Mesh Data index 0 constructor object, representing custom data type
 * @param fields The items in array
 * @returns The Mesh Data constructor object
 */
export const mConStr0 = <T extends Data[]>(fields: T): MConStr0<T> => ({
  alternative: 0,
  fields,
});

/**
 * The utility function to create a Mesh Data index 1 constructor object, representing custom data type
 * @param fields The items in array
 * @returns The Mesh Data constructor object
 */
export const mConStr1 = <T extends Data[]>(fields: T): MConStr1<T> => ({
  alternative: 1,
  fields,
});

/**
 * The utility function to create a Mesh Data index 2 constructor object, representing custom data type
 * @param fields The items in array
 * @returns The Mesh Data constructor object
 */
export const mConStr2 = <T extends Data[]>(fields: T): MConStr2<T> => ({
  alternative: 2,
  fields,
});

/**
 * The utility function to create a Mesh Data index 3 constructor object, representing custom data type
 * @param fields The items in array
 * @returns The Mesh Data constructor object
 */
export const mConStr3 = <T extends Data[]>(fields: T): MConStr3<T> => ({
  alternative: 3,
  fields,
});
