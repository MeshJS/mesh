import { GovernanceActionKind } from "@meshsdk/common";
import { Cardano } from "@meshsdk/core-cst";

import type { TxIssue } from "./cquisitor";
import {
  isKnown,
  isMemberKnown,
  item,
  LedgerState,
  unknownReason,
} from "./ledger-state";
import {
  bech32PoolId,
  credentialKey,
  GovPurpose,
  purposeOf,
  TxRefs,
} from "./tx-refs";

const notChecked = (subject: string, reason: string): TxIssue => ({
  rule: "NotChecked",
  message: `${subject} is not known (${reason}), so it was taken to be as the transaction needs it`,
  phase: 1,
});

const isKeyHashAccount = (rewardAddress: string) =>
  Cardano.Address.fromBech32(rewardAddress).asReward()?.getPaymentCredential()
    .type === Cardano.CredentialType.KeyHash;

const PURPOSE_NAMES: Record<GovPurpose, string> = {
  parameterChange: "parameter change",
  hardFork: "hard fork",
  committee: "committee",
  constitution: "constitution",
};

/**
 * The state a transaction's validity depends on that the ledger does not know, as warnings.
 * Such state is taken to be as the transaction needs it, so the checks that read it pass
 * without telling anything.
 */
export const notCheckedIssues = (
  state: LedgerState,
  refs: TxRefs,
): TxIssue[] => {
  const issues: TxIssue[] = [];
  const check = (key: string, subject: string) => {
    if (!isKnown(state, key))
      issues.push(notChecked(subject, unknownReason(state, key)));
  };

  for (const rewardAddress of refs.accounts) {
    const key = item.account(rewardAddress);
    if (!isKnown(state, key)) {
      check(key, `The registration of ${rewardAddress}`);
      continue;
    }
    // Withdrawing from a key-hash credential needs a DRep delegation
    if (
      refs.withdrawals.has(rewardAddress) &&
      state.accounts.has(rewardAddress) &&
      isKeyHashAccount(rewardAddress)
    )
      check(
        item.drepDelegation(rewardAddress),
        `The DRep delegation of ${rewardAddress}`,
      );
  }
  for (const pool of refs.pools)
    check(item.pool(pool), `The registration of pool ${bech32PoolId(pool)}`);
  for (const drep of refs.dreps)
    check(item.drep(drep), `The registration of DRep ${drep}`);
  // A deregistration reclaims the deposit paid, which a provider may not report
  for (const { kind, key, register } of refs.registrations) {
    if (register || kind === "pool") continue;
    const held =
      kind === "account" ? state.accounts.get(key) : state.dreps.get(key);
    if (held && held.deposit === undefined)
      issues.push(
        notChecked(
          `The deposit of ${kind === "drep" ? "DRep " : ""}${key}`,
          "the provider did not report it",
        ),
      );
  }

  for (const action of refs.votedOn) {
    const key = item.govAction(action);
    if (!isKnown(state, key)) {
      check(key, `Governance action ${action}`);
      continue;
    }
    const known = state.govActions.get(action);
    if (
      known?.kind === GovernanceActionKind.ParameterChangeAction &&
      !known.changedParameters
    )
      issues.push(
        notChecked(
          `Which parameters governance action ${action} changes`,
          "it was not given or read",
        ),
      );
  }
  for (const proposal of refs.proposals) {
    const purpose = purposeOf(proposal.kind);
    if (!purpose) continue;
    if (proposal.previous)
      check(
        item.govAction(proposal.previous),
        `Governance action ${proposal.previous}`,
      );
    check(
      item.lastEnacted(purpose),
      `The last enacted ${PURPOSE_NAMES[purpose]} action`,
    );
  }

  for (const cold of refs.committeeCold)
    if (!isMemberKnown(state, cold))
      issues.push(
        notChecked(
          `Constitutional committee member ${cold.hash}`,
          unknownReason(state, item.committee),
        ),
      );
  if (!isKnown(state, item.committee))
    for (const hot of refs.committeeHot)
      if (
        ![...state.committee.values()].some(
          (member) =>
            member.hot &&
            credentialKey(member.hot) === credentialKey(hot) &&
            isMemberKnown(state, member.cold),
        )
      )
        issues.push(
          notChecked(
            `The constitutional committee member voting as ${hot.hash}`,
            unknownReason(state, item.committee),
          ),
        );
  if (refs.treasury !== undefined && state.treasury === undefined)
    issues.push(notChecked("The treasury", "no value was given or read"));
  if (
    state.constitution === undefined &&
    refs.proposals.some(
      (proposal) =>
        proposal.kind === GovernanceActionKind.ParameterChangeAction ||
        proposal.kind === GovernanceActionKind.TreasuryWithdrawalsAction,
    )
  )
    issues.push(
      notChecked(
        "The constitution's guardrail script",
        "no constitution was given or read",
      ),
    );

  // One warning per subject
  return issues.filter(
    (issue, index) =>
      issues.findIndex((other) => other.message === issue.message) === index,
  );
};
