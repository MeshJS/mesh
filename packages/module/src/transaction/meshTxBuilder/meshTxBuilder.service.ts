import { IEvaluator, IFetcher, ISubmitter } from '@mesh/common/contracts';
import { UTxO } from '@mesh/common/types';
import {
  QueuedTxIn,
  ScriptSourceInfo,
  MeshTxBuilderCore,
} from './meshTxBuilderCore';

// Delay action at complete
// 1. Query blockchain for any missing information
// 2. Redeemer indexes for spending and minting

/**
 * MeshTxBuilder is a lower level api for building transaction
 * @param {IFetcher} [fetcher] an optional parameter for fetching utxo
 * @param {ISubmitter} [submitter] an optional parameter for submitting transaction
 * @param {IEvaluator} [evaluator] an optional parameter for evaluating transaction
 */

type MeshTxBuilderOptions = {
  fetcher?: IFetcher;
  submitter?: ISubmitter;
  evaluator?: IEvaluator;
};

export class MeshTxBuilder extends MeshTxBuilderCore {
  private _fetcher?: IFetcher;
  private _submitter?: ISubmitter;
  private _evaluator?: IEvaluator;
  private queriedTxHashes: Set<string> = new Set();
  private queriedUTxOs: { [x: string]: UTxO[] } = {};

  constructor({ fetcher, submitter, evaluator }: MeshTxBuilderOptions) {
    super();
    if (fetcher) this._fetcher = fetcher;
    if (submitter) this._submitter = submitter;
    if (evaluator) this._evaluator = evaluator;
  }

  complete = async (hydra = false) => {
    // Handle last items in queue
    this.queueAllLastItem();

    // Getting all missing utxo information
    await this.queryAllTxInfo();

    // Completing all inputs
    [...this.txInQueue, ...this.collateralQueue].forEach((txIn) => {
      this.completeTxInformation(txIn);
    });

    // Adding inputs, for both pub key inputs & script inputs
    this.addAllInputs();

    // Adding collateral inputs
    this.addAllCollateral();

    // Adding minting values
    // Hacky solution to get mint indexes correct
    // TODO: Remove after csl update
    this.mintQueue.sort((a, b) =>
      a.policyId.to_hex().localeCompare(b.policyId.to_hex())
    );
    this.addAllMints();

    // TODO: add collateral return
    // TODO: Calculate execution units and rebuild the transaction

    // Adding cost models
    if (!hydra) this.addCostModels();

    // Adding change
    this.addChange();
    this.buildTx();
    return this;
  };

  submitTx = async (txHex: string): Promise<string | undefined> => {
    const txHash = await this._submitter?.submitTx(txHex);
    return txHash;
  };

  /**
   * Get the UTxO information from the blockchain
   * @param TxHash The queuedTxIn object that contains the txHash and txIndex, while missing amount and address information
   */
  private getUTxOInfo = async (txHash: string): Promise<void> => {
    let utxos: UTxO[] = [];
    if (!this.queriedTxHashes.has(txHash)) {
      this.queriedTxHashes.add(txHash);
      utxos = (await this._fetcher?.fetchUTxOs(txHash)) || [];
      this.queriedUTxOs[txHash] = utxos;
    }
  };

  private queryAllTxInfo = () => {
    const queryUTxOPromises: Promise<void>[] = [];
    for (let i = 0; i < this.txInQueue.length; i++) {
      const currentTxIn = this.txInQueue[i];
      if (!currentTxIn.txIn.amount || !currentTxIn.txIn.address) {
        queryUTxOPromises.push(this.getUTxOInfo(currentTxIn.txIn.txHash));
      }
      if (
        currentTxIn.type === 'Script' &&
        currentTxIn.scriptTxIn.scriptSource?.txHash &&
        !currentTxIn.scriptTxIn.scriptSource?.spendingScriptHash
      ) {
        const scriptRefTxHash = currentTxIn.scriptTxIn.scriptSource.txHash;
        queryUTxOPromises.push(this.getUTxOInfo(scriptRefTxHash));
      }
    }
    for (let i = 0; i < this.collateralQueue.length; i++) {
      const currentCollateral = this.collateralQueue[i];
      if (!currentCollateral.txIn.amount || !currentCollateral.txIn.address) {
        queryUTxOPromises.push(this.getUTxOInfo(currentCollateral.txIn.txHash));
      }
    }
    return Promise.all(queryUTxOPromises);
  };

  private completeTxInformation = (queuedTxIn: QueuedTxIn) => {
    const utxos: UTxO[] = this.queriedUTxOs[queuedTxIn.txIn.txHash];
    const utxo = utxos.find(
      (utxo) => utxo.input.outputIndex === queuedTxIn.txIn.txIndex
    );
    const address = utxo?.output.address;
    const amount = utxo?.output.amount;
    if (!address || address === '' || !amount || amount.length === 0)
      throw Error(
        `Couldn't find information for ${queuedTxIn.txIn.txHash}#${queuedTxIn.txIn.txIndex}`
      );
    queuedTxIn.txIn.address = address;
    queuedTxIn.txIn.amount = amount;

    if (queuedTxIn.type === 'Script') {
      const scriptSourceInfo = queuedTxIn.scriptTxIn
        .scriptSource as ScriptSourceInfo;
      if (!scriptSourceInfo.spendingScriptHash) {
        const refUtxos = this.queriedUTxOs[scriptSourceInfo.txHash];
        const scriptRefUtxo = refUtxos.find(
          (utxo) => utxo.input.outputIndex === scriptSourceInfo.txIndex
        );
        if (!scriptRefUtxo)
          throw Error(
            `Couldn't find script reference utxo for ${scriptSourceInfo.txHash}#${scriptSourceInfo.txIndex}`
          );
        scriptSourceInfo.spendingScriptHash = scriptRefUtxo?.output.scriptHash;
      }
    }
  };
}
