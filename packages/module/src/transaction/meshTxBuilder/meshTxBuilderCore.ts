import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_REDEEMER_BUDGET,
} from '@mesh/common/constants';
import { Asset, Budget, Data, Protocol } from '@mesh/common/types';
import { buildTxBuilder, toValue, toPlutusData } from '@mesh/common/utils';
import { csl } from '@mesh/core';
import {
  MintItem,
  TxIn,
  ScriptSourceInfo,
  RequiredWith,
  PubKeyTxIn,
  ScriptTxIn,
  MeshTxBuilderBody,
  RefTxIn,
  Output,
  ValidityRange,
  Metadata,
} from './type';

export class MeshTxBuilderCore {
  txHex = '';
  txBuilder: csl.TransactionBuilder = buildTxBuilder();
  private mintBuilder: csl.MintBuilder = csl.MintBuilder.new();
  private collateralBuilder: csl.TxInputsBuilder = csl.TxInputsBuilder.new();
  private txOutput?: Output;
  private addingScriptInput = false;
  private addingPlutusMint = false;
  protected isHydra = false;

  meshTxBuilderBody: MeshTxBuilderBody = {
    inputs: [],
    outputs: [],
    collaterals: [],
    requiredSignatures: [],
    referenceInputs: [],
    mints: [],
    changeAddress: '',
    metadata: [],
    validityRange: {},
    signingKey: [],
  };

  protected mintItem?: MintItem;

  protected txInQueueItem?: TxIn;

  protected collateralQueueItem?: PubKeyTxIn;

  protected refScriptTxInQueueItem?: RefTxIn;

  /**
   * Synchronous functions here
   */

  /**
   * It builds the transaction without dependencies
   * @param customizedTx The optional customized transaction body
   * @returns The signed transaction in hex ready to submit / signed by client
   */
  completeSync = (customizedTx?: MeshTxBuilderBody) => {
    if (customizedTx) {
      this.meshTxBuilderBody = customizedTx;
    }
    return this.serializeTxBody(this.meshTxBuilderBody);
  };

  serializeTxBody = (txBody: MeshTxBuilderBody) => {
    const {
      inputs,
      outputs,
      collaterals,
      referenceInputs,
      mints,
      changeAddress,
      validityRange,
      requiredSignatures,
      metadata,
      signingKey,
    } = txBody;

    if (this.isHydra) {
      this.protocolParams({
        minFeeA: 0,
        minFeeB: 0,
        priceMem: 0,
        priceStep: 0,
        collateralPercent: 0,
        coinsPerUTxOSize: '0',
      });
    }

    this.addAllInputs(inputs);
    this.addAllOutputs(outputs);
    this.addAllCollaterals(collaterals);
    this.addAllReferenceInputs(referenceInputs);
    // Adding minting values
    // Hacky solution to get mint indexes correct
    // TODO: Remove after csl update
    this.meshTxBuilderBody.mints.sort((a, b) =>
      a.policyId.localeCompare(b.policyId)
    );
    this.addAllMints(mints);
    this.addValidityRange(validityRange);
    this.addAllRequiredSignatures(requiredSignatures);
    this.addAllMetadata(metadata);

    // TODO: add collateral return
    // TODO: Calculate execution units and rebuild the transaction

    this.addCostModels();

    if (changeAddress) {
      this.addChange(changeAddress);
    }

    this.buildTx();
    if (signingKey.length > 0) {
      this.addAllSigningKeys(signingKey);
    }

    return this.txHex;
  };

  /**
   * Set the input for transaction
   * @param txHash The transaction hash of the input UTxO
   * @param txIndex The transaction index of the input UTxO
   * @param amount The asset amount of index of the input UTxO
   * @param address The address of the input UTxO
   * @returns The MeshTxBuilder instance
   */
  txIn = (
    txHash: string,
    txIndex: number,
    amount?: Asset[],
    address?: string
  ) => {
    if (this.txInQueueItem) {
      this.queueInput();
    }
    if (!this.addingScriptInput) {
      this.txInQueueItem = {
        type: 'PubKey',
        txIn: {
          txHash: txHash,
          txIndex: txIndex,
          amount: amount,
          address: address,
        },
      };
    } else {
      this.txInQueueItem = {
        type: 'Script',
        txIn: {
          txHash: txHash,
          txIndex: txIndex,
          amount: amount,
          address: address,
        },
        scriptTxIn: {},
      };
    }
    this.addingScriptInput = false;
    return this;
  };

