import { IEvaluator, IFetcher, ISubmitter } from '@mesh/common/contracts';
import { csl } from '@mesh/core';
import { toValue } from '@mesh/common/utils';
import { Asset, Data } from '@mesh/common/types';
import { _MeshTxBuilder } from './_meshTxBuilder';

// Delay action at complete
// 1. Query blockchain for any missing information
// 2. Redeemer indexes for spending and minting

/**
 * MeshTxBuilder is a lower level api for building transaction
 * @param {IFetcher} [fetcher] an optional parameter for fetching utxo
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

  constructor({ fetcher, submitter, evaluator }: MeshTxBuilderOptions) {
    super();
    if (fetcher) this._fetcher = fetcher;
    if (submitter) this._submitter = submitter;
    if (evaluator) this._evaluator = evaluator;
  }

  /**
   * Set the input for transaction
   * @param txHash The transaction hash of the input UTxO
   * @param txIndex The transaction index of the input UTxO
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  txIn = (
    txHash: string,
    txIndex: number,
    amount?: Asset[],
    address?: string
  ): MeshTxBuilder => {
    // It has to query blockchain for value and datum
    this._txIn(txHash, txIndex, amount, address);
    return this;
  };

  /**
   * Set the input datum for transaction
   * @param {Data} datum The datum in object format
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  txInDatumValue = (datum: Data): MeshTxBuilder => {
    this._txInDatumValue(datum);
    return this;
  };

  /**
   * Tell the transaction builder that the input UTxO has inlined datum
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  txInInlineDatumPresent = (): MeshTxBuilder => {
    this._txInInlineDatumPresent;
    return this;
  };

  /**
   * Set the output for transaction
   * @param {string} address The recipient of the output
   * @param {Asset[]} amount The amount of other native assets attached with UTxO
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  txOut = (address: string, amount: Asset[]): MeshTxBuilder => {
    this._txOut(address, amount);
    return this;
  };

  /**
   * Set the output datum hash for transaction
   * @param {Data} datum The datum in object format
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  txOutDatumHashValue = (datum: Data): MeshTxBuilder => {
    this._txOutDatumHashValue(datum);
    return this;
  };

  /**
   * Set the output inline datum for transaction
   * @param {Data} datum The datum in object format
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  txOutInlineDatumValue = (datum: Data): MeshTxBuilder => {
    this._txOutInlineDatumValue(datum);
    return this;
  };

  /**
   * Set the reference script to be attached with the output
   * @param scriptCbor The CBOR hex of the script to be attached to UTxO as reference script
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  txOutReferenceScript = (scriptCbor: string): MeshTxBuilder => {
    this._txOutReferenceScript(scriptCbor);
    return this;
  };

  /**
   * Set the instruction that it is currently using V2 Plutus spending scripts
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  spendingPlutusScriptV2 = (): MeshTxBuilder => {
    // This flag should signal a start to a script input
    // The next step after will be to add a tx-in
    // After which, we will REQUIRE, script, datum and redeemer info
    // for unlocking this particular input
    this._spendingPlutusScriptV2();
    return this;
  };

  /**
   * Set the reference input where it would also be spent in the transaction
   * @param txHash The transaction hash of the reference UTxO
   * @param txIndex The transaction index of the reference UTxO
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  spendingTxInReference = (
    txHash: string,
    txIndex: number,
    spendingScriptHash?: string
  ): MeshTxBuilder => {
    // This should point to a UTxO that contains the script (inlined) we're trying to
    // unlock from
    if (spendingScriptHash) {
      this._spendingTxInReference(txHash, txIndex, spendingScriptHash);
    }
    return this;
  };

  /**
   * Set the instruction that the reference input has inline datum
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  spendingReferenceTxInInlineDatumPresent = (): MeshTxBuilder => {
    // Signal that the tx-in has inlined datum present
    this._spendingReferenceTxInInlineDatumPresent();
    return this;
  };

  /**
   * Set the redeemer for the reference input to be spent in same transaction
   * @param redeemer The redeemer in object format
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  spendingReferenceTxInRedeemerValue = (redeemer: Data): MeshTxBuilder => {
    this._spendingReferenceTxInRedeemerValue(redeemer);
    return this;
  };

  /**
   * Specify a read only reference input. This reference input is not witnessing anything it is simply provided in the plutus script context.
   * @param txHash The transaction hash of the reference UTxO
   * @param txIndex The transaction index of the reference UTxO
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  readOnlyTxInReference = (txHash: string, txIndex: number): MeshTxBuilder => {
    this._readOnlyTxInReference(txHash, txIndex);
    return this;
  };

  /**
   * Set the instruction that it is currently using V2 Plutus minting scripts
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  mintPlutusScriptV2 = (): MeshTxBuilder => {
    this._mintPlutusScriptV2();
    return this;
  };

  /**
   * Set the minting value of transaction
   * @param quantity The quantity of asset to be minted
   * @param policy The policy id of the asset to be minted
   * @param name The hex of token name of the asset to be minted
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  mint = (quantity: number, policy: string, name: string): MeshTxBuilder => {
    this._mint(quantity, policy, name);
    return this;
  };

    /**
   * Set the minting script of current mint
   * @param scriptCBOR The CBOR hex of the minting policy script
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  mintingScript = (scriptCBOR: string): MeshTxBuilder => {
    this._mintingScript(scriptCBOR);
    return this;
  }

  mintRedeemerValue = (redeemer: Data): MeshTxBuilder => {
    this._mintReferenceTxInRedeemerValue(redeemer);
    return this;
  };

  /**
   *
   * @param txHash The transaction hash of the UTxO
   * @param txIndex The transaction index of the UTxO
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  mintTxInReference = (txHash: string, txIndex: number): MeshTxBuilder => {
    this._mintTxInReference(txHash, txIndex);
    return this;
  };

  /**
   *
   * @param redeemer The redeemer in object format
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  mintReferenceTxInRedeemerValue = (redeemer: Data): MeshTxBuilder => {
    this._mintReferenceTxInRedeemerValue(redeemer);
    return this;
  };

  /**
   *
   * @param policyId The policy id of the asset to be minted
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  policyId = (policyId: string): MeshTxBuilder => {
    return this;
  };

  /**
   * Set the required signer of the transaction
   * @param pubKeyHash The PubKeyHash of the required signer
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  requiredSignerHash = (pubKeyHash: string): MeshTxBuilder => {
    this._requiredSignerHash(pubKeyHash);
    return this;
  };

  /**
   * Set the collateral UTxO for the transaction
   * @param txHash The transaction hash of the collateral UTxO
   * @param txIndex The transaction index of the collateral UTxO
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  txInCollateral = (txHash: string, txIndex: number, amount?: Asset[], address?: string): MeshTxBuilder => {
    this._txInCollateral(txHash, txIndex, amount, address);
    return this;
  };

  /**
   * Configure the address to accept change UTxO
   * @param addr The address to accept change UTxO
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  changeAddress = (addr: string): MeshTxBuilder => {
    this._changeAddress(addr);
    return this;
  };

  /**
   * Set the transaction valid interval to be valid only after the slot
   * @param slot The transaction is valid only after this slot
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  invalidBefore = (slot: number): MeshTxBuilder => {
    this._invalidBefore(slot);
    return this;
  };

  /**
   * Set the transaction valid interval to be valid only before the slot
   * @param slot The transaction is valid only before this slot
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  invalidHereafter = (slot: number): MeshTxBuilder => {
    this._invalidHereafter(slot);
    return this;
  };

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
    for (let i = 0; i < this.txInQueue.length; i++) {
      const currentTxIn = this.txInQueue[i];
      if (!currentTxIn.txIn.amount || !currentTxIn.txIn.address) {
        const { address, amount } = await this.getUTxOInfo(currentTxIn.txIn.txHash, currentTxIn.txIn.txIndex);
        if (address === '' || amount.length === 0) throw Error(`Couldn't find information for ${currentTxIn.txIn.txHash}#${currentTxIn.txIn.txIndex}`);
        currentTxIn.txIn.address = address;
        currentTxIn.txIn.amount = amount;
      }
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
        if (currentTxIn.scriptTxIn && currentTxIn.scriptTxIn.datumSource && currentTxIn.scriptTxIn.redeemer && currentTxIn.scriptTxIn.scriptSource) {
          this.txBuilder.add_plutus_script_input(
            csl.PlutusWitness.new_with_ref(
              currentTxIn.scriptTxIn.scriptSource,
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
      const currentCollateral = this.collateralQueue[i];
      if (!currentCollateral.txIn.amount || !currentCollateral.txIn.address) {
        const { address, amount } = await this.getUTxOInfo(currentCollateral.txIn.txHash, currentCollateral.txIn.txIndex);
        if (address === '' || amount.length === 0) throw Error(`Couldn't find information for ${currentCollateral.txIn.txHash}#${currentCollateral.txIn.txIndex}`);
        currentCollateral.txIn.address = address;
        currentCollateral.txIn.amount = amount;
      }
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
      this.queueMint()
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

  signingKey = (skey: string, vkey: string): MeshTxBuilder => {
    this._signingKey(skey, vkey);
    return this;
  };

  completeSigning = (): string => {
    return this._completeSigning();
  };

  submitTx = async (txHex: string): Promise<string> => {
    const txHash = this._submitter?.submitTx(txHex);
    return txHash ? txHash : '';
  }

  /**
   *
   * @param txHash
   * @param txIndex
   */
  private getUTxOInfo = async (
    txHash: string,
    txIndex: number
  ): Promise<{ address: string; amount: Asset[] }> => {
    const utxos = await this._fetcher?.fetchUTxOs(txHash);
    const utxo = utxos?.find((utxo) => utxo.input.outputIndex === txIndex);
    return {
      address: utxo?.output.address || '',
      amount: utxo?.output.amount || [],
    };
  };

  mainnet = (): MeshTxBuilder => {
    return this;
  };

  testnetMagic = (natural: number): MeshTxBuilder => {
    return this;
  };

  byronEra = (): MeshTxBuilder => {
    return this;
  };

  shelleyEra = (): MeshTxBuilder => {
    return this;
  };

  allegraEra = (): MeshTxBuilder => {
    return this;
  };

  maryEra = (): MeshTxBuilder => {
    return this;
  };

  alonzoEra = (): MeshTxBuilder => {
    return this;
  };

  babbageEra = (): MeshTxBuilder => {
    return this;
  };

  protocolParams = (params: any): MeshTxBuilder => {
    return this;
  };
}
