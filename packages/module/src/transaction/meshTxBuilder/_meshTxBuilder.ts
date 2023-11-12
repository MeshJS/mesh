import { DEFAULT_REDEEMER_BUDGET } from '@mesh/common/constants';
import { Asset, Budget, Data } from '@mesh/common/types';
import { buildTxBuilder, toValue, toPlutusData } from '@mesh/common/utils';
import { csl } from '@mesh/core';

export type TxInParameter = {
  txHash: string;
  txIndex: number;
  amount?: Asset[];
  address?: string;
};

// export type ScriptTxInParameter = {
//   scriptSource?: csl.PlutusScriptSource;
//   datumSource?: csl.DatumSource;
//   redeemer?: csl.Redeemer;
// };

export type ScriptSourceInfo = {
  txHash: string;
  txIndex: number;
  spendingScriptHash?: string;
};

export type ScriptTxInParameter = {
  scriptSource?: ScriptSourceInfo;
  datumSource?: csl.DatumSource;
  redeemer?: csl.Redeemer;
};

export type QueuedTxIn = { txIn: TxInParameter } & (
  | { type: 'Script'; scriptTxIn: ScriptTxInParameter }
  | { type: 'PubKey' }
);

export type MintItem = {
  type: 'Native' | 'Plutus';
  policyId: csl.ScriptHash;
  assetName: csl.AssetName;
  amount: number;
  nativeScript?: csl.NativeScript;
  plutusScript?: csl.PlutusScriptSource;
  redeemer?: csl.Redeemer;
};

export class _MeshTxBuilder {
  txHex?: string;
  txBuilder: csl.TransactionBuilder = buildTxBuilder();
  mintBuilder: csl.MintBuilder = csl.MintBuilder.new();
  collateralBuilder: csl.TxInputsBuilder = csl.TxInputsBuilder.new();
  txOutput?: csl.TransactionOutput;
  builderChangeAddress?: csl.Address;
  addingScriptInput = false;
  addingPlutusMint = false;
  vkeyWitnesses: csl.Vkeywitnesses = csl.Vkeywitnesses.new();

  mintItem?: MintItem;
  mintQueue: MintItem[] = [];

  txInQueueItem?: QueuedTxIn;
  txInQueue: QueuedTxIn[] = [];

  collateralQueueItem?: QueuedTxIn;
  collateralQueue: QueuedTxIn[] = [];

  refScriptTxInQueueItem?: QueuedTxIn;
  refScriptTxInQueue: QueuedTxIn[] = [];

