import { Network } from "@meshsdk/common";

export const networkFromObj = (obj: any): Network | number[][] => {
  // Handle numeric and object network IDs
  if (typeof obj === "string") {
    return obj as Network;
  } else if (obj && typeof obj === "object" && "custom" in obj) {
    return obj.custom as number[][];
  }

  throw new Error(
    `networkFromObj: Unknown network type in object: ${JSON.stringify(obj)}`,
  );
};
