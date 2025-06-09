import { BuilderData, Redeemer } from "@meshsdk/common";

import { csl } from "../../../deser";

/**
 * Convert CBOR hex string back to BuilderData
 * @param cborHex The CBOR hex string to convert
 * @returns BuilderData object
 */
export const cborToBuilderData = (cborHex: string): BuilderData => {
  return {
    type: "CBOR",
    content: cborHex,
  };
};

/**
 * Convert an object representation back to a Redeemer
 * @param obj The object representation of a Redeemer
 * @returns The Redeemer instance
 */
export const redeemerFromObj = (obj: any): Redeemer => {
  return {
    data: cborToBuilderData(obj.data),
    exUnits: obj.exUnits,
  };
};

/**
 * Convert an object representation back to Data
 * @param obj The object representation of Data
 * @returns The Data instance
 */
export const dataFromObj = (obj: any): any => {
  if (obj === null) {
    return null;
  }

  if (typeof obj === "object") {
    if (Array.isArray(obj)) {
      return obj.map((item) => dataFromObj(item));
    } else if ("map" in obj) {
      return Object.fromEntries(
        obj.map.map((entry: any) => [
          dataFromObj(entry.k),
          dataFromObj(entry.v),
        ]),
      );
    } else if ("list" in obj) {
      return obj.list.map((item: any) => dataFromObj(item));
    } else if ("int" in obj) {
      return BigInt(obj.int);
    } else if ("bytes" in obj) {
      return obj.bytes;
    } else if ("constructor" in obj) {
      return {
        constructor: obj.constructor,
        fields: obj.fields.map((field: any) => dataFromObj(field)),
      };
    }
  }

  return obj;
};
