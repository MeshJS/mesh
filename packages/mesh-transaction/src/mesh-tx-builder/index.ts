import {
  IEvaluator,
  IFetcher,
  IMeshTxSerializer,
  ISubmitter,
  MeshTxBuilderBody,
  Protocol,
  ScriptTxIn,
  TxIn,
  UTxO,
} from "@meshsdk/common";
import { CSLSerializer } from "@meshsdk/core-csl";

// import { CardanoSDKSerializer } from "@meshsdk/core-cst";

import { MeshTxBuilderCore } from "./tx-builder-core";

export interface MeshTxBuilderOptions {
  fetcher?: IFetcher;
  submitter?: ISubmitter;
  evaluator?: IEvaluator;
  serializer?: IMeshTxSerializer;
  isHydra?: boolean;
  params?: Partial<Protocol>;
}

export class MeshTxBuilder extends MeshTxBuilderCore {
  serializer: IMeshTxSerializer;
  fetcher?: IFetcher;
  submitter?: ISubmitter;
  evaluator?: IEvaluator;
  txHex: string = "";
  private queriedTxHashes: Set<string> = new Set();
  private queriedUTxOs: { [x: string]: UTxO[] } = {};

  constructor({
    serializer,
    fetcher,
    submitter,
    evaluator,
    params,
    isHydra = false,
  }: MeshTxBuilderOptions = {}) {
    super();
    if (serializer) {
      this.serializer = serializer;
    } else {
      // this.serializer = new CardanoSDKSerializer();
      this.serializer = new CSLSerializer();
    }
    if (fetcher) this.fetcher = fetcher;
    if (submitter) this.submitter = submitter;
    if (evaluator) this.evaluator = evaluator;
    if (params) this.protocolParams(params);
    if (isHydra)
      this.protocolParams({
        minFeeA: 0,
        minFeeB: 0,
        priceMem: 0,
        priceStep: 0,
        collateralPercent: 0,
        coinsPerUtxoSize: 0,
      });
  }

  /**
   * It builds the transaction and query the blockchain for missing information
   * @param customizedTx The optional customized transaction body
   * @returns The signed transaction in hex ready to submit / signed by client
   */
  complete = async (customizedTx?: Partial<MeshTxBuilderBody>) => {
    if (customizedTx) {
      this.meshTxBuilderBody = { ...this.meshTxBuilderBody, ...customizedTx };
    } else {
      this.queueAllLastItem();
    }
    this.removeDuplicateInputs();

    // Checking if all inputs are complete
    const { inputs, collaterals } = this.meshTxBuilderBody;
    const incompleteTxIns = [...inputs, ...collaterals].filter(
      (txIn) => !this.isInputComplete(txIn),
    );
    // Getting all missing utxo information
    await this.queryAllTxInfo(incompleteTxIns);
    // Completing all inputs
    incompleteTxIns.forEach((txIn) => {
      this.completeTxInformation(txIn);
    });
    this.addUtxosFromSelection();

    let txHex = this.serializer.serializeTxBody(
      this.meshTxBuilderBody,
      this._protocolParams,
    );

    // Evaluating the transaction
    if (this.evaluator) {
      const txEvaluation = await this.evaluator
        .evaluateTx(txHex)
        .catch((error) => {
          throw Error(`Tx evaluation failed: ${error}`);
        });
      this.updateRedeemer(this.meshTxBuilderBody, txEvaluation);
      txHex = this.serializer.serializeTxBody(
        this.meshTxBuilderBody,
        this._protocolParams,
      );
    }

    this.txHex = txHex;
    return txHex;
  };

  /**
   * It builds the transaction without dependencies
   * @param customizedTx The optional customized transaction body
   * @returns The signed transaction in hex ready to submit / signed by client
   */
  completeSync = (customizedTx?: MeshTxBuilderBody) => {
    if (customizedTx) {
      this.meshTxBuilderBody = customizedTx;
    } else {
      this.queueAllLastItem();
    }
    this.addUtxosFromSelection();
    return this.serializer.serializeTxBody(
      this.meshTxBuilderBody,
      this._protocolParams,
    );
  };

  /**
   * Complete the signing process
   * @returns The signed transaction in hex
   */
  completeSigning = () => {
    const signedTxHex = this.serializer.addSigningKeys(
      this.txHex,
      this.meshTxBuilderBody.signingKey,
    );
    this.txHex = signedTxHex;
    return signedTxHex;
  };

