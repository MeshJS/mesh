import { DEFAULT_REDEEMER_BUDGET } from '@mesh/common/constants';
import { Asset, Data } from '@mesh/common/types';
import { buildTxBuilder, toValue } from '@mesh/common/utils';
import { csl } from '@mesh/core';

export type ScriptInputBuilder = {
  txHash: string;
  txIndex: number;
  scriptHash: string;
  script: csl.PlutusScriptSource;
  input: csl.TransactionInput;
  datum: csl.DatumSource;
  redeemer: TempRedeemer;
  value: csl.Value;
};

export type PlutusMintBuilder = {
  policyId: string;
  script: csl.PlutusScriptSource;
  redeemer: TempRedeemer;
  tokenName: csl.AssetName;
  quantity: csl.Int;
};

export type TempRedeemer = {
  tag: csl.RedeemerTag;
  data: Data;
  exUnits: csl.ExUnits;
  index?: number;
};

export type TxInParameter = {
  txHash: string;
  txIndex: number;
  amount?: Asset[];
  address?: string;
};

export type QueuedTxIn = {
  type: 'PubKey' | 'Script';
  txIn: TxInParameter;
};

export class _MeshTxBuilder {
  txBuilder: csl.TransactionBuilder = buildTxBuilder();
  txInputsBuilder: csl.TxInputsBuilder = csl.TxInputsBuilder.new();
  plutusMintBuilder: csl.MintBuilder = csl.MintBuilder.new();
  txOutput?: csl.TransactionOutput;
  addingScriptInput = false;
  addingPlutusMint = false;
  scriptInput: Partial<ScriptInputBuilder> = {};
  scriptInputs: Partial<ScriptInputBuilder>[] = [];
  plutusMint: Partial<PlutusMintBuilder> = {};
  plutusMints: Partial<PlutusMintBuilder>[] = [];

  txInQueueItem: Partial<QueuedTxIn> = {};
  txInQueue: Partial<QueuedTxIn>[] = [];

  /**
   * Synchronous functions here
   */

  _txIn = (
    txHash: string,
    txIndex: number,
    amount: Asset[],
    address?: string
  ): _MeshTxBuilder => {
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
  };

  _txInDatumValue = (datum: Data): _MeshTxBuilder => {
    return this;
  };

