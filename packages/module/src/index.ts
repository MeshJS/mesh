import { Blockfrost } from './provider/blockfrost';
import { Wallet } from './wallet';
import { Transaction } from './transaction';
import { Infura } from './provider/infura';

class Mesh {
  public wallet: Wallet;
  public transaction: Transaction;
  public blockfrost: Blockfrost;
  public infura: Infura;

  constructor() {
    this.blockfrost = new Blockfrost();
    this.infura = new Infura();
    this.wallet = new Wallet({
      blockfrost: this.blockfrost,
    });
    this.transaction = new Transaction({
      wallet: this.wallet,
    });
  }
}

export default new Mesh();
