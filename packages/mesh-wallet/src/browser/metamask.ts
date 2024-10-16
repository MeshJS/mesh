import { initNufiDappCardanoSdk } from "@nufi/dapp-client-cardano";
import publicNufiCoreSdk from "@nufi/dapp-client-core";

import { Wallet } from "@meshsdk/common";

import { nufiSnap } from "../types/nufisnap";

const nufiDomain: { [key: string]: string } = {
  production: "https://wallet.nu.fi",
  mainnet: "https://wallet-staging.nu.fi",
  preprod: "https://wallet-testnet-staging.nu.fi",
  preview: "https://wallet-preview-staging.nu.fi",
};

export async function checkIfMetamaskInstalled(
  network = "preprod",
): Promise<Wallet | undefined> {
  try {
    const _nufiCoreSdk = (publicNufiCoreSdk as any).default;

    if (Object.keys(nufiDomain).includes(network)) {
      _nufiCoreSdk.init(nufiDomain[network]);
    } else {
      _nufiCoreSdk.init(network);
    }

    const metamask = (window as any).ethereum._metamask;
    if (metamask) {
      initNufiDappCardanoSdk(_nufiCoreSdk, "snap");
      return nufiSnap;
    }

    return undefined;
  } catch (err) {
    return Promise.resolve(undefined);
  }
}
