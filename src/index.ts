// import SerializationLib from "./provider/serializationlib";
// import { fromHex, HexToAscii } from "./utils/converter";

// declare global {
//   interface Window {
//     cardano: any;
//   }
// }

// class Mesh {
//   private _provider; // wallet provider on the browser, i.e. window.cardano.ccvault
//   private _cardano; // Serialization Lib

//   constructor() {}

//   /**
//    * Init Mesh library
//    * @param network 0 for testnet, 1 for mainnet
//    * @param blockfrostApiKey get your keys from blockfrost
//    */
//   async init({
//     network,
//     blockfrostApiKey,
//   }: {
//     network: number;
//     blockfrostApiKey: string;
//   }) {
//     await SerializationLib.load();
//     this._cardano = await SerializationLib.Instance;
//   }

//   async debug(string: string) {
//     console.log("debug start");
//     console.log("cardano", this._cardano);

//     const totalWitnesses = await this._cardano.TransactionWitnessSet.new();
//     console.log(11, totalWitnesses);

//     return string.replace(/\s/g, "");
//   }

//   /**
//    * Enable and connect wallet
//    * @param walletName available wallets are `ccvault`, `gerowallet` and `nami`
//    * @returns boolean
//    */
//   async enableWallet({ walletName }: { walletName: string }) {
//     if (walletName === "ccvault") {
//       const instance = await window.cardano?.ccvault?.enable();
//       if (instance) {
//         this._provider = instance;
//         return true;
//       }
//     } else if (walletName === "gerowallet") {
//       const instance = await window.cardano?.gerowallet?.enable();
//       if (instance) {
//         this._provider = instance;
//         return true;
//       }
//     } else if (walletName === "nami" || walletName === null) {
//       const isEnabled = await window.cardano?.nami.enable();
//       if (isEnabled) {
//         this._provider = window.cardano;
//         return true;
//       }
//     }
//     return false;
//   }

//   /**
//    *
//    * @returns a list of available wallets
//    */
//   async getAvailableWallets() {
//     let availableWallets: string[] = [];

//     if (window.cardano === undefined) {
//       return availableWallets;
//     }

//     if (window.cardano.ccvault) {
//       availableWallets.push("ccvault");
//     }

//     if (window.cardano.gerowallet) {
//       availableWallets.push("gerowallet");
//     }

//     if (window.cardano.nami) {
//       availableWallets.push("nami");
//     }

//     return availableWallets;
//   }

//   /**
//    * Returns a list of all used (included in some on-chain transaction) addresses controlled by the wallet.
//    * @returns list of bech32 addresses
//    */
//   async getUsedAddresses() {
//     if (this._provider == null) {
//       throw "Wallet not connected.";
//     }
//     const usedAddresses = await this._provider.getUsedAddresses();
//     return usedAddresses.map((address) =>
//       this._cardano.Address.from_bytes(fromHex(address)).to_bech32()
//     );
//   }

//   async getUtxos(){
//     if (this._provider == null) {
//       throw "Wallet not connected.";
//     }
//     const utxos = await this._provider.getUtxos();
//     return utxos;
//   }

//   async getBalance() {
//     if (this._provider == null) {
//       throw "Wallet not connected.";
//     }
//     const valueCBOR = await this._provider.getBalance();
//     console.log("valueCBOR", valueCBOR);
//     const value = this._cardano.Value.from_bytes(Buffer.from(valueCBOR, "hex"));

//     const assets: {
//       unit: string;
//       quantity: string;
//       policy: string;
//       name: string;
//     }[] = [];
//     if (value.multiasset()) {
//       const multiAssets = value.multiasset().keys();
//       for (let j = 0; j < multiAssets.len(); j++) {
//         const policy = multiAssets.get(j);
//         const policyAssets = value.multiasset().get(policy);
//         const assetNames = policyAssets.keys();
//         for (let k = 0; k < assetNames.len(); k++) {
//           const policyAsset = assetNames.get(k);
//           const quantity = policyAssets.get(policyAsset);
//           const asset =
//             Buffer.from(policy.to_bytes(), "hex").toString("hex") +
//             Buffer.from(policyAsset.name(), "hex").toString("hex");
//           const _policy = asset.slice(0, 56);
//           const _name = asset.slice(56);
//           assets.push({
//             unit: asset,
//             quantity: quantity.to_str(),
//             policy: _policy,
//             name: HexToAscii(_name),
//           });
//         }
//       }
//     }

//     return assets;
//   }

//   async signTx() {}

//   async signData() {}
// }

// export default new Mesh();

import { Mesh } from "./mesh/mesh";
export default new Mesh();
