import {
  IEvaluator,
  IFetcher,
  IMeshTxSerializer,
  ISubmitter,
  MeshTxBuilderBody,
  MintItem,
  Protocol,
  ScriptSource,
  SimpleScriptSourceInfo,
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
  verbose?: boolean;
}

export class MeshTxBuilder extends MeshTxBuilderCore {
  serializer: IMeshTxSerializer;
  fetcher?: IFetcher;
  submitter?: ISubmitter;
  evaluator?: IEvaluator;
  txHex: string = "";
  protected queriedTxHashes: Set<string> = new Set();
  protected queriedUTxOs: { [x: string]: UTxO[] } = {};
  protected utxosWithRefScripts: UTxO[] = [];

  constructor({
    serializer,
    fetcher,
    submitter,
    evaluator,
    params,
    isHydra = false,
    verbose = false,
  }: MeshTxBuilderOptions = {}) {
    super();
    if (serializer) {
      this.serializer = serializer;
    } else {
      // this.serializer = new CardanoSDKSerializer();
      this.serializer = new CSLSerializer();
    }
    this.serializer.verbose = verbose;
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
    const { inputs, collaterals, mints } = this.meshTxBuilderBody;
    // We must check every input for ref scripts
    const incompleteTxIns = [...inputs, ...collaterals];
    const incompleteMints = mints.filter((mint) => !this.isMintComplete(mint));
    // Getting all missing utxo information
    await this.queryAllTxInfo(incompleteTxIns, incompleteMints);
    // Gather all utxos with ref scripts
    Object.values(this.queriedUTxOs).forEach((utxos) => {
      for (let utxo of utxos) {
        if (utxo.output.scriptRef !== undefined) {
          this.utxosWithRefScripts.push(utxo);
        }
      }
    });
    const missingRefInput = this.utxosWithRefScripts.filter((utxo) => {
      this.meshTxBuilderBody.referenceInputs.forEach((refInput) => {
        if (
          refInput.txHash === utxo.input.txHash &&
          refInput.txIndex === utxo.input.outputIndex
        ) {
          return false;
        }
      });
      return true;
    });
    // Add any inputs with ref scripts into reference inputs
    // serializer will then deduplicate, but keep the script size for fee calc
    missingRefInput.forEach((utxo) => {
      this.meshTxBuilderBody.referenceInputs.push({
        txHash: utxo.input.txHash,
        txIndex: utxo.input.outputIndex,
        scriptSize: utxo.output.scriptRef!.length / 2,
      });
    });
    // Completing all inputs
    incompleteTxIns.forEach((txIn) => {
      this.completeTxInformation(txIn);
    });
    incompleteMints.forEach((mint) => {
      if (mint.type === "Plutus") {
        const scriptSource = mint.scriptSource as ScriptSource;
        this.completeScriptInfo(scriptSource);
      }
      if (mint.type === "Native") {
        const scriptSource = mint.scriptSource as SimpleScriptSourceInfo;
        this.completeSimpleScriptInfo(scriptSource);
      }
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
          throw Error(`Tx evaluation failed: ${error} \n For txHex: ${txHex}`);
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
   * @param txHash The TxIn object that contains the txHash and txIndex, while missing amount and address information
   */
  protected getUTxOInfo = async (txHash: string): Promise<void> => {
    let utxos: UTxO[] = [];
    if (!this.queriedTxHashes.has(txHash)) {
      this.queriedTxHashes.add(txHash);
      utxos = (await this.fetcher?.fetchUTxOs(txHash)) || [];
      this.queriedUTxOs[txHash] = utxos;
    }
  };

  protected queryAllTxInfo = (
    incompleteTxIns: TxIn[],
    incompleteMints: MintItem[],
  ) => {
    const queryUTxOPromises: Promise<void>[] = [];
    if (
      (incompleteTxIns.length > 0 || incompleteMints.length > 0) &&
      !this.fetcher
    )
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
        !this.isRefScriptInfoComplete(currentTxIn.scriptTxIn.scriptSource)
      ) {
        queryUTxOPromises.push(
          this.getUTxOInfo(currentTxIn.scriptTxIn.scriptSource.txHash),
        );
      }
    }
    for (let i = 0; i < incompleteMints.length; i++) {
      const currentMint = incompleteMints[i]!;
      if (currentMint.type === "Plutus") {
        const scriptSource = currentMint.scriptSource as ScriptSource;
        if (scriptSource.type === "Inline") {
          if (!this.isRefScriptInfoComplete(scriptSource)) {
            queryUTxOPromises.push(this.getUTxOInfo(scriptSource.txHash));
          }
        }
      }
    }
    return Promise.all(queryUTxOPromises);
  };

  protected completeTxInformation = (input: TxIn) => {
    // Adding value and address information for inputs if missing
    if (!this.isInputInfoComplete(input)) {
      this.completeInputInfo(input);
    }
    // Adding spendingScriptHash for script inputs' scriptSource if missing
    if (
      input.type === "Script" &&
      !this.isRefScriptInfoComplete(input.scriptTxIn.scriptSource!)
    ) {
      const scriptSource = input.scriptTxIn.scriptSource;
      this.completeScriptInfo(scriptSource!);
    }
  };

  protected completeInputInfo = (input: TxIn) => {
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
  };

  protected completeScriptInfo = (scriptSource: ScriptSource) => {
    if (scriptSource?.type != "Inline") return;
    const refUtxos = this.queriedUTxOs[scriptSource.txHash]!;
    const scriptRefUtxo = refUtxos.find(
      (utxo) => utxo.input.outputIndex === scriptSource.txIndex,
    );
    if (!scriptRefUtxo)
      throw Error(
        `Couldn't find script reference utxo for ${scriptSource.txHash}#${scriptSource.txIndex}`,
      );
    scriptSource.scriptHash = scriptRefUtxo?.output.scriptHash!;
    scriptSource.scriptSize = (
      scriptRefUtxo?.output.scriptRef!.length / 2
    ).toString();
  };

  protected completeSimpleScriptInfo = (
    simpleScript: SimpleScriptSourceInfo,
  ) => {
    if (simpleScript.type !== "Inline") return;
    const refUtxos = this.queriedUTxOs[simpleScript.txHash]!;
    const scriptRefUtxo = refUtxos.find(
      (utxo) => utxo.input.outputIndex === simpleScript.txIndex,
    );
    if (!scriptRefUtxo)
      throw Error(
        `Couldn't find script reference utxo for ${simpleScript.txHash}#${simpleScript.txIndex}`,
      );
    simpleScript.simpleScriptHash = scriptRefUtxo?.output.scriptHash!;
  };

  protected isInputComplete = (txIn: TxIn): boolean => {
    if (txIn.type === "PubKey") return this.isInputInfoComplete(txIn);
    if (txIn.type === "Script") {
      const { scriptSource } = txIn.scriptTxIn;
      return (
        this.isInputInfoComplete(txIn) &&
        this.isRefScriptInfoComplete(scriptSource!)
      );
    }
    return true;
  };

  protected isInputInfoComplete = (txIn: TxIn): boolean => {
    const { amount, address } = txIn.txIn;
    if (!amount || !address) return false;
    return true;
  };

  protected isMintComplete = (mint: MintItem): boolean => {
    if (mint.type === "Plutus") {
      const scriptSource = mint.scriptSource as ScriptSource;
      return this.isRefScriptInfoComplete(scriptSource);
    }
    if (mint.type === "Native") {
      const scriptSource = mint.scriptSource as SimpleScriptSourceInfo;
      if (scriptSource.type === "Inline") {
        if (!scriptSource?.simpleScriptHash) return false;
      }
    }
    return true;
  };

  protected isRefScriptInfoComplete = (scriptSource: ScriptSource): boolean => {
    if (scriptSource?.type === "Inline") {
      if (!scriptSource?.scriptHash || !scriptSource?.scriptSize) return false;
    }
    return true;
  };
}

export * from "./utils";
