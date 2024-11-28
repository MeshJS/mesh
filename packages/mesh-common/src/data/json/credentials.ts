import { pubKeyHash, PubKeyHash, scriptHash, ScriptHash } from "./aliases";
import { conStr0, ConStr0, conStr1, ConStr1 } from "./constructors";

/**
 * The Plutus Data staking credential in JSON
 */
export type MaybeStakingHash =
  | ConStr1<[]>
  | ConStr0<[ConStr0<[ConStr0<[PubKeyHash]>]>]>
  | ConStr0<[ConStr0<[ConStr1<[ScriptHash]>]>]>;

/**
 * The Plutus Data public key address in JSON
 */
export type PubKeyAddress = ConStr0<[ConStr0<[PubKeyHash]>, MaybeStakingHash]>;

/**
 * The Plutus Data script address in JSON
 */
export type ScriptAddress = ConStr0<[ConStr1<[ScriptHash]>, MaybeStakingHash]>;

/**
 * The utility function to create a Plutus Data staking hash in JSON
 * @param stakeCredential The staking credential in hex
 * @param isStakeScriptCredential The flag to indicate if the credential is a script credential
 * @returns The Plutus Data staking hash object
 */
export const maybeStakingHash = (
  stakeCredential: string,
  isStakeScriptCredential = false,
): MaybeStakingHash => {
  if (stakeCredential === "") {
    return conStr1<[]>([]);
  }
  if (isStakeScriptCredential) {
    return conStr0([
      conStr0([conStr1([scriptHash(stakeCredential)])]),
    ]) as ConStr0<[ConStr0<[ConStr1<[ScriptHash]>]>]>;
  }
  return conStr0([
    conStr0([conStr0([pubKeyHash(stakeCredential)])]),
  ]) as ConStr0<[ConStr0<[ConStr0<[PubKeyHash]>]>]>;
};

/**
 * The utility function to create a Plutus Data public key address in JSON
 * @param bytes The public key hash in hex
 * @param stakeCredential The staking credential in hex
 * @param isStakeScriptCredential The flag to indicate if the credential is a script credential
 * @returns The Plutus Data public key address object
 */
export const pubKeyAddress = (
  bytes: string,
  stakeCredential?: string,
  isStakeScriptCredential = false,
): PubKeyAddress =>
  conStr0([
    conStr0([pubKeyHash(bytes)]),
    maybeStakingHash(stakeCredential || "", isStakeScriptCredential),
  ]);

/**
 * The utility function to create a Plutus Data script address in JSON
 * @param bytes The validator hash in hex
 * @param stakeCredential The staking credential in hex
 * @param isStakeScriptCredential The flag to indicate if the stake credential is a script credential
 * @returns The Plutus Data script address object
 */
export const scriptAddress = (
  bytes: string,
  stakeCredential?: string,
  isStakeScriptCredential = false,
): ScriptAddress =>
  conStr0([
    conStr1([scriptHash(bytes)]),
    maybeStakingHash(stakeCredential || "", isStakeScriptCredential),
  ]);
