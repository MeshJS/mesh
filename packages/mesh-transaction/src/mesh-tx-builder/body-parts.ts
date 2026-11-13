import JSONBig from "json-bigint";

import type {
  Anchor,
  Asset,
  BuilderData,
  Certificate,
  DRep,
  GovernanceAction,
  GovernanceActionId,
  MeshTxBuilderBody,
  MintParam,
  NativeScript,
  Output,
  Proposal,
  ProtocolParamUpdate,
  ProtocolParamUpdatePrototype,
  PubKeyTxIn,
  Rational,
  Redeemer,
  ScriptSource,
  SimpleScriptSourceInfo,
  TxIn,
  UTxO,
  Vote,
  Voter,
  Withdrawal,
} from "@meshsdk/common";
import {
  NativeScript as CstNativeScript,
  fromNativeScript,
  HexBlob,
} from "@meshsdk/core-cst";

import type { PartContext } from "../tx-builder/parts/normalize";
import type {
  AnchorInput,
  CredentialInput,
  CredentialWitnessInput,
  DRepInput,
  NativeScriptInput,
  OutputDatumInput,
  PlutusScriptInput,
  RedeemerInput,
  SpendDatumInput,
  SpendPart,
  TxPart,
  VoterInput,
} from "../tx-builder/parts/types";
import { voterKey } from "../tx-builder/ordering";
import { certificate } from "../tx-builder/parts/certificates";
import { proposal, vote } from "../tx-builder/parts/governance";
import {
  checkLock,
  collateral,
  collateralReturn,
  referenceInput,
  spend,
} from "../tx-builder/parts/inputs";
import { mint } from "../tx-builder/parts/mint";
import {
  fail,
  freeze,
  toResolvableInput,
  withKnownHash,
} from "../tx-builder/parts/normalize";
import { output } from "../tx-builder/parts/output";
import {
  auxiliaryScript,
  donation,
  guard,
  metadata,
  validity,
} from "../tx-builder/parts/scalars";
import { withdrawal } from "../tx-builder/parts/withdrawal";

/** What a translation knows about the outputs the body names by out ref */
export type BodyOutputs = {
  /**
   * The outputs known whole, held by the builder or read, by `txHash#index` (the hash in lower
   * case). One without a reference script does not count for a script reference.
   */
  known: ReadonlyMap<string, UTxO>;
  /**
   * Whether the amount and address declared for an input or collateral that is not known may
   * stand in for its output
   */
  declaredStandsIn: (
    outRef: string,
    entry: { collateral: boolean; script: boolean; scriptSize?: number },
  ) => boolean;
  /** Whether an input also needs its declared `scriptSize` to be built from declared data */
  needsScriptSize: boolean;
  /** Whether redeemers keep the execution units of the calls; else evaluation decides them */
  keepExUnits: boolean;
};

/** The body as parts, with what the build must know of the outputs it has no data for */
export type BodyParts = {
  parts: TxPart[];
  /** Out refs read by reference inputs and scripts the build has no data for, left unread */
  unread: Set<string>;
  /** Reference-script sizes declared for out refs whose output is not known */
  scriptSizes: Map<string, number>;
  /**
   * The body's redeemers by the item they witness: `SPEND:<out ref>`, `MINT:<policy id>`,
   * `CERT:<index>`, `REWARD:<reward address>`, `VOTE:<voter key>`, `VOTING_PROPOSAL:<index>`
   */
  redeemers: Map<string, Redeemer[]>;
  /** Whether a Plutus script runs */
  plutus: boolean;
};

const outRefOf = (txHash: string, txIndex: number) =>
  `${txHash.toLowerCase()}#${txIndex}`;

/** A value compared field by field: maps as their entries, bigints as text */
const comparable = (value: unknown): string =>
  JSONBig.stringify(value, (_key, item: unknown) =>
    item instanceof Map
      ? { map: Array.from(item.entries()) }
      : typeof item === "bigint"
        ? `${item}n`
        : item,
  );

