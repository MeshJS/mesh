import type {
  GovernanceActionIdPrototype,
  GovernanceActionPrototype,
  ProtocolParamUpdatePrototype,
  UnitIntervalPrototype,
  VotePrototype,
  VoterPrototype,
} from "@meshsdk/common";

import {
  Credential,
  toAnchor,
  toCredential,
  toCredentialWitness,
  toDeposit,
  toDRepCredential,
  toPoolKeyHash,
  toPrototypeCredential,
} from "./credentials";
import {
  fail,
  freeze,
  isHash28,
  isHash32,
  labelOf,
  PartContext,
  rewardCredential,
  toNativeScriptSource,
  toPlutusScriptSource,
} from "./normalize";
import {
  AnchorInput,
  CredentialInput,
  CredentialWitnessInput,
  GovActionIdInput,
  ProposalPart,
  VoteInput,
  VotePart,
  VoterInput,
} from "./types";

const toGovActionId = (
  ctx: PartContext,
  id: GovActionIdInput,
): GovernanceActionIdPrototype => {
  const txHash = typeof id?.txHash === "string" ? id.txHash.toLowerCase() : "";
  if (
    !isHash32(txHash) ||
    !Number.isInteger(id.index) ||
    id.index < 0 ||
    id.index > 0xffff
  )
    fail(
      ctx,
      "INVALID_DATA",
      `invalid governance action id ${JSON.stringify(id)}`,
    );
  return { transaction_id: txHash, index: id.index };
};

const VOTE_KINDS = { yes: "YES", no: "NO", abstain: "ABSTAIN" } as const;

/**
 * Cast the votes of one voter. All of a voter's votes go in one part, as the ledger runs the
 * voter's script once for all of them.
 * @param params.voter `{ drep }` (a DRep id or credential), `{ committee }` (a hot credential,
 *   or a reward address carrying it) or `{ pool }` (a pool id or key hash)
 * @param params.votes The governance actions voted on, each at most once
 * @param params.witness The script authorising a script DRep or committee credential; pools
 *   vote with their key
 * @param params.label Name echoed in errors about this part, such as a script failure
 */
export const vote = (params: {
  voter: VoterInput;
  votes: VoteInput[];
  witness?: CredentialWitnessInput;
  label?: string;
}): VotePart => {
  const ctx: PartContext = { part: "vote", label: params.label };
  const { voter: voterInput } = params;

  let voter: VoterPrototype;
  let credential: Credential | undefined;
  if ("pool" in voterInput) {
    if (params.witness)
      fail(
        ctx,
        "WITNESS_MISMATCH",
        "a stake pool votes with its key, not a script",
      );
    voter = {
      type: "STAKING_POOL",
      value: toPoolKeyHash(ctx, voterInput.pool),
    };
  } else if ("drep" in voterInput) {
    credential = toDRepCredential(ctx, voterInput.drep);
    voter = { type: "DREP", value: toPrototypeCredential(credential) };
  } else if ("committee" in voterInput) {
    credential = toCredential(ctx, voterInput.committee);
    voter = {
      type: "CONSTITUTIONAL_COMMITTEE_HOT_CRED",
      value: toPrototypeCredential(credential),
    };
  } else {
    return fail(
      ctx,
      "INVALID_DATA",
      `invalid voter ${JSON.stringify(voterInput)}`,
    );
  }

  if (!Array.isArray(params.votes) || params.votes.length === 0)
    fail(ctx, "INVALID_DATA", "no votes");
  const seen = new Set<string>();
  const votes = params.votes.map((input): VotePrototype => {
    const action = toGovActionId(ctx, input.action);
    const key = `${action.transaction_id}#${action.index}`;
    if (seen.has(key))
      fail(ctx, "INVALID_DATA", `governance action ${key} voted on twice`);
    seen.add(key);
    const kind = VOTE_KINDS[input.vote];
    if (!kind) fail(ctx, "INVALID_DATA", `invalid vote ${input.vote}`);
    const anchor = toAnchor(ctx, input.anchor);
    return {
      action_id: action,
      voting_procedure: { vote: { type: kind }, ...(anchor && { anchor }) },
    };
  });

  return freeze({
    kind: "vote",
    voter,
    votes,
    witness: credential
      ? toCredentialWitness(ctx, credential, params.witness, {
          plutusV3Only: true,
        })
      : { type: "key" },
    ...labelOf(params.label),
  });
};

