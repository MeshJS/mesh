import { PlutusData } from ".";

/**
 * The Plutus Data constructor object, representing custom data type in JSON
 */
export interface ConStr<N = number, T extends PlutusData[] = PlutusData[]> {
  constructor: N;
  fields: T;
}
/**
 * The Plutus Data index 0 constructor object, representing custom data type in JSON
 */
export interface ConStr0<T extends PlutusData[] = PlutusData[]> extends ConStr<
  0,
  T
> {}

/**
 * The Plutus Data index 1 constructor object, representing custom data type in JSON
 */
export interface ConStr1<T extends PlutusData[] = PlutusData[]> extends ConStr<
  1,
  T
> {}

/**
 * The Plutus Data index 2 constructor object, representing custom data type in JSON
 */
export interface ConStr2<T extends PlutusData[] = PlutusData[]> extends ConStr<
  2,
  T
> {}

/**
 * The Plutus Data index 3 constructor object, representing custom data type in JSON
 */
export interface ConStr3<T extends PlutusData[] = PlutusData[]> extends ConStr<
  3,
  T
> {}

/**
 * The utility function to create a Plutus Data constructor object, representing custom data type in JSON
 * @param constructor The constructor index number
 * @param fields The items in array
 * @returns The Plutus Data constructor object
 */
export const conStr = <N extends number, T extends PlutusData[]>(
  constructor: N,
  fields: T,
): ConStr<N, T> => {
  if (!Array.isArray(fields)) {
    throw new Error("fields of a constructor must be an array");
  }
  return { constructor, fields };
};

/**
 * The utility function to create a Plutus Data index 0 constructor object, representing custom data type in JSON
 * @param fields The items of  in array
 * @returns The Plutus Data constructor object
 */
export const conStr0 = <T extends PlutusData[]>(fields: T): ConStr0<T> =>
  conStr<0, T>(0, fields);

/**
 * The utility function to create a Plutus Data index 1 constructor object, representing custom data type in JSON
 * @param fields The items of  in array
 * @returns The Plutus Data constructor object
 */
export const conStr1 = <T extends PlutusData[]>(fields: T): ConStr1<T> =>
  conStr<1, T>(1, fields);

/**
 * The utility function to create a Plutus Data index 2 constructor object, representing custom data type in JSON
 * @param fields The items of  in array
 * @returns The Plutus Data constructor object
 */
export const conStr2 = <T extends PlutusData[]>(fields: T): ConStr2<T> =>
  conStr<2, T>(2, fields);

/**
 * The utility function to create a Plutus Data index 3 constructor object, representing custom data type in JSON
 * @param fields The items of  in array
 * @returns The Plutus Data constructor object
 */
export const conStr3 = <T extends PlutusData[]>(fields: T): ConStr3<T> =>
  conStr<3, T>(3, fields);
