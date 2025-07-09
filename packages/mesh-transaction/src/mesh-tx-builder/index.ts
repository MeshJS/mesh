import BigNumber from "bignumber.js";
import JSONBig from "json-bigint";

import {
  Action,
  Asset,
  Certificate,
  DEFAULT_PROTOCOL_PARAMETERS,
  IEvaluator,
  IFetcher,
  IMeshTxSerializer,
  ISubmitter,
  MeshTxBuilderBody,
  MintItem,
  MintParam,
  Output,
  Protocol,
  ScriptSource,
  SimpleScriptSourceInfo,
  TxIn,
  TxOutput,
  UTxO,
  Vote,
  Voter,
  Withdrawal,
} from "@meshsdk/common";
import {
  CardanoSDKSerializer,
  CardanoSDKUtil,
  toDRep as coreToCstDRep,
  Address as CstAddress,
  AddressType as CstAddressType,
  CredentialCore as CstCredential,
  CredentialType as CstCredentialType,
  NativeScript as CstNativeScript,
  Script as CstScript,
} from "@meshsdk/core-cst";

import {
  CardanoSdkInputSelector,
  CoinSelectionInterface,
} from "./coin-selection";
import {
  TransactionCost,
  TransactionPrototype,
} from "./coin-selection/coin-selection-interface";
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
  verbose: boolean;
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
    this.verbose = verbose;
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

  serializeMockTx = () => {
    const builderBody = this.meshTxBuilderBody;
    const { keyHashes, byronAddresses } = this.collectAllRequiredSignatures();
    builderBody.expectedNumberKeyWitnesses = keyHashes.size;
    builderBody.expectedByronAddressWitnesses = Array.from(byronAddresses);
    return this.serializer.serializeTxBodyWithMockSignatures(
      this.meshTxBuilderBody,
      this._protocolParams,
    );
  };

  /**
   * It builds the transaction query the blockchain for missing information
   * @param customizedTx The optional customized transaction body
   * @returns The transaction in hex, unbalanced
   */
  completeUnbalanced = (customizedTx?: MeshTxBuilderBody): string => {
    if (customizedTx) {
      this.meshTxBuilderBody = customizedTx;
    } else {
      this.queueAllLastItem();
    }
    this.removeDuplicateInputs();
    this.removeDuplicateRefInputs();
    return this.serializer.serializeTxBody(
      this.meshTxBuilderBody,
      this._protocolParams,
    );
  };

  completeSync = (customizedTx?: MeshTxBuilderBody) => {
    if (customizedTx) {
      this.meshTxBuilderBody = customizedTx;
    } else {
      this.queueAllLastItem();
    }
    this.removeDuplicateInputs();
    this.removeDuplicateRefInputs();
    this.addUtxosFromSelection();
    return this.serializer.serializeTxBody(
      this.meshTxBuilderBody,
      this._protocolParams,
    );
  };

  /**
   * It builds the transaction and query the blockchain for missing information
   * @param customizedTx The optional customized transaction body
   * @returns The signed transaction in hex ready to submit / signed by client
   */
  complete = async (customizedTx?: Partial<MeshTxBuilderBody>) => {
    if (customizedTx) {
      this.meshTxBuilderBody = { ...this.meshTxBuilderBody, ...customizedTx };
      if (customizedTx.fee) {
        this.setFee(customizedTx.fee);
      }
    }

    this.queueAllLastItem();

    if (this.verbose) {
      console.log(
        "txBodyJson - before coin selection",
        JSONBig.stringify(this.meshTxBuilderBody, (key, val) => {
          if (key === "extraInputs") return undefined;
          if (key === "selectionConfig") return undefined;
          return val;
        }),
      );
    }
    this.removeDuplicateInputs();
    this.removeDuplicateRefInputs();
    // We can set scriptSize of collaterals as 0, because the ledger ignores this for fee calculations
    for (let collateral of this.meshTxBuilderBody.collaterals) {
      collateral.txIn.scriptSize = 0;
    }
    await this.completeTxParts();
    await this.sanitizeOutputs();

    this.sortTxParts();

    const txPrototype = await this.selectUtxos();
    await this.updateByTxPrototype(txPrototype, true);
    if (this.verbose) {
      console.log(
        "txBodyJson - after coin selection",
        JSONBig.stringify(this.meshTxBuilderBody, (key, val) => {
          if (key === "extraInputs") return undefined;
          if (key === "selectionConfig") return undefined;
          return val;
        }),
      );
    }

    const txHex = this.serializer.serializeTxBody(
      this.meshTxBuilderBody,
      this._protocolParams,
    );

    this.txHex = txHex;
    return txHex;
  };

  selectUtxos =
    async (): Promise<CoinSelectionInterface.TransactionPrototype> => {
      const callbacks: CoinSelectionInterface.BuilderCallbacks = {
        computeMinimumCost: async (
          selectionSkeleton: TransactionPrototype,
        ): Promise<TransactionCost> => {
          const clonedBuilder = this.clone();
          await clonedBuilder.updateByTxPrototype(selectionSkeleton);

          try {
            await clonedBuilder.evaluateRedeemers();
          } catch (error) {
            if (error instanceof Error) {
              throw new Error(`Evaluate redeemers failed: ${error.message}`);
            } else if (typeof error === "string") {
              throw new Error(`Evaluate redeemers failed: ${error}`);
            } else if (typeof error === "object") {
              throw new Error(
                `Evaluate redeemers failed: ${JSON.stringify(error)}`,
              );
            } else {
              throw new Error(`Evaluate redeemers failed: ${String(error)}`);
            }
          }
          const fee = clonedBuilder.getActualFee();
          const redeemers = clonedBuilder.getRedeemerCosts();
          return {
            fee,
            redeemers,
          };
        },
        tokenBundleSizeExceedsLimit: (tokenBundle) => {
          const maxValueSize = this._protocolParams.maxValSize;
          if (tokenBundle) {
            const valueSize =
              this.serializer.serializeValue(tokenBundle).length / 2;
            return valueSize > maxValueSize;
          }
          return false;
        },
        computeMinimumCoinQuantity: (output) => {
          return this.calculateMinLovelaceForOutput(output);
        },
        maxSizeExceed: async (selectionSkeleton) => {
          const clonedBuilder = this.clone();
          await clonedBuilder.updateByTxPrototype(selectionSkeleton);
          const maxTxSize = this._protocolParams.maxTxSize;
          const txSize = clonedBuilder.getSerializedSize();
          return txSize > maxTxSize;
        },
      };

      const currentInputs = this.meshTxBuilderBody.inputs;
      const currentOutputs = this.meshTxBuilderBody.outputs;
      const changeAddress = this.meshTxBuilderBody.changeAddress;
      const utxosForSelection = await this.getUtxosForSelection();
      const implicitValue = {
        withdrawals: this.getTotalWithdrawal(),
        deposit: this.getTotalDeposit(),
        reclaimDeposit: this.getTotalRefund(),
        mint: this.getTotalMint(),
      };

      const inputSelector = new CardanoSdkInputSelector(callbacks);
      return await inputSelector.select(
        currentInputs,
        currentOutputs,
        implicitValue,
        utxosForSelection,
        changeAddress,
      );
    };

  updateByTxPrototype = async (
    selectionSkeleton: CoinSelectionInterface.TransactionPrototype,
    final = false,
  ) => {
    for (let utxo of selectionSkeleton.newInputs) {
      this.txIn(
        utxo.input.txHash,
        utxo.input.outputIndex,
        utxo.output.amount,
        utxo.output.address,
        utxo.output.scriptRef ? utxo.output.scriptRef.length / 2 : 0,
      );
    }

    for (let output of selectionSkeleton.newOutputs) {
      this.txOut(output.address, output.amount);
    }

    for (let change of selectionSkeleton.change) {
      this.txOut(change.address, change.amount);
    }

    this.meshTxBuilderBody.fee = selectionSkeleton.fee.toString();
    this.queueAllLastItem();
    this.removeDuplicateInputs();
    this.sortTxParts();
    this.updateRedeemer(
      this.meshTxBuilderBody,
      selectionSkeleton.redeemers ?? [],
      final,
    );
  };

  getUtxosForSelection = async () => {
    const utxos = this.meshTxBuilderBody.extraInputs;
    const usedUtxos = new Set(
      this.meshTxBuilderBody.inputs.map(
        (input) => `${input.txIn.txHash}${input.txIn.txIndex}`,
      ),
    );
    return utxos.filter(
      (utxo) => !usedUtxos.has(`${utxo.input.txHash}${utxo.input.outputIndex}`),
    );
  };

  sortTxParts = () => {
    this.sortInputs();
    this.sortMints();
    this.sortWithdrawals();
    this.sortVotes();
  };

  sortInputs = () => {
    // Sort inputs based on txHash and txIndex
    this.meshTxBuilderBody.inputs.sort((a, b) => {
      if (a.txIn.txHash < b.txIn.txHash) return -1;
      if (a.txIn.txHash > b.txIn.txHash) return 1;
      if (a.txIn.txIndex < b.txIn.txIndex) return -1;
      if (a.txIn.txIndex > b.txIn.txIndex) return 1;
      return 0;
    });
  };

  sortMints = () => {
    // Sort mints based on policy id
    this.meshTxBuilderBody.mints.sort((a, b) => {
      if (a.policyId < b.policyId) return -1;
      if (a.policyId > b.policyId) return 1;
      return 0;
    });
  };

  protected compareCredentials = (
    credentialA: CstCredential,
    credentialB: CstCredential,
  ): number => {
    // Script credentials come before Key credentials
    if (
      credentialA.type === CstCredentialType.ScriptHash &&
      credentialB.type === CstCredentialType.KeyHash
    ) {
      return -1;
    }
    if (
      credentialA.type === CstCredentialType.KeyHash &&
      credentialB.type === CstCredentialType.ScriptHash
    ) {
      return 1;
    }
    // If same type, compare the hashes
    if (credentialA.type === credentialB.type) {
      if (credentialA.hash < credentialB.hash) return -1;
      if (credentialA.hash > credentialB.hash) return 1;
      return 0;
    }
    return 0;
  };

  sortWithdrawals = () => {
    this.meshTxBuilderBody.withdrawals.sort((a, b) => {
      const credentialA = CstAddress.fromString(a.address)
        ?.asReward()
        ?.getPaymentCredential();
      const credentialB = CstAddress.fromString(b.address)
        ?.asReward()
        ?.getPaymentCredential();
      if (credentialA && credentialB) {
        return this.compareCredentials(credentialA, credentialB);
      }
      return 0;
    });
  };

  sortVotes = () => {
    const variantOrder: Record<Voter["type"], number> = {
      ConstitutionalCommittee: 0,
      DRep: 1,
      StakingPool: 2,
    };
    this.meshTxBuilderBody.votes.sort((a, b) => {
      const voterA = a.vote.voter;
      const voterB = b.vote.voter;
      const orderA = variantOrder[voterA.type];
      const orderB = variantOrder[voterB.type];
      if (orderA !== orderB) return orderA - orderB;

      // Same variant, compare inner values
      if (
        voterA.type === "ConstitutionalCommittee" &&
        voterB.type === "ConstitutionalCommittee"
      ) {
        const credA = voterA.hotCred;
        const credB = voterB.hotCred;
        // Script credentials come before Key credentials
        if (credA.type === "ScriptHash" && credB.type === "KeyHash") {
          return -1;
        }
        if (credA.type === "KeyHash" && credB.type === "ScriptHash") {
          return 1;
        }
        // If same type, compare the hashes
        if (credA.type === credB.type) {
          const hashA =
            credA.type === "KeyHash" ? credA.keyHash : credA.scriptHash;
          const hashB =
            credB.type === "KeyHash" ? credB.keyHash : credB.scriptHash;
          if (hashA < hashB) return -1;
          if (hashA > hashB) return 1;
          return 0;
        }
        return 0;
      }
      if (voterA.type === "DRep" && voterB.type === "DRep") {
        const drepA = coreToCstDRep(voterA.drepId);
        const drepB = coreToCstDRep(voterB.drepId);
        const scriptHashA = drepA.toScriptHash();
        const scriptHashB = drepB.toScriptHash();
        const keyHashA = drepA.toKeyHash();
        const keyHashB = drepB.toKeyHash();

        // Script hashes come before key hashes
        if (scriptHashA != null && scriptHashB != null) {
          if (scriptHashA < scriptHashB) return -1;
          if (scriptHashA > scriptHashB) return 1;
          return 0;
        }
        if (scriptHashA != null) return -1;
        if (scriptHashB != null) return 1;
        // If both are key hashes, compare them
        if (keyHashA != null && keyHashB != null) {
          if (keyHashA < keyHashB) return -1;
          if (keyHashA > keyHashB) return 1;
          return 0;
        }
        return 0;
      }
      if (voterA.type === "StakingPool" && voterB.type === "StakingPool") {
        if (voterA.keyHash < voterB.keyHash) return -1;
        if (voterA.keyHash > voterB.keyHash) return 1;
        return 0;
      }
      return 0;
    });
  };

  evaluateRedeemers = async () => {
    let txHex = this.serializer.serializeTxBody(
      this.meshTxBuilderBody,
      this._protocolParams,
    );
    if (this.evaluator) {
      const txEvaluation = await this.evaluator
        .evaluateTx(
          txHex,
          Object.values(this.meshTxBuilderBody.inputsForEvaluation),
          this.meshTxBuilderBody.chainedTxs,
        )
        .catch((error) => {
          if (error instanceof Error) {
            throw new Error(
              `Tx evaluation failed: ${error.message} \n For txHex: ${txHex}`,
            );
          } else if (typeof error === "string") {
            throw new Error(
              `Tx evaluation failed: ${error} \n For txHex: ${txHex}`,
            );
          } else if (typeof error === "object") {
            throw new Error(
              `Tx evaluation failed: ${JSON.stringify(error)} \n For txHex: ${txHex}`,
            );
          } else {
            throw new Error(
              `Tx evaluation failed: ${String(error)} \n For txHex: ${txHex}`,
            );
          }
        });
      this.updateRedeemer(this.meshTxBuilderBody, txEvaluation);
    }
  };

  protected getRedeemerCosts = () => {
    const meshTxBuilderBody = this.meshTxBuilderBody;
    const redeemers: Omit<Action, "data">[] = [];
    for (let i = 0; i < meshTxBuilderBody.inputs.length; i++) {
      const input = meshTxBuilderBody.inputs[i]!;
      if (input.type == "Script" && input.scriptTxIn.redeemer) {
        redeemers.push({
          tag: "SPEND",
          index: i,
          budget: structuredClone(input.scriptTxIn.redeemer.exUnits),
        });
      }
    }
    for (let i = 0; i < meshTxBuilderBody.mints.length; i++) {
      const mint = meshTxBuilderBody.mints[i]!;
      if (mint.type == "Plutus" && mint.redeemer) {
        redeemers.push({
          tag: "MINT",
          index: i,
          budget: structuredClone(mint.redeemer.exUnits),
        });
      }
    }
    for (let i = 0; i < meshTxBuilderBody.certificates.length; i++) {
      const cert = meshTxBuilderBody.certificates[i]!;
      if (cert.type === "ScriptCertificate" && cert.redeemer) {
        redeemers.push({
          tag: "CERT",
          index: i,
          budget: structuredClone(cert.redeemer.exUnits),
        });
      }
    }
    for (let i = 0; i < meshTxBuilderBody.withdrawals.length; i++) {
      const withdrawal = meshTxBuilderBody.withdrawals[i]!;
      if (withdrawal.type === "ScriptWithdrawal" && withdrawal.redeemer) {
        redeemers.push({
          tag: "REWARD",
          index: i,
          budget: structuredClone(withdrawal.redeemer.exUnits),
        });
      }
    }
    for (let i = 0; i < meshTxBuilderBody.votes.length; i++) {
      const vote = meshTxBuilderBody.votes[i]!;
      if (vote.type === "ScriptVote" && vote.redeemer) {
        redeemers.push({
          tag: "VOTE",
          index: i,
          budget: structuredClone(vote.redeemer.exUnits),
        });
      }
    }
    return redeemers;
  };

  /**
   * It builds the transaction without dependencies
   * @param customizedTx The optional customized transaction body
   * @returns The transaction in hex, unbalanced
   */
  completeUnbalancedSync = (customizedTx?: MeshTxBuilderBody) => {
    if (customizedTx) {
      this.meshTxBuilderBody = customizedTx;
      if (customizedTx.fee) {
        this.setFee(customizedTx.fee);
      }
    } else {
      this.queueAllLastItem();
    }
    this.removeDuplicateInputs();
    this.removeDuplicateRefInputs();
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
  ) => {
    if (customizedTx) {
      this.meshTxBuilderBody = { ...this.meshTxBuilderBody, ...customizedTx };
    } else {
      this.queueAllLastItem();
    }
    this.removeDuplicateInputs();
    this.removeDuplicateRefInputs();

    // We can set scriptSize of collaterals as 0, because the ledger ignores this for fee calculations
    for (let collateral of this.meshTxBuilderBody.collaterals) {
      collateral.txIn.scriptSize = 0;
    }

    await this.completeTxParts();

    let txHex = this.serializer.serializeTxBody(
      this.meshTxBuilderBody,
      this._protocolParams,
    );

    // Evaluating the transaction
    if (this.evaluator) {
      const txEvaluation = await this.evaluator
        .evaluateTx(
          txHex,
          Object.values(this.meshTxBuilderBody.inputsForEvaluation) as UTxO[],
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
      );
    }

    this.txHex = txHex;
    return txHex;
  };

  protected completeTxParts = async (): Promise<void> => {
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
    this.sortTxParts();
  };

  protected sanitizeOutputs = async () => {
    this.meshTxBuilderBody.outputs.forEach((output) => {
      let lovelaceFound = false;
      output.amount.forEach((asset) => {
        if (asset.unit === "lovelace" || asset.unit === "") {
          lovelaceFound = true;
        }
      });
      if (!lovelaceFound) {
        const minAda = this.calculateMinLovelaceForOutput(output);
        output.amount.push({
          unit: "lovelace",
          quantity: minAda.toString(),
        });
      }
    });
  };

  protected collectAllRequiredSignatures = (): {
    keyHashes: Set<string>;
    byronAddresses: Set<string>;
  } => {
    const { paymentCreds, byronAddresses } = this.getInputsRequiredSignatures();
    const { collateralPaymentCreds, collateralByronAddresses } =
      this.getCollateralRequiredSignatures();
    const withdrawalCreds = this.getWithdrawalRequiredSignatures();
    const certCreds = this.getCertificatesRequiredSignatures();
    const voteCreds = this.getVoteRequiredSignatures();
    const mintCreds = this.getMintRequiredSignatures();
    const requiredSignatures = this.meshTxBuilderBody.requiredSignatures;
    const allCreds = new Set([
      ...paymentCreds,
      ...withdrawalCreds,
      ...collateralPaymentCreds,
      ...certCreds,
      ...voteCreds,
      ...requiredSignatures,
      ...mintCreds,
    ]);
    const allByronAddresses = new Set([
      ...byronAddresses,
      ...collateralByronAddresses,
    ]);
    return { keyHashes: allCreds, byronAddresses: allByronAddresses };
  };

  protected getInputsRequiredSignatures(): {
    paymentCreds: Set<string>;
    byronAddresses: Set<string>;
  } {
    const byronAddresses = new Set<string>();
    const paymentCreds = new Set<string>();
    for (let input of this.meshTxBuilderBody.inputs) {
      if (input.type === "PubKey") {
        if (input.txIn.address) {
          const address = CstAddress.fromString(input.txIn.address);
          if (!address) {
            continue;
          }
          const addressDetails = address.getProps();
          const paymentCred = addressDetails.paymentPart;
          if (paymentCred?.type === CstCredentialType.KeyHash) {
            paymentCreds.add(paymentCred.hash);
          }
          if (addressDetails.type === CstAddressType.Byron) {
            byronAddresses.add(input.txIn.address);
          }
        }
      } else if (input.type === "SimpleScript") {
        const nativeScript = this.getInputNativeScript(input);
        if (nativeScript) {
          let pubKeys = this.getNativeScriptPubKeys(nativeScript);
          for (let pubKey of pubKeys) {
            paymentCreds.add(pubKey);
          }
        }
      }
    }
    return { paymentCreds, byronAddresses };
  }

  protected getCollateralRequiredSignatures(): {
    collateralPaymentCreds: Set<string>;
    collateralByronAddresses: Set<string>;
  } {
    const collateralByronAddresses = new Set<string>();
    const collateralPaymentCreds = new Set<string>();
    for (let collateral of this.meshTxBuilderBody.collaterals) {
      if (collateral.type === "PubKey") {
        if (collateral.txIn.address) {
          const address = CstAddress.fromString(collateral.txIn.address);
          if (!address) {
            continue;
          }
          const addressDetails = address.getProps();
          const paymentCred = addressDetails.paymentPart;
          if (paymentCred?.type === CstCredentialType.KeyHash) {
            collateralPaymentCreds.add(paymentCred.hash);
          }
          if (addressDetails.type === CstAddressType.Byron) {
            collateralByronAddresses.add(collateral.txIn.address);
          }
        }
      }
    }
    return { collateralPaymentCreds, collateralByronAddresses };
  }

  protected getWithdrawalRequiredSignatures(): Set<string> {
    const withdrawalCreds = new Set<string>();
    for (let withdrawal of this.meshTxBuilderBody.withdrawals) {
      if (withdrawal.type === "PubKeyWithdrawal") {
        const address = CstAddress.fromBech32(withdrawal.address);
        const addressDetails = address.getProps();
        const paymentCred = addressDetails.paymentPart;
        if (paymentCred?.type === CstCredentialType.KeyHash) {
          withdrawalCreds.add(paymentCred.hash);
        }
      }
      if (withdrawal.type === "SimpleScriptWithdrawal") {
        const nativeScript = this.getWithdrawalNativeScript(withdrawal);
        if (nativeScript) {
          let pubKeys = this.getNativeScriptPubKeys(nativeScript);
          for (let pubKey of pubKeys) {
            withdrawalCreds.add(pubKey);
          }
        }
      }
    }
    return withdrawalCreds;
  }

  protected getCertificatesRequiredSignatures(): Set<string> {
    const certCreds = new Set<string>();
    for (let cert of this.meshTxBuilderBody.certificates) {
      if (
        cert.type !== "BasicCertificate" &&
        cert.type !== "SimpleScriptCertificate"
      ) {
        continue;
      }

      const certNativeScript = this.getCertificateNativeScript(cert);

      const certType = cert.certType;

      if (certType.type === "RegisterPool") {
        certCreds.add(certType.poolParams.operator);
        for (let owner of certType.poolParams.owners) {
          certCreds.add(owner);
        }
      } else if (certType.type === "RetirePool") {
        certCreds.add(certType.poolId);
      } else if (
        certType.type === "DRepRegistration" ||
        certType.type === "DRepDeregistration" ||
        certType.type === "DRepUpdate"
      ) {
        if (cert.type === "BasicCertificate") {
          const cstDrep = coreToCstDRep(certType.drepId);
          const keyHash = cstDrep.toKeyHash();
          if (keyHash) {
            certCreds.add(keyHash);
          }
        } else if (certNativeScript) {
          let pubKeys = this.getNativeScriptPubKeys(certNativeScript);
          for (let pubKey of pubKeys) {
            certCreds.add(pubKey);
          }
        }
      } else if (
        certType.type === "StakeRegistrationAndDelegation" ||
        certType.type === "VoteRegistrationAndDelegation" ||
        certType.type === "StakeVoteRegistrationAndDelegation" ||
        certType.type === "VoteDelegation" ||
        certType.type === "RegisterStake" ||
        certType.type === "StakeAndVoteDelegation" ||
        certType.type === "DelegateStake" ||
        certType.type === "DeregisterStake"
      ) {
        if (cert.type === "BasicCertificate") {
          const address = CstAddress.fromString(certType.stakeKeyAddress);
          if (address) {
            const addressDetails = address.getProps();
            const paymentCred = addressDetails.paymentPart;
            if (paymentCred?.type === CstCredentialType.KeyHash) {
              certCreds.add(paymentCred.hash);
            }
          }
        } else if (certNativeScript) {
          let pubKeys = this.getNativeScriptPubKeys(certNativeScript);
          for (let pubKey of pubKeys) {
            certCreds.add(pubKey);
          }
        }
      } else if (
        certType.type === "CommitteeHotAuth" ||
        certType.type === "CommitteeColdResign"
      ) {
        if (cert.type === "BasicCertificate") {
          const address = CstAddress.fromString(
            certType.committeeColdKeyAddress,
          );
          if (address) {
            const addressDetails = address.getProps();
            const paymentCred = addressDetails.paymentPart;
            if (paymentCred?.type === CstCredentialType.KeyHash) {
              certCreds.add(paymentCred.hash);
            }
          }
        } else if (certNativeScript) {
          let pubKeys = this.getNativeScriptPubKeys(certNativeScript);
          for (let pubKey of pubKeys) {
            certCreds.add(pubKey);
          }
        }
      }
    }
    return certCreds;
  }

  protected getVoteRequiredSignatures(): Set<string> {
    const voteCreds = new Set<string>();
    for (let vote of this.meshTxBuilderBody.votes) {
      if (vote.type !== "SimpleScriptVote") {
        const nativeScript = this.getVoteNativeScript(vote);
        if (nativeScript) {
          let pubKeys = this.getNativeScriptPubKeys(nativeScript);
          for (let pubKey of pubKeys) {
            voteCreds.add(pubKey);
          }
        } else if (vote.type === "BasicVote") {
          const voter = vote.vote.voter;
          if (voter.type === "DRep") {
            const drep = coreToCstDRep(voter.drepId);
            const keyHash = drep.toKeyHash();
            if (keyHash) {
              voteCreds.add(keyHash);
            }
          } else if (voter.type === "StakingPool") {
            voteCreds.add(voter.keyHash);
          } else if (voter.type === "ConstitutionalCommittee") {
            const hotCred = voter.hotCred;
            if (hotCred.type === "KeyHash") {
              voteCreds.add(hotCred.keyHash);
            }
          }
        }
      }
    }
    return voteCreds;
  }

  protected getMintRequiredSignatures = (): Set<string> => {
    const mintCreds = new Set<string>();
    for (let mint of this.meshTxBuilderBody.mints) {
      if (mint.type === "Native") {
        const nativeScript = this.getMintNativeScript(mint);
        if (nativeScript) {
          let pubKeys = this.getNativeScriptPubKeys(nativeScript);
          for (let pubKey of pubKeys) {
            mintCreds.add(pubKey);
          }
        }
      }
    }
    return mintCreds;
  };

  protected getTotalWithdrawal = (): bigint => {
    let accum = 0n;
    for (let withdrawal of this.meshTxBuilderBody.withdrawals) {
      accum += BigInt(withdrawal.coin);
    }
    return accum;
  };

  protected getTotalDeposit = () => {
    let accum = 0n;
    for (let cert of this.meshTxBuilderBody.certificates) {
      const certType = cert.certType;
      if (certType.type === "RegisterStake") {
        if (cert.certType) {
          accum += BigInt(this._protocolParams.keyDeposit);
        }
      } else if (certType.type === "RegisterPool") {
        accum += BigInt(this._protocolParams.poolDeposit);
      } else if (certType.type === "DRepRegistration") {
        accum += BigInt(certType.coin);
      } else if (certType.type === "StakeRegistrationAndDelegation") {
        accum += BigInt(certType.coin);
      } else if (certType.type === "VoteRegistrationAndDelegation") {
        accum += BigInt(certType.coin);
      } else if (certType.type === "StakeVoteRegistrationAndDelegation") {
        accum += BigInt(certType.coin);
      }
    }
    return accum;
  };

  protected getTotalRefund = (): bigint => {
    let accum = 0n;
    for (let cert of this.meshTxBuilderBody.certificates) {
      const certType = cert.certType;
      if (certType.type === "DeregisterStake") {
        if (cert.certType) {
          accum += BigInt(this._protocolParams.keyDeposit);
        }
      } else if (certType.type === "DRepDeregistration") {
        accum += BigInt(certType.coin);
      }
    }
    return accum;
  };

  protected getTotalMint = (): Asset[] => {
    const assets = new Map<string, bigint>();
    for (let mint of this.meshTxBuilderBody.mints) {
      for (let assetValue of mint.mintValue) {
        const assetId = `${mint.policyId}${assetValue.assetName}`;
        let amount = assets.get(assetId) ?? 0n;
        amount += BigInt(assetValue.amount);
        assets.set(assetId, amount);
      }
    }
    return Array.from(assets).map(([assetId, amount]) => ({
      unit: assetId,
      quantity: amount.toString(),
    }));
  };

  protected getNativeScriptPubKeys = (
    nativeScript: CstNativeScript,
  ): Set<string> => {
    const pubKeys = new Set<string>();
    const nativeScriptStack = [];
    nativeScriptStack.push(nativeScript);
    while (nativeScriptStack.length > 0) {
      const script = nativeScriptStack.pop();
      if (script === undefined) {
        continue;
      }
      const nOfK = script.asScriptNOfK();
      if (nOfK) {
        for (let script of nOfK.nativeScripts()) {
          nativeScriptStack.push(script);
        }
      }
      const scriptAll = script.asScriptAll();
      if (scriptAll) {
        for (let script of scriptAll.nativeScripts()) {
          nativeScriptStack.push(script);
        }
      }
      const scriptAny = script.asScriptAny();
      if (scriptAny) {
        for (let script of scriptAny.nativeScripts()) {
          nativeScriptStack.push(script);
        }
      }
      const scriptPubkey = script.asScriptPubkey();
      if (scriptPubkey) {
        pubKeys.add(scriptPubkey.keyHash());
      }
    }
    return pubKeys;
  };

  protected getVoteNativeScript = (cert: Vote): CstNativeScript | undefined => {
    if (cert.type !== "SimpleScriptVote") {
      return undefined;
    }

    const scriptSource = cert.simpleScriptSource;
    if (scriptSource === undefined) {
      return undefined;
    }

    if (scriptSource.type === "Inline") {
      return this.getInlinedNativeScript(
        scriptSource.txHash,
        scriptSource.txIndex,
      );
    }
    if (scriptSource.type === "Provided") {
      return CstNativeScript.fromCbor(
        <CardanoSDKUtil.HexBlob>scriptSource.scriptCode,
      );
    }
  };

  protected getCertificateNativeScript = (
    cert: Certificate,
  ): CstNativeScript | undefined => {
    if (cert.type !== "SimpleScriptCertificate") {
      return undefined;
    }

    const scriptSource = cert.simpleScriptSource;
    if (scriptSource === undefined) {
      return undefined;
    }

    if (scriptSource.type === "Inline") {
      return this.getInlinedNativeScript(
        scriptSource.txHash,
        scriptSource.txIndex,
      );
    }
    if (scriptSource.type === "Provided") {
      return CstNativeScript.fromCbor(
        <CardanoSDKUtil.HexBlob>scriptSource.scriptCode,
      );
    }
  };

  protected getMintNativeScript = (
    mint: MintParam,
  ): CstNativeScript | undefined => {
    if (mint.type !== "Native") {
      return undefined;
    }

    const scriptSource = mint.scriptSource as SimpleScriptSourceInfo;
    const scriptSourceAlternative = mint.scriptSource as ScriptSource;
    if (scriptSource === undefined) {
      return undefined;
    }

    if (scriptSource.type === "Inline") {
      return this.getInlinedNativeScript(
        scriptSource.txHash,
        scriptSource.txIndex,
      );
    }
    if (scriptSource.type === "Provided") {
      if (scriptSource.scriptCode != undefined) {
        return CstNativeScript.fromCbor(
          <CardanoSDKUtil.HexBlob>scriptSource.scriptCode,
        );
      }
    }

    if (scriptSourceAlternative.type === "Provided") {
      if (scriptSourceAlternative.script != undefined) {
        return CstNativeScript.fromCbor(
          <CardanoSDKUtil.HexBlob>scriptSourceAlternative.script.code,
        );
      }
    }
  };

  protected getWithdrawalNativeScript = (
    withdrawal: Withdrawal,
  ): CstNativeScript | undefined => {
    if (withdrawal.type !== "SimpleScriptWithdrawal") {
      return undefined;
    }

    const scriptSource = withdrawal.scriptSource;
    if (scriptSource === undefined) {
      return undefined;
    }

    if (scriptSource.type === "Inline") {
      return this.getInlinedNativeScript(
        scriptSource.txHash,
        scriptSource.txIndex,
      );
    }
    if (scriptSource.type === "Provided") {
      return CstNativeScript.fromCbor(
        <CardanoSDKUtil.HexBlob>scriptSource.scriptCode,
      );
    }
  };

  protected getInputNativeScript(txIn: TxIn): CstNativeScript | undefined {
    if (txIn.type !== "SimpleScript") {
      return undefined;
    }

    const scriptSource = txIn.simpleScriptTxIn.scriptSource;
    if (scriptSource === undefined) {
      return undefined;
    }

    if (scriptSource.type === "Inline") {
      return this.getInlinedNativeScript(
        scriptSource.txHash,
        scriptSource.txIndex,
      );
    }
    if (scriptSource.type === "Provided") {
      return CstNativeScript.fromCbor(
        <CardanoSDKUtil.HexBlob>scriptSource.scriptCode,
      );
    }
  }

  protected getInlinedNativeScript = (
    txHash: string,
    index: number,
  ): CstNativeScript | undefined => {
    const utxos = this.queriedUTxOs[txHash];
    if (!utxos) {
      return undefined;
    }

    const utxo = utxos.find((utxo) => utxo.input.outputIndex === index);
    if (utxo?.output.scriptRef) {
      const script = CstScript.fromCbor(
        <CardanoSDKUtil.HexBlob>utxo.output.scriptRef,
      );
      return script.asNative();
    }
    return undefined;
  };

  protected makeTxId = (txHash: string, index: number): string => {
    return `${txHash}-${index}`;
  };

  protected getTotalReferenceInputsSize = (): bigint => {
    let accum = 0n;
    const allReferenceInputs = this.getAllReferenceInputsSizes();
    for (const [_, scriptSize] of allReferenceInputs) {
      accum += scriptSize;
    }
    return accum;
  };

  protected getAllReferenceInputsSizes = (): Map<string, bigint> => {
    const referenceInputs = new Map<string, bigint>();
    const bodyReferenceInputs = this.getBodyReferenceInputsSizes();
    for (const [txId, scriptSize] of bodyReferenceInputs) {
      referenceInputs.set(txId, scriptSize);
    }
    const inputsReferenceInputs = this.getInputsReferenceInputsSizes();
    for (const [txId, scriptSize] of inputsReferenceInputs) {
      referenceInputs.set(txId, scriptSize);
    }
    const mintsReferenceInputs = this.getMintsReferenceInputsSizes();
    for (const [txId, scriptSize] of mintsReferenceInputs) {
      referenceInputs.set(txId, scriptSize);
    }
    const withdrawalsReferenceInputs =
      this.getWithdrawalsReferenceInputsSizes();
    for (const [txId, scriptSize] of withdrawalsReferenceInputs) {
      referenceInputs.set(txId, scriptSize);
    }
    const votesReferenceInputs = this.getVotesReferenceInputsSizes();
    for (const [txId, scriptSize] of votesReferenceInputs) {
      referenceInputs.set(txId, scriptSize);
    }
    const certificatesReferenceInputs =
      this.getCertificatesReferenceInputsSizes();
    for (const [txId, scriptSize] of certificatesReferenceInputs) {
      referenceInputs.set(txId, scriptSize);
    }
    return referenceInputs;
  };

  protected getBodyReferenceInputsSizes = (): [string, bigint][] => {
    const referenceInputs: [string, bigint][] = [];
    for (const refTxIn of this.meshTxBuilderBody.referenceInputs) {
      referenceInputs.push([
        this.makeTxId(refTxIn.txHash, refTxIn.txIndex),
        BigInt(refTxIn.scriptSize ?? 0),
      ]);
    }
    return referenceInputs;
  };

  protected getInputsReferenceInputsSizes = (): [string, bigint][] => {
    const referenceInputs: [string, bigint][] = [];
    for (const input of this.meshTxBuilderBody.inputs) {
      if (input.type === "Script") {
        const scriptSource = input.scriptTxIn.scriptSource;
        if (scriptSource?.type === "Inline") {
          referenceInputs.push([
            this.makeTxId(scriptSource.txHash, scriptSource.txIndex),
            BigInt(scriptSource.scriptSize ?? 0),
          ]);
        }
      } else if (input.type === "SimpleScript") {
        const scriptSource = input.simpleScriptTxIn.scriptSource;
        if (scriptSource?.type === "Inline") {
          referenceInputs.push([
            this.makeTxId(scriptSource.txHash, scriptSource.txIndex),
            BigInt(scriptSource.scriptSize ?? 0),
          ]);
        }
      }
    }
    return referenceInputs;
  };

  protected getMintsReferenceInputsSizes = (): [string, bigint][] => {
    const referenceInputs: [string, bigint][] = [];
    for (const mint of this.meshTxBuilderBody.mints) {
      if (mint.type === "Plutus" || mint.type === "Native") {
        const scriptSource = mint.scriptSource;
        if (scriptSource?.type == "Inline") {
          referenceInputs.push([
            this.makeTxId(scriptSource.txHash, scriptSource.txIndex),
            BigInt(scriptSource.scriptSize ?? 0),
          ]);
        }
      }
    }
    return referenceInputs;
  };

  protected getWithdrawalsReferenceInputsSizes = (): [string, bigint][] => {
    const referenceInputs: [string, bigint][] = [];
    for (const withdrawal of this.meshTxBuilderBody.withdrawals) {
      if (
        withdrawal.type === "SimpleScriptWithdrawal" ||
        withdrawal.type === "ScriptWithdrawal"
      ) {
        const scriptSource = withdrawal.scriptSource;
        if (scriptSource?.type === "Inline") {
          referenceInputs.push([
            this.makeTxId(scriptSource.txHash, scriptSource.txIndex),
            BigInt(scriptSource.scriptSize ?? 0),
          ]);
        }
      }
    }
    return referenceInputs;
  };

  protected getVotesReferenceInputsSizes = (): [string, bigint][] => {
    const referenceInputs: [string, bigint][] = [];
    for (const vote of this.meshTxBuilderBody.votes) {
      if (vote.type === "SimpleScriptVote") {
        const scriptSource = vote.simpleScriptSource;
        if (scriptSource?.type === "Inline") {
          referenceInputs.push([
            this.makeTxId(scriptSource.txHash, scriptSource.txIndex),
            BigInt(scriptSource.scriptSize ?? 0),
          ]);
        }
      } else if (vote.type === "ScriptVote") {
        const scriptSource = vote.scriptSource;
        if (scriptSource?.type === "Inline") {
          referenceInputs.push([
            this.makeTxId(scriptSource.txHash, scriptSource.txIndex),
            BigInt(scriptSource.scriptSize ?? 0),
          ]);
        }
      }
    }
    return referenceInputs;
  };

  protected getCertificatesReferenceInputsSizes = (): [string, bigint][] => {
    const referenceInputs: [string, bigint][] = [];
    for (const cert of this.meshTxBuilderBody.certificates) {
      if (cert.type === "SimpleScriptCertificate") {
        const scriptSource = cert.simpleScriptSource;
        if (scriptSource?.type === "Inline") {
          referenceInputs.push([
            this.makeTxId(scriptSource.txHash, scriptSource.txIndex),
            BigInt(scriptSource.scriptSize ?? 0),
          ]);
        }
      } else if (cert.type === "ScriptCertificate") {
        const scriptSource = cert.scriptSource;
        if (scriptSource?.type === "Inline") {
          referenceInputs.push([
            this.makeTxId(scriptSource.txHash, scriptSource.txIndex),
            BigInt(scriptSource.scriptSize ?? 0),
          ]);
        }
      }
    }
    return referenceInputs;
  };

  getTotalExecutionUnits = (): {
    memUnits: bigint;
    stepUnits: bigint;
  } => {
    let memUnits = 0n;
    let stepUnits = 0n;
    for (let input of this.meshTxBuilderBody.inputs) {
      if (input.type === "Script" && input.scriptTxIn.redeemer) {
        memUnits += BigInt(input.scriptTxIn.redeemer.exUnits.mem);
        stepUnits += BigInt(input.scriptTxIn.redeemer.exUnits.steps);
      }
    }
    for (let mint of this.meshTxBuilderBody.mints) {
      if (mint.type === "Plutus" && mint.redeemer) {
        memUnits += BigInt(mint.redeemer.exUnits.mem);
        stepUnits += BigInt(mint.redeemer.exUnits.steps);
      }
    }
    for (let cert of this.meshTxBuilderBody.certificates) {
      if (cert.type === "ScriptCertificate" && cert.redeemer) {
        memUnits += BigInt(cert.redeemer.exUnits.mem);
        stepUnits += BigInt(cert.redeemer.exUnits.steps);
      }
    }
    for (let withdrawal of this.meshTxBuilderBody.withdrawals) {
      if (withdrawal.type === "ScriptWithdrawal" && withdrawal.redeemer) {
        memUnits += BigInt(withdrawal.redeemer.exUnits.mem);
        stepUnits += BigInt(withdrawal.redeemer.exUnits.steps);
      }
    }
    for (let vote of this.meshTxBuilderBody.votes) {
      if (vote.type === "ScriptVote" && vote.redeemer) {
        memUnits += BigInt(vote.redeemer.exUnits.mem);
        stepUnits += BigInt(vote.redeemer.exUnits.steps);
      }
    }
    memUnits = BigInt(
      new BigNumber(memUnits).integerValue(BigNumber.ROUND_CEIL).toString(),
    );
    stepUnits = BigInt(
      new BigNumber(stepUnits).integerValue(BigNumber.ROUND_CEIL).toString(),
    );
    return {
      memUnits,
      stepUnits,
    };
  };

  getSerializedSize = (): number => {
    return this.serializeMockTx().length / 2;
  };

  getActualFee = (): bigint => {
    if (this.manualFee) {
      return BigInt(this.manualFee);
    } else {
      return this.calculateFee();
    }
  };

  calculateFee = (): bigint => {
    const txSize = this.getSerializedSize();
    return this.calculateFeeForSerializedTx(txSize);
  };

  calculateFeeForSerializedTx = (txSize: number): bigint => {
    const refScriptFee = this.calculateRefScriptFee();
    const redeemersFee = this.calculateRedeemersFee();
    const minFeeCoeff = BigInt(this._protocolParams.minFeeA);
    const minFeeConstant = BigInt(this._protocolParams.minFeeB);
    const minFee = minFeeCoeff * BigInt(txSize) + minFeeConstant;
    return minFee + refScriptFee + redeemersFee;
  };

  calculateRefScriptFee = (): bigint => {
    const refSize = this.getTotalReferenceInputsSize();
    const refScriptFee = this._protocolParams.minFeeRefScriptCostPerByte;
    return minRefScriptFee(refSize, refScriptFee);
  };

  calculateRedeemersFee = (): bigint => {
    const { memUnits, stepUnits } = this.getTotalExecutionUnits();
    const stepPrice = BigNumber(this._protocolParams.priceStep);
    const memPrice = BigNumber(this._protocolParams.priceMem);
    const stepFee = stepPrice.multipliedBy(BigNumber(stepUnits.toString()));
    const memFee = memPrice.multipliedBy(BigNumber(memUnits.toString()));
    return BigInt(
      stepFee.plus(memFee).integerValue(BigNumber.ROUND_CEIL).toString(),
    );
  };

  calculateMinLovelaceForOutput = (output: Output): bigint => {
    return getOutputMinLovelace(output, this._protocolParams.coinsPerUtxoSize);
  };

  protected clone(): MeshTxBuilder {
    const newBuilder = super._cloneCore<MeshTxBuilder>(() => {
      return new MeshTxBuilder({
        serializer: this.serializer,
        fetcher: this.fetcher,
        submitter: this.submitter,
        evaluator: this.evaluator,
        verbose: this.verbose,
        params: { ...this._protocolParams },
      });
    });

    newBuilder.txHex = this.txHex;

    newBuilder.queriedTxHashes = structuredClone(this.queriedTxHashes);

    newBuilder.queriedUTxOs = structuredClone(this.queriedUTxOs);
    newBuilder.utxosWithRefScripts = structuredClone(this.utxosWithRefScripts);

    return newBuilder;
  }
}

