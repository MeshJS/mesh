import type {
  GovActionInputContext,
  LocalCredential,
  ValidationInputContext,
} from "@cardananium/cquisitor-lib";
import type { ProtocolParams } from "scalus";

import type { Action, RedeemerTagType, UTxO } from "@meshsdk/common";
import { GovernanceActionKind } from "@meshsdk/common";
import {
  Crypto,
  deserializeTx,
  Ed25519PublicKeyHex,
  Ed25519SignatureHex,
  Serialization,
} from "@meshsdk/core-cst";

import type { Assumed } from "./assume";
import {
  isKnown,
  isMemberKnown,
  isOpenToVotes,
  item,
  LedgerState,
} from "./ledger-state";
import { nativeScriptsPassingWhenSigned } from "./native-script";
import { toCquisitorParams } from "./protocol-params";
import {
  credentialKey,
  CredentialRef,
  govActionKey,
  normalizeDRepId,
  purposeOf,
  TxRefs,
} from "./tx-refs";

/** One problem found with a transaction */
export type TxIssue = {
  /** The ledger rule or check, e.g. `ValueNotConservedUTxO`, `ScriptFailure` */
  rule: string;
  message: string;
  /** How to fix it, when the validator can tell */
  hint?: string;
  /** Where in the transaction the problem is */
  locations?: string[];
  /** 1 for ledger rules, 2 for script execution */
  phase: 1 | 2;
};

export type CquisitorNetwork = "mainnet" | "preview" | "preprod";

type Cquisitor = typeof import("@cardananium/cquisitor-lib");

let loaded: Promise<Cquisitor> | undefined;

/** Loads cquisitor-lib on first use; it is an optional dependency */
const loadCquisitor = (): Promise<Cquisitor> =>
  (loaded ??= import("@cardananium/cquisitor-lib").catch((error) => {
    loaded = undefined;
    throw new Error(
      `The cquisitor validator needs the @cardananium/cquisitor-lib package: ${error}`,
    );
  }));

const hexToBytes = (hex: string) =>
  Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));

const bytesToHex = (bytes: number[]) =>
  bytes.map((b) => b.toString(16).padStart(2, "0")).join("");

const toLocalCredential = ({ type, hash }: CredentialRef): LocalCredential =>
  type === "script"
    ? { scriptHash: hexToBytes(hash) }
    : { keyHash: hexToBytes(hash) };

type CquisitorKind = GovActionInputContext["actionType"];

/** `ParameterChangeAction` as cquisitor spells it: `parameterChangeAction` */
const toCquisitorKind = (kind: GovernanceActionKind) =>
  (kind.charAt(0).toLowerCase() + kind.slice(1)) as CquisitorKind;

const fromCquisitorKind = (kind: string) =>
  (kind.charAt(0).toUpperCase() + kind.slice(1)) as GovernanceActionKind;

const ruleOf = (error: unknown): string =>
  typeof error === "string" ? error : Object.keys(error as object)[0]!;

const MESH_TAG: Record<string, RedeemerTagType> = {
  Spend: "SPEND",
  Mint: "MINT",
  Cert: "CERT",
  Reward: "REWARD",
  Vote: "VOTE",
  Propose: "PROPOSE",
};

/** A parameter of the security group, on which stake pools vote: `maxBlockBodySize` */
const SECURITY_GROUP_PARAMETER = "2";

export type CquisitorReport = {
  errors: TxIssue[];
  warnings: TxIssue[];
  redeemers: Omit<Action, "data">[];
  logs: string[];
};

/** A vkey witness standing for a signature still to come: the right size, with no meaning */
const placeholderWitness = (index: number) =>
  new Serialization.VkeyWitness(
    Ed25519PublicKeyHex(index.toString(16).padStart(64, "0")),
    Ed25519SignatureHex(index.toString(16).padStart(128, "0")),
  );

/**
 * The bytes the signatures of `signers` more keys add to a transaction, encoded as signing it
 * with a Mesh wallet does
 */
const signatureBytes = (txHex: string, signers: number): number => {
  if (signers === 0) return 0;
  const tx = deserializeTx(txHex);
  const witnessSet = tx.witnessSet();
  const vkeys = Serialization.CborSet.fromCore(
    [],
    Serialization.VkeyWitness.fromCore,
  );
  vkeys.setValues([
    ...(witnessSet.vkeys()?.values() ?? []),
    ...Array.from({ length: signers }, (_, index) => placeholderWitness(index)),
  ]);
  witnessSet.setVkeys(vkeys);
  tx.setWitnessSet(witnessSet);
  return tx.toCbor().length / 2 - txHex.length / 2;
};

