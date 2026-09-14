import { Serialization } from "@cardano-sdk/core";
import base32 from "base32-encoding";
import { bech32 } from "bech32";

import type {
  AnchorPrototype,
  CredTypePrototype,
  DRepPrototype,
  NetworkIdPrototype,
} from "@meshsdk/common";

import { Hash32ByteBase16 } from "../types";
import { keyHashToRewardAddress, scriptHashToRewardAddress } from "../utils";

/**
 * Mesh's own `Credential` name is ambiguous at the `@meshsdk/common` package boundary (both
 * `types/transaction-builder/credential.ts` and `data/json/credentials.ts` export a type with
 * this name, with different shapes) — `../utils/proposal.ts`'s own `toCardanoCommittee` sidesteps
 * this the same way, with its own local `MeshCredential` type rather than importing `Credential`.
 */
export type MeshCredential =
  | { type: "ScriptHash"; scriptHash: string }
  | { type: "KeyHash"; keyHash: string };

/** Cardano's numeric network id convention: mainnet = 1, every testnet = 0. */
export const networkIdToNumber = (
  networkId: NetworkIdPrototype | null | undefined,
): 0 | 1 => (networkId?.type === "MAINNET" ? 1 : 0);

export const anchorPrototypeToCardano = (
  anchor: AnchorPrototype,
): Serialization.Anchor =>
  new Serialization.Anchor(
    anchor.anchor_url,
    Hash32ByteBase16(anchor.anchor_data_hash),
  );

/**
 * `IMeshTxSerializer`'s certificate/committee helpers (`toCardanoCert`) take a bech32 address
 * string and re-derive the raw credential from it — so a raw `CredTypePrototype` credential has
 * to be round-tripped through a reward address to reuse them. `RewardAddress.fromCredentials`
 * accepts either credential type directly; which existing helper this calls only matters for
 * readability.
 */
export const credentialPrototypeToRewardAddressBech32 = (
  cred: CredTypePrototype,
  networkId: 0 | 1,
): string =>
  cred.type === "SCRIPT"
    ? scriptHashToRewardAddress(cred.value, networkId)
    : keyHashToRewardAddress(cred.value, networkId);

export const credentialPrototypeToMeshCredential = (
  cred: CredTypePrototype,
): MeshCredential =>
  cred.type === "SCRIPT"
    ? { type: "ScriptHash", scriptHash: cred.value }
    : { type: "KeyHash", keyHash: cred.value };

/** CIP-105 DRep id, e.g. "drep1..." (key) / "drep_script1..." (script) — see below. */
export const credentialPrototypeToDRepIdBech32 = (cred: CredTypePrototype): string =>
  bech32.encode(
    cred.type === "SCRIPT" ? "drep_script" : "drep",
    base32.encode(Buffer.from(cred.value, "hex")),
  );

/**
 * `Serialization.DRep` has direct `newKeyHash`/`newScriptHash`/`newAlwaysAbstain`/
 * `newAlwaysNoConfidence` constructors, but the certificate helpers this converter reuses
 * (`toCardanoCert`) only accept Mesh's own `DRep` union, which for a key/script hash requires a
 * CIP-105 bech32 "drep..."/"drep_script..." id string that it immediately decodes back into the
 * same raw hash. Re-encoding here (rather than duplicating `toCardanoCert`'s per-variant
 * certificate construction just to avoid it) keeps every certificate variant going through the
 * one, already-correct conversion path.
 */
export const dRepPrototypeToMeshDRep = (
  drep: DRepPrototype,
): { dRepId: string } | { alwaysAbstain: null } | { alwaysNoConfidence: null } => {
  switch (drep.type) {
    case "ALWAYS_ABSTAIN":
      return { alwaysAbstain: null };
    case "ALWAYS_NO_CONFIDENCE":
      return { alwaysNoConfidence: null };
    case "KEY_HASH":
    case "SCRIPT_HASH":
      return {
        dRepId: credentialPrototypeToDRepIdBech32({
          type: drep.type === "KEY_HASH" ? "KEY" : "SCRIPT",
          value: drep.value,
        }),
      };
  }
};
