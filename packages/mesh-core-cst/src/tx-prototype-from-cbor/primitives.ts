import { Serialization } from "@cardano-sdk/core";

import type {
  AnchorPrototype,
  CredTypePrototype,
  DRepPrototype,
  NetworkIdPrototype,
  UnitIntervalPrototype,
} from "@meshsdk/common";

import { CredentialType } from "../types";

/** `Cardano.Credential` is `{ type: CredentialType, hash }` — the prototype's raw-hash form. */
export const credentialToPrototype = (cred: {
  type: CredentialType;
  hash: string;
}): CredTypePrototype =>
  cred.type === CredentialType.ScriptHash
    ? { type: "SCRIPT", value: cred.hash.toString() }
    : { type: "KEY", value: cred.hash.toString() };

export const anchorToPrototype = (anchor: {
  url: string;
  dataHash: string;
}): AnchorPrototype => ({
  anchor_url: anchor.url,
  anchor_data_hash: anchor.dataHash.toString(),
});

export const networkIdToPrototype = (networkId: number): NetworkIdPrototype =>
  networkId === 1 ? { type: "MAINNET" } : { type: "TESTNET" };

/**
 * `Cardano.DelegateRepresentative` is `Credential | AlwaysAbstain | AlwaysNoConfidence`; the
 * always-* arms are objects with boolean marker fields rather than a discriminant, so they are
 * detected by property presence.
 */
export const dRepToPrototype = (drep: unknown): DRepPrototype => {
  const d = drep as {
    __typename?: string;
    type?: CredentialType;
    hash?: string;
  };
  if (d.hash !== undefined && d.type !== undefined) {
    return d.type === CredentialType.ScriptHash
      ? { type: "SCRIPT_HASH", value: d.hash.toString() }
      : { type: "KEY_HASH", value: d.hash.toString() };
  }
  if (d.__typename === "AlwaysAbstain") return { type: "ALWAYS_ABSTAIN" };
  if (d.__typename === "AlwaysNoConfidence") return { type: "ALWAYS_NO_CONFIDENCE" };
  throw new Error(`Unrecognised DRep shape: ${JSON.stringify(drep)}`);
};

/** CST models unit intervals as `Cardano.Fraction` (`{ numerator, denominator }` numbers) in
 * core form, but the prototype carries them as decimal strings. */
export const fractionToPrototype = (f: {
  numerator: number | bigint;
  denominator: number | bigint;
}): UnitIntervalPrototype => ({
  numerator: f.numerator.toString(),
  denominator: f.denominator.toString(),
});

export const unitIntervalToPrototype = (
  interval: Serialization.UnitInterval,
): UnitIntervalPrototype => ({
  numerator: interval.numerator().toString(),
  denominator: interval.denominator().toString(),
});