  /**
   * Submit transactions to the blockchain using the fetcher instance
   * @param txHex The signed transaction in hex
   * @returns
   */
  submitTx = async (txHex: string): Promise<string | undefined> => {
    const txHash = await this.submitter?.submitTx(txHex);
    return txHash;
  };

  /**
   * Get the UTxO information from the blockchain
   * @param TxHash The TxIn object that contains the txHash and txIndex, while missing amount and address information
   */
  private getUTxOInfo = async (txHash: string): Promise<void> => {
    let utxos: UTxO[] = [];
    if (!this.queriedTxHashes.has(txHash)) {
      this.queriedTxHashes.add(txHash);
      utxos = (await this.fetcher?.fetchUTxOs(txHash)) || [];
      this.queriedUTxOs[txHash] = utxos;
    }
  };

  private queryAllTxInfo = (incompleteTxIns: TxIn[]) => {
    const queryUTxOPromises: Promise<void>[] = [];
    if (incompleteTxIns.length > 0 && !this.fetcher)
      throw Error(
        "Transaction information is incomplete while no fetcher instance is provided",
      );
    for (let i = 0; i < incompleteTxIns.length; i++) {
      const currentTxIn = incompleteTxIns[i]!;
      if (!this.isInputInfoComplete(currentTxIn)) {
        queryUTxOPromises.push(this.getUTxOInfo(currentTxIn.txIn.txHash));
      }
      if (
        currentTxIn.type === "Script" &&
        currentTxIn.scriptTxIn.scriptSource?.type === "Inline" &&
        !this.isRefScriptInfoComplete(currentTxIn)
      ) {
        queryUTxOPromises.push(
          this.getUTxOInfo(currentTxIn.scriptTxIn.scriptSource.txHash),
        );
      }
    }
    return Promise.all(queryUTxOPromises);
  };

  private completeTxInformation = (input: TxIn) => {
    // Adding value and address information for inputs if missing
    if (!this.isInputInfoComplete(input)) {
      const utxos: UTxO[] = this.queriedUTxOs[input.txIn.txHash]!;
      const utxo = utxos?.find(
        (utxo) => utxo.input.outputIndex === input.txIn.txIndex,
      );
      const amount = utxo?.output.amount;
      const address = utxo?.output.address;
      if (!amount || amount.length === 0)
        throw Error(
          `Couldn't find value information for ${input.txIn.txHash}#${input.txIn.txIndex}`,
        );
      input.txIn.amount = amount;
      if (input.type === "PubKey") {
        if (!address || address === "")
          throw Error(
            `Couldn't find address information for ${input.txIn.txHash}#${input.txIn.txIndex}`,
          );
        input.txIn.address = address;
      }
    }
    // Adding spendingScriptHash for script inputs' scriptSource if missing
    if (
      input.type === "Script" &&
      input.scriptTxIn.scriptSource?.type == "Inline" &&
      !this.isRefScriptInfoComplete(input)
    ) {
      const scriptSource = input.scriptTxIn.scriptSource;
      const refUtxos = this.queriedUTxOs[scriptSource.txHash]!;
      const scriptRefUtxo = refUtxos.find(
        (utxo) => utxo.input.outputIndex === scriptSource.txIndex,
      );
      if (!scriptRefUtxo)
        throw Error(
          `Couldn't find script reference utxo for ${scriptSource.txHash}#${scriptSource.txIndex}`,
        );
      scriptSource.scriptHash = scriptRefUtxo?.output.scriptHash;
      // TODO: Calculate script size
    }
  };

  private isInputComplete = (txIn: TxIn): boolean => {
    if (txIn.type === "PubKey") return this.isInputInfoComplete(txIn);
    if (txIn.type === "Script") {
      return (
        this.isInputInfoComplete(txIn) && this.isRefScriptInfoComplete(txIn)
      );
    }
    return true;
  };

  private isInputInfoComplete = (txIn: TxIn): boolean => {
    const { amount, address } = txIn.txIn;
    if (txIn.type === "PubKey" && (!amount || !address)) return false;
    if (txIn.type === "Script") {
      if (!amount) return false;
    }
    return true;
  };

  private isRefScriptInfoComplete = (scriptTxIn: ScriptTxIn): boolean => {
    const { scriptSource } = scriptTxIn.scriptTxIn;
    if (scriptSource?.type === "Inline" && !scriptSource?.scriptHash)
      return false;
    return true;
  };
}

export * from "./utils";
