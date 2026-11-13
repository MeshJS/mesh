import type {
  AuxiliaryDataPrototype,
  BootstrapWitnessPrototype,
  CertificatePrototype,
  ExUnitsPrototype,
  LanguageVersion,
  MintPrototype,
  NativeScriptPrototype,
  PlutusDataVariant,
  RedeemerPrototype,
  RedeemerTagPrototype,
  TransactionBodyPrototype,
  TransactionInputPrototype,
  TransactionOutputPrototype,
  TransactionPrototype,
  TransactionWitnessSetPrototype,
  TxMetadataPrototype,
  UTxO,
  VkeywitnessPrototype,
  VoterVotesPrototype,
  VotingProposalPrototype,
} from "@meshsdk/common";
import {
  plutusDataVariantToCardano,
  transactionPrototypeToHex,
} from "@meshsdk/core-cst";

import type { PartGaps } from "./errors";
import type {
  AuxiliaryScriptPart,
  CertificatePart,
  CollateralPart,
  CollateralReturnPart,
  DonationPart,
  GuardPart,
  InputRef,
  MetadataPart,
  MintPart,
  NativeScriptSource,
  NetworkIdPart,
  OutputPart,
  OutRef,
  PlutusDataInput,
  PlutusScriptSource,
  PlutusWitness,
  ProposalPart,
  RedeemerContext,
  ReferenceInputPart,
  SpendPart,
  TreasuryValuePart,
  TxPart,
  ValidityPart,
  VotePart,
  WithdrawalPart,
} from "./parts/types";
import { TxBuildError } from "./errors";
import { auxiliaryDataHashOf, scriptDataHashOf } from "./hashes";
import {
  compareHashes,
  compareInputs,
  compareRewardAddresses,
  compareVoters,
  voterKey,
} from "./ordering";
import { encodePlutusData, errorText } from "./parts/normalize";
import { unresolved } from "./parts/unresolved";
import {
  addValues,
  fromAssets,
  subtractValues,
  toValuePrototype,
} from "./value";

export type AssembleTxOptions = {
  /** The fee, in lovelace */
  fee: bigint;
  /**
   * Cost models by Plutus language number, V1 first, for the script data hash. Every Plutus
   * version the transaction runs needs its model: MISSING_PARAMETER otherwise.
   */
  costModels?: readonly (readonly number[])[];
  /** Key witnesses to put in the witness set, e.g. placeholders when sizing the transaction */
  vkeyWitnesses?: readonly VkeywitnessPrototype[];
  /** Bootstrap witnesses to put in the witness set */
  bootstrapWitnesses?: readonly BootstrapWitnessPrototype[];
};

/** A part that runs a Plutus script, and so takes a redeemer */
export type RedeemerPart =
  | SpendPart
  | MintPart
  | WithdrawalPart
  | CertificatePart
  | VotePart
  | ProposalPart;

/** A redeemer of the assembled transaction, with the part it belongs to */
export type AssembledRedeemer = {
  tag: RedeemerTagPrototype["type"];
  /** Position of the witnessed item in the ledger's order for the redeemer's purpose */
  index: number;
  exUnits: ExUnitsPrototype;
  part: RedeemerPart;
  /** The part's label, if any */
  label?: string;
};

export type AssembledTx = {
  prototype: TransactionPrototype;
  /** Every redeemer, in the order of the witness set */
  redeemers: AssembledRedeemer[];
  /** Every Plutus version the transaction runs, attached or referenced */
  languages: Set<LanguageVersion>;
};

type PartsByKind = { [K in TxPart["kind"]]: Extract<TxPart, { kind: K }>[] };

const groupParts = (parts: readonly TxPart[]): PartsByKind => {
  const groups: PartsByKind = {
    spend: [],
    referenceInput: [],
    collateral: [],
    collateralReturn: [],
    output: [],
    mint: [],
    withdrawal: [],
    guard: [],
    validity: [],
    metadata: [],
    auxiliaryScript: [],
    donation: [],
    treasuryValue: [],
    networkId: [],
    certificate: [],
    vote: [],
    proposal: [],
  };
  for (const part of parts) (groups[part.kind] as TxPart[]).push(part);
  return groups;
};

const outRef = (input: Readonly<TransactionInputPrototype>) =>
  `${input.transaction_id}#${input.index}`;