/* ---------------------------------------------------------------------------------------------
 * Proposals
 * ------------------------------------------------------------------------------------------- */

type ProposalParams = {
  /** The reward address the deposit is returned to */
  rewardAccount: string;
  /** Where the proposal's rationale is published */
  anchor: AnchorInput;
  /** Lovelace deposited; the `govActionDeposit` protocol parameter when omitted */
  deposit?: bigint;
  label?: string;
};

type GuardedParams = {
  /**
   * The constitution's guardrail script, run to authorise the proposal. Its hash goes in the
   * action's policy hash.
   */
  guardrail?: CredentialWitnessInput;
  /** The guardrail's hash; needed only for a guardrail referenced by out ref alone */
  policyHash?: string;
};

type ChainedParams = {
  /** The last enacted action of the same purpose; left out if there is none yet */
  previous?: GovActionIdInput;
};

const ctxOf = (label?: string): PartContext => ({ part: "proposal", label });

const toGuardrail = (
  ctx: PartContext,
  { guardrail, policyHash }: GuardedParams,
): { policyHash?: string; witness: ProposalPart["witness"] } => {
  const given = policyHash?.toLowerCase();
  if (given !== undefined && !isHash28(given))
    fail(ctx, "INVALID_SCRIPT", `invalid policy hash ${policyHash}`);
  if (!guardrail) {
    if (given)
      fail(
        ctx,
        "WITNESS_MISMATCH",
        "a policy hash needs its guardrail script as witness",
      );
    return { witness: { type: "none" } };
  }
  const scriptHash =
    "native" in guardrail
      ? toNativeScriptSource(ctx, guardrail.native).scriptHash
      : toPlutusScriptSource(ctx, guardrail.plutus).scriptHash;
  const hash = given ?? scriptHash;
  if (!hash)
    return fail(
      ctx,
      "INVALID_SCRIPT",
      "the guardrail's hash is unknown: pass policyHash, or the reference UTxO in full",
    );
  const witness = toCredentialWitness(
    ctx,
    { type: "script", hash },
    guardrail,
    {
      plutusV3Only: true,
    },
  );
  return { policyHash: hash, witness: witness as ProposalPart["witness"] };
};

const build = (
  ctx: PartContext,
  params: ProposalParams,
  governanceAction: GovernanceActionPrototype,
  witness: ProposalPart["witness"] = { type: "none" },
): ProposalPart => {
  rewardCredential(ctx, params.rewardAccount);
  const anchor = toAnchor(ctx, params.anchor);
  if (!anchor) return fail(ctx, "INVALID_DATA", "a proposal needs an anchor");
  const { coin, depositParameter } = toDeposit(
    ctx,
    params.deposit,
    "govActionDeposit",
  );
  return freeze({
    kind: "proposal",
    proposal: {
      governance_action: governanceAction,
      anchor,
      reward_account: params.rewardAccount,
      ...(coin && { deposit: coin }),
    },
    ...(depositParameter && { depositParameter }),
    witness,
    ...labelOf(params.label),
  });
};

const previousOf = (ctx: PartContext, previous?: GovActionIdInput) =>
  previous ? { gov_action_id: toGovActionId(ctx, previous) } : {};

const toUnitInterval = (
  ctx: PartContext,
  name: string,
  value: {
    numerator: bigint | number | string;
    denominator: bigint | number | string;
  },
): UnitIntervalPrototype => {
  const numerator = String(value?.numerator);
  const denominator = String(value?.denominator);
  if (
    !/^\d+$/.test(numerator) ||
    !/^\d+$/.test(denominator) ||
    BigInt(denominator) === 0n
  )
    fail(ctx, "INVALID_VALUE", `invalid ${name} ${numerator}/${denominator}`);
  return { numerator, denominator };
};

