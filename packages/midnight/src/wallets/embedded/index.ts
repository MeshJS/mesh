export type CreateMidnightEmbeddedWalletOptions = {
  networkId: 0 | 1;
};

export class EmbeddedWallet {
  private readonly _networkId: 0 | 1;

  constructor(options: CreateMidnightEmbeddedWalletOptions) {
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