/** `item`: the repeated key, or the kind of a part a transaction holds once */
const duplicate = (part: TxPart, message: string, item: string): never => {
  throw new TxBuildError("DUPLICATE_PART", message, {
    part: part.kind,
    label: part.label,
    details: { item },
  });
};

/**
 * The single part of a kind a transaction holds at most one of
 * @throws TxBuildError DUPLICATE_PART for the second part
 */
export const atMostOne = <P extends TxPart>(
  parts: P[],
  what: string,
): P | undefined => {
  if (parts.length > 1)
    duplicate(
      parts[1]!,
      `a transaction holds a single ${what}`,
      parts[1]!.kind,
    );
  return parts[0];
};

/** Fails on a second item with the same key */
const checkUnique = <P extends TxPart>(
  parts: P[],
  key: (part: P) => string,
  what: string,
) => {
  const seen = new Set<string>();
  for (const part of parts) {
    const k = key(part);
    if (seen.has(k)) duplicate(part, `${what} ${k} given twice`, k);
    seen.add(k);
  }
};

const REDEEMER_TAG_RANK: Record<RedeemerTagPrototype["type"], number> = {
  SPEND: 0,
  MINT: 1,
  CERT: 2,
  REWARD: 3,
  VOTE: 4,
  VOTING_PROPOSAL: 5,
};

/**
 * Puts resolved parts together into a `TransactionPrototype`. Pure and synchronous: nothing is
 * looked up, selected or balanced. The parts must be complete (`unresolved()` empty for each),
 * and their order matters only for certificates, proposals and outputs, which keep it.
 *
 * What is decided here, once, is everything that follows from the parts as a whole: the order
 * of inputs, policies, reward accounts and voters, and so every redeemer index; the reference
 * inputs scripts are read from; the deduplicated scripts and datums of the witness set; the
 * collateral return; the auxiliary data and script data hashes.
 *
 * Redeemer functions are called here, once each per call, after every sorting: each gets the
 * final positions of the transaction (`RedeemerContext`), and the data it returns goes into the
 * witness set, which the script data hash covers.
 *
 * @param parts The transaction's parts, each complete
 * @param options The fee, and what the hashes and witness set need beyond the parts
 * @returns The prototype, with every redeemer tied to the part it belongs to
 * @throws TxBuildError MISSING_PARAMETER when a Plutus version the parts run has no cost model
 *   in `options.costModels`; INVALID_REDEEMER when a redeemer function throws, asks for an item
 *   the transaction does not hold, or returns what is not Plutus data; INVALID_GUARD
 *   `{ reason: "scriptHash", hash }` for the first key guard whose hash is the hash of a script
 *   a witness of the parts names, attached or held in a reference output
 */
