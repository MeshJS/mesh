import { DeserializedAddress } from "@meshsdk/common";

import { core } from "../core";

/**
 * Deserialize bech32 address into payment and staking parts, with visibility of whether they are script or key hash
 * @param bech32 The bech32 address
 * @returns The deserialized address object:
 *
 * ```ts
 * const { pubKeyHash, scriptHash, stakeCredentialHash, stakeScriptCredentialHash } = deserializeAddress(bech32Address);
 * ```
 */
export const deserializeAddress = (bech32: string): DeserializedAddress =>
  core.deserializeBech32Address(bech32);

/**
 * Deserialize a datum from a CBOR string to JSON object
 * @param datumCbor The CBOR string
 * @returns The deserialized JSON object
 */
export const deserializeDatum = <T = any>(datumCbor: string): T =>
  core.parseDatumCbor(datumCbor);