  _txInInlineDatumPresent = (): _MeshTxBuilder => {
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

  _txOut = (address: string, amount: Asset[]): _MeshTxBuilder => {
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

  _txOutDatumHashValue = (datum: Data): _MeshTxBuilder => {
    return this;
  };

  _txOutInlineDatumValue = (datum: Data): _MeshTxBuilder => {
    this.txOutput?.set_plutus_data(
      csl.encode_json_str_to_plutus_datum(
        JSON.stringify(datum),
        csl.PlutusDatumSchema.DetailedSchema
      )
    );
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
    // This should point to a UTxO that contains the script (inlined) we're trying to
    // unlock from
    this.scriptInput.scriptHash = spendingScriptHash;
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
    const { datum, redeemer } = this.scriptInput;
    if (datum && redeemer) this.queueScriptInput();
    return this;
  };

  _spendingReferenceTxInInlineDatumPresent = (): _MeshTxBuilder => {
    // Signal that the tx-in has inlined datum present
    const { txHash, txIndex } = this.scriptInput;
    if (txHash && txIndex) {
      const refTxIn = csl.TransactionInput.new(
        csl.TransactionHash.from_hex(txHash),
        txIndex
      );
      this.scriptInput.datum = csl.DatumSource.new_ref_input(refTxIn);
    }
    const { script, redeemer } = this.scriptInput;
    if (script && redeemer) this.queueScriptInput();
    return this;
  };

  _spendingReferenceTxInRedeemerValue = (
    redeemer: Data,
    exUnits = DEFAULT_REDEEMER_BUDGET
  ): _MeshTxBuilder => {
    const tempRedeemer: TempRedeemer = {
      tag: csl.RedeemerTag.new_spend(),
      data: redeemer,
      exUnits: csl.ExUnits.new(
        csl.BigNum.from_str(exUnits.mem.toString()),
        csl.BigNum.from_str(exUnits.steps.toString())
      ),
    };
    this.scriptInput.redeemer = tempRedeemer;
    const { script, datum } = this.scriptInput;
    if (script && datum) this.queueScriptInput();
    return this;
  };

  _readOnlyTxInReference = (
    txHash: string,
    txIndex: number
  ): _MeshTxBuilder => {
    return this;
  };

  _mintPlutusScriptV2 = (): _MeshTxBuilder => {
    this.addingPlutusMint = true;
    return this;
  };

  _mint = (quantity: number, policy: string, name: string): _MeshTxBuilder => {
    this.plutusMint.quantity = csl.Int.new_i32(quantity);
    this.plutusMint.policyId = policy;
    this.plutusMint.tokenName = csl.AssetName.new(Buffer.from(name, 'utf8'));
    return this;
  };

  _mintTxInReference = (txHash: string, txIndex: number): _MeshTxBuilder => {
    if (this.plutusMint.policyId) {
      const scriptRefInput = csl.TransactionInput.new(
        csl.TransactionHash.from_hex(txHash),
        txIndex
      );
      const scriptHash = csl.ScriptHash.from_hex(this.plutusMint.policyId);
      const plutusScriptSource =
        csl.PlutusScriptSource.new_ref_input_with_lang_ver(
          scriptHash,
          scriptRefInput,
          csl.Language.new_plutus_v2()
        );
      this.plutusMint.script = plutusScriptSource;
    }
    if (this.plutusMint.redeemer) this.queuePlutusMint();
    return this;
  };

  _mintReferenceTxInRedeemerValue = (
    redeemer: Data,
    exUnits = DEFAULT_REDEEMER_BUDGET
  ): _MeshTxBuilder => {
    const tempRedeemer: TempRedeemer = {
      tag: csl.RedeemerTag.new_mint(),
      data: redeemer,
      exUnits: csl.ExUnits.new(
        csl.BigNum.from_str(exUnits.mem.toString()),
        csl.BigNum.from_str(exUnits.steps.toString())
      ),
    };
    this.scriptInput.redeemer = tempRedeemer;
    if (this.plutusMint.script) this.queuePlutusMint();
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
    this.txBuilder.add_change_if_needed(csl.Address.from_bech32(addr));
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

  private queueScriptInput = () => {
    this.scriptInputs.push(this.scriptInput);
    this.addingScriptInput = false;
    if (!this.scriptInput.value) {
      this.txInQueue.push(this.txInQueueItem);
      this.txInQueueItem = {};
    }
    this.scriptInput = {};
  };

  private queuePlutusMint = () => {
    this.plutusMints.push(this.plutusMint);
    this.addingPlutusMint = false;
    this.plutusMint = {};
  };

  /**
   * This private function is for constructing the redeemer when
   *   1. ExUnits are finalized (Optionally after adjustment from Tx Evaluate)
   *   2. Redeemer index are computed (Number of redeemer is fixed)
   * @param rawScriptInput
   */
  private constructScriptInput = (rawScriptInput: ScriptInputBuilder) => {
    const { script, datum, redeemer, input, value } = rawScriptInput;
    const scriptPlutusWitness = csl.PlutusWitness.new_with_ref(
      script,
      datum,
      this.makeRedeemer({ ...redeemer, index: redeemer.index || 0 })
    );
    this.txInputsBuilder.add_plutus_script_input(
      scriptPlutusWitness,
      input,
      value
    );
  };

  private constructPlutusMint = (rawPlutusMint: PlutusMintBuilder) => {
    const { script, redeemer, tokenName, quantity } = rawPlutusMint;
    const mintWitness = csl.MintWitness.new_plutus_script(
      script,
      this.makeRedeemer({ ...redeemer, index: redeemer.index || 0 })
    );
    this.plutusMintBuilder.add_asset(mintWitness, tokenName, quantity);
  };

  private makeRedeemer = (
    tempRedeemer: TempRedeemer & { index: number }
  ): csl.Redeemer => {
    const redeemerData = csl.encode_json_str_to_plutus_datum(
      JSON.stringify(tempRedeemer.data),
      csl.PlutusDatumSchema.DetailedSchema
    );
    return csl.Redeemer.new(
      tempRedeemer.tag,
      csl.BigNum.from_str(tempRedeemer.index.toString()),
      redeemerData,
      tempRedeemer.exUnits
    );
  };

  addScriptInputs = () => {
    // Sort the inputs according to script hash
    const inputs = this.scriptInputs as ScriptInputBuilder[];
    inputs.sort((a, b) => (b.scriptHash > a.scriptHash ? -1 : 1));

    inputs.forEach((scriptInputBuilder, index) => {
      // Put its index to TempRedeemer
      scriptInputBuilder.redeemer.index = index;
      // Construct the script input
      this.constructScriptInput(scriptInputBuilder);
    });
  };

  addPlutusMints = () => {
    // Sort the inputs according to script hash
    const mints = this.plutusMints as PlutusMintBuilder[];
    mints.sort((a, b) => (b.policyId > a.policyId ? -1 : 1));

    mints.forEach((plutusMintBuilder, index) => {
      // Put its index to TempRedeemer
      plutusMintBuilder.redeemer.index = index;
      // Construct the script input
      this.constructPlutusMint(plutusMintBuilder);
    });
  };
}