  /**
   * Set the input datum for transaction
   * @param {Data} datum The datum in object format
   * @returns The MeshTxBuilder instance
   */
  txInDatumValue = (datum: Data) => {
    if (!this.txInQueueItem) throw Error('Undefined input');
    if (this.txInQueueItem.type === 'PubKey')
      throw Error('Datum value attempted to be called a non script input');
    this.txInQueueItem.scriptTxIn.datumSource = {
      type: 'Provided',
      data: datum,
    };
    return this;
  };

  /**
   * Tell the transaction builder that the input UTxO has inlined datum
   * @returns The MeshTxBuilder instance
   */
  txInInlineDatumPresent = () => {
    if (!this.txInQueueItem) throw Error('Undefined input');
    if (this.txInQueueItem.type === 'PubKey')
      throw Error(
        'Inline datum present attempted to be called a non script input'
      );
    const { txHash, txIndex } = this.txInQueueItem.txIn;
    if (txHash && txIndex.toString()) {
      this.txInQueueItem.scriptTxIn.datumSource = {
        type: 'Inline',
        txHash,
        txIndex,
      };
    }
    return this;
  };

  /**
   * Set the reference input where it would also be spent in the transaction
   * @param txHash The transaction hash of the reference UTxO
   * @param txIndex The transaction index of the reference UTxO
   * @param spendingScriptHash The script hash of the spending script
   * @returns The MeshTxBuilder instance
   */
  simpleScriptTxInReference = (
    txHash: string,
    txIndex: number,
    spendingScriptHash?: string
  ) => {
    if (!this.txInQueueItem) throw Error('Undefined input');
    if (this.txInQueueItem.type === 'PubKey')
      throw Error(
        'Spending tx in reference attempted to be called a non script input'
      );
    this.txInQueueItem.scriptTxIn.scriptSource = {
      txHash,
      txIndex,
      spendingScriptHash,
    };
    return this;
  };

  /**
   * Set the redeemer for the reference input to be spent in same transaction
   * @param redeemer The redeemer in object format
   * @param exUnits The execution units budget for the redeemer
   * @returns The MeshTxBuilder instance
   */
  txInRedeemerValue = (redeemer: Data, exUnits = DEFAULT_REDEEMER_BUDGET) => {
    if (!this.txInQueueItem) throw Error('Undefined input');
    if (this.txInQueueItem.type === 'PubKey')
      throw Error(
        'Spending tx in reference redeemer attempted to be called a non script input'
      );
    this.txInQueueItem.scriptTxIn.redeemer = {
      data: redeemer,
      exUnits,
    };
    return this;
  };

  /**
   * Set the output for transaction
   * @param {string} address The recipient of the output
   * @param {Asset[]} amount The amount of other native assets attached with UTxO
   * @returns The MeshTxBuilder instance
   */
  txOut = (address: string, amount: Asset[]) => {
    if (this.txOutput) {
      this.meshTxBuilderBody.outputs.push(this.txOutput);
      this.txOutput = undefined;
    }
    this.txOutput = {
      address,
      amount,
    };
    return this;
  };

  /**
   * Set the output datum hash for transaction
   * @param {Data} datum The datum in object format
   * @returns The MeshTxBuilder instance
   */
  txOutDatumHashValue = (datum: Data) => {
    if (this.txOutput) {
      this.txOutput.datum = {
        type: 'Hash',
        data: datum,
      };
    }
    return this;
  };

  /**
   * Set the output inline datum for transaction
   * @param {Data} datum The datum in object format
   * @returns The MeshTxBuilder instance
   */
  txOutInlineDatumValue = (datum: Data) => {
    if (this.txOutput) {
      this.txOutput.datum = {
        type: 'Inline',
        data: datum,
      };
    }
    return this;
  };

  /**
   * Set the reference script to be attached with the output
   * @param scriptCbor The CBOR hex of the script to be attached to UTxO as reference script
   * @returns The MeshTxBuilder instance
   */
  txOutReferenceScript = (scriptCbor: string) => {
    if (this.txOutput) {
      this.txOutput.referenceScript = scriptCbor;
    }
    return this;
  };