/**
 * Checks a protocol parameter update field by field: amounts and counts must be non-negative
 * integers (cost model entries may be negative), ratios must have a non-zero denominator.
 */
const checkParamUpdate = (
  ctx: PartContext,
  updates: ProtocolParamUpdatePrototype,
) => {
  const present = Object.entries(updates ?? {}).filter(([, v]) => v != null);
  if (present.length === 0)
    fail(ctx, "INVALID_DATA", "no parameters to update");
  const check = (path: string, value: unknown, signed: boolean): void => {
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || value < 0)
        fail(ctx, "INVALID_VALUE", `invalid ${path}: ${value}`);
    } else if (typeof value === "string") {
      if (!(signed ? /^-?\d+$/ : /^\d+$/).test(value))
        fail(ctx, "INVALID_VALUE", `invalid ${path}: ${value}`);
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => check(`${path}[${i}]`, item, signed));
    } else if (value !== null && typeof value === "object") {
      if ("numerator" in value && "denominator" in value)
        toUnitInterval(ctx, path, value as UnitIntervalPrototype);
      else
        for (const [key, item] of Object.entries(value))
          check(`${path}.${key}`, item, signed);
    } else {
      fail(ctx, "INVALID_VALUE", `invalid ${path}: ${String(value)}`);
    }
  };
  for (const [key, value] of present) check(key, value, key === "cost_models");
};

