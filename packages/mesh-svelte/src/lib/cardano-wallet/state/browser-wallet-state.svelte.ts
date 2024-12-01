import type { Wallet } from "@meshsdk/core";
import { BrowserWallet } from "@meshsdk/core";

let browserWallet: BrowserWallet | undefined = $state();
let wallet: Wallet | undefined = $state();
let connecting: boolean = $state(false);

export const BrowserWalletState = {
  get wallet() {
    return wallet;
  },
  get connecting() {
    return connecting;
  },
  get browserWallet() {
    return browserWallet;
  },
};

export async function connectWallet(w: Wallet) {
  connecting = true;
  try {

  browserWallet = await BrowserWallet.enable(w.id);

  wallet = w;
  } catch(e) {
    console.error(`error while connecting wallet ${w.name}: ${e}`)
  }
  connecting = false;
}

export function disconnectWallet() {
  wallet = undefined;
  browserWallet = undefined;
}
