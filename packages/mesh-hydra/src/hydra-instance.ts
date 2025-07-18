import { parseDatumCbor } from "@meshsdk/core-cst";
import {
  IFetcher,
  ISubmitter,
} from "@meshsdk/common";
import { HydraProvider } from "./hydra-provider";
import { hTransaction , hAssets} from "./types";
import JSONBigInt from "json-bigint";
import { getReferenceScriptInfo } from "./utils/hScriptRef";
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
    const hydraUtxo = {
      address: utxo.output.address,
      datum: null,
      datumhash: null, // TODO: Handle datumHash case
      referenceScript:
        utxo.output.scriptRef === "" || !utxo.output.scriptRef
          ? null
          : utxo.output.scriptRef,
      value: hAssets(utxo.output.amount),
      inlineDatum: utxo.output.plutusData
        ? parseDatumCbor(utxo.output.plutusData)
        : null,
      inlineDatumRaw: utxo.output.plutusData ?? null,
    };
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
  async commitBlueprint(
    txHash: string,
    outputIndex: number,
    transaction: hTransaction
  ): Promise<string> {
    const utxo = (await this.fetcher.fetchUTxOs(txHash, outputIndex))[0];
    if (!utxo) {
      throw new Error(`UTxO not found: ${txHash}#${outputIndex}`);
    }

    const { scriptInstance, scriptLanguage, scriptType } =
      getReferenceScriptInfo(utxo.output.scriptRef);

    const blueprintTx = {
      blueprintTx: {
        cborHex: transaction.cborHex,
        description:
          transaction.description === undefined
            ? (transaction.description = "")
            : transaction.description,
        type: transaction.type,
      },
      utxo: {
        [`${utxo.input.txHash}#${utxo.input.outputIndex}`]: {
          address: utxo.output.address,
          value: {
            lovelace: utxo.output.amount.find(
              (Asset) => Asset.unit === "lovelace"
            )?.quantity,
          },
          ...Object.fromEntries(
            utxo.output.amount
              .filter((asset) => asset.unit !== "lovelace")
              .map((asset) => [asset.unit, asset.quantity])
          ),
          referenceScript:
            utxo.output.scriptRef && scriptInstance
              ? {
                  scriptLanguage,
                  script: {
                    cborHex: utxo.output.scriptRef,
                    description: transaction.description ?? " ",
                    type: scriptType,
                  },
                }
              : null,
          datumHash:
            utxo.output.dataHash === "" || !utxo.output.dataHash
              ? null
              : utxo.output.dataHash,
          datum: null,
          inlineDatum: utxo.output.plutusData
            ? parseDatumCbor(utxo.output.plutusData)
            : null,
          inlineDatumRaw: utxo.output.plutusData ?? null,
        },
      },
    };
    const commit = await this.provider.buildCommit(
      {
        [`${utxo.input.txHash}#${utxo.input.outputIndex}`]: blueprintTx,
      },
      {
        "Content-Type": "application/json",
      }
    );
    const jsonFormat = JSONBigInt.stringify(blueprintTx);
    console.log("Json format visualizer", jsonFormat);
    return commit;
  }

  /**
   * TO DO
   * https://hydra.family/head-protocol/unstable/docs/how-to/incremental-commit
   *
   * If you don't want to commit any funds and only want to receive on layer two, you can request an empty commit transaction.:
   * @returns
   */
  // async incrementalCommit(UTxO: UTxO, headId: string) {
  //   const depositObject = {
  //     headId: headId,
  //     deposited: {
  //       [`${UTxO.input.txHash}#${UTxO.input.outputIndex}`]: {
  //         address: UTxO.output.address,
  //         value: {
  //           lovelace:
  //             UTxO.output.amount.find((asset) => asset.unit === "lovelace")
  //               ?.quantity ?? "0",
  //           ...Object.fromEntries(
  //             UTxO.output.amount
  //               .filter((asset) => asset.unit !== "lovelace")
  //               .map((asset) => [asset.unit, asset.quantity])
  //           ),
  //         },
  //         datumHash: null,
  //         inlineDatum: null,
  //         inlineDatumRaw: null,
  //         referenceScript: null,
  //       },
  //     },
  //     created: new Date().toISOString(),
  //     deadline: new Date(Date.now() + 3600 * 1000).toISOString(), // Example: 1 hour from now
  //     status: {
  //       tag: "Unknown",
  //     },
  //   };
  //   console.log(depositObject);
  //   return "txHash";
  // }

  /**
   * https://hydra.family/head-protocol/docs/how-to/incremental-decommit
   *
   * @returns
   */
  async incrementalDecommit() {
    
    return "txHash";
  }
}
