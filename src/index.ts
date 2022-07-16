import { Blockfrost } from "./provider/blockfrost.js";
import { Wallet } from "./wallet.js";
import { Transaction } from "./transaction.js";
import { Infura } from "./provider/infura.js";

class Mesh {
  public wallet: Wallet;
  public transaction: Transaction;
  public blockfrost: Blockfrost;
  public infura: Infura;

  constructor() {
    this.wallet = new Wallet();
    this.transaction = new Transaction({
      wallet: this.wallet,
    });
    this.blockfrost = new Blockfrost();
    this.infura = new Infura();
  }

  //** IPFS **//

  // /**
  //  * Add a file or directory to IPFS.
  //  * https://docs.infura.io/infura/networks/ipfs/http-api-methods/add
  //  * Get your Infura project ID and secret from https://infura.io/
  //  * @param formData
  //  * @returns {
  //  *   "Name": "Name of the object : sample-result.json",
  //  *   "Hash": "Hash of the uploaded object : QmSTkR1kkqMuGEeBS49dxVJjgHRMH6cUYa7D3tcHDQ3ea3",
  //  *   "Size": "integer indication size in bytes : 2120"
  //  * }
  //  */
  // async addFileIpfs({ formData }) {
  //   return await this._infura.addFileIpfs({ formData });
  // }

  // async newMnemonic() {
  //   return await this._core.newMnemonic();
  // }

  // async createWalletMnemonic({ seedPhrase, password }) {
  //   return await this._core.createWalletMnemonic({ seedPhrase, password });
  // }

  // async loadWallet({ encryptedRootKey, password, accountIndex = 1 }) {
  //   return await this._core.loadWallet({
  //     encryptedRootKey,
  //     password,
  //     accountIndex,
  //   });
  // }
}

export default new Mesh();
