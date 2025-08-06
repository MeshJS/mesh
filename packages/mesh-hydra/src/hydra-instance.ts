import { IFetcher, ISubmitter } from "@meshsdk/common";
import { HydraProvider } from "./hydra-provider";
import { hydraTransaction, hydraUTxO, hydraUTxOs } from "./types";

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

  private async _decommitFromHydra(payload: any): Promise<string> {
    const decommit = await this.provider.publishDecommit(payload, {
      "Content-Type": "application/json",
    });
    return decommit;
  }

  /**
   * To commit funds to the head, choose which UTxO you would like to make available on layer 2.
   * The function returns the transaction CBOR hex partially signed in hydra head.
   * @param txHash
   * @param txIndex
   * @returns commitTransactionHex
   */

  async commitFunds(txHash: string, outputIndex: number): Promise<string> {
    const utxo = (await this.fetcher.fetchUTxOs(txHash, outputIndex))[0];
    if (!utxo) {
      throw new Error("UTxO not found");
    }
    const hydraUtxo = await hydraUTxO(utxo);
    return this._commitToHydra({ [txHash + "#" + outputIndex]: hydraUtxo });
  }

  /**
   * Commits a Cardano transaction blueprint to the Hydra head.
   *
   * This method allows you to commit a transaction in the Cardano text envelope format
   * (i.e., a JSON object containing a 'type' and a 'cborHex' field) as a blueprint UTxO
   * to the Hydra head. This is useful for advanced use cases such as reference scripts,
   * inline datums, or other on-chain features that require a transaction context.
   *
   *
   * https://hydra.family/head-protocol/docs/how-to/commit-blueprint
   *
   * @param txHash - The transaction hash of the UTxO to be committed as a blueprint.
   * @param outputIndex - The output index of the UTxO to be committed.
   * @param hTransaction - The Cardano transaction in text envelope format, containing:
   *   - type: The type of the transaction (e.g., "Unwitnessed Tx ConwayEra").
   *   - description: (Optional) A human-readable description of the transaction.
   *   - cborHex: The CBOR-encoded unsigned transaction.
   * @returns A promise that resolves to the CBOR hex ready to be signed.
   */
  async commitBlueprint(
    txHash: string,
    outputIndex: number,
    transaction: hydraTransaction
  ): Promise<string> {
    const utxo = (await this.fetcher.fetchUTxOs(txHash, outputIndex))[0];
    if (!utxo) {
      throw new Error("UTxO not found");
    }
    const hydraUtxo = await hydraUTxO(utxo);
    return this._commitToHydra({
      blueprintTx: {
        hTransaction: transaction,
      },
      utxo: {
        [txHash + "#" + outputIndex]: hydraUtxo,
      },
    });
  }

  async incrementalCommitFunds(txHash: string, outputIndex: number) {
    return this.commitFunds(txHash, outputIndex);
  }

  /**
   * TO DO
   * https://hydra.family/head-protocol/unstable/docs/how-to/incremental-commit
   *
   * If you don't want to commit any funds and only want to receive on layer two, you can request an empty commit transaction.:
   * @returns
   */
  async incrementalBlueprintCommit(
    txHash: string,
    outputIndex: number,
    transaction: hydraTransaction
  ) {
    return this.commitBlueprint(txHash, outputIndex, {
      type: transaction.type,
      description: transaction.description,
      cborHex: transaction.cborHex,
      txId: transaction.txId,
    });
  }

  /**
   * Request to decommit a UTxO from a Head by providing a decommit tx. Upon reaching consensus, this will eventually result in corresponding transaction outputs becoming available on the layer 1.
   *
   * @param cborHex The base16-encoding of the CBOR encoding of some binary data
   * @param type Allowed values: "Tx ConwayEra""Unwitnessed Tx ConwayEra""Witnessed Tx ConwayEra"
   * @param description
   */
  async decommit(transaction: hydraTransaction) {
    const payload = {
      tag: "Decommit",
      decommitTx: {
        type: transaction.type,
        description: transaction.description,
        cborHex: transaction.cborHex,
        txId: transaction.txId,
      },
    };
    this._decommitFromHydra(payload);
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