export const assembleTxPrototype = (
  parts: readonly TxPart[],
  options: AssembleTxOptions,
): AssembledTx => {
  const gaps: PartGaps[] = [];
  for (const part of parts) {
    const partGaps = unresolved(part);
    if (partGaps.length > 0)
      gaps.push({
        kind: part.kind,
        ...(part.label !== undefined && { label: part.label }),
        gaps: partGaps,
      });
  }
  if (gaps.length > 0)
    throw new TxBuildError(
      "UNRESOLVED",
      `${gaps.length} part(s) are incomplete: ${gaps
        .map(
          ({ kind, label, gaps: g }) =>
            `${kind}${label === undefined ? "" : ` "${label}"`} (${g.map((gap) => gap.type).join(", ")})`,
        )
        .join("; ")}`,
      { details: gaps },
    );

  const byKind = groupParts(parts);

  // Items the ledger keeps in its own order, and redeemers point into by position
  const spends = [...byKind.spend].sort((a, b) =>
    compareInputs(a.input, b.input),
  );
  checkUnique(spends, (p) => outRef(p.input), "input");
  // An output the transaction spends cannot also be one of its reference inputs
  const spent = new Set(spends.map((p) => outRef(p.input)));
  for (const part of byKind.referenceInput as ReferenceInputPart[]) {
    const key = outRef(part.input);
    if (spent.has(key))
      duplicate(part, `${key} is also spent by this transaction`, key);
  }
  const mints = [...byKind.mint].sort((a, b) =>
    compareHashes(a.policyId, b.policyId),
  );
  checkUnique(mints, (p) => p.policyId, "policy");
  // Every reward address is known once the gaps are checked
  const withdrawals = [...byKind.withdrawal].sort((a, b) =>
    compareRewardAddresses(a.rewardAddress!, b.rewardAddress!),
  );
  checkUnique(withdrawals, (p) => p.rewardAddress!, "reward address");
  const votes = [...byKind.vote].sort((a, b) =>
    compareVoters(a.voter, b.voter),
  );
  checkUnique(votes, (p) => voterKey(p.voter), "voter");
  // Items kept in the order given
  const certificates: CertificatePart[] = byKind.certificate;
  const proposals: ProposalPart[] = byKind.proposal;
  const outputs: OutputPart[] = byKind.output;

  const collaterals: CollateralPart[] = byKind.collateral;
  checkUnique(collaterals, (p) => outRef(p.input), "collateral input");
  const collateralReturn = atMostOne<CollateralReturnPart>(
    byKind.collateralReturn,
    "collateral return",
  );
  const validity = atMostOne<ValidityPart>(
    byKind.validity,
    "validity interval",
  );
  const donation = atMostOne<DonationPart>(byKind.donation, "donation");
  const treasuryValue = atMostOne<TreasuryValuePart>(
    byKind.treasuryValue,
    "treasury value",
  );
  const networkId = atMostOne<NetworkIdPart>(byKind.networkId, "network id");
  const metadataParts: MetadataPart[] = byKind.metadata;
  checkUnique(metadataParts, (p) => p.metadataLabel, "metadata label");

  // Witnesses: scripts, datums and redeemers, collected from every part that has one
  const nativeScripts = new Map<string, NativeScriptPrototype>();
  const plutusScripts: Record<LanguageVersion, Map<string, string>> = {
    V1: new Map(),
    V2: new Map(),
    V3: new Map(),
  };
  const scriptReferenceInputs: TransactionInputPrototype[] = [];
  /** The hashes of the scripts a witness names, attached or by reference */
  const witnessScripts = new Set<string>();
  const languages = new Set<LanguageVersion>();
  const datums = new Map<string, PlutusDataVariant>();
  const redeemers: AssembledRedeemer[] = [];

  const addDatum = (datum: Readonly<PlutusDataVariant>) => {
    const key = datum.type === "CBOR" ? datum.hex : JSON.stringify(datum);
    if (!datums.has(key)) datums.set(key, datum as PlutusDataVariant);
  };

  const addScript = (source: NativeScriptSource | PlutusScriptSource) => {
    // A resolved reference source always has its hash
    if (source.scriptHash !== undefined) witnessScripts.add(source.scriptHash);
    if (source.type === "reference") {
      scriptReferenceInputs.push(source.input);
      if ("version" in source && source.version) languages.add(source.version);
      return;
    }
    if ("script" in source) {
      nativeScripts.set(
        source.scriptHash,
        source.script as NativeScriptPrototype,
      );
    } else {
      plutusScripts[source.version].set(source.scriptHash, source.cbor);
      languages.add(source.version);
    }
  };

  const addWitness = (
    part: RedeemerPart,
    tag: RedeemerTagPrototype["type"],
    index: number,
  ) => {
    const { witness } = part;
    if (witness.type !== "native" && witness.type !== "plutus") return;
    addScript(witness.script);
    if (witness.type !== "plutus") return;
    redeemers.push({
      tag,
      index,
      // Complete parts always carry execution units
      exUnits: { ...witness.redeemer.exUnits! },
      part,
      ...(part.label !== undefined && { label: part.label }),
    });
  };

  spends.forEach((part, i) => {
    addWitness(part, "SPEND", i);
    const { witness } = part;
    if (witness.type === "plutus" && witness.datum?.type === "provided")
      addDatum(witness.datum.data);
  });
  mints.forEach((part, i) => addWitness(part, "MINT", i));
  certificates.forEach((part, i) => addWitness(part, "CERT", i));
  withdrawals.forEach((part, i) => addWitness(part, "REWARD", i));
  votes.forEach((part, i) => addWitness(part, "VOTE", i));
  proposals.forEach((part, i) => addWitness(part, "VOTING_PROPOSAL", i));
  for (const part of outputs)
    if (part.embeddedDatum) addDatum(part.embeddedDatum);
  redeemers.sort(
    (a, b) =>
      REDEEMER_TAG_RANK[a.tag] - REDEEMER_TAG_RANK[b.tag] || a.index - b.index,
  );

  // A spent input's reference script is visible to the transaction without a reference input
  const referenceInputs = new Map<string, TransactionInputPrototype>();
  for (const input of [
    ...byKind.referenceInput.map((p: ReferenceInputPart) => p.input),
    ...scriptReferenceInputs,
  ]) {
    const key = outRef(input);
    if (!spent.has(key) && !referenceInputs.has(key))
      referenceInputs.set(key, { ...input });
  }

  // A key guard with a script's hash could never be signed for
  const guards: GuardPart[] = byKind.guard;
  for (const part of guards)
    if (witnessScripts.has(part.credential.value))
      throw new TxBuildError(
        "INVALID_GUARD",
        `the guard's key hash ${part.credential.value} is the hash of a script of this transaction: no key can sign for it`,
        {
          part: part.kind,
          label: part.label,
          details: { reason: "scriptHash", hash: part.credential.value },
        },
      );
  const requiredSigners = Array.from(
    new Set(guards.map((p) => p.credential.value)),
  );

  const mint: MintPrototype = {};
  for (const part of mints) mint[part.policyId] = { ...part.assets };

  const withdrawalMap: Record<string, string> = {};
  for (const part of withdrawals)
    withdrawalMap[part.rewardAddress!] = part.amount!;

  const votingProcedures: VoterVotesPrototype[] = votes.map((part) => ({
    voter: structuredClone(part.voter),
    votes: structuredClone(part.votes) as VoterVotesPrototype["votes"],
  }));

  const votingProposals: VotingProposalPrototype[] = proposals.map(
    (part) => structuredClone(part.proposal) as VotingProposalPrototype,
  );

  const certs = certificates.map(
    (part) => structuredClone(part.certificate) as CertificatePrototype,
  );

  const body: TransactionBodyPrototype = {
    inputs: spends.map((p) => ({ ...p.input })),
    outputs: outputs.map(
      (p) => structuredClone(p.output) as TransactionOutputPrototype,
    ),
    fee: options.fee.toString(),
  };
  if (validity?.invalidHereafter !== undefined)
    body.ttl = validity.invalidHereafter;
  if (validity?.invalidBefore !== undefined)
    body.validity_start_interval = validity.invalidBefore;
  if (certs.length > 0) body.certs = certs;
  if (withdrawals.length > 0) body.withdrawals = withdrawalMap;
  if (mints.length > 0) body.mint = mint;
  if (collaterals.length > 0)
    body.collateral = [...collaterals]
      .sort((a, b) => compareInputs(a.input, b.input))
      .map((p) => ({ ...p.input }));
  if (requiredSigners.length > 0) body.required_signers = requiredSigners;
  if (networkId) body.network_id = { ...networkId.networkId };
  const sortedReferenceInputs = Array.from(referenceInputs.values()).sort(
    compareInputs,
  );
  if (referenceInputs.size > 0) body.reference_inputs = sortedReferenceInputs;
  if (votingProcedures.length > 0) body.voting_procedures = votingProcedures;
  if (votingProposals.length > 0) body.voting_proposals = votingProposals;
  if (treasuryValue) body.current_treasury_value = treasuryValue.amount;
  if (donation) body.donation = donation.amount;

  if (collateralReturn) {
    const total = BigInt(collateralReturn.totalCollateral!);
    const held = addValues(
      ...collaterals.map((p) => fromAssets(p.utxo!.output.amount)),
    );
    const rest = subtractValues(held, { coin: total, assets: new Map() });
    if (rest.coin < 0n)
      throw new TxBuildError(
        "INVALID_COLLATERAL",
        `collateral inputs hold ${held.coin} lovelace, less than the total collateral ${total}`,
        { part: collateralReturn.kind, label: collateralReturn.label },
      );
    body.total_collateral = total.toString();
    if (rest.coin > 0n || rest.assets.size > 0)
      body.collateral_return = {
        address: collateralReturn.address,
        amount: toValuePrototype(rest),
      };
  }

  const witnessSet: TransactionWitnessSetPrototype = {};
  if (options.vkeyWitnesses?.length)
    witnessSet.vkeys = options.vkeyWitnesses.map((w) => ({ ...w }));
  if (options.bootstrapWitnesses?.length)
    witnessSet.bootstraps = options.bootstrapWitnesses.map((w) => ({ ...w }));
  if (nativeScripts.size > 0)
    witnessSet.native_scripts = Array.from(nativeScripts.values());
  for (const version of ["V1", "V2", "V3"] as const) {
    const scripts = plutusScripts[version];
    if (scripts.size > 0)
      witnessSet[
        `plutus_${version.toLowerCase() as "v1" | "v2" | "v3"}_scripts`
      ] = Array.from(scripts.values());
  }
  if (datums.size > 0)
    witnessSet.plutus_data = {
      elems: Array.from(datums.values(), (d) =>
        d.type === "CBOR" ? d.hex : plutusDataVariantToCardano(d).toCbor(),
      ),
    };
  if (redeemers.length > 0) {
    const positions = finalPositions(spends, sortedReferenceInputs, outputs);
    witnessSet.redeemers = redeemers.map((r): RedeemerPrototype => ({
      tag: { type: r.tag } as RedeemerTagPrototype,
      index: r.index.toString(),
      data: redeemerData(r, positions),
      ex_units: { ...r.exUnits },
    }));
  }

  const auxiliaryData = toAuxiliaryData(metadataParts, byKind.auxiliaryScript);

  const prototype: TransactionPrototype = {
    body,
    witness_set: witnessSet,
    is_valid: true,
    ...(auxiliaryData && { auxiliary_data: auxiliaryData }),
  };

  // Both hashes cover only the witness set and the auxiliary data, which the hashes themselves
  // do not change, so one encoding without them is enough to take both
  if (auxiliaryData || datums.size > 0 || redeemers.length > 0) {
    const txHex = transactionPrototypeToHex(prototype);
    const auxiliaryDataHash = auxiliaryData && auxiliaryDataHashOf(txHex);
    if (auxiliaryDataHash) body.auxiliary_data_hash = auxiliaryDataHash;
    const scriptDataHash =
      (datums.size > 0 || redeemers.length > 0) &&
      scriptDataHashOf(txHex, languages, options.costModels);
    if (scriptDataHash) body.script_data_hash = scriptDataHash;
  }

  return { prototype, redeemers, languages };
};