  /**
   * Set the instruction that it is currently using V2 Plutus spending scripts
   * @returns The MeshTxBuilder instance
   */
  spendingPlutusScriptV2 = () => {
    // This flag should signal a start to a script input
    // The next step after will be to add a tx-in
    // After which, we will REQUIRE, script, datum and redeemer info
    // for unlocking this particular input
    this.addingScriptInput = true;
    return this;
  };

  /**
   * [Alias of simpleScriptTxInReference] Set the reference input where it would also be spent in the transaction
   * @param txHash The transaction hash of the reference UTxO
   * @param txIndex The transaction index of the reference UTxO
   * @param spendingScriptHash The script hash of the spending script
   * @returns The MeshTxBuilder instance
   */
  spendingTxInReference = (
    txHash: string,
    txIndex: number,
    spendingScriptHash?: string
  ) => {
    this.simpleScriptTxInReference(txHash, txIndex, spendingScriptHash);
    return this;
  };

  /**
   * [Alias of txInInlineDatumPresent] Set the instruction that the reference input has inline datum
   * @returns The MeshTxBuilder instance
   */
  // Unsure how this is different from the --tx-in-inline-datum-present flag
  // It seems to just be different based on if the script is a reference input
  spendingReferenceTxInInlineDatumPresent = () => {
    this.txInInlineDatumPresent();
    return this;
  };

  /**
   * [Alias of txInRedeemerValue] Set the redeemer for the reference input to be spent in same transaction
   * @param redeemer The redeemer in object format
   * @param exUnits The execution units budget for the redeemer
   * @returns The MeshTxBuilder instance
   */
  spendingReferenceTxInRedeemerValue = (
    redeemer: Data,
    exUnits = DEFAULT_REDEEMER_BUDGET
  ) => {
    this.txInRedeemerValue(redeemer, exUnits);
    return this;
  };

  /**
   * Specify a read only reference input. This reference input is not witnessing anything it is simply provided in the plutus script context.
   * @param txHash The transaction hash of the reference UTxO
   * @param txIndex The transaction index of the reference UTxO
   * @returns The MeshTxBuilder instance
   */
  readOnlyTxInReference = (txHash: string, txIndex: number) => {
    this.meshTxBuilderBody.referenceInputs.push({ txHash, txIndex });
    return this;
  };

  /**
   * Set the instruction that it is currently using V2 Plutus minting scripts
   * @returns The MeshTxBuilder instance
   */
  mintPlutusScriptV2 = () => {
    this.addingPlutusMint = true;
    return this;
  };

  /**
   * Set the minting value of transaction
   * @param quantity The quantity of asset to be minted
   * @param policy The policy id of the asset to be minted
   * @param name The hex of token name of the asset to be minted
   * @returns The MeshTxBuilder instance
   */
  mint = (quantity: number, policy: string, name: string) => {
    if (this.mintItem) {
      this.queueMint();
    }
    this.mintItem = {
      type: this.addingPlutusMint ? 'Plutus' : 'Native',
      policyId: policy,
      assetName: name,
      amount: quantity,
    };
    this.addingPlutusMint = false;
    return this;
  };

  /**
   * Set the minting script of current mint
   * @param scriptCBOR The CBOR hex of the minting policy script
   * @returns The MeshTxBuilder instance
   */
  mintingScript = (scriptCBOR: string) => {
    if (!this.mintItem) throw Error('Undefined mint');
    if (!this.mintItem.type) throw Error('Mint information missing');
    this.mintItem.scriptSource = { type: 'Provided', cbor: scriptCBOR };
    return this;
  };

  /**
   * Use reference script for minting
   * @param txHash The transaction hash of the UTxO
   * @param txIndex The transaction index of the UTxO
   * @returns The MeshTxBuilder instance
   */
  mintTxInReference = (txHash: string, txIndex: number) => {
    if (!this.mintItem) throw Error('Undefined mint');
    if (!this.mintItem.type) throw Error('Mint information missing');
    if (this.mintItem.type == 'Native') {
      throw Error(
        'Mint tx in reference can only be used on plutus script tokens'
      );
    }
    if (!this.mintItem.policyId)
      throw Error('PolicyId information missing from mint asset');
    this.mintItem.scriptSource = {
      type: 'Reference Script',
      txHash,
      txIndex,
    };
    return this;
  };

