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
  txInToUtxo,
  UTxO,
  Withdrawal,
} from "@meshsdk/common";
import { CardanoSDKSerializer } from "@meshsdk/core-cst";

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
    if (fetcher) this.fetcher = fetcher;
    if (submitter) this.submitter = submitter;
    if (evaluator) this.evaluator = evaluator;
    if (params) this.protocolParams(params);
    if (serializer) {
      this.serializer = serializer;
    } else {
      this.serializer = new CardanoSDKSerializer(this._protocolParams);
    }
    this.serializer.verbose = verbose;
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
   * @returns The transaction in hex ready to submit / signed by client
   */
  complete = async (customizedTx?: Partial<MeshTxBuilderBody>) => {
    const txHex = await this.completeSerialization(customizedTx, true);
    return txHex;
  };

  /**
   * It builds the transaction query the blockchain for missing information
   * @param customizedTx The optional customized transaction body
   * @returns The transaction in hex, unbalanced
   */
  completeUnbalanced = async (
    customizedTx?: Partial<MeshTxBuilderBody>,
  ): Promise<string> => {
    const txHex = await this.completeSerialization(customizedTx, false);
    return txHex;
  };

  /**
   * It builds the transaction without dependencies
   * @param customizedTx The optional customized transaction body
   * @returns The  transaction in hex ready to submit / signed by client
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
      true,
    );
  };

  /**
   * It builds the transaction without dependencies
   * @param customizedTx The optional customized transaction body
   * @returns The transaction in hex, unbalanced
   */
  completeUnbalancedSync = (customizedTx?: MeshTxBuilderBody) => {
    if (customizedTx) {
      this.meshTxBuilderBody = customizedTx;
    } else {
      this.queueAllLastItem();
    }
    this.addUtxosFromSelection();
    return this.serializer.serializeTxBody(
      this.meshTxBuilderBody,
      this._protocolParams,
      false,
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
    incompleteScriptSources: ScriptSource[],
    incompleteSimpleScriptSources: SimpleScriptSourceInfo[],
  ) => {
    const queryUTxOPromises: Promise<void>[] = [];
    if (
      (incompleteTxIns.length > 0 ||
        incompleteScriptSources.length > 0 ||
        incompleteSimpleScriptSources.length) &&
      !this.fetcher
    )
      throw Error(
        "Transaction information is incomplete while no fetcher instance is provided. Provide a `fetcher`.",
      );
    for (let i = 0; i < incompleteTxIns.length; i++) {
      const currentTxIn = incompleteTxIns[i]!;
      if (!this.isInputInfoComplete(currentTxIn)) {
        queryUTxOPromises.push(this.getUTxOInfo(currentTxIn.txIn.txHash));
      }
    }
    for (let i = 0; i < incompleteScriptSources.length; i++) {
      const scriptSource = incompleteScriptSources[i]!;
      if (scriptSource.type === "Inline") {
        queryUTxOPromises.push(this.getUTxOInfo(scriptSource.txHash));
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

    if (!address || address === "")
      throw Error(
        `Couldn't find address information for ${input.txIn.txHash}#${input.txIn.txIndex}`,
      );
    input.txIn.address = address;

    if (utxo?.output.scriptRef) {
      input.txIn.scriptSize = utxo.output.scriptRef.length / 2;
    } else {
      input.txIn.scriptSize = 0;
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
    const { amount, address, scriptSize } = txIn.txIn;
    if (!amount || !address || scriptSize === undefined) return false;
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

  protected isSimpleRefScriptInfoComplete = (
    simpleScriptSource: SimpleScriptSourceInfo,
  ): boolean => {
    if (simpleScriptSource.type === "Inline") {
      if (
        !simpleScriptSource.simpleScriptHash ||
        !simpleScriptSource.scriptSize
      )
        return false;
    }
    return true;
  };

  protected completeSerialization = async (
    customizedTx?: Partial<MeshTxBuilderBody>,
    balanced: Boolean = true,
  ) => {
    if (customizedTx) {
      this.meshTxBuilderBody = { ...this.meshTxBuilderBody, ...customizedTx };
    } else {
      this.queueAllLastItem();
    }
    this.removeDuplicateInputs();

    // We can set scriptSize of collaterals as 0, because the ledger ignores this for fee calculations
    for (let collateral of this.meshTxBuilderBody.collaterals) {
      collateral.txIn.scriptSize = 0;
    }

    // Checking if all inputs are complete
    const { inputs, collaterals, mints, withdrawals, votes, certificates } =
      this.meshTxBuilderBody;
    const incompleteTxIns = [...inputs, ...collaterals].filter(
      (txIn) => !this.isInputComplete(txIn),
    );
    let incompleteScriptSources: ScriptSource[] = [];
    let incompleteSimpleScriptSources: SimpleScriptSourceInfo[] = [];

    // Get incomplete script sources for inputs
    inputs.forEach((txIn) => {
      if (
        txIn.type === "Script" &&
        txIn.scriptTxIn.scriptSource?.type === "Inline"
      ) {
        if (!this.isRefScriptInfoComplete(txIn.scriptTxIn.scriptSource!)) {
          incompleteScriptSources.push(txIn.scriptTxIn.scriptSource);
        }
      } else if (
        txIn.type === "SimpleScript" &&
        txIn.simpleScriptTxIn?.scriptSource?.type === "Inline"
      ) {
        if (
          !this.isSimpleRefScriptInfoComplete(
            txIn.simpleScriptTxIn.scriptSource!,
          )
        ) {
          incompleteSimpleScriptSources.push(
            txIn.simpleScriptTxIn.scriptSource,
          );
        }
      }
    });

    // Get incomplete script sources for mints
    mints.forEach((mint) => {
      if (mint.type === "Plutus") {
        const scriptSource = mint.scriptSource as ScriptSource;
        if (!this.isRefScriptInfoComplete(scriptSource)) {
          incompleteScriptSources.push(scriptSource);
        }
      } else if (mint.type === "Native") {
        const scriptSource = mint.scriptSource as SimpleScriptSourceInfo;
        if (!this.isSimpleRefScriptInfoComplete(scriptSource)) {
          incompleteSimpleScriptSources.push(scriptSource);
        }
      }
    });

    // Get incomplete script sources for withdrawals
    withdrawals.forEach((withdrawal) => {
      if (withdrawal.type === "ScriptWithdrawal") {
        const scriptSource = withdrawal.scriptSource as ScriptSource;
        if (!this.isRefScriptInfoComplete(scriptSource)) {
          incompleteScriptSources.push(scriptSource);
        }
      } else if (withdrawal.type === "SimpleScriptWithdrawal") {
        const scriptSource = withdrawal.scriptSource as SimpleScriptSourceInfo;
        if (!this.isSimpleRefScriptInfoComplete(scriptSource)) {
          incompleteSimpleScriptSources.push(scriptSource);
        }
      }
    });

    // Get incomplete script sources for votes
    votes.forEach((vote) => {
      if (vote.type === "ScriptVote") {
        const scriptSource = vote.scriptSource as ScriptSource;
        if (!this.isRefScriptInfoComplete(scriptSource)) {
          incompleteScriptSources.push(scriptSource);
        }
      } else if (vote.type === "SimpleScriptVote") {
        const scriptSource = vote.simpleScriptSource as SimpleScriptSourceInfo;
        if (!this.isSimpleRefScriptInfoComplete(scriptSource)) {
          incompleteSimpleScriptSources.push(scriptSource);
        }
      }
    });

    // Get incomplete script sources for certificates
    certificates.forEach((certificate) => {
      if (certificate.type === "ScriptCertificate") {
        const scriptSource = certificate.scriptSource as ScriptSource;
        if (!this.isRefScriptInfoComplete(scriptSource)) {
          incompleteScriptSources.push(scriptSource);
        }
      } else if (certificate.type === "SimpleScriptCertificate") {
        const scriptSource =
          certificate.simpleScriptSource as SimpleScriptSourceInfo;
        if (!this.isSimpleRefScriptInfoComplete(scriptSource)) {
          incompleteSimpleScriptSources.push(scriptSource);
        }
      }
    });

    // Getting all missing utxo information
    await this.queryAllTxInfo(
      incompleteTxIns,
      incompleteScriptSources,
      incompleteSimpleScriptSources,
    );
    // Completing all inputs
    incompleteTxIns.forEach((txIn) => {
      this.completeTxInformation(txIn);
    });

    // Completing all script sources
    incompleteScriptSources.forEach((scriptSource) => {
      this.completeScriptInfo(scriptSource);
    });

    // Completing all simple script sources
    incompleteSimpleScriptSources.forEach((simpleScriptSource) => {
      this.completeSimpleScriptInfo(simpleScriptSource);
    });

    this.meshTxBuilderBody.inputs.forEach((input) => {
      if (input.txIn.scriptSize && input.txIn.scriptSize > 0) {
        if (
          this.meshTxBuilderBody.referenceInputs.find((refTxIn) => {
            refTxIn.txHash === input.txIn.txHash &&
              refTxIn.txIndex === input.txIn.txIndex;
          }) === undefined
        ) {
          this.meshTxBuilderBody.referenceInputs.push({
            txHash: input.txIn.txHash,
            txIndex: input.txIn.txIndex,
            scriptSize: input.txIn.scriptSize,
          });
        }
      }
    });
    this.addUtxosFromSelection();

    // Sort inputs based on txHash and txIndex
    this.meshTxBuilderBody.inputs.sort((a, b) => {
      if (a.txIn.txHash < b.txIn.txHash) return -1;
      if (a.txIn.txHash > b.txIn.txHash) return 1;
      if (a.txIn.txIndex < b.txIn.txIndex) return -1;
      if (a.txIn.txIndex > b.txIn.txIndex) return 1;
      return 0;
    });

    // Sort mints based on policy id and asset name
    this.meshTxBuilderBody.mints.sort((a, b) => {
      if (a.policyId < b.policyId) return -1;
      if (a.policyId > b.policyId) return 1;
      if (a.assetName < b.assetName) return -1;
      if (a.assetName > b.assetName) return 1;
      return 0;
    });

    let txHex = this.serializer.serializeTxBody(
      this.meshTxBuilderBody,
      this._protocolParams,
      balanced,
    );

    // Evaluating the transaction
    if (this.evaluator) {
      const txEvaluation = await this.evaluator
        .evaluateTx(
          txHex,
          (
            Object.values(this.meshTxBuilderBody.inputsForEvaluation) as UTxO[]
          ).concat(
            this.meshTxBuilderBody.inputs.map((val) => txInToUtxo(val.txIn)),
            this.meshTxBuilderBody.collaterals.map((val) =>
              txInToUtxo(val.txIn),
            ),
          ),
          this.meshTxBuilderBody.chainedTxs,
        )
        .catch((error) => {
          throw new Error(
            `Tx evaluation failed: ${JSON.stringify(error)} \n For txHex: ${txHex}`,
          );
        });
      this.updateRedeemer(this.meshTxBuilderBody, txEvaluation);
      txHex = this.serializer.serializeTxBody(
        this.meshTxBuilderBody,
        this._protocolParams,
        balanced,
      );
    }

    this.txHex = txHex;
    return txHex;
  };
}

export * from "./utils";
