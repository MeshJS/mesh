import type {
  CredTypePrototype,
  TransactionInputPrototype,
  VoterPrototype,
} from "@meshsdk/common";
import { Address, CredentialType } from "@meshsdk/core-cst";

import { givenShape } from "./parts/shape";

/*
 * The orders the ledger keeps a transaction's sets and maps in. A redeemer points at the item it
 * witnesses by its position in that order, so these decide redeemer indices.
 *
 * The ledger orders by its own types, not by the bytes of their encoding. Where the two differ
 * it says so below: a credential sorts scripts before keys, although the key form is encoded
 * with the smaller tag.
 */

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Inputs: by transaction id, then by output index */
export const compareInputs = (
  a: Readonly<TransactionInputPrototype>,
  b: Readonly<TransactionInputPrototype>,
) => compareStrings(a.transaction_id, b.transaction_id) || a.index - b.index;

/** Policy ids and other hashes of one length, in lowercase hex: by their bytes */
export const compareHashes = compareStrings;

/** Credentials: script hashes before key hashes, then by hash */
export const compareCredentials = (
  a: Readonly<CredTypePrototype>,
  b: Readonly<CredTypePrototype>,
) =>
  (a.type === b.type ? 0 : a.type === "SCRIPT" ? -1 : 1) ||
  compareStrings(a.value, b.value);

const rewardAccountKey = (rewardAddress: string) => {
  const address = Address.fromString(rewardAddress);
  const credential = address?.asReward()?.getPaymentCredential();
  if (!address || !credential)
    throw new Error(`invalid reward address: got ${givenShape(rewardAddress)}`);
  return {
    networkId: address.getNetworkId(),
    credential: {
      type:
        credential.type === CredentialType.ScriptHash
          ? ("SCRIPT" as const)
          : ("KEY" as const),
      value: credential.hash.toString(),
    },
  };
};

/** Reward accounts, in bech32: by network (testnet first), then by stake credential */
export const compareRewardAddresses = (a: string, b: string) => {
  const keyA = rewardAccountKey(a);
  const keyB = rewardAccountKey(b);
  return (
    keyA.networkId - keyB.networkId ||
    compareCredentials(keyA.credential, keyB.credential)
  );
};

const VOTER_RANK: Record<VoterPrototype["type"], number> = {
  CONSTITUTIONAL_COMMITTEE_HOT_CRED: 0,
  DREP: 1,
  STAKING_POOL: 2,
};

/** Voters: committee members, then DReps (each by credential), then stake pools by key hash */
export const compareVoters = (
  a: Readonly<VoterPrototype>,
  b: Readonly<VoterPrototype>,
) => {
  if (a.type !== b.type) return VOTER_RANK[a.type] - VOTER_RANK[b.type];
  if (a.type === "STAKING_POOL")
    return compareStrings(a.value, b.value as string);
  return compareCredentials(a.value, b.value as CredTypePrototype);
};

export const voterKey = (voter: Readonly<VoterPrototype>) =>
  voter.type === "STAKING_POOL"
    ? `pool:${voter.value}`
    : `${voter.type}:${voter.value.type}:${voter.value.value}`;