type CquisitorErrors = Awaited<
  ReturnType<Cquisitor["validateTransaction"]>
>["errors"];

/**
 * How many keys must yet sign a transaction: those whose signatures the ledger misses, and
 * those the native scripts failing only for want of signatures need
 */
const keysToSign = (
  txHex: string,
  errors: CquisitorErrors,
  passing: Map<string, Set<string>>,
): number => {
  const keys = new Set<string>();
  for (const { error } of errors) {
    if (typeof error !== "object") continue;
    if ("MissingVKeyWitnesses" in error)
      keys.add(error.MissingVKeyWitnesses.missing_key_hash);
    if ("NativeScriptIsUnsuccessful" in error)
      for (const key of passing.get(
        error.NativeScriptIsUnsuccessful.native_script_hash,
      ) ?? [])
        keys.add(key);
  }
  // Those that have signed already
  for (const witness of deserializeTx(txHex).witnessSet().vkeys()?.values() ??
    [])
    keys.delete(Crypto.blake2b.hash(witness.vkey() as never, 28));
  return keys.size;
};

/**
 * Validates a transaction with cquisitor against the emulator's state: the UTxOs it reads,
 * and the stake addresses, pools, DReps, governance actions and committee members it touches.
 * Every problem found is reported, not only the first.
 *
 * State the emulator does not know is taken to be as the transaction needs it, as `assumed`
 * says, so that it cannot fail the transaction; the caller reports such state as not checked.
 */