  /**
   * Synchronous functions here
   */

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
    this.txInQueueItem.scriptTxIn.datumSource = csl.DatumSource.new(
      toPlutusData(datum)
    );
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
      const refTxIn = csl.TransactionInput.new(
        csl.TransactionHash.from_hex(txHash),
        txIndex
      );
      this.txInQueueItem.scriptTxIn.datumSource =
        csl.DatumSource.new_ref_input(refTxIn);
    }
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
      this.txBuilder.add_output(this.txOutput);
      this.txOutput = undefined;
    }
    const txValue = toValue(amount);
    this.txOutput = csl.TransactionOutput.new(
      csl.Address.from_bech32(address),
      txValue
    );
    return this;
  };

  /**
   * Set the output datum hash for transaction
   * @param {Data} datum The datum in object format
   * @returns The MeshTxBuilder instance
   */
  txOutDatumHashValue = (datum: Data) => {
    this.txOutput?.set_data_hash(csl.hash_plutus_data(toPlutusData(datum)));
    return this;
  };

  /**
   * Set the output inline datum for transaction
   * @param {Data} datum The datum in object format
   * @returns The MeshTxBuilder instance
   */
  txOutInlineDatumValue = (datum: Data) => {
    this.txOutput?.set_plutus_data(toPlutusData(datum));
    return this;
  };

  /**
   * Set the reference script to be attached with the output
   * @param scriptCbor The CBOR hex of the script to be attached to UTxO as reference script
   * @returns The MeshTxBuilder instance
   */
  txOutReferenceScript = (scriptCbor: string) => {
    this.txOutput?.set_script_ref(
      csl.ScriptRef.new_plutus_script(csl.PlutusScript.from_hex(scriptCbor))
    );
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
   * Set the reference input where it would also be spent in the transaction
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
   * Set the instruction that the reference input has inline datum
   * @returns The MeshTxBuilder instance
   */
  // Unsure how this is different from the --tx-in-inline-datum-present flag
  // It seems to just be different based on if the script is a reference input
  spendingReferenceTxInInlineDatumPresent = () => {
    this.txInInlineDatumPresent();
    return this;
  };

  /**
   * Set the redeemer for the reference input to be spent in same transaction
   * @param redeemer The redeemer in object format
   * @param exUnits The execution units budget for the redeemer
   * @returns The MeshTxBuilder instance
   */
  spendingReferenceTxInRedeemerValue = (
    redeemer: Data,
    exUnits = DEFAULT_REDEEMER_BUDGET
  ) => {
    if (!this.txInQueueItem) throw Error('Undefined input');
    if (this.txInQueueItem.type === 'PubKey')
      throw Error(
        'Spending tx in reference redeemer attempted to be called a non script input'
      );
    this.txInQueueItem.scriptTxIn.redeemer = csl.Redeemer.new(
      csl.RedeemerTag.new_spend(),
      csl.BigNum.from_str('0'),
      toPlutusData(redeemer),
      csl.ExUnits.new(
        csl.BigNum.from_str(String(exUnits.mem)),
        csl.BigNum.from_str(String(exUnits.steps))
      )
    );
    return this;
  };

  /**
   * Specify a read only reference input. This reference input is not witnessing anything it is simply provided in the plutus script context.
   * @param txHash The transaction hash of the reference UTxO
   * @param txIndex The transaction index of the reference UTxO
   * @returns The MeshTxBuilder instance
   */
  readOnlyTxInReference = (txHash: string, txIndex: number) => {
    const refInput = csl.TransactionInput.new(
      csl.TransactionHash.from_hex(txHash),
      txIndex
    );
    this.txBuilder.add_reference_input(refInput);
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
      policyId: csl.ScriptHash.from_hex(policy),
      assetName: csl.AssetName.new(Buffer.from(name, 'hex')),
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
    if (this.mintItem.type == 'Native') {
      this.mintItem.nativeScript = csl.NativeScript.from_hex(scriptCBOR);
    } else if (this.mintItem.type == 'Plutus') {
      this.mintItem.plutusScript = csl.PlutusScriptSource.new(
        csl.PlutusScript.from_hex_with_version(
          scriptCBOR,
          csl.Language.new_plutus_v2()
        )
      );
    }
    return this;
  };

  /**
   *
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
    } else if (this.mintItem.type == 'Plutus') {
      if (!this.mintItem.policyId)
        throw Error('PolicyId information missing from mint asset');
      this.mintItem.plutusScript =
        csl.PlutusScriptSource.new_ref_input_with_lang_ver(
          this.mintItem.policyId,
          csl.TransactionInput.new(
            csl.TransactionHash.from_hex(txHash),
            txIndex
          ),
          csl.Language.new_plutus_v2()
        );
    }
    return this;
  };

  /**
   *
   * @param redeemer The redeemer in object format
   * @returns The MeshTxBuilder instance
   */
  mintReferenceTxInRedeemerValue = (
    redeemerData: Data,
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
      this.mintItem.redeemer = csl.Redeemer.new(
        csl.RedeemerTag.new_mint(),
        csl.BigNum.from_str('0'),
        toPlutusData(redeemerData),
        csl.ExUnits.new(
          csl.BigNum.from_str(String(exUnits.mem)),
          csl.BigNum.from_str(String(exUnits.steps))
        )
      );
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
   *
   * @param policyId The policy id of the asset to be minted
   * @returns The MeshTxBuilder instance
   */
  policyId = (policyId: string) => {
    return this;
  };

  /**
   * Set the required signer of the transaction
   * @param pubKeyHash The PubKeyHash of the required signer
   * @returns The MeshTxBuilder instance
   */
  requiredSignerHash = (pubKeyHash: string) => {
    this.txBuilder.add_required_signer(csl.Ed25519KeyHash.from_hex(pubKeyHash));
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
  _txInCollateral = (
    txHash: string,
    txIndex: number,
    amount?: Asset[],
    address?: string
  ) => {
    if (this.collateralQueueItem) {
      this.collateralQueue.push(this.collateralQueueItem);
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
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  changeAddress = (addr: string) => {
    this.builderChangeAddress = csl.Address.from_bech32(addr);
    return this;
  };

  /**
   * Set the transaction valid interval to be valid only after the slot
   * @param slot The transaction is valid only after this slot
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  invalidBefore = (slot: number) => {
    this.txBuilder.set_validity_start_interval_bignum(
      csl.BigNum.from_str(slot.toString())
    );
    return this;
  };

  /**
   * Set the transaction valid interval to be valid only before the slot
   * @param slot The transaction is valid only before this slot
   * @returns {MeshTxBuilder} The MeshTxBuilder instance
   */
  invalidHereafter = (slot: number) => {
    this.txBuilder.set_ttl_bignum(csl.BigNum.from_str(slot.toString()));
    return this;
  };

  /**
   *
   * @param tag
   * @param metadata
   * @returns
   */
  metadataValue = (tag: string, metadata: any) => {
    this.txBuilder.add_json_metadatum(
      csl.BigNum.from_str(tag),
      JSON.stringify(metadata)
    );
    return this;
  };

  /**
   * Sign the transaction with the signing key
   * @param skey The signing key in cborHex (with or without 5820 prefix, i.e. the format when generated from cardano-cli)
   * @returns
   */
  signingKey = (skeyHex: string) => {
    const cleanHex =
      skeyHex.slice(0, 4) === '5820' ? skeyHex.slice(4) : skeyHex;
    const wasmUnsignedTransaction = this.txBuilder.build_tx();
    const wasmTxBody = wasmUnsignedTransaction.body();
    const skey = csl.PrivateKey.from_hex(cleanHex);
    const vkeyWitness = csl.make_vkey_witness(
      csl.hash_transaction(wasmTxBody),
      skey
    );
    this.vkeyWitnesses.add(vkeyWitness);
    return this;
  };

  /**
   * Complete the signing process
   * @returns The signed transaction in hex
   */
  completeSigning = (): string => {
    const wasmUnsignedTransaction = this.txBuilder.build_tx();
    const wasmWitnessSet = wasmUnsignedTransaction.witness_set();
    const wasmTxBody = wasmUnsignedTransaction.body();
    wasmWitnessSet.set_vkeys(this.vkeyWitnesses);
    const wasmSignedTransaction = csl.Transaction.new(
      wasmTxBody,
      wasmWitnessSet,
      wasmUnsignedTransaction.auxiliary_data()
    );
    this.txHex = wasmSignedTransaction.to_hex();
    return this.txHex;
  };

  protocolParams = (params: any) => {
    return this;
  };

  protected queueInput = () => {
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
    this.txInQueue.push(this.txInQueueItem);
    this.txInQueueItem = undefined;
  };

  protected queueMint = () => {
    if (!this.mintItem) throw Error('Undefined mint');
    if (!this.mintItem.plutusScript && !this.mintItem.nativeScript)
      throw Error('Missing mint script information');
    this.mintQueue.push(this.mintItem);
    this.mintItem = undefined;
  };

  protected makePlutusScriptSource = (
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
}
