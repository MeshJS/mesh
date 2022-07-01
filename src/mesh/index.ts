import SerializationLib from "../provider/serializationlib";
import { fromHex } from "../utils/converter";

declare global {
  interface Window {
    cardano: any;
  }
}

class Mesh {
  private _provider;
  private cardano;

  constructor() {}

  /**
   * Init Mesh library
   * @param network 0 for testnet, 1 for mainnet
   * @param blockfrostApiKey get your keys from blockfrost
   */
  async init({
    network,
    blockfrostApiKey,
  }: {
    network: number;
    blockfrostApiKey: string;
  }) {
    await SerializationLib.load();
    this.cardano = await SerializationLib.Instance;
  }

  async debug(string: string) {
    console.log("debug start");
    console.log("cardano", this.cardano);

    const totalWitnesses = await this.cardano.TransactionWitnessSet.new();
    console.log(11, totalWitnesses);

    return string.replace(/\s/g, "");
  }

  /**
   * Enable and connect wallet
   * @param walletName available wallets are `ccvault`, `gerowallet` and `nami`
   * @returns boolean
   */
  async enableWallet({ walletName }: { walletName: string }) {
    if (walletName === "ccvault") {
      const instance = await window.cardano?.ccvault?.enable();
      if (instance) {
        this._provider = instance;
        return true;
      }
    } else if (walletName === "gerowallet") {
      const instance = await window.cardano?.gerowallet?.enable();
      if (instance) {
        this._provider = instance;
        return true;
      }
    } else if (walletName === "nami" || walletName === null) {
      const isEnabled = await window.cardano?.nami.enable();
      if (isEnabled) {
        this._provider = window.cardano;
        return true;
      }
    }
    return false;
  }

  /**
   * Get bech32 addresses
   * @returns
   */
  async getWalletAddresses() {
    console.log("_provider", this._provider);
    const usedAddresses = await this._provider.getUsedAddresses();
    return usedAddresses.map((address) =>
      this.cardano.Address.from_bytes(fromHex(address)).to_bech32()
    );
  }
}

export default new Mesh();