/** What a redeemer function can ask about: the final positions of the transaction's items */
type FinalPositions = {
  inputs: readonly TransactionInputPrototype[];
  /** Position of each input, by `txHash#index` */
  input: Map<string, number>;
  /** Position of each reference input, by `txHash#index` */
  referenceInput: Map<string, number>;
  /** Position of the first output part with each label */
  output: Map<string, number>;
};

const finalPositions = (
  spends: readonly SpendPart[],
  referenceInputs: readonly TransactionInputPrototype[],
  outputs: readonly OutputPart[],
): FinalPositions => {
  const output = new Map<string, number>();
  outputs.forEach((part, i) => {
    if (part.label !== undefined && !output.has(part.label))
      output.set(part.label, i);
  });
  return {
    inputs: spends.map((p) => p.input),
    input: new Map(spends.map((p, i) => [outRef(p.input), i])),
    referenceInput: new Map(referenceInputs.map((r, i) => [outRef(r), i])),
    output,
  };
};

/** An out ref a redeemer function asks for, as `txHash#index`, its hash in lower case */
const askedOutRef = (ref: InputRef): string => {
  const asked: Partial<OutRef> | undefined =
    ref !== null && typeof ref === "object" && "input" in ref
      ? (ref as UTxO).input
      : (ref as Partial<OutRef> | undefined);
  const txHash = asked?.txHash;
  return `${typeof txHash === "string" ? txHash.toLowerCase() : String(txHash)}#${asked?.outputIndex}`;
};