/** Items grouped by a key: equal ones once, any other repeat kept for the builder to refuse */
const mergeRepeats = <T>(
  items: readonly T[],
  key: (item: T) => string,
): T[] => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return Array.from(groups.values()).flatMap((group) => {
    const first = comparable(group[0]);
    return group.every((item) => comparable(item) === first)
      ? [group[0]!]
      : group;
  });
};

/** The lovelace and assets of an `Asset[]`, summed by unit; zero quantities left out */
const toValue = (amount: readonly Asset[]): Record<string, bigint> => {
  const value: Record<string, bigint> = {};
  for (const { unit, quantity } of amount) {
    const key = unit === "" ? "lovelace" : unit;
    value[key] = (value[key] ?? 0n) + BigInt(quantity);
  }
  for (const [unit, quantity] of Object.entries(value))
    if (quantity === 0n) delete value[unit];
  return value;
};

const toAnchorInput = (anchor: Anchor): AnchorInput => ({
  url: anchor.anchorUrl,
  dataHash: anchor.anchorDataHash,
});

const toDRepInput = (drep: DRep): DRepInput => {
  if ("dRepId" in drep) return drep.dRepId;
  if ("alwaysAbstain" in drep) return "alwaysAbstain";
  return "alwaysNoConfidence";
};

/** A credential as the old API's governance types hold it */
type MeshCredential = Extract<
  Voter,
  { type: "ConstitutionalCommittee" }
>["hotCred"];

const toCredentialInput = (credential: MeshCredential): CredentialInput =>
  credential.type === "KeyHash"
    ? { type: "KEY", value: credential.keyHash }
    : { type: "SCRIPT", value: credential.scriptHash };

/**
 * Translates a `MeshTxBuilderBody` into parts. Read-only reference inputs whose out ref is also
 * spent are left out, and exact repeats of an input or a withdrawal merged; other repeats are
 * kept, and the builder refuses them.
 */
