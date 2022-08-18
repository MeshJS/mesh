import { Blockfrost } from './providers/blockfrost';
// import { Wallet } from './wallet.old';
// import { Transaction } from './transaction.old';

class Mesh {
  // public wallet: Wallet;
  // public transaction: Transaction;
  public blockfrost: Blockfrost;
  
  constructor() {
    this.blockfrost = new Blockfrost();
    // this.wallet = new Wallet({
    //   blockfrost: this.blockfrost,
    // });
    // this.transaction = new Transaction({
    //   wallet: this.wallet,
    // });
  }
}

export default new Mesh();

export * from './common/contracts';
export * from './common/types';
export * from './common/utils/resolver';
export * from './providers';
export * from './transaction';
export * from './wallet';
export * from './walletprivatekey';
