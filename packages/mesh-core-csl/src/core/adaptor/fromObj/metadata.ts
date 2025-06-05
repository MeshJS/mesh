import { Metadata } from "@meshsdk/common";

export const metadataFromObj = (obj: any): Metadata => {
  // Recursively convert all values, especially handling BigInt conversions
  const processValue = (value: any): any => {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === "object") {
      if (Array.isArray(value)) {
        return value.map(processValue);
      } else if ("bigint" in value) {
        return BigInt(value.bigint);
      } else {
        const result: Record<string, any> = {};
        Object.entries(value).forEach(([k, v]) => {
          result[k] = processValue(v);
        });
        return result;
      }
    }

    return value;
  };

  return processValue(obj);
};
