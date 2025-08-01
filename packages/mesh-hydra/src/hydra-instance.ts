import { IFetcher, ISubmitter } from "@meshsdk/common";
import { parseDatumCbor } from "@meshsdk/core-cst";
import { HydraProvider } from "./hydra-provider";

/**
 * todo: implement https://hydra.family/head-protocol/docs/tutorial/
 */
export class HydraInstance {
  provider: HydraProvider;
  fetcher: IFetcher;
  submitter: ISubmitter;

  constructor({
    provider,
    fetcher,
    submitter,
  }: {
    provider: HydraProvider;
    fetcher: IFetcher;
    submitter: ISubmitter;
  }) {
    this.provider = provider;
    this.fetcher = fetcher;
    this.submitter = submitter;
  }

  private async _commitToHydra(payload: any): Promise<string> {
    const commit = await this.provider.buildCommit(payload, {
      "Content-Type": "application/json",
    });
    return commit.cborHex;
  }

  /**
   * To commit funds to the head, choose which UTxO you would like to make available on layer 2.
   * The function returns the transaction, ready to be signed by the user.
   * @param txHash
   * @param txIndex
   * @returns commitTransactionHex
   */

  async commitFunds(txHash: string, txIndex: number): Promise<string> {
    const utxo = (await this.fetcher.fetchUTxOs(txHash, txIndex))[0];
    if (!utxo) {
      throw new Error("UTxO not found");
    }
    const hydraUtxo = {
      address: utxo.output.address,
      datum: null,
      datumhash: null,
      referenceScript:
        utxo.output.scriptRef === "" || !utxo.output.scriptRef
          ? null
          : utxo.output.scriptRef,
      value: {
        lovelace: Number(
          utxo.output.amount.find((Asset) => Asset.unit === "lovelace")
            ?.quantity
        ),
      },
      ...Object.fromEntries(
        utxo.output.amount
          .filter((asset) => asset.unit !== "lovelace")
          .map((asset) => [asset.unit, Number(asset.quantity)])
      ),
      inlineDatum: utxo.output.plutusData
        ? parseDatumCbor(utxo.output.plutusData)
        : null,
      inlineDatumRaw: utxo.output.plutusData ?? null,
    };
    return this._commitToHydra({ [txHash + "#" + txIndex]: hydraUtxo });
  }

  /**
   * https://hydra.family/head-protocol/docs/how-to/commit-blueprint/.
   * A Cardano transaction in the text envelope format. 
   * That is, a JSON object wrapper with some 'type' around a 'cborHex' encoded transaction.
   * @param txHash
   * @param txIndex
   */
  async commitBlueprint(){

  return this._commitToHydra({ });
  }
  
  

  /**
   * TO DO
   * https://hydra.family/head-protocol/unstable/docs/how-to/incremental-commit
   *
   * If you don't want to commit any funds and only want to receive on layer two, you can request an empty commit transaction.:
   * @returns
   */
  async incrementalCommit(){
  
    return this._commitToHydra({ });
  }

  /**
   * https://hydra.family/head-protocol/docs/how-to/incremental-decommit
   *
   * @returns
   */
  async incrementalDecommit() {
    return "txHash";
  }
}
