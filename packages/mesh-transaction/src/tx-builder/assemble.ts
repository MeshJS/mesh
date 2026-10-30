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
  MetadataPart,
  MintPart,
  NativeScriptSource,
  NetworkIdPart,
  OutputPart,
  PlutusScriptSource,
  ProposalPart,
  ReferenceInputPart,
  RequiredSignerPart,
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
   * Cost models of Plutus V1, V2 and V3, in that order, for the script data hash; the defaults
   * when omitted
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
    requiredSigner: [],
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

const duplicate = (part: TxPart, message: string, details?: unknown): never => {
  throw new TxBuildError("DUPLICATE_PART", message, {
    part: part.kind,
    label: part.label,
    details,
  });
};

/** The single part of a kind a transaction holds at most one of */
const atMostOne = <P extends TxPart>(
  parts: P[],
  what: string,
): P | undefined => {
  if (parts.length > 1)
    duplicate(parts[1]!, `a transaction holds a single ${what}`);
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
    if (seen.has(k)) duplicate(part, `${what} ${k} given twice`, { key: k });
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
 * @param parts The transaction's parts, each complete
 * @param options The fee, and what the hashes and witness set need beyond the parts
 * @returns The prototype, with every redeemer tied to the part it belongs to
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
  const mints = [...byKind.mint].sort((a, b) =>
    compareHashes(a.policyId, b.policyId),
  );
  checkUnique(mints, (p) => p.policyId, "policy");
  const withdrawals = [...byKind.withdrawal].sort((a, b) =>
    compareRewardAddresses(a.rewardAddress, b.rewardAddress),
  );
  checkUnique(withdrawals, (p) => p.rewardAddress, "reward address");
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
  const languages = new Set<LanguageVersion>();
  const datums = new Map<string, PlutusDataVariant>();
  const redeemers: AssembledRedeemer[] = [];

  const addDatum = (datum: Readonly<PlutusDataVariant>) => {
    const key = datum.type === "CBOR" ? datum.hex : JSON.stringify(datum);
    if (!datums.has(key)) datums.set(key, datum as PlutusDataVariant);
  };

  const addScript = (source: NativeScriptSource | PlutusScriptSource) => {
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
  const spent = new Set(spends.map((p) => outRef(p.input)));
  const referenceInputs = new Map<string, TransactionInputPrototype>();
  for (const input of [
    ...byKind.referenceInput.map((p: ReferenceInputPart) => p.input),
    ...scriptReferenceInputs,
  ]) {
    const key = outRef(input);
    if (!spent.has(key) && !referenceInputs.has(key))
      referenceInputs.set(key, { ...input });
  }

  const requiredSigners = Array.from(
    new Set(byKind.requiredSigner.map((p: RequiredSignerPart) => p.keyHash)),
  );

  const mint: MintPrototype = {};
  for (const part of mints) mint[part.policyId] = { ...part.assets };

  const withdrawalMap: Record<string, string> = {};
  for (const part of withdrawals)
    withdrawalMap[part.rewardAddress] = part.amount!;

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
  if (referenceInputs.size > 0)
    body.reference_inputs = Array.from(referenceInputs.values()).sort(
      compareInputs,
    );
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
  if (redeemers.length > 0)
    witnessSet.redeemers = redeemers.map((r): RedeemerPrototype => ({
      tag: { type: r.tag } as RedeemerTagPrototype,
      index: r.index.toString(),
      data: structuredClone(redeemerData(r.part)),
      ex_units: { ...r.exUnits },
    }));

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

const redeemerData = (part: RedeemerPart): PlutusDataVariant => {
  const { witness } = part;
  if (witness.type !== "plutus")
    throw new Error(`${part.kind} part has no redeemer`);
  return witness.redeemer.data as PlutusDataVariant;
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
