import { IPolkadotWallet } from "../../interfaces";

export type CreatePolkadotEmbeddedWalletOptions = {
  networkId: 0 | 1;
};

export class EmbeddedWallet implements IPolkadotWallet {
  private readonly _networkId: 0 | 1;

  constructor(options: CreatePolkadotEmbeddedWalletOptions) {
    this._networkId = options.networkId;
  }

  /**
   * Get wallet network ID.
   *
   * @returns network ID
   */
  getNetworkId(): 0 | 1 {
    return this._networkId;
  }
}