  /**
   * Set the redeemer for minting
   * @param redeemer The redeemer in object format
   * @param exUnits The execution units budget for the redeemer
   * @returns The MeshTxBuilder instance
   */
  mintReferenceTxInRedeemerValue = (
    redeemer: Data,
    exUnits = DEFAULT_REDEEMER_BUDGET
  ) => {
    if (!this.mintItem) throw Error('Undefined mint');
    if (this.mintItem.type == 'Native') {
      throw Error(
        'Mint tx in reference can only be used on plutus script tokens'
      );
    } else if (this.mintItem.type == 'Plutus') {
      if (!this.mintItem.policyId)
        throw Error('PolicyId information missing from mint asset');
      this.mintItem.redeemer = {
        data: redeemer,
        exUnits,
      };
    }
    return this;
  };

  /**
   * Set the redeemer for the reference input to be spent in same transaction
   * @param redeemer The redeemer in object format
   * @param exUnits The execution units budget for the redeemer
   * @returns The MeshTxBuilder instance
   */
  mintRedeemerValue = (redeemer: Data, exUnits?: Budget) => {
    this.mintReferenceTxInRedeemerValue(redeemer, exUnits);
    return this;
  };

  /**
   * Set the required signer of the transaction
   * @param pubKeyHash The PubKeyHash of the required signer
   * @returns The MeshTxBuilder instance
   */
  requiredSignerHash = (pubKeyHash: string) => {
    this.meshTxBuilderBody.requiredSignatures.push(pubKeyHash);
    return this;
  };

  /**
   * Set the collateral UTxO for the transaction
   * @param txHash The transaction hash of the collateral UTxO
   * @param txIndex The transaction index of the collateral UTxO
   * @param amount The asset amount of index of the collateral UTxO
   * @param address The address of the collateral UTxO
   * @returns The MeshTxBuilder instance
   */
  txInCollateral = (
    txHash: string,
    txIndex: number,
    amount?: Asset[],
    address?: string
  ) => {
    if (this.collateralQueueItem) {
      this.meshTxBuilderBody.collaterals.push(this.collateralQueueItem);
    }
    this.collateralQueueItem = {
      type: 'PubKey',
      txIn: {
        txHash: txHash,
        txIndex: txIndex,
        amount,
        address,
      },
    };
    return this;
  };

  /**
   * Configure the address to accept change UTxO
   * @param addr The address to accept change UTxO
   * @returns The MeshTxBuilder instance
   */
  changeAddress = (addr: string) => {
    this.meshTxBuilderBody.changeAddress = addr;
    return this;
  };

  /**
   * Set the transaction valid interval to be valid only after the slot
   * @param slot The transaction is valid only after this slot
   * @returns The MeshTxBuilder instance
   */
  invalidBefore = (slot: number) => {
    this.meshTxBuilderBody.validityRange.invalidBefore = slot;
    return this;
  };

  /**
   * Set the transaction valid interval to be valid only before the slot
   * @param slot The transaction is valid only before this slot
   * @returns The MeshTxBuilder instance
   */
  invalidHereafter = (slot: number) => {
    this.meshTxBuilderBody.validityRange.invalidHereafter = slot;
    return this;
  };

  /**
   * Add metadata to the transaction
   * @param tag The tag of the metadata
   * @param metadata The metadata in object format
   * @returns The MeshTxBuilder instance
   */
  metadataValue = <T extends object>(tag: string, metadata: T) => {
    this.meshTxBuilderBody.metadata.push({ tag, metadata });
    return this;
  };

  /**
   * Set the protocol parameters to be used for the transaction other than the default one
   * @param params (Part of) the protocol parameters to be used for the transaction
   * @returns The MeshTxBuilder instance
   */
  protocolParams = (params: Partial<Protocol>) => {
    const updatedParams = { ...DEFAULT_PROTOCOL_PARAMETERS, ...params };
    this.txBuilder = buildTxBuilder(updatedParams);
    return this;
  };