export const bodyToParts = (
  body: MeshTxBuilderBody,
  outputs: BodyOutputs,
): BodyParts => {
  const unread = new Set<string>();
  const scriptSizes = new Map<string, number>();
  const redeemers = new Map<string, Redeemer[]>();
  const parts: TxPart[] = [];

  const declareSize = (key: string, size: number | string | undefined) => {
    const declared = Number(size ?? 0);
    if (!(declared > 0)) return;
    scriptSizes.set(key, Math.max(scriptSizes.get(key) ?? 0, declared));
  };
  const addRedeemer = (key: string, redeemer: Redeemer | undefined) => {
    if (redeemer) redeemers.set(key, [...(redeemers.get(key) ?? []), redeemer]);
  };
  /** The output holding a script, when known with its script */
  const knownScriptHolder = (txHash: string, txIndex: number) => {
    const utxo = outputs.known.get(outRefOf(txHash, txIndex));
    return utxo?.output.scriptRef ? utxo : undefined;
  };

  const toRedeemerInput = (redeemer: Redeemer | undefined): RedeemerInput => ({
    data: (redeemer?.data ?? { type: "Mesh", content: "" }) as BuilderData,
    ...(outputs.keepExUnits && redeemer && { exUnits: redeemer.exUnits }),
  });

  /** A Plutus script: attached, or by reference with the declared hints when not known */
  const toPlutusScript = (source: ScriptSource): PlutusScriptInput => {
    if (source.type === "Provided")
      return { code: source.script.code, version: source.script.version };
    const held = knownScriptHolder(source.txHash, source.txIndex);
    if (held) return { reference: held };
    const size = Number(source.scriptSize ?? 0);
    return {
      reference: { txHash: source.txHash, outputIndex: source.txIndex },
      ...(source.scriptHash && { scriptHash: source.scriptHash.toLowerCase() }),
      ...(size > 0 && { scriptSize: size }),
      ...(source.version && { version: source.version }),
    };
  };

  /** A native script: attached, or by reference with the declared hints when not known */
  const toNativeScript = (
    source: SimpleScriptSourceInfo | ScriptSource,
  ): NativeScriptInput => {
    if (source.type === "Provided")
      return "scriptCode" in source ? source.scriptCode : source.script.code;
    const held = knownScriptHolder(source.txHash, source.txIndex);
    if (held) return { reference: held };
    const hash =
      "simpleScriptHash" in source
        ? source.simpleScriptHash
        : "scriptHash" in source
          ? source.scriptHash
          : undefined;
    const size = Number(source.scriptSize ?? 0);
    return {
      reference: { txHash: source.txHash, outputIndex: source.txIndex },
      ...(hash && { scriptHash: hash.toLowerCase() }),
      ...(size > 0 && { scriptSize: size }),
    };
  };

  /**
   * Adds a part, and leaves unread the reference script it names when its declared hash, size
   * and version make it complete: the build then takes it as declared
   */
  const add = <P extends TxPart>(part: P): P => {
    parts.push(part);
    if (!("witness" in part)) return part;
    const { witness } = part;
    if (witness.type !== "native" && witness.type !== "plutus") return part;
    const { script } = witness;
    if (script.type !== "reference" || script.utxo) return part;
    const complete =
      script.scriptHash !== undefined &&
      script.scriptSize !== undefined &&
      (!("version" in script) || script.version !== undefined);
    if (complete) {
      const key = `${script.input.transaction_id}#${script.input.index}`;
      unread.add(key);
      declareSize(key, script.scriptSize);
    }
    return part;
  };

  /** A witness for a certificate, vote or proposal credential */
  const credentialWitness = (
    native?: SimpleScriptSourceInfo,
    plutus?: ScriptSource,
    redeemer?: Redeemer,
  ): CredentialWitnessInput | undefined => {
    if (native) return { native: toNativeScript(native) };
    if (plutus)
      return {
        plutus: toPlutusScript(plutus),
        redeemer: toRedeemerInput(redeemer),
      };
    return undefined;
  };

  // Inputs: exact repeats merge, others are the builder's to refuse
  const spent = new Set<string>();
  for (const input of mergeRepeats(body.inputs, (i) =>
    outRefOf(i.txIn.txHash, i.txIn.txIndex),
  )) {
    const key = outRefOf(input.txIn.txHash, input.txIn.txIndex);
    spent.add(key);
    add(spendPart(input, key));
    if (input.type === "Script")
      addRedeemer(`SPEND:${key}`, input.scriptTxIn.redeemer);
  }

  function spendPart(input: TxIn, key: string): SpendPart {
    const { txHash, txIndex, amount, address, scriptSize } = input.txIn;
    const ref = { txHash, outputIndex: txIndex };
    const known = outputs.known.get(key);
    const declared =
      !known &&
      amount !== undefined &&
      amount.length > 0 &&
      !!address &&
      (!outputs.needsScriptSize || scriptSize !== undefined) &&
      outputs.declaredStandsIn(key, {
        collateral: false,
        script: input.type === "Script",
        ...(scriptSize !== undefined && { scriptSize }),
      });
    const built: UTxO | undefined = declared
      ? { input: ref, output: { address: address!, amount: amount! } }
      : undefined;
    if (built) declareSize(key, scriptSize);
    const utxo = known ?? built;

    if (input.type === "PubKey") return spend.pubKey({ utxo: utxo ?? ref });
    if (input.type === "SimpleScript")
      return spend.native({
        utxo: utxo ?? ref,
        script: toNativeScript(input.simpleScriptTxIn.scriptSource!),
      });

    const { scriptSource, datumSource, redeemer } = input.scriptTxIn;
    // A datum held inline is taken from an output known whole; an output built from declared
    // data holds none, so the datum is as the call names it
    const datum: SpendDatumInput | undefined =
      datumSource?.type === "Provided"
        ? { data: datumSource.data as BuilderData }
        : built
          ? "inline"
          : undefined;
    const params = {
      script: toPlutusScript(scriptSource!),
      redeemer: toRedeemerInput(redeemer),
      ...(datum !== undefined && { datum }),
    };
    if (!built) return spend.plutus({ utxo: utxo ?? ref, ...params });
    // Made from the out ref, so that the datum is not checked against an output that holds
    // none; the built output is then checked for its lock only
    const part = spend.plutus({ utxo: ref, ...params });
    const ctx: PartContext = { part: "spend" };
    const { utxo: copy } = toResolvableInput(ctx, built);
    const witness = part.witness as Extract<
      SpendPart["witness"],
      { type: "plutus" }
    >;
    const script = withKnownHash(
      witness.script,
      checkLock(ctx, copy, { type: "script", hash: witness.script.scriptHash }),
    );
    return freeze({ ...part, utxo: copy, witness: { ...witness, script } });
  }

  // A read-only reference to an out ref that is also spent is left out
  for (const ref of body.referenceInputs) {
    const key = outRefOf(ref.txHash, ref.txIndex);
    if (spent.has(key)) continue;
    const known = outputs.known.get(key);
    if (known) {
      add(referenceInput({ utxo: known }));
      continue;
    }
    unread.add(key);
    declareSize(key, ref.scriptSize);
    add(
      referenceInput({
        utxo: { txHash: ref.txHash, outputIndex: ref.txIndex },
      }),
    );
  }

  for (const out of body.outputs) add(outputPart(out));

  for (const input of body.collaterals) add(collateralPart(input));

  function collateralPart(input: PubKeyTxIn) {
    const { txHash, txIndex, amount, address } = input.txIn;
    const key = outRefOf(txHash, txIndex);
    const known = outputs.known.get(key);
    if (known) return collateral({ utxo: known });
    const declared =
      amount !== undefined &&
      amount.length > 0 &&
      !!address &&
      outputs.declaredStandsIn(key, { collateral: true, script: false });
    return collateral({
      utxo: declared
        ? {
            input: { txHash, outputIndex: txIndex },
            output: { address, amount },
          }
        : { txHash, outputIndex: txIndex },
    });
  }

  if (body.totalCollateral !== undefined || body.collateralReturnAddress)
    add(
      collateralReturn({
        address: body.collateralReturnAddress || body.changeAddress,
        ...(body.totalCollateral !== undefined && {
          totalCollateral: BigInt(body.totalCollateral),
        }),
      }),
    );

  for (const keyHash of new Set(body.requiredSignatures))
    add(guard.pubKey({ keyHash }));

  for (const item of body.mints) {
    add(mintPart(item));
    if (item.type === "Plutus")
      addRedeemer(`MINT:${item.policyId.toLowerCase()}`, item.redeemer);
  }

  function mintPart(item: MintParam) {
    const assets: Record<string, bigint> = {};
    for (const { assetName, amount } of item.mintValue)
      assets[assetName] = (assets[assetName] ?? 0n) + BigInt(amount);
    if (item.type === "Native")
      return mint.native({
        script: toNativeScript(item.scriptSource!),
        assets,
        policyId: item.policyId,
      });
    return mint.plutus({
      script: toPlutusScript(item.scriptSource as ScriptSource),
      redeemer: toRedeemerInput(item.redeemer),
      assets,
      policyId: item.policyId,
    });
  }

  for (const item of mergeRepeats(body.withdrawals, (w) => w.address)) {
    const part = add(withdrawalPart(item));
    if (item.type === "ScriptWithdrawal")
      addRedeemer(`REWARD:${part.rewardAddress}`, item.redeemer);
  }

  function withdrawalPart(item: Withdrawal) {
    const params = { rewardAddress: item.address, amount: BigInt(item.coin) };
    if (item.type === "PubKeyWithdrawal") return withdrawal.pubKey(params);
    if (item.type === "SimpleScriptWithdrawal")
      return withdrawal.native({
        ...params,
        script: toNativeScript(item.scriptSource!),
      });
    return withdrawal.plutus({
      ...params,
      script: toPlutusScript(item.scriptSource!),
      redeemer: toRedeemerInput(item.redeemer),
    });
  }

  body.certificates.forEach((item, i) => {
    add(certificatePart(item));
    if (item.type === "ScriptCertificate")
      addRedeemer(`CERT:${i}`, item.redeemer);
  });

  function certificatePart(item: Certificate) {
    const witness =
      item.type === "SimpleScriptCertificate"
        ? credentialWitness(item.simpleScriptSource)
        : item.type === "ScriptCertificate"
          ? credentialWitness(undefined, item.scriptSource, item.redeemer)
          : undefined;
    const w = witness ? { witness } : {};
    const cert = item.certType;
    switch (cert.type) {
      case "RegisterStake":
        return certificate.legacyStakeRegistration({
          stake: cert.stakeKeyAddress,
        });
      case "DeregisterStake":
        return certificate.legacyStakeDeregistration({
          stake: cert.stakeKeyAddress,
          ...w,
        });
      case "DelegateStake":
        return certificate.stakeDelegation({
          stake: cert.stakeKeyAddress,
          pool: cert.poolId,
          ...w,
        });
      case "RegisterPool":
        return certificate.poolRegistration({ params: cert.poolParams });
      case "RetirePool":
        return certificate.poolRetirement({
          pool: cert.poolId,
          epoch: cert.epoch,
        });
      case "VoteDelegation":
        return certificate.voteDelegation({
          stake: cert.stakeKeyAddress,
          drep: toDRepInput(cert.drep),
          ...w,
        });
      case "StakeAndVoteDelegation":
        return certificate.stakeAndVoteDelegation({
          stake: cert.stakeKeyAddress,
          pool: cert.poolKeyHash,
          drep: toDRepInput(cert.drep),
          ...w,
        });
      case "StakeRegistrationAndDelegation":
        return certificate.stakeRegistrationAndDelegation({
          stake: cert.stakeKeyAddress,
          pool: cert.poolKeyHash,
          deposit: BigInt(cert.coin),
          ...w,
        });
      case "VoteRegistrationAndDelegation":
        return certificate.voteRegistrationAndDelegation({
          stake: cert.stakeKeyAddress,
          drep: toDRepInput(cert.drep),
          deposit: BigInt(cert.coin),
          ...w,
        });
      case "StakeVoteRegistrationAndDelegation":
        return certificate.stakeVoteRegistrationAndDelegation({
          stake: cert.stakeKeyAddress,
          pool: cert.poolKeyHash,
          drep: toDRepInput(cert.drep),
          deposit: BigInt(cert.coin),
          ...w,
        });
      case "CommitteeHotAuth":
        return certificate.committeeHotAuth({
          cold: cert.committeeColdKeyAddress,
          hot: cert.committeeHotKeyAddress,
          ...w,
        });
      case "CommitteeColdResign":
        return certificate.committeeColdResign({
          cold: cert.committeeColdKeyAddress,
          ...(cert.anchor && { anchor: toAnchorInput(cert.anchor) }),
          ...w,
        });
      case "DRepRegistration":
        return certificate.drepRegistration({
          drep: cert.drepId,
          deposit: BigInt(cert.coin),
          ...(cert.anchor && { anchor: toAnchorInput(cert.anchor) }),
          ...w,
        });
      case "DRepDeregistration":
        return certificate.drepDeregistration({
          drep: cert.drepId,
          refund: BigInt(cert.coin),
          ...w,
        });
      case "DRepUpdate":
        return certificate.drepUpdate({
          drep: cert.drepId,
          ...(cert.anchor && { anchor: toAnchorInput(cert.anchor) }),
          ...w,
        });
    }
  }

  // The votes of one voter make one part, with one witness
  const byVoter = new Map<string, Vote[]>();
  for (const item of body.votes) {
    const key = comparable(item.vote.voter);
    byVoter.set(key, [...(byVoter.get(key) ?? []), item]);
  }
  for (const group of byVoter.values()) {
    const first = group[0]!;
    const witness =
      first.type === "SimpleScriptVote"
        ? credentialWitness(first.simpleScriptSource)
        : first.type === "ScriptVote"
          ? credentialWitness(undefined, first.scriptSource, first.redeemer)
          : undefined;
    const part = add(
      vote({
        voter: toVoterInput(first.vote.voter),
        votes: group.map(({ vote: v }) => ({
          action: {
            txHash: v.govActionId.txHash,
            index: v.govActionId.txIndex,
          },
          vote: v.votingProcedure.voteKind.toLowerCase() as
            "yes" | "no" | "abstain",
          ...(v.votingProcedure.anchor && {
            anchor: toAnchorInput(v.votingProcedure.anchor),
          }),
        })),
        ...(witness && { witness }),
      }),
    );
    const key = voterKey(part.voter);
    for (const item of group)
      if (item.type === "ScriptVote") addRedeemer(`VOTE:${key}`, item.redeemer);
  }

  body.proposals.forEach((item, i) => {
    add(proposalPart(item));
    if (item.type === "ScriptProposal")
      addRedeemer(`VOTING_PROPOSAL:${i}`, item.redeemer);
  });

  const { invalidBefore, invalidHereafter } = body.validityRange;
  // A slot of 0 is no bound
  if (invalidBefore || invalidHereafter)
    add(
      validity({
        ...(invalidBefore && { invalidBefore }),
        ...(invalidHereafter && { invalidHereafter }),
      }),
    );

  for (const [label, value] of body.metadata)
    add(metadata({ metadataLabel: label, value: value as never }));

  for (const { scriptCbor, scriptType } of body.scriptMetadata)
    add(
      auxiliaryScript({
        script:
          scriptType === "Native"
            ? (fromNativeScript(
                CstNativeScript.fromCbor(HexBlob(scriptCbor)),
              ) as NativeScript)
            : {
                code: scriptCbor,
                version: scriptType.slice("Plutus".length) as
                  "V1" | "V2" | "V3",
              },
      }),
    );

  if (body.donation !== undefined)
    add(donation({ amount: BigInt(body.donation) }));

  return {
    parts,
    unread,
    scriptSizes,
    redeemers,
    plutus: parts.some(
      (part) => "witness" in part && part.witness.type === "plutus",
    ),
  };

  function outputPart(out: Output) {
    const value = toValue(out.amount);
    const zeroCoin = out.amount.some(
      (a) =>
        (a.unit === "lovelace" || a.unit === "") && BigInt(a.quantity) === 0n,
    );
    const datum: OutputDatumInput | undefined = out.datum
      ? out.datum.type === "Inline"
        ? { type: "inline", data: out.datum.data }
        : {
            type: "hash",
            data: out.datum.data,
            embed: out.datum.type === "Embedded",
          }
      : undefined;
    const part = output({
      address: out.address,
      value,
      ...(datum && { datum }),
      ...(out.referenceScript && { scriptRef: out.referenceScript }),
    });
    // A lovelace of 0 is kept as given: enough where storage is free, else below the minimum
    if (!zeroCoin || value.lovelace !== undefined) return part;
    return freeze({
      ...part,
      output: { ...part.output, amount: { ...part.output.amount, coin: "0" } },
    });
  }

  function proposalPart(item: Proposal) {
    const { governanceAction, anchor, rewardAccount, deposit } =
      item.proposalType;
    const base = {
      rewardAccount,
      anchor: toAnchorInput(anchor),
      deposit: BigInt(deposit),
    };
    const guardrail =
      item.type === "SimpleScriptProposal"
        ? credentialWitness(item.simpleScriptSource)
        : item.type === "ScriptProposal"
          ? credentialWitness(undefined, item.scriptSource, item.redeemer)
          : undefined;
    return governanceProposal(governanceAction, base, guardrail);
  }
};

