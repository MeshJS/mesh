import { parseDatumCbor } from "@meshsdk/core-cst";
import { IFetcher, ISubmitter } from "@meshsdk/common";
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
      datumhash: null, // TODO: Handle datumHash case
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
   * Commits a blueprint transaction for a given UTxO and Hydra transaction.
   * Fetches the specified UTxO, constructs a blueprint transaction object, and
   * submits it to hydra Head.
   * @param txHash - The transaction hash of the UTxO to commit.
   * @param outputIndex - The output index of the UTxO to commit.
   * @param transaction - The Hydra transaction object containing:
   *   - `type`: The transaction type ("Tx ConwayEra", "Unwitnessed Tx ConwayEra", or "Witnessed Tx ConwayEra").
   *   - `description`: Optional description of the transaction (defaults to empty string if undefined).
   *   - `cborHex`: CBOR hex string of the transaction.
   *   - `txId`: Optional transaction ID (not used in the function).
   * @returns A promise that resolves to the CBOR hex string of the commit transaction.
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
