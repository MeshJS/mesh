import type { Wallet } from "@meshsdk/core";
import { BrowserWallet } from "@meshsdk/core";

let wallet: BrowserWallet | undefined = $state();
let name: string | undefined = $state();
let connecting: boolean = $state(false);
let lovelaceBalance: string | undefined = $state();
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
  get lovelaceBalance() {
    return lovelaceBalance;
  },
};

export async function connectWallet(w: Wallet) {
  connecting = true;
  wallet = await BrowserWallet.enable(w.id);
  name = w.name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  lovelaceBalance = await wallet.getLovelace(); // todo: remove this
  connecting = false;
  connected = true;
}

export function disconnectWallet() {
  wallet = undefined;
  name = undefined;
  lovelaceBalance = undefined;
  connected = false;
}


// todo: export the following:
// import {
//   BrowserWalletState,
// } from "@meshsdk/svelte";
// const { wallet, connected, name, connecting, connect, disconnect, error } = BrowserWalletState;
