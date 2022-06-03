import Cardano from "./cardano";
import { fromHex } from "./utils/converter";

declare global {
  interface Window {
    cardano: any;
  }
}

class Mesh {
  private _provider;
  private cardano;

  constructor() {}

  async init(network: number, blockfrostApiKey: string) {
    // console.log("init", network, blockfrostApiKey);
    // // await Cardano.load();
    // console.log("loaded");
    console.log("init");
    // const S = await Cardano();
    // console.log(111, 'S', S)
    // this.cardano = S;

    await Cardano.load();
    console.log("Cardano.Instance", Cardano.Instance);
  }

  async debug(string: string) {
    console.log("debug start");

    const totalWitnesses = await this.cardano.TransactionWitnessSet.new();
    console.log(11, totalWitnesses);

    return string.replace(/\s/g, "");
  }

  async enable(name: string) {
    if (name === "ccvault") {
      const instance = await window.cardano?.ccvault?.enable();
      if (instance) {
        this._provider = instance;
        return true;
      }
    } else if (name === "gerowallet") {
      const instance = await window.cardano?.gerowallet?.enable();
      if (instance) {
        this._provider = instance;
        return true;
      }
    } else if (name === "nami" || name === null) {
      const isEnabled = await window.cardano?.nami.enable();
      if (isEnabled) {
        this._provider = window.cardano;
        return true;
      }
    }
    return false;
  }

  // async getUsedAddresses() {
  //   const usedAddresses = await this._provider.getUsedAddresses();
  //   return usedAddresses.map((address) =>
  //     Cardano.Instance.Address.from_bytes(fromHex(address)).to_bech32()
  //   )[0];
  // }
}

export default new Mesh();

// export const Greeter = (name: string) => `Hello ${name}`;