export const validateWithCquisitor = async (input: {
  txHex: string;
  network: CquisitorNetwork;
  slot: number;
  epoch: number;
  params: ProtocolParams;
  state: LedgerState;
  refs: TxRefs;
  assumed: Assumed;
  requireSignatures: boolean;
  findUtxos: (refs: { txHash: string; outputIndex: number }[]) => UTxO[];
}): Promise<CquisitorReport> => {
  const cq = await loadCquisitor();
  const {
    txHex,
    network,
    slot,
    epoch,
    params,
    state,
    refs,
    assumed,
    requireSignatures,
    findUtxos,
  } = input;
  const needed = await cq.necessaryData(txHex, network);

  const utxos = findUtxos(needed.utxos);
  if (utxos.length < needed.utxos.length) {
    const found = new Set(
      utxos.map((u) => `${u.input.txHash}#${u.input.outputIndex}`),
    );
    const missing = needed.utxos
      .map((u) => `${u.txHash}#${u.outputIndex}`)
      .filter((key) => !found.has(key));
    return {
      errors: [
        {
          rule: "UtxoNotAvailable",
          message: `outputs not in the ledger: ${missing.join(", ")}`,
          phase: 1,
        },
      ],
      warnings: [],
      redeemers: [],
      logs: [],
    };
  }

  const accountContexts = needed.accounts.map((rewardAddress) => {
    if (!isKnown(state, item.account(rewardAddress)))
      // Registered, holding what the transaction withdraws, unless it registers it first
      return assumed.newAccounts.has(rewardAddress)
        ? { bech32Address: rewardAddress, isRegistered: false }
        : {
            bech32Address: rewardAddress,
            isRegistered: true,
            balance: refs.withdrawals.get(rewardAddress) ?? 0n,
            payedDeposit:
              assumed.deposits.get(rewardAddress) ?? params.stakeAddressDeposit,
            delegatedToDrep: "alwaysAbstain",
            delegatedToPool: null,
          };
    const account = state.accounts.get(rewardAddress);
    if (!account) return { bech32Address: rewardAddress, isRegistered: false };
    return {
      bech32Address: rewardAddress,
      isRegistered: true,
      balance: account.rewards,
      payedDeposit:
        account.deposit ??
        assumed.deposits.get(rewardAddress) ??
        params.stakeAddressDeposit,
      delegatedToDrep:
        account.drep ??
        (isKnown(state, item.drepDelegation(rewardAddress))
          ? null
          : "alwaysAbstain"),
      delegatedToPool: account.pool ?? null,
    };
  });

  const poolContexts = needed.pools.map((poolId) => {
    const hash = poolId.toLowerCase();
    if (!isKnown(state, item.pool(hash)))
      return { poolId, isRegistered: !assumed.newPools.has(hash) };
    const pool = state.pools.get(hash);
    return {
      poolId,
      isRegistered: pool !== undefined,
      retirementEpoch: pool?.retirementEpoch ?? null,
    };
  });

  const drepContexts = needed.dReps.map((bech32Drep) => {
    const drepId = normalizeDRepId(bech32Drep);
    const payedDeposit = (deposit?: bigint) =>
      deposit ?? assumed.deposits.get(drepId) ?? params.dRepDeposit;
    if (!isKnown(state, item.drep(drepId)))
      return assumed.newDReps.has(drepId)
        ? { bech32Drep, isRegistered: false }
        : { bech32Drep, isRegistered: true, payedDeposit: payedDeposit() };
    const drep = state.dreps.get(drepId);
    return drep
      ? {
          bech32Drep,
          isRegistered: true,
          payedDeposit: payedDeposit(drep.deposit),
        }
      : { bech32Drep, isRegistered: false };
  });

  // The kind of an unknown action named as a proposal's previous one is that proposal's
  const previousKinds = new Map(
    refs.proposals.flatMap((proposal) =>
      proposal.previous ? [[proposal.previous, proposal.kind] as const] : [],
    ),
  );
  const govActionContexts = needed.govActions.flatMap(
    (id): GovActionInputContext[] => {
      const key = govActionKey(bytesToHex(id.txHash), Number(id.index));
      if (!isKnown(state, item.govAction(key))) {
        const kind = previousKinds.get(key) ?? GovernanceActionKind.InfoAction;
        return [
          {
            actionId: id,
            actionType: toCquisitorKind(kind),
            isActive: true,
            changedParameters: [SECURITY_GROUP_PARAMETER],
          },
        ];
      }
      const action = state.govActions.get(key);
      if (!action) return [];
      return [
        {
          actionId: id,
          actionType: toCquisitorKind(action.kind),
          isActive: isOpenToVotes(action, epoch),
          // Parameters not known to change are taken to include one of the security group
          changedParameters: action.changedParameters ?? [
            SECURITY_GROUP_PARAMETER,
          ],
        },
      ];
    },
  );

  // A purpose whose last enacted action is not known: each proposal of it follows that action,
  // unless it follows a proposal still pending
  const purposes = new Set(
    needed.lastEnactedGovAction.map((type) =>
      purposeOf(fromCquisitorKind(type)),
    ),
  );
  const lastEnactedGovAction = [...purposes].flatMap(
    (purpose): GovActionInputContext[] => {
      if (!purpose) return [];
      if (isKnown(state, item.lastEnacted(purpose))) {
        const enacted = state.lastEnacted.get(purpose);
        return enacted
          ? [
              {
                actionId: {
                  txHash: hexToBytes(enacted.txHash),
                  index: enacted.index,
                },
                actionType: toCquisitorKind(enacted.kind),
                isActive: false,
              },
            ]
          : [];
      }
      return refs.proposals.flatMap((proposal) => {
        if (
          purposeOf(proposal.kind) !== purpose ||
          !proposal.previous ||
          state.govActions.has(proposal.previous)
        )
          return [];
        const [txHash, index] = proposal.previous.split("#") as [
          string,
          string,
        ];
        return [
          {
            actionId: { txHash: hexToBytes(txHash), index: Number(index) },
            actionType: toCquisitorKind(proposal.kind),
            isActive: false,
          },
        ];
      });
    },
  );

  // Members not known: those the transaction acts for are sitting, its voters authorised
  const committeeKnown = isKnown(state, item.committee);
  const members = [...state.committee.values()].filter((member) =>
    isMemberKnown(state, member.cold),
  );
  const toContext = (member: (typeof members)[number]) => ({
    committeeMemberCold: toLocalCredential(member.cold),
    committeeMemberHot: member.hot ? toLocalCredential(member.hot) : null,
    isResigned: member.resigned,
  });
  const currentCommitteeMembers = [
    ...members.filter((member) => !member.potential).map(toContext),
    ...refs.committeeCold
      .filter((cold) => !isMemberKnown(state, cold))
      .map((cold) => ({
        committeeMemberCold: toLocalCredential(cold),
        committeeMemberHot: null,
        isResigned: false,
      })),
    ...(committeeKnown
      ? []
      : refs.committeeHot
          .filter(
            (hot) =>
              !members.some(
                (member) =>
                  member.hot &&
                  credentialKey(member.hot) === credentialKey(hot),
              ),
          )
          .map((hot) => ({
            committeeMemberCold: toLocalCredential(hot),
            committeeMemberHot: toLocalCredential(hot),
            isResigned: false,
          }))),
  ];
  const potentialCommitteeMembers = members
    .filter((member) => member.potential)
    .map(toContext);

  const protocolParameters = toCquisitorParams(params);
  const context: ValidationInputContext = {
    slot: BigInt(slot),
    networkType: network,
    protocolParameters:
      protocolParameters as ValidationInputContext["protocolParameters"],
    utxoSet: utxos.map((utxo) => ({ isSpent: false, utxo })),
    accountContexts,
    poolContexts,
    drepContexts,
    govActionContexts,
    lastEnactedGovAction,
    currentCommitteeMembers,
    potentialCommitteeMembers,
    treasuryValue: state.treasury ?? refs.treasury ?? 0n,
    ...(state.constitution && {
      constitution: {
        guardrailScriptHash: state.constitution.guardrailScriptHash ?? null,
      },
    }),
  };

  let result = await cq.validateTransaction(txHex, context);
  // Unsigned: missing signatures are not problems, nor native scripts failing only for them
  const passing = requireSignatures
    ? new Map<string, Set<string>>()
    : nativeScriptsPassingWhenSigned(txHex, utxos);
  // The signatures still to come make the transaction bigger: its fee and size are checked as
  // they will be once it is signed, the bytes the signatures add priced as fee and taken off
  // the size allowed
  const extra = requireSignatures
    ? 0
    : signatureBytes(txHex, keysToSign(txHex, result.errors, passing));
  if (extra > 0)
    result = await cq.validateTransaction(txHex, {
      ...context,
      protocolParameters: {
        ...protocolParameters,
        minFeeConstantB:
          protocolParameters.minFeeConstantB +
          protocolParameters.minFeeCoefficientA * BigInt(extra),
        maxTransactionSize: protocolParameters.maxTransactionSize - extra,
      } as ValidationInputContext["protocolParameters"],
    });
  const errors = result.errors.filter(({ error }) => {
    if (requireSignatures || typeof error !== "object") return true;
    if ("MissingVKeyWitnesses" in error) return false;
    return !(
      "NativeScriptIsUnsuccessful" in error &&
      passing.has(error.NativeScriptIsUnsuccessful.native_script_hash)
    );
  });
  /** A message on the transaction as it will be once signed */
  const signedMessage = (error: unknown, message: string) => {
    if (extra === 0 || typeof error !== "object" || error === null)
      return message;
    if ("MaxTxSizeUTxO" in error) {
      const { actual_size, max_size } = (
        error as { MaxTxSizeUTxO: { actual_size: number; max_size: number } }
      ).MaxTxSizeUTxO;
      return `Transaction size once signed (${Number(actual_size) + extra} bytes) exceeds maximum allowed size (${Number(max_size) + extra} bytes)`;
    }
    return "FeeTooSmallUTxO" in error
      ? `${message}. It counts the ${extra} bytes the missing signatures add.`
      : message;
  };
  const issue = (
    phase: 1 | 2,
    rule: unknown,
    message: string,
    hint: string | null | undefined,
    locations: string[],
  ): TxIssue => ({
    rule: ruleOf(rule),
    message: signedMessage(rule, message),
    ...(hint && { hint }),
    ...(locations.length > 0 && { locations }),
    phase,
  });

  return {
    errors: [
      ...errors.map((e) =>
        issue(1, e.error, e.error_message, e.hint, e.locations),
      ),
      ...result.phase2_errors.map((e) =>
        issue(2, e.error, e.error_message, e.hint, e.locations),
      ),
    ],
    warnings: [
      ...result.warnings.map((w) =>
        issue(1, w.warning, w.warning_message, w.hint, w.locations),
      ),
      ...result.phase2_warnings.map((w) =>
        issue(2, w.warning, w.warning_message, w.hint, w.locations),
      ),
    ],
    redeemers: result.eval_redeemer_results
      .filter((r) => r.success)
      .map((r) => ({
        tag:
          MESH_TAG[r.tag] ?? (String(r.tag).toUpperCase() as RedeemerTagType),
        index: Number(r.index),
        budget: {
          mem: Number(r.calculated_ex_units.mem),
          steps: Number(r.calculated_ex_units.steps),
        },
      })),
    logs: result.eval_redeemer_results.flatMap((r) => r.logs),
  };
};
