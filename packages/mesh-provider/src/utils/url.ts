import { BlockfrostSupportedNetworks } from "../blockfrost";

export function isURL(str: string) {
  try {
    new URL(str);
    return true;
  } catch (e) {
    return false;
  }
}

export function inferNetworkFromURL(
  u: URL,
): BlockfrostSupportedNetworks | undefined {
  let h = u.hostname.toLowerCase();

  if (h.includes("cardano-mainnet")) return "mainnet";
  if (h.includes("cardano-preprod")) return "preprod";
  if (h.includes("cardano-preview")) return "preview";

  return undefined;
}
