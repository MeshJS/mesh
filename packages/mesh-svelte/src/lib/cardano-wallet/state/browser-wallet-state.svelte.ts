import type { Wallet } from "@meshsdk/core";
import { BrowserWallet } from "@meshsdk/core";

let wallet: BrowserWallet | undefined = $state();
let name: string | undefined = $state();
let icon: string | undefined = $state();
let connecting: boolean = $state(false);
let connected: boolean = $state(false);

export const BrowserWalletState = {
  get wallet() {
    return wallet;
  },
  get name() {
    return name;
  },
  get icon() {
    return icon;
  },
  get connected() {
    return connected;
  },
  get connecting() {
    return connecting;
  },
  get connect() {
    return connect;
  },
  get disconnect() {
    return disconnect;
  },
};

export async function connect(w: Wallet) {
  connecting = true;
  try {
    wallet = await BrowserWallet.enable(w.id);
    name = w.name
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
    icon = w.icon;
  } catch (e) {
    console.error(`error while connecting wallet ${w.name}: ${e}`);
  }
  connecting = false;
  connected = true;
}

export function disconnect() {
  wallet = undefined;
  name = undefined;
  icon = undefined;
  connected = false;
}
