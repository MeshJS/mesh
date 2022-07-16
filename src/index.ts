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
}

export default new Mesh();