export const proposal = {
  /**
   * Propose changing protocol parameters.
   * @param params.updates The new values, in the ledger's shape
   * @param params.guardrail The constitution's guardrail script, when it has one
   */
  parameterChange: (
    params: ProposalParams &
      GuardedParams &
      ChainedParams & { updates: ProtocolParamUpdatePrototype },
  ): ProposalPart => {
    const ctx = ctxOf(params.label);
    checkParamUpdate(ctx, params.updates);
    const { policyHash, witness } = toGuardrail(ctx, params);
    return build(
      ctx,
      params,
      {
        type: "PARAMETER_CHANGE_ACTION",
        value: {
          protocol_param_updates: params.updates,
          ...previousOf(ctx, params.previous),
          ...(policyHash && { policy_hash: policyHash }),
        },
      },
      witness,
    );
  },

  /**
   * Propose a hard fork to a new protocol version.
   * @param params.protocolVersion The version to fork to
   */
  hardForkInitiation: (
    params: ProposalParams &
      ChainedParams & { protocolVersion: { major: number; minor: number } },
  ): ProposalPart => {
    const ctx = ctxOf(params.label);
    const { major, minor } = params.protocolVersion ?? {};
    for (const [name, value] of [
      ["major", major],
      ["minor", minor],
    ] as const)
      if (!Number.isSafeInteger(value) || value! < 0 || value! > 0xffffffff)
        fail(ctx, "INVALID_DATA", `invalid protocol version ${name} ${value}`);
    return build(ctx, params, {
      type: "HARD_FORK_INITIATION_ACTION",
      value: {
        protocol_version: { major: major!, minor: minor! },
        ...previousOf(ctx, params.previous),
      },
    });
  },

  /**
   * Propose withdrawing lovelace from the treasury.
   * @param params.withdrawals Lovelace by receiving reward address
   * @param params.guardrail The constitution's guardrail script, when it has one
   */
  treasuryWithdrawals: (
    params: ProposalParams &
      GuardedParams & { withdrawals: Record<string, bigint> },
  ): ProposalPart => {
    const ctx = ctxOf(params.label);
    const entries = Object.entries(params.withdrawals ?? {});
    if (entries.length === 0) fail(ctx, "INVALID_VALUE", "no withdrawals");
    const withdrawals: Record<string, string> = {};
    for (const [address, amount] of entries) {
      rewardCredential(ctx, address);
      if (typeof amount !== "bigint" || amount < 0n)
        fail(
          ctx,
          "INVALID_VALUE",
          `invalid withdrawal ${amount} to ${address}`,
        );
      withdrawals[address] = amount.toString();
    }
    const { policyHash, witness } = toGuardrail(ctx, params);
    return build(
      ctx,
      params,
      {
        type: "TREASURY_WITHDRAWALS_ACTION",
        value: { withdrawals, ...(policyHash && { policy_hash: policyHash }) },
      },
      witness,
    );
  },

  /** Propose a motion of no confidence in the constitutional committee. */
  noConfidence: (params: ProposalParams & ChainedParams): ProposalPart => {
    const ctx = ctxOf(params.label);
    return build(ctx, params, {
      type: "NO_CONFIDENCE_ACTION",
      value: { ...previousOf(ctx, params.previous) },
    });
  },

  /**
   * Propose changing the constitutional committee.
   * @param params.remove Cold credentials of members to remove
   * @param params.add Members to add, with the epoch their term ends at
   * @param params.quorum The share of members whose votes are needed
   */
  updateCommittee: (
    params: ProposalParams &
      ChainedParams & {
        remove?: CredentialInput[];
        add?: { credential: CredentialInput; termLimit: bigint | number }[];
        quorum: { numerator: bigint | number; denominator: bigint | number };
      },
  ): ProposalPart => {
    const ctx = ctxOf(params.label);
    const quorum = toUnitInterval(ctx, "quorum", params.quorum);
    if (BigInt(quorum.numerator) > BigInt(quorum.denominator))
      fail(
        ctx,
        "INVALID_VALUE",
        `quorum ${quorum.numerator}/${quorum.denominator} exceeds 1`,
      );
    const members = (params.add ?? []).map(({ credential, termLimit }) => {
      if (
        (typeof termLimit !== "bigint" && !Number.isSafeInteger(termLimit)) ||
        termLimit < 0 ||
        BigInt(termLimit) >= 2n ** 64n
      )
        fail(ctx, "INVALID_DATA", `invalid term limit ${termLimit}`);
      return {
        stake_credential: toPrototypeCredential(toCredential(ctx, credential)),
        term_limit: BigInt(termLimit),
      };
    });
    return build(ctx, params, {
      type: "UPDATE_COMMITTEE_ACTION",
      value: {
        committee: { members, quorum_threshold: quorum },
        members_to_remove: (params.remove ?? []).map((credential) =>
          toPrototypeCredential(toCredential(ctx, credential)),
        ),
        ...previousOf(ctx, params.previous),
      },
    });
  },

  /**
   * Propose a new constitution.
   * @param params.constitution Where the constitution is published, and its guardrail script's
   *   hash, if any
   */
  newConstitution: (
    params: ProposalParams &
      ChainedParams & {
        constitution: { anchor: AnchorInput; scriptHash?: string };
      },
  ): ProposalPart => {
    const ctx = ctxOf(params.label);
    const anchor = toAnchor(ctx, params.constitution?.anchor);
    if (!anchor)
      return fail(ctx, "INVALID_DATA", "a constitution needs an anchor");
    const scriptHash = params.constitution.scriptHash?.toLowerCase();
    if (scriptHash !== undefined && !isHash28(scriptHash))
      fail(
        ctx,
        "INVALID_SCRIPT",
        `invalid guardrail script hash ${scriptHash}`,
      );
    return build(ctx, params, {
      type: "NEW_CONSTITUTION_ACTION",
      value: {
        constitution: {
          anchor,
          ...(scriptHash && { script_hash: scriptHash }),
        },
        ...previousOf(ctx, params.previous),
      },
    });
  },

  /** Propose an info action, voted on but with no effect on the chain. */
  info: (params: ProposalParams): ProposalPart =>
    build(ctxOf(params.label), params, { type: "INFO_ACTION" }),
};
