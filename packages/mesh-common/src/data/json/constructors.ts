/**
 * The Plutus Data constructor object, representing custom data type in JSON
 */
export type ConStr<T = any> = { constructor: number; fields: T };

/**
 * The Plutus Data index 0 constructor object, representing custom data type in JSON
 */
export type ConStr0<T = any> = ConStr<T>;

/**
 * The Plutus Data index 1 constructor object, representing custom data type in JSON
 */
export type ConStr1<T = any> = ConStr<T>;

/**
 * The Plutus Data index 2 constructor object, representing custom data type in JSON
 */
export type ConStr2<T = any> = ConStr<T>;

/**
 * The utility function to create a Plutus Data constructor object, representing custom data type in JSON
 * @param constructor The constructor index number
 * @param fields The items in array
 * @returns The Plutus Data constructor object
 */
export const conStr = <T>(constructor: number, fields: T): ConStr<T> => {
  if (!Array.isArray(fields)) {
    throw new Error("fields of a constructor must be an array");
  }
  return {
    constructor,
    fields,
  };
};

/**
 * The utility function to create a Plutus Data index 0 constructor object, representing custom data type in JSON
 * @param fields The items of  in array
 * @returns The Plutus Data constructor object
 */
export const conStr0 = <T>(fields: T): ConStr0<T> => conStr<T>(0, fields);

/**
 * The utility function to create a Plutus Data index 1 constructor object, representing custom data type in JSON
 * @param fields The items of  in array
 * @returns The Plutus Data constructor object
 */
export const conStr1 = <T>(fields: T): ConStr1<T> => conStr<T>(1, fields);

/**
 * The utility function to create a Plutus Data index 2 constructor object, representing custom data type in JSON
 * @param fields The items of  in array
 * @returns The Plutus Data constructor object
 */
export const conStr2 = <T>(fields: T): ConStr2<T> => conStr<T>(2, fields);