function minRefScriptFee(
  totalRefScriptsSize: bigint,
  refScriptCoinsPerByte: number,
): bigint {
  const multiplier = new BigNumber(12).dividedBy(new BigNumber(10)); // 1.2
  const sizeIncrement = new BigNumber(25600);
  const baseFee = new BigNumber(refScriptCoinsPerByte);

  const totalSize = new BigNumber(totalRefScriptsSize.toString());

  return tierRefScriptFee(multiplier, sizeIncrement, baseFee, totalSize);
}

function tierRefScriptFee(
  multiplier: BigNumber,
  sizeIncrement: BigNumber,
  baseFee: BigNumber,
  totalSize: BigNumber,
): bigint {
  if (multiplier.lte(0) || sizeIncrement.eq(0)) {
    throw new Error("Size increment and multiplier must be positive");
  }

  const fullTiers = totalSize.dividedToIntegerBy(sizeIncrement);
  const partialTierSize = totalSize.mod(sizeIncrement);

  const tierPrice = baseFee.multipliedBy(sizeIncrement);
  let acc = new BigNumber(0);
  const one = new BigNumber(1);

  if (fullTiers.gt(0)) {
    const multiplierPow = multiplier.pow(fullTiers.toNumber());
    const progressionEnumerator = one.minus(multiplierPow);
    const progressionDenom = one.minus(multiplier);
    const tierProgressionSum =
      progressionEnumerator.dividedBy(progressionDenom);
    acc = acc.plus(tierPrice.multipliedBy(tierProgressionSum));
  }

  if (partialTierSize.gt(0)) {
    const multiplierPow = multiplier.pow(fullTiers.toNumber());
    const lastTierPrice = baseFee.multipliedBy(multiplierPow);
    const partialTierFee = lastTierPrice.multipliedBy(partialTierSize);
    acc = acc.plus(partialTierFee);
  }

  return BigInt(acc.integerValue(BigNumber.ROUND_FLOOR).toString());
}

