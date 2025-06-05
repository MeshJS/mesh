import { Data, Redeemer } from "@meshsdk/common";

export const dataFromObj = (obj: any): Data => {
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

export const redeemerFromObj = (obj: any): Redeemer => {
  return {
    tag: obj.tag,
    data: dataFromObj(obj.data),
    exUnits: {
      mem: obj.exUnits.mem.toString(),
      steps: obj.exUnits.steps.toString(),
    },
  };
};