/** The voter of a body's vote as the vote part takes it */
const toVoterInput = (voter: Voter): VoterInput => {
  switch (voter.type) {
    case "ConstitutionalCommittee":
      return { committee: toCredentialInput(voter.hotCred) };
    case "DRep":
      return { drep: voter.drepId };
    case "StakingPool":
      return { pool: voter.keyHash };
  }
};

const toPrevious = (id: GovernanceActionId | undefined) =>
  id
    ? { previous: { txHash: id.transactionId, index: id.govActionIndex } }
    : {};

/** A proposal part for a governance action of the old API */
const governanceProposal = (
  action: GovernanceAction,
  base: { rewardAccount: string; anchor: AnchorInput; deposit: bigint },
  guardrail: CredentialWitnessInput | undefined,
) => {
  const guarded = (policyHash: { bytes: string } | undefined) => ({
    ...(guardrail && { guardrail }),
    ...(policyHash && { policyHash: policyHash.bytes }),
  });
  switch (action.kind) {
    case "InfoAction":
      return proposal.info(base);
    case "NoConfidenceAction":
      return proposal.noConfidence({
        ...base,
        ...toPrevious(action.action.govActionId),
      });
    case "HardForkInitiationAction":
      return proposal.hardForkInitiation({
        ...base,
        protocolVersion: action.action.protocolVersion,
        ...toPrevious(action.action.govActionId),
      });
    case "TreasuryWithdrawalsAction":
      return proposal.treasuryWithdrawals({
        ...base,
        withdrawals: Object.fromEntries(
          Object.entries(action.action.withdrawals).map(([address, coin]) => [
            address,
            BigInt(coin),
          ]),
        ),
        ...guarded(action.action.policyHash),
      });
    case "UpdateCommitteeAction":
      return proposal.updateCommittee({
        ...base,
        remove: action.action.membersToRemove.map(toCredentialInput),
        add: action.action.committee.members.map((member) => ({
          credential: toCredentialInput(member.stakeCredential),
          termLimit: member.termLimit,
        })),
        quorum: {
          numerator: BigInt(action.action.committee.quorumThreshold.numerator),
          denominator: BigInt(
            action.action.committee.quorumThreshold.denominator,
          ),
        },
        ...toPrevious(action.action.govActionId),
      });
    case "NewConstitutionAction":
      return proposal.newConstitution({
        ...base,
        constitution: {
          anchor: toAnchorInput(action.action.constitution.anchor),
          ...(action.action.constitution.scriptHash && {
            scriptHash: action.action.constitution.scriptHash.bytes,
          }),
        },
        ...toPrevious(action.action.govActionId),
      });
    case "ParameterChangeAction":
      return proposal.parameterChange({
        ...base,
        updates: toParamUpdate(action.action.protocolParamUpdates),
        ...toPrevious(action.action.govActionId),
        ...guarded(action.action.policyHash),
      });
  }
};