  /**
   * Sign the transaction with the signing key
   * @param skeyHex The signing key in cborHex (with or without 5820 prefix, i.e. the format when generated from cardano-cli)
   * @returns
   */
  signingKey = (skeyHex: string) => {
    this.meshTxBuilderBody.signingKey.push(skeyHex);
    return this;
  };

  private addAllSigningKeys = (signingKeys: string[]) => {
    if (signingKeys.length > 0) {
      const vkeyWitnesses: csl.Vkeywitnesses = csl.Vkeywitnesses.new();
      signingKeys.forEach((skeyHex) => {
        const cleanHex =
          skeyHex.slice(0, 4) === '5820' ? skeyHex.slice(4) : skeyHex;
        const wasmUnsignedTransaction = this.txBuilder.build_tx();
        const wasmTxBody = wasmUnsignedTransaction.body();
        const skey = csl.PrivateKey.from_hex(cleanHex);
        const vkeyWitness = csl.make_vkey_witness(
          csl.hash_transaction(wasmTxBody),
          skey
        );
        vkeyWitnesses.add(vkeyWitness);
        this.completeSigning(vkeyWitnesses);
      });
    }
  };

  /**
   * Complete the signing process
   * @returns The signed transaction in hex
   */
  private completeSigning = (vkeyWitnesses: csl.Vkeywitnesses) => {
    const wasmUnsignedTransaction = this.txBuilder.build_tx();
    const wasmWitnessSet = wasmUnsignedTransaction.witness_set();
    const wasmTxBody = wasmUnsignedTransaction.body();
    wasmWitnessSet.set_vkeys(vkeyWitnesses);
    const wasmSignedTransaction = csl.Transaction.new(
      wasmTxBody,
      wasmWitnessSet,
      wasmUnsignedTransaction.auxiliary_data()
    );
    this.txHex = wasmSignedTransaction.to_hex();
  };

  private buildTx = () => {
    this.txHex = this.txBuilder.build_tx().to_hex();
  };

  private queueInput = () => {
    if (!this.txInQueueItem) throw Error('Undefined input');
    if (this.txInQueueItem.type === 'Script') {
      if (!this.txInQueueItem.scriptTxIn) {
        throw Error(
          'Script input does not contain script, datum, or redeemer information'
        );
      } else {
        if (!this.txInQueueItem.scriptTxIn.datumSource)
          throw Error('Script input does not contain datum information');
        if (!this.txInQueueItem.scriptTxIn.redeemer)
          throw Error('Script input does not contain redeemer information');
        if (!this.txInQueueItem.scriptTxIn.scriptSource)
          throw Error('Script input does not contain script information');
      }
    }
    this.meshTxBuilderBody.inputs.push(this.txInQueueItem);
    this.txInQueueItem = undefined;
  };

  private queueMint = () => {
    if (!this.mintItem) throw Error('Undefined mint');
    if (!this.mintItem.scriptSource)
      throw Error('Missing mint script information');
    this.meshTxBuilderBody.mints.push(this.mintItem);
    this.mintItem = undefined;
  };

  private makePlutusScriptSource = (
    scriptSourceInfo: Required<ScriptSourceInfo>
  ): csl.PlutusScriptSource => {
    const scriptHash = csl.ScriptHash.from_hex(
      scriptSourceInfo.spendingScriptHash
    );
    const scriptRefInput = csl.TransactionInput.new(
      csl.TransactionHash.from_hex(scriptSourceInfo.txHash),
      scriptSourceInfo.txIndex
    );
    const scriptSource = csl.PlutusScriptSource.new_ref_input_with_lang_ver(
      scriptHash,
      scriptRefInput,
      csl.Language.new_plutus_v2()
    );
    return scriptSource;
  };

  // Below protected functions for completing tx building

  private addAllInputs = (inputs: TxIn[]) => {
    for (let i = 0; i < inputs.length; i++) {
      const currentTxIn = inputs[i]; //TODO: add type
      switch (currentTxIn.type) {
        case 'PubKey':
          this.addTxIn(currentTxIn as RequiredWith<PubKeyTxIn, 'txIn'>);
          break;
        case 'Script':
          this.addScriptTxIn(
            currentTxIn as RequiredWith<ScriptTxIn, 'txIn' | 'scriptTxIn'>
          );
          break;
      }
    }
  };

