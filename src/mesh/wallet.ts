import { Asset } from "../types/assets";
import { HexToAscii, toHex, fromHex } from "../utils/converter";

export class Wallet {
  private _provider; // wallet provider on the browser, i.e. window.cardano.ccvault
  private _cardano; // Serialization Lib

  constructor(walletProvider?, cardano?) {
    this._provider = walletProvider;
    this._cardano = cardano;
  }

  /**
   *
   * @returns a list of available wallets
   */
  async getAvailableWallets(): Promise<string[]> {
    let availableWallets: string[] = [];

    if (window.cardano === undefined) {
      return availableWallets;
    }

    if (window.cardano.ccvault) {
      availableWallets.push("ccvault");
    }

    if (window.cardano.gerowallet) {
      availableWallets.push("gerowallet");
    }

    if (window.cardano.nami) {
      availableWallets.push("nami");
    }

    return availableWallets;
  }

  async getAssets() {
    const valueCBOR = await this._provider.getBalance();
    const value = this._cardano.Value.from_bytes(fromHex(valueCBOR));

    const assets: Asset[] = [];
    if (value.multiasset()) {
      const multiAssets = value.multiasset().keys();
      for (let j = 0; j < multiAssets.len(); j++) {
        const policy = multiAssets.get(j);
        const policyAssets = value.multiasset().get(policy);
        const assetNames = policyAssets.keys();
        for (let k = 0; k < assetNames.len(); k++) {
          const policyAsset = assetNames.get(k);
          const quantity = policyAssets.get(policyAsset);
          const asset = toHex(policy.to_bytes()) + toHex(policyAsset.name());
          const _policy = asset.slice(0, 56);
          const _name = asset.slice(56);
          assets.push({
            unit: asset,
            quantity: quantity.to_str(),
            policy: _policy,
            name: HexToAscii(_name),
          });
        }
      }
    }

    return assets;
  }
}
