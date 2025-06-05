import { Asset, Datum, Output } from "@meshsdk/common";

import { dataFromObj } from "./data";

export const outputFromObj = (obj: any): Output => {
  const output: Output = {
    address: obj.address,
    amount: assetVecFromObj(obj.amount),
  };

  if (obj.datum) {
    output.datum = datumFromObj(obj.datum);
  }

  if (obj.referenceScript) {
    output.referenceScript = obj.referenceScript;
  }

  return output;
};

export const assetVecFromObj = (obj: any[]): Asset[] => {
  return obj.map((asset) => ({
    unit: asset.unit,
    quantity: asset.quantity.toString(),
  }));
};

export const datumFromObj = (obj: any): Datum => {
  if ("hash" in obj) {
    return {
      type: "Hash",
      hash: obj.hash,
    };
  } else if ("inline" in obj) {
    return {
      type: "Inline",
      value: obj.inline,
    };
  } else if ("cbor" in obj) {
    return {
      type: "CBOR",
      value: obj.cbor,
    };
  } else if ("json" in obj) {
    return {
      type: "JSON",
      value: dataFromObj(obj.json),
    };
  }

  throw new Error(
    `datumFromObj: Unknown datum type in object: ${JSON.stringify(obj)}`,
  );
};