  private addTxIn = (currentTxIn: RequiredWith<PubKeyTxIn, 'txIn'>) => {
    this.txBuilder.add_input(
      csl.Address.from_bech32(currentTxIn.txIn.address),
      csl.TransactionInput.new(
        csl.TransactionHash.from_hex(currentTxIn.txIn.txHash),
        currentTxIn.txIn.txIndex
      ),
      toValue(currentTxIn.txIn.amount)
    );
  };

  private addScriptTxIn = ({
    scriptTxIn,
    txIn,
  }: RequiredWith<ScriptTxIn, 'txIn' | 'scriptTxIn'>) => {
    let cslDatum: csl.DatumSource;
    const { datumSource, scriptSource, redeemer } = scriptTxIn;
    if (datumSource.type === 'Provided') {
      cslDatum = csl.DatumSource.new(toPlutusData(datumSource.data));
    } else {
      const refTxIn = csl.TransactionInput.new(
        csl.TransactionHash.from_hex(datumSource.txHash),
        datumSource.txIndex
      );
      cslDatum = csl.DatumSource.new_ref_input(refTxIn);
    }
    const cslScript = this.makePlutusScriptSource(
      scriptSource as Required<ScriptSourceInfo>
    );
    const cslRedeemer = csl.Redeemer.new(
      csl.RedeemerTag.new_spend(),
      csl.BigNum.from_str('0'),
      toPlutusData(redeemer.data),
      csl.ExUnits.new(
        csl.BigNum.from_str(String(redeemer.exUnits.mem)),
        csl.BigNum.from_str(String(redeemer.exUnits.steps))
      )
    );
    this.txBuilder.add_plutus_script_input(
      csl.PlutusWitness.new_with_ref(cslScript, cslDatum, cslRedeemer),
      csl.TransactionInput.new(
        csl.TransactionHash.from_hex(txIn.txHash),
        txIn.txIndex
      ),
      toValue(txIn.amount)
    );
  };

  private addAllOutputs = (outputs: Output[]) => {
    for (let i = 0; i < outputs.length; i++) {
      const currentOutput = outputs[i];
      this.addOutput(currentOutput);
    }
  };

  private addOutput = ({ amount, address, datum, referenceScript }: Output) => {
    const txValue = toValue(amount);
    const output = csl.TransactionOutput.new(
      csl.Address.from_bech32(address),
      txValue
    );
    if (datum && datum.type === 'Hash') {
      output.set_data_hash(csl.hash_plutus_data(toPlutusData(datum.data)));
    }
    if (datum && datum.type === 'Inline') {
      output.set_plutus_data(toPlutusData(datum.data));
    }
    if (referenceScript) {
      output?.set_script_ref(
        csl.ScriptRef.new_plutus_script(
          csl.PlutusScript.from_hex(referenceScript)
        )
      );
    }
    this.txBuilder.add_output(output);
  };

  private addAllCollaterals = (collaterals: PubKeyTxIn[]) => {
    for (let i = 0; i < collaterals.length; i++) {
      const currentCollateral = collaterals[i];
      this.addCollateral(currentCollateral as RequiredWith<PubKeyTxIn, 'txIn'>);
    }
    this.txBuilder.set_collateral(this.collateralBuilder);
  };

  private addCollateral = (
    currentCollateral: RequiredWith<PubKeyTxIn, 'txIn'>
  ) => {
    this.collateralBuilder.add_input(
      csl.Address.from_bech32(currentCollateral.txIn.address),
      csl.TransactionInput.new(
        csl.TransactionHash.from_hex(currentCollateral.txIn.txHash),
        currentCollateral.txIn.txIndex
      ),
      toValue(currentCollateral.txIn.amount)
    );
  };

  private addAllReferenceInputs = (refInputs: RefTxIn[]) => {
    refInputs.forEach((refInput) => {
      this.addReferenceInput(refInput);
    });
  };

  private addReferenceInput = ({ txHash, txIndex }: RefTxIn) => {
    const refInput = csl.TransactionInput.new(
      csl.TransactionHash.from_hex(txHash),
      txIndex
    );
    this.txBuilder.add_reference_input(refInput);
  };

