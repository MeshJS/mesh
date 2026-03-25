import type {
  _MeshTxBuilderV2,
  MintRedeemerBuilder,
  MintScriptBuilder,
  MintTxOutBuilder,
  SpendDatumBuilder,
  SpendRedeemerBuilder,
  SpendScriptBuilder,
  SpendTxOutBuilder,
  VoteRedeemerBuilder,
  VoteScriptBuilder,
  WithdrawRedeemerBuilder,
  WithdrawScriptBuilder,
} from "./types";
import {
  Asset,
  Budget,
  BuilderData,
  DEFAULT_REDEEMER_BUDGET,
  RefTxIn,
  Voter,
  VotingProcedure,
} from "@meshsdk/common";
import { MeshTxBuilder, MeshTxBuilderOptions } from "../mesh-tx-builder";

class SpendBuilderImpl
  implements
    SpendScriptBuilder,
    SpendRedeemerBuilder,
    SpendTxOutBuilder,
    SpendDatumBuilder
{
  constructor(private readonly builder: MeshTxBuilder & _MeshTxBuilderV2) {}

  script(scriptCbor: string): SpendRedeemerBuilder {
    this.builder.txInScript(scriptCbor);
    return this;
  }

  referenceScript(
    refTxHash: string,
    refTxIndex: number,
    scriptSize?: string,
    scriptHash?: string,
  ): SpendRedeemerBuilder {
    this.builder.spendingTxInReference(
      refTxHash,
      refTxIndex,
      scriptSize,
      scriptHash,
    );
    return this;
  }

  redeemerJson(
    redeemer: BuilderData["content"],//check back
    exUnits?: Budget,
  ): SpendTxOutBuilder {
    this.builder.txInRedeemerValue(
      redeemer,
      "JSON",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this;
  }

  redeemerCbor(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): SpendTxOutBuilder {
    this.builder.txInRedeemerValue(
      redeemer,
      "CBOR",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this;
  }

  txOut(address: string, amount: Asset[]): SpendDatumBuilder {
    this.builder.txInInlineDatumPresent();
    this.builder.txOut(address, amount);
    return this;
  }

  datumJson(datum: BuilderData["content"]): _MeshTxBuilderV2 {
    this.builder.txOutInlineDatumValue(datum, "JSON");
    return this.builder as _MeshTxBuilderV2;
  }

  datumCbor(datum: BuilderData["content"]): _MeshTxBuilderV2 {
    this.builder.txOutInlineDatumValue(datum, "CBOR");
    return this.builder as _MeshTxBuilderV2;
  }

  datumHash(datumHash: string): _MeshTxBuilderV2 {
    this.builder.txOutDatumHashValue(datumHash);
    return this.builder as _MeshTxBuilderV2;
  }
}

class MintBuilderImpl
  implements MintScriptBuilder, MintRedeemerBuilder, MintTxOutBuilder
{
  constructor(private readonly builder: MeshTxBuilder & _MeshTxBuilderV2) {}

  script(scriptCbor: string): MintRedeemerBuilder {
    this.builder.mintingScript(scriptCbor);
    return this;
  }

  referenceScript(
    txHash: string,
    txIndex: number,
    scriptSize?: string,
    scriptHash?: string,
  ): MintRedeemerBuilder {
    this.builder.mintTxInReference(txHash, txIndex, scriptSize, scriptHash);
    return this;
  }

  redeemerJson(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): MintTxOutBuilder {
    this.builder.mintRedeemerValue(
      redeemer,
      "JSON",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this;
  }

  redeemerCbor(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): MintTxOutBuilder {
    this.builder.mintRedeemerValue(
      redeemer,
      "CBOR",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this;
  }

  txOut(address: string, amount: Asset[]): _MeshTxBuilderV2 {
    this.builder.txOut(address, amount);
    return this.builder as _MeshTxBuilderV2;
  }
}

class WithdrawBuilderImpl
  implements WithdrawScriptBuilder, WithdrawRedeemerBuilder
{
  constructor(private readonly builder: MeshTxBuilder & _MeshTxBuilderV2) {}

  script(scriptCbor: string): WithdrawRedeemerBuilder {
    this.builder.withdrawalScript(scriptCbor);
    return this;
  }

  referenceScript(
    txHash: string,
    txIndex: number,
    scriptSize?: string,
    scriptHash?: string,
  ): WithdrawRedeemerBuilder {
    this.builder.withdrawalTxInReference(txHash, txIndex, scriptSize, scriptHash);
    return this;
  }

  redeemerJson(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): _MeshTxBuilderV2 {
    this.builder.withdrawalRedeemerValue(
      redeemer,
      "JSON",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this.builder as _MeshTxBuilderV2;
  }

  redeemerCbor(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): _MeshTxBuilderV2 {
    this.builder.withdrawalRedeemerValue(
      redeemer,
      "CBOR",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this.builder as _MeshTxBuilderV2;
  }
}

class VoteBuilderImpl implements VoteScriptBuilder, VoteRedeemerBuilder {
  constructor(private readonly builder: MeshTxBuilder & _MeshTxBuilderV2) {}

  script(scriptCbor: string): VoteRedeemerBuilder {
    this.builder.voteScript(scriptCbor);
    return this;
  }

  referenceScript(
    txHash: string,
    txIndex: number,
    scriptSize?: string,
    scriptHash?: string,
  ): VoteRedeemerBuilder {
    this.builder.voteTxInReference(txHash, txIndex, scriptSize, scriptHash);
    return this;
  }

  redeemerJson(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): _MeshTxBuilderV2 {
    this.builder.voteRedeemerValue(
      redeemer,
      "JSON",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this.builder as _MeshTxBuilderV2;
  }

  redeemerCbor(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): _MeshTxBuilderV2 {
    this.builder.voteRedeemerValue(
      redeemer,
      "CBOR",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this.builder as _MeshTxBuilderV2;
  }
}

class TxBuilderV2 extends MeshTxBuilder {
  spendPlutusV1(txHash: string, txIndex: number): SpendScriptBuilder {
    this.spendingPlutusScriptV1();
    this.txIn(txHash, txIndex);
    return new SpendBuilderImpl(this);
  }
  spendPlutusV2(txHash: string, txIndex: number): SpendScriptBuilder {
    this.spendingPlutusScriptV2();
    this.txIn(txHash, txIndex);
    return new SpendBuilderImpl(this);
  }
  spendPlutusV3(txHash: string, txIndex: number): SpendScriptBuilder {
    this.spendingPlutusScriptV3();
    this.txIn(txHash, txIndex);
    return new SpendBuilderImpl(this);
  }

  mintPlutusV1(
    quantity: string,
    policyId: string,
    assetName: string,
  ): MintScriptBuilder {
    this.mintPlutusScriptV1();
    this.mint(quantity, policyId, assetName);
    return new MintBuilderImpl(this);
  }
  mintPlutusV2(
    quantity: string,
    policyId: string,
    assetName: string,
  ): MintScriptBuilder {
    this.mintPlutusScriptV2();
    this.mint(quantity, policyId, assetName);
    return new MintBuilderImpl(this);
  }
  mintPlutusV3(
    quantity: string,
    policyId: string,
    assetName: string,
  ): MintScriptBuilder {
    this.mintPlutusScriptV3();
    this.mint(quantity, policyId, assetName);
    return new MintBuilderImpl(this);
  }

  withdrawPlutusV1(
    rewardAddress: string,
    amount: string,
  ): WithdrawScriptBuilder {
    this.withdrawalPlutusScriptV1();
    this.withdrawal(rewardAddress, amount);
    return new WithdrawBuilderImpl(this);
  }
  withdrawPlutusV2(
    rewardAddress: string,
    coin: string,
  ): WithdrawScriptBuilder {
    this.withdrawalPlutusScriptV2();
    this.withdrawal(rewardAddress, coin);
    return new WithdrawBuilderImpl(this);
  }
  withdrawPlutusV3(
    rewardAddress: string,
    coin: string,
  ): WithdrawScriptBuilder {
    this.withdrawalPlutusScriptV3();
    this.withdrawal(rewardAddress, coin);
    return new WithdrawBuilderImpl(this);
  }

  votePlutusV1(
    voter: Voter,
    govActionId: RefTxIn,
    votingProcedure: VotingProcedure,
  ): VoteScriptBuilder {
    this.votePlutusScriptV1();
    this.vote(voter, govActionId, votingProcedure);
    return new VoteBuilderImpl(this);
  }
  votePlutusV2(
    voter: Voter,
    govActionId: RefTxIn,
    votingProcedure: VotingProcedure,
  ): VoteScriptBuilder {
    this.votePlutusScriptV2();
    this.vote(voter, govActionId, votingProcedure);
    return new VoteBuilderImpl(this);
  }
  votePlutusV3(
    voter: Voter,
    govActionId: RefTxIn,
    votingProcedure: VotingProcedure,
  ): VoteScriptBuilder {
    this.votePlutusScriptV3();
    this.vote(voter, govActionId, votingProcedure);
    return new VoteBuilderImpl(this);
  }
}

/**
 * \`MeshTxBuilderV2\` is a strongly-typed wrapper around the core \`MeshTxBuilder\`
 * that enforces a rigid Type-State machine for Plutus operations.
 *
 * It natively provides TypeScript autocomplete restrictions (Script -> Redeemer -> TxOut -> Datum)
 * for transactions like spending, minting, withdrawing, and voting, dropping standalone
 * script methods to prevent incorrect chained execution ordering.
 *
 * @example
 * ```typescript
 * const tx = new MeshTxBuilderV2({
 *   fetcher: provider,
 *   evaluator: provider,
 * });
 *
 * tx.spendPlutusV3(txHash, index)
 *   .script(scriptCbor)
 *   .redeemerJson(redeemerValue)
 *   .txOut(address, assets)
 *   .datumJson(datumValue); // Drops you back into the main builder methods
 * ```
 */

export const MeshTxBuilderV2: new (
  options?: MeshTxBuilderOptions,
) => _MeshTxBuilderV2 = TxBuilderV2;
