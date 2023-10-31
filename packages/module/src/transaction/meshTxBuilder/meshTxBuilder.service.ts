import { IFetcher } from '@mesh/common/contracts';
import csl from '@emurgo/cardano-serialization-lib-nodejs';
import { buildTxBuilder } from '@mesh/common/utils';
import { Asset, Data } from '@mesh/common/types';

/**
 * MeshTxBuilder is a lower level api for building transaction
 * @param {IFetcher} [fetcher] an optional parameter for fetching utxo
 */
export class MeshTxBuilder {
  private _fetcher?: IFetcher;
  txBuilder: csl.TransactionBuilder = buildTxBuilder();

  constructor(fetcher?: IFetcher) {
    if (fetcher) this._fetcher = fetcher;
  }

  /**
   * Set the input for transaction
   * @param txHash The transaction hash of the input UTxO
   * @param txIndex The transaction index of the input UTxO
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  txIn = (txHash: string, txIndex: number): MeshTxBuilder => {
    // It has to query blockchain for value and datum
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
   * @param {number} lovelace The amount of lovelace attached with UTxO
   * @param {Asset[]} amount The amount of other native assets attached with UTxO
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  txOut = (
    address: string,
    lovelace: number,
    amount: Asset[]
  ): MeshTxBuilder => {
    return this;
  };

  /**
   * Set the output datum for transaction
   * @param {Data} datum The datum in object format
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  txOutDatumValue = (datum: Data): MeshTxBuilder => {
    // Add type support for datum
    return this;
  };

  /**
   * Set the instruction that it is currently using V2 Plutus spending scripts
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  spendingPlutusScriptV2 = (): MeshTxBuilder => {
    return this;
  };

  /**
   * Set the reference input where it would also be spent in the transaction
   * @param txHash The transaction hash of the reference UTxO
   * @param txIndex The transaction index of the reference UTxO
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  spendingTxInReference = (txHash: string, txIndex: number): MeshTxBuilder => {
    return this;
  };

  /**
   * Set the instruction that the reference input has inline datum
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  spendingReferenceTxInInlineDatumPresent = (): MeshTxBuilder => {
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
   * Set the reference input for read only purpose
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
    return this;
  };

  /**
   * Set the transaction valid interval to be valid only after the slot
   * @param slot The transaction is valid only after this slot
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  invalidBefore = (slot: number): MeshTxBuilder => {
    return this;
  };

  /**
   * Set the transaction valid interval to be valid only before the slot
   * @param slot The transaction is valid only before this slot
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  invalidHereafter = (slot: number): MeshTxBuilder => {
    return this;
  };

  complete = () => {
    // Calculate execution units and rebuild the transaction
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
    return;
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
