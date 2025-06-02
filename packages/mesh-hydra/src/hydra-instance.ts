import { IFetcher, ISubmitter, PlutusScript} from "@meshsdk/common";
import { fromScriptRef, parseDatumCbor} from "@meshsdk/core-cst";
import { HydraProvider } from "./hydra-provider";
import { hAssets } from "./types/hAssets";

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
      inlineDatum: utxo.output.plutusData ? parseDatumCbor(utxo.output.plutusData) : null,
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
   * https://hydra.family/head-protocol/docs/how-to/commit-blueprint/.
   * A Cardano transaction in the text envelope format. 
   * That is, a JSON object wrapper with some 'type' around a 'cborHex' encoded transaction.
   * @param txHash
   * @param txIndex
   */
  async commitBlueprint(
    UTxO: {
      txHash: string, 
      txIndex: number},
    txBlueprint: {
      cborHex: string, 
      type: 
      | "Tx ConwayEra"
      | "Unwitnessed Tx ConwayEra"
      | "Witnessed Tx ConwayEra"
      description?: string
    } 
  ): Promise<string> {
    const utxo = (await this.fetcher.fetchUTxOs(UTxO.txHash, UTxO.txIndex))[0];
    if (!utxo) {
      throw new Error("UTxO not found");
    }
    const blueprintTx = {
      blueprintTx: {
      cborHex: txBlueprint.cborHex,
      description: txBlueprint.description === undefined
        ? txBlueprint.description = "": txBlueprint.description,
      type: txBlueprint.type,
      },
      utxo: {
      [`${UTxO.txHash}#${UTxO.txIndex}`]: {
        address: utxo.output.address,
        value: {
        lovelace: utxo.output.amount[0]?.quantity,
        },
        referenceScript:
        utxo.output.scriptRef === "" || !utxo.output.scriptRef
          ? null
          :{
            scriptLanguage: " ",
            script: {
            cborHex: utxo.output.scriptRef,
            description: txBlueprint.description,
            type: "PlutusScript" + (fromScriptRef(utxo.output.scriptRef) as PlutusScript).version ,
            },
          },
        datumHash:
        utxo.output.dataHash === " " || !utxo.output.dataHash
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
        [`${UTxO.txHash}#${UTxO.txIndex}`]: blueprintTx,
      },
      {
        "Content-Type": "application/json",
      }
    );

    console.log(commit);
    return commit.cborHex;
  }

  /**
   * TO DO
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
