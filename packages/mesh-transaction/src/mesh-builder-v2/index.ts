import type {
  _MeshTxBuilderV2,
  BuilderData,
  MintRedeemerBuilder,
  MintScriptBuilder,
  MintTxOutBuilder,
  RefTxIn,
  SpendDatumBuilder,
  SpendRedeemerBuilder,
  SpendScriptBuilder,
  SpendTxOutBuilder,
  Voter,
  VoteRedeemerBuilder,
  VoteScriptBuilder,
  VotingProcedure,
  WithdrawRedeemerBuilder,
  WithdrawScriptBuilder,
} from "@meshsdk/common";
import { Asset, Budget, DEFAULT_REDEEMER_BUDGET } from "@meshsdk/common";
import { MeshTxBuilder, MeshTxBuilderOptions } from "@meshsdk/core";

import { MeshTxBuilderCore } from "../mesh-tx-builder/tx-builder-core";

class SpendBuilderImpl
  implements
    SpendRedeemerBuilder,
    SpendScriptBuilder,
    SpendDatumBuilder,
    SpendTxOutBuilder
{
  constructor(private readonly core: MeshTxBuilder) {}

  redeemerJson(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): SpendScriptBuilder {
    this.core.txInRedeemerValue(
      redeemer,
      "JSON",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this;
  }

  redeemerCbor(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): SpendScriptBuilder {
    this.core.txInRedeemerValue(
      redeemer,
      "CBOR",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this;
  }

  script(scriptCbor: string): SpendDatumBuilder {
    this.core.txInScript(scriptCbor);
    return this;
  }

  referenceScript(
    refTxHash: string,
    refTxIndex: number,
    scriptSize?: string,
    scriptHash?: string,
  ): SpendDatumBuilder {
    this.core.spendingTxInReference(
      refTxHash,
      refTxIndex,
      scriptSize,
      scriptHash,
    );
    return this;
  }

  datumJson(datum: BuilderData["content"]): SpendTxOutBuilder {
    this.core.txOutInlineDatumValue(datum, "JSON");
    return this;
  }

  datumCbor(datum: BuilderData["content"]): SpendTxOutBuilder {
    this.core.txOutInlineDatumValue(datum, "CBOR");
    return this;
  }

  datumHash(datumHash: string): SpendTxOutBuilder {
    this.core.txOutDatumHashValue(datumHash);
    return this;
  }

  txOut(address: string, amount: Asset[]): _MeshTxBuilderV2 {
    this.core.txInInlineDatumPresent();
    this.core.txOut(address, amount);
    return this.core as unknown as _MeshTxBuilderV2;
  }
}

class MintBuilderImpl
  implements MintRedeemerBuilder, MintScriptBuilder, MintTxOutBuilder
{
  constructor(private readonly core: MeshTxBuilder) {}

  redeemerJson(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): MintScriptBuilder {
    this.core.mintRedeemerValue(
      redeemer,
      "JSON",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this;
  }

  redeemerCbor(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): MintScriptBuilder {
    this.core.mintRedeemerValue(
      redeemer,
      "CBOR",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this;
  }

  script(scriptCbor: string): MintTxOutBuilder {
    this.core.mintingScript(scriptCbor);
    return this;
  }

  referenceScript(
    txHash: string,
    txIndex: number,
    scriptSize?: string,
    scriptHash?: string,
  ): MintTxOutBuilder {
    this.core.mintTxInReference(txHash, txIndex, scriptSize, scriptHash);
    return this;
  }

  txOut(address: string, amount: Asset[]): _MeshTxBuilderV2 {
    this.core.txOut(address, amount);
    return this.core as unknown as _MeshTxBuilderV2;
  }
}

class WithdrawBuilderImpl
  implements WithdrawRedeemerBuilder, WithdrawScriptBuilder
{
  constructor(private readonly core: MeshTxBuilder) {}

  redeemerJson(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): WithdrawScriptBuilder {
    this.core.withdrawalRedeemerValue(
      redeemer,
      "JSON",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this;
  }

  redeemerCbor(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): WithdrawScriptBuilder {
    this.core.withdrawalRedeemerValue(
      redeemer,
      "CBOR",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this;
  }

  script(scriptCbor: string): _MeshTxBuilderV2 {
    this.core.withdrawalScript(scriptCbor);
    return this.core as unknown as _MeshTxBuilderV2;
  }

  referenceScript(
    txHash: string,
    txIndex: number,
    scriptSize?: string,
    scriptHash?: string,
  ): _MeshTxBuilderV2 {
    this.core.withdrawalTxInReference(txHash, txIndex, scriptSize, scriptHash);
    return this.core as unknown as _MeshTxBuilderV2;
  }
}

class VoteBuilderImpl implements VoteRedeemerBuilder, VoteScriptBuilder {
  constructor(private readonly core: MeshTxBuilder) {}

  redeemerJson(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): VoteScriptBuilder {
    this.core.voteRedeemerValue(
      redeemer,
      "JSON",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this;
  }

  redeemerCbor(
    redeemer: BuilderData["content"],
    exUnits?: Budget,
  ): VoteScriptBuilder {
    this.core.voteRedeemerValue(
      redeemer,
      "CBOR",
      exUnits ?? { ...DEFAULT_REDEEMER_BUDGET },
    );
    return this;
  }

  script(scriptCbor: string): _MeshTxBuilderV2 {
    this.core.voteScript(scriptCbor);
    return this.core as unknown as _MeshTxBuilderV2;
  }

  referenceScript(
    txHash: string,
    txIndex: number,
    scriptSize?: string,
    scriptHash?: string,
  ): _MeshTxBuilderV2 {
    this.core.voteTxInReference(txHash, txIndex, scriptSize, scriptHash);
    return this.core as unknown as _MeshTxBuilderV2;
  }
}

class __MeshTxBuilderV2 extends MeshTxBuilder {
  spendPlutusV1(txHash: string, txIndex: number): SpendRedeemerBuilder {
    this.spendingPlutusScriptV1();
    this.txIn(txHash, txIndex);
    return new SpendBuilderImpl(this);
  }
  spendPlutusV2(txHash: string, txIndex: number): SpendRedeemerBuilder {
    this.spendingPlutusScriptV2();
    this.txIn(txHash, txIndex);
    return new SpendBuilderImpl(this);
  }
  spendPlutusV3(txHash: string, txIndex: number): SpendRedeemerBuilder {
    this.spendingPlutusScriptV3();
    this.txIn(txHash, txIndex);
    return new SpendBuilderImpl(this);
  }

  mintPlutusV1(
    quantity: string,
    policyId: string,
    assetName: string,
  ): MintRedeemerBuilder {
    this.mintPlutusScriptV1();
    this.mint(quantity, policyId, assetName);
    return new MintBuilderImpl(this);
  }
  mintPlutusV2(
    quantity: string,
    policyId: string,
    assetName: string,
  ): MintRedeemerBuilder {
    this.mintPlutusScriptV2();
    this.mint(quantity, policyId, assetName);
    return new MintBuilderImpl(this);
  }
  mintPlutusV3(
    quantity: string,
    policyId: string,
    assetName: string,
  ): MintRedeemerBuilder {
    this.mintPlutusScriptV3();
    this.mint(quantity, policyId, assetName);
    return new MintBuilderImpl(this);
  }

  withdrawPlutusV1(
    rewardAddress: string,
    coin: string,
  ): WithdrawRedeemerBuilder {
    this.withdrawalPlutusScriptV1();
    this.withdrawal(rewardAddress, coin);
    return new WithdrawBuilderImpl(this);
  }
  withdrawPlutusV2(
    rewardAddress: string,
    coin: string,
  ): WithdrawRedeemerBuilder {
    this.withdrawalPlutusScriptV2();
    this.withdrawal(rewardAddress, coin);
    return new WithdrawBuilderImpl(this);
  }
  withdrawPlutusV3(
    rewardAddress: string,
    coin: string,
  ): WithdrawRedeemerBuilder {
    this.withdrawalPlutusScriptV3();
    this.withdrawal(rewardAddress, coin);
    return new WithdrawBuilderImpl(this);
  }

  votePlutusV1(
    voter: Voter,
    govActionId: RefTxIn,
    votingProcedure: VotingProcedure,
  ): VoteRedeemerBuilder {
    this.votePlutusScriptV1();
    this.vote(voter, govActionId, votingProcedure);
    return new VoteBuilderImpl(this);
  }
  votePlutusV2(
    voter: Voter,
    govActionId: RefTxIn,
    votingProcedure: VotingProcedure,
  ): VoteRedeemerBuilder {
    this.votePlutusScriptV2();
    this.vote(voter, govActionId, votingProcedure);
    return new VoteBuilderImpl(this);
  }
  votePlutusV3(
    voter: Voter,
    govActionId: RefTxIn,
    votingProcedure: VotingProcedure,
  ): VoteRedeemerBuilder {
    this.votePlutusScriptV3();
    this.vote(voter, govActionId, votingProcedure);
    return new VoteBuilderImpl(this);
  }
}

/**
 * `MeshTxBuilderV2` is a strongly-typed wrapper around the core `MeshTxBuilder`
 * that enforces a rigid Type-State machine for Plutus operations.
 *
 * It natively provides TypeScript autocomplete restrictions (Script -> Datum -> Redeemer)
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
 *   .datumJson(datumValue)
 *   .redeemerJson(redeemerValue)
 *   .txOut(address, assets); // Drops you back into the main builder methods
 * ```
 */
export const MeshTxBuilderV2: new (
  options?: MeshTxBuilderOptions,
) => _MeshTxBuilderV2 = __MeshTxBuilderV2;
