import { IFetcher, ISubmitter } from "@meshsdk/common";
import { HexBlob, parseDatumCbor, Serialization } from "@meshsdk/core-cst";
import { HydraProvider } from "./hydra-provider";
import { toHydraAssets } from "./convertor";

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
    const hydraUtxo: any = {
      address: utxo.output.address,
      datum: null,
      datumhash: null, // TODO: Handle datumHash case
      referenceScript:
        utxo.output.scriptRef === "" || !utxo.output.scriptRef
          ? null
          : utxo.output.scriptRef,
      value: toHydraAssets(utxo.output.amount),
    };
    if (utxo.output.plutusData) {
      hydraUtxo["inlineDatum"] = parseDatumCbor(utxo.output.plutusData);
      hydraUtxo["inlineDatumRaw"] = utxo.output.plutusData;
    } else {
      hydraUtxo["inlineDatum"] = null;
      hydraUtxo["inlineDatumRaw"] = null;
    }
    const commit = await this.provider.buildCommit(
      {
        [txHash + "#" + txIndex]: hydraUtxo,
      },
      {
        "Content-Type": "text/plain",
      }
    );
    console.log(commit);
    return commit.cborHex;
  }

  /**
   * https://hydra.family/head-protocol/docs/how-to/commit-blueprint/
   *
   * If you don't want to commit any funds and only want to receive on layer two, you can request an empty commit transaction.:
   * @returns
   */
  async commitBlueprint() {
    return "txHash";
  }

  /**
   * https://hydra.family/head-protocol/unstable/docs/how-to/incremental-commit
   *
   * If you don't want to commit any funds and only want to receive on layer two, you can request an empty commit transaction.:
   * @returns
   */
  async incrementalCommit() {
    return "txHash";
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
