import { DEFAULT_REDEEMER_BUDGET } from '@mesh/common/constants';
import { Asset, Data } from '@mesh/common/types';
import { buildTxBuilder, toValue, toPlutusData } from '@mesh/common/utils';
import { csl } from '@mesh/core';

export type TxInParameter = {
  txHash: string;
  txIndex: number;
  amount?: Asset[];
  address?: string;
};

export type ScriptTxInParameter = {
  scriptSource?: csl.PlutusScriptSource;
  datumSource?: csl.DatumSource;
  redeemer?: csl.Redeemer;
}

export type QueuedTxIn = {
  type: 'PubKey' | 'Script';
  txIn: TxInParameter;
  scriptTxIn?: ScriptTxInParameter;
};

export type MintItem = {
  type: 'Native' | 'Plutus';
  policyId: csl.ScriptHash;
  assetName: csl.AssetName;
  amount: number;
  script?: csl.NativeScript | csl.PlutusScriptSource;
  redeemer?: csl.Redeemer;
}

export class _MeshTxBuilder {
  txHex?: string;
  txBuilder: csl.TransactionBuilder = buildTxBuilder();
  mintBuilder: csl.MintBuilder = csl.MintBuilder.new();
  txOutput?: csl.TransactionOutput;
  builderChangeAddress?: csl.Address;
  addingScriptInput = false;
  addingPlutusMint = false;
  vkeyWitnesses: csl.Vkeywitnesses = csl.Vkeywitnesses.new();

  mintItem: Partial<MintItem> = {};

  txInQueueItem: Partial<QueuedTxIn> = {};
  txInQueue: Partial<QueuedTxIn>[] = [];

  /**
   * Synchronous functions here
   */

  _txIn = (
    txHash: string,
    txIndex: number,
    amount?: Asset[],
    address?: string
  ): _MeshTxBuilder => {
    if (Object.keys(this.txInQueueItem).length !== 0) {
      this.queueInput();
    }
    if (!this.addingScriptInput) {
      this.txInQueueItem = {
        type: 'PubKey',
        txIn: {
          txHash: txHash,
          txIndex: txIndex,
          amount: amount,
          address: address
        }
      };
    } else {
      this.txInQueueItem = {
        type: 'Script',
        txIn: {
          txHash: txHash,
          txIndex: txIndex,
          amount: amount,
          address: address
        },
        scriptTxIn: {}
      };
    }
    this.addingScriptInput = false;
    return this;
  };

  _txInDatumValue = (datum: Data): _MeshTxBuilder => {
    if (!this.txInQueueItem.txIn) throw Error('Datum value attempted to be called on an undefined transaction input');
    if (!this.txInQueueItem.scriptTxIn) throw Error('Datum value attempted to be called a non script input');
    this.txInQueueItem.scriptTxIn.datumSource = csl.DatumSource.new(toPlutusData(datum));
    return this;
  };

  _txInInlineDatumPresent = (): _MeshTxBuilder => {
    if (!this.txInQueueItem.txIn) throw Error('Inline datum present attempted to be called on an undefined transaction input');
    if (!this.txInQueueItem.scriptTxIn) throw Error('Inline datum present attempted to be called a non script input');
    const { txHash, txIndex } = this.txInQueueItem.txIn;
    if (txHash && txIndex) {
      const refTxIn = csl.TransactionInput.new(
        csl.TransactionHash.from_hex(txHash),
        txIndex
      );
      this.txInQueueItem.scriptTxIn.datumSource = csl.DatumSource.new_ref_input(refTxIn);
    }
    return this;
  };