/**
 * The context of one redeemer function call. The errors its lookups raise are added to `raised`,
 * so that the call can tell them from what the function throws itself.
 */
const redeemerContext = (
  redeemer: AssembledRedeemer,
  positions: FinalPositions,
  raised: Set<unknown>,
): RedeemerContext => {
  const refuse = (
    reason: "notAnInput" | "notAReferenceInput" | "noSuchOutput",
    message: string,
    ref?: string,
  ) => {
    const error = new TxBuildError("INVALID_REDEEMER", message, {
      part: redeemer.part.kind,
      label: redeemer.label,
      details: { reason, ...(ref !== undefined && { ref }) },
    });
    raised.add(error);
    return error;
  };
  // Arrow functions: bound, and blind to the extra arguments of `map`
  return Object.freeze({
    self: redeemer.index,
    inputs: Object.freeze(
      positions.inputs.map((input) =>
        Object.freeze({
          txHash: input.transaction_id,
          outputIndex: input.index,
        }),
      ),
    ),
    input: (ref: InputRef) => {
      const key = askedOutRef(ref);
      const position = positions.input.get(key);
      if (position === undefined)
        throw refuse(
          "notAnInput",
          `the redeemer asks for input ${key}, which the transaction does not spend`,
          key,
        );
      return position;
    },
    referenceInput: (ref: InputRef) => {
      const key = askedOutRef(ref);
      const position = positions.referenceInput.get(key);
      if (position === undefined)
        throw refuse(
          "notAReferenceInput",
          `the redeemer asks for reference input ${key}, which is not among the transaction's reference inputs`,
          key,
        );
      return position;
    },
    output: (label: string) => {
      const position = positions.output.get(label);
      if (position === undefined) {
        const labels = Array.from(positions.output.keys(), (l) =>
          JSON.stringify(l),
        );
        throw refuse(
          "noSuchOutput",
          `the redeemer asks for the output labelled ${JSON.stringify(label)}, and no output part has that label (output labels: ${labels.length > 0 ? labels.join(", ") : "none"})`,
        );
      }
      return position;
    },
  });
};

