import { IEvaluator, IFetcher, ISubmitter } from '@mesh/common/contracts';
import { csl } from '@mesh/core';
import { toValue } from '@mesh/common/utils';
import { Asset, Data } from '@mesh/common/types';
import { QueuedTxIn, _MeshTxBuilder } from './_meshTxBuilder';
import { MaestroProvider } from '@mesh/providers';

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
    if (!this.addingScriptInput && address && amount) {
      this._txIn(txHash, txIndex, amount, address);
      return this;
    }
    if (this.addingScriptInput && amount) {
      this._txIn(txHash, txIndex, amount);
      return this;
    }
    if (!this.addingScriptInput) {
      this.txInQueue.push({ type: 'PubKey', txIn: { txHash, txIndex } });
    } else {
      this.txInQueueItem = { type: 'Script', txIn: { txHash, txIndex } };
      this.scriptInput.txHash = txHash;
      this.scriptInput.txIndex = txIndex;
      this.scriptInput.input = csl.TransactionInput.new(
        csl.TransactionHash.from_hex(txHash),
        txIndex
      );
      // Only value to be queried from chain
    }
    return this;
  };

  /**
   * Set the input datum for transaction
   * @param {Data} datum The datum in object format
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  txInDatumValue = (datum: Data): MeshTxBuilder => {
    return this;
  };

  /**
   * Tell the transaction builder that the input UTxO has inlined datum
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  txInInlineDatumPresent = (): MeshTxBuilder => {
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
  txInCollateral = (txHash: string, txIndex: number): MeshTxBuilder => {
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
    // Get all necessary info first
    this.addingScriptInput = false;
    const allPromises: Promise<{
      address: string;
      amount: Asset[];
    }>[] = [];
    this.txInQueue.forEach((item) => {
      const {
        txIn: { txHash, txIndex },
      } = item as QueuedTxIn;
      allPromises.push(this.getUTxOInfo(txHash, txIndex));
    });

    const indexResult = await Promise.all(allPromises);

    for (let i = 0; i < this.txInQueue.length; i++) {
      const {
        type,
        txIn: { txHash, txIndex },
      } = this.txInQueue[i] as QueuedTxIn;
      const { address, amount } = indexResult[i];

      if (type === 'PubKey') {
        this._txIn(txHash, txIndex, amount, address);
      }
      if (type === 'Script') {
        this.scriptInputs.forEach((input) => {
          if (input.txHash === txHash && input.txIndex === txIndex) {
            input.value = toValue(amount);
          }
        });
      }
    }

    if (this.txOutput) {
      this.txBuilder.add_output(this.txOutput);
    }
    this.addScriptInputs();
    this.txBuilder.set_inputs(this.txInputsBuilder);
    this.addPlutusMints();
    this.txBuilder.set_mint_builder(this.plutusMintBuilder);

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

  signingKey = (skey: string, vkey: string) => {
    this._signingKey(skey, vkey);
    return this.txHex;
  };

  /**
   *
   * @param txHash
   * @param txIndex
   */
  private getUTxOInfo = async (
    txHash: string,
    txIndex: number
  ): Promise<{ address: string; amount: Asset[] }> => {
    // TODO: To implement
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
