import { IFetcher, ISubmitter, UTxO } from "@meshsdk/common";
import { HydraProvider } from "./hydra-provider";
import { hydraTransaction, hydraUTxO, hydraUTxOs } from "./types";

/**
 * HydraInstance is a tool for interacting with a Hydra head.
 * @constructor
 * @param provider - The Hydra provider instance for interacting with the Hydra head.
 * @param fetcher - The fetcher instance for fetching UTxOs and other data.
 * @param submitter - The submitter instance for submitting transactions.
 *
 * @example
 *
 * ```tsx
 * const provider = new HydraProvider({
 *   httpUrl: "<hydra-head-url>",
 * });
 *
 * const instance = new HydraInstance({
 *   provider: provider,
 *   fetcher: blockchainProvider,
 *   submitter: blockchainProvider,
 * });
 * ```
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
   * If you don't want to commit any funds and only want to receive on layer 2,
   * you can request an empty commit transaction to open the head:
   * @example
   * ```tsx
   * const commit = await hydraInstance.commitEmpty();
   * const submitTx = await wallet.submitTx(commit);
   * console.log("submitTx", submitTx);
   * ```
   *
   * @returns The transaction CBOR hex ready to be submitted.
   */
  async commitEmpty(): Promise<string> {
    return this._commitToHydra({});
  }

  /**
   * To commit funds to the head, choose which UTxO you would like to make available on layer 2.
   * The function returns the transaction CBOR hex ready to be partially signed.
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
   * Allows Commit UTxOs as ScriptUTxOs in a Cardano transaction blueprint to the Hydra head.
   *
   * https://hydra.family/head-protocol/docs/how-to/commit-blueprint
   * @param txHash - The transaction hash of the UTxO to be committed as a blueprint.
   * @param outputIndex - The output index of the UTxO to be committed.
   * @param hydraTransaction - The Cardano transaction in text envelope format, containing:
   *   - type: The type of the transaction (e.g., "Unwitnessed Tx ConwayEra").
   *   - description: (Optional) A human-readable description of the transaction.
   *   - cborHex: The CBOR-encoded unsigned transaction.
   * @returns The function returns the transaction CBOR hex ready to be partially signed.
   * @example
   * ```tsx
   * const commitTx = await instance.commitBlueprint(txHash, outputIndex, {
   *   type: "Tx ConwayEra",
   *   cborHex: unsignedTx,
   *   description: "Commit Blueprint",
   * });
   * ```
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
        ...transaction,
      },
      utxo: {
        [txHash + "#" + outputIndex]: hydraUtxo,
      },
    });
  }

  /**
   * Commit multiple UTxOs in a Cardano transaction blueprint to the Hydra head.
   *
   * @param utxos - Array of UTxO to commit, each with txHash and outputIndex
   * @param transaction - The Cardano transaction in text envelope format, containing:
   *   - type: The type of the transaction (e.g., "Unwitnessed Tx ConwayEra").
   *   - description: (Optional) A human-readable description of the transaction.
   *   - cborHex: The CBOR-encoded unsigned transaction.
   * @returns The function returns the transaction CBOR hex ready to be partially signed.
   * @example
   * ```tsx
   * const commitTx = await instance.commitBlueprintUTxOs([
   *   { txHash: "abc123...", outputIndex: 0 },
   *   { txHash: "def456...", outputIndex: 1 },
   * ], {
   *   type: "Tx ConwayEra",
   *   cborHex: unsignedTx,
   *   description: "Commit Multiple Blueprint",
   * });
   * ```
   */
  async commitBlueprintUTxOs(
    txIn: { txHash: string; outputIndex: number }[],
    transaction: hydraTransaction
  ): Promise<string> {
    const utxo : UTxO[] = [];
    for (const { txHash, outputIndex } of txIn) {
      const utxos = await this.fetcher.fetchUTxOs(txHash, outputIndex);
      if (!utxos.length) {
        throw new Error(`UTxO not found for ${txHash}#${outputIndex}`);
      }
      utxo.push(...utxos);
    }

    return this._commitToHydra({
      blueprintTx: {
        ...transaction,
      },
      utxo: await hydraUTxOs(utxo),
    });
  }

  /**
   * Increment commit funds to the head, choose which UTxO you would like to make available on layer 2.
   * The function returns the transaction CBOR hex ready to be partially signed.
   * @param txHash
   * @param txIndex
   * @returns commitTransactionHex
   */

  async incrementalCommitFunds(txHash: string, outputIndex: number) {
    return this.commitFunds(txHash, outputIndex);
  }

  /**
   * Increment a Cardano transaction blueprint to the Hydra head.
   *
   * This method allows you to increase a commit in the Cardano text envelope format
   * (i.e., a JSON object containing a 'type' and a 'cborHex' field) as a blueprint UTxO
   * to the Hydra head. This is useful for advanced use cases such as reference scripts,
   * inline datums, or other on-chain features that require a transaction context.
   *
   *
   * https://hydra.family/head-protocol/docs/how-to/commit-blueprint
   *
   * @param txHash - The transaction hash of the UTxO to be committed as a blueprint.
   * @param outputIndex - The output index of the UTxO to be committed.
   * @param hydraTransaction - The Cardano transaction in text envelope format, containing:
   *   - type: The type of the transaction (e.g., "Unwitnessed Tx ConwayEra").
   *   - description: (Optional) A human-readable description of the transaction.
   *   - cborHex: The CBOR-encoded unsigned transaction.
   * @returns A promise that resolves to the CBOR hex ready to be partially signed.
   */
  async incrementalBlueprintCommit(
    txHash: string,
    outputIndex: number,
    transaction: hydraTransaction
  ) {
    return this.commitBlueprint(txHash, outputIndex, {
      type: transaction.type,
      cborHex: transaction.cborHex,
      description: transaction.description,
      txId: transaction.txId,
    });
  }
}
