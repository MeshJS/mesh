import { Network } from "@meshsdk/common";

export const networkToObj = (network: Network | number[][]) => {
  if ((typeof network) === "string") {
    return network;
  } else {
    return {
      custom: network,
    };
  }
};
