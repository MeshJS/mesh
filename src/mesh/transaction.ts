import {
  BigNum,
  Value,
  Address,
  min_ada_required,
  TransactionUnspentOutput,
} from "@emurgo/cardano-serialization-lib-browser";
import { Blockfrost } from "../provider/blockfrost";
import { Core } from "./core";
import { MIN_ADA_REQUIRED } from "../global";

export class Transaction {
  private _blockfrost: Blockfrost;
  private _core: Core;

  constructor({ blockfrost, core }: { blockfrost: Blockfrost; core: Core }) {
    this._blockfrost = blockfrost;
    this._core = core;
  }

  /**
   * baby steps, lets send ADA first
   * @param param0
   * @returns
   */
  async makeSimpleTransaction({
    lovelace = 0,
  }: {
    lovelace?: number;
  }): Promise<string> {
    if (lovelace < MIN_ADA_REQUIRED) {
      throw "Lovelace must be greater than 1000000";
    }
    return "";
  }

  /**
   *
   * @param param0
   * @returns cbor string
   */
  async makeTransaction({
    recipients = [],
  }: {
    recipients: { lovelace?: number; assets?: { [asset: string]: number } }[];
  }): Promise<string> {
    if (recipients.length == 0) {
      throw "No recipient.";
    }

    // // lovelace
    // if (lovelace > 0) {
    //   const walletLovelace = await this._core.getLovelace();
    //   if (walletLovelace < lovelace) {
    //     throw "Insufficient lovelace.";
    //   }
    // }

    // // assets
    // if (Object.keys(assets).length > 0) {
    //   const walletAssets = await this._core.getAssets();
    //   console.log("walletAssets", walletAssets);
    // }

    const utxosRaw = await this._core.getUtxos();
    if (utxosRaw === undefined) {
      throw "No UTXOs";
    }

    let utxos = utxosRaw.map((u) =>
      TransactionUnspentOutput.from_bytes(Buffer.from(u, "hex"))
    );
    console.log("utxos", utxos);

    // let protocolParameter = await this._blockfrost.blockLatestBlock();

    return "";
  }
}