const ratio = (r: Rational) => ({
  numerator: r.numerator,
  denominator: r.denominator,
});

/**
 * Every member of a set of voting thresholds, as a proposal holds them all
 * @throws TxPartError INVALID_DATA for a set that leaves one out
 */
const allOf = <K extends string>(
  what: string,
  thresholds: Partial<Record<K, Rational>>,
  keys: Record<K, string>,
): Record<string, { numerator: string; denominator: string }> => {
  const result: Record<string, { numerator: string; denominator: string }> = {};
  for (const [key, field] of Object.entries(keys) as [K, string][]) {
    const value = thresholds[key];
    if (!value)
      fail(
        { part: "proposal" },
        "INVALID_DATA",
        `${what} must all be given; ${key} is missing`,
      );
    result[field] = ratio(value!);
  }
  return result;
};

/** A protocol parameter update of the old API, as a parameter change proposal holds it */
const toParamUpdate = (
  u: ProtocolParamUpdate,
): ProtocolParamUpdatePrototype => {
  const r: ProtocolParamUpdatePrototype = {};
  if (u.minFeeA !== undefined) r.minfee_a = u.minFeeA;
  if (u.minFeeB !== undefined) r.minfee_b = u.minFeeB;
  if (u.maxBlockBodySize !== undefined)
    r.max_block_body_size = u.maxBlockBodySize;
  if (u.maxTxSize !== undefined) r.max_tx_size = u.maxTxSize;
  if (u.maxBlockHeaderSize !== undefined)
    r.max_block_header_size = u.maxBlockHeaderSize;
  if (u.keyDeposit !== undefined) r.key_deposit = u.keyDeposit;
  if (u.poolDeposit !== undefined) r.pool_deposit = u.poolDeposit;
  if (u.maxEpoch !== undefined) r.max_epoch = u.maxEpoch;
  if (u.nOpt !== undefined) r.n_opt = u.nOpt;
  if (u.poolPledgeInfluence)
    r.pool_pledge_influence = ratio(u.poolPledgeInfluence);
  if (u.expansionRate) r.expansion_rate = ratio(u.expansionRate);
  if (u.treasuryGrowthRate)
    r.treasury_growth_rate = ratio(u.treasuryGrowthRate);
  if (u.minPoolCost !== undefined) r.min_pool_cost = u.minPoolCost;
  if (u.adaPerUtxoByte !== undefined) r.ada_per_utxo_byte = u.adaPerUtxoByte;
  if (u.costModels)
    r.cost_models = Object.fromEntries(
      Object.entries(u.costModels).map(([version, model]) => [
        `Plutus${version}`,
        model.map(String),
      ]),
    );
  if (u.executionCosts?.memPrice && u.executionCosts.stepPrice)
    r.execution_costs = {
      mem_price: ratio(u.executionCosts.memPrice),
      step_price: ratio(u.executionCosts.stepPrice),
    };
  if (u.maxTxExUnits)
    r.max_tx_ex_units = {
      mem: u.maxTxExUnits.mem,
      steps: u.maxTxExUnits.steps,
    };
  if (u.maxBlockExUnits)
    r.max_block_ex_units = {
      mem: u.maxBlockExUnits.mem,
      steps: u.maxBlockExUnits.steps,
    };
  if (u.maxValueSize !== undefined) r.max_value_size = u.maxValueSize;
  if (u.collateralPercentage !== undefined)
    r.collateral_percentage = u.collateralPercentage;
  if (u.maxCollateralInputs !== undefined)
    r.max_collateral_inputs = u.maxCollateralInputs;
  if (u.poolVotingThresholds)
    r.pool_voting_thresholds = allOf(
      "pool voting thresholds",
      u.poolVotingThresholds,
      {
        motionNoConfidence: "motion_no_confidence",
        committeeNormal: "committee_normal",
        committeeNoConfidence: "committee_no_confidence",
        hardForkInitiation: "hard_fork_initiation",
        ppSecurityGroup: "security_relevant_threshold",
      },
    ) as unknown as ProtocolParamUpdatePrototype["pool_voting_thresholds"];
  if (u.drepVotingThresholds)
    r.drep_voting_thresholds = allOf(
      "DRep voting thresholds",
      u.drepVotingThresholds,
      {
        motionNoConfidence: "motion_no_confidence",
        committeeNormal: "committee_normal",
        committeeNoConfidence: "committee_no_confidence",
        updateConstitution: "update_constitution",
        hardForkInitiation: "hard_fork_initiation",
        ppNetworkGroup: "pp_network_group",
        ppEconomicGroup: "pp_economic_group",
        ppTechnicalGroup: "pp_technical_group",
        ppGovGroup: "pp_governance_group",
        treasuryWithdrawal: "treasury_withdrawal",
      },
    ) as unknown as ProtocolParamUpdatePrototype["drep_voting_thresholds"];
  if (u.minCommitteeSize !== undefined)
    r.min_committee_size = u.minCommitteeSize;
  if (u.committeeTermLimit !== undefined)
    r.committee_term_limit = u.committeeTermLimit;
  if (u.govActionValidityPeriod !== undefined)
    r.governance_action_validity_period = u.govActionValidityPeriod;
  if (u.govActionDeposit !== undefined)
    r.governance_action_deposit = u.govActionDeposit;
  if (u.drepDeposit !== undefined) r.drep_deposit = u.drepDeposit;
  if (u.drepInactivityPeriod !== undefined)
    r.drep_inactivity_period = u.drepInactivityPeriod;
  if (u.refScriptCostPerByte)
    r.ref_script_coins_per_byte = ratio(u.refScriptCostPerByte);
  return r;
};
