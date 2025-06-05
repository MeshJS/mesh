import { Network } from "@meshsdk/common";

export const networkFromObj = (obj: any): Network => {
  if (obj === 0 || obj.network === 0 || obj === "mainnet") {
    return "mainnet";
  } else if (obj === 1 || obj.network === 1 || obj === "testnet") {
    return "testnet";
  } else if (typeof obj === "string") {
    return obj as Network;
  }

  throw new Error(
    `networkFromObj: Unknown network type in object: ${JSON.stringify(obj)}`,
  );
};