  _txOut = (address: string, amount: Asset[]): _MeshTxBuilder => {
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

  _txOutDatumHashValue = (datum: Data): _MeshTxBuilder => {
    return this;
  };

  _txOutInlineDatumValue = (datum: Data): _MeshTxBuilder => {
    this.txOutput?.set_plutus_data(toPlutusData(datum));
    return this;
  };

  _txOutReferenceScript = (scriptCbor: string): _MeshTxBuilder => {
    this.txOutput?.set_script_ref(
      csl.ScriptRef.new_plutus_script(csl.PlutusScript.from_hex(scriptCbor))
    );
    return this;
  };

  _spendingPlutusScriptV2 = (): _MeshTxBuilder => {
    // This flag should signal a start to a script input
    // The next step after will be to add a tx-in
    // After which, we will REQUIRE, script, datum and redeemer info
    // for unlocking this particular input
    this.addingScriptInput = true;
    return this;
  };

  _spendingTxInReference = (
    txHash: string,
    txIndex: number,
    spendingScriptHash: string
  ): _MeshTxBuilder => {
    if (!this.txInQueueItem.txIn) throw Error('Spending tx in reference attempted to be called on an undefined transaction input');
    if (!this.txInQueueItem.scriptTxIn) throw Error('Spending tx in reference attempted to be called a non script input');
    const scriptHash = csl.ScriptHash.from_hex(spendingScriptHash);
    const scriptRefInput = csl.TransactionInput.new(
      csl.TransactionHash.from_hex(txHash),
      txIndex
    );
    this.txInQueueItem.scriptTxIn.scriptSource =
      csl.PlutusScriptSource.new_ref_input_with_lang_ver(
        scriptHash,
        scriptRefInput,
        csl.Language.new_plutus_v2()
      );
    return this;
  };

  // Unsure how this is different from the --tx-in-inline-datum-present flag
  // It seems to just be different based on if the script is a reference input
  _spendingReferenceTxInInlineDatumPresent = (): _MeshTxBuilder => {
    this._txInInlineDatumPresent();
    return this;
  };

  _spendingReferenceTxInRedeemerValue = (
    redeemer: Data,
    exUnits = DEFAULT_REDEEMER_BUDGET
  ): _MeshTxBuilder => {
    if (!this.txInQueueItem.txIn) throw Error('Spending tx in reference redeemer attempted to be called on an undefined transaction input');
    if (!this.txInQueueItem.scriptTxIn) throw Error('Spending tx in reference redeemer attempted to be called a non script input');
    this.txInQueueItem.scriptTxIn.redeemer = csl.Redeemer.new(
      csl.RedeemerTag.new_spend(),
      csl.BigNum.from_str('0'),
      toPlutusData(redeemer),
      csl.ExUnits.new(
        csl.BigNum.from_str(String(exUnits.mem)),
        csl.BigNum.from_str(String(exUnits.steps))
      ));
    return this;
  };

  _readOnlyTxInReference = (
    txHash: string,
    txIndex: number
  ): _MeshTxBuilder => {
    const refInput = csl.TransactionInput.new(
      csl.TransactionHash.from_hex(txHash),
      txIndex
    );
    this.txBuilder.add_reference_input(refInput);
    return this;
  };

  _mintPlutusScriptV2 = (): _MeshTxBuilder => {
    this.addingPlutusMint = true;
    return this;
  };

  _mint = (quantity: number, policy: string, name: string): _MeshTxBuilder => {
    if (Object.keys(this.mintItem).length != 0) {
      this.queueMint();
    }
    this.mintItem = {
      type: this.addingPlutusMint ? 'Plutus' : 'Native',
      policyId: csl.ScriptHash.from_hex(policy),
      assetName: csl.AssetName.new(Buffer.from(name, 'utf8')),
      amount: quantity,
    };
    this.addingPlutusMint = false;
    return this;
  };

  _mintingScript = (scriptCBOR: string): _MeshTxBuilder => {
    if (!this.mintItem.type) throw Error('Mint information missing');
    if (this.mintItem.type == 'Native') {
      this.mintItem.script = csl.NativeScript.from_hex(scriptCBOR);
    } else if (this.mintItem.type == 'Plutus') {
      this.mintItem.script = csl.PlutusScriptSource.new(csl.PlutusScript.from_hex_with_version(scriptCBOR, csl.Language.new_plutus_v2()));
    }
    return this;
  };

  _mintTxInReference = (txHash: string, txIndex: number): _MeshTxBuilder => {
    if (!this.mintItem.type) throw Error('Mint information missing');
    if (this.mintItem.type == 'Native') {
      throw Error('Mint tx in reference can only be used on plutus script tokens');
    } else if (this.mintItem.type == 'Plutus') {
      if (!this.mintItem.policyId) throw Error('PolicyId information missing from mint asset');
      this.mintItem.script = csl.PlutusScriptSource.new_ref_input_with_lang_ver(
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

  _mintReferenceTxInRedeemerValue = (
    redeemerData: Data,
    exUnits = DEFAULT_REDEEMER_BUDGET
  ): _MeshTxBuilder => {
    // TODO: figure out how to set index correctly
    if (!this.mintItem.type) throw Error('Mint information missing');
    if (this.mintItem.type == 'Native') {
      throw Error('Mint tx in reference can only be used on plutus script tokens');
    } else if (this.mintItem.type == 'Plutus') {
      if (!this.mintItem.policyId) throw Error('PolicyId information missing from mint asset');
      this.mintItem.redeemer = csl.Redeemer.new(
        csl.RedeemerTag.new_mint(),
        csl.BigNum.from_str('0'),
        toPlutusData(redeemerData),
        csl.ExUnits.new(
          csl.BigNum.from_str(String(exUnits.mem)),
          csl.BigNum.from_str(String(exUnits.steps))
        ));
    }
    return this;
  };

  // Not sure if this is useful
  _policyId = (policyId: string): _MeshTxBuilder => {
    return this;
  };

  _requiredSignerHash = (pubKeyHash: string): _MeshTxBuilder => {
    this.txBuilder.add_required_signer(csl.Ed25519KeyHash.from_hex(pubKeyHash));
    return this;
  };

  _txInCollateral = (txHash: string, txIndex: number): _MeshTxBuilder => {
    return this;
  };

  _changeAddress = (addr: string): _MeshTxBuilder => {
    this.builderChangeAddress = csl.Address.from_bech32(addr);
    return this;
  };

  _invalidBefore = (slot: number): _MeshTxBuilder => {
    this.txBuilder.set_validity_start_interval_bignum(
      csl.BigNum.from_str(slot.toString())
    );
    return this;
  };

  _invalidHereafter = (slot: number): _MeshTxBuilder => {
    this.txBuilder.set_ttl_bignum(csl.BigNum.from_str(slot.toString()));
    return this;
  };

  _signingKey = (skeyHex: string, vkeyHex: string): _MeshTxBuilder => {
    const wasmUnsignedTransaction = this.txBuilder.build_tx();
    const wasmTxBody = wasmUnsignedTransaction.body();
    const skey = csl.PrivateKey.from_hex(skeyHex);
    const signature = skey.sign(csl.hash_transaction(wasmTxBody).to_bytes());
    const vkey = csl.Vkey.from_hex(vkeyHex);
    const vkeyWitness = csl.Vkeywitness.new(vkey, signature);
    this.vkeyWitnesses.add(vkeyWitness);
    return this;
  };

  _completeSigning = (): string => {
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

  queueInput = () => {
    if (this.txInQueueItem.type === 'Script') {
      if (!this.txInQueueItem.scriptTxIn) {
        throw Error('Script input does not contain script, datum, or redeemer information');
      } else {
        if (!this.txInQueueItem.scriptTxIn.datumSource) throw Error('Script input does not contain datum information');
        if (!this.txInQueueItem.scriptTxIn.redeemer) throw Error('Script input does not contain redeemer information');
        if (!this.txInQueueItem.scriptTxIn.scriptSource) throw Error('Script input does not contain script information');
      }
    }
    this.txInQueue.push(this.txInQueueItem);
    this.txInQueueItem = {};
  };

  private isNativeScript = (script): script is csl.NativeScript => { return script.kind() !== undefined; };
  private isPlutusScript = (script): script is csl.PlutusScript => { return script.language_version() !== undefined; };

  queueMint = () => {
    if (!this.mintItem.script) throw Error('Missing mint script information');
    if (!this.mintItem.assetName) throw Error('Missing mint asset name info');
    if (!this.mintItem.amount) throw Error('Missing mint amount info');
    if (this.mintItem.type === 'Plutus') {
      if (!this.mintItem.redeemer) throw Error('Missing mint redeemer information');
      if (!this.isPlutusScript(this.mintItem.script)) throw Error('Mint script is expected to be a plutus script');
      this.mintBuilder.add_asset(
        csl.MintWitness.new_plutus_script(
          this.mintItem.script,
          this.mintItem.redeemer),
        this.mintItem.assetName,
        csl.Int.new_i32(this.mintItem.amount)
      );
    } else if (this.mintItem.type === 'Native' && this.mintItem.script) {
      if (!this.isNativeScript(this.mintItem.script)) throw Error('Mint script is expected to be native script');
      this.mintBuilder.add_asset(
        csl.MintWitness.new_native_script(
          this.mintItem.script
        ),
        this.mintItem.assetName,
        csl.Int.new_i32(this.mintItem.amount)
      );
    }
    this.mintItem = {};
  };
}