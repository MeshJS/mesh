import { IFetcher } from '@mesh/common/contracts';
import { csl } from '@mesh/core';
import { buildTxBuilder, toValue } from '@mesh/common/utils';
import { Asset, Data } from '@mesh/common/types';
import { DEFAULT_REDEEMER_BUDGET } from '@mesh/common/constants';
import {
  ScriptInputBuilder,
  TempRedeemer,
  _MeshTxBuilder,
} from './_meshTxBuilder';

// Delay action at complete
// 1. Query blockchain for any missing information
// 2. Redeemer indexes for spending and minting

/**
 * MeshTxBuilder is a lower level api for building transaction
 * @param {IFetcher} [fetcher] an optional parameter for fetching utxo
 */
export class MeshTxBuilder extends _MeshTxBuilder {
  private _fetcher?: IFetcher;
  txBuilder: csl.TransactionBuilder = buildTxBuilder();
  txInputsBuilder: csl.TxInputsBuilder = csl.TxInputsBuilder.new();
  addingScriptInput = false;

  constructor(fetcher?: IFetcher) {
    super();
    if (fetcher) this._fetcher = fetcher;
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
    amount: Asset[],
    address?: string
  ): MeshTxBuilder => {
    // It has to query blockchain for value and datum
    if (!this.addingScriptInput && address) {
      this.txInputsBuilder.add_input(
        csl.Address.from_bech32(address),
        csl.TransactionInput.new(csl.TransactionHash.from_hex(txHash), txIndex),
        toValue(amount)
      );
    } else {
      this.scriptInput.txHash = txHash;
      this.scriptInput.txIndex = txIndex;
      this.scriptInput.input = csl.TransactionInput.new(
        csl.TransactionHash.from_hex(txHash),
        txIndex
      );
      this.scriptInput.value = toValue(amount);
    }
    return this;
    // wasmTxInputsBuilder.add_plutus_script_input(recordPlutusScriptWitness, recordTransactionInput, recordUTxOValue);
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
    const { txHash, txIndex } = this.scriptInput;
    if (txHash && txIndex) {
      const refTxIn = csl.TransactionInput.new(
        csl.TransactionHash.from_hex(txHash),
        txIndex
      );
      this.scriptInput.datum = csl.DatumSource.new_ref_input(refTxIn);
    }
    return this;
  };

  /**
   * Set the output for transaction
   * @param {string} address The recipient of the output
   * @param {Asset[]} amount The amount of other native assets attached with UTxO
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  txOut = (address: string, amount: Asset[]): MeshTxBuilder => {
    if (this.txOutput) {
      this.txBuilder.add_output(this.txOutput);
    }
    const txValue = toValue(amount);
    this.txOutput = csl.TransactionOutput.new(
      csl.Address.from_bech32(address),
      txValue
    );

    this.txBuilder.add_output(this.txOutput);
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
    this.txOutput?.set_plutus_data(
      csl.encode_json_str_to_plutus_datum(
        JSON.stringify(datum),
        csl.PlutusDatumSchema.DetailedSchema
      )
    );
    return this;
  };

  /**
   * Set the reference script to be attached with the output
   * @param scriptCbor The CBOR hex of the script to be attached to UTxO as reference script
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  txOutReferenceScript = (scriptCbor: string): MeshTxBuilder => {
    this.txOutput?.set_script_ref(
      csl.ScriptRef.new_plutus_script(csl.PlutusScript.from_hex(scriptCbor))
    );
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
    this.addingScriptInput = true;
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
    spendingScriptHash: string
  ): MeshTxBuilder => {
    // This should point to a UTxO that contains the script (inlined) we're trying to
    // unlock from
    const scriptHash = csl.ScriptHash.from_hex(spendingScriptHash);
    const scriptRefInput = csl.TransactionInput.new(
      csl.TransactionHash.from_hex(txHash),
      txIndex
    );
    this.scriptInput.script =
      csl.PlutusScriptSource.new_ref_input_with_lang_ver(
        scriptHash,
        scriptRefInput,
        csl.Language.new_plutus_v2()
      );
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
    return this;
  };

  /**
   * Set the instruction that it is currently using V2 Plutus minting scripts
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  mintPlutusScriptV2 = (): MeshTxBuilder => {
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
    return this;
  };

  /**
   *
   * @param txHash The transaction hash of the UTxO
   * @param txIndex The transaction index of the UTxO
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  mintTxInReference = (txHash: string, txIndex: number): MeshTxBuilder => {
    return this;
  };

  /**
   *
   * @param redeemer The redeemer in object format
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  mintReferenceTxInRedeemerValue = (redeemer: Data): MeshTxBuilder => {
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
    this.changeAddress(addr);
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

  complete = () => {
    // Calculate execution units and rebuild the transaction
    if (this.txOutput) this.txBuilder.add_output(this.txOutput);
    this.addScriptInputs();
    this.txBuilder.set_inputs(this.txInputsBuilder);
    this.addPlutusMints();
    this.txBuilder.set_mint_builder(this.plutusMintBuilder);
    return this.txBuilder;
  };

  /**
   *
   * @param txHash
   * @param txIndex
   */
  private getUTxOInfo = async (txHash: string, txIndex: number) => {
    // TODO: To implement
    const txInfo = await this._fetcher?.fetchAddressUTxOs(txHash);
    return { address: '', amount: [] };
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