  protected addAllMints = (mints: MintItem[]) => {
    let plutusMintCount = 0;
    for (let i = 0; i < mints.length; i++) {
      const mintItem = mints[i] as Required<MintItem>;
      if (!mintItem.scriptSource)
        throw Error('Mint script is expected to be provided');
      if (mintItem.type === 'Plutus') {
        if (!mintItem.redeemer)
          throw Error('Missing mint redeemer information');
        this.addPlutusMint(mintItem, plutusMintCount); // TODO: Update after csl update
        plutusMintCount++; // TODO: Remove after csl update
      } else if (mintItem.type === 'Native') {
        this.addNativeMint(mintItem);
      }
    }
    this.txBuilder.set_mint_builder(this.mintBuilder);
  };

  private addPlutusMint = (
    { redeemer, policyId, scriptSource, assetName, amount }: Required<MintItem>,
    redeemerIndex: number
  ) => {
    const newRedeemer: csl.Redeemer = csl.Redeemer.new(
      csl.RedeemerTag.new_mint(),
      csl.BigNum.from_str(String(redeemerIndex)),
      toPlutusData(redeemer.data),
      csl.ExUnits.new(
        csl.BigNum.from_str(String(redeemer.exUnits.mem)),
        csl.BigNum.from_str(String(redeemer.exUnits.steps))
      )
    );
    const script =
      scriptSource.type === 'Reference Script'
        ? csl.PlutusScriptSource.new_ref_input_with_lang_ver(
            csl.ScriptHash.from_hex(policyId),
            csl.TransactionInput.new(
              csl.TransactionHash.from_hex(scriptSource.txHash),
              scriptSource.txIndex
            ),
            csl.Language.new_plutus_v2()
          )
        : csl.PlutusScriptSource.new(
            csl.PlutusScript.from_hex_with_version(
              scriptSource.cbor,
              csl.Language.new_plutus_v2()
            )
          );

    this.mintBuilder.add_asset(
      csl.MintWitness.new_plutus_script(script, newRedeemer),
      csl.AssetName.new(Buffer.from(assetName, 'hex')),
      csl.Int.new_i32(amount)
    );
  };

  private addNativeMint = ({
    scriptSource,
    assetName,
    amount,
  }: Required<MintItem>) => {
    if (scriptSource.type === 'Reference Script')
      throw Error('Native mint cannot have reference script');
    this.mintBuilder.add_asset(
      csl.MintWitness.new_native_script(
        csl.NativeScript.from_hex(scriptSource.cbor)
      ),
      csl.AssetName.new(Buffer.from(assetName, 'hex')),
      csl.Int.new_i32(amount)
    );
  };

  protected queueAllLastItem = () => {
    if (this.txOutput) {
      this.meshTxBuilderBody.outputs.push(this.txOutput);
      this.txOutput = undefined;
    }
    if (this.txInQueueItem) {
      this.queueInput();
    }
    if (this.collateralQueueItem) {
      this.meshTxBuilderBody.collaterals.push(this.collateralQueueItem);
    }
    if (this.mintItem) {
      this.queueMint();
    }
  };

  protected addCostModels = () => {
    this.txBuilder.calc_script_data_hash(
      csl.TxBuilderConstants.plutus_vasil_cost_models()
    );
  };

  private addChange = (changeAddress: string) => {
    this.txBuilder.add_change_if_needed(csl.Address.from_bech32(changeAddress));
  };

  private addValidityRange = ({
    invalidBefore,
    invalidHereafter,
  }: ValidityRange) => {
    if (invalidBefore) {
      this.txBuilder.set_validity_start_interval_bignum(
        csl.BigNum.from_str(invalidBefore.toString())
      );
    }
    if (invalidHereafter) {
      this.txBuilder.set_ttl_bignum(
        csl.BigNum.from_str(invalidHereafter.toString())
      );
    }
  };

  private addAllRequiredSignatures = (requiredSignatures: string[]) => {
    requiredSignatures.forEach((pubKeyHash) => {
      this.txBuilder.add_required_signer(
        csl.Ed25519KeyHash.from_hex(pubKeyHash)
      );
    });
  };

  private addAllMetadata = (allMetadata: Metadata[]) => {
    allMetadata.forEach(({ tag, metadata }) => {
      this.txBuilder.add_json_metadatum(
        csl.BigNum.from_str(tag),
        JSON.stringify(metadata)
      );
    });
  };
}
