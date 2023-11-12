import { IEvaluator, IFetcher, ISubmitter } from '@mesh/common/contracts';
import { csl } from '@mesh/core';
import { toValue } from '@mesh/common/utils';
import { UTxO } from '@mesh/common/types';
import { QueuedTxIn, ScriptSourceInfo, _MeshTxBuilder } from './_meshTxBuilder';

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

export class MeshTxBuilder extends _MeshTxBuilder {
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

  complete = async () => {
    // Handle tx outputs
    if (this.txOutput) {
      this.txBuilder.add_output(this.txOutput);
      this.txOutput = undefined;
    }
    // Handle all transaction inputs in queue
    if (this.txInQueueItem) {
      this.queueInput();
    }

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

    await Promise.all(queryUTxOPromises);

    for (let i = 0; i < this.txInQueue.length; i++) {
      const currentTxIn: any = this.txInQueue[i]; //TODO: add type
      this.completeTxInformation(currentTxIn);
      if (currentTxIn.type === 'PubKey') {
        this.txBuilder.add_input(
          csl.Address.from_bech32(currentTxIn.txIn.address),
          csl.TransactionInput.new(
            csl.TransactionHash.from_hex(currentTxIn.txIn.txHash),
            currentTxIn.txIn.txIndex
          ),
          toValue(currentTxIn.txIn.amount)
        );
      } else if (currentTxIn.type === 'Script') {
        const scriptSourceInfo = currentTxIn.scriptTxIn.scriptSource;
        const scriptSource = this.makePlutusScriptSource(scriptSourceInfo);
        if (
          currentTxIn.scriptTxIn &&
          currentTxIn.scriptTxIn.datumSource &&
          currentTxIn.scriptTxIn.redeemer &&
          scriptSource
        ) {
          this.txBuilder.add_plutus_script_input(
            csl.PlutusWitness.new_with_ref(
              scriptSource,
              currentTxIn.scriptTxIn.datumSource,
              currentTxIn.scriptTxIn.redeemer
            ),
            csl.TransactionInput.new(
              csl.TransactionHash.from_hex(currentTxIn.txIn.txHash),
              currentTxIn.txIn.txIndex
            ),
            toValue(currentTxIn.txIn.amount)
          );
        }
      }
    }
    // Handle collateral
    if (this.collateralQueueItem) {
      this.collateralQueue.push(this.collateralQueueItem);
    }

    for (let i = 0; i < this.collateralQueue.length; i++) {
      const currentCollateral: any = this.collateralQueue[i]; //TODO: add type
      this.completeTxInformation(currentCollateral);
      this.collateralBuilder.add_input(
        csl.Address.from_bech32(currentCollateral.txIn.address),
        csl.TransactionInput.new(
          csl.TransactionHash.from_hex(currentCollateral.txIn.txHash),
          currentCollateral.txIn.txIndex
        ),
        toValue(currentCollateral.txIn.amount)
      );
    }
    this.txBuilder.set_collateral(this.collateralBuilder);

    // Handle mints
    if (this.mintItem) {
      this.queueMint();
    }
    // Hackey solution to get mint indexes correct
    this.mintQueue.sort((a, b) =>
      a.policyId.to_hex().localeCompare(b.policyId.to_hex())
    );
    for (let i = 0; i < this.mintQueue.length; i++) {
      const mintItem = this.mintQueue[i];
      if (mintItem.type === 'Plutus') {
        if (!mintItem.redeemer)
          throw Error('Missing mint redeemer information');
        if (!mintItem.plutusScript)
          throw Error('Mint script is expected to be a plutus script');
        const newRedeemer: csl.Redeemer = csl.Redeemer.new(
          csl.RedeemerTag.new_mint(),
          csl.BigNum.from_str(String(i)),
          mintItem.redeemer.data(),
          mintItem.redeemer.ex_units()
        );
        this.mintBuilder.add_asset(
          csl.MintWitness.new_plutus_script(mintItem.plutusScript, newRedeemer),
          mintItem.assetName,
          csl.Int.new_i32(mintItem.amount)
        );
      } else if (mintItem.type === 'Native') {
        if (!mintItem.nativeScript)
          throw Error('Mint script is expected to be native script');
        this.mintBuilder.add_asset(
          csl.MintWitness.new_native_script(mintItem.nativeScript),
          mintItem.assetName,
          csl.Int.new_i32(mintItem.amount)
        );
      }
    }
    this.txBuilder.set_mint_builder(this.mintBuilder);

    // TODO: add collateral return

    // TODO: Any balancing action
    // TODO: Calculate execution units and rebuild the transaction

    this.txBuilder.calc_script_data_hash(
      csl.TxBuilderConstants.plutus_vasil_cost_models()
    );
    if (this.builderChangeAddress) {
      this.txBuilder.add_change_if_needed(this.builderChangeAddress);
    }
    this.txHex = this.txBuilder.build_tx().to_hex();
    return this;
  };

  submitTx = async (txHex: string): Promise<string> => {
    const txHash = this._submitter?.submitTx(txHex);
    return txHash ? txHash : '';
  };

  /**
   * Get the UTxO information from the blockchain
   * @param TxHash The queuedTxIn object that contains the txHash and txIndex, while missing amount and address information
   */
  private getUTxOInfo = async (txHash: string): Promise<void> => {
    console.log('Start', Date.now());

    let utxos: UTxO[] = [];
    if (!this.queriedTxHashes.has(txHash)) {
      console.log('Query');
      this.queriedTxHashes.add(txHash);
      utxos = (await this._fetcher?.fetchUTxOs(txHash)) || [];
      this.queriedUTxOs[txHash] = utxos;
    }
    console.log('End', Date.now());
  };

  private completeTxInformation = (queuedTxIn: QueuedTxIn) => {
    console.log('All queries', this.queriedUTxOs);
    console.log('Current', queuedTxIn.txIn.txHash, queuedTxIn.txIn.txIndex);

    const utxos: UTxO[] = this.queriedUTxOs[queuedTxIn.txIn.txHash];
    console.log('utxos', utxos);
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