export const cloneOutput = (output: Output): Output => {
  return JSONBig.parse(JSONBig.stringify(output));
};

export const setLoveLace = (output: Output, lovelace: bigint): Output => {
  let lovelaceSet = false;
  for (let asset of output.amount) {
    if (asset.unit === "lovelace") {
      asset.quantity = lovelace.toString();
      lovelaceSet = true;
      break;
    }
  }

  if (!lovelaceSet) {
    output.amount.push({
      unit: "lovelace",
      quantity: lovelace.toString(),
    });
  }
  return output;
};

export const getLovelace = (output: Output): bigint => {
  for (let asset of output.amount) {
    if (asset.unit === "lovelace" || asset.unit === "") {
      return BigInt(asset.quantity);
    }
  }
  return 0n;
};

export const getOutputMinLovelace = (
  output: Output,
  coinsPerUtxoSize = DEFAULT_PROTOCOL_PARAMETERS.coinsPerUtxoSize,
): bigint => {
  const serializer = new CardanoSDKSerializer();
  let currentOutput = cloneOutput(output);
  let lovelace = getLovelace(currentOutput);
  let minLovelace = 0n;
  for (let i = 0; i < 3; i++) {
    const txOutSize = BigInt(
      serializer.serializeOutput(currentOutput).length / 2,
    );
    const txOutByteCost = BigInt(coinsPerUtxoSize);
    const totalOutCost = (160n + BigInt(txOutSize)) * txOutByteCost;
    minLovelace = totalOutCost;
    if (lovelace < totalOutCost) {
      lovelace = totalOutCost;
    } else {
      break;
    }
    currentOutput = setLoveLace(currentOutput, lovelace);
  }

  return minLovelace;
};

export * from "./utils";