const isThenable = (value: unknown) =>
  value !== null &&
  (typeof value === "object" || typeof value === "function") &&
  typeof (value as { then?: unknown }).then === "function";

/**
 * The data of a redeemer as the witness set holds it: a copy of the part's data, or what its
 * function returns for the final transaction
 */
const redeemerData = (
  redeemer: AssembledRedeemer,
  positions: FinalPositions,
): PlutusDataVariant => {
  const { data } = (redeemer.part.witness as PlutusWitness).redeemer;
  if (data.type !== "deferred")
    return structuredClone(data) as PlutusDataVariant;

  const context = { part: redeemer.part.kind, label: redeemer.label };
  const raised = new Set<unknown>();
  let value: unknown;
  try {
    value = data.build(redeemerContext(redeemer, positions, raised));
  } catch (error) {
    // A lookup of its own context keeps its reason; anything else is the function's failure
    if (raised.has(error)) throw error;
    throw new TxBuildError(
      "INVALID_REDEEMER",
      `the redeemer function threw: ${errorText(error)}`,
      { ...context, details: { reason: "threw" }, cause: error },
    );
  }
  const invalid = (message: string, cause?: unknown) =>
    new TxBuildError(
      "INVALID_REDEEMER",
      `the redeemer function returned ${message}`,
      { ...context, details: { reason: "invalidData" }, cause },
    );
  if (isThenable(value)) {
    // Its outcome is never read; a rejection must not go unhandled
    (value as PromiseLike<unknown>).then(undefined, () => undefined);
    throw invalid("a promise: a redeemer function must be synchronous");
  }
  if (value === undefined || typeof value === "function")
    throw invalid(`${typeof value}, not Plutus data`);
  try {
    return encodePlutusData(value as PlutusDataInput).data;
  } catch (error) {
    throw invalid(`what is not Plutus data: ${errorText(error)}`, error);
  }
};

const toAuxiliaryData = (
  metadataParts: MetadataPart[],
  scriptParts: AuxiliaryScriptPart[],
): AuxiliaryDataPrototype | undefined => {
  if (metadataParts.length === 0 && scriptParts.length === 0) return undefined;
  const auxiliaryData: AuxiliaryDataPrototype = { prefer_alonzo_format: false };
  if (metadataParts.length > 0) {
    const metadata: TxMetadataPrototype = {};
    for (const part of metadataParts)
      metadata[part.metadataLabel] = structuredClone(
        part.value,
      ) as TxMetadataPrototype[string];
    auxiliaryData.metadata = metadata;
  }
  for (const { script } of scriptParts) {
    if (script.type === "native") {
      (auxiliaryData.native_scripts ??= []).push(
        structuredClone(script.script) as NativeScriptPrototype,
      );
    } else {
      auxiliaryData.prefer_alonzo_format = true;
      (auxiliaryData[
        `plutus_${script.version.toLowerCase() as "v1" | "v2" | "v3"}_scripts`
      ] ??= []).push(script.cbor);
    }
  }
  return auxiliaryData;
};
