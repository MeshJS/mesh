import { IEvaluator, IFetcher, ISubmitter } from '@mesh/common/contracts';
import { UTxO } from '@mesh/common/types';
import { MeshTxBuilderCore } from './meshTxBuilderCore';
import { MeshTxBuilderBody, TxIn, ScriptSourceInfo } from './type';

// Delay action at complete
// 1. Query blockchain for any missing information
// 2. Redeemer indexes for spending and minting

type MeshTxBuilderOptions = {
  fetcher?: IFetcher;
  submitter?: ISubmitter;
  evaluator?: IEvaluator;
  isHydra?: boolean;
};

/**
 * MeshTxBuilder is a lower level api for building transaction
 * @param {IFetcher} [fetcher] an optional parameter for fetching utxo
 * @param {ISubmitter} [submitter] an optional parameter for submitting transaction
 * @param {IEvaluator} [evaluator] an optional parameter for evaluating transaction
 * @param {boolean} [isHydra] an optional parameter for using hydra transaction building for configuring 0 fee in protocol parameters
 */
export class MeshTxBuilder extends MeshTxBuilderCore {
  private _fetcher?: IFetcher;
  private _submitter?: ISubmitter;
  private _evaluator?: IEvaluator;
  private queriedTxHashes: Set<string> = new Set();
  private queriedUTxOs: { [x: string]: UTxO[] } = {};

  constructor({
    fetcher,
    submitter,
    evaluator,
    isHydra = false,
  }: MeshTxBuilderOptions) {
    super();
    if (fetcher) this._fetcher = fetcher;
    if (submitter) this._submitter = submitter;
    if (evaluator) this._evaluator = evaluator;
    if (isHydra) this.isHydra = true;
  }

  /**
   * It builds the transaction and query the blockchain for missing information
   * @param customizedTx The optional customized transaction body
   * @returns The signed transaction in hex ready to submit / signed by client
   */
  complete = async (customizedTx?: MeshTxBuilderBody) => {
    const now = Date.now();
    if (customizedTx) {
      this.meshTxBuilderBody = customizedTx;
    } else {
      // Handle last items in queue
      this.queueAllLastItem();
    }

    // Getting all missing utxo information
    await this.queryAllTxInfo();

    const { inputs, collaterals } = this.meshTxBuilderBody;
    // Completing all inputs
    [...inputs, ...collaterals].forEach((txIn) => {
      this.completeTxInformation(txIn);
    });

    this.completeSync(customizedTx);

    // Evaluating the transaction
    if (this._evaluator) {
      const txEvaluation = await this._evaluator.evaluateTx(this.txHex);
      this.updateRedeemer(this.meshTxBuilderBody, txEvaluation);
      this.completeSync(customizedTx);
    }
    console.log('Tx building time', Date.now() - now);
    return this;
  };

  /**
   * Submit transactions to the blockchain using the fetcher instance
   * @param txHex The signed transaction in hex
   * @returns
   */
  submitTx = async (txHex: string): Promise<string | undefined> => {
    const txHash = await this._submitter?.submitTx(txHex);
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
      utxos = (await this._fetcher?.fetchUTxOs(txHash)) || [];
      this.queriedUTxOs[txHash] = utxos;
    }
  };

  private queryAllTxInfo = () => {
    const queryUTxOPromises: Promise<void>[] = [];
    const { inputs, collaterals } = this.meshTxBuilderBody;
    if (inputs.length + collaterals.length > 0 && !this._fetcher)
      throw Error(
        'Transaction information is incomplete while no fetcher instance is provided'
      );
    for (let i = 0; i < inputs.length; i++) {
      const currentTxIn = inputs[i];
      if (!currentTxIn.txIn.amount || !currentTxIn.txIn.address) {
        queryUTxOPromises.push(this.getUTxOInfo(currentTxIn.txIn.txHash));
      }
      if (
        currentTxIn.type === 'Script' &&
        currentTxIn.scriptTxIn.scriptSource?.type == 'Inline' &&
        currentTxIn.scriptTxIn.scriptSource.txInInfo &&
        !currentTxIn.scriptTxIn.scriptSource?.txInInfo.spendingScriptHash
      ) {
        const scriptRefTxHash =
          currentTxIn.scriptTxIn.scriptSource.txInInfo.txHash;
        queryUTxOPromises.push(this.getUTxOInfo(scriptRefTxHash));
      }
    }
    for (let i = 0; i < collaterals.length; i++) {
      const currentCollateral = collaterals[i];
      if (!currentCollateral.txIn.amount || !currentCollateral.txIn.address) {
        queryUTxOPromises.push(this.getUTxOInfo(currentCollateral.txIn.txHash));
      }
    }
    return Promise.all(queryUTxOPromises);
  };

  private completeTxInformation = (TxIn: TxIn) => {
    const utxos: UTxO[] = this.queriedUTxOs[TxIn.txIn.txHash];
    const utxo = utxos.find(
      (utxo) => utxo.input.outputIndex === TxIn.txIn.txIndex
    );
    const address = utxo?.output.address;
    const amount = utxo?.output.amount;
    if (!address || address === '' || !amount || amount.length === 0)
      throw Error(
        `Couldn't find information for ${TxIn.txIn.txHash}#${TxIn.txIn.txIndex}`
      );
    TxIn.txIn.address = address;
    TxIn.txIn.amount = amount;

    if (
      TxIn.type === 'Script' &&
      TxIn.scriptTxIn.scriptSource?.type == 'Inline'
    ) {
      const scriptSourceInfo = TxIn.scriptTxIn.scriptSource
        .txInInfo as ScriptSourceInfo;
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
