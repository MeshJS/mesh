import type {
  LocalCredential,
  NecessaryInputData,
  ValidationInputContext,
} from "@cardananium/cquisitor-lib";
import type { ProtocolParams } from "scalus";

import type { Action, RedeemerTagType, UTxO } from "@meshsdk/common";

import {
  credentialKey,
  CredentialRef,
  govActionKey,
  GovActionType,
  LedgerState,
  normalizeDRepId,
} from "./ledger-state";
import { toCquisitorParams } from "./protocol-params";

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

export type NecessaryData = NecessaryInputData;

/** The ledger state a transaction's validity depends on, as cquisitor works it out */
export const necessaryData = async (
  txHex: string,
  network: CquisitorNetwork,
): Promise<NecessaryData> =>
  (await loadCquisitor()).necessaryData(txHex, network);

const hexToBytes = (hex: string) =>
  Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));

export const bytesToHex = (bytes: number[]) =>
  bytes.map((b) => b.toString(16).padStart(2, "0")).join("");

const toLocalCredential = ({ type, hash }: CredentialRef): LocalCredential =>
  type === "script"
    ? { scriptHash: hexToBytes(hash) }
    : { keyHash: hexToBytes(hash) };

const fromLocalCredential = (credential: LocalCredential): CredentialRef =>
  "scriptHash" in credential
    ? { type: "script", hash: bytesToHex(credential.scriptHash) }
    : { type: "key", hash: bytesToHex(credential.keyHash) };

type CquisitorKind =
  ValidationInputContext["govActionContexts"][number]["actionType"];

/** `ParameterChangeAction` as cquisitor spells it: `parameterChangeAction` */
const toCquisitorKind = (kind: GovActionType) =>
  (kind.charAt(0).toLowerCase() + kind.slice(1)) as CquisitorKind;

const fromCquisitorKind = (kind: string) =>
  (kind.charAt(0).toUpperCase() + kind.slice(1)) as GovActionType;

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

export type CquisitorReport = {
  errors: TxIssue[];
  warnings: TxIssue[];
  redeemers: Omit<Action, "data">[];
  logs: string[];
};

/**
 * Validates a transaction with cquisitor against the emulator's state: the UTxOs it reads,
 * and the stake addresses, pools, DReps, governance actions and committee members it touches.
 * Every rule is checked and every problem reported, not only the first.
 */
export const validateWithCquisitor = async (input: {
  txHex: string;
  network: CquisitorNetwork;
  slot: number;
  params: ProtocolParams;
  state: LedgerState;
  findUtxos: (refs: { txHash: string; outputIndex: number }[]) => UTxO[];
}): Promise<CquisitorReport> => {
  const cq = await loadCquisitor();
  const { txHex, network, slot, params, state, findUtxos } = input;
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

  const committee = [...state.committee.values()].map((member) => ({
    potential: member.potential,
    context: {
      committeeMemberCold: toLocalCredential(member.cold),
      committeeMemberHot: member.hot ? toLocalCredential(member.hot) : null,
      isResigned: member.resigned,
    },
  }));
  const neededCommittee = new Set(
    [...needed.committeeMembersCold, ...needed.committeeMembersHot].map(
      (credential) => credentialKey(fromLocalCredential(credential)),
    ),
  );

  const context: ValidationInputContext = {
    slot: BigInt(slot),
    networkType: network,
    protocolParameters: toCquisitorParams(
      params,
    ) as ValidationInputContext["protocolParameters"],
    utxoSet: utxos.map((utxo) => ({ isSpent: false, utxo })),
    accountContexts: needed.accounts.map((rewardAddress) => {
      const account = state.accounts.get(rewardAddress);
      return account
        ? {
            bech32Address: rewardAddress,
            isRegistered: true,
            balance: account.rewards,
            payedDeposit: account.deposit,
            delegatedToPool: account.pool ?? null,
            delegatedToDrep: account.drep ?? null,
          }
        : { bech32Address: rewardAddress, isRegistered: false };
    }),
    poolContexts: needed.pools.map((poolId) => {
      const pool = state.pools.get(poolId.toLowerCase());
      return {
        poolId,
        isRegistered: pool !== undefined,
        retirementEpoch: pool?.retirementEpoch ?? null,
      };
    }),
    drepContexts: needed.dReps.map((drepId) => {
      const drep = state.dreps.get(normalizeDRepId(drepId));
      return {
        bech32Drep: drepId,
        isRegistered: drep !== undefined,
        payedDeposit: drep?.deposit ?? null,
      };
    }),
    govActionContexts: needed.govActions.flatMap((id) => {
      const action = state.govActions.get(
        govActionKey({
          txHash: bytesToHex(id.txHash),
          index: Number(id.index),
        }),
      );
      return action
        ? [
            {
              actionId: id,
              actionType: toCquisitorKind(action.type),
              isActive: action.active,
              changedParameters: action.changedParameters ?? null,
            },
          ]
        : [];
    }),
    lastEnactedGovAction: needed.lastEnactedGovAction.flatMap((type) => {
      const enacted = state.lastEnacted.get(fromCquisitorKind(type));
      return enacted
        ? [
            {
              actionId: {
                txHash: hexToBytes(enacted.txHash),
                index: enacted.index,
              },
              actionType: type,
              isActive: false,
            },
          ]
        : [];
    }),
    currentCommitteeMembers: committee
      .filter(
        (member) =>
          !member.potential &&
          neededCommittee.has(
            credentialKey(
              fromLocalCredential(member.context.committeeMemberCold),
            ),
          ),
      )
      .map((member) => member.context),
    potentialCommitteeMembers: committee
      .filter((member) => member.potential)
      .map((member) => member.context),
    treasuryValue: state.treasury,
    constitution: {
      guardrailScriptHash: state.guardrailScriptHash ?? null,
    },
  };

  const result = await cq.validateTransaction(txHex, context);
  const issue = (
    phase: 1 | 2,
    rule: unknown,
    message: string,
    hint: string | null | undefined,
    locations: string[],
  ): TxIssue => ({
    rule: ruleOf(rule),
    message,
    ...(hint && { hint }),
    ...(locations.length > 0 && { locations }),
    phase,
  });

  return {
    errors: [
      ...result.errors.map((e) =>
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
