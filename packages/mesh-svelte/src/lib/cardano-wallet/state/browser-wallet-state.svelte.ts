import type { Wallet } from "@meshsdk/core";
import { BrowserWallet } from "@meshsdk/core";

let wallet: BrowserWallet | undefined = $state();
let name: string | undefined = $state();
let connecting: boolean = $state(false);
let connected: boolean = $state(false);

export const BrowserWalletState = {
  get wallet() {
    return wallet;
  },
  get name() {
    return name;
  },
  get connecting() {
    return connecting;
  },
};

export async function connectWallet(w: Wallet) {
  connecting = true;
  try {
  wallet = await BrowserWallet.enable(w.id);
  name = w.name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  } catch(e) {
    console.error(`error while connecting wallet ${w.name}: ${e}`)
  }
  connecting = false;
  connected = true;
}

export function disconnectWallet() {
  wallet = undefined;
  name = undefined;
  connected = false;
}


// todo: export the following:
// import {
//   BrowserWalletState,
// } from "@meshsdk/svelte";
// const { wallet, connected, name, connecting, connect, disconnect, error } = BrowserWalletState;
